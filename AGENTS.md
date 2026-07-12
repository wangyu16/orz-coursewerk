# Coursewerk — agent entry

Coursewerk's full entry instructions are in **[`CLAUDE.md`](CLAUDE.md)** (provider-neutral — they
apply to any AI CLI agent, not only Claude). **Read `CLAUDE.md` first, then `PROCEDURE.md`.**

Quick orientation:
- You are the **executor**; Coursewerk is the harness you follow.
- On each session: `git pull --ff-only` (auto-update), then `bash bootstrap/init.sh` (installs the
  orz-family builders + creates the workspace: `package/`, `preview/`, `reports/`, `dist/`).
- Build the five-deliverable teaching package into `package/` (an **Alembic package**, lean `.md`) per
  `PROCEDURE.md`, pausing at each ⏸ gate for the user. Author with the orz-markdown family; ship lean.
- Never fabricate facts or figures; keep everything copyright-clean and recorded in
  `package/metadata/ATTRIBUTION.md`.
- Before finishing, run the QA gate: `node scripts/check_oer.mjs --package package --report reports/qa_report.md`
  (it checks both Alembic-upload readiness and OER quality) and fix every critical issue until it passes,
  then `node scripts/pack.mjs` to produce the lean upload zip in `dist/`.
