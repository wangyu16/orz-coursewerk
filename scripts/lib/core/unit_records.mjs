// The unit sidecars are records the harness writes (private/coursewerk/units/**.json): stamps, owed re-verifications, carried
// flags, roles, links, origins, evidence, locators and the retired-unit register. A hand edit of one could silence an
// obligation (red team R1 coherence, F6: deleting a stale answer's `stamp` key removed its re-verification). So every
// harness write logs a digest of each sidecar it changed, and a sidecar that differs from its last logged digest is a
// blocking defect — and the harness refuses to write over it (a re-index would otherwise launder the edit into a fresh
// digest).
// The digest binds the WHOLE sidecar (red team R2 coherence, F8: a digest that left out `locator` let a practice
// answer be relabelled as a study-guide unit). Digests logged before R2 bound only some fields ("legacy"); a sidecar
// they cover counts as unaltered only if those fields match AND nothing the legacy digest left unbound was touched in a
// way the gate reads (every locator names the sidecar's own deliverable; no retired-unit register, which legacy
// harnesses never wrote). The next harness write — or `upgradeUnitRecordDigests`, run at every session begin — logs the
// full digest.
// Logging is never a way to bless an edit (R2 coherence, F10): `logUnitRecords` refuses while any sidecar it would log
// differs from its last logged digest. The harness writes records only through `writeUnitRecords`, which checks, writes
// and logs in one step. A package whose sidecars were never logged (written before this rule) has nothing to compare
// against: its first harness write logs the digests, and from then on they hold.
import fs from "node:fs";
import path from "node:path";
import { canonicalJson, sha256 } from "../records/canonical.mjs";
import { appendLogRecord, parseLog, readLogText, verifyLog } from "../records/log.mjs";
import { recordFile, unitsPathFor } from "../records/paths.mjs";
import { makeFinding } from "../records/findings.mjs";
import { migrateRecordSides, unitRecordWriteProblems } from "./obligations.mjs";

const DIR = "private/coursewerk/units";
export const UNIT_RECORDS_EVENT = "unit-records";

