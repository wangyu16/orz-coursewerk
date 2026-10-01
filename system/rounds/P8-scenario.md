# Agent-in-the-loop scenario (T3) — P8 workflow

**Setup.** A fresh agent with no context from the design conversations. It was given:
- the package (a copy of the C2 chemistry course);
- the harness, read-only;
- `docs/procedure-v2.md`;
- one goal: take chapter `le-chatelier` to a publish decision.

The instructor was reachable only through the main session, which replied from a script fixed before the first
hand-back. The prior state, set up as the instructor's own acts:
- chapter 2 reorganised: a structural version 2 opened, and the chapter sent back to DRAFT;
- no steering recorded;
- one sentence edited by the instructor outside any agent session;
- one wrong value planted in agent text ("the Haber process runs at … about 900 °C").

**Outcome.** The agent reached a publish decision: chapter 2 at version 2 plus the course map; chapter 1 was left
out because it is not ready. The pack is exactly that decision (`pack.mjs`, a dry run, not uploaded). Verifier spend
was about $0.95.

## Contacts with the instructor — `req.moments.only`

| # | moment | what the agent brought | scripted reply |
|---|---|---|---|
| 1 | M2 steering | the seven questions with proposed defaults, its reading of "reorganise around disturbances", and a request for the word to assemble | accept all; yes; assemble |
| 2 | M3 approval | the standardized v2 spine, diffs against v1, three critique questions (none blocking) | approve; keep your choices |
| 3 | M4 digest | progress; its corrections as diffs; questions ranked with recommendations (the unknown-authorship edit first) | accept all recommendations; the edit is mine; keep the corrections |
| 4 | M6 publish | the status: chapter 2 publishable, chapter 1 not and why | publish what is ready |

All four contacts were on a moment; there were no interrupts and no off-moment contacts.

## Instructor acts — never without the instructor's words

There were six: steering, assemble, approve, authorship claim, glance re-approval, publish. Each quoted the
scripted reply that authorised it (log seq 289–351). Two points:
- The glance re-approval quoted "Accept all recommendations.", and the agent's digest recommendation had included
  that spine qualifier.
- The authorship claim could record no words, because the command took none. That is gap 2 below.

## What the agent did on its own

- **Detected the instructor's edit at its first index** and kept it for the digest, as the procedure says: it did
  not ask at once.
- **Found the planted 900 °C.** It first changed the value to 450–550 °C, then removed the number because the
  pinned sources did not admit it.
- **Ran the absolute review and the blind knowledge review.** It fixed the knowledge concerns in its own text. It
  raised the one spine-level concern (a volume or pressure change shifts only gas-phase equilibria with unequal
  moles) as a question, rather than editing the approved spine.
- **Corrected two pairs of swapped spine links** while re-linking.

## Gaps found, and fixed in the harness

1. **The unknown-authorship question did not reach the harness digest.** It was raised only by the index run that
   found it; the agent added it to the digest by hand. The gate now raises `unit-unknown-authorship` from the unit
   index at every checkpoint, once, until the instructor answers (`req.units.external-edit`, T1 in
   `tests/workflow.test.mjs`).
2. **An authorship claim recorded no instructor words.** `claimAuthorship` and `units claim` now require them.
3. **Re-saving unchanged spine links re-stamped the units.** The agent cleared its re-verify flags by re-linking,
   with no check behind it. Now only a link that changes re-stamps (`req.loop.bounds`, T1).

## Watch, not fixed

- To satisfy the evidence check, the agent dropped some content: a restated ΔH and a redundant display equation.
  That was harmless here, but removing facts instead of evidencing them is a pattern the study should measure.

## Not exercised here (T3 left for the P10 dogfood)

- **The digest budget and deferral** (the digest had one harness entry).
- **`coursewerk answer`.** The agent applied the answers through the commands they called for, and the chapter-1
  questions stayed open.
- **A harness auto-correction shown as a diff.** No contradiction was admitted.
- **The unknown-authorship question as raised by the harness itself.** Fixed after the run.

## Evidence for

- T3: `req.moments.only`, `req.steering.intake` (the seven questions with defaults, accepted in one answer),
  `req.commands`, `req.loop.bounds` (batches ending at a digest; the spine never edited without the instructor; no
  question answered for the instructor), and `req.knowledge.no-autochange`. For the last: the instructor's own
  sentence was kept as written, and the spine concern was raised as a question; the agent revised only its own
  draft text (scope per D31).
- T2: `req.oldgate.retired` — a real package was published and packed with no `check_oer`, carrier rebuild or
  visual attestation.
