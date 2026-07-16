// M2 claim-extractor + claim-identity tests (interfaces §2, §3, §4, §4a; spec §3 M2 / §10 dec. 1).
//
// M2 is the PRODUCER of the claim record: `scope`, `text` and `provenanceDeclared` exist nowhere
// else, and four downstream modules will faithfully repeat whatever this module writes. So these
// tests are written to DEFEND the contract, not to exercise it — every assertion that pins a
// derived fact is paired with the value a WRONG implementation would have produced, asserted NOT
// to appear. A test that only checks the right answer cannot tell a right implementation from a
// lucky one.
//
// The discriminator used throughout is REAL, and it comes from the golden fixture: **"latent heat"
// is declared ONLY in concepts/phase-change.md**, so it resolves in scope "phase-change" and
// NOWHERE else — there is no course-wide fallback to mask a scope mistake. "melting point", by
// contrast, is declared course-wide and resolves from anywhere, so it can hide one. Every scope
// test that must bite therefore uses latent heat.
//
// Free, deterministic, no network. Terms come from the real concept maps via M1's buildTerms;
// packages are copies of the golden fixture in a temp dir, so no fixture file is ever modified.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTerms, setPreferred } from "../scripts/lib/terms.mjs";
import { fingerprints } from "../scripts/lib/fingerprint.mjs";
import { extractClaims, matchClaims } from "../scripts/lib/claims.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(repo, "tests/fixtures/mini-package");
const read = (file) => fs.readFileSync(path.join(fixture, file), "utf8");

/** The golden fixture's concept maps, as buildTerms takes them. */
function fixtureTerms() {
  return buildTerms([
    { file: "concepts/course.md", text: read("concepts/course.md"), scope: "course" },
    { file: "concepts/phase-change.md", text: read("concepts/phase-change.md"), scope: "phase-change" },
  ]);
}

const tmpDirs = [];
after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * A copy of the golden fixture with files overlaid (null = delete). The fixture itself is never
 * touched — other modules' tests read it.
 */
function makePackage(overlay = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-claims-"));
  tmpDirs.push(dir);
  fs.cpSync(fixture, dir, { recursive: true });
  for (const [rel, content] of Object.entries(overlay)) {
    const abs = path.join(dir, rel);
    if (content === null) {
      fs.rmSync(abs, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
  }
  return dir;
}

/** Front matter carrying declarations (structural, never inline in student-facing prose). */
const frontMatter = (claims) => `---\n${JSON.stringify({ claims })}\n---\n`;

/** A study guide whose "Melting point of water" and "Latent heat" bodies are parameters. */
const studyGuide = ({ head = "", mp = "At standard pressure the melting point of water is 100 °C.", lh = "The latent heat of fusion of water is 334 J/g." } = {}) =>
  `${head}# Phase Change

## Objectives
1. State the melting point of water at standard pressure.
2. Explain why temperature is constant during a phase change.

## Melting point of water
${mp}

## Latent heat
${lh}
`;

const at = (claims, file, anchor) =>
  claims.find((c) => c.locations[0].file === file && c.locations[0].anchor === anchor);

const SG = "study-guide/phase-change.md";
const MP_ANCHOR = "melting-point-of-water#1";
const LH_ANCHOR = "latent-heat#1";

// --- the golden fixture, end to end ----------------------------------------------------------

test("GOLDEN: the fixture's high-stakes blocks are indexed, and only those", () => {
  const { schemaVersion, claims } = extractClaims(fixture, fixtureTerms());
  assert.equal(schemaVersion, 1);

  // Deterministic emission order (file, then anchor) and exactly the structural claims:
  //   the practice answer key, the study guide's stated fact, and its two objectives.
  assert.deepEqual(
    claims.map((c) => [c.locations[0].file, c.locations[0].anchor, c.type]),
    [
      ["practice/phase-change.md", "practice-phase-change#1", "answer-key"],
      [SG, MP_ANCHOR, "fact"],
      [SG, "objectives#1", "objective"],
      [SG, "objectives#2", "objective"],
    ],
  );

  // NOT indexed, and each absence is a designed refusal, not an oversight:
  const files = new Set(claims.map((c) => c.locations[0].file));
  //  * connective prose with no quantity carries no declaration duty (spec §10 decision 1);
  assert.equal(at(claims, SG, LH_ANCHOR), undefined);
  //  * the quoted source sentence is prose, not a quantity-bearing fact;
  assert.equal(at(claims, SG, "melting-point-of-water#2"), undefined);
  //  * assessment-support's table row asserts no quantity and carries no answer marker;
  assert.ok(!files.has("assessment-support/phase-change.md"));
  //  * and the CONCEPT MAP is never mined for claims — it is the spine, not an artifact that
  //    asserts. Mining it would give the package's own authority a second, competing voice.
  assert.ok(![...files].some((f) => f.startsWith("concepts/")));
});

test("every claim conforms to claims.schema.json — required fields present, no strays", () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(repo, "system/schemas/package/claims.schema.json"), "utf8"),
  );
  const item = schema.properties.claims.items;
  const allowed = new Set(Object.keys(item.properties));
  const { claims } = extractClaims(fixture, fixtureTerms());
  assert.ok(claims.length > 0);

  for (const claim of claims) {
    for (const req of item.required) {
      assert.ok(req in claim, `missing required field ${req} on ${claim.id}`);
    }
    for (const key of Object.keys(claim)) {
      assert.ok(allowed.has(key), `stray field ${key} (schema is additionalProperties:false)`);
    }
    assert.match(claim.id, new RegExp(item.properties.id.pattern));
    assert.ok(item.properties.type.enum.includes(claim.type));
    assert.ok(claim.scope === null || typeof claim.scope === "string");
    assert.ok(claim.locations.length >= 1);
    const locProps = item.properties.locations.items;
    const locAllowed = new Set(Object.keys(locProps.properties));
    for (const loc of claim.locations) {
      for (const req of locProps.required) assert.ok(req in loc);
      for (const key of Object.keys(loc)) assert.ok(locAllowed.has(key), `stray location field ${key}`);
      assert.equal(typeof loc.file, "string");
      // Optional in the schema only so an in-memory claim stays valid; a location pointing at a
      // real file MUST carry one, or M9's immutable check reads "no offset" and refuses every edit.
      assert.ok(Number.isInteger(loc.offset) && loc.offset >= locProps.properties.offset.minimum);
    }
    assert.deepEqual(
      Object.keys(claim.fingerprints).sort(),
      ["content", "format", "label", "provenance", "spine"],
    );
  }
  assert.equal(new Set(claims.map((c) => c.id)).size, claims.length, "ids must be unique");
});

