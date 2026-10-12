// Red team, round 3 — COHERENCE (H1–H5), and the two CONTROL findings with the same root cause (C4-01, C4-02): every
// finding of the round-3 report (var/projects/coursewerk-caeai/workspace/studies/p11/redteam-r3/coherence/REPORT.md,
// scripts f1…f8; …/redteam-r3/control c4-01, c4-02) reproduced on the real course fixture and asserted CAUGHT. Each
// test fixes the class:
//   F1 C4-01  a removed approved line is a changed line for the meaning question (D43): the blind review is asked
//             whether the plan still says it; a change with nothing to ask about is never "the same" by default;
//   F2        the meaning answer is bound to its baseline (the full approval it diffed against, and every line asked);
//   F6 C4-02  "light" is not lossy: struck-through, commented-out and hidden words are dropped before comparing, every
//             sign is a word (and a fact); a light change whose current review says "changed" or raises a "wrong"
//             concern is not glanced; the review's "wrong" concerns reach the gate as instructor questions;
//   F4        the retired register matches a near return and a piece in ANY deliverable;
//   F3 F5 F8  edges: every reference spelling is read; a `ref:` edge re-targeted by a renumbering is owed a re-check;
//             a binding's symbol is its family (K, K_{eq}, K_c, Keq);
//   F7        the history check reads git with object replacement off and no grafts, and a package whose git has
//             refs/replace/* or info/grafts is log-broken.
// Offline and deterministic: every blind review is a replayed test double.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader, manifestChapters } from "../scripts/lib/core/package_reader.mjs";
import { coreObligations, indexAndStamp, linkUnits, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { approvalStatus, recordApproval } from "../scripts/lib/core/approvals.mjs";
import { bindings, referencedNumbers } from "../scripts/lib/core/dependencies.mjs";
import { classifyChapterChange, spineWording, visibleText } from "../scripts/lib/core/change.mjs";
import { changedSpineLines, currentSpineReview, readSpineMeaning, reviewSpineChanges } from "../scripts/lib/core/spine_review.mjs";
import { spineReviewQuestions } from "../scripts/lib/core/core_checks.mjs";
import { logFindings } from "../scripts/lib/skeleton/gate.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { readLogText, recordHash, verifyLog } from "../scripts/lib/records/log.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const MAP = "concepts/le-chatelier.md", GUIDE = "assessment-support/le-chatelier.md", SCOPE = "chapter:le-chatelier";
const PR = "practice/le-chatelier.md", CE = "practice/chemical-equilibrium.md";
const A6 = "u-practice-le-chatelier-questions-12";
const Q6_RAISED = "is exothermic. The temperature is raised. Which way";
const gitIn = (root, ...a) => spawnSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { encoding: "utf8" });

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r3coh-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  gitIn(root, "init", "-q", "-b", "main"); gitIn(root, "add", "-A"); gitIn(root, "commit", "-qm", "baseline");
  const c = {
    root, r: () => liveReader(root),
    units: () => loadUnits(root, liveReader(root)),
    read: (rel) => fs.readFileSync(path.join(root, rel), "utf8"),
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 50)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent: (fn) => { beginSession(root, liveReader(root), AGENT); fn(); return indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    owed: () => coreObligations(root, liveReader(root), "t"),
    kind: (ch = "le-chatelier") => approvalStatus(liveReader(root), manifestChapters(liveReader(root)), readLogText(root)).scopes[ch].change?.kind,
    glance: (ch = "le-chatelier") => recordApproval(root, liveReader(root), manifestChapters(liveReader(root)), { chapter: ch, glance: true, instructorWords: "Fine, a wording fix." }, I),
    approve: (ch = "le-chatelier", words = "Approved.") => recordApproval(root, liveReader(root), manifestChapters(liveReader(root)), { chapter: ch, instructorWords: words }, I),
    review: (judge, scope = SCOPE) => reviewSpineChanges(root, liveReader(root), scope, { verifier: spineReviewer(judge).verifier }),
  };
  c.reverifyOwed = () => new Set(c.owed().filter((f) => f.kind === "reverify").flatMap((f) => f.units));
  return c;
}
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];
const numbered = (pr) => (pr.split("\nCHANGED LINES\n")[1] || "").split("\n\n")[0].split("\n").filter((l) => /^\d+\. /.test(l)).map((l) => l.replace(/^\d+\. /, ""));
/** Test double: a replayed blind spine reviewer. `judge(line, prompt)` → { meaning, concern? } for every numbered line. */
function spineReviewer(judge) {
  const seen = [];
  return { seen, verifier: replayVerifier((pr) => {
    seen.push(pr);
    const concerns = [], meaning = [];
    numbered(pr).forEach((l, i) => { const j = judge(l, pr) || {}; if (j.concern) concerns.push({ line: i + 1, ...j.concern }); meaning.push({ line: i + 1, meaning: j.meaning || "changed" }); });
    return { nonce: nonceOf(pr), concerns, meaning };
  }) };
}

