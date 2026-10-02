// MS7 — Value consistency and physical sanity (modules.md). Runs the v0.12 consistency and range scanners over the
// package's UNITS (not only indexed claims), with the term registry from the spine's ## Key terms. A value disagreement
// and a physically impossible quantity are defects; an ambiguous answer is a question; definition drift is retired
// (a reworded definition raises nothing — D17; a changed fact is caught by its own unit's evidence, D19-C).
import { computeSemanticIndex } from "../lib/semantic_index.mjs";
import { scanConsistency, rangeAudit } from "../lib/consistency.mjs";
import { base, recheckByRerun } from "./_shared.mjs";
import { plainForQuantities } from "../lib/core/dependencies.mjs";

// the package writes its quantities in LaTeX ($\Delta H = -92.2\ \text{kJ}$); the scanners read plain text, so the
// notation is folded first (P11 wiring sweep: a disagreement in LaTeX went unseen; in Unicode it was caught)
const plain = (t) => plainForQuantities(String(t).replace(/\\Delta\s*/g, "Δ").replace(/\\ce\{([^}]*)\}/g, " $1 ").replace(/\$\$/g, " ")).replace(/[ \t]+/g, " ");

function unitClaims(s) {
  const claims = [];
  for (const p of s.paths.filter((x) => x.startsWith("metadata/units/") && x.endsWith(".json")).sort()) {
    const side = s.json(p); if (!side || typeof side.deliverable !== "string" || !Array.isArray(side.units)) continue; // a malformed sidecar is the index's to report
    const lines = (s.text(side.deliverable) || "").split("\n");
    const scope = side.deliverable.split("/")[1]?.replace(/\.md$/, "") ?? null;
    for (const u of side.units || []) {
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
