// A course pulled from Alembic, worked on, and handed back (owner 2026-11-02; req.records.site-import,
// req.records.site-handback). In an Alembic assistant job the course arrives as a plain folder with no git, in the
// site layout site_export.mjs produces: the decision log in parts (LOG.jsonl, LOG.2.jsonl, …) and the verification
// records wrapped into monthly .jsonl parts. Coursewerk itself reads one LOG.jsonl and one file per verification
// record, so the conversion happens only at this boundary — no reader of the log learns about parts:
//
//   importSite(root)    site layout → package layout, in place; writes the hidden host record (records/host.mjs)
//   handbackSite(root)  package layout → site layout, in place, APPEND-ONLY against what was imported
//
// Why append-only: Alembic, the history keeper, refuses any change to an existing .jsonl record that is not a pure
// append at its end (and refuses deleting one). So the hand-back writes every imported part back byte for byte and
// puts what is new only at the end of a last part, or into new parts. CHECKED.json is never regenerated here: it is
// built from a gate result by the publish step (site_export), not by a hand-back.
import fs from "node:fs";
import path from "node:path";
import { sha256 } from "../records/canonical.mjs";
import { verifyLog, verifyAgainstCommitted, parseLog } from "../records/log.mjs";
import { RECORDS } from "../records/paths.mjs";
import { HOST_FILE, readHostRecord, writeHostRecord } from "../records/host.mjs";
import { CONFIG_PATH, spineV2InForce, writeConfig } from "../records/config.mjs";
import { ROLL_BYTES, recordWhen, monthOf } from "./site_export.mjs";

const LOG_PART = /^LOG(?:\.(\d+))?\.jsonl$/;
const VER_PART = /^(.+?)(?:\.(\d+))?\.jsonl$/;
const VER_DIR = `${RECORDS}/verification`;
const posix = (p) => p.split(path.sep).join("/");

/** The record file as recordDispatch writes it (dispatch.mjs): the hashes that bind it are over its canonical form. */
export const unwrappedText = (record) => JSON.stringify(record, null, 2) + "\n";
/** One verification line as verificationLines (site_export.mjs) writes it. */
export const wrappedLine = (file, record) => JSON.stringify({ file, record }) + "\n";

function walkFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walkFiles(full, base);
    return e.isFile() ? [posix(path.relative(base, full))] : [];
  }).sort();
}
const cleanRel = (rel) => typeof rel === "string" && /\.json$/.test(rel) && !rel.includes("\\") && !path.posix.isAbsolute(rel) && rel.split("/").every((s) => s && s !== "." && s !== "..");

/** The decision log parts of a site-layout folder, in order: [{ name, n }]; throws on a gap. */
function logPartsIn(root) {
  const dir = path.join(root, RECORDS);
  if (!fs.existsSync(dir)) return [];
  const parts = fs.readdirSync(dir).map((name) => ({ name, m: LOG_PART.exec(name) })).filter((x) => x.m && fs.statSync(path.join(dir, x.name)).isFile())
    .map(({ name, m }) => ({ name, n: m[1] ? Number(m[1]) : 1 })).sort((a, b) => a.n - b.n);
  parts.forEach((p, i) => {
    if (p.n !== i + 1 || (p.n === 1 && p.name !== "LOG.jsonl")) throw new Error(`the decision log parts are not LOG.jsonl, LOG.2.jsonl, … without gaps (found ${parts.map((x) => x.name).join(", ")})`);
  });
  return parts;
}

/** The verification parts of a site-layout folder, grouped by month and in order. */
function verificationPartsIn(root) {
  const dir = path.join(root, VER_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(".jsonl") && fs.statSync(path.join(dir, name)).isFile())
    .map((name) => { const m = VER_PART.exec(name); return { name, key: m[1], n: m[2] ? Number(m[2]) : 1 }; })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.n - b.n));
}

/**
 * Site layout → package layout, in place. Everything is read and checked before anything is written; a folder already
 * imported, a log that does not verify, or a verification line Coursewerk did not write is refused with nothing changed.
 * Returns { log: { parts, bytes, records }, verification: { parts, files }, host, [config] } — config: the path of a
 * coursewerk.json written because it was missing while the log shows spine v2 in force.
 */
