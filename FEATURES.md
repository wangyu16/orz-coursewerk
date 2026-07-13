# Coursewerk features and the OER authoring problems they solve

Coursewerk is an agent-native production, formatting, assurance, and maintenance pipeline for open educational
resources. It turns source material into a coherent course package while automating much of the drafting,
cross-format production, proofreading, accessibility checking, rights tracking, package assembly, and revision
analysis that consumes human authors' time and commonly produces errors.

Its purpose is not to remove educators from authorship. It moves their effort away from repetitive production
work and toward the decisions that benefit most from human judgment: learning priorities, factual and pedagogical
review, local context, inclusive teaching choices, and final approval.

## The product promise

Coursewerk helps an author:

- move from a textbook, notes, or other traceable sources to a structured first draft much faster;
- produce a course outline, chapter concept maps, study guides, slide decks, assessment design, and practice as
  one aligned system instead of six disconnected projects;
- use rich, consistent formatting without hand-coding separate web, presentation, and print layouts;
- catch spelling, grammar, terminology, accessibility, link, asset, syntax, structure, and package problems
  before release, using agent review plus deterministic checks where checks exist;
- keep source rights, attribution, provenance, privacy, and publication readiness explicit and verifiable;
- hand-edit any output while making the change and its cross-document consequences visible to the next agent;
- deliver lean, editable Markdown and portable rendered views instead of locking the course into one authoring
  application.

## One source language, three finished reading experiences

