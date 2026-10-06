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
//
// PURE and DETERMINISTIC.
import { plainForQuantities } from "./dependencies.mjs";
import { valueProjection } from "../units.mjs";

// Cyrillic and Greek letters that render like Latin ones (a word spelled with them must not escape the checks)
const CONFUSABLE = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s", "ο": "o", "α": "a", "ν": "v", "Ο": "O", "О": "O", "А": "A", "Е": "E", "С": "C", "Р": "P", "Т": "T", "Н": "H", "К": "K", "М": "M", "В": "B", "Х": "X" };
export const clean = (t) => String(t || "").normalize("NFKC").replace(/[\p{Cf}­]/gu, "")
  .replace(/[Ѐ-ӿͰ-Ͽ](?=[A-Za-z])|(?<=[A-Za-z])[Ѐ-ӿͰ-Ͽ]/g, (c) => CONFUSABLE[c] ?? c)
  .replace(/(?<=[A-Za-z])[*_]+(?=[A-Za-z])/g, "");

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

/** Text for value extraction: LaTeX folded to plain, scientific notation to an exact "<mantissa>e<exponent>", unit
 *  exponents kept ("g^{-1}" → "g^-1"). Markup is left to the caller (claims.proseOf). */
export function valueText(text) {
  let t = clean(supFold(String(text || ""))).replace(/<br\s*\/?>/gi, ". ").replace(/<\/?[a-zA-Z][^>]*>/g, " ").replace(/[‐-―](?=\s*\d)/g, "-");
  t = t.replace(/\{\s*([-−])\s*\}/g, "$1"); // {-}92
  t = foldSci(t);
  t = t.replace(/\^\s*\{\s*([-−+]?)\s*(\d+)\s*\}/g, (_, s, d) => `^${s === "−" ? "-" : s}${d}`);
  return plainForQuantities(t);
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
// a symbol unit embedding its own denominator ("kJ/mol") is the same unit as "kJ per mole": both read "kJ/mol"
const QTY = new RegExp(`${SIGN}(?<![\\w.])(${NUM}(?:e-?\\d+)?)[\\s\\u00A0]*(${UNIT_ALT})(?![A-Za-z0-9])`, "g");
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
const SYMBOL = /(?<![\p{L}\d])(K(?:\s?(?:sp|eq|p|c|a|b|w))?|pH|pOH|pK\s?a)(?![\p{L}\d])\s*((?:(?:=|≈|~|≃|\\approx|is|was|of|on the order of|order of|equals|about|approximately|around|roughly|close to|near|only|just)\s*){1,4})/gu;
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
    const { unit: den, end } = denominators(P, m.index + m[0].length);
    const num = signed(m[1], m[2]);
    out.push({ value: parseNumber(num), unit: base + den, raw: (num + base + den).replace(/\s+/g, ""), ...shape(m[2]), at: m.index, end });
    taken.push([m.index, end]);
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
  return out.sort((a, b) => a.at - b.at);
}

/** Does a text state a value (the classifier's question)? */
export const statesValue = (text) => valuesIn(valueText(text)).length > 0;
