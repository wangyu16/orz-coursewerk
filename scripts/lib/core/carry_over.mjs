// Carried over from earlier Coursewerk (owner 2026-11-03; req.records.carry-over-baseline, req.gate.carried-over).
// A package developed, approved and checked under an earlier Coursewerk (General Chemistry) holds none of that in a
// Coursewerk 1.0 log, so the 1.0 gate owes it everything again. The instructor records once, in their words, that the
// package was developed, approved and checked under the earlier Coursewerk, bound to the exact text of a baseline
// delivery. From then on only what changed since that baseline is checked under the full 1.0 rules:
//   - a plan whose files are byte-identical to the baseline is approved by that act (marked carried over);
//   - a unit whose current text hashes to its baseline hash is carried over: its unit-unlinked, evidence-missing,
//     absolute-unreviewed and reverify findings are listed as non-blocking notes, labelled so; any edit ends it.
// The label is always "carried over from earlier Coursewerk" — never "verified": nothing here checks a fact.
import fs from "node:fs";
import path from "node:path";
import { sha256 } from "../records/canonical.mjs";
import { appendLogRecord, parseLog, readLogText, verifyLog } from "../records/log.mjs";
import { recordFile, RECORDS } from "../records/paths.mjs";
import { hasVisibleWords } from "../records/words.mjs";
import { makeFinding } from "../records/findings.mjs";
import { manifestChapters } from "./package_reader.mjs";
import { approvalStatus, recordApproval } from "./approvals.mjs";
import { approvalPrecondition } from "./spine_review.mjs";

export const CARRY_DIR = `${RECORDS}/carry-over`;
export const CARRIED_KINDS = Object.freeze(["unit-unlinked", "evidence-missing", "absolute-unreviewed", "reverify"]);
export const CARRIED_LABEL = "carried over from earlier Coursewerk";
const PLAN_DIRS = ["concepts", "assessment-support"];
const MAX_BYTES = 4 * 1024 * 1024;

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full, base) : e.isFile() ? [path.relative(base, full).split(path.sep).join("/")] : [];
  }).sort();
}

/**
 * The baseline record of a package (site or package layout: plans and unit sidecars sit at the same places in both):
 * { schemaVersion, kind, baseline: { label, sums }, plans: { path: sha256 }, units: { id: contentHash } }.
 */
export function buildBaseline(dir, { label = null } = {}) {
  dir = path.resolve(dir);
  if (!fs.existsSync(dir)) throw new Error(`no such package: ${dir}`);
  const sums = fs.existsSync(path.join(dir, "SHA256SUMS")) ? sha256(fs.readFileSync(path.join(dir, "SHA256SUMS"))) : null;
  const plans = {};
  for (const d of PLAN_DIRS) for (const rel of walk(path.join(dir, d)).filter((r) => r.endsWith(".md"))) plans[`${d}/${rel}`] = sha256(fs.readFileSync(path.join(dir, d, rel)));
  const units = {};
  for (const rel of walk(path.join(dir, RECORDS, "units")).filter((r) => r.endsWith(".json"))) {
    let side; try { side = JSON.parse(fs.readFileSync(path.join(dir, RECORDS, "units", rel), "utf8")); } catch { throw new Error(`${RECORDS}/units/${rel} is not readable JSON`); }
    for (const u of side.units || []) if (u?.id && u.locator?.contentHash) units[u.id] = u.locator.contentHash;
  }
  if (!Object.keys(plans).length && !Object.keys(units).length) throw new Error(`${dir} holds no plans and no unit records: not a Coursewerk package`);
  const name = label || path.basename(path.dirname(dir)) || path.basename(dir);
  return { schemaVersion: 1, kind: "coursewerk-carry-over-baseline", baseline: { label: String(name), sums }, plans, units };
}

/** Write a baseline record; refuses one that would not fit a record file (4 MB). Returns { file, bytes }. */
export function writeBaseline(record, out) {
  const text = JSON.stringify(record) + "\n";
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error(`the baseline record is ${Buffer.byteLength(text)} bytes, over the 4 MB a record file may hold`);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, text);
  return { file: out, bytes: Buffer.byteLength(text) };
}

