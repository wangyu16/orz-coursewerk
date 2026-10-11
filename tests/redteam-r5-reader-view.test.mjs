// Red team, round 5 — cause 1 (D46): bindings read text that differs from what the reader sees. The harness hashed or
// compared text in several places, each with its own normalisation (alignment.mjs reviewWording, the answer binding's
// key, the light key, factHash on the source), and they disagreed with what a student sees. Now there is ONE reader
// view (scripts/lib/core/rendered.mjs: orz-markdown's token stream, maths as KaTeX typesets it) and every binding about
// what a reader reads is derived from it. The round's findings are test cases of the cause, not the work items:
//   C2-01  struck-through teaching kept its link review current (reviewWording read "~~" as punctuation);
//   note   "does [](not) shift" moved a word out of the reader's sight without moving the review binding;
//   F5     a TeX regrouping that typesets identically ("\text{K}" → "{\text{K}}") forced a blocking re-check;
//   F7     an emphasis-and-punctuation edit voided a link review (the legacy basis hashed the exact bytes).
// Plus new variants of the same cause (other markup that hides or moves words, other typesetting-invariant TeX, HTML
// entities and invisible characters), a property table of (old, new) pairs with the expected outcome, and the
// migration of records keyed on the old normalisations (upgraded when unchanged under both keys, else one re-check).
// Offline and deterministic: every blind review is a replayed test double.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { coreObligations, indexAndStamp, linkUnits, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { beginSession, readSidecar } from "../scripts/lib/core/units_index.mjs";
import { lightKey, meaningKey, mathView, readerView } from "../scripts/lib/core/rendered.mjs";
import { classifyChapterChange } from "../scripts/lib/core/change.mjs";
import { questionHash, questionHashR4, r4QuestionCurrent, unitStampCurrent, unitTargetHash, factHash } from "../scripts/lib/core/dependencies.mjs";
import { currentReviewsAt, reviewAlignment, reviewBasis } from "../scripts/lib/verify/alignment.mjs";
import { absoluteSentences, absolutesHash } from "../scripts/lib/verify/absolutes.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const SG = "study-guide/le-chatelier.md", PR = "practice/le-chatelier.md", CE = "practice/chemical-equilibrium.md";
const OBJ = "objective.le-chatelier.explain-inert-and-catalyst";
const Q6 = "u-practice-le-chatelier-questions-11", Q11 = "u-practice-chemical-equilibrium-questions-21", A11 = "u-practice-chemical-equilibrium-questions-22";
const SG_WE3 = "u-study-guide-chemical-equilibrium-worked-examples-3"; // shares K = 4.0 with Q11: a `unit:` dependent only
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r5view-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  const c = {
    root, r: () => liveReader(root),
    units: () => loadUnits(root, liveReader(root)),
    unit: (id) => loadUnits(root, liveReader(root)).find((u) => u.id === id),
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 50)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent: (fn) => { beginSession(root, liveReader(root), AGENT); fn(); return indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    owed: () => coreObligations(root, liveReader(root), "t"),
    reviews: () => currentReviewsAt(root, liveReader(root), loadUnits(root, liveReader(root))),
  };
  c.owing = (kind) => new Set(c.owed().filter((f) => f.kind === kind).flatMap((f) => f.units));
  c.sig = () => c.owed().map((f) => `${f.kind}|${[...(f.units || [])].sort().join(",")}`).sort();
  return c;
}
/** An honest replayed link reviewer: every declared item "yes", nothing off the plan, type and level match. */
const honestLinks = () => replayVerifier((pr) => {
  const declared = (pr.split("\nDECLARED ITEMS\n")[1] || "").split("\n\n")[0].split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim());
  const many = pr.includes("linked to several assessment guide entries");
  const gids = many ? (pr.split("cognitive level:\n")[1] || "").split("\n").filter((l) => /^- guide\./.test(l)).map((l) => l.slice(2).split(":")[0]) : [];
  const one = /its assessment guide entry asks for/.test(pr);
  return { nonce: nonceOf(pr), links: declared.map((id) => ({ id, verdict: "yes", why: "" })), also: [], offPlan: false,
    ...(many ? { fidelity: gids.map((id) => ({ id, type: "matches", level: "matches", why: "" })) } : one ? { fidelity: { type: "matches", level: "matches", why: "" } } : {}) };
});

