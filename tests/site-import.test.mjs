// Records under Alembic, step B (owner 2026-11-02): a course pulled from Alembic in site layout (no git) is imported
// into Coursewerk's package layout, worked on, and handed back append-only; the gate anchors the decision log to the one
// Alembic holds. Most cases use a site built by Coursewerk's own export from the real C2 fixture; one case runs the
// whole round trip on the real General Chemistry delivery (site layout, three log parts, eight verification parts).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { exportSite } from "../scripts/lib/core/site_export.mjs";
import { importSite, handbackSite, unwrappedText } from "../scripts/lib/core/site_host.mjs";
import { HOST_FILE, readHostRecord } from "../scripts/lib/records/host.mjs";
import { GENESIS, appendLogRecord, parseLog, recordHash, readLogText, verifyLog } from "../scripts/lib/records/log.mjs";
import { boundRecord, recordDispatch, recordHashOf } from "../scripts/lib/verify/dispatch.mjs";
import { evaluateGate, logFindings } from "../scripts/lib/skeleton/gate.mjs";
import { createSnapshot } from "../scripts/lib/skeleton/snapshot.mjs";
import { boundConfig } from "../scripts/lib/records/config.mjs";
import { canonicalJson, sha256 } from "../scripts/lib/records/canonical.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const C2 = path.join(ROOT, "tests/fixtures/c2-chemistry-v2/package");
const GENCHEM = path.resolve(ROOT, "../temp/genchem-update-2026-11-02/package");
const REC = "private/coursewerk", VER = `${REC}/verification`;
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const harness = { role: "harness", name: "test" };

