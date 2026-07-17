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
//   * **FIVE OF TWELVE CASES FAIL THEIR PREREGISTRATION, AND THIS FILE ASSERTS THEM AS FAILING.**
//     It does not "expect" the broken behavior in the sense of blessing it: it pins the mismatch,
//     names the finding, and makes the day somebody FIXES it a loud test failure that says so.
//     The alternative — quietly editing the expectation to match the output — yields a green suite,
//     a recall of 1.0, and a lie. It is indistinguishable from fabrication from the outside and
//     from bug-fixing from the inside, which is exactly what spec §6.9 says about this project's
//     own manuscript: "adjusting a check so our own product scores better in our own paper".
//     An honest 0.545 recall is a result. A fitted 1.0 is a fraud with a timer on it.
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

test("FINDING 3: an orz `:::info` container bump is a FALSE FLAG (3 flags where spec §5 promises 0)", () => {
  // PREREGISTERED: 0 flags. spec §5's format row lists "orz/template bump" -> NONE, and wrapping a
  // sentence in a callout asserts nothing new.
  // OBSERVED: `:::info` is not markdown, so `stripMarkup` has no rule for it and the bare word
  // "info" lands in the semantic core -> `content` moves -> ESCALATE -> the claim seeds co-mention
  // and drags two more claims in as silent-risk.
  //
  // THIS TEST PINS THE DEFECT. It is not a blessing: orz-markdown is this project's house markdown
  // standard, so this fires on ordinary chapter styling. When `stripMarkup` learns orz containers,
  // this test MUST fail — and the failure means "delete this test, the preregistration now holds".
  const r = run("null-orz-container");
  assert.equal(r.expectedFlags, 0, "the preregistration is 0 and stays 0");
  assert.equal(r.matchesPreregistration, false, "FINDING 3: observed != preregistered");
  assert.equal(r.observedFlags, 3);
  assert.equal(verdictAt(r, "study-guide/phase-change.md#melting-point-of-water#1|matched"), "ESCALATE");
  assert.equal(
    r.observations.find((o) => o.key === "study-guide/phase-change.md#melting-point-of-water#1|matched").layer,
    "content",
    "the mechanism: a container fence moves the MEANING layer",
  );
});

