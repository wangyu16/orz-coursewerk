// THE UNIT INDEX, DRIVEN AS THE AGENT RUNS IT (redesign P4, tier T2): the documented commands on the real C2 package.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.dirname(HERE);
const run = (script, ...args) => { const r = spawnSync(process.execPath, [path.join(REPO, "scripts", script), ...args], { encoding: "utf8" }); return { status: r.status, out: r.stdout ? (() => { try { return JSON.parse(r.stdout); } catch { return r.stdout; } })() : null, err: r.stderr }; };
const git = (root, ...a) => assert.equal(spawnSync("git", ["-C", root, ...a]).status, 0, a.join(" "));

test("[req.units.segmenter] [req.units.external-edit] the real C2 package: every line traced; a hand edit is caught at the gate and raised once", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-units-c2-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(HERE, "fixtures", "c2-chemistry-v2", "package"), root, { recursive: true });
  git(root, "init", "-q"); git(root, "config", "user.name", "T"); git(root, "config", "user.email", "t@example.invalid");
  git(root, "add", "-A"); git(root, "commit", "-q", "-m", "approved spine");

  // first index: the pre-existing text is stated to be agent-written (v0.12)
  let r = run("units.mjs", "index", "--root", root, "--initial-origin", "agent-knowledge", "--model", "unrecorded (v0.12 authoring)");
  assert.equal(r.status, 0, r.err);
  assert.equal(r.out.units, 183); assert.deepEqual(r.out.questions, []);
  const st = run("units.mjs", "status", "--root", root).out;
  assert.equal(Object.keys(st.deliverables).length, 6);
  for (const [rel, d] of Object.entries(st.deliverables)) { assert.equal(d.gaps, 0, `${rel}: no prose left out`); assert.deepEqual(Object.keys(d.origins), ["agent-knowledge"]); }
  git(root, "add", "-A"); git(root, "commit", "-q", "-m", "units indexed");
  assert.equal(run("gate.mjs", "--root", root, "--checkpoint", "V2").status, 0, "nothing unindexed");

  // the instructor edits a paragraph by hand: the gate sees an edit not yet indexed
  const sg = path.join(root, "study-guide", "chemical-equilibrium.md");
  fs.writeFileSync(sg, fs.readFileSync(sg, "utf8").replace("This is why the state is called *dynamic* equilibrium.", "That is why we call it a *dynamic* equilibrium — my favourite framing."));
  const json = path.join(root, "..", `gate-${process.pid}.json`); t.after(() => fs.rmSync(json, { force: true }));
  assert.equal(run("gate.mjs", "--root", root, "--checkpoint", "V2", "--json", json).status, 1);
  assert.ok(JSON.parse(fs.readFileSync(json, "utf8")).findings.some((f) => f.kind === "units-not-indexed" && f.statusClass === "obligation"));

  // the agent begins a session, writes its own change, and indexes as agent
  assert.equal(run("units.mjs", "begin", "--root", root, "--model", "claude-opus-5-5").status, 0);
  const pr = path.join(root, "practice", "le-chatelier.md");
  fs.writeFileSync(pr, fs.readFileSync(pr, "utf8").replace(/(::: tab Answer 1\n)/, "$1Short answer first: no. "));
  r = run("units.mjs", "index", "--root", root, "--as", "agent", "--model", "claude-opus-5-5");
  assert.equal(r.status, 0, r.err);
  assert.equal(r.out.agent, 1); assert.equal(r.out.unknown, 1);
  assert.equal(r.out.questions.length, 1); assert.match(r.out.questions[0], /study-guide\/chemical-equilibrium\.md: 1 passage/);
  const origins = run("units.mjs", "status", "--root", root).out.deliverables;
  assert.equal(origins["study-guide/chemical-equilibrium.md"].origins.unknown, 1);
  assert.equal(origins["practice/le-chatelier.md"].origins["agent-knowledge"], 34);
  assert.equal(run("gate.mjs", "--root", root, "--checkpoint", "V2").status, 0, "indexed again; the authorship question never blocks");
});
