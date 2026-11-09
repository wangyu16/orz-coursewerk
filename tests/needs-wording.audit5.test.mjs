// [req.host.alembic-needs-apply] [req.host.alembic-needs-wording] Closed-loop audit, round 5, of D-133 (needs-wording a888103 on main 75e808f): the
// `said` / `taken-up` path, the live-text `seen` binding, old records, and a fresh pass. Each finding test FAILS on
// a888103 and names one finding (severity in its name). Only public functions and the real C2 package are used;
// nothing here changes implementation. Adopted with the round's fixes, unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { indexAndStamp, instructorActsOf, loadUnits, owedChanges } from "../scripts/lib/core/obligations.mjs";
import { beginSession, claimAuthorship, instructorRegister } from "../scripts/lib/core/units_index.mjs";
import { parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { recordFile } from "../scripts/lib/records/paths.mjs";
import { applyChanges, exportNeeds, NEEDS_FILE, takenUp } from "../scripts/lib/core/alembic_needs.mjs";
import { saidOwed } from "../scripts/lib/core/digest.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const BY = { id: "u-42", name: "Yu Wang" };
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const SG = "study-guide/le-chatelier.md", ANCHOR = "but it also slows the rate.";
const U3 = "u-study-guide-chemical-equilibrium-the-equilibrium-constant-3";
function course(t) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-wording-audit5-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  const r = () => liveReader(root);
  return {
    root, r,
    units: () => loadUnits(root, r()),
    find: (text) => loadUnits(root, r()).find((u) => u.text === text),
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent(fn) { beginSession(root, r(), AGENT); fn(); indexAndStamp(root, r(), { as: "agent", party: AGENT }); },
    log: () => parseLog(readLogText(root)),
  };
}
const finding = (id, kind, units, evidence, more = {}) => ({ id, module: "skeleton", kind, units, statusClass: "question", route: "digest", status: "open", evidence, ...more });
const answer = (changesetId, question, item, text, words = text) => ({ item, changesetId, question, answer: text, words, by: BY, at: "2026-11-09T12:00:00.000Z" });

// ---- HIGH-1: "absent" passes when the removed text came back under another unit (its lineage) ------------------------
// The question about an unasked REMOVAL of the instructor's text (ms8-verdicts.mjs:358-364) binds the register ref, a
// unit id no live unit has: boundRef (alembic_needs.mjs:319) writes seen {ref: "absent"}, and askedAsNow (:329) passes an
// "absent" while no LIVE UNIT has that id. But adoptInstructorText (units_index.mjs:373-376), what "Keep" runs, adopts
// every HOLDER of the ref — any unit naming it in its lineage (authorship.mjs:335-338). The index gives a new text that
// covers a retired unit's words that lineage (units_index.mjs:15-21, 471). needsContext's `adopts` (:185-189) is keyed by
// holder unit ids only, so boundUnits(e) for the ref stays [ref] and the new holder is never checked. So: the agent
// removes the paragraph, the question "Keep it removed, or have it put back?" goes out; before the answer is read (a job
// that runs while the instructor answers: its `alembic changes` was read before the answer, it indexes after) the agent
// writes the paragraph back into its own neighbouring paragraph with a sentence of its own; the next apply records the instructor's "Keep" (meaning: keep it
// REMOVED) as an authorship-confirmation adopting the agent's new text as theirs — text the question never showed, and
// the opposite of the choice. The adopted register then hides the agent's edit from ms8's own unasked-edit question.
// Cheapest fix: key `adopts` by the register ref as well (adopts.set(ref, holder ids) for every register entry), so
// boundUnits of a removal binds the ref's holders and `seen` {ref: "absent"} fails once any holder exists.
test("[req.host.alembic-needs-apply] audit5 HIGH-1: \"Keep it removed\" never adopts text that came back under another unit", async (t) => {
  const c = course(t);
  const P = "Industrial plants therefore run the ammonia synthesis near 450 degrees Celsius with an iron catalyst as a compromise.";
  // the instructor writes P (outside any agent session) and claims it: registered as their text
  c.edit(SG, ANCHOR, `${ANCHOR}\n\n${P}`); indexAndStamp(c.root, c.r(), {});
  const pid = c.find(P).id;
  claimAuthorship(c.root, { units: [pid], instructorWords: "That one is mine." }, I);
  assert.ok(instructorRegister(c.root).has(pid), "precondition: P is the instructor's registered text");
  // the agent removes it
  c.asAgent(() => c.edit(SG, `${ANCHOR}\n\n${P}`, ANCHOR));
  assert.ok(!c.units().some((u) => u.id === pid || (u.lineage || []).includes(pid)), "precondition: no unit holds P");
  const f = finding("f-audit5-removed", "instructor-edit-unasked", [pid], { type: "judgment", note: `Your text was removed without your answer: "${P}" (${pid}) is no longer in the package. Keep it removed, or have it restored?`, quote: P, now: "", instructorText: pid, before: P, after: "" }, { module: "ms8-verdicts", recommendation: "keep" });
  const r = await exportNeeds(c.root, { changesetId: "audit5-absent-01", gate: { findings: [f] } });
  const q = r.handin.digest.questions.find((x) => x.id.startsWith("d."));
  assert.ok(q.choices?.includes("Keep"), `precondition: one-click Keep (${JSON.stringify(q.choices)})`);
  assert.match(q.text, /Keep it removed/);
  // while the answer is on its way, the agent writes the paragraph back into its own neighbouring paragraph, with a sentence of its own, and indexes
  const ADDED = "Higher pressures would raise the yield further but cost more to build.";
  c.asAgent(() => c.edit(SG, ANCHOR, `${ANCHOR} ${P} ${ADDED}`));
  const back = c.units().find((u) => u.text.includes(ADDED));
  assert.ok(back && back.id !== pid && (back.lineage || []).includes(pid), `precondition: the new text names P in its lineage (${back?.id}, ${JSON.stringify(back?.lineage)})`);
  const a = applyChanges(c.root, { answers: [answer("audit5-absent-01", q.id, "i-1", "Keep", "Keep it removed, it was out of date.")] });
  const adopted = c.log().filter((x) => x.type === "authorship-confirmation" && x.party?.role === "instructor" && JSON.stringify(x.payload?.texts || {}).includes(ADDED));
  assert.equal(adopted.length, 0, `the instructor's "Keep it removed" adopted the agent's new text as theirs: ${JSON.stringify(a)} ${JSON.stringify(adopted.map((x) => x.payload))}`);
});

