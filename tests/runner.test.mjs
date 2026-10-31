// MODULE CONTRACT, RUNNER AND GATE (redesign P2). Modules are real files run in their own processes, as in
// production; each test writes the modules it needs into a scratch module directory.
// Each test names the requirement(s) it closes in system/REQUIREMENTS.json.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { validateManifest, INTERRUPT_REASONS } from "../scripts/lib/skeleton/manifest.mjs";
import { runCheckpoint, moduleFile } from "../scripts/lib/skeleton/runner.mjs";
import { evaluateGate, logFindings } from "../scripts/lib/skeleton/gate.mjs";
import { promoteModule, unloggedPromotions } from "../scripts/lib/skeleton/promotion.mjs";
import { buildWiringReport } from "../scripts/lib/skeleton/wiring.mjs";
import { appendLogRecord } from "../scripts/lib/records/log.mjs";
import { readRegistry, writeRegistry } from "../scripts/lib/records/registry.mjs";

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-runner-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"), mods = path.join(dir, "modules");
  fs.mkdirSync(path.join(root, "study-guide"), { recursive: true }); fs.mkdirSync(mods);
  fs.writeFileSync(path.join(root, "study-guide", "ch1.md"), "# Chapter 1\n\nWater boils at 100 °C at sea level.\n");
  return { root, mods };
}
const manifest = (over = {}) => ({ name: "demo", version: "1.0.0", serves: ["Confidence"], checkpoints: ["V3"], reads: ["deliverables"],
  method: "deterministic", cost: "per file", profiles: ["public", "private"], maturity: "stable", mayBlock: true,
  emits: [{ kind: "wrong-value", statusClass: "defect", evidenceType: "rule", route: "agent" },
          { kind: "no-source", statusClass: "obligation", evidenceType: "missing", route: "agent" },
          { kind: "unclear", statusClass: "question", evidenceType: "judgment", route: "digest" }], ...over });
const DEFECT = `[{ kind: "wrong-value", units: ["u-1"], evidence: { type: "rule", rule: "boiling point", expected: "100 °C" } }]`;
/** Write a module file: body strings are JavaScript for run(s) and recheck(d, s). */
function writeModule(mods, { manifest: m = manifest(), run = `return ${DEFECT};`, recheck = "return true;", extra = "" } = {}) {
  fs.writeFileSync(path.join(mods, `${m.name}.mjs`), `import fs from "node:fs";\n${extra}\nexport default { manifest: ${JSON.stringify(m)},\n  run(s) { ${run} },\n  ${recheck === null ? "" : `recheck(d, s) { ${recheck} },`} };\n`);
}
const reg = (...modules) => ({ schemaVersion: 1, modules: modules.map(([name, maturity = "stable", enabled = true, version = "1.0.0"]) => ({ name, version, maturity, enabled })) });
const run = (s, registry, o = {}) => runCheckpoint({ root: s.root, checkpoint: "V3", profile: "public", registry, moduleDir: s.mods, ...o });
const kinds = (r) => r.findings.map((f) => `${f.module}/${f.kind}:${f.statusClass}`);

test("[req.modules.manifest] a manifest declares every contract field; an invalid module is not admitted and the skeleton says so", (t) => {
  assert.deepEqual(validateManifest(manifest()), []);
  const bad = validateManifest({ name: "Bad Name", version: "1", serves: ["Speed"], checkpoints: ["V9"], reads: [], method: "vibes", profiles: ["team"], maturity: "beta", emits: [] }).join("\n");
  for (const re of [/lowercase slug/, /semver/, /serves/, /checkpoints/, /reads/, /method/, /cost/, /profiles/, /maturity/, /mayBlock/, /emits/]) assert.match(bad, re);
  assert.match(validateManifest(manifest({ mayBlock: false })).join(), /may not block can only emit questions/);
  assert.match(validateManifest(manifest({ name: "skeleton" })).join(), /reserved/);
  const s = scratch(t);
  writeModule(s.mods, { manifest: manifest({ version: "x" }) });
  assert.deepEqual(kinds(run(s, reg(["demo"]))), ["skeleton/module-invalid:obligation"]);
  writeModule(s.mods, { recheck: null });
  assert.match(run(s, reg(["demo"])).findings[0].evidence.what, /must provide recheck/);
});

