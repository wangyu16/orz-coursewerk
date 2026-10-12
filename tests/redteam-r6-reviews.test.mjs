// Red team, round 6 — one cause (D46): RE-RUNNING A REVIEWER UNTIL IT AGREES ("reviewer shopping"). Wherever a blind
// review of unchanged text decided an outcome, the newest review won, so an agent could re-run a stochastic reviewer
// until it came back favourable. Round 4 closed this for knowledge reviews in MS8, but only on the exact source bytes.
// The round's findings are test cases of the cause:
//   R6-C4-01  a clean re-run of the D39 spine review on unchanged text erased an earlier "wrong" concern: the glance
//             re-opened and the gate's spine-review-concern vanished (currentSpineReview took the newest);
//   R6-C1-01  a "yes" re-run of a link review on unchanged text overrode an honest "no": the objective counted as
//             taught (currentReviews took the newest);
//   R6-K10    a do-nothing TeX regrouping plus one clean re-run cleared a knowledge concern (MS8 compared contentHash,
//             the source bytes, not the reader view).
// The fix is ONE rule in ONE function (scripts/lib/verify/standing.mjs standingOf) that every review consumer reads its
// reviews through — knowledge (MS8, the re-verification count, the unreviewed list), spine (D39 concerns and the D43
// meaning answer), link and framing (alignment and MS9, with assessment fidelity), absolute statements, and the
// semi-mechanical fact check: currency is judged on the reader view, and between reviews of the same reader-view text
// the adverse answer stands. Plus new variants per review kind, and a table of (earlier, later, text change?) cases.
// Offline and deterministic: every blind review is a replayed test double.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader, manifestChapters } from "../scripts/lib/core/package_reader.mjs";
import { coreObligations, indexAndStamp, linkUnits, loadUnits, reverifyUnits, unreviewedKnowledge } from "../scripts/lib/core/obligations.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { reviewSpineChanges, currentSpineReview } from "../scripts/lib/core/spine_review.mjs";
import { approvalStatus, glanceProblem } from "../scripts/lib/core/approvals.mjs";
import { spineReviewQuestions } from "../scripts/lib/core/core_checks.mjs";
import { readLogText } from "../scripts/lib/records/log.mjs";
import { recordDispatch, replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { currentReviewsAt, reviewAlignment } from "../scripts/lib/verify/alignment.mjs";
import { absoluteBundle, absoluteSentences, absolutesHash } from "../scripts/lib/verify/absolutes.mjs";
import { reviewAbsolutes, verifyKnowledge, verifySemi } from "../scripts/lib/verify/verdicts.mjs";
import { sectionContext } from "../scripts/lib/verify/verdicts.mjs";
import { factHash } from "../scripts/lib/core/dependencies.mjs";
import { fsInputReader, pinReference, pinnedTexts, syncReferenceRecord } from "../scripts/lib/verify/references.mjs";
import { createSnapshot } from "../scripts/lib/skeleton/snapshot.mjs";
import { readerKey, standingOf } from "../scripts/lib/verify/standing.mjs";
import ms8 from "../scripts/modules/ms8-verdicts.mjs";
import ms9 from "../scripts/modules/ms9-alignment.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const LCH = "study-guide/le-chatelier.md";
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r6rev-"));
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
    texts: () => pinnedTexts(fsInputReader(inputs)),
  };
  c.edit = (rel, from, to) => c.asAgent(() => c.write(rel, from, to));
  return c;
}
/** A word of a unit's text that occurs once in its file (to emphasise it: an edit a reader cannot see). */
function onceWord(c, u) {
  const file = c.read(u.locator.deliverable);
  for (const w of u.text.match(/\b[a-z]{6,}\b/g) || []) if (file.split(` ${w} `).length === 2 && u.text.includes(` ${w} `)) return w;
  throw new Error(`no unique word in ${u.id}`);
}
const emphasise = (c, u) => { const w = onceWord(c, u); c.edit(u.locator.deliverable, ` ${w} `, ` *${w}* `); return w; };

