// [req.host.alembic-needs-apply] [req.host.alembic-needs-wording] Closed-loop audit, round 7, of D-133 (needs-wording d5d4b14 on main 75e808f):
// the single binding guard, owed words per answer, liveness over several jobs, and a fresh pass. Each finding test FAILS on
// d5d4b14 and names one finding (severity in its name). Only public functions and the real C2 package are used; nothing
// here changes implementation. Adopted with the round's fixes: HIGH-1 and MEDIUM-7 follow the per-construct limit asked
// for (a cluster offers no choice; a choice an earlier hand-in offered on one is read as words).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { loadUnits, instructorActsOf, indexAndStamp } from "../scripts/lib/core/obligations.mjs";
import { appendLogRecord, parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { saidOwed } from "../scripts/lib/core/digest.mjs";
import { applyChanges, exportNeeds, NEEDS_FILE, owedWords } from "../scripts/lib/core/alembic_needs.mjs";
import { recordFile } from "../scripts/lib/records/paths.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const BY = { id: "u-42", name: "Yu Wang" };
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const U3 = "u-study-guide-chemical-equilibrium-the-equilibrium-constant-3";
const P1 = "u-study-guide-le-chatelier-the-principle-1", P2 = "u-study-guide-le-chatelier-the-principle-2";
function course(t) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-wording-audit7-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  const r = () => liveReader(root);
  return { root, r, units: () => loadUnits(root, r()), log: () => parseLog(readLogText(root)) };
}
const finding = (id, kind, units, evidence, more = {}) => ({ id, module: "skeleton", kind, units, statusClass: "question", route: "digest", status: "open", evidence, ...more });
const answer = (changesetId, question, item, text, words = text) => ({ item, changesetId, question, answer: text, words, by: BY, at: "2026-11-10T12:00:00.000Z" });
const digestQ = (r) => r.handin.digest.questions.filter((x) => x.id.startsWith("d."));
/** The record as a hand-in made before round 7 kept it: the question offered these choices. */
function asOffered(root, changesetId, id, choices) {
  const f = recordFile(root, NEEDS_FILE), rec = JSON.parse(fs.readFileSync(f, "utf8"));
  Object.assign(rec.handins.find((h) => h.changesetId === changesetId).questions[id], { choices, words: "required" });
  fs.writeFileSync(f, JSON.stringify(rec));
}

// ---- HIGH-1: one "Apply the suggestion" accepts every clustered suggestion, while the question shows only the first ----
// buildDigest clusters findings by rootCause (digest.mjs:28-33: module|kind|the first 80 characters of the note, quotes and
// numbers folded) and an answer binds EVERY finding of the entry (e.bases, digest.mjs:179). wordEntry (needs_wording.mjs:
// 406-418) shows only e.evidence — the first finding's quote and suggestion — yet offers the one-click "Apply the
// suggestion" (SUGGESTION_CHOICES). bindingGuard checks the entry's units are unchanged, never that every finding's
// suggestion was shown. ms8-verdicts reads /^apply/ on any of those findings as the instructor's acceptance (acceptedBy,
// ms8-verdicts.mjs:109-112): for a clarification it raises clarification-accepted (the agent writes the unseen suggestion
// into the instructor's text, their credit staying, :216-224); for a concern it exempts the agent's edit from the
// unasked-edit question (:210, :244, :370-378). Reachable whenever two reviewer notes share their first 80 characters
// once quotes and numbers are folded (e.g. 'Clarify: "…" → "…". Ambiguous: …').
// Cheapest fix: offer the suggestion choices (Apply / Change it differently) only for an entry of one finding (count 1),
// or when wordEntry shows every finding's suggestion; otherwise the question is answered in words.
test("[req.host.alembic-needs-apply] audit7 HIGH-1: \"Apply the suggestion\" never accepts a clustered suggestion the question did not show", async (t) => {
  const c = course(t);
  const [t1, t2] = [P1, P2].map((id) => c.units().find((u) => u.id === id).text);
  const problem = "The wording could be read as saying something stronger than intended.";
  const S1 = "Le Chatelier's principle predicts the direction of the shift.";
  const S2 = "The principle is named for Henry Le Chatelier, who wrote it down in 1884 and in 1901 retracted it.";
  const mk = (id, unit, quote, s) => finding(id, "clarification-proposed", [unit], { type: "judgment", note: `Clarify: "${quote}" → "${s}". ${problem}`, quote, suggestion: s }, { module: "ms8-verdicts", recommendation: "apply" });
  const fa = mk("f-audit7-cla", P1, t1.slice(0, 60), S1), fb = mk("f-audit7-clb", P2, t2.slice(0, 60), S2);
  const r = await exportNeeds(c.root, { changesetId: "audit7-clus-0001", gate: { findings: [fa, fb] } });
  const qs = digestQ(r);
  assert.equal(qs.length, 1, "precondition: one entry for both findings");
  const q = qs[0];
  // adopted fix (round 7, a per-construct limit): an entry of several findings offers no choice; the answer is words
  assert.equal(q.choices, undefined, `a cluster offers no one-click choice (${JSON.stringify(q.choices)})`);
  asOffered(c.root, "audit7-clus-0001", q.id, ["Apply the suggestion", "Change it differently", "Keep it", "Later"]); // as an earlier hand-in offered it
  const shownS2 = `${q.text}\n${q.detail || ""}`.includes("retracted");
  const a = applyChanges(c.root, { answers: [answer("audit7-clus-0001", q.id, "i-1", "Apply the suggestion", "Yes, apply it.")] });
  const applied = c.log().filter((x) => x.type === "answer").flatMap((x) => x.payload.answers).filter((x) => /^\s*apply/i.test(x.choice)).map((x) => x.finding);
  assert.ok(!applied.includes("f-audit7-clb") || shownS2,
    `the instructor is recorded as accepting a suggestion the question never showed (S2 "${S2}"): accepted ${JSON.stringify(applied)}; outcome ${JSON.stringify(a.recorded)}`);
});

