// Escalation queue — where DETECTION becomes RECOVERY.
//
// The whole design refuses a promise it cannot keep. Nothing here is an error-free
// oracle: fingerprints do not know chemistry, the consistency scan does not know which
// of two numbers is right, and the classifier adjudicates nothing. The goal is narrower
// and honest — reliably SURFACE suspect claims, with their evidence, to the one authority
// that owns the truth: the instructor. Detection that never reaches a human is not
// recovery; it is a log file. This module is the last step of that path, so the queue it
// emits IS the mechanism's product. Everything upstream is machinery in service of these
// items being read and acted on.
//
// THE COUNTERWEIGHT, WHICH IS EQUALLY THE POINT: ALARM FATIGUE
//
// The #1 risk to this design is not a missed flag — it is a queue nobody reads. Perfect
// recall with no precision is worthless: an instructor buried in flags stops opening the
// file, and then the mechanism protects nobody, including on the flag that mattered. The
// old byte-hash signal already proved this (S-C pilot: 1 edit -> 6 required reviews).
// So reviewer burden is MEASURED, NOT ASSUMED. The `burden` block is a first-class output
// — the alarm-fatigue meter, reported as a study metric wave over wave — not bookkeeping.
// Three levers here keep the number honest rather than merely small: dedupe (one human
// decision = one item), batching (many candidate terms = a few proposals), and ordering
// (the instructor reads top-down, so the ordering IS the triage).
//
// PURE and DETERMINISTIC by contract (interfaces §6.1): no I/O, no network, no LLM, no
// clock, no randomness. A flag a human acted on must be reproducible from the inputs
// alone, months later, from git. The queue is a canonical function of the finding SET:
// items sort by their own content, not by input position, so two detectors running in a
// different order cannot produce a different queue.
//
// -- EVIDENCE IS PROSE, NOT A DATA DUMP ------------------------------------------------
// `evidence` is written for a human who will not open the code, and who may be three
// semesters late to the conversation: "study-guide/ch3.md asserts 100 °C; practice/ch3.md
// answer key asserts 90 °C". Detector-supplied evidence is passed through verbatim (it has
// the domain detail), and this module appends the WHERE — the files and anchors the claim
// lives at, resolved from CLAIMS — because a flag you cannot locate is a flag you cannot
// act on.
//
// -- TWO VOCABULARIES, DIFFERENT ON PURPOSE (do not unify these enums) ------------------
// A DETECTOR kind names WHAT WAS OBSERVED (`value-disagreement`, `definition-drift`); a
// QUEUE kind names WHAT THE HUMAN IS ASKED (`internal-inconsistency`). THE QUEUE KIND IS
// THE ONE IN THE DEDUPE KEY, and that is load-bearing: if M6 observes a `value-disagreement`
// and the M11 gate observes a `cross-artifact-mismatch` over the same claims, the human has
// ONE adjudication to make — keying on detector kinds would emit two items for one decision,
// the exact alarm fatigue this module exists to prevent. A future reader with a tidy mind
// will want to collapse the two enums into one; that would silently kill the merge.
// The fold must not DESTROY the observation either (interfaces §5c), so every item carries
// `detectorKinds[]` — sorted, unioned on merge, NOT in the dedupe key — which is also what
// lets S-F report detection recall PER LAYER (otherwise uncomputable).
//
// -- DEDUPE: WHAT MERGES, AND WHAT DELIBERATELY DOES NOT --------------------------------
// Decided: MERGE on (queue kind + the full set of claims named). Double-queueing one human
// decision is itself alarm fatigue, and detectors overlap by design — the consistency scan
// (M6) and the gate (M11) can both reach one claim, and the same value disagreement is one
// question however many detectors noticed it. Merged items union their evidence (deduped,
// input order preserved) and their `detectorKinds`, and take the MOST SEVERE severity of
// the group: a finding is never quieted by being merged with a calmer twin.
// Deliberately NOT merged, because each is a DISTINCT decision the instructor must make:
//   * same claims, different QUEUE kind — "is this fact wrong?" and "what concept does this
//     belong under?" are two questions with two answers; collapsing them loses one.
//   * same kind, different claims — two disagreements are two facts to fix.
//   * findings naming no claim — nothing identifies them as the same decision, so merging
//     them would be a guess. Uncertainty fails toward the human, never toward silence.
// A multi-claim finding (M6 reports `claimIds`) is ONE item, not one per claim: the
// disagreement between A and B is a single adjudication. Every participant is carried in
// the item's `claimIds` — sorted, machine-indexable — AND named in the evidence prose,
// which is what the instructor actually reads.
//
// -- BATCHING TERM PROPOSALS (spec §10 decision 3) --------------------------------------
// An off-map candidate term is not a yes/no question — the instructor is asked WHERE it
// belongs, so `proposal` carries a PROPOSED CONCEPT-MAP PLACEMENT. And the map is revised
// at review gates, in one conversation, not term by term: "9 supporting terms; 7 under
// existing concepts, 2 possibly new sub-concepts — approve/re-place/reject?" One
// interruption per term would make routine vocabulary growth the loudest thing in the
// queue, which is precisely how a queue dies.
// BATCHING RULE: group candidates by (scope, proposed parent). Terms proposed under the
// same existing concept are one item; terms with NO proposed parent group per scope into a
// separate item, because they are a different question (they may need a new sub-concept —
// a spine change, which must go through the spine's own gate, not in through the registry
// side door). Groups sort by key; terms within a group sort by label.
//
// -- ORDERING (the ordering IS the triage) ----------------------------------------------
// blocking -> review -> info; then kind, in the schema's own enum order (which runs
// roughly most- to least-consequential); then `claimIds[0]` — the primary handle — then
// the remaining ids, then evidence text, then proposal. Every tiebreak is content-derived,
// so the sort is total and stable without an input index. Top-down reading order is thus:
// things that hurt a student first, vocabulary housekeeping last.
//
// CONTRACT NOTES (both resolved at the source; kept as the rationale for the shape, because
// the shape is not obvious and a tidy-minded reader would undo it):
//  1. `claimId` -> `claimIds`. One optional singular id could not express M6's `claimIds`
//     (a value disagreement is inherently BETWEEN 2+ claims), so the other participants
//     would have survived only as prose — a "show me every flag touching claim X" query
//     would miss them. REPLACED, not supplemented: two ways to say one thing drift.
//  2. `detectorKinds` added. The queue enum has no `value-disagreement`, so folding M6's
//     finer kind into `internal-inconsistency` would have destroyed the observation.
// Both are the same defect: structured information trapped in — or crushed by — a field
// that cannot hold it. The cheap standing check when freezing a contract: FOR EACH FIELD,
// DOES ANY PRODUCER'S SIGNATURE CARRY MORE STRUCTURE THAN THE FIELD CAN HOLD? It is
// mechanical, needs no downstream consumer to exist yet, and catches this at freeze time.

