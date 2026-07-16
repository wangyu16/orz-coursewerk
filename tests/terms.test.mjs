// M1 term-registry tests — parse convention (interfaces §1), id schemes (§2), signatures (§3).
// Free, deterministic, no network. Golden fixture: tests/fixtures/mini-package/concepts/.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addCandidate, buildTerms, resolve, setPreferred } from "../scripts/lib/terms.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const concepts = path.join(repo, "tests/fixtures/mini-package/concepts");
const read = (file) => fs.readFileSync(path.join(concepts, file), "utf8");

/** The golden fixture, as buildTerms takes it: [{file, text, scope}]. */
function fixtureMaps() {
  return [
    { file: "concepts/course.md", text: read("course.md"), scope: "course" },
    { file: "concepts/phase-change.md", text: read("phase-change.md"), scope: "phase-change" },
  ];
}

const termById = (terms, id) => terms.terms.find((t) => t.id === id);

test("buildTerms parses Key terms from the golden fixture: ids, aliases, gloss", () => {
  const terms = buildTerms(fixtureMaps());

  assert.equal(terms.schemaVersion, 1);
  assert.deepEqual(terms.generatedFrom, ["concepts/course.md", "concepts/phase-change.md"]);
  assert.deepEqual(
    terms.terms.map((t) => t.id).sort(),
    ["term.latent-heat", "term.melting-point"],
    "id scheme is term.<slug(preferredLabel)>",
  );

  const mp = termById(terms, "term.melting-point");
  assert.equal(mp.preferredLabel, "melting point");
  assert.equal(mp.canonical, "melting point");
  // Both maps declare it; aliases union, and the mid-list `aliases:` prefix is stripped.
  assert.deepEqual(mp.aliases, ["fusion point", "melting temperature"]);
  assert.equal(mp.gloss, "the temperature at which a solid becomes liquid");

  const lh = termById(terms, "term.latent-heat");
  assert.deepEqual(lh.aliases, [], "a term with no parenthetical has no aliases");
  assert.equal(lh.gloss, "energy absorbed during a phase change");
});

test("terms in the map are confirmed; off-map terms added later are candidates", () => {
  const terms = buildTerms(fixtureMaps());
  assert.ok(terms.terms.every((t) => t.status === "confirmed"));
  assert.ok(
    terms.terms.every((t) => t.lifecycle === "active"),
    "lifecycle is emitted explicitly, never left to the schema default",
  );

  const next = addCandidate(terms, "Enthalpy", "phase-change");
  const cand = termById(next, "term.enthalpy");
  assert.equal(cand.status, "candidate");
  assert.equal(cand.lifecycle, "active");
  assert.equal(cand.spineRef, undefined, "an off-map term has no authorized placement yet");
  assert.deepEqual(cand.scope, ["phase-change"]);
  assert.equal(termById(next, "term.melting-point").status, "confirmed", "confirmed is untouched");
  assert.equal(terms.terms.length, 2, "input is not mutated (pure)");

  // Idempotent: an already-resolving label registers nothing new.
  assert.equal(addCandidate(next, "enthalpy", "phase-change").terms.length, next.terms.length);
});

test("resolve is alias-aware and case-insensitive", () => {
  const terms = buildTerms(fixtureMaps());
  for (const label of ["melting point", "Melting Point", "MELTING POINT", "  melting   point "]) {
    assert.equal(resolve(terms, label), "term.melting-point", `case/space-insensitive: ${label}`);
  }
  assert.equal(resolve(terms, "fusion point"), "term.melting-point", "alias resolves");
  assert.equal(resolve(terms, "Melting Temperature"), "term.melting-point", "alias, case-insensitive");
  assert.equal(resolve(terms, "unobtainium"), null, "unknown label -> null");
  assert.equal(resolve(terms, ""), null);
});

