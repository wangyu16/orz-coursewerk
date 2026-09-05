// Spine producer (M13) — the module that MINTS the `concept.*` / `objective.*` /
// `misconception.*` namespace the rest of the semantic index points into.
//
// Why this exists
// ---------------
// It should not have needed to. Six modules consume a `spineRef`: M1 records one per term
// (the `[concept.x]` bracket), M2 puts them on every declared claim and keys claim identity
// on the first one, M3 hashes them into the `spine` fingerprint, M4 reads a spine move, M5
// groups its orphan analysis by them, and the M11 gate is charged (interfaces §5b) with
// answering "does this spineRef target exist?". **Nothing produced the namespace.** M1 parses
// exactly one section of the concept map (`## Key terms`); the other sections — the ones §1's
// table says yield the spine — appeared only in its comments. So `concept.crispr.5` was a
// string that six modules trusted, one module could typo, and NO code could refute.
//
// That made two of §5b's gate checks **definitionally uncomputable** and left M5 treating
// spineRefs as opaque grouping keys — and the whole suite stayed green, because every test
// constructed its spineRefs by hand. It is the `derivedFrom` defect (interfaces §3: "a field
// with NO PRODUCER AT ALL, sitting in a consumer's contract") one level up: an entire
// NAMESPACE with no producer, in the system built to catch things that look implemented and
// aren't. This module is the producer. Its only real job is to make the question answerable:
//
//     hasSpineNode(spine, "concept.phase-change.5")  ->  true | false
//
// THE SPINE IS THE INSTRUCTOR'S AUTHORITY — SO IT IS NEVER INFERRED
// ----------------------------------------------------------------
// The concept map is the one artifact the product exists to keep the instructor in charge of.
// A fabricated spine node does not merely add noise: it puts words in their mouth about what
// their own course teaches, and every downstream layer then treats the fabrication as
// authorization (a term's spineRef "resolves"; a claim has a "parent"; the gate reports
// nothing wrong). So nodes come ONLY from the sections §1 names, as list items, in order.
// Never from prose, never from a heading that "obviously means Objectives", never from
// "the concept sequence sentence that mentions this term". This is M1's no-guessed-spineRef
// rule (interfaces §1) wearing a fourth hat, and it is the same refusal M2 makes for
// `spineRefs: []` and M12 makes for `derivedFrom`.
//
// TOLERANT (§1): a missing or unknown section yields FEWER NODES, never a crash, and never an
// invented one. A half-written map still produces a usable spine. There is deliberately NO
// legacy fallback (no `## Keywords`, no prose mining): a second vocabulary/spine source would
// be §5d at the document level — one fact derived in two places — and §5d's own worked example
// (the three-way-drifted unit table) shipped a blind spot that made a package report zero flags
// it had not earned. Existing demo maps that lack these sections are illustrations to be
// standardized, not a constraint to design around.
//
// WHAT IS PARSED (interfaces §1, verbatim — this module implements that table, it does not
// design it):
//   concepts/<chapter-slug>.md  AND  concepts/course.md  — ONE grammar, two scopes
//     ## Objectives             (ordered)   -> objective.<scope>.<n>
//     ## Concept sequence       (ordered)   -> concept.<scope>.<n>, + intra-chapter order as a
//                                              prereq chain (`edges`) UNLESS the map declares
//                                              genuine semantic prereqs (see below), in which
//                                              case the ordinal chain is SUPPRESSED for that map
//                                              and the declared edges are minted instead
//     ## Misconceptions to surface          -> misconception.<scope>.<n>, NEGATIVE claims
//     ## Prerequisites          (unordered) -> `prerequisites[]` records, + a prereq edge
//                                              `concept.x.n -> chapter.<slug>` ONLY where the
//                                              item carries the explicit bracket
//   concepts/course.md additionally
//     ## Chapter sequence                   -> inter-chapter order (`chapterSequence`)
//   Every chapter map ALSO mints its `chapter.<slug>` node (§2).
//   `## Key terms` is M1's and is NOT read here. One grammar, one parser (§5d).
//
// `course` IS A SCOPE, NOT A SPECIAL DOCUMENT (§2, frozen 2026-07-17). This module first shipped
// minting only `concept.course.<n>` from the course map and REFUSING `objective.course.<n>`,
// because §2 did not list that id. The refusal was right in its reasoning — never mint outside
// the frozen scheme — but it was the CONTRACT that was wrong, not the course map: real course
// maps carry course-level objectives, and two grammars for one document kind is §5d waiting to
// happen. §2 now lists `objective.course.<n>` and `misconception.course.<n>`, so the special
// case is gone and the course map is read exactly like a chapter map with `scope: "course"`.
// The test asserting the old refusal was FLIPPED — it encoded §2's GAP, not a defect, and that
// is the one circumstance in which changing a passing test is the honest move rather than the
// suspicious one.
//
// ORDINALS COME FROM POSITION, NOT FROM THE LIST MARKER (1-based, §2 — now frozen there). `1. 1.
// 1.` is ordinary markdown (renderers renumber), and a hand-edited map routinely carries `4.`
// where `3.` was deleted. Trusting the typed number would let a typo silently re-parent every
// claim under the item below it, while position cannot disagree with the document it is read from.
//
// EDGE DIRECTION: `{from, to}` reads **"from is a prerequisite of to"**. Concept n precedes
// concept n+1, so the chain is concept.<s>.1 -> concept.<s>.2 -> …, and a bracketed prerequisite
// is concept.x.n -> chapter.<slug> (§1).
//
// SEMANTIC PREREQUISITE EDGES — THE INSTRUCTOR DECLARING REAL DEPENDENCIES, NOT THE ORDINAL PROXY
// -----------------------------------------------------------------------------------------------
// The intra-chapter ordinal chain (concept.<s>.n -> concept.<s>.n+1) is a PROXY: it asserts a
// prerequisite between adjacent list items purely because one is typed above the other. That
// proxy mints FALSE POSITIVES — two concepts that both depend only on an earlier one, listed in
// either order, get a spurious edge between them (measured: the ordering-coherence axis flagged
// `pure-solids -> reaction-quotient` as an inversion when neither is a prerequisite of the other).
//
// So a `## Concept sequence` item MAY carry a trailing bracket declaring its GENUINE prerequisites:
//
//     5. The reaction quotient has the same form as K. [prereq: concept.chemical-equilibrium.3]
//     7. K depends on temperature. [prereq: concept.chemical-equilibrium.3, concept.chemical-equilibrium.6?]
//
//   * `[prereq: <ref>(, <ref>)*]`, each `<ref> = concept.<scope>.<n>`, a `?` suffix marking a
//     DERIVATIONAL (defensible-but-optional) edge — carried on the edge so a consumer can score
//     it separately. The `prereq:` label keeps the bracket unambiguous against the bare
//     `[concept.x]` spineRef `## Key terms` uses: that one is a PLACEMENT OF the term it sits on,
//     this one names the prerequisites OF the item it sits on.
//   * Direction, as everywhere: the listed refs are PREREQUISITES of the item -> {from: ref,
//     to: thisConcept, kind: "prereq", reason: "declared semantic prerequisite"}. `kind` stays
//     "prereq" — these ARE prerequisite edges, so every consumer treats them as such; the
//     semantic-vs-ordinal distinction is PROVENANCE, which `reason` already carries (exactly as
//     it splits "concept sequence order" from "declared prerequisite"). A new `kind` would only
//     make a consumer that filters `kind === "prereq"` silently drop the instructor's real edges.
//   * SUPPRESSION — the rule that removes the false positives: a map that declares >=1 `[prereq:]`
//     OWNS its intra-map prereq graph, so the auto ordinal chain is NOT minted for that map. A map
//     with no annotation keeps the chain unchanged -> BACKWARD COMPATIBLE: no existing map is
//     forced to be re-authored, and the proxy stays available for maps whose author has not (yet)
//     declared the real edges.
//   * VERIFIED-OR-DROPPED, the same discipline as the `## Prerequisites` bracket: an edge is
//     minted ONLY when BOTH ends resolve to real concept nodes (and the ref is not the item
//     itself). A ref that does not resolve mints no edge — but the `semanticPrereqs[]` record
//     ALWAYS keeps the author's ref verbatim, so a dangling declaration stays reportable through
//     `danglingSpineRefs`, never vanishing silently (the §5b `derivedFrom` trap).
//
// PURE and DETERMINISTIC: same maps -> byte-identical spine. No network, no LLM, no clock, no
// randomness. `readConceptMaps` is the only I/O, and it only reads the package's own files.
// Every set-shaped output is sorted.
//
// PREREQUISITES — THE BRACKET, AND WHY BOTH ENDS ARE VERIFIED (§1, frozen 2026-07-17)
// -----------------------------------------------------------------------------------
// A prereq item is prose ("Temperature and thermal energy"). Matching it to a concept needs the
// label-vs-sentence inference §1 forbids, and it WOULD misfire: in the golden fixture that very
// item overlaps `concept.phase-change.1`'s sentence ("...at a characteristic temperature"). So
// the far end comes from the explicit `[concept.x.n]` bracket or not at all, and the near end is
// the `chapter.<slug>` node §2 now mints.
//
// An edge is minted ONLY when BOTH ends resolve to real nodes — the same verified-or-null
// discipline as the chapter-sequence binding. Crucially, that refusal is NOT silent: the
// `prerequisites[]` record ALWAYS carries the author's `ref` verbatim, so a bracket naming a
// node that does not exist is still reportable (`danglingSpineRefs(spine, prerequisites.map(p =>
// p.ref))`). That is the ONE thing §5b's `derivedFrom` row could not do — there, a dangling ref
// mints no edge AND leaves no trace, so the dependency the author asserted vanishes silently and
// the declaration LOOKS honoured. Refusing the edge is right; refusing it invisibly is the
// defect. Here the record is the trace.
//
// A course-scope prerequisite therefore mints NO edge: `course` is not a chapter, so there is no
// `chapter.course` near end to point at (§2: `chapter.<chapter-slug>`). The record is kept with
// its ref. See CONTRACT CONCERN C.
//
// CONTRACT CONCERNS (reported, not routed around):
//
//   C. §1 now gives the course map the SAME section grammar, which includes `## Prerequisites` —
//      but §2 mints `chapter.<chapter-slug>` only, and `course` is not a chapter. So a course-map
//      prerequisite's near end does not exist and its edge cannot be minted, while an identical
//      line in a chapter map yields one. The record is carried either way, so nothing is silent
//      and no consumer is misled. Cheap fixes if it matters: state that `## Prerequisites` is
//      chapter-only, or mint a `chapter.course`-equivalent course node. Low stakes — a course
//      map declaring its own prerequisites is unusual — which is exactly why it should be
//      DECIDED rather than left to whichever module meets it first.
//
//   D. §1's `# Concept Map — <Title>` row yields a "chapter title" that this module deliberately
//      does NOT carry: `chapter.<slug>` nodes have `label: null`. Recovering the title needs a
//      CASE-PRESERVING h1, and M1's `parseSections` lowercases its keys — so reading it would
//      mean a second heading parser in this file, i.e. §5d, over the one document whose section
//      grammar M1 already owns. The id carries the slug and no consumer has asked for the title.
//      If one does, the honest fix is an additive title projection in M1, not a regex here.

