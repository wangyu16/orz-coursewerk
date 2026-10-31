// The site export (records under Alembic, step A; design note 2026-10-31): what Alembic's hand-in carries, mapped onto
// the site-type contract's places, without changing the working record. The local package keeps its record in
// metadata/; an Alembic site holds it in private/coursewerk/ (written only through the hand-in) and publishes
// provenance/coursewerk/ as it is (contract §5 "records").
//   - private/coursewerk/: the working record, same relative paths, except the verification records, which become one
//     append-only .jsonl per month (a review run touches one or two files instead of hundreds: the hand-in takes at
//     most 200 record files per change). The decision log is copied byte for byte, so its chain stays verifiable.
//   - provenance/coursewerk/CHECKED.json: for each page, the sha256 of the text Coursewerk checked and what was open on
//     it; the spine approvals; the accountable authors and the AI-assistance disclosure. Anyone can then tell whether
//     the version on the website is the one Coursewerk checked. No prompts, passages, source text or learner data.
//   - provenance/coursewerk/ATTRIBUTION.md: the package's attribution, with deck paths as the site holds them.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { liveReader, manifestChapters } from "./package_reader.mjs";
import { deliverablesOf } from "./units_index.mjs";
import { unitInfoOf } from "./workflow.mjs";
import { chapterOfFile } from "./segment.mjs";
import { approvalStatus } from "./approvals.mjs";
import { spinePaths, COURSE_MAP } from "./spine.mjs";
import { parseLog, readLogText } from "../records/log.mjs";

export const RECORD_LIMITS = Object.freeze({ filesPerChange: 200, bytesPerFile: 4 * 1024 * 1024, bytesPerSite: 50 * 1024 * 1024 });
const ROLL_BYTES = 3.5 * 1024 * 1024; // a verification part stays well under the 4 MB a record file may hold
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

// the working record, as the site holds it; anything else under metadata/ is not exported (v0.12 records, digests,
// preflight receipts and local reports stay with the local package)
const RECORD_FILES = ["LOG.jsonl", "coursewerk.json", "STEERING.json", "FOUNDATION.json", "PROVENANCE.json", "SOURCE_RECORD.json", "REFERENCE_RECORD.json", "LINK_RESOLUTIONS.json", "DOCUMENTS.json", "MEDIA_PLAN.json"];
const RECORD_DIRS = ["units", "spine", "publish", "corrections", "evidence"];

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).split(path.sep).join("/")])).sort();
}

/** The verification records as monthly lines: { "verification/2026-10.jsonl": "…\n" }. A record's month is that of its
 *  own time field (at/createdAt/dispatchedAt), else of the file's modification time; lines in dispatch order. */
export function verificationLines(root) {
  const dir = path.join(root, "metadata", "verification"), out = {}, parts = {};
  // in the order the dispatches were made (their own `at`, then the file name), so a later export only appends lines
  const recs = walk(dir).filter((f) => f.endsWith(".json")).map((rel) => {
    const raw = fs.readFileSync(path.join(dir, rel), "utf8");
    let rec; try { rec = JSON.parse(raw); } catch { rec = { unreadable: raw.length }; }
    return { rel, rec, when: String(rec.at || rec.createdAt || rec.dispatchedAt || rec.time || "") || fs.statSync(path.join(dir, rel)).mtime.toISOString() };
  }).sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  for (const { rel, rec, when } of recs) {
    const month = /^\d{4}-\d{2}/.exec(when)?.[0] || "undated";
    const line = JSON.stringify({ file: rel, record: rec }) + "\n";
    // a month rolls into numbered parts below the per-file cap (2026-10.jsonl, 2026-10.2.jsonl, …); still append-only:
    // new lines only ever go into the last part
    const part = (parts[month] ||= { n: 1, bytes: 0 });
    if (part.bytes && part.bytes + Buffer.byteLength(line) > ROLL_BYTES) { part.n++; part.bytes = 0; }
    const key = `verification/${month}${part.n > 1 ? `.${part.n}` : ""}.jsonl`;
    out[key] = (out[key] || "") + line; part.bytes += Buffer.byteLength(line);
  }
  return out;
}

/** The site path of a package file: the deck as the site holds it (slides/<slug>.slides.md). */
const sitePath = (rel, reader) => (/^slides\/[^/]+(?<!\.slides)\.md$/.test(rel) && reader.text(rel.replace(/\.md$/, ".slides.md")) == null ? rel.replace(/\.md$/, ".slides.md") : rel);

