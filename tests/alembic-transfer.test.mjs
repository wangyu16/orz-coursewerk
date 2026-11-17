// Sending a course to Alembic, and taking it from there (req.host.alembic-transfer; FC-16 O7). Coursewerk makes the zip
// Alembic's Door E takes and prints the page to open; it uploads nothing and never changes the folder. The records check
// Alembic runs (the chain and the review records the log binds) must pass on exactly what goes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { appendLogRecord, readLogText } from "../scripts/lib/records/log.mjs";
import { checkRecords } from "../scripts/lib/records/records_check.mjs";
import { sha256 } from "../scripts/lib/records/canonical.mjs";
import { VERIFICATION_DIR, recordDispatch } from "../scripts/lib/verify/dispatch.mjs";
import { exportSite } from "../scripts/lib/core/site_export.mjs";
import { importSite } from "../scripts/lib/core/site_host.mjs";
import { alembicHost, prepareSend, takeSteps } from "../scripts/lib/core/alembic_transfer.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "alembic_transfer.mjs");
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const tmp = (t, name) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `coursewerk-transfer-${name}-`)); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const unzip = (t, zip) => { const d = tmp(t, "unzipped"); const r = spawnSync("unzip", ["-q", zip, "-d", d], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return d; };
const H = { role: "harness", name: "test" };
const review = (root, unit, text) => {
  const prompt = `${"You are a blind reviewer. ".repeat(30)}\nReply with JSON only, nonce ${unit}.\nPASSAGE\n${text}\n`;
  return recordDispatch(root, { kind: "knowledge", unit, factHash: sha256(text), contentHash: sha256(text), bundle: { nonce: unit, prompt, bundleHash: sha256(prompt) }, answer: { mode: "replay", raw: JSON.stringify({ nonce: unit, concerns: [] }) } });
};
/** Every file of a folder with its bytes' hash: the folder before and after must be the same. */
const snapshot = (dir) => { const out = {}; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else out[path.relative(dir, f)] = sha256(fs.readFileSync(f)); } }; walk(dir); return out; };
const sumsHold = (dir) => {
  const lines = fs.readFileSync(path.join(dir, "SHA256SUMS"), "utf8").split("\n").filter(Boolean);
  const listed = new Set();
  for (const l of lines) { const m = /^([0-9a-f]{64})  \.\/(.+)$/.exec(l); assert.ok(m, l); listed.add(m[2]); assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, m[2]))).digest("hex"), m[1], m[2]); }
  const all = Object.keys(snapshot(dir)).map((f) => f.split(path.sep).join("/")).filter((f) => f !== "SHA256SUMS");
  assert.deepEqual([...listed].sort(), all.sort(), "SHA256SUMS lists every file in the zip");
};

/** A folder as Alembic hands it out (site layout, its hand-out note), imported, then worked on: one new review. */
function handedOut(t) {
  const src = tmp(t, "src");
  fs.mkdirSync(path.join(src, "private/coursewerk"), { recursive: true });
  appendLogRecord(src, { type: "intake", party: H, payload: { n: 1 } });
  review(src, "u-a", "Water boils at one hundred degrees Celsius at one atmosphere.");
  const folder = path.join(tmp(t, "out"), "gases");
  exportSite(src, folder);
  fs.mkdirSync(path.join(folder, ".alembic"), { recursive: true });
  fs.writeFileSync(path.join(folder, ".alembic/handout.json"), JSON.stringify({ alembic: "handout", course: "gases-ab12", handout: "h-1", title: "Gases", at: "2026-11-17T00:00:00Z" }));
  fs.writeFileSync(path.join(folder, "alembic.json"), JSON.stringify({ title: "Gases", units: [{ slug: "gases", title: "Gases" }] }));
  fs.mkdirSync(path.join(folder, "study-guide"), { recursive: true });
  fs.writeFileSync(path.join(folder, "study-guide/gases.md"), "# Gases\n");
  const heldLog = readLogText(src);
  importSite(folder);
  review(folder, "u-b", "Ice melts at zero degrees Celsius at one atmosphere.");
  fs.writeFileSync(path.join(folder, "study-guide/gases.md"), "# Gases\n\nA new paragraph.\n");
  fs.writeFileSync(path.join(folder, "study-guide/gases.md.html"), "<html></html>");
  return { folder, heldLog };
}

