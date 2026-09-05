// INTEGRATION — the study pairs (spec §7, final row). The manuscript's S-C/S-F apparatus.
//
// Every other test file in this suite defends one module against its own contract. This one
// defends nothing: it MEASURES, end to end, on real bytes, and it is the only test here whose
// output is a number a paper will print.
//
// THAT IS WHY IT IS WRITTEN DIFFERENTLY, and the difference is the whole point:
//
//   * The ground truth is PREREGISTERED in `scripts/study_pairs.mjs` — each case's expected flag
//     set is a literal with a rationale, derived from the INTENT of the edit and spec §5's
//     taxonomy, written before the harness was ever run. This file asserts against those literals.
//   * **FOUR OF TWELVE CASES FAIL THEIR PREREGISTRATION, AND THIS FILE ASSERTS THEM AS FAILING.**
//     It does not "expect" the broken behavior in the sense of blessing it: it pins the mismatch,
//     names the finding, and makes the day somebody FIXES it a loud test failure that says so.
//     The alternative — quietly editing the expectation to match the output — yields a green suite,
//     a recall of 1.0, and a lie. It is indistinguishable from fabrication from the outside and
//     from bug-fixing from the inside, which is exactly what spec §6.9 says about this project's
//     own manuscript: "adjusting a check so our own product scores better in our own paper".
//     An honest 0.818 recall is a result. A fitted 1.0 is a fraud with a timer on it.
//   * **IT WAS FIVE, AND THE MECHANISM WORKED.** On 2026-07-17 FINDING 1 (the rename) was fixed in
//     interfaces §2 and `lib/terms.mjs`; the pin failed, loudly, and said so. Recall moved 0.545 ->
//     0.818 because the SYSTEM moved: not one `expect` literal in `scripts/study_pairs.mjs` was
//     touched, and the four cases that still fail still fail. That is the whole design of this file
//     — a preregistration you cannot edit is only worth something if it is allowed to be MET.
//   * The two INDEPENDENTLY VERIFIED ANCHORS are asserted FIRST, before any metric. If the harness
//     disagrees with them, the harness is wrong, and every number below it is worthless. They are
//     the calibration, and calibration comes before measurement.
//
// If you are here because a test failed: read FINDINGS at the foot of `scripts/study_pairs.mjs`
// before changing any expectation in either file.
//
// Free, deterministic, no network, no clock, no randomness, no new dependencies. The golden
// fixture is READ-ONLY — the harness copies it to `mkdtemp` per case and removes it.

import test from "node:test";
import assert from "node:assert/strict";
import {
  CASES,
  SKIPPED,
  runCase,
  metrics,
  identityChecks,
  immutableCheck,
  runStudyPairs,
} from "../scripts/study_pairs.mjs";

const byName = (name) => CASES.find((c) => c.name === name);
const run = (name) => runCase(byName(name));
const verdictAt = (result, key) => result.observations.find((o) => o.key === key)?.verdict;

// ==============================================================================================
// 0. THE ANCHORS — verified independently, on real bytes, before this harness existed.
//    They calibrate the apparatus. Nothing below them means anything if they fail.
// ==============================================================================================

test("ANCHOR: a whitespace/reflow null edit moves 0 of 5 fingerprint layers on every claim", () => {
  for (const name of ["null-whitespace", "null-reflow"]) {
    const r = run(name);
    assert.equal(r.claimsInPackage, 4, `${name}: the fixture indexes 4 claims`);
    // Not "no flags" — NO LAYER MOVED AT ALL. The stronger statement, and the one interfaces §5
    // actually makes: "a pure whitespace edit moves NO fingerprint at all". A test that only
    // checked the flag count would pass on a system that moved a layer and then swallowed the verb.
    assert.deepEqual(r.observations, [], `${name}: no claim is even reached, so nothing is classified`);
    assert.equal(r.observedFlags, 0, `${name}: zero flags`);
  }
});

