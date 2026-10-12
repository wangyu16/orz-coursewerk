// What ships, and whether it was checked: ONE computation for the pack and the gate (D42; red team round 2, CONTROL
// C3-04, C3-07). The pack ships every file of the package except carrier shells, the records a publish rewrites, and
// the chapter files of chapters it does not publish. Every file among them must be something the harness reads: a
// deliverable (a chapter's study guide, slides or practice, or a document declared in DOCUMENTS.json — each segmented,
// linked and reviewed), the spine (approved by the instructor), a document the instructor confirmed as administrative,
// a harness record NAMED EXACTLY (round 6, C3-04: never "anything under metadata/"), or media that carries no text
// (images, sound, video, fonts) — and an SVG or PDF under assets/, which ships as media like an image (D49, operator
// 2026-10-12): the visual review covers it as it covers an image. Any other file — markdown or not (html, txt, an svg or
// pdf outside assets/, json outside the records …) — is refused. And a
// `{{md …}}` include (orz-markdown's markdown-include, aliases `markdown`, `md`, `md-include`) renders another file
// into the one that names it, so its target must itself be a deliverable — read on its own — and must print nothing
// under the includer's frame that its own reading leaves out (round 6, C3-03), or the include is refused.
import fs from "node:fs";
import path from "node:path";
import { isCarrierPath } from "../contract.mjs";
import { makeFinding } from "../records/findings.mjs";
import { COURSE_MAP, spinePaths } from "./spine.mjs";
import { manifestChapters } from "./package_reader.mjs";
import { administrativeDocuments, deliverablesOf } from "./units_index.mjs";
import { frameOf, printedModel } from "./printed.mjs";
import { segmentDeliverable } from "./segment.mjs";

const CHAPTER_FILE = /^(?:study-guide|slides|practice|concepts|assessment-support)\/([^/]+)\.md$/;
const CHAPTER_SIDECAR = /^metadata\/units\/(?:study-guide|slides|practice)\/([^/]+)\.md\.json$/;

/**
 * The package files a pack ships, in a stable order: { files: [rel], left: number of files left out }. `keep(slug)`:
 * whether a chapter's files ship (default: every chapter); `course`: whether the course map ships (default: yes).
 */
export function shippedFiles(pkg, { keep = () => true, course = true } = {}) {
  const files = [];
  let left = 0;
  const walk = (d, rel = "") => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    // records the publish content hash does not bind are not shipped (the decision record is written from the log)
    if (r === ".git" || e.name === ".DS_Store" || r.startsWith("metadata/digest") || r.startsWith("metadata/publish") || r === "metadata/FINDINGS.json") continue;
    if (e.isDirectory()) { walk(path.join(d, e.name), r); continue; }
    if (!e.isFile() || isCarrierPath(r)) { left++; continue; }
    const ch = r.match(CHAPTER_FILE)?.[1] || r.match(CHAPTER_SIDECAR)?.[1];
    if ((ch && r !== COURSE_MAP && !keep(ch)) || (r === COURSE_MAP && !course)) { left++; continue; }
    files.push(r);
  } };
  walk(pkg);
  return { files, left };
}

const INCLUDE = /\{\{\s*(?:markdown|md-include|md)\b([^}]*)\}\}/g;
/**
 * The `{{md …}}` includes of a markdown text: [{ line, target }]. Read from orz-markdown's own token stream, so every
 * form it renders is seen — one line, `[args]`, the path on its own line(s) up to a line holding "}}", inside a
 * container, list or quote (round 3, C3-07) — plus the harness's earlier line forms (a `{{md}}`/path/`{{/md}}` block
 * orz does not render, a directive in running text): refusing one too many is safe, missing one is not.
 */
