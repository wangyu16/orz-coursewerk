// Independent audit of branch records-compact (req.records.compact-review, req.records.chain-check), closed-loop round 1,
// 2026-11-07. The probes that held are kept as regression tests; LOW-1 (stray files under verification/) and LOW-2 (an
// empty decision log reported ok) failed on 91e77b1 and pass since their fix.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { loadUnits } from "../scripts/lib/core/obligations.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { PARTS_DIR, VERIFICATION_DIR, dispatchLogEntry, readDispatchFile, readDispatches, replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { verifyKnowledge } from "../scripts/lib/verify/verdicts.mjs";
import { reviewAlignment } from "../scripts/lib/verify/alignment.mjs";
import { appendLogRecord, parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { sha256 } from "../scripts/lib/records/canonical.mjs";
import { checkRecords } from "../scripts/lib/records/records_check.mjs";
import { exportSite } from "../scripts/lib/core/site_export.mjs";
import { handbackSite, importSite } from "../scripts/lib/core/site_host.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const git = (root, ...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });
const VER = (root) => path.join(root, VERIFICATION_DIR);
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];
const clean = replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [] }));
const yes = replayVerifier((pr) => {
  const declared = pr.split("\nDECLARED ITEMS\n")[1].split("\n\n")[0].split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
  const one = /its assessment guide entry asks for:/.test(pr), many = /linked to several assessment guide entries/.test(pr);
  const ids = many ? [...pr.matchAll(/^- (guide\.\S+): /gm)].map((m) => m[1]) : [];
  return { nonce: nonceOf(pr), links: declared.map((id) => ({ id, verdict: "yes", why: "" })), also: [], offPlan: false,
    ...(one ? { fidelity: { type: "matches", level: "matches", why: "" } } : many ? { fidelity: ids.map((id) => ({ id, type: "matches", level: "matches", why: "" })) } : {}) };
});

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-compact-audit-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  fs.cpSync(C2, root, { recursive: true }); fs.cpSync(INPUTS, inputs, { recursive: true });
  if (!fs.existsSync(path.join(root, ".git"))) { git(root, "init", "-q", "-b", "main"); git(root, "add", "-A"); git(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "baseline"); }
  return { dir, root, inputs };
}
async function review(root) {
  const before = new Set(fs.readdirSync(VER(root)));
  const units = loadUnits(root, liveReader(root));
  await verifyKnowledge(root, liveReader(root), { verifier: clean, only: units.filter((u) => u.judgment?.includes("knowledge-based")).slice(0, 2).map((u) => u.id) });
  await reviewAlignment(root, liveReader(root), { verifier: yes, only: ["u-study-guide-le-chatelier-the-principle-1", "u-practice-le-chatelier-questions-1"] });
  return fs.readdirSync(VER(root)).filter((f) => f.endsWith(".json") && !before.has(f)).map((f) => f.slice(0, -5));
}
const files = (root) => fs.readdirSync(VER(root)).filter((f) => f.endsWith(".json")).map((f) => `${VERIFICATION_DIR}/${f}`);
const reader = (root) => (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("[req.records.compact-review] audit: no forged, re-ordered or mis-shaped promptParts / part is read as a vouched record", async (t) => {
  const c = course(t);
  const ds = await review(c.root);
  const log = parseLog(readLogText(c.root));
  const al = ds.map((d) => [d, JSON.parse(fs.readFileSync(path.join(VER(c.root), `${d}.json`), "utf8"))]).filter(([, s]) => s.kind === "alignment");
  const [d, stored] = al[0];
  const recFile = path.join(VER(c.root), `${d}.json`), original = fs.readFileSync(recFile, "utf8");
  const readable = (s) => { fs.writeFileSync(recFile, JSON.stringify(s, null, 2) + "\n"); try { return dispatchLogEntry(readDispatchFile(c.root, d), log) != null; } catch { return false; } finally { fs.writeFileSync(recFile, original); } };
  assert.equal(readable(stored), true, "baseline");
  const pp = stored.bundle.promptParts, at = pp.findIndex((x) => typeof x === "object");
  const variants = {
    reordered: [...pp].reverse(),
    extraKey: pp.map((x, i) => (i === at ? { ...x, note: "x" } : x)),
    upperHash: pp.map((x, i) => (i === at ? { part: x.part.toUpperCase() } : x)),
    numberEntry: [...pp, 0],
    arrayEntry: pp.map((x, i) => (i === at ? [x.part] : x)),
    // the part swapped for another real part (one another record uses)
    otherPart: pp.map((x, i) => (i === at ? { part: fs.readdirSync(path.join(c.root, PARTS_DIR)).map((f) => f.slice(0, -5)).find((h) => h !== x.part) } : x)),
    // the part inlined as literal text but one char changed (NFC/NFD, CRLF)
    crlf: pp.map((x, i) => (i === at ? JSON.parse(fs.readFileSync(path.join(c.root, PARTS_DIR, `${x.part}.json`), "utf8")).text.replace(/\n/g, "\r\n") : x)),
    nfd: pp.map((x, i) => (i === at ? JSON.parse(fs.readFileSync(path.join(c.root, PARTS_DIR, `${x.part}.json`), "utf8")).text.normalize("NFD") + "́" : x)),
  };
  for (const [k, v] of Object.entries(variants)) assert.equal(readable({ ...stored, bundle: { ...stored.bundle, promptParts: v } }), false, k);
  // the part inlined exactly as literal text: the same prompt, the same whole record — vouched (no difference to read)
  const inl = pp.map((x) => (typeof x === "object" ? JSON.parse(fs.readFileSync(path.join(c.root, PARTS_DIR, `${x.part}.json`), "utf8")).text : x));
  assert.equal(readable({ ...stored, bundle: { ...stored.bundle, promptParts: inl } }), true, "inlined exactly reads as the same record");
  // a part file whose sha256 field lies, or whose name is not its text's hash
  const pf = path.join(c.root, PARTS_DIR, `${pp[at].part}.json`), pOrig = fs.readFileSync(pf, "utf8"), p = JSON.parse(pOrig);
  for (const bad of [{ ...p, sha256: "0".repeat(64) }, { ...p, kind: "other" }, { ...p, text: p.text + " " }, { ...p, text: p.text + " ", sha256: sha256(p.text + " ") }]) {
    fs.writeFileSync(pf, JSON.stringify(bad)); assert.equal(readable(stored), false, JSON.stringify(Object.keys(bad))); fs.writeFileSync(pf, pOrig);
  }
});

test("[req.records.compact-review] audit: parts created in an Alembic job are handed back append-only and re-import to the same records", async (t) => {
  const c = course(t);
  await review(c.root);
  const site = path.join(c.dir, "site");
  for (const rel of ["alembic.json", "concepts", "study-guide", "slides", "practice", "assessment-support"]) if (fs.existsSync(path.join(c.root, rel))) fs.cpSync(path.join(c.root, rel), path.join(site, rel), { recursive: true });
  exportSite(c.root, site);
  const held = new Map(fs.readdirSync(path.join(site, VERIFICATION_DIR)).map((f) => [f, fs.readFileSync(path.join(site, VERIFICATION_DIR, f), "utf8")]));
  importSite(site);
  // the job: new reviews, so new records and possibly new parts (a knowledge part already exists; new chapter plan?)
  const units = loadUnits(site, liveReader(site));
  await verifyKnowledge(site, liveReader(site), { verifier: clean, only: units.filter((u) => u.judgment?.includes("knowledge-based")).slice(5, 7).map((u) => u.id) });
  const pname = fs.readdirSync(path.join(site, PARTS_DIR))[0], pfile = path.join(site, PARTS_DIR, pname), keep = fs.readFileSync(pfile);
  fs.rmSync(pfile); // can a part be dropped?
  assert.throws(() => handbackSite(site), /append-only/, "a part imported from the site cannot be removed in a job");
  fs.writeFileSync(pfile, keep);
  const working = readDispatches(reader(site), files(site));
  handbackSite(site);
  // every .jsonl Alembic held is a byte prefix of what comes back (pure appends), and nothing but .jsonl is left there
  for (const [f, text] of held) assert.ok(fs.readFileSync(path.join(site, VERIFICATION_DIR, f), "utf8").startsWith(text), f);
  assert.deepEqual(fs.readdirSync(path.join(site, VERIFICATION_DIR)).filter((f) => !f.endsWith(".jsonl")), [], "only .jsonl parts are handed back");
  importSite(site);
  assert.deepEqual(readDispatches(reader(site), files(site)), working, "re-imported: the same records, compact ones whole");
});

test("[req.records.compact-review] audit LOW-1: a stray file under a folder of verification/ (a copied record, a non-hash 'part') is a blocking defect; a hash-named part is not", async (t) => {
  const c = course(t);
  const v = VER(c.root), one = fs.readdirSync(v).find((f) => f.endsWith(".json"));
  fs.mkdirSync(path.join(v, "sub"), { recursive: true });
  fs.writeFileSync(path.join(v, "sub", "d-stray0000000001.json"), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(v, one), "utf8")), dispatch: "d-stray0000000001" }));
  fs.mkdirSync(path.join(c.root, PARTS_DIR), { recursive: true });
  fs.writeFileSync(path.join(c.root, PARTS_DIR, "notes.json"), "{}");
  // v1.0.4 reported each as dispatch-unlogged (a verification record no logged dispatch vouches for)
  const f = runGate(c.root, { inputsDir: c.inputs }).findings.filter((x) => x.kind === "dispatch-unlogged");
  const named = f.map((x) => x.evidence?.file).filter(Boolean).sort();
  assert.deepEqual(named, [`${PARTS_DIR}/notes.json`, `${VERIFICATION_DIR}/sub/d-stray0000000001.json`], "each unknown file in the verification records is reported");
  assert.ok(f.every((x) => x.statusClass === "defect"));
  // a real part (hash-named) is no stray: after a review writes parts, only the two strays are reported
  await review(c.root);
  assert.ok(fs.readdirSync(path.join(c.root, PARTS_DIR)).some((x) => /^[0-9a-f]{64}\.json$/.test(x)));
  const g = runGate(c.root, { inputsDir: c.inputs }).findings.filter((x) => x.kind === "dispatch-unlogged");
  assert.deepEqual(g.map((x) => x.evidence?.file).filter(Boolean).sort(), named);
  assert.equal(g.filter((x) => !x.evidence?.file).length, 0, "and no record is unlogged");
});

