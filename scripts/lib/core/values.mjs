// ONE value parser (red-team round 1, CONFIDENCE F1–F4, F7, F10). The claim extractor (verify/claims.mjs) and the
// semi-mechanical classifier (core/segment.mjs) read values through this file, and its units come from the harness's
// one unit table (lib/units.mjs, valueProjection): a value in mmHg, kcal, °F or V is a value like any other.
//
// What a value is:
//   - a number bound to a unit, with the unit's denominators ("kJ/mol", "kJ per gram", "kJ g⁻¹", "J K^-1 mol^-1"):
//     kJ/mol, kJ/g and kJ are three different units, never one;
//   - a number in scientific notation, mantissa and exponent ("9 × 10⁻⁶", "9 \times 10^{-6}", "9e-6", "10^{5}",
//     the source extraction's "10 −5"), kept EXACTLY as "9e-6" — never through a float-to-string round trip;
//   - a dimensionless quantity bound to a symbol (K = 1e5, K_p on the order of 10^5, pH = 7) or a bare power of ten.
// Numbers read thousands separators ("200,000" is two hundred thousand) and every minus a typesetter writes: "−92",
// "- 92.2" after "=", "-\,92.2", "{-}92". A minus right after a number is a subtraction or a range, never a sign.
// Bare integers stay out ("step 3", "Chapter 2"): only a unit, a symbol or a power of ten makes a number a value.
// Round 5 (R5-K01/K02): a value is read in its compound spellings too — "a 2,000-atmosphere loop", "9 hundred kJ",
// "K is about one hundred", "a pH of seven" — and a range with BOTH its ends. What the net catches but cannot read
// without a guess ("several thousand atmospheres") is returned by unreadValues: never a value, never silent.
//
// PURE and DETERMINISTIC.
import { valueProjection } from "../units.mjs";
import { readerView } from "./rendered.mjs";

// Quantities are found after folding LaTeX spellings ("-92\\ \\text{kJ mol}^{-1}" → "-92 kJ mol"), since the packages
// write most values in LaTeX; a value written two ways is still one shared value. (Moved here from core/dependencies.mjs,
// which re-exports it, so the dependency edges can read bindings through this parser without an import cycle.)
// Every font macro prints its argument as text (red-team round 6, R6-K06: "\\textrm{kJ}", "\\mathsf{kJ}", "{\\rm kJ}" and
// "\\operatorname{kJ}" print "kJ" as "\\mathrm{kJ}" does, and were no unit here while the claim reader read them).
const FONT_MACROS = "text|textrm|textsf|textit|textbf|textup|textnormal|texttt|textsl|emph|mathrm|mathsf|mathit|mathbf|mathnormal|mathtt|mathup|mathbfit|operatorname\\*?|mbox|hbox|boldsymbol|bm";
const FONT_ARG = new RegExp(`\\\\(?:${FONT_MACROS})\\s*\\{([^}]*)\\}`, "g");
const FONT_SWITCH = /\{\s*\\(?:rm|sf|it|bf|tt|sl|up|normalfont|mathrm)(?![A-Za-z])\s*([^{}]*)\}/g;
export const plainForQuantities = (text) => String(text)
  .replace(FONT_SWITCH, " $1 ").replace(FONT_ARG, " $1 ").replace(/\\(?:,|;|!| |quad|qquad)/g, " ")
  .replace(/\^\{[^}]*\}/g, "").replace(/[{}$]/g, " ").replace(/\\(?:approx|times)/g, " ").replace(/−/g, "-");

// Cyrillic and Greek letters that render like Latin ones (a word spelled with them must not escape the checks)
const CONFUSABLE = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s", "ο": "o", "α": "a", "ν": "v", "Ο": "O", "О": "O", "А": "A", "Е": "E", "С": "C", "Р": "P", "Т": "T", "Н": "H", "К": "K", "М": "M", "В": "B", "Х": "X" };
export const clean = (t) => String(t || "").normalize("NFKC").replace(/[\p{Cf}­]/gu, "")
  .replace(/[Ѐ-ӿͰ-Ͽ](?=[A-Za-z])|(?<=[A-Za-z])[Ѐ-ӿͰ-Ͽ]/g, (c) => CONFUSABLE[c] ?? c)
  .replace(/(?<=[A-Za-z])[*_]+(?=[A-Za-z])/g, "");

// HTML character references a markdown renderer shows as characters (red-team round 2, R2-K07: "&minus;92.2 kJ" reads
// as −92.2 kJ to every student and was read as +92.2 by the harness). Named minus/dash/space/sign entities and every
// numeric reference are decoded before anything else reads the text.
const ENTITIES = { minus: "−", ndash: "–", mdash: "—", hyphen: "‐", dash: "‐", plus: "+", plusmn: "±", pm: "±", nbsp: "\u00A0", thinsp: "\u2009", ensp: "\u2002", emsp: "\u2003", deg: "°", times: "×", middot: "·", sdot: "⋅", sup1: "¹", sup2: "²", sup3: "³", micro: "µ", mu: "μ", Delta: "Δ", amp: "&", lt: "<", gt: ">", le: "≤", ge: "≥", rarr: "→", harr: "↔", rlarr: "⇄", rlhar: "⇌", lrhar: "⇋" };
export const decodeEntities = (t) => String(t ?? "").replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,8}));/g, (m, dec, hex, name) => {
  if (dec || hex) { const cp = dec ? Number(dec) : parseInt(hex, 16); return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m; }
  return ENTITIES[name] ?? m;
});