/** What the digest binds: the whole sidecar (every field an obligation, a question or the gate reads). */
export function sidecarDigest(side) {
  if (!side) return "absent";
  return `v2:${sha256(canonicalJson(side))}`;
}
/** The pre-R2 digest (id, contentHash, role, links, origin, evidence, stamp, carried, owes), for logs written then. */
export function legacySidecarDigest(side) {
  if (!side) return "absent";
  return sha256(canonicalJson((side.units || []).map((u) => ({
    id: u.id, contentHash: u.locator?.contentHash ?? null, role: u.role ?? null, spineNodes: u.spineNodes ?? null, origin: u.origin ?? null,
    evidence: u.evidence ?? [], stamp: u.stamp ?? null, carried: u.carried ?? null, owes: u.owes ?? null,
  }))));
}
/** Does a sidecar on disk match a logged digest (full, or legacy with nothing it left unbound changed)? */
function matchesLogged(side, rel, logged) {
  if (logged === "absent") return !side;
  if (!side) return false;
  if (String(logged).startsWith("v2:")) return sidecarDigest(side) === logged;
  return legacySidecarDigest(side) === logged && side.retired === undefined && (side.units || []).every((u) => u.locator?.deliverable === rel);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f, out); else if (e.name.endsWith(".json")) out.push(f); }
  return out;
}
/** deliverable → its sidecar as it is on disk now (null: unparseable). */
function currentSidecars(root) {
  const out = {};
  for (const f of walk(recordFile(root, DIR))) {
    const rel = deliverableOfSidecar(root, f);
    let side = null; try { side = JSON.parse(fs.readFileSync(f, "utf8")); } catch { side = { units: [{ id: "unparseable" }] }; }
    out[rel] = side;
  }
  return out;
}
// ONLY WHAT THE LOG WROTE IS TRUSTED (red team R7, H-04). In a package whose log holds unit-record digests, a sidecar
// on disk with no logged digest (or one the log says the harness removed) was never written by the harness: a planted
// file. It is a blocking defect (unit-record-altered), and it is never read — not into matching, reserved ids, the
// retired-unit registers, ancestry or obligations (allSidecars and units_index.mjs readSidecar read only trusted
// sidecars; the gate's modules filter their snapshot with trustedSidecarPath) — never written over and never deleted by
// the harness (assertUnaltered refuses; the index leaves an untrusted orphan where it is). A package whose log holds no
// digest at all was written before the rule: everything on disk is its starting state, and the first harness write (or
// the session begin) logs the digest of EVERY sidecar on disk (logDigests), so from then on the rule holds.
const trustOf = (logged) => {
  const governed = Object.keys(logged).length > 0;
  return (rel) => !governed || (rel in logged && logged[rel] !== "absent");
};
/** Is a sidecar (by its deliverable) one the log wrote? A pure reading of the log text (the gate's snapshot uses it). */
export function sidecarTrust(logText) { return trustOf(loggedDigests(null, logText)); }
/** A snapshot path filter: private/coursewerk/units/<deliverable>.json is read only if the log wrote it (other paths pass). */
export function trustedSidecarPath(logText) {
  const trusted = sidecarTrust(logText), pre = `${DIR}/`;
  return (p) => !(p.startsWith(pre) && p.endsWith(".json")) || trusted(p.slice(pre.length).replace(/\.json$/, ""));
}
// memo of the trust predicate, keyed on the log file's size and mtime (readers ask per deliverable)
let trustMemo = { key: null, fn: null };
function trustedHere(root) {
  let key = null;
  try { const st = fs.statSync(recordFile(root, "private/coursewerk/LOG.jsonl")); key = `${root}|${st.size}|${st.mtimeMs}|${st.ino}`; } catch { key = `${root}|none`; }
  if (trustMemo.key !== key) trustMemo = { key, fn: trustOf(loggedDigests(root)) };
  return trustMemo.fn;
}
/** Is the sidecar of this deliverable one the log wrote (or is the package pre-rule)? */
export function sidecarTrusted(root, rel) { return trustedHere(root)(rel); }
/** Sidecars on disk the log never wrote (a governed package only): deliverables, sorted. */
export function unloggedSidecars(root) {
  const logged = loggedDigests(root);
  if (!Object.keys(logged).length) return [];
  return Object.keys(currentSidecars(root)).filter((rel) => !(rel in logged)).sort();
}
/** deliverable → digest of its sidecar as it is on disk now. */
export function currentDigests(root) {
  return Object.fromEntries(Object.entries(currentSidecars(root)).map(([rel, side]) => [rel, sidecarDigest(side)]));
}
/** deliverable → the digest last logged for it (only from a verifying log). */
export function loggedDigests(root, logText = readLogText(root)) {
  const out = {};
  if (verifyLog(logText).length) return out;
  for (const r of parseLog(logText)) if (r.type === "revision" && r.payload?.event === UNIT_RECORDS_EVENT) Object.assign(out, r.payload.digests || {});
  return out;
}
/** Sidecars that differ from their last logged digest (a hand edit, a deletion, or an unlogged write). */
export function alteredSidecars(root) {
  const logged = loggedDigests(root), now = currentSidecars(root);
  // …and a sidecar the log never wrote (R7 H-04: unloggedSidecars)
  return [...new Set([...Object.keys(logged).filter((rel) => !matchesLogged(now[rel] ?? null, rel, logged[rel])), ...unloggedSidecars(root)])].sort();
}
/** Refuse to write over a sidecar that was changed outside the harness. */
export function assertUnaltered(root, rels = null) {
  const unlogged = new Set(unloggedSidecars(root));
  const bad = alteredSidecars(root).filter((r) => !unlogged.has(r) && (!rels || rels.includes(r)));
  if (bad.length) throw new Error(`refusing to write unit records: ${bad.join(", ")} changed outside the harness since its last logged digest — restore it from git (git checkout -- private/coursewerk/units/…); the harness never writes over an edited record`);
  // a sidecar the log never wrote is never written over (nor deleted) by the harness (R7 H-04)
  const planted = [...unlogged].filter((r) => !rels || rels.includes(r));
  if (planted.length) throw new Error(`refusing to write unit records: private/coursewerk/units/${planted.join(".json, private/coursewerk/units/")}.json ${planted.length === 1 ? "was" : "were"} never written by the harness (no logged digest) — remove ${planted.length === 1 ? "it" : "them"} (git rm, or git checkout the records the harness wrote); the harness never writes over a record it did not write`);
}
/** The deliverable a sidecar file records (private/coursewerk/units/practice/x.md.json → practice/x.md). */
export const deliverableOfSidecar = (root, file) => path.relative(recordFile(root, DIR), file).split(path.sep).join("/").replace(/\.json$/, "");
// log the digests of these sidecars where they changed (no check: callers have checked before writing)
// (a sidecar the write removed — an orphan whose every unit moved to its document's new path — is logged "absent")
// (a package whose log holds no digest yet — written before the rule — logs EVERY sidecar on disk at its first write, so
// no sidecar is left without a logged digest to be read as planted, nor a planted one later blessed: R7 H-04 migration)
function logDigests(root, rels, party) {
  const logged = loggedDigests(root), now = currentDigests(root), want = new Set(rels), named = new Set(rels);
  if (!Object.keys(logged).length) for (const rel of Object.keys(now)) want.add(rel);
  // (a removal this write made is logged even where the sidecar was never logged: every record removal is logged)
  const changed = Object.fromEntries([...want].map((rel) => [rel, now[rel] ?? "absent"]).filter(([rel, d]) => logged[rel] !== d && !(d === "absent" && !(rel in logged) && !named.has(rel))));
  if (!Object.keys(changed).length) return null;
  return appendLogRecord(root, { type: "revision", party, payload: { event: UNIT_RECORDS_EVENT, digests: changed } });
}
/**
 * Log the digest of sidecars (`rels`: their deliverables). It refuses while any of them differs from its last logged
 * digest (R2 coherence, F10: logging over a hand edit made the edit the logged truth), so all it can do is log a
 * sidecar never logged before, or upgrade a legacy digest to the full one. Harness writes go through writeUnitRecords.
 */
