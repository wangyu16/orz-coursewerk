// Independent audit of branch records-compact, closed-loop round 2 (2026-11-07). Probes of round 1's fixes (LOW-1 stray
// files under verification/, LOW-2 empty logs) and a fresh pass. The probes that held are kept as regression tests; LOW-A
// (a file under a part's name that is not that part), LOW-B (an empty log continuing an empty one) and LOW-C (a failed
// part write leaving its temp file) failed on d5e9324 and pass since their fix.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { loadUnits } from "../scripts/lib/core/obligations.mjs";
import { createSnapshot } from "../scripts/lib/skeleton/snapshot.mjs";
import ms8 from "../scripts/modules/ms8-verdicts.mjs";
import { PARTS_DIR, VERIFICATION_DIR, expandDispatch, readDispatchFile, readDispatches, replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { verifyKnowledge } from "../scripts/lib/verify/verdicts.mjs";
import { reviewAlignment } from "../scripts/lib/verify/alignment.mjs";
import { appendLogRecord, readLogText } from "../scripts/lib/records/log.mjs";
import { sha256 } from "../scripts/lib/records/canonical.mjs";
import { checkRecords } from "../scripts/lib/records/records_check.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const CLI = path.join(HERE, "..", "scripts", "records_check.mjs");
const git = (root, ...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });
const VER = (root) => path.join(root, VERIFICATION_DIR);
const PARTS = (root) => path.join(root, PARTS_DIR);
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-compact-audit2-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  fs.cpSync(C2, root, { recursive: true }); fs.cpSync(INPUTS, inputs, { recursive: true });
  if (!fs.existsSync(path.join(root, ".git"))) { git(root, "init", "-q", "-b", "main"); git(root, "add", "-A"); git(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "baseline"); }
  return { dir, root, inputs };
}
async function review(root) {
  const units = loadUnits(root, liveReader(root));
  await verifyKnowledge(root, liveReader(root), { verifier: clean, only: units.filter((u) => u.judgment?.includes("knowledge-based")).slice(0, 2).map((u) => u.id) });
  await reviewAlignment(root, liveReader(root), { verifier: yes, only: ["u-study-guide-le-chatelier-the-principle-1", "u-practice-le-chatelier-questions-1"] });
}
/** ms8's dispatch-unlogged findings that name a file (stray files under verification/). */
const strays = (c) => ms8.run(createSnapshot(c.root, { inputsDir: c.inputs })).filter((f) => f.kind === "dispatch-unlogged" && f.evidence?.file).map((f) => f.evidence.file).sort();
const partFile = (text) => JSON.stringify({ schemaVersion: 1, kind: "prompt-part", sha256: sha256(text), at: "2026-11-07T00:00:00.000Z", text }, null, 2) + "\n";

// ---- round 1 LOW-1: bypasses of the stray-file rule -------------------------------------------------------------------
test("[req.records.compact-review] audit2 LOW-1 probes: mis-cased, nested, folder-shaped and upper-hex parts are each reported", (t) => {
  const c = course(t);
  const h = sha256("x".repeat(600)), H = h.toUpperCase();
  fs.mkdirSync(path.join(PARTS(c.root), "sub"), { recursive: true });
  fs.writeFileSync(path.join(PARTS(c.root), "sub", `${h}.json`), partFile("x".repeat(600)));     // parts/sub/<hex>.json
  fs.mkdirSync(path.join(PARTS(c.root), `${sha256("y")}.json`));                                   // parts/<hex>.json/ a folder
  fs.writeFileSync(path.join(PARTS(c.root), `${sha256("y")}.json`, "inner.json"), "{}");
  fs.writeFileSync(path.join(PARTS(c.root), `${sha256("z")}.JSON`), "{}");                         // upper-case extension
  fs.writeFileSync(path.join(PARTS(c.root), `${h}.json.4242.tmp`), partFile("x".repeat(600)));     // a crashed writer's temp file
  const caseInsensitive = fs.existsSync(path.join(c.root, PARTS_DIR.replace(/parts$/, "PARTS")));
  // an upper-hex name: on a case-insensitive disk it is the same file as the lower-hex one, so only probe it when distinct
  if (!caseInsensitive) fs.writeFileSync(path.join(PARTS(c.root), `${H}.json`), partFile("x".repeat(600)));
  const got = strays(c);
  for (const want of [`${PARTS_DIR}/sub/${h}.json`, `${PARTS_DIR}/${sha256("y")}.json/inner.json`, `${PARTS_DIR}/${sha256("z")}.JSON`, `${PARTS_DIR}/${h}.json.4242.tmp`, ...(caseInsensitive ? [] : [`${PARTS_DIR}/${H}.json`])])
    assert.ok(got.includes(want), `${want} reported (got ${got.join(", ")})`);
});

