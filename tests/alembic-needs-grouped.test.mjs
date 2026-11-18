// [req.host.alembic-needs-grouped] Grouped findings (owner 2026-11-17; family FC-16 v1 §3): a finding that comes up in many
// places reaches the instructor as ONE grouped question in Alembic's Needs you, with choices for all and exceptions for
// single places; the answer is applied place by place through the binding guard. The answers use Alembic's real shape
// (agent-endpoint.ts changes: `{ item, changesetId, question, answer, words?, via?, exceptions?, by, at }`).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendLogRecord, parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { applyChanges, exportNeeds, GROUP_LIMITS, handinProblems, NEEDS_FILE, owedWords, takenUp } from "../scripts/lib/core/alembic_needs.mjs";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { loadUnits } from "../scripts/lib/core/obligations.mjs";
import { makeFinding } from "../scripts/lib/records/findings.mjs";
import { harnessTraces } from "../scripts/lib/core/needs_wording.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const BY = { id: "u-42", name: "Yu Wang" };
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const P1 = "u-study-guide-le-chatelier-the-principle-1", P2 = "u-study-guide-le-chatelier-the-principle-2";
const U3 = "u-study-guide-le-chatelier-changing-the-temperature-1";
const UNITS = [P1, P2, U3];
function course(t) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-grouped-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  return { root, log: () => parseLog(readLogText(root)) };
}
const rec = (root) => JSON.parse(fs.readFileSync(path.join(root, NEEDS_FILE), "utf8")).handins.at(-1).questions;
const instr = (log) => log.filter((x) => x.type === "answer" && x.party?.role === "instructor");
const row = (cs, q, answer, { words, exceptions, via, at = "2026-11-17T10:00:00Z" } = {}) => ({ item: `row-${cs}`, changesetId: cs, question: q, answer, ...(words ? { words } : {}), ...(exceptions ? { exceptions } : {}), ...(via ? { via } : {}), by: BY, at });
const offSpine = (id, unit) => makeFinding({ module: "ms9-alignment", kind: "off-spine", units: [unit], statusClass: "question", route: "digest", basis: "b",
  evidence: { type: "judgment", note: `${unit} teaches nothing in the chapter's approved plan: keep it (the spine may need it) or drop it?`, dispatch: id } });
const kc = (id, unit, sugg) => makeFinding({ module: "ms8-verdicts", kind: "knowledge-concern", units: [unit], statusClass: "question", route: "digest", basis: "b",
  evidence: { type: "judgment", note: "Heat is a product of an exothermic reaction, not a reactant.", quote: "treat heat as a reactant", suggestion: sugg, dispatch: id } });
const exercise = (id, unit) => makeFinding({ module: "ms8-verdicts", kind: "exercise-data-confirm", units: [unit], statusClass: "question", route: "digest", basis: "b", recommendation: "confirm",
  evidence: { type: "judgment", note: `${unit}: the values here read as invented exercise data, which no source can show — confirm them as teaching hypotheticals?`, quote: "0.25 M", dispatch: id } });
const authorship = (id, unit) => makeFinding({ module: "skeleton", kind: "unit-unknown-authorship", units: [unit], statusClass: "question", route: "digest", basis: "b",
  evidence: { type: "missing", what: `${unit} was changed outside the agent's work`, dispatch: id } });
const many = (n, mk, prefix) => Array.from({ length: n }, (_, i) => mk(`${prefix}-${i}`, UNITS[i % 3]));
const grouped = (r) => r.handin.digest.questions.filter((q) => q.group);
/** Change a unit's text in its file (the instructor edited it after the question was asked). */
function edit(root, unit) {
  const u = loadUnits(root, liveReader(root)).find((x) => x.id === unit);
  const file = path.join(root, u.locator.deliverable), text = fs.readFileSync(file, "utf8");
  const words = u.text.trim().split(/\s+/).slice(0, 4).join(" ");
  assert.ok(text.includes(words), "precondition: the unit's words are in its file");
  fs.writeFileSync(file, text.replace(words, `${words} (edited)`));
}

