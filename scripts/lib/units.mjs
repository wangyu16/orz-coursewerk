// Units (M-shared) — ONE table, THREE projections. The one question this file answers is:
// **WHAT STRINGS ARE UNITS, AND WHAT DO THEY MEAN?**
//
// Why this exists
// ---------------
// It is interfaces §5d ("IS THIS FACT DERIVED IN MORE THAN ONE PLACE?") failing on §5d's own
// worked example, and it was already live. Three modules each grew their own unit table:
//
//   M3 `lib/fingerprint.mjs`  UNIT_ALIASES   lowercase alias -> canonical unit NAME.
//                                            Normalizes prose spelling. NEVER converts a value.
//   M6 `lib/consistency.mjs`  SYMBOL_UNITS   case-sensitive symbol -> {dim, to}.
//                                            Keys a claim's subject by physical dimension and
//                                            compares values across artifacts.
//   M2 `lib/claims.mjs`       SCAN_UNIT_FORMS surface forms -> "is this number a quantity at all?"
//
// Three different questions — so they are legitimately three different SHAPES. But they encode
// ONE fact, "what strings are units", and three copies of one fact drift. They had. The measured
// drift (see the report in this module's history) ran in the dangerous direction:
//
//     M3 recognized `torr`, `V`, `A`, `W`, `Hz`. M2's scanner did not.
//
// A sentence reading "The cell potential is 5 V" therefore minted NO claim; with no claim, M6 had
// nothing to compare; with nothing compared, the package reported **zero flags it had not earned**.
// That is the worst failure mode this system has, because a clean bill of health manufactured by a
// blind spot is indistinguishable from success — nobody goes looking.
//
// §5d's prescription is NOT "one shape for everyone". It is **derive once at the source, project
// per consumer**: the fact belongs to the DATA, not to any one reader. So this file holds the
// record, and each module asks for the VIEW it needs and no more.
//
// The three projections
// ---------------------
//   aliasProjection()      -> Map<lowercaseAlias, canonicalName:string>   (M3)
//   dimensionProjection()  -> {lookup, quantityRe, ...}  symbol/word -> {id, dim, to}   (M6)
//   scanProjection()       -> {quantityRe}  a recognizer, nothing more   (M2)
//
// WHY `aliasProjection` RETURNS STRINGS AND NOT RECORDS — this is a SAFETY PROPERTY, not a style
// ------------------------------------------------------------------------------------------------
// M3's header argues, at length and correctly, that it must NEVER convert between units: `100 °C`
// and `373.15 K` must hash differently, because a conversion table inside a pure auditable
// fingerprint function is a knowledge base that will eventually have a rounding bug, and a units
// bug makes a REAL value change read as null — the expensive direction. That rule was previously
// safe by ISOLATION: M3's table simply had no `to` function to call.
//
// Unifying the tables destroys that isolation. The conversions now sit in the same file M3 imports
// from, one autocomplete away. So the rule is re-established STRUCTURALLY: `aliasProjection()`
// hands back a `Map<string, string>`. The values are canonical NAMES. There is no `to` on them,
// no record to reach through, and no function to call. M3 physically cannot convert, rather than
// being trusted not to. Do not "helpfully" widen this projection to return records.
//
// CASE SENSITIVITY IS A REAL TRAP, NOT A DETAIL — hence THREE differently-typed form fields
// ------------------------------------------------------------------------------------------
// `K` is kelvin. `k` is the kilo- prefix. `mg` is a milligram, `Mg` a megagram. Meanwhile M3
// lowercases the whole world before it looks anything up, and deliberately maps `"c"` -> celsius.
// One case-insensitive lookup shared by both consumers silently breaks one of them: either M6
// starts reading "5 k" as 5 kelvin, or M3 stops folding "100 C". So the record carries the case
// discipline AS A TYPE — which field a form lives in IS the statement about its case-sensitivity:
//
//   `symbols`      CASE-SENSITIVE.  Matched verbatim by M2/M6. Lowercased, they also become M3
//                                   aliases (M3 lowercases first, so `K` reaches it as "k").
//   `words`        CASE-INSENSITIVE. Spelled-out forms; every consumer folds case on them.
//   `spellingOnly` CASE-INSENSITIVE, and **M3 ONLY**. Ambiguous abbreviations (`c`, `f`) that are
//                                   a spelling variant to a normalizer but a GUESS to a
//                                   dimensioner: "100 C" is plausibly coulombs. M3 has folded
//                                   them since day one and that is its call to make; M6 must
//                                   never dimension them, and M2 must never mint a claim whose
//                                   quantity M6 will refuse. So they are typed out of those
//                                   projections rather than left to each consumer's discretion.
//
// If you are about to collapse these into one list because they "look the same": they are the
// same SHAPE and different FACTS. That is exactly the mistake §4b names — and the load-time
// invariant checks below will not save you, because a wrong case rule is still a consistent one.
//
// THE UNION, AND ITS LIMIT
// ------------------------
// Every unit any of the three modules knew, all three now know. Where a unit newly reaches M6 it
// carries a dimension and a conversion that is EXACT BY DEFINITION (1 atm = 760 torr = 101325 Pa;
// volt/ampere/watt/hertz are their dimension's canonical unit, so identity). Nothing here is
// estimated. **A unit whose conversion cannot be stated with certainty is not added** — a wrong
// conversion silently turns agreement into disagreement or the reverse, which is strictly worse
// than not recognizing the unit at all. Silence, not a guess.
//
// PURE and DETERMINISTIC: no I/O, no network, no LLM, no clock, no randomness. Frozen at load.

