// What a unit depends on (redesign P5; Coherence H1; D19-H). Every edge is mechanical, so impact is complete for
// these kinds (H1): shared values, the question an answer belongs to, key terms the unit uses, the spine nodes it
// serves and the prerequisites those nodes declare, and its sources. Each dependency target has a hash; a unit is
// stamped with those hashes when it is written or re-verified, and is stale when any of them moves.
//
// Unit-to-unit dependencies hash the target's FACT TOKENS, not its wording (D17, D19-C): a rephrase of a neighbour
// leaves dependents alone; a changed value, name, number or negation makes them stale. The one exception is an
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
import { factTokens, questionWording } from "./change.mjs";
import { nodeIndex } from "./spine.mjs";
import { parseNumber, plainForQuantities, valueText, valuesIn } from "./values.mjs";

export const factHash = (text) => sha256(canonicalJson(factTokens(text)));
const QUANTITY = /[−-]?\d+(?:[.,]\d+)?\s*(?:°C|K\b|kJ|J\b|mol|M\b|atm|bar|Pa|kPa|g\b|kg|mg|L\b|mL|%)/g;
// Quantities are found after folding LaTeX spellings ("-92\\ \\text{kJ mol}^{-1}" → "-92 kJ mol"), since the
// packages write most values in LaTeX; a value written two ways is still one shared value.
// (plainForQuantities lives in core/values.mjs, beside the one value parser that also reads bindings; re-exported)
export { plainForQuantities };
const quantities = (text) => [...new Set((plainForQuantities(text).match(QUANTITY) || []).map((q) => q.replace(/\s+/g, "")))];
export { quantities };

// A unitless value bound to a symbol ("K = 50", "Q_r = 50", "pH = 7", "K_c = 4.0") is a shared value too: two units
// stating the same binding depend on each other (red team R1 coherence, F11: Q7 "for the same reaction (K = 50)" was
// never found when Q6's K changed). A chain "Q_r = K = 50" binds every symbol in it. The binding is read as the value
// parser reads it (core/values.mjs) as well: "whose K is 50", "K of 50", "K equals 50", "K ≈ 50" bind K to 50 exactly
// as "K = 50" does (red team R2 coherence, F7). A binding's key is its symbol without subscript marks and its number
// as a number ("K_c = 4.0" and "Kc is 4" are one binding).
const UNIT_AFTER = /^\s*(?:°C|K\b|kJ|J\b|mol|M\b|atm|bar|Pa|kPa|g\b|kg|mg|L\b|mL|%)/;
const BINDING = /((?:\b[A-Za-z][A-Za-z]?(?:_[A-Za-z0-9,]+)?\s*=\s*)+)([−-]?\d+(?:[.,]\d+)?)/g;
const bindingKey = (sym, value) => `${String(sym).replace(/[_{}\s]/g, "")}=${String(parseNumber(String(value)))}`;
export function bindings(text) {
  const plain = plainForQuantities(text).replace(/_\s*\{?\s*([A-Za-z0-9,]+)\s*\}?/g, "_$1");
  const out = new Set();
  for (const m of plain.matchAll(BINDING)) {
    if (UNIT_AFTER.test(plain.slice(m.index + m[0].length))) continue; // a quantity with a unit: QUANTITY covers it
    for (const sym of m[1].split("=").map((x) => x.replace(/\s+/g, "")).filter(Boolean)) out.add(bindingKey(sym, m[2]));
  }
  for (const v of valuesIn(valueText(text))) if (v.symbol && v.unit === "1") out.add(bindingKey(v.symbol, String(v.value)));
  return [...out];
}

export { questionWording };
export const questionHash = (text) => sha256(questionWording(text));

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
  return (text) => { const raw = String(text || ""), fm = foldMath(raw); return res.some((re) => re.test(raw) || re.test(fm)); };
}

// ---- numbered questions ----------------------------------------------------------------------------------------
// A label's number: "Q 6", "Question 6", "Problem 3", "Answer 6 (continued)", "Solution 2", "Worked example 1".
const LABEL_NUMBER = /^\s*(?:q|question|problem|exercise|worked example|example|answer|solution|worked answer)\s*(\d+)\b/i;
export const labelNumber = (label) => LABEL_NUMBER.exec(String(label || ""))?.[1] ?? null;
// A reference by number in running text: "Q3", "Q 3", "Question 3", "Problem 3", "Exercise 3".
const REFERENCE = /\b(?:Q|Question|Problem|Exercise)\s*(\d+)\b/gi;
export const referencedNumbers = (text) => [...new Set([...String(text || "").matchAll(REFERENCE)].map((m) => m[1]))];
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
  return [...nums].flatMap((n) => numbered(units, u, n, ["question", "answer"])).filter((v, k, all) => v !== u && !own.includes(v) && all.indexOf(v) === k);
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
  // a question or answer named by number ("the answer to Q3"), bound to its full wording (F3)
  for (const u of units) for (const v of referencedUnits(units, u)) add(u, `ref:${v.id}`, "reference");
  // key terms used in the unit
  const terms = [...spine.course.terms || [], ...Object.values(spine.chapters).flatMap((c) => c.map.terms)];
  const patterns = terms.filter((t) => t.label).map((t) => [t, termMatcher(t)]);
  for (const u of units) for (const [t, uses] of patterns) if (uses(u.text)) add(u, `term:${t.label.toLowerCase()}`, "shared-term");
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
  for (const u of units) { h[`unit:${u.id}`] = factHash(u.text); h[`ref:${u.id}`] = questionHash(u.text); if (u.form === "question") h[`question:${u.id}`] = questionHash(u.text); }
  for (const t of [...(spine.course.terms || []), ...Object.values(spine.chapters).flatMap((c) => c.map.terms)]) if (t.label) h[`term:${t.label.toLowerCase()}`] = termHash(t);
  for (const [id, n] of nodeIndex(spine)) h[`spine:${id}`] = nodeHash(n);
  for (const [id, hash] of Object.entries(sources)) h[`source:${id}`] = hash;
  return h;
}
/** The hash a spine node (or guide entry) target has; also applied to the nodes an approval recorded (F13). */
export const nodeHash = (n) => sha256(canonicalJson({ text: n.text ?? n.title, prereqs: n.prereqs ?? [], type: n.type ?? null, count: n.count ?? null, levels: n.levels ?? null }));
export const termHash = (t) => sha256(t.text);

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

/** Source hashes from the package's compact source record. */
export function sourceHashes(reader) {
  try {
    const rec = JSON.parse(reader.text("metadata/SOURCE_RECORD.json") || "null");
    return Object.fromEntries((rec?.sources || []).filter((s) => s.id).map((s) => [s.id, s.textSha256 || s.rawSha256 || sha256(canonicalJson(s))]));
  } catch { return {}; }
}
