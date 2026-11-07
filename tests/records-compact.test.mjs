// Compact review records (req.records.compact-review, owner 2026-11-07). A record written since stores the large,
// repeated blocks of its prompt (the instructions; an alignment review's chapter plan) once, by content hash, in
// verification/parts/, and keeps its prompt as promptParts. These tests hold the promises: the log binds exactly what
// the reviewer was shown (byte for byte, the same hashes a whole record has); a record written before reads as it
// always did; every reader gets the same answers from a compact record as from the same record stored whole; and a
// missing or altered part makes the record unreadable, a blocking defect — never "no problem". Offline, replayed answers.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { loadUnits, unreviewedKnowledge } from "../scripts/lib/core/obligations.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { createSnapshot } from "../scripts/lib/skeleton/snapshot.mjs";
import { PARTS_DIR, VERIFICATION_DIR, boundRecord, dispatchLogEntry, expandDispatch, loadDispatch, readDispatchFile, readDispatches, recordHashOf, replayVerifier, sharedBlocks } from "../scripts/lib/verify/dispatch.mjs";
import { verifyKnowledge } from "../scripts/lib/verify/verdicts.mjs";
import { currentReviewsAt, reviewAlignment, shownToReview } from "../scripts/lib/verify/alignment.mjs";
import { issueHistory } from "../scripts/lib/core/history.mjs";
import { parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { sha256 } from "../scripts/lib/records/canonical.mjs";
import { verificationLines } from "../scripts/lib/core/site_export.mjs";
import { isHarnessRecord } from "../scripts/lib/core/shipped.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const git = (root, ...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });
const FALSE = "u-study-guide-le-chatelier-the-principle-1";
const Q1 = "u-practice-le-chatelier-questions-1";
const VER = (root) => path.join(root, VERIFICATION_DIR);
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];

/** A fresh copy of the real course, under git so the log check is live. */
function course(t, from = C2) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-compact-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  fs.cpSync(from, root, { recursive: true }); fs.cpSync(INPUTS, inputs, { recursive: true });
  if (!fs.existsSync(path.join(root, ".git"))) { git(root, "init", "-q", "-b", "main"); git(root, "add", "-A"); git(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "baseline"); }
  return { root, inputs, r: () => liveReader(root), gate: () => runGate(root, { inputsDir: inputs }), units: () => loadUnits(root, liveReader(root)) };
}
const sig = (f) => `${f.module}|${f.kind}|${f.statusClass}|${[...(f.units || [])].sort().join(",")}|${JSON.stringify(f.evidence?.dispatch ?? f.evidence?.what ?? f.evidence?.rule ?? "")}`;
const sigs = (findings) => findings.map(sig).sort();

// replayed reviewers: a clean knowledge review; an alignment review that says "yes" to every declared item
const cleanKnowledge = replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [] }));
const yesAlignment = replayVerifier((pr) => {
  const declared = pr.split("\nDECLARED ITEMS\n")[1].split("\n\n")[0].split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
  const one = /its assessment guide entry asks for:/.test(pr), many = /linked to several assessment guide entries/.test(pr);
  const ids = many ? [...pr.matchAll(/^- (guide\.\S+): /gm)].map((m) => m[1]) : [];
  return { nonce: nonceOf(pr), links: declared.map((id) => ({ id, verdict: "yes", why: "" })), also: [], offPlan: false,
    ...(one ? { fidelity: { type: "matches", level: "matches", why: "" } } : many ? { fidelity: ids.map((id) => ({ id, type: "matches", level: "matches", why: "" })) } : {}) };
});

