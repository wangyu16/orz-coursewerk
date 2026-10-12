// Layer 1 of the 3C closed loop (operator, 2026-10-06): every claim of Control, Confidence and Coherence as one
// mechanical, end-to-end loop on the real course fixture —
//   plant the violation → the gate raises the expected finding → it is routed to the right party →
//   the routed fix is applied → the finding set returns exactly to the baseline (and the benign half raises nothing).
// Offline and deterministic: verifier answers are replayed through the real paths. A loop proves wiring and the
// deterministic guarantee, not judgment quality (that is the studies').
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { confirmUnits, indexAndStamp, linkUnits, loadUnits, openVersionCarrying, reverifyUnits } from "../scripts/lib/core/obligations.mjs";
import { beginSession, claimAuthorship } from "../scripts/lib/core/units_index.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { loopStep } from "../scripts/lib/core/loop.mjs";
import { answerDigest, buildDigest } from "../scripts/lib/core/digest.mjs";
import { unitInfoOf } from "../scripts/lib/core/workflow.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { applyCorrection, correctionsToShow, revertCorrection, verifyKnowledge, verifySemi } from "../scripts/lib/verify/verdicts.mjs";
import { reviewAlignment } from "../scripts/lib/verify/alignment.mjs";
import { fsInputReader, pinReference, pinnedTexts, syncReferenceRecord } from "../scripts/lib/verify/references.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const git = (root, ...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });

/** A fresh copy of the real course, under git so the log check is live, with its baseline finding set. */
function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-3c-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  fs.cpSync(C2, root, { recursive: true }); fs.cpSync(INPUTS, inputs, { recursive: true });
  git(root, "init", "-q", "-b", "main"); git(root, "add", "-A"); git(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "baseline");
  const c = {
    root, inputs, r: () => liveReader(root),
    gate: () => runGate(root, { inputsDir: inputs }),
    units: () => loadUnits(root, liveReader(root)),
    file: (rel) => path.join(root, rel),
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 50)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent: (fn) => { beginSession(root, liveReader(root), AGENT); fn(); indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
  };
  c.base = sigs(c.gate().findings);
  return c;
}
// a finding's identity for the baseline: its check, class, units — and its subject, for findings about no unit
const sigOf = (f) => `${f.module}|${f.kind}|${f.statusClass}|${[...(f.units || [])].sort().join(",")}|${(f.units || []).length ? "" : String(f.evidence?.what || f.evidence?.rule || f.evidence?.note || "").slice(0, 120)}`;
const sigs = (fs_) => new Set(fs_.map(sigOf));
const added = (c, findings) => findings.filter((f) => !c.base.has(sigOf(f)));
/** The loop closes: the finding set is exactly the baseline again. */
const closed = (c, why) => { const now = sigs(c.gate().findings); assert.deepEqual([...now].filter((s) => !c.base.has(s)), [], `${why}: nothing new remains`); };
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];
const HABER = "For the ammonia synthesis reaction N2 + 3 H2 ⇌ 2 NH3 the standard reaction enthalpy is −92.4 kJ per mole of reaction, so by Le Chatelier's principle raising the temperature shifts the reaction toward the reactants.";
const pinHaber = (c) => pinReference(c.root, c.inputs, { url: "https://openstax.org/books/chemistry-2e/pages/13-3-shifting-equilibria-le-chateliers-principle", title: "Shifting equilibria (test pin)", destination: "openstax.org/books/chemistry-2e", text: HABER });
const sync = (c) => syncReferenceRecord(c.root, c.inputs); // the verify CLI records the cited references after semi and correct
const texts = (c) => pinnedTexts(fsInputReader(c.inputs));
const plain = (c) => new Map([...texts(c)].filter(([, v]) => v.ok).map(([k, v]) => [k, v.text]));
const semiAnswer = (verdict, quote) => replayVerifier((pr) => {
  const ps = pr.split("\nPASSAGES\n")[1].split("\n").map((l) => l.match(/^\[(\d+)\] (.*)$/)).filter(Boolean).map((m) => ({ n: Number(m[1]), text: m[2] }));
  const n = pr.split("\nCLAIMS\n")[1].split("\n\nPASSAGES")[0].split("\n").filter((l) => /^\d+\. /.test(l)).length;
  const x = ps.find((p) => p.text.includes("−92.4 kJ"));
  return { nonce: nonceOf(pr), claims: Array.from({ length: n }, (_, i) => (x ? { claim: i + 1, verdict, quotes: [{ passage: x.n, text: quote }] } : { claim: i + 1, verdict: "not-found", quotes: [] })) };
});
const WORKED = "the reaction and $\\Delta H = -92\\ \\text{kJ mol}^{-1}$ are from the source";
const alignAnswer = (fn) => replayVerifier((pr) => ({ nonce: nonceOf(pr), ...fn(pr.split("\nDECLARED ITEMS\n")[1].split("\n\n")[0].split("\n").map((l) => l.replace(/^- /, ""))) }));
const OBJ = "objective.le-chatelier.explain-inert-and-catalyst";

