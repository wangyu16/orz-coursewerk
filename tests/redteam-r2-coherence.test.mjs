// Red team, round 2 — COHERENCE (H1–H5): every finding of the round-2 report
// (var/projects/coursewerk-caeai/workspace/studies/p11/redteam-r2/coherence/REPORT.md, scripts f1…f14) reproduced on the
// real course fixture, under git like tests/redteam-r1-coherence.test.mjs, and asserted CAUGHT. Each test fixes the class:
//   F1 F2 F14  an identity break forgets nothing: a retired unit's record (stamp, owes, carry, links) is kept in the
//              retired-unit register; a text that comes back (byte for byte or nearly) takes back its id and record,
//              a piece of one inherits its stamp and obligations, and a retired id is never minted for other text;
//   F6 F9 F10  nothing clears without evidence: only a correctness review (knowledge, or an admitting semi for a
//              non-answer) re-verifies, checked against the dispatch record the log vouches for; recordVerification is
//              gone; logUnitRecords refuses to log over an edited record;
//   F3 F12 F13 edges are not lexical guesses: a question named by number is a dependency, a declared alias matches its
//              LaTeX spellings, an answer pairs with the question its label names;
//   F4         a spine or key-term change is light only when no word changed; a rephrasing is a glance only when its
//              blind review finds the meaning kept (D43, operator 2026-10-07);
//   F5 F8      the unit-record digest binds the whole sidecar (and the gate recomputes where a unit is); every commit
//              reachable is checked against every parent, and the branch's reflog, remote-tracking branches, tags and
//              an earlier release's receipt anchor the log against a squash.
// Skipped here (other lanes): F7 (Confidence), F11 (Control). Offline and deterministic: blind reviews are replayed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader, manifestChapters } from "../scripts/lib/core/package_reader.mjs";
import * as obligations from "../scripts/lib/core/obligations.mjs";
import { confirmUnits, coreObligations, indexAndStamp, linkUnits, loadUnits, openVersionCarrying, reverifyUnits } from "../scripts/lib/core/obligations.mjs";
import { beginSession, matchUnits } from "../scripts/lib/core/units_index.mjs";
import { unitHash } from "../scripts/lib/core/segment.mjs";
import { logUnitRecords, unitRecordFindings } from "../scripts/lib/core/unit_records.mjs";
import { recordApproval, approvalStatus } from "../scripts/lib/core/approvals.mjs";
import { questionsOf, referencedUnits, termMatcher } from "../scripts/lib/core/dependencies.mjs";
import { classifyChapterChange } from "../scripts/lib/core/change.mjs";
import { reviewSpineChanges } from "../scripts/lib/core/spine_review.mjs";
import { logFindings } from "../scripts/lib/skeleton/gate.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { publishDecision, unitInfoOf } from "../scripts/lib/core/workflow.mjs";
import { packPublished } from "../scripts/lib/core/pack_v2.mjs";
import { appendLogRecord, readLogText, recordHash, verifyLog } from "../scripts/lib/records/log.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { verifyKnowledge } from "../scripts/lib/verify/verdicts.mjs";
import { reviewAlignment } from "../scripts/lib/verify/alignment.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const PR = "practice/le-chatelier.md";
const A6 = "u-practice-le-chatelier-questions-12";
const Q6_RAISED = "is exothermic. The temperature is raised. Which way";
const ANSWER6 = "Toward the reactants, to the left. For an exothermic reaction heat behaves as a **product**, so\nadding heat is like adding a product, and the equilibrium shifts away from it. The yield of ammonia\nfalls at higher temperature.";
const gitIn = (root, ...a) => spawnSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { encoding: "utf8" });

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r2coh-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  gitIn(root, "init", "-q", "-b", "main"); gitIn(root, "add", "-A"); gitIn(root, "commit", "-qm", "baseline");
  const c = {
    root, dir, r: () => liveReader(root),
    gate: () => runGate(root, { inputsDir: INPUTS }),
    units: () => loadUnits(root, liveReader(root)),
    file: (rel) => path.join(root, rel),
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 50)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent: (fn) => { beginSession(root, liveReader(root), AGENT); fn(); return indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    commit: (m = "c") => gitIn(root, "commit", "-qam", m),
    owed: () => coreObligations(root, liveReader(root), "t"),
  };
  c.owes = (id) => c.owed().filter((f) => ["reverify", "carried-unverified"].includes(f.kind) && f.units.includes(id)).map((f) => f.kind);
  c.reverse = () => c.asAgent(() => c.edit(PR, Q6_RAISED, Q6_RAISED.replace("raised", "lowered")));
  return c;
}
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];
const clean = replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [] }));
const forgedLog = (text, mutate) => {
  const recs = text.trim().split("\n").map((l) => JSON.parse(l)); mutate(recs);
  let prev = "0".repeat(64);
  for (const r of recs) { r.prev = prev; delete r.hash; r.hash = recordHash(r); prev = r.hash; }
  const out = recs.map((r) => JSON.stringify({ seq: r.seq, prev: r.prev, type: r.type, party: r.party, at: r.at, payload: r.payload, hash: r.hash })).join("\n") + "\n";
  assert.deepEqual(verifyLog(out), [], "the forged log verifies on its own");
  return out;
};