/** Review a few units in both ways the harness records reviews; returns the new dispatch ids. */
async function reviewSome(c) {
  const before = new Set(fs.readdirSync(VER(c.root)));
  const teach = c.units().filter((u) => u.judgment?.includes("knowledge-based")).slice(0, 3).map((u) => u.id);
  await verifyKnowledge(c.root, c.r(), { verifier: cleanKnowledge, only: teach });
  await reviewAlignment(c.root, c.r(), { verifier: yesAlignment, only: [FALSE, Q1] });
  return { teach, dispatches: fs.readdirSync(VER(c.root)).filter((f) => f.endsWith(".json") && !before.has(f)).map((f) => f.slice(0, -5)) };
}
/** Store every compact record of a package whole (as recordDispatch wrote records before), and drop the store. */
function storeWhole(root) {
  for (const f of fs.readdirSync(VER(root)).filter((x) => x.endsWith(".json"))) fs.writeFileSync(path.join(VER(root), f), JSON.stringify(loadDispatch(root, path.join(VER(root), f)), null, 2) + "\n");
  fs.rmSync(path.join(root, PARTS_DIR), { recursive: true, force: true });
}
const partFiles = (root) => fs.existsSync(path.join(root, PARTS_DIR)) ? fs.readdirSync(path.join(root, PARTS_DIR)) : [];

test("[req.records.compact-review] a new record stores its instructions and chapter plan once; it reads back byte for byte, and the log binds the whole record", async (t) => {
  const c = course(t);
  const { dispatches } = await reviewSome(c);
  const log = parseLog(readLogText(c.root)).filter((l) => l.type === "dispatch");
  assert.ok(dispatches.length >= 4, `knowledge and alignment records were written (${dispatches.length})`);
  for (const d of dispatches) {
    const stored = JSON.parse(fs.readFileSync(path.join(VER(c.root), `${d}.json`), "utf8"));
    assert.ok(Array.isArray(stored.bundle.promptParts) && !("prompt" in stored.bundle), `${d} is stored compact`);
    assert.ok(stored.bundle.promptParts.some((x) => typeof x === "object" && /^[0-9a-f]{64}$/.test(x.part)), `${d} refers to a shared part`);
    const rec = readDispatchFile(c.root, d), entry = log.find((l) => l.payload.dispatch === d);
    // what the reviewer was shown, put back exactly: the logged bundleHash is over it
    assert.equal(sha256(rec.bundle.prompt), entry.payload.bundleHash);
    assert.equal(rec.bundle.bundleHash, entry.payload.bundleHash);
    assert.ok(!("promptParts" in rec.bundle));
    // the log's recordHash is over the whole record, as it reads: the same hash a record stored whole has
    assert.equal(recordHashOf(rec), entry.payload.recordHash);
    assert.ok(dispatchLogEntry(rec, log), `${d} is vouched for by the log`);
    assert.equal(boundRecord(rec, log)?.hashed, true);
    // and it is smaller on disk
    assert.ok(Buffer.byteLength(JSON.stringify(stored, null, 2)) < Buffer.byteLength(JSON.stringify(rec, null, 2)), `${d} shrank`);
  }
  // an alignment record's plan block is a part; two reviews of one chapter share it
  const al = dispatches.map((d) => readDispatchFile(c.root, d)).filter((r) => r.kind === "alignment");
  assert.ok(al.length >= 2);
  const planOf = (r) => sharedBlocks(r.bundle.prompt).find((b) => b.startsWith("THE CHAPTER'S PLAN\n"));
  assert.ok(planOf(al[0]) && planOf(al[0]) === planOf(al[1]), "the chapter plan is one shared block");
  assert.ok(partFiles(c.root).includes(`${sha256(planOf(al[0]))}.json`), "stored once, named by its hash");
  assert.ok(shownToReview(al[0]).plan?.size > 0, "the plan the reviewer was shown is read from the record as before");
  // a part is a harness record (never content that ships unread)
  for (const f of partFiles(c.root)) assert.ok(isHarnessRecord(`${PARTS_DIR}/${f}`), f);
  assert.ok(!isHarnessRecord(`${PARTS_DIR}/notes.json`), "only a hash-named part");
});