// ---- MEDIUM-2: words on a disputed claim become a change the instructor "asked for" ----------------------------------
// A fact-disputed question whose passage cannot be read (`unseen`, needs_wording.mjs:380-383) has no choices
// (alembic_needs.mjs:129), so typed words are recorded as `said: …` (:409) with the entry's bases — which, for a
// disputed claim, carry claimKey, claimText and units (digest.mjs:105). instructorActsOf (obligations.mjs:140-145) reads
// every such answer whose choice is not keep/confirm/later/still correct/accept as a CHANGE the instructor asked for
// (asksChange, :117): "said: Keep it as written, the source is wrong" becomes a blocking `instructor-change-owed`
// obligation (:1121-1122) quoting "said: Keep it …" as the change to make, and takenUp does not withdraw it. Words that
// D-133 promises "never confirm, keep or apply anything" are recorded as a change request: more than the instructor
// said, and an obligation the agent can clear only by editing their claim against their words.
// Cheapest fix: asksChange (or instructorActsOf) skips a `said: ` choice (SAID.test) — the words reach the agent
// through saidOwed, not as an owed change.
test("[req.host.alembic-needs-apply] audit5 MEDIUM-2: a disputed claim answered in words is not recorded as a change asked for", async (t) => {
  const c = course(t);
  const ghost = "u-study-guide-chemical-equilibrium-unread-7"; // a unit the wording cannot read → no choices
  const claimText = "At 500 K the equilibrium constant is 0.0042.";
  const f = finding("f-audit5-disputed", "fact-disputed", [ghost], { type: "conflict", claimKey: "ck-audit5", claimText, claim: 1, quotes: [] }, { module: "ms8-verdicts", recommendation: "keep as written" });
  const r = await exportNeeds(c.root, { changesetId: "audit5-disputed-01", gate: { findings: [f] } });
  const q = r.handin.digest.questions.find((x) => x.id.startsWith("d."));
  assert.equal(q.choices, undefined, "precondition: answered in words");
  const a = applyChanges(c.root, { answers: [answer("audit5-disputed-01", q.id, "i-1", "Keep it as written, the second source is about a different reaction.")] });
  assert.equal(a.recorded[0]?.outcome, "said", `precondition: said (${JSON.stringify(a)})`);
  const acts = instructorActsOf(c.log());
  const owed = owedChanges({ id: ghost, text: claimText }, acts);
  assert.deepEqual(owed, [], `words that say "keep it" are recorded as a change the instructor asked for: ${JSON.stringify(owed)}`);
});