import fs from "node:fs";
import path from "node:path";
import { listItems, parseSections, splitAnchorMarker } from "./terms.mjs";
import { slugify } from "./slug.mjs";

const SCHEMA_VERSION = 1;

/** Where the concept maps live (interfaces §1). */
const CONCEPTS_DIR = "concepts";

/**
 * `course` is a SCOPE, not a special document (§2). It reads with the same grammar as any
 * chapter; it is singled out here for exactly two things — it is not a CHAPTER (so it mints no
 * `chapter.<slug>` node and is not a chapter-sequence binding target), and it is the only map
 * that carries `## Chapter sequence`.
 */
const COURSE_SCOPE = "course";

/**
 * The sections that mint nodes, keyed as `parseSections` keys them (lowercased heading text).
 * A closed list ON PURPOSE: an unknown heading is ignored, never guessed at. Adding a kind here
 * means §1's table and §2's id scheme grew — this table is downstream of that freeze, not a
 * place to extend it.
 */
const NODE_SECTIONS = [
  { section: "objectives", kind: "objective", negative: false },
  { section: "concept sequence", kind: "concept", negative: false },
  { section: "misconceptions to surface", kind: "misconception", negative: true },
];

const PREREQUISITES = "prerequisites";
const CHAPTER_SEQUENCE = "chapter sequence";

