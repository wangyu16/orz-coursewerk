// The chain check for a hand-out and hand-back (req.records.chain-check; Alembic Door E, owner 2026-11-07). Alembic
// keeps a course's decision log and must know, when a package comes back, that its log continues the one Alembic last
// held: every record it held is still there, unchanged and in order, and only new records follow. Coursewerk owns the
// log's format, so Coursewerk provides the check; it reads only, and writes nothing.
//
//   checkRecords(root, { extends: earlierText }) → { ok, problems, log: { records, bytes, sha256, parts, head } }
//
// The log is read as either layout holds it: one private/coursewerk/LOG.jsonl (a package), or Alembic's parts
// (LOG.jsonl, LOG.2.jsonl, …; site_export logParts) joined in order — the same bytes either way. It must verify
// (verifyLog: every record well formed, numbered in order, hashed and chained to the one before), and, given the log
// last held, extend it byte for byte (verifyExtends, the check the gate makes against the committed log). Anything that
// cannot be read is a problem, never an empty log that "verifies".
//
// With `records: true` (records_check.mjs --records; FC-16 O5) it also checks the review records the log binds, as the
// gate does (ms8 dispatch-unlogged / dispatch-record-missing), so a returned course with a rewritten record is refused
// at once rather than at its next gate run: every verification record reads whole (its shared prompt parts present and
// the ones named) and is the record a logged dispatch vouches for; every logged dispatch keeps its record; every file in
// a folder under verification/ is a prompt part its name says. Either layout: one file per record (a package), or
// Alembic's monthly .jsonl parts of wrapped records ({"file","record"} lines, site_export verificationLines).
import fs from "node:fs";
import path from "node:path";
import { sha256 } from "./canonical.mjs";
import { parseLog, verifyExtends, verifyLog } from "./log.mjs";
import { RECORDS } from "./paths.mjs";
import { PARTS_DIR, VERIFICATION_DIR, dispatchLogEntry, expandDispatch, isDispatchPath, readPart } from "../verify/dispatch.mjs";
import { unwrappedText, wrappedLine } from "../core/site_host.mjs";

const LOG_PART = /^LOG(?:\.(\d+))?\.jsonl$/;

/**
 * The decision log of a folder, in either layout: { text, parts: [rel], problems }. Parts must be LOG.jsonl, LOG.2.jsonl,
 * … without gaps, each a regular file ending at a line end (as Coursewerk cuts them), and the joined bytes UTF-8.
 */
export function readJoinedLog(root) {
  const dir = path.join(path.resolve(root), RECORDS), problems = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { text: "", parts: [], problems: [`${RECORDS}/ is missing: this folder holds no Coursewerk records`] };
  const parts = fs.readdirSync(dir).map((name) => ({ name, m: LOG_PART.exec(name) })).filter((x) => x.m)
    .map(({ name, m }) => ({ name, n: m[1] ? Number(m[1]) : 1 })).sort((a, b) => a.n - b.n);
  if (!parts.length) return { text: "", parts: [], problems: [`${RECORDS}/LOG.jsonl is missing: there is no decision log to check`] };
  if (parts.some((p, i) => p.n !== i + 1 || (p.n === 1 && p.name !== "LOG.jsonl")))
    return { text: "", parts: parts.map((p) => `${RECORDS}/${p.name}`), problems: [`the decision log parts are not LOG.jsonl, LOG.2.jsonl, … without gaps (found ${parts.map((p) => p.name).join(", ")})`] };
  const bufs = [];
  for (const p of parts) {
    const full = path.join(dir, p.name), st = fs.lstatSync(full);
    if (!st.isFile()) { problems.push(`${RECORDS}/${p.name} is not a regular file`); continue; }
    const buf = fs.readFileSync(full);
    if (parts.length > 1 && buf.length && buf[buf.length - 1] !== 0x0a) problems.push(`${RECORDS}/${p.name} does not end at a line end: the parts were not cut as Coursewerk cuts them`);
    bufs.push(buf);
  }
  const joined = Buffer.concat(bufs), text = joined.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(joined)) problems.push("the decision log is not UTF-8 text");
  return { text, parts: parts.map((p) => `${RECORDS}/${p.name}`), problems };
}

/**
 * Check a folder's decision log; with `extends` (the text of the log last held), check that it continues that log.
 * `extends: undefined` checks the log alone; an empty string is an empty earlier log (any log with records that verifies extends it).
 */
export function checkRecords(root, { extends: earlier, records: withRecords = false } = {}) {
  const { text, parts, problems } = readJoinedLog(root);
  if (!problems.length) {
    problems.push(...verifyLog(text));
    if (earlier !== undefined) problems.push(...verifyExtends(String(earlier), text));
    // a package always has a decision log with records (its intake at least): an empty one is a log lost, never one that
    // verifies, alone or under --extends (audit LOW-2, audit2 LOW-B). An empty earlier log may still be continued by a
    // log that has records.
    if (!parseLog(text).length) problems.push(`${RECORDS}/LOG.jsonl holds no records: an empty decision log is not a log that verifies`);
  }
  const records = problems.length ? null : parseLog(text);
  // the review records are checked against a log that verifies; against one that does not, nothing can vouch for them
  const bound = withRecords ? (records ? checkReviewRecords(root, records) : { problems: [], summary: null }) : null;
  if (bound) problems.push(...bound.problems);
  return {
    ok: problems.length === 0,
    problems: [...new Set(problems)],
    log: { parts, bytes: Buffer.byteLength(text), sha256: sha256(text), records: records ? records.length : null, head: records?.at(-1)?.hash ?? null },
    ...(earlier !== undefined ? { extends: { bytes: Buffer.byteLength(String(earlier)), sha256: sha256(String(earlier)), records: String(earlier).split("\n").filter((l) => l.trim()).length } } : {}),
    ...(bound ? { records: bound.summary } : {}),
  };
}