// ---- MEDIUM-2: "Apply the suggestion" closes the question, and the choice reaches no one -----------------------------
// For a knowledge concern (a "wrong" verdict), a plan-line concern (spine-review-concern) and detail in the plan
// (detail-in-spine), no reader turns /^apply/ into work: ms8 reads it only to EXEMPT an edit already made (:210, :244), and
// nothing reads it for the skeleton kinds. apply records it as "answered" (alembic_needs.mjs:468) with no answer text in
// `recorded` (:473), nothing owed (round 6 made only "Change it differently" / "Drop it" owed), and answeredBases closes
// the finding at its basis: the instructor chose to apply the change, and the course keeps the old text, silently.
// Cheapest fix: add "Apply the suggestion" (for kinds no Coursewerk reader acts on) to the choices returned to the agent
// with their words, owed until taken up — or return `answer` (and `words`) in every recorded digest entry.
test("[req.host.alembic-needs-apply] audit7 MEDIUM-2: an instructor's \"Apply the suggestion\" reaches the agent", async (t) => {
  const c = course(t);
  const t1 = c.units().find((u) => u.id === P1).text;
  const f = finding("f-audit7-kc", "knowledge-concern", [P1], { type: "judgment", note: "It may overstate what the principle predicts.", quote: t1.slice(0, 60), suggestion: "Le Chatelier's principle predicts the direction of the shift only." }, { module: "ms8-verdicts" });
  const r1 = await exportNeeds(c.root, { changesetId: "audit7-apply-001", gate: { findings: [f] } });
  const q = digestQ(r1)[0];
  assert.ok(q.choices?.includes("Apply the suggestion"), `precondition: ${JSON.stringify(q.choices)}`);
  const a = applyChanges(c.root, { answers: [answer("audit7-apply-001", q.id, "i-1", "Apply the suggestion", "Please apply it.")] });
  assert.equal(a.recorded[0]?.outcome, "answered", `precondition: recorded (${JSON.stringify(a)})`);
  const r2 = await exportNeeds(c.root, { changesetId: "audit7-apply-002", gate: { findings: [f] } });
  const reached = JSON.stringify(a.recorded).includes("Apply") || JSON.stringify(owedWords(c.root)).includes("Apply") || JSON.stringify(r2.owed).includes("Apply");
  assert.ok(reached || digestQ(r2).length === 1, `the instructor's Apply is closed and reaches no one: apply ${JSON.stringify(a)}; asked again: ${digestQ(r2).length}`);
});

