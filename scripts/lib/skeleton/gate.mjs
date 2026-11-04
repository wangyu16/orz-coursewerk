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
import { parseLog, readLogText, verifyAgainstCommitted, verifyExtends, verifyLog } from "../records/log.mjs";
import { sha256 } from "../records/canonical.mjs";
import { HOST_FILE, alembicHost } from "../records/host.mjs";
import { SKELETON } from "./runner.mjs";

/** The committed log text, from the package's own git. A package without git history cannot be checked. */
// a package's log grows with its history: read it whole (Node's default 1 MB buffer made a 1.2 MB log "unreadable"
// and the package unpublishable — found by the P11 wiring check)
//
// Git is read as it is, never as it is told to look (red team R3 coherence, F7): `git replace` (refs/replace/*) and a
// graft file make every read of an object return another one while every object id, commit, reflog entry and ref
// stays the same — so every committed log could be swapped for a forged one. Every git call of the log and history
// checks runs with replacement off and no graft file, and a package whose git has either is log-broken by itself.
const NO_GRAFTS = path.join(path.sep, "nonexistent", "coursewerk-no-grafts");
const GIT_ENV = (() => { const e = { ...process.env, GIT_NO_REPLACE_OBJECTS: "1", GIT_GRAFT_FILE: NO_GRAFTS }; delete e.GIT_REPLACE_REF_BASE; return e; })();
const GIT = { encoding: "utf8", maxBuffer: 1 << 30, env: GIT_ENV };
const gitRaw = (root, args, input) => spawnSync("git", ["--no-replace-objects", "-C", root, ...args], { ...GIT, ...(input !== undefined ? { input } : {}) });

/** What in a package's git would make git show other objects than the ones its ids name: replace refs, a graft file. */
export function objectSubstitutions(root) {
  root = path.resolve(root);
  if (!fs.existsSync(path.join(root, ".git"))) return [];
  const out = [];
  const reps = gitRaw(root, ["for-each-ref", "--format=%(refname)", "refs/replace/"]).stdout.split("\n").filter(Boolean);
  if (reps.length) out.push(`the package's git replaces objects (${reps.length} ref(s) under refs/replace/, e.g. ${reps[0]}): what git shows is not what its commits hold`);
  const common = gitRaw(root, ["rev-parse", "--git-common-dir"]).stdout.trim();
  const dirs = [...new Set([common && path.resolve(root, common), path.join(root, ".git")].filter(Boolean))];
  if (dirs.some((d) => fs.existsSync(path.join(d, "info", "grafts")))) out.push("the package's git has a graft file (info/grafts): it rewrites the parents git reports");
  return out;
}