// ============================================ D43: removed lines are asked about ====================================
test("[req.coherence.light-spine] [req.spine.meaning-covers-removed] F1 + C4-01: a removed approved line is a changed line for the meaning question; a deletion is never glanced without the review saying the plan still says it", async (t) => {
  // F1: the whole key-term entry "partial pressure" deleted (no fact token in it: a "rephrasing" by its words)
  const c = course(t);
  const term = c.read(MAP).split("\n").find((l) => l.startsWith("- **partial pressure**"));
  const users = c.units().filter((u) => Object.keys(u.stamp || {}).includes("term:le-chatelier:partial pressure")).map((u) => u.id);
  assert.ok(users.length > 0);
  c.edit(MAP, term + "\n", "");
  assert.equal(c.kind(), "rephrasing");
  const ch = changedSpineLines(c.root, c.r(), SCOPE);
  assert.equal(ch.lines.length, 0, "nothing was added");
  assert.deepEqual(ch.asked.map((l) => [l.removed, l.text]), [[true, term]], "the removed line is asked about");
  assert.throws(() => c.glance(), /no current review/, "no review: no glance (it was 'the same' by default before)");
  // the honest review: the definition is dropped, the plan no longer says it
  const honest = spineReviewer((l) => ({ meaning: l.startsWith("(removed) ") ? "changed" : "same" }));
  await reviewSpineChanges(c.root, c.r(), SCOPE, { verifier: honest.verifier });
  assert.ok(numbered(honest.seen[0]).includes(`(removed) ${term}`), "the prompt numbers the removed line");
  assert.match(honest.seen[0], /for a line marked "\(removed\)".*"same" only when the plan still says it elsewhere/);
  assert.throws(() => c.glance(), /changed in meaning or did not say/);
  // an answer that covers only the added lines (none here) leaves the removed one unanswered: no glance either
  await reviewSpineChanges(c.root, c.r(), SCOPE, { verifier: replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [], meaning: [] })) });
  assert.throws(() => c.glance(), /changed in meaning or did not say/);
  // the full approval stays possible, and leaves the users owing their re-check
  c.approve("le-chatelier", "Approved: drop the partial-pressure entry.");
  const owed = c.reverifyOwed();
  assert.deepEqual(users.filter((u) => !owed.has(u)), [], "every user of the dropped term owes a re-check");

  // C4-01 (B): the guide's "distinguish rate from position" requirement dropped, beside a harmless rewording elsewhere
  const d = course(t);
  d.edit(GUIDE, "present at equilibrium. Require the student to distinguish the **rate** of reaching equilibrium from\nthe **position** of it.\n", "present at equilibrium.\n");
  d.edit(GUIDE, "Give a balanced equilibrium and ask the direction of shift\n", "Give a balanced equilibrium and ask which direction it will shift\n");
  assert.equal(d.kind(), "rephrasing");
  const rv = spineReviewer((l) => ({ meaning: l.startsWith("(removed) ") && /distinguish the \*\*rate\*\*|\*\*position\*\* of it/.test(l) ? "changed" : "same" }));
  await reviewSpineChanges(d.root, d.r(), SCOPE, { verifier: rv.verifier });
  assert.ok(numbered(rv.seen[0]).some((l) => /^\(removed\) .*distinguish the \*\*rate\*\*/.test(l)), "the dropped requirement is asked about");
  assert.throws(() => d.glance(), /changed in meaning or did not say/);
  // a re-run of the unchanged plan cannot overturn that "changed" (red team R6): the agent restores the requirement in
  // its own words, and a review that says "same" to the reworded lines and to every removed line (the plan still says
  // them) is a glance
  d.edit(GUIDE, "present at equilibrium.\n", "present at equilibrium. The student must tell the **rate** of reaching equilibrium from\nthe **position** of it.\n");
  await reviewSpineChanges(d.root, d.r(), SCOPE, { verifier: spineReviewer(() => ({ meaning: "same" })).verifier });
  assert.equal(d.glance().type, "glance-confirmation");
  // nothing asked is never "same"
  assert.deepEqual(readSpineMeaning(JSON.stringify({ nonce: "n", concerns: [], meaning: [] }), "n", []), { same: false, byLine: [] });
});