/**
 * The canonical unit of each physical dimension — the target every `to` converts INTO.
 * Checked at load: the canonical unit's own `to` must be identity, or the dimension is incoherent.
 */
export const CANONICAL_BY_DIM = Object.freeze({
  temperature: "kelvin",
  mass: "gram",
  amount: "mole",
  energy: "joule",
  "specific-energy": "joule-per-gram",
  "molar-energy": "joule-per-mole",
  length: "metre",
  volume: "litre",
  pressure: "pascal",
  time: "second",
  ratio: "percent",
  voltage: "volt",
  current: "ampere",
  power: "watt",
  frequency: "hertz",
});

/**
 * Words that ARE unit-shaped but name no unit. Recognized only in order to be REFUSED, never
 * guessed at: "90 degrees" has no scale, so it has no dimension, so it has no subject. They carry
 * no `id` and so take no part in the unit set. M6 alone consumes them (a dimensioner is the only
 * consumer that benefits from naming the thing it refuses); M2 leaves them out, because a claim
 * minted on a quantity M6 must refuse is a claim nothing downstream can use.
 */
export const AMBIGUOUS_WORDS = Object.freeze(["degrees"]);

/**
 * THE TABLE. One record per unit; `id` is the canonical NAME (M3's token) and is unique.
 *
 * `to` converts a value in THIS unit to `CANONICAL_BY_DIM[dim]`. Every one is exact by definition
 * or by SI, never estimated:
 *   - temperature: the two offsets are definitional.
 *   - energy: the THERMOCHEMICAL calorie (1 cal = 4.184 J exactly) — M6's pre-existing choice,
 *     preserved deliberately. It is a choice, not a fact: the IT calorie is 4.1868 J. Changing it
 *     is a knowledge decision, not a refactor.
 *   - pressure: 1 atm = 101325 Pa and 1 atm = 760 torr, both definitional; 1 bar = 1e5 Pa.
 */