test("`text` is REQUIRED and carries the asserted prose — the input M3 hashes", () => {
  const terms = fixtureTerms();
  const { claims } = extractClaims(fixture, terms);
  for (const claim of claims) {
    assert.equal(typeof claim.text, "string");
    assert.ok(claim.text.trim().length > 0, `${claim.id} has no prose to fingerprint`);
  }

  const fact = at(claims, SG, MP_ANCHOR);
  assert.equal(fact.text, "At standard pressure the melting point of water is 100 °C.");
  // The prose must be the claim's OWN block, not the file and not the section: the whole point of
  // claim-level granularity is that a one-fact edit does not dirty its neighbours.
  assert.ok(!fact.text.includes("Latent heat"));
  assert.ok(!fact.text.includes("As the source states"));

  // And it must be the text M3 actually hashed — a `text` the fingerprints did not see would make
  // every downstream change signal a fiction.
  assert.deepEqual(fingerprints(fact, terms), fact.fingerprints);
});

// --- §4a: scope, derived ONCE, here ----------------------------------------------------------

test("§4a tier 1: the SPINE beats file placement (latent heat is the discriminator)", () => {
  const terms = fixtureTerms();
  const declare = (spineRefs) =>
    makePackage({
      [SG]: studyGuide({
        head: frontMatter([{ type: "fact", anchor: LH_ANCHOR, spineRefs, sourceRefs: [] }]),
      }),
    });

  // The claim SITS IN study-guide/phase-change.md but its spine says other-chapter. §4a: the spine
  // is the instructor's own structure, so it WINS.
  const away = at(extractClaims(declare(["concept.other-chapter.1"]), terms).claims, SG, LH_ANCHOR);
  assert.equal(away.scope, "other-chapter");
  // The negative: file placement (tier 2) would have said "phase-change". It must not.
  assert.notEqual(away.scope, "phase-change");
  // …and this is observable, not cosmetic: "latent heat" is declared ONLY in the phase-change map,
  // so out of that scope it does not resolve at all and the claim's vocabulary is honestly empty.
  assert.deepEqual(away.termRefs, []);

  // Same file, same block, spine pointing home: the term resolves and the vocabulary appears.
  const home = at(extractClaims(declare(["concept.phase-change.2"]), terms).claims, SG, LH_ANCHOR);
  assert.equal(home.scope, "phase-change");
  assert.deepEqual(home.termRefs, ["term.latent-heat"]);
});