// ============================================ D43: the answer is bound to its baseline ==============================
test("[req.spine.blind-review-bound] [req.spine.meaning-covers-removed] F2: a meaning review answered against one approved text is never current against another", async (t) => {
  const c = course(t);
  const X0 = "a gas that does not react and, added at constant volume, does not shift a gas-phase equilibrium";
  const XP = X0.replace("constant volume", "constant pressure"), X1 = XP.replace("and, added", "and, when added");
  const set = (a, b) => c.edit(MAP, a, b);
  // S1: "constant pressure" approved in full; S2: reworded, reviewed "same" against it
  set(X0, XP); await c.review(() => ({ meaning: "changed" })); c.approve("le-chatelier", "Approved.");
  set(XP, X1); const s2 = await c.review(() => ({ meaning: "same" }));
  assert.equal(s2.meaning.same, true);
  const rec = JSON.parse(fs.readFileSync(path.join(c.root, "metadata/verification", `${s2.dispatch}.json`), "utf8"));
  assert.ok(Number.isInteger(rec.baseSeq) && rec.askedHash, "the record names the approval it diffed against and what it asked");
  // S3: corrected back to "constant volume" and approved in full; S4: the stale rewording returns
  set(X1, X0); c.approve("le-chatelier", "No: constant volume, as it was.");
  set(X0, X1);
  assert.equal(c.kind(), "rephrasing");
  assert.equal(currentSpineReview(c.root, c.r(), SCOPE), null, "the S2 review was against another approved text");
  assert.throws(() => c.glance(), /no current review/);
  const users = c.units().filter((u) => Object.keys(u.stamp || {}).includes("term:le-chatelier:inert gas")).map((u) => u.id);
  const owed = c.reverifyOwed();
  assert.deepEqual(users.filter((u) => !owed.has(u)), [], "its users still owe a re-check");
});

// ============================================ "light" is not lossy ===================================================
test("[req.coherence.light-spine] [req.spine.concerns-at-gate] F6 + C4-02: struck-through or hidden words and dropped signs are never light; a light change the review calls changed or wrong is not glanced; its 'wrong' concerns reach the gate as questions", async (t) => {
  const node = (text) => ({ nodes: [{ id: "n", kind: "concept", text, prereqs: [] }], entries: [] });
  const kind = (a, b) => classifyChapterChange(node(a), node(b), { beforeText: a, afterText: b }).kind;
  for (const after of ["does ~~not~~ shift", "does <del>not</del> shift", "does <s>not</s> shift", "does <!-- not --> shift", 'does <span style="display:none">not</span> shift'])
    assert.equal(kind("does not shift", after), "substantive", after);
  assert.equal(visibleText("does ~~not~~ shift").replace(/\s+/g, " "), "does shift");
  assert.notEqual(kind("by ΔG° = −RT ln K. x", "by ΔG° = RT ln K. x"), "light", "a dropped minus before a letter");
  assert.equal(kind("by ΔG° = −RT ln K. x", "by ΔG° = RT ln K. x"), "substantive", "a sign is a fact");
  assert.equal(kind("a value of ±2", "a value of 2"), "substantive");
  assert.equal(kind("x - y", "x + y"), "substantive");
  assert.notEqual(spineWording("− RT"), spineWording("RT"));
  // what stays light: markup, a comma, a hyphen inside a word, a list bullet
  assert.equal(kind("a system at equilibrium disturbed by a change", "a *system at equilibrium*, disturbed by a change"), "light");
  assert.equal(kind("a gas-phase equilibrium", "a gas phase equilibrium"), "light");
  assert.equal(kind("- item one", "* item one"), "light");

  // on the plan: a light change (a comma) whose current review says a line changed, or raises a "wrong" concern
  const c = course(t);
  c.edit(MAP, "a gas that does not react and, added at constant volume", "a gas that does not react, and added at constant volume");
  assert.equal(c.kind(), "light");
  await c.review(() => ({ meaning: "changed" }));
  assert.throws(() => c.glance(), /found 2 line\(s\) changed in meaning/);
  const wrong = { kind: "wrong", text: "added at constant volume", problem: "test double: a planted 'wrong' concern", suggestion: "added at constant volume" };
  await c.review(() => ({ meaning: "same", concern: wrong }));
  assert.throws(() => c.glance(), /"wrong" concern/);
  // the concern is the instructor's question at the gate — in the digest, never blocking
  const g = runGate(c.root, { inputsDir: INPUTS });
  const q = g.findings.filter((f) => f.kind === "spine-review-concern");
  assert.equal(q.length, 1);
  assert.equal(q[0].statusClass, "question"); assert.equal(q[0].route, "digest");
  assert.ok(!g.gate.blocking.includes(q[0]) && g.gate.questions.includes(q[0]));
  assert.match(q[0].evidence.note, /Possibly wrong .*added at constant volume/);
  // read and approved in full: the review is no longer current, the question goes
  c.approve();
  assert.deepEqual(spineReviewQuestions(c.root, c.r(), "t"), []);
  // a light change with no review (or a clean one) is still a glance
  const d = course(t);
  d.edit(MAP, "a gas that does not react and, added at constant volume", "a gas that does not react, and added at constant volume");
  assert.equal(d.glance().payload.change, "light");

  // C4-02 on the plan: ΔG° = −RT ln K → RT ln K, in the concept and the key term
  const e = course(t);
  e.edit("concepts/chemical-equilibrium.md", "of the reaction by ΔG° = −RT ln K. [prereq", "of the reaction by ΔG° = RT ln K. [prereq");
  assert.equal(e.kind("chemical-equilibrium"), "substantive");
  assert.throws(() => e.glance("chemical-equilibrium"), /substantive/);
});

