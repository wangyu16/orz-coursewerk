# Coursewerk — the pipeline

The stages the executor agent follows to turn source materials into a complete **Alembic package** —
authored with the orz-markdown family, shipped lean, ready to upload. **Pause at each ⏸ gate for the
user to review and steer** before continuing. Record progress in `.coursewerk/progress.md` so you
can resume.

**Where things live** (created by `bootstrap/init.sh`):
- `inputs/` — the user's source materials.
- `package/` — the **Alembic package** you build (lean `.md` sources; the source of truth; this ships).
- `preview/` — framework carriers you build for local reading/QA (regenerable; **never shipped**).
- `reports/` — the QA report, evaluation, and delivery note (**outside** the package; never shipped).
- `dist/` — the packed `.zip`.

`package/` and `personal/` are automatically initialized as independent Git repositories. On every resumed run,
inspect their status/diff before writing. Preserve direct user edits, then use the component index to calculate
the full consistency impact; a clean Git tree alone does not mean the package is coherent.

**Mode matters** (set in §0.5 of `CLAUDE.md`):
- **Full** — cross-critique each authoring stage with a second engine before moving on.
- **Light** (single $20-tier engine) — **no cross-critique**; verify with the **QA gate**
  (`scripts/check_oer.mjs`, which checks the Alembic contract + format contracts) + one quick
  self-review; **build only ~3 chapters per session, checkpoint, and stop** to respect the
  subscription's daily/5-hour limits (resume another day). Stop immediately on any rate-limit error.

**Intended use matters independently of mode.** Before authoring, select `personal-private`,
`restricted-teaching`, or `public-oer` and follow `docs/assurance-kernel.md`. Full/Light changes critique cost;
it never changes the assurance kernel.

## Stage 0 — Intended use + foundation ⏸

Ask who will receive the materials, how access is controlled, whether redistribution/publication is possible,
the applicable jurisdiction/institution when an exception is asserted, and the rights basis for every primary
source. Create `metadata/FOUNDATION.json` and `metadata/PROVENANCE.json` from the templates. Non-published private
or restricted authoring may use any source without a rights receipt; record its identity and provenance, retain
warnings, and do not claim that publication has been cleared. For public authoring, perform these steps in order:

1. Identify the authoritative publisher rights page and record its URL/type/date.
2. Run `npm run capture:rights -- --root <package-or-personal> --source-id <id> --operator-name <name> --operator-type <automation|human> --contact <email-or-project-url>`. This deterministic
   helper saves and hashes the evidence, records retrieval/operator metadata, checks known-source expectations,
   scans and separately records AI/automated-use notices without treating them as copyright-license terms, and emits
   a hash-bound pre-ingestion receipt. It exits nonzero unless that receipt is cleared.
3. If blocked, stop public-source ingestion and inspect the stated reason: missing/stale evidence, a verified
   license or attribution conflict, or another foundation failure.
   Coursewerk records separate access/use notices but does not decide that they modify a CC license or establish
   a copyright prohibition. The instructor makes the publication decision after reviewing warnings.
4. Run `node scripts/check_assurance.mjs --root package --phase pre-ingestion` for public work. Only after every
   public-source receipt remains cleared may public source preparation begin. `prepare:source` independently re-verifies the receipt,
   current source record, evidence hash, and known-source policy before reading the supplied source. Automatic entries must bind the raw
   snapshot, raw hash, canonical URL, retrieval time, extractor metadata, extracted text, and text hash. The
   scaffold `inputs/README.md` never counts as source evidence.

- Personal/restricted work lives under `personal/`, has no open output license, and is never packed for Alembic.
- Public OER lives under `package/`; verify the exact source license from authoritative evidence before writing
  the manifest. Required source attribution and compatible output licensing are release-blocking.
- Provenance is mandatory in every profile. Unknown/incomplete/private-only items must be visibly labelled and
  remain future-publication blockers.

Run `node scripts/check_assurance.mjs --root personal --phase authoring` for private/restricted work. Gate: confirm the recorded
use condition and foundation facts before authoring.

For future chapter-sized public science trials, use a multi-page English Wikipedia corpus. Prefer not to use
OpenStax to reduce avoidable disputes, but treat that as advice rather than a restriction. Follow `docs/wikipedia-science-topic.md`: one anchor article,
three to seven supporting pages, serial Wikimedia API retrieval, and approximately 6,000–25,000 extracted words.