test("[req.host.alembic-needs-grouped] many places of one finding are ONE grouped question: 25 listed, the rest counted", async (t) => {
  const c = course(t);
  const r = await exportNeeds(c.root, { changesetId: "grouped-0001", gate: { findings: many(30, offSpine, "g1") } });
  assert.deepEqual(handinProblems(r.handin), []);
  const qs = r.handin.digest.questions;
  assert.equal(qs.length, 1, "one question for 30 places");
  const q = qs[0];
  assert.deepEqual(q.choices, ["Keep it", "Drop it", "Later"]);
  assert.equal(q.words, "optional");
  assert.equal(q.group.v, 1);
  assert.equal(q.group.places.length, GROUP_LIMITS.places);
  assert.equal(q.group.more, 5);
  assert.match(q.text, /30 passages/); assert.match(q.text, /applies to all 30/);
  assert.match(q.detail, /the 5 not listed here too/);
  assert.match(q.detail, /asked again on its own/);
  // each place as the instructor sees it (D-133): the place, the passage beginning; no path, no unit id
  for (const p of q.group.places) {
    assert.match(p.text, /^In the study guide for “[^”]+”, the passage beginning “/, p.text);
    assert.doesNotMatch(p.text, /u-study-guide|\.md\b/);
    assert.equal(typeof p.ref, "string");
  }
  // worded for the instructor (D-133): no harness trace in the question or any place
  for (const x of [q.text, q.detail, ...q.group.places.flatMap((p) => [p.text, p.detail || ""])]) assert.deepEqual(harnessTraces(x), [], x);
  // the record keeps every place, as asked
  const kept = rec(c.root)[q.id];
  assert.equal(kept.kind, "digest-group");
  assert.equal(kept.places.length, 30);
  assert.ok(kept.places.every((p) => p.finding && p.bases.length === 1 && Object.keys(p.seen).length === 1));
  assert.equal(kept.places.filter((p) => p.listed).length, 25);
  assert.equal(r.counts.grouped, 1);
  assert.equal(r.left, 0);
});

test("[req.host.alembic-needs-grouped] a grouped question counts as one in the instructor's cap, beside the other kinds", async (t) => {
  const c = course(t);
  appendLogRecord(c.root, { type: "steering", party: { role: "instructor", name: "Yu" }, payload: { event: "digest-cap", cap: 3, instructorWords: "Three at a time." } });
  const r = await exportNeeds(c.root, { changesetId: "grouped-0002", gate: { findings: [...many(12, offSpine, "g2"), ...many(4, exercise, "g2e")] } });
  const qs = r.handin.digest.questions;
  assert.equal(qs.length, 3);
  assert.equal(grouped(r).length, 1, "the twelve off-plan passages are one question");
  assert.equal(r.left, 2, "the four confirmations (never grouped) are one question each: two wait");
  assert.equal(r.handin.digest.remaining, 2);
});

