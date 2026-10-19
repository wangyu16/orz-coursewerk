// MS5 — Carrier preview (optional; D24). Carriers — the lean sources wrapped in their orz framework shells — are not a
// Coursewerk deliverable: Alembic assembles them on import, or an agent does (docs/assembling-carriers.md). This module
// is therefore not in the standard registry; enabled, it tries a build (newest frames; every carrier checked to hold its
// text exactly, D52) and reports any failure, with the carrier's own message, as a question only.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { base } from "./_shared.mjs";

const BUILD = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "build_carriers.mjs");
function run(s) {
  const m = s.materialize();
  const receipt = path.join(m.dir, "carriers.json");
  const r = spawnSync(process.execPath, [BUILD, "--root", m.package, "--out", path.join(m.dir, "preview"), "--receipt", receipt], { encoding: "utf8", timeout: 300000 });
  const out = [];
  if (!fs.existsSync(receipt)) { out.push({ kind: "carrier-build-failed", units: [], evidence: { type: "judgment", note: `the carrier preview did not build: ${(r.stderr || "").trim().split("\n").slice(-1)[0] || `exit ${r.status}`}` } }); return out; }
  const rec = JSON.parse(fs.readFileSync(receipt, "utf8"));
  for (const x of rec.results || []) if (x.status !== "passed") out.push({ kind: "carrier-build-failed", units: [], evidence: { type: "judgment", note: `${x.source} did not build with ${x.builder}${(x.errors || []).length ? `: ${x.errors.join("; ")}` : ""}` } });
  return out;
}

export default {
  manifest: base({ name: "ms5-carriers", maturity: "experimental", mayBlock: false, serves: ["Confidence"], checkpoints: ["V8"], reads: ["deliverables", "assets"], cost: "one build per deliverable", profiles: ["public", "private"],
    emits: [{ kind: "carrier-build-failed", statusClass: "question", evidenceType: "judgment", route: "digest" }] }),
  run,
};
