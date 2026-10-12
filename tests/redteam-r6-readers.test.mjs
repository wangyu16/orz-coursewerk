// 3C RED TEAM, ROUND 6 — the readers (D46: fixed by cause, the findings are test cases).
//
// CAUSE A — two readers of one text disagreed, and the weaker one decided. The claim extractor read "ΔH = −75.0
// \textrm{kJ}" as −75.0 kJ while the classifier (statesValue over plainForQuantities, which unwrapped only \text and
// \mathrm) found no value, so no evidence was owed (R6-K06). Now ONE value view (values.valueProse) and ONE answer
// (values.readValues) serve the classifier, the claim extractor, MS7's value scan and the shared-value edges: a sentence
// the claim reader finds a required quantity in is semi-mechanical.
// CAUSE B — the spine is not where content goes (D48, operator 2026-10-11). The spine is not source-checked; a spine line
// carrying a definition, an explanation, a value with a unit, an equation, an attribution or an absolute claim is a
// non-blocking digest question suggesting the detail move to the study-guide section that teaches the line (R6-K05);
// MS7 reads the spine, so a spine value that disagrees with the deliverables is a value-disagreement.
// CAUSE C — reader coverage: detect widely, read fully or count as unread, never guess. LaTeX value spellings (R6-K07),
// formatted results (R6-K08), reactions written per species / in HTML / with LaTeX arrows in \ce{} (R6-K09), the
// doubled "× ×" of the OpenStax extraction (R6-K11), and the reader view's scripts, primes, dash-minus, hiding styles
// and colon capitals (round-6 control C4 probe).
//
// Finding → probe:
//   R6-K06 \textrm/\mathsf/{\rm}/\operatorname kJ owe evidence; one reader everywhere ........ [req.values.one-reader]
//   R6-K05 a false value in the guide's rubric is a spine-detail question; spine values meet MS7 [req.spine.detail-question] [req.spine.values-consistent]
//   R6-K07 "~", \left(\right), ^{\circ}\mathrm{C} are values .................................. [req.values.fail-closed]
//   R6-K08 \mathbf{1.48}, 1.4\overline{8} are compared, or counted — never a symbol .......... [req.mechanical.recompute]
//   R6-K09 per-species \ce{}, HTML <sub>, \longrightarrow in \ce{} are balanced .............. [req.mechanical.balance]
//   R6-K11 "6.00 × × 10 −2" reads 6.00e-2 ...................................................... [req.values.one-parser]
//   C4 probe: <sup>/<sub>, prime, dash-minus, hiding styles, colon capital .................. [req.coherence.reader-view-r6]
//   calibration: the C2 spine's flags are listed, ordinary wording is not flagged ............ [req.spine.detail-question]
//   no false alarm: the C2 course's findings are unchanged but for the listed spine questions [req.values.one-reader]
// Offline and deterministic.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader, manifestChapters } from "../scripts/lib/core/package_reader.mjs";
import { indexAndStamp, linkUnits, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { classifyUnit } from "../scripts/lib/core/segment.mjs";
import { readValues, statesValue } from "../scripts/lib/core/values.mjs";
import { checkableClaims, quantitiesIn, sentencesOf } from "../scripts/lib/verify/claims.mjs";
import { scanValues } from "../scripts/lib/consistency.mjs";
import { dependencyEdges } from "../scripts/lib/core/dependencies.mjs";
import { arithmeticMismatches, mechanicalCoverage, reactionsIn, unbalancedEquations, workedLinks } from "../scripts/lib/verify/mechanical.mjs";
import { lightKey, meaningKey, readerView, styleEffect } from "../scripts/lib/core/rendered.mjs";
import { factTokens, classifyChapterChange } from "../scripts/lib/core/change.mjs";
import { spineDetail, spineDetailLines, spineLines, spineDetailNote } from "../scripts/lib/core/spine_detail.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const SG = "study-guide/le-chatelier.md";
const ANCHOR = "but it also slows the rate.";
const git = (root, ...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });

const owes = (t) => classifyUnit({ form: "paragraph", text: t }).includes("semi-mechanical") && checkableClaims(t).length > 0;
const required = (t) => checkableClaims(t).flatMap((c) => c.required.quantities.map((q) => q.raw));
const bad = (s) => arithmeticMismatches(s).length > 0;
const unb = (s) => unbalancedEquations(s).length > 0;

