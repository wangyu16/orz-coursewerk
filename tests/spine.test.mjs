// M13 spine-producer tests — the namespace six modules point into, and nothing produced.
//
// The tests are written as a DEFENSE of one property above all others: the spine is the
// instructor's authority, so a node this module mints that the instructor did not write is not
// a bug, it is a forgery — and it is invisible downstream, because every consumer's job is to
// TRUST a spineRef that resolves. So the anti-fabrication test is FIRST, and every positive
// assertion is paired with its negative: it is not enough that the right nodes appear, the
// wrong ones must be provably absent.
//
// Free, deterministic, no network. The golden fixture (tests/fixtures/mini-package/concepts/)
// is READ-ONLY — other modules' tests depend on it byte-for-byte; every filesystem test builds
// its own package under mkdtemp and removes it.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSpine,
  danglingSpineRefs,
  hasSpineNode,
  readConceptMaps,
  spineNode,
} from "../scripts/lib/spine.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const concepts = path.join(repo, "tests/fixtures/mini-package/concepts");
const read = (file) => fs.readFileSync(path.join(concepts, file), "utf8");

/** The golden fixture, as buildSpine takes it (the same shape M1's buildTerms takes). */
function fixtureMaps() {
  return [
    { file: "concepts/course.md", text: read("course.md"), scope: "course" },
    { file: "concepts/phase-change.md", text: read("phase-change.md"), scope: "phase-change" },
  ];
}

const ids = (spine, kind) =>
  spine.nodes.filter((n) => !kind || n.kind === kind).map((n) => n.id);

