// 3C RED TEAM, ROUND 5 — CONFIDENCE, the readers (R5-K01…K08). ONE cause, not eight findings: the value parser, the
// K2 chain reader, the reaction reader and the classifier each recognised a closed set of forms, and a form they never
// began to read was neither checked nor counted (a false value or a wrong computation published), while a form read
// halfway raised a false alarm. The fix is one principle — never pass silently, never guess:
//   1. candidates are found with a WIDE net, then read fully or recorded as unread;
//   2. an unread VALUE makes its sentence owe evidence (fail closed, K1); an unread COMPUTATION or REACTION is counted in
//      the gate's `notChecked`, with its form and reason;
//   3. joining and splitting follow the text: a chain is carried by its symbol, an "=" opening a span continues the
//      previous span only across whitespace or a connective, and a range is read with both ends;
//   4. half-read is skipped, not judged: a unit on one side only, schematic letters.
// Pure probes run the functions the gate calls; gate probes plant text through an agent session on the real course
// (tests/fixtures/c2-chemistry-v2) and run the real gate. Offline and deterministic. Every finding's own text is
// probed, and NEW variants of the cause (other notations, spellings and layouts) beside it.
//
// Finding → probe:
//   R5-K01 "2,000-atmosphere", "9 hundred kJ", "K is about one hundred", "a pH of seven" owe evidence ... [req.values.fail-closed]
//   R5-K02 a range is read with both ends ................................................. [req.values.one-parser]
//   R5-K03 a chain carried by its symbol across spans is compared .......................... [req.mechanical.recompute]
//   R5-K04 reactions in the house notation (H~2~O, Cu^2+^) are balanced ..................... [req.mechanical.balance]
//   R5-K05 arithmetic outside math delimiters is compared, or counted ...................... [req.mechanical.recompute]
//   R5-K06 a unit on the result only is not "the same unit": half-read, skipped and counted [req.mechanical.recompute]
//   R5-K07 schematic letter reactions ("S → P", "2B ⇌ C") are skipped and counted ......... [req.mechanical.balance]
//   R5-K08 an "=" opening a span joins the previous span only across a connective ......... [req.mechanical.recompute]
//   corpus: the real course raises no false alarm, and its notChecked count is stated ...... [req.mechanical.recompute]
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { indexAndStamp, linkUnits, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { classifyUnit } from "../scripts/lib/core/segment.mjs";
import { statesValue, unreadValues, valueText, valuesIn } from "../scripts/lib/core/values.mjs";
import { checkableClaims, quantitiesIn } from "../scripts/lib/verify/claims.mjs";
import { conflicts, sameAtPrecision } from "../scripts/lib/verify/admission.mjs";
import { arithmeticMismatches, mechanicalCoverage, reactionsIn, unbalancedEquations, workedLinks } from "../scripts/lib/verify/mechanical.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const SG = "study-guide/le-chatelier.md";
const ANCHOR = "but it also slows the rate.";
const git = (root, ...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });

const owes = (t) => classifyUnit({ form: "paragraph", text: t }).includes("semi-mechanical") && checkableClaims(t).length > 0;
const required = (t) => checkableClaims(t).flatMap((c) => c.required.quantities.map((q) => q.raw));
const values = (t) => valuesIn(valueText(t)).map((v) => v.raw);
const bad = (s) => arithmeticMismatches(s).length > 0;
const unb = (s) => unbalancedEquations(s).length > 0;
const skips = (s) => workedLinks(s).skipped;
const silent = (s) => { const w = workedLinks(s); return !w.compared.length && !w.skipped.length; };

// ================================================ K1: VALUES ======================================================
test("[req.values.fail-closed] R5-K01: the four spellings of the finding are values and owe evidence", () => {
  assert.deepEqual(values("Industrial ammonia plants typically run 2,000-atmosphere synthesis loops."), ["2,000atm"]);
  assert.deepEqual(values("Forming ammonia from its elements releases about 9 hundred kilojoules per mole of nitrogen."), ["-900kJ/mol"], "the sign verb still applies");
  assert.deepEqual(values("For the ammonia synthesis at room temperature the equilibrium constant K is about one hundred."), ["100"]);
  assert.deepEqual(values("Pure water has a pH of seven."), ["7"]);
  for (const t of ["Industrial ammonia plants typically run 2,000-atmosphere synthesis loops.", "Forming ammonia from its elements releases about 9 hundred kilojoules per mole of nitrogen.",
    "For the ammonia synthesis at room temperature the equilibrium constant K is about one hundred.", "Pure water at room temperature has a pH of seven."])
    assert.ok(owes(t), t);
});

