// The module contract (skeleton §6). A module is { manifest, run(snapshot), recheck?(draft, snapshot) }.
// A manifest that does not validate means the module is not run — and the runner says so.
import { STATUS_CLASSES, ROUTES, EVIDENCE_TYPES } from "../records/findings.mjs";
import { MATURITY } from "../records/registry.mjs";

export const SERVES = Object.freeze(["Control", "Confidence", "Coherence"]);
export const CHECKPOINTS = Object.freeze(["V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"]);
export const READS = Object.freeze(["deliverables", "spine", "units", "steering", "sources", "assets", "manifest", "history", "log", "findings"]);
export const METHODS = Object.freeze(["deterministic", "executable", "model-judged", "web"]);
export const PROFILES = Object.freeze(["public", "private"]);
// The only reasons a finding may interrupt the instructor (D14).
export const INTERRUPT_REASONS = Object.freeze(["spine-scope-conflict", "missing-input", "rights-blocker", "spine-change-request"]);

const slug = /^[a-z0-9][a-z0-9-]*$/;
const subset = (list, allowed) => Array.isArray(list) && list.length > 0 && list.every((x) => allowed.includes(x));

export function validateManifest(manifest) {
  const f = [];
  const m = manifest || {};
  const who = m.name || "(unnamed module)";
  if (!slug.test(m.name || "")) f.push(`${who}: name must be a lowercase slug`);
  if (m.name === "skeleton") f.push(`${who}: the name "skeleton" is reserved for the harness's own checks`);
  if (!/^\d+\.\d+\.\d+$/.test(m.version || "")) f.push(`${who}: version must be semver`);
  if (!subset(m.serves, SERVES)) f.push(`${who}: serves must list one or more of ${SERVES.join(", ")}`);
  if (!subset(m.checkpoints, CHECKPOINTS)) f.push(`${who}: checkpoints must list one or more of V0–V8`);
  if (!subset(m.reads, READS)) f.push(`${who}: reads must list one or more of ${READS.join(", ")}`);
  if (!METHODS.includes(m.method)) f.push(`${who}: method must be one of ${METHODS.join(", ")}`);
  if (!String(m.cost || "").trim()) f.push(`${who}: cost must be stated`);
  if (!subset(m.profiles, PROFILES)) f.push(`${who}: profiles must list public and/or private`);
  if (!MATURITY.includes(m.maturity)) f.push(`${who}: maturity must be stable, trial or experimental`);
  if (typeof m.mayBlock !== "boolean") f.push(`${who}: mayBlock must be true or false`);
  if (!Array.isArray(m.emits) || !m.emits.length) f.push(`${who}: emits must declare at least one finding kind`);
  const kinds = new Set();
  for (const e of m.emits || []) {
    const k = e?.kind || "(no kind)";
    if (!slug.test(e?.kind || "")) f.push(`${who}: emitted kind must be a lowercase slug: ${k}`);
    if (kinds.has(k)) f.push(`${who}: kind ${k} declared twice`);
    kinds.add(k);
    if (!STATUS_CLASSES.includes(e?.statusClass)) f.push(`${who}/${k}: statusClass must be defect, obligation or question`);
    if (!EVIDENCE_TYPES.includes(e?.evidenceType)) f.push(`${who}/${k}: evidenceType must be one of ${EVIDENCE_TYPES.join(", ")}`);
    if (!ROUTES.includes(e?.route)) f.push(`${who}/${k}: route must be agent, digest or interrupt`);
    if (e?.route === "interrupt" && !INTERRUPT_REASONS.includes(e?.interruptReason)) f.push(`${who}/${k}: an interrupting kind must name one of the four interrupt reasons`);
    if (e?.interruptReason === "rights-blocker" && (m.profiles || []).includes("private")) f.push(`${who}/${k}: a rights blocker cannot run in private packages`);
    if (m.mayBlock === false && e?.statusClass !== "question") f.push(`${who}/${k}: a module that may not block can only emit questions`);
    if (e?.statusClass === "defect" && m.mayBlock && !["rule", "computation", "quote", "contradiction"].includes(e?.evidenceType)) f.push(`${who}/${k}: a defect kind needs re-runnable evidence`);
  }
  return f;
}

/** A module object must carry a valid manifest, a run function, and — if it can emit defects — a recheck function. */
export function validateModule(mod) {
  const f = validateManifest(mod?.manifest);
  if (typeof mod?.run !== "function") f.push(`${mod?.manifest?.name || "(module)"}: run(snapshot) is required`);
  if ((mod?.manifest?.emits || []).some((e) => e.statusClass === "defect") && typeof mod?.recheck !== "function")
    f.push(`${mod?.manifest?.name || "(module)"}: a module that emits defects must provide recheck(draft, snapshot)`);
  return f;
}