/**
 * A trailing `[concept.x]` / `[objective.x]` bracket (interfaces §1's spineRef grammar, as M1
 * reads it). Only those two namespaces are accepted — any other bracket is prose or a markdown
 * link, and a ref we cannot vouch for is worse than none.
 */
const SPINE_REF = /\s*\[((?:concept|objective)\.[^\]\s]+)\]\s*$/;

/**
 * A trailing `[prereq: concept.<scope>.<n>(, …)]` bracket on a `## Concept sequence` item — the
 * instructor declaring GENUINE semantic prerequisites of that item (see the SEMANTIC PREREQUISITE
 * doc block above). The `prereq:` label makes it unambiguous against SPINE_REF's bare bracket.
 * Capture group 1 is the comma-separated ref list, split and shape-checked per ref below.
 */
const CONCEPT_PREREQ = /\s*\[prereq:\s*([^\]]+)\]\s*$/;

/**
 * One ref inside that bracket: `concept.<scope>.<n>`, group 1 the id, group 2 the optional `?`
 * that marks a DERIVATIONAL edge. Shape only — resolution is still EXACT id equality (`spineNode`),
 * so a well-shaped ref to a concept that does not exist mints no edge, only a reportable record.
 */
const CONCEPT_PREREQ_REF = /^(concept\.[^.\s]+\.[0-9]+)(\?)?$/;