// ================================================= CONTROL =======================================================
test("[req.3c.c1] every approved objective is taught: an objective nobody teaches blocks publishing until it is taught again", (t) => {
  const c = course(t);
  const teaching = c.units().filter((u) => /^(study-guide|slides)\//.test(u.locator.deliverable) && (u.spineNodes || []).includes(OBJ));
  const was = Object.fromEntries(teaching.map((u) => [u.id, u.spineNodes]));
  linkUnits(c.root, c.r(), Object.fromEntries(teaching.map((u) => [u.id, u.spineNodes.filter((n) => n !== OBJ)])), AGENT); // plant
  const f = added(c, c.gate().findings);
  assert.ok(f.some((x) => x.kind === "objective-uncovered" && x.statusClass === "obligation" && x.route === "agent"), "raised, blocking, the agent's");
  assert.equal(c.gate().gate.canPublish, false);
  linkUnits(c.root, c.r(), was, AGENT); // the routed fix: teach (link) it again
  closed(c, "C1");
});

test("[req.3c.c2] links are verified, not trusted: a unit linked to what it does not teach is the agent's question until relinked", async (t) => {
  const c = course(t);
  const u = c.units().find((x) => x.id === "u-study-guide-le-chatelier-the-principle-1");
  linkUnits(c.root, c.r(), { [u.id]: [...u.spineNodes, OBJ] }, AGENT); // plant: a false link
  await reviewAlignment(c.root, c.r(), { verifier: alignAnswer((d) => ({ links: d.map((id) => ({ id, verdict: id === OBJ ? "no" : "yes", why: "not about inert gases or catalysts" })), also: [], offPlan: false })), only: [u.id] });
  const f = added(c, c.gate().findings).filter((x) => x.module === "ms9-alignment");
  assert.deepEqual(f.map((x) => `${x.kind}:${x.statusClass}:${x.route}`), ["link-doubtful:question:agent"]);
  linkUnits(c.root, c.r(), { [u.id]: u.spineNodes }, AGENT); // the routed fix: relink
  closed(c, "C2");
});

test("[req.3c.c3] nothing off-spine goes unnoticed: an unlinked passage blocks; a linked off-plan passage is the instructor's question", async (t) => {
  const c = course(t);
  const at = "**Equal moles** of gas on both sides";
  const src = fs.readFileSync(c.file("study-guide/le-chatelier.md"), "utf8");
  const para = src.split("\n").find((l) => l.includes(at)) ?? assert.fail("anchor line");
  c.asAgent(() => c.edit("study-guide/le-chatelier.md", para, `${para}\n\nGalvanic cells convert chemical energy to electrical energy through spontaneous redox reactions at two electrodes.`));
  const off = c.units().find((u) => u.text.startsWith("Galvanic cells"));
  assert.ok(added(c, c.gate().findings).some((x) => x.kind === "unit-unlinked" && x.units.includes(off.id) && x.statusClass === "obligation"), "unlinked: blocking");
  linkUnits(c.root, c.r(), { [off.id]: ["objective.le-chatelier.predict-pressure-shift"] }, AGENT); // the agent links it plausibly
  await reviewAlignment(c.root, c.r(), { verifier: alignAnswer((d) => ({ links: d.map((id) => ({ id, verdict: "no", why: "electrochemistry" })), also: [], offPlan: true })), only: [off.id] });
  assert.ok(added(c, c.gate().findings).some((x) => x.kind === "off-spine" && x.route === "digest"), "off-plan: the instructor's question");
  c.asAgent(() => c.edit("study-guide/le-chatelier.md", `${para}\n\nGalvanic cells convert chemical energy to electrical energy through spontaneous redox reactions at two electrodes.`, para)); // dropped, as the instructor chose
  closed(c, "C3");
});

test("[req.3c.c4] the spine is a restoring force: a drifting edit is work the loop does not stop on, and the spine itself is never the agent's to change", (t) => {
  const c = course(t);
  const first = c.gate().findings;
  const teaching = c.units().filter((u) => /^(study-guide|slides)\//.test(u.locator.deliverable) && (u.spineNodes || []).includes(OBJ));
  linkUnits(c.root, c.r(), Object.fromEntries(teaching.map((u) => [u.id, u.spineNodes.filter((n) => n !== OBJ)])), AGENT); // drift: an objective dropped
  const step = loopStep({ previous: first, current: c.gate().findings, spent: { iterations: 1, costUsd: 0 } });
  assert.equal(step.stop, false, "the drift is new agent work: the loop keeps going");
  assert.ok(step.fresh.length >= 1);
  // the agent may not move the spine to fit the drift: a spine edit voids its approval, so nothing publishes
  const spine = fs.readFileSync(c.file("concepts/le-chatelier.md"), "utf8"), objLine = spine.split("\n").find((l) => l.includes("[anchor: explain-inert-and-catalyst]"));
  c.edit("concepts/le-chatelier.md", objLine, objLine.replace("[anchor:", "and dissolved salts [anchor:"));
  assert.ok(c.gate().approvalProblems.length > 0 && !c.gate().gate.canPublish, "the approved spine, not the drift, decides");
  c.edit("concepts/le-chatelier.md", objLine.replace("[anchor:", "and dissolved salts [anchor:"), objLine);
  linkUnits(c.root, c.r(), Object.fromEntries(teaching.map((u) => [u.id, u.spineNodes])), AGENT);
  closed(c, "C4");
});

test("[req.3c.c5] assessment follows the guide: a guide entry left short blocks; a question below its guide level is a question", async (t) => {
  const c = course(t);
  const linked = c.units().filter((u) => (u.spineNodes || []).includes("guide.le-chatelier.word-partially"));
  const q = linked.find((u) => u.form === "question"), was = Object.fromEntries(linked.map((u) => [u.id, u.spineNodes]));
  linkUnits(c.root, c.r(), Object.fromEntries(linked.map((u) => [u.id, u.spineNodes.filter((n) => n !== "guide.le-chatelier.word-partially")])), AGENT); // plant: the entry loses its question
  assert.ok(added(c, c.gate().findings).some((x) => x.kind === "guide-entry-short" && x.statusClass === "obligation"), `short: ${JSON.stringify(added(c, c.gate().findings).map((x) => x.kind))}`);
  linkUnits(c.root, c.r(), was, AGENT);
  closed(c, "C5 count");
  await reviewAlignment(c.root, c.r(), { verifier: alignAnswer((d) => ({ links: d.map((id) => ({ id, verdict: "yes", why: "" })), also: [], offPlan: false, fidelity: { type: "matches", level: "differs", why: "recall only" } })), only: [q.id] });
  assert.ok(added(c, c.gate().findings).some((x) => x.kind === "assessment-fidelity" && x.route === "agent"), `fidelity: ${JSON.stringify(added(c, c.gate().findings).map((x) => x.kind))}`);
  // revised (the question now asks for the explanation its entry wants) and re-reviewed: a re-run of the unchanged
  // question cannot clear the "differs" (red team R6), the revision does — and its answer is re-read with it
  c.asAgent(() => c.edit("practice/le-chatelier.md", "What is wrong with that phrasing? *(Objective 1)*", "What is wrong with that phrasing? Explain why the word *partially* matters. *(Objective 1)*"));
  const qa = c.units().filter((u) => u.id === q.id || (u.form === "answer" && u.locator.deliverable === q.locator.deliverable && u.locator.ordinal === q.locator.ordinal + 1)).map((u) => u.id);
  await reviewAlignment(c.root, c.r(), { verifier: alignAnswer((d) => ({ links: d.map((id) => ({ id, verdict: "yes", why: "" })), also: [], offPlan: false, fidelity: { type: "matches", level: "matches", why: "" } })), only: qa });
  const owed = [...new Set(c.gate().findings.filter((f) => f.kind === "reverify").flatMap((f) => f.units))];
  if (owed.length) { await verifyKnowledge(c.root, c.r(), { verifier: replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [] })), only: owed }); reverifyUnits(c.root, c.r(), owed, AGENT); }
  closed(c, "C5 fidelity");
});

