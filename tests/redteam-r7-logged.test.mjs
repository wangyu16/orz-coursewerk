// 3C RED TEAM, ROUND 7 — ONE ROOT CAUSE (D50 cause 4), fixed at the cause (operator rule D46), probed on the real course
// (tests/fixtures/c2-chemistry-v2 + c2-chemistry inputs) with new variants.
// Record of the round: the red team's REPORT.md files (P11 study, redteam-r7/coherence H-04, redteam-r7/confidence K05).
//
// The cause: state the log never wrote was trusted, and some removals were never asked about.
// The principle of the fix: only what the log wrote is trusted, and every loss of the instructor's text is asked about.
//   1. A record file the log never wrote is untrusted (core/unit_records.mjs). In a package whose log holds unit-record
//      digests, a sidecar with no logged digest (or one the log says the harness removed) is a blocking defect
//      (unit-record-altered); it is never read — not into matching, reserved ids, registers, ancestry, obligations or
//      the gate's modules — never written over and never deleted by the harness. A package whose log holds no digest
//      yet logs every sidecar on disk at its first harness write (the migration) ................... [req.records.only-logged-trusted]
//      H-04  a planted never-logged sidecar (units: [], one register entry holding a carried paragraph's next wording)
//            took the paragraph's identity; the carried record retired; the index deleted the planted file unlogged
//      variants  a planted live-unit sidecar (an orphan path, and a newly declared document's path); a planted register
//                entry in an existing sidecar; a deleted sidecar; a sidecar the harness removed, planted again
//   2. A registered instructor text that no live unit holds is asked about, however it disappeared (modules/ms8-verdicts)
//      ................................................................................................ [req.instructor-text.removal-asked]
//      K05   the instructor's registered paragraph deleted and re-indexed with no session raised nothing
//      variants  a removal by git checkout; a removal by a merge; "keep it removed" settles the question
// Offline and deterministic.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { coreObligations, indexAndStamp, linkUnits, loadUnits, openVersionCarrying } from "../scripts/lib/core/obligations.mjs";
import { beginSession, claimAuthorship, indexUnits, orphanSidecars, packageAncestry, readSidecar, unindexedFindings } from "../scripts/lib/core/units_index.mjs";
import { alteredSidecars, loggedDigests, sidecarTrust, trustedSidecarPath, unitRecordFindings, unloggedSidecars, upgradeUnitRecordDigests } from "../scripts/lib/core/unit_records.mjs";
import { segmentDeliverable, tokensOf, unitHash } from "../scripts/lib/core/segment.mjs";
import { buildDigest, answerDigest } from "../scripts/lib/core/digest.mjs";
import { unitInfoOf } from "../scripts/lib/core/workflow.mjs";
import { runCheckpoint } from "../scripts/lib/skeleton/runner.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { parseLog, readLogText, recordHash } from "../scripts/lib/records/log.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const SG = "study-guide/le-chatelier.md", SCOPE = "chapter:le-chatelier";
const X = "u-study-guide-le-chatelier-changing-the-temperature-6";
const ANCHOR = "but it also slows the rate.";
const OPEN_V2 = { scopes: [SCOPE], reason: "objective 3 is split into a qualitative and a quantitative objective", instructorWords: "Open version 2 of chapter 2." };
const MS8 = { schemaVersion: 1, __noStandard: true, modules: [{ name: "ms8-verdicts", version: "1.0.0", maturity: "stable", enabled: true }] };

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r7-logged-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  fs.cpSync(C2, root, { recursive: true }); fs.cpSync(INPUTS, inputs, { recursive: true });
  const c = {
    root, inputs, r: () => liveReader(root),
    units: () => loadUnits(root, liveReader(root)),
    unit: (id) => loadUnits(root, liveReader(root)).find((u) => u.id === id),
    find: (text) => loadUnits(root, liveReader(root)).find((u) => u.text === text),
    file: (rel) => path.join(root, rel),
    read: (rel) => fs.readFileSync(path.join(root, rel), "utf8"),
    write: (rel, s) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), s); },
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent(fn) { beginSession(root, liveReader(root), AGENT); fn(); return indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    owing: (kinds = ["reverify", "carried-unverified"]) => [...new Set(coreObligations(root, liveReader(root), "t").filter((f) => kinds.includes(f.kind)).flatMap((f) => f.units))],
    records: () => unitRecordFindings(root, "t").map((f) => `${f.kind}:${f.statusClass}:${f.evidence.file}`),
    ms8f: () => runCheckpoint({ root, checkpoint: "V8", profile: "public", inputsDir: inputs, registry: MS8 }).findings.filter((f) => f.module === "ms8-verdicts"),
    git: (...args) => { const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], { cwd: root, encoding: "utf8" }); assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`); return r.stdout; },
  };
  return c;
}
const sidecarPath = (rel) => `private/coursewerk/units/${rel}.json`;

// ======================================== 1. ONLY WHAT THE LOG WROTE IS TRUSTED ========================================

test("[req.records.only-logged-trusted] R7 H-04: a never-logged sidecar planting a register entry for a carried paragraph's next wording is not read: the paragraph keeps its id and its carry, the planted file stays, and the gate blocks on it", async (t) => {
  const c = course(t);
  openVersionCarrying(c.root, c.r(), OPEN_V2, I);
  assert.ok(c.owing(["carried-unverified"]).includes(X), "version 2 carries the paragraph");
  const PLANT = "drafts/le-chatelier-notes.md", P = "u-drafts-le-chatelier-notes-temperature-1";
  c.asAgent(() => {
    c.edit(SG, "*less* ammonia forms.", "*less* ammonia is formed.");
    const seg = segmentDeliverable(c.read(SG), SG).units.find((s) => s.text.startsWith("Because heat is effectively a product"));
    const rec = readSidecar(c.root, SG).units.find((u) => u.id === X);
    c.write(sidecarPath(PLANT), JSON.stringify({ schemaVersion: 1, deliverable: PLANT, units: [], retired: [{ id: P, deliverable: SG, section: seg.section, contentHash: unitHash(seg.text), form: seg.form, origin: rec.origin, spineNodes: rec.spineNodes, evidence: [], tokens: tokensOf(seg.text), text: seg.text }] }, null, 2) + "\n");
    // the planted file is named at once, and read by nothing
    assert.deepEqual(unloggedSidecars(c.root), [PLANT]);
    assert.deepEqual(alteredSidecars(c.root), [PLANT]);
    assert.deepEqual(orphanSidecars(c.root, c.r()), {}, "an untrusted orphan is not an orphan record to reconcile");
    assert.ok(!packageAncestry(c.root, c.r()).has(P), "nor ancestry");
  });
  const now = c.units().find((u) => u.text.startsWith("Because heat is effectively a product"));
  assert.equal(now.id, X, "the paragraph keeps its own id (a rewording), not the planted one");
  assert.deepEqual(now.carried, { scope: SCOPE, version: 2 }, "and its carry");
  assert.ok(c.owing(["carried-unverified"]).includes(X), "it still owes its re-verification");
  assert.ok(fs.existsSync(c.file(sidecarPath(PLANT))), "the index neither read nor deleted the planted file");
  assert.ok(!(PLANT in loggedDigests(c.root)), "nor logged it");
  assert.ok(!c.units().some((u) => u.id === P));
  assert.deepEqual(c.records(), [`unit-record-altered:defect:${sidecarPath(PLANT)}`]);
  const g = runGate(c.root, { inputsDir: c.inputs });
  assert.equal(g.gate.canPublish, false);
  assert.ok(g.findings.some((f) => f.kind === "unit-record-altered" && f.evidence.file === sidecarPath(PLANT) && /never written by the harness/.test(f.evidence.detail)));
  // the remedy: remove what the harness never wrote; the records it wrote stand
  fs.rmSync(c.file(sidecarPath(PLANT)));
  assert.deepEqual(c.records(), []);
});

test("[req.records.only-logged-trusted] variant: a planted LIVE-unit sidecar at a path no longer listed does not hand its units to the text — no id, origin, carry or evidence is taken from it, and the index leaves it", (t) => {
  const c = course(t);
  const old = c.unit(X), GONE = "drafts/old-le-chatelier.md", P = "u-drafts-old-le-chatelier-temperature-1";
  // a record claiming the paragraph's next wording as an instructor-authored unit with evidence and no stamp
  c.edit(SG, "*less* ammonia forms.", "*less* ammonia is formed.");
  const seg = segmentDeliverable(c.read(SG), SG).units.find((s) => s.text.startsWith("Because heat is effectively a product"));
  c.write(sidecarPath(GONE), JSON.stringify({ schemaVersion: 1, deliverable: GONE, units: [{ id: P, locator: { deliverable: GONE, section: seg.section, ordinal: 0, contentHash: unitHash(seg.text), lines: [1, 1] }, form: seg.form, role: "content", origin: { kind: "instructor-authored", instructor: I.name, date: "2026-01-01" }, spineNodes: old.spineNodes, judgment: [], evidence: [{ type: "instructor-confirmed", note: "planted" }], tokens: tokensOf(seg.text), text: seg.text }] }, null, 2) + "\n");
  assert.deepEqual(unloggedSidecars(c.root), [GONE]);
  assert.ok(!unindexedFindings(c.root, c.r(), "t").some((f) => f.evidence.what?.includes(GONE)), "not read as an orphan to follow");
  assert.ok(!packageAncestry(c.root, c.r()).has(P));
  assert.throws(() => claimAuthorship(c.root, { units: [P], instructorWords: "Mine." }, I), /no such unit/, "no act reaches a planted unit");
  c.asAgent(() => {});
  const now = c.units().find((u) => u.text.startsWith("Because heat is effectively a product"));
  assert.equal(now.id, X); assert.notEqual(now.origin?.kind, "instructor-authored");
  assert.ok(fs.existsSync(c.file(sidecarPath(GONE))));
  assert.deepEqual(c.records(), [`unit-record-altered:defect:${sidecarPath(GONE)}`]);
  // the gate's modules read a snapshot: the same trust filters it
  const logText = readLogText(c.root);
  assert.equal(trustedSidecarPath(logText)(sidecarPath(GONE)), false);
  assert.equal(trustedSidecarPath(logText)(sidecarPath(SG)), true);
  assert.equal(trustedSidecarPath(logText)("private/coursewerk/LOG.jsonl"), true);
});

test("[req.records.only-logged-trusted] variant: a planted sidecar at a newly declared document's path is never written over — the index refuses and names it; removing it lets the harness write its own", (t) => {
  const c = course(t);
  const DOC = "current/handout.md";
  c.write(DOC, "{{nyml\nkind: document\n}}\n\n# Handout\n\n## Temperature\n\nFor an exothermic reaction, heat behaves as a product: raising the temperature shifts the equilibrium toward the reactants.\n");
  c.write("private/coursewerk/DOCUMENTS.json", JSON.stringify({ schemaVersion: 1, documents: [{ id: "handout", title: "Handout", source: DOC, carrier: "paged" }] }, null, 2) + "\n");
  c.write(sidecarPath(DOC), JSON.stringify({ schemaVersion: 1, deliverable: DOC, units: [] }, null, 2) + "\n");
  assert.equal(readSidecar(c.root, DOC), null, "not read");
  beginSession(c.root, c.r(), AGENT);
  assert.throws(() => indexUnits(c.root, c.r(), { as: "agent", party: AGENT }), /never written by the harness/);
  assert.equal(c.read(sidecarPath(DOC)).trim(), JSON.stringify({ schemaVersion: 1, deliverable: DOC, units: [] }, null, 2), "left as it was");
  fs.rmSync(c.file(sidecarPath(DOC)));
  indexAndStamp(c.root, c.r(), { as: "agent", party: AGENT });
  assert.ok(c.units().some((u) => u.locator.deliverable === DOC));
  assert.ok(DOC in loggedDigests(c.root)); assert.deepEqual(c.records(), []);
});

test("[req.records.only-logged-trusted] variant: a register entry planted into an existing (logged) sidecar is an altered record; the index refuses to read or write over it", (t) => {
  const c = course(t);
  const side = readSidecar(c.root, SG);
  c.edit(SG, "*less* ammonia forms.", "*less* ammonia is formed.");
  const seg = segmentDeliverable(c.read(SG), SG).units.find((s) => s.text.startsWith("Because heat is effectively a product"));
  side.retired = [...(side.retired || []), { id: "u-planted-1", deliverable: SG, section: seg.section, contentHash: unitHash(seg.text), form: seg.form, tokens: tokensOf(seg.text), text: seg.text }];
  fs.writeFileSync(c.file(sidecarPath(SG)), JSON.stringify(side, null, 2) + "\n");
  assert.deepEqual(c.records(), [`unit-record-altered:defect:${sidecarPath(SG)}`]);
  beginSession(c.root, c.r(), AGENT);
  assert.throws(() => indexUnits(c.root, c.r(), { as: "agent", party: AGENT }), /changed outside the harness/);
  assert.ok(!c.units().some((u) => u.id === "u-planted-1"));
});

test("[req.records.only-logged-trusted] variant: a deleted sidecar is caught and never re-written silently; a sidecar the harness removed (logged absent) and planted again is untrusted", (t) => {
  const c = course(t);
  fs.rmSync(c.file(sidecarPath(SG)));
  assert.deepEqual(c.records(), [`unit-record-altered:defect:${sidecarPath(SG)}`]);
  beginSession(c.root, c.r(), AGENT);
  assert.throws(() => indexUnits(c.root, c.r(), { as: "agent", party: AGENT }), /changed outside the harness/, "the index does not re-mint the deleted records");
  assert.ok(!fs.existsSync(c.file(sidecarPath(SG))));

  // the harness's own removal is logged; a file planted back at that path is not trusted
  const d = course(t), DOC = "current/handout.md";
  d.write(DOC, "{{nyml\nkind: document\n}}\n\n# Handout\n\n## Catalysts\n\nA catalyst speeds up the forward and reverse reactions by the same factor.\n");
  d.write("private/coursewerk/DOCUMENTS.json", JSON.stringify({ schemaVersion: 1, documents: [{ id: "handout", title: "Handout", source: DOC, carrier: "paged" }] }, null, 2) + "\n");
  d.asAgent(() => {});
  const kept = fs.readFileSync(d.file(sidecarPath(DOC)), "utf8");
  // the document moves: its units follow their text, and the harness removes the record left behind (logged absent)
  const MOVED = "current/handout-v2.md";
  d.write(MOVED, d.read(DOC)); fs.rmSync(d.file(DOC));
  d.write("private/coursewerk/DOCUMENTS.json", JSON.stringify({ schemaVersion: 1, documents: [{ id: "handout", title: "Handout", source: MOVED, carrier: "paged" }] }, null, 2) + "\n");
  d.asAgent(() => {});
  assert.ok(!fs.existsSync(d.file(sidecarPath(DOC))));
  assert.equal(loggedDigests(d.root)[DOC], "absent", "the removal is logged");
  assert.equal(sidecarTrust(readLogText(d.root))(DOC), false);
  assert.deepEqual(d.records(), []);
  // the old record planted back: altered, and not read (its units do not reach the index)
  fs.writeFileSync(d.file(sidecarPath(DOC)), kept);
  assert.deepEqual(d.records(), [`unit-record-altered:defect:${sidecarPath(DOC)}`]);
  assert.equal(readSidecar(d.root, DOC), null);
  assert.deepEqual(orphanSidecars(d.root, d.r()), {});
});

test("[req.records.only-logged-trusted] migration: a package whose log holds no unit-record digest logs EVERY sidecar on disk at its first harness write (the session begin), so no record is left to read as planted; after that a new file is untrusted", (t) => {
  const c = course(t);
  // the package as written before digests were logged: the same records, a log with no unit-records event (re-chained)
  const recs = readLogText(c.root).trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.payload?.event !== "unit-records");
  let prev = "0".repeat(64);
  recs.forEach((r, i) => { r.seq = i + 1; r.prev = prev; delete r.hash; r.hash = recordHash(r); prev = r.hash; });
  fs.writeFileSync(c.file("private/coursewerk/LOG.jsonl"), recs.map((r) => JSON.stringify({ seq: r.seq, prev: r.prev, type: r.type, party: r.party, at: r.at, payload: r.payload, hash: r.hash })).join("\n") + "\n");
  const onDisk = fs.readdirSync(c.file("private/coursewerk/units"), { recursive: true }).filter((f) => f.endsWith(".json")).map((f) => f.split(path.sep).join("/").replace(/\.json$/, "")).sort();
  assert.deepEqual(loggedDigests(c.root), {});
  assert.deepEqual(unloggedSidecars(c.root), [], "pre-rule: nothing to compare against, nothing untrusted");
  assert.equal(readSidecar(c.root, SG)?.deliverable, SG);
  const n = parseLog(readLogText(c.root)).length;
  upgradeUnitRecordDigests(c.root);
  const added = parseLog(readLogText(c.root)).slice(n);
  assert.equal(added.length, 1, "one log record");
  assert.deepEqual(Object.keys(added[0].payload.digests).sort(), onDisk, "the digest of every sidecar on disk");
  assert.deepEqual(c.records(), []);
  c.write(sidecarPath("drafts/x.md"), JSON.stringify({ schemaVersion: 1, deliverable: "drafts/x.md", units: [] }) + "\n");
  assert.deepEqual(unloggedSidecars(c.root), ["drafts/x.md"]);
});

// ===================================== 2. EVERY LOSS OF THE INSTRUCTOR'S TEXT IS ASKED =====================================

const S1 = "Ammonia synthesis is the textbook case of an industrial equilibrium.";
const S2 = "For the Haber-Bosch reaction $\\ce{N2 + 3 H2 <=> 2 NH3}$, the enthalpy change is $\\Delta H = -92.2\\ \\text{kJ}$.";
const P = `${S1} ${S2}`;
/** The instructor writes a paragraph outside any session and claims it (their text is registered); linked like X. */
function instructorParagraph(c) {
  const spine = c.unit(X).spineNodes;
  c.edit(SG, ANCHOR, `${ANCHOR}\n\n${P}`); indexAndStamp(c.root, c.r(), {});
  const id = c.find(P).id;
  claimAuthorship(c.root, { units: [id], instructorWords: "That paragraph is mine." }, I);
  linkUnits(c.root, c.r(), { [id]: spine }, AGENT);
  return id;
}
const removalAsked = (c, id) => c.ms8f().filter((f) => f.kind === "instructor-edit-unasked" && (f.units || []).includes(id) && /Your text was removed/.test(f.evidence.note));

test("[req.instructor-text.removal-asked] R7 K05: the instructor's registered paragraph deleted and re-indexed OUTSIDE any session is asked about (their question, never silent)", (t) => {
  const c = course(t), id = instructorParagraph(c);
  assert.deepEqual(removalAsked(c, id), []);
  c.edit(SG, `\n\n${P}`, ""); indexAndStamp(c.root, c.r(), {});
  assert.ok(!c.read(SG).includes(S1));
  const q = removalAsked(c, id);
  assert.equal(q.length, 1);
  assert.equal(q[0].statusClass, "question"); assert.equal(q[0].route, "digest");
  assert.ok(q[0].evidence.quote.includes("textbook case"));
  // the control: inside a session the same removal is asked the same way
  const k = course(t), kid = instructorParagraph(k);
  k.asAgent(() => k.edit(SG, `\n\n${P}`, ""));
  assert.equal(removalAsked(k, kid).length, 1);
  // "keep it removed" is their answer: the register takes the text as gone, and nothing is asked again
  const d = buildDigest(c.root, runCheckpoint({ root: c.root, checkpoint: "V8", profile: "public", inputsDir: c.inputs, registry: MS8 }).findings, unitInfoOf(c.root, c.r()));
  const e = d.entries.find((x) => x.kind === "instructor-edit-unasked");
  answerDigest(c.root, d, { answers: { [e.key]: "keep it removed" }, instructorWords: "keep it removed.", reader: c.r() }, I);
  assert.deepEqual(removalAsked(c, id), []);
});

test("[req.instructor-text.removal-asked] variant: a removal by git checkout of an earlier deliverable, re-indexed with no session, is asked about", (t) => {
  const c = course(t);
  c.git("init", "-q"); c.git("add", "-A"); c.git("commit", "-qm", "before");
  const id = instructorParagraph(c);
  c.git("add", "-A"); c.git("commit", "-qm", "their paragraph");
  c.git("checkout", "HEAD~1", "--", SG);
  assert.ok(!c.read(SG).includes(S1));
  indexAndStamp(c.root, c.r(), {});
  assert.equal(removalAsked(c, id).length, 1);
});

test("[req.instructor-text.removal-asked] variant: a removal brought in by a merge, re-indexed with no session, is asked about", (t) => {
  const c = course(t);
  const id = instructorParagraph(c);
  c.git("init", "-q"); c.git("add", "-A"); c.git("commit", "-qm", "with their paragraph");
  c.git("checkout", "-qb", "side");
  c.edit(SG, `\n\n${P}`, ""); c.git("commit", "-qam", "drop a paragraph");
  c.git("checkout", "-q", "main");
  c.write("NOTES-merge.txt", "an unrelated change on main\n"); c.git("add", "-A"); c.git("commit", "-qm", "main moves on");
  c.git("merge", "-q", "--no-edit", "side");
  assert.ok(!c.read(SG).includes(S1), "the merge removed it");
  indexAndStamp(c.root, c.r(), {});
  assert.equal(removalAsked(c, id).length, 1);
});

test("[req.instructor-text.removal-asked] variant: their fact changed OUTSIDE any session (a checkout of an older wording) is held, never indexed as someone else's text until they answer", (t) => {
  const c = course(t), id = instructorParagraph(c);
  c.edit(SG, "-92.2\\ \\text{kJ}", "-75.0\\ \\text{kJ}");
  assert.throws(() => indexAndStamp(c.root, c.r(), {}), /instructor's credit/);
  assert.ok(unindexedFindings(c.root, c.r(), "t").some((f) => f.kind === "units-not-indexed" && f.statusClass === "obligation"));
  assert.ok(readSidecar(c.root, SG).units.some((u) => u.id === id && u.origin.kind === "instructor-authored" && u.text === P), "their record still holds their text");
});
