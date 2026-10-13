// 3C RED TEAM, ROUND 7 — FACTS COMPARED IN ORDER: one root cause behind four findings, fixed at its cause (operator rules
// D46, D50) and probed here on the real course (tests/fixtures/c2-chemistry-v2 + c2-chemistry inputs) with NEW variants.
// Record of the round: the red team's REPORT.md (P11 study, redteam-r7/confidence).
//
// The cause — where the harness asked whether the instructor's text, or a text they confirmed, still says the same
// thing, it compared MULTISETS of fact tokens inside one diff block (factHash, seenKey, seenFacts): order, the pairing of
// a value with what it describes, and punctuation were lost. Now the instructor's registered text and the current text
// are compared as a whole, in reading order, on the reader view with sentence punctuation kept (rendered.mjs
// readingKey); a value changed or re-attached anywhere in their text is a changed fact (authorship.mjs
// factPairingChange); a confirmation is bound to the ordered reading (seenKey "o:").
//   R7-K01 (k4)  the corrected value sentence moved to the front of their paragraph ............ [req.instructor-text.order]
//   R7-K02 (k4)  two pressure ranges swapped between process stages ............................ [req.instructor-text.order]
//   R7-K03 (k1)  a confirmed sentence with its two values swapped stays evidenced ............... [req.confirmation.bound-text]
//   R7-K10 (k6)  a moved full stop re-attaches a condition, nothing raised (D50) ................ [req.instructor-text.order]
//   R7-K07 (k3)  typesetting their correct value (LaTeX, "−", ∆) reported as a changed fact ...... [req.instructor-text.order]
//   C4.17        a capital after a colon in the spine is light ................................... [req.coherence.light-spine]
//   variants     three values permuted, a clause moved between sentences, punctuation moved in a table cell, subjects
//                swapped, a sentence moved and nothing changed in it; and the D17/D43 controls: outside the instructor's
//                text, punctuation and reflow stay light (the meaning key, the spine's light test)
// Offline and deterministic: every verifier is a replayed test double.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { confirmUnits, confirmationStands, coreObligations, evidenceStands, indexAndStamp, instructorActsOf, linkUnits, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { beginSession, claimAuthorship } from "../scripts/lib/core/units_index.mjs";
import { factPairingChange, instructorTextChange, seenKey, seenKeyR6 } from "../scripts/lib/core/authorship.mjs";
import { classifyChapterChange } from "../scripts/lib/core/change.mjs";
import { lightKey, meaningKey, readingKey } from "../scripts/lib/core/rendered.mjs";
import { factHash } from "../scripts/lib/core/dependencies.mjs";
import { unitHash } from "../scripts/lib/core/segment.mjs";
import { runCheckpoint } from "../scripts/lib/skeleton/runner.mjs";
import { parseLog, readLogText } from "../scripts/lib/records/log.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const SG = "study-guide/le-chatelier.md";
const ANCHOR = "but it also slows the rate.";
const NEIGH = "u-study-guide-le-chatelier-changing-the-temperature-6";

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r7-order-"));
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
    ms8f: () => {
      const all = runCheckpoint({ root, checkpoint: "V8", profile: "public", inputsDir: inputs, registry: { schemaVersion: 1, __noStandard: true, modules: [{ name: "ms8-verdicts", version: "1.0.0", maturity: "stable", enabled: true }] } }).findings;
      assert.deepEqual(all.filter((f) => f.kind === "module-failed").map((f) => f.evidence?.what), [], "MS8 ran (a silent result must not be a module that never finished)");
      return all.filter((f) => f.module === "ms8-verdicts");
    },
    ms8(...ids) { return c.ms8f().filter((f) => !ids.length || (f.units || []).some((id) => ids.includes(id))).map((f) => `${f.kind}:${f.statusClass}`).sort(); },
    core: () => coreObligations(root, liveReader(root), "t"),
  };
  return c;
}
/** The instructor writes paragraphs after the anchor (outside any agent session) and claims them; linked like the neighbour. */
function instructorWrites(c, paragraphs) {
  const spine = c.unit(NEIGH).spineNodes;
  c.edit(SG, ANCHOR, `${ANCHOR}\n\n${paragraphs.join("\n\n")}`); indexAndStamp(c.root, c.r(), {});
  const ids = paragraphs.map((p) => c.find(p).id);
  claimAuthorship(c.root, { units: ids, instructorWords: "Those paragraphs are mine." }, I);
  linkUnits(c.root, c.r(), Object.fromEntries(ids.map((id) => [id, spine])), AGENT);
  return ids;
}
function agentWrites(c, paragraphs) {
  const spine = c.unit(NEIGH).spineNodes;
  c.asAgent(() => c.edit(SG, ANCHOR, `${ANCHOR}\n\n${paragraphs.join("\n\n")}`));
  const ids = paragraphs.map((p) => c.find(p).id);
  linkUnits(c.root, c.r(), Object.fromEntries(ids.map((id) => [id, spine])), AGENT);
  return ids;
}