/**
 * The artifact this module's output is written to (interfaces §3 — M10 OWNS THE PATH).
 *
 * Import it; never respell it (§5d). It exists because it did not: `buildQueue` returned the queue
 * and NOTHING wrote it, so the path lived only in a schema title and in doc prose — and M14, needing
 * it in `lib/coherence.mjs`'s EXCLUDE, had no constant to import and had to spell it literally,
 * creating a second authority to work around a missing one. The producer is `check_oer.mjs`'s
 * semantic audit (M11), which runs the detectors and calls `buildQueue`; `EXCLUDE` now imports this.
 */
export const REVIEW_QUEUE_PATH = "metadata/REVIEW_QUEUE.json";

/**
 * Frozen enum order (schema `kind`) — doubles as the intra-severity triage order.
 *
 * The last two were ADDED 2026-07-17 with the M11 gate, and are APPENDED rather than slotted in by
 * consequence: this list must stay in the schema's own enum order (that is what makes it checkable
 * against the frozen artifact), and the position only breaks ties WITHIN a severity — a `review`
 * dangling reference still sorts above an `info` term proposal, because severity is the primary key.
 */
const KIND_ORDER = [
  "suspected-error",
  "source-conflict",
  "internal-inconsistency",
  "sanity-check",
  "orphan-claim",
  "misconception-asserted",
  "term-proposal",
  "derived-diff",
  "upstream-drift",
  "dangling-reference",
  "declaration-refused",
  // APPENDED 2026-07-17 with the CONTROL checks, and appended for the same reason the two above
  // were: this list must stay in the schema's own enum order, which is what makes it checkable
  // against the frozen artifact. Position only breaks ties WITHIN a severity, and severity is the
  // primary key. THE COST IS REAL AND IS ACCEPTED: `missing-coverage` therefore sorts LAST among
  // `review` items — below "your bracket has a typo" — which is worse triage than it deserves.
  // Re-slotting it by consequence would silently renumber a FROZEN enum every stored queue was
  // written against; that trade is the schema's to make, not this table's.
  "missing-coverage",
  // APPENDED 2026-09-05 (G15h): the stored semantic index no longer describes the package — a
  // committed-but-stale CLAIMS/SPINE/TERMS. Not `sanity-check` (that is about a CLAIM's value; this
  // is about the INDEX the whole revision layer reads its "before" from) and not `derived-diff` (no
  // claim moved — that is exactly why it is silent). One human decision: re-index and re-attest.
  "stale-index",
];
const KIND_SET = new Set(KIND_ORDER);

