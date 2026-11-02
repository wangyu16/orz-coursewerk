#!/usr/bin/env node
// Turn a course pulled from Alembic (site layout, no git) into Coursewerk's package layout, in place
// (req.records.site-import; lib/core/site_host.mjs):
//   node scripts/site_import.mjs <folder>
// - joins the decision log parts (LOG.jsonl, LOG.2.jsonl, …) into one private/coursewerk/LOG.jsonl, which must verify;
// - unwraps the monthly verification parts into one record file per dispatch (private/coursewerk/verification/d-….json);
// - writes the hidden host record .coursewerk-host.json, which site_handback.mjs and the gate read.
// Nothing is written when anything is refused. Run it once per pull; site_handback.mjs reverses it before the push.
import { importSite } from "./lib/core/site_host.mjs";

const dir = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!dir || process.argv.includes("--help")) { console.error("usage: node scripts/site_import.mjs <folder pulled from Alembic>"); process.exit(2); }
try {
  const r = importSite(dir);
  console.log(`imported ${dir}: the decision log (${r.log.records} records from ${r.log.parts} part(s), ${r.log.bytes} bytes) is one private/coursewerk/LOG.jsonl and verifies; ${r.verification.files} verification records unwrapped from ${r.verification.parts} part(s); host record ${r.host} written.`);
  if (r.config) console.log(`${r.config} was missing; the decision log shows spine v2 in force, so it was written as the log says ({"schemaVersion": 1, "spine": 2}).`);
  console.log(`Work in the package now (--root ${dir}); before pushing, run: node scripts/site_handback.mjs ${dir}`);
} catch (e) { console.error(`site_import: ${e.message}`); process.exit(1); }
