// Key-fact review BINDINGS — what the staleness gate actually promises.
//
// WHY THIS FILE EXISTS. The bindings check was suspected of being a measurement artifact: the
// theory was that a reviewer who FINDS AND FIXES problems edits deliverables, moves
// `deliverableTreeSha256`, and thereby invalidates the very review it just recorded — so a mode
// that fixes MORE would self-invalidate MORE, and score worse for doing more work.
//
// The investigation refuted the mechanism and left the gate standing, so these tests pin the gate
// AGAINST relaxation rather than relaxing it. Three properties carry that argument:
//
//   1. DRIFT IS DETECTED PER BOUND RECORD (`each bound record ...`). A review certifies the bytes
//      it read. Seven records are bound; all seven must be live. This is the property a future
//      "tidy-up" would silently drop one of.
//   2. THE GATE HAS A REFRESH PATH (`re-binding ...`). This is the load-bearing refutation. The
//      review is NOT trapped: `makeKeyFactBindings` re-run after the fixes returns the package to
//      ready. `scripts/bind_key_fact_review.mjs` is that path in production, and it is the exact
//      analogue of `recordAcceptedCoherence` in coherence.mjs. The suspected asymmetry between the
//      two gates does not exist, so "the reviewer had no way to record the new state" is false.
//   3. THE REVIEW DOES NOT BIND ITSELF (`the review's own content ...`). KEY_FACT_REVIEW.json is
//      absent from its own bindings, so writing the review cannot invalidate the review. Without
//      this there would be no fixed point and the gate WOULD be unsatisfiable-by-construction —
//      which is precisely the defect it was accused of. Pinned because it is load-bearing and
//      invisible: it holds today only because `makeKeyFactBindings` happens not to hash the file.
//
// The residual failure mode is therefore ORDERING, not the gate: fix, THEN bind. A harness that
// binds before its last edit produces a stale binding and a failure that is CORRECT — the review
// genuinely did not read those bytes. Ordering lives in PROCEDURE.md, not in this module.
//
// House rules: pure, deterministic, no network/clock/randomness, no new dependencies. Fixtures are
// built under os.tmpdir() with mkdtempSync and removed after; tests/fixtures/ is never touched.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditKeyFactReview, makeKeyFactBindings } from "../scripts/lib/key_fact_review.mjs";
import { blindBundleDigest } from "../scripts/lib/blind_bundle.mjs";

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
};
const REVIEW_FILE = ["private", "coursewerk", "KEY_FACT_REVIEW.json"];
const staleness = (audit) => audit.failures.filter((failure) => /bindings are stale/.test(failure));

/** A minimal package that PASSES the whole key-fact gate, so any later failure is the edit's doing. */
function fixture(temp) {
  const root = fs.mkdtempSync(path.join(temp, "key-fact-bindings-"));
  const foundation = { schemaVersion: 1, sources: [{ id: "source-1" }] };
  writeJson(path.join(root, "alembic.json"), { schemaVersion: 2, license: "CC-BY-4.0", chapters: [{ slug: "one", title: "One" }] });
  fs.writeFileSync(path.join(root, "LICENSE"), "fixture license\n");
  writeJson(path.join(root, "private", "coursewerk", "FOUNDATION.json"), foundation);
  writeJson(path.join(root, "private", "coursewerk", "PROVENANCE.json"), { schemaVersion: 1, items: [] });
  (fs.mkdirSync(path.dirname(path.join(root, "provenance", "coursewerk", "ATTRIBUTION.md")), { recursive: true }), fs.writeFileSync)(path.join(root, "provenance", "coursewerk", "ATTRIBUTION.md"), "# Attribution\n");
  writeJson(path.join(root, "private", "coursewerk", "SOURCE_RECORD.json"), { schemaVersion: 1, sources: [] });
  fs.mkdirSync(path.join(root, "study-guide"), { recursive: true });
  fs.writeFileSync(path.join(root, "study-guide", "one.md"), "# One\n\nEvidence-based teaching content.\n");
  const review = {
    schemaVersion: 1,
    mode: "light",
    reviewKind: "same-model-independent-pass",
    authoringSystem: "fixture model",
    authoringModelId: "fixture-model-v1",
    reviewer: { type: "ai", name: "fixture model", modelId: "fixture-model-v1" },
    independence: { separatePass: true, contextReset: true, bundleSha256: blindBundleDigest(root), approach: "A fresh context reviewed the completed materials independently after drafting ended." },
    reviewedAt: "2026-07-14",
    bindings: makeKeyFactBindings(root),
    checks: ["accountable-identity", "source-identity-version", "source-license-evidence", "external-media-rights", "output-license-compatibility", "attribution-obligations", "scientific-key-facts"]
      .map((id) => ({ id, status: "passed", note: `The separate pass reviewed ${id} against the current bound records and teaching materials.` })),
    keyFacts: [{ id: "fact-one", claim: "Representative claim.", status: "verified", evidenceSourceIds: ["source-1"], usedIn: ["study-guide/one.md"], note: "The claim was traced independently to source-1 and checked in the chapter study guide." }],
  };
  writeJson(path.join(root, ...REVIEW_FILE), review);
  return { root, foundation, review };
}

