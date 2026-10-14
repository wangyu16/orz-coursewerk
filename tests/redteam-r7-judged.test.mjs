// Red team, round 7 — one cause (D46, D50 cause 2): A REVIEW, OR THE INSTRUCTOR'S OVERRULE, WAS BOUND TO THE WRONG
// THING. The round-6 standing rule keyed currency on the whole unit's reader view and the set of items a review judged,
// so a change that had nothing to do with a judgment started it fresh, while a change that did matter left it standing.
// The round's findings are test cases of the cause:
//   R7 C2-L1  a second link added to a unit (its text unchanged) made an honest "no" for objective O history, and a
//             re-run "yes" for O stood: reviewer shopping by link churn;
//   R7 C2-L2  the instructor's link overrule (D49) was bound only to the passage: it outlived a substantive change of the
//             objective it judged, approved in full, and turned a later honest "no" into "yes";
//   R7-K04    a "wrong" knowledge concern was bound to the whole unit: one unrelated visible word edited in another
//             sentence, plus one clean re-run, cleared it while its quoted words stood verbatim.
// The fix: each adverse result is bound to exactly what it judged (standing.mjs itemCurrent): a link verdict to the
// passage and O's own text; an overrule to the passage, O's text and the verdict it overruled; a knowledge, absolute or
// spine concern to its words in their sentence (or its line); a fact check to its claim. Plus the spine items C4.10
// (instructor words of invisible characters only) and C4.11 (a wrapped prose line that begins like a list number).
// Offline and deterministic: every blind review is a replayed test double.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader, manifestChapters } from "../scripts/lib/core/package_reader.mjs";
import { indexAndStamp, linkUnits, loadUnits, teachesInDeliverable } from "../scripts/lib/core/obligations.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { approvalPrecondition, changedSpineLines, currentSpineReview, reviewSpineChanges } from "../scripts/lib/core/spine_review.mjs";
import { approvalStatus, glanceProblem, recordApproval } from "../scripts/lib/core/approvals.mjs";
import { spineReviewQuestions } from "../scripts/lib/core/core_checks.mjs";
import { answerDigest, buildDigest } from "../scripts/lib/core/digest.mjs";
import { unitInfoOf } from "../scripts/lib/core/workflow.mjs";
import { readLogText } from "../scripts/lib/records/log.mjs";
import { hasVisibleWords } from "../scripts/lib/records/words.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { currentReviewsAt, reviewAlignment } from "../scripts/lib/verify/alignment.mjs";
import { absoluteSentences } from "../scripts/lib/verify/absolutes.mjs";
import { reviewAbsolutes, verifyKnowledge } from "../scripts/lib/verify/verdicts.mjs";
import { concernStands, quotedSentenceKey, standingOf } from "../scripts/lib/verify/standing.mjs";
import { createSnapshot } from "../scripts/lib/skeleton/snapshot.mjs";
import ms8 from "../scripts/modules/ms8-verdicts.mjs";
import ms9 from "../scripts/modules/ms9-alignment.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const LCH = "study-guide/le-chatelier.md", MAP = "concepts/le-chatelier.md", SCOPE = "chapter:le-chatelier";
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r7jud-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  fs.cpSync(C2, root, { recursive: true }); fs.cpSync(INPUTS, inputs, { recursive: true });
  const git = (...a) => spawnSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@t", ...a]);
  git("init", "-q", "-b", "main"); git("add", "-A"); git("commit", "-qm", "base");
  const c = {
    root, inputs, r: () => liveReader(root),
    units: () => loadUnits(root, liveReader(root)),
    unit: (id) => loadUnits(root, liveReader(root)).find((u) => u.id === id),
    read: (rel) => fs.readFileSync(path.join(root, rel), "utf8"),
    write: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent: (fn) => { beginSession(root, liveReader(root), AGENT); fn(); indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    snapshot: () => createSnapshot(root, { profile: "public", checkpoint: "V8", inputsDir: inputs }),
    ms8: () => ms8.run(c.snapshot()),
    ms9: () => ms9.run(c.snapshot()),
    verdict: (id, node) => currentReviewsAt(root, liveReader(root), loadUnits(root, liveReader(root))).get(id)?.verdicts.get(node),
    approve: (words = "Approved.", chapter = "le-chatelier") => recordApproval(root, liveReader(root), manifestChapters(liveReader(root)), { chapter, instructorWords: words }, I),
    glance: (words = "Fine, a wording fix.", chapter = "le-chatelier") => recordApproval(root, liveReader(root), manifestChapters(liveReader(root)), { chapter, glance: true, instructorWords: words }, I),
  };
  c.edit = (rel, from, to) => c.asAgent(() => c.write(rel, from, to));
  return c;
}

