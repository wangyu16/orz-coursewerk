// What a unit depends on (redesign P5; Coherence H1; D19-H). Every edge is mechanical, so impact is complete for
// these kinds (H1): shared values, the question an answer belongs to, key terms the unit uses, the spine nodes it
// serves and the prerequisites those nodes declare, and its sources. Each dependency target has a hash; a unit is
// stamped with those hashes when it is written or re-verified, and is stale when any of them moves.
//
// Unit-to-unit dependencies hash the target's FACT TOKENS, not its wording (D17, D19-C): a rephrase of a neighbour
// leaves dependents alone; a changed value, name, number or negation makes them stale. Every binding of a dependent to
// what another unit SAYS reads the reader view (rendered.mjs; red team R5): `unit:` the fact tokens a reader sees,
// `question:`/`ref:` the reader view's light key. The one exception is an
// answer's question: the answer is bound to the question's id AND its full normalized wording (`question:` target,
// R1 coherence F2), since no fixed word list can tell a rephrase from a reversal ("halved" → "doubled"); a reworded
// question costs its answer a cheap blind re-check, routed to the agent.
//
// Edges are not lexical guesses (red team R2 coherence): an answer belongs to the question its LABEL names ("Answer 6"
// ↔ "Q 6"), by position only when there are no labels (F13); a question or answer named by number ("the answer to
// Q3", "Problem 3") is a dependency, bound to its full wording — the knowledge review resolves the same references
// with the same functions (F3); key terms match their declared aliases in LaTeX spellings too ($Q_r$, Q_{r},
// \mathrm{Q_r}) — folded as bindings() folds them (F12).
import { canonicalJson, sha256 } from "../records/canonical.mjs";
import { factTokens, legacyQuestionWording, questionWording, readerView } from "./change.mjs";
import { lightKeyR4, printedChars, renderedParts } from "./rendered.mjs";
import { nodeIndex } from "./spine.mjs";
import { parseNumber, plainForQuantities, readValues, valueProse, valuesIn } from "./values.mjs";

// factHash is an EVIDENCE key (D17): what a semi-mechanical check admitted, and what an instructor confirmed, are bound
// to the facts the source states. It is not what a dependent is bound to (unitTargetHash, below).
export const factHash = (text) => sha256(canonicalJson(factTokens(text)));
// The reader view with each formula as its TeX source (fact tokens read numbers, signs and symbols from the source,
// where "-92" is one token; the typeset form spaces them).
const factView = (raw) => renderedParts(raw).map((p) => (p.kind === "math" ? ` $${p.text}$ ` : p.kind === "mark" || p.kind === "hint" ? "" : p.kind === "prose" ? printedChars(p.seen) : p.text)).join("").replace(/[ \t]+/g, " ").replace(/ *\n+ */g, "\n").trim();
/**
 * What a unit's dependents are bound to (`unit:` target): READER-VIEW based (red team R5, cause 1). The fact tokens
 * (values, names, numbers, symbols, negations) of the text as a reader sees it — a struck negation ("does ~~not~~
 * shift") or a value moved into a link destination moves it, a value in a comment does not. Prefixed "v:"; a stamp
 * written with the source key (no prefix) migrates (unitStampCurrent).
 */
export const unitTargetHash = (text) => `v:${sha256(canonicalJson(factTokens(factView(text))))}`;
/**
 * A `unit:` stamp written with the source key (factHash) is current when the text is unchanged under BOTH keys: its
 * source hash still matches, and the source states the same fact tokens a reader sees (nothing struck, hidden or in a
 * link destination carries a fact; markup moves no sentence start). Otherwise its dependent owes one re-check.
 */
export const unitStampCurrent = (stamped, text) => typeof stamped === "string" && /^[0-9a-f]{64}$/.test(stamped) && stamped === factHash(text)
  && canonicalJson(factTokens(text)) === canonicalJson(factTokens(factView(text)));
const QUANTITY = /[−-]?\d+(?:[.,]\d+)?\s*(?:°C|K\b|kJ|J\b|mol|M\b|atm|bar|Pa|kPa|g\b|kg|mg|L\b|mL|%)/g;
// Quantities are found after folding LaTeX spellings ("-92\\ \\text{kJ mol}^{-1}" → "-92 kJ mol"), since the
// packages write most values in LaTeX; a value written two ways is still one shared value.
// (plainForQuantities lives in core/values.mjs, beside the one value parser that also reads bindings; re-exported)
export { plainForQuantities };
// …and every value the one value reader reads (core/values.mjs readValues — the claim extractor's own; red-team round 6,
// cause A: "−92.2\\ \\textrm{kJ}" stated the guide's value to the claim reader but shared nothing here)
const quantities = (text) => [...new Set([...(plainForQuantities(text).match(QUANTITY) || []).map((q) => q.replace(/\s+/g, "")),
  ...readValues(text).filter((q) => q.unit !== "unread" && q.unit !== "1").map((q) => `v:${q.value}|${q.unit}`)])];