test("ANCHOR: 100 °C -> 0 °C moves exactly ONE claim's content fingerprint, id preserved", () => {
  const [, valueChange] = identityChecks();
  assert.equal(valueChange.name, "value-change-keeps-id");
  assert.equal(valueChange.idPreserved, true, "interfaces §4: a value change keeps the claim id");
  // `format` co-moves and MUST: it is the WORDING layer and the digits are wording. classify.mjs
  // is explicit that format "moves incidentally on nearly every real edit ... so it can never be
  // the report". `content` is the assertion under test.
  assert.deepEqual(valueChange.moved, ["format", "content"]);

  const r = run("real-value-change");
  const contentMoved = r.observations.filter((o) => o.layer === "content");
  assert.equal(contentMoved.length, 1, "exactly one claim's content fingerprint moved");
  assert.equal(contentMoved[0].key, "study-guide/phase-change.md#melting-point-of-water#1|matched");
});

// ==============================================================================================
// 1. NULL-EDIT SUITE — spec §7: target false_flag_rate = 0.
// ==============================================================================================

test("null suite: whitespace, reflow, formatting, rephrase and an orz {{toc}} bump cost zero flags", () => {
  for (const name of ["null-whitespace", "null-reflow", "null-formatting", "null-rephrase", "null-orz-toc"]) {
    const r = run(name);
    assert.equal(r.observedFlags, 0, `${name}: expected 0 flags, got ${r.observedFlags}`);
    assert.equal(r.matchesPreregistration, true, `${name} matches its preregistration`);
  }
});

test("null suite: a meaning-preserving rephrase moves `format` AND ONLY `format` — the design's load-bearing case", () => {
  // The one null edit that is SUPPOSED to move a fingerprint. Zero flags here is the whole chain
  // working (M3 splits the layers, M4 reads format-only as NONE, M5 refuses to seed), not the
  // absence of a signal — so the layer is asserted, not just the flag count. This is also the
  // negative that proves the whitespace anchor is not passing for a trivial reason.
  const [rephrase] = identityChecks();
  assert.equal(rephrase.name, "rephrase-keeps-id");
  assert.deepEqual(rephrase.moved, ["format"], "content must NOT move: the token multiset is identical");
  assert.equal(rephrase.idPreserved, true, "interfaces §4: rephrase -> same id");
  assert.equal(run("null-rephrase").observedFlags, 0);
});

test("FINDING 3 RESOLVED: an orz `:::info` container bump is clean — the preregistration now holds", () => {
  // PREREGISTERED: 0 flags. spec §5's format row lists "orz/template bump" -> NONE, and wrapping a
  // sentence in a callout asserts nothing new.
  // WAS OBSERVED (until 2026-08-11): `:::info` was not markdown, so `stripMarkup` had no rule for it
  // and the bare word "info" landed in the semantic core -> `content` moved -> ESCALATE -> the claim
  // seeded co-mention and dragged two more claims in as silent-risk (3 flags).
  // FIX: `stripMarkup` learned orz containers + `{{...}}` directives (the two constructs check_oer's
  // orzSyntaxAudit recognizes), so a fence is now stripped before hashing and `content` holds.
  // This test asserts the FIX — the finding's own note said this is the failure that means "the
  // preregistration now holds", the same way FINDING 1 (the rename) was retired on 2026-07-17.
  const r = run("null-orz-container");
  assert.equal(r.expectedFlags, 0, "the preregistration is 0 and stays 0");
  assert.equal(r.matchesPreregistration, true, "FINDING 3 resolved: observed == preregistered");
  assert.equal(r.observedFlags, 0, "no false flag on a styling-only edit");
});

test("false_flag_rate is reported with its denominator, and is now ZERO (spec §7 target met)", () => {
  const m = metrics(CASES.map((c) => runCase(c)));
  const ffr = m.false_flag_rate;
  assert.equal(ffr.falseFlags, 0, "all six null cases are clean after FINDING 3 was fixed");
  assert.equal(ffr.claimObservations, 24, "6 null cases x 4 claims — the denominator the paper must print");
  assert.equal(ffr.value, 0);
  // spec §7's target is 0, and it is now MET across every null edit in the suite.
  assert.equal(ffr.value, ffr.target, "spec §7 targets 0; the null suite meets it");
});

// ==============================================================================================
// 2. REAL-EDIT SUITE — spec §7: target full recall + correct action.
// ==============================================================================================

