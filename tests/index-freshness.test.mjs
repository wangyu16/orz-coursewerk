// Derived-index FRESHNESS (G15h) — the silent-strand class both shipped gates were blind to.
//
// The component gate hashes FILES and the claim-level gate diffs CLAIMS. Neither asks whether the
// committed SPINE/TERMS/CLAIMS still describe the package: a concept-map edit committed without
// `index:semantic`, a stale preferred label, a claim whose text drifted under unchanged fingerprints
// — all read as "nothing moved". These tests drive the documented commands (never a library import)
// and prove the gate now (a) reports byte-freshness of every stored artifact, (b) queues a stale
// index that produced NO movement signal as one `stale-index` decision, (c) does NOT queue the
// ordinary mid-edit state where the revision layer already asks for review, and (d) refuses release
// on any staleness. Free, offline, deterministic.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(REPO, "tests", "fixtures", "usage-package");
const SPINE = "metadata/SPINE.json";
const TERMS = "metadata/TERMS.json";
const QUEUE = "metadata/REVIEW_QUEUE.json";

function cli(script, args) {
  const res = spawnSync(process.execPath, [path.join(REPO, "scripts", script), ...args], {
    cwd: REPO, encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
  });
  return { code: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}
const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
const read = (pkg, rel) => fs.readFileSync(path.join(pkg, rel), "utf8");
const write = (pkg, rel, text) => fs.writeFileSync(path.join(pkg, rel), text);

function indexedPackage(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-fresh-"));
  const pkg = path.join(dir, "package");
  fs.cpSync(FIXTURE, pkg, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(pkg, "init", "-q", ".");
  git(pkg, "add", "-A");
  git(pkg, "commit", "-qm", "baseline");
  assert.equal(cli("index_components.mjs", ["--root", pkg, "--initialize"]).code, 0);
  assert.equal(cli("index_semantic.mjs", ["--root", pkg]).code, 0);
  return pkg;
}

function gate(pkg, extra = []) {
  const json = path.join(pkg, "..", "qa.json");
  const res = cli("check_oer.mjs", ["--package", pkg, "--json", json, ...extra]);
  return { ...res, json: JSON.parse(fs.readFileSync(json, "utf8")) };
}
const staleItems = (pkg) => JSON.parse(read(pkg, QUEUE)).items.filter((i) => i.kind === "stale-index");
const commitAll = (pkg, msg) => { git(pkg, "add", "-A"); git(pkg, "commit", "-qm", msg); };

test("F.0 · a freshly indexed package reports every stored artifact byte-fresh, and queues nothing", (t) => {
  const pkg = indexedPackage(t);
  const r = gate(pkg);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(r.json.semantic.freshness, { checked: true, fresh: true, stale: [], committed: true });
  assert.equal(staleItems(pkg).length, 0);
});

test("F.1 · a committed SPINE.json that no longer describes the map is a SILENT strand: queued as stale-index, blocks release", (t) => {
  const pkg = indexedPackage(t);
  const spine = JSON.parse(read(pkg, SPINE));
  assert.ok(spine.edges.length > 0, "fixture must declare at least one prerequisite edge");
  spine.edges = spine.edges.slice(1);                       // the map still declares it; the committed index lost it
  write(pkg, SPINE, JSON.stringify(spine, null, 2) + "\n");
  commitAll(pkg, "stale spine, committed");                 // clean git ≠ fresh index
  assert.equal(git(pkg, "status", "--porcelain").stdout.trim(), "", "the strand must be COMMITTED — that is the point");

  const authoring = gate(pkg);
  const f = authoring.json.semantic.freshness;
  assert.equal(f.checked, true);
  assert.equal(f.fresh, false);
  assert.deepEqual(f.stale.map((s) => s.path), [SPINE]);
  assert.equal(authoring.json.semantic.revision.actions, 0, "no claim moved — exactly the class the old gates could not see");
  const items = staleItems(pkg);
  assert.equal(items.length, 1, "one human decision: re-index and re-attest");
  assert.equal(items[0].severity, "review");
  assert.match(items[0].evidence.join("\n"), /SPINE\.json/);
  assert.match(items[0].evidence.join("\n"), /index:semantic/, "the item must name the command that fixes it");

  const release = gate(pkg, ["--for-discovery"]);
  assert.notEqual(release.code, 0, "release must refuse a stale index");
  assert.ok(release.json.discoverability.blockers.some((b) => /stale/.test(b) && /SPINE\.json/.test(b)), release.json.discoverability.blockers.join("\n"));
});

test("F.2 · a stale TERMS.json (stale preferred label) is caught the same way — the class, not one instance", (t) => {
  const pkg = indexedPackage(t);
  const terms = JSON.parse(read(pkg, TERMS));
  const term = terms.terms.find((x) => x.preferredLabel);
  assert.ok(term, "fixture must carry a term with a preferred label");
  term.preferredLabel = term.preferredLabel + " (stale)";
  write(pkg, TERMS, JSON.stringify(terms, null, 2) + "\n");
  commitAll(pkg, "stale terms, committed");
  const r = gate(pkg);
  assert.equal(r.json.semantic.freshness.fresh, false);
  assert.deepEqual(r.json.semantic.freshness.stale.map((s) => s.path), [TERMS]);
  assert.equal(staleItems(pkg).length, 1);
});

test("F.3 · the ordinary mid-edit state (a real prose edit, not yet re-indexed) is reported stale but NOT queued as a strand", (t) => {
  const pkg = indexedPackage(t);
  const sg = "study-guide/melting.md";
  const before = read(pkg, sg);
  const after = before.replace("pure water is 0 °C.", "pure water is 5 °C.");
  assert.notEqual(after, before, "the fixture's known value edit must apply");
  write(pkg, sg, after);
  const r = gate(pkg);
  assert.equal(r.json.semantic.freshness.fresh, false, "CLAIMS.json is stale after a value edit");
  assert.ok(r.json.semantic.revision.actions > 0, "the revision layer saw the edit — this is its job, not the freshness audit's");
  assert.equal(staleItems(pkg).length, 0, "no double-reporting: the revision findings already ask for review");
});

test("F.4 · re-indexing restores freshness — the fix the queue item names actually clears it", (t) => {
  const pkg = indexedPackage(t);
  const spine = JSON.parse(read(pkg, SPINE));
  spine.edges = [];
  write(pkg, SPINE, JSON.stringify(spine, null, 2) + "\n");
  commitAll(pkg, "stale spine");
  assert.equal(staleItems((gate(pkg), pkg)).length, 1);
  assert.equal(cli("index_semantic.mjs", ["--root", pkg]).code, 0);
  const r = gate(pkg);
  assert.equal(r.json.semantic.freshness.fresh, true);
  assert.equal(staleItems(pkg).length, 0);
  assert.equal(gate(pkg, ["--for-discovery"]).json.discoverability.blockers.some((b) => /stale/.test(b)), false);
});

test("F.5 · a package with no stored index is not 'stale' — absence stays an answer, not a fault", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-fresh-none-"));
  const pkg = path.join(dir, "package");
  fs.cpSync(FIXTURE, pkg, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const r = gate(pkg);
  assert.equal(r.json.semantic, undefined, "additive-when-off: no semantic block without an index (spec §6.2)");
});
