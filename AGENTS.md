# Coursewerk — agent entry

Coursewerk's full entry instructions are in **[`CLAUDE.md`](CLAUDE.md)** (provider-neutral — they
apply to any AI CLI agent, not only Claude). **Read `CLAUDE.md` first, then `PROCEDURE.md`.**

Quick orientation:
- You are the **executor**; Coursewerk is the harness you follow.
- On each session: `git pull --ff-only` (auto-update), then `bash bootstrap/init.sh` (workspace).
- Build the five-deliverable teaching package per `PROCEDURE.md`, pausing at each ⏸ gate for the user.
- Never fabricate facts or figures; keep everything copyright-clean and recorded in `guide/ATTRIBUTION.md`.
- Before finishing, run the QA gate: `node scripts/check_oer.mjs --guide guide --report guide/qa_report.md`
  and fix every critical issue until it passes.
