// 3C RED TEAM, ROUND 2 — CONFIDENCE (K1–K6): every finding of the round, kept as a regression probe on the real course
// (tests/fixtures/c2-chemistry-v2 + c2-chemistry inputs). Each probe replays the attack — the agent's edit, a replayed
// verifier answer through the real verdict path, the instructor's digest answer — and asserts it is now caught or
// refused, beside a control the harness must still admit or raise. Quotes are real pinned text: the excerpts below are
// verbatim from the pages the round pinned (OpenStax Chemistry 2e 13.3; Wikipedia "Haber process", "Ammonia").
// Offline and deterministic. Record of the round: the red team's REPORT.md (P11 study, redteam-r2/confidence).
//
// Finding → probe (all fixed; none dismissed):
//   R2-K01 a flipped magnitude ("relatively LARGE … MOSTLY ammonia") never supports ...... [req.support.predicate]
//   R2-K02 a negated predicate ("do NOT shift … right") never supports ................. [req.support.predicate]
//   R2-K03 a quantity named in words (free energy) is not the quote's ΔH ............... [req.support.predicate]
//   R2-K04 "atmospheres" is a unit: 2,000 atmospheres is a required token .............. [req.values.one-parser]
//   R2-K05 kilojoules, kilocalories, atmospheres, psi, eV, tonnes are values ............. [req.values.one-parser]
//   R2-K06 an equation in \mathrm{} / Unicode is a reaction; a lead-in name never anchors  [req.anchor.stoichiometry]
//   R2-K07 "&minus;92.2" is a minus (every HTML minus) .................................. [req.values.one-parser]
//   K06/K07 second defect: a correction replaces the sign with the number, or is refused [req.correction.well-formed]
//   R2-K08 MS7 reads values with the one parser: sign, thousands, mol^{-1} = /mol ....... [req.consistency.one-parser]
//   R2-K09 exercise-likeness comes from form and role, never a cue word ................. [req.verdict.hypothetical-scope]
//   R2-K10 a concern quoting rendered math is raised; an unlocatable one is unscorable .. [req.knowledge.concern-located]
//   CONTROL handoff: an absolute review counts only through what the log binds .......... [req.absolute.log-bound]
//   COHERENCE F7: a binding written "whose K is 50" is the binding K = 50 ............... [req.dependency.binding-parser]
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { coreObligations, indexAndStamp, linkUnits, loadUnits, reverifyUnits, reviewedAbsolutes, unreviewedKnowledge } from "../scripts/lib/core/obligations.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { answerDigest, buildDigest } from "../scripts/lib/core/digest.mjs";
import { unitInfoOf } from "../scripts/lib/core/workflow.mjs";
import { bindings } from "../scripts/lib/core/dependencies.mjs";
import { statesValue } from "../scripts/lib/core/values.mjs";
import { appendLogRecord } from "../scripts/lib/records/log.mjs";
import { recordFile } from "../scripts/lib/records/paths.mjs";
import { sha256 } from "../scripts/lib/records/canonical.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { absoluteBundle, absoluteSentences, absolutesHash } from "../scripts/lib/verify/absolutes.mjs";
import { directionClash, equationIn, negationClash, quantityNames } from "../scripts/lib/verify/admission.mjs";
import { applyCorrection, verifyKnowledge, verifySemi } from "../scripts/lib/verify/verdicts.mjs";
import { checkableClaims, quantitiesIn } from "../scripts/lib/verify/claims.mjs";
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
const WIKI_AMMONIA = "Liquid ammonia possesses strong ionising powers reflecting its high ε of 22 at −35 °C (−31 °F). Liquid ammonia has a very high standard enthalpy change of vapourisation (23.5 kJ/mol; for comparison, water's is 40.65 kJ/mol, methane 8.19 kJ/mol and phosphine 14.6 kJ/mol) and can be transported in pressurised or refrigerated vessels.";
const WIKI_HABER = "Claude proposed to have three or four converters with liquefaction steps in series, thereby avoiding recycling. Most plants continue to use the original Haber process (20 MPa (200 bar; 2,900 psi) and 500 °C (932 °F)), albeit with improved single-pass conversion and lower energy consumption due to process and catalyst optimization.";
const PINS = {
  openstax133: { url: "https://openstax.org/books/chemistry-2e/pages/13-3-shifting-equilibria-le-chateliers-principle", title: "13.3 Shifting Equilibria", destination: "openstax.org/books/chemistry-2e", text: OPENSTAX_13_3 },
  ammonia: { url: "https://en.wikipedia.org/wiki/Ammonia", title: "Ammonia", destination: "en.wikipedia.org", text: WIKI_AMMONIA },
  haber: { url: "https://en.wikipedia.org/wiki/Haber_process", title: "Haber process", destination: "en.wikipedia.org", text: WIKI_HABER },
};
const HABER_INTRO = "Most industrial production of ammonia uses the Haber-Bosch process based on the following equilibrium reaction:";
const AMMONIA_EQ_QUOTE = "N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ";
const KP_QUOTE = "The equilibrium constant is relatively small ( K p on the order of 10 −5 at 25 °C), meaning very little ammonia is present in an equilibrium mixture.";
const PRESSURE_QUOTES = ["To raise the yield of ammonia, the industrial process is designed to operate under conditions favoring product formation:", "~150−250 atm, to shift the equilibrium right, favoring product formation"];
const HABER_QUOTE = "Most plants continue to use the original Haber process (20 MPa (200 bar; 2,900 psi) and 500 °C (932 °F))";

