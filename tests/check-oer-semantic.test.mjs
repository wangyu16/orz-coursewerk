// M11 GATE tests — written as a defense of the WIRE, and of the SILENCE it breaks.
//
// Two properties matter more than the rest, and the order reflects it.
//
// FIRST, THE GATE MUST BE SILENT ON A CLEAN PACKAGE. A gate that flags the golden fixture is the
// alarm-fatigue failure, and it is not a nuisance — it is fatal twice over. An instructor buried
// in flags stops opening the queue, and then the mechanism protects nobody, INCLUDING on the flag
// that mattered; and `burden.flagsPerArtifact` is a study metric, so a false flag poisons the
// number the manuscript reports. So every one of the five checks is asserted to fire on a real
// planted defect AND to stay silent on the untouched fixture. Recall without precision is not a
// weaker result here; it is a worthless one.
//
// SECOND, THE FIVE CHECKS ARE ONE SHAPE: IT LOOKS HONOURED AND ISN'T. Each test plants the
// assertion an author would actually write — a declared anchor, a `[concept.x]` bracket, a
// `derivedFrom`, a malformed declaration — and proves the system stops being silent about it.
// Before this module every one of them passed every check while doing nothing at all.
//
// Each check's message is asserted to name its SPECIFIC problem, and no two may share a message:
// a reason that fits two defects sends the author to the wrong field, which is the failure the
// refusal-vs-absence row exists to fix, reintroduced one level up.
//
// THE BACKWARD-COMPAT PROOF IS A REAL DIFF AGAINST THE PRISTINE BASELINE (`git show HEAD:`), not
// an assertion that a count is zero. `check_oer.mjs` is live and its tests are green; "additive"
// has to mean a package with no semantic artifacts produces byte-identical JSON, report AND
// stdout — otherwise "additive" quietly means "different".
//
// And the queue proof is EMPIRICAL, the way M14 did it: the package carrying its own emitted queue
// survives the REAL coherence audit. A set-membership assertion would only restate the code.
//
// Free, deterministic, no network. The golden fixture is READ-ONLY: every mutation runs against a
// fresh mkdtemp copy, cleaned up after.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditCoherence, computeComponentGraph, makeComponentIndex, recordAcceptedCoherence, writeComponentIndex } from "../scripts/lib/coherence.mjs";
import { commitOutput, ensureOutputGit } from "../scripts/lib/output_git.mjs";
import { REVIEW_QUEUE_PATH } from "../scripts/lib/escalation.mjs";
import { artifactAnchors } from "../scripts/lib/claims.mjs";
import { acceptBaseline } from "./helpers/baseline.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(repo, "tests/fixtures/mini-package");
const CHECK = path.join(repo, "scripts/check_oer.mjs");
const REINDEX = path.join(repo, "scripts/index_semantic.mjs");
const SIDECAR = "metadata/claims/study-guide/phase-change.json";

const temps = [];
test.after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

function tempPackage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-m11-"));
  temps.push(dir);
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

const readPkg = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
function writePkg(root, rel, text) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof text === "string" ? text : JSON.stringify(text, null, 2));
}

/** Declare claims through the real sidecar carrier — the one the index actually reads. */
const declare = (root, claims) => writePkg(root, SIDECAR, { schemaVersion: 1, claims });

/** The package as an INDEXED package: without a stored index the layer is off by design. */
function reindex(root) {
  // First baseline: the CLI directly. Any later re-baseline goes through the documented decision
  // sheet (option 1, 2026-09-06): gate → queue:review → index:semantic --review.
  const stored = fs.existsSync(path.join(root, "metadata", "CLAIMS.json"));
  if (!stored) {
    const run = spawnSync(process.execPath, [REINDEX, "--root", root, "--no-commit"], { encoding: "utf8" });
    assert.equal(run.status, 0, `reindex failed: ${run.stdout}\n${run.stderr}`);
    return root;
  }
  const { accept } = acceptBaseline(repo, root, { acceptArgs: ["--no-commit"] });
  assert.equal(accept.code, 0, `re-baseline failed: ${accept.stdout}\n${accept.stderr}`);
  return root;
}

/** Run the REAL gate and return its `--json` blob. */
function check(root, extra = []) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cw-m11-out-")), "r.json");
  temps.push(path.dirname(out));
  const run = spawnSync(process.execPath, [CHECK, "--package", root, "--json", out, ...extra], { encoding: "utf8" });
  assert.ok(fs.existsSync(out), `check_oer wrote no json: ${run.stdout}\n${run.stderr}`);
  return JSON.parse(fs.readFileSync(out, "utf8"));
}