## Stage 1 — Scope + manifest ⏸
Read `inputs/` + the user's brief. Identify the **course**, the **source of truth** (a named OPEN
textbook — fetch its chapter/section structure + learning objectives from the publisher, or read a
PDF in `inputs/` — or the user's own materials), the **scope** (chapters to keep/merge/skip), the
**audience/pedagogy**, and—on the `public-oer` path—the verified compatible **output license**. Private and
restricted work stays in `personal/` and does not create an Alembic manifest. Assign each public chapter a
**slug** (lowercase, hyphen-joined, from its title).

Write **`package/alembic.json`** (the manifest — see `format-contracts/deliverables.md`): schemaVersion
`2`, a placeholder `packageId`, `title`, `license`, `description`, `keywords`, `discipline`,
`courseContext` (courseName/level/instructor/courseNumber/department as known), `unitTerm`, the ordered
`chapters` list of `{slug, title}`, and `createdAt` (ISO ending in `Z`). Write **`package/LICENSE`**
(full text matching the license) and a short **`package/README.md`** landing note. **Gate: confirm
scope, chapter slugs, and the manifest.**

## Stage 2 — Course concept map ⏸
Write `<root>/concepts/course.md` (`root=package` for public OER; `root=personal` otherwise): a course-wide
concept map in **plain Markdown (no graphics)** —
the major concepts and their dependency/reinforcement links, the logical teaching order, per-section
objectives — plus an overall **summary** and **keywords/tags** for discovery. This is the backbone the
chapters hang from. **Gate: confirm the logic backbone.**

## Stage 3 — Per-chapter build (loop over the manifest's chapters)
For each chapter `<slug>`, produce the **five deliverables** under the selected root (the `package/` paths below
become `personal/` for private/restricted work). Honor `format-contracts/deliverables.md`
and `skills/courseguide-standards` exactly):
1. `package/concepts/<slug>.md` — chapter concept map, **plain Markdown, no graphics**: concepts,
   links to prior/later chapters, logical order, per-section objectives. Readable raw.
