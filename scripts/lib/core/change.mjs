// How big is a spine change? (D16, D19-F, D21.) Compares two parsed chapter spines (or two course maps):
//   none        — identical;
//   light       — every node and anchor kept, and the WORDING unchanged: only whitespace, markup, punctuation and
//                 letter case differ (a reflow, a comma, bold to italic) → a glance confirmation. No word list can tell a
//                 rephrase from a reversal ("added at constant volume" → "added at constant pressure": red team R2
//                 coherence F4, after R1 C4-13 and R1 F2), so any change of the words themselves is substantive — as an
//                 answer's question is bound to its full wording (R1 F2). A glance re-baselines every dependent unit, so
//                 it is kept for edits that cannot change what a line says;
//   substantive — anything else within the version (sub-concept added or removed, depth, guidance, a new
//                 objective, a reorder of items) → full re-approval with diff and impact;
//   structural  — identity cannot be carried (an objective appears to be split or merged; objectives moved
//                 between chapters; the course's chapter list or order changed) → a new major version (D15).
// When unsure, it is substantive: every rule below errs away from "light".

const NEGATION = /\b(?:not|no|never|none|neither|nor|without|cannot|can't|doesn't|don't|isn't|aren't|won't|nothing)\b/gi;
/** The tokens a light change must not touch: numbers (with units), capitalized names, symbols, negations. */
export function factTokens(text) {
  const t = String(text || "");
  const nums = t.match(/[−-]?\d+(?:[.,]\d+)?(?:\s*(?:°C|K|kJ|J|mol|M|atm|bar|Pa|kPa|g|kg|mg|L|mL|%|s|min|h))?/g) || [];
  const names = t.match(/\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*\b/g) || [];
  const symbols = t.match(/[A-Za-z]*[ΔΣ⇌→←°±≤≥≠×÷√∞∂∫]+[A-Za-z0-9°]*/g) || [];
  const neg = (t.match(NEGATION) || []).map((x) => x.toLowerCase());
  const sentenceStarts = new Set((t.match(/(?:^|[.!?]\s+)([A-Z][a-z]+)/g) || []).map((x) => x.replace(/^[.!?\s]+/, "")));
  const keep = (n) => !sentenceStarts.has(n);
  return [...nums.map((x) => x.replace(/\s+/g, "")), ...names.filter(keep), ...symbols, ...neg].sort();
}

/**
 * A text's wording, normalized: lowercase, with whitespace, markup and punctuation folded — but relation and sign
 * symbols kept as words, so "Q < K" and "Q > K" differ. An answer is bound to its question by this (red team R1
 * coherence, F2: a reversal through words outside any fixed list — "halved" → "doubled" — passed as a null edit), and
 * a spine change is light only when this is unchanged (R2 F4).
 */
export function questionWording(text) {
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
// light only when the words are the same words, in the same order (R2 F4); the fact and direction tokens are kept as
// a second, redundant check
const sameTokens = (a, b) => questionWording(a) === questionWording(b) && JSON.stringify(meaningTokens(a)) === JSON.stringify(meaningTokens(b)) && JSON.stringify(directions(a)) === JSON.stringify(directions(b));
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
    if (!sameTokens(b.text, a.text)) reasons.push({ kind: "substantive", why: `${id}: its wording changed (a word, value, name, number, negation or direction)` });
  }
  const bE = new Map(before.entries.map((e) => [e.id, e])), aE = new Map(after.entries.map((e) => [e.id, e]));
  for (const k of [...bE.keys()].filter((k) => !aE.has(k))) reasons.push({ kind: "substantive", why: `guide entry ${k} removed` });
  for (const k of [...aE.keys()].filter((k) => !bE.has(k))) reasons.push({ kind: "substantive", why: `guide entry ${k} added` });
  for (const [id, b] of bE) {
    const a = aE.get(id); if (!a) continue;
    for (const f of ["objective", "type", "count", "levels", "targets"]) if (String(b[f] ?? "") !== String(a[f] ?? "")) reasons.push({ kind: "substantive", why: `${id}: ${f} changed` });
  }
  // edits outside parsed items (key terms, summary, scope, guide prose, rubrics): light only if no word changed
  if (o.beforeText !== undefined && !sameTokens(o.beforeText, o.afterText)) reasons.push({ kind: "substantive", why: "the wording of the document's prose or key terms changed (a word, value, name, number, negation or direction)" });
  const kind = reasons.some((r) => r.kind === "structural") ? "structural" : reasons.length ? "substantive" : "light";
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