const TABLE = [
  // --- temperature -> kelvin -------------------------------------------------------------
  // `spellingOnly: ["c"]`: M3 folds "100 C" to celsius. Correct for a spelling normalizer,
  // a guess for a dimensioner (coulomb). Typed out of M2/M6 rather than argued about there.
  // `ºC` (ordinal indicator) and `˚C` (ring above) are the two look-alikes an author's keyboard
  // produces; "degrees celsius" is the spelled-out form (round-3 verify B1).
  { id: "celsius", dim: "temperature", symbols: ["°C", "℃", "ºC", "˚C"], words: ["celsius", "centigrade", "degC", "deg C", "degrees celsius", "degree celsius", "degrees centigrade"], spellingOnly: ["c"], to: (v) => v + 273.15 },
  { id: "fahrenheit", dim: "temperature", symbols: ["°F", "℉", "ºF", "˚F"], words: ["fahrenheit", "degF", "degrees fahrenheit", "degree fahrenheit"], spellingOnly: ["f"], to: (v) => ((v - 32) * 5) / 9 + 273.15 },
  // `K` is kelvin; `k` is kilo-. The symbol is CASE-SENSITIVE and there is no `k` form: M6 must
  // not read "5 k" as 5 kelvin. M3 still gets "k" -> kelvin, because it lowercases `K` first.
  { id: "kelvin", dim: "temperature", symbols: ["K"], words: ["kelvin", "kelvins"], to: (v) => v },

  // --- specific energy -> J/g  (before bare energy; see the ordering note on `unitForms`) ---
  { id: "kilojoule-per-gram", dim: "specific-energy", symbols: ["kJ/g"], words: [], to: (v) => v * 1000 },
  { id: "joule-per-gram", dim: "specific-energy", symbols: ["J/g"], words: [], to: (v) => v },
  { id: "kilojoule-per-kilogram", dim: "specific-energy", symbols: ["kJ/kg"], words: [], to: (v) => v },
  { id: "joule-per-kilogram", dim: "specific-energy", symbols: ["J/kg"], words: [], to: (v) => v / 1000 },

  // --- molar energy -> J/mol ---------------------------------------------------------------
  { id: "kilojoule-per-mole", dim: "molar-energy", symbols: ["kJ/mol"], words: [], to: (v) => v * 1000 },
  { id: "joule-per-mole", dim: "molar-energy", symbols: ["J/mol"], words: [], to: (v) => v },

  // --- energy -> J ---------------------------------------------------------------------------
  { id: "kilojoule", dim: "energy", symbols: ["kJ"], words: ["kilojoule", "kilojoules"], to: (v) => v * 1000 },
  { id: "joule", dim: "energy", symbols: ["J"], words: ["joule", "joules"], to: (v) => v },
  { id: "kilocalorie", dim: "energy", symbols: ["kcal"], words: ["kilocalorie", "kilocalories"], to: (v) => v * 4184 },
  { id: "calorie", dim: "energy", symbols: ["cal"], words: ["calorie", "calories"], to: (v) => v * 4.184 },
  // 1 eV = 1.602176634e-19 J exactly (SI 2019 fixes the elementary charge).
  { id: "electronvolt", dim: "energy", symbols: ["eV"], words: ["electronvolt", "electronvolts", "electron volt", "electron volts"], to: (v) => v * 1.602176634e-19 },

  // --- mass -> g -----------------------------------------------------------------------------
  // the metric tonne is 1000 kg by definition; it has no symbol here ("t" is a time, a variable, a word)
  { id: "tonne", dim: "mass", symbols: [], words: ["tonne", "tonnes", "metric ton", "metric tons"], to: (v) => v * 1e6 },
  { id: "kilogram", dim: "mass", symbols: ["kg"], words: ["kilogram", "kilograms"], to: (v) => v * 1000 },
  { id: "milligram", dim: "mass", symbols: ["mg"], words: ["milligram", "milligrams"], to: (v) => v / 1000 },
  { id: "microgram", dim: "mass", symbols: ["µg"], words: [], to: (v) => v / 1e6 },
  { id: "gram", dim: "mass", symbols: ["g"], words: ["gram", "grams"], to: (v) => v },

  // --- length -> m ---------------------------------------------------------------------------
  { id: "kilometre", dim: "length", symbols: ["km"], words: ["kilometre", "kilometres", "kilometer", "kilometers"], to: (v) => v * 1000 },
  { id: "centimetre", dim: "length", symbols: ["cm"], words: ["centimetre", "centimetres", "centimeter", "centimeters"], to: (v) => v / 100 },
  { id: "millimetre", dim: "length", symbols: ["mm"], words: ["millimetre", "millimetres", "millimeter", "millimeters"], to: (v) => v / 1000 },
  { id: "micrometre", dim: "length", symbols: ["µm"], words: [], to: (v) => v / 1e6 },
  { id: "nanometre", dim: "length", symbols: ["nm"], words: ["nanometre", "nanometres", "nanometer", "nanometers"], to: (v) => v / 1e9 },
  { id: "metre", dim: "length", symbols: ["m"], words: ["metre", "meter", "metres", "meters"], to: (v) => v },

  // --- volume -> L ---------------------------------------------------------------------------
  { id: "millilitre", dim: "volume", symbols: ["mL"], words: ["millilitre", "millilitres", "milliliter", "milliliters"], to: (v) => v / 1000 },
  { id: "litre", dim: "volume", symbols: ["L"], words: ["litre", "liter", "litres", "liters"], to: (v) => v },

  // --- amount -> mol -------------------------------------------------------------------------
  { id: "millimole", dim: "amount", symbols: ["mmol"], words: ["millimole", "millimoles"], to: (v) => v / 1000 },
  { id: "mole", dim: "amount", symbols: ["mol"], words: ["mole", "moles"], to: (v) => v },

  // --- pressure -> Pa ------------------------------------------------------------------------
  // GPa, kbar, mbar, ksi and the plural/capitalised bar and torr forms: red-team round 3 (CONFIDENCE R3-K01) — "2 GPa",
  // "2.0 kbar", "29 ksi", "2,000 bars" and "15,000 Torr" were no value at all. Each conversion is exact by definition.
  { id: "gigapascal", dim: "pressure", symbols: ["GPa"], words: ["gigapascal", "gigapascals"], to: (v) => v * 1e9 },
  { id: "megapascal", dim: "pressure", symbols: ["MPa"], words: ["megapascal", "megapascals"], to: (v) => v * 1e6 },
  { id: "kilopascal", dim: "pressure", symbols: ["kPa"], words: ["kilopascal", "kilopascals"], to: (v) => v * 1000 },
  { id: "hectopascal", dim: "pressure", symbols: ["hPa"], words: ["hectopascal", "hectopascals"], to: (v) => v * 100 },
  { id: "atmosphere", dim: "pressure", symbols: ["atm"], words: ["atmosphere", "atmospheres"], to: (v) => v * 101325 },
  { id: "kilobar", dim: "pressure", symbols: ["kbar"], words: ["kilobar", "kilobars"], to: (v) => v * 1e8 },
  { id: "bar", dim: "pressure", symbols: ["bar"], words: ["bars"], to: (v) => v * 1e5 },
  { id: "millibar", dim: "pressure", symbols: ["mbar"], words: ["millibar", "millibars"], to: (v) => v * 100 },
  // 1 atm = 760 torr = 101325 Pa, both definitional -> 1 torr = 101325/760 Pa exactly. "Torr" is the standard symbol.
  { id: "torr", dim: "pressure", symbols: ["torr", "Torr"], words: ["torrs"], to: (v) => (v * 101325) / 760 },
  // The conventional millimetre of mercury is DEFINED as 13.5951 g/cm3 x 9.80665 m/s2 x 1 mm = 133.322387415 Pa
  // exactly (it differs from the torr in the seventh digit). Added after red-team round 1 (CONFIDENCE F2): "700 mmHg"
  // minted no claim at all.
  { id: "millimetre-of-mercury", dim: "pressure", symbols: ["mmHg"], words: ["millimetres of mercury", "millimeters of mercury"], to: (v) => v * 133.322387415 },
  { id: "pascal", dim: "pressure", symbols: ["Pa"], words: ["pascal", "pascals"], to: (v) => v },
  // 1 psi = 1 lbf/in² = (0.45359237 kg × 9.80665 m/s²) / (0.0254 m)² — every factor exact by definition.
  { id: "pound-per-square-inch", dim: "pressure", symbols: ["psi"], words: ["pounds per square inch", "pound per square inch"], to: (v) => (v * 0.45359237 * 9.80665) / (0.0254 * 0.0254) },
  { id: "kilopound-per-square-inch", dim: "pressure", symbols: ["ksi"], words: [], to: (v) => (v * 1000 * 0.45359237 * 9.80665) / (0.0254 * 0.0254) },

  // --- time -> s -----------------------------------------------------------------------------
  { id: "minute", dim: "time", symbols: ["min"], words: ["minute", "minutes"], to: (v) => v * 60 },
  { id: "hour", dim: "time", symbols: ["h", "hr"], words: ["hour", "hours"], to: (v) => v * 3600 },
  { id: "second", dim: "time", symbols: ["s", "sec"], words: ["second", "seconds"], to: (v) => v },

  // --- ratio ---------------------------------------------------------------------------------
  { id: "percent", dim: "ratio", symbols: ["%"], words: ["percent"], to: (v) => v },

  // --- electrical / frequency ----------------------------------------------------------------
  // The four M3 knew and M2's scanner did not — the live blind spot this module was built to fix.
  // Each is its dimension's canonical unit, so the conversion is identity: certain, not guessed.
  { id: "volt", dim: "voltage", symbols: ["V"], words: ["volt", "volts"], to: (v) => v },
  // `A` IS AN ENGLISH ARTICLE. [MOVED to spellingOnly 2026-07-17 — MEASURED, not theorized: wiring M6
  // into the gate made the CLEAN reference package flag
  //   `practice/melting.md asserts 9 A; practice/melting.md asserts 3 A for term.melting-point`
  // The prose was "Q 3 A thermometer in melting ice reads…" and "Answer 9 A flat plateau sits…". A
  // numbered question borrowed the NEXT SENTENCE'S capitalized article and became a current.
  //
  // The irony is exact: M6's non-flag 1 refuses bare integers as "the single richest source of spurious
  // collisions", and THIS ROW SILENTLY CONVERTED ONE INTO A QUANTITY. Q&A deliverables ("Answer 3 A …")
  // are a minefield, and `A` is the only single-capital symbol in this table that is also an English word.
  //
  // DELETING the row is NOT the fix — tests/units.test.mjs pins `A -> ampere` because M3 knew it and M2's
  // scanner did not, and that drift was a real silent-under-reporting bug. `spellingOnly` is the
  // exactly-right EXISTING device: known to M3's normalizer (harmless — articles are stripped as
  // closed-class words BEFORE unit folding; verified: "A solid melts at a characteristic temperature"
  // normalizes to "at characteristic melt solid temperature"), and typed OUT of M2/M6, which must never
  // dimension a guess. Identical in shape to `c`/`f`: a spelling variant to a normalizer, a GUESS to a
  // dimensioner.
  //
  // NAMED RECALL COST, accepted deliberately: a genuine "5 A of current" now mints NO claim, so M6 cannot
  // compare currents. The alternative is a false flag on every Q&A sheet in the corpus, and ALARM FATIGUE
  // IS THE #1 RISK — a queue nobody opens protects nobody, including on the flag that mattered. Precision
  // wins here because the queue dies of false positives, not of misses. A heuristic ("`A` is a unit unless
  // followed by a lowercase word") would separate "5 A of current" from "9 A flat plateau"; this project
  // does not guess.
  { id: "ampere", dim: "current", symbols: [], words: [], spellingOnly: ["a"], to: (v) => v },
  { id: "watt", dim: "power", symbols: ["W"], words: ["watt", "watts"], to: (v) => v },
  { id: "hertz", dim: "frequency", symbols: ["Hz"], words: ["hertz"], to: (v) => v },
];