const SEVERITY_ORDER = ["blocking", "review", "info"];

/**
 * Default severity per QUEUE kind. Overridden by an explicit `finding.severity`.
 * blocking = a student meets a falsehood or a contradiction; review = a human must decide
 * but nothing is provably wrong yet; info = housekeeping.
 */
const DEFAULT_SEVERITY = {
  "suspected-error": "blocking",
  "internal-inconsistency": "blocking",
  "misconception-asserted": "blocking",
  "source-conflict": "review",
  "upstream-drift": "review",
  "derived-diff": "review",
  "orphan-claim": "review",
  "sanity-check": "review",
  // A dangling reference and a refused declaration are `review`, not `blocking`, and the rule above
  // is why: no student meets a falsehood: the prose a student reads is untouched, and in both cases
  // the package is UNDER-indexed rather than wrong. What broke is the author's assertion ABOUT the
  // prose — a link to nothing, a declaration that could not be read — so a human must decide what
  // was meant. Calling them blocking would put "your bracket has a typo" beside "the answer key
  // contradicts the study guide", and a severity that cannot separate those two teaches an
  // instructor to ignore the loudest one.
  "dangling-reference": "review",
  "declaration-refused": "review",
  // `review`, not `blocking`, by the same rule: no student meets a falsehood. The prose a student
  // reads is not wrong — it is ABSENT, and what broke is the promise the instructor's own map makes.
  // Nor is the absence provable: the check cannot see an objective taught in prose that names no
  // registered term, which is exactly "a human must decide but nothing is provably wrong yet".
  "missing-coverage": "review",
  "term-proposal": "info",
  // `review`: no student meets a falsehood — the prose is untouched — but every revision verdict
  // the gate can give is computed against a "before" that is not the package's, so a human must
  // re-baseline before any of them can be trusted.
  "stale-index": "review",
};

/**
 * DETECTOR kind -> QUEUE kind. FROZEN in interfaces §3; M10 owns this table and detectors
 * never speak queue kinds. Extend it when a detector is added — that edit is the moment
 * someone must consciously decide WHICH QUESTION the new observation asks a human, which
 * is exactly the decision a permissive default would let them skip.
 */