/** Build a throwaway package; the callback gets its root. Never touches the fixture. */
function withPackage(files, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cw-spine-"));
  try {
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    }
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// --- THE ANTI-FABRICATION TEST (first, because it is the one that matters) -------------------

test("a map missing a section yields FEWER nodes and never an invented one", () => {
  // Everything a heuristic would love: an h1 title, prose that names concepts, a bulleted
  // Summary, an unknown section full of list items, and a `## Key terms` list (M1's, not ours).
  // The map declares exactly ONE spine section. It must yield exactly ONE spine node.
  const text = [
    "# Concept Map — Sparse",
    "",
    "## Source and scope",
    "Adapts an article about melting and boiling.",
    "",
    "## Summary",
    "- Students should learn what a phase change is.",
    "- Students should be able to state the melting point of water.",
    "",
    "## Concept sequence",
    "1. A solid melts at a characteristic temperature.",
    "",
    "## Key terms",
    "- **melting point** — temperature at which a solid becomes liquid",
    "",
    "## Further reading",
    "- Something about latent heat.",
  ].join("\n");

  const spine = buildSpine([{ file: "concepts/sparse.md", text, scope: "sparse" }]);

  // `chapter.sparse` is NOT an inference: the chapter is the FILE, which exists (§2). Every
  // other node here would have to be read out of prose, and none is.
  assert.deepEqual(
    ids(spine),
    ["chapter.sparse", "concept.sparse.1"],
    "one declared section, one node — plus the chapter the file itself is",
  );
  // The negatives, one per thing a helpful parser would have invented:
  assert.deepEqual(ids(spine, "objective"), [], "no Objectives section => NO objective nodes");
  assert.deepEqual(
    ids(spine, "misconception"),
    [],
    "no Misconceptions section => NO misconception nodes",
  );
  assert.equal(hasSpineNode(spine, "objective.sparse.1"), false, "not invented from Summary");
  assert.equal(hasSpineNode(spine, "concept.sparse.2"), false, "not invented from prose");
  assert.equal(hasSpineNode(spine, "term.melting-point"), false, "Key terms is M1's, not ours");
  assert.deepEqual(spine.prerequisites, [], "no Prerequisites section => no records");
  // ...and the one it DID declare is still there. A refusal that refuses everything is not a
  // refusal, it is a broken parser.
  assert.equal(spineNode(spine, "concept.sparse.1").label, "A solid melts at a characteristic temperature.");
});

test("an empty map, and a map with no scope, yield no nodes and no crash", () => {
  // An EMPTY chapter map still mints its `chapter.<slug>` — the chapter is the file's existence,
  // not a reading of its contents — and nothing else. Zero sections, zero content nodes.
  assert.deepEqual(ids(buildSpine([{ file: "concepts/x.md", text: "", scope: "x" }])), ["chapter.x"]);
  assert.deepEqual(buildSpine([]).nodes, []);
  assert.deepEqual(buildSpine(undefined).nodes, []);

  // No scope => no id in §2's scheme => no node, not even a chapter. NOT a guessed scope.
  const text = "## Concept sequence\n1. A solid melts.\n";
  const unscoped = buildSpine([{ file: "concepts/mystery.md", text }]);
  assert.deepEqual(unscoped.nodes, [], "unscoped map mints nothing");
  assert.equal(hasSpineNode(unscoped, "chapter.mystery"), false, "not even the chapter is guessed");
  assert.equal(hasSpineNode(unscoped, "concept.mystery.1"), false, "scope NOT taken from the filename here");
  // ...while the same text WITH a scope does mint — proving the refusal is the scope, not the text.
  assert.equal(
    hasSpineNode(buildSpine([{ file: "concepts/mystery.md", text, scope: "mystery" }]), "concept.mystery.1"),
    true,
  );
});

// --- §1's sections against the golden fixture ------------------------------------------------

test("each §1 section yields its nodes with §2's ids and 1-based ordinals", () => {
  const spine = buildSpine(fixtureMaps());

  assert.equal(spine.schemaVersion, 1);
  assert.deepEqual(spine.generatedFrom, ["concepts/course.md", "concepts/phase-change.md"]);
  assert.deepEqual(spine.chapters, ["phase-change"], "course is not a chapter");

  assert.deepEqual(ids(spine), [
    "chapter.phase-change",
    "concept.course.1",
    "concept.course.2",
    "concept.phase-change.1",
    "concept.phase-change.2",
    "misconception.phase-change.1",
    "objective.phase-change.1",
    "objective.phase-change.2",
  ]);

  const o1 = spineNode(spine, "objective.phase-change.1");
  assert.deepEqual(
    { kind: o1.kind, scope: o1.scope, ordinal: o1.ordinal, negative: o1.negative, file: o1.file },
    { kind: "objective", scope: "phase-change", ordinal: 1, negative: false, file: "concepts/phase-change.md" },
  );
  assert.equal(o1.label, "State the melting point of water at standard pressure.");
  assert.equal(spineNode(spine, "objective.phase-change.2").ordinal, 2, "ordinals are 1-based and ascending");
  assert.equal(hasSpineNode(spine, "objective.phase-change.0"), false, "NOT 0-based");
  assert.equal(hasSpineNode(spine, "objective.phase-change.3"), false, "two items, two ordinals");

  assert.equal(
    spineNode(spine, "concept.phase-change.2").label,
    "Energy absorbed during melting does not raise temperature.",
  );
});

test("misconceptions are NEGATIVE claims and say so on the node", () => {
  const spine = buildSpine(fixtureMaps());
  const m = spineNode(spine, "misconception.phase-change.1");

  assert.equal(m.label, "Temperature always rises when heat is added.");
  assert.equal(m.negative, true, "a misconception asserts the OPPOSITE of what it reads as");
  // Emitted on EVERY node, never left to an absent-field default (M1's `lifecycle` lesson).
  assert.equal(spineNode(spine, "concept.phase-change.1").negative, false);
  assert.ok(spine.nodes.every((n) => typeof n.negative === "boolean"), "explicit on every node");
});

test("course.md nodes land in the course scope, under the SAME grammar as a chapter", () => {
  const spine = buildSpine(fixtureMaps());

  assert.deepEqual(
    spine.nodes.filter((n) => n.scope === "course").map((n) => n.id),
    ["concept.course.1", "concept.course.2"],
  );
  assert.equal(spineNode(spine, "concept.course.1").file, "concepts/course.md");

  // FLIPPED (2026-07-17). This test used to assert that a course map's `## Objectives` yielded
  // NOTHING, because §2 listed no `objective.course.<n>`. The refusal was right at the time —
  // never mint outside the frozen scheme — but it encoded §2's GAP, not a defect: real course
  // maps carry course-level objectives, and two grammars for one document kind is §5d waiting
  // to happen. §2 now lists the ids, so `course` is a SCOPE and this is required behavior.
  const text = [
    "# Course Concept Map — X",
    "## Objectives",
    "1. Understand thermodynamics.",
    "## Misconceptions to surface",
    "- Heat is a fluid.",
    "## Concept sequence",
    "1. Energy is conserved.",
  ].join("\n");
  const course = buildSpine([{ file: "concepts/course.md", text, scope: "course" }]);
  assert.deepEqual(ids(course), [
    "concept.course.1",
    "misconception.course.1",
    "objective.course.1",
  ]);
  assert.equal(hasSpineNode(course, "objective.course.1"), true, "§2 now lists objective.course.<n>");
  assert.equal(spineNode(course, "misconception.course.1").negative, true, "still a negative claim");
  // ...and `course` is still not a CHAPTER: it mints no chapter node and binds no sequence entry.
  assert.deepEqual(course.chapters, []);
  assert.equal(hasSpineNode(course, "chapter.course"), false, "§2 mints chapter.<chapter-slug> only");
});

test("every chapter map mints its chapter.<slug> node; course does not", () => {
  const spine = buildSpine(fixtureMaps());

  assert.equal(hasSpineNode(spine, "chapter.phase-change"), true, "the prereq edge's near end (§2)");
  assert.deepEqual(spineNode(spine, "chapter.phase-change"), {
    id: "chapter.phase-change",
    kind: "chapter",
    scope: "phase-change",
    // A chapter is not a list item, so it has NO position, and §1's title needs a
    // case-preserving h1 M1 does not expose (CONTRACT CONCERN D). Both are null EXPLICITLY:
    // consumers branch on presence (§5d), and an absent ordinal reads as 0 to a naive consumer.
    ordinal: null,
    label: null,
    negative: false,
    file: "concepts/phase-change.md",
  });
  assert.equal(hasSpineNode(spine, "chapter.course"), false, "course is a scope, not a chapter");
  assert.equal(hasSpineNode(spine, "chapter.thermodynamics"), false, "no map, no chapter node");
  // Projected from `chapters` — ONE derivation of "what is a chapter", not two (§5d).
  assert.deepEqual(
    spine.nodes.filter((n) => n.kind === "chapter").map((n) => n.scope),
    spine.chapters,
  );
});

// --- the question six modules need -----------------------------------------------------------

test("a spineRef that exists resolves; one that does not, does not", () => {
  const spine = buildSpine(fixtureMaps());

  assert.equal(hasSpineNode(spine, "concept.phase-change.2"), true);
  assert.equal(spineNode(spine, "concept.phase-change.2").id, "concept.phase-change.2");

  // The typo'd bracket (§5b): parses fine, resolves to nothing.
  assert.equal(hasSpineNode(spine, "concept.phase-change.5"), false, "ordinal past the end");
  assert.equal(hasSpineNode(spine, "concept.crispr.1"), false, "unknown scope");
  assert.equal(hasSpineNode(spine, "objective.phase-change.99"), false);
  assert.equal(spineNode(spine, "concept.phase-change.5"), null, "null, never a nearest match");

  // EXACT match only. Every tolerance here turns a typo into a false authorization.
  assert.equal(hasSpineNode(spine, "Concept.Phase-Change.2"), false, "no case folding");
  assert.equal(hasSpineNode(spine, "concept.phase-change"), false, "no prefix match");
  assert.equal(hasSpineNode(spine, "concept.phase-change.2 "), false, "no trimming of a malformed ref");
  assert.equal(hasSpineNode(spine, ""), false);
  assert.equal(hasSpineNode(spine, null), false);
  assert.equal(hasSpineNode(spine, undefined), false);
});

test("danglingSpineRefs reports unresolvable targets, sorted+unique, and absence is not dangling", () => {
  const spine = buildSpine(fixtureMaps());
  assert.deepEqual(
    danglingSpineRefs(spine, [
      "concept.phase-change.9",
      "concept.phase-change.1", // exists — not reported
      "concept.crispr.5",
      "concept.phase-change.9", // one flag per target, not per mention
    ]),
    ["concept.crispr.5", "concept.phase-change.9"],
  );
  assert.deepEqual(danglingSpineRefs(spine, []), []);
  assert.deepEqual(danglingSpineRefs(spine, ["", null, undefined]), [], "an absent link is honest (§1)");
  assert.deepEqual(danglingSpineRefs(spine, undefined), []);
});

test("M1's Key-terms spineRef bracket is exactly what this module can now check (§5b, row 1)", () => {
  // The end-to-end point of the module: a term's `[concept.x]` placement is verifiable at last.
  const spine = buildSpine(fixtureMaps());
  assert.equal(hasSpineNode(spine, "concept.phase-change.1"), true, "a real placement resolves");
  assert.equal(hasSpineNode(spine, "concept.phase-change.7"), false, "a typo'd one is refutable");
});

// --- prerequisites (CONTRACT CONCERN A) ------------------------------------------------------

test("an UNBRACKETED prerequisite is a record with a null ref and NO edge", () => {
  const spine = buildSpine(fixtureMaps());

  assert.deepEqual(spine.prerequisites, [
    { scope: "phase-change", ordinal: 1, text: "Temperature and thermal energy", ref: null },
  ]);
  // The fabrication that is NOT committed, and §1 cites this exact line as the proof: the
  // fixture's prereq text overlaps concept.phase-change.1's sentence ("...at a characteristic
  // temperature"), so label-vs-sentence matching WOULD fire here and would be wrong.
  assert.deepEqual(
    spine.edges.filter((e) => e.to === "chapter.phase-change"),
    [],
    "no bracket, no edge — the record is what asks the author for one",
  );
  assert.ok(!spine.edges.some((e) => !e.from || !e.to), "no edge with a fabricated endpoint");
});

test("a BRACKETED prerequisite mints concept.x.n -> chapter.<slug> (§1)", () => {
  const maps = [
    {
      file: "concepts/course.md",
      text: "## Concept sequence\n1. Energy is conserved.\n2. Heat flows down a gradient.",
      scope: "course",
    },
    {
      file: "concepts/phase-change.md",
      text: [
        "## Prerequisites",
        "- Temperature and thermal energy [concept.course.1]",
        "- Heat flow [concept.course.2]",
        "- Something the author did not place",
        "## Concept sequence",
        "1. A solid melts.",
      ].join("\n"),
      scope: "phase-change",
    },
  ];
  const spine = buildSpine(maps);

  assert.deepEqual(
    spine.edges.filter((e) => e.reason === "declared prerequisite"),
    [
      { from: "concept.course.1", to: "chapter.phase-change", kind: "prereq", reason: "declared prerequisite" },
      { from: "concept.course.2", to: "chapter.phase-change", kind: "prereq", reason: "declared prerequisite" },
    ],
    "far end = the authored bracket; near end = the chapter (§2's new id)",
  );
  // Direction: the concept is a PREREQUISITE OF the chapter, not the other way round.
  assert.ok(!spine.edges.some((e) => e.from === "chapter.phase-change"), "no reversed edge");
  // The unbracketed third item is still carried, and still mints nothing.
  assert.equal(spine.prerequisites.length, 3);
  assert.equal(spine.prerequisites[2].ref, null);
  assert.equal(spine.edges.filter((e) => e.reason === "declared prerequisite").length, 2);
});

test("a DANGLING bracket mints no edge — and does not vanish (the §5b derivedFrom trap)", () => {
  const text = [
    "## Prerequisites",
    "- A concept nobody wrote [concept.course.9]",
    "## Concept sequence",
    "1. A solid melts.",
  ].join("\n");
  const spine = buildSpine([
    { file: "concepts/course.md", text: "## Concept sequence\n1. Energy is conserved.", scope: "course" },
    { file: "concepts/phase-change.md", text, scope: "phase-change" },
  ]);

  // No ghost node, and no edge into one.
  assert.equal(hasSpineNode(spine, "concept.course.9"), false);
  assert.deepEqual(spine.edges.filter((e) => e.reason === "declared prerequisite"), []);
  // ...but the author's assertion is RETAINED, so the gate can still report it. This is the one
  // thing §5b's `derivedFrom` row could not do: there, a dangling ref mints no edge AND leaves
  // no trace, so the declaration looks honoured. Refusing the edge is right; refusing it
  // invisibly is the defect.
  assert.equal(spine.prerequisites[0].ref, "concept.course.9", "the trace survives the refusal");
  assert.deepEqual(
    danglingSpineRefs(spine, spine.prerequisites.map((p) => p.ref)),
    ["concept.course.9"],
    "and it is reportable through the gate's own question",
  );
});

test("a COURSE-scope prerequisite mints no edge: there is no chapter.course near end", () => {
  // CONTRACT CONCERN C, pinned so the asymmetry is a decision and not a surprise.
  const spine = buildSpine([
    {
      file: "concepts/course.md",
      text: "## Prerequisites\n- Algebra [concept.course.1]\n## Concept sequence\n1. Energy is conserved.",
      scope: "course",
    },
  ]);
  assert.deepEqual(spine.edges, [], "no chapter.course to point at (§2: chapter.<chapter-slug>)");
  assert.equal(spine.prerequisites[0].ref, "concept.course.1", "the record is still carried");
});

test("a prerequisite WITH §1's explicit bracket carries the ref the author wrote", () => {
  const text = [
    "## Prerequisites",
    "- Temperature and thermal energy [concept.course.1]",
    "- Something the author did not place",
    // A bracket in a namespace this module cannot vouch for. NOT `[see chapter 4]` — the
    // spaces would make it un-parseable anyway, so it would test the tokenizer, not the
    // namespace rule, and a mutant that accepted ANY bracket would survive it.
    "- A term, not a spine node [term.melting-point]",
    "- A markdown-ish anchor [#latent-heat]",
    "## Concept sequence",
    "1. A solid melts.",
  ].join("\n");
  const spine = buildSpine([{ file: "concepts/x.md", text, scope: "x" }]);

  assert.deepEqual(spine.prerequisites, [
    { scope: "x", ordinal: 1, text: "Temperature and thermal energy", ref: "concept.course.1" },
    { scope: "x", ordinal: 2, text: "Something the author did not place", ref: null },
    { scope: "x", ordinal: 3, text: "A term, not a spine node [term.melting-point]", ref: null },
    { scope: "x", ordinal: 4, text: "A markdown-ish anchor [#latent-heat]", ref: null },
  ]);
  // A bracket that is not a spine namespace stays in the prose, un-promoted: a ref we cannot
  // vouch for is worse than none — `term.melting-point` is M1's id space, and no amount of
  // it resolving there makes it a PLACEMENT. And the bracket never leaks into the text of the
  // one ref we can vouch for.
  assert.equal(spine.prerequisites[0].text.includes("["), false);
});

// --- edges: the intra-chapter prereq chain ---------------------------------------------------

test("concept sequence order becomes the intra-chapter prereq chain, and nothing else does", () => {
  const spine = buildSpine(fixtureMaps());

  assert.deepEqual(spine.edges, [
    { from: "concept.course.1", to: "concept.course.2", kind: "prereq", reason: "concept sequence order" },
    {
      from: "concept.phase-change.1",
      to: "concept.phase-change.2",
      kind: "prereq",
      reason: "concept sequence order",
    },
  ]);
  assert.ok(!spine.edges.some((e) => e.from.startsWith("chapter.")), "a chapter is never a far end");
  // The negatives: objectives and misconceptions are NOT chained (§1 makes only the concept
  // sequence a prereq chain), chapters are not chained to each other, and n->n+1 is not n+1->n.
  assert.ok(!spine.edges.some((e) => e.from.startsWith("objective.")), "objectives are not a chain");
  assert.ok(!spine.edges.some((e) => e.from.startsWith("misconception.")), "misconceptions are not a chain");
  assert.ok(!spine.edges.some((e) => e.from === "concept.course.1" && e.to === "concept.phase-change.1"));
  assert.ok(!spine.edges.some((e) => e.from === "concept.phase-change.2" && e.to === "concept.phase-change.1"));

  // A one-item sequence is a chain of zero edges — not an edge to itself.
  const solo = buildSpine([{ file: "concepts/s.md", text: "## Concept sequence\n1. Only one.", scope: "s" }]);
  assert.deepEqual(solo.edges, []);
  assert.deepEqual(ids(solo), ["chapter.s", "concept.s.1"]);
});

// --- edges: DECLARED semantic prereqs (the instructor replacing the ordinal proxy) -----------

test("a [prereq:] bracket mints a semantic edge, strips itself off the label, and SUPPRESSES the ordinal chain", () => {
  const text = [
    "## Concept sequence",
    "1. The equilibrium constant K.",
    "2. Pure solids and liquids drop out of K. [prereq: concept.equilibrium.1]",
    "3. The reaction quotient Q has K's form. [prereq: concept.equilibrium.1]",
  ].join("\n");
  const spine = buildSpine([{ file: "concepts/equilibrium.md", text, scope: "equilibrium" }]);

  // Both declared edges are minted, pointing at concept 1 — the REAL prereq of 2 and of 3.
  assert.deepEqual(
    spine.edges.filter((e) => e.reason === "declared semantic prerequisite"),
    [
      { from: "concept.equilibrium.1", to: "concept.equilibrium.2", kind: "prereq", reason: "declared semantic prerequisite" },
      { from: "concept.equilibrium.1", to: "concept.equilibrium.3", kind: "prereq", reason: "declared semantic prerequisite" },
    ],
    "from = the declared prereq; to = the item it sits on",
  );
  // SUPPRESSION: the ordinal proxy is gone for this map. Its false positive here would be the
  // 2->3 edge (pure-solids before reaction-quotient), which neither depends on — exactly the
  // artifact the declaration removes.
  assert.deepEqual(spine.edges.filter((e) => e.reason === "concept sequence order"), []);
  assert.ok(!spine.edges.some((e) => e.from === "concept.equilibrium.2" && e.to === "concept.equilibrium.3"), "the spurious ordinal edge is not minted");
  // The bracket is METADATA, not label prose — it never leaks into the concept's text.
  assert.equal(spineNode(spine, "concept.equilibrium.2").label, "Pure solids and liquids drop out of K.");
  assert.equal(spineNode(spine, "concept.equilibrium.2").label.includes("["), false);
  // ...and every concept node still exists — suppression drops EDGES, never nodes.
  assert.deepEqual(ids(spine, "concept"), ["concept.equilibrium.1", "concept.equilibrium.2", "concept.equilibrium.3"]);
});

test("suppression is PER-MAP: an un-annotated map in the same build keeps its ordinal chain", () => {
  const spine = buildSpine([
    {
      file: "concepts/annotated.md",
      text: "## Concept sequence\n1. A.\n2. B. [prereq: concept.annotated.1]",
      scope: "annotated",
    },
    { file: "concepts/plain.md", text: "## Concept sequence\n1. C.\n2. D.", scope: "plain" },
  ]);
  // The annotated map: declared edge, no proxy.
  assert.deepEqual(
    spine.edges.filter((e) => e.from.startsWith("concept.annotated")),
    [{ from: "concept.annotated.1", to: "concept.annotated.2", kind: "prereq", reason: "declared semantic prerequisite" }],
  );
  // The plain map is untouched — the ordinal chain still mints (BACKWARD COMPATIBLE).
  assert.deepEqual(
    spine.edges.filter((e) => e.from.startsWith("concept.plain")),
    [{ from: "concept.plain.1", to: "concept.plain.2", kind: "prereq", reason: "concept sequence order" }],
  );
});

test("a `?` suffix marks a DERIVATIONAL edge, carried on both the record and the edge", () => {
  const text = [
    "## Concept sequence",
    "1. K.",
    "2. Gibbs energy relates to K.",
    "3. K's temperature dependence. [prereq: concept.x.1, concept.x.2?]",
  ].join("\n");
  const spine = buildSpine([{ file: "concepts/x.md", text, scope: "x" }]);

  const semantic = spine.edges.filter((e) => e.reason === "declared semantic prerequisite");
  assert.deepEqual(semantic, [
    { from: "concept.x.1", to: "concept.x.3", kind: "prereq", reason: "declared semantic prerequisite" },
    { from: "concept.x.2", to: "concept.x.3", kind: "prereq", reason: "declared semantic prerequisite", derivational: true },
  ]);
  // The hard edge carries NO `derivational` key at all — the flag rides only where it means
  // something (absent, never `false`).
  assert.equal("derivational" in semantic[0], false, "absent on a hard prerequisite");
  // The record mirrors it, with the `?` stripped out of the ref.
  assert.deepEqual(spine.semanticPrereqs, [
    { scope: "x", ordinal: 3, ref: "concept.x.1", derivational: false },
    { scope: "x", ordinal: 3, ref: "concept.x.2", derivational: true },
  ]);
});

test("verified-or-dropped: a bad semantic ref mints no edge but stays REPORTABLE (the §5b trap)", () => {
  const text = [
    "## Concept sequence",
    "1. A.",
    "2. B. [prereq: concept.eq.99]", // resolves to nothing (past the end)
    "3. C. [prereq: concept.eq.3]", // self-reference — a concept is not its own prereq
    "4. D. [prereq: objective.eq.1]", // right shape family, WRONG kind — a prereq must be a concept
    "5. E. [prereq: not-a-ref]", // malformed
  ].join("\n");
  const spine = buildSpine([
    { file: "concepts/eq.md", text, scope: "eq" },
    // a course concept the cross-scope case below can actually resolve against
    { file: "concepts/course.md", text: "## Concept sequence\n1. Foundational idea.", scope: "course" },
  ]);

  // NOT ONE of the four bad declarations minted an edge...
  assert.deepEqual(spine.edges.filter((e) => e.reason === "declared semantic prerequisite"), []);
  // ...yet every one is still on the record, verbatim — nothing vanished.
  assert.deepEqual(spine.semanticPrereqs, [
    { scope: "eq", ordinal: 2, ref: "concept.eq.99", derivational: false },
    { scope: "eq", ordinal: 3, ref: "concept.eq.3", derivational: false },
    { scope: "eq", ordinal: 4, ref: "objective.eq.1", derivational: false },
    { scope: "eq", ordinal: 5, ref: "not-a-ref", derivational: false },
  ]);
  // ...and the resolvable-but-nonexistent ones are reportable through the gate's own question.
  // (`concept.eq.3` is a real node — it is dropped for being a SELF ref, not for dangling — so it
  // is correctly NOT flagged here; the other well-shaped concept ref is.)
  assert.deepEqual(
    danglingSpineRefs(spine, spine.semanticPrereqs.map((p) => p.ref)),
    ["concept.eq.99", "not-a-ref", "objective.eq.1"],
  );
  // The ordinal chain is still suppressed for this map — the author DID declare (annotation is the
  // opt-in, whether or not the refs resolve), so we do not silently fall back to the proxy.
  assert.deepEqual(spine.edges.filter((e) => e.from.startsWith("concept.eq")), []);
});

test("a semantic prereq resolves ACROSS scopes when the target really exists", () => {
  // The instructor names a chapter-1 concept as the prereq of a chapter-2 concept. Both ends are
  // real nodes, so the edge is minted — the verified-or-dropped rule is about existence, not scope.
  const spine = buildSpine([
    { file: "concepts/ch1.md", text: "## Concept sequence\n1. Equilibrium constant.", scope: "ch1" },
    { file: "concepts/ch2.md", text: "## Concept sequence\n1. Le Chatelier shifts. [prereq: concept.ch1.1]", scope: "ch2" },
  ]);
  assert.deepEqual(
    spine.edges.filter((e) => e.reason === "declared semantic prerequisite"),
    [{ from: "concept.ch1.1", to: "concept.ch2.1", kind: "prereq", reason: "declared semantic prerequisite" }],
  );
});

// --- chapter sequence (CONTRACT CONCERN B) ---------------------------------------------------

test("chapter sequence carries inter-chapter order; a binding is VERIFIED or null", () => {
  const spine = buildSpine(fixtureMaps());
  assert.deepEqual(spine.chapterSequence, [
    {
      ordinal: 1,
      text: "**Phase Change** introduces melting, boiling, and latent heat.",
      slug: "phase-change",
    },
  ]);

  // A name matching no chapter file binds to NOTHING — order survives, the phantom does not.
  const text = [
    "## Chapter sequence",
    "1. **Phase Change** introduces melting.",
    "2. **Thermodynamics** is planned for next term.",
  ].join("\n");
  const spine2 = buildSpine([
    { file: "concepts/course.md", text, scope: "course" },
    { file: "concepts/phase-change.md", text: "", scope: "phase-change" },
  ]);
  assert.deepEqual(
    spine2.chapterSequence.map((e) => [e.ordinal, e.slug]),
    [
      [1, "phase-change"],
      [2, null],
    ],
  );
  assert.equal(hasSpineNode(spine2, "concept.thermodynamics.1"), false, "no phantom chapter's nodes");
});

// --- I/O half ---------------------------------------------------------------------------------

test("readConceptMaps applies §1's scope convention once, and tolerates a mapless package", () => {
  withPackage(
    {
      "concepts/course.md": "## Concept sequence\n1. Energy is conserved.",
      "concepts/phase-change.md": "## Objectives\n1. State the melting point.",
      "concepts/notes.txt": "not markdown",
      "study-guide/phase-change.md": "## Objectives\n1. Not a concept map.",
    },
    (root) => {
      const maps = readConceptMaps(root);
      assert.deepEqual(
        maps.map((m) => [m.file, m.scope]),
        [
          ["concepts/course.md", "course"],
          ["concepts/phase-change.md", "phase-change"],
        ],
        "sorted; .md only; concepts/ only; slug from the filename, course.md => course",
      );

      const spine = buildSpine(maps);
      assert.deepEqual(ids(spine), [
        "chapter.phase-change",
        "concept.course.1",
        "objective.phase-change.1",
      ]);
      // The study guide's identical `## Objectives` section is NOT a spine section.
      assert.equal(hasSpineNode(spine, "objective.phase-change.2"), false);
    },
  );

  withPackage({ "README.md": "no concepts folder" }, (root) => {
    assert.deepEqual(readConceptMaps(root), [], "no concepts/ => no maps, not a crash");
    assert.deepEqual(buildSpine(readConceptMaps(root)).nodes, []);
  });
  assert.deepEqual(readConceptMaps("/definitely/not/a/package"), []);
  assert.deepEqual(readConceptMaps(undefined), []);
});

test("readConceptMaps SORTS — asserted mechanically, because behavior cannot see this one", () => {
  // `fs.readdirSync` order is UNSPECIFIED. On this box it comes back name-ordered, so a
  // `readConceptMaps` with its `.sort()` deleted passes every behavior test written above —
  // right up until the package is read on a filesystem that hashes its directory entries, at
  // which point `generatedFrom` (which records the maps AS GIVEN, so it is the one output the
  // node sort cannot canonicalize) stops being byte-stable across machines.
  //
  // This is interfaces §5d's promoted lesson in a new costume: when a defect lives in the
  // ARTIFACT rather than in observable behavior, assert it mechanically against the source.
  // A behavior test here would be a test with a timer on it — it passes because of an
  // accident of the filesystem, not because of the code.
  const src = fs.readFileSync(path.join(repo, "scripts/lib/spine.mjs"), "utf8");
  const body = src.slice(src.indexOf("export function readConceptMaps"));
  assert.match(
    body.slice(0, body.indexOf("export function spineNode")),
    /\.sort\(byString\)/,
    "readConceptMaps must sort its entries; readdir order is not a contract",
  );
});

// --- schema conformance ----------------------------------------------------------------------

test("the produced SPINE conforms to spine.schema.json — required fields, no strays", () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(repo, "system/schemas/package/spine.schema.json"), "utf8"),
  );
  // A map with every section populated, so no branch of the schema is checked against an
  // artifact that never exercises it. (The golden fixture alone carries no bracketed
  // prerequisite, so it would leave `edges[].reason: "declared prerequisite"` untested here.)
  const spine = buildSpine([
    ...fixtureMaps(),
    {
      file: "concepts/boiling.md",
      text: [
        "## Prerequisites",
        "- Melting [concept.phase-change.1]",
        "- Unplaced prose",
        "## Objectives",
        "1. State the boiling point.",
        "## Concept sequence",
        "1. A liquid boils at a characteristic temperature.",
        "2. Pressure shifts the boiling point.",
        "## Misconceptions to surface",
        "- Boiling and evaporation are the same.",
      ].join("\n"),
      scope: "boiling",
    },
    // A map that declares semantic prereqs, so the `declared semantic prerequisite` reason, the
    // optional `derivational` edge field, and the `semanticPrereqs[]` array are all exercised
    // against the schema rather than left as untested branches.
    {
      file: "concepts/kinetics.md",
      text: [
        "## Concept sequence",
        "1. Rate depends on concentration.",
        "2. Rate laws are empirical. [prereq: concept.kinetics.1]",
        "3. The rate constant depends on temperature. [prereq: concept.kinetics.1, concept.kinetics.2?]",
      ].join("\n"),
      scope: "kinetics",
    },
  ]);

  const check = (obj, itemSchema, what) => {
    const allowed = new Set(Object.keys(itemSchema.properties));
    for (const req of itemSchema.required) assert.ok(req in obj, `${what}: missing required ${req}`);
    for (const key of Object.keys(obj)) assert.ok(allowed.has(key), `${what}: stray field ${key}`);
  };

  for (const req of schema.required) assert.ok(req in spine, `SPINE missing required ${req}`);
  const topAllowed = new Set(Object.keys(schema.properties));
  for (const key of Object.keys(spine)) assert.ok(topAllowed.has(key), `stray SPINE field ${key}`);
  assert.equal(spine.schemaVersion, schema.properties.schemaVersion.const);

  const nodeSchema = schema.properties.nodes.items;
  const idRe = new RegExp(nodeSchema.properties.id.pattern);
  assert.ok(spine.nodes.length > 0);
  for (const n of spine.nodes) {
    check(n, nodeSchema, n.id);
    assert.match(n.id, idRe, "every id matches §2's scheme");
    assert.ok(nodeSchema.properties.kind.enum.includes(n.kind));
    assert.equal(typeof n.negative, "boolean", "explicit on every node, never a default");
    // The nullables are null ONLY where the schema's reason applies: a chapter has no position
    // and no list-item label. Anything else carrying null would mean a section parsed wrong.
    if (n.kind === "chapter") {
      assert.equal(n.ordinal, null);
      assert.equal(n.label, null);
    } else {
      assert.ok(Number.isInteger(n.ordinal) && n.ordinal >= nodeSchema.properties.ordinal.minimum);
      assert.equal(typeof n.label, "string");
      assert.ok(n.label.length > 0);
    }
    assert.equal(n.negative, n.kind === "misconception", "negative marks a misconception, and only one");
  }

  const edgeSchema = schema.properties.edges.items;
  const ids_ = new Set(spine.nodes.map((n) => n.id));
  assert.ok(spine.edges.some((e) => e.reason === "declared prerequisite"), "all reasons exercised");
  assert.ok(spine.edges.some((e) => e.reason === "concept sequence order"));
  assert.ok(spine.edges.some((e) => e.reason === "declared semantic prerequisite"));
  assert.ok(spine.edges.some((e) => e.derivational === true), "the optional derivational field is exercised");
  for (const e of spine.edges) {
    check(e, edgeSchema, `${e.from}->${e.to}`);
    assert.ok(edgeSchema.properties.reason.enum.includes(e.reason));
    assert.equal(e.kind, edgeSchema.properties.kind.const);
    // `derivational`, when present, is boolean and never `false` (an optional flag carried only
    // where it means something) — asserted so a mutant that emitted `derivational:false` is caught.
    if ("derivational" in e) assert.equal(e.derivational, true, "derivational is present only as true");
    // The schema's promise: an edge is minted only when BOTH ends resolve.
    assert.ok(ids_.has(e.from), `edge from a node that does not exist: ${e.from}`);
    assert.ok(ids_.has(e.to), `edge to a node that does not exist: ${e.to}`);
  }

  const preSchema = schema.properties.prerequisites.items;
  assert.ok(spine.prerequisites.some((p) => p.ref) && spine.prerequisites.some((p) => p.ref === null));
  for (const p of spine.prerequisites) {
    check(p, preSchema, `${p.scope}#${p.ordinal}`);
    assert.ok(p.ref === null || typeof p.ref === "string");
  }

  const semSchema = schema.properties.semanticPrereqs.items;
  assert.ok(spine.semanticPrereqs.length > 0 && spine.semanticPrereqs.some((s) => s.derivational));
  for (const s of spine.semanticPrereqs) {
    check(s, semSchema, `${s.scope}#${s.ordinal}:${s.ref}`);
    assert.equal(typeof s.ref, "string");
    assert.equal(typeof s.derivational, "boolean");
  }

  const seqSchema = schema.properties.chapterSequence.items;
  assert.ok(spine.chapterSequence.length > 0);
  for (const c of spine.chapterSequence) check(c, seqSchema, `chapterSequence#${c.ordinal}`);
});

