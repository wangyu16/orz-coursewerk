// Fingerprints (M3) — the change signal. The one question this file answers is:
// **DID THE MEANING CHANGE?**
//
// Why this exists
// ---------------
// Today the change signal is a SHA-256 over FILE BYTES (`lib/coherence.mjs`). Bytes are a
// terrible proxy for meaning in both directions, and the product's #1 complaint is the first
// one: add a space, reflow a paragraph, bold a word — every dependent artifact is flagged and
// a human is asked to re-review work that did not change (spec §0: 1 edit → 6 required
// reviews). The second direction is worse and quieter: **byte-diff SIZE is uncorrelated with
// semantic impact.** Deleting three characters ("may" → "") can be the most consequential edit
// in the package, and a byte hash reports it with exactly the same urgency as a typo fix — i.e.
// no urgency at all, because everything is always urgent.
//
// So we replace ONE hash with FIVE, each over a different LAYER of the claim (spec §2.4,
// interfaces §5). A change is then classified by *which layer moved* (M4 reads these), and the
// action follows from the layer: cosmetic → NONE, rename → RENAME, meaning → RE-DERIVE.
//
//   format     — the WORDING layer. Hash after stripping whitespace + markdown noise.
//                Whitespace/reflow/emphasis edits move NOTHING; a rephrase moves this and
//                nothing else. "format moved alone" is therefore exactly spec §5's
//                cosmetic row (whitespace, formatting, meaning-preserving rephrase) → NONE.
//   label      — the VOCABULARY layer. The claim's resolved terms. Moves on a rename;
//                deliberately blind to values.
//   content    — the MEANING layer. The normalized semantic core. THE point of the module.
//   spine      — the PEDAGOGY layer. Which concepts/objectives the claim hangs under.
//   provenance — the SOURCE layer. What it cites, and whether an override authorizes it.
//
// The asymmetry that governs every judgement call below
// -----------------------------------------------------
// Full paraphrase detection is an unsolved problem and we are forbidden an LLM here on purpose
// (interfaces §6.1: this is the auditable impact path; the manuscript's reproducibility
// depends on the same input giving the same output forever). So `normalizeContent` is a
// deterministic approximation, and every approximation errs in one of two directions:
//
//   UNDER-ABSORB — a meaning-preserving rephrase moves `content` → a FALSE FLAG.
//                  Cost: a human reviews something that did not change. Annoying. Visible.
//                  Self-correcting: the reviewer sees the diff and says "same thing".
//   OVER-ABSORB  — a real change fails to move `content` → a MISSED ERROR.
//                  Cost: a knowledge change propagates through the package UNNOTICED, and the
//                  index reports "no flags" — an assurance the package has NOT earned. Silent.
//                  Never self-corrects, because nobody is looking.
//
// These are not symmetric and must never be traded off as if they were. **We design to
// under-absorb.** Wherever a normalization step could plausibly swallow a real distinction,
// it is left out, even at the cost of a false flag. A false flag is a bad afternoon; a silent
// knowledge error is the failure this whole index exists to prevent.
//
// Exactly what class of rephrase we DO absorb (`content` stays put)
// -----------------------------------------------------------------
//   * whitespace, line reflow, indentation, blank lines
//   * markdown formatting: emphasis, bold, inline code, links (link TEXT is kept), headings,
//     list markers, blockquote markers, table pipes
//   * unicode cosmetics: NFKC folding, curly quotes/dashes → ascii
//   * letter case
//   * WORD ORDER / constituent order — the big one. The canonical form is a sorted MULTISET of
//     tokens, so "the melting point of water is 100 °C" ≡ "water's melting point is 100 °C".
//   * article variation (a/an/the) and the of-genitive ↔ 's-genitive alternation
//     ("melting point OF water" ≡ "water'S melting point")
//   * inflection: light suffix folding (plural -s, -ing, -ed) so "melts" ≡ "melting" ≡ "melted"
//   * synonymy THAT THE CONCEPT MAP KNOWS ABOUT — every registered alias folds to one term id,
//     so "ethylene" ≡ "ethene" iff the instructor said so (M1). This is the only synonymy we
//     will ever claim, and it is authored, not guessed.
//   * quantity spelling: "100°C" ≡ "100 °C" ≡ "1.0e2 degC" ≡ "100.0 celsius"
//
// Exactly what we DO NOT absorb (`content` moves → a false flag; accepted, by design)
// ----------------------------------------------------------------------------------
//   * synonym substitution OUTSIDE the term registry ("hot" → "warm", "raise" → "increase")
//   * clause restructuring that changes which words are present ("water melts at 0 °C" vs
//     "the melting point of water is 0 °C" — different tokens, different hash)
//   * voice change ("absorbs energy" vs "energy is absorbed by") — the auxiliary/preposition
//     tokens differ
//   * preposition swaps ("heated TO 100 °C" vs "heated AT 100 °C") — we strip only the
//     articles and "of"; every other preposition is treated as potentially load-bearing
//   * copulas/auxiliaries and therefore TENSE ("is" vs "was") are KEPT, not folded — a tense
//     change can be a knowledge change ("X IS the accepted value" → "X WAS")
//   * anything nominal↔verbal beyond the -s/-ing/-ed fold ("melting" ≡ "melts", but
//     "fusion" ≢ "melting" unless the map registers them as aliases)
//
// The known OVER-absorptions, stated plainly (the dangerous direction — audit these first)
// ----------------------------------------------------------------------------------------
//   1. ARGUMENT ORDER. A sorted multiset cannot see role reversal: "A dissolves in B" and
//      "B dissolves in A" produce the same `content`. This is the price of absorbing word-order
//      rephrase, which was a hard requirement. It is bounded, not ignored: negation, modality
//      and quantifiers are BOUND to the token they scope over (below), so the classic silent
//      killers ("all"→"some", "may"→"does") cannot hide inside the bag. Recovering true
//      argument structure needs a parser, and a wrong parse is worse than no parse; a role
//      reversal is caught by M6's consistency scan (cross-artifact disagreement), which is the
//      correct home for it. Recorded here so nobody rediscovers it as a surprise.
//   2. INFLECTION/TENSE-BY-SUFFIX. "melted" ≡ "melts". Aspect is not knowledge in the claim
//      types this index gates (facts with values, definitions, answer keys, objectives).
//   3. TOKEN MULTIPLICITY ONLY. We keep counts (a multiset, not a set), but two claims built
//      from the same word bag in different orders collide — see 1.
//
// Number and unit normalization — and why we DO NOT convert units
// ---------------------------------------------------------------
// A quantity becomes `#<value>:<unit>`: the numeric value in a canonical form (commas dropped,
// exponent evaluated, trailing zeros gone → "1.0e2" and "100.00" both read `#100`) and the
// unit folded to a canonical token through a small alias table ("°C", "degC", "celsius",
// "centigrade" → `celsius`). That absorbs spelling, not magnitude: 100 → 90 always moves.
//
// **We never convert between units.** `100 °C` and `373.15 K` hash differently. Three reasons,
// in increasing order of importance:
//   (a) A conversion table is a knowledge base, and a knowledge base drifts, gets a rounding
//       policy, and eventually gets a bug — inside a PURE, AUDITABLE function whose entire
//       value is that it cannot be wrong in a way nobody notices.
//   (b) Rounding is a semantic choice, not an arithmetic one. Is 373.15 K ≡ 100.0 °C ≡ 100 °C?
//       At what tolerance? Any answer we pick silently, some instructor needs different.
//   (c) The asymmetry decides it. Not converting means an honest unit change (°C → K) moves
//       `content` and a human confirms an equivalent restatement — a false flag, the cheap
//       direction. Converting means a units bug could make a REAL value change read as null —
//       the expensive direction. When in doubt, flag.
// A unit token is only bound to a number when it is a KNOWN unit (or degree-prefixed); "100
// samples" leaves "samples" a word, because guessing that an adjacent word is a unit is how
// you get "100 water" → `#100:water`.
//
// Input assumptions (see CONTRACT HISTORY at the foot of this file)
// -----------------------------------------------------------------
// The claim's prose is read from `claim.text` (falling back to `claim.normalizedText`, then
// ""); `text` is now declared and REQUIRED in `claims.schema.json`. The override id is read
// from `claim.overrideId` (also now declared) / `claim.override.id`.
//
// SCOPE (interfaces §3 + §4a). Term resolution is scope-aware, and it has to be: a chapter-local
// HOMOGRAPH ("cell" in the battery chapter vs the biology chapter) would otherwise fold to
// whichever term was declared first package-wide — a silent mis-identification, i.e. precisely
// the failure this module exists to prevent, committed by the module itself. `normalizeContent`
// therefore takes `scope`; `null` means "package-wide" and restores unscoped resolution.
//
// **THE RULE (§4a): scope is DATA. We READ `claim.scope`; we do not derive it.** M2 derives it
// ONCE at extraction — spineRefs first (the spine is the instructor's own structure, so it
// outranks file placement), then the file, then null. This module originally derived it from
// `locations[0].file` while M6 derived it from `spineRefs`: two derivations of one fact, i.e.
// two modules able to disagree, silently, about what a claim is ABOUT. That is the exact defect
// class this index exists to catch, reproduced inside the index itself. Convergent need across
// two consumers means the fact belongs to the DATA, not to either consumer.
//
// `null` is a MEANINGFUL value here (package-wide), not "missing" — so presence is tested with
// `"scope" in claim`, never `claim.scope ?? derive(...)`, which would silently re-derive for
// every package-wide claim: precisely the claims most likely to span chapters, and so the worst
// possible set to re-open the divergence on.
//
// **COMPATIBILITY FALLBACK — not the rule.** A claim WITHOUT the field (an in-memory claim a
// caller hand-built; anything predating M2) still needs a scope, so we fall back to §4a's tier
// 2: `claim.locations[0].file` → basename minus extension. That works because M1's scope values
// come from the concept-map filenames (`concepts/<chapter-slug>.md` is loaded with
// `scope: "<chapter-slug>"`), and a package's per-chapter deliverables are laid out on the same
// key — `study-guide/<chapter-slug>.md`, `practice/<chapter-slug>.md`, … — so the basename IS
// the chapter slug IS the scope. It deliberately does NOT reimplement §4a's tier 1 (the spine):
// half-copying the authoritative derivation is the very divergence §4a closed, and a copy that
// drifts is worse than an approximation that is clearly labelled one. Three properties, all
// deliberate:
//   * `concepts/course.md` (and `index`/`README`) → `null`: course-level text is package-wide.
//     (M2's tier 1 yields `"course"` from a `concept.course.N` spineRef instead. Benign — M1
//     treats a course-scoped term as global either way — and confined to the fallback path,
//     which is what having ONE authority buys: the difference vanishes the moment a claim
//     carries the field.)
//   * A basename that is not a chapter slug yields a scope matching no term; M1 falls back to
//     course-wide/unscoped terms and returns null for a chapter-local one. The claim's terms
//     simply do not resolve — honest, and honest beats a confident wrong id.
//   * Only `locations[0]`: a claim in two chapters is a cross-chapter claim, and picking one of
//     its homographs would be a coin flip. The first (declaration-order) location is the
//     deterministic choice, and M2 emits it first. (§4a settles the real answer: such a claim
//     keeps the SPINE's scope.)
//
// PURE and DETERMINISTIC: no I/O, no network, no LLM, no clock, no randomness. Same input →
// same output, today and in the wave-2 re-run.

