import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scanProcessRestrictions } from "../scripts/lib/rights_preflight.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("process notice excerpts use normalized visible text", () => {
  const notices = scanProcessRestrictions('<div class="noise"><p>This book may not be used in the training of large language models or otherwise be ingested into large language models or generative AI offerings without permission.</p></div>');
  assert.equal(notices.length, 1);
  assert.doesNotMatch(notices[0].excerpt, /class=|<p>|<div/);
  assert.match(notices[0].excerpt, /This book may not be used/);
});

function run(script, args) {
  return spawnSync(process.execPath, [path.join(repo, "scripts", script), ...args], {
    cwd: repo,
    encoding: "utf8",
  });
}

function writeOwnedFoundation(root, sourceId) {
  fs.mkdirSync(path.join(root, "metadata"), { recursive: true });
  fs.writeFileSync(path.join(root, "metadata", "FOUNDATION.json"), JSON.stringify({
    schemaVersion: 1,
    sources: [{ id: sourceId, rightsBasis: { type: "owned", attestedByUser: true } }],
  }));
}

test("source preparation extracts normalized text and records its digest", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-source-tool-"));
  const inputs = path.join(root, "inputs");
  const source = path.join(root, "source.md");
  const text = `# Source\n\n${Array.from({ length: 120 }, (_, index) => `word${index}`).join("  ")}\n`;
  fs.writeFileSync(source, text);
  writeOwnedFoundation(root, "primary");

  const result = run("prepare_source_corpus.mjs", ["--root", root, "--inputs", inputs, "--source-id", "primary", "--file", source]);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(inputs, "SOURCE_CORPUS.json"), "utf8"));
  const entry = manifest.sources[0];
  const extracted = fs.readFileSync(path.join(inputs, entry.textPath), "utf8");
  assert.equal(entry.comparisonMode, "automatic");
  assert.equal(entry.wordCount, 121);
  assert.equal(entry.sha256, crypto.createHash("sha256").update(extracted).digest("hex"));
  assert.equal(entry.originalSha256, crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex"));
  assert.ok(fs.existsSync(path.join(inputs, entry.originalPath)));
  assert.equal(entry.extractor.tool, "coursewerk");
  assert.ok(entry.extractor.version);
  assert.match(extracted, /^# Source/);
});

test("source preparation records an explicit human attestation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-source-attestation-"));
  const inputs = path.join(root, "inputs");
  writeOwnedFoundation(root, "physical-copy");
  const result = run("prepare_source_corpus.mjs", [
    "--root", root,
    "--inputs", inputs,
    "--source-id", "physical-copy",
    "--human-attested",
    "--attested-by", "Course author",
    "--attested-at", "2026-07-13",
    "--reason", "The licensed print source has no extractable digital text.",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(inputs, "SOURCE_CORPUS.json"), "utf8"));
  assert.deepEqual(manifest.sources[0], {
    sourceId: "physical-copy",
    comparisonMode: "human-attested",
    attestedBy: "Course author",
    attestedAt: "2026-07-13",
    reason: "The licensed print source has no extractable digital text.",
  });
});

test("source preparation fails before reading when process restrictions are unresolved", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-source-preflight-"));
  const inputs = path.join(root, "inputs");
  const source = path.join(root, "source.md");
  fs.writeFileSync(source, `# Source\n\n${"word ".repeat(120)}`);
  const evidence = "This material may not be ingested into a large language model or generative AI offering without permission.";
  fs.mkdirSync(path.join(root, "metadata", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(root, "metadata", "evidence", "restricted.html"), evidence);
  fs.writeFileSync(path.join(root, "metadata", "FOUNDATION.json"), JSON.stringify({
    schemaVersion: 1,
    sources: [{
      id: "restricted",
      rightsBasis: {
        type: "open-license",
        evidenceSnapshot: "metadata/evidence/restricted.html",
        evidenceSha256: crypto.createHash("sha256").update(evidence).digest("hex"),
        processUseReview: { status: "blocked-pending-decision", notices: [{ id: "generative-ai-ingestion" }] },
      },
    }],
  }));
  const result = run("prepare_source_corpus.mjs", ["--root", root, "--inputs", inputs, "--source-id", "restricted", "--file", source]);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /pre-ingestion clearance .* blocked/);
  assert.equal(fs.existsSync(path.join(inputs, "SOURCE_CORPUS.json")), false);
});

test("rights evidence capture stores a snapshot and updates the foundation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-rights-tool-"));
  fs.mkdirSync(path.join(root, "metadata"), { recursive: true });
  const foundation = {
    schemaVersion: 1,
    sources: [{
      id: "source-1",
      rightsBasis: { evidenceUrl: "https://example.org/license" },
    }],
  };
  fs.writeFileSync(path.join(root, "metadata", "FOUNDATION.json"), JSON.stringify(foundation));
  const evidence = path.join(root, "official-license.html");
  const bytes = Buffer.from("<html><body>Creative Commons Attribution 4.0</body></html>\n");
  fs.writeFileSync(evidence, bytes);

  const result = run("capture_rights_evidence.mjs", ["--root", root, "--source-id", "source-1", "--operator-name", "Course author", "--operator-type", "human", "--file", evidence]);
  assert.equal(result.status, 0, result.stderr);
  const updated = JSON.parse(fs.readFileSync(path.join(root, "metadata", "FOUNDATION.json"), "utf8"));
  const rights = updated.sources[0].rightsBasis;
  assert.equal(rights.evidenceSnapshot, "metadata/evidence/source-1.html");
  assert.deepEqual(rights.evidenceCapture.operator, { type: "human", name: "Course author" });
  assert.equal(rights.evidenceRetrieval.captureMode, "local-file");
  assert.ok(rights.preflightReceipt);
  assert.ok(fs.existsSync(path.join(root, rights.preflightReceipt)));
  assert.equal(rights.processUseReview.status, "no-restriction-detected");
  assert.equal(rights.evidenceSha256, crypto.createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual(fs.readFileSync(path.join(root, rights.evidenceSnapshot)), bytes);
});