export function includesOf(text) {
  const out = [...printedModel(text).includes], lines = String(text || "").split("\n");
  lines.forEach((l, i) => {
    for (const m of l.matchAll(INCLUDE)) {
      let target = m[1].replace(/^\[[^\]]*\]/, "").trim();
      if (!target) { const k = lines.findIndex((x, j) => j > i && x.trim()); target = k > i && !/^\{\{\//.test(lines[k].trim()) ? lines[k].trim() : ""; }
      out.push({ line: i + 1, target });
    }
  });
  const seen = new Set();
  return out.filter((x) => { const k = `${x.line}|${x.target}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.line - b.line);
}

/**
 * What a deliverable hides from its reader while the review reads it (round 3, C1-05): [{ file, line, what }] — raw
 * HTML that can hide what it wraps (printed.mjs: anything outside the visible phrasing set; a comment inside printed
 * text; maths that typesets invisibly), and a unit orz-markdown prints nothing of (a link reference definition, say).
 * Coverage read from such text would be coverage no student sees, so each is a blocking defect for the agent.
 */
export function hiddenContent(root, reader, { keep = () => true } = {}) {
  const out = [];
  for (const file of deliverablesOf(reader)) {
    const ch = file.match(CHAPTER_FILE)?.[1];
    if (ch && !keep(ch)) continue;
    const text = reader.text(file);
    if (text == null) continue;
    out.push(...hiddenInText(text, file));
  }
  return out;
}

/** What one deliverable's text hides from its reader, read through its frame: [{ file, line, what }]. */
export function hiddenInText(text, file) {
  const out = [], m = printedModel(text, { frame: frameOf(file, text) }), lines = String(text).split("\n");
  for (const h of m.hidden) out.push({ file, line: h.line, what: h.what });
  for (const u of segmentDeliverable(text, file).units) {
    // EVERY line of a unit must print (round 4): a link reference definition on a paragraph's first line, or a line
    // the frame drops, is text the review reads and no student sees, even when the unit's other lines print
    const dark = []; for (let k = u.startLine - 1; k < u.endLine; k++) if (lines[k]?.trim() && !m.printed.has(k)) dark.push(k);
    // the frame's own reason, where it dropped the line (a slide region it does not show: round 5, CONTROL C1-01/02)
    const why = dark.map((k) => m.dropped?.get(k)).find(Boolean), because = why ? ` — ${why}` : "";
    if (dark.length && dark.length === lines.slice(u.startLine - 1, u.endLine).filter((l) => l.trim()).length) out.push({ file, line: u.startLine, what: `a ${u.form} that prints nothing ("${u.text.replace(/\s+/g, " ").slice(0, 60)}")${because}` });
    else if (dark.length) out.push({ file, line: dark[0] + 1, what: `a line of a ${u.form} that prints nothing ("${lines[dark[0]].trim().slice(0, 60)}")${because}` });
  }
  return out;
}

// ---- what ships equals what is read (red team round 6, CONTROL C3-04) ----------------------------------------------
// A file is exempt from being read only as a HARNESS RECORD named exactly — a known record file, or a record path of a
// known shape — never by its folder: `metadata/further-reading.md` is no record. The records and why each is exempt:
/** Record files, by exact path: the harness's own JSON records, the generated attribution (assurance.mjs requires it to
 *  equal what PROVENANCE.json generates), the package manifest and the root files the Alembic contract allows (LICENSE
 *  is checked as the exact canonical licence text; CITATION.cff and .gitignore print nothing a student reads). */
export const RECORD_FILES = Object.freeze(new Set([
  "alembic.json", "LICENSE", "CITATION.cff", ".gitignore",
  "metadata/ATTRIBUTION.md", "metadata/CLAIMS.json", "metadata/COMPONENT_INDEX.json", "metadata/DOCUMENTS.json", "metadata/FOUNDATION.json",
  "metadata/KEY_FACT_REVIEW.json", "metadata/LINK_RESOLUTIONS.json", "metadata/LOG.jsonl", "metadata/MEDIA_PLAN.json", "metadata/OVERRIDES.json",
  "metadata/PROVENANCE.json", "metadata/REFERENCE_RECORD.json", "metadata/REVIEW_QUEUE.json", "metadata/SOURCE_RECORD.json", "metadata/SPINE.json",
  "metadata/STEERING.json", "metadata/TERMS.json", "metadata/VISUAL_REVIEW.json", "metadata/coursewerk.json", "metadata/modules.json",
]));
/** Record paths, by shape: unit sidecars, review dispatches, claim records, preflight receipts, spine origins and
 *  reviews, auto-corrections — each a JSON record the harness writes and reads back. */
export const RECORD_PATHS = Object.freeze([
  /^metadata\/units\/(?:[^/]+\/)*[^/]+\.md\.json$/, /^metadata\/verification\/[^/]+\.json$/, /^metadata\/claims\/(?:[^/]+\/)*[^/]+\.json$/,
  /^metadata\/preflight\/[^/]+\.json$/, /^metadata\/spine\/(?:[^/]+\/)*[^/]+\.origins\.json$/, /^metadata\/spine\/(?:review|critique)\/[^/]+\.json$/,
  /^metadata\/corrections\/[^/]+\.json$/,
]);
/** Media whose content is pixels or sound, never text a student reads as prose (an image's words are the visual
 *  review's: VISUAL_REVIEW.json). Every other file that ships can carry text, and is read or refused. */
export const MEDIA_EXTENSIONS = Object.freeze(new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "mp3", "ogg", "oga", "wav", "flac", "m4a", "mp4", "webm", "ogv", "mov", "woff", "woff2", "ttf", "otf"]));
/** Figures that are drawn documents — an SVG, a PDF — ship as media when they sit under assets/ (D49, operator
 *  2026-10-12): an asset is a visual component (coherence.mjs: every assets/ file re-owes the visual review when it
 *  changes, and a carrier that embeds one binds its digest into VISUAL_REVIEW.json, as for an image). Elsewhere an SVG
 *  or PDF is a text-bearing file like any other, read or refused. */
export const ASSET_MEDIA_EXTENSIONS = Object.freeze(new Set(["svg", "pdf"]));
const fileExt = (r) => (/\.([^./]+)$/.exec(r)?.[1] || "").toLowerCase();
/** Does a shipped file ship as media (pixels, sound, a font, or a drawn figure under assets/)? */
export const isMedia = (rel) => MEDIA_EXTENSIONS.has(fileExt(rel)) || (/^assets\//.test(rel) && ASSET_MEDIA_EXTENSIONS.has(fileExt(rel)));
/** The rights-evidence snapshots a record names (`evidenceSnapshot` in FOUNDATION.json, SOURCE_RECORD.json,
 *  MEDIA_PLAN.json or PROVENANCE.json; assurance.mjs binds each to its sha256): only those are records. */
export function namedEvidence(reader) {
  const out = new Set();
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (k === "evidenceSnapshot" && typeof x === "string") out.add(path.posix.normalize(x.replace(/\\/g, "/"))); else walk(x); } };
  for (const rel of ["metadata/FOUNDATION.json", "metadata/SOURCE_RECORD.json", "metadata/MEDIA_PLAN.json", "metadata/PROVENANCE.json"]) { try { walk(JSON.parse(reader.text(rel) || "null")); } catch { /* an unreadable record names nothing */ } }
  return new Set([...out].filter((r) => /^metadata\/evidence\/[^/]+$/.test(r)));
}
const isMarkdown = (r) => /\.(?:md|markdown)$/i.test(r);
/** Is a shipped file a harness record, named exactly? */
export const isHarnessRecord = (rel, evidence = new Set()) => RECORD_FILES.has(rel) || RECORD_PATHS.some((re) => re.test(rel)) || evidence.has(rel);

/** The frame a file's text renders in when another file includes it: orz-markdown renders it as page content wherever
 *  it lands (in a page, in a slide region), and orz-paged prints its curated elements too. */
const includedFrame = (includer, text) => (frameOf(includer, text) === "paged" ? "paged" : "page");
/**
 * What an include prints that its target's own reading does not (red team round 6, CONTROL C3-03): the target is read
 * on its own under ITS frame (a deck under orz-slides, where speaker notes are the presenter's and no unit), but the
 * include renders it under the INCLUDER's — where `<!-- @notes -->` is a comment and the notes are paragraphs, a
 * dropped slide region prints, a deck's text before its first slide prints. Every line that prints there and not
 * there is text no check read: [0-based line] (empty: the include prints nothing its target's reading left out).
 */
export function printedOnlyWhenIncluded(includer, includerText, target, targetText) {
  const own = printedModel(targetText, { frame: frameOf(target, targetText) }).printed;
  const there = printedModel(targetText, { frame: includedFrame(includer, includerText) }).printed;
  const lines = String(targetText ?? "").split("\n");
  return [...there].filter((k) => !own.has(k) && lines[k]?.trim()).sort((a, b) => a - b);
}

/**
 * What would ship unchecked (opts as shippedFiles): { documents: [rel] — a shipped file nobody reads: markdown that is
 * no deliverable, spine, administrative document or named record, and any other file that can carry text (html, txt,
 * svg or pdf outside assets/, json outside the named records …); includes: [{ file, line, target, resolved, why? }] — an include whose target is not a deliverable, or that
 * prints, under the includer's frame, text the target's own reading leaves out }.
 */
export function uncheckedShipped(root, reader, opts = {}) {
  const chapters = manifestChapters(reader);
  const deliverables = new Set(deliverablesOf(reader));
  const spine = new Set([COURSE_MAP, ...chapters.flatMap((c) => Object.values(spinePaths(c)))]);
  const admin = administrativeDocuments(reader);
  const evidence = namedEvidence(reader);
  const { files: shipped } = shippedFiles(root, opts);
  const md = shipped.filter((r) => /\.(?:md|markdown)$/i.test(r));
  // exempt by exact record name only (round 6, C3-04): a markdown file under metadata/ is read like any other
  const documents = md.filter((r) => !deliverables.has(r) && !spine.has(r) && !admin.has(r) && !isHarnessRecord(r, evidence));
  const files = shipped.filter((r) => !/\.(?:md|markdown)$/i.test(r) && !isHarnessRecord(r, evidence) && !isMedia(r));
  const includes = [];
  for (const file of md) {
    const text = reader.text(file);
    for (const inc of includesOf(text)) {
      const resolved = /^[a-z]+:\/\//i.test(inc.target) || path.isAbsolute(inc.target) ? null : path.posix.normalize(path.posix.join(path.posix.dirname(file), inc.target));
      if (!resolved || resolved.startsWith("..") || !deliverables.has(resolved)) { includes.push({ file, line: inc.line, target: inc.target, resolved }); continue; }
      // read under the includer's frame (round 6, C3-03): an include that prints what its target's own reading left
      // out is refused — its text would be read by no unit and no review
      const targetText = reader.text(resolved), extra = printedOnlyWhenIncluded(file, text, resolved, targetText);
      if (extra.length) {
        const tl = String(targetText).split("\n"), notes = printedModel(targetText, { frame: frameOf(resolved, targetText) }).notes;
        // name the speaker notes first: they are the presenter's text, printed to students as page text
        const first = extra.find((k) => notes.has(k)) ?? extra[0];
        includes.push({ file, line: inc.line, target: inc.target, resolved, why: `${resolved} is read under its own frame (${frameOf(resolved, targetText)}), but included here it renders as ${includedFrame(file, text)} content, which prints ${extra.length} line(s) its own reading leaves out (line ${first + 1}: "${tl[first].trim().slice(0, 60)}"${notes.has(first) ? ", a speaker note" : ""}${frameOf(resolved, targetText) === "slides" ? " — speaker notes and text the deck does not show print as paragraphs" : ""})` });
      }
    }
  }
  return { documents: [...documents, ...files].sort(), includes };
}

/** The gate's view: each unchecked document or include, and each hidden passage, is a blocking defect for the agent. */
export function uncheckedShippedFindings(root, reader, basis) {
  const { documents, includes } = uncheckedShipped(root, reader);
  return [
    ...hiddenContent(root, reader).map((x) => makeFinding({ module: "skeleton", kind: "content-hidden", units: [], statusClass: "defect", route: "agent", basis,
      evidence: { type: "rule", rule: "what is checked is what the student sees: no text hidden from the reader counts (round 3, C1-05)", file: x.file, line: x.line, detail: `${x.file} line ${x.line}: ${x.what} — it can hide text from the student that the review reads. Write it in orz-markdown (\`::: spoil <label>\` for a reveal, a container for a box), or remove it` } })),
    ...documents.filter(isMarkdown).map((rel) => makeFinding({ module: "skeleton", kind: "document-unchecked", units: [], statusClass: "defect", route: "agent", basis,
      evidence: { type: "rule", rule: "everything that ships is checked (D42)", file: rel, detail: `${rel} would ship, but nothing reads it: declare it in metadata/DOCUMENTS.json (it is then segmented, linked and reviewed like a study guide), or move it out of the package` } })),
    ...documents.filter((r) => !isMarkdown(r)).map((rel) => makeFinding({ module: "skeleton", kind: "document-unchecked", units: [], statusClass: "defect", route: "agent", basis,
      evidence: { type: "rule", rule: "what ships is what is read: a file that can carry text is read or refused, wherever it ships from (round 6, C3-04)", file: rel, detail: `${rel} would ship, and it can carry text a student reads, but nothing reads it (only markdown deliverables, the spine and named harness records are read): write it as a markdown document declared in metadata/DOCUMENTS.json, or move it out of the package` } })),
    ...includes.map((x) => makeFinding({ module: "skeleton", kind: "include-unchecked", units: [], statusClass: "defect", route: "agent", basis,
      evidence: x.why
        ? { type: "rule", rule: "an included file is read under the includer's frame: an include that prints what its target's own reading leaves out is refused (round 6, C3-03)", file: x.file, line: x.line, detail: `${x.file} line ${x.line} includes "${x.target}": ${x.why}. Write the content you want shown into ${x.file}, or include a document read under the same frame` }
        : { type: "rule", rule: "an include renders another file into the deliverable: it must be a deliverable itself (D42)", file: x.file, line: x.line, detail: `${x.file} line ${x.line} includes "${x.target}"${x.resolved ? ` (${x.resolved})` : ""}, which is not a deliverable the harness reads: declare it in metadata/DOCUMENTS.json, or write its content into ${x.file}` } })),
  ];
}