2. `package/study-guide/<slug>.md` — the **study guide**, rich **orz-markdown**: opens with objectives;
   explains along the concept-map logic; worked **example questions** (container tabs); figures via
   `oer-figures` (RDKit structures, matplotlib charts with real values, openly-licensed images, or the
   source textbook's own figures if its license permits) saved to `package/assets/` and recorded in structured
   `PROVENANCE.json` plus public `ATTRIBUTION.md`. Each `## H2` section may carry a stable block id
   `{{attrs[#blk-…]}}`. Follow `courseguide-standards`.
3. `package/slides/<slug>.md` — the **slide deck source** in **orz-slides deck grammar** (follow
   `skills/orz-slides`): a `<!-- deck … -->` frontmatter block, slides separated by `<!-- slide -->`
   markers, `## H2` slide titles, layout splits (`2col`/`main-side`) for compare, `template=title`/`section`/
   `closing`. **One concept per slide, never crowded**, same logic flow as the study guide; **reuse only the
   study guide's `../assets/` figures**, sized legible-not-dominating.
4. `package/assessment-support/<slug>.md` — the **assessment guide**, **plain Markdown, no graphics**:
   per learning objective, *how to design* questions/activities with cognitive level — guidance, **not a
   question bank**. Several parameterized question guides per objective.
5. `package/practice/<slug>.md` — a **practice question sheet**: ~15 concrete questions instantiated
   from the assessment guide, covering all major objectives, each Q + worked answer in container tabs;
   correct, work shown.

Worked solutions belonging to the explicitly public practice sheet remain in `practice/`. Put **summative exam
keys, instructor-only solution sets, unreleased questions, and teaching notes** in `package/private/…` (never in
a public folder). **Optional collection documents** — an exam, quiz, syllabus, or handout — are authored with
**orz-paged** (`skills/orz-paged`): exams/answer keys go under `private/`, a syllabus or handout is
student-facing under an Alembic-supported public path. Declare every collection source and carrier type in
`metadata/DOCUMENTS.json`. Follow the cross-cutting quality rules in **`docs/authoring-guidelines.md`** throughout
(graphics ladder, semantic formatting, accessibility, coherence).

**Make it vivid (rule).** A study guide is not a wall of text and slides are not a bullet dump.
- **Figures:** every section that benefits gets a *meaningful, visible* figure — a generated structure
  (`{{smiles}}` for a single one, `oer-figures` RDKit for a grid/scheme), a real data plot (matplotlib or
  `{{chart}}`), a clear diagram (`{{mermaid}}` or a hand-authored SVG), **and — do NOT be conservative here —
  open-licensed REAL images** (photos of the actual substances, apparatus, or phenomena) fetched from
  Wikimedia Commons / Openverse / NASA / NOAA with `oer-figures` `fetch_open_image.py`. A chapter of only
  self-generated diagrams is too dry: pull in real photographs (an element sample, a lab instrument, a
  reaction) where a real image beats a diagram — resize to a web-friendly width and attribute it. Save asset
  files to `package/assets/`, record every one in structured `metadata/PROVENANCE.json` and public
  `metadata/ATTRIBUTION.md`. Inline `{{smiles}}`/`{{chart}}`/
  `{{mermaid}}` supplement figures; they do **not** replace them. Aim for **several figures per chapter,
  including at least one or two fetched real photos**, not zero, unless `metadata/MEDIA_PLAN.json` records a
  substantive reviewed reason that a photograph would not improve the chapter. (See `skills/oer-figures` +
  `docs/authoring-guidelines.md` §1.) Every Mermaid or chart block must also have a nearby visible
  `**Visual description:**` or `**Data summary:**`; runtime rendering is enhancement, not the only route to its
  instructional meaning.
- **Everyday-life examples:** connect each concept to a **relatable real-world example or analogy** (a scuba
  tank, a weather balloon, cooking, a car battery) so it is concrete and memorable.
- **Rich slide layouts:** slides use the full orz-slides vocabulary — `2col`/`3col`/`main-side`/`quad`
  splits, `@region` markers, floats, `template=` variants, step reveals — and orz-markdown plugins (callout
  boxes, badges, colored text, highlight, `{{chart}}`, `{{smiles}}`, figures). **Do not default to a title +
  bullet list; vary the layout across slides.** (See `skills/orz-slides`.)

**Verify the orz-markdown as you go (mandatory step).** After authoring each chapter's rich deliverables
(study guide, slides, practice), run **`node scripts/build_carriers.mjs --root <root> --out preview`** (every carrier must build,
`failed: 0`) and run `node scripts/check_oer.mjs --package package` for public work or
`node scripts/check_assurance.mjs --root personal --phase authoring` for private/restricted work. The public orz-syntax check must be **0** — it
verifies container **nesting**, not just balance, so a mis-nested `tabs`/`cols`/callout is caught). Open the
built carrier in `preview/` and eyeball it — a container that renders wrong will not throw, so *look*. Never
move on with a nonzero orz-syntax count or a build failure. Never edit the carriers; they are throwaway.

**Quality per mode:** in **Full** mode, cross-critique each chapter with a second engine — keep the
critique **focused on HIGHER-LEVEL quality** (scientific/conceptual correctness vs the source,
pedagogical soundness, coherence across the five deliverables, objective coverage); do **not** re-check
script-detectable mechanical issues (format contracts, orz-syntax, links, attribution) — those are the QA
gate's job. Then self-check against `courseguide-standards` and run an editorial pass for spelling, grammar,
clarity, terminology, tone, and repetition. The editorial pass is agent review, not a deterministic QA claim.
In **Light** mode, skip cross-critique —
run `node scripts/check_oer.mjs --package package` after each chapter (or batch) and fix what it flags,
plus one quick higher-level and editorial self-check. **Light-mode pacing:** after ~3 chapters, checkpoint
`.coursewerk/progress.md` and **stop** — tell the user which chapter to resume from next session. Stop
at once if an engine returns a rate-limit/quota error.

## Stage 4 — Assemble ⏸
Complete structured `package/metadata/PROVENANCE.json`, mirror cleared public entries into
`package/metadata/ATTRIBUTION.md` by running `npm run generate:attribution`, and finish `package/README.md`. Confirm
`package/LICENSE` matches the manifest. Do a self-pass on the two-repo invariant: nothing instructor-only
sits in a public folder. Perform a whole-package editorial and design-system pass: compare chapter outlines,
heading hierarchy, objective wording, terminology, notation, semantic formatting, figure treatment, slide
structure, assessment labels, and spelling/grammar. Resolve accidental drift before accepting the baseline.

After the first complete cross-deliverable coherence pass, initialize the component graph:

```bash
node scripts/index_components.mjs --root package --initialize
```

