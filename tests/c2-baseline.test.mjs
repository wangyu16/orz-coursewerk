// C2 BASELINE — pins what the v0.12.0 release gate reports on the frozen chemistry package.
//
// This test documents the starting point of the redesign (phase P0), not a desired behaviour: 21 of the
// counted items are false positives (quoted misconceptions and Mermaid labels read as unverifiable
// quotations). When the stable modules replace the old gate (P6), this test is updated deliberately and the
// false-positive list in BASELINE-v0.12.0.json becomes a set of cases that must raise nothing.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);
const FIXTURE = path.join(HERE, "fixtures", "c2-chemistry");
const baseline = JSON.parse(fs.readFileSync(path.join(FIXTURE, "BASELINE-v0.12.0.json"), "utf8"));

test("C2 baseline · the v0.12.0 release gate reproduces the recorded counts", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-c2-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  const json = path.join(dir, "gate.json");
  const res = spawnSync(process.execPath, [path.join(REPO, "scripts", "check_oer.mjs"),
    "--package", path.join(dir, "package"), "--inputs", path.join(dir, "inputs"), "--for-discovery", "--json", json],
    { encoding: "utf8" });
  assert.equal(res.status, 1, "the release gate fails on this fixture");
  const gate = JSON.parse(fs.readFileSync(json, "utf8"));
  assert.equal(gate.criticalTotal, baseline.criticalTotal);
  assert.deepEqual(gate.criticalCounts, baseline.criticalCounts);
  assert.equal(baseline.falsePositives.length, 21);
});