const S1 = "Ammonia synthesis is the textbook case of an industrial equilibrium.";
const S2 = "For the Haber-Bosch reaction $\\ce{N2 + 3 H2 <=> 2 NH3}$, the enthalpy change is $\\Delta H = -75.0\\ \\text{kJ}$.";
const S2N = S2.replace("-75.0", "-92.2");
const PRESS = "In industrial ammonia plants the steam reforming steps operate at pressures of about 25 to 35 bar, while the ammonia synthesis loop operates at pressures of about 60 to 180 bar.";
const PRESS_SWAP = "In industrial ammonia plants the steam reforming steps operate at pressures of about 60 to 180 bar, while the ammonia synthesis loop operates at pressures of about 25 to 35 bar.";
const STOP = "Increasing the pressure shifts the equilibrium toward fewer moles of gas. When both sides have equal moles, it has no effect.";
const STOP_MOVED = "Increasing the pressure shifts the equilibrium toward fewer moles of gas when both sides have equal moles. It has no effect.";
const DH = "For the Haber-Bosch reaction the enthalpy change is ΔH = -92.2 kJ, so the synthesis is exothermic.";
const UNASKED = "instructor-edit-unasked:question", FACT = "instructor-fact-changed:obligation";

// ============================================ THE RULE, ON TEXTS ==================================================
test("[req.instructor-text.order] the instructor's text is compared as a whole in reading order: a moved and corrected value (R7-K01), swapped values (R7-K02) and a moved full stop (R7-K10) are changes; typesetting is not (R7-K07)", () => {
  // R7-K01: the corrected sentence moved before their first one — a changed fact, as in place
  for (const after of [`${S1} ${S2N}`, `${S2N} ${S1}`]) {
    const ch = instructorTextChange(`${S1} ${S2}`, after);
    assert.equal(ch.factChange, true, after);
    assert.deepEqual(ch.facts, { from: ["-75.0kJ"], to: ["-92.2kJ"] });
  }
  // a sentence of theirs moved, nothing in it changed: a change of meaning (their question), no changed fact
  const moved = instructorTextChange(`${S1} ${S2}`, `${S2} ${S1}`);
  assert.ok(moved, "a reorder of their sentences is raised");
  assert.equal(moved.factChange, false);
  // R7-K02: two ranges swapped between the stages they belong to — the same tokens, another pairing
  const sw = instructorTextChange(PRESS, PRESS_SWAP);
  assert.equal(sw.factChange, true);
  assert.equal(factHash(PRESS), factHash(PRESS_SWAP), "the order-free key could not see it");
  assert.equal(instructorTextChange(PRESS, PRESS.replace("60 to 180", "60 to 200")).factChange, true, "control: a value changed");
  // R7-K10 (D50): one full stop moved — the same words in the same order, another statement
  assert.equal(meaningKey(STOP), meaningKey(STOP_MOVED), "the meaning key could not see it");
  const st = instructorTextChange(STOP, STOP_MOVED);
  assert.ok(st && st.removed.length && st.added.length, "their question");
  // R7-K07: typesetting their correct value is no change at all
  for (const after of [DH.replace("ΔH = -92.2 kJ", "$\\Delta H = -92.2\\ \\text{kJ}$"), DH.replace("-92.2", "−92.2"), DH.replace("Δ", "∆"), DH.replace("ΔH = -92.2 kJ", "$\\Delta H = −92.2\\,\\mathrm{kJ}$"),
    DH.replace("Haber-Bosch reaction", "*Haber-Bosch* reaction").replace("is ΔH", "is\nΔH"), DH.replace("Haber-Bosch", "“Haber-Bosch”")])
    assert.equal(instructorTextChange(DH, after), null, after);
  // …while a typeset value that differs is still a changed fact
  assert.equal(instructorTextChange(DH, DH.replace("ΔH = -92.2 kJ", "$\\Delta H = -75.0\\ \\text{kJ}$")).factChange, true);
});

