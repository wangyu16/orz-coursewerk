#!/usr/bin/env node
// Send a course to Alembic, or take it from there, from a computer (req.host.alembic-transfer; FC-16 O7; Alembic's
// Door E). Coursewerk holds no credentials and uploads nothing: it makes the zip and prints the page; the instructor
// opens the page and chooses the file.
//   node scripts/alembic_transfer.mjs send --root <course folder> [--out <dir>] [--host <Alembic address>] [--json]
//       the folder as the zip Alembic's "Bring in a course from my computer" (a new course) or "Bring it back" (a folder
//       Alembic handed out) takes — a folder imported with site_import.mjs is handed back in a copy; the folder itself
//       is never changed — after records_check (the log's chain and the review records it binds) passes on exactly what
//       goes. Prints the zip, the page to open, and what to choose there.
//   node scripts/alembic_transfer.mjs take [--root <folder>] [--course <course id>] [--host <Alembic address>] [--json]
//       the course's page on Alembic, where its owner hands it to the computer, and the steps after the download.
// The address: --host, else COURSEWERK_ALEMBIC_URL, else https://alembic.orz.how.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareSend, sendSteps, takeSteps } from "./lib/core/alembic_transfer.mjs";

const [cmd, ...args] = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const json = args.includes("--json");
const harness = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!["send", "take"].includes(cmd) || args.includes("--help") || (cmd === "send" && !opt("--root"))) {
  console.error("usage: alembic_transfer.mjs send --root <course folder> [--out <dir>] [--host <Alembic address>] [--json]\n       alembic_transfer.mjs take [--root <folder>] [--course <course id>] [--host <Alembic address>] [--json]");
  process.exit(2);
}
try {
  if (cmd === "send") {
    const r = prepareSend(opt("--root"), { out: opt("--out") || null, host: opt("--host") });
    const steps = sendSteps(r);
    if (json) console.log(JSON.stringify({ ...r, steps }, null, 2));
    else {
      console.log(`Ready to send: ${r.zip} (${r.files} files, ${(r.bytes / 1024 / 1024).toFixed(1)} MB).`);
      console.log(`The records check passed: the decision log (${r.records.log} records) and the ${r.records.reviews} review records it binds.${r.handedBack ? " The folder was handed back in the copy that was zipped; the folder itself is unchanged, so you can keep working in it." : ""}`);
      for (const w of r.warnings) console.log(`Note: ${w}`);
      console.log(`\nTo send it (yours to do; Coursewerk sends nothing):`);
      steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    }
  } else {
    const r = takeSteps({ root: opt("--root") || null, course: opt("--course") || null, host: opt("--host"), harness });
    if (json) console.log(JSON.stringify(r, null, 2));
    else { console.log("To take the course from Alembic:"); r.steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`)); }
  }
} catch (e) { console.error(`alembic_transfer ${cmd}: ${e.message}`); process.exit(1); }