const carryRecords = (logText) => (verifyLog(logText).length ? [] : parseLog(logText).filter((r) => r.type === "intake" && r.party?.role === "instructor" && r.payload?.event === "carry-over"));

/**
 * The instructor's carry-over act. Logs one intake record (event carry-over) binding the baseline record (its path in
 * the package, sha256, label) and the instructor's words; then records the approval of every plan byte-identical to the
 * baseline, marked carried over. Returns { record, plans: { carried: [scope], left: [{ scope, why }] }, units }.
 */
export const AS_NOW = "approved as it stands now, in the carry-over statement";
// `approveCurrentPlans` (owner 2026-11-03): the instructor's statement also approves every plan as it stands now — a
// plan that differs from the baseline is approved at its current text, by the same act, marked so (AS_NOW). It goes
// through Coursewerk's own approval precondition and recordApproval: a plan that fails the precondition stays left.
export function carryOver(root, reader, { baseline, instructorWords, approveCurrentPlans = false }, party) {
  if (party?.role !== "instructor") throw new Error("carrying a package over is the instructor's act");
  if (!hasVisibleWords(instructorWords)) throw new Error("a carry-over quotes the instructor's words");
  const rel = String(baseline || "").split(path.sep).join("/");
  if (!rel.startsWith(`${CARRY_DIR}/`) || rel.split("/").includes("..") || !rel.endsWith(".json")) throw new Error(`the baseline record must be a .json file in the package under ${CARRY_DIR}/, so it travels with the package`);
  const file = recordFile(root, rel);
  if (!fs.existsSync(file)) throw new Error(`no baseline record at ${rel}: write it with coursewerk.mjs carry-over-baseline`);
  const bytes = fs.readFileSync(file), hash = sha256(bytes);
  let b; try { b = JSON.parse(bytes.toString("utf8")); } catch { throw new Error(`${rel} is not readable JSON`); }
  if (b?.kind !== "coursewerk-carry-over-baseline" || !b.baseline?.label || typeof b.plans !== "object" || typeof b.units !== "object") throw new Error(`${rel} is not a baseline record (coursewerk.mjs carry-over-baseline writes one)`);
  const logText = readLogText(root);
  const before = carryRecords(logText).find((r) => r.payload.baselineHash === hash || r.payload.label === b.baseline.label);
  if (before) throw new Error(`this baseline (${b.baseline.label}) was already carried over (log record ${before.seq})`);
  const record = appendLogRecord(root, { type: "intake", party, payload: {
    event: "carry-over", label: b.baseline.label, baseline: rel, baselineHash: hash, sums: b.baseline.sums ?? null,
    plans: Object.keys(b.plans).length, units: Object.keys(b.units).length, instructorWords, means: CARRIED_LABEL, ...(approveCurrentPlans ? { approvesCurrentPlans: true } : {}) } });
  const chapters = manifestChapters(reader), carried = [], asNow = [], left = [];
  const status = approvalStatus(reader, chapters, readLogText(root));
  for (const ch of [...chapters, null]) {
    const scope = ch ? `chapter:${ch}` : "course", s = ch ? status.scopes[ch] : status.scopes.course;
    if (!s) continue;
    if (s.valid) { left.push({ scope, why: "already approved at its current content" }); continue; }
    const differ = s.covers.filter((p) => { const t = reader.text(p); return t == null || b.plans[p] !== sha256(Buffer.from(t, "utf8")); });
    if (differ.length && !approveCurrentPlans) { left.push({ scope, why: `differs from the baseline (${differ.join(", ")}): for the instructor's approval` }); continue; }
    if (s.covers.some((p) => reader.text(p) == null)) { left.push({ scope, why: `its plan is incomplete (${s.covers.filter((p) => reader.text(p) == null).join(", ")} missing)` }); continue; }
    const pre = approvalPrecondition(root, reader, chapters, { chapter: ch });
    if (pre.problem) { left.push({ scope, why: pre.problem }); continue; }
    const reason = differ.length ? AS_NOW : "byte-identical to the baseline";
    try {
      // an approval of a chapter with no state recorded yet moves it to PACKAGE (workflow.mjs chapterStates: approved
      // before states were recorded) — the state an approved chapter has, by Coursewerk's own record
      recordApproval(root, reader, chapters, { chapter: ch, instructorWords, note: [pre.note, `${CARRIED_LABEL}: ${b.baseline.label}; ${reason}`].filter(Boolean).join("; "), carriedOver: { label: b.baseline.label, record: record.seq, reason } }, party);
      (differ.length ? asNow : carried).push(scope);
    } catch (e) { left.push({ scope, why: e.message }); }
  }
  return { record: record.seq, label: b.baseline.label, plans: { carried, approvedAsNow: asNow, left }, units: Object.keys(b.units).length };
}