// ================================================ CONFIDENCE =====================================================
test("[req.3c.k1] Level 1 is complete: a wrong constant is a defect with the source's quote; corrected, the unit is evidenced and nothing remains", async (t) => {
  const c = course(t);
  const unit = () => c.units().find((u) => u.text.includes("are from the source") && /Delta H = -(75|92)/.test(u.text));
  c.asAgent(() => c.edit("study-guide/le-chatelier.md", WORKED, WORKED.replace("-92", "-75")));
  pinHaber(c); c.base = sigs(c.gate().findings); // the pin is part of the baseline
  await verifySemi(c.root, c.r(), { texts: texts(c), verifier: semiAnswer("contradicted", HABER.slice(HABER.indexOf("the standard"), -1)), only: [unit().id] }); sync(c);
  assert.ok(c.gate().findings.some((x) => x.kind === "fact-contradicted" && x.statusClass === "defect" && x.units.includes(unit().id)));
  const r = applyCorrection(c.root, c.r(), { unitId: unit().id, plainTexts: plain(c) }, AGENT); sync(c); // the routed fix
  assert.equal(r.applied, true, JSON.stringify(r.question));
  const now = c.gate().findings.filter((x) => x.units?.includes(unit().id));
  assert.deepEqual(now.filter((x) => ["defect", "obligation"].includes(x.statusClass)).map((x) => x.kind), [], "corrected and evidenced");
});