const SG = "study-guide/le-chatelier.md";
const ANCHOR = "but it also slows the rate.";

/** A fresh copy of the real course, under git, with every reference of the round pinned. */
function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r2-conf-"));
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
const kinds = (fs_) => fs_.map((f) => `${f.kind}:${f.statusClass}`).sort();
const raws = (text) => quantitiesIn(text).map((q) => q.raw);

/** The agent adds a paragraph (one or more units) after the temperature section's last sentence, linked like its
 *  neighbour; a replayed answer goes through the real verdict path for the unit `which` picks (default: the last). */
async function addAndVerify(c, text, verdict, quotes, pins, which = null) {
  c.pin(...pins);
  const neighbour = c.units().find((u) => u.text.includes(ANCHOR));
  const before = new Set(c.units().map((u) => u.id));
  c.asAgent(() => c.edit(SG, ANCHOR, `${ANCHOR}\n\n${text}`));
  const added = c.units().filter((x) => !before.has(x.id) && x.locator.deliverable === SG);
  assert.ok(added.length, "the new unit is indexed");
  linkUnits(c.root, c.r(), Object.fromEntries(added.map((u) => [u.id, neighbour.spineNodes])), AGENT);
  const u = which ? added.find(which) : added.at(-1);
  const res = await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay(verdict, quotes), only: [u.id] });
  c.sync();
  const g = c.gate();
  return { c, u: c.unit(u.id), res, g, mine: mineOf(g, u.id) };
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

// ================================================ PREDICATE SUPPORT ==============================================
test("[req.support.predicate] R2-K01: a quote of the same value with the opposite size ('relatively small … very little') never supports 'relatively large … mostly'", async (t) => {
  assert.equal(directionClash("the constant is relatively large, so the mixture is mostly ammonia", KP_QUOTE), "large/small");
  assert.equal(directionClash("the rate is fast at low temperature", "the rate of this reaction is relatively slow at low temperatures"), "fast/slow");
  assert.equal(directionClash("High pressures shift the equilibrium right.", OPENSTAX_13_3.split("\n").slice(2).join(" ")), null, "a high/low pair about other things is no clash");
  const WRONG = "For the ammonia synthesis the equilibrium constant is relatively large ($K_p$ on the order of $10^{-5}$ at 25 °C), meaning an equilibrium mixture is mostly ammonia.";
  const r = await addAndVerify(course(t), WRONG, "supported", [KP_QUOTE], ["openstax133"]);
  assertRefused(r, "large/mostly on a quote saying small/very little");
  assert.match(r.res[0].perClaim[0].reason, /opposite direction/);
  const RIGHT = "For the ammonia synthesis the equilibrium constant is relatively small ($K_p$ on the order of $10^{-5}$ at 25 °C), meaning very little ammonia is present.";
  assertAdmitted(await addAndVerify(course(t), RIGHT, "supported", [KP_QUOTE], ["openstax133"]), "the honest sentence");
});