export { quantities };

// A unitless value bound to a symbol ("K = 50", "Q_r = 50", "pH = 7", "K_c = 4.0") is a shared value too: two units
// stating the same binding depend on each other (red team R1 coherence, F11: Q7 "for the same reaction (K = 50)" was
// never found when Q6's K changed). A chain "Q_r = K = 50" binds every symbol in it. The binding is read as the value
// parser reads it (core/values.mjs) as well: "whose K is 50", "K of 50", "K equals 50", "K ≈ 50" bind K to 50 exactly
// as "K = 50" does (red team R2 coherence, F7). A binding's key is its symbol without subscript marks and its number
// as a number ("K_c = 4.0" and "Kc is 4" are one binding).
const UNIT_AFTER = /^\s*(?:°C|K\b|kJ|J\b|mol|M\b|atm|bar|Pa|kPa|g\b|kg|mg|L\b|mL|%)/;
const BINDING = /((?:\b[A-Za-z][A-Za-z]?(?:_[A-Za-z0-9,]+)?\s*=\s*)+)([−-]?\d+(?:[.,]\d+)?)/g;
// A binding's symbol is read as its FAMILY (red team R3 coherence, F5): "K", "K_{eq}", "K_c", "K_\mathrm{eq}", "Keq"
// are one symbol — a capital letter and its subscript — so "$K_{eq} = 50$" and "K = 50" are one shared value. No rule
// can tell a renamed K_eq from a different K_p soundly, so they fold too: an extra edge costs a cheap re-check, a
// missing one a silent contradiction. A symbol that does not start with a capital ("pH") is kept whole.
export const symbolFamily = (sym) => { const s = String(sym).replace(/\\(?:mathrm|text|rm|mathit)\b/g, "").replace(/[_{}\s]/g, ""); return /^[A-Z][a-z0-9,]*$/.test(s) ? s[0] : s; };
const bindingKey = (sym, value) => `${symbolFamily(sym)}=${String(parseNumber(String(value)))}`;
export function bindings(text) {
  const plain = plainForQuantities(text).replace(/_\s*\{?\s*([A-Za-z0-9,]+)\s*\}?/g, "_$1");
  const out = new Set();
  for (const m of plain.matchAll(BINDING)) {
    if (UNIT_AFTER.test(plain.slice(m.index + m[0].length))) continue; // a quantity with a unit: QUANTITY covers it
    for (const sym of m[1].split("=").map((x) => x.replace(/\s+/g, "")).filter(Boolean)) out.add(bindingKey(sym, m[2]));
  }
  for (const v of valuesIn(valueProse(text))) if (v.symbol && v.unit === "1") out.add(bindingKey(v.symbol, String(v.value)));
  return [...out];
}