/** Re-run the binding step against the package as it now stands — what bind_key_fact_review.mjs does. */
function rebind(fixtureUnderTest) {
  fixtureUnderTest.review.bindings = makeKeyFactBindings(fixtureUnderTest.root);
  // The reviewer re-judges the RE-ASSEMBLED bundle after the fix and records its digest — the
  // refresh path is "re-assemble, re-review, re-bind", never "re-bind alone".
  fixtureUnderTest.review.independence.bundleSha256 = blindBundleDigest(fixtureUnderTest.root);
  writeJson(path.join(fixtureUnderTest.root, ...REVIEW_FILE), fixtureUnderTest.review);
}

// Every bound record, with an edit that a real review-driven fix would plausibly make to it. A
// binding that stops tracking its record fails here and nowhere else in the suite.
const BOUND_RECORDS = [
  { binding: "manifestSha256", edit: (root) => writeJson(path.join(root, "alembic.json"), { schemaVersion: 2, license: "CC-BY-SA-4.0", chapters: [{ slug: "one", title: "One" }] }) },
  { binding: "licenseSha256", edit: (root) => fs.writeFileSync(path.join(root, "LICENSE"), "a different license text\n") },
  { binding: "foundationSha256", edit: (root) => writeJson(path.join(root, "private", "coursewerk", "FOUNDATION.json"), { schemaVersion: 1, sources: [{ id: "source-1" }, { id: "source-2" }] }) },
  { binding: "provenanceSha256", edit: (root) => writeJson(path.join(root, "private", "coursewerk", "PROVENANCE.json"), { schemaVersion: 1, items: [{ id: "item-1" }] }) },
  { binding: "attributionSha256", edit: (root) => (fs.mkdirSync(path.dirname(path.join(root, "provenance", "coursewerk", "ATTRIBUTION.md")), { recursive: true }), fs.writeFileSync)(path.join(root, "provenance", "coursewerk", "ATTRIBUTION.md"), "# Attribution\n\nAdded a required credit line.\n") },
  { binding: "sourceRecordSha256", edit: (root) => writeJson(path.join(root, "private", "coursewerk", "SOURCE_RECORD.json"), { schemaVersion: 1, sources: [{ id: "source-1", revision: "2026-07-15" }] }) },
  { binding: "deliverableTreeSha256", edit: (root) => fs.writeFileSync(path.join(root, "study-guide", "one.md"), "# One\n\nA reviewer corrected this teaching content.\n") },
];

test("each bound record is drift-detected, and an untouched package is not accused of drift", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "key-fact-bindings-suite-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));

  // The negative that makes every positive below mean something: no edit, no staleness failure.
  const clean = fixture(temp);
  const cleanAudit = auditKeyFactReview(clean.root, clean.foundation);
  assert.equal(cleanAudit.ready, true, `an unedited package must pass: ${cleanAudit.failures.join("; ")}`);
  assert.deepEqual(staleness(cleanAudit), []);

  for (const { binding, edit } of BOUND_RECORDS) {
    const f = fixture(temp);
    const before = makeKeyFactBindings(f.root);
    edit(f.root);
    const after = makeKeyFactBindings(f.root);

    // The binding tracks its record: exactly this one moved, and no other did.
    assert.notEqual(after[binding], before[binding], `${binding} must move when its bound record changes`);
    for (const other of Object.keys(before))
      if (other !== binding) assert.equal(after[other], before[other], `${other} must not move when only ${binding}'s record changes`);

    // ...and the gate acts on it.
    assert.equal(auditKeyFactReview(f.root, f.foundation).ready, false, `${binding}: drift must fail the gate`);
    assert.equal(staleness(auditKeyFactReview(f.root, f.foundation)).length, 1, `${binding}: drift must be reported as staleness`);
  }
});

test("re-binding after a review-driven fix restores readiness; the unfixed binding stays stale", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "key-fact-bindings-refresh-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const f = fixture(temp);

  // A reviewer finds a problem and fixes it — the exact act the gate was accused of punishing.
  fs.writeFileSync(path.join(f.root, "study-guide", "one.md"), "# One\n\nThe reviewer corrected an error in this content.\n");
  assert.equal(auditKeyFactReview(f.root, f.foundation).ready, false, "an edit after binding must invalidate: the review did not read these bytes");

  // The negative: staleness persists for as long as the binding is not refreshed. Re-auditing,
  // re-reading, or waiting does not clear it -- only recording the new state does.
  assert.equal(staleness(auditKeyFactReview(f.root, f.foundation)).length, 1);

  // The refresh path exists, and it is total: the reviewer records the state it now certifies.
  rebind(f);
  const refreshed = auditKeyFactReview(f.root, f.foundation);
  assert.equal(refreshed.ready, true, `re-binding must restore readiness: ${refreshed.failures.join("; ")}`);
  assert.deepEqual(staleness(refreshed), []);

  // And it is a FIXED POINT, not a one-shot: a second fix + refresh converges the same way. Were
  // this not so, "fix then bind" would merely postpone the trap rather than escape it.
  fs.writeFileSync(path.join(f.root, "study-guide", "one.md"), "# One\n\nA second correction after the first refresh.\n");
  assert.equal(auditKeyFactReview(f.root, f.foundation).ready, false);
  rebind(f);
  assert.equal(auditKeyFactReview(f.root, f.foundation).ready, true);
});

