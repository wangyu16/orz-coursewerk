// REQUIREMENT REGISTER — the rules that make `system:verify` refuse a requirement closed without evidence (D22).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRequirements } from "../scripts/lib/system_index.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function scratch(t, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-req-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}
const req = (over = {}) => ({ id: "req.demo.thing", phase: "P1", tiers: ["T1"], statement: "does the thing", source: "test", status: "planned", evidence: {}, ...over });
const reg = (requirements, completedPhases = []) => ({ schemaVersion: 1, completedPhases, requirements });

test("the repository's own register is valid", () => {
  const registry = JSON.parse(fs.readFileSync(path.join(repo, "system", "REQUIREMENTS.json"), "utf8"));
  assert.deepEqual(validateRequirements(repo, registry), []);
});

test("a closed requirement needs evidence at every tier it names", (t) => {
  const root = scratch(t, { "tests/a.test.mjs": "req.demo.thing" });
  assert.match(validateRequirements(root, reg([req({ status: "closed", tiers: ["T1", "T2"], evidence: { T1: ["tests/a.test.mjs"] } })])).join("\n"), /closed without T2 evidence/);
});

test("cited evidence must exist and must name the requirement", (t) => {
  const root = scratch(t, { "tests/a.test.mjs": "something else entirely" });
  const failures = validateRequirements(root, reg([req({ status: "closed", evidence: { T1: ["tests/a.test.mjs", "tests/missing.test.mjs"] } })])).join("\n");
  assert.match(failures, /never names req\.demo\.thing/);
  assert.match(failures, /does not exist: tests\/missing\.test\.mjs/);
});

test("a completed phase cannot leave a requirement planned; deferral needs a reason", (t) => {
  const root = scratch(t);
  assert.match(validateRequirements(root, reg([req()], ["P1"])).join("\n"), /marked complete but the requirement is still planned/);
  assert.match(validateRequirements(root, reg([req({ status: "deferred" })], ["P1"])).join("\n"), /deferred requirement needs a reason/);
  assert.deepEqual(validateRequirements(root, reg([req({ status: "deferred", reason: "moved to P2 by decision D99" })], ["P1"])), []);
});

test("malformed entries are refused", (t) => {
  const root = scratch(t);
  const failures = validateRequirements(root, reg([req({ id: "Thing" }), req({ tiers: ["T9"] }), req({ status: "done" }), req({ phase: "one" })])).join("\n");
  assert.match(failures, /req\.\* id/);
  assert.match(failures, /tiers must be a non-empty subset/);
  assert.match(failures, /invalid status done/);
  assert.match(failures, /phase must be P<n>/);
});

test("duplicate ids are refused, and a closed requirement with proper evidence passes", (t) => {
  const root = scratch(t, { "tests/a.test.mjs": "[req.demo.thing] covered here" });
  assert.match(validateRequirements(root, reg([req(), req()])).join("\n"), /duplicate requirement id/);
  assert.deepEqual(validateRequirements(root, reg([req({ status: "closed", evidence: { T1: ["tests/a.test.mjs"] } })], ["P1"])), []);
});
