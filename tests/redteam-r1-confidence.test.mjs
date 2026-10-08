// 3C RED TEAM, ROUND 1 — CONFIDENCE (K1–K6): every finding of the round, kept as a regression probe on the real course
// (tests/fixtures/c2-chemistry-v2 + c2-chemistry inputs). Each probe replays the attack — the agent's edit, a replayed
// verifier answer through the real verdict path, the instructor's digest answer — and asserts it is now caught or
// refused. Quotes are real pinned text: the excerpts below are verbatim from the pages the round pinned (OpenStax
// Chemistry 2e 13.3 and 16.4; Wikipedia "Ammonia", "Haber process", "Law of mass action", "Chemical equilibrium").
// Offline and deterministic. Record of the round: the red team's REPORT.md (P11 study, redteam/confidence).
//
// Finding → probe (all fixed; none dismissed):
//   F1  dimensionless value (K_p ~ 10^5 vs 10^-5) is a required token ........ [req.values.one-parser]
//   F2  mmHg, kcal, 10^32 per mole, "developed by Ostwald" are facts ........... [req.values.one-parser]
//   F3  "200,000 bar" is two hundred thousand, not 200.000 ..................... [req.values.one-parser]
//   F4  kJ per gram ≠ kJ/mol: denominators are part of the unit ................ [req.values.one-parser]
//   F5  a quote stating the opposite direction never supports ................. [req.support.predicate]
//   F6  a sentence-initial lone surname ("Arrhenius proposed") is a name ........ [req.support.predicate]
//   F7  scientific notation keeps its mantissa (9 × 10⁻⁶ ≠ 5 × 10⁻⁶) .............. [req.values.one-parser]
//   F8  an equation's reaction is required for support ......................... [req.support.predicate]
//   F9  stoichiometry and the quantity named are part of the reaction anchor .... [req.anchor.stoichiometry]
//   F10 a spaced/LaTeX minus is a minus; a correction never doubles a sign ...... [req.values.one-parser]
//   F11 a sentence naming two key terms still compares its value ................ [req.consistency.governing-term]
//   F12 a deletion-type fix is never "already applied" while the wrong words stand [req.knowledge.settled-by-text]
//   F13 a changed lead-in re-opens the equation's evidence through the routed fix  [req.evidence.lead-bound]
//   F14 "hypothetical" is trusted only for exercise-like units .................. [req.verdict.hypothetical-scope]
//   F15 an instructor's "change it" answer to a disputed fact is owed by the agent [req.answers.change-owed]
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { indexAndStamp, linkUnits, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { beginSession, claimAuthorship } from "../scripts/lib/core/units_index.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { answerDigest, buildDigest } from "../scripts/lib/core/digest.mjs";
import { unitInfoOf } from "../scripts/lib/core/workflow.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { applyCorrection, verifyKnowledge, verifySemi } from "../scripts/lib/verify/verdicts.mjs";
import { checkableClaims, namesIn, quantitiesIn } from "../scripts/lib/verify/claims.mjs";
import { fsInputReader, pinReference, pinnedTexts, syncReferenceRecord } from "../scripts/lib/verify/references.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const git = (root, ...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });

// ---- verbatim excerpts of the pages the round pinned ----------------------------------------------------------------
const OPENSTAX_13_3 = "Most industrial production of ammonia uses the Haber-Bosch process based on the following equilibrium reaction:\n N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ \n The traits of this reaction present challenges to its use in an efficient industrial process. The equilibrium constant is relatively small ( K p on the order of 10 −5 at 25 °C), meaning very little ammonia is present in an equilibrium mixture. Also, the rate of this reaction is relatively slow at low temperatures. To raise the yield of ammonia, the industrial process is designed to operate under conditions favoring product formation:\n High pressures (concentrations) of reactants are used, ~150−250 atm, to shift the equilibrium right, favoring product formation.\n Ammonia is continually removed (collected) from the equilibrium mixture during the process, lowering its concentration and also shifting the equilibrium right.";
const OPENSTAX_16_4 = "What is the free energy change for the process shown here under the specified conditions?\n T = 25 °C, P N 2 = 0.870 atm , P H 2 = 0.250 atm , and P NH 3 = 12.9 atm \n 2NH 3 ( g ) ⟶ 3H 2 ( g ) + N 2 ( g ) Δ G ° = 33.0 kJ/mol 2NH 3 ( g ) ⟶ 3H 2 ( g ) + N 2 ( g ) Δ G ° = 33.0 kJ/mol \n Solution\nThe equation relating free energy change to standard free energy change and reaction quotient may be used directly.";
const WIKI_AMMONIA = "Liquid ammonia possesses strong ionising powers reflecting its high ε of 22 at −35 °C (−31 °F). Liquid ammonia has a very high standard enthalpy change of vapourisation (23.5 kJ/mol; for comparison, water's is 40.65 kJ/mol, methane 8.19 kJ/mol and phosphine 14.6 kJ/mol) and can be transported in pressurised or refrigerated vessels.";
const WIKI_HABER = "Claude proposed to have three or four converters with liquefaction steps in series, thereby avoiding recycling. Most plants continue to use the original Haber process (20 MPa (200 bar; 2,900 psi) and 500 °C (932 °F)), albeit with improved single-pass conversion and lower energy consumption due to process and catalyst optimization.";
const WIKI_MASS_ACTION = "Two chemists generally expressed the composition of a mixture in terms of numerical values relating the amount of the product to describe the equilibrium state.\nCato Maximilian Guldberg and Peter Waage, building on Claude Louis Berthollet's ideas about reversible chemical reactions, proposed the law of mass action in 1864. These papers, in Danish, went largely unnoticed, as did the later publication (in French) of 1867 which contained a modified law and the experimental data on which that law was based.";
const WIKI_EQUILIBRIUM = "The composition of solutions containing reactants A and H is easy to calculate as a function of p[H]. When [H] is known, the free concentration [A] is calculated from the mass-balance equation in A.\nThe diagram alongside, shows an example of the hydrolysis of the aluminium Lewis acid Al3+(aq) shows the species concentrations for a 5 × 10−6 M solution of an aluminium salt as a function of pH. Each concentration is shown as a percentage of the total aluminium.";
const PINS = {
  openstax133: { url: "https://openstax.org/books/chemistry-2e/pages/13-3-shifting-equilibria-le-chateliers-principle", title: "13.3 Shifting Equilibria", destination: "openstax.org/books/chemistry-2e", text: OPENSTAX_13_3 },
  ammonia: { url: "https://en.wikipedia.org/wiki/Ammonia", title: "Ammonia", destination: "en.wikipedia.org", text: WIKI_AMMONIA },
  haber: { url: "https://en.wikipedia.org/wiki/Haber_process", title: "Haber process", destination: "en.wikipedia.org", text: WIKI_HABER },
  massAction: { url: "https://en.wikipedia.org/wiki/Law_of_mass_action", title: "Law of mass action", destination: "en.wikipedia.org", text: WIKI_MASS_ACTION },
  equilibrium: { url: "https://en.wikipedia.org/wiki/Chemical_equilibrium", title: "Chemical equilibrium", destination: "en.wikipedia.org", text: WIKI_EQUILIBRIUM },
};
const AMMONIA_EQ_QUOTE = "N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ";

const SG = "study-guide/le-chatelier.md";
const ANCHOR = "but it also slows the rate.";
const EQ = "u-study-guide-le-chatelier-changing-the-temperature-5";
const FIXTURE_EQ = "\\Delta H = -92\\ \\text{kJ mol}^{-1}$$";

/** A fresh copy of the real course, under git, with every reference of the round pinned. */
function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r1-conf-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  fs.cpSync(C2, root, { recursive: true }); fs.cpSync(INPUTS, inputs, { recursive: true });
  git(root, "init", "-q", "-b", "main"); git(root, "add", "-A"); git(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "baseline");
  const c = {
    root, inputs, r: () => liveReader(root),
    gate: () => runGate(root, { inputsDir: inputs }),
    units: () => loadUnits(root, liveReader(root)),
    unit: (id) => loadUnits(root, liveReader(root)).find((u) => u.id === id),
    read: (rel) => fs.readFileSync(path.join(root, rel), "utf8"),
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent: (fn) => { beginSession(root, liveReader(root), AGENT); fn(); indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    pin: (...names) => { for (const n of names) pinReference(root, inputs, PINS[n]); },
    texts: () => pinnedTexts(fsInputReader(inputs)),
    plain: () => new Map([...pinnedTexts(fsInputReader(inputs))].filter(([, v]) => v.ok).map(([k, v]) => [k, v.text])),
    sync: () => syncReferenceRecord(root, inputs),
  };
  return c;
}
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];
const passagesOf = (pr) => pr.split("\nPASSAGES\n")[1].split("\n").map((l) => l.match(/^\[(\d+)\] (.*)$/)).filter(Boolean).map((m) => ({ n: Number(m[1]), text: m[2] }));
const claimCount = (pr) => pr.split("\nCLAIMS\n")[1].split("\n\nPASSAGES")[0].split("\n").filter((l) => /^\d+\. /.test(l)).length;
/** A replayed semi verifier: every claim gets the verdict, quoting each snippet from the passage that holds it. */
const semiReplay = (verdict, quotes) => replayVerifier((pr) => {
  const ps = passagesOf(pr);
  const qs = quotes.map((q) => { const p = ps.find((x) => x.text.includes(q)); return p ? { passage: p.n, text: q } : null; }).filter(Boolean);
  return { nonce: nonceOf(pr), claims: Array.from({ length: claimCount(pr) }, (_, i) => ({ claim: i + 1, verdict, quotes: qs, note: "replayed" })) };
});
const mineOf = (g, id) => g.findings.filter((f) => (f.units || []).includes(id));
const blocking = (fs_) => fs_.filter((f) => ["defect", "obligation"].includes(f.statusClass));
const kinds = (fs_) => fs_.map((f) => `${f.kind}:${f.statusClass}`).sort();

