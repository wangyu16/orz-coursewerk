// Consistency scan (M6) — the UNDECLARED-EDGE RECALL BACKSTOP.
//
// Why this exists
// ---------------
// The claim graph is built out of DECLARED provenance: the generator says, as it writes,
// which spine node and which source a claim hangs off (spec §10 decision 1, M12). Every
// impact analysis downstream — M5's reachability, M9's propagation — walks those declared
// edges. Which means the graph can only protect what somebody remembered to declare.
//
// A dependency the generator FORGOT to declare is an INVISIBLE dependency. And an invisible
// dependency is not a small documentation gap: it is EXACTLY a silent breakage — the headline
// metric this whole index exists to drive to zero. The edge that is missing is, by definition,
// the edge nobody will notice is missing.
//
// The motivating real case, which no declared edge catches:
//
//     study-guide/ch3.md   "At standard pressure the melting point of water is 100 °C."
//     practice/ch3.md      "What is the melting point of water? **Answer:** 90 °C"
//
// Nothing links them. Both are locally well-formed, both pass every per-file check, both look
// fine to a reviewer reading either file alone. The package is internally at war with itself
// and the only casualty is a student who answers correctly and is marked wrong. ONLY a
// cross-artifact scan sees it — so this module does not ask the graph for permission. It reads
// every claim and finds the disagreement DETERMINISTICALLY, with no declared edge required.
// Declared-first for recall; deterministic scan as the backstop (spec §1 principles).
//
// This is a DETECTOR, not a judge. It reports that two artifacts disagree; it never decides
// which one is right. That adjudication is the instructor's, via M10's escalation queue.
//
// `kind` HERE IS A DETECTOR KIND — DO NOT ALIGN IT TO THE QUEUE'S ENUM
// -------------------------------------------------------------------
// `value-disagreement` / `definition-drift` name WHAT WAS OBSERVED. `review_queue.schema.json`'s
// enum (`internal-inconsistency`, …) names WHAT THE HUMAN IS ASKED, and it is part of M10's
// dedupe key so that one decision = one queue item: if this scan and the M11 gate reach the same
// claim set, that is ONE adjudication and the two flags must merge. The two vocabularies are
// therefore different ON PURPOSE, they are NOT a mapping bug, and the fold is M10's job alone
// (it owns the table and THROWS on an unmapped kind rather than silently bucketing; the queue
// also carries `detectorKinds[]`, so folding never destroys the finer kind).
// Anyone "helpfully" renaming these to match the queue destroys the observation→request
// distinction and collapses two detectors into one indistinguishable item. Don't.
//
// Why it scans candidate terms too
// --------------------------------
// It works on `status:"confirmed"` AND `status:"candidate"` terms (spec §10 decision 3). A
// candidate is a term found in prose and not yet authorized into the concept map — and
// agreement-checking it is useful the moment it exists, because a package can contradict itself
// about a word long before the instructor blesses that word. Waiting for authorization would
// mean detection starts late, i.e. exactly when the contradiction has already shipped.
// (`lifecycle` is likewise ignored: a `deprecated-but-teach` term is still taught, so it can
// still be taught inconsistently.) Only ORPHAN analysis trusts confirmed-only — a different
// question, in a different module.
//
// PRECISION IS A FEATURE, NOT A TAX
// ---------------------------------
// The failure mode of a scan like this is not missing a bug — it is ALARM FATIGUE. A detector
// that flags everything gets muted, and a muted detector protects nobody; it is strictly worse
// than none, because it also buys false confidence. So the governing question here is never
// "could these two numbers be related?" but "can I NAME the subject they are both about,
// without guessing?" If the answer needs a guess, this module stays silent and says so below.
//
// How a SUBJECT is keyed (the false-positive firewall)
// ---------------------------------------------------
// A finding requires two claims to be about THE SAME SUBJECT. Subject is keyed as:
//
//     subject = (single resolved term id, physical dimension of the quantity)
//
// Both halves earn their place:
//   - TERM ID (via M1 `resolve`, so aliases collapse: "melting point" ≡ "fusion point" ≡
//     "melting temperature") — this is what keeps a melting point from ever colliding with a
//     boiling point. They are different terms, so they are different subjects, so a 100 and a
//     90 under them are simply two facts, not a contradiction.
//   - DIMENSION (temperature / mass / energy / …, normalized to one canonical unit per
//     dimension) — one term legitimately carries several properties. A melting point of 0 °C
//     and a latent heat of 334 J/g are the same term's neighbourhood but not the same claim;
//     without the dimension half, every number under a term would fight every other number.
//     Normalizing also makes 212 °F and 100 °C AGREE, which a string compare would not.
//
// A claim's term is taken DECLARED-FIRST: exactly one `termRefs` entry means the generator
// already told us what the claim is about, and we believe it. Only an undeclared claim gets the
// text scan, and only when the scan finds EXACTLY ONE term. Ambiguity is never resolved by
// picking a winner.
//
// WHAT THIS DELIBERATELY DOES NOT FLAG (each one is a false-positive class, bought on purpose)
// -------------------------------------------------------------------------------------------
//  1. UNITLESS NUMBERS. "step 3", "Chapter 2", "the first 5 minutes of class" — bare integers
//     are the single richest source of spurious collisions, and a number with no unit has no
//     dimension, hence no subject. Only quantities carrying a recognized unit are compared.
//  2. QUANTITIES IN DIFFERENT DIMENSIONS under one term. Not a disagreement — a different
//     property. See above.
//  3. CLAIMS NAMING MORE THAN ONE TERM (undeclared ones). "The latent heat of fusion at the
//     melting point is 334 J/g" names two terms; attributing the number to one of them would be
//     a guess wearing a deterministic costume. The fix is a DECLARATION (M12), not a heuristic.
//     [AMENDED, red-team round 1 (CONFIDENCE F11)] Silence here was itself the bypass: one extra key term in a
//     sentence hid a 22 vs 11 kcal disagreement. A scanned text naming several terms now compares each value under the
//     term that governs it in its own sentence (the nearest mention before it) — `governedQuantities`. Declared
//     termRefs keep their rule.
//  4. A CLAIM CARRYING SEVERAL DIFFERENT VALUES IN ONE DIMENSION. "melts between 90 °C and
//     100 °C", or a worked example walking a value through steps. A range is not a
//     disagreement, and we cannot tell which number is the assertion. That dimension is dropped
//     for that claim.
//  5. `derived` AND `procedure` CLAIMS. This is the "worked example vs stated constant" guard.
//     A worked example legitimately carries numbers that are not assertions about the term (an
//     intermediate, a made-up sample, a different starting condition). Only ASSERTIVE types —
//     `fact`, `answer-key`, `definition` — state a term's value on the record. (`objective`
//     states coverage, not values.) Accepted cost: a wrong number inside a worked example is
//     not caught here; it is caught by M5's declared edges and the decoupled reviewer.
//  6. NON-`active` CLAIMS (`overridden`, `deprecated`). An `overridden` claim is an AUTHORIZED
//     divergence the instructor already settled (M7, spec §10 decision 2's ask-once rule).
//     Re-raising a settled decision is the textbook definition of alarm fatigue.
//  7. SEMANTIC EQUIVALENCE OF DEFINITIONS. Deciding that two differently-worded definitions
//     mean the same thing needs an LLM, and there is no LLM in the index path (spec §1). So
//     `definition-drift` compares a canonical form that folds only what is provably cosmetic:
//     case, whitespace, markdown, punctuation, articles, and term ALIASES (via M1). Accepted
//     cost: a genuine meaning-preserving rephrase of a definition surfaces as drift. That
//     asymmetry is deliberate — a definition's wording is pedagogically load-bearing, and two
//     files teaching one term with two different sentences is worth one look.
//
// Scope: resolution is scope-aware where the claim tells us its scope (derived from a
// `concept.<chapter>.<n>` / `objective.<chapter>.<n>` spineRef), so a homograph in another
// chapter does not resolve into this one — M1's scope rule, honoured rather than bypassed.
//
// Complexity is O(claims · terms) and that is FINE at course scale (~500 files, a few thousand
// claims): a few million cheap string tests, well under a second. No index, no service, no
// cache to invalidate — spec §1's "no database server", taken seriously.
//
// PURE and DETERMINISTIC: same input → same output. No I/O, no network, no LLM, no clock, no
// randomness. Output is fully sorted, so a diff of two scans shows only real change.