// ---- link reviews: a verdict for O is bound to the passage and O's own text, never to the other links -----------------
const declaredOf = (pr) => (pr.split("\nDECLARED ITEMS\n")[1] || "").split("\n\n")[0].split("\n").map((l) => l.replace(/^- /, "").split(":")[0].trim()).filter((l) => /\./.test(l));
const gidsOf = (pr) => [...pr.matchAll(/^- (guide\.\S+): /gm)].map((m) => m[1]);
/** A replayed link reviewer: `verdictFor(node id)` for each declared item. */
const linkReviewer = (verdictFor) => replayVerifier((pr) => ({ nonce: nonceOf(pr), links: declaredOf(pr).map((id) => ({ id, verdict: verdictFor(id), why: "test double" })), also: [], offPlan: false,
  ...(/its assessment guide entry asks for/.test(pr) ? { fidelity: { type: "matches", level: "matches", why: "t" } } : gidsOf(pr).length ? { fidelity: gidsOf(pr).map((id) => ({ id, type: "matches", level: "matches", why: "t" })) } : {}) }));
/** A study-guide teaching unit linked to exactly one objective, that objective, and another objective of its chapter. */
function oneObjectiveUnit(c) {
  const u = c.units().find((x) => x.role === "teaching" && /^study-guide\//.test(x.locator.deliverable) && (x.spineNodes || []).filter((n) => n.startsWith("objective.")).length === 1);
  const O = u.spineNodes.find((n) => n.startsWith("objective.")), chapter = O.split(".")[1];
  const other = c.units().flatMap((x) => x.spineNodes || []).find((n) => n.startsWith(`objective.${chapter}.`) && n !== O);
  assert.ok(u && O && other, "the fixture has such a unit");
  return { u, O, other };
}

test("[req.reviews.judged] [req.control.link-review] R7 C2-L1: adding a link (the text unchanged) does not make an honest 'no' history — a re-run 'yes' does not override it", async (t) => {
  const c = course(t);
  const { u, O, other } = oneObjectiveUnit(c);
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer(() => "no"), only: [u.id] });
  assert.equal(c.verdict(u.id, O), "no");
  linkUnits(c.root, c.r(), { [u.id]: [...u.spineNodes, other] }, AGENT); // link churn, the text unchanged
  assert.equal(c.verdict(u.id, O), "no", "the 'no' for O is still about what it judged");
  assert.equal(currentReviewsAt(c.root, c.r(), c.units()).get(u.id).verdicts.has(other), false, "the new link has no review yet: it is owed, not 'unanswered'");
  assert.equal(c.ms9().filter((f) => f.kind === "alignment-unscorable" && f.units.includes(u.id)).length, 0, "the old review is read as what it was asked: nothing is unreadable");
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer(() => "yes"), only: [u.id] }); // the re-run that agrees
  assert.equal(c.verdict(u.id, O), "no", "the 'no' stands over the re-run");
  assert.equal(c.verdict(u.id, other), "yes", "the new link is judged by the fresh review");
  const doubt = c.ms9().find((f) => f.kind === "link-doubtful" && f.units.includes(u.id) && f.evidence.link === O);
  assert.ok(doubt, "MS9 still doubts the link");
  assert.match(doubt.evidence.note, /disagree/);
  // control: a real change of the passage lets a fresh review speak
  const tail = c.unit(u.id).text.trim().slice(-30);
  c.edit(u.locator.deliverable, tail, `${tail} This is the point to remember.`);
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer(() => "yes"), only: [u.id] });
  assert.equal(c.verdict(u.id, O), "yes");
});

