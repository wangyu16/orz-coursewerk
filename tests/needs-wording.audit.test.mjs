// [req.host.alembic-needs-wording] Closed-loop audit, round 1, of D-133 (needs-wording, 6bd1efd): the wording of Alembic "Needs you" questions.
// Each test below FAILS on 6bd1efd and names one finding (severity in the test name); adopted as tests with the round's
// fixes (MEDIUM-4 now answers through the "Change it differently" choice it asked for). They probe only the public
// functions of needs_wording.mjs / alembic_needs.mjs and the real C2 package; nothing here changes implementation.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendLogRecord, parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { makeFinding } from "../scripts/lib/records/findings.mjs";
import { applyChanges, digestQuestion, exportNeeds, NEEDS_FILE } from "../scripts/lib/core/alembic_needs.mjs";
import { plainText, wordEntry } from "../scripts/lib/core/needs_wording.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const U1 = "u-study-guide-chemical-equilibrium-the-equilibrium-constant-1";
function copy(t) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-wording-audit-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(C2, path.join(dir, "pkg"), { recursive: true });
  return path.join(dir, "pkg");
}
const shown = (q) => `${q.text}\n${q.detail || ""}`;
const entry = (kind, evidence, more = {}) => ({ key: `k-${kind}`, kind, units: [], chapters: ["chemical-equilibrium"], question: evidence.note, evidence, bases: [{ finding: "f", basis: "b" }], ...more });

// ---- HIGH-1: "Apply the suggestion" accepts words the instructor never sees -----------------------------------------
// needs_wording.mjs:234 (sugg = quote(ev.suggestion, 160)), :250 (quote(s, 160)); alembic_needs.mjs digestQuestion no
// longer carries `Suggested: "<full suggestion>"` in the detail (main had it). A suggestion over ~160 characters is cut
// with "…", and the cut part (here the value itself) is nowhere in the question. ms8-verdicts reads /^apply/ as the
// instructor accepting the WHOLE ev.suggestion.
test("audit HIGH-1: a long suggestion is shown in full before 'Apply the suggestion' can accept it", () => {
  const suggestion = "the equilibrium constant expression places the products in the numerator and the reactants in the denominator, each concentration raised to the power of its stoichiometric coefficient, so for this reaction K_c = 0.0042 at 500 K";
  for (const e of [
    entry("knowledge-concern", { type: "judgment", note: "The value is off.", quote: "K_c = 4.2 at 500 K", suggestion }),
    entry("clarification-proposed", { type: "judgment", note: `Clarify: "K_c = 4.2 at 500 K" → "${suggestion}". Say which side.`, quote: "K_c = 4.2 at 500 K", suggestion }),
    entry("spine-review-concern", { type: "judgment", file: "concepts/course.md", line: 3, text: "Relate K to T", note: `Possibly wrong (concepts/course.md, line 3): "Relate K to T". Off. Suggested: "${suggestion}".` }),
  ]) {
    const q = digestQuestion(e, new Map(), {});
    assert.ok((q.choices || []).includes("Apply the suggestion"), `${e.kind} offers Apply`);
    assert.match(shown(q), /0\.0042 at 500 K/, `${e.kind}: the value being accepted is visible somewhere in the question`);
  }
});

// ---- HIGH-2: mhchem charges rendered as the wrong formula -----------------------------------------------------------
// needs_wording.mjs:53 — /^(.*?[A-Za-z)\]])(\d*[+-])$/ takes the subscript digit into the charge when no caret is used.
// mhchem prints NO3- as NO₃⁻ (nitrate), NH4+ as NH₄⁺; the wording prints NO³⁻ and NH⁴⁺ (a 3−/4+ ion). A charge followed
// by a state symbol, Na+(aq), is turned into an addition sign: "Na + (aq)". Quotes of the instructor's text, which they
// confirm or keep, carry these.
test("audit HIGH-2: ions written without a caret keep their formula (NO3-, NH4+, HCO3-, Na+(aq))", () => {
  assert.equal(plainText("$\\ce{NO3-}$"), "NO₃⁻");
  assert.equal(plainText("$\\ce{NH4+}$"), "NH₄⁺");
  assert.equal(plainText("$\\ce{HCO3-}$"), "HCO₃⁻");
  assert.equal(plainText("$\\ce{NH4+ + OH- <=> NH3 + H2O}$"), "NH₄⁺ + OH⁻ ⇌ NH₃ + H₂O");
  assert.equal(plainText("$\\ce{Na+(aq) + Cl-(aq)}$"), "Na⁺(aq) + Cl⁻(aq)");
  const w = wordEntry(entry("confirmation-stale", { type: "judgment", note: "changed", quote: "Add $\\ce{NH4NO3}$: it gives $\\ce{NH4+}$ and $\\ce{NO3-}$." }), {});
  assert.match(w.text, /NH₄⁺ and NO₃⁻/, "what the instructor confirms 'as it reads now'");
});