test("the review's own content is not bound into itself, so recording a review cannot invalidate it", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "key-fact-bindings-self-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const f = fixture(temp);
  const before = makeKeyFactBindings(f.root);

  // Rewriting the review's own prose -- longer notes, an added key fact, a changed date -- is what
  // a thorough reviewer DOES. None of it may move a binding, or the gate would be unsatisfiable:
  // every write of the review would invalidate the write.
  f.review.reviewedAt = "2026-07-15";
  f.review.keyFacts.push({ id: "fact-two", claim: "Second claim.", status: "qualified", evidenceSourceIds: ["source-1"], usedIn: ["study-guide/one.md"], note: "A second claim traced to source-1 and qualified against the chapter study guide." });
  f.review.checks[0].note = "The separate pass re-examined accountable identity in substantially more depth than the first pass.";
  writeJson(path.join(f.root, ...REVIEW_FILE), f.review);

  assert.deepEqual(makeKeyFactBindings(f.root), before, "the review file must not be bound into its own bindings");
  const audit = auditKeyFactReview(f.root, f.foundation);
  assert.equal(audit.ready, true, `writing the review must not invalidate the review: ${audit.failures.join("; ")}`);
  assert.deepEqual(staleness(audit), []);

  // The paired negative: the file's EXCLUSION is specific to the review, not a hole that swallows
  // metadata/ generally. A sibling metadata record in the same directory is still bound.
  (fs.mkdirSync(path.dirname(path.join(f.root, "provenance", "coursewerk", "ATTRIBUTION.md")), { recursive: true }), fs.writeFileSync)(path.join(f.root, "provenance", "coursewerk", "ATTRIBUTION.md"), "# Attribution\n\nChanged.\n");
  assert.equal(auditKeyFactReview(f.root, f.foundation).ready, false, "a sibling metadata record must still be bound");
});

test("the deliverable tree binds the package's shape, not merely each file's bytes", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "key-fact-bindings-tree-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const f = fixture(temp);
  const base = makeKeyFactBindings(f.root).deliverableTreeSha256;

  // ADD: a reviewed package that gains an unreviewed chapter is not a reviewed package.
  fs.writeFileSync(path.join(f.root, "study-guide", "two.md"), "# Two\n");
  const added = makeKeyFactBindings(f.root).deliverableTreeSha256;
  assert.notEqual(added, base, "adding a deliverable must move the tree");

  // RENAME: same bytes, different path. A content-only digest would miss this entirely.
  fs.renameSync(path.join(f.root, "study-guide", "two.md"), path.join(f.root, "study-guide", "three.md"));
  assert.notEqual(makeKeyFactBindings(f.root).deliverableTreeSha256, added, "renaming a deliverable must move the tree");

  // REMOVE: and the tree returns to the reviewed state, so the digest is a function of the tree
  // alone -- no history, no clock. The negative for all three above.
  fs.rmSync(path.join(f.root, "study-guide", "three.md"));
  assert.equal(makeKeyFactBindings(f.root).deliverableTreeSha256, base, "removing the addition must restore the reviewed tree");
  assert.equal(auditKeyFactReview(f.root, f.foundation).ready, true);

  // Every deliverable top is bound. A top dropped from DELIVERABLE_TOPS would go unreviewed while
  // the gate still reported PASSED -- the silent direction.
  for (const top of ["concepts", "study-guide", "slides", "assessment-support", "practice"]) {
    const g = fixture(temp);
    const priorTree = makeKeyFactBindings(g.root).deliverableTreeSha256;
    fs.mkdirSync(path.join(g.root, top), { recursive: true });
    fs.writeFileSync(path.join(g.root, top, "new-chapter.md"), "# New\n");
    assert.notEqual(makeKeyFactBindings(g.root).deliverableTreeSha256, priorTree, `${top}/ must be bound into the deliverable tree`);
  }
});

test("a review that records no bindings fails closed", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "key-fact-bindings-closed-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));

  // Absent, empty, and null must all fail: a review that certifies nothing certifies nothing. The
  // `|| {}` fallback in the gate must not read as "no bindings means nothing to check".
  for (const bindings of [undefined, {}, null]) {
    const f = fixture(temp);
    f.review.bindings = bindings;
    if (bindings === undefined) delete f.review.bindings;
    writeJson(path.join(f.root, ...REVIEW_FILE), f.review);
    assert.equal(auditKeyFactReview(f.root, f.foundation).ready, false, `bindings=${JSON.stringify(bindings)} must fail closed`);
    assert.equal(staleness(auditKeyFactReview(f.root, f.foundation)).length, 1);
  }

  // The negative: a complete, current bindings block is what passes -- the failures above are the
  // missing bindings, not something else wrong with the fixture.
  const good = fixture(temp);
  assert.equal(auditKeyFactReview(good.root, good.foundation).ready, true);
});
