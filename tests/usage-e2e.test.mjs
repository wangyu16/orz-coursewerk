// USAGE tests — the only tests in this repo that run Coursewerk the way a USER runs it.
//
// WHY THIS FILE EXISTS, AND THE ONE RULE THAT FOLLOWS FROM IT.
//
// The other 440 tests import a module and hand it an input they built. That is the right way to test
// a module and it is structurally blind to the largest defect this project has found:
//
//   W1 — the semantic index NEVER RAN. Fifteen modules, ~5,000 lines, 440 green tests, and
//        `PROCEDURE.md` never invoked `index:semantic`. The artifacts never existed, so the gate's
//        semantic layer never activated. Every module was correct. The feature was dead in practice.
//
// No unit test could see it, because a unit test IMPORTS THE LIBRARY. The library was fine. The
// space between the library and the document telling the user how to run it was not. So:
//
//   THE RULE: drive the DOCUMENTED CLI, never the library.
//
// Every command below is spawned as a child process exactly as `PROCEDURE.md` spells it. Nothing in
// this file imports from `scripts/lib/`. If a test here needs a library import to pass, the test has
// stopped testing the thing. Assertions read only user-visible surfaces: exit codes, the JSON
// report, the markdown report, and `metadata/REVIEW_QUEUE.json`.
//
// A gap between the DOCS and the CODE must surface here as a FAILURE.
//
// ============================================================================================
// WHAT THIS FILE FOUND. Read this before "fixing" a red test — the red is the point.
//
// F-A (test: "2 · the clean indexed package passes its own gate")
//   `check_oer.mjs` requires `concepts/course.md` to carry a `## Keywords` section
//   (check_oer.mjs:424 — `for (const required of ["summary", "keyword"])`). BOTH
//   `format-contracts/deliverables.md` (§"`## Key terms` is the vocabulary authority — and
//   `## Keywords` is NOT a section") and `PROCEDURE.md` Stage 2 say, in bold, DO NOT emit one.
//   W2 was recorded as FIXED; the fix landed in the two documents and never reached the gate, so the
//   contradiction moved from doc↔doc to doc↔GATE and got harder to see. A package built exactly to
//   the format contract CANNOT reach criticalTotal 0. This fixture is built to the contract, so this
//   test fails. The fixture is not wrong. (`## Key terms` does not match /keyword/ — "key terms" has
//   no such substring.)
//
// F-B (tests 5, 6b — and the reason 4 passed VACUOUSLY)   [FIXED 2026-07-17; the finding is kept
//   because a lesson recorded only as a fixed test decays into a green tick nobody can read.]
//   THE REVISION LOOP WAS NOT WIRED TO ANY DOCUMENTED COMMAND. `docs/walkthrough.md` §2 promises:
//       check_oer -> fresh compute vs stored -> what moved, what it obliges -> REVIEW_QUEUE.json
//   `check_oer.mjs`'s `semanticAudit()` loaded the stored index and used it for exactly two things:
//   `.present` and `.errors`. It then computed `fresh` and ran three REFERENTIAL-INTEGRITY checks
//   (dangling anchor / refused declaration / dangling spineRef / dangling derivedFrom). It never
//   called `matchClaims`, `claimImpact` or `isAuthorizedDivergence`. Grep for their callers outside
//   `lib/` and tests: the only one was `scripts/study_pairs.mjs` — the STUDY harness, which is not a
//   workflow command. So the five fingerprints, the seven verbs and the overrides were unreachable
//   from the product: THE REVISION LOOP EXISTED TO PRODUCE THE PAPER'S NUMBERS AND NOT IN THE
//   PRODUCT. W1's exact shape one level down — W1 was "does the index run?", this was "does the
//   index DO THE THING?". The tell was test 4: a null edit cost 0 flags, but so did a WRONG one, and
//   a null edit costing nothing is not evidence when NOTHING is being compared.
//   THE FIX: `semanticAudit` now calls `revisionFindings`, which matches identity across the stored
//   and fresh indexes (M2), asks M5 what the edit reaches and what it reaches SILENTLY, threads M7's
//   per-claim authorization down as `ctx`, and routes the verbs into the queue through M10. Fenced
//   by `tests/check-oer-revision.test.mjs`. STILL DEAD, and deliberately: `planPropagation` /
//   `applyMechanical` have no product caller — see test 11, which is why it still passes vacuously.
//
// F-C (test: "12 · an override is not flagged as hallucination")
//   `lib/overrides.mjs` exports `OVERRIDES_PATH = "metadata/OVERRIDES.json"`. No product code writes
//   it, no product code reads it, and `format-contracts/deliverables.md`'s package tree does not
//   list it. There is no documented command to record an override, so a user cannot authorize a
//   divergence at all. Same no-producer family as `derivedFrom`, the spine namespace and
//   `REVIEW_QUEUE.json` (§5c) — at artifact scale, and still open.
// ============================================================================================
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

// --- the CLI, and only the CLI ---------------------------------------------------------------

/**
 * Run a documented Coursewerk command as a child process.
 *
 * `spawnSync(process.execPath, ["scripts/....mjs", ...])` — the same shape `package.json`'s scripts
 * use, so what runs here is what runs for the user. No import, no in-process shortcut: an in-process
 * call would re-import the library and quietly re-create the blind spot this file exists to close.
 */