// ---- the rule itself: a table of (earlier, later, text change?) → what stands ---------------------------------------
const SAME = "The catalyst leaves the equilibrium amounts of $\\ce{N2}$ unchanged.";
const INVISIBLE = "The catalyst leaves the *equilibrium* amounts of ${\\ce{N2}}$  unchanged."; // emphasis, TeX grouping, spacing
const VISIBLE = "The catalyst leaves the equilibrium amounts of $\\ce{N2}$ unchanged at constant volume.";
const RANKS = {
  link: { yes: 0, passing: 1, no: 2 },
  concern: { clean: 0, clarify: 1, wrong: 2 },
  meaning: { same: 0, changed: 1 },
  fidelity: { matches: 0, differs: 1 },
  fact: { supported: 0, hypothetical: 1, disputed: 2, contradicted: 3 },
  offPlan: { false: 0, true: 1 },
};
const standsAfter = (kind, earlier, later, nowText) => {
  const reviews = [{ seq: 1, text: SAME, answer: earlier }, { seq: 2, text: nowText, answer: later }];
  const st = standingOf(reviews, { current: (x) => readerKey(x.text) === readerKey(nowText), items: (x) => (x.answer === "unreadable" ? null : [["item", x.answer]]), rank: (a) => RANKS[kind][a] ?? null });
  return st.items.get("item")?.answer ?? "no result";
};
const TABLE = [
  // kind, earlier, later, text between them, what stands
  ["link", "no", "yes", "none", "no"],
  ["link", "yes", "no", "none", "no"],
  ["link", "passing", "yes", "none", "passing"],
  ["link", "no", "passing", "none", "no"],
  ["link", "no", "yes", "invisible", "no"],
  ["link", "no", "yes", "visible", "yes"],
  ["concern", "wrong", "clean", "none", "wrong"],
  ["concern", "clean", "wrong", "none", "wrong"],
  ["concern", "clarify", "clean", "none", "clarify"],
  ["concern", "wrong", "clarify", "none", "wrong"],
  ["concern", "wrong", "clean", "invisible", "wrong"],
  ["concern", "wrong", "clean", "visible", "clean"],
  ["concern", "wrong", "unreadable", "none", "wrong"],
  ["meaning", "changed", "same", "none", "changed"],
  ["meaning", "same", "changed", "none", "changed"],
  ["meaning", "changed", "same", "invisible", "changed"],
  ["meaning", "changed", "same", "visible", "same"],
  ["fidelity", "differs", "matches", "none", "differs"],
  ["fidelity", "differs", "matches", "visible", "matches"],
  ["fact", "contradicted", "supported", "none", "contradicted"],
  ["fact", "disputed", "supported", "invisible", "disputed"],
  ["fact", "contradicted", "disputed", "none", "contradicted"],
  ["fact", "contradicted", "supported", "visible", "supported"],
  ["offPlan", "true", "false", "none", "true"],
  ["offPlan", "false", "false", "none", "false"],
  ["link", "yes", "yes", "none", "yes"],
];
test("[req.reviews.standing] the table: between reviews of the same reader-view text the adverse answer stands; only a real change lets a fresh review speak", () => {
  assert.equal(readerKey(SAME), readerKey(INVISIBLE), "the invisible edit is invisible in the reader view");
  assert.notEqual(readerKey(SAME), readerKey(VISIBLE));
  const textOf = { none: SAME, invisible: INVISIBLE, visible: VISIBLE };
  for (const [kind, earlier, later, change, expected] of TABLE)
    assert.equal(standsAfter(kind, earlier, later, textOf[change]), expected, `${kind}: ${earlier}, then ${later} (text change: ${change})`);
  // in either order (the order of the reviews never decides between them)
  for (const [kind, earlier, later, change, expected] of TABLE.filter((r) => r[3] !== "visible" && r[2] !== "unreadable"))
    assert.equal(standsAfter(kind, later, earlier, textOf[change]), expected, `${kind}: ${later}, then ${earlier}`);
  // an unreadable review alone is no result
  assert.equal(standsAfter("concern", "unreadable", "unreadable", SAME), "no result");
});

