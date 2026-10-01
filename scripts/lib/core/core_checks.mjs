// The skeleton's deterministic core checks that concern the spine (D19-A): well-formedness at V1 (and again at V8),
// and approval problems at V8. Spine v2 packages only (coursewerk.json spine: 2).
import { makeFinding } from "../records/findings.mjs";
import { readLogText } from "../records/log.mjs";
import { checkSpine, parseSpine } from "./spine.mjs";
import { approvalProblems, approvalStatus } from "./approvals.mjs";
import { manifestChapters } from "./package_reader.mjs";

export function spineCoreFindings(reader, basis) {
  const chapters = manifestChapters(reader);
  return checkSpine(parseSpine(reader, chapters), chapters).map((p) => makeFinding({ module: "skeleton", kind: `spine-${p.rule}`, units: p.ids, statusClass: "defect", route: "agent",
    evidence: { type: "rule", rule: p.rule, file: p.file, detail: p.detail }, basis }));
}

export function approvalCoreProblems(root, reader) {
  const chapters = manifestChapters(reader);
  return approvalProblems(approvalStatus(reader, chapters, readLogText(root)), chapters);
}