test("§4a tier 1: the FIRST matching spineRef wins, including `course`", () => {
  const terms = fixtureTerms();
  const root = makePackage({
    [SG]: studyGuide({
      head: frontMatter([
        // Sorted spineRefs put concept.course.1 first; §4a takes the first MATCHING entry.
        { type: "fact", anchor: MP_ANCHOR, spineRefs: ["concept.course.1", "concept.phase-change.9"] },
        // A non-spine ref must not be mistaken for one: `src.*` matches neither namespace.
        { type: "fact", anchor: LH_ANCHOR, spineRefs: ["src.wiki.melting.rev1", "objective.phase-change.2"] },
      ]),
    }),
  });
  const { claims } = extractClaims(root, terms);
  assert.equal(at(claims, SG, MP_ANCHOR).scope, "course");
  assert.notEqual(at(claims, SG, MP_ANCHOR).scope, "phase-change");
  // Tier 1 skips the unmatchable ref rather than giving up on the spine (which would fall to the
  // file and coincidentally agree here — the reason the assertion below is on the tier, not the value).
  assert.equal(at(claims, SG, LH_ANCHOR).scope, "phase-change");
  assert.deepEqual(at(claims, SG, LH_ANCHOR).spineRefs, ["objective.phase-change.2", "src.wiki.melting.rev1"]);
});

test("§4a tier 2: a chapter artifact takes its chapter's scope, via the concept-map convention", () => {
  const { claims } = extractClaims(fixture, fixtureTerms());
  const fact = at(claims, SG, MP_ANCHOR);
  assert.deepEqual(fact.spineRefs, []); // no spine => tier 1 cannot fire; tier 2 is what answered
  assert.equal(fact.scope, "phase-change");
  assert.notEqual(fact.scope, null); // tier 3 (package-wide) would be the wrong answer here

  // It is the CONCEPT MAP that makes "phase-change" a chapter, not the basename. Remove the map
  // and the same file's basename must stop being treated as a scope no map ever declared.
  const orphaned = extractClaims(makePackage({ "concepts/phase-change.md": null }), fixtureTerms());
  assert.equal(at(orphaned.claims, SG, MP_ANCHOR).scope, null);
});

test("§4a tier 3: null is an ANSWER (package-wide), and course.md is not a chapter", () => {
  const terms = fixtureTerms();
  const root = makePackage({
    // No concepts/appendix.md exists, so "appendix" is not a chapter slug.
    "study-guide/appendix.md": "# Appendix\n\n## Constants\nThe melting point of water is 100 °C.\n",
  });
  const claim = at(extractClaims(root, terms).claims, "study-guide/appendix.md", "constants#1");
  assert.equal(claim.scope, null);
  // The negative: a basename-trusting tier 2 would have invented "appendix" — a scope no concept
  // map declares, against which every term in the file would silently resolve.
  assert.notEqual(claim.scope, "appendix");
  // `null` is meaningful, not missing: the field is PRESENT, so consumers branch on `in`, not `??`.
  assert.ok("scope" in claim);

  // concepts/course.md is the COURSE map (interfaces §1), so a course-level artifact is
  // package-wide rather than scoped to a chapter called "course".
  const courseish = makePackage({ "study-guide/course.md": "# Course\n\n## Facts\nWater melts at 0 °C.\n" });
  assert.equal(at(extractClaims(courseish, terms).claims, "study-guide/course.md", "facts#1").scope, null);
});

// --- declared-first ---------------------------------------------------------------------------

test("DECLARED BEATS SCAN: a declaration is authoritative and is never overwritten", () => {
  const terms = fixtureTerms();
  const root = makePackage({
    [SG]: studyGuide({
      head: frontMatter([
        {
          // The scan would call this quantity-bearing block a `fact`. The generator says it is a
          // `definition`. The generator wrote it, and it wins.
          type: "definition",
          anchor: MP_ANCHOR,
          spineRefs: ["concept.phase-change.1"],
          sourceRefs: ["src.wiki.melting.rev1"],
        },
      ]),
    }),
  });
  const { claims } = extractClaims(root, terms);

  const declared = at(claims, SG, MP_ANCHOR);
  assert.equal(declared.provenanceDeclared, true);
  assert.equal(declared.type, "definition");
  assert.notEqual(declared.type, "fact"); // the scan's answer must not survive the declaration
  assert.deepEqual(declared.spineRefs, ["concept.phase-change.1"]);
  assert.deepEqual(declared.sourceRefs, ["src.wiki.melting.rev1"]);

  // Exactly ONE claim at the anchor: the scan must not shadow the declaration with a rival node.
  assert.equal(claims.filter((c) => c.locations[0].anchor === MP_ANCHOR).length, 1);

  // …and the backstop still runs on every OTHER block, marked as scan-found. `provenanceDeclared`
  // is the only field that separates the two paths — a scan-found claim is a first-class claim
  // (spec §10 decision 1: index + WARN, never hard-fail).
  const scanned = at(claims, SG, "objectives#1");
  assert.equal(scanned.provenanceDeclared, false);
  assert.equal(scanned.type, "objective");
});

