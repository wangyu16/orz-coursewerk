# Coursewerk — notes & backlog (deferred ideas)

Tracked here so they aren't lost; not yet implemented.

## Operator will implement later
- **Study-guide & slides visual DESIGN** — the operator has ideas to improve the study-guide and slide
  *visual/layout design* and will incorporate them later. NOTE (v0.6.0): the underlying **grammars** are now
  fixed by the orz family (orz-markdown for study guides, orz-slides texts for slides, orz-paged
  for print) — that is the stable interchange format Alembic reassembles. The operator's design work layers
  *on top* of those grammars (themes, slide templates, section styling), and lands in
  `format-contracts/deliverables.md`, `skills/courseguide-standards`, and PROCEDURE.md slide rules.

## Round-trip: edit-the-carrier → sync-back-to-text (deferred)
- Since D52 every orz frame has `extract` (text format 1: `extract(assemble(T)).text === T`), so a carrier edited in
  the browser gives its text back exactly (`orz-<frame> extract x.slides.html -o …`). Not yet wired: a Coursewerk
  step that takes such a text back into `package/` through the unit index (an edit nobody recorded is raised).

## Alembic-side: first-class print/paged home (small, optional)
- There is no dedicated `paged/` top-level folder in the Alembic contract; print/handout deliverables live
  under `practice/` or `assets/` as `.paged.html`. If the operator wants a first-class print home, that's a
  tiny additive change to the Alembic `layers.ts`/`spaces.ts` allowlist + `scripts/lib/contract.mjs` here.

## Near-term improvements
- **Fold the artifact-quality evaluation into the pipeline + auto-revise.** Today the `oer-qa` QA gate
  blocks delivery on the auto-detectable classes. Extend it toward a fuller evaluation pass (the
  broader artifact-quality axes) that the agent then revises against — driving the residual error rate
  down further automatically.
- **Focused cross-critique (done in PROCEDURE.md):** Full-mode critique now targets higher-level
  quality only (correctness, pedagogy, coherence, objective coverage); mechanical issues are left to
  the deterministic QA script. Keeps critique cost down and value high.

## Broad compatibility — DONE (v0.6.0), see COMPATIBILITY.md
- Pointer files shipped: `GEMINI.md`, `.github/copilot-instructions.md`, `.cursorrules` (all → `CLAUDE.md`),
  plus `docs/lite-path.md` for pure chat UIs. Future: generate them all from a single canonical source at
  release time so they never drift.

## Alembic-side: current-term syllabus + miscellaneous (NEXT)
- Add a fixed **syllabus** slot and an instructor-managed **miscellaneous** links list to the Alembic
  current term, shown on the student site (misc items open in a new tab). Touches package-contract (reserved
  current-term sections + syllabus), package-ops, the site renderer (`renderCurrentTerm`), and the workspace
  current-term UI. Confirmed with the owner (2026-07-12).

## Validation plan (the clean evidence)
The reference test for Coursewerk's harness is **no-intervention domain runs**: take the distilled,
matured harness, run a NEW domain (Physics, Biology, …) at **~3 chapters each, WITHOUT mid-flight
intervention**, and let Stage 6 produce the honest evaluation report (+ gate/redo/token counts from
`.coursewerk/progress.md`). These are the fair test of generalization, the maturation hypothesis, and a
clean cost baseline — unlike a continuously-developed project, whose cost/status is confounded.
