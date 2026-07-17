// Git lifecycle for Coursewerk output roots.
// Each output is its own repository (the harness workspace ignores package/
// and personal/), giving human edits a durable, inspectable change ledger.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function git(root, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  }
  return result;
}

function ensureIgnore(root) {
  const file = path.join(root, ".gitignore");
  const required = [".DS_Store", "*.md.html", "*.slides.html", "*.paged.html"];
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const lines = new Set(current.split(/\r?\n/).map((x) => x.trim()).filter(Boolean));
  const missing = required.filter((x) => !lines.has(x));
  if (!missing.length) return;
  const prefix = current && !current.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(file, current + prefix + missing.join("\n") + "\n");
}

export function ensureOutputGit(root) {
  root = path.resolve(root);
  fs.mkdirSync(root, { recursive: true });
  let initialized = false;
  if (!fs.existsSync(path.join(root, ".git"))) {
    let result = spawnSync("git", ["-C", root, "init", "-b", "main"], { encoding: "utf8" });
    if (result.status !== 0) result = spawnSync("git", ["-C", root, "init"], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`could not initialize output Git repository: ${result.stderr || result.stdout}`);
    initialized = true;
  }
  ensureIgnore(root);
  const name = git(root, ["config", "--get", "user.name"], { allowFailure: true });
  if (name.status !== 0 || !name.stdout.trim()) git(root, ["config", "user.name", "Coursewerk"]);
  const email = git(root, ["config", "--get", "user.email"], { allowFailure: true });
  if (email.status !== 0 || !email.stdout.trim()) git(root, ["config", "user.email", "coursewerk@local.invalid"]);
  return { root, initialized };
}

export function outputGitState(root) {
  root = path.resolve(root);
  if (!fs.existsSync(path.join(root, ".git"))) return { available: false, root, head: null, changes: [], clean: false };
  const headResult = git(root, ["rev-parse", "--verify", "HEAD"], { allowFailure: true });
  const status = git(root, ["status", "--porcelain=v1", "--untracked-files=all"], { allowFailure: true });
  if (status.status !== 0) {
    return {
      available: false,
      root,
      head: null,
      changes: [],
      clean: false,
      error: (status.stderr || status.stdout || "Git status failed").trim(),
    };
  }
  const changes = status.stdout.split(/\r?\n/).filter(Boolean).map((line) => ({
    status: line.slice(0, 2),
    path: line.slice(3),
  }));
  return {
    available: true,
    root,
    head: headResult.status === 0 ? headResult.stdout.trim() : null,
    changes,
    clean: changes.length === 0,
  };
}

/**
 * Commit the output package.
 *
 * `opts.paths` — commit ONLY these paths (package-relative). Omit for the historical `add -A`.
 *
 * WHY THE PARAMETER EXISTS (added 2026-07-17, found by M11):
 * `add -A` is correct for a step the author ASKED to write (`index:components`, `index:semantic`).
 * It is wrong for a CHECKER. `check_oer.mjs` emits REVIEW_QUEUE.json and must commit it — an emitted
 * artifact that stays uncommitted trips `auditCoherence`'s unfiltered `Git ??` loop, so the package
 * would fail its own gate. But with `add -A` the gate ALSO sweeps up whatever the author happened to
 * have in the tree — half-written prose, private notes, an experiment — into a commit they never asked
 * for and did not review. Nothing is destroyed and the hash gate still reports honestly, so it is not a
 * correctness bypass; it is a CONSENT bypass, which is worse in the way that matters: the tool you ran
 * to *check* your work quietly rewrote your history. A checker's blast radius must be the artifact it
 * emits and nothing else.
 */
export function commitOutput(root, message, opts = {}) {
  ensureOutputGit(root);
  const paths = Array.isArray(opts.paths) ? opts.paths.filter(Boolean) : null;
  if (paths && paths.length === 0) return { committed: false, head: outputGitState(root).head };
  git(root, paths ? ["add", "--", ...paths] : ["add", "-A"]);
  // Staged-only, so an author's unstaged WIP is invisible to the decision as well as to the commit.
  const staged = git(root, ["diff", "--cached", "--name-only"]);
  const nothingStaged = staged.status === 0 && staged.stdout.trim() === "";
  if (nothingStaged) return { committed: false, head: outputGitState(root).head };
  git(root, ["commit", "-m", message]);
  return { committed: true, head: outputGitState(root).head };
}