// ================================================ CAUSE A: ONE READER ===============================================
test("[req.values.one-reader] R6-K06: every font spelling of a unit is read by the classifier as by the claim reader — the sentence owes evidence", () => {
  const base = (u) => `For the ammonia synthesis the enthalpy change is $\\Delta H = -75.0\\ ${u}$, so heat sits on the product side.`;
  // the finding's four spellings, then new variants of the same cause
  for (const u of ["\\textrm{kJ}", "\\mathsf{kJ}", "{\\rm kJ}", "\\operatorname{kJ}", "\\textsf{kJ}", "\\mathit{kJ}", "\\mbox{kJ}", "{\\sf kJ}", "\\textup{kJ}", "\\mathbf{kJ}", "\\textnormal{kJ}", "\\mathrm{kJ}", "\\text{kJ}"]) {
    const t = base(u);
    assert.deepEqual(required(t), ["-75.0kJ"], u);
    assert.ok(classifyUnit({ form: "paragraph", text: t }).includes("semi-mechanical"), `classifier: ${u}`);
    assert.ok(owes(t), `owes evidence: ${u}`);
    // MS7's scan reads the same value (cause A audit: consistency.mjs read through valueText)
    assert.deepEqual(scanValues(t).map((v) => [v.value, v.entry.id]), [[-75, "kilojoule"]], `MS7: ${u}`);
  }
});

test("[req.values.one-reader] one reader decides: statesValue IS the claim reader's quantitiesIn, on the course and on every probe of this file", () => {
  const probes = ["$\\Delta H = -75.0\\ \\textrm{kJ}$", "$-75.0~\\text{kJ}$", "$\\left(-75.0\\right)\\ \\mathrm{kJ}$", "$-20\\,^{\\circ}\\mathrm{C}$", "K is 6.00 × × 10 −2.",
    "several thousand atmospheres", "the 2-mole side", "Step 3 of Chapter 2", "H~2~O boils", "a pH of seven"];
  const sentences = [...probes, ...loadUnits(C2, liveReader(C2)).flatMap((u) => sentencesOf(u.text))];
  for (const s of sentences) {
    assert.equal(statesValue(s), quantitiesIn(s).length > 0, s);
    assert.deepEqual(quantitiesIn(s), readValues(s));
    // a sentence with a required quantity is semi-mechanical — never left to the knowledge path alone
    if (quantitiesIn(s).length) assert.ok(classifyUnit({ form: "paragraph", text: s }).includes("semi-mechanical"), s);
  }
});

test("[req.values.one-reader] the shared-value edges read values through the same reader: \\textrm{kJ} and \\text{kJ} share −92.2 kJ", () => {
  const units = [{ id: "a", text: "Here $\\Delta H = -92.2\\ \\textrm{kJ}$ for the synthesis.", locator: { deliverable: "x.md", ordinal: 0 } },
    { id: "b", text: "The synthesis has $\\Delta H = -92.2\\ \\text{kJ}$.", locator: { deliverable: "y.md", ordinal: 0 } },
    { id: "c", text: "Here $\\Delta H = -46.1\\ \\textrm{kJ}$.", locator: { deliverable: "z.md", ordinal: 0 } }];
  const spine = { course: { nodes: [], terms: [] }, chapters: {} };
  const e = dependencyEdges(units, spine);
  assert.ok(e.get("a").some((x) => x.target === "unit:b" && x.kind === "shared-value"));
  assert.ok(!e.get("a").some((x) => x.target === "unit:c"));
});

// ================================================ CAUSE C: VALUES ===================================================
test("[req.values.fail-closed] R6-K07: a tie, sizing brackets and a degree written with \\circ make values — and the sentence owes evidence", () => {
  const cases = [
    ["For the ammonia synthesis the enthalpy change is $\\Delta H = -75.0~\\text{kJ}$, so raising the temperature lowers the yield.", ["-75.0kJ"]],
    ["For the ammonia synthesis the enthalpy change is $\\Delta H = \\left(-75.0\\right)\\ \\mathrm{kJ}$, and the forward reaction gives off heat.", ["-75.0kJ"]],
    ["Liquid ammonia boils at $-20\\,^{\\circ}\\mathrm{C}$, so it is shipped as a liquid under pressure.", ["-20°C"]],
    // variants of the cause
    ["The pinned text writes $\\Delta H = -92.28~{\\text{kJ}}$ for the reaction.", ["-92.28kJ"]],
    ["The loop runs at $450~^\\circ\\text{C}$ in most plants.", ["450°C"]],
    ["Water freezes at $0\\,^\\circ\\mathrm{C}$ at sea level.", ["0°C"]],
    ["The ice point is $273.15{}^{\\circ}\\text{C}$ above absolute zero (false on purpose).", ["273.15°C"]],
    ["Here $\\Delta H = \\Bigl(-75.0\\Bigr)\\,\\mathrm{kJ}$ is the stated value.", ["-75.0kJ"]],
    ["It boils at $-33\\,\\degree\\text{C}$.", ["-33°C"]],
  ];
  for (const [t, want] of cases) { assert.deepEqual(required(t), want, t); assert.ok(owes(t), `owes: ${t}`); }
  // controls: the house subscript is not a tie, and "~" in prose before a number is "about", as before
  assert.deepEqual(required("Water H~2~O boils at 100 °C."), ["100°C"]);
  assert.deepEqual(required("The constant is K ~ 50 at room temperature."), ["50"]);
  assert.deepEqual(required("Step 2~of the method."), []);
});

