// Audit of the FC-16 batch (records_check --records; req.records.chain-check-bound), findings L1 and L2:
//   L1  a record is filed under its own dispatch (verification/<dispatch>.json; a wrapped line's "file" likewise), and a
//       file at the top of verification/ is a .json record or a .jsonl part, nothing else;
//   L2  vouching for every record reads the log's dispatch entries once (linear), not once per record.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendLogRecord } from "../scripts/lib/records/log.mjs";
import { checkRecords } from "../scripts/lib/records/records_check.mjs";
import { sha256 } from "../scripts/lib/records/canonical.mjs";
import { VERIFICATION_DIR, dispatchLogEntry, recordDispatch } from "../scripts/lib/verify/dispatch.mjs";
import { exportSite } from "../scripts/lib/core/site_export.mjs";

const tmp = (t, name) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `coursewerk-records-bound-audit-${name}-`)); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
function pkg(t) {
  const root = tmp(t, "pkg");
  fs.mkdirSync(path.join(root, "private/coursewerk"), { recursive: true });
  appendLogRecord(root, { type: "intake", party: { role: "harness", name: "test" }, payload: { n: 1 } });
  const review = (unit, text) => {
    const prompt = `Reply with JSON only, nonce ${unit}.\nPASSAGE\n${text}\n`;
    return recordDispatch(root, { kind: "knowledge", unit, factHash: sha256(text), contentHash: sha256(text), bundle: { nonce: unit, prompt, bundleHash: sha256(prompt) }, answer: { mode: "replay", raw: JSON.stringify({ nonce: unit, concerns: [] }) } });
  };
  return { root, a: review("u-a", "Water boils at one hundred degrees Celsius."), b: review("u-b", "Ice melts at zero degrees Celsius.") };
}
const V = (root) => path.join(root, VERIFICATION_DIR);
const problems = (root) => checkRecords(root, { records: true }).problems.join("\n");

test("[req.records.chain-check-bound] audit L1: a record filed under another dispatch's name is refused, in either layout", (t) => {
  const { root, a, b } = pkg(t);
  assert.equal(checkRecords(root, { records: true }).ok, true);
  // the two records' files swapped: each is a record the log vouches for, filed under the other's name
  const A = path.join(V(root), `${a.dispatch}.json`), B = path.join(V(root), `${b.dispatch}.json`), ta = fs.readFileSync(A);
  fs.copyFileSync(B, A); fs.writeFileSync(B, ta);
  assert.match(problems(root), new RegExp(`${a.dispatch}\\.json holds the record of review ${b.dispatch}`));
  fs.copyFileSync(A, B); fs.writeFileSync(A, ta); // back as they were
  // a copy planted under a new name
  fs.copyFileSync(A, path.join(V(root), "d-0000000000000000.json"));
  assert.match(problems(root), /d-0000000000000000\.json holds the record of review/);
  fs.rmSync(path.join(V(root), "d-0000000000000000.json"));
  // Alembic's layout: a wrapped line whose "file" names another dispatch
  const s = tmp(t, "site"); exportSite(root, s);
  assert.equal(checkRecords(s, { records: true }).ok, true);
  const part = path.join(V(s), fs.readdirSync(V(s)).find((f) => f.endsWith(".jsonl")));
  const lines = fs.readFileSync(part, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  lines.push({ file: "d-0000000000000000.json", record: lines.find((l) => l.file === `${a.dispatch}.json`).record });
  fs.writeFileSync(part, lines.map((l) => JSON.stringify(l) + "\n").join(""));
  assert.match(problems(s), /d-0000000000000000\.json holds the record of review/);
});

test("[req.records.chain-check-bound] audit L1: a file at the top of verification/ that is neither .json nor .jsonl is refused", (t) => {
  const { root } = pkg(t);
  for (const name of ["notes.txt", "README", "2026-11.jsonl.bak"]) {
    fs.writeFileSync(path.join(V(root), name), "x");
    assert.match(problems(root), new RegExp(`verification/${name.replace(/\./g, "\\.")} is neither a review record \\(\\.json\\) nor a part of them \\(\\.jsonl\\)`), name);
    fs.rmSync(path.join(V(root), name));
  }
  assert.equal(checkRecords(root, { records: true }).ok, true);
});

test("[req.records.chain-check-bound] audit L2: vouching for many records reads the log's dispatch entries once", () => {
  const n = 3000;
  const log = Array.from({ length: n }, (_, i) => ({ seq: i, type: "dispatch", party: { role: "harness" }, payload: { dispatch: `d-${i}`, unit: `u-${i}`, bundleHash: sha256(`p${i}`), responseHash: sha256(`r${i}`) } }));
  let reads = 0;
  const counted = new Proxy(log, { get(target, key, recv) { if (typeof key === "string" && /^\d+$/.test(key)) reads++; return Reflect.get(target, key, recv); } });
  for (let i = 0; i < n; i++) assert.ok(dispatchLogEntry({ dispatch: `d-${i}`, unit: `u-${i}`, bundle: { prompt: `p${i}`, bundleHash: sha256(`p${i}`) }, answer: { raw: `r${i}`, responseHash: sha256(`r${i}`) } }, counted));
  assert.ok(reads <= 2 * n, `${reads} reads of the log's entries for ${n} records: linear, not records × log`);
});