const DETECTOR_TO_QUEUE = {
  "value-disagreement": "internal-inconsistency",
  "definition-drift": "internal-inconsistency",
  "cross-artifact-mismatch": "internal-inconsistency",
  // M6b's RANGE audit. A physically-impossible value (a temperature below absolute zero, a negative
  // mass) is a SUSPECTED ERROR adjudicated by a person, not a machine-propagated fix — the same
  // decision `revision-escalate` asks, so it folds to the same queue kind (`suspected-error`,
  // blocking). It is NOT `internal-inconsistency`: nothing here DISAGREES; one number is wrong on
  // its own terms, and the queue kind is the dedupe key, so misnaming it would merge "this value is
  // impossible" with "these two artifacts contradict each other" — two questions, two decisions. The
  // detector kind `implausible-quantity` survives in `detectorKinds`, so a study can still count the
  // range layer's contribution separately from the disagreement layer's.
  "implausible-quantity": "suspected-error",
  // TRUST 3c's unverifiable-quotation scan (the publish-gate half of the immutable promise). A span
  // the package dresses in quote marks but that appears in NO pinned source folds to `source-conflict`
  // — the question is exactly "the package's text cannot be reconciled to the source", which is what
  // that queue kind names, and its default severity is `review`: nothing is provably a falsehood (the
  // quote may simply come from a source that was not pinned), so a human decides. It is NOT
  // `internal-inconsistency` (nothing here DISAGREES across artifacts) and NOT `suspected-error`
  // (a range value is impossible on its own terms; a quotation is merely unverifiable). `blocking` is
  // reserved for a quote provably attributed to a pinned automatic source — not yet emitted. The
  // detector kind `unverifiable-quotation` survives in `detectorKinds`, so a study can count this
  // layer's contribution (S-CONF-fi) separately.
  "unverifiable-quotation": "source-conflict",
  // The M11 gate's §5b rows. THREE detector kinds fold to `dangling-reference` because they are one
  // QUESTION — "this reference points at nothing; fix it or remove it" — asked about three different
  // reference species (a declared anchor, a spineRef, a `derivedFrom`). The fold is deliberate and
  // the observation survives in `detectorKinds`, which is what lets a study report recall per layer.
  // They did NOT fold into `internal-inconsistency`: "these two artifacts disagree" is a different
  // question with a different next action, and since the queue kind is the dedupe key, misnaming
  // them would also have silently MERGED a typo'd bracket with a real contradiction.
  "dangling-anchor": "dangling-reference",
  "dangling-spine-ref": "dangling-reference",
  "dangling-derived-from": "dangling-reference",
  "declaration-refusal": "declaration-refused",
  // G22g/G22d: an anchored list that is not FULLY anchored (or repeats a slug), and a declaration
  // whose prose no longer supports its declared type/termRefs. Both are "your assertion about the
  // prose does not hold" — the question `declaration-refused` already asks a human.
  "anchor-coverage": "declaration-refused",
  "duplicate-section": "declaration-refused",
  "dangling-override": "dangling-reference",
  // H6: a spine label moved under an unchanged id — the package's declared structure no longer
  // says what the instructor's map says. Blocking by the finding's own severity.
  "spine-relabeled": "sanity-check",
  "spine-cycle": "sanity-check",
  "term-conflict": "declaration-refused",
  "declaration-unsupported": "declaration-refused",

  // The M11 gate's CONTROL rows (§C2) — the two directions of "the instructor decides what is
  // taught", which is the claim the whole product makes and the one nothing verified.
  //   spine-uncovered -> `missing-coverage`, a NEW queue kind, and the alternatives were weighed:
  //     * NOT `dangling-reference`. "You said teach this and nothing does" is not "this reference
  //       points at nothing" — opposite directions, opposite fixes, and the queue kind is the dedupe
  //       key, so misnaming it would fold the CONTROL failure in with a typo'd bracket.
  //     * NOT `sanity-check`, which fits loosely enough to be tempting and is the wrong call twice
  //       over. The queue kind is the vocabulary an instructor TRIAGES on: burying "your course
  //       promises something it does not teach" beside "confirm this split is what you meant" makes
  //       the one check that verifies CONTROL unfilterable — and this enum's own schema says a gate
  //       that must misname its finding to fit an enum is an enum that is wrong.
  //   claim-without-parent -> `orphan-claim`, which needed no new member: the enum has had exactly
  //     the right name since the beginning and NOTHING EVER PRODUCED ONE (the sixth no-producer
  //     defect). The detector kind names the OBSERVATION ("this declared claim has no parent") and
  //     the queue kind names the DECISION ("what concept does this belong under?") — the two-
  //     vocabulary rule this table exists for, rather than a detector speaking a queue kind.
  "spine-uncovered": "missing-coverage",
  // The freshness audit (semantic_index.mjs `auditIndexFreshness`, G15h): the committed index
  // does not describe the package. Its own queue kind, because the next action — re-index and
  // re-attest — is neither "decide a value" nor "review a derived diff".
  "stale-semantic-index": "stale-index",
  "claim-without-parent": "orphan-claim",

  // The M11 gate's REVISION rows (fresh compute vs stored index) — the detector that reports M4's
  // verb for a claim whose fingerprints moved. The detector kind names the VERB because the verb IS
  // the observation; the queue kind names the DECISION, and several verbs legitimately ask one.
  //   revision-escalate  -> a `content` move with NO authorization on record. spec §5/§10 dec. 2
  //     name this exactly: a SUSPECTED ERROR, adjudicated by a person rather than propagated on the
  //     machine's authority. The enum member already had the right name.
  //   revision-re-derive / revision-rename / revision-regenerate -> `derived-diff`. All three end in
  //     ONE question — "here is the rewrite this change implies; sign it off" — differing only in
  //     blast radius. They are NOT `suspected-error`: each is a change the human already authorized
  //     or performed (an override, a map rename, a depth change), and asking "is this wrong?" about a
  //     decision the instructor just made is the re-nag §10 dec. 2 forbids.
  //   revision-recheck -> `sanity-check`: a structural/spine move obliges verifying coverage,
  //     orphans and prereq order. Nothing is provably wrong — that is the definition of `review`.
  //   revision-annotate -> `sanity-check`: confirm the deprecate-but-teach annotation. Never
  //     `derived-diff`, which would propose REPLACING the old idea that was kept ON PURPOSE.
  //   revision-silent-risk -> `upstream-drift`, and this fold is the load-bearing one. A change
  //     reached a claim whose own fingerprints did NOT move: its upstream drifted out from under it.
  //     Folding it into the seed's `suspected-error` would have been the costly mistake — the queue
  //     kind is the dedupe key, so it would MERGE "is the edited fact wrong?" with "does the answer
  //     key that quietly contradicts it still hold?", and silently answer the second by answering
  //     the first. Two claims, two decisions, two items.
  // REGENERATE and ANNOTATE are mapped but are currently UNREACHABLE from a package edit: both are
  // driven by caller-supplied `ctx` (`spineChange:"depth"`, `pedagogy`), which no package byte
  // produces. Mapped anyway because M4's enum is closed and `queueKindOf` THROWS — an unmapped verb
  // would take down the whole queue, blocking items included, which is fail-toward-silence at the
  // worst possible moment. A total table over a closed enum cannot do that.
  "revision-escalate": "suspected-error",
  "revision-re-derive": "derived-diff",
  "revision-rename": "derived-diff",
  "revision-regenerate": "derived-diff",
  "revision-recheck": "sanity-check",
  "revision-annotate": "sanity-check",
  "revision-silent-risk": "upstream-drift",
  // §4's split/merge rows. A `sanity-check` because the question is "is this division what you
  // meant, and does coverage survive it?" — the participants separately carry their own verbs.
  "claim-split": "sanity-check",
  "claim-merged": "sanity-check",
};

