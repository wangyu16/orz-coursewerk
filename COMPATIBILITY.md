# Agent compatibility — entry files

Coursewerk is agent-native: different AI tools auto-read different "instructions" files. The
**canonical entry / constitution is `CLAUDE.md`**; every other entry file points to it. The goal is
that you can use **any AI platform you like** to run Coursewerk.

## Full experience — agents with a terminal
These can clone the repo, install the builders, and run the `check` / `build` / `pack` scripts. Each
reads a different entry file; all of them point to `CLAUDE.md`:

- **`CLAUDE.md`** — canonical (Claude Code reads it automatically).
- **`AGENTS.md`** — read by Codex / ChatGPT Agent mode, and a growing set of tools.
- **`GEMINI.md`** — Google Gemini CLI.
- **`.github/copilot-instructions.md`** — GitHub Copilot.
- **`.cursorrules`** — Cursor / Windsurf / Cline (and similar).

An agent that reads only its own file still gets a quick orientation plus the link to the canonical
instructions, so it can proceed.

## Lite path — pure chat UIs (no terminal)
ChatGPT, Claude, Grok, or Gemini in the browser can't run the scripts, but can still author the package.
See **[`docs/lite-path.md`](docs/lite-path.md)**: the AI writes the lean markdown + manifest following the
contracts; you assemble the tree and either run the Node helpers locally or let Alembic validate on import.
The output is identical — the terminal only automates assembly, preview, and packaging.

## Keeping them in sync
The per-tool files are thin pointers, so drift is low. Longer term, consider generating all of them from a
single canonical source at release time. Until then, `CLAUDE.md` is authoritative and every other entry
file is a pointer to it.
