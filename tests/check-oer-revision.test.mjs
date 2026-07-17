// THE REVISION COMPARISON — `check_oer.mjs` diffs the FRESH compute against the STORED index.
//
// WHAT THIS FILE PINS, AND WHY IT IS SEPARATE FROM tests/usage-e2e.test.mjs.
//
// The usage tests found the defect: `semanticAudit()` loaded the stored index, used it for exactly
// `.present` and `.errors`, computed `fresh`, and NEVER COMPARED THEM. `matchClaims`, `classify`,
// `claimImpact`, `isAuthorizedDivergence` appeared zero times in the file; their only caller outside
// `lib/` and tests was `scripts/study_pairs.mjs` — the STUDY harness. The revision loop existed to
// produce the paper's numbers and not in the product. This file is the regression fence around the
// fix, and it is deliberately built around the two halves that pull in OPPOSITE directions:
//
//   RECALL     — a value change must reach the answer key that declares `derivedFrom` it, whose own
//                text is untouched and which NOTHING else in the system can see.
//   PRECISION  — a clean package, and a null edit, must earn ZERO flags.
//
// Either half alone is trivially satisfiable and worthless: flag everything (recall 1.0, a queue
// nobody opens) or flag nothing (precision 1.0, the contradiction ships). Every positive assertion
// below is therefore paired with its negative, and the null/clean cases are the budget the whole
// design is spent against.
//
// THE RULE, INHERITED FROM usage-e2e: drive the DOCUMENTED CLI as a child process. Nothing here
// imports from `scripts/lib/` for anything it ASSERTS ON — a library import would re-create the
// blind spot (the library was always fine; the space between the library and the product was not).
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
const MAP = "concepts/melting.md";
const COURSE_MAP = "concepts/course.md";
const FACT = "At standard pressure the melting point of pure water is 0 °C.";

