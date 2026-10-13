// 3C RED TEAM, ROUND 6 — THE INSTRUCTOR'S TEXT: one root cause behind four findings, fixed at its cause (operator rule
// D46) and probed here on the real course (tests/fixtures/c2-chemistry-v2 + c2-chemistry inputs) with NEW variants.
// Record of the round: the red team's REPORT.md (P11 study, redteam-r6/confidence).
//
// The cause — the instructor's text was protected along one ROUTE, not on the text itself: the two-source rule and the
// correction record lived inside applyCorrection, the unasked-edit question fired only when the new words were a
// reviewer's suggestion, source independence was counted by address, and a confirmation was bound to fact tokens.
//   R6-K02 (k4)  a hand edit of the instructor's value in an ordinary session, verified on one source .... [req.instructor-text.protected]
//   R6-K03 (k6)  the instructor's words rewritten in the agent's own words after a "wrong" concern ........ [req.instructor-text.protected]
//   variants     an edit across two sessions, a merge with agent text, a value changed in a table, a split then a
//                change in one piece, a removed paragraph; and what stays silent: a meaning-free edit, a merge alone,
//                a guarded correction and its revert, an accepted suggestion, the instructor's "keep"
//   R6-K01 (k4)  one page pinned twice (trailing slash, same sha256) counted as two sources ................ [req.autocorrect.independent-sources]
//   variants     a mirror inside other boilerplate on another host, a re-encoded copy, a print view; control: a
//                genuinely independent second text still counts
//   R6-K04 (k1)  a confirmation bound to factHash survives "exothermic … lowers" → "endothermic … raises" .. [req.confirmation.bound-text]
//   variants     a struck negation, a reflow that keeps it, legacy confirmations migrated by what the log binds
// Offline and deterministic: every verifier is a replayed test double.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { confirmUnits, confirmationStands, coreObligations, evidenceStands, indexAndStamp, instructorActsOf, linkUnits, loadUnits, shownBeforeOf } from "../scripts/lib/core/obligations.mjs";
import { beginSession, claimAuthorship, instructorRegister } from "../scripts/lib/core/units_index.mjs";
import { instructorTextChange, seenKey } from "../scripts/lib/core/authorship.mjs";
import { buildDigest, answerDigest } from "../scripts/lib/core/digest.mjs";
import { unitInfoOf } from "../scripts/lib/core/workflow.mjs";
import { runCheckpoint } from "../scripts/lib/skeleton/runner.mjs";
import { parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { applyCorrection, independentSources, revertCorrection, verifyKnowledge, verifySemi } from "../scripts/lib/verify/verdicts.mjs";
import { fsInputReader, pinReference, pinnedTexts, syncReferenceRecord } from "../scripts/lib/verify/references.mjs";
import { factHash } from "../scripts/lib/core/dependencies.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const SG = "study-guide/le-chatelier.md";
const ANCHOR = "but it also slows the rate.";
const NEIGH = "u-study-guide-le-chatelier-changing-the-temperature-6";
const OPENSTAX_13_3 = "Most industrial production of ammonia uses the Haber-Bosch process based on the following equilibrium reaction:\n N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ \n The traits of this reaction present challenges to its use in an efficient industrial process. The equilibrium constant is relatively small ( K p on the order of 10 −5 at 25 °C), meaning very little ammonia is present in an equilibrium mixture. Also, the rate of this reaction is relatively slow at low temperatures.";
const URL0 = "https://openstax.org/books/chemistry-2e/pages/13-3-shifting-equilibria-le-chateliers-principle";
const PIN = { url: URL0, title: "13.3 Shifting Equilibria", destination: "openstax.org/books/chemistry-2e", text: OPENSTAX_13_3 };
const QUOTES = ["Most industrial production of ammonia uses the Haber-Bosch process based on the following equilibrium reaction:", "N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ"];

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r6-instructor-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  fs.cpSync(C2, root, { recursive: true }); fs.cpSync(INPUTS, inputs, { recursive: true });
  const c = {
    root, inputs, r: () => liveReader(root),
    units: () => loadUnits(root, liveReader(root)),
    unit: (id) => loadUnits(root, liveReader(root)).find((u) => u.id === id),
    find: (text) => loadUnits(root, liveReader(root)).find((u) => u.text === text),
    has: (part) => loadUnits(root, liveReader(root)).find((u) => u.text.includes(part)),
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent(fn) { beginSession(root, liveReader(root), AGENT); fn(); indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    log: () => parseLog(readLogText(root)),
    // MS8 alone, through the real runner
    ms8f: () => runCheckpoint({ root, checkpoint: "V8", profile: "public", inputsDir: inputs, registry: { schemaVersion: 1, __noStandard: true, modules: [{ name: "ms8-verdicts", version: "1.0.0", maturity: "stable", enabled: true }] } }).findings.filter((f) => f.module === "ms8-verdicts"),
    ms8(...ids) { return c.ms8f().filter((f) => !ids.length || (f.units || []).some((id) => ids.includes(id))).map((f) => `${f.kind}:${f.statusClass}`).sort(); },
    core: () => coreObligations(root, liveReader(root), "t"),
    texts: () => pinnedTexts(fsInputReader(inputs)),
    plain: () => new Map([...pinnedTexts(fsInputReader(inputs))].filter(([, v]) => v.ok).map(([k, v]) => [k, v.text])),
  };
  return c;
}
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];
const review = (concerns) => replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns }));
const passagesOf = (pr) => pr.split("\nPASSAGES\n")[1].split("\n").map((l) => l.match(/^\[(\d+)\] (.*)$/)).filter(Boolean).map((m) => ({ n: Number(m[1]), text: m[2] }));
const claimCount = (pr) => pr.split("\nCLAIMS\n")[1].split("\n\nPASSAGES")[0].split("\n").filter((l) => /^\d+\. /.test(l)).length;
/** A replayed semi verifier: `verdict` for every claim, each quote from the passage `pick` chooses among those holding it. */
const semiReplay = (verdict, pick = "first", quotes = QUOTES) => replayVerifier((pr) => {
  const ps = passagesOf(pr), qs = quotes.map((q) => { const all = ps.filter((x) => x.text.includes(q)); const p = pick === "last" ? all.at(-1) : all[0]; return p ? { passage: p.n, text: q } : null; }).filter(Boolean);
  return { nonce: nonceOf(pr), claims: Array.from({ length: claimCount(pr) }, (_, i) => ({ claim: i + 1, verdict, quotes: qs, note: "replayed" })) };
});

