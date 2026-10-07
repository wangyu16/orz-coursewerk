// Deterministic admission of a verifier's answer (redesign P7; D17, D19-A; req.verdict.semi-mechanical).
// The verifier proposes; this file decides. A claim is SUPPORTED only when (round P7-1 hardened every rule):
//   - every quote is found, verbatim after folding, in the pinned text of the passage it names;
//   - every required token is carried by a quote WINDOW (one pinned text, ≤ 800 characters) that is itself about the
//     claim (two of its content words): each quantity at the claim's precision, each year and month, each name with
//     every capitalized part as a whole word, each superlative inside a quoted sentence that holds the claim's words
//     on both sides of it;
//   - each value beside the SAME name the claim gives it (the nearest name before it): a swap of two years between
//     two people fails, and a year beside another person is not this person's year;
//   - the claim's values in the claim's order within a window.
// A claim is CONTRADICTED (a defect) only when a found quote states the same quantity with another value, is ANCHORED
// to the claim (it also carries another of the claim's required tokens), names no one the claim does not, shares
// three content words, and the claimed value appears nowhere in the pinned texts near the claim's topic. A year or a
// name, or anything less anchored, is DISPUTED — a question (D12-F). Anything else admits nothing.
import { EXCLUSIVE, NEGATION, fold, folded, namesIn, proseOf, quantitiesIn, yearsIn, nameKey, contentWords } from "./claims.mjs";
import { decodeEntities } from "../core/values.mjs";

const MIN_QUOTE_CHARS = 12;

