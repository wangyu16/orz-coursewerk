# Coursewerk — agent entry (GitHub Copilot)

Coursewerk's full, provider-neutral instructions are in **[`../CLAUDE.md`](../CLAUDE.md)**. **Read
`CLAUDE.md` first, then `PROCEDURE.md`.** This file exists so Copilot reaches the same canonical entry.

Quick orientation:
- You are the **executor**; Coursewerk is the harness you follow.
- On each session: `git pull --ff-only`, then `bash bootstrap/init.sh` (installs the orz-family builders
  + creates `package/`, `preview/`, `reports/`, `dist/`).
- Build the five-deliverable teaching package into `package/` (an **Alembic package**, lean `.md`) per
  `PROCEDURE.md`, pausing at each ⏸ gate. Author with the orz-markdown family; ship lean.
- Never fabricate facts or figures; keep everything copyright-clean, recorded in
  `package/metadata/ATTRIBUTION.md`.
- Finish with the QA gate (`node scripts/check_oer.mjs --package package --report reports/qa_report.md`)
  until it passes, then `node scripts/pack.mjs` for the lean upload zip in `dist/`.