test("[req.3c.k2] computable content is checked: two deliverables disagreeing on a value is a defect until they agree", (t) => {
  const c = course(t);
  const slide = "pushes the equilibrium away from the side where heat sits.";
  const add = " The ammonia synthesis is an exothermic reaction, with $\\Delta H = -92.2\\ \\text{kJ}$.";
  c.asAgent(() => { c.edit("slides/le-chatelier.md", slide, slide + add); c.edit("practice/le-chatelier.md", "falls at higher temperature.", "falls at higher temperature. The ammonia synthesis is an exothermic reaction ($\\Delta H = -46.1\\ \\text{kJ}$)."); });
  c.base = new Set([...c.base, ...sigs(c.gate().findings.filter((x) => x.module === "skeleton"))]); // new units owe evidence: not this claim
  assert.ok(c.gate().findings.some((x) => x.kind === "value-disagreement" && x.statusClass === "defect"));
  c.asAgent(() => c.edit("practice/le-chatelier.md", "($\\Delta H = -46.1\\ \\text{kJ}$)", "($\\Delta H = -92.2\\ \\text{kJ}$)"));
  assert.ok(!c.gate().findings.some((x) => x.kind === "value-disagreement"), "agreeing: the defect is gone");
});

test("[req.3c.k3] every reported defect is real: a correct, source-supported value raises no defect and is evidenced", async (t) => {
  const c = course(t);
  const u = c.units().find((x) => x.text.includes(WORKED));
  c.asAgent(() => c.edit("study-guide/le-chatelier.md", WORKED, WORKED.replace("-92", "-92.4")));
  pinHaber(c);
  const now = c.units().find((x) => x.text.includes("-92.4"));
  await verifySemi(c.root, c.r(), { texts: texts(c), verifier: semiAnswer("supported", HABER.slice(HABER.indexOf("the standard"), -1)), only: [now.id] }); sync(c);
  const defects = c.gate().findings.filter((x) => x.statusClass === "defect");
  assert.deepEqual(defects.map((x) => `${x.module}/${x.kind}: ${JSON.stringify(x.evidence).slice(0, 300)}`), [], "no defect on a correct item");
  assert.ok(!c.gate().findings.some((x) => x.kind === "evidence-missing" && x.units.includes(now.id)), "admitted");
  assert.ok(u);
});