export function importSite(root, { at = new Date().toISOString() } = {}) {
  root = path.resolve(root);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`no such folder: ${root}`);
  const host = readHostRecord(root);
  if (host && host.state !== "handed-back")
    throw new Error(`this folder was already imported (${HOST_FILE}, ${host.importedAt || "date unknown"}): work in it, then run site_handback.mjs; to start over, pull the course again`);
  const priv = path.join(root, RECORDS);
  if (fs.existsSync(path.join(priv, "LOG.jsonl.lock"))) throw new Error("a writer holds the decision log (LOG.jsonl.lock): wait for it to finish");

  // the decision log: the parts joined in order are the log byte for byte (site_export logParts)
  const logParts = logPartsIn(root).map((p) => ({ path: `${RECORDS}/${p.name}`, buf: fs.readFileSync(path.join(priv, p.name)) }));
  const joined = Buffer.concat(logParts.map((p) => p.buf));
  const text = joined.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(joined)) throw new Error("the decision log parts are not UTF-8 text");
  const badEnd = logParts.find((p) => p.buf.length && p.buf[p.buf.length - 1] !== 0x0a);
  if (badEnd) throw new Error(`${badEnd.path} does not end at a line end: the parts were not cut as Coursewerk cuts them`);
  const failures = verifyLog(text);
  if (failures.length) throw new Error(`the joined decision log does not verify, so it cannot be imported: ${failures.slice(0, 3).join("; ")}${failures.length > 3 ? ` (and ${failures.length - 3} more)` : ""}`);

  // the verification records: each wrapped line back into the record file it came from
  const files = new Map(), vparts = [];
  for (const p of verificationPartsIn(root)) {
    const rel = `${VER_DIR}/${p.name}`, buf = fs.readFileSync(path.join(root, rel)), content = buf.toString("utf8"), names = [];
    if (content && !content.endsWith("\n")) throw new Error(`${rel} does not end at a line end`);
    content.split("\n").slice(0, -1).forEach((line, i) => {
      let o; try { o = JSON.parse(line); } catch { throw new Error(`${rel} line ${i + 1} is not JSON`); }
      if (!o || typeof o !== "object" || Array.isArray(o) || Object.keys(o).join(",") !== "file,record" || !cleanRel(o.file))
        throw new Error(`${rel} line ${i + 1} is not a wrapped verification record ({"file":"….json","record":{…}})`);
      if (wrappedLine(o.file, o.record) !== line + "\n") throw new Error(`${rel} line ${i + 1} is not written as Coursewerk writes it, so it could not be handed back unchanged`);
      if (files.has(o.file)) throw new Error(`${o.file} appears twice in the verification parts`);
      files.set(o.file, o.record); names.push(o.file);
    });
    vparts.push({ path: rel, bytes: buf.length, sha256: sha256(buf), files: names });
  }
  for (const [file, record] of files) {
    const dest = path.join(root, VER_DIR, file);
    if (fs.existsSync(dest) && fs.readFileSync(dest, "utf8") !== unwrappedText(record)) throw new Error(`${VER_DIR}/${file} already exists and differs from its line in the parts: reconcile by hand`);
  }

  // write: the record files, the joined log (in place of its first part), then remove the parts; the host record last
  for (const [file, record] of files) {
    const dest = path.join(root, VER_DIR, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, unwrappedText(record));
  }
  if (logParts.length) {
    const tmp = path.join(priv, `.LOG.jsonl.import-${process.pid}`);
    fs.writeFileSync(tmp, joined); fs.renameSync(tmp, path.join(priv, "LOG.jsonl"));
    for (const p of logParts.slice(1)) fs.rmSync(path.join(root, p.path));
  }
  for (const p of vparts) fs.rmSync(path.join(root, p.path));
  // private/coursewerk/coursewerk.json only mirrors the log (config.mjs boundConfig): a course whose log shows spine v2
  // in force but arrived without the file (GenChem's 2026-11 deliveries) gets it back exactly as writeConfig writes
  // it, so the commands do not refuse. An existing file is never overwritten.
  const configWritten = !fs.existsSync(path.join(root, CONFIG_PATH)) && spineV2InForce(text);
  if (configWritten) writeConfig(root, { schemaVersion: 1, spine: 2 });
  const record = {
    schemaVersion: 1, host: "alembic", state: "imported", importedAt: at,
    log: { sha256: sha256(joined), bytes: joined.length, parts: logParts.map((p) => ({ path: p.path, bytes: p.buf.length })) },
    verification: { parts: vparts },
  };
  writeHostRecord(root, record);
  return { log: { parts: logParts.length, bytes: joined.length, records: parseLog(text).length }, verification: { parts: vparts.length, files: files.size }, host: HOST_FILE, ...(configWritten ? { config: CONFIG_PATH } : {}) };
}

/** Where `lines` go when appended to parts that roll at ROLL_BYTES: the last part while it holds them, then new parts. */
function rollInto(last, lines, nameOf) {
  const out = []; let cur = last ? { ...last, add: [] } : null;
  for (const line of lines) {
    const len = Buffer.byteLength(line);
    if (!cur || (cur.bytes && cur.bytes + len > ROLL_BYTES)) { if (cur) out.push(cur); const n = cur ? cur.n + 1 : 1; cur = { n, path: nameOf(n), bytes: 0, add: [], isNew: true }; }
    cur.add.push(line); cur.bytes += len;
  }
  if (cur) out.push(cur);
  return out.filter((p) => p.add.length);
}