test("[req.values.one-parser] R6-K11: OpenStax's doubled multiplication sign reads as one — \"6.00 × × 10 −2\" is 6.00e-2", () => {
  const Q = "The equilibrium constant K c for the reaction of nitrogen and hydrogen to produce ammonia at a certain temperature is 6.00 × × 10 −2 .";
  assert.deepEqual(quantitiesIn(Q).map((q) => q.raw), ["6.00e-2"]);
  assert.deepEqual(quantitiesIn(Q.replace("× ×", "×")).map((q) => q.raw), ["6.00e-2"], "control");
  assert.deepEqual(quantitiesIn("K is $6.00 \\times \\times 10^{-2}$ here.").map((q) => q.raw), ["6.00e-2"]);
  assert.deepEqual(quantitiesIn("K is 1.2 ×× 10 −3 here.").map((q) => q.raw), ["1.2e-3"]);
  assert.deepEqual(quantitiesIn("K is 1.2 × 10 −3 here.").map((q) => q.raw), ["1.2e-3"]);
});

// ================================================ CAUSE C: CHAINS ===================================================
test("[req.mechanical.recompute] R6-K08: a formatted result is read through — compared, or counted as unread, never a symbol", () => {
  const A = "Substituting the equilibrium concentrations gives $Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3} = \\mathbf{1.48}$.";
  const C = "Dividing the two products, $\\frac{0.040}{0.0027} = 1.4\\overline{8}$.";
  assert.ok(bad(A), "\\mathbf{1.48} is compared (true 14.8)");
  assert.ok(bad(C), "1.4\\overline{8} is 1.4888…, compared");
  // variants: every wrapper of a wrong result is compared; of a right result, agrees
  for (const w of ["\\boxed{X}", "\\textbf{X}", "\\boldsymbol{X}", "\\bm{X}", "{\\bf X}", "\\color{red}{X}", "\\textcolor{red}{X}", "\\underline{X}", "\\mathrm{X}", "\\color{blue} X", "{X}"]) {
    assert.ok(bad(`$\\frac{0.040}{0.0027} = ${w.replace("X", "1.48")}$`), `wrong: ${w}`);
    assert.ok(!bad(`$\\frac{0.040}{0.0027} = ${w.replace("X", "14.8")}$`) && workedLinks(`$\\frac{0.040}{0.0027} = ${w.replace("X", "14.8")}$`).compared.length === 1, `right: ${w}`);
  }
  assert.ok(!bad("$\\frac{1}{3} = 0.\\overline{3}$") && workedLinks("$\\frac{1}{3} = 0.\\overline{3}$").compared.length === 1, "a right repeating decimal agrees");
  assert.ok(!bad("$\\frac{1}{6} = 0.1\\dot{6}$") && workedLinks("$\\frac{1}{6} = 0.1\\dot{6}$").compared.length === 1);
  assert.ok(bad("$\\frac{1}{6} = 0.1\\dot{3}$"));
  // a bar the reader cannot read through is COUNTED, never a symbol
  const half = "$\\frac{0.040}{0.0027} = \\overline{14}.8$";
  assert.deepEqual(workedLinks(half).compared, []);
  assert.match(workedLinks(half).skipped[0].reason, /formatting/);
  // controls: a bold or barred SYMBOL is still a symbol (nothing to compare, nothing counted)
  for (const s of ["$\\vec{F} = \\mathbf{F}$", "$\\bar{x} = \\overline{x}$", "$\\mathbf{v} = \\frac{d\\mathbf{r}}{dt}$"]) assert.deepEqual(workedLinks(s), { compared: [], skipped: [] }, s);
});

