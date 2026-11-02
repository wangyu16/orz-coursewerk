// What needs the instructor, through Alembic's "Needs you" (owner 2026-11-02): the hand-in a job gives
// `alembic handin`, and the answers `alembic changes` brings back, recorded with Coursewerk's own acts. On the real C2
// package: a chapter whose new version waits for the instructor's approval, a real correction (a planted wrong constant
// corrected from a pinned source), the course's real digest question, and an agent's M5 interrupt.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { indexAndStamp, openVersionCarrying } from "../scripts/lib/core/obligations.mjs";
import { appendLogRecord, parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { makeFinding } from "../scripts/lib/records/findings.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { fsInputReader, pinnedTexts } from "../scripts/lib/verify/references.mjs";
import { applyCorrection, correctionsToShow, verifySemi } from "../scripts/lib/verify/verdicts.mjs";
import { pinDeclared as pinReference } from "./helpers/destinations.mjs";
import { applyChanges, digestQuestion, exportNeeds, handinProblems, LIMITS, QUESTION_ID } from "../scripts/lib/core/alembic_needs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const BY = { id: "u-42", name: "Yu Wang" };

function copy(t) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-needs-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(C2, path.join(dir, "pkg"), { recursive: true }); fs.cpSync(INPUTS, path.join(dir, "inputs"), { recursive: true });
  const root = path.join(dir, "pkg");
  return { root, inputs: path.join(dir, "inputs"), reader: liveReader(root) };
}
/** le-chatelier's version 2, opened the harness's way: its plan waits for the instructor's approval. */
const openV2 = (p) => openVersionCarrying(p.root, p.reader, { scopes: ["chapter:le-chatelier"], reason: "objectives split", instructorWords: "Open version 2: the objectives split." }, I);
/** A real correction: a wrong constant in the agent's text, contradicted by a pinned source and corrected (verdict-path). */
const PLANTED = "u-study-guide-le-chatelier-worked-examples-2";
const HABER = "For the ammonia synthesis reaction N2 + 3 H2 ⇌ 2 NH3 the standard reaction enthalpy is −92.4 kJ per mole of reaction, so by Le Chatelier's principle raising the temperature shifts the reaction toward the reactants.";
async function plantCorrection(p) {
  beginSession(p.root, p.reader, AGENT);
  const f = path.join(p.root, "study-guide/le-chatelier.md");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("the reaction and $\\Delta H = -92\\ \\text{kJ mol}^{-1}$ are from the source", "the reaction and $\\Delta H = -75\\ \\text{kJ mol}^{-1}$ are from the source"));
  indexAndStamp(p.root, p.reader, { as: "agent", party: AGENT });
  pinReference(p.root, p.inputs, { url: "https://openstax.org/books/chemistry-2e/pages/13-3-shifting-equilibria-le-chateliers-principle", title: "Shifting equilibria (test pin)", destination: "openstax.org/books/chemistry-2e", text: HABER });
  const texts = pinnedTexts(fsInputReader(p.inputs));
  const verifier = replayVerifier((prompt) => {
    const nonce = prompt.match(/"nonce": "([0-9a-f]+)"/)[1];
    const ps = prompt.split("\nPASSAGES\n")[1].split("\n").map((l) => l.match(/^\[(\d+)\] (.*)$/)).filter(Boolean).map((m) => ({ n: Number(m[1]), text: m[2] }));
    const n = prompt.split("\nCLAIMS\n")[1].split("\n\nPASSAGES")[0].split("\n").filter((l) => /^\d+\. /.test(l)).length;
    const x = ps.find((q) => q.text.includes("−92.4 kJ"));
    return { nonce, claims: Array.from({ length: n }, (_, i) => (x ? { claim: i + 1, verdict: "contradicted", quotes: [{ passage: x.n, text: "the standard reaction enthalpy is −92.4 kJ per mole of reaction, so by Le Chatelier's principle raising the temperature shifts the reaction toward the reactants" }] } : { claim: i + 1, verdict: "not-found", quotes: [] })) };
  });
  await verifySemi(p.root, p.reader, { texts, verifier, only: [PLANTED] });
  const plain = new Map([...texts].filter(([, v]) => v.ok).map(([k, v]) => [k, v.text]));
  const c = applyCorrection(p.root, p.reader, { unitId: PLANTED, plainTexts: plain }, AGENT);
  assert.equal(c.applied, true);
  return c.correction;
}
const log = (p) => parseLog(readLogText(p.root));
const answer = (handin, id, ans, extra = {}) => ({ item: `item-${id}-${ans}-${extra.words ? "w" : "n"}`, changesetId: handin.changesetId, question: id, answer: ans, by: BY, at: "2026-11-02T12:00:00.000Z", ...extra });