test("[req.support.predicate] R2-K02: a claim that negates the predicate its quote asserts (or the reverse) is never supported", async (t) => {
  assert.match(negationClash("they do not shift the equilibrium right or favor product formation", PRESSURE_QUOTES.join(" ¶ ")), /denies "shift"/);
  assert.match(negationClash("A catalyst changes the equilibrium constant.", "A catalyst does not change the equilibrium constant."), /quotes deny "change"/);
  assert.equal(negationClash("A catalyst does not change the equilibrium constant.", "A catalyst speeds up both reactions equally and does not change the equilibrium constant."), null, "the same denial");
  assert.equal(negationClash("Not only pressure but also removal shifts it right.", "removal of ammonia shifts it right"), null, "'not only' denies nothing");
  const WRONG = "To raise the yield of ammonia, high pressures of ~150−250 atm are avoided, because they do not shift the equilibrium right or favor product formation.";
  const r = await addAndVerify(course(t), WRONG, "supported", PRESSURE_QUOTES, ["openstax133"]);
  assertRefused(r, "a negated predicate");
  assert.match(r.res[0].perClaim[0].reason, /opposite predicate/);
  assertAdmitted(await addAndVerify(course(t), "To raise the yield of ammonia, pressures of about 250 atm are used to shift the equilibrium right, toward the products.", "supported", PRESSURE_QUOTES, ["openstax133"]), "the affirmative sentence");
});

test("[req.support.predicate] R2-K03: a quantity named in words (the free energy change) is not the quote's ΔH, whatever the value", async (t) => {
  assert.deepEqual([...quantityNames("the standard free energy change of the reaction is −92.2 kJ")], ["G"]);
  assert.deepEqual([...quantityNames("its enthalpy of reaction")], ["H"]);
  assert.deepEqual([...quantityNames("the rate constant is 0.5 per second, the entropy rises")].sort(), ["S", "k"]);
  assert.deepEqual([...quantityNames(AMMONIA_EQ_QUOTE)], ["H"]);
  const r = await addAndVerify(course(t), "For the industrial production of ammonia, the standard free energy change of the reaction is −92.2 kJ.", "supported", [HABER_INTRO, AMMONIA_EQ_QUOTE], ["openstax133"]);
  assertRefused(r, "ΔG in words on a ΔH quote");
  assert.match(r.res[0].perClaim[0].reason, /another quantity/);
  assertAdmitted(await addAndVerify(course(t), "For the industrial production of ammonia, the standard enthalpy change of the reaction is −92.2 kJ.", "supported", [HABER_INTRO, AMMONIA_EQ_QUOTE], ["openstax133"]), "ΔH in words on the ΔH quote");
});

