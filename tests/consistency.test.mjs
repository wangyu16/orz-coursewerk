// M6 consistency-scan tests — the undeclared-edge backstop (interfaces §3, spec §3 M6 / §10).
//
// The headline case is REAL and lives in the golden fixture: study-guide/phase-change.md and
// practice/phase-change.md BOTH state the melting point of water, with no edge between them.
// Half of these tests are false-positive tests, because a scan that cries wolf gets muted and
// then protects nobody — precision is tested as hard as recall.
//
// Free, deterministic, no network. Terms come from the real concept maps via M1's buildTerms.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addCandidate, buildTerms } from "../scripts/lib/terms.mjs";
import { scanConsistency } from "../scripts/lib/consistency.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = path.join(repo, "tests/fixtures/mini-package");
const read = (file) => fs.readFileSync(path.join(pkg, file), "utf8");

/** The golden fixture's concept maps, as buildTerms takes them. */
function fixtureTerms() {
  return buildTerms([
    { file: "concepts/course.md", text: read("concepts/course.md"), scope: "course" },
    {
      file: "concepts/phase-change.md",
      text: read("concepts/phase-change.md"),
      scope: "phase-change",
    },
  ]);
}

const FP = { format: "f", label: "l", content: "c", spine: "s", provenance: "p" };

/** A CLAIMS-shaped claim. `text` and `scope` are REQUIRED fields (schema; interfaces §4a). */
function claim(id, type, file, text, extra = {}) {
  return {
    id: `claim.${id}`,
    type,
    fingerprints: FP,
    locations: [{ file }],
    provenanceDeclared: true,
    spineRefs: ["concept.phase-change.1"],
    scope: "phase-change", // M2's, read verbatim — never re-derived here
    ...extra,
    text,
  };
}

/** The claims the fixture actually contains, with the answer key's value as a parameter. */
function meltingPointClaims(answerValue) {
  return [
    claim(
      "sg-mp",
      "fact",
      "study-guide/phase-change.md",
      "At standard pressure the melting point of water is 100 °C.",
    ),
    claim(
      "pr-mp",
      "answer-key",
      "practice/phase-change.md",
      `What is the melting point of water at standard pressure? **Answer:** ${answerValue}`,
    ),
  ];
}

test("HEADLINE: study guide 100 °C vs answer key 90 °C -> one value-disagreement", () => {
  const terms = fixtureTerms();
  const findings = scanConsistency({ schemaVersion: 1, claims: meltingPointClaims("90 °C") }, terms);

  assert.equal(findings.length, 1);
  const [f] = findings;
  assert.equal(f.kind, "value-disagreement");
  assert.deepEqual(f.claimIds, ["claim.pr-mp", "claim.sg-mp"]);

  // Evidence must be actionable WITHOUT opening the code: which files, which values, which term.
  const headline = f.evidence[0];
  assert.match(headline, /practice\/phase-change\.md asserts 90 °C/);
  assert.match(headline, /study-guide\/phase-change\.md asserts 100 °C/);
  assert.match(headline, /term\.melting-point/);
  assert.equal(f.evidence.length, 3); // headline + one line per claim
  assert.ok(f.evidence.every((e) => typeof e === "string" && e.length > 0));
});

test("PRECISION: agreement (both 100 °C) -> no finding", () => {
  const terms = fixtureTerms();
  assert.deepEqual(scanConsistency({ claims: meltingPointClaims("100 °C") }, terms), []);
});

test("agreement across units (100 °C vs 212 °F) -> no finding; normalization, not string compare", () => {
  const terms = fixtureTerms();
  assert.deepEqual(scanConsistency({ claims: meltingPointClaims("212 °F") }, terms), []);
});