test("[req.values.fail-closed] R5-K01 variants: hyphens, scale words and symbol words in other spellings", () => {
  for (const [t, v] of [
    ["The loop runs at a two-thousand-atmosphere pressure.", "2000atm"],
    ["The reactor holds a 200-bar charge.", "200bar"],
    ["The synthesis loop runs near 1.5 million pascals.", "1500000Pa"],
    ["The cell needs 2 thousand kilojoules per mole.", "2000kJ/mol"],
    ["The equilibrium constant Kc is roughly fifty at this temperature.", "50"],
    ["The equilibrium constant K_p equals twenty-five here.", "25"],
    ["The buffer keeps a pH of about nine.", "9"],
    ["The flask holds a 250-mL sample.", "250mL"],
  ]) { assert.ok(values(t).includes(v), `${t} → ${values(t)}`); assert.ok(owes(t), t); }
  // a candidate that cannot be read without a guess is NOT read — but its sentence still owes evidence (fail closed)
  for (const t of ["Industrial synthesis loops run at several thousand atmospheres.", "Combustion of the fuel releases hundreds of kilojoules.",
    "The equilibrium constant K for this reaction reaches 100 at room temperature."]) {
    assert.equal(values(t).length, 0, t);
    assert.ok(unreadValues(valueText(t)).length > 0, `unread candidate: ${t}`);
    assert.ok(statesValue(t) && owes(t), `owes evidence: ${t}`);
    assert.ok(quantitiesIn(t).some((q) => q.unread && q.unit === "unread" && Number.isNaN(q.value)), t);
  }
});

test("[req.values.fail-closed] R5-K01 controls: counts, labels, determiners and kelvin are not value candidates", () => {
  for (const t of ["Decreasing the volume shifts it toward the 2-mole side.", "The reactant side has four moles of gas.", "The K of one reaction is larger than the other.",
    "See step 2 for the K of the reverse reaction.", "At 298 K the value is listed in the table."])
    assert.equal(unreadValues(valueText(t)).length, 0, t);
  assert.deepEqual(values("Decreasing the volume shifts it toward the 2-mole side."), []);
  assert.deepEqual(values("At 298 K the value is listed in the table."), ["298K"]);
});

test("[req.values.fail-closed] an unread candidate is carried by a quote with the same figure, and never anchors a contradiction", () => {
  const claim = checkableClaims("The equilibrium constant K for this reaction reaches 100 at room temperature.")[0];
  const q = claim.required.quantities.find((x) => x.unread);
  assert.ok(q && q.key === "100");
  const same = quantitiesIn("For this reaction K reaches 100 at room temperature.").find((x) => x.unread);
  assert.ok(same && sameAtPrecision(q, same), "the same figure carries it");
  assert.equal(sameAtPrecision(q, { ...same, key: "10" }), false);
  assert.equal(sameAtPrecision(q, { value: 100, unit: "1", decimals: 0, exp: 0 }), false, "a read value is not the unread token");
  assert.deepEqual(conflicts(claim, ["For this reaction K reaches 10 at room temperature."]).filter((c) => c.dimension === "quantity"), []);
});

test("[req.values.one-parser] R5-K02: a range is read with BOTH ends, in every spelling", () => {
  const S = "With a catalyst, industrial ammonia plants run at relatively moderate temperatures, between 40 and 500 °C.";
  assert.deepEqual(required(S), ["40°C", "500°C"]);
  assert.deepEqual(values("relatively moderate temperatures (400−500 °C)"), ["400°C", "500°C"], "the source's range too");
  // the attack's quote carries 400 and 500, not 40: the lower end is now a token the quote must carry
  assert.ok(!quantitiesIn("relatively moderate temperatures (400−500 °C)").some((s) => sameAtPrecision(checkableClaims(S)[0].required.quantities[0], s)));
  for (const [t, v] of [["Plants run at 40–500 °C.", ["40°C", "500°C"]], ["Plants run from 40 to 500 °C.", ["40°C", "500°C"]], ["Plants run at 40-500 °C.", ["40°C", "500°C"]],
    ["The bath runs from −10 to 25 °C.", ["-10°C", "25°C"]], ["Pressures of 150 or 300 atm are typical.", ["150atm", "300atm"]], ["Pressures go from 150 through 300 bar.", ["150bar", "300bar"]],
    ["A 2–3 kJ change.", ["2kJ", "3kJ"]]])
    assert.deepEqual(values(t), v, t);
  // controls: a subtraction with spaces, a year, a label and two written units are not a range end
  assert.deepEqual(values("Haber reported it in 1913 and 200 atm was used."), ["200atm"]);
  assert.deepEqual(values("See figure 3 and 500 °C."), ["500°C"]);
  assert.deepEqual(values("It ran at 40 °C and 500 °C."), ["40°C", "500°C"]);
});

