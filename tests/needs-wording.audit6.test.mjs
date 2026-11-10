// [req.host.alembic-needs-apply] [req.host.alembic-needs-wording] Closed-loop audit, round 6, of D-133 (needs-wording 8b49155 on main 75e808f):
// round 5's fixes and their siblings, liveness of `said` / `taken-up` over several jobs, and a fresh pass. Each finding
// test FAILS on 8b49155 and names one finding (severity in its name). Only public functions and the real C2 package are
// used; nothing here changes implementation.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { indexAndStamp, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { readSidecar } from "../scripts/lib/core/units_index.mjs";
import { unitHash } from "../scripts/lib/core/segment.mjs";
import { parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { applyChanges, exportNeeds, owedWords, takenUp } from "../scripts/lib/core/alembic_needs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const BY = { id: "u-42", name: "Yu Wang" };
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const SG = "study-guide/le-chatelier.md", ANCHOR = "but it also slows the rate.";
const U3 = "u-study-guide-chemical-equilibrium-the-equilibrium-constant-3";
function course(t) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-wording-audit6-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  const r = () => liveReader(root);
  return {
    root, r,
    units: () => loadUnits(root, r()),
    find: (text) => loadUnits(root, r()).find((u) => u.text === text),
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    log: () => parseLog(readLogText(root)),
  };
}
const finding = (id, kind, units, evidence, more = {}) => ({ id, module: "skeleton", kind, units, statusClass: "question", route: "digest", status: "open", evidence, ...more });
const answer = (changesetId, question, item, text, words = text) => ({ item, changesetId, question, answer: text, words, by: BY, at: "2026-11-09T12:00:00.000Z" });
const digestQ = (r) => r.handin.digest.questions.filter((x) => x.id.startsWith("d."));

// ---- HIGH-1: "Accept as mine" claims the INDEXED text, while the question showed (and `seen` binds) the LIVE text ----
// Round 4 made the wording and `seen` read the live text (needsContext → loadUnits, alembic_needs.mjs:176-182), because
// confirmUnits and adoptInstructorText bind the live text. claimAuthorship does not: it sets the origin of the SIDECAR
// unit by id (units_index.mjs:632-642), whose indexed text may differ from the live one (loadUnits maps by position,
// obligations.mjs:212-220, so a same-count edit not yet indexed keeps the id). The question then shows T1 (live), seen
// binds hash(T1), the answer passes askedAsNow (T1 still live), and the instructor is recorded as the author of T0 —
// the indexed text the question never showed. (Reachable: an edit made in Alembic, a job that exports before it
// indexes, or any local export with an un-indexed edit.)
// Cheapest fix: in apply (or boundRef), for unit-unknown-authorship require the sidecar's contentHash of each bound unit
// to equal its live hash (askedAsNow fails, asked again), or have the wording show the indexed text and `seen` bind it.
test("[req.host.alembic-needs-apply] audit6 HIGH-1: \"Accept as mine\" never claims indexed text the question did not show", async (t) => {
  const c = course(t);
  const T0 = "Some textbooks quote the industrial operating temperature as about 400 degrees Celsius.";
  const T1 = "Some textbooks quote the industrial operating temperature as about 450 degrees Celsius.";
  // a passage written outside any agent session, indexed: unknown authorship (D20)
  c.edit(SG, ANCHOR, `${ANCHOR}\n\n${T0}`); indexAndStamp(c.root, c.r(), {});
  const pid = c.find(T0)?.id;
  assert.ok(pid, "precondition: T0 indexed");
  assert.equal(readSidecar(c.root, SG).units.find((u) => u.id === pid).origin.kind, "unknown", "precondition: unknown authorship");
  // a one-word edit, not yet indexed: same unit count, so the live reader still calls it pid
  c.edit(SG, T0, T1);
  assert.equal(c.units().find((u) => u.id === pid)?.text, T1, "precondition: live pid reads T1");
  const f = finding("f-audit6-unknown", "unit-unknown-authorship", [pid], { type: "judgment", note: `${SG}: 1 passage(s) changed outside an agent session — yours (accept as mine), someone else's (name them), or revert?` });
  const r = await exportNeeds(c.root, { changesetId: "audit6-claim-0001", gate: { findings: [f] } });
  const q = digestQ(r)[0];
  assert.ok(q.choices?.includes("Accept as mine"), `precondition: one-click Accept as mine (${JSON.stringify(q.choices)})`);
  assert.ok(q.detail.includes("450") && !q.detail.includes("400 degrees"), "precondition: the question shows T1 only");
  applyChanges(c.root, { answers: [answer("audit6-claim-0001", q.id, "i-1", "Accept as mine", "Yes, I wrote that.")] });
  const side = readSidecar(c.root, SG).units.find((u) => u.id === pid);
  const claimed = side.origin.kind === "instructor-authored";
  assert.ok(!claimed || side.locator.contentHash === unitHash(T1),
    `the instructor is recorded as the author of the indexed text (T0, "400 degrees") they were never shown; they saw T1 ("450 degrees")`);
});