/** Locate a quote in a pinned text: { start, end } (original offsets) or null. */
export function locate(quote, text) {
  const q = folded(quote).replace(/^["'.,;:\s-]+|["'.,;:\s-]+$/g, "");
  if (q.length < MIN_QUOTE_CHARS) return null;
  const t = fold(text);
  const i = t.s.indexOf(q);
  if (i < 0) return null;
  return { start: t.map[i], end: t.map[i + q.length - 1] + 1 };
}

/** The same value at the claim's precision, in the same unit (denominators included). Scientific notation compares
 *  mantissas at the exponent the claim wrote ("9 × 10⁻⁶" vs "5 × 10⁻⁶" differ; red-team round 1 F7). */
export const sameAtPrecision = (claim, src) => {
  if (claim.unit !== src.unit) return false;
  const scale = (v) => Number(`${v}e${-(claim.exp || 0)}`);
  return Math.abs(Number(scale(src.value).toFixed(claim.decimals)) - scale(claim.value)) < 1e-9;
};

// ---- the predicate a quote states (red-team round 1, CONFIDENCE F5, F8, F9; round 2, R2-K01–K03) -----------------
// Tokens are not the whole fact: a quote that carries every value but says the opposite direction or size, negates
// what the claim asserts (or the reverse), or states the value for another reaction or another quantity, does not
// support the claim and never anchors a contradiction. These are word checks, so they err one way only: a doubt is a
// refusal (the claim stays evidence-missing and goes back to the blind check), never an admission.
const DIRECTIONS = [
  { a: /\b(?:left|toward(?:s)?\s+(?:the\s+)?reactants?|favou?r(?:s|ing|ed)?\s+(?:the\s+)?(?:reactants?|reverse(?:\s+reaction)?))\b/, b: /\b(?:right|toward(?:s)?\s+(?:the\s+)?products?|favou?r(?:s|ing|ed)?\s+(?:the\s+)?(?:products?|product\s+formation|forward(?:\s+reaction)?))\b/, label: "left/right (reactants/products)" },
  { a: /\bincreas(?:e|es|ed|ing)\b/, b: /\bdecreas(?:e|es|ed|ing)\b/, label: "increase/decrease" },
  { a: /\bendothermic\b|\babsorb(?:s|ed|ing)?\s+heat\b/, b: /\bexothermic\b|\b(?:releas(?:e|es|ed|ing)|gives?\s+off|giving\s+off|evolv(?:e|es|ed|ing))\s+heat\b/, label: "endothermic/exothermic" },
  // magnitude (round 2, R2-K01): a value kept while its meaning is flipped ("relatively LARGE … MOSTLY ammonia")
  { a: /\b(?:large|larger|largest|big|bigger|biggest|huge|vast|great|greater|greatest)\b/, b: /\b(?:small|smaller|smallest|tiny|negligible)\b/, label: "large/small" },
  { a: /\b(?:high|higher|highest|elevated)\b/, b: /\b(?:low|lower|lowest)\b/, label: "high/low" },
  { a: /\b(?:mostly|mainly|largely|predominantly|primarily|chiefly|almost\s+(?:all|entirely|completely)|most\s+of)\b/, b: /\b(?:little|hardly\s+any|barely\s+any|scarcely\s+any|almost\s+no(?:ne)?|few)\b/, label: "mostly/little" },
  { a: /\b(?:fast|faster|fastest|rapid|rapidly|quick|quickly|quicker)\b/, b: /\b(?:slow|slower|slowest|slowly|sluggish)\b/, label: "fast/slow" },
  { a: /\bstrong(?:er|est|ly)?\b/, b: /\bweak(?:er|est|ly)?\b/, label: "strong/weak" },
  { a: /(?<!non-?)\bspontaneous(?:ly)?\b/, b: /\bnon-?spontaneous(?:ly)?\b/, label: "spontaneous/nonspontaneous" },
  { a: /\bpositive\b/, b: /\bnegative\b/, label: "positive/negative" },
];
// words that carry no predicate of their own (a polarity or negation word is read with the content word beside it)
const LIGHT = new Set("the a an of to in on at by for and or nor but is are was were be been being am do does did done has have had having it its this that these those there their they them which who whom whose what when where while as than then so such very relatively quite rather more less most least also only just even still yet both either each any some all no not never can could may might must shall should will would about into onto from with without over under between after before during through".split(" "));
const wordsAt = (f) => [...f.matchAll(/[a-z][a-z'-]*/g)].map((m) => ({ w: m[0], at: m.index }));
const stemOf = (w) => w.slice(0, Math.max(4, w.length - 3));
const sameWord = (x, y) => x.length >= 4 && y.length >= 4 && (x.startsWith(stemOf(y)) || y.startsWith(stemOf(x)));
/** The content words within three words of each match of `re` in folded text f: [[word, …], …], one list per match. */
function besideEach(re, f) {
  const ws = wordsAt(f), out = [];
  for (const m of f.matchAll(new RegExp(re.source, "g"))) {
    const i = ws.findIndex((x) => x.at >= m.index), j = ws.findIndex((x) => x.at >= m.index + m[0].length);
    const lo = Math.max(0, (i < 0 ? ws.length : i) - 3), hi = (j < 0 ? ws.length : j) + 3;
    out.push([...ws.slice(lo, i < 0 ? ws.length : i), ...ws.slice(j < 0 ? ws.length : j, hi)].map((x) => x.w).filter((w) => w.length >= 4 && !LIGHT.has(w)));
  }
  return out;
}
/** A direction or size the claim states that the quote states the opposite of: its label, or null. Two readings:
 *  over the whole text (the claim says only one side, the quote only the other), and word by word (the quote puts the
 *  opposite word beside a content word the claim put its own word beside, and never the claim's word there). */
export function directionClash(claimText, quoteText) {
  const c = folded(proseOf(claimText)), q = folded(quoteText);
  for (const d of DIRECTIONS) {
    const ca = d.a.test(c), cb = d.b.test(c), qa = d.a.test(q), qb = d.b.test(q);
    if ((ca && !cb && qb && !qa) || (cb && !ca && qa && !qb)) return d.label;
    for (const [mine, theirs] of [[d.a, d.b], [d.b, d.a]]) {
      const anchors = besideEach(mine, c).flat();
      if (!anchors.length) continue;
      const opposite = besideEach(theirs, q).flat(), same = besideEach(mine, q).flat();
      if (anchors.some((w) => opposite.some((x) => sameWord(w, x)) && !same.some((x) => sameWord(w, x)))) return d.label;
    }
  }
  return null;
}

// negation (round 2, R2-K02): the predicate a negation governs is the first content word after it, and the first
// content word after each "or"/"nor"/"and" that continues the negated clause ("do not shift … right or favor …")
const NEGATOR = /\b(?:not|no|never|neither|nor|without|cannot|can't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|won't|hardly|fails?\s+to|failed\s+to)\b/g;
const HEDGED = /^\s*(?:only|just|merely|necessarily|always|simply|so|too|as)\b/;
/** The predicate heads a text negates, and every content word it uses outside a negated clause. */
function polarityOf(f) {
  const negated = [], spans = [];
  for (const m of f.matchAll(NEGATOR)) {
    const rest = f.slice(m.index + m[0].length);
    if (HEDGED.test(rest)) continue; // "not only", "not necessarily": no denial
    const clause = rest.split(/[,;:.!?()¶]|\bbut\b|\bbecause\b|\bwhile\b|\bwhereas\b/)[0];
    const ws = wordsAt(clause);
    let head = true;
    for (const { w } of ws.slice(0, 10)) {
      if (/^(?:or|nor|and)$/.test(w)) { head = true; continue; }
      if (head && w.length >= 4 && !LIGHT.has(w)) { negated.push(w); head = false; }
    }
    spans.push([m.index, m.index + m[0].length + clause.length]);
  }
  const asserted = wordsAt(f).filter((x) => !spans.some(([a, b]) => x.at >= a && x.at < b)).map((x) => x.w).filter((w) => w.length >= 4 && !LIGHT.has(w));
  return { negated, asserted };
}
/** The claim only denies a predicate the quote only asserts, or only asserts one the quote only denies. A text that
 *  both asserts and denies a predicate ("only temperature changes K; concentration does not change it") has no single
 *  polarity on it, and the exclusivity check (D29) reads it instead. */
export function negationClash(claimText, quoteText) {
  const c = polarityOf(folded(proseOf(claimText))), q = polarityOf(folded(quoteText));
  const has = (list, w) => list.some((x) => sameWord(w, x));
  const denied = c.negated.find((w) => !has(c.asserted, w) && has(q.asserted, w) && !has(q.negated, w));
  if (denied) return `the claim denies "${denied}", which the quotes assert`;
  const asserted = q.negated.find((w) => !has(q.asserted, w) && has(c.asserted, w) && !has(c.negated, w));
  if (asserted) return `the quotes deny "${asserted}", which the claim asserts`;
  return null;
}

/** The quantity a text names beside its value: H, G, S, U (Δ…), K, a rate constant k, Ea, E (a potential), Q, C — by
 *  symbol, or in words ("the standard free energy change", "the equilibrium constant", round 2 R2-K03). */
const QUANTITY_WORDS = [
  [/\b(?:gibbs(?:\s+free)?(?:\s+energy)?|free\s+energy)\b/, "G"],
  [/\benthalp(?:y|ies)\b|\bheats?\s+of\s+(?:reaction|formation|combustion|vapou?ri[sz]ation|fusion|solution|neutrali[sz]ation)\b/, "H"],
  [/\bentrop(?:y|ies)\b/, "S"],
  [/\binternal\s+energ(?:y|ies)\b/, "U"],
  [/\bequilibrium\s+constants?\b|\bsolubility\s+products?\b|\bionization\s+constants?\b|\bdissociation\s+constants?\b/, "K"],
  [/\brate\s+constants?\b/, "k"],
  [/\bactivation\s+energ(?:y|ies)\b/, "Ea"],
  [/\b(?:cell|electrode|reduction|oxidation|standard)\s+potentials?\b|\belectromotive\s+force\b/, "E"],
  [/\breaction\s+quotients?\b/, "Q"],
  [/\bheat\s+capacit(?:y|ies)\b|\bspecific\s+heats?\b/, "C"],
];
export function quantityNames(text) {
  const t = decodeEntities(String(text || "")).normalize("NFKC");
  const out = new Set();
  for (const m of t.matchAll(/(?:Δ|∆|\\Delta)\s*_?\{?\s*(?:r\s*)?\}?\s*([HGSU])(?![a-z])/g)) out.add(m[1]);
  for (const m of t.matchAll(/(?<![\p{L}\\])K\s*_?\{?\s*(?:p|c|eq|a|b|w|sp)?\s*\}?\s*(?:=|≈|~|\\approx)/gu)) { void m; out.add("K"); }
  for (const m of t.matchAll(/(?<![\p{L}\\])k\s*_?\{?\s*(?:\d|f|r|obs)?\s*\}?\s*=/gu)) { void m; out.add("k"); }
  for (const m of t.matchAll(/(?<![\p{L}\\])E\s*_\s*\{?\s*a\s*\}?/gu)) { void m; out.add("Ea"); }
  const f = folded(t.replace(/\\[a-zA-Z]+/g, " "));
  for (const [re, q] of QUANTITY_WORDS) if (re.test(f)) out.add(q);
  return out;
}
const otherQuantity = (claimText, quoteText) => {
  const c = quantityNames(claimText), q = quantityNames(quoteText);
  return c.size > 0 && q.size > 0 && ![...c].some((x) => q.has(x));
};

const WINDOW = 800;
const plainKeepCase = (t) => proseOf(t).normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const wordRe = (w, flags = "iu") => new RegExp(`(?<![\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, flags);
const nameParts = (name) => plainKeepCase(name).split(/[\s\u2010-\u2015-]+/).filter((w) => /^\p{Lu}/u.test(w)).map((w) => w.replace(/['’]s$/, ""));
const sentencesIn = (t) => String(t).split(/(?<=[.!?;])\s+|\s*¶\s*/);

/** The claim's content words nearest the superlative: two before it, two after. */
function neighbours(claim, sup) {
  const words = folded(proseOf(claim.text)).match(/[a-z]+/g) || [];
  const at = words.findIndex((w) => w === sup);
  if (at < 0) return { before: [], after: [] };
  const content = new Set(claim.words);
  return { before: words.slice(0, at).filter((w) => content.has(w)).slice(-2), after: words.slice(at + 1).filter((w) => content.has(w)).slice(0, 2) };
}

/** Where a required token sits in a text (an index into plainKeepCase(text)), or -1. */
function tokenIndex(tok, P, claim) {
  if (tok.kind === "quantity") { const q = quantitiesIn(P).find((x) => sameAtPrecision(tok.q, x)); return q ? q.at : -1; }
  if (tok.kind === "year") { const m = P.match(new RegExp(`(?<![\\d])${tok.v}(?![\\d])`)); return m ? m.index : -1; }
  if (tok.kind === "month") { const m = P.match(wordRe(tok.v)); return m ? m.index : -1; }
  if (tok.kind === "name") {
    let at = -1;
    for (const part of tok.parts) { const m = P.match(wordRe(part)); if (!m) return -1; at = Math.max(at, m.index); }
    return at;
  }
  if (tok.kind === "excl-pos" || tok.kind === "excl-neg") {
    // a quoted sentence that names the member (or alternative) as whole words, says it (or denies it), and shares
    // another of the claim's words
    let off = 0;
    for (const sen of sentencesIn(P)) {
      const f = folded(sen);
      const g = f.replace(/\bnot\s+(?:only|just|merely|necessarily|always|simply)\b/g, " "); // these do not deny
      const named = tok.keys.every((k) => new RegExp(`(?<![a-z])${k}(?![a-z])`).test(g));
      const ex = claim.required.exclusive, own = new Set([...ex.positive, ...ex.alternatives.flatMap((a) => a.keys)]);
      // the predicate comes from the clause that carries the "only" (not from a quoted misconception before it)
      const clause = (folded(proseOf(claim.text)).split(/\s*(?:;|:|—|–|\s-\s|\bno\b\s*[—–-])\s*/).find((c) => /\bonly\b|\bsolely\b|\bexclusively\b|\bthe sole\b|\bnothing but\b/.test(c)) || folded(claim.text));
      const predicate = claim.words.filter((w) => !own.has(w) && clause.includes(w));
      const ws = g.split(/\s+/);
      const keyAt = ws.findIndex((w) => w.replace(/[^a-z'-]/g, "") === tok.keys[0]); // the head of the phrase
      const isNeg = (w) => NEGATION.test(` ${w} `);
      const stem = (w) => w.slice(0, Math.max(4, w.length - 2));
      const isPred = (w) => predicate.some((pw) => w.startsWith(stem(pw)));
      const CHANGE = /^(?:affect|affects|change|changes|alter|alters|shift|shifts|influence|influences|effect|effects)$/;
      // a negation GOVERNS when, within three words, it reaches a predicate word or a change verb ("does not affect",
      // "without any change", "not have an effect") — "without being consumed", "no suitable catalyst" do not
      const governing = (i) => ws.slice(i + 1, i + 4).some((x) => isPred(x) || CHANGE.test(x.replace(/[^a-z]/g, "")));
      const governs = ws.some((w, i) => isNeg(w) && governing(i));
      // a denial of THIS alternative: it stands before a governing negation (within twelve words), or it is the object
      // of a negated change verb (within six words)
      const denies = keyAt >= 0 && (
        ws.some((w, i) => isNeg(w) && i > keyAt && i - keyAt <= 12 && governing(i)) ||
        ws.some((w, i) => isNeg(w) && keyAt > i && keyAt - i <= 6 && ws.slice(i + 1, keyAt).some((x) => CHANGE.test(x.replace(/[^a-z]/g, "")))));
      // the member must stand alone: not one of a co-ordinated list ("temperature, pressure, volume, or concentration")
      const listed = keyAt >= 0 && /(?:,|\band\b|\bor\b)/.test([ws[keyAt - 1] || "", ws[keyAt] || "", ws[keyAt + 1] || ""].join(" ").replace(ws[keyAt] ? ws[keyAt].replace(/[,]$/, "") : "", ""));
      const negated = tok.kind === "excl-neg" ? denies : governs || listed;
      // the sentence carries a word of the claim's predicate (the governing negation ties a denial to it)
      const about = predicate.length > 0 && ws.some(isPred);
      if (named && about && (tok.kind === "excl-neg" ? negated : !negated)) return off;
      off += sen.length + 1;
    }
    return -1;
  }
  if (tok.kind === "superlative") {
    // inside a sentence that is about the claim: two of its content words (and its names, if any)
    let off = 0;
    for (const sen of sentencesIn(P)) {
      const f = folded(sen);
      // "about the claim": two of its content words, its names, and the words on BOTH sides of the superlative in the
      // claim — so "only a change of temperature alters K" is not about "a catalyst is the only change …"
      const { before, after } = neighbours(claim, tok.v);
      const about = claim.words.filter((w) => f.includes(w)).length >= Math.min(2, claim.words.length) && claim.required.names.every((n) => f.includes(nameKey(n)))
        && (!before.length || before.some((w) => f.includes(w))) && (!after.length || after.some((w) => f.includes(w)));
      const m = about && (tok.v === "only" ? sen.match(new RegExp(EXCLUSIVE.source, "i")) : sen.match(wordRe(tok.v)));
      if (m) return off + m.index;
      off += sen.length + 1;
    }
    return -1;
  }
  return -1;
}
const tokensOf = (claim) => [
  ...claim.required.quantities.map((q) => ({ kind: "quantity", q, label: q.raw })),
  ...claim.required.years.map((v) => ({ kind: "year", v, label: v })),
  ...claim.required.months.map((v) => ({ kind: "month", v, label: v })),
  ...claim.required.names.map((n) => ({ kind: "name", parts: nameParts(n), key: nameKey(n), label: n })).filter((t) => t.parts.length),
  ...claim.required.superlatives.map((v) => ({ kind: "superlative", v, label: v })),
  // a scoped exclusivity is a conjunction (D29): the member does it, each named alternative does not
  ...(claim.required.exclusive ? [
    { kind: "excl-pos", keys: claim.required.exclusive.positive, label: `only ${claim.required.exclusive.positive.join(" ")}` },
    ...claim.required.exclusive.alternatives.map((a) => ({ kind: "excl-neg", keys: a.keys, label: `not ${a.phrase}` })),
  ] : []),
];

/** The quotes, grouped into windows: one source, within 800 characters, in text order. */
function windowsOf(found) {
  const out = [];
  for (const src of [...new Set(found.map((f) => f.source))]) {
    const sorted = found.filter((f) => f.source === src).sort((x, y) => x.span[0] - y.span[0]);
    let cur = null;
    for (const f of sorted) {
      if (!cur || f.span[1] - cur.start > WINDOW) { cur = { start: f.span[0], quotes: [] }; out.push(cur); }
      cur.quotes.push(f.quote);
    }
  }
  return out.map((w) => w.quotes.join(" ¶ ")); // separate quotes are separate sentences (¶ survives prose folding)
}
function windowOf(found) { const w = windowsOf(found); return w.length === 1 ? w[0] : null; }

/** The name a value belongs to: the nearest name before it (or after it, if none precedes). */
function partnerOf(P, at, names) {
  const before = names.filter((n) => n.at <= at).sort((x, y) => y.at - x.at)[0];
  return before || names.filter((n) => n.at > at).sort((x, y) => x.at - y.at)[0] || null;
}
const namePositions = (P, list) => list.map((n) => ({ key: n.key, parts: n.parts, at: Math.max(...n.parts.map((p) => P.search(wordRe(p)))) })).filter((n) => n.at >= 0 && n.parts.every((p) => P.search(wordRe(p)) >= 0));

/** Do these found quotes support the claim? Every required token must be carried by a window that is about the claim
 *  (two of its content words), with each value beside the same name the claim gives it, and the claim's values in its
 *  order within the window. { ok, reason } */
export function supports(claim, found) {
  const windows = windowsOf(found);
  if (!windows.length) return { ok: false, reason: "no quotes" };
  const toks = tokensOf(claim);
  const C = plainKeepCase(claim.text);
  const claimNames = toks.filter((t) => t.kind === "name");
  const claimNamePos = namePositions(C, claimNames);
  const carriedBy = new Set();
  let reason = null;
  for (const joined of windows) {
    const P = plainKeepCase(joined), f = folded(joined);
    if (claim.words.filter((w) => f.includes(w)).length < Math.min(2, claim.words.length)) { reason = reason || "the quotes do not share the claim's content words"; continue; }
    // the predicate (red-team round 1): an equation's reaction is required; the opposite direction or another quantity never supports
    if (equationIn(claim.text) && !sameReaction(claim, joined)) { reason = "the quotes do not state the claim's reaction"; continue; }
    const clash = directionClash(claim.text, joined);
    if (clash) { reason = `the quotes state the opposite direction (${clash})`; continue; }
    // a scoped exclusivity asserts for its member and denies for each alternative: the D29 conjunction reads that
    // polarity member by member (excl-pos / excl-neg tokens), so the whole-claim negation check defers to it
    const denial = !claim.required.exclusive && negationClash(claim.text, joined);
    if (denial) { reason = `the quotes state the opposite predicate (${denial})`; continue; }
    if (otherQuantity(claim.text, joined)) { reason = "the quotes give the value for another quantity"; continue; }
    const quoteNames = namesIn(joined).map((n) => ({ key: nameKey(n), parts: nameParts(n) })).filter((n) => n.parts.length);
    const qPos = namePositions(P, quoteNames);
    const here = [];
    for (const t of toks) {
      const at = tokenIndex(t, P, claim);
      if (at < 0) continue;
      if ((t.kind === "year" || t.kind === "quantity") && claimNames.length) {
        const want = partnerOf(C, tokenIndex(t, C, claim), claimNamePos), got = partnerOf(P, at, qPos);
        if (want && (!got || !(got.key === want.key || want.parts.some((p) => folded(p) === got.key)))) { reason = `${t.label} sits beside another name in the source`; continue; }
      }
      here.push({ t, at, c: tokenIndex(t, C, claim) });
    }
    let ordered = true;
    for (const kind of ["year", "quantity", "month"]) {
      const o = here.filter((x) => x.c >= 0 && x.t.kind === kind).sort((x, y) => x.c - y.c);
      for (let i = 1; i < o.length; i++) if (o[i].at < o[i - 1].at) { ordered = false; reason = `the quotes state ${o[i - 1].t.label} and ${o[i].t.label} in another order`; }
    }
    if (ordered) for (const x of here) carriedBy.add(x.t.label);
  }
  const lacking = toks.filter((t) => !carriedBy.has(t.label)).map((t) => t.label);
  if (lacking.length) return { ok: false, reason: reason && !/content words/.test(reason) ? reason : `the quotes lack ${lacking.join(", ")}` };
  return { ok: true };
}

/** Kept for callers that only need the lacking list (status displays). */
export function carried(claim, quotes) {
  const found = quotes.map((q, i) => ({ source: "q", quote: q, span: [i * 2, i * 2 + 1] }));
  const r = supports(claim, found);
  return { lacking: r.ok ? [] : [r.reason], overlapOk: r.ok };
}

/** What a quote states that differs from the claim, dimension by dimension. */
export function conflicts(claim, quotes) {
  const joined = quotes.join(" \n "), out = [];
  const srcQ = quantitiesIn(joined), srcY = yearsIn(joined);
  for (const q of claim.required.quantities) {
    // a dimensionless value contradicts only the same symbol's value (K vs K, pH vs pH), never a bare number
    const sym = (x) => String(x.symbol || "").toLowerCase();
    const same = srcQ.filter((s) => s.unit === q.unit && (!/^1/.test(q.unit) || (sym(q) && sym(q) === sym(s))));
    if (same.length && !same.some((s) => sameAtPrecision(q, s))) out.push({ dimension: "quantity", claimed: q.raw, source: same[0].raw, sourceValue: same[0].value, unit: q.unit });
  }
  if (claim.required.years.length && srcY.length) for (const y of claim.required.years) if (!srcY.includes(y)) out.push({ dimension: "year", claimed: y, source: srcY[0] });
  return out;
}

/** The reaction a claim writes: its species on each side of the arrow (coefficients and states set aside). */
export function reactionOf(text) {
  const e = equationIn(text);
  return e && { left: Object.keys(e.left).sort(), right: Object.keys(e.right).sort() };
}
/** The balanced equation a text writes: { left: { species: coefficient }, right: { … } } (fractions read) — in \ce{…},
 *  and (red-team round 2, R2-K06) in \mathrm{…} / \text{…} math or plain prose with ⇌ → <=> -> and their LaTeX arrows.
 *  Outside \ce{} every species must read as a chemical formula ("NH3(g)", "Al(OH)3"), so prose never makes a reaction. */
export function equationIn(text) {
  const m = String(text || "").match(/\\ce\{([^}]*(?:<=>|->|<->|⇌|→)[^}]*)\}/);
  if (m) return equationOf(m[1]);
  const t = mathPlain(text);
  const e = t.match(new RegExp(`((?:${FORMULA_SP}\\s*\\+\\s*)*${FORMULA_SP})\\s*(${ARROW})\\s*((?:${FORMULA_SP}\\s*\\+\\s*)*${FORMULA_SP})(?![A-Za-z0-9(])`));
  return e ? equationOf(`${e[1]} ${e[2]} ${e[3]}`) : null;
}
const ARROW = "⇌|⇄|<=>|<->|↔|⟷|→|⟶|->";
// a species outside \ce{}: an optional coefficient, then element symbols and bracketed groups with counts, a state
const FORMULA_SP = "(?:\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[½⅓⅔¼¾])?\\s*(?:(?:[A-Z][a-z]?|\\((?:[A-Z][a-z]?\\d*)+\\))\\d*)+(?:\\((?:g|l|s|aq)\\))?";
/** LaTeX math and HTML as plain text an equation can be read from: arrows as arrows, \mathrm{}/\text{} unwrapped,
 *  subscripts joined ("NH_3", "N_{2}" → "NH3", "N2"), spacing commands as spaces. */
function mathPlain(text) {
  return decodeEntities(String(text || ""))
    .replace(/\\(?:rightleftharpoons|leftrightharpoons|rightleftarrows|longleftrightarrow|leftrightarrow|Longleftrightarrow|rightleftarrow)(?![A-Za-z])/g, " ⇌ ")
    .replace(/\\(?:longrightarrow|rightarrow|Rightarrow|Longrightarrow|to)(?![A-Za-z])/g, " → ")
    .replace(/\\(?:mathrm|text|textrm|rm|mbox|mathbf|mathsf)\s*\{/g, "{")
    .replace(/\\frac\s*\{?\s*(\d+)\s*\}?\s*\{?\s*(\d+)\s*\}?/g, "$1/$2")
    .replace(/\\(?:[,;:! ]|q?quad)/g, " ")
    .replace(/\^\s*\{[^}]*\}|\^\s*[-+]?\d*[-+]?/g, "").replace(/[{}]/g, "")
    .replace(/_\s*(\d+)/g, "$1")
    .replace(/\\[a-zA-Z]+/g, " ").replace(/\$/g, " ")
    .replace(/\s*\(\s*(g|l|s|aq)\s*\)/g, "($1)").replace(/[ \t]+/g, " ");
}
const FRACTIONS = { "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4 };
const coefficient = (c) => (!c ? 1 : FRACTIONS[c] ?? (c.includes("/") ? Number(c.split("/")[0]) / Number(c.split("/")[1]) : Number(c)));
function equationOf(eq) {
  const parts = String(eq).replace(/\\frac\s*\{?\s*(\d+)\s*\}?\s*\{?\s*(\d+)\s*\}?/g, "$1/$2").split(/<=>|<->|->|⇌|→|⟶|↔/);
  if (parts.length !== 2) return null;
  const side = (s) => {
    const out = {};
    for (const x0 of s.split(/\s\+\s|\s*\+\s+/)) {
      const x = x0.replace(/\((?:g|l|s|aq)\)/g, "").replace(/\s+/g, "");
      const m = x.match(/^(\d+\/\d+|\d+(?:\.\d+)?|[½⅓⅔¼¾])?([A-Z].*)$/);
      if (m) out[m[2]] = (out[m[2]] || 0) + coefficient(m[1]);
    }
    return out;
  };
  const [l, r] = parts.map(side);
  return Object.keys(l).length && Object.keys(r).length ? { left: l, right: r } : null;
}
/** The first balanced equation a quote states, as sources typeset it ("N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g )"). */
function quoteEquation(quoteText) {
  const q = String(quoteText).normalize("NFC").replace(/\s*\(\s*(g|l|s|aq)\s*\)/g, "($1)").replace(/([A-Z][a-z]?)\s+(\d)/g, "$1$2").replace(/(\d)\s+([A-Z])/g, "$1 $2");
  const SP = "(?:\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[½⅓⅔¼¾])?\\s*[A-Z][A-Za-z0-9()]*";
  const m = q.match(new RegExp(`((?:${SP}\\s*\\+\\s*)*${SP})\\s*(⇌|<=>|→|->|⟶|↔)\\s*((?:${SP}\\s*\\+\\s*)*${SP})`));
  return m && equationOf(`${m[1]} ${m[2]} ${m[3]}`);
}
/** The same equation: the same species on the same sides at the same coefficients (a scaled equation is another one
 *  for every extensive quantity and for K). */
function sameEquation(x, y) {
  const same = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => k in b && Math.abs(b[k] - v) < 1e-9);
  return same(x.left, y.left) && same(x.right, y.right);
}
/** Does a quote state the same reaction (same species, same sides, same coefficients)? The strongest anchor a chemical
 *  equation has (P11), and what an equation claim's support requires (red-team round 1, F8). */
export function sameReaction(claim, quoteText) {
  const want = equationIn(claim.text), got = want && quoteEquation(quoteText);
  return !!got && sameEquation(want, got);
}
/** The quote states a reaction, and not the claim's. */
const statesOtherReaction = (claim, quoteText) => { const want = equationIn(claim.text), got = want && quoteEquation(quoteText); return !!got && !sameEquation(want, got); };

export function anchored(claim, found, k) {
  const joined = windowOf(found);
  if (joined == null) return false;
  const P = plainKeepCase(joined);
  const conflicted = new Set(k.map((x) => x.claimed));
  const others = tokensOf(claim).filter((t) => !["superlative", "excl-pos", "excl-neg"].includes(t.kind) && !conflicted.has(t.label));
  // an equation claim may be anchored by its lead-in's names (P11): "Haber … ΔH = −57.2 kJ" vs a quote about the Haber
  // synthesis. The lead never adds a required token; it only lets the quote show it is about the same thing.
  const leadNames = (claim.leadNames || []).map((n) => ({ kind: "name", parts: nameParts(n), key: nameKey(n), label: n })).filter((t) => t.parts.length);
  const byClaim = others.some((t) => tokenIndex(t, P, claim) >= 0), byLead = leadNames.some((t) => tokenIndex(t, P, claim) >= 0);
  // a quote about another reaction (or the same species at other coefficients), or about another quantity, never
  // anchors — whatever else it shares (red-team round 1, F9: ½N2 + 3/2H2 → NH3 is not N2 + 3H2 ⇌ 2NH3 for a ΔH)
  if (statesOtherReaction(claim, joined) || otherQuantity(claim.text, joined)) return false;
  const byReaction = sameReaction(claim, joined);
  if (!byClaim && !byLead && !byReaction) return false;
  // a claim that writes its reaction is anchored only by a quote stating that same reaction: a name (the lead-in's
  // "Haber-Bosch") never carries a contradiction onto a reaction the claim wrote out (red-team round 2, R2-K06)
  if (equationIn(claim.text) && !byReaction) return false;
  const keys = [...tokensOf(claim).filter((t) => t.kind === "name"), ...leadNames].flatMap((t) => [t.key, ...t.parts.map(folded)]);
  // a quote's name is the claim's when it is, or shares a part with, one of the claim's names ("Haber-Bosch" / "Haber")
  if (namesIn(joined).some((n) => !keys.includes(nameKey(n)) && !nameParts(n).some((p) => keys.includes(folded(p))))) return false;
  const f = folded(joined), words = [...new Set([...claim.words, ...(claim.leadWords || [])])];
  // anchored by the lead-in's name: the named thing and one more shared content word (an equation has no words of its own)
  if (byReaction) return true; // the same balanced reaction beside the value: no further words needed
  return words.filter((w) => f.includes(w)).length >= Math.min(byClaim ? 3 : 2, words.length);
}

/** Does another pinned text state a different year for the claim's names and topic, and never the claimed one? */
export function contestedYear(claim, texts, quotedSources) {
  if (!claim.required.years.length || !claim.required.names.length) return null;
  const keys = claim.required.names.map(nameKey);
  for (const [source, text] of texts) {
    if (quotedSources.has(source)) continue;
    for (const sen of String(text).split(/(?<=[.!?])\s+|\n+/)) {
      const f = folded(sen);
      if (!keys.every((k) => f.includes(k)) || claim.words.filter((w) => f.includes(w)).length < Math.min(2, claim.words.length)) continue;
      const ys = yearsIn(sen);
      if (!ys.length || claim.required.years.some((y) => ys.includes(y))) continue;
      return { dimension: "year", claimed: claim.required.years[0], source: ys[0], sourceId: source, sentence: sen.slice(0, 300) };
    }
  }
  return null;
}

/** Uncontested? The claimed value (same unit, at the claim's precision) appears nowhere in the pinned texts near the claim's topic. */
export function supportedSomewhere(claim, q, texts) {
  for (const text of texts.values()) {
    const sentences = String(text).split(/(?<=[.!?])\s+|\n+/);
    for (let i = 0; i < sentences.length; i++) {
      if (!quantitiesIn(sentences[i]).some((s) => sameAtPrecision(q, s))) continue;
      const near = folded(sentences.slice(Math.max(0, i - 2), i + 3).join(" "));
      if (claim.words.filter((w) => near.includes(w)).length >= Math.min(2, claim.words.length)) return true;
    }
  }
  return false;
}

/**
 * Parse a verifier response. Expected JSON (possibly fenced):
 *   { "nonce": "...", "claims": [ { "claim": 1, "verdict": "supported|contradicted|not-found|hypothetical",
 *       "quotes": [ { "passage": 2, "text": "..." } ], "note": "..." } ] }
 * Returns { ok, value } or { ok: false, reason }.
 */
export function parseResponse(raw, nonce) {
  const s = String(raw ?? "");
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, reason: "no JSON object in the response" };
  let v; try { v = JSON.parse(m[0]); } catch (e) { return { ok: false, reason: `unparseable JSON: ${e.message}` }; }
  if (nonce && v.nonce !== nonce) return { ok: false, reason: "the response does not echo the bundle's nonce" };
  if (!Array.isArray(v.claims)) return { ok: false, reason: "no claims list" };
  for (const c of v.claims) {
    if (!Number.isInteger(c?.claim) || !["supported", "contradicted", "not-found", "hypothetical"].includes(c?.verdict)) return { ok: false, reason: "a claim entry without a claim number or a known verdict" };
    if (c.quotes !== undefined && !Array.isArray(c.quotes)) return { ok: false, reason: "quotes must be a list" };
  }
  return { ok: true, value: v };
}

/**
 * Admit one verifier answer for one unit.
 * @param claims    semiClaims(unit text)
 * @param passages  [{ n, source, text }]  the candidate passages the bundle showed, n = 1…
 * @param texts     Map(source → full pinned text)
 * @returns { status: "admitted"|"partial"|"contradicted"|"disputed"|"not-found"|"unscorable", perClaim, quotes, conflicts, reason }
 */
export function admit({ claims, passages, texts, raw, nonce }) {
  const parsed = parseResponse(raw, nonce);
  if (!parsed.ok) return { status: "unscorable", reason: parsed.reason, perClaim: [] };
  const byN = new Map(passages.map((p) => [p.n, p]));
  const perClaim = claims.map((claim) => {
    const ans = parsed.value.claims.find((c) => c.claim === claim.index);
    if (!ans) return { claim: claim.index, status: "not-found", reason: "no answer for this claim" };
    if (ans.verdict === "hypothetical") return { claim: claim.index, status: "hypothetical", note: String(ans.note || "") };
    const found = [], missing = [];
    for (const q of ans.quotes || []) {
      const p = byN.get(q?.passage);
      const text = p && texts.get(p.source);
      const span = text && typeof q.text === "string" && locate(q.text, p.text) && locate(q.text, text);
      if (span) found.push({ source: p.source, quote: text.slice(span.start, span.end), span: [span.start, span.end] });
      else missing.push(String(q?.text || "").slice(0, 120));
    }
    if (ans.verdict === "supported") {
      if (!found.length) return { claim: claim.index, status: "not-found", reason: missing.length ? "no quote was found in its passage" : "supported without a quote" };
      const c = supports(claim, found);
      if (!c.ok) return { claim: claim.index, status: "not-found", reason: c.reason, quotes: found };
      // conflicting evidence is a question (D12-F): another pinned text gives the same people another year
      const other = contestedYear(claim, texts, new Set(found.map((f) => f.source)));
      if (other) return { claim: claim.index, status: "disputed", quotes: found, conflicts: [other] };
      return { claim: claim.index, status: "supported", quotes: found };
    }
    if (ans.verdict === "contradicted") {
      if (!found.length) return { claim: claim.index, status: "not-found", reason: "contradicted without a quote found in its passage" };
      const k = conflicts(claim, found.map((f) => f.quote));
      if (!k.length) return { claim: claim.index, status: "not-found", reason: "the quote states no different value, year or name" };
      const hard = k.some((x) => x.dimension === "quantity") && anchored(claim, found, k) && !claim.required.quantities.some((q) => supportedSomewhere(claim, q, texts));
      return { claim: claim.index, status: hard ? "contradicted" : "disputed", quotes: found, conflicts: k };
    }
    return { claim: claim.index, status: "not-found", reason: String(ans.note || "the verifier found no evidence") };
  });
  const all = (s) => perClaim.every((c) => c.status === s);
  const status = perClaim.some((c) => c.status === "contradicted") ? "contradicted"
    : perClaim.some((c) => c.status === "disputed") ? "disputed"
    : all("supported") ? "admitted"
    : perClaim.some((c) => c.status === "supported") ? "partial" : "not-found";
  return { status, perClaim };
}

/** A quote the gate can re-check: it resolves at its span in its pinned text and carries the claim's required tokens. */
export function recheckQuote(q, text) {
  if (typeof text !== "string" || !Array.isArray(q?.span)) return "its pinned text is not available";
  const [s, e] = q.span;
  if (folded(q.quote).length < MIN_QUOTE_CHARS) return "the quote is too short to be evidence";
  if (folded(text.slice(s, e)) !== folded(q.quote)) return "the quote does not resolve at its span";
  return null;
}

export { contentWords };
