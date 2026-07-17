# Format contracts — exact

Coursewerk builds an **Alembic package**: a directory tree Alembic ingests with zero friction.
Each deliverable MUST honor its contract below. The QA gate (`scripts/check_oer.mjs`) enforces
both the **Alembic contract** (will it upload?) and these **format contracts** (is it good OER?).

## The package tree

You author into `package/` — the **lean** Alembic package, which is the source of truth and the
thing that ships. (Framework carriers are built separately into `preview/`; see the last section.)

```
package/
  alembic.json                 # the manifest (required) — see §manifest
  LICENSE                      # full license text matching alembic.json (required)
  README.md                    # optional landing note (allowed at root)
  study-guide/<slug>.md        # per chapter — the study guide (orz-markdown, rich)
  concepts/<slug>.md           # per chapter — concept map (plain markdown, no graphics)
  concepts/course.md           # course-wide concept map (plain markdown)
  slides/<slug>.md             # per chapter — slide deck SOURCE (orz-slides deck grammar)
  practice/<slug>.md           # per chapter — practice sheet (orz-markdown)
  assessment-support/<slug>.md # per chapter — assessment guide (plain markdown, no graphics)
  assets/…                     # figures/structures/plots/media (self-generated or open-licensed)
  metadata/FOUNDATION.json     # intended use · sources · rights/license evidence · privacy (required)
  metadata/PROVENANCE.json     # structured record for every incorporated asset/item (required)
  metadata/MEDIA_PLAN.json     # reviewed decision for chapters without a real photograph
  metadata/SOURCE_RECORD.json  # exact compact source revision/retrieval/digest record (required)
  metadata/KEY_FACT_REVIEW.json # mode-appropriate focused identity/license/fact critique (required)
  metadata/VISUAL_REVIEW.json  # hash-bound human browser/DOM carrier review (required)
  metadata/COMPONENT_INDEX.json # generated hashes + dependency graph (required before final QA)
  metadata/claims/<folder>/<slug>.json # optional claim-provenance declarations — see §declarations
  metadata/ATTRIBUTION.md      # asset · source · license · attribution  (NOT at root — see note)
  metadata/DOCUMENTS.json      # optional declared mdhtml/slides/paged collection sources
  metadata/evidence/…          # local source-rights evidence snapshots
  metadata/preflight/…         # hash-bound public-source receipts; optional/advisory for non-published work
  private/…                    # instructor-only: answer keys, exams, notes (NEVER shared)
```

**Folder → repo is decided by the top-level folder and is total.** `study-guide/ slides/ practice/
concepts/ assessment-support/ assets/ metadata/ current/` are **public** (shared with the world);
`private/` is **PRIVATE** (instructor-only). Never put instructor-only material anywhere but
`private/`. Any other top-level folder, or a stray file at the root, is **rejected** by Alembic
(fail-closed) — stick to the tree above. `<slug>` is lowercase, hyphen-joined
(`^[a-z0-9]+(?:-[a-z0-9]+)*$`), and matches the chapter's `slug` in `alembic.json`.

> **Attribution & reports live where the contract allows.** The only files permitted at the package
> root are `alembic.json`, `LICENSE`, `README.md`, `CITATION.cff`, `.gitignore`. So the asset record
> goes in **`metadata/ATTRIBUTION.md`**, not at the root. The QA report / evaluation / delivery note
> are written to **`reports/`** (a sibling of `package/`, never shipped).

## The manifest — `package/alembic.json`

```json
{
  "schemaVersion": 2,
  "packageId": "pending",
  "title": "Introductory General Chemistry",
  "license": "CC-BY-NC-SA-4.0",
  "description": "One-paragraph plain-text summary (~200 words).",
  "keywords": ["chemistry", "gases", "thermodynamics"],
  "discipline": "chemistry",
  "unitTerm": "chapter",
  "courseContext": {
    "courseName": "General Chemistry I",
    "level": "introductory",
    "instructor": "…", "courseNumber": "…", "department": "…"
  },
  "chapters": [
    { "slug": "gases", "title": "Gases" },
    { "slug": "thermochemistry", "title": "Thermochemistry" }
  ],
  "createdAt": "2026-07-12T00:00:00Z"
}
```