/** The agent adds a paragraph after the temperature section's last sentence, linked like its neighbour; a replayed
 *  answer goes through the real verdict path. */
async function addAndVerify(c, sentence, verdict, quotes, pins) {
  c.pin(...pins);
  const neighbour = c.units().find((u) => u.text.includes(ANCHOR));
  c.asAgent(() => c.edit(SG, ANCHOR, `${ANCHOR}\n\n${sentence}`));
  const u = c.units().find((x) => x.text === sentence.trim());
  assert.ok(u, "the new unit is indexed");
  linkUnits(c.root, c.r(), { [u.id]: neighbour.spineNodes }, AGENT);
  const res = await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay(verdict, quotes), only: [u.id] });
  c.sync();
  const g = c.gate();
  return { u: c.unit(u.id), res, g, mine: mineOf(g, u.id) };
}
/** Refused: not admitted, no quote evidence, and the unit's evidence is still owed (blocking). */
function assertRefused({ u, res, g, mine }, why) {
  assert.equal(res.length, 1, `${why}: dispatched`);
  assert.notEqual(res[0].status, "admitted", `${why}: not admitted (${JSON.stringify(res[0].perClaim)})`);
  assert.ok(!(u.evidence || []).some((e) => e.type === "quote-verified"), `${why}: no quote evidence`);
  assert.ok(mine.some((f) => f.kind === "evidence-missing" && f.statusClass === "obligation"), `${why}: evidence still owed`);
  assert.equal(g.gate.canPublish, false, `${why}: blocks publishing`);
}
function assertAdmitted({ u, res, mine }, why) {
  assert.equal(res[0]?.status, "admitted", `${why}: ${JSON.stringify(res[0]?.perClaim)}`);
  assert.ok((u.evidence || []).some((e) => e.type === "quote-verified"), `${why}: evidenced`);
  assert.ok(!mine.some((f) => f.kind === "evidence-missing" || f.kind === "evidence-unsupported"), `${why}: nothing owed (${kinds(mine)})`);
}
const raws = (text) => quantitiesIn(text).map((q) => q.raw);