test("[req.instructor-text.order] variants: three values permuted, subjects swapped, a clause moved between sentences, punctuation moved in a table cell — and a rephrase that keeps every pairing is no changed fact", () => {
  const three = "Step A runs at 10 bar, step B runs at 20 bar, and step C runs at 30 bar.";
  assert.equal(instructorTextChange(three, "Step A runs at 20 bar, step B runs at 30 bar, and step C runs at 10 bar.").factChange, true, "three values permuted");
  const plain = "The reforming step runs at 30 bar. The synthesis loop runs at 200 bar.";
  assert.equal(instructorTextChange(plain, "The reforming step runs at 200 bar. The synthesis loop runs at 30 bar.").factChange, true, "values swapped across two sentences");
  assert.equal(instructorTextChange(plain, "The synthesis loop runs at 30 bar. The reforming step runs at 200 bar.").factChange, true, "subjects swapped, values in place");
  const names = "The Haber process runs at 200 bar, while the Ostwald process runs at 8 bar.";
  assert.equal(instructorTextChange(names, "The Ostwald process runs at 200 bar, while the Haber process runs at 8 bar.").factChange, true, "named subjects swapped");
  // a clause moved from one sentence to another: their question
  const clause = "Raising the temperature lowers K for an exothermic reaction. Adding a catalyst changes nothing at equilibrium.";
  assert.ok(instructorTextChange(clause, "Raising the temperature lowers K. Adding a catalyst changes nothing at equilibrium for an exothermic reaction."), "a clause moved between sentences is raised");
  // punctuation moved in a table cell
  const table = "| Change | Effect |\n|---|---|\n| Heating | Shifts left. Lowers K at 298 K |";
  assert.ok(instructorTextChange(table, table.replace("Shifts left. Lowers K", "Shifts left, lowers K")), "a full stop in a cell");
  assert.ok(instructorTextChange(table, table.replace("Shifts left. Lowers K at 298 K", "Shifts left lowers K. At 298 K")), "a full stop moved in a cell");
  assert.equal(instructorTextChange(table, table.replace("| Heating |", "|  Heating  |")), null, "cell padding is layout");
  // what keeps every pairing: a rephrase that reorders values of different kinds, or same-kind values with their words
  assert.equal(instructorTextChange("Ice melts at 0 °C at 1 atm.", "At 1 atm, ice melts at 0 °C.").factChange, false);
  assert.equal(instructorTextChange("The synthesis loop runs at 200 bar, while the reforming step runs at 30 bar.", "The reforming step runs at 30 bar, while the synthesis loop runs at 200 bar.").factChange, false);
  // the pairing rule on its own
  assert.equal(factPairingChange([PRESS], [PRESS]), null);
  assert.ok(factPairingChange([PRESS], [PRESS_SWAP]));
  // a paragraph of theirs split at a sentence end, or reflowed, reads the same
  assert.equal(instructorTextChange(`${S1} ${S2}`, `${S1}\n\n${S2}`), null);
  assert.equal(instructorTextChange(`${S1} ${S2}`, `${S1}\n${S2}`), null);
});

test("[req.instructor-text.order] [req.coherence.light-spine] D17/D43 stay elsewhere: outside the instructor's text, punctuation and reflow are light — the meaning key, the light key and the spine's light test do not read the reading", () => {
  const pairs = [[STOP, STOP_MOVED], ["a system at equilibrium disturbed by a change", "a system at equilibrium, disturbed by a change"], [`${S1} ${S2}`, `${S1}\n${S2}`]];
  for (const [a, b] of pairs) {
    assert.equal(meaningKey(a), meaningKey(b));
    assert.equal(lightKey(a), lightKey(b));
  }
  assert.notEqual(readingKey(STOP), readingKey(STOP_MOVED), "only the instructor-text comparison reads punctuation");
  const node = (text) => ({ nodes: [{ id: "n", kind: "concept", text, prereqs: [] }], entries: [] });
  const kind = (a, b) => classifyChapterChange(node(a), node(b), { beforeText: a, afterText: b }).kind;
  assert.equal(kind(STOP, STOP_MOVED), "light", "a moved full stop in the spine stays light (D43)");
  assert.equal(kind("a system at equilibrium disturbed by a change", "a system at equilibrium,\ndisturbed by a change"), "light");
  // C4.17: a capital letter after a colon is light (it opens a clause)
  const OBJ = "1. State Le Chatelier's principle: a system at equilibrium that is disturbed shifts";
  assert.equal(kind(OBJ, OBJ.replace("principle: a system", "principle: A system")), "light");
  assert.equal(kind(OBJ, OBJ.replace("principle: a system", "principle: The system")), "rephrasing", "control: another word is not light");
  assert.equal(kind("added at 1 atm, does not shift", "added at 2 atm, does not shift"), "substantive", "control: a value");
});

