# Coursewerk — the pipeline

The stages the executor agent follows to turn source materials into a complete teaching package.
**Pause at each ⏸ gate for the user to review and steer** before continuing. Record progress in
`.coursewerk/progress.md` so you can resume.

**Mode matters** (set in §0.5 of `CLAUDE.md`):
- **Full** — cross-critique each authoring stage with a second engine before moving on.
- **Light** (single $20-tier engine) — **no cross-critique**; verify with the **QA script**
  (`scripts/check_oer.mjs`, which also checks format contracts) + one quick self-review; **build only
  ~3 chapters per session, checkpoint, and stop** to respect the subscription's daily/5-hour limits
  (resume another day). Stop immediately on any rate-limit error.

## Stage 1 — Scope ⏸
Read `inputs/` + the user's brief. Identify the **course**, the **source of truth** (a named OPEN
textbook — fetch its chapter/section structure + learning objectives from the publisher, or read a
PDF in `inputs/` with the `pdf-extract` approach — or the user's own materials), the **scope**
(chapters to keep/merge/skip), the **audience/pedagogy**, and the **license** (matches the source).
Write `guide/00_scope.md` (course, source+edition+license, scope, objectives, the deliverable
format contract, license policy) and `guide/chapters_index.json` (ordered chapter list: each entry
`{id, title, sections[], objectives[], source}`). **Gate: confirm scope + chapter list.**

## Stage 2 — Course concept map ⏸
Write `guide/concept-maps/course.md`: a course-wide concept map in **plain Markdown (no graphics)**
— the major concepts and their dependency/reinforcement links, the logical teaching order, and
per-section objectives — plus an overall **summary** and **keywords/tags** for discovery. This is
the backbone the chapters hang from. **Gate: confirm the logic backbone.**

## Stage 3 — Per-chapter build (loop over chapters_index)
For each chapter, produce the **five deliverables** (honor `format-contracts/` exactly):
1. `guide/concept-maps/ch{i}.md` — chapter concept map, **plain Markdown, no graphics**: concepts,
   their links to prior/later chapters, logical order, per-section objectives. Readable raw.
2. `guide/chapters/ch{i}.md` — the **study guide**, rich **orz-markdown**: opens with objectives;
   explains along the concept-map logic; worked **example questions** (container tabs); figures via
   `oer-figures` (RDKit structures, matplotlib charts with real values, openly-licensed images, or
   the source textbook's own figures if its license permits) saved to `guide/assets/` and recorded
   in `guide/ATTRIBUTION.md`. Follow `courseguide-standards`.
3. `guide/slides/ch{i}.md` — the **slide spec**, output-agnostic **orz-markdown** that previews as
   the slides: slides separated by `---`; H1 = title page, H2 = slide title; each slide opens with a
   `<!-- LAYOUT: ... -->` comment naming proportioned regions; each block preceded by a hidden
   `<!-- region; size -->` anchor. Comprehensive coverage; **reuse only the study guide's figures**.
4. `guide/assessment/ch{i}.md` — the **assessment guide**, **plain Markdown, no graphics**: per
   learning objective, *how to design* questions/activities (assignments, discussion, quizzes,
   exams, projects) with cognitive level — guidance, **not a question bank**. Several parameterized
   question guides per objective (forward/inverse/conceptual/graphical/comparison/applied/error/…).
5. `guide/practice/ch{i}.md` — a **practice question sheet**: ~15 concrete questions instantiated
   from the assessment guide, covering all major objectives, each Q + worked answer in container
   tabs; correct, work shown.
**Quality per mode:** in **Full** mode, cross-critique each chapter with a second engine, then
self-check against `courseguide-standards`. In **Light** mode, skip cross-critique — run
`node scripts/check_oer.mjs --guide guide` after each chapter (or batch) and fix what it flags, plus
one quick self-check against `courseguide-standards`. **Light-mode pacing:** after ~3 chapters,
checkpoint `.coursewerk/progress.md` and **stop** — tell the user which chapter to resume from next
session. Stop at once if an engine returns a rate-limit/quota error.

## Stage 4 — Assemble ⏸
Write `guide/README.md` (landing page linking every deliverable per chapter + the course map),
`guide/ATTRIBUTION.md` (every external/reused asset: asset · source URL · license · attribution),
`guide/LICENSE` (matching the source), and `guide/publish_checklist.md` (readiness audit).

## Stage 5 — QA gate (mandatory, automated)
Run `node scripts/check_oer.mjs --guide guide --report guide/qa_report.md`. **Fix every critical
issue** (unmanifested/under-attributed assets, broken links/asset paths, orz-syntax slips, missing
alt text, leftover `[VERIFY]`/`[NEEDS DATA]`) and **re-run until `criticalTotal == 0`**. Flag any
non-auto-fixable issue (e.g. a figure/slide layout/positioning judgment) in `guide/qa_report.md`
for the user — never fabricate a fix.

## Stage 6 — Deliver
Write `guide/delivery.md` ('# Delivery'): what was produced, the landing page, and the explicit
list of items still needing the user (open `[VERIFY]`, license/DOI to confirm, layout items to
hand-fix). **Do not push or publish.** Tell the user how to host it (any static host / GitHub Pages)
and that every file is theirs to edit.

## Steering (any time)
When the user gives a new instruction ("emphasize X," "drop chapter N," "make slides shorter"),
treat it as **high-priority guidance that overrides earlier defaults**, absorb it, and revise the
affected deliverables — without restarting or clobbering the user's hand-edits.

**Distill durable preferences** into the user's own harness (`~/.coursewerk/`, see `CLAUDE.md §0.6`):
if a steering instruction is meant to *persist* across courses ("always use IUPAC names," a preferred
slide layout, a template, an extra skill), record it in the right profile file + `memory.md` and
confirm — so it applies automatically next time. The user's harness survives Coursewerk updates.