// ================================================ ONE VALUE PARSER ===============================================
test("[req.values.one-parser] F1: a dimensionless value bound to a symbol (K_p on the order of 10^5) is a required token; the source's 10^-5 does not carry it", async (t) => {
  assert.deepEqual(raws("$K_p$ on the order of $10^{5}$"), ["1e5"]);
  assert.deepEqual(raws("( K p on the order of 10 −5 at 25 °C)"), ["1e-5", "25°C"]);
  assert.deepEqual(raws("pH = 7, $K_c = 4.5$"), ["7", "4.5"]);
  const WRONG = "For the ammonia synthesis the equilibrium constant is relatively large ($K_p$ on the order of $10^{5}$ at 25 °C), meaning an equilibrium mixture is mostly ammonia.";
  const QUOTE = "The equilibrium constant is relatively small ( K p on the order of 10 −5 at 25 °C), meaning very little ammonia is present in an equilibrium mixture.";
  assertRefused(await addAndVerify(course(t), WRONG, "supported", [QUOTE], ["openstax133"]), "K_p 10^5 on a quote of 10^-5");
  // the honest sentence is admitted on the same quote
  const RIGHT = "For the ammonia synthesis the equilibrium constant is relatively small ($K_p$ on the order of $10^{-5}$ at 25 °C), meaning very little ammonia is present.";
  assertAdmitted(await addAndVerify(course(t), RIGHT, "supported", [QUOTE], ["openstax133"]), "K_p 10^-5");
});

test("[req.values.one-parser] F2: values in mmHg and kcal, a power of ten per mole, and a lone surname after 'by' are facts that owe evidence", (t) => {
  const WRONG = ["One standard atmosphere is 700 mmHg.", "The ammonia synthesis releases 52 kcal per mole of reaction.", "Avogadro's constant is about $6.022 \\times 10^{32}$ per mole.", "The industrial ammonia synthesis was developed by Ostwald."];
  const tokens = WRONG.map((s) => { const c = checkableClaims(s)[0]; return c ? [...c.required.quantities.map((q) => q.raw), ...c.required.names] : []; });
  // "releases 52 kcal" states ΔH = −52 kcal/mol: the verb carries the sign (red-team round 4, R4-K13/K14)
  assert.deepEqual(tokens, [["700mmHg"], ["-52kcal/mol"], ["6.022e32/mol", "Avogadro"], ["Ostwald"]]);
  assert.deepEqual(raws("212 °F, 1.5 V, 760 torr"), ["212°F", "1.5V", "760torr"], "the harness's own unit table");
  const c = course(t);
  const neighbour = c.units().find((u) => u.text.includes(ANCHOR));
  c.asAgent(() => c.edit(SG, ANCHOR, `${ANCHOR}\n\n${WRONG.join(" ")}`));
  const u = c.units().find((x) => x.text.startsWith("One standard atmosphere"));
  linkUnits(c.root, c.r(), { [u.id]: neighbour.spineNodes }, AGENT);
  assert.ok(c.unit(u.id).judgment.includes("semi-mechanical"), "judged semi-mechanical");
  assert.equal(checkableClaims(u.text).length, 4, "four checkable claims");
  const g = c.gate();
  assert.ok(mineOf(g, u.id).some((f) => f.kind === "evidence-missing" && f.statusClass === "obligation"), "owed");
  assert.equal(g.gate.canPublish, false);
});