test("[req.reviews.judged] [req.control.link-review] variant: link churn by REMOVAL — dropping another link does not make the 'no' for O history either", async (t) => {
  const c = course(t);
  const { u, O, other } = oneObjectiveUnit(c);
  linkUnits(c.root, c.r(), { [u.id]: [...u.spineNodes, other] }, AGENT);
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer((id) => (id === O ? "no" : "yes")), only: [u.id] });
  assert.equal(c.verdict(u.id, O), "no");
  linkUnits(c.root, c.r(), { [u.id]: u.spineNodes }, AGENT); // the other link removed
  assert.equal(c.verdict(u.id, O), "no", "still current after the removal");
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer(() => "yes"), only: [u.id] });
  assert.equal(c.verdict(u.id, O), "no", "a re-run after the removal does not override it");
  // control: a substantive change of O's own text (approved in full) is a new item — a fresh review of it speaks
  const c2 = course(t);
  const OBJ = "objective.le-chatelier.state-principle";
  const v = c2.units().find((x) => teachesInDeliverable(x, OBJ));
  await reviewAlignment(c2.root, c2.r(), { verifier: linkReviewer((id) => (id === OBJ ? "no" : "yes")), only: [v.id] });
  assert.equal(c2.verdict(v.id, OBJ), "no");
  c2.write(MAP, "1. State Le Chatelier's principle: a system at equilibrium that is disturbed shifts to a new equilibrium that partially counteracts the disturbance.", "1. State Le Chatelier's principle in words, and recognise a disturbance of an equilibrium.");
  c2.approve("Approved, the new objective 1.");
  assert.equal(currentReviewsAt(c2.root, c2.r(), c2.units()).get(v.id)?.verdicts.has(OBJ) ?? false, false, "O changed: the old verdict is history, a review is owed");
  await reviewAlignment(c2.root, c2.r(), { verifier: linkReviewer(() => "yes"), only: [v.id] });
  assert.equal(c2.verdict(v.id, OBJ), "yes", "the fresh review of the new objective speaks");
});

// ---- the instructor's overrule: bound to the passage, the objective's text and the verdict it overruled -------------
const emptyDigest = (c) => buildDigest(c.root, [], unitInfoOf(c.root, c.r()));
const overrule = (c, unit, link, words = "It does practise the principle.") => answerDigest(c.root, emptyDigest(c), { overrules: [{ unit, links: [link] }], instructorWords: words, reader: c.r() }, I);
const Q2 = "u-practice-le-chatelier-questions-3", OBJ1_ID = "objective.le-chatelier.state-principle";
const OBJ1 = "1. State Le Chatelier's principle: a system at equilibrium that is disturbed shifts to a new equilibrium that partially counteracts the disturbance.";

test("[req.reviews.judged] [req.control.link-overrule] R7 C2-L2: an overrule lapses when the objective it judged changes substantively, even approved in full — a later honest 'no' stands", async (t) => {
  const c = course(t);
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer((id) => (id === OBJ1_ID ? "no" : "yes")), only: [Q2] });
  overrule(c, Q2, OBJ1_ID);
  const act = readLogText(c.root).split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.type === "answer").at(-1);
  assert.ok(act.payload.answers[0].overrule.linkKey, "the overrule names the objective's text it judged");
  assert.equal(c.verdict(Q2, OBJ1_ID), "yes");
  c.write(MAP, OBJ1, "1. Derive the van 't Hoff equation and use it to compute how K changes with temperature.");
  c.approve("Approved, the new objective 1.");
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer((id) => (id === OBJ1_ID ? "no" : "yes")), only: [Q2] });
  assert.equal(c.verdict(Q2, OBJ1_ID), "no", "the overrule judged another objective: it lapsed");
});