/** A leading bold run: `**Phase Change** introduces…` -> `Phase Change`. */
const BOLD_LEAD = /^\*\*\s*(.+?)\s*\*\*/;

const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Collapse whitespace; a label is compared and stored in one canonical shape. */
const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * A node's total order: kind, then scope, then ordinal. Deterministic AND readable — sorting by
 * id alone would interleave `…10` before `…2`, which is stable but tells the reader nothing.
 * A `chapter` node's ordinal is null (it is not a list item); `kind`+`scope` already make it
 * unique, so the null never reaches the numeric compare as a tie.
 */
function byNode(a, b) {
  return (
    byString(a.kind, b.kind) ||
    byString(a.scope, b.scope) ||
    (a.ordinal ?? 0) - (b.ordinal ?? 0)
  );
}

/** Lift a trailing spineRef bracket off an item. `{text, ref}`; `ref` is null when absent. */
function splitRef(item) {
  const m = SPINE_REF.exec(item);
  if (!m) return { text: tidy(item), ref: null };
  return { text: tidy(item.slice(0, m.index)), ref: m[1] };
}

/**
 * Build the spine from concept maps.
 *
 * Symmetric with M1's `buildTerms` by design: same input shape, same tolerance, same purity —
 * they are two projections of ONE artifact (the map is pedagogical plan, term authority AND
 * spine, spec §4), so they must never disagree about what the map says. They share the section
 * splitter and the list-item grammar for exactly that reason (§5d): two markdown parsers over
 * one document is one document with two meanings.
 *
 * A map with no `scope` yields NO nodes: every id in §2 is `<kind>.<scope>.<n>`, so without a
 * scope there is no id to mint — and minting one under a guessed scope would file the
 * instructor's concepts under a chapter they did not write. Fewer nodes, never invented.
 *
 * @param {Array<{file:string, text:string, scope?:string}>} conceptMaps concept-map sources;
 *   `scope` is the chapter slug (`concepts/<slug>.md` -> `<slug>`), or `"course"` for the
 *   course map. `readConceptMaps` derives it; the caller owns it, exactly as in M1.
 * @returns {{schemaVersion:number, generatedFrom:string[], chapters:string[],
 *   nodes:Array<{id:string, kind:string, scope:string, ordinal:number|null, label:string|null,
 *                negative:boolean, file:string}>,
 *   edges:Array<{from:string, to:string, kind:"prereq", reason:string, derivational?:boolean}>,
 *   prerequisites:Array<{scope:string, ordinal:number, text:string, ref:string|null}>,
 *   semanticPrereqs:Array<{scope:string, ordinal:number, ref:string, derivational:boolean}>,
 *   chapterSequence:Array<{ordinal:number, text:string, slug:string|null}>}} SPINE
 */
