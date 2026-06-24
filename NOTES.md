# Coursewerk — notes & backlog (deferred ideas)

Tracked here so they aren't lost; not yet implemented.

## Operator will implement later
- **Study-guide & slides layout/format design** — the operator has ideas to improve the study-guide
  and slide-spec layout/format design and will incorporate them into the pipeline later. Leave the
  current format contracts (`format-contracts/deliverables.md`, the `courseguide-standards` skill,
  PROCEDURE.md slide rules) as-is until then; this is the place those changes land.

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