test("the SCAN never invents a spineRef or a sourceRef — an orphan is honest, a guess is not", () => {
  const { claims } = extractClaims(fixture, fixtureTerms());
  for (const claim of claims) {
    assert.equal(claim.provenanceDeclared, false);
    assert.deepEqual(claim.spineRefs, []);
    assert.deepEqual(claim.sourceRefs, []);
  }
  // The trap, spelled out: the study guide's `## Objectives` list is item-for-item the concept
  // map's, so item n "obviously" maps to objective.phase-change.n. A guide may reorder or subset
  // them, and then M5's orphan analysis trusts a parent nobody authored. No parent is honest.
  const first = at(claims, SG, "objectives#1");
  assert.ok(!first.spineRefs.includes("objective.phase-change.1"));
});

test("a sidecar is the artifact's declaration authority; front matter is not merged into it", () => {
  const terms = fixtureTerms();
  const root = makePackage({
    [SG]: studyGuide({
      head: frontMatter([{ type: "procedure", anchor: MP_ANCHOR, spineRefs: ["concept.phase-change.9"] }]),
    }),
    "metadata/claims/study-guide/phase-change.json": JSON.stringify({
      schemaVersion: 1,
      claims: [{ type: "definition", anchor: MP_ANCHOR, spineRefs: ["concept.phase-change.1"] }],
    }),
  });
  const claim = at(extractClaims(root, terms).claims, SG, MP_ANCHOR);
  // One artifact, one declaration authority: unioning the two would let them disagree about a
  // single anchor and leave this module picking a winner.
  assert.equal(claim.type, "definition");
  assert.notEqual(claim.type, "procedure");
  assert.deepEqual(claim.spineRefs, ["concept.phase-change.1"]);
});

// --- §4: claim identity ------------------------------------------------------------------------

/** The fixture's fact claim, extracted from a package built with the given study-guide body. */
function factClaim(mp, terms = fixtureTerms()) {
  return at(extractClaims(makePackage({ [SG]: studyGuide({ mp }) }), terms).claims, SG, MP_ANCHOR);
}

test("§4: a REPHRASE keeps the id (and moves `format`, proving the claim really changed)", () => {
  const before = factClaim("At standard pressure the melting point of water is 100 °C.");
  const after = factClaim("The melting point of water, at standard pressure, is 100 °C.");

  assert.equal(after.id, before.id);
  // The pairing: a claim whose text is genuinely different must still be the SAME claim. If the id
  // were keyed on prose (or on `content`, or on `format`), this would be add+remove — and every
  // review of the edit would lose the thread of the claim it was convened to review.
  assert.notEqual(after.fingerprints.format, before.fingerprints.format);
});

test("§4: a VALUE CHANGE keeps the id — it is still 'the melting point of water'", () => {
  const before = factClaim("At standard pressure the melting point of water is 100 °C.");
  const after = factClaim("At standard pressure the melting point of water is 90 °C.");

  assert.equal(after.id, before.id);
  // THE point of the system: content moved (that is the change signal), identity did not. Keying
  // identity on content would delete the claim and mint a stranger on exactly the edit that matters.
  assert.notEqual(after.fingerprints.content, before.fingerprints.content);

  const diff = matchClaims([before], [after]);
  assert.deepEqual(diff.matched, [{ oldId: before.id, newId: after.id }]);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
});

test("§4: a RENAME keeps the id — even though M3's `label` fingerprint moves (the hard one)", () => {
  const before = factClaim("At standard pressure the melting point of water is 100 °C.");

  // RENAME = add-alias + set-preferred (M1): "melting point" -> "fusion point", id NOT re-minted.
  const renamed = setPreferred(fixtureTerms(), "term.melting-point", "fusion point");
  const after = factClaim("At standard pressure the fusion point of water is 100 °C.", renamed);

  assert.equal(after.id, before.id, "a terminology migration must not orphan the claim it renames");
  assert.deepEqual(after.termRefs, before.termRefs); // the id never moves: M1 never re-mints it
  // The pairing, and the reason this test exists: M3's `label` layer MOVES on a rename BY DESIGN
  // (§5 — otherwise the RENAME action is unreachable). So §4's match key CANNOT be that
  // fingerprint, or a rename would report as add+remove and §4's own rename row would be dead.
  // Identity is keyed on the rename-INVARIANT projection (term ids) instead. See CONTRACT
  // CONCERNS #1 in lib/claims.mjs.
  assert.notEqual(after.fingerprints.label, before.fingerprints.label);

  const diff = matchClaims([before], [after]);
  assert.deepEqual(diff.matched, [{ oldId: before.id, newId: after.id }]);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.added, []);
});