// ================================================ ONE VALUE PARSER ===============================================
test("[req.values.one-parser] R2-K04 + R2-K05: plural and spelled units are units — 2,000 atmospheres is a token the quote must carry, and four wrong values owe evidence", async (t) => {
  assert.deepEqual(raws("2,000 atmospheres, 40.65 kilojoules per mole, 29,000 psi, 52 kilocalories, 3 tonnes, 1.5 eV, 1013 hPa, 4 calories, 2 kilopascals"),
    ["2,000atm", "40.65kJ/mol", "29,000psi", "52kcal", "3tonne", "1.5eV", "1013hPa", "4cal", "2kPa"]);
  assert.equal(quantitiesIn("2,900 psi")[0].value, 2900);
  const r = await addAndVerify(course(t), "Most plants continue to use the original Haber process at about 2,000 atmospheres.", "supported", [HABER_QUOTE], ["haber"]);
  assertRefused(r, "2,000 atmospheres on a quote of 200 bar");
  assert.match(r.res[0].perClaim[0].reason, /2,000atm/);
  const WRONG = ["Liquid ammonia has a standard enthalpy change of vapourisation of 40.65 kilojoules per mole.", "The original Haber process runs at about 29,000 psi.", "The ammonia synthesis releases about 52 kilocalories per mole of reaction.", "Industrial reactors are run near 20 atmospheres."];
  for (const s of WRONG) assert.ok(statesValue(s), s);
  const c = course(t);
  const neighbour = c.units().find((u) => u.text.includes(ANCHOR));
  c.asAgent(() => c.edit(SG, ANCHOR, `${ANCHOR}\n\n${WRONG.join(" ")}`));
  const u = c.units().find((x) => x.text.startsWith("Liquid ammonia has"));
  linkUnits(c.root, c.r(), { [u.id]: neighbour.spineNodes }, AGENT);
  assert.ok(c.unit(u.id).judgment.includes("semi-mechanical"));
  assert.equal(checkableClaims(u.text).length, 4);
  const g = c.gate();
  assert.ok(mineOf(g, u.id).some((f) => f.kind === "evidence-missing" && f.statusClass === "obligation"), "owed");
  assert.equal(g.gate.canPublish, false);
});

test("[req.values.one-parser] R2-K07: an HTML minus is a minus — the correct '&minus;92.2 kJ' is never contradicted nor 'corrected'", async (t) => {
  for (const s of ["ΔH = &minus;92.2 kJ", "ΔH = &#8722;92.2 kJ", "ΔH = &#x2212;92.2 kJ", "ΔH = &ndash;92.2 kJ", "ΔH = &minus; 92.2 kJ", "ΔH = - 92.2 kJ"]) assert.deepEqual(raws(s), ["-92.2kJ"], s);
  const SENT = "For the Haber-Bosch reaction $\\ce{N2 + 3 H2 <=> 2 NH3}$, $\\Delta H$ = &minus;92.2 kJ, so heat is a product.";
  const c = course(t);
  const r = await addAndVerify(c, SENT, "contradicted", [HABER_INTRO, AMMONIA_EQ_QUOTE], ["openstax133"]);
  assert.notEqual(r.res[0].status, "contradicted", JSON.stringify(r.res[0].perClaim));
  assert.ok(!r.g.findings.some((f) => f.kind === "fact-contradicted" && f.units.includes(r.u.id)), "no defect on the correct value (K3)");
  const before = c.read(SG);
  assert.equal(applyCorrection(c.root, c.r(), { unitId: r.u.id, plainTexts: c.plain(), meta: c.texts() }, AGENT).applied, false, "no harmful revision (K4)");
  assert.equal(c.read(SG), before);
  // the honest sentence is admitted on the same quotes
  assertAdmitted(await addAndVerify(course(t), SENT, "supported", [HABER_INTRO, AMMONIA_EQ_QUOTE], ["openstax133"]), "&minus;92.2 kJ supported");
});

