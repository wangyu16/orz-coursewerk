#!/usr/bin/env node
// Compute all components affected by edits since the last coherence index.
import fs from "node:fs";
import path from "node:path";
import { computeRevisionImpact } from "./lib/coherence.mjs";

const args = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const root = path.resolve(opt("--root", "package"));
const jsonFile = path.resolve(opt("--json", "reports/revision-impact.json"));
const reportFile = path.resolve(opt("--report", "reports/revision-impact.md"));
const plan = computeRevisionImpact(root);
if (plan.error) {
  console.error(`revision-impact: ${plan.error}`);
  process.exit(2);
}
fs.mkdirSync(path.dirname(jsonFile), { recursive: true });
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(jsonFile, JSON.stringify(plan, null, 2) + "\n");
const lines = [
  "# Coursewerk Revision Impact",
  "",
  `Plan: \`${plan.planId}\``,
  `Git baseline: \`${plan.git?.head || "none"}\` · working changes: ${plan.git?.changes?.length || 0}`,
  "",
  "## Changed components",
  ...(plan.changed.length ? plan.changed.map((c) => `- \`${c.path}\` (${c.type})`) : ["- none"]),
  "",
  "## Required review/update",
  "Every component below must be checked and revised when necessary before refreshing the index.",
  "",
  ...(plan.requiredReview.length ? plan.requiredReview.map((c) => `- [ ] \`${c.path}\` (${c.type})`) : ["- none"]),
  "",
  "## Upstream review context",
  "Use these as the authoritative consistency context; they do not automatically require edits.",
  "",
  ...(plan.reviewContext.length ? plan.reviewContext.map((c) => `- \`${c.path}\` (${c.type})`) : ["- none"]),
  "",
  "## Why the index is stale",
  ...(plan.reasons.length ? plan.reasons.map((x) => `- ${x}`) : ["- no changes detected"]),
  "",
  "After the final edits, regenerate this plan. Fill `reviewed` with every required component ID and add a",
  "substantive `attestation` in the JSON file, then run:",
  "",
  `\`node scripts/index_components.mjs --root ${path.relative(process.cwd(), root) || "."} --refresh --review ${path.relative(process.cwd(), jsonFile)}\``,
  "",
];
fs.writeFileSync(reportFile, lines.join("\n"));
console.log(JSON.stringify({ root, json: jsonFile, report: reportFile, changed: plan.changed.length, requiredReview: plan.requiredReview.length, reviewContext: plan.reviewContext.length }, null, 2));