test("resolve is scope-aware: in-scope wins, course-wide falls through, out-of-scope is null", () => {
  const terms = buildTerms(fixtureMaps());
  const mp = termById(terms, "term.melting-point");
  assert.deepEqual(mp.scope, ["course", "phase-change"], "scopes union across maps");

  assert.equal(resolve(terms, "melting point", "phase-change"), "term.melting-point");
  assert.equal(resolve(terms, "melting point", "some-other-chapter"), "term.melting-point",
    "a course-wide term applies everywhere");

  // latent heat is declared only in the phase-change map.
  assert.equal(resolve(terms, "latent heat", "phase-change"), "term.latent-heat");
  assert.equal(resolve(terms, "latent heat", "other-chapter"), null,
    "a chapter-scoped term does not resolve in another chapter");
  assert.equal(resolve(terms, "latent heat"), "term.latent-heat", "no scope -> any scope");

  // A candidate registered with no scope is global.
  const withGlobal = addCandidate(terms, "entropy");
  assert.equal(resolve(withGlobal, "entropy", "any-chapter"), "term.entropy");
});

test("setPreferred: RENAME = add-alias + set-preferred; the old label is NEVER deleted", () => {
  const terms = buildTerms([
    { file: "concepts/alkenes.md", text: "## Key terms\n- **ethylene** (aliases: ethene) — legacy name\n", scope: "alkenes" },
  ]);
  const id = "term.ethylene";
  assert.equal(resolve(terms, "ethylene"), id);

  const next = setPreferred(terms, id, "ethene");
  const t = termById(next, id);
  assert.equal(t.id, id, "the id is stable across a rename (interfaces §4)");
  assert.equal(t.preferredLabel, "ethene");
  assert.equal(t.canonical, "ethene");
  assert.ok(t.aliases.includes("ethylene"), "the OLD label survives as an alias, forever");
  assert.ok(!t.aliases.includes("ethene"), "the new preferred label is promoted out of aliases");

  // Both labels still resolve to the same node — legacy occurrences never break.
  assert.equal(resolve(next, "ethylene"), id);
  assert.equal(resolve(next, "Ethylene"), id);
  assert.equal(resolve(next, "ethene"), id);

  // The input is untouched, and a second rename keeps every prior label.
  assert.equal(termById(terms, id).preferredLabel, "ethylene", "pure: input unchanged");
  const third = setPreferred(next, id, "eth-1-ene");
  assert.deepEqual(third.terms[0].aliases.sort(), ["ethene", "ethylene"]);
  for (const label of ["ethylene", "ethene", "eth-1-ene"]) {
    assert.equal(resolve(third, label), id, `${label} still resolves after two renames`);
  }

  // Unknown id / empty label are no-ops, not crashes.
  assert.deepEqual(setPreferred(next, "term.nope", "x").terms, next.terms);
  assert.deepEqual(setPreferred(next, id, "   ").terms, next.terms);
});

test("tolerant: a missing or unknown section yields fewer terms, never a crash", () => {
  const noKeyTerms = buildTerms([
    { file: "concepts/bare.md", text: "# Concept Map — Bare\n\n## Objectives\n1. Do a thing.\n", scope: "bare" },
  ]);
  assert.deepEqual(noKeyTerms.terms, [], "no Key terms section -> no terms");

  const messy = buildTerms([
    {
      file: "concepts/messy.md",
      text: [
        "# Concept Map — Messy",
        "## Unknown section",
        "- **ignored** — not in a Key terms section",
        "## Key terms",
        "- no bold run here, so not a term",
        "prose line, not a list item",
        "- **Cas9**",
        "## Misconceptions to surface",
        "- Heat and temperature are the same.",
      ].join("\n"),
      scope: "messy",
    },
  ]);
  assert.deepEqual(messy.terms.map((t) => t.id), ["term.cas9"], "only well-formed Key terms entries");
  assert.deepEqual(messy.terms[0].aliases, []);

  // Degenerate inputs.
  assert.deepEqual(buildTerms([]).terms, []);
  assert.deepEqual(buildTerms(undefined).terms, []);
  assert.deepEqual(buildTerms([{ file: "concepts/empty.md", text: "" }]).terms, []);
});

