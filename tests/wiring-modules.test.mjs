// THE WIRING REPORT FROM REAL RUNS (redesign P6, tier T2): the documented gate on the real, approved C2 package with its
// pinned corpus and the harness's standard registry. Read from the gate's JSON report only.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.dirname(HERE);
const RETIRED = ["misconception-asserted", "revision-escalate", "spine-relabeled", "key-fact-review", "visual-review", "definition-drift"];

test("[req.modules.no-writes] [req.modules.wiring-report] [req.retire.old-checks] the real C2 package: all nine stable modules ran (ms10-copying since D54), none wrote, retired checks are gone", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-wiring-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(HERE, "fixtures", "c2-chemistry-v2", "package"), root, { recursive: true });
  fs.rmSync(path.join(root, "metadata", "modules.json"), { force: true });
  for (const a of [["init", "-q"], ["config", "user.name", "T"], ["config", "user.email", "t@example.invalid"], ["add", "-A"], ["commit", "-q", "-m", "c2"]]) spawnSync("git", ["-C", root, ...a]);
  const json = path.join(os.tmpdir(), `wiring-${process.pid}.json`); t.after(() => fs.rmSync(json, { force: true }));
  const before = spawnSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" }).stdout;
  spawnSync(process.execPath, [path.join(REPO, "scripts", "gate.mjs"), "--root", root, "--checkpoint", "V8", "--inputs", path.join(HERE, "fixtures", "c2-chemistry", "inputs"), "--json", json]);
  const r = JSON.parse(fs.readFileSync(json, "utf8"));
  assert.deepEqual(r.wiring.modulesRan, ["ms1-sources", "ms10-copying", "ms2-rights", "ms3-format", "ms4-links", "ms6-quotations", "ms7-consistency", "ms8-verdicts", "ms9-alignment"]);
  assert.deepEqual(r.wiring.registeredNeverRan, []);
  assert.deepEqual(r.wiring.moduleWrites, []);
  assert.equal(spawnSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" }).stdout, before, "the package is untouched");
  // on the clean package the modules produce nothing at all
  assert.deepEqual(r.wiring.kindsProduced, {});
  assert.ok(r.wiring.kindsDeclaredNeverProduced.length >= 18, "every other declared kind is a gap on the clean package — produced only by planted faults (tests/stable-modules.test.mjs)");
  assert.ok(!r.findings.some((f) => RETIRED.some((k) => f.kind.includes(k))), "no retired check survives in the new gate");
  const kinds = r.findings.reduce((a, f) => ((a[f.kind] = (a[f.kind] || 0) + 1), a), {});
  assert.deepEqual(kinds, { "absolute-unreviewed": 31, "evidence-missing": 24, "guide-entry-short": 1, "detail-in-spine": 1 }); // 24 since red-team round 1 (F1, F2); + round 6 (D48 as D49 calibrated it): the one spine line carrying detail, the Guldberg–Waage key-term attribution, is a digest question (tests/d49-decisions.test.mjs)
});