export { questionWording };
// The binding hash of a question (and of a unit named by number): READER-VIEW based (red team R4 F5, R5 cause 1). It
// is the light key of the reader view (rendered.mjs): what a student sees, struck/hidden/link-destination text gone,
// every sign, relation, arrow and operator kept, maths as typeset — so striking a question's condition reaches its
// answer, and a TeX regrouping that prints the same (R5 F5, "\text{K}" → "{\text{K}}") does not. Hashes carry a
// prefix naming the key: "q3:" (R5); a stamp value written with an earlier key is migrated (questionStampCurrent).
export const questionHash = (text) => `q3:${sha256(questionWording(text))}`;
/** The R4 binding hash ("q2:"): FROZEN, only read to migrate stamps written with it. */
export const questionHashR4 = (text) => `q2:${sha256(lightKeyR4(text))}`;
export const legacyQuestionHash = (text) => sha256(legacyQuestionWording(text));
export const isLegacyQuestionHash = (h) => typeof h === "string" && /^[0-9a-f]{64}$/.test(h);
export const isR4QuestionHash = (h) => typeof h === "string" && /^q2:[0-9a-f]{64}$/.test(h);
// what the pre-R4 key read exactly as the new key does: letters and digits; prose punctuation both fold; < > = + ≤ ≥ ≠
// (both read them as words); a hyphen joining two letters; a minus before a digit
const SAFE_PROSE = /^(?:[\p{L}\p{N}\s.,;:!?'"‘’“”«»()[\]{}…—·•<>=+≤≥≠]|(?<=\p{L})-(?=\p{L})|[-−](?=\s*\p{N}))*$/u;
const SAFE_MATH = /^(?:[\p{L}\p{N}\s<>=+≤≥≠]|[-−](?=\s*\p{N}))*$/u;
// the reader view as R4 read it (maths as its TeX source): what the pre-R4 key's migration was defined against
const sourceView = (raw) => renderedParts(raw).map((p) => (p.kind === "math" ? ` $${p.text}$ ` : p.kind === "mark" || p.kind === "hint" ? "" : p.text)).join("").replace(/[ \t]+/g, " ").replace(/ *\n+ */g, "\n").trim();
/**
 * The one-time migration of a question binding written with the pre-R4 key (F5): such a stamp value is current only
 * when the text is unchanged under BOTH keys — its old-key hash still matches, and the text holds nothing the old key
 * folded that the new key reads (struck, hidden or link-destination text; a sign, arrow or operator other than
 * < > = +; a minus not before a digit; TeX commands, sub- and superscripts). Otherwise the dependent owes one re-check:
 * the old key cannot say whether what it folded changed.
 */
export function legacyQuestionCurrent(stamped, text) {
  if (!isLegacyQuestionHash(stamped) || stamped !== legacyQuestionHash(text)) return false;
  const raw = String(text ?? "");
  if (/~~|<\/?(?:del|s|strike)\b|<!--|\]\(|\]\[|<[a-z][^>]*(?:hidden|display\s*:|visibility)|\\/i.test(raw)) return false;
  const parts = renderedParts(raw);
  if (parts.some((p) => p.kind === "mark" || p.kind === "hint" || p.kind === "code")) return false;
  return parts.every((p) => (p.kind === "math" ? SAFE_MATH : SAFE_PROSE).test(p.text))
    && legacyQuestionWording(raw) === legacyQuestionWording(sourceView(raw).replace(/\$/g, " "))
    && r4ReadsAsR5(raw);
}
// What the R4 key ("q2:") read differently from the R5 key, so that "unchanged under R4" would not imply "unchanged
// under R5": an invisible format character (R4 read it as a token, R5 drops it), a text not in Unicode NFC, an entity
// in raw HTML (R4 read "&lt;" as letters, R5 as "<"), and a TeX command whose case names another symbol (R4 folded
// "\Rightarrow" into "\rightarrow"; R5 keeps them apart). Everywhere else the R5 light key is a function of the R4 key
// (it folds what R4 folded — letter case, punctuation, markup — and more: typesetting-only TeX), so a text unchanged
// under R4 is unchanged under R5.
const CASE_NAMED = /\\(?!(?:var)?(?:Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)(?![A-Za-z]))[A-Za-z]*[A-Z]/;
function r4ReadsAsR5(raw) {
  if (/[­᠎​-‏⁠-⁤﻿]/.test(raw) || raw.normalize("NFC") !== raw) return false;
  // round 6: an HTML sub/superscript and a style marker are read by R5+ keys only (rendered.mjs), so R4 read them differently
  return renderedParts(raw).every((p) => p.kind !== "hint" && !p.html && (p.kind !== "prose" || p.seen === p.text) && (p.kind !== "math" || !CASE_NAMED.test(p.text)));
}
/**
 * A question binding written with the R4 key ("q2:") is current when the text is unchanged under BOTH keys: its R4
 * hash still matches, and the text holds nothing R4 read differently from R5 (r4ReadsAsR5). Then the R5 key is
 * unchanged too, and the stamp is upgraded with no re-check; otherwise the dependent owes one re-check.
 */
export function r4QuestionCurrent(stamped, text) {
  return isR4QuestionHash(stamped) && stamped === questionHashR4(text) && r4ReadsAsR5(String(text ?? ""));
}
/** Is a stamped question/reference binding, written with ANY earlier key, current for the text as it is now? */
export const questionStampCurrent = (stamped, text) => r4QuestionCurrent(stamped, text) || legacyQuestionCurrent(stamped, text);

/** Math spellings folded to plain words: "$Q_r$", "Q_{r}", "\\mathrm{Q_r}" → "Qr" (as bindings() reads symbols). */
export const foldMath = (text) => plainForQuantities(text).replace(/\\[A-Za-z]+/g, " ").replace(/_\s*([A-Za-z0-9]+)/g, "$1");
const escapeForm = (l) => l.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['’]/g, "['’]").replace(/\s+/g, "\\s+");
const formsPattern = (forms, flags) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${forms.map(escapeForm).join("|")})(?:e?s)?(?![\\p{L}\\p{N}])`, flags);
/** A key term's label as a pattern: its plural (s/es), either apostrophe, and any declared alias (F8). */
export function termPattern(t) {
  return formsPattern([t.label, ...(t.aliases || [])].filter((l) => String(l || "").trim()), "iu");
}
/**
 * Does a text use a key term (R2 F12)? Its label and long aliases in any case; a short alias (a symbol such as "K" or
 * "Qr") in its own case only, so "k" is not "K"; each also in the text's math spellings folded ("$Q_r$" → "Qr").
 */
export function termMatcher(t) {
  const forms = [t.label, ...(t.aliases || [])].map((l) => String(l || "").trim()).filter(Boolean);
  const folded = [...new Set(forms.flatMap((f) => [f, foldMath(f).replace(/\s+/g, " ").trim()]).filter(Boolean))];
  const long = folded.filter((f) => f.length > 3), short = folded.filter((f) => f.length <= 3);
  const res = [long.length && formsPattern(long, "iu"), short.length && formsPattern(short, "u")].filter(Boolean);
  // read on the text as written AND as a reader sees it (red team R4 coherence F1): "**Endothermic** reaction" is a use
  // of "endothermic reaction" — emphasis, links and markup gone
  return (text) => { const raw = String(text || ""), seen = readerView(raw); return [raw, foldMath(raw), seen, foldMath(seen)].some((t) => res.some((re) => re.test(t))); };
}

// ---- numbered questions ----------------------------------------------------------------------------------------
// A label's number: "Q 6", "Question 6", "Problem 3", "Answer 6 (continued)", "Solution 2", "Worked example 1".
const LABEL_NUMBER = /^\s*(?:q|question|problem|exercise|worked example|example|answer|solution|worked answer)\s*(\d+)\b/i;
export const labelNumber = (label) => LABEL_NUMBER.exec(String(label || ""))?.[1] ?? null;
// A reference by number in running text (R2 F3; every spelling, red team R3 coherence F3): "Q3", "Q 3", "Q.3",
// "Question 3", "Question #3", "Questions 3 and 4", "questions 3–5", "Q3–Q5", "question three", "item 3", "Ex. 3",
// "Exercise 3", "Problem #3", "Prob. 3", "No. 3" after a noun, "Example 2", "Answer 3", "Solution 3". A list or range
// names every number in it; number words are read up to twenty. Fail toward an edge: a reference read too often costs
// a cheap re-check, one missed a silent contradiction.
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const NUM = `(?:\\d+|${NUMBER_WORDS.join("|")})`;
const NOUN = "(?:q|qq|questions?|problems?|probs?|exercises?|exs?|items?|examples?|worked examples?|answers?|solutions?|parts?)";
const SEP = "\\s*(?:\\.\\s*|#\\s*|no\\.?\\s*|number\\s+)?";
const LIST_JOIN = "\\s*(?:,\\s*(?:and\\s+|or\\s+|&\\s*)?|\\s+and\\s+|\\s+or\\s+|\\s*&\\s*|\\s*(?:[-–—]|to|through|thru)\\s*)" + `(?:${NOUN}${SEP})?`;
const REFERENCE = new RegExp(`(?<![\\p{L}\\p{N}])${NOUN}${SEP}(${NUM}(?:\\s*\\([a-z]\\))?(?:${LIST_JOIN}${NUM}(?:\\s*\\([a-z]\\))?)*)(?![\\p{L}\\p{N}]|[.,]\\d)`, "giu");
const numberOf = (w) => { const n = /^\d+$/.test(w) ? Number(w) : NUMBER_WORDS.indexOf(w.toLowerCase()); return n >= 0 ? n : null; };
export function referencedNumbers(text) {
  const out = new Set();
  for (const m of String(text || "").matchAll(REFERENCE)) {
    const parts = [...m[1].matchAll(new RegExp(`(${NUM})|([-–—]|\\bto\\b|\\bthrough\\b|\\bthru\\b)`, "giu"))];
    let prev = null, range = false;
    for (const p of parts) {
      if (p[2]) { range = prev != null; continue; }
      const n = numberOf(p[1]); if (n == null) continue;
      if (range && prev != null && n > prev && n - prev <= 40) for (let k = prev + 1; k < n; k++) out.add(String(k));
      out.add(String(n)); prev = n; range = false;
    }
  }
  return [...out];
}
const sameDeliverable = (units, u) => units.filter((v) => v.locator.deliverable === u.locator.deliverable);
// the units a number names, in a unit's deliverable: its own section first, else anywhere in the deliverable
function numbered(units, u, n, forms) {
  const all = sameDeliverable(units, u).filter((v) => forms.includes(v.form) && labelNumber(v.label) === n);
  const here = all.filter((v) => v.locator.section === u.locator.section);
  return here.length ? here : all;
}
/**
 * The question(s) an answer answers (F13): the question(s) its label's number names ("Answer 6" → "Q 6", and
 * "Q 6 (continued)" if the question is in two pieces); by position — the nearest question before it in its
 * deliverable — only when the answer's label has no number, or no question carries it. A label beats position.
 */
export function questionsOf(units, u) {
  if (u.form !== "answer") return [];
  const n = labelNumber(u.label);
  if (n) { const byLabel = numbered(units, u, n, ["question"]); if (byLabel.length) return byLabel; }
  const i = units.indexOf(u);
  for (let j = i - 1; j >= 0; j--) { const v = units[j]; if (v.locator.deliverable !== u.locator.deliverable) break; if (v.form === "question") return [v]; }
  return [];
}
/**
 * The units a unit refers to by number (F3): "the answer to Q3" names Q 3 and its answer. An answer also refers to
 * what its question refers to (Answer 5 justifies "the answer to Q3" as much as Q 5 asks for it). Its own number and
 * its own question are not references.
 */
export function referencedUnits(units, u, own = questionsOf(units, u)) {
  const nums = new Set([u, ...own].flatMap((x) => referencedNumbers(x.text)));
  const mine = labelNumber(u.label);
  nums.delete(mine); for (const q of own) nums.delete(labelNumber(q.label));
  const byNumber = [...nums].flatMap((n) => numbered(units, u, n, ["question", "answer"]));
  const self = new Set([u.id, ...own.map((q) => q.id)]);
  return [...byNumber, ...[u, ...own].flatMap((x) => anaphoraTargets(units, x, self)), ...figuresNamedBy(units, u)].filter((v, k, all) => v !== u && !self.has(v.id) && all.findIndex((w) => w.id === v.id) === k);
}

// A figure and the prose about it (red team R5 coherence F1): "The diagram sorts the five disturbances …" describes a
// flowchart no edge reached, so redrawing a branch left its description wrong. A unit that names a figure — "the
// figure", "this diagram", "the image", "Figure 2", a "Visual description" or alt text — is bound to the figures of its
// section (the nearest before it when its section has none; "Figure N" also to the deliverable's Nth figure), both
// ways. Failing toward an edge: one too many costs a cheap re-check, one missing a silent contradiction.
const FIGURE_NOUN = "(?:figures?|diagrams?|images?|charts?|graphs?|plots?|flow\\s?charts?|pictures?|illustrations?|schematics?|sketch(?:es)?|drawings?|visuals?|graphics?|panels?)";
const FIGURE_REF = new RegExp([
  `(?<![\\p{L}])(?:the|this|that|these|those|each|every|our|its|above|below|following|preceding|previous|next|same|accompanying)\\s+(?:\\p{L}+\\s+)?${FIGURE_NOUN}(?![\\p{L}])`,
  `(?<![\\p{L}])${FIGURE_NOUN}\\s+(?:above|below)(?![\\p{L}])`,
  "(?<![\\p{L}])(?:fig(?:ure)?s?\\.?)\\s*#?\\s*\\d+",
  "(?<![\\p{L}])(?:visual|image|figure|diagram)\\s+description(?![\\p{L}])",
  "(?<![\\p{L}])alt(?:ernative)?[- ]text(?![\\p{L}])",
].join("|"), "iu");
const FIGURE_NUMBER = /(?<![\p{L}])fig(?:ure)?s?\.?\s*#?\s*(\d+)/giu;
/** Does a text name a figure ("the diagram", "Figure 2", a visual description)? Read as a reader sees it. */
export const namesFigure = (text) => { const raw = String(text || ""); return FIGURE_REF.test(raw) || FIGURE_REF.test(readerView(raw)); };
/** The figures a unit names (see above): [unit]. */
export function figuresNamedBy(units, u) {
  if (!u?.locator || u.form === "figure" || !namesFigure(u.text)) return [];
  const mine = units.filter((v) => v.form === "figure" && v.locator.deliverable === u.locator.deliverable).sort((a, b) => a.locator.ordinal - b.locator.ordinal);
  const here = mine.filter((v) => v.locator.section === u.locator.section);
  const out = here.length ? here : mine.filter((v) => v.locator.ordinal < u.locator.ordinal).slice(-1);
  for (const m of String(readerView(u.text)).matchAll(FIGURE_NUMBER)) { const f = mine[Number(m[1]) - 1]; if (f) out.push(f); }
  return [...new Set(out)];
}

// A key term used by its distinctive word alone (red team R5 coherence F6): "Q6 … is exothermic", "**Exothermic** —",
// "the exothermic ammonia synthesis" each use "exothermic reaction" without the head noun. Within the chapter that
// defines a multi-word term (or uses it by its full name), a modifier of its label or alias (every word but the last) that no other key term's label
// or alias shares — so "reaction" and "equilibrium" never count, "exothermic", "inert", "Chatelier", "stoichiometric"
// do — is read as a use of the term (a predicate or adjective: "is exothermic", "an exothermic step"). An extra edge
// costs a cheap re-check when the term is redefined; a missing one, a unit left teaching the old definition.
const FUNCTION_WORDS = new Set(["the", "and", "for", "from", "with", "into", "onto", "over", "under", "than", "that", "this", "their", "per", "of", "in", "on", "at", "to", "by", "an", "a", "or", "not", "its", "law"]);
const wordsOf = (s) => (String(s || "").match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) || []).map((w) => w.replace(/['’]s$/iu, ""));
/** The distinctive words of a key-term definition (`def` from termDefinitions; `defs`: all of them): [word]. */
export function termHeadWords(def, defs) {
  const forms = [def.term.label, ...(def.term.aliases || [])].map((f) => String(f || "").trim()).filter(Boolean);
  const label = String(def.term.label || "").toLowerCase();
  const others = new Set(defs.filter((d) => String(d.term.label || "").toLowerCase() !== label)
    .flatMap((d) => [d.term.label, ...(d.term.aliases || [])].flatMap(wordsOf)).map((w) => w.toLowerCase()));
  const out = new Set();
  for (const f of forms) {
    const ws = wordsOf(f);
    if (ws.length < 2) continue;
    for (const w of ws.slice(0, -1)) if (/^\p{L}{4,}$/u.test(w) && !FUNCTION_WORDS.has(w.toLowerCase()) && !others.has(w.toLowerCase())) out.add(w);
  }
  return [...out];
}
/** A matcher for a definition's distinctive words (null when it has none). */
export function headWordMatcher(def, defs) {
  const ws = termHeadWords(def, defs);
  if (!ws.length) return null;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${ws.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?:['’]s)?(?![\\p{L}\\p{N}])`, "iu");
  return (text) => { const raw = String(text || ""); return re.test(raw) || re.test(readerView(raw)); };
}
const chapterOfUnit = (u) => /\/([^/]+)\.md$/.exec(u?.locator?.deliverable || "")?.[1] ?? null;