test("[req.reviews.judged] [req.control.link-overrule] variant: an overrule survives a light edit of the objective (emphasis, confirmed at a glance), and lapses when the verdict it overruled changes", async (t) => {
  const c = course(t);
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer((id) => (id === OBJ1_ID ? "no" : "yes")), only: [Q2] });
  overrule(c, Q2, OBJ1_ID);
  c.write(MAP, OBJ1, OBJ1.replace("a system at equilibrium", "a *system at equilibrium*"));
  assert.equal(c.verdict(Q2, OBJ1_ID), "yes", "a light edit of the objective leaves the overrule standing");
  c.glance();
  assert.equal(c.verdict(Q2, OBJ1_ID), "yes", "…confirmed at a glance too");
  // the verdict it overruled: a "passing" overruled, then an honest "no" of the same text — a different verdict
  const d = course(t);
  const OBJ = "objective.le-chatelier.predict-temperature-shift";
  const u = d.units().find((x) => teachesInDeliverable(x, OBJ));
  await reviewAlignment(d.root, d.r(), { verifier: linkReviewer((id) => (id === OBJ ? "passing" : "yes")), only: [u.id] });
  overrule(d, u.id, OBJ, "It teaches the temperature shift; keep it.");
  assert.equal(d.verdict(u.id, OBJ), "yes");
  await reviewAlignment(d.root, d.r(), { verifier: linkReviewer((id) => (id === OBJ ? "no" : "yes")), only: [u.id] });
  assert.equal(d.verdict(u.id, OBJ), "no", "the instructor overruled 'in passing', not 'no': the overrule does not cover it");
});

// ---- knowledge concerns: bound to the words they quote, in their sentence --------------------------------------------
const WORDS = "forward and reverse reactions by the same factor";
const knowledge = (concerns) => replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns }));
const CONCERN = { kind: "wrong", text: WORDS, problem: "A catalyst multiplies the forward and reverse RATE CONSTANTS by the same factor.", suggestion: "forward and reverse rate constants by the same factor" };
const concernsOn = (f, id) => f.filter((x) => x.kind === "knowledge-concern" && x.units.includes(id) && x.evidence.quote === WORDS);
const CATALYST = "u-study-guide-le-chatelier-adding-a-catalyst-1";

test("[req.reviews.judged] [req.knowledge.no-autochange] R7-K04: a concern on one sentence stands when ANOTHER sentence of the unit changes and a clean review re-runs", async (t) => {
  const c = course(t);
  await verifyKnowledge(c.root, c.r(), { only: [CATALYST], verifier: knowledge([CONCERN]) });
  assert.equal(concernsOn(c.ms8(), CATALYST).length, 1, "raised");
  c.edit(LCH, "exactly as they were", "just as they were"); // a visible, unrelated word in another sentence
  const u = c.units().find((x) => x.text.includes("just as they were"));
  await verifyKnowledge(c.root, c.r(), { only: [u.id], verifier: knowledge([]) });
  const left = concernsOn(c.ms8(), u.id);
  assert.equal(left.length, 1, "the concern stands: its words and their sentence read as the reviewer judged them");
  // a whole new sentence elsewhere, and another clean re-run: still
  c.edit(LCH, "now seen from the Le Chatelier side.", "now seen from the Le Chatelier side. Remember it for the exam.");
  const v = c.units().find((x) => x.text.includes("Remember it for the exam."));
  await verifyKnowledge(c.root, c.r(), { only: [v.id], verifier: knowledge([]) });
  assert.equal(concernsOn(c.ms8(), v.id).length, 1);
});