test("false_flag_rate is reported with its denominator, and is NOT zero", () => {
  const m = metrics(CASES.map((c) => runCase(c)));
  const ffr = m.false_flag_rate;
  assert.equal(ffr.falseFlags, 3, "all three from null-orz-container; the other five null cases are clean");
  assert.equal(ffr.claimObservations, 24, "6 null cases x 4 claims — the denominator the paper must print");
  assert.equal(ffr.value, 0.125);
  // spec §7's target is 0. The honest report is that it is NOT met, by one case, for one reason.
  assert.notEqual(ffr.value, ffr.target, "spec §7 targets 0; see FINDING 3");
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

test("FINDING 4: the value change also over-reaches to an objective that did not change meaning", () => {
  // PREREGISTERED: not flagged. "State the melting point of water at standard pressure" does not
  // restate the value; it is exactly as true at 0 °C as at 100 °C.
  // OBSERVED: SILENT-RISK, via one-hop co-mention on the shared term.
  // A PRECISION cost, not a detection failure — and the DESIGNED behavior, so this is reported
  // rather than proposed as a defect (see FINDING 4; the alternative would have missed the answer
  // key, which is the case the system exists for). spec §1 asks for precision "measured, not
  // assumed"; §7 gives it no metric, so the harness adds one.
  const r = run("real-value-change");
  assert.equal(r.matchesPreregistration, false);
  assert.deepEqual(r.unexpected, [
    { key: "study-guide/phase-change.md#objectives#1|matched", verdict: "SILENT-RISK" },
  ]);
  // The RELATION that reached it, read from the `via` field rather than regexed out of prose:
  // one hop on the shared term, with no derivation edge involved (there are none — FINDING 5).
  assert.deepEqual(r.observations.find((o) => o.key === r.unexpected[0].key).via, ["shared-term"]);
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

test("FINDING 1 (headline): a term RENAME does not survive the only path an instructor has", () => {
  // PREREGISTERED: 3 claims, ids PRESERVED, verdict RENAME. That is not an opinion — it is
  // interfaces §4's identity table ("rename -> same id") and spec §5's label-only row, and §4b
  // exists for no other purpose than to make it true.
  //
  // OBSERVED: 0 of 3. Editing `## Key terms` in the concept map — the way spec §10 decision 3 says
  // a rename happens — re-mints `term.melting-point` as `term.fusion-point`, because interfaces §2
  // mints a term id from `slug(preferredLabel)` and TERMS is regenerated from the map. That moves
  // `identityLabel` (the hash of sorted TERM IDS), so it moves the identity key, so it moves the
  // claim id. Every claim mentioning the term reports removed+added and classifies RECHECK.
  //
  // The `label` fingerprint — the layer built to make a rename OBSERVABLE — never gets a matched
  // pair to be observed on. RENAME is unreachable from a package edit.
  //
  // THE FIX IS A CONTRACT CHANGE (interfaces §2's id scheme) AND IS NOT THIS FILE'S. When it
  // lands, this test MUST fail — and that failure means "the preregistration now holds; delete
  // this test and let the real assertion above stand".
  const r = run("real-term-rename");
  assert.equal(r.matchesPreregistration, false, "FINDING 1: observed != preregistered");
  assert.equal(r.detected, 0, "RECALL 0/3 on this case");
  assert.deepEqual(r.missed.sort(), [
    "practice/phase-change.md#practice-phase-change#1|matched",
    "study-guide/phase-change.md#melting-point-of-water#1|matched",
    "study-guide/phase-change.md#objectives#1|matched",
  ]);
  // Not one claim was matched across the rename: every one is an add or a remove.
  assert.equal(r.observations.every((o) => o.lifecycle !== "matched"), true, "no claim identity survived");
  assert.equal(r.observedFlags, 6, "3 claims -> 3 removed + 3 added");
  assert.equal(
    r.observations.every((o) => o.verdict === "RECHECK"),
    true,
    "an absent side moves all five layers, so `spine` wins precedence — RENAME is never emitted",
  );
  assert.equal(
    r.observations.some((o) => o.verdict === "RENAME"),
    false,
    "the whole terminology-migration (IUPAC) case is unreachable end to end",
  );
});

test("FINDING 2: a reorder is indexed as a mass delete-and-recreate — 1 edit, 6 flags, 4 claims", () => {
  // PREREGISTERED: 2 claims, ids PRESERVED, verdict RECHECK (spec §5 lists "reorder" as a RECHECK
  // case; the two objectives are the SAME two assertions, moved).
  // OBSERVED: 2 added + 2 removed + 2 silent-risk. The positional anchor moves (a limitation
  // `lib/claims.mjs` documents honestly), so each re-added claim re-seeds co-mention and drags the
  // fact and the answer key in — on an edit that changed no value at all.
  //
  // This is spec §0's founding defect — "1 change -> 6 required reviews", the S-C pilot's exact
  // number — reappearing at claim granularity, wearing this index's authority.
  const r = run("real-reorder");
  assert.equal(r.matchesPreregistration, false, "FINDING 2: observed != preregistered");
  assert.equal(r.detected, 0, "RECALL 0/2 on this case");
  assert.equal(r.observedFlags, 6, "six flags on a four-claim package, for a reorder");
  assert.equal(
    r.observations.filter((o) => o.lifecycle === "matched").every((o) => o.verdict === "SILENT-RISK"),
    true,
    "the two untouched claims are dragged in as silent-risk by the re-seeding",
  );
  assert.equal(
    r.observations.filter((o) => o.key.includes("objectives")).every((o) => o.lifecycle !== "matched"),
    true,
    "neither objective's id survived the reorder",
  );
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
  assert.equal(m.false_flag_rate.value, 0.125, "3/24 — one case, FINDING 3");
  assert.equal(m.impact_detection_recall.value, 0.5455, "6/11 — the two 0-recall cases are FINDINGS 1 and 2");
  assert.equal(m.propagation_correctness.value, 1, "6/6 of the flags we DID detect carry the right verb");
  // propagation_correctness reads perfectly and must never be quoted alone: its denominator is the
  // DETECTED set, so the two cases that detected nothing cannot lower it. Recall and correctness
  // are one result in two halves.
  assert.equal(m.propagation_correctness.detectedFlags, 6);
  assert.ok(m.impact_detection_recall.value < 1, "spec §7 targets full recall; it is not met");
});

test("apparatus: FIVE of twelve cases fail their preregistration, across FOUR named findings", () => {
  // The count is stated exactly, because "some cases fail" is how a mismatch becomes background
  // noise. Five cases, four findings — the two value-change cases mismatch for the SAME reason
  // (FINDING 4's one-hop over-reach), which is why the finding count is lower than the case count
  // and why both numbers are reported rather than the flattering one.
  const report = runStudyPairs();
  assert.deepEqual(
    report.mismatches.map((x) => x.case).sort(),
    [
      "null-orz-container", // FINDING 3 — an orz container bump moves `content`
      "real-reorder", // FINDING 2 — a reorder is a mass delete-and-recreate
      "real-term-rename", // FINDING 1 — a rename does not survive the map-edit path
      "real-value-change", // FINDING 4 — one-hop co-mention over-reach
      "real-value-change-authorized", // FINDING 4 again — same over-reach, same edit
    ].sort(),
  );
  assert.equal(report.cases.length, 12);
  assert.equal(report.cases.filter((c) => c.matchesPreregistration).length, 7);
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
    [...seen].every((l) => ["content", "spine"].includes(l)),
    true,
    `only content and spine are ever reported; observed: ${[...seen].sort().join(", ")}`,
  );
  // `spine` appears ONLY as the precedence winner on an added/removed claim (an absent side moves
  // all five layers) — never because a spineRef actually changed. That is not spine coverage.
  const spineReports = CASES.flatMap((c) => runCase(c).observations).filter((o) => o.layer === "spine");
  assert.equal(
    spineReports.every((o) => o.lifecycle !== "matched"),
    true,
    "no matched claim ever moves `spine`: there are no spineRefs to move",
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
