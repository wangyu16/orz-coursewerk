// The decision log — metadata/LOG.jsonl: append-only, hash-chained, every record naming its party (skeleton §5).
//
// What the chain proves, and what it does not. Each record carries the hash of its predecessor and its own hash, so
// an edited, deleted, reordered or inserted record breaks verification. A writer who rewrites the WHOLE chain
// consistently is not caught by the chain alone — that is what `verifyExtends` is for: the log in the working tree
// must extend the log at the last commit byte for byte (the gate compares against git; req.records.tamper).
//
// STRICT FORM (red-team round P1-1, 2026-09-30). The log is written only by this module, so its lines are held to
// one exact spelling: LF-terminated, no blank lines, no CR, each line exactly `JSON.stringify` of a record with the
// seven keys below in that order — which rules out duplicate keys, unhashed extra fields and look-alike encodings.
// `at` must be a real UTC ISO time; party fields must be strings; payload must be a plain object.
// Round P1-2 added: nested keys sorted (one spelling per hash), a nesting-depth limit, verifyLog never throws, the
// committed log must itself verify before anything can extend it, and appends are serialized by a lock file and
// rolled back if the result does not verify.
import fs from "node:fs";
import path from "node:path";
import { canonicalJson, sha256, HEX64 } from "./canonical.mjs";
import { RECORD_PATHS, recordFile } from "./paths.mjs";

export const GENESIS = "0".repeat(64);
export const LOG_TYPES = Object.freeze([
  "intake", "transition", "version", "approval", "glance-confirmation", "steering", "answer", "confirmation",
  "authorship-confirmation", "revision", "divergence", "dispatch", "unit-retirement", "publish", "module-change",
]);
export const PARTY_ROLES = Object.freeze(["instructor", "agent", "harness"]);

export function partyProblem(party) {
  if (!isPlainObject(party)) return "party must be a plain object";
  if (!Object.hasOwn(party, "role") || !PARTY_ROLES.includes(party.role)) return "party.role must be instructor, agent or harness";
  const visible = (x) => typeof x === "string" && /[\p{L}\p{N}]/u.test(x) && !/[\u0000-\u001f\u007f]/.test(x);
  if (!visible(party.name)) return "party.name must be a non-empty string with visible characters";
  if (party.role === "agent" && !visible(party.model)) return "an agent party must name its model";
  if (Object.hasOwn(party, "model") && !visible(party.model)) return "party.model must be a string with visible characters";
  if (Object.keys(party).some((k) => !["role", "name", "model"].includes(k))) return "party has fields other than role, name, model";
  return null;
}

const body = ({ seq, prev, type, party, at, payload }) => ({ seq, prev, type, party, at, payload });
const RECORD_KEYS = ["seq", "prev", "type", "party", "at", "payload", "hash"];
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
export const MAX_DEPTH = 32;
function depthExceeds(value, limit) {
  const stack = [[value, 1]];
  while (stack.length) {
    const [v, d] = stack.pop();
    if (v === null || typeof v !== "object") continue;
    if (d > limit) return true;
    for (const child of Array.isArray(v) ? v : Object.values(v)) stack.push([child, d + 1]);
  }
  return false;
}
const sortedDeep = (v) => JSON.parse(canonicalJson(v));
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
export function isoTimeProblem(at) {
  if (typeof at !== "string" || !ISO_UTC.test(at) || Number.isNaN(Date.parse(at))) return "at must be a UTC ISO time";
  const [d, t] = at.split("T"); const [y, m, day] = d.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, day));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== day) return "at is not a real date";
  const [hh, mm, ss] = t.replace("Z", "").split(":").map(Number);
  if (hh > 23 || mm > 59 || ss >= 60) return "at is not a real time";
  return null;
}
export const recordHash = (record) => sha256(canonicalJson(body(record)));

/** Parse JSONL text into records; a line that is not JSON is reported by verifyLog, not thrown here. */
export function parseLog(text) {
  return String(text || "").split("\n").filter((line) => line.trim()).map((line, i) => {
    try { return JSON.parse(line); } catch { return { __unparseable: true, line: i + 1 }; }
  });
}