test("[req.modules.snapshot] a module is a function of a read-only snapshot; the same snapshot gives identical findings", (t) => {
  const s = scratch(t);
  writeModule(s.mods, { run: `return s.text("study-guide/ch1.md").includes("100 °C") ? ${DEFECT} : [];` });
  const a = run(s, reg(["demo"])), b = run(s, reg(["demo"]));
  assert.equal(JSON.stringify(a.findings), JSON.stringify(b.findings));
  assert.equal(a.findings[0].basis, a.snapshot.id);
  writeModule(s.mods, { run: `s.files["study-guide/ch1.md"].text = "changed"; return [];` });
  assert.deepEqual(kinds(run(s, reg(["demo"]))), ["skeleton/module-failed:obligation"], "the snapshot is frozen");
  // inherited keys are not files
  writeModule(s.mods, { run: `Object.prototype["ghost.md"] = { text: "boo" }; return s.text("ghost.md") === null ? [] : ${DEFECT};` });
  assert.deepEqual(run(s, reg(["demo"])).findings, []);
});

test("[req.modules.no-writes] any write during a module's lifetime is caught and its findings discarded", (t) => {
  const s = scratch(t);
  const target = JSON.stringify(path.join(s.root, "study-guide", "gen.md"));
  const cases = {
    "in run": { run: `fs.writeFileSync(${target}, "x"); return ${DEFECT};` },
    "in recheck": { recheck: `fs.writeFileSync(${target}, "y"); return true;` },
    "a git hook": { run: `fs.mkdirSync(${JSON.stringify(path.join(s.root, ".git", "hooks"))}, { recursive: true }); fs.writeFileSync(${JSON.stringify(path.join(s.root, ".git", "hooks", "pre-commit"))}, "#!/bin/sh"); return [];` },
  };
  // a write scheduled for after run() returns never happens: the host exits as soon as its output is written
  writeModule(s.mods, { run: `setTimeout(() => fs.writeFileSync(${target}, "z"), 20); return ${DEFECT};` });
  assert.deepEqual(kinds(run(s, reg(["demo"]))), ["demo/wrong-value:defect"]);
  assert.equal(fs.existsSync(path.join(s.root, "study-guide", "gen.md")), false);
  for (const [label, c] of Object.entries(cases)) {
    fs.rmSync(path.join(s.root, "study-guide", "gen.md"), { force: true });
    fs.mkdirSync(path.join(s.root, ".git", "hooks"), { recursive: true });
    fs.rmSync(path.join(s.root, ".git", "hooks", "pre-commit"), { force: true });
    writeModule(s.mods, c);
    const r = run(s, reg(["demo"]));
    assert.deepEqual(kinds(r), ["skeleton/module-wrote-package:defect"], label);
    assert.deepEqual(r.wiring.discarded, [{ name: "demo", reason: "wrote to the package" }], label);
  }
});

