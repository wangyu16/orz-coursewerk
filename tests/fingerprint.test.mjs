// M3 fingerprint tests — GOLDEN TESTS THAT PIN THE DESIGN (interfaces §5, spec §2.4/§6.5/§7).
//
// These are not "does the code run" tests. Each one pins a behavior the whole product depends
// on, in one of two directions:
//   NULL-EDIT SUITE — `content` MUST NOT move. This is the #1 user want ("I add a whitespace
//                     and every file gets flagged"). A failure here is a false flag.
//   REAL-EDIT SUITE — `content` MUST move. A failure here is a MISSED KNOWLEDGE ERROR, which is
//                     the failure mode this index exists to prevent. Pin the hedge case hardest:
//                     "may cause" → "causes" is a 4-byte diff and a total change of meaning.
// Free, deterministic, no network. Golden fixture: tests/fixtures/mini-package/concepts/.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addCandidate, buildTerms, setPreferred } from "../scripts/lib/terms.mjs";
import { fingerprints, normalizeContent } from "../scripts/lib/fingerprint.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const concepts = path.join(repo, "tests/fixtures/mini-package/concepts");
const read = (file) => fs.readFileSync(path.join(concepts, file), "utf8");

/** The real fixture's concept maps, as buildTerms takes them. */
function fixtureTerms() {
  return buildTerms([
    { file: "concepts/course.md", text: read("course.md"), scope: "course" },
    { file: "concepts/phase-change.md", text: read("phase-change.md"), scope: "phase-change" },
  ]);
}

const TERMS = fixtureTerms();

/** A minimal claim carrying `text` (see the module header on this assumption). */
function claim(text, extra = {}) {
  return {
    id: "claim.phase-change.abc123",
    type: "fact",
    text,
    termRefs: ["melting point"],
    spineRefs: ["concept.phase-change.1"],
    sourceRefs: ["src.melting-point@rev1"],
    locations: [{ file: "study-guide/phase-change.md", anchor: "melting-point" }],
    provenanceDeclared: true,
    ...extra,
  };
}

const contentOf = (text) => fingerprints(claim(text), TERMS).content;

// --------------------------------------------------------------------------------------
// NULL-EDIT SUITE — content MUST NOT move (target: 0 flags)
// --------------------------------------------------------------------------------------

const BASE = "The melting point of water is 100 °C.";

test("null edit: added whitespace does not move content", () => {
  assert.equal(contentOf("The  melting   point  of water   is 100 °C.  "), contentOf(BASE));
});

test("null edit: reflowed lines do not move content", () => {
  assert.equal(
    contentOf("The melting point\nof water\nis 100 °C."),
    contentOf(BASE),
  );
});

test("null edit: markdown emphasis/formatting does not move content", () => {
  assert.equal(contentOf("The **melting point** of _water_ is `100 °C`."), contentOf(BASE));
  assert.equal(contentOf("- The melting point of water is 100 °C."), contentOf(BASE));
});

test("null edit: meaning-preserving rephrase does not move content", () => {
  // The pinned rephrase: of-genitive -> 's-genitive, constituent order changed.
  assert.equal(contentOf("Water's melting point is 100 °C."), contentOf(BASE));
});

test("null edit: quantity spelling (unit alias, exponent, trailing zeros) does not move content", () => {
  assert.equal(contentOf("The melting point of water is 100°C."), contentOf(BASE));
  assert.equal(contentOf("The melting point of water is 100.0 degC."), contentOf(BASE));
  assert.equal(contentOf("The melting point of water is 1.0e2 celsius."), contentOf(BASE));
});

test("null edit: a term alias from the map folds to the same id", () => {
  // "melting temperature" is a registered alias of "melting point" in the fixture map.
  assert.equal(contentOf("The melting temperature of water is 100 °C."), contentOf(BASE));
});

test("null edit: whitespace and formatting move NOTHING — all five fingerprints hold", () => {
  const a = fingerprints(claim(BASE), TERMS);
  const b = fingerprints(claim("  The **melting point**   of water\n  is 100 °C.  "), TERMS);
  assert.deepEqual(b, a);
});