/** The instructor writes paragraphs after the anchor (outside any agent session) and claims them; linked like the neighbour. */
function instructorWrites(c, paragraphs, after = ANCHOR) {
  const spine = c.unit(NEIGH).spineNodes;
  c.edit(SG, after, `${after}\n\n${paragraphs.join("\n\n")}`); indexAndStamp(c.root, c.r(), {});
  const ids = paragraphs.map((p) => c.find(p).id);
  claimAuthorship(c.root, { units: ids, instructorWords: "Those paragraphs are mine." }, I);
  linkUnits(c.root, c.r(), Object.fromEntries(ids.map((id) => [id, spine])), AGENT);
  return ids;
}
function agentWrites(c, paragraphs, after = ANCHOR) {
  const spine = c.unit(NEIGH).spineNodes;
  c.asAgent(() => c.edit(SG, after, `${after}\n\n${paragraphs.join("\n\n")}`));
  const ids = paragraphs.map((p) => c.find(p).id);
  linkUnits(c.root, c.r(), Object.fromEntries(ids.map((id) => [id, spine])), AGENT);
  return ids;
}
const digestOf = (c) => buildDigest(c.root, runCheckpoint({ root: c.root, checkpoint: "V8", profile: "public", inputsDir: c.inputs, registry: { schemaVersion: 1, __noStandard: true, modules: [{ name: "ms8-verdicts", version: "1.0.0", maturity: "stable", enabled: true }] } }).findings, unitInfoOf(c.root, c.r()));
function answer(c, kind, choice) {
  const d = digestOf(c), e = d.entries.find((x) => x.kind === kind);
  assert.ok(e, `a ${kind} entry in the digest`);
  return answerDigest(c.root, d, { answers: { [e.key]: choice }, instructorWords: `${choice}.`, reader: c.r() }, I);
}

