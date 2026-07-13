import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
    sources: [{ id: sourceId, rightsBasis: { type: "owned" } }],
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
  assert.match(result.stderr, /source preparation is blocked/);
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

  const result = run("capture_rights_evidence.mjs", ["--root", root, "--source-id", "source-1", "--verified-by", "Course author", "--file", evidence]);
  assert.equal(result.status, 0, result.stderr);
  const updated = JSON.parse(fs.readFileSync(path.join(root, "metadata", "FOUNDATION.json"), "utf8"));
  const rights = updated.sources[0].rightsBasis;
  assert.equal(rights.evidenceSnapshot, "metadata/evidence/source-1.html");
  assert.equal(rights.evidenceVerifiedBy, "Course author");
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
  const result = run("capture_rights_evidence.mjs", ["--root", root, "--source-id", "restricted", "--verified-by", "Course author", "--file", evidence]);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /require permission or a recorded qualified decision/);
  const updated = JSON.parse(fs.readFileSync(path.join(root, "metadata", "FOUNDATION.json"), "utf8"));
  assert.equal(updated.sources[0].rightsBasis.processUseReview.status, "blocked-pending-decision");
  assert.equal(updated.sources[0].rightsBasis.processUseReview.notices[0].id, "generative-ai-ingestion");
});
