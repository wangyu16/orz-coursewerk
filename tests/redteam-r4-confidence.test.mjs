// 3C RED TEAM, ROUND 4 — CONFIDENCE (K1, K3–K6 lane): the round's value, sign and concern-currency findings, kept as
// regression probes on the real course (tests/fixtures/c2-chemistry-v2 + c2-chemistry inputs). Each probe replays the
// attack — the agent's edit, a replayed verifier answer through the real verdict path — and asserts it is now caught
// or refused, beside a control the harness must still admit or raise. Quotes are real pinned text (OpenStax Chemistry
// 2e 13.3). Offline and deterministic. Record of the round: the red team's REPORT.md (P11 study, redteam-r4/confidence).
//
// Finding → probe (all fixed; none dismissed):
//   R4-K08 a value written in words ("two thousand atmospheres") is a value: it owes evidence ..... [req.values.fail-closed]
//   R4-K14 "92.2 kJ of heat is released" reads −92.2 kJ (the verb carries the sign): admitted ...... [req.values.one-parser]
//   R4-K13 a correction never writes a signed number beside a sign verb: magnitude, or refused ... [req.correction.well-formed]
//   R4-K15 the newest review of the unit's current text speaks for it: a fixed concern is history [req.knowledge.settled-by-text]
//   R4-K16 whose text, before "applied": an agent's unasked edit of the instructor's text settles
//          nothing and is itself raised (clarify and wrong) ..................................... [req.knowledge.clarify]
//   R4-K17 open concerns travel with the text: a split or merge hands them to the pieces ........ [req.knowledge.travels]
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { indexAndStamp, linkUnits, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { beginSession, claimAuthorship } from "../scripts/lib/core/units_index.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { classifyUnit } from "../scripts/lib/core/segment.mjs";
import { wordsValue } from "../scripts/lib/core/values.mjs";
import { buildDigest, answerDigest } from "../scripts/lib/core/digest.mjs";
import { unitInfoOf } from "../scripts/lib/core/workflow.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { applyCorrection, verifyKnowledge, verifySemi } from "../scripts/lib/verify/verdicts.mjs";
import { checkableClaims, quantitiesIn } from "../scripts/lib/verify/claims.mjs";
import { fsInputReader, pinReference, pinnedTexts, syncReferenceRecord } from "../scripts/lib/verify/references.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };

const OPENSTAX_13_3 = "Most industrial production of ammonia uses the Haber-Bosch process based on the following equilibrium reaction:\n N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ \n The traits of this reaction present challenges to its use in an efficient industrial process. The equilibrium constant is relatively small ( K p on the order of 10 −5 at 25 °C), meaning very little ammonia is present in an equilibrium mixture. Also, the rate of this reaction is relatively slow at low temperatures.";
const PINS = { openstax133: { url: "https://openstax.org/books/chemistry-2e/pages/13-3-shifting-equilibria-le-chateliers-principle", title: "13.3 Shifting Equilibria", destination: "openstax.org/books/chemistry-2e", text: OPENSTAX_13_3 } };
const HABER_INTRO = "Most industrial production of ammonia uses the Haber-Bosch process based on the following equilibrium reaction:";
const AMMONIA_EQ_QUOTE = "N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ";
const SG = "study-guide/le-chatelier.md";
const ANCHOR = "but it also slows the rate.";

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r4-conf-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  fs.cpSync(C2, root, { recursive: true }); fs.cpSync(INPUTS, inputs, { recursive: true });
  return {
    root, inputs, r: () => liveReader(root),
    gate: () => runGate(root, { inputsDir: inputs }),
    units: () => loadUnits(root, liveReader(root)),
    unit: (id) => loadUnits(root, liveReader(root)).find((u) => u.id === id),
    read: (rel) => fs.readFileSync(path.join(root, rel), "utf8"),
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent(fn) { beginSession(root, liveReader(root), AGENT); fn(); indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    pin: (...names) => { for (const n of names) pinReference(root, inputs, PINS[n]); },
    texts: () => pinnedTexts(fsInputReader(inputs)),
    plain: () => new Map([...pinnedTexts(fsInputReader(inputs))].filter(([, v]) => v.ok).map(([k, v]) => [k, v.text])),
    sync: () => syncReferenceRecord(root, inputs),
  };
}
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];
const passagesOf = (pr) => pr.split("\nPASSAGES\n")[1].split("\n").map((l) => l.match(/^\[(\d+)\] (.*)$/)).filter(Boolean).map((m) => ({ n: Number(m[1]), text: m[2] }));
const claimCount = (pr) => pr.split("\nCLAIMS\n")[1].split("\n\nPASSAGES")[0].split("\n").filter((l) => /^\d+\. /.test(l)).length;
const semiReplay = (verdict, quotes) => replayVerifier((pr) => {
  const ps = passagesOf(pr);
  const qs = quotes.map((q) => { const p = ps.find((x) => x.text.includes(q)); return p ? { passage: p.n, text: q } : null; }).filter(Boolean);
  return { nonce: nonceOf(pr), claims: Array.from({ length: claimCount(pr) }, (_, i) => ({ claim: i + 1, verdict, quotes: qs, note: "replayed" })) };
});
const review = (concerns) => replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns }));
const mineOf = (g, ...ids) => g.findings.filter((f) => (f.units || []).some((id) => ids.includes(id)));
const kinds = (fs_) => fs_.map((f) => `${f.kind}:${f.statusClass}`).sort();
const raws = (text) => quantitiesIn(text).map((q) => q.raw);
const owes = (u) => classifyUnit({ form: "paragraph", text: u }).includes("semi-mechanical") && checkableClaims(u).length > 0;

