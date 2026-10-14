// 3C RED TEAM, ROUND 3 — CONFIDENCE (K1–K6): every finding of the round, kept as a regression probe on the real course
// (tests/fixtures/c2-chemistry-v2 + c2-chemistry inputs). Each probe replays the attack — the agent's edit, a replayed
// verifier answer through the real verdict path, an editor's change to a record — and asserts it is now caught or
// refused, beside a control the harness must still admit or raise. Quotes are real pinned text (OpenStax Chemistry 2e
// 13.3; Wikipedia "Haber process"). Offline and deterministic. Record of the round: the red team's REPORT.md (P11
// study, redteam-r3/confidence).
//
// Finding → probe (all fixed; none dismissed):
//   R3-K01 bars, kbar, GPa, ksi, Torr, K_{p} ≈, "the work of Arrhenius" owe evidence ....... [req.values.one-parser] [req.values.fail-closed] [req.classifier.names]
//   R3-K01 (P4) an honest quote of 200 bar contradicts "2,000 bars": the right class ...... [req.values.fail-closed]
//   R3-K07 "minus 92.2 kJ" and "10<sup>-5</sup>" read as written: correct text admitted ... [req.values.one-parser]
//   R3-K02 a correction replaces a sign word with the number; a sign word beside a sign
//          is malformed and refused ......................................................... [req.correction.well-formed]
//   R3-K03 worked expressions are recomputed and equations balanced; no false alert on C2 .. [req.mechanical.recompute]
//   R3-K04 absolutes beyond the word list; a quotation is exempt only as a misconception .. [req.absolute.wide]
//   R3-K05 a legacy record's unbound factHash/status cannot silence a concern or dispute .. [req.records.log-bound]
//   R3-K08 a legacy review re-pointed by its contentHash does not count for new text ...... [req.records.log-bound]
//   R3-K06 a synonym swap does not settle a "wrong" concern; its suggestion put in place,
//          or a fresh review, does ............................................................. [req.knowledge.settled-by-text]
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { confirmUnits, indexAndStamp, linkUnits, loadUnits, unreviewedKnowledge } from "../scripts/lib/core/obligations.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { classifyUnit } from "../scripts/lib/core/segment.mjs";
import { factNamesIn } from "../scripts/lib/core/names.mjs";
import { statesValue } from "../scripts/lib/core/values.mjs";
import { factHash } from "../scripts/lib/core/dependencies.mjs";
import { appendLogRecord } from "../scripts/lib/records/log.mjs";
import { recordFile } from "../scripts/lib/records/paths.mjs";
import { sha256 } from "../scripts/lib/records/canonical.mjs";
import { knowledgeBundle, replayVerifier, semiBundle } from "../scripts/lib/verify/dispatch.mjs";
import { absoluteSentences } from "../scripts/lib/verify/absolutes.mjs";
import { applyCorrection, verifyKnowledge, verifySemi } from "../scripts/lib/verify/verdicts.mjs";
import { checkableClaims, namesIn, quantitiesIn } from "../scripts/lib/verify/claims.mjs";
import { arithmeticMismatches, equationsIn, imbalanceOf, unbalancedEquations, workedExpressions } from "../scripts/lib/verify/mechanical.mjs";
import { fsInputReader, pinnedTexts, syncReferenceRecord } from "../scripts/lib/verify/references.mjs";
import { pinDeclared as pinReference } from "./helpers/destinations.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const git = (root, ...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });

// ---- verbatim excerpts of the pages the round pinned ----------------------------------------------------------------
const OPENSTAX_13_3 = "Most industrial production of ammonia uses the Haber-Bosch process based on the following equilibrium reaction:\n N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ \n The traits of this reaction present challenges to its use in an efficient industrial process. The equilibrium constant is relatively small ( K p on the order of 10 −5 at 25 °C), meaning very little ammonia is present in an equilibrium mixture. Also, the rate of this reaction is relatively slow at low temperatures. To raise the yield of ammonia, the industrial process is designed to operate under conditions favoring product formation:\n High pressures (concentrations) of reactants are used, ~150−250 atm, to shift the equilibrium right, favoring product formation.\n Ammonia is continually removed (collected) from the equilibrium mixture during the process, lowering its concentration and also shifting the equilibrium right.";
const WIKI_HABER = "Claude proposed to have three or four converters with liquefaction steps in series, thereby avoiding recycling. Most plants continue to use the original Haber process (20 MPa (200 bar; 2,900 psi) and 500 °C (932 °F)), albeit with improved single-pass conversion and lower energy consumption due to process and catalyst optimization.";
const PINS = {
  openstax133: { url: "https://openstax.org/books/chemistry-2e/pages/13-3-shifting-equilibria-le-chateliers-principle", title: "13.3 Shifting Equilibria", destination: "openstax.org/books/chemistry-2e", text: OPENSTAX_13_3 },
  haber: { url: "https://en.wikipedia.org/wiki/Haber_process", title: "Haber process", destination: "en.wikipedia.org", text: WIKI_HABER },
};
const HABER_INTRO = "Most industrial production of ammonia uses the Haber-Bosch process based on the following equilibrium reaction:";
const AMMONIA_EQ_QUOTE = "N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ";
const KP_QUOTE = "The equilibrium constant is relatively small ( K p on the order of 10 −5 at 25 °C)";
const HABER_QUOTE = "Most plants continue to use the original Haber process (20 MPa (200 bar; 2,900 psi) and 500 °C (932 °F))";

const SG = "study-guide/le-chatelier.md";
const ANCHOR = "but it also slows the rate.";

/** A fresh copy of the real course, under git, with every reference of the round pinnable. */
function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r3-conf-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  fs.cpSync(C2, root, { recursive: true }); fs.cpSync(INPUTS, inputs, { recursive: true });
  git(root, "init", "-q", "-b", "main"); git(root, "add", "-A"); git(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "baseline");
  return {
    root, inputs, r: () => liveReader(root),
    gate: () => runGate(root, { inputsDir: inputs }),
    units: () => loadUnits(root, liveReader(root)),
    unit: (id) => loadUnits(root, liveReader(root)).find((u) => u.id === id),
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
/** A replayed semi verifier (test double): every claim gets the verdict, quoting each snippet from the passage holding it. */
const semiReplay = (verdict, quotes) => replayVerifier((pr) => {
  const ps = passagesOf(pr);
  const qs = quotes.map((q) => { const p = ps.find((x) => x.text.includes(q)); return p ? { passage: p.n, text: q } : null; }).filter(Boolean);
  return { nonce: nonceOf(pr), claims: Array.from({ length: claimCount(pr) }, (_, i) => ({ claim: i + 1, verdict, quotes: qs, note: "replayed" })) };
});
const mineOf = (g, id) => g.findings.filter((f) => (f.units || []).includes(id));
const kinds = (fs_) => fs_.map((f) => `${f.kind}:${f.statusClass}`).sort();
const raws = (text) => quantitiesIn(text).map((q) => q.raw);
const owes = (u) => classifyUnit({ form: "paragraph", text: u }).includes("semi-mechanical") && checkableClaims(u).length > 0;

/** The agent adds paragraphs after the temperature section's last sentence (one session), linked like its neighbour. */
function addParagraphs(c, sentences) {
  const neighbour = c.units().find((u) => u.text.includes(ANCHOR));
  c.asAgent(() => c.edit(SG, ANCHOR, `${ANCHOR}\n\n${sentences.join("\n\n")}`));
  const all = c.units(), ids = sentences.map((s) => all.find((x) => x.text === s.trim()).id);
  linkUnits(c.root, c.r(), Object.fromEntries(ids.map((id) => [id, neighbour.spineNodes])), AGENT);
  return ids;
}
async function addAndVerify(c, text, verdict, quotes, pins) {
  c.pin(...pins);
  const [id] = addParagraphs(c, [text]);
  const res = await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay(verdict, quotes), only: [id] });
  c.sync();
  const g = c.gate();
  return { c, u: c.unit(id), res, g, mine: mineOf(g, id) };
}
/** A dispatch logged the way records were logged before round 1 (test double): bundle and answer hashes and the
 *  admission status, no recordHash. */
