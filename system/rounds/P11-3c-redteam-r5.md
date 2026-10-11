# 3C closed loop, layer 2: adversarial round 5 (`req.3c.c1`, `req.3c.c2`, `req.3c.k1`, `req.3c.k2`, `req.3c.h2`)

Three testers ran on harness `3dbc556`. The base was upgraded live: the round-4 migration owed 24 answer re-checks,
costing $0.43 and raising no concerns. Every claim was covered:
- C4 and C5 were covered only by re-running round 4's conformance check (43/44). The Control tester was halted by a
  safety classifier while reading the C4 code, so no new C4/C5 attack was written.
- Every other claim has finding scripts or held checks.

Reports and scripts are in `workspace/studies/p11/redteam-r5/{control,confidence,coherence}/`.

| family | findings | HIGH | MEDIUM | LOW |
|---|---|---|---|---|
| Control (C1–C5) | 4 | 4 | 0 | 0 |
| Confidence (K1–K6) | 11 | 6 | 4 | 1 |
| Coherence (H1–H5) | 7 | 5 | 2 | 0 |
| **total** | **22** | **15** | **6** | **1** |

Findings per round so far: 47 → 37 → 23 → 32 → 22. Round 5 is **not** a clean round under D45. R5-K10 is HIGH by the
brief's literal rule and MEDIUM by the R4-K16 precedent; the stop decision does not depend on which.

## Fixed by CAUSE, not by finding (D46, operator 2026-10-08)

"fix these five causes. for projects like coursewerk, the fix should always be the causes rather than finding by
finding. pause after this round fixing."

Four lanes each owned a cause across every module. The round's findings served as test cases, alongside new variants
that each lane built.

1. **Bindings read text that differs from what the reader sees** (C2-01, F5, F7, `does [](not) shift`).
   - One reader view (`core/rendered.mjs`):
     - prose is rendered by orz-markdown, with struck and hidden text, link destinations and invisible characters
       removed;
     - maths is typeset by KaTeX to canonical MathML, so grouping and spacing vanish while every sign, script and
       symbol stays.
   - From it come `meaningKey` (review currency, absolute currency) and `lightKey` (answer/reference binding `q3:`,
     spine light test, `unit:` targets `v:`).
   - `reviewWording` is deleted. `contentHash`/`factHash` stay source-bound by design (D17).
   - A 54-row property table backs it. Migration cost: 0 re-checks on the C2 fixture and on the base.
2. **Fixed-vocabulary readers fail silently** (K01–K08; C1-01, C1-02, F1, F6).
   - Readers detect candidates widely, then either read them fully or record them as unread:
     - an unread value fails closed (it owes evidence);
     - an unread computation or reaction is counted in `notChecked`;
     - joins need textual justification;
     - a half-read form is skipped, not judged.
   - The house `~sub~`/`^sup^` notation is read.
   - Slide and page visibility come from the frames' own parse and render: orz-slides `renderSlide` regions,
     markdown-it table columns, and one region-name pattern.
   - Edges fail toward an edge: a figure is linked to the prose naming it, and a term's distinctive modifier counts
     as a use (about 22 more edges per package).
3. **Authorship is lost at a split** (K09, K10, K11).
   - Ownership follows the text (`core/authorship.mjs`): through lineage, the retired register and logged
     authorship acts. Every authorship consumer uses this one rule.
   - Writes that strip credit or lineage are refused.
   - The 8-character "applied" threshold is replaced by a positional test.
4. **An unbound setting can switch the gate off** (F2).
   - Settings that weaken checking are bound to the log (`records/config.mjs boundConfig`): spine mode, retrieval
     destinations, digest cap, module demotions.
5. **Scope and trust decided by a name or a self-asserted mark** (F3, F4, C3-01).
   - A chapter version carries what teaches the chapter, decided by content: links and a declared chapter.
   - A carry counts only through a logged `units-carried` record.
   - Correction `shown` flags and link resolutions count only through the log.
   - Handouts are checked against their declared chapter.
   - Table header labels are exempt only as a whole row, and every printed label is shown to its passage's reviewer.

**Integration.** The reader-view and label lanes both reworked review currency. They were combined so that a review
is bound to the reader-view basis plus the printed labels (also read in the reader view). A pre-round-5 review stands,
directly or through the R4/legacy migration, only while the labels match the package's baseline. Requirements were
merged by id: 187, all closed. Full suite: 972/972. System verify: ready.

## Re-test

All 22 round-5 scripts were re-run against `integrate/r5` on the round-5 base, with the r5 reader-view migration
applied (0 re-checks). The base passes the gate. The runner and log are in `workspace/studies/p11/redteam-r5/retest/`.

- **22/22 attacks closed:**
  - each Control script reports the finding that now stops it. C3-01's header is now read, and the honest review
    raises `off-spine`, an instructor question;
  - the Confidence scripts print HELD. In K1, "control=false" means the attack forms now owe evidence;
  - the Coherence scripts print HELD, and F3's forged carry write is refused.
- **Held checks:**
  - Coherence 13/13, Confidence 15/15, and the Control round-4 attacks all hold.
  - Conformance is 43/44; the one miss, C5.6, is the known probe artifact, and the real gate blocks.

## Choices reported to the operator

- The answer binding stays case-folded (`lightKey`), as the old stamps were. A case-sensitive key would cost about 81
  one-time re-checks.
- Unread computations and reactions are counted, not raised.
- Labels are review context; a wrong heading is not itself a knowledge concern.
- A unit with mixed instructor and agent words is wholly the instructor's.
- New fields and events: DOCUMENTS.json `chapter`/`chapters`, a `demote` module change, and `corrections-shown` and
  `links-resolved` log events.
- Unlinked declared-document units are carried into every chapter version (fail-safe).
- One-time effect on existing packages: unlogged link resolutions and `shown` flags show again until they are redone.

## Residuals and next steps

- C4 and C5 need fresh conformance rules; the round-5 tester only re-ran round 4's.
- The connective list, range separators and sign verbs are fixed word lists.
- An unbaselined label edit before the first round-5 session keeps old reviews.
- Figure edits indexed as unknown authorship are baselined after the change.
- **The loop pauses here (operator).** Round 6, the next D45 test, waits for the operator.