// --- load-time invariants ---------------------------------------------------------------------
// These run once, at import, and THROW. A unit table defect is a contract break, and a contract
// break must fail at build time in every test run — not silently produce a wrong dimension in a
// package nobody is re-reading. (Same reasoning as M10's throw on an unmapped detector kind.)

const fail = (msg) => {
  throw new Error(`lib/units.mjs: ${msg}`);
};

const UNITS_BY_ID = new Map();
/** Lowercased form -> unit, across symbols + words + spellingOnly. M3's whole world. */
const BY_ALIAS = new Map();
/** Verbatim symbol -> unit. CASE-SENSITIVE. */
const BY_SYMBOL = new Map();
/** Lowercased word -> unit. CASE-INSENSITIVE. */
const BY_WORD = new Map();

for (const u of TABLE) {
  if (UNITS_BY_ID.has(u.id)) fail(`duplicate unit id "${u.id}"`);
  if (!(u.dim in CANONICAL_BY_DIM)) fail(`unit "${u.id}" has unknown dimension "${u.dim}"`);
  if (typeof u.to !== "function") fail(`unit "${u.id}" has no conversion`);
  // `spellingOnly` COUNTS as a surface form. [AMENDED 2026-07-17] A unit reachable only through M3's
  // normalizer is still reachable — it is simply typed out of M2/M6, which is the whole point of the
  // field. `ampere` is the case: `A` is an English article, so it must normalize and must never
  // dimension. The invariant is right that a unit with NO form at all is dead code; it was wrong that
  // `symbols`/`words` are the only forms.
  if (!u.symbols?.length && !u.words?.length && !u.spellingOnly?.length)
    fail(`unit "${u.id}" has no surface form`);
  UNITS_BY_ID.set(u.id, u);

  for (const s of u.symbols ?? []) {
    if (BY_SYMBOL.has(s)) fail(`symbol "${s}" is claimed by both "${BY_SYMBOL.get(s).id}" and "${u.id}"`);
    BY_SYMBOL.set(s, u);
  }
  // Words and spellingOnly forms are matched case-insensitively by EVERY consumer, so they must
  // be built out of characters whose case-folding is unambiguous. Anything else and the folded
  // character class below would be silently wrong.
  for (const w of [...(u.words ?? []), ...(u.spellingOnly ?? [])]) {
    if (!/^[A-Za-z][A-Za-z ]*$/.test(w)) fail(`word form "${w}" (${u.id}) must be letters and spaces`);
  }
  for (const w of u.words ?? []) {
    const k = w.toLowerCase();
    if (BY_WORD.has(k)) fail(`word "${k}" is claimed by both "${BY_WORD.get(k).id}" and "${u.id}"`);
    BY_WORD.set(k, u);
  }

  for (const form of [...(u.symbols ?? []), ...(u.words ?? []), ...(u.spellingOnly ?? [])]) {
    const k = form.toLowerCase();
    const prior = BY_ALIAS.get(k);
    // The case-collapse check that matters: `mg`/`Mg` would be two units, one alias, and M3 —
    // which lowercases everything — would have to pick one. It must never have to.
    if (prior && prior.id !== u.id) fail(`alias "${k}" case-collapses "${prior.id}" and "${u.id}"`);
    BY_ALIAS.set(k, u);
  }
}

