// The site export (records under Alembic, step A): the working record mapped onto the site-type contract's places
// without changing the package; verification records as append-only monthly lines under the per-file cap; CHECKED.json
// binds each page to the text Coursewerk checked and carries no prompt, passage or source text.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { exportSite, checkedRecord, verificationLines, RECORD_LIMITS } from "../scripts/lib/core/site_export.mjs";
import { verifyLog } from "../scripts/lib/records/log.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const C2 = path.join(ROOT, "tests/fixtures/c2-chemistry-v2/package");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

function pkg(t) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-site-export-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"); fs.cpSync(C2, root, { recursive: true });
  // a deck at the contract's path, and an attribution naming the old one
  fs.renameSync(path.join(root, "slides/le-chatelier.md"), path.join(root, "slides/le-chatelier.slides.md"));
  fs.writeFileSync(path.join(root, "provenance/coursewerk/ATTRIBUTION.md"), "| asset | used in |\n|---|---|\n| `assets/x.svg` | study-guide/le-chatelier.md, slides/le-chatelier.md |\n");
  const git = (...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });
  git("init", "-q"); git("add", "-A"); git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "c2");
  return { root, dir, git };
}

test("[req.records.site-export] the export maps the record onto private/coursewerk and provenance/coursewerk, and changes nothing", (t) => {
  const { root, dir, git } = pkg(t);
  const out = path.join(dir, "site");
  const r = exportSite(root, out, { gateResult: { findings: [] }, at: "2026-10-31T00:00:00Z" });
  assert.deepEqual(r.problems, []);
  assert.equal(git("status", "--porcelain").stdout, "", "the package is untouched");
  // the decision log, byte for byte, still a verifiable chain
  const log = fs.readFileSync(path.join(out, "private/coursewerk/LOG.jsonl"), "utf8");
  assert.equal(log, fs.readFileSync(path.join(root, "private/coursewerk/LOG.jsonl"), "utf8"));
  assert.deepEqual(verifyLog(log), []);
  // every verification record is one line, in few files, each under the cap
  const vdir = path.join(out, "private/coursewerk/verification"), vfiles = fs.readdirSync(vdir);
  const n = fs.readdirSync(path.join(root, "private/coursewerk/verification")).filter((f) => f.endsWith(".json")).length;
  const lines = vfiles.flatMap((f) => fs.readFileSync(path.join(vdir, f), "utf8").trim().split("\n"));
  assert.equal(lines.length, n);
  assert.ok(vfiles.length <= 4 && vfiles.every((f) => fs.statSync(path.join(vdir, f)).size <= RECORD_LIMITS.bytesPerFile), vfiles.join(", "));
  assert.ok(r.files.length <= RECORD_LIMITS.filesPerChange, "one hand-in change carries it");
  // the public record: hashes and counts, no prompt, passage or source text; the deck at the site's path
  const checked = fs.readFileSync(path.join(out, "provenance/coursewerk/CHECKED.json"), "utf8");
  assert.doesNotMatch(checked, /"(?:passages|bundle|prompt|answer|quote)"/);
  const c = JSON.parse(checked);
  const deck = c.pages.find((p) => p.path === "slides/le-chatelier.slides.md");
  assert.ok(deck); assert.equal(deck.sha256, sha(fs.readFileSync(path.join(root, "slides/le-chatelier.slides.md"))));
  assert.ok(c.pages.some((p) => p.path === "concepts/course.md" && p.chapter === null));
  assert.ok(c.approvals.length >= 3 && c.approvals.every((a) => a.valid), "the approved C2 spine");
  assert.match(fs.readFileSync(path.join(out, "provenance/coursewerk/ATTRIBUTION.md"), "utf8"), /slides\/le-chatelier\.slides\.md/);
  // nothing outside the two record places
  const all = []; const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.relative(out, path.join(d, e.name)))));
  walk(out);
  assert.ok(all.every((f) => /^(?:private|provenance)\/coursewerk\//.test(f.split(path.sep).join("/"))), all.join(", "));
});

test("[req.records.site-export] a later export only appends verification lines", (t) => {
  const { root } = pkg(t);
  const before = verificationLines(root);
  fs.writeFileSync(path.join(root, "private/coursewerk/verification/d-ffffffffffffffff.json"), JSON.stringify({ schemaVersion: 1, dispatch: "d-ffffffffffffffff", kind: "knowledge", at: "2099-01-01T00:00:00Z" }));
  fs.writeFileSync(path.join(root, "private/coursewerk/verification/d-0000000000000000.json"), JSON.stringify({ schemaVersion: 1, dispatch: "d-0000000000000000", kind: "knowledge", at: "2099-01-02T00:00:00Z" }));
  const after = verificationLines(root);
  for (const [k, v] of Object.entries(before)) assert.equal(after[k], v, `${k} is unchanged`);
  assert.ok(after["verification/2099-01.jsonl"].indexOf("d-ffffffffffffffff") < after["verification/2099-01.jsonl"].indexOf("d-0000000000000000"), "dispatch order, not file-name order");
});

test("[req.records.site-export] CHECKED.json counts what is open on each page", () => {
  const reader = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-chk-"));
  try {
    fs.cpSync(C2, reader, { recursive: true });
    const units = JSON.parse(fs.readFileSync(path.join(reader, "private/coursewerk/units/practice/le-chatelier.md.json"), "utf8")).units;
    const f = (statusClass, extra = {}) => ({ statusClass, status: "open", units: [units[0].id], ...extra });
    const c = checkedRecord(reader, { findings: [f("defect"), f("question"), f("question", { status: "answered" }), { statusClass: "obligation", status: "open", units: [], evidence: { file: "concepts/le-chatelier.md" } }] });
    assert.deepEqual(c.pages.find((p) => p.path === "practice/le-chatelier.md").open, { defects: 1, obligations: 0, questions: 1 });
    assert.deepEqual(c.pages.find((p) => p.path === "concepts/le-chatelier.md").open, { defects: 0, obligations: 1, questions: 0 });
  } finally { fs.rmSync(reader, { recursive: true, force: true }); }
});
