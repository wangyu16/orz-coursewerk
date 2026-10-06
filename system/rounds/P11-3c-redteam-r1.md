# 3C closed loop, layer 2: adversarial round 1 (`req.3c.c1`, `req.3c.c2`, `req.3c.k1`, `req.3c.h2`)

Three independent attackers, one per family, ran on harness `e48ad5d`. Each found reproducible violations, each with
a script that ran the real gate. Reports and scripts are in `workspace/studies/p11/redteam/{control,confidence,
coherence}/`.

| family | findings | HIGH | MEDIUM | LOW |
|---|---|---|---|---|
| Control (C1–C5) | 17 | 14 | 3 | 0 |
| Confidence (K1–K6) | 15 | 12 | 3 | 0 |
| Coherence (H1–H5) | 15 | 11 | 3 | 1 |
| **total** | **47** | **37** | **9** | **1** |

**Fixed** in `5fcbe10`, by three fix lanes plus integration. Each finding has a regression test:
`tests/redteam-r1-{control,confidence,coherence}.test.mjs`.

**Two operator decisions closed four Control findings:**
- **D41, coverage counts verified links:** C2-01, C1-09.
- **D42, everything that ships is checked:** C3-07, C3-14.

**Re-test.** All 47 attack scripts were re-run against `5fcbe10`, on a base package upgraded the way an agent
upgrades one: answers re-checked, restamped, links and framing reviewed, exercise data confirmed. The base passes
the gate.
- **46 attacks are closed.**
- **F7 (MEDIUM, H3) is dismissed as a deliberate trade-off.**
  - A question reworded with a synonym ("raised" → "increased") makes its answer owe one re-check, because F2 needs
    every rewording to be caught.
  - The re-check is agent work (a blind re-review of the answer with its question, a few cents) and never an
    instructor question. It blocks only until the agent does it.
- **The record:**
  - Control: 17/17 closed.
  - Confidence: 15/15 closed.
  - Coherence: 14/15 closed, plus F7 by design. F9 and F15 now fail before their violation, and both have passing
    regression tests.

**Root causes the fixes addressed:**
- **A stamp counted as re-verification.** Now an owed re-check clears only through a logged re-check of the current
  text made after the change, or through the instructor.
- **Positional answer binding.** Answers are now bound to the question's id and wording hash.
- **Lexical dependency edges.** Plurals, aliases and unitless values now count.
- **Unauthenticated records.** Sidecar digests are logged, and the pack binds to the decision.
- **A HEAD-only log check.** The whole log history is now verified.
- **A narrow value parser.** The parser now shares the unit table; a support claim must hold for the predicate, the
  direction and the reaction; anchoring needs stoichiometry.
- **A review that was opt-in and failed open.** Coverage now needs verified links (D41), unscorable reviews are
  raised, and the review reads what coverage counts.
- **Structure that hid prose.** The objectives-section prose, framing (D42) and declared documents (D42) are now
  read.

**Process lesson.** The harness's system-index tests commit into the git repository they run in. A fix lane in a
linked worktree had four "baseline" commits made into its branch, with fixtures deleted. Run the full suite only in
a standalone clone or in the main repository.