test("[req.modules.admission] a defect is kept only when its evidence re-runs; a module cannot pick its own class or route", (t) => {
  const s = scratch(t);
  writeModule(s.mods);
  assert.deepEqual(kinds(run(s, reg(["demo"]))), ["demo/wrong-value:defect"]);
  for (const recheck of ["return false;", 'throw new Error("boom");', 'return "yes";', "return 1;", "return Promise.resolve(false);"]) {
    writeModule(s.mods, { recheck });
    const f = run(s, reg(["demo"])).findings[0];
    assert.equal(f.statusClass, "question", recheck); assert.equal(f.admission, "evidence did not re-run"); assert.equal(f.route, "digest");
  }
  // a draft claiming its own class, route, module or status is ignored
  writeModule(s.mods, { run: `return [{ kind: "unclear", statusClass: "defect", route: "interrupt", module: "skeleton", status: "resolved", units: [], evidence: { type: "judgment", note: "x" } }];` });
  const q = run(s, reg(["demo"])).findings[0];
  assert.equal(`${q.module}/${q.statusClass}/${q.route}/${q.status}`, "demo/question/digest/open");
  // a module that rewrites its own manifest at run time gains nothing: the manifest copy is taken before run()
  writeModule(s.mods, { manifest: manifest({ mayBlock: false, emits: [{ kind: "unclear", statusClass: "question", evidenceType: "judgment", route: "digest" }] }),
    run: `this.manifest.emits[0].statusClass = "defect"; this.manifest.emits[0].route = "interrupt"; return [{ kind: "unclear", units: [], evidence: { type: "rule" } }];` });
  assert.deepEqual(kinds(run(s, reg(["demo"]))), ["demo/unclear:question"]);
  // undeclared kinds, and kinds read through a changing getter, are not admitted as declared
  writeModule(s.mods, { run: `return [{ kind: "surprise", units: [], evidence: { type: "rule" } }];` });
  assert.deepEqual(kinds(run(s, reg(["demo"]))), ["skeleton/undeclared-kind:question"]);
  writeModule(s.mods, { run: `let n = 0; return [{ get kind() { return n++ ? "surprise" : "wrong-value"; }, units: [], evidence: { type: "rule" } }];` });
  assert.equal(run(s, reg(["demo"])).findings.length, 1);
});

test("[req.modules.maturity] trial findings arrive as questions and never interrupt; experimental modules run only when enabled", (t) => {
  const s = scratch(t);
  writeModule(s.mods, { manifest: manifest({ maturity: "trial" }) });
  const trial = run(s, reg(["demo", "trial"])).findings[0];
  assert.equal(trial.statusClass, "question"); assert.equal(trial.trialClass, "defect");
  writeModule(s.mods, { manifest: manifest({ maturity: "experimental" }) });
  const off = run(s, reg(["demo", "experimental", false]));
  assert.deepEqual(off.findings, []); assert.equal(off.wiring.skipped[0].reason, "disabled");
  assert.equal(run(s, reg(["demo", "experimental", true])).findings[0].statusClass, "question");
});

test("[req.modules.profiles] a module runs only in the profiles it declares", (t) => {
  const s = scratch(t);
  writeModule(s.mods, { manifest: manifest({ profiles: ["public"] }) });
  assert.equal(run(s, reg(["demo"]), { profile: "private" }).wiring.skipped[0].reason, "profile");
  assert.equal(run(s, reg(["demo"]), { profile: "public" }).findings.length, 1);
});