// ============================================ an identity break forgets nothing ====================================
test("[req.coherence.retired-register] F1: an answer owing re-verification, replaced by a placeholder and restored (byte for byte, or nearly), takes back its id and still owes it; a retired id is never minted for other text", (t) => {
  const c = course(t);
  c.reverse();
  assert.ok(c.owes(A6).includes("reverify"));
  const links = c.units().find((u) => u.id === A6).spineNodes;
  const used = new Set(c.units().map((u) => u.id));
  c.asAgent(() => c.edit(PR, ANSWER6, "To be rewritten."));
  const mid = c.units().find((u) => u.text === "To be rewritten.");
  assert.ok(!c.units().some((u) => u.id === A6), "Answer 6 is retired");
  assert.ok(!used.has(mid.id), `the placeholder gets a new id, not a retired or live one (${mid.id})`);
  c.asAgent(() => c.edit(PR, "To be rewritten.", ANSWER6)); // the old text, byte for byte
  const back = c.units().find((u) => u.text.startsWith("Toward the reactants, to the left. For an exothermic"));
  assert.equal(back.id, A6, "the returning text takes back its id");
  linkUnits(c.root, c.r(), { [A6]: links }, AGENT); // its links, as they were
  assert.ok(c.owes(A6).includes("reverify"), "and still owes its re-verification");
  assert.ok(!c.units().some((u) => u.id === mid.id), "the placeholder is retired in turn");
  // a near return (a reworded placeholder round trip) is the same unit: it keeps the obligation too
  c.asAgent(() => c.edit(PR, ANSWER6, "To be rewritten."));
  c.asAgent(() => c.edit(PR, "To be rewritten.", ANSWER6.replace("Toward the reactants, to the left.", "Toward the reactants (to the left).")));
  assert.equal(c.units().find((u) => u.text.startsWith("Toward the reactants (to the left).")).id, A6);
  assert.ok(c.owes(A6).includes("reverify"));
  const g = c.gate();
  assert.ok(g.findings.some((f) => f.kind === "reverify" && f.units.includes(A6) && f.statusClass === "obligation"));
  assert.equal(g.gate.canPublish, false);
});

