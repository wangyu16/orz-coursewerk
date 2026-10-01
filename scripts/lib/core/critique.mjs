// Spine critique (F3; rung 4): open judgment about the spine is raised only as questions, routed to the digest, and
// never blocks. The agent writes the critique; the harness only shapes and routes it.
import { makeFinding } from "../records/findings.mjs";

export const CRITIQUE_KINDS = Object.freeze(["objective-not-assessable", "level-mismatch", "concept-uncovered-by-sources", "scope-too-large", "prerequisite-missing", "other"]);

export function spineCritique({ kind, ids = [], note, recommendation = null, basis }) {
  if (!CRITIQUE_KINDS.includes(kind)) throw new Error(`critique kind must be one of ${CRITIQUE_KINDS.join(", ")}`);
  if (!String(note || "").trim()) throw new Error("a critique question says what it is about");
  return makeFinding({ module: "spine-critique", kind, units: ids, statusClass: "question", route: "digest", evidence: { type: "judgment", note }, recommendation, basis });
}