/**
 * Package layout → site layout, in place, append-only against the host record. Refuses (and writes nothing) when the
 * working log no longer extends the imported one byte for byte, or an imported verification record was changed or
 * removed. Returns { log: { appended, parts: [{ path, bytes, grew|new }] }, verification: { appended, parts: [...] } }.
 */
export function handbackSite(root, { at = new Date().toISOString() } = {}) {
  root = path.resolve(root);
  const host = readHostRecord(root);
  if (!host) throw new Error(`${HOST_FILE} is missing: this folder was not imported with site_import.mjs, so there is nothing to hand back against`);
  if (host.error) throw new Error(host.error);
  if (host.host !== "alembic") throw new Error(`${HOST_FILE} names host ${JSON.stringify(host.host)}, not alembic`);
  if (host.state !== "imported") throw new Error("this folder was already handed back: push it, then pull and import again");
  const priv = path.join(root, RECORDS);
  if (fs.existsSync(path.join(priv, "LOG.jsonl.lock"))) throw new Error("a writer holds the decision log (LOG.jsonl.lock): wait for it to finish");
  // the host record names only part files at their places (it is written here, but lives in the job's working copy)
  const badLog = host.log.parts.find((p, i) => p?.path !== `${RECORDS}/${i === 0 ? "LOG.jsonl" : `LOG.${i + 1}.jsonl`}` || !Number.isSafeInteger(p.bytes) || p.bytes < 0);
  const badVer = host.verification.parts.find((p) => typeof p?.path !== "string" || !p.path.startsWith(`${VER_DIR}/`) || p.path.slice(VER_DIR.length + 1).includes("/") || !VER_PART.test(p.path.slice(VER_DIR.length + 1)) || !Array.isArray(p.files) || !p.files.every(cleanRel));
  if (badLog || badVer) throw new Error(`${HOST_FILE} names a part that is not a record part (${(badLog || badVer)?.path}): it was edited; pull and import again`);

  // the log must extend the imported one byte for byte, and verify
  const logFile = path.join(priv, "LOG.jsonl");
  const working = fs.existsSync(logFile) ? fs.readFileSync(logFile) : Buffer.alloc(0);
  if (working.length < host.log.bytes || sha256(working.subarray(0, host.log.bytes)) !== host.log.sha256)
    throw new Error("the decision log no longer extends the one Alembic holds (its imported records were changed or removed): Alembic accepts only appended records, so nothing was handed back");
  const text = working.toString("utf8");
  const failures = verifyAgainstCommitted(working.subarray(0, host.log.bytes).toString("utf8"), text);
  if (failures.length) throw new Error(`the decision log does not verify, so nothing was handed back: ${failures[0]}`);
  const sumParts = host.log.parts.reduce((a, p) => a + p.bytes, 0);
  if (sumParts !== host.log.bytes) throw new Error(`${HOST_FILE}: the log parts do not add up to the imported log`);

  // verification: every imported record exactly as it was; the rest is new
  const vdir = path.join(root, VER_DIR);
  const present = new Set(walkFiles(vdir).filter((f) => f.endsWith(".json")));
  const imported = new Set(host.verification.parts.flatMap((p) => p.files));
  const contents = new Map();
  for (const p of host.verification.parts) {
    const missing = p.files.filter((f) => !present.has(f));
    if (missing.length) throw new Error(`verification records are append-only: ${missing.slice(0, 3).map((f) => `${VER_DIR}/${f}`).join(", ")}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""} imported from ${p.path} ${missing.length === 1 ? "was" : "were"} removed`);
    let content = "";
    for (const f of p.files) {
      let rec; try { rec = JSON.parse(fs.readFileSync(path.join(vdir, f), "utf8")); } catch { throw new Error(`verification records are append-only: ${VER_DIR}/${f} (imported) is no longer readable JSON`); }
      content += wrappedLine(f, rec);
    }
    if (Buffer.byteLength(content) !== p.bytes || sha256(content) !== p.sha256) {
      const changed = p.files.filter((f) => fs.readFileSync(path.join(vdir, f), "utf8") !== unwrappedText(JSON.parse(fs.readFileSync(path.join(vdir, f), "utf8"))));
      throw new Error(`verification records are append-only: a record imported from ${p.path} was changed${changed.length ? ` (${changed.slice(0, 3).map((f) => `${VER_DIR}/${f}`).join(", ")})` : ""}`);
    }
    contents.set(p.path, content);
  }
  const fresh = [...present].filter((f) => !imported.has(f)).map((rel) => {
    const full = path.join(vdir, rel);
    let rec; try { rec = JSON.parse(fs.readFileSync(full, "utf8")); } catch { throw new Error(`${VER_DIR}/${rel} is not readable JSON: fix or remove it before handing back`); }
    return { rel, rec, when: recordWhen(rec, full) };
  }).sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const byMonth = new Map();
  for (const r of fresh) { const m = monthOf(r.when); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m).push(r); }
  const lastOf = new Map();
  for (const p of host.verification.parts) {
    const m = VER_PART.exec(path.posix.basename(p.path)), key = m[1], n = m[2] ? Number(m[2]) : 1;
    if (!lastOf.has(key) || lastOf.get(key).n < n) lastOf.set(key, { n, path: p.path, bytes: p.bytes, files: p.files });
  }
  const vplan = [];
  for (const [month, recs] of byMonth) {
    const nameOf = (n) => `${VER_DIR}/${month}${n > 1 ? `.${n}` : ""}.jsonl`;
    const lines = recs.map((r) => wrappedLine(r.rel, r.rec));
    const fileOf = new Map(lines.map((l, i) => [l, recs[i].rel]));
    for (const part of rollInto(lastOf.get(month), lines, nameOf)) vplan.push({ ...part, files: part.add.map((l) => fileOf.get(l)) });
  }

  // the log: imported parts byte-identical, the tail on the last part, then new parts
  const tail = working.subarray(host.log.bytes).toString("utf8").split(/(?<=\n)/).filter(Boolean);
  const lastLog = host.log.parts.length ? { n: host.log.parts.length, path: host.log.parts.at(-1).path, bytes: host.log.parts.at(-1).bytes } : null;
  const lplan = rollInto(lastLog, tail, (n) => `${RECORDS}/${n === 1 ? "LOG.jsonl" : `LOG.${n}.jsonl`}`);

  // write: log parts (LOG.jsonl, the joined log, replaced last), verification parts, then remove the record files
  const logOut = new Map(); let off = 0;
  for (const p of host.log.parts) { logOut.set(p.path, working.subarray(off, off + p.bytes)); off += p.bytes; }
  for (const p of lplan) logOut.set(p.path, Buffer.concat([logOut.get(p.path) || Buffer.alloc(0), Buffer.from(p.add.join(""), "utf8")]));
  const atomic = (rel, data) => { const dest = path.join(root, rel), tmp = path.join(path.dirname(dest), `.${path.basename(dest)}.handback-${process.pid}`); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(tmp, data); fs.renameSync(tmp, dest); };
  const logPaths = [...logOut.keys()].sort((a, b) => (a.endsWith("/LOG.jsonl") ? 1 : b.endsWith("/LOG.jsonl") ? -1 : 0));
  for (const rel of logPaths) atomic(rel, logOut.get(rel));
  if (!logOut.size && fs.existsSync(logFile) && !working.length) fs.rmSync(logFile);
  const vOut = new Map(contents);
  for (const p of vplan) vOut.set(p.path, (vOut.get(p.path) || "") + p.add.join(""));
  for (const [rel, data] of vOut) atomic(rel, data);
  for (const f of present) fs.rmSync(path.join(vdir, f));
  const prune = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) { prune(path.join(d, e.name)); if (!fs.readdirSync(path.join(d, e.name)).length) fs.rmdirSync(path.join(d, e.name)); } };
  prune(vdir);

  // the host record: what the site now holds, so a fresh import (the push re-pulls) starts from it
  const vparts = new Map(host.verification.parts.map((p) => [p.path, { ...p }]));
  for (const p of vplan) {
    const prev = vparts.get(p.path), data = vOut.get(p.path);
    vparts.set(p.path, { path: p.path, bytes: Buffer.byteLength(data), sha256: sha256(data), files: [...(prev?.files || []), ...p.files] });
  }
  writeHostRecord(root, { ...host, state: "handed-back", handedBackAt: at,
    log: { sha256: sha256(working), bytes: working.length, parts: [...logOut].map(([p, b]) => ({ path: p, bytes: b.length })).sort((a, b) => partNo(a.path) - partNo(b.path)) },
    verification: { parts: [...vparts.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) } });
  const importedLog = new Set(host.log.parts.map((p) => p.path)), importedVer = new Set(host.verification.parts.map((p) => p.path));
  return {
    log: { appended: tail.length, parts: lplan.map((p) => ({ path: p.path, bytes: logOut.get(p.path).length, ...(importedLog.has(p.path) ? { grew: Buffer.byteLength(p.add.join("")) } : { new: true }) })) },
    verification: { appended: fresh.length, parts: vplan.map((p) => ({ path: p.path, bytes: Buffer.byteLength(vOut.get(p.path)), records: p.add.length, ...(importedVer.has(p.path) ? { grew: Buffer.byteLength(p.add.join("")) } : { new: true }) })) },
  };
}
const partNo = (rel) => Number(LOG_PART.exec(path.posix.basename(rel))?.[1] || 1);