test("[req.coherence.retired-register] F2: a carried chapter blanked in one session and restored in the next leaves every unit carried", (t) => {
  const c = course(t);
  openVersionCarrying(c.root, c.r(), { scopes: ["chapter:le-chatelier"], reason: "objective 3 split in two", instructorWords: "Open version 2 of the Le Chatelier chapter." }, I);
  const carried = () => c.owed().filter((f) => f.kind === "carried-unverified").flatMap((f) => f.units).sort();
  const was = carried();
  assert.ok(was.length > 80);
  const files = ["study-guide", "slides", "practice"].map((d) => `${d}/le-chatelier.md`), orig = files.map((rel) => fs.readFileSync(c.file(rel), "utf8"));
  const linksOf = new Map(c.units().map((u) => [u.id, u.spineNodes]));
  c.asAgent(() => files.forEach((rel) => fs.writeFileSync(c.file(rel), "# Placeholder\n\nBeing rewritten for version 2.\n")));
  c.asAgent(() => files.forEach((rel, i) => fs.writeFileSync(c.file(rel), orig[i])));
  const back = c.units().filter((u) => files.includes(u.locator.deliverable));
  linkUnits(c.root, c.r(), Object.fromEntries(back.map((u) => [u.id, linksOf.get(u.id) || []])), AGENT);
  assert.deepEqual(carried(), was, "every unit is still carried, under its own id");
});

test("[req.coherence.retired-register] F14: an answer that owes re-verification only through its stale stamp, split in two, passes the obligation to its pieces", (t) => {
  const c = course(t);
  c.reverse();
  assert.ok(c.owes(A6).includes("reverify"));
  assert.equal(c.units().find((u) => u.id === A6).owes, undefined, "the obligation lives only in the stamp");
  c.asAgent(() => {
    c.edit(PR, "is exothermic. The temperature is lowered. Which way", "is exothermic.\n:::\n::: tab Q 6 (continued)\nThe temperature is lowered. Which way");
    c.edit(PR, "and the equilibrium shifts away from it. The yield of ammonia", "and the equilibrium shifts away from it.\n:::\n::: tab Answer 6 (continued)\nThe yield of ammonia");
  });
  const pieces = c.units().filter((u) => u.splitFrom === A6);
  assert.equal(pieces.length, 2);
  for (const p of pieces) assert.ok(c.owes(p.id).includes("reverify"), `${p.id} owes what Answer 6 owed`);
  // the register keys pieces too: a piece of a RETIRED unit that owed inherits what it owed
  const d = course(t);
  d.reverse();
  d.asAgent(() => d.edit(PR, ANSWER6, "To be rewritten."));
  d.asAgent(() => d.edit(PR, "To be rewritten.", ANSWER6.replace("and the equilibrium shifts away from it. The yield of ammonia", "and the equilibrium shifts away from it.\n:::\n::: tab Answer 6 (continued)\nThe yield of ammonia")));
  const returned = d.units().filter((u) => u.locator.deliverable === PR && (u.text.startsWith("Toward the reactants, to the left.") || u.text.startsWith("The yield of ammonia")));
  assert.equal(returned.length, 2);
  for (const u of returned) assert.ok(d.owes(u.id).includes("reverify"), `${u.id} came back from Answer 6 and owes what it owed`);
});

test("[req.coherence.retired-register] the register is part of the unit record: matchUnits leaves a returning text to it, and a hand-added register entry is unit-record-altered", (t) => {
  const c = course(t);
  const old = [{ id: "u-x-1", form: "paragraph", tokens: ["alpha", "beta", "gamma"], locator: { section: "s", ordinal: 0, contentHash: "a".repeat(64) } }];
  const seg = [{ form: "paragraph", section: "s", text: "alpha beta gamma delta" }];
  assert.equal(matchUnits(old, seg).assigned.size, 1, "a rewording in place");
  assert.equal(matchUnits(old, seg, { reserved: new Set([unitHash(seg[0].text)]) }).assigned.size, 0, "a retired unit's exact text is never a rewording of another");
  beginSession(c.root, c.r(), AGENT); // upgrades the legacy digests to whole-record digests
  const sc = c.file(`metadata/units/${PR}.json`), side = JSON.parse(fs.readFileSync(sc, "utf8"));
  side.retired = [{ id: "u-practice-le-chatelier-questions-99", deliverable: PR, section: "Questions", contentHash: "b".repeat(64), form: "answer", tokens: [] }];
  fs.writeFileSync(sc, JSON.stringify(side, null, 2) + "\n");
  assert.ok(unitRecordFindings(c.root, "t").some((f) => f.kind === "unit-record-altered"));
});

