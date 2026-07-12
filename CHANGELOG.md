# Coursewerk changelog

## v0.6.0 (2026-07-12)
- **Alembic-native output + orz-markdown family incorporated as core.** Coursewerk now builds a valid
  **Alembic package** (`package/alembic.json` manifest + `study-guide/ concepts/ slides/ practice/
  assessment-support/ assets/ metadata/ private/`, slug filenames) that uploads with zero friction — no
  hand-translation. It authors natively with the orz family: study guides & practice in orz-markdown,
  slides in the **orz-slides deck grammar**, print in orz-paged.
- **Author-with-framework, ship-lean model.** Lean `.md` is the source of truth; `scripts/build_carriers.mjs`
  builds the self-contained orz carriers (`.md.html`/`.slides.html`/`.paged.html`) into a throwaway
  `preview/` for local reading + QA; `scripts/pack.mjs` produces a **lean** upload zip (carriers excluded —
  Alembic reassembles the framework and assigns permalinks/ids on its side). License is package-level
  (`alembic.json` + `LICENSE`); identity is minted by Alembic on import; optional `{{attrs[#blk-…]}}` block
  ids may ship for durable citation.
- **QA gate rewritten** (`scripts/check_oer.mjs`): now validates the **Alembic contract** (mirrors
  `validatePackageForImport`/`repoForPath` via `scripts/lib/contract.mjs`) *and* keeps the OER-quality checks
  (attribution, links, orz-syntax, accessibility, placeholders, per-deliverable format contracts). Reports
  live in `reports/` (outside the package). Slides format contract now checks the orz-slides deck grammar.
- **Tooling:** `package.json` depends on `orz-mdhtml`/`orz-slides`/`orz-paged`/`orz-markdown`;
  `bootstrap/init.sh` installs them and creates `package/ preview/ reports/ dist/`. Docs (`CLAUDE.md`,
  `PROCEDURE.md`, `README.md`, `AGENTS.md`, `format-contracts/deliverables.md`, `skills/courseguide-standards`,
  `skills/oer-qa`) rewritten to the new layout + grammars.
- **Comprehensive authoring guidelines + full tool coverage.** New `docs/authoring-guidelines.md` (the
  cross-cutting quality rules: graphics preference ladder incl. **AI concept illustrations** with guardrails,
  the semantic-formatting palette, study-guide→slides, accessibility, coherence, notation). New
  **`skills/orz-slides`** (course slide decks — layout grammar + one-concept-per-slide pedagogy) and
  **`skills/orz-paged`** (paginated collection docs — exams with the answer-key toggle, syllabi, handouts),
  both pointing to the installed tool skills for full grammar. `skills/oer-figures` extended with the
  `{{chart}}` simple-plot path and the AI-illustration rung; `skills/orz-markdown` snapshot flagged +
  pointed at the installed current reference (adds the `{{chart}}` plugin).
- **Any-platform reach.** Pointer entry files for `GEMINI.md`, `.github/copilot-instructions.md`,
  `.cursorrules` (all → `CLAUDE.md`), plus **`docs/lite-path.md`** for pure chat UIs (no terminal);
  `COMPATIBILITY.md` updated.
- **Licensing tiers + copyright verification.** coursewerk is non-mandating: a package can be **private**
  (license `ALL-RIGHTS-RESERVED` — new value; uploads/publishes but not listable), **published**, or
  **discoverable** (needs an open license + verified-clean content). The QA gate gained: a **near-verbatim
  detector** (`scripts/lib/verbatim.mjs`, wired via `--inputs`) that flags prose copied from the source; a
  **Discoverability** report (open-license + attribution-complete + no verbatim spans) and a
  **`--for-discovery`** flag that makes those blockers release-blocking; and `isOpenLicense` /
  `ALL_RIGHTS_RESERVED` in `scripts/lib/contract.mjs`. Guidelines gained the license≠copyright distinction,
  the positive-provenance principle, and the anti-verbatim authoring rule (`docs/authoring-guidelines.md`
  §4, §7).

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