test("[req.reviews.standing] standingOf reports disagreement between current reviews, and an item a review left unanswered is no answer", () => {
  const st = standingOf([{ seq: 1, a: [["x", "no"], ["y", "yes"]] }, { seq: 2, a: [["x", "yes"], ["y", "unanswered"]] }], { current: () => true, items: (r) => r.a, rank: (a) => RANKS.link[a] ?? null });
  assert.equal(st.items.get("x").answer, "no");
  assert.equal(st.items.get("x").review.seq, 1, "the review that raised it is named");
  assert.ok(st.items.get("x").disagreed);
  assert.deepEqual(st.disagreed, ["x"]);
  assert.equal(st.items.get("y").answer, "yes");
  assert.ok(!st.items.get("y").disagreed);
  assert.deepEqual(st.adverse, ["x"]);
});

// ---- spine (D39 concerns, D43 meaning) ------------------------------------------------------------------------------
const MAP = "concepts/le-chatelier.md", FROM = "1. Le Chatelier's principle states that a system at equilibrium disturbed by";
const TO = "1. Le Chatelier's principle states that a system at equilibrium, when disturbed by";
const lines = (pr) => (pr.split("\nCHANGED LINES\n")[1] || "").split("\n\n")[0].split("\n").filter((l) => /^\d+\. /.test(l)).map((l) => l.replace(/^\d+\. /, ""));
const spineReviewer = ({ concern = false, meaning = "same" } = {}) => replayVerifier((pr) => {
  const ls = lines(pr);
  return { nonce: nonceOf(pr), meaning: ls.map((_, i) => ({ line: i + 1, meaning })), concerns: concern ? [{ line: ls.findIndex((l) => l.includes("disturbed")) + 1, kind: "wrong", text: "when", problem: "a test double's concern", suggestion: "" }] : [] };
});
const SCOPE = "chapter:le-chatelier";
const spineState = (c) => {
  const st = approvalStatus(c.r(), manifestChapters(c.r()), readLogText(c.root)).scopes["le-chatelier"];
  return { kind: st.change?.kind, glance: glanceProblem(c.root, c.r(), st, SCOPE), questions: spineReviewQuestions(c.root, c.r(), "t").filter((f) => f.evidence.scope === SCOPE) };
};

test("[req.reviews.standing] [req.spine.blind-review] R6-C4-01: a clean re-run of the spine review on unchanged text keeps the 'wrong' concern — the glance stays refused and the gate keeps its question", async (t) => {
  const c = course(t);
  c.write(MAP, FROM, TO);
  await reviewSpineChanges(c.root, c.r(), SCOPE, { verifier: spineReviewer({ concern: true }) });
  const a = spineState(c);
  assert.ok(a.glance && a.questions.length === 1, "the concern refuses the glance and is a gate question");
  await reviewSpineChanges(c.root, c.r(), SCOPE, { verifier: spineReviewer() }); // the same text, re-run until clean
  const b = spineState(c);
  assert.match(b.glance || "", /"wrong" concern/);
  assert.equal(b.questions.length, 1);
  assert.equal(b.questions[0].id, a.questions[0].id, "the same question, bound to the review that raised it (an answer to it stays answered)");
  // variant: an edit a reader cannot see (emphasis), then another clean re-run — still the earlier concern
  c.write(MAP, TO, TO.replace("when disturbed", "when *disturbed*"));
  await reviewSpineChanges(c.root, c.r(), SCOPE, { verifier: spineReviewer() });
  assert.equal(spineState(c).questions.length, 1, "an invisible edit is no change: the concern stands");
  // a real change, and a fresh review of the new text, speaks
  c.write(MAP, "when *disturbed*", "once it is disturbed");
  await reviewSpineChanges(c.root, c.r(), SCOPE, { verifier: spineReviewer() });
  const d = spineState(c);
  assert.equal(d.questions.length, 0, "a real change: the fresh clean review speaks");
  assert.equal(d.glance, null, `the rephrasing the fresh review found the same may be glanced: ${d.glance}`);
});

