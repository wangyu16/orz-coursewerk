# Working on a Coursewerk package (spine v2) — for the agent

This is orientation, not a script. You do the work; the harness records it, checks it, and decides only what is
deterministic. The instructor decides what only a person can.

## Whose acts are whose

**The instructor's**, always in their own words (quote them in `--words`):
- approving the spine (`approve`);
- changing a chapter's mode (`assemble`, `back-to-draft`);
- steering;
- answering digest questions;
- confirming facts;
- reverting a correction;
- publishing.

You run these commands when the instructor has said so. You never run them on your own judgment.

**Yours:**
- authoring units and linking them to the spine;
- running the checks;
- fixing what is routed to you;
- verifying facts against sources;
- reviewing absolutes;
- bringing the digest.

## When you talk to the instructor

Only at six moments. Everything else is your own work.

| moment | when | bring |
|---|---|---|
| M1 intake | a new course | use profile (public/private), sources or raw materials, audience, scope |
| M2 steering | before assembling | the seven steering questions with your proposed defaults; "accept all" is one answer |
| M3 spine approval | a chapter is assembled | the standardized spine, a diff against the input, your critique as questions |
| M4 digest | the end of an authoring batch, before publishing | `node scripts/coursewerk.mjs digest --deliver`: ranked questions with recommendations, your corrections as diffs, progress |
| M5 interrupt | work cannot continue and only the instructor can decide | `coursewerk.mjs interrupt` — only for a spine-scope conflict, a missing input, a rights blocker, or a spine-change request |
| M6 publish | the instructor asks | `coursewerk.mjs status`: what can be published and why the rest cannot |

## The states

- **DRAFT → ASSEMBLING:** the instructor says "assemble".
- **ASSEMBLING → PACKAGE:** the instructor approves the spine.
- **A structural change** (objectives split or merged, chapters reorganised) opens a new major version, and the
  chapter goes back through ASSEMBLING.

Never edit the spine yourself in PACKAGE: an edit voids its approval, and nothing in that chapter publishes until
the instructor re-approves.

## The work loop (PACKAGE)

Work in batches. A batch is:
1. Author units from the approved spine, the steering and the sources, or from your own knowledge with its origin
   recorded. Run `units begin` before you write and `units index --as agent` after.
2. Link units to spine nodes (`units link`).
3. Run the gate (`gate.mjs`).
4. Fix what is routed to you, and verify facts with `verify.mjs semi` and `absolutes`.
5. Run the gate again.

**Stop** when a run raises nothing new for you, or the batch budget is spent. Then bring the digest (M4).

**Write checkable statements:** `docs/writing-checkable-statements.md`.

**When the instructor edits text directly and asks for a check:**
- correct mechanical and semi-mechanical errors (`verify correct`) and show the diff;
- raise knowledge-level concerns as questions;
- stay silent on rephrasing that keeps the meaning.

## Commands

`node scripts/coursewerk.mjs status | assemble | back-to-draft | approve | digest | answer | publish | revert | interrupt`.
Each command refuses with the next step when its preconditions fail.
- Units: `scripts/units.mjs`.
- Verification: `scripts/verify.mjs`.
- The spine: `scripts/spine.mjs`.
- The gate: `scripts/gate.mjs`.
- Packing a published decision for Alembic: `scripts/pack.mjs`.
