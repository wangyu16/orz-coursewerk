// RED-TEAM ROUND P7-1 (T4) — every bypass the round found, kept as a probe. The verifier is a replay that answers as a
// hostile or mistaken verifier would; the agent edits package files directly where the attack needs it. A probe holds
// when the gate (MS1, MS8, the core obligations) blocks the wrong fact, or the harness refuses the harmful edit.
// Record of the round: system/rounds/P7-verdicts.md.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { beginSession, claimAuthorship } from "../scripts/lib/core/units_index.mjs";
import { confirmUnits, coreObligations, indexAndStamp, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { runCheckpoint } from "../scripts/lib/skeleton/runner.mjs";
import { checkableClaims, checkableClaims as semiClaimsOf, quantitiesIn, yearsIn } from "../scripts/lib/verify/claims.mjs";
import { classifyUnit } from "../scripts/lib/core/segment.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { admit } from "../scripts/lib/verify/admission.mjs";
import { fsInputReader, pinnedTexts, pinReference, syncReferenceRecord } from "../scripts/lib/verify/references.mjs";
import { applyCorrection, readmitRecorded, revertCorrection, verifySemi } from "../scripts/lib/verify/verdicts.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const reg = (...names) => ({ schemaVersion: 1, __noStandard: true, modules: names.map((name) => ({ name, version: "1.0.0", maturity: "stable", enabled: true })) });
const T = "u-study-guide-le-chatelier-the-principle-2";
const W = "u-study-guide-le-chatelier-worked-examples-2";
const NAMING = "The principle is named after French chemist Henry Louis Le Chatelier, who enunciated it in 1884 by extending the reasoning from the van 't Hoff relation of temperature to pressure and chemical potential. It is sometimes also credited to Karl Ferdinand Braun, who discovered it independently in 1887, so it is also called the Le Chatelier–Braun principle.";
const HABER = "For the ammonia synthesis reaction N2 + 3 H2 ⇌ 2 NH3 the standard reaction enthalpy is −92.4 kJ per mole of reaction, so by Le Chatelier's principle raising the temperature shifts the reaction toward the reactants.";

function copy(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-redteam-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(C2, path.join(dir, "pkg"), { recursive: true }); fs.cpSync(INPUTS, path.join(dir, "inputs"), { recursive: true });
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  return { root, inputs, reader: liveReader(root), edit: (rel, fn) => { const f = path.join(root, rel); fs.writeFileSync(f, fn(fs.readFileSync(f, "utf8"))); }, json: (rel, fn) => { const f = path.join(root, rel); fs.writeFileSync(f, JSON.stringify(fn(JSON.parse(fs.readFileSync(f, "utf8"))), null, 2)); } };
}
const texts = (p) => pinnedTexts(fsInputReader(p.inputs));
const plain = (p) => new Map([...texts(p)].filter(([, v]) => v.ok).map(([k, v]) => [k, v.text]));
const unit = (p, id) => loadUnits(p.root, p.reader).find((u) => u.id === id);
const nonceOf = (prompt) => prompt.match(/"nonce": "([0-9a-f]+)"/)[1];
const passagesOf = (prompt) => prompt.split("\nPASSAGES\n")[1].split("\n").map((l) => l.match(/^\[(\d+)\] (.*)$/)).filter(Boolean).map((m) => ({ n: Number(m[1]), text: m[2] }));
const claimCount = (prompt) => prompt.split("\nCLAIMS\n")[1].split("\n\nPASSAGES")[0].split("\n").filter((l) => /^\d+\. /.test(l)).length;
/** A verifier that answers every claim with the same verdict and quotes (each found in whichever shown passage holds it). */
const saying = (verdict, ...quotes) => replayVerifier((prompt) => {
  const ps = passagesOf(prompt);
  const qs = quotes.map((q) => { const x = ps.find((pp) => pp.text.includes(q)); return x && { passage: x.n, text: q }; }).filter(Boolean);
  return { nonce: nonceOf(prompt), claims: Array.from({ length: claimCount(prompt) }, (_, i) => ({ claim: i + 1, verdict, quotes: qs })) };
});
/** Replace a unit's text as the agent, inside a session; returns the unit id. */
function rewrite(p, id, fn) {
  const old = unit(p, id).text;
  beginSession(p.root, p.reader, AGENT);
  p.edit(unit(p, id).locator.deliverable, (x) => x.replace(old, fn(old)));
  indexAndStamp(p.root, p.reader, { as: "agent", party: AGENT });
  return loadUnits(p.root, p.reader).find((u) => u.text === fn(old)).id;
}
/** The same, edited outside any agent session (an edit of unknown authorship, for the instructor to claim). */
function rewriteUnattributed(p, id, fn) {
  const old = unit(p, id).text;
  p.edit(unit(p, id).locator.deliverable, (x) => x.replace(old, fn(old)));
  indexAndStamp(p.root, p.reader, {});
  return loadUnits(p.root, p.reader).find((u) => u.text === fn(old)).id;
}
/** The gate's verdict for a unit: MS1/MS8 findings for it, and whether its evidence obligation is open. */
function gate(p, id) {
  const r = runCheckpoint({ root: p.root, checkpoint: "V8", profile: "public", registry: reg("ms1-sources", "ms8-verdicts"), inputsDir: p.inputs });
  const findings = r.findings.filter((f) => ["ms1-sources", "ms8-verdicts"].includes(f.module)).map((f) => `${f.kind}:${f.statusClass}`);
  const open = coreObligations(p.root, p.reader, "t").some((f) => ["evidence-missing", "absolute-unreviewed"].includes(f.kind) && f.units.includes(id));
  return { findings, open, blocked: open || findings.some((k) => /:defect$/.test(k)) };
}
async function honestNaming(p) {
  pinReference(p.root, p.inputs, { url: "https://en.wikipedia.org/wiki/Le_Chatelier%27s_principle", title: "Le Chatelier's principle (pin)", destination: "en.wikipedia.org", text: NAMING });
  const r = await verifySemi(p.root, p.reader, { texts: texts(p), verifier: saying("supported", "named after French chemist Henry Louis Le Chatelier, who enunciated it in 1884 by extending the reasoning from the van 't Hoff relation of temperature to pressure and chemical potential", "Karl Ferdinand Braun, who discovered it independently in 1887, so it is also called the Le Chatelier–Braun principle"), only: [T] });
  syncReferenceRecord(p.root, p.inputs);
  return r[0];
}

test("[req.verdict.semi-mechanical] round P7-1 B1 B4 B5 B6: an edit to an admitted claim sentence voids its quote evidence", async (t) => {
  for (const [label, fn] of [
    ["years swapped", (x) => x.replace("1884", "18X4").replace("1887", "1884").replace("18X4", "1887")],
    ["sentence-initial name swapped", (x) => x.replace("Karl Ferdinand Braun discovered", "Ostwald discovered")],
  ]) {
    const p = copy(t);
    assert.equal((await honestNaming(p)).status, "admitted", label);
    assert.equal(gate(p, T).blocked, false, `${label}: honest evidence passes`);
    const id = rewrite(p, T, fn);
    assert.equal(gate(p, id).open, true, `${label}: the evidence no longer counts`);
  }
  const q = copy(t);
  pinReference(q.root, q.inputs, { url: "https://openstax.org/books/chemistry-2e/pages/13-3-x", title: "pin", destination: "openstax.org/books/chemistry-2e", text: HABER });
  const v = saying("supported", "the standard reaction enthalpy is −92.4 kJ per mole of reaction, so by Le Chatelier's principle raising the temperature shifts the reaction toward the reactants");
  assert.equal((await verifySemi(q.root, q.reader, { texts: texts(q), verifier: v, only: [W] }))[0].status, "admitted", "honest support first");
  assert.equal(gate(q, W).open, false);
  for (const [label, fn] of [["per gram", (x) => x.replace("\\text{kJ mol}^{-1}$ are from", "\\text{kJ g}^{-1}$ are from")], ["physics reversed", (x) => x.replace("**left**", "**right**").replace("**decreases**", "**increases**")]]) {
    const id = rewrite(q, unit(q, W) ? W : loadUnits(q.root, q.reader).find((u) => u.locator.deliverable === "study-guide/le-chatelier.md" && /from the source/.test(u.text)).id, fn);
    assert.equal(gate(q, id).open, true, `${label}: re-verification needed`);
  }
});

test("[req.verdict.semi-mechanical] round P7-1 B2 B3 B10 B8: swapped values, another person's year, a namesake, an unrelated 'only' are not admitted", async (t) => {
  const p = copy(t);
  pinReference(p.root, p.inputs, { url: "https://en.wikipedia.org/wiki/Le_Chatelier%27s_principle", title: "pin", destination: "en.wikipedia.org", text: NAMING + " A similar concept also named after Le Chatelier was introduced by American economist Paul Samuelson in 1947. A catalyst does not alter the equilibrium constant of a reaction. Only a change of temperature alters the equilibrium constant of a reaction." });
  const cases = [
    ["swap", (x) => x.replace("1884", "18X4").replace("1887", "1884").replace("18X4", "1887"), ["named after French chemist Henry Louis Le Chatelier, who enunciated it in 1884 by extending the reasoning from the van 't Hoff relation of temperature to pressure and chemical potential", "Karl Ferdinand Braun, who discovered it independently in 1887, so it is also called the Le Chatelier–Braun principle"]],
    ["another person's year", () => "The principle is named after Le Chatelier, who introduced it in 1947 as a principle about chemical equilibrium.", ["also named after Le Chatelier was introduced by American economist Paul Samuelson in 1947"]],
    ["namesake", () => "The principle was discovered independently in 1887 by the engineer Wernher von Braun.", ["Karl Ferdinand Braun, who discovered it independently in 1887"]],
    ["unrelated only", () => "Adding a catalyst is the only change that alters the equilibrium constant of a reaction.", ["A catalyst does not alter the equilibrium constant of a reaction", "Only a change of temperature alters the equilibrium constant of a reaction"]],
  ];
  let id = T;
  for (const [label, fn, quotes] of cases) {
    id = rewrite(p, id, fn);
    const r = await verifySemi(p.root, p.reader, { texts: texts(p), verifier: saying("supported", ...quotes), only: [id] });
    assert.notEqual(r[0]?.status, "admitted", label);
    assert.equal(gate(p, id).open, true, label);
  }
});

test("[req.verdict.semi-mechanical] round P7-1 B11 B15 B19: invisible characters, en-dash minus, scientific notation and LaTeX values are read", () => {
  assert.deepEqual(yearsIn("in 18​87 and １９０１"), ["1887", "1901"]);
  assert.deepEqual(quantitiesIn("about –46 kJ per mole").map((q) => q.value), [-46]);
  assert.deepEqual(quantitiesIn("$-7.5 \\times 10^{4}\\ \\text{J}$").map((q) => q.value), [-75000]);
  assert.ok(classifyUnit({ form: "equation", text: "$$\\ce{N2 + 3 H2 <=> 2 NH3} \\qquad \\Delta H = -75\\ \\text{kJ mol}^{-1}$$" }).includes("semi-mechanical"), "a LaTeX value is a semi-mechanical fact");
  assert.ok(classifyUnit({ form: "paragraph", text: "The reaction releases $92\\ \\text{kJ}$ of heat per mole of reaction as it proceeds." }).includes("semi-mechanical"));
  assert.equal(checkableClaims("- **\"At equilibrium the reactions have stopped.\"** No — the rates are equal but nonzero.").length, 0, "no checkable token: the knowledge path, not the verdict path (D28)");
});

test("[req.verdict.semi-mechanical] round P7-1 B12 B13 B17 B21: hand-written evidence, records, confirmations and pins do not count", async (t) => {
  const p = copy(t);
  await honestNaming(p);
  const side = "metadata/units/study-guide/le-chatelier.md.json";
  // (a) a hand-written dispatch record, not in the log, offered to readmit
  const rec = fs.readdirSync(path.join(p.root, "metadata", "verification"))[0];
  const forged = JSON.parse(fs.readFileSync(path.join(p.root, "metadata", "verification", rec), "utf8"));
  forged.dispatch = "d-forged0000000000"; forged.unit = "u-study-guide-le-chatelier-the-principle-1";
  fs.writeFileSync(path.join(p.root, "metadata", "verification", "d-forged0000000000.json"), JSON.stringify(forged));
  assert.deepEqual(readmitRecorded(p.root, p.reader, { texts: texts(p) }), [], "readmit ignores unlogged records");
  assert.ok(gate(p, T).findings.includes("dispatch-unlogged:defect"));
  fs.rmSync(path.join(p.root, "metadata", "verification", "d-forged0000000000.json"));
  // (b) evidence quotes swapped for fragments the dispatch never admitted
  p.json(side, (s) => { const u = s.units.find((x) => x.id === T); u.evidence.find((e) => e.type === "quote-verified").quotes[0].span[1] -= 20; return s; });
  assert.ok(gate(p, T).blocked, "evidence that is not its dispatch's admission is a defect");
  // (c) forged confirmation and divergence evidence (no instructor log record) count for nothing
  const q = copy(t);
  const fh = (await import("../scripts/lib/core/dependencies.mjs")).factHash(unit(q, T).text);
  q.json(side, (s) => { const u = s.units.find((x) => x.id === T); u.evidence = [{ type: "instructor-confirmation", by: I.name, at: "2026-10-01T00:00:00Z", factHash: fh }, { type: "authorized-divergence", by: I.name, at: "2026-10-01T00:00:00Z", factHash: fh, correction: "c-forged", note: "x" }]; u.judgment = ["knowledge-based"]; return s; });
  assert.equal(gate(q, T).open, true, "the judgment is recomputed and forged instructor acts are not in the log");
  // (d) a reference text placed in the inputs by hand (no logged pin)
  const r = copy(t);
  const reg2 = { schemaVersion: 1, references: [{ refId: "ref-hand", url: "https://en.wikipedia.org/wiki/X", title: "X", destination: "en.wikipedia.org", retrievedAt: "2026-10-01T00:00:00Z", sha256: (await import("../scripts/lib/records/canonical.mjs")).sha256(NAMING), textPath: ".coursewerk-reference-text/ref-hand.txt", queries: [] }] };
  fs.mkdirSync(path.join(r.inputs, ".coursewerk-reference-text"), { recursive: true });
  fs.writeFileSync(path.join(r.inputs, ".coursewerk-reference-text", "ref-hand.txt"), NAMING);
  fs.writeFileSync(path.join(r.inputs, "REFERENCES.json"), JSON.stringify(reg2));
  await verifySemi(r.root, r.reader, { texts: texts(r), verifier: saying("supported", "named after French chemist Henry Louis Le Chatelier, who enunciated it in 1884 by extending the reasoning from the van 't Hoff relation of temperature to pressure and chemical potential", "Karl Ferdinand Braun, who discovered it independently in 1887, so it is also called the Le Chatelier–Braun principle"), only: [T] });
  syncReferenceRecord(r.root, r.inputs);
  assert.ok(gate(r, T).findings.includes("evidence-span-unresolved:defect"), "a quote from an unlogged pin is a defect");
});

test("[req.autocorrect.guard] round P7-1 B14 B16 p22: no correction from an unanchored or foreign quote, a sidecar flip, a duplicated page, or a deleted record", async (t) => {
  // B14: a truthful quote about another process; nothing but the contradicted values links it to the claim
  const p = copy(t);
  pinReference(p.root, p.inputs, { url: "https://en.wikipedia.org/wiki/Ostwald_process", title: "pin", destination: "en.wikipedia.org", text: "In the Ostwald process for nitric acid, ammonia is oxidized industrially at about 850 °C and 10 atm over a platinum catalyst." });
  const id = rewrite(p, T, () => "Industrial ammonia synthesis runs at about 450 °C and 200 atm over an iron catalyst.");
  await verifySemi(p.root, p.reader, { texts: texts(p), verifier: saying("contradicted", "ammonia is oxidized industrially at about 850 °C and 10 atm over a platinum catalyst"), only: [id] });
  assert.equal(applyCorrection(p.root, p.reader, { unitId: id, plainTexts: plain(p) }, AGENT).applied, false);
  assert.ok(!gate(p, id).findings.includes("fact-contradicted:defect"), "at most a question");
  // B16: instructor text stays instructor text when the sidecar origin is flipped; the same page twice is one source
  const q = copy(t);
  const wid = rewriteUnattributed(q, W, (x) => x.replace("-92\\ \\text{kJ mol}^{-1}$ are from", "-75\\ \\text{kJ mol}^{-1}$ are from"));
  claimAuthorship(q.root, { units: [wid] }, I);
  q.json("metadata/units/study-guide/le-chatelier.md.json", (s) => { s.units.find((x) => x.id === wid).origin = { kind: "agent-knowledge", model: "m", step: "s", date: "2026-10-01" }; return s; });
  for (const url of ["https://openstax.org/books/chemistry-2e/pages/13-3-x", "https://openstax.org/books/chemistry-2e/pages/13-3-x?print=1"])
    pinReference(q.root, q.inputs, { url, title: "pin", destination: "openstax.org/books/chemistry-2e", text: HABER });
  for (let k = 0; k < 2; k++) await verifySemi(q.root, q.reader, { texts: texts(q), verifier: saying("contradicted", "the standard reaction enthalpy is −92.4 kJ per mole of reaction, so by Le Chatelier's principle raising the temperature shifts the reaction toward the reactants"), only: [wid] });
  const g = applyCorrection(q.root, q.reader, { unitId: wid, plainTexts: plain(q), meta: texts(q) }, AGENT);
  assert.equal(g.applied, false); assert.match(g.question.reason, /two agreeing sources/);
  // p22: deleting the contradicting record leaves a defect, and a batched confirmation cannot launder it
  const rec = fs.readdirSync(path.join(q.root, "metadata", "verification"))[0];
  assert.throws(() => confirmUnits(q.root, q.reader, [wid], { what: "fact" }, I), /contradicts or disputes/);
  fs.rmSync(path.join(q.root, "metadata", "verification", rec));
  assert.ok(gate(q, wid).findings.includes("dispatch-record-missing:defect"));
});

test("[req.revert.double-confirm] round P7-1 B18: a correction record edited after the fact cannot steer a revert", async (t) => {
  const p = copy(t);
  pinReference(p.root, p.inputs, { url: "https://openstax.org/books/chemistry-2e/pages/13-3-x", title: "pin", destination: "openstax.org/books/chemistry-2e", text: HABER });
  const wid = rewrite(p, W, (x) => x.replace("-92\\ \\text{kJ mol}^{-1}$ are from", "-75\\ \\text{kJ mol}^{-1}$ are from"));
  await verifySemi(p.root, p.reader, { texts: texts(p), verifier: saying("contradicted", "the standard reaction enthalpy is −92.4 kJ per mole of reaction, so by Le Chatelier's principle raising the temperature shifts the reaction toward the reactants"), only: [wid] });
  const c = applyCorrection(p.root, p.reader, { unitId: wid, plainTexts: plain(p) }, AGENT).correction;
  p.json(`metadata/corrections/${c.id}.json`, (r) => { r.before.text = r.before.text.replace("-75", "-50"); return r; });
  assert.throws(() => revertCorrection(p.root, p.reader, c.id, { note: "keep mine" }, I), /does not match its logged autocorrect record/);
});

test("[req.ms3.invisible] round P7-1 B11: an invisible format character in a deliverable is a defect", (t) => {
  const p = copy(t);
  p.edit("study-guide/le-chatelier.md", (x) => x.replace("in 1884", "in 18​84"));
  const r = runCheckpoint({ root: p.root, checkpoint: "V8", profile: "public", registry: reg("ms3-format"), inputsDir: p.inputs });
  assert.ok(r.findings.some((f) => f.module === "ms3-format" && f.statusClass === "defect" && f.evidence.rule === "invisible-character" && /U\+200B/.test(f.evidence.issue)));
});

// ---- round D29-1: the exclusivity rule ---------------------------------------------------------------------------
test("[req.absolute.scope] [req.absolute.review] round D29-1: hidden, doubled, misattached and synonym exclusivities are open, not scoped or absent", async () => {
  const { exclusivityOf, openAbsolutes } = await import("../scripts/lib/verify/claims.mjs");
  for (const t of [
    "Of temperature and a catalyst, only temperature changes the equilibrium constant, and only a catalyst speeds up a reaction.", // two in one sentence (p02)
    "At equilibrium, for the concentrations of products and reactants, only the partial pressure matters.", // a list that is not the set (p03)
    "Temperature alone changes the equilibrium constant.", "A catalyst is the sole factor that speeds a reaction.", "It changes nothing but the rate of the reaction.", // synonyms (p05)
    "The reaction happens only once at room temperature.",
    "Temperature changes the constant on­ly when heated.", "Temperature on*ly* changes the constant.", "Temperature оnly changes the constant.", // hidden spellings (p11)
  ]) assert.equal(exclusivityOf(t)?.open, true, t);
  assert.equal(openAbsolutes("Some framing text. Temperature on*ly* changes the constant.").length, 1, "found whatever the classifier says");
  const { absoluteSentences } = await import("../scripts/lib/verify/absolutes.mjs");
  for (const hidden of ["Temperature on*ly* changes the constant.", "Temperature \u043Enly changes the constant.", "It al\u00ADways shifts.", "It nev\u200Ber shifts."])
    assert.equal(absoluteSentences(hidden).length, 1, `a hidden absolute still goes to review: ${hidden}`);
  const g = exclusivityOf("Only increasing the temperature shifts the equilibrium, not the total pressure.");
  assert.deepEqual(g.positive, ["increasing", "temperature"], "a leading gerund is kept with its noun (p08)");
  assert.deepEqual(exclusivityOf("Only temperature, not a catalyst, shifts the equilibrium of a reaction.").alternatives.map((a) => a.phrase), ["catalyst"], "the not-list stops at the clause (no predicate swallowed)");
});

test("[req.absolute.scope] [req.verdict.semi-mechanical] round D29-1: a denial must govern the predicate; the member must stand alone and be affirmed", () => {
  const ans = (...qs) => JSON.stringify({ nonce: "n", claims: [{ claim: 1, verdict: "supported", quotes: qs.map((text) => ({ passage: 1, text })) }] });
  const run = (claimText, src, ...qs) => admit({ claims: semiClaimsOf(claimText), passages: [{ n: 1, source: "s", text: src }], texts: new Map([["s", src]]), raw: ans(...qs), nonce: "n" }).status;
  const claim = "Of a catalyst and temperature, only temperature increases the rate of a reaction.";
  const T = "Raising the temperature increases the rate of a reaction because more collisions exceed the activation energy.";
  // p07: "without being consumed" and "no suitable catalyst" negate something else
  for (const neg of ["A catalyst increases the rate of a reaction without being consumed in the reaction.", "Reactions run at low rates of chemical reaction when no suitable catalyst is present."])
    assert.equal(run(claim, `${T} ${neg}`, T.slice(0, -1), neg.slice(0, -1)), "not-found", neg);
  // p13: a member sentence whose predicate is negated later in the sentence does not affirm it
  const c13 = "Of a catalyst and the total pressure, only a catalyst changes the equilibrium constant.";
  const s13 = "Adding a catalyst will affect both the forward and reverse rates and will not have an effect on the equilibrium constant. Changing the total pressure does not change the equilibrium constant.";
  assert.equal(run(c13, s13, "Adding a catalyst will affect both the forward and reverse rates and will not have an effect on the equilibrium constant", "Changing the total pressure does not change the equilibrium constant"), "not-found");
  // p06: a member sentence that lists other members does not single it out
  const c6 = "Only temperature shifts the equilibrium of a reaction, not a catalyst.";
  const s6 = "Changes in temperature, pressure, volume, or concentration shift the equilibrium of a reaction. A catalyst does not shift the equilibrium of a reaction.";
  assert.equal(run(c6, s6, "Changes in temperature, pressure, volume, or concentration shift the equilibrium of a reaction", "A catalyst does not shift the equilibrium of a reaction"), "not-found");
  // and the honest conjunction is admitted
  const s9 = "A change in temperature shifts the equilibrium of a reaction and changes its constant. A catalyst does not shift the equilibrium of a reaction.";
  assert.equal(run(c6, s9, "A change in temperature shifts the equilibrium of a reaction and changes its constant", "A catalyst does not shift the equilibrium of a reaction"), "admitted");
});
