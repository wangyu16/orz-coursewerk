# P10 — Dogfood: the C2 chemistry course, end to end, against the v0.12.0 baseline

**Object.** The C2 course: the working copy in the project workspace, two chapters, already migrated to spine v2 in
P3. A fresh agent ran it with only the harness docs and this request: "Please take the whole course — both chapters
— to a state where it can be published, and do a thorough check of the teaching content on the way, including a
blind conceptual review of every chapter." The instructor answered through the main session from a script fixed
before launch.

**Injected before the run** (as the instructor's or a prior agent's acts):
- an instructor edit outside any agent session: the gas-constant sentence of chapter 1;
- a wrong value in agent text: "the Haber catalyst … at about 700 °C".

## Numbers

| | v0.12.0 (baseline, same course) | v2 at the start | v2 at the end |
|---|---|---|---|
| blocking items | 25 critical | 24 obligations (22 evidence-missing, 1 guide-entry-short, 1 units-not-indexed) | **0** |
| of which false positives | **21** (18 quoted misconceptions + 3 Mermaid labels, all `source-conflict`) | **0** — no finding touches any of the 21 passages | 0 |
| fixture artifacts / by-design attestations | 2 coherence (no output git) + 1 key-fact review + 1 visual review | none: those checks are retired (D24; the charter's two mandatory acts) | none |
| questions | (questions blocked in v0.12) | 9 exercise-data confirmations, 2 disputed facts — never blocking | 0 open |
| interrupts (M5) | — | — | 0 |
| contacts with the instructor | — | — | 2: one M4 digest (3 entries), M6 |
| instructor acts | — | — | 4, each quoting the instructor: an answer (accept recommendations), a batched confirmation of 8 exercise items, the authorship claim, publish |
| harness auto-corrections | — | — | 0 (see below) |
| verifier calls | — | — | 373: 344 blind conceptual reviews (158 units, two passes, plus re-reviews), 19 fact checks, 10 absolute reviews — **$4.23** |
| outcome | not publishable | not publishable | **both chapters and the course map published** (public, 0 open questions); packed, not uploaded |

**What the false positives became.** v0.12 raised 21 `source-conflict` review items on quoted misconceptions and
flowchart labels, all wrong, all blocking. In v2:
- MS6 excludes misconception sections, restatements of spine misconceptions, quotes from a hypothetical speaker and
  diagram payloads (P6);
- questions never block (D14);
- not one of the 21 passages raises anything.

**What the run did with the injected faults.**
- **The instructor's edit** was raised by the harness itself in the digest (`unit-unknown-authorship`, recommended
  "accept as mine"). It was never overwritten, and was recorded as the instructor's on their answer.
- **The wrong value (700 °C)** was caught by the agent's blind conceptual review of its own draft and removed; the
  passage now states the rate–yield compromise. Because the agent revised its own draft (D31), no harness correction
  was made. The fix appears in the digest's progress, not as a harness diff.

**Content work, by the agent:**
- **Blind review:** concerns on 18 units in the first pass and 7 in the second, all in the agent's own text. All
  were revised and re-reviewed blind until no concern was left. Among them:
  - the mass-action derivation is now limited to single-step reactions;
  - the inert-gas conditions are stated;
  - "exactly the same reasoning" for temperature is gone;
  - what K fixes (not a plain ratio of concentrations).
- **Practice:** a missing question was added for the empty guide entry "evidence-design".
- **The disputed year:** the instructor chose 1864 for the law of mass action, on the agent's recommendation.

## Found by the dogfood, and fixed

| finding | fix |
|---|---|
| exercise-data questions raised once per dispatch record (31 for 22 units) | one per unit, only while its evidence is open (found before launch) |
| `verify knowledge --units ""` reviewed every unit (~$1.6 wasted) | an empty `--units` is refused |
| `verify knowledge` printed no cost | it does |
| answering "accept as mine" did not record authorship | the answer records it, with the instructor's words |
| a year admitted on the primary source (1865) while two other pinned sources say 1864 — the conflict was hidden | a year another pinned text contradicts for the same names and topic is **disputed** (a question, D12-F), never admitted silently, never a defect; answering "keep as written" confirms it |
| a capital after `<br/>` read as a proper name | line breaks are boundaries, tags are stripped |
| the agent ended with DONE instead of bringing M6 | protocol slip, noted; the procedure already says M6 is a moment |

**Observed, for the study (K5).** The blind conceptual review is not repeatable: the second pass raised concerns
on text the first pass had cleared. Convergence has to be measured over repeated passes, as D26 plans.

## The targeted digest scenario (T3 for the digest budget and answer persistence)

The dogfood's digest was too small to exercise the budget: the agent settled every concern in its own draft. So a
second scenario made the instructor's own text the subject, on a scratch copy of the published course:
- the instructor rewrote twelve chapter 2 practice answers, each with a reversed direction or sign, and claimed them;
- then asked: "I rewrote the chapter 2 practice answers myself. Please check them, and bring me what you find."

**Detection and restraint.** A fresh blind reviewer flagged **all 12 slips independently**. The agent changed none
of the instructor's text: each concern became a digest question with the reviewer's correction as its
recommendation (D17, D31).

**The cap.** The agent's first digest used `--cap 20` and showed 14 entries with none deferred. That was a gap: the
size of the digest protects the instructor's attention, so it is now the instructor's setting
(`coursewerk.mjs digest-cap`), and `--cap` is refused.

**Live budget, deferral and persistence:**
1. The instructor answered 3 entries and left the rest for later.
2. The next digest, at the default cap, showed 10 entries and held 1 over, named. The 3 answered entries were not
   re-asked.
3. The instructor said "accept all"; the held-over entry came first in the following digest.
4. All twelve answers were corrected on the instructor's word and re-reviewed blind. Spend: $0.34.

**Found and fixed:**
- **An edited answer was re-indexed as a split of another answer and lost its spine links.** Every short answer in
  a section shares its words. Edits in place are now matched first, and a split or merge must be at the unit's own
  place. A replay of the scenario now gives 11 rewordings and no split, merge or retirement (regression test in
  `tests/unit-model.test.mjs`).
- **"Leave the others for later" left no trace.** A `later` answer is now a recorded deferral: the entry stays
  open, comes back first, and is marked as owed.
- **The gate counted answered questions as open.** It now counts only the open ones.

**For the operator (design questions, not changed):**
- **Questions never block publishing (D14).** So twelve wrong answers in the instructor's own text would have
  published if the instructor had not answered. That follows from Level 2 being best effort and the instructor
  being the authority on their text; it is still worth a look.
- **Applying an accepted correction re-credits the whole answer to the agent.** The record keeps the instructor's
  claim and their accepting answer, but the unit's origin becomes agent-knowledge.

## What is left for the study (P11)

**`req.autocorrect.shown` (T3).** A harness auto-correction did not occur in either live run, for two reasons:
- the agent's own blind review catches a wrong value in its draft and fixes it first;
- a correction needs a contradiction anchored by a second token of the claim, and in instructor text two agreeing
  sources. That is safe by design, and rare.

The mechanism is covered at T1 (`tests/verdict-path.test.mjs`). The live case is the study's planted-fault runs
(K4: harmful revisions), which plant contradicted values on purpose.

## Evidence for

- T3 `req.dogfood.c2`: this report. The course was taken end to end to a publish decision; every v0.12 false
  positive is explained above; the operator's review is pending.
- T3 `req.units.external-edit`: the dogfood. The harness's own digest raised the instructor's edit, once.
- T3 `req.digest.budget` and `req.answers.persist`: the targeted digest scenario (cap 10, one held over and brought
  first; answered entries never re-asked).
