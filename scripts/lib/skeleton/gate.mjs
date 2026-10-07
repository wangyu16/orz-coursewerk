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
 * commit before it.
 *
 * EVERY commit reachable from HEAD is checked against EVERY parent (R2 coherence, F5): a forged log committed on an
 * orphan branch, with the real history merged in by `git merge -s ours`, sits first in the first-parent chain, but its
 * merge commit does not extend its second parent. And the log at every ANCHOR — each commit the current branch's reflog
 * remembers, each remote-tracking branch and each tag — must be a prefix of HEAD's log or extend it: a squash onto a
 * new root leaves no parent to compare with, but the branch's reflog (and any pushed copy) still holds the old log.
 *
 * Out of reach (the scope edge, as R1 F10 was for a re-chained log before it): a history rewritten onto a new root
 * with every anchor removed too — the reflog expired, no remote-tracking branch or tag left — has nothing in the package
 * to compare with. A shipped pack carries the log (pack_v2.mjs) and its receipt names the log's last record
 * (logHead), which is the anchor outside the package for that case.
 */
export function committedHistoryFailures(root) {
  root = path.resolve(root);
  const git = (args, input) => spawnSync("git", ["-C", root, ...args], { ...GIT, ...(input !== undefined ? { input } : {}) });
  const list = git(["rev-list", "--parents", "--reverse", "HEAD"]);
  if (list.status !== 0) return [];
  const commits = list.stdout.split("\n").filter(Boolean).map((l) => l.split(" "));
  const blobs = blobsOf(git, commits.map(([c]) => c));
  const texts = new Map(), text = (b) => { if (!texts.has(b)) texts.set(b, git(["cat-file", "blob", b]).stdout); return texts.get(b); };
  const short = (c) => c.slice(0, 12);
  for (const [c, ...parents] of commits) {
    const mine = blobs.get(c);
    for (const p of parents) {
      const theirs = blobs.get(p);
      if (!theirs || theirs === mine) continue;
      if (!mine) return [`commit ${short(c)} deleted the committed log (committed at ${short(p)})`];
      // a byte-exact extension is enough here: the newest committed log is itself verified against the working log
      if (!text(mine).startsWith(text(theirs))) {
        const f = verifyExtends(text(theirs), text(mine));
        return [`commit ${short(c)} does not extend the log committed at ${short(p)}${parents.length > 1 ? " (a parent of the merge)" : ""}: ${f[0] || "not a byte-exact prefix"}`];
      }
    }
  }
  // anchors: what the branch's reflog remembers, and what was pushed or tagged
  const head = blobs.get(commits.at(-1)?.[0]);
  if (!head) return [];
  const seen = new Set(blobs.values());
  const anchors = [];
  const branch = git(["symbolic-ref", "-q", "HEAD"]).stdout.trim();
  if (branch) anchors.push(...git(["reflog", "show", "--format=%H", branch, "--"]).stdout.split("\n").filter(Boolean).map((c) => [c, `the ${branch.replace(/^refs\/heads\//, "")} branch's reflog`]));
  anchors.push(...git(["for-each-ref", "--format=%(refname)", "refs/remotes", "refs/tags"]).stdout.split("\n").filter(Boolean).map((r) => [r, r]));
  const anchorBlobs = blobsOf(git, anchors.map(([c]) => c));
  for (const [c, what] of anchors) {
    const b = anchorBlobs.get(c);
    if (!b || seen.has(b)) continue;
    seen.add(b);
    const a = text(b), h = text(head);
    if (!h.startsWith(a) && !a.startsWith(h)) return [`the log committed at ${short(c)} (${what}) is not an earlier or later version of HEAD's log: the history was rewritten (${verifyExtends(a, h)[0] || "not a byte-exact prefix"})`];
  }
  return [];
}
// commit (or ref) → the blob id of its committed log, or null
function blobsOf(git, revs) {
  const out = new Map();
  if (!revs.length) return out;
  const r = git(["cat-file", "--batch-check=%(objectname) %(objecttype)"], revs.map((c) => `${c}:${RECORD_PATHS.log}`).join("\n") + "\n");
  const lines = (r.stdout || "").split("\n");
  revs.forEach((c, i) => { const m = /^([0-9a-f]{40,64}) blob$/.exec(lines[i] || ""); out.set(c, m ? m[1] : null); });
  return out;
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