test("real: a value change ESCALATEs the edited fact and catches the answer key as SILENT-RISK", () => {
  const r = run("real-value-change");
  // The seed: unauthorized content move = suspected error (spec §5 content row, §10 decision 2).
  assert.equal(verdictAt(r, "study-guide/phase-change.md#melting-point-of-water#1|matched"), "ESCALATE");
  // The reason silentRisk exists, and the single most valuable output in the system: the guide now
  // says 0 °C, the answer key still says 100 °C, its own text is untouched so NOTHING else in the
  // system can see it. Without this the contradiction ships with every check green.
  assert.equal(verdictAt(r, "practice/phase-change.md#practice-phase-change#1|matched"), "SILENT-RISK");
  assert.equal(r.detected, 2, "both preregistered flags detected");
  assert.deepEqual(r.wrongVerb, [], "both carry the preregistered verb");
});

test("FINDING 4 (RESOLVED): a value change reaches the answer key but NOT an objective that states no value", () => {
  // THE PREREGISTRATION IS UNCHANGED — it was never in question. "State the melting point of water
  // at standard pressure" restates no value; it is exactly as true at 0 °C as at 100 °C, so a value
  // edit strands it in no way an instructor must see. What changed is that OBSERVED now MEETS the
  // preregistration. The header once said this case "fails by design (a precision cost, reported)";
  // that stopped being true when the value-change term gate landed, and this is it saying so.
  //
  // WHAT WAS BROKEN: term co-mention fired for ANY term-sharer whenever `content` moved, so a value
  // change dragged in every claim naming the term — including the objective, which asserts nothing
  // that a value could contradict. It flagged, matchesPreregistration was false, one unexpected.
  //
  // WHAT FIXED IT: `reachFrom` narrows the TERM hop on a value change (content moved, no rename, and
  // the seed itself states a quantity) to the sharers that THEMSELVES state a value — read from M2's
  // own units recognizer (`scanProjection`), so the gate cannot drift from what counts as a value.
  // The answer key restates "100 °C" and is kept (the case the system exists for); the objective
  // states no value and is dropped. Never applied on a rename (label) or a non-numeric content move.
  const r = run("real-value-change");
  assert.equal(r.matchesPreregistration, true, "FINDING 4 RESOLVED: observed == preregistered");
  assert.deepEqual(r.unexpected, [], "the objective is no longer over-reached");
  assert.deepEqual(r.missed, [], "and the answer key is NOT lost — under-reach was the trap this avoided");
  // The answer key IS still flagged (SILENT-RISK), reached by one hop on the shared term — the very
  // claim `silentRisk` exists to catch. Read from `via` rather than regexed out of prose.
  const ans = "practice/phase-change.md#practice-phase-change#1|matched";
  assert.equal(verdictAt(r, ans), "SILENT-RISK", "the answer key that restates the value is kept");
  assert.deepEqual(r.observations.find((o) => o.key === ans).via, ["shared-term"]);
});

test("real (spec §7 OVERRIDE test): an authorized knowledge update is RE-DERIVE, never a hallucination", () => {
  const r = run("real-value-change-authorized");
  // The edit is byte-identical to `real-value-change`. The ONLY difference is that M7 has an
  // override on record and M5 received it per-claim — spec §5's cross-cutting rule (a).
  assert.equal(verdictAt(r, "study-guide/phase-change.md#melting-point-of-water#1|matched"), "RE-DERIVE");
  assert.notEqual(
    verdictAt(r, "study-guide/phase-change.md#melting-point-of-water#1|matched"),
    "ESCALATE",
    "spec §7: NOT flagged as hallucination — the human already decided",
  );
  // The subtle half: authorization settles whether the EDIT is legitimate. It says nothing about
  // the answer key that now contradicts it. An override that silenced the dependent would
  // authorize the package into an internal contradiction — worse than the flag it removed.
  assert.equal(verdictAt(r, "practice/phase-change.md#practice-phase-change#1|matched"), "SILENT-RISK");
  assert.deepEqual(r.wrongVerb, []);
});

test("real: an objective ADD and an objective REMOVE both RECHECK, and nothing else moves", () => {
  const add = run("real-objective-add");
  assert.equal(add.matchesPreregistration, true);
  assert.equal(verdictAt(add, "study-guide/phase-change.md#objectives#3|added"), "RECHECK");
  assert.equal(add.observedFlags, 1, "the two existing objectives are untouched assertions");

  const remove = run("real-objective-remove");
  assert.equal(remove.matchesPreregistration, true);
  assert.equal(verdictAt(remove, "study-guide/phase-change.md#objectives#2|removed"), "RECHECK");
  assert.equal(remove.observedFlags, 1);
});