import { createHash } from "node:crypto";
import { resolve } from "./terms.mjs";

/** Longest term label we will try to match, in words, when the registry can't tell us. */
const DEFAULT_MAX_TERM_WORDS = 6;

/**
 * Closed-class words we delete. Deliberately TINY. Each earns its place by varying freely
 * under a meaning-preserving rephrase while carrying no meaning of its own: the articles, and
 * "of" (the of-genitive ↔ 's-genitive alternation is the single most common rephrase in
 * factual prose). Every other function word — including all other prepositions, copulas and
 * auxiliaries — is KEPT, because a preposition can be the whole claim ("above" vs "below") and
 * a copula carries tense. Under-absorb by default.
 */
const FILLER = new Set(["a", "an", "the", "of"]);

/**
 * Negation. Bound to the token it scopes over, never merely present in the bag — "not" floating
 * loose in a sorted multiset would make "water does not melt at 0 °C, it boils" indistinguishable
 * from a differently-negated arrangement of the same words.
 */
const NEGATION = new Set(["not", "no", "never", "neither", "nor", "none", "cannot", "without"]);

/**
 * Modality/hedging — spec §6.5's named trap. `may cause` → `causes` is a REAL knowledge change
 * (a possibility asserted as a fact) with a 4-byte diff, and a normalizer that treats hedges as
 * filler would report it as a null edit. That is the single most dangerous thing this module
 * could do, so hedges are first-class and bound to their target. Quantity hedges
 * ("approximately 100 °C" vs "100 °C") count: dropping a tolerance is a knowledge change too.
 */