// ============================================ nothing clears without evidence =====================================
test("[req.records.clearing-evidence] [req.coherence.reverify-routed] F6: a link review is not a re-verification; only a correctness review whose record checks out against the log is", async (t) => {
  const c = course(t);
  c.reverse();
  const honestLink = replayVerifier((pr) => {
    const declared = pr.split("\nDECLARED ITEMS\n")[1].split("\n\n")[0].split("\n").map((l) => l.replace(/^- /, "")).filter(Boolean);
    return { nonce: nonceOf(pr), links: declared.map((id) => ({ id, verdict: "yes", why: "it practises a temperature shift" })), also: [], offPlan: false };
  });
  await reviewAlignment(c.root, c.r(), { verifier: honestLink, only: [A6] });
  assert.throws(() => reverifyUnits(c.root, c.r(), [A6], AGENT), /no logged blind correctness review[\s\S]*a link review does not count/);
  // a knowledge review with no readable answer (the verifier said nothing) does not count
  await verifyKnowledge(c.root, c.r(), { verifier: replayVerifier(() => undefined), only: [A6] });
  assert.throws(() => reverifyUnits(c.root, c.r(), [A6], AGENT), /answer is unreadable/);
  // a dispatch logged by hand, with no record behind it, does not count
  const dispatches = () => readLogText(c.root).trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.type === "dispatch");
  appendLogRecord(c.root, { type: "dispatch", party: { role: "harness", name: "verify" }, payload: { ...dispatches().at(-1).payload, dispatch: "d-0000000000000000" } });
  assert.throws(() => reverifyUnits(c.root, c.r(), [A6], AGENT), /missing or unreadable/);
  // a review record edited after it was logged does not count
  await verifyKnowledge(c.root, c.r(), { verifier: clean, only: [A6] });
  const rf = c.file(`metadata/verification/${dispatches().at(-1).payload.dispatch}.json`), orig = fs.readFileSync(rf, "utf8");
  const edited = JSON.parse(orig); edited.at = "2026-01-01T00:00:00.000Z"; fs.writeFileSync(rf, JSON.stringify(edited, null, 2) + "\n");
  assert.throws(() => reverifyUnits(c.root, c.r(), [A6], AGENT), /not the one the log vouches for/);
  assert.ok(c.owes(A6).includes("reverify"));
  fs.writeFileSync(rf, orig);
  // the routed fix: the knowledge review of the current text with its question, as logged
  const rec = reverifyUnits(c.root, c.r(), [A6], AGENT);
  assert.ok(rec.payload.reviews[A6]);
  assert.deepEqual(c.owes(A6), []);
});

test("[req.records.clearing-evidence] F9: there is no call that clears an obligation by naming a module", async (t) => {
  const c = course(t);
  assert.equal(obligations.recordVerification, undefined, "recordVerification is gone");
  openVersionCarrying(c.root, c.r(), { scopes: ["chapter:le-chatelier"], reason: "objective 3 split in two", instructorWords: "Open version 2." }, I);
  const carried = c.owed().filter((f) => f.kind === "carried-unverified").flatMap((f) => f.units);
  assert.ok(carried.length > 80);
  assert.throws(() => reverifyUnits(c.root, c.r(), carried, AGENT), /no logged blind correctness review/);
  // evidence, too, names the logged fact check it came from
  assert.throws(() => obligations.admitEvidence(c.root, c.r(), carried[0], { type: "quote-verified", factHash: "x", dispatch: "d-nothing" }), /evidence|facts/);
  const u = c.units().find((x) => x.id === carried[0]);
  const { factHash } = await import("../scripts/lib/core/dependencies.mjs");
  assert.throws(() => obligations.admitEvidence(c.root, c.r(), u.id, { type: "quote-verified", factHash: factHash(u.text), dispatch: "d-nothing" }), /logged fact-check dispatch/);
});

