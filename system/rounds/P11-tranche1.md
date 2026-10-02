# P11, tranche 1: Confidence on the C2 course

The study lives in the project workspace, `studies/p11/`:
- the pre-registration (frozen; amendments A1–A6);
- the report;
- the catalogue and every run.

Claims are made at harness `423c7bb`.

## Results

**Held-out, on target:**

| class | surfaced |
|---|---|
| name | 9/9 |
| constant-or-value | 10/10 |
| direction | 10/10 |
| misconception | 9/9 |

- **Spine cases** forced re-approval.
- **False admissions:** 0.
- **Defects on correct text:** 0.

**K4: not reached.** No harness correction occurred in any run, so the T3 for `req.autocorrect.shown` stays
deferred.

**K5 over three passes:**

| pass | real issues | false alerts |
|---|---|---|
| 1 | 4 | 1 |
| 2 | 0 | 0 |
| 3 | 1 | 2 |

The false alerts were all questions.

## Harness gaps found and fixed

| found by | gap | commit |
|---|---|---|
| K5 pass 2 | an elided scope quote in an absolute review was unscorable | `05f7457` |
| dev cases | a concern quote without `$` was dropped | `423c7bb` |
| dev cases | the reviewer saw a unit without its neighbours | `423c7bb` |
| dev cases | restated objectives were read by nothing | `423c7bb` |
| K4 scenario, after the freeze | the check recommended "still correct" for an answer nobody re-read | this commit |
| K4 scenario, after the freeze | the dispute question was shown as a bare kind | this commit |
| K4 scenario, after the freeze | nothing reported knowledge units unreviewed at their current text (now `knowledgeUnreviewed` in the gate, not blocking) | this commit |

## Open for the operator

- Should the review of changed knowledge units block publishing?
- Should a changed spine line get a blind critique?
- Should answers to disputes be bound to the claim, not the unit?
- A labelling sample (about 20 items).
