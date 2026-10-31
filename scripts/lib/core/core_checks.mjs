// The skeleton's deterministic core checks that concern the spine (D19-A): well-formedness at V1 (and again at V8),
// and approval problems at V8. Spine v2 packages only (private/coursewerk/coursewerk.json spine: 2).
import { makeFinding } from "../records/findings.mjs";
import { readLogText } from "../records/log.mjs";
import { checkSpine, itemParts, parseSpine } from "./spine.mjs";
import { approvalProblems, approvalStatus } from "./approvals.mjs";
import { currentSpineReview } from "./spine_review.mjs";
import { manifestChapters } from "./package_reader.mjs";
import { deliverablesOf, documentEntries } from "./units_index.mjs";
import { DELIVERABLE_DIRS, learningObjectiveSections } from "./segment.mjs";
import { spineDetailLines, spineDetailNote } from "./spine_detail.mjs";
import { loadUnits } from "./obligations.mjs";

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
 * emphasis and punctuation do not count as a difference; a sign, a symbol, a number, a word, a letter's case, or a
 * bracketed group that is not the node's own anchor and prerequisites does.
 */
export const proseWords = (t) => String(t).replace(/\[anchor:[^\]]*\]/g, " ").replace(/\$[^$]*\$/g, " ").replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, " ").toLowerCase().match(/[a-z]{3,}/g)?.join(" ") || "";
const LATEX = { Delta: "Δ", delta: "δ", Sigma: "Σ", sigma: "σ", alpha: "α", beta: "β", gamma: "γ", lambda: "λ", mu: "μ", nu: "ν", pi: "π", theta: "θ", rho: "ρ", tau: "τ", chi: "χ", omega: "ω", Omega: "Ω",
  ominus: "°", circ: "°", degree: "°", minus: "-", times: "×", cdot: "·", div: "÷", pm: "±", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", lt: "<", gt: ">", approx: "≈", propto: "∝", infty: "∞",
  to: "→", rightarrow: "→", longrightarrow: "→", leftarrow: "←", rightleftharpoons: "⇌", leftrightharpoons: "⇌", leftrightarrow: "↔", ln: "ln", log: "log", exp: "exp" };