test("[req.records.chain-check] audit LOW-2: an empty decision log (0 records) checked alone is refused; an empty earlier log may still be continued", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-rc-audit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "private/coursewerk"), { recursive: true });
  fs.writeFileSync(path.join(root, "private/coursewerk/LOG.jsonl"), "");
  const r = checkRecords(root);
  assert.equal(r.ok, false, `an empty decision log is not a log that verifies (got ok with ${r.log.records} records)`);
  assert.match(r.problems.join(" "), /holds no records/);
  appendLogRecord(root, { type: "checkpoint", party: { role: "harness", name: "t" }, payload: { n: 1 } });
  assert.equal(checkRecords(root).ok, true, "one record verifies");
  assert.equal(checkRecords(root, { extends: "" }).ok, true, "and continues an empty earlier log");
});

test("[req.records.chain-check] audit: records_check never says ok for a log that does not extend (part-boundary cut, middle part missing, duplicate part, dup tail)", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-rc-audit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, "private/coursewerk"); fs.mkdirSync(dir, { recursive: true });
  for (let k = 1; k <= 6; k++) appendLogRecord(root, { type: "checkpoint", party: { role: "harness", name: "t" }, payload: { n: k } });
  const full = readLogText(root), L = full.split(/(?<=\n)/);
  const layout = (parts) => { for (const f of fs.readdirSync(dir).filter((x) => /^LOG/.test(x))) fs.rmSync(path.join(dir, f)); parts.forEach(([n, t]) => fs.writeFileSync(path.join(dir, n), t)); };
  layout([["LOG.jsonl", L.slice(0, 2).join("")], ["LOG.2.jsonl", L.slice(2, 4).join("")]]);
  assert.equal(checkRecords(root, { extends: full }).ok, false, "last part missing");
  layout([["LOG.jsonl", L.slice(0, 2).join("")], ["LOG.3.jsonl", L.slice(4).join("")]]);
  assert.equal(checkRecords(root, { extends: L.slice(0, 2).join("") }).ok, false, "middle part missing");
  layout([["LOG.jsonl", L.slice(0, 3).join("")], ["LOG.2.jsonl", L.slice(3).join("")], ["LOG.02.jsonl", L.slice(3).join("")]]);
  assert.equal(checkRecords(root).ok, false, "duplicate part number");
  layout([["LOG.jsonl", full], ["LOG.2.jsonl", L.at(-1)]]);
  assert.equal(checkRecords(root).ok, false, "a stale extra part repeating the tail");
  layout([["LOG.jsonl", full]]);
  assert.equal(checkRecords(root, { extends: full.slice(0, -1) }).ok, false, "an earlier log cut inside its last line");
});
