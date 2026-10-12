// 3C RED TEAM, ROUND 6 — COHERENCE (G1, G3, G4): ONE root cause, fixed at the cause (operator rule D46), probed here on
// the real course (tests/fixtures/c2-chemistry-v2 + c2-chemistry inputs) with new variants.
// Record of the round: the red team's REPORT.md (P11 study, redteam-r6/coherence).
//
// The cause: the log and the unit records could drift apart, and a unit's identity was tied to its document's path.
// The principle of the fix: the log is the truth, the records must agree with it, and identity follows content.
//   1. Reconcile log and records (core/reconcile.mjs). Every logged act that promises a record state — a version and
//      its carry, a confirmation, a re-verification, a retirement, added judgment kinds — is checked against every
//      record on disk at the gate; a disagreement is a blocking defect naming the gap. Writers carry out an act in one
//      step (writeUnitRecords: checked as if logged → logged → written; a version checks every carry before it logs
//      anything), and `units.mjs reconcile` (run at every session begin) completes an act whose write died, only as
//      far as its own evidence still allows ......................................................... [req.records.log-reconciled]
//      G3  a refused carry write, then the git restore the refusal advised, left version 2 open with 0 of 84 carried
//      variants  the write dying after the log (carry, the version's carry list, a confirmation, a re-verification);
//                a confirmation completed only at the text it confirmed; a harness carry that no version decided
//   2. Identity across paths (core/units_index.mjs). A sidecar left at a path no longer listed is read: its units
//      follow their text (byte for byte, or nearly) to the new path with everything they owe, or retire into its
//      register; it is never ignored (the gate holds it as units-not-indexed until indexed) ... [req.coherence.identity-across-paths]
//      G1  a carried declared handout renamed: the carry was dropped and the units re-minted
//      variants  a move across folders with a rename and an edit; a document removed (its register keeps the carry,
//                and the text coming back at a third path takes it back); a version refused over an unfollowed rename
//   3. "What changed" survives retirement (core/obligations.mjs movedForRecheck). A moved target that retired or split
//      is shown as it last read, with the units that took its words, and the value where it now lives (by symbol and
//      unit, whatever the number); a re-check that cannot be shown the change does not clear ..... [req.coherence.recheck-shows-retired]
//      G4  ΔH moved out of the display equation into a new sentence: the owed re-checks were shown nothing
//      variants  a split that moves a value; the retired unit's last text; a target that cannot be shown → no clear
// Offline and deterministic: every blind review is a replayed test double.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { confirmUnits, coreObligations, indexAndStamp, linkUnits, loadUnits, openVersionCarrying, recheckShown, reverifyUnits } from "../scripts/lib/core/obligations.mjs";
import { beginSession, readSidecar, unindexedFindings } from "../scripts/lib/core/units_index.mjs";
import { alteredSidecars, loggedDigests, writeUnitRecords } from "../scripts/lib/core/unit_records.mjs";
import { logRecordFindings, logRecordGaps, reconcileUnitRecords } from "../scripts/lib/core/reconcile.mjs";
import { currentVersion, openMajorVersion } from "../scripts/lib/core/versions.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { appendLogRecord, parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { verifyKnowledge } from "../scripts/lib/verify/verdicts.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const SG = "study-guide/le-chatelier.md", SCOPE = "chapter:le-chatelier";
const EQ = "u-study-guide-le-chatelier-changing-the-temperature-5", WE1 = "u-study-guide-le-chatelier-worked-examples-1", SOL1 = "u-study-guide-le-chatelier-worked-examples-2";
const EQ_TEXT = "$$\\ce{N2(g) + 3 H2(g) <=> 2 NH3(g)} \\qquad \\Delta H = -92\\ \\text{kJ mol}^{-1}$$";
const OPEN_V2 = { scopes: [SCOPE], reason: "objective 3 is split into a qualitative and a quantitative objective", instructorWords: "Open version 2 of chapter 2." };

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r6-records-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  const c = {
    root, r: () => liveReader(root),
    units: () => loadUnits(root, liveReader(root)),
    unit: (id) => loadUnits(root, liveReader(root)).find((u) => u.id === id),
    at: (rel) => loadUnits(root, liveReader(root)).filter((u) => u.locator.deliverable === rel),
    file: (rel) => path.join(root, rel),
    write: (rel, s) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), s); },
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent(fn) { beginSession(root, liveReader(root), AGENT); fn(); return indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    log: () => parseLog(readLogText(root)),
    ob: (kinds) => coreObligations(root, liveReader(root), "t").filter((f) => !kinds || kinds.includes(f.kind)),
    owing: (kinds = ["reverify", "carried-unverified"]) => [...new Set(coreObligations(root, liveReader(root), "t").filter((f) => kinds.includes(f.kind)).flatMap((f) => f.units))],
    behind: () => logRecordFindings(root, "t"),
    sidecarFile: (rel) => path.join(root, "metadata", "units", `${rel}.json`),
  };
  return c;
}
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];
const review = (flag = () => []) => replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: flag(pr) }));
/** The process dies while writing unit records: every write under metadata/units throws (the log append is untouched). */
function dieWritingRecords(root) {
  const orig = fs.writeFileSync, dir = path.join(root, "metadata", "units");
  fs.writeFileSync = function (f, ...rest) { if (String(f).startsWith(dir)) throw new Error("simulated crash: the process died writing unit records"); return orig.call(this, f, ...rest); };
  return () => { fs.writeFileSync = orig; };
}
function dying(root, fn) { const restore = dieWritingRecords(root); try { return assert.throws(fn, /simulated crash/); } finally { restore(); } }

