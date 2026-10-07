// What ships, and whether it was checked: ONE computation for the pack and the gate (D42; red team round 2, CONTROL
// C3-04, C3-07). The pack ships every file of the package except carrier shells, the records a publish rewrites, and
// the chapter files of chapters it does not publish. Every markdown file among them must be something the harness
// reads: a deliverable (a chapter's study guide, slides or practice, or a document declared in DOCUMENTS.json — each
// segmented, linked and reviewed), the spine (approved by the instructor), a document the instructor confirmed as
// administrative, or a harness record under metadata/. And a `{{md …}}` include (orz-markdown's markdown-include,
// aliases `markdown`, `md`, `md-include`) renders another file into the one that names it, so its target must itself
// be a deliverable — read on its own — or the include is refused.
import fs from "node:fs";
import path from "node:path";
import { isCarrierPath } from "../contract.mjs";
import { makeFinding } from "../records/findings.mjs";
import { COURSE_MAP, spinePaths } from "./spine.mjs";
import { manifestChapters } from "./package_reader.mjs";
import { administrativeDocuments, deliverablesOf } from "./units_index.mjs";

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
/** The `{{md …}}` includes of a markdown text: [{ line, target }] (the block form `{{md}}\npath\n{{/md}}` too). */
export function includesOf(text) {
  const out = [], lines = String(text || "").split("\n");
  lines.forEach((l, i) => {
    for (const m of l.matchAll(INCLUDE)) {
      let target = m[1].trim();
      if (!target) { const k = lines.findIndex((x, j) => j > i && x.trim()); target = k > i && !/^\{\{\//.test(lines[k].trim()) ? lines[k].trim() : ""; }
      out.push({ line: i + 1, target });
    }
  });
  return out;
}

/**
 * What would ship unchecked (opts as shippedFiles): { documents: [rel] — shipped markdown nobody reads; includes:
 * [{ file, line, target, resolved }] — an include whose target is not a deliverable }.
 */
export function uncheckedShipped(root, reader, opts = {}) {
  const chapters = manifestChapters(reader);
  const deliverables = new Set(deliverablesOf(reader));
  const spine = new Set([COURSE_MAP, ...chapters.flatMap((c) => Object.values(spinePaths(c)))]);
  const admin = administrativeDocuments(reader);
  const { files } = shippedFiles(root, opts);
  const md = files.filter((r) => /\.(?:md|markdown)$/i.test(r));
  const documents = md.filter((r) => !deliverables.has(r) && !spine.has(r) && !admin.has(r) && !r.startsWith("metadata/"));
  const includes = [];
  for (const file of md) {
    for (const inc of includesOf(reader.text(file))) {
      const resolved = /^[a-z]+:\/\//i.test(inc.target) || path.isAbsolute(inc.target) ? null : path.posix.normalize(path.posix.join(path.posix.dirname(file), inc.target));
      if (!resolved || resolved.startsWith("..") || !deliverables.has(resolved)) includes.push({ file, line: inc.line, target: inc.target, resolved });
    }
  }
  return { documents, includes };
}

/** The gate's view: each unchecked document or include is a blocking defect for the agent. */
export function uncheckedShippedFindings(root, reader, basis) {
  const { documents, includes } = uncheckedShipped(root, reader);
  return [
    ...documents.map((rel) => makeFinding({ module: "skeleton", kind: "document-unchecked", units: [], statusClass: "defect", route: "agent", basis,
      evidence: { type: "rule", rule: "everything that ships is checked (D42)", file: rel, detail: `${rel} would ship, but nothing reads it: declare it in metadata/DOCUMENTS.json (it is then segmented, linked and reviewed like a study guide), or move it out of the package` } })),
    ...includes.map((x) => makeFinding({ module: "skeleton", kind: "include-unchecked", units: [], statusClass: "defect", route: "agent", basis,
      evidence: { type: "rule", rule: "an include renders another file into the deliverable: it must be a deliverable itself (D42)", file: x.file, line: x.line, detail: `${x.file} line ${x.line} includes "${x.target}"${x.resolved ? ` (${x.resolved})` : ""}, which is not a deliverable the harness reads: declare it in metadata/DOCUMENTS.json, or write its content into ${x.file}` } })),
  ];
}