const S1 = "Ammonia synthesis is the textbook case of an industrial equilibrium.";
const S2 = "For the Haber-Bosch reaction $\\ce{N2 + 3 H2 <=> 2 NH3}$, the enthalpy change is $\\Delta H = -75.0\\ \\text{kJ}$.";
const P = `${S1} ${S2}`;
const NEW = P.replace("-75.0", "-92.2");
const UNASKED = "instructor-edit-unasked:question", FACT = "instructor-fact-changed:obligation";

// ============================================ THE INSTRUCTOR'S TEXT, WHATEVER THE ROUTE ===========================
test("[req.instructor-text.protected] R6-K02: a hand edit of the instructor's value in an ordinary session, verified on one source, is their question and a blocking obligation — reverting, or their keep, clears it", async (t) => {
  const c = course(t);
  const [id] = instructorWrites(c, [P]);
  assert.equal(instructorRegister(c.root).get(id)?.text, P, "the text they accepted is registered as theirs");
  // control: the guarded route refuses one source
  pinReference(c.root, c.inputs, PIN); syncReferenceRecord(c.root, c.inputs);
  await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay("contradicted"), only: [id] });
  const ctl = applyCorrection(c.root, c.r(), { unitId: id, plainTexts: c.plain(), meta: c.texts() }, AGENT);
  assert.equal(ctl.applied, false); assert.match(ctl.question.reason, /two agreeing sources \(has 1/);
  // the attack: the same change by hand, admitted on one source
  c.asAgent(() => c.edit(SG, P, NEW));
  const now = c.find(NEW);
  assert.equal(now.origin.kind, "instructor-authored", "their credit stays (D33)");
  const res = await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay("supported"), only: [now.id] });
  assert.equal(res[0].status, "admitted");
  assert.deepEqual(c.ms8(now.id), [UNASKED, FACT]);
  const q = c.ms8f().find((f) => f.kind === "instructor-edit-unasked");
  assert.equal(q.route, "digest"); assert.equal(q.recommendation, "revert", "a changed fact with no correction: revert is recommended");
  assert.match(q.evidence.note, /-75\.0kJ → -92\.2kJ/); assert.equal(q.evidence.before, P); assert.equal(q.evidence.after, NEW);
  const ob = c.ms8f().find((f) => f.kind === "instructor-fact-changed");
  assert.equal(ob.route, "agent"); assert.match(ob.evidence.what, /two independent agreeing sources/);
  // revert: nothing is left
  const r1 = course(t); const [rid] = instructorWrites(r1, [P]);
  r1.asAgent(() => r1.edit(SG, P, NEW));
  assert.deepEqual(r1.ms8(rid), [UNASKED, FACT]);
  r1.asAgent(() => r1.edit(SG, NEW, P));
  assert.deepEqual(r1.ms8(rid), [], "reverted to their text");
  // their "keep": the text is theirs now — question answered, obligation gone, and the register follows
  answer(c, "instructor-edit-unasked", "keep the edit");
  assert.deepEqual(c.ms8(now.id), []);
  assert.equal(instructorRegister(c.root).get(id)?.text, NEW);
  // their "revert": the agent owes it
  const r2 = course(t); const [vid] = instructorWrites(r2, [P]);
  r2.asAgent(() => r2.edit(SG, S1, "Ammonia synthesis is the classic example of an industrial equilibrium."));
  assert.deepEqual(r2.ms8(vid), [UNASKED], "words only: a question, not blocking");
  answer(r2, "instructor-edit-unasked", "revert it");
  assert.deepEqual(r2.ms8(vid), ["instructor-edit-unasked:question", "instructor-revert-owed:obligation"]);
  assert.equal(digestOf(r2).entries.filter((e) => e.kind === "instructor-edit-unasked").length, 0, "answered: not asked again");
  r2.asAgent(() => r2.edit(SG, "Ammonia synthesis is the classic example of an industrial equilibrium.", S1));
  assert.deepEqual(r2.ms8(vid), []);
});