test("alias recognition: 'melting point' vs the listed alias resolve to one subject and disagree", () => {
  const terms = fixtureTerms();
  const claims = [
    claim(
      "sg-mp",
      "fact",
      "study-guide/phase-change.md",
      "At standard pressure the melting point of water is 100 °C.",
    ),
    // "fusion point" is a declared alias in concepts/phase-change.md — same term, no termRefs,
    // so this goes through the text scan + M1 resolve.
    claim("pr-fp", "answer-key", "practice/phase-change.md", "The fusion point of water is 90 °C."),
  ];
  const findings = scanConsistency(claims, terms);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "value-disagreement");
  assert.deepEqual(findings[0].claimIds, ["claim.pr-fp", "claim.sg-mp"]);
  assert.match(findings[0].evidence[0], /term\.melting-point/);
});

test("alias recognition also holds for the second alias ('melting temperature')", () => {
  const terms = fixtureTerms();
  const claims = [
    claim("a", "fact", "study-guide/phase-change.md", "The melting point of water is 100 °C."),
    claim("b", "fact", "assessment-support/phase-change.md", "The melting temperature is 90 °C."),
  ];
  assert.equal(scanConsistency(claims, terms).length, 1);
});

test("definition-drift: one term defined two ways", () => {
  const terms = fixtureTerms();
  const claims = [
    claim(
      "def-a",
      "definition",
      "study-guide/phase-change.md",
      "The melting point is the temperature at which a solid becomes liquid.",
    ),
    claim(
      "def-b",
      "definition",
      "assessment-support/phase-change.md",
      "The melting point is the temperature at which a liquid becomes solid.",
    ),
  ];
  const findings = scanConsistency(claims, terms);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "definition-drift");
  assert.deepEqual(findings[0].claimIds, ["claim.def-a", "claim.def-b"]);
  assert.match(findings[0].evidence[0], /conflicting definitions of term\.melting-point/);
});

test("PRECISION: cosmetic-only definition differences (case, articles, markdown, alias) -> no drift", () => {
  const terms = fixtureTerms();
  const claims = [
    claim(
      "def-a",
      "definition",
      "study-guide/phase-change.md",
      "The melting point is the temperature at which a solid becomes liquid.",
    ),
    claim(
      "def-b",
      "definition",
      "concepts/phase-change.md",
      "**Fusion point** is the Temperature at which a solid becomes liquid",
    ),
  ];
  assert.deepEqual(scanConsistency(claims, terms), []);
});

test("ACCEPTED COST (non-flag 7): a meaning-preserving REPHRASE of a definition does surface", () => {
  // Documented and deliberate: deciding two wordings mean the same needs an LLM, and there is no
  // LLM in the index path. The scan folds only the provably cosmetic; a real rephrase ("X is Y"
  // vs "X: Y") is one look for the instructor, not a silent pass. This test pins that boundary
  // so a future "fix" has to argue with it rather than drift past it.
  const terms = fixtureTerms();
  const claims = [
    claim(
      "def-a",
      "definition",
      "study-guide/phase-change.md",
      "The melting point is the temperature at which a solid becomes liquid.",
    ),
    claim(
      "def-b",
      "definition",
      "concepts/phase-change.md",
      "**Melting point**: temperature at which a solid becomes liquid",
    ),
  ];
  assert.equal(scanConsistency(claims, terms).length, 1);
  assert.equal(scanConsistency(claims, terms)[0].kind, "definition-drift");
});

test("PRECISION: two legitimately-different quantities do not collide", () => {
  const terms = fixtureTerms();
  const claims = [
    // Different TERMS: melting point vs latent heat. Same package, unrelated numbers.
    claim("mp", "fact", "study-guide/phase-change.md", "The melting point of water is 100 °C."),
    claim("lh", "fact", "study-guide/phase-change.md", "The latent heat of fusion is 334 J/g."),
    // Same TERM, different DIMENSION: a temperature and an energy are different properties.
    claim("mp-e", "fact", "assessment-support/phase-change.md", "Melting point work: 6010 J."),
    // Unitless numbers are never compared (step numbers, chapter numbers, counts).
    claim("mp-n", "fact", "practice/phase-change.md", "The melting point is covered in 3 items."),
  ];
  assert.deepEqual(scanConsistency(claims, terms), []);
});

