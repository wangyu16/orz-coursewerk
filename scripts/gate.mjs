#!/usr/bin/env node
// The skeleton gate (redesign P2): run one checkpoint's modules on a package, add the skeleton's own checks, and
// say whether the package can publish.
//   node scripts/gate.mjs --root <package> [--checkpoint V8] [--profile public|private] [--inputs <source corpus>] [--json out.json] [--wiring out.json]
// Exit 0 = can publish; 1 = blocked; 2 = usage error; 3 = the gate itself failed (no verdict — never read as "blocked").
import fs from "node:fs";
import path from "node:path";
import { CHECKPOINTS } from "./lib/skeleton/manifest.mjs";
import { profileOf, runGate } from "./lib/skeleton/full_gate.mjs";
import { correctionsToShow } from "./lib/verify/verdicts.mjs";
import { answeredBases, basisOf } from "./lib/core/digest.mjs";
import { unitInfoOf } from "./lib/core/workflow.mjs";
import { liveReader } from "./lib/core/package_reader.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const root = opt("--root");
if (!root || !fs.existsSync(root)) { console.error("usage: gate.mjs --root <package> [--checkpoint V8] [--profile public|private] [--json out] [--wiring out]"); process.exit(2); }
const checkpoint = opt("--checkpoint", "V8");
if (!CHECKPOINTS.includes(checkpoint)) { console.error(`unknown checkpoint ${checkpoint}; use one of ${CHECKPOINTS.join(", ")}`); process.exit(2); }

const profile = profileOf(root, opt("--profile"));
if (!["public", "private"].includes(profile)) { console.error("profile must be public or private"); process.exit(2); }

// Modules load only from the harness's own scripts/modules/, by validated name (runner.moduleFile) — never from the
// package. The registry is validated by the runner; an invalid one is a blocking obligation.
try {
  const { findings, approvalProblems, gate, wiring, basis } = runGate(root, { checkpoint, profile, inputsDir: opt("--inputs") || null });
  // corrections the agent applied since they were last shown: listed with their diff at every checkpoint (D19-B)
  const corrections = correctionsToShow(root);
  // a question the instructor answered (at its current basis) is not open, though the module still raises it
  const answered = answeredBases(root), info = unitInfoOf(root, liveReader(root)), hashes = new Map([...info].map(([k, v]) => [k, v.contentHash]));
  const openQuestions = gate.questions.filter((f) => !answered.has(`${f.id}|${basisOf(f, hashes)}`));
  const report = { checkpoint, profile, basis, canPublish: gate.canPublish, corrections,
    counts: { blocking: gate.blocking.length, questions: openQuestions.length, answered: gate.questions.length - openQuestions.length, total: findings.length }, approvalProblems, findings, wiring };
  if (opt("--json")) fs.writeFileSync(opt("--json"), JSON.stringify(report, null, 2) + "\n");
  if (opt("--wiring")) fs.writeFileSync(opt("--wiring"), JSON.stringify(wiring, null, 2) + "\n");
  console.log(JSON.stringify({ checkpoint, profile, canPublish: gate.canPublish, blocking: gate.blocking.map((f) => `${f.module}/${f.kind}`), approvalProblems, questions: openQuestions.length, corrections: corrections.map((c) => ({ id: c.id, unit: c.unit, diff: c.diff })), modulesRan: wiring.modulesRan }, null, 2));
  process.exit(gate.canPublish ? 0 : 1);
} catch (e) {
  const message = `the gate could not run: ${e.message}`;
  if (opt("--json")) fs.writeFileSync(opt("--json"), JSON.stringify({ checkpoint, profile, canPublish: null, error: message }, null, 2) + "\n");
  console.error(message);
  process.exit(3);
}
