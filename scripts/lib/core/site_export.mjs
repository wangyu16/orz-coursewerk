// The site export (records under Alembic): what Alembic's hand-in carries. The records already live at the
// site-type contract's places (records layout, owner 2026-10-31): the working record under private/coursewerk/, the
// public record under provenance/coursewerk/ (contract §5 "records"). The export copies them, with:
//   - the verification records consolidated into append-only monthly .jsonl parts (a review run touches one or two files
//     instead of hundreds: the hand-in takes at most 200 record files per change, each at most 4 MB);
//   - the decision log in parts of at most 4 MB (LOG.jsonl, LOG.2.jsonl, …; owner 2026-11-02), joined in order the log;
//   - provenance/coursewerk/CHECKED.json built: for each page, the sha256 of the text Coursewerk checked and what was
//     open on it; the spine approvals; the accountable authors and the AI-assistance disclosure. Anyone can then tell
//     whether the version on the website is the one Coursewerk checked. No prompts, passages, source text or learner data.
//   - provenance/coursewerk/ATTRIBUTION.md with deck paths as the site holds them.
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
import { RECORDS, PUBLIC_RECORDS } from "../records/paths.mjs";

export const RECORD_LIMITS = Object.freeze({ filesPerChange: 200, bytesPerFile: 4 * 1024 * 1024, bytesPerSite: 50 * 1024 * 1024 });
const ROLL_BYTES = 3.5 * 1024 * 1024; // a verification part stays well under the 4 MB a record file may hold
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");


function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).split(path.sep).join("/")])).sort();
}

/** The verification records as monthly lines: { "verification/2026-10.jsonl": "…\n" }. A record's month is that of its
 *  own time field (at/createdAt/dispatchedAt), else of the file's modification time; lines in dispatch order. */
export function verificationLines(root) {
  const dir = path.join(root, RECORDS, "verification"), out = {}, parts = {};
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

/** The decision log as the site holds it (owner 2026-11-02: a .jsonl log in parts of at most 4 MB): the package's one
 *  LOG.jsonl cut at line ends into LOG.jsonl, LOG.2.jsonl, … each under the per-file cap. The cut depends only on what
 *  came before, so a later export leaves every full part as it was and only appends; the parts joined in order are the
 *  log byte for byte, and the hash chain runs across them. */
export function logParts(text) {
  const out = {}; let n = 1, cur = "";
  for (const line of String(text ?? "").split(/(?<=\n)/)) {
    if (!line) continue;
    if (cur && Buffer.byteLength(cur) + Buffer.byteLength(line) > ROLL_BYTES) { out[n === 1 ? "LOG.jsonl" : `LOG.${n}.jsonl`] = cur; n++; cur = ""; }
    cur += line;
  }
  if (cur) out[n === 1 ? "LOG.jsonl" : `LOG.${n}.jsonl`] = cur;
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
  let foundation = null; try { foundation = JSON.parse(reader.text(`${RECORDS}/FOUNDATION.json`) || "null"); } catch { foundation = null; }
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
  // the records already sit at the site's places (records layout); the export copies them, the verification records
  // consolidated, and builds CHECKED.json
  const priv = path.join(root, RECORDS);
  for (const rel of walk(priv).filter((r) => !r.startsWith("verification/") && !r.endsWith(".lock") && r !== "LOG.jsonl")) put(`${RECORDS}/${rel}`, fs.readFileSync(path.join(priv, rel)));
  for (const [rel, text] of Object.entries(logParts(readLogText(root)))) put(`${RECORDS}/${rel}`, text);
  for (const [rel, text] of Object.entries(verificationLines(root))) put(`${RECORDS}/${rel}`, text);
  if (gateResult) put(`${PUBLIC_RECORDS}/CHECKED.json`, JSON.stringify(checkedRecord(root, gateResult, { at }), null, 2) + "\n");
  const reader = liveReader(root), attribution = reader.text(`${PUBLIC_RECORDS}/ATTRIBUTION.md`);
  if (attribution != null) put(`${PUBLIC_RECORDS}/ATTRIBUTION.md`, attribution.replace(/\bslides\/([a-z0-9-]+)\.md\b/g, (m, s) => `slides/${s}.slides.md`));
  for (const rel of walk(path.join(root, PUBLIC_RECORDS)).filter((r) => r !== "ATTRIBUTION.md" && r !== "CHECKED.json")) put(`${PUBLIC_RECORDS}/${rel}`, fs.readFileSync(path.join(root, PUBLIC_RECORDS, rel)));
  const total = files.reduce((a, f) => a + f.bytes, 0);
  if (total > RECORD_LIMITS.bytesPerSite) problems.push(`the records total ${total} bytes, over the 50 MB a site may hold`);
  return { files, total, problems, changes: Math.ceil(files.length / RECORD_LIMITS.filesPerChange) };
}