test("[req.instructor-text.protected] R6-K03: the instructor's words rewritten in the agent's own words after a concern are raised; the verbatim suggestion is raised once", async (t) => {
  const REL = "study-guide/chemical-equilibrium.md", WORDS = "products favoured";
  const run = async (replacement) => {
    const c = course(t);
    c.edit(REL, `(${WORDS}), and a positive`, `(${WORDS}), and so a positive`); indexAndStamp(c.root, c.r(), {});
    const id = c.has(`(${WORDS}), and so a positive`).id;
    claimAuthorship(c.root, { units: [id], instructorWords: "That paragraph is mine." }, I);
    await verifyKnowledge(c.root, c.r(), { only: [id], verifier: review([{ kind: "wrong", text: WORDS, problem: "K > 1 favours products only in the ratio.", suggestion: "a product-favoured ratio" }]) });
    c.asAgent(() => c.edit(REL, `(${WORDS}), and so`, `(${replacement}), and so`));
    const u = c.has(`(${replacement}), and so`);
    await verifyKnowledge(c.root, c.r(), { only: [u.id], verifier: review([]) }); // a fresh clean review of the new text
    return { c, u };
  };
  const k = await run("a product-favoured ratio");
  assert.deepEqual(k.c.ms8(k.u.id).filter((x) => x.startsWith("instructor-")), [UNASKED], "the suggestion path raises it, once");
  const a = await run("the equilibrium ratio leans toward products");
  assert.equal(a.u.origin.kind, "instructor-authored");
  assert.deepEqual(a.c.ms8(a.u.id), [UNASKED], "a paraphrase: their question; no fact changed, so nothing blocks");
  assert.match(a.c.ms8f().find((f) => f.kind === "instructor-edit-unasked").evidence.note, /products favoured.*now reads.*leans toward products/s);
});

test("[req.instructor-text.protected] a meaning-free edit is allowed silently and keeps their credit; a meaning change in another sentence of theirs is not", (t) => {
  const c = course(t);
  const [id] = instructorWrites(c, [P]);
  // reflow, emphasis, grouping braces in maths, a non-breaking space: the reader sees the same words and symbols
  const SAME = `*Ammonia synthesis* is the textbook case of an industrial equilibrium.\nFor the Haber-Bosch reaction $\\ce{N2 + 3 H2 <=> 2 NH3}$, the enthalpy change is $\\Delta H = {-75.0}\\ {\\text{kJ}}$.`;
  c.asAgent(() => c.edit(SG, P, SAME));
  const u = c.find(SAME);
  assert.equal(u.origin.kind, "instructor-authored"); assert.ok(u.origin.revisedBy?.length, "the revision is on record");
  assert.deepEqual(c.ms8(u.id), [], "silent (D17, D33)");
  // a direction word in their text: a question
  c.asAgent(() => c.edit(SG, "industrial equilibrium", "laboratory equilibrium"));
  assert.deepEqual(c.ms8(u.id), [UNASKED]);
  // property: the rule itself
  assert.equal(instructorTextChange(P, SAME), null);
  // D49 (operator 2026-10-12): a direction reversal is a changed fact, like a value (tests/d49-decisions.test.mjs)
  assert.equal(instructorTextChange("Heating shifts it left.", "Heating shifts it right.").factChange, true);
  assert.equal(instructorTextChange("Adding argon does shift it.", "Adding argon does not shift it.").factChange, true, "a negation is a fact");
  assert.equal(instructorTextChange("Adding argon does shift it.", "Adding argon does ~~not~~ shift it."), null, "struck text is not read");
  assert.equal(instructorTextChange("It shifts.", "It shifts.\n\nA new sentence of the agent.", { joined: true }), null, "words joined from another unit are not theirs");
  assert.notEqual(instructorTextChange("It shifts.", "It shifts. A new sentence inside their paragraph."), null, "words added into their paragraph are");
});