for (const [dim, id] of Object.entries(CANONICAL_BY_DIM)) {
  const u = UNITS_BY_ID.get(id);
  if (!u) fail(`dimension "${dim}" names a canonical unit "${id}" that does not exist`);
  if (u.dim !== dim) fail(`canonical unit "${id}" is not in dimension "${dim}"`);
  // If the canonical unit converts to anything but itself, every value in the dimension is off.
  if (u.to(1) !== 1 || u.to(0) !== 0) fail(`canonical unit "${id}" does not convert to itself`);
}

for (const w of AMBIGUOUS_WORDS) {
  if (BY_ALIAS.has(w.toLowerCase())) fail(`"${w}" is both a unit and an ambiguous word`);
}

/** The table, frozen. Read it; do not reach into it for a projection someone else owns. */
export const UNITS = Object.freeze(TABLE.map((u) => Object.freeze({ ...u, symbols: Object.freeze([...u.symbols]), words: Object.freeze([...(u.words ?? [])]), spellingOnly: Object.freeze([...(u.spellingOnly ?? [])]) })));

/** Every canonical unit name, sorted. THE unit set — the thing all three projections must agree on. */
export function unitIds() {
  return [...UNITS_BY_ID.keys()].sort();
}

// --- shared regex construction ------------------------------------------------------------------

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A word form as a CASE-FOLDED pattern: "degC" -> "[dD][eE][gG][cC]".
 *
 * Why not the `i` flag: the same alternation carries CASE-SENSITIVE symbols, and `i` would apply
 * to those too — "5 k" would read as 5 kelvin and "5 Mg" as 5 milligrams. Per-character folding
 * is how one regex holds both case disciplines at once, which is the whole point of the two form
 * fields being differently typed. (Word forms are validated above as letters/spaces only, so
 * `toLowerCase`/`toUpperCase` on each character is total and has no multi-character expansions.)
 */
