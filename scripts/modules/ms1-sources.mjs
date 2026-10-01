// MS1 — Source intake and pinning (modules.md; F11). Every declared source is pinned in the corpus manifest
// (inputs/SOURCE_CORPUS.json: retrieval time, text path and hash); a snapshot whose text no longer matches its hash
// is a defect; the package's compact SOURCE_RECORD.json must mirror the corpus; a unit may cite only declared sources.
import { sha256 } from "../lib/records/canonical.mjs";
import { makeSourceRecord } from "../lib/source_record.mjs";
import { canonicalJson } from "../lib/records/canonical.mjs";
import { base, recheckByRerun } from "./_shared.mjs";

const IN = "@inputs/";
function run(s) {
  const out = [];
  const foundation = s.json("metadata/FOUNDATION.json");
  const declared = (foundation?.sources || []).map((x) => x.id).filter(Boolean);
  if (!declared.length) return out;
  const corpus = s.json(`${IN}SOURCE_CORPUS.json`);
  if (!corpus) { out.push({ kind: "source-corpus-missing", units: [], evidence: { type: "missing", what: "the source corpus (inputs/SOURCE_CORPUS.json) — run the gate with --inputs" } }); return out; }
  const entries = new Map((corpus.sources || []).map((e) => [e.sourceId, e]));
  for (const id of declared) {
    const e = entries.get(id);
    if (!e) { out.push({ kind: "source-unpinned", units: [], evidence: { type: "missing", what: `a pinned corpus entry for declared source ${id}` } }); continue; }
    if (e.comparisonMode === "human-attested") { out.push({ kind: "source-unpinned", units: [], evidence: { type: "missing", what: `a pinned snapshot for ${id} (it is human-attested, so nothing checks the text)` } }); continue; }
    const missing = ["retrievedAt", "textPath", "sha256"].filter((k) => !e[k]);
    if (missing.length) { out.push({ kind: "source-unpinned", units: [], evidence: { type: "missing", what: `${id}: ${missing.join(", ")}` } }); continue; }
    const text = s.text(IN + e.textPath);
    if (text == null) out.push({ kind: "source-snapshot-changed", units: [], evidence: { type: "rule", rule: "a pinned snapshot exists at its text path", source: id, path: e.textPath } });
    else if (sha256(text) !== e.sha256) out.push({ kind: "source-snapshot-changed", units: [], evidence: { type: "rule", rule: "a pinned snapshot matches its recorded hash", source: id, expected: e.sha256, actual: sha256(text) } });
  }
  const record = s.json("metadata/SOURCE_RECORD.json");
  if (!record) out.push({ kind: "source-record-missing", units: [], evidence: { type: "missing", what: "metadata/SOURCE_RECORD.json (npm run generate:source-record)" } });
  else if (canonicalJson(record) !== canonicalJson(makeSourceRecord(corpus))) out.push({ kind: "source-record-mismatch", units: [], evidence: { type: "rule", rule: "SOURCE_RECORD.json mirrors the corpus manifest exactly" } });
  // units may cite only declared sources
  const known = new Set(declared);
  for (const p of s.paths.filter((x) => x.startsWith("metadata/units/") && x.endsWith(".json"))) {
    for (const u of s.json(p)?.units || []) {
      const cited = [...(u.origin?.kind === "source-derived" ? [u.origin.source] : []), ...(u.evidence || []).map((e) => e.source).filter(Boolean)];
      for (const c of cited) if (!known.has(c)) out.push({ kind: "evidence-source-undeclared", units: [u.id], evidence: { type: "rule", rule: "a unit cites only declared sources", source: c } });
    }
  }
  return out;
}

export default {
  manifest: base({ name: "ms1-sources", serves: ["Confidence", "Coherence"], checkpoints: ["V0", "V3", "V8"], reads: ["sources", "manifest", "units"], cost: "per source", profiles: ["public", "private"],
    emits: [
      { kind: "source-corpus-missing", statusClass: "obligation", evidenceType: "missing", route: "agent" },
      { kind: "source-unpinned", statusClass: "obligation", evidenceType: "missing", route: "agent" },
      { kind: "source-snapshot-changed", statusClass: "defect", evidenceType: "rule", route: "agent" },
      { kind: "source-record-missing", statusClass: "obligation", evidenceType: "missing", route: "agent" },
      { kind: "source-record-mismatch", statusClass: "defect", evidenceType: "rule", route: "agent" },
      { kind: "evidence-source-undeclared", statusClass: "defect", evidenceType: "rule", route: "agent" },
    ] }),
  run, recheck: recheckByRerun(run),
};
