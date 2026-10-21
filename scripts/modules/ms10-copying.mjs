// MS10 — Reference texts are read for their ideas, never copied (D54, operator 2026-10-21: "avoid to use exact
// sentences but catch the idea and the knowledge"). Every text the package ships (the chapters' deliverables and spine,
// the course map, declared documents) is compared with the pinned text of every reference source — a declared source
// with use "reference" (a textbook, the instructor's prior notes) and every pinned verification reference (a paper,
// a web page). A run of COPY_RUN or more consecutive words in common is copied expression: a blocking defect for the
// agent, who rewrites it in their own words. A reference source whose text is not pinned cannot be compared, so it
// fails closed. Words are compared case-folded, letters and digits only, so markup, punctuation and line breaks
// neither hide a copy nor make one; web addresses and DOIs are citations, not expression, and are not compared.
import { base, chaptersOf, recheckByRerun } from "./_shared.mjs";
import { pinnedTexts, snapshotInputReader } from "../lib/verify/references.mjs";

export const COPY_RUN = 8;
const IN = "@inputs/";
// a citation is not expression: web addresses and DOIs are blanked (keeping offsets) before words are read, so citing
// the same paper as a reference does is never a copy
const CITATION = /\b(?:https?:\/\/|www\.)[^\s)\]>"']+|\bdoi:\s*10\.\S+|\b10\.\d{4,9}\/[^\s)\]>"']+/giu;
const blankCitations = (text) => String(text ?? "").replace(CITATION, (m) => " ".repeat(m.length));
const wordsOf = (text) => { const out = []; for (const m of blankCitations(text).matchAll(/[\p{L}\p{N}]+/gu)) out.push({ w: m[0].toLowerCase(), at: m.index }); return out; };

/** The texts the package ships that a reader reads (D42, D53): chapter deliverables and spine, course map, declared documents. */
function shippedTexts(s) {
  const rels = new Set(["concepts/course.md"]);
  for (const ch of chaptersOf(s)) for (const d of ["study-guide", "slides", "practice", "concepts", "assessment-support"]) rels.add(`${d}/${ch}.md`);
  for (const d of s.json("metadata/DOCUMENTS.json")?.documents || []) if (typeof d?.source === "string") rels.add(d.source);
  return [...rels].map((rel) => [rel, s.text(rel)]).filter(([, t]) => t != null);
}

/**
 * The runs a text shares with a reference: [{ from, to, words }] (word indexes into `text`, and the shared words).
 * `refShingles` is the Set of COPY_RUN-word strings of the reference.
 */
export function sharedRuns(text, refShingles, n = COPY_RUN) {
  const w = wordsOf(text), runs = [];
  for (let i = 0; i + n <= w.length; i++) {
    if (!refShingles.has(w.slice(i, i + n).map((x) => x.w).join(" "))) continue;
    const last = runs.at(-1);
    if (last && i <= last.to) last.to = i + n; else runs.push({ from: i, to: i + n });
  }
  return runs.map((r) => ({ ...r, at: w[r.from].at, words: w.slice(r.from, r.to).map((x) => x.w).join(" ") }));
}
export function shinglesOf(text, n = COPY_RUN) {
  const w = wordsOf(text).map((x) => x.w), out = new Set();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

function run(s) {
  const out = [];
  const foundation = s.json("metadata/FOUNDATION.json");
  const refSources = (foundation?.sources || []).filter((x) => x?.use === "reference" && x.id);
  const pinned = pinnedTexts(snapshotInputReader(s));
  const corpus = s.json(`${IN}SOURCE_CORPUS.json`);
  const corpusIds = new Set((corpus?.sources || []).map((e) => e.sourceId));
  const refs = [];
  for (const src of refSources) {
    const p = pinned.get(src.id);
    if (!p || !p.ok) {
      out.push({ kind: "reference-text-missing", units: [], evidence: { type: "missing", what: !corpus ? `the pinned text of reference source ${src.id}: run the gate with --inputs` : !corpusIds.has(src.id) ? `the pinned text of reference source ${src.id} (pin it in the source corpus: scripts/prepare_source_corpus.mjs)` : `the pinned text of reference source ${src.id} matching its pin`, source: src.id } });
      continue;
    }
    refs.push({ id: src.id, text: p.text });
  }
  for (const [id, p] of pinned) if (p.kind === "reference" && p.ok) refs.push({ id, text: p.text });
  if (!refs.length) return out;
  const texts = shippedTexts(s);
  for (const ref of refs) {
    const sh = shinglesOf(ref.text);
    for (const [rel, text] of texts) {
      for (const r of sharedRuns(text, sh)) {
        const line = String(text).slice(0, r.at).split("\n").length;
        out.push({ kind: "reference-copied", units: [], evidence: { type: "rule", rule: `a reference is read for its ideas, never copied: no run of ${COPY_RUN} or more words in common with a reference text (D54)`, file: rel, line, source: ref.id, words: r.words.length > 160 ? `${r.words.slice(0, 157)}…` : r.words, length: r.to - r.from } });
      }
    }
  }
  return out;
}

export default {
  manifest: base({ name: "ms10-copying", serves: ["Confidence"], checkpoints: ["V0", "V8"], reads: ["deliverables", "sources"], cost: "one pass over every reference text", profiles: ["public", "private"],
    emits: [
      { kind: "reference-copied", statusClass: "defect", evidenceType: "rule", route: "agent" },
      { kind: "reference-text-missing", statusClass: "obligation", evidenceType: "missing", route: "agent" },
    ] }),
  run, recheck: recheckByRerun(run),
};