/** The semantic block of a freshly-indexed package carrying `claims` as declarations. */
function gateOn(mutate = () => {}) {
  const root = tempPackage();
  mutate(root);
  reindex(root);
  return { root, semantic: check(root).semantic };
}

/** Every evidence line in the queue, flattened — what the author actually reads. */
const allEvidence = (semantic) => semantic.queue.items.flatMap((i) => i.evidence);

function acceptCoherentState(root, message = "test: accept coherent state") {
  ensureOutputGit(root);
  const index = makeComponentIndex(computeComponentGraph(root));
  writeComponentIndex(root, index);
  const commit = commitOutput(root, message);
  recordAcceptedCoherence(root, index, commit.head, { action: "test" });
  return commit.head;
}

// =====================================================================================
// THE PRECISION PROOF — the clean package, and the number the study reports
// =====================================================================================

test("CLEAN GOLDEN FIXTURE: all five checks are SILENT — zero flags, zero burden", () => {
  const { semantic } = gateOn();

  assert.equal(semantic.ran, true, "the layer must engage on an indexed package");
  assert.deepEqual(semantic.indexErrors, []);
  // THE ALARM-FATIGUE ASSERTION. Not "few flags" — ZERO. The fixture declares nothing malformed,
  // brackets nothing that does not exist, and derives nothing from a ghost, so a single flag here
  // would be the gate inventing work for an instructor and corrupting `flagsPerArtifact`.
  assert.equal(semantic.detectorFindings, 0, "no detector may fire on a clean package");
  assert.deepEqual(semantic.queue.items, [], "the clean queue is empty");
  assert.equal(semantic.burden.flagCount, 0);
  assert.equal(semantic.burden.flagsPerArtifact, 0);
  // The denominator is real: burden is measured over a package that HAS a reviewable surface, so
  // the zero is precision and not an empty package trivially burdening nobody.
  assert.ok(semantic.burden.artifactCount > 0, "the fixture must have artifacts to burden");
  assert.ok(semantic.claims > 0 && semantic.spineNodes > 0 && semantic.terms > 0, "…and a real index");
});

test("CLEAN GOLDEN FIXTURE: the gate adds nothing release-blocking", () => {
  const root = reindex(tempPackage());
  const r = check(root, ["--for-discovery"]);
  // Even at the release bar, a clean package's semantic layer contributes zero critical issues.
  assert.equal(r.criticalCounts.semanticIndexErrors, 0);
  assert.equal(r.criticalCounts.semanticReviewFlags, 0);
  assert.equal(r.discoverability.blockers.filter((b) => /semantic/.test(b)).length, 0);
});

// =====================================================================================
// THE FIVE CHECKS — each fires on a real planted defect
// =====================================================================================