test("FINDING 1 (headline, RESOLVED 2026-07-17): a term RENAME survives the map-edit path", () => {
  // THE PREREGISTRATION IS UNCHANGED — it was never in question. 3 claims, ids PRESERVED, verdict
  // RENAME: interfaces §4's identity table ("rename -> same id"), spec §5's label-only row, and §4b,
  // which exists for no other purpose than to make it true. What changed is that OBSERVED now MEETS
  // it. This file's header said "the day someone fixes the rename, the test fails and says so";
  // that day was 2026-07-17, the test failed, and this is it saying so.
  //
  // WHAT WAS BROKEN: §2 minted `term.<slug(preferredLabel)>` while spec §10 dec. 3(c) REGENERATES
  // TERMS from the map — individually correct, jointly unsatisfiable. Renaming in `## Key terms`
  // re-minted `term.melting-point` as `term.fusion-point`, which moved `identityLabel` (the hash of
  // sorted TERM IDS), which moved the claim id: 3 removed + 3 added, classified RECHECK, and the
  // `label` layer never got a matched pair to be observed on.
  //
  // WHAT FIXED IT: §2 amended — the id is minted ONCE and never re-minted. `buildTerms(maps,
  // priorTerms)` takes the STORED TERMS.json (the memory the design assumed and did not have), and
  // an entry whose label set overlaps exactly one prior term keeps that term's id. §1's grammar
  // guarantees the hinge: a rename keeps the old label as an alias, so the overlap exists by
  // construction. `term.melting-point` now carries preferredLabel "fusion point" — a historical
  // artifact, and correct: an identity key is a handle, not a display name.
  const r = run("real-term-rename");
  assert.equal(r.matchesPreregistration, true, "FINDING 1 RESOLVED: observed == preregistered");
  assert.equal(r.detected, 3, "RECALL 3/3 on this case");
  assert.deepEqual(r.missed, [], "nothing preregistered is missed");
  assert.deepEqual(r.unexpected, [], "and nothing else is dragged in: objectives#2 mentions no term");
  assert.deepEqual(r.wrongVerb, []);

  // THE TWO PROPERTIES, ASSERTED SEPARATELY, BECAUSE EITHER ALONE IS HALF A FIX. §4b's whole
  // content is that an IDENTITY KEY and a CHANGE SIGNAL have opposite requirements over the same
  // projection — so identity holding is worth nothing if the change stopped being observable, and
  // vice versa. An id scheme that ignored the label would hold identity and go silent; the scheme
  // that was frozen made the change observable and destroyed identity. Both, or neither.
  assert.equal(r.observedFlags, 3, "3 claims -> 3 flags, not 3 removed + 3 added");
  assert.equal(
    r.observations.every((o) => o.lifecycle === "matched"),
    true,
    "IDENTITY HELD: every claim mentioning the term matched across the rename — 0 added, 0 removed",
  );
  assert.equal(
    r.observations.every((o) => o.verdict === "RENAME"),
    true,
    "THE CHANGE IS OBSERVABLE: `label` moved and won precedence on all three — spec §5's label-only row",
  );
  assert.equal(
    r.observations.every((o) => o.layer === "label"),
    true,
    "and it is the VOCABULARY layer that moved — not `spine` winning because a side was absent",
  );
  // The negative that proves the layer split is real and not a rename painted over everything:
  // `content` must NOT move. Both labels resolve to the same id, so the semantic core is identical
  // — that is M3's `foldTerms` earning its keep, and it is why the verb is RENAME and not ESCALATE.
  assert.equal(
    r.observations.some((o) => o.layer === "content"),
    false,
    "a rename changes what the term is CALLED, not what the claim SAYS",
  );
});

