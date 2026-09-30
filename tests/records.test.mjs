// SHARED RECORDS (redesign P1) — the in-package records every part of the skeleton reads and writes.
// Each test names the requirement(s) it closes in system/REQUIREMENTS.json.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RECORD_PATHS, recordFile, unitsPathFor } from "../scripts/lib/records/paths.mjs";
import { STEERING_FIELDS, readSteering, steeringFor, validateSteering, writeSteering } from "../scripts/lib/records/steering.mjs";
import { ORIGIN_KINDS, validateUnit, validateUnitSidecar } from "../scripts/lib/records/units.mjs";
import { blocksPublish, findingId, makeFinding, validateFinding } from "../scripts/lib/records/findings.mjs";
import { LOG_TYPES, appendLogRecord, nextRecord, parseLog, readLogText, recordHash, verifyExtends, verifyLog } from "../scripts/lib/records/log.mjs";
import { validateRegistry } from "../scripts/lib/records/registry.mjs";

function pkg(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-records-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
const H = "a".repeat(64);
const agent = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const instructor = { role: "instructor", name: "Yu Wang" };
const steering = () => ({ schemaVersion: 1, recordedAt: "2026-09-30T12:00:00Z",
  answers: { level: "first-year undergraduate", depth: "conceptual with quantitative examples", emphasis: "equilibrium reasoning", notation: "IUPAC", exampleStyle: "everyday then lab", exclusions: ["Kp derivations"], tone: "plain, encouraging" },
  overrides: { "le-chatelier": { depth: "qualitative" } }, changes: [] });
const unit = (over = {}) => ({ id: "u-ch1-intro-1", locator: { deliverable: "study-guide/ch1.md", section: "intro", ordinal: 0, contentHash: H },
  form: "paragraph", role: "teaching", origin: { kind: "agent-knowledge", model: "claude-opus-5-5", step: "author", date: "2026-09-30" },
  spineNodes: ["objective.ch1.define-equilibrium"], judgment: ["knowledge-based"], evidence: [], ...over });

test("[req.records.in-package] every record path resolves inside the package and escapes are refused", (t) => {
  const root = pkg(t);
  for (const rel of Object.values(RECORD_PATHS)) assert.ok(recordFile(root, rel).startsWith(root + path.sep), rel);
  assert.ok(recordFile(root, unitsPathFor("study-guide/ch1.md")).startsWith(root + path.sep));
  assert.throws(() => recordFile(root, "../outside.json"), /escapes the package/);
  assert.throws(() => unitsPathFor("../../x.md"), /not a clean package-relative/);
  assert.throws(() => unitsPathFor("/abs/x.md"), /not a clean package-relative/);
});

test("[req.records.steering-schema] steering holds the seven M2 answers, overrides and history; malformed steering is refused", (t) => {
  assert.deepEqual(STEERING_FIELDS, ["level", "depth", "emphasis", "notation", "exampleStyle", "exclusions", "tone"]);
  assert.deepEqual(validateSteering(steering()), []);
  const root = pkg(t);
  writeSteering(root, steering());
  assert.equal(readSteering(root).answers.tone, "plain, encouraging");
  assert.equal(steeringFor(steering(), "le-chatelier").depth, "qualitative");
  assert.equal(steeringFor(steering(), "chemical-equilibrium").depth, "conceptual with quantitative examples");
  const bad = steering(); delete bad.answers.tone; bad.answers.voice = "x"; bad.overrides.x = { colour: "red" };
  const failures = validateSteering(bad).join("\n");
  assert.match(failures, /missing tone/); assert.match(failures, /unknown steering field: voice/); assert.match(failures, /unknown field colour/);
  assert.throws(() => writeSteering(root, bad), /refusing invalid steering/);
});

test("[req.records.unit-schema] a unit record carries its locator, form, role, origin, spine nodes and judgment kinds", () => {
  assert.deepEqual(validateUnit(unit()), []);
  for (const kind of Object.keys(ORIGIN_KINDS)) {
    const origin = { kind, source: "src.wiki", span: "p3", model: "m", step: "s", date: "d", code: "c", hash: "h", instructor: "Yu Wang", ref: "r" };
    assert.deepEqual(validateUnit(unit({ origin })), [], kind);
  }
  const failures = validateUnit(unit({ id: "U 1", form: "poem", role: "decor", origin: { kind: "source-derived", source: "s" }, judgment: [] })).join("\n");
  assert.match(failures, /unit id/); assert.match(failures, /unknown form/); assert.match(failures, /role must be/);
  assert.match(failures, /requires span/); assert.match(failures, /judgment must be/);
  assert.match(validateUnit(unit({ role: "framing", judgment: ["semi-mechanical"] })).join(), /framing unit may not carry/);
  const sidecar = { schemaVersion: 1, deliverable: "study-guide/ch1.md", units: [unit(), unit()] };
  assert.match(validateUnitSidecar(sidecar).join(), /duplicate unit id/);
});

test("[req.records.finding-schema] findings have three classes; defects need re-runnable evidence; only defects and obligations block", () => {
  const base = { module: "ms7-consistency", kind: "value-disagreement", units: ["u-a", "u-b"], route: "agent", basis: "snapshot-1" };
  const defect = makeFinding({ ...base, statusClass: "defect", evidence: { type: "contradiction", values: ["55.3 kJ", "57.2 kJ"] } });
  const obligation = makeFinding({ ...base, kind: "evidence-missing", units: ["u-c"], statusClass: "obligation", evidence: { type: "missing", what: "a source for the stated constant" } });
  const question = makeFinding({ ...base, kind: "verifier-disagreement", statusClass: "question", route: "digest", evidence: { type: "judgment", note: "two verifiers disagree" } });
  assert.equal(blocksPublish(defect), true); assert.equal(blocksPublish(obligation), true); assert.equal(blocksPublish(question), false);
  assert.match(validateFinding({ ...base, statusClass: "defect", status: "open", evidence: { type: "judgment" } }).join(), /defect needs re-runnable evidence/);
  assert.match(validateFinding({ ...base, statusClass: "obligation", status: "open", evidence: { type: "missing" } }).join(), /must say what is missing/);
  assert.match(validateFinding({ ...base, statusClass: "issue", route: "nowhere", status: "open", evidence: { type: "rule" } }).join(), /statusClass must be/);
});

test("[req.records.finding-id] the same finding on unchanged content keeps its id; a changed basis of evidence gives a new one", () => {
  const f = { module: "ms6-quotations", kind: "quotation-unfound", units: ["u-2", "u-1"], evidence: { type: "missing", what: "source for the quotation" } };
  assert.equal(findingId(f), findingId({ ...f, units: ["u-1", "u-2"] }), "unit order does not matter");
  assert.notEqual(findingId(f), findingId({ ...f, evidence: { ...f.evidence, what: "a different quotation" } }));
  const made = makeFinding({ ...f, statusClass: "obligation", route: "agent", basis: "b" });
  assert.match(validateFinding({ ...made, kind: "renamed" }).join(), /id does not match its content/);
});

test("[req.records.log-append] [req.records.log-types] the log appends records in sequence and refuses unknown types", (t) => {
  const root = pkg(t);
  appendLogRecord(root, { type: "intake", party: instructor, payload: { profile: "public" }, at: "2026-09-30T12:00:00Z" });
  const committed = readLogText(root);
  appendLogRecord(root, { type: "steering", party: agent, payload: { accepted: "defaults" }, at: "2026-09-30T12:05:00Z" });
  const records = parseLog(readLogText(root));
  assert.deepEqual(records.map((r) => r.seq), [1, 2]);
  assert.deepEqual(verifyExtends(committed, readLogText(root)), []);
  assert.throws(() => appendLogRecord(root, { type: "whim", party: agent }), /unknown log record type/);
  for (const type of ["intake", "transition", "version", "approval", "glance-confirmation", "steering", "answer", "confirmation", "authorship-confirmation", "revision", "divergence", "dispatch", "unit-retirement", "publish", "module-change"])
    assert.ok(LOG_TYPES.includes(type), type);
});

test("[req.records.log-party] every record names its party; an agent must name its model", (t) => {
  const root = pkg(t);
  assert.throws(() => appendLogRecord(root, { type: "answer", party: { role: "agent", name: "executor" } }), /must name its model/);
  assert.throws(() => appendLogRecord(root, { type: "answer", party: { role: "student", name: "x" } }), /party.role/);
  assert.throws(() => appendLogRecord(root, { type: "answer", party: { role: "instructor" } }), /party.name/);
  const r = appendLogRecord(root, { type: "answer", party: instructor, payload: { finding: "f-1", answer: "accept" } });
  assert.equal(r.party.name, "Yu Wang");
});

function threeRecordLog() {
  let text = "";
  for (const [type, party] of [["intake", instructor], ["approval", instructor], ["revision", agent]]) text += JSON.stringify(nextRecord(text, { type, party, at: "2026-09-30T12:00:00Z", payload: { type } })) + "\n";
  return text;
}
const lines = (text) => text.trim().split("\n");

test("[req.records.log-chain] each record links to its predecessor's hash and the chain verifies", () => {
  const text = threeRecordLog();
  assert.deepEqual(verifyLog(text), []);
  const [a, b] = parseLog(text);
  assert.equal(b.prev, a.hash); assert.equal(a.hash, recordHash(a));
  assert.throws(() => nextRecord(text.replace('"approval"}', '"approved"}'), { type: "answer", party: agent }), /broken log/);
});

test("[req.records.tamper] edited, deleted, reordered, forged and rewritten logs are all detected", () => {
  const text = threeRecordLog();
  const L = lines(text);
  // edited: change a payload without fixing the hash
  const edited = L.map((l, i) => (i === 1 ? l.replace('"type":"approval"}', '"type":"approval","extra":1}') : l)).join("\n");
  assert.match(verifyLog(edited).join(), /content does not match its hash/);
  // deleted
  assert.match(verifyLog([L[0], L[2]].join("\n")).join(), /sequence|does not link/);
  // reordered
  assert.match(verifyLog([L[0], L[2], L[1]].join("\n")).join(), /sequence|does not link/);
  // forged record inserted mid-chain with a self-consistent hash
  const forged = { ...parseLog(text)[1], seq: 2, payload: { forged: true } }; forged.hash = recordHash(forged);
  assert.match(verifyLog([L[0], JSON.stringify(forged), L[1], L[2]].join("\n")).join(), /sequence|does not link/);
  // a whole chain rewritten consistently passes verifyLog but not verifyExtends against the committed log
  let rewritten = "";
  for (const r of parseLog(text)) rewritten += JSON.stringify(nextRecord(rewritten, { type: r.type, party: r.party, at: r.at, payload: { ...r.payload, rewritten: true } })) + "\n";
  assert.deepEqual(verifyLog(rewritten), []);
  assert.match(verifyExtends(text, rewritten).join(), /history rewritten/);
  // truncated tail
  assert.match(verifyExtends(text, [L[0], L[1]].join("\n")).join(), /lost 1 record/);
  // garbage line
  assert.match(verifyLog(text + "not json\n").join(), /not valid JSON/);
});

test("[req.records.registry-schema] the module registry lists modules with version and maturity", () => {
  assert.deepEqual(validateRegistry({ schemaVersion: 1, modules: [{ name: "ms1-sources", version: "1.0.0", maturity: "stable", enabled: true }, { name: "f4-knowledge", version: "0.1.0", maturity: "trial", enabled: true }] }), []);
  const failures = validateRegistry({ schemaVersion: 1, modules: [{ name: "MS 1", version: "1", maturity: "beta" }, { name: "x", version: "1.0.0", maturity: "stable", enabled: true }, { name: "x", version: "1.0.0", maturity: "stable", enabled: true }] }).join("\n");
  assert.match(failures, /lowercase slug/); assert.match(failures, /semver/); assert.match(failures, /maturity must be/); assert.match(failures, /enabled must be/); assert.match(failures, /duplicate module x/);
});

// Red-team round P1-1 (2026-09-30, system/rounds/P1-records-round-1.md): each finding is now a probe.
test("[req.records.tamper] [req.records.log-chain] round P1-1 probes: malformed, non-canonical and crashing inputs are refused", (t) => {
  const P = { role: "instructor", name: "Li" }, at = "2026-09-30T00:00:00Z";
  const r1 = nextRecord("", { type: "intake", party: P, at }), C = JSON.stringify(r1) + "\n";
  // 1. malformed fields and unhashed extras
  const m = { seq: 2, prev: r1.hash, type: "intake", party: { role: "instructor", name: ["x"] }, at: ["2026-99-99Tjunk"], payload: "s" };
  m.hash = recordHash(m); m.note = "unhashed";
  const f1 = verifyLog(C + JSON.stringify(m) + "\n").join("\n");
  assert.match(f1, /record keys must be exactly/); assert.match(f1, /party.name must be a non-empty string/);
  assert.match(f1, /at must be a UTC ISO time/); assert.match(f1, /payload must be a plain object/);
  assert.match(verifyLog(C.replace("}\n", "") + ',"type":"approval"}\n').join(), /not in canonical form|record keys/);
  assert.throws(() => nextRecord("", { type: "intake", party: P, at: "2026-02-30T00:00:00Z" }), /not a real date/);
  // 2. a literal null line reports instead of throwing
  assert.match(verifyLog(C + "null\n").join(), /not a record object/);
  // 3. no trailing newline: append refused, the file is not corrupted
  const root = pkg(t);
  fs.mkdirSync(path.join(root, "metadata"), { recursive: true });
  fs.writeFileSync(path.join(root, "metadata", "LOG.jsonl"), C.trimEnd());
  assert.throws(() => appendLogRecord(root, { type: "intake", party: P, at }), /does not end with a newline/);
  assert.equal(readLogText(root), C.trimEnd());
  // 4. payloads that JSON rewrites are normalized before hashing; BigInt is refused clearly
  const d = nextRecord(C, { type: "intake", party: P, at, payload: { when: new Date(at), list: [1, undefined] } });
  assert.deepEqual(verifyLog(C + JSON.stringify(d) + "\n"), []);
  assert.equal(d.payload.when, new Date(at).toISOString());
  assert.throws(() => nextRecord(C, { type: "intake", party: P, at, payload: { n: 1n } }), /not JSON-serializable/);
  class Getter { get role() { return "instructor"; } get name() { return "Li"; } }
  assert.throws(() => nextRecord(C, { type: "intake", party: new Getter(), at }), /party must be a plain object/);
  // 5. blank lines or CR between committed records break the byte-exact prefix
  const r2 = JSON.stringify(nextRecord(C, { type: "intake", party: P, at })) + "\n";
  assert.match(verifyExtends(C, C + "\n   \n" + r2).join() + verifyLog(C + "\n   \n" + r2).join(), /blank line|prefix/);
  assert.match(verifyLog(C.replace("\n", "\r\n")).join(), /CR characters/);
  assert.deepEqual(verifyExtends(C, C + r2), []);
});

// Red-team round P1-2 (2026-09-30): each finding is now a probe.
test("[req.records.tamper] [req.records.log-append] round P1-2 probes: concurrency, depth, partial committed line, party fields, nested key order", async (t) => {
  const P = { role: "instructor", name: "Li" }, at = "2026-09-30T00:00:00Z";
  // 1. six concurrent writer processes, 20 appends each: every append lands, the log verifies
  const root = pkg(t);
  const logUrl = new URL("../scripts/lib/records/log.mjs", import.meta.url).href;
  const writer = `import { appendLogRecord } from ${JSON.stringify(logUrl)};
    for (let i = 0; i < 20; i++) appendLogRecord(process.argv[1], { type: "intake", party: { role: "harness", name: "p" + process.pid } });`;
  const { spawn } = await import("node:child_process");
  const runs = Array.from({ length: 6 }, () => new Promise((resolve) => {
    const c = spawn(process.execPath, ["--input-type=module", "-e", writer, root], { stdio: ["ignore", "ignore", "pipe"] });
    let err = ""; c.stderr.on("data", (d) => (err += d)); c.on("close", (code) => resolve({ code, err }));
  }));
  const results = await Promise.all(runs);
  assert.deepEqual(results.filter((r) => r.code !== 0), [], "no writer failed");
  assert.deepEqual(verifyLog(readLogText(root)), []);
  assert.equal(parseLog(readLogText(root)).length, 120);
  // 2. deep nesting: verifyLog reports instead of throwing; nextRecord refuses clearly
  const r1 = nextRecord("", { type: "intake", party: P, at }), C = JSON.stringify(r1) + "\n";
  const deep = C.slice(0, -1).replace('"payload":{}', '"payload":{"x":' + "[".repeat(5000) + "]".repeat(5000) + "}") + "\n";
  assert.doesNotThrow(() => verifyLog(deep));
  assert.ok(verifyLog(deep).length > 0);
  let nest = {}; for (let i = 0; i < 40; i++) nest = { n: nest };
  assert.throws(() => nextRecord(C, { type: "intake", party: P, at, payload: nest }), /nested deeper than/);
  // 3. a committed log with a half-written last line cannot be "completed"
  const r2 = JSON.stringify(nextRecord(C, { type: "intake", party: P, at })) + "\n";
  const forged = JSON.stringify(nextRecord(C, { type: "approval", party: P, at, payload: { forged: true } })) + "\n";
  assert.match(verifyExtends(C + r2.slice(0, 40), C + forged).join(), /committed log is itself broken/);
  // 4. party fields must be strings with visible characters
  assert.throws(() => nextRecord(C, { type: "intake", party: { role: "instructor", name: "i", model: 5 }, at }), /party.model must be a string/);
  assert.throws(() => nextRecord(C, { type: "intake", party: { role: "instructor", name: "​\u0000" }, at }), /visible characters/);
  // 5. nested keys have one spelling: the writer sorts them, and an unsorted line is refused
  const rec = nextRecord(C, { type: "intake", party: P, at, payload: { b: 2, a: 1 } });
  assert.deepEqual(Object.keys(rec.payload), ["a", "b"]);
  const unsorted = JSON.stringify({ ...rec, payload: { b: 2, a: 1 } }) + "\n";
  assert.match(verifyLog(C + unsorted).join(), /nested keys are not in sorted order/);
});

// Red-team round P1-3 (2026-09-30): each finding is now a probe.
test("[req.records.log-append] [req.records.tamper] round P1-3 probes: failed writes roll back, locks are owned, symlinks refused", async (t) => {
  const { spawnSync, spawn } = await import("node:child_process");
  const { verifyAgainstCommitted } = await import("../scripts/lib/records/log.mjs");
  const P = { role: "harness", name: "h" };
  const root = pkg(t);
  for (let i = 0; i < 3; i++) appendLogRecord(root, { type: "intake", party: P });
  const before = readLogText(root);
  const logUrl = new URL("../scripts/lib/records/log.mjs", import.meta.url).href;
  // 1. a write that fails half-way (file-size limit) leaves the file byte-identical
  if (process.platform === "linux") {
    const script = `import { appendLogRecord } from ${JSON.stringify(logUrl)};
      try { appendLogRecord(${JSON.stringify(root)}, { type: "intake", party: { role: "harness", name: "big" }, payload: { blob: "x".repeat(8192) } }); } catch (e) { console.log(e.message); }`;
    const probe = path.join(pkg(t), "big.mjs"); fs.writeFileSync(probe, script);
    const run = spawnSync("bash", ["-c", 'ulimit -f 2; exec "$0" "$1"', process.execPath, probe], { encoding: "utf8" });
    assert.match(run.stdout + run.stderr, /restored to its previous state|EFBIG|File size limit/);
    assert.equal(readLogText(root), before);
    assert.deepEqual(verifyLog(readLogText(root)), []);
  }
  // 2. a stale lock (owner process gone) is cleared; a live foreign lock times out with its owner named
  const lock = path.join(root, "metadata", "LOG.jsonl.lock");
  const dead = spawnSync(process.execPath, ["-e", "0"]).pid;
  fs.writeFileSync(lock, JSON.stringify({ pid: dead, token: "old", at: "2026-09-30T00:00:00Z" }));
  appendLogRecord(root, { type: "intake", party: P });
  assert.equal(fs.existsSync(lock), false);
  const sleeper = spawn(process.execPath, ["-e", "setTimeout(()=>{},5000)"]);
  t.after(() => sleeper.kill());
  fs.writeFileSync(lock, JSON.stringify({ pid: sleeper.pid, token: "theirs", at: "2026-09-30T00:00:00Z" }));
  assert.throws(() => appendLogRecord(root, { type: "intake", party: P }, { lockWaitMs: 200 }), new RegExp(`process ${sleeper.pid}`));
  assert.equal(JSON.parse(fs.readFileSync(lock, "utf8")).token, "theirs", "someone else's lock is never removed");
  fs.rmSync(lock);
  // 3. a symlinked log is refused
  const other = pkg(t);
  fs.mkdirSync(path.join(other, "metadata"), { recursive: true });
  const outside = path.join(pkg(t), "elsewhere.jsonl"); fs.writeFileSync(outside, "");
  fs.symlinkSync(outside, path.join(other, "metadata", "LOG.jsonl"));
  assert.throws(() => appendLogRecord(other, { type: "intake", party: P }), /symbolic link/);
  // 4. the single acceptance rule checks both the working log and the committed prefix
  const committed = readLogText(root);
  assert.deepEqual(verifyAgainstCommitted(committed, committed), []);
  assert.ok(verifyAgainstCommitted(committed, committed + "junk\n").length > 0);
});
