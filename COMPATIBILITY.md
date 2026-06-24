# Agent compatibility — entry files

Coursewerk is agent-native: different AI tools auto-read different "instructions" files. The
**canonical entry / constitution is `CLAUDE.md`**; every other entry file should point to it.

## Supported now
- **`CLAUDE.md`** — canonical (Claude Code reads it automatically).
- **`AGENTS.md`** — read by Codex CLI, Cursor, and a growing set of tools; **points to `CLAUDE.md`**
  and carries a quick orientation, so an agent that reads only `AGENTS.md` still gets the gist + the link.

## Future work (broad compatibility — leave as a note for now)
Add thin pointer files for the other tools' conventions, each linking to `CLAUDE.md`:
- `GEMINI.md` (Google Gemini CLI)
- `.github/copilot-instructions.md` (GitHub Copilot)
- `.cursor/rules` / `.cursorrules` (Cursor)
- `.windsurfrules` (Windsurf), `.clinerules` (Cline), etc.
- a top-of-`README.md` "for AI agents" pointer for tools that read the README.

Longer term, consider generating all of these from a single canonical source at release time so they
never drift. Until then, keep `CLAUDE.md` authoritative and `AGENTS.md` as the cross-tool pointer.