test("[req.records.unit-digest] F10: logUnitRecords refuses to log over a hand-edited unit record", (t) => {
  const c = course(t);
  c.reverse();
  linkUnits(c.root, c.r(), { [A6]: [...c.units().find((u) => u.id === A6).spineNodes, "objective.le-chatelier.state-principle"] }, AGENT);
  assert.ok(c.units().find((u) => u.id === A6).owes, "the obligation is an owes record now");
  const sc = c.file(`metadata/units/${PR}.json`), side = JSON.parse(fs.readFileSync(sc, "utf8"));
  const u = side.units.find((x) => x.id === A6); delete u.owes; delete u.stamp; // the hand edit
  fs.writeFileSync(sc, JSON.stringify(side, null, 2) + "\n");
  assert.throws(() => logUnitRecords(c.root, [PR]), /changed outside the harness/);
  assert.ok(unitRecordFindings(c.root, "t").some((f) => f.kind === "unit-record-altered"), "still caught");
});

// ============================================ edges ==============================================================
test("[req.coherence.edges-complete] F3: a question named by number (\"the answer to Q3\") is a dependency of the question and the answer that name it", async (t) => {
  const c = course(t);
  const id = (start) => c.units().find((u) => u.locator.deliverable === PR && u.text.startsWith(start)).id;
  const Q5 = id("Justify the answer to Q3"), A5 = id("Adding $\\ce{H2}$ increases the denominator");
  beginSession(c.root, c.r(), AGENT); // the agent's next session baselines the new edge kind
  const all = c.units(), q5 = all.find((u) => u.id === Q5), a5 = all.find((u) => u.id === A5);
  assert.deepEqual(referencedUnits(all, q5).map((u) => u.label).sort(), ["Answer 3", "Q 3"]);
  assert.deepEqual(referencedUnits(all, a5).map((u) => u.label).sort(), ["Answer 3", "Q 3"], "an answer refers to what its question refers to");
  c.asAgent(() => c.edit(PR, "at equilibrium, extra $\\ce{H2}$ is injected. Which way", "at equilibrium, extra $\\ce{NH3}$ is injected. Which way"));
  const re = new Set(c.owed().filter((f) => f.kind === "reverify").flatMap((f) => f.units));
  assert.ok(re.has(Q5) && re.has(A5), `Q 5 and Answer 5 are found: ${[...re].join(", ")}`);
  // the knowledge review is shown the same referenced units
  let shown = "";
  await verifyKnowledge(c.root, c.r(), { verifier: replayVerifier((pr) => { shown = pr; return { nonce: nonceOf(pr), concerns: [] }; }), only: [A5] });
  assert.match(shown, /TEXT THE PASSAGE REFERS TO[\s\S]*NH3/);
});

test("[req.coherence.edges-complete] F12: a declared alias matches its LaTeX spellings; a redefined term reaches every unit writing it as $Q_r$", (t) => {
  const uses = termMatcher({ label: "reaction quotient", aliases: ["Qr"] });
  for (const s of ["compare $Q_r$ with $K$", "Q_{r} = 12", "$\\mathrm{Q_r}$", "$Q_\\mathrm{r}$", "the reaction quotients"]) assert.ok(uses(s), s);
  assert.ok(!uses("a QR code"));
  const k = termMatcher({ label: "equilibrium constant", aliases: ["K", "Keq", "Kc"] });
  assert.ok(k("$K_c = 4.0$") && k("so $K$ rises"));
  assert.ok(!k("the rate constant $k$"), "a short alias keeps its case");
  const c = course(t);
  beginSession(c.root, c.r(), AGENT); // baselines the alias edges (the agent's next session after the harness upgrade)
  const users = c.units().filter((u) => /Q_\{?r\}?/.test(u.text) || /reaction quotient/i.test(u.text));
  assert.ok(users.length >= 20);
  c.edit("concepts/chemical-equilibrium.md", "the equilibrium-constant expression evaluated at an arbitrary, not-necessarily-equilibrium composition",
    "the equilibrium-constant expression evaluated with the initial concentrations only, never with a composition reached during the reaction");
  recordApproval(c.root, c.r(), manifestChapters(c.r()), { chapter: "chemical-equilibrium", instructorWords: "Approved: Q_r is computed from the initial mixture." }, I);
  const re = new Set(c.owed().filter((f) => f.kind === "reverify").flatMap((f) => f.units));
  assert.deepEqual(users.filter((u) => !re.has(u.id)).map((u) => u.id), [], "every unit using Q_r is found");
});

