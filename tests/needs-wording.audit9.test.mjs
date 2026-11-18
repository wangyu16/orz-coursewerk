// [req.host.alembic-needs-grouped] [req.host.alembic-needs-apply] [req.host.alembic-needs-export] [req.host.alembic-needs-wording] Closed-loop audit, round 9,
// of D-133 (needs-wording 0fca6cb). Each test names one finding (severity in its name) and FAILS on 0fca6cb. The answers use
// Alembic's REAL shape: every answer of one digest carries the digest's needs-you row id as `item`
// (Alembic apps/web/src/lib/agent-endpoint.ts: `{ item: d.id, changesetId, question, … }` per question of the row;
// agent-runtime-v3 §22: "each question is answered on its own … also from a digest still partly open").
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendLogRecord, parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import * as needsMod from "../scripts/lib/core/alembic_needs.mjs";
import { applyChanges, bindingGuard, digestQuestion, exportNeeds, handinProblems, NEEDS_FILE } from "../scripts/lib/core/alembic_needs.mjs";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { makeFinding } from "../scripts/lib/records/findings.mjs";
import { forInstructor } from "../scripts/lib/core/needs_wording.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const BY = { id: "u-42", name: "Yu Wang" };
const P1 = "u-study-guide-le-chatelier-the-principle-1", P2 = "u-study-guide-le-chatelier-the-principle-2";
const U3 = "u-study-guide-le-chatelier-changing-the-temperature-1";
const GONE = "u-study-guide-le-chatelier-the-principle-99";
function course(t) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-wording-audit9-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  return { root, log: () => parseLog(readLogText(root)) };
}
const dq = (r) => r.handin.digest.questions.filter((q) => q.id.startsWith("d."));
const rec = (root) => JSON.parse(fs.readFileSync(path.join(root, NEEDS_FILE), "utf8")).handins.at(-1).questions;
const instr = (log) => log.filter((x) => x.type === "answer" && x.party?.role === "instructor");
// one Alembic needs-you row (`item`) per hand-in: every answer of the digest carries it
const row = (cs, q, answer, { item = `row-${cs}`, words, at = "2026-11-16T10:00:00Z" } = {}) => ({ item, changesetId: cs, question: q, answer, ...(words ? { words } : {}), by: BY, at });
const offSpine = (id, unit) => makeFinding({ module: "ms9-alignment", kind: "off-spine", units: [unit], statusClass: "question", route: "digest", basis: "b",
  evidence: { type: "judgment", note: `${unit} teaches nothing in the chapter's approved plan: keep it (the spine may need it) or drop it?`, dispatch: id } });
const kc = (id, unit, sugg = "treat heat as a product") => makeFinding({ module: "ms8-verdicts", kind: "knowledge-concern", units: [unit], statusClass: "question", route: "digest", basis: "b",
  evidence: { type: "judgment", note: "Heat is a product of an exothermic reaction, not a reactant.", quote: "treat heat as a reactant", ...(sugg ? { suggestion: sugg } : {}), dispatch: id } });
const clar = (id, unit) => makeFinding({ module: "ms8-verdicts", kind: "clarification-proposed", units: [unit], statusClass: "question", route: "digest", basis: "b",
  evidence: { type: "judgment", quote: "heat as a participant", suggestion: "heat as a product", dispatch: id, note: `Clarify: "heat as a participant" → "heat as a product". Sign of ΔH.` } });
const amb = (id, unit) => makeFinding({ module: "ms7-consistency", kind: "ambiguous-answer", units: [unit], statusClass: "question", route: "digest", basis: "b",
  evidence: { type: "judgment", note: `x: the answer states two different values of one dimension (0.50 M; 1.5 M) — ${id}` } });
const exercise = (id, unit) => makeFinding({ module: "ms8-verdicts", kind: "exercise-data-confirm", units: [unit], statusClass: "question", route: "digest", basis: "b", recommendation: "confirm",
  evidence: { type: "judgment", note: `${unit}: the values here read as invented exercise data, which no source can show — confirm them as teaching hypotheticals?`, quote: "0.25 M", dispatch: id } });

