// MS7 — Value consistency and physical sanity (modules.md). Runs the v0.12 consistency and range scanners over the
// package's UNITS (not only indexed claims), with the term registry from the spine's ## Key terms. A value disagreement
// and a physically impossible quantity are defects; an ambiguous answer is a question; definition drift is retired
// (a reworded definition raises nothing — D17; a changed fact is caught by its own unit's evidence, D19-C).
import { computeSemanticIndex } from "../lib/semantic_index.mjs";
import { scanConsistency, rangeAudit } from "../lib/consistency.mjs";
import { base, recheckByRerun } from "./_shared.mjs";
import { decodeEntities } from "../lib/core/values.mjs";

// the package writes its quantities in LaTeX ($\Delta H = -92.2\ \text{kJ}$); the scanners read values through the one
// value parser (core/values.mjs, which folds the rest of the notation itself: "^{-1}" stays a denominator, every
// minus a sign — red-team round 2, R2-K08), so only what names the subject is folded here (P11 wiring sweep: a
// disagreement in LaTeX went unseen; in Unicode it was caught)
const plain = (t) => decodeEntities(String(t)).replace(/\\Delta\s*/g, "Δ").replace(/\\ce\{([^}]*)\}/g, " $1 ").replace(/\$\$/g, " ").replace(/[ \t]+/g, " ");

export function unitClaims(s) {
  const claims = [];
  for (const p of s.paths.filter((x) => x.startsWith("metadata/units/") && x.endsWith(".json")).sort()) {
    const side = s.json(p); if (!side || typeof side.deliverable !== "string" || !Array.isArray(side.units)) continue; // a malformed sidecar is the index's to report
    const lines = (s.text(side.deliverable) || "").split("\n");
    // the chapter a value is read in: a chapter deliverable's own (study-guide|slides|practice/<chapter>.md, by exact
    // shape); anywhere else (a declared handout), the one chapter its links serve, or the whole package (red-team round
    // 5, the audit of F4: the second path segment was taken as the chapter, so "current/fall-2026/x.md" was read in a
    // chapter named "fall-2026" and its chapter's terms never resolved — its values were never compared)
    const own = side.deliverable.match(/^(?:study-guide|slides|practice)\/([^/]+)\.md$/)?.[1] ?? null;
    const linkedChapter = (u) => { const chs = [...new Set((u.spineNodes || []).map((n) => String(n).split(".")[1]).filter((c) => c && c !== "course"))]; return chs.length === 1 ? chs[0] : null; };
    for (const u of side.units || []) {
      const scope = own ?? linkedChapter(u);
      const [a, b] = u.locator.lines || [0, 0];
      const text = plain(lines.slice(a - 1, b).join("\n"));
      const workedSolution = u.form === "answer" && !side.deliverable.startsWith("practice/");
      const type = u.form === "answer" && !workedSolution ? "answer-key" : u.form === "question" || workedSolution ? "derived" : "fact";
      claims.push({ id: u.id, text, type, scope, status: "active", termRefs: [], spineRefs: u.spineNodes || [], locations: [{ file: side.deliverable, anchor: u.locator.section }] });
    }
  }
  return claims;
}

function run(s) {
  const claims = unitClaims(s);
  if (!claims.length) return [];
  const { terms } = computeSemanticIndex(s.materialize().package);
  const out = [];
  for (const f of scanConsistency(claims, terms)) {
    if (f.kind === "definition-drift") continue;
    if (f.kind === "value-disagreement") out.push({ kind: "value-disagreement", units: [...f.claimIds].sort(), evidence: { type: "contradiction", rule: "one term and dimension carries one value across the package", detail: f.evidence } });
    else if (f.kind === "ambiguous-answer") out.push({ kind: "ambiguous-answer", units: [...f.claimIds].sort(), evidence: { type: "judgment", note: (f.evidence || []).join(" ") } });
  }
  // The range check runs per SENTENCE, with Unicode minus folded. The v0.12 scanner skips a whole claim that mentions a
  // change (a change may be negative); at paragraph granularity that hid an impossible value in the next sentence, and
  // "−40 K" with a Unicode minus was not read as negative at all (found on the C2 package, P6).
  const sentences = claims.flatMap((c) => String(c.text).replace(/−/g, "-").split(/(?<=[.!?])\s+(?=[A-Z$(])/).map((t, i) => ({ ...c, text: t, _part: i })));
  const seen = new Set();
  for (const f of rangeAudit(sentences)) {
    const key = JSON.stringify([f.claimIds, f.evidence?.[0]]);
    if (seen.has(key)) continue; seen.add(key);
    out.push({ kind: "implausible-quantity", units: [...new Set(f.claimIds || [])].sort(), evidence: { type: "rule", rule: "a quantity lies in its physical range", detail: f.evidence } });
  }
  return out;
}

export default {
  manifest: base({ name: "ms7-consistency", serves: ["Confidence", "Coherence"], checkpoints: ["V5", "V6", "V8"], reads: ["units", "deliverables", "spine"], cost: "per term × dimension", profiles: ["public", "private"],
    emits: [
      { kind: "value-disagreement", statusClass: "defect", evidenceType: "contradiction", route: "agent" },
      { kind: "implausible-quantity", statusClass: "defect", evidenceType: "rule", route: "agent" },
      { kind: "ambiguous-answer", statusClass: "question", evidenceType: "judgment", route: "digest" },
    ] }),
  run, recheck: recheckByRerun(run),
};