test("CHECK 1 — a DANGLING DECLARED ANCHOR is flagged, not silently unindexed", () => {
  const { semantic } = gateOn((root) =>
    declare(root, [{ type: "fact", anchor: "no-such-block#7", spineRefs: ["concept.phase-change.1"], sourceRefs: [] }]),
  );

  const items = semantic.queue.items.filter((i) => i.detectorKinds.includes("dangling-anchor"));
  assert.equal(items.length, 1, "exactly one flag for one dangling anchor");
  assert.equal(items[0].kind, "dangling-reference", "the QUESTION is 'this points at nothing'");
  assert.equal(items[0].severity, "review");
  const [msg] = items[0].evidence;
  assert.match(msg, /no-such-block#7/, "the message names the anchor that failed");
  assert.match(msg, /study-guide\/phase-change\.md/, "…and the artifact it failed in");
  assert.match(msg, /NOTHING was indexed/i, "…and the consequence: the declaration looks honoured and isn't");
  // A flag you cannot act on is a flag you will not act on: the message must carry the anchors the
  // artifact DOES have, which is the difference between "something is wrong" and a fix.
  assert.match(msg, /melting-point-of-water#1/, "the message names the real anchors to choose from");

  // THE NEGATIVE: the same declaration at an anchor that EXISTS raises nothing.
  const ok = gateOn((root) =>
    declare(root, [{ type: "fact", anchor: "melting-point-of-water#1", spineRefs: ["concept.phase-change.1"], sourceRefs: [] }]),
  );
  assert.equal(ok.semantic.queue.items.length, 0, "a resolvable anchor is not a finding");
});

test("CHECK 2 — a TERM's dangling [concept.x] bracket is flagged (it looks authorized)", () => {
  const { semantic } = gateOn((root) =>
    writePkg(root, "concepts/phase-change.md", readPkg(root, "concepts/phase-change.md").replace(
      "- **latent heat** — energy absorbed during a phase change",
      "- **latent heat** — energy absorbed during a phase change [concept.phase-change.99]",
    )),
  );

  const items = semantic.queue.items.filter((i) => i.detectorKinds.includes("dangling-spine-ref") && !i.claimIds);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "dangling-reference");
  const [msg] = items[0].evidence;
  assert.match(msg, /Key terms/, "the message sends the author to the section that is wrong");
  assert.match(msg, /term\.latent-heat/, "…names the term");
  assert.match(msg, /concept\.phase-change\.99/, "…and the target that does not exist");
  assert.match(msg, /LOOKS placed/i, "…and why a parsing bracket is still a defect");

  // THE NEGATIVE, AND IT IS THE IMPORTANT ONE: an ABSENT spineRef is honest (§1 makes the bracket
  // optional so nobody has to guess) and must NEVER be flagged — the clean fixture's Key terms
  // carry no brackets at all, and flagging that would push authors into the very fabrication the
  // rule exists to prevent.
  const clean = gateOn();
  assert.equal(clean.semantic.queue.items.length, 0, "no bracket is not a dangling bracket");

  // …and a bracket that RESOLVES is equally silent.
  const ok = gateOn((root) =>
    writePkg(root, "concepts/phase-change.md", readPkg(root, "concepts/phase-change.md").replace(
      "- **latent heat** — energy absorbed during a phase change",
      "- **latent heat** — energy absorbed during a phase change [concept.phase-change.2]",
    )),
  );
  assert.equal(ok.semantic.queue.items.length, 0, "a resolvable bracket is not a finding");
});

test("CHECK 3 — a CLAIM's dangling spineRef is flagged ('no parent' ≠ 'parent does not exist')", () => {
  const { semantic } = gateOn((root) =>
    declare(root, [{ type: "fact", anchor: "melting-point-of-water#1", spineRefs: ["concept.phase-change.42"], sourceRefs: [] }]),
  );

  const items = semantic.queue.items.filter((i) => i.detectorKinds.includes("dangling-spine-ref") && i.claimIds);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "dangling-reference");
  assert.match(items[0].claimIds[0], /^claim\./, "the flag is indexable by claim — the schema's handle");
  const [msg] = items[0].evidence;
  assert.match(msg, /names spineRef "concept\.phase-change\.42"/, "the message names the claim's dangling ref");
  assert.match(msg, /no parent concept/i, "…and the distinction orphan analysis loses without it");

  // THE NEGATIVE: a claim whose spineRef resolves raises nothing.
  const ok = gateOn((root) =>
    declare(root, [{ type: "fact", anchor: "melting-point-of-water#1", spineRefs: ["concept.phase-change.2"], sourceRefs: [] }]),
  );
  assert.equal(ok.semantic.queue.items.length, 0);
});

test("CHECK 4 — a dangling derivedFrom is flagged (M5 mints no edge, so the dependency vanishes)", () => {
  const { semantic } = gateOn((root) =>
    declare(root, [{ type: "fact", anchor: "latent-heat#1", spineRefs: ["concept.phase-change.2"], sourceRefs: [], derivedFrom: ["claim.ghost.deadbeef"] }]),
  );

  const items = semantic.queue.items.filter((i) => i.detectorKinds.includes("dangling-derived-from"));
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "dangling-reference");
  const [msg] = items[0].evidence;
  assert.match(msg, /declares derivedFrom "claim\.ghost\.deadbeef"/, "the message names the asserted dependency");
  assert.match(msg, /ABSENT/, "…and that the edge does not merely weaken — it does not exist");
  assert.match(msg, /never inferred/i, "…and why the refusal to mint it is correct");

  // THE NEGATIVE, and it needs a REAL id: derivedFrom is checked against the minted claim set, so a
  // resolvable derivation must be silent. Two declarations; the second derives from the first.
  const root = tempPackage();
  declare(root, [{ type: "fact", anchor: "melting-point-of-water#1", spineRefs: ["concept.phase-change.1"], sourceRefs: [] }]);
  reindex(root);
  const first = check(root).semantic.claims;
  assert.ok(first > 0);
  const id = JSON.parse(readPkg(root, "metadata/CLAIMS.json")).claims.find((c) => c.locations[0].anchor === "melting-point-of-water#1").id;
  declare(root, [
    { type: "fact", anchor: "melting-point-of-water#1", spineRefs: ["concept.phase-change.1"], sourceRefs: [] },
    { type: "fact", anchor: "latent-heat#1", spineRefs: ["concept.phase-change.2"], sourceRefs: [], derivedFrom: [id] },
  ]);
  reindex(root);
  assert.deepEqual(check(root).semantic.queue.items, [], "a derivedFrom naming a real claim is not a finding");

  // …and `derivedFrom: null` (NOT DECLARED) is not `[]` and is not dangling. Branch on presence.
  const undeclared = gateOn((root2) =>
    declare(root2, [{ type: "fact", anchor: "latent-heat#1", spineRefs: ["concept.phase-change.2"], sourceRefs: [] }]),
  );
  assert.deepEqual(undeclared.semantic.queue.items, [], "an undeclared derivation cannot dangle");
});