// ============================================ the retired register spans the package ================================
test("[req.coherence.retired-register] F4: a stale answer moved to another deliverable nearly verbatim takes back its id and its obligation; a piece of it in another deliverable inherits the obligation", (t) => {
  const c = course(t);
  c.asAgent(() => c.edit(PR, Q6_RAISED, Q6_RAISED.replace("raised", "lowered")));
  assert.ok(c.reverifyOwed().has(A6));
  const s = c.read(PR), block = s.slice(s.indexOf(":::: tabs\n::: tab Q 6"), s.indexOf(":::: tabs\n::: tab Q 7"));
  c.asAgent(() => {
    fs.writeFileSync(path.join(c.root, PR), s.replace(block, ""));
    const moved = block.replace("::: tab Q 6", "::: tab Q 17").replace("::: tab Answer 6", "::: tab Answer 17").replace("Toward the reactants, to the left.", "Toward the reactants (to the left).");
    c.edit(CE, "::::\n\n---\n\n*Adapted", "::::\n\n" + moved.trimEnd() + "\n\n---\n\n*Adapted");
  });
  const a = c.units().find((u) => u.text.startsWith("Toward the reactants (to the left)."));
  assert.equal(a.locator.deliverable, CE);
  assert.equal(a.id, A6, "the near return takes back its id across deliverables");
  assert.ok(a.owes || c.reverifyOwed().has(A6), "and its obligation");
  assert.ok(c.reverifyOwed().has(A6));

  // a piece: only the answer's last sentence lands in the other chapter's study guide, under a new question
  const d = course(t);
  d.asAgent(() => d.edit(PR, Q6_RAISED, Q6_RAISED.replace("raised", "lowered")));
  const sd = d.read(PR), blk = sd.slice(sd.indexOf(":::: tabs\n::: tab Q 6"), sd.indexOf(":::: tabs\n::: tab Q 7"));
  d.asAgent(() => {
    fs.writeFileSync(path.join(d.root, PR), sd.replace(blk, ""));
    const piece = blk.replace("::: tab Q 6", "::: tab Q 17").replace("::: tab Answer 6", "::: tab Answer 17")
      .replace(/Toward the reactants, to the left\. For an exothermic reaction heat behaves as a \*\*product\*\*, so\n/, "Heat behaves as a **product** here, so\n");
    d.edit(CE, "::::\n\n---\n\n*Adapted", "::::\n\n" + piece.trimEnd() + "\n\n---\n\n*Adapted");
  });
  const p = d.units().find((u) => u.locator.deliverable === CE && u.text.startsWith("Heat behaves as a **product** here"));
  assert.ok(p, "the piece is indexed in the other deliverable");
  assert.ok(p.id === A6 || (p.inheritedFrom || []).includes(A6), `the piece is Answer 6's (${p.id}, ${JSON.stringify(p.inheritedFrom)})`);
  assert.ok(d.reverifyOwed().has(p.id), "and owes its re-check");
});