- **Required:** `schemaVersion` (use `2`), `packageId` (a placeholder — Alembic re-stamps it),
  `title`, `license`, `createdAt` (ISO-8601 ending in **`Z`** — a `+00:00` offset is rejected).
- **`license`** for a Coursewerk public OER is an **open license** — `CC-BY-4.0`, `CC-BY-SA-4.0`,
  `CC-BY-NC-4.0`, `CC-BY-NC-SA-4.0`, or `CC0-1.0` — compatible with the verified source decision.
  Alembic's lower-level contract also recognizes `ALL-RIGHTS-RESERVED`, but the Coursewerk public-OER profile
  intentionally fails closed to open, cleared output. Personal/restricted work has no Alembic manifest and
  lives under `personal/`. See
  `docs/authoring-guidelines.md` §7.
- **Do NOT set `publicRepo` / `privateRepo`** — Alembic assigns repository coordinates.
- `chapters` is the ordered chapter list; each declared chapter MUST have `study-guide/<slug>.md`.

| # | File | Format | Contract |
|---|------|--------|----------|
| 1 | `concepts/<slug>.md` | **Plain Markdown, NO graphics** (any parser, readable raw) | **THE SPINE — see §Concept maps for the required sections.** Concept/topic dependency logic + per-section objectives + the `## Key terms` vocabulary authority. Headings, nested lists, tables, text arrows (→) only — no mermaid, no images, no `{{plugins}}`. Everything student-facing is derived from this file, and the index resolves every term through it. |
| 2 | `study-guide/<slug>.md` | **orz-markdown**, visually rich | Concise study guide derived from the concept map; opens with objectives; figures + worked **example questions** (container tabs); full orz feature use (KaTeX/mhchem, `{{smiles}}`, mermaid, `:::info/:::success`, columns). Every Mermaid/chart block has a nearby visible `**Visual description:**`/`**Data summary:**`. Each `## H2` section MAY carry a stable block ID `{{attrs[#blk-…]}}`. Built to `.md.html` via **orz-mdhtml** for preview. |
| 3 | `slides/<slug>.md` | **orz-slides deck grammar** | Deck SOURCE, not HTML. Opens with a `<!-- deck\ntitle: …\nratio: 16:9\n-->` block; slides separated by the `<!-- slide -->` marker (NOT bare `---`); `# H1` on a `<!-- slide template=title -->` = title slide; `## H2` = content-slide title; `<!-- slide template=closing -->` for the closing slide. One concept per slide. **Reuse only the study guide's `../assets/` figures.** Built to `.slides.html` via **orz-slides** for preview. |
| 4 | `assessment-support/<slug>.md` | **Plain Markdown, NO graphics** | Per objective, **how to design** questions/activities (assignments, discussion, quizzes, exams, projects) at the right cognitive level — guidance, **NOT a question bank**. Several parameterized question guides per objective. |
| 5 | `practice/<slug>.md` | **orz-markdown** | ~15 concrete questions instantiated from the assessment guide, covering all major objectives; each Q + worked answer in container tabs (`:::: tabs` / `::: tab`); correct, work shown. Built to `.md.html` via **orz-mdhtml** for preview. |
| — | `concepts/course.md` | **Plain Markdown, NO graphics** | Course-wide concept map + overall summary + course-wide `## Key terms`. See §Concept maps. (**Not** a `## Keywords` dump — that is an authoring input, not a stored section.) |
| — | `private/…` | Plain Markdown | Answer keys, full solutions, exam content, instructor notes — **PRIVATE**, never in a public folder. |

## Concept maps — the spine

`concepts/` is not a deliverable like the others. It is the **spine**: the instructor's decision about
*what is taught, to what depth, and in what order*. Everything student-facing is derived FROM it, and
every other contract in this file points INTO it. Get this file right and the rest of the package has
an authority to be checked against; get it wrong and there is nothing to check against, only prose.