// ---- MEDIUM-3: words owed to the agent have one surface, the apply output of one job ------------------------------
// saidOwed (digest.mjs:52-61) is read only by buildDigest (to stop asking) and takenUp: no export, gate, status or later
// apply output lists what is owed. alembic-job/CLAUDE.md step 1 is the agent's only chance: if the job dies after the
// apply (or the agent misses the `said` line), the next job's apply reports the item "already recorded", without the
// words; the finding is never asked again (buildDigest owedFor) and nothing names the changeset and question taken-up
// needs. The instructor's words are silently dropped, and the question is neither asked nor answered.
// Cheapest fix: exportNeeds (and its CLI output) returns every saidOwed entry with its changeset, question and the
// words, and the alembic-job instructions say to take each up.
test("[req.host.alembic-needs-apply] audit5 MEDIUM-3: words still owed to the agent are listed again in a later job", async (t) => {
  const c = course(t);
  const quote = "Le Chatelier's principle predicts the direction of a shift when a system at equilibrium is disturbed.";
  const f = finding("f-audit5-kc", "knowledge-concern", [U3], { type: "judgment", note: "It may conflate the position of equilibrium with the constant.", quote }, { module: "ms8-verdicts" });
  const r1 = await exportNeeds(c.root, { changesetId: "audit5-owed-01", gate: { findings: [f] } });
  const q = r1.handin.digest.questions.find((x) => x.id.startsWith("d."));
  const words = "Change it: say the position shifts and K stays the same unless the temperature changes.";
  const changes = { answers: [answer("audit5-owed-01", q.id, "i-1", words)] };
  assert.equal(applyChanges(c.root, changes).recorded[0]?.outcome, "said", "precondition");
  // the job dies here; the next job applies the same `alembic changes` and exports
  const again = applyChanges(c.root, changes);
  const r2 = await exportNeeds(c.root, { changesetId: "audit5-owed-02", gate: { findings: [f] } });
  assert.ok(saidOwed(c.root).size === 1, "precondition: still owed");
  const surfaced = JSON.stringify(again).includes(words) || JSON.stringify(r2).includes(words) || JSON.stringify(r2).includes(q.id);
  assert.ok(surfaced, `the owed words reach no later output: apply ${JSON.stringify(again)}; export ${JSON.stringify({ counts: r2.counts, left: r2.left })}`);
});

// ---- LOW-4: an owed question whose hand-in left the record can never be taken up ------------------------------------
// takenUp (alembic_needs.mjs:339-340) finds the question in the needs record, which keeps the last 50 hand-ins
// (KEEP_HANDINS, :43, :299) and drops the oldest past 3 MB (:301). Fifty exports later (fifty jobs, or a few busy days
// of jobs that export each time) the owed words can no longer be recorded as taken up: owed forever, never asked again.
// Cheapest fix: let taken-up name the finding key from saidOwed (or never prune a hand-in that still has owed words).
test("[req.host.alembic-needs-apply] audit5 LOW-4: words owed on a hand-in older than the record keeps can still be taken up", async (t) => {
  const c = course(t);
  const quote = "Le Chatelier's principle predicts the direction of a shift when a system at equilibrium is disturbed.";
  const f = finding("f-audit5-kc2", "knowledge-concern", [U3], { type: "judgment", note: "It may conflate the position of equilibrium with the constant.", quote }, { module: "ms8-verdicts" });
  const r1 = await exportNeeds(c.root, { changesetId: "audit5-prune-00", gate: { findings: [f] } });
  const q = r1.handin.digest.questions.find((x) => x.id.startsWith("d."));
  applyChanges(c.root, { answers: [answer("audit5-prune-00", q.id, "i-1", "Please make it say the constant does not move.")] });
  // fifty later jobs export (nothing else to ask): each writes a hand-in record
  const needs = JSON.parse(fs.readFileSync(recordFile(c.root, NEEDS_FILE), "utf8"));
  for (let n = 1; n <= 50; n++) needs.handins.push({ changesetId: `audit5-prune-${String(n).padStart(2, "0")}`, at: "2026-11-09T12:00:00.000Z", questions: {} });
  needs.handins = needs.handins.slice(-50); // what exportNeeds keeps (KEEP_HANDINS)
  fs.writeFileSync(recordFile(c.root, NEEDS_FILE), JSON.stringify(needs));
  assert.equal(saidOwed(c.root).size, 1, "precondition: still owed");
  assert.doesNotThrow(() => takenUp(c.root, { changesetId: "audit5-prune-00", question: q.id, note: "Rewrote the sentence as asked." }, AGENT), "taken-up is refused for good");
});

