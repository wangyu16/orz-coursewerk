# Coursewerk changelog

## v0.5.0 (2026-06-24)
- **Honest evaluation report as the final stage** (`guide/evaluation.md`): the real artifact-quality
  numbers (attribution, accessibility, links, orz-syntax, format contracts, residual-flaw audit
  classified auto-eliminable / cosmetic-needs-human / content) — the deliverable evidence for
  no-intervention test runs. Stage list is now 1–7 (QA gate → evaluation → deliver).
- `NOTES.md`: added the clean-evidence validation plan (no-intervention domain runs at ~3 chapters).


## v0.4.0 (2026-06-24)
- **Focused cross-critique:** Full-mode critique now targets HIGHER-LEVEL quality only (scientific/
  conceptual correctness, pedagogy, coherence, objective coverage); mechanical issues (format, syntax,
  links, attribution, spelling) are left to the deterministic QA script — lower cost, higher value.
- Added `NOTES.md` (deferred ideas: study-guide/slides layout redesign — operator to implement;
  folding the full evaluation + auto-revise into the pipeline).


## v0.3.1 (2026-06-24)
- **Agent compatibility:** clarified that `CLAUDE.md` is the canonical entry/"constitution" and
  `AGENTS.md` points to it (so whichever file a tool reads, it reaches the same instructions). Added
  `COMPATIBILITY.md` noting future thin-pointer files for other tools (GEMINI.md, Copilot, Cursor, …).


## v0.3.0 (2026-06-24)
- **Your own harness (`~/.coursewerk/`)**: a durable, personal layer the agent reads every run and
  **distills into** as you steer — preferences, styles, templates, and your additional skills. Lives
  in your home directory, so **Coursewerk updates never overwrite it**; it is shared across all your
  courses and compounds over time. Created by `bootstrap/init.sh`; driven by `CLAUDE.md §0.6`.


## v0.2.0 (2026-06-24)
- **Light mode** for single lower-tier ($20) subscriptions: no cross-model critique (quality verified
  by the deterministic QA script + a self-review), and day-paced building (~3 chapters/session,
  checkpoint + stop, resume next day) to respect rate limits. Mode chosen at start, stored in
  `.coursewerk/mode`; Full mode keeps cross-model critique.
- QA script (`scripts/check_oer.mjs`) now also checks **format contracts** (graphics-free concept
  maps/assessments, slide LAYOUT/separators, etc.) so script verification can carry more weight.


## v0.1.0 (2026-06-24)
- Initial extraction from the Conductor `course_guide` archetype as a standalone, agent-native harness.
- Five-deliverable pipeline (concept map · study guide · slide spec · assessment guide · practice sheet)
  + course-wide concept map, in `PROCEDURE.md`.
- Bundled skills: orz-markdown, oer-figures, oer-qa, courseguide-standards.
- Automated QA gate (`scripts/check_oer.mjs`): attribution-completeness, link/path integrity,
  orz-syntax, accessibility proxies, placeholders.
- Auto-update on each session via `git pull`; workspace bootstrap (`bootstrap/init.sh`).
