// 3C RED TEAM, ROUND 5 — TRUST: three root causes behind six findings, each fixed at its cause (operator rule D46) and
// probed here on the real course (tests/fixtures/c2-chemistry-v2 + c2-chemistry inputs) with NEW variants of each cause.
// Record of the round: the red team's REPORT.md files (P11 study, redteam-r5/{confidence,coherence}).
//
// Cause 1 — authorship was per unit id, and a split or a merge minted new ids with the agent's origin.
//   Fix: ownership follows the TEXT (core/authorship.mjs): a unit holding words the instructor wrote — its record, the
//   record of any unit whose text it holds (lineage, the retired register), or the log's confirmations naming either —
//   is the instructor's; every consumer asks that one rule, and the index mints the same credit into the new record.
//   R5-K09 (k4)  a split, then a one-source auto-correction of the instructor's number ............ [req.authorship.follows-text]
//   R5-K10 (k6)  a split, then the reviewer's suggestion written over the instructor's sentence ..... [req.authorship.follows-text]
//   variants     a merge, a move with a partial rewrite to another deliverable, a neighbour that absorbs the deleted
//                paragraph, a split and rewrite in ONE session, a write that drops the credit or the lineage, D35
//                acceptance / asked changes / kept claims answered before a split
//   R5-K11 (k5)  "applied" by a magic 8-character threshold: an accepted "kelvin" never settled ........ [req.knowledge.clarify]
// Cause 2 — an unbound setting switched the gate off (F2: "spine": 1 in metadata/coursewerk.json).
//   Fix: settings that change what is checked are bound to the log: spine (lowered/missing/unreadable → blocking
//   defect, v2 core runs anyway), a registry demotion of a standard module, the retrieval destinations, the digest
//   size ........................................................................................... [req.settings.bound]
// Cause 3 — scope and trust decided by a name or a self-written mark.
//   F3  a `carried` mark in the new record exempted the write from its evidence check ................ [req.records.carry-logged]
//   F4  a chapter's version carried deliverables by file name, never a declared handout ............. [req.version.scope-by-content]
//   variants  a correction's own `shown` flag hid it; the restated-objective check and MS7's value scope read the
//             chapter from a path segment
// Offline and deterministic: every blind review is a replayed test double.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader, manifestChapters } from "../scripts/lib/core/package_reader.mjs";
import { confirmUnits, coreObligations, indexAndStamp, linkUnits, loadUnits, openVersionCarrying, owedChanges, recheckShown } from "../scripts/lib/core/obligations.mjs";
import { beginSession, claimAuthorship, packageAncestry, readSidecar } from "../scripts/lib/core/units_index.mjs";
import { instructorAuthored, originIndex } from "../scripts/lib/core/authorship.mjs";
import { writeUnitRecords } from "../scripts/lib/core/unit_records.mjs";
import { parseSpine } from "../scripts/lib/core/spine.mjs";
import { restatedObjectiveFindings } from "../scripts/lib/core/core_checks.mjs";
import { buildDigest, answerDigest } from "../scripts/lib/core/digest.mjs";
import { unitInfoOf } from "../scripts/lib/core/workflow.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { runCheckpoint } from "../scripts/lib/skeleton/runner.mjs";
import { demoteModule } from "../scripts/lib/skeleton/promotion.mjs";
import { readRegistry, standardRegistry, writeRegistry } from "../scripts/lib/records/registry.mjs";
import { boundConfig, loggedDigestCap, readConfig, writeConfig } from "../scripts/lib/records/config.mjs";
import { appendLogRecord, parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { replayVerifier, settledBySuggestion, suggestionAt } from "../scripts/lib/verify/dispatch.mjs";
import { retrievalConfig } from "../scripts/lib/verify/retrieval.mjs";
import { applyCorrection, claimKey, correctionsToShow, settleKept, verifyKnowledge, verifySemi } from "../scripts/lib/verify/verdicts.mjs";
import { fsInputReader, pinnedTexts, syncReferenceRecord } from "../scripts/lib/verify/references.mjs";
import { pinDeclared as pinReference } from "./helpers/destinations.mjs";
import { unitClaims } from "../scripts/modules/ms7-consistency.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const SG = "study-guide/le-chatelier.md", CEQ = "study-guide/chemical-equilibrium.md";
const ANCHOR = "but it also slows the rate.";
const NEIGH = "u-study-guide-le-chatelier-changing-the-temperature-6";
const OPENSTAX_13_3 = "Most industrial production of ammonia uses the Haber-Bosch process based on the following equilibrium reaction:\n N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ \n The traits of this reaction present challenges to its use in an efficient industrial process. The equilibrium constant is relatively small ( K p on the order of 10 −5 at 25 °C), meaning very little ammonia is present in an equilibrium mixture. Also, the rate of this reaction is relatively slow at low temperatures.";
const PIN = { url: "https://openstax.org/books/chemistry-2e/pages/13-3-shifting-equilibria-le-chateliers-principle", title: "13.3 Shifting Equilibria", destination: "openstax.org/books/chemistry-2e", text: OPENSTAX_13_3 };
const QUOTES = ["Most industrial production of ammonia uses the Haber-Bosch process based on the following equilibrium reaction:", "N 2 ( g ) + 3 H 2 ( g ) ⇌ 2 NH 3 ( g ) Δ H = −92.2 kJ"];

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r5-trust-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  fs.cpSync(C2, root, { recursive: true }); fs.cpSync(INPUTS, inputs, { recursive: true });
  const c = {
    root, inputs, r: () => liveReader(root),
    units: () => loadUnits(root, liveReader(root)),
    unit: (id) => loadUnits(root, liveReader(root)).find((u) => u.id === id),
    find: (text) => loadUnits(root, liveReader(root)).find((u) => u.text === text),
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent(fn) { beginSession(root, liveReader(root), AGENT); fn(); indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    log: () => parseLog(readLogText(root)),
    ancestry: () => packageAncestry(root, liveReader(root)),
    mine: (u) => instructorAuthored(u, parseLog(readLogText(root)), packageAncestry(root, liveReader(root))),
    // MS8 alone, through the real runner (the gate's other modules and core are not what these probes read)
    ms8: (...ids) => runCheckpoint({ root, checkpoint: "V8", profile: "public", inputsDir: inputs, registry: { schemaVersion: 1, __noStandard: true, modules: [{ name: "ms8-verdicts", version: "1.0.0", maturity: "stable", enabled: true }] } })
      .findings.filter((f) => f.module === "ms8-verdicts" && (f.units || []).some((id) => ids.includes(id))).map((f) => f.kind).sort(),
  };
  return c;
}
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];
const review = (concerns) => replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns }));
const passagesOf = (pr) => pr.split("\nPASSAGES\n")[1].split("\n").map((l) => l.match(/^\[(\d+)\] (.*)$/)).filter(Boolean).map((m) => ({ n: Number(m[1]), text: m[2] }));
const claimCount = (pr) => pr.split("\nCLAIMS\n")[1].split("\n\nPASSAGES")[0].split("\n").filter((l) => /^\d+\. /.test(l)).length;
const semiReplay = (verdict) => replayVerifier((pr) => {
  const ps = passagesOf(pr), qs = QUOTES.map((q) => { const p = ps.find((x) => x.text.includes(q)); return p ? { passage: p.n, text: q } : null; }).filter(Boolean);
  return { nonce: nonceOf(pr), claims: Array.from({ length: claimCount(pr) }, (_, i) => ({ claim: i + 1, verdict, quotes: qs, note: "replayed" })) };
});

