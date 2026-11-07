// The chain check for Alembic's hand-out and hand-back (req.records.chain-check; Door E, owner 2026-11-07):
// scripts/records_check.mjs --root <pkg> [--extends <earlier log>] → JSON { ok, problems }. The log must verify, and
// continue the earlier one: every earlier record unchanged and in order, only new records after them. Either layout
// (one LOG.jsonl, or Alembic's parts) reads as the same log. Anything unreadable is a problem, never an empty log.
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "records_check.mjs");
const LOG = "private/coursewerk/LOG.jsonl";
const H = { role: "harness", name: "test" };

function pkg(t, n = 4) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-records-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "private/coursewerk"), { recursive: true });
  const add = (k) => appendLogRecord(root, { type: "checkpoint", party: H, payload: { n: k } });
  for (let k = 1; k <= n; k++) add(k);
  return { root, add, log: () => readLogText(root), file: (name = earlierName) => path.join(root, "..", `${path.basename(root)}-${name}`), write: (text) => fs.writeFileSync(path.join(root, LOG), text) };
}
const earlierName = "earlier.jsonl";
const run = (...args) => { const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" }); let json = null; try { json = JSON.parse(r.stdout); } catch { json = null; } return { code: r.status, json, stderr: r.stderr }; };
const saveEarlier = (t, p) => { const f = p.file(); fs.writeFileSync(f, p.log()); t.after(() => fs.rmSync(f, { force: true })); return f; };

test("[req.records.chain-check] a log that only grew continues the earlier one; the CLI prints {ok, problems} and exits 0", (t) => {
  const p = pkg(t);
  const earlier = saveEarlier(t, p);
  p.add(5); p.add(6);
  const r = run("--root", p.root, "--extends", earlier);
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.json.ok, true); assert.deepEqual(r.json.problems, []);
  assert.equal(r.json.log.records, 6); assert.equal(r.json.extends.records, 4);
  assert.equal(r.json.log.sha256, sha256(p.log()));
  // the same log, nothing appended, continues itself; and the log alone verifies
  assert.equal(run("--root", p.root, "--extends", p.root).json.ok, true, "an earlier folder is read as its log");
  assert.equal(run("--root", p.root).code, 0);
  // an empty earlier log (a course Alembic held no log for) is continued by any log that verifies
  const empty = p.file("empty.jsonl"); fs.writeFileSync(empty, ""); t.after(() => fs.rmSync(empty, { force: true }));
  assert.equal(run("--root", p.root, "--extends", empty).json.ok, true);
});

test("[req.records.chain-check] a record changed, dropped or reordered is refused, as is a log that does not verify", (t) => {
  const p = pkg(t);
  const earlier = saveEarlier(t, p);
  p.add(5);
  const good = p.log(), lines = good.split("\n").filter(Boolean);
  const refuse = (text, why) => { p.write(text); const r = run("--root", p.root, "--extends", earlier); assert.equal(r.code, 1, why); assert.equal(r.json.ok, false, why); assert.ok(r.json.problems.length > 0, why); return r.json.problems; };
  // changed: one payload value, hash left alone (and, separately, rehashed would break the chain to the next record)
  refuse(good.replace('"n":2', '"n":20'), "an earlier record edited");
  // dropped: the last earlier record removed (the new one still after it)
  refuse([...lines.slice(0, 3), lines[4]].join("\n") + "\n", "an earlier record dropped");
  refuse(lines.slice(0, 3).join("\n") + "\n", "the log cut back");
  // reordered
  refuse([lines[1], lines[0], ...lines.slice(2)].join("\n") + "\n", "records reordered");
  // a whole new history that verifies on its own but does not continue the earlier one
  const other = pkg(t, 6);
  const r = run("--root", other.root, "--extends", earlier);
  assert.equal(r.json.ok, false); assert.match(r.json.problems.join(" "), /differs from the committed log|not a byte-exact prefix/);
  // the earlier log itself broken: never "continued"
  p.write(good);
  const broken = p.file("broken.jsonl"); fs.writeFileSync(broken, lines.slice(0, 2).join("\n") + "\n{\"seq\":3"); t.after(() => fs.rmSync(broken, { force: true }));
  assert.equal(run("--root", p.root, "--extends", broken).json.ok, false);
  // a log alone that does not verify
  p.write(good.replace('"n":5', '"n":50'));
  assert.equal(run("--root", p.root).json.ok, false);
});

test("[req.records.chain-check] Alembic's parts read as the joined log; gaps, cuts inside a line and unreadable inputs are problems, never an empty log", (t) => {
  const p = pkg(t, 6);
  const earlier = saveEarlier(t, p);
  p.add(7);
  const lines = p.log().split(/(?<=\n)/);
  // site layout: LOG.jsonl, LOG.2.jsonl, LOG.3.jsonl cut at line ends
  const dir = path.join(p.root, "private/coursewerk");
  fs.writeFileSync(path.join(dir, "LOG.jsonl"), lines.slice(0, 3).join(""));
  fs.writeFileSync(path.join(dir, "LOG.2.jsonl"), lines.slice(3, 5).join(""));
  fs.writeFileSync(path.join(dir, "LOG.3.jsonl"), lines.slice(5).join(""));
  const r = run("--root", p.root, "--extends", earlier);
  assert.equal(r.json.ok, true, JSON.stringify(r.json.problems));
  assert.deepEqual(r.json.log.parts, ["private/coursewerk/LOG.jsonl", "private/coursewerk/LOG.2.jsonl", "private/coursewerk/LOG.3.jsonl"]);
  assert.equal(r.json.log.sha256, sha256(lines.join("")));
  assert.equal(checkRecords(p.root, { extends: fs.readFileSync(earlier, "utf8") }).ok, true, "the library says the same");
  // a gap in the parts
  fs.renameSync(path.join(dir, "LOG.3.jsonl"), path.join(dir, "LOG.4.jsonl"));
  assert.match(run("--root", p.root, "--extends", earlier).json.problems.join(" "), /without gaps/);
  fs.renameSync(path.join(dir, "LOG.4.jsonl"), path.join(dir, "LOG.3.jsonl"));
  // a part cut inside a line
  fs.writeFileSync(path.join(dir, "LOG.jsonl"), lines.slice(0, 3).join("").slice(0, -10));
  fs.writeFileSync(path.join(dir, "LOG.2.jsonl"), lines.slice(0, 3).join("").slice(-10) + lines.slice(3, 5).join(""));
  assert.equal(run("--root", p.root, "--extends", earlier).json.ok, false);
  // unreadable inputs: a missing earlier log, a folder with no log, no --root
  const missing = run("--root", p.root, "--extends", path.join(p.root, "no-such.jsonl"));
  assert.equal(missing.code, 1); assert.equal(missing.json.ok, false); assert.match(missing.json.problems[0], /cannot be read/);
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-records-check-bare-")); t.after(() => fs.rmSync(bare, { recursive: true, force: true }));
  const none = run("--root", bare);
  assert.equal(none.code, 1); assert.match(none.json.problems[0], /no Coursewerk records/);
  fs.mkdirSync(path.join(bare, "private/coursewerk"), { recursive: true });
  assert.match(run("--root", bare).json.problems[0], /LOG\.jsonl is missing/);
  assert.equal(run().code, 2, "usage");
  assert.equal(run("--root", p.root, "--extends").code, 2, "usage: --extends needs a path");
});