test("[req.instructor-text.protected] variants: an edit across two sessions, a split then a change in one piece, a merge with agent text, a value in a table, a removed paragraph", (t) => {
  // across two sessions: a meaning-free reflow first, then the value — read against the text they registered
  const a = course(t);
  const [A] = instructorWrites(a, [P]);
  a.asAgent(() => a.edit(SG, P, `${S1}\n${S2}`));
  assert.deepEqual(a.ms8(A), []);
  a.asAgent(() => a.edit(SG, "-75.0", "-92.2"));
  assert.deepEqual(a.ms8(A), [UNASKED, FACT]);
  assert.equal(a.ms8f().find((f) => f.kind === "instructor-edit-unasked").evidence.before, P, "compared with their registered text, not the last session's");
  assert.equal(parseLog(readLogText(a.root)).filter((l) => l.payload?.event === "instructor-text-baseline" && JSON.stringify(l.payload.texts).includes("-92.2")).length, 0, "a later session never re-registers the agent's text as theirs");
  // a split (silent), then the value changed in one piece in another session
  const b = course(t);
  instructorWrites(b, [P]);
  b.asAgent(() => b.edit(SG, P, `${S1}\n\n${S2}`));
  const piece = b.find(S2);
  assert.deepEqual(b.ms8(piece.id, b.find(S1).id), [], "a split changes no meaning");
  b.asAgent(() => b.edit(SG, S2, S2.replace("-75.0", "-92.2")));
  assert.deepEqual(b.ms8(piece.id), [UNASKED, FACT]);
  // a merge with the agent's paragraph: silent; then their value changed inside the merged unit
  const m = course(t);
  const AG = "Industrial chemists balance yield against rate when they choose operating conditions for a synthesis.";
  agentWrites(m, [AG]);
  const [MP] = instructorWrites(m, [P]);
  m.asAgent(() => m.edit(SG, `${P}\n\n${AG}`, `${P} ${AG}`));
  const merged = m.find(`${P} ${AG}`);
  assert.ok(merged, "merged");
  assert.deepEqual(m.ms8(merged.id, MP), [], "their words joined to the agent's: nothing changed of theirs");
  m.asAgent(() => m.edit(SG, `${P} ${AG}`, `${NEW} ${AG}`));
  assert.deepEqual(m.ms8(m.find(`${NEW} ${AG}`).id), [UNASKED, FACT]);
  // a value in a table of theirs
  const tb = course(t);
  const TABLE = "| Quantity | Value |\n|---|---|\n| $\\Delta H$ (Haber-Bosch) | $-75.0\\ \\text{kJ}$ |\n| $K_p$ at 25 °C | about $10^{-5}$ |";
  const spine = tb.unit(NEIGH).spineNodes;
  tb.edit(SG, ANCHOR, `${ANCHOR}\n\n${TABLE}`); indexAndStamp(tb.root, tb.r(), {});
  const rows = tb.units().filter((u) => u.form === "table-row" && /Haber-Bosch\) \||K_p\$ at 25/.test(u.text));
  assert.equal(rows.length, 2, "a table is indexed row by row");
  claimAuthorship(tb.root, { units: rows.map((u) => u.id), instructorWords: "My table." }, I);
  linkUnits(tb.root, tb.r(), Object.fromEntries(rows.map((u) => [u.id, spine])), AGENT);
  tb.asAgent(() => tb.edit(SG, "$-75.0\\ \\text{kJ}$ |", "$-92.2\\ \\text{kJ}$ |"));
  const T = tb.has("$-92.2\\ \\text{kJ}$ |");
  assert.equal(T.id, rows[0].id, "the row keeps its id");
  assert.deepEqual(tb.ms8(T.id), [UNASKED, FACT]);
  assert.deepEqual(tb.ms8(rows[1].id), [], "the other row is untouched");
  // read on the reader view since round 7 (R7-K07): the typeset value with its unit
  assert.deepEqual(tb.ms8f().find((f) => f.kind === "instructor-fact-changed").evidence.from, ["-75.0kJ"]);
  // their paragraph removed by an agent session
  const d = course(t);
  const [D] = instructorWrites(d, [P]);
  d.asAgent(() => d.edit(SG, `\n\n${P}`, ""));
  assert.equal(d.unit(D), undefined);
  assert.deepEqual(d.ms8(D), [UNASKED], "removed: their question, not blocking");
  answer(d, "instructor-edit-unasked", "keep it removed");
  assert.deepEqual(d.ms8(D), []);
});