test("spineRef: parsed from the explicit bracket, never guessed when absent", () => {
  const terms = buildTerms([
    {
      file: "concepts/crispr.md",
      text: [
        "# Concept Map — CRISPR",
        "## Concept sequence",
        // A sentence mentioning "Cas9" — the trap. Label-matching would bind Cas9 to it.
        "1. Cas9 cuts DNA at a site set by the guide RNA.",
        "2. A protospacer adjacent motif licenses the cut.",
        "## Key terms",
        "- **PAM** (protospacer adjacent motif) — the motif adjacent to the target [concept.crispr.5]",
        "- **guide RNA** [objective.crispr.2]",
        "- **Cas9** — the nuclease",
      ].join("\n"),
      scope: "crispr",
    },
  ]);

  assert.equal(termById(terms, "term.pam").spineRef, "concept.crispr.5", "concept.* bracket");
  assert.equal(termById(terms, "term.guide-rna").spineRef, "objective.crispr.2",
    "objective.* bracket, with no gloss or aliases on the line");
  assert.equal(termById(terms, "term.cas9").spineRef, undefined,
    "no bracket -> unset, even though a Concept sequence sentence mentions the label");

  // The bracket is lifted off the tail — it must not leak into the gloss.
  assert.equal(termById(terms, "term.pam").gloss, "the motif adjacent to the target");
  assert.equal(termById(terms, "term.guide-rna").gloss, undefined);

  // A non-spine bracket is prose, not a placement we can vouch for.
  const other = buildTerms([
    { file: "concepts/x.md", text: "## Key terms\n- **osmosis** — see [Wikipedia] and [note.4]\n", scope: "x" },
  ]);
  assert.equal(termById(other, "term.osmosis").spineRef, undefined, "only concept.*/objective.* count");
});

test("aliases + gloss + spineRef on one line all parse together", () => {
  const terms = buildTerms([
    {
      file: "concepts/alkenes.md",
      text: "## Key terms\n- **ethene** (aliases: ethylene, ethene gas) — the IUPAC-preferred name [concept.alkenes.1]\n",
      scope: "alkenes",
    },
  ]);
  const t = termById(terms, "term.ethene");
  assert.equal(t.preferredLabel, "ethene");
  assert.deepEqual(t.aliases, ["ethylene", "ethene gas"]);
  assert.equal(t.gloss, "the IUPAC-preferred name");
  assert.equal(t.spineRef, "concept.alkenes.1");
  assert.equal(t.status, "confirmed");
  assert.equal(t.lifecycle, "active");
  assert.equal(resolve(terms, "ethylene", "alkenes"), "term.ethene");
});

test("lifecycle is orthogonal to status: deprecated-but-teach is STILL confirmed", () => {
  // The latent bug the flat enum caused: a naive status==="confirmed" check read false for an
  // instructor-authored term, so M5 would mis-flag it as an orphan.
  const built = buildTerms([
    { file: "concepts/alkenes.md", text: "## Key terms\n- **ethylene** — legacy name [concept.alkenes.1]\n", scope: "alkenes" },
  ]);
  const deprecated = {
    ...built,
    terms: [{ ...built.terms[0], lifecycle: "deprecated-but-teach" }],
  };

  const t = deprecated.terms[0];
  assert.equal(t.status, "confirmed", "it is in the map, so it is authorized — full stop");
  assert.equal(t.lifecycle, "deprecated-but-teach");
  assert.ok(t.spineRef, "an authorized term keeps its spine parent -> not an orphan");

  // It must still resolve: students meet the old word in the literature.
  assert.equal(resolve(deprecated, "ethylene", "alkenes"), "term.ethylene");

  // Both axes survive the operations, independently.
  const renamed = setPreferred(deprecated, "term.ethylene", "ethene");
  assert.equal(renamed.terms[0].status, "confirmed");
  assert.equal(renamed.terms[0].lifecycle, "deprecated-but-teach", "a rename is not a retirement");
  assert.ok(renamed.terms[0].aliases.includes("ethylene"));

  const withCand = addCandidate(deprecated, "carbocation", "alkenes");
  assert.equal(withCand.terms[0].lifecycle, "deprecated-but-teach", "untouched by an unrelated add");
  assert.equal(withCand.terms[1].status, "candidate");
  assert.equal(withCand.terms[1].lifecycle, "active");
});

test("deterministic: the same input builds an identical registry", () => {
  const a = buildTerms(fixtureMaps());
  const b = buildTerms(fixtureMaps());
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b), "byte-stable serialization (key order fixed)");

  // Derived operations are deterministic too.
  assert.equal(
    JSON.stringify(setPreferred(addCandidate(a, "Enthalpy", "course"), "term.melting-point", "fusion point")),
    JSON.stringify(setPreferred(addCandidate(b, "Enthalpy", "course"), "term.melting-point", "fusion point")),
  );
});