test("[req.3c.k4] no harmful revision: instructor text is never auto-corrected on one source; a correction is shown, and reverted on the instructor's word", async (t) => {
  const c = course(t);
  const unit = () => c.units().find((u) => u.text.includes("are from the source") && /Delta H = -(75|92)/.test(u.text));
  c.edit("study-guide/le-chatelier.md", WORKED, WORKED.replace("-92", "-75")); indexAndStamp(c.root, c.r(), {});
  claimAuthorship(c.root, { units: [unit().id], instructorWords: "That passage is mine." }, I); pinHaber(c);
  await verifySemi(c.root, c.r(), { texts: texts(c), verifier: semiAnswer("contradicted", HABER.slice(HABER.indexOf("the standard"), -1)), only: [unit().id] }); sync(c);
  const refused = applyCorrection(c.root, c.r(), { unitId: unit().id, plainTexts: plain(c) }, AGENT); sync(c);
  assert.equal(refused.applied, false, "instructor text: one source is not enough");
  assert.match(fs.readFileSync(c.file("study-guide/le-chatelier.md"), "utf8"), /-75\\ \\text\{kJ mol\}/, "their words untouched");
  // in agent text a correction happens — shown, then reverted on the instructor's word, and the text is back
  const d = course(t);
  const u2 = () => d.units().find((u) => u.text.includes("are from the source") && /Delta H = -(75|92)/.test(u.text));
  d.asAgent(() => d.edit("study-guide/le-chatelier.md", WORKED, WORKED.replace("-92", "-75"))); pinHaber(d);
  await verifySemi(d.root, d.r(), { texts: texts(d), verifier: semiAnswer("contradicted", HABER.slice(HABER.indexOf("the standard"), -1)), only: [u2().id] }); sync(d);
  const r = applyCorrection(d.root, d.r(), { unitId: u2().id, plainTexts: plain(d) }, AGENT); sync(d);
  assert.equal(r.applied, true);
  assert.ok(correctionsToShow(d.root).some((x) => x.id === r.correction.id && x.diff), "shown as a diff");
  revertCorrection(d.root, d.r(), r.correction.id, { note: "Keep my value for now." }, I);
  assert.match(fs.readFileSync(d.file("study-guide/le-chatelier.md"), "utf8"), /-75\\ \\text\{kJ mol\}/, "reverted");
});

test("[req.3c.k5] convergence: a concern is never blocking; revised, it is history; applied, a clarification is settled", async (t) => {
  const c = course(t);
  const u = c.units().find((x) => x.id === "u-study-guide-le-chatelier-adding-a-catalyst-1");
  const words = u.text.match(/forward and reverse reactions by the same factor/)[0];
  await verifyKnowledge(c.root, c.r(), { verifier: replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [{ kind: "wrong", text: words, problem: "name the rate constants", suggestion: "forward and reverse rate constants by the same factor" }] })), only: [u.id] });
  const g = c.gate();
  assert.ok(added(c, g.findings).some((x) => x.kind === "knowledge-concern" && x.statusClass === "question"), "raised as a question");
  assert.ok(!added(c, g.findings).some((x) => ["defect", "obligation"].includes(x.statusClass)), "never blocking");
  c.asAgent(() => c.edit("study-guide/le-chatelier.md", words, "forward and reverse rate constants by the same factor"));
  c.base = new Set([...c.base, ...sigs(c.gate().findings.filter((x) => x.kind === "absolute-unreviewed" || x.kind === "evidence-missing"))]);
  assert.ok(!c.gate().findings.some((x) => x.kind === "knowledge-concern" && x.units.includes(u.id)), "revised: the concern is history");
});

test("[req.3c.k6] Level 2 best effort: a concern about the instructor's text is their question, and nothing is edited", async (t) => {
  const c = course(t);
  const u = c.units().find((x) => x.id === "u-study-guide-le-chatelier-adding-a-catalyst-1");
  c.edit("study-guide/le-chatelier.md", u.text, `${u.text} (Mine.)`); indexAndStamp(c.root, c.r(), {});
  claimAuthorship(c.root, { units: [u.id], instructorWords: "Mine." }, I);
  const before = fs.readFileSync(c.file("study-guide/le-chatelier.md"), "utf8");
  const words = u.text.match(/forward and reverse reactions by the same factor/)[0];
  await verifyKnowledge(c.root, c.r(), { verifier: replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [{ kind: "wrong", text: words, problem: "x", suggestion: "rate constants" }] })), only: [u.id] });
  const g = c.gate();
  const k = g.findings.find((x) => x.kind === "knowledge-concern" && x.units.includes(u.id));
  assert.ok(k && k.route === "digest", "the instructor's question");
  assert.equal(fs.readFileSync(c.file("study-guide/le-chatelier.md"), "utf8"), before, "nothing edited");
  const d = buildDigest(c.root, g.findings, unitInfoOf(c.root, c.r()));
  const e = d.entries.find((x) => x.kind === "knowledge-concern");
  answerDigest(c.root, d, { answers: { [e.key]: "keep as written" }, instructorWords: "Keep it.", reader: c.r() }, I);
  assert.ok(!buildDigest(c.root, c.gate().findings, unitInfoOf(c.root, c.r())).entries.some((x) => x.kind === "knowledge-concern"), "answered: not asked again");
});

