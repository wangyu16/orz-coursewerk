// One gate for every caller (redesign P8; skeleton §7; req.profiles.one-gate): the gate CLI, the publish decision and
// the checkpoint digest all run this. It runs one checkpoint's modules, adds the skeleton's own checks (spine
// well-formedness, approvals, unindexed edits, the deterministic core, the decision log), and evaluates the verdict.
// The profile toggles only which modules run (rights: public only); everything else is the same.
import fs from "node:fs";
import path from "node:path";
import { readRegistry } from "../records/registry.mjs";
import { readConfig } from "../records/config.mjs";
import { runCheckpoint } from "./runner.mjs";
import { evaluateGate, logFindings } from "./gate.mjs";
import { buildWiringReport } from "./wiring.mjs";
import { liveReader } from "../core/package_reader.mjs";
import { spineCoreFindings, approvalCoreProblems } from "../core/core_checks.mjs";
import { unindexedFindings } from "../core/units_index.mjs";
import { coreObligations } from "../core/obligations.mjs";

/** The package's use profile: the FOUNDATION's usageProfile ("public-oer" → public), unless given. */
export function profileOf(root, given = null) {
  if (given) return given;
  try { return JSON.parse(fs.readFileSync(path.join(root, "metadata", "FOUNDATION.json"), "utf8")).usageProfile === "public-oer" ? "public" : "private"; }
  catch { return "public"; }
}

export function runGate(root, { checkpoint = "V8", profile = null, inputsDir = null } = {}) {
  profile = profileOf(root, profile);
  let registry;
  try { registry = readRegistry(root); } catch (e) { registry = { schemaVersion: 1, modules: [], __readError: e.message }; }
  const run = runCheckpoint({ root, checkpoint, profile, registry, inputsDir });
  const modules = Object.values(run.wiring.manifests).map((manifest) => ({ manifest }));
  const config = readConfig(root);
  const core = [], approvalProblems = [];
  if (config.spine === 2) {
    const reader = liveReader(root);
    if (["V1", "V8"].includes(checkpoint)) core.push(...spineCoreFindings(reader, run.snapshot.id));
    if (checkpoint === "V8") approvalProblems.push(...approvalCoreProblems(root, reader));
    if (["V2", "V8"].includes(checkpoint)) core.push(...unindexedFindings(root, reader, run.snapshot.id));
    if (["V4", "V6", "V8"].includes(checkpoint)) core.push(...coreObligations(root, reader, run.snapshot.id));
  }
  const findings = [...run.findings, ...core, ...logFindings(root, run.snapshot.id)];
  const maturityOf = (name) => run.wiring.ran.find((r) => r.name === name)?.maturity || "stable";
  const gate = evaluateGate({ findings, maturityOf, approvalProblems });
  const wiring = buildWiringReport([{ ...run, findings }], { modules, registry });
  return { checkpoint, profile, basis: run.snapshot.id, findings, approvalProblems, gate, wiring, maturityOf };
}
