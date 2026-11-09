// How a question reads in Alembic's "Needs you" (owner 2026-11-03, STATUS D-133): written for the instructor, not the
// harness. On the real C2 package, every kind of question Coursewerk hands to the instructor — interrupts, the agent's
// M5 contact, a plan approval, a real correction and every digest kind, each finding shaped exactly as its producer
// shapes it — reads with no file path or line, no harness code and no raw markup; the paths stay in the refs, the codes
// in the assistant's hidden copy, and every finding, basis and answer means what it meant.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { indexAndStamp, openVersionCarrying } from "../scripts/lib/core/obligations.mjs";
import { spineDetailQuestions } from "../scripts/lib/core/core_checks.mjs";
import { spineCritique } from "../scripts/lib/core/critique.mjs";
import { appendLogRecord, parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { makeFinding } from "../scripts/lib/records/findings.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { fsInputReader, pinnedTexts } from "../scripts/lib/verify/references.mjs";
import { applyCorrection, verifySemi } from "../scripts/lib/verify/verdicts.mjs";
import { pinDeclared as pinReference } from "./helpers/destinations.mjs";
import { applyChanges, exportNeeds, handinProblems, NEEDS_FILE } from "../scripts/lib/core/alembic_needs.mjs";
import { forInstructor, harnessTraces, MOVE_CHOICES, plainText, SUGGESTION_CHOICES, wordEntry } from "../scripts/lib/core/needs_wording.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const BY = { id: "u-42", name: "Yu Wang" };

function copy(t) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-wording-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(C2, path.join(dir, "pkg"), { recursive: true }); fs.cpSync(INPUTS, path.join(dir, "inputs"), { recursive: true });
  const root = path.join(dir, "pkg");
  return { root, inputs: path.join(dir, "inputs"), reader: liveReader(root) };
}
/** A real correction (as tests/alembic-needs.test.mjs makes it): a wrong constant, contradicted by a pinned source. */
const PLANTED = "u-study-guide-le-chatelier-worked-examples-2";
const HABER = "For the ammonia synthesis reaction N2 + 3 H2 ⇌ 2 NH3 the standard reaction enthalpy is −92.4 kJ per mole of reaction, so by Le Chatelier's principle raising the temperature shifts the reaction toward the reactants.";
async function plantCorrection(p) {
  beginSession(p.root, p.reader, AGENT);
  const f = path.join(p.root, "study-guide/le-chatelier.md");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("the reaction and $\\Delta H = -92\\ \\text{kJ mol}^{-1}$ are from the source", "the reaction and $\\Delta H = -75\\ \\text{kJ mol}^{-1}$ are from the source"));
  indexAndStamp(p.root, p.reader, { as: "agent", party: AGENT });
  pinReference(p.root, p.inputs, { url: "https://openstax.org/books/chemistry-2e/pages/13-3-shifting-equilibria-le-chateliers-principle", title: "Shifting equilibria (test pin)", destination: "openstax.org/books/chemistry-2e", text: HABER });
  const texts = pinnedTexts(fsInputReader(p.inputs));
  const verifier = replayVerifier((prompt) => {
    const nonce = prompt.match(/"nonce": "([0-9a-f]+)"/)[1];
    const ps = prompt.split("\nPASSAGES\n")[1].split("\n").map((l) => l.match(/^\[(\d+)\] (.*)$/)).filter(Boolean).map((m) => ({ n: Number(m[1]), text: m[2] }));
    const n = prompt.split("\nCLAIMS\n")[1].split("\n\nPASSAGES")[0].split("\n").filter((l) => /^\d+\. /.test(l)).length;
    const x = ps.find((q) => q.text.includes("−92.4 kJ"));
    return { nonce, claims: Array.from({ length: n }, (_, i) => (x ? { claim: i + 1, verdict: "contradicted", quotes: [{ passage: x.n, text: "the standard reaction enthalpy is −92.4 kJ per mole of reaction, so by Le Chatelier's principle raising the temperature shifts the reaction toward the reactants" }] } : { claim: i + 1, verdict: "not-found", quotes: [] })) };
  });
  await verifySemi(p.root, p.reader, { texts, verifier, only: [PLANTED] });
  const plain = new Map([...texts].filter(([, v]) => v.ok).map(([k, v]) => [k, v.text]));
  assert.equal(applyCorrection(p.root, p.reader, { unitId: PLANTED, plainTexts: plain }, AGENT).applied, true);
}