/** The instructor writes paragraphs after the anchor (outside any agent session) and claims them; linked like the neighbour. */
function instructorWrites(c, paragraphs) {
  const spine = c.unit(NEIGH).spineNodes;
  c.edit(SG, ANCHOR, `${ANCHOR}\n\n${paragraphs.join("\n\n")}`); indexAndStamp(c.root, c.r(), {});
  const ids = paragraphs.map((p) => c.find(p).id);
  claimAuthorship(c.root, { units: ids, instructorWords: "Those paragraphs are mine." }, I);
  linkUnits(c.root, c.r(), Object.fromEntries(ids.map((id) => [id, spine])), AGENT);
  return ids;
}
/** The agent adds its own paragraphs after `after` (default: the anchor), linked like the neighbour. */
function agentWrites(c, paragraphs, after = ANCHOR) {
  const spine = c.unit(NEIGH).spineNodes;
  c.asAgent(() => c.edit(SG, after, `${after}\n\n${paragraphs.join("\n\n")}`));
  const ids = paragraphs.map((p) => c.find(p).id);
  linkUnits(c.root, c.r(), Object.fromEntries(ids.map((id) => [id, spine])), AGENT);
  return ids;
}
async function contradictAndCorrect(c, id) {
  pinReference(c.root, c.inputs, PIN);
  const texts = pinnedTexts(fsInputReader(c.inputs));
  await verifySemi(c.root, c.r(), { texts, verifier: semiReplay("contradicted"), only: [id] });
  syncReferenceRecord(c.root, c.inputs);
  const plain = new Map([...texts].filter(([, v]) => v.ok).map(([k, v]) => [k, v.text]));
  return applyCorrection(c.root, c.r(), { unitId: id, plainTexts: plain, meta: texts }, AGENT);
}

// ============================================ CAUSE 1: WHOSE TEXT IT IS =========================================
const S1 = "Ammonia synthesis is the textbook case of an industrial equilibrium.";
const S2 = "For the Haber-Bosch reaction $\\ce{N2 + 3 H2 <=> 2 NH3}$, the enthalpy change is $\\Delta H = -75.0\\ \\text{kJ}$.";
const TWO_SOURCES = /instructor text: .* needs two agreeing sources/;

