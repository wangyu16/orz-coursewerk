#!/usr/bin/env node
// Unit index tools (redesign P4; F1). The agent runs these around its own writing.
//   node scripts/units.mjs begin  --root <pkg> --model <model id> [--step authoring]     before writing
//   node scripts/units.mjs index  --root <pkg> [--as agent --model <model id>]            after writing (or to detect others' edits)
//        [--initial-origin agent-knowledge|instructor --name <name>]                     first index of an existing package
//   node scripts/units.mjs claim  --root <pkg> --units <id,…> --name <instructor> --words "<their words>" [--author "<someone else>"]
//   node scripts/units.mjs status --root <pkg>                                             counts, origins, gaps, unindexed edits
//   node scripts/units.mjs link   --root <pkg> --links <file.json> --model <model id>      { "<unit id>": ["<spine node id>", …] }
//   node scripts/units.mjs confirm --root <pkg> --units <id,…> --what fact|still-correct --name <instructor>
//   node scripts/units.mjs obligations --root <pkg>                                        the core obligations, grouped
//   node scripts/units.mjs restamp --root <pkg> --reason "<harness change>"                re-baseline every stamp after the
//        harness's dependency rules changed (logged as a harness action; never a substitute for re-verification)
import fs from "node:fs";
import { liveReader } from "./lib/core/package_reader.mjs";
import { beginSession, claimAuthorship, deliverablesOf, readSidecar, unindexedFindings } from "./lib/core/units_index.mjs";
import { confirmUnits, coreObligations, indexAndStamp, linkUnits, loadUnits, restamp } from "./lib/core/obligations.mjs";
import { appendLogRecord } from "./lib/records/log.mjs";
import { segmentDeliverable, uncoveredLines } from "./lib/core/segment.mjs";

const [cmd, ...args] = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const fail = (m, c = 2) => { console.error(m); process.exit(c); };
const root = opt("--root");
if (!cmd || !root || !fs.existsSync(root)) fail("usage: units.mjs <begin|index|claim|status|link|confirm|obligations> --root <package> … (see the header of scripts/units.mjs)");
const reader = liveReader(root);
const agent = () => { const model = opt("--model"); if (!model) fail("--model <model id> is required for the agent"); return { role: "agent", name: "executor", model }; };
try {
  if (cmd === "begin") { const r = beginSession(root, reader, agent(), { step: opt("--step") || "authoring" }); console.log(JSON.stringify({ session: r.seq }, null, 2)); process.exit(0); }
  if (cmd === "index") {
    let party = null, initialOrigin = null;
    if (opt("--as") === "agent") party = agent();
    const io = opt("--initial-origin");
    if (io) {
      if (io === "instructor") { const name = opt("--name") || fail("--name is required"); party = { role: "instructor", name }; initialOrigin = { kind: "instructor-authored", instructor: name, date: new Date().toISOString().slice(0, 10) }; }
      else if (io === "agent-knowledge") { party = party || agent(); initialOrigin = { kind: "agent-knowledge", model: party.model || opt("--model"), step: "pre-existing", date: new Date().toISOString().slice(0, 10) }; }
      else fail("--initial-origin must be agent-knowledge or instructor");
    }
    const r = indexAndStamp(root, reader, { as: opt("--as") === "agent" ? "agent" : null, party, initialOrigin });
    console.log(JSON.stringify({ ...r.summary, questions: r.findings.map((f) => f.evidence.note) }, null, 2)); process.exit(0);
  }
  if (cmd === "claim") {
    const name = opt("--name") || fail("--name <instructor> is required");
    const words = opt("--words") || fail('--words "<the instructor\'s own words>" is required: an authorship confirmation quotes them');
    const done = claimAuthorship(root, { units: String(opt("--units") || "").split(",").filter(Boolean), as: opt("--author") || "instructor", instructorWords: words }, { role: "instructor", name });
    console.log(JSON.stringify({ claimed: done.length }, null, 2)); process.exit(0);
  }
  if (cmd === "status") {
    const out = { deliverables: {}, unindexed: unindexedFindings(root, reader, "status").map((f) => f.evidence.what) };
    for (const rel of deliverablesOf(reader)) {
      const side = readSidecar(root, rel), seg = segmentDeliverable(reader.text(rel), rel);
      const origins = {}; for (const u of side?.units || []) origins[u.origin.kind] = (origins[u.origin.kind] || 0) + 1;
      out.deliverables[rel] = { units: side?.units.length ?? null, origins, gaps: uncoveredLines(reader.text(rel), seg).length };
    }
    console.log(JSON.stringify(out, null, 2)); process.exit(0);
  }
  if (cmd === "link") {
    const links = JSON.parse(fs.readFileSync(opt("--links") || fail("--links <file.json> is required"), "utf8"));
    linkUnits(root, reader, links, agent());
    console.log(JSON.stringify({ linked: Object.keys(links).length }, null, 2)); process.exit(0);
  }
  if (cmd === "confirm") {
    const name = opt("--name") || fail("--name <instructor> is required");
    const ids = String(opt("--units") || "").split(",").filter(Boolean);
    confirmUnits(root, reader, ids, { what: opt("--what") }, { role: "instructor", name });
    console.log(JSON.stringify({ confirmed: ids.length, what: opt("--what") }, null, 2)); process.exit(0);
  }
  if (cmd === "restamp") {
    const reason = opt("--reason") || fail("--reason is required: name the harness change that altered the dependency rules");
    const stale = coreObligations(root, reader, "restamp").filter((f) => f.kind === "reverify" || f.kind === "carried-unverified");
    if (stale.length) fail(`refusing: ${stale.length} unit(s) are stale or carried — re-verify them first; restamp only follows a harness rule change`, 1);
    const ids = loadUnits(root, reader).map((u) => u.id);
    restamp(root, reader, ids);
    appendLogRecord(root, { type: "revision", party: { role: "harness", name: "units restamp" }, payload: { event: "dependency-rules-changed", reason, units: ids.length } });
    console.log(JSON.stringify({ restamped: ids.length }, null, 2)); process.exit(0);
  }
  if (cmd === "obligations") {
    const f = coreObligations(root, reader, "cli");
    const byKind = f.reduce((a, x) => ((a[x.kind] = (a[x.kind] || 0) + 1), a), {});
    console.log(JSON.stringify({ total: f.length, byKind, examples: Object.fromEntries(Object.keys(byKind).map((k) => [k, f.filter((x) => x.kind === k).slice(0, 3).map((x) => x.evidence.what || x.evidence.rule)])) }, null, 2)); process.exit(0);
  }
  fail(`unknown command ${cmd}`);
} catch (e) { fail(e.message, 1); }
