import test from "node:test";
import assert from "node:assert/strict";
import { unverifiableQuotations } from "../scripts/lib/immutable.mjs";

// The first SOURCE-BEARING fixture (research/g3-confidence-wiring-design.md §"Fixture gap"):
// a pinned automatic source + a deliverable carrying a verbatim, an edited, an external, and
// an elided quotation, so the quote-length-aware matcher and its fuzzy tolerance are measured
// on real inputs before the check is wired into check_oer. Chemistry corpus, per the
// controlled-course decision (Le Chatelier / chemical equilibrium).
const SOURCE = [
  "Chemical equilibrium is the state in which the forward and reverse reactions proceed at",
  "equal rates, so the concentrations of reactants and products remain constant over time.",
  "Le Chatelier's principle states that when a system at equilibrium is disturbed, the system",
  "shifts to counteract the imposed change and restore a new equilibrium.",
].join(" ");

test("VERBATIM quote from the pinned source → verified (no finding)", () => {
  const text = 'The text notes that "the forward and reverse reactions proceed at equal rates".';
  assert.deepEqual(unverifiableQuotations(text, SOURCE), []);
});

test("THE HEADLINE FAULT: a one-word-EDITED quote → unverifiable (exactly one finding)", () => {
  // "equal" → "unequal": the verbatim gate is blind to this (too short to mint a span), the
  // source-span-overlap signal was measured to false-alarm even on the CLEAN case, but the
  // quote-length matcher catches it because the substituted needle word matches no source word.
  const text = 'The text notes that "the forward and reverse reactions proceed at unequal rates".';
  const found = unverifiableQuotations(text, SOURCE);
  assert.equal(found.length, 1);
  assert.match(found[0].text, /unequal rates/);
});

test("EXTERNAL quote absent from the pinned corpus → unverifiable (one finding)", () => {
  // The external/attested-quote case the design still bounds at wiring time (bound #1/#2/#3):
  // here it correctly does not verify. In-gate this becomes severity `review`, not blocking.
  const text = 'A secondary work adds that "entropy always increases in an isolated system over time".';
  assert.equal(unverifiableQuotations(text, SOURCE).length, 1);
});

test("FUZZY TOLERANCE: an ELLIDED quote (…) that drops a source word → still verified", () => {
  // Source: "...counteract the imposed change AND restore a new equilibrium." The quote elides
  // "and" with an ellipsis. The tokenizer drops "…", so the quote's words appear in the source
  // as an in-order subsequence skipping one source word. Gap budget must tolerate this, or every
  // legitimately-elided quotation false-flags. This is the measurement that settles the knob.
  const text = 'As Le Chatelier put it, "the system shifts to counteract the imposed change … restore a new equilibrium".';
  assert.deepEqual(unverifiableQuotations(text, SOURCE), []);
});

test("SHORT emphasis/scare-quote (< MIN_QUOTE_WORDS) is not a reproduction → never flagged", () => {
  // A two-word emphasized term is not a claim of reproduced text; flagging it would be the
  // alarm-fatigue trap G1 already paid for. It is skipped, not asserted against the source.
  const text = 'The reaction reaches a "steady state" long before it stops.';
  assert.deepEqual(unverifiableQuotations(text, SOURCE), []);
});

test("BOUND #1: with no pinned source, nothing is flagged (off-corpus quotes are unfalsifiable)", () => {
  const text = 'It says "the forward and reverse reactions proceed at unequal rates".';
  assert.deepEqual(unverifiableQuotations(text, null), []);
  assert.deepEqual(unverifiableQuotations(text, ""), []);
});

test("a BLOCKQUOTE run is checked the same way (quote-kind region, marks stripped by tokenizer)", () => {
  const verbatim = ["> the forward and reverse reactions", "> proceed at equal rates"].join("\n");
  assert.deepEqual(unverifiableQuotations(verbatim, SOURCE), []);
  const edited = ["> the forward and reverse reactions", "> proceed at UNEQUAL rates"].join("\n");
  assert.equal(unverifiableQuotations(edited, SOURCE).length, 1);
});
