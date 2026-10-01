// MS5 — Offline carriers and "usable without Alembic" (modules.md; D1 Q3). Every carrier must build. The orz
// framework's carriers load their runtime (KaTeX, Mermaid, themes, editor) from CDNs, which nothing in a package can
// change: until that runtime can be vendored (D24, proposed), the dependence is reported once per package as a
// question, not a defect.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { base, recheckByRerun } from "./_shared.mjs";

const BUILD = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "build_carriers.mjs");
function run(s) {
  const m = s.materialize();
  const receipt = path.join(m.dir, "carriers.json");
  const r = spawnSync(process.execPath, [BUILD, "--root", m.package, "--out", path.join(m.dir, "preview"), "--receipt", receipt], { encoding: "utf8", timeout: 300000 });
  const out = [];
  if (!fs.existsSync(receipt)) { out.push({ kind: "carrier-build-failed", units: [], evidence: { type: "rule", rule: "every carrier builds", detail: (r.stderr || "").trim().split("\n").slice(-1)[0] || `exit ${r.status}` } }); return out; }
  const rec = JSON.parse(fs.readFileSync(receipt, "utf8"));
  for (const x of rec.results || []) if (x.status !== "passed") out.push({ kind: "carrier-build-failed", units: [], evidence: { type: "rule", rule: "every carrier builds", source: x.source, builder: x.builder } });
  const remote = [...new Set((rec.results || []).flatMap((x) => (x.portability?.remoteRuntimeDependencies || []).map((u) => new URL(u).host)))].sort();
  if (remote.length) out.push({ kind: "carrier-network-runtime", units: [], evidence: { type: "judgment", note: `the carriers load their runtime from ${remote.join(", ")}; offline, the lean Markdown remains usable but math, diagrams and themes need the network (D24)` } });
  return out;
}

export default {
  manifest: base({ name: "ms5-carriers", serves: ["Confidence"], checkpoints: ["V8"], reads: ["deliverables", "assets"], cost: "one build per deliverable", profiles: ["public", "private"],
    emits: [
      { kind: "carrier-build-failed", statusClass: "defect", evidenceType: "rule", route: "agent" },
      { kind: "carrier-network-runtime", statusClass: "question", evidenceType: "judgment", route: "digest" },
    ] }),
  run, recheck: recheckByRerun(run),
};