function formProblems(text) {
  const t = String(text || "");
  if (!t) return [];
  const failures = [];
  if (t.includes("\r")) failures.push("the log contains CR characters");
  if (!t.endsWith("\n")) failures.push("the log does not end with a newline");
  const lines = t.split("\n"); lines.pop();
  lines.forEach((line, i) => {
    if (!line.trim()) { failures.push(`line ${i + 1}: blank line`); return; }
    let parsed; try { parsed = JSON.parse(line); } catch { return; }
    if (!isPlainObject(parsed)) { failures.push(`line ${i + 1}: not a record object`); return; }
    const keys = Object.keys(parsed);
    if (keys.length !== RECORD_KEYS.length || keys.some((k, j) => k !== RECORD_KEYS[j])) failures.push(`line ${i + 1}: record keys must be exactly ${RECORD_KEYS.join(", ")} in that order`);
    else if (depthExceeds(parsed, MAX_DEPTH)) failures.push(`line ${i + 1}: nested deeper than ${MAX_DEPTH}`);
    else if (JSON.stringify(parsed) !== line) failures.push(`line ${i + 1}: not in canonical form (duplicate keys or altered spelling)`);
    else if (JSON.stringify({ ...parsed, party: sortedDeep(parsed.party), payload: sortedDeep(parsed.payload) }) !== line) failures.push(`line ${i + 1}: nested keys are not in sorted order`);
  });
  return failures;
}

/** Verify one log's chain: sequence, links, hashes, types, parties. Returns a list of failures (empty = sound). */
export function verifyLog(text) {
  try { return verifyLogStrict(text); } catch (e) { return [`the log could not be verified: ${e.message}`]; }
}

function verifyLogStrict(text) {
  const failures = formProblems(text);
  let prev = GENESIS;
  parseLog(text).forEach((record, i) => {
    const expectedSeq = i + 1;
    if (!isPlainObject(record)) { failures.push(`record ${expectedSeq}: not a record object`); prev = null; return; }
    if (record.__unparseable) { failures.push(`line ${record.line}: not valid JSON`); prev = null; return; }
    if (record.seq !== expectedSeq) failures.push(`record ${expectedSeq}: sequence is ${record.seq} (a record was deleted, inserted or reordered)`);
    if (prev !== null && record.prev !== prev) failures.push(`record ${expectedSeq}: does not link to its predecessor`);
    if (!HEX64.test(record.hash || "") || record.hash !== recordHash(record)) failures.push(`record ${expectedSeq}: content does not match its hash (edited)`);
    if (!LOG_TYPES.includes(record.type)) failures.push(`record ${expectedSeq}: unknown type ${record.type}`);
    const p = partyProblem(record.party); if (p) failures.push(`record ${expectedSeq}: ${p}`);
    const tp = isoTimeProblem(record.at); if (tp) failures.push(`record ${expectedSeq}: ${tp}`);
    if (!isPlainObject(record.payload)) failures.push(`record ${expectedSeq}: payload must be a plain object`);
    prev = record.hash;
  });
  return failures;
}

/** The later log must extend the earlier one exactly: same records, in order, with only new records after them. */
export function verifyExtends(earlierText, laterText) {
  const earlier = String(earlierText || ""), later = String(laterText || "");
  // The committed log must itself be sound: a half-written committed line could otherwise be "completed" with
  // anything. (Callers must pass the real committed text; a missing or unreadable one is not "".)
  const own = verifyLog(earlier);
  if (own.length) return [`the committed log is itself broken: ${own[0]}`];
  if (later.startsWith(earlier)) return [];
  const e = earlier.split("\n").filter((l) => l.trim()), l = later.split("\n").filter((x) => x.trim());
  if (l.length < e.length) return [`the log lost ${e.length - l.length} record(s) since the last commit`];
  const i = e.findIndex((line, j) => line !== l[j]);
  return [i >= 0 ? `record ${i + 1} differs from the committed log (history rewritten)` : "the committed log is not a byte-exact prefix of the current log"];
}

