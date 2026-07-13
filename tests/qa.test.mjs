import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { renderAttribution } from "../scripts/lib/assurance.mjs";
import { computeComponentGraph, makeComponentIndex, recordAcceptedCoherence, writeComponentIndex } from "../scripts/lib/coherence.mjs";
import { commitOutput, ensureOutputGit } from "../scripts/lib/output_git.mjs";

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
    outputAuthors: [{ name: "QA Course Author", role: "author", rightsHolder: true }],
    privacy: { containsPersonalData: false, containsRestrictedContent: false },
    sources: [{ id: "source-1", title: "Example Source", edition: "1", publisher: "Example", canonicalUrl: "https://example.org/source", role: "primary", use: "reference", scope: ["chapter 1"], rightsBasis: { type: "open-license", license: "CC-BY-4.0", evidenceType: "official-publisher-page", evidenceUrl: "https://example.org/license", verifiedAt: "2026-07-13", evidenceSnapshot: "metadata/evidence/source-1.txt", evidenceSha256: sha(evidence), evidenceVerifiedBy: "fixture", processUseReview: { schemaVersion: 1, scannedAt: "2026-07-13T00:00:00Z", status: "no-restriction-detected", notices: [] } }, requiredAttribution: { textIncludes: "Source:", url: "https://example.org/source", placement: "every-public-deliverable" } }],
  };
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
    "concepts/course.md": `# Course${credit}\n## Summary\nSequence.\n## Keywords\nquality, course, fixture\n`,
    "concepts/ch1.md": `# Concept${credit}\n## Source and Scope\nChapter.\n## Summary\nSummary.\n## Prerequisites\nNone.\n## Objectives\nObjective 1.\n`,
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
  writeJson(path.join(inputs, "SOURCE_CORPUS.json"), { schemaVersion: 1, sources: [{ sourceId: "source-1", comparisonMode: "automatic", originalPath: ".coursewerk-source-original/source-1.txt", originalSha256: sha(sourceText), canonicalUrl: "https://example.org/source", retrievedAt: "2026-07-13T00:00:00Z", extractor: { tool: "coursewerk", schemaVersion: 1, sourceFormat: ".txt" }, textPath: "source.txt", sha256: sha(sourceText), minimumWords: 100 }] });
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