test("[req.records.compact-review] a record written before reads as it always did, and a compact record gives every reader the same answers as the record stored whole", async (t) => {
  const a = course(t);
  // the fixture's own records were written whole, before: they read unchanged
  const old = fs.readdirSync(VER(a.root)).filter((f) => f.endsWith(".json"));
  assert.ok(old.length > 0, "the fixture carries earlier records");
  for (const f of old) { const raw = JSON.parse(fs.readFileSync(path.join(VER(a.root), f), "utf8")); assert.deepEqual(loadDispatch(a.root, path.join(VER(a.root), f)), raw); assert.equal(expandDispatch(raw, () => { throw new Error("no store read for a whole record"); }), raw); }
  const { teach } = await reviewSome(a);
  // the same package with every record stored whole, as before this change (the same log)
  const bDir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-compact-whole-"));
  t.after(() => fs.rmSync(bDir, { recursive: true, force: true }));
  fs.cpSync(a.root, path.join(bDir, "pkg"), { recursive: true });
  const b = course(t, path.join(bDir, "pkg"));
  storeWhole(b.root);
  assert.equal(partFiles(b.root).length, 0);
  const files = (root) => fs.readdirSync(VER(root)).filter((f) => f.endsWith(".json")).map((f) => `${VERIFICATION_DIR}/${f}`);
  const read = (root) => (rel) => fs.readFileSync(path.join(root, rel), "utf8");
  assert.deepEqual(readDispatches(read(a.root), files(a.root)), readDispatches(read(b.root), files(b.root)), "readDispatches: the same records");
  const sa = createSnapshot(a.root, { profile: "public", checkpoint: "t" }), sb = createSnapshot(b.root, { profile: "public", checkpoint: "t" });
  assert.deepEqual(readDispatches(sa.text, sa.paths), readDispatches(sb.text, sb.paths), "through the gate's snapshot too");
  assert.deepEqual(unreviewedKnowledge(a.root, a.r()), unreviewedKnowledge(b.root, b.r()), "unreviewedKnowledge");
  assert.ok(!unreviewedKnowledge(a.root, a.r()).some((id) => teach.includes(id)), "the compact reviews count as reviews");
  const cur = (c) => JSON.stringify([...currentReviewsAt(c.root, c.r(), c.units())].map(([k, v]) => [k, v?.dispatch ?? v]).sort());
  assert.equal(cur(a), cur(b), "the current link reviews");
  assert.deepEqual(issueHistory(a.root, a.units()), issueHistory(b.root, b.units()), "the issue history");
  assert.deepEqual(sigs(a.gate().findings), sigs(b.gate().findings), "the gate: the same findings");
});

