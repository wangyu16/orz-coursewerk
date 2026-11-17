// The review records the decision log binds (req.records.chain-check-bound; FC-16 O5): records_check.mjs --records also
// checks every verification record against the log, as the gate does (ms8 dispatch-unlogged / dispatch-record-missing),
// so a returned course with a rewritten record is refused at once. Either layout: one file per record (a package), or
// Alembic's monthly .jsonl parts (site_export). Without --records the check is the chain check it always was.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { appendLogRecord, readLogText } from "../scripts/lib/records/log.mjs";
import { checkRecords } from "../scripts/lib/records/records_check.mjs";
import { sha256 } from "../scripts/lib/records/canonical.mjs";
import { PARTS_DIR, VERIFICATION_DIR, recordDispatch } from "../scripts/lib/verify/dispatch.mjs";
import { exportSite } from "../scripts/lib/core/site_export.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "records_check.mjs");
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const run = (...args) => { const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" }); let json = null; try { json = JSON.parse(r.stdout); } catch { json = null; } return { code: r.status, json }; };
const tmp = (t, name) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `coursewerk-records-bound-${name}-`)); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

const INSTRUCTIONS = "You are a blind reviewer. ".repeat(30) + "\n"; // ≥ 512 characters: stored once as a shared part
/** A package with a log and two review records, one of them compact (its instructions in verification/parts/). */
function pkg(t) {
  const root = tmp(t, "pkg");
  fs.mkdirSync(path.join(root, "private/coursewerk"), { recursive: true });
  appendLogRecord(root, { type: "intake", party: { role: "harness", name: "test" }, payload: { n: 1 } });
  const review = (unit, text) => {
    const prompt = `${INSTRUCTIONS}Reply with JSON only, nonce ${unit}.\nPASSAGE\n${text}\n`;
    return recordDispatch(root, { kind: "knowledge", unit, factHash: sha256(text), contentHash: sha256(text), bundle: { nonce: unit, prompt, bundleHash: sha256(prompt) }, answer: { mode: "replay", raw: JSON.stringify({ nonce: unit, concerns: [] }) } });
  };
  const a = review("u-a", "Water boils at one hundred degrees Celsius at one atmosphere.");
  const b = review("u-b", "Ice melts at zero degrees Celsius at one atmosphere.");
  return { root, a, b, rec: (d) => path.join(root, VERIFICATION_DIR, `${d.dispatch}.json`), parts: () => fs.readdirSync(path.join(root, PARTS_DIR)) };
}
const site = (t, root) => { const out = tmp(t, "site"); exportSite(root, out); return out; };
const refused = (root, re, why) => {
  const r = run("--root", root, "--records");
  assert.equal(r.code, 1, `${why}: ${JSON.stringify(r.json)}`); assert.equal(r.json.ok, false, why);
  if (re) assert.match(r.json.problems.join("\n"), re, why);
  return r.json;
};

test("[req.records.chain-check-bound] a course whose review records are the ones the log binds passes, in either layout", (t) => {
  const p = pkg(t);
  assert.equal(p.parts().length, 1, "the instructions are stored once, shared by both records");
  const r = run("--root", p.root, "--records");
  assert.equal(r.code, 0, JSON.stringify(r.json)); assert.deepEqual(r.json.problems, []);
  assert.deepEqual(r.json.records, { records: 2, parts: 0, sharedParts: 1, logged: 2 });
  // Alembic's layout: the records and their shared part wrapped into a monthly .jsonl part, the log in parts
  const s = site(t, p.root);
  assert.ok(!fs.existsSync(path.join(s, PARTS_DIR)), "the shared part travels wrapped, as a line of the monthly part");
  const rs = run("--root", s, "--records");
  assert.equal(rs.code, 0, JSON.stringify(rs.json)); assert.deepEqual(rs.json.records, { records: 2, parts: 1, sharedParts: 1, logged: 2 });
  // --extends with --records: the chain and the records both hold
  const earlier = path.join(tmp(t, "earlier"), "LOG.jsonl"); fs.writeFileSync(earlier, readLogText(p.root));
  assert.equal(run("--root", s, "--extends", earlier, "--records").code, 0);
  // the library says the same; a real course's 574 records hold too
  assert.equal(checkRecords(p.root, { records: true }).ok, true);
  const c2 = checkRecords(C2, { records: true });
  assert.equal(c2.ok, true, c2.problems.join("\n")); assert.equal(c2.records.records, c2.records.logged);
  assert.equal(checkRecords(site(t, C2), { records: true }).ok, true, "and in Alembic's layout");
});