const MODALITY = new Set([
  "may", "might", "could", "can", "should", "would", "must", "will", "shall", "ought",
  "possibly", "perhaps", "probably", "likely", "unlikely", "apparently", "seemingly",
  "approximately", "about", "roughly", "around", "nearly", "almost", "generally",
  "typically", "usually", "often", "sometimes", "rarely", "occasionally",
]);

/**
 * Quantifiers. "all metals conduct" → "some metals conduct" is a one-word edit that inverts the
 * claim's force; bound to their target for the same reason as negation. ("no"/"never" are
 * handled as negation — they are quantifiers too, but the negative reading is the load-bearing
 * one and one canonical home per word keeps the fold deterministic.)
 */
const QUANTIFIER = new Set([
  "all", "every", "each", "both", "any", "some", "most", "many", "much", "few", "several",
  "always", "only", "either",
]);

/**
 * Words the suffix fold must not touch: short irregulars where stripping "-s"/"-ed" produces
 * garbage ("does" → "doe") or a collision. Kept explicit rather than clever — a stemmer that
 * surprises you is a stemmer that silently merges two claims.
 */
const NO_STEM = new Set([
  "is", "are", "was", "were", "be", "been", "being", "am", "does", "do", "did", "done",
  "has", "have", "had", "this", "its", "as", "gas", "less", "plus", "thus", "its", "his",
  "yes", "us", "series", "species", "mass", "class", "process", "across", "unless", "during",
]);

