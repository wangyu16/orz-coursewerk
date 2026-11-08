// [req.host.alembic-needs-wording] Closed-loop audit, round 2, of D-133 (needs-wording, 6c159a3 on 6bd1efd): the wording
// of Alembic "Needs you" questions. Each test below FAILS on 6c159a3 and names one finding (severity in the test name).
// They probe only the public functions of needs_wording.mjs / alembic_needs.mjs and the real C2 package; nothing here
// changes implementation.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { indexAndStamp, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { makeFinding } from "../scripts/lib/records/findings.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { fsInputReader, pinnedTexts } from "../scripts/lib/verify/references.mjs";
import { applyCorrection, verifySemi } from "../scripts/lib/verify/verdicts.mjs";
import { pinDeclared as pinReference } from "./helpers/destinations.mjs";
import { applyChanges, digestQuestion, exportNeeds, NEEDS_FILE } from "../scripts/lib/core/alembic_needs.mjs";
import { forInstructor, plainText, wordEntry } from "../scripts/lib/core/needs_wording.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const BY = { id: "u-42", name: "Yu Wang" };
const U1 = "u-study-guide-chemical-equilibrium-the-equilibrium-constant-1";
function copy(t) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-wording-audit2-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(C2, path.join(dir, "pkg"), { recursive: true }); fs.cpSync(INPUTS, path.join(dir, "inputs"), { recursive: true });
  const root = path.join(dir, "pkg");
  return { root, inputs: path.join(dir, "inputs"), reader: liveReader(root) };
}
const shown = (q) => `${q.text}\n${q.detail || ""}`;
const entry = (kind, evidence, more = {}) => ({ key: `k-${kind}`, kind, units: [], chapters: ["chemical-equilibrium"], question: evidence.note, evidence, bases: [{ finding: "f", basis: "b" }], ...more });

// ---- HIGH-A: accents (and strikes) are dropped from maths: x̄ reads x, Å reads A ---------------------------------------
// needs_wording.mjs:74 — `mover` with accent="true" returns only its base, so the accent KaTeX prints is lost: \bar{x}
// (a mean) reads "x", \hat{H} "H", \vec{F} "F", \tilde{\nu} (a wavenumber) "ν", and Å (KaTeX: an A with a ring accent)
// reads "A" — the ångström becomes the ampere. :81 (default) also drops `menclose` (\cancel). Quotes the instructor confirms
// "as it reads now", keeps, or adopts carry these.
test("audit2 HIGH-A: an accent KaTeX prints is kept (x̄ is not x, Å is not A)", () => {
  assert.notEqual(plainText("$\\bar{x} = 5.0$"), plainText("$x = 5.0$"), "a mean is not the variable");
  assert.notEqual(plainText("$\\tilde{\\nu}$"), plainText("$\\nu$"), "a wavenumber is not a frequency");
  assert.match(plainText("a bond length of $1.54\\ \\text{Å}$"), /Å|Å/, "the ångström stays an ångström");
  const w = wordEntry(entry("confirmation-stale", { type: "judgment", note: "changed", quote: "The mean mass is $\\bar{m} = 2.5\\ \\text{g}$." }, { units: [U1] }), {});
  assert.doesNotMatch(w.text, /“The mean mass is m = 2\.5 g/, "what the instructor confirms reads as the page does");
});

