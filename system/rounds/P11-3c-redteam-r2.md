# 3C closed loop, layer 2: adversarial round 2 (`req.3c.c1`, `req.3c.c2`, `req.3c.k1`, `req.3c.h2`)

Three fresh attackers, one per family, ran on harness `461c24f` (round 1 fixed). They were told not to repeat
round-1 attacks as they were, and to aim at the round-1 fixes and the new mechanisms (D39–D42). Reports and scripts
are in `workspace/studies/p11/redteam-r2/{control,confidence,coherence}/`.

| family | findings | HIGH | MEDIUM | LOW |
|---|---|---|---|---|
| Control (C1–C5) | 13 | 11 | 2 | 0 |
| Confidence (K1–K6) | 10 | 8 | 1 | 1 |
| Coherence (H1–H5) | 14 | 13 | 1 | 0 |
| **total** | **37** | **32** | **4** | **1** |

**Fixed** on `integrate/r2` by three fix lanes (standalone clones, one per family) plus integration. Cross-family
findings went to the lane that owns the code: Coherence F7 to Confidence, Coherence F11 to Control, and the legacy
absolute records without `recordHash` (found by Control) to Confidence. Regression tests:
`tests/redteam-r2-{control,confidence,coherence}.test.mjs`. Full suite 865/865; system verify ready.

**Re-test.** Every round-2 script was re-run against the integrated harness, on one base package upgraded the way an
agent upgrades one (a `units begin` + `index` session; guide questions whose Counts are now short re-reviewed, replayed
as a labelled test double). The base passes the gate. Runner and log: `workspace/studies/p11/redteam-r2/retest/`.
- **37/37 attacks closed.** Eight scripts now stop at a step the fixes refuse:
  - by design: F4 and F11 (glance refused), F6 (re-verify refused), F9 (the call is gone), F10 (log refused);
  - at a setup step: c4-12 (its part-B setup clears re-checks on link reviews, which F6 refuses; probed: the moved
    line is found, 1 line for the blind review), F12 (crashes printing `missed[0]` because none was missed), F13
    (the regroup re-pairs nothing, so nothing is owed; the reversal step is asserted in its regression test).
- **F11** is asserted in its regression test with a no-word-change edit, since a changed word is now substantive (F4).
- **Held checks:** Control 10/10, Coherence 7/7, Confidence held-probes, all still hold.
- **Scope edge, documented (as R1 F10):** a history squashed onto a new root, with the reflog expired and no remote
  branch, tag or earlier release receipt, is not caught (`f5b-squash.mjs`). Each anchor that exists catches it.

**Root causes the fixes addressed:**
- **Control:** "structure" now means only what does not print; one computation of what ships and what is checked
  (`shipped.mjs`; `{{md}}` includes; `role: administrative` needs a logged instructor confirmation); D41 extended to
  guide Counts; full restated-objective key; course objectives covered only by what is taught; D39 bound to its
  logged dispatch and a real line diff over map and guide; `offPlan` fails closed; review basis keyed to the items
  judged.
- **Confidence:** predicate checks read magnitude, negation and quantities named in words; reactions outside `\ce{}`;
  one value parser everywhere (plural/spelled units, HTML minus, MS7); sign-safe corrections; exercise-likeness from
  form only; concern quotes folded from LaTeX; absolute reviews read from the logged prompt and answer.
- **Coherence:** a retired register keeps what a unit owed across delete/restore and split; ids never re-minted;
  re-verification only by a correctness review checked against its logged dispatch; `recordVerification` removed,
  `logUnitRecords` refuses edited records; references by number, LaTeX aliases and label pairing as edges; the light
  classifier allows no changed word; the whole sidecar digested; history checked across every parent and anchor.

**Open operator decisions** (the merged code takes the stricter side until decided):
1. **Light spine changes.** D16/D19-F/D21 call a rephrasing light. Since F4 any changed word is substantive (full
   re-approval). Proposed instead: a rephrasing stays a glance, and the D39 blind review is also asked whether the
   meaning changed; a change in meaning, or no answer, makes it substantive.
2. **Fidelity and guide Counts.** C5-08's fix fills a Count only when the review says the question's type and level
   match the entry, so an MS9 (trial) "differs" can block publishing, against "questions never block" (2026-10-02).
   Proposed instead: a Count needs "yes" on the objective; a type or level that differs stays an instructor question.

**Residuals noted by the lanes** (heuristics, not findings): a single attribution sentence up to 450 characters is
still structure; a `#`/`##` heading of 12 words or fewer is a label; the predicate checks are word lists that lean
toward refusing (a refusal owes a re-check, never a defect); semi and knowledge records from before round 1 carry no
`recordHash` (worth a probe next round); raw `appendLogRecord` remains the in-process trust boundary.