// ================================================ CAUSE C: REACTIONS ================================================
test("[req.mechanical.balance] R6-K09: reactions written per species, in HTML, or with a LaTeX arrow in \\ce{} are balanced", () => {
  assert.ok(unb("Ammonia forms from its elements, $\\ce{N2} + \\ce{H2} \\rightleftharpoons \\ce{NH3}$, over an iron catalyst."));
  assert.ok(unb("Hydrogen burns in oxygen: H<sub>2</sub> + O<sub>2</sub> → H<sub>2</sub>O."));
  assert.ok(unb("Propane burns completely: $\\ce{C3H8 + 5O2 \\longrightarrow 3CO2 + 3H2O}$."));
  // variants of the cause, wrong and right
  assert.ok(unb("$\\ce{N2(g)} + \\ce{H2(g)} \\longrightarrow \\ce{NH3(g)}$"));
  assert.ok(unb("$\\ce{N2} + 3\\,\\ce{H2} \\to 3\\,\\ce{NH3}$"));
  assert.ok(unb("Fe<sup>3+</sup> + e<sup>-</sup> → Fe<sup>3+</sup>"), "an HTML charge is a charge");
  assert.ok(unb("$\\ce{CH4 + O2 \\rightarrow CO2 + 2H2O}$"));
  assert.ok(unb("$\\ce{H2O} \\leftarrow \\ce{H2} + \\ce{O2}$"), "a leftward arrow balances as a rightward one");
  for (const s of ["$\\ce{N2} + 3\\ce{H2} \\rightleftharpoons 2\\ce{NH3}$", "$\\ce{N2(g)} + 3\\,\\ce{H2(g)} \\rightleftharpoons 2\\,\\ce{NH3(g)}$", "2H<sub>2</sub> + O<sub>2</sub> → 2H<sub>2</sub>O",
    "Fe<sup>3+</sup> + e<sup>-</sup> → Fe<sup>2+</sup>", "$\\ce{C3H8 + 5O2 \\longrightarrow 3CO2 + 4H2O}$", "$\\ce{2H2 + O2 \\rightarrow 2H2O}$", "$\\ce{N2 + 3H2 \\rightleftharpoons 2NH3}$"]) {
    assert.deepEqual(unbalancedEquations(s), [], s);
    assert.ok(reactionsIn(s).some((r) => r.e), `read: ${s}`);
  }
  // controls: a species named in \ce{} without an arrow is no reaction
  assert.deepEqual(reactionsIn("The $\\ce{NH3}$ yield falls while $\\ce{N2}$ is in excess."), []);
});

// ================================================ CAUSE C: THE READER VIEW ==========================================
test("[req.coherence.reader-view-r6] the reader view keeps every script and symbol: HTML <sup>/<sub>, a prime, a dash used as a minus", () => {
  assert.notEqual(lightKey("10<sup>3</sup> J"), lightKey("103 J"), "a superscript is not erased");
  assert.notEqual(lightKey("10<sup>3</sup> J"), lightKey("10<sub>3</sub> J"), "a superscript is not a subscript");
  assert.equal(lightKey("10<sup>3</sup> J"), lightKey("10^3^ J"), "an HTML superscript is the house superscript");
  assert.equal(lightKey("H<sub>2</sub>O"), lightKey("H~2~O"));
  assert.notEqual(lightKey("<div>10<sup>3</sup> J</div>"), lightKey("<div>103 J</div>"), "in an HTML block too");
  assert.notEqual(lightKey("ΔG°' is negative"), lightKey("ΔG° is negative"), "a prime is a symbol");
  assert.notEqual(meaningKey("the K' value"), meaningKey("the K value"));
  assert.equal(lightKey("the students' work"), lightKey("the students work"), "an apostrophe after a word stays punctuation");
  assert.notEqual(lightKey("ΔH = —92 kJ"), lightKey("ΔH = 92 kJ"), "an em dash before a number is a minus");
  assert.equal(lightKey("ΔH = —92 kJ"), lightKey("ΔH = −92 kJ"));
  assert.equal(lightKey("a pause — then more"), lightKey("a pause, then more"), "an em dash between words is punctuation");
});