// ---- HIGH-B: a correction too long to show: "undo" (or "Later") is recorded as KEPT ---------------------------------
// alembic_needs.mjs:224-226 drops the Keep/Undo choices when before+after+source exceed 2000 characters (round-1 H1 fix);
// the question is then free text (words optional). applyChanges (alembic_needs.mjs:297-306) treats any answer that is
// not exactly "Undo" as kept, marks the correction shown, and it is never asked again. On main the two choices were
// always there, so no answer could mean the opposite. c.before/c.after are WHOLE unit texts, so a ~850-character
// paragraph is enough.
const HABER = "For the ammonia synthesis reaction N2 + 3 H2 ⇌ 2 NH3 the standard reaction enthalpy is −92.4 kJ per mole of reaction, so by Le Chatelier's principle raising the temperature shifts the reaction toward the reactants.";
const PAD = " Students who keep these two ideas apart find later problems far easier to reason through without memorising separate rules. Drawing the reaction with heat written out as a participant helps the class see which side gains when the surroundings warm up. Ask students to say aloud which participant was added or removed before they predict anything at all. Encourage them to check each prediction against the sign convention used throughout this guide and to explain it in a full sentence. Work through a second example together in class before setting the practice questions, so that every student has seen the reasoning modelled once from start to finish. Close by asking the class to explain the difference between a shift in position and a change in the constant in their own words, and collect a few answers to discuss in the next session.";
async function plantLongCorrection(p) {
  beginSession(p.root, p.reader, AGENT);
  const f = path.join(p.root, "study-guide/le-chatelier.md");
  const before = fs.readFileSync(f, "utf8");
  const target = "the reaction and $\\Delta H = -92\\ \\text{kJ mol}^{-1}$ are from the source.)*";
  assert.ok(before.includes(target));
  fs.writeFileSync(f, before.replace(target, `the reaction and $\\Delta H = -75\\ \\text{kJ mol}^{-1}$ are from the source.)*${PAD}`));
  indexAndStamp(p.root, p.reader, { as: "agent", party: AGENT });
  const planted = loadUnits(p.root, p.reader).find((u) => u.text.includes("-75\\ ")).id; // a long paragraph is a new unit
  pinReference(p.root, p.inputs, { url: "https://openstax.org/books/chemistry-2e/pages/13-3-shifting-equilibria-le-chateliers-principle", title: "Shifting equilibria (test pin)", destination: "openstax.org/books/chemistry-2e", text: HABER });
  const texts = pinnedTexts(fsInputReader(p.inputs));
  const verifier = replayVerifier((prompt) => {
    const nonce = prompt.match(/"nonce": "([0-9a-f]+)"/)[1];
    const ps = prompt.split("\nPASSAGES\n")[1].split("\n").map((l) => l.match(/^\[(\d+)\] (.*)$/)).filter(Boolean).map((m) => ({ n: Number(m[1]), text: m[2] }));
    const claims = prompt.split("\nCLAIMS\n")[1].split("\n\nPASSAGES")[0].split("\n").filter((l) => /^\d+\. /.test(l));
    const x = ps.find((q) => q.text.includes("−92.4 kJ"));
    return { nonce, claims: claims.map((c, i) => (x && /75/.test(c) ? { claim: i + 1, verdict: "contradicted", quotes: [{ passage: x.n, text: "the standard reaction enthalpy is −92.4 kJ per mole of reaction, so by Le Chatelier's principle raising the temperature shifts the reaction toward the reactants" }] } : { claim: i + 1, verdict: "not-found", quotes: [] })) };
  });
  await verifySemi(p.root, p.reader, { texts, verifier, only: [planted] });
  const plain = new Map([...texts].filter(([, v]) => v.ok).map(([k, v]) => [k, v.text]));
  const r = applyCorrection(p.root, p.reader, { unitId: planted, plainTexts: plain }, AGENT);
  assert.equal(r.applied, true, JSON.stringify(r.question || {}));
}
test("[req.host.alembic-needs-apply] audit2 HIGH-B: a long correction answered 'undo it' (or 'Later') is never recorded as kept", async (t) => {
  const p = copy(t);
  await plantLongCorrection(p);
  const r = await exportNeeds(p.root, { changesetId: "audit2-undo", gate: { findings: [] } });
  const q = r.handin.digest.questions.find((x) => x.id.startsWith("c."));
  assert.ok(q, "the correction is asked");
  // adopted fix (round 2): Keep / Undo always stay; the page holds the corrected passage exactly as Keep leaves it
  assert.deepEqual(q.choices, ["Keep", "Undo"]); assert.match(q.detail, /on the page \(the link\), exactly as Keep leaves it/);
  const undo = (item) => ({ item, changesetId: "audit2-undo", question: q.id, answer: "undo it — the source is about a different reaction", words: "Undo it: my value is for the gas-phase reaction at 500 K.", by: BY, at: "2026-11-08T12:00:00.000Z" });
  const a = applyChanges(p.root, { answers: [undo("i-undo")] });
  const outcome = a.recorded[0]?.outcome ?? `skipped: ${a.skipped[0]?.reason}`;
  assert.notEqual(outcome, "kept", "an answer that says undo is not recorded as keeping the correction");
  // P1: a hand-in made with no choices (6c159a3 asked a long correction so) — apply keeps only on an exact Keep
  const f = path.join(p.root, NEEDS_FILE), rec = JSON.parse(fs.readFileSync(f, "utf8"));
  rec.handins.find((h) => h.changesetId === "audit2-undo").questions[q.id].choices = null; fs.writeFileSync(f, JSON.stringify(rec));
  const b = applyChanges(p.root, { answers: [undo("i-undo-2"), { ...undo("i-later"), answer: "Later" }] });
  assert.deepEqual(b.recorded, [], "neither is kept: both are asked again");
  assert.ok(b.skipped.every((x) => /neither Keep nor Undo: it is asked again/.test(x.reason)), JSON.stringify(b.skipped));
});