// ---- MEDIUM-3: "Change it" on a disputed fact drops the instructor's words (what to change it to) --------------------
// fact-disputed offers Keep as written / Change it / Later (alembic_needs.mjs:97) with words required. "Change it" is not
// an ACT_CHOICE (:343), so it is recorded as the exact choice, outcome "answered", with no `words` in `recorded`; obligations
// turn it into instructor-change-owed whose text is only the choice ("Change it", obligations.mjs:146, :1124), and
// owedWords never lists it. What the instructor said the value should be stays only in the answer record's
// instructorWords, which nothing tells the agent to read — the sibling of round 6's MEDIUM-2.
// Cheapest fix: return `words` with every recorded digest answer (or carry instructorWords into acts.changes and the
// instructor-change-owed text).
test("[req.host.alembic-needs-apply] audit7 MEDIUM-3: the words given with \"Change it\" on a disputed fact reach the agent", async (t) => {
  const c = course(t);
  const text = c.units().find((u) => u.id === U3).text;
  const f = finding("f-audit7-fd", "fact-disputed", [U3], { type: "conflict", claimKey: "ck-audit7", claimText: text, claim: 1, quotes: [], conflicts: [{ claimed: "numerator", source: "denominator" }] }, { module: "ms8-verdicts" });
  const r = await exportNeeds(c.root, { changesetId: "audit7-chg-00001", gate: { findings: [f] } });
  const q = digestQ(r)[0];
  assert.ok(q.choices?.includes("Change it"), `precondition: ${JSON.stringify(q.choices)}`);
  const how = "Products go in the numerator; say so with the general expression for aA + bB.";
  const a = applyChanges(c.root, { answers: [answer("audit7-chg-00001", q.id, "i-1", "Change it", how)] });
  assert.equal(a.recorded[0]?.outcome, "answered", `precondition: recorded (${JSON.stringify(a)})`);
  const owed = [...(instructorActsOf(c.log()).changes.get(U3) || new Map()).values()];
  assert.ok(owed.length, "precondition: a change is recorded as asked for (instructor-change-owed while the claim reads so)");
  const reached = JSON.stringify(a.recorded).includes(how) || JSON.stringify(owed).includes(how) || JSON.stringify(owedWords(c.root)).includes(how);
  assert.ok(reached, `what to change it to reaches no one: recorded ${JSON.stringify(a.recorded)}; owed change ${JSON.stringify(owed)}`);
});

// ---- MEDIUM-4: the instructor's answer to the agent's own question (M5) or an interrupt is surfaced in one job only --
// apply records an interrupt / M5 answer as "answered" and returns its `answer` and `words` (alembic_needs.mjs:414-418),
// but it is not owed (saidOwed reads only "said: …" digest choices): a job that stops after apply (the case round 5's
// MEDIUM-3 made said words owed for) loses it — the next apply says "already recorded", the next export does not ask
// again (answered), and owedWords / owedToYou / status never list it. The agent's own question is the one whose answer
// it most needs.
// Cheapest fix: owe interrupt and M5 answers that carry words like said answers (listed until taken up), or list the
// latest answers to M5 contacts in export/status until the agent records taken-up.
test("[req.host.alembic-needs-apply] audit7 MEDIUM-4: an answer to the agent's own question survives a job that stops after apply", async (t) => {
  const c = course(t);
  appendLogRecord(c.root, { type: "contact", party: AGENT, payload: { moment: "M5", reason: "missing-input", question: "Which edition of the textbook should the equilibrium chapter follow?" } });
  const r1 = await exportNeeds(c.root, { changesetId: "audit7-m5-00001", gate: { findings: [] } });
  const q = r1.handin.digest.questions.find((x) => x.id.startsWith("m5."));
  assert.ok(q, "precondition: the M5 question is asked");
  const words = "Use the 3rd edition; its Table 15.2 has the values I teach from.";
  const a1 = applyChanges(c.root, { answers: [answer("audit7-m5-00001", q.id, "i-1", words)] });
  assert.ok(JSON.stringify(a1.recorded).includes(words), "precondition: shown once, in this job's apply output");
  // the job stops here; the next job applies the same changes and exports
  const a2 = applyChanges(c.root, { answers: [answer("audit7-m5-00001", q.id, "i-1", words)] });
  const r2 = await exportNeeds(c.root, { changesetId: "audit7-m5-00002", gate: { findings: [] } });
  const later = JSON.stringify([a2.recorded, a2.owed, r2.owed, owedWords(c.root)]).includes(words) || r2.handin.digest.questions.some((x) => x.id === q.id);
  assert.ok(later, `the instructor's answer to the agent's question is gone from every later surface: ${JSON.stringify({ a2, owed: r2.owed })}`);
});