Use `personal` for private/restricted work. For every later edit, follow `docs/coherence-index.md`: generate the
revision impact, revise/review the complete required set, regenerate the final plan, attest it, and refresh the
index. Initialization creates the first coherent Git baseline; each accepted refresh creates a coherent-revision
commit. User commits remain welcome, but do not replace the attested refresh. A stale or missing final index is
release-blocking.

## Stage 5 — QA gate (mandatory, automated)
Run `node scripts/check_oer.mjs --package package --inputs inputs --for-discovery --report reports/qa_report.md`. It checks:
**(A) the Alembic contract** — manifest valid, LICENSE present, every folder/file recognized, each declared
chapter's `study-guide/<slug>.md` present, no carriers or stray root files, renderable objects public — so
you know it will **upload with zero friction**; **(B) OER quality** — attribution completeness,
link/asset-path integrity, orz-syntax, the defined accessibility floor, leftover placeholders, format contracts; and
**(C) copyright** — the `--inputs` flag runs a **near-verbatim scan** against the source materials, flagging
prose copied too closely (rewrite it originally). **Fix every critical issue** and **re-run until
`criticalTotal == 0`**. Also confirm the carriers build cleanly: `node scripts/build_carriers.mjs` should
report `failed: 0` (proves each lean source reassembles into a valid framework document). The report's
**Discoverability** bar is enforced for public OER: incompatible licensing, incomplete provenance/attribution,
a missing source scan, or near-verbatim spans are release-blocking. Flag any non-auto-fixable issue in `reports/qa_report.md`
— never fabricate a fix.

## Stage 6 — Honest evaluation report
Write `reports/evaluation.md` — an **honest artifact-quality evaluation** of the package, so the user
(and, for a test run, reviewers) get a transparent picture. Pull the real numbers from the QA pass:
**Alembic-contract readiness, copyright/attribution coverage, the defined accessibility floor, link/asset-path
integrity, orz-syntax, format-contract adherence, and the residual-flaw audit** (with counts + rates).
Classify each residual flaw as *auto-eliminable*, *needs-human-touch* (chiefly the **cosmetic**
image/rendering/slide-layout class), or *content* — and report honestly which axes are auto-verified vs
which still need a human probe (scientific correctness). **Do not fabricate or inflate** any number; if a
check was not run, say so. For a **no-intervention test run**, this report — plus the gate/redo/token
counts from `.coursewerk/progress.md` — is the deliverable evidence of how the harness performed.

## Stage 7 — Pack + deliver
For public OER only, run `node scripts/pack.mjs --package package --out dist` to produce the **lean upload zip** in `dist/`
(`alembic.json` at the archive root; framework carriers excluded — Alembic rebuilds them). Write
`reports/delivery.md` ('# Delivery'): what was produced, the evaluation summary (Stage 6), and the
explicit list of items still needing the user (open `[VERIFY]`, license/DOI to confirm, cosmetic layout
items). Tell the user how to publish: **upload `dist/<course>.alembic.zip` to Alembic** (Import a package),
where it becomes an editable course they preview and publish — Alembic reassembles the framework, assigns
the permalinks, and creates the paired public/private repositories. Every file remains theirs to edit.
**Do not push or publish** — the user does that.

`pack.mjs` reruns QA and the assurance kernel and refuses private/restricted profiles or any unresolved
publication blocker. Never manually zip `personal/` as an Alembic package.

> **One heads-up to include in `reports/delivery.md`:** a *trial* import in Alembic is text-only, so
> **raster** assets (`.png`/`.jpg`/`.pdf`) are skipped on import and re-added after the package is published;
> **SVG** figures (what `oer-figures` produces for structures and charts) are text and import fine. Prefer SVG
> for self-generated figures so the package arrives complete.

## Steering (any time)
When the user gives a new instruction ("emphasize X," "drop chapter N," "make slides shorter"), treat it as
**high-priority guidance that overrides earlier defaults**, absorb it, and revise the affected deliverables —
without restarting or clobbering the user's hand-edits.

**Distill durable preferences** into the user's own harness (`~/.coursewerk/`, see `CLAUDE.md §0.6`): if a
steering instruction is meant to *persist* across courses ("always use IUPAC names," a preferred slide
layout, a template, an extra skill), record it in the right profile file + `memory.md` and confirm — so it
applies automatically next time. The user's harness survives Coursewerk updates.