// ---- HIGH-C: "Confirm it as it reads now" on a passage longer than 400 characters -----------------------------------
// obligations.mjs:1117 cuts the passage to 400 characters for ev.quote; needs_wording.mjs:328 shows that cut quote,
// labelled "It now reads, in full", and digestQuestion offers the one-click Confirm. confirmUnits (obligations.mjs:607)
// binds the confirmation to the WHOLE unit text (factHash, seenKey). The instructor confirms words they never see; the
// whole text is at hand in ctx.units (needsContext). The round-1 H1 sibling that was not fixed.
test("audit2 HIGH-C: a stale confirmation shows the whole passage it confirms, or offers no Confirm", () => {
  const whole = `${"The equilibrium constant depends only on temperature. ".repeat(8)}At 500 K, K_c = 0.0042 for this reaction.`;
  const e = entry("confirmation-stale", { type: "judgment", note: `You confirmed the facts in ${U1} (study-guide/chemical-equilibrium.md), but its text has changed since. It now reads: "${whole.slice(0, 400)}" — confirm it as it reads now?`, quote: whole.replace(/\s+/g, " ").slice(0, 400) }, { units: [U1], recommendation: "confirm" });
  const ctx = { units: new Map([[U1, { deliverable: "study-guide/chemical-equilibrium.md", form: "prose", text: whole }]]), deliverableOf: new Map([[U1, "study-guide/chemical-equilibrium.md"]]) };
  const q = digestQuestion(e, new Map(), ctx);
  if (q.choices?.includes("Confirm")) assert.match(shown(q), /K_c = 0\.0042/, "the value being confirmed is visible");
});

// ---- MEDIUM-D: "Accept as mine" offered with no passage shown --------------------------------------------------------
// needs_wording.mjs:337-339 shows only the passages ctx.units can read; when it reads none (or only some), shown stays
// empty, `fits` holds and digestQuestion offers "Accept as mine" (pre-chosen: recommendation "accept as mine"), which
// records authorship of every unit (CLAIMS, digest.mjs:153). Fewer texts than units must mean no one-click choice.
test("audit2 MEDIUM-D: authorship is never claimed for passages the question could not show", () => {
  const units = [U1, "u-study-guide-chemical-equilibrium-the-equilibrium-constant-3"];
  const e = entry("unit-unknown-authorship", { type: "judgment", note: "study-guide/chemical-equilibrium.md: 2 passage(s) changed outside an agent session — yours (accept as mine), someone else's (name them), or revert?", hashes: ["h1", "h2"] }, { units, recommendation: "accept as mine" });
  const ctx = { units: new Map([[U1, { deliverable: "study-guide/chemical-equilibrium.md", form: "prose", text: "Only the first passage could be read." }]]), deliverableOf: new Map(units.map((u) => [u, "study-guide/chemical-equilibrium.md"])) };
  const q = digestQuestion(e, new Map(), ctx);
  assert.ok(!(q.choices || []).includes("Accept as mine"), `2 passages claimed, 1 shown: ${JSON.stringify(q)}`);
});

// ---- MEDIUM-E: a typed "apply" adopts a suggestion that is shown nowhere ----------------------------------------------
// alembic_needs.mjs:107-108 — when quote + suggestion exceed 1800 characters the question drops its choices and says "read
// it on the page (the link)". The page holds the instructor's text, never the reviewer's suggestion, so the suggestion is
// visible only as its first 160 characters in the question text; ms8-verdicts.mjs:111 still accepts a typed
// "Apply the suggestion" (/^apply/) as adopting all of it. Main showed the suggestion in the detail.
test("audit2 MEDIUM-E: when the full texts do not fit, the suggestion (which no page shows) is still shown in full", () => {
  const quote = `${"Le Chatelier's principle predicts the direction of a shift when a system at equilibrium is disturbed. ".repeat(10)}`;
  const suggestion = `${"A system at equilibrium that is disturbed responds so as to partly counteract the disturbance. ".repeat(9)}Only a change of temperature changes K; at 700 K, K_p = 1.5e-5.`;
  const q = digestQuestion(entry("knowledge-concern", { type: "judgment", note: "It conflates position and constant.", quote, suggestion }), new Map(), {});
  assert.match(shown(q), /K_p = 1\.5e-5/, "the words an 'apply' would adopt are visible in the question");
});