function wordPattern(word) {
  return [...word]
    .map((ch) => {
      const lo = ch.toLowerCase();
      const up = ch.toUpperCase();
      return lo === up ? escapeRe(ch) : `[${lo}${up}]`;
    })
    .join("");
}

/**
 * Every surface form a projection matches, LONGEST FIRST.
 *
 * **The ordering is load-bearing, not tidiness.** A regex alternation is first-match, not
 * longest-match: with "J" before "kJ/mol", "5 kJ/mol" parses as 5 joules and a molar energy
 * silently becomes an energy — agreement and disagreement both computed in the wrong dimension.
 * Length-descending, then lexicographic for a deterministic tie-break (the sort must be total, or
 * the compiled regex depends on V8's sort stability).
 *
 * @param {{ambiguous?: boolean}} [opts] include the recognized-only-to-be-refused words (M6 only)
 * @returns {Array<{form: string, pattern: string}>}
 */
function unitForms({ ambiguous = false } = {}) {
  const forms = [];
  for (const u of TABLE) {
    for (const s of u.symbols ?? []) forms.push({ form: s, pattern: escapeRe(s) });
    for (const w of u.words ?? []) forms.push({ form: w, pattern: wordPattern(w) });
  }
  if (ambiguous) for (const w of AMBIGUOUS_WORDS) forms.push({ form: w, pattern: wordPattern(w) });
  return forms.sort((a, b) => b.form.length - a.form.length || (a.form < b.form ? -1 : a.form > b.form ? 1 : 0));
}

