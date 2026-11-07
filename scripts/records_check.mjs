#!/usr/bin/env node
// Does a package's decision log verify, and continue the one last held? (req.records.chain-check; Alembic Door E)
//   node scripts/records_check.mjs --root <package> [--extends <earlier log>]
// <earlier log>: the log as it was last held — a LOG.jsonl text file, or a folder holding one (a package, or a folder in
// Alembic's site layout, whose parts LOG.jsonl, LOG.2.jsonl, … are joined in order). The package itself may be in
// either layout too. Prints JSON { ok, problems, log, [extends] }: ok only when the log verifies (every record well
// formed, in order, hashed and chained) and, with --extends, holds every earlier record unchanged and in order, with only
// new records after them. Reads only; writes nothing. Exit code 0 when ok, 1 when not, 2 on a usage error.
import fs from "node:fs";
import { checkRecords, readJoinedLog } from "./lib/records/records_check.mjs";

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const root = opt("--root"), earlierPath = opt("--extends");
if (argv.includes("--help") || !root || (argv.includes("--extends") && !earlierPath)) {
  console.error("usage: node scripts/records_check.mjs --root <package> [--extends <earlier LOG.jsonl, or a folder holding it>]");
  process.exit(2);
}

let earlier, earlierProblems = [];
if (earlierPath !== undefined) {
  // the earlier log must be read: a missing or unreadable one is a problem, never an empty log
  try {
    if (fs.statSync(earlierPath).isDirectory()) {
      const r = readJoinedLog(earlierPath);
      earlier = r.text; earlierProblems = r.problems.map((p) => `the earlier log (${earlierPath}): ${p}`);
    } else earlier = fs.readFileSync(earlierPath, "utf8");
  } catch (e) { earlierProblems = [`the earlier log cannot be read (${earlierPath}): ${e.code || e.message}`]; }
}

let result;
try {
  result = earlierProblems.length ? { ...checkRecords(root), extends: null } : checkRecords(root, earlier === undefined ? {} : { extends: earlier });
} catch (e) { result = { ok: false, problems: [`the package's log cannot be read: ${e.message}`] }; }
if (earlierProblems.length) result = { ...result, ok: false, problems: [...earlierProblems, ...result.problems] };
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