// ---- HIGH-1: `done` was keyed on the item alone; Alembic gives every answer of a digest the same item ------------------
test("[req.host.alembic-needs-apply] audit9 HIGH-1: every answer of one digest (one Alembic item) is recorded", async (t) => {
  const c = course(t);
  // a kind that is never grouped (a confirmation, words required; grouped findings 2026-11-17): one question per finding
  const F = [exercise("h1a", P1), exercise("h1b", P2), exercise("h1c", U3)];
  const qs = dq(await exportNeeds(c.root, { changesetId: "audit9-h1-0001", gate: { findings: F } }));
  assert.equal(qs.length, 3, "precondition: one question per finding");
  const W = { words: "They are teaching examples." };
  const a = applyChanges(c.root, { answers: qs.map((q) => row("audit9-h1-0001", q.id, "Confirm", W)) });
  assert.equal(a.recorded.length, 3, `all three answers are recorded: skipped ${JSON.stringify(a.skipped)}`);
  assert.deepEqual(a.skipped, []);
  // the same changes read again: nothing twice
  const again = applyChanges(c.root, { answers: qs.map((q) => row("audit9-h1-0001", q.id, "Confirm", W)) });
  assert.equal(again.recorded.length, 0); assert.deepEqual(again.skipped.map((s) => s.reason), ["already recorded", "already recorded", "already recorded"]);
});

test("[req.host.alembic-needs-apply] audit9 HIGH-1: a digest answered in part, then caught up, records each answer once", async (t) => {
  const c = course(t);
  const F = [exercise("h1p", P1), exercise("h1q", P2), exercise("h1r", U3)];
  const W = { words: "They are teaching examples." };
  const qs = dq(await exportNeeds(c.root, { changesetId: "audit9-h1-0002", gate: { findings: F } }));
  // the instructor answered one question; a job read it (exactly what 0fca6cb's apply recorded on testing)
  assert.equal(applyChanges(c.root, { answers: [row("audit9-h1-0002", qs[0].id, "Confirm", W)] }).recorded.length, 1);
  // a re-export before the rest arrives re-asks only the unrecorded ones (a record written under the old keying is the
  // same: its one marker names the first answer, the others were never recorded)
  const re = dq(await exportNeeds(c.root, { changesetId: "audit9-h1-0003", gate: { findings: F } }));
  assert.deepEqual(re.map((q) => q.id).sort(), [qs[1].id, qs[2].id].sort(), "the unanswered two are asked again, the answered one is not");
  // later the instructor answers the rest of the first digest; Alembic returns every answer of the row
  const all = applyChanges(c.root, { answers: qs.map((q, i) => row("audit9-h1-0002", q.id, "Confirm", { ...W, at: `2026-11-16T10:0${i}:00Z` })) });
  assert.equal(all.recorded.length, 2, `the two later answers are recorded: ${JSON.stringify(all.skipped)}`);
  assert.deepEqual(all.skipped.map((s) => s.reason), ["already recorded"]);
  assert.equal(instr(c.log()).length, 3);
  assert.deepEqual(dq(await exportNeeds(c.root, { changesetId: "audit9-h1-0004", gate: { findings: F } })), [], "all settled");
});

