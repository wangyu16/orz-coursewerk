// The approval view (F3; M3): the spine rendered for reading, with each item's origin shown (yours / standardized /
// proposed by the agent), the critique questions, and a preview of what will be built — per objective, the number and
// kind of example and practice questions the assessment guide implies.
import { spinePaths } from "./spine.mjs";

export const ORIGINS = Object.freeze(["instructor", "standardized", "proposed"]);
const LABEL = { instructor: "yours", standardized: "standardized from yours", proposed: "PROPOSED BY THE AGENT" };
export const originsPath = (doc) => `private/coursewerk/spine/${doc}.origins.json`;

/** Origins sidecar: { schemaVersion: 1, items: { <anchor>: instructor|standardized|proposed } }. */
export function readOrigins(reader, doc) {
  try { const o = JSON.parse(reader.text(originsPath(doc)) || "null"); return o?.items || {}; } catch { return {}; }
}
export function validateOrigins(o) {
  const f = [];
  if (o?.schemaVersion !== 1) f.push("origins sidecar requires schemaVersion 1");
  for (const [a, v] of Object.entries(o?.items || {})) if (!ORIGINS.includes(v)) f.push(`origin of ${a} must be one of ${ORIGINS.join(", ")}`);
  return f;
}

export function approvalPreview(reader, spine, chapter, { critique = [] } = {}) {
  const s = spine.chapters[chapter];
  const { map, guide } = spinePaths(chapter);
  const mo = readOrigins(reader, map), go = readOrigins(reader, guide);
  const mark = (origins, anchor) => `(${LABEL[origins[anchor]] || "origin not recorded"})`;
  const L = [`# Approval view — ${chapter}`, ""];
  const counts = { instructor: 0, standardized: 0, proposed: 0, unrecorded: 0 };
  const tally = (origins, a) => { const k = origins[a]; counts[ORIGINS.includes(k) ? k : "unrecorded"]++; };
  for (const [kind, title] of [["objective", "Objectives"], ["concept", "Concept sequence"], ["misconception", "Misconceptions to surface"]]) {
    L.push(`## ${title}`);
    for (const n of s.map.nodes.filter((x) => x.kind === kind)) { L.push(`- ${n.text} ${mark(mo, n.anchor)}`); tally(mo, n.anchor); }
    L.push("");
  }
  L.push("## What will be built (from the assessment guide)");
  let total = 0;
  for (const o of s.map.nodes.filter((x) => x.kind === "objective")) {
    const entries = s.guide.entries.filter((e) => e.objective === o.anchor);
    const n = entries.reduce((a, e) => a + (Number.isInteger(e.count) ? e.count : 0), 0); total += n;
    L.push(`- **${o.text}** — ${n} question(s): ${entries.map((e) => `${e.count}× ${e.type} (${e.levels}) ${mark(go, e.anchor)}`).join("; ") || "none"}`);
    for (const e of entries) tally(go, e.anchor);
  }
  L.push("", `Total: ${total} example and practice question(s).`, "");
  L.push(`Origins: ${counts.instructor} yours, ${counts.standardized} standardized, ${counts.proposed} proposed by the agent, ${counts.unrecorded} not recorded.`, "");
  if (critique.length) { L.push("## Questions for you (they never block)"); for (const q of critique) L.push(`- ${q.evidence?.note || q.kind}`); L.push(""); }
  return { text: L.join("\n"), counts, totalQuestions: total };
}
