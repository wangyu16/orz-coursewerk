// THE CONTROL CLAIM'S VERIFICATION — "the instructor decides what is taught", as a CHECKED property.
//
// WHAT THIS FILE FENCES, AND WHY IT IS ITS OWN FILE.
//
// The product makes one claim above all others: the instructor decides what is taught. Two defects,
// both MEASURED rather than theorized, showed that claim had no checker in either direction:
//
//   W12 (spine -> package). Add a third `## Objectives` item to a chapter map that nothing in the
//     package teaches -> `index:semantic` -> `check_oer` -> `criticalTotal: 0`, burden 0. SILENCE.
//     CONTROL was enforced by GENERATION (the agent is TOLD to build from the spine) and never by
//     VERIFICATION. An agent that silently drops an objective leaves the instructor's authority
//     intact on paper and gone in the package, with every check green — which is exactly the
//     obedience the design says it cannot rely on, and the reason the harness exists at all.
//
//   W13 (package -> spine). `orphan-claim` sat in `review_queue.schema.json`'s enum and in M10's
//     severity map with NO PRODUCER (the sixth: after `derivedFrom`, the spine namespace,
//     `REVIEW_QUEUE.json`, `overrideId`, `OVERRIDES.json`). Only hand-built test findings emitted
//     one. Meanwhile `check_oer.mjs`'s own dangling-spineRef message said orphan analysis "must be
//     able to tell 'this claim has no parent concept' from 'its parent does not exist'". The message
//     explained why a distinction mattered while only one side of it was built.
//
// THE TWO HALVES PULL IN OPPOSITE DIRECTIONS, AND THAT IS THE WHOLE TEST.
//
//   RECALL    — an objective the instructor wrote and nothing teaches MUST be flagged, by name.
//   PRECISION — the CLEAN package must earn ZERO flags.
//
// Either half alone is trivially satisfiable and worthless: flag everything (recall 1.0, a queue
// nobody opens) or flag nothing (precision 1.0, W12 ships). The precision half is not decoration —
// it is MEASURED and brutal. On the clean, contract-conformant fixture:
//     3 of 6 objective/concept nodes have NO claim referencing them
//     6 of 14 claims have NO spineRef (all scan-found — M2 never invents one, BY DESIGN)
// so the naive checks flag 3 + 6 = NINE false positives on a package with nothing wrong with it.
// That is the alarm-fatigue failure delivered BY the check built to prove CONTROL. Test 1 is the
// budget every other test here is spent against, and it is deliberately FIRST in the file.
//
// THE RULE, INHERITED FROM usage-e2e: drive the DOCUMENTED CLI as a child process. Nothing here
// imports from `scripts/lib/` for anything it ASSERTS ON — a library import would re-create the
// blind spot W1 lived in (the library was always fine; the space between the library and the product
// was not). The fixture is READ-ONLY: every case runs against a fresh `mkdtemp` copy, torn down after.
//
// MUTATION TALLY — 12 mutants, 12 killed; 3 of those are REPLACEMENTS for equivalent mutants, which
// are named rather than banked as kills that were not earned:
//   KILLED: scan-found claims not exempt from orphans · CONCEPT nodes flagged · traceability gate
//     dropped · key-terms escape dropped · gate armed by ANY declaration instead of an OBJECTIVE one
//     · denominator counts only covered nodes · spine-uncovered mis-folded onto `dangling-reference`
//     · claim-without-parent mis-folded · severity raised to `blocking` · orphan is EMPTY parents
//     not "few" · the orphan item must carry its claimId · a MISCONCEPTION counted as an objective.
//   EQUIVALENT (replaced, and each replacement above killed):
//     * `provenanceDeclared !== true` -> `!provenanceDeclared`. Identical for every BOOLEAN value;
//       they diverge only for a truthy non-boolean, which `claims.schema.json` forbids and which M2
//       (the sole producer) never emits. The presence discipline is still right — it is simply not
//       what this mutant tests.
//     * the non-array `spineRefs` guard. M2 always emits an array, so the branch is unreachable from
//       the product path: a deliberate defensive guard, not a checked property. Kept because
//       coercing an unreadable value to `[]` would ASSERT "no parent" about a record we could not
//       read — the one thing this file exists to refuse.
//     * the course-scope guard, SUBSUMED by the traceability gate (see the note at its site).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acceptBaseline } from "./helpers/baseline.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const FIXTURE = path.join(HERE, "fixtures", "usage-package");

const MAP = "concepts/melting.md";
const SG = "study-guide/melting.md";
const SG_SIDECAR = "metadata/claims/study-guide/melting.json";