/**
 * Unit alias table → canonical unit token. Spelling only; NEVER a conversion table (see header).
 * An unknown unit is kept verbatim (lowercased) rather than dropped: an unrecognized unit is
 * still a distinction, and losing it would be an over-absorption.
 */
const UNIT_ALIASES = new Map(Object.entries({
  "°c": "celsius", "c": "celsius", "degc": "celsius", "deg c": "celsius",
  celsius: "celsius", centigrade: "celsius",
  "°f": "fahrenheit", f: "fahrenheit", degf: "fahrenheit", fahrenheit: "fahrenheit",
  k: "kelvin", kelvin: "kelvin",
  g: "gram", gram: "gram", grams: "gram", kg: "kilogram", kilogram: "kilogram",
  mg: "milligram", mol: "mole", mole: "mole", moles: "mole", mmol: "millimole",
  j: "joule", joule: "joule", joules: "joule", kj: "kilojoule", kilojoule: "kilojoule",
  cal: "calorie", calorie: "calorie", kcal: "kilocalorie",
  m: "metre", metre: "metre", meter: "metre", cm: "centimetre", mm: "millimetre",
  nm: "nanometre", km: "kilometre",
  l: "litre", litre: "litre", liter: "litre", ml: "millilitre",
  s: "second", sec: "second", second: "second", seconds: "second",
  min: "minute", h: "hour", hr: "hour", hour: "hour",
  pa: "pascal", kpa: "kilopascal", atm: "atmosphere", bar: "bar", torr: "torr",
  "%": "percent", percent: "percent",
  v: "volt", volt: "volt", a: "ampere", w: "watt", hz: "hertz",
}));