test("[req.coherence.reader-view-r6] hiding styles fail closed: hidden for certain is dropped, unsure is a marker, colour only is light", () => {
  const S = "A gas added at constant volume does not shift the equilibrium.";
  for (const style of ["opacity:0", "opacity: 0.05", "font-size:0", "font-size: 1px", "color: transparent", "color: rgba(0,0,0,0)", "height:0;overflow:hidden", "transform: scale(0)", "clip-path: inset(50%)", "text-indent:-9999px"]) {
    const hid = S.replace("does not", `<span style="${style}">does not</span>`);
    assert.equal(styleEffect(` style="${style}"`), "hides", style);
    assert.notEqual(lightKey(hid), lightKey(S), `wrapping words in "${style}" is not light`);
    assert.ok(!/does not/.test(readerView(hid)), `the reader does not see them: ${style}`);
  }
  // a style the view cannot vouch for: kept in the key as a marker — wrapping, unwrapping and editing inside all change it
  for (const style of ["position:absolute;left:-9999px", "margin-left:-500em", "filter: blur(20px)", "mix-blend-mode: screen"]) {
    const hid = S.replace("does not", `<span style="${style}">does not</span>`);
    assert.equal(styleEffect(` style="${style}"`), "unsure", style);
    assert.notEqual(lightKey(hid), lightKey(S), style);
    assert.notEqual(lightKey(hid), lightKey(hid.replace("does not", "does")), `an edit under "${style}" changes the key`);
  }
  // only colour or weight: light, as emphasis is
  for (const style of ["color: red", "font-weight: bold", "background-color: #ffe", "font-style: italic; color: #333"]) {
    assert.equal(lightKey(S.replace("does not", `<span style="${style}">does not</span>`)), lightKey(S), style);
  }
  // the old forms still hide
  assert.ok(!/does not/.test(readerView(S.replace("does not", '<span style="display:none">does not</span>'))));
  assert.ok(!/hid/.test(readerView('<div style="font-size:0">hid</div>\n\nvisible')));
});

test("[req.coherence.reader-view-r6] a capital after a colon opens a clause: recasing it is not a fact change", () => {
  assert.deepEqual(factTokens("Note: The gas shifts left."), factTokens("Note: the gas shifts left."));
  assert.ok(factTokens("Note: the process of Haber runs hot.").includes("Haber"), "a name inside the clause is still a name");
  const node = (text) => ({ nodes: [{ id: "concept.x.a", anchor: "a", kind: "concept", text, prereqs: [] }], entries: [] });
  const k = classifyChapterChange(node("Remember: The equilibrium shifts left."), node("Remember: the equilibrium shifts left."));
  assert.ok(!k.reasons?.some((r) => r.kind === "substantive"), JSON.stringify(k));
});

// ================================================ CAUSE B: THE SPINE ================================================
// D49 (operator 2026-10-12) recalibrated D48: of the 9 lines first flagged here, the 5 equations NAMED in an objective,
// concept, key-term gloss or guide item, and the 2 summary sentences (a definition, an "only"), say what to teach — the
// operator agreed with each. The Guldberg–Waage attribution remains (tests/d49-decisions.test.mjs pins the rest).
const C2_FLAGS = [ // the C2 spine's genuine detail (D49's list), file:line — TRUE positives, not tuned away
  "concepts/chemical-equilibrium.md:46", // key term "law of mass action — Guldberg and Waage's rule" (an attribution)
];