// ---- LOW-5: a round-4 taken-up record (no `binding` flag) answers a binding question --------------------------------
// takenUpOf (digest.mjs:56-64) maps an old record's `keys` onto said answers (as intended), but treats a record without
// `binding` as answering. Round-4 records never carried the flag (it came in round 5), so words taken up on a confirm /
// keep / accept-as-mine question under round 4 close it for good, with "said: …" as its answer — contrary to the round-5
// rule that only the instructor's choice settles such a question. (Only packages that ran a round-4 build.)
// Cheapest fix: for a record without `answers` (old format), derive `binding` from the said answer's marker kind
// (BINDING_KINDS), as takenUp does now.
test("[req.host.alembic-needs-apply] audit7 LOW-5: an old-format taken-up record leaves a binding question to be asked again", async (t) => {
  const c = course(t);
  const ghost = "u-study-guide-chemical-equilibrium-unread-17";
  const f = finding("f-audit7-ex", "exercise-data-confirm", [ghost], { type: "judgment", note: "the values here read as invented exercise data — confirm them?", quote: "0.25 M" }, { module: "ms8-verdicts" });
  const q1 = digestQ(await exportNeeds(c.root, { changesetId: "audit7-old-00001", gate: { findings: [f] } }))[0];
  assert.equal(q1.choices, undefined, "precondition: answered in words");
  applyChanges(c.root, { answers: [answer("audit7-old-00001", q1.id, "i-1", "Yes, they are made up.")] });
  const keys = [...saidOwed(c.root).values()].flatMap((o) => o.keys);
  assert.equal(keys.length, 1, "precondition: one owed key");
  // the record a round-4 build wrote (a888103 alembic_needs.mjs takenUp): keys, no answers, no binding flag
  appendLogRecord(c.root, { type: "revision", party: AGENT, payload: { event: "said-taken-up", keys, changesetId: "audit7-old-00001", question: q1.id, note: "Asked again with its choices.", words: ["Yes, they are made up."] } });
  const q2 = digestQ(await exportNeeds(c.root, { changesetId: "audit7-old-00002", gate: { findings: [f] } }));
  assert.equal(q2.length, 1, "the binding question is closed by words taken up under round 4");
});

