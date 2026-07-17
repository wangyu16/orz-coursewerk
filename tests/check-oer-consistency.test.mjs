// TRUST LAYER 3 — `check_oer.mjs` scans the package AGAINST ITSELF (M6, wired).
//
// WHAT THIS FILE PINS, AND THE DEFECT THAT MADE IT NECESSARY.
//
// `scripts/lib/consistency.mjs` (M6) has been built, tested (20 tests) and mutation-covered since
// the index landed. `grep -c scanConsistency scripts/check_oer.mjs` was **0**. No product caller —
// in `lib/`, in the tests, and nowhere else. `docs/reliability_recovery_design.md` §5.3 lists
// internal cross-artifact consistency as TRUST LAYER 3, one of the only two layers that catch a
// KNOWLEDGE error rather than a referential one, and IT DID NOT RUN. So a package whose study guide
// says 100 °C while its own answer key says 90 °C shipped with every check green and the gate
// silent — M6's own motivating case, and the student who answers correctly and is marked wrong.
//
// Same shape as F-B (the revision loop, which lived only in `scripts/study_pairs.mjs` — the STUDY
// harness) and the same family as the six no-producer defects. NOTE, because it sharpens the
// family: F-B's write-up says M6's only non-lib caller was the study harness. IT IS NOT. The study
// harness does not call it either (`grep -rn consistency scripts/study_pairs.mjs` -> nothing). M6
// was reachable from ITS OWN UNIT TESTS AND NOTHING ELSE — one rung below the defect that was
// already considered the bad case.
//
// THE TWO HALVES, WHICH PULL IN OPPOSITE DIRECTIONS (inherited from check-oer-revision):
//   RECALL     — two artifacts that disagree about one subject must be caught with NO declared edge
//                between them. That is M6's whole reason to exist: the edge nobody declared is, by
//                definition, the edge nobody will notice is missing.
//   PRECISION  — a clean package must earn ZERO flags. M6 documents SIX non-flags, each bought with
//                recall on purpose, because the failure mode of a scan like this is not a missed bug
//                but ALARM FATIGUE: a queue nobody opens protects nobody, including on the flag that
//                mattered.
// Either half alone is trivially satisfiable and worthless. So every positive below is paired with
// its negative, and the clean case is the budget the whole design is spent against.
//
// THE RULE, INHERITED FROM usage-e2e: drive the DOCUMENTED CLI as a child process. Nothing here
// imports from `scripts/lib/` — a library import would re-create the exact blind spot this file
// exists to close (M6 the library was always fine; the space between M6 and the product was not,
// and twenty green unit tests could not see it). Every assertion reads a user-visible surface: the
// JSON report and `metadata/REVIEW_QUEUE.json`.
//
// The fixture is READ-ONLY: every case runs against a fresh `mkdtemp` copy, removed afterwards.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const FIXTURE = path.join(HERE, "fixtures", "usage-package");

const SG = "study-guide/melting.md";
const PRACTICE = "practice/melting.md";
/** The study guide's declared fact about the melting point — the "left half" of every pair below. */
const SG_FACT = "At standard pressure the melting point of pure water is 0 °C.";
/** The answer key that states the same subject's value — the "right half". */
const KEY_ANSWER = "0 °C — the melting point of pure water at standard pressure.";

