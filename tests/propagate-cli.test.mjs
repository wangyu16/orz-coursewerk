// The propagation engine's PRODUCT PATH (F-B closed): a documented command plans, applies with a
// receipt, refuses inside immutable regions, and never touches a package it was not asked to.
//
// Before this, `applyMechanical` was reachable only from the study harness, and usage test 11 ("an
// edit is never auto-applied inside a direct quotation") passed VACUOUSLY — no documented command
// auto-applied anything. These tests drive `scripts/propagate.mjs` as a child process and prove the
// guard on the real path: a rename lands in prose, the quotation keeps the old words, the receipt
// can verify and reverse every edit, a second run is a no-op, a dirty tree is refused, and the gate
// then sees the rename as a RENAME. Free, offline, deterministic.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { acceptBaseline } from "./helpers/baseline.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(REPO, "tests", "fixtures", "usage-package");
const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const cli = (script, args) => {
  const res = spawnSync(process.execPath, [path.join(REPO, "scripts", script), ...args], { cwd: REPO, encoding: "utf8", env: ENV });
  return { code: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
};
const git = (cwd, ...a) => spawnSync("git", a, { cwd, encoding: "utf8", env: ENV });
const read = (pkg, rel) => fs.readFileSync(path.join(pkg, rel), "utf8");
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const RENAME = ["--term", "term.melting-point", "--from", "melting point", "--to", "fusion point"];
// --apply executes THE PLAN YOU READ: every apply is preceded by the dry run that writes it.
const planThenApply = (pkg, out, extra = []) => { const p = cli("propagate.mjs", ["--root", pkg, "--out", out, ...RENAME]); assert.equal(p.code, 0, p.stderr); return cli("propagate.mjs", ["--root", pkg, "--out", out, ...RENAME, "--apply", ...extra]); };
const QUOTE = '"the melting point of pure water at standard pressure is 0 °C"';

function indexedPackage(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-propagate-"));
  const pkg = path.join(dir, "package");
  fs.cpSync(FIXTURE, pkg, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(pkg, "init", "-q", "."); git(pkg, "add", "-A"); git(pkg, "commit", "-qm", "baseline");
  assert.equal(cli("index_components.mjs", ["--root", pkg, "--initialize"]).code, 0);
  assert.equal(cli("index_semantic.mjs", ["--root", pkg]).code, 0);
  return { dir, pkg, out: path.join(dir, "reports") };
}
const treeHash = (pkg) => git(pkg, "rev-parse", "HEAD:").stdout.trim();

test("P.0 · dry run plans outside the package and writes NOTHING into it", (t) => {
  const { pkg, out } = indexedPackage(t);
  const before = treeHash(pkg);
  const res = cli("propagate.mjs", ["--root", pkg, "--out", out, ...RENAME]);
  assert.equal(res.code, 0, res.stderr);
  const printed = JSON.parse(res.stdout);
  assert.equal(printed.action, "planned");
  assert.ok(printed.mechanical > 0, "the fixture has mechanical rename sites");
  const plan = JSON.parse(fs.readFileSync(path.join(out, "propagation-plan.json"), "utf8"));
  assert.equal(plan.change.termId, "term.melting-point");
  assert.equal(git(pkg, "status", "--porcelain").stdout.trim(), "", "dry run must leave the tree clean");
  assert.equal(treeHash(pkg), before);
  assert.ok(read(pkg, "study-guide/melting.md").includes("melting point"), "prose untouched by a dry run");
});

test("P.1 · --apply renames in prose, keeps the QUOTATION verbatim, files a verifiable + reversible receipt, commits only the edited files", (t) => {
  const { pkg, out } = indexedPackage(t);
  const sgBefore = read(pkg, "study-guide/melting.md");
  assert.ok(sgBefore.includes(QUOTE), "fixture must carry the direct quotation");
  const res = planThenApply(pkg, out, ["--authorized-by", "instructor", "--reason", "house terminology"]);
  assert.equal(res.code, 0, res.stderr);
  const printed = JSON.parse(res.stdout);
  assert.equal(printed.action, "applied");
  assert.ok(printed.applied > 0);
  const sgAfter = read(pkg, "study-guide/melting.md");
  assert.ok(sgAfter.includes("fusion point"), "the rename landed in prose");
  assert.ok(sgAfter.includes(QUOTE), "the quotation still says what the author said — a rewritten quote is a fabrication");
  // the receipt VERIFIES: every applied entry's after-hash is the file's hash now, and its `after`
  // text sits at `offset` — and REVERSES: swapping `after` back to `before` restores the bytes.
  const receipt = JSON.parse(fs.readFileSync(path.join(out, "propagation-receipt.json"), "utf8"));
  assert.equal(receipt.change.authorizedBy, "instructor");
  for (const a of receipt.applied) {
    const now = read(pkg, a.file);
    assert.equal(sha(now), a.fileHashAfter, `${a.file}: receipt hash must be the file's hash`);
    // `before`/`after` are the CLAIM SPAN on both sides — enough context to read months later
    assert.ok(/melting point/i.test(a.before) && !/melting point/i.test(a.after), `${a.claimId}: the old label left the span`);
    assert.ok(/fusion point/i.test(a.after), `${a.claimId}: the new label entered the span`);
    assert.equal(a.from, "melting point"); assert.equal(a.to, "fusion point");
  }
  assert.equal(receipt.offsetBasis, "before-text");
  const byFile = new Map();
  for (const a of receipt.applied) byFile.set(a.file, [...(byFile.get(a.file) ?? []), a]);
  for (const [file, entries] of byFile) {
    // offsets are BEFORE-text coordinates: in the after-text an edit sits shifted by the length
    // deltas of every edit before it. Reverse from the highest offset down so earlier positions hold.
    const asc = [...entries].sort((x, y) => x.offset - y.offset);
    let text = read(pkg, file);
    for (let i = asc.length - 1; i >= 0; i--) {
      const a = asc[i];
      const shift = asc.slice(0, i).reduce((n, e) => n + (e.after.length - e.before.length), 0);
      const pos = a.offset + shift;
      assert.equal(text.slice(pos, pos + a.after.length), a.after, `${file}@${a.offset}: after-text sits at the recorded (shifted) offset`);
      text = text.slice(0, pos) + a.before + text.slice(pos + a.after.length);
    }
    assert.equal(sha(text), entries[0].fileHashBefore, `${file}: reversing every edit restores the before-hash`);
  }
  // consent boundary: the commit carries exactly the edited files
  assert.equal(git(pkg, "status", "--porcelain").stdout.trim(), "", "applied edits are committed");
  const committed = git(pkg, "show", "--name-only", "--format=", "HEAD").stdout.trim().split("\n").sort();
  assert.deepEqual(committed, [...new Set(receipt.applied.map((a) => a.file))].sort());
  assert.match(git(pkg, "log", "-1", "--format=%s").stdout, /propagate rename term\.melting-point/);
});

test("P.2 · a second --apply is a no-op: nothing to rename, nothing committed", (t) => {
  const { pkg, out } = indexedPackage(t);
  assert.equal(planThenApply(pkg, out).code, 0);
  const head = git(pkg, "rev-parse", "HEAD").stdout.trim();
  const again = planThenApply(pkg, out);
  assert.equal(again.code, 0, again.stderr);
  const printed = JSON.parse(again.stdout);
  assert.equal(printed.applied, 0);
  assert.equal(git(pkg, "rev-parse", "HEAD").stdout.trim(), head, "no commit for a no-op");
});

test("P.3 · --apply refuses an uncommitted tree — an automatic edit never sweeps up the author's WIP", (t) => {
  const { pkg, out } = indexedPackage(t);
  fs.appendFileSync(path.join(pkg, "practice/melting.md"), "\nWork in progress.\n");
  const res = planThenApply(pkg, out);
  assert.equal(res.code, 3);
  assert.match(res.stderr, /uncommitted/);
  assert.ok(read(pkg, "study-guide/melting.md").includes("melting point"), "nothing was applied");
});

test("P.4 · the documented REVISION LOOP closes it: gate refuses → impact → attested review → refresh → re-index → gate passes", (t) => {
  const { pkg, out, dir } = indexedPackage(t);
  assert.equal(planThenApply(pkg, out).code, 0);
  const json = path.join(dir, "qa.json");

  // (1) the gate REFUSES: the components changed after the last coherence review — exactly the
  // "clean git ≠ coherent package" promise — while the semantic layer reports the rename as movement
  const first = cli("check_oer.mjs", ["--package", pkg, "--json", json]);
  assert.equal(first.code, 1, "an unreviewed propagation must not pass the gate");
  const r1 = JSON.parse(fs.readFileSync(json, "utf8"));
  assert.ok(r1.criticalCounts.coherenceFailures > 0, "component coherence must demand the review");
  // "fusion point" is a REGISTERED ALIAS of term.melting-point, so at the claim level this rename
  // moves neither the label layer (same term ids) nor the content layer (same semantic core): it
  // obliges NOTHING — the headline null-edit guarantee holding for a vocabulary-preserving rename.
  // The component layer still demands review because bytes changed; that is the two-layer design.
  assert.equal(r1.semantic.revision.compared, true);
  assert.equal(r1.semantic.revision.actions, 0, "an alias-to-alias rename obliges no claim-level action");
  assert.equal(r1.semantic.freshness.fresh, false, "the stored index predates the rename (claim text/offsets moved)");

  // (2) revision impact names the exact review set — every file the propagation touched
  const planFile = path.join(dir, "revision-impact.json");
  assert.equal(cli("revision_impact.mjs", ["--root", pkg, "--json", planFile, "--report", path.join(dir, "revision-impact.md")]).code, 0);
  const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
  const receipt = JSON.parse(fs.readFileSync(path.join(out, "propagation-receipt.json"), "utf8"));
  const touched = new Set(receipt.applied.map((a) => a.file));
  for (const f of touched) assert.ok(plan.requiredReview.some((c) => c.path === f) || plan.changed.some((c) => c.path === f), `${f} must be in the plan`);

  // (3) the instructor attests the review; the refresh accepts the new coherent state
  plan.reviewed = plan.requiredReview.map((c) => c.id);
  plan.attestation = "Reviewed every renamed occurrence against the receipt; meaning unchanged, quotation intact.";
  fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));
  const refresh = cli("index_components.mjs", ["--root", pkg, "--refresh", "--review", planFile]);
  assert.equal(refresh.code, 0, refresh.stderr);

  // (4) accept the semantic baseline — through the decision sheet — and the gate passes clean
  assert.equal(acceptBaseline(REPO, pkg).accept.code, 0);
  const last = cli("check_oer.mjs", ["--package", pkg, "--json", json]);
  assert.equal(last.code, 0, last.stderr);
  const r2 = JSON.parse(fs.readFileSync(json, "utf8"));
  assert.equal(r2.criticalTotal, 0);
  assert.equal(r2.semantic.freshness.fresh, true);
  assert.equal(r2.semantic.revision.actions, 0, "after acceptance nothing is pending");
});

test("P.5 · unknown term, missing labels, and an --out inside the package are refused before anything is read or written", (t) => {
  const { pkg, out } = indexedPackage(t);
  assert.equal(cli("propagate.mjs", ["--root", pkg, "--out", out, "--term", "term.nope", "--from", "a", "--to", "b"]).code, 2);
  assert.equal(cli("propagate.mjs", ["--root", pkg, "--out", out, "--term", "term.melting-point"]).code, 2);
  const inside = cli("propagate.mjs", ["--root", pkg, "--out", path.join(pkg, "reports"), ...RENAME]);
  assert.equal(inside.code, 2);
  assert.equal(fs.existsSync(path.join(pkg, "reports")), false);
});
