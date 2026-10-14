// THE LOG IS THE TRUTH; THE UNIT RECORDS MUST AGREE WITH IT (red team R6 coherence, G3; operator rule D46).
// A logged act that promises a state of a unit's record — a version carry, the instructor's confirmation, a blind
// re-verification, a retirement, added judgment kinds, the units a version carries — is checked against the records at
// the gate. A record that does not hold what the log says is a blocking defect naming the gap ("the log carried 84
// units; the records hold 0"): the gate reads obligations from the records, so a gap the other way would pass
// unseen (R6 G3: a refused carry write, then the restore from git the refusal advised, left version 2 open with
// nothing carried). The records are read from EVERY sidecar on disk, live units and the retired-unit registers alike —
// a record left at a path no longer listed is still a record (R6 G1).
//
// The writers carry out an act in one step (unit_records.mjs writeUnitRecords: check as if logged → log → write), so a
// gap arises only when a write dies between the two. `reconcileUnitRecords` (units.mjs reconcile, run at every session
// begin) completes what it can, and only as the act's own evidence still allows: a carry is re-applied; a confirmation
// only at the text (and dependencies) the instructor confirmed; a re-verification only while its counted blind review
// still counts. What it cannot complete stays a defect, with the route that clears it.
import { canonicalJson } from "../records/canonical.mjs";
import { makeFinding } from "../records/findings.mjs";
import { parseLog, readLogText, verifyLog } from "../records/log.mjs";
import { allSidecars } from "./unit_records.mjs";
// a cycle (obligations.mjs reads the ledger): both sides only call each other at run time
import { carryUnits, completeLoggedAct, unitInScope } from "./obligations.mjs";
import { carryLateEntrants } from "./version_scope.mjs";

// ---- the log's acts on unit records, per unit -----------------------------------------------------------------------
const isVersion = (r) => r.type === "version" && r.party?.role === "instructor" && Array.isArray(r.payload?.scopes);
/** A logged carry: the instructor's, or the harness completing a logged version's own carry list (reconcile). */
function carryAct(r, versions) {
  if (r.type !== "revision" || r.payload?.event !== "units-carried" || !Array.isArray(r.payload.units)) return false;
  if (r.party?.role === "instructor") return true;
  if (r.party?.role !== "harness" || !Number.isInteger(r.payload.reconciles)) return false;
  const v = versions.get(r.payload.reconciles);
  // (a unit that entered the version's scope after it opened is carried by the harness too — version_scope.mjs, R7
  // H-01: a carry only adds an obligation, so the units it names need not be the version's own list)
  return !!v && r.seq > v.seq && v.payload.scopes.includes(r.payload.scope) && v.payload.to?.[r.payload.scope] === r.payload.version &&
    (r.payload.entered === true || r.payload.units.every((id) => (v.payload.carried || []).includes(id)));
}
const confirmAct = (r) => r.type === "confirmation" && r.party?.role === "instructor" && ["fact", "still-correct"].includes(r.payload?.what) &&
  Array.isArray(r.payload.units) && !!String(r.payload.instructorWords || "").trim();
const reverifyAct = (r) => r.type === "revision" && r.payload?.event === "units-reverified" && r.party?.role === "agent" && Array.isArray(r.payload.units);

const ledgers = new WeakMap();
/**
 * unit id → { carry, clear, fact }: the latest logged carry of the unit, the latest act that cleared what it owed (a
 * confirmation or a re-verification), and the latest confirmation of its facts. Log records in seq order.
 */
export function unitActLedger(recs) {
  if (ledgers.has(recs)) return ledgers.get(recs);
  const m = new Map(), at = (id) => { if (!m.has(id)) m.set(id, {}); return m.get(id); };
  const versions = new Map(recs.filter(isVersion).map((r) => [r.seq, r]));
  for (const r of recs) {
    if (carryAct(r, versions)) for (const id of r.payload.units) at(id).carry = r;
    else if (confirmAct(r)) for (const id of r.payload.units) { const e = at(id); e.clear = r; if (r.payload.what === "fact") e.fact = r; }
    else if (reverifyAct(r)) for (const id of r.payload.units) at(id).clear = r;
  }
  ledgers.set(recs, m);
  return m;
}
/** The carry the log says the unit is under now (its latest carry, cleared by no later act), or null. */
export function pendingCarry(recs, id) {
  const e = unitActLedger(recs).get(id);
  return e?.carry && !(e.clear && e.clear.seq > e.carry.seq) ? e.carry : null;
}
/** The act the log says last cleared what the unit owed, when no carry came after it, or null. */
export function pendingClear(recs, id) {
  const e = unitActLedger(recs).get(id);
  return e?.clear && !(e.carry && e.carry.seq > e.clear.seq) ? e.clear : null;
}
const sameCarry = (carried, act) => !!carried && canonicalJson({ scope: carried.scope, version: carried.version }) === canonicalJson({ scope: act.payload.scope, version: act.payload.version });