test("[req.values.one-parser] F3: a thousands separator is read as one (200,000 bar is not carried by 200 bar)", async (t) => {
  assert.deepEqual(quantitiesIn("about 200,000 bar").map((q) => q.value), [200000]);
  // psi and hPa became units in red-team round 2 (R2-K05: a value in a unit form the table lacked owed no evidence)
  assert.deepEqual(quantitiesIn("2,900 psi and 1,013.25 hPa or 1,5 M").map((q) => q.value), [2900, 1013.25, 1.5], "thousands separators are read in every unit; a comma decimal stays a decimal");
  const QUOTE = "Most plants continue to use the original Haber process (20 MPa (200 bar; 2,900 psi) and 500 °C";
  assertRefused(await addAndVerify(course(t), "Most plants still use the original Haber process, run at about 200,000 bar and 500 °C.", "supported", [QUOTE], ["haber"]), "200,000 bar");
  assertAdmitted(await addAndVerify(course(t), "Most plants still use the original Haber process, run at about 200 bar and 500 °C.", "supported", [QUOTE], ["haber"]), "200 bar");
});

test("[req.values.one-parser] F4: a unit's denominator is part of it — kJ per gram is not kJ/mol", async (t) => {
  assert.deepEqual(raws("23.5 kJ per gram, 23.5 kJ/mol, 23.5 kJ g⁻¹, 23.5 kJ mol$^{-1}$, 23.5 kJ/kg, 8.314 J K^{-1} mol^{-1}"),
    ["23.5kJ/g", "23.5kJ/mol", "23.5kJ/g", "23.5kJ/mol", "23.5kJ/kg", "8.314J/K/mol"]);
  const QUOTE = "Liquid ammonia has a very high standard enthalpy change of vapourisation (23.5 kJ/mol";
  assertRefused(await addAndVerify(course(t), "Liquid ammonia has a very high standard enthalpy change of vapourisation, 23.5 kJ per gram.", "supported", [QUOTE], ["ammonia"]), "kJ per gram");
  assertAdmitted(await addAndVerify(course(t), "Liquid ammonia has a very high standard enthalpy change of vapourisation, 23.5 kJ per mole.", "supported", [QUOTE], ["ammonia"]), "kJ per mole");
});

test("[req.values.one-parser] F7: scientific notation keeps its mantissa, exactly (9 × 10⁻⁶ M is not 5 × 10⁻⁶ M)", async (t) => {
  for (const s of ["9 × 10−6 M", "9 × 10⁻⁶ M", "$9 \\times 10^{-6}$ M", "9e-6 M"]) assert.deepEqual(raws(s), ["9e-6M"], s);
  assert.equal(quantitiesIn("9 × 10⁻⁶ M")[0].value, 9e-6, "exact, never through a float-to-string round trip");
  const QUOTE = "hydrolysis of the aluminium Lewis acid Al3+(aq) shows the species concentrations for a 5 × 10−6 M solution of an aluminium salt";
  assertRefused(await addAndVerify(course(t), "The species diagram for the hydrolysis of the aluminium Lewis acid is drawn for a 9 × 10−6 M solution of an aluminium salt.", "supported", [QUOTE], ["equilibrium"]), "9e-6 M");
  assertAdmitted(await addAndVerify(course(t), "The species diagram for the hydrolysis of the aluminium Lewis acid is drawn for a 5 × 10⁻⁶ M solution of an aluminium salt.", "supported", [QUOTE], ["equilibrium"]), "5e-6 M");
});