/** CHECKED.json for a package and a gate result (runGate). */
export function checkedRecord(root, gateResult, { at = new Date().toISOString() } = {}) {
  const reader = liveReader(root), chapters = manifestChapters(reader);
  const unitInfo = unitInfoOf(root, reader);
  const deliverableOf = new Map([...unitInfo].map(([id, x]) => [id, x.deliverable]));
  const findings = gateResult.findings || [];
  const pages = [...deliverablesOf(reader), COURSE_MAP, ...chapters.flatMap((c) => Object.values(spinePaths(c)))].filter((rel, i, all) => reader.text(rel) != null && all.indexOf(rel) === i);
  const open = (rel) => {
    const mine = findings.filter((f) => f.status !== "answered" && ((f.units || []).some((u) => deliverableOf.get(u) === rel) || f.evidence?.file === rel));
    const by = (c) => mine.filter((f) => f.statusClass === c).length;
    return { defects: by("defect"), obligations: by("obligation"), questions: by("question") };
  };
  const log = parseLog(readLogText(root)), last = log.at(-1);
  const approvals = approvalStatus(reader, chapters, readLogText(root)).scopes;
  let foundation = null; try { foundation = JSON.parse(reader.text("metadata/FOUNDATION.json") || "null"); } catch { foundation = null; }
  return {
    schemaVersion: 1,
    madeWith: "Coursewerk",
    checkedAt: at,
    log: last ? { seq: last.seq, hash: last.hash } : null,
    pages: pages.map((rel) => ({ path: sitePath(rel, reader), sha256: sha256(reader.text(rel)), open: open(rel), chapter: rel === COURSE_MAP ? null : chapterOfFile(rel) })),
    approvals: Object.values(approvals).map((s) => ({ scope: s.scope, valid: !!s.valid, ...(s.record ? { by: s.record.party?.name ?? null, at: s.record.at ?? null, contentHash: s.record.payload?.contentHash ?? null } : {}) })),
    authors: (foundation?.outputAuthors || []).map((a) => ({ name: a.name, role: a.role ?? null })),
    aiAssistance: [...new Set((foundation?.outputAuthors || []).map((a) => a.aiAssistanceDisclosure).filter(Boolean))],
  };
}

/**
 * Export a package's records for an Alembic site into `outDir` (private/coursewerk/…, provenance/coursewerk/…).
 * Returns { files: [{ path, bytes, sha256 }], problems: [string] } — problems name any breach of the contract's records
 * budget (a file over 4 MB, more than 50 MB in all). Writes nothing into the package.
 */
export function exportSite(root, outDir, { gateResult, at } = {}) {
  const files = [], problems = [];
  const put = (rel, data) => {
    const dest = path.join(outDir, rel); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, data);
    const bytes = Buffer.byteLength(data); files.push({ path: rel, bytes, sha256: sha256(data) });
    if (bytes > RECORD_LIMITS.bytesPerFile) problems.push(`${rel} is ${bytes} bytes, over the 4 MB a record file may hold`);
  };
  const meta = path.join(root, "metadata");
  for (const f of RECORD_FILES) if (fs.existsSync(path.join(meta, f))) put(`private/coursewerk/${f === "LOG.jsonl" ? "log.jsonl" : f}`, fs.readFileSync(path.join(meta, f)));
  for (const d of RECORD_DIRS) for (const rel of walk(path.join(meta, d))) put(`private/coursewerk/${d}/${rel}`, fs.readFileSync(path.join(meta, d, rel)));
  for (const [rel, text] of Object.entries(verificationLines(root))) put(`private/coursewerk/${rel}`, text);
  if (gateResult) put("provenance/coursewerk/CHECKED.json", JSON.stringify(checkedRecord(root, gateResult, { at }), null, 2) + "\n");
  const reader = liveReader(root), attribution = reader.text("metadata/ATTRIBUTION.md");
  if (attribution != null) put("provenance/coursewerk/ATTRIBUTION.md", attribution.replace(/\bslides\/([a-z0-9-]+)\.md\b/g, (m, s) => (reader.text(`slides/${s}.slides.md`) != null || reader.text(m) != null ? `slides/${s}.slides.md` : m)));
  const total = files.reduce((a, f) => a + f.bytes, 0);
  if (total > RECORD_LIMITS.bytesPerSite) problems.push(`the records total ${total} bytes, over the 50 MB a site may hold`);
  return { files, total, problems, changes: Math.ceil(files.length / RECORD_LIMITS.filesPerChange) };
}
