// MS2 — Rights, licence and attribution, public packages only (modules.md; D1 Q2). Runs the assurance kernel on a
// private copy of the package. Source-rights problems interrupt (a rights blocker is one of the four reasons, D14);
// every other publication requirement is an obligation for the agent.
import { auditAssurance } from "../lib/assurance.mjs";
import { base } from "./_shared.mjs";

const SOURCE_RIGHTS = /\bsources?\b|rightsBasis|licen[cs]e .*source|pre-ingestion|receipt/i;
function run(s) {
  const pkg = s.materialize().package;
  const manifest = s.json("alembic.json") || null;
  const r = auditAssurance({ root: pkg, manifest });
  const out = [];
  for (const msg of [...new Set([...(r.publicationBlockers || []), ...(r.privateFailures || [])])])
    out.push({ kind: SOURCE_RIGHTS.test(msg) ? "rights-source-blocker" : "rights-publication-requirement", units: [], evidence: { type: "missing", what: msg } });
  return out;
}

export default {
  manifest: base({ name: "ms2-rights", serves: ["Confidence"], checkpoints: ["V0", "V8"], reads: ["manifest", "sources", "assets"], cost: "per source and asset", profiles: ["public"],
    emits: [
      { kind: "rights-source-blocker", statusClass: "obligation", evidenceType: "missing", route: "interrupt", interruptReason: "rights-blocker" },
      { kind: "rights-publication-requirement", statusClass: "obligation", evidenceType: "missing", route: "agent" },
    ] }),
  run,
};