test("[req.values.one-parser] F10: a spaced or LaTeX minus is a minus — the correct equation is evidenced, never 'contradicted', and a correction never doubles a sign", async (t) => {
  for (const s of ["\\Delta H = - 92.2\\ \\text{kJ}", "\\Delta H = -\\,92.2\\ \\text{kJ}", "\\Delta H = {-}92.2\\ \\text{kJ}", "ΔH = −92.2 kJ"]) assert.deepEqual(raws(s), ["-92.2kJ"], s);
  assert.deepEqual(raws("from 10 - 5 kJ"), ["5kJ"], "a minus after a number subtracts");
  const spaced = (c) => c.asAgent(() => c.edit(SG, FIXTURE_EQ, "\\Delta H = - 92.2\\ \\text{kJ}$$"));
  const a = course(t); a.pin("openstax133"); spaced(a);
  const honest = await verifySemi(a.root, a.r(), { texts: a.texts(), verifier: semiReplay("supported", [AMMONIA_EQ_QUOTE]), only: [EQ] });
  assert.equal(honest[0].status, "admitted", JSON.stringify(honest[0].perClaim));
  const c = course(t); c.pin("openstax133"); spaced(c);
  const r = await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay("contradicted", [AMMONIA_EQ_QUOTE]), only: [EQ] }); c.sync();
  assert.notEqual(r[0].status, "contradicted");
  assert.ok(!c.gate().findings.some((f) => f.kind === "fact-contradicted" && f.units.includes(EQ)), "no defect on the correct value");
  assert.equal(applyCorrection(c.root, c.r(), { unitId: EQ, plainTexts: c.plain(), meta: c.texts() }, AGENT).applied, false);
  assert.match(c.read(SG), /\\Delta H = - 92\.2\\ \\text\{kJ\}\$\$/, "untouched");
  // a real wrong value typeset with a spaced minus is corrected with ONE sign
  const d = course(t); d.pin("openstax133");
  d.asAgent(() => d.edit(SG, FIXTURE_EQ, "\\Delta H = - 57.2\\ \\text{kJ}$$"));
  await verifySemi(d.root, d.r(), { texts: d.texts(), verifier: semiReplay("contradicted", [AMMONIA_EQ_QUOTE]), only: [EQ] }); d.sync();
  const fix = applyCorrection(d.root, d.r(), { unitId: EQ, plainTexts: d.plain(), meta: d.texts() }, AGENT);
  assert.equal(fix.applied, true, JSON.stringify(fix.question));
  const line = d.read(SG).split("\n").find((l) => l.includes("2 NH3(g)}"));
  assert.deepEqual(raws(line), ["-92.2kJ"], line);
  assert.doesNotMatch(line, /-\s*−|−\s*-/, "no doubled sign");
});

// ================================================ PREDICATE SUPPORT ==============================================
test("[req.support.predicate] F5: a quote stating the opposite direction never supports (left vs right, reactants vs products)", async (t) => {
  const QUOTES = ["To raise the yield of ammonia, the industrial process is designed to operate under conditions favoring product formation:", "~150−250 atm, to shift the equilibrium right, favoring product formation"];
  const r = await addAndVerify(course(t), "To raise the yield of ammonia, pressures of about 250 atm are used to shift the equilibrium left, toward the reactants.", "supported", QUOTES, ["openstax133"]);
  assertRefused(r, "left on a quote saying right");
  assert.match(r.res[0].perClaim[0].reason, /opposite direction/);
  assertAdmitted(await addAndVerify(course(t), "To raise the yield of ammonia, pressures of about 250 atm are used to shift the equilibrium right, toward the products.", "supported", QUOTES, ["openstax133"]), "right");
});

test("[req.support.predicate] F6: a sentence-initial lone surname as the subject of an attribution is a name the quote must carry", async (t) => {
  assert.deepEqual(namesIn("Arrhenius proposed the law of mass action in 1864."), ["Arrhenius"]);
  assert.deepEqual(namesIn("Chemists proposed the law of mass action in 1864. They later published it."), [], "a generic agent or a function word is no name");
  const r = await addAndVerify(course(t), "Arrhenius proposed the law of mass action in 1864.", "supported", ["proposed the law of mass action in 1864"], ["massAction"]);
  assertRefused(r, "Arrhenius");
  assert.match(r.res[0].perClaim[0].reason, /Arrhenius|another name/);
});

test("[req.support.predicate] F8: an equation's reaction is a required token — a quote of another reaction's value never supports it", async (t) => {
  const c = course(t); c.pin("openstax133");
  const neighbour = c.units().find((u) => u.text.includes(ANCHOR));
  const LEAD = "Nitrogen monoxide forms from its elements in an exothermic reaction:";
  c.asAgent(() => c.edit(SG, ANCHOR, `${ANCHOR}\n\n${LEAD}\n\n$$\\ce{N2(g) + O2(g) <=> 2 NO(g)} \\qquad \\Delta H = -92.2\\ \\text{kJ}$$`));
  const lead = c.units().find((x) => x.text === LEAD), eq = c.units().find((x) => x.text.includes("2 NO(g)"));
  linkUnits(c.root, c.r(), { [lead.id]: neighbour.spineNodes, [eq.id]: neighbour.spineNodes }, AGENT);
  const res = await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay("supported", [AMMONIA_EQ_QUOTE]), only: [eq.id] }); c.sync();
  assertRefused({ u: c.unit(eq.id), res, g: c.gate(), mine: mineOf(c.gate(), eq.id) }, "N2 + O2 on the ammonia equation");
  assert.match(res[0].perClaim[0].reason, /reaction/);
  // the ammonia equation itself is admitted on the same quote
  const d = course(t); d.pin("openstax133");
  d.asAgent(() => d.edit(SG, FIXTURE_EQ, "\\Delta H = -92.2\\ \\text{kJ}$$"));
  const ok = await verifySemi(d.root, d.r(), { texts: d.texts(), verifier: semiReplay("supported", [AMMONIA_EQ_QUOTE]), only: [EQ] });
  assert.equal(ok[0].status, "admitted", JSON.stringify(ok[0].perClaim));
});