// ================================================ REACTION ANCHORING =============================================
test("[req.anchor.stoichiometry] R2-K06: an equation in \\mathrm{}, Unicode or ASCII is a reaction — the correct reverse reaction is not a defect, and a lead-in name never anchors one", async (t) => {
  const REVERSE = { left: { NH3: 2 }, right: { N2: 1, H2: 3 } };
  for (const s of ["$$\\mathrm{2\\,NH_3(g) \\rightleftharpoons N_2(g) + 3\\,H_2(g)} \\qquad \\Delta H = +92.2\\ \\text{kJ}$$", "2 NH3(g) ⇌ N2(g) + 3 H2(g), ΔH = +92.2 kJ", "2NH3 -> N2 + 3H2", "2 NH_{3} <=> N_{2} + 3 H_{2}", "$\\text{2 NH}_3 \\longrightarrow \\text{N}_2 + 3\\text{H}_2$"])
    assert.deepEqual(equationIn(s), REVERSE, s);
  assert.equal(equationIn("Reactants → Products when the Haber process runs at 500 °C."), null, "prose is no reaction");
  const LEAD = "Run in reverse, the Haber-Bosch reaction decomposes ammonia and absorbs the same heat:";
  const EQ = "$$\\mathrm{2\\,NH_3(g) \\rightleftharpoons N_2(g) + 3\\,H_2(g)} \\qquad \\Delta H = +92.2\\ \\text{kJ}$$";
  const isEq = (u) => u.text.includes("2\\,NH_3(g)");
  const c = course(t);
  const r = await addAndVerify(c, `${LEAD}\n\n${EQ}`, "contradicted", [HABER_INTRO, AMMONIA_EQ_QUOTE], ["openstax133"], isEq);
  assert.notEqual(r.res[0].status, "contradicted", JSON.stringify(r.res[0].perClaim));
  assert.ok(!r.g.findings.some((f) => f.kind === "fact-contradicted" && f.units.includes(r.u.id)), "no defect on the correct reverse reaction (K3)");
  const before = c.read(SG);
  assert.equal(applyCorrection(c.root, c.r(), { unitId: r.u.id, plainTexts: c.plain(), meta: c.texts() }, AGENT).applied, false, "no harmful revision (K4)");
  assert.equal(c.read(SG), before);
  // nor does the forward reaction's quote support the reverse reaction (F8 applies outside \ce{} too)
  const s = await addAndVerify(course(t), `${LEAD}\n\n${EQ}`, "supported", [HABER_INTRO, AMMONIA_EQ_QUOTE], ["openstax133"], isEq);
  assertRefused(s, "the reverse reaction on the forward quote");
  assert.match(s.res[0].perClaim[0].reason, /reaction/);
});

// ================================================ CORRECTION =====================================================
test("[req.correction.well-formed] K06/K07 second defect: a correction replaces the sign or prefix with the number, and a correction that would be malformed is refused", async (t) => {
  const FIX = "Take the Haber synthesis of ammonia, which is exothermic:";
  const fixture = "\\Delta H = -92\\ \\text{kJ mol}^{-1}$$";
  const run = async (written) => {
    const c = course(t); c.pin("openstax133");
    const EQ = "u-study-guide-le-chatelier-changing-the-temperature-5";
    c.asAgent(() => c.edit(SG, fixture, `\\Delta H = ${written}\\ \\text{kJ}$$`));
    assert.ok(c.read(SG).includes(FIX));
    await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay("contradicted", [AMMONIA_EQ_QUOTE]), only: [EQ] }); c.sync();
    const fix = applyCorrection(c.root, c.r(), { unitId: EQ, plainTexts: c.plain(), meta: c.texts() }, AGENT);
    return { fix, line: c.read(SG).split("\n").find((l) => l.includes("2 NH3(g)}")) };
  };
  // a wrong positive value written with "+": the "+" goes with the number
  const plus = await run("+57.2");
  assert.equal(plus.fix.applied, true, JSON.stringify(plus.fix.question));
  assert.deepEqual(raws(plus.line), ["-92.2kJ"], plus.line);
  assert.doesNotMatch(plus.line, /\+\s*[−-]|[−-]\s*[−-]/, "no '+−'");
  // a wrong value written with an HTML minus keeps that minus, once
  const ent = await run("&minus;57.2");
  assert.equal(ent.fix.applied, true, JSON.stringify(ent.fix.question));
  assert.deepEqual(raws(ent.line), ["-92.2kJ"], ent.line);
  assert.doesNotMatch(ent.line, /&minus;\s*[−-]/, "no '&minus;−'");
  // a value the parser reads as a difference ("0 - 57.2"): replacing the number alone would write "0 - −92.2" — refused
  const diff = await run("0 - 57.2");
  assert.equal(diff.fix.applied, false);
  assert.match(diff.fix.question.reason, /malformed|not a single/);
  assert.match(diff.line, /0 - 57\.2/, "untouched");
});