// A reference WITHOUT a number (red team R4 coherence F2): "for the same reaction", "the previous question", "the
// reaction above", "this reaction". It names the nearest question before it in its set, or the reaction it means — the
// nearest unit before it that writes a reaction. Both are edges: an extra edge costs a cheap re-check, a missing one a
// silent contradiction (Q4 "for the same reaction, ammonia is removed" after Q3 became H2 + I2).
const ANAPHORA = new RegExp([
  "\\b(?:the\\s+)?same\\s+(?:reaction|equilibrium|equilibria|system|mixture|process|equation|conditions?|vessel|container|sample|gas|solution|cell)s?\\b",
  "\\b(?:the\\s+)?(?:previous|preceding|prior|last|above|earlier|former)\\s+(?:question|problem|exercise|example|reaction|equilibrium|system|mixture|part|item|equation|one)s?\\b",
  "\\b(?:reaction|equilibrium|system|equation|mixture|process)s?\\s+(?:above|before|from\\s+(?:above|before|earlier)|(?:given|shown|described|stated|used|introduced)\\s+(?:above|earlier|before|previously))\\b",
  "\\b(?:this|that|these|those)\\s+(?:reaction|equilibrium|equilibria|system|mixture|process)s?\\b",
  "\\b(?:reaction|equilibrium|system|equation|mixture)s?\\s+(?:in|of|from)\\s+(?:q|question|problem|exercise|example)(?![a-z])",
].join("|"), "i");
const REACTION = /\\ce\s*\{[^}]*(?:<=>|->|<-|=)|[⇌⇋→⟶]|<=>/;
export const anaphoric = (text) => ANAPHORA.test(readerView(text));
function anaphoraTargets(units, x, self) {
  if (!x?.locator || !anaphoric(x.text)) return [];
  const before = units.filter((v) => v.locator.deliverable === x.locator.deliverable && v.locator.ordinal < x.locator.ordinal && v.id !== x.id && !self.has(v.id))
    .sort((a, b) => b.locator.ordinal - a.locator.ordinal);
  const question = before.find((v) => v.form === "question"), reaction = before.find((v) => REACTION.test(v.text));
  return [question, reaction].filter(Boolean);
}