// ================================================ REACTION ANCHORING =============================================
test("[req.anchor.stoichiometry] F9: ½N2 + 3/2H2 → NH3 is not N2 + 3H2 ⇌ 2NH3 — the correct −46.1 kJ is not a defect and is never 'corrected'", async (t) => {
  const { anchored, reactionOf } = await import("../scripts/lib/verify/admission.mjs");
  assert.deepEqual(reactionOf("$$\\ce{1/2 N2(g) + 3/2 H2(g) -> NH3(g)}$$"), { left: ["H2", "N2"], right: ["NH3"] });
  const claim = checkableClaims("$$\\ce{1/2 N2(g) + 3/2 H2(g) -> NH3(g)} \\qquad \\Delta H = -46.1\\ \\text{kJ}$$")[0];
  const at = (Q) => anchored(claim, [{ source: "s", quote: Q, span: [0, Q.length] }], [{ claimed: claim.required.quantities[0].raw }]);
  assert.equal(at(AMMONIA_EQ_QUOTE), false, "the doubled equation does not anchor");
  assert.equal(at("½ N 2 ( g ) + 3/2 H 2 ( g ) ⟶ NH 3 ( g ) Δ G ° = −16.4 kJ"), false, "another quantity (ΔG°) does not anchor");
  assert.equal(at(OPENSTAX_16_4.match(/2NH 3 \( g \) ⟶ [^\n]*?kJ\/mol/)[0]), false, "the reverse reaction, as OpenStax 16.4 prints it, does not anchor");
  assert.equal(at("½ N 2 ( g ) + 3/2 H 2 ( g ) ⟶ NH 3 ( g ) Δ H = −45.9 kJ"), true, "the same equation and quantity does");
  const c = course(t); c.pin("openstax133");
  const neighbour = c.units().find((u) => u.text.includes(ANCHOR));
  const LEAD = "Per mole of ammonia formed, the same reaction reads:";
  c.asAgent(() => c.edit(SG, ANCHOR, `${ANCHOR}\n\n${LEAD}\n\n$$\\ce{1/2 N2(g) + 3/2 H2(g) -> NH3(g)} \\qquad \\Delta H = -46.1\\ \\text{kJ}$$`));
  const lead = c.units().find((x) => x.text === LEAD), eq = c.units().find((x) => x.text.includes("1/2 N2(g)"));
  linkUnits(c.root, c.r(), { [lead.id]: neighbour.spineNodes, [eq.id]: neighbour.spineNodes }, AGENT);
  const res = await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay("contradicted", [AMMONIA_EQ_QUOTE]), only: [eq.id] }); c.sync();
  assert.notEqual(res[0].status, "contradicted");
  assert.ok(!c.gate().findings.some((f) => f.kind === "fact-contradicted" && f.units.includes(eq.id)), "no defect on a correct value (K3)");
  const before = c.read(SG);
  assert.equal(applyCorrection(c.root, c.r(), { unitId: eq.id, plainTexts: c.plain(), meta: c.texts() }, AGENT).applied, false, "no harmful revision (K4)");
  assert.equal(c.read(SG), before);
});

// ================================================ CONSISTENCY ====================================================
test("[req.consistency.governing-term] F11: a second key term in a sentence does not hide a value disagreement", (t) => {
  const plant = (tail) => {
    const c = course(t);
    c.asAgent(() => {
      c.edit("slides/le-chatelier.md", "pushes the equilibrium away from the side where heat sits.", "pushes the equilibrium away from the side where heat sits. The ammonia synthesis is an exothermic reaction that releases 22 kcal.");
      c.edit("practice/le-chatelier.md", "falls at higher temperature.", `falls at higher temperature. The ammonia synthesis is an exothermic reaction that releases 11 kcal${tail}.`);
    });
    return c.gate().findings.filter((f) => f.kind === "value-disagreement" && f.statusClass === "defect");
  };
  assert.equal(plant("").length, 1, "control: one key term");
  const vd = plant(" over an iron catalyst");
  assert.equal(vd.length, 1, "a second key term (catalyst) does not silence it");
  assert.match(JSON.stringify(vd[0].evidence), /22 ?kcal.*11 ?kcal|11 ?kcal.*22 ?kcal/);
  assert.match(JSON.stringify(vd[0].evidence), /exothermic-reaction/, "compared under the term that governs the value");
});