export function logUnitRecords(root, rels, party = { role: "harness", name: "unit records" }) {
  assertUnaltered(root, rels);
  return logDigests(root, rels, party);
}
/**
 * The one way the harness writes unit records: refuse if any sidecar it writes was changed outside the harness, refuse
 * a write that clears an obligation without its evidence, write them (stamps migrated), and log their digests.
 * `sides`: sidecar objects ({ deliverable, units, … }), validated by the caller; a side `{ deliverable, remove: true }`
 * removes that sidecar (an orphan whose every record moved with its text: units_index.mjs).
 * Red team R4 coherence F7: this function is exported and its content is the caller's, so it trusts none of it: a write
 * that drops a unit's `owes` or carry, or refreshes a stale stamp, needs the same evidence `reverify` and `confirm`
 * need — a counted blind re-check, or the instructor's logged confirmation (obligations.mjs unitRecordWriteProblems).
 *
 * THE LOG IS THE TRUTH; THE RECORDS AGREE WITH IT (red team R6 coherence, G3). `act` is the log record of the act this
 * write carries out (a version carry, a confirmation, a re-verification, an authorship claim, added judgment kinds). It
 * is checked first — the write is judged as if the act were logged — and nothing is logged when the write is refused;
 * then the act is logged, then the records written, in one step. A write that dies between the two leaves the log ahead
 * of the records: the gate names the gap (reconcile.mjs logRecordFindings) and `units.mjs reconcile` (run at every
 * session begin) completes the act. Returns the act's log record (or, with no act, the digest record).
 */