**It is co-created, and that is the point.** The instructor supplies raw, messy intent — a syllabus
dump, a list of topics, a paragraph, last year's outline. **The agent standardizes it into exactly the
format below; the instructor then reads and corrects it.** That review is where the instructor's
authority actually lands, so the format is optimized for **a human to eyeball and fix**, not for
machine convenience. If a section is hard to read back, it is the wrong format.

**The agent MUST NOT invent spine content.** Standardizing means *restructuring what the instructor
said* — never adding a concept, an objective, or a misconception they didn't. A fabricated spine node
puts words in the instructor's mouth about what their own course teaches, and every downstream check
would then enforce it as authoritative. When the raw input doesn't say, the section gets fewer entries
and the agent ASKS. Fewer honest nodes beat a complete invented one.

### `concepts/<chapter-slug>.md`

```markdown
# Concept Map — <Chapter Title>

## Source and scope
Adapts the version-pinned article **<Source>**.

## Summary
<a short paragraph>

## Prerequisites
- <concept assumed already known>

## Objectives
1. <what the student can DO after this chapter>
2. …

## Concept sequence
1. <a claim-shaped sentence: "A solid melts at a characteristic temperature.">
2. …

## Key terms
- **<preferred label>** (<alias>, aliases: <alias>) — <one-line gloss> [<concept.slug.n>]

## Misconceptions to surface
- <the WRONG belief, stated as the student would hold it>
```

| Section | Shape | Becomes | Notes |
|---|---|---|---|
| `## Objectives` | **ordered** list | `objective.<slug>.<n>` | ordinals are identity — **inserting in the middle renumbers the ones after it** |
| `## Concept sequence` | **ordered** list | `concept.<slug>.<n>` | written as **sentences**, not noun phrases; the order IS the prerequisite chain |
| `## Key terms` | unordered list | `term.<slug>` | **the vocabulary authority** — see below |
| `## Misconceptions to surface` | unordered list | `misconception.<slug>.<n>` | **negative claims**: state the misconception, not its correction |
| `## Prerequisites` | unordered list | incoming prereq edges | |
| `## Source and scope` · `## Summary` | prose | — | informational |

`concepts/course.md` uses `# Course Concept Map — <Title>`, `## Organizing question`, `## Summary`,
`## Concept sequence` → `concept.course.<n>`, `## Chapter sequence` (inter-chapter order), and an
optional `## Key terms` for course-wide vocabulary.

### `## Key terms` is the vocabulary authority — and `## Keywords` is NOT a section

The index resolves every term through this list. A term declared here is **authorized**; a word that
merely appears in prose is not. Aliases are what make a **rename** detectable — when IUPAC recommends
a new name and the instructor adopts it, the migration works *because* the old label survives as an
alias and is never deleted.

**Do NOT emit a `## Keywords` section.** A flat keyword dump — `adaptation; CRISPR array; spacer; …` —
is a fine thing for an instructor to *hand you*, and it is a legitimate **authoring input**. It is not
a stored section. Two vocabulary lists in one document are the same fact in two places: they drift,
and nothing tells you which one is the authority. **Standardize keywords INTO `## Key terms`** —
promoting each to a preferred label with its aliases, gloss, and the concept it hangs off — and ask
the instructor about any you cannot place. That promotion is exactly the work the agent is for.

Grammar (tolerant; every part after the label is optional):
```markdown
- **melting point** (fusion point, aliases: melting temperature) — temperature at which a solid melts [concept.phase-change.1]
- **PAM** (protospacer adjacent motif) — the motif adjacent to the target [concept.crispr.5]
- **Cas9**
```
The `[concept.x.n]` bracket links a term to the concept it belongs to. **Never guess it** — a bracket
naming a concept that doesn't exist is a dangling link *that looks authorized*, which is worse than an
absent one. Omit it and the gate will ask.

### What a missing spine costs you

