// Findings — everything a module (or the skeleton core) raises (skeleton §5; F2; D14).
// Three classes: a DEFECT carries evidence the item is wrong; an OBLIGATION says something required is missing
// (it claims nothing is wrong); a QUESTION needs judgment. Defects and obligations block publishing; questions never do.
import { canonicalJson, sha256 } from "./canonical.mjs";

export const STATUS_CLASSES = Object.freeze(["defect", "obligation", "question"]);
export const ROUTES = Object.freeze(["agent", "digest", "interrupt"]);
export const FINDING_STATUSES = Object.freeze(["open", "resolved", "answered"]);
// Evidence a defect may rest on (re-runnable by the harness), and the evidence types of the other classes.
export const DEFECT_EVIDENCE = Object.freeze(["rule", "computation", "quote", "contradiction"]);
export const EVIDENCE_TYPES = Object.freeze([...DEFECT_EVIDENCE, "missing", "judgment", "conflict"]);

export function blocksPublish(finding) {
  return finding?.statusClass === "defect" || finding?.statusClass === "obligation";
}

/** Content-addressed id: the same module, kind, units and evidence always give the same id. */
export function findingId({ module, kind, units = [], evidence = {} }) {
  return "f-" + sha256(canonicalJson({ module, kind, units: [...units].sort(), evidence })).slice(0, 24);
}

export function validateFinding(finding) {
  const failures = [];
  const where = finding?.id || finding?.kind || "(finding)";
  for (const field of ["module", "kind"]) if (!String(finding?.[field] || "").trim()) failures.push(`${where}: ${field} is required`);
  if (!Array.isArray(finding?.units)) failures.push(`${where}: units must be a list`);
  if (!STATUS_CLASSES.includes(finding?.statusClass)) failures.push(`${where}: statusClass must be defect, obligation or question`);
  if (!ROUTES.includes(finding?.route)) failures.push(`${where}: route must be agent, digest or interrupt`);
  if (finding?.route === "interrupt" && !["spine-scope-conflict", "missing-input", "rights-blocker", "spine-change-request"].includes(finding?.interruptReason))
    failures.push(`${where}: an interrupt must name one of the four interrupt reasons`);
  if (!FINDING_STATUSES.includes(finding?.status)) failures.push(`${where}: status must be open, resolved or answered`);
  const type = finding?.evidence?.type;
  if (!EVIDENCE_TYPES.includes(type)) failures.push(`${where}: evidence.type must be one of ${EVIDENCE_TYPES.join(", ")}`);
  if (finding?.statusClass === "defect" && !DEFECT_EVIDENCE.includes(type)) failures.push(`${where}: a defect needs re-runnable evidence (${DEFECT_EVIDENCE.join(", ")}), not ${type}`);
  if (finding?.statusClass === "obligation" && type !== "missing") failures.push(`${where}: an obligation's evidence says what is missing (type missing)`);
  if (finding?.statusClass === "obligation" && !String(finding?.evidence?.what || "").trim()) failures.push(`${where}: an obligation must say what is missing`);
  if (finding?.id && finding.id !== findingId(finding)) failures.push(`${where}: id does not match its content`);
  if (!String(finding?.basis || "").trim()) failures.push(`${where}: basis (what the finding was computed from) is required`);
  return failures;
}

export function makeFinding(fields) {
  const finding = { status: "open", ...fields };
  finding.id = findingId(finding);
  const failures = validateFinding(finding);
  if (failures.length) throw new Error(`refusing invalid finding: ${failures.join("; ")}`);
  return finding;
}