export function buildSpine(conceptMaps) {
  const maps = Array.isArray(conceptMaps) ? conceptMaps : [];
  const nodes = [];
  const edges = [];
  const prerequisites = [];
  const semanticPrereqs = [];
  let chapterSequence = [];

  // Derived ONCE, then projected twice — into `chapters` and into the `chapter.<slug>` nodes.
  // Two derivations of "what is a chapter" is §5d, inside the module reporting §5d defects.
  const chapters = [
    ...new Set(
      maps
        .map((m) => (m?.scope ? String(m.scope) : ""))
        .filter((s) => s && s !== COURSE_SCOPE),
    ),
  ].sort(byString);
  const fileByScope = new Map();

  for (const map of maps) {
    const scope = map?.scope ? String(map.scope) : null;
    if (!scope) continue; // no scope -> no id -> no node. The tolerance contract.
    const file = String(map?.file ?? "");
    const sections = parseSections(map?.text);
    const isCourse = scope === COURSE_SCOPE;
    if (!fileByScope.has(scope)) fileByScope.set(scope, file);

    // ONE grammar, two scopes (§2). No course special case: the refusal that used to live here
    // was §2's gap, not a rule.
    for (const { section, kind, negative } of NODE_SECTIONS) {
      const items = listItems(sections.get(section) ?? []);
      const minted = [];
      let mapDeclaresSemanticPrereqs = false;
      items.forEach((item, i) => {
        const ordinal = i + 1; // 1-based, from POSITION (§2) — never the typed list marker.
        // A `## Concept sequence` item MAY carry a trailing `[prereq: …]` declaring genuine
        // prerequisites of THIS item. Lift it off before the label is taken (it is metadata, not
        // prose), then record each ref verbatim so a dangling one stays reportable. Only the
        // concept section carries this bracket; other sections read the item as-is.
        // G22: an inline `[anchor: slug]` is identity metadata for the deliverables (claims.mjs
        // keys the restated objective on it); the spine lifts it off so the node label is prose.
        let itemText = splitAnchorMarker(item).text;
        if (kind === "concept") {
          const pm = CONCEPT_PREREQ.exec(itemText);
          if (pm) {
            mapDeclaresSemanticPrereqs = true;
            itemText = itemText.slice(0, CONCEPT_PREREQ.exec(itemText)?.index ?? itemText.length);
            for (const token of pm[1].split(",").map((s) => s.trim()).filter(Boolean)) {
              const rm = CONCEPT_PREREQ_REF.exec(token);
              // Malformed tokens are KEPT verbatim (ref stays the raw token) so the record still
              // reports them — the same "refuse the edge, never the trace" rule as prerequisites[].
              semanticPrereqs.push({
                scope,
                ordinal, // the position of the concept these are prerequisites OF (the `to`)
                ref: rm ? rm[1] : token,
                derivational: rm ? rm[2] === "?" : false,
              });
            }
          }
        }
        const label = tidy(itemText);
        if (!label) return;
        const node = {
          id: `${kind}.${scope}.${ordinal}`,
          kind,
          scope,
          ordinal,
          label,
          // Emitted on EVERY node, never left to a default. M1 learned this the expensive way
          // with `lifecycle`: a naive read of an absent field is a silent wrong answer, and
          // "is this a negative claim?" is a question M6 and the fidelity checker must not get
          // wrong — a misconception asserts the OPPOSITE of what it looks like it asserts.
          negative,
          file,
        };
        nodes.push(node);
        minted.push(node);
      });

      // §1: intra-chapter order of `## Concept sequence` IS a prereq chain — the ORDINAL PROXY.
      // SUPPRESSED for a map that declares genuine semantic prereqs: that map owns its intra-map
      // graph, and the proxy's false positives are exactly what the declaration replaces. An
      // un-annotated map keeps the chain, so nothing existing is forced to re-author.
      if (kind === "concept" && !mapDeclaresSemanticPrereqs) {
        for (let i = 1; i < minted.length; i += 1) {
          edges.push({
            from: minted[i - 1].id,
            to: minted[i].id,
            kind: "prereq",
            reason: "concept sequence order",
          });
        }
      }
    }

    // §1: the record ALWAYS; the edge only where the author wrote the bracket. The record is
    // what lets the gate ask the author for a bracket instead of guessing one for them.
    listItems(sections.get(PREREQUISITES) ?? []).forEach((item, i) => {
      const { text, ref } = splitRef(item);
      if (!text && !ref) return;
      prerequisites.push({ scope, ordinal: i + 1, text, ref });
    });

    // Order is carried; the chapter binding is verified or null (§1, frozen).
    if (isCourse) {
      chapterSequence = listItems(sections.get(CHAPTER_SEQUENCE) ?? [])
        .map((item, i) => {
          const text = tidy(item);
          const bold = BOLD_LEAD.exec(text);
          const candidate = slugify(bold ? bold[1] : text, "");
          return {
            ordinal: i + 1,
            text,
            // Bound only against a chapter that EXISTS. A name that matches nothing is an
            // honest null, never a phantom chapter (and never a guess at "the nearest" one).
            slug: candidate && chapters.includes(candidate) ? candidate : null,
          };
        })
        .filter((e) => e.text);
    }
  }

  // `chapter.<slug>` (§2) — the prereq edge's near end. Projected from `chapters`, never
  // re-derived. `course` gets none: it is a scope, not a chapter.
  for (const slug of chapters) {
    nodes.push({
      id: `chapter.${slug}`,
      kind: "chapter",
      scope: slug,
      // A chapter is not a list item, so it HAS no position. `null` is the answer, emitted
      // explicitly — consumers branch on presence, never truthiness (§5d), and an absent field
      // would read as "0" to the next naive consumer.
      ordinal: null,
      // CONTRACT CONCERN D: §1's chapter title needs a case-preserving h1, which M1's section
      // splitter does not expose. A second heading parser here would be §5d. The id carries the
      // slug; null is honest.
      label: null,
      negative: false,
      file: fileByScope.get(slug) ?? "",
    });
  }

  // The bracketed prereq edges (§1). BOTH ends are verified against the minted node set: a
  // bracket naming a node that does not exist mints NO edge — but `prerequisites[].ref` keeps
  // the author's assertion, so the dangling ref stays REPORTABLE rather than vanishing. That
  // absence-of-a-trace is the defect §5b's `derivedFrom` row describes; refusing the edge is
  // right, refusing it invisibly is not.
  const byId = new Set(nodes.map((n) => n.id));
  for (const p of prerequisites) {
    if (!p.ref) continue;
    const near = `chapter.${p.scope}`;
    if (!byId.has(p.ref) || !byId.has(near)) continue;
    edges.push({ from: p.ref, to: near, kind: "prereq", reason: "declared prerequisite" });
  }

  // The declared SEMANTIC prereq edges (§1). Same verified-or-dropped discipline: mint ONLY when
  // both ends are real nodes and the ref is a `concept.*` id that is not the item itself. A
  // dangling or malformed ref mints nothing but survives in `semanticPrereqs[]` — reportable, not
  // vanished. `derivational` rides on the edge so a consumer can score optional deps separately.
  for (const s of semanticPrereqs) {
    const to = `concept.${s.scope}.${s.ordinal}`;
    if (!s.ref.startsWith("concept.") || s.ref === to) continue;
    if (!byId.has(s.ref) || !byId.has(to)) continue;
    const edge = { from: s.ref, to, kind: "prereq", reason: "declared semantic prerequisite" };
    if (s.derivational) edge.derivational = true;
    edges.push(edge);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedFrom: maps.map((m) => String(m?.file ?? "")),
    chapters,
    nodes: nodes.sort(byNode),
    edges: edges.sort((a, b) => byString(a.from, b.from) || byString(a.to, b.to)),
    prerequisites: prerequisites.sort(
      (a, b) => byString(a.scope, b.scope) || a.ordinal - b.ordinal,
    ),
    semanticPrereqs: semanticPrereqs.sort(
      (a, b) => byString(a.scope, b.scope) || a.ordinal - b.ordinal || byString(a.ref, b.ref),
    ),
    chapterSequence,
  };
}