// --------------------------------------------------------------------------------------
// REAL-EDIT SUITE — content MUST move (target: full recall, however small the byte diff)
// --------------------------------------------------------------------------------------

test("real edit: a value change moves content (100 °C -> 90 °C)", () => {
  assert.notEqual(contentOf("The melting point of water is 90 °C."), contentOf(BASE));
});

test("real edit: a unit change moves content (we never convert units)", () => {
  assert.notEqual(contentOf("The melting point of water is 100 K."), contentOf(BASE));
  // ...and the deliberate non-conversion: the same physical temperature, different unit.
  assert.notEqual(contentOf("The melting point of water is 373.15 K."), contentOf(BASE));
});

test("real edit: THE HEDGE CASE — 'may cause' -> 'causes' moves content", () => {
  // spec §6.5's named trap. A normalizer that treats modality as filler reports this as a
  // null edit and lets a possibility-asserted-as-fact propagate unnoticed. Pin it hard.
  const hedged = contentOf("Rapid heating may cause superheating.");
  const asserted = contentOf("Rapid heating causes superheating.");
  assert.notEqual(hedged, asserted);
  // and every neighbouring hedge is likewise distinct, not merely "some hedge present"
  assert.notEqual(contentOf("Rapid heating might cause superheating."), hedged);
  assert.notEqual(contentOf("Rapid heating must cause superheating."), asserted);
  // a quantity hedge is a hedge too — dropping a tolerance is a knowledge change
  assert.notEqual(contentOf("The melting point of water is approximately 100 °C."), contentOf(BASE));
});

test("real edit: negation added or removed moves content", () => {
  const melts = contentOf("Water melts at 100 °C.");
  const doesNot = contentOf("Water does not melt at 100 °C.");
  assert.notEqual(doesNot, melts);
  // the contraction is the same claim as the expanded form (null), but still not the positive
  assert.equal(contentOf("Water doesn't melt at 100 °C."), doesNot);
  assert.notEqual(contentOf("Water doesn't melt at 100 °C."), melts);
});

test("real edit: a quantifier change moves content (all -> some)", () => {
  const all = contentOf("All solids melt at a characteristic temperature.");
  const some = contentOf("Some solids melt at a characteristic temperature.");
  assert.notEqual(all, some);
  // and the bare (unquantified) form is distinct from both
  assert.notEqual(contentOf("Solids melt at a characteristic temperature."), all);
});

test("real edit: negation/modality scope is BOUND, not loose in the bag", () => {
  // Both sentences contain exactly the same words. Only what the negation scopes over differs.
  // A normalizer that merely notes "a 'not' is present" would collide these.
  assert.notEqual(
    contentOf("Water melts but does not boil at 100 °C."),
    contentOf("Water does not melt but boils at 100 °C."),
  );
});

// --------------------------------------------------------------------------------------
// LAYER SEPARATION — each fingerprint watches its own layer and no other
// --------------------------------------------------------------------------------------

test("label moves on a rename; content does NOT (terms canonicalize to ids)", () => {
  const before = fingerprints(claim(BASE), TERMS);
  const renamed = setPreferred(TERMS, "term.melting-point", "fusion temperature");
  const after = fingerprints(claim(BASE), renamed);

  assert.notEqual(after.label, before.label, "a rename must move the label layer");
  assert.equal(after.content, before.content, "a rename must NOT move the content layer");
  assert.equal(after.spine, before.spine);
  assert.equal(after.provenance, before.provenance);

  // The old label was never deleted (M1), so prose using it still folds to the same id — and
  // prose using the NEW label folds there too: one claim, one meaning, across the rename.
  assert.equal(
    normalizeContent("The fusion temperature of water is 100 °C.", renamed),
    normalizeContent(BASE, renamed),
  );
});

test("label does NOT move on a value change", () => {
  const before = fingerprints(claim(BASE), TERMS);
  const after = fingerprints(claim("The melting point of water is 90 °C."), TERMS);
  assert.equal(after.label, before.label, "a value change must not move the label layer");
  assert.notEqual(after.content, before.content);
});