test("[req.reviews.standing] [req.spine.blind-review] D43 variant: a meaning answer of 'changed' is not overridden by a re-run that says 'same'", async (t) => {
  const c = course(t);
  c.write(MAP, FROM, TO);
  await reviewSpineChanges(c.root, c.r(), SCOPE, { verifier: spineReviewer({ meaning: "changed" }) });
  assert.match(spineState(c).glance || "", /changed in meaning/);
  await reviewSpineChanges(c.root, c.r(), SCOPE, { verifier: spineReviewer({ meaning: "same" }) });
  const r = currentSpineReview(c.root, c.r(), SCOPE);
  assert.equal(r.meaning.same, false);
  assert.ok(r.meaning.disagreed > 0, "the disagreement is reported");
  assert.match(spineState(c).glance || "", /changed in meaning/, "still a full approval");
});

// ---- link and framing reviews (alignment, MS9, coverage) -------------------------------------------------------------
const declaredOf = (pr) => (pr.split("\nDECLARED ITEMS\n")[1] || "").split("\n\n")[0].split("\n").map((l) => l.replace(/^- /, "").split(":")[0].trim()).filter((l) => /\./.test(l));
const gidsOf = (pr) => [...pr.matchAll(/^- (guide\.\S+): /gm)].map((m) => m[1]);
const linkReviewer = (verdict, { offPlan = false, fidelity = "matches" } = {}) => replayVerifier((pr) => ({ nonce: nonceOf(pr), links: declaredOf(pr).map((id) => ({ id, verdict, why: "test double" })), also: [], offPlan,
  ...(/its assessment guide entry asks for/.test(pr) ? { fidelity: { type: fidelity, level: "matches", why: "t" } } : gidsOf(pr).length ? { fidelity: gidsOf(pr).map((id) => ({ id, type: fidelity, level: "matches", why: "t" })) } : {}) }));

test("[req.reviews.standing] [req.control.link-review] R6-C1-01: a 'yes' re-run of a link review on unchanged text never overrides an honest 'no' — the objective is not counted as taught", async (t) => {
  const c = course(t);
  const u = c.units().find((x) => x.role === "teaching" && /^study-guide\//.test(x.locator.deliverable) && (x.spineNodes || []).some((n) => n.startsWith("objective.")));
  const obj = u.spineNodes.find((n) => n.startsWith("objective."));
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer("no"), only: [u.id] });
  const noDispatch = c.ms9().find((f) => f.kind === "link-doubtful" && f.units.includes(u.id) && f.evidence.link === obj).evidence.dispatch;
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer("yes"), only: [u.id] }); // unchanged text, re-run until it agrees
  assert.equal(c.r() && currentReviewsAt(c.root, c.r(), c.units()).get(u.id).verdicts.get(obj), "no");
  const doubt = c.ms9().find((f) => f.kind === "link-doubtful" && f.units.includes(u.id) && f.evidence.link === obj);
  assert.ok(doubt, "MS9 still raises the doubtful link");
  assert.equal(doubt.evidence.dispatch, noDispatch, "named by the review that said no");
  assert.match(doubt.evidence.note, /disagree/);
  // variant: an edit a reader cannot see, then another "yes" — the "no" stands
  emphasise(c, c.unit(u.id));
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer("yes"), only: [u.id] });
  assert.equal(currentReviewsAt(c.root, c.r(), c.units()).get(u.id).verdicts.get(obj), "no", "an invisible edit is no change");
  // a real change to the passage: the fresh review speaks
  const tail = c.unit(u.id).text.trim().slice(-30);
  c.edit(u.locator.deliverable, tail, `${tail} This is the point to remember.`);
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer("yes"), only: [u.id] });
  assert.equal(currentReviewsAt(c.root, c.r(), c.units()).get(u.id).verdicts.get(obj), "yes", "after a real change a fresh review speaks");
});

