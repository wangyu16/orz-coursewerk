// MS1 — Source intake and pinning (modules.md; F11). Every declared source is pinned in the corpus manifest
// (inputs/SOURCE_CORPUS.json: retrieval time, text path and hash); a snapshot whose text no longer matches its hash
// is a defect; the package's compact SOURCE_RECORD.json must mirror the corpus; a unit may cite only declared sources
// and retrieved references (P7). Every quote a unit's evidence carries must resolve at its span in its pinned text, and
// that text must still match the pin it was quoted from (req.ms1.span); a reference without its pin is an obligation.
import { sha256 } from "../lib/records/canonical.mjs";
import { makeSourceRecord } from "../lib/source_record.mjs";
import { canonicalJson } from "../lib/records/canonical.mjs";
import { base, recheckByRerun } from "./_shared.mjs";
import { loggedPins, pinnedTexts, snapshotInputReader, makeReferenceRecord, REFERENCE_RECORD } from "../lib/verify/references.mjs";
import { recheckQuote } from "../lib/verify/admission.mjs";

const IN = "@inputs/";
function run(s) {
  const out = [];
  const foundation = s.json("metadata/FOUNDATION.json");
  const declared = (foundation?.sources || []).map((x) => x.id).filter(Boolean);
  out.push(...evidenceSpans(s, declared));
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
  return out;
}

/** Evidence quotes resolve in their pins; references are pinned and mirrored; units cite only known texts. */
function evidenceSpans(s, declared) {
  const out = [];
  const refs = s.json(`${IN}REFERENCES.json`);
  const record = s.json(REFERENCE_RECORD);
  const refIds = new Set((record?.references || []).map((r) => r.refId));
  const pinned = (s.json(`${IN}SOURCE_CORPUS.json`) || refs) ? pinnedTexts(snapshotInputReader(s)) : null;
  if (record && refs && canonicalJson(record) !== canonicalJson(makeReferenceRecord(refs, (record.references || []).map((r) => r.refId))))
    out.push({ kind: "reference-record-mismatch", units: [], evidence: { type: "rule", rule: "REFERENCE_RECORD.json mirrors the inputs' REFERENCES.json exactly" } });
  const known = new Set([...declared, ...refIds]);
  const pins = loggedPins(s.text("metadata/LOG.jsonl"));
  for (const p of s.paths.filter((x) => x.startsWith("metadata/units/") && x.endsWith(".json")).sort()) {
    for (const u of s.json(p)?.units || []) {
      const cited = [...(u.origin?.kind === "source-derived" ? [u.origin.source] : []), ...(u.evidence || []).flatMap((e) => [e.source, ...(e.quotes || []).map((q) => q.source)]).filter(Boolean)];
      for (const c of [...new Set(cited)]) if (!known.has(c)) out.push({ kind: "evidence-source-undeclared", units: [u.id], evidence: { type: "rule", rule: "a unit cites only declared sources and pinned references", source: c } });
      for (const e of u.evidence || []) for (const q of e.quotes || []) {
        if (!known.has(q.source)) continue;
        if (!pinned) { out.push({ kind: "reference-unpinned", units: [u.id], evidence: { type: "missing", what: `the pinned text of ${q.source} (run the gate with --inputs)` } }); continue; }
        const t = pinned.get(q.source);
        if (!t) { out.push({ kind: "reference-unpinned", units: [u.id], evidence: { type: "missing", what: `a pinned text for ${q.source}` } }); continue; }
        if (t.kind === "reference" && pins.get(q.source) !== t.sha256) { out.push({ kind: "evidence-span-unresolved", units: [u.id], evidence: { type: "rule", rule: "a quoted reference was pinned by the retrieval service (a logged pin)", source: q.source, problem: "no logged pin for this text" } }); continue; }
        const problem = !t.ok ? "its pinned text no longer matches its hash" : q.textSha256 && q.textSha256 !== t.sha256 ? "it was quoted from another version of the text" : recheckQuote(q, t.text);
        if (problem) out.push({ kind: "evidence-span-unresolved", units: [u.id], evidence: { type: "rule", rule: "an evidence quote resolves at its span in its pinned text", source: q.source, span: q.span, problem } });
      }
    }
  }
  return out;
}

export default {
  manifest: base({ name: "ms1-sources", serves: ["Confidence", "Coherence"], checkpoints: ["V0", "V3", "V8"], reads: ["sources", "manifest", "units", "log"], cost: "per source", profiles: ["public", "private"],
    emits: [
      { kind: "source-corpus-missing", statusClass: "obligation", evidenceType: "missing", route: "agent" },
      { kind: "source-unpinned", statusClass: "obligation", evidenceType: "missing", route: "agent" },
      { kind: "source-snapshot-changed", statusClass: "defect", evidenceType: "rule", route: "agent" },
      { kind: "source-record-missing", statusClass: "obligation", evidenceType: "missing", route: "agent" },
      { kind: "source-record-mismatch", statusClass: "defect", evidenceType: "rule", route: "agent" },
      { kind: "evidence-source-undeclared", statusClass: "defect", evidenceType: "rule", route: "agent" },
      { kind: "evidence-span-unresolved", statusClass: "defect", evidenceType: "rule", route: "agent" },
      { kind: "reference-unpinned", statusClass: "obligation", evidenceType: "missing", route: "agent" },
      { kind: "reference-record-mismatch", statusClass: "defect", evidenceType: "rule", route: "agent" },
    ] }),
  run, recheck: recheckByRerun(run),
};