test("[req.coherence.question-binding] F13: an answer pairs with the question its label names; regrouped tabs keep the binding, and the labelled question's change is found", (t) => {
  const c = course(t);
  c.asAgent(() => {
    const f = c.file(PR); let s = fs.readFileSync(f, "utf8");
    const g6 = s.match(/:::: tabs\n::: tab Q 6\n[\s\S]*?\n::::\n/)[0], g7 = s.match(/:::: tabs\n::: tab Q 7\n[\s\S]*?\n::::\n/)[0];
    const tab = (g, name) => g.match(new RegExp(`::: tab ${name}\\n[\\s\\S]*?\\n:::\\n`))[0];
    s = s.replace(g6 + "\n" + g7, `:::: tabs\n${tab(g6, "Q 6")}${tab(g7, "Q 7")}${tab(g6, "Answer 6")}${tab(g7, "Answer 7")}::::\n`); fs.writeFileSync(f, s);
  });
  const all = c.units(), a6 = all.find((u) => u.id === A6);
  assert.deepEqual(questionsOf(all, a6).map((q) => q.label), ["Q 6"], "the label, not the nearest question (Q 7)");
  assert.deepEqual(c.owes(A6), [], "the same question: nothing is re-paired");
  c.reverse();
  assert.ok(c.owes(A6).includes("reverify"), "Q 6 reversed: Answer 6 is found");
  // position only without labels; a label/position conflict is resolved by the label
  const mk = (id, form, label, ordinal) => ({ id, form, ...(label ? { label } : {}), text: id, locator: { deliverable: "practice/x.md", section: "s", ordinal } });
  const u = [mk("q1", "question", "Q 1", 0), mk("q2", "question", "Q 2", 1), mk("a1", "answer", "Answer 1", 2), mk("q3", "question", null, 3), mk("a3", "answer", null, 4), mk("a9", "answer", "Answer 9", 5)];
  assert.deepEqual(questionsOf(u, u[2]).map((q) => q.id), ["q1"]);
  assert.deepEqual(questionsOf(u, u[4]).map((q) => q.id), ["q3"], "no label: the nearest question before it");
  assert.deepEqual(questionsOf(u, u[5]).map((q) => q.id), ["q3"], "a label no question carries: position");
});