// ---- MEDIUM-1: \pu{} units read as subtraction -----------------------------------------------------------------------
// needs_wording.mjs:33/76 — `pu` (and `unit`) is in WRAP, so its spaces are dropped and "K-1" is never an exponent.
test("audit MEDIUM-1: mhchem \\pu{} units keep their spaces and exponents", () => {
  assert.equal(plainText("$R = \\pu{8.314 J K-1 mol-1}$"), "R = 8.314 J K⁻¹ mol⁻¹");
});

// ---- MEDIUM-2: forInstructor strips content from the agent's own questions --------------------------------------------
// needs_wording.mjs:196-204, applied to M5 questions (alembic_needs.mjs exportNeeds, m5 item), interrupts, the agent's
// recommendations and the default kinds (the agent's spine critique, which is about content). Parentheticals starting with
// round/control/owner/operator, any parenthetical or bracket holding D1–D999 or R1–R99, "lines <n>", D50/D90, "u-tube"
// (taken for a unit id) and the subject's "spine" are all rewritten or removed: the question asks something else.
test("audit MEDIUM-2: an M5 question about content keeps its content", async (t) => {
  const root = copy(t);
  const question = "The source gives the hydrogen emission lines 656 nm and 486 nm and vitamin D3 (cholecalciferol, D3) yields (round to 3 significant figures): which edition's u-tube data and spine diagram should the chapter use?";
  appendLogRecord(root, { type: "contact", party: AGENT, payload: { moment: "M5", reason: "missing-input", question } });
  const r = await exportNeeds(root, { changesetId: "audit-m5", gate: { findings: [] } });
  const m5 = r.handin.digest.questions.find((q) => q.id.startsWith("m5."));
  for (const kept of ["lines 656 nm", "(cholecalciferol, D3)", "(round to 3 significant figures)", "u-tube", "spine diagram"]) assert.ok(m5.text.includes(kept), `kept "${kept}": ${m5.text}`);
});

// ---- MEDIUM-3: a clarification with no suggestion is worded "may be wrong" ---------------------------------------------
// ms8-verdicts.mjs:221 raises a reviewer's *clarify* concern (the text is right as meant) with no suggestion as kind
// knowledge-concern, with evidence identical in shape to a "wrong" concern; needs_wording.mjs:255 words every
// knowledge-concern "… may be wrong — …". The instructor is told their correct text may be wrong.
test("audit MEDIUM-3: a knowledge-concern without a suggestion does not assert the text may be wrong", () => {
  const w = wordEntry(entry("knowledge-concern", { type: "judgment", note: "Right as meant; it could say on which side heat goes.", quote: "heat as a participant", suggestion: "" }), {});
  assert.doesNotMatch(w.text, /may be wrong/, w.text);
});