test("label is a sorted SET: termRef order and duplicates do not move it", () => {
  const a = fingerprints(claim(BASE, { termRefs: ["melting point", "latent heat"] }), TERMS);
  const b = fingerprints(claim(BASE, { termRefs: ["latent heat", "melting point", "melting point"] }), TERMS);
  assert.equal(b.label, a.label);
  // an id and its label are the same ref
  const c = fingerprints(claim(BASE, { termRefs: ["term.melting-point"] }), TERMS);
  assert.equal(c.label, fingerprints(claim(BASE), TERMS).label);
});

test("spine moves only when spineRefs change", () => {
  const before = fingerprints(claim(BASE), TERMS);
  const moved = fingerprints(claim(BASE, { spineRefs: ["concept.phase-change.2"] }), TERMS);
  assert.notEqual(moved.spine, before.spine);
  assert.equal(moved.content, before.content);
  assert.equal(moved.label, before.label);
  assert.equal(moved.provenance, before.provenance);

  // sorted + de-duplicated: order and repeats are not a change
  const reordered = fingerprints(
    claim(BASE, { spineRefs: ["objective.phase-change.1", "concept.phase-change.1"] }),
    TERMS,
  );
  const sorted = fingerprints(
    claim(BASE, { spineRefs: ["concept.phase-change.1", "objective.phase-change.1", "concept.phase-change.1"] }),
    TERMS,
  );
  assert.equal(reordered.spine, sorted.spine);
  assert.notEqual(reordered.spine, before.spine);

  // a content edit must not move the spine layer
  assert.equal(fingerprints(claim("The melting point of water is 90 °C."), TERMS).spine, before.spine);
});

test("provenance moves only when sourceRefs or the override change", () => {
  const before = fingerprints(claim(BASE), TERMS);

  const drifted = fingerprints(claim(BASE, { sourceRefs: ["src.melting-point@rev2"] }), TERMS);
  assert.notEqual(drifted.provenance, before.provenance, "source drift must move provenance");
  assert.equal(drifted.content, before.content);
  assert.equal(drifted.spine, before.spine);

  const overridden = fingerprints(claim(BASE, { overrideId: "override.1" }), TERMS);
  assert.notEqual(overridden.provenance, before.provenance, "an override must move provenance");
  assert.equal(overridden.content, before.content);
  assert.equal(overridden.label, before.label);

  // sorted + de-duplicated set semantics
  assert.equal(
    fingerprints(claim(BASE, { sourceRefs: ["b", "a"] }), TERMS).provenance,
    fingerprints(claim(BASE, { sourceRefs: ["a", "b", "a"] }), TERMS).provenance,
  );

  // a content edit must not move the provenance layer
  assert.equal(fingerprints(claim("The melting point of water is 90 °C."), TERMS).provenance, before.provenance);
});

test("format is the WORDING layer: blind to whitespace/markup, moves on a rephrase", () => {
  const before = fingerprints(claim(BASE), TERMS);
  assert.equal(
    fingerprints(claim("  The **melting point** of water\nis 100 °C.  "), TERMS).format,
    before.format,
    "whitespace/markup noise must not move format",
  );
  // spec §5 puts "meaning-preserving rephrase" in the format-only row: format moves, content holds
  const rephrased = fingerprints(claim("Water's melting point is 100 °C."), TERMS);
  assert.notEqual(rephrased.format, before.format, "a rephrase must move format");
  assert.equal(rephrased.content, before.content, "a rephrase must not move content");
  assert.equal(rephrased.label, before.label);
  assert.equal(rephrased.spine, before.spine);
  assert.equal(rephrased.provenance, before.provenance);
});

test("the five layers are domain-separated: empty layers do not collide", () => {
  const bare = fingerprints({ text: "" }, TERMS);
  const values = new Set(Object.values(bare));
  assert.equal(values.size, 5, "an empty claim must still yield five distinct digests");
});

