#!/usr/bin/env node
// Run only the mode-independent foundation/provenance assurance kernel.
// Useful for personal-private and restricted-teaching workspaces that are not
// Alembic packages and therefore should not run the package-format QA gate.
import fs from "node:fs";
import path from "node:path";
import { auditAssurance } from "./lib/assurance.mjs";
import { auditCoherence } from "./lib/coherence.mjs";

const args = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const root = path.resolve(opt("--root", "personal"));
const report = opt("--report");
const json = opt("--json");
const phase = opt("--phase", "release");
if (!["pre-ingestion", "authoring", "release"].includes(phase)) {
  console.error("check-assurance: --phase must be pre-ingestion, authoring, or release");
  process.exit(2);
}
let manifest = null;
const manifestFile = path.join(root, "alembic.json");
if (fs.existsSync(manifestFile)) {
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")); } catch { /* reported by package QA */ }
}
const result = auditAssurance({ root, manifest });
const shouldAuditCoherence = phase === "release" || fs.existsSync(path.join(root, "metadata", "COMPONENT_INDEX.json"));
const coherence = shouldAuditCoherence ? auditCoherence(root) : { hardFailures: [], skipped: true };
const phaseFailures = phase === "pre-ingestion"
  ? result.ingestionFailures
  : phase === "authoring"
    ? [...new Set([...result.ingestionFailures, ...result.privateFailures])]
    : result.hardFailures;
const coherenceFailures = phase === "pre-ingestion" ? [] : coherence.hardFailures;
const phaseReady = phaseFailures.length === 0 && coherenceFailures.length === 0;
if (json) {
  fs.mkdirSync(path.dirname(path.resolve(json)), { recursive: true });
  fs.writeFileSync(json, JSON.stringify({ phase, phaseReady, phaseFailures, assurance: result, coherence }, null, 2));
}
if (report) {
  const lines = [
    "# Coursewerk Assurance Report",
    "",
    `Root: \`${root}\``,
    `Usage profile: **${result.usageProfile || "missing"}**`,
    `Assurance phase: **${phase}**`,
    `Phase ready: **${phaseReady ? "yes" : "no"}**`,
    "",
    `Pre-ingestion failures: **${result.ingestionFailures.length}**`,
    `Ingestion permitted: **${result.ingestionReady ? "yes" : "no"}**`,
    ...(phase !== "pre-ingestion" ? [
      `Authoring permitted: **${result.authoringReady ? "yes" : "no"}**`,
      `Private-use failures: **${result.privateFailures.length}**`,
      `Coherence failures: **${coherence.hardFailures.length}**`,
    ] : []),
    ...(phase === "release" ? [
      `Future-publication blockers: **${result.publicationBlockers.length}**`,
      `Public packaging permitted: **${result.canPack ? "yes" : "no"}**`,
    ] : []),
    "",
    "## Failures",
    ...phaseFailures.map((x) => `- ${x}`),
    "",
    ...(phase === "release" ? ["## Publication blockers", ...result.publicationBlockers.map((x) => `- ${x}`)] : []),
    "",
    "## Warnings",
    ...result.warnings.map((x) => `- ${x}`),
    "",
    "## Component coherence",
    ...coherence.hardFailures.map((x) => `- ${x}`),
    "",
  ];
  fs.mkdirSync(path.dirname(path.resolve(report)), { recursive: true });
  fs.writeFileSync(report, lines.join("\n"));
}
console.log(JSON.stringify({
  root,
  phase,
  phaseReady,
  usageProfile: result.usageProfile,
  ingestionReady: result.ingestionReady,
  ingestionFailures: result.ingestionFailures.length,
  ...(phase !== "pre-ingestion" ? {
    authoringReady: result.authoringReady,
    privateUseReady: result.ingestionReady && result.privateFailures.length === 0,
    restrictedTeachingReady: result.ingestionReady && result.privateFailures.length === 0,
    privateFailures: result.privateFailures.length,
    coherenceFailures: coherence.hardFailures.length,
  } : {}),
  ...(phase === "release" ? {
    publicUseReady: result.ingestionReady && result.canPack && coherenceFailures.length === 0,
    publicationBlockers: result.publicationBlockers.length,
  } : {}),
}, null, 2));
process.exit(phaseReady ? 0 : 1);