test("[req.modules.promotion] promotion is the instructor's logged decision citing its bar; nothing else raises maturity", (t) => {
  const s = scratch(t);
  writeModule(s.mods, { manifest: manifest({ maturity: "trial" }) });
  writeRegistry(s.root, reg(["demo", "trial"]));
  const instructor = { role: "instructor", name: "Yu Wang" };
  const bar = { studyCell: "K1", metric: "recall", value: 1, threshold: 1, devCases: 24 };
  assert.throws(() => promoteModule(s.root, { name: "demo", bar: { metric: "recall" } }, instructor), /must cite the bar/);
  assert.throws(() => promoteModule(s.root, { name: "demo", bar: { ...bar, devCases: 0 } }, instructor), /development cases/);
  assert.throws(() => promoteModule(s.root, { name: "demo", bar }, { role: "agent", name: "a", model: "m" }), /instructor's decision/);
  // a quiet registry edit, and a hand-appended promotion by an agent or without a bar, are not honoured
  writeRegistry(s.root, reg(["demo", "stable"]));
  appendLogRecord(s.root, { type: "module-change", party: { role: "agent", name: "a", model: "m" }, payload: { change: "promote", module: "demo", to: "stable", bar } });
  appendLogRecord(s.root, { type: "module-change", party: instructor, payload: { change: "promote", module: "demo", to: "stable", bar: {} } });
  assert.deepEqual(unloggedPromotions(s.root, [manifest({ maturity: "trial" })]), ["demo"]);
  const quiet = run(s, readRegistry(s.root));
  assert.ok(kinds(quiet).includes("skeleton/unlogged-promotion:defect"));
  assert.ok(kinds(quiet).includes("demo/wrong-value:question"), "still treated as trial");
  // the proper promotion
  writeRegistry(s.root, reg(["demo", "trial"]));
  assert.equal(promoteModule(s.root, { name: "demo", bar }, instructor).type, "module-change");
  assert.deepEqual(kinds(run(s, readRegistry(s.root))), ["demo/wrong-value:defect"]);
});

test("[req.modules.wiring-report] the wiring report names modules that never ran and kinds that were never produced", (t) => {
  const s = scratch(t);
  writeModule(s.mods);
  writeModule(s.mods, { manifest: manifest({ name: "quiet", checkpoints: ["V5"] }) });
  const r = run(s, reg(["demo"], ["quiet"]));
  const w = buildWiringReport([r], { modules: Object.values(r.wiring.manifests).map((manifest) => ({ manifest })), registry: reg(["demo"], ["quiet"]) });
  assert.deepEqual(w.modulesRan, ["demo"]);
  assert.deepEqual(w.registeredNeverRan, ["quiet"]);
  assert.ok(w.kindsDeclaredNeverProduced.includes("demo/no-source"));
  assert.equal(w.kindsProduced["demo/wrong-value"], 1);
  assert.ok(w.gaps > 0);
});

test("[req.gate.rule] only open defects and obligations from stable modules or the skeleton block; questions never do", (t) => {
  const s = scratch(t);
  writeModule(s.mods);
  const stable = run(s, reg(["demo"])).findings;
  assert.equal(evaluateGate({ findings: stable }).canPublish, false);
  assert.equal(evaluateGate({ findings: stable.map((f) => ({ ...f, status: "resolved" })) }).canPublish, true);
  assert.equal(evaluateGate({ findings: stable.map((f) => ({ ...f, status: "Open" })) }).canPublish, false, "an odd status never hides a finding");
  writeModule(s.mods, { manifest: manifest({ maturity: "trial" }) });
  assert.equal(evaluateGate({ findings: run(s, reg(["demo", "trial"])).findings, maturityOf: () => "trial" }).canPublish, true);
  writeModule(s.mods, { run: `return [{ kind: "unclear", units: [], evidence: { type: "judgment", note: "hm" } }];` });
  const q = evaluateGate({ findings: run(s, reg(["demo"])).findings });
  assert.equal(q.canPublish, true); assert.equal(q.questions.length, 1);
  assert.equal(evaluateGate({ findings: [], approvalProblems: ["chapter 1 is not approved"] }).canPublish, false);
});

function gitInit(root) {
  for (const a of [["init", "-q"], ["config", "user.name", "T"], ["config", "user.email", "t@example.invalid"], ["add", "-A"], ["commit", "-q", "-m", "base", "--allow-empty"]])
    assert.equal(spawnSync("git", ["-C", root, ...a]).status, 0);
}

test("[req.gate.log-verified] every gate evaluation checks the log against the committed log", (t) => {
  const { root } = scratch(t);
  assert.equal(logFindings(root, "b")[0].kind, "log-unverifiable", "no git history → obligation");
  const party = { role: "harness", name: "gate" };
  appendLogRecord(root, { type: "intake", party });
  gitInit(root);
  assert.deepEqual(logFindings(root, "b"), []);
  appendLogRecord(root, { type: "steering", party });
  assert.deepEqual(logFindings(root, "b"), [], "an extension of the committed log is fine");
  const file = path.join(root, "private", "coursewerk", "LOG.jsonl");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").split("\n").slice(1).join("\n"));
  const f = logFindings(root, "b")[0];
  assert.equal(f.kind, "log-broken"); assert.equal(f.statusClass, "defect");
  assert.equal(evaluateGate({ findings: [f] }).canPublish, false);
});

test("[req.findings.routing] routes come from the declaration; interrupts need one of the four reasons and never come from trial modules", (t) => {
  assert.deepEqual(INTERRUPT_REASONS, ["spine-scope-conflict", "missing-input", "rights-blocker", "spine-change-request"]);
  assert.match(validateManifest(manifest({ emits: [{ kind: "stop", statusClass: "obligation", evidenceType: "missing", route: "interrupt" }] })).join(), /four interrupt reasons/);
  assert.match(validateManifest(manifest({ emits: [{ kind: "rights", statusClass: "obligation", evidenceType: "missing", route: "interrupt", interruptReason: "rights-blocker" }] })).join(), /rights blocker cannot run in private/);
  const s = scratch(t);
  const m = manifest({ profiles: ["public"], emits: [{ kind: "rights", statusClass: "obligation", evidenceType: "missing", route: "interrupt", interruptReason: "rights-blocker" }] });
  writeModule(s.mods, { manifest: m, run: `return [{ kind: "rights", units: [], route: "agent", evidence: { type: "missing", what: "a rights receipt for source A" } }];`, recheck: null });
  const stable = run(s, reg(["demo"])).findings[0];
  assert.equal(stable.route, "interrupt"); assert.equal(stable.interruptReason, "rights-blocker");
  writeModule(s.mods, { manifest: { ...m, maturity: "trial" }, run: `return [{ kind: "rights", units: [], evidence: { type: "missing", what: "x" } }];`, recheck: null });
  assert.equal(run(s, reg(["demo", "trial"])).findings[0].route, "digest");
});

test("[req.modules.manifest] [req.findings.routing] round P2-1 probes: modules load only from the harness, by name; the registry is validated", (t) => {
  const s = scratch(t);
  fs.writeFileSync(path.join(s.root, "evil.mjs"), `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(path.join(s.root, "ran.txt"))}, "x"); export default {};`);
  const escape = path.relative(s.mods, path.join(s.root, "evil"));
  assert.equal(moduleFile(escape, s.mods), null);
  assert.equal(moduleFile("skeleton", s.mods), null);
  const r = run(s, { schemaVersion: 1, modules: [{ name: escape, version: "1.0.0", maturity: "stable", enabled: true }] });
  assert.deepEqual(kinds(r), ["skeleton/registry-invalid:obligation"]);
  assert.equal(fs.existsSync(path.join(s.root, "ran.txt")), false, "package code never runs");
  for (const bad of [reg(["demo"], ["demo"]), { schemaVersion: 1, modules: [{ name: "demo", version: "1.0.0", maturity: "stable", enabled: "no" }] }, reg(["skeleton"])])
    assert.deepEqual(kinds(run(s, bad)), ["skeleton/registry-invalid:obligation"]);
  // a module that crashes, returns a non-array, or a promise that rejects is contained; others still run
  writeModule(s.mods, { manifest: manifest({ name: "crash" }), run: "return 5;" });
  writeModule(s.mods);
  assert.deepEqual(kinds(run(s, reg(["crash"], ["demo"]))), ["skeleton/module-failed:obligation", "demo/wrong-value:defect"]);
});

test("[req.modules.no-writes] [req.modules.admission] round P2-2 probes: git history, lifetimes, per-module snapshots, forged verdicts", (t) => {
  const s = scratch(t);
  gitInit(s.root);
  const pkgPath = JSON.stringify(s.root);
  // 1. a module that commits or tags is caught (HEAD and refs are part of write detection)
  writeModule(s.mods, { run: `return (async () => { (await import("node:child_process")).spawnSync("git", ["-C", ${pkgPath}, "tag", "evil"]); return []; })();` });
  assert.deepEqual(kinds(run(s, reg(["demo"]))), ["skeleton/module-wrote-package:defect"]);
  spawnSync("git", ["-C", s.root, "tag", "-d", "evil"]);
  // 2. a non-detached child that would write after the module exits is killed with the module's process group
  const late = JSON.stringify(path.join(s.root, "late.md"));
  writeModule(s.mods, { run: `return (async () => { (await import("node:child_process")).spawn(process.execPath, ["-e", "setTimeout(()=>require('fs').writeFileSync(" + JSON.stringify(${late}) + ",'x'),800)"], { stdio: "ignore" }).unref(); return []; })();` });
  assert.deepEqual(run(s, reg(["demo"])).findings, []);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200);
  assert.equal(fs.existsSync(path.join(s.root, "late.md")), false, "the child did not outlive the module");
  // 3. a module that ignores SIGTERM and spins is bounded by the timeout
  writeModule(s.mods, { run: `process.on("SIGTERM", () => {}); for (;;) {}` });
  const started = Date.now();
  assert.deepEqual(kinds(run(s, reg(["demo"]), { timeoutMs: 1500 })), ["skeleton/module-failed:obligation"]);
  assert.ok(Date.now() - started < 10000);
  // 4. one module rewriting its snapshot copy does not change what the next module sees
  writeModule(s.mods, { manifest: manifest({ name: "tamper" }), run: `fs.writeFileSync(process.argv[4], JSON.stringify({ id: "x", paths: ["evil.md"], files: { "evil.md": { hash: "h", text: "EVIL" } } })); return [];` });
  writeModule(s.mods, { manifest: manifest({ name: "victim" }), run: `return s.text("evil.md") ? ${DEFECT} : [];`, recheck: `return s.text("evil.md") === "EVIL";` });
  assert.deepEqual(kinds(run(s, reg(["tamper"], ["victim"]))), []);
  // 5. a verdict forged in run() is discarded; a polyfilled intrinsic in the module does not reach the host's logic
  writeModule(s.mods, { run: `return [{ kind: "wrong-value", units: [], evidence: { type: "rule" }, __recheckOk: true }];`, recheck: "return false;" });
  assert.deepEqual(kinds(run(s, reg(["demo"]))), ["demo/wrong-value:question"]);
  writeModule(s.mods, { extra: "Set.prototype.has = () => false; JSON.stringify = () => '[]';", recheck: "return false;" });
  assert.notDeepEqual(kinds(run(s, reg(["demo"]))), ["demo/wrong-value:defect"]);
  // 6. the registry must be a regular, valid JSON file
  fs.writeFileSync(path.join(path.dirname(s.root), "outside.json"), JSON.stringify(reg(["demo"])));
  fs.mkdirSync(path.join(s.root, "private", "coursewerk"), { recursive: true }); fs.mkdirSync(path.join(s.root, "provenance", "coursewerk"), { recursive: true });
  fs.symlinkSync(path.join(path.dirname(s.root), "outside.json"), path.join(s.root, "private", "coursewerk", "modules.json"));
  assert.throws(() => readRegistry(s.root), /must be a regular file/);
  fs.rmSync(path.join(s.root, "private", "coursewerk", "modules.json"));
  (fs.mkdirSync(path.dirname(path.join(s.root, "private", "coursewerk", "modules.json")), { recursive: true }), fs.writeFileSync)(path.join(s.root, "private", "coursewerk", "modules.json"), "{ not json");
  assert.throws(() => readRegistry(s.root), /not valid JSON/);
  assert.deepEqual(kinds(run(s, { schemaVersion: 1, modules: [], __readError: "private/coursewerk/modules.json is not valid JSON" })), ["skeleton/registry-invalid:obligation"]);
});

