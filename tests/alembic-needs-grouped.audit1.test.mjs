// [req.host.alembic-needs-grouped] Grouped findings, audit 2026-11-19 (family FC-16 v1 §3; STATUS D-151): each finding
// of the audit is a test that failed before its fix. Probes: /tmp/grouped-audit/probe1–3.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import * as Needs from "../scripts/lib/core/alembic_needs.mjs";
const { applyChanges, exportNeeds, GROUP_LIMITS, handinProblems, NEEDS_FILE } = Needs;
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { loadUnits } from "../scripts/lib/core/obligations.mjs";
import { makeFinding } from "../scripts/lib/records/findings.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const BY = { id: "u-42", name: "Yu Wang" };
const P1 = "u-study-guide-le-chatelier-the-principle-1", P2 = "u-study-guide-le-chatelier-the-principle-2";
const U3 = "u-study-guide-le-chatelier-changing-the-temperature-1";
const UNITS = [P1, P2, U3];
function course(t) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-grouped-a1-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  return { root, log: () => parseLog(readLogText(root)) };
}
const needsOf = (root) => JSON.parse(fs.readFileSync(path.join(root, NEEDS_FILE), "utf8"));
const recOf = (root, cs) => needsOf(root).handins.find((h) => h.changesetId === cs).questions;
const instr = (log) => log.filter((x) => x.type === "answer" && x.party?.role === "instructor");
const row = (cs, q, answer, extra = {}) => ({ item: `row-${cs}`, changesetId: cs, question: q, answer, by: BY, at: "2026-11-19T10:00:00Z", ...extra });
const offSpine = (id, unit) => makeFinding({ module: "ms9-alignment", kind: "off-spine", units: [unit], statusClass: "question", route: "digest", basis: "b",
  evidence: { type: "judgment", note: `${unit} teaches nothing in the chapter's approved plan: keep it (the spine may need it) or drop it?`, dispatch: id } });
const kc = (id, unit, sugg) => makeFinding({ module: "ms8-verdicts", kind: "knowledge-concern", units: [unit], statusClass: "question", route: "digest", basis: "b",
  evidence: { type: "judgment", note: "Heat is a product of an exothermic reaction, not a reactant.", quote: "treat heat as a reactant", suggestion: sugg, dispatch: id } });
const grouped = (r) => r.handin.digest.questions.filter((q) => q.group);
const writeNeeds = (root, n) => fs.writeFileSync(path.join(root, NEEDS_FILE), JSON.stringify(n));

test("[req.host.alembic-needs-grouped] M-1: a group offering Apply lists every place it applies to (more 0); the rest go into further groups", async (t) => {
  const c = course(t);
  const F = Array.from({ length: 30 }, (_, i) => kc(`m1-${i}`, UNITS[i % 3], `UNIQUESUGG${i} make it a product`));
  const r = await exportNeeds(c.root, { changesetId: "ga1-m1-0001", gate: { findings: F } });
  assert.deepEqual(handinProblems(r.handin), []);
  const g = grouped(r);
  assert.ok(g.length >= 2, "30 places with Apply are more than one grouped question");
  for (const q of g) {
    assert.ok(q.choices.includes("Apply the suggestion"));
    assert.equal(q.group.more, 0, "no unlisted place takes Apply");
    assert.ok(q.group.places.length <= GROUP_LIMITS.places);
  }
  const s = JSON.stringify(r.handin);
  assert.equal(Array.from({ length: 30 }, (_, i) => s.includes(`UNIQUESUGG${i} `)).filter(Boolean).length, 30, "every suggestion Apply would take is shown");
  // a group without Apply may still count places in `more`
  const k = await exportNeeds(course(t).root, { changesetId: "ga1-m1-0002", gate: { findings: Array.from({ length: 30 }, (_, i) => offSpine(`m1k-${i}`, UNITS[i % 3])) } });
  assert.equal(grouped(k).length, 1); assert.equal(grouped(k)[0].group.more, 5);
});

test("[req.host.alembic-needs-grouped] M-1: apply never takes Apply on a place the question did not list (asked again on its own)", async (t) => {
  const c = course(t);
  const F = [kc("m1b-a", P1, "treat heat as a product"), kc("m1b-b", P2, "say heat is released"), kc("m1b-c", U3, "heat is a product here")];
  const q = grouped(await exportNeeds(c.root, { changesetId: "ga1-m1-0003", gate: { findings: F } }))[0];
  // a record that lists only two of three places (as one handed in before the fix could)
  const n = needsOf(c.root), kept = n.handins.at(-1).questions[q.id];
  kept.listed = 2; writeNeeds(c.root, n);
  const a = applyChanges(c.root, { answers: [row("ga1-m1-0003", q.id, "Apply the suggestion")] });
  assert.deepEqual(a.recorded[0].group, { places: 3, choices: { "Apply the suggestion": 2 }, askedAgain: 1 });
});

