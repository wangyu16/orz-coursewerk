// M1 term-registry tests — parse convention (interfaces §1), id schemes (§2), signatures (§3).
// Free, deterministic, no network. Golden fixture: tests/fixtures/mini-package/concepts/.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addCandidate, buildTerms, buildTermsReport, resolve, setPreferred } from "../scripts/lib/terms.mjs";

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

// =================================================================================================
// THE ID IS MINTED ONCE (interfaces §2, amended 2026-07-17) — `priorTerms` and the rename.
//
// This is the block that makes the terminology-migration (IUPAC) case reachable. Every test here is
// paired with its negative, because every property in it has an opposite failure that is worse than
// the one it prevents: an id that always holds is a silent merge; an id that never holds is the
// defect this fixed. `setPreferred` above is the SAME operation reached from the API; these are it
// reached from the map, which is the only path an instructor actually has (spec §10 dec. 3(c)).
// =================================================================================================

/** One `## Key terms` map, the shape buildTerms takes. */
const map = (text, scope = "alkenes", file = "concepts/alkenes.md") => [
  { file, text: `## Key terms\n${text}\n`, scope },
];

test("§2 rename: a map entry overlapping ONE prior term keeps its id — and the label still moves", () => {
  const first = buildTerms(map("- **ethylene** (aliases: ethene) — legacy name"));
  assert.equal(first.terms[0].id, "term.ethylene", "first sight: minted from the label at birth");

  // The rename, made the only way an instructor can make one: in the map, keeping the old label as
  // an alias (§1's grammar guarantees the hinge, so the overlap exists by construction).
  const renamed = buildTerms(map("- **ethene** (aliases: ethylene) — the IUPAC-preferred name"), first);
  assert.equal(renamed.terms.length, 1, "a rename is one term, not two");
  const t = renamed.terms[0];

  // IDENTITY HELD — the half M2's `identityLabel` needs.
  assert.equal(t.id, "term.ethylene", "the id is a HISTORICAL ARTIFACT and is never re-minted");
  // THE CHANGE IS OBSERVABLE — the half M3's `label` fingerprint needs. Both, or it is half a fix
  // (§4b: an identity key and a change signal have opposite requirements over one projection).
  assert.equal(t.preferredLabel, "ethene", "the map is the authority for the LABEL");
  assert.equal(t.canonical, "ethene");
  assert.deepEqual(t.aliases, ["ethylene"], "the old label is demoted to an alias, never deleted");
  assert.equal(t.gloss, "the IUPAC-preferred name", "the gloss follows the map too");

  // THE NEGATIVE: without `priorTerms` the very same map re-mints the id — the measured defect,
  // preserved here as the thing the second argument prevents.
  assert.equal(
    buildTerms(map("- **ethene** (aliases: ethylene) — the IUPAC-preferred name")).terms[0].id,
    "term.ethene",
    "no prior -> the id is re-minted from the new label: exactly the defect §2 was amended to fix",
  );

  // Legacy occurrences keep resolving through the rename — the reason the old label is kept.
  assert.equal(resolve(renamed, "ethylene", "alkenes"), "term.ethylene");
  assert.equal(resolve(renamed, "ethene", "alkenes"), "term.ethylene");

  // Rebuilding this registry over itself is a no-op: a reindex must never churn an id.
  assert.deepEqual(buildTerms(map("- **ethene** (aliases: ethylene)"), renamed).terms[0].id, "term.ethylene");
});

test("§2: a genuinely NEW term still mints a fresh id, and a retired id is never recycled", () => {
  const prior = buildTerms(map("- **ethylene** (aliases: ethene)"));
  const next = buildTerms(map("- **ethylene** (aliases: ethene)\n- **carbocation** — a cationic intermediate"), prior);
  assert.deepEqual(next.terms.map((t) => t.id), ["term.ethylene", "term.carbocation"]);
  assert.equal(next.terms[1].status, "confirmed", "it is in the map, so it is authorized");

  // THE NEGATIVE, and it is the one with the long fuse: a term whose label overlaps NOTHING must
  // never inherit an id, and must never be handed a RETIRED one either. `term.ethylene` is gone
  // from this map, but reusing its id for an unrelated term would leave M2's `identityLabel`
  // unmoved while the vocabulary under it changed meaning — a silent merge across time.
  const recycled = buildTerms(map("- **Ethylene!** — a different term that happens to slug the same"), prior);
  assert.equal(recycled.terms.length, 1);
  assert.notEqual(recycled.terms[0].id, "term.ethylene", "a retired id is not recycled");
  assert.equal(recycled.terms[0].id, "term.ethylene-2");
});