// ---- MEDIUM-4: an answer path that was open is now refused --------------------------------------------------------------
// needs_wording.mjs:256 gives a knowledge-concern with a suggestion the fixed choices Apply / Keep it / Later, and
// alembic_needs.mjs applyChanges refuses any answer not among the choices. On main it was free text: "change it to <other
// value>" was recorded. Now the instructor's only way to ask for a different fix is to record "Keep it" (with words that
// say the opposite). fact-disputed, by contrast, keeps a "Change it" choice.
test("audit MEDIUM-4: the instructor can still ask for a different change than the reviewer's suggestion", async (t) => {
  const root = copy(t);
  const f = makeFinding({ module: "ms8-verdicts", kind: "knowledge-concern", units: [U1], statusClass: "question", route: "digest", basis: "b",
    evidence: { type: "judgment", note: "The exponent must be 3.", quote: "raised to the power 2", suggestion: "raised to the power 3", dispatch: "d-a" } });
  const r = await exportNeeds(root, { changesetId: "audit-other", gate: { findings: [f] } });
  const q = r.handin.digest.questions.find((x) => x.id.startsWith("d."));
  // adopted fix (round 1): a "Change it differently" choice, the instructor's words required, saying which change
  assert.ok(q.choices.includes("Change it differently"), JSON.stringify(q.choices));
  // owner 2026-11-16 (one click): the words box is optional on the question; "Change it differently" without words is asked again
  assert.equal(q.words, "optional");
  const a = applyChanges(root, { answers: [{ item: "i-1", changesetId: "audit-other", question: q.id, answer: "Change it differently", words: "Neither: say 'its stoichiometric coefficient'.", by: { id: "u-1", name: "Yu Wang" }, at: "2026-11-08T12:00:00.000Z" }] });
  assert.deepEqual(a.skipped, [], "a different change is recorded as such, as on main");
  const rec = parseLog(readLogText(root)).filter((x) => x.type === "answer").at(-1);
  // round 6 (MEDIUM-2): an act-on-it choice is recorded like words ("said: …"), owed to the agent with the words box
  assert.equal(rec.payload.answers[0].choice, "said: Change it differently"); assert.equal(rec.payload.instructorWords, "Neither: say 'its stoichiometric coefficient'.");
  assert.ok(!/^\s*apply/i.test(rec.payload.answers[0].choice), "not the reviewer's suggestion");
});

// ---- LOW-1: a recommendation pre-chosen by prefix, its qualifier hidden --------------------------------------------------
// alembic_needs.mjs:100 matches a recommendation to a choice by startsWith, with no word boundary; now that "Keep it" is a
// choice, the agent's "Keep items 1 and 2 …, drop the third" pre-selects "Keep it", and the recommendation line is then
// left out of the detail (`!recommended ? recommendationLine : ""`).
test("audit LOW-1: an agent recommendation is pre-chosen only when it is that choice", () => {
  const q = digestQuestion(entry("off-spine", { type: "judgment", note: "x teaches nothing" }, { recommendation: "Keep items 1 and 2 in the plan, but drop the third paragraph", recommendedBy: "agent (claude)" }), new Map(), {});
  assert.notEqual(q.recommended, "Keep it", JSON.stringify(q));
});

// ---- LOW-2: the hidden `assistant` entry is not bounded -------------------------------------------------------------------
// alembic_needs.mjs:476 assistantPart bounds `text` to 2000 characters but `codes` is every match in the full texts
// (question, rule, recommendation): agent-written text reaches the next agent's prompt, and alembic-needs.json keeps 50
// hand-ins of 20 questions under Alembic's 4 MB per-file limit.
test("audit LOW-2: a question's assistant entry stays bounded", async (t) => {
  const root = copy(t);
  const many = Array.from({ length: 3000 }, (_, i) => `notes/n${i}.md`).join(" ");
  const f = makeFinding({ module: "ms8-verdicts", kind: "knowledge-concern", units: [U1], statusClass: "question", route: "digest", basis: "b",
    evidence: { type: "judgment", note: `Off; see ${many}.`, quote: "raised to the power 2", dispatch: "d-b" } });
  await exportNeeds(root, { changesetId: "audit-size", gate: { findings: [f] } });
  const rec = JSON.parse(fs.readFileSync(path.join(root, NEEDS_FILE), "utf8")).handins.find((h) => h.changesetId === "audit-size");
  const a = Object.values(rec.questions).find((x) => x.kind === "digest").assistant;
  assert.ok(JSON.stringify(a).length <= 8000, `assistant entry is ${JSON.stringify(a).length} characters`);
});

// ---- LOW-3: a reviewer's prose read as markdown loses numbers ---------------------------------------------------------------
// needs_wording.mjs:237 rv = sentence(plainText(note)): a reviewer's note is plain words, but "2*3*4" is parsed as emphasis.
test("audit LOW-3: a reviewer's note keeps its numbers and operators", () => {
  const w = wordEntry(entry("knowledge-concern", { type: "judgment", note: "The product 2*3*4 is 24, not 12.", quote: "2 × 3 × 4 = 12", suggestion: "" }), {});
  assert.match(w.text, /2\*3\*4 is 24/, w.text);
});