test("[req.reviews.standing] [req.control.link-review] variants: 'passing' stands over a later 'yes'; off the plan over a later on-plan; a type that differs over a later match", async (t) => {
  const c = course(t);
  const all = c.units();
  const u = all.find((x) => x.role === "teaching" && /^study-guide\//.test(x.locator.deliverable) && (x.spineNodes || []).some((n) => n.startsWith("objective.")));
  const obj = u.spineNodes.find((n) => n.startsWith("objective."));
  const framing = all.find((x) => x.role === "framing" && x.form === "paragraph");
  const q = all.find((x) => x.role === "teaching" && x.form === "question" && (x.spineNodes || []).some((n) => n.startsWith("guide.")));
  assert.ok(framing && q, "the fixture has a framing unit and a linked practice question");
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer("passing"), only: [u.id] });
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer("yes"), only: [u.id] });
  assert.equal(currentReviewsAt(c.root, c.r(), c.units()).get(u.id).verdicts.get(obj), "passing");
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer("yes", { offPlan: true }), only: [framing.id] });
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer("yes", { offPlan: false }), only: [framing.id] });
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer("yes", { fidelity: "differs" }), only: [q.id] });
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer("yes", { fidelity: "matches" }), only: [q.id] });
  const f = c.ms9();
  assert.ok(f.some((x) => x.kind === "off-spine" && x.units.includes(framing.id)), "off the plan stands");
  assert.ok(f.some((x) => /^assessment-fidelity/.test(x.kind) && x.units.includes(q.id)), "a type that differs stands");
  const rev = currentReviewsAt(c.root, c.r(), c.units());
  assert.equal(rev.get(framing.id).offPlan, true);
  assert.ok(rev.get(q.id).fidelity.some((x) => x.type === "differs"));
});

// ---- knowledge reviews (MS8, re-verification, the unreviewed list) ---------------------------------------------------
const WORDS = "forward and reverse reactions by the same factor";
const knowledge = (concerns) => replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns }));
const CONCERN = { kind: "wrong", text: WORDS, problem: "A catalyst multiplies the forward and reverse RATE CONSTANTS by the same factor.", suggestion: "forward and reverse rate constants by the same factor" };
const concernsOn = (f, id) => f.filter((x) => x.kind === "knowledge-concern" && x.units.includes(id) && x.evidence.quote === WORDS);

test("[req.reviews.standing] [req.knowledge.no-autochange] R6-K10: a TeX regrouping that typesets the same, plus one clean re-run, does not clear a knowledge concern", async (t) => {
  const c = course(t);
  const u0 = c.units().find((x) => x.text.includes(WORDS) && x.text.includes("$\\ce{N2}$"));
  await verifyKnowledge(c.root, c.r(), { only: [u0.id], verifier: knowledge([CONCERN]) });
  await verifyKnowledge(c.root, c.r(), { only: [u0.id], verifier: knowledge([]) });
  assert.equal(concernsOn(c.ms8(), u0.id).length, 1, "control: a clean re-run of the unchanged text clears nothing");
  c.edit(LCH, "equilibrium amounts of $\\ce{N2}$", "equilibrium amounts of ${\\ce{N2}}$");
  const u = c.units().find((x) => x.text.includes("${\\ce{N2}}$"));
  assert.equal(readerKey(u.text), readerKey(u0.text), "the reader sees the same text");
  await verifyKnowledge(c.root, c.r(), { only: [u.id], verifier: knowledge([]) });
  assert.equal(concernsOn(c.ms8(), u.id).length, 1, "the concern stands after the regrouping and a clean re-run");
  assert.ok(!unreviewedKnowledge(c.root, c.r()).includes(u.id), "an edit nobody can see leaves the unit reviewed");
  // a real change (the error fixed at its words) and a fresh review of the new text: settled
  c.edit(LCH, `**${WORDS}.**`, "**forward and reverse rate constants by the same factor.**");
  const v = c.units().find((x) => x.text.includes("rate constants by the same factor"));
  await verifyKnowledge(c.root, c.r(), { only: [v.id], verifier: knowledge([]) });
  assert.equal(c.ms8().filter((x) => x.kind === "knowledge-concern" && x.units.includes(v.id)).length, 0, "a real change, and the fresh review speaks");
});