test("§2 fileQualifiedAnchor: the SAME heading in two artifacts gives two DIFFERENT ids", () => {
  // The collision §2 now forbids. `## Objectives` exists in study-guide/ch3.md AND practice/ch3.md
  // in every real package, so a bare `shortHash(anchor + identityLabel)` merges two distinct claims
  // into ONE node — a granularity defect in the module built to fix granularity defects, and
  // silent: the index would contain one claim where the package makes two.
  const terms = fixtureTerms();
  const sameSection = "# Ch\n\n## Objectives\n1. State the melting point of water at standard pressure.\n";
  const root = makePackage({
    [SG]: sameSection,
    "practice/phase-change.md": sameSection,
    "assessment-support/phase-change.md": null,
  });
  const { claims } = extractClaims(root, terms);

  // Same heading, same ordinal, same prose, same vocabulary, same (absent) spine: EVERY component
  // of the key except the file is identical. The file is the only thing keeping them apart.
  const sg = at(claims, SG, "objectives#1");
  const pr = at(claims, "practice/phase-change.md", "objectives#1");
  assert.ok(sg && pr);
  assert.equal(sg.text, pr.text);
  assert.deepEqual(sg.termRefs, pr.termRefs);
  assert.deepEqual(sg.fingerprints, pr.fingerprints); // even the hashes agree — they must not save us

  assert.notEqual(sg.id, pr.id);
  assert.equal(claims.length, 2, "two artifacts asserting it = two claims, never one merged node");

  // …and they must not match each other across versions either: a claim in the study guide is not
  // the same claim as one in the practice set, however identically it reads.
  const diff = matchClaims([sg], [pr]);
  assert.deepEqual(diff.matched, []);
  assert.deepEqual(diff.added, [pr.id]);
  assert.deepEqual(diff.removed, [sg.id]);
});

test("§4: unmatched new = added, unmatched old = removed — both reported", () => {
  const before = extractClaims(fixture, fixtureTerms());
  const after = extractClaims(
    makePackage({ "study-guide/appendix.md": "# Appendix\n\n## Constants\nWater boils at 100 °C.\n" }),
    fixtureTerms(),
  );

  const diff = matchClaims(before, after);
  const added = after.claims.find((c) => c.locations[0].file === "study-guide/appendix.md");
  assert.deepEqual(diff.added, [added.id]);
  assert.deepEqual(diff.removed, []);
  assert.equal(diff.matched.length, before.claims.length);

  // …and the mirror image. A removal must be as visible as an addition: an unreported removal is a
  // dependent left pointing at a claim that no longer exists.
  const back = matchClaims(after, before);
  assert.deepEqual(back.removed, [added.id]);
  assert.deepEqual(back.added, []);
});

test("§4: a SPLIT is flagged AND still reported as add+remove — never silently dropped", () => {
  const terms = fixtureTerms();
  const spine = ["concept.phase-change.1"];
  // One section stating both phase points…
  const one = makePackage({
    [SG]: `${frontMatter([{ type: "fact", anchor: "phase-points#1", spineRefs: spine }])}# Phase Change

## Phase points
At standard pressure water melts at 0 °C and boils at 100 °C.
`,
  });
  // …becomes two sections, one claim each, under the SAME spine node.
  const two = makePackage({
    [SG]: `${frontMatter([
      { type: "fact", anchor: "melting#1", spineRefs: spine },
      { type: "fact", anchor: "boiling#1", spineRefs: spine },
    ])}# Phase Change

## Melting
At standard pressure water melts at 0 °C.

## Boiling
At standard pressure water boils at 100 °C.
`,
  });

  const before = extractClaims(one, terms).claims.filter((c) => c.provenanceDeclared);
  const after = extractClaims(two, terms).claims.filter((c) => c.provenanceDeclared);
  assert.equal(before.length, 1);
  assert.equal(after.length, 2);

  const diff = matchClaims(before, after);
  assert.equal(diff.split.length, 1);
  assert.deepEqual(diff.split[0].spineRef, "concept.phase-change.1");
  assert.deepEqual(diff.split[0].from, before.map((c) => c.id).sort());
  assert.deepEqual(diff.split[0].to, after.map((c) => c.id).sort());
  assert.deepEqual(diff.merged, []);

  // The flag is an ANNOTATION over the honest report, not a substitute for it. §4: "do not silently
  // drop". A reader who only knows about `added`/`removed` must still see everything.
  assert.deepEqual(diff.removed, before.map((c) => c.id).sort());
  assert.deepEqual(diff.added, after.map((c) => c.id).sort());

  // Reverse the direction and the same event is a MERGE — n old, 1 new, one spine node.
  const back = matchClaims(after, before);
  assert.equal(back.merged.length, 1);
  assert.deepEqual(back.merged[0].from, after.map((c) => c.id).sort());
  assert.deepEqual(back.merged[0].to, before.map((c) => c.id).sort());
  assert.deepEqual(back.split, []);
  assert.deepEqual(back.removed, after.map((c) => c.id).sort());
  assert.deepEqual(back.added, before.map((c) => c.id).sort());
});

// --- the refusals: ambiguity is reported, never resolved by picking a winner --------------------