test("[req.reviews.judged] [req.knowledge.settled-by-text] variant: a concern whose sentence (or whose words) change is cleared by a fresh clean review of the new text", async (t) => {
  // the sentence that holds the words changes, the words themselves kept (R4-K15's shape)
  const c = course(t);
  await verifyKnowledge(c.root, c.r(), { only: [CATALYST], verifier: knowledge([CONCERN]) });
  c.edit(LCH, "A catalyst speeds up a reaction without being consumed, and it accelerates", "A catalyst, which is not consumed, accelerates");
  const u = c.units().find((x) => x.text.includes("which is not consumed"));
  assert.equal(concernsOn(c.ms8(), u.id).length, 1, "control: with no review of the new sentence, the concern still speaks");
  await verifyKnowledge(c.root, c.r(), { only: [u.id], verifier: knowledge([]) });
  assert.equal(concernsOn(c.ms8(), u.id).length, 0, "the sentence it judged changed: the fresh clean review speaks");
  // the quoted words themselves change
  const d = course(t);
  await verifyKnowledge(d.root, d.r(), { only: [CATALYST], verifier: knowledge([CONCERN]) });
  d.edit(LCH, `**${WORDS}.**`, "**forward and reverse rate constants by the same factor.**");
  const v = d.units().find((x) => x.text.includes("rate constants by the same factor"));
  await verifyKnowledge(d.root, d.r(), { only: [v.id], verifier: knowledge([]) });
  assert.equal(d.ms8().filter((x) => x.kind === "knowledge-concern" && x.units.includes(v.id)).length, 0, "its words changed: settled by the fresh review");
});

test("[req.reviews.judged] the binding itself: the sentence(s) that hold the quoted words, in the reader view", () => {
  const P = "A catalyst speeds up the\n**forward and reverse reactions by the same factor.** It changes no position. The amounts stay exactly as they were.";
  assert.ok(concernStands(WORDS, P, P.replace("exactly", "just")), "another sentence changed: it stands");
  assert.ok(concernStands(WORDS, P, P.replace("speeds up the\n", "speeds up the ")), "a reflow is no change");
  assert.ok(concernStands(WORDS, P, P.replace(/\*\*/g, "*")), "emphasis is no change");
  assert.ok(!concernStands(WORDS, P, P.replace("speeds up", "slows down")), "its own sentence changed");
  assert.ok(!concernStands(WORDS, P, P.replace("same factor", "same amount")), "its words changed");
  assert.equal(quotedSentenceKey("not in the text at all", P), null);
  // a quote across a sentence boundary binds both sentences
  assert.ok(!concernStands("same factor. It changes no", P, P.replace("no position", "no composition")));
  // the item rule in standingOf: an answer that is no longer about what it judged is no answer
  const st = standingOf([{ seq: 1, a: [["x", "no"], ["y", "no"]] }, { seq: 2, a: [["x", "yes"], ["y", "yes"]] }], { current: () => true, itemCurrent: (r, k) => !(r.seq === 1 && k === "y"), items: (r) => r.a, rank: (a) => ({ yes: 0, no: 2 })[a] });
  assert.equal(st.items.get("x").answer, "no");
  assert.equal(st.items.get("y").answer, "yes");
  assert.ok(st.judged.has("y"));
});

