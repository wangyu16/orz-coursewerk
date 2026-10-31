// THE GATE, DRIVEN AS A USER RUNS IT (redesign P2, tier T2): the documented command on the real C2 package.
// No library import — the rule of usage-e2e: drive the documented CLI, never the library.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);
const gate = (root, ...extra) => {
  const json = path.join(os.tmpdir(), `gate-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  const res = spawnSync(process.execPath, [path.join(REPO, "scripts", "gate.mjs"), "--root", root, "--json", json, ...extra], { encoding: "utf8" });
  const report = fs.existsSync(json) ? JSON.parse(fs.readFileSync(json, "utf8")) : null;
  fs.rmSync(json, { force: true });
  return { status: res.status, report, stderr: res.stderr };
};
const git = (root, ...a) => assert.equal(spawnSync("git", ["-C", root, ...a]).status, 0, a.join(" "));

test("[req.gate.log-verified] the gate checks the decision log on every run of the real C2 package", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-gate-c2-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(HERE, "fixtures", "c2-chemistry", "package"), root, { recursive: true });

  // no git history: the log cannot be checked → an obligation blocks
  const logKinds = (rep) => rep.findings.filter((f) => f.kind.startsWith("log-")).map((f) => `${f.module}/${f.kind}`);
  let r = gate(root);
  assert.equal(r.status, 1);
  assert.deepEqual(logKinds(r.report), ["skeleton/log-unverifiable"]);
  assert.equal(r.report.wiring.modulesRan.length, 9, "a package without a registry runs the standard modules (eight stable, one trial; D54 added ms10-copying)");

  // a committed log, then an append through the documented record writer: the package can publish
  git(root, "init", "-q"); git(root, "config", "user.name", "T"); git(root, "config", "user.email", "t@example.invalid");
  const writer = `import { appendLogRecord } from ${JSON.stringify(new URL("../scripts/lib/records/log.mjs", import.meta.url).href)};
    appendLogRecord(process.argv[1], { type: process.argv[2], party: { role: "instructor", name: "Yu Wang" }, payload: { note: process.argv[2] } });`;
  const append = (type) => assert.equal(spawnSync(process.execPath, ["--input-type=module", "-e", writer, root, type]).status, 0);
  append("intake");
  git(root, "add", "-A"); git(root, "commit", "-q", "-m", "baseline");
  append("steering");
  r = gate(root);
  assert.deepEqual(logKinds(r.report), [], "a committed log, extended by the record writer, verifies");
  assert.equal(r.report.basis.length, 64);

  // the committed record is rewritten in the working tree: blocked by a skeleton defect
  const file = path.join(root, "private", "coursewerk", "LOG.jsonl");
  const [first, ...rest] = fs.readFileSync(file, "utf8").trim().split("\n");
  fs.writeFileSync(file, [first.replace('"intake"}', '"intake!"}'), ...rest].join("\n") + "\n");
  r = gate(root);
  assert.equal(r.status, 1);
  const broken = r.report.findings.find((f) => f.kind === "log-broken");
  assert.equal(broken.statusClass, "defect");
  assert.ok(r.report.wiring.findingsByRoute.agent >= 1);
});

test("the gate refuses bad usage with a plain message", () => {
  const res = spawnSync(process.execPath, [path.join(REPO, "scripts", "gate.mjs")], { encoding: "utf8" });
  assert.equal(res.status, 2); assert.match(res.stderr, /usage: gate\.mjs --root/);
  const bad = spawnSync(process.execPath, [path.join(REPO, "scripts", "gate.mjs"), "--root", HERE, "--checkpoint", "V11"], { encoding: "utf8" });
  assert.equal(bad.status, 2); assert.match(bad.stderr, /unknown checkpoint V11/);
});

test("round P2-3: the gate CLI never crashes into a false verdict; its own failure has its own exit code", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-gate-err-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "private", "coursewerk", "modules.json"), { recursive: true }); // a directory where the registry should be
  const r = gate(root);
  assert.equal(r.status, 1, "an invalid registry is a blocking obligation, not a crash");
  assert.ok(r.report.findings.some((f) => f.kind === "registry-invalid"));
});

test("[req.modules.profiles] [req.ms2.two-profiles] the gate takes the use profile from FOUNDATION.json's usageProfile", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-gate-profile-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "private", "coursewerk"), { recursive: true }); fs.mkdirSync(path.join(root, "provenance", "coursewerk"), { recursive: true });
  for (const [usage, expected] of [["public-oer", "public"], ["personal-private", "private"], ["restricted-teaching", "private"]]) {
    (fs.mkdirSync(path.dirname(path.join(root, "private", "coursewerk", "FOUNDATION.json")), { recursive: true }), fs.writeFileSync)(path.join(root, "private", "coursewerk", "FOUNDATION.json"), JSON.stringify({ usageProfile: usage }));
    assert.equal(gate(root).report.profile, expected, usage);
  }
});

test("[req.findings.routing] the gate lists the questions routed to the agent, not only their count (P11 wiring sweep)", () => {
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "gate.mjs"), "utf8");
  assert.match(src, /forYou: openQuestions\.filter\(\(f\) => f\.route === "agent"\)/);
});