A map without `## Concept sequence`, `## Objectives`, or `## Key terms` yields **fewer nodes, never
invented ones** — the parser is deliberately tolerant. But understand what "fewer nodes" means: with
no `## Key terms`, the vocabulary registry is **empty**, so no claim resolves to a term, so the index
cannot tell a rephrase from a fact change, and **the package reports zero flags it has not earned** —
a clean bill of health manufactured by a blind spot. The gate therefore reports a missing spine as a
**finding**, loudly. Silence would be the worse failure.

## Claim-provenance declarations

A **declaration** says, structurally and at write time, that a specific block of a deliverable is a
**claim**: what kind, which concept-map node it hangs off, which source it came from, which terms it
uses. Declarations are what the semantic index reads to tell a rephrase from a fact change, so an
edit to one melting point flags one claim instead of dirtying a whole file.

### Why declare (the honest pitch)

**A declared claim is authoritative and precise; an undeclared one is whatever a strict scan can
recognize structurally.** The scan is a **BACKSTOP, not a peer** — it exists so an undeclared claim
is *indexed and visible* rather than invisible, and it is built to **refuse to guess**:

- It **never invents a `spineRef`.** Your study guide restates `## Objectives` as an ordered list and
  the concept map mints `objective.<chapter>.<n>` from *its* ordered list — so item n "obviously" maps
  to objective n. It does not: a guide may reorder, subset or merge them. A guessed parent is a
  fabrication in a deterministic costume, so a scan-found claim gets **no parent at all**, and the
  orphan is flagged.
- It **never reads `definition`** — it does not scan for definitions at all. Telling *"X is the
  temperature at which…"* from *"X is hard to measure"* is parsing, and a wrong parse is worse than
  none. So an **undeclared definition is unindexed**, and the definition-drift detector cannot see it.
- It mints only what a **structural marker** proves: an `**Answer:**` marker, a list item under
  `## Objectives`, or a block carrying a **quantity** (a number bound to a recognized unit).
  Connective prose carries no duty and is deliberately unindexed.

So: **declare, and the system knows exactly what you asserted. Don't, and it indexes a strict subset
and stays quiet about the rest.** Nothing hard-fails for a missing declaration (a scan-found claim is
indexed and **WARNed**, and is a first-class claim in every other respect) — but the quiet is real,
and it is the part you cannot see from the outside.

**Declare the high-stakes types**, per the deliverable: facts carrying values/quantities,
definitions, answer keys, objective coverage. Never declare inline in student-facing prose — a
declaration is structural, and the reader never sees it.

### Where a declaration lives — two carriers, one rule

| Carrier | Where | Use it when |
|---|---|---|
| **Front matter** | a `---` fenced block at the **very top** of the deliverable's `.md` | the normal case — the declaration sits with the prose it describes |
| **Sidecar** | `metadata/claims/<deliverable-path-without-.md>.json` — e.g. `study-guide/gases.md` → `metadata/claims/study-guide/gases.json` | the declarations are generated/maintained apart from the prose |

> **THE PRECEDENCE RULE — one artifact, one declaration.** If a sidecar exists, **the sidecar IS the
> artifact's declaration.** Front matter is **NOT merged into it**, not consulted for anchors the
> sidecar omits, and not used as a fallback — *even if the sidecar declares nothing*, because an
> empty sidecar is the artifact saying "nothing here is declared", which is an answer. This is a
> RULE, not a tie-break: merging two sources would let them disagree about a single anchor and leave
> the parser picking a winner, which is the one thing it may never do. **Write one or the other.**

### The grammar (identical in both carriers)

The front-matter body **is JSON** — not YAML. There is no YAML parser in the toolchain, and a
hand-rolled YAML subset would be a parser that silently disagrees with every other YAML parser about
the one input that matters. The sidecar is the same document, as the whole file.

````markdown
---
{"schemaVersion": 1, "claims": [
  {
    "type": "fact",
    "anchor": "melting-point-of-water#1",
    "spineRefs": ["objective.phase-change.1"],
    "sourceRefs": ["src.wiki.melting.rev1"],
    "termRefs": ["term.melting-point"]
  },
  {
    "type": "answer-key",
    "anchor": "practice-phase-change#4",
    "derivedFrom": ["claim.phase-change.1f9c2a0b7d33"]
  }
]}
---
# Phase Change
…
````

