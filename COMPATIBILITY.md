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
ChatGPT, Claude, Grok, or Gemini in the browser can't run the scripts, but can still author materials.
See **[`docs/lite-path.md`](docs/lite-path.md)**: intended use first selects `personal/` or `package/`, and the
AI writes lean Markdown plus structured foundation/provenance records. Public packaging still requires the
terminal assurance gate; structural Alembic import alone is not source-rights clearance.
Subsequent revisions also require the terminal component-index impact/attestation workflow; otherwise the
package remains intentionally stale and unpackable. Running bootstrap initializes the same output-root Git
history used by full terminal agents, so Light mode does not weaken edit visibility or coherence enforcement.
Repository maintainers use the branch-aware Coursewerk system index in every terminal-capable agent; pure chat
cannot accept or verify a Coursewerk harness revision by itself.

## Package records across Coursewerk versions
A package's records are read by the Coursewerk version that works on it, so a package written by a newer version may
need that version:

- **Compact review records** (v1.0.5, `req.records.compact-review`): a review record written by v1.0.5 or later stores
  its prompt's repeated blocks once, in `private/coursewerk/verification/parts/`. A package holding such records needs
  v1.0.5 or later. v1.0.4 and earlier read the parts as unlogged records and cannot put a compact record's prompt
  back, so they block the package (they fail closed: nothing is wrongly cleared). A host that runs Coursewerk on
  packages, such as Alembic's assistant job, must move to v1.0.5 before any compact record is written, and must
  not go back to an earlier one for those packages.

## Keeping them in sync
The per-tool files are thin pointers, so drift is low. Longer term, consider generating all of them from a
single canonical source at release time. Until then, `CLAUDE.md` is authoritative and every other entry
file is a pointer to it.