test("[req.instructor-text.protected] [req.knowledge.clarify] what the instructor asked for is not unasked: a guarded correction and its revert, an accepted suggestion", async (t) => {
  // a correction on two independent sources: applied, logged and shown — the register follows, nothing is raised
  const c = course(t);
  const [id] = instructorWrites(c, [P]);
  pinReference(c.root, c.inputs, PIN);
  pinReference(c.root, c.inputs, { url: "https://en.wikipedia.org/wiki/Haber_process", title: "Haber process", destination: "en.wikipedia.org", text: "The Haber-Bosch process: N2 + 3 H2 ⇌ 2 NH3, ΔH = −92.2 kJ for the reaction as written, an exothermic synthesis run near 450 °C." });
  syncReferenceRecord(c.root, c.inputs);
  await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay("contradicted"), only: [id] });
  await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay("contradicted", "first", ["N2 + 3 H2 ⇌ 2 NH3, ΔH = −92.2 kJ for the reaction as written"]), only: [id] });
  const fix = applyCorrection(c.root, c.r(), { unitId: id, plainTexts: c.plain(), meta: c.texts() }, AGENT);
  assert.equal(fix.applied, true, JSON.stringify(fix.question));
  const now = c.has("Haber-Bosch reaction");
  assert.match(now.text, /-92\.2/);
  assert.deepEqual(c.ms8(now.id), [], "the guarded route: no unasked edit");
  // their revert after seeing it: their value is back, and theirs
  revertCorrection(c.root, c.r(), fix.correction.id, { note: "Our lab manual's value, on purpose." }, I);
  assert.match(c.has("Haber-Bosch reaction").text, /-75\.0/);
  assert.deepEqual(c.ms8(c.has("Haber-Bosch reaction").id), []);
  // a clarification they accepted, applied by the agent: asked for
  const k = course(t);
  const REL = "study-guide/chemical-equilibrium.md";
  k.edit(REL, "(products favoured), and a positive", "(products favoured), and so a positive"); indexAndStamp(k.root, k.r(), {});
  const kid = k.has("(products favoured), and so a positive").id;
  claimAuthorship(k.root, { units: [kid], instructorWords: "Mine." }, I);
  await verifyKnowledge(k.root, k.r(), { only: [kid], verifier: review([{ kind: "clarify", text: "(products favoured)", problem: "Correct as meant.", suggestion: "(products favoured at equilibrium)" }]) });
  answerDigest(k.root, digestOf(k), { acceptAll: true, instructorWords: "Apply it.", reader: k.r() }, I);
  k.asAgent(() => k.edit(REL, "(products favoured), and so", "(products favoured at equilibrium), and so"));
  assert.deepEqual(k.ms8(kid), []);
});