// --------------------------------------------------------------------------------------
// SCOPE — a chapter-local homograph must not fold to the first-declared term package-wide.
// Unscoped resolution is a SILENT mis-identification, which is the exact failure this module
// exists to prevent; committing it inside the module would be the worst version of it.
// --------------------------------------------------------------------------------------

/**
 * A registry with a genuine homograph, built through M1's real API. `addCandidate` mints a
 * SECOND node for "cell" in the biology chapter precisely because the battery-chapter "cell"
 * does not resolve in that scope — one word, two meanings, two ids.
 */
function homographTerms() {
  let t = addCandidate(TERMS, "cell", "battery");
  t = addCandidate(t, "cell", "biology");
  return t;
}

test("scope: a homograph resolves per-scope — same label, two chapters, different content fp", () => {
  const t = homographTerms();
  const ids = t.terms.filter((x) => x.canonical === "cell").map((x) => x.id);
  assert.equal(ids.length, 2, "the fixture must actually contain a homograph");

  const text = "The cell stores energy.";
  assert.notEqual(
    normalizeContent(text, t, "battery"),
    normalizeContent(text, t, "biology"),
    "identical prose in two chapters means two different things — content must differ",
  );
  // and each folds to its OWN chapter's term id, not merely to something different
  assert.match(normalizeContent(text, t, "battery"), /term\.cell\b/);
  assert.match(normalizeContent(text, t, "biology"), /term\.cell-2\b/);
});

test("scope: null keeps package-wide (unscoped) behavior", () => {
  const t = homographTerms();
  const text = "The cell stores energy.";
  // null / omitted / undefined all mean "any scope" — M1's first-match rule, unchanged.
  assert.equal(normalizeContent(text, t, null), normalizeContent(text, t));
  assert.equal(normalizeContent(text, t, undefined), normalizeContent(text, t, null));
  assert.equal(normalizeContent(text, t, null), normalizeContent(text, t, "battery"));

  // scoping must not disturb a term that legitimately spans the package: "melting point" is
  // declared in BOTH the course map and the chapter map, so it resolves either way.
  assert.equal(normalizeContent(BASE, TERMS, "phase-change"), normalizeContent(BASE, TERMS, null));
});

test("scope: fingerprints READS claim.scope — it wins over what the file would imply", () => {
  // The case that proves we read rather than derive: the field and the file DISAGREE, and the
  // field must win. Not hypothetical — §4a ranks spineRefs above file placement, so a
  // cross-chapter claim legitimately keeps its spine's scope while living in another file.
  const t = homographTerms();
  const text = "The cell stores energy.";
  const inBatteryFile = { locations: [{ file: "study-guide/battery.md" }] };
  const declared = fingerprints(claim(text, { scope: "biology", ...inBatteryFile }), t).content;

  assert.equal(
    declared,
    fingerprints(claim(text, { locations: [{ file: "study-guide/biology.md" }] }), t).content,
    "claim.scope must decide what the claim is about, not the file it happens to live in",
  );
  assert.notEqual(
    declared,
    fingerprints(claim(text, inBatteryFile), t).content,
    "...and it must override what the file would have implied",
  );
});

test("scope: an explicit null on the claim stays package-wide, no fallback to the file", () => {
  // `null` is a MEANINGFUL value (package-wide), not "missing". A `claim.scope ?? derive(...)`
  // read would silently re-derive here — for exactly the claims most likely to span chapters,
  // i.e. the worst possible set to re-open the divergence on.
  const t = homographTerms();
  const text = "The cell stores energy.";
  const inBiologyFile = { locations: [{ file: "study-guide/biology.md" }] };
  const packageWide = fingerprints(claim(text, { scope: null, ...inBiologyFile }), t).content;

  assert.equal(packageWide, fingerprints({ text }, t).content, "explicit null = unscoped");
  assert.notEqual(
    packageWide,
    fingerprints(claim(text, inBiologyFile), t).content,
    "an explicit null must not fall back to the biology file",
  );
});