// ================================================ CONSISTENCY ====================================================
test("[req.consistency.one-parser] R2-K08: MS7 reads values with the one value parser — a sign disagreement and kJ mol^{-1} vs kJ/mol are value disagreements", (t) => {
  const plant = (a, b) => {
    const c = course(t);
    c.asAgent(() => {
      c.edit("slides/le-chatelier.md", "pushes the equilibrium away from the side where heat sits.", `pushes the equilibrium away from the side where heat sits. The ammonia synthesis is an exothermic reaction, with ${a}.`);
      c.edit("practice/le-chatelier.md", "falls at higher temperature.", `falls at higher temperature. The ammonia synthesis is an exothermic reaction (${b}).`);
    });
    return c.gate().findings.filter((f) => f.kind === "value-disagreement" && f.statusClass === "defect");
  };
  assert.equal(plant("$\\Delta H = -92.2\\ \\text{kJ}$", "$\\Delta H = -46.1\\ \\text{kJ}$").length, 1, "control");
  assert.equal(plant("$\\Delta H = - 92.2\\ \\text{kJ}$", "$\\Delta H = 92.2\\ \\text{kJ}$").length, 1, "a spaced minus is a sign");
  assert.equal(plant("$\\Delta H = &minus;92.2\\ \\text{kJ}$", "$\\Delta H = 92.2\\ \\text{kJ}$").length, 1, "an HTML minus is a sign");
  const molar = plant("$\\Delta H = -92.2\\ \\text{kJ mol}^{-1}$", "$\\Delta H = -46.1\\ \\text{kJ/mol}$");
  assert.equal(molar.length, 1, "kJ mol^{-1} is kJ/mol");
  assert.equal(plant("$\\Delta H = -92.2\\ \\text{kJ mol}^{-1}$", "$\\Delta H = -92.2\\ \\text{kJ/mol}$").length, 0, "the same molar value agrees");
  assert.equal(plant("releases 1,200 kJ", "releases 200 kJ").length, 1, "a thousands separator is one number");
});

// ================================================ HYPOTHETICAL SCOPE =============================================
test("[req.verdict.hypothetical-scope] R2-K09: a cue word in a study-guide fact ('a temperature a student can use') never makes it exercise data", async (t) => {
  const SENT = "Most plants still run the original Haber process at about 900 °C, a temperature a student can use to judge the compromise.";
  const e = course(t);
  const r = await addAndVerify(e, SENT, "hypothetical", [], ["haber"]);
  assert.ok(!r.mine.some((f) => f.kind === "exercise-data-confirm"), "not asked as exercise data");
  assert.ok(r.mine.some((f) => f.kind === "evidence-missing" && f.statusClass === "obligation"), "evidence still missing");
  const d = buildDigest(e.root, r.g.findings, unitInfoOf(e.root, e.r()));
  if (d.entries.some((x) => x.recommendation != null)) answerDigest(e.root, d, { acceptAll: true, instructorWords: "Accept all your recommendations.", reader: e.r() }, I);
  assert.ok(!(e.unit(r.u.id).evidence || []).some((x) => x.type === "instructor-confirmation"), "accept-all confirms nothing");
  assert.ok(mineOf(e.gate(), r.u.id).some((f) => f.kind === "evidence-missing"), "still owed after accept-all");
  assert.equal(e.gate().gate.canPublish, false);
  // control: a practice question's invented value is still the instructor's to confirm
  const c = course(t); c.pin("openstax133");
  const q = c.units().find((u) => u.id === "u-practice-chemical-equilibrium-questions-11");
  await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay("hypothetical", []), only: [q.id] });
  assert.ok(c.gate().findings.some((f) => f.kind === "exercise-data-confirm" && f.units.includes(q.id) && f.recommendation === "confirm"));
});