function cli(script, args, opts = {}) {
  const res = spawnSync(process.execPath, [path.join(REPO, "scripts", script), ...args], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
    ...opts,
  });
  return { code: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function git(cwd, ...args) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

/**
 * A private, writable copy of the fixture, torn down with the test.
 *
 * mkdtemp per test, NOT a shared dir: `index_components.mjs --initialize` keeps its history in
 * `<parent>/.coursewerk/<name>-component-index-state.json` — OUTSIDE the package — and refuses to
 * reinitialize when it finds one. Two tests sharing a parent would make the second fail for a reason
 * that has nothing to do with what it is testing.
 */
function freshPackage(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-usage-"));
  const pkg = path.join(dir, "package");
  fs.cpSync(FIXTURE, pkg, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // The output root is a Git repository (PROCEDURE: "package/ and personal/ are automatically
  // initialized as independent Git repositories"). A temp repo, not this one — no repo write.
  git(pkg, "init", "-q", ".");
  git(pkg, "-c", "user.email=t@t", "-c", "user.name=t", "add", "-A");
  git(pkg, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "baseline");
  return pkg;
}

/** PROCEDURE.md Stage 4, verbatim: both indexes, in this order, both AFTER the last edit. */
function stage4(pkg) {
  const components = cli("index_components.mjs", ["--root", pkg, "--initialize"]);
  const semantic = cli("index_semantic.mjs", ["--root", pkg]);
  return { components, semantic };
}

/** PROCEDURE.md Stage 5 — the QA gate. Returns the exit code plus both user-visible reports. */
function gate(pkg, extra = []) {
  const json = path.join(pkg, "..", "qa.json");
  const report = path.join(pkg, "..", "qa_report.md");
  const res = cli("check_oer.mjs", ["--package", pkg, "--json", json, "--report", report, ...extra]);
  return {
    ...res,
    json: JSON.parse(fs.readFileSync(json, "utf8")),
    report: fs.readFileSync(report, "utf8"),
  };
}

const read = (pkg, rel) => fs.readFileSync(path.join(pkg, rel), "utf8");
const write = (pkg, rel, text) => fs.writeFileSync(path.join(pkg, rel), text);
const queueOf = (pkg) => JSON.parse(read(pkg, "metadata/REVIEW_QUEUE.json"));
const evidenceText = (q) => q.items.flatMap((i) => i.evidence).join("\n");

// =============================================================================================
// BASELINE / CONTROL — does the documented workflow produce anything at all?
// =============================================================================================

test("1 · fresh package -> index:semantic writes the three artifacts, schema-valid", (t) => {
  const pkg = freshPackage(t);

  // The artifacts are ABSENT before Stage 4 — the fixture ships no index, on purpose. A fixture with
  // a pre-baked index could not tell you whether the documented command produces one, which is W1.
  for (const rel of ["metadata/SPINE.json", "metadata/TERMS.json", "metadata/CLAIMS.json"])
    assert.equal(fs.existsSync(path.join(pkg, rel)), false, `${rel} must not exist before Stage 4`);

  const { semantic } = stage4(pkg);
  assert.equal(semantic.code, 0, `index:semantic failed: ${semantic.stderr}`);

  const spine = JSON.parse(read(pkg, "metadata/SPINE.json"));
  const terms = JSON.parse(read(pkg, "metadata/TERMS.json"));
  const claims = JSON.parse(read(pkg, "metadata/CLAIMS.json"));

  // Shape, per docs/semantic-index-interfaces.md §3.
  for (const key of ["schemaVersion", "generatedFrom", "chapters", "nodes", "edges", "prerequisites", "chapterSequence"])
    assert.ok(key in spine, `SPINE.json is missing ${key}`);
  for (const node of spine.nodes)
    for (const key of ["id", "kind", "scope", "ordinal", "label", "negative", "file"])
      assert.ok(key in node, `spine node ${node.id} is missing ${key}`);

  // The spine is the instructor's structure, so it must actually carry it — an EMPTY spine that
  // parsed cleanly is the "clean bill of health from a blind spot" the contract warns about.
  const kinds = new Set(spine.nodes.map((n) => n.kind));
  for (const kind of ["concept", "objective", "misconception", "chapter"])
    assert.ok(kinds.has(kind), `spine has no ${kind} node — the map's sections did not index`);

  assert.ok(terms.terms.length >= 2, "TERMS.json registered no vocabulary");
  assert.ok(claims.claims.length > 0, "CLAIMS.json indexed no claims");

  // A misconception is the WRONG belief. A consumer that drops `negative` enforces it as truth.
  const misconception = spine.nodes.find((n) => n.kind === "misconception");
  assert.equal(misconception.negative, true, "a misconception must be marked negative");

  // The rename hinge (§2): the old label survives as an alias, or a rename is a delete + add.
  const mp = terms.terms.find((x) => x.id === "term.melting-point");
  assert.ok(mp, "term.melting-point was not minted from ## Key terms");
  assert.ok(mp.aliases.includes("fusion point"), "the alias that makes a rename detectable is absent");
});

test("2 · the clean indexed package passes its own gate (criticalTotal == 0)", (t) => {
  const pkg = freshPackage(t);
  stage4(pkg);
  const g = gate(pkg);

  // ---------------------------------------------------------------------------------------------
  // THIS TEST FAILS. See F-A at the head of this file. Do not "fix" it by adding `## Keywords` to
  // the fixture: that is the section `format-contracts/deliverables.md` forbids in bold, and a
  // fixture edited to make the gate green would be the product grading its own homework. The gate
  // and the contract disagree about the most important artifact in the product, and the gate is the
  // one that is wrong.
  // ---------------------------------------------------------------------------------------------
  assert.deepEqual(
    g.json.formatContracts.failures,
    [],
    "a package built to format-contracts/deliverables.md must satisfy the gate's format contracts",
  );
  assert.equal(g.json.criticalTotal, 0, `clean package reported ${g.json.criticalTotal} critical issue(s)`);
  assert.equal(g.code, 0, "a clean package must exit 0");
});

test("2b · the semantic layer engages on the clean package, with burden 0", (t) => {
  const pkg = freshPackage(t);
  stage4(pkg);
  const g = gate(pkg);

  // ENGAGED — the W1 assertion. `ran` is absent, not false, for an unindexed package (the block is
  // conditional on purpose), so branch on presence.
  assert.ok(g.json.semantic, "the semantic block is absent — the layer did not engage after Stage 4");
  assert.equal(g.json.semantic.ran, true);
  assert.equal(g.json.semantic.indexErrors.length, 0);

  // It engaged on something real: all five layers have material to move (unlike the study fixture,
  // where spine/provenance are the hash of the empty set — W4).
  assert.ok(g.json.semantic.spineNodes >= 8, "the spine did not index");
  assert.ok(g.json.semantic.claims >= 10, "no claims indexed");

  // AND IT IS QUIET. A gate that flags a clean package is the alarm-fatigue failure — the one thing
  // that makes an instructor stop reading the queue, after which detection buys nothing.
  assert.equal(g.json.semantic.burden.flagCount, 0, `clean package earned ${g.json.semantic.burden.flagCount} flag(s): ${evidenceText(g.json.semantic.queue)}`);
  assert.equal(g.json.semantic.blockingFlags + g.json.semantic.reviewFlags + g.json.semantic.infoFlags, 0);
  assert.equal(g.json.semantic.burden.flagsPerArtifact, 0);

  // The queue artifact exists and is empty — M10's missing producer, now producing.
  assert.deepEqual(queueOf(pkg).items, []);
  assert.match(g.report, /review queue: \*\*0\*\* item\(s\)/);
});

test("3 · skipping index:semantic is REPORTED, and the report names the command that fixes it", (t) => {
  const pkg = freshPackage(t);
  // Stage 4 deliberately NOT run — the author skipped it, which is exactly W1's scenario.
  const g = gate(pkg);

  // W7: the author must never meet silence. Silence is indistinguishable from "there is no such
  // feature", which is this project's signature defect.
  assert.match(g.report, /Semantic index/i, "the report has no semantic section at all");
  assert.match(g.report, /\*\*not run\*\*/, "the report does not say the layer did not run");
  assert.match(g.report, /index:semantic/, "the report does not NAME the command that fixes it");

  // NEGATIVE HALF: complaining is not helping. The advisory must say what it costs, not just that a
  // thing is missing.
  assert.match(g.report, /rename cannot be detected|rephrase from a fact change/i,
    "the advisory does not say what skipping the index costs");

  // The machine surfaces stay frozen for callers that diff/pin/grep (W7's fix was scoped to the
  // human report on purpose): no `semantic` key at all, and no queue emitted.
  assert.equal("semantic" in g.json, false, "the JSON gained a semantic key for an unindexed package");
  assert.equal(fs.existsSync(path.join(pkg, "metadata/REVIEW_QUEUE.json")), false,
    "a queue was emitted for a package with no index");
});

// =============================================================================================
// RELIABILITY — is a revision consistent? (the product's #1 requirement)
// =============================================================================================

test("4 · a NULL edit (whitespace/reflow) costs ZERO flags", (t) => {
  const pkg = freshPackage(t);
  stage4(pkg);
  const before = gate(pkg);
  assert.equal(before.json.semantic.burden.flagCount, 0);

  // Reflow the melting-point paragraph: same words, different line breaks and spacing. No fact,
  // no term, no reference moves. The author fixed their line length.
  const original = read(pkg, "study-guide/melting.md");
  const reflowed = original.replace(
    "At standard pressure the melting point of pure water is 0 °C.",
    "At standard pressure the melting point\nof pure water   is 0 °C.",
  );
  assert.notEqual(reflowed, original, "the null edit did not apply — the fixture text moved");
  write(pkg, "study-guide/melting.md", reflowed);

  const after = gate(pkg);
  assert.equal(after.json.semantic.burden.flagCount, 0,
    `a whitespace edit earned ${after.json.semantic.burden.flagCount} flag(s): ${evidenceText(after.json.semantic.queue)}`);
  assert.deepEqual(queueOf(pkg).items, []);

  // Read 4 and 5 as ONE result, which is the whole reason they sit next to each other. Until F-B was
  // fixed this test passed VACUOUSLY: nothing was compared against the stored index, so a null edit
  // cost zero for the same reason a wrong edit did. Now that the comparison runs, the zero above is
  // the product's #1 requirement actually being met — and test 5 is what makes it evidence rather
  // than the absence of a signal.
});

test("5 · a REAL edit flags the related claims, INCLUDING the answer key derived from it", (t) => {
  const pkg = freshPackage(t);
  stage4(pkg);

  // The claim ids the stored index minted, and the authored derivation between them. This is the
  // package's own artifact, not an internal: `metadata/claims/practice/melting.json` declares
  // `derivedFrom: [<the melting-point fact>]`, and CLAIMS.json shows the edge was honoured.
  const stored = JSON.parse(read(pkg, "metadata/CLAIMS.json"));
  const fact = stored.claims.find((c) => c.locations[0].file === "study-guide/melting.md" && c.locations[0].anchor === "melting-point-of-pure-water#1");
  const key = stored.claims.find((c) => c.locations[0].file === "practice/melting.md" && c.locations[0].anchor === "practice-melting#2");
  assert.ok(fact && key, "the fixture's declared fact/answer-key pair did not index");
  assert.deepEqual(key.derivedFrom, [fact.id], "the authored derivation edge is not in the index");

  // Now change the VALUE. 0 °C -> 4 °C is a fact change: `content` must move, and everything the
  // author declared as depending on it must be re-checked. The answer key in practice/ says "0 °C"
  // and is now WRONG — this is the case the whole layer exists for.
  write(pkg, "study-guide/melting.md",
    read(pkg, "study-guide/melting.md").replace(
      "At standard pressure the melting point of pure water is 0 °C.",
      "At standard pressure the melting point of pure water is 4 °C.",
    ));

  const g = gate(pkg);

  // ---------------------------------------------------------------------------------------------
  // The most important assertion in this file, and it was the headline failure until F-B was fixed:
  // `check_oer.mjs` never diffed fresh against stored, so the value change moved `content` and
  // nothing computed it, and the answer key's declared derivation sat in the index and was never
  // traversed. The instructor shipped a practice sheet whose answer contradicted the study guide,
  // and the queue was empty. Do not weaken this assertion — an empty queue here IS the defect.
  // ---------------------------------------------------------------------------------------------
  assert.ok(g.json.semantic.burden.flagCount > 0,
    "a value change (0 °C -> 4 °C) produced ZERO flags: check_oer.mjs never compares the fresh compute against the stored index, so no fingerprint layer is ever evaluated (F-B)");

  const evidence = evidenceText(queueOf(pkg));
  assert.match(evidence, new RegExp(fact.id.replace(/\./g, "\\.")), "the edited fact was not flagged");
  assert.match(evidence, new RegExp(key.id.replace(/\./g, "\\.")),
    "the answer key DERIVED FROM the edited fact was not flagged — the authored derivation did not propagate");
});

test("6a · a RENAME holds every claim id (the ids survive the migration)", (t) => {
  const pkg = freshPackage(t);
  stage4(pkg);
  const idsBefore = JSON.parse(read(pkg, "metadata/CLAIMS.json")).claims.map((c) => c.id).sort();
  const termsBefore = JSON.parse(read(pkg, "metadata/TERMS.json")).terms.map((x) => x.id).sort();

  // The IUPAC migration case: the instructor adopts "fusion point" as the preferred label and DEMOTES
  // "melting point" to an alias. Per §2 the old label must never be deleted — that overlap is the
  // hinge that makes this a rename rather than a delete + add.
  const map = read(pkg, "concepts/melting.md");
  const renamed = map.replace(
    "- **melting point** (fusion point, aliases: melting temperature) —",
    "- **fusion point** (melting point, aliases: melting temperature) —",
  );
  assert.notEqual(renamed, map, "the rename did not apply — the fixture's Key terms line moved");
  write(pkg, "concepts/melting.md", renamed);
  write(pkg, "concepts/course.md", read(pkg, "concepts/course.md").replace(
    "- **melting point** (fusion point) —",
    "- **fusion point** (melting point) —",
  ));

  // Re-accept the baseline, as PROCEDURE Stage 4 says to after an edit.
  const re = cli("index_semantic.mjs", ["--root", pkg]);
  assert.equal(re.code, 0, `reindex failed: ${re.stderr}`);

  const terms = JSON.parse(read(pkg, "metadata/TERMS.json"));
  const mp = terms.terms.find((x) => x.id === "term.melting-point");

  // The id is MINTED ONCE and never re-minted (§2). It is now a historical artifact carrying the new
  // preferred label — that is correct for an identity key, and it is what keeps claim ids stable.
  assert.ok(mp, "term.melting-point was re-minted on rename — the registry lost the term's identity");
  assert.equal(mp.preferredLabel, "fusion point", "the rename did not take");
  assert.ok(mp.aliases.includes("melting point"), "the old label was not kept as an alias");
  assert.deepEqual(terms.terms.map((x) => x.id).sort(), termsBefore, "the term id space moved on a rename");

  // FIRST HALF: the ids HOLD. `identityLabel` hashes sorted term IDS, which did not move.
  assert.deepEqual(
    JSON.parse(read(pkg, "metadata/CLAIMS.json")).claims.map((c) => c.id).sort(),
    idsBefore,
    "a rename changed claim ids — the terminology migration this feature exists for is broken",
  );
});

test("6b · a RENAME is OBSERVABLE (the other half — a silent rename is not a fix)", (t) => {
  const pkg = freshPackage(t);
  stage4(pkg);

  write(pkg, "concepts/melting.md", read(pkg, "concepts/melting.md").replace(
    "- **melting point** (fusion point, aliases: melting temperature) —",
    "- **fusion point** (melting point, aliases: melting temperature) —",
  ));
  write(pkg, "concepts/course.md", read(pkg, "concepts/course.md").replace(
    "- **melting point** (fusion point) —",
    "- **fusion point** (melting point) —",
  ));

  const g = gate(pkg);

  // ---------------------------------------------------------------------------------------------
  // Holding the ids (6a) is only half a fix, and this is the other half. Until F-B was fixed, the
  // instructor could rename the vocabulary of their own course, every deliverable would still say
  // "melting point", and the gate said nothing. The `label` fingerprint exists precisely so a rename
  // is OBSERVABLE (§5: it hashes termId + preferredLabel so that it MOVES on rename, deliberately,
  // where `identityLabel` does not) — but nothing computed it from any documented command, so the
  // migration was invisible: the exact scenario §2 called "the scenario this feature exists for".
  // ---------------------------------------------------------------------------------------------
  assert.ok(g.json.semantic.burden.flagCount > 0,
    "renaming a term the whole package uses produced ZERO flags — the rename is invisible to the author (F-B)");
  assert.match(evidenceText(queueOf(pkg)), /fusion point|melting point|rename/i,
    "the queue does not mention the renamed term");
});

test("7 · determinism — two identical runs produce a byte-identical queue", (t) => {
  const pkg = freshPackage(t);
  stage4(pkg);

  gate(pkg);
  const first = read(pkg, "metadata/REVIEW_QUEUE.json");
  gate(pkg);
  const second = read(pkg, "metadata/REVIEW_QUEUE.json");

  // Byte-identical, not deep-equal: a flag a human acted on must be regenerable from git months
  // later, and "same object, different bytes" does not survive a diff.
  assert.equal(second, first, "two runs over identical bytes produced different queues");

  // And it holds where it MATTERS — over a package that actually has findings. A determinism claim
  // proved only on an empty queue proves the serializer, not the pipeline.
  write(pkg, "metadata/claims/study-guide/melting.json", JSON.stringify({
    schemaVersion: 1,
    claims: [
      { type: "fact", anchor: "melting-point-of-pure-water#1", spineRefs: ["concept.melting.404"], sourceRefs: [], termRefs: ["term.melting-point"] },
      { type: "fact", anchor: "no-such-heading#7", spineRefs: ["objective.melting.1"], sourceRefs: [] },
    ],
  }, null, 2));
  cli("index_semantic.mjs", ["--root", pkg]);

  gate(pkg);
  const dirtyFirst = read(pkg, "metadata/REVIEW_QUEUE.json");
  gate(pkg);
  const dirtySecond = read(pkg, "metadata/REVIEW_QUEUE.json");
  assert.ok(JSON.parse(dirtyFirst).items.length > 0, "the planted defects produced no findings to be deterministic about");
  assert.equal(dirtySecond, dirtyFirst, "two runs over a package WITH findings produced different queues");
});

test("8 · the emitted REVIEW_QUEUE.json does not make the package fail its own next gate run", (t) => {
  const pkg = freshPackage(t);
  stage4(pkg);

  const first = gate(pkg);
  assert.ok(fs.existsSync(path.join(pkg, "metadata/REVIEW_QUEUE.json")), "the gate emitted no queue");

  // The gate WRITES an artifact into the package it is checking. That artifact must not then be
  // reported as an uncommitted/unindexed component — a checker whose own output fails the next check
  // is a checker nobody can run twice.
  const second = gate(pkg);
  assert.deepEqual(second.json.coherence.hardFailures, [],
    `the emitted queue tripped the coherence gate: ${second.json.coherence.hardFailures.join("; ")}`);
  assert.equal(second.json.criticalTotal, first.json.criticalTotal,
    "the second gate run reported a different critical count than the first — the gate's own output changed the verdict");

  // It committed its own artifact — which is what stops `auditCoherence`'s unfiltered git loop from
  // reporting `Git ??` on the gate's own output.
  assert.equal(first.json.semantic.emitted.path, "metadata/REVIEW_QUEUE.json");
  assert.equal(first.json.semantic.emitted.committed, true, "the gate emitted the queue but did not commit it");
  // The second run commits NOTHING: same package, byte-identical queue, nothing to record. That is
  // correct and is worth pinning — a checker that manufactures an empty commit on every run would
  // rewrite the author's history for saying nothing.
  assert.equal(second.json.semantic.emitted.committed, false, "a re-run with an unchanged queue created a commit anyway");

  // ONLY its own artifact. A checker that swept the author's work-in-progress into a commit they
  // never reviewed is a CONSENT failure, which is worse than a correctness one: the tool you ran to
  // CHECK your work rewrote your history.
  const wip = "study-guide/melting.md";
  write(pkg, wip, read(pkg, wip) + "\n<!-- an author's uncommitted work in progress -->\n");
  gate(pkg);
  const status = git(pkg, "status", "--porcelain", "--", wip).stdout;
  assert.match(status, /^\s*M/, "the gate committed the author's work-in-progress along with its own queue");
});

// =============================================================================================
// TRUST — detection becomes recovery only if it reaches the human
// =============================================================================================

test("9 · a dangling spineRef is flagged, and the message NAMES the offending ref", (t) => {
  const pkg = freshPackage(t);

  // NEGATIVE HALF FIRST: the clean fixture's spineRefs all resolve, and it is silent.
  stage4(pkg);
  assert.equal(gate(pkg).json.semantic.burden.flagCount, 0, "the clean package flagged a dangling ref it does not have");

  // Plant one, in the two places §5b assigns to the gate: a CLAIM's parent, and a TERM's bracket.
  write(pkg, "metadata/claims/study-guide/melting.json", JSON.stringify({
    schemaVersion: 1,
    claims: [{ type: "fact", anchor: "melting-point-of-pure-water#1", spineRefs: ["concept.melting.999"], sourceRefs: ["src.synthetic.handbook.rev1"], termRefs: ["term.melting-point"] }],
  }, null, 2));
  write(pkg, "concepts/melting.md", read(pkg, "concepts/melting.md").replace(
    "[concept.melting.2]", "[concept.melting.87]",
  ));
  cli("index_semantic.mjs", ["--root", pkg]);

  const g = gate(pkg);
  const q = queueOf(pkg);
  assert.ok(g.json.semantic.burden.flagCount > 0, "a dangling spineRef produced no flag");

  const dangling = q.items.filter((i) => i.kind === "dangling-reference");
  assert.ok(dangling.length > 0, `no dangling-reference item; got kinds: ${q.items.map((i) => i.kind).join(", ")}`);

  const evidence = evidenceText(q);
  // NAMING THE REF IS THE POINT. "Something is wrong" is a flag; "concept.melting.999 does not
  // exist" is a fix. A message that fails to name the offender sends the author hunting.
  assert.match(evidence, /concept\.melting\.999/, "the claim's dangling ref is not named in the message");
  assert.match(evidence, /concept\.melting\.87/, "the term's dangling bracket is not named in the message");

  // The two are different repairs in different files and must not be folded into one message.
  assert.match(evidence, /Key terms/, "the term-side finding does not tell the author which section to fix");

  // Detector kinds survive the fold into the decision-level queue kind (§5c, M6/M10).
  assert.ok(dangling.some((i) => (i.detectorKinds ?? []).includes("dangling-spine-ref")),
    "the detector kind was destroyed by the fold into `dangling-reference`");
});

test("10 · a MALFORMED declaration is refused AND reported — as malformed, not as undeclared", (t) => {
  const pkg = freshPackage(t);

  // NEGATIVE HALF: the well-formed fixture is silent.
  stage4(pkg);
  assert.equal(gate(pkg).json.semantic.burden.flagCount, 0);

  // The exact mistake the contract calls out: a single ref written as a STRING instead of a list.
  // It is the one an author makes while TRYING to declare — which is why the message matters.
  write(pkg, "metadata/claims/study-guide/melting.json", JSON.stringify({
    schemaVersion: 1,
    claims: [
      { type: "fact", anchor: "melting-point-of-pure-water#1", spineRefs: "objective.melting.1", sourceRefs: [], termRefs: ["term.melting-point"] },
      { type: "invented-type", anchor: "latent-heat-of-fusion#1", spineRefs: ["concept.melting.2"] },
      { type: "fact", anchor: "what-the-source-says#1", spineRefs: ["objective.melting.1"], sourceRefs: ["src.synthetic.handbook.rev1"], termRefs: ["term.melting-point"] },
    ],
  }, null, 2));
  cli("index_semantic.mjs", ["--root", pkg]);

  const g = gate(pkg);
  const q = queueOf(pkg);
  assert.ok(g.json.semantic.burden.flagCount > 0, "a malformed declaration produced no flag at all — the author is told nothing");

  const refused = q.items.filter((i) => i.kind === "declaration-refused");
  assert.ok(refused.length >= 2, `expected both bad entries to be reported; got ${refused.length}`);

  const evidence = evidenceText(q);
  // THE WHOLE POINT: the author who TRIED must be told their declaration was malformed. The warning
  // they would otherwise get — "this claim is undeclared" — names the wrong problem entirely.
  assert.match(evidence, /REFUSED/, "the refusal is not reported as a refusal");
  assert.match(evidence, /MALFORMED/i, "the message does not tell the author the declaration was malformed");
  assert.match(evidence, /list of non-empty strings|wrap a single ref in a list/i,
    "the message does not say what was wrong with spineRefs");
  assert.match(evidence, /invented-type/, "the closed-enum refusal does not name the type that was refused");

  // A closed enum must REFUSE, never coerce to the nearest member — coercion asserts a type nobody
  // chose. The refused entry must not appear as an honoured claim of some other type.
  const claims = JSON.parse(read(pkg, "metadata/CLAIMS.json")).claims;
  const coerced = claims.find((c) => c.locations[0].file === "study-guide/melting.md" && c.locations[0].anchor === "latent-heat-of-fusion#1" && c.spineRefs.length > 0);
  assert.equal(coerced, undefined, "a refused entry was coerced into an honoured claim");

  // ONE BAD ENTRY IS NOT A FILE-WIDE VETO: the well-formed neighbour still stands.
  const survivor = claims.find((c) => c.locations[0].file === "study-guide/melting.md" && c.locations[0].anchor === "what-the-source-says#1");
  assert.ok(survivor, "a refused sibling took down a well-formed declaration");
  assert.deepEqual(survivor.spineRefs, ["objective.melting.1"], "the surviving declaration lost its parent");
});

test("11 · an edit is never auto-applied inside a direct QUOTATION", (t) => {
  const pkg = freshPackage(t);
  stage4(pkg);

  // The quotation carries a QUANTITY, so it is a claim and something can target it. (The study
  // fixture's quote carries no quantity, so nothing ever targets it and this branch never fires —
  // a known gap this fixture exists not to repeat.)
  const QUOTE = '"the melting point of pure water at standard pressure is 0 °C"';
  const stored = JSON.parse(read(pkg, "metadata/CLAIMS.json"));
  const quoted = stored.claims.find((c) => c.locations[0].file === "study-guide/melting.md" && c.locations[0].anchor === "what-the-source-says#1");
  assert.ok(quoted, "the quotation did not index as a claim — nothing would ever target it");
  assert.ok(read(pkg, "study-guide/melting.md").includes(QUOTE), "the fixture's quotation moved");

  // Drive the case that would rewrite it: rename the term the quote uses, then change the value the
  // quote states. If ANY documented command auto-applies a mechanical edit, the quote is its target.
  write(pkg, "concepts/melting.md", read(pkg, "concepts/melting.md").replace(
    "- **melting point** (fusion point, aliases: melting temperature) —",
    "- **fusion point** (melting point, aliases: melting temperature) —",
  ));
  write(pkg, "study-guide/melting.md", read(pkg, "study-guide/melting.md").replace(
    "At standard pressure the melting point of pure water is 0 °C.",
    "At standard pressure the melting point of pure water is 4 °C.",
  ));
  cli("index_semantic.mjs", ["--root", pkg]);
  cli("revision_impact.mjs", ["--root", pkg, "--json", path.join(pkg, "..", "ri.json"), "--report", path.join(pkg, "..", "ri.md")]);
  gate(pkg);

  // Rewriting the inside of a quotation FABRICATES A QUOTATION. It is the highest-stakes edit in the
  // system, and the answer must be "no" no matter which documented command ran.
  assert.ok(read(pkg, "study-guide/melting.md").includes(QUOTE),
    "a documented command rewrote the inside of a direct quotation — this fabricates a quotation");

  // HONEST NOTE: this passes VACUOUSLY. No documented command auto-applies anything (F-B):
  // `applyMechanical` is reachable only from `scripts/study_pairs.mjs`. The guard is never asked the
  // question, so this asserts that the danger is absent, NOT that the guard works. The guard is
  // covered by tests/propagate.test.mjs at the module level; it has no product caller to cover.
});

test("12 · a knowledge update beyond the source is not flagged as hallucination", (t) => {
  const pkg = freshPackage(t);
  stage4(pkg);

  // The instructor knowingly diverges from the source: the synthetic handbook says 0 °C; they teach
  // 273.15 K as the primary value and say why. This is AUTHORIZED divergence, not a hallucination,
  // and §10 decision 2's ask-once rule says the system must ask at most once and never re-nag.
  write(pkg, "study-guide/melting.md", read(pkg, "study-guide/melting.md").replace(
    "At standard pressure the melting point of pure water is 0 °C.",
    "At standard pressure the melting point of pure water is 273.15 K, which this course states in kelvin because every later chapter uses absolute temperature.",
  ));

  // F-C IS FIXED: `scripts/record_override.mjs` is the producer that OVERRIDES_PATH never had.
  // This still asserts the DOCUMENTED command exists, not a library call — the whole point of this
  // file is that a feature reachable only from `lib/` is a feature the user does not have.
  const scripts = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8")).scripts;
  const recorder = Object.entries(scripts).find(([, cmd]) => /override/i.test(cmd));
  assert.ok(recorder,
    "no documented command records an authorized divergence: OVERRIDES_PATH ('metadata/OVERRIDES.json') has no producer, so an instructor cannot authorize a divergence (F-C)");

  // Record it through the CLI, exactly as an instructor would.
  const claims = JSON.parse(read(pkg, "metadata/CLAIMS.json")).claims;
  const seed = claims.find((c) => c.locations[0].file === "study-guide/melting.md" && /melting point/i.test(c.text));
  assert.ok(seed, "the fixture's melting-point fact did not index");
  const rec = spawnSync(process.execPath, [
    path.join(REPO, "scripts", "record_override.mjs"), "--root", pkg,
    "--claim-id", seed.id, "--diverges-from", "source-1", "--basis", "instructor-expertise",
    "--rationale", "Teach 273.15 K as the primary value; the handbook's 0 °C is the same value in other units.",
    "--authorized-by", "Dr Fixture", "--date", "2026-07-17",
  ], { encoding: "utf8" });
  assert.equal(rec.status, 0, `the recorder failed: ${rec.stderr}`);

  const g = gate(pkg);
  const evidence = evidenceText(queueOf(pkg));

  // ---------------------------------------------------------------------------------------------
  // WHAT SPEC §7 ACTUALLY REQUIRES: "knowledge update beyond the source -> NOT flagged as
  // HALLUCINATION." This is the assertion, and it is unchanged.
  // ---------------------------------------------------------------------------------------------
  assert.doesNotMatch(evidence, /hallucination|unsupported/i,
    "an authorized divergence was reported as a hallucination");

  // ---------------------------------------------------------------------------------------------
  // THE `flagCount === 0` ASSERTION WAS REMOVED — deliberately, and it is NOT a weakening.
  //
  // It over-read the spec. §7 says "not flagged AS HALLUCINATION", not "not flagged at all", and
  // §10 dec. 2's ask-once rule governs ASKING WHETHER THE DIVERGENCE IS LEGITIMATE — a question M7's
  // `needsAsk` answers false forever after recording. It says nothing about the claim's dependents.
  //
  // An override authorizes divergence FROM THE SOURCE. It does not make everything downstream
  // correct. Here the instructor teaches 273.15 K; the answer keys still say 0 °C and are still
  // wrong. **An override that silenced its dependents would authorize the package into an internal
  // contradiction — worse than the flag it removed**, and it would ship a practice sheet that
  // contradicts the study guide with a clean bill of health. `scripts/study_pairs.mjs` preregistered
  // exactly this before the behaviour existed (`real-value-change-authorized`), and a preregistered
  // expectation outranks a later assertion written against an unbuilt feature.
  //
  // What the override MUST change is the flag's CHARACTER: an accusation becomes a revision to sign
  // off. That is what is asserted below — the honest, checkable version of "don't re-nag me".
  // ---------------------------------------------------------------------------------------------
  const items = queueOf(pkg).items;
  const seedItem = items.find((i) => (i.claimIds || []).includes(seed.id));
  assert.ok(seedItem, "the overridden claim vanished from the queue entirely — silence is not the contract");
  assert.notEqual(seedItem.kind, "suspected-error",
    "an AUTHORIZED divergence is still being accused: the override changes the QUESTION from 'is this an error?' to 'sign off this rewrite'");
  assert.equal(seedItem.severity, "review",
    "an authorized divergence must not block; it is a decision already made");
  assert.ok(g.json.semantic.burden.flagCount > 0,
    "the dependents were silenced by an override that does not authorize them — that authorizes an internal contradiction");
});

test("13 · a DROPPED objective is caught — the instructor's map is a CHECKED promise, not a hope", (t) => {
  const pkg = freshPackage(t);

  // W12, at the CLI, from the user's side. The instructor writes a third objective into their own
  // map and the package teaches it nowhere — the exact scenario an agent silently dropping an
  // objective produces. This probe used to yield `criticalTotal: 0`, burden 0: SILENCE. CONTROL
  // ("the instructor decides what is taught") was enforced by GENERATION — the agent is TOLD to
  // build from the spine — and never by VERIFICATION. A property enforced only by the good behavior
  // of the thing being checked is not a checked property, and relying on that obedience is the very
  // thing this harness exists because you cannot do.
  write(pkg, "concepts/melting.md", read(pkg, "concepts/melting.md").replace(
    "2. Explain why the temperature stays constant while a pure solid melts.\n",
    "2. Explain why the temperature stays constant while a pure solid melts.\n3. Derive the Clausius–Clapeyron relation for the solid–liquid boundary.\n",
  ));
  stage4(pkg);
  const g = gate(pkg);
  const queue = queueOf(pkg);

  const flags = queue.items.filter((i) => i.kind === "missing-coverage");
  assert.equal(flags.length, 1,
    `the instructor's own map promises an objective the package never teaches, and the gate said nothing (W12). Queue: ${evidenceText(queue)}`);
  const text = flags[0].evidence.join("\n");
  assert.match(text, /objective\.melting\.3/, "the flag does not name the objective");
  assert.match(text, /Clausius–Clapeyron/, "the flag does not quote what the instructor actually wrote");

  // Coverage is MEASURED alongside the flag, with its denominators — information, not an accusation.
  assert.deepEqual(g.json.semantic.coverage.objectives, { covered: 2, total: 3 });
  assert.match(g.report, /coverage \(a FLOOR, not a score\)/);

  // The instructor SEES it: a `review` item, in the report, in the queue artifact.
  assert.equal(flags[0].severity, "review");
  assert.match(g.report, /REVIEW missing-coverage/);
});

test("14 · a SELF-CONTRADICTING package is caught — TRUST layer 3, at the CLI, with no declared edge", (t) => {
  const pkg = freshPackage(t);

  // W-M6, from the user's side. `docs/reliability_recovery_design.md` §5.3 lists internal
  // cross-artifact consistency as TRUST LAYER 3 — one of the only two layers that catch a KNOWLEDGE
  // error rather than a referential one. `scripts/lib/consistency.mjs` was built, tested (20 tests)
  // and mutation-covered, and `grep -c scanConsistency scripts/check_oer.mjs` was 0: NO PRODUCT
  // CALLER, in `lib/` and its own unit tests and nowhere else. So this probe — the study guide says
  // one thing, the package's own answer key says another — yielded burden 0: SILENCE. The same shape
  // as F-B one layer over, and one rung WORSE: F-B's loop at least ran in the study harness, and
  // `scripts/study_pairs.mjs` does not call M6 either.
  //
  // The contradiction is planted BEFORE Stage 4, so the package is indexed already at war with
  // itself and NOTHING MOVED: the revision layer is silent by construction, no declared edge links
  // the two artifacts, and every other check is green. This is the undeclared-edge case, and the
  // edge nobody declared is by definition the edge nobody notices is missing. The only casualty is
  // a student who answers correctly and is marked wrong.
  write(pkg, "practice/melting.md", read(pkg, "practice/melting.md").replace(
    "0 °C — the melting point of pure water at standard pressure.",
    "90 °C — the melting point of pure water at standard pressure.",
  ));
  stage4(pkg);
  const g = gate(pkg);
  const queue = queueOf(pkg);

  const flags = queue.items.filter((i) => i.kind === "internal-inconsistency");
  assert.equal(flags.length, 1,
    `the package's own answer key contradicts its own study guide, and the gate said nothing. Queue: ${evidenceText(queue)}`);

  // The instructor is a person who will not open the code and may be three semesters late to the
  // conversation. This is a DETECTOR — it never adjudicates which number is right — so the message
  // has to hand them BOTH sides and the files to open.
  const text = flags[0].evidence.join("\n");
  for (const needle of ["study-guide/melting.md", "practice/melting.md", "0 °C", "90 °C"])
    assert.ok(text.includes(needle), `the flag does not name ${JSON.stringify(needle)}:\n${text}`);
  assert.deepEqual(flags[0].detectorKinds, ["value-disagreement"], "the observation was destroyed by the fold to the queue kind");

  // It reached the human on every surface, and it BLOCKS at release — a student meets a
  // contradiction, which is M10's own definition of blocking.
  assert.equal(flags[0].severity, "blocking");
  assert.match(g.report, /BLOCKING internal-inconsistency/);
  assert.ok(gate(pkg, ["--for-discovery"]).json.criticalTotal > 0,
    "a package that contradicts itself can still be published");
});
