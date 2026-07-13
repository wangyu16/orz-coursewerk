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
let manifest = null;
const manifestFile = path.join(root, "alembic.json");
if (fs.existsSync(manifestFile)) {
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")); } catch { /* reported by package QA */ }
}
const result = auditAssurance({ root, manifest });
const coherence = auditCoherence(root);
if (json) fs.writeFileSync(json, JSON.stringify({ assurance: result, coherence }, null, 2));
if (report) {
  const lines = [
    "# Coursewerk Assurance Report",
    "",
    `Root: \`${root}\``,
    `Usage profile: **${result.usageProfile || "missing"}**`,
    "",
    `Private-use failures: **${result.privateFailures.length}**`,
    `Future-publication blockers: **${result.publicationBlockers.length}**`,
    `Public packaging permitted: **${result.canPack ? "yes" : "no"}**`,
    `Coherence failures: **${coherence.hardFailures.length}**`,
    "",
    "## Failures",
    ...result.privateFailures.map((x) => `- ${x}`),
    "",
    "## Publication blockers",
    ...result.publicationBlockers.map((x) => `- ${x}`),
    "",
    "## Warnings",
    ...result.warnings.map((x) => `- ${x}`),
    "",
    "## Component coherence",
    ...coherence.hardFailures.map((x) => `- ${x}`),
    "",
  ];
  fs.writeFileSync(report, lines.join("\n"));
}
console.log(JSON.stringify({
  root,
  usageProfile: result.usageProfile,
  privateUseReady: result.privateFailures.length === 0,
  publicUseReady: result.canPack,
  privateFailures: result.privateFailures.length,
  publicationBlockers: result.publicationBlockers.length,
  coherenceFailures: coherence.hardFailures.length,
}, null, 2));
process.exit(result.privateFailures.length + coherence.hardFailures.length > 0 ? 1 : 0);