// ============================================ light spine changes =================================================
test("[req.coherence.light-spine] F4 + D43: no changed word is light; a rephrasing is glance-confirmed only when its blind review finds every changed line the same in meaning — a reversal through any words is not", async (t) => {
  const node = (text) => ({ nodes: [{ id: "n", kind: "concept", text, prereqs: [] }], entries: [] });
  const kind = (a, b) => classifyChapterChange(node(a), node(b), { beforeText: a, afterText: b }).kind;
  assert.equal(kind("a system at equilibrium disturbed by a change", "a *system at equilibrium*, disturbed by a change"), "light", "markup and a comma");
  assert.equal(kind("a system at equilibrium disturbed by", "a system at equilibrium, when disturbed by"), "rephrasing", "a word added (the round-1 example)");
  assert.equal(kind("added at constant volume, does not shift", "added at constant pressure, does not shift"), "rephrasing", "no word list tells this from a rephrase: the reviewer does");
  assert.equal(kind("added at 1 atm, does not shift", "added at 2 atm, does not shift"), "substantive", "a value changed");
  assert.equal(kind("added at constant volume, does not shift", "added at constant volume, does shift"), "substantive", "a negation dropped");
  const spineReviewer = (meaningOf) => replayVerifier((pr) => {
    const lines = (pr.split("\nCHANGED LINES\n")[1] || "").split("\n\n")[0].split("\n").filter((l) => /^\d+\. /.test(l));
    return { nonce: nonceOf(pr), concerns: [], meaning: lines.map((l, i) => ({ line: i + 1, meaning: meaningOf(l) })) };
  });
  const glance = (c) => recordApproval(c.root, c.r(), manifestChapters(c.r()), { chapter: "le-chatelier", glance: true, instructorWords: "Fine, a wording fix." }, I);
  // the R2 F4 reversal: a rephrasing by its words, refused at a glance without the review, and refused when the review
  // (honest) finds the line changed in meaning
  const c = course(t);
  c.edit("concepts/le-chatelier.md", "a gas that does not react and, added at constant volume, does not shift a gas-phase equilibrium", "a gas that does not react and, added at constant pressure, does not shift a gas-phase equilibrium");
  assert.equal(approvalStatus(c.r(), manifestChapters(c.r()), readLogText(c.root)).scopes["le-chatelier"].change.kind, "rephrasing");
  assert.throws(() => glance(c), /has no current review/);
  const rv = await reviewSpineChanges(c.root, c.r(), "chapter:le-chatelier", { verifier: spineReviewer((l) => (/constant pressure/.test(l) ? "changed" : "same")) });
  assert.equal(rv.meaning.same, false);
  assert.throws(() => glance(c), /changed in meaning or did not say/);
  // a review that does not say (an answer from before D43, or a line left out) is a change too
  await reviewSpineChanges(c.root, c.r(), "chapter:le-chatelier", { verifier: replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [] })) });
  assert.throws(() => glance(c), /changed in meaning or did not say/);
  // an honest rephrasing, found the same in meaning: a glance, and nothing that depends on it owes a re-check
  const d = course(t), reverify = () => d.owed().filter((f) => f.kind === "reverify").flatMap((f) => f.units).length;
  const before = reverify();
  d.edit("concepts/le-chatelier.md", "1. Le Chatelier's principle states that a system at equilibrium disturbed by", "1. Le Chatelier's principle states that a system at equilibrium, when disturbed by");
  assert.ok(reverify() > before, "unconfirmed, the rewording makes its dependents owe a re-check");
  await reviewSpineChanges(d.root, d.r(), "chapter:le-chatelier", { verifier: spineReviewer(() => "same") });
  const rec = glance(d);
  assert.equal(rec.type, "glance-confirmation"); assert.equal(rec.payload.change, "rephrasing");
  assert.equal(reverify(), before, "a meaning-kept rephrasing re-baselines its dependents, as a light change does");
});

// ============================================ record integrity =====================================================
test("[req.records.unit-digest] F8: the unit-record digest binds the whole record; a relabelled locator is caught, and the gate reads where a unit really is", (t) => {
  const c = course(t);
  const ce = "practice/chemical-equilibrium.md", sc = c.file(`metadata/units/${ce}.json`), orig = fs.readFileSync(sc, "utf8");
  const A = c.units().find((u) => u.locator.deliverable === ce && u.form === "answer");
  const relabel = (field, value) => { const side = JSON.parse(orig); side.units.find((u) => u.id === A.id).locator[field] = value; fs.writeFileSync(sc, JSON.stringify(side, null, 2) + "\n"); };
  // a legacy-digest record (logged before R2): a locator naming another deliverable is caught
  relabel("deliverable", "study-guide/chemical-equilibrium.md");
  assert.ok(unitRecordFindings(c.root, "t").some((f) => f.kind === "unit-record-altered"));
  assert.equal(c.units().find((u) => u.id === A.id).locator.deliverable, ce, "the gate reads the real deliverable");
  fs.writeFileSync(sc, orig);
  // after the next session the digest binds every field: any locator edit is caught
  beginSession(c.root, c.r(), AGENT);
  const now = fs.readFileSync(sc, "utf8");
  const side = JSON.parse(now); side.units.find((u) => u.id === A.id).locator.section = "Worked examples"; fs.writeFileSync(sc, JSON.stringify(side, null, 2) + "\n");
  assert.ok(unitRecordFindings(c.root, "t").some((f) => f.kind === "unit-record-altered"));
  fs.writeFileSync(sc, now);
  assert.deepEqual(unitRecordFindings(c.root, "t"), []);
});