// ============================================ edges ==================================================================
test("[req.coherence.edges-complete] F3: a reference by number is read in every spelling; Q5 reworded to 'item 3' still depends on Q3", (t) => {
  const cases = { "Q3": ["3"], "Q 3": ["3"], "Q.3": ["3"], "Question 3": ["3"], "Question #3": ["3"], "Problem #3": ["3"], "Prob. 3": ["3"], "item 3": ["3"],
    "Ex. 3": ["3"], "Exercise 3": ["3"], "see Q3(b)": ["3"], "question three": ["3"], "Question Twelve": ["12"], "Questions 3 and 4": ["3", "4"],
    "questions 3–5": ["3", "4", "5"], "Q3–Q5": ["3", "4", "5"], "Problems 2, 3 and 5": ["2", "3", "5"], "Questions 3 to 5": ["3", "4", "5"] };
  for (const [s, want] of Object.entries(cases)) assert.deepEqual(referencedNumbers(s).sort(), want.sort(), s);
  for (const s of ["Section 3", "equation 3", "2.5 mol of item", "the first item 2.5 mol"]) assert.deepEqual(referencedNumbers(s), [], s);
  const c = course(t);
  const id = (start) => c.units().find((u) => u.locator.deliverable === PR && u.text.startsWith(start)).id;
  const Q5 = id("Justify the answer to Q3"), A5 = id("Adding $\\ce{H2}$ increases the denominator");
  c.asAgent(() => c.edit(PR, "Justify the answer to Q3 using", "Justify the answer to item 3 using"));
  c.asAgent(() => c.edit(PR, "at equilibrium, extra $\\ce{H2}$ is injected. Which way", "at equilibrium, extra $\\ce{NH3}$ is injected. Which way"));
  const owed = c.reverifyOwed();
  assert.ok(owed.has(Q5) && owed.has(A5), "Q 5 and Answer 5 are found");
});

test("[req.coherence.edges-complete] F5: a binding's symbol is its family: K, K_{eq}, K_c, K_\\mathrm{eq} and Keq share a value; Q7 rephrased to K_eq is found when Q6's K changes", (t) => {
  for (const s of ["$K = 50$", "$K_{eq} = 50$", "$K_c = 50$", "$K_\\mathrm{eq} = 50$", "Keq = 50", "K_p = 50", "whose $K$ is 50"]) assert.ok(bindings(s).includes("K=50"), `${s}: ${bindings(s)}`);
  assert.ok(bindings("pH = 7").includes("pH=7"), "a symbol that does not start with a capital is kept whole");
  const c = course(t);
  const Q7 = c.units().find((u) => u.locator.deliverable === CE && u.text.startsWith("For the same reaction ($K = 50$)")).id;
  c.asAgent(() => c.edit(CE, "For the same reaction ($K = 50$), a second mixture", "For the same reaction ($K_{eq} = 50$), a second mixture"));
  assert.ok(!c.reverifyOwed().has(Q7), "its own rewording is the agent's stamped text: nothing owed yet");
  c.asAgent(() => c.edit(CE, "For a reaction with $K = 50$, a mixture is found to have $Q_r = 12$.", "For a reaction with $K = 500$, a mixture is found to have $Q_r = 12$."));
  assert.ok(c.reverifyOwed().has(Q7), "Q 7 (the same reaction) is found");
});