// Unicode superscripts are read as exponents BEFORE NFKC folds them into plain digits ("10⁵" would become "105")
const SUP = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "⁺": "+" };
const supFold = (t) => String(t).replace(/[⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => `^{${[...m].map((c) => SUP[c]).join("")}}`);

const MINUS = "[-−\\u2010-\\u2015]";
const NUM = String.raw`(?:\d{1,3}(?:,\d{3})+(?![\d])(?:\.\d+)?|\d+(?:[.,]\d+)?)`;
// a sign: a minus not preceded by a number or a closing bracket (else it subtracts) — a unit's exponent ("mol^-1") is
// not a number — spaces and LaTeX spacing allowed; and never the minus of an exponent itself
const SIGN = `(?:(?<!(?:(?<![-−^])\\d|[.)\\]}])\\s*)(?<![A-Za-z_^])(${MINUS})\\s*(?:\\\\[,;:! ]\\s*)*)?(?<!\\^\\s*[-−]?\\s*)`;
const TIMES = String.raw`(?:\\times|\\cdot|×|·|⋅|x|\*)`;
// scientific notation: [sign mantissa ×] 10^{e} | 10^e | 10 −e (the source extraction's flattened superscript)
const SCI = new RegExp(`${SIGN}(?:(?<![\\w.])(${NUM})\\s*${TIMES}\\s*)?(?<![\\w.])10\\s*(?:\\^\\s*\\{\\s*(${MINUS}|\\+)?\\s*(\\d+)\\s*\\}|\\^\\s*(${MINUS}|\\+)?(\\d+)|(−)\\s*(\\d+))(?![\\d.])`, "g");
const ENOT = new RegExp(`${SIGN}(?<![\\w.])(\\d+(?:\\.\\d+)?)[eE](${MINUS}|\\+)?(\\d+)(?![\\w.])`, "g");
const neg = (s) => (s && s !== "+" ? "-" : "");
function foldSci(t) {
  return t
    .replace(SCI, (_, sign, mant, s1, e1, s2, e2, s3, e3) => `${neg(sign)}${mant ? mant.replace(/,/g, "") : "1"}e${neg(s1 ?? s2 ?? s3)}${e1 ?? e2 ?? e3}`)
    .replace(ENOT, (_, sign, mant, s, e) => `${neg(sign)}${mant}e${neg(s)}${e}`);
}

// phrasing elements print their text inline, joined to what is beside it ("k<span>J</span>" reads "kJ"); any other tag
// is a break
const INLINE_TAG = /<\/?(?:span|b|i|em|strong|mark|small|u|a|abbr|code|kbd|var|cite|q|ins|bdi|bdo|data|dfn|samp|time)(?:\s[^>]*)?>/gi;
/** Text for value extraction: LaTeX folded to plain, scientific notation to an exact "<mantissa>e<exponent>", unit
 *  exponents kept ("g^{-1}" → "g^-1"). Markup is left to the caller (claims.proseOf). */
export function valueText(text) {
  let t = clean(supFold(texSpellings(decodeEntities(text || ""))))
    // an HTML superscript is an exponent whatever its minus (red-team round 3, R3-K07: "10<sup>-5</sup>" read as 10)
    .replace(/<sup>\s*([-−‐-―+]?)\s*(\d+)\s*<\/sup>/gi, (_, s, d) => `^{${s && s !== "+" ? "-" : ""}${d}}`)
    .replace(/<sub>\s*([A-Za-z]{1,3})\s*<\/sub>/gi, "$1") // K<sub>p</sub> is Kp
    .replace(/<br\s*\/?>/gi, ". ").replace(INLINE_TAG, "").replace(/<\/?[a-zA-Z][^>]*>/g, " ").replace(/[‐-―](?=\s*\d)/g, "-");
  t = t.replace(/\{\s*([-−])\s*\}/g, "$1"); // {-}92
  // a symbol's subscript in any LaTeX spelling is the symbol (R3-K01: "K_{p}", "K_\mathrm{p}", "K_{\text{eq}}")
  t = t.replace(/(?<![A-Za-z\\])(K|pK)\s*_\s*(?:\{\s*)?(?:\\(?:mathrm|text|textrm|rm|mathit)\s*\{?\s*)?([A-Za-z]{1,3})\s*\}?\s*\}?/g, "$1$2");
  // a sign written as a word is a sign (R3-K02/K07: "minus 63.7 kJ" was read as +63.7): "minus"/"negative" before a
  // number reads as the minus a typesetter writes, "plus"/"positive" as a plus. A minus right after a number stays a
  // subtraction (SIGN below), so "100 minus 37 kJ" is never "−37 kJ".
  // a number written in words before a unit is a value (red-team round 4, R4-K08: "two thousand atmospheres" made no
  // claim at all); read before the sign words, so "minus nine hundred kJ" is −900 kJ
  t = numberWords(t);
  t = t.replace(/\b(?:minus|negative)\s+(?=[(\d])/gi, "−").replace(/\b(?:plus|positive)\s+(?=[(\d])/gi, "+");
  // a bracketed value with its sign outside or inside: "−(63.7) kJ", "(−63.7) kJ" — never an expression ("(0.20)^2",
  // "(0.10)(0.30)"), which the arithmetic check reads (verify/mechanical.mjs)
  t = t.replace(new RegExp(`(?:([-−+])\\s*)?\\(\\s*(?:([-−+])\\s*)?(${NUM})\\s*\\)(?!\\s*[\\^(\\d.])`, "g"), (m, s1, s2, n, at, all) => {
    if (/[\d)\]]\s*$/.test(all.slice(0, at)) || /[\d)]\s*$/.test(all.slice(0, at) + (s1 || ""))) return m; // a product or difference
    if (!s1 && !s2) return m; // an unsigned bracket is left as written
    const neg = [s1, s2].filter((x) => x && x !== "+").length % 2 === 1;
    return `${neg ? "−" : ""}${n}`;
  });
  t = t.replace(/\\(?:approx|simeq)(?![A-Za-z])/g, "≈").replace(/\\sim(?![A-Za-z])/g, "~"); // "K \approx 50" binds K
  t = foldSci(t);
  t = t.replace(/\^\s*\{\s*([-−+]?)\s*(\d+)\s*\}/g, (_, s, d) => `^${s === "−" ? "-" : s}${d}`);
  // a degree sign set apart from its scale ("° C", from "^{\circ}\mathrm{C}") is one unit
  return plainForQuantities(t).replace(/([°º˚])\s+(?=[CF](?![A-Za-z]))/g, "$1");
}