// ============================================ the property table ==================================================
// (old, new, outcome): "same" — the reader sees the same thing, so no binding may change; "changes" — the reader sees a
// different word or symbol, so every binding must. `case: true` marks a change of letter case only, which the light
// key folds by design (D43: case is light; the answer binding's case is held by its `unit:` fact edge).
const TABLE = [
  // round 5 findings
  ["F5 TeX grouping", "$T = 298\\ \\text{K}$", "$T = 298\\ {\\text{K}}$", "same"],
  ["F7 emphasis + punctuation", "The temperature is raised. Which way", "The temperature is *raised*; which way", "same"],
  ["F7 reflow", "a gas-phase  equilibrium\nshifts", "a gas-phase equilibrium shifts", "same"],
  ["C2-01 struck teaching", "at constant volume does not shift it.", "at ~~constant volume does not shift it.~~", "changes"],
  ["note: a word moved into an empty link", "does not shift", "does [](not) shift", "changes"],
  // other markup that hides or moves words
  ["<del>", "does not shift", "does <del>not</del> shift", "changes"],
  ["<s>", "does not shift", "does <s>not</s> shift", "changes"],
  ["hidden span", "does not shift", "does <span hidden>not</span> shift", "changes"],
  ["display:none", "does not shift", "does <span style=\"display:none\">not</span> shift", "changes"],
  ["into a comment", "does not shift", "does <!-- not --> shift", "changes"],
  ["into a link title", "does not shift", "does [shift](https://x.org \"not\")", "changes"],
  ["into an image source", "does not shift", "does ![](not.png) shift", "changes"],
  ["a link destination changes", "see [the table](a.md)", "see [the table](b.md)", "same"],
  ["a comment changes", "it shifts <!-- check --> right", "it shifts <!-- checked --> right", "same"],
  ["sub- vs superscript in prose", "H~2~O", "H^2^O", "changes"],
  ["an arrow", "K ↑", "K ↓", "changes"],
  // typesetting-invariant TeX
  ["\\, \\mathrm vs \\ \\text", "$T = 298\\,\\mathrm{K}$", "$T = 298\\ \\text{K}$", "same"],
  ["\\le vs \\leq vs ≤", "$Q \\le K$", "$Q ≤ K$", "same"],
  ["\\dfrac vs \\frac", "$\\dfrac{a}{b}$", "$\\frac ab$", "same"],
  ["\\left( \\right) vs ( )", "$\\left( x \\right)$", "$(x)$", "same"],
  ["script braces", "$x^{2} + K_{c}$", "$x^2+K_c$", "same"],
  ["\\ln vs \\operatorname{ln}", "$\\ln K$", "$\\operatorname{ln} K$", "same"],
  ["spacing commands", "$a\\;b\\quad c\\!d$", "$a b c d$", "same"],
  ["\\displaystyle", "$\\displaystyle x$", "$x$", "same"],
  ["upright unit spellings", "$\\text{kJ mol}^{-1}$", "$\\mathrm{kJ\\,mol}^{-1}$", "same"],
  ["mhchem charge braces", "$\\ce{Fe^{3+}}$", "$\\ce{Fe^3+}$", "same"],
  ["- vs − in maths", "$-RT$", "$−RT$", "same"],
  ["\\to vs \\rightarrow", "$A \\to B$", "$A \\rightarrow B$", "same"],
  // TeX that typesets differently
  ["a script's reach", "$x^{10}$", "$x^10$", "changes"],
  ["sub vs sup", "$K_c$", "$K^c$", "changes"],
  ["mhchem arrow", "$\\ce{A -> B}$", "$\\ce{A <- B}$", "changes"],
  ["⇒ vs →", "$A \\Rightarrow B$", "$A \\rightarrow B$", "changes"],
  ["/ vs *", "$a/b$", "$a*b$", "changes"],
  ["a sign", "$-RT \\ln K$", "$RT \\ln K$", "changes"],
  ["a root's index", "$\\sqrt{x}$", "$\\sqrt[3]{x}$", "changes"],
  ["a cancel", "$x$", "$\\cancel{x}$", "changes"],
  ["a phantom sign", "$-5$", "$\\phantom{-}5$", "changes"],
  ["italic vs upright", "$K$", "$\\mathrm{K}$", "changes"],
  ["bold", "$x$", "$\\mathbf{x}$", "changes"],
  ["a digit", "$T = 298\\ \\text{K}$", "$T = 299\\ \\text{K}$", "changes"],
  ["a unit", "$T = 298\\ \\text{K}$", "$T = 298\\ \\text{C}$", "changes"],
  ["colour (white maths hides)", "$x$", "$\\color{white}{x}$", "changes"],
  ["a formula that does not typeset", "$\\frac{a}{b}$", "$\\frac{a}{b$", "changes"],
  // HTML entities and invisible characters
  ["a numeric entity", "does &#110;ot shift", "does not shift", "same"],
  ["a named entity", "Q &lt; K", "Q < K", "same"],
  ["entity: a relation flips", "Q &lt; K", "Q &gt; K", "changes"],
  ["no-break space", "a&nbsp;b", "a b", "same"],
  ["soft hyphen", "equi&shy;librium", "equilibrium", "same"],
  ["zero-width space", "equi\u200Blibrium", "equilibrium", "same"],
  ["Unicode NFC", "caf\u0065\u0301", "caf\u00e9", "same"],
  ["entities in raw HTML", "<div>Q &lt; K</div>", "<div>Q < K</div>", "same"],
  // case
  ["a sentence start", "Which way", "which way", "same"],
  ["a symbol's case", "$\\ln K$", "$\\ln k$", "changes", { case: true }],
  ["an acronym's case", "the pH rises", "the PH rises", "changes", { case: true }],
];
const unitOf = (text) => ({ id: "u-x", text, form: "paragraph", role: "teaching", spineNodes: [], locator: { deliverable: "x.md" } });
const NO_INPUT = { links: [], declared: [], guides: [], chapterNodes: [], before: "" };

