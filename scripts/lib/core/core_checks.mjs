// The skeleton's deterministic core checks that concern the spine (D19-A): well-formedness at V1 (and again at V8),
// and approval problems at V8. Spine v2 packages only (metadata/coursewerk.json spine: 2).
import { makeFinding } from "../records/findings.mjs";
import { readLogText } from "../records/log.mjs";
import { checkSpine, parseSpine } from "./spine.mjs";
import { approvalProblems, approvalStatus } from "./approvals.mjs";
import { manifestChapters } from "./package_reader.mjs";
import { deliverablesOf } from "./units_index.mjs";
import { learningObjectiveSections } from "./segment.mjs";

export function spineCoreFindings(reader, basis) {
  const chapters = manifestChapters(reader);
  return checkSpine(parseSpine(reader, chapters), chapters).map((p) => makeFinding({ module: "skeleton", kind: `spine-${p.rule}`, units: p.ids, statusClass: "defect", route: "agent",
    evidence: { type: "rule", rule: p.rule, file: p.file, detail: p.detail }, basis }));
}

/**
 * A deliverable's restated "Learning objectives" are structure, not units, so nothing else reads them: each item
 * must say what an approved objective of its chapter says (P11 dev: "the van 't Hoff relation" changed to "the
 * Nernst relation" in a restated objective raised nothing), and every approved objective is restated (redteam r1
 * C4-12: a dropped objective, and reversed signs inside the maths, raised nothing). Compared on the full text,
 * maths included, with notation normalized (objectiveKey): LaTeX in the deliverable and Unicode in the spine, spacing,
 * emphasis and punctuation do not count as a difference; a sign, a symbol, a number or a word does.
 */
export const proseWords = (t) => String(t).replace(/\[anchor:[^\]]*\]/g, " ").replace(/\$[^$]*\$/g, " ").replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, " ").toLowerCase().match(/[a-z]{3,}/g)?.join(" ") || "";
const LATEX = { Delta: "Δ", delta: "δ", Sigma: "Σ", sigma: "σ", alpha: "α", beta: "β", gamma: "γ", lambda: "λ", mu: "μ", nu: "ν", pi: "π", theta: "θ", rho: "ρ", tau: "τ", chi: "χ", omega: "ω", Omega: "Ω",
  ominus: "°", circ: "°", degree: "°", minus: "-", times: "×", cdot: "·", div: "÷", pm: "±", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", lt: "<", gt: ">", approx: "≈", propto: "∝", infty: "∞",
  to: "→", rightarrow: "→", longrightarrow: "→", leftarrow: "←", rightleftharpoons: "⇌", leftrightharpoons: "⇌", leftrightarrow: "↔", ln: "ln", log: "log", exp: "exp" };
const SUBSUP = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "-", "₊": "+", "₋": "-" };
export const objectiveKey = (t) => String(t)
  .replace(/\s*\[(?:anchor|prereq):[^\]]*\]/gi, " ")
  .replace(/<=>/g, "⇌").replace(/->/g, "→")
  .replace(/\\(?:text|mathrm|mathit|mathbf|operatorname|ce|textrm)\s*\{([^{}]*)\}/g, "$1")
  .replace(/\\([A-Za-z]+)/g, (m, w) => LATEX[w] ?? w)
  .replace(/\\[,;:! ]/g, " ")
  .replace(/[₀-₉⁰-⁹⁺⁻₊₋¹²³]/g, (c) => SUBSUP[c] ?? c)
  .replace(/[⊖⦵]/g, "°").replace(/[−–—]/g, "-")
  .replace(/[$^_{}*`\\]/g, "")
  .toLowerCase()
  .replace(/[\s.,;:!?'"“”‘’()]/g, "");

export function restatedObjectiveFindings(reader, basis) {
  const chapters = manifestChapters(reader), spine = parseSpine(reader, chapters), out = [];
  const defect = (kind, rel, line, detail) => out.push(makeFinding({ module: "skeleton", kind, units: [], statusClass: "defect", route: "agent", evidence: { type: "rule", rule: kind, file: rel, line, detail }, basis }));
  for (const rel of deliverablesOf(reader)) {
    const ch = chapters.find((c) => rel.endsWith(`/${c}.md`));
    const objectives = (spine.chapters[ch]?.map.nodes || []).filter((n) => n.kind === "objective");
    const sections = learningObjectiveSections(reader.text(rel));
    if (!sections.length || !objectives.length) continue;
    const approved = new Map(objectives.map((n) => [objectiveKey(n.text), n])), restated = new Set();
    for (const it of sections.flatMap((s) => s.items)) {
      const key = objectiveKey(it.text);
      if (approved.has(key)) restated.add(key);
      else defect("objective-restated-differently", rel, it.line + 1, `"${it.text.trim()}" is not an approved objective of ${ch}; restate the approved wording (concepts/${ch}.md)`);
    }
    for (const [key, n] of approved) if (!restated.has(key))
      defect("objective-not-restated", rel, sections[0].line + 1, `${n.id || n.text}: the Learning objectives section does not restate this approved objective of ${ch} ("${n.text}")`);
  }
  return out;
}

export function approvalCoreProblems(root, reader) {
  const chapters = manifestChapters(reader);
  return approvalProblems(approvalStatus(reader, chapters, readLogText(root)), chapters);
}
