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

**Mode matters** (set in §0.5 of `CLAUDE.md`):
- **Full** — cross-critique each authoring stage with a second engine before moving on.
- **Light** (single $20-tier engine) — **no cross-critique**; verify with the **QA gate**
  (`scripts/check_oer.mjs`, which checks the Alembic contract + format contracts) + one quick
  self-review; **build only ~3 chapters per session, checkpoint, and stop** to respect the
  subscription's daily/5-hour limits (resume another day). Stop immediately on any rate-limit error.

## Stage 1 — Scope + manifest ⏸
Read `inputs/` + the user's brief. Identify the **course**, the **source of truth** (a named OPEN
textbook — fetch its chapter/section structure + learning objectives from the publisher, or read a
PDF in `inputs/` — or the user's own materials), the **scope** (chapters to keep/merge/skip), the
**audience/pedagogy**, and the **license** — an **open license** (one of the five, matching the source) if
the user wants to share or list on Discover, or **`ALL-RIGHTS-RESERVED`** to keep it private / for their own
class (default when undecided; it uploads and publishes fine, just isn't listable). Assign each chapter a
**slug** (lowercase, hyphen-joined, from its title).

Write **`package/alembic.json`** (the manifest — see `format-contracts/deliverables.md`): schemaVersion
`2`, a placeholder `packageId`, `title`, `license`, `description`, `keywords`, `discipline`,
`courseContext` (courseName/level/instructor/courseNumber/department as known), `unitTerm`, the ordered
`chapters` list of `{slug, title}`, and `createdAt` (ISO ending in `Z`). Write **`package/LICENSE`**
(full text matching the license) and a short **`package/README.md`** landing note. **Gate: confirm
scope, chapter slugs, and the manifest.**

## Stage 2 — Course concept map ⏸
Write `package/concepts/course.md`: a course-wide concept map in **plain Markdown (no graphics)** —
the major concepts and their dependency/reinforcement links, the logical teaching order, per-section
objectives — plus an overall **summary** and **keywords/tags** for discovery. This is the backbone the
chapters hang from. **Gate: confirm the logic backbone.**

## Stage 3 — Per-chapter build (loop over the manifest's chapters)
For each chapter `<slug>`, produce the **five deliverables** (honor `format-contracts/deliverables.md`
and `skills/courseguide-standards` exactly):
1. `package/concepts/<slug>.md` — chapter concept map, **plain Markdown, no graphics**: concepts,
   links to prior/later chapters, logical order, per-section objectives. Readable raw.
2. `package/study-guide/<slug>.md` — the **study guide**, rich **orz-markdown**: opens with objectives;
   explains along the concept-map logic; worked **example questions** (container tabs); figures via
   `oer-figures` (RDKit structures, matplotlib charts with real values, openly-licensed images, or the
   source textbook's own figures if its license permits) saved to `package/assets/` and recorded in
   `package/metadata/ATTRIBUTION.md`. Each `## H2` section may carry a stable block id
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

Put any **answer keys / full solutions / exam content** in `package/private/…` (never in a public
folder). **Optional collection documents** — an exam, quiz, syllabus, or handout — are authored with
**orz-paged** (`skills/orz-paged`): exams/answer keys go under `private/`, a syllabus or handout is
student-facing. Follow the cross-cutting quality rules in **`docs/authoring-guidelines.md`** throughout
(graphics ladder, semantic formatting, accessibility, coherence). **Build carriers to preview** as you go —
`node scripts/build_carriers.mjs` renders the lean
sources into `preview/` so you (and the user) can open the real self-contained study guide / slides and
check them; never edit the carriers, they are throwaway.

**Quality per mode:** in **Full** mode, cross-critique each chapter with a second engine — keep the
critique **focused on HIGHER-LEVEL quality** (scientific/conceptual correctness vs the source,
pedagogical soundness, coherence across the five deliverables, objective coverage); do **not** re-check
mechanical issues (format contracts, orz-syntax, links, attribution, spelling) — those are the QA
gate's job. Then self-check against `courseguide-standards`. In **Light** mode, skip cross-critique —
run `node scripts/check_oer.mjs --package package` after each chapter (or batch) and fix what it flags,
plus one quick higher-level self-check. **Light-mode pacing:** after ~3 chapters, checkpoint
`.coursewerk/progress.md` and **stop** — tell the user which chapter to resume from next session. Stop
at once if an engine returns a rate-limit/quota error.

## Stage 4 — Assemble ⏸
Complete `package/metadata/ATTRIBUTION.md` (every external/reused asset: asset · source URL · license ·
attribution) and `package/README.md` (a short landing note listing each chapter's deliverables). Confirm
`package/LICENSE` matches the manifest. Do a self-pass on the two-repo invariant: nothing instructor-only
sits in a public folder.

## Stage 5 — QA gate (mandatory, automated)
Run `node scripts/check_oer.mjs --package package --inputs inputs --report reports/qa_report.md`. It checks:
**(A) the Alembic contract** — manifest valid, LICENSE present, every folder/file recognized, each declared
chapter's `study-guide/<slug>.md` present, no carriers or stray root files, renderable objects public — so
you know it will **upload with zero friction**; **(B) OER quality** — attribution completeness,
link/asset-path integrity, orz-syntax, accessibility proxies, leftover placeholders, format contracts; and
**(C) copyright** — the `--inputs` flag runs a **near-verbatim scan** against the source materials, flagging
prose copied too closely (rewrite it originally). **Fix every critical issue** and **re-run until
`criticalTotal == 0`**. Also confirm the carriers build cleanly: `node scripts/build_carriers.mjs` should
report `failed: 0` (proves each lean source reassembles into a valid framework document). The report's
**Discoverability** section says whether the package could be listed on Discover; if the user intends to
list publicly, run with **`--for-discovery`** to make the Discover blockers (non-open license, incomplete
attribution, near-verbatim spans) release-blocking. Flag any non-auto-fixable issue in `reports/qa_report.md`
— never fabricate a fix.

## Stage 6 — Honest evaluation report
Write `reports/evaluation.md` — an **honest artifact-quality evaluation** of the package, so the user
(and, for a test run, reviewers) get a transparent picture. Pull the real numbers from the QA pass:
**Alembic-contract readiness, copyright/attribution coverage, accessibility proxies, link/asset-path
integrity, orz-syntax, format-contract adherence, and the residual-flaw audit** (with counts + rates).
Classify each residual flaw as *auto-eliminable*, *needs-human-touch* (chiefly the **cosmetic**
image/rendering/slide-layout class), or *content* — and report honestly which axes are auto-verified vs
which still need a human probe (scientific correctness). **Do not fabricate or inflate** any number; if a
check was not run, say so. For a **no-intervention test run**, this report — plus the gate/redo/token
counts from `.coursewerk/progress.md` — is the deliverable evidence of how the harness performed.

## Stage 7 — Pack + deliver
Run `node scripts/pack.mjs --package package --out dist` to produce the **lean upload zip** in `dist/`
(`alembic.json` at the archive root; framework carriers excluded — Alembic rebuilds them). Write
`reports/delivery.md` ('# Delivery'): what was produced, the evaluation summary (Stage 6), and the
explicit list of items still needing the user (open `[VERIFY]`, license/DOI to confirm, cosmetic layout
items). Tell the user how to publish: **upload `dist/<course>.alembic.zip` to Alembic** (Import a package),
where it becomes an editable course they preview and publish — Alembic reassembles the framework, assigns
the permalinks, and creates the paired public/private repositories. Every file remains theirs to edit.
**Do not push or publish** — the user does that.

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