function cli(script, args) {
  const res = spawnSync(process.execPath, [path.join(REPO, "scripts", script), ...args], {
    cwd: REPO,
    encoding: "utf8",
  });
  return { code: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

/** A private, writable copy of the fixture, torn down with the test. */
function freshPackage(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-revision-"));
  const pkg = path.join(dir, "package");
  fs.cpSync(FIXTURE, pkg, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return pkg;
}

/** PROCEDURE Stage 4 — the STORED index is the "before". */
function index(pkg) {
  const res = cli("index_semantic.mjs", ["--root", pkg]);
  assert.equal(res.code, 0, `index:semantic failed: ${res.stderr}`);
}

/** PROCEDURE Stage 5 — the gate. `--no-commit`: these packages carry no git history. */
function gate(pkg) {
  const json = path.join(pkg, "..", "qa.json");
  const report = path.join(pkg, "..", "qa_report.md");
  cli("check_oer.mjs", ["--package", pkg, "--json", json, "--report", report, "--no-commit"]);
  return { json: JSON.parse(fs.readFileSync(json, "utf8")), report: fs.readFileSync(report, "utf8") };
}

const read = (pkg, rel) => fs.readFileSync(path.join(pkg, rel), "utf8");
const write = (pkg, rel, text) => fs.writeFileSync(path.join(pkg, rel), text);
const queueOf = (pkg) => JSON.parse(read(pkg, "metadata/REVIEW_QUEUE.json"));
const evidenceText = (q) => q.items.flatMap((i) => i.evidence).join("\n");
const claimsOf = (pkg) => JSON.parse(read(pkg, "metadata/CLAIMS.json")).claims;

/** The claim at a file+anchor. BOTH are required: `slides/melting.md` carries the SAME anchor as the
 *  study guide, so an anchor-only lookup silently returns a different artifact's claim. */
const claimAt = (pkg, file, anchor) =>
  claimsOf(pkg).find((c) => c.locations[0].file === file && c.locations[0].anchor === anchor);

/** An edit that THROWS when its target is absent: an edit that applied to nothing would make every
 *  case below pass for the same reason — a failure that looks exactly like success. */
function edit(pkg, rel, from, to) {
  const text = read(pkg, rel);
  assert.ok(text.includes(from), `edit target not found in ${rel}: ${JSON.stringify(from)}`);
  write(pkg, rel, text.replace(from, to));
}

const RENAME_FROM = "- **melting point** (fusion point, aliases: melting temperature) —";
const RENAME_TO = "- **fusion point** (melting point, aliases: melting temperature) —";
function renameTerm(pkg) {
  edit(pkg, MAP, RENAME_FROM, RENAME_TO);
  edit(pkg, COURSE_MAP, "- **melting point** (fusion point) —", "- **fusion point** (melting point) —");
}

// =============================================================================================
// PRECISION — the budget. These are the assertions the whole design is spent against.
// =============================================================================================

test("a CLEAN, freshly-indexed package earns ZERO revision flags", (t) => {
  const pkg = freshPackage(t);
  index(pkg);
  const g = gate(pkg);

  // The comparison RAN — the point is not that it was quiet, it is that it looked and was quiet.
  // A layer that silently skipped itself would also report zero, and that is the defect, not the fix.
  assert.equal(g.json.semantic.revision.compared, true, "the revision comparison did not run at all");
  assert.ok(g.json.semantic.revision.matched >= 10, "nothing was matched — the comparison had no material");
  assert.equal(g.json.semantic.revision.added, 0);
  assert.equal(g.json.semantic.revision.removed, 0);

  // AND IT FOUND NOTHING. If wiring the comparison makes an untouched package flag, that is the
  // byte-hash bug (1 edit -> 6 required reviews) rebuilt at claim granularity — the founding defect.
  assert.equal(g.json.semantic.revision.actions, 0);
  assert.equal(g.json.semantic.revision.silentRisk, 0);
  assert.equal(g.json.semantic.burden.flagCount, 0,
    `a clean package earned ${g.json.semantic.burden.flagCount} flag(s): ${evidenceText(g.json.semantic.queue)}`);
  assert.deepEqual(queueOf(pkg).items, []);
});

test("a NULL edit earns ZERO flags — whitespace, reflow, and markup are not meaning", (t) => {
  // Three null edits in one package, because the claim is not "whitespace is safe" but "the layer is
  // blind to presentation". `format` hashes stripMarkup(text); if any of these moved a fingerprint,
  // the index would fire on edits an author does not knowingly make (an editor reflows on save).
  const pkg = freshPackage(t);
  index(pkg);

  edit(pkg, SG, FACT, "At standard pressure the melting point\nof pure water   is 0 °C.");
  edit(pkg, SG, "Melting pure water absorbs 334 J/g", "Melting pure water absorbs **334 J/g**");
  edit(pkg, SG, "## Synthesis", "## Synthesis   ");

  const g = gate(pkg);
  assert.equal(g.json.semantic.revision.compared, true);
  assert.equal(g.json.semantic.revision.matched >= 10, true, "the null edit destroyed claim identity");
  assert.equal(g.json.semantic.burden.flagCount, 0,
    `null edits earned ${g.json.semantic.burden.flagCount} flag(s): ${evidenceText(queueOf(pkg))}`);
  assert.deepEqual(queueOf(pkg).items, []);

  // THE NEGATIVE, and it is what makes the zero above evidence rather than a coincidence: the SAME
  // package, one real edit, is loud. Without this, "zero flags" is equally consistent with the bug
  // this file exists to fence — nothing being compared at all (test 4 in usage-e2e passed for years
  // for exactly that reason).
  edit(pkg, SG, "of pure water   is 0 °C.", "of pure water   is 4 °C.");
  assert.ok(gate(pkg).json.semantic.burden.flagCount > 0,
    "a value change earned zero flags — the comparison is not running");
});

// =============================================================================================
// RECALL — the cases the layer exists for
// =============================================================================================

test("a VALUE change flags the edited fact AND the answer key DERIVED from it", (t) => {
  const pkg = freshPackage(t);
  index(pkg);

  const fact = claimAt(pkg, SG, "melting-point-of-pure-water#1");
  const key = claimAt(pkg, "practice/melting.md", "practice-melting#2");
  assert.ok(fact && key, "the fixture's declared fact/answer-key pair did not index");
  assert.deepEqual(key.derivedFrom, [fact.id], "the authored derivation edge is not in the index");

  edit(pkg, SG, "is 0 °C.", "is 4 °C.");
  const g = gate(pkg);
  const q = queueOf(pkg);

  // THE SEED: `content` moved with no authorization on record. spec §5/§10 dec.2 name this exactly —
  // a SUSPECTED ERROR, adjudicated by a person, never propagated on the machine's own authority.
  const seed = q.items.find((i) => (i.claimIds ?? []).includes(fact.id) && i.kind === "suspected-error");
  assert.ok(seed, `the edited fact was not flagged as a suspected error; kinds: ${q.items.map((i) => i.kind).join(", ")}`);
  assert.deepEqual(seed.detectorKinds, ["revision-escalate"], "the observation was destroyed by the fold to the queue kind");
  assert.match(seed.evidence.join("\n"), /content/, "the message does not say which fingerprint layer moved");

  // THE ANSWER KEY: reached, and its OWN text was never touched. This is the case NOTHING else in
  // the system can catch — M3 sees no move, M4 returns NONE, M9 plans nothing.
  assert.ok(read(pkg, "practice/melting.md").includes("0 °C."), "the answer key's own text moved — this is no longer the silent case");
  const silent = q.items.find((i) => (i.claimIds ?? []).includes(key.id));
  assert.ok(silent, "the answer key DERIVED FROM the edited fact was not flagged");
  assert.equal(silent.kind, "upstream-drift", "the answer key was not reported as upstream drift");
  assert.deepEqual(silent.detectorKinds, ["revision-silent-risk"]);
  assert.ok(silent.claimIds.includes(fact.id), "the silent-risk item does not name the claim the change came FROM");

  // TWO ITEMS, NOT ONE. The queue kind is M10's dedupe key: had silent risk folded into
  // `suspected-error`, "is the edited fact wrong?" and "does the answer key that contradicts it
  // still hold?" would have MERGED, and answering the first would silently answer the second.
  assert.notEqual(seed.kind, silent.kind, "the seed and its silent dependent collapsed into one decision");

  // The derivation was TRAVERSED, not merely co-mentioned. `via` is the honest record of WHY.
  assert.match(silent.evidence.join("\n"), /derivation/, "the authored derivation edge did not propagate");
  assert.ok(g.json.semantic.revision.silentRisk > 0);
});

test("a RENAME is OBSERVABLE, the claim ids HOLD, and the message names the label that moved", (t) => {
  const pkg = freshPackage(t);
  index(pkg);
  const idsBefore = claimsOf(pkg).map((c) => c.id).sort();

  renameTerm(pkg);
  const g = gate(pkg);
  const q = queueOf(pkg);

  // OBSERVABLE — `label` hashes termId + preferredLabel precisely so a rename MOVES it.
  const renames = q.items.filter((i) => i.detectorKinds.includes("revision-rename"));
  assert.ok(renames.length > 0, `a rename produced no rename finding; kinds: ${q.items.map((i) => i.kind).join(", ")}`);
  assert.equal(renames[0].kind, "derived-diff", "a rename asks the human to sign off a rewrite, not to adjudicate an error");

  // IDS HELD — the other half. `identityLabel` hashes sorted term IDS, which a rename must not move.
  // A rename that lost the ids would report added+removed and RENAME would never fire at all.
  cli("index_semantic.mjs", ["--root", pkg]);
  assert.deepEqual(claimsOf(pkg).map((c) => c.id).sort(), idsBefore,
    "a rename changed claim ids — the terminology migration this feature exists for is broken");

  // NAMING THE MOVE IS THE POINT. "your label fingerprint moved" is a flag; `"melting point" ->
  // "fusion point"` is a fix.
  const evidence = evidenceText(q);
  assert.match(evidence, /melting point/, "the message does not name the old label");
  assert.match(evidence, /fusion point/, "the message does not name the new label");
  assert.match(evidence, /term\.melting-point/, "the message does not name the term whose label moved");

  // NEGATIVE: a rename is NOT a value change. The fact is still true and must not be escalated as a
  // suspected error — that would teach the instructor that renaming a term means they broke a fact.
  assert.equal(q.items.some((i) => i.kind === "suspected-error"), false,
    "a rename was reported as a suspected error");
  assert.equal(g.json.semantic.revision.added, 0, "the rename minted new claims instead of moving labels");
});

// =============================================================================================
// AUTHORIZATION — M7 owns it; this module reads it and never re-derives it
// =============================================================================================

test("an AUTHORIZED divergence is not flagged as a suspected error", (t) => {
  const pkg = freshPackage(t);
  index(pkg);
  const fact = claimAt(pkg, SG, "melting-point-of-pure-water#1");

  edit(pkg, SG, FACT, "At standard pressure the melting point of pure water is 273.15 K.");

  // NEGATIVE HALF FIRST — with NO override on record, this same edit IS a suspected error. Recording
  // one must be what changes the verb; asserting only the authorized side would pass just as well if
  // the override were ignored and nothing were ever escalated.
  const before = gate(pkg);
  assert.equal(before.json.semantic.revision.authorizedClaims, 0);
  assert.ok(queueOf(pkg).items.some((i) => i.kind === "suspected-error" && i.claimIds.includes(fact.id)),
    "an unauthorized value change was not escalated");

  // The instructor authorizes it. NOTE: this file writes OVERRIDES.json BY HAND because no product
  // code can — see F-C in tests/usage-e2e.test.mjs. `OVERRIDES_PATH` has a READER now (this is it)
  // and still has NO PRODUCER: there is no documented command to record an override.
  write(pkg, "metadata/OVERRIDES.json", JSON.stringify({
    schemaVersion: 1,
    overrides: [{
      claimId: fact.id,
      divergesFrom: "src.synthetic.handbook.rev1",
      basis: "pedagogical-choice",
      authorizedBy: "instructor",
      date: "2026-07-17", // a literal: a clock here would make the queue irreproducible
      rationale: "This course states absolute temperature from chapter 1 onward.",
    }],
  }, null, 2) + "\n");

  const after = gate(pkg);
  const q = queueOf(pkg);
  assert.equal(after.json.semantic.revision.authorizedClaims, 1, "the recorded override was not read");

  const item = q.items.find((i) => (i.claimIds ?? []).includes(fact.id));
  assert.equal(item.kind, "derived-diff", "an authorized change is propagated concertedly, not adjudicated as an error");
  assert.deepEqual(item.detectorKinds, ["revision-re-derive"]);
  assert.equal(q.items.some((i) => i.kind === "suspected-error"), false,
    "an authorized divergence was still reported as a suspected error");
  assert.doesNotMatch(evidenceText(q), /hallucination|unsupported/i,
    "an authorized divergence was reported as a hallucination");
});

test("a CORRUPT overrides file is reported, never read as 'no overrides recorded'", (t) => {
  const pkg = freshPackage(t);
  index(pkg);
  edit(pkg, SG, "is 0 °C.", "is 4 °C.");
  write(pkg, "metadata/OVERRIDES.json", "{ not json");

  const g = gate(pkg);
  // Absence is an answer; corruption is a fault. Read as "no overrides", a corrupt file would
  // re-report every settled divergence as a suspected error — failing toward the human, which is the
  // SAFE direction and therefore the invisible one. The author must be told why the run got louder.
  assert.equal(g.json.semantic.revision.overridesError !== null, true,
    "a corrupt OVERRIDES.json was silently read as 'no overrides recorded'");
  assert.match(g.json.semantic.revision.overridesError, /OVERRIDES\.json/);
  assert.match(g.report, /invalid JSON/, "the human report does not mention the corrupt overrides file");
  assert.equal(g.json.semantic.revision.authorizedClaims, 0);

  // NEGATIVE: an ABSENT overrides file is NOT an error — it is the normal state of every package.
  fs.rmSync(path.join(pkg, "metadata/OVERRIDES.json"));
  assert.equal(gate(pkg).json.semantic.revision.overridesError, null,
    "an absent OVERRIDES.json was reported as a fault");
});

// =============================================================================================
// CONTRACT — determinism, backward compatibility, and saying so
// =============================================================================================

test("determinism — the same package and the same edit produce a byte-identical queue", (t) => {
  const pkg = freshPackage(t);
  index(pkg);
  edit(pkg, SG, "is 0 °C.", "is 4 °C.");
  renameTerm(pkg);

  gate(pkg);
  const first = read(pkg, "metadata/REVIEW_QUEUE.json");
  gate(pkg);
  const second = read(pkg, "metadata/REVIEW_QUEUE.json");

  // Byte-identical, not deep-equal: a flag a human acted on must be regenerable from git months
  // later, and "same object, different bytes" does not survive a diff.
  assert.equal(second, first, "two runs over identical bytes produced different queues");
  assert.ok(JSON.parse(first).items.length > 0, "the edits produced no findings to be deterministic about");

  // And it holds across a FRESH COPY — a queue that is stable only within one directory is stable
  // because of the directory, not because the pipeline is a function of the package's bytes.
  const twin = freshPackage(t);
  index(twin);
  edit(twin, SG, "is 0 °C.", "is 4 °C.");
  renameTerm(twin);
  gate(twin);
  assert.equal(read(twin, "metadata/REVIEW_QUEUE.json"), first,
    "the same bytes in a different directory produced a different queue — something absolute leaked in");
});

test("a package with NO stored index still contributes no semantic key and no queue (§6.2)", (t) => {
  const pkg = freshPackage(t);
  // Stage 4 deliberately NOT run. Backward compatibility is byte-for-byte: not a quieter gate, not a
  // zeroed count, but zero bytes changed anywhere in the output.
  const g = gate(pkg);
  assert.equal("semantic" in g.json, false, "the JSON gained a semantic key for an unindexed package");
  assert.equal(fs.existsSync(path.join(pkg, "metadata/REVIEW_QUEUE.json")), false,
    "a queue was emitted for a package with no index");
  assert.match(g.report, /\*\*not run\*\*/, "the report does not say the layer did not run");
});

test("a stored index with no CLAIMS.json says the revision was NOT compared, and why", (t) => {
  const pkg = freshPackage(t);
  index(pkg);
  fs.rmSync(path.join(pkg, "metadata/CLAIMS.json"));
  edit(pkg, SG, "is 0 °C.", "is 4 °C.");

  const g = gate(pkg);
  // The layer still ENGAGES (SPINE/TERMS are stored, so `present` is true) but there is no "before"
  // for the claims. The author must never meet silence: silence is indistinguishable from "compared,
  // found nothing", which is the strongest possible false assurance this file exists to prevent.
  assert.equal(g.json.semantic.ran, true);
  assert.equal(g.json.semantic.revision.compared, false, "a package with no stored CLAIMS reported a comparison");
  assert.match(g.json.semantic.revision.reason, /index:semantic/, "the reason does not name the command that fixes it");
  assert.match(g.report, /not compared/, "the report does not say the revision was not compared");

  // AND IT DOES NOT INVENT ONE. Comparing the fresh compute against itself would report a clean
  // package, which is a bill of health manufactured out of a missing file.
  assert.equal(g.json.semantic.revision.silentRisk, 0);
  assert.equal(g.json.semantic.revision.actions, 0);
});