Coursewerk authors with the [orz-markdown family](https://markdown.orz.how/). Standard Markdown remains readable
as source, while a shared richer language supplies semantic containers, layouts, math, chemistry notation,
diagrams, charts, media, and themes. Coursewerk can build three kinds of carrier from that source:

| Teaching need | orz tool and carrier | What the author and learner get |
|---|---|---|
| Web-style study guide, handout, article, or notes | `orz-mdhtml` → `.md.html` | A continuous themed document with live side-by-side Markdown editing, preview, optional scroll sync, and copy-as-Markdown |
| Lecture or presentation | `orz-slides` → `.slides.html` | A reveal.js deck with layout grammar, title/section/closing templates, fragments, notes, speaker view, timer, and slide numbers |
| Printed or PDF material | `orz-paged` → `.paged.html` | A4 or Letter pagination, margins, running headers/footers, page numbers, print templates, and browser print-to-PDF without a server |

Each carrier embeds its Markdown source and framework shell in an editable HTML file. It renders when opened and
can be edited with live preview directly in a browser. A text-only carrier can be a single file; a carrier that
references local figures must travel with its asset directory unless a future build explicitly reports
`single-file` portability. In-place saving is available in Chromium-based browsers; viewing, presenting, and
printing work in modern browsers. Rendered selections can round-trip back to clean Markdown, including tables,
math, plugin constructs, and diagram source.

Coursewerk keeps lean `.md` as the canonical package source and places these heavier carriers in `preview/`.
This gives authors convenient standalone files for local use, emailing, presenting, browser editing, and PDF
export while keeping the Alembic upload small and maintainable. Alembic can reconstruct the carriers from the
lean source. Browser edits are ideal for standalone use and experimentation; to retain them in the Coursewerk
package, save or copy the resulting Markdown back to the canonical `.md` file and rebuild the preview, because
generated preview carriers are replaceable build artifacts.

### Rich formatting without hand-built HTML

The common renderer supports:

- GitHub-flavored Markdown, tables, code, links, and ordinary semantic headings;
- callouts, warnings, success boxes, columns, tabs, spoilers, and custom-class containers;
- inline and display KaTeX math plus `mhchem` chemistry notation;
- Mermaid diagrams, data charts, SMILES chemical structures, QR codes, video embeds, emoji, and semantic spans;
- a consistent theme system across normal documents, slides, diagrams, math, and print;
- portable metadata such as authorship, license, canonical source, date, description, and keywords;
- framework verification for detecting modified embedded runtimes.

Coursewerk adds a house semantic palette and format contracts so this expressive vocabulary communicates
meaning consistently instead of becoming arbitrary decoration. Because self-contained HTML executes embedded
JavaScript, files from unknown sources must still be treated like applications and checked with the
[orz verifier](https://markdown.orz.how/verify.html) before opening.

## Where the time savings come from

Human OER authors often spend more time on mechanical coordination than on teaching ideas. Coursewerk reduces
that burden across the whole lifecycle:

1. **Scope and outline.** It extracts the requested source scope, learning objectives, prerequisite logic, and
   chapter sequence into a course concept map before prose expands.
2. **First-draft production.** It drafts the five required chapter deliverables from the same source and concept
   backbone, including worked examples, assessment guidance, and practice with solutions.
3. **Cross-format transformation.** It turns detailed study-guide logic into scannable slides and printable
   collections without requiring the author to rebuild the same material in separate applications.
4. **Formatting.** It applies reusable chapter skeletons, semantic styles, slide layouts, figures, notation, and
   print templates instead of asking the author to format every object manually.
5. **Language polish.** The authoring and critique passes check spelling, grammar, clarity, tone, terminology,
   and unnecessary repetition. These are agent-review tasks—not falsely represented as proof from the current
   deterministic QA script.
6. **Mechanical QA.** Scripts check package layout, manifest fields, links and asset paths, orz syntax,
   placeholders, required deliverables, format contracts, and the defined accessibility floor. Carrier receipts
   add build evidence, source-level image counts, and an honest portability classification; they do not claim a
   post-render browser audit that was not performed.
7. **Revision analysis.** Git shows what changed; a dependency graph calculates every declared related component
   that must be compared or updated, avoiding a manual search across the course.
8. **Assembly and delivery.** Preview building, QA reports, honest evaluation, and lean Alembic packaging are
   repeatable pipeline stages rather than one-off cleanup work.

## OER pain points and Coursewerk responses

The labels in the last column matter:

- **Hard gate** — release is refused when the condition is unresolved.
- **Automated check** — a deterministic script detects a defined class of defects.
- **Agent workflow** — the executor is instructed to perform and self-review the work; quality still benefits
  from educator review.
- **Human decision** — Coursewerk organizes evidence but does not pretend to replace expert judgment.

### Planning, pedagogy, and drafting

| Pain point | How Coursewerk addresses it | Assurance level |
|---|---|---|
| Blank-page cost and slow first drafts | Builds from a named source, explicit scope, audience, pedagogy, and chapter skeleton | Agent workflow |
| A textbook sequence is copied without a teachable course structure | Creates a course concept map, prerequisite relationships, teaching order, section objectives, summary, and discovery terms first | Agent workflow + indexed backbone |
| Learning objectives are detached from instruction and assessment | Objectives drive concept maps, explanations, slides, assessment guidance, and practice; dependency edges preserve that alignment | Agent workflow + coherence gate |
| Study guides, slides, and practice are separately drafted several times | Derives all five chapter deliverables from one concept and study-guide logic | Agent workflow + structural check |
| Slide decks become dense prose or bullet dumps | Enforces one concept per slide, an outline spine, varied layouts, concise phrasing, figures, examples, and presenter-oriented structure | Agent workflow + format checks |
| Assessment is an afterthought | Produces objective-level assessment design with cognitive level, then instantiates it as practice | Agent workflow + completeness check |
| Examples and answers contradict the lesson | Connects teaching explanations, assessment support, and practice through explicit dependency edges and revision review | Hard coherence gate |
| Materials feel generic or abstract | Requires meaningful figures, everyday examples, worked problems, and source-grounded discipline notation | Agent workflow + human decision |
| Subject facts or numbers are invented | Requires every fact, value, structure, and dataset to come from the source; missing evidence receives `[VERIFY]` rather than a guess | Hard rule + automated placeholder check + human review |

### Formatting, media, and multi-format publishing

| Pain point | How Coursewerk addresses it | Assurance level |
|---|---|---|
| Authors must learn HTML/CSS, slide software, and desktop publishing separately | Uses one Markdown-centered orz language for continuous web documents, slide decks, and paginated print | Agent workflow + carrier build |
| The same content is reformatted manually for web, lecture, and PDF | Shared source conventions and coordinated transforms produce `.md.html`, `.slides.html`, and `.paged.html` experiences | Agent workflow + carrier build |
| Rich STEM notation is difficult and inconsistent | Supplies KaTeX math, `mhchem`, SMILES, Mermaid, charts, and generated SVG workflows | Agent workflow + syntax/build checks |
| Layout work is repetitive and fragile | Reusable callouts, columns, tabs, slide regions/templates, print templates, and themes replace hand-positioned objects | Agent workflow + format checks |
| Formatting becomes decoration rather than meaning | A semantic palette gives each box, color, badge, tab, and layout one stable instructional purpose | Agent workflow + course consistency review |
| Figures are dry, inaccurate, oversized, or visually inconsistent | Uses a graphics ladder: exact self-generated diagrams/data, attributed open photographs, and disclosed AI concept art with guardrails | Agent workflow + provenance gate + human visual review |
| Documents depend on a hosted platform or special reader | Text-only inline carriers can travel as one file; media-bearing carriers travel with their asset directory and declare that dependency | orz-family capability + carrier receipt |
| Readers cannot adapt rendered material | Browser editing, embedded Markdown source, and copy-as-Markdown preserve editability and reuse | orz-family capability |
| Print output requires rebuilding the document | Paged carriers provide page geometry, running furniture, templates, and print-to-PDF from the browser | orz-family capability + human print review |
| Heavy generated HTML bloats the shared course repository | Lean Markdown ships; generated carriers are regenerable previews and excluded from the Alembic ZIP | Automated pack rule |
| An unknown self-contained HTML file may contain modified code | The orz framework can be hash-verified and content scanned before trust | orz verifier + user security decision |

### Editing, collaboration, and long-term maintenance

| Pain point | How Coursewerk addresses it | Assurance level |
|---|---|---|
| A user edits a file and the next agent cannot tell what changed | Automatically initializes `package/` and `personal/` as independent Git repositories | Automated Git ledger |
| A clean Git tree is mistaken for a coherent course after the user commits | Compares current hashes and the index hash with an external accepted-state ledger independently of Git status | Hard coherence gate |
| Updating one explanation leaves slides, questions, or answers stale | Computes the transitive downstream review/update set declared by the component graph and supplies upstream authoritative context | Automated impact analysis + hard gate |
| A revision plan becomes invalid during continued editing | Includes the current hashes, relationships, Git baseline, and working changes in a content-digest plan identity | Hard coherence gate |
| Two Coursewerk branches make individually reasonable but conflicting changes | Coursewerk's system index computes merge-base impact across claims, code, tests, skills, templates, and documentation | Branch-aware hard gate |
| An agent overwrites careful human edits | Entry instructions require status/diff inspection and preservation of direct user edits | Agent hard rule + Git recovery |
| Terminology, notation, structure, or visual style drifts between chapters | Shared contracts, user preferences, chapter skeletons, component dependencies, and whole-package review keep one course voice | Agent workflow + automated structure checks |
| A new agent lacks prior context | Foundation, provenance, component index, Git history, progress ledger, and user harness externalize durable decisions | Recorded evidence |
| Repeated requests consume too much model quota | Light mode uses bounded chapter batches and deterministic gates; Full mode adds cross-model critique | Workflow choice; hard rules unchanged |

### Proofreading, accessibility, and quality assurance

| Pain point | How Coursewerk addresses it | Assurance level |
|---|---|---|
| Spelling and grammar cleanup consumes expert time | AI authoring, critique, and self-review passes proofread prose while keeping the educator responsible for final language | Agent workflow + human approval |
| Terminology or voice changes across deliverables | House terminology, user preferences, source grounding, and cross-component review apply one vocabulary and tone | Agent workflow + coherence review |
| Accessibility is postponed until the end | Authoring rules require meaningful alt text, semantic headings, descriptive links, table headers, and redundant non-color signals from the start | Hard rule + automated accessibility floor + human review |
| Images lack alt text | QA detects missing Markdown image alternatives; authoring guidance requires descriptions of instructional meaning | Automated check + human quality review |
| Runtime diagrams disappear or expose raw source offline | QA requires a visible textual description/data summary next to every Mermaid/chart block | Hard release gate + runtime visual review |
| Heading structure is confusing | QA blocks empty headings, non-H1 starts, and heading-level jumps; format contracts define document skeletons | Hard release gate |
| “Click here” links provide poor context | QA blocks non-descriptive link text | Hard release gate |
| Syntax errors silently break rich formatting | Carrier builds and orz nesting/plugin checks detect invalid source before delivery | Automated check |
| Broken files, links, and asset references appear only after publication | QA resolves local links, asset paths, allowed folders, and renderable package objects | Automated check |
| Every chapter has a different outline or missing deliverable | Manifest-aware structural checks require the five components for every declared chapter | Hard release gate |
| Automated scores create false confidence | Evaluation distinguishes auto-verified dimensions, residual defects, cosmetic human checks, and unverified subject expertise | Mandatory honest report |
| Scientific and pedagogical quality cannot be reduced to syntax | Full mode adds independent critique; every mode retains educator review and explicit `[VERIFY]` markers | Human decision; never claimed as fully automated |

### Copyright, licensing, provenance, and privacy

| Pain point | How Coursewerk addresses it | Assurance level |
|---|---|---|
| An agent guesses or misstates the source license | Requires exact source identity/version/scope, authoritative evidence URL/type/date, a hashed local evidence snapshot and verifier, and known-source policy assertions | Hard assurance gate |
| A license page also contains a process-specific AI/automated-use notice | Deterministically scans the authoritative rights snapshot before source ingestion and stops until permission or a qualified decision is recorded | Hard assurance gate + accountable human/legal decision |
| “Educational use” is mistaken for permission to publish | Selects personal-private, restricted-teaching, or public-OER use before choosing an output license | Hard assurance gate |
| Fair use/fair dealing is treated as universal or permanent | Records jurisdiction and asserted basis; an exception never clears public release automatically | Hard assurance gate + human legal decision |
| Private materials later need publication but their origins are lost | Requires provenance even without an output license; unknown/private-only items stay visibly labelled | Hard private-readiness rule + future-publication blocker |
| Public output has no accountable author or licensor | Requires a named non-AI author/rightsholder and rejects AI/tool identities as the creator of purportedly original assets | Hard assurance gate |
| Output licensing conflicts with an adapted source | Cross-checks source obligations, `FOUNDATION.json`, `alembic.json`, and the full `LICENSE` text | Hard assurance gate |
| Figures and media lose attribution | Verifies local paths and use locations, blocks hot-linked media, and generates public attribution from structured provenance | Hard assurance gate |
| Text is copied too closely from a textbook | Binds primary source IDs to hashed comparison text; unavailable comparisons require explicit dated human attestation | Automated discovery gate + human review |
| Instructor answers or restricted content leak into public folders | Enforces public/private paths and refuses invalid package layouts | Hard package gate |
| Personal or restricted information is accidentally published | Foundation privacy assertions and item publication status are checked before packing | Hard assurance gate + human data review |
| OER attribution becomes unreadable or impossible to update | Keeps structured machine-readable provenance alongside a human-readable attribution record | Recorded evidence + consistency check |

### Packaging, discovery, reuse, and delivery

| Pain point | How Coursewerk addresses it | Assurance level |
|---|---|---|
| A collection of good files still fails platform import | Mirrors the Alembic manifest, folder, filename, chapter, public/private, and renderable-object contract | Hard package gate |
| Metadata is incomplete for discovery | Requires title, description, keywords, discipline, course context, chapter order, license, provenance, and attribution as applicable | Contract and assurance checks |
| Build artifacts obscure the editable source | Treats lean Markdown as canonical and generated carriers as disposable previews | Architecture rule |
| Authors manually repeat build and ZIP steps | Packing reruns QA and carriers, generates an evidence-based evaluation, creates the archive, and writes a hash-bound receipt | Automated pipeline |
| A private or uncleared package is accidentally published | `pack.mjs` reruns the release gate and refuses non-public profiles or unresolved blockers | Hard fail-closed release |
| Future adopters cannot modify the resource | Open-license compatibility, Markdown source, portable metadata, browser-editable carriers, and Alembic repositories preserve reuse | Assurance gate + open architecture |
| Maintenance becomes harder than the initial release | Git history, component indexing, revision impact, structured provenance, and regenerable views support continuing adaptation | Automated records + attested workflow |

## Revision safety model

Coursewerk deliberately uses two complementary records:

1. **Git answers “what changed?”** It records direct human and agent edits, additions, deletions, renames, and
   user-authored commits.
2. **The component graph answers “what else could now be inconsistent?”** It propagates changes through course
   logic, chapter objectives, explanations, slides, assessment design, practice answers, assets, licensing, and
   provenance.

After the first complete coherence pass, Coursewerk indexes and commits the baseline. For every later revision it
generates an impact plan, requires review of the complete transitive set represented in the graph, invalidates the plan after any further
edit, and accepts the new state only with a substantive attestation. QA and public packing fail while that state
is missing or stale.

Coursewerk applies the same model to its own repository. `system/COURSEWERK_INDEX.json` maps product claims,
implementation, tests, instructions, templates, skills, contracts, and release metadata. Branch impact is
computed from the target Git merge base, so concurrent work cannot silently preserve a stale review.

## What Coursewerk verifies—and what it does not

Coursewerk is deliberately explicit about assurance boundaries:

| Dimension | Coursewerk can verify automatically | Still needs human judgment |
|---|---|---|
| Package and format | Required files, manifest structure, allowed paths, syntax, links, asset references, carrier builds | Whether the final visual hierarchy and density work for the actual learners |
| Accessibility | Missing alt attributes, diagram/chart text alternatives, heading jumps, weak link text, and rule compliance proxies | Post-render DOM behavior, quality of alternatives, cognitive accessibility, captions/transcripts, assistive-technology testing, accommodation fit |
| Language | Placeholders and structural issues; agent passes can proofread | Nuance, disciplinary voice, inclusive language, and final editorial acceptance |
| Accuracy | Source identity and `[VERIFY]` discipline; Full mode can add critique | Expert confirmation of facts, calculations, examples, and pedagogy |
| Rights | Recorded source evidence, license agreement, attribution completeness, publication blockers | Jurisdiction-specific legal interpretation and authority to disclose private data |
| Coherence | Changed hashes, dependency impact, structural completeness, stale plans | Whether a reviewed dependent is substantively aligned and educationally effective |

## Main evidence artifacts

- `metadata/FOUNDATION.json` — intended use, exact source identity, rights evidence, output license, and privacy.
- `metadata/evidence/…` — hashed local snapshots plus structured retrieval/capture metadata for authoritative source-rights evidence.
- `metadata/preflight/…` — hash-bound source-policy receipts; source preparation refuses missing, blocked, or stale clearance.
- `inputs/SOURCE_CORPUS.json` — source IDs bound to raw and extracted hashes, canonical retrieval evidence, versioned extractors, or explicit attestation.
- `scripts/prepare_wikipedia_topic.mjs` — serialized, revision-aware collection of several cleared English Wikipedia pages into a chapter-sized science corpus.
- `metadata/PROVENANCE.json` and `metadata/ATTRIBUTION.md` — item-level origin, status, use, and public credit.
- `metadata/COMPONENT_INDEX.json` — accepted component hashes and dependency snapshots.
- Output-root Git history — visible edit history and coherent baseline/revision commits.
- `reports/revision-impact.json` — exact changed, downstream-review, and upstream-context sets.
- `preview/*.md.html`, `preview/*.slides.html`, and `preview/*.paged.html` — browser-readable and browser-editable
  views generated from lean source; their receipts declare whether local assets must accompany them.
- `reports/qa_report.md` and `reports/evaluation.md` — release results and honest quality boundaries.
- `dist/*.alembic.zip` — lean public output, produced only after all hard gates pass.
- `dist/*.release.json` plus `dist/*.carriers.json` — archive hash, corpus state, component-index hash, exact
  persisted carrier results, and portability/runtime-review status.
- `system/COURSEWERK_INDEX.json` and `system/revisions/` — Coursewerk's branch-aware consistency evidence.

For the complete rendering syntax and current carrier capabilities, see the
[orz-markdown documentation](https://markdown.orz.how/), especially
[Features](https://markdown.orz.how/features.html) and
[The editable document family](https://markdown.orz.how/family.html).