import { resolve, labelMatcher, findLabelOccurrences } from "./terms.mjs";
import { dimensionProjection } from "./units.mjs";
import { valueText, valuesIn } from "./core/values.mjs";

/**
 * Claim types whose numbers are ASSERTIONS ABOUT THE TERM, and so can contradict each other.
 * See non-flag (5): `derived`/`procedure` carry example arithmetic, `objective` carries no value.
 */
const ASSERTIVE_TYPES = new Set(["fact", "answer-key", "definition"]);

/**
 * An orz `:::: tabs` container holds the QUESTION and the ANSWER in one block (M2 anchors the
 * container, so a declaration can address it). Two consequences the design audit (H2/H3,
 * 2026-09-05) showed a package could pack through:
 *   - a distractor value in the question ("a classmate insists it is 5 °C") shares the dimension
 *     with the answer's value, and non-flag 4 dropped the dimension — so a WRONG answer key went
 *     uncompared;
 *   - a declared `type` of `derived`/`procedure` on an answer block took it out of the scan.
 * So an ANSWER TAB is the assertion: when a block carries one, only the answer bodies are scanned
 * for values, and the block is assertive whatever type its declaration claims.
 */
// Tolerant of collapsed whitespace (claim text may be normalized to one line): the tab title is
// `Answer` plus at most one token (`Answer 8`), and the body runs to the next fence.
const ANSWER_TAB = /:{3,}[ \t]*tab[ \t]+answer(?:[ \t]+[\w.-]+)?[ \t]*\n?([\s\S]*?)(?=:{3,}|(?![\s\S]))/gi;
// The `**Answer:** 7 °C` line convention — the same convention M2's scanner mints `answer-key` from.
const ANSWER_LINE = /(?:^|\n)[ \t]*(?:\*\*|__)?answer(?:[ \t]*\d+)?[ \t]*:?(?:\*\*|__)?:?[ \t]*([^\n]+)/gi;
function answerBodies(text) {
  const out = [];
  const t = String(text ?? "");
  ANSWER_TAB.lastIndex = 0;
  let m;
  while ((m = ANSWER_TAB.exec(t))) out.push(m[1]);
  if (out.length) return out;
  ANSWER_LINE.lastIndex = 0;
  while ((m = ANSWER_LINE.exec(t))) out.push(m[1]);
  return out;
}
const hasAnswerTab = (text) => answerBodies(text).length > 0;
const isAssertive = (claim) => ASSERTIVE_TYPES.has(claim?.type) || hasAnswerTab(claimText(claim));

