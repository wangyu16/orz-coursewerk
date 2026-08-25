import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { renderAttribution } from "../scripts/lib/assurance.mjs";
import { buildPreflightReceipt, writePreflightReceipt } from "../scripts/lib/pre_ingestion.mjs";
import { computeComponentGraph, makeComponentIndex, recordAcceptedCoherence, writeComponentIndex } from "../scripts/lib/coherence.mjs";
import { commitOutput, ensureOutputGit } from "../scripts/lib/output_git.mjs";
import { writeSourceRecord } from "../scripts/lib/source_record.mjs";
import { makeKeyFactBindings } from "../scripts/lib/key_fact_review.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); };

function accept(root) {
  ensureOutputGit(root);
  const index = makeComponentIndex(computeComponentGraph(root));
  writeComponentIndex(root, index);
  const commit = commitOutput(root, "test: accepted state");
  recordAcceptedCoherence(root, index, commit.head, { action: "test" });
}

function addReleaseReviews(root, foundation) {
  const carrierSources = ["practice/ch1.md", "slides/ch1.md", "study-guide/ch1.md"].sort();
  writeJson(path.join(root, "metadata", "VISUAL_REVIEW.json"), {
    schemaVersion: 1,
    status: "passed",
    reviewer: { type: "human", name: "QA Human Reviewer" },
    reviewedAt: "2026-07-13",
    inspectionMethod: "browser-visual-dom",
    attestation: "I inspected every generated carrier in a browser for layout, readability, interaction, and visible overflow.",
    carriers: carrierSources.map((source) => ({
      source,
      carrier: source.startsWith("slides/") ? source.replace(/\.md$/, ".slides.html") : source.replace(/\.md$/, ".md.html"),
      builder: source.startsWith("slides/") ? "orz-slides" : "orz-mdhtml",
      sourceSha256: sha(fs.readFileSync(path.join(root, source))),
      outputFingerprint: { algorithm: "sha256", normalization: "coursewerk-carrier-v1", value: "a".repeat(64) },
      localAssetDigests: [],
    })),
  });
  writeJson(path.join(root, "metadata", "KEY_FACT_REVIEW.json"), {
    schemaVersion: 1,
    mode: "light",
    reviewKind: "same-model-independent-pass",
    authoringSystem: "QA fixture model",
    authoringModelId: "qa-fixture-model-v1",
    reviewer: { type: "ai", name: "QA fixture model", modelId: "qa-fixture-model-v1" },
    independence: { separatePass: true, contextReset: true, approach: "A fresh review context examined the completed fixture after the drafting pass had ended." },
    reviewedAt: "2026-07-13",
    bindings: makeKeyFactBindings(root),
    checks: ["accountable-identity", "source-identity-version", "source-license-evidence", "external-media-rights", "output-license-compatibility", "attribution-obligations", "scientific-key-facts"].map((id) => ({ id, status: "passed", note: `Independently reviewed ${id} against the bound fixture records and found it internally consistent.` })),
    keyFacts: [{ id: "fact-1", claim: "Concept A precedes concept B in the fixture process.", status: "verified", evidenceSourceIds: ["source-1"], usedIn: ["study-guide/ch1.md"], note: "The claim is deliberately simple and is supported by the declared fixture source and diagram description." }],
  });
}