test("[req.spine.detail-question] calibration on the C2 spine: 1 of 116 lines carries detail (D49), listed; ordinary objective, concept and assessment wording is not flagged", () => {
  const r = liveReader(C2), chapters = manifestChapters(r);
  const files = ["concepts/course.md", ...chapters.flatMap((c) => [`concepts/${c}.md`, `assessment-support/${c}.md`])];
  assert.equal(files.reduce((n, f) => n + spineLines(r.text(f)).length, 0), 116);
  const flags = spineDetailLines(r, chapters, { units: loadUnits(C2, r) });
  assert.deepEqual(flags.map((d) => `${d.file}:${d.line}`).sort(), [...C2_FLAGS].sort());
  const kinds = Object.fromEntries(flags.map((d) => [`${d.file}:${d.line}`, d.detail.map((x) => x.kind)]));
  assert.deepEqual(kinds["concepts/chemical-equilibrium.md:46"], ["an attribution", "an attribution"]);
  // the target is the study-guide section that teaches the line's node (here the key term's concept)
  const target = Object.fromEntries(flags.map((d) => [`${d.file}:${d.line}`, d.target]));
  assert.equal(target["concepts/chemical-equilibrium.md:46"].section, "The equilibrium constant");
  assert.match(target["concepts/chemical-equilibrium.md:46"].how, /teaches concept\.chemical-equilibrium\.k-expression/);
  // ordinary wording, never flagged
  const ordinary = [
    ["Objectives", "Define chemical equilibrium as a dynamic state in which the forward and reverse reaction rates are equal and the concentrations no longer change."],
    ["Objectives", "Predict the direction an equilibrium shifts when the temperature changes, by treating heat as a reactant for an endothermic reaction or a product for an exothermic one."],
    ["Concept sequence", "Pure solids and pure liquids have an activity of one and therefore do not appear in the equilibrium constant expression."],
    ["Concept sequence", "Le Chatelier's principle states that a system at equilibrium disturbed by a change in a determining factor adjusts to a new equilibrium that partially counteracts the change."],
    ["Misconceptions to surface", "Raising the temperature always increases the yield of product."],
    ["Misconceptions to surface", "Adding an inert gas at constant volume shifts a gas-phase equilibrium because the total pressure rises."],
  ];
  for (const [section, text] of ordinary) assert.deepEqual(spineDetail({ text, section }, { termNames: ["Le Chatelier's principle"] }), [], text);
  const guide = ["Supply $K$ and a set of non-equilibrium concentrations and ask for $Q_r$ and the direction of shift. Parameterize so that across a problem set the student meets $Q_r < K$, $Q_r > K$ and $Q_r = K$.",
    "Present equilibrium data in which the reactant and product concentrations are clearly unequal but constant, and ask whether the system is at equilibrium. Vary the ratio. A correct answer says yes, because equilibrium requires constant, not equal, concentrations.",
    "**Rubric.** Full credit: correct direction, justified by the sign of the reaction enthalpy, and explicitly notes that only temperature changes $K$. Partial: correct direction, weak justification.",
    "Ask whether raising the temperature always increases the yield of product. The answer is no, and it depends on the sign of the enthalpy."];
  for (const text of guide) assert.deepEqual(spineDetail({ text, section: "x" }, { guide: true }), [], text);
});

test("[req.spine.detail-question] the detail kinds of D48 as D49 calibrated them, each detected in a spine line (and its plain counterpart not)", () => {
  const d = (text, section = "Concept sequence", guide = false) => [...new Set(spineDetail({ text, section }, { guide }).map((x) => x.kind))];
  assert.deepEqual(d("The model answer uses $\\Delta H = -75.0\\ \\text{kJ}$ for the synthesis."), ["a value"]);
  assert.deepEqual(d("Relate K to the Gibbs energy change."), []);
  assert.ok(d("The law was proposed by Guldberg and Waage in 1864.").includes("an attribution"));
  assert.deepEqual(d("A catalyst does not shift the equilibrium because it speeds both directions equally."), ["an explanation"]);
  // a key term's gloss is the vocabulary authority: not a definition — but a value in it is detail
  assert.deepEqual(d("**catalyst** — a substance that speeds up both reactions equally", "Key terms"), []);
  assert.deepEqual(d("**ammonia** — boils at −33 °C", "Key terms"), ["a value"]);
  // D49: an equation, general form or reaction NAMED is what to teach; a definition and an "only"/"highest" are what a
  // concept line states — none of them is detail now (tests/d49-decisions.test.mjs pins the calibration)
  assert.deepEqual(d("Relate K to the Gibbs energy change through $\\Delta G^\\circ = -RT\\ln K$."), []);
  assert.deepEqual(d("Writing $\\ce{N2 + 3H2 <=> 2NH3}$ for the synthesis is expected."), []);
  assert.deepEqual(d("The reaction quotient is defined as the ratio of product to reactant activities."), []);
  assert.deepEqual(d("Only temperature changes the equilibrium constant."), []);
});

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r6-readers-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  fs.cpSync(C2, root, { recursive: true }); fs.cpSync(INPUTS, inputs, { recursive: true });
  git(root, "init", "-q", "-b", "main"); git(root, "add", "-A"); git(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "baseline");
  const units = () => loadUnits(root, liveReader(root));
  const edit = (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, from); fs.writeFileSync(f, s.replace(from, () => to)); };
  const session = (fn) => { beginSession(root, liveReader(root), AGENT); fn(); indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); };
  const add = (sentences) => {
    const neighbour = units().find((u) => u.text.includes(ANCHOR));
    session(() => edit(SG, ANCHOR, `${ANCHOR}\n\n${sentences.join("\n\n")}`));
    const all = units(), ids = sentences.map((s) => all.find((x) => x.text === s.trim()).id);
    linkUnits(root, liveReader(root), Object.fromEntries(ids.map((id) => [id, neighbour.spineNodes])), AGENT);
    return ids;
  };
  return { root, add, edit, session, units, gate: () => runGate(root, { inputsDir: inputs }) };
}