const SUBSUP = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "-", "₊": "+", "₋": "-" };
// Case is meaning (red team round 2, C4-09: "ln K", the equilibrium constant, is not "ln k", a rate constant), so the
// key keeps it. Bracket groups are not stripped here: restatedParts reads the trailing [anchor: …]/[prereq: …] groups the
// spine grammar reads, and they are compared with the approved node's; any other bracketed text stays in the key.
export const objectiveKey = (t) => String(t)
  .replace(/<=>/g, "⇌").replace(/->/g, "→")
  .replace(/\\(?:text|mathrm|mathit|mathbf|operatorname|ce|textrm)\s*\{([^{}]*)\}/g, "$1")
  .replace(/\\([A-Za-z]+)/g, (m, w) => LATEX[w] ?? w)
  .replace(/\\[,;:! ]/g, " ")
  .replace(/[₀-₉⁰-⁹⁺⁻₊₋¹²³]/g, (c) => SUBSUP[c] ?? c)
  .replace(/[⊖⦵]/g, "°").replace(/[−–—]/g, "-")
  .replace(/[$^_{}*`\\]/g, "")
  .replace(/[\s.,;:!?'"“”‘’()]/g, "");
/** A restated objective's text and the trailing bracket groups the spine grammar reads (anchor, prerequisites). */
export const restatedParts = (t) => { const p = itemParts(String(t)); return { key: objectiveKey(p.text), anchor: p.anchor, prereqs: [...p.prereqs].sort(), other: p.parent || p.aliases.length }; };

export function restatedObjectiveFindings(reader, basis) {
  const chapters = manifestChapters(reader), spine = parseSpine(reader, chapters), out = [];
  const defect = (kind, rel, line, detail) => out.push(makeFinding({ module: "skeleton", kind, units: [], statusClass: "defect", route: "agent", evidence: { type: "rule", rule: kind, file: rel, line, detail }, basis }));
  const docs = new Map(documentEntries(reader).map((d) => [d.source, d]));
  for (const rel of deliverablesOf(reader)) {
    // the chapter is the manifest's (its own deliverables, by exact path), or what a declared document declares; a
    // document that declares none restates SOME chapter's approved objectives (red-team round 5, the audit of F4: the
    // chapter was taken from the file name, so a handout not named <chapter>.md was never checked at all)
    const own = chapters.find((c) => DELIVERABLE_DIRS.some((d) => rel === `${d}/${c}.md`) || rel === `slides/${c}.slides.md`);
    const doc = own ? null : docs.get(rel);
    const chs = own ? [own] : doc ? (doc.chapters.filter((c) => chapters.includes(c)).length ? doc.chapters.filter((c) => chapters.includes(c)) : chapters) : [];
    const ch = chs.join(", ");
    const objectives = chs.flatMap((c) => (spine.chapters[c]?.map.nodes || []).filter((n) => n.kind === "objective"));
    const sections = learningObjectiveSections(reader.text(rel));
    if (!sections.length || !objectives.length) continue;
    const approved = new Map(objectives.map((n) => [objectiveKey(n.text), n])), restated = new Set();
    for (const it of sections.flatMap((s) => s.items)) {
      // the text, case kept, and any [anchor: …]/[prereq: …] it restates must be the approved node's (round 2, C4-09)
      const p = restatedParts(it.text), n = approved.get(p.key), key = p.key;
      const groupsOk = n && !p.other && (!p.anchor || p.anchor === n.anchor) && (!p.prereqs.length || JSON.stringify(p.prereqs) === JSON.stringify([...(n.prereqs || [])].sort()));
      if (groupsOk) restated.add(key);
      else defect("objective-restated-differently", rel, it.line + 1, `"${it.text.trim()}" is not an approved objective of ${ch}; restate the approved wording (${chs.map((c) => `concepts/${c}.md`).join(" or ")})`);
    }
    if (own) for (const [key, n] of approved) if (!restated.has(key))
      defect("objective-not-restated", rel, sections[0].line + 1, `${n.id || n.text}: the Learning objectives section does not restate this approved objective of ${ch} ("${n.text}")`);
  }
  return out;
}

export function approvalCoreProblems(root, reader) {
  const chapters = manifestChapters(reader);
  return approvalProblems(approvalStatus(reader, chapters, readLogText(root)), chapters);
}

/**
 * The D39 blind review's "wrong" concerns, at the gate (red team R3, control C4-02 / coherence F6): a concern the
 * current spine review raises about a changed plan line is the instructor's question, in the digest, while that review
 * is current (until the next full approval) — never only in `spine.mjs preview`, which a glance skips. Questions never
 * block (operator 2026-10-02). Every current review speaks (red team R6): a concern stays, with the review that raised
 * it, whatever a later review of the same text says.
 */
export function spineReviewQuestions(root, reader, basis) {
  const out = [];
  for (const scope of ["course", ...manifestChapters(reader).map((c) => `chapter:${c}`)]) {
    let r = null; try { r = currentSpineReview(root, reader, scope); } catch { r = null; }
    for (const c of (r?.concerns || []).filter((x) => x.kind === "wrong"))
      out.push(makeFinding({ module: "skeleton", kind: "spine-review-concern", units: [], statusClass: "question", route: "digest", basis,
        evidence: { type: "judgment", scope, file: c.file, line: c.lineNo, text: c.text, note: `Possibly wrong (${c.file}, line ${c.lineNo}): "${c.text}". ${c.problem}${c.suggestion ? ` Suggested: "${c.suggestion}".` : ""}`, dispatch: c.dispatch ?? r.dispatch } }));
  }
  return out;
}

/**
 * D48 (operator 2026-10-11): the spine says what to teach, to what level and how to assess — it is not source-checked.
 * A spine line that carries more — numerical data, an explanation or derivation, an attribution or history (as D49
 * calibrated it: a named equation and a chapter summary are what to teach; spine_detail.mjs) — is the instructor's question, in the digest: the agent suggests removing the detail from the spine and
 * placing it in the study guide, at the section that teaches the line's objective or concept. Questions never block.
 */
export function spineDetailQuestions(root, reader, basis) {
  let units = [];
  try { units = loadUnits(root, reader); } catch { units = []; }
  return spineDetailLines(reader, manifestChapters(reader), { units }).map((d) => makeFinding({ module: "skeleton", kind: "detail-in-spine", units: [], statusClass: "question", route: "digest", basis,
    evidence: { type: "rule", rule: "the spine says what to teach, to what level and how to assess; detail belongs in the study guide (D48)", file: d.file, line: d.line, text: d.text,
      detail: d.detail, target: d.target, note: spineDetailNote(d) },
    recommendation: `Move the detail of ${d.file} line ${d.line} into ${d.target.section ? `${d.target.deliverable} ("${d.target.section}")` : d.target.deliverable}, and keep the spine line to what to teach — or keep it, as the instructor decides.` }));
}