function cleanFixture() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-qa-"));
  const root = path.join(parent, "package");
  const inputs = path.join(parent, "inputs");
  fs.mkdirSync(path.join(root, "metadata", "evidence"), { recursive: true });
  fs.mkdirSync(inputs, { recursive: true });
  const evidence = "Official evidence: Attribution 4.0 https://creativecommons.org/licenses/by/4.0/";
  fs.writeFileSync(path.join(root, "metadata", "evidence", "source-1.txt"), evidence);
  const foundation = {
    schemaVersion: 1, usageProfile: "public-oer", audience: "public", access: "public-web", redistribution: "open-license", jurisdiction: "international", outputLicense: "CC-BY-4.0",
    outputAuthors: [{ name: "QA Course Author", role: "author", rightsHolder: true, accountabilityConfirmedByUser: true }],
    privacy: { containsPersonalData: false, containsRestrictedContent: false },
    sources: [{ id: "source-1", title: "Example Source", edition: "1", publisher: "Example", canonicalUrl: "https://example.org/source", role: "primary", use: "reference", scope: ["chapter 1"], rightsBasis: { type: "open-license", license: "CC-BY-4.0", evidenceType: "official-publisher-page", evidenceUrl: "https://example.org/license", verifiedAt: "2026-07-13", evidenceSnapshot: "metadata/evidence/source-1.txt", evidenceSha256: sha(evidence), evidenceRetrieval: { captureMode: "local-file", claimedEvidenceUrl: "https://example.org/license", localFileName: "source-1.txt", retrievedAt: "2026-07-13T00:00:00Z", byteLength: Buffer.byteLength(evidence), contentType: "text/plain", tool: { name: "coursewerk", version: "test" } }, evidenceCapture: { operator: { type: "automation", name: "fixture" }, capturedAt: "2026-07-13T00:00:00Z", tool: { name: "coursewerk", version: "test" } }, processUseReview: { schemaVersion: 1, scannedAt: "2026-07-13T00:00:00Z", status: "no-notice-detected", legalEffectDetermined: false, notices: [] } }, requiredAttribution: { textIncludes: "Source:", url: "https://example.org/source", placement: "every-public-deliverable" } }],
  };
  const receipt = buildPreflightReceipt({ source: foundation.sources[0], evidenceBytes: Buffer.from(evidence), retrieval: foundation.sources[0].rightsBasis.evidenceRetrieval, operator: foundation.sources[0].rightsBasis.evidenceCapture.operator, generatedAt: "2026-07-13T00:00:00Z" });
  writePreflightReceipt(root, foundation.sources[0], receipt);
  const manifest = { schemaVersion: 2, packageId: "pending", title: "QA Fixture", license: "CC-BY-4.0", description: "A complete fixture for testing Coursewerk quality and release behavior.", keywords: ["quality", "course", "fixture"], discipline: "testing", unitTerm: "chapter", courseContext: { courseName: "QA Course", level: "introductory" }, createdAt: "2026-07-13T00:00:00Z", chapters: [{ slug: "ch1", title: "Chapter 1" }] };
  const provenance = { schemaVersion: 1, items: [] };
  writeJson(path.join(root, "alembic.json"), manifest);
  writeJson(path.join(root, "metadata", "FOUNDATION.json"), foundation);
  writeJson(path.join(root, "metadata", "PROVENANCE.json"), provenance);
  writeJson(path.join(root, "metadata", "MEDIA_PLAN.json"), { schemaVersion: 1, chapters: { ch1: { realImageDecision: "not-used", rationale: "This abstract QA fixture has no real-world subject for which a photograph would improve instruction.", reviewedBy: "QA Course Author", reviewedAt: "2026-07-13" } } });
  fs.writeFileSync(path.join(root, "metadata", "ATTRIBUTION.md"), renderAttribution(provenance));
  fs.writeFileSync(path.join(root, "LICENSE"), fs.readFileSync(path.join(repo, "scripts", "data", "licenses", "CC-BY-4.0.txt")));
  const credit = "\nSource: https://example.org/source\n";
  const tabs = Array.from({ length: 10 }, (_, i) => `:::: tabs\n::: tab Q\nObjective 1: Question ${i + 1}\n:::\n::: tab Answer\nAnswer ${i + 1}\n:::\n::::`).join("\n");
  const files = {
    // THE SPINE, per format-contracts/deliverables.md §Concept maps.
    // [UPDATED 2026-07-17] This fixture wrote `## Keywords` and omitted the node-bearing sections,
    // because it was built against the OLD, loose gate — the same pre-W2 rule that told every real demo
    // course to emit a keyword dump. The ASSERTION below is unchanged ("a clean package passes"); what
    // had to track the contract is the fixture's DEFINITION OF CLEAN. A fixture encoding a superseded
    // rule silently certifies the old behavior forever.
    "concepts/course.md": `# Course${credit}\n## Organizing question\nHow does matter change state?\n## Summary\nSequence.\n## Concept sequence\n1. Matter changes state at characteristic temperatures.\n## Chapter sequence\n1. **ch1** — the first chapter.\n`,
    "concepts/ch1.md": `# Concept${credit}\n## Source and Scope\nChapter.\n## Summary\nSummary.\n## Prerequisites\n- None.\n## Objectives\n1. Objective 1.\n## Concept sequence\n1. A solid melts at a characteristic temperature.\n## Key terms\n- **melting point** (fusion point) — the temperature at which a solid becomes liquid\n## Misconceptions to surface\n- Temperature always rises when heat is added.\n`,
    "study-guide/ch1.md": `# Study${credit}\n## Chapter Learning Objectives\nObjective 1.\n## Topic\n{{mermaid\ngraph LR\nA --> B\n}}\n> **Visual description:** A process arrow connects concept A to concept B.\n:::: tabs\n::: tab Problem\nExample.\n:::\n::: tab Solution\nSolution.\n:::\n::::\n## Synthesis\nSummary.\n`,
    "slides/ch1.md": `<!-- deck\ntitle: Ch1\nratio: 16:9\n-->\n<!-- slide template=title -->\n# Ch1${credit}\n<!-- slide template=outline -->\n# Outline\n- Objective 1\n<!-- slide -->\n## Topic\nText.\n<!-- slide template=closing -->\n# Closing\n`,
    "assessment-support/ch1.md": `# Assessment${credit}\n## Objective 1\nTarget.\n### Question guide\nParameterized.\n## Rubric Themes\nAccuracy.\n`,
    "practice/ch1.md": `# Practice${credit}\n${tabs}\n`,
  };
  for (const [rel, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); }
  const sourceText = "Distinct source corpus prose for deterministic comparison and copyright review. ".repeat(30);
  fs.mkdirSync(path.join(inputs, ".coursewerk-source-original"), { recursive: true });
  fs.writeFileSync(path.join(inputs, ".coursewerk-source-original", "source-1.txt"), sourceText);
  fs.writeFileSync(path.join(inputs, "source.txt"), sourceText);
  const corpus = { schemaVersion: 1, sources: [{ sourceId: "source-1", comparisonMode: "automatic", originalPath: ".coursewerk-source-original/source-1.txt", originalSha256: sha(sourceText), canonicalUrl: "https://example.org/source", retrievedAt: "2026-07-13T00:00:00Z", retrieval: { captureMode: "local-file", localFileName: "source-1.txt", retrievedAt: "2026-07-13T00:00:00Z", byteLength: Buffer.byteLength(sourceText), tool: { name: "coursewerk", version: "test" } }, extractor: { tool: "coursewerk", version: "test", schemaVersion: 1, sourceFormat: ".txt" }, textPath: "source.txt", sha256: sha(sourceText), minimumWords: 100, wordCount: 300 }] };
  writeJson(path.join(inputs, "SOURCE_CORPUS.json"), corpus);
  writeSourceRecord(root, corpus);
  addReleaseReviews(root, foundation);
  accept(root);
  return { parent, root, inputs };
}