A bare array (`[ {...}, {...} ]`) is accepted in place of `{"schemaVersion":1,"claims":[…]}`.

| Field | Required | Meaning |
|---|---|---|
| `type` | **yes** | One of `fact` · `objective` · `answer-key` · `definition` · `derived` · `procedure`. The enum is **closed**: an unrecognized type is refused, never coerced to the nearest member — coercion would assert a type nobody chose. |
| `anchor` | **yes** | Which block. `<nearest-heading-slug>#<ordinal-within-that-section>` — so `## Melting point of water` + its first paragraph = `melting-point-of-water#1`. Ordinals count **every** paragraph, list item, fenced block and table row under that heading, from 1 (a table's `\|---\|` separator asserts nothing and is not counted), and restart at each heading — editing one section cannot move another's anchors. Blocks above the first heading are `body#<n>`. |
| `spineRefs` | no (`[]`) | The concept-map nodes this claim hangs off: `concept.<chapter>.<n>` / `objective.<chapter>.<n>`. **The first one also decides the claim's chapter scope**, which decides which term an ambiguous label resolves to — so it outranks the file the claim sits in. |
| `sourceRefs` | no (`[]`) | The pinned source revisions it came from. |
| `termRefs` | no (**omit** ≠ `[]`) | The registered terms it uses (`term.<slug>`). **Omit** it and the index recognizes them for you. Declare `[]` and you are asserting *this claim names no registered term* — an authoritative statement, and it stands. |
| `derivedFrom` | no (**omit** ≠ `[]`) | The claim ids this claim is **derived from** — an answer key that depends on a stated value, a worked example that depends on a constant. **Declaring it is the ONLY way this edge exists**: nothing infers a derivation, and nothing will try. "The answer key sits under the question" is *adjacency, not authorship*, and a guessed derivation would put words in your mouth — then propagate an edit through a dependency you never asserted. Declare it and changing a value re-checks everything that depends on it. Declare `[]` to assert *this claim derives from nothing*. |

**There is no `text` field, deliberately.** The claim's prose is *always* the block standing at its
`anchor`. It was tried and removed: a declaration that carries its own prose can drift from the block
it points at, and then a direct **quotation** sits at the location while the declared text looks
freely rewritable — the exact fabrication the location exists to prevent. One fact, one home.

### What is refused, and what refusal costs you

An entry is honoured **whole or not at all** — never half. It is **refused** when: `type` is missing
or not in the enum; `anchor` is missing or empty; `spineRefs` / `sourceRefs` / `termRefs` /
`derivedFrom` is present but is not a list of non-empty strings (`"spineRefs": "concept.gases.1"` is a
**string, not a list** — refused); or the entry carries a `text` field. Half-honouring would mark the
claim declared-and-provenanced while silently discarding the parent you wrote.

**A refusal is REPORTED, not silent** — it does not merely cost you the declaration. The QA gate names
the entry and the reason (`spineRefs must be a list of non-empty strings, got a string
("concept.gases.1") — wrap a single ref in a list`), because the person who needs that message is the
one who *tried*. This matters more than it sounds: a refused declaration otherwise looks exactly like
a declaration you never wrote, so the warning you would get — *"this claim is undeclared"* — names the
wrong problem entirely. The same goes for a **malformed document**: front matter that is YAML instead
of JSON, or a sidecar of broken JSON, is reported rather than read as prose.

The refused block itself still **falls to the scan** and is indexed as *undeclared* — nothing crashes,
and one bad entry is not a file-wide veto: its well-formed neighbours stand. An `anchor` naming a block
that does not exist is reported the same way (restructured prose is the usual cause: anchors are
positional, which is exactly why a declared anchor is worth keeping current).

## Copyright (non-negotiable)
Every visual is **self-generated** (RDKit/matplotlib via `oer-figures`) or **openly-licensed**
(CC0 / Public Domain / CC-BY / CC-BY-SA — Wikimedia Commons, Openverse) or the **source textbook's
own** figure *if its license permits and it carries no third-party credit line*. Each is recorded
in structured `metadata/PROVENANCE.json` and public `metadata/ATTRIBUTION.md` (asset · source URL · license · attribution). Verified external media also retains an authoritative description/license-page snapshot and
structured capture/retrieval metadata under `metadata/evidence/`; a remembered URL/license label is insufficient.
Copyrighted/paywalled or
third-party-credited assets are **never** embedded. The package license follows the explicit supported
compatibility matrix for every adapted source; ShareAlike sources remain ShareAlike, while public domain is not
mislabelled as CC0.
Remote hot-linked media is release-blocking: fetch it into `assets/` and record it, so the package cannot lose
its evidence, accessibility text, or media when an external URL changes.
The mode-independent assurance contract is defined in `docs/assurance-kernel.md`. A public package must have
`usageProfile: public-oer`, verified source/license evidence, matching manifest/LICENSE, complete structured
provenance, required attribution in every applicable deliverable, and zero publication blockers.
Public output also identifies at least one final accountable non-AI person/institution, with explicit
rights-holder status and user confirmation. A source's authoritative
rights evidence is deterministically scanned before substantive source ingestion. Separate AI/automated-use
notices are preserved with legal effect undetermined; verified license/evidence conflicts and incompatible public
license claims remain blocking. Non-published source use remains advisory rather than blocked.
Light and Full modes both require the focused identity/license/key-fact critique: Light uses a separate
context-reset same-model pass and Full uses cross-model review. The record and human carrier review are bound to
current evidence, source, asset, and deliverable hashes; stale reviews block release.
Cross-deliverable coherence is defined in `docs/coherence-index.md`; every final package must have a current
generated component index, and every revision must complete the impact-review/attested-refresh protocol.

## Tools & skills per deliverable
- Study guide + practice (files 2, 5): `skills/orz-markdown` (syntax) + `skills/oer-figures` (figures).
- Slides (file 3): **`skills/orz-slides`** (deck grammar, layout, one-concept-per-slide pedagogy).
- Concept maps + assessment (files 1, 4): plain markdown — no tools needed.
- Optional collection docs (exam / syllabus / handout): **`skills/orz-paged`**.
- Cross-cutting quality (graphics ladder, semantic formatting, accessibility, coherence, notation):
  **`docs/authoring-guidelines.md`**.

Containers use the colon-fence syntax (`:::: tabs` / `::: tab <Label>` / `:::`), never `{{tabs}}`; the
outer fence has more colons than the inner. Simple inline plots use `{{chart}}`; complex plots use
matplotlib (see `skills/oer-figures`). The QA gate flags unclosed containers and escaped pipes.

## The framework is a build output, not source — ship lean
The orz files that read/edit standalone (`.md.html`, `.slides.html`, `.paged.html`) carry a heavy,
identical **framework shell**. Coursewerk treats them as **build artifacts**, not source:

- **Author lean.** The `.md` sources in `package/` are the source of truth.
- **Build carriers for preview.** `node scripts/build_carriers.mjs` renders each lean source into
  its framework carrier under `preview/` (via orz-mdhtml / orz-slides / orz-paged) so you can open,
  read, and check the real document. `preview/` is regenerable and **never shipped**.
- **Pack lean.** `node scripts/pack.mjs` zips `package/` **without** the carriers — Alembic
  reassembles the framework on its side and generates the permalinks/ids. Light to transport.

**License & identity across the strip:** the **license** is package-level (`alembic.json` +
`LICENSE`), never inside a shell, so nothing is lost. **Identity** (document permalink `uid`, block
ids, `packageId`, repo coordinates) is **assigned by Alembic when it reassembles** — coursewerk is
the origin and carries none of it. The one thing worth shipping for durable citation is the optional
`{{attrs[#blk-…]}}` block ids on study-guide sections (see file 2).
