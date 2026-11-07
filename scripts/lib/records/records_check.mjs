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
import fs from "node:fs";
import path from "node:path";
import { sha256 } from "./canonical.mjs";
import { parseLog, verifyExtends, verifyLog } from "./log.mjs";
import { RECORDS } from "./paths.mjs";

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
export function checkRecords(root, { extends: earlier } = {}) {
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
  return {
    ok: problems.length === 0,
    problems: [...new Set(problems)],
    log: { parts, bytes: Buffer.byteLength(text), sha256: sha256(text), records: records ? records.length : null, head: records?.at(-1)?.hash ?? null },
    ...(earlier !== undefined ? { extends: { bytes: Buffer.byteLength(String(earlier)), sha256: sha256(String(earlier)), records: String(earlier).split("\n").filter((l) => l.trim()).length } } : {}),
  };
}
