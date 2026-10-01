// MS6 — Quotations and near-verbatim copying (modules.md). A quotation (quote marks, ≥ 6 words) found in no pinned or
// supplied source is an obligation; an attributed blockquote that its sources do not contain is a misquotation (a
// defect); prose copied too closely from a source is a defect in public packages only.
// The two v0.12 false-positive classes on the completed C2 package (h5) are excluded: a quoted span that restates one
// of the spine's own misconceptions (or sits under a misconceptions heading), and diagram payloads (Mermaid labels,
// chart data), which are syntax, not prose.
import { unverifiableQuotations } from "../lib/immutable.mjs";
import { buildSourceIndex, scanText } from "../lib/verbatim.mjs";
import { isActionableQuotation, reproducedQuotationBody } from "../lib/legacy/quotation.mjs";
import { base, chaptersOf, recheckByRerun } from "./_shared.mjs";

const IN = "@inputs/";
// A quotation put in a hypothetical speaker's mouth ("A student says it means '…'") reproduces no source: it is the
// h5 class of quoted misconceptions, surfaced in order to be corrected.
const SPEAKER = /\b(?:a|an|one|the|your|another|some)\s+(?:student|classmate|friend|learner|peer|pupil|lab partner|reader)s?\b[^.?!]{0,60}\b(?:says?|said|argues?|argued|claims?|claimed|writes?|wrote|thinks?|believes?|insists?|suggests?|concludes?|proposes?|answers?|answered|reasons?|reasoned)\b[^.?!]{0,60}$/i;
const words = (t) => [...new Set(String(t).toLowerCase().match(/[a-z]{3,}/g) || [])];
const containment = (inner, outer) => { const O = new Set(outer); const I = words(inner); return I.filter((w) => O.has(w)).length / Math.max(1, I.length); };

/** Blank out diagram payloads, keeping offsets and line numbers. */
export function maskDiagrams(text) {
  return String(text).replace(/\{\{(mermaid|chart|smiles|structure)\b[\s\S]*?\{\{\/\1\}\}/g, (m) => m.replace(/[^\n]/g, " "));
}
/** The lines under a heading that names misconceptions. */
function misconceptionSectionLines(text) {
  const lines = String(text).split("\n"), out = new Set(); let inside = false;
  lines.forEach((l, i) => { const h = /^#{2,6}\s+(.*)$/.exec(l); if (h) inside = /misconception|myth|common (?:error|mistake)/i.test(h[1]); else if (inside) out.add(i); });
  return out;
}
function spineMisconceptions(s) {
  const out = [];
  for (const ch of chaptersOf(s)) {
    const map = s.text(`concepts/${ch}.md`) || ""; let inside = false;
    for (const l of map.split("\n")) { const h = /^##\s+(.*)$/.exec(l); if (h) { inside = /^misconceptions/i.test(h[1].trim()); continue; } const m = inside && /^\s*[-*+]\s+(.*)$/.exec(l); if (m) out.push(m[1].replace(/\s*\[[^\]]*\]\s*$/g, "")); }
  }
  return out;
}
function sourceTexts(s) {
  const corpus = s.json(`${IN}SOURCE_CORPUS.json`);
  return (corpus?.sources || []).filter((e) => e.comparisonMode !== "human-attested" && e.textPath).map((e) => ({ id: e.sourceId, text: s.text(IN + e.textPath) || "" })).filter((x) => x.text);
}

function run(s) {
  const out = [];
  const texts = sourceTexts(s);
  if (!texts.length) return out; // nothing pinned to compare against: MS1 raises the missing corpus
  const misconceptions = spineMisconceptions(s);
  const deliverables = s.paths.filter((p) => /^(study-guide|slides|practice)\/[^/]+\.md$/.test(p)).sort();
  const sourceList = texts.map((x) => x.text);
  for (const file of deliverables) {
    const raw = s.text(file) || "", masked = maskDiagrams(raw);
    const inMisSection = misconceptionSectionLines(raw);
    for (const hit of unverifiableQuotations(masked, sourceList)) {
      const head = hit.text.trimStart();
      const line = masked.slice(0, masked.indexOf(hit.text)).split("\n").length - 1;
      if (inMisSection.has(line)) continue;                                                // surfaced misconception
      if (misconceptions.some((m) => containment(hit.text, words(m)) >= 0.6)) continue;     // restates a spine misconception
      const before = masked.slice(Math.max(0, masked.indexOf(hit.text) - 160), masked.indexOf(hit.text)).split("\n").pop();
      if (SPEAKER.test(before)) continue;                                                   // a hypothetical speaker's words
      const snippet = hit.text.replace(/\s+/g, " ").trim().slice(0, 160);
      if (/^>/.test(head)) {
        if (!isActionableQuotation(hit.text)) continue;
        if (unverifiableQuotations(reproducedQuotationBody(hit.text), sourceList).length === 0) continue;
        out.push({ kind: "misquotation", units: [], evidence: { type: "quote", file, quote: snippet, sources: texts.map((x) => x.id), rule: "an attributed quotation appears in its pinned sources" } });
      } else if (/^["'“”‘’«»]/.test(head)) {
        out.push({ kind: "quotation-unfound", units: [], evidence: { type: "missing", what: `a source for the quotation in ${file}: ${snippet}` } });
      }
    }
  }
  if (s.profile === "public") {
    const index = buildSourceIndex(sourceList);
    for (const file of deliverables) for (const span of scanText(maskDiagrams(s.text(file) || ""), index) || [])
      out.push({ kind: "near-verbatim", units: [], evidence: { type: "quote", file, quote: String(span.text || "").slice(0, 200), words: span.words ?? null, rule: "prose is not copied too closely from a source" } });
  }
  return out;
}

export default {
  manifest: base({ name: "ms6-quotations", serves: ["Confidence"], checkpoints: ["V3", "V8"], reads: ["deliverables", "sources", "spine"], cost: "per deliverable × source", profiles: ["public", "private"],
    emits: [
      { kind: "quotation-unfound", statusClass: "obligation", evidenceType: "missing", route: "agent" },
      { kind: "misquotation", statusClass: "defect", evidenceType: "quote", route: "agent" },
      { kind: "near-verbatim", statusClass: "defect", evidenceType: "quote", route: "agent" },
    ] }),
  run, recheck: recheckByRerun(run),
};