test("[req.authorship.follows-text] R5-K09: a split keeps the instructor's credit — the piece holding their number is corrected on one source no more than the whole paragraph was", async (t) => {
  // control: the unsplit paragraph is protected
  const k = course(t);
  const [P] = instructorWrites(k, [`${S1} ${S2}`]);
  const ctl = await contradictAndCorrect(k, P);
  assert.equal(ctl.applied, false); assert.match(ctl.question.reason, TWO_SOURCES);
  // the attack: one blank line between their sentences, in an agent session
  const c = course(t);
  const [Q] = instructorWrites(c, [`${S1} ${S2}`]);
  c.asAgent(() => c.edit(SG, `${S1} ${S2}`, `${S1}\n\n${S2}`));
  const piece = c.find(S2), other = c.find(S1);
  assert.ok(piece && other && piece.id !== Q, "split into new ids");
  assert.ok(piece.lineage.includes(Q), "the piece names the unit whose text it holds");
  assert.equal(piece.origin.kind, "instructor-authored", "the instructor's credit is minted into the piece's record");
  assert.equal(piece.origin.revisedBy?.at(-1)?.model, AGENT.model, "the agent's split is on record as a revision of their text");
  assert.equal(other.origin.kind, "instructor-authored");
  const fix = await contradictAndCorrect(c, piece.id);
  assert.equal(fix.applied, false, "no one-source correction of the instructor's number"); assert.match(fix.question.reason, TWO_SOURCES);
  assert.match(c.find(S2).text, /-75\.0/, "their text is untouched");
});

test("[req.authorship.follows-text] R5-K09 variants: a merge, a move to another deliverable with a partial rewrite, and a neighbour that absorbs the deleted paragraph all keep the instructor's credit", async (t) => {
  const A = "Industrial chemists balance yield against rate when they choose operating conditions for a synthesis.";
  // a merge of the agent's paragraph with the instructor's: the merged unit holds their words → their protection
  const m = course(t);
  agentWrites(m, [A]);
  instructorWrites(m, [S2]); // inserted right after the anchor: the instructor's S2 now precedes the agent's A
  m.asAgent(() => m.edit(SG, `${S2}\n\n${A}`, `${S2} ${A}`));
  const merged = m.find(`${S2} ${A}`);
  assert.ok(merged, "merged");
  assert.ok(m.mine(merged), "a merged unit holding the instructor's words is the instructor's");
  assert.equal(merged.origin.kind, "instructor-authored");
  const fix = await contradictAndCorrect(m, merged.id);
  assert.equal(fix.applied, false); assert.match(fix.question.reason, TWO_SOURCES);

  // a move to another deliverable, partly rewritten: still their words, still their credit
  const v = course(t);
  const [vid] = instructorWrites(v, [S2]);
  const MOVED = "For the Haber-Bosch reaction $\\ce{N2 + 3 H2 <=> 2 NH3}$, the standard enthalpy change is $\\Delta H = -75.0\\ \\text{kJ}$ per mole of reaction.";
  v.asAgent(() => { v.edit(SG, `\n\n${S2}`, ""); v.edit(CEQ, "{[\\ce{N2}]\\,[\\ce{H2}]^{3}}.$$", `{[\\ce{N2}]\\,[\\ce{H2}]^{3}}.$$\n\n${MOVED}`); });
  // (written below Solution 1's equation, it joins the worked solution: another form, the same words)
  const moved = v.units().find((u) => u.text.includes(MOVED));
  assert.ok(moved && moved.locator.deliverable === CEQ, "moved");
  assert.ok(moved.id === vid || moved.lineage?.includes(vid), `the moved text is, or names, their unit (${moved.id}, ${JSON.stringify(moved.lineage)})`);
  assert.equal(moved.origin.kind, "instructor-authored", "their credit moved with their words");
  assert.ok(v.mine(moved));

  // the instructor's paragraph deleted and its sentence written into the agent's neighbour (kept as a rewording)
  const n = course(t);
  const N = "Raising the temperature of an exothermic equilibrium favours the reactants and lowers the yield of product.";
  const [nid] = agentWrites(n, [N]);
  const P = "Industrial plants therefore run the ammonia synthesis near 450 degrees Celsius with an iron catalyst as a compromise.";
  const spine = n.unit(NEIGH).spineNodes;
  n.edit(SG, N, `${N}\n\n${P}`); indexAndStamp(n.root, n.r(), {});
  const p = n.find(P); claimAuthorship(n.root, { units: [p.id], instructorWords: "That one is mine." }, I);
  linkUnits(n.root, n.r(), { [p.id]: spine }, AGENT);
  n.asAgent(() => n.edit(SG, `${N}\n\n${P}`, `${N} ${P}`));
  const absorbed = n.find(`${N} ${P}`);
  assert.ok(absorbed, "absorbed");
  assert.ok(absorbed.id === nid || absorbed.id === p.id || absorbed.lineage?.includes(p.id), "the absorbing unit names the unit whose words it took in");
  assert.ok(n.mine(absorbed), "and holding the instructor's words, it is the instructor's");
});