/** Build the next record for a log text (pure); `appendLogRecord` writes it. */
export function nextRecord(text, { type, party, payload = {}, at = new Date().toISOString() }) {
  const failures = verifyLog(text);
  if (failures.length) throw new Error(`refusing to append to a broken log: ${failures[0]}`);
  if (!LOG_TYPES.includes(type)) throw new Error(`unknown log record type: ${type}`);
  const p = partyProblem(party); if (p) throw new Error(`refusing log record: ${p}`);
  const tp = isoTimeProblem(at); if (tp) throw new Error(`refusing log record: ${tp}`);
  if (!isPlainObject(payload)) throw new Error("refusing log record: payload must be a plain object");
  // Hash exactly what will be written: normalize through JSON first (Dates, undefined, toJSON), and refuse what
  // JSON cannot carry (BigInt).
  let normalized;
  try { normalized = JSON.parse(JSON.stringify({ party, payload })); } catch (e) { throw new Error(`refusing log record: payload is not JSON-serializable (${e.message})`); }
  if (depthExceeds(normalized, MAX_DEPTH)) throw new Error(`refusing log record: nested deeper than ${MAX_DEPTH}`);
  normalized = sortedDeep(normalized);
  const records = parseLog(text);
  const record = { seq: records.length + 1, prev: records.length ? records[records.length - 1].hash : GENESIS, type, party: normalized.party, at, payload: normalized.payload };
  record.hash = recordHash(record);
  const self = verifyLog(String(text || "") + JSON.stringify(record) + "\n");
  if (self.length) throw new Error(`refusing log record: it would not verify (${self[0]})`);
  return record;
}

const LOCK_WAIT_MS = 15000;
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

// The lock records its owner. A writer removes only its own lock; a lock whose owning process is gone (on this
// host) is stale and is cleared; a live lock held too long gives an error naming its owner and age.
function withLock(file, fn, waitMs = LOCK_WAIT_MS) {
  const lock = `${file}.lock`;
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + waitMs;
  for (;;) {
    try { fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, token, at: new Date().toISOString() }), { flag: "wx" }); break; } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let owner = null; try { owner = JSON.parse(fs.readFileSync(lock, "utf8")); } catch { /* unreadable or a directory */ }
      if (owner && Number.isInteger(owner.pid) && !pidAlive(owner.pid)) { fs.rmSync(lock, { force: true }); continue; }
      if (Date.now() > deadline) {
        const who = owner ? `process ${owner.pid}, locked since ${owner.at}` : "an unreadable lock";
        throw new Error(`the decision log is locked by another writer (${who}: ${lock}); wait for it to finish`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  try { return fn(); } finally {
    try { if (JSON.parse(fs.readFileSync(lock, "utf8")).token === token) fs.rmSync(lock, { force: true }); } catch { /* already gone */ }
  }
}

/** Append one record. Serialized by an owned lock file; any failure (verification, disk full, size limit) truncates
 * the file back to its exact previous length. A symlinked log is refused. */
export function appendLogRecord(root, entry, { lockWaitMs } = {}) {
  const file = recordFile(root, RECORD_PATHS.log);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return withLock(file, () => {
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error("refusing to append: the decision log is a symbolic link");
    const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    const record = nextRecord(text, entry);
    const originalLength = Buffer.byteLength(text);
    try {
      fs.appendFileSync(file, JSON.stringify(record) + "\n");
      const after = verifyLog(fs.readFileSync(file, "utf8"));
      if (after.length) throw new Error(`log failed verification after append: ${after[0]}`);
    } catch (e) {
      fs.truncateSync(file, originalLength);
      throw new Error(`append failed and the log was restored to its previous state: ${e.message}`);
    }
    return record;
  }, lockWaitMs);
}

/** The single acceptance rule the gate applies: the working log verifies and extends the committed one exactly. */
export function verifyAgainstCommitted(committedText, workingText) {
  return [...verifyLog(workingText), ...verifyExtends(committedText, workingText)];
}

export function readLogText(root) {
  const file = recordFile(root, RECORD_PATHS.log);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}