test("rights capture records and blocks an explicit AI-ingestion restriction", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-rights-restriction-"));
  fs.mkdirSync(path.join(root, "metadata"), { recursive: true });
  fs.writeFileSync(path.join(root, "metadata", "FOUNDATION.json"), JSON.stringify({ schemaVersion: 1, sources: [{ id: "restricted", rightsBasis: { evidenceUrl: "https://example.org/restricted" } }] }));
  const evidence = path.join(root, "restriction.html");
  fs.writeFileSync(evidence, "This book may not be used in the training of large language models or otherwise be ingested into large language models or generative AI offerings without Example Publisher's permission.");
  const result = run("capture_rights_evidence.mjs", ["--root", root, "--source-id", "restricted", "--operator-name", "Course author", "--operator-type", "human", "--file", evidence]);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /requires permission or a recorded qualified decision/);
  const updated = JSON.parse(fs.readFileSync(path.join(root, "metadata", "FOUNDATION.json"), "utf8"));
  assert.equal(updated.sources[0].rightsBasis.processUseReview.status, "blocked-pending-decision");
  assert.equal(updated.sources[0].rightsBasis.processUseReview.notices[0].id, "generative-ai-ingestion");
  const receipt = JSON.parse(fs.readFileSync(path.join(root, updated.sources[0].rightsBasis.preflightReceipt), "utf8"));
  assert.equal(receipt.status, "blocked");
});

test("known-source expected notice is enforced before source preparation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-known-source-preflight-"));
  const inputs = path.join(root, "inputs");
  fs.mkdirSync(path.join(root, "metadata"), { recursive: true });
  fs.writeFileSync(path.join(root, "metadata", "FOUNDATION.json"), JSON.stringify({
    schemaVersion: 1,
    sources: [{
      id: "openstax-chemistry-2e",
      title: "Chemistry 2e",
      publisher: "OpenStax",
      canonicalUrl: "https://openstax.org/books/chemistry-2e/pages/6-introduction",
      role: "primary",
      use: "adaptation",
      scope: ["chapter 6"],
      rightsBasis: {
        type: "open-license",
        license: "CC-BY-NC-SA-4.0",
        evidenceUrl: "https://openstax.org/books/chemistry-2e/pages/preface",
      },
    }],
  }));
  const evidence = path.join(root, "incomplete-evidence.html");
  fs.writeFileSync(evidence, "<p>Attribution-NonCommercial-ShareAlike 4.0</p>");
  const capture = run("capture_rights_evidence.mjs", ["--root", root, "--source-id", "openstax-chemistry-2e", "--operator-name", "test automation", "--operator-type", "automation", "--file", evidence]);
  assert.equal(capture.status, 3);
  assert.match(capture.stderr, /expected process notice generative-ai-ingestion/);

  const source = path.join(root, "source.txt");
  fs.writeFileSync(source, "word ".repeat(150));
  const prepare = run("prepare_source_corpus.mjs", ["--root", root, "--inputs", inputs, "--source-id", "openstax-chemistry-2e", "--file", source]);
  assert.equal(prepare.status, 3);
  assert.equal(fs.existsSync(path.join(inputs, "SOURCE_CORPUS.json")), false);

  const report = path.join(root, "new", "reports", "preflight.md");
  const assurance = run("check_assurance.mjs", ["--root", root, "--phase", "pre-ingestion", "--report", report]);
  assert.equal(assurance.status, 1);
  const summary = JSON.parse(assurance.stdout);
  assert.equal(summary.ingestionReady, false);
  assert.equal("privateUseReady" in summary, false);
  assert.equal(summary.phaseReady, false);
  assert.ok(fs.existsSync(report));
  assert.doesNotMatch(fs.readFileSync(report, "utf8"), /## Publication blockers/);
});

test("English Wikipedia policy clears only with its official license markers", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-wikipedia-preflight-"));
  fs.mkdirSync(path.join(root, "metadata"), { recursive: true });
  fs.writeFileSync(path.join(root, "metadata", "FOUNDATION.json"), JSON.stringify({
    schemaVersion: 1,
    sources: [{
      id: "wikipedia-photosynthesis",
      title: "Photosynthesis",
      publisher: "Wikipedia contributors",
      canonicalUrl: "https://en.wikipedia.org/wiki/Photosynthesis",
      role: "primary",
      use: "adaptation",
      scope: ["whole article"],
      rightsBasis: {
        type: "open-license",
        license: "CC-BY-SA-4.0",
        evidenceUrl: "https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use",
      },
    }],
  }));
  const evidence = path.join(root, "wikimedia-terms.html");
  fs.writeFileSync(evidence, "<p>Creative Commons Attribution-ShareAlike 4.0</p><p>When you reuse or redistribute a text page, attribution is required.</p>");
  const capture = run("capture_rights_evidence.mjs", ["--root", root, "--source-id", "wikipedia-photosynthesis", "--operator-name", "test automation", "--operator-type", "automation", "--file", evidence]);
  assert.equal(capture.status, 0, capture.stderr);
  const summary = JSON.parse(capture.stdout);
  assert.equal(summary.policyId, "english-wikipedia-text");
  assert.equal(summary.status, "cleared");
});
