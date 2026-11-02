#!/usr/bin/env node
// Return an imported course to Alembic's site layout, append-only, before the push (req.records.site-handback;
// lib/core/site_host.mjs):
//   node scripts/site_handback.mjs <folder>
// - the decision log must still extend the log Alembic holds byte for byte; its imported parts are written back
//   unchanged, the new records go onto the end of the last part (≤ 3.5 MB) and then into new parts;
// - new verification records are appended to the part of their month; a changed or removed imported record is refused;
// - CHECKED.json is not regenerated (that is the publish step), and nothing else is touched.
// Nothing is written when anything is refused. After the push, pull again and import again to keep working.
import { handbackSite } from "./lib/core/site_host.mjs";

const dir = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!dir || process.argv.includes("--help")) { console.error("usage: node scripts/site_handback.mjs <imported folder>"); process.exit(2); }
try {
  const r = handbackSite(dir);
  const show = (p) => `${p.path} (${p.new ? "new" : `+${p.grew} bytes`})`;
  console.log(`handed back ${dir}: ${r.log.appended} new log record(s)${r.log.parts.length ? ` → ${r.log.parts.map(show).join(", ")}` : ""}; ${r.verification.appended} new verification record(s)${r.verification.parts.length ? ` → ${r.verification.parts.map(show).join(", ")}` : ""}. Every other record file is as it was pulled.`);
  console.log("The folder is in site layout again: check it with `alembic push <folder> --dry-run`, then push.");
} catch (e) { console.error(`site_handback: ${e.message}`); process.exit(1); }