function legacyDispatch(c, { kind, unit, prompt, nonce, answer, status, fields = {} }) {
  const raw = JSON.stringify(answer), bundleHash = sha256(prompt), dispatch = `d-${bundleHash.slice(0, 16)}`;
  const record = { schemaVersion: 1, dispatch, kind, unit, at: new Date().toISOString(), bundle: { nonce, bundleHash, prompt }, passages: [], answer: { mode: "replay", raw, model: "replay", costUsd: 0, responseHash: sha256(raw) }, admission: { status }, ...fields };
  const file = recordFile(c.root, `metadata/verification/${dispatch}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  appendLogRecord(c.root, { type: "dispatch", party: { role: "harness", name: "verify" }, payload: { dispatch, kind, unit, bundleHash, responseHash: sha256(raw), mode: "replay", status } });
  return { file, record, edit: (patch) => fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf8")), ...patch }, null, 2) + "\n") };
}

// ================================================ ONE VALUE PARSER, FAIL CLOSED ===================================
const SILENT = [
  "Industrial plants still run the original Haber process at about 2,000 bars.",
  "Industrial plants still run the original Haber process at about 2.0 kbar.",
  "Industrial plants still run the original Haber process at about 2 GPa.",
  "Industrial plants still run the original Haber process at about 29 ksi.",
  "Industrial plants still run the original Haber process at about 15,000 Torr.",
  "At room temperature the ammonia equilibrium has $K_{p} \\approx 0.50$.",
  "The law of mass action is the work of Arrhenius.",
];

test("[req.values.one-parser] [req.values.fail-closed] R3-K01/K07: bars, kbar, GPa, ksi, Torr, mmHg, MPa, braced and \\mathrm subscripts, \\approx, sign words, signed brackets and <sup> exponents are read", () => {
  assert.deepEqual(raws("2,000 bars, 2.0 kbar, 2 GPa, 29 ksi, 15,000 Torr, 760 mmHg, 20 MPa, 5 mbar"), ["2,000bar", "2.0kbar", "2GPa", "29ksi", "15,000torr", "760mmHg", "20MPa", "5mbar"]);
  for (const s of ["$K_{p} \\approx 0.50$", "$K_\\mathrm{p} \\approx 0.50$", "$K_{\\text{p}} = 0.50$", "K<sub>p</sub> ≈ 0.50"]) {
    assert.deepEqual(raws(s), ["0.50"], s);
    assert.ok(statesValue(s), `${s}: the classifier reads it too`);
  }
  for (const s of ["the change is minus 63.7 kJ", "the change is negative 63.7 kJ", "the change is (−63.7) kJ", "the change is −(63.7) kJ", "the change is -(63.7) kJ"]) assert.deepEqual(raws(s), ["-63.7kJ"], s);
  assert.deepEqual(raws("the change is plus 63.7 kJ"), ["63.7kJ"]);
  assert.deepEqual(raws("100 minus 37 kJ"), ["37kJ"], "a minus right after a number subtracts");
  assert.ok(!quantitiesIn("2 − (3) kJ").some((q) => q.value < 0), "so does a minus before a bracket after a number");
  for (const s of ["10<sup>-5</sup>", "10<sup>−5</sup>", "10<sup>&minus;5</sup>", "10<sup>‐5</sup>"]) assert.deepEqual(raws(`K<sub>p</sub> on the order of ${s} at 25 °C`), ["1e-5", "25°C"], s);
  // fail closed: a number before a unit-like token the table does not hold is a value with an opaque unit
  assert.deepEqual(raws("lead at 5 ppm in a 3 kDa protein"), ["5ppm", "3kDa"]);
  // … but never a count, a label, a formula or an English word
  for (const s of ["Question 3 Explain why.", "5 HIGH findings", "$\\ce{H2 + I2 <=> 2 HI}$", "Step 2 of 3 is done.", "in 3 steps", "Table 2 shows it"]) assert.deepEqual(quantitiesIn(s).filter((q) => q.opaque), [], s);
});

test("[req.values.fail-closed] [req.classifier.names] R3-K01: the seven silent facts owe evidence and block; the name trigger is the extractor's (less eponymous terms)", (t) => {
  for (const s of SILENT) assert.ok(owes(s), `${s}: semi-mechanical with a required token`);
  assert.deepEqual(namesIn(SILENT[6]), ["Arrhenius"]);
  assert.deepEqual(factNamesIn(SILENT[6]), ["Arrhenius"], "a name with no classifier verb is still a fact");
  assert.deepEqual(factNamesIn("This is Arrhenius's law of mass action."), ["Arrhenius"], "a possessive attributes");
  // an eponymous term asserts nothing about the person: the classifier's trigger leaves it, the extractor keeps it
  for (const s of ["The equilibrium constant is related to the standard Gibbs energy change.", "as described by the van 't Hoff equation.", "Take the Haber synthesis of ammonia, which is exothermic:"]) {
    assert.ok(namesIn(s).length, s);
    assert.deepEqual(factNamesIn(s), [], s);
  }
  // the trigger is at least as wide as namesIn less eponyms, over every unit of the real course
  for (const u of loadUnits(C2, liveReader(C2))) if (factNamesIn(u.text).length) assert.ok(u.judgment.includes("semi-mechanical"), u.id);
  // a list marker or a value's unit is no name
  assert.deepEqual(namesIn("- **Endothermic** reaction — raising the temperature **increases** $K$."), []);
  assert.deepEqual(namesIn("at about 15,000 Torr"), []);
  const c = course(t);
  const ids = addParagraphs(c, SILENT);
  const g = c.gate();
  for (const id of ids) assert.ok(mineOf(g, id).some((f) => f.kind === "evidence-missing" && f.statusClass === "obligation"), `${c.unit(id).text}: owes evidence`);
  assert.equal(g.gate.canPublish, false);
});

test("[req.values.fail-closed] R3-K01 (held-probe P4): an honest quote of 200 bar contradicts '2,000 bars' — a fact-contradicted defect, not evidence-missing", async (t) => {
  const r = await addAndVerify(course(t), "Most plants continue to run the original Haber process at about 2,000 bars of pressure.", "contradicted", [HABER_QUOTE], ["haber"]);
  assert.equal(r.res[0].status, "contradicted", JSON.stringify(r.res[0].perClaim));
  assert.ok(r.mine.some((f) => f.kind === "fact-contradicted" && f.statusClass === "defect" && f.route === "agent"), kinds(r.mine).join());
  assert.equal(r.g.gate.canPublish, false);
});

test("[req.values.one-parser] R3-K07: correct text in sign words and with an ASCII-hyphen <sup> exponent is admitted when honestly supported", async (t) => {
  const MINUS = "For the Haber-Bosch reaction $\\ce{N2 + 3 H2 <=> 2 NH3}$, the enthalpy change is minus 92.2 kJ, so heat is a product.";
  const a = await addAndVerify(course(t), MINUS, "supported", [HABER_INTRO, AMMONIA_EQ_QUOTE], ["openstax133"]);
  assert.equal(a.res[0].status, "admitted", JSON.stringify(a.res[0].perClaim));
  assert.ok(!a.mine.some((f) => f.kind === "evidence-missing"), kinds(a.mine).join());
  const SUP = "The ammonia synthesis has a relatively small equilibrium constant, K<sub>p</sub> on the order of 10<sup>-5</sup> at 25 °C.";
  const b = await addAndVerify(course(t), SUP, "supported", [KP_QUOTE], ["openstax133"]);
  assert.equal(b.res[0].status, "admitted", JSON.stringify(b.res[0].perClaim));
});

// ================================================ CORRECTIONS =====================================================
test("[req.correction.well-formed] R3-K02: 'minus 63.7 kJ' honestly contradicted is corrected to '−92.2 kJ' (the sign word goes with the number); a sign word beside a sign is refused", async (t) => {
  const c = course(t);
  const SENT = "For the Haber-Bosch reaction $\\ce{N2 + 3 H2 <=> 2 NH3}$, the enthalpy change is minus 63.7 kJ, so heat is a product.";
  const r = await addAndVerify(c, SENT, "contradicted", [HABER_INTRO, AMMONIA_EQ_QUOTE], ["openstax133"]);
  assert.ok(r.mine.some((f) => f.kind === "fact-contradicted"), "the wrong value is a defect");
  const fix = applyCorrection(c.root, c.r(), { unitId: r.u.id, plainTexts: c.plain(), meta: c.texts() }, AGENT);
  assert.ok(fix.applied, JSON.stringify(fix.question));
  const after = c.units().find((x) => x.text.startsWith("For the Haber-Bosch reaction"));
  assert.match(after.text, /the enthalpy change is −92\.2 kJ, so heat/);
  assert.ok(!/minus/i.test(after.text));
  assert.deepEqual(raws(after.text), ["-92.2kJ"]);
  // a sign word left beside a typeset sign ("minus −63.7") would read +92.2 to a student once corrected: refused
  const d = course(t);
  const BAD = "For the Haber-Bosch reaction $\\ce{N2 + 3 H2 <=> 2 NH3}$, the enthalpy change is minus −63.7 kJ, so heat is a product.";
  const s = await addAndVerify(d, BAD, "contradicted", [HABER_INTRO, AMMONIA_EQ_QUOTE], ["openstax133"]);
  const q = applyCorrection(d.root, d.r(), { unitId: s.u.id, plainTexts: d.plain(), meta: d.texts() }, AGENT);
  assert.equal(q.applied, false);
  assert.match(q.question.reason, /malformed/);
  assert.ok(d.units().some((x) => x.text === BAD), "the text is left as it was");
});

// ================================================ K2: COMPUTABLE CONTENT IS CHECKED ===============================
test("[req.mechanical.recompute] R3-K03: worked expressions are recomputed at the precision written, and equations balanced in atoms and charge", () => {
  const Q = "$Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3} = 1.48$";
  assert.deepEqual(arithmeticMismatches(Q), [{ expression: "\\frac{(0.20)^2}{(0.10)(0.30)^3}", written: "1.48", recomputed: 14.8148 }]);
  assert.deepEqual(arithmeticMismatches(Q.replace("1.48", "14.8")), [], "the right value at its precision");
  for (const [s, bad] of [["$x = 2.0 \\times 10^{-3} \\times 5 = 1.0 \\times 10^{-2}$", false], ["$x = 2.0 \\times 10^{-3} \\times 5 = 1.0 \\times 10^{-3}$", true],
    ["$\\Delta G = -(8.314)(298)\\ln(4.0) = -3435\\ \\text{J mol}^{-1}$", false], ["$\\Delta G = -(8.314)(298)\\ln(4.0) = -343.5\\ \\text{J mol}^{-1}$", true],
    ["$K_c = \\frac{0.040}{(0.20)(0.10)} = 2.0$", false], ["$K_c = \\frac{0.040}{(0.20)(0.10)} = 2.1$", true], ["$\\sqrt{16} = 5$", true], ["$p = 2{,}000 / 10 = 20\\,\\text{bar}$", true]])
    assert.equal(arithmeticMismatches(s).length > 0, bad, s);
  // what cannot be read without a guess is skipped: symbols, units inside the arithmetic, a change of unit
  for (const s of ["$K = \\frac{[\\ce{NH3}]^{2}}{[\\ce{N2}][\\ce{H2}]^{3}} = 5$", "$x = (0.20\\,\\text{M})^2 = 7$", "$-3435\\ \\text{J} \\approx -3.4\\ \\text{kJ}$", "$K = 10^{-5}$"]) assert.deepEqual(arithmeticMismatches(s), [], s);
  assert.deepEqual(unbalancedEquations("$$\\ce{CO + H2 <=> CH3OH}$$"), [{ equation: "CO + H2 <=> CH3OH", element: "H", left: 2, right: 4 }]);
  for (const s of ["$$\\ce{CO + 2 H2 <=> CH3OH}$$", "$\\ce{2 SO2(g) + O2(g) <=> 2 SO3(g)}$", "$\\ce{CaCO3(s) <=> CaO(s) + CO2(g)}$", "$\\ce{Al2(SO4)3 + 3 BaCl2 -> 2 AlCl3 + 3 BaSO4}$"]) assert.deepEqual(unbalancedEquations(s), [], s);
  assert.deepEqual(imbalanceOf({ left: { "Fe^3+": 1, "e-": 1 }, right: { "Fe^2+": 1 } }), null, "charge balances with the electron");
  assert.deepEqual(imbalanceOf({ left: { "Fe^3+": 1 }, right: { "Fe^2+": 1 } }), { element: "charge", left: 3, right: 2 });
});

test("[req.mechanical.recompute] R3-K03: the gate runs the check — a wrong worked Q_r and an unbalanced equation are defects routed to the agent; the real course raises none", (t) => {
  // the real course: what the check reads, and that it reads it without one false alert
  const all = loadUnits(C2, liveReader(C2));
  const worked = all.flatMap((u) => workedExpressions(u.text)), eqs = all.flatMap((u) => equationsIn(u.text));
  assert.ok(worked.length >= 1 && worked.every((x) => x.ok), JSON.stringify(worked));
  assert.ok(eqs.length >= 14 && eqs.every((x) => !imbalanceOf(x.e)), `${eqs.length} equations read`);
  const c = course(t);
  const g0 = c.gate();
  assert.ok(!g0.findings.some((f) => /computation-mismatch|equation-unbalanced/.test(f.kind)), "no false alert on the clean course");
  c.asAgent(() => {
    c.edit("study-guide/chemical-equilibrium.md", "{[\\ce{N2}]\\,[\\ce{H2}]^{3}}.$$", "{[\\ce{N2}]\\,[\\ce{H2}]^{3}}.$$\nFor a mixture with $[\\ce{NH3}] = 0.20$, $[\\ce{N2}] = 0.10$ and $[\\ce{H2}] = 0.30$, the quotient is $Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3} = 1.48$.");
    c.edit(SG, "$$\\ce{CO + 2 H2 <=> CH3OH}$$", "$$\\ce{CO + H2 <=> CH3OH}$$");
  });
  const g = c.gate();
  const m = g.findings.find((f) => f.kind === "computation-mismatch"), e = g.findings.find((f) => f.kind === "equation-unbalanced");
  assert.ok(m && m.statusClass === "defect" && m.route === "agent" && m.evidence.type === "computation", JSON.stringify(m));
  assert.equal(m.evidence.recomputed, 14.8148);
  assert.equal(m.evidence.written, "1.48");
  assert.ok(e && e.statusClass === "defect" && e.route === "agent", JSON.stringify(e));
  assert.deepEqual([e.evidence.element, e.evidence.left, e.evidence.right], ["H", 2, 4]);
  assert.equal(g.gate.canPublish, false);
});

// ================================================ D30: ABSOLUTES ==================================================
test("[req.absolute.wide] R3-K04: absolutes beyond the old word list owe a context review; a quotation is exempt only as a quoted misconception", () => {
  for (const s of ["Raising the temperature invariably lowers the yield of product.", "A change in pressure shifts any gas-phase equilibrium toward the side with fewer moles of gas.",
    "Each gas-phase equilibrium shifts when the volume of its vessel is halved.", "Without exception, heating an equilibrium mixture increases its equilibrium constant.",
    "Adding an inert gas \"always\" shifts a gas-phase equilibrium, because the total pressure rises.", "In all cases a catalyst leaves K unchanged.", "A catalyst necessarily speeds up the reaction.", "Heating universally shifts equilibria."])
    assert.equal(absoluteSentences(s).length, 1, s);
  assert.equal(absoluteSentences("Raising the temperature always lowers the yield of product.").length, 1, "the old words still count");
  // a quoted misconception, introduced as one or corrected at once, is exempt
  for (const s of ["Students often say \"heating always increases the yield\".", "- **\"Raising the temperature always increases the yield of product.\"** No — for an exothermic reaction it decreases.",
    "\"Pressure shifts every gas-phase equilibrium\" — not when the moles of gas are equal.", "\"Raising the temperature always increases the yield of product.\" Evaluate this claim."])
    assert.deepEqual(absoluteSentences(s), [], s);
  // a "but" further on does not turn a scare quote into a misconception
  assert.equal(absoluteSentences("Adding an inert gas \"always\" shifts the equilibrium, but only slowly.").length, 1);
});

// ================================================ RECORDS READ THROUGH WHAT THE LOG BINDS =========================
test("[req.records.log-bound] R3-K05: a pre-round-1 knowledge review's concern survives an edit of its unbound factHash/contentHash; a legacy contradiction still blocks a confirmation", (t) => {
  const c = course(t);
  const ID = c.units().find((u) => u.text.startsWith("A catalyst speeds up a reaction")).id;
  const u = c.unit(ID);
  const nonce = "00112233aabbccdd";
  const kb = knowledgeBundle(u.text, nonce);
  const k = legacyDispatch(c, { kind: "knowledge", unit: ID, prompt: kb.prompt, nonce, status: null, answer: { nonce, concerns: [{ kind: "wrong", text: "forward and reverse reactions by the same factor", problem: "test double", suggestion: "forward and reverse reactions by the same factor (test double)" }] }, fields: { factHash: factHash(u.text), contentHash: u.locator.contentHash } });
  const concerns = () => c.gate().findings.filter((f) => f.kind === "knowledge-concern" && f.units.includes(ID));
  assert.equal(concerns().length, 1, "the legacy concern is raised");
  assert.ok(!unreviewedKnowledge(c.root, c.r()).includes(ID), "and the unit counts as reviewed at its text");
  k.edit({ factHash: "0".repeat(64), contentHash: "0".repeat(64), at: "1999-01-01T00:00:00Z" });
  assert.equal(concerns().length, 1, "the unbound fields decide nothing");
  assert.ok(!unreviewedKnowledge(c.root, c.r()).includes(ID), "the review's text is what its logged prompt showed");
  // a legacy semi record the verifier contradicted (status logged with it): its stored factHash and admission are not
  // what blocks a confirmation — the claims its prompt printed and the logged status are
  const SENT = "The original Haber process runs at about 2,000 bars.";
  const [sid] = addParagraphs(c, [SENT]);
  const claims = checkableClaims(SENT);
  const sb = semiBundle(claims, [{ n: 1, source: "haber", text: HABER_QUOTE }], "aabbccdd00112233");
  const s = legacyDispatch(c, { kind: "semi", unit: sid, prompt: sb.prompt, nonce: "aabbccdd00112233", status: "contradicted", answer: { nonce: "aabbccdd00112233", claims: [{ claim: 1, verdict: "contradicted", quotes: [{ passage: 1, text: HABER_QUOTE }] }] }, fields: { factHash: factHash(SENT) } });
  s.edit({ factHash: "0".repeat(64), admission: { status: "admitted" } });
  assert.throws(() => confirmUnits(c.root, c.r(), [sid], { what: "fact", instructorWords: "test double: keep it" }, I), /contradicts the current text/);
});

test("[req.records.log-bound] R3-K08: a legacy review of a unit's OLD text, re-pointed by its contentHash and factHash, never counts as a review of the rewritten unit", (t) => {
  const c = course(t);
  const ID = c.units().find((u) => u.text.startsWith("A catalyst speeds up a reaction")).id;
  const old = c.unit(ID);
  const nonce = "0a1b2c3d4e5f6071";
  const k = legacyDispatch(c, { kind: "knowledge", unit: ID, prompt: knowledgeBundle(old.text, nonce).prompt, nonce, status: null, answer: { nonce, concerns: [] }, fields: { factHash: factHash(old.text), contentHash: old.locator.contentHash } });
  assert.ok(!unreviewedKnowledge(c.root, c.r()).includes(ID));
  c.asAgent(() => c.edit(SG, "accelerates the **forward and reverse reactions by the same factor.** It therefore changes **neither the position nor the composition** of the equilibrium", "accelerates the **forward reaction more than the reverse.** It therefore shifts **the position toward products and raises the yield** of the equilibrium"));
  const u = c.unit(ID);
  assert.ok(unreviewedKnowledge(c.root, c.r()).includes(ID), "the rewritten unit is unreviewed");
  k.edit({ contentHash: u.locator.contentHash, factHash: factHash(u.text) });
  assert.ok(unreviewedKnowledge(c.root, c.r()).includes(ID), "re-pointing the unbound fields does not make it reviewed");
});

// ================================================ "SETTLED BY THE TEXT" ==========================================
test("[req.knowledge.settled-by-text] R3-K06: a synonym swap keeps a 'wrong' concern open; its suggestion put in place (nothing else changed), or a fresh review, settles it", async (t) => {
  const setup = async () => {
    const c = course(t);
    const ID = c.units().find((u) => u.text.startsWith("A catalyst speeds up a reaction")).id;
    c.asAgent(() => c.edit(SG, "— only the time taken to reach it.", "— only the time taken to reach it, and it also raises the equilibrium yield of ammonia."));
    const WRONG = "it also raises the equilibrium yield of ammonia";
    // the honest blind review (test double): a "wrong" concern on those words
    await verifyKnowledge(c.root, c.r(), { only: [ID], verifier: replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [{ kind: "wrong", text: WRONG, problem: "A catalyst does not change the equilibrium composition.", suggestion: "it does not change the equilibrium yield of ammonia" }] })) });
    const open = () => c.gate().findings.filter((f) => f.kind === "knowledge-concern" && f.units.includes(ID));
    assert.equal(open().length, 1, "raised");
    return { c, ID, open };
  };
  // the attack: one word swapped for a synonym, the error kept
  const a = await setup();
  a.c.asAgent(() => a.c.edit(SG, "and it also raises the equilibrium yield", "and it also increases the equilibrium yield"));
  assert.equal(a.open().length, 1, "a synonym swap settles nothing");
  // the suggestion put in place of the words, and nothing else changed: settled
  const b = await setup();
  b.c.asAgent(() => b.c.edit(SG, "it also raises the equilibrium yield of ammonia", "it does not change the equilibrium yield of ammonia"));
  assert.equal(b.open().length, 0, "the suggestion applied settles it");
  // the suggestion put in, plus another edit of the passage: open until a fresh review reads the new text
  const d = await setup();
  d.c.asAgent(() => d.c.edit(SG, "and it also raises the equilibrium yield of ammonia", "and it does not change the equilibrium yield of ammonia, ever"));
  assert.equal(d.open().length, 1, "another change rides along: open");
  await verifyKnowledge(d.c.root, d.c.r(), { only: [d.ID], verifier: replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [] })) });
  assert.equal(d.open().length, 0, "a fresh review of the new text clears it");
});