// ---- MEDIUM-2: "Change it differently" (and off-spine "Drop it") close the question; the words reach no one ----------
// Round 1 added "Change it differently" (SUGGESTION_CHOICES, needs_wording.mjs:330) "with the instructor's words". It is
// an exact choice, so apply records it as an answer (alembic_needs.mjs:438-439, outcome "answered"): answeredBases closes
// the concern, and nothing carries the words to the agent — not `said`, not `owed`, not owedWords, not an obligation
// (asksChange reads only bases with a claimKey; ms8 reads only /^apply/). The instructor's requested change is dropped
// and never asked again. The same holds for off-spine "Drop it" (needs_wording.mjs:458): the passage stays.
// Cheapest fix: treat an exact choice that asks the agent to act ("Change it differently", "Drop it") like words: return
// the instructor's words with the recorded answer and keep it owed (saidOwed) until taken-up.
test("[req.host.alembic-needs-apply] audit6 MEDIUM-2: words given with \"Change it differently\" reach the agent", async (t) => {
  const c = course(t);
  const quote = "Le Chatelier's principle predicts the direction of a shift when a system at equilibrium is disturbed.";
  const f = finding("f-audit6-kc", "knowledge-concern", [U3], { type: "judgment", note: "It may conflate the position of equilibrium with the constant.", quote, suggestion: "Le Chatelier's principle predicts the direction in which the position of equilibrium shifts." }, { module: "ms8-verdicts" });
  const r1 = await exportNeeds(c.root, { changesetId: "audit6-diff-0001", gate: { findings: [f] } });
  const q = digestQ(r1)[0];
  assert.ok(q.choices?.includes("Change it differently"), `precondition: ${JSON.stringify(q.choices)}`);
  const words = "Say instead that K stays the same and only the position moves.";
  const a = applyChanges(c.root, { answers: [answer("audit6-diff-0001", q.id, "i-1", "Change it differently", words)] });
  const r2 = await exportNeeds(c.root, { changesetId: "audit6-diff-0002", gate: { findings: [f] } });
  const reached = JSON.stringify(a.recorded).includes(words) || JSON.stringify(a.owed).includes(words) || JSON.stringify(r2.owed).includes(words);
  assert.ok(reached || digestQ(r2).length === 1, `the instructor's change request is closed and reaches no one: apply ${JSON.stringify(a)}; re-asked: ${digestQ(r2).length}`);
});