test("CHECK 5 — a REFUSED declaration says 'malformed', not 'you didn't declare'", () => {
  const { semantic } = gateOn((root) =>
    declare(root, [{ type: "WRONG-TYPE", anchor: "@obj-melting-point", spineRefs: [], sourceRefs: [] }]),
  );

  const items = semantic.queue.items.filter((i) => i.detectorKinds.includes("declaration-refusal"));
  assert.equal(items.length, 1);
  // A DIFFERENT QUESTION FROM A DANGLING REFERENCE — and since the queue kind is the dedupe key,
  // misnaming it would also have merged two unrelated decisions into one.
  assert.equal(items[0].kind, "declaration-refused");
  const [msg] = items[0].evidence;
  assert.match(msg, /declaration #1 was REFUSED/, "the message locates the entry (1-based, as a human counts)");
  assert.match(msg, /WRONG-TYPE/, "…quotes what arrived");
  assert.match(msg, /not "you did not declare this"/i, "…and refuses to name the wrong problem");

  // The DOCUMENT-level refusal is a different message: `index: null` means the document itself.
  const doc = gateOn((root) => writePkg(root, SIDECAR, "{ not json"));
  const docItems = doc.semantic.queue.items.filter((i) => i.kind === "declaration-refused");
  assert.equal(docItems.length, 1);
  assert.match(docItems[0].evidence[0], /the declaration document itself was REFUSED/, "null index = the document, not an entry");

  // THE NEGATIVE: a well-formed declaration is not a refusal.
  const ok = gateOn((root) =>
    declare(root, [{ type: "fact", anchor: "@obj-melting-point", spineRefs: [], sourceRefs: [] }]),
  );
  assert.equal(ok.semantic.queue.items.filter((i) => i.kind === "declaration-refused").length, 0);
  // …and an artifact with NO declaration at all is not a refusal either. This is the whole reason
  // the gate calls `artifactDeclarationReport` and not `declaredProvenanceReport`: a warning that
  // fires on every un-declared artifact in the package is a warning nobody reads.
  assert.equal(gateOn().semantic.queue.items.length, 0, "prose that declares nothing is not a refusal");
});

// =====================================================================================
// MESSAGE DISTINCTNESS — a reason that fits two defects sends the author to the wrong field
// =====================================================================================

test("no two checks share a message: five defects, five distinct reasons", () => {
  const { semantic } = gateOn((root) => {
    writePkg(root, "concepts/phase-change.md", readPkg(root, "concepts/phase-change.md").replace(
      "- **latent heat** — energy absorbed during a phase change",
      "- **latent heat** — energy absorbed during a phase change [concept.phase-change.99]",
    ));
    declare(root, [
      { type: "fact", anchor: "no-such-block#7", spineRefs: ["concept.phase-change.1"], sourceRefs: [] },
      { type: "fact", anchor: "melting-point-of-water#1", spineRefs: ["concept.phase-change.42"], sourceRefs: [] },
      { type: "fact", anchor: "latent-heat#1", spineRefs: ["concept.phase-change.2"], sourceRefs: [], derivedFrom: ["claim.ghost.deadbeef"] },
      { type: "WRONG-TYPE", anchor: "@obj-melting-point", spineRefs: [], sourceRefs: [] },
    ]);
  });

  assert.equal(semantic.detectorFindings, 5, "all five checks fire together");
  const leads = semantic.queue.items.map((i) => i.evidence[0]);
  assert.equal(new Set(leads).size, leads.length, "no two items share a message");

  // Every detector is represented — the fold to two queue kinds must not DESTROY the observation
  // (that is what `detectorKinds` is for, and what per-layer recall is computed from).
  const observed = new Set(semantic.queue.items.flatMap((i) => i.detectorKinds));
  assert.deepEqual([...observed].sort(), ["dangling-anchor", "dangling-derived-from", "dangling-spine-ref", "declaration-refusal"]);
  const asked = new Set(semantic.queue.items.map((i) => i.kind));
  assert.deepEqual([...asked].sort(), ["dangling-reference", "declaration-refused"]);

  // Each specific problem is named exactly once across the whole queue — no message is generic
  // enough to be reused, which is the property that makes a flag actionable.
  const evidence = allEvidence(semantic);
  for (const signature of [/named a location that does not exist/, /Key terms/, /names spineRef/, /declares derivedFrom/, /was REFUSED/]) {
    assert.equal(evidence.filter((e) => signature.test(e)).length, 1, `exactly one message matches ${signature}`);
  }
});

// =====================================================================================
// BACKWARD COMPATIBILITY — the hard one (§6.2)
// =====================================================================================

/**
 * The PRISTINE gate, as committed, runnable. `git show HEAD:` is the only honest source: a copy in
 * the test would be a second authority that drifts. It runs from a temp dir with `lib/` and
 * `node_modules/` symlinked so its own relative imports resolve to the same modules — the point is
 * to compare the SCRIPT, not to fork the libraries it calls.
 */
/**
 * The PRE-SEMANTIC gate, pinned to a COMMIT — never to `HEAD`.
 *
 * This said `HEAD` and was SELF-DEFEATING (found 2026-07-17 by the usage tests, three commits after
 * it was written). It passed while the fix sat uncommitted — working tree != HEAD — and went
 * PERMANENTLY RED the instant the fix landed, because HEAD then contained the fixed gate and the test
 * diffed it against itself, finding no advisory. It could never go green again.
 *
 * The general lesson, worth more than the bug: **a test that diffs the working tree against HEAD is a
 * REVIEW-TIME check, not a standing invariant.** It asserts "my UNCOMMITTED change is additive" — true
 * exactly once, in the window before the commit, and false forever after. If the property is meant to
 * hold for all time, it needs a FIXED reference. `e28957a` is the last gate before the semantic layer
 * existed (and, not incidentally, the study's pinned wave-1 baseline), so "byte-identical to the
 * pre-semantic gate" is a durable, checkable claim.
 */
const PRE_SEMANTIC_GATE = "e28957a";

function baselineGate() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-m11-base-"));
  temps.push(dir);
  const src = spawnSync("git", ["-C", repo, "show", `${PRE_SEMANTIC_GATE}:scripts/check_oer.mjs`], { encoding: "utf8" });
  assert.equal(src.status, 0, "the pristine pre-semantic baseline must be readable from git");
  assert.equal(
    /semanticAudit/.test(src.stdout),
    false,
    "the pinned baseline must PREDATE the semantic layer — otherwise this test compares the fix to itself",
  );
  fs.writeFileSync(path.join(dir, "check_oer.mjs"), src.stdout);
  fs.symlinkSync(path.join(repo, "scripts/lib"), path.join(dir, "lib"));
  fs.symlinkSync(path.join(repo, "node_modules"), path.join(dir, "node_modules"));
  return path.join(dir, "check_oer.mjs");
}