test("[req.host.alembic-needs-apply] audit9 HIGH-1: an asked-again marker does not poison its siblings in the digest", async (t) => {
  const c = course(t);
  const F = [kc("h1k", P1), offSpine("h1o", P2)];
  const qs = dq(await exportNeeds(c.root, { changesetId: "audit9-h1-0005", gate: { findings: F } }));
  const con = qs.find((q) => q.choices?.includes("Change it differently")), off = qs.find((q) => q.choices?.includes("Drop it"));
  assert.ok(con && off, "precondition: both questions have their choices");
  const a = applyChanges(c.root, { answers: [row("audit9-h1-0005", con.id, "Change it differently", { at: "2026-11-16T10:00:00Z" }), row("audit9-h1-0005", off.id, "Keep it", { at: "2026-11-16T10:00:01Z" })] });
  assert.deepEqual(a.recorded.map((x) => x.question), [off.id], `the sibling is recorded: ${JSON.stringify(a.skipped)}`);
  assert.match(a.skipped[0].reason, /needs the instructor's words/);
});

// ---- MEDIUM-1: a passage the text no longer holds still offered one-click Apply ----------------------------------------
test("[req.host.alembic-needs-wording] audit9 MEDIUM-1: a gone passage offers no choice, for every kind, and says it is no longer in the text", async (t) => {
  const c = course(t);
  const qs = dq(await exportNeeds(c.root, { changesetId: "audit9-m1-0001", gate: { findings: [kc("m1a", GONE), clar("m1b", GONE), offSpine("m1c", GONE)] } }));
  assert.equal(qs.length, 3);
  for (const q of qs) {
    assert.equal(q.choices, undefined, `no one-click choice on a gone passage: ${q.text} ${JSON.stringify(q.choices)}`);
    assert.match(`${q.text}\n${q.detail}`, /no longer in the text/, q.text);
    assert.equal(q.words, "optional");
  }
});

// ---- MEDIUM-2: the digest cap counted clusters before the split; one huge cluster took every slot ----------------------
test("[req.host.alembic-needs-export] audit9 MEDIUM-2: the instructor's cap counts questions after the split", async (t) => {
  const c = course(t);
  appendLogRecord(c.root, { type: "steering", party: { role: "instructor", name: "Yu" }, payload: { event: "digest-cap", cap: 3, instructorWords: "Three at a time." } });
  const F = Array.from({ length: 8 }, (_, i) => exercise(`m2-${i}`, [P1, P2, U3][i % 3])); // never grouped: one question each
  const r = await exportNeeds(c.root, { changesetId: "audit9-m2-0001", gate: { findings: F } });
  assert.equal(dq(r).length, 3, "three questions, as the instructor set");
  assert.equal(r.left, 5, "the other five wait");
});

test("[req.host.alembic-needs-export] audit9 MEDIUM-2: a large cluster shares the digest with the other kinds (round robin)", async (t) => {
  const c = course(t);
  const big = Array.from({ length: 30 }, (_, i) => exercise(`m2s-${i}`, [P1, P2][i % 2]));
  const r = await exportNeeds(c.root, { changesetId: "audit9-m2-0002", gate: { findings: [...big, kc("m2-kc", P1), amb("m2-amb", P2)] } });
  const q = rec(c.root), kinds = dq(r).map((x) => q[x.id].entry.kind);
  assert.ok(kinds.includes("knowledge-concern") && kinds.includes("ambiguous-answer"), `the other kinds get a turn: ${JSON.stringify(kinds)}`);
  assert.ok(dq(r).length <= 10, "within the default cap");
});

// ---- LOW-1: apply trusted the record's `words` for a binding kind --------------------------------------------------------
test("[req.host.alembic-needs-apply] audit9 LOW-1: Confirm without words is refused even when the record says words are optional", async (t) => {
  const c = course(t);
  const q = dq(await exportNeeds(c.root, { changesetId: "audit9-l1-0001", gate: { findings: [exercise("l1", P1)] } }))[0];
  assert.ok(q.choices?.includes("Confirm"));
  const f = path.join(c.root, NEEDS_FILE), n = JSON.parse(fs.readFileSync(f, "utf8"));
  n.handins.at(-1).questions[q.id].words = "optional"; fs.writeFileSync(f, JSON.stringify(n));
  const a = applyChanges(c.root, { answers: [row("audit9-l1-0001", q.id, "Confirm")] });
  assert.deepEqual(a.recorded, []); assert.match(a.skipped[0]?.reason || "", /words are required/);
  assert.ok(!c.log().some((x) => x.type === "confirmation"), "nothing confirmed");
  // Later stays one click
  assert.equal(applyChanges(c.root, { answers: [row("audit9-l1-0001", q.id, "Later", { item: "row-2" })] }).recorded[0]?.outcome, "deferred");
});

// ---- LOW-2: Later on a split question was keyed key#finding, which buildDigest never read -----------------------------------
test("[req.host.alembic-needs-export] audit9 LOW-2: Later on one finding of a split cluster comes back first, marked", async (t) => {
  const c = course(t);
  const F = [exercise("l2a", P1), exercise("l2b", P2), exercise("l2c", U3)];
  const qs = dq(await exportNeeds(c.root, { changesetId: "audit9-l2-0001", gate: { findings: F } }));
  assert.equal(applyChanges(c.root, { answers: [row("audit9-l2-0001", qs[2].id, "Later", { words: "Not now." })] }).recorded[0]?.outcome, "deferred");
  const again = dq(await exportNeeds(c.root, { changesetId: "audit9-l2-0002", gate: { findings: F } }));
  assert.equal(again[0].id, qs[2].id, "the deferred one goes first");
  assert.match(again[0].detail || "", /Later last time/);
  assert.ok(again.slice(1).every((q) => !/Later last time/.test(q.detail || "")), "only it is marked");
});

// ---- LOW-3: a cluster was split only when its FIRST finding had choices -------------------------------------------------------
test("[req.host.alembic-needs-export] audit9 LOW-3: a cluster is split when any of its findings has choices", async (t) => {
  const c = course(t);
  const qs = dq(await exportNeeds(c.root, { changesetId: "audit9-l3-0001", gate: { findings: [kc("l3a", P1, null), kc("l3b", P2)] } }));
  assert.equal(qs.length, 2, "one question per finding");
  assert.equal(qs.filter((q) => q.choices?.includes("Apply the suggestion")).length, 1, "the one with a suggestion offers Apply");
});

// ---- LOW-4: "and 1 more chapters" ------------------------------------------------------------------------------------------
test("[req.host.alembic-needs-wording] audit9 LOW-4: one more chapter is singular", () => {
  const titles = new Map(Array.from({ length: 6 }, (_, i) => [`ch-${i}`, `Chapter ${i}`]));
  const e = { key: "k", kind: "no-photograph", module: "ms3-format", count: 6, findings: ["a", "b", "c", "d", "e", "f"], chapters: [...titles.keys()], units: [], evidence: { note: "chapter ch-0 has no real photograph" }, question: "chapter ch-0 has no real photograph", bases: [] };
  const d = digestQuestion(e, new Map(), { titles }).detail;
  assert.match(d, /and 1 more chapter\)/); assert.doesNotMatch(d, /1 more chapters/);
});