// ---- the records, from every sidecar on disk --------------------------------------------------------------------------
/** unit id → { rec, rel, live }: every record on disk — a live unit first, else its retired-register entry. */
export function recordsOnDisk(sides) {
  const m = new Map();
  for (const [rel, side] of Object.entries(sides)) for (const u of side.units || []) if (u?.id) m.set(u.id, { rec: u, rel, live: true });
  for (const [rel, side] of Object.entries(sides)) for (const e of side.retired || []) if (e?.id && !m.has(e.id)) m.set(e.id, { rec: e, rel, live: false });
  return m;
}

/** Why a record does not hold what the log says of it: null, or the gap (for one unit). */
// (an act logged with `recordsFollow` — every act since R6 — is written at once: a record whose sidecar no write
// touched after the act never received it, whatever else it holds; e.g. a stale stamp a confirmation would have renewed)
function gapOf(recs, id, found, lastWrite) {
  const carry = pendingCarry(recs, id), clear = pendingClear(recs, id), e = unitActLedger(recs).get(id) || {};
  const rec = found?.rec, unwritten = (act) => act.payload?.recordsFollow === true && (lastWrite.get(found.rel) ?? 0) < act.seq;
  if (carry && !sameCarry(rec?.carried, carry)) return { act: carry, gap: rec ? "carry" : "carry-lost" };
  if (clear && rec && (rec.carried || (rec.owes && (rec.owes.since ?? 0) < clear.seq) || unwritten(clear))) return { act: clear, gap: "clear" };
  const fh = e.fact?.payload?.factHashes?.[id];
  if (fh && rec && !(e.carry && e.carry.seq > e.fact.seq) && !(rec.evidence || []).some((x) => x.type === "instructor-confirmation" && x.factHash === fh)) return { act: e.fact, gap: "confirmation" };
  return null;
}

/**
 * Every disagreement between the log and the unit records: [{ act, gap, units }], one entry per logged act.
 * gap: carry (a record without its logged carry), carry-lost (no record at all), clear (a logged confirmation or
 * re-verification the record does not show), confirmation (a confirmed fact with no confirmation in the record),
 * version (a version's carry list with no logged carry), retired (a logged retirement no record keeps), judgment.
 */
export function logRecordGaps(root, { recs = null, sides = null } = {}) {
  if (!recs) { const t = readLogText(root); if (verifyLog(t).length) return []; recs = parseLog(t); }
  sides ??= allSidecars(root);
  const byId = recordsOnDisk(sides), groups = new Map();
  const add = (act, gap, id) => { const k = `${act.seq}|${gap}`; if (!groups.has(k)) groups.set(k, { act, gap, units: [] }); const g = groups.get(k); if (!g.units.includes(id)) g.units.push(id); };
  const lastWrite = new Map();
  for (const r of recs) if (r.type === "revision" && r.payload?.event === "unit-records") for (const rel of Object.keys(r.payload.digests || {})) lastWrite.set(rel, r.seq);
  const named = new Set([...unitActLedger(recs).keys()]);
  for (const id of named) { const g = gapOf(recs, id, byId.get(id), lastWrite); if (g) add(g.act, g.gap, id); }
  const versions = new Map(recs.filter(isVersion).map((r) => [r.seq, r]));
  const carries = recs.filter((r) => carryAct(r, versions));
  for (const v of versions.values()) for (const id of v.payload.carried || [])
    if (!carries.some((c) => c.seq > v.seq && v.payload.scopes.includes(c.payload.scope) && v.payload.to?.[c.payload.scope] === c.payload.version && c.payload.units.includes(id))) add(v, "version", id);
  for (const r of recs) {
    // (a retirement logged before R6 does not say its records were kept: harnesses before R2 kept no register, so
    // only a retirement logged with `register: true` is held to it)
    if (r.type === "unit-retirement" && r.payload?.register === true) for (const id of r.payload.units || []) if (!byId.has(id)) add(r, "retired", id);
    if (r.type === "revision" && r.payload?.event === "judgment-added" && r.payload.units && typeof r.payload.units === "object")
      for (const [id, kinds] of Object.entries(r.payload.units)) {
        const f = byId.get(id);
        if (f?.live && (kinds || []).some((k) => !(f.rec.judgmentAdded || []).includes(k) && !(f.rec.judgment || []).includes(k))) add(r, "judgment", id);
      }
  }
  return [...groups.values()].sort((a, b) => a.act.seq - b.act.seq);
}