/**
 * @param {Array} units   [{ id, form, locator:{deliverable, section, ordinal}, spineNodes, origin, evidence, text }]
 * @param {object} spine  parsed spine (parseSpine)
 * @param {object} sources { <sourceId>: hash }
 * @returns Map(unitId → [{ target, kind }])
 */
export function dependencyEdges(units, spine, sources = {}) {
  const edges = new Map(units.map((u) => [u.id, []]));
  const add = (u, target, kind) => { const list = edges.get(u.id); if (!list.some((e) => e.target === target)) list.push({ target, kind }); };
  // shared values: units stating the same quantity depend on each other
  const byQty = new Map();
  for (const u of units) for (const q of quantities(u.text)) byQty.set(q, [...(byQty.get(q) || []), u]);
  for (const u of units) for (const b of bindings(u.text)) byQty.set(`bind:${b}`, [...(byQty.get(`bind:${b}`) || []), u]);
  for (const list of byQty.values()) if (list.length > 1) for (const a of list) for (const b of list) if (a !== b) add(a, `unit:${b.id}`, "shared-value");
  // an answer depends on the question it answers: the one its label names, else the nearest question before it (F13)
  for (const u of units) for (const v of questionsOf(units, u)) { add(u, `unit:${v.id}`, "derivation"); add(u, `question:${v.id}`, "derivation"); }
  // a figure and the prose that names it, both ways (R5 F1)
  for (const u of units) for (const f of figuresNamedBy(units, u)) { add(u, `ref:${f.id}`, "figure"); add(f, `ref:${u.id}`, "figure"); }
  // a question or answer named by number ("the answer to Q3"), bound to its full wording (F3)
  for (const u of units) for (const v of referencedUnits(units, u)) add(u, `ref:${v.id}`, "reference");
  // key terms used in the unit: every definition of the term, in each concept map that defines it (red team R4
  // coherence F6: keyed by label alone, a term defined in two chapters tracked only the last one's definition)
  const defs = termDefinitions(spine), patterns = defs.map((d) => [d, termMatcher(d.term), headWordMatcher(d, defs)]);
  const using = new Map(defs.map((d) => [d, new Set([d.scope])]));
  for (const u of units) for (const [d, uses] of patterns) if (uses(u.text)) { add(u, d.key, "shared-term"); using.get(d).add(chapterOfUnit(u)); }
  // its distinctive word alone, within the chapter that defines it — and any chapter that uses the term by its full
  // name (R5 F6: a chemical-equilibrium slide's "**Exothermic** —" restates the le-chatelier term the chapter also
  // writes out in full)
  for (const u of units) for (const [d, uses, head] of patterns) if (head && (d.scope === "course" || using.get(d).has(chapterOfUnit(u))) && head(u.text)) add(u, d.key, "shared-term");
  // spine nodes the unit serves, and the prerequisites those nodes declare (D19-H)
  const nodes = nodeIndex(spine);
  for (const u of units) for (const n of u.spineNodes || []) {
    add(u, `spine:${n}`, "spine-node");
    for (const p of nodes.get(n)?.prereqs || []) add(u, `spine:${p}`, "prerequisite");
  }
  // sources: the unit's own source and the sources of its evidence
  for (const u of units) {
    if (u.origin?.kind === "source-derived" && u.origin.source) add(u, `source:${u.origin.source}`, "source");
    for (const e of u.evidence || []) if (e.source) add(u, `source:${e.source}`, "source");
  }
  void sources;
  return edges;
}