test("[req.host.alembic-needs-grouped] one answer applies to every place, listed or not, in one answer record", async (t) => {
  const c = course(t);
  const F = many(30, offSpine, "g3");
  const q = grouped(await exportNeeds(c.root, { changesetId: "grouped-0003", gate: { findings: F } }))[0];
  const a = applyChanges(c.root, { answers: [row("grouped-0003", q.id, "Keep it")] });
  assert.deepEqual(a.skipped, []);
  assert.equal(a.recorded[0].outcome, "answered");
  assert.deepEqual(a.recorded[0].group, { places: 30, choices: { "Keep it": 30 }, askedAgain: 0 });
  const answers = instr(c.log());
  assert.equal(answers.length, 1, "one answer record");
  assert.equal(answers[0].payload.answers.length, 30);
  assert.ok(answers[0].payload.answers.every((x) => x.choice === "Keep it" && /#f-/.test(x.entry)), "each place keyed as its own question (cluster#finding)");
  assert.equal(answers[0].payload.instructorWords, "Keep it", "the one-click choice is the recorded answer");
  // settled: nothing is asked again, and the same answer read again is not recorded twice
  assert.equal((await exportNeeds(c.root, { changesetId: "grouped-0004", gate: { findings: F } })).handin.digest.questions.length, 0);
  assert.deepEqual(applyChanges(c.root, { answers: [row("grouped-0003", q.id, "Keep it")] }).skipped.map((s) => s.reason), ["already recorded"]);
});

test("[req.host.alembic-needs-grouped] exceptions for single places: Drop it goes to the assistant, Later comes back first", async (t) => {
  const c = course(t);
  const F = many(6, offSpine, "g5");
  const q = grouped(await exportNeeds(c.root, { changesetId: "grouped-0005", gate: { findings: F } }))[0];
  const a = applyChanges(c.root, { answers: [row("grouped-0005", q.id, "Keep it", { exceptions: { p2: "Drop it", p3: "Later", p4: "Keep it" } })] });
  assert.deepEqual(a.skipped, []);
  assert.equal(a.recorded[0].outcome, "answered in part");
  assert.deepEqual(a.recorded[0].group.choices, { "Keep it": 4, "Drop it": 1, Later: 1 });
  assert.deepEqual(a.recorded[0].exceptions, { p2: "Drop it", p3: "Later" }, "an exception equal to the answer is no exception");
  assert.match(a.recorded[0].owed, /taken-up/);
  const kept = rec(c.root)[q.id], byPlace = new Map(kept.places.map((p) => [p.id, p.finding]));
  const choiceOf = new Map(instr(c.log()).flatMap((r) => r.payload.answers).map((x) => [x.finding, x.choice]));
  assert.equal(choiceOf.get(byPlace.get("p2")), "said: Drop it");
  assert.equal(choiceOf.get(byPlace.get("p3")), "Later");
  assert.equal(choiceOf.get(byPlace.get("p1")), "Keep it");
  // the Drop it is owed to the assistant, once per question, until it records what it did
  const owed = owedWords(c.root);
  assert.equal(owed.length, 1); assert.equal(owed[0].question, q.id); assert.equal(owed[0].kind, "off-spine");
  takenUp(c.root, { changesetId: "grouped-0005", question: q.id, note: "Removed the passage." }, AGENT);
  assert.deepEqual(owedWords(c.root), []);
  // the Later place comes back, first and marked; the rest are settled
  const again = (await exportNeeds(c.root, { changesetId: "grouped-0006", gate: { findings: F } })).handin.digest.questions;
  assert.equal(again.length, 1);
  assert.match(again[0].detail, /Later last time/);
  assert.equal(rec(c.root)[again[0].id].entry?.findings?.[0] ?? rec(c.root)[again[0].id].places?.[0]?.finding, byPlace.get("p3"));
});

test("[req.host.alembic-needs-grouped] a place changed since it was asked is asked again on its own; the rest are recorded", async (t) => {
  const c = course(t);
  const F = [offSpine("g7a", P1), offSpine("g7b", P2), offSpine("g7c", U3), offSpine("g7d", P2)];
  const q = grouped(await exportNeeds(c.root, { changesetId: "grouped-0007", gate: { findings: F } }))[0];
  assert.equal(q.group.places.length, 4);
  edit(c.root, P2);
  const a = applyChanges(c.root, { answers: [row("grouped-0007", q.id, "Keep it")] });
  assert.equal(a.recorded[0].outcome, "answered in part");
  assert.deepEqual(a.recorded[0].group, { places: 4, choices: { "Keep it": 2 }, askedAgain: 2 });
  const kept = new Set(instr(c.log()).flatMap((r) => r.payload.answers).map((x) => x.finding));
  assert.ok(kept.has(F[0].id) && kept.has(F[2].id) && !kept.has(F[1].id) && !kept.has(F[3].id), "only the unchanged places are kept");
  const mark = c.log().find((r) => r.type === "contact" && r.payload?.outcome === "asked again" && r.payload.group);
  assert.deepEqual([...mark.payload.alone].sort(), [F[1].id, F[3].id].sort());
  // asked again on its own: the two changed places are two questions, never grouped again
  const again = await exportNeeds(c.root, { changesetId: "grouped-0008", gate: { findings: F } });
  assert.equal(grouped(again).length, 0);
  assert.equal(again.handin.digest.questions.length, 2);
  assert.ok(again.handin.digest.questions.every((x) => x.choices?.includes("Keep it")));
  // every place changed: nothing is recorded, and it is said (a word to the assistant, Drop it, needs no guard)
  const c2 = course(t);
  const q2 = grouped(await exportNeeds(c2.root, { changesetId: "grouped-0009", gate: { findings: [offSpine("g9a", P2), offSpine("g9b", P2)] } }))[0];
  edit(c2.root, P2);
  const b = applyChanges(c2.root, { answers: [row("grouped-0009", q2.id, "Keep it")] });
  assert.deepEqual(b.recorded, []); assert.match(b.skipped[0].reason, /every place changed/);
  assert.equal(instr(c2.log()).length, 0);
  assert.deepEqual(applyChanges(c2.root, { answers: [row("grouped-0009", q2.id, "Keep it")] }).skipped.map((s) => s.reason), ["already recorded"]);
});

test("[req.host.alembic-needs-grouped] confirmations, rights and authorship are never grouped (words required, one place each)", async (t) => {
  const c = course(t);
  const r = await exportNeeds(c.root, { changesetId: "grouped-0010", gate: { findings: [...many(5, exercise, "g10"), ...many(3, authorship, "g10a")] } });
  assert.equal(grouped(r).length, 0);
  assert.equal(r.handin.digest.questions.length, 8);
  for (const q of r.handin.digest.questions) if (q.choices && !q.choices.every((x) => x === "Later")) assert.equal(q.words, "required", q.text);
});

test("[req.host.alembic-needs-grouped] suggestions: Apply the suggestion for all takes each place's own, shown with it; owed to the assistant", async (t) => {
  const c = course(t);
  const F = [kc("g11a", P1, "treat heat as a product"), kc("g11b", P2, "say heat is released"), kc("g11c", U3, "heat is a product here")];
  const r = await exportNeeds(c.root, { changesetId: "grouped-0011", gate: { findings: F } });
  const q = grouped(r)[0];
  assert.ok(q, "one grouped question");
  assert.deepEqual(q.choices, ["Apply the suggestion", "Keep it", "Later"], "no Change it differently for all: it takes words for one place");
  assert.equal(q.recommended, undefined, "a suggestion is never pre-chosen");
  assert.match(q.detail, /each place's own suggestion/);
  for (const [i, s] of ["treat heat as a product", "say heat is released", "heat is a product here"].entries()) assert.ok(`${q.group.places[i].text}\n${q.group.places[i].detail || ""}`.includes(s), s);
  const a = applyChanges(c.root, { answers: [row("grouped-0011", q.id, "Apply the suggestion", { exceptions: { p2: "Keep it" } })] });
  assert.deepEqual(a.recorded[0].group.choices, { "Apply the suggestion": 2, "Keep it": 1 });
  assert.match(a.recorded[0].owed, /taken-up/, "Apply on a knowledge concern is work for the assistant");
  assert.equal(owedWords(c.root).length, 1);
});

test("[req.host.alembic-needs-grouped] an answer without exceptions (an Alembic that does not show the list) applies to all", async (t) => {
  const c = course(t);
  const q = grouped(await exportNeeds(c.root, { changesetId: "grouped-0012", gate: { findings: many(4, offSpine, "g12") } }))[0];
  // the question reads without its list: the detail says how many places and names the first ones
  assert.match(q.detail, /This comes up in 4 places/); assert.match(q.detail, /The first places: In the study guide/);
  const a = applyChanges(c.root, { answers: [row("grouped-0012", q.id, "Later")] });
  assert.equal(a.recorded[0].outcome, "deferred");
  assert.equal(instr(c.log())[0].payload.answers.length, 4);
});

test("[req.host.alembic-needs-grouped] exceptions that are not the question's are refused, and nothing is recorded", async (t) => {
  const c = course(t);
  const q = grouped(await exportNeeds(c.root, { changesetId: "grouped-0013", gate: { findings: many(30, offSpine, "g13") } }))[0];
  const bad = [
    [{ p30: "Drop it" }, /did not list/], // a place past the 25 listed
    [{ p1: "Apply the suggestion" }, /not one of the choices/],
    [["p1"], /not places with answers/],
  ];
  for (const [exceptions, re] of bad) {
    const a = applyChanges(c.root, { answers: [{ ...row("grouped-0013", q.id, "Keep it"), exceptions }] });
    assert.deepEqual(a.recorded, []); assert.match(a.skipped[0].reason, re);
  }
  assert.equal(instr(c.log()).length, 0);
  assert.match(applyChanges(c.root, { answers: [row("grouped-0013", q.id, "Remove all")] }).skipped[0].reason, /not one of the choices/);
});

test("[req.host.alembic-needs-grouped] handinProblems: the group's shape (FC-16 v1 §3)", () => {
  const base = { id: "g.1", text: "Same in three places.", choices: ["Keep it", "Drop it", "Later"], words: "optional" };
  const ok = { changesetId: "grouped-shape", digest: { questions: [{ ...base, group: { v: 1, places: [{ id: "p1", text: "In the study guide, the passage beginning “a”", ref: "study-guides/a.md" }], more: 2 } }] } };
  assert.deepEqual(handinProblems(ok), []);
  const bad = (group, q = {}) => handinProblems({ changesetId: "grouped-shape", digest: { questions: [{ ...base, ...q, group }] } });
  const place = { id: "p1", text: "x" };
  assert.ok(bad({ v: 2, places: [place], more: 0 }).some((x) => /group.v/.test(x)));
  assert.ok(bad({ v: 1, places: [place], more: 0 }, { choices: undefined }).some((x) => /needs choices/.test(x)));
  assert.ok(bad({ v: 1, places: [place], more: 0 }, { words: "required" }).some((x) => /never words-required/.test(x)));
  assert.ok(bad({ v: 1, places: Array.from({ length: 26 }, (_, i) => ({ id: `p${i}`, text: "x" })), more: 0 }).some((x) => /1–25/.test(x)));
  assert.ok(bad({ v: 1, places: [], more: 0 }).some((x) => /1–25/.test(x)));
  assert.ok(bad({ v: 1, places: [place, place], more: 0 }).some((x) => /id/.test(x)));
  assert.ok(bad({ v: 1, places: [{ id: "p1", text: "two\nlines" }], more: 0 }).some((x) => /one line/.test(x)));
  assert.ok(bad({ v: 1, places: [{ id: "p1", text: "x", ref: "/abs" }], more: 0 }).some((x) => /course path/.test(x)));
  assert.ok(bad({ v: 1, places: [{ id: "p1", text: "x", detail: "d".repeat(1001) }], more: 0 }).some((x) => /detail/.test(x)));
  assert.ok(bad({ v: 1, places: [{ id: "p1", text: "x", note: "n" }], more: 0 }).some((x) => /unknown field note/.test(x)));
  assert.ok(bad({ v: 1, places: [place], more: -1 }).some((x) => /group.more/.test(x)));
  assert.ok(bad({ v: 1, places: [place], more: 0, extra: 1 }).some((x) => /unknown field extra/.test(x)));
});

test("[req.host.alembic-needs-grouped] the places one hand-in groups are bounded; the rest wait, never dropped", async (t) => {
  const c = course(t);
  // 2 clusters of 1,200 places (different notes): 500 per grouped question, at most 2,000 grouped places per hand-in
  const other = (id, unit) => makeFinding({ module: "ms9-alignment", kind: "off-spine", units: [unit], statusClass: "question", route: "digest", basis: "b",
    evidence: { type: "judgment", note: `Another reading: ${unit} is outside the plan.`, dispatch: id } });
  const r = await exportNeeds(c.root, { changesetId: "grouped-0014", gate: { findings: [...many(1200, offSpine, "g14"), ...many(1200, other, "g14o")] } });
  const g = grouped(r), n = (q) => q.group.places.length + q.group.more;
  assert.ok(g.every((q) => n(q) <= GROUP_LIMITS.perQuestion));
  assert.ok(g.reduce((s, q) => s + n(q), 0) <= GROUP_LIMITS.perHandin);
  assert.equal(r.left, 6 - g.length, "every place not handed in waits for the next hand-in");
  assert.ok(fs.statSync(path.join(c.root, NEEDS_FILE)).size < 3 * 1024 * 1024, "the needs record stays within 3 MB");
});