/** Every record file of a site-layout folder (log and verification parts) → its bytes. */
function recordFiles(root) {
  const out = new Map();
  for (const rel of [REC, VER]) {
    const dir = path.join(root, rel);
    if (fs.existsSync(dir)) for (const n of fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl"))) out.set(`${rel}/${n}`, fs.readFileSync(path.join(dir, n)));
  }
  return out;
}
function tmp(t, prefix) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
/** A site-layout folder made by Coursewerk's own export from the C2 package: the package without its log and record
 *  files, plus the exported records. `bigLog` pads the log past one 3.5 MB part first. */
function site(t, { bigLog = false } = {}) {
  const dir = tmp(t, "cw-site-import-");
  const pkg = path.join(dir, "pkg"), out = path.join(dir, "site");
  fs.cpSync(C2, pkg, { recursive: true });
  if (bigLog) for (let i = 0; i < 5; i++) appendLogRecord(pkg, { type: "checkpoint", party: harness, payload: { pad: "x".repeat(900_000), i } });
  fs.cpSync(pkg, out, { recursive: true });
  fs.rmSync(path.join(out, REC, "LOG.jsonl")); fs.rmSync(path.join(out, VER), { recursive: true });
  const r = exportSite(pkg, out);
  assert.deepEqual(r.problems, []);
  return { pkg, out };
}
/** A verification record in a given month, logged as recordDispatch logs one (so the log vouches for it). */
function dispatchAt(root, at, unit = "u-probe") {
  const prompt = `probe ${at} ${Math.random()}`;
  const bundle = { nonce: "n", bundleHash: sha256(prompt), prompt };
  const rec = recordDispatch(root, { kind: "knowledge", unit, factHash: "0".repeat(64), contentHash: "0".repeat(64), bundle, answer: { mode: "replay", raw: "[]", model: "replay" } });
  if (!at) return rec;
  // move it to the month asked for, re-logged with the record's new hash (a record made then)
  const file = path.join(root, VER, `${rec.dispatch}.json`);
  const moved = { ...rec, at };
  fs.writeFileSync(file, unwrappedText(moved));
  appendLogRecord(root, { type: "dispatch", party: { role: "harness", name: "verify" }, payload: { dispatch: rec.dispatch, kind: rec.kind, unit, bundleHash: bundle.bundleHash, responseHash: rec.answer.responseHash, recordHash: recordHashOf(moved), mode: "replay", status: null } });
  return moved;
}

test("[req.records.site-import] import joins the log parts, unwraps the verification parts and writes the host record", (t) => {
  const { pkg, out } = site(t, { bigLog: true });
  const before = recordFiles(out);
  assert.ok(before.has(`${REC}/LOG.2.jsonl`), "the export cut the log into parts");
  const vparts = [...before.keys()].filter((k) => k.startsWith(VER));
  const r = importSite(out, { at: "2026-11-02T00:00:00.000Z" });
  // one log, byte for byte the package's, verified; the parts are gone
  const log = fs.readFileSync(path.join(out, REC, "LOG.jsonl"));
  assert.ok(log.equals(fs.readFileSync(path.join(pkg, REC, "LOG.jsonl"))));
  assert.deepEqual(verifyLog(log.toString("utf8")), []);
  assert.deepEqual(fs.readdirSync(path.join(out, REC)).filter((n) => /^LOG\..*jsonl$/.test(n) && n !== "LOG.jsonl"), []);
  // each verification record back as recordDispatch wrote it, still bound by the log
  const files = fs.readdirSync(path.join(pkg, VER)).filter((f) => f.endsWith(".json")).sort();
  assert.deepEqual(fs.readdirSync(path.join(out, VER)).sort(), files, "only the record files, no parts");
  const records = parseLog(log.toString("utf8"));
  let bound = 0;
  for (const f of files) {
    const text = fs.readFileSync(path.join(out, VER, f), "utf8");
    assert.equal(text, unwrappedText(JSON.parse(fs.readFileSync(path.join(pkg, VER, f), "utf8"))));
    if (boundRecord(JSON.parse(text), records)) bound++;
  }
  const boundBefore = files.filter((f) => boundRecord(JSON.parse(fs.readFileSync(path.join(pkg, VER, f), "utf8")), records)).length;
  assert.equal(bound, boundBefore, "every record the log vouched for before is vouched for after");
  // the host record: hidden, at the root, naming what Alembic holds
  const host = readHostRecord(out);
  assert.equal(host.host, "alembic"); assert.equal(host.state, "imported");
  assert.equal(host.log.sha256, sha(log)); assert.equal(host.log.bytes, log.length);
  assert.deepEqual(host.log.parts.map((p) => p.path), [`${REC}/LOG.jsonl`, `${REC}/LOG.2.jsonl`]);
  assert.deepEqual(host.verification.parts.map((p) => p.path).sort(), vparts.sort());
  assert.equal(host.verification.parts.reduce((a, p) => a + p.files.length, 0), files.length);
  assert.equal(r.verification.files, files.length);
  assert.ok(HOST_FILE.startsWith("."), "hidden: the job's hand-back tool never sends it");
  // a second import is refused, and changes nothing
  const snap = fs.readFileSync(path.join(out, REC, "LOG.jsonl"));
  assert.throws(() => importSite(out), /already imported/);
  assert.ok(fs.readFileSync(path.join(out, REC, "LOG.jsonl")).equals(snap));
});

test("[req.records.site-import] a log that does not verify, or a line Coursewerk did not write, is refused with nothing changed", (t) => {
  const { out } = site(t, { bigLog: true });
  const p2 = path.join(out, REC, "LOG.2.jsonl");
  const lines = fs.readFileSync(p2, "utf8").split("\n");
  lines[0] = lines[0].replace('"i":', '"j":');
  fs.writeFileSync(p2, lines.join("\n"));
  const before = recordFiles(out);
  assert.throws(() => importSite(out), /does not verify/);
  assert.deepEqual([...recordFiles(out)].map(([k, v]) => [k, sha(v)]), [...before].map(([k, v]) => [k, sha(v)]));
  assert.equal(fs.existsSync(path.join(out, HOST_FILE)), false);

  const { out: out2 } = site(t);
  const vp = fs.readdirSync(path.join(out2, VER))[0], vfile = path.join(out2, VER, vp);
  const vl = fs.readFileSync(vfile, "utf8").split("\n"); vl[0] = vl[0].replace(/^\{"file":/, '{ "file":');
  fs.writeFileSync(vfile, vl.join("\n"));
  assert.throws(() => importSite(out2), /not written as Coursewerk writes it/);
  assert.equal(fs.existsSync(path.join(out2, HOST_FILE)), false);
  assert.ok(fs.existsSync(path.join(out2, REC, "LOG.jsonl")) && fs.readdirSync(path.join(out2, VER)).every((n) => n.endsWith(".jsonl")));
});

test("[req.records.site-handback] hand-back is append-only: imported parts byte-identical, the log tail on the last part then new parts, new records in their month's part", (t) => {
  const { out } = site(t, { bigLog: true });
  const pulled = recordFiles(out);
  importSite(out);
  // nothing done: the hand-back gives back exactly what was pulled
  handbackSite(out);
  assert.deepEqual([...recordFiles(out)].map(([k, v]) => [k, sha(v)]), [...pulled].map(([k, v]) => [k, sha(v)]));
  assert.equal(readHostRecord(out).state, "handed-back");
  assert.equal(fs.readdirSync(path.join(out, VER)).filter((n) => n.endsWith(".json")).length, 0, "no record files left");

  // a fresh import (the push re-pulls), then work: records logged, two dispatches (one in an imported month, one now)
  importSite(out);
  const host = readHostRecord(out);
  const months = host.verification.parts.map((p) => /verification\/(\d{4}-\d{2})/.exec(p.path)?.[1]).filter(Boolean).sort();
  const oldMonth = months.at(-1);
  const lastOld = host.verification.parts.filter((p) => p.path.includes(`/${oldMonth}`)).sort((a, b) => a.path.length - b.path.length || (a.path < b.path ? -1 : 1)).at(-1);
  const old = dispatchAt(out, `${oldMonth}-28T12:00:00.000Z`, "u-old");
  const now = dispatchAt(out, null, "u-now");
  appendLogRecord(out, { type: "checkpoint", party: harness, payload: { note: "small" } });
  for (let i = 0; i < 3; i++) appendLogRecord(out, { type: "checkpoint", party: harness, payload: { pad: "y".repeat(900_000), i } });
  const working = fs.readFileSync(path.join(out, REC, "LOG.jsonl"));
  const r = handbackSite(out);
  const after = recordFiles(out);
  // the log: every imported part as pulled except the last, which only grew; then a new part; joined = the working log
  assert.ok(after.get(`${REC}/LOG.jsonl`).equals(pulled.get(`${REC}/LOG.jsonl`)));
  const p2 = after.get(`${REC}/LOG.2.jsonl`), was2 = pulled.get(`${REC}/LOG.2.jsonl`);
  assert.ok(p2.length > was2.length && p2.subarray(0, was2.length).equals(was2), "the last part only grew");
  assert.ok(p2.length <= 3.5 * 1024 * 1024);
  assert.ok(after.has(`${REC}/LOG.3.jsonl`), "past 3.5 MB the tail goes into a new part");
  const names = [...after.keys()].filter((k) => /\/LOG(\.\d+)?\.jsonl$/.test(k)).sort((a, b) => (Number(/LOG\.(\d+)/.exec(a)?.[1] || 1) - Number(/LOG\.(\d+)/.exec(b)?.[1] || 1)));
  assert.ok(Buffer.concat(names.map((n) => after.get(n))).equals(working), "the parts joined are the working log");
  assert.ok(r.log.parts.some((p) => p.grew) && r.log.parts.some((p) => p.new));
  // verification: every imported part as pulled, except the ones that only grew by the new lines
  for (const [k, v] of pulled) if (k.startsWith(VER)) {
    const a = after.get(k);
    if (k === lastOld.path) assert.ok(a.length > v.length && a.subarray(0, v.length).equals(v) && a.subarray(v.length).toString().includes(old.dispatch), `${k} grew by the old-month record`);
    else if (!a.equals(v)) assert.ok(a.subarray(0, v.length).equals(v) && a.subarray(v.length).toString().includes(now.dispatch), `${k} only grew`);
  }
  const nowMonth = now.at.slice(0, 7);
  const nowPart = [...after.keys()].find((k) => k.startsWith(`${VER}/${nowMonth}`) && after.get(k).toString().includes(now.dispatch));
  assert.ok(nowPart, "the new record is in its month's part");
  const line = after.get(nowPart).toString().split("\n").find((l) => l.includes(now.dispatch));
  assert.deepEqual(JSON.parse(line), { file: `${now.dispatch}.json`, record: now });
  // a fresh import of the handed-back folder: the log and every record still bound
  importSite(out);
  const records = parseLog(readLogText(out));
  for (const d of [old, now]) assert.ok(boundRecord(JSON.parse(fs.readFileSync(path.join(out, VER, `${d.dispatch}.json`), "utf8")), records), `${d.dispatch} is bound`);
});

test("[req.records.site-handback] a rewritten log, or a changed or removed imported record, is refused and nothing is written", (t) => {
  const { out } = site(t);
  importSite(out);
  const logFile = path.join(out, REC, "LOG.jsonl"), log = fs.readFileSync(logFile, "utf8");
  appendLogRecord(out, { type: "checkpoint", party: harness, payload: { note: "new" } });
  const snapshot = () => {
    const files = [logFile, path.join(out, HOST_FILE), ...fs.readdirSync(path.join(out, VER)).map((n) => path.join(out, VER, n))];
    return files.map((f) => [f, sha(fs.readFileSync(f))]);
  };
  // an earlier record edited
  const lines = fs.readFileSync(logFile, "utf8").split("\n"); lines[2] = lines[2].replace(/"at":"(\d{4})/, (m, y) => `"at":"${Number(y) - 1}`);
  fs.writeFileSync(logFile, lines.join("\n"));
  let before = snapshot();
  assert.throws(() => handbackSite(out), /no longer extends the one Alembic holds/);
  assert.deepEqual(snapshot(), before);
  assert.equal(fs.readdirSync(path.join(out, VER)).some((n) => n.endsWith(".jsonl")), false, "no part written");
  fs.writeFileSync(logFile, log);
  // an imported verification record changed
  const f = fs.readdirSync(path.join(out, VER)).find((n) => n.endsWith(".json")), file = path.join(out, VER, f);
  const rec = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, unwrappedText({ ...rec, kind: rec.kind === "semi" ? "knowledge" : "semi" }));
  before = snapshot();
  assert.throws(() => handbackSite(out), /append-only: a record imported from .* was changed/);
  assert.deepEqual(snapshot(), before);
  // removed
  fs.rmSync(file);
  assert.throws(() => handbackSite(out), new RegExp(`append-only: .*${f}.* was removed`));
  fs.writeFileSync(file, unwrappedText(rec));
  // a host record edited to name a file outside the record parts
  const hostFile = path.join(out, HOST_FILE), hostText = fs.readFileSync(hostFile, "utf8");
  const edited = JSON.parse(hostText); edited.verification.parts[0].path = "private/coursewerk/../../README.jsonl";
  fs.writeFileSync(hostFile, JSON.stringify(edited));
  assert.throws(() => handbackSite(out), /names a part that is not a record part/);
  fs.writeFileSync(hostFile, hostText);
  // restored: the hand-back goes through
  handbackSite(out);
  assert.equal(readHostRecord(out).state, "handed-back");
});

test("[req.gate.host-anchor] no git + host record: the log is anchored to what Alembic holds; without the host record nothing changes", (t) => {
  const { out } = site(t);
  importSite(out);
  assert.deepEqual(logFindings(out, "b"), [], "the imported log extends itself: no log-unverifiable");
  assert.equal(createSnapshot(out, {}).paths.includes(HOST_FILE), false, "the host record is the job's bookkeeping: no module judges it as a package file");
  appendLogRecord(out, { type: "checkpoint", party: harness, payload: { note: "job work" } });
  assert.deepEqual(logFindings(out, "b"), [], "an extension is fine");
  // a rewritten history: every record re-chained consistently, so the chain alone verifies
  const recs = parseLog(readLogText(out));
  let text = "", prev = GENESIS;
  for (const [i, r] of recs.entries()) {
    const f = { seq: r.seq, prev, type: r.type, party: r.party, at: r.at, payload: i === 0 ? JSON.parse(canonicalJson({ ...r.payload, forged: true })) : r.payload };
    f.hash = recordHash(f); prev = f.hash; text += JSON.stringify(f) + "\n";
  }
  assert.deepEqual(verifyLog(text), []);
  fs.writeFileSync(path.join(out, REC, "LOG.jsonl"), text);
  const f = logFindings(out, "b");
  assert.equal(f.length, 1); assert.equal(f[0].kind, "log-broken"); assert.equal(f[0].statusClass, "defect");
  assert.match(f[0].evidence.failures[0], /no longer extends the one Alembic holds/);
  assert.match(f[0].evidence.note, /git-history checks .* skipped/);
  assert.equal(evaluateGate({ findings: f }).canPublish, false);
  // a broken chain is a defect too
  fs.writeFileSync(path.join(out, REC, "LOG.jsonl"), readLogText(out).split("\n").slice(1).join("\n"));
  assert.equal(logFindings(out, "b")[0].kind, "log-broken");
  // handed back (site layout again): not checkable until imported again
  const { out: back } = site(t);
  importSite(back); handbackSite(back);
  assert.equal(logFindings(back, "b")[0].kind, "log-unverifiable");
  // no git, no host record: exactly as before
  fs.rmSync(path.join(out, HOST_FILE));
  const plain = logFindings(out, "b");
  assert.equal(plain.length, 1); assert.equal(plain[0].kind, "log-unverifiable"); assert.equal(plain[0].evidence.what, "the package has no git history");
});

test("[req.gate.host-anchor] the snapshot never drops the decision log for its size; other texts keep the 8 MB limit", (t) => {
  const dir = tmp(t, "cw-snap-");
  fs.mkdirSync(path.join(dir, REC), { recursive: true }); fs.mkdirSync(path.join(dir, "study-guide"));
  const big = (JSON.stringify({ pad: "z".repeat(1000) }) + "\n").repeat(9000); // about 9 MB
  fs.writeFileSync(path.join(dir, REC, "LOG.jsonl"), big);
  fs.writeFileSync(path.join(dir, "study-guide", "big.md"), big);
  const s = createSnapshot(dir, {});
  assert.equal(s.text(`${REC}/LOG.jsonl`), big);
  assert.equal(s.text("study-guide/big.md"), null);
});

test("[req.records.site-import] [req.records.site-handback] [req.gate.host-anchor] the real General Chemistry delivery: import, work, hand back", { skip: !fs.existsSync(GENCHEM) && "the GenChem delivery is not on this machine" }, (t) => {
  const dir = tmp(t, "cw-genchem-");
  const root = path.join(dir, "package");
  fs.cpSync(GENCHEM, root, { recursive: true });
  const pulled = recordFiles(root);
  assert.ok(pulled.has(`${REC}/LOG.3.jsonl`), "the delivery holds the log in parts");
  const r = importSite(root);
  assert.equal(r.log.parts, 3);
  assert.equal(r.config, `${REC}/coursewerk.json`, "the delivery lacks coursewerk.json; its log shows spine v2 in force");
  assert.deepEqual(boundConfig(root).problems, []);
  const log = readLogText(root);
  assert.ok(Buffer.byteLength(log) > 8 * 1024 * 1024, "the joined log is past the old 8 MB snapshot limit");
  assert.deepEqual(logFindings(root, "b"), [], "no git: anchored to the host, and it extends");
  const records = parseLog(log);
  const files = fs.readdirSync(path.join(root, VER));
  assert.equal(files.length, r.verification.files);
  assert.ok(files.every((f) => boundRecord(JSON.parse(fs.readFileSync(path.join(root, VER, f), "utf8")), records)), "every unwrapped record is bound by the joined log");
  // work: one dispatch and one decision
  const d = dispatchAt(root, null, "u-genchem-probe");
  appendLogRecord(root, { type: "checkpoint", party: { role: "agent", name: "job", model: "claude-haiku-5-5" }, payload: { note: "round trip" } });
  assert.deepEqual(logFindings(root, "b"), []);
  const out = handbackSite(root);
  const after = recordFiles(root);
  const changed = [...after.keys()].filter((k) => !pulled.has(k) || !after.get(k).equals(pulled.get(k)));
  for (const k of changed) if (pulled.has(k)) { const v = pulled.get(k), a = after.get(k); assert.ok(a.length > v.length && a.subarray(0, v.length).equals(v), `${k} only grew`); }
  assert.deepEqual(changed.filter((k) => k.includes("/LOG")), [`${REC}/LOG.3.jsonl`], "only the last log part changed, by growing");
  assert.equal(changed.filter((k) => k.startsWith(VER)).length, 1, "one verification part took the new record");
  assert.ok(after.get(changed.find((k) => k.startsWith(VER))).toString().includes(d.dispatch));
  assert.equal(out.log.appended, 2); assert.equal(out.verification.appended, 1);
  t.diagnostic(`GenChem round trip: ${JSON.stringify(out)}`);
});

test("[req.records.site-import] a missing coursewerk.json is written back as the log says (spine v2 in force); an existing one is never overwritten; the export carries it", (t) => {
  const CONFIG = `${REC}/coursewerk.json`;
  const { out } = site(t);
  assert.equal(fs.readFileSync(path.join(out, CONFIG), "utf8"), fs.readFileSync(path.join(C2, CONFIG), "utf8"), "site_export carries coursewerk.json like every other working record");
  fs.rmSync(path.join(out, CONFIG));
  const r = importSite(out);
  assert.equal(r.config, CONFIG);
  assert.equal(fs.readFileSync(path.join(out, CONFIG), "utf8"), JSON.stringify({ schemaVersion: 1, spine: 2 }, null, 2) + "\n", "exactly as writeConfig writes it");
  assert.deepEqual(boundConfig(out).problems, []);
  // an existing file is left as it is (even one the log disagrees with: boundConfig reports that, the import does not hide it)
  const { out: out2 } = site(t);
  fs.writeFileSync(path.join(out2, CONFIG), JSON.stringify({ schemaVersion: 1, spine: 2, digestCap: 7 }) + "\n");
  assert.equal(importSite(out2).config, undefined);
  assert.equal(fs.readFileSync(path.join(out2, CONFIG), "utf8"), JSON.stringify({ schemaVersion: 1, spine: 2, digestCap: 7 }) + "\n");
  // a log that never showed spine v2: nothing is written
  const dir = tmp(t, "cw-v1-");
  appendLogRecord(dir, { type: "intake", party: harness, payload: {} });
  assert.equal(importSite(dir).config, undefined);
  assert.equal(fs.existsSync(path.join(dir, CONFIG)), false);
});
