// The gate (skeleton §7; D14, D19-A). It blocks publishing exactly when:
//   an open defect or obligation comes from a stable module or from the skeleton itself;
//   an approval problem is reported (spine approvals arrive in P3);
//   the decision log does not verify against the committed log.
// Questions never block. Trial findings are already questions (the runner), so they cannot block.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { blocksPublish, makeFinding } from "../records/findings.mjs";
import { RECORD_PATHS } from "../records/paths.mjs";
import { readLogText, verifyAgainstCommitted } from "../records/log.mjs";
import { SKELETON } from "./runner.mjs";

/** The committed log text, from the package's own git. A package without git history cannot be checked. */
export function committedLog(root) {
  root = path.resolve(root);
  if (!fs.existsSync(path.join(root, ".git"))) return { ok: false, reason: "the package has no git history" };
  const head = spawnSync("git", ["-C", root, "rev-parse", "--verify", "HEAD"], { encoding: "utf8" });
  if (head.status !== 0) return { ok: true, text: "" }; // no commit yet: nothing committed to extend
  const show = spawnSync("git", ["-C", root, "show", `HEAD:${RECORD_PATHS.log}`], { encoding: "utf8" });
  if (show.status === 0) return { ok: true, text: show.stdout };
  const tracked = spawnSync("git", ["-C", root, "ls-tree", "--name-only", "HEAD", RECORD_PATHS.log], { encoding: "utf8" });
  if (tracked.status === 0 && !tracked.stdout.trim()) return { ok: true, text: "" }; // log not yet committed
  return { ok: false, reason: `the committed log could not be read: ${(show.stderr || "").trim()}` };
}

/** The skeleton's own log check, run on every gate evaluation (req.gate.log-verified). */
export function logFindings(root, basis) {
  const committed = committedLog(root);
  if (!committed.ok) return [makeFinding({ module: SKELETON, kind: "log-unverifiable", units: [], statusClass: "obligation", route: "agent", basis, evidence: { type: "missing", what: committed.reason } })];
  const failures = verifyAgainstCommitted(committed.text, readLogText(root));
  return failures.length ? [makeFinding({ module: SKELETON, kind: "log-broken", units: [], statusClass: "defect", route: "agent", basis, evidence: { type: "rule", rule: "the decision log verifies and extends the committed log", failures } })] : [];
}

export function evaluateGate({ findings = [], maturityOf = () => "stable", approvalProblems = [] }) {
  // Anything not explicitly resolved or answered counts as open (an odd status never hides a finding).
  const open = (f) => f.status !== "resolved" && f.status !== "answered";
  const blocking = findings.filter((f) => open(f) && blocksPublish(f) && (f.module === SKELETON || maturityOf(f.module) === "stable"));
  const questions = findings.filter((f) => open(f) && f.statusClass === "question");
  return { canPublish: blocking.length === 0 && approvalProblems.length === 0, blocking, approvalProblems, questions };
}
