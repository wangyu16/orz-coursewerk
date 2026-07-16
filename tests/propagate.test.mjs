// M9 propagation tests — the module that ACTS, so the tests are written as a defense, not a demo.
//
// Every assertion is paired with its negative: it is not enough that the right claim landed in
// `derived`, it must ALSO be provably absent from `mechanical` and provably unwritten on disk.
// A propagation engine that refuses correctly but writes anyway passes a one-sided test suite
// and destroys a package.
//
// The order is deliberate. The immutable-region test is first because it is the one failure that
// is unbounded AND unnoticeable: a rename inside a quotation fabricates a quotation, and the
// result still looks exactly like a quotation.
//
// Free, deterministic, no network. Terms and prose come from the golden fixture, which is
// treated as READ-ONLY — every apply test runs against a fresh mkdtemp copy.

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTerms } from "../scripts/lib/terms.mjs";
import { immutableRegions } from "../scripts/lib/immutable.mjs";
import { planPropagation, applyMechanical } from "../scripts/lib/propagate.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = path.join(repo, "tests/fixtures/mini-package");
const read = (file) => fs.readFileSync(path.join(pkg, file), "utf8");

/** The golden fixture's concept maps, as buildTerms takes them. */
function fixtureTerms() {
  return buildTerms([
    { file: "concepts/course.md", text: read("concepts/course.md"), scope: "course" },
    { file: "concepts/phase-change.md", text: read("concepts/phase-change.md"), scope: "phase-change" },
  ]);
}

const TERM_ID = "term.melting-point"; // minted by M1 from the fixture's `## Key terms`
const RENAME = { termId: TERM_ID, from: "melting point", to: "fusion point" };

const FP = { format: "f", label: "l", content: "c", spine: "s", provenance: "p" };

/**
 * A CLAIMS-shaped claim (`text` and `scope` are required fields; interfaces §4a).
 *
 * `locations[].offset` defaults to the claim text's REAL position in the REAL fixture file —
 * M2's job, done here by hand, in JS string indices to match M8. `at` overrides it; `noOffset`
 * omits the field entirely; `text` is the prose, `fileText` lets a test-local file be indexed.
 */
function claim(id, type, file, text, extra = {}) {
  const { at, noOffset, fileText, ...rest } = extra;
  // PRESENCE, not `??` — a test passing `at: null` must get null, or it silently tests the
  // default instead of the malformed value it meant to. (This helper originally used `??` and
  // did exactly that: the trap the module is about, reproduced in the code testing for it.)
  const offset = "at" in extra ? at : offsetIn(file, text, fileText);
  return {
    id: `claim.${id}`,
    type,
    fingerprints: FP,
    locations: [noOffset ? { file } : { file, offset }],
    provenanceDeclared: true,
    spineRefs: ["concept.phase-change.1"],
    scope: "phase-change", // M2's, read verbatim — never re-derived
    ...rest,
    text,
  };
}

/** Where `text` really sits in `file` — the offset M2 would mint. */
function offsetIn(file, text, fileText) {
  let body = fileText;
  if (body === undefined) {
    try {
      body = read(file);
    } catch {
      return 0;
    }
  }
  const at = body.indexOf(text);
  return at < 0 ? 0 : at;
}

/** The two real sentences from study-guide/phase-change.md. */
const SG = "study-guide/phase-change.md";
const PLAIN_SENTENCE = "At standard pressure the melting point of water is 100 °C.";
const QUOTED_SENTENCE =
  'As the source states: "the melting point of a substance is the temperature at which it changes state".';

/** M8 regions for the fixture's real files, keyed by file — what the caller passes in. */
function fixtureRegions() {
  return { [SG]: immutableRegions(read(SG), null), "practice/phase-change.md": immutableRegions(read("practice/phase-change.md"), null) };
}

/** An authorized rename change, as M4+M1 would hand it over. */
const authorizedRename = (extra = {}) => ({ action: "RENAME", authorized: true, rename: RENAME, ...extra });

/** Copy the golden fixture into a throwaway dir. NEVER mutate the fixture itself. */
function tempPackage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-propagate-"));
  fs.cpSync(pkg, dir, { recursive: true });
  return dir;
}