/** Domain-separated SHA-256. The layer name is hashed in so an empty `spine` and an empty
 *  `provenance` cannot collide into "these two layers agree". */
function sha256(layer, payload) {
  return createHash("sha256").update(`cw.fp.v1:${layer}\n${payload}`, "utf8").digest("hex");
}

/**
 * Strip markdown/unicode noise and collapse whitespace, preserving words and case.
 * Shared by `format` (which hashes the result) and `normalizeContent` (which goes further).
 * Everything removed here is, by definition, not meaning.
 */
function stripMarkup(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/`([^`]*)`/g, "$1") // inline code — keep the code TEXT, drop the ticks
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // image → alt text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // link → link text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // heading markers
    .replace(/^\s{0,3}>\s?/gm, "") // blockquote markers
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "") // list markers
    .replace(/[*_~]{1,3}/g, "") // emphasis / bold / strike
    .replace(/\|/g, " ") // table pipes
    .replace(/[‘’‛]/g, "'") // curly single quotes
    .replace(/[“”]/g, '"') // curly double quotes
    .replace(/[‐-―−]/g, "-") // dashes / minus
    .replace(/\s+/g, " ")
    .trim();
}

/** Expand the contractions that would otherwise hide a negation inside a word. */
function expandContractions(text) {
  return text
    .replace(/\bcan't\b/g, "can not")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bshan't\b/g, "shall not")
    .replace(/\b([a-z]+)n't\b/g, "$1 not") // doesn't/isn't/couldn't/…
    .replace(/'s\b/g, "") // possessive clitic: "water's" → "water"
    .replace(/'\b/g, "");
}

/**
 * Light suffix fold. NOT a real stemmer and not trying to be: it folds the inflections that
 * vary freely under rephrase (-s, -ing, -ed) and refuses anything more aggressive, because
 * aggressive stemming merges distinct words and merging is the dangerous direction.
 */
function stem(word) {
  if (NO_STEM.has(word) || word.length <= 3) return word;
  if (/ies$/.test(word) && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(?:sses|shes|ches|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (/(?:ss|us|is)$/.test(word)) return word;
  if (/s$/.test(word)) return word.slice(0, -1);
  if (/ing$/.test(word) && word.length > 5) return word.slice(0, -3);
  if (/ed$/.test(word) && word.length > 4) return word.slice(0, -2);
  return word;
}

/** Canonical numeric form: "1.0e2" → "100", "1,000.50" → "1000.5", "-0" → "0". */
function canonicalNumber(raw) {
  const n = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n)) return String(raw).replace(/,/g, "");
  return Object.is(n, -0) ? "0" : String(n);
}

/** Canonical unit token, or null when the word is not a unit we recognize. */
function canonicalUnit(raw) {
  if (raw == null) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (UNIT_ALIASES.has(key)) return UNIT_ALIASES.get(key);
  // A degree-prefixed token is a unit even if the table has never met it ("°R").
  if (/^°/.test(key)) return key;
  return null;
}

const NUMBER = String.raw`-?\d[\d,]*(?:\.\d+)?(?:[eE][+-]?\d+)?`;
const UNITISH = String.raw`°?[A-Za-zµΩ%]+`;
const TOKEN_RE = new RegExp(
  `(${NUMBER})\\s*(${UNITISH})?|%|([A-Za-z][A-Za-z0-9]*(?:['-][A-Za-z0-9]+)*)`,
  "g",
);

/**
 * Tokenize cleaned, lowercased text into `{kind:"qty"|"word", ...}`.
 * A unit is bound to a number ONLY when it is a recognized unit; otherwise the number stands
 * alone and the word is re-emitted as a word ("100 samples", not `#100:samples`).
 */
function tokenize(text) {
  const out = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text))) {
    if (m[1] != null) {
      const unit = canonicalUnit(m[2]);
      out.push({ kind: "qty", value: canonicalNumber(m[1]), unit });
      if (m[2] && !unit) out.push({ kind: "word", w: m[2].toLowerCase() });
    } else if (m[0] === "%") {
      out.push({ kind: "word", w: "percent" });
    } else if (m[3] != null) {
      out.push({ kind: "word", w: m[3].toLowerCase() });
    }
  }
  return out;
}