test("[req.reviews.standing] [req.knowledge.no-autochange] variant: a re-verification cannot be bought by re-running the knowledge review until it is clean", async (t) => {
  const c = course(t);
  const PR = "practice/le-chatelier.md", Q6_RAISED = "is exothermic. The temperature is raised. Which way";
  c.edit(PR, Q6_RAISED, Q6_RAISED.replace("raised", "increased"));
  const quoteOf = (id) => c.unit(id).text.match(/[A-Za-z]+(?: [A-Za-z]+){2,5}/)?.[0];
  const owed = [...new Set(coreObligations(c.root, c.r(), "t").filter((f) => f.kind === "reverify").flatMap((f) => f.units))].filter((id) => c.unit(id).form === "answer" && quoteOf(id));
  assert.ok(owed.length, "an answer owes a re-check");
  const wrong = replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: owed.map((id) => ({ kind: "wrong", text: quoteOf(id), problem: "a test double finds it wrong", suggestion: "" })).filter((x) => pr.includes(x.text)) }));
  await verifyKnowledge(c.root, c.r(), { verifier: wrong, only: owed });
  assert.throws(() => reverifyUnits(c.root, c.r(), owed, AGENT), /found it wrong/);
  await verifyKnowledge(c.root, c.r(), { verifier: knowledge([]), only: owed });
  assert.throws(() => reverifyUnits(c.root, c.r(), owed, AGENT), /found it wrong.*a later review of the same text does not clear it/);
});

