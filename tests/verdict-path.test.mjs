// THE SEMI-MECHANICAL VERDICT PATH (redesign P7; D17, D19, D26). The verifier proposes, the harness admits: these tests
// replay verifier answers offline (no network, no model) against the real C2 package and its pinned corpus.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { beginSession, claimAuthorship } from "../scripts/lib/core/units_index.mjs";
import { confirmUnits, coreObligations, indexAndStamp, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { readLogText } from "../scripts/lib/records/log.mjs";
import { runCheckpoint } from "../scripts/lib/skeleton/runner.mjs";
import { semiClaims, namesIn, checkableClaims as checkableClaimsOf } from "../scripts/lib/verify/claims.mjs";
import { admit, locate } from "../scripts/lib/verify/admission.mjs";
import { bundleLeaks, replayVerifier, selectPassages, semiBundle } from "../scripts/lib/verify/dispatch.mjs";
import { fsInputReader, pinnedTexts, pinReference, readReferences, syncReferenceRecord } from "../scripts/lib/verify/references.mjs";
import { allowed, fetchAndPin, queryFor, resolveLinks, searchWikipedia } from "../scripts/lib/verify/retrieval.mjs";
import { applyCorrection, correctionsToShow, reviewAbsolutes, revertCorrection, verifyKnowledge, verifySemi } from "../scripts/lib/verify/verdicts.mjs";
import { readConfig, writeConfig } from "../scripts/lib/records/config.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const reg = (...names) => ({ schemaVersion: 1, __noStandard: true, modules: names.map((name) => ({ name, version: "1.0.0", maturity: "stable", enabled: true })) });

function copy(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-verdict-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(C2, path.join(dir, "pkg"), { recursive: true }); fs.cpSync(INPUTS, path.join(dir, "inputs"), { recursive: true });
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  return { root, inputs, reader: liveReader(root), edit: (rel, fn) => { const f = path.join(root, rel); fs.writeFileSync(f, fn(fs.readFileSync(f, "utf8"))); }, read: (rel) => fs.readFileSync(path.join(root, rel), "utf8") };
}
const texts = (p) => pinnedTexts(fsInputReader(p.inputs));
const plain = (p) => new Map([...texts(p)].filter(([, v]) => v.ok).map(([k, v]) => [k, v.text]));
const run = (p, ...names) => runCheckpoint({ root: p.root, checkpoint: "V8", profile: "public", registry: reg(...names), inputsDir: p.inputs });
const kinds = (r, m) => r.findings.filter((f) => f.module === m).map((f) => `${f.kind}:${f.statusClass}`).sort();
const evidenceMissing = (p) => coreObligations(p.root, p.reader, "t").filter((f) => f.kind === "evidence-missing").map((f) => f.units[0]);

// a replay verifier that answers like a careful verifier would: quote the passage that carries the needle
const nonceOf = (prompt) => prompt.match(/"nonce": "([0-9a-f]+)"/)[1];
const passagesOf = (prompt) => prompt.split("\nPASSAGES\n")[1].split("\n").map((l) => l.match(/^\[(\d+)\] (.*)$/)).filter(Boolean).map((m) => ({ n: Number(m[1]), text: m[2] }));
const claimsOf = (prompt) => prompt.split("\nCLAIMS\n")[1].split("\n\nPASSAGES")[0].split("\n").filter((l) => /^\d+\. /.test(l)).length;
function answering(rule) {
  return replayVerifier((prompt) => {
    const nonce = nonceOf(prompt), ps = passagesOf(prompt), n = claimsOf(prompt);
    return { nonce, claims: Array.from({ length: n }, (_, i) => rule(i + 1, ps, prompt) || { claim: i + 1, verdict: "not-found", quotes: [] }) };
  });
}

// ---- admission (T1) ---------------------------------------------------------------------------------------------
test("[req.verdict.semi-mechanical] a fact is admitted only when the quote is in the pinned text and carries the same year and names", () => {
  const source = "The law of mass action was formulated by Cato Maximilian Guldberg and Peter Waage in 1864, building on Berthollet's ideas about reversible reactions.";
  const texts = new Map([["s", source]]);
  const passages = [{ n: 1, source: "s", text: source }];
  const claims = semiClaims("This form follows from Guldberg and Waage's **law of mass action** (1865): the forward rate equals the reverse rate.");
  assert.deepEqual(claims[0].required.years, ["1865"]); assert.deepEqual(claims[0].required.names, ["Guldberg", "Waage"]);
  const ans = (verdict, text) => JSON.stringify({ nonce: "n1", claims: [{ claim: 1, verdict, quotes: [{ passage: 1, text }] }] });
  // the verifier says "supported" — but the source's year is 1864: the harness refuses
  const a = admit({ claims, passages, texts, raw: ans("supported", "formulated by Cato Maximilian Guldberg and Peter Waage in 1864"), nonce: "n1" });
  assert.equal(a.status, "not-found"); assert.match(a.perClaim[0].reason, /lack 1865/);
  // a paraphrase is not a quote
  assert.equal(admit({ claims, passages, texts, raw: ans("supported", "Guldberg and Waage stated the law of mass action in 1865"), nonce: "n1" }).status, "not-found");
  // the same claim with the source's year is admitted, and the span resolves in the pinned text
  const right = semiClaims("This form follows from Guldberg and Waage's law of mass action (1864): the rates balance.");
  const ok = admit({ claims: right, passages, texts, raw: ans("supported", "The law of mass action was formulated by Cato Maximilian Guldberg and Peter Waage in 1864"), nonce: "n1" });
  assert.equal(ok.status, "admitted");
  const [s, e] = ok.perClaim[0].quotes[0].span; assert.equal(source.slice(s, e), "The law of mass action was formulated by Cato Maximilian Guldberg and Peter Waage in 1864");
  // "contradicted" with a quote that states another year: a year is disputed (a question), never a defect
  const d = admit({ claims, passages, texts, raw: ans("contradicted", "Guldberg and Peter Waage in 1864"), nonce: "n1" });
  assert.equal(d.status, "disputed"); assert.equal(d.perClaim[0].conflicts[0].dimension, "year");
  // a quote that is not in the passage it names admits nothing
  assert.equal(admit({ claims: right, passages, texts, raw: ans("supported", "Waage in 1864 proved everything"), nonce: "n1" }).status, "not-found");
  // a quantity is carried at the claim's precision; folding handles the Unicode minus and LaTeX
  const q = semiClaims("The reaction has $\\Delta H = -92\\ \\text{kJ mol}^{-1}$ for the ammonia synthesis at 25 °C.");
  const qt = new Map([["h", "The ammonia synthesis has a standard reaction enthalpy of −92.4 kJ per mole at 25 °C."]]);
  assert.equal(admit({ claims: q, passages: [{ n: 1, source: "h", text: qt.get("h") }], texts: qt, raw: JSON.stringify({ nonce: "x", claims: [{ claim: 1, verdict: "supported", quotes: [{ passage: 1, text: "ammonia synthesis has a standard reaction enthalpy of −92.4 kJ per mole at 25 °C" }] }] }), nonce: "x" }).status, "admitted");
  assert.ok(locate("reaction enthalpy of -92.4 kJ", qt.get("h")), "folding: Unicode minus = hyphen");
  assert.deepEqual(namesIn("Henry Louis Le Chatelier stated it; Karl Ferdinand Braun found it in 1887."), ["Henry Louis Le Chatelier", "Karl Ferdinand Braun"]);
});

test("[req.verdict.unscorable] an answer that cannot be parsed, or answers another bundle, is unscorable — never a pass or a miss", () => {
  const texts = new Map([["s", "Some pinned text about the 1884 statement of the principle by Le Chatelier."]]);
  const claims = semiClaims("Le Chatelier stated the principle in 1884.");
  const passages = [{ n: 1, source: "s", text: texts.get("s") }];
  for (const raw of ["", "I think it is right.", "{not json", JSON.stringify({ nonce: "other", claims: [] }), JSON.stringify({ nonce: "n", claims: [{ claim: "1", verdict: "yes" }] })]) {
    const a = admit({ claims, passages, texts, raw, nonce: "n" });
    assert.equal(a.status, "unscorable", raw); assert.ok(a.reason);
  }
});

// ---- dispatch (T1, T2) -------------------------------------------------------------------------------------------
test("[req.dispatch.blind] one blind bundle per unit, recorded in the package and logged; replayed offline it admits the same evidence", async (t) => {
  const p = copy(t);
  const before = evidenceMissing(p);
  assert.equal(before.length, 20);
  const units = loadUnits(p.root, p.reader);
  // every bundle is blind: no unit id, file, origin, model or course title
  const course = JSON.parse(p.read("alembic.json")).title;
  for (const u of units.filter((x) => before.includes(x.id))) {
    const claims = semiClaims(u.text), ps = selectPassages(claims, texts(p));
    const b = semiBundle(claims, ps);
    assert.deepEqual(bundleLeaks(b.prompt, { unit: u.id, deliverable: u.locator.deliverable, origin: u.origin, course }), [], u.id);
  }
  // a verifier that supports the Le Chatelier naming claim with the pinned Wikipedia sentence
  const target = "u-study-guide-le-chatelier-the-principle-2";
  const prompts = [];
  const verifier = async (prompt) => { prompts.push(prompt); return answering((i, ps) => null)(prompt); };
  const res = await verifySemi(p.root, p.reader, { texts: texts(p), verifier, only: [target] });
  assert.equal(res.length, 1); assert.equal(prompts.length, 1, "one dispatch per unit");
  const recs = fs.readdirSync(path.join(p.root, "metadata", "verification"));
  assert.equal(recs.length, 1);
  const rec = JSON.parse(fs.readFileSync(path.join(p.root, "metadata", "verification", recs[0]), "utf8"));
  assert.equal(rec.bundle.prompt, prompts[0]); assert.equal(rec.unit, target); assert.ok(rec.answer.responseHash);
  assert.ok(readLogText(p.root).includes(`"dispatch":"${rec.dispatch}"`), "the dispatch is in the decision log");
  assert.equal(res[0].status, "not-found"); assert.ok(evidenceMissing(p).includes(target), "nothing admitted, the obligation stands");
});

test("[req.dispatch.blind] [req.verdict.semi-mechanical] admitted evidence clears the obligation, and the gate re-derives it from the record", async (t) => {
  const p = copy(t);
  const target = "u-study-guide-le-chatelier-the-principle-2";
  const unit = loadUnits(p.root, p.reader).find((u) => u.id === target);
  // pin a reference that states every fact of the unit (as a retrieved page would)
  const ref = pinReference(p.root, p.inputs, { url: "https://en.wikipedia.org/wiki/Le_Chatelier%27s_principle", title: "Le Chatelier's principle (test pin)", destination: "en.wikipedia.org",
    text: "The principle is named after French chemist Henry Louis Le Chatelier, who enunciated it in 1884 by extending the reasoning from the van 't Hoff relation of temperature to pressure and chemical potential. It is sometimes also credited to Karl Ferdinand Braun, who discovered it independently in 1887, so it is also called the Le Chatelier–Braun principle." });
  const sentences = semiClaims(unit.text);
  const verifier = answering((i, ps) => {
    const p0 = ps.find((x) => x.text.includes("enunciated it in 1884"));
    return p0 && { claim: i, verdict: "supported", quotes: [{ passage: p0.n, text: "named after French chemist Henry Louis Le Chatelier, who enunciated it in 1884 by extending the reasoning from the van 't Hoff relation of temperature to pressure and chemical potential" }, { passage: p0.n, text: "Karl Ferdinand Braun, who discovered it independently in 1887, so it is also called the Le Chatelier–Braun principle" }] };
  });
  const res = await verifySemi(p.root, p.reader, { texts: texts(p), verifier, only: [target] });
  assert.equal(res[0].status, "admitted", JSON.stringify(res[0].perClaim));
  assert.ok(!evidenceMissing(p).includes(target), "admitted evidence clears the evidence obligation");
  const ev = loadUnits(p.root, p.reader).find((u) => u.id === target).evidence.find((e) => e.type === "quote-verified");
  assert.equal(ev.source, ref.refId); assert.ok(sentences.length >= 1);
  assert.deepEqual(syncReferenceRecord(p.root, p.inputs).references.map((r) => r.refId), [ref.refId], "the package mirrors the cited pin");
  // the gate re-derives the record: MS8 and MS1 are silent on honest evidence
  assert.deepEqual(kinds(run(p, "ms1-sources", "ms8-verdicts"), "ms8-verdicts"), []);
  assert.deepEqual(kinds(run(p, "ms1-sources"), "ms1-sources"), []);
  // forged evidence is caught: a quote moved off its span, and evidence whose dispatch was never recorded
  p.edit(`metadata/units/study-guide/le-chatelier.md.json`, (x) => { const s = JSON.parse(x); const u = s.units.find((y) => y.id === target); u.evidence.find((e) => e.type === "quote-verified").quotes[0].span[0] += 3; return JSON.stringify(s, null, 2); });
  assert.deepEqual(kinds(run(p, "ms1-sources"), "ms1-sources"), ["evidence-span-unresolved:defect"]);
  p.edit(`metadata/units/study-guide/le-chatelier.md.json`, (x) => { const s = JSON.parse(x); const u = s.units.find((y) => y.id === target); u.evidence.find((e) => e.type === "quote-verified").quotes[0].span[0] -= 3; u.evidence.find((e) => e.type === "quote-verified").dispatch = "d-forged"; return JSON.stringify(s, null, 2); });
  assert.deepEqual(kinds(run(p, "ms8-verdicts"), "ms8-verdicts"), ["evidence-unsupported:defect"]);
});

// ---- retrieval (T1) ----------------------------------------------------------------------------------------------
test("[req.retrieval.claim-only] retrieval sends only the claim, only to declared destinations, pins what it gets, and can be switched off", async (t) => {
  const p = copy(t);
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("list=search")) return { status: 200, url, text: async () => JSON.stringify({ query: { search: [{ title: "Le Chatelier's principle" }] } }) };
    if (url.includes("prop=extracts")) return { status: 200, url, text: async () => JSON.stringify({ query: { pages: [{ title: "Le Chatelier's principle", extract: "Le Chatelier's principle text.", revisions: [{ revid: 42 }] }] } }) };
    return { status: 200, url, text: async () => "<html><title>13.3 Shifting Equilibria</title><main><p>A catalyst does not shift equilibrium.</p></main></html>" };
  };
  const claim = semiClaims("The principle is named for Henry Louis Le Chatelier, who stated it in 1884.")[0];
  await assert.rejects(searchWikipedia(p.root, claim, { fetchImpl }), /retrieval is off/, "no declaration, no retrieval");
  writeConfig(p.root, { ...readConfig(p.root), retrieval: { destinations: ["en.wikipedia.org", "openstax.org/books/chemistry-2e"], context: "chemistry" } });
  const { query, titles } = await searchWikipedia(p.root, claim, { fetchImpl });
  assert.deepEqual(titles, ["Le Chatelier's principle"]);
  assert.equal(query, `${queryFor(claim)} chemistry`);
  const sent = new URL(calls[0]).searchParams.get("srsearch");
  for (const w of sent.split(/\s+/)) assert.ok(claim.text.toLowerCase().includes(w.toLowerCase()) || w === "chemistry", `"${w}" comes from the claim or the declared context`);
  for (const leak of ["u-study", "le-chatelier.md", "Controlled", "chemistry-v2", "agent-knowledge"]) assert.ok(!calls[0].includes(leak), leak);
  const ref = await fetchAndPin(p.root, p.inputs, "https://en.wikipedia.org/wiki/Le_Chatelier%27s_principle", { fetchImpl, query });
  assert.equal(readReferences(p.inputs).references[0].refId, ref.refId);
  assert.equal(ref.revisionId, 42); assert.ok(fs.existsSync(path.join(p.inputs, ref.textPath)));
  assert.deepEqual(syncReferenceRecord(p.root, p.inputs).references, [], "the package lists only references its evidence cites — none yet");
  const os2 = await fetchAndPin(p.root, p.inputs, "https://openstax.org/books/chemistry-2e/pages/13-3-shifting-equilibria-le-chateliers-principle", { fetchImpl });
  assert.match(fs.readFileSync(path.join(p.inputs, os2.textPath), "utf8"), /catalyst does not shift/);
  for (const url of ["https://openstax.org/books/biology-2e/pages/1-1", "https://example.org/x", "http://en.wikipedia.org/wiki/X", "https://en.wikipedia.org.evil.example/wiki/X"])
    await assert.rejects(fetchAndPin(p.root, p.inputs, url, { fetchImpl }), /not inside a declared destination/, url);
  assert.equal(allowed("https://openstax.org/books/chemistry-2e/pages/13-2-equilibrium-constants", ["openstax.org/books/chemistry-2e"]), "openstax.org/books/chemistry-2e");
  writeConfig(p.root, { ...readConfig(p.root), retrieval: false });
  await assert.rejects(fetchAndPin(p.root, p.inputs, "https://en.wikipedia.org/wiki/X", { fetchImpl }), /retrieval is off/);
  assert.ok(calls.every((u) => /^https:\/\/(en\.wikipedia\.org|openstax\.org)\//.test(u)), "nothing else was contacted");
});

test("[req.ms1.span] a reference cited without its pin is an obligation; a pinned text that changed fails its quotes", async (t) => {
  const p = copy(t);
  const target = "u-slides-chemical-equilibrium-slide-9-where-the-form-comes-from-1";
  const ref = pinReference(p.root, p.inputs, { url: "https://en.wikipedia.org/wiki/Law_of_mass_action", title: "Law of mass action (test pin)", destination: "en.wikipedia.org",
    text: "In 1864, Peter Waage and Cato Maximilian Guldberg published the law of mass action; in 1865 Guldberg and Waage extended the law of mass action to the rates of the forward and reverse reactions." });
  const verifier = answering((i, ps) => { const x = ps.find((q) => q.text.includes("in 1865 Guldberg")); return x && { claim: i, verdict: "supported", quotes: [{ passage: x.n, text: "in 1865 Guldberg and Waage extended the law of mass action to the rates of the forward and reverse reactions" }] }; });
  const r = await verifySemi(p.root, p.reader, { texts: texts(p), verifier, only: [target] });
  assert.equal(r[0].status, "admitted", JSON.stringify(r[0]));
  syncReferenceRecord(p.root, p.inputs);
  assert.deepEqual(kinds(run(p, "ms1-sources"), "ms1-sources"), []);
  fs.appendFileSync(path.join(p.inputs, ref.textPath), " (edited)");
  assert.deepEqual(kinds(run(p, "ms1-sources"), "ms1-sources"), ["evidence-span-unresolved:defect"], "the text no longer matches its pin");
  fs.rmSync(path.join(p.inputs, ref.textPath));
  assert.deepEqual(kinds(run(p, "ms1-sources"), "ms1-sources"), ["reference-unpinned:obligation"]);
});

// ---- corrections (T1) --------------------------------------------------------------------------------------------
const HABER = "For the ammonia synthesis reaction N2 + 3 H2 ⇌ 2 NH3 the standard reaction enthalpy is −92.4 kJ per mole of reaction, so by Le Chatelier's principle raising the temperature shifts the reaction toward the reactants.";
const PLANTED = "u-study-guide-le-chatelier-worked-examples-2";
async function plantWrongConstant(p, { asInstructor = false } = {}) {
  if (!asInstructor) beginSession(p.root, p.reader, AGENT);
  p.edit("study-guide/le-chatelier.md", (x) => x.replace("the reaction and $\\Delta H = -92\\ \\text{kJ mol}^{-1}$ are from the source", "the reaction and $\\Delta H = -75\\ \\text{kJ mol}^{-1}$ are from the source"));
  indexAndStamp(p.root, p.reader, asInstructor ? {} : { as: "agent", party: AGENT });
  if (asInstructor) claimAuthorship(p.root, { units: [PLANTED], instructorWords: "That passage is mine." }, I);
  pinReference(p.root, p.inputs, { url: "https://openstax.org/books/chemistry-2e/pages/13-3-shifting-equilibria-le-chateliers-principle", title: "Shifting equilibria (test pin)", destination: "openstax.org/books/chemistry-2e", text: HABER });
  const verifier = answering((i, ps) => { const x = ps.find((q) => q.text.includes("−92.4 kJ")); return x && { claim: i, verdict: "contradicted", quotes: [{ passage: x.n, text: "the standard reaction enthalpy is −92.4 kJ per mole of reaction, so by Le Chatelier's principle raising the temperature shifts the reaction toward the reactants" }] }; });
  return verifySemi(p.root, p.reader, { texts: texts(p), verifier, only: [PLANTED] });
}

test("[req.autocorrect.guard] [req.autocorrect.shown] a planted wrong constant is a defect, corrected with a diff, and shown at the next checkpoint", async (t) => {
  const p = copy(t);
  const r = await plantWrongConstant(p);
  assert.equal(r[0].status, "contradicted", JSON.stringify(r[0]));
  assert.deepEqual(kinds(run(p, "ms8-verdicts"), "ms8-verdicts"), ["fact-contradicted:defect"]);
  assert.throws(() => applyCorrection(p.root, p.reader, { unitId: PLANTED, plainTexts: plain(p) }, I), /agent's/);
  const c = applyCorrection(p.root, p.reader, { unitId: PLANTED, plainTexts: plain(p) }, AGENT);
  assert.equal(c.applied, true, JSON.stringify(c.question));
  assert.match(p.read("study-guide/le-chatelier.md"), /the reaction and \$\\Delta H = -92\.4\\ \\text\{kJ mol\}\^\{-1\}\$ are from the source/);
  assert.match(c.correction.diff, /^- .*-75.*\n\+ .*-92\.4/s);
  assert.ok(readLogText(p.root).includes('"event":"autocorrect"'));
  const shown = correctionsToShow(p.root);
  assert.equal(shown.length, 1); assert.equal(shown[0].unit, PLANTED); assert.ok(shown[0].evidence[0].quote.includes("−92.4 kJ"));
  // the corrected unit carries admitted evidence and the defect is gone
  assert.ok(!evidenceMissing(p).includes(PLANTED));
  assert.deepEqual(kinds(run(p, "ms1-sources", "ms8-verdicts"), "ms8-verdicts"), []);
  correctionsToShow(p.root, { mark: true });
  assert.equal(correctionsToShow(p.root).length, 0, "shown once");
});

test("[req.autocorrect.guard] instructor text needs two agreeing sources; a contested value is a question", async (t) => {
  const p = copy(t);
  await plantWrongConstant(p, { asInstructor: true });
  const one = applyCorrection(p.root, p.reader, { unitId: PLANTED, plainTexts: plain(p) }, AGENT);
  assert.equal(one.applied, false); assert.match(one.question.reason, /two agreeing sources/);
  assert.match(p.read("study-guide/le-chatelier.md"), /-75\\ /, "nothing changed");
  // a second, independent source stating the same value
  pinReference(p.root, p.inputs, { url: "https://en.wikipedia.org/wiki/Haber_process", title: "Haber process (test pin)", destination: "en.wikipedia.org", text: "In the Haber process the ammonia synthesis reaction is exothermic, with a standard reaction enthalpy of −92.4 kJ per mole of reaction, which Le Chatelier's principle uses." });
  const v2 = answering((i, ps) => { const x = ps.find((q) => q.text.includes("In the Haber process the ammonia synthesis")); return x && { claim: i, verdict: "contradicted", quotes: [{ passage: x.n, text: "the ammonia synthesis reaction is exothermic, with a standard reaction enthalpy of −92.4 kJ per mole of reaction, which Le Chatelier's principle uses" }] }; });
  await verifySemi(p.root, p.reader, { texts: texts(p), verifier: v2, only: [PLANTED] });
  const two = applyCorrection(p.root, p.reader, { unitId: PLANTED, plainTexts: plain(p) }, AGENT);
  assert.equal(two.applied, true, JSON.stringify(two.question));
  // contested: a source that states the unit's own value makes the contradiction a question, not a defect
  const q = copy(t);
  pinReference(q.root, q.inputs, { url: "https://en.wikipedia.org/wiki/Ammonia", title: "Ammonia (test pin)", destination: "en.wikipedia.org", text: "One older table gives the ammonia synthesis reaction enthalpy as −75 kJ per mole of reaction under Le Chatelier's principle conditions." });
  const r = await plantWrongConstant(q);
  assert.equal(r[0].status, "disputed", "the value is contested by another pinned source");
  assert.deepEqual(kinds(run(q, "ms8-verdicts"), "ms8-verdicts"), ["fact-disputed:question"]);
  assert.match(run(q, "ms8-verdicts").findings.find((f) => f.kind === "fact-disputed").evidence.note, /^The pinned sources disagree: the text says .+, a source says .+ — keep as written, or change it\?$/, "the instructor reads a question, not a kind");
  assert.equal(applyCorrection(q.root, q.reader, { unitId: PLANTED, plainTexts: plain(q) }, AGENT).applied, false);
});

test("[req.revert.double-confirm] the instructor reverting a correction after seeing it is the double confirmation: the text stands as an authorized divergence", async (t) => {
  const p = copy(t);
  await plantWrongConstant(p);
  const c = applyCorrection(p.root, p.reader, { unitId: PLANTED, plainTexts: plain(p) }, AGENT).correction;
  assert.throws(() => revertCorrection(p.root, p.reader, c.id, { note: "keep" }, AGENT), /instructor's decision/);
  assert.throws(() => revertCorrection(p.root, p.reader, c.id, { note: " " }, I), /note/);
  revertCorrection(p.root, p.reader, c.id, { note: "This course uses the value from our lab manual on purpose." }, I);
  assert.match(p.read("study-guide/le-chatelier.md"), /-75\\ /, "the instructor's text is back");
  const log = readLogText(p.root);
  assert.ok(/"type":"divergence"[^\n]*"weight":"double"/.test(log));
  assert.ok(!evidenceMissing(p).includes(PLANTED), "the divergence is the instructor's decision: no obligation");
  assert.deepEqual(kinds(run(p, "ms8-verdicts"), "ms8-verdicts"), [], "and no defect: the contradiction was seen and overruled");
  const ev = loadUnits(p.root, p.reader).find((u) => u.id === PLANTED).evidence.find((e) => e.type === "authorized-divergence");
  assert.equal(ev.by, I.name); assert.match(ev.note, /lab manual/);
  assert.equal(applyCorrection(p.root, p.reader, { unitId: PLANTED, plainTexts: plain(p) }, AGENT).applied, false, "never re-corrected");
});

test("[req.confirm.single] one batched confirmation clears the evidence obligations of the instructor's facts", (t) => {
  const p = copy(t);
  const ids = evidenceMissing(p).slice(0, 5);
  confirmUnits(p.root, p.reader, ids, { what: "fact", instructorWords: "I confirm these." }, I);
  for (const id of ids) assert.ok(!evidenceMissing(p).includes(id));
  const recs = readLogText(p.root).trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.type === "confirmation");
  assert.equal(recs.length, 1, "one confirmation for the batch"); assert.equal(recs[0].payload.weight, "single"); assert.equal(recs[0].payload.units.length, 5);
  assert.throws(() => confirmUnits(p.root, p.reader, ids, { what: "fact", instructorWords: "I confirm these." }, AGENT), /instructor's/);
});

// ---- knowledge-based (T1) ----------------------------------------------------------------------------------------
test("[req.knowledge.no-autochange] a knowledge-based concern is a question with a suggestion, and nothing changes", async (t) => {
  const p = copy(t);
  const unit = loadUnits(p.root, p.reader).find((u) => u.id === "u-study-guide-le-chatelier-adding-a-catalyst-1");
  const files = () => fs.readdirSync(p.root, { recursive: true }).filter((f) => /\.md$/.test(f)).map((f) => [f, fs.readFileSync(path.join(p.root, f), "utf8")]);
  const before = files();
  const words = unit.text.match(/accelerates the \*\*forward and reverse reactions by the same factor\.\*\*/)[0];
  const verifier = replayVerifier((prompt) => ({ nonce: nonceOf(prompt), concerns: [{ text: words, problem: "It is the rate constants that are multiplied by the same factor; say so.", suggestion: "it multiplies the forward and reverse rate constants by the same factor" }, { text: "words the unit does not contain", problem: "invented", suggestion: "" }] }));
  await verifyKnowledge(p.root, p.reader, { verifier, only: [unit.id] });
  assert.deepEqual(files(), before, "no deliverable changed");
  const r = run(p, "ms8-verdicts");
  const qs = r.findings.filter((f) => f.module === "ms8-verdicts");
  assert.deepEqual(qs.map((f) => `${f.kind}:${f.statusClass}:${f.route}`), ["knowledge-concern:question:digest"], "one question; the concern quoting words the unit lacks is dropped");
  assert.match(qs[0].evidence.suggestion, /rate constants/);
});

// ---- MS4 links (T1) ----------------------------------------------------------------------------------------------
test("[req.ms4.links] external links inside declared destinations are resolved and recorded; MS4 reads the record offline", async (t) => {
  const p = copy(t);
  writeConfig(p.root, { ...readConfig(p.root), retrieval: { destinations: ["en.wikipedia.org"] } });
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return { status: url.includes("Missing") ? 404 : 200, url }; };
  const { resolved, skipped } = await resolveLinks(p.root, ["https://en.wikipedia.org/wiki/Chemical_equilibrium", "https://en.wikipedia.org/wiki/Missing_page", "https://example.org/elsewhere"], { fetchImpl });
  assert.deepEqual(calls, ["https://en.wikipedia.org/wiki/Chemical_equilibrium", "https://en.wikipedia.org/wiki/Missing_page"], "only the declared destination is contacted");
  assert.deepEqual(skipped, ["https://example.org/elsewhere"]);
  assert.deepEqual(resolved.map((r) => r.status), [200, 404]);
  // MS4 offline: a link in a deliverable with no recorded resolution is an obligation; a 200 record clears it
  p.edit("study-guide/le-chatelier.md", (x) => x + "\n\nSee [the article](https://en.wikipedia.org/wiki/Chemical_equilibrium).\n");
  indexAndStamp(p.root, p.reader, { party: I, initialOrigin: null });
  assert.ok(kinds(run(p, "ms4-links"), "ms4-links").includes("external-link-unresolved:obligation"));
  fs.writeFileSync(path.join(p.root, "metadata", "LINK_RESOLUTIONS.json"), JSON.stringify({ schemaVersion: 1, links: resolved }));
  assert.ok(!kinds(run(p, "ms4-links"), "ms4-links").includes("external-link-unresolved:obligation"));
});

test("[req.verdict.semi-mechanical] D27 → D29: negating one alternative is not exclusivity; the member and every named alternative must be quoted; a record superlative needs its own word", () => {
  const src = "The use of a catalyst does not affect the position and composition of the equilibrium. A catalyst changes solely the time taken to reach equilibrium.";
  const texts = new Map([["s", src]]), passages = [{ n: 1, source: "s", text: src }];
  const ans = (...qs) => JSON.stringify({ nonce: "n", claims: [{ claim: 1, verdict: "supported", quotes: qs.map((text) => ({ passage: 1, text })) }] });
  const only = semiClaims("A catalyst changes neither the position nor the composition of the equilibrium, only the time taken to reach it.");
  assert.equal(admit({ claims: only, passages, texts, raw: ans("The use of a catalyst does not affect the position and composition of the equilibrium"), nonce: "n" }).status, "not-found", "the alternatives alone are not the claim (round P7-1, B9)");
  assert.equal(admit({ claims: only, passages, texts, raw: ans("The use of a catalyst does not affect the position and composition of the equilibrium", "A catalyst changes solely the time taken to reach equilibrium"), nonce: "n" }).status, "admitted", "member and both alternatives quoted");
  const first = semiClaims("Le Chatelier was the first to state the principle of the equilibrium for catalyst reactions.");
  assert.equal(admit({ claims: first, passages, texts, raw: ans("The use of a catalyst does not affect the position and composition of the equilibrium"), nonce: "n" }).status, "not-found", "a record superlative needs its own word");
  assert.deepEqual(semiClaims("First, the products are in the denominator; the exponent 2 was dropped from the equilibrium expression of the reaction.")[0]?.required?.superlatives ?? [], [], "an enumeration's First is not a superlative");
});

test("[req.absolute.scope] D29: \"not only\" and degree uses are not absolutes; a scoped \"only\" names its set; an open one is not dispatched", async () => {
  const { exclusivityOf } = await import("../scripts/lib/verify/claims.mjs");
  assert.equal(exclusivityOf("It is evaluated at any composition — not only at equilibrium."), null);
  assert.equal(exclusivityOf("The response only *partially* offsets the disturbance."), null);
  assert.equal(exclusivityOf("The system shifts against the alteration, though only in part."), null);
  assert.deepEqual(exclusivityOf("Of concentration, pressure, a catalyst and temperature, only temperature changes the equilibrium constant."),
    { open: false, positive: ["temperature"], alternatives: [{ phrase: "concentration", keys: ["concentration"] }, { phrase: "pressure", keys: ["pressure"] }, { phrase: "catalyst", keys: ["catalyst"] }] });
  assert.equal(exclusivityOf("Only temperature changes the equilibrium constant, not concentration or pressure.").alternatives.length, 2);
  assert.equal(exclusivityOf("A catalyst changes neither the position nor the composition, only the rate.").open, false);
  for (const open of ["No — only temperature changes $K$.", "Temperature is the only one of these disturbances that changes $K$.", "A catalyst changes neither $K$ nor the position, only the rate."])
    assert.equal(exclusivityOf(open).open, true, `${open}: no set named in words`);
});

test("[req.absolute.scope] [req.verdict.semi-mechanical] D29: a scoped exclusivity is admitted only when the member and every named alternative are quoted", () => {
  const src = "A change in temperature changes the value of the equilibrium constant. Changing the concentration of a reactant does not change the equilibrium constant. A change in pressure does not change the equilibrium constant either.";
  const texts = new Map([["s", src]]), passages = [{ n: 1, source: "s", text: src }];
  const claims = checkableClaimsOf("Of concentration, pressure and temperature, only temperature changes the value of the equilibrium constant.");
  const ans = (...qs) => JSON.stringify({ nonce: "n", claims: [{ claim: 1, verdict: "supported", quotes: qs.map((text) => ({ passage: 1, text })) }] });
  const all = ["A change in temperature changes the value of the equilibrium constant", "Changing the concentration of a reactant does not change the equilibrium constant", "A change in pressure does not change the equilibrium constant either"];
  assert.equal(admit({ claims, passages, texts, raw: ans(...all), nonce: "n" }).status, "admitted");
  const r = admit({ claims, passages, texts, raw: ans(all[0], all[1]), nonce: "n" });
  assert.equal(r.status, "not-found"); assert.match(r.perClaim[0].reason, /not pressure/);
  assert.equal(admit({ claims, passages, texts, raw: ans(all[1], all[2]), nonce: "n" }).status, "not-found", "the member itself must be stated, not negated");
});

test("[req.absolute.scope] [req.absolute.review] D29/D30: an open absolute is not sent to the source verifier; it waits for a context review, which the agent runs — not the instructor", async (t) => {
  const p = copy(t);
  const id = "u-study-guide-chemical-equilibrium-common-misconceptions-5";
  const waiting = () => coreObligations(p.root, p.reader, "t").filter((f) => f.kind === "absolute-unreviewed" && f.units.includes(id));
  assert.equal(waiting().length, 1);
  const prompts = [];
  await verifySemi(p.root, p.reader, { texts: texts(p), verifier: async (pr) => { prompts.push(pr); return { mode: "replay", raw: "" }; }, only: [id] });
  assert.ok(prompts.every((pr) => !/only temperature changes/.test(pr)), "an open absolute is never sent to the source verifier");
  // the context review: the reviewer reads the section and classifies the sentence
  const review = (cls, extra = {}) => replayVerifier((prompt) => ({ nonce: nonceOf(prompt), sentences: prompt.split("\nSENTENCES\n")[1].split("\n\nCONTEXT")[0].split("\n").filter((l) => /^\d+\. /.test(l)).map((_, i) => ({ n: i + 1, class: cls, ...extra })) }));
  const res = await reviewAbsolutes(p.root, p.reader, { verifier: review("over-general", { why: "pressure changes of a gas-phase equilibrium can change K for a non-ideal mixture", suggestion: "Of concentration, a catalyst and temperature, only temperature changes K." }), only: [id] });
  assert.equal(res[0].status, "reviewed");
  assert.equal(waiting().length, 0, "reviewed: nothing waits for the instructor");
  const r = runCheckpoint({ root: p.root, checkpoint: "V8", profile: "public", registry: reg("ms8-verdicts"), inputsDir: p.inputs });
  const q = r.findings.filter((f) => f.kind === "absolute-overgeneral");
  assert.equal(q.length, 1); assert.equal(q[0].statusClass, "question"); assert.equal(q[0].route, "agent", "the agent rewords it; it reaches the instructor only if it stays open");
  // an edit to the sentence needs a new review; the instructor's one confirmation also clears it
  const p2 = copy(t);
  confirmUnits(p2.root, p2.reader, [id], { what: "fact", instructorWords: "I confirm these." }, I);
  assert.equal(coreObligations(p2.root, p2.reader, "t").filter((f) => f.kind === "absolute-unreviewed" && f.units.includes(id)).length, 0);
});

test("[req.absolute.review] D30: casual usage passes; 'accurate in context' must quote the context; an unparseable or unlogged review counts for nothing", async (t) => {
  const { absoluteSentences } = await import("../scripts/lib/verify/absolutes.mjs");
  assert.deepEqual(absoluteSentences("- **\"Raising the temperature always increases the yield.\"** No — for an exothermic reaction it decreases."), [], "a quoted misconception is not the unit's own absolute");
  assert.deepEqual(absoluteSentences("The response only *partially* offsets it. It is evaluated not only at equilibrium."), []);
  assert.deepEqual(absoluteSentences("Of concentration, pressure and temperature, only temperature changes the equilibrium constant."), [], "a scoped only is checked against sources (D29)");
  const p = copy(t);
  const all = loadUnits(p.root, p.reader).filter((u) => absoluteSentences(u.text).length);
  const waiting = () => coreObligations(p.root, p.reader, "t").filter((f) => f.kind === "absolute-unreviewed").length;
  const n0 = waiting();
  const sentencesOfPrompt = (prompt) => prompt.split("\nSENTENCES\n")[1].split("\n\nCONTEXT")[0].split("\n").filter((l) => /^\d+\. /.test(l));
  const [a, b, c] = all.slice(0, 3).map((u) => u.id);
  await reviewAbsolutes(p.root, p.reader, { verifier: replayVerifier((pr) => ({ nonce: nonceOf(pr), sentences: sentencesOfPrompt(pr).map((_, i) => ({ n: i + 1, class: "casual" })) })), only: [a] });
  await reviewAbsolutes(p.root, p.reader, { verifier: replayVerifier((pr) => ({ nonce: nonceOf(pr), sentences: sentencesOfPrompt(pr).map((_, i) => ({ n: i + 1, class: "accurate-in-context", context: "words that are nowhere in the section" })) })), only: [b] });
  await reviewAbsolutes(p.root, p.reader, { verifier: replayVerifier(() => "I think these are fine."), only: [c] });
  assert.equal(waiting(), n0 - 1, "only the well-formed casual review counts");
  // a hand-written review record (not in the log) does not count either
  const recs = fs.readdirSync(path.join(p.root, "metadata", "verification")).map((f) => JSON.parse(fs.readFileSync(path.join(p.root, "metadata", "verification", f), "utf8")));
  const forged = { ...recs.find((r) => r.unit === a), unit: b, dispatch: "d-forgedabsolute00" };
  fs.writeFileSync(path.join(p.root, "metadata", "verification", "d-forgedabsolute00.json"), JSON.stringify(forged));
  assert.equal(waiting(), n0 - 1);
});

// ---- found by the P10 dogfood ---------------------------------------------------------------------------------------
test("[req.verdict.semi-mechanical] P10: a year one pinned text supports and another contradicts is a question, not admitted evidence and never a defect", () => {
  const A = "The law of mass action was formulated by Cato Maximilian Guldberg and Peter Waage in 1864, from studies of reaction rates.";
  const B = "Guldberg and Waage (1865), building on earlier ideas, proposed the law of mass action for reaction rates.";
  const texts = new Map([["a", A], ["b", B]]);
  const claims = semiClaims("Guldberg and Waage formulated the law of mass action in 1864 from studies of reaction rates.");
  const raw = JSON.stringify({ nonce: "n", claims: [{ claim: 1, verdict: "supported", quotes: [{ passage: 1, text: "formulated by Cato Maximilian Guldberg and Peter Waage in 1864" }] }] });
  const r = admit({ claims, passages: [{ n: 1, source: "a", text: A }], texts, raw, nonce: "n" });
  assert.equal(r.status, "disputed"); assert.equal(r.perClaim[0].conflicts[0].sourceId, "b");
  assert.equal(admit({ claims, passages: [{ n: 1, source: "a", text: A }], texts: new Map([["a", A]]), raw, nonce: "n" }).status, "admitted", "with no other source, admitted");
});

test("[req.verdict.semi-mechanical] P10: markup is not a name; an empty --units is refused, never 'every unit'", () => {
  assert.deepEqual(namesIn('flowchart A["Too few products<br/>Shift FORWARD"] --> B'), []);
  const r = spawnSync(process.execPath, [path.join(HERE, "..", "scripts", "verify.mjs"), "knowledge", "--root", C2, "--units", ""], { encoding: "utf8" });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /names no unit/);
});

// ---- found by the P11 dev cases -------------------------------------------------------------------------------------
test("[req.absolute.review] an elided scope quote counts only when every piece is in the section, in order", async () => {
  const { readAbsoluteReview } = await import("../scripts/lib/verify/absolutes.mjs");
  const ctx = "For a gas-phase equilibrium: count the moles of gas on each side. If both sides have equal moles of gas, a pressure change made by changing the volume shifts nothing.";
  const s = ["If both sides have equal moles of gas, a pressure change made by changing the volume shifts nothing."];
  const rv = (context) => readAbsoluteReview(JSON.stringify({ nonce: "n1", sentences: [{ n: 1, class: "accurate-in-context", context }] }), "n1", s, ctx);
  assert.equal(rv("For a gas-phase equilibrium: ... If both sides have equal moles of gas").ok, true, "elided, in order");
  assert.equal(rv("For a gas-phase equilibrium: … made by changing the volume").ok, true, "the single-character ellipsis too");
  assert.equal(rv("made by changing the volume ... For a gas-phase equilibrium").ok, false, "out of order");
  assert.equal(rv("For a gas-phase equilibrium ... at constant temperature").ok, false, "a piece that is not in the section");
  assert.equal(rv("For ... a").ok, false, "pieces too short to be a quote");
});

test("[req.knowledge.review] a concern's quote is matched with math and emphasis markup set aside", async () => {
  const { knowledgeConcerns } = await import("../scripts/lib/verify/verdicts.mjs");
  const unit = "where $R$ is the molar gas constant and $T$ the temperature in degrees Celsius.";
  const rec = (text) => ({ bundle: { nonce: "n1" }, answer: { raw: JSON.stringify({ nonce: "n1", concerns: [{ text, problem: "T must be in kelvin." }] }) } });
  assert.equal(knowledgeConcerns(rec("T the temperature in degrees Celsius"), unit).length, 1, "the reviewer dropped the $ signs");
  assert.equal(knowledgeConcerns(rec("the temperature in degrees Fahrenheit"), unit).length, 0, "words the unit does not contain are still refused");
});

test("[req.knowledge.review] the blind reviewer reads a unit in place: the units before it (an answer's question) and the one after", async (t) => {
  const p = copy(t);
  const units = loadUnits(p.root, p.reader);
  const answer = units.find((u) => u.form === "answer" && u.judgment.includes("knowledge-based") && u.role === "teaching");
  const list = units.filter((u) => u.locator.deliverable === answer.locator.deliverable && u.locator.section === answer.locator.section).sort((a, b) => a.locator.ordinal - b.locator.ordinal);
  const question = list[list.indexOf(answer) - 1];
  let seen = "";
  await verifyKnowledge(p.root, p.reader, { verifier: replayVerifier((pr) => ((seen = pr), { nonce: nonceOf(pr), concerns: [] })), only: [answer.id] });
  const [ctx, passage] = seen.split(/\nPASSAGE(?: \([^)]*\))?\n/);
  assert.ok(ctx.includes("TEXT BEFORE THE PASSAGE") && ctx.includes(question.text.trim().slice(0, 60)), "the question is given as context");
  assert.ok(passage.includes(answer.text.trim().slice(0, 60)) && !passage.includes(question.text.trim().slice(0, 60)), "the passage is the unit alone");
  assert.match(seen, /raise concerns only about words in the PASSAGE/);
});