test("FINDING 2 (RESOLVED 2026-09-05): a reorder keeps both ids and is RECHECK — 1 edit, 2 flags, 4 claims", () => {
  // PREREGISTERED: 2 claims, ids PRESERVED, verdict RECHECK (spec §5 lists "reorder" as a RECHECK
  // case; the two objectives are the SAME two assertions, moved). Never edited.
  // OBSERVED until 2026-09-05: 2 added + 2 removed + 2 silent-risk — the positional anchor moved
  // with the position, and each re-added claim re-seeded co-mention. spec §0's founding defect
  // ("1 change -> 6 required reviews") at claim granularity.
  // OBSERVED now: the fixture's objectives carry inline `[anchor: slug]` identity (G22, the contract
  // change G2 named as the fix). Identity keys on the slug, so both ids survive; the relative rank
  // among anchored siblings changed, so both are RECHECK; nothing else is reached.
  const r = run("real-reorder");
  assert.equal(r.matchesPreregistration, true, "FINDING 2: observed == preregistered");
  assert.equal(r.detected, 2, "RECALL 2/2 on this case");
  assert.equal(r.observedFlags, 2, "two flags on a four-claim package, for a reorder of two items");
  assert.deepEqual(r.unexpected, [], "no re-seeding: the fact and the answer key are not dragged in");
  const objectives = r.observations.filter((o) => o.key.includes("objectives"));
  assert.equal(objectives.length, 2);
  assert.equal(objectives.every((o) => o.lifecycle === "matched" && o.verdict === "RECHECK"), true, "both ids survived; both are RECHECK");
  assert.equal(r.observations.some((o) => o.verdict === "SILENT-RISK"), false, "nothing is dragged in as silent-risk");
});

// ==============================================================================================
// 3. IDENTITY + IMMUTABLE REGIONS (spec §7's own bullets)
// ==============================================================================================

test("identity (spec §7): rephrase keeps the id; a value change keeps the id", () => {
  const [rephrase, valueChange] = identityChecks();
  assert.equal(rephrase.idPreserved, true);
  assert.deepEqual(rephrase.moved, ["format"]);
  assert.equal(valueChange.idPreserved, true, "it is still 'the melting point of water' — §4");
  assert.equal(valueChange.moved.includes("content"), true, "the change is visible...");
  assert.equal(valueChange.moved.includes("label"), false, "...but not on the vocabulary layer (§5)");
  // The third identity row (split/merge) is UNREACHABLE here and is declared, not dropped.
  assert.equal(SKIPPED.some((s) => s.name === "identity-split-merge"), true);
});

test("immutable regions (spec §7): a rename does not rewrite the inside of a quotation", () => {
  const r = immutableCheck();
  assert.deepEqual(r.regions, ["quote"], "the fixture's study guide carries one quoted span");
  assert.equal(r.applied, 2, "the rename DOES apply, mechanically, to the package's own prose");
  // The property that matters, over real bytes: the quoted sentence still contains "melting point"
  // verbatim after a melting point -> fusion point rename applied to the same file. Rewriting a
  // dated quotation is fabrication (spec §5 cross-cutting rule (b)).
  assert.equal(r.quotedTextsSurviveVerbatim, true);
  // The negative, asserted separately: not one applied edit's file offset landed inside a region.
  assert.deepEqual(r.mechanicalEditsInsideAnImmutableRegion, []);
  // spec §6.3: the answer key TESTS the term, so it is routed to review, never blind-replaced.
  assert.equal(r.derived.length, 1);

  // HONESTY, ASSERTED. On this fixture the guard's REFUSAL BRANCH NEVER FIRES: the only quotation
  // carries no quantity, so M2's scan mints no claim for it, so no plan can target it. The
  // quotation survives because nothing aimed at it. The assertions above are real and worth having
  // — they would catch a propagation engine that widened its blast radius — but they are NOT
  // evidence that the refusal works, and the manuscript must not read them as such. The refusal is
  // exercised in tests/propagate.test.mjs with a hand-built claim that overlaps a region.
  assert.equal(r.refusalBranchExercised, false, "if this ever becomes true, update the claim above and the report");
});

// ==============================================================================================
// 4. THE APPARATUS ITSELF — the properties the manuscript depends on
// ==============================================================================================