test("[req.host.alembic-transfer] a folder Alembic handed out goes back as Alembic takes it: handed back in a copy, records checked, the folder unchanged", (t) => {
  const { folder, heldLog } = handedOut(t);
  const before = snapshot(folder);
  const out = tmp(t, "zips");
  const r = prepareSend(folder, { out, host: "https://alembic-test.orz.how/" });
  assert.equal(r.mode, "bring-back"); assert.equal(r.course, "gases-ab12"); assert.equal(r.handedBack, true);
  assert.equal(r.link, "https://alembic-test.orz.how/workspace/gases-ab12/course#on-my-computer");
  assert.equal(path.dirname(r.zip), out); assert.deepEqual(r.records, { log: 3, reviews: 2, logged: 2 });
  assert.deepEqual(snapshot(folder), before, "the folder itself is never changed");
  const z = unzip(t, r.zip);
  // Alembic's return check: the course at the zip root, its hand-out note, Coursewerk's host record "handed-back"
  assert.ok(fs.existsSync(path.join(z, "alembic.json")) && fs.existsSync(path.join(z, ".alembic/handout.json")));
  assert.equal(JSON.parse(fs.readFileSync(path.join(z, ".coursewerk-host.json"), "utf8")).state, "handed-back");
  // site layout, append-only: the log Alembic held is the start of the log that goes back; records in monthly parts
  assert.ok(fs.readFileSync(path.join(z, "private/coursewerk/LOG.jsonl"), "utf8").startsWith(heldLog));
  assert.ok(fs.readdirSync(path.join(z, VERIFICATION_DIR)).every((f) => f.endsWith(".jsonl")));
  const check = checkRecords(z, { records: true, extends: heldLog });
  assert.equal(check.ok, true, check.problems.join("\n"));
  assert.equal(fs.readFileSync(path.join(z, "study-guide/gases.md"), "utf8"), "# Gases\n\nA new paragraph.\n");
  assert.ok(!fs.existsSync(path.join(z, "study-guide/gases.md.html")), "assembled files are left out: Alembic assembles its own");
  assert.ok(r.warnings.some((w) => /assembled file/.test(w)));
  sumsHold(z);
  // sent again: the same answer (the folder is still imported; nothing was consumed)
  assert.equal(prepareSend(folder, { out, host: "https://alembic-test.orz.how" }).mode, "bring-back");
  // a folder from Alembic without its hand-out note can only be brought in, as a new course: said so
  fs.rmSync(path.join(folder, ".alembic"), { recursive: true });
  const again = prepareSend(folder, { out });
  assert.equal(again.mode, "bring-in"); assert.ok(again.warnings.some((w) => /makes a new course beside the one it came from/.test(w)), again.warnings.join("\n"));
});

test("[req.host.alembic-transfer] a package made on the computer goes as a new course: records cut as Alembic holds them; the CLI prints the page and the steps", (t) => {
  const root = path.join(tmp(t, "pkg"), "c2");
  fs.cpSync(C2, root, { recursive: true });
  const before = snapshot(root);
  const r = spawnSync(process.execPath, [CLI, "send", "--root", root, "--json"], { encoding: "utf8", env: { ...process.env, COURSEWERK_ALEMBIC_URL: "" } });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.mode, "bring-in"); assert.equal(j.link, "https://alembic.orz.how/workspace"); assert.equal(j.course, null);
  assert.equal(j.zip, path.join(path.dirname(root), "c2.to-alembic.zip"));
  assert.match(j.steps.join("\n"), /Bring in a course from my computer.*c2\.to-alembic\.zip/s);
  assert.deepEqual(snapshot(root), before);
  const z = unzip(t, j.zip);
  assert.ok(fs.readdirSync(path.join(z, VERIFICATION_DIR)).every((f) => f.endsWith(".jsonl")), "verification records in monthly parts");
  assert.equal(fs.readFileSync(path.join(z, "private/coursewerk/LOG.jsonl"), "utf8"), readLogText(root), "the log (under one part) byte for byte");
  assert.ok(!fs.existsSync(path.join(z, ".git")) && !fs.existsSync(path.join(z, ".coursewerk-host.json")));
  assert.equal(checkRecords(z, { records: true }).ok, true);
  assert.equal(j.records.reviews, 574);
  sumsHold(z);
  // the plain output names the page, the file and what to press
  const plain = spawnSync(process.execPath, [CLI, "send", "--root", root, "--host", "https://alembic-test.orz.how"], { encoding: "utf8" });
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /Open https:\/\/alembic-test\.orz\.how\/workspace\n/);
  assert.match(plain.stdout, /Coursewerk sends nothing/);
});