// ================================================ SETTLING BY TEXT ===============================================
test("[req.knowledge.settled-by-text] F12: a 'wrong' concern whose fix is a deletion is never settled while the wrong words stand", async (t) => {
  const run = async (suggestion) => {
    const c = course(t);
    const WRONG = "forward and reverse reactions by the same factor and raises the yield.**";
    c.edit(SG, "forward and reverse reactions by the same factor.**", WRONG); indexAndStamp(c.root, c.r(), {}); // the instructor's own edit
    const u = c.units().find((x) => x.text.includes("by the same factor and raises the yield"));
    claimAuthorship(c.root, { units: [u.id], instructorWords: "That catalyst paragraph is mine." }, I);
    const before = c.read(SG);
    await verifyKnowledge(c.root, c.r(), { only: [u.id], verifier: replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [
      { kind: "wrong", text: "by the same factor and raises the yield", problem: "A catalyst does not change the equilibrium yield; it only speeds up reaching equilibrium.", suggestion }] })) });
    const g = c.gate();
    assert.equal(c.read(SG), before, "nothing edited");
    return g.findings.filter((f) => f.module === "ms8-verdicts" && f.kind === "knowledge-concern" && f.units.includes(u.id));
  };
  assert.equal((await run("by the same factor, leaving the yield unchanged")).length, 1, "control");
  const k = await run("by the same factor");
  assert.equal(k.length, 1, "the deletion is the instructor's question, not 'already applied'");
  assert.equal(k[0].route, "digest");
});

// ================================================ LEAD-IN BINDING ================================================
test("[req.evidence.lead-bound] F13: a rephrased lead-in re-opens the equation's evidence as an obligation the routed fix (verify semi) clears", async (t) => {
  const c = course(t); c.pin("openstax133");
  c.asAgent(() => c.edit(SG, FIXTURE_EQ, "\\Delta H = -92.2\\,\\text{kJ}$$"));
  const r1 = await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay("supported", [AMMONIA_EQ_QUOTE]), only: [EQ] }); c.sync();
  assert.equal(r1[0].status, "admitted", JSON.stringify(r1[0].perClaim));
  assert.ok((c.unit(EQ).evidence || []).some((e) => e.type === "quote-verified" && e.lead === "Take the Haber synthesis of ammonia, which is exothermic:"), "the evidence binds its lead-in");
  assert.deepEqual(kinds(blocking(mineOf(c.gate(), EQ))), []);
  c.asAgent(() => c.edit(SG, "Take the Haber synthesis of ammonia, which is exothermic:", "Consider the Haber synthesis of ammonia, which is exothermic:"));
  const g2 = mineOf(c.gate(), EQ);
  assert.ok(!g2.some((f) => f.kind === "evidence-unsupported"), "not a defect");
  assert.ok(g2.some((f) => f.kind === "evidence-missing" && f.route === "agent"), "an obligation the agent's routed fix clears");
  const r2 = await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay("supported", [AMMONIA_EQ_QUOTE]), only: [EQ] }); c.sync();
  assert.equal(r2.length, 1, "re-dispatched with the new lead-in");
  assert.equal(r2[0].status, "admitted");
  assert.deepEqual(kinds(blocking(mineOf(c.gate(), EQ))), [], "closed");
});

// ================================================ HYPOTHETICAL SCOPE =============================================
test("[req.verdict.hypothetical-scope] F14: 'hypothetical' on a real-world study-guide fact is no exercise data — never recommended 'confirm'", async (t) => {
  const r = await addAndVerify(course(t), "Most plants still run the original Haber process at about 900 °C.", "hypothetical", [], ["haber"]);
  assert.ok(!r.mine.some((f) => f.kind === "exercise-data-confirm"), "not asked as exercise data");
  assert.ok(r.mine.some((f) => f.kind === "evidence-missing" && f.statusClass === "obligation"), "evidence still missing");
  // control: a practice question's invented value is still the instructor's to confirm
  const c = course(t); c.pin("openstax133");
  const q = c.units().find((u) => u.id === "u-practice-chemical-equilibrium-questions-11");
  assert.match(q.text, /K = 50/);
  await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay("hypothetical", []), only: [q.id] });
  const g = c.gate();
  const asked = g.findings.find((f) => f.kind === "exercise-data-confirm" && f.units.includes(q.id));
  assert.ok(asked && asked.recommendation === "confirm", "exercise data in a question");
  const d = buildDigest(c.root, g.findings, unitInfoOf(c.root, c.r()));
  answerDigest(c.root, d, { acceptAll: true, instructorWords: "Accept all your recommendations.", reader: c.r() }, I);
  assert.ok(!mineOf(c.gate(), q.id).some((f) => f.kind === "evidence-missing"), "confirmed");
  // and accept-all on the study-guide fact confirms nothing
  const e = course(t);
  const s = await addAndVerify(e, "Most plants still run the original Haber process at about 900 °C.", "hypothetical", [], ["haber"]);
  const d2 = buildDigest(e.root, s.g.findings, unitInfoOf(e.root, e.r()));
  if (d2.entries.some((x) => x.recommendation != null)) answerDigest(e.root, d2, { acceptAll: true, instructorWords: "Accept all your recommendations.", reader: e.r() }, I);
  assert.ok(mineOf(e.gate(), s.u.id).some((f) => f.kind === "evidence-missing"), "still owed after accept-all");
  assert.equal(e.gate().gate.canPublish, false);
});