// ============================================ 2. IDENTITY ACROSS PATHS ==========================================
const OLD = "current/fall-2026/le-chatelier-handout.md", NEW = "current/spring-2027/le-chatelier-handout.md";
const HANDOUT = "{{nyml\nkind: document\n}}\n\n# Le Chatelier's principle: a one-page review\n\n## Temperature\n\nFor an exothermic reaction, heat behaves as a product: raising the temperature shifts the equilibrium toward the reactants and lowers the equilibrium constant.\n\n## Catalysts\n\nA catalyst speeds up the forward and reverse reactions by the same factor, so the position of the equilibrium does not change.\n";
const docs = (src) => JSON.stringify({ schemaVersion: 1, documents: src ? [{ id: "le-chatelier-handout", title: "Le Chatelier handout", source: src, carrier: "paged" }] : [] }, null, 2) + "\n";
const linkOf = (u) => [/catalyst/i.test(u.text) ? "objective.le-chatelier.explain-inert-and-catalyst" : "objective.le-chatelier.predict-temperature-shift"];
/** The handout written in a session, declared, linked; version 2 of the chapter carries it (the R5 fix). */
function carriedHandout(c) {
  c.asAgent(() => { c.write(OLD, HANDOUT); c.write("metadata/DOCUMENTS.json", docs(OLD)); });
  const h = c.at(OLD);
  assert.equal(h.length, 2);
  linkUnits(c.root, c.r(), Object.fromEntries(h.map((u) => [u.id, linkOf(u)])), AGENT);
  openVersionCarrying(c.root, c.r(), OPEN_V2, I);
  for (const u of h) assert.deepEqual(c.unit(u.id).carried, { scope: SCOPE, version: 2 }, "version 2 carries the handout");
  return h;
}

