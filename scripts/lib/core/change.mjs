// How big is a spine change? (D16, D19-F, D21.) Compares two parsed chapter spines (or two course maps):
//   none        — identical;
//   light       — every node and anchor kept, and the WORDING unchanged: only whitespace, markup, punctuation and
//                 letter case differ (a reflow, a comma, bold to italic) → a glance confirmation;
//   rephrasing  — words changed, but every value, name, number, symbol, negation and direction word kept, in order →
//                 a glance, but only after the D39 blind review of the changed lines has said each one says the same as
//                 the approved text (D43, operator 2026-10-07). No word list can tell a rephrase from a reversal ("added
//                 at constant volume" → "at constant pressure": red team R2 coherence F4), so the reviewer decides, and
//                 an unclear answer is a change (approvals.mjs). A glance re-baselines every dependent unit;
//   substantive — anything else within the version (sub-concept added or removed, depth, guidance, a new
//                 objective, a reorder of items) → full re-approval with diff and impact;
//   structural  — identity cannot be carried (an objective appears to be split or merged; objectives moved
//                 between chapters; the course's chapter list or order changed) → a new major version (D15).
// When unsure, it is substantive: every rule below errs away from "light".

import { lightKey, readerView, renderedParts } from "./rendered.mjs";
export { lightKey, readerView };

/** The change kinds a glance confirmation may record (D43): a rephrasing only once its blind review found the meaning kept. */
export const GLANCE_KINDS = ["light", "rephrasing"];

const NEGATION = /\b(?:not|no|never|none|neither|nor|without|cannot|can't|doesn't|don't|isn't|aren't|won't|nothing)\b/gi;
/** The tokens a light change must not touch: numbers (with units), capitalized names, symbols, negations. */
export function factTokens(text) {
  const t = String(text || "");
  const nums = t.match(/[−-]?\d+(?:[.,]\d+)?(?:\s*(?:°C|K|kJ|J|mol|M|atm|bar|Pa|kPa|g|kg|mg|L|mL|%|s|min|h))?/g) || [];
  const names = t.match(/\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*\b/g) || [];
  const symbols = t.match(/[A-Za-z]*[ΔΣ⇌→←°±≤≥≠×÷√∞∂∫]+[A-Za-z0-9°]*/g) || [];
  const neg = (t.match(NEGATION) || []).map((x) => x.toLowerCase());
  // a capital after a colon opens a clause as one after a full stop does ("Note: The gas …"; red-team round 6, control
  // C4 probe: it was read as a name, so recasing it was a fact change)
  const sentenceStarts = new Set((t.match(/(?:^|[.!?:]\s+)([A-Z][a-z]+)/g) || []).map((x) => x.replace(/^[.!?:\s]+/, "")));
  const keep = (n) => !sentenceStarts.has(n);
  return [...nums.map((x) => x.replace(/\s+/g, "")), ...names.filter(keep), ...symbols, ...neg].sort();
}

/**
 * The wording an answer is bound to its question by, and a spine change is light only when it is unchanged (R1 F2,
 * R2 F4, R4 F5/F8): THE LIGHT KEY of the reader view (rendered.mjs) — no private normalisation here (red team R5, cause
 * 1). Struck text is gone, every sign, relation, arrow and operator is a word, and typesetting-only TeX is nothing:
 * "~~held at constant volume~~" changes the question an answer answers, "K ↓" → "K ↑" is not light, and
 * "\text{K}" → "{\text{K}}" changes nothing.
 */
export function questionWording(text) {
  return lightKey(text);
}
/**
 * The binding key before red team R4 (lowercase, markup and punctuation folded, < > = + − kept as words, struck text
 * KEPT). Only read to migrate stamps written with it (dependencies.mjs legacyQuestionCurrent), never to bind.
 */