function addParagraphs(c, sentences) {
  const neighbour = c.units().find((u) => u.text.includes(ANCHOR));
  c.asAgent(() => c.edit(SG, ANCHOR, `${ANCHOR}\n\n${sentences.join("\n\n")}`));
  const all = c.units(), ids = sentences.map((s) => all.find((x) => x.text === s.trim()).id);
  linkUnits(c.root, c.r(), Object.fromEntries(ids.map((id) => [id, neighbour.spineNodes])), AGENT);
  return ids;
}
async function addAndVerify(c, text, verdict) {
  c.pin("openstax133");
  const [id] = addParagraphs(c, [text]);
  const res = await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay(verdict, [HABER_INTRO, AMMONIA_EQ_QUOTE]), only: [id] });
  c.sync();
  const g = c.gate();
  return { c, u: c.unit(id), res, g, mine: mineOf(g, id) };
}

// ================================================ K1: VALUES IN WORDS ============================================
test("[req.values.fail-closed] R4-K08: a value written in words before a unit is read as its digits; it owes evidence and blocks — a small count of moles stays stoichiometry", (t) => {
  assert.deepEqual(raws("Industrial ammonia synthesis loops typically run at two thousand atmospheres."), ["2000atm"]);
  assert.deepEqual(raws("The reaction gives off nine hundred kilojoules per mole of nitrogen."), ["-900kJ/mol"]);
  assert.deepEqual(raws("a thousand kilojoules; twenty-five degrees Celsius; three hundred and five kelvins"), ["1000kJ", "25°C", "305K"]);
  assert.deepEqual(raws("The pressure is minus two hundred kPa."), ["-200kPa"]);
  assert.equal(wordsValue("two three"), null, "no number: two words in a row");
  // a count of moles in words is a coefficient, as in the equation, never a value (no false obligation on the course)
  assert.deepEqual(raws("Four moles of gas become two moles of gas."), []);
  for (const s of ["Industrial ammonia synthesis loops typically run at two thousand atmospheres.", "Forming ammonia from its elements releases nine hundred kilojoules per mole of nitrogen."])
    assert.ok(owes(s), `owes evidence: ${s}`);
  // through the gate: both sentences owe evidence (they were knowledge-based only and published)
  const c = course(t);
  const ids = addParagraphs(c, ["Industrial ammonia synthesis loops typically run at two thousand atmospheres.", "Forming ammonia from its elements releases nine hundred kilojoules per mole of nitrogen."]);
  for (const id of ids) assert.ok(c.unit(id).judgment.includes("semi-mechanical"), id);
  const g = c.gate();
  for (const id of ids) assert.ok(mineOf(g, id).some((f) => f.kind === "evidence-missing" && f.statusClass === "obligation"), `${id}: ${kinds(mineOf(g, id))}`);
  assert.equal(g.gate.canPublish, false);
});