// ================================================ KNOWLEDGE CONCERNS =============================================
test("[req.knowledge.concern-located] R2-K10: a concern quoting the rendered passage ('ΔH < 0' for '$\\Delta H < 0$') is raised; one quoting words the passage lacks makes the review unscorable, never clean", async (t) => {
  const run = async (concerns) => {
    const c = course(t);
    const u = c.units().find((x) => x.text.includes("($\\Delta H < 0$) — heat is a **product**"));
    await verifyKnowledge(c.root, c.r(), { verifier: replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns })), only: [u.id] });
    return { c, u, mine: mineOf(c.gate(), u.id) };
  };
  const wrong = (text) => ({ kind: "wrong", text, problem: "the sign convention is stated for the system, say so", suggestion: text.replace("<", "is negative,") });
  for (const quote of ["reaction ($\\Delta H < 0$) — heat is a **product**", "reaction (ΔH < 0) — heat is a product", "(ΔH < 0) — heat is a product"]) {
    const { mine } = await run([wrong(quote)]);
    assert.ok(mine.some((f) => f.kind === "knowledge-concern"), `${quote}: raised (${kinds(mine)})`);
  }
  // a concern about words the passage does not contain: the review cannot be scored, and does not count as a review
  const { c, u, mine } = await run([wrong("an endothermic reaction releases heat to the surroundings")]);
  assert.ok(mine.some((f) => f.kind === "knowledge-unscorable" && f.route === "agent"), kinds(mine).join(", "));
  assert.ok(!mine.some((f) => f.kind === "knowledge-concern"));
  assert.ok(unreviewedKnowledge(c.root, c.r()).includes(u.id), "not a review of the unit");
  // a clean review of the same text is a review, and raises nothing
  const ok = await run([]);
  assert.ok(!ok.mine.some((f) => /concern|unscorable/.test(f.kind)), kinds(ok.mine).join(", "));
  assert.ok(!unreviewedKnowledge(ok.c.root, ok.c.r()).includes(ok.u.id));
});

test("[req.knowledge.concern-located] R2-K10: an unscorable review never clears an owed re-verification", async (t) => {
  const c = course(t);
  const PR = "practice/le-chatelier.md", Q6_RAISED = "is exothermic. The temperature is raised. Which way";
  c.asAgent(() => c.edit(PR, Q6_RAISED, Q6_RAISED.replace("raised", "increased")));
  const owed = [...new Set(coreObligations(c.root, c.r(), "t").filter((f) => f.kind === "reverify").flatMap((f) => f.units))];
  assert.ok(owed.length, "an answer owes a re-check");
  const off = replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [{ kind: "wrong", text: "the catalyst raises the equilibrium yield of ammonia", problem: "a catalyst does not change the yield" }] }));
  await verifyKnowledge(c.root, c.r(), { verifier: off, only: owed });
  assert.throws(() => reverifyUnits(c.root, c.r(), owed, AGENT), /cannot be scored/);
  await verifyKnowledge(c.root, c.r(), { verifier: replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [] })), only: owed });
  reverifyUnits(c.root, c.r(), owed, AGENT);
});