test("[req.coherence.identity-across-paths] R6 G1: a carried declared handout moved to another folder keeps its units, its carry and everything it owes; the sidecar left behind is reconciled, not ignored", (t) => {
  const c = course(t);
  const h1 = carriedHandout(c);
  // the move, outside any re-index first: the record left behind is held by the gate, never silently ignored
  fs.mkdirSync(c.file("current/spring-2027"), { recursive: true }); fs.renameSync(c.file(OLD), c.file(NEW)); c.write("metadata/DOCUMENTS.json", docs(NEW));
  assert.ok(unindexedFindings(c.root, c.r(), "t").some((f) => f.kind === "units-not-indexed" && /metadata\/units\/current\/fall-2026\/le-chatelier-handout\.md\.json/.test(f.evidence.what) && /no longer a deliverable/.test(f.evidence.what)));
  assert.throws(() => openVersionCarrying(c.root, c.r(), { ...OPEN_V2, instructorWords: "Open version 3." }, I), /not yet indexed/, "no version is opened over a rename its records have not followed");
  // the agent's session indexes it: the records follow the text
  beginSession(c.root, c.r(), AGENT); indexAndStamp(c.root, c.r(), { as: "agent", party: AGENT });
  const h2 = c.at(NEW);
  assert.deepEqual(h2.map((u) => u.id), h1.map((u) => u.id), "the units keep their ids: identity follows the text, not the path");
  for (const u of h2) assert.deepEqual(u.carried, { scope: SCOPE, version: 2 }, `${u.id} is still carried into version 2`);
  assert.deepEqual(c.owing(["carried-unverified"]).filter((id) => h2.some((u) => u.id === id)).sort(), h2.map((u) => u.id).sort(), "the handout still owes its version-2 re-check");
  assert.equal(fs.existsSync(c.sidecarFile(OLD)), false, "the sidecar left behind held nothing more and was removed");
  assert.equal(loggedDigests(c.root)[OLD], "absent", "its removal is logged");
  assert.deepEqual(alteredSidecars(c.root), []);
  assert.deepEqual(c.behind(), [], "the records agree with the log");
  assert.ok(!unindexedFindings(c.root, c.r(), "t").some((f) => f.kind === "units-not-indexed"));
});

test("[req.coherence.identity-across-paths] variants: a move across folders with a rename AND an edit keeps the carry; a removed document retires into its register with the carry, and its text coming back elsewhere takes it back", (t) => {
  const c = course(t);
  const h1 = carriedHandout(c);
  const temp = h1.find((u) => /temperature/.test(u.text)).id, cat = h1.find((u) => /catalyst/i.test(u.text)).id;
  // rename + move + an edit in the same session
  const MOVED = "handouts/review/le-chatelier-one-pager.md";
  c.asAgent(() => {
    fs.mkdirSync(c.file("handouts/review"), { recursive: true }); fs.renameSync(c.file(OLD), c.file(MOVED)); c.write("metadata/DOCUMENTS.json", docs(MOVED));
    c.edit(MOVED, "raising the temperature shifts", "increasing the temperature shifts");
  });
  const moved = c.at(MOVED);
  assert.deepEqual(moved.map((u) => u.id).sort(), [temp, cat].sort(), "a near return in another folder takes back its id");
  for (const u of moved) assert.deepEqual(u.carried, { scope: SCOPE, version: 2 });
  assert.equal(fs.existsSync(c.sidecarFile(OLD)), false);
  // the document is withdrawn: DOCUMENTS.json no longer lists it and the file is gone
  c.asAgent(() => { fs.rmSync(c.file(MOVED)); c.write("metadata/DOCUMENTS.json", docs(null)); });
  const side = JSON.parse(fs.readFileSync(c.sidecarFile(MOVED), "utf8"));
  assert.deepEqual(side.units, [], "nothing of it ships");
  for (const id of [temp, cat]) assert.deepEqual(side.retired.find((e) => e.id === id)?.carried, { scope: SCOPE, version: 2 }, `${id} retired into the register with its carry`);
  const retirement = c.log().filter((r) => r.type === "unit-retirement").at(-1);
  assert.deepEqual([...retirement.payload.units].sort(), [temp, cat].sort()); assert.equal(retirement.payload.register, true);
  assert.deepEqual(c.behind(), []);
  // the text comes back at a third path: it takes back its id and its carry from the register of an unlisted sidecar
  const BACK = "current/spring-2027/review.md";
  c.asAgent(() => { c.write(BACK, HANDOUT); c.write("metadata/DOCUMENTS.json", docs(BACK)); });
  const back = c.at(BACK);
  assert.ok(back.some((u) => u.id === cat), "the catalyst paragraph came back byte for byte under its old id");
  for (const u of back.filter((x) => [temp, cat].includes(x.id))) assert.deepEqual(u.carried, { scope: SCOPE, version: 2 });
  assert.deepEqual(c.behind(), []);
});