// ================================================ K3/K4: A SIGN CARRIED BY A VERB ===============================
test("[req.values.one-parser] R4-K14: an energy a verb says is released reads negative, absorbed positive; a value bound to ΔH keeps its sign; the correct 'released' sentence is admitted", async (t) => {
  assert.deepEqual(raws("For the reaction, 92.2 kJ of heat is released."), ["-92.2kJ"]);
  assert.deepEqual(raws("The reaction releases about 92.2 kJ."), ["-92.2kJ"]);
  assert.deepEqual(raws("The heat released is 46.1 kJ/mol."), ["-46.1kJ/mol"]);
  assert.deepEqual(raws("Dissolving it absorbs 25 kJ; 25 kJ is taken in."), ["25kJ", "25kJ"]);
  assert.deepEqual(raws("ΔH = −92.2 kJ, so heat is released."), ["-92.2kJ"], "a value bound to ΔH keeps its written sign");
  assert.deepEqual(raws("−92.2 kJ of heat is released"), ["92.2kJ"], "negative heat released is heat absorbed, read literally");
  assert.deepEqual(raws("The flask releases 2.0 mol of gas."), ["2.0mol"], "only an energy takes a verb's sign");
  // the honest attack: the correct sentence, honestly supported by ΔH = −92.2 kJ, is admitted (was not-found, blocking)
  const ok = await addAndVerify(course(t), "For the Haber-Bosch reaction $\\ce{N2 + 3 H2 <=> 2 NH3}$, 92.2 kJ of heat is released, so heat is a product.", "supported");
  assert.equal(ok.res[0].status, "admitted", JSON.stringify(ok.res[0].perClaim));
  assert.ok(!ok.mine.some((f) => ["defect", "obligation"].includes(f.statusClass)), kinds(ok.mine).join());
  // and the opposite verb, honestly "supported" by the same quote, is not
  const no = await addAndVerify(course(t), "For the Haber-Bosch reaction $\\ce{N2 + 3 H2 <=> 2 NH3}$, 92.2 kJ of heat is absorbed, so heat is a reactant.", "supported");
  assert.notEqual(no.res[0].status, "admitted");
});

test("[req.correction.well-formed] R4-K13: a correction beside a sign verb writes the magnitude ('92.2 kJ … released'), takes a written sign away with the old number, and refuses a source of the opposite sign", async (t) => {
  const fix = async (sentence) => {
    const r = await addAndVerify(course(t), sentence, "contradicted");
    assert.ok(r.mine.some((f) => f.kind === "fact-contradicted"), `the wrong value is a defect: ${kinds(r.mine)}`);
    const out = applyCorrection(r.c.root, r.c.r(), { unitId: r.u.id, plainTexts: r.c.plain(), meta: r.c.texts() }, AGENT);
    return { ...r, out, after: r.c.units().find((x) => x.text.startsWith("For the Haber-Bosch reaction")) };
  };
  // the attack: "63.7 kJ of heat is released" was corrected to "−92.2 kJ of heat is released" (heat absorbed)
  const a = await fix("For the Haber-Bosch reaction $\\ce{N2 + 3 H2 <=> 2 NH3}$, 63.7 kJ of heat is released, so heat is a product.");
  assert.ok(a.out.applied, JSON.stringify(a.out.question));
  assert.match(a.after.text, /, 92\.2 kJ of heat is released, so heat/);
  assert.ok(!/[−-]\s*92\.2/.test(a.after.text), a.after.text);
  assert.deepEqual(raws(a.after.text), ["-92.2kJ"]);
  a.c.sync();
  assert.ok(!mineOf(a.c.gate(), a.after.id).some((f) => ["defect", "obligation"].includes(f.statusClass)));
  // a sign written beside the verb goes with the old number
  const b = await fix("For the Haber-Bosch reaction $\\ce{N2 + 3 H2 <=> 2 NH3}$, −63.7 kJ of heat is released, so heat is a product.");
  assert.ok(b.out.applied, JSON.stringify(b.out.question));
  assert.match(b.after.text, /, 92\.2 kJ of heat is released, so heat/);
  // the verb says the opposite of the source: the number alone cannot fix it — a question, the text left as it was
  const SENT = "For the Haber-Bosch reaction $\\ce{N2 + 3 H2 <=> 2 NH3}$, 63.7 kJ of heat is absorbed, so heat is a reactant.";
  const d = await fix(SENT);
  assert.equal(d.out.applied, false);
  assert.match(d.out.question.reason, /verb/);
  assert.equal(d.after.text, SENT);
});