/**
 * Internal key delimiter. A visible character on purpose: an earlier revision used NUL,
 * which made this a BINARY file to grep and diff — invisible in an editor, and it silently
 * defeated every code-review tool that would otherwise read this module. `|` cannot appear
 * in a claim id (`^claim\.`) or in any frozen kind, so it is still unambiguous.
 */
const KEY_SEP = "|";

function isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function asArray(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Accept CLAIMS ({schemaVersion, claims:[…]}) or a bare claims array. Tolerate junk. */
function claimList(claims) {
  const raw = Array.isArray(claims) ? claims : isObj(claims) ? claims.claims : null;
  return asArray(raw).filter(isObj);
}

/**
 * Resolve a finding's kind (either dialect) onto the frozen QUEUE enum — tolerant in,
 * strict out. A queue kind passes through; a detector kind is mapped through the table.
 *
 * An unmapped or missing kind THROWS, deliberately. It cannot be anything but a contract
 * break — the producers are a closed set of in-repo detectors whose kinds are fixed at
 * build time — so it is caught by tests, at build time, by the person introducing it.
 * Bucketing it into a generic `sanity-check` would ask the instructor a question nobody
 * chose, on evidence nobody mapped, and would hide the break behind a plausible-looking
 * item: the same defect as trapping structure in prose, wearing a badge.
 *
 * BOUNDARY CONDITION, stated because it is the thing that would make this wrong: a throw is
 * right only BECAUSE the producer set is closed. If findings ever become data-driven (a
 * package, config, or plugin supplying kinds), one bad kind would take down the whole queue
 * — including its blocking items — which is fail-toward-silence at the worst possible
 * moment. The fix then is to validate at the producer boundary, NOT to soften this.
 */
function queueKindOf(kind) {
  if (typeof kind === "string") {
    if (KIND_SET.has(kind)) return kind;
    if (Object.hasOwn(DETECTOR_TO_QUEUE, kind)) return DETECTOR_TO_QUEUE[kind];
  }
  const known = [...new Set([...Object.keys(DETECTOR_TO_QUEUE), ...KIND_ORDER])].sort().join(", ");
  throw new Error(
    `escalation: unmapped finding kind ${JSON.stringify(kind)}. A finding must speak a queue kind, ` +
      `or a detector kind in M10's mapping table (interfaces §3). Known: ${known}. ` +
      `If a detector was added, extend DETECTOR_TO_QUEUE — deciding which question its observation ` +
      `asks the instructor is the point, not a formality.`,
  );
}

/**
 * The kind AS THE DETECTOR SAID IT — the observation, preserved through the fold to the
 * queue kind. When a finding speaks a queue kind directly, that kind is its own
 * detectorKind: the field is minItems 1 and must never be empty, and "the detector said
 * internal-inconsistency" is the honest answer, not a missing one.
 */
function detectorKindOf(finding) {
  return finding.kind;
}

/** Sorted + deduped union — the merge rule for detectorKinds. */
function unionKinds(...groups) {
  return [...new Set(groups.flat())].sort();
}

function normalizeSeverity(severity, kind) {
  if (SEVERITY_ORDER.includes(severity)) return severity;
  return DEFAULT_SEVERITY[kind] ?? "review";
}

/** Most severe of two severities wins (merging never quiets a finding). */
function worstSeverity(a, b) {
  return SEVERITY_ORDER.indexOf(a) <= SEVERITY_ORDER.indexOf(b) ? a : b;
}

/**
 * All claim ids a finding names, deduped and sorted. Sorting gives the SET an
 * order-independent identity (so two detectors listing the same pair in opposite orders
 * merge), and makes `claimIds[0]` a stable primary handle for display and ordering.
 * A singular `claimId` is still accepted on INPUT — detectors may speak either dialect —
 * but the emitted item always carries the array.
 */
function claimIdsOf(finding) {
  const ids = [...asArray(finding.claimIds), finding.claimId]
    .filter((id) => typeof id === "string" && id.length > 0);
  return [...new Set(ids)].sort();
}

/** "study-guide/ch3.md#melting-point" — a place a human can open. */
function locationLabels(claim) {
  return asArray(claim.locations)
    .filter(isObj)
    .filter((loc) => typeof loc.file === "string" && loc.file.length > 0)
    .map((loc) => (typeof loc.anchor === "string" && loc.anchor.length > 0 ? `${loc.file}#${loc.anchor}` : loc.file));
}

/** Index claims by id once; used to turn ids into prose an instructor can act on. */
function indexClaims(list) {
  const byId = new Map();
  for (const claim of list) if (typeof claim.id === "string") byId.set(claim.id, claim);
  return byId;
}

/** "claim.x.ab12 (fact) appears in study-guide/ch3.md#mp" — the WHERE line. */
function whereLine(id, byId) {
  const claim = byId.get(id);
  if (!claim) return `${id} — no claim with this id is in CLAIMS.json (the flag names a claim the index does not have).`;
  const where = locationLabels(claim);
  const type = typeof claim.type === "string" ? ` (${claim.type})` : "";
  if (where.length === 0) return `${id}${type} — no location recorded in CLAIMS.json.`;
  return `${id}${type} appears in ${where.join(", ")}.`;
}

/** Detector prose first (it has the domain detail), then the WHERE lines this module adds. */
function buildEvidence(finding, ids, byId) {
  const out = [];
  for (const line of asArray(finding.evidence)) {
    if (typeof line === "string" && line.trim().length > 0) out.push(line);
  }
  for (const line of [finding.reason, finding.message].filter((l) => typeof l === "string" && l.trim())) {
    out.push(line);
  }
  for (const id of ids) out.push(whereLine(id, byId));
  if (out.length === 0) out.push("Flagged by a detector that supplied no evidence — inspect the claim before acting.");
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------------------
// Term proposals (batched)
// ---------------------------------------------------------------------------------------

function scopeKeyOf(finding) {
  const scope = asArray(finding.scope).filter((s) => typeof s === "string");
  if (scope.length > 0) return [...new Set(scope)].sort().join("+");
  return "package-wide";
}

function placementOf(finding) {
  for (const v of [finding.suggestedPlacement, finding.proposedPlacement, finding.placement, finding.spineRef]) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

function labelOf(finding) {
  for (const v of [finding.label, finding.preferredLabel, finding.term, finding.termId]) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "(unnamed candidate term)";
}

/** Files where any claim references this term — the "it is already being used here" line. */
function termUsage(finding, claimsArr) {
  const termId = typeof finding.termId === "string" ? finding.termId : null;
  if (!termId) return [];
  const files = new Set();
  for (const claim of claimsArr) {
    if (asArray(claim.termRefs).includes(termId)) for (const l of locationLabels(claim)) files.add(l);
  }
  return [...files].sort();
}

/**
 * Batch candidate terms into a small number of PLACEMENT proposals.
 * Key = (scope, proposed parent). No-parent candidates group separately per scope: they
 * are a different question (possibly a new sub-concept = a spine change).
 */
function buildTermProposals(findings, claimsArr) {
  const groups = new Map();
  for (const f of findings) {
    const key = `${scopeKeyOf(f)}${KEY_SEP}${placementOf(f)}`;
    if (!groups.has(key)) groups.set(key, { scope: scopeKeyOf(f), placement: placementOf(f), members: [] });
    groups.get(key).members.push(f);
  }

  const items = [];
  for (const key of [...groups.keys()].sort()) {
    const { scope, placement, members } = groups.get(key);
    const sorted = [...members].sort((a, b) => cmpStr(labelOf(a), labelOf(b)));
    const labels = [...new Set(sorted.map(labelOf))];
    const quoted = labels.map((l) => `"${l}"`).join(", ");
    const n = labels.length;
    const noun = n === 1 ? "term" : "terms";

    const proposal = placement
      ? `Place ${n} candidate ${noun} under ${placement} (scope: ${scope}): ${quoted}. Approve, re-place, or reject — this asks WHERE each belongs, not whether to keep it. Approving revises the concept map; TERMS.json is then regenerated from the map.`
      : `${n} candidate ${noun} in scope ${scope} have no proposed parent concept: ${quoted}. Place each under an existing concept, or approve a NEW sub-concept for it (a new concept is a spine change and goes through the spine's own gate). Rejecting flags the term and every claim using it as scope creep or error.`;

    const evidence = [
      placement
        ? `${n} off-map ${noun} were auto-registered as candidates while writing, and are proposed under the existing concept ${placement}.`
        : `${n} off-map ${noun} were auto-registered as candidates while writing, and no existing concept was identified as their parent.`,
    ];
    for (const f of sorted) {
      const usage = termUsage(f, claimsArr);
      const supplied = asArray(f.evidence).filter((l) => typeof l === "string" && l.trim());
      for (const line of supplied) evidence.push(line);
      evidence.push(
        usage.length > 0
          ? `"${labelOf(f)}" is already used in ${usage.join(", ")}.`
          : `"${labelOf(f)}" is not yet linked to any indexed claim.`,
      );
    }

    items.push({
      kind: "term-proposal",
      // L2 (round-3 audit): the WORST member's severity, never the first's — merging never quiets.
      severity: normalizeSeverity(
        members.map((f) => f.severity).filter((s) => SEVERITY_ORDER.includes(s)).sort((a, b) => SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b))[0],
        "term-proposal",
      ),
      evidence: [...new Set(evidence)],
      // Every batched finding's observation, unioned — a batch is a fold too.
      detectorKinds: unionKinds(members.map(detectorKindOf)),
      proposal,
    });
  }
  return items;
}

// ---------------------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------------------

function cmpStr(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function cmpItems(a, b) {
  const s = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
  if (s !== 0) return s;
  const k = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  if (k !== 0) return k;
  // claimIds[0] is the primary handle; the rest break ties beneath it.
  const c = cmpStr((a.claimIds ?? []).join(" "), (b.claimIds ?? []).join(" "));
  if (c !== 0) return c;
  const e = cmpStr(a.evidence.join("\n"), b.evidence.join("\n"));
  if (e !== 0) return e;
  return cmpStr(a.proposal ?? "", b.proposal ?? "");
}

// ---------------------------------------------------------------------------------------
// The export
// ---------------------------------------------------------------------------------------

/**
 * Build the instructor's review queue — the step where detection becomes recovery.
 *
 * Findings are tolerated in the vocabulary each detector already speaks (M4's ESCALATE,
 * M5's impact, M6's `{kind:"value-disagreement", claimIds, evidence}`, M11's gate flags,
 * M1's candidate terms): each finding's kind is resolved onto the frozen QUEUE enum while
 * the detector's own kind is preserved in `detectorKinds`. Findings that are one human
 * decision are merged, term placements are batched, the result is ordered for top-down
 * triage, and the reviewer burden it just created is measured.
 *
 * Pure and deterministic: same input -> byte-identical output. An absent or empty findings
 * list yields a valid empty queue with an honestly zeroed burden.
 *
 * THROWS on a finding whose kind is neither a queue kind nor in the mapping table — a
 * contract break, surfaced at build time rather than folded into a generic bucket.
 *
 * @param {Array<object>|null|undefined} findings Detector findings. Each carries `kind`
 *   (a queue kind or a mapped detector kind — REQUIRED), and may carry `claimIds` (or a
 *   singular `claimId` — both dialects accepted), `severity`, `evidence` (string |
 *   string[]), and for term proposals `label`/`termId`, `scope`, `suggestedPlacement`.
 * @param {{claims: Array<object>}|Array<object>|null|undefined} claims CLAIMS.json (or a
 *   bare claims array) — supplies the locations that make evidence actionable and the
 *   artifact denominator for `burden`.
 * @returns {{schemaVersion: 1, items: Array<{kind: string, claimIds?: string[], detectorKinds: string[], severity: string, evidence: string[], proposal?: string}>, burden: {flagCount: number, artifactCount: number, flagsPerArtifact: number}}}
 *   A REVIEW_QUEUE object validating against `review_queue.schema.json`.
 * @throws {Error} on an unmapped or missing finding kind.
 */
export function buildQueue(findings, claims) {
  const claimsArr = claimList(claims);
  const byId = indexClaims(claimsArr);
  const raw = asArray(findings).filter(isObj);

  // Split term proposals out — they batch by placement, not by claim.
  const termFindings = [];
  const other = [];
  for (const f of raw) (queueKindOf(f.kind) === "term-proposal" ? termFindings : other).push(f);

  // Merge: one human decision = one item. Key = QUEUE kind + the item's own sorted
  // `claimIds`. The DETECTOR kind is deliberately NOT in this key — two detectors that
  // observed different things about the same claims still pose ONE question to the human;
  // their observations survive in `detectorKinds`, not by splitting the item in two.
  // Findings naming no claim get a per-finding key (nothing identifies them as the same
  // decision, and guessing would lose information).
  const merged = new Map();
  let anon = 0;
  for (const f of other) {
    const kind = queueKindOf(f.kind);
    const ids = claimIdsOf(f);
    const key = ids.length > 0 ? [kind, ...ids].join(KEY_SEP) : `${kind}${KEY_SEP}#${anon++}`;
    const severity = normalizeSeverity(f.severity, kind);
    const evidence = buildEvidence(f, ids, byId);
    const existing = merged.get(key);
    if (existing) {
      existing.severity = worstSeverity(existing.severity, severity);
      existing.evidence = [...new Set([...existing.evidence, ...evidence])];
      existing.detectorKinds = unionKinds(existing.detectorKinds, [detectorKindOf(f)]);
      continue;
    }
    const item = { kind, severity, evidence, detectorKinds: unionKinds([detectorKindOf(f)]) };
    if (ids.length > 0) item.claimIds = ids; // ALL participants, sorted; [0] is the handle
    merged.set(key, item);
  }

  const items = [...merged.values(), ...buildTermProposals(termFindings, claimsArr)];

  // Canonical field order per item (kind, claimIds?, detectorKinds, severity, evidence,
  // proposal?).
  const ordered = items.sort(cmpItems).map((it) => {
    const out = { kind: it.kind };
    if (it.claimIds !== undefined) out.claimIds = it.claimIds;
    out.detectorKinds = it.detectorKinds;
    out.severity = it.severity;
    out.evidence = it.evidence;
    if (it.proposal !== undefined) out.proposal = it.proposal;
    return out;
  });

  // BURDEN — the alarm-fatigue meter.
  //   flagCount     = items AFTER dedupe/batching: the interruptions a human actually faces,
  //                   not the raw detector count (that would flatter merging into invisibility).
  //   artifactCount = distinct `file` values across EVERY claim's `locations` in CLAIMS —
  //                   the whole reviewable surface of the package, NOT only flagged files.
  //                   The denominator must not shrink when the queue does, or the ratio would
  //                   rise as the package got cleaner. Anchors are ignored: a file is the unit
  //                   an instructor opens.
  //   flagsPerArtifact = flagCount / artifactCount, 0 when there are no artifacts (an empty
  //                   package burdens nobody; no divide-by-zero, no Infinity, no NaN — those
  //                   are not honest numbers to hand a study). Rounded to 4dp for a stable,
  //                   diffable JSON artifact.
  const files = new Set();
  for (const claim of claimsArr) for (const loc of asArray(claim.locations)) {
    if (isObj(loc) && typeof loc.file === "string" && loc.file.length > 0) files.add(loc.file);
  }
  const flagCount = ordered.length;
  const artifactCount = files.size;
  // L3 (round-3 audit) DISMISSED: the frozen queue schema types this ratio as a finite number, and
  // `artifactCount: 0` beside a non-zero `flagCount` is itself the signal that the ratio is undefined.
  const flagsPerArtifact = artifactCount === 0 ? 0 : Math.round((flagCount / artifactCount) * 1e4) / 1e4;

  return { schemaVersion: 1, items: ordered, burden: { flagCount, artifactCount, flagsPerArtifact } };
}
