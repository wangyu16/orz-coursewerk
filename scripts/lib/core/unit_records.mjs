// The unit sidecars are records the harness writes (metadata/units/**.json): stamps, owed re-verifications, carried
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

const DIR = "metadata/units";
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
  return Object.keys(logged).filter((rel) => !matchesLogged(now[rel] ?? null, rel, logged[rel])).sort();
}
/** Refuse to write over a sidecar that was changed outside the harness. */
export function assertUnaltered(root, rels = null) {
  const bad = alteredSidecars(root).filter((r) => !rels || rels.includes(r));
  if (bad.length) throw new Error(`refusing to write unit records: ${bad.join(", ")} changed outside the harness since its last logged digest — restore it from git (git checkout -- metadata/units/…); the harness never writes over an edited record`);
}
/** The deliverable a sidecar file records (metadata/units/practice/x.md.json → practice/x.md). */
export const deliverableOfSidecar = (root, file) => path.relative(recordFile(root, DIR), file).split(path.sep).join("/").replace(/\.json$/, "");
// log the digests of these sidecars where they changed (no check: callers have checked before writing)
// (a sidecar the write removed — an orphan whose every unit moved to its document's new path — is logged "absent")
function logDigests(root, rels, party) {
  const logged = loggedDigests(root), now = currentDigests(root), want = new Set(rels);
  const changed = Object.fromEntries([...want].map((rel) => [rel, now[rel] ?? "absent"]).filter(([rel, d]) => logged[rel] !== d && !(d === "absent" && !(rel in logged))));
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
  const out = {};
  for (const [rel, side] of Object.entries(currentSidecars(root))) if (side && Array.isArray(side.units) && !(side.units.length === 1 && side.units[0].id === "unparseable" && !side.deliverable)) out[rel] = side;
  return out;
}
/** Log the full digest for every sidecar whose last logged digest is a legacy one it still matches (R2 F8). */
export function upgradeUnitRecordDigests(root) {
  const logged = loggedDigests(root), now = currentSidecars(root);
  const legacy = Object.keys(logged).filter((rel) => !String(logged[rel]).startsWith("v2:") && logged[rel] !== "absent" && matchesLogged(now[rel] ?? null, rel, logged[rel]));
  return legacy.length ? logDigests(root, legacy, { role: "harness", name: "unit records" }) : null;
}

/** Gate check: an altered unit record is a defect (the harness cannot vouch for what it no longer wrote). */
export function unitRecordFindings(root, basis) {
  return alteredSidecars(root).map((rel) => makeFinding({ module: "skeleton", kind: "unit-record-altered", units: [], statusClass: "defect", route: "agent", basis,
    evidence: { type: "rule", rule: "a unit record changes only through the harness (its digest is logged at every write)", file: `${DIR}/${rel}.json`,
      detail: `metadata/units/${rel}.json differs from its last logged digest: restore it from git; re-verification, links and confirmations go through units.mjs` } }));
}