// ---- absolute statements: bound to the sentence classified ---------------------------------------------------------
test("[req.reviews.judged] [req.absolute.review] variant: an over-general absolute stands when ANOTHER absolute sentence of the unit is added and the review re-runs clean; rewording it clears it", async (t) => {
  const c = course(t);
  const u = c.units().find((x) => absoluteSentences(x.text).length === 1 && /^study-guide\//.test(x.locator.deliverable) && x.form === "paragraph" && /\.$/.test(x.text.trim()));
  const S = absoluteSentences(u.text)[0];
  const reply = (cls) => replayVerifier((pr) => { const n = (pr.split("\nSENTENCES\n")[1] || "").split("\n\nCONTEXT")[0].split("\n").filter((l) => /^\d+\. /.test(l)).length; return { nonce: nonceOf(pr), sentences: Array.from({ length: n }, (_, i) => ({ n: i + 1, class: cls, why: cls === "over-general" ? "broader than the truth" : "", suggestion: cls === "over-general" ? "usually" : "" })) }; });
  const over = (id) => c.ms8().filter((f) => f.kind === "absolute-overgeneral" && f.units.includes(id));
  await reviewAbsolutes(c.root, c.r(), { verifier: reply("over-general"), only: [u.id] });
  assert.equal(over(u.id).length, 1, "raised");
  const tail = u.text.trim().slice(-30);
  c.edit(u.locator.deliverable, tail, `${tail} A catalyst never changes the value of K.`);
  const v = c.units().find((x) => x.text.includes("never changes the value of K"));
  assert.equal(absoluteSentences(v.text).length, 2, "a second absolute sentence");
  await reviewAbsolutes(c.root, c.r(), { verifier: reply("casual"), only: [v.id] });
  const after = over(v.id);
  assert.equal(after.length, 1, "the over-general sentence stands: it reads as the reviewer judged it");
  assert.equal(after[0].evidence.quote, S);
  // control: rewording the over-general sentence itself, and a fresh clean review, clear it
  const w = (S.match(/\b[a-z]{6,}\b/g) || []).find((x) => c.read(v.locator.deliverable).split(x).length === 2);
  assert.ok(w, "a word of the sentence that is unique in its file");
  c.edit(v.locator.deliverable, w, `${w} (as a rule)`);
  const x = c.units().find((y) => y.text.includes(`${w} (as a rule)`));
  await reviewAbsolutes(c.root, c.r(), { verifier: reply("casual"), only: [x.id] });
  assert.equal(over(x.id).length, 0, "the sentence changed: the fresh review speaks");
});

// ---- spine review (D39): a concern or meaning answer is bound to its line ---------------------------------------------
const FROM = "1. Le Chatelier's principle states that a system at equilibrium disturbed by";
const TO = "1. Le Chatelier's principle states that a system at equilibrium, when disturbed by";
const C6 = "changes no partial pressure and therefore";
const lines = (pr) => (pr.split("\nCHANGED LINES\n")[1] || "").split("\n\n")[0].split("\n").filter((l) => /^\d+\. /.test(l)).map((l) => l.replace(/^\d+\. /, ""));
const spineReviewer = ({ concern = false, meaning = "same" } = {}) => replayVerifier((pr) => {
  const ls = lines(pr);
  return { nonce: nonceOf(pr), meaning: ls.map((_, i) => ({ line: i + 1, meaning })), concerns: concern ? [{ line: ls.findIndex((l) => l.includes("when disturbed")) + 1, kind: "wrong", text: "when", problem: "a test double's concern", suggestion: "" }] : [] };
});
const spineState = (c) => {
  const st = approvalStatus(c.r(), manifestChapters(c.r()), readLogText(c.root)).scopes["le-chatelier"];
  return { glance: glanceProblem(c.root, c.r(), st, SCOPE), questions: spineReviewQuestions(c.root, c.r(), "t").filter((f) => f.evidence.scope === SCOPE) };
};

test("[req.reviews.judged] [req.spine.blind-review] variant: a spine concern on one line stands when ANOTHER line changes and the review re-runs clean; the other line owes its review first", async (t) => {
  const c = course(t);
  c.write(MAP, FROM, TO);
  await reviewSpineChanges(c.root, c.r(), SCOPE, { verifier: spineReviewer({ concern: true }) });
  const a = spineState(c);
  assert.equal(a.questions.length, 1);
  c.write(MAP, C6, "changes none of the partial pressures and therefore"); // another line, rephrased
  assert.equal(spineState(c).questions.length, 1, "the concern is still shown while the other line waits for its review");
  const pre = approvalPrecondition(c.root, c.r(), manifestChapters(c.r()), { chapter: "le-chatelier" });
  assert.match(pre.problem || "", /have not had their blind review/, "the changed line owes its review before a re-approval");
  assert.equal(currentSpineReview(c.root, c.r(), SCOPE).unreviewed.length, 2, "the other line and the approved line it replaced");
  await reviewSpineChanges(c.root, c.r(), SCOPE, { verifier: spineReviewer() }); // clean re-run after the edit elsewhere
  const b = spineState(c);
  assert.equal(b.questions.length, 1, "the concern on the unchanged line stands");
  assert.equal(b.questions[0].id, a.questions[0].id, "the same question (an answer to it stays answered)");
  assert.ok(b.glance, "the glance stays refused");
  assert.equal(currentSpineReview(c.root, c.r(), SCOPE).unreviewed.length, 0);
  // control: the line itself changes, and a fresh review speaks
  c.write(MAP, TO, FROM.replace("disturbed by", "once disturbed by"));
  await reviewSpineChanges(c.root, c.r(), SCOPE, { verifier: spineReviewer() });
  assert.equal(spineState(c).questions.length, 0);
});

test("[req.reviews.judged] [req.spine.blind-review] variant: a meaning answer of 'changed' on one line is not overridden by a 'same' re-run after another line changes", async (t) => {
  const c = course(t);
  c.write(MAP, FROM, TO);
  await reviewSpineChanges(c.root, c.r(), SCOPE, { verifier: spineReviewer({ meaning: "changed" }) });
  c.write(MAP, C6, "changes none of the partial pressures and therefore");
  await reviewSpineChanges(c.root, c.r(), SCOPE, { verifier: spineReviewer({ meaning: "same" }) });
  const r = currentSpineReview(c.root, c.r(), SCOPE);
  assert.equal(r.meaning.same, false);
  // the first change (its new line and the approved line it replaced) keeps "changed"; the second is "same"
  assert.deepEqual([...r.meaning.byLine].sort(), ["changed", "changed", "same", "same"], "each line keeps its own answer");
  assert.ok(r.meaning.byLine.includes("changed"), "the first line's 'changed' stands");
  assert.ok(spineState(c).glance, "still a full approval");
});

// ---- the spine items: C4.10 and C4.11 ------------------------------------------------------------------------------
test("[req.approval.record] C4.10: an approval (and every other instructor act) refuses words with no visible character", (t) => {
  for (const w of ["", " ", "​", "​⁠ ﻿", "ㅤ", "⠀‍"]) assert.equal(hasVisibleWords(w), false, JSON.stringify(w));
  for (const w of ["Approved.", "ok", "好", "​Yes"]) assert.equal(hasVisibleWords(w), true, JSON.stringify(w));
  const c = course(t);
  c.write(MAP, "toward the side with fewer moles of gas", "toward the side with more moles of gas");
  assert.throws(() => c.approve("​"), /quotes the instructor's words/);
  assert.throws(() => c.approve("​⁠ ﻿"), /quotes the instructor's words/);
  assert.throws(() => answerDigest(c.root, emptyDigest(c), { overrules: [{ unit: Q2, links: [OBJ1_ID] }], instructorWords: "​", reader: c.r() }, I), /quotes the instructor's words/);
  c.approve("Yes, approve the change.");
  assert.ok(approvalStatus(c.r(), manifestChapters(c.r()), readLogText(c.root)).scopes["le-chatelier"].valid);
});

test("[req.spine.blind-review] C4.11: a wrapped prose line that begins like a list number is still a changed line; a real list item's renumbering is not", (t) => {
  const c = course(t);
  c.write(MAP, "constant, building directly on Chapter 1.", "constant, building directly on Chapter 1, with a K of about\n1000. Such large values favour products.");
  c.approve("Approved with the example.");
  c.write(MAP, "1000. Such large values favour products.", "10. Such large values favour products.");
  const changed = changedSpineLines(c.root, c.r(), SCOPE).lines.map((l) => l.text);
  assert.ok(changed.some((x) => /^10\. Such/.test(x)), `the changed line is asked: ${JSON.stringify(changed)}`);
  // control: renumbering a real list item is not a change
  const d = course(t);
  d.write(MAP, "2. Increasing the concentration of a species", "7. Increasing the concentration of a species");
  assert.deepEqual(changedSpineLines(d.root, d.r(), SCOPE).lines, [], "a list item's number is folded");
});