const inTemp = (fn) => {
  const dir = tempPackage();
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const ids = (rows) => rows.map((r) => r.claimId);

// ---------------------------------------------------------------------------------------------
// 1. THE HIGHEST-STAKES TEST: an edit inside an immutable region NEVER auto-applies.
// ---------------------------------------------------------------------------------------------

test("an occurrence inside a quotation is NEVER mechanical — it is derived, and nothing is written", () => {
  const terms = fixtureTerms();
  const quoted = claim("quoted", "fact", SG, QUOTED_SENTENCE);

  // Sanity: the trap is real. The quote genuinely contains the old label, so a naive
  // implementation WOULD rewrite it. If this ever stops holding, the test below is vacuous.
  assert.ok(QUOTED_SENTENCE.includes("melting point"));

  const plan = planPropagation(authorizedRename(), [quoted], terms, fixtureRegions());

  // The negative first: it must NOT be mechanical.
  assert.deepEqual(plan.mechanical, []);
  assert.ok(!ids(plan.mechanical).includes("claim.quoted"));
  // And it must be visible to a human, with a reason that names WHY.
  assert.deepEqual(ids(plan.derived), ["claim.quoted"]);
  assert.match(plan.derived[0].reason, /immutable region/i);
  assert.match(plan.derived[0].reason, /quote/);

  // The whole point, proven on disk: applying this plan touches nothing.
  inTemp((dir) => {
    const before = fs.readFileSync(path.join(dir, SG), "utf8");
    const receipt = applyMechanical(plan, dir);
    assert.deepEqual(receipt.applied, []);
    assert.equal(fs.readFileSync(path.join(dir, SG), "utf8"), before);
    // Byte-for-byte: the quoted 1970-sentence case is about bytes, not about "looks the same".
    assert.ok(before.includes('"the melting point of a substance'));
  });
});

test("PLAN TIME: an offset landing inside a FILE-level immutable region is refused before any write", () => {
  const terms = fixtureTerms();
  // THE test for the check that previously could not run. The claim's own text carries no
  // quote — claim-local analysis sees nothing wrong with it. Only the FILE-level regions know
  // the sentence sits inside a reference section, and only `locations[].offset` can ask them.
  const file = "refs.md";
  const text = `# Notes\n\n## References\n${PLAIN_SENTENCE}\n`;
  const plan = planPropagation(
    authorizedRename(),
    [claim("ref", "fact", file, PLAIN_SENTENCE, { fileText: text })],
    terms,
    { [file]: immutableRegions(text, null) },
  );

  // Refused at PLAN time now — the human sees it in the plan, not in a receipt after the fact.
  assert.deepEqual(plan.mechanical, []);
  assert.deepEqual(ids(plan.derived), ["claim.ref"]);
  assert.match(plan.derived[0].reason, /immutable region/i);
  assert.match(plan.derived[0].reason, /citation/);
  assert.match(plan.derived[0].reason, /file offset/i);

  // Sanity: the trap is real — the identical claim in a file with nothing frozen IS mechanical.
  // Without this, the assertion above would pass for an implementation that refuses everything.
  const plain = `# Notes\n\n${PLAIN_SENTENCE}\n`;
  const ok = planPropagation(
    authorizedRename(),
    [claim("ref", "fact", "plain.md", PLAIN_SENTENCE, { fileText: plain })],
    terms,
    { "plain.md": immutableRegions(plain, null) },
  );
  assert.deepEqual(ids(ok.mechanical), ["claim.ref"]);
});

test("offset: 0 is a real offset and is HONOURED, not discarded as falsy", () => {
  const terms = fixtureTerms();
  // A claim at the very top of a file. `offset || derive` and `offset ?? search` both silently
  // throw this away — §5d's presence-vs-truthiness trap, and the one an implementer hits by reflex.
  const file = "top.md";
  const text = `${PLAIN_SENTENCE}\n\n> "the melting point of a substance" — a quotation below.\n`;
  const plan = planPropagation(authorizedRename(), [claim("top", "fact", file, PLAIN_SENTENCE, { at: 0 })], terms, {
    [file]: immutableRegions(text, null),
  });

  assert.deepEqual(ids(plan.mechanical), ["claim.top"]);
  assert.equal(plan.mechanical[0].edit.offset, 0);

  inTemp((dir) => {
    fs.writeFileSync(path.join(dir, file), text, "utf8");
    const receipt = applyMechanical(plan, dir);
    assert.deepEqual(receipt.applied.map((a) => a.offset), [0]);
    const after = fs.readFileSync(path.join(dir, file), "utf8");
    assert.ok(after.startsWith("At standard pressure the fusion point of water is 100 °C."));
    // The negative: the quoted line further down is untouched. If offset 0 had been discarded
    // and the file searched instead, the blockquote is the other "melting point" in this file.
    assert.ok(after.includes('> "the melting point of a substance"'));
  });
});

test("a location with a file but NO offset routes to derived — no fallback search", () => {
  const terms = fixtureTerms();
  const plan = planPropagation(
    authorizedRename(),
    [claim("noff", "fact", SG, PLAIN_SENTENCE, { termRefs: [TERM_ID], noOffset: true })],
    terms,
    fixtureRegions(),
  );
  assert.deepEqual(plan.mechanical, []);
  assert.deepEqual(ids(plan.derived), ["claim.noff"]);
  // The reason must be the ABSENT one, not the malformed one: "M2 never set it" and "M2 set
  // garbage" are different problems for whoever reads the queue, and a single check covering
  // both by accident would report the wrong one.
  assert.match(plan.derived[0].reason, /carries no 'offset'/);
  assert.match(plan.derived[0].reason, /will not search the file/);

  // A malformed offset is refused too, and says so in its own words.
  for (const at of [-1, 1.5, "12", null]) {
    const bad = planPropagation(
      authorizedRename(),
      [claim("bad", "fact", SG, PLAIN_SENTENCE, { termRefs: [TERM_ID], at })],
      terms,
      fixtureRegions(),
    );
    assert.deepEqual(bad.mechanical, [], `offset ${JSON.stringify(at)} must not be trusted`);
    assert.match(bad.derived[0].reason, /not a non-negative integer/);
  }
});

test("APPLY TIME: a plan is DATA, not a warrant — an edit into an immutable region is refused even so", () => {
  // planPropagation would never emit this. But a plan is serializable: it can be written to
  // JSON, reviewed, stored, and replayed later by a different process against a tree that has
  // moved. applyMechanical is the last code between a plan and a student-facing file, so it
  // re-checks rather than trusting its input — the one place trust would be unrecoverable.
  const file = "quoted.md";
  const text = `> ${PLAIN_SENTENCE}\n`; // a blockquote: M8 freezes the whole run
  const regions = immutableRegions(text, null);
  const handBuilt = {
    mechanical: [
      {
        claimId: "claim.forged",
        edit: {
          kind: "term-substitution",
          file,
          termId: TERM_ID,
          from: "melting point",
          to: "fusion point",
          offset: 2, // just past "> " — the match verifies here, so only the region check saves us
          match: PLAIN_SENTENCE,
          replacement: "At standard pressure the fusion point of water is 100 °C.",
          occurrences: [{ start: PLAIN_SENTENCE.indexOf("melting point"), end: PLAIN_SENTENCE.indexOf("melting point") + 13 }],
          fileImmutableRegions: regions,
        },
      },
    ],
    derived: [],
  };

  inTemp((dir) => {
    fs.writeFileSync(path.join(dir, file), text, "utf8");
    // The drift check PASSES — the file really does read this at offset 2. Only the region
    // re-check stands between this plan and a fabricated quotation.
    assert.equal(text.slice(2, 2 + PLAIN_SENTENCE.length), PLAIN_SENTENCE);

    const receipt = applyMechanical(handBuilt, dir);
    assert.deepEqual(receipt.applied, []);
    assert.equal(receipt.skipped.length, 1);
    assert.match(receipt.skipped[0].reason, /immutable region/i);
    assert.match(receipt.skipped[0].reason, /quote/);
    assert.equal(fs.readFileSync(path.join(dir, file), "utf8"), text);
  });
});

test("APPLY TIME: a file that drifted since it was indexed is refused, not edited approximately", () => {
  const terms = fixtureTerms();
  const plan = planPropagation(
    authorizedRename(),
    [claim("mp", "fact", SG, PLAIN_SENTENCE, { termRefs: [TERM_ID] })],
    terms,
    fixtureRegions(),
  );
  assert.deepEqual(ids(plan.mechanical), ["claim.mp"]);

  inTemp((dir) => {
    // Someone prepends a line between plan and apply. Every offset below it now points at the
    // wrong prose — this is also exactly what a byte-vs-string-index unit mismatch looks like.
    const drifted = "A new introductory line.\n" + fs.readFileSync(path.join(dir, SG), "utf8");
    fs.writeFileSync(path.join(dir, SG), drifted, "utf8");

    const receipt = applyMechanical(plan, dir);
    assert.deepEqual(receipt.applied, []);
    assert.match(receipt.skipped[0].reason, /drifted|wrong unit/i);
    assert.equal(fs.readFileSync(path.join(dir, SG), "utf8"), drifted);
  });
});

test("UNIT: offsets are JS string indices, matching M8 — a byte offset is refused, not applied", () => {
  const terms = fixtureTerms();
  // `claims.schema.json` says "Byte/char offset". These are DIFFERENT NUMBERS in any file with
  // a degree sign, and this fixture says "100 °C". Pin the unit here so a future M2 minting
  // byte offsets fails loudly rather than silently editing one character to the right.
  const file = "deg.md";
  const text = `Heat to 100 °C.\n\n${PLAIN_SENTENCE}\n`;
  const stringIndex = text.indexOf(PLAIN_SENTENCE);
  const byteOffset = Buffer.byteLength(text.slice(0, stringIndex), "utf8");
  assert.notEqual(stringIndex, byteOffset); // the divergence is real, not hypothetical

  const regions = { [file]: immutableRegions(text, null) };
  // M8's own regions are in the same unit: slicing the file at M8's offset must reproduce it.
  const quoteless = immutableRegions(text, null);
  for (const r of quoteless) assert.equal(text.slice(r.start, r.end).length, r.end - r.start);

  const good = planPropagation(authorizedRename(), [claim("d", "fact", file, PLAIN_SENTENCE, { at: stringIndex })], terms, regions);
  assert.deepEqual(ids(good.mechanical), ["claim.d"]);

  const wrongUnit = planPropagation(authorizedRename(), [claim("d", "fact", file, PLAIN_SENTENCE, { at: byteOffset })], terms, regions);
  inTemp((dir) => {
    fs.writeFileSync(path.join(dir, file), text, "utf8");
    const receipt = applyMechanical(wrongUnit, dir);
    assert.deepEqual(receipt.applied, []);
    assert.match(receipt.skipped[0].reason, /wrong unit|drifted/i);
    assert.equal(fs.readFileSync(path.join(dir, file), "utf8"), text);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. A clean rename propagates mechanically.
// ---------------------------------------------------------------------------------------------

test("a clean, authorized rename outside any immutable region propagates mechanically", () => {
  const terms = fixtureTerms();
  const plan = planPropagation(
    authorizedRename(),
    [claim("mp", "fact", SG, PLAIN_SENTENCE, { termRefs: [TERM_ID] })],
    terms,
    fixtureRegions(),
  );

  assert.deepEqual(plan.derived, []);
  assert.deepEqual(ids(plan.mechanical), ["claim.mp"]);
  const { edit } = plan.mechanical[0];
  assert.equal(edit.kind, "term-substitution");
  assert.equal(edit.file, SG);
  assert.equal(edit.termId, TERM_ID);
  assert.equal(edit.replacement, "At standard pressure the fusion point of water is 100 °C.");
  // The negative: the value is untouched. A rename that "helpfully" also moved a number would
  // be a content edit wearing a label edit's badge.
  assert.ok(edit.replacement.includes("100 °C"));
  assert.equal(edit.occurrences.length, 1);
  assert.equal(edit.match.slice(edit.occurrences[0].start, edit.occurrences[0].end), "melting point");
});

test("only the old label moves: aliases and unrelated terms are left alone", () => {
  const terms = fixtureTerms();
  // "fusion point" is an ALIAS of the same term (fixture: `**melting point** (fusion point, …)`).
  // Spec §6.3: the old label persists as a recognized synonym FOREVER. A rename of the preferred
  // label must not go hunting for aliases and erase the package's legacy vocabulary.
  const alias = claim("alias", "fact", SG, "The fusion point of water is 0 °C.", { termRefs: [TERM_ID] });
  const other = claim("lh", "fact", SG, "Latent heat is absorbed during melting.", { termRefs: ["term.latent-heat"] });

  const plan = planPropagation(authorizedRename(), [alias, other], terms, fixtureRegions());
  // Neither is a target: neither appears in either tier. Not "refused" — nothing to say.
  assert.deepEqual(plan.mechanical, []);
  assert.deepEqual(plan.derived, []);
});

// ---------------------------------------------------------------------------------------------
// 3. Uncertainty routes to derived — every branch of the boundary.
// ---------------------------------------------------------------------------------------------

test("uncertainty => derived: an unauthorized rename is a suspected error, never auto-applied", () => {
  const terms = fixtureTerms();
  const c = [claim("mp", "fact", SG, PLAIN_SENTENCE, { termRefs: [TERM_ID] })];

  for (const change of [
    { action: "RENAME", rename: RENAME }, // authorized absent
    { action: "RENAME", authorized: false, rename: RENAME },
    { action: "RENAME", authorized: "yes", rename: RENAME }, // truthy but not `true`
  ]) {
    const plan = planPropagation(change, c, terms, fixtureRegions());
    assert.deepEqual(plan.mechanical, [], `must not auto-apply: ${JSON.stringify(change.authorized)}`);
    assert.deepEqual(ids(plan.derived), ["claim.mp"]);
    assert.match(plan.derived[0].reason, /suspected error|not recorded as authorized/i);
  }
});

test("uncertainty => derived: deprecate-but-teach is ANNOTATE, never replace", () => {
  const terms = fixtureTerms();
  const plan = planPropagation(
    authorizedRename({ pedagogy: "deprecate-but-teach" }),
    [claim("mp", "fact", SG, PLAIN_SENTENCE, { termRefs: [TERM_ID] })],
    terms,
    fixtureRegions(),
  );
  // The exact same claim that WAS mechanical above. Only the pedagogical intent changed, and
  // that alone must be enough to stop the machine.
  assert.deepEqual(plan.mechanical, []);
  assert.deepEqual(ids(plan.derived), ["claim.mp"]);
  assert.match(plan.derived[0].reason, /deprecate-but-teach|never replace/i);
});

test("uncertainty => derived: no immutable-region analysis for the file means the edit is unproven", () => {
  const terms = fixtureTerms();
  const c = [claim("mp", "fact", SG, PLAIN_SENTENCE, { termRefs: [TERM_ID] })];

  // Absence of evidence is not evidence of absence: an empty map is "M8 never ran", not "no
  // regions". The negative that matters — an implementation that reads `regions ?? []` here
  // auto-applies into an unanalyzed file and this test is the only thing that says so.
  for (const regions of [{}, undefined, null, { "other.md": [] }]) {
    const plan = planPropagation(authorizedRename(), c, terms, regions);
    assert.deepEqual(plan.mechanical, [], `must not auto-apply with regions ${JSON.stringify(regions)}`);
    assert.match(plan.derived[0].reason, /immutable-region analysis|Unproven/i);
  }
  // Contrast: an explicitly EMPTY region list for the file IS an answer ("analyzed; nothing
  // frozen") and does auto-apply. If this stops holding, the check above has become a blanket ban.
  const plan = planPropagation(authorizedRename(), c, terms, { [SG]: [] });
  assert.deepEqual(ids(plan.mechanical), ["claim.mp"]);
});

test("uncertainty => derived: a claim with no scope cannot be resolved, and scope is never re-derived", () => {
  const terms = fixtureTerms();
  const { scope, ...noScope } = claim("mp", "fact", SG, PLAIN_SENTENCE, { termRefs: [TERM_ID] });
  assert.ok(!("scope" in noScope));

  const plan = planPropagation(authorizedRename(), [noScope], terms, fixtureRegions());
  assert.deepEqual(plan.mechanical, []);
  assert.match(plan.derived[0].reason, /scope/i);

  // The negative: `null` is M2's ANSWER (package-wide), not an absence, and must not take the
  // same path. The fixture's course map declares the term at course scope, so it resolves.
  const wide = planPropagation(
    authorizedRename(),
    [claim("mp", "fact", SG, PLAIN_SENTENCE, { termRefs: [TERM_ID], scope: null })],
    terms,
    fixtureRegions(),
  );
  assert.deepEqual(ids(wide.mechanical), ["claim.mp"]);
});

test("uncertainty => derived: the registry and the claim disagreeing is not a tie to break", () => {
  const terms = fixtureTerms();
  // The claim declares it is about latent heat, yet the label "melting point" resolves to the
  // melting-point term in this scope. Two authorities disagree about what the label means —
  // exactly the defect class this index exists to CATCH, so it is escalated, not resolved here.
  const conflicted = claim("x", "fact", SG, PLAIN_SENTENCE, { termRefs: [TERM_ID, "term.latent-heat"] });
  const wrongTerm = planPropagation(
    { action: "RENAME", authorized: true, rename: { termId: "term.latent-heat", from: "melting point", to: "fusion point" } },
    [conflicted],
    terms,
    fixtureRegions(),
  );
  assert.deepEqual(wrongTerm.mechanical, []);
  assert.match(wrongTerm.derived[0].reason, /disagree/i);
});

test("uncertainty => derived: the new label must not already mean something else here", () => {
  const terms = fixtureTerms();
  // Rename latent heat -> "melting point". Deterministic, obeys the letter of the request, and
  // silently merges two distinct concepts into one homograph.
  const plan = planPropagation(
    { action: "RENAME", authorized: true, rename: { termId: "term.latent-heat", from: "latent heat", to: "melting point" } },
    [claim("lh", "fact", SG, "The latent heat of fusion is absorbed at constant temperature.", { termRefs: ["term.latent-heat"] })],
    terms,
    fixtureRegions(),
  );
  assert.deepEqual(plan.mechanical, []);
  assert.match(plan.derived[0].reason, /homograph|already resolves/i);
});

test("uncertainty => derived: a claim spanning several files has no single proven edit site", () => {
  const terms = fixtureTerms();
  const spread = claim("mp", "fact", SG, PLAIN_SENTENCE, {
    termRefs: [TERM_ID],
    locations: [{ file: SG }, { file: "practice/phase-change.md" }],
  });
  const plan = planPropagation(authorizedRename(), [spread], terms, fixtureRegions());
  assert.deepEqual(plan.mechanical, []);
  assert.match(plan.derived[0].reason, /locations/i);
});

test("uncertainty => derived: a claim flagged immutable is refused on its own record alone", () => {
  const terms = fixtureTerms();
  const plan = planPropagation(
    authorizedRename(),
    [claim("mp", "fact", SG, PLAIN_SENTENCE, { termRefs: [TERM_ID], immutable: true })],
    terms,
    fixtureRegions(),
  );
  assert.deepEqual(plan.mechanical, []);
  assert.match(plan.derived[0].reason, /immutable/i);
});

// ---------------------------------------------------------------------------------------------
// 4. Plausible-looking edits, correctly refused.
// ---------------------------------------------------------------------------------------------

test("PLAUSIBLE BUT REFUSED: a sentence-initial capital is a case judgment, not a substitution", () => {
  const terms = fixtureTerms();
  // "Melting point of water is 0 °C." -> "Fusion point…"? Almost certainly. Almost is not proven:
  // sentence case, title case and proper nouns each want a different rule, and a case-transfer
  // heuristic in the mechanical tier is a guess wearing a deterministic costume.
  const plan = planPropagation(
    authorizedRename(),
    [claim("cap", "fact", SG, "Melting point of water is 0 °C at standard pressure.", { termRefs: [TERM_ID] })],
    terms,
    fixtureRegions(),
  );
  assert.deepEqual(plan.mechanical, []);
  assert.deepEqual(ids(plan.derived), ["claim.cap"]);
  assert.match(plan.derived[0].reason, /case/i);
  // The negative that makes this a real test: it is NOT silently dropped. A "skip what you
  // can't do" implementation loses the occurrence entirely and half-renames the package.
  assert.equal(plan.derived.length, 1);
});

test("PLAUSIBLE BUT REFUSED: an answer-key item may TEST the term (spec §6.3)", () => {
  const terms = fixtureTerms();
  const key = claim("ak", "answer-key", "practice/phase-change.md", "What is the melting point of water?", {
    termRefs: [TERM_ID],
  });
  const plan = planPropagation(authorizedRename(), [key], terms, fixtureRegions());
  assert.deepEqual(plan.mechanical, []);
  assert.match(plan.derived[0].reason, /answer-key|tests the term/i);

  // The negative: it is the TYPE that refuses it, not the prose. The identical sentence as a
  // `fact` is mechanical — if this flips, the rule has silently become a text heuristic.
  const asFact = planPropagation(
    authorizedRename(),
    [claim("ak", "fact", "practice/phase-change.md", "What is the melting point of water?", { termRefs: [TERM_ID] })],
    terms,
    fixtureRegions(),
  );
  assert.deepEqual(ids(asFact.mechanical), ["claim.ak"]);
});

test("PLAUSIBLE BUT REFUSED: 'melting pointer' is not the term — whole words only", () => {
  const terms = fixtureTerms();
  const plan = planPropagation(
    authorizedRename(),
    [claim("sub", "fact", SG, "The melting pointer tool reads temperature.", { termRefs: [TERM_ID] })],
    terms,
    fixtureRegions(),
  );
  // Not a target at all — and, critically, not a silent corruption of "melting pointer".
  assert.deepEqual(plan.mechanical, []);
  assert.deepEqual(plan.derived, []);
});

// ---------------------------------------------------------------------------------------------
// 5. Non-RENAME verbs, and contract breaks.
// ---------------------------------------------------------------------------------------------

test("every verb except RENAME is derived: nothing needing new prose is ever auto-applied", () => {
  const terms = fixtureTerms();
  const c = [claim("mp", "fact", SG, PLAIN_SENTENCE, { termRefs: [TERM_ID] })];
  for (const action of ["RE-DERIVE", "REGENERATE", "RECHECK", "ESCALATE", "ANNOTATE"]) {
    const plan = planPropagation({ action, authorized: true, claimIds: ["claim.mp"] }, c, terms, fixtureRegions());
    assert.deepEqual(plan.mechanical, [], `${action} must never be mechanical`);
    assert.deepEqual(ids(plan.derived), ["claim.mp"]);
    assert.match(plan.derived[0].reason, new RegExp(action));
  }
});

test("NONE costs the instructor nothing — not even a review item", () => {
  const terms = fixtureTerms();
  const plan = planPropagation(
    { action: "NONE", authorized: true, claimIds: ["claim.mp"] },
    [claim("mp", "fact", SG, PLAIN_SENTENCE, { termRefs: [TERM_ID] })],
    terms,
    fixtureRegions(),
  );
  // The headline behavior of the whole index: a null edit produces zero flags.
  assert.deepEqual(plan, { mechanical: [], derived: [] });
});

test("contract breaks THROW rather than degrading into a plausible-looking review item", () => {
  const terms = fixtureTerms();
  const c = [claim("mp", "fact", SG, PLAIN_SENTENCE)];
  assert.throws(() => planPropagation({ action: "REWRITE" }, c, terms, {}), /unknown action/);
  assert.throws(() => planPropagation({}, c, terms, {}), /unknown action/);
  assert.throws(() => planPropagation({ action: "RENAME", authorized: true }, c, terms, {}), /rename:\{termId, from, to\}/);
  assert.throws(
    () => planPropagation({ action: "RENAME", authorized: true, rename: { termId: TERM_ID, from: "x" } }, c, terms, {}),
    /rename:\{termId, from, to\}/,
  );
  // A no-op rename is not a break — it is simply nothing to do.
  assert.deepEqual(
    planPropagation({ action: "RENAME", authorized: true, rename: { termId: TERM_ID, from: "melting point", to: "Melting  Point" } }, c, terms, {}),
    { mechanical: [], derived: [] },
  );
});

test("tolerant inputs: odd claim shapes yield an empty plan rather than throwing", () => {
  const terms = fixtureTerms();
  const change = authorizedRename();
  for (const claims of [[], undefined, null, { claims: [] }, [null, 7, "x"], [{ id: "claim.a" }]]) {
    assert.deepEqual(planPropagation(change, claims, terms, fixtureRegions()), { mechanical: [], derived: [] });
  }
});

// ---------------------------------------------------------------------------------------------
// 6. The receipt.
// ---------------------------------------------------------------------------------------------

test("applyMechanical names every applied edit in the receipt, with enough to verify and reverse it", () => {
  const terms = fixtureTerms();
  const plan = planPropagation(
    authorizedRename(),
    [claim("mp", "fact", SG, PLAIN_SENTENCE, { termRefs: [TERM_ID] })],
    terms,
    fixtureRegions(),
  );

  inTemp((dir) => {
    const before = fs.readFileSync(path.join(dir, SG), "utf8");
    const receipt = applyMechanical(plan, dir);
    const after = fs.readFileSync(path.join(dir, SG), "utf8");

    // The edit happened.
    assert.ok(after.includes("At standard pressure the fusion point of water is 100 °C."));
    assert.ok(!after.includes(PLAIN_SENTENCE));

    // Every applied edit is NAMED — one receipt entry per mechanical plan item, no more, no less.
    assert.equal(receipt.applied.length, plan.mechanical.length);
    assert.deepEqual(receipt.applied.map((a) => a.claimId), ["claim.mp"]);

    const entry = receipt.applied[0];
    assert.equal(entry.file, SG);
    assert.equal(entry.termId, TERM_ID);
    assert.equal(entry.from, "melting point");
    assert.equal(entry.to, "fusion point");
    assert.equal(entry.before, PLAIN_SENTENCE);
    assert.equal(entry.after, "At standard pressure the fusion point of water is 100 °C.");

    // VERIFY: the receipt's hashes bracket the real file, so a reviewer can confirm months later
    // that this receipt describes this file and no other edit slipped in alongside it.
    assert.equal(entry.fileHashBefore, sha(before));
    assert.equal(entry.fileHashAfter, sha(after));

    // REVERSE: offset + before + after is sufficient to put it back, exactly.
    assert.equal(after.slice(entry.offset, entry.offset + entry.after.length), entry.after);
    const reverted = after.slice(0, entry.offset) + entry.before + after.slice(entry.offset + entry.after.length);
    assert.equal(reverted, before);

    // The summary is the consent-by-summary surface: it must carry the count and the rename.
    assert.match(receipt.summary, /Applied 1 mechanical edit/);
    assert.match(receipt.summary, /melting point -> fusion point/);
  });
});

test("a refusal is recorded, never silent — 'not applied' must be distinguishable from 'not planned'", () => {
  const terms = fixtureTerms();
  const plan = planPropagation(
    authorizedRename(),
    [claim("gone", "fact", "missing.md", PLAIN_SENTENCE, { termRefs: [TERM_ID] })],
    terms,
    { "missing.md": [] },
  );
  assert.deepEqual(ids(plan.mechanical), ["claim.gone"]);

  inTemp((dir) => {
    const receipt = applyMechanical(plan, dir);
    assert.deepEqual(receipt.applied, []);
    assert.deepEqual(receipt.skipped.map((s) => s.claimId), ["claim.gone"]);
    assert.match(receipt.skipped[0].reason, /Cannot read file/);
    assert.match(receipt.summary, /No mechanical edits applied/);
    assert.match(receipt.summary, /1 refused/);
  });
});

test("a repeated sentence edits the SITE THE OFFSET NAMES — the locator hack's failure mode is gone", () => {
  const terms = fixtureTerms();
  // The same sentence twice. A search-for-the-text locator can only guess (or refuse); the
  // offset simply knows. This is the concrete reason the fallback search was removed rather
  // than kept as a convenience.
  const file = "dup.md";
  const text = `${PLAIN_SENTENCE}\n\n${PLAIN_SENTENCE}\n`;
  const second = text.lastIndexOf(PLAIN_SENTENCE);
  const plan = planPropagation(
    authorizedRename(),
    [claim("d", "fact", file, PLAIN_SENTENCE, { termRefs: [TERM_ID], at: second })],
    terms,
    { [file]: immutableRegions(text, null) },
  );

  inTemp((dir) => {
    fs.writeFileSync(path.join(dir, file), text, "utf8");
    const receipt = applyMechanical(plan, dir);
    assert.deepEqual(receipt.applied.map((a) => a.offset), [second]);
    const after = fs.readFileSync(path.join(dir, file), "utf8");
    // The SECOND copy moved; the first is untouched. A first-match locator gets this backwards
    // and the test suite would never know.
    assert.equal(after, `${PLAIN_SENTENCE}\n\nAt standard pressure the fusion point of water is 100 °C.\n`);
  });
});

// ---------------------------------------------------------------------------------------------
// 7. Nothing outside the plan is touched.
// ---------------------------------------------------------------------------------------------

test("applyMechanical writes ONLY the files named in the plan", () => {
  const terms = fixtureTerms();
  const plan = planPropagation(
    authorizedRename(),
    [claim("mp", "fact", SG, PLAIN_SENTENCE, { termRefs: [TERM_ID] })],
    terms,
    fixtureRegions(),
  );

  inTemp((dir) => {
    fs.writeFileSync(path.join(dir, "bystander.md"), "The melting point of water is 0 °C.\n", "utf8");
    const snapshot = snapshotTree(dir);
    applyMechanical(plan, dir);
    const after = snapshotTree(dir);

    // Exactly one file differs, and it is the one the plan named.
    const changed = [...after.keys()].filter((f) => after.get(f) !== snapshot.get(f));
    assert.deepEqual(changed, [SG]);
    // No file created, none removed.
    assert.deepEqual([...after.keys()].sort(), [...snapshot.keys()].sort());
    // The bystander says "melting point" too — and is untouched, because it is not in the plan.
    assert.equal(fs.readFileSync(path.join(dir, "bystander.md"), "utf8"), "The melting point of water is 0 °C.\n");
  });
});

test("applyMechanical refuses to write outside the package root", () => {
  const terms = fixtureTerms();
  const plan = planPropagation(authorizedRename(), [claim("esc", "fact", "../escape.md", PLAIN_SENTENCE, { termRefs: [TERM_ID] })], terms, {
    "../escape.md": [],
  });
  assert.deepEqual(ids(plan.mechanical), ["claim.esc"]);

  inTemp((dir) => {
    const outside = path.join(dir, "..", "escape.md");
    fs.writeFileSync(outside, PLAIN_SENTENCE, "utf8");
    try {
      const receipt = applyMechanical(plan, dir);
      assert.deepEqual(receipt.applied, []);
      assert.match(receipt.skipped[0].reason, /escapes the package root/);
      assert.equal(fs.readFileSync(outside, "utf8"), PLAIN_SENTENCE);
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });
});

test("an empty plan is a no-op: no writes, and an honest summary", () => {
  inTemp((dir) => {
    const snapshot = snapshotTree(dir);
    for (const plan of [{ mechanical: [], derived: [] }, {}, undefined]) {
      const receipt = applyMechanical(plan, dir);
      assert.deepEqual(receipt.applied, []);
      assert.match(receipt.summary, /No mechanical edits applied/);
    }
    assert.deepEqual([...snapshotTree(dir).entries()], [...snapshot.entries()]);
  });
});

// ---------------------------------------------------------------------------------------------
// 8. Determinism.
// ---------------------------------------------------------------------------------------------

test("planPropagation is deterministic: same change => byte-identical plan, regardless of input order", () => {
  const terms = fixtureTerms();
  const claims = [
    claim("quoted", "fact", SG, QUOTED_SENTENCE),
    claim("mp", "fact", SG, PLAIN_SENTENCE, { termRefs: [TERM_ID] }),
    claim("ak", "answer-key", "practice/phase-change.md", "What is the melting point of water?", { termRefs: [TERM_ID] }),
  ];
  const a = planPropagation(authorizedRename(), claims, fixtureTerms(), fixtureRegions());
  const b = planPropagation(authorizedRename(), claims, terms, fixtureRegions());
  assert.equal(JSON.stringify(a), JSON.stringify(b));

  // Order-independence is part of "same inputs": a plan that depends on array order is not
  // reproducible from CLAIMS.json, whose order M2 may legitimately change.
  const reversed = planPropagation(authorizedRename(), [...claims].reverse(), terms, fixtureRegions());
  assert.equal(JSON.stringify(reversed), JSON.stringify(a));

  // And the sort is on claimId, so the plan diffs cleanly.
  assert.deepEqual(ids(a.mechanical), ["claim.mp"]);
  assert.deepEqual(ids(a.derived), ["claim.ak", "claim.quoted"]);
});

test("applyMechanical is deterministic and carries no clock", () => {
  const terms = fixtureTerms();
  const plan = planPropagation(
    authorizedRename(),
    [claim("mp", "fact", SG, PLAIN_SENTENCE, { termRefs: [TERM_ID] })],
    terms,
    fixtureRegions(),
  );
  const run = () => {
    let receipt;
    inTemp((dir) => {
      receipt = applyMechanical(plan, dir);
    });
    return receipt;
  };
  // Two runs in different temp dirs, at different wall-clock times: identical receipts. A
  // timestamp here would make the receipt irreproducible from git — the caller stamps it.
  assert.equal(JSON.stringify(run()), JSON.stringify(run()));
});

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

function sha(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

/** file -> sha256, for every file under `dir`. */
function snapshotTree(dir) {
  const out = new Map();
  for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    const abs = path.join(entry.parentPath ?? entry.path, entry.name);
    if (entry.isFile()) out.set(path.relative(dir, abs), sha(fs.readFileSync(abs, "utf8")));
  }
  return out;
}