// ============================================ 1. RECONCILE LOG AND RECORDS ======================================
test("[req.records.log-reconciled] R6 G3: a version whose carry would be refused is refused BEFORE anything is logged", (t) => {
  const c = course(t);
  const PR = "practice/le-chatelier.md";
  const side = readSidecar(c.root, PR); side.units[0].reviewNote = "looked fine"; fs.writeFileSync(c.sidecarFile(PR), JSON.stringify(side, null, 2) + "\n");
  const before = c.log().length;
  assert.throws(() => openVersionCarrying(c.root, c.r(), OPEN_V2, I), /refusing to open a new version: its carry could not be written, so nothing was logged/);
  assert.equal(c.log().length, before, "neither the version nor a carry was logged");
  assert.equal(currentVersion(readLogText(c.root), SCOPE), 1);
  // the confirmation and the re-verification refuse the same way: nothing logged
  assert.throws(() => confirmUnits(c.root, c.r(), [c.at(PR)[0].id], { what: "still-correct", instructorWords: "Still right." }, I), /changed outside the harness/);
  assert.equal(c.log().length, before);
});

test("[req.records.log-reconciled] R6 G3 backstop: the carry write dies after the log — the gate names the gap ('the log carried N units; the records hold 0'), and reconcile completes the carry", (t) => {
  const c = course(t);
  dying(c.root, () => openVersionCarrying(c.root, c.r(), OPEN_V2, I));
  const carry = c.log().filter((r) => r.payload?.event === "units-carried").at(-1);
  assert.ok(carry && carry.payload.units.length > 50, "the log carried the chapter");
  assert.deepEqual(c.owing(["carried-unverified"]), [], "the records hold no carry — the obligations read from them see nothing");
  const f = c.behind();
  assert.equal(f.length, 1); assert.equal(f[0].kind, "unit-record-behind-log"); assert.equal(f[0].statusClass, "defect");
  assert.match(f[0].evidence.detail, new RegExp(`the log carried ${carry.payload.units.length} unit\\(s\\) of chapter:le-chatelier into version 2 \\(log #${carry.seq}\\); the records hold 0 of those carries`));
  const g = runGate(c.root, { inputsDir: INPUTS });
  assert.equal(g.gate.canPublish, false); assert.ok(g.findings.some((x) => x.kind === "unit-record-behind-log"));
  // reconcile (also run at every session begin) completes the logged act
  const r = reconcileUnitRecords(c.root, c.r());
  assert.deepEqual(r.remaining, []); assert.equal(r.applied[0].units.length, carry.payload.units.length);
  assert.equal(c.owing(["carried-unverified"]).length, carry.payload.units.length, "every carried unit owes its version-2 re-check");
  assert.deepEqual(c.behind(), []); assert.deepEqual(alteredSidecars(c.root), []);
});

test("[req.records.log-reconciled] variant: a version logged with no carry logged at all — the gate names the version's carry list, and reconcile carries it (a harness carry no version decided counts for nothing)", (t) => {
  const c = course(t);
  const ids = c.units().filter((u) => u.locator.deliverable === SG).map((u) => u.id);
  const v = openMajorVersion(c.root, { scopes: [SCOPE], reason: "objective 3 split", instructorWords: "Open version 2.", carried: ids }, I);
  const f = c.behind();
  assert.equal(f.length, 1); assert.equal(f[0].evidence.gap, "version"); assert.match(f[0].evidence.detail, /no carry of \d+ of them is logged/);
  // a forged harness carry naming a unit the version did not carry: not a carry, so its mark is refused
  const PR = "practice/le-chatelier.md", other = c.at(PR)[0].id;
  appendLogRecord(c.root, { type: "revision", party: { role: "harness", name: "reconcile" }, payload: { event: "units-carried", scope: SCOPE, version: 2, units: [other], reconciles: v.seq } });
  const side = readSidecar(c.root, PR); const u = side.units.find((x) => x.id === other); delete u.stamp; u.evidence = []; u.carried = { scope: SCOPE, version: 2 };
  assert.throws(() => writeUnitRecords(c.root, [{ ...side, deliverable: PR }]), /no logged version carry names it/);
  const r = reconcileUnitRecords(c.root, c.r());
  assert.deepEqual(r.remaining, []);
  for (const id of ids) assert.deepEqual(c.unit(id).carried, { scope: SCOPE, version: 2 });
  assert.equal(c.log().filter((x) => x.payload?.event === "units-carried" && x.payload.reconciles === v.seq).at(-1).party.role, "harness");
});