test("[req.coherence.reader-view] the property table: a binding changes exactly when the reader sees a different word or symbol", () => {
  const wrong = [];
  for (const [name, a, b, outcome, o = {}] of TABLE) {
    const changes = outcome === "changes";
    const got = {
      meaning: meaningKey(a) !== meaningKey(b),
      review: reviewBasis(unitOf(a), NO_INPUT) !== reviewBasis(unitOf(b), NO_INPUT),
      light: lightKey(a) !== lightKey(b),
      question: questionHash(a) !== questionHash(b),
    };
    const want = { meaning: changes, review: changes, light: changes && !o.case, question: changes && !o.case };
    for (const k of Object.keys(want)) if (got[k] !== want[k]) wrong.push(`${name}: ${k} ${got[k] ? "changed" : "unchanged"} (${JSON.stringify(a)} → ${JSON.stringify(b)})`);
  }
  assert.deepEqual(wrong, []);
});

test("[req.coherence.reader-view] the reader view: maths as typeset, struck and hidden text gone, one view for every reader", () => {
  assert.equal(mathView("T = 298\\ {\\text{K}}"), mathView("T=298\\,\\mathrm{K}"));
  assert.equal(readerView("does [](not) shift"), "does shift");
  assert.equal(readerView("does ~~not~~ shift").replace(/\s+/g, " "), "does shift");
  assert.equal(readerView("Q &lt; K"), "Q < K");
  // every sign, relation, arrow and script survives the typesetting
  for (const [tex, syms] of [["\\Delta G^\\circ = -RT \\ln K", ["Δ", "^", "=", "−", "ln"]], ["Q_r > K", ["_", ">"]], ["\\ce{N2 + 3 H2 <=> 2 NH3}", ["+", "⇌", "_"]], ["K \\ll 1", ["≪"]], ["\\ce{Fe^3+}", ["^", "+"]]])
    for (const sym of syms) assert.ok(mathView(tex).includes(sym), `${tex}: ${sym} in ${mathView(tex)}`);
  // a light spine change is read on the same view: a TeX regrouping is no change at all, a struck word is substantive
  const node = (text) => ({ nodes: [{ id: "o", kind: "objective", text, prereqs: [] }], entries: [] });
  assert.equal(classifyChapterChange(node("Use $\\Delta G = -RT \\ln K$ at $298\\ \\text{K}$."), node("Use $\\Delta G = -RT\\ln K$ at $298\\ {\\text{K}}$.")).kind, "light");
  assert.notEqual(classifyChapterChange(node("Adding an inert gas does not shift it."), node("Adding an inert gas does ~~not~~ shift it.")).kind, "light");
});