// ================================================ INSTRUCTOR CHANGE ANSWERS ======================================
test("[req.answers.change-owed] F15: the instructor's 'change it' answer to a disputed fact is owed by the agent, blocking, until the claim changes", async (t) => {
  const c = course(t);
  const REL = "study-guide/chemical-equilibrium.md";
  const U = () => c.units().find((u) => u.text.includes("law of mass action"));
  c.edit(REL, "when hardly any product forms.", "when hardly any product forms. Students should remember this picture."); indexAndStamp(c.root, c.r(), {});
  claimAuthorship(c.root, { units: [U().id], instructorWords: "I rewrote that paragraph; it is mine." }, I);
  const id = U().id;
  // a source that states 1865 admits the claim; a second pinned source states 1864: a dispute between sources
  const SOURCE_1865 = "Cato Maximilian Guldberg and Peter Waage published the law of mass action in 1865, relating the forward and the reverse rate of a reaction at equilibrium.";
  pinReference(c.root, c.inputs, { url: "https://example.org/history-of-mass-action", title: "History of mass action", destination: "example.org", text: SOURCE_1865 });
  const r = await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay("supported", [SOURCE_1865.slice(0, 120)]), only: [id] }); c.sync();
  assert.equal(r[0].status, "admitted", JSON.stringify(r[0].perClaim));
  c.pin("massAction");
  const g1 = c.gate();
  assert.ok(g1.findings.some((f) => f.kind === "fact-disputed" && f.units.includes(id)), "disputed: the instructor's question");
  assert.ok(!mineOf(g1, id).some((f) => ["evidence-missing", "instructor-change-owed"].includes(f.kind)), `evidenced; nothing owed yet (${kinds(mineOf(g1, id))})`);
  const d = buildDigest(c.root, g1.findings, unitInfoOf(c.root, c.r()));
  const e = d.entries.find((x) => x.kind === "fact-disputed" && x.units.includes(id));
  answerDigest(c.root, d, { answers: { [e.key]: "Change it to 1864, as the sources say." }, instructorWords: "Change it to 1864, as the sources say.", reader: c.r() }, I);
  const g2 = c.gate();
  const owed = mineOf(g2, id).filter((f) => f.kind === "instructor-change-owed");
  assert.equal(owed.length, 1, kinds(mineOf(g2, id)).join(", "));
  assert.equal(owed[0].statusClass, "obligation"); assert.equal(owed[0].route, "agent");
  assert.match(owed[0].evidence.what, /Change it to 1864/);
  assert.ok(mineOf(g2, id).some((f) => f.kind === "evidence-missing"), "the old evidence no longer counts for the claim");
  assert.equal(g2.gate.canPublish, false);
  assert.ok(!buildDigest(c.root, g2.findings, unitInfoOf(c.root, c.r())).entries.some((x) => x.kind === "fact-disputed" && x.units.includes(id)), "answered: not asked again");
  // the routed fix: the agent applies the change; the obligation is discharged by the text itself
  c.asAgent(() => c.edit(REL, "**law of mass action** (1865)", "**law of mass action** (1864)"));
  assert.ok(!mineOf(c.gate(), id).some((f) => f.kind === "instructor-change-owed"), "applied: nothing owed");
  // a "keep" answer owes nothing
  const k = course(t);
  k.edit(REL, "when hardly any product forms.", "when hardly any product forms. Students should remember this picture."); indexAndStamp(k.root, k.r(), {});
  const kid = k.units().find((u) => u.text.includes("law of mass action")).id;
  claimAuthorship(k.root, { units: [kid], instructorWords: "Mine." }, I);
  pinReference(k.root, k.inputs, { url: "https://example.org/history-of-mass-action", title: "History of mass action", destination: "example.org", text: SOURCE_1865 });
  await verifySemi(k.root, k.r(), { texts: k.texts(), verifier: semiReplay("supported", [SOURCE_1865.slice(0, 120)]), only: [kid] }); k.sync(); k.pin("massAction");
  const dk = buildDigest(k.root, k.gate().findings, unitInfoOf(k.root, k.r()));
  answerDigest(k.root, dk, { answers: { [dk.entries.find((x) => x.kind === "fact-disputed").key]: "keep as written" }, instructorWords: "Keep it.", reader: k.r() }, I);
  assert.ok(!mineOf(k.gate(), kid).some((f) => f.kind === "instructor-change-owed"));
});