test("apparatus: every metric is reported WITH its denominator", () => {
  const m = runStudyPairs().metrics;
  assert.equal(m.false_flag_rate.claimObservations, 24);
  assert.equal(m.impact_detection_recall.preregisteredFlags, 11);
  assert.equal(m.propagation_correctness.detectedFlags, m.impact_detection_recall.detected);
  // A recall of 1.0 over 2 claims is not the evidence a recall of 1.0 over 40 is. Every ratio here
  // is over single digits or low double digits, and the paper must not imply otherwise.
  assert.ok(m.impact_detection_recall.preregisteredFlags < 20, "the denominators are SMALL — say so");
});

test("apparatus: the headline metrics are what they are", () => {
  const m = runStudyPairs().metrics;
  // Pinned so a regression, or an improvement, is loud. NOT fitted: each number is the sum of the
  // per-case results above, every one of which is preregistered and reasoned in the source.
  assert.equal(m.false_flag_rate.value, 0, "0/24 — every null edit is clean after FINDING 3 was fixed on 2026-08-11");
  assert.equal(
    m.impact_detection_recall.value,
    1,
    "11/11 — was 6/11 until FINDING 1 was fixed (+3, the rename case), 9/11 until FINDING 2 (the reorder) was fixed on 2026-09-05 (+2)",
  );
  assert.equal(m.propagation_correctness.value, 1, "11/11 of the flags we detect carry the right verb");
  // propagation_correctness reads perfectly and must never be quoted alone: its denominator is the
  // DETECTED set. Recall and correctness are one result in two halves — both are now 1.
  assert.equal(m.propagation_correctness.detectedFlags, 11);
  assert.equal(m.real_edit_unexpected_flag_rate.value, 0, "no real edit flags a claim it should not — was 0.25 while the reorder re-seeded");
});

test("apparatus: TWELVE of twelve cases meet their preregistration — the trail of retirements is complete", () => {
  // The count is stated exactly, because "some cases fail" is how a mismatch becomes background
  // noise. The trail of retirements, each moving because the SYSTEM moved — not one expectation in
  // `scripts/study_pairs.mjs` was ever touched:
  //   * FIVE cases / FOUR findings until 2026-07-17, when FINDING 1 (the rename) was fixed in
  //     interfaces §2 and `lib/terms.mjs`;
  //   * FOUR cases / THREE findings until 2026-08-11, when FINDING 3 (the orz container bump) was
  //     fixed in `lib/fingerprint.mjs`'s `stripMarkup`;
  //   * THREE cases / TWO findings, same day, when FINDING 4 (the value-change term over-reach) was
  //     fixed by the quantity gate in `lib/coherence.mjs`'s `reachFrom` — retiring BOTH value-change
  //     cases at once, since they share the edit;
  //   * ONE case / ONE finding until 2026-09-05, when FINDING 2 (the reorder) was fixed by the
  //     contract change G2 named — inline `[anchor: slug]` identity (G22) — in `lib/claims.mjs`,
  //     `lib/terms.mjs` and `lib/coherence.mjs`, with the fixture's objectives anchored.
  const report = runStudyPairs();
  assert.deepEqual(report.mismatches.map((x) => x.case).sort(), []);
  for (const fixed of ["real-term-rename", "null-orz-container", "real-value-change", "real-value-change-authorized", "real-reorder"]) {
    assert.equal(
      report.mismatches.some((x) => x.case === fixed),
      false,
      `resolved: ${fixed} now meets the preregistration it was pinned as failing`,
    );
  }
  assert.equal(report.cases.length, 12);
  assert.equal(report.cases.filter((c) => c.matchesPreregistration).length, 12);
});

test("apparatus: unreachable cases are DECLARED, never silently dropped", () => {
  // A silently missing case is a coverage claim nobody earned. spec §7 names eight real-edit types;
  // five are measured, and every absentee is declared with a checkable reason.
  assert.deepEqual(
    SKIPPED.map((s) => s.name).sort(),
    ["asset-swap", "cross-chapter-reorder", "depth-change", "identity-split-merge", "source-drift"].sort(),
  );
  for (const s of SKIPPED) assert.ok(s.reason.length > 80, `${s.name}: the reason must be checkable, not an excuse`);
});