export function writeUnitRecords(root, sides, party = { role: "harness", name: "unit records" }, { act = null } = {}) {
  const rels = sides.map((s) => s.deliverable);
  assertUnaltered(root, rels);
  const before = currentSidecars(root), after = { ...before };
  for (const side of sides) { if (side.remove) delete after[side.deliverable]; else after[side.deliverable] = side; }
  const problems = unitRecordWriteProblems(root, before, after, { pending: act ? [act] : [] });
  if (problems.length) throw new Error(`refusing to write unit records: ${problems.join("; ")} — an obligation clears only through its evidence: a logged blind re-check (node scripts/verify.mjs knowledge, then units.mjs reverify) or the instructor's confirmation (units.mjs confirm)`);
  // the act says its records follow it at once: a record written by no write after it never got the act (reconcile.mjs)
  const logged = act ? appendLogRecord(root, { ...act, payload: { ...act.payload, recordsFollow: true } }) : null;
  const removed = sides.filter((s) => s.remove);
  const written = migrateRecordSides(root, sides.filter((s) => !s.remove), before);
  for (const side of written) {
    const f = recordFile(root, unitsPathFor(side.deliverable));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(side, null, 2) + "\n");
  }
  for (const side of removed) fs.rmSync(recordFile(root, unitsPathFor(side.deliverable)), { force: true });
  const digests = rels.length ? logDigests(root, rels, party) : null;
  return logged || digests;
}
/** Judge a write without making it (a version checks every carry before it logs anything): the problems, or []. */
export function unitRecordWriteRefusal(root, sides, { pending = [] } = {}) {
  try { assertUnaltered(root, sides.map((s) => s.deliverable)); } catch (e) { return [e.message]; }
  const before = currentSidecars(root), after = { ...before };
  for (const side of sides) { if (side.remove) delete after[side.deliverable]; else after[side.deliverable] = side; }
  return unitRecordWriteProblems(root, before, after, { pending });
}
/** deliverable → every unit sidecar on disk (listed or not: a sidecar left behind by a rename is still a record). */
export function allSidecars(root) {
  const out = {}, trusted = trustedHere(root);
  for (const [rel, side] of Object.entries(currentSidecars(root))) if (trusted(rel) && side && Array.isArray(side.units) && !(side.units.length === 1 && side.units[0].id === "unparseable" && !side.deliverable)) out[rel] = side;
  return out;
}
/** Log the full digest for every sidecar whose last logged digest is a legacy one it still matches (R2 F8); in a package
 *  whose log holds no digest yet (written before the rule), log every sidecar on disk — its starting state (R7). */
export function upgradeUnitRecordDigests(root) {
  const logged = loggedDigests(root), now = currentSidecars(root);
  if (!Object.keys(logged).length) return Object.keys(now).length && !verifyLog(readLogText(root)).length ? logDigests(root, Object.keys(now), { role: "harness", name: "unit records" }) : null;
  const legacy = Object.keys(logged).filter((rel) => !String(logged[rel]).startsWith("v2:") && logged[rel] !== "absent" && matchesLogged(now[rel] ?? null, rel, logged[rel]));
  return legacy.length ? logDigests(root, legacy, { role: "harness", name: "unit records" }) : null;
}

/** Gate check: an altered unit record is a defect (the harness cannot vouch for what it no longer wrote). */
export function unitRecordFindings(root, basis) {
  const unlogged = new Set(unloggedSidecars(root));
  return [...alteredSidecars(root).filter((rel) => !unlogged.has(rel)).map((rel) => makeFinding({ module: "skeleton", kind: "unit-record-altered", units: [], statusClass: "defect", route: "agent", basis,
    evidence: { type: "rule", rule: "a unit record changes only through the harness (its digest is logged at every write)", file: `${DIR}/${rel}.json`,
      detail: `private/coursewerk/units/${rel}.json differs from its last logged digest: restore it from git; re-verification, links and confirmations go through units.mjs` } })),
  // a record the log never wrote (R7 H-04): untrusted, unread, and blocking until it is removed
  ...[...unlogged].map((rel) => makeFinding({ module: "skeleton", kind: "unit-record-altered", units: [], statusClass: "defect", route: "agent", basis,
    evidence: { type: "rule", rule: "only a unit record the log wrote is trusted (every harness write logs its digest)", file: `${DIR}/${rel}.json`,
      detail: `private/coursewerk/units/${rel}.json was never written by the harness (no logged digest): it is not read; remove it (git rm), or restore the records the harness wrote from git` } }))];
}