test("[req.spine.restated] a restated learning objective must say what the approved objective says; notation is not a difference", async (t) => {
  const { restatedObjectiveFindings } = await import("../scripts/lib/core/core_checks.mjs");
  const p = copy(t);
  assert.equal(restatedObjectiveFindings(p.reader, "b").length, 0, "the fixture restates its objectives faithfully");
  const f = path.join(p.root, "study-guide", "le-chatelier.md");
  const s = fs.readFileSync(f, "utf8");
  fs.writeFileSync(f, s.replace("partially counteracts the disturbance.", "partially counteracts the *disturbance*."));
  assert.equal(restatedObjectiveFindings(liveReader(p.root), "b").length, 0, "emphasis is notation");
  fs.writeFileSync(f, s.replace("partially counteracts the disturbance.", "completely cancels the disturbance."));
  const r = restatedObjectiveFindings(liveReader(p.root), "b");
  assert.equal(r.length, 1); assert.equal(r[0].kind, "objective-restated-differently"); assert.equal(r[0].statusClass, "defect"); assert.equal(r[0].route, "agent");
});

test("[req.knowledge.review] the gate reports knowledge units no blind review has read at their current text (best effort, not blocking)", async (t) => {
  const { unreviewedKnowledge } = await import("../scripts/lib/core/obligations.mjs");
  const p = copy(t);
  const u = loadUnits(p.root, p.reader).find((x) => x.judgment.includes("knowledge-based") && x.role === "teaching" && x.form !== "answer");
  const before = unreviewedKnowledge(p.root, p.reader);
  assert.ok(before.includes(u.id), "never reviewed");
  await verifyKnowledge(p.root, p.reader, { verifier: replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [] })), only: [u.id] });
  assert.ok(!unreviewedKnowledge(p.root, p.reader).includes(u.id), "a logged review at the current text counts");
  beginSession(p.root, p.reader, AGENT);
  fs.writeFileSync(path.join(p.root, u.locator.deliverable), fs.readFileSync(path.join(p.root, u.locator.deliverable), "utf8").replace(u.text, `${u.text} This is now stated differently.`));
  indexAndStamp(p.root, p.reader, { as: "agent", party: AGENT });
  assert.ok(unreviewedKnowledge(p.root, liveReader(p.root)).includes(u.id), "a changed text is unreviewed again");
  const g = spawnSync(process.execPath, [path.join(HERE, "..", "scripts", "gate.mjs"), "--root", p.root, "--inputs", p.inputs], { encoding: "utf8" });
  assert.ok(JSON.parse(g.stdout).knowledgeUnreviewed.units.includes(u.id) || JSON.parse(g.stdout).knowledgeUnreviewed.count > 10, "the gate says so");
});