// ---- MEDIUM-F: the agent's recommendation pre-chooses the reviewer's suggestion, and its condition is hidden -----------
// alembic_needs.mjs:102-110 — exportNeeds copies the agent's recommendation (recommendDigest) into the entry; isChoice
// matches "Apply the suggestion…" and pre-selects it on a knowledge concern about the INSTRUCTOR's text (round 1 asserted
// "a reviewer's suggestion is never pre-chosen for the instructor's text"). And whenever a recommendation is pre-chosen,
// recommendationLine is left out (:115), so the words after the choice ("…, but only if …") vanish (LOW-1 sibling).
test("audit2 MEDIUM-F: an agent's recommendation never pre-chooses applying a suggestion to the instructor's text, nor loses its condition", () => {
  const ev = { type: "judgment", note: "The exponent must be 3.", quote: "raised to the power 2", suggestion: "raised to the power 3" };
  const q1 = digestQuestion(entry("knowledge-concern", ev, { recommendation: "Apply the suggestion", recommendedBy: "agent (claude)" }), new Map(), {});
  assert.notEqual(q1.recommended, "Apply the suggestion", "a reviewer's change to the instructor's text is not pre-chosen");
  const q2 = digestQuestion(entry("off-spine", { type: "judgment", note: "x teaches nothing" }, { recommendation: "Keep it, but only if the 2019 SI values are kept with it", recommendedBy: "agent (claude)" }), new Map(), {});
  assert.match(shown(q2), /2019 SI values/, "the assistant's condition reaches the instructor");
});

// ---- MEDIUM-G: KaTeX is called without orz-markdown's guards (cost, and a formula the page does not typeset) ----------
// needs_wording.mjs:100 renders every formula with katex.renderToString directly. orz-markdown (dist/index.js:341-397)
// refuses a formula over 10,000 characters or one that defines macros (a \def chain: 267 s, its round 19 H6) and shows its
// source; here it is expanded and built in full, for every question that quotes or begins with the passage (passageOf
// renders the whole unit to keep 70 characters). A 5.8 KB \def formula took ~19 s per call on this machine.
test("audit2 MEDIUM-G: a formula the page shows as source (macro definition) reads as its source, cheaply", () => {
  assert.doesNotMatch(plainText("$\\def\\a{xy}\\a\\a\\a$"), /^xyxyxy$/, "the page shows the source, not the expansion");
  const big = "$\\def\\a{" + "x".repeat(1600) + "}" + "\\a".repeat(400) + "$";
  const t0 = Date.now(); plainText(big); const ms = Date.now() - t0;
  assert.ok(ms < 500, `a 2.4 KB macro formula took ${ms} ms to word (the page refuses it at once)`);
});

// ---- MEDIUM-H: content values read as harness codes (M2 siblings) ----------------------------------------------------
// needs_wording.mjs:227 removes a parenthesis of "codes" from the agent's own words too: D65 (a standard illuminant)
// matches CODE (D\d{2,3}). :235 drops ", lines <n>" and every bare D-code from a harness note — and a harness note can
// carry content: an assessment-guide entry's title (ms9-alignment.mjs:72, worded with fi at needs_wording.mjs:349).
test("audit2 MEDIUM-H: the agent's and the plan's words keep their values (D65, lines 656 nm)", () => {
  const m5 = forInstructor("Which illuminant (D65) should the colour-vision figure assume?", {}, { from: "agent" });
  assert.match(m5, /\(D65\)/, m5);
  const w = wordEntry(entry("assessment-fidelity-instructor", { type: "judgment", note: `${U1} is not the level its guide entry asks for (short answer at the level "apply" (Hydrogen emission lines 656 and 486 nm)): it only asks to recall.` }, { units: [U1] }), {});
  assert.match(w.text, /lines 656 and 486 nm/, w.text);
});

// ---- LOW-I: a formula KaTeX cannot typeset reads neither as the page nor as typed ------------------------------------
// needs_wording.mjs:101 — on a KaTeX error the fallback strips backslashes and braces ("pu25 ^circC"); orz-markdown shows
// the source as written (dist/index.js:395), and the comment says "its source".
test("audit2 LOW-I: a formula KaTeX rejects reads as its source", () => {
  assert.equal(plainText("$\\pu{25 ^\\circC}$"), "\\pu{25 ^\\circC}");
});

// ---- LOW-J: arrow conditions read bottom-first ---------------------------------------------------------------------
// needs_wording.mjs:73-75 joins munderover's children in MathML order (under, then over): \ce{A ->[above][below] B} reads
// "A →(below, above) B"; \binom{n}{k} reads "((n k))".
test("audit2 LOW-J: an arrow's conditions read top first", () => {
  assert.equal(plainText("$\\ce{A ->[H2O][heat] B}$"), "A →(H₂O, heat) B");
});