/**
 * The source of a "number bound to a recognized unit" regex.
 *
 * Every character of it earns its place, and each was load-bearing in the module it came from:
 *   - the leading `-?\d` requirement is what keeps BARE INTEGERS out ("step 3", "Chapter 2" are
 *     the richest source of spurious quantities there is);
 *   - `[\s ]*` lets "100°C", "100 °C" and a non-breaking-spaced "100 °C" all read alike;
 *   - the trailing `(?![A-Za-z0-9/])` lookahead stops "g" matching inside "grams" and "J" inside
 *     "J/g" — without it the longest-first ordering is not enough, because "J/g" is reached
 *     through a *different* alternation branch than "J".
 *
 * @param {{capture?: boolean, ambiguous?: boolean}} [opts] `capture` puts the value in group 1 and
 *   the unit form in group 2 (M6 needs both; M2 only asks a yes/no and captures nothing).
 * @returns {string} regex source. Callers compile it with the flags they need.
 */
export function quantityRegexSource({ capture = false, ambiguous = false } = {}) {
  const alt = unitForms({ ambiguous }).map((f) => f.pattern).join("|");
  const num = String.raw`-?\d+(?:\.\d+)?`;
  return capture
    ? `(${num})[\\s\\u00A0]*(${alt})(?![A-Za-z0-9/])`
    : `(?:${num})[\\s\\u00A0]*(?:${alt})(?![A-Za-z0-9/])`;
}

// --- the three projections ----------------------------------------------------------------------

/**
 * **M3's projection (`lib/fingerprint.mjs`).** Lowercase alias -> canonical unit NAME.
 *
 * The values are STRINGS. This is the structural guarantee that M3 cannot convert a unit — see the
 * header. There is no `to` here to reach for, so M3's no-conversion rule survives the unification
 * of the tables by CONSTRUCTION rather than by anyone remembering it.
 *
 * Case-INSENSITIVE by construction: M3 lowercases prose before it looks anything up, so `K`
 * arrives as "k" and `°C` as "°c". `spellingOnly` forms ("c", "f") are included here and ONLY
 * here: they are a spelling variant to a normalizer and a guess to a dimensioner.
 *
 * @returns {Map<string,string>} a fresh map, so a caller mutating it cannot corrupt the table
 */
export function aliasProjection() {
  return new Map([...BY_ALIAS].map(([alias, u]) => [alias, u.id]));
}

/**
 * **M6's projection (`lib/consistency.mjs`).** The dimensioned view: surface form -> unit.
 *
 * `lookup` preserves the case discipline the record declares: symbols exactly (so `mg` is not
 * `Mg` and `K` is not `k`), words case-insensitively, ambiguous words to `null` — recognized, and
 * refused, which is not the same as unrecognized and is worth saying out loud.
 */
export function dimensionProjection() {
  return {
    /** @returns {{id:string, dim:string, to:(v:number)=>number}|null} null = refuse, never guess */
    lookup(form) {
      const s = BY_SYMBOL.get(String(form));
      if (s) return { id: s.id, dim: s.dim, to: s.to };
      const w = BY_WORD.get(String(form).toLowerCase());
      if (w) return { id: w.id, dim: w.dim, to: w.to };
      return null;
    },
    /** A fresh `g`-flagged matcher; fresh because `lastIndex` is state and state is a shared bug. */
    quantityRe: () => new RegExp(quantityRegexSource({ capture: true, ambiguous: true }), "g"),
    canonicalOf: (dim) => CANONICAL_BY_DIM[dim] ?? null,
  };
}

