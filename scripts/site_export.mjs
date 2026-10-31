#!/usr/bin/env node
// Export a package's records for an Alembic site (records under Alembic, step A): private/coursewerk/ (the working
// record; verification records as monthly .jsonl) and provenance/coursewerk/{CHECKED.json, ATTRIBUTION.md}.
//   node scripts/site_export.mjs --root <package> --out <dir> [--inputs <source corpus>] [--no-checked]
// The package is not changed. CHECKED.json comes from a gate run (skipped with --no-checked). Exit 1 when the export
// breaks the contract's records budget (a file over 4 MB, over 50 MB in all).
import path from "node:path";
import { exportSite } from "./lib/core/site_export.mjs";
import { runGate } from "./lib/skeleton/full_gate.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const root = opt("--root"), out = opt("--out");
if (!root || !out) { console.error("usage: site_export.mjs --root <package> --out <dir> [--inputs <corpus>] [--no-checked]"); process.exit(2); }
const gateResult = args.includes("--no-checked") ? null : runGate(path.resolve(root), { inputsDir: opt("--inputs") });
const r = exportSite(path.resolve(root), path.resolve(out), { gateResult });
console.log(JSON.stringify({ out: path.resolve(out), files: r.files.length, bytes: r.total, handInChanges: r.changes, problems: r.problems }, null, 2));
process.exit(r.problems.length ? 1 : 0);
