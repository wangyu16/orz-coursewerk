import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computeCoursewerkImpact, computeCoursewerkIndex, validateCoursewerkReview, verifyCoursewerkIndex, verifyCoursewerkRevision, writeCoursewerkIndex } from "../scripts/lib/system_index.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function copyIndexedSource(source, target) {
  const excluded = new Set([".git", "node_modules", "package", "personal", "inputs", "preview", "reports", "dist", "examples", ".coursewerk"]);
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.isDirectory() && excluded.has(entry.name)) continue;
    if (entry.name === "COURSEWERK_INDEX.json" && path.basename(source) === "system") continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyIndexedSource(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

function git(root, args) {
  const run = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
}

test("Coursewerk system registry has valid claim evidence and canonical output", () => {
  const index = computeCoursewerkIndex(repo);
  assert.deepEqual(index.validationFailures, []);
  assert.deepEqual(verifyCoursewerkIndex(repo).failures, []);
});

test("branch impact propagates product claim changes to synchronized documentation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-system-index-"));
  copyIndexedSource(repo, root);
  writeCoursewerkIndex(root, computeCoursewerkIndex(root));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.name", "Coursewerk Test"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "baseline"]);
  fs.appendFileSync(path.join(root, "FEATURES.md"), "\nBranch change.\n");
  const impact = computeCoursewerkImpact(root, { baseRef: "main" });
  assert.ok(impact.changed.includes("FEATURES.md"));
  assert.ok(impact.requiredReview.includes("README.md"));
  assert.ok(impact.impactedClaims.length > 0);
  const review = { ...impact, reviewed: impact.requiredReview, testResults: impact.requiredTests.map((testPath) => ({ path: testPath, status: "passed" })), attestation: "Reviewed every impacted component and claim against the branch baseline." };
  assert.deepEqual(validateCoursewerkReview(root, review, { baseRef: "main" }).failures, []);
  fs.appendFileSync(path.join(root, "README.md"), "\nLater change.\n");
  assert.match(validateCoursewerkReview(root, review, { baseRef: "main" }).failures.join("\n"), /stale/);
});

test("a concurrent target-branch update invalidates branch review", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-system-branches-"));
  copyIndexedSource(repo, root);
  writeCoursewerkIndex(root, computeCoursewerkIndex(root));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.name", "Coursewerk Test"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "baseline"]);
  git(root, ["switch", "-c", "feature"]);
  fs.appendFileSync(path.join(root, "FEATURES.md"), "\nFeature branch change.\n");
  git(root, ["add", "FEATURES.md"]);
  git(root, ["commit", "-m", "feature"]);
  const before = computeCoursewerkImpact(root, { baseRef: "main" });
  git(root, ["switch", "main"]);
  fs.appendFileSync(path.join(root, "CHANGELOG.md"), "\nConcurrent main change.\n");
  git(root, ["add", "CHANGELOG.md"]);
  git(root, ["commit", "-m", "main moved"]);
  git(root, ["switch", "feature"]);
  const after = computeCoursewerkImpact(root, { baseRef: "main" });
  assert.notEqual(after.planId, before.planId);
  assert.equal(after.branchBehindTarget, true);
});

test("accepted Coursewerk revision records are append-only across a branch", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-system-ledger-"));
  copyIndexedSource(repo, root);
  const recordId = "a".repeat(64);
  const recordFile = path.join(root, "system", "revisions", `${recordId}.json`);
  fs.mkdirSync(path.dirname(recordFile), { recursive: true });
  fs.writeFileSync(recordFile, JSON.stringify({
    schemaVersion: 1,
    planId: recordId,
    baseRef: "main",
    baseCommit: null,
    requiredReview: [],
    reviewed: [],
    testResults: [],
    attestation: "This historical test record was reviewed and accepted.",
    generatedIndexHash: "b".repeat(64),
    acceptedAt: "2026-07-13T00:00:00.000Z",
  }, null, 2));
  writeCoursewerkIndex(root, computeCoursewerkIndex(root));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.name", "Coursewerk Test"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "baseline"]);
  git(root, ["switch", "-c", "feature"]);
  const record = JSON.parse(fs.readFileSync(recordFile, "utf8"));
  record.attestation = "This accepted historical record was improperly rewritten.";
  fs.writeFileSync(recordFile, JSON.stringify(record, null, 2));
  const result = verifyCoursewerkRevision(root, { baseRef: "main" });
  assert.match(result.failures.join("\n"), /append-only: M system\/revisions/);
});