// LaTeX spellings of a value that print as the plain value (red-team round 6, R6-K07, R6-K11): sizing commands around a
// bracket ("\left(-75.0\right)" prints "(−75.0)"), a degree written with \circ ("-20\,^{\circ}\mathrm{C}" prints
// "−20 °C"), a tie between a number and its unit ("-75.0~\text{kJ}" prints "−75.0 kJ"; the house subscript "H~2~O" is
// not a tie), and a multiplication sign printed twice (OpenStax's extraction "6.00 × × 10 −2" is 6.00 × 10⁻²).
const SIZING = /\\(?:left|right|bigl|bigr|Bigl|Bigr|biggl|biggr|Biggl|Biggr|bigm|Bigm|big|Big|bigg|Bigg)(?![A-Za-z])\s*(?:\.|\\([{}|])|([()[\]|/]))/g;
const DEGREE = /(?:\{\s*\}\s*)?\^\s*(?:\{\s*\\circ\s*\}|\\circ(?![A-Za-z]))|\\(?:degree|textdegree)(?![A-Za-z])/g;
const TIE = /(?<=\d)(?<![~^]\d*)(?<![~^]\d+[.,]\d*)\s*~(?=\s*(?:\\[A-Za-z]|\{|[°º˚µ%]|[A-Za-z]))/g;
const TIMES_TWICE = /(×|\\times(?![A-Za-z]))(?:\s*(?:×|\\times(?![A-Za-z])))+/g;
// A unit typeset in pieces prints as one word (red-team round 7, R7-K09): "\mathrm{k}\mathrm{J}" and "\text{k}\text{J}"
// print "kJ" (in maths the space between two font groups is not printed), and "\mathrm{~kJ}" prints " kJ" — a tie or
// a spacing command inside the group is space before the unit. Adjacent font groups are read as one group unless the
// second carries a script ("\text{kJ} \text{mol}^{-1}" stays two units), as the reader view typesets them.
const FONT_GROUP = `\\\\(?:${FONT_MACROS})\\s*\\{`;
const GROUP_LEAD_SPACE = new RegExp(`(${FONT_GROUP})\\s*(?:~|\\\\[,;:! ]|\\\\(?:quad|qquad)(?![A-Za-z]))+\\s*`, "g");
const ADJACENT_GROUPS = new RegExp(`(${FONT_GROUP})([^{}]*)\\}\\s*${FONT_GROUP}([^{}]*)\\}(?!\\s*[\\^_])`, "g");
const joinFontGroups = (t) => { let s = String(t).replace(GROUP_LEAD_SPACE, " $1"), prev; do { prev = s; s = s.replace(ADJACENT_GROUPS, (_, open, a, b) => `${open}${a}${b}}`); } while (s !== prev); return s; };
// what a markdown reader never sees between a value's characters (red-team round 7, R7-K11): a backslash escape inside
// a number ("−75\.0", as converters write it) prints the character; an inline element around part of a word
// ("k<span>J</span>") prints the word whole
const MD_ESCAPE_IN_NUMBER = /(?<=\d)\\\.(?=\d)/g;
export const texSpellings = (t) => joinFontGroups(String(t).replace(MD_ESCAPE_IN_NUMBER, ".")).replace(SIZING, (_, esc, d) => esc ?? d ?? "").replace(DEGREE, "°").replace(TIE, " ").replace(TIMES_TWICE, "$1");

/** The text the claim reader reads values from (THE value view, red-team round 6, cause A): valueText, then every
 *  remaining LaTeX command, \ce, markdown link syntax and markup folded away. The classifier (statesValue), the claim
 *  extractor (claims.quantitiesIn via names.proseOf), the cross-deliverable value check (consistency.mjs) and the
 *  shared-value edges (dependencies.mjs) all read values through this one view, so no reader can find a value another
 *  misses. */
export function valueProse(text) {
  return valueText(text)
    .replace(/\\ce\s*/g, " ").replace(/\\[a-zA-Z]+/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`#>]/g, " ")
    .replace(/\s+/g, " ").trim();
}
/** Every value the claim reader requires in a text — read values and unread candidates alike, positions indexing
 *  valueProse(text). The ONE answer to "does this text state a value?" (statesValue) and "which values must a source
 *  carry?" (claims.quantitiesIn). */
export function readValues(text) {
  const P = valueProse(text);
  const out = [...valuesIn(P), ...unreadValues(P).map((u) => ({ ...u, value: NaN, unit: "unread", decimals: 0, exp: 0 }))];
  // THE READER VIEW NET (red-team round 7, R7-K09/K11): a value is what a reader SEES. Where markup or TeX stands
  // between the source and the page (a backslash, a tag), the text is also read as rendered (core/rendered.mjs
  // readerView), and a value the reader sees that the source view did not read is a value too — read, never silent.
  // Its position is the end of the source view (it has no place there).
  if (/[\\<]/.test(String(text ?? ""))) {
    const R = valueProse(readerView(text));
    if (R !== P) for (const q of valuesIn(R)) if (!out.some((x) => x.unit === q.unit && x.value === q.value)) out.push({ ...q, at: P.length, end: P.length, view: "reader" });
  }
  return out.sort((a, b) => a.at - b.at);
}

// ---- units ------------------------------------------------------------------------------------------------------
// The shared table, plus the forms it cannot hold: "M" (molar) case-collapses with "m" (metre) in M3's lowercase
// world, so the table refuses it; values keep reading it as the claim extractor always did.
const EXTRA = [{ form: "per cent", pattern: "[pP]er [cC]ent", symbol: "%" }, { form: "mM", pattern: "mM", symbol: "mM" }, { form: "µM", pattern: "µM", symbol: "µM" }, { form: "M", pattern: "M", symbol: "M" }];
const FORMS = [...valueProjection(), ...EXTRA].sort((a, b) => b.form.length - a.form.length || (a.form < b.form ? -1 : a.form > b.form ? 1 : 0));
const symbolOf = (matched) => {
  for (const f of FORMS) if (new RegExp(`^(?:${f.pattern})$`).test(matched)) return f.symbol;
  return matched;
};
const UNIT_ALT = FORMS.map((f) => f.pattern).join("|");

// ---- numbers written in words (red-team round 4, R4-K08) ---------------------------------------------------------
// "two thousand atmospheres" and "nine hundred kilojoules per mole" are values like "2,000 atm": a number written in
// words straight before a unit of the table is read as its digits, so the sentence is semi-mechanical and owes
// evidence (fail closed: a value nobody reads is a silent fact). A small count of moles ("four moles of gas → two
// moles") is stoichiometry, a coefficient in words, and stays a word as "4 mol" in an equation would be a coefficient.
const SMALL_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS_WORDS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE_WORDS = { thousand: 1e3, million: 1e6, billion: 1e9 };
const NUM_WORD = `(?:${[...Object.keys(SMALL_WORDS), ...Object.keys(TENS_WORDS), "hundred", ...Object.keys(SCALE_WORDS)].sort((a, b) => b.length - a.length).join("|")})`;
// a phrase may end before a hyphen that joins it to its unit ("two-thousand-atmosphere loops", red-team round 5, R5-K01)
const WORDS_PHRASE = new RegExp(`(?<![\\w-])(?:(an?)\\s+(?=(?:hundred|thousand|million|billion)\\b))?(${NUM_WORD}(?:(?:\\s+and\\s+|[\\s-]+)${NUM_WORD})*)(?![\\w])`, "gi");
// the unit straight after a number: a space, or the hyphen of a compound adjective ("a 2,000-atmosphere loop", R5-K01)
const UNIT_GAP = "(?:[\\s\\u00A0]*|-)";
const UNIT_AHEAD = new RegExp(`^${UNIT_GAP}(?:${UNIT_ALT})(?![A-Za-z0-9])`);
// a symbol binding straight before a number ("K is about", "a pH of", "K_p ≈"): the number after it is the symbol's value
const BINDING = "(?:=|≈|~|≃|\\\\approx|is|was|of|on the order of|order of|equals|about|approximately|around|roughly|close to|near|only|just)";
const SYMBOL_NAMES = "K(?:\\s?(?:sp|eq|p|c|a|b|w))?|pH|pOH|pK\\s?a";
const BOUND_BEFORE = new RegExp(`(?<![\\p{L}\\d])(?:${SYMBOL_NAMES})(?![\\p{L}\\d])\\s*(?:${BINDING}\\s*){1,4}$`, "u");
/** The value of a number written in words ("two thousand", "nine hundred and five", "twenty-five"), or null. */
export function wordsValue(phrase, leadingA = false) {
  let total = 0, cur = leadingA ? 1 : 0, last = leadingA ? "small" : null;
  for (const w of phrase.toLowerCase().split(/\s+and\s+|[\s-]+/).filter(Boolean)) {
    if (w in SMALL_WORDS) { if (last === "small" || (last === "tens" && SMALL_WORDS[w] >= 10)) return null; cur += SMALL_WORDS[w]; last = "small"; }
    else if (w in TENS_WORDS) { if (last === "small" || last === "tens") return null; cur += TENS_WORDS[w]; last = "tens"; }
    else if (w === "hundred") { if (!cur || cur >= 100 || last === "hundred") return null; cur *= 100; last = "hundred"; }
    else if (w in SCALE_WORDS) { if (!cur) return null; total += cur * SCALE_WORDS[w]; cur = 0; last = "scale"; }
    else return null;
  }
  return last ? total + cur : null;
}
function numberWords(t) {
  // digits with a scale word are one number ("9 hundred kilojoules", "1.5 million pascals"; R5-K01)
  t = t.replace(new RegExp(`(?<![\\w.,])(${NUM})[\\s-]+((?:hundred|thousand|million|billion)(?:[\\s-]+(?:thousand|million|billion))*)(?![\\w])`, "gi"), (m, n, scales) => {
    const k = scales.toLowerCase().split(/[\s-]+/).reduce((x, w) => x * (w === "hundred" ? 100 : SCALE_WORDS[w]), 1);
    const v = Number((parseNumber(n) * k).toPrecision(15));
    return Number.isFinite(v) && v < 1e21 ? String(v) : m;
  });
  return t.replace(WORDS_PHRASE, (m, a, phrase, at, all) => {
    const ahead = all.slice(at + m.length).match(UNIT_AHEAD);
    // a number word bound to a symbol is the symbol's value ("K is about one hundred", "a pH of seven"; R5-K01) — but a
    // lone "one" before a noun is a determiner ("the K of one reaction"), not a value
    const bound = !ahead && BOUND_BEFORE.test(all.slice(Math.max(0, at - 60), at)) && !(/^one$/i.test(phrase) && /^\s+[a-z]/i.test(all.slice(at + m.length)) && !/^\s+(?:and|or|at|in|for|when|if|so|but|which|while|under|with|by|to|than)\b/i.test(all.slice(at + m.length)));
    if (!ahead && !bound) return m;
    const v = wordsValue(phrase, !!a);
    if (v == null) return m;
    const scaled = !!a || /hundred|thousand|million|billion/i.test(phrase);
    if (ahead && !scaled && v <= 12 && symbolOf(ahead[0].replace(/^[\s\u00A0-]+/, "")) === "mol") return m; // a count of moles: stoichiometry
    return String(v);
  });
}

// ---- a sign carried by a verb (red-team round 4, R4-K13/K14) ------------------------------------------------------
// "92.2 kJ of heat is released" states ΔH = −92.2 kJ; "absorbs 50 kJ" states +50 kJ. An amount of energy that a verb
// says is released (given off, evolved, liberated, emitted) or absorbed (taken in, taken up) is read with the verb's
// sign, as the enthalpy change it states — written number × the verb's sign, so "−92.2 kJ of heat is released" reads
// +92.2 kJ, literally (negative heat released is heat absorbed). Only an energy, only with the verb in the same clause
// right beside the value; a value bound to a symbol ("ΔH = −92.2 kJ, so heat is released") keeps its written sign.
const ENERGY = /^(?:k?J|k?cal|eV)(?:\/|$)/;
const RELEASE = "releas(?:e|es|ed|ing)|giv(?:e|es|ing)\\s+off|gave\\s+off|given\\s+off|evolv(?:e|es|ed|ing)|liberat(?:e|es|ed|ing)|emit(?:s|ted|ting)?|produc(?:e|es|ed|ing)";
const ABSORB = "absorb(?:s|ed|ing)?|tak(?:e|es|ing)\\s+(?:in|up)|took\\s+(?:in|up)|taken\\s+(?:in|up)";
const HEDGES = "(?:(?:about|approximately|roughly|nearly|around|some|only|just|exactly|almost|over|under|up\\s+to|close\\s+to|more\\s+than|less\\s+than|at\\s+least)\\s+)*";
const VERB_AFTER = new RegExp(`^\\s*(?:of\\s+(?:heat|energy|thermal\\s+energy)\\s+)?(?:(?:is|are|was|were|be|been|being|gets?|got|will|would|has|have|had|can|could|may|must)\\s+)*(?:(${RELEASE})|(${ABSORB}))(?![A-Za-z])`, "i");
const VERB_BEFORE = new RegExp(`(?:(?<![A-Za-z])(?:(${RELEASE})|(${ABSORB}))|(?:heat|energy)\\s+(?:(${RELEASE})|(${ABSORB}))\\s+(?:is|was|are|were|=|:|equals|amounts\\s+to|of))\\s+${HEDGES}$`, "i");
/** The sign a verb gives an energy value at [at, end) of P: −1 (released), +1 (absorbed), or 0. */
function verbSignAt(P, at, end) {
  const before = P.slice(Math.max(0, at - 80), at).split(/[.;!?,(]/).pop(), after = P.slice(end, end + 80).split(/[.;!?,)]/)[0];
  const b = before.match(VERB_BEFORE), a = after.match(VERB_AFTER);
  const m = b ? (b[1] || b[3] ? -1 : 1) : a ? (a[1] ? -1 : 1) : 0;
  return m;
}
// a symbol unit embedding its own denominator ("kJ/mol") is the same unit as "kJ per mole": both read "kJ/mol"
const QTY = new RegExp(`${SIGN}(?<![\\w.])(${NUM}(?:e-?\\d+)?)${UNIT_GAP}(${UNIT_ALT})(?![A-Za-z0-9])`, "g");
// the lower end of a range, straight before its upper end: "[between|from] 40 and|to|or|through 500 °C", "40–500 °C",
// "40-500 °C" (a dash joins a range only with no space: "100 - 37 kJ" may be a subtraction, and is not guessed at)
const RANGE_BEFORE = new RegExp(`(?<![\\w.,])(${MINUS}\\s*)?(${NUM})(?:[–—]|[-−]|\\s+(?:and|or|to|through)\\s+)$`);
const DEN_WORDS = { mole: "mol", moles: "mol", mol: "mol", gram: "g", grams: "g", g: "g", kilogram: "kg", kg: "kg", litre: "L", liter: "L", litres: "L", liters: "L", L: "L", mL: "mL",
  second: "s", s: "s", minute: "min", min: "min", hour: "h", h: "h", kelvin: "K", K: "K", metre: "m", meter: "m", m: "m", cm: "cm", molecule: "molecule", atom: "atom", day: "day", year: "year" };
const DEN_ALT = Object.keys(DEN_WORDS).sort((a, b) => b.length - a.length).join("|");
const DENOM = new RegExp(`(?:\\s*/\\s*(${DEN_ALT})(?![A-Za-z0-9])|\\s+per\\s+(${DEN_ALT})(?![A-Za-z0-9])(?:\\s+of\\s+(?:the\\s+)?reaction)?|[\\s·⋅]+(${DEN_ALT})\\s*\\^?\\s*-\\s*1(?!\\d))`, "y");
function denominators(P, at) {
  let unit = "", end = at;
  for (let k = 0; k < 3; k++) {
    DENOM.lastIndex = end;
    const m = DENOM.exec(P);
    if (!m) break;
    unit += `/${DEN_WORDS[m[1] ?? m[2] ?? m[3]]}`;
    end = DENOM.lastIndex;
  }
  return { unit, end };
}

// a dimensionless quantity bound to a symbol: K, K_p, K_c, K_a, K_b, K_sp, K_w, K_eq, pH, pOH, pK_a
const SYMBOL = new RegExp(`(?<![\\p{L}\\d])(${SYMBOL_NAMES})(?![\\p{L}\\d])\\s*((?:${BINDING}\\s*){1,4})`, "gu");
const BARE = new RegExp(`${SIGN}(?<![\\w.])(${NUM}(?:e-?\\d+)?)`, "y");
const SCIBARE = new RegExp(`${SIGN}(?<![\\w.])(\\d+(?:\\.\\d+)?e-?\\d+)(?![\\w.])`, "g");

/** Parse a number as written: thousands separators, a comma decimal, an exact exponent. */
export function parseNumber(s) {
  const t = String(s).replace(/[−‐-―]/g, "-");
  const [m, e = "0"] = t.split("e");
  const mant = /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(m) ? m.replace(/,/g, "") : m.replace(",", ".");
  return Number(`${mant}e${e}`);
}
const shape = (num) => {
  const [m, e] = String(num).split("e");
  const mant = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(m) ? m.replace(/,/g, "") : m.replace(",", ".");
  return { decimals: (mant.split(".")[1] || "").length, exp: e === undefined ? 0 : Number(e) };
};
const signed = (sign, num) => `${sign ? "-" : ""}${num}`;

/** Values in a text: [{ value, unit, raw, decimals, exp, at, symbol? }] — positions index valueText-folded prose. */
export function valuesIn(P) {
  const out = [], taken = [];
  const free = (a, b) => !taken.some(([x, y]) => a < y && b > x);
  for (const m of P.matchAll(QTY)) {
    const base = symbolOf(m[3]);
    // "the 2-mole side": a small whole count of moles joined by a hyphen is stoichiometry, as in words (R4-K08)
    if (base === "mol" && /^\d{1,2}$/.test(m[2]) && Number(m[2]) <= 12 && P.slice(m.index, m.index + m[0].length).includes("-")) continue;
    const { unit: den, end } = denominators(P, m.index + m[0].length);
    let num = signed(m[1], m[2]);
    // a sign carried by a verb (R4-K13/K14): the value is the enthalpy change it states — the written number (with
    // its written sign, if any) times the verb's sign
    const verb = ENERGY.test(base + den) ? verbSignAt(P, m.index, end) : 0;
    if (verb) num = signed((verb < 0) !== !!m[1], m[2]);
    out.push({ value: parseNumber(num), unit: base + den, raw: (num + base + den).replace(/\s+/g, ""), ...shape(m[2]), at: m.index, end, ...(verb ? { verbSign: verb, writtenSign: !!m[1] } : {}) });
    taken.push([m.index, end]);
    // a range is read with BOTH ends (red-team round 5, R5-K02: "between 40 and 500 °C" was its upper end only): a bare
    // number joined to this one by "and", "or", "to", "through" or a dash carries the same unit
    const from = Math.max(0, m.index - 40), lo = P.slice(from, m.index).match(RANGE_BEFORE);
    if (lo) {
      const at = from + lo.index, lend = at + (lo[1] || "").length + lo[2].length;
      const lnum = verb ? signed((verb < 0) !== !!lo[1], lo[2]) : signed(lo[1], lo[2]);
      const year = (x) => /^(?:1[5-9]\d{2}|20\d{2})$/.test(x);
      if (!LABEL_BEFORE.test(P.slice(0, at)) && free(at, lend) && !(year(lo[2]) && !year(m[2]))) {
        out.push({ value: parseNumber(lnum), unit: base + den, raw: (lnum + base + den).replace(/\s+/g, ""), ...shape(lo[2]), at, end: lend, rangeOf: m.index, ...(verb ? { verbSign: verb, writtenSign: !!lo[1] } : {}) });
        taken.push([at, lend]);
      }
    }
  }
  for (const m of P.matchAll(SYMBOL)) {
    BARE.lastIndex = m.index + m[0].length;
    const n = BARE.exec(P);
    if (!n || !free(n.index, n.index + n[0].length)) continue;
    const { unit: den, end } = denominators(P, n.index + n[0].length);
    const num = signed(n[1], n[2]);
    out.push({ value: parseNumber(num), unit: `1${den}`, raw: num.replace(/\s+/g, "") + den, symbol: m[1].replace(/\s+/g, ""), ...shape(n[2]), at: n.index, end });
    taken.push([n.index, end]);
  }
  for (const m of P.matchAll(SCIBARE)) {
    if (!free(m.index, m.index + m[0].length)) continue;
    const { unit: den, end } = denominators(P, m.index + m[0].length);
    const num = signed(m[1], m[2]);
    out.push({ value: parseNumber(num), unit: `1${den}`, raw: num + den, ...shape(m[2]), at: m.index, end });
    taken.push([m.index, end]);
  }
  // FAIL CLOSED (red-team round 3, R3-K01): a number followed by a token that looks like a unit the table does not hold
  // ("2 GPa" before GPa was added, "5 ppm", "3 kDa") is still a value — its unit OPAQUE, kept as written. A wrong guess
  // costs one cheap check (the sentence owes evidence, and a quote must carry the same number and token); a value
  // nobody reads is a silent fact (K1). Never converted, never compared across units (lib/consistency.mjs drops it).
  for (const m of P.matchAll(OPAQUE)) {
    const tok = m[3], before = P.slice(0, m.index);
    if (!free(m.index, m.index + m[0].length) || !unitLike(tok) || LABEL_BEFORE.test(before)) continue;
    const num = signed(m[1], m[2]);
    out.push({ value: parseNumber(num), unit: tok, raw: num + tok, opaque: true, ...shape(m[2]), at: m.index, end: m.index + m[0].length });
    taken.push([m.index, m.index + m[0].length]);
  }
  return out.sort((a, b) => a.at - b.at);
}

// ---- candidates the reader does not read (red-team round 5, R5-K01: never pass silently, never guess) -------------
// A wide net, cast after the reads above: a number in words or a vague count bound to a unit ("several thousand
// atmospheres", "hundreds of kilojoules"), a number word before a unit that makes no number, and a number a symbol
// governs through words the binding list does not know ("K for this reaction reaches 100"). None of them is read as a
// value — the reader would have to guess — but none is silent: each makes its sentence OWE evidence (claims.mjs: a
// required token whose quote must carry the same figure, or the same words), so a false one cannot publish unchecked.
const VAGUE = "(?:a\\s+few|few|several|many|some|a\\s+couple\\s+of)";
const SCALE_ANY = "(?:hundred|thousand|million|billion|dozen)";
const UNREAD_NET = [
  new RegExp(`(?<![\\w-])${VAGUE}\\s+${SCALE_ANY}s?(?:\\s+of)?${UNIT_GAP}(?:${UNIT_ALT})(?![A-Za-z0-9])`, "gi"),
  new RegExp(`(?<![\\w-])(?:tens|dozens|hundreds|thousands|millions|billions)\\s+of\\s+(?:${UNIT_ALT})(?![A-Za-z0-9])`, "gi"),
];
const GOVERNED = new RegExp(`(?<![\\p{L}\\d])(?<![\\d.]\\s*)(?:${SYMBOL_NAMES})(?![\\p{L}\\d])((?:\\s+[\\p{L}'’-]+){1,8}?)\\s+(?:${SIGN})?(?<![\\w.])(${NUM}(?:e-?\\d+)?)(?![\\w])`, "gu");
/** Value candidates in a text that the reader does not read: [{ raw, key, at, end, unread: reason }]. */
export function unreadValues(P) {
  const read = valuesIn(P), out = [];
  const free = (a, b) => !read.some((q) => a < q.end && b > q.at) && !out.some((q) => a < q.end && b > q.at);
  for (const re of UNREAD_NET) for (const m of P.matchAll(re)) {
    if (free(m.index, m.index + m[0].length)) out.push({ raw: m[0].replace(/\s+/g, " ").trim(), key: m[0].replace(/\s+/g, " ").trim().toLowerCase(), at: m.index, end: m.index + m[0].length, unread: "a count in words bound to a unit, with no number to read" });
  }
  for (const m of P.matchAll(WORDS_PHRASE)) {
    const ahead = P.slice(m.index + m[0].length).match(UNIT_AHEAD);
    if (!ahead || wordsValue(m[2], !!m[1]) != null || !free(m.index, m.index + m[0].length + ahead[0].length)) continue;
    const end = m.index + m[0].length + ahead[0].length;
    out.push({ raw: P.slice(m.index, end).replace(/\s+/g, " ").trim(), key: P.slice(m.index, end).replace(/\s+/g, " ").trim().toLowerCase(), at: m.index, end, unread: "a number in words that makes no number" });
  }
  for (const m of P.matchAll(GOVERNED)) {
    const words = m[1];
    if (/[.;:!?]/.test(words)) continue;
    const at = m.index + m[0].length - m[3].length, end = at + m[3].length;
    if (!free(at, end) || LABEL_BEFORE.test(P.slice(0, at))) continue;
    out.push({ raw: m[0].replace(/\s+/g, " ").trim(), key: m[3], at, end, unread: "a number a symbol governs through words the reader does not bind" });
  }
  return out.sort((a, b) => a.at - b.at);
}

// what an opaque unit looks like: a short token straight after a number that is no English word and no formula
const OPAQUE = new RegExp(`${SIGN}(?<![\\w.^])(${NUM}(?:e-?\\d+)?)[ \\u00A0]?([A-Za-zµμΩÅ][A-Za-z]{1,4})(?![\\p{L}\\d'’-])`, "gu");
// a number that labels a thing ("Figure 3", "Q 5", "step 2") is no value, whatever follows it
const LABEL_BEFORE = /\b(?:figure|fig|table|step|chapter|section|question|q|example|problem|part|unit|lesson|exercise|answer|slide|week|day|lecture|module|item|no|number|page|equation|eq|objective|level|round|case|stage|option|group|period|row|column|line|version|test|trial|experiment|sample|run)\.?\s*$/i;
const ENGLISH = new Set(("a an the of to in on at by as is are was be am or and nor for but so if it its we you he she his her our my me us do did does has had can may not no yes all any one two six ten new old way day out up per via how who why off own too now set use see get let put few try run key end row top low big far ago age art act add ask cut lot men net tie etc vs ie eg pm th st nd rd also each more most less than then that this with from into over when what them they were will been have here there such only both some must very much many just like even same well good best both pair parts half times ways sets rows days years steps")
  .split(" "));
// element symbols: a token that reads as a formula ("HI", "CO", "NaCl") is a species after its coefficient, not a unit
const ELEMENTS = new Set("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu".split(" "));
const isFormula = (t) => /^(?:[A-Z][a-z]?)+$/.test(t) && (t.match(/[A-Z][a-z]?/g) || []).every((e) => ELEMENTS.has(e));
/** A token a reader takes for a unit: mixed case ("GPa", "kDa", "MHz"), or a short lowercase token ("ppm", "ksi"),
 *  or a short capitalised one ("Torr", "Gy") — never an English word, never a chemical formula. */
export function unitLike(tok) {
  if (ENGLISH.has(tok.toLowerCase()) || isFormula(tok) || /^[A-Z]{3,}$/.test(tok)) return false; // "5 HIGH" is a count
  if (/^[a-zµμ][a-z]*[A-Z]/.test(tok) || /^[A-Z][a-z]*[A-Z]/.test(tok)) return true; // kDa, GPa, MHz, mmHg
  if (/^[a-zµμ]{2,3}$/.test(tok)) return true; // ppm, ksi, rpm
  if (/^[A-ZΩÅ][a-z]{1,3}$/.test(tok)) return true; // Torr, Gy, Da
  return false;
}

/** Does a text state a value (the classifier's question)? */
// One reader decides (red-team round 6, R6-K06): a text states a value exactly when the claim reader finds a required
// quantity in it — the same view, the same parser — so a sentence whose value the claim reader extracts is always
// semi-mechanical and owes evidence.
export const statesValue = (text) => readValues(text).length > 0;