// ---- MEDIUM-5: taken-up closes a binding question for good, with nothing confirmed --------------------------------
// A binding question (confirm, keep as written, accept as mine, keep an edit) has no choices when a unit it binds cannot
// be read at export (`unseen`, needs_wording.mjs:380-383; the hand-in tells the instructor their words "go to the
// assistant … nothing is confirmed or kept from words alone", alembic_needs.mjs:149). The words come back `said`;
// once the agent runs taken-up (as alembic-job/CLAUDE.md tells it to), answeredBases (digest.mjs:45) counts the said
// answer as the answer, so the question is closed at that basis for good: Needs you never asks it again, not even once
// the passage can be read and Confirm can be offered — and the agent cannot confirm, so the instructor's "yes, confirm
// them" can never become a confirmation. The agent closed what only the instructor's choice may settle; the CLAUDE.md
// advice "bring a decision only they can make back as a question" has no mechanism behind it.
// Cheapest fix: in answeredBases, a taken-up `said:` answer does not answer a finding of a BINDING kind (the entry's
// kind is in the record): the question is asked again, with its choices, once the agent has taken the words up.
test("[req.host.alembic-needs-apply] audit5 MEDIUM-5: words on a binding question, taken up, leave the question to be asked again", async (t) => {
  const c = course(t);
  const ghost = "u-study-guide-chemical-equilibrium-unread-8";
  const f = finding("f-audit5-exdata", "exercise-data-confirm", [ghost], { type: "judgment", note: "the values here read as invented exercise data — confirm them as teaching hypotheticals?", quote: "0.25 M | 1.5 atm" }, { module: "ms8-verdicts", recommendation: "confirm" });
  const r1 = await exportNeeds(c.root, { changesetId: "audit5-binding-01", gate: { findings: [f] } });
  const q = r1.handin.digest.questions.find((x) => x.id.startsWith("d."));
  assert.equal(q.choices, undefined, "precondition: unseen, answered in words");
  const a = applyChanges(c.root, { answers: [answer("audit5-binding-01", q.id, "i-1", "Yes, confirm them, they are made-up numbers for practice.")] });
  assert.equal(a.recorded[0]?.outcome, "said", "precondition");
  takenUp(c.root, { changesetId: "audit5-binding-01", question: q.id, note: "Only you can confirm: the question will come back with Confirm." }, AGENT);
  const r2 = await exportNeeds(c.root, { changesetId: "audit5-binding-02", gate: { findings: [f] } });
  assert.equal(r2.handin.digest.questions.filter((x) => x.id.startsWith("d.")).length, 1, "the confirm question is closed for good by the agent's taken-up; nothing was confirmed");
});


// ---- LOW-6: an old answer is reported "asked again" in every later job, after it has settled ------------------------
// An answer to a question asked before the `seen` check (no `seen` in the record) is skipped (alembic_needs.mjs:411) and,
// being skipped, never marked done (:421), so every later apply of `alembic changes` reports it again: "the passage
// changed since it was asked …: it is asked again" — also after the re-asked question was answered and settled. The old
// question is asked again exactly once and settles (verified), but the agent is told, every job, that it is being asked
// again. Cheapest fix: mark a seen-check skip once (a host-answer marker with outcome "asked again"), or report "settled
// since" when the entry's bases are answered.
test("[req.host.alembic-needs-apply] audit5 LOW-6: a pre-check answer stops reporting \"asked again\" once the re-asked question settled", async (t) => {
  const c = course(t);
  const u = c.units().find((x) => x.id === U3);
  const f = finding("f-audit5-old", "confirmation-stale", [U3], { type: "judgment", note: "changed", quote: u.text }, { recommendation: "confirm" });
  const r0 = await exportNeeds(c.root, { changesetId: "audit5-old-0001", gate: { findings: [f] } });
  const rec = JSON.parse(fs.readFileSync(recordFile(c.root, NEEDS_FILE), "utf8"));
  for (const q of Object.values(rec.handins[0].questions)) { delete q.seen; delete q.assistant; } // as v1.0.5 wrote it
  fs.writeFileSync(recordFile(c.root, NEEDS_FILE), JSON.stringify(rec));
  const q0 = r0.handin.digest.questions[0];
  const old = answer("audit5-old-0001", q0.id, "i-old", "Confirm", "Confirmed.");
  assert.equal(applyChanges(c.root, { answers: [old] }).skipped.length, 1, "precondition: asked again");
  const r1 = await exportNeeds(c.root, { changesetId: "audit5-old-0002", gate: { findings: [f] } });
  assert.equal(r1.handin.digest.questions.length, 1, "precondition: re-asked once");
  const fresh = answer("audit5-old-0002", r1.handin.digest.questions[0].id, "i-new", "Confirm", "Confirmed.");
  assert.equal(applyChanges(c.root, { answers: [old, fresh] }).recorded.length, 1, "precondition: settled");
  assert.equal((await exportNeeds(c.root, { changesetId: "audit5-old-0003", gate: { findings: [f] } })).handin.digest.questions.length, 0, "precondition: not asked again");
  const later = applyChanges(c.root, { answers: [old, fresh] });
  assert.ok(!later.skipped.some((s) => /asked again/.test(s.reason)), `a settled question is still reported as asked again: ${JSON.stringify(later.skipped)}`);
});