function runQa(fixture) {
  const json = path.join(fixture.parent, "qa.json");
  const run = spawnSync(process.execPath, [path.join(repo, "scripts", "check_oer.mjs"), "--package", fixture.root, "--inputs", fixture.inputs, "--for-discovery", "--json", json], { encoding: "utf8" });
  return { run, report: JSON.parse(fs.readFileSync(json, "utf8")) };
}

test("clean public fixture passes the complete QA gate", () => {
  const f = cleanFixture();
  const { run, report } = runQa(f);
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.equal(report.criticalTotal, 0);
});

test("public release requires the mode-appropriate key-fact critique", () => {
  const f = cleanFixture();
  fs.rmSync(path.join(f.root, "metadata", "KEY_FACT_REVIEW.json"));
  accept(f.root);
  const { run, report } = runQa(f);
  assert.notEqual(run.status, 0);
  assert.ok(report.criticalCounts.keyFactReviewFailures > 0);
  assert.match(report.keyFactReview.failures.join("\n"), /KEY_FACT_REVIEW\.json is required/);
});

test("Light-mode same-model critique is invalidated by a later teaching-content edit", () => {
  const f = cleanFixture();
  fs.appendFileSync(path.join(f.root, "study-guide", "ch1.md"), "\nA later factual explanation changes the reviewed teaching content.\n");
  accept(f.root);
  const { run, report } = runQa(f);
  assert.notEqual(run.status, 0);
  assert.ok(report.criticalCounts.keyFactReviewFailures > 0);
  assert.match(report.keyFactReview.failures.join("\n"), /bindings are stale/);
});