// ---- LOW-K: the assistant entry's unit list is unbounded ------------------------------------------------------------
// alembic_needs.mjs:239 — `units: e.units` sits beside assistantPart's bounded text and codes; a clustered entry with
// hundreds of units makes the hidden entry tens of kilobytes (round-1 LOW-2 bounded only the codes).
test("audit2 LOW-K: a question's assistant entry stays bounded however many units it clusters", async (t) => {
  const p = copy(t);
  const units = Array.from({ length: 400 }, (_, i) => `u-study-guide-chemical-equilibrium-the-equilibrium-constant-${i + 100}`);
  const f = makeFinding({ module: "skeleton", kind: "unit-unknown-authorship", units, statusClass: "question", route: "digest", basis: "b",
    evidence: { type: "judgment", note: "study-guide/chemical-equilibrium.md: 400 passage(s) changed outside an agent session — yours (accept as mine), someone else's (name them), or revert?", hashes: [] }, recommendation: "accept as mine" });
  await exportNeeds(p.root, { changesetId: "audit2-size", gate: { findings: [f] } });
  const rec = JSON.parse(fs.readFileSync(path.join(p.root, NEEDS_FILE), "utf8")).handins.find((h) => h.changesetId === "audit2-size");
  const a = Object.values(rec.questions).find((x) => x.kind === "digest").assistant;
  assert.ok(JSON.stringify(a).length <= 8000, `assistant entry is ${JSON.stringify(a).length} characters`);
});


// ---- MEDIUM-L: "Confirm" / "Keep as written" confirm the whole passage; only a claim or the values are shown -----------
// digest.mjs:146-151 (CONFIRMS) passes e.units to confirmUnits, which binds the confirmation to each unit's WHOLE text
// (obligations.mjs:607-609: factHash and seenKey of the text). needs_wording.mjs:322-325 (exercise-data-confirm) shows the
// values only, :329-332 (fact-disputed) the disputed claim only, though ctx.units holds the passage. So a one-click Confirm
// also confirms every other fact in the passage (here K_c = 0.0042 at 500 K), unseen. Unchanged from main in effect, but
// the round-1 rule ("whatever an answer adopts or confirms is shown in full") does not hold for these two kinds.
test("audit2 MEDIUM-L: a confirmation shows every fact it confirms (the whole passage), or offers no one-click choice", () => {
  const passage = "Take [N₂] = 0.50 M and [H₂] = 1.5 M at equilibrium. For this reaction K_c = 0.0042 at 500 K.";
  const ctx = { units: new Map([[U1, { deliverable: "study-guide/chemical-equilibrium.md", form: "prose", text: passage }]]), deliverableOf: new Map([[U1, "study-guide/chemical-equilibrium.md"]]) };
  const ex = digestQuestion(entry("exercise-data-confirm", { type: "judgment", note: `${U1}: the values here read as invented exercise data — confirm them as teaching hypotheticals?`, quote: "[N₂] = 0.50 M | [H₂] = 1.5 M" }, { units: [U1], recommendation: "confirm" }), new Map(), ctx);
  if (ex.choices?.includes("Confirm")) assert.match(shown(ex), /0\.0042 at 500 K/, "Confirm also confirms K_c = 0.0042 at 500 K");
  const fd = digestQuestion(entry("fact-disputed", { type: "conflict", claimKey: "ck", claimText: "[N₂] = 0.50 M", conflicts: [{ claimed: "0.50 M", source: "0.45 M", sentence: "It is 0.45 M." }], note: "keep as written, or change it?" }, { units: [U1] }), new Map(), ctx);
  if (fd.choices?.includes("Keep as written")) assert.match(shown(fd), /0\.0042 at 500 K/, "Keep as written also confirms K_c = 0.0042 at 500 K");
});

// ---- LOW-M: the agent's and a reviewer's words: amounts of money read as maths, a figure's file name as a page ---------
// needs_wording.mjs:108 (lightText) takes any "$…$" pair as maths, without orz-markdown's own rules (no space inside the
// delimiters): "$25 per student and $40" is typeset as one formula and reads "25perstudentand40". :229 (forInstructor, every
// mode) says any file name as a page: the agent's "fig-2.png" reads "the page “Fig 2.png”".
test("audit2 LOW-M: the agent's own words keep their amounts and file names", () => {
  assert.equal(forInstructor("The kit costs $25 per student and $40 with goggles; which should the lab list?", {}, { from: "agent" }), "The kit costs $25 per student and $40 with goggles; which should the lab list?");
  assert.doesNotMatch(forInstructor("Use the figure fig-2.png from the OpenStax chapter?", {}, { from: "agent" }), /the page “Fig 2\.png”/);
});