test("REFUSAL: 2-old + 2-new under one spineRef is NOT attributed as a split or a merge", () => {
  const terms = fixtureTerms();
  const spine = ["concept.phase-change.1"];
  const pkg = (mp, lh) =>
    extractClaims(
      makePackage({
        [SG]: studyGuide({
          head: frontMatter([
            { type: "fact", anchor: MP_ANCHOR, spineRefs: spine },
            { type: "fact", anchor: LH_ANCHOR, spineRefs: spine },
          ]),
          mp,
          lh,
        }),
      }),
      terms,
    ).claims.filter((c) => c.provenanceDeclared);

  // Both claims lose their vocabulary, so both keys move: 2 removed + 2 added on one spine node.
  const before = pkg("The melting point of water is 100 °C.", "The latent heat of fusion is 334 J/g.");
  const after = pkg("Water reaches 0 °C.", "Fusion needs 334 J/g.");

  const diff = matchClaims(before, after);
  assert.equal(diff.removed.length, 2);
  assert.equal(diff.added.length, 2);
  // Which new claim descends from which old one is unknowable from the key. A pairing here would be
  // a fabrication placed in front of an instructor with the index's authority attached.
  assert.deepEqual(diff.split, []);
  assert.deepEqual(diff.merged, []);
});

test("REFUSAL: unspined (scan-found) claims are never paired into a split or a merge", () => {
  const terms = fixtureTerms();
  const before = extractClaims(fixture, terms);
  const after = extractClaims(
    makePackage({ [SG]: studyGuide({ mp: "Water melts at 0 °C." }) }),
    terms,
  );

  const diff = matchClaims(before, after);
  assert.ok(diff.removed.length > 0 && diff.added.length > 0); // the fact claim lost its term
  // An empty spineRef is not a SHARED parent — it is the absence of one. Pairing on it would marry
  // every unrelated scan-found addition to every unrelated scan-found removal.
  assert.deepEqual(diff.split, []);
  assert.deepEqual(diff.merged, []);
});

test("REFUSAL: an unknown declared `type` is skipped, never coerced to the nearest enum member", () => {
  const terms = fixtureTerms();
  const root = makePackage({
    [SG]: studyGuide({
      head: frontMatter([
        { type: "assertion", anchor: MP_ANCHOR, spineRefs: ["concept.phase-change.1"] },
        { type: "fact", anchor: LH_ANCHOR, spineRefs: ["concept.phase-change.2"] },
      ]),
    }),
  });
  const { claims } = extractClaims(root, terms);

  // claims.schema.json's enum is closed; coercing would emit a type nobody chose. The block falls
  // through to the SCAN instead — indexed and visible, honestly marked undeclared.
  const fell = at(claims, SG, MP_ANCHOR);
  assert.equal(fell.type, "fact");
  assert.equal(fell.provenanceDeclared, false);
  assert.deepEqual(fell.spineRefs, []); // the rejected declaration's spine is NOT half-adopted
  // The well-formed declaration alongside it is unaffected — one bad entry is not a file-wide veto.
  assert.equal(at(claims, SG, LH_ANCHOR).provenanceDeclared, true);
});

test("REFUSAL: a DANGLING declared anchor yields no claim — we do not invent the prose it named", () => {
  const terms = fixtureTerms();
  const root = makePackage({
    [SG]: studyGuide({
      head: frontMatter([{ type: "fact", anchor: "melting-point-of-water#99", spineRefs: ["concept.phase-change.1"] }]),
    }),
  });
  const { claims } = extractClaims(root, terms);
  assert.equal(at(claims, SG, "melting-point-of-water#99"), undefined);
  assert.ok(claims.every((c) => c.text.trim().length > 0));
  // KNOWN GAP, reported not routed around (CONTRACT CONCERNS #2): the generator declared a
  // high-stakes fact and the index contains nothing about it — an ABSENCE reads as "nothing to
  // review", the silent direction. `extractClaims`'s frozen return has nowhere to say so; the
  // dangling anchor belongs to the M11 gate, beside §5b's "spineRef target exists".
  assert.equal(claims.filter((c) => c.provenanceDeclared).length, 0);
});

test("REFUSAL: a second declaration for one anchor is a conflict, not a merge — the first stands", () => {
  const terms = fixtureTerms();
  const root = makePackage({
    [SG]: studyGuide({
      head: frontMatter([
        { type: "fact", anchor: MP_ANCHOR, spineRefs: ["concept.phase-change.1"] },
        { type: "procedure", anchor: MP_ANCHOR, spineRefs: ["concept.phase-change.9"] },
      ]),
    }),
  });
  const claims = extractClaims(root, terms).claims.filter((c) => c.locations[0].anchor === MP_ANCHOR);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].type, "fact");
  assert.notEqual(claims[0].type, "procedure");
  assert.deepEqual(claims[0].spineRefs, ["concept.phase-change.1"]);
});

