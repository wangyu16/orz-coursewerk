// M4 change-classifier tests.
//
// The acceptance question behind every case: does the instructor get a flag ONLY when a
// human actually has to do something? The null-edit case is the headline (spec §1 goal:
// "null edit -> 0 flags"); the additive-vs-structural spine split is the second-order trap
// (spec §10 decision 3 — registering vocabulary must never RECHECK the package).
//
// These tests build fingerprints BY HAND on purpose: M4 must not depend on M3. Whether
// "may cause" -> "causes" moves the content layer is M3's contract to keep; here we simply
// hand the classifier a moved content layer and assert the verb.

import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../scripts/lib/classify.mjs";

/** A baseline fingerprint. Values are opaque hex strings — only equality matters. */
const base = () => ({
  format: "f0000000",
  label: "1a000000",
  content: "c0000000",
  spine: "5b000000",
  provenance: "b0000000",
});

/** Baseline with the named layers moved to a different hex value. */
const move = (...layers) => {
  const fp = base();
  for (const l of layers) fp[l] = fp[l].replace(/^(.)/, "9");
  return fp;
};

test("no layer moved -> NONE", () => {
  const r = classify(base(), base(), { authorized: false, spineChange: null });
  assert.equal(r.action, "NONE");
  assert.equal(r.layer, null);
});

test("null edit: only format moved -> NONE (0 flags)", () => {
  const r = classify(base(), move("format"), { authorized: false, spineChange: null });
  assert.equal(r.action, "NONE");
  assert.equal(r.layer, "format");
  assert.match(r.reason, /format/i);
});

test("only label moved -> RENAME", () => {
  const r = classify(base(), move("label"), { authorized: true, spineChange: null });
  assert.equal(r.action, "RENAME");
  assert.equal(r.layer, "label");
});

test("rename carries format noise: label + format -> still RENAME", () => {
  const r = classify(base(), move("label", "format"), { authorized: true, spineChange: null });
  assert.equal(r.action, "RENAME");
  assert.equal(r.layer, "label");
  assert.match(r.reason, /Also moved: format/);
});

test("content moved + authorized -> RE-DERIVE", () => {
  const r = classify(base(), move("content"), { authorized: true, spineChange: null });
  assert.equal(r.action, "RE-DERIVE");
  assert.equal(r.layer, "content");
});

test("content moved + NOT authorized (suspected error) -> ESCALATE", () => {
  const r = classify(base(), move("content"), { authorized: false, spineChange: null });
  assert.equal(r.action, "ESCALATE");
  assert.equal(r.layer, "content");
  assert.match(r.reason, /suspected error/i);
});

test("content moved with no ctx at all -> ESCALATE (fail toward review, never silence)", () => {
  assert.equal(classify(base(), move("content")).action, "ESCALATE");
  assert.equal(classify(base(), move("content"), {}).action, "ESCALATE");
});

test("hedge/modality case: content moved is the only signal M4 needs -> verb follows authorization", () => {
  // "may cause" -> "causes" is M3's job to surface as a content move; M4 just reads it.
  const hedge = classify(base(), move("content", "format"), { authorized: true, spineChange: null });
  assert.equal(hedge.action, "RE-DERIVE");
  assert.equal(hedge.layer, "content");
});

test("spine moved + structural -> RECHECK", () => {
  const r = classify(base(), move("spine"), { authorized: true, spineChange: "structural" });
  assert.equal(r.action, "RECHECK");
  assert.equal(r.layer, "spine");
  assert.match(r.reason, /coverage/i);
});

test("spine moved + depth change -> REGENERATE (depth cannot be patched)", () => {
  const r = classify(base(), move("spine"), { authorized: true, spineChange: "depth" });
  assert.equal(r.action, "REGENERATE");
  assert.equal(r.layer, "spine");
});