/**
 * **M2's projection (`lib/claims.mjs`).** A RECOGNIZER and nothing else.
 *
 * M2 asks one yes/no question — "is this number bound to a unit, i.e. is this block asserting a
 * quantity?" — so it gets no dimensions and no conversions, because a recognizer that could
 * convert would be a recognizer that could be wrong about more than recognition.
 *
 * Ambiguous words are OUT: minting a `fact` claim whose quantity M6 is bound to refuse would add
 * a node to the index that nothing downstream can compare — noise wearing a claim's badge.
 */
export function scanProjection() {
  return {
    /** A fresh matcher. No flags: M2 only ever asks `.test()`. */
    quantityRe: () => new RegExp(quantityRegexSource({ capture: false, ambiguous: false })),
  };
}

/**
 * **The value parser's projection (`lib/core/values.mjs`: the claim extractor and the semi-mechanical classifier).**
 * Surface form -> the unit's CANONICAL SYMBOL (a string: "kJ", "°C", "mmHg"), longest form first. No dimension and
 * no conversion: the verdict path compares a claim's value with a source's value IN THE SAME UNIT, at the claim's
 * precision, and must never convert (a conversion is a knowledge decision). Ambiguous words and spellingOnly forms
 * are out, as for M2. Red-team round 1 (CONFIDENCE F2): the claim extractor kept its own, narrower list, so a value
 * in mmHg, kcal, °F or V was no fact at all.
 * @returns {Array<{form: string, pattern: string, symbol: string}>}
 */
export function valueProjection() {
  const out = [];
  for (const u of TABLE) {
    // a unit with words and no symbol (the tonne) is read under its first word; spellingOnly-only units (ampere) are
    // never a value's unit here
    const symbol = u.symbols?.[0] ?? u.words?.[0];
    if (!symbol) continue;
    for (const s of u.symbols ?? []) out.push({ form: s, pattern: escapeRe(s), symbol });
    for (const w of u.words ?? []) out.push({ form: w, pattern: wordPattern(w), symbol });
  }
  return out.sort((a, b) => b.form.length - a.form.length || (a.form < b.form ? -1 : a.form > b.form ? 1 : 0));
}

// CONTRACT NOTES (what this unification found, and what it deliberately did NOT do)
// -------------------------------------------------------------------------------------------
// 1. The union is at the level of the UNIT SET, not of surface FORMS. The three projections are
//    guaranteed to recognize the same `unitIds()`; they are NOT guaranteed to accept the same
//    strings, and must not be — `spellingOnly` and the symbol/word case split exist precisely so
//    that one projection can accept "100 C" and another refuse it. `tests/units.test.mjs` asserts
//    the set equality and the case rules separately, on purpose.
// 2. NO FORM WAS INVENTED. Every form here appeared in at least one of the three tables. That
//    leaves a visible irregularity — some units carry a plural ("grams", "joules", "moles") and
//    others do not ("volt" has no "volts", "torr" no "torrs") — because the tables that were
//    merged were themselves irregular. Adding the missing plurals is a RECALL decision (it changes
//    which claims get minted), not a refactor, and it does not belong in a defect fix. Left as a
//    reported gap rather than smuggled in.
//    [CLOSED 2026-10-06, red-team round 2 CONFIDENCE R2-K04/K05.] The gap stopped being a recall
//    nicety once the value parser (core/values.mjs) read this table: a value whose unit form is not
//    here is no value, so "2,000 atmospheres", "29,000 psi", "40.65 kilojoules per mole" and
//    "52 kilocalories" owed no evidence at all — a wrong simple fact published unchecked. The
//    ordinary spelled and plural forms are now words, and psi, eV, hPa and the tonne are units
//    (each conversion exact by definition). Missing a form is still silence, never a guess.
// 3. `M9 lib/propagate.mjs` MUST NOT import this module, and does not. It has no unit table on
//    purpose: it VERIFIES the unit at the consumer and refuses on mismatch instead of converting.
//    That asymmetry is deliberate and worth stating where the temptation lives — a verifier only
//    has to NOTICE, whereas a converter has to be RIGHT. Handing M9 a conversion path would give
//    it a way to be silently wrong that it does not currently have.