test("[req.spine.detail-question] [req.spine.values-consistent] [req.values.one-reader] the course through the gate: the only new findings are the listed spine questions (9 under D48, 1 under D49) — non-blocking, routed to the digest — and the spine is never a unit", (t) => {
  const c = course(t);
  const g = c.gate();
  const sd = g.findings.filter((f) => f.kind === "detail-in-spine");
  assert.deepEqual(sd.map((f) => `${f.evidence.file}:${f.evidence.line}`).sort(), [...C2_FLAGS].sort());
  for (const f of sd) {
    assert.equal(f.statusClass, "question"); assert.equal(f.route, "digest");
    assert.match(f.evidence.note, /Suggested: remove it from the spine and place it in the study guide at study-guide\//);
  }
  // nothing about the spine blocks, and no spine value disagrees with the course
  assert.ok(!g.findings.some((f) => f.kind === "value-disagreement" && f.units.some((u) => u.startsWith("spine:"))));
  // D48: the spine is not source-checked — no unit is minted for it, no evidence is owed on it
  assert.ok(!c.units().some((u) => /^(?:concepts|assessment-support)\//.test(u.locator.deliverable)));
  // the rest of the gate is what it was before round 6 (the frozen fixture's findings, by kind and class)
  const kinds = g.findings.filter((f) => f.kind !== "detail-in-spine").map((f) => `${f.kind}/${f.statusClass}`);
  const count = (k) => kinds.filter((x) => x === k).length;
  assert.equal(count("value-disagreement/defect"), 0);
  assert.equal(count("computation-mismatch/defect"), 0);
  assert.equal(count("equation-unbalanced/defect"), 0);
  assert.equal(g.mechanical.skipped.length, 5, "the course's notChecked count is unchanged");
});

test("[req.spine.detail-question] [req.spine.values-consistent] R6-K05: a false value in the guide's rubric is the instructor's question, with the study-guide section named; a spine value that disagrees with the course is a value-disagreement", (t) => {
  const S = "For the ammonia synthesis $\\ce{N2 + 3 H2 <=> 2 NH3}$ the model answer uses $\\Delta H = -75.0\\ \\text{kJ}$, so heat sits on the product side.";
  const c = course(t);
  c.session(() => c.edit("assessment-support/le-chatelier.md", "always favours products.", `always favours products. ${S}`));
  const g = c.gate();
  const q = g.findings.filter((f) => f.kind === "detail-in-spine" && f.evidence.file === "assessment-support/le-chatelier.md");
  assert.equal(q.length, 1);
  // D49: the reaction named beside the value is what to teach; the false value with its unit is still detail
  assert.deepEqual([...new Set(q[0].evidence.detail.map((x) => x.kind))].sort(), ["a value"]);
  assert.ok(q[0].evidence.detail.some((x) => x.what === "-75.0kJ"));
  assert.equal(q[0].statusClass, "question"); assert.equal(q[0].route, "digest");
  assert.equal(q[0].evidence.target.deliverable, "study-guide/le-chatelier.md");
  assert.equal(q[0].evidence.target.node, "objective.le-chatelier.predict-temperature-shift");
  assert.match(spineDetailNote({ file: q[0].evidence.file, line: q[0].evidence.line, detail: q[0].evidence.detail, target: q[0].evidence.target }), /study-guide\/le-chatelier\.md, section "/);

  // MS7 reads the spine: the same value stated under a shared term in a deliverable and in the guide disagrees
  const plant = (guideValue) => {
    const k = course(t);
    k.session(() => {
      k.edit("slides/le-chatelier.md", "pushes the equilibrium away from the side where heat sits.", "pushes the equilibrium away from the side where heat sits. The ammonia synthesis is an exothermic reaction, with $\\Delta H = -92.2\\ \\text{kJ}$.");
      k.edit("assessment-support/le-chatelier.md", "always favours products.", `always favours products. The ammonia synthesis is an exothermic reaction, with ${guideValue}.`);
    });
    return k.gate().findings.filter((f) => f.kind === "value-disagreement" && f.statusClass === "defect");
  };
  const vd = plant("$\\Delta H = -46.1\\ \\text{kJ}$");
  assert.equal(vd.length, 1);
  assert.ok(vd[0].units.some((u) => u.startsWith("spine:assessment-support/le-chatelier.md#L")), JSON.stringify(vd[0].units));
  assert.equal(plant("$\\Delta H = -92.2\\ \\textrm{kJ}$").length, 0, "the same value, in another font, agrees");
});

test("[req.values.fail-closed] [req.mechanical.recompute] [req.mechanical.balance] through the gate: the round-6 forms owe evidence, are caught, or are counted", (t) => {
  const c = course(t);
  const K1 = ["For the ammonia synthesis the enthalpy change is $\\Delta H = -75.0\\ \\textrm{kJ}$, so heat sits on the product side.",
    "For the ammonia synthesis the enthalpy change is $\\Delta H = \\left(-75.0\\right)\\ \\mathrm{kJ}$, and the forward reaction gives off heat.",
    "Liquid ammonia boils at $-20\\,^{\\circ}\\mathrm{C}$, so it is shipped as a liquid under pressure."];
  const K2 = ["Substituting the equilibrium concentrations gives $Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3} = \\mathbf{1.48}$.", "Dividing the two products, $\\frac{0.040}{0.0027} = 1.4\\overline{8}$.",
    "Ammonia forms from its elements, $\\ce{N2} + \\ce{H2} \\rightleftharpoons \\ce{NH3}$, over an iron catalyst.", "Hydrogen burns in oxygen: H<sub>2</sub> + O<sub>2</sub> → H<sub>2</sub>O.",
    "Propane burns completely: $\\ce{C3H8 + 5O2 \\longrightarrow 3CO2 + 3H2O}$."];
  const K3 = ["Ammonia forms over iron: $\\ce{N2} + 3\\ce{H2} \\rightleftharpoons 2\\ce{NH3}$.", "Dividing, $\\frac{0.040}{0.0027} = \\boxed{14.8}$."];
  const ids = c.add([...K1, ...K2, ...K3]);
  const g = c.gate();
  const on = (id) => g.findings.filter((f) => (f.units || []).includes(id));
  for (const [i, id] of ids.slice(0, K1.length).entries()) assert.ok(on(id).some((f) => f.kind === "evidence-missing" && f.statusClass === "obligation"), `owes: ${K1[i]}`);
  for (const [i, id] of ids.slice(K1.length, K1.length + K2.length).entries()) assert.ok(on(id).some((f) => /computation-mismatch|equation-unbalanced/.test(f.kind) && f.statusClass === "defect"), `caught: ${K2[i]}`);
  for (const [i, id] of ids.slice(K1.length + K2.length).entries()) assert.ok(!on(id).some((f) => /computation-mismatch|equation-unbalanced/.test(f.kind)), `no false alarm: ${K3[i]}`);
  assert.equal(g.gate.canPublish, false);
});

test("[req.values.one-reader] no new false alarm on the course: every unit reads as before round 6 (classification, claims, values, chains, reactions)", () => {
  // the frozen fixture's readings at 9249684, pinned: totals that a reader change would move
  const all = loadUnits(C2, liveReader(C2));
  const semi = all.filter((u) => classifyUnit({ form: u.form, text: u.text }).includes("semi-mechanical")).length;
  const claims = all.reduce((n, u) => n + checkableClaims(u.text).length, 0);
  const qty = all.reduce((n, u) => n + quantitiesIn(u.text).length, 0);
  const cov = mechanicalCoverage(all);
  assert.deepEqual({ semi, claims, qty, compared: cov.compared, balanced: cov.balanced, skipped: cov.skipped.length }, PINNED);
  assert.ok(all.every((u) => !arithmeticMismatches(u.text).length && !unbalancedEquations(u.text).length));
  // and the C2 spine states no value the claim reader reads (so MS7's new spine claims compare nothing on the course)
  for (const f of ["concepts/course.md", ...manifestChapters(liveReader(C2)).flatMap((ch) => [`concepts/${ch}.md`, `assessment-support/${ch}.md`])])
    for (const l of spineLines(liveReader(C2).text(f))) assert.deepEqual(readValues(l.text), [], `${f}: ${l.text}`);
});
// measured with the harness at 9249684 (before round 6) and after: identical
const PINNED = { semi: 51, claims: 38, qty: 25, compared: 2, balanced: 14, skipped: 5 };