test("spine moved + additive -> NONE, registry-only (must NEVER cascade a RECHECK)", () => {
  const r = classify(base(), move("spine"), { authorized: true, spineChange: "additive" });
  assert.equal(r.action, "NONE");
  assert.equal(r.layer, "spine");
  assert.notEqual(r.action, "RECHECK");
  assert.match(r.reason, /registry/i);
});

test("additive spine + format noise -> still NONE", () => {
  const r = classify(base(), move("spine", "format"), { authorized: true, spineChange: "additive" });
  assert.equal(r.action, "NONE");
});

test("additive spine does not mask a real content move -> ESCALATE/RE-DERIVE on content", () => {
  const ctx = { authorized: false, spineChange: "additive" };
  const r = classify(base(), move("spine", "content"), ctx);
  assert.equal(r.action, "ESCALATE");
  assert.equal(r.layer, "content");
});

test("spine moved with unknown spineChange -> treated as structural (RECHECK)", () => {
  const r = classify(base(), move("spine"), { authorized: true, spineChange: null });
  assert.equal(r.action, "RECHECK");
  assert.match(r.reason, /structural/i);
});

test("provenance moved -> RECHECK + a STRUCTURED ESCALATE followUp (never prose to parse)", () => {
  const r = classify(base(), move("provenance"), { authorized: false, spineChange: null });
  assert.equal(r.action, "RECHECK");
  assert.equal(r.layer, "provenance");
  // The sequence from spec §5: RECHECK is mechanical, ESCALATE is the human decision.
  assert.ok(r.followUp, "followUp must be present on an unauthorized provenance move");
  assert.equal(r.followUp.action, "ESCALATE");
  assert.equal(typeof r.followUp.reason, "string");
  assert.ok(r.followUp.reason.length > 0);
  assert.match(r.followUp.reason, /adopt upstream/i);
  // M10 reads the field, never the prose.
  assert.deepEqual(Object.keys(r.followUp).sort(), ["action", "reason"]);
});

test("provenance moved on an authorized change -> RECHECK, followUp ABSENT (ask-once)", () => {
  const r = classify(base(), move("provenance"), { authorized: true, spineChange: null });
  assert.equal(r.action, "RECHECK");
  assert.equal(r.layer, "provenance");
  assert.equal(r.followUp, undefined);
  assert.ok(!("followUp" in r), "an already-settled override must not carry a second step at all");
  assert.match(r.reason, /not re-asked/i);
});

test("followUp is absent for every non-provenance verb", () => {
  const cases = [
    [move("format"), { authorized: false, spineChange: null }],
    [move("label"), { authorized: true, spineChange: null }],
    [move("content"), { authorized: true, spineChange: null }],
    [move("content"), { authorized: false, spineChange: null }],
    [move("spine"), { authorized: true, spineChange: "structural" }],
    [move("spine"), { authorized: true, spineChange: "depth" }],
    [move("spine"), { authorized: true, spineChange: "additive" }],
    [base(), { authorized: false, spineChange: null }],
    [move("label"), { authorized: true, spineChange: null, pedagogy: "deprecate-but-teach" }],
  ];
  for (const [newFp, ctx] of cases) {
    const r = classify(base(), newFp, ctx);
    assert.ok(!("followUp" in r), `unexpected followUp on ${r.action}/${r.layer}`);
  }
});

test("provenance loses precedence: a co-moving content change carries no followUp", () => {
  // The followUp belongs to the provenance SEQUENCE. When content wins the report the
  // escalation is the PRIMARY action, not a second step — never both.
  const r = classify(base(), move("content", "provenance"), { authorized: false, spineChange: null });
  assert.equal(r.action, "ESCALATE");
  assert.equal(r.layer, "content");
  assert.ok(!("followUp" in r));
});

test("pedagogy deprecate-but-teach on a label move -> ANNOTATE, never RENAME", () => {
  const r = classify(base(), move("label"), { authorized: true, spineChange: null, pedagogy: "deprecate-but-teach" });
  assert.equal(r.action, "ANNOTATE");
  assert.equal(r.layer, "label");
});