// ---- MEDIUM-3: a binding question taken up once loses every later answer in words, and cycles -------------------------
// takenUpKeys (digest.mjs:51) marks a key taken up for good, binding or not. Round 5 (MEDIUM-5) asks a binding question
// again after a binding taken-up — still without choices while its unit cannot be read (`unseen`). The instructor's next
// words are then recorded `said`, but saidOwed (:57-61) skips the key (already "taken"), so they are not owed: not in
// apply's `owed`, export's owedToYou or status; taken-up refuses ("no words … owed"); and answeredBases (answeringKeys
// skips binding) leaves the question open, so it is asked again, every job, and every answer is dropped.
// Cheapest fix: key taken-up by the answer it took up (the said answer's seq), not by finding|basis: saidOwed then owes
// every said answer not itself taken up.
test("[req.host.alembic-needs-apply] audit6 MEDIUM-3: words on a re-asked binding question are owed again and can be taken up", async (t) => {
  const c = course(t);
  const ghost = "u-study-guide-chemical-equilibrium-unread-9";
  const f = finding("f-audit6-exdata", "exercise-data-confirm", [ghost], { type: "judgment", note: "the values here read as invented exercise data — confirm them as teaching hypotheticals?", quote: "0.25 M | 1.5 atm" }, { module: "ms8-verdicts", recommendation: "confirm" });
  // job 1: asked (no choices: unread), answered in words, taken up
  const q1 = digestQ(await exportNeeds(c.root, { changesetId: "audit6-cycle-0001", gate: { findings: [f] } }))[0];
  assert.equal(q1.choices, undefined, "precondition: answered in words");
  applyChanges(c.root, { answers: [answer("audit6-cycle-0001", q1.id, "i-1", "Yes, confirm them.")] });
  takenUp(c.root, { changesetId: "audit6-cycle-0001", question: q1.id, note: "Only you can confirm: asked again with its choices." }, AGENT);
  // job 2: asked again (round 5), answered in words again
  const q2 = digestQ(await exportNeeds(c.root, { changesetId: "audit6-cycle-0002", gate: { findings: [f] } }))[0];
  assert.ok(q2, "precondition: asked again");
  const words2 = "These are made-up practice values, please mark them so in the text.";
  const a2 = applyChanges(c.root, { answers: [answer("audit6-cycle-0002", q2.id, "i-2", words2)] });
  assert.equal(a2.recorded[0]?.outcome, "said", "precondition: said");
  // job 3: the words must still be owed (listed) and takeable
  const owedNow = owedWords(c.root);
  assert.ok(owedNow.some((o) => o.words === words2), `the instructor's second answer is not owed to the agent: ${JSON.stringify(owedNow)}`);
  assert.doesNotThrow(() => takenUp(c.root, { changesetId: "audit6-cycle-0002", question: q2.id, note: "Marked as practice values." }, AGENT));
});

// ---- LOW-4: an entry of several findings lists its owed words once per finding -------------------------------------
// One answer settles every finding of an entry (count > 1), so saidOwed holds one key per finding with the same words,
// and owedWords (alembic_needs.mjs:353-362) lists the same changeset, question and words once per key: owedToYou /
// owedWords repeat it, and an agent taking up "each one listed" (alembic-job/CLAUDE.md) gets "no words … owed" on the
// second. Cheapest fix: group owedWords by (changesetId, question).
test("[req.host.alembic-needs-apply] audit6 LOW-4: owed words are listed once per question", async (t) => {
  const c = course(t);
  const [ua, ub] = c.units().filter((u) => u.locator.deliverable === SG && u.text.length > 60).map((u) => u.id);
  const note = "It may overstate what the principle predicts.";
  const fa = finding("f-audit6-kca", "knowledge-concern", [ua], { type: "judgment", note, quote: "a" }, { module: "ms8-verdicts" });
  const fb = finding("f-audit6-kcb", "knowledge-concern", [ub], { type: "judgment", note, quote: "b" }, { module: "ms8-verdicts" });
  const q = digestQ(await exportNeeds(c.root, { changesetId: "audit6-dup-00001", gate: { findings: [fa, fb] } }))[0];
  assert.equal(q.choices, undefined, "precondition: answered in words");
  const a = applyChanges(c.root, { answers: [answer("audit6-dup-00001", q.id, "i-1", "Soften both sentences a little.")] });
  assert.equal(a.owed.length, 1, `listed ${a.owed.length} times: ${JSON.stringify(a.owed)}`);
});

