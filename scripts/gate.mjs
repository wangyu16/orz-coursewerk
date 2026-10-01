#!/usr/bin/env node
// The skeleton gate (redesign P2): run one checkpoint's modules on a package, add the skeleton's own checks, and
// say whether the package can publish.
//   node scripts/gate.mjs --root <package> [--checkpoint V8] [--profile public|private] [--inputs <source corpus>] [--json out.json] [--wiring out.json]
// Exit 0 = can publish; 1 = blocked; 2 = usage error; 3 = the gate itself failed (no verdict — never read as "blocked").
import fs from "node:fs";
import path from "node:path";
import { readRegistry } from "./lib/records/registry.mjs";
import { runCheckpoint } from "./lib/skeleton/runner.mjs";
import { evaluateGate, logFindings } from "./lib/skeleton/gate.mjs";
import { buildWiringReport } from "./lib/skeleton/wiring.mjs";
import { CHECKPOINTS } from "./lib/skeleton/manifest.mjs";
import { readConfig } from "./lib/records/config.mjs";
import { liveReader } from "./lib/core/package_reader.mjs";
import { spineCoreFindings, approvalCoreProblems } from "./lib/core/core_checks.mjs";
import { unindexedFindings } from "./lib/core/units_index.mjs";
import { coreObligations } from "./lib/core/obligations.mjs";
import { correctionsToShow } from "./lib/verify/verdicts.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const root = opt("--root");
if (!root || !fs.existsSync(root)) { console.error("usage: gate.mjs --root <package> [--checkpoint V8] [--profile public|private] [--json out] [--wiring out]"); process.exit(2); }
const checkpoint = opt("--checkpoint", "V8");
if (!CHECKPOINTS.includes(checkpoint)) { console.error(`unknown checkpoint ${checkpoint}; use one of ${CHECKPOINTS.join(", ")}`); process.exit(2); }

function profileOf(pkg) {
  const given = opt("--profile");
  if (given) return given;
  try { return JSON.parse(fs.readFileSync(path.join(pkg, "metadata", "FOUNDATION.json"), "utf8")).usageProfile === "public-oer" ? "public" : "private"; }
  catch { return "public"; }
}
const profile = profileOf(root);
if (!["public", "private"].includes(profile)) { console.error("profile must be public or private"); process.exit(2); }

// Modules load only from the harness's own scripts/modules/, by validated name (runner.moduleFile) — never from the
// package. The registry is validated by the runner; an invalid one is a blocking obligation.
try {
  let registry;
  try { registry = readRegistry(root); } catch (e) { registry = { schemaVersion: 1, modules: [], __readError: e.message }; }
  const run = runCheckpoint({ root, checkpoint, profile, registry, inputsDir: opt("--inputs") || null });
  const modules = Object.values(run.wiring.manifests).map((manifest) => ({ manifest }));
  // Skeleton core checks for spine v2 packages: well-formedness at V1 and V8; approvals at V8 (D14, D19-A).
  const config = readConfig(root);
  const core = [], approvalProblems = [];
  if (config.spine === 2) {
    const reader = liveReader(root);
    if (["V1", "V8"].includes(checkpoint)) core.push(...spineCoreFindings(reader, run.snapshot.id));
    if (checkpoint === "V8") approvalProblems.push(...approvalCoreProblems(root, reader));
    if (["V2", "V8"].includes(checkpoint)) core.push(...unindexedFindings(root, reader, run.snapshot.id)); // edits not yet indexed (P4)
    if (["V4", "V6", "V8"].includes(checkpoint)) core.push(...coreObligations(root, reader, run.snapshot.id)); // the deterministic core (P5)
  }
  const findings = [...run.findings, ...core, ...logFindings(root, run.snapshot.id)];
  const maturityOf = (name) => run.wiring.ran.find((r) => r.name === name)?.maturity || "stable"; // effective maturity, as the runner applied it
  const gate = evaluateGate({ findings, maturityOf, approvalProblems });
  const wiring = buildWiringReport([{ ...run, findings }], { modules, registry });

  // corrections the agent applied since they were last shown: listed with their diff at every checkpoint (D19-B)
  const corrections = correctionsToShow(root);
  const report = { checkpoint, profile, basis: run.snapshot.id, canPublish: gate.canPublish, corrections,
    counts: { blocking: gate.blocking.length, questions: gate.questions.length, total: findings.length }, approvalProblems, findings, wiring };
  if (opt("--json")) fs.writeFileSync(opt("--json"), JSON.stringify(report, null, 2) + "\n");
  if (opt("--wiring")) fs.writeFileSync(opt("--wiring"), JSON.stringify(wiring, null, 2) + "\n");
  console.log(JSON.stringify({ checkpoint, profile, canPublish: gate.canPublish, blocking: gate.blocking.map((f) => `${f.module}/${f.kind}`), approvalProblems, questions: gate.questions.length, corrections: corrections.map((c) => ({ id: c.id, unit: c.unit, diff: c.diff })), modulesRan: wiring.modulesRan }, null, 2));
  process.exit(gate.canPublish ? 0 : 1);
} catch (e) {
  const message = `the gate could not run: ${e.message}`;
  if (opt("--json")) fs.writeFileSync(opt("--json"), JSON.stringify({ checkpoint, profile, canPublish: null, error: message }, null, 2) + "\n");
  console.error(message);
  process.exit(3);
}
