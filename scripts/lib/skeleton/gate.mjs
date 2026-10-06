// The gate (skeleton §7; D14, D19-A). It blocks publishing exactly when:
//   an open defect or obligation comes from a stable module or from the skeleton itself;
//   an approval problem is reported (spine approvals arrive in P3);
//   the decision log does not verify against the committed log, or a committed version of it does not extend the
//   version committed before it.
// Questions never block. Trial findings are already questions (the runner), so they cannot block.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { blocksPublish, makeFinding } from "../records/findings.mjs";
import { RECORD_PATHS } from "../records/paths.mjs";
import { readLogText, verifyAgainstCommitted, verifyExtends } from "../records/log.mjs";
import { SKELETON } from "./runner.mjs";

/** The committed log text, from the package's own git. A package without git history cannot be checked. */
// a package's log grows with its history: read it whole (Node's default 1 MB buffer made a 1.2 MB log "unreadable"
// and the package unpublishable — found by the P11 wiring check)
const GIT = { encoding: "utf8", maxBuffer: 1 << 30 };
export function committedLog(root) {
  root = path.resolve(root);
  if (!fs.existsSync(path.join(root, ".git"))) return { ok: false, reason: "the package has no git history" };
  const head = spawnSync("git", ["-C", root, "rev-parse", "--verify", "HEAD"], GIT);
  if (head.status !== 0) return { ok: true, text: "" }; // no commit yet: nothing committed to extend
  const show = spawnSync("git", ["-C", root, "show", `HEAD:${RECORD_PATHS.log}`], GIT);
  if (show.status === 0) return { ok: true, text: show.stdout };
  const tracked = spawnSync("git", ["-C", root, "ls-tree", "--name-only", "HEAD", RECORD_PATHS.log], GIT);
  if (tracked.status === 0 && !tracked.stdout.trim()) return { ok: true, text: "" }; // log not yet committed
  return { ok: false, reason: `the committed log could not be read: ${(show.stderr || "").trim() || show.error?.message || `git exited ${show.status}`}` };
}

/**
 * Every committed version of the log must extend the one committed before it (red team R1 coherence, F10): a past
 * record rewritten, re-chained and committed as an ordinary NEW commit verifies against HEAD, but not against the
 * commit before it. Walks the first-parent history of metadata/LOG.jsonl, oldest first.
 */
export function committedHistoryFailures(root) {
  root = path.resolve(root);
  const list = spawnSync("git", ["-C", root, "rev-list", "--first-parent", "--reverse", "HEAD", "--", RECORD_PATHS.log], GIT);
  if (list.status !== 0) return [];
  let prev = null, prevCommit = null;
  for (const c of list.stdout.split("\n").filter(Boolean)) {
    const show = spawnSync("git", ["-C", root, "show", `${c}:${RECORD_PATHS.log}`], GIT);
    if (show.status !== 0) { if (prev) return [`commit ${c.slice(0, 12)} deleted the committed log (committed at ${prevCommit.slice(0, 12)})`]; continue; }
    // a byte-exact extension is enough here: the newest committed log is itself verified against the working log
    if (prev !== null && !show.stdout.startsWith(prev)) {
      const f = verifyExtends(prev, show.stdout);
      return [`commit ${c.slice(0, 12)} does not extend the log committed at ${prevCommit.slice(0, 12)}: ${f[0] || "not a byte-exact prefix"}`];
    }
    prev = show.stdout; prevCommit = c;
  }
  return [];
}

/** The skeleton's own log check, run on every gate evaluation (req.gate.log-verified). */
export function logFindings(root, basis) {
  const committed = committedLog(root);
  if (!committed.ok) return [makeFinding({ module: SKELETON, kind: "log-unverifiable", units: [], statusClass: "obligation", route: "agent", basis, evidence: { type: "missing", what: committed.reason } })];
  const failures = [...verifyAgainstCommitted(committed.text, readLogText(root)), ...committedHistoryFailures(root)];
  return failures.length ? [makeFinding({ module: SKELETON, kind: "log-broken", units: [], statusClass: "defect", route: "agent", basis, evidence: { type: "rule", rule: "the decision log verifies and extends the committed log", failures } })] : [];
}

export function evaluateGate({ findings = [], maturityOf = () => "stable", approvalProblems = [] }) {
  // Anything not explicitly resolved or answered counts as open (an odd status never hides a finding).
  const open = (f) => f.status !== "resolved" && f.status !== "answered";
  const blocking = findings.filter((f) => open(f) && blocksPublish(f) && (f.module === SKELETON || maturityOf(f.module) === "stable"));
  const questions = findings.filter((f) => open(f) && f.statusClass === "question");
  return { canPublish: blocking.length === 0 && approvalProblems.length === 0, blocking, approvalProblems, questions };
}
