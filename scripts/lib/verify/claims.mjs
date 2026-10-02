// What a semi-mechanical unit claims, and which of its tokens a source must carry (redesign P7; D17, D19-A).
// A unit is split into sentences; every sentence that trips the semi-mechanical classifier is a claim. A claim's
// REQUIRED tokens are the checkable facts in it — quantities with units, years, months, proper names, superlatives —
// and nothing else: sentence-initial capitals, single letters, symbols and bare coefficients are not facts a source
// can carry. An admitted quote must carry every required token (admission.mjs).
import { plainForQuantities } from "../core/dependencies.mjs";
import { classifyUnit } from "../core/segment.mjs";
import { sha256, canonicalJson } from "../records/canonical.mjs";

const UNIT_RE = "°C|K\\b|kJ|J\\b|mol\\b|M\\b|atm|bar\\b|kPa|Pa\\b|kg|mg|g\\b|mL|L\\b|nm|cm|m\\b|s\\b|min\\b|h\\b|%";
const QUANTITY = new RegExp(`(?<![\\w.])([-−]?\\d+(?:[.,]\\d+)?)\\s*(${UNIT_RE})`, "g");
const YEAR = /(?<![\w.,])(1[5-9]\d{2}|20\d{2})(?![\w.,]\d)/g;
const MONTH = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/g;
const SUPERLATIVE = /\b(most|least|highest|lowest|largest|smallest|first|fastest|strongest|only)\b/gi;
const PARTICLE = /^(?:van|von|de|du|der|le|la|'t|’t)$/i;
// capitalized words that are never names when they appear mid-sentence in course prose
const NOT_NAMES = new Set(["The", "This", "That", "These", "Those", "A", "An", "It", "No", "Yes", "Not", "At", "If", "In", "On", "For", "And", "Or", "But",
  "Objective", "Chapter", "Section", "Figure", "Table", "Example", "Question", "Answer", "Note", "Visual", "Reasoning", "Step", "Q", "K", "Qr"]);

/** Fold a text for matching: diacritics, case, dashes, quotes, markdown emphasis, whitespace. Returns { s, map } with map[i] = original offset. */
// Cyrillic and Greek letters that render like Latin ones (a word spelled with them must not escape the checks)
const CONFUSABLE = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s", "ο": "o", "α": "a", "ν": "v", "Ο": "O", "О": "O", "А": "A", "Е": "E", "С": "C", "Р": "P", "Т": "T", "Н": "H", "К": "K", "М": "M", "В": "B", "Х": "X" };
export const clean = (t) => String(t || "").normalize("NFKC").replace(/[\p{Cf}\u00AD]/gu, "")
  .replace(/[\u0400-\u04FF\u0370-\u03FF](?=[A-Za-z])|(?<=[A-Za-z])[\u0400-\u04FF\u0370-\u03FF]/g, (c) => CONFUSABLE[c] ?? c)
  .replace(/(?<=[A-Za-z])[*_]+(?=[A-Za-z])/g, "");
export function fold(text) {
  const src = String(text || "");
  let s = "", map = [], space = false;
  for (let i = 0; i < src.length; i++) {
    let c = src[i];
    if (/[*_`]/.test(c) || /\p{Cf}/u.test(c)) continue;
    if (/[‐-―−]/.test(c)) c = "-";
    else if (/[‘’‚′]/.test(c)) c = "'";
    else if (/[“”„″]/.test(c)) c = '"';
    if (/\s/.test(c)) { if (!space && s.length) { s += " "; map.push(i); } space = true; continue; }
    space = false;
    for (const d of c.normalize("NFKC").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()) { s += d; map.push(i); }
  }
  if (s.endsWith(" ")) { s = s.slice(0, -1); map.pop(); }
  return { s, map };
}
export const folded = (t) => fold(t).s;

/** Prose for fact extraction: LaTeX and \ce{} folded to plain, markdown links and markup removed. */
const SCI = /([-−–]?\d+(?:\.\d+)?)\s*(?:\\times|×|x)\s*10\s*\^\s*\{?\s*([-−–]?\d+)\s*\}?/g;
const sciPlain = (t) => t.replace(SCI, (_, a, b) => String(Number(a.replace(/[−–]/, "-")) * 10 ** Number(b.replace(/[−–]/, "-"))));
export function proseOf(text) {
  return plainForQuantities(sciPlain(clean(text).replace(/<br\s*\/?>/gi, ". ").replace(/<\/?[a-zA-Z][^>]*>/g, " ").replace(/[\u2010-\u2015](?=\s*\d)/g, "-")))
    .replace(/\\ce\s*/g, " ").replace(/\\[a-zA-Z]+/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`#>]/g, " ")
    .replace(/\s+/g, " ").trim();
}

export function parseNumber(s) { return Number(String(s).replace(/[−\u2010-\u2015]/g, "-").replace(",", ".")); }
const decimals = (s) => (String(s).split(/[.,]/)[1] || "").length;

/** Quantities with units in a text: [{ value, unit, raw, decimals }]. */
export function quantitiesIn(text) {
  const out = [];
  for (const m of proseOf(text).matchAll(QUANTITY)) out.push({ value: parseNumber(m[1]), unit: m[2].replace(/\\b/g, ""), raw: m[0].replace(/\s+/g, ""), decimals: decimals(m[1]), at: m.index });
  return out;
}
export const yearsIn = (text) => [...new Set([...proseOf(text).replace(QUANTITY, " ").matchAll(YEAR)].map((m) => m[1]))];
export const monthsIn = (text) => [...new Set([...clean(text).matchAll(MONTH)].map((m) => m[1]))];
// "First, …" opening an enumeration is an ordinal, not a record claim
export const superlativesIn = (text) => [...new Set([...clean(text).replace(/(^|[.!?]\s+|\n\s*)\**First\b\**,/g, "$1").matchAll(SUPERLATIVE)].map((m) => m[1].toLowerCase()))];
/** How a source may state the exclusivity a claim's "only" asserts: the word or a strict synonym (D27 as amended after
 *  red-team round P7-1 — negating the alternatives proved too weak). Record superlatives need their own word. */
export const EXCLUSIVE = /\b(only|solely|alone|exclusively|sole)\b/;

/** Proper names: runs of capitalized words (with particles) that do not start a sentence, item, label or quote. */
export function namesIn(text) {
  // a dash inside a name is one name in any typography: "Haber–Bosch" is "Haber-Bosch" (P11 wiring sweep)
  const prose = proseOf(text).replace(/\$[^$]*\$/g, " ").replace(/(?<=\p{L})[\u2010-\u2015](?=\p{L})/gu, "-");
  const out = new Set();
  // every boundary after which a capital is grammatical, not a name
  const segments = prose.split(/(?:[.!?:;]\s+|\s[—–-]\s|["“”‘’()\[\]{}|<>]|\s-\s|\n|^)/);
  for (const seg of segments) {
    const words = seg.trim().split(/\s+/).filter(Boolean);
    let run = [];
    const flush = () => {
      while (run.length && PARTICLE.test(run[run.length - 1])) run.pop();
      const caps = run.filter((w) => /^[A-Z]/.test(w));
      if (caps.length && !(caps.length === 1 && NOT_NAMES.has(caps[0]))) out.add(run.join(" "));
      run = [];
    };
    words.forEach((w0, i) => {
      const w = w0.replace(/^[^\p{L}']+|[^\p{L}']+$/gu, "").replace(/'s$|’s$/, "");
      const isCap = /^\p{Lu}\p{Ll}{2,}/u.test(w) && !/^\p{Lu}+$/u.test(w);
      if (i === 0 && !run.length) { // sentence-initial: a name only when it reads as one ("Guldberg and Waage", "Henry Louis …", "Braun's")
        const next = (words[1] || "").replace(/[^\p{L}&]/gu, ""), after = words[2] || "";
        const nameLike = isCap && !NOT_NAMES.has(w) && (/['’]s\b/.test(w0) || (/^(?:and|&)$/.test(next) && /^\p{Lu}\p{Ll}{2,}/u.test(after)) || /^\p{Lu}\p{Ll}{2,}/u.test(next));
        if (nameLike) run.push(w);
        return;
      }
      if (isCap && !NOT_NAMES.has(w)) run.push(w);
      else if (run.length && PARTICLE.test(w)) run.push(w);
      else if (!run.length && PARTICLE.test(w) && /^\p{Lu}/u.test(words[i + 1] || "")) run.push(w);
      else flush();
    });
    flush();
  }
  return [...out].filter((n) => /\p{Lu}\p{Ll}{2,}/u.test(n));
}

/** The words of a name a quote must carry: its last capitalized word (the surname, or the single name). */
export const nameKey = (name) => folded(name.split(/\s+/).filter((w) => /^\p{Lu}/u.test(w)).pop() || name);

/** Content words used to rank passages and to require topical overlap of a quote. */
const STOP = new Set("about above after again against because before being below between both could does doing during each every further having into itself more most other ought over same should since some such than that their theirs them then there these they this those through under until very were what when where which while whom with would your only also just like make made many much must need never always often system value change changes".split(" "));
export const contentWords = (text) => [...new Set((folded(proseOf(text)).match(/[a-z]{5,}/g) || []).filter((w) => !STOP.has(w)))];

/** Sentences of a unit (list items and table cells count as sentences). */
export function sentencesOf(text) {
  return String(text || "").split(/\n\s*(?:[-*+]|\d+\.)\s+|\n{2,}|(?<=[.!?])\s+(?=["“*]*[A-Z])/).map((s) => s.trim()).filter((s) => /[A-Za-z]{3,}/.test(s));
}

// ---- exclusivity: "only" (D29, hardened by red-team round D29-1) -------------------------------------------------
// "not only" and degree uses ("only partially", "only in part") are not absolutes. "solely", "exclusively", "the sole"
// and "nothing but" are read as "only"; "X alone" and "none other than" are exclusivities that cannot be scoped here.
// An exclusivity is SCOPED when its comparison set is attached to the "only" in words:
//     "Of A, B and C, only X …"      "… neither A nor B, only X"      "only X, not A or B"
// and is then verified as a conjunction (X does it; each named alternative does not). Anything else — no set, a set
// named elsewhere ("of these four"), a symbol in the set, two exclusivities in one sentence — is OPEN: a general
// absolute no source can prove; it is an obligation to name the set or reword (D29).
const HEDGE = /^\s*(?:in part|partially|partial|slightly|approximately|briefly|marginally|a little|a bit|just)\b/;
export const NEGATION = /\b(?:not|no|neither|nor|never|unchanged|unaffected|without|cannot|can't|doesn't|don't|isn't|aren't|won't)\b/;
const ARTICLES = /^(?:the|a|an|its|their|this|these|that|those)\s+/;
const keysOf = (phrase) => (folded(phrase).match(/[a-z][a-z'-]{2,}/g) || []).filter((w) => !STOP.has(w) && !/^(?:the|and|for|its|how|any|one|two|three|four|five|which|what|who)$/.test(w));
const listItems = (list) => list.split(/,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+/).map((x) => x.trim().replace(ARTICLES, "").trim()).filter(Boolean);
const NP = "(?:(?:the|a|an)\\s+)?[A-Za-z][\\w'’-]*(?:\\s+[A-Za-z][\\w'’-]*){0,4}"; // a short noun phrase: up to five words
const LIST = `${NP}(?:,\\s*${NP})*,?\\s+(?:and|or)\\s+${NP}`;
const EXCL = /\b(?:only|solely|exclusively|the\s+sole|nothing\s+but)\b/gi;

export function exclusivityOf(sentence) {
  let S = proseOf(sentence).replace(/\$[^$]*\$/g, (m) => m.replace(/\s+/g, ""));
  if (/\b(?:alone|none\s+other\s+than)\b/i.test(S)) return { open: true, positive: (S.match(/(\S+(?:\s+\S+)?)\s+alone\b/i)?.[1] || "") + " alone" };
  S = S.replace(EXCL, (w) => (/sole/i.test(w) && /the/i.test(w) ? "the only" : "only"));
  const hits = [...S.matchAll(/\bonly\b/gi)].filter((m) => !/\bnot\s*$/i.test(S.slice(0, m.index)) && !HEDGE.test(S.slice(m.index + 4)));
  if (!hits.length) return null;
  if (hits.length > 1) return { open: true, positive: "(several in one sentence)" };
  const at = hits[0].index, before = S.slice(0, at), after = S.slice(at + 4);
  // the member: "X is the only …" → X; otherwise the phrase after "only" (a leading gerund is kept with its noun)
  const isThe = before.match(new RegExp(`(${NP})\\s+(?:is|are|was|were)\\s+(?:also\\s+)?the\\s*$`, "i"));
  const phrase = isThe ? isThe[1] : (after.match(new RegExp(`^\\s*(${NP})`))?.[1] || "");
  const pk = keysOf(phrase);
  const lead = pk.findIndex((k) => !/ing$/.test(k));
  const pos = isThe ? pk.slice(-1) : lead < 0 ? pk.slice(0, 1) : pk.slice(0, lead + 1);
  // the set, attached to the "only"
  const alts = [];
  // the set heads its clause ("Of A, B and C, only X"; "No — of A and B, only X"), not "the concentrations of A and B"
  const ofList = before.match(new RegExp(`(?:^|[;:—–]\\s*|\\s-\\s*|^No\\s*[—–-]\\s*)(?:of|among|out of)\\s+(?:the\\s+|these\\s+)?(${LIST})\\s*,?\\s*$`, "i"));
  if (ofList) alts.push(...listItems(ofList[1]));
  const nn = before.match(new RegExp(`\\bneither\\s+(${NP})\\s+nor\\s+(${NP})\\s*(?:,|—|–|-|;)?\\s*$`, "i"));
  if (nn) alts.push(nn[1], nn[2]);
  const notList = after.match(new RegExp(`^[^,;:.—]{1,80}?,\\s*not\\s+(${NP}(?:(?:,\\s*${NP})*,?\\s+(?:or|and)\\s+${NP})?)\\s*(?=[,;.:—]|$)`, "i"));
  if (notList) alts.push(...listItems(notList[1]));
  const items = [...new Set(alts.map((a) => a.replace(ARTICLES, "").trim()))].filter((a) => !(keysOf(a).length && keysOf(a).every((k) => pos.includes(k))));
  const label = phrase.trim() || after.trim().split(/\s+/).slice(0, 4).join(" ");
  if (!pos.length || !items.length || items.some((a) => !keysOf(a).length)) return { open: true, positive: label };
  return { open: false, positive: pos, alternatives: items.map((a) => ({ phrase: a, keys: keysOf(a).slice(0, 3) })) };
}

/** The claims of a semi-mechanical unit: [{ index, text, required: { quantities, years, months, names, superlatives }, words }]. */
export function semiClaims(text) {
  const claims = [];
  for (const s of sentencesOf(text)) {
    if (!classifyUnit({ form: "paragraph", text: clean(s) }).includes("semi-mechanical") && !exclusivityOf(s)) continue;
    claims.push(claimOf(s, claims.length + 1));
  }
  // a unit that trips the classifier only as a whole (a fact split across lines) is one claim
  if (!claims.length) claims.push(claimOf(String(text).trim(), 1));
  return claims;
}

/** One claim from one sentence (re-deriving a recorded claim: its required tokens come from its text, never from the record). */
export function claimOf(text, index) {
  const ex = exclusivityOf(text);
  // "only" is checked through its exclusivity (D29), never as a bare word; the other superlatives keep their word
  const superlatives = superlativesIn(text).filter((w) => w !== "only");
  return { index, text, required: { quantities: quantitiesIn(text), years: yearsIn(text), months: monthsIn(text), names: namesIn(text), superlatives, exclusive: ex && !ex.open ? ex : null }, ...(ex?.open ? { open: true, openPhrase: ex.positive } : {}), words: contentWords(text) };
}

/** The claims a source can check: those with at least one required token. A sentence that trips the classifier but
 *  carries no value, year, month, name or superlative is not a semi-mechanical fact; the knowledge path covers it (D28). */
export const checkableClaims = (text) => semiClaims(text).filter((c) => !c.open && requiredCount(c.required) > 0).map((c, i) => ({ ...c, index: i + 1 }));
/** Open exclusivities: general absolutes no source can prove — an obligation to name the set or reword (D29). */
export const openAbsolutes = (text) => sentencesOf(text).map((s, i) => claimOf(s, i + 1)).filter((c) => c.open);
/** Quote evidence binds to the exact checkable sentences: any edit to one of them needs re-verification (D28). */
export const claimsHash = (text) => sha256(canonicalJson(checkableClaims(text).map((c) => clean(c.text).replace(/\s+/g, " ").trim())));

export const requiredCount = (r) => r.quantities.length + r.years.length + r.months.length + r.names.length + r.superlatives.length + (r.exclusive ? 1 + r.exclusive.alternatives.length : 0);