// ================================================ K2/K3: CHAINS ===================================================
test("[req.mechanical.recompute] R5-K03: a chain carried by its symbol across spans is compared", () => {
  assert.deepEqual(arithmeticMismatches("So $Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3}$, and therefore $Q_r = 148$, so the reaction runs in reverse."),
    [{ expression: "\\frac{(0.20)^2}{(0.10)(0.30)^3}", written: "148", recomputed: 14.8148 }]);
  assert.equal(bad("For two moles of ammonia, $\\Delta H_2 = 2 \\times (-46.1)$; that is, $\\Delta H_2 = -9.22$."), true);
  // variants: other delimiters, a subject spelled with braces, display maths, words between
  assert.equal(bad("So \\(Q_{r} = \\frac{(0.20)^2}{(0.10)(0.30)^3}\\). Working it out, we find \\(Q_r = 148\\)."), true);
  assert.equal(bad("$$x = \\frac{3.0 \\times 4.0}{2.0}$$ Evaluating the fraction gives $$x = 60$$"), true);
  assert.equal(bad("Then $[\\ce{H+}] = \\sqrt{1.8 \\times 10^{-5} \\times 0.10}$, so $[\\ce{H+}] = 1.3 \\times 10^{-2}$."), true);
  // correct carried chains raise nothing; a chain whose first span already states a value is never joined
  assert.equal(bad("So $Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3}$, and therefore $Q_r = 14.8$."), false);
  assert.ok(silent("Initially $[A] = 0.10$; at equilibrium $[A] = 0.05$."), "two states of one quantity are not one chain");
  assert.ok(silent("At first $x = 2.0$, and after the change $x = 3.0 \\times 2.0$."), "the earlier chain states a value: not joined");
});

test("[req.mechanical.recompute] R5-K08: an \"=\" opening a span continues the previous span only across a connective", () => {
  assert.deepEqual(arithmeticMismatches("With $Q_c = 50.0$, the quotient for the reverse reaction $= 1/50.0 = 0.0200$."), []);
  assert.deepEqual(workedLinks("With $Q_c = 50.0$, the quotient for the reverse reaction $= 1/50.0 = 0.0200$.").compared.map((x) => x.ok), [true], "the new chain is still read");
  assert.deepEqual(arithmeticMismatches("Squaring gives $Q^2 = 2500$, and its square root $= 50$."), []);
  assert.deepEqual(arithmeticMismatches("Here $a = 4.0$; the reciprocal of a $= 1/4.0 = 0.25$."), []);
  // the connective forms still continue (R4-K03): whitespace, "which is", "so", "that is"
  assert.equal(bad("We get $Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3}$ $= 1.48$."), true);
  assert.equal(bad("so $Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3}$, which is $= 1.48$."), true);
  assert.equal(bad("$x = 2.0 \\times 3.0$, that is, $= 7.0$."), true);
  assert.equal(bad("$x = 2.0 \\times 3.0$ and so $= 6.0$."), false);
});