test("pedagogy deprecate-but-teach on a content move -> ANNOTATE, never replace", () => {
  const r = classify(base(), move("content"), { authorized: true, spineChange: null, pedagogy: "deprecate-but-teach" });
  assert.equal(r.action, "ANNOTATE");
});

test("pedagogy does not suppress a structural spine RECHECK (coverage still verified)", () => {
  const r = classify(base(), move("spine", "label"), {
    authorized: true,
    spineChange: "structural",
    pedagogy: "deprecate-but-teach",
  });
  assert.equal(r.action, "RECHECK");
  assert.equal(r.layer, "spine");
});

// --- multi-layer precedence: spine > content > provenance > label > format ---

test("precedence: every layer moved -> spine wins, the rest are named in reason", () => {
  const r = classify(base(), move("format", "label", "content", "spine", "provenance"), {
    authorized: true,
    spineChange: "structural",
  });
  assert.equal(r.action, "RECHECK");
  assert.equal(r.layer, "spine");
  for (const l of ["content", "provenance", "label", "format"]) assert.match(r.reason, new RegExp(l));
});

test("precedence: content beats provenance, label and format", () => {
  const r = classify(base(), move("content", "provenance", "label", "format"), {
    authorized: true,
    spineChange: null,
  });
  assert.equal(r.action, "RE-DERIVE");
  assert.equal(r.layer, "content");
  assert.match(r.reason, /Also moved: provenance, label, format/);
});

test("precedence: provenance beats label and format", () => {
  const r = classify(base(), move("provenance", "label", "format"), { authorized: false, spineChange: null });
  assert.equal(r.action, "RECHECK");
  assert.equal(r.layer, "provenance");
});

test("precedence: spine beats content even when content also moved", () => {
  const r = classify(base(), move("spine", "content"), { authorized: true, spineChange: "depth" });
  assert.equal(r.action, "REGENERATE");
  assert.equal(r.layer, "spine");
  assert.match(r.reason, /Also moved: content/);
});

// --- purity / determinism ---

test("deterministic: same input -> same output, repeatedly", () => {
  const oldFp = base();
  const newFp = move("content", "format");
  const ctx = { authorized: false, spineChange: null };
  const first = classify(oldFp, newFp, ctx);
  for (let i = 0; i < 25; i += 1) {
    assert.deepEqual(classify(oldFp, newFp, ctx), first);
  }
});

test("pure: does not mutate its arguments", () => {
  const oldFp = base();
  const newFp = move("spine", "content");
  const ctx = { authorized: true, spineChange: "structural" };
  const snapshot = JSON.stringify({ oldFp, newFp, ctx });
  classify(oldFp, newFp, ctx);
  assert.equal(JSON.stringify({ oldFp, newFp, ctx }), snapshot);
});

test("returns only frozen action verbs", () => {
  const VERBS = new Set(["NONE", "RENAME", "RE-DERIVE", "REGENERATE", "RECHECK", "ESCALATE", "ANNOTATE"]);
  const layers = ["format", "label", "content", "spine", "provenance"];
  const spineChanges = [null, "additive", "structural", "depth"];
  for (const l of layers) {
    for (const sc of spineChanges) {
      for (const authorized of [true, false]) {
        for (const pedagogy of [null, "deprecate-but-teach"]) {
          const r = classify(base(), move(l), { authorized, spineChange: sc, pedagogy });
          assert.ok(VERBS.has(r.action), `bad verb ${r.action}`);
          assert.equal(typeof r.reason, "string");
          assert.ok(r.reason.length > 0);
          if ("followUp" in r) {
            // A followUp is only ever a second step on an unauthorized provenance move,
            // and it is always a frozen verb + a reason — never a bare string.
            assert.equal(r.layer, "provenance");
            assert.equal(authorized, false);
            assert.ok(VERBS.has(r.followUp.action), `bad followUp verb ${r.followUp.action}`);
            assert.equal(typeof r.followUp.reason, "string");
          }
        }
      }
    }
  }
});