/**
 * What the log carries over: { units: Map(id → baseline content hash), baselines: [{ label, seq, path }], problems }.
 * A baseline file that no longer hashes to what the instructor carried over carries nothing, and is a problem.
 */
export function carriedOverState(root, logText = readLogText(root)) {
  const units = new Map(), baselines = [], problems = [];
  for (const r of carryRecords(logText)) {
    const p = r.payload;
    let bytes = null; try { bytes = fs.readFileSync(recordFile(root, p.baseline)); } catch { bytes = null; }
    if (!bytes || sha256(bytes) !== p.baselineHash) { problems.push(`the baseline record ${p.baseline} carried over at log record ${r.seq} is ${bytes ? "changed" : "missing"}: nothing is carried over from it`); continue; }
    let b; try { b = JSON.parse(bytes.toString("utf8")); } catch { problems.push(`${p.baseline} is not readable JSON`); continue; }
    for (const [id, h] of Object.entries(b.units || {})) units.set(id, h);
    baselines.push({ label: p.label, seq: r.seq, path: p.baseline });
  }
  return { units, baselines, problems };
}

/**
 * The gate's view (full_gate): `findings` with each of the four kinds on a carried unit turned into a non-blocking note
 * labelled carried over, plus a blocking defect per changed baseline. `textHashOf`: Map(unit id → current content hash).
 * Returns { findings, carried: { units, notes, plans, labels } }.
 */
export function applyCarriedOver(root, findings, textHashOf, basis, { reader = null, logText = readLogText(root) } = {}) {
  const st = carriedOverState(root, logText);
  const extra = st.problems.map((detail) => makeFinding({ module: "skeleton", kind: "carry-over-baseline-changed", units: [], statusClass: "defect", route: "agent", basis,
    evidence: { type: "rule", rule: "a baseline the instructor carried over stays as it was carried over", detail } }));
  const isCarried = (id) => st.units.has(id) && textHashOf.get(id) === st.units.get(id);
  const label = st.baselines.map((b) => b.label).join(", ");
  let notes = 0;
  const out = findings.map((f) => {
    if (!CARRIED_KINDS.includes(f.kind) || f.statusClass !== "obligation" || !(f.units || []).length || !f.units.every(isCarried)) return f;
    notes++;
    return makeFinding({ module: f.module, kind: f.kind, units: f.units, statusClass: "question", route: "agent", basis: f.basis,
      evidence: { type: "missing", what: f.evidence?.what, carriedOver: { label, note: `${CARRIED_LABEL} (${label}): not checked under Coursewerk 1.0 since; it owes this again once its text changes` } } });
  });
  let plans = 0;
  if (reader && st.baselines.length) {
    const seqs = new Set(st.baselines.map((b) => b.seq));
    const status = approvalStatus(reader, manifestChapters(reader), logText);
    plans = Object.values(status.scopes).filter((s) => s.valid && s.record?.payload?.carriedOver && seqs.has(s.record.payload.carriedOver.record)).length;
  }
  return { findings: [...out, ...extra], carried: { units: [...textHashOf.keys()].filter(isCarried).length, notes, plans, labels: st.baselines.map((b) => b.label) } };
}