test("[req.records.compact-review] audit2 LOW-1 probe: a PARTS/ folder (wrong case) is reported, and a record whose part sits only there is unreadable to the gate", async (t) => {
  const c = course(t);
  await review(c.root);
  const lower = PARTS(c.root), upper = path.join(VER(c.root), "PARTS"), tmp = path.join(VER(c.root), "moving");
  fs.renameSync(lower, tmp); fs.renameSync(tmp, upper); // on a case-insensitive disk the folder is now listed as PARTS
  const got = strays(c);
  assert.ok(got.length > 0 && got.every((f) => f.startsWith(`${VERIFICATION_DIR}/PARTS/`)), `every file under PARTS/ reported (got ${got.join(", ")})`);
  const missing = ms8.run(createSnapshot(c.root, { inputsDir: c.inputs })).filter((f) => f.kind === "dispatch-record-missing");
  assert.ok(missing.length > 0, "the compact records are unreadable to the gate (fail closed), even where the disk would resolve parts/ to PARTS/");
});

test("[req.records.compact-review] audit2 LOW-A: a hash-named file under parts/ that is not a prompt part, or whose text is not its name's hash, is a blocking defect; a real part is not", (t) => {
  const c = course(t);
  fs.mkdirSync(PARTS(c.root), { recursive: true });
  const junk = sha256("junk"), lie = sha256("lie");
  fs.writeFileSync(path.join(PARTS(c.root), `${junk}.json`), JSON.stringify({ anything: "an instructor-only answer key, or 4 MB of noise" }));
  fs.writeFileSync(path.join(PARTS(c.root), `${lie}.json`), partFile("some other text"));          // valid shape, wrong name
  fs.writeFileSync(path.join(PARTS(c.root), `${sha256("bad json")}.json`), "not json at all");
  const got = strays(c);
  // ms8 checks that the file is the part its name says (dispatch.mjs readPart), not only its name
  assert.deepEqual(got, [`${PARTS_DIR}/${sha256("bad json")}.json`, `${PARTS_DIR}/${junk}.json`, `${PARTS_DIR}/${lie}.json`].sort(), "each non-part under a part's name is reported");
  const real = "a real part ".repeat(60);
  fs.writeFileSync(path.join(PARTS(c.root), `${sha256(real)}.json`), partFile(real));
  assert.deepEqual(strays(c), got, "a real part is no stray");
  assert.ok(ms8.manifest.emits.some((k) => k.kind === "dispatch-unlogged" && k.statusClass === "defect"), "dispatch-unlogged is a blocking defect");
});

// ---- round 1 LOW-2: empty logs ----------------------------------------------------------------------------------------
function logDir(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-rc-audit2-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, "private/coursewerk"); fs.mkdirSync(dir, { recursive: true });
  return { root, dir };
}
test("[req.records.chain-check] audit2 LOW-2 probes: whitespace, blank lines, a BOM and empty parts are never a log that verifies", (t) => {
  const { root, dir } = logDir(t);
  for (const text of ["\n", "\n\n\n", "   \n", " \t ", "\uFEFF", "\uFEFF\n"]) {
    fs.writeFileSync(path.join(dir, "LOG.jsonl"), text);
    const r = checkRecords(root);
    assert.equal(r.ok, false, `${JSON.stringify(text)} refused`);
    assert.equal(checkRecords(root, { extends: "" }).ok, false, `${JSON.stringify(text)} refused with --extends ""`);
  }
  // a real log behind a BOM
  fs.rmSync(path.join(dir, "LOG.jsonl"));
  appendLogRecord(root, { type: "checkpoint", party: { role: "harness", name: "t" }, payload: { n: 1 } });
  const good = fs.readFileSync(path.join(dir, "LOG.jsonl"), "utf8");
  fs.writeFileSync(path.join(dir, "LOG.jsonl"), "\uFEFF" + good);
  assert.equal(checkRecords(root).ok, false, "a BOM before the first record");
  assert.equal(checkRecords(root, { extends: good }).ok, false, "a BOM is not an extension");
  // three parts, all empty
  fs.writeFileSync(path.join(dir, "LOG.jsonl"), ""); fs.writeFileSync(path.join(dir, "LOG.2.jsonl"), ""); fs.writeFileSync(path.join(dir, "LOG.3.jsonl"), "");
  assert.equal(checkRecords(root).ok, false, "all parts empty, alone");
});