test("[req.mechanical.recompute] R5-K05: arithmetic in prose is compared — and what is half-read is counted, not guessed", () => {
  assert.deepEqual(arithmeticMismatches("Plugging in, (0.20)^2 / ((0.10) × (0.30)^3) = 148, so the reaction quotient is large and the reaction runs in reverse."),
    [{ expression: "(0.20)^2 / ((0.10) × (0.30)^3)", written: "148", recomputed: 14.8148 }]);
  // variants: ÷, ≈, e-notation, a unit of the table on the result, a lead-in of words
  assert.equal(bad("The ratio is 12 ÷ 4 = 4."), true);
  assert.equal(bad("So the answer is 2.0 × 3.0 ≈ 7.0 here."), true);
  assert.equal(bad("Kp = 0.5 × (0.0821 × 700)^-2 = 1.5e-3 at that temperature."), true);
  assert.equal(bad("The heat is 2 × 46.1 = 9.22 kJ."), true);
  // correct prose arithmetic raises nothing
  for (const s of ["The ratio is 12 ÷ 4 = 3.", "Kp = 0.5 × (0.0821 × 700)^-2 = 1.5e-4 at that temperature.", "The heat is 2 × 46.1 = 92.2 kJ.", "Plugging in, (0.20)^2 / ((0.10) × (0.30)^3) = 14.8, so it runs in reverse."])
    assert.deepEqual(arithmeticMismatches(s), [], s);
  // words or units inside the arithmetic: unread, COUNTED with the form
  const w = workedLinks("Thus 8.314 J × 298 K = 2478 J for one mole.");
  assert.equal(w.compared.length, 0);
  assert.equal(w.skipped.length, 1);
  assert.match(w.skipped[0].reason, /prose/);
  // not computations: a ratio, a value statement, a conversion fact, a markdown link, code
  for (const s of ["Mix them in a ratio of 2:1 = 2 parts.", "At equilibrium, pH = 7.0 at 25 °C.", "Recall 1 atm = 760 mmHg.", "See [x=2](https://e.org/?a=1+2=4).", "Run `x = 2 + 2 = 5` in the shell."])
    assert.equal(bad(s), false, s);
});

test("[req.mechanical.recompute] R5-K06: a unit on the result only is half-read — skipped and counted when a change of unit explains it", () => {
  for (const s of ["The thermal energy scale at room temperature is $RT = 8.314 \\times 298 = 2.48\\ \\text{kJ/mol}$.",
    "With $K = 6.0 \\times 10^{5}$ at 298 K, $\\Delta G^\\circ = -(8.314)(298)\\ln(6.0 \\times 10^{5}) = -33\\ \\text{kJ/mol}$.",
    "The mass is $m = 2.5 \\times 400 = 1.0\\ \\text{kg}$."]) {
    assert.deepEqual(arithmeticMismatches(s), [], s);
    assert.ok(skips(s).some((k) => /one side only/.test(k.reason)), `counted: ${s}`);
  }
  // in the written unit it still computes: compared; under no reading: a mismatch (the attack is not hidden)
  assert.deepEqual(workedLinks("$\\Delta H = 2 \\times (-46.1) = -92.2\\ \\text{kJ}$").compared.map((x) => x.ok), [true]);
  assert.equal(bad("$\\Delta H = 2 \\times (-46.1) = -9.22\\ \\text{kJ}$"), true);
  assert.equal(bad("$RT = 8.314 \\times 298 = 3.48\\ \\text{kJ/mol}$"), true);
  // both sides written: a change of unit is skipped as before
  assert.ok(skips("$RT = 8.314 \\times 298\\ \\text{J/mol} = 2.48\\ \\text{kJ/mol}$").some((k) => /change of unit/.test(k.reason)) || !bad("$RT = 8.314 \\times 298\\ \\text{J/mol} = 2.48\\ \\text{kJ/mol}$"));
});