test("scope: a claim with NO scope field still derives (compat fallback — §4a tier 2)", () => {
  const t = homographTerms();
  const text = "The cell stores energy.";
  const at = (file) => fingerprints(claim(text, { locations: [{ file }] }), t).content;

  // The same claim text in two chapters is two different claims.
  assert.notEqual(at("study-guide/battery.md"), at("study-guide/biology.md"));
  // The derivation is the BASENAME (the chapter slug), so the deliverable folder is irrelevant:
  // a claim restated in the practice set means what its chapter says it means.
  assert.equal(at("study-guide/battery.md"), at("practice/battery.md"));
  assert.equal(at("assessment-support/biology.md"), at("study-guide/biology.md"));

  // course-level, empty-location and location-less claims are package-wide -> null -> unscoped
  // (M1's first-match rule, which here is the battery "cell").
  const unscoped = fingerprints({ text }, t).content;
  assert.equal(at("concepts/course.md"), unscoped);
  assert.equal(at("index.md"), unscoped);
  assert.equal(fingerprints(claim(text, { locations: [] }), t).content, unscoped);
  assert.notEqual(unscoped, at("study-guide/biology.md"));
});

test("scope: the label layer is scope-aware too", () => {
  const t = homographTerms();
  const fp = (file) => fingerprints(claim("The cell stores energy.", {
    termRefs: ["cell"],
    locations: [{ file }],
  }), t).label;
  assert.notEqual(fp("study-guide/battery.md"), fp("study-guide/biology.md"));
});

test("scope: an off-map scope resolves nothing rather than guessing a chapter-local term", () => {
  const t = homographTerms();
  // "cell" is chapter-local to battery/biology; in an unknown scope M1 finds no in-scope term
  // and no course-wide fallback -> it stays a plain word. Honest beats confidently wrong.
  const unknown = normalizeContent("The cell stores energy.", t, "no-such-chapter");
  assert.match(unknown, /\bcell\b/);
  assert.doesNotMatch(unknown, /term\.cell/);
});

// --------------------------------------------------------------------------------------
// PURITY / DETERMINISM (interfaces §6.1 — the auditable impact path)
// --------------------------------------------------------------------------------------

test("deterministic: same input twice -> identical hashes", () => {
  const c = claim(BASE);
  assert.deepEqual(fingerprints(c, TERMS), fingerprints(c, TERMS));
  assert.deepEqual(fingerprints(claim(BASE), fixtureTerms()), fingerprints(claim(BASE), fixtureTerms()));
  assert.equal(normalizeContent(BASE, TERMS), normalizeContent(BASE, TERMS));
});

test("pure: fingerprints mutates neither the claim nor the registry", () => {
  const c = claim(BASE);
  const before = JSON.stringify({ c, TERMS });
  fingerprints(c, TERMS);
  assert.equal(JSON.stringify({ c, TERMS }), before);
});

test("hashes are hex sha-256 digests, one per required layer", () => {
  const fp = fingerprints(claim(BASE), TERMS);
  assert.deepEqual(Object.keys(fp).sort(), ["content", "format", "label", "provenance", "spine"]);
  for (const [layer, hex] of Object.entries(fp)) {
    assert.match(hex, /^[0-9a-f]{64}$/, `${layer} must be a hex sha-256 digest`);
  }
});

test("tolerant: a claim with no text/refs degrades, never crashes", () => {
  assert.doesNotThrow(() => fingerprints({}, TERMS));
  assert.doesNotThrow(() => fingerprints({ text: null }, { terms: [] }));
  assert.equal(normalizeContent(undefined, TERMS), "");
  assert.equal(normalizeContent("100 samples melted", undefined), "#100 melt sample");
});

test("a bare number keeps an unrecognized neighbour as a word, never as a unit", () => {
  // "100 samples" must not become #100:samples — guessing that an adjacent word is a unit is
  // how a value change hides behind a bogus unit token.
  assert.notEqual(contentOf("There are 100 samples."), contentOf("There are 100 flasks."));
  assert.notEqual(contentOf("There are 100 samples."), contentOf("There are 90 samples."));
});