// real units of the C2 package: a study-guide passage, a worked question, a passage of the second chapter
const U1 = "u-study-guide-chemical-equilibrium-the-equilibrium-constant-1";
const U2 = "u-study-guide-chemical-equilibrium-worked-examples-1";
const U3 = "u-study-guide-le-chatelier-changing-the-temperature-1";
const SG1 = "study-guide/chemical-equilibrium.md", SG2 = "study-guide/le-chatelier.md";
const F = (module, kind, units, evidence, more = {}) => makeFinding({ module, kind, units, statusClass: "question", route: "digest", basis: "b", evidence, ...more });

/** Each digest kind, its evidence shaped exactly as its producer shapes it (the producer's own note templates). */
function digestFindings(p) {
  const kq = "the equilibrium constant $K_c$ of {{sp[info] Objective 18.5a}} is $\\frac{[\\ce{NH3}]^2}{[\\ce{N2}][\\ce{H2}]^3}$";
  const ks = "$K_c = \\frac{[\\ce{NH3}]^2}{[\\ce{N2}][\\ce{H2}]^3}$, with each concentration at equilibrium";
  const problem = "The exponent on H2 must be the coefficient 3. The text is otherwise right.";
  return [
    // the real producer of detail-in-spine (core_checks.mjs, D48), on the real package
    ...spineDetailQuestions(p.root, p.reader, "b"),
    F("skeleton", "spine-review-concern", [], { type: "judgment", scope: "course", file: "concepts/course.md", line: 67, text: "- {{sp[info] Objective 18.5a}} Relate $\\Delta G^\\circ$ to $K$ [anchor: gibbs-k]",
      note: `Possibly wrong (concepts/course.md, line 67): "- {{sp[info] Objective 18.5a}} Relate $\\Delta G^\\circ$ to $K$ [anchor: gibbs-k]". The relation is $\\Delta G^\\circ = -RT\\ln K$, so the sign matters. Suggested: "Relate $\\Delta G^\\circ = -RT \\ln K$".`, dispatch: "d-1" }),
    F("ms8-verdicts", "knowledge-concern", [U1], { type: "judgment", note: problem, quote: kq, suggestion: ks, dispatch: "d-2" }, { recommendation: `revise: ${ks}` }),
    F("ms8-verdicts", "knowledge-concern", [U3], { type: "judgment", note: "Heat is a product of an exothermic reaction, not a reactant.", quote: "treat heat as a reactant of the forward reaction H~2~O", dispatch: "d-3" }),
    F("ms8-verdicts", "clarification-proposed", [U3], { type: "judgment", quote: "heat as a participant", suggestion: "heat as a product (exothermic) or a reactant (endothermic)", dispatch: "d-4",
      note: `Clarify: "heat as a participant" → "heat as a product (exothermic) or a reactant (endothermic)". Which side heat goes on depends on the sign of $\\Delta H$.` }),
    F("ms8-verdicts", "instructor-edit-unasked", [U1], { type: "judgment", quote: "each raised to its coefficient", suggestion: "each raised to its **stoichiometric** coefficient", dispatch: "d-5", revisedBy: null,
      note: `Your text was edited without your answer: the agent wrote the reviewer's suggestion "each raised to its **stoichiometric** coefficient" in place of "each raised to its coefficient" (a clarification: precise). Keep the edit, or have it reverted?` }, { recommendation: "keep" }),
    F("ms8-verdicts", "instructor-edit-unasked", ["register:study-guide/le-chatelier.md#3"], { type: "judgment", quote: "Adding argon at constant volume changes nothing.", now: "", instructorText: "register:study-guide/le-chatelier.md#3", before: "Adding argon at constant volume changes nothing.", after: "",
      note: `Your text was removed without your answer: "Adding argon at constant volume changes nothing." (register:study-guide/le-chatelier.md#3) is no longer in the package. Keep it removed, or have it restored?` }, { recommendation: "keep" }),
    F("ms8-verdicts", "instructor-edit-unasked", [U3], { type: "judgment", quote: "$\\Delta H = -92\\ \\text{kJ}$", now: "$\\Delta H = -75\\ \\text{kJ}$", instructorText: "ref-1", before: "x", after: "y", revisedBy: null,
      note: `Your text in ${U3} was changed without your answer — a fact changed (-92 → -75), with no correction record and no second source: "$\\Delta H = -92\\ \\text{kJ}$" now reads "$\\Delta H = -75\\ \\text{kJ}$". Keep the edit, or have it reverted?` }, { recommendation: "revert" }),
    F("ms8-verdicts", "exercise-data-confirm", [U2], { type: "judgment", note: `${U2}: the values here read as invented exercise data, which no source can show — confirm them as teaching hypotheticals?`, quote: "$[\\ce{N2}] = 0.50\\ \\text{M}$ | $[\\ce{H2}] = 1.5\\ \\text{M}$", dispatch: "d-6" }, { recommendation: "confirm" }),
    F("skeleton", "confirmation-stale", [U2], { type: "judgment", note: `You confirmed the facts in ${U2} (${SG1}), but its text has changed since, or your confirmation does not say which text it was for. It now reads: "Write $K_c$ for $\\ce{N2 + 3 H2 <=> 2 NH3}$." — confirm it as it reads now?`, quote: "Write $K_c$ for $\\ce{N2 + 3 H2 <=> 2 NH3}$." }, { recommendation: "confirm" }),
    F("ms8-verdicts", "fact-disputed", [U3], { claimKey: "ck-1", claimText: "$\\Delta H^\\circ = -92.4\\ \\text{kJ mol}^{-1}$ for the Haber process", type: "conflict", dispatch: "d-7", claim: 1, conflicts: [{ claimed: "−92.4 kJ/mol", source: "−91.8 kJ/mol", sentence: "The enthalpy of reaction is −91.8 kJ/mol." }], quotes: [],
      note: `The pinned sources disagree: the text says −92.4 kJ/mol, a source says −91.8 kJ/mol ("The enthalpy of reaction is −91.8 kJ/mol.") — keep as written, or change it?` }),
    F("skeleton", "unit-unknown-authorship", [U1, "u-study-guide-chemical-equilibrium-the-equilibrium-constant-3"], { type: "judgment", note: `${SG1}: 2 passage(s) changed outside an agent session — yours (accept as mine), someone else's (name them), or revert?`, hashes: ["h1", "h2"] }, { recommendation: "accept as mine" }),
    F("ms9-alignment", "off-spine", [U3], { type: "judgment", note: `${U3} teaches nothing in the chapter's approved plan: keep it (the spine may need it) or drop it? (Reviews of this same text disagree: 2 answered, and the adverse answer stands until the text changes or the instructor answers — re-running the review does not clear it.)`, dispatch: "d-8" }),
    F("ms9-alignment", "assessment-fidelity-instructor", [U2], { type: "judgment", guide: "guide.chemical-equilibrium.evidence-design", dispatch: "d-9",
      note: `${U2} is not the level its guide entry asks for (short answer at the level "analyse" (evidence design)): it asks only to recall the expression.` }),
    F("ms7-consistency", "ambiguous-answer", [U2], { type: "judgment", note: `${SG1}: the answer states two different values of one dimension (0.50 M; 1.5 M) — it cannot be compared and a student cannot tell which is the answer. ${U2} (answer) at ${SG1}: "K_c = 0.50 M or 1.5 M" Leave exactly one value as the answer, or move the other into the question or an explanation outside the answer.` }),
    F("ms3-format", "no-photograph", [], { type: "judgment", note: "chapter le-chatelier has no real photograph; record a reviewed, substantive not-used rationale or include a rights-cleared photo" }),
    F("ms5-carriers", "carrier-build-failed", [], { type: "judgment", note: "slides/chemical-equilibrium.md did not build with orz-slides: line 12: unclosed {{nyml}} block" }),
    spineCritique({ kind: "level-mismatch", ids: [], note: "objective.chemical-equilibrium.define-equilibrium asks only to define, but guide.chemical-equilibrium.evidence-design tests analysis; the plan may need a higher objective.", recommendation: "raise the objective to explain", basis: "b" }),
  ];
}