test("scaffold-only inputs cannot satisfy source comparison", () => {
  const f = cleanFixture();
  fs.rmSync(path.join(f.inputs, "SOURCE_CORPUS.json"));
  fs.rmSync(path.join(f.inputs, "source.txt"));
  fs.writeFileSync(path.join(f.inputs, "README.md"), "Scaffold instructions only.");
  const { report } = runQa(f);
  assert.equal(report.verbatim.corpus.ready, false);
  assert.ok(report.criticalCounts.additionalDiscoverBlockers > 0);
});

test("duplicate or undeclared source-corpus IDs are release-blocking", () => {
  const f = cleanFixture();
  const corpusFile = path.join(f.inputs, "SOURCE_CORPUS.json");
  const corpus = JSON.parse(fs.readFileSync(corpusFile, "utf8"));
  corpus.sources.push({ ...corpus.sources[0] }, { ...corpus.sources[0], sourceId: "not-in-foundation" });
  fs.writeFileSync(corpusFile, JSON.stringify(corpus, null, 2));
  const result = runQa(f, ["--for-discovery"]);
  assert.notEqual(result.run.status, 0);
  assert.match(result.report.verbatim.corpus.failures.join("\n"), /duplicate source-corpus entry/);
  assert.match(result.report.verbatim.corpus.failures.join("\n"), /not declared in FOUNDATION/);
});

test("remote media is release-blocking", () => {
  const f = cleanFixture();
  fs.appendFileSync(path.join(f.root, "study-guide", "ch1.md"), "\n![Remote](https://example.net/image.jpg)\n");
  accept(f.root);
  const { report } = runQa(f);
  assert.equal(report.criticalCounts.remoteMediaReferences, 1);
});

test("heading jumps and non-descriptive links are release-blocking", () => {
  const f = cleanFixture();
  fs.appendFileSync(path.join(f.root, "study-guide", "ch1.md"), "\n#### Jump\n[click here](https://example.net)\n");
  accept(f.root);
  const { report } = runQa(f);
  assert.ok(report.criticalCounts.headingLevelJumps > 0);
  assert.ok(report.criticalCounts.nonDescriptiveLinks > 0);
});