test("[req.records.compact-review] a shared part missing or altered makes the record unreadable: a blocking defect, and its review no longer counts", async (t) => {
  const c = course(t);
  const { teach, dispatches } = await reviewSome(c);
  const base = sigs(c.gate().findings);
  assert.ok(!base.some((s) => /dispatch-(record-missing|unlogged)/.test(s)), "clean to begin with");
  const k = dispatches.map((d) => readDispatchFile(c.root, d)).find((r) => r.kind === "knowledge" && teach.includes(r.unit));
  const stored = JSON.parse(fs.readFileSync(path.join(VER(c.root), `${k.dispatch}.json`), "utf8"));
  const part = stored.bundle.promptParts.find((x) => typeof x === "object").part, pf = path.join(c.root, PARTS_DIR, `${part}.json`);
  const original = fs.readFileSync(pf, "utf8");
  const missing = (findings) => findings.filter((f) => f.kind === "dispatch-record-missing").length;

  // altered: one word of the instructions changed (the part's own sha256 field left as it was, or set to match)
  const p = JSON.parse(original); p.text = p.text.replace("errors of fact or concept", "errors of style");
  fs.writeFileSync(pf, JSON.stringify(p, null, 2) + "\n");
  assert.throws(() => readDispatchFile(c.root, k.dispatch), /missing or altered/);
  assert.ok(missing(c.gate().findings) > 0, "an altered part: the records using it are unreadable, a defect");
  assert.ok(unreviewedKnowledge(c.root, c.r()).includes(k.unit), "and the review no longer counts");
  fs.writeFileSync(pf, JSON.stringify({ ...p, sha256: sha256(p.text) }, null, 2) + "\n");
  assert.throws(() => readDispatchFile(c.root, k.dispatch), /missing or altered/, "a part is named by its content: another text cannot stand in");

  // missing
  fs.rmSync(pf);
  assert.throws(() => readDispatchFile(c.root, k.dispatch), /missing or altered/);
  const s = createSnapshot(c.root, { profile: "public", checkpoint: "t" });
  assert.ok(!readDispatches(s.text, s.paths).some((r) => r.dispatch === k.dispatch), "readDispatches leaves it out, as a missing record");
  assert.ok(missing(c.gate().findings) > 0);
  assert.ok(unreviewedKnowledge(c.root, c.r()).includes(k.unit));

  // restored exactly: readable again
  fs.writeFileSync(pf, original);
  assert.equal(sha256(readDispatchFile(c.root, k.dispatch).bundle.prompt), k.bundle.bundleHash);
  assert.equal(missing(c.gate().findings), 0);

  // the record's own literal text altered: the prompt no longer hashes to its bundleHash
  const edited = JSON.parse(JSON.stringify(stored)); const i = edited.bundle.promptParts.findIndex((x) => typeof x === "string" && x.includes("PASSAGE"));
  edited.bundle.promptParts[i] = edited.bundle.promptParts[i].replace("PASSAGE", "PASSAGE ");
  fs.writeFileSync(path.join(VER(c.root), `${k.dispatch}.json`), JSON.stringify(edited, null, 2) + "\n");
  assert.throws(() => readDispatchFile(c.root, k.dispatch), /bundleHash/);
  assert.ok(missing(c.gate().findings) > 0);
  // both a prompt and promptParts: refused, never read either way
  fs.writeFileSync(path.join(VER(c.root), `${k.dispatch}.json`), JSON.stringify({ ...stored, bundle: { ...stored.bundle, prompt: k.bundle.prompt } }, null, 2) + "\n");
  assert.throws(() => readDispatchFile(c.root, k.dispatch), /both a prompt and promptParts/);
});

test("[req.records.compact-review] the shared parts travel with the records to an Alembic site and back", async (t) => {
  const c = course(t);
  await reviewSome(c);
  const lines = verificationLines(c.root);
  const files = Object.values(lines).join("").split("\n").filter(Boolean).map((l) => JSON.parse(l).file);
  for (const f of partFiles(c.root)) assert.ok(files.includes(`parts/${f}`), `parts/${f} is in the site's verification parts`);
  // a whole round trip through the site layout (export → import) reads the same records
  const { exportSite } = await import("../scripts/lib/core/site_export.mjs");
  const { importSite } = await import("../scripts/lib/core/site_host.mjs");
  const site = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-compact-site-"));
  t.after(() => fs.rmSync(site, { recursive: true, force: true }));
  for (const rel of ["alembic.json", "concepts", "study-guide", "slides", "practice", "assessment-support"]) if (fs.existsSync(path.join(c.root, rel))) fs.cpSync(path.join(c.root, rel), path.join(site, rel), { recursive: true });
  exportSite(c.root, site);
  importSite(site);
  const rel = (root) => fs.readdirSync(VER(root)).filter((f) => f.endsWith(".json")).map((f) => `${VERIFICATION_DIR}/${f}`);
  const read = (root) => (r) => fs.readFileSync(path.join(root, r), "utf8");
  assert.deepEqual(readDispatches(read(site), rel(site)), readDispatches(read(c.root), rel(c.root)));
  assert.deepEqual(partFiles(site).sort(), partFiles(c.root).sort());
});