test("[req.records.history-extends] F5: every commit is checked against every parent, and the branch's reflog anchors the log: an orphan merged with -s ours and a squash onto a new root are both log-broken", (t) => {
  const c = course(t);
  c.asAgent(() => c.edit("study-guide/le-chatelier.md", "## Changing a concentration\n", "## Changing a concentration\n\nEach case below asks one question.\n"));
  c.commit("work");
  const f = c.file("metadata/LOG.jsonl");
  const forged = forgedLog(fs.readFileSync(f, "utf8"), (recs) => { recs[0].payload.instructorWords = "Approve everything, forever, without reading."; });
  // the orphan, with the real history merged in and the forged tree kept
  const o = course(t);
  o.asAgent(() => o.edit("study-guide/le-chatelier.md", "## Changing a concentration\n", "## Changing a concentration\n\nEach case below asks one question.\n"));
  o.commit("work");
  const forgedO = forgedLog(fs.readFileSync(o.file("metadata/LOG.jsonl"), "utf8"), (recs) => { recs[0].payload.instructorWords = "Approve everything, forever, without reading."; });
  gitIn(o.root, "checkout", "-q", "--orphan", "tidy"); fs.writeFileSync(o.file("metadata/LOG.jsonl"), forgedO);
  gitIn(o.root, "add", "-A"); gitIn(o.root, "commit", "-qm", "Tidy the records");
  gitIn(o.root, "merge", "-q", "-s", "ours", "--allow-unrelated-histories", "-m", "Merge main", "main");
  gitIn(o.root, "branch", "-f", "main", "HEAD"); gitIn(o.root, "checkout", "-q", "main");
  const merged = logFindings(o.root, "t").find((x) => x.kind === "log-broken");
  assert.ok(merged, "the orphan merge is caught");
  assert.match(merged.evidence.failures.join(" "), /does not extend the log committed at .* \(a parent of the merge\)/);
  // the squash onto a new root: no parent to compare, but the branch's reflog remembers the old log
  gitIn(c.root, "checkout", "-q", "--orphan", "squashed"); fs.writeFileSync(f, forged);
  gitIn(c.root, "add", "-A"); gitIn(c.root, "commit", "-qm", "Squash");
  gitIn(c.root, "branch", "-f", "main", "HEAD"); gitIn(c.root, "checkout", "-q", "main"); gitIn(c.root, "branch", "-D", "squashed");
  const squashed = logFindings(c.root, "t").find((x) => x.kind === "log-broken");
  assert.ok(squashed, "the squash is caught");
  assert.match(squashed.evidence.failures.join(" "), /reflog\) is not an earlier or later version of HEAD's log/);
});

test("[req.records.history-extends] F5: an earlier release's receipt anchors the log — a package whose log was rewritten since is not packed again", (t) => {
  const c = course(t);
  const ids = [...new Set(coreObligations(c.root, c.r(), "t").filter((f) => ["evidence-missing", "absolute-unreviewed"].includes(f.kind)).flatMap((f) => f.units).filter((u) => /le-chatelier/.test(u)))];
  confirmUnits(c.root, c.r(), ids, { what: "fact", instructorWords: "I confirm these." }, I); c.commit("confirmed");
  const g = c.gate();
  publishDecision(c.root, c.r(), { gateResult: g, unitInfo: unitInfoOf(c.root, c.r()), instructorWords: "Publish it.", overQuestions: true, chapters: ["le-chatelier"] }, I);
  const out = path.join(c.dir, "dist");
  const first = packPublished(c.root, out);
  assert.equal(first.ok, true, first.error);
  assert.ok(first.logHead?.hash, "the receipt names the log's last record");
  const f = c.file("metadata/LOG.jsonl");
  fs.writeFileSync(f, forgedLog(fs.readFileSync(f, "utf8"), (recs) => { recs[0].payload.instructorWords = "Approve everything, forever, without reading."; }));
  const again = packPublished(c.root, out);
  assert.equal(again.ok, false);
  assert.match(again.error, /history was rewritten since that release/);
});
