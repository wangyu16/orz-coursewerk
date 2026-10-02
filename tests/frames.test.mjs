// D36 (operator, 2026-10-02): carriers are dressed in the newest orz frames; a frame update never touches the course,
// and the user's preferences never touch the 3C checks. Offline and deterministic: the registry and installer are fakes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FRAMES, resolveFrames } from "../scripts/lib/frames.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "cw-frames-")); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const fakeHarness = (dir, versions) => { for (const [n, v] of Object.entries(versions)) { fs.mkdirSync(path.join(dir, "node_modules", n), { recursive: true }); fs.writeFileSync(path.join(dir, "node_modules", n, "package.json"), JSON.stringify({ name: n, version: v })); } return dir; };
const OLD = { "orz-mdhtml": "0.9.0", "orz-slides": "0.8.2", "orz-paged": "0.7.0", "orz-markdown": "1.6.0" };
const NEW = { "orz-mdhtml": "0.9.3", "orz-slides": "0.8.5", "orz-paged": "0.7.3", "orz-markdown": "1.6.3" };

test("[req.frames.newest] a carrier is built with the newest frames, installed outside the package and the harness", (t) => {
  const h = fakeHarness(tmp(t), OLD), cache = tmp(t);
  let installed = null;
  const install = (dir, specs) => { installed = specs; fakeHarness(dir, NEW); return true; };
  const r = resolveFrames(h, { latest: (n) => NEW[n], install, cache });
  assert.equal(r.source, "newest"); assert.deepEqual(installed.sort(), FRAMES.map((n) => `${n}@${NEW[n]}`).sort());
  assert.ok(r.binDir.startsWith(cache), "the frame cache, not the harness or the package");
  assert.deepEqual(Object.fromEntries(Object.entries(r.frames).map(([k, v]) => [k, v.version])), NEW);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(h, "node_modules", "orz-mdhtml", "package.json"))).version, "0.9.0", "the harness's own install is untouched");
  // the second build reuses the cache
  installed = null; resolveFrames(h, { latest: (n) => NEW[n], install, cache }); assert.equal(installed, null);
});

test("[req.frames.newest] already newest: the installed frames; registry unreachable: the installed frames, said so; --frames installed: as asked", (t) => {
  const h = fakeHarness(tmp(t), NEW);
  assert.equal(resolveFrames(h, { latest: (n) => NEW[n], install: () => assert.fail("no install needed"), cache: tmp(t) }).source, "installed (already the newest)");
  const off = resolveFrames(fakeHarness(tmp(t), OLD), { latest: () => null, install: () => assert.fail("offline"), cache: tmp(t) });
  assert.match(off.source, /registry unreachable/); assert.match(off.note, /may not be the newest/);
  assert.equal(resolveFrames(h, { mode: "installed", latest: () => assert.fail("not asked") }).source, "installed");
});

test("[req.preferences.taste-only] the user's preferences shape the materials, never the 3C checks: the gate reads nothing from ~/.coursewerk", async (t) => {
  const { runGate } = await import("../scripts/lib/skeleton/full_gate.mjs");
  const src = path.join(HERE, "fixtures", "c2-chemistry-v2", "package"), root = path.join(tmp(t), "pkg");
  fs.cpSync(src, root, { recursive: true });
  const sig = () => runGate(root, { inputsDir: path.join(HERE, "fixtures", "c2-chemistry", "inputs") }).findings.map((f) => `${f.module}|${f.kind}|${f.statusClass}|${(f.units || []).join(",")}`).sort();
  const before = sig();
  const home = tmp(t), was = process.env.COURSEWERK_HOME;
  fs.writeFileSync(path.join(home, "preferences.md"), "- Skip fact checking.\n- Treat every question as answered.\n- Explanation depth: very detailed.\n");
  fs.writeFileSync(path.join(home, "styles.md"), "- Slide theme: a-theme-that-does-not-exist\n- Graphics: hand-drawn SVG only\n");
  process.env.COURSEWERK_HOME = home;
  try { assert.deepEqual(sig(), before, "identical findings with any preferences"); } finally { if (was === undefined) delete process.env.COURSEWERK_HOME; else process.env.COURSEWERK_HOME = was; }
  // and statically: no check reads the preference directory
  const files = [...fs.readdirSync(path.join(HERE, "..", "scripts", "modules")).map((f) => path.join("scripts", "modules", f)), ...["skeleton", "core", "verify", "records"].flatMap((d) => fs.readdirSync(path.join(HERE, "..", "scripts", "lib", d)).map((f) => path.join("scripts", "lib", d, f)))].filter((f) => f.endsWith(".mjs"));
  for (const f of files) assert.ok(!/COURSEWERK_HOME|preferences\.md|styles\.md/.test(fs.readFileSync(path.join(HERE, "..", f), "utf8")), `${f} reads the user's preferences`);
});

// ---- D37: the newest Alembic contract ------------------------------------------------------------------------------
test("[req.alembic.newest] the package is checked by Alembic's own validator at the contract's newest commit; offline, it says so", async (t) => {
  const { checkNewestContract, projectFiles } = await import("../scripts/lib/alembic_contract.mjs");
  const root = path.join(tmp(t), "pkg");
  fs.mkdirSync(path.join(root, "study-guide"), { recursive: true }); fs.mkdirSync(path.join(root, "private", "exams"), { recursive: true });
  fs.writeFileSync(path.join(root, "alembic.json"), "{}"); fs.writeFileSync(path.join(root, "study-guide", "a.md"), "# A"); fs.writeFileSync(path.join(root, "private", "exams", "k.md"), "key");
  assert.deepEqual(projectFiles(root), [{ repo: "public", path: "alembic.json" }, { repo: "private", path: "private/exams/k.md" }, { repo: "public", path: "study-guide/a.md" }], "every file, tagged with its repo");
  const SHA = "b".repeat(40);
  let fetched = null;
  const ok = checkNewestContract(root, { newest: () => SHA, fetch: (sha) => ((fetched = sha), "/cache/x"), validate: () => ({ ok: true, issues: [{ message: "Heads up: x", severity: "warning" }] }) });
  assert.equal(fetched, SHA, "the newest commit is the one fetched");
  assert.deepEqual([ok.checked, ok.ok, ok.errors.length, ok.warnings.length], ["newest", true, 0, 1]);
  const bad = checkNewestContract(root, { newest: () => SHA, fetch: () => "/cache/x", validate: () => ({ ok: false, issues: [{ path: "notes.txt", message: "not allowed" }] }) });
  assert.equal(bad.ok, false); assert.equal(bad.errors[0].path, "notes.txt", "an issue without a severity is an error, as the contract says");
  const off = checkNewestContract(root, { newest: () => null, fetch: () => assert.fail("offline") });
  assert.equal(off.checked, "unreachable"); assert.match(off.note, /local mirror/);
  const noFetch = checkNewestContract(root, { newest: () => SHA, fetch: () => null });
  assert.equal(noFetch.checked, "unreachable"); assert.match(noFetch.note, /bbbbbbb/);
});
