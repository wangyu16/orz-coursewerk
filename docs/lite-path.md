# Coursewerk on a pure chat platform (no terminal)

Coursewerk is designed for an AI **agent with a terminal** — one that can clone this repo, run
`bash bootstrap/init.sh`, and run the `check` / `build` / `pack` scripts. That is the full experience
(Claude Code, ChatGPT Codex/Agent, Gemini CLI, GitHub Copilot CLI, Cursor/Windsurf/Cline).

If you only have a **pure chat UI** (ChatGPT, Claude, Grok, or Gemini in the browser, with no shell),
you can still use Coursewerk in **lite mode** — the AI does the authoring; you do the three mechanical
steps it can't. Nothing about the output changes; you just assemble and validate it yourself.

## How lite mode works

1. **Give the AI the contracts.** Paste (or attach) these four files so the model has the rules:
   `CLAUDE.md`, `PROCEDURE.md`, `format-contracts/deliverables.md`, and
   `skills/courseguide-standards/SKILL.md`. Add `skills/orz-markdown/`, `skills/orz-slides/`,
   `skills/orz-paged/`, and `skills/oer-figures/SKILL.md` when you reach figures/slides/print.
2. **Author chapter by chapter.** Ask it to follow `PROCEDURE.md`, pausing at each gate. It produces the
   **lean markdown** for each file (`package/study-guide/<slug>.md`, `slides/<slug>.md`, etc.) and the
   `alembic.json` manifest — as chat output or downloadable files. Save each into the `package/` tree
   yourself, following the exact paths in `format-contracts/deliverables.md`.
3. **Validate + package.** You run the three helper steps once (they need Node.js, not an AI):
   ```bash
   npm install                       # one time — installs the orz-family builders
   node scripts/check_oer.mjs --package package --report reports/qa_report.md
   node scripts/build_carriers.mjs   # optional: build previewable .md.html/.slides.html to read
   node scripts/pack.mjs             # produce the lean upload zip in dist/
   ```
   Paste `reports/qa_report.md` back to the AI and ask it to fix any critical issues; repeat until the
   check passes.

## Even lighter: skip the scripts entirely

If you cannot run Node at all, you can **skip the local check and let Alembic validate on import**:
author the lean `.md` files + `alembic.json` + `LICENSE`, zip the `package/` folder (with `alembic.json`
at the zip root), and use **Import a package** in Alembic. Its importer runs the same contract checks and
tells you exactly what to fix. You lose only the local preview and the pre-flight QA — the package
contract is identical.

## What you give up in lite mode

- **No local preview** of the self-contained documents while authoring (Alembic shows them after import).
- **No pre-flight QA** unless you run `check_oer.mjs` locally (Alembic still validates the contract on import).
- **More manual assembly** — you place each file into the tree instead of the agent writing it directly.

Everything the AI produces — the manifest, the lean markdown, the format/quality discipline — is exactly
the same as the full experience. The terminal only automates assembly, preview, and packaging.