/** Articles are the only words folded away when comparing definitions — provably cosmetic. */
const ARTICLES = new Set(["a", "an", "the"]);

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * THE DIMENSIONED VIEW of the shared unit table (`lib/units.mjs`).
 *
 * This module used to own `SYMBOL_UNITS`/`WORD_UNITS` outright — one of THREE unit tables in the
 * index (M3 had spelling aliases, M2 a bare recognizer), which was interfaces §5d's own check
 * failing on §5d's own example. They had already drifted, in the dangerous direction: M3 knew
 * `torr`/`V`/`A`/`W`/`Hz` and M2's scanner did not, so a "5 V" claim was never minted, so THIS
 * SCAN had nothing to compare, so the package reported zero flags it had not earned. §5d's
 * prescription is derive-once-at-the-source and project per consumer, so the fact now lives in the
 * data and this module takes the projection it needs — the dimensioned one.
 *
 * The two halves this projection supplies are exactly the two this module's subject key is made of:
 *   - the DIMENSION stops a melting point colliding with a latent heat (see the header);
 *   - the CONVERSION is what makes 212 °F and 100 °C AGREE instead of alarm.
 * `lookup` still refuses rather than guesses: an unrecognized unit (and a recognized-but-ambiguous
 * one, "90 degrees") yields no quantity, hence no finding. Silence, not a guess.
 *
 * CASE IS PART OF THE CONTRACT, and it is the shared table that keeps it: symbols match exactly
 * (`mg` is not `Mg`; `K` is kelvin, `k` is kilo- and is not a unit here at all) while spelled-out
 * words fold case. M3's projection of the SAME table is wholly case-insensitive, because M3
 * lowercases prose before it reads it — the same units, two case disciplines, one source.
 */
const UNIT_VIEW = dimensionProjection();

// Values are read by the one value parser (core/values.mjs, `scanValues` below), over the same shared table —
// longest unit form first, so "kJ/mol" wins over "kJ" and "min" over "m". (Until red-team round 2 this scan had
// its own regex, `quantityRegexSource`; see R2-K08.)

/** Look a matched unit form up: symbols exactly (case-sensitive), words case-insensitively. */
const unitEntry = (form) => UNIT_VIEW.lookup(form);

/**
 * THE ONE VALUE PARSER (red-team round 2, CONFIDENCE R2-K08). This scan once read values with its own regex
 * (`quantityRegexSource`: `-?\d+` glued to a unit form), so a spaced or typeset minus was no sign ("= - 92.2 kJ"
 * agreed with "= 92.2 kJ"), "1,200 kJ" read as "200 kJ", and "kJ mol^{-1}" lost its denominator and was compared as
 * an energy while "kJ/mol" was a molar energy. It now reads values exactly as the verdict path does
 * (core/values.mjs: every minus, thousands separators, HTML entities, denominators) and dimensions them through the
 * shared table. A value with denominators the table has no row for is dimensioned only where the result is certain
 * (an energy per mole / per gram / per kilogram); anything else stays silence, never a guess.
 * @returns {Array<{entry: {id, dim, to}, value: number, raw: string, at: number}>} positions index valueText(text)
 */
function unitEntryOf(unit) {
  const direct = unitEntry(unit);
  if (direct) return direct;
  const [base, ...den] = String(unit).split("/");
  const b = unitEntry(base);
  if (!b || b.dim !== "energy" || den.length !== 1) return null;
  if (den[0] === "mol") return { id: `${b.id}-per-mole`, dim: "molar-energy", to: b.to };
  if (den[0] === "g") return { id: `${b.id}-per-gram`, dim: "specific-energy", to: b.to };
  if (den[0] === "kg") return { id: `${b.id}-per-kilogram`, dim: "specific-energy", to: (v) => b.to(v) / 1000 };
  return null;
}
export function scanValues(text) {
  const P = valueText(text);
  return valuesIn(P).map((v) => ({ entry: unitEntryOf(v.unit), value: v.value, raw: P.slice(v.at, v.end).replace(/\s+/g, " ").trim(), at: v.at })).filter((x) => x.entry);
}

/**
 * Strip the markdown noise that carries no meaning ("**Answer:** 100 °C" ⇒ "Answer: 100 °C"),
 * and heal a spaced degree sign ("100 ° C") so it is one unit again.
 */
