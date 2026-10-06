// The unit sidecars are records the harness writes (metadata/units/**.json): stamps, owed re-verifications, carried
// flags, roles, links, origins and evidence. A hand edit of one could silence an obligation (red team R1 coherence,
// F6: deleting a stale answer's `stamp` key removed its re-verification). So every harness write logs a digest of
// each sidecar it changed, and a sidecar that differs from its last logged digest is a blocking defect — and the
// harness refuses to write over it (a re-index would otherwise launder the edit into a fresh digest).
// A package whose sidecars were never logged (written before this rule) has nothing to compare against: its first
// harness write logs the digests, and from then on they hold.
import fs from "node:fs";
import path from "node:path";
import { canonicalJson, sha256 } from "../records/canonical.mjs";
import { appendLogRecord, parseLog, readLogText, verifyLog } from "../records/log.mjs";
import { recordFile } from "../records/paths.mjs";
import { makeFinding } from "../records/findings.mjs";

const DIR = "metadata/units";
export const UNIT_RECORDS_EVENT = "unit-records";

/** What the digest binds: everything an obligation or a question reads from a unit record. */
export function sidecarDigest(side) {
  if (!side) return "absent";
  return sha256(canonicalJson((side.units || []).map((u) => ({
    id: u.id, contentHash: u.locator?.contentHash ?? null, role: u.role ?? null, spineNodes: u.spineNodes ?? null, origin: u.origin ?? null,
    evidence: u.evidence ?? [], stamp: u.stamp ?? null, carried: u.carried ?? null, owes: u.owes ?? null,
  }))));
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f, out); else if (e.name.endsWith(".json")) out.push(f); }
  return out;
}
/** deliverable → digest of its sidecar as it is on disk now. */
export function currentDigests(root) {
  const out = {};
  for (const f of walk(recordFile(root, DIR))) {
    const rel = deliverableOfSidecar(root, f);
    let side = null; try { side = JSON.parse(fs.readFileSync(f, "utf8")); } catch { side = { units: [{ id: "unparseable" }] }; }
    out[rel] = sidecarDigest(side);
  }
  return out;
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
  const logged = loggedDigests(root), now = currentDigests(root);
  return Object.keys(logged).filter((rel) => (now[rel] ?? "absent") !== logged[rel]).sort();
}
/** Refuse to write over a sidecar that was changed outside the harness. */
export function assertUnaltered(root, rels = null) {
  const bad = alteredSidecars(root).filter((r) => !rels || rels.includes(r));
  if (bad.length) throw new Error(`refusing to write unit records: ${bad.join(", ")} changed outside the harness since its last logged digest — restore it from git (git checkout -- metadata/units/…); the harness never writes over an edited record`);
}
/** The deliverable a sidecar file records (metadata/units/practice/x.md.json → practice/x.md). */
export const deliverableOfSidecar = (root, file) => path.relative(recordFile(root, DIR), file).split(path.sep).join("/").replace(/\.json$/, "");
/**
 * Log the digest of the sidecars the harness just wrote (`rels`: their deliverables), where it changed since the last
 * logged digest. Only what the harness wrote is logged — never another sidecar, so an edit elsewhere is not laundered.
 */
export function logUnitRecords(root, rels, party = { role: "harness", name: "unit records" }) {
  const logged = loggedDigests(root), now = currentDigests(root), want = new Set(rels);
  const changed = Object.fromEntries(Object.entries(now).filter(([rel, d]) => want.has(rel) && logged[rel] !== d));
  if (!Object.keys(changed).length) return null;
  return appendLogRecord(root, { type: "revision", party, payload: { event: UNIT_RECORDS_EVENT, digests: changed } });
}

/** Gate check: an altered unit record is a defect (the harness cannot vouch for what it no longer wrote). */
export function unitRecordFindings(root, basis) {
  return alteredSidecars(root).map((rel) => makeFinding({ module: "skeleton", kind: "unit-record-altered", units: [], statusClass: "defect", route: "agent", basis,
    evidence: { type: "rule", rule: "a unit record changes only through the harness (its digest is logged at every write)", file: `${DIR}/${rel}.json`,
      detail: `metadata/units/${rel}.json differs from its last logged digest: restore it from git; re-verification, links and confirmations go through units.mjs` } }));
}