export function committedLog(root) {
  root = path.resolve(root);
  if (!fs.existsSync(path.join(root, ".git"))) return { ok: false, reason: "the package has no git history" };
  const head = gitRaw(root, ["rev-parse", "--verify", "HEAD"]);
  if (head.status !== 0) return { ok: true, text: "" }; // no commit yet: nothing committed to extend
  const show = gitRaw(root, ["show", `HEAD:${RECORD_PATHS.log}`]);
  if (show.status === 0) return { ok: true, text: show.stdout };
  const tracked = gitRaw(root, ["ls-tree", "--name-only", "HEAD", RECORD_PATHS.log]);
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
 * merge commit does not extend its second parent. And the log at every ANCHOR — each commit HEAD's reflog remembers,
 * every local branch and its reflog, each remote-tracking branch and each tag (R4 F3) — must be a prefix of the current
 * log: a squash onto a new root, or a forgery committed on a new branch made at an old commit, leaves no parent to
 * compare with, but the reflogs and the other branches still hold the old log.
 *
 * Out of reach (the scope edge, as R1 F10 was for a re-chained log before it): a history rewritten onto a new root
 * with every anchor removed too — every reflog expired, no other branch, remote-tracking branch or tag left — has
 * nothing in the package to compare with. A shipped pack carries the log (pack_v2.mjs) and its receipt names the log's
 * last record (logHead), the anchor outside the package for that case (releaseAnchorFailures).
 */
export function committedHistoryFailures(root) {
  root = path.resolve(root);
  const git = (args, input) => gitRaw(root, args, input);
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
  // anchors (red team R4 coherence F3: the current branch's reflog alone let a forgery committed on a NEW branch, made
  // at an old commit, pass while master and HEAD's own reflog still held the true log): HEAD's reflog (.git/logs/HEAD —
  // every commit HEAD was ever at, on any branch), every local branch and its reflog, every remote-tracking branch and
  // tag. The current history must EXTEND every anchor's log: each is a byte-exact prefix of the working log.
  const head = blobs.get(commits.at(-1)?.[0]);
  if (!head) return [];
  const working = readLogText(root);
  const seen = new Set([head]);
  const anchors = [];
  const reflog = (ref, what) => git(["reflog", "show", "--format=%H", ref, "--"]).stdout.split("\n").filter(Boolean).map((c) => [c, what]);
  anchors.push(...reflog("HEAD", "HEAD's reflog"));
  for (const ref of git(["for-each-ref", "--format=%(refname)", "refs/heads"]).stdout.split("\n").filter(Boolean)) {
    const name = ref.replace(/^refs\/heads\//, "");
    anchors.push([ref, `the ${name} branch`], ...reflog(ref, `the ${name} branch's reflog`));
  }
  anchors.push(...git(["for-each-ref", "--format=%(refname)", "refs/remotes", "refs/tags"]).stdout.split("\n").filter(Boolean).map((r) => [r, r]));
  const anchorBlobs = blobsOf(git, anchors.map(([c]) => c));
  for (const [c, what] of anchors) {
    const b = anchorBlobs.get(c);
    if (!b || seen.has(b)) continue;
    seen.add(b);
    const a = text(b);
    if (!working.startsWith(a)) return [`the log committed at ${short(c)} (${what}) is not an earlier version of the current log: the history was rewritten (${verifyExtends(a, working)[0] || "not a byte-exact prefix"})`];
  }
  return [];
}

/**
 * A release is an anchor outside the package (R2 F5, R4 F3): the receipt of the last pack (`<title>.release.json`, in
 * the `dist` directory beside the package, or any directory named) names the log's last record then (logHead). A
 * package whose log — or whose committed history at HEAD — no longer holds that record as it was had its history
 * rewritten since that release.
 */
export function releaseAnchorFailures(root, { releaseDirs = null } = {}) {
  root = path.resolve(root);
  let title = null; try { title = JSON.parse(fs.readFileSync(path.join(root, "alembic.json"), "utf8")).title || "course"; } catch { return []; }
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "course";
  const dirs = releaseDirs || [path.join(path.dirname(root), "dist")];
  const working = parseLog(readLogText(root));
  const committed = committedLog(root), headRecs = committed.ok ? parseLog(committed.text) : [];
  const out = [];
  for (const dir of dirs) for (const name of [`${base}.release.json`, `${base}.private.release.json`]) {
    let r = null; try { r = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")); } catch { continue; }
    const h = r?.logHead; if (!h?.seq || !h.hash) continue;
    const held = working.find((x) => x.seq === h.seq);
    if (held?.hash !== h.hash) { out.push(`the decision log does not hold record ${h.seq} as it was when ${name} was packed: its history was rewritten since that release`); continue; }
    const inHead = headRecs.find((x) => x.seq === h.seq);
    if (headRecs.length && headRecs.at(-1).seq >= h.seq && inHead?.hash !== h.hash) out.push(`the log committed at HEAD does not hold record ${h.seq} as it was when ${name} was packed: HEAD's history lacks the published log`);
  }
  return out;
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

/**
 * The host anchor (req.gate.host-anchor, owner 2026-11-02). In an Alembic assistant job the package is a plain folder
 * with no git; site_import.mjs wrote `.coursewerk-host.json`, naming the decision log as Alembic held it when the job
 * pulled it (its sha256 and length). There, the committed log IS that imported log: the working log must verify and
 * its first `log.bytes` bytes must hash to `log.sha256`, i.e. it extends what the host holds.
 *
 * Why this is safe without git: Alembic is the history keeper of a site, and it refuses any change to an existing
 * record file that is not a pure append at its end (and any deletion of one). Whatever the job hands back must
 * therefore extend the log Alembic holds — the same rule git's committed log enforces locally. The host record lives
 * in the job's working copy and could itself be edited; that only weakens this early check, never Alembic's: a
 * rewritten history is refused at the hand-back (site_handback.mjs) and again by Alembic.
 *
 * The git-history checks (every committed version extending the one before, reflog and branch anchors, release
 * receipts) have nothing to read in a job — the history is Alembic's — so they are skipped in host mode, and a
 * finding says so. Returns null when the package is not in host mode (git present, or no host record).
 */
export function hostLogFailures(root) {
  root = path.resolve(root);
  const host = alembicHost(root);
  if (!host) return null;
  if (host.error) return { unverifiable: host.error };
  if (host.state !== "imported") return { unverifiable: `${HOST_FILE} says the folder was handed back to Alembic (site layout): pull it and run site_import.mjs before checking it` };
  const file = path.join(root, RECORD_PATHS.log);
  const working = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0);
  const failures = [];
  if (working.length < host.log.bytes || sha256(working.subarray(0, host.log.bytes)) !== host.log.sha256)
    failures.push(`the decision log no longer extends the one Alembic holds (imported ${host.importedAt || ""}: ${host.log.bytes} bytes, sha256 ${host.log.sha256.slice(0, 12)}…): a record Alembic holds was changed, removed or reordered`);
  failures.push(...verifyLog(working.toString("utf8")));
  return { failures };
}
const HOST_NOTE = "host mode (Alembic job, no git): the log is checked against the one Alembic holds; the git-history checks (committed versions, reflog and branch anchors, release receipts) are skipped — Alembic keeps the history and accepts only appended records";

/** The skeleton's own log check, run on every gate evaluation (req.gate.log-verified). */
export function logFindings(root, basis) {
  const hosted = hostLogFailures(root);
  if (hosted?.unverifiable) return [makeFinding({ module: SKELETON, kind: "log-unverifiable", units: [], statusClass: "obligation", route: "agent", basis, evidence: { type: "missing", what: hosted.unverifiable } })];
  if (hosted) return hosted.failures.length ? [makeFinding({ module: SKELETON, kind: "log-broken", units: [], statusClass: "defect", route: "agent", basis, evidence: { type: "rule", rule: "the decision log verifies and extends the log Alembic holds", failures: hosted.failures, note: HOST_NOTE } })] : [];
  const committed = committedLog(root);
  if (!committed.ok) return [makeFinding({ module: SKELETON, kind: "log-unverifiable", units: [], statusClass: "obligation", route: "agent", basis, evidence: { type: "missing", what: committed.reason } })];
  const failures = [...objectSubstitutions(root), ...verifyAgainstCommitted(committed.text, readLogText(root)), ...committedHistoryFailures(root), ...releaseAnchorFailures(root)];
  return failures.length ? [makeFinding({ module: SKELETON, kind: "log-broken", units: [], statusClass: "defect", route: "agent", basis, evidence: { type: "rule", rule: "the decision log verifies and extends the committed log", failures } })] : [];
}

export function evaluateGate({ findings = [], maturityOf = () => "stable", approvalProblems = [] }) {
  // Anything not explicitly resolved or answered counts as open (an odd status never hides a finding).
  const open = (f) => f.status !== "resolved" && f.status !== "answered";
  const blocking = findings.filter((f) => open(f) && blocksPublish(f) && (f.module === SKELETON || maturityOf(f.module) === "stable"));
  const questions = findings.filter((f) => open(f) && f.statusClass === "question");
  return { canPublish: blocking.length === 0 && approvalProblems.length === 0, blocking, approvalProblems, questions };
}
