# Coursewerk in an Alembic job

You are working on a course inside an Alembic assistant job. Coursewerk is installed read-only in `assistant/`;
the course is a plain folder, `work/`, with no git. These instructions say only what is different in a job.
For everything else (what Coursewerk promises, whose acts are whose, the rules that never bend), read
`assistant/COURSEWERK.md`, Coursewerk's main instructions, and then `assistant/PROCEDURE.md`.

## Rules of the job

- `assistant/` is read-only. Never change anything in it.
- Never run `git`. There is no repository: Alembic keeps the course's history.
- Never install packages (`npm install`, `pip install`, …). Everything Coursewerk needs is in `assistant/`.
- In a job, Coursewerk uses the orz packages in `assistant/node_modules` by itself.
- The blind verifier uses the job's own model (Haiku 5.5 unless the job chose another). Do not set
  `COURSEWERK_VERIFIER`.
- Write only inside `work/`, and only what the course needs. Do not fetch skills into `work/`: read the orz skills
  in place, at `assistant/node_modules/<package>/<package>-skills/SKILL.md` (orz-markdown, orz-mdhtml, orz-slides,
  orz-paged), and Coursewerk's own skills in `assistant/skills/`.

## The steps

1. **Get the course.**

   ```bash
   alembic pull work
   node assistant/scripts/site_import.mjs work
   ```

   The import turns the course from the way Alembic stores it into the way Coursewerk reads it. It joins the
   decision log into one `private/coursewerk/LOG.jsonl` and checks it. It also unpacks the verification records.
   It writes a hidden file, `work/.coursewerk-host.json`, which remembers what Alembic holds. Do not edit or delete
   that file. If the import refuses, stop and report its message.

   Then bring in what the instructor has answered in Alembic's "Needs you":

   ```bash
   alembic changes > work/.alembic-changes.json
   node assistant/scripts/alembic_needs.mjs apply --root work --changes work/.alembic-changes.json
   ```

   It records each answer to a question Coursewerk asked, in the instructor's name and words, and only once. It
   prints what it recorded and what it skipped, and why (for example, a plan that changed since it was asked, or an
   approval without the instructor's words). Never record an instructor's act any other way in a job.

2. **See where the course stands.** Where `COURSEWERK.md` says `git status` and `git diff`, use
   `alembic push work --dry-run`. It lists what has changed since the pull. Then run the usual steps with
   `--root work`:

   ```bash
   node assistant/scripts/units.mjs index --root work
   node assistant/scripts/coursewerk.mjs status --root work
   ```

3. **Do the work** as `COURSEWERK.md` and `PROCEDURE.md` say, always with `--root work`. Write course text only
   inside a units session:

   ```bash
   node assistant/scripts/units.mjs begin --root work --model <your model id>
   # … write …
   node assistant/scripts/units.mjs index --root work --as agent --model <your model id>
   ```

   Run the gate and the verification tools as usual. The gate checks the decision log against the one Alembic
   holds, since there is no git history to check it against. If the gate says the decision log no longer extends the
   one Alembic holds, a past record was changed. Stop and report it. Never try to repair the log by hand.

4. **Finish the job in this order.** The instructor is reached only through "Needs you" in Alembic, and Coursewerk
   must remember what it asked before the questions go out:

   ```bash
   node assistant/scripts/alembic_needs.mjs export --root work --out work/.alembic-needs.json --model <your model id>
   node assistant/scripts/site_handback.mjs work
   alembic push work --dry-run
   alembic push work
   alembic handin work/.alembic-needs.json
   ```

   - The export collects interrupts, plans ready for approval, corrections to keep or undo, and the checkpoint
     digest, at most 20 questions; it says how many wait for next time. It writes the questions to the hidden file
     `work/.alembic-needs.json`, and the record of what was asked to `private/coursewerk/digest/alembic-needs.json`,
     which the push carries. It makes a new changeset id unless you give one (`--changeset <id>`).
   - The hand-back puts the course back the way Alembic stores it. It adds new records only at the end of a file, or
     in new files. Alembic accepts nothing else, so never edit a record file yourself. If the hand-back refuses, do
     not push. Report its message instead.
   - Hand the questions in only after `alembic push work` succeeded, and only when the export found questions. If
     the push fails, do not hand in the questions: they would be asked without Coursewerk remembering them. Report
     the failure instead. A new hand-in replaces the instructor's unanswered one.

5. **To keep working after a push,** pull again and import again (step 1). Do not run the import twice without
   a pull in between; it will refuse.

## What stays the instructor's

Everything `COURSEWERK.md` calls the instructor's act stays the instructor's in a job: approvals, steering, answers,
confirmations and publishing. Record them only with the instructor's own words, as given to you by the job.
Publishing the course on Alembic is the instructor's decision, never yours.