// --- locations[].offset: derived once, here, in M8's units -------------------------------------
// M8 indexes immutable regions as half-open CHARACTER intervals into the file as read; M9 compares
// a claim's offset against them, and that comparison is what stops a rename rewriting the inside of
// a quotation. So the offset is not a convenience field: it is the only thing standing between an
// automatic edit and a fabricated quotation, and an offset in the wrong frame of reference is worse
// than none — it points confidently at the wrong text.

/** THE INVARIANT: a claim's text is the file's text at its offset. Nothing may break this. */
function assertOffsetInvariant(root, claim) {
  const loc = claim.locations[0];
  assert.equal(typeof loc.offset, "number", `${claim.id} has no offset to compare against M8`);
  assert.ok(Number.isInteger(loc.offset) && loc.offset >= 0);
  const fileText = fs.readFileSync(path.join(root, loc.file), "utf8");
  assert.equal(
    fileText.slice(loc.offset, loc.offset + claim.text.length),
    claim.text,
    `${claim.id}: offset does not address its own text`,
  );
}

test("OFFSET: every location that points at a file carries one, and it addresses the claim's text", () => {
  const { claims } = extractClaims(fixture, fixtureTerms());
  for (const claim of claims) assertOffsetInvariant(fixture, claim);

  // Two claims in one file get distinct, individually correct offsets — the granularity fix is
  // meaningless if every claim in a file points at the same place.
  const inSg = claims.filter((c) => c.locations[0].file === SG);
  assert.ok(inSg.length >= 2);
  assert.equal(new Set(inSg.map((c) => c.locations[0].offset)).size, inSg.length);
  // The negative that matters: not 0, and not the top of the file. An offset that defaults to 0 is
  // indistinguishable from an absent one and would silently point every claim at the H1.
  assert.ok(inSg.every((c) => c.locations[0].offset > 0));
});

test("OFFSET: it is in M8's units — CHARACTER indices, which non-ASCII chemistry text discriminates", () => {
  const terms = fixtureTerms();
  // "°" is 2 bytes in UTF-8 but 1 JS character, and it precedes the latent-heat block. A byte
  // offset would be plausible, wrong, and drift further with every degree sign in the file.
  const root = makePackage({ [SG]: studyGuide({ mp: "Water melts at 0 °C and boils at 100 °C — a 100 °C span." }) });
  const claim = at(extractClaims(root, terms).claims, SG, LH_ANCHOR);
  assertOffsetInvariant(root, claim);

  const fileText = fs.readFileSync(path.join(root, SG), "utf8");
  assert.notEqual(
    Buffer.byteLength(fileText.slice(0, claim.locations[0].offset), "utf8"),
    claim.locations[0].offset,
    "the fixture must actually discriminate bytes from characters, or this test proves nothing",
  );
});

test("OFFSET: two IDENTICAL sentences in one file get two DIFFERENT offsets", () => {
  // The case a search-based locator gets wrong. M9 must never recover an offset by searching the
  // file for `claim.text`: indexOf would hand both claims the FIRST occurrence, and an edit
  // intended for the second would land on the first — silently, and with the index's authority.
  const terms = fixtureTerms();
  const line = "The melting point of water is 100 °C.";
  const root = makePackage({ [SG]: studyGuide({ mp: line, lh: line }) });
  const claims = extractClaims(root, terms).claims.filter((c) => c.text === line);

  assert.equal(claims.length, 2);
  const offsets = claims.map((c) => c.locations[0].offset);
  assert.notEqual(offsets[0], offsets[1]);
  for (const claim of claims) assertOffsetInvariant(root, claim);
  // …and the two are distinct claims, not one deduplicated node.
  assert.equal(new Set(claims.map((c) => c.id)).size, 2);
});

test("OFFSET: it addresses the file AS READ — front matter is not indexed, but it IS counted", () => {
  const terms = fixtureTerms();
  const head = frontMatter([{ type: "fact", anchor: MP_ANCHOR, spineRefs: ["concept.phase-change.1"] }]);
  const root = makePackage({ [SG]: studyGuide({ head }) });
  const claim = at(extractClaims(root, terms).claims, SG, MP_ANCHOR);

  // M8 is handed the file as read, so M2 must speak in that same frame. Parsing the body while
  // reporting body-relative offsets would shift every claim by the front matter's length.
  assertOffsetInvariant(root, claim);
  assert.ok(claim.locations[0].offset > head.length);
  // The declaration block itself is never a claim: it declares, it does not assert.
  assert.ok(extractClaims(root, terms).claims.every((c) => !c.text.includes('"anchor"')));
});