test("runtime diagrams require visible text alternatives", () => {
  const f = cleanFixture();
  const file = path.join(f.root, "study-guide", "ch1.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/\n> \*\*Visual description:\*\*[^\n]+/, ""));
  accept(f.root);
  const { report } = runQa(f);
  assert.equal(report.criticalCounts.diagramTextAlternativesMissing, 1);
});

test("a chapter without a photograph requires a reviewed media rationale", () => {
  const f = cleanFixture();
  fs.rmSync(path.join(f.root, "metadata", "MEDIA_PLAN.json"));
  accept(f.root);
  const { report } = runQa(f);
  assert.match(report.formatContracts.failures.map((item) => item.issue).join("\n"), /no real photograph/);
});

test("minimal assessment and practice do not satisfy format contracts", () => {
  const f = cleanFixture();
  fs.writeFileSync(path.join(f.root, "assessment-support", "ch1.md"), "# Assessment\nSource: https://example.org/source\n");
  fs.writeFileSync(path.join(f.root, "practice", "ch1.md"), "# Practice\nSource: https://example.org/source\n");
  accept(f.root);
  const { report } = runQa(f);
  assert.ok(report.formatContracts.failureCount >= 4);
});

test("unclosed chart and reversed container depth are detected", () => {
  const f = cleanFixture();
  fs.appendFileSync(path.join(f.root, "study-guide", "ch1.md"), "\n{{chart type: bar\n");
  fs.writeFileSync(path.join(f.root, "practice", "ch1.md"), "# Practice\nSource: https://example.org/source\n::: tabs\n:::: tab Q\nObjective 1 Q\n::::\n::: tab Answer\nA\n:::\n:::\n");
  accept(f.root);
  const { report } = runQa(f);
  assert.ok(report.orzSyntax.issues.some((issue) => /closing braces/.test(issue.issue)));
  assert.ok(report.orzSyntax.issues.some((issue) => /nested container/.test(issue.issue)));
});

test("discovery metadata is required", () => {
  const f = cleanFixture();
  const manifest = JSON.parse(fs.readFileSync(path.join(f.root, "alembic.json")));
  delete manifest.description;
  delete manifest.keywords;
  fs.writeFileSync(path.join(f.root, "alembic.json"), JSON.stringify(manifest));
  accept(f.root);
  const { report } = runQa(f);
  assert.ok(report.criticalCounts.manifestErrors >= 2);
});

test("obvious instructor-only content in a public deliverable is rejected", () => {
  const f = cleanFixture();
  fs.appendFileSync(path.join(f.root, "study-guide", "ch1.md"), "\nInstructor-only grading key: do not share with students.\n");
  accept(f.root);
  const { report } = runQa(f);
  assert.ok(report.criticalCounts.layoutErrors > 0);
});

// TRUST LAYER 3c — the unverifiable-quotation gate, wired end-to-end through the DOCUMENTED CLI on a
// SOURCE-BEARING package (W18's missing product caller: `immutable.mjs`'s publish-time half was
// tested in isolation but nothing ran it against an assembled package). The unit test
// (tests/unverifiable_quotation.test.mjs) pins the matcher; THIS pins the wiring — the finding must
// travel deliverable text -> `quotationFindings` -> `buildQueue` -> escalation fold -> a real
// REVIEW_QUEUE.json item, exercised on the same source corpus the verbatim gate compares against.
//
// A helper to store the semantic index the TRUST layer runs behind (Stage 4 of the pipeline); the
// gate is a no-op on the semantic layer without it, exactly like its range/consistency siblings.
function indexSemantic(root) {
  const run = spawnSync(process.execPath, [path.join(repo, "scripts", "index_semantic.mjs"), "--root", root], { encoding: "utf8" });
  assert.equal(run.status, 0, `index:semantic failed:\n${run.stdout}\n${run.stderr}`);
}
// Ten contiguous words that appear VERBATIM in cleanFixture's source corpus prose (see `cleanFixture`:
// "Distinct source corpus prose for deterministic comparison and copyright review." repeated).
const FAITHFUL_QUOTE = "Distinct source corpus prose for deterministic comparison and copyright review";
const EDITED_QUOTE = FAITHFUL_QUOTE.replace("copyright", "trademark"); // one substituted word — absent from the source
const quotationItems = (root) => JSON.parse(fs.readFileSync(path.join(root, "metadata", "REVIEW_QUEUE.json"), "utf8"))
  .items.filter((it) => it.detectorKinds.includes("unverifiable-quotation"));

test("a FAITHFUL quotation of the pinned source verifies — zero unverifiable-quotation flags (the FP budget)", () => {
  // The DISCRIMINATION proof paired with the headline test below: both inject the SAME sentence into
  // the SAME indexed fixture, differing by exactly one word (copyright/trademark). So any semantic
  // perturbation the indexer adds from the injected prose is IDENTICAL in both runs — the only
  // variable is whether the quoted words appear in the pinned source. Here they do, so the layer
  // must be silent; below they do not, so it must fire. The blockquote callout that tripped the broad
  // form the first time this ran is why the assertion is scoped to `quotationItems`, not `criticalTotal`.
  const f = cleanFixture();
  fs.appendFileSync(path.join(f.root, "study-guide", "ch1.md"), `\nThe source records that "${FAITHFUL_QUOTE}".\n`);
  indexSemantic(f.root);
  accept(f.root);
  const { report } = runQa(f);
  // The scan RAN and LOOKED — a layer that silently skipped itself would report zero too, and that is
  // the defect this file exists to fence, not the fix (the headline test proves it fires when it must).
  assert.equal(report.semantic.ran, true, "the semantic layer did not run — the quotation scan never looked");
  assert.deepEqual(quotationItems(f.root), [], "a faithfully-reproduced quotation was flagged as unverifiable");
});

test("the HEADLINE FAULT — an EDITED quotation with no source match is queued as source-conflict, and blocks at release", () => {
  const f = cleanFixture();
  fs.appendFileSync(path.join(f.root, "study-guide", "ch1.md"), `\nThe source records that "${EDITED_QUOTE}".\n`);
  indexSemantic(f.root);
  accept(f.root);

  // WHILE AUTHORING: the finding is a queue ITEM, not a gate failure — the sibling precedent
  // (dangling refs, consistency, the review gates) is that the semantic layer counts toward
  // criticalTotal under --for-discovery ONLY.
  const authoringJson = path.join(f.parent, "authoring.json");
  const authoring = spawnSync(process.execPath, [path.join(repo, "scripts", "check_oer.mjs"), "--package", f.root, "--inputs", f.inputs, "--json", authoringJson], { encoding: "utf8" });
  const authoringReport = JSON.parse(fs.readFileSync(authoringJson, "utf8"));
  assert.equal(authoringReport.criticalCounts.semanticReviewFlags ?? 0, 0, "an authoring run was blocked by a queue item");
  assert.ok(authoringReport.semantic.burden.flagCount > 0, "the edited quotation was not queued at all");

  // THE ITEM ITSELF, read from the user-visible artifact.
  const items = quotationItems(f.root);
  assert.equal(items.length, 1, `expected exactly one unverifiable-quotation item, got ${items.length}`);
  const [item] = items;
  // The fold, both directions: the human is asked "source-conflict"; the observation survives as the
  // detector kind so a study can still count TRUST 3c's contribution per layer.
  assert.equal(item.kind, "source-conflict");
  assert.deepEqual(item.detectorKinds, ["unverifiable-quotation"], "the observation was destroyed by the fold to the queue kind");
  // `review`, not `blocking`: nothing is provably a falsehood — the quote may simply come from an
  // unpinned source — so a human decides. `blocking` is reserved for a quote provably attributed to a
  // pinned automatic source.
  assert.equal(item.severity, "review");
  const prose = item.evidence.join("\n");
  for (const needle of ["study-guide/ch1.md", "trademark", "no pinned automatic source"])
    assert.ok(prose.includes(needle), `the message does not name ${JSON.stringify(needle)}:\n${prose}`);

  // AT RELEASE: shipping a package whose quotation matches no source is exactly the fault this layer
  // exists to catch, so it must block.
  const { report: release } = runQa(f); // runQa runs --for-discovery
  assert.ok(release.criticalCounts.semanticReviewFlags > 0, "an unverifiable quotation can still be published");
  assert.ok(release.criticalTotal > 0, "the release gate passed a package quoting text from no source");
});

test("bound #1 — with NO pinned source corpus, no quotation is flaggable (off-corpus quotes are unfalsifiable)", () => {
  const f = cleanFixture();
  fs.appendFileSync(path.join(f.root, "study-guide", "ch1.md"), `\nThe source records that "${EDITED_QUOTE}".\n`);
  // Remove the corpus so verbatim cannot run — the quotation scan must then flag NOTHING, because a
  // package that pins no source cannot falsify any quote (bound #1, by construction).
  fs.rmSync(path.join(f.inputs, "SOURCE_CORPUS.json"));
  fs.rmSync(path.join(f.inputs, "source.txt"));
  indexSemantic(f.root);
  accept(f.root);
  const { report } = runQa(f);
  assert.equal(report.verbatim.ran, false, "verbatim ran despite the corpus being removed");
  assert.deepEqual(quotationItems(f.root), [], "a quotation was flagged with no pinned source to falsify it against");
});

// TRUST 3c — the BLOCKQUOTE arm. The gate used to abstain on every `>` block (inline-only bound),
// because orz overloads the blockquote: `> **Visual description:** …`, admonitions and worked
// examples reproduce nothing, so acting blind is the alarm-fatigue trap. The wired
// callout-vs-quotation discriminator (research/g3a-blockquote-discriminator-resolution.md) lifts
// recall to ATTRIBUTED blockquote quotations while keeping the callout family silent: it acts iff
// the block carries a reproduction claim (attribution) and is not a callout, and only after
// re-testing the reproduced body so a faithful attributed quote clears on its own attribution words.
const ATTRIBUTED_EDITED_BLOCKQUOTE = `\n> ${EDITED_QUOTE}\n> — Atkins, *Physical Chemistry*\n`;
const ATTRIBUTED_FAITHFUL_BLOCKQUOTE = `\n> ${FAITHFUL_QUOTE}\n> — Atkins, *Physical Chemistry*\n`;

test("TRUST 3c blockquote arm — an ATTRIBUTED EDITED blockquote quotation is queued (recall past inline marks)", () => {
  const f = cleanFixture();
  fs.appendFileSync(path.join(f.root, "study-guide", "ch1.md"), ATTRIBUTED_EDITED_BLOCKQUOTE);
  indexSemantic(f.root);
  accept(f.root);
  const { report } = runQa(f);
  assert.equal(report.semantic.ran, true, "the semantic layer did not run — the quotation scan never looked");
  const items = quotationItems(f.root);
  assert.equal(items.length, 1, `expected the attributed edited blockquote to queue exactly one item, got ${items.length}`);
  assert.ok(items[0].evidence.join("\n").includes("trademark"), "the queued item does not name the edited word");
});

test("TRUST 3c blockquote arm — a FAITHFUL attributed blockquote AND the visual-description callout stay silent (the FP budget)", () => {
  // The clean fixture's study-guide already carries `> **Visual description:** …` — a 13-word matcher
  // hit with no source match (the callout that tripped the broad gate the first time it ran).
  // Appending a faithfully-reproduced attributed blockquote adds a second `>` block whose BODY does
  // match the pinned source. Neither is a reproduction defect, so the gate must be silent on both.
  const f = cleanFixture();
  fs.appendFileSync(path.join(f.root, "study-guide", "ch1.md"), ATTRIBUTED_FAITHFUL_BLOCKQUOTE);
  indexSemantic(f.root);
  accept(f.root);
  const { report } = runQa(f);
  assert.equal(report.semantic.ran, true, "the semantic layer did not run — the quotation scan never looked");
  assert.deepEqual(quotationItems(f.root), [], "a callout or faithful attributed blockquote was flagged as an unverifiable quotation");
});