/** Longest term label in the registry, in words — the greedy match window. */
function maxTermWords(terms) {
  let max = 1;
  for (const t of terms?.terms ?? []) {
    for (const label of [t.preferredLabel, ...(t.aliases ?? [])]) {
      const n = String(label ?? "").trim().split(/\s+/).filter(Boolean).length;
      if (n > max) max = n;
    }
  }
  return Math.min(max, DEFAULT_MAX_TERM_WORDS);
}

/**
 * Fold word runs to term ids, longest match first. This is where a RENAME becomes invisible to
 * `content`: both the old label (kept forever as an alias by M1's `setPreferred`) and the new
 * one resolve to the SAME id, so re-fingerprinting after a rename yields an identical `content`
 * and only `label` moves — exactly what interfaces §4 requires for claim identity to survive.
 */
function foldTerms(tokens, terms, scope) {
  const window = maxTermWords(terms);
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    if (tokens[i].kind === "word") {
      const limit = Math.min(window, tokens.length - i);
      for (let n = limit; n >= 1 && !matched; n -= 1) {
        const run = tokens.slice(i, i + n);
        if (run.some((t) => t.kind !== "word")) continue;
        const id = resolve(terms, run.map((t) => t.w).join(" "), scope ?? undefined);
        if (id) {
          out.push({ kind: "term", id });
          i += n;
          matched = true;
        }
      }
    }
    if (!matched) {
      out.push(tokens[i]);
      i += 1;
    }
  }
  return out;
}

/** The canonical surface of one non-marker item. */
function coreOf(item) {
  if (item.kind === "term") return item.id;
  if (item.kind === "qty") return item.unit ? `#${item.value}:${item.unit}` : `#${item.value}`;
  return stem(item.w);
}

/**
 * Render pending markers + a core into one token. Markers are SORTED so "may not" and "not may"
 * canonicalize alike, and BOUND to the core so scope survives the multiset sort.
 */
function render(markers, core) {
  const parts = [];
  if (markers.neg) parts.push("neg");
  for (const m of [...markers.mod].sort()) parts.push(`mod:${m}`);
  for (const q of [...markers.quant].sort()) parts.push(`q:${q}`);
  return parts.length ? `${parts.join("+")}|${core ?? "∅"}` : String(core);
}

const freshMarkers = () => ({ neg: false, mod: new Set(), quant: new Set() });
const hasMarkers = (m) => m.neg || m.mod.size > 0 || m.quant.size > 0;

/**
 * Canonicalize a claim's prose to its semantic core: terms → term ids, quantities → normalized
 * `#value:unit`, filler dropped, inflection folded, and **modality, negation and quantifiers
 * preserved and bound to what they scope over**. The result is a sorted multiset of tokens —
 * word order is absorbed (a hard requirement), which is exactly why the markers are bound
 * rather than left loose in the bag.
 *
 * Read the header for the precise class of rephrase this does and does not absorb, and for the
 * under-absorb-by-default rule that decided every judgement call in it.
 *
 * @param {string} text the claim's prose
 * @param {object} terms TERMS registry (M1) — supplies the only synonymy we ever claim
 * @param {string|null} [scope] the scope the text lives in (a chapter slug). REQUIRED for
 *   correctness wherever the package has a homograph: without it a chapter-local term folds to
 *   whichever like-labelled term was declared first package-wide. Pass `null` for genuinely
 *   package-wide text (course-level prose), which restores unscoped resolution.
 * @returns {string} the canonical string that `content` hashes. Stable across runs.
 */