// ---- LOW-6: an act that throws after answerDigest logged the answer leaves a closed question and grows the log per job --
// answerDigest appends the answer record first (digest.mjs:180) and then runs the act (confirmUnits, claimAuthorship,
// adoptInstructorText), which can still refuse (claimAuthorship: "not of unknown authorship"; confirmUnits: a live
// contradiction). apply catches it as a skip (alembic_needs.mjs:465) and writes no marker, so: the answer record stands
// (answeredBases closes the question with "Accept as mine" though nothing was claimed by it), and every later apply of the
// same `alembic changes` appends one more answer record and one more skip. Reachable when the same question is in two
// hand-ins and both are answered (the first claim succeeds, the second refuses).
// Cheapest fix: write the "asked again"/"skipped" marker on a throw from answerDigest (as the guard does), or check the
// act's own precondition before answerDigest appends.
test("[req.host.alembic-needs-apply] audit7 LOW-6: an answer whose act refuses is logged once, not once per job", async (t) => {
  const c = course(t);
  const SG = "study-guide/le-chatelier.md", ANCHOR = "but it also slows the rate.";
  const T0 = "Some textbooks quote the industrial operating temperature as about 400 degrees Celsius.";
  const f0 = path.join(c.root, SG); fs.writeFileSync(f0, fs.readFileSync(f0, "utf8").replace(ANCHOR, () => `${ANCHOR}\n\n${T0}`));
  indexAndStamp(c.root, c.r(), {});
  const pid = c.units().find((u) => u.text === T0)?.id;
  assert.ok(pid, "precondition: indexed, unknown authorship");
  const f = finding("f-audit7-unk", "unit-unknown-authorship", [pid], { type: "judgment", note: `${SG}: 1 passage(s) changed outside an agent session — yours (accept as mine), someone else's (name them), or revert?` });
  const qa = digestQ(await exportNeeds(c.root, { changesetId: "audit7-twice-001", gate: { findings: [f] } }))[0];
  const qb = digestQ(await exportNeeds(c.root, { changesetId: "audit7-twice-002", gate: { findings: [f] } }))[0];
  assert.ok(qa.choices?.includes("Accept as mine") && qb.choices?.includes("Accept as mine"), "precondition: both hand-ins ask it");
  const changes = { answers: [
    { ...answer("audit7-twice-001", qa.id, "i-1", "Accept as mine", "I wrote it."), at: "2026-11-10T12:00:00.000Z" },
    { ...answer("audit7-twice-002", qb.id, "i-2", "Accept as mine", "I wrote it."), at: "2026-11-10T12:01:00.000Z" }] };
  const answersOf = () => c.log().filter((x) => x.type === "answer" && x.payload.answers.some((y) => y.finding === f.id)).length;
  const a1 = applyChanges(c.root, changes);
  const n1 = answersOf();
  const a2 = applyChanges(c.root, changes), a3 = applyChanges(c.root, changes);
  assert.equal(answersOf(), n1, `each job appends another answer record for the refused act: ${n1} → ${answersOf()} (${JSON.stringify([a1.skipped, a2.skipped, a3.skipped])})`);
});

// ---- MEDIUM-7: every off-plan passage of the course is one question, and "Keep it" keeps them all, one shown ----------
// The off-spine note (ms9-alignment.mjs:70) differs only by its unit id, which rootCause folds (digest.mjs:30), so every
// off-spine finding clusters into ONE entry (likewise every detail-in-spine finding: its evidence.rule is a fixed string,
// core_checks.mjs:120). wordEntry shows only the first unit's passage (needs_wording.mjs:455-456) and offers one-click
// "Keep it"; the answer closes every finding of the entry (e.bases). The count line ("comes up in N places") says how many,
// never which. Questions only (nothing blocks), so MEDIUM: the instructor settles passages they never saw.
// Cheapest fix: as HIGH-1 — one-click choices only for an entry whose every finding's text is shown (count 1, or binds()
// shows each unit); otherwise the instructor answers in words.
test("[req.host.alembic-needs-apply] audit7 MEDIUM-7: \"Keep it\" on an off-plan passage never keeps passages the question did not show", async (t) => {
  const c = course(t);
  const t2 = c.units().find((u) => u.id === P2).text;
  const off = (id, u) => ({ ...finding(id, "off-spine", [u], { type: "judgment", note: `${u} teaches nothing in the chapter's approved plan: keep it (the spine may need it) or drop it?` }), module: "ms9-alignment" });
  const r = await exportNeeds(c.root, { changesetId: "audit7-off-0001", gate: { findings: [off("f-audit7-off1", P1), off("f-audit7-off2", P2)] } });
  const qs = digestQ(r);
  assert.equal(qs.length, 1, "precondition: one entry for both");
  const q = qs[0];
  assert.equal(q.choices, undefined, `a cluster offers no one-click choice (${JSON.stringify(q.choices)})`);
  asOffered(c.root, "audit7-off-0001", q.id, ["Keep it", "Drop it", "Later"]); // as an earlier hand-in offered it
  const shownP2 = `${q.text}\n${q.detail || ""}`.includes(t2.slice(30, 90));
  applyChanges(c.root, { answers: [answer("audit7-off-0001", q.id, "i-1", "Keep it", "Keep it.")] });
  const kept = c.log().filter((x) => x.type === "answer").flatMap((x) => x.payload.answers).filter((x) => x.choice === "Keep it").map((x) => x.finding);
  assert.ok(!kept.includes("f-audit7-off2") || shownP2, `"Keep it" settled a passage the question never showed: ${JSON.stringify(kept)}`);
});