// ================================================ K2/K3: REACTIONS ================================================
test("[req.mechanical.balance] R5-K04: reactions in the house notation are read and balanced", () => {
  assert.deepEqual(unbalancedEquations("Hydrogen burns in oxygen: H~2~ + O~2~ → H~2~O."), [{ equation: "H2 + O2 → H2O", element: "O", left: 2, right: 1 }]);
  assert.deepEqual(unbalancedEquations("Copper metal displaces silver from solution: Cu + Ag^+^ → Cu^2+^ + Ag."), [{ equation: "Cu + Ag^+ → Cu^2+ + Ag", element: "charge", left: 1, right: 2 }]);
  // variants: states, polyatomic ions, an equilibrium arrow, an ASCII arrow
  assert.equal(unb("Water evaporates: H~2~O~(l)~ → H~2~O~(g)~ + O~2~."), true);
  assert.equal(unb("Barium sulfate precipitates: Ba^2+^ + SO~4~^2-^ → BaSO~4~ + e^-^."), true);
  assert.equal(unb("Ammonia forms: N~2~ + H~2~ ⇌ NH~3~."), true);
  assert.equal(unb("Ammonia forms: N~2~ + 3H~2~ -> NH~3~."), true);
  // correct house-notation reactions raise nothing
  for (const s of ["Hydrogen burns: 2 H~2~ + O~2~ → 2 H~2~O.", "The complex forms: Fe^3+^ + SCN^-^ ⇌ FeSCN^2+^.", "Barium sulfate precipitates: Ba^2+^ + SO~4~^2-^ → BaSO~4~.",
    "Water evaporates: H~2~O~(l)~ → H~2~O~(g)~.", "Ammonia forms: N~2~ + 3 H~2~ ⇌ 2 NH~3~."])
    assert.deepEqual(unbalancedEquations(s), [], s);
  // the wide net: any other arrow between formula-like tokens is a reaction NOT read — counted, never silent
  // a side glued on past what is read ("Cu^2+^·4NH~3~") is never half-read into a false "unbalanced"
  const glued = "The ion pairs: [Cu(NH~3~)~4~]^2+^~(aq)~ → Cu^2+^·4NH~3~(aq) in water.";
  assert.deepEqual(unbalancedEquations(glued), []);
  assert.ok(mechanicalCoverage([{ id: "u", text: glued }]).skipped.length >= 1, "and it is counted");
  assert.ok(mechanicalCoverage([{ id: "u", text: "Rust dries: Fe~2~O~3~·xH~2~O → Fe~2~O~3~ on heating." }]).skipped.some((s) => /arrow between formula-like/.test(s.reason)));
  assert.deepEqual(reactionsIn("Step 1 → Step 2, and glucose → energy, and $x \\to 0$."), [], "prose arrows are not reactions");
});

test("[req.mechanical.balance] R5-K07: schematic letter reactions are skipped and counted — unless the unit says they are elements", () => {
  for (const s of ["An enzyme converts its substrate to product, S → P, far faster than the uncatalysed path does.", "Consider a schematic dimerisation equilibrium 2B ⇌ C in the gas phase.",
    "For a two-step path A → B → C the middle species builds up.", "In general, 2N ⇌ O for the model.", "Isomerisation, written C <=> K, is fast."]) {
    assert.deepEqual(unbalancedEquations(s), [], s);
    assert.ok(reactionsIn(s).length && reactionsIn(s).every((r) => r.unread), `counted: ${s}`);
  }
  assert.ok(reactionsIn("An enzyme converts S → P.")[0].unread.match(/schematic/));
  // the unit names the elements: chemistry, balanced as written
  assert.equal(unb("Sulfur cannot become phosphorus: S → P is not a chemical change."), true);
  assert.equal(unb("$\\ce{S -> P}$"), true, "\\ce{} says it is chemistry");
  // a real reaction with single-letter elements is still read: C + O2 → CO2 is not schematic
  assert.equal(unb("Carbon burns: C + O₂ → CO₂."), false);
  assert.equal(unb("Carbon burns: C + O₂ → CO."), true);
});

// ================================================ CORPUS + GATE ===================================================
test("[req.mechanical.recompute] [req.mechanical.balance] corpus: the real course raises no false alarm; its notChecked count is stated", () => {
  const all = loadUnits(C2, liveReader(C2));
  assert.ok(all.every((u) => !arithmeticMismatches(u.text).length && !unbalancedEquations(u.text).length), "no false alarm on the course");
  const cov = mechanicalCoverage(all);
  // HONEST counts (round 5): 2 links compared (the ΔG° chain in the study guide and in the practice set — the latter
  // wraps its inline math across a line break, which the reader now reads), 14 reactions balanced, and 5 forms NOT
  // checked: the general form "αA + βB ⇌ σS + τT" twice, a split "\ce{<=>}", and the J→kJ change of unit twice.
  assert.equal(cov.compared, 2, JSON.stringify(cov));
  assert.equal(cov.balanced, 14);
  assert.deepEqual(cov.skipped.map((s) => s.what).sort(), ["reaction", "reaction", "reaction", "worked link", "worked link"]);
  assert.equal(cov.skipped.filter((s) => /change of unit/.test(s.reason)).length, 2);
  // the other fixtures: nothing raised either
  for (const fx of ["mini-package", "usage-package"]) {
    const dir = path.join(HERE, "fixtures", fx);
    for (const f of walk(dir).filter((p) => p.endsWith(".md"))) {
      const t = fs.readFileSync(f, "utf8");
      assert.deepEqual(arithmeticMismatches(t), [], f);
      assert.deepEqual(unbalancedEquations(t), [], f);
    }
  }
});
function walk(d) { return fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === ".git" ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)])) : []; }

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r5-readers-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  fs.cpSync(C2, root, { recursive: true }); fs.cpSync(INPUTS, inputs, { recursive: true });
  git(root, "init", "-q", "-b", "main"); git(root, "add", "-A"); git(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "baseline");
  const units = () => loadUnits(root, liveReader(root));
  const edit = (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2); fs.writeFileSync(f, s.replace(from, () => to)); };
  const add = (sentences) => {
    const neighbour = units().find((u) => u.text.includes(ANCHOR));
    beginSession(root, liveReader(root), AGENT); edit(SG, ANCHOR, `${ANCHOR}\n\n${sentences.join("\n\n")}`); indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT });
    const all = units(), ids = sentences.map((s) => all.find((x) => x.text === s.trim()).id);
    linkUnits(root, liveReader(root), Object.fromEntries(ids.map((id) => [id, neighbour.spineNodes])), AGENT);
    return ids;
  };
  return { root, add, gate: () => runGate(root, { inputsDir: inputs }) };
}

