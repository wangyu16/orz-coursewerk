#!/usr/bin/env node
import path from "node:path";
import { ensureOutputGit, outputGitState } from "./lib/output_git.mjs";

const args = process.argv.slice(2);
const i = args.indexOf("--root");
const root = path.resolve(i >= 0 ? args[i + 1] : "package");
try {
  const result = ensureOutputGit(root);
  const state = outputGitState(root);
  console.log(JSON.stringify({ root, initialized: result.initialized, head: state.head, clean: state.clean, changes: state.changes.length }, null, 2));
} catch (e) {
  console.error(`init-output-git: ${e.message}`);
  process.exit(2);
}