test("[req.host.alembic-transfer] nothing is made when the records check refuses, or the folder cannot be sent as it is", (t) => {
  // a review record rewritten after it was logged: Alembic would refuse it, so no zip
  const { folder } = handedOut(t);
  const out = tmp(t, "zips");
  const recOf = (unit) => path.join(folder, VERIFICATION_DIR, fs.readdirSync(path.join(folder, VERIFICATION_DIR)).find((f) => f.endsWith(".json") && JSON.parse(fs.readFileSync(path.join(folder, VERIFICATION_DIR, f), "utf8")).unit === unit));
  for (const [unit, why] of [["u-b", /records check refuses this course[\s\S]*is not the record the decision log binds/], ["u-a", /cannot be handed back[\s\S]*append-only/]]) {
    const rec = recOf(unit), good = fs.readFileSync(rec, "utf8");
    fs.writeFileSync(rec, good.replace('"mode": "replay"', '"mode": "headless"'));
    assert.throws(() => prepareSend(folder, { out }), why, `${unit}: the review made on the computer, then the one Alembic handed out`);
    assert.deepEqual(fs.readdirSync(out), [], "no zip");
    fs.writeFileSync(rec, good);
  }
  // a log record changed: the hand-back itself refuses
  const log = path.join(folder, "private/coursewerk/LOG.jsonl"), text = fs.readFileSync(log, "utf8");
  fs.writeFileSync(log, text.replace('"n":1', '"n":2'));
  assert.throws(() => prepareSend(folder, { out }), /no longer extends the one Alembic holds/);
  fs.writeFileSync(log, text);
  // a hand-out never imported, but worked on as a package: what Alembic holds cannot be told
  fs.rmSync(path.join(folder, ".coursewerk-host.json"));
  assert.throws(() => prepareSend(folder, { out }), /never imported/);
  // a damaged hand-out note; no Coursewerk records; a writer at work; the zip inside the folder; a bad address
  const bare = tmp(t, "bare");
  assert.throws(() => prepareSend(bare, { out }), /holds no Coursewerk course/);
  fs.writeFileSync(path.join(folder, ".alembic/handout.json"), "{");
  assert.throws(() => prepareSend(folder, { out }), /damaged/);
  const pkg = path.join(tmp(t, "pkg"), "c2"); fs.cpSync(C2, pkg, { recursive: true });
  assert.throws(() => prepareSend(pkg, { out: path.join(pkg, "dist") }), /outside the course folder/);
  fs.writeFileSync(path.join(pkg, "private/coursewerk/LOG.jsonl.lock"), "");
  assert.throws(() => prepareSend(pkg, { out }), /LOG\.jsonl\.lock/);
  for (const bad of ["http://alembic.orz.how", "https://alembic.orz.how/workspace", "https://user:pw@alembic.orz.how", "alembic.orz.how?x=1", "javascript:alert(1)"])
    assert.throws(() => alembicHost(bad), /not an (Alembic )?address/, bad);
  assert.equal(alembicHost("http://localhost:3000/"), "http://localhost:3000", "a local Alembic");
  assert.equal(spawnSync(process.execPath, [CLI, "send"], { encoding: "utf8" }).status, 2, "usage");
});

test("[req.host.alembic-transfer] take: the course's page from the hand-out note, alembic.json or --course, and the steps after the download", (t) => {
  const { folder } = handedOut(t);
  const a = takeSteps({ root: folder, host: "https://alembic.orz.how" });
  assert.equal(a.link, "https://alembic.orz.how/workspace/gases-ab12/course#on-my-computer");
  assert.match(a.steps.join("\n"), /Hand to my computer[\s\S]*site_import\.mjs[\s\S]*alembic_transfer\.mjs send/);
  const m = tmp(t, "manifest"); fs.writeFileSync(path.join(m, "alembic.json"), JSON.stringify({ packageId: "chem-101" }));
  assert.equal(takeSteps({ root: m }).course, "chem-101");
  fs.writeFileSync(path.join(m, "alembic.json"), JSON.stringify({ packageId: "pending" }));
  assert.equal(takeSteps({ root: m, host: "https://alembic.orz.how" }).link, "https://alembic.orz.how/workspace", "no course id: the workspace");
  assert.throws(() => takeSteps({ course: "../etc" }), /not an Alembic course id/);
  const r = spawnSync(process.execPath, [CLI, "take", "--course", "chem-101", "--host", "https://alembic-test.orz.how"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Open https:\/\/alembic-test\.orz\.how\/workspace\/chem-101\/course#on-my-computer/);
});