test("apparatus: 2 of the 5 fingerprint layers are CONSTANT on this fixture (FINDING 5)", () => {
  // Four SKIPPED cases and one identity row share ONE cause, and it bounds every number above:
  // every fixture claim is scan-found, and M2's scan refuses (correctly) to invent a spineRef, a
  // sourceRef or a derivedFrom. So `spine` and `provenance` are the hash of the empty set on all
  // four claims and cannot move under ANY edit — and `derivedFrom`, the PRIMARY edge claimImpact
  // traverses, has no instance, so the derivation graph is EMPTY and every result rests on
  // co-mention alone. The study pairs measure 3 of 5 layers over 4 claims. The manuscript must say
  // so; this test makes the statement checkable rather than a claim in prose.
  const seen = new Set();
  for (const c of CASES) for (const o of runCase(c).observations) if (o.layer) seen.add(o.layer);
  assert.equal(seen.has("content"), true);
  assert.equal(seen.has("format"), false, "format never WINS precedence — it is never the report");
  assert.equal(
    [...seen].every((l) => ["content", "label", "spine"].includes(l)),
    true,
    `only content, label and spine are ever reported; observed: ${[...seen].sort().join(", ")}`,
  );
  // `label` JOINED THIS SET on 2026-07-17, and it is the FINDING-1 fix showing up in the coverage
  // rather than in a metric. Before the fix a rename destroyed claim identity, so no matched pair
  // existed for `label` to be observed on and the layer was unreachable end to end — measured, not
  // asserted: the set was {content, spine}. It is now reported on a MATCHED claim, which is the
  // only way it can ever be reported. The bound that remains is `spine` + `provenance` (below).
  assert.equal(seen.has("label"), true, "the rename fix made the vocabulary layer reachable");
  const labelReports = CASES.flatMap((c) => runCase(c).observations).filter((o) => o.layer === "label");
  assert.equal(
    labelReports.every((o) => o.lifecycle === "matched"),
    true,
    "`label` is only ever reported on a claim whose identity SURVIVED — that is what §4b buys",
  );
  // `spine` appears ONLY as the precedence winner on an added/removed claim (an absent side moves
  // all five layers) — never because a spineRef actually changed. That is not spine coverage.
  // ONE exception since 2026-09-05, and it is not spine COVERAGE either: the reorder signal (G22)
  // reports `layer: "spine"` on a MATCHED anchored claim because ordering is prerequisite structure
  // (spec §5's spine row) — a synthetic move, not a spineRef change. It appears on the reorder case
  // only, always as RECHECK. Every other matched claim still never moves `spine`.
  const spineReports = CASES.flatMap((c) => runCase(c).observations.map((o) => ({ ...o, caseName: c.name }))).filter((o) => o.layer === "spine");
  const matchedSpine = spineReports.filter((o) => o.lifecycle === "matched");
  assert.equal(matchedSpine.length > 0, true, "the reorder signal reports the spine layer on a matched claim");
  assert.equal(
    matchedSpine.every((o) => o.caseName === "real-reorder" && o.verdict === "RECHECK"),
    true,
    `spine on a matched claim is the reorder RECHECK and nothing else: ${JSON.stringify(matchedSpine.map((o) => [o.caseName, o.verdict]))}`,
  );
});

test("apparatus: deterministic — same fixture, same edit, byte-identical metrics", () => {
  // interfaces §6.1, and it is load-bearing for the paper, not a style rule: a reviewer must be
  // able to REGENERATE a number months from now, from git, instead of trusting it. No clock, no
  // network, no randomness, no git in this path. (The override case pins its `date` to a literal
  // for exactly this reason.)
  const a = JSON.stringify(runStudyPairs().metrics);
  const b = JSON.stringify(runStudyPairs().metrics);
  assert.equal(a, b);
});

test("apparatus: the golden fixture is never mutated", () => {
  // Other modules' tests depend on it byte-for-byte. Every case runs against a fresh mkdtemp copy.
  // Asserted by running the whole apparatus and re-reading the fixture's claim set: if any case
  // had written through, the second index would differ.
  const before = runStudyPairs();
  const after = runStudyPairs();
  assert.equal(before.cases[0].claimsInPackage, 4);
  assert.deepEqual(
    before.cases.map((c) => c.claimsInPackage),
    after.cases.map((c) => c.claimsInPackage),
    "a mutated fixture would drift the claim count between runs",
  );
});
