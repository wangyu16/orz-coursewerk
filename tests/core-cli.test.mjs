// THE DETERMINISTIC CORE, DRIVEN AS THE AGENT RUNS IT (redesign P5, tier T2): the documented commands on the real,
// approved, linked C2 package. Expectations are read from user-visible artifacts (gate JSON, unit sidecars), never
// from the library.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.dirname(HERE);
const cli = (script, ...args) => spawnSync(process.execPath, [path.join(REPO, "scripts", script), ...args], { encoding: "utf8" });
const git = (root, ...a) => assert.equal(spawnSync("git", ["-C", root, ...a]).status, 0, a.join(" "));
function gateJson(root, checkpoint) {
  const out = path.join(os.tmpdir(), `core-gate-${process.pid}-${checkpoint}-${Math.random().toString(36).slice(2)}.json`);
  const r = cli("gate.mjs", "--root", root, "--checkpoint", checkpoint, "--json", out);
  const j = JSON.parse(fs.readFileSync(out, "utf8")); fs.rmSync(out); return { status: r.status, ...j };
}
const sidecars = (root) => ["study-guide", "slides", "practice"].flatMap((d) => ["chemical-equilibrium", "le-chatelier"].map((c) => JSON.parse(fs.readFileSync(path.join(root, "metadata/units", d, `${c}.md.json`), "utf8")).units)).flat();

test("[req.core.coverage-obligation] [req.core.reverify-obligation] the real C2 package: the core names its open obligations, and a planted value change makes exactly its dependents stale", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-core-c2-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(HERE, "fixtures", "c2-chemistry-v2", "package"), root, { recursive: true });
  git(root, "init", "-q"); git(root, "config", "user.name", "T"); git(root, "config", "user.email", "t@example.invalid"); git(root, "add", "-A"); git(root, "commit", "-q", "-m", "c2");

  // at publish: every objective covered; what is still owed is named — facts awaiting evidence, and the one guide entry short of a question
  let g = gateJson(root, "V8");
  assert.equal(g.status, 1);
  const kinds = g.findings.filter((f) => f.module === "skeleton").reduce((a, f) => ((a[f.kind] = (a[f.kind] || 0) + 1), a), {}); // the core's own findings
  assert.deepEqual(kinds, { "absolute-unreviewed": 31, "evidence-missing": 20, "guide-entry-short": 1 });
  assert.match(g.findings.find((f) => f.kind === "guide-entry-short").evidence.what, /guide\.chemical-equilibrium\.evidence-design \(has 0 of 1\)/);
  assert.deepEqual(g.approvalProblems, []);

  // plant a value change: ΔH of the ammonia synthesis in the Le Chatelier study guide's first equation
  const sg = path.join(root, "study-guide", "le-chatelier.md");
  const text = fs.readFileSync(sg, "utf8");
  const changed = sidecars(root).find((u) => u.locator.deliverable === "study-guide/le-chatelier.md" && u.form === "equation" && text.split("\n").slice(u.locator.lines[0] - 1, u.locator.lines[1]).join("\n").includes("-92"));
  assert.ok(changed, "the equation stating ΔH = -92 kJ/mol exists");
  const expected = sidecars(root).filter((u) => u.stamp && Object.keys(u.stamp).includes(`unit:${changed.id}`)).map((u) => u.id).sort();
  assert.ok(expected.length >= 2, "the value is shared with other units");
  assert.equal(cli("units.mjs", "begin", "--root", root, "--model", "claude-opus-5-5").status, 0);
  fs.writeFileSync(sg, text.replace("\\qquad \\Delta H = -92\\ \\text{kJ mol}^{-1}", "\\qquad \\Delta H = -91.8\\ \\text{kJ mol}^{-1}"));
  assert.equal(cli("units.mjs", "index", "--root", root, "--as", "agent", "--model", "claude-opus-5-5").status, 0);
  g = gateJson(root, "V6");
  const stale = g.findings.filter((f) => f.kind === "reverify").map((f) => f.units[0]).sort();
  assert.deepEqual(stale, expected, "exactly the units that depended on the changed one");
  assert.ok(!stale.includes(changed.id), "the changed unit itself is freshly written, not stale");
  assert.equal(g.status, 1);
});
