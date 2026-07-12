# Coursewerk — notes & backlog (deferred ideas)

Tracked here so they aren't lost; not yet implemented.

## Operator will implement later
- **Study-guide & slides visual DESIGN** — the operator has ideas to improve the study-guide and slide
  *visual/layout design* and will incorporate them later. NOTE (v0.6.0): the underlying **grammars** are now
  fixed by the orz family (orz-markdown for study guides, the orz-slides deck grammar for slides, orz-paged
  for print) — that is the stable interchange format Alembic reassembles. The operator's design work layers
  *on top* of those grammars (themes, slide templates, section styling), and lands in
  `format-contracts/deliverables.md`, `skills/courseguide-standards`, and PROCEDURE.md slide rules.

## Round-trip: edit-the-carrier → sync-back-to-lean (deferred)
- Today the agent authors lean `.md` and builds carriers to `preview/` for reading. If a human wants to
  hand-edit using a carrier's in-file editor, we'd need a `sync-back` step that extracts the embedded lean
  source from the edited `.md.html`/`.slides.html` back into `package/`. The orz files embed their source
  (that's how the in-file editor + `#orz-meta` uid work), so it's extractable — not yet wired.

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

## Broad compatibility — see COMPATIBILITY.md
- Thin pointer files for other agent tools (GEMINI.md, Copilot, Cursor, …), generated from a single
  canonical source at release time.

## Validation plan (the clean evidence)
The reference test for Coursewerk's harness is **no-intervention domain runs**: take the distilled,
matured harness, run a NEW domain (Physics, Biology, …) at **~3 chapters each, WITHOUT mid-flight
intervention**, and let Stage 6 produce the honest evaluation report (+ gate/redo/token counts from
`.coursewerk/progress.md`). These are the fair test of generalization, the maturation hypothesis, and a
clean cost baseline — unlike a continuously-developed project, whose cost/status is confounded.