/** The current hash of every dependency target. */
export function targetHashes(units, spine, sources = {}) {
  const h = {};
  for (const u of units) { h[`unit:${u.id}`] = unitTargetHash(u.text); h[`ref:${u.id}`] = questionHash(u.text); if (u.form === "question") h[`question:${u.id}`] = questionHash(u.text); }
  for (const [key, defs] of groupBy(termDefinitions(spine), (d) => d.key)) h[key] = groupTermHash(defs.map((d) => d.term));
  for (const [id, n] of nodeIndex(spine)) h[`spine:${id}`] = nodeHash(n);
  for (const [id, hash] of Object.entries(sources)) h[`source:${id}`] = hash;
  return h;
}
const groupBy = (list, f) => { const m = new Map(); for (const x of list) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
/** A key term's target: `term:<scope>:<label>` — the scope is "course" or the chapter whose concept map defines it (F6). */
export const termKey = (scope, label) => `term:${scope}:${String(label).toLowerCase()}`;
/** A stamp key from before R4 F6 (`term:<label>`, no scope): the label, else null. */
export const legacyTermLabel = (key, scopes) => { if (!key.startsWith("term:")) return null; const rest = key.slice(5), i = rest.indexOf(":"); return i > 0 && scopes.has(rest.slice(0, i)) ? null : rest; };
/** Every key-term definition of the spine, in the order the pre-R4 target table read them (course map, then chapters). */
export function termDefinitions(spine) {
  return [...(spine.course.terms || []).map((t) => ({ scope: "course", term: t })), ...Object.entries(spine.chapters).flatMap(([ch, c]) => c.map.terms.map((t) => ({ scope: ch, term: t })))]
    .filter((d) => d.term.label).map((d) => ({ ...d, label: d.term.label.toLowerCase(), key: termKey(d.scope, d.term.label) }));
}

/** The hash a spine node (or guide entry) target has; also applied to the nodes an approval recorded (F13). */
export const nodeHash = (n) => sha256(canonicalJson({ text: n.text ?? n.title, prereqs: n.prereqs ?? [], type: n.type ?? null, count: n.count ?? null, levels: n.levels ?? null }));
export const termHash = (t) => sha256(t.text);
/** The hash of a term target: its definition (or, defined twice in one map, both). */
export const groupTermHash = (terms) => (terms.length === 1 ? termHash(terms[0]) : sha256(canonicalJson(terms.map((t) => t.text))));

/** A unit's stamp: the hash of each of its dependencies now. */
export function stampFor(unitId, edges, hashes) {
  return Object.fromEntries((edges.get(unitId) || []).map((e) => [e.target, hashes[e.target] ?? "missing"]));
}

/**
 * Dependencies whose hash moved since the unit was stamped. `accept` (target → Set of hashes) holds earlier hashes
 * that still count as current: a spine node or term whose only change since its last full approval is a LIGHT one the
 * instructor glance-confirmed (F13 — the classifier's verdict, consumed, not recomputed here).
 */
export function staleTargets(stamp, hashes, accept = null) {
  return Object.entries(stamp || {}).filter(([t, h]) => (hashes[t] ?? "missing") !== h && !accept?.get(t)?.has(h)).map(([t]) => t);
}

/**
 * How an answer is bound to its question (F1, F3): the stamp must hold exactly the question targets the answer has
 * now. Returns the problems: "legacy" (a stamp from before the question binding), "re-paired" (the answer now
 * follows another question than the one it was stamped against), or [].
 */
export function questionBindingProblems(stamp, edgeList) {
  if (!stamp) return [];
  const now = (edgeList || []).filter((e) => e.target.startsWith("question:")).map((e) => e.target).sort();
  if (!now.length) return [];
  const had = Object.keys(stamp).filter((t) => t.startsWith("question:")).sort();
  if (!had.length) return ["legacy"];
  return JSON.stringify(had) === JSON.stringify(now) ? [] : ["re-paired"];
}

/**
 * How a unit is bound to what it names by number (red team R3 coherence, F8): a `ref:` edge resolves to whichever
 * question or answer carries the number NOW, so a renumbering re-targets "the answer to Q3" without touching the unit or
 * its old target. The stamp holds the targets it was written and verified against; a stamped reference that is no
 * longer an edge (the number names another unit now, or none) is "re-targeted". References only ADDED to a stamp that
 * still holds every old one (a spelling the harness newly reads) are baselined by upgradeStamps instead.
 */
export function referenceBindingProblems(stamp, edgeList) {
  if (!stamp) return [];
  const had = Object.keys(stamp).filter((t) => t.startsWith("ref:"));
  if (!had.length) return [];
  const now = new Set((edgeList || []).filter((e) => e.target.startsWith("ref:")).map((e) => e.target));
  return had.some((t) => !now.has(t)) ? ["re-targeted"] : [];
}

/** Source hashes from the package's compact source record. */
export function sourceHashes(reader) {
  try {
    const rec = JSON.parse(reader.text("metadata/SOURCE_RECORD.json") || "null");
    return Object.fromEntries((rec?.sources || []).filter((s) => s.id).map((s) => [s.id, s.textSha256 || s.rawSha256 || sha256(canonicalJson(s))]));
  } catch { return {}; }
}