test("[req.modules.no-writes] [req.modules.manifest] round P2-3 probes: unreadable, huge and vanishing files; open handles; error text; more write targets", (t) => {
  const s = scratch(t);
  gitInit(s.root);
  // unreadable and huge (sparse) files are reported, never a crash
  fs.writeFileSync(path.join(s.root, "secret.md"), "x"); fs.chmodSync(path.join(s.root, "secret.md"), 0o000);
  t.after(() => { try { fs.chmodSync(path.join(s.root, "secret.md"), 0o644); } catch {} });
  const fd = fs.openSync(path.join(s.root, "big.bin"), "w"); fs.ftruncateSync(fd, 3 * 1024 * 1024 * 1024); fs.closeSync(fd);
  writeModule(s.mods, { run: "return [];" });
  assert.doesNotThrow(() => run(s, reg(["demo"])));
  fs.rmSync(path.join(s.root, "big.bin"));
  // a module that leaves a timer running still finishes promptly
  writeModule(s.mods, { run: `setInterval(() => {}, 1000); return ${DEFECT};` });
  const t0 = Date.now();
  assert.deepEqual(kinds(run(s, reg(["demo"]))), ["demo/wrong-value:defect"]);
  assert.ok(Date.now() - t0 < 10000);
  // stderr overflow is named as such
  writeModule(s.mods, { run: `for (let i = 0; i < 3000; i++) process.stderr.write("x".repeat(1000) + "\\n"); return [];` });
  const noisy = run(s, reg(["demo"])).findings; // either completes, or fails naming the real cause
  assert.ok(noisy.length === 0 || /more than 1 MB to stderr/.test(noisy[0].evidence.what), JSON.stringify(noisy));
  // .git/index and node_modules are watched
  writeModule(s.mods, { run: `fs.writeFileSync(${JSON.stringify(path.join(s.root, ".git", "index"))}, "corrupt"); return [];` });
  assert.deepEqual(kinds(run(s, reg(["demo"]))), ["skeleton/module-wrote-package:defect"]);
  writeModule(s.mods, { run: `fs.mkdirSync(${JSON.stringify(path.join(s.root, "node_modules", "x"))}, { recursive: true }); fs.writeFileSync(${JSON.stringify(path.join(s.root, "node_modules", "x", "index.js"))}, "evil"); return [];` });
  assert.deepEqual(kinds(run(s, reg(["demo"]))), ["skeleton/module-wrote-package:defect"]);
  // a file that disappears between modules is reported as an unattributed change, not a crash and not blamed on the next module
  fs.writeFileSync(path.join(s.root, "c.md"), "x");
  writeModule(s.mods, { manifest: manifest({ name: "first" }), run: `setTimeout(() => {}, 0); return [];` });
  writeModule(s.mods, { manifest: manifest({ name: "second" }), run: "return [];" });
  const churn = setInterval(() => { try { fs.rmSync(path.join(s.root, "c.md"), { force: true }); fs.writeFileSync(path.join(s.root, "c.md"), String(Math.random())); } catch {} }, 1);
  let r;
  try { assert.doesNotThrow(() => { r = run(s, reg(["first"], ["second"])); }); } finally { clearInterval(churn); }
  assert.ok(r.findings.every((f) => f.module === "skeleton"));
});

test("[req.gate.log-verified] a log past 1 MB is read whole: a long history never makes a package unpublishable (P11 wiring check)", (t) => {
  const { root } = scratch(t);
  const party = { role: "harness", name: "gate" };
  for (let i = 0; i < 2200; i++) appendLogRecord(root, { type: "intake", party, payload: { note: "x".repeat(400), i } });
  assert.ok(fs.statSync(path.join(root, "private", "coursewerk", "LOG.jsonl")).size > 1 << 20, "over Node's default 1 MB buffer");
  gitInit(root);
  appendLogRecord(root, { type: "steering", party });
  assert.deepEqual(logFindings(root, "b"), [], "read and verified, not 'unreadable'");
});