test("[req.values.fail-closed] [req.mechanical.recompute] [req.mechanical.balance] through the gate: every finding's text is caught or correctly left alone, and the unread is counted", (t) => {
  const c = course(t);
  const g0 = c.gate();
  const K1 = ["Industrial ammonia plants typically run 2,000-atmosphere synthesis loops.", "Forming ammonia from its elements releases about 9 hundred kilojoules per mole of nitrogen.",
    "For the ammonia synthesis at room temperature the equilibrium constant K is about one hundred.", "Pure water at the same temperature has a pH of seven.",
    "Industrial synthesis loops run at several thousand atmospheres."];
  const K2 = ["So $Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3}$, and therefore $Q_r = 148$, so the reaction runs in reverse.", "Hydrogen burns in oxygen: H~2~ + O~2~ → H~2~O.",
    "Copper metal displaces silver from solution: Cu + Ag^+^ → Cu^2+^ + Ag.", "Plugging in, (0.20)^2 / ((0.10) × (0.30)^3) = 148, so the quotient is large."];
  const K3 = ["An enzyme converts its substrate to product, S → P, far faster than the uncatalysed path does.", "Consider a schematic dimerisation equilibrium 2B ⇌ C in the gas phase.",
    "With $Q_c = 50.0$, the quotient for the reverse reaction $= 1/50.0 = 0.0200$.", "Squaring gives $Q^2 = 2500$, and its square root $= 50$.",
    "The thermal energy scale here is $RT = 8.314 \\times 298 = 2.48\\ \\text{kJ/mol}$."];
  const ids = c.add([...K1, ...K2, ...K3]);
  const g = c.gate();
  const on = (id) => g.findings.filter((f) => (f.units || []).includes(id));
  for (const [i, id] of ids.slice(0, K1.length).entries())
    assert.ok(on(id).some((f) => f.kind === "evidence-missing" && f.statusClass === "obligation"), `K1 owes evidence: ${K1[i]}`);
  for (const [i, id] of ids.slice(K1.length, K1.length + K2.length).entries())
    assert.ok(on(id).some((f) => /computation-mismatch|equation-unbalanced/.test(f.kind) && f.statusClass === "defect" && f.route === "agent"), `K2 caught: ${K2[i]}`);
  for (const [i, id] of ids.slice(K1.length + K2.length).entries())
    assert.ok(!on(id).some((f) => /computation-mismatch|equation-unbalanced/.test(f.kind)), `K3 no false alarm: ${K3[i]}`);
  // the half-read and schematic forms are COUNTED in the gate's notChecked, with their forms
  const mine = g.mechanical.skipped.filter((s) => ids.includes(s.unit));
  assert.ok(mine.some((s) => /schematic/.test(s.reason) && /S → P/.test(s.form)));
  assert.ok(mine.some((s) => /schematic/.test(s.reason) && /2B ⇌ C/.test(s.form)));
  assert.ok(mine.some((s) => /one side only/.test(s.reason)));
  assert.equal(g.mechanical.skipped.length, g0.mechanical.skipped.length + mine.length, "nothing else changed in the count");
});