// ============================================ ON THE COURSE, THROUGH THE GATE'S MODULE ==============================
test("[req.instructor-text.order] R7-K01, R7-K02, R7-K10, R7-K07 on the course: a moved correction and a swap block; a moved full stop asks; typesetting stays silent", (t) => {
  const c = course(t);
  const [a, b, d, e] = instructorWrites(c, [`${S1} ${S2}`, PRESS, STOP, DH]);
  c.asAgent(() => {
    c.edit(SG, `${S1} ${S2}`, `${S2N} ${S1}`);
    c.edit(SG, PRESS, PRESS_SWAP);
    c.edit(SG, STOP, STOP_MOVED);
    c.edit(SG, DH, DH.replace("ΔH = -92.2 kJ", "$\\Delta H = -92.2\\ \\text{kJ}$"));
  });
  assert.deepEqual(c.ms8(c.find(`${S2N} ${S1}`).id, a), [UNASKED, FACT], "R7-K01");
  assert.deepEqual(c.ms8(c.find(PRESS_SWAP).id, b), [UNASKED, FACT], "R7-K02");
  assert.deepEqual(c.ms8(c.find(STOP_MOVED).id, d), [UNASKED], "R7-K10: their question");
  const typeset = c.find(DH.replace("ΔH = -92.2 kJ", "$\\Delta H = -92.2\\ \\text{kJ}$"));
  assert.deepEqual(c.ms8(typeset.id, e), [], "R7-K07: silent");
  assert.equal(typeset.origin.kind, "instructor-authored", "their credit stays (D33)");
});

// ============================================ A CONFIRMATION IS BOUND TO THE ORDERED READING ========================
test("[req.confirmation.bound-text] R7-K03: a confirmation does not carry to its values swapped or a full stop moved; a reflow keeps it; an R6 confirmation is migrated by its contentHash", (t) => {
  const c = course(t);
  const [id] = agentWrites(c, [PRESS]);
  confirmUnits(c.root, c.r(), [id], { what: "fact", instructorWords: "Yes, those pressures are right as written." }, I);
  const stands = (text) => { const all = c.units(); return evidenceStands(c.root, all.find((u) => u.text === text), all); };
  assert.ok(stands(PRESS));
  const rec = c.log().filter((l) => l.type === "confirmation").at(-1);
  assert.equal(rec.payload.seenKeys[id], seenKey(PRESS)); assert.match(rec.payload.seenKeys[id], /^o:/, "the ordered seen key is logged");
  // the keys: an order-free one could not see the swap
  assert.equal(seenKeyR6(PRESS_SWAP), seenKeyR6(PRESS));
  assert.notEqual(seenKey(PRESS_SWAP), seenKey(PRESS));
  assert.notEqual(seenKey(STOP_MOVED), seenKey(STOP), "D50: a moved full stop");
  assert.equal(seenKey(DH), seenKey(DH.replace("-92.2", "−92.2").replace("Δ", "∆")), "typesetting");
  // a reflow keeps it
  const R = PRESS.replace("bar, while", "bar,\nwhile");
  c.asAgent(() => c.edit(SG, PRESS, R));
  assert.ok(stands(R), "a reflow keeps the confirmation");
  // the swap voids it, and the instructor is asked once
  c.asAgent(() => c.edit(SG, R, PRESS_SWAP));
  assert.equal(factHash(PRESS_SWAP), factHash(PRESS));
  assert.equal(stands(PRESS_SWAP), false, "R7-K03");
  const owed = c.core().filter((f) => (f.units || []).includes(c.find(PRESS_SWAP).id)).map((f) => `${f.kind}:${f.statusClass}`).sort();
  assert.deepEqual(owed, ["confirmation-stale:question", "evidence-missing:obligation"]);

  // MIGRATION (the log without the confirmation above, plus one as R6 logged it): a confirmation logged in R6 (the
  // order-free seen key, with its contentHash) stands while the text is the text it was logged for (contentHash:
  // whitespace and emphasis aside) — unchanged under both keys — and is asked again otherwise
  const u = c.find(PRESS_SWAP);
  const r6 = (payload) => instructorActsOf([...c.log().filter((l) => l.type !== "confirmation"), { seq: 1e9, type: "confirmation", party: I, payload: { what: "fact", units: [id], factHashes: { [id]: factHash(u.text) }, seenKeys: { [id]: seenKeyR6(u.text) }, ...payload } }]);
  assert.ok(confirmationStands(r6({ contentHashes: { [id]: unitHash(u.text) } }), u), "the text it was logged for, unchanged: it stands");
  const reflowed = { ...u, text: u.text.replace("bar, while", "bar,\nwhile") };
  assert.ok(confirmationStands(r6({ contentHashes: { [id]: unitHash(u.text) } }), reflowed), "a reflow keeps the unit's contentHash: unchanged under both keys");
  const swappedBack = { ...u, text: PRESS };
  assert.equal(seenKeyR6(swappedBack.text), seenKeyR6(u.text)); assert.equal(factHash(swappedBack.text), factHash(u.text));
  assert.equal(confirmationStands(r6({ contentHashes: { [id]: unitHash(u.text) } }), swappedBack), false, "R7-K03 through the migration: the R6 key cannot see the swap, the contentHash does — asked again");
  assert.equal(confirmationStands(r6({}), u), false, "an R6 seen key alone binds no order: not counted");
});