function cli(script, args) {
  const res = spawnSync(process.execPath, [path.join(REPO, "scripts", script), ...args], {
    cwd: REPO,
    encoding: "utf8",
  });
  return { code: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

/** A private, writable copy of the fixture, torn down with the test. NEVER mutate `tests/fixtures/`. */
function freshPackage(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-control-"));
  const pkg = path.join(dir, "package");
  fs.cpSync(FIXTURE, pkg, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return pkg;
}

/** PROCEDURE Stage 4. */
function index(pkg) {
  // First baseline: the CLI directly. A re-baseline goes through the decision sheet (option 1).
  if (!fs.existsSync(path.join(pkg, "metadata", "CLAIMS.json"))) {
    const res = cli("index_semantic.mjs", ["--root", pkg]);
    assert.equal(res.code, 0, `index:semantic failed: ${res.stderr}`);
    return;
  }
  const { accept } = acceptBaseline(REPO, pkg);
  assert.equal(accept.code, 0, `re-baseline failed: ${accept.stderr}`);
}

/** PROCEDURE Stage 5 — the gate. `--no-commit`: these copies carry no git history. */
function gate(pkg) {
  const json = path.join(pkg, "..", "qa.json");
  const report = path.join(pkg, "..", "qa_report.md");
  const res = cli("check_oer.mjs", ["--package", pkg, "--json", json, "--report", report, "--no-commit"]);
  return {
    code: res.status,
    stderr: res.stderr,
    json: JSON.parse(fs.readFileSync(json, "utf8")),
    report: fs.readFileSync(report, "utf8"),
  };
}

const read = (pkg, rel) => fs.readFileSync(path.join(pkg, rel), "utf8");
const write = (pkg, rel, text) => fs.writeFileSync(path.join(pkg, rel), text);
const queueOf = (pkg) => JSON.parse(read(pkg, "metadata/REVIEW_QUEUE.json"));
const evidenceText = (q) => q.items.flatMap((i) => i.evidence).join("\n");
const itemsOfKind = (q, kind) => q.items.filter((i) => i.kind === kind);

/** Run the documented workflow and return everything a user can see. */
function run(pkg) {
  index(pkg);
  const g = gate(pkg);
  return { ...g, queue: queueOf(pkg) };
}

/** Append an `## Objectives` item to the chapter map — the instructor adding a promise. */
function addObjective(pkg, text) {
  write(
    pkg,
    MAP,
    read(pkg, MAP).replace(
      /(## Objectives\n(?:\d+\. .*\n)+)/,
      (block) => `${block}3. ${text}\n`,
    ),
  );
}

/** Append a `## Key terms` entry, optionally bracketed under a spine node. */
function addKeyTerm(pkg, line) {
  write(
    pkg,
    MAP,
    read(pkg, MAP).replace(/(## Key terms\n(?:- .*\n)+)/, (block) => `${block}${line}\n`),
  );
}

// =============================================================================================
// 1 · THE BUDGET. Written first, on purpose: it is what every other test here is spent against.
// =============================================================================================

test("1 · the CLEAN package reports burden 0 and ZERO coverage flags — the anti-alarm-fatigue proof", (t) => {
  const pkg = freshPackage(t);
  const g = run(pkg);

  // The layer engaged at all — otherwise "0 flags" means "nothing ran" (W1's shape), and a test
  // that cannot tell those apart is the test W1 walked past for 440 green runs.
  assert.ok(g.json.semantic, "the semantic block is absent — the layer never engaged");
  assert.equal(g.json.semantic.ran, true);
  assert.ok(g.json.semantic.spineNodes >= 8, "the spine did not index — nothing to be uncovered");
  assert.ok(g.json.semantic.claims >= 10, "no claims indexed — nothing to be an orphan");

  // THE HARD CRITERION. A clean package that flags ANYTHING is a finding, not a nuisance.
  assert.equal(
    g.json.semantic.burden.flagCount,
    0,
    `clean package earned ${g.json.semantic.burden.flagCount} flag(s): ${evidenceText(g.queue)}`,
  );
  assert.deepEqual(g.queue.items, []);
  assert.equal(g.json.criticalTotal, 0, "the clean package must still pass its own gate");

  // …AND NOT VACUOUSLY. This is the assertion that makes the one above mean something: the naive
  // checks had 9 candidates HERE, and every one is correctly silent.
  //   3 uncovered objective/concept nodes -> 0 coverage flags
  //   6 scan-found claims with no parent  -> 0 orphan flags
  assert.deepEqual(itemsOfKind(g.queue, "missing-coverage"), [], "a clean package earned a coverage flag");
  assert.deepEqual(itemsOfKind(g.queue, "orphan-claim"), [], "a clean package earned an orphan flag");
  const cov = g.json.semantic.coverage;
  assert.ok(
    cov.objectives.total + cov.concepts.total - (cov.objectives.covered + cov.concepts.covered) >= 3,
    "the trap is gone from the fixture — this test no longer proves precision, it proves nothing",
  );
});

test("1b · coverage is MEASURED, with its denominators, and reported to a human", (t) => {
  const pkg = freshPackage(t);
  const g = run(pkg);

  // INFORMATION, NOT AN ACCUSATION. The denominators are the point: "2 covered" is a number nobody
  // can act on or audit, and a bare percentage is one nobody can check.
  assert.deepEqual(g.json.semantic.coverage, {
    objectives: { covered: 2, total: 2 },
    concepts: { covered: 1, total: 4 },
    chaptersUnchecked: [], // D7: no chapter where the CONTROL check is undefined
  });

  // The number a HUMAN sees, and the understatement named IN THE LINE — an instructor reading
  // "1/4 concepts" without being told why would read a scolding where the honest reading is
  // "your package is under-DECLARED, not under-taught".
  assert.match(g.report, /coverage \(a FLOOR, not a score\).*objectives \*\*2\/2\*\*.*concepts \*\*1\/4\*\*/s);
  assert.match(g.report, /taught in undeclared prose measures as uncovered/);
});

// =============================================================================================
// 2 · RECALL — W12. The defect that started this.
// =============================================================================================

test("2 · a DROPPED objective is flagged, and the message NAMES it", (t) => {
  const pkg = freshPackage(t);
  // The instructor writes a promise into their own map. Nothing in the package teaches it, and no
  // `## Key terms` entry ties it to a single line of the chapter. This is W12's exact probe.
  addObjective(pkg, "Derive the Clausius–Clapeyron relation for the solid–liquid boundary.");
  const g = run(pkg);

  const flags = itemsOfKind(g.queue, "missing-coverage");
  assert.equal(flags.length, 1, `expected exactly one coverage flag, got: ${evidenceText(g.queue)}`);

  // It NAMES the objective — both the id a machine indexes and the prose a human recognizes. A flag
  // an instructor cannot locate is a flag they cannot act on.
  const [flag] = flags;
  const text = flag.evidence.join("\n");
  assert.match(text, /objective\.melting\.3/, "the flag does not name the objective's id");
  assert.match(text, /Clausius–Clapeyron/, "the flag does not quote the objective the instructor wrote");
  assert.match(text, /concepts\/melting\.md/, "the flag does not name the file to fix");
  // It names BOTH honest options and never picks for them: the spine is the instructor's authority.
  assert.match(text, /TEACH it, or REMOVE it/);

  // The observation survives the fold to the decision (§5c) — this is what lets recall be reported
  // per layer, and the queue kind is the decision, not the observation.
  assert.deepEqual(flag.detectorKinds, ["spine-uncovered"]);
  // FAIL-CLOSED (G1). A dropped objective is the agent overriding the instructor's declared intent,
  // so this finding is `blocking`, not `review` — and (test 2f) it blocks packing in EVERY mode.
  assert.equal(flag.severity, "blocking");

  // …and it reaches the surfaces a user actually reads.
  assert.match(g.report, /BLOCKING missing-coverage/);
  assert.equal(g.json.semantic.coverage.objectives.total, 3, "the new objective is in the denominator");
  assert.equal(g.json.semantic.coverage.objectives.covered, 2);
});

test("2b · the NEGATIVE — the same objective, TAUGHT and DECLARED, is not flagged", (t) => {
  const pkg = freshPackage(t);
  addObjective(pkg, "Derive the Clausius–Clapeyron relation for the solid–liquid boundary.");
  // Now teach it, and DECLARE it — the author doing the thing the flag asks for.
  write(
    pkg,
    SG,
    read(pkg, SG) +
      "\n## Clausius–Clapeyron\nThe solid–liquid boundary has a slope of about 13.5 MPa/K for water.\n",
  );
  const sidecar = JSON.parse(read(pkg, SG_SIDECAR));
  sidecar.claims.push({
    type: "fact",
    anchor: "clausius-clapeyron#1",
    spineRefs: ["objective.melting.3"],
    sourceRefs: [],
    termRefs: [],
  });
  write(pkg, SG_SIDECAR, JSON.stringify(sidecar, null, 2) + "\n");
  const g = run(pkg);

  assert.deepEqual(itemsOfKind(g.queue, "missing-coverage"), [], "a taught, declared objective was flagged");
  assert.deepEqual(g.json.semantic.coverage.objectives, { covered: 3, total: 3 });
});

test("2c · the RECALL LIMIT, revisited — a WHOLE chapter's objectives dropped is caught via its key-term anchor", (t) => {
  // W12's known recall hole, named in check_oer.mjs: "a chapter in which EVERY objective is dropped
  // has no covered objective, so the gate stays shut and the check says nothing." An agent that drops
  // ONE objective was caught (test 2); an agent that drops the WHOLE chapter was NOT — the exact
  // obedience-not-verification failure the CONTROL check exists to close, one scale up.
  //
  // E1 (coursewerk-caeai) narrows it: an objective's own `## Key terms` bracket is instructor-declared
  // traceability, so the check engages on the vocabulary signal even when no CLAIM declares against a
  // chapter objective. Here the instructor anchors an objective's vocabulary and the chapter never
  // teaches it, AND every declared claim in the chapter is gone (the whole-chapter drop).
  const pkg = freshPackage(t);
  addObjective(pkg, "Explain nucleation as the trigger for freezing.");
  addKeyTerm(
    pkg,
    "- **nucleation** — the initial formation of a solid seed that triggers freezing [objective.melting.3]",
  );
  // The whole chapter's declarations are dropped — before E1 this armed nothing and the gate stayed shut.
  fs.rmSync(path.join(pkg, "metadata", "claims"), { recursive: true, force: true });
  const g = run(pkg);

  const flags = itemsOfKind(g.queue, "missing-coverage");
  assert.equal(
    flags.length,
    1,
    `the dropped-chapter objective was not caught (recall limit still open): ${evidenceText(g.queue)}`,
  );
  const text = flags[0].evidence.join("\n");
  assert.match(text, /objective\.melting\.3/, "the flag does not name the dropped objective");
  assert.match(text, /nucleation/, "the flag does not name the untaught vocabulary the instructor anchored");
  assert.equal(flags[0].severity, "blocking"); // FAIL-CLOSED (G1) — a dropped objective blocks in any mode.

  // PRECISION HELD: the chapter's OTHER objectives are uncovered too now (their claims were stripped),
  // but their vocabulary IS taught in the intact prose — so they raise NO coverage flag. The single
  // missing-coverage item asserted above is the whole precision claim: only the genuinely untaught,
  // anchored objective flags. This is what separates "whole chapter dropped" from test 3c's "chapter
  // that simply declares nothing" — there the objectives are taught; here one is not.
  //
  // (Total burden is >1 only because stripping every declaration also lets the consistency scanner
  // re-read the practice sheet's two energy values as a value-disagreement — a separate finding, the
  // same reason test 3c asserts on missing-coverage rather than on flagCount. Not this check's flag.)
  assert.deepEqual(
    itemsOfKind(g.queue, "missing-coverage").map((i) => i.detectorKinds),
    [["spine-uncovered"]],
    "exactly one spine-uncovered coverage flag, and nothing else in the coverage family",
  );
});

test("2d · the REVERSE half (W17) — a deliverable tagging an objective the map never DECLARED is a format-contract fault, and blocks in authoring mode", (t) => {
  // `coverageAudit` (tests 2/2c) fences the FORWARD half of the bidirectional CONTROL promise: an
  // objective the instructor DECLARED that nothing teaches. W17 is the REVERSE half: no deliverable
  // may tag an objective the instructor never declared — a practice sheet inventing `Objective 3`
  // when the chapter map declares only 1–2 is the artifact overriding intent. The old check here was
  // BOTH vacuous AND dead (its authority parse scanned the concept map for a literal `Objective <id>`
  // token no conforming map ever writes, so `expected` was empty and the loop never ran); it now
  // reads the map's numbered `## Objectives` list as the declared set and contains deliverables to it.
  const pkg = freshPackage(t);
  // The map declares objectives {1,2} (see fixtures/usage-package/concepts/melting.md). The clean
  // practice sheet tags Objective 1 and Objective 2 — both declared. Append an UNDECLARED one.
  write(pkg, "practice/melting.md", read(pkg, "practice/melting.md") + "\nObjective 3 is covered by Q10.\n");
  const g = run(pkg);

  const w17 = g.json.formatContracts.failures.filter((f) => /undeclared objective/.test(f.issue));
  assert.equal(w17.length, 1, `expected exactly one reverse-containment failure, got: ${JSON.stringify(g.json.formatContracts.failures, null, 2)}`);
  const [fail] = w17;
  assert.equal(fail.file, "practice/melting.md", "the failure does not name the deliverable that invented the objective");
  // It NAMES the fabricated id and the authority file to reconcile against — teach-or-declare, the
  // reverse of test 2's teach-or-remove.
  assert.match(fail.issue, /undeclared objective 3\b/, "the failure does not name the fabricated objective id");
  assert.match(fail.issue, /concepts\/melting\.md `## Objectives`/, "the failure does not name the declaring authority to fix");

  // FAIL-CLOSED IN ANY MODE. `formatContractFailures` is a mode-independent critical count (unlike the
  // review-only semantic flags), so this reverse violation blocks packing during AUTHORING — `run`
  // drives the gate WITHOUT `--for-discovery`. A CONTROL violation is a fault whenever it is seen.
  assert.ok(g.json.criticalCounts.formatContractFailures >= 1, "the reverse-containment failure did not reach the critical count");
  // `criticalTotal > 0` IS the non-zero exit: the CLI's exit rule is literally `criticalTotal > 0 ? 1 : 0`
  // (check_oer.mjs), so a rising critical total during an authoring run is packing blocked.
  assert.ok(g.json.criticalTotal > 0, "criticalTotal did not rise on an undeclared-objective tag — the package would still pack");
});

test("2e · the NEGATIVE for W17 — the CLEAN package's deliverables tag ONLY declared objectives, and earn ZERO reverse-containment failures", (t) => {
  // The precision half of W17, measured on the untouched fixture. Every objective tag in the clean
  // usage-package (usage tags `Objective 1`/`Objective 2`; mini's dotted `objective.<slug>.1`;
  // study-guide/slides carry a `## Learning objectives` SECTION with no per-objective ids) is a
  // SUBSET of what its map declares — so the reverse check must be silent. This is the assertion that
  // the naive de-vacuuming (re-checking authority→deliverable per type, which duplicates the forward
  // half) would have BROKEN: it injected 10 false positives on the two clean fixtures. Zero here is
  // the whole no-new-false-positives claim, made load-bearing.
  const pkg = freshPackage(t);
  const g = run(pkg);
  const w17 = g.json.formatContracts.failures.filter((f) => /undeclared objective/.test(f.issue));
  assert.deepEqual(w17, [], `the clean package earned reverse-containment failures it had not: ${JSON.stringify(w17, null, 2)}`);
});

test("2f · FAIL-CLOSED (G1) — a DROPPED objective packs in NEITHER mode, and the clean sibling packs in both", (t) => {
  // The forward half of CONTROL, made fail-closed. Test 2 proved a dropped objective is FLAGGED; this
  // proves it BLOCKS PACKING — in authoring, not only at release. The product's first promise is that
  // the agent can never silently override what the instructor said to teach; a gate that merely files
  // the override in a queue the author may never open does not keep that promise. So `spine-uncovered`
  // is `blocking` (test 2) AND counted MODE-INDEPENDENTLY as `semanticCoverageBlocks` — like a corrupt
  // index, and UNLIKE a blocking contradiction, which stays release-only (check-oer-consistency test 6).
  const pkg = freshPackage(t);
  addObjective(pkg, "Derive the Clausius–Clapeyron relation for the solid–liquid boundary.");
  index(pkg);
  const authoring = gate(pkg);            // NO --for-discovery — the mode the old gate let this pass in

  // The dedicated CONTROL count is present and non-zero the moment an objective is dropped…
  assert.ok(authoring.json.criticalCounts.semanticCoverageBlocks >= 1,
    `a dropped objective did not reach the fail-closed coverage count: ${JSON.stringify(authoring.json.criticalCounts, null, 2)}`);
  // …and it lifts criticalTotal above zero DURING AUTHORING — the exit rule is `criticalTotal > 0 ? 1 : 0`,
  // so this is packing blocked, not merely a louder queue.
  assert.ok(authoring.json.criticalTotal > 0,
    "a dropped objective still packs in authoring mode — the CONTROL gate is not fail-closed");

  // The NARROWNESS guard: the fail-closed count is the coverage block ALONE. A dropped objective here
  // raises exactly the coverage count, not the release-only review tally — proof this change did not
  // quietly drag blocking contradictions into authoring-mode blocking (consistency test 6's precedent).
  assert.equal(authoring.json.criticalCounts.semanticReviewFlags, 0,
    "authoring-mode review flags are non-zero — the narrow coverage fix leaked into the release-only precedent");

  // The clean sibling packs in both modes — no coverage block, criticalTotal 0.
  const clean = freshPackage(t);
  const cg = run(clean);
  assert.equal(cg.json.criticalCounts.semanticCoverageBlocks, 0, "a clean package earned a fail-closed coverage block");
  assert.equal(cg.json.criticalTotal, 0, "the clean package must still pack");
});

// =============================================================================================
// 3 · PRECISION — the boundary the whole design is bought with.
// =============================================================================================

test("3 · an objective TAUGHT BUT UNDECLARED is measured as uncovered — and NOT flagged", (t) => {
  const pkg = freshPackage(t);
  addObjective(pkg, "Explain supercooling and why it does not contradict the melting point.");
  // The instructor registers the vocabulary under the objective…
  addKeyTerm(
    pkg,
    "- **supercooling** (supercooled) — cooling a liquid below its freezing point without solidification [objective.melting.3]",
  );
  // …and the chapter TEACHES it — in ordinary prose that declares nothing. This is the structural
  // case: only DECLARED claims carry spineRefs, so a taught objective LOOKS uncovered.
  write(
    pkg,
    SG,
    read(pkg, SG) +
      "\n## Supercooling\nPure water can be supercooled to −40 °C before it freezes, which is why melting and freezing are not mirror images.\n",
  );
  const g = run(pkg);

  // MEASURED as uncovered — the honest number. The floor is a floor.
  assert.deepEqual(
    g.json.semantic.coverage.objectives,
    { covered: 2, total: 3 },
    "a taught-but-undeclared objective must still MEASURE as uncovered — the number is a floor, not a guess",
  );

  // …and NOT FLAGGED. This is the precision boundary: undeclared is not untaught, and a check that
  // cannot tell them apart flags every honest package that has not finished declaring.
  assert.deepEqual(
    itemsOfKind(g.queue, "missing-coverage"),
    [],
    `an objective whose vocabulary IS taught was flagged as untaught: ${evidenceText(g.queue)}`,
  );
  assert.equal(g.json.semantic.burden.flagCount, 0);
});

test("3b · CONCEPT nodes are measured and never flagged — flagging the signal's own blind spot", (t) => {
  const pkg = freshPackage(t);
  const g = run(pkg);

  // 3 of 4 concept nodes carry no declared claim while being plainly taught: authors declare against
  // the OBJECTIVE that operationalizes a concept, not against the concept node. The declared-claim
  // signal is calibrated for objectives and is a blind spot for concepts, so a concept flag would
  // fire on a clean package — flagging the SIGNAL'S defect and calling it the author's.
  assert.equal(g.json.semantic.coverage.concepts.covered, 1, "the blind spot is gone — re-derive 3b's premise");
  assert.equal(g.json.semantic.coverage.concepts.total, 4);
  assert.deepEqual(itemsOfKind(g.queue, "missing-coverage"), []);
});

test("3c · a chapter that DECLARES NOTHING earns no coverage flag — absence of evidence is not evidence of absence", (t) => {
  const pkg = freshPackage(t);
  // Strip every declaration from the chapter. Nothing else changes: the same prose, the same
  // objectives, the same package — the author simply has not adopted traceability. This is
  // `tests/fixtures/mini-package`'s exact shape, and that fixture FOUND this defect: the check
  // flagged BOTH of its plainly-taught objectives, because "no declared claim names this objective"
  // reads as "untaught" the moment nothing is declared at all.
  //
  // Without traceability coverage is not a floor — it is UNDEFINED, and the honest report of an
  // undefined value is silence. Flagging here would also aim the loudest possible queue at exactly
  // the authors who have not yet adopted the convention: every author, on day one.
  fs.rmSync(path.join(pkg, "metadata", "claims"), { recursive: true, force: true });
  const g = run(pkg);

  assert.ok(g.json.semantic.claims >= 10, "the claims still index — the scan backstop still ran");
  assert.deepEqual(
    g.json.semantic.coverage.objectives,
    { covered: 0, total: 2 },
    "with nothing declared, NOTHING is covered — the measurement stays honest…",
  );
  assert.deepEqual(
    itemsOfKind(g.queue, "missing-coverage"),
    [],
    `…and yet not one flag: a package that declares nothing has no coverage signal to read. Got: ${evidenceText(g.queue)}`,
  );
  // The same package with declarations restored DOES engage — otherwise this guard would be a
  // blanket off-switch and test 2 would be passing for a reason that no longer exists.
  const armed = freshPackage(t);
  addObjective(armed, "Derive the Clausius–Clapeyron relation for the solid–liquid boundary.");
  assert.equal(itemsOfKind(run(armed).queue, "missing-coverage").length, 1);
});

test("3d · the gate reads the SAME signal the check reads — one unrelated declaration does not arm it", (t) => {
  const pkg = freshPackage(t);
  // The second fixture killed the weaker gate. `tests/check-oer-semantic.test.mjs`'s CHECK 1/3/4
  // each declare exactly ONE claim, about a CONCEPT — and a gate asking merely "does this chapter
  // declare ANYTHING?" is armed by that unrelated declaration, after which every objective flags.
  // A gate must read the same signal the check reads (declarations against OBJECTIVES) or it is a
  // different question standing in for the real one, and it will be armed by an accident.
  fs.rmSync(path.join(pkg, "metadata", "claims"), { recursive: true, force: true });
  fs.mkdirSync(path.join(pkg, "metadata", "claims", "study-guide"), { recursive: true });
  write(
    pkg,
    SG_SIDECAR,
    JSON.stringify(
      { schemaVersion: 1, claims: [{ type: "fact", anchor: "latent-heat-of-fusion#1", spineRefs: ["concept.melting.2"], sourceRefs: [] }] },
      null,
      2,
    ) + "\n",
  );
  const g = run(pkg);

  // The chapter now declares something — but nothing about its OBJECTIVES, so the objective-coverage
  // signal is still absent, and both objectives stay silent.
  assert.deepEqual(g.json.semantic.coverage.objectives, { covered: 0, total: 2 });
  assert.equal(g.json.semantic.coverage.concepts.covered, 1, "the concept declaration did take effect");
  assert.deepEqual(
    itemsOfKind(g.queue, "missing-coverage"),
    [],
    `a single declaration about a CONCEPT armed the objective check: ${evidenceText(g.queue)}`,
  );
});

// =============================================================================================
// 4 · W13 — `orphan-claim` finally has a producer.
// =============================================================================================

test("4 · a DECLARED claim with no parent is an orphan-claim; the 6 SCAN-FOUND ones are not", (t) => {
  const pkg = freshPackage(t);
  // The author declares a claim deliberately — and gives it no concept to hang under.
  const sidecar = JSON.parse(read(pkg, SG_SIDECAR));
  const target = sidecar.claims.find((c) => c.anchor === "latent-heat-of-fusion#1");
  target.spineRefs = [];
  write(pkg, SG_SIDECAR, JSON.stringify(sidecar, null, 2) + "\n");
  const g = run(pkg);

  const orphans = itemsOfKind(g.queue, "orphan-claim");
  assert.equal(
    orphans.length,
    1,
    `expected exactly ONE orphan — the DECLARED one. The package has 6 scan-found claims with no ` +
      `parent and flagging them would add six flags to a clean package. Got: ${evidenceText(g.queue)}`,
  );
  const [orphan] = orphans;
  assert.equal(orphan.claimIds.length, 1);
  assert.match(orphan.claimIds[0], /^claim\./);
  assert.deepEqual(orphan.detectorKinds, ["claim-without-parent"], "the detector kind names the OBSERVATION");
  assert.equal(orphan.kind, "orphan-claim", "the queue kind names the DECISION");
  assert.equal(orphan.severity, "review");

  const text = orphan.evidence.join("\n");
  assert.match(text, /study-guide\/melting\.md/, "the orphan flag does not say where to look");
  assert.match(text, /DECLARED by its author/);
  // It says what it is NOT — the distinction `spineRefFindings` promised and could not make.
  assert.match(text, /NOT a dangling ref/);
  assert.match(text, /NOT a scan-found/);
});

test("4b · OMITTING `spineRefs` and declaring it `[]` are the SAME orphan — the grammar keeps no difference", (t) => {
  // M12 distinguishes omitted (`null`) from declared-empty (`[]`) for `termRefs` and `derivedFrom`.
  // It does NOT for `spineRefs`: `normalizeDeclaration` passes the field through `refSet`, whose
  // FROZEN contract is `absent -> []`. Both spellings arrive as `[]`. The collapse is correct —
  // `spineRefs` has no fallback for "not declared" (nothing may invent one), so "I didn't say" and
  // "there are none" oblige the identical behavior: NO PARENT. This test pins that, so a later
  // reader adding a `null` branch discovers there is nothing to branch on.
  const flagFor = (t2, mutate) => {
    const pkg = freshPackage(t2);
    const sidecar = JSON.parse(read(pkg, SG_SIDECAR));
    mutate(sidecar.claims.find((c) => c.anchor === "latent-heat-of-fusion#1"));
    write(pkg, SG_SIDECAR, JSON.stringify(sidecar, null, 2) + "\n");
    const g = run(pkg);
    return itemsOfKind(g.queue, "orphan-claim");
  };

  const declaredEmpty = flagFor(t, (c) => { c.spineRefs = []; });
  const omitted = flagFor(t, (c) => { delete c.spineRefs; });

  assert.equal(declaredEmpty.length, 1, "declared-empty spineRefs is an orphan");
  assert.equal(omitted.length, 1, "an OMITTED spineRefs is the same orphan — not a silently exempt claim");
  // Byte-identical: the grammar kept no distinction, so neither may the flag.
  assert.deepEqual(omitted, declaredEmpty);
});

test("4c · a claim with a DANGLING parent is a dangling-reference, NOT an orphan — opposite fixes", (t) => {
  const pkg = freshPackage(t);
  const sidecar = JSON.parse(read(pkg, SG_SIDECAR));
  sidecar.claims.find((c) => c.anchor === "latent-heat-of-fusion#1").spineRefs = ["concept.melting.99"];
  write(pkg, SG_SIDECAR, JSON.stringify(sidecar, null, 2) + "\n");
  const g = run(pkg);

  // "This claim has no parent concept" and "its parent does not exist" are opposite problems with
  // opposite fixes. They must never merge — and the queue kind IS the dedupe key, so a shared kind
  // would silently answer one by answering the other.
  //
  // Asserted on the DETECTOR kind, not on the count of `dangling-reference` items, and the reason is
  // itself worth pinning: re-parenting this claim re-mints its id (the id carries `slug(spineRef)`),
  // which strands the practice answer key's `derivedFrom` that pointed at the old id. So this edit
  // legitimately produces TWO dangling-reference items — a dangling spineRef and a dangling
  // derivedFrom — about two different claims. Counting items here would silently pass for the wrong
  // reason the day the second one disappeared.
  const spineRefFlags = g.queue.items.filter((i) => i.detectorKinds.includes("dangling-spine-ref"));
  assert.equal(spineRefFlags.length, 1);
  assert.equal(spineRefFlags[0].kind, "dangling-reference");
  assert.match(spineRefFlags[0].evidence.join("\n"), /concept\.melting\.99/, "the flag does not name the bad ref");
  assert.deepEqual(itemsOfKind(g.queue, "orphan-claim"), [], "a dangling parent was double-counted as an orphan");
});

// =============================================================================================
// 5 · The non-negotiables.
// =============================================================================================

test("5 · determinism — two identical runs produce a byte-identical queue, flags and all", (t) => {
  const pkg = freshPackage(t);
  addObjective(pkg, "Derive the Clausius–Clapeyron relation for the solid–liquid boundary.");
  const sidecar = JSON.parse(read(pkg, SG_SIDECAR));
  sidecar.claims.find((c) => c.anchor === "latent-heat-of-fusion#1").spineRefs = [];
  write(pkg, SG_SIDECAR, JSON.stringify(sidecar, null, 2) + "\n");

  index(pkg);
  gate(pkg);
  const first = read(pkg, "metadata/REVIEW_QUEUE.json");
  gate(pkg);
  const second = read(pkg, "metadata/REVIEW_QUEUE.json");

  assert.equal(second, first, "the queue is not byte-stable across identical runs");
  // Not vacuous: it is stable WITH both new flag families in it.
  const q = JSON.parse(first);
  assert.equal(itemsOfKind(q, "missing-coverage").length, 1);
  assert.equal(itemsOfKind(q, "orphan-claim").length, 1);
});

test("5c · both CONTROL items validate against the FROZEN review_queue schema", (t) => {
  // The queue is a frozen artifact. A `kind` outside its enum makes every emitted queue invalid, and
  // `additionalProperties: false` means a stray field does too — neither of which any assertion above
  // would notice, because they read the items and not the contract.
  const pkg = freshPackage(t);
  addObjective(pkg, "Derive the Clausius–Clapeyron relation for the solid–liquid boundary.");
  const sidecar = JSON.parse(read(pkg, SG_SIDECAR));
  sidecar.claims.find((c) => c.anchor === "latent-heat-of-fusion#1").spineRefs = [];
  write(pkg, SG_SIDECAR, JSON.stringify(sidecar, null, 2) + "\n");
  const g = run(pkg);

  const schema = JSON.parse(
    fs.readFileSync(path.join(REPO, "system/schemas/package/review_queue.schema.json"), "utf8"),
  );
  const item = schema.properties.items.items;
  const kinds = item.properties.kind.enum;
  assert.ok(kinds.includes("missing-coverage"), "the new kind is not in the frozen enum");
  assert.ok(kinds.includes("orphan-claim"));

  const planted = g.queue.items.filter((i) => ["missing-coverage", "orphan-claim"].includes(i.kind));
  assert.equal(planted.length, 2, "the fixture is planted, so this is not vacuously valid");
  for (const it of planted) {
    for (const key of item.required) assert.ok(key in it, `missing required "${key}"`);
    for (const key of Object.keys(it)) {
      assert.ok(key in item.properties, `additionalProperty "${key}" — the schema forbids it`);
    }
    assert.ok(item.properties.severity.enum.includes(it.severity));
    assert.ok(it.evidence.length >= 1, "evidence is minItems 1");
    assert.ok(it.detectorKinds.length >= 1, "detectorKinds is minItems 1 — the fold must not erase the observation");
    for (const id of it.claimIds ?? []) assert.match(id, new RegExp(item.properties.claimIds.items.pattern));
  }

  // M10's KIND_ORDER must stay in the schema's own enum order — that is what makes the triage order
  // checkable against the frozen artifact rather than a second, drifting authority.
  const src = fs.readFileSync(path.join(REPO, "scripts/lib/escalation.mjs"), "utf8");
  const order = [...src.matchAll(/^ {2}"([a-z-]+)",$/gm)].map((m) => m[1]).filter((k) => kinds.includes(k));
  assert.deepEqual(order, kinds, "M10's KIND_ORDER drifted from the schema's enum order");
});

test("5b · a package with NO stored index still contributes no `semantic` key and names the fix", (t) => {
  const pkg = freshPackage(t);
  // Stage 4 deliberately skipped. The backward-compat contract is not "a quieter gate" or "a zeroed
  // coverage block" — it is ZERO BYTES CHANGED. A `coverage: {…}` leaking out unconditionally would
  // make "additive" quietly mean "different" for every pre-semantic package.
  const g = gate(pkg);
  assert.equal(g.json.semantic, undefined, "the semantic block leaked into an unindexed package");
  assert.match(g.report, /- \*\*not run\*\*/);
  assert.match(g.report, /index:semantic/);
});
