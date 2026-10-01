#!/usr/bin/env node
// Unit index tools (redesign P4; F1). The agent runs these around its own writing.
//   node scripts/units.mjs begin  --root <pkg> --model <model id> [--step authoring]     before writing
//   node scripts/units.mjs index  --root <pkg> [--as agent --model <model id>]            after writing (or to detect others' edits)
//        [--initial-origin agent-knowledge|instructor --name <name>]                     first index of an existing package
//   node scripts/units.mjs claim  --root <pkg> --units <id,…> --name <instructor> [--author "<someone else>"]
//   node scripts/units.mjs status --root <pkg>                                             counts, origins, gaps, unindexed edits
import fs from "node:fs";
import { liveReader } from "./lib/core/package_reader.mjs";
import { beginSession, claimAuthorship, deliverablesOf, indexUnits, readSidecar, unindexedFindings } from "./lib/core/units_index.mjs";
import { segmentDeliverable, uncoveredLines } from "./lib/core/segment.mjs";

const [cmd, ...args] = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const fail = (m, c = 2) => { console.error(m); process.exit(c); };
const root = opt("--root");
if (!cmd || !root || !fs.existsSync(root)) fail("usage: units.mjs <begin|index|claim|status> --root <package> … (see the header of scripts/units.mjs)");
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
    const r = indexUnits(root, reader, { as: opt("--as") === "agent" ? "agent" : null, party, initialOrigin });
    console.log(JSON.stringify({ ...r.summary, questions: r.findings.map((f) => f.evidence.note) }, null, 2)); process.exit(0);
  }
  if (cmd === "claim") {
    const name = opt("--name") || fail("--name <instructor> is required");
    const done = claimAuthorship(root, { units: String(opt("--units") || "").split(",").filter(Boolean), as: opt("--author") || "instructor" }, { role: "instructor", name });
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
  fail(`unknown command ${cmd}`);
} catch (e) { fail(e.message, 1); }
