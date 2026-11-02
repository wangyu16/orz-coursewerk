#!/usr/bin/env node
// Build the Coursewerk release an Alembic assistant job mounts read-only as `assistant/` (req.release.alembic-job;
// lib/core/job_release.mjs):
//   node scripts/pack_job_release.mjs <outDir>
// Top-level CLAUDE.md = alembic-job/CLAUDE.md (the job's instructions); COURSEWERK.md = Coursewerk's CLAUDE.md; the
// runtime files (scripts, skills, docs, format-contracts, templates, PROCEDURE.md, VERSION, package.json, LICENSE) and
// production node_modules (npm install --omit=dev --ignore-scripts, in a temporary copy). No tests, .git, handover/,
// system/ or site/.
import { packJobRelease } from "./lib/core/job_release.mjs";

const out = process.argv[2];
if (!out || out.startsWith("--")) { console.error("usage: node scripts/pack_job_release.mjs <outDir>"); process.exit(2); }
try {
  const r = packJobRelease(out);
  console.log(`job release written to ${r.outDir}: ${(r.bytes / 1024 / 1024).toFixed(1)} MB (${r.bytes} bytes)`);
  console.log(`contents: ${r.files.join(", ")}`);
  console.log(`resolved from the release: ${Object.keys(r.resolved).join(", ")}`);
} catch (e) { console.error(`pack_job_release: ${e.message}`); process.exit(1); }