test("§2: the old label DELETED rather than demoted is a remove + an add, NOT a rename", () => {
  const prior = buildTerms(map("- **ethylene** — legacy name"));
  // The author deletes the old label instead of keeping it as an alias. There is no overlap, so
  // there is no evidence of continuity — and §2 is explicit: this is not a rename. Rescuing it with
  // similarity matching ("ethylene" ~ "ethene") is the fabrication this project refuses everywhere
  // else; the honest report is a term that went away and a term that arrived.
  const next = buildTerms(map("- **ethene** — the IUPAC-preferred name"), prior);
  assert.deepEqual(next.terms.map((t) => t.id), ["term.ethene"], "a fresh id: this is an ADD");
  assert.equal(next.terms.some((t) => t.id === "term.ethylene"), false, "and the old term is a REMOVE");
  assert.equal(resolve(next, "ethylene", "alkenes"), null, "the deleted label resolves to nothing");

  // THE NEGATIVE, one character apart: demote the same label instead of deleting it and it IS a
  // rename. The grammar is the whole difference, which is why §1's hinge is load-bearing.
  assert.equal(buildTerms(map("- **ethene** (ethylene)"), prior).terms[0].id, "term.ethylene");
});

test("§2: overlapping TWO prior terms is AMBIGUOUS — resolve nothing, merge nothing, REPORT", () => {
  // Two distinct prior teachings that happen to share a label with one new entry. Which one does it
  // continue? Nothing in the map says, so nothing may be assumed: a silent merge would fold two
  // teachings into one node and every downstream check would then ENFORCE the merge, which §2 calls
  // worse than a missed rename. A missed rename costs an add + a remove the instructor can see.
  const prior = buildTerms(
    map("- **ethylene** (aliases: olefin)\n- **propylene** (aliases: olefin) — the C3 alkene"),
  );
  assert.deepEqual(prior.terms.map((t) => t.id), ["term.ethylene", "term.propylene"]);

  const report = buildTermsReport(map("- **olefin** (aliases: ethylene, propylene) — the merged entry?"), prior);
  // REFUSED: a fresh id, so neither prior term's identity is claimed...
  assert.deepEqual(report.terms.terms.map((t) => t.id), ["term.olefin"]);
  // ...and REPORTED, as a field. A refusal reported by absence is indistinguishable from "there was
  // nothing to resolve" — the silence §5b's declaration-refusal row exists to close.
  assert.equal(report.ambiguous.length, 1);
  assert.equal(report.ambiguous[0].preferredLabel, "olefin");
  assert.deepEqual(report.ambiguous[0].candidates, ["term.ethylene", "term.propylene"]);
  assert.match(report.ambiguous[0].reason, /overlaps 2 prior terms/);
  assert.deepEqual(report.ambiguous[0].scopes, ["alkenes"]);

  // THE NEGATIVE: the unambiguous case reports NOTHING. An "ambiguity" channel that fires on every
  // build is alarm fatigue wearing a refusal's badge, and it would make the field unreadable.
  assert.deepEqual(buildTermsReport(map("- **ethene** (ethylene)"), buildTerms(map("- **ethylene**"))).ambiguous, []);
  assert.deepEqual(buildTermsReport(map("- **ethylene**")).ambiguous, [], "a first build refuses nothing");
});