export function normalizeContent(text, terms, scope = null) {
  const cleaned = expandContractions(stripMarkup(text).toLowerCase());
  const items = foldTerms(tokenize(cleaned), terms, scope);

  const out = [];
  let markers = freshMarkers();
  for (const item of items) {
    if (item.kind === "word") {
      const w = item.w;
      if (FILLER.has(w)) continue;
      if (NEGATION.has(w)) { markers.neg = true; continue; }
      if (MODALITY.has(w)) { markers.mod.add(w); continue; }
      if (QUANTIFIER.has(w)) { markers.quant.add(w); continue; }
    }
    out.push(render(markers, coreOf(item)));
    markers = freshMarkers();
  }
  // A trailing marker with nothing to bind to is still a distinction ("…, but it may not.").
  if (hasMarkers(markers)) out.push(render(markers, null));

  return out.sort().join(" ");
}

/** Sorted, de-duplicated, stringified refs — the canonical form for a set-shaped layer. */
function refSet(list) {
  return [...new Set((Array.isArray(list) ? list : []).map((r) => String(r ?? "")).filter(Boolean))]
    .sort()
    .join("|");
}

/**
 * Resolve one `termRefs` entry to `<id> <preferredLabel>`.
 *
 * Why the label rides along with the id: interfaces §5 says the `label` fingerprint is "the
 * sorted set of resolved term ids" AND §4 says a rename must move it. Those cannot both hold —
 * M1 NEVER re-mints an id on rename (that is the whole basis of claim identity surviving a
 * rename), so a hash over ids alone is constant across every rename that will ever happen and
 * the `label` layer would be dead. Including the resolved *preferred label* keeps the id as the
 * identity key (a value change still cannot move this layer) while making a rename observable.
 * See CONTRACT CONCERNS.
 */
function resolveTermRef(ref, terms, scope) {
  const raw = String(ref ?? "");
  const byId = (terms?.terms ?? []).find((t) => t.id === raw);
  if (byId) return [byId.id, byId.preferredLabel].join(" ");
  const id = resolve(terms, raw, scope ?? undefined);
  const byLabel = (terms?.terms ?? []).find((t) => t.id === id);
  if (byLabel) return [byLabel.id, byLabel.preferredLabel].join(" ");
  return ["?", raw].join(" "); // unresolvable — kept verbatim; dropping it would be an over-absorption
}

/**
 * COMPATIBILITY FALLBACK ONLY — §4a's tier 2, for claims that predate the `claim.scope` field.
 * NOT the rule: scope is data, derived once by M2 (see `scopeOf`, and the header's SCOPE note).
 * `claim.locations[0].file` → basename minus extension → the chapter slug, which is exactly M1's
 * scope key. `course`/`index`/`README` and a claim with no location are package-wide → null.
 */
function scopeFromLocation(claim) {
  const file = claim?.locations?.[0]?.file;
  if (!file) return null;
  const base = String(file).split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
  if (!base || base === "course" || base === "index" || base === "README") return null;
  return base;
}

/**
 * The claim's scope (§4a): READ from the claim, never re-derived. Presence is tested with `in`
 * because `null` is a meaningful value (package-wide) and `??` would silently re-derive it.
 * A claim lacking the field falls back to the location rule — see `scopeFromLocation`.
 */
function scopeOf(claim) {
  if (claim && typeof claim === "object" && "scope" in claim) return claim.scope ?? null;
  return scopeFromLocation(claim);
}

/** The claim's prose (`text`, now declared+required in claims.schema.json). */
function textOf(claim) {
  return String(claim?.text ?? claim?.normalizedText ?? "");
}

/** The override id, if the claim carries one. See CONTRACT CONCERNS. */
function overrideOf(claim) {
  return String(claim?.overrideId ?? claim?.override?.id ?? "");
}

/**
 * Compute a claim's five fingerprints (interfaces §3, §5).
 *
 * Each layer is hashed over a DIFFERENT projection of the claim, so M4 can classify a change by
 * which layer moved and act with the right blast radius. Pure and deterministic: no I/O, no
 * network, no LLM, no clock.
 *
 * @param {object} claim a CLAIMS.json claim node — `{text, scope, termRefs, spineRefs,
 *   sourceRefs, locations, overrideId, …}`. `claim.scope` (§4a) is READ, not derived; a claim
 *   lacking the field falls back to the location rule for compatibility.
 * @param {object} terms TERMS registry (M1)
 * @returns {{format:string, label:string, content:string, spine:string, provenance:string}}
 *   hex SHA-256 digests, one per layer
 */