test("[req.host.alembic-needs-export] [req.host.alembic-needs-apply] the hand-in carries an interrupt, an approval, a correction and the digest; the answers are recorded once, in the person's name and words", async (t) => {
  const p = copy(t);
  openV2(p);
  const correction = await plantCorrection(p);
  appendLogRecord(p.root, { type: "contact", party: { role: "agent", name: "executor", model: "claude-haiku-5-5" }, payload: { moment: "M5", reason: "missing-input", question: "Which edition of the lab manual should chapter 2 cite?" } });
  const r = await exportNeeds(p.root, { changesetId: "job-0001", model: "claude-haiku-5-5", inputsDir: p.inputs });
  const qs = r.handin.digest.questions;
  assert.deepEqual(handinProblems(r.handin), [], "inside Alembic's limits");
  assert.ok(qs.length <= LIMITS.questions && qs.every((q) => QUESTION_ID.test(q.id)));
  const kinds = qs.map((q) => q.id.split(".")[0]);
  assert.deepEqual([...new Set(kinds)], ["m5", "approve", "c", "d"], "interrupts, approvals, corrections, then the digest");
  const m5 = qs.find((q) => q.id.startsWith("m5.")), approve = qs.find((q) => q.id.startsWith("approve.")), corr = qs.find((q) => q.id.startsWith("c.")), dq = qs.find((q) => q.id.startsWith("d."));
  assert.equal(m5.words, "optional"); assert.equal(m5.choices, undefined); assert.match(m5.text, /^missing input: Which edition/);
  assert.match(approve.id, /^approve\.le-chatelier\.[0-9a-f]{12}$/); assert.deepEqual(approve.choices, ["Approve", "Not yet"]);
  assert.equal(approve.words, "required"); assert.equal(approve.wordsSuggested, undefined, "an approval's words are never suggested");
  assert.deepEqual(approve.refs, ["concepts/le-chatelier.md", "assessment-support/le-chatelier.md"]);
  assert.deepEqual(corr.choices, ["Keep", "Undo"]); assert.equal(corr.recommended, "Keep"); assert.match(corr.detail, /-75.*\n.*-92\.4/s); assert.deepEqual(corr.refs, ["study-guide/le-chatelier.md"]);
  assert.ok(qs.filter((q) => q.id.startsWith("d.")).every((q) => q.wordsSuggested === undefined));
  assert.ok(log(p).some((x) => x.type === "checkpoint" && x.payload?.moment === "M4"), "with --model the digest is delivered");
  t.diagnostic(JSON.stringify({ m5, approve, corr, dq }));

  // the answers, as `alembic changes` brings them (with one decision and one answer to someone else's question)
  const changes = { answers: [
    answer(r.handin, approve.id, "Approve"), // no words: skipped
    answer(r.handin, approve.id, "Approve", { words: "Approve chapter 2, version 2." }),
    answer(r.handin, corr.id, "Undo"), // no words: skipped
    answer(r.handin, corr.id, "Undo", { words: "Our lab manual uses -75 on purpose." }),
    answer(r.handin, m5.id, "The 2024 edition.", { via: "email" }),
    answer(r.handin, dq.id, "Keep it in the spine.", { words: "Keep the attribution in the key term." }),
    { ...answer(r.handin, "d.other", "x"), changesetId: "someone-else" },
  ], decisions: [{ id: "x" }] };
  const a = applyChanges(p.root, changes);
  assert.deepEqual(a.recorded.map((x) => x.outcome).sort(), ["answered", "answered", "approved", "undone"]);
  assert.deepEqual(a.skipped.map((x) => x.reason).sort(), ["an undo records why the text stands: the instructor's words are required", "the instructor's words are required and were not given"]);
  assert.equal(a.ignored, 1);
  const recs = log(p);
  const approval = recs.find((x) => x.type === "approval" && x.payload.scope === "chapter:le-chatelier" && x.payload.version === 2);
  assert.equal(approval.party.name, "Yu Wang"); assert.equal(approval.party.role, "instructor"); assert.equal(approval.payload.instructorWords, "Approve chapter 2, version 2.");
  assert.ok(recs.some((x) => x.type === "divergence" && x.payload.correction === correction.id && x.payload.note === "Our lab manual uses -75 on purpose."));
  const m5ans = recs.find((x) => x.type === "answer" && x.payload.answers[0].finding.startsWith("contact:"));
  assert.equal(m5ans.payload.instructorWords, "The 2024 edition.", "a free-text answer is the person's words");
  const marks = recs.filter((x) => x.type === "contact" && x.payload.moment === "host-answer");
  assert.equal(marks.length, 4);
  assert.deepEqual(Object.keys(marks[0].payload.by), ["id", "name"]); assert.equal(marks[0].payload.host, "alembic"); assert.equal(marks[0].payload.changesetId, "job-0001");
  assert.equal(marks.find((m) => m.payload.question === m5.id).payload.via, "email");
  // a second run records nothing again
  const before = readLogText(p.root);
  const again = applyChanges(p.root, changes);
  assert.equal(again.recorded.length, 0); assert.equal(readLogText(p.root), before);
  assert.equal(again.skipped.filter((x) => x.reason === "already recorded").length, 4);
  // the next hand-in no longer asks what was answered
  const next = await exportNeeds(p.root, { changesetId: "job-0002", gate: { findings: [] } });
  assert.deepEqual(next.handin.digest.questions.map((q) => q.id.split(".")[0]), [], "the interrupt, the approval and the correction are settled");
});