test("[req.authorship.follows-text] the rule reads lineage, the retired register and the log — a record that lost the credit cannot lose it, and no write may take it", (t) => {
  // the rule itself, on records written before the fix: an agent-origin piece naming a confirmed unit
  const piece = { id: "u-new", origin: { kind: "agent-knowledge", model: "m", step: "s", date: "d" }, lineage: ["u-old"] };
  const confirmation = { type: "authorship-confirmation", party: I, payload: { units: ["u-old"], as: "instructor", instructorWords: "mine" } };
  assert.equal(instructorAuthored(piece, []), false);
  assert.equal(instructorAuthored(piece, [confirmation]), true, "the log's confirmation of the unit whose text it holds");
  assert.equal(instructorAuthored(piece, [], originIndex([{ units: [], retired: [{ id: "u-old", origin: { kind: "instructor-authored", instructor: I.name, date: "d" } }] }])), true, "the retired register's record of it");
  assert.equal(instructorAuthored(piece, [{ ...confirmation, party: AGENT }]), false, "only the instructor confirms authorship");
  // a write that takes the credit, or drops the lineage, is refused
  const c = course(t);
  const [Q] = instructorWrites(c, [`${S1} ${S2}`]);
  c.asAgent(() => c.edit(SG, `${S1} ${S2}`, `${S1}\n\n${S2}`));
  const id = c.find(S2).id;
  const strip = (fn) => { const side = readSidecar(c.root, SG); fn(side.units.find((u) => u.id === id)); return () => writeUnitRecords(c.root, [{ ...side, deliverable: SG }]); };
  assert.throws(strip((u) => { u.origin = { kind: "agent-knowledge", model: AGENT.model, step: "authoring", date: "2026-10-08" }; }), /instructor's credit/);
  assert.throws(strip((u) => { delete u.lineage; }), /lineage/);
  assert.ok(c.find(S2).lineage.includes(Q));
});

const T = "Changing the total pressure by compressing a gas-phase mixture shifts the equilibrium toward the side with fewer moles of gas.";
const W = "An inert gas added at constant volume shifts the equilibrium toward the side with fewer moles of gas.";
const SUG = "An inert gas added at constant volume leaves the equilibrium unchanged.";
const WRONG = { kind: "wrong", text: W, problem: "At constant volume an inert gas changes no partial pressure, so the equilibrium does not shift.", suggestion: SUG };

test("[req.authorship.follows-text] R5-K10: after a split, the reviewer's suggestion written over the instructor's sentence is their question and an unasked edit — as unsplit; in one session or two; and after a merge", async (t) => {
  const setup = async () => { const c = course(t); const [P] = instructorWrites(c, [`${T} ${W}`]); await verifyKnowledge(c.root, c.r(), { only: [P], verifier: review([WRONG]) }); return { c, P }; };
  // control: unsplit
  const k = await setup();
  assert.deepEqual(k.c.ms8(k.P), ["knowledge-concern"]);
  k.c.asAgent(() => k.c.edit(SG, W, SUG));
  assert.deepEqual(k.c.ms8(k.P), ["instructor-edit-unasked", "knowledge-concern"]);
  // the attack: split (one session), then the suggestion (another)
  const a = await setup();
  a.c.asAgent(() => a.c.edit(SG, `${T} ${W}`, `${T}\n\n${W}`));
  a.c.asAgent(() => a.c.edit(SG, W, SUG));
  const b = a.c.find(SUG), other = a.c.find(T);
  assert.equal(b.origin.kind, "instructor-authored");
  assert.deepEqual(a.c.ms8(b.id), ["instructor-edit-unasked", "knowledge-concern"], "the piece that took the suggestion: their question, and the edit raised");
  assert.deepEqual(a.c.ms8(other.id), [], "the other piece never held the words");
  // the split and the rewrite in ONE session
  const o = await setup();
  o.c.asAgent(() => o.c.edit(SG, `${T} ${W}`, `${T}\n\n${SUG}`));
  const ob = o.c.find(SUG);
  assert.ok(ob, "split and rewritten");
  assert.ok(o.c.mine(ob));
  assert.deepEqual(o.c.ms8(ob.id), ["instructor-edit-unasked", "knowledge-concern"]);
  // a merge with the agent's paragraph, then the suggestion
  const g = course(t);
  const A = "Industrial chemists balance yield against rate when they choose operating conditions for a synthesis.";
  agentWrites(g, [A]);
  const [GP] = instructorWrites(g, [W]);
  await verifyKnowledge(g.root, g.r(), { only: [GP], verifier: review([WRONG]) });
  g.asAgent(() => g.edit(SG, `${W}\n\n${A}`, `${W} ${A}`));
  g.asAgent(() => g.edit(SG, W, SUG));
  const gm = g.find(`${SUG} ${A}`);
  assert.ok(gm && g.mine(gm), "the merged unit holds their words");
  assert.deepEqual(g.ms8(gm.id), ["instructor-edit-unasked", "knowledge-concern"]);
  // control (R4-K17, held): the agent's OWN reviewed paragraph split, then fixed — settled, nothing raised
  const own = course(t);
  const [OP] = agentWrites(own, [`${T} ${W}`]);
  await verifyKnowledge(own.root, own.r(), { only: [OP], verifier: review([WRONG]) });
  own.asAgent(() => own.edit(SG, `${T} ${W}`, `${T}\n\n${W}`));
  own.asAgent(() => own.edit(SG, W, SUG));
  assert.deepEqual(own.ms8(own.find(SUG).id), []);
  // a carried "wrong" concern reworded away in the agent's piece (not the suggestion) stays open in that piece
  const syn = course(t);
  const [SP] = agentWrites(syn, [`${T} ${W}`]);
  await verifyKnowledge(syn.root, syn.r(), { only: [SP], verifier: review([WRONG]) });
  syn.asAgent(() => syn.edit(SG, `${T} ${W}`, `${T}\n\n${W}`));
  const REWORD = "An inert gas added at constant volume moves the equilibrium toward the side with fewer moles of gas.";
  syn.asAgent(() => syn.edit(SG, W, REWORD));
  assert.deepEqual(syn.ms8(syn.find(REWORD).id), ["knowledge-concern"], "a synonym swap in the piece settles nothing");
});

test("[req.authorship.follows-text] the instructor's answers follow their words through a split: an accepted clarification, an asked change, a kept claim", async (t) => {
  const CLARIFY = { kind: "clarify", text: "added at constant volume", problem: "Correct as meant; say the total volume is held fixed.", suggestion: "added at constant total volume" };
  const c = course(t);
  const [P] = instructorWrites(c, [`${T} ${W}`]);
  await verifyKnowledge(c.root, c.r(), { only: [P], verifier: review([CLARIFY]) });
  const g = runGate(c.root, { inputsDir: c.inputs });
  const d = buildDigest(c.root, g.findings, unitInfoOf(c.root, c.r()), { cap: 1000 });
  const e = d.entries.find((x) => x.kind === "clarification-proposed" && x.units.includes(P));
  assert.ok(e, "proposed to the instructor");
  answerDigest(c.root, d, { answers: { [e.key]: "apply" }, instructorWords: "Yes, apply that.", reader: c.r() }, I);
  assert.deepEqual(c.ms8(P), ["clarification-accepted"]);
  c.asAgent(() => c.edit(SG, `${T} ${W}`, `${T}\n\n${W}`));
  const piece = c.find(W);
  assert.deepEqual(c.ms8(piece.id), ["clarification-accepted"], "their acceptance follows the words to the piece");
  c.asAgent(() => c.edit(SG, W, W.replace("added at constant volume", "added at constant total volume")));
  assert.deepEqual(c.ms8(c.find(W.replace("added at constant volume", "added at constant total volume")).id), [], "applied as accepted: settled, no unasked edit");
  // an asked change and a kept claim, asked of the unit before it was split, are read through its pieces' lineage
  const acts = { changes: new Map([["u-old", new Map([["The yield is 15 percent.", { choice: "change it to 17 percent", claimKey: "k" }]])]]) };
  assert.equal(owedChanges({ id: "u-piece", lineage: ["u-old"], text: "The yield is 15 percent." }, acts).length, 1, "the change they asked for is still owed in the piece");
  assert.equal(owedChanges({ id: "u-piece", lineage: [], text: "The yield is 15 percent." }, acts).length, 0);
  const claims = [{ index: 1, text: "The yield is 15 percent." }], conflicts = [{ claimed: "15 percent", source: "17 percent" }];
  const adm = { status: "disputed", perClaim: [{ claim: 1, status: "disputed", conflicts }] };
  const kept = new Set([claimKey("u-old", claims[0].text, conflicts)]);
  assert.equal(settleKept(adm, ["u-piece", "u-old"], claims, kept).status, "admitted", "their 'keep' answers the same claim in the piece");
  assert.equal(settleKept(adm, "u-piece", claims, kept).status, "disputed");
});

test("[req.knowledge.clarify] R5-K11: an accepted clarification is applied when its suggestion stands where the quoted words stood — at any length ('thermodynamic' → 'kelvin')", async (t) => {
  // the unit test of the location rule
  const P = "where $R$ is the molar gas constant and $T$ the absolute (thermodynamic) temperature. A large K means products dominate.";
  const C = { text: "thermodynamic", suggestion: "kelvin" };
  assert.equal(suggestionAt(C, P, P.replace("thermodynamic", "kelvin")), true, "applied, six characters");
  assert.equal(suggestionAt(C, P, P), false, "not applied");
  assert.equal(suggestionAt(C, P, P.replace("A large K", "A kelvin-scale K")), false, "the suggestion elsewhere, the quote still in place: not applied");
  assert.equal(suggestionAt(C, P, P.replace("(thermodynamic) temperature", "(kelvin) scale")), false, "the neighbours changed too: not this suggestion");
  assert.equal(suggestionAt({ text: "A large K", suggestion: "K" }, P, "K means products dominate."), true, "a piece that begins at the suggestion");
  assert.equal(settledBySuggestion({ text: "thermodynamic", suggestion: "kelvin" }, P, P.replace("thermodynamic", "kelvin")), true, "a short 'wrong' suggestion settles exactly too");
  assert.equal(settledBySuggestion({ text: "thermodynamic", suggestion: "" }, P, P.replace("thermodynamic", "")), false, "no suggestion settles nothing");
  // the finding, on the instructor's own paragraph of the real course
  const c = course(t);
  const REL = CEQ, ID = "u-study-guide-chemical-equilibrium-equilibrium-and-gibbs-energy-3";
  // the instructor's own edit of the paragraph (as on the red team's course), accepted as theirs
  c.edit(REL, "the gas constant and $T$ the absolute temperature", "the molar gas constant and $T$ the absolute (thermodynamic) temperature"); indexAndStamp(c.root, c.r(), {});
  claimAuthorship(c.root, { units: [ID], instructorWords: "The gas-constant sentence is my own edit." }, I);
  assert.ok(c.mine(c.unit(ID)), "the instructor's text");
  await verifyKnowledge(c.root, c.r(), { only: [ID], verifier: review([{ kind: "clarify", text: "thermodynamic", problem: "Say the temperature is in kelvin.", suggestion: "kelvin" }]) });
  const g = runGate(c.root, { inputsDir: c.inputs });
  const d = buildDigest(c.root, g.findings, unitInfoOf(c.root, c.r()), { cap: 1000 });
  const e = d.entries.find((x) => x.kind === "clarification-proposed" && x.units.includes(ID));
  assert.ok(e);
  answerDigest(c.root, d, { answers: { [e.key]: "apply" }, instructorWords: "Yes, apply that.", reader: c.r() }, I);
  assert.deepEqual(c.ms8(ID), ["clarification-accepted"]);
  c.asAgent(() => c.edit(REL, "thermodynamic", "kelvin"));
  assert.deepEqual(c.ms8(ID), [], "applied exactly as accepted: settled");
});

// ============================================ CAUSE 2: BOUND SETTINGS ===========================================
test("[req.settings.bound] F2: a lowered, deleted or unreadable spine setting is a blocking defect once the log shows v2 in force, and the core checks still run", (t) => {
  const c = course(t);
  const cfg = path.join(c.root, "metadata/coursewerk.json");
  const A6 = "u-practice-le-chatelier-questions-12";
  c.asAgent(() => c.edit("practice/le-chatelier.md", "is exothermic. The temperature is raised. Which way", "is exothermic. The temperature is lowered. Which way"));
  assert.ok(coreObligations(c.root, c.r(), "t").some((f) => f.kind === "reverify" && f.units.includes(A6)), "Answer 6 owes a re-check");
  writeConfig(c.root, { ...readConfig(c.root), spine: 1 });
  assert.equal(boundConfig(c.root).spine, 2); assert.match(boundConfig(c.root).problems[0], /shows spine v2 in force/);
  const g = runGate(c.root, { inputsDir: c.inputs });
  assert.equal(g.gate.canPublish, false);
  assert.ok(g.gate.blocking.some((f) => f.kind === "setting-lowered"), "the lowered setting blocks");
  assert.ok(g.findings.some((f) => f.kind === "reverify" && f.units.includes(A6)), "and the core still sees the owed re-check");
  fs.rmSync(cfg);
  assert.equal(boundConfig(c.root).spine, 2); assert.match(boundConfig(c.root).problems[0], /missing/);
  fs.writeFileSync(cfg, "{ not json");
  assert.equal(boundConfig(c.root).spine, 2); assert.match(boundConfig(c.root).problems[0], /cannot be read/);
  // a genuine v0.12 package (no v2 record in its log) still reads as one, and an unreadable file there still fails loud
  fs.rmSync(path.join(c.root, "metadata/LOG.jsonl"));
  assert.throws(() => boundConfig(c.root), /requires schemaVersion 1|JSON/);
  fs.writeFileSync(cfg, JSON.stringify({ schemaVersion: 1, spine: 1 }));
  assert.deepEqual(boundConfig(c.root), { config: { schemaVersion: 1, spine: 1 }, spine: 1, problems: [] });
});

test("[req.settings.bound] other settings that weaken checking or reach the instructor are bound too: a registry demotion, retrieval destinations, the digest size", (t) => {
  const c = course(t);
  // a package registry that lists a standard module below its standard maturity: a defect, and it runs at standard
  const reg = standardRegistry();
  reg.modules = reg.modules.map((m) => (m.name === "ms8-verdicts" ? { ...m, maturity: "trial" } : m));
  writeRegistry(c.root, reg);
  const run = () => runCheckpoint({ root: c.root, checkpoint: "V3", profile: "public", registry: readRegistry(c.root), inputsDir: c.inputs });
  const r1 = run();
  assert.ok(r1.findings.some((f) => f.kind === "unlogged-demotion" && f.statusClass === "defect" && f.evidence.module === "ms8-verdicts"));
  assert.equal(r1.wiring.ran.find((x) => x.name === "ms8-verdicts").maturity, "stable", "it runs at its standard maturity");
  demoteModule(c.root, { name: "ms8-verdicts", to: "trial", reason: "We are re-tuning the verdict path this term." }, I);
  const r2 = run();
  assert.ok(!r2.findings.some((f) => f.kind === "unlogged-demotion"), "the instructor's logged demotion is honoured");
  assert.equal(r2.wiring.ran.find((x) => x.name === "ms8-verdicts").maturity, "trial");
  assert.throws(() => demoteModule(c.root, { name: "ms8-verdicts", to: "trial", reason: "x" }, AGENT), /instructor's decision/);
  // retrieval destinations written into the file declare nothing
  writeConfig(c.root, { ...readConfig(c.root), retrieval: { destinations: ["agent-owned.example.org"] } });
  assert.deepEqual(retrievalConfig(c.root), { enabled: false, destinations: [] });
  // the digest size: the instructor's logged act, never the file's value
  writeConfig(c.root, { ...readConfig(c.root), digestCap: 1 });
  assert.equal(loggedDigestCap(readLogText(c.root)), null);
  appendLogRecord(c.root, { type: "steering", party: I, payload: { event: "digest-cap", cap: 4, instructorWords: "Four at a time." } });
  assert.equal(loggedDigestCap(readLogText(c.root)), 4);
});

// ============================================ CAUSE 3: SCOPE AND TRUST BY CONTENT AND LOG ========================
test("[req.records.carry-logged] F3: a carry counts only through the instructor's logged carry of the unit; a real carry keeps what was owed, so its re-check is shown what moved", (t) => {
  const c = course(t);
  const at = (start) => c.units().find((u) => u.locator.deliverable === SG && u.text.startsWith(start));
  const EQ = at("$$\\ce{N2(g) + 3 H2(g) <=> 2 NH3(g)} \\qquad \\Delta H").id;
  c.asAgent(() => c.edit(SG, "\\qquad \\Delta H = -92\\ \\text{kJ mol}^{-1}$$", "\\qquad \\Delta H = -92.4\\ \\text{kJ mol}^{-1}$$"));
  confirmUnits(c.root, c.r(), [EQ], { what: "fact", instructorWords: "Use -92.4 kJ/mol, the value in our textbook." }, I);
  const owed = [...new Set(coreObligations(c.root, c.r(), "t").filter((f) => f.kind === "reverify").flatMap((f) => f.units))];
  assert.ok(owed.length >= 2, "the units stating the old value owe a re-check");
  // the forged carry: owes and stamp dropped, a carried mark set, no version opened
  const side = readSidecar(c.root, SG);
  for (const u of side.units) if (owed.includes(u.id)) { delete u.owes; delete u.stamp; u.carried = { scope: "chapter:le-chatelier", version: 2 }; }
  assert.throws(() => writeUnitRecords(c.root, [{ ...side, deliverable: SG }]), /no logged version carry names it/);
  const ids = owed.filter((id) => c.unit(id).locator.deliverable === SG);
  // the real carry: the instructor opens version 2; what each unit owed is kept, and its re-check must show -92.4
  openVersionCarrying(c.root, c.r(), { scopes: ["chapter:le-chatelier"], reason: "objective 3 split", instructorWords: "Open version 2 of chapter 2." }, I);
  const shown = recheckShown(c.root, c.r());
  for (const id of ids) {
    assert.ok(c.unit(id).carried, `${id} carried`);
    assert.ok((shown.get(id) || []).some((m) => /-92\.4/.test(m.text)), `${id}: its re-check is shown the moved value`);
  }
});

test("[req.version.scope-by-content] F4: a chapter's new version carries what teaches the chapter — a declared handout linked to it, a document that declares it, an unlinked declared document (fail-safe), a unit elsewhere linked to it — never by file name", (t) => {
  const c = course(t);
  const spine = parseSpine(c.r(), manifestChapters(c.r()));
  const lcObj = spine.chapters["le-chatelier"].map.nodes.find((n) => n.kind === "objective").id;
  const ceObj = spine.chapters["chemical-equilibrium"].map.nodes.find((n) => n.kind === "objective").id;
  const doc = (text) => `{{nyml\nkind: document\n}}\n\n# A handout\n\n## Part\n\n${text}\n`;
  const H = {
    linked: ["current/fall-2026/le-chatelier-handout.md", "A catalyst speeds up the forward and reverse reactions equally, so the position of the equilibrium does not change."],
    declared: ["current/fall-2026/week-9.md", "Heat acts as a product of an exothermic reaction when we predict the direction of a shift."],
    unlinked: ["current/fall-2026/reading-notes.md", "Read the section on industrial equilibria before the next class meeting and bring questions."],
    other: ["current/fall-2026/equilibrium-constants.md", "The equilibrium constant of a reaction is the ratio of product to reactant activities at equilibrium."],
  };
  c.asAgent(() => {
    for (const [rel, text] of Object.values(H)) { fs.mkdirSync(path.join(c.root, path.dirname(rel)), { recursive: true }); fs.writeFileSync(path.join(c.root, rel), doc(text)); }
    fs.writeFileSync(path.join(c.root, "metadata/DOCUMENTS.json"), JSON.stringify({ schemaVersion: 1, documents: [
      { id: "h1", title: "Handout", source: H.linked[0], carrier: "paged" },
      { id: "h2", title: "Week 9", source: H.declared[0], carrier: "paged", chapter: "le-chatelier" },
      { id: "h3", title: "Reading notes", source: H.unlinked[0], carrier: "paged" },
      { id: "h4", title: "Constants", source: H.other[0], carrier: "paged" },
    ] }, null, 2) + "\n");
  });
  const idOf = (k) => c.find(H[k][1]).id;
  // a unit of the OTHER chapter's practice set linked to a le-chatelier objective serves this chapter too
  const ceq = c.units().find((u) => u.locator.deliverable === "practice/chemical-equilibrium.md" && u.form === "question");
  linkUnits(c.root, c.r(), { [idOf("linked")]: [lcObj], [idOf("declared")]: [ceObj], [idOf("other")]: [ceObj], [ceq.id]: [...ceq.spineNodes, lcObj] }, AGENT);
  openVersionCarrying(c.root, c.r(), { scopes: ["chapter:le-chatelier"], reason: "objective 3 split", instructorWords: "Open version 2." }, I);
  const carried = new Set(c.units().filter((u) => u.carried).map((u) => u.id));
  assert.ok(carried.has(idOf("linked")), "the handout linked to the chapter, whatever its file name");
  assert.ok(carried.has(idOf("declared")), "a document that declares the chapter");
  assert.ok(carried.has(idOf("unlinked")), "fail-safe: a declared document's unit linked to no chapter");
  assert.ok(carried.has(ceq.id), "a unit elsewhere linked to the chapter");
  assert.ok(!carried.has(idOf("other")), "a document serving only the other chapter is not this chapter's");
  assert.ok(c.units().filter((u) => u.locator.deliverable === SG).every((u) => carried.has(u.id)), "every unit of the chapter's own files");
});

test("[req.records.carry-logged] other self-written marks: a correction's own `shown` flag does not hide it; the chapter of a handout's restated objectives and of its values is read from what it declares and links, not a path segment", (t) => {
  const c = course(t);
  // a correction record marked shown by its own field, never logged as shown: still shown
  fs.mkdirSync(path.join(c.root, "metadata/corrections"), { recursive: true });
  fs.writeFileSync(path.join(c.root, "metadata/corrections/c-forged.json"), JSON.stringify({ schemaVersion: 1, id: "c-forged", unit: "u-x", deliverable: SG, status: "applied", before: { text: "a" }, after: { text: "b" }, evidence: { quotes: [] }, shown: true }));
  assert.ok(correctionsToShow(c.root).some((x) => x.id === "c-forged"), "its own `shown: true` hides nothing");
  correctionsToShow(c.root, { mark: true });
  assert.ok(!correctionsToShow(c.root).some((x) => x.id === "c-forged"), "a logged showing does");
  // a declared handout restating an objective that is no approved objective of any chapter
  const H = "current/fall-2026/le-chatelier-handout.md";
  fs.mkdirSync(path.join(c.root, path.dirname(H)), { recursive: true });
  fs.writeFileSync(path.join(c.root, H), "{{nyml\nkind: document\n}}\n\n# Handout\n\n## Learning objectives\n\n- Memorise the value of every equilibrium constant.\n\n## Part\n\nA catalyst speeds up the forward and reverse reactions equally.\n");
  fs.writeFileSync(path.join(c.root, "metadata/DOCUMENTS.json"), JSON.stringify({ schemaVersion: 1, documents: [{ id: "h", title: "Handout", source: H, carrier: "paged" }] }));
  assert.ok(restatedObjectiveFindings(c.r(), "b").some((f) => f.kind === "objective-restated-differently" && f.evidence.file === H), "the handout's restated objectives are checked");
  // MS7 reads a handout's values in the chapter its units link to, never in a chapter named by a path segment
  const sideOf = (units) => ({ deliverable: H, units });
  const snap = { paths: ["metadata/units/x.json"], json: () => sideOf([{ id: "u-h-1", locator: { lines: [1, 1], section: "part" }, form: "paragraph", spineNodes: ["objective.le-chatelier.x"] }, { id: "u-h-2", locator: { lines: [1, 1], section: "part" }, form: "paragraph", spineNodes: [] }]), text: () => "x" };
  const claims = unitClaims(snap);
  assert.deepEqual(claims.map((x) => x.scope), ["le-chatelier", null]);
});