test("[req.host.alembic-needs-grouped] M-2: a suggestion too long for a place's detail is never cut while Apply is offered: it stays a question of its own", async (t) => {
  const c = course(t);
  const long = (k) => `SUGG${k} ${"word ".repeat(260)}END${k}`; // ~1300: past the place detail (1000), within a question's
  const F = [kc("m2-a", P1, long(0)), kc("m2-b", P2, long(1)), kc("m2-c", U3, long(2))];
  const r = await exportNeeds(c.root, { changesetId: "ga1-m2-0001", gate: { findings: F } });
  assert.equal(grouped(r).length, 0, "not grouped");
  const qs = r.handin.digest.questions;
  assert.equal(qs.length, 3);
  for (const [i, q] of qs.entries()) {
    assert.ok(q.choices?.includes("Apply the suggestion"), "its own question still offers Apply");
    assert.ok(qs.some((x) => x.detail?.includes(`END${i}`)), `suggestion ${i} shown in full`);
  }
  // mixed: the two short ones are grouped, the long one stays alone
  const m = await exportNeeds(course(t).root, { changesetId: "ga1-m2-0002", gate: { findings: [kc("m2m-a", P1, "treat heat as a product"), kc("m2m-b", P2, "say heat is released"), kc("m2m-c", U3, long(9))] } });
  assert.equal(grouped(m).length, 1); assert.equal(grouped(m)[0].group.places.length, 2);
  assert.ok(m.handin.digest.questions.some((q) => !q.group && q.detail?.includes("END9") && q.choices?.includes("Apply the suggestion")));
  for (const p of grouped(m)[0].group.places) assert.doesNotMatch(p.detail || "", /…$/, "a place's detail is whole");
});

test("[req.host.alembic-needs-grouped] L-1: the detail is true on a host without the list; the list in words is the fallback line", async (t) => {
  const c = course(t);
  const q = grouped(await exportNeeds(c.root, { changesetId: "ga1-l1-0001", gate: { findings: Array.from({ length: 6 }, (_, i) => offSpine(`l1-${i}`, UNITS[i % 3])) } }))[0];
  assert.match(q.detail, /Where the places are listed, you can choose another answer for single places\./);
  assert.doesNotMatch(q.detail, /them; you can choose another answer/);
  assert.match(q.group.fallback, /^The first places: In the study guide/);
  assert.ok(q.detail.split("\n").includes(q.group.fallback), "the fallback is a line of the detail (a host showing the list leaves it out)");
  // the shape: one line of the detail, at most 2000
  const base = { id: "g.1", text: "Same in three places.", choices: ["Keep it", "Drop it", "Later"], words: "optional", detail: "A.\nThe first places: x" };
  const h = (fallback) => handinProblems({ changesetId: "grouped-shape", digest: { questions: [{ ...base, group: { v: 1, places: [{ id: "p1", text: "x" }], more: 0, fallback } }] } });
  assert.deepEqual(h("The first places: x"), []);
  assert.ok(h("not in the detail").some((x) => /fallback/.test(x)));
  assert.ok(h("A.\nThe first places: x").some((x) => /fallback/.test(x)));
});

test("[req.host.alembic-needs-grouped] L-2: apply re-checks that the record holds a one-click kind; otherwise nothing is recorded", async (t) => {
  for (const [kind, choices] of [["exercise-data-confirm", ["Confirm", "Later"]], ["instructor-edit-unasked", ["Keep it", "Later"]], ["off-spine", ["Keep it", "Confirm"]]]) {
    const c = course(t), cs = `ga1-l2-${kind.slice(0, 8)}`;
    const q = grouped(await exportNeeds(c.root, { changesetId: cs, gate: { findings: Array.from({ length: 3 }, (_, i) => offSpine(`l2-${kind}-${i}`, UNITS[i])) } }))[0];
    const n = needsOf(c.root), kept = n.handins.at(-1).questions[q.id];
    Object.assign(kept, { entryKind: kind, choices }); writeNeeds(c.root, n);
    const a = applyChanges(c.root, { answers: [row(cs, q.id, choices[0])] });
    assert.deepEqual(a.recorded, [], kind); assert.match(a.skipped[0].reason, /one-click kind/, kind);
    assert.equal(instr(c.log()).length, 0, kind);
  }
});