test("[req.host.alembic-needs-apply] an approval is recorded only for the plan that was asked about; Not yet leaves it open", async (t) => {
  const p = copy(t);
  openV2(p);
  const r = await exportNeeds(p.root, { changesetId: "job-0003", gate: { findings: [] } });
  const approve = r.handin.digest.questions.find((q) => q.id.startsWith("approve."));
  assert.equal(applyChanges(p.root, { answers: [answer(r.handin, approve.id, "Not yet")] }).recorded[0].outcome, "left open");
  fs.appendFileSync(path.join(p.root, "concepts", "le-chatelier.md"), "\n- An extra sub-concept added after the question was asked.\n");
  const a = applyChanges(p.root, { answers: [answer(r.handin, approve.id, "Approve", { words: "Approve it." })] });
  assert.deepEqual(a.skipped.map((x) => x.reason), ["the plan changed since it was asked"]);
  assert.ok(!log(p).some((x) => x.type === "approval" && x.payload.version === 2));
  // an answer that is not one of the choices is not recorded either
  assert.match(applyChanges(p.root, { answers: [{ ...answer(r.handin, approve.id, "Yes please", { words: "ok" }), item: "z" }] }).skipped[0].reason, /not one of the choices/);
});

test("[req.host.alembic-needs-export] Alembic's limits: at most 20 questions, the rest left for next time; Coursewerk's choices for a digest kind; never suggested words", async (t) => {
  const p = copy(t);
  appendLogRecord(p.root, { type: "steering", party: I, payload: { event: "digest-cap", cap: 50, instructorWords: "Up to fifty." } });
  const words = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda", "mu", "nu", "xi", "omicron", "pi", "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega", "aleph"];
  const findings = words.map((w) => makeFinding({ module: "ms8-verdicts", kind: `probe-${w}`, units: [], statusClass: "question", route: "digest", basis: "b", evidence: { type: "judgment", note: `Is the ${w} line right? ${"x".repeat(600)}` } }));
  const r = await exportNeeds(p.root, { changesetId: "job-0004", gate: { findings } });
  assert.equal(r.handin.digest.questions.length, 20); assert.equal(r.left, 5);
  assert.deepEqual(handinProblems(r.handin), []);
  assert.ok(r.handin.digest.questions.every((q) => q.text.length <= LIMITS.text && q.words === "optional" && q.choices === undefined), "free text: the answer is the words");
  // a kind Coursewerk answers by choice
  const e = { key: "k", kind: "exercise-data-confirm", count: 1, chapters: ["le-chatelier"], units: ["u-1"], question: "u-1: the values read as invented exercise data — confirm them?", evidence: { quote: "x = 3 mol" }, recommendation: "confirm", recommendedBy: "check" };
  const q = digestQuestion(e, new Map([["u-1", "practice/le-chatelier.md"]]));
  assert.deepEqual(q.choices, ["Confirm", "Later"]); assert.equal(q.recommended, "Confirm"); assert.equal(q.words, "required"); assert.equal(q.wordsSuggested, undefined);
  assert.deepEqual(q.refs, ["practice/le-chatelier.md"]);
  assert.equal(digestQuestion({ ...e, kind: "instructor-edit-unasked", recommendation: "revert" }).recommended, "Revert");
  assert.equal(digestQuestion({ ...e, kind: "fact-disputed", recommendation: "revise: say -92.4" }).recommended, undefined, "a recommendation that is no choice goes in the detail");
  // the limits themselves
  const bad = { changesetId: "x", digest: { questions: [{ id: "a b", text: "two\nlines", choices: ["A"], recommended: "B", wordsSuggested: "w" }, { id: "a b", text: "ok" }] } };
  assert.equal(handinProblems(bad).length, 8, "changeset, id twice, repeated id, text, one choice, recommended, words suggested without words");
});