const EVERY = (h) => h.digest.questions.flatMap((q) => [["text", q.text], ["detail", q.detail || ""], ...(q.choices || []).map((c) => ["choice", c]), ["wordsSuggested", q.wordsSuggested || ""]].map(([k, v]) => [q, k, v]));
const needs = (p) => JSON.parse(fs.readFileSync(path.join(p.root, NEEDS_FILE), "utf8"));
const answer = (handin, id, ans, extra = {}) => ({ item: `item-${id}-${ans}`, changesetId: handin.changesetId, question: id, answer: ans, by: BY, at: "2026-11-08T12:00:00.000Z", ...extra });

test("[req.host.alembic-needs-wording] every kind of question reads as the instructor's: no path, line, code or markup; refs, hidden codes and meanings stay", async (t) => {
  const p = copy(t);
  appendLogRecord(p.root, { type: "steering", party: I, payload: { event: "digest-cap", cap: 50, instructorWords: "Up to fifty." } });
  openVersionCarrying(p.root, p.reader, { scopes: ["chapter:le-chatelier"], reason: "objectives split", instructorWords: "Open version 2: the objectives split." }, I);
  await plantCorrection(p);
  appendLogRecord(p.root, { type: "contact", party: AGENT, payload: { moment: "M5", reason: "spine-change-request", question: "concepts/course.md, line 67 lists {{sp[info] Objective 18.5a}} under the wrong chapter: move it to le-chatelier (objective.le-chatelier.predict-shift)?" } });
  const interrupt = makeFinding({ module: "ms2-rights", kind: "rights-source-blocker", units: [], statusClass: "obligation", route: "interrupt", interruptReason: "rights-blocker", basis: "b",
    evidence: { type: "missing", what: "inputs/sources/openstax-13-3.md has no captured rights evidence (run node scripts/capture_rights_evidence.mjs --source openstax-13-3)" } });
  const all = digestFindings(p);
  assert.ok(all.some((f) => f.kind === "detail-in-spine"), "the real package has a real detail-in-spine question");
  // two hand-ins (Alembic takes 20 at a time): the first with the interrupt, the approval and the correction
  const r1 = await exportNeeds(p.root, { changesetId: "wording-0001", gate: { findings: [interrupt, ...all.slice(0, 9)] } });
  const r2 = await exportNeeds(p.root, { changesetId: "wording-0002", gate: { findings: all.slice(9) } });
  const qs = [...r1.handin.digest.questions, ...r2.handin.digest.questions];
  for (const h of [r1.handin, r2.handin]) assert.deepEqual(handinProblems(h), [], "inside Alembic's limits");
  assert.deepEqual([...new Set(r1.handin.digest.questions.map((q) => q.id.split(".")[0]))], ["i", "m5", "approve", "c", "d"]);

  if (process.env.CW_WORDING_DUMP) fs.writeFileSync(process.env.CW_WORDING_DUMP, JSON.stringify(qs.map((q) => ({ id: q.id, text: q.text, detail: q.detail, choices: q.choices, recommended: q.recommended })), null, 2));
  // 1. nothing of the harness in what the instructor reads
  for (const [q, k, v] of [...EVERY(r1.handin), ...EVERY(r2.handin)]) assert.deepEqual(harnessTraces(v), [], `${q.id} ${k}: ${v}`);
  for (const q of qs) assert.ok(/[.?!”]$/.test(q.text), `${q.id} ends a sentence: ${q.text}`);

  // 2. the paths stay in the refs (Alembic shows them as page names)
  const byKind = new Map();
  const rec = { ...needs(p).handins.find((h) => h.changesetId === "wording-0001").questions, ...needs(p).handins.find((h) => h.changesetId === "wording-0002").questions };
  for (const q of qs) { const k = rec[q.id].assistant?.kind; if (!byKind.has(k)) byKind.set(k, []); byKind.get(k).push(q); }
  const one = (k, pick = () => true) => byKind.get(k)?.find(pick) ?? assert.fail(`no ${k} question`);
  const hOf = (q) => [r1.handin, r2.handin].find((h) => h.digest.questions.some((x) => x.id === q.id));
  assert.deepEqual(one("knowledge-concern", (q) => q.choices).refs, [SG1]);
  assert.deepEqual(one("detail-in-spine").refs, ["concepts/chemical-equilibrium.md"]);
  assert.deepEqual(one("spine-review-concern").refs, ["concepts/course.md"]);
  assert.deepEqual(one("correction").refs, [SG2]);
  assert.deepEqual(one("approval").refs, ["concepts/le-chatelier.md", "assessment-support/le-chatelier.md"]);

  // 3. the codes go to the assistant's hidden copy, with the harness's own words; never into the hand-in
  for (const q of qs) { assert.ok(rec[q.id].assistant?.text, `${q.id} keeps the harness's words`); assert.equal(q.assistant, undefined); }
  const dis = rec[one("detail-in-spine").id].assistant;
  assert.ok(dis.codes.files.includes("concepts/chemical-equilibrium.md") && dis.codes.decisions.includes("D48") && dis.codes.lines.length, JSON.stringify(dis.codes));
  assert.ok(harnessTraces(dis.text).length > 0, "the harness's own wording is what the check finds");
  const m5 = rec[one("M5").id].assistant;
  assert.deepEqual(m5.codes.lines, ["concepts/course.md:67"]); assert.deepEqual(m5.codes.nodes, ["objective.le-chatelier.predict-shift"]);
  assert.deepEqual(rec[one("knowledge-concern", (q) => q.choices).id].assistant.units, [U1]);
  assert.ok(rec[one("correction").id].assistant.codes.units.includes(PLANTED));
  assert.ok(rec[one("rights-source-blocker").id].assistant.codes.commands[0].startsWith("node scripts/capture_rights_evidence.mjs"));
  // what apply binds an answer to is the harness's, unchanged: the digest entry carries its finding and evidence as made
  for (const f of all) {
    const e = Object.values(rec).find((x) => x.kind === "digest" && x.entry.findings.includes(f.id))?.entry;
    assert.ok(e, `${f.kind} asked`); assert.deepEqual(e.evidence, f.evidence); assert.equal(e.question, f.evidence.note || f.evidence.what || f.evidence.rule || f.kind);
  }

  // 4. places as the instructor sees them, content as it reads
  assert.match(one("knowledge-concern", (q) => q.choices).text, /^In the study guide for “Chemical Equilibrium”, “the equilibrium constant K_c of Objective 18\.5a is \(\[NH₃\]²\)\/\(\[N₂\]\[H₂\]³\)” may be wrong — The exponent on H2 must be the coefficient 3\. Suggestion: “K_c = \(\[NH₃\]²\)\/\(\[N₂\]\[H₂\]³\), with each concentration at equilibrium”\.$/);
  assert.match(one("spine-review-concern").text, /^In the course map, the line “Objective 18\.5a Relate ΔG° to K” may be wrong — The relation is ΔG° = −RT ln K, so the sign matters\. Suggestion: change it to “Relate ΔG° = −RT ln K”\.$/);
  assert.match(one("M5").text, /^A change to the plan: the course map lists Objective 18\.5a under the wrong chapter: move it to “Le Chatelier.s Principle” \(a point in the plan\)\?$/);
  assert.match(one("correction").text, /^In the study guide for “Le Chatelier's Principle”, the assistant corrected “.*ΔH = −75 kJ mol⁻¹.*” to “.*ΔH = −92\.4 kJ mol⁻¹.*”, because a source contradicted it\. Keep the correction, or undo it\?$/);
  assert.match(one("exercise-data-confirm").text, /the values “\[N₂\] = 0\.50 M” read as made-up exercise data/);
  assert.match(one("unit-unknown-authorship").text, /^In the study guide for “Chemical Equilibrium”, 2 passages were changed outside the assistant's work \(the first is the passage beginning “For a balanced reversible reaction/);
  assert.match(one("no-photograph").text, /^The chapter “Le Chatelier's Principle” has no real photograph\./);
  assert.match(one("level-mismatch").text, /“Define chemical equilibrium as a dynamic state/, "a plan-node id is said as the plan's own words");

  // 5. one-click choices only where an answer's meaning is Coursewerk's own; the rest as before
  assert.deepEqual(one("knowledge-concern", (q) => q.text.includes("exponent")).choices, SUGGESTION_CHOICES);
  assert.equal(one("knowledge-concern", (q) => q.text.includes("Heat is a product")).choices, undefined, "no suggestion: the instructor says what it should be");
  assert.deepEqual(one("clarification-proposed").choices, SUGGESTION_CHOICES);
  assert.deepEqual(one("detail-in-spine").choices, MOVE_CHOICES);
  assert.deepEqual(one("off-spine").choices, ["Keep it", "Drop it", "Later"]);
  assert.deepEqual(one("exercise-data-confirm").choices, ["Confirm", "Later"]); assert.equal(one("exercise-data-confirm").recommended, "Confirm");
  const fact = one("instructor-edit-unasked", (q) => q.text.includes("a value changed"));
  assert.deepEqual(fact.choices, ["Keep", "Revert", "Later"]); assert.equal(fact.recommended, "Revert");
  assert.deepEqual(one("fact-disputed").choices, ["Keep as written", "Change it", "Later"]);
  assert.equal(one("knowledge-concern", (q) => q.choices).recommended, undefined, "a reviewer's suggestion is never pre-chosen for the instructor's text");
  for (const q of qs.filter((x) => x.choices && x.id.startsWith("d."))) assert.equal(q.words, "required", "a digest choice still records the instructor's words");

  // 6. an answer means what it meant: "Apply the suggestion" is Coursewerk's acceptance (ms8 reads /^apply/), "Later" defers
  const cl = one("clarification-proposed"), ds = one("detail-in-spine"), kc = one("knowledge-concern", (q) => q.choices);
  const a = applyChanges(p.root, { answers: [
    answer(hOf(cl), cl.id, "Apply the suggestion", { words: "Yes, say which side." }),
    answer(hOf(ds), ds.id, "Keep it", { words: "Keep the names in the plan." }),
    answer(hOf(kc), kc.id, "Later", { words: "Later." }),
  ] });
  assert.deepEqual(a.skipped, []); assert.deepEqual(a.recorded.map((x) => x.outcome).sort(), ["answered", "answered", "deferred"]);
  const answers = parseLog(readLogText(p.root)).filter((x) => x.type === "answer").flatMap((x) => x.payload.answers);
  const clf = all.find((f) => f.kind === "clarification-proposed");
  assert.ok(answers.some((x) => x.finding === clf.id && /^\s*apply/i.test(x.choice)), "the clarification is accepted, as a typed 'apply …' was");
});

test("[req.host.alembic-needs-wording] content reads as it renders: orz markup, maths, chemistry and scripts", () => {
  const cases = [
    ["- {{sp[info] Objective 18.5a}} Explain the **equilibrium** constant [anchor: k]", "Objective 18.5a Explain the equilibrium constant"],
    ["the reaction and $\\Delta H = -92\\ \\text{kJ mol}^{-1}$ are from the source", "the reaction and ΔH = −92 kJ mol⁻¹ are from the source"],
    ["H~2~O and 10^3^ and $\\ce{N2 + 3H2 <=> 2NH3}$", "H₂O and 10³ and N₂ + 3 H₂ ⇌ 2 NH₃"], // mhchem sets a coefficient apart,
    ["$\\ce{SO4^2-}$, $\\ce{Ag+}$ and $K_a = 1.8\\times10^{-5}$", "SO₄²⁻, Ag⁺ and Kₐ = 1.8 × 10⁻⁵"],
    ["at 25 $^\\circ$C, ~~not this~~ [a link](https://x.org) `K_sp` <!-- note -->", "at 25 °C, a link K_sp"],
  ];
  for (const [src, want] of cases) assert.equal(plainText(src), want);
  // ions as mhchem reads them (audit round 1, HIGH-2): without a caret only the last sign is the charge, its digits
  // stay subscripts (mhchem itself prints \ce{Fe3+} as Fe₃⁺; Fe³⁺ is written Fe^3+); a state symbol may follow
  const ions = { "NO3-": "NO₃⁻", "NH4+": "NH₄⁺", "SO4^2-": "SO₄²⁻", "PO4^3-": "PO₄³⁻", "Fe^3+": "Fe³⁺", "Fe3+": "Fe₃⁺", "Cu^2+": "Cu²⁺", "H3O+": "H₃O⁺",
    "OH-": "OH⁻", "Cr2O7^2-": "Cr₂O₇²⁻", "[Fe(CN)6]^3-": "[Fe(CN)₆]³⁻", "MnO4-": "MnO₄⁻", "Cl-(aq)": "Cl⁻(aq)", "Ca^2+(aq)": "Ca²⁺(aq)", "HSO4-": "HSO₄⁻",
    "CH3COO-": "CH₃COO⁻", "e-": "e⁻", "H2PO4-": "H₂PO₄⁻", "O^2-": "O²⁻", "HCO3-(aq)": "HCO₃⁻(aq)", "^{14}C": "¹⁴C", "CO2(g)": "CO₂(g)" };
  for (const [ce, want] of Object.entries(ions)) assert.equal(plainText(`$\\ce{${ce}}$`), want, ce);
  assert.equal(plainText("$\\Delta G^\\ominus \\neq 0$"), "ΔG⊖ ≠ 0");
});

test("[req.host.alembic-needs-wording] the subject's own words are never taken for codes", () => {
  // a reviewer's words are content: "spine", V1 and M2 are an anatomy or chemistry course's own
  const e = { key: "k", kind: "knowledge-concern", units: [], chapters: [], question: "The spine has 33 vertebrae, and M1V1 = M2V2 holds only for a dilution.", evidence: { note: "The spine has 33 vertebrae, and M1V1 = M2V2 holds only for a dilution.", quote: "the spine has 24 vertebrae" } };
  const w = wordEntry(e, {});
  assert.match(w.text, /a reviewer raised a point about “the spine has 24 vertebrae”: The spine has 33 vertebrae, and M1V1 = M2V2 holds only for a dilution\./);
  // the harness's own sentences lose their codes, and keep content values
  assert.equal(forInstructor("The spine is not source-checked (D48); M1V1 = M2V2 stays (node scripts/gate.mjs --root pkg)."), "The plan is not source-checked; M1V1 = M2V2 stays.");
});

test("[req.host.alembic-needs-apply] an answer binds the passage as it was asked: edited since, it is asked again (round 3, HIGH-2)", async (t) => {
  const p = copy(t);
  const f = F("skeleton", "confirmation-stale", [U2], { type: "judgment", note: "You confirmed the facts in it, but its text has changed since — confirm it as it reads now?", quote: "Write the equilibrium constant expression." }, { recommendation: "confirm" });
  const r = await exportNeeds(p.root, { changesetId: "seen-0001", gate: { findings: [f] } });
  const q = r.handin.digest.questions.find((x) => x.id.startsWith("d."));
  assert.deepEqual(q.choices, ["Confirm", "Later"]);
  assert.ok(needs(p).handins.at(-1).questions[q.id].seen?.[U2], "the record keeps the passage's hash as asked");
  // the passage changes before the answer is read (same unit id)
  beginSession(p.root, p.reader, AGENT);
  const file = path.join(p.root, SG1), src = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, src.replace("Write the equilibrium constant expression for the ammonia synthesis", "Write the equilibrium constant expression (at 500 K) for the ammonia synthesis"));
  indexAndStamp(p.root, p.reader, { as: "agent", party: AGENT });
  const a = applyChanges(p.root, { answers: [answer(r.handin, q.id, "Confirm", { words: "Confirmed." })] });
  assert.deepEqual(a.recorded, []); assert.match(a.skipped[0].reason, /the passage changed since it was asked/);
  assert.ok(!parseLog(readLogText(p.root)).some((x) => x.type === "confirmation"), "nothing confirmed");
  // unchanged, the same answer is recorded
  const p2 = copy(t);
  const r2 = await exportNeeds(p2.root, { changesetId: "seen-0002", gate: { findings: [f] } });
  const q2 = r2.handin.digest.questions.find((x) => x.id.startsWith("d."));
  assert.deepEqual(applyChanges(p2.root, { answers: [answer(r2.handin, q2.id, "Confirm", { words: "Confirmed." })] }).recorded.map((x) => x.outcome), ["answered"]);
});
