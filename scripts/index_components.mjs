#!/usr/bin/env node
// Initialize or attested-refresh the Coursewerk component coherence index.
import fs from "node:fs";
import path from "node:path";
import {
  COMPONENT_INDEX_PATH,
  computeComponentGraph,
  makeComponentIndex,
  loadComponentIndex,
  validateRevisionReview,
  writeComponentIndex,
  coherenceStateFile,
  recordAcceptedCoherence,
} from "./lib/coherence.mjs";
import { commitOutput, ensureOutputGit, outputGitState, commitsTouching } from "./lib/output_git.mjs";
import crypto from "node:crypto";

const args = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const root = path.resolve(opt("--root", "package"));
const initialize = args.includes("--initialize");
const refresh = args.includes("--refresh");
const restore = args.includes("--restore");
const reviewFile = opt("--review");
const stateFile = coherenceStateFile(root);
try { ensureOutputGit(root); }
catch (e) {
  console.error(`index-components: ${e.message}`);
  process.exit(2);
}
if ([initialize, refresh, restore].filter(Boolean).length !== 1) {
  console.error("index-components: choose exactly one of --initialize, --refresh or --restore.");
  process.exit(2);
}
const loaded = loadComponentIndex(root);
if (restore) {
  // A CLONE of a package carries its committed COMPONENT_INDEX.json but not the external ledger
  // (.coursewerk/<name>-component-index-state.json), so it could not be gated — and the only way
  // back was to delete the index and re-initialize, which is exactly the laundering the audit
  // refuses. Restore re-creates the ledger FROM GIT: the committed index bytes at the commit that
  // last touched the index, recorded as action "restore" (visible in every release evaluation).
  // It refuses an existing ledger (nothing to restore) and an uncommitted index (nothing to trust).
  if (fs.existsSync(stateFile)) {
    console.error(`index-components: a ledger already exists at ${stateFile}; --restore is for a clone with none. Use the revision workflow.`);
    process.exit(2);
  }
  if (!loaded.index) {
    console.error(`index-components: ${loaded.error}`);
    process.exit(2);
  }
  const state = outputGitState(root, { paths: [COMPONENT_INDEX_PATH] });
  if (!state.available || !state.clean) {
    console.error(`index-components: ${COMPONENT_INDEX_PATH} must be COMMITTED and unmodified to restore its ledger from git.`);
    process.exit(2);
  }
  const [indexCommit] = commitsTouching(root, COMPONENT_INDEX_PATH);
  if (!indexCommit) {
    console.error(`index-components: git has no commit touching ${COMPONENT_INDEX_PATH}; nothing to restore from.`);
    process.exit(2);
  }
  recordAcceptedCoherence(root, loaded.index, indexCommit, { action: "restore", restoredFrom: indexCommit, restoredAt: new Date().toISOString() });
  console.log(JSON.stringify({ action: "restored", stateFile, acceptedHead: indexCommit, indexSha256: crypto.createHash("sha256").update(JSON.stringify(loaded.index)).digest("hex") }, null, 2));
  process.exit(0);
}
if (initialize) {
  if (loaded.index) {
    console.error(`index-components: ${COMPONENT_INDEX_PATH} already exists; use the revision workflow, not --initialize.`);
    process.exit(2);
  }
  if (fs.existsSync(stateFile)) {
    console.error(`index-components: prior index history exists at ${stateFile}; restore/review the missing index instead of reinitializing.`);
    process.exit(2);
  }
  const graph = computeComponentGraph(root);
  if (graph.components.length === 0) {
    console.error("index-components: no output components found.");
    process.exit(2);
  }
  const file = writeComponentIndex(root, makeComponentIndex(graph));
  const commit = commitOutput(root, "coursewerk: initialize coherent output");
  recordAcceptedCoherence(root, JSON.parse(fs.readFileSync(file, "utf8")), commit.head, { action: "initialize" });
  console.log(JSON.stringify({ action: "initialized", file, components: graph.components.length, relationships: graph.relationships.length, git: commit }, null, 2));
  process.exit(0);
}

if (!loaded.index) {
  console.error(`index-components: ${loaded.error}`);
  process.exit(2);
}
if (!reviewFile || !fs.existsSync(reviewFile)) {
  console.error("index-components: --refresh requires --review <completed revision-impact.json>.");
  process.exit(2);
}
let review;
try { review = JSON.parse(fs.readFileSync(reviewFile, "utf8")); }
catch (e) {
  console.error(`index-components: review file is invalid JSON: ${e.message}`);
  process.exit(2);
}
const validation = validateRevisionReview(root, review);
if (validation.failures.length) {
  console.error("index-components: coherence refresh refused:");
  for (const f of validation.failures) console.error(`- ${f}`);
  process.exit(2);
}
const graph = computeComponentGraph(root);
const file = writeComponentIndex(root, makeComponentIndex(graph));
const commit = commitOutput(root, `coursewerk: coherent revision ${review.planId.slice(0, 12)}`);
recordAcceptedCoherence(root, JSON.parse(fs.readFileSync(file, "utf8")), commit.head, { action: "refresh", reviewPlanId: review.planId });
console.log(JSON.stringify({ action: "refreshed", file, components: graph.components.length, relationships: graph.relationships.length, reviewed: review.reviewed.length, git: commit }, null, 2));
