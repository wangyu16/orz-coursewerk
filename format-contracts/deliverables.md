# Format contracts — exact

Coursewerk builds an **Alembic package**: a directory tree Alembic ingests with zero friction.
Each deliverable MUST honor its contract below. The gate (`scripts/gate.mjs`; its format module MS3 and the
skeleton's spine checks) enforces both the **Alembic contract** (will it upload?) and these **format contracts**.
A v0.12 package, not yet migrated, is still checked by `scripts/check_oer.mjs`.

## The package tree

You author into `package/` — the Alembic package of plain texts (orz text format 1), which is the source of truth
and the thing that ships. (Assembled carriers are built separately into `preview/`; see the last section.)

```
package/
  alembic.json                 # the manifest (required) — see §manifest
  LICENSE                      # full license text matching alembic.json (required)
  README.md                    # optional landing note (allowed at root)
  study-guide/<slug>.md        # per chapter — the study guide (orz-markdown, rich)
  concepts/<slug>.md           # per chapter — concept map (plain markdown, no graphics)
  concepts/course.md           # course-wide concept map (plain markdown)
  slides/<slug>.slides.md      # per chapter — slide deck TEXT (orz-slides; header with carrier: slides; older packages: slides/<slug>.md)
  practice/<slug>.md           # per chapter — practice sheet (orz-markdown)
  assessment-support/<slug>.md # per chapter — assessment guide (plain markdown, no graphics)
  assets/…                     # figures/structures/plots/media (self-generated or open-licensed)
  assets/…/<asset>.about.json  # optional: Alembic's description of an asset (SITE-TYPE-CONTRACT draft 12); travels with it, no asset of its own
  private/coursewerk/FOUNDATION.json     # intended use · sources · rights/license evidence · privacy (required)
  private/coursewerk/PROVENANCE.json     # structured record for every incorporated asset/item (required)
  private/coursewerk/MEDIA_PLAN.json     # reviewed decision for chapters without a real photograph
  private/coursewerk/SOURCE_RECORD.json  # exact compact source revision/retrieval/digest record (required)
  provenance/coursewerk/ATTRIBUTION.md      # asset · source · license · attribution  (NOT at root — see note)
  private/coursewerk/DOCUMENTS.json      # optional declared mdhtml/slides/paged collection sources
  private/coursewerk/evidence/…          # local source-rights evidence snapshots
  private/coursewerk/preflight/…         # hash-bound public-source receipts; optional/advisory for non-published work
  # the harness's records (spine v2) — written by the commands, committed with the package, never hand-edited:
  private/coursewerk/coursewerk.json     # package settings: "spine": 2, retrieval destinations
  private/coursewerk/LOG.jsonl           # the hash-chained decision log: approvals, steering, answers, transitions, publish …
  private/coursewerk/STEERING.json       # the instructor's standing preferences (M2)
  private/coursewerk/units/…             # the unit index: every unit's id, origin, spine links, evidence
  private/coursewerk/spine/…             # who proposed each spine item (standardized from the instructor, or the agent's)
  private/coursewerk/verification/…      # every verifier and review dispatch, with its exact prompt and answer
  private/coursewerk/corrections/…       # every auto-correction, with its before and after
  private/coursewerk/REFERENCE_RECORD.json # the retrieved references the evidence cites (url, time, hash)
  private/coursewerk/LINK_RESOLUTIONS.json # recorded resolution of external links
  private/coursewerk/publish/…           # the instructor's publish decisions
  private/…                    # instructor-only: answer keys, exams, notes (NEVER shared)
```

v0.12 records (`KEY_FACT_REVIEW.json`, `VISUAL_REVIEW.json`, `COMPONENT_INDEX.json`, `CLAIMS.json`, `claims/`, `TERMS.json`,
`SPINE.json`, `REVIEW_QUEUE.json`, `OVERRIDES.json`) are not part of a spine-v2 package; see `docs/migrating-from-v0.12.md`.

**Folder → repo is decided by the top-level folder and is total.** `study-guide/ slides/ practice/
concepts/ assessment-support/ assets/ provenance/` are **public** (shared with the world);
`private/` is **PRIVATE** (instructor-only, and the harness's working record in `private/coursewerk/`). Never put instructor-only material anywhere but
`private/`. Any other top-level folder, or a stray file at the root, is **rejected** by Alembic
(fail-closed) — stick to the tree above. `<slug>` is lowercase, hyphen-joined
(`^[a-z0-9]+(?:-[a-z0-9]+)*$`), and matches the chapter's `slug` in `alembic.json`.

> **Attribution & reports live where the contract allows.** The only files permitted at the package
> root are `alembic.json`, `LICENSE`, `README.md`, `CITATION.cff`, `.gitignore`. So the asset record
> goes in **`provenance/coursewerk/ATTRIBUTION.md`**, not at the root. The QA report / evaluation / delivery note
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
  Alembic's lower-level contract also recognizes `ALL-RIGHTS-RESERVED`, but the Coursewerk public profile
  intentionally fails closed to open, cleared output. A private package carries the same manifest; it is packed
  with its profile recorded and is never cleared for public release. See
  `docs/authoring-guidelines.md` §7.
- **Do NOT set `publicRepo` / `privateRepo`** — Alembic assigns repository coordinates.
- `chapters` is the ordered chapter list; each declared chapter MUST have `study-guide/<slug>.md`.

| # | File | Format | Contract |
|---|------|--------|----------|
| 1 | `concepts/<slug>.md` | **Plain Markdown, NO graphics** (any parser, readable raw; the format-1 header Alembic writes is allowed and is not plan content) | **THE SPINE — see §Concept maps for the required sections.** Concept/topic dependency logic + per-section objectives + the `## Key terms` vocabulary authority. Headings, nested lists, tables, text arrows (→) only — no mermaid, no images, no `{{plugins}}`. Everything student-facing is derived from this file, and the index resolves every term through it. |
| 2 | `study-guide/<slug>.md` | **orz-markdown**, visually rich | Concise study guide derived from the concept map; opens with objectives; the reference box (`:::info` Reference/Audience/Package license) closes it, under its own last section `## About this chapter`; the reference and chapter-objectives boxes carry facts, so they stay teaching units and each owes a spine link (the chapter's objectives); figures + worked **example questions** (container tabs); full orz feature use (KaTeX/mhchem, `{{smiles}}`, mermaid, `:::info/:::success`, columns). Every Mermaid/chart block has a nearby visible `**Visual description:**`/`**Data summary:**`. Each `## H2` section MAY carry a stable block ID `{{attrs[#blk-…]}}`. MAY open with a header (`{{nyml`↵`kind: document`↵…`}}`: `title`, `theme`, `measure`, `lang`; no `uid`). Assembled to `.md.html` by **orz-mdhtml** for preview. |
| 3 | `slides/<slug>.slides.md` (older packages: `slides/<slug>.md`) | **orz-slides text** (format 1) | Deck TEXT, not HTML. Opens with the header `{{nyml`↵`kind: document`↵`carrier: slides`↵`title: …`↵`ratio: 16:9`↵`}}` (deck keys: `title`, `theme`, `ratio`, `footer`, `transition`, …; no `uid`; a 0.x `<!-- deck -->` block is an error); slides separated by the `<!-- slide -->` marker (NOT bare `---`); `# H1` on a `<!-- slide template=title -->` = title slide; `## H2` = content-slide title; `<!-- slide template=closing -->` for the closing slide. One concept per slide. **Reuse only the study guide's `../assets/` figures.** Assembled to `.slides.html` by **orz-slides** for preview. The gate requires `template=title`, `template=outline` and `template=closing` slides and an objective slide. |
| 4 | `assessment-support/<slug>.md` | **Plain Markdown, NO graphics** (the format-1 header Alembic writes is allowed) | Per objective, **how to design** questions/activities (assignments, discussion, quizzes, exams, projects) at the right cognitive level — guidance, **NOT a question bank**. Part of the spine: each objective's section and each question guide follow the grammar in §Assessment guides, so the gate can count what the practice sheet owes. |
| 5 | `practice/<slug>.md` | **orz-markdown** | Concrete questions instantiated from the assessment guide — at least each guide entry's **Count** — each question unit linked to its guide entry; each Q + worked answer in container tabs (`:::: tabs` / `::: tab`); correct, work shown. MAY open with a header (`{{nyml`↵`kind: document`↵…`}}`: `title`, `theme`, `measure`, `lang`; no `uid`). Assembled to `.md.html` by **orz-mdhtml** for preview. |
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

**What the agent adds is marked as its proposal.** Standardizing means restructuring what the instructor said. When
the agent adds a concept, an objective or a misconception the instructor did not state, the item is recorded as the
agent's proposal (`private/coursewerk/spine/`), shown as such in the approval view (`spine.mjs preview`), and becomes part of
the course only by the instructor's approval. Never present an added node as the instructor's.

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
1. <what the student can DO after this chapter> [anchor: <slug>]

## Concept sequence
1. <a claim-shaped sentence: "A solid melts at a characteristic temperature."> [anchor: <slug>]
2. <the next claim> [prereq: concept.<chapter>.<anchor>] [anchor: <slug>]

## Key terms
- **<preferred label>** (<alias>, aliases: <alias>) — <one-line gloss> [concept.<chapter>.<anchor>]

## Misconceptions to surface
- <the WRONG belief, stated as the student would hold it> [anchor: <slug>]
```

**Every objective, concept and misconception ends with `[anchor: <slug>]`.** Its id is `<kind>.<scope>.<anchor>`
(`objective.le-chatelier.state-principle`): ids never depend on position, so reordering or inserting an item keeps
every other id. Anchors are lowercase, hyphen-joined and unique in their document; `spine.mjs anchor` mints any
that are missing.

| Section | Shape | Becomes | Notes |
|---|---|---|---|
| `## Objectives` | ordered list, each item anchored | `objective.<slug>.<anchor>` | what is taught; every objective needs a section in the assessment guide |
| `## Concept sequence` | ordered list, each item anchored | `concept.<slug>.<anchor>` | written as **sentences**, not noun phrases; `[prereq: <id>, …]` names the concepts it builds on (no cycles) |
| `## Key terms` | unordered list | `term.<slug>` | **the vocabulary authority** — see below; the parent bracket names an existing node id |
| `## Misconceptions to surface` | unordered list, each item anchored | `misconception.<slug>.<anchor>` | **negative claims**: state the misconception, not its correction; question guides target them |
| `## Prerequisites` | unordered list | — | free list: what the chapter assumes |
| `## Source and scope` · `## Summary` | prose | — | informational |

`concepts/course.md` uses `# Course Concept Map — <Title>`, `## Organizing question`, `## Summary`,
`## Concept sequence` (anchored, `concept.course.<anchor>`), `## Chapter sequence` (`1. **<chapter-slug>** — <title>`,
matching the manifest's order), an optional `## Objectives` (anchored), and an optional `## Key terms`.

`node scripts/spine.mjs check` must pass. It reports every missing section, missing or duplicate anchor, unresolved
prerequisite or cycle, term bracket naming no node, chapter sequence that disagrees with the manifest, objective
with no guide section, and guide entry with a missing field.

### Assessment guides — `assessment-support/<chapter-slug>.md`

```markdown
# Assessment Guide — <Chapter Title>

## <objective, in words> [objective: <objective anchor>]

**Cognitive level:** <remember | understand | apply | analyse | evaluate | create>

### <question guide title> [anchor: <slug>]

- **Type:** <short answer | calculation | classification | …>
- **Count:** <n — how many practice questions the guide asks for>
- **Level:** <cognitive level, if it differs from the objective's>   (optional)
- **Targets:** misconception.<chapter>.<anchor>                         (optional)

<how to design the question: parameters to vary, what a correct answer shows, a rubric>
```

Each objective gets one `##` section, and each question guide is a `###` entry with an anchor
(`guide.<chapter>.<anchor>`). The practice sheet must link at least **Count** questions to each entry
(`guide-entry-short` otherwise). Prose between the entries is guidance and is free.

### The spine is approved, and changes are traced

The concept maps and the assessment guides are the spine. The instructor approves each chapter's pair and the course
map; the approval is bound to their exact content. After an edit:
- a light change (wording only) needs a glance confirmation;
- anything else needs a full re-approval;
- a structural change (objectives split, merged or moved; chapters reordered) opens a new major version.

The agent standardizes the instructor's raw input and proposes; it never edits an approved spine on its own
(`PROCEDURE.md`).

### `## Key terms` is the vocabulary authority — and `## Keywords` is NOT a section

A term declared here is **authorized**; a word that merely appears in prose is not. The checks resolve key terms
through this list, and units that use a term depend on it. Aliases are what make a **rename** detectable — when IUPAC recommends
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
- **melting point** (fusion point, aliases: melting temperature) — temperature at which a solid melts [concept.phase-change.melting-point]
- **PAM** (protospacer adjacent motif) — the motif adjacent to the target [concept.crispr.pam-recognition]
- **Cas9**
```
The `[concept.<chapter>.<anchor>]` bracket links a term to the concept it belongs to. **Never guess it** — a bracket
naming a concept that doesn't exist is a dangling link *that looks authorized*, which is worse than an
absent one, and the spine check refuses it (`term-parent`). Omit it: the term is still registered, without a spine
parent.

### What a missing spine costs you

Without a valid, approved spine there is nothing to check the package against. So `spine.mjs check` fails, the
gate raises the problems as defects, and no chapter publishes. A missing `## Key terms` is allowed, but the checks then
have no vocabulary to resolve: keep it.

## v0.12 claim-provenance declarations

v0.12 packages declared claims in front matter and `private/coursewerk/claims/` for the semantic index. A spine-v2 package does
not need them: the harness segments every deliverable into units, records each unit's origin and spine links
(`scripts/units.mjs`), and checks facts per unit. Existing declarations do no harm; see `docs/migrating-from-v0.12.md`.

## Copyright (non-negotiable)
Every visual is **self-generated** (RDKit/matplotlib via `oer-figures`) or **openly-licensed**
(CC0 / Public Domain / CC-BY / CC-BY-SA — Wikimedia Commons, Openverse) or the **source textbook's
own** figure *if its license permits and it carries no third-party credit line*. Each is recorded
in structured `private/coursewerk/PROVENANCE.json` and public `provenance/coursewerk/ATTRIBUTION.md` (asset · source URL · license · attribution). Verified external media also retains an authoritative description/license-page snapshot and
structured capture/retrieval metadata under `private/coursewerk/evidence/`; a remembered URL/license label is insufficient.
Copyrighted/paywalled or
third-party-credited assets are **never** embedded. A copyrighted textbook or paper may still be a **reference** (D54: `use: "reference"`, rights basis
`reference-only`): its ideas inform the course and its text checks the facts, but no sentence of it is reproduced — the
gate refuses any run of 8 or more words shared with a pinned reference text. The package license follows the explicit supported
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
Facts are verified per unit, by a context-blind pass against pinned sources (`scripts/verify.mjs`); every
dispatch and every admitted quote is recorded in the package. Cross-deliverable coherence is traced by the unit
index: a unit is stamped with what it depends on, and goes back to re-verification when any of it changes.

## Tools & skills per deliverable
**Fetch the newest skills before writing a deliverable** — `node <harness>/scripts/skills.mjs` (installs them into
`.claude/skills/`; `--check` says whether yours are the newest), or read
`https://cdn.jsdelivr.net/npm/<pkg>/<pkg>-skills/SKILL.md`. Never write from a copy you cannot show is the newest.
- Study guide + practice (files 2, 5): the **orz-markdown** skill (syntax; orz-mdhtml for its header and carrier)
  + `skills/oer-figures` (figures).
- Slides (file 3): the **orz-slides** skill (header, deck grammar, layout) + `skills/courseguide-standards`
  (one-concept-per-slide pedagogy).
- Concept maps + assessment (files 1, 4): plain markdown — no tools needed.
- Optional collection docs (exam / syllabus / handout): the **orz-paged** skill.
- Cross-cutting quality (graphics ladder, semantic formatting, accessibility, coherence, notation):
  **`docs/authoring-guidelines.md`**.

Containers use the colon-fence syntax (`:::: tabs` / `::: tab <Label>` / `:::`), never `{{tabs}}`; the
outer fence has more colons than the inner. Simple inline plots use `{{chart}}`; complex plots use
matplotlib (see `skills/oer-figures`). The QA gate flags unclosed containers and escaped pipes.

## The text is the course; the assembled file is clothes — ship the text
Every orz deliverable follows the family's **text format 1** (orz-markdown spec FC-18). One document has two forms:
the **text** (`slides/<slug>.slides.md`, …: canonical, what you write, what ships) and the **assembled file**
(`.md.html` / `.slides.html` / `.paged.html`: the text plus a regenerable shell).

- **The text is the source of truth.** All content and every author choice live in it. The assembled file holds the
  text exactly — `extract(assemble(text)).text === text`, byte for byte — and adds nothing to the content.
- **The header is document data, never content.** A `{{nyml`↵`kind: document`↵…`}}` block at the very top holds
  the title, theme, ratio, page settings and `carrier:`; it renders nothing to a reader. What a frame does print from
  it (a slide footer, a running header) is framing, read and checked as such. A spine file may carry the header too
  (Alembic writes one, with its `uid`, on every document); it is document data, never plan content.
- **No identity invented.** Never write a `uid` yourself: Alembic assigns it. A `uid` Alembic wrote stays as it is.
- **Clothes are built with the newest frames.** `node scripts/build_carriers.mjs` assembles each text with the
  newest published orz-mdhtml / orz-slides / orz-paged into `preview/` (regenerable, **never shipped**) and checks
  every carrier: it must extract to its exact text, and a carrier lint error fails the build. The receipt records the
  frames' versions and each text's sha256. A new frame changes the look, never the course.
- **Deliver lean (D53).** The local package is the full record; `node scripts/pack.mjs` delivers only what Alembic
  needs: the manifest of the published chapters, `LICENSE`, `README.md`/`CITATION.cff`, the published texts and
  checked declared documents, only the assets those texts use, `private/`, `provenance/coursewerk/ATTRIBUTION.md` and a small
  `provenance/coursewerk/PUBLISHED.json` (the decision, licence, authors, AI-assistance disclosure). No carrier, no working record
  (log, unit and verification records, evidence, settings) and no source text ships; Alembic assembles the carriers.
  The release receipt beside the archive counts what stayed local and binds the archive to the local log.
- **Migrating** a package from the 0.x forms (`<!-- deck -->` blocks): `docs/assembling-carriers.md`.

**License & identity across the strip:** the **license** is package-level (`alembic.json` +
`LICENSE`), never inside a shell, so nothing is lost. **Identity** (document permalink `uid`, block
ids, `packageId`, repo coordinates) is **assigned by Alembic when it reassembles** — coursewerk is
the origin and carries none of it. The one thing worth shipping for durable citation is the optional
`{{attrs[#blk-…]}}` block ids on study-guide sections (see file 2).