// ---- D35 (operator, 2026-10-02): a clarification is settled between the agents, or is a one-line diff for the instructor
test("[req.knowledge.clarify] the reviewer sorts concerns into wrong and clarify; a clarification of the agent's text is the agent's to apply, of the instructor's a diff to accept", async (t) => {
  const { knowledgeBundle } = await import("../scripts/lib/verify/dispatch.mjs");
  const { buildDigest, answerDigest } = await import("../scripts/lib/core/digest.mjs");
  const { unitInfoOf } = await import("../scripts/lib/core/workflow.mjs");
  const { runGate } = await import("../scripts/lib/skeleton/full_gate.mjs");
  const prompt = knowledgeBundle("A passage.").prompt;
  assert.match(prompt, /"wrong"/); assert.match(prompt, /"clarify"/); assert.match(prompt, /beyond what the passage is about/);
  const p = copy(t);
  const unit = loadUnits(p.root, p.reader).find((u) => u.id === "u-study-guide-le-chatelier-adding-a-catalyst-1");
  const words = unit.text.match(/forward and reverse reactions by the same factor/)[0];
  const clarify = replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [{ kind: "clarify", text: words, problem: "Correct as meant; naming the rate constants removes a misreading.", suggestion: "forward and reverse rate constants by the same factor" }] }));
  await verifyKnowledge(p.root, p.reader, { verifier: clarify, only: [unit.id] });
  const ms8 = () => run(p, "ms8-verdicts").findings.filter((f) => f.module === "ms8-verdicts" && f.units.includes(unit.id)).map((f) => `${f.kind}:${f.statusClass}:${f.route}`);
  assert.deepEqual(ms8(), ["clarification-owed:question:agent"], "the agent's own text: no question for the instructor");
  // the same clarification on the instructor's text: a one-line diff in the digest, recommended "apply"
  const sg = path.join(p.root, "study-guide", "le-chatelier.md");
  fs.writeFileSync(sg, fs.readFileSync(sg, "utf8").replace(unit.text, `${unit.text} (My wording.)`)); // the instructor's own edit
  indexAndStamp(p.root, liveReader(p.root), {});
  claimAuthorship(p.root, { units: [unit.id], instructorWords: "That passage is mine." }, I);
  await verifyKnowledge(p.root, liveReader(p.root), { verifier: clarify, only: [unit.id] });
  assert.deepEqual(ms8(), ["clarification-proposed:question:digest"]);
  const info = () => unitInfoOf(p.root, liveReader(p.root));
  const d = buildDigest(p.root, runGate(p.root, { inputsDir: p.inputs }).findings, info());
  const e = d.entries.find((x) => x.kind === "clarification-proposed");
  assert.ok(e && e.recommendation === "apply"); assert.match(e.question, /^Clarify: ".+" → ".+"/);
  answerDigest(p.root, d, { acceptAll: true, instructorWords: "Fine, apply it.", reader: liveReader(p.root) }, I);
  assert.deepEqual(ms8(), ["clarification-accepted:obligation:agent"], "accepted: applying it is now owed by the agent");
  assert.ok(runGate(p.root, { inputsDir: p.inputs }).gate.blocking.some((f) => f.kind === "clarification-accepted"));
  beginSession(p.root, liveReader(p.root), AGENT);
  const f = path.join(p.root, "study-guide", "le-chatelier.md");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(words, "forward and reverse rate constants by the same factor"));
  indexAndStamp(p.root, liveReader(p.root), { as: "agent", party: AGENT });
  assert.deepEqual(ms8(), [], "applied: the concern is history");
  const u2 = loadUnits(p.root, liveReader(p.root)).find((u) => u.id === unit.id);
  assert.equal(u2.origin.kind, "instructor-authored", "the instructor keeps the credit (D33)"); assert.ok(u2.origin.revisedBy?.length);
  // a concern without a kind (a record before D35) keeps the old path
  await verifyKnowledge(p.root, liveReader(p.root), { verifier: replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [{ text: "rate constants by the same factor", problem: "x", suggestion: "y" }] })), only: [unit.id] });
  assert.ok(ms8().includes("knowledge-concern:question:digest"));
});