/**
 * Read a package's concept maps in the shape `buildSpine`/`buildTerms` take.
 *
 * The I/O half, kept OUT of `buildSpine` so the parse stays pure. It exists so that the scope
 * convention (`concepts/<slug>.md` -> `<slug>`, `concepts/course.md` -> `course`, interfaces §1)
 * is applied in ONE place: today every caller hand-builds this list, which is §5d waiting for
 * one of them to spell it differently.
 *
 * Missing/unreadable `concepts/` yields `[]` — a package without a map has no spine, which is a
 * fact, not a crash. Sorted, so the spine is byte-stable across filesystems.
 *
 * @param {string} root package root
 * @returns {Array<{file:string, text:string, scope:string}>}
 */
export function readConceptMaps(root) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(String(root ?? ""), CONCEPTS_DIR), {
      withFileTypes: true,
    });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort(byString)
    .map((name) => {
      const rel = `${CONCEPTS_DIR}/${name}`;
      let text;
      try {
        text = fs.readFileSync(path.join(root, rel), "utf8");
      } catch {
        return null;
      }
      return { file: rel, text, scope: path.basename(name, ".md") };
    })
    .filter(Boolean);
}

/**
 * Resolve a spineRef to its node, or null.
 *
 * THE QUESTION SIX MODULES NEED AND COULD NOT ASK. Match is EXACT string equality on the id —
 * no case folding, no slugging, no prefix match. `concept.phase-change.5` is either a node the
 * instructor wrote or it is not, and every tolerance that could be added here converts a typo
 * into a false authorization: the dangling link would then LOOK approved, which is precisely the
 * fabrication §1's absent-spineRef rule and §5b's gate row exist to prevent.
 *
 * @param {object} spine SPINE object
 * @param {string} ref a spineRef, e.g. `concept.phase-change.2`
 * @returns {object|null} the node, or null when the target does not exist
 */
