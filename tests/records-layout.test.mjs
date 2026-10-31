// The records layout (owner 2026-10-31): the working record under private/coursewerk/, the public record under
// provenance/coursewerk/, for a local package and an Alembic site alike. A package written before it moves once
// (scripts/records_move.mjs); paths stored inside older records are read at their new place, never rewritten.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { relocate, RECORDS, PUBLIC_RECORDS, RECORD_PATHS } from "../scripts/lib/records/paths.mjs";
import { parseLog, verifyLog } from "../scripts/lib/records/log.mjs";
import { shippedFiles } from "../scripts/lib/core/shipped.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const C2 = path.join(ROOT, "tests/fixtures/c2-chemistry-v2/package");

test("[req.records.layout] record paths live under private/coursewerk; a stored pre-layout path is read at its new place", () => {
  assert.equal(RECORDS, "private/coursewerk"); assert.equal(PUBLIC_RECORDS, "provenance/coursewerk");
  assert.equal(RECORD_PATHS.log, "private/coursewerk/LOG.jsonl");
  assert.equal(relocate("metadata/evidence/source.html"), "private/coursewerk/evidence/source.html");
  assert.equal(relocate("metadata/ATTRIBUTION.md"), "provenance/coursewerk/ATTRIBUTION.md");
  assert.equal(relocate("study-guide/x.md"), "study-guide/x.md");
});

test("[req.records.layout] the working record never ships; the public record does", (t) => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-layout-ship-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(C2, dir, { recursive: true });
  const { files } = shippedFiles(dir);
  assert.ok(!files.some((f) => f.startsWith("private/coursewerk/")), "no working record ships");
  assert.ok(files.includes("provenance/coursewerk/ATTRIBUTION.md"));
});

test("[req.records.layout] records_move moves a pre-layout package once, logs it, and keeps the chain", (t) => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-layout-move-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(C2, dir, { recursive: true });
  // the package as it was before the layout
  fs.mkdirSync(path.join(dir, "metadata"));
  for (const n of fs.readdirSync(path.join(dir, RECORDS))) fs.renameSync(path.join(dir, RECORDS, n), path.join(dir, "metadata", n));
  fs.renameSync(path.join(dir, PUBLIC_RECORDS, "ATTRIBUTION.md"), path.join(dir, "metadata", "ATTRIBUTION.md"));
  fs.rmSync(path.join(dir, "private", "coursewerk"), { recursive: true }); fs.rmSync(path.join(dir, "provenance"), { recursive: true });
  fs.writeFileSync(path.join(dir, "metadata", "further-reading.md"), "# Further reading\n");
  const git = (...a) => spawnSync("git", ["-C", dir, ...a], { encoding: "utf8" });
  git("init", "-q"); git("add", "-A"); git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "pre-layout");
  const logBefore = fs.readFileSync(path.join(dir, "metadata", "LOG.jsonl"), "utf8");
  const run = () => spawnSync(process.execPath, [path.join(ROOT, "scripts/records_move.mjs"), "--root", dir], { encoding: "utf8" });
  // a dirty tree is refused
  fs.writeFileSync(path.join(dir, "study-guide", "x.md"), "# x\n");
  assert.notEqual(run().status, 0);
  fs.rmSync(path.join(dir, "study-guide", "x.md"));
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(dir, RECORDS, "units")) && fs.existsSync(path.join(dir, PUBLIC_RECORDS, "ATTRIBUTION.md")));
  assert.ok(fs.existsSync(path.join(dir, "metadata", "further-reading.md")), "a document that is not a record stays");
  const log = fs.readFileSync(path.join(dir, RECORDS, "LOG.jsonl"), "utf8");
  assert.ok(log.startsWith(logBefore), "the log only grew");
  assert.deepEqual(verifyLog(log), []);
  assert.equal(parseLog(log).at(-1).payload.event, "records-moved");
  // a second run finds nothing to move
  git("add", "-A"); git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "moved");
  const again = run();
  assert.equal(again.status, 0); assert.deepEqual(JSON.parse(again.stdout).moved, []);
});