test("PRECISION: a worked example (derived/procedure) never fights a stated constant", () => {
  const terms = fixtureTerms();
  const claims = [
    claim("const", "fact", "study-guide/phase-change.md", "The melting point of water is 100 °C."),
    claim(
      "example",
      "derived",
      "study-guide/phase-change.md",
      "Worked example: a sample at the melting point of 90 °C would already be liquid.",
    ),
    claim(
      "proc",
      "procedure",
      "assessment-support/phase-change.md",
      "Heat the sample to the melting point, about 80 °C, and hold it.",
    ),
  ];
  assert.deepEqual(scanConsistency(claims, terms), []);
});

test("PRECISION: a range in one claim is not a disagreement, and does not poison the subject", () => {
  const terms = fixtureTerms();
  const claims = [
    claim("range", "fact", "study-guide/phase-change.md", "The melting point is 90 °C to 100 °C."),
    claim("exact", "answer-key", "practice/phase-change.md", "**Answer:** 100 °C melting point"),
  ];
  assert.deepEqual(scanConsistency(claims, terms), []);
});

test("PRECISION: an ambiguous multi-term claim is not attributed", () => {
  const terms = fixtureTerms();
  const claims = [
    claim("mp", "fact", "study-guide/phase-change.md", "The melting point of water is 100 °C."),
    // Names BOTH terms with no declaration: which term is 90 °C about? We do not guess.
    claim(
      "both",
      "fact",
      "assessment-support/phase-change.md",
      "The latent heat absorbed at the melting point is measured at 90 °C.",
    ),
  ];
  assert.deepEqual(scanConsistency(claims, terms), []);
});

test("declared-first: one termRef disambiguates a claim the text scan would refuse", () => {
  const terms = fixtureTerms();
  const claims = [
    claim("mp", "fact", "study-guide/phase-change.md", "The melting point of water is 100 °C.", {
      termRefs: ["term.melting-point"],
    }),
    claim(
      "both",
      "fact",
      "assessment-support/phase-change.md",
      "The latent heat absorbed at the melting point is measured at 90 °C.",
      { termRefs: ["term.melting-point"] },
    ),
  ];
  const findings = scanConsistency(claims, terms);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].claimIds, ["claim.both", "claim.mp"]);
});

test("PRECISION: an overridden claim is settled, not re-raised", () => {
  const terms = fixtureTerms();
  const claims = meltingPointClaims("90 °C").map((c, i) =>
    i === 1 ? { ...c, status: "overridden" } : c,
  );
  assert.deepEqual(scanConsistency(claims, terms), []);
});

test("candidate-status terms ARE scanned (detection from day one, spec §10 decision 3)", () => {
  // "supercooling" is nowhere in the concept map: an off-map term, registered as a candidate.
  const terms = addCandidate(fixtureTerms(), "supercooling", "phase-change");
  assert.equal(terms.terms.find((t) => t.id === "term.supercooling").status, "candidate");

  const claims = [
    claim("a", "fact", "study-guide/phase-change.md", "Supercooling persists down to -40 °C."),
    claim("b", "answer-key", "practice/phase-change.md", "Supercooling persists to -20 °C."),
  ];
  const findings = scanConsistency(claims, terms);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "value-disagreement");
  assert.match(findings[0].evidence[0], /term\.supercooling/);
});

test("both kinds at once: sorted, stable, and each finding well-formed", () => {
  const terms = fixtureTerms();
  const claims = [
    ...meltingPointClaims("90 °C"),
    claim(
      "def-a",
      "definition",
      "study-guide/phase-change.md",
      "Latent heat is energy absorbed during a phase change.",
    ),
    claim(
      "def-b",
      "definition",
      "assessment-support/phase-change.md",
      "Latent heat is energy released when a solid forms.",
    ),
  ];
  const findings = scanConsistency(claims, terms);
  assert.deepEqual(
    findings.map((f) => f.kind),
    ["definition-drift", "value-disagreement"], // sorted by kind
  );
  for (const f of findings) {
    assert.ok(f.claimIds.length >= 2);
    assert.deepEqual(f.claimIds, [...f.claimIds].sort()); // claimIds sorted
    assert.ok(Array.isArray(f.evidence) && f.evidence.length >= 1);
    assert.deepEqual(Object.keys(f).sort(), ["claimIds", "evidence", "kind"]);
  }
});