function describe(g, byId) {
  const p = g.act.payload || {}, n = g.units.length, list = g.units.slice(0, 6).join(", ") + (n > 6 ? ", …" : "");
  switch (g.gap) {
    case "carry": case "carry-lost": {
      const all = p.units.length, held = p.units.filter((id) => sameCarry(byId.get(id)?.rec?.carried, g.act)).length;
      return `the log carried ${all} unit(s) of ${p.scope} into version ${p.version} (log #${g.act.seq}); the records hold ${held} of those carries — ${n} missing (${list})${g.gap === "carry-lost" ? "; no record of them is left at all" : ""}`;
    }
    case "version": return `the log opened version ${Object.entries(p.to || {}).map(([s, v]) => `${v} of ${s}`).join(", ")} carrying ${(p.carried || []).length} unit(s) (log #${g.act.seq}); no carry of ${n} of them is logged (${list})`;
    case "clear": return `the log ${g.act.type === "confirmation" ? "records the instructor's confirmation of" : "re-verified"} ${n} unit(s) (log #${g.act.seq}) whose records still owe it (${list})`;
    case "confirmation": return `the instructor confirmed the facts of ${n} unit(s) (log #${g.act.seq}); their records hold no such confirmation (${list})`;
    case "retired": return `the log retired ${n} unit(s) (log #${g.act.seq}); no record — live or in a retired-unit register — keeps what they owed (${list})`;
    case "judgment": return `the log added judgment kinds to ${n} unit(s) (log #${g.act.seq}); their records do not hold them (${list})`;
    default: return `${g.gap}: ${list}`;
  }
}

/** Gate check: every disagreement between the log and the unit records, a blocking defect naming the gap. */
export function logRecordFindings(root, basis) {
  const sides = allSidecars(root), byId = recordsOnDisk(sides);
  return logRecordGaps(root, { sides }).map((g) => makeFinding({ module: "skeleton", kind: "unit-record-behind-log", units: [...g.units].sort(), statusClass: "defect", route: "agent", basis,
    evidence: { type: "rule", rule: "a unit record holds what every logged act on it says (the log is the truth)", seq: g.act.seq, gap: g.gap,
      detail: `${describe(g, byId)} — run node scripts/units.mjs reconcile to complete the logged act${["clear", "confirmation"].includes(g.gap) ? " (where its evidence no longer holds: a new blind re-check and units.mjs reverify, or the instructor's confirmation again)" : g.gap === "retired" || g.gap === "carry-lost" ? " (a record that is gone cannot be rebuilt: restore it from git)" : ""}` } }));
}

/**
 * Complete what the log says and the records do not hold, as far as each act's own evidence still allows (see the
 * header). Every write goes through writeUnitRecords, so it is checked as any other. Returns { applied, remaining }.
 */
export function reconcileUnitRecords(root, reader) {
  const t = readLogText(root);
  if (verifyLog(t).length) throw new Error("the decision log does not verify: restore it before reconciling");
  let recs = parseLog(t);
  const applied = [];
  // 1. a version's carry list with no logged carry: the harness logs the carry the version decided
  for (const g of logRecordGaps(root, { recs }).filter((x) => x.gap === "version")) {
    const v = g.act;
    for (const sc of v.payload.scopes) {
      const live = new Set(Object.values(allSidecars(root)).flatMap((s) => (s.units || []).map((u) => u.id)));
      const ids = g.units.filter((id) => live.has(id) && ownsScope(root, reader, sc, id));
      if (!ids.length) continue;
      writeCarry(root, ids, { scope: sc, version: v.payload.to[sc], reconciles: v.seq });
      applied.push({ gap: "version", seq: v.seq, units: ids });
    }
    recs = parseLog(readLogText(root));
  }
  // 2. carries, confirmations and re-verifications the records do not hold
  for (const g of logRecordGaps(root, { recs }).filter((x) => ["carry", "clear", "confirmation"].includes(x.gap))) {
    const done = applyGap(root, reader, g, recs);
    if (done.length) applied.push({ gap: g.gap, seq: g.act.seq, units: done });
  }
  // 3. a unit that entered an open version's scope since it opened (a hand edit of DOCUMENTS.json, …) is carried (R7 H-01)
  for (const c of carryLateEntrants(root, reader)) applied.push({ gap: "entered", scope: c.scope, version: c.version, units: c.units });
  return { applied, remaining: logRecordGaps(root) };
}

function ownsScope(root, reader, scope, id) { return unitInScope(root, reader, scope, id); }
function writeCarry(root, ids, { scope, version, reconciles }) {
  return carryUnits(root, ids, { version, scope, reconciles }, { role: "harness", name: "reconcile" });
}
const applyGap = (root, reader, g, recs) => completeLoggedAct(root, reader, g, recs);