export function spineNode(spine, ref) {
  const id = String(ref ?? "");
  if (!id) return null;
  return (spine?.nodes ?? []).find((n) => n.id === id) ?? null;
}

/**
 * Does this spineRef's target exist? (interfaces §5b, rows 1 and 2.)
 * @param {object} spine SPINE object
 * @param {string} ref a spineRef
 * @returns {boolean}
 */
export function hasSpineNode(spine, ref) {
  return spineNode(spine, ref) !== null;
}

/**
 * The dangling refs in a list — the gate's shape of the same question.
 *
 * Sorted and de-duplicated: a gate reports one flag per dangling target, not one per mention.
 * Empty/absent refs are NOT dangling — an absent link is honest (interfaces §1) and flagging it
 * would punish the exact behavior the contract asks for.
 *
 * @param {object} spine SPINE object
 * @param {string[]} refs candidate spineRefs
 * @returns {string[]} sorted unique refs with no node
 */
export function danglingSpineRefs(spine, refs) {
  const list = Array.isArray(refs) ? refs : [];
  return [
    ...new Set(
      list
        .map((r) => String(r ?? ""))
        .filter((r) => r && !hasSpineNode(spine, r)),
    ),
  ].sort(byString);
}

/**
 * M7 (round-3 audit): elementary cycles among prerequisite edges (a node that must precede itself).
 * Ordered, deduplicated, each cycle rotated to start at its smallest id, so the report is stable.
 * @param {{edges?:Array<{from:string,to:string}>}} spine
 * @returns {string[][]}
 */
export function spineCycles(spine) {
  const adj = new Map();
  for (const e of spine?.edges ?? []) {
    if (!e?.from || !e?.to) continue;
    if (!adj.has(e.from)) adj.set(e.from, new Set());
    adj.get(e.from).add(e.to);
  }
  const seen = new Set();
  const out = [];
  const stack = [];
  const onStack = new Set();
  const visit = (node) => {
    stack.push(node); onStack.add(node);
    for (const next of [...(adj.get(node) ?? [])].sort()) {
      if (onStack.has(next)) {
        const cycle = stack.slice(stack.indexOf(next));
        const min = cycle.indexOf([...cycle].sort()[0]);
        const rotated = [...cycle.slice(min), ...cycle.slice(0, min)];
        const key = rotated.join("→");
        if (!seen.has(key)) { seen.add(key); out.push(rotated); }
      } else if (!visited.has(next)) visit(next);
    }
    stack.pop(); onStack.delete(node); visited.add(node);
  };
  const visited = new Set();
  for (const node of [...adj.keys()].sort()) if (!visited.has(node)) visit(node);
  return out.sort((a, b) => (a.join() < b.join() ? -1 : 1));
}