test("[req.records.chain-check-bound] a rewritten, missing or planted review record is refused at once — only with --records", (t) => {
  // a record rewritten after it was logged (the answer re-dated: every field is bound by its recordHash)
  const p = pkg(t);
  const stored = JSON.parse(fs.readFileSync(p.rec(p.a), "utf8"));
  fs.writeFileSync(p.rec(p.a), JSON.stringify({ ...stored, at: "2020-01-01T00:00:00.000Z" }, null, 2) + "\n");
  refused(p.root, /is not the record the decision log binds/, "a record rewritten");
  assert.equal(run("--root", p.root).code, 0, "the chain check alone is unchanged: the log still verifies");
  assert.equal(checkRecords(p.root).records, undefined, "and its output has no records field");
  // the answer itself rewritten (a concern dropped): the responseHash no longer matches
  fs.writeFileSync(p.rec(p.a), JSON.stringify({ ...stored, answer: { ...stored.answer, raw: "{}" } }, null, 2) + "\n");
  refused(p.root, /is not the record the decision log binds/, "an answer rewritten");
  fs.writeFileSync(p.rec(p.a), JSON.stringify(stored, null, 2) + "\n");
  assert.equal(run("--root", p.root, "--records").code, 0, "put back, it passes");
  // a logged record gone
  fs.rmSync(p.rec(p.b));
  refused(p.root, new RegExp(`binds review ${p.b.dispatch} .*is missing`), "a record removed");
  // a record the log never bound (planted, or copied over another's name)
  const q = pkg(t);
  fs.writeFileSync(path.join(q.root, VERIFICATION_DIR, "d-0000000000000000.json"), JSON.stringify({ ...JSON.parse(fs.readFileSync(q.rec(q.a), "utf8")), dispatch: "d-0000000000000000" }, null, 2) + "\n");
  refused(q.root, /d-0000000000000000\.json is not the record the decision log binds/, "a planted record");
  fs.rmSync(path.join(q.root, VERIFICATION_DIR, "d-0000000000000000.json"));
  fs.copyFileSync(q.rec(q.a), q.rec(q.b));
  refused(q.root, /holds another record/, "a record copied over another's name");
});

test("[req.records.chain-check-bound] a shared prompt part altered, missing or stray is refused", (t) => {
  const p = pkg(t);
  const part = path.join(p.root, PARTS_DIR, p.parts()[0]);
  const good = fs.readFileSync(part, "utf8");
  fs.writeFileSync(part, good.replace("blind reviewer", "lenient reviewer"));
  const r = refused(p.root, /cannot be read whole: its prompt part .* is missing or altered/, "a part altered");
  assert.match(r.problems.join("\n"), /is not a prompt part the review records share/, "the altered part is named itself");
  fs.rmSync(part);
  refused(p.root, /missing or altered/, "a part removed");
  fs.writeFileSync(part, good);
  fs.writeFileSync(path.join(p.root, PARTS_DIR, "notes.json"), "{}\n");
  refused(p.root, /parts\/notes\.json is not a prompt part/, "a stray file among the parts");
});

test("[req.records.chain-check-bound] in Alembic's layout, a rewritten wrapped record or a line Coursewerk did not write is refused", (t) => {
  const p = pkg(t);
  const s = site(t, p.root);
  const vdir = path.join(s, VERIFICATION_DIR), month = fs.readdirSync(vdir).find((f) => f.endsWith(".jsonl"));
  const file = path.join(vdir, month), good = fs.readFileSync(file, "utf8"), lines = good.split(/(?<=\n)/);
  const edit = (i, f) => { const o = JSON.parse(lines[i]); f(o); return [...lines.slice(0, i), JSON.stringify(o) + "\n", ...lines.slice(i + 1)].join(""); };
  const at = lines.findIndex((l) => JSON.parse(l).file === `${p.a.dispatch}.json`);
  fs.writeFileSync(file, edit(at, (o) => { o.record.admission = { status: "admitted" }; }));
  refused(s, /is not the record the decision log binds/, "a wrapped record rewritten");
  fs.writeFileSync(file, lines.filter((_, i) => i !== at).join(""));
  refused(s, /is missing/, "a wrapped record dropped");
  fs.writeFileSync(file, good.replace(/\n$/, "\n\n"));
  refused(s, /is not a verification record as Coursewerk wraps it/, "a blank line");
  fs.writeFileSync(file, good + lines[at]);
  assert.equal(run("--root", s, "--records").code, 0, "the same record twice, identical, reads as one");
  fs.writeFileSync(file, good + edit(at, (o) => { o.record.at = "2020-01-01T00:00:00.000Z"; }).split(/(?<=\n)/)[at]);
  refused(s, /held twice, differently/, "the same record twice, differently");
  fs.writeFileSync(file, good.slice(0, -1));
  refused(s, /does not end at a line end/, "a part cut short");
  fs.writeFileSync(file, good);
  assert.equal(run("--root", s, "--records").code, 0);
});

test("[req.records.chain-check-bound] the records are checked only against a log that verifies; many problems are counted, not all listed", (t) => {
  const p = pkg(t);
  const log = path.join(p.root, "private/coursewerk/LOG.jsonl");
  fs.writeFileSync(log, fs.readFileSync(log, "utf8").replace('"n":1', '"n":2'));
  const r = run("--root", p.root, "--records");
  assert.equal(r.code, 1); assert.equal(r.json.records, null, "nothing vouches for a record when the log does not verify");
  const q = pkg(t);
  for (let i = 0; i < 60; i++) fs.writeFileSync(path.join(q.root, VERIFICATION_DIR, `d-${String(i).padStart(16, "0")}.json`), "{}\n");
  const many = refused(q.root, null, "many planted records");
  assert.equal(many.problems.length, 51); assert.match(many.problems.at(-1), /and 10 more problems with the review records/);
});
