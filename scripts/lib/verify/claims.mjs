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
export const clean = (t) => String(t || "").normalize("NFKC").replace(/\p{Cf}/gu, "");
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
  return plainForQuantities(sciPlain(clean(text).replace(/[\u2010-\u2015](?=\s*\d)/g, "-")))
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
  const prose = proseOf(text).replace(/\$[^$]*\$/g, " ");
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

/** The claims of a semi-mechanical unit: [{ index, text, required: { quantities, years, months, names, superlatives }, words }]. */
export function semiClaims(text) {
  const claims = [];
  for (const s of sentencesOf(text)) {
    if (!classifyUnit({ form: "paragraph", text: s }).includes("semi-mechanical")) continue;
    claims.push(claimOf(s, claims.length + 1));
  }
  // a unit that trips the classifier only as a whole (a fact split across lines) is one claim
  if (!claims.length) claims.push(claimOf(String(text).trim(), 1));
  return claims;
}

/** One claim from one sentence (re-deriving a recorded claim: its required tokens come from its text, never from the record). */
export const claimOf = (text, index) => ({ index, text, required: { quantities: quantitiesIn(text), years: yearsIn(text), months: monthsIn(text), names: namesIn(text), superlatives: superlativesIn(text) }, words: contentWords(text) });

/** The claims a source can check: those with at least one required token. A sentence that trips the classifier but
 *  carries no value, year, month, name or superlative is not a semi-mechanical fact; the knowledge path covers it (D28). */
export const checkableClaims = (text) => semiClaims(text).filter((c) => requiredCount(c.required) > 0).map((c, i) => ({ ...c, index: i + 1 }));
/** Quote evidence binds to the exact checkable sentences: any edit to one of them needs re-verification (D28). */
export const claimsHash = (text) => sha256(canonicalJson(checkableClaims(text).map((c) => clean(c.text).replace(/\s+/g, " ").trim())));

export const requiredCount = (r) => r.quantities.length + r.years.length + r.months.length + r.names.length + r.superlatives.length;