function cli(script, args) {
  const res = spawnSync(process.execPath, [path.join(REPO, "scripts", script), ...args], {
    cwd: REPO,
    encoding: "utf8",
  });
  return { code: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

/** A private, writable copy of the fixture, torn down with the test. NEVER mutate `tests/fixtures`. */
function freshPackage(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-consistency-"));
  const pkg = path.join(dir, "package");
  fs.cpSync(FIXTURE, pkg, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return pkg;
}

/** PROCEDURE Stage 4. */
function index(pkg) {
  const res = cli("index_semantic.mjs", ["--root", pkg]);
  assert.equal(res.code, 0, `index:semantic failed: ${res.stderr}`);
}

/** PROCEDURE Stage 5 — the gate. `--no-commit`: these packages carry no git history. */
function gate(pkg, extra = []) {
  const json = path.join(pkg, "..", "qa.json");
  const report = path.join(pkg, "..", "qa_report.md");
  cli("check_oer.mjs", ["--package", pkg, "--json", json, "--report", report, "--no-commit", ...extra]);
  return { json: JSON.parse(fs.readFileSync(json, "utf8")), report: fs.readFileSync(report, "utf8") };
}

const read = (pkg, rel) => fs.readFileSync(path.join(pkg, rel), "utf8");
const write = (pkg, rel, text) => fs.writeFileSync(path.join(pkg, rel), text);
const queueOf = (pkg) => JSON.parse(read(pkg, "metadata/REVIEW_QUEUE.json"));
const evidenceText = (q) => q.items.flatMap((i) => i.evidence).join("\n");
const inconsistencies = (q) => q.items.filter((i) => i.kind === "internal-inconsistency");

/** An edit that THROWS when its target is absent: an edit that applied to nothing would make every
 *  case below pass for the same reason — a failure that looks exactly like success. */
function edit(pkg, rel, from, to) {
  const text = read(pkg, rel);
  assert.ok(text.includes(from), `edit target not found in ${rel}: ${JSON.stringify(from)}`);
  write(pkg, rel, text.replace(from, to));
}

/**
 * Plant a contradiction and index AFTERWARDS, so the package SHIPS already at war with itself.
 *
 * This is the case TRUST layer 3 owns and it is deliberately NOT an edit-vs-stored-index case: with
 * `fresh === stored` the revision layer is silent by construction, so anything in the queue came
 * from the cross-artifact scan and nothing else. It is also the realistic one — nobody edits a
 * package into disagreement and then re-baselines it; a generator writes two artifacts that never
 * agreed, and no declared edge ever linked them.
 */
function shipWith(pkg, edits) {
  for (const [rel, from, to] of edits) edit(pkg, rel, from, to);
  index(pkg);
  const g = gate(pkg);
  // The revision layer must be SILENT here, or the queue below is not evidence about M6: with
  // `fresh === stored` nothing moved, so anything in the queue came from the cross-artifact scan.
  assert.equal(g.json.semantic.revision.actions, 0, "the revision layer fired — this is no longer an isolated M6 case");
  assert.equal(g.json.semantic.revision.silentRisk, 0, "the revision layer fired — this is no longer an isolated M6 case");
  return g;
}

// =============================================================================================
// PRECISION — the budget. WRITTEN FIRST, because it is the assertion that can veto the feature.
// =============================================================================================

test("1 · the CLEAN package reports burden 0 and ZERO consistency flags — the anti-alarm-fatigue proof", (t) => {
  const pkg = freshPackage(t);
  index(pkg);
  const g = gate(pkg);

  // The scan RAN. The point is never that it was quiet — it is that it LOOKED and was quiet. A layer
  // that silently skipped itself reports zero too, and that is the defect, not the fix.
  assert.equal(g.json.semantic.burden.artifactCount, 3, "the scan had no package to look at");

  // AND IT FOUND NOTHING.
  //
  // THE CLEAN FIXTURE IS A LIVE TRAP FOR THREE OF M6'S SIX NON-FLAGS AT ONCE, which is what makes
  // this a proof rather than a hope:
  //   * `practice/melting.md` answers "273.15 K, because 0 °C is 273.15 K" while the study guide
  //     asserts 0 °C. UNIT NORMALIZATION is the only thing making those AGREE — a string compare
  //     flags this package on its own correct answer key.
  //   * "334 J/g times 10 g is 3340 J" — a worked example whose numbers assert nothing about the
  //     term (non-flag 5).
  //   * "Q 1", "Objective 1", "Q6–Q10" — bare integers everywhere (non-flag 1).
  //
  // If wiring M6 makes a clean package flag, the wiring is wrong — not M6.
  assert.equal(
    g.json.semantic.burden.flagCount,
    0,
    `a clean package earned ${g.json.semantic.burden.flagCount} flag(s):\n${evidenceText(queueOf(pkg))}`,
  );
  assert.deepEqual(queueOf(pkg).items, []);
  assert.equal(g.json.criticalTotal, 0, "the clean package no longer passes its own gate");
});

test("2 · non-flag 1 survives the wiring: a bare number has no dimension, hence no subject", (t) => {
  // The single richest source of spurious collisions, and the one a naive scan dies of: two claims
  // about ONE term carrying two different bare integers. "Step 3" does not contradict "step 5".
  // Planted on the SAME term the fixture already declares, so the subject key genuinely collides and
  // only the unitless rule stands between this and a flag.
  const pkg = freshPackage(t);
  shipWith(pkg, [
    [SG, "At standard pressure the melting point of pure water is 0 °C.",
      "At standard pressure the melting point of pure water is 0 °C. Read step 3 of the procedure first."],
    [PRACTICE, "0 °C — the melting point of pure water at standard pressure.",
      "0 °C — the melting point of pure water at standard pressure. See step 7 of the procedure."],
  ]);

  const q = queueOf(pkg);
  assert.deepEqual(inconsistencies(q), [], `a bare number was read as a quantity:\n${evidenceText(q)}`);

  // THE NEGATIVE, and it is what makes the silence evidence rather than a coincidence: the SAME two
  // sentences, the SAME two numbers, one recognized unit apiece — and it is loud. Without this pair,
  // "no flag" is equally consistent with the scan not running at all, which is the defect this whole
  // file exists to fence.
  const loud = freshPackage(t);
  shipWith(loud, [
    [SG, "At standard pressure the melting point of pure water is 0 °C.",
      "At standard pressure the melting point of pure water is 3 °C."],
  ]);
  assert.ok(inconsistencies(queueOf(loud)).length > 0, "the same numbers WITH units did not flag — the scan is not running");
});

test("3 · non-flag 5 survives the wiring: a worked example's arithmetic is not an assertion", (t) => {
  // The "worked example vs stated constant" guard. A worked example legitimately walks numbers that
  // are not assertions about the term — an intermediate, a made-up sample, a different starting
  // condition. The fixture already ships the trap (10 g -> 3340 J in the guide, 250 g -> 83500 J in
  // the practice set); this widens it so the two examples state DIFFERENT energies for one term.
  // Only `derived`/`procedure` being non-assertive keeps them from arguing.
  const pkg = freshPackage(t);
  shipWith(pkg, [
    [SG, "Multiply the latent heat of fusion by the mass: 334 J/g times 10 g is 3340 J.",
      "Multiply the latent heat of fusion by the mass: 334 J/g times 10 g is 3340 J. A 2 g sample would take 668 J."],
  ]);

  const q = queueOf(pkg);
  const fusion = inconsistencies(q).filter((i) => evidenceText({ items: [i] }).includes("latent-heat-of-fusion"));
  assert.deepEqual(fusion, [], `a worked example's arithmetic was read as an assertion:\n${evidenceText(q)}`);
});

// =============================================================================================
// RECALL — the case the layer exists for, and the one nothing else in the system can catch.
// =============================================================================================

test("4 · a planted VALUE DISAGREEMENT is caught — and the message names both artifacts and both values", (t) => {
  const pkg = freshPackage(t);
  // NO declared edge is created between these two. That is the point: M6 is the UNDECLARED-EDGE
  // backstop, and a dependency the generator forgot to declare is exactly a silent breakage.
  shipWith(pkg, [[PRACTICE, KEY_ANSWER, "90 °C — the melting point of pure water at standard pressure."]]);

  const q = queueOf(pkg);
  const items = inconsistencies(q);
  assert.equal(items.length, 1, `expected exactly one contradiction, got ${items.length}:\n${evidenceText(q)}`);
  const [item] = items;

  // THE FOLD, both directions (interfaces §3). The QUEUE kind names what the human is ASKED and is
  // M10's dedupe key; the DETECTOR kind names what was OBSERVED and must survive the fold, or a
  // study can never report detection recall PER LAYER.
  assert.deepEqual(item.detectorKinds, ["value-disagreement"], "the observation was destroyed by the fold to the queue kind");

  // SEVERITY. `blocking` is M10's default for this kind and it is right: "blocking = a student meets
  // a falsehood or a contradiction" — this is the second clause literally. One of the two artifacts
  // IS wrong, the package cannot say which, and the student meets whichever they opened. That is
  // strictly worse than a dangling reference, which is `review` precisely BECAUSE no student meets a
  // falsehood there: the prose is untouched and the package is merely under-INDEXED, not wrong.
  assert.equal(item.severity, "blocking", "an internal contradiction was quieted below M10's default");

  // THE MESSAGE. A flag an instructor cannot act on is a flag they will not act on: this is a
  // DETECTOR, it never adjudicates, so the human needs BOTH sides to decide which artifact is wrong.
  const prose = item.evidence.join("\n");
  for (const needle of [SG, PRACTICE, "0 °C", "90 °C", "term.melting-point"])
    assert.ok(prose.includes(needle), `the message does not name ${JSON.stringify(needle)}:\n${prose}`);

  // BOTH participants are machine-indexable too — "show me every flag touching claim X" must not
  // miss the other side of the disagreement (the `claimId` -> `claimIds` contract note). M6 lists
  // EVERY claim on the subject, the AGREEING ones included, and that is deliberate: the instructor
  // adjudicating "is it 0 or 90?" needs the whole split, not one side of it. So this asserts the
  // floor, and asserts the two that matter are IN it, rather than pinning a count that would break
  // the day the fixture gains a claim.
  assert.ok(item.claimIds.length >= 2, "the disagreement is between 2+ claims; the item names fewer");
  assert.deepEqual(item.claimIds, [...item.claimIds].sort(), "claimIds is not sorted — the set has no stable identity");
  assert.deepEqual([...new Set(item.claimIds)], item.claimIds, "a claim is named twice in one item");

  // ONE ITEM, not one per claim: "is it 0 or 90?" is a SINGLE adjudication.
  assert.equal(q.items.filter((i) => i.kind === "internal-inconsistency").length, 1);
});

/**
 * Move the WHOLE package's melting point to 100 °C, then state ONE answer in Fahrenheit.
 *
 * Every one of the fixture's six value sites is moved, and that is not fussiness — M6's subject is
 * (term, dimension) ACROSS THE PACKAGE, so leaving even one artifact at 0 °C would flag a real
 * disagreement and the test would pass or fail for a reason that has nothing to do with °F. The
 * package that comes out is internally consistent at 373.15 K, expressed in two scales.
 */
function boilingPackage(t, answer) {
  const pkg = freshPackage(t);
  const at100 = "At standard pressure the melting point of pure water is 100 °C.";
  return [pkg, [
    [SG, SG_FACT, at100],
    [SG, "the melting point of pure water at standard pressure is 0 °C", "the melting point of pure water at standard pressure is 100 °C"],
    ["slides/melting.md", SG_FACT, at100],
    [PRACTICE, "0 °C.", "100 °C."],
    [PRACTICE, "273.15 K, because 0 °C is 273.15 K.", "373.15 K, because 100 °C is 373.15 K."],
    [PRACTICE, KEY_ANSWER, `${answer} — the melting point of pure water at standard pressure.`],
  ]];
}

test("5 · 100 °C and 212 °F AGREE — the unit-aware non-flag that is the whole reason M6 normalizes", (t) => {
  // The same subject, the same physical value, two scales. A string compare — or a scan that gave up
  // on conversion — flags this, and flags it on a package that is CORRECT. That is the alarm-fatigue
  // failure delivered by the mechanism built to prevent it, and it is why M6 normalizes at all.
  const [pkg, edits] = boilingPackage(t, "212 °F");
  shipWith(pkg, edits);

  const q = queueOf(pkg);
  assert.deepEqual(inconsistencies(q), [], `100 °C and 212 °F were reported as a disagreement:\n${evidenceText(q)}`);

  // THE NEGATIVE, and it is what makes the silence above evidence rather than a scan that converts
  // everything into agreement: the SAME package, the SAME scale, a value that genuinely differs.
  // 213 °F is not 100 °C, and one degree of slack is the difference between a converter and a
  // rounding excuse.
  const [loud, loudEdits] = boilingPackage(t, "213 °F");
  shipWith(loud, loudEdits);
  const items = inconsistencies(queueOf(loud));
  assert.equal(items.length, 1, "213 °F vs 100 °C did not flag — the conversion is swallowing real differences");
  assert.ok(items[0].evidence.join("\n").includes("213 °F"), "the message does not quote the surface form the author wrote");
});

/**
 * Give the package two DECLARED definitions of the melting point, one per artifact.
 *
 * They must be DECLARED: M2 never infers a definition ("X is the temperature at which…" is one, "X
 * is hard to measure" is not, and telling them apart is parsing — a wrong parse being worse than no
 * parse). So a definition-drift case cannot be produced by prose alone, and the sidecar is the only
 * honest way to build one. Both sections are APPENDED: the fixture's declared anchors are
 * block-INDEXED (`practice-melting#2`), so inserting anywhere but the end renumbers them and the run
 * fills with dangling-anchor flags that have nothing to do with what is under test.
 */
function withDefinitions(pkg, sgText, keyText) {
  fs.appendFileSync(path.join(pkg, SG), `\n## Definition\n${sgText}\n`);
  fs.appendFileSync(path.join(pkg, PRACTICE), `\n## Definition restated\n${keyText}\n`);
  for (const [file, anchor] of [
    ["metadata/claims/study-guide/melting.json", "definition#1"],
    ["metadata/claims/practice/melting.json", "definition-restated#1"],
  ]) {
    const doc = JSON.parse(read(pkg, file));
    doc.claims.push({
      type: "definition",
      anchor,
      spineRefs: ["concept.melting.1"],
      sourceRefs: [],
      termRefs: ["term.melting-point"],
    });
    write(pkg, file, `${JSON.stringify(doc, null, 2)}\n`);
  }
}

test("9 · definition-drift: an ALIAS is provably cosmetic, an INVERTED definition is not", (t) => {
  // M6's SECOND detector kind, which folds to the same queue kind and would otherwise be wired
  // without a single test through the product. The non-flag here is M1's aliases: "melting point"
  // and "fusion point" ARE the same term — the concept map says so — so two definitions differing
  // only by which surface form they use are ONE definition. Flagging that would fire on a package
  // whose only sin is using its own registered vocabulary.
  const pkg = freshPackage(t);
  withDefinitions(
    pkg,
    "The melting point is the temperature at which a pure solid becomes liquid.",
    "The fusion point is the temperature at which a pure solid becomes liquid.",
  );
  shipWith(pkg, []);
  assert.deepEqual(inconsistencies(queueOf(pkg)), [],
    `two definitions differing only by a registered ALIAS were reported as drift:\n${evidenceText(queueOf(pkg))}`);

  // THE NEGATIVE, and it is the one that matters: word ORDER is preserved, so an INVERTED definition
  // is not folded away. "a solid becomes liquid" and "a liquid becomes solid" are the same tokens —
  // a token-multiset key would call them identical and ship a package that teaches melting backwards.
  const loud = freshPackage(t);
  withDefinitions(
    loud,
    "The melting point is the temperature at which a pure solid becomes liquid.",
    "The fusion point is the temperature at which a pure liquid becomes solid.",
  );
  shipWith(loud, []);
  const items = inconsistencies(queueOf(loud));
  assert.equal(items.length, 1, `an inverted definition did not drift:\n${evidenceText(queueOf(loud))}`);
  assert.deepEqual(items[0].detectorKinds, ["definition-drift"], "the observation was destroyed by the fold to the queue kind");
  assert.equal(items[0].severity, "blocking");
  const prose = items[0].evidence.join("\n");
  for (const needle of [SG, PRACTICE, "term.melting-point"])
    assert.ok(prose.includes(needle), `the message does not name ${JSON.stringify(needle)}:\n${prose}`);
});

// =============================================================================================
// THE PRECEDENT, AND THE PROPERTY THAT MAKES A FLAG REPRODUCIBLE
// =============================================================================================

test("6 · blocking does not mean failing the gate — it blocks at RELEASE, exactly like every sibling", (t) => {
  const pkg = freshPackage(t);
  shipWith(pkg, [[PRACTICE, KEY_ANSWER, "90 °C — the melting point of pure water at standard pressure."]]);

  // WHILE AUTHORING: a contradiction is a queue ITEM and the queue is the product. The established
  // precedent — dangling refs, the key-fact and visual review gates — is that the semantic layer
  // counts toward `criticalTotal` under `--for-discovery` ONLY.
  const authoring = gate(pkg);
  assert.equal(authoring.json.criticalCounts.semanticReviewFlags, 0, "an authoring run was blocked by a queue item");
  assert.ok(authoring.json.semantic.burden.flagCount > 0, "the contradiction was not queued at all");

  // AT RELEASE: shipping a package whose own answer key contradicts its own study guide is precisely
  // the defect this layer exists to catch, so it must not be listed.
  const release = gate(pkg, ["--for-discovery"]);
  assert.ok(release.json.criticalCounts.semanticReviewFlags > 0, "a self-contradicting package can still be published");
  assert.ok(release.json.criticalTotal > 0, "the release gate passed a package that contradicts itself");
});

test("7 · DETERMINISTIC — the same package yields a byte-identical queue", (t) => {
  // A flag a human acted on must be reproducible from the inputs alone, months later, from git. Two
  // SEPARATE packages, not two runs over one: a single package re-run could pass on a cached read
  // while the scan still depended on filesystem or object-key order.
  const a = freshPackage(t);
  const b = freshPackage(t);
  for (const pkg of [a, b]) shipWith(pkg, [[PRACTICE, KEY_ANSWER, "90 °C — the melting point of pure water at standard pressure."]]);
  gate(a);
  gate(b);

  assert.equal(read(a, "metadata/REVIEW_QUEUE.json"), read(b, "metadata/REVIEW_QUEUE.json"),
    "two identical packages produced different queues — a flag is not reproducible");

  // And re-running the gate over one package does not churn the artifact either.
  const once = read(a, "metadata/REVIEW_QUEUE.json");
  gate(a);
  assert.equal(read(a, "metadata/REVIEW_QUEUE.json"), once, "a second identical run rewrote the queue");
});

test("8 · backward compat — a package with NO stored index emits no queue and says 'not run'", (t) => {
  // The scan is wired INTO `semanticAudit`, which returns early when there is no stored index. The
  // wiring must not have made that path produce a `semantic` key, a queue, or a flag.
  const pkg = freshPackage(t);
  const g = gate(pkg); // no index() — the fixture ships no index, on purpose

  assert.equal("semantic" in g.json, false, "an unindexed package now emits a semantic JSON key");
  assert.equal(fs.existsSync(path.join(pkg, "metadata/REVIEW_QUEUE.json")), false, "an unindexed package emitted a queue");
  assert.match(g.report, /\*\*not run\*\*/, "the report does not say the semantic layer did not run");
  assert.match(g.report, /index:semantic/, "the report does not name the command that would run it");
});