// ============================================ SOURCES ARE COUNTED AS TEXTS ======================================
test("[req.autocorrect.independent-sources] [req.autocorrect.guard] R6-K01: the same page pinned twice is one source; so are a mirror, a re-encoded copy and a print view — a genuinely independent text is a second", async (t) => {
  const run = async (second, { pick = "last", quote = QUOTES } = {}) => {
    const c = course(t);
    const [id] = instructorWrites(c, [P]);
    pinReference(c.root, c.inputs, PIN);
    if (second) pinReference(c.root, c.inputs, second);
    syncReferenceRecord(c.root, c.inputs);
    await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay("contradicted"), only: [id] });
    await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay("contradicted", pick, quote), only: [id] });
    return applyCorrection(c.root, c.r(), { unitId: id, plainTexts: c.plain(), meta: c.texts() }, AGENT);
  };
  const one = /two agreeing sources \(has 1/;
  assert.match((await run(null)).question.reason, one, "control: one pin");
  assert.match((await run({ ...PIN, url: `${URL0}/` })).question.reason, one, "R6-K01: the trailing-slash URL, same text");
  assert.match((await run({ ...PIN, url: `${URL0}?print=1` })).question.reason, one, "a print view");
  assert.match((await run({ ...PIN, url: "https://cnx.example.org/mirror/13-3", destination: "cnx.example.org", text: OPENSTAX_13_3.toUpperCase().replace(/ +/g, "  ") })).question.reason, one, "a re-encoded copy on another host (case, spacing)");
  assert.match((await run({ ...PIN, url: "https://mirror.example.edu/chem/13-3", destination: "mirror.example.edu", text: `Course mirror — Chemistry 2e. Navigation: Home | Contents.\n${OPENSTAX_13_3}\nFooter: mirrored for students, all rights belong to OpenStax.` })).question.reason, one, "a mirror inside other boilerplate");
  // control: a genuinely independent text stating the same value is a second source
  const IND = "N2 + 3 H2 ⇌ 2 NH3, ΔH = −92.2 kJ for the reaction as written";
  const two = await run({ url: "https://en.wikipedia.org/wiki/Haber_process", title: "Haber process", destination: "en.wikipedia.org", text: `The Haber-Bosch process: ${IND}, an exothermic synthesis run near 450 °C.` }, { pick: "first", quote: [IND] });
  assert.equal(two.applied, true, JSON.stringify(two.question));
  // the counting rule itself
  const plain = new Map([["a", OPENSTAX_13_3], ["b", OPENSTAX_13_3], ["c", "An unrelated text that happens to quote: ΔH = −92.2 kJ for ammonia, from a calorimetry table."]]);
  const at = (src, q) => ({ source: src, quote: q, span: [plain.get(src).indexOf(q), plain.get(src).indexOf(q) + q.length] });
  assert.equal(independentSources([at("a", "Δ H = −92.2 kJ"), at("b", "Δ H = −92.2 kJ")], plain, new Map([["a", { url: URL0 }], ["b", { url: "https://other.example/x" }]])), 1, "same text, other address: one");
  assert.equal(independentSources([at("a", "Δ H = −92.2 kJ"), at("c", "ΔH = −92.2 kJ")], plain, new Map([["a", { url: URL0, sha256: "1" }], ["c", { url: URL0, sha256: "2" }]])), 1, "same address, other text: still one page");
  assert.equal(independentSources([at("a", "Δ H = −92.2 kJ"), at("c", "ΔH = −92.2 kJ")], plain, new Map()), 2);
});