// ---- absolute statements ---------------------------------------------------------------------------------------------
test("[req.reviews.standing] [req.absolute.review] variant: an over-general absolute stands over a later clean review of the same sentences, an invisible edit between them", async (t) => {
  const c = course(t);
  const u = c.units().find((x) => absoluteSentences(x.text).length && /^study-guide\//.test(x.locator.deliverable) && (x.text.match(/\b[a-z]{6,}\b/g) || []).length > 3);
  const reply = (cls) => replayVerifier((pr) => { const n = (pr.split("\nSENTENCES\n")[1] || "").split("\n\nCONTEXT")[0].split("\n").filter((l) => /^\d+\. /.test(l)).length; return { nonce: nonceOf(pr), sentences: Array.from({ length: n }, (_, i) => ({ n: i + 1, class: cls, why: cls === "over-general" ? "broader than the truth" : "", suggestion: cls === "over-general" ? "usually" : "" })) }; });
  await reviewAbsolutes(c.root, c.r(), { verifier: reply("over-general"), only: [u.id] });
  const before = c.ms8().filter((f) => f.kind === "absolute-overgeneral" && f.units.includes(u.id));
  assert.ok(before.length, "over-general is raised");
  emphasise(c, c.unit(u.id));
  const v = c.unit(u.id);
  assert.equal(absolutesHash(v.text), absolutesHash(u.text));
  // the agent re-runs the review by hand (reviewAbsolutes would not: the sentences are reviewed)
  const all = c.units(), sentences = absoluteSentences(v.text), context = sectionContext(all, v);
  const bundle = absoluteBundle(sentences, context, "0123456789abcdef");
  const answer = await reply("casual")(bundle.prompt);
  recordDispatch(c.root, { kind: "absolute", unit: v.id, factHash: factHash(v.text), contentHash: v.locator.contentHash, bundle, answer, admission: { status: "reviewed" }, extra: { sentences, context, absolutesHash: absolutesHash(v.text) } });
  const after = c.ms8().filter((f) => f.kind === "absolute-overgeneral" && f.units.includes(v.id));
  assert.equal(after.length, before.length, "the over-general answer stands");
  assert.match(after[0].evidence.note, /disagree/);
});

// ---- the semi-mechanical fact check ----------------------------------------------------------------------------------
const OPENSTAX_13_3 = "Most industrial production of ammonia uses the Haber-Bosch process based on the following equilibrium reaction:\n N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ \n The traits of this reaction present challenges to its use in an efficient industrial process.";
const PIN = { url: "https://openstax.org/books/chemistry-2e/pages/13-3-shifting-equilibria-le-chateliers-principle", title: "13.3 Shifting Equilibria", destination: "openstax.org/books/chemistry-2e", text: OPENSTAX_13_3 };
const HABER_INTRO = "Most industrial production of ammonia uses the Haber-Bosch process based on the following equilibrium reaction:";
const AMMONIA_EQ_QUOTE = "N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ";
const passagesOf = (pr) => pr.split("\nPASSAGES\n")[1].split("\n").map((l) => l.match(/^\[(\d+)\] (.*)$/)).filter(Boolean).map((m) => ({ n: Number(m[1]), text: m[2] }));
const claimCount = (pr) => pr.split("\nCLAIMS\n")[1].split("\n\nPASSAGES")[0].split("\n").filter((l) => /^\d+\. /.test(l)).length;
const semiReplay = (verdict, quotes) => replayVerifier((pr) => {
  const ps = passagesOf(pr);
  const qs = quotes.map((q) => { const p = ps.find((x) => x.text.includes(q)); return p ? { passage: p.n, text: q } : null; }).filter(Boolean);
  return { nonce: nonceOf(pr), claims: Array.from({ length: claimCount(pr) }, (_, i) => ({ claim: i + 1, verdict, quotes: qs, note: "replayed" })) };
});

test("[req.reviews.standing] [req.verdict.semi-mechanical] variant: a contradiction stands after a TeX regrouping inside the claim and a re-run that cites nothing against it", async (t) => {
  const c = course(t);
  pinReference(c.root, c.inputs, PIN);
  const ANCHOR = "but it also slows the rate.";
  const S = "For the Haber-Bosch reaction $\\ce{N2 + 3 H2 <=> 2 NH3}$, 63.7 kJ of heat is released, so heat is a product.";
  const neighbour = c.units().find((u) => u.text.includes(ANCHOR));
  c.edit(LCH, ANCHOR, `${ANCHOR}\n\n${S}`);
  const id = c.units().find((x) => x.text === S).id;
  linkUnits(c.root, c.r(), { [id]: neighbour.spineNodes }, AGENT);
  await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay("contradicted", [HABER_INTRO, AMMONIA_EQ_QUOTE]), only: [id] });
  syncReferenceRecord(c.root, c.inputs);
  assert.ok(c.ms8().some((f) => f.kind === "fact-contradicted" && f.units.includes(id)), "the wrong value is a defect");
  c.edit(LCH, "$\\ce{N2 + 3 H2 <=> 2 NH3}$, 63.7", "${\\ce{N2 + 3 H2 <=> 2 NH3}}$, 63.7");
  const u = c.units().find((x) => x.text.includes("${\\ce{N2 + 3 H2 <=> 2 NH3}}$, 63.7"));
  await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay("supported", [HABER_INTRO]), only: [u.id] });
  assert.ok(c.ms8().some((f) => f.kind === "fact-contradicted" && f.units.includes(u.id)), "the contradiction stands: the reader sees the same claim");
  // a real change (the value corrected) leaves it history
  c.edit(LCH, "}}$, 63.7 kJ", "}}$, 92.2 kJ");
  const v = c.units().find((x) => x.text.includes("}}$, 92.2 kJ"));
  assert.ok(!c.ms8().some((f) => f.kind === "fact-contradicted" && f.units.includes(v.id)), "a changed value is a new claim");
});