// ============================================ C2-01 and the [](not) note: review currency ========================
test("[req.coherence.reader-view] [req.control.link-review] C2-01: striking a unit's teaching voids its link review; so does moving a word into an empty link — the objective is no longer counted as taught", async (t) => {
  const c = course(t);
  const teach = c.units().filter((u) => /^(study-guide|slides)\//.test(u.locator.deliverable) && u.role === "teaching" && (u.spineNodes || []).includes(OBJ) && u.form === "paragraph");
  const ids = teach.map((u) => u.id);
  assert.ok(ids.length >= 5, `${ids.length} prose units teach ${OBJ}`);
  // in the fixture a figure teaches the objective too: unlink every other study-guide/slides teacher, so the struck
  // prose is the objective's only cover (as on the round-5 base)
  const others = c.units().filter((u) => /^(study-guide|slides)\//.test(u.locator.deliverable) && (u.spineNodes || []).includes(OBJ) && !ids.includes(u.id));
  linkUnits(c.root, c.r(), Object.fromEntries(others.map((u) => [u.id, u.spineNodes.filter((n) => n !== OBJ)])), AGENT);
  await reviewAlignment(c.root, c.r(), { verifier: honestLinks(), only: ids });
  assert.ok(ids.every((id) => c.reviews().get(id)?.verdicts.get(OBJ) === "yes"), "an honest review of the unchanged text says yes");
  const strike = (t_) => t_.split("\n\n").map((p) => { const w = p.split(" "); return `${w.slice(0, 3).join(" ")} ~~${w.slice(3).join(" ")}~~`; }).join("\n\n");
  c.asAgent(() => { for (const u of teach) c.edit(u.locator.deliverable, u.text, strike(u.text)); });
  const now = c.reviews();
  assert.deepEqual(ids.filter((id) => now.has(id)), [], "no struck unit keeps its review");
  assert.deepEqual(ids.filter((id) => !c.owing("link-review-owed").has(id)), [], "each struck unit owes a link review (blocking, the agent's)");

  // the note: a word moved into an empty link — the reader loses "not"
  const d = course(t);
  const para = d.units().find((u) => u.locator.deliverable === SG && u.text.includes("**at constant volume does not shift it.**"));
  assert.ok(d.reviews().has(para.id), "the paragraph's (pre-R5) review is current before");
  d.asAgent(() => d.edit(SG, "**at constant volume does not shift it.**", "**at constant volume does [](not) shift it.**"));
  assert.equal(d.reviews().has(para.id), false, "the review is not current for text whose reader lost a word");
});

// ============================================ F5, F7: a change that changes nothing raises nothing ===============
test("[req.coherence.reader-view] [req.3c.h3] F5: a TeX regrouping that typesets identically owes nothing — no answer re-check, no link review; a TeX change that typesets differently still reaches the answer", (t) => {
  const c = course(t);
  const base = c.sig();
  c.asAgent(() => c.edit(CE, "A reaction has $K = 4.0$ at $T = 298\\ \\text{K}$.", "A reaction has $K = 4.0$ at $T = 298\\ {\\text{K}}$."));
  assert.deepEqual(c.sig(), base, "nothing new is owed");
  assert.ok(c.reviews().has(Q11), "Q11 keeps its link review");
  // other typesetting-invariant spellings of the same line
  c.asAgent(() => c.edit(CE, "A reaction has $K = 4.0$ at $T = 298\\ {\\text{K}}$.", "A reaction has $K=4.0$ at $T = 298\\,\\mathrm{K}$."));
  assert.deepEqual(c.sig(), base, "nothing new is owed");
  // the same unit, now in italic: K is a variable, not kelvin — the reader sees another symbol
  c.asAgent(() => c.edit(CE, "A reaction has $K=4.0$ at $T = 298\\,\\mathrm{K}$.", "A reaction has $K=4.0$ at $T = 298\\,K$."));
  assert.ok(c.owing("reverify").has(A11), "Answer 11 owes a re-check");
  assert.ok(c.owed().some((f) => f.kind === "answer-still-correct" && f.units.includes(A11)));
});

test("[req.coherence.reader-view] [req.3c.h3] F7: a reflow and an emphasis-and-punctuation edit keep every link review (records written before R5 migrate on read)", (t) => {
  const c = course(t);
  const base = c.sig(), before = c.reviews();
  assert.ok(before.has(Q6));
  const line = fs.readFileSync(path.join(c.root, SG), "utf8").split("\n").find((l) => l.includes("**Equal moles** of gas on both sides"));
  c.asAgent(() => {
    c.edit(SG, line, line.replace(/ /g, "  ").replace(/  /, " "));
    c.edit(PR, "The temperature is raised. Which way", "The temperature is *raised*; which way");
  });
  assert.deepEqual(c.sig(), base, "nothing new is owed");
  const now = c.reviews();
  assert.equal(now.get(Q6)?.dispatch, before.get(Q6).dispatch, "Q6's review is the same record");
  assert.equal(now.size, before.size);
});

// ============================================ the other bindings: answer, `unit:`, absolutes ======================
test("[req.coherence.reader-view] [req.coherence.question-binding] a word moved out of the reader's sight reaches every dependent: the answer (q3), a shared-value neighbour (unit:)", (t) => {
  const c = course(t);
  const A6 = "u-practice-le-chatelier-questions-12";
  c.asAgent(() => c.edit(PR, "The temperature is raised. Which way", "The temperature is [](raised). Which way"));
  assert.ok(c.owing("reverify").has(A6), "Answer 6 owes: its question lost a word");
  // a value struck in Q11: the source still states it, the reader does not see it — the study guide's worked example
  // that shares it (a `unit:` edge, no question binding) owes a re-check
  const d = course(t);
  assert.ok(Object.keys(d.unit(SG_WE3).stamp).includes(`unit:${Q11}`));
  d.asAgent(() => d.edit(CE, "A reaction has $K = 4.0$ at", "A reaction has ~~$K = 4.0$~~ at"));
  assert.equal(factHash("A reaction has ~~$K = 4.0$~~ at"), factHash("A reaction has $K = 4.0$ at"), "the source's fact tokens did not move");
  assert.ok(d.owing("reverify").has(SG_WE3), "the shared-value neighbour owes");
  // …and a struck copy of a value the reader still sees moves nothing
  const e = course(t);
  const owedBefore = e.owing("reverify");
  e.asAgent(() => e.edit(CE, "A reaction has $K = 4.0$ at", "A reaction has $K = 4.0$ ~~($K = 4.0$)~~ at"));
  assert.equal(e.owing("reverify").has(SG_WE3), owedBefore.has(SG_WE3), "a struck duplicate moves no `unit:` binding");
});

test("[req.coherence.reader-view] [req.absolute.review] an absolute review stays current through emphasis and a reflow, and not through a struck word", (t) => {
  const c = course(t);
  const owed0 = c.owing("absolute-unreviewed");
  const SL = "slides/chemical-equilibrium.md", S0 = "Each concentration raised to its **stoichiometric coefficient**.";
  const u = c.units().find((x) => x.locator.deliverable === SL && x.text.includes(S0));
  assert.ok(u && absoluteSentences(u.text).length && !owed0.has(u.id), "the unit's absolute review is current");
  const S1 = "*Each* concentration  raised to its stoichiometric coefficient.";
  c.asAgent(() => c.edit(SL, S0, S1));
  assert.equal(c.owing("absolute-unreviewed").has(u.id), false, "emphasis and spacing: still reviewed");
  c.asAgent(() => c.edit(SL, S1, "~~*Each*~~ concentration  raised to its stoichiometric coefficient."));
  assert.ok(c.owing("absolute-unreviewed").has(u.id), "a struck absolute: the review is owed again");
  assert.equal(absolutesHash("It *always* shifts."), absolutesHash("It always  shifts."));
});

// ============================================ migration ==========================================================
test("[req.coherence.reader-view] migration: records keyed on the old normalisations are upgraded where the text is unchanged under both keys, else one re-check", (t) => {
  // q2 (R4) question bindings: exact upgrade — the R5 light key is a function of the R4 key except where R4 read
  // something differently, which costs one re-check
  for (const q of ["Which way does the equilibrium shift? *(Objective 3)*", "$\\Delta G = -RT \\ln K$ at $T = 298\\ \\text{K}$", "$\\ce{N2 + 3 H2 <=> 2 NH3}$"]) assert.equal(r4QuestionCurrent(questionHashR4(q), q), true, q);
  for (const q of ["equi\u00ADlibrium", "<div>Q &lt; K</div>", "$A \\Rightarrow B$", "caf\u0065\u0301"]) assert.equal(r4QuestionCurrent(questionHashR4(q), q), false, q);
  assert.equal(r4QuestionCurrent(questionHashR4("raised"), "lowered"), false);
  // `unit:` bindings on the source fact key: upgraded unless the source states facts the reader does not see
  assert.equal(unitStampCurrent(factHash("K = 4.0 at 298 K"), "K = 4.0 at 298 K"), true);
  assert.equal(unitStampCurrent(factHash("it does ~~not~~ shift"), "it does ~~not~~ shift"), false);
  assert.match(unitTargetHash("x"), /^v:/);
  // the frozen fixture: the session begin writes every record migrated, and nothing is owed
  const c = course(t);
  const base = c.sig(), reviewed = c.reviews().size;
  const keys = () => fs.readdirSync(path.join(c.root, "metadata/units"), { recursive: true }).filter((f) => f.endsWith(".json")).flatMap((f) => readSidecar(c.root, f.replace(/\.json$/, ""))?.units || []).flatMap((u) => Object.entries(u.stamp || {}));
  beginSession(c.root, c.r(), AGENT);
  const after = keys();
  assert.ok(after.filter(([k]) => /^(question|ref):/.test(k)).every(([, h]) => h.startsWith("q3:")), "every question binding is on the R5 key");
  assert.ok(after.filter(([k]) => k.startsWith("unit:")).every(([, h]) => h.startsWith("v:")), "every `unit:` binding is on the reader view");
  assert.deepEqual(c.sig(), base, "and nothing is owed");
  assert.equal(c.reviews().size, reviewed, "every link review written before R5 is still current");
});
