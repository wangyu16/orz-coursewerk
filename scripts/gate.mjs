#!/usr/bin/env node
// The skeleton gate (redesign P2): run one checkpoint's modules on a package, add the skeleton's own checks, and
// say whether the package can publish.
//   node scripts/gate.mjs --root <package> [--checkpoint V8] [--profile public|private] [--json out.json] [--wiring out.json]
// Exit 0 = can publish; 1 = blocked; 2 = usage error; 3 = the gate itself failed (no verdict — never read as "blocked").
import fs from "node:fs";
import path from "node:path";
import { readRegistry } from "./lib/records/registry.mjs";
import { runCheckpoint } from "./lib/skeleton/runner.mjs";
import { evaluateGate, logFindings } from "./lib/skeleton/gate.mjs";
import { buildWiringReport } from "./lib/skeleton/wiring.mjs";
import { CHECKPOINTS } from "./lib/skeleton/manifest.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const root = opt("--root");
if (!root || !fs.existsSync(root)) { console.error("usage: gate.mjs --root <package> [--checkpoint V8] [--profile public|private] [--json out] [--wiring out]"); process.exit(2); }
const checkpoint = opt("--checkpoint", "V8");
if (!CHECKPOINTS.includes(checkpoint)) { console.error(`unknown checkpoint ${checkpoint}; use one of ${CHECKPOINTS.join(", ")}`); process.exit(2); }

function profileOf(pkg) {
  const given = opt("--profile");
  if (given) return given;
  try { return JSON.parse(fs.readFileSync(path.join(pkg, "metadata", "FOUNDATION.json"), "utf8")).intendedUse === "public-oer" ? "public" : "private"; }
  catch { return "public"; }
}
const profile = profileOf(root);
if (!["public", "private"].includes(profile)) { console.error("profile must be public or private"); process.exit(2); }

// Modules load only from the harness's own scripts/modules/, by validated name (runner.moduleFile) — never from the
// package. The registry is validated by the runner; an invalid one is a blocking obligation.
try {
  let registry;
  try { registry = readRegistry(root); } catch (e) { registry = { schemaVersion: 1, modules: [], __readError: e.message }; }
  const run = runCheckpoint({ root, checkpoint, profile, registry });
  const modules = Object.values(run.wiring.manifests).map((manifest) => ({ manifest }));
  const findings = [...run.findings, ...logFindings(root, run.snapshot.id)];
  const maturityOf = (name) => run.wiring.ran.find((r) => r.name === name)?.maturity || "stable"; // effective maturity, as the runner applied it
  const gate = evaluateGate({ findings, maturityOf });
  const wiring = buildWiringReport([{ ...run, findings }], { modules, registry });

  const report = { checkpoint, profile, basis: run.snapshot.id, canPublish: gate.canPublish,
    counts: { blocking: gate.blocking.length, questions: gate.questions.length, total: findings.length }, findings, wiring };
  if (opt("--json")) fs.writeFileSync(opt("--json"), JSON.stringify(report, null, 2) + "\n");
  if (opt("--wiring")) fs.writeFileSync(opt("--wiring"), JSON.stringify(wiring, null, 2) + "\n");
  console.log(JSON.stringify({ checkpoint, profile, canPublish: gate.canPublish, blocking: gate.blocking.map((f) => `${f.module}/${f.kind}`), questions: gate.questions.length, modulesRan: wiring.modulesRan }, null, 2));
  process.exit(gate.canPublish ? 0 : 1);
} catch (e) {
  const message = `the gate could not run: ${e.message}`;
  if (opt("--json")) fs.writeFileSync(opt("--json"), JSON.stringify({ checkpoint, profile, canPublish: null, error: message }, null, 2) + "\n");
  console.error(message);
  process.exit(3);
}
