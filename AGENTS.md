# Coursewerk — agent entry

Coursewerk's entry instructions are in **[`CLAUDE.md`](CLAUDE.md)**. They are provider-neutral and apply to any AI
agent. **Read `CLAUDE.md` first, then `PROCEDURE.md`.**

Quick orientation:
- **Roles.** You are the executor: you author, run the checks and fix what is routed to you. The instructor approves
  the spine, answers the digest and decides to publish, always in their own words.
- **Start of each session:** `git pull --ff-only`, then `bash bootstrap/init.sh`, then fetch the newest orz skills
  (`node scripts/skills.mjs --into <your skills folder>`, or read
  `https://cdn.jsdelivr.net/npm/<pkg>/<pkg>-skills/SKILL.md`). Never write a deliverable from an older copy. On a
  resumed package, `units.mjs index`, then `coursewerk.mjs status`.
- **Contact with the instructor** happens only at the six moments in `PROCEDURE.md`. Otherwise work in batches,
  ending each batch with the digest.
- **Facts.** Write checkable facts with their origin. Facts are verified blind against pinned sources
  (`scripts/verify.mjs`).
- **The gate.** `scripts/gate.mjs` is the gate; `scripts/coursewerk.mjs publish` records the instructor's decision;
  `scripts/pack.mjs` packs exactly that decision. Never push or upload.
- **v0.12 packages:** migrate first (`docs/migrating-from-v0.12.md`).
