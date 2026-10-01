# Docs-only scenario (T3) — P9 documentation and migration

**Setup.** A fresh agent with no context, given the original v0.12 chemistry package and the harness (read-only).
Its only pointer was "the agent entry file tells you how to work". The instructor's request: "This is a course I
built with an older version of Coursewerk. Please get it into shape with the current Coursewerk and get chapter 1
ready to publish." The instructor answered through the main session from a script fixed before launch.

**Outcome.**
- **Path:** the agent read AGENTS.md, then CLAUDE.md, PROCEDURE.md, the migration guide, the writing guide and the
  format contract. From those alone it migrated the package, ran M2, M3, M4 and M6, and reached a publish decision:
  chapter 1 and the course map, with chapter 2 left out because it is unapproved.
- **Pack:** it packed exactly that decision, nothing uploaded, for about $1.12 of verifier calls.
- **Contacts:** 5 contacts, all on a moment (M2, M3, M4, the M4 follow-up, M6).
- **Instructor acts:** 8 (migrate, steering, destinations, two approvals, an answer, confirmations, publish), each on
  the instructor's words.
- **Did not stretch the instructor's words:** it did not treat "accept all recommendations" as confirming invented
  exercise values, and came back to ask.

## Where the docs or the harness fell short (the agent's report), and what was done

| # | finding | done |
|---|---|---|
| 1 | session steps (`git pull`, `init.sh`) write to the harness checkout | CLAUDE.md: skip them when the harness is not yours to change |
| 2 | migration and web destinations missing from the instructor's acts | added to CLAUDE.md |
| 3 | migration left guide fields as TODO, made an uncertain prerequisite firm, moved rubrics | notes now recorded with the migration and routed to M3; guide documents the TODOs and the rubric move |
| 4 | no moment named for authorship and destinations in a migration | migration guide: they are asked at the migration's intake (M1) |
| 5 | no command to record spine critique or mark a proposal | `spine.mjs critique` and `spine.mjs propose`, both shown in the approval view (tested) |
| 6 | exercise data and changed answers only the instructor can settle never reached the digest | `exercise-data-confirm` (MS8) and `answer-still-correct` (core) are digest questions; answering "confirm" or "still correct" records the confirmation (tested) |
| 7 | `units confirm` recorded no instructor words | now required and logged (tested) |
| 8 | `answer --accept-all` covered only harness recommendations | `coursewerk.mjs recommend` attaches the agent's (marked as the agent's); a concern's own suggestion becomes its recommendation (tested) |
| 9 | a substantial rewrite drops the unit's spine links | PROCEDURE: re-link after a rewrite (by design, the rewritten unit is a new unit) |
| 10 | "first proposed", "most reactions" are checked as facts | writing guide: record words in ordinary prose are facts |
| 11 | source and blind reviewer disagree (1864 or 1865) | PROCEDURE: show both sides, recommend; the instructor decides |

## Evidence for

- T3 `req.docs.orientation`: a context-blind agent ran the workflow from the docs alone.
- T3 `req.docs.migration`: the migration ran by tool, at the instructor's request, and was presented for approval with
  the conversion's notes. One of those notes was found silently lost; it is now recorded and shown.
