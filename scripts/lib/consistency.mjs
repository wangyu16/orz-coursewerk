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

import { resolve } from "./terms.mjs";
import { dimensionProjection } from "./units.mjs";

/**
 * Claim types whose numbers are ASSERTIONS ABOUT THE TERM, and so can contradict each other.
 * See non-flag (5): `derived`/`procedure` carry example arithmetic, `objective` carries no value.
 */
const ASSERTIVE_TYPES = new Set(["fact", "answer-key", "definition"]);

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

/**
 * One regex for every unit form, LONGEST FIRST so "kJ/mol" wins over "kJ" and "min" over "m".
 * The trailing lookahead stops "g" from matching inside "gravity" (and "J" inside "J/g").
 * Built by `lib/units.mjs` so that M2's recognizer and this scan cannot disagree about what a
 * unit looks like — a form M2 does not see is a claim that never reaches this scan.
 */
const QUANTITY_RE = UNIT_VIEW.quantityRe();

/** Look a matched unit form up: symbols exactly (case-sensitive), words case-insensitively. */
const unitEntry = (form) => UNIT_VIEW.lookup(form);

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
const labelRes = new Map();
function labelRe(label) {
  let re = labelRes.get(label);
  if (!re) {
    re = new RegExp(`(?<![A-Za-z0-9])${escapeRe(label)}(?![A-Za-z0-9])`, "i");
    labelRes.set(label, re);
  }
  return re;
}

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
  QUANTITY_RE.lastIndex = 0;
  let m;
  while ((m = QUANTITY_RE.exec(text))) {
    const entry = unitEntry(m[2]);
    if (!entry) continue; // recognized-but-ambiguous (e.g. bare "degrees") ⇒ silence
    const key = valueKey(entry.to(Number(m[1])));
    const prior = byDim.get(entry.dim);
    if (!prior) byDim.set(entry.dim, { key, raw: m[0].trim() });
    else if (prior.key !== key) dropped.add(entry.dim);
  }
  for (const dim of dropped) byDim.delete(dim);
  return byDim;
}

/** Claims worth comparing: active, assertive, readable. */
function comparableClaims(list) {
  return list.filter(
    (c) =>
      c &&
      ASSERTIVE_TYPES.has(c.type) &&
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
  for (const claim of comparableClaims(list)) {
    const scope = claimScope(claim);
    const termId = subjectTerm(claim, terms, scope);
    if (!termId) continue;
    for (const [dim, q] of quantitiesByDimension(claimText(claim))) {
      const key = `${termId}|${dim}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ claim, ...q });
    }
  }

  const findings = [];
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
    t = t.replace(new RegExp(`(?<![A-Za-z0-9])${escapeRe(label)}(?![A-Za-z0-9])`, "gi"), ` ${id} `);
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