// ---- LOW-5: two hand-ins of one question answered in words: the earlier words are dropped from what is owed ----------
// saidOwed keys by finding|basis (digest.mjs:57-61), so a second said answer to the same question (the same question in
// a newer hand-in, both answered before a job reads them) replaces the first: the first words leave owed/owedToYou, and
// taken-up on the first changeset (which apply's own output tells the agent to run) is refused.
// Cheapest fix: as MEDIUM-3, owe per said answer, not per key.
test("[req.host.alembic-needs-apply] audit6 LOW-5: both answers in words to one question stay owed", async (t) => {
  const c = course(t);
  const quote = "Le Chatelier's principle predicts the direction of a shift when a system at equilibrium is disturbed.";
  const f = finding("f-audit6-kc3", "knowledge-concern", [U3], { type: "judgment", note: "It may conflate the position of equilibrium with the constant.", quote }, { module: "ms8-verdicts" });
  const q1 = digestQ(await exportNeeds(c.root, { changesetId: "audit6-two-00001", gate: { findings: [f] } }))[0];
  const q2 = digestQ(await exportNeeds(c.root, { changesetId: "audit6-two-00002", gate: { findings: [f] } }))[0];
  const a = applyChanges(c.root, { answers: [
    { ...answer("audit6-two-00001", q1.id, "i-1", "Mention that K depends only on temperature."), at: "2026-11-09T12:00:00.000Z" },
    { ...answer("audit6-two-00002", q2.id, "i-2", "Also add the catalyst point."), at: "2026-11-09T12:05:00.000Z" }] });
  assert.equal(a.recorded.filter((x) => x.outcome === "said").length, 2, "precondition: both said");
  assert.equal(a.owed.length, 2, `the first answer's words are no longer owed: ${JSON.stringify(a.owed)}`);
});

// ---- MEDIUM-6: a question without choices drops what the instructor wrote in "In your own words" -------------------
// digestQuestion gives a question without choices `words: "optional"` (alembic_needs.mjs:163). Alembic then shows BOTH
// a "Your answer" box and an "In your own words (if you like)" box (Alembic needs-you/assistant-items.tsx:43-49) and
// returns them as `answer` and `words` (actions.ts:90-96). apply records `said: <answer>` only (:428), so `said`, `owed`,
// owedToYou and owedWords carry the answer box alone: "Change it" reaches the agent; how to change it (the words box)
// stays only in the answer record's instructorWords, which nothing tells the agent to read.
// Cheapest fix: for a question without choices, omit `words` (the answer box is the words); or carry `words` with the
// said answer (said output and owedWords).
test("[req.host.alembic-needs-apply] audit6 MEDIUM-6: the words box of a question without choices reaches the agent", async (t) => {
  const c = course(t);
  const quote = "Le Chatelier's principle predicts the direction of a shift when a system at equilibrium is disturbed.";
  const f = finding("f-audit6-kc4", "knowledge-concern", [U3], { type: "judgment", note: "It may conflate the position of equilibrium with the constant.", quote }, { module: "ms8-verdicts" });
  const q = digestQ(await exportNeeds(c.root, { changesetId: "audit6-box-00001", gate: { findings: [f] } }))[0];
  assert.equal(q.choices, undefined, "precondition: no choices");
  assert.equal(q.words, "optional", "precondition: Alembic shows a words box too");
  const how = "Say that K depends only on temperature, and the position shifts.";
  const a = applyChanges(c.root, { answers: [answer("audit6-box-00001", q.id, "i-1", "Change it", how)] });
  assert.equal(a.recorded[0]?.outcome, "said", "precondition: said");
  const surfaced = JSON.stringify(a.recorded).includes(how) && JSON.stringify(owedWords(c.root)).includes(how);
  assert.ok(surfaced, `only the answer box reaches the agent: ${JSON.stringify({ recorded: a.recorded, owed: owedWords(c.root) })}`);
});