// ================================================ K5: A FIXED CONCERN IS HISTORY =================================
test("[req.knowledge.settled-by-text] R4-K15: an error fixed at its cause with its quoted words kept is cleared by a clean fresh review of the new text — the newest review of the current text speaks for the unit", async (t) => {
  const S1 = "Adding an inert gas at constant volume increases the amount of ammonia at equilibrium.";
  const S2 = "Adding hydrogen at constant volume increases the amount of ammonia at equilibrium.";
  const W = "increases the amount of ammonia at equilibrium";
  const c = course(t);
  const [id] = addParagraphs(c, [S1]);
  const concerns = () => c.gate().findings.filter((f) => f.kind === "knowledge-concern" && f.units.includes(id));
  await verifyKnowledge(c.root, c.r(), { only: [id], verifier: review([{ kind: "wrong", text: W, problem: "An inert gas added at constant volume changes no partial pressure: no shift.", suggestion: "leaves the amount of ammonia at equilibrium unchanged" }]) });
  assert.equal(concerns().length, 1, "raised");
  c.asAgent(() => c.edit(SG, S1, S2));
  assert.equal(c.unit(id).text, S2, "the same unit, its error fixed");
  assert.equal(concerns().length, 1, "control: with no review of the new text, the concern still speaks");
  await verifyKnowledge(c.root, c.r(), { only: [id], verifier: review([]) });
  assert.equal(concerns().length, 0, "a clean fresh review of the current text clears it");
  // and the newest review of the current text speaks when it raises something
  await verifyKnowledge(c.root, c.r(), { only: [id], verifier: review([{ kind: "wrong", text: "Adding hydrogen at constant volume", problem: "test double: a later concern", suggestion: "" }]) });
  assert.deepEqual(concerns().map((f) => f.evidence.quote), ["Adding hydrogen at constant volume"]);
});

// ================================================ K6: WHOSE TEXT, BEFORE "APPLIED" ================================
test("[req.knowledge.clarify] R4-K16: on the instructor's text a suggestion the agent wrote in unasked settles nothing — the question stays theirs and the edit is raised; their 'apply' settles both (clarify and wrong)", async (t) => {
  const REL = "study-guide/chemical-equilibrium.md";
  const setup = async (concern) => {
    const c = course(t);
    c.edit(REL, "(products favoured), and a positive", "(products favoured), and so a positive"); indexAndStamp(c.root, c.r(), {}); // the instructor's own edit
    const id = c.units().find((u) => u.text.includes("(products favoured), and so a positive")).id;
    claimAuthorship(c.root, { units: [id], instructorWords: "That paragraph is mine." }, I);
    await verifyKnowledge(c.root, c.r(), { only: [id], verifier: review([concern]) });
    const ms8 = () => mineOf(c.gate(), id).filter((f) => f.module === "ms8-verdicts").map((f) => `${f.kind}:${f.route}`).sort();
    return { c, id, ms8 };
  };
  // a clarification of their text, written in by the agent with no answer
  const CLARIFY = { kind: "clarify", text: "(products favoured)", problem: "Correct as meant; 'favoured' may read as 'goes to completion'.", suggestion: "(products favoured at equilibrium)" };
  const a = await setup(CLARIFY);
  assert.deepEqual(a.ms8(), ["clarification-proposed:digest"]);
  a.c.asAgent(() => a.c.edit(REL, "(products favoured), and so", "(products favoured at equilibrium), and so"));
  assert.ok(a.c.unit(a.id).origin.revisedBy?.length, "the agent's revision of their text is on record");
  assert.deepEqual(a.ms8(), ["clarification-proposed:digest", "instructor-edit-unasked:digest"], "the question stays theirs, and the edit is raised");
  // the instructor accepts: settled (the suggestion is already in)
  const d = buildDigest(a.c.root, a.c.gate().findings, unitInfoOf(a.c.root, a.c.r()));
  assert.ok(d.entries.some((x) => x.kind === "instructor-edit-unasked"));
  answerDigest(a.c.root, d, { acceptAll: true, instructorWords: "Fine, apply it.", reader: a.c.r() }, I);
  assert.deepEqual(a.ms8(), [], "accepted: nothing open");
  // control: the same edit made by the agent AFTER the instructor accepted is the agent's job done (D35 (a))
  const b = await setup(CLARIFY);
  answerDigest(b.c.root, buildDigest(b.c.root, b.c.gate().findings, unitInfoOf(b.c.root, b.c.r())), { acceptAll: true, instructorWords: "Apply it.", reader: b.c.r() }, I);
  assert.deepEqual(b.ms8(), ["clarification-accepted:agent"]);
  b.c.asAgent(() => b.c.edit(REL, "(products favoured), and so", "(products favoured at equilibrium), and so"));
  assert.deepEqual(b.ms8(), []);
  // the "wrong" variant: a surgical rewrite of their words by the agent is no settlement either
  const WRONG = { kind: "wrong", text: "and so a positive", problem: "test double: the reviewer reads 'so' as a causal claim.", suggestion: "and a positive" };
  const w = await setup(WRONG);
  assert.deepEqual(w.ms8(), ["knowledge-concern:digest"]);
  w.c.asAgent(() => w.c.edit(REL, "(products favoured), and so a positive", "(products favoured), and a positive"));
  assert.deepEqual(w.ms8(), ["instructor-edit-unasked:digest", "knowledge-concern:digest"]);
  // control: on the agent's own text the same surgical rewrite settles it (held probe L2)
  const o = course(t);
  const S = "Adding an inert gas at constant volume increases the amount of ammonia at equilibrium.";
  const [oid] = addParagraphs(o, [S]);
  await verifyKnowledge(o.root, o.r(), { only: [oid], verifier: review([{ kind: "wrong", text: "increases the amount of ammonia at equilibrium", problem: "No shift.", suggestion: "leaves the amount of ammonia at equilibrium unchanged" }]) });
  o.asAgent(() => o.edit(SG, "increases the amount of ammonia at equilibrium", "leaves the amount of ammonia at equilibrium unchanged"));
  assert.deepEqual(mineOf(o.gate(), oid).filter((f) => f.module === "ms8-verdicts").map((f) => f.kind), []);
});