// --- purity ----------------------------------------------------------------------------------

test("deterministic: same maps => byte-identical spine, and inputs are never mutated", () => {
  const a = buildSpine(fixtureMaps());
  const b = buildSpine(fixtureMaps());
  assert.equal(JSON.stringify(a), JSON.stringify(b), "byte for byte, including key order");

  // Set-shaped output is sorted, so map order cannot move it. `generatedFrom` is the exception
  // by design: it records the maps AS GIVEN (M1's convention), so it is compared separately.
  const reversed = buildSpine(fixtureMaps().reverse());
  assert.deepEqual(reversed.nodes, a.nodes, "node set is sorted, not input-ordered");
  assert.deepEqual(reversed.edges, a.edges);
  assert.deepEqual(reversed.chapters, a.chapters);

  const maps = fixtureMaps();
  const before = JSON.stringify(maps);
  buildSpine(maps);
  assert.equal(JSON.stringify(maps), before, "the caller's maps are untouched");
});

test("the fixture is treated as read-only by this suite", () => {
  // A guard, not a formality: the golden fixture is a shared contract and M9's suite once had
  // to learn this the hard way. If any test above ever writes to it, this fails.
  const spine = buildSpine(fixtureMaps());
  assert.equal(spine.nodes.length, 8);
  assert.equal(read("phase-change.md").includes("## Misconceptions to surface"), true);
});