// ================================================ ABSOLUTE REVIEWS ===============================================
test("[req.absolute.log-bound] CONTROL handoff: an absolute review counts only through what the log binds — a pre-round-1 record (no recordHash) edited to cover new text does not", (t) => {
  const c = course(t);
  const SENT = "A catalyst always speeds up the forward and the reverse reaction alike.";
  const neighbour = c.units().find((u) => u.text.includes(ANCHOR));
  c.asAgent(() => c.edit(SG, ANCHOR, `${ANCHOR}\n\n${SENT}`));
  const u = c.units().find((x) => x.text === SENT);
  linkUnits(c.root, c.r(), { [u.id]: neighbour.spineNodes }, AGENT);
  const owesReview = () => coreObligations(c.root, c.r(), "t").some((f) => f.kind === "absolute-unreviewed" && f.units.includes(u.id));
  assert.ok(owesReview(), "an absolute owes its context review");
  // a review logged the way records were logged before round 1: bundle and answer hashes, no recordHash
  const sentences = absoluteSentences(u.text), context = SENT;
  const bundle = absoluteBundle(sentences, context, "0123456789abcdef");
  const raw = JSON.stringify({ nonce: "0123456789abcdef", sentences: [{ n: 1, class: "casual", why: "test double" }] });
  const dispatch = `d-${bundle.bundleHash.slice(0, 16)}`;
  const record = { schemaVersion: 1, dispatch, kind: "absolute", unit: u.id, at: new Date().toISOString(), bundle: { nonce: bundle.nonce, bundleHash: bundle.bundleHash, prompt: bundle.prompt }, passages: [], answer: { mode: "replay", raw, model: "replay", costUsd: 0, responseHash: sha256(raw) }, admission: { status: "reviewed" }, sentences, context, absolutesHash: absolutesHash(u.text) };
  const file = recordFile(c.root, `metadata/verification/${dispatch}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  appendLogRecord(c.root, { type: "dispatch", party: { role: "harness", name: "verify" }, payload: { dispatch, kind: "absolute", unit: u.id, bundleHash: bundle.bundleHash, responseHash: sha256(raw), mode: "replay", status: "reviewed" } });
  assert.ok(reviewedAbsolutes(c.root).has(`${u.id}|${absolutesHash(u.text)}`), "a legacy record counts through its logged prompt and answer");
  assert.ok(!owesReview());
  // the sentence changes; the record's editable fields are rewritten to claim the new sentence was reviewed
  const NEW = "A catalyst never changes the composition of the equilibrium mixture.";
  c.asAgent(() => c.edit(SG, SENT, NEW));
  const v = c.units().find((x) => x.text === NEW);
  fs.writeFileSync(file, JSON.stringify({ ...record, unit: v.id, sentences: absoluteSentences(NEW), context: NEW, absolutesHash: absolutesHash(NEW) }, null, 2) + "\n");
  assert.ok(!reviewedAbsolutes(c.root).has(`${v.id}|${absolutesHash(NEW)}`), "the edited fields are not what the log binds");
  assert.ok(coreObligations(c.root, c.r(), "t").some((f) => f.kind === "absolute-unreviewed" && f.units.includes(v.id)), "the new sentence owes a fresh review");
});

// ================================================ BINDINGS =======================================================
test("[req.dependency.binding-parser] COHERENCE F7: 'whose K is 50' is the binding K = 50 — a changed K reaches the rephrased question", (t) => {
  for (const s of ["whose $K$ is 50", "($K = 50$)", "K equals 50", "K of 50", "$K \\approx 50$"]) assert.ok(bindings(s).includes("K=50"), `${s}: ${bindings(s)}`);
  assert.deepEqual(bindings("$K_c = 4.0$"), bindings("K_c is 4"), "one binding, however written");
  const c = course(t);
  const ce = "practice/chemical-equilibrium.md";
  c.asAgent(() => c.edit(ce, "For the same reaction ($K = 50$), a second mixture", "For the same reaction, whose $K$ is 50, a second mixture"));
  const Q7 = c.units().find((u) => u.locator.deliverable === ce && u.text.startsWith("For the same reaction, whose $K$ is 50")).id;
  c.asAgent(() => c.edit(ce, "For a reaction with $K = 50$, a mixture is found to have $Q_r = 12$.", "For a reaction with $K = 500$, a mixture is found to have $Q_r = 12$."));
  const re = new Set(c.gate().findings.filter((f) => f.kind === "reverify").flatMap((f) => f.units));
  assert.ok(re.has(Q7), `Q7 ("whose K is 50") is found: ${[...re].join(", ")}`);
});