test("BACKWARD COMPAT: a package with NO semantic artifacts is byte-identical to today", () => {
  const root = tempPackage(); // deliberately NOT reindexed
  assert.equal(fs.existsSync(path.join(root, "metadata/CLAIMS.json")), false, "precondition: no stored index");

  const run = (script, tag) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cw-m11-${tag}-`));
    temps.push(dir);
    const json = path.join(dir, "r.json");
    const report = path.join(dir, "r.md");
    const p = spawnSync(process.execPath, [script, "--package", root, "--json", json, "--report", report], { encoding: "utf8" });
    return { json: fs.readFileSync(json, "utf8"), report: fs.readFileSync(report, "utf8"), stdout: p.stdout, status: p.status };
  };

  const after = run(CHECK, "mine");

  // WHAT §6.2 ACTUALLY REQUIRES: **the SEMANTIC LAYER adds nothing when it is off.**
  //
  // [REFORMULATED 2026-07-17 — the original invariant was MISCAST, and this is a deliberate,
  // argued weakening of the literal assertion.]
  //
  // It used to diff the whole gate's JSON/report/stdout/exit against a pinned pre-semantic commit and
  // demand byte-identity. That conflates two different claims:
  //   (a) "the semantic layer is additive when off"  — the real §6.2 invariant. Still asserted, below.
  //   (b) "the gate's output never changes"          — never an invariant, and never should be.
  // Because it asserted (b), it went RED TWICE IN ONE DAY for two unrelated CORRECT changes: the W7
  // advisory, and then the fix that stopped the gate demanding a `## Keywords` section the format
  // contract forbids in bold (old gate: 9 format failures on the fixture, new gate: 8 — the difference
  // IS the fix). **A test that goes red whenever you fix something correctly is a test people learn to
  // edit**, and an invariant that decays on every legitimate change protects nothing.
  //
  // So this now asserts the property that is actually true for all time, in its strongest form: with no
  // stored index, the layer contributes NO json key, NO artifact, and NO silence.
  assert.equal(JSON.parse(after.json).semantic, undefined, "no semantic block in the machine output");
  assert.equal(fs.existsSync(path.join(root, REVIEW_QUEUE_PATH)), false, "no queue emitted into a package that never asked");

  // …and the HUMAN is told, by name, what to run. Silence is indistinguishable from "there is no such
  // feature" — this project's signature defect, which would otherwise be self-inflicted in the report
  // of the very gate built to catch it. `semanticAudit` always produced this reason; it was discarded.
  // The near-verbatim scan has always done this right ("- not run (<reason>). Pass --inputs …").
  assert.match(after.report, /## Semantic index[\s\S]*?not run/i, "the report MUST say the layer did not run");
  assert.match(after.report, /index:semantic/, "and NAME THE COMMAND that fixes it, not merely complain");

  // The layer is OFF, not merely quiet — and it emits nothing into a package that never asked.
  assert.equal(JSON.parse(after.json).semantic, undefined, "no semantic block at all");
  assert.equal(fs.existsSync(path.join(root, REVIEW_QUEUE_PATH)), false, "no queue is emitted without an index");
});

test("BACKWARD COMPAT, the negative: the SAME package, reindexed, does engage", () => {
  // Proves the test above passes because the package has no index — not because the wire is dead.
  const root = reindex(tempPackage());
  const r = check(root);
  assert.equal(r.semantic.ran, true);
  assert.ok(fs.existsSync(path.join(root, REVIEW_QUEUE_PATH)), "an indexed package DOES get its queue");
});

// =====================================================================================
// THE QUEUE — schema, burden, and the artifact that must not fail its own gate
// =====================================================================================

test("the emitted queue validates against review_queue.schema.json", () => {
  const { root, semantic } = gateOn((root) => {
    declare(root, [
      { type: "fact", anchor: "no-such-block#7", spineRefs: [], sourceRefs: [] },
      { type: "WRONG-TYPE", anchor: "@obj-melting-point", spineRefs: [], sourceRefs: [] },
    ]);
  });
  const onDisk = JSON.parse(readPkg(root, REVIEW_QUEUE_PATH));
  assert.deepEqual(onDisk, { ...semantic.queue, basisSha256: semantic.basisSha256 }, "what the gate reports IS what it wrote (plus the basis the accept step compares)");

  const schema = JSON.parse(fs.readFileSync(path.join(repo, "system/schemas/package/review_queue.schema.json"), "utf8"));
  validate(onDisk, schema, "REVIEW_QUEUE");

  assert.equal(onDisk.schemaVersion, 1);
  assert.ok(onDisk.items.length > 0, "the fixture is planted, so the queue is not vacuously valid");
  // BURDEN IS POPULATED — it is a first-class output and the study's alarm-fatigue meter, not
  // bookkeeping that may quietly be absent.
  assert.equal(onDisk.burden.flagCount, onDisk.items.length);
  assert.ok(onDisk.burden.artifactCount > 0);
  assert.equal(onDisk.burden.flagsPerArtifact, Math.round((onDisk.burden.flagCount / onDisk.burden.artifactCount) * 1e4) / 1e4);
});

/** Enough JSON Schema to hold the frozen artifact honest — the subset the schema actually uses. */
function validate(value, schema, at) {
  if (schema.const !== undefined) assert.equal(value, schema.const, `${at}: const`);
  if (schema.enum) assert.ok(schema.enum.includes(value), `${at}: ${JSON.stringify(value)} not in enum`);
  if (schema.type === "integer") assert.ok(Number.isInteger(value), `${at}: integer`);
  if (schema.type === "number") assert.equal(typeof value, "number", `${at}: number`);
  if (schema.type === "string") {
    assert.equal(typeof value, "string", `${at}: string`);
    if (schema.pattern) assert.match(value, new RegExp(schema.pattern), `${at}: pattern`);
  }
  if (schema.type === "array") {
    assert.ok(Array.isArray(value), `${at}: array`);
    if (schema.minItems !== undefined) assert.ok(value.length >= schema.minItems, `${at}: minItems`);
    value.forEach((v, i) => schema.items && validate(v, schema.items, `${at}[${i}]`));
  }
  if (schema.type === "object") {
    assert.equal(value !== null && typeof value === "object" && !Array.isArray(value), true, `${at}: object`);
    for (const k of schema.required ?? []) assert.ok(Object.hasOwn(value, k), `${at}: missing required ${k}`);
    for (const k of Object.keys(value)) {
      if (schema.properties?.[k]) validate(value[k], schema.properties[k], `${at}.${k}`);
      else if (schema.additionalProperties === false) assert.fail(`${at}: additional property ${k}`);
    }
  }
}

test("QUEUE PROOF: a package carrying its own emitted queue still passes the REAL audit", () => {
  const root = tempPackage();
  reindex(root);
  acceptCoherentState(root);
  assert.deepEqual(auditCoherence(root).hardFailures, [], "precondition: the package is accepted and clean");

  // The gate emits its queue into the package it is auditing.
  check(root);
  assert.ok(fs.existsSync(path.join(root, REVIEW_QUEUE_PATH)), "the queue was written");

  // THE PROOF, and it is empirical because a set-membership assertion would only restate the
  // implementation. Without EXCLUDE this is "new component is not in the coherence index"; without
  // the commit it is `Git ??` — either way the package fails its own gate for emitting its own
  // queue, and `criticalTotal > 0` means pack exits 1.
  const audit = auditCoherence(root);
  assert.deepEqual(audit.hardFailures, [], "the emitted queue must not break the package's own gate");
  assert.deepEqual(audit.changed, [], "a derived artifact is not a component change");

  // …and it is genuinely invisible to the component layer, not merely tolerated: hashing the queue
  // as a component would make the index depend on its own output.
  const paths = computeComponentGraph(root).components.map((c) => c.path);
  assert.equal(paths.includes(REVIEW_QUEUE_PATH), false, "the queue is not a component");

  // Re-running the gate is repeatable — the property that makes it usable in a loop.
  check(root);
  assert.deepEqual(auditCoherence(root).hardFailures, [], "a second run is still clean");
});

test("QUEUE PROOF, the negative: an identical file NOT excluded reproduces the failure", () => {
  const root = tempPackage();
  reindex(root);
  acceptCoherentState(root);
  check(root);
  assert.deepEqual(auditCoherence(root).hardFailures, [], "the real queue raises nothing");

  // Same bytes, same folder, same moment — only the path is not in EXCLUDE. This proves the test
  // above is a fix and not an accident of a lenient gate.
  const decoy = "metadata/NOT_EXCLUDED.json";
  fs.copyFileSync(path.join(root, REVIEW_QUEUE_PATH), path.join(root, decoy));
  assert.match(auditCoherence(root).hardFailures.join("\n"), /Git \?\?: metadata\/NOT_EXCLUDED\.json/, "failure 1: untracked");
  commitOutput(root, "test: commit the decoy");
  const committed = auditCoherence(root).hardFailures.join("\n");
  assert.match(committed, /NOT_EXCLUDED\.json: new component is not in the coherence index/, "failure 2: EXCLUDE's half");
  assert.equal(committed.includes(REVIEW_QUEUE_PATH), false, "the real queue, in the same package at the same moment, raises neither");
});

test("the gate never `git init`s a package it was merely asked to check", () => {
  // A checker creating a repository as a side effect is a surprise nobody consented to — and it is
  // unnecessary: with no repository there are no git changes, so there is no failure to prevent.
  const root = reindex(tempPackage());
  check(root);
  assert.equal(fs.existsSync(path.join(root, ".git")), false, "no repository was created");
  assert.ok(fs.existsSync(path.join(root, REVIEW_QUEUE_PATH)), "…and the queue is still written");
});

test("§5d: the queue path has ONE home — no module respells it", () => {
  // M12's pattern, promoted in §5d, because it is the only test that works. A behavior test CANNOT
  // see a duplicate that currently AGREES — and "currently agrees" is the entire lifespan of every
  // duplicate, right up until the day it doesn't. This literal is exactly the kind that comes back:
  // M14 had to spell it here because M10 had no constant to import, and that second authority is
  // what this guard exists to stop from reappearing now that the constant exists.
  assert.equal(REVIEW_QUEUE_PATH, "metadata/REVIEW_QUEUE.json", "the value M10 owns");
  const owner = path.join(repo, "scripts/lib/escalation.mjs");
  for (const rel of ["scripts/lib/coherence.mjs", "scripts/check_oer.mjs"]) {
    const src = fs.readFileSync(path.join(repo, rel), "utf8");
    assert.equal(src.includes(`"${REVIEW_QUEUE_PATH}"`), false, `${rel} must IMPORT the path, never respell it`);
    assert.match(src, /REVIEW_QUEUE_PATH/, `${rel} uses the constant`);
  }
  assert.match(fs.readFileSync(owner, "utf8"), new RegExp(`export const REVIEW_QUEUE_PATH = "${REVIEW_QUEUE_PATH}"`), "M10 owns it");
});

// =====================================================================================
// DETERMINISM (§6.1) — same package, byte-identical queue
// =====================================================================================

test("DETERMINISM: the same package yields a byte-identical queue, twice, from two copies", () => {
  const plant = (root) => {
    writePkg(root, "concepts/phase-change.md", readPkg(root, "concepts/phase-change.md").replace(
      "- **latent heat** — energy absorbed during a phase change",
      "- **latent heat** — energy absorbed during a phase change [concept.phase-change.99]",
    ));
    declare(root, [
      { type: "fact", anchor: "no-such-block#7", spineRefs: ["concept.phase-change.1"], sourceRefs: [] },
      { type: "fact", anchor: "melting-point-of-water#1", spineRefs: ["concept.phase-change.42"], sourceRefs: [] },
      { type: "WRONG-TYPE", anchor: "@obj-melting-point", spineRefs: [], sourceRefs: [] },
    ]);
  };

  const a = tempPackage();
  plant(a);
  reindex(a);
  check(a);
  const first = readPkg(a, REVIEW_QUEUE_PATH);

  // Re-running over the same package must not churn the artifact…
  check(a);
  assert.equal(readPkg(a, REVIEW_QUEUE_PATH), first, "a second run over one package is byte-identical");

  // …and a SEPARATE copy, at a different path, must produce the same bytes: no clock, no
  // randomness, no dependence on absolute paths or on the order the detectors happened to run.
  const b = tempPackage();
  plant(b);
  reindex(b);
  check(b);
  assert.equal(readPkg(b, REVIEW_QUEUE_PATH), first, "a different package root yields identical bytes");
  assert.equal(/\d{4}-\d{2}-\d{2}T/.test(first), false, "no timestamp may leak into a derived artifact");
});

// =====================================================================================
// M2's ANCHOR EXPORT — the fact the gate must not re-derive (§5b, §5d)
// =====================================================================================

test("artifactAnchors exports M2's OWN anchor vocabulary and artifact set", () => {
  const root = tempPackage();
  const got = artifactAnchors(root);

  // The artifact SET is M2's fact too — `concepts/` is deliberately not a claim-bearing folder, so
  // a gate iterating its own file list would report dangling anchors in a map the index never
  // reads: telling an author to fix a file that has no effect.
  const files = got.map((a) => a.file);
  assert.deepEqual(files, ["study-guide/phase-change.md", "practice/phase-change.md", "assessment-support/phase-change.md"]);
  assert.equal(files.some((f) => f.startsWith("concepts/")), false, "concept maps are not claim artifacts");

  const guide = got.find((a) => a.file === "study-guide/phase-change.md");
  // G22: the fixture's objectives carry inline slugs, so the vocabulary also names them by `@slug`
  // (a declaration may address either form). Sorted: `@` sorts before letters.
  assert.deepEqual(guide.anchors, ["@obj-constant-temperature", "@obj-melting-point", "latent-heat#1", "melting-point-of-water#1", "melting-point-of-water#2", "objectives#1", "objectives#2"]);
  assert.deepEqual([...guide.anchors].sort(), guide.anchors, "sorted — the artifact is byte-stable");

  // The anchors are the BODY's, not the front matter's: `extractClaims` anchors
  // `parseBlocks(fileText.slice(base), base)`, so an anchor set taken over the whole text would
  // disagree with the index about which anchors exist — two answers to one question (§5d).
  const withFm = tempPackage();
  writePkg(withFm, "study-guide/phase-change.md", `---\n{"schemaVersion":1,"claims":[]}\n---\n${readPkg(withFm, "study-guide/phase-change.md")}`);
  const fmAnchors = artifactAnchors(withFm).find((a) => a.file === "study-guide/phase-change.md").anchors;
  assert.deepEqual(fmAnchors, guide.anchors, "front matter is a declaration, not an anchored block");

  // Deterministic and pure over the package.
  assert.deepEqual(artifactAnchors(root), got);
});