test("[req.records.chain-check] audit2 LOW-B: a log with no records is refused under --extends too, even when the earlier log is empty; a log with records continues an empty one", (t) => {
  const { root, dir } = logDir(t);
  fs.writeFileSync(path.join(dir, "LOG.jsonl"), "");
  const earlier = path.join(root, "held.jsonl"); fs.writeFileSync(earlier, "");
  const r = spawnSync(process.execPath, [CLI, "--root", root, "--extends", earlier], { encoding: "utf8" });
  assert.notEqual(r.status, 0, `a package with no decision log records is never ok (got exit ${r.status}: ${r.stdout})`);
  assert.equal(checkRecords(root, { extends: "" }).ok, false, "library: empty extends empty");
  assert.match(checkRecords(root, { extends: "" }).problems.join(" "), /holds no records/);
  appendLogRecord(root, { type: "checkpoint", party: { role: "harness", name: "t" }, payload: { n: 1 } });
  assert.equal(spawnSync(process.execPath, [CLI, "--root", root, "--extends", earlier], { encoding: "utf8" }).status, 0, "a log with records continues an empty earlier log");
});

// ---- fresh pass ---------------------------------------------------------------------------------------------------------
test("[req.records.compact-review] audit2: parts are content-addressed, never cached: two records sharing a part, a part rewritten by a racing writer (other `at`), and interleaved reads all expand to their own logged prompts", async (t) => {
  const c = course(t);
  await review(c.root);
  const files = fs.readdirSync(VER(c.root)).filter((f) => f.endsWith(".json"));
  const compact = files.map((f) => [f, JSON.parse(fs.readFileSync(path.join(VER(c.root), f), "utf8"))]).filter(([, r]) => r.bundle?.promptParts);
  assert.ok(compact.length >= 3, "several compact records");
  const uses = new Map();
  for (const [f, r] of compact) for (const x of r.bundle.promptParts) if (typeof x === "object") uses.set(x.part, [...(uses.get(x.part) || []), f]);
  assert.ok([...uses.values()].some((fs_) => fs_.length >= 2), "a part shared by two records");
  // a racing writer (another process) renames its own copy over a part: same text, another `at`
  for (const h of uses.keys()) { const pf = path.join(PARTS(c.root), `${h}.json`), p = JSON.parse(fs.readFileSync(pf, "utf8")); fs.writeFileSync(pf, JSON.stringify({ ...p, at: "2030-01-01T00:00:00.000Z" }, null, 2) + "\n"); }
  const log = readLogText(c.root).split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.type === "dispatch");
  // interleaved: each record read alone and all together, in two orders
  const all = readDispatches((rel) => fs.readFileSync(path.join(c.root, rel), "utf8"), files.map((f) => `${VERIFICATION_DIR}/${f}`));
  const rev = readDispatches((rel) => fs.readFileSync(path.join(c.root, rel), "utf8"), files.map((f) => `${VERIFICATION_DIR}/${f}`).reverse());
  assert.deepEqual(rev, all);
  for (const [f] of compact) {
    const r = readDispatchFile(c.root, f.slice(0, -5)), l = log.find((x) => x.payload.dispatch === r.dispatch);
    assert.equal(sha256(r.bundle.prompt), l.payload.bundleHash, `${f}: its own prompt`);
    assert.deepEqual(all.find((x) => x.dispatch === r.dispatch), r);
  }
  // expandDispatch with a reader that answers a different part for a name is refused (the part is checked against its name)
  const [, one] = compact[0];
  const other = [...uses.keys()].find((h) => !one.bundle.promptParts.some((x) => x.part === h));
  if (other) assert.throws(() => expandDispatch(one, (rel) => fs.readFileSync(path.join(PARTS(c.root), `${other}.json`), "utf8")), /missing or altered/);
});

test("[req.records.compact-review] audit2 LOW-C: a part write that fails leaves no temp file behind; the block stays in the record and the gate sees no stray", async (t) => {
  const c = course(t);
  // every rename of a part's temp file fails (a full disk, a permission error)
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => { if (String(from).endsWith(".tmp")) throw Object.assign(new Error("simulated rename failure"), { code: "EIO" }); return rename(from, to); };
  t.after(() => { fs.renameSync = rename; });
  const before = new Set(fs.readdirSync(VER(c.root)));
  await review(c.root);
  fs.renameSync = rename;
  const left = fs.existsSync(PARTS(c.root)) ? fs.readdirSync(PARTS(c.root)) : [];
  assert.deepEqual(left, [], "no temp file and no part is left");
  const fresh = fs.readdirSync(VER(c.root)).filter((f) => f.endsWith(".json") && !before.has(f));
  assert.ok(fresh.length >= 2);
  for (const f of fresh) {
    const stored = JSON.parse(fs.readFileSync(path.join(VER(c.root), f), "utf8"));
    assert.equal(typeof stored.bundle.prompt, "string", `${f}: the prompt stays whole in the record`);
    assert.equal(sha256(stored.bundle.prompt), stored.bundle.bundleHash);
  }
  assert.deepEqual(strays(c), [], "the gate sees no stray file");
  assert.equal(ms8.run(createSnapshot(c.root, { inputsDir: c.inputs })).filter((f) => /dispatch-(unlogged|record-missing)/.test(f.kind)).length, 0, "and every record is logged and readable");
});