export function legacyQuestionWording(text) {
  return String(text || "").toLowerCase()
    .replace(/≤|\\leq?\b/g, " le ").replace(/≥|\\geq?\b/g, " ge ").replace(/≠|\\neq?\b/g, " ne ")
    .replace(/<(?!-)/g, " lt ").replace(/(?<!-)>/g, " gt ").replace(/[−-](?=\s*\d)/g, " minus ").replace(/\+/g, " plus ").replace(/=/g, " eq ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// the words that say which way something goes: a rephrase keeps them, a reversal does not (P11 wiring sweep: a question
// changed from "raised" to "lowered" left its answer looking current). Used for what depends on a question, never for
// evidence, whose binding stays factHash.
const DIRECTION = /\b(?:rais(?:e|es|ed|ing)|lower(?:s|ed|ing)?|increas(?:e|es|ed|ing)|decreas(?:e|es|ed|ing)|add(?:s|ed|ing)?|remov(?:e|es|ed|ing)|higher|more|less|fewer|forward|reverse|backward|left|right|endothermic|exothermic|absorb(?:s|ed)?|releas(?:e|es|ed)|heat(?:ed|ing)|cool(?:s|ed|ing)?|compress(?:es|ed|ing)?|expand(?:s|ed|ing)?|products?|reactants?)\b/gi;
export function meaningTokens(text) {
  return [...factTokens(text), ...(String(text || "").match(DIRECTION) || []).map((x) => x.toLowerCase())].sort();
}

// a swap of direction words reverses a statement without touching a fact token (C4-13): a spine change compares the
// meaning tokens AND the order of the direction words ("fewer … more" → "more … fewer" keeps the sorted multiset)
const directions = (t) => (String(t || "").match(DIRECTION) || []).map((x) => x.toLowerCase());
/** The direction words of a text, in order (read on the reader view by a caller that binds what a reader saw). */
export const directionWords = directions;
// the same facts: the fact and direction tokens, and the direction words in order. A change that keeps them but not the
// words is a rephrasing (D43); one that does not is substantive.
//
// Red team R3 (coherence F6, control C4-02): the "light" key was lossy. A spine change is judged on the words a reader
// SEES: struck-through text (`~~…~~`, <del>, <s>, <strike>), comments and hidden elements are dropped before comparing
// (they are not markup — "does ~~not~~ shift" renders as "does shift"); and every sign (−, -, +, ±, ∓) is a word and a
// fact, so "ΔG° = −RT ln K" → "ΔG° = RT ln K" is never light. A hyphen inside a word ("gas-phase"), a list bullet and a
// rule (---) are punctuation. What a reader sees is the reader view (rendered.mjs), the one view every binding reads.
/** A text as a reader sees it (struck-through, commented-out and hidden words dropped): the reader view. */
export const visibleText = (text) => readerView(text);
// a sign: −, ±, ∓ (and LaTeX \pm, \mp) anywhere; + anywhere; - unless it joins two letters (a hyphen), starts a list
// item, or is part of a rule, an arrow or a run (---, ->, <-)
const SIGN = /[−±∓+]|\\pm\b|\\mp\b|(?<![\p{L}\-<])-(?![\-\p{L}>])|(?<![\p{L}\-<])-(?=\p{L})|(?<=\p{L})-(?![\p{L}\->])/gu;
const signsOf = (t) => String(t || "").split("\n").map((l) => l.replace(/^\s*[-*+]\s+/, " ").replace(/^\s*-{3,}\s*$/, " ")).join("\n").match(SIGN) || [];
/**
 * A spine text's wording for the light test (R4 F8, C4-01: inverted). Light means old and new differ ONLY by whitespace,
 * `*`/`_` emphasis, list markers, letter case, and prose punctuation that is not a sign, relation, arrow or operator —
 * compared on the RENDERED text (a word moved into a link destination is gone). Every other character change is at
 * least a rephrasing, which needs the D43 meaning review.
 */
export function spineWording(text) {
  return lightKey(text);
}
// the signs, relations, arrows and operators a reader sees, in order (R4 F8, C4-01): a change among them reverses or
// alters a statement whatever its words say ("T ↑ ⇒ K ↓" → "K ↑", "K ≫ 1" → "K ≪ 1", "Fe³⁺" → "Fe³⁻", "–RT" → "RT",
// \ce{A -> B} → \ce{A <- B}, "a/b" → "a*b", "K_c" → "K^c") — so it is substantive, never a rephrasing to glance
const OPERATOR = /->|<-|<=>|<->|[<>=≤≥≠≈≪≫⩽⩾⇌⇋⇄→←↔⇒⇐⇔⟶⟵⟷↑↓↗↘⇑⇓/×÷*^_±∓+−–‒－﹣⁻⁺₋₊]|\\(?:pm|mp|times|div|cdot|to|gets|rightarrow|leftarrow|leftrightarrow|rightleftharpoons|leftrightharpoons|Rightarrow|Leftarrow|uparrow|downarrow|ll|gg|leq?|geq?|neq?|approx|ominus|oplus)(?![A-Za-z])/g;
const operatorsOf = (t) => String(t || "").match(OPERATOR) || [];
const sameFacts = (a, b) => { const A = readerView(a), B = readerView(b);
  return JSON.stringify(meaningTokens(A)) === JSON.stringify(meaningTokens(B)) && JSON.stringify(directions(A)) === JSON.stringify(directions(B)) && JSON.stringify(signsOf(A)) === JSON.stringify(signsOf(B))
    && JSON.stringify(operatorsOf(A)) === JSON.stringify(operatorsOf(B)) && JSON.stringify(scriptsOf(a)) === JSON.stringify(scriptsOf(b)); };
// markdown sub- and superscripts (H~2~O, 10^3^), in order: a subscript turned superscript is an operator change
const scriptsOf = (t) => renderedParts(t).filter((p) => p.kind === "mark").map((p) => p.text);
const sameWords = (a, b) => spineWording(a) === spineWording(b);
const wording = (a, b, what) => (!sameFacts(a, b) ? { kind: "substantive", why: `${what} changed (a value, name, number, sign, negation or direction)` }
  : !sameWords(a, b) ? { kind: "rephrasing", why: `${what} reworded (the same values, names, signs, negations and directions)` } : null);
const words = (t) => new Set(String(t || "").toLowerCase().match(/[a-z]{4,}/g) || []);
const overlap = (a, b) => { const A = words(a), B = words(b); let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.max(1, Math.min(A.size, B.size)); };

/**
 * @param {object} before  { nodes: [{id, anchor, kind, text, prereqs}], entries: [{id, objective, type, count, levels, targets, title}] }
 * @param {object} after   same shape
 * @param {object} [o]     { beforeText, afterText } raw documents, to catch edits outside parsed items
 */
export function classifyChapterChange(before, after, o = {}) {
  if (o.beforeText !== undefined && o.beforeText === o.afterText) return { kind: "none", reasons: [] };
  const reasons = [];
  const bN = new Map(before.nodes.map((n) => [n.id, n])), aN = new Map(after.nodes.map((n) => [n.id, n]));
  const removed = [...bN.keys()].filter((k) => !aN.has(k)), added = [...aN.keys()].filter((k) => !bN.has(k));
  // structural: an objective looks split (one removed, several added that overlap it) or merged (the reverse)
  const objRemoved = removed.filter((k) => bN.get(k).kind === "objective"), objAdded = added.filter((k) => aN.get(k).kind === "objective");
  for (const r of objRemoved) {
    const heirs = objAdded.filter((a) => overlap(bN.get(r).text, aN.get(a).text) >= 0.5);
    if (heirs.length >= 2) reasons.push({ kind: "structural", why: `${r} appears split into ${heirs.join(", ")}` });
  }
  for (const a of objAdded) {
    const parents = objRemoved.filter((r) => overlap(bN.get(r).text, aN.get(a).text) >= 0.5);
    if (parents.length >= 2) reasons.push({ kind: "structural", why: `${parents.join(", ")} appear merged into ${a}` });
  }
  if (removed.length || added.length) reasons.push({ kind: "substantive", why: `nodes removed: ${removed.join(", ") || "none"}; added: ${added.join(", ") || "none"}` });
  const order = (m) => [...m.values()].map((n) => n.id).join("|");
  if (!removed.length && !added.length && order(bN) !== order(aN)) reasons.push({ kind: "substantive", why: "items were reordered" });
  for (const [id, b] of bN) {
    const a = aN.get(id); if (!a) continue;
    if (JSON.stringify([...b.prereqs].sort()) !== JSON.stringify([...a.prereqs].sort())) reasons.push({ kind: "substantive", why: `${id}: prerequisites changed` });
    const w = wording(b.text, a.text, `${id}: its text`); if (w) reasons.push(w);
  }
  const bE = new Map(before.entries.map((e) => [e.id, e])), aE = new Map(after.entries.map((e) => [e.id, e]));
  for (const k of [...bE.keys()].filter((k) => !aE.has(k))) reasons.push({ kind: "substantive", why: `guide entry ${k} removed` });
  for (const k of [...aE.keys()].filter((k) => !bE.has(k))) reasons.push({ kind: "substantive", why: `guide entry ${k} added` });
  for (const [id, b] of bE) {
    const a = aE.get(id); if (!a) continue;
    for (const f of ["objective", "type", "count", "levels", "targets"]) if (String(b[f] ?? "") !== String(a[f] ?? "")) reasons.push({ kind: "substantive", why: `${id}: ${f} changed` });
  }
  // edits outside parsed items (key terms, summary, scope, guide prose, rubrics): light only if no word changed; a
  // rephrasing if only words changed
  if (o.beforeText !== undefined) { const w = wording(o.beforeText, o.afterText, "the document's prose or key terms"); if (w) reasons.push(w); }
  const kind = reasons.some((r) => r.kind === "structural") ? "structural" : reasons.some((r) => r.kind === "substantive") ? "substantive" : reasons.length ? "rephrasing" : "light";
  return { kind, reasons };
}

/** Course-map changes: a change to the chapter list or order is structural (D16, D19-F). */
export function classifyCourseChange(before, after, o = {}) {
  if (o.beforeText !== undefined && o.beforeText === o.afterText) return { kind: "none", reasons: [] };
  if (JSON.stringify(before.chapterSequence) !== JSON.stringify(after.chapterSequence))
    return { kind: "structural", reasons: [{ kind: "structural", why: "the chapter list or order changed" }] };
  const r = classifyChapterChange({ nodes: before.nodes, entries: [] }, { nodes: after.nodes, entries: [] }, o);
  return r;
}