const MAX_RECORD_PROBLEMS = 50; // a course with thousands of records names the first ones, then counts the rest
const PART_FILE = new RegExp(`^${PARTS_DIR}/[0-9a-f]{64}\\.json$`);
const cleanRel = (rel) => typeof rel === "string" && /\.json$/.test(rel) && !rel.includes("\\") && !path.posix.isAbsolute(rel) && rel.split("/").every((s) => s && s !== "." && s !== "..");

/**
 * The verification folder of a package or a site-layout folder, read as files: Map(package-relative path → text), with
 * the wrapped records of Alembic's .jsonl parts put back as the files they came from (site_host unwrappedText), and the
 * monthly parts it read. Anything Coursewerk did not write is a problem (as site_import refuses it).
 */
function verificationFiles(root) {
  const dir = path.join(root, VERIFICATION_DIR), files = new Map(), problems = [], jsonl = [];
  if (!fs.existsSync(dir)) return { files, problems, parts: 0 };
  if (!fs.lstatSync(dir).isDirectory()) return { files, problems: [`${VERIFICATION_DIR} is not a folder`], parts: 0 };
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)).flatMap((e) => {
    const full = path.join(d, e.name), rel = path.relative(dir, full).split(path.sep).join("/");
    if (e.isDirectory()) return walk(full);
    if (!e.isFile()) { problems.push(`${VERIFICATION_DIR}/${rel} is not a regular file`); return []; }
    return [rel];
  });
  for (const rel of walk(dir)) {
    if (!rel.includes("/") && rel.endsWith(".jsonl")) { jsonl.push(rel); continue; }
    files.set(`${VERIFICATION_DIR}/${rel}`, fs.readFileSync(path.join(dir, rel), "utf8"));
  }
  for (const rel of jsonl) {
    const at = `${VERIFICATION_DIR}/${rel}`, content = fs.readFileSync(path.join(dir, rel), "utf8");
    if (content && !content.endsWith("\n")) { problems.push(`${at} does not end at a line end`); continue; }
    content.split("\n").slice(0, -1).forEach((line, i) => {
      let o; try { o = JSON.parse(line); } catch { o = null; }
      if (!o || typeof o !== "object" || Array.isArray(o) || Object.keys(o).join(",") !== "file,record" || !cleanRel(o.file) || wrappedLine(o.file, o.record) !== line + "\n")
        return void problems.push(`${at} line ${i + 1} is not a verification record as Coursewerk wraps it ({"file":"….json","record":{…}})`);
      const file = `${VERIFICATION_DIR}/${o.file}`, text = unwrappedText(o.record);
      if (files.has(file) && files.get(file) !== text) return void problems.push(`${file} is held twice, differently (${at} line ${i + 1})`);
      files.set(file, text);
    });
  }
  return { files, problems, parts: jsonl.length };
}

/**
 * The review records the decision log binds (`log`: its parsed records), checked as the gate checks them (ms8-verdicts):
 * { problems, summary: { records, parts, sharedParts, logged } }.
 */
export function checkReviewRecords(root, log) {
  const { files, problems: found, parts } = verificationFiles(path.resolve(root));
  const problems = [...found];
  const readText = (rel) => { if (!files.has(rel)) throw new Error(`${rel} is missing`); return files.get(rel); };
  const logged = log.filter((l) => l.type === "dispatch" && l.payload?.dispatch);
  const dispatchEntries = log.filter((l) => l.type === "dispatch");
  const readable = new Set(), named = new Set(); // dispatches whose record reads whole and is vouched for; files named above
  let records = 0, sharedParts = 0;
  for (const rel of [...files.keys()].sort()) {
    if (isDispatchPath(rel)) {
      records++;
      let record;
      try { record = expandDispatch(JSON.parse(files.get(rel)), readText); } catch (e) { problems.push(`${rel} cannot be read whole: ${e instanceof SyntaxError ? "it is not JSON" : e.message}`); named.add(rel); continue; }
      if (!dispatchLogEntry(record, dispatchEntries)) { problems.push(`${rel} is not the record the decision log binds: it was changed after it was logged, or never logged`); named.add(rel); continue; }
      if (typeof record.dispatch === "string") readable.add(record.dispatch);
    } else if (rel.slice(VERIFICATION_DIR.length + 1).includes("/")) {
      // a file in a folder under verification/ is a shared prompt part, the one its name says, or nothing the harness wrote
      if (PART_FILE.test(rel) && readPart(readText, rel.slice(PARTS_DIR.length + 1, -".json".length)) != null) sharedParts++;
      else problems.push(`${rel} is not a prompt part the review records share (parts/<sha256>.json, the part its name says)`);
    }
  }
  // a logged review whose record is gone (one present but unreadable or rewritten is named above)
  for (const l of logged) if (!readable.has(l.payload.dispatch) && !named.has(`${VERIFICATION_DIR}/${l.payload.dispatch}.json`))
    problems.push(`the decision log binds review ${l.payload.dispatch} (log record ${l.seq}), but its record ${VERIFICATION_DIR}/${l.payload.dispatch}.json ${files.has(`${VERIFICATION_DIR}/${l.payload.dispatch}.json`) ? "holds another record" : "is missing"}`);
  const unique = [...new Set(problems)];
  const shown = unique.length > MAX_RECORD_PROBLEMS ? [...unique.slice(0, MAX_RECORD_PROBLEMS), `… and ${unique.length - MAX_RECORD_PROBLEMS} more problems with the review records`] : unique;
  return { problems: shown, summary: { records, parts, sharedParts, logged: logged.length } };
}