test("OFFSET: it moves when the file moves, but it is NOT part of identity", () => {
  const terms = fixtureTerms();
  const before = extractClaims(makePackage(), terms);
  // Insert prose ABOVE the fact: every later offset shifts, no claim's meaning changes.
  const shifted = makePackage({
    [SG]: read(SG).replace("## Melting point of water\n", "## Melting point of water\nA short lead-in sentence.\n\n"),
  });
  const after = extractClaims(shifted, terms);

  const oldFact = at(before.claims, SG, MP_ANCHOR);
  const newFact = at(after.claims, SG, "melting-point-of-water#2"); // the lead-in took #1
  assert.ok(newFact.locations[0].offset > oldFact.locations[0].offset);
  assertOffsetInvariant(shifted, newFact);

  // The claims whose anchors did NOT move keep their ids even though their offsets did — an offset
  // in the identity key would make a one-line insertion delete and re-mint every claim below it.
  const objective = at(after.claims, SG, "objectives#1");
  const oldObjective = at(before.claims, SG, "objectives#1");
  assert.equal(objective.id, oldObjective.id);
  assert.equal(objective.locations[0].offset, oldObjective.locations[0].offset);

  const lh = at(extractClaims(makePackage({ [SG]: studyGuide({ lh: "Fusion needs 334 J/g." }) }), terms).claims, SG, LH_ANCHOR);
  assert.ok(lh.locations[0].offset > 0);
});

// --- tolerance and determinism -----------------------------------------------------------------

test("TOLERANT: malformed declarations and missing folders degrade to the scan, never a crash", () => {
  const terms = fixtureTerms();

  // Front matter that is not JSON: we do not guess at what was meant — the file falls to the scan.
  const notJson = makePackage({ [SG]: studyGuide({ head: "---\nclaims: maybe?\n---\n" }) });
  const scanned = extractClaims(notJson, terms).claims;
  assert.ok(scanned.length > 0);
  assert.ok(scanned.every((c) => c.provenanceDeclared === false));
  // The front matter itself must not become a claim: it is a declaration, not an assertion.
  assert.ok(scanned.every((c) => !c.text.includes("claims: maybe?")));

  // An empty / half-written package yields fewer nodes, never an exception (interfaces §1).
  const bare = makePackage({ [SG]: null, "practice/phase-change.md": null });
  assert.deepEqual(extractClaims(bare, terms).claims, []);
  assert.deepEqual(extractClaims(path.join(os.tmpdir(), "cw-claims-does-not-exist"), terms), {
    schemaVersion: 1,
    claims: [],
  });
  // A package with no vocabulary at all still indexes its claims — honestly, with no termRefs.
  const noTerms = extractClaims(fixture, { terms: [] }).claims;
  assert.equal(noTerms.length, 4);
  assert.ok(noTerms.every((c) => c.termRefs.length === 0));

  assert.deepEqual(matchClaims(undefined, undefined), {
    matched: [],
    added: [],
    removed: [],
    split: [],
    merged: [],
  });
});

test("DETERMINISM: the same package always produces a byte-identical CLAIMS artifact", () => {
  const once = JSON.stringify(extractClaims(fixture, fixtureTerms()));
  assert.equal(JSON.stringify(extractClaims(fixture, fixtureTerms())), once);
  // A fresh copy of the same bytes at a different path must not move a single id — a claim a human
  // acted on has to be reproducible from the inputs alone, months later, from git.
  assert.equal(JSON.stringify(extractClaims(makePackage(), fixtureTerms())), once);

  // matchClaims is likewise order-independent: a diff of two runs must show only real change.
  const a = extractClaims(fixture, fixtureTerms());
  const b = extractClaims(makePackage({ [SG]: studyGuide({ mp: "The melting point of water is 90 °C." }) }), fixtureTerms());
  const diff = JSON.stringify(matchClaims(a, b));
  assert.equal(JSON.stringify(matchClaims(a.claims, b.claims)), diff);
  assert.equal(
    JSON.stringify(matchClaims({ claims: [...a.claims].reverse() }, { claims: [...b.claims].reverse() })),
    diff,
  );
});

test("a whitespace-only edit moves NOTHING — not a fingerprint, not an id (the #1 requirement)", () => {
  const terms = fixtureTerms();
  const before = extractClaims(makePackage(), terms);
  const reflowed = read("study-guide/phase-change.md").replace(
    "At standard pressure the melting point of water is 100 °C.",
    "At standard pressure the melting point of water\nis   100 °C.",
  );
  const after = extractClaims(makePackage({ [SG]: reflowed }), terms);

  const diff = matchClaims(before, after);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
  assert.equal(diff.matched.length, before.claims.length);
  // Spec §1's headline goal, asserted at the layer that produces the signal: zero flags.
  for (const [i, claim] of before.claims.entries()) {
    assert.deepEqual(after.claims[i].fingerprints, claim.fingerprints, `${claim.id} moved on whitespace`);
  }
});