export function fingerprints(claim, terms) {
  const text = textOf(claim);
  // Which term a homograph means. READ from the claim (§4a) — one authority, no re-derivation.
  const scope = scopeOf(claim);

  // format — the WORDING layer: markup/whitespace stripped, wording kept. A whitespace, reflow
  // or emphasis edit moves nothing at all; a rephrase moves this and only this, which is spec
  // §5's "format only → NONE" row.
  const format = sha256("format", stripMarkup(text));

  // label — the VOCABULARY layer: the claim's resolved terms, as a sorted set. Blind to values.
  const label = sha256(
    "label",
    [...new Set((claim?.termRefs ?? []).map((r) => resolveTermRef(r, terms, scope)))].sort().join("|"),
  );

  // content — the MEANING layer. The reason this file exists.
  const content = sha256("content", normalizeContent(text, terms, scope));

  // spine — the PEDAGOGY layer: which concepts/objectives the claim hangs under.
  const spine = sha256("spine", refSet(claim?.spineRefs));

  // provenance — the SOURCE layer: what it cites, plus any override that authorizes divergence.
  // The override joins here because "this claim now diverges from its source, on purpose" is a
  // provenance fact, and recording it must move the layer the fidelity checker watches.
  const provenance = sha256("provenance", `${refSet(claim?.sourceRefs)}\n${overrideOf(claim)}`);

  return { format, label, content, spine, provenance };
}

// CONTRACT HISTORY (five defects this implementation surfaced; ALL now fixed at the source —
// kept here because the reasoning is the load-bearing part, and a fixed contract with a
// forgotten rationale is one refactor away from being un-fixed)
// -----------------------------------------------------------------------------------------
// 1. `label` over ids ALONE is CONSTANT ACROSS EVERY RENAME. §5 originally said the layer was
//    "the sorted set of resolved term ids" while §4 said a rename moves it — impossible, because
//    M1 never re-mints an id on rename (that is *how* claim identity survives §4). The layer
//    would have been dead code, §4's rename row unreachable, and the whole terminology-migration
//    (IUPAC) case would have silently never fired. FIXED in §5: hash `termId + preferredLabel`
//    per ref — the id keeps the layer immune to value changes, the label makes a rename visible.
// 2. A schema-valid claim carried NO PROSE (`additionalProperties:false`, no `text` property)
//    while `fingerprints` must hash its content — M2's output could not have validated. FIXED:
//    `text` is declared and required in claims.schema.json.
// 3. Same for the override id (`status:"overridden"` is a flag, not an id). FIXED: `overrideId`
//    is declared in claims.schema.json.
// 4. `normalizeContent` had NO SCOPE parameter, so resolution was unscoped and M1's scope rule
//    could not apply — a chapter-local homograph folded to whichever like-labelled term was
//    declared first package-wide, a silent mis-identification. FIXED: §3 now carries
//    `normalizeContent(text, terms, scope)`, and `fingerprints` derives scope from
//    `claim.locations[0].file` (mapping documented in the header).
// 6. ...and that fix was itself half-wrong, which is the more useful lesson. The derivation was
//    right; its LOCATION was not. M6 needed the same fact and derived it from `spineRefs` while
//    M3 derived it from `locations[0].file` — one fact, two derivations, two modules able to
//    disagree silently about a claim's subject. FIXED in §4a: `scope` is a required field on the
//    claim, derived ONCE by M2 (spine first, then file, then null); every other module READS it.
//    The general rule, worth more than the instance: **convergent need across two consumers means
//    the fact belongs to the data, not to either consumer.**
// 5. §5's `format` rule was self-contradictory ("strip whitespace noise" AND "moves on cosmetic
//    edits", when whitespace IS cosmetic). FIXED: `format` is the WORDING layer — blind to
//    whitespace/markup, moves on rephrase. A pure whitespace edit therefore moves NO fingerprint
//    at all (the product's #1 requirement, stated as an invariant), and format-only-moved means
//    exactly "rephrase" → NONE.