test("[req.host.alembic-needs-apply] Keep on a correction records Coursewerk's own record of it shown and settled; it is not asked again", async (t) => {
  const p = copy(t);
  const correction = await plantCorrection(p);
  const r = await exportNeeds(p.root, { changesetId: "job-0005", gate: { findings: [] } });
  const corr = r.handin.digest.questions.find((q) => q.id.startsWith("c."));
  assert.ok(corr, "the correction is asked");
  const a = applyChanges(p.root, { answers: [answer(r.handin, corr.id, "Keep")] });
  assert.deepEqual(a.recorded.map((x) => x.outcome), ["kept"], "Keep needs no words");
  const recs = log(p);
  const shown = recs.find((x) => x.type === "revision" && x.payload.event === "corrections-shown" && x.payload.corrections.includes(correction.id));
  assert.equal(shown.party.role, "harness"); assert.equal(shown.party.name, "corrections");
  assert.equal(a.recorded[0].seq, shown.seq);
  assert.equal(recs.find((x) => x.type === "contact" && x.payload.moment === "host-answer").payload.recorded, shown.seq);
  assert.ok(!recs.some((x) => x.type === "divergence"), "the correction stands");
  assert.equal(correctionsToShow(p.root).length, 0);
  assert.equal((await exportNeeds(p.root, { changesetId: "job-0006", gate: { findings: [] } })).handin.digest.questions.filter((q) => q.id.startsWith("c.")).length, 0);
});
