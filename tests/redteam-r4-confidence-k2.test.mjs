// 3C RED TEAM, ROUND 4 — CONFIDENCE, the K2 mechanical check (computable content is checked). Every finding of the
// round's K2 lane, kept as a regression probe: the attack's own text, now caught (or, for a correct text, not raised),
// beside a control. Pure probes run the functions the gate calls; the gate probes plant the text through an agent
// session on the real course (tests/fixtures/c2-chemistry-v2) and run the real gate. Offline and deterministic. Record
// of the round: the red team's REPORT.md (P11 study, redteam-r4/confidence).
//
// Finding → probe (all fixed; none dismissed):
//   R4-K01 every link of a worked chain is compared, not only "arithmetic = literal" ............ [req.mechanical.recompute]
//   R4-K02 "\%" is read as the percent unit; one-sided % compared under both readings ........... [req.mechanical.recompute]
//   R4-K03 aligned/align/gather derivations ("&", "\\", \end{aligned}) and chains across spans .. [req.mechanical.recompute]
//   R4-K04 ion charges kept in every notation ("Ag+", "Cu^2+", \mathrm "^{3+}") ................. [req.mechanical.balance]
//   R4-K05 mhchem arrow conditions "->[Fe]" do not drop a species ................................ [req.mechanical.balance]
//   R4-K06 every reaction of a unit, plain or \ce, and Unicode subscripts, is read ............... [req.mechanical.balance]
//   R4-K07 an instructor's confirmation exempts the unit only at the text confirmed ............. [req.mechanical.recompute]
//   R4-K09 correct ionic equilibria (H+, NH4+, Fe^{3+}/SCN^{-}, [CoCl4]^2-) are not defects ...... [req.mechanical.balance]
//   R4-K10 "->[MnO2]", "->[\Delta]" and a balanced beta decay are not defects .................... [req.mechanical.balance]
//   R4-K11 an implicit product after "/" is skipped (counted), not guessed ....................... [req.mechanical.recompute]
//   R4-K12 one unit spelled two ways ("mol/L", "mol L^{-1}", "M") is compared .................... [req.mechanical.recompute]
//   and: what the check cannot read is counted (mechanicalCoverage), and C2 raises nothing ....... [req.mechanical.recompute]
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { confirmUnits, indexAndStamp, linkUnits, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { factHash } from "../scripts/lib/core/dependencies.mjs";
import { arithmeticMismatches, equationsIn, imbalanceOf, mechanicalCoverage, reactionsIn, speciesReadings, unbalancedEquations, unitMeaning, workedLinks } from "../scripts/lib/verify/mechanical.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const SG = "study-guide/le-chatelier.md";
const ANCHOR = "but it also slows the rate.";
const git = (root, ...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r4-k2-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  fs.cpSync(C2, root, { recursive: true }); fs.cpSync(INPUTS, inputs, { recursive: true });
  git(root, "init", "-q", "-b", "main"); git(root, "add", "-A"); git(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "baseline");
  const c = {
    root, r: () => liveReader(root),
    gate: () => runGate(root, { inputsDir: inputs }),
    units: () => loadUnits(root, liveReader(root)),
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent(fn) { beginSession(root, liveReader(root), AGENT); fn(); indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
  };
  /** The agent adds paragraphs after the temperature section's last sentence, linked like its neighbour. */
  c.add = (sentences) => {
    const neighbour = c.units().find((u) => u.text.includes(ANCHOR));
    c.asAgent(() => c.edit(SG, ANCHOR, `${ANCHOR}\n\n${sentences.join("\n\n")}`));
    const all = c.units(), ids = sentences.map((s) => all.find((x) => x.text === s.trim()).id);
    linkUnits(root, liveReader(root), Object.fromEntries(ids.map((id) => [id, neighbour.spineNodes])), AGENT);
    return ids;
  };
  return c;
}
const bad = (s) => arithmeticMismatches(s).length > 0;
const unb = (s) => unbalancedEquations(s).length > 0;

// ================================================ WORKED CHAINS ===================================================
test("[req.mechanical.recompute] R4-K01: every link of a worked chain is compared — arithmetic = arithmetic, and literal restatements", () => {
  // the attack: a wrong first step carried through a chain whose last link computes
  assert.deepEqual(arithmeticMismatches("Worked through, $Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3} = \\frac{0.40}{0.0027} = 148$."),
    [{ expression: "\\frac{(0.20)^2}{(0.10)(0.30)^3}", written: "\\frac{0.40}{0.0027}", recomputed: 14.8148 }]);
  // control: the same chain restated with rounded intermediates is not flagged (the restatement's inputs are rounded)
  assert.deepEqual(arithmeticMismatches("$Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3} = \\frac{0.040}{0.0027} = 14.8$"), []);
  assert.deepEqual(arithmeticMismatches("$x = \\frac{2.0}{3.0} \\times 6.0 = 0.667 \\times 6.0 = 4.0$"), []);
  // literal restatements: a re-rounding holds, a changed value does not
  assert.equal(bad("$x = 2.5 \\times 5.9 = 14.75 = 14.8$"), false);
  assert.equal(bad("$x = 2.5 \\times 5.9 = 14.75 = 1.48$"), true);
  // the one-link form is still caught (round 3)
  assert.equal(bad("$Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3} = 148$"), true);
});

test("[req.mechanical.recompute] R4-K02: a percent is read — \"\\%\" is the percent unit, and a one-sided % holds under either reading", () => {
  assert.deepEqual(arithmeticMismatches("The fraction of nitrogen converted is $\\frac{0.12}{0.50} \\times 100\\% = 2.4\\%$."), [{ expression: "\\frac{0.12}{0.50} \\times 100", written: "2.4", recomputed: 24 }]);
  for (const s of ["$\\frac{0.12}{0.50} \\times 100\\% = 24\\%$", "$\\frac{0.12}{0.50} = 24\\%$", "$\\frac{0.12}{0.50} \\times 100 = 24\\%$", "$\\frac{0.12}{0.50} = 0.24 = 24\\%$", "$x = \\frac{0.12}{0.50} \\times 100 = 24\\%$"])
    assert.deepEqual(arithmeticMismatches(s), [], s);
  assert.equal(bad("$\\frac{0.12}{0.50} = 2.4\\%$"), true, "neither 0.024 nor 2.4 is 0.24");
});

test("[req.mechanical.recompute] R4-K03: aligned/align/gather derivations and chains continued across spans are read", () => {
  const ALIGNED = "$$\\begin{aligned} Q_r &= \\frac{(0.20)^2}{(0.10)(0.30)^3} \\\\ &= 1.48 \\end{aligned}$$";
  assert.equal(bad(ALIGNED), true);
  assert.equal(bad(ALIGNED.replace("1.48", "14.8")), false);
  assert.equal(bad("$$\\begin{aligned} Q_r &= \\frac{(0.20)^2}{(0.10)(0.30)^3} = 1.48 \\end{aligned}$$"), true, "one line, \\end{aligned} on it");
  assert.equal(bad("\\[\\begin{align*} x &= 2 \\times 3 \\\\[4pt] &= 7 \\end{align*}\\]"), true);
  // gather: each line its own equation; a line that does not open with a relation starts a new chain
  assert.deepEqual(arithmeticMismatches("$$\\begin{gather} a = 2 \\times 3 = 6 \\\\ b = 4 + 4 = 8 \\end{gather}$$"), []);
  assert.equal(bad("$$\\begin{gather} a = 2 \\times 3 = 6 \\\\ b = 4 + 4 = 9 \\end{gather}$$"), true);
  // \sim and \approx are relations of the chain
  assert.equal(bad("$K \\sim 2.0 \\times 3.0 \\sim 60$"), true);
  // a chain split over two spans
  assert.equal(bad("so $Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3}$, which is $= 1.48$."), true);
  assert.equal(bad("so $Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3} =$ $1.48$."), true);
  assert.equal(bad("so $Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3}$, which is $= 14.8$."), false);
  // an inequality ends a chain (no comparison across it)
  assert.deepEqual(arithmeticMismatches("$Q_r = 12 < K = 50$"), []);
});

test("[req.mechanical.recompute] R4-K01/K11: what cannot be read is skipped and COUNTED — an implicit product after \"/\" is not guessed", () => {
  const S = "For this mixture $Q_r = (0.20)^2/(0.10)(0.30)^3 = 14.8$.";
  const w = workedLinks(S);
  assert.deepEqual(w.compared, [], "no precedence is guessed");
  assert.equal(w.skipped.length, 1);
  assert.match(w.skipped[0].reason, /implicit product after "\/"/);
  assert.equal(bad(S.replace("14.8", "0.0108")), false, "nor the other reading");
  // explicit forms are read
  assert.equal(bad("$Q_r = (0.20)^2/((0.10)(0.30)^3) = 1.48$"), true);
  assert.equal(bad("$x = \\ln 10 / 2 = 1.15$"), false);
  // other forms the reader does not evaluate are counted, never compared
  for (const [s, re] of [["$x = (0.20\\,\\text{M})^2 = 7$", /unit or e\^x/], ["$K = e^{2.0} = 7.39$", /unit or e\^x/], ["$x = \\sqrt[3]{27} = 4$", /does not evaluate/], ["$-3435\\ \\text{J} \\approx -3.4\\ \\text{kJ}$", /change of unit/]]) {
    const r = workedLinks(s);
    assert.deepEqual(r.compared, [], s);
    assert.equal(r.skipped.length, 1, s);
    assert.match(r.skipped[0].reason, re, s);
  }
  // a symbolic part is not a skipped link: nothing numeric to compare
  assert.deepEqual(workedLinks("$K = \\frac{[\\ce{NH3}]^{2}}{[\\ce{N2}][\\ce{H2}]^{3}} = 5$").skipped, []);
});

test("[req.mechanical.recompute] R4-K12: unit identity is semantic — mol/L, mol L^{-1} and M are one unit, so the link is compared", () => {
  assert.equal(unitMeaning("mol/L"), unitMeaning("mol L^-1"));
  assert.equal(unitMeaning("M"), unitMeaning("mol/L"));
  assert.equal(unitMeaning("J mol^-1 K^-1"), "joule^1 kelvin^-1 mole^-1");
  assert.equal(unitMeaning("J/mol K"), null, "an ambiguous denominator is not read, never misread");
  assert.notEqual(unitMeaning("kJ"), unitMeaning("J"));
  assert.deepEqual(arithmeticMismatches("For the ammonia solution, $c = \\frac{0.40}{2.0}\\ \\text{mol/L} = 0.020\\ \\text{mol L}^{-1}$."), [{ expression: "\\frac{0.40}{2.0}", written: "0.020", recomputed: 0.2 }]);
  assert.equal(bad("$c = \\frac{0.40}{2.0}\\ \\text{M} = 0.20\\ \\text{mol L}^{-1}$"), false);
  assert.equal(bad("$c = \\frac{0.40}{2.0}\\ \\text{M} = 0.020\\ \\text{mol/L}$"), true);
  // a real change of unit is still not converted
  assert.equal(workedLinks("$x = 2.0 \\times 3.0\\ \\text{kJ} = 6000\\ \\text{J}$").compared.length, 0);
});

// ================================================ EQUATION BALANCE ================================================
test("[req.mechanical.balance] R4-K04: ion charges are kept in every notation — Ag+, Cu^2+, ^{3+} in \\mathrm, Unicode superscripts", () => {
  assert.deepEqual(unbalancedEquations("Copper displaces silver from solution: $\\ce{Cu + Ag+ -> Cu^2+ + Ag}$."), [{ equation: "Cu + Ag+ -> Cu^2+ + Ag", element: "charge", left: 1, right: 2 }]);
  assert.deepEqual(unbalancedEquations("Zinc reduces iron(III): $\\mathrm{Zn + Fe^{3+} \\rightarrow Zn^{2+} + Fe^{2+}}$.").map((x) => [x.element, x.left, x.right]), [["charge", 3, 4]]);
  assert.equal(unb("Zn + Fe³⁺ → Zn²⁺ + Fe²⁺"), true);
  for (const s of ["$\\ce{Cu + 2 Ag+ -> Cu^2+ + 2 Ag}$", "$\\mathrm{Zn + 2Fe^{3+} \\rightarrow Zn^{2+} + 2Fe^{2+}}$", "Zn + 2 Fe³⁺ → Zn²⁺ + 2 Fe²⁺", "$\\ce{Fe^{3+} + e^{-} -> Fe^{2+}}$"])
    assert.deepEqual(unbalancedEquations(s), [], s);
  // a caret-less digit before a sign is read both ways; unbalanced only when no reading balances
  assert.deepEqual(speciesReadings("NH4+").map((r) => [r.atoms, r.charge]), [[{ N: 1, H: 4 }, 1], [{ N: 1, H: 1 }, 4]]);
  assert.equal(unb("Fe3+ + e- → Fe2+"), false);
  assert.equal(unb("Fe3+ + 2e- → Fe2+"), true);
});

test("[req.mechanical.balance] R4-K05/K10: mhchem arrow conditions are dropped, never a species", () => {
  assert.deepEqual(unbalancedEquations("Over the iron catalyst: $\\ce{N2 + 3 H2 ->[Fe] NH3}$.").map((x) => x.element), ["H"]);
  for (const s of ["$\\ce{2 KClO3 ->[MnO2] 2 KCl + 3 O2}$", "$\\ce{CaCO3 ->[\\Delta] CaO + CO2}$", "$\\ce{N2 + 3H2 <=>[\\text{Fe}][450 ^\\circ C] 2NH3}$", "$\\ce{2H2O ->[{[electrolysis]}] 2H2 ^ + O2 ^}$"]) {
    assert.equal(equationsIn(s).length, 1, s);
    assert.deepEqual(unbalancedEquations(s), [], s);
  }
  assert.equal(unb("$\\ce{KClO3 ->[MnO2] KCl + O2}$"), true);
});

test("[req.mechanical.balance] R4-K06: every reaction of a unit is read — a second plain one, Unicode subscripts", () => {
  const A = "Ammonia is made as $\\mathrm{N_2 + 3H_2 \\rightarrow 2NH_3}$ and then oxidised as $\\mathrm{NH_3 + O_2 \\rightarrow NO + H_2O}$.";
  assert.deepEqual(equationsIn(A).map((x) => x.raw), ["N2 + 3H2 → 2NH3", "NH3 + O2 → NO + H2O"]);
  assert.deepEqual(unbalancedEquations(A).map((x) => x.equation), ["NH3 + O2 → NO + H2O"]);
  assert.deepEqual(unbalancedEquations("In short: N₂ + H₂ → NH₃.").map((x) => [x.element, x.left, x.right]), [["H", 2, 3]]);
  assert.deepEqual(unbalancedEquations("In short: N₂ + 3H₂ → 2NH₃, then 4NH₃ + 5O₂ → 4NO + 6H₂O."), []);
  assert.equal(equationsIn("In short: N₂ + 3H₂ → 2NH₃, then 4NH₃ + 5O₂ → 4NO + 6H₂O.").length, 2);
  // a plain side that continues past what is read ("glucose + O2 → …") is skipped and counted, never half-read
  const r = reactionsIn("Respiration: glucose + O2 → CO2 + H2O.");
  assert.ok(r.length === 1 && r[0].unread, JSON.stringify(r));
  // prose and diagram arrows are no reactions
  assert.deepEqual(reactionsIn("**Decrease the volume** (raise the pressure) → the equilibrium shifts. A --> B, C -->|x| D"), []);
});

test("[req.mechanical.balance] R4-K09/K10: correct ionic equilibria, complexes and a beta decay are not defects; their unbalanced forms are", () => {
  const OK = ["Water itself ionises: $\\ce{H2O <=> H+ + OH-}$.", "Ammonia is a weak base in water: $\\ce{NH3 + H2O <=> NH4+ + OH-}$.",
    "The thiocyanate demonstration: $\\ce{Fe^{3+} + SCN^{-} <=> FeSCN^{2+}}$.", "The same: Fe³⁺ + SCN⁻ ⇌ FeSCN²⁺.",
    "The cobalt chloride demonstration: $\\ce{[Co(H2O)6]^2+ + 4Cl- <=> [CoCl4]^2- + 6H2O}$.",
    "Carbon-14 decays as $\\ce{^{14}_{6}C -> ^{14}_{7}N + ^{0}_{-1}e}$.", "$\\ce{^{238}_{92}U -> ^{234}_{90}Th + ^{4}_{2}He}$",
    "$\\ce{MnO4- + 8H+ + 5e- -> Mn^2+ + 4H2O}$", "$\\ce{CH3COOH + H2O <=> CH3COO- + H3O+}$", "$\\ce{Cu^{2+}(aq) + 4NH3(aq) <=> [Cu(NH3)4]^{2+}(aq)}$"];
  for (const s of OK) { assert.equal(equationsIn(s).length, 1, `read: ${s}`); assert.deepEqual(unbalancedEquations(s), [], s); }
  const BAD = [["$\\ce{H2O <=> H+ + OH}$", "charge"], ["$\\ce{NH3 + H2O <=> NH4+ + O-}$", "H"], ["$\\ce{Fe^{3+} + SCN^{-} <=> FeSCN^{+}}$", "charge"],
    ["$\\ce{[Co(H2O)6]^2+ + 2Cl- <=> [CoCl4]^2- + 6H2O}$", "Cl"], ["$\\ce{^{14}_{6}C -> ^{14}_{7}N + ^{0}_{1}e}$", "atomic number"], ["$\\ce{^{238}_{92}U -> ^{230}_{90}Th + ^{4}_{2}He}$", "mass number"]];
  for (const [s, el] of BAD) assert.equal(unbalancedEquations(s)[0]?.element, el, s);
  // a nuclide without its atomic number, or a species that does not parse, skips the equation — never "unbalanced"
  for (const s of ["$\\ce{^{14}C -> ^{14}N + e-}$", "$\\ce{\\alpha A + \\beta B <=> \\sigma S + \\tau T}$", "$\\ce{X + Y -> XY2}$", "$\\ce{Fe^{III} + e- -> Fe^{II}}$"]) {
    assert.deepEqual(unbalancedEquations(s), [], s);
    assert.ok(reactionsIn(s).every((r) => r.unread), s);
  }
  assert.equal(imbalanceOf({ left: { "Ag+": 1, Cu: 1 }, right: { "Cu^2+": 1, Ag: 1 } }).element, "charge");
});

// ================================================ THE GATE ========================================================
test("[req.mechanical.recompute] the real course raises nothing, and what the check could not read is counted", () => {
  const all = loadUnits(C2, liveReader(C2));
  const cov = mechanicalCoverage(all);
  assert.ok(cov.balanced >= 14 && cov.compared >= 1, JSON.stringify(cov));
  assert.ok(all.every((u) => !arithmeticMismatches(u.text).length && !unbalancedEquations(u.text).length));
  // the general form "αA + βB ⇌ σS + τT", a split "\ce{<=>}" and a kJ/J conversion: named, not passed in silence
  assert.deepEqual(cov.skipped.map((s) => s.what).sort(), ["reaction", "reaction", "reaction", "worked link"]);
  assert.ok(cov.skipped.some((s) => /change of unit/.test(s.reason)));
});

test("[req.mechanical.recompute] [req.mechanical.balance] R4-K01…K12 through the gate: the attacks block as defects routed to the agent; the correct forms raise nothing", (t) => {
  const c = course(t);
  const g0 = c.gate();
  assert.ok(!g0.findings.some((f) => /computation-mismatch|equation-unbalanced/.test(f.kind)), "the clean course raises none");
  assert.ok(g0.mechanical && g0.mechanical.skipped.length === 4, "the gate reports what it could not read");
  const ATTACKS = ["Worked through, $Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3} = \\frac{0.40}{0.0027} = 148$.",
    "The fraction of nitrogen converted is $\\frac{0.12}{0.50} \\times 100\\% = 2.4\\%$.",
    "$$\\begin{aligned} Q_r &= \\frac{(0.20)^2}{(0.10)(0.30)^3} \\\\ &= 1.48 \\end{aligned}$$",
    "Copper displaces silver from solution: $\\ce{Cu + Ag+ -> Cu^2+ + Ag}$.",
    "Over the iron catalyst: $\\ce{N2 + 3 H2 ->[Fe] NH3}$.",
    "In short: N₂ + H₂ → NH₃."];
  const CORRECT = ["Water itself ionises: $\\ce{H2O <=> H+ + OH-}$.", "Heating potassium chlorate over its catalyst: $\\ce{2 KClO3 ->[MnO2] 2 KCl + 3 O2}$.",
    "Carbon-14 decays as $\\ce{^{14}_{6}C -> ^{14}_{7}N + ^{0}_{-1}e}$.", "For this mixture $Q_r = (0.20)^2/(0.10)(0.30)^3 = 14.8$."];
  const ids = c.add([...ATTACKS, ...CORRECT]);
  const g = c.gate();
  const mech = g.findings.filter((f) => /computation-mismatch|equation-unbalanced/.test(f.kind));
  for (const [i, id] of ids.slice(0, ATTACKS.length).entries()) {
    const f = mech.find((x) => x.units.includes(id));
    assert.ok(f && f.statusClass === "defect" && f.route === "agent" && f.evidence.type === "computation", `attack ${i} caught: ${ATTACKS[i]}`);
  }
  for (const id of ids.slice(ATTACKS.length)) assert.ok(!mech.some((f) => f.units.includes(id)), `no false alert on ${id}`);
  assert.ok(g.mechanical.skipped.some((s) => s.unit === ids.at(-1) && /implicit product/.test(s.reason)), "the slash form is counted as not checked");
  assert.equal(g.gate.canPublish, false);
});

test("[req.mechanical.recompute] R4-K07: the instructor's confirmation of a deliberate wrong answer holds only at the text confirmed — any edit voids it", (t) => {
  const c = course(t);
  const EX = "Spot the error in this working: $Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3} = 1.48$.";
  const SOL = "This working is correct: $Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3} = 1.48$.";
  assert.equal(factHash(EX), factHash(SOL), "the attack's premise: the two texts share their facts");
  const [id] = c.add([EX]);
  const raised = () => c.gate().findings.some((f) => f.kind === "computation-mismatch" && f.units.includes(id));
  assert.ok(raised(), "the deliberate error is raised");
  confirmUnits(c.root, c.r(), [id], { what: "fact", instructorWords: "The 1.48 is deliberate: students are to find the slip in the exponent." }, I);
  assert.ok(!raised(), "confirmed at its text, it stands");
  c.asAgent(() => c.edit(SG, EX, SOL));
  assert.equal(c.units().find((u) => u.text === SOL)?.id, id, "the same unit, edited in place");
  assert.ok(raised(), "the edit voids the confirmation: the check re-raises");
});
