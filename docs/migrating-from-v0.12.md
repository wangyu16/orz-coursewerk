# Migrating a package from Coursewerk v0.12

A v0.12 package has no `"spine": 2` in `metadata/coursewerk.json`. Its deliverables stay as they are; what changes
is the spine's grammar, and the records the harness keeps about it. The migration is the instructor's request. The
result is presented to them as a revision for approval, never converted silently.

## 0. The intake (M1) for a migration

A migration is a fresh intake. Ask the instructor, once, in the same exchange as the request:
- who wrote the existing text (an agent, the instructor, or both, and which files);
- where verification may look on the web (the destinations, in their words);
- the use profile, if `FOUNDATION.json` does not settle it.

Their request to migrate ("get it into shape with the current Coursewerk") is the words the migration quotes.

## 1. Convert the spine (the instructor's request)

```bash
git -C <pkg> status                                   # must be clean: the migration is one reviewable diff
node scripts/spine.mjs migrate --root <pkg> --name "<instructor>" --words "<their words>"
```

**What the tool does:**
- mints a stable anchor for every objective, concept and assessment-guide entry, and rewrites ordinal references
  ("Objective 3") to anchors;
- rewrites the assessment guides into the v2 grammar (`### … [anchor: …]` with Type, Count, Level and Targets);
- marks every pre-existing item as standardized;
- logs the migration, and puts every chapter into ASSEMBLING with no approval.

From that point nothing publishes until the instructor approves.

**Then, as the agent:**
- Read the tool's `notes` (they are also in the migration's log record). Each is something the conversion could not
  carry exactly, for example an uncertain prerequisite ("concept 6?") made firm. Every note goes to the instructor at M3.
- The guides' Type and Count fields are left as `TODO`. Propose them (to match the existing practice sheet, say),
  marked as your proposal. `spine.mjs check` must pass.
- The converter moves each objective's rubric paragraph under that objective's last question guide; check that it
  still reads right.
- Run M2 steering if the package has none, before any authoring. A migration skips `assemble`, so steering can come
  after it.

## 2. Present the result (M3)

Show the instructor `git diff` and `spine.mjs preview --chapter <slug>` for each chapter, with your critique as
questions. Each approval is the instructor's, in their words:
- `coursewerk.mjs approve --chapter <slug>` for each chapter, which moves it to PACKAGE;
- `coursewerk.mjs approve --course` for the course map.

## 3. Index the existing text

The deliverables were written before units existed. Record who wrote them, in the instructor's words:

```bash
node scripts/units.mjs index --root <pkg> --initial-origin agent-knowledge --model <model id>   # written by an agent
node scripts/units.mjs index --root <pkg> --initial-origin instructor --name "<instructor>"      # written by the instructor
```

Choose the agent's model id honestly. If the v0.12 run did not record it, say so (for example "unrecorded-v0.12").
Then link every teaching unit and practice question to the spine (`units.mjs link`), and run the work loop
(`PROCEDURE.md`):
- verify facts;
- review absolutes;
- bring the digest.

The v0.12 claim declarations in front matter are not needed any more. They do no harm and can be removed.

## 4. Records that no longer apply

These v0.12 records are not read by the v2 workflow:
- `metadata/KEY_FACT_REVIEW.json` and `metadata/VISUAL_REVIEW.json`;
- `metadata/COMPONENT_INDEX.json`, `metadata/CLAIMS.json`, `metadata/TERMS.json`, `metadata/SPINE.json`, and
  `metadata/claims/`;
- `metadata/REVIEW_QUEUE.json` and `metadata/OVERRIDES.json`.

The decision log, the unit index and the publish record replace them. Propose removing them as one commit, with the
instructor's agreement. They would otherwise be packed with the course.

## What stays the same

- The deliverables and their formats (`format-contracts/deliverables.md`).
- The source corpus (`inputs/SOURCE_CORPUS.json`, `metadata/SOURCE_RECORD.json`).
- The rights evidence and attribution, provenance, `FOUNDATION.json`, and `alembic.json`.