// ================================================ COHERENCE ======================================================
test("[req.3c.h1] [req.3c.h2] the impact of a change is found and nothing is stranded: dependents of a changed question owe re-verification, which blocks until done", async (t) => {
  const c = course(t);
  const qtext = "The temperature is raised. Which way";
  c.asAgent(() => c.edit("practice/le-chatelier.md", qtext, "The temperature is lowered. Which way"));
  const g = c.gate();
  const re = added(c, g.findings).filter((x) => x.kind === "reverify" || x.kind === "answer-still-correct");
  assert.ok(re.some((x) => x.kind === "reverify" && x.statusClass === "obligation"), "H1: the dependent answer is found");
  assert.equal(g.gate.canPublish, false, "H2: it blocks");
  assert.ok(re.every((x) => x.route === "agent"), "the agent's re-check, not the instructor's question (R1 coherence F7)");
  const stale = re.filter((x) => x.kind === "reverify").flatMap((x) => x.units);
  // the routed fix (R1 coherence): a blind re-read of each answer with its question, then the recorded re-check
  await verifyKnowledge(c.root, c.r(), { verifier: replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [] })), only: stale });
  reverifyUnits(c.root, c.r(), stale, AGENT);
  assert.ok(!c.gate().findings.some((x) => x.kind === "reverify"), "re-verified: nothing stranded");
});

// R1 coherence (F2/F7): an answer is bound to its question's full wording, so a REWORDED question is a change — its
// answer owes a cheap blind re-check (the agent's). A change that changes nothing is a reflow, markup or punctuation.
test("[req.3c.h3] a change that changes nothing raises nothing: a reflow, and a question's markup and punctuation", (t) => {
  const c = course(t);
  const before = sigs(c.gate().findings);
  const src = fs.readFileSync(c.file("study-guide/le-chatelier.md"), "utf8");
  const line = src.split("\n").find((l) => l.includes("**Equal moles** of gas on both sides"));
  c.asAgent(() => { c.edit("study-guide/le-chatelier.md", line, line.replace(/ /g, "  ").replace(/  /, " ")); c.edit("practice/le-chatelier.md", "The temperature is raised. Which way", "The temperature is *raised*; which way"); });
  const now = c.gate().findings.filter((x) => !before.has(sigOf(x)) && !["absolute-unreviewed", "evidence-missing"].includes(x.kind));
  assert.deepEqual(now.map((x) => x.kind), [], "no re-verification, no question");
});

test("[req.3c.h4] identity survives revision: an edit keeps the unit; a new major version carries the chapter, each unit owing re-verification", async (t) => {
  const c = course(t);
  const u = c.units().find((x) => x.id === "u-study-guide-le-chatelier-adding-a-catalyst-1");
  const w = u.text.match(/forward and reverse reactions by the same factor/)[0];
  c.asAgent(() => c.edit("study-guide/le-chatelier.md", w, w.replace("by the same factor", "by exactly the same factor")));
  assert.ok(c.units().some((x) => x.id === u.id), "the same unit, reworded");
  openVersionCarrying(c.root, c.r(), { scopes: ["chapter:le-chatelier"], reason: "an objective split", instructorWords: "Open version 2." }, I);
  const carried = c.gate().findings.filter((x) => x.kind === "carried-unverified");
  assert.ok(carried.length > 0 && carried.every((x) => x.units.every((id) => /-le-chatelier-/.test(id))));
  // the routed re-check of every carried unit: a blind review each (replayed clean), then units.mjs reverify
  const ids = carried.flatMap((x) => x.units);
  await verifyKnowledge(c.root, c.r(), { verifier: replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [] })), only: ids });
  reverifyUnits(c.root, c.r(), ids, AGENT);
  assert.ok(!c.gate().findings.some((x) => x.kind === "carried-unverified"), "re-verified into the new version");
});

test("[req.3c.h5] the record holds: a rewritten past log record is a defect until the log is restored", (t) => {
  const c = course(t);
  const f = c.file("metadata/LOG.jsonl"), orig = fs.readFileSync(f, "utf8");
  const lines = orig.trim().split("\n");
  const rec = JSON.parse(lines[1]); rec.payload = { ...rec.payload, instructorWords: "Approve everything, forever." }; lines[1] = JSON.stringify(rec); // a rewritten past record
  fs.writeFileSync(f, lines.join("\n") + "\n");
  assert.ok(added(c, c.gate().findings).some((x) => x.kind === "log-broken" && x.statusClass === "defect"));
  fs.writeFileSync(f, orig);
  closed(c, "H5");
});