test("DETERMINISM: same input -> byte-identical output, whatever order the claims arrive in", () => {
  const terms = fixtureTerms();
  const claims = [
    ...meltingPointClaims("90 °C"),
    claim("sup-a", "fact", "a/x.md", "The latent heat is 334 J/g."),
    claim("sup-b", "fact", "b/y.md", "The latent heat is 300 J/g."),
    claim("def-a", "definition", "c/z.md", "Latent heat is energy absorbed during melting."),
    claim("def-b", "definition", "d/w.md", "Latent heat is energy released during melting."),
  ];
  const once = JSON.stringify(scanConsistency(claims, terms));
  assert.equal(JSON.stringify(scanConsistency(claims, terms)), once);
  assert.equal(JSON.stringify(scanConsistency([...claims].reverse(), terms)), once);
  // A fresh TERMS build must not move the output either.
  assert.equal(JSON.stringify(scanConsistency(claims, fixtureTerms())), once);
});

// --- scope is READ, never re-derived (interfaces §4a) -------------------------------------
// "latent heat" is declared ONLY in concepts/phase-change.md, so it resolves in scope
// "phase-change" and NOWHERE else (no course-wide fallback). That makes it the discriminator
// between reading claim.scope and re-deriving scope from spineRefs.

/** Two disagreeing latent-heat claims whose spineRefs point at a DIFFERENT chapter than scope. */
function latentHeatClaims(extra) {
  return [
    claim("lh-a", "fact", "study-guide/phase-change.md", "The latent heat of fusion is 334 J/g.", {
      spineRefs: ["concept.other-chapter.1"],
      ...extra,
    }),
    claim("lh-b", "answer-key", "practice/phase-change.md", "The latent heat of fusion is 300 J/g.", {
      spineRefs: ["concept.other-chapter.1"],
      ...extra,
    }),
  ];
}

test("claim.scope WINS over what spineRefs would imply — proves we read, not derive", () => {
  const terms = fixtureTerms();

  // M2 says "phase-change"; the spineRefs say "other-chapter". The field is authoritative.
  const findings = scanConsistency(latentHeatClaims({ scope: "phase-change" }), terms);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "value-disagreement");
  assert.match(findings[0].evidence[0], /term\.latent-heat/);

  // The discriminator: had we re-derived from spineRefs we'd have got "other-chapter", where
  // "latent heat" does not resolve at all — and this scan would have gone silent.
  assert.deepEqual(scanConsistency(latentHeatClaims({ scope: "other-chapter" }), terms), []);
});

test("scope: null stays package-wide and does NOT fall back to derivation", () => {
  const terms = fixtureTerms();

  // null is a decision M2 MADE (package-wide), not an absence: resolve in any scope.
  const findings = scanConsistency(latentHeatClaims({ scope: null }), terms);
  assert.equal(findings.length, 1);
  assert.match(findings[0].evidence[0], /term\.latent-heat/);

  // Contrast — the field ABSENT is the only case that may fall back (compatibility, not rule):
  // then spineRefs give "other-chapter" and the term does not resolve. Null must not take this
  // path; if it ever does, the test above goes silent and this one stops distinguishing.
  const legacy = latentHeatClaims({}).map(({ scope, ...rest }) => rest);
  assert.ok(!("scope" in legacy[0]));
  assert.deepEqual(scanConsistency(legacy, terms), []);
});

test("tolerant inputs: empty/odd shapes yield [] rather than throwing", () => {
  const terms = fixtureTerms();
  assert.deepEqual(scanConsistency([], terms), []);
  assert.deepEqual(scanConsistency({ claims: [] }, terms), []);
  assert.deepEqual(scanConsistency(undefined, terms), []);
  assert.deepEqual(scanConsistency({ claims: meltingPointClaims("90 °C") }, { terms: [] }), []);
  // A claim with no readable text is skipped, never guessed at.
  assert.deepEqual(
    scanConsistency([claim("t", "fact", "a.md", undefined), ...meltingPointClaims("100 °C")], terms),
    [],
  );
});