test("[req.host.alembic-needs-grouped] L-4: a big grouped hand-in is kept compactly; an answer to a hand-in pushed out is reported, once", async (t) => {
  const c = course(t);
  const F = Array.from({ length: 2000 }, (_, i) => offSpine(`l4-${i}`, UNITS[i % 3]));
  await exportNeeds(c.root, { changesetId: "ga1-l4-0001", gate: { findings: F } });
  const bytes = fs.statSync(path.join(c.root, NEEDS_FILE)).size;
  assert.ok(bytes < 200 * 1024, `2,000 grouped places kept in ${bytes} bytes`);
  // each place still reads back as asked: its finding, units, bases and the text seen
  const places = Object.values(recOf(c.root, "ga1-l4-0001")).filter((q) => q.kind === "digest-group").flatMap((q) => Needs.groupRecordPlaces(q));
  assert.equal(places.length, 2000);
  assert.ok(places.every((p) => p.finding && p.bases.length === 1 && p.bases[0].basis && Object.keys(p.seen).length === 1));
  // pushed out: a hand-in the record no longer keeps
  const d = course(t);
  const q = grouped(await exportNeeds(d.root, { changesetId: "ga1-l4-0002", gate: { findings: Array.from({ length: 3 }, (_, i) => offSpine(`l4b-${i}`, UNITS[i])) } }))[0];
  const n = needsOf(d.root);
  for (let k = 1; k <= 49; k++) n.handins.push({ changesetId: `ga1-l4-filler-${String(k).padStart(2, "0")}`, at: "2026-11-19T09:00:00.000Z", questions: {} });
  writeNeeds(d.root, n);
  await exportNeeds(d.root, { changesetId: "ga1-l4-0003", gate: { findings: [] } });
  assert.ok(!needsOf(d.root).handins.some((h) => h.changesetId === "ga1-l4-0002"), "precondition: pushed out");
  const a = applyChanges(d.root, { answers: [row("ga1-l4-0002", q.id, "Keep it")] });
  assert.equal(a.ignored, 0, "not ignored silently");
  assert.match(a.skipped[0]?.reason || "", /no longer.*asked again/);
  assert.ok(d.log().some((r) => r.type === "contact" && r.payload?.question === q.id && r.payload.outcome === "asked again"));
  assert.deepEqual(applyChanges(d.root, { answers: [row("ga1-l4-0002", q.id, "Keep it")] }).skipped.map((s) => s.reason), ["already recorded"]);
  await assert.rejects(exportNeeds(d.root, { changesetId: "ga1-l4-0002", gate: { findings: [] } }), /already handed in/);
});

test("[req.host.alembic-needs-grouped] L-5: gone places return as a words question; a Later place is never folded into it, and is marked", async (t) => {
  const c = course(t);
  const F = [offSpine("l5-a", P1), offSpine("l5-b", P2), offSpine("l5-c", U3)];
  const q = grouped(await exportNeeds(c.root, { changesetId: "ga1-l5-0001", gate: { findings: F } }))[0];
  // the passage of U3 is removed from its file (the file's units are read anew: every place is gone)
  const u = loadUnits(c.root, liveReader(c.root)).find((x) => x.id === U3);
  const file = path.join(c.root, u.locator.deliverable);
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(u.text.trim(), ""));
  const a = applyChanges(c.root, { answers: [row("ga1-l5-0001", q.id, "Keep it", { exceptions: { p2: "Later" } })] });
  assert.equal(a.recorded[0].group.choices.Later, 1);
  const r = await exportNeeds(c.root, { changesetId: "ga1-l5-0002", gate: { findings: F } });
  const rec = recOf(c.root, "ga1-l5-0002"), findingsOf = (x) => rec[x.id].entry?.findings || [];
  const later = r.handin.digest.questions.filter((x) => findingsOf(x).includes(F[1].id));
  assert.equal(later.length, 1); assert.deepEqual(findingsOf(later[0]), [F[1].id], "the Later place is a question of its own");
  assert.match(later[0].detail, /You chose Later last time\./);
  const rest = r.handin.digest.questions.filter((x) => !findingsOf(x).includes(F[1].id));
  assert.ok(rest.length >= 1);
  for (const x of rest) { assert.equal(x.choices, undefined, "a gone passage is answered in words"); assert.doesNotMatch(x.detail || "", /Later last time/); }
});

test("[req.host.alembic-needs-grouped] minor: a grouped question says Later last time for all, or for some, of its places as they were", async (t) => {
  const c = course(t);
  const F = Array.from({ length: 4 }, (_, i) => offSpine(`mi-${i}`, UNITS[i % 3]));
  const q = grouped(await exportNeeds(c.root, { changesetId: "ga1-mi-0001", gate: { findings: F.slice(0, 3) } }))[0];
  applyChanges(c.root, { answers: [row("ga1-mi-0001", q.id, "Later")] });
  const all = grouped(await exportNeeds(c.root, { changesetId: "ga1-mi-0002", gate: { findings: F.slice(0, 3) } }))[0];
  assert.match(all.detail, /You chose Later last time for all of these places\./);
  const some = grouped(await exportNeeds(c.root, { changesetId: "ga1-mi-0003", gate: { findings: F } }))[0];
  assert.equal(some.group.places.length, 4);
  assert.match(some.detail, /You chose Later last time for some of these places\./);
});