// ---- LOW-5: the count left is in questions, and in the hand-in -------------------------------------------------------------
test("[req.host.alembic-needs-export] audit9 LOW-5: the hand-in says how many more questions will follow", async (t) => {
  const c = course(t);
  appendLogRecord(c.root, { type: "steering", party: { role: "instructor", name: "Yu" }, payload: { event: "digest-cap", cap: 2, instructorWords: "Two." } });
  // a cluster of 4 exercise-data findings (never grouped) and a cluster no choice acts on (2 findings, one question in words)
  const F = [...Array.from({ length: 4 }, (_, i) => exercise(`l5-${i}`, [P1, P2][i % 2])), amb("l5-a1", P1), amb("l5-a2", P2)];
  const r = await exportNeeds(c.root, { changesetId: "audit9-l5-0001", gate: { findings: F } });
  assert.equal(dq(r).length, 2);
  assert.equal(r.left, 3, "4 + 1 questions in all, 2 shown");
  assert.equal(r.handin.digest.remaining, 3, "the hand-in carries it for Alembic");
  assert.deepEqual(handinProblems(r.handin), []);
});

// ---- LOW-6: rights interrupt named the source by its file stem; an unknown plan node was "a point in the plan" -------------
test("[req.host.alembic-needs-wording] audit9 LOW-6: a source is named by its title, in plain words; an unknown plan node by what it is", (t) => {
  const c = course(t);
  const ctx = { sources: new Map([["wikipedia-anchor", "Chemical equilibrium"]]), titles: new Map([["le-chatelier", "Le Chatelier's Principle"]]), nodes: new Map() };
  for (const note of ["inputs/wikipedia-anchor.md has no captured rights evidence", "source wikipedia-anchor: no rights receipt", "The source “wikipedia-anchor” has no captured rights evidence."]) {
    const s = forInstructor(note, ctx);
    assert.match(s, /“Chemical equilibrium”/, s); assert.doesNotMatch(s, /wikipedia-anchor|rights evidence|receipt/, s);
  }
  const n = forInstructor("move it to le-chatelier (objective.le-chatelier.shift-direction)", ctx);
  assert.doesNotMatch(n, /a point in the plan|objective\./, n);
  assert.match(n, /objective “Shift direction”/, n);
  // the real export reads the titles from FOUNDATION.json
  const f = makeFinding({ module: "ms2-rights", kind: "rights-source-blocker", units: [], statusClass: "obligation", route: "interrupt", interruptReason: "rights-blocker", basis: "b",
    evidence: { type: "missing", what: "source wikipedia-anchor: no rights receipt" } });
  return exportNeeds(c.root, { changesetId: "audit9-l6-0001", gate: { findings: [f] } }).then((r) => {
    const q = r.handin.digest.questions.find((x) => x.id.startsWith("i."));
    assert.match(q.text, /^Rights: The source “Chemical equilibrium”/, q.text);
  });
});

// ---- LOW-8: the binding guard rebuilt the whole context per answer -----------------------------------------------------------
test("[req.host.alembic-needs-apply] audit9 LOW-8: the binding guard uses the context it is given (built once per apply)", async (t) => {
  const c = course(t);
  const qs = dq(await exportNeeds(c.root, { changesetId: "audit9-l8-0001", gate: { findings: [exercise("l8", P1)] } }));
  const q = rec(c.root)[qs[0].id];
  const bc = needsMod.bindingContext(c.root, liveReader(c.root));
  // the context given is what is read: a root with nothing at it still passes with the context built from the package
  assert.equal(bindingGuard("/nonexistent-audit9", liveReader(c.root), q, q.entry, bc).ok, true);
});