// ================================================ K6: CONCERNS TRAVEL WITH THE TEXT ==============================
test("[req.knowledge.travels] R4-K17: a reviewed unit split or merged hands its open concerns to the pieces holding the quoted words", async (t) => {
  const T = "Changing the total pressure by compressing a gas-phase mixture shifts the equilibrium toward the side with fewer moles of gas.";
  const W = "An inert gas added at constant volume shifts the equilibrium toward the side with fewer moles of gas.";
  const CONCERN = { kind: "wrong", text: W, problem: "At constant volume an inert gas changes no partial pressure, so the equilibrium does not shift.", suggestion: "An inert gas added at constant volume leaves the equilibrium unchanged." };
  const concernsOn = (c, ...ids) => c.gate().findings.filter((f) => f.kind === "knowledge-concern" && ids.some((id) => f.units.includes(id)));
  // the split: one blank line, no word changed
  const c = course(t);
  const [A] = addParagraphs(c, [`${T} ${W}`]);
  await verifyKnowledge(c.root, c.r(), { only: [A], verifier: review([CONCERN]) });
  assert.equal(concernsOn(c, A).length, 1, "raised");
  c.asAgent(() => c.edit(SG, `${T} ${W}`, `${T}\n\n${W}`));
  const a = c.units().find((u) => u.text === T), b = c.units().find((u) => u.text === W);
  assert.ok(a && b && !c.unit(A), "split: the reviewed id retired");
  assert.ok((b.lineage || []).includes(A), "the piece names the unit whose text it holds");
  assert.deepEqual(concernsOn(c, b.id).map((f) => f.evidence.quote), [W], "the concern travels with its words");
  assert.equal(concernsOn(c, a.id).length, 0, "the other piece does not hold them");
  // a clean fresh review of the piece holding the words clears it (R4-K15)
  await verifyKnowledge(c.root, c.r(), { only: [b.id], verifier: review([]) });
  assert.equal(concernsOn(c, b.id).length, 0);
  // the merge: the reviewed paragraph joined with its neighbour
  const m = course(t);
  const [X] = addParagraphs(m, [W, T]);
  await verifyKnowledge(m.root, m.r(), { only: [X], verifier: review([CONCERN]) });
  assert.equal(concernsOn(m, X).length, 1);
  m.asAgent(() => m.edit(SG, `${W}\n\n${T}`, `${W} ${T}`));
  const merged = m.units().find((u) => u.text === `${W} ${T}`);
  assert.ok(merged, "merged");
  assert.ok(merged.id === X || (merged.lineage || []).includes(X), `the merged unit is, or holds, the reviewed one (${merged.id}, ${JSON.stringify(merged.lineage)})`);
  assert.deepEqual(concernsOn(m, merged.id).map((f) => f.evidence.quote), [W], "the merged text keeps the concern on its words");
});