// ============================================ A CONFIRMATION IS BOUND TO WHAT WAS SEEN ============================
test("[req.confirmation.bound-text] R6-K04: a confirmation does not carry to rewritten words; a reflow keeps it; a lapsed one is asked again once, and confirming it restores the evidence", (t) => {
  const S = "For the exothermic ammonia synthesis ($\\Delta H = -92.2\\ \\text{kJ}$), raising the temperature lowers the equilibrium yield.";
  const W = S.replace("exothermic", "endothermic").replace("temperature lowers", "temperature raises");
  const c = course(t);
  const [id] = agentWrites(c, [S]);
  confirmUnits(c.root, c.r(), [id], { what: "fact", instructorWords: "Yes, that is right as written." }, I);
  const stands = (text) => { const all = c.units(); return evidenceStands(c.root, all.find((u) => u.text === text), all); };
  assert.ok(stands(S));
  const rec = c.log().filter((l) => l.type === "confirmation").at(-1);
  assert.equal(rec.payload.seenKeys[id], seenKey(S), "what the instructor saw is logged with the confirmation");
  // the key: a reversal, another subject, a struck negation change it; since round 7 (R7-K03, D50) it is the ordered
  // reading, so a reordering rephrase of a confirmed text is confirmed again (tests/redteam-r7-order.test.mjs)
  assert.notEqual(seenKey("At 1 atm, ice melts at 0 °C."), seenKey("Ice melts at 0 °C at 1 atm."));
  assert.notEqual(seenKey(W), seenKey(S));
  assert.notEqual(seenKey(S.replace("ammonia synthesis", "sulfur trioxide synthesis")), seenKey(S));
  assert.notEqual(seenKey("It has fewer moles, so more product."), seenKey("It has more moles, so fewer product."), "direction words in order");
  assert.notEqual(seenKey("Argon does not shift it."), seenKey("Argon does ~~not~~ shift it."));
  assert.notEqual(seenKey("$a - b = 1$"), seenKey("$b - a = 1$"), "a formula is one token");
  // a reflow (and a grouping brace) changes no meaning: it stands
  const R = S.replace("synthesis (", "synthesis\n(").replace("-92.2", "{-92.2}");
  c.asAgent(() => c.edit(SG, S, R));
  assert.ok(stands(R), "a meaning-free edit keeps the confirmation");
  // the rewrite: factHash unchanged, the confirmation no longer counts
  c.asAgent(() => c.edit(SG, R, W));
  assert.equal(factHash(W), factHash(S), "the fact tokens did not move");
  assert.equal(stands(W), false, "R6-K04: the words the instructor confirmed are gone");
  const owed = c.core().filter((f) => (f.units || []).includes(c.find(W).id)).map((f) => `${f.kind}:${f.statusClass}`).sort();
  assert.deepEqual(owed, ["confirmation-stale:question", "evidence-missing:obligation"]);
  // a struck negation is what the reader sees too
  const N = "Adding argon at constant volume does not change the yield of $2\\ \\text{mol}$ of ammonia.";
  const n = course(t); const [nid] = agentWrites(n, [N]);
  confirmUnits(n.root, n.r(), [nid], { what: "fact", instructorWords: "Right." }, I);
  n.asAgent(() => n.edit(SG, N, N.replace("does not", "does ~~not~~")));
  const nu = n.has("does ~~not~~");
  assert.equal(factHash(nu.text), factHash(N));
  assert.equal(evidenceStands(n.root, nu, n.units()), false, "struck: the reader no longer sees the negation");
  // asked once: confirming it as it reads now restores it
  const d = buildDigest(c.root, c.core(), unitInfoOf(c.root, c.r()));
  const e = d.entries.find((x) => x.kind === "confirmation-stale");
  assert.ok(e && e.recommendation === "confirm");
  answerDigest(c.root, d, { answers: { [e.key]: "confirm" }, instructorWords: "Yes, as it reads now.", reader: c.r() }, I);
  assert.ok(stands(W));
  assert.deepEqual(c.core().filter((f) => (f.units || []).includes(c.find(W).id)).map((f) => f.kind), []);
});

test("[req.confirmation.bound-text] migration: a confirmation logged before R6 stands while the text it was given is unchanged — by its contentHash, or by what the log binds of the latest review before it", async (t) => {
  const S = "In the worked example, $K_c = 0.105$ at $472\\ ^\\circ\\text{C}$ for the ammonia synthesis.";
  const c = course(t);
  const [id] = agentWrites(c, [S]);
  pinReference(c.root, c.inputs, PIN); syncReferenceRecord(c.root, c.inputs);
  await verifySemi(c.root, c.r(), { texts: c.texts(), verifier: semiReplay("unsupported"), only: [id] });
  const u = c.find(S);
  const legacy = (payload) => instructorActsOf([...c.log(), { seq: 1e9, type: "confirmation", party: I, payload: { what: "fact", units: [id], factHashes: { [id]: factHash(S) }, ...payload } }]);
  const shown = shownBeforeOf(c.log(), (d) => { try { return JSON.parse(fs.readFileSync(path.join(c.root, "metadata", "verification", `${d}.json`), "utf8")); } catch { return null; } });
  const actsOf = (payload) => instructorActsOf([...c.log(), { seq: 1e9, type: "confirmation", party: I, payload: { what: "fact", units: [id], factHashes: { [id]: factHash(S) }, ...payload } }], { shownBefore: shown });
  assert.ok(confirmationStands(actsOf({ contentHashes: { [id]: u.locator.contentHash } }), u), "R4-R5 record: its contentHash");
  assert.ok(confirmationStands(actsOf({}), u), "pre-R4 record: the latest review before it showed this text (bound by the log)");
  assert.equal(confirmationStands(legacy({}), u), false, "nothing to bind it by: it no longer counts");
  const W = { ...u, text: S.replace("worked example", "industrial plant") };
  assert.equal(factHash(W.text), factHash(S));
  assert.equal(confirmationStands(actsOf({}), W), false, "the claims it was given are gone");
  assert.equal(confirmationStands(actsOf({ contentHashes: { [id]: u.locator.contentHash } }), W), false);
});