test("§2: a SPLIT is not a merge — the entry still carrying the prior's label keeps the id", () => {
  // One prior term, two entries that descend from it and declare NO shared label: the author split
  // it. Resolving both to the prior id would be the silent merge §2 forbids, arrived at from the
  // other direction. So the entry that still carries the prior's own preferred label continues its
  // identity, and the other is what it says it is — a new term.
  //
  // The prior is declared in BOTH maps, exactly as the golden fixture declares "melting point" — a
  // course-wide term restated in a chapter. That is what makes the partial-rename half below the
  // fixture's REAL case rather than a hypothetical: the term is in scope for both maps, so both
  // entries can reach it.
  const prior = buildTerms([
    { file: "concepts/course.md", text: "## Key terms\n- **ethylene** (ethene)\n", scope: "course" },
    { file: "concepts/alkenes.md", text: "## Key terms\n- **ethylene** (aliases: ethene)\n", scope: "alkenes" },
  ]);
  assert.deepEqual(prior.terms[0].scope, ["course", "alkenes"], "one term, two scopes — the fixture's shape");

  const split = buildTerms(map("- **ethylene** — the IUPAC name\n- **ethene** — the trivial name"), prior);
  assert.deepEqual(split.terms.map((t) => t.id), ["term.ethylene", "term.ethene"], "two terms, not one");
  assert.equal(split.terms[0].preferredLabel, "ethylene", "the continuing term is unchanged");

  // THE NEGATIVE, and it is the fixture's own case: when the two entries DO share a label, the map
  // is declaring them to be ONE term under two preferred labels (a rename made in a chapter map
  // while the course map still declares the old label). Then they merge, and the label the map
  // MOVED to wins — the prior's label is the status quo, and a declaration that differs from it is
  // the new information. Order-independent: reading it off file order would make an id depend on a
  // filename, and `concepts/course.md` sorts before every chapter by accident, not by authority.
  const partial = buildTerms(
    [
      { file: "concepts/course.md", text: "## Key terms\n- **ethylene** (ethene)\n", scope: "course" },
      { file: "concepts/alkenes.md", text: "## Key terms\n- **ethene** (ethylene, ethene gas)\n", scope: "alkenes" },
    ],
    prior,
  );
  assert.deepEqual(partial.terms.map((t) => t.id), ["term.ethylene"], "one term: the map says they overlap");
  assert.equal(partial.terms[0].preferredLabel, "ethene", "the map MOVED to `ethene`; `ethylene` is the status quo");
  assert.deepEqual(partial.terms[0].aliases, ["ethylene", "ethene gas"], "every declared label survives");
  assert.deepEqual(partial.terms[0].scope, ["course", "alkenes"]);
});

test("§2: two competing new preferred labels for one prior term is AMBIGUOUS", () => {
  // Both entries claim the same prior term AND overlap each other, but they disagree about what the
  // term is now called. There is no rename target to pick, so there is none to guess.
  const prior = buildTerms([
    { file: "concepts/a.md", text: "## Key terms\n- **ethylene** (aliases: olefin)\n", scope: "a" },
    { file: "concepts/b.md", text: "## Key terms\n- **ethylene** (aliases: olefin)\n", scope: "b" },
  ]);
  const report = buildTermsReport(
    [
      { file: "concepts/a.md", text: "## Key terms\n- **ethene** (olefin)\n", scope: "a" },
      { file: "concepts/b.md", text: "## Key terms\n- **eth-1-ene** (olefin)\n", scope: "b" },
    ],
    prior,
  );
  assert.equal(report.ambiguous.length, 1);
  assert.match(report.ambiguous[0].reason, /2 competing new preferred labels/);
  assert.deepEqual(report.terms.terms.map((t) => t.id), ["term.ethene", "term.eth-1-ene"], "fresh ids, nothing merged");
  assert.equal(report.terms.terms.some((t) => t.id === "term.ethylene"), false, "the prior id is claimed by neither");
});