test("[req.coherence.reference-binding] F8: a renumbering that re-targets \"the answer to Q3\" makes the unit naming it, and its answer, owe a re-check", (t) => {
  const c = course(t);
  const before = c.units();
  const Q5 = before.find((u) => u.text.startsWith("Justify the answer to Q3")).id, A5 = before.find((u) => u.text.startsWith("Adding $\\ce{H2}$ increases the denominator")).id;
  const Q1 = before.find((u) => u.locator.deliverable === PR && u.label === "Q 1"), A1 = before.find((u) => u.locator.deliverable === PR && u.label === "Answer 1");
  assert.deepEqual([...c.reverifyOwed()].filter((u) => u === Q5 || u === A5), []);
  c.asAgent(() => {
    let s = c.read(PR);
    s = s.replace(/::: tab (Q|Answer) (\d+)\n/g, (_, k, n) => `::: tab ${k} ${Number(n) + 1}\n`);
    s = s.replace("## Questions\n\n:::: tabs", "## Questions\n\n:::: tabs\n::: tab Q 1\nIn one sentence, what does the principle of this chapter predict for a system at equilibrium that is disturbed? *(Objective 1)*\n:::\n::: tab Answer 1\nIt shifts to a new equilibrium that partially counteracts the disturbance.\n:::\n::::\n\n:::: tabs");
    fs.writeFileSync(path.join(c.root, PR), s);
  });
  const us = c.units();
  const nq = us.find((u) => u.text.startsWith("In one sentence, what does the principle")), na = us.find((u) => u.text.startsWith("It shifts to a new equilibrium that partially"));
  linkUnits(c.root, c.r(), { [nq.id]: Q1.spineNodes, [na.id]: A1.spineNodes }, AGENT);
  assert.equal(c.units().find((u) => u.id === Q5).label, "Q 6");
  const f = c.owed().filter((x) => x.kind === "reverify" && (x.units.includes(Q5) || x.units.includes(A5)));
  assert.ok(f.some((x) => x.units.includes(Q5)) && f.some((x) => x.units.includes(A5)), "old Q5 and its answer owe a re-check");
  assert.ok(f.every((x) => /now another one \(renumbered\)/.test(x.evidence.what)), f.map((x) => x.evidence.what).join(" | "));
});

// ============================================ history ================================================================
test("[req.records.history-extends] F7: the history check ignores git object replacement and grafts, and a package whose git has either is log-broken", (t) => {
  const c = course(t);
  const LOG = "metadata/LOG.jsonl", f = path.join(c.root, LOG);
  const text = fs.readFileSync(f, "utf8");
  // a past instructor record rewritten, the log re-chained, and the committed log blob replaced by the forgery
  const recs = text.trim().split("\n").map((l) => JSON.parse(l));
  const k = recs.findIndex((r) => r.party?.role === "instructor" && r.payload?.instructorWords);
  assert.ok(k >= 0);
  recs[k].payload.instructorWords = "Reject all: none of these changes may ship.";
  let prev = k ? recs[k - 1].hash : "0".repeat(64);
  for (let i = k; i < recs.length; i++) { const r = recs[i]; r.prev = prev; delete r.hash; r.hash = recordHash(r); prev = r.hash; }
  const forged = recs.map((r) => JSON.stringify({ seq: r.seq, prev: r.prev, type: r.type, party: r.party, at: r.at, payload: r.payload, hash: r.hash })).join("\n") + "\n";
  assert.deepEqual(verifyLog(forged), []);
  fs.writeFileSync(f, forged);
  const blob = gitIn(c.root, "rev-parse", `HEAD:${LOG}`).stdout.trim();
  const nb = spawnSync("git", ["-C", c.root, "hash-object", "-w", "--stdin"], { input: forged, encoding: "utf8" }).stdout.trim();
  assert.equal(gitIn(c.root, "replace", "-f", blob, nb).status, 0);
  assert.equal(gitIn(c.root, "show", `HEAD:${LOG}`).stdout, forged, "git itself now shows the forgery");
  const lf = logFindings(c.root, "t");
  assert.equal(lf.length, 1); assert.equal(lf[0].kind, "log-broken");
  const failures = lf[0].evidence.failures.join(" | ");
  assert.match(failures, /replaces objects/);
  assert.match(failures, /differs from the committed log|history rewritten/, `the true committed log is read: ${failures}`);
  // a graft file alone is a defect too
  const d = course(t);
  assert.deepEqual(logFindings(d.root, "t"), []);
  fs.writeFileSync(path.join(d.root, ".git", "info", "grafts"), gitIn(d.root, "rev-parse", "HEAD").stdout.trim() + "\n");
  const lg = logFindings(d.root, "t");
  assert.equal(lg[0]?.kind, "log-broken");
  assert.match(lg[0].evidence.failures.join(" "), /graft/);
});
