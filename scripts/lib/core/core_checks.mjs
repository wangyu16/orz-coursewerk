// The skeleton's deterministic core checks that concern the spine (D19-A): well-formedness at V1 (and again at V8),
// and approval problems at V8. Spine v2 packages only (metadata/coursewerk.json spine: 2).
import { makeFinding } from "../records/findings.mjs";
import { readLogText } from "../records/log.mjs";
import { checkSpine, parseSpine } from "./spine.mjs";
import { approvalProblems, approvalStatus } from "./approvals.mjs";
import { manifestChapters } from "./package_reader.mjs";
import { deliverablesOf } from "./units_index.mjs";

export function spineCoreFindings(reader, basis) {
  const chapters = manifestChapters(reader);
  return checkSpine(parseSpine(reader, chapters), chapters).map((p) => makeFinding({ module: "skeleton", kind: `spine-${p.rule}`, units: p.ids, statusClass: "defect", route: "agent",
    evidence: { type: "rule", rule: p.rule, file: p.file, detail: p.detail }, basis }));
}

/**
 * A deliverable's restated "Learning objectives" are structure, not units, so nothing else reads them: each item
 * must say what an approved objective of its chapter says (P11 dev: "the van 't Hoff relation" changed to "the
 * Nernst relation" in a restated objective raised nothing). Compared on prose words — ASCII words of three or more
 * letters, in order — so notation (LaTeX in the deliverable, Unicode in the spine) does not count as a difference.
 */
export const proseWords = (t) => String(t).replace(/\[anchor:[^\]]*\]/g, " ").replace(/\$[^$]*\$/g, " ").replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, " ").toLowerCase().match(/[a-z]{3,}/g)?.join(" ") || "";
export function restatedObjectiveFindings(reader, basis) {
  const chapters = manifestChapters(reader), spine = parseSpine(reader, chapters), out = [];
  for (const rel of deliverablesOf(reader)) {
    const ch = chapters.find((c) => rel.endsWith(`/${c}.md`));
    const approved = (spine.chapters[ch]?.map.nodes || []).filter((n) => n.kind === "objective").map((n) => proseWords(n.text));
    const lines = reader.text(rel).split("\n"), start = lines.findIndex((l) => /^#{2,6}\s+learning objectives\s*$/i.test(l));
    if (start < 0 || !approved.length) continue;
    for (let k = start + 1; k < lines.length && !/^#{1,6}\s|^---\s*$|^<!--/.test(lines[k]); k++) {
      const m = lines[k].match(/^\s*(?:\d+[.)]|[-*])\s+(.*)$/);
      if (m && !approved.includes(proseWords(m[1])))
        out.push(makeFinding({ module: "skeleton", kind: "objective-restated-differently", units: [], statusClass: "defect", route: "agent",
          evidence: { type: "rule", rule: "objective-restated-differently", file: rel, line: k + 1, detail: `"${m[1].trim()}" is not an approved objective of ${ch}; restate the approved wording (concepts/${ch}.md)` }, basis }));
    }
  }
  return out;
}

export function approvalCoreProblems(root, reader) {
  const chapters = manifestChapters(reader);
  return approvalProblems(approvalStatus(reader, chapters, readLogText(root)), chapters);
}