function plainText(text) {
  return String(text ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[*_~#>|]/g, " ")
    .replace(/°[\s ]+([CF])/g, "°$1")
    .replace(/[\s ]+/g, " ")
    .trim();
}

/**
 * The claim's prose. `text` is a REQUIRED field of `claims.schema.json` (added 2026-07-16, after
 * M3 and this module hit the same gap from opposite directions: the schema was
 * `additionalProperties:false` with no text field, so a schema-valid serialized claim was
 * unreadable by the modules that must read it). It is required rather than optional precisely so
 * that "no text" cannot be a normal state.
 *
 * We still read defensively: absence means "nothing to compare" and the claim is skipped in
 * silence, never guessed at. A malformed claim must not take the scan down with it — and a
 * detector that invents the words it failed to read would be worse than one that stays quiet.
 */
const claimText = (claim) => plainText(claim?.text);

/** First location's file — what the instructor needs in order to go and look. */
function claimFile(claim) {
  const loc = (claim?.locations ?? [])[0];
  return loc?.file ? String(loc.file) : `(no location: ${claim?.id ?? "?"})`;
}

/**
 * The claim's scope — READ, NEVER DERIVED (interfaces §4a).
 *
 * Scope selects which term an ambiguous label resolves to, so it decides what a claim is ABOUT.
 * This module once derived it from `spineRefs` while M3 was about to derive it from
 * `locations[0].file`: two modules deriving one fact two ways is two modules silently
 * disagreeing about a claim's subject — the exact defect class this index exists to catch,
 * reproduced inside the index itself. So the fact belongs to the DATA. M2 derives it ONCE at
 * extraction; every other module reads the field.
 *
 * `null` is MEANINGFUL — it means package-wide, which is a decision M2 MADE, not an absence. So
 * we branch on the field's PRESENCE. A `claim.scope ?? derive(...)` would silently re-derive for
 * every package-wide claim, quietly resurrecting the divergence the field exists to kill.
 *
 * The fallback below is COMPATIBILITY, NOT RULE: M2 is not built yet, so a hand-built claim may
 * predate the field. It mirrors §4a's frozen derivation (spineRefs first — the spine is the
 * instructor's own structure, so it outranks file placement). It is dead code the day M2 lands,
 * and it must never become the reason a claim's scope disagrees with M3's.
 */
function claimScope(claim) {
  if (claim && "scope" in claim) {
    // null (package-wide) => undefined: M1's "resolve in any scope" argument. Read, not derived.
    return claim.scope === null ? undefined : String(claim.scope);
  }
  for (const ref of claim?.spineRefs ?? []) {
    const m = /^(?:concept|objective)\.([^.]+)\./.exec(String(ref));
    if (m && m[1] !== "course") return m[1];
  }
  return undefined;
}

/** Every surface form a term answers to. */
const labelsOf = (t) => [t?.preferredLabel, ...(t?.aliases ?? [])].filter(Boolean);

/** Cached whole-word matcher for a label (lookarounds, not \b: labels may end in punctuation). */
// W14: the matcher is M1's (`labelMatcher`), not a private copy that could drift from M2's.
const labelRe = (label) => labelMatcher(label);

/**
 * Term ids mentioned in a text, alias- and scope-aware. The id always comes from M1's
 * `resolve` — this module recognizes surface forms but is not a second vocabulary authority.
 */
function termsInText(text, terms, scope) {
  const ids = new Set();
  for (const term of terms?.terms ?? []) {
    for (const label of labelsOf(term)) {
      if (!labelRe(label).test(text)) continue;
      const id = resolve(terms, label, scope);
      if (id) ids.add(id);
    }
  }
  return ids;
}

/**
 * THE SUBJECT RULE. Exactly one term, or nothing.
 * Declared-first: one `termRefs` entry is the generator telling us the subject, and it wins even
 * if the prose name-drops other terms. Undeclared claims fall back to the text scan, which must
 * also land on exactly one term. Zero terms ⇒ no subject; two or more ⇒ ambiguous, and we do not
 * pick a winner (non-flag 3).
 */
function subjectTerm(claim, terms, scope) {
  const declared = (claim?.termRefs ?? []).map(String).filter((r) => r.startsWith("term."));
  if (declared.length === 1) return declared[0];
  if (declared.length > 1) return null;
  const found = [...termsInText(claimText(claim), terms, scope)];
  return found.length === 1 ? found[0] : null;
}
/**
 * The subjects a claim's values are compared under. A DECLARED list of two or more terms used to
 * mean "no subject" (non-flag 3) — which let a wrong answer key opt OUT of comparison by declaring
 * one extra term (design audit H3). Declared terms are the generator's assertion, so each of them
 * is a subject; the scan fallback still requires exactly one term, because there the ambiguity is
 * the machine's, not the author's.
 */
function subjectTerms(claim, terms, scope) {
  // Only a DECLARED claim's termRefs are the author's assertion; a scan-found claim's termRefs are
  // the scanner's guess and keep the exactly-one-term rule (else a worked example naming two terms
  // would be compared under both — the alarm-fatigue trap).
  const declared = claim?.provenanceDeclared === true ? (claim?.termRefs ?? []).map(String).filter((r) => r.startsWith("term.")) : [];
  if (declared.length >= 1) return [...new Set(declared)].sort(byString);
  const one = subjectTerm(claim, terms, scope);
  return one ? [one] : [];
}

/** Stable key for a converted value — kills float noise without pretending to 15 digits. */
const valueKey = (n) => String(Number(n.toPrecision(9)));

/**
 * Quantities in a text, one entry per (dimension) with its canonical value and the ORIGINAL
 * surface form for the evidence line. A dimension carrying two DIFFERENT values in one claim is
 * dropped (non-flag 4): a range or a worked-through value is not an assertion we can attribute.
 * @returns {Map<string, {key:string, raw:string}>} dimension -> value
 */
function quantitiesByDimension(text) {
  const byDim = new Map();
  const dropped = new Set();
  const answers = answerBodies(text);
  const scanned = answers.length ? answers.join("\n") : text; // the ANSWER is the assertion (H2)
  // Inside an ANSWER, the first value per dimension IS the answer; a restatement in another unit
  // ("5 °C, i.e. 278 K") must not drop the dimension (round-3 verify B3). In prose, two different
  // values for one dimension stay a range/worked example and are dropped (non-flag 4).
  const inAnswer = answers.length > 0;
  // Round-4 audit (atk3/atk4): picking the FIRST value in an answer let "0 °C is the reference…
  // therefore 5 °C" pack, and refused "Not 5 °C … is 0 °C". An answer that carries two DIFFERENT
  // values of one dimension is neither compared nor trusted: it is an `ambiguous` decision for a
  // human (a review item), never a guess in either direction.
  const ambiguous = new Set();
  // recognized-but-ambiguous units (bare "degrees") never reach here: no value, silence
  for (const { entry, value, raw } of scanValues(scanned)) {
    const key = valueKey(entry.to(value));
    const prior = byDim.get(entry.dim);
    if (!prior) byDim.set(entry.dim, { key, raw });
    else if (prior.key !== key) { dropped.add(entry.dim); if (inAnswer) ambiguous.add(`${entry.dim}: ${prior.raw} vs ${raw}`); }
  }
  for (const dim of dropped) byDim.delete(dim);
  byDim.ambiguous = ambiguous;
  return byDim;
}

/**
 * The values of a scanned text whose sentences name SEVERAL terms, each under the term that governs it: the nearest
 * term mention before the value in its own sentence (else the nearest after it). A sentence naming no term attributes
 * nothing. One term carrying two different values of one dimension in the text is dropped, as a range (non-flag 4).
 * Red-team round 1 (CONFIDENCE F11): "exactly one term or nothing" let a second key term silence a disagreement.
 * @returns {Map<string, Map<string, {key:string, raw:string}>>} termId -> dimension -> value
 */
function governedQuantities(text, terms, scope) {
  const out = new Map(), dropped = new Set();
  const t = String(text ?? "");
  let start = 0;
  const bounds = [...t.matchAll(/(?<=[.!?])\s+(?=[A-Z$(\\])/g)].map((m) => m.index);
  for (const end of [...bounds, t.length]) {
    // the sentence as the value parser reads it: term mentions and values index the same folded text
    const sentence = valueText(t.slice(start, end));
    start = end;
    const mentions = [];
    for (const term of terms?.terms ?? []) {
      for (const label of labelsOf(term)) {
        const id = resolve(terms, label, scope);
        if (!id) continue;
        for (const o of findLabelOccurrences(sentence, label)) mentions.push({ id, at: o.start });
      }
    }
    if (!mentions.length) continue;
    for (const { entry, value, raw, at } of scanValues(sentence)) {
      const before = mentions.filter((x) => x.at < at).sort((a, b) => b.at - a.at)[0];
      const owner = before || mentions.filter((x) => x.at > at).sort((a, b) => a.at - b.at)[0];
      if (!owner) continue;
      const key = valueKey(entry.to(value));
      if (!out.has(owner.id)) out.set(owner.id, new Map());
      const dims = out.get(owner.id), prior = dims.get(entry.dim);
      if (!prior) dims.set(entry.dim, { key, raw });
      else if (prior.key !== key) dropped.add(`${owner.id}|${entry.dim}`);
    }
  }
  for (const k of dropped) { const i = k.lastIndexOf("|"); out.get(k.slice(0, i))?.delete(k.slice(i + 1)); }
  return out;
}

/** Claims worth comparing: active, assertive, readable. */
function comparableClaims(list) {
  return list.filter(
    (c) =>
      c &&
      isAssertive(c) &&
      (c.status ?? "active") === "active" &&
      claimText(c).length > 0,
  );
}

/** Accept either a CLAIMS object or a bare array — callers hold it both ways mid-pipeline. */
function claimList(claims) {
  if (Array.isArray(claims)) return claims;
  return Array.isArray(claims?.claims) ? claims.claims : [];
}

const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** A short, quotable snippet of the claim, for the instructor reading the queue. */
function snippet(text, max = 140) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * value-disagreement: one subject (term + dimension), two or more different values.
 * All claims on the subject are reported — including the ones that agree — because the
 * instructor adjudicating "is it 100 or 90?" needs the whole split, not one side of it.
 */
function valueDisagreements(list, terms) {
  const groups = new Map(); // `${termId}|${dim}` -> [{claim, key, raw}]
  const findings = [];
  // Round-4 audit (atk1b): two worked ENERGY answers were compared as values of a TEMPERATURE term
  // because both mention "melting point". A scan-found claim's subject carries only the dimensions
  // that DECLARED claims give that term; with no declared claim about the term, the old rule holds.
  const declaredDims = new Map();
  for (const claim of comparableClaims(list)) {
    if (claim.provenanceDeclared !== true) continue;
    for (const termId of subjectTerms(claim, terms, claimScope(claim)))
      for (const [dim] of quantitiesByDimension(claimText(claim))) { if (!declaredDims.has(termId)) declaredDims.set(termId, new Set()); declaredDims.get(termId).add(dim); }
  }
  for (const claim of comparableClaims(list)) {
    const scope = claimScope(claim);
    const subjects = subjectTerms(claim, terms, scope);
    if (subjects.length === 0) {
      // a scanned claim naming SEVERAL terms (red-team round 1, F11: adding "over an iron catalyst" to a sentence hid a
      // 22 vs 11 kcal disagreement): each value is compared under the term that governs it in its own sentence
      const undeclared = claim.provenanceDeclared !== true && !(claim.termRefs ?? []).some((r) => String(r).startsWith("term."));
      if (!undeclared || answerBodies(claimText(claim)).length) continue;
      for (const [termId, dims] of governedQuantities(claimText(claim), terms, scope)) {
        for (const [dim, q] of dims) {
          if (declaredDims.has(termId) && !declaredDims.get(termId).has(dim)) continue;
          const key = `${termId}|${dim}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push({ claim, ...q });
        }
      }
      continue;
    }
    const quantities = quantitiesByDimension(claimText(claim));
    if (quantities.ambiguous?.size) {
      findings.push({
        kind: "ambiguous-answer",
        claimIds: [String(claim.id)],
        evidence: [
          `${claimFile(claim)}: the answer states two different values of one dimension (${[...quantities.ambiguous].join("; ")}) — it cannot be compared and a student cannot tell which is the answer.`,
          `${claim.id} (${claim.type}) at ${claimFile(claim)}: "${snippet(claimText(claim))}"`,
          "Leave exactly one value as the answer, or move the other into the question or an explanation outside the answer.",
        ],
        _sort: `ambiguous|${claim.id}`,
      });
    }
    for (const [dim, q] of quantities) {
      for (const termId of subjects) {
        if (claim.provenanceDeclared !== true && declaredDims.has(termId) && !declaredDims.get(termId).has(dim)) continue;
        const key = `${termId}|${dim}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ claim, ...q });
      }
    }
  }
  for (const [key, members] of groups) {
    if (new Set(members.map((m) => m.key)).size < 2) continue; // agreement ⇒ silence
    const termId = key.slice(0, key.lastIndexOf("|"));
    const sorted = [...members].sort((a, b) => byString(String(a.claim.id), String(b.claim.id)));
    const headline = `${sorted
      .map((m) => `${claimFile(m.claim)} asserts ${m.raw}`)
      .join("; ")} for ${termId}`;
    findings.push({
      kind: "value-disagreement",
      claimIds: sorted.map((m) => String(m.claim.id)),
      evidence: [
        headline,
        ...sorted.map(
          (m) =>
            `${m.claim.id} (${m.claim.type}) at ${claimFile(m.claim)}: "${snippet(claimText(m.claim))}"`,
        ),
      ],
      _sort: key,
    });
  }
  return findings;
}

/**
 * definition-drift: one term, two different definitions.
 * The canonical form folds ONLY the provably cosmetic (case, markdown, punctuation, whitespace,
 * articles) plus term aliases via M1 — so "the fusion point is the temperature at which a solid
 * becomes liquid" and "melting point: temperature at which a solid becomes liquid" are ONE
 * definition, while "…at which a liquid becomes solid" is not (word ORDER is preserved: a token
 * multiset would call an inverted definition identical).
 */
function definitionKey(text, terms, scope) {
  let t = ` ${text} `;
  const labels = [];
  for (const term of terms?.terms ?? []) {
    for (const label of labelsOf(term)) {
      const id = resolve(terms, label, scope);
      if (id) labels.push({ label, id });
    }
  }
  labels.sort((a, b) => b.label.length - a.label.length || byString(a.label, b.label));
  for (const { label, id } of labels) {
    t = t.replace(labelMatcher(label, "gi"), ` ${id} `);
  }
  return (t.match(/[A-Za-z0-9][A-Za-z0-9.\-]*/g) ?? [])
    .map((tok) => tok.replace(/[.\-]+$/, "").toLowerCase())
    .filter((tok) => tok && !ARTICLES.has(tok))
    .join(" ");
}

function definitionDrift(list, terms) {
  const groups = new Map(); // termId -> [{claim, key}]
  for (const claim of comparableClaims(list)) {
    if (claim.type !== "definition") continue;
    const scope = claimScope(claim);
    const termId = subjectTerm(claim, terms, scope);
    if (!termId) continue;
    const key = definitionKey(claimText(claim), terms, scope);
    if (!key) continue;
    if (!groups.has(termId)) groups.set(termId, []);
    groups.get(termId).push({ claim, key });
  }

  const findings = [];
  for (const [termId, members] of groups) {
    if (new Set(members.map((m) => m.key)).size < 2) continue;
    const sorted = [...members].sort((a, b) => byString(String(a.claim.id), String(b.claim.id)));
    const headline = `${sorted
      .map((m) => `${claimFile(m.claim)} defines it as "${snippet(claimText(m.claim), 90)}"`)
      .join("; ")} — conflicting definitions of ${termId}`;
    findings.push({
      kind: "definition-drift",
      claimIds: sorted.map((m) => String(m.claim.id)),
      evidence: [
        headline,
        ...sorted.map((m) => `${m.claim.id} at ${claimFile(m.claim)}: "${snippet(claimText(m.claim))}"`),
      ],
      _sort: termId,
    });
  }
  return findings;
}

/**
 * Scan every claim for cross-artifact disagreement — no declared edge required.
 *
 * The undeclared-edge backstop (spec §3 M6, §10 decision 1): a dependency the generator forgot
 * to declare is invisible to the claim graph, and an invisible dependency is a silent breakage.
 * This finds the disagreement deterministically instead, by asking whether two claims about the
 * SAME subject assert different things. It detects, it never adjudicates — M10 queues the
 * finding and the instructor decides which artifact is wrong.
 *
 * Works on `confirmed` AND `candidate` terms (spec §10 decision 3): detection must work from day
 * one, not from authorization day. Conservative by design — see the header for the seven classes
 * it deliberately does NOT flag, all of which exist to keep the queue worth reading.
 *
 * PURE and DETERMINISTIC. O(claims · terms), which is fine at course scale.
 *
 * @param {{claims:Array<object>}|Array<object>} claims CLAIMS (`metadata/CLAIMS.json`) or a bare
 *   claim array. Reads the required `text` and `scope` fields; `scope` is M2's, READ and never
 *   re-derived (interfaces §4a), and `scope: null` means package-wide.
 * @param {{terms:Array<object>}} terms TERMS (M1 `buildTerms`) — the vocabulary authority used
 *   to collapse aliases onto one subject. Term `status`/`lifecycle` are intentionally ignored.
 * @returns {Array<{kind:"value-disagreement"|"definition-drift", claimIds:string[],
 *   evidence:string[]}>} findings, sorted by (kind, subject, claimIds) and thus stable across
 *   runs. `kind` is a DETECTOR kind (what was observed) and is deliberately NOT the queue's enum
 *   (what the human is asked) — M10 owns that fold; see the header. `claimIds` lists every claim
 *   on the subject — the agreeing ones too, so the split is legible. `evidence` is an array of
 *   human-readable lines (the shape `review_queue.schema.json` takes), headline first.
 */
export function scanConsistency(claims, terms) {
  const list = claimList(claims);
  return [...valueDisagreements(list, terms), ...definitionDrift(list, terms)]
    .sort(
      (a, b) =>
        byString(a.kind, b.kind) ||
        byString(a._sort, b._sort) ||
        byString(a.claimIds.join(","), b.claimIds.join(",")),
    )
    .map(({ kind, claimIds, evidence }) => ({ kind, claimIds, evidence }));
}

// ==================== RANGE AUDIT (M6b) — IS EACH NUMBER PHYSICALLY POSSIBLE AT ALL? ====================
//
// A DIFFERENT QUESTION FROM THE SCAN ABOVE. `scanConsistency` asks whether the package's numbers
// AGREE WITH EACH OTHER; it is silent on a value that is internally consistent and physically
// impossible. Every artifact can say "the mixture was cooled to -40 K" in perfect agreement, and a
// cross-artifact scan reports zero flags it has not earned — the same "clean bill of health
// manufactured by a blind spot" the shared unit table (`lib/units.mjs`) exists to refuse. So this
// check reads EACH claim ALONE and asks the orthogonal question: is this quantity possible at all?
//
// It lives beside `scanConsistency` because it shares the SAME quantity substrate — `QUANTITY_RE`,
// `unitEntry`, `plainText`, `claimText`, `comparableClaims` — and interfaces §5d's discipline is
// ONE scanner projected per question, not a fifth reimplementation of "find a number bound to a
// unit" (the mistake `units.mjs` was built to end). Reusing `comparableClaims` is also
// semantically right: only ASSERTIVE claims (`fact`/`answer-key`/`definition`) state a value on the
// record, so a worked example's intermediate (a `-5` inside a subtraction step of a `derived`
// claim) is never flagged — the same non-flag-5 guard the consistency scan already buys.
//
// CONSERVATIVE BY CONSTRUCTION — ONLY THE PHYSICALLY IMPOSSIBLE FIRES, NEVER THE MERELY UNUSUAL.
// Two bound families, both CERTAIN, never estimated:
//   - TEMPERATURE has an ABSOLUTE FLOOR. Below 0 K is not a rare temperature, it is no temperature.
//     Checked on the CANONICAL (kelvin) value, so "-300 °C" is caught while "-273.15 °C" — exactly
//     0 K, a true statement about absolute zero — is not. Strictly `< 0`: stating "0 K" is legit.
//   - COUNT / EXTENT / DURATION dimensions (mass, amount, volume, length, time) cannot be NEGATIVE:
//     there is no -5 g of a salt, no -2 mol of a product, no -3 min of reaction. Checked on the raw
//     value's sign (every conversion in these dimensions is a positive scale, so sign is preserved).
//
// WHAT IS DELIBERATELY LEFT UNBOUNDED, because a negative there is legitimate, not impossible:
// energy / molar-energy / specific-energy (ΔH, ΔG are routinely negative — an exothermic reaction),
// voltage (a cell potential E° is signed), ratio/percent (a percent CHANGE is signed and a
// percentage can exceed 100), and pressure (a gauge reading can sit below ambient). Flagging any of
// these is the alarm-fatigue trap the CONTROL gate paid for once: a detector that fires on a correct
// ΔH gets muted, and a muted detector protects nobody. pH and a dimensionless equilibrium constant K
// are the other two chemistry ranges worth checking, but neither is a UNIT the shared table extracts
// (pH is prefix-notation "pH 7", K is bare) — that needs a prefix-quantity recognizer in `units.mjs`
// and is filed for later, not smuggled in as a guess here.
//
// THE SIGNED-QUANTITY / DELTA GUARD. Even a bounded dimension carries a legitimate negative when the
// claim is about a CHANGE: "ΔT = -15 K", "Δn = -1 mol". So a claim whose text carries a delta marker
// (Δ / ∆ / change / difference / increase / decrease / net) is SKIPPED WHOLE — precision-first,
// exactly as the consistency scan drops an ambiguous subject rather than guess. Accepted recall
// cost: an impossible ABSOLUTE value buried in a delta-laden claim is not caught here; it is caught
// by the decoupled reviewer. A queue dies of false positives, not of misses.
//
// PURE and DETERMINISTIC, like everything in this file. O(claims · quantities-per-claim).

/** Temperature's floor is absolute zero; these dimensions are simply non-negative magnitudes. */
const NONNEGATIVE_DIMS = new Set(["mass", "amount", "volume", "length", "time"]);

/**
 * A claim about a CHANGE carries a legitimate negative. The marker set is deliberately broad —
 * over-suppression only costs recall (backstopped by the decoupled reviewer), whereas a false flag
 * on a correct ΔH is the alarm-fatigue failure this module refuses. Δ (U+0394) and ∆ (U+2206) both.
 */
const DELTA_RE = /Δ|∆|\bdelta\b|\bchang(?:e[ds]?|ing)\b|\bdifference\b|\bincreases?\b|\bdecreases?\b|\bnet\b/i;

/** Human-readable name of the breach, for the instructor reading the queue. */
function rangeBreach(dim, canonical, value) {
  if (dim === "temperature") return `${canonical} K is below absolute zero (0 K) — no such temperature exists`;
  return `a negative ${dim} (${value}) is physically impossible`;
}

/**
 * range audit (M6b): a single claim asserting a physically-impossible quantity — a value wrong on
 * its OWN terms, independent of whether any other artifact agrees with it. See the section header
 * for the two bound families, the deliberately-unbounded dimensions, and the delta guard.
 *
 * PURE and DETERMINISTIC. Reuses this module's quantity substrate; derives nothing new.
 *
 * @param {{claims:Array<object>}|Array<object>} claims CLAIMS (`metadata/CLAIMS.json`) or a bare
 *   claim array. Reads the required `text` field; a claim with no readable text is skipped in
 *   silence (a detector that invents the words it failed to read is worse than a quiet one).
 * @returns {Array<{kind:"implausible-quantity", claimIds:string[], evidence:string[]}>} findings,
 *   one per offending claim, sorted by claim id — stable across runs. `kind` is a DETECTOR kind;
 *   M10 folds it to a queue kind (see `lib/escalation.mjs` DETECTOR_TO_QUEUE). One claim ⇒ one
 *   finding even when it carries several impossible values; the headline names the first breach.
 */
export function rangeAudit(claims) {
  const findings = [];
  for (const claim of comparableClaims(claimList(claims))) {
    const text = claimText(claim);
    if (DELTA_RE.test(text)) continue; // a change is legitimately signed — skip the whole claim
    const breaches = [];
    // the one value parser (R2-K08); recognized-but-ambiguous ("90 degrees") is no value ⇒ silence, never a guess
    for (const { entry, value, raw } of scanValues(text)) {
      const canonical = Number(entry.to(value).toPrecision(9)); // toPrecision folds float noise, not digits
      const impossible =
        entry.dim === "temperature" ? canonical < 0 : NONNEGATIVE_DIMS.has(entry.dim) && value < 0;
      if (impossible) breaches.push({ raw, dim: entry.dim, canonical, value });
    }
    if (breaches.length === 0) continue;
    const b = breaches[0];
    findings.push({
      kind: "implausible-quantity",
      claimIds: [String(claim.id)],
      evidence: [
        `${claimFile(claim)}: "${b.raw}" — ${rangeBreach(b.dim, b.canonical, b.value)}`,
        `${claim.id} (${claim.type}) at ${claimFile(claim)}: "${snippet(text)}"`,
      ],
      _sort: String(claim.id),
    });
  }
  return findings
    .sort((a, b) => byString(a._sort, b._sort))
    .map(({ kind, claimIds, evidence }) => ({ kind, claimIds, evidence }));
}