test("§2: SCOPE is respected — a homograph in another chapter is NOT the same term", () => {
  // M1's scope rule is what stops one word meaning one thing package-wide. A prior term declared
  // ONLY in chapter-2 cannot lend its id to a chapter-3 entry that happens to share a label — that
  // would be the silent mis-identification the scope rule exists to prevent, laundered through the
  // id scheme.
  const prior = buildTerms(map("- **bond** — a shared electron pair", "chapter-2", "concepts/chapter-2.md"));
  assert.deepEqual(prior.terms[0].scope, ["chapter-2"]);

  const elsewhere = buildTerms(map("- **bond** — a debt security", "chapter-3", "concepts/chapter-3.md"), prior);
  assert.notEqual(elsewhere.terms[0].id, "term.bond", "a chapter-local homograph does not inherit");
  assert.equal(elsewhere.terms[0].id, "term.bond-2");

  // THE NEGATIVE: the SAME chapter does inherit, and so does a course-wide prior term — a
  // course-level term applies everywhere, which is `resolve`'s own precedence and not a second rule.
  assert.equal(buildTerms(map("- **bond**", "chapter-2", "concepts/chapter-2.md"), prior).terms[0].id, "term.bond");
  const courseWide = buildTerms(map("- **bond**", "course", "concepts/course.md"));
  assert.equal(buildTerms(map("- **bond**", "chapter-9", "concepts/chapter-9.md"), courseWide).terms[0].id, "term.bond");
});

test("§2: no priorTerms => today's behavior, exactly; a rebuild over an unchanged map is a no-op", () => {
  // BACKWARD COMPATIBILITY, asserted as an identity rather than described. A first build cannot
  // change: every package that predates the stored registry must index exactly as it did.
  const maps = fixtureMaps();
  const fresh = buildTerms(maps);
  assert.equal(JSON.stringify(buildTerms(maps, undefined)), JSON.stringify(fresh), "undefined prior = first build");
  assert.equal(JSON.stringify(buildTerms(maps, null)), JSON.stringify(fresh), "null prior = first build");
  assert.equal(
    JSON.stringify(buildTerms(maps, { schemaVersion: 1, terms: [] })),
    JSON.stringify(fresh),
    "an EMPTY registry is a value, not an absence — and it inherits nothing",
  );

  // IDEMPOTENCE, which is what `reindex` twice being a no-op reduces to.
  assert.equal(JSON.stringify(buildTerms(maps, fresh)), JSON.stringify(fresh), "rebuild over itself: byte-identical");
  assert.equal(
    JSON.stringify(buildTerms(maps, buildTerms(maps, fresh))),
    JSON.stringify(fresh),
    "and again — an id must never drift under repeated reindexing",
  );
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

  // Same maps + same prior -> byte-identical registry. This is the property the whole delta rests
  // on, and it now has a second input, so it is asserted over that input too.
  const renamedMaps = fixtureMaps().map((m) => ({
    ...m,
    text: m.text.replace("**melting point** (fusion point,", "**fusion point** (aliases: melting point,"),
  }));
  assert.equal(JSON.stringify(buildTerms(renamedMaps, a)), JSON.stringify(buildTerms(renamedMaps, b)));

  // And the rename reached the fixture the same way it reaches the package: the id held, the label
  // moved. `setPreferred` reached from the API and a map edit reached through `priorTerms` now
  // agree — which is the point of the fix. §4b's rename-invariance held only via `setPreferred`,
  // and NOTHING PERSISTED THAT CALL; the map edit is the path an instructor actually has.
  const viaMap = buildTerms(renamedMaps, a).terms.find((t) => t.id === "term.melting-point");
  const viaApi = setPreferred(a, "term.melting-point", "fusion point").terms.find((t) => t.id === "term.melting-point");
  assert.equal(viaMap.preferredLabel, "fusion point");
  assert.equal(viaApi.preferredLabel, "fusion point");
  // Compared as SETS, and the difference is worth naming rather than hiding: alias ORDER is
  // first-seen, and the two paths see the labels in different orders (the map reads them off the
  // line; `setPreferred` appends the demoted label to the end). The set is the contract — nothing
  // reads alias order — so asserting the order would pin an implementation detail as if it were one.
  assert.deepEqual([...viaMap.aliases].sort(), [...viaApi.aliases].sort(), "one rename, two paths, one vocabulary");
});