test("[req.knowledge.review] the reviewer sees labels, and the question a passage refers to by number is shown, not guessed (P11 pass 4)", async (t) => {
  const p = copy(t);
  const units = loadUnits(p.root, p.reader);
  const answer5 = units.find((u) => u.form === "answer" && /Adding \$\\ce\{H2\}\$ increases the denominator/.test(u.text));
  assert.equal(answer5.label, "Answer 5", "the tab label is kept on the loaded unit");
  let seen = "";
  await verifyKnowledge(p.root, p.reader, { verifier: replayVerifier((pr) => ((seen = pr), { nonce: nonceOf(pr), concerns: [] })), only: [answer5.id] });
  const refs = seen.split("TEXT THE PASSAGE REFERS TO (context only)\n")[1]?.split("\n\nTEXT BEFORE")[0] || "";
  assert.match(refs, /^Q 3: /m, "Q3, which its question names, is shown"); assert.match(refs, /^Answer 3: /m);
  assert.ok(!/^Q 4: /m.test(refs), "only what is referred to");
  assert.match(seen, /^Q 5: Justify the answer to Q3/m, "the units before carry their labels");
  assert.match(seen, /\nPASSAGE \(Answer 5\)\n/);
  assert.match(seen, /do not guess what it says/);
  const sidecar = fs.readFileSync(path.join(p.root, "metadata", "units", "practice", "le-chatelier.md.json"), "utf8");
  assert.ok(!sidecar.includes('"label"'), "the label is read from the text, never stored in the index");
});
