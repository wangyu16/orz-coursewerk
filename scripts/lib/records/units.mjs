// Unit records — the smallest checkable pieces of a deliverable (F1; skeleton §5; D18, D20).
// This module fixes the record's shape. Segmentation, identity matching and classification come in P4.
import { HEX64 } from "./canonical.mjs";

export const UNIT_FORMS = Object.freeze(["paragraph", "list-item", "table-row", "equation", "callout", "figure", "slide-group", "question", "answer"]);
export const UNIT_ROLES = Object.freeze(["teaching", "framing"]);
export const JUDGMENT_KINDS = Object.freeze(["mechanical", "semi-mechanical", "knowledge-based"]);
// Origin kinds and the fields each must carry. `unknown` is an edit of unknown authorship (D20).
export const ORIGIN_KINDS = Object.freeze({
  "source-derived": ["source", "span"],
  "agent-knowledge": ["model", "step", "date"],
  "computed": ["code", "hash"],
  "instructor-authored": ["instructor", "date"],
  "found-evidence": ["ref"],
  "unknown": [],
});

export function validateUnit(unit) {
  const failures = [];
  const where = unit?.id || "(unit without id)";
  if (!/^u-[a-z0-9-]+$/.test(unit?.id || "")) failures.push(`${where}: unit id must look like u-<slug>`);
  const loc = unit?.locator || {};
  if (!loc.deliverable || !loc.section || !Number.isInteger(loc.ordinal) || loc.ordinal < 0 || !HEX64.test(loc.contentHash || ""))
    failures.push(`${where}: locator requires deliverable, section, a non-negative integer ordinal and a sha256 contentHash`);
  if (!UNIT_FORMS.includes(unit?.form)) failures.push(`${where}: unknown form ${unit?.form}`);
  if (!UNIT_ROLES.includes(unit?.role)) failures.push(`${where}: role must be teaching or framing`);
  const origin = unit?.origin || {};
  if (!(origin.kind in ORIGIN_KINDS)) failures.push(`${where}: unknown origin kind ${origin.kind}`);
  else for (const field of ORIGIN_KINDS[origin.kind]) if (!String(origin[field] ?? "").trim()) failures.push(`${where}: ${origin.kind} origin requires ${field}`);
  if (!Array.isArray(unit?.spineNodes) || unit.spineNodes.some((n) => typeof n !== "string" || !n)) failures.push(`${where}: spineNodes must be a list of anchors`);
  if (!Array.isArray(unit?.judgment) || !unit.judgment.length || unit.judgment.some((k) => !JUDGMENT_KINDS.includes(k)))
    failures.push(`${where}: judgment must be a non-empty list of ${JUDGMENT_KINDS.join(", ")}`);
  if (unit?.role === "framing" && (unit.judgment || []).some((k) => k !== "knowledge-based"))
    failures.push(`${where}: a framing unit may not carry mechanical or semi-mechanical content`);
  if (!Array.isArray(unit?.evidence || [])) failures.push(`${where}: evidence must be a list`);
  return failures;
}

export function validateUnitSidecar(sidecar) {
  const failures = [];
  if (sidecar?.schemaVersion !== 1) failures.push("unit sidecar requires schemaVersion 1");
  if (!sidecar?.deliverable) failures.push("unit sidecar requires its deliverable path");
  if (!Array.isArray(sidecar?.units)) return [...failures, "unit sidecar requires a units list"];
  const ids = new Set();
  for (const unit of sidecar.units) {
    failures.push(...validateUnit(unit));
    if (ids.has(unit?.id)) failures.push(`duplicate unit id ${unit.id}`);
    ids.add(unit?.id);
    if (unit?.locator?.deliverable && unit.locator.deliverable !== sidecar.deliverable) failures.push(`${unit.id}: belongs to ${unit.locator.deliverable}, not ${sidecar.deliverable}`);
  }
  return failures;
}
