// Audit of the FC-16 batch (send to Alembic; req.host.alembic-transfer), findings M1, M2, M3, L3:
//   M1  a folder already in Alembic's layout whose decision log grew past one part keeps its .jsonl review parts (only
//       the log is cut), also with new one-file records beside the parts and with the log already in parts;
//   M2  hidden files never go, but Alembic's hand-out note and Coursewerk's host record;
//   M3  a deck written as slides/<ch>.md goes as slides/<ch>.slides.md (the chapter's slides on Alembic), named in a note;
//   L3  a record file over Alembic's limit (4 MB brought in, 16 MB brought back) is reported.
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
import { VERIFICATION_DIR, recordDispatch } from "../scripts/lib/verify/dispatch.mjs";
import { exportSite, logParts, ROLL_BYTES } from "../scripts/lib/core/site_export.mjs";
import { prepareSend } from "../scripts/lib/core/alembic_transfer.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "alembic_transfer.mjs");
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const tmp = (t, name) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `coursewerk-transfer-audit-${name}-`)); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const unzip = (t, zip) => { const d = tmp(t, "unzipped"); const r = spawnSync("unzip", ["-q", zip, "-d", d], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return d; };
const listed = (zip) => spawnSync("unzip", ["-Z1", zip], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
const H = { role: "harness", name: "test" };
const review = (root, unit, text) => {
  const prompt = `${"You are a blind reviewer. ".repeat(30)}\nReply with JSON only, nonce ${unit}.\nPASSAGE\n${text}\n`;
  return recordDispatch(root, { kind: "knowledge", unit, factHash: sha256(text), contentHash: sha256(text), bundle: { nonce: unit, prompt, bundleHash: sha256(prompt) }, answer: { mode: "replay", raw: JSON.stringify({ nonce: unit, concerns: [] }) } });
};
const V = (root) => path.join(root, VERIFICATION_DIR);
const read = (f) => fs.readFileSync(f, "utf8");

/** A course in Alembic's layout (monthly .jsonl review parts) whose one LOG.jsonl has grown past ROLL_BYTES, as the
 *  General Chemistry copy (temp/genchem-update-2026-11-01) holds it: no hand-out note, so it is brought in. */
function largeLogSite(t) {
  const src = tmp(t, "src");
  fs.mkdirSync(path.join(src, "private/coursewerk"), { recursive: true });
  appendLogRecord(src, { type: "intake", party: H, payload: { n: 1 } });
  review(src, "u-a", "Water boils at one hundred degrees Celsius at one atmosphere.");
  review(src, "u-b", "Ice melts at zero degrees Celsius at one atmosphere.");
  const big = "x".repeat(400 * 1024);
  for (let i = 0; i < 10; i++) appendLogRecord(src, { type: "intake", party: H, payload: { i, big } });
  const folder = path.join(tmp(t, "course"), "gases");
  exportSite(src, folder);
  // the log joined back into one LOG.jsonl (> ROLL_BYTES), the review records left in their monthly parts
  const log = readLogText(src);
  assert.ok(Buffer.byteLength(log) > ROLL_BYTES);
  for (const f of fs.readdirSync(path.join(folder, "private/coursewerk"))) if (/^LOG(\.\d+)?\.jsonl$/.test(f)) fs.rmSync(path.join(folder, "private/coursewerk", f));
  fs.writeFileSync(path.join(folder, "private/coursewerk/LOG.jsonl"), log);
  fs.writeFileSync(path.join(folder, "alembic.json"), JSON.stringify({ title: "Gases", units: [{ slug: "gases", title: "Gases" }] }));
  fs.mkdirSync(path.join(folder, "study-guide"), { recursive: true });
  fs.writeFileSync(path.join(folder, "study-guide/gases.md"), "# Gases\n");
  assert.ok(fs.readdirSync(V(folder)).every((f) => f.endsWith(".jsonl")));
  return folder;
}
const logOf = (z) => fs.readdirSync(path.join(z, "private/coursewerk")).filter((f) => /^LOG(\.\d+)?\.jsonl$/.test(f)).sort((a, b) => (Number(/\.(\d+)\./.exec(a)?.[1] || 1) - Number(/\.(\d+)\./.exec(b)?.[1] || 1))).map((f) => read(path.join(z, "private/coursewerk", f))).join("");

test("[req.host.alembic-transfer] audit M1: a course in Alembic's layout with a large log keeps its review parts; only the log is cut", (t) => {
  const folder = largeLogSite(t);
  const parts = Object.fromEntries(fs.readdirSync(V(folder)).map((f) => [f, read(path.join(V(folder), f))]));
  const log = read(path.join(folder, "private/coursewerk/LOG.jsonl"));
  const r = prepareSend(folder, { out: tmp(t, "zips") });
  assert.equal(r.mode, "bring-in"); assert.deepEqual(r.records, { log: 13, reviews: 2, logged: 2 });
  const z = unzip(t, r.zip);
  assert.deepEqual(Object.fromEntries(fs.readdirSync(V(z)).map((f) => [f, read(path.join(V(z), f))])), parts, "the review parts go byte for byte");
  assert.ok(fs.existsSync(path.join(z, "private/coursewerk/LOG.2.jsonl")), "the log is cut into parts");
  for (const f of fs.readdirSync(path.join(z, "private/coursewerk")).filter((x) => x.startsWith("LOG"))) assert.ok(fs.statSync(path.join(z, "private/coursewerk", f)).size <= ROLL_BYTES, f);
  assert.equal(logOf(z), log, "the parts joined are the log byte for byte");
  assert.equal(checkRecords(z, { records: true }).ok, true);
});

test("[req.host.alembic-transfer] [req.records.site-export] audit M1: new one-file records beside the parts are appended to them; a log already in parts stays as cut", (t) => {
  const folder = largeLogSite(t);
  const before = Object.fromEntries(fs.readdirSync(V(folder)).map((f) => [f, read(path.join(V(folder), f))]));
  const c = review(folder, "u-c", "Gold melts at one thousand and sixty-four degrees Celsius.");
  assert.ok(fs.existsSync(path.join(V(folder), `${c.dispatch}.json`)));
  const r = prepareSend(folder, { out: tmp(t, "zips") });
  assert.deepEqual(r.records, { log: 14, reviews: 3, logged: 3 });
  const z = unzip(t, r.zip);
  assert.ok(fs.readdirSync(V(z)).every((f) => f.endsWith(".jsonl")), "the new record is wrapped onto a part");
  for (const [f, text] of Object.entries(before)) assert.ok(read(path.join(V(z), f)).startsWith(text), `${f}: append-only`);
  // the log already in Alembic's parts (LOG.jsonl, LOG.2.jsonl), the new record still one file: the parts go as they are
  const priv = path.join(folder, "private/coursewerk"), joined = read(path.join(priv, "LOG.jsonl"));
  fs.rmSync(path.join(priv, "LOG.jsonl"));
  const cut = logParts(joined);
  for (const [rel, text] of Object.entries(cut)) fs.writeFileSync(path.join(priv, rel), text);
  const r2 = prepareSend(folder, { out: tmp(t, "zips2") });
  const z2 = unzip(t, r2.zip);
  for (const [rel, text] of Object.entries(cut)) assert.equal(read(path.join(z2, "private/coursewerk", rel)), text, rel);
  assert.equal(checkRecords(z2, { records: true }).ok, true);
  // the site export of such a folder keeps the parts too (site_export verificationLines)
  const s = tmp(t, "site");
  exportSite(folder, s);
  for (const [f, text] of Object.entries(before)) assert.ok(read(path.join(V(s), f)).startsWith(text), `site export ${f}`);
  assert.equal(checkRecords(s, { records: true }).ok, true, checkRecords(s, { records: true }).problems.join("\n"));
});

test("[req.host.alembic-transfer] audit M2: hidden files stay home, but Alembic's hand-out note and Coursewerk's host record", (t) => {
  const root = path.join(tmp(t, "pkg"), "c2");
  fs.cpSync(C2, root, { recursive: true });
  const put = (rel, text = "x") => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  put(".env", "API_KEY=secret"); put(".claude/settings.local.json", "{}"); put(".vscode/settings.json", "{}");
  put("study-guide/.notes.md"); put(".alembic/other.json", "{}"); put("private/coursewerk/.scratch");
  const r = prepareSend(root, { out: tmp(t, "zips") });
  const names = listed(r.zip);
  assert.deepEqual(names.filter((n) => n.split("/").some((s) => s.startsWith("."))), [], names.join("\n"));
  assert.match(r.warnings.join("\n"), /hidden file\(s\) or folder\(s\) left out \(.*\.claude.*\.env/);
  assert.ok(!r.warnings.join("\n").includes(".git,"), "a .git folder is left out silently, as before");
});

test("[req.host.alembic-transfer] audit M3: a deck under its old name goes as the chapter's deck, and the note names it", (t) => {
  const root = path.join(tmp(t, "pkg"), "c2");
  fs.cpSync(C2, root, { recursive: true });
  assert.ok(fs.existsSync(path.join(root, "slides/le-chatelier.md")));
  const before = read(path.join(root, "slides/le-chatelier.md"));
  const r = spawnSync(process.execPath, [CLI, "send", "--root", root, "--out", tmp(t, "zips")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Note: 2 deck\(s\) go under the name Alembic gives a chapter's deck: slides\/chemical-equilibrium\.md as slides\/chemical-equilibrium\.slides\.md, slides\/le-chatelier\.md as slides\/le-chatelier\.slides\.md/);
  const zip = /Ready to send: (\S+) /.exec(r.stdout)[1];
  const z = unzip(t, zip);
  assert.deepEqual(fs.readdirSync(path.join(z, "slides")).sort(), ["chemical-equilibrium.slides.md", "le-chatelier.slides.md"]);
  assert.equal(read(path.join(z, "slides/le-chatelier.slides.md")), before, "the text unchanged");
  assert.ok(fs.existsSync(path.join(root, "slides/le-chatelier.md")), "the folder itself unchanged");
  const attribution = path.join(z, "provenance/coursewerk/ATTRIBUTION.md");
  if (fs.existsSync(attribution)) assert.doesNotMatch(read(attribution), /slides\/(chemical-equilibrium|le-chatelier)\.md(?![\w.])/);
  // a deck that already has its .slides.md beside it is not renamed over it
  fs.writeFileSync(path.join(root, "slides/le-chatelier.slides.md"), before);
  const j = prepareSend(root, { out: tmp(t, "zips2") });
  assert.deepEqual(j.renamed, [{ from: "slides/chemical-equilibrium.md", to: "slides/chemical-equilibrium.slides.md" }]);
});

test("[req.host.alembic-transfer] audit L3: a record file over Alembic's limit is reported (4 MB brought in)", (t) => {
  const folder = largeLogSite(t);
  fs.mkdirSync(path.join(folder, "private/coursewerk/evidence"), { recursive: true });
  fs.writeFileSync(path.join(folder, "private/coursewerk/evidence/big.json"), JSON.stringify({ x: "y".repeat(4_100_000) }));
  fs.writeFileSync(path.join(folder, "private/coursewerk/evidence/fits.json"), JSON.stringify({ x: "y".repeat(3_900_000) }));
  const r = prepareSend(folder, { out: tmp(t, "zips") });
  assert.match(r.warnings.join("\n"), /private\/coursewerk\/evidence\/big\.json is 3\.9 MB: Alembic leaves out a record file over 4 MB/);
  assert.doesNotMatch(r.warnings.join("\n"), /fits\.json/);
});