/** The equation's value changes in a session: Worked example 1 and Solution 1 owe a re-check. */
function valueChanged(c) {
  c.asAgent(() => c.edit(SG, "\\qquad \\Delta H = -92\\ \\text{kJ mol}^{-1}$$", "\\qquad \\Delta H = -92.4\\ \\text{kJ mol}^{-1}$$"));
  const owed = c.owing(["reverify"]);
  assert.ok(owed.includes(WE1) && owed.includes(SOL1), "the units stating the old value owe a re-check");
  return owed;
}

test("[req.records.log-reconciled] variant: an interrupted confirmation — the log confirms, the records do not; reconcile completes it only at the text and dependencies the instructor confirmed", (t) => {
  const c = course(t);
  valueChanged(c);
  // the instructor confirms the new fact; the write dies after the log
  dying(c.root, () => confirmUnits(c.root, c.r(), [EQ], { what: "fact", instructorWords: "Use -92.4 kJ/mol, the value in our textbook." }, I));
  const k = c.log().filter((r) => r.type === "confirmation").at(-1);
  assert.ok(k.payload.contentHashes[EQ] && k.payload.deps[EQ], "the confirmation names the text and the dependencies it confirmed");
  assert.ok(c.behind().some((f) => f.evidence.seq === k.seq && f.units.includes(EQ) && /instructor's confirmation of 1 unit\(s\) .* whose records still owe it/.test(f.evidence.detail)));
  assert.ok(!(c.unit(EQ).evidence || []).some((e) => e.type === "instructor-confirmation"));
  reconcileUnitRecords(c.root, c.r());
  assert.ok(c.unit(EQ).evidence.some((e) => e.type === "instructor-confirmation" && e.factHash === k.payload.factHashes[EQ]));
  assert.deepEqual(c.behind(), []);
  // a still-correct confirmation of a dependent whose write dies, and the dependent edited before reconcile: not completed
  dying(c.root, () => confirmUnits(c.root, c.r(), [WE1], { what: "still-correct", instructorWords: "Worked example 1 is still right." }, I));
  assert.ok(c.behind().some((f) => f.evidence.gap === "clear" && f.units.includes(WE1)));
  // (an edit indexed outside a session: a session begin would have completed the confirmation first, at the text it confirmed)
  c.edit(SG, "predict what happens to the amount of ammonia", "predict what happens to the amount of NH3"); indexAndStamp(c.root, c.r(), {});
  // (the edit's index rewrote the record: what WE1 owed is kept in its `owes`, so the record no longer claims a clear)
  reconcileUnitRecords(c.root, c.r());
  assert.ok(c.owing(["reverify"]).includes(WE1), "the instructor confirmed other text: reconcile clears nothing for this one");
  // the route the finding names: the instructor confirms again
  confirmUnits(c.root, c.r(), [WE1], { what: "still-correct", instructorWords: "Worked example 1, as it reads now, is right." }, I);
  assert.deepEqual(c.behind(), []); assert.ok(!c.owing(["reverify"]).includes(WE1));
});

test("[req.records.log-reconciled] variant: an interrupted re-verification is completed by reconcile while its counted blind review still counts", async (t) => {
  const c = course(t);
  valueChanged(c);
  await verifyKnowledge(c.root, c.r(), { verifier: review(), only: [WE1] });
  dying(c.root, () => reverifyUnits(c.root, c.r(), [WE1], AGENT));
  const rv = c.log().filter((r) => r.payload?.event === "units-reverified").at(-1);
  assert.deepEqual(rv.payload.units, [WE1]);
  assert.ok(c.owing(["reverify"]).includes(WE1), "the record still owes");
  const f = c.behind().find((x) => x.evidence.seq === rv.seq);
  assert.equal(f.evidence.gap, "clear"); assert.match(f.evidence.detail, /re-verified 1 unit\(s\) .* whose records still owe it/);
  const r = reconcileUnitRecords(c.root, c.r());
  assert.deepEqual(r.remaining, []);
  assert.ok(!c.owing(["reverify"]).includes(WE1)); assert.deepEqual(c.behind(), []);
});

// ============================================ 3. WHAT CHANGED SURVIVES RETIREMENT ===============================
const SPLIT = "$$\\ce{N2(g) + 3 H2(g) <=> 2 NH3(g)}$$\n\nIts standard reaction enthalpy is $\\Delta H = -92.4\\ \\text{kJ mol}^{-1}$.";
test("[req.coherence.recheck-shows-retired] R6 G4: ΔH moved out of the display equation into a new sentence — the owed re-checks are shown the new value, and an honest reviewer who sees both stops the clear", async (t) => {
  const c = course(t);
  c.asAgent(() => c.edit(SG, EQ_TEXT, SPLIT));
  const nu = c.units().find((u) => u.text.startsWith("Its standard reaction enthalpy"));
  confirmUnits(c.root, c.r(), [nu.id], { what: "fact", instructorWords: "Use -92.4 kJ/mol, the value in our textbook." }, I);
  const owed = c.owing(["reverify"]);
  assert.ok(owed.includes(WE1) && owed.includes(SOL1));
  const shown = recheckShown(c.root, c.r());
  for (const id of [WE1, SOL1]) assert.ok(shown.get(id).some((m) => /-92\.4/.test(m.text)), `${id}'s re-check is shown where the value now lives`);
  const seen = [];
  const honest = review((pr) => { seen.push(pr); return /92\.4/.test(pr) && /-92\\/.test(pr) ? [{ kind: "wrong", text: "-92", problem: "the guide states -92.4 kJ/mol for this reaction elsewhere", suggestion: "-92.4" }] : []; });
  await verifyKnowledge(c.root, c.r(), { verifier: honest, only: [WE1, SOL1] });
  assert.ok(seen.length === 2 && seen.every((p) => /92\.4/.test(p)), "each re-check saw -92.4");
  assert.throws(() => reverifyUnits(c.root, c.r(), [WE1, SOL1], AGENT), /found it wrong/);
});

test("[req.coherence.recheck-shows-retired] variants: a split that moves a value shows the piece holding it; a retired target is shown as it last read; a target nothing can show is never cleared by a re-check", async (t) => {
  // a split: one display equation becomes two, the value changed in the second piece
  const s = course(t);
  s.asAgent(() => s.edit(SG, EQ_TEXT, "$$\\ce{N2(g) + 3 H2(g) <=> 2 NH3(g)}$$\n\n$$\\Delta H = -92.4\\ \\text{kJ mol}^{-1}$$"));
  const piece = s.units().find((u) => u.text.startsWith("$$\\Delta H = -92.4"));
  assert.ok(piece.lineage?.includes(EQ), "the piece names the unit whose text it holds");
  for (const id of s.owing(["reverify"]).filter((x) => [WE1, SOL1].includes(x))) assert.ok(recheckShown(s.root, s.r()).get(id).some((m) => m.text === piece.text), `${id} is shown the piece`);
  // the last text: once indexed by this harness a record keeps it, so a deleted equation is shown as it last read
  const l = course(t);
  l.asAgent(() => {}); // the first index under R6 records every unit's text
  l.asAgent(() => l.edit(SG, `${EQ_TEXT}\n`, ""));
  assert.equal(l.unit(EQ), undefined);
  const lastRead = recheckShown(l.root, l.r()).get(WE1);
  assert.ok(lastRead.some((m) => m.text === EQ_TEXT && /as it last read/.test(m.what)), "the retired equation is shown as it last read");
  // a target nothing can show (deleted before its text was recorded; no unit took its words or values): no re-check clears
  const n = course(t);
  n.asAgent(() => n.edit(SG, `${EQ_TEXT}\n`, ""));
  const st = recheckShown(n.root, n.r()).get(WE1);
  assert.ok(st.unshowable.includes(`unit:${EQ}`));
  await verifyKnowledge(n.root, n.r(), { verifier: review(), only: [WE1] });
  assert.throws(() => reverifyUnits(n.root, n.r(), [WE1], AGENT), /cannot be shown what changed/);
  confirmUnits(n.root, n.r(), [WE1], { what: "still-correct", instructorWords: "Worked example 1 still holds without the equation." }, I);
  assert.ok(!n.owing(["reverify"]).includes(WE1), "the instructor's confirmation clears it");
});
