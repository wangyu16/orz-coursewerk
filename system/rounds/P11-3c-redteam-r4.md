# 3C closed loop, layer 2: adversarial round 4 (`req.3c.c1`, `req.3c.c2`, `req.3c.k1`, `req.3c.k2`, `req.3c.h2`)

Three fresh attackers ran on harness `b51499d`. Their base package had been upgraded live: the wider D30 absolute list
owed 20 context reviews, at $0.34. Coverage was completed in two ways:
- **Control C2, C4 and C5:** the Control attacker stopped before reaching them (its session was halted twice by a
  safety classifier). They were covered by a rule-by-rule conformance check: 44 rules, 36 conformed.
- **Confidence K4–K6:** the attacker was sent back to cover them.

Reports and scripts are in `workspace/studies/p11/redteam-r4/{control,control-c245,confidence,coherence}/`.

| source | findings | HIGH | MEDIUM | LOW |
|---|---|---|---|---|
| Control attacker (C1, C3) | 3 | 3 | 0 | 0 |
| Control conformance check (C2, C4, C5) | 4 | 2 | 2 | 0 |
| Confidence (K1–K6) | 17 | 9 | 7 | 1 |
| Coherence (H1–H5) | 8 | 8 | 0 | 0 |
| **total** | **32** | **22** | **9** | **1** |

The round totals so far are 47 → 37 → 23 → 32. The count rose because coverage widened: the round-3 K2 recompute check
was attacked for the first time and gave 11 findings, and the C2/C4/C5 and K4–K6 gaps were filled.

**Stopping rule from here (D45, operator 2026-10-07):** the loop stops after a FULL round with no HIGH finding. A round
is full when every claim was attacked or checked rule by rule. **Operator, 2026-10-08:** "pause after round 4".

**Fixed** on `integrate/r4` by four lanes (Control, Confidence-A K2, Confidence-B, Coherence) plus integration.
- **Regression tests:** `tests/redteam-r4-{control,confidence-k2,confidence,coherence}.test.mjs`.
- **Requirements:** 176, all closed.
- **Full suite:** 929/929; system verify is ready.
- **Integration made two changes:**
  - **R4-K15 narrowed.** The lane made "the newest review of the current text speaks", which let re-running the
    reviewer on unchanged text clear a concern. History now means a review of OTHER text, and a regression assertion
    was added.
  - **`confirmUnits` merged:** it logs first (Coherence F7) and records `contentHashes` (Confidence-A K07).

**Re-test.** Every round-4 script was re-run against the integrated harness. The base is the round-4 base plus the r4
question-binding migration (24 answer re-checks, replayed as a labelled test double), and it passes the gate. Runner
and log are in `workspace/studies/p11/redteam-r4/retest/`.
- **32/32 attacks closed.** Each was checked against its own condition:
  - **C3-01:** the deck footer is now a framing unit. The honest review raises `off-spine`, an instructor question
    (D44, never blocking).
  - **Coherence F1 and F6:** the scripts as written hold trivially. Their explicit variants (`f1b`, `f6b`) show all 3
    emphasised users and all 14 namespaced users owe a re-check.
  - **F7:** the write is refused.
- **Held checks:**
  - Control conformance: 43/44. The one "deviation", C5.6, is the probe running per-chapter matching itself; on the
    same edit the real gate raises `guide-entry-short` and blocks.
  - Control held checks hold; Coherence 7/7; Confidence `held-probes` and `held-probes-k4k5k6` (L2) hold.
  - **L1** is re-targeted at all 1134 legacy knowledge records: rewritten, findings are identical (33 → 33).

**Root causes the fixes addressed:**
- **Control:**
  - Visibility is the FRAME's call (`printedModel(text, { frame })`): allowlisted container classes and plugin kinds,
    a lone `::: tab` and hiding attributes are `content-hidden`, and speaker notes are not teaching.
  - Deck `footer:`/`author:` are units.
  - Spine list items keep their continuation lines.
  - One guide matching covers all chapters, and a global shortfall names every owed question.
- **Confidence-A (K2):**
  - Every link of a worked chain is read: `\%`, `aligned` environments, chains across spans.
  - A dedicated equation reader handles charges, arrow conditions, every reaction, complexes and nuclear equations.
  - What cannot be read is counted as `notChecked`, never guessed.
  - Instructor confirmations are bound to contentHash.
  - Units are compared by meaning.
- **Confidence-B:**
  - Number words are values.
  - A verb carries the sign of an energy ("released"/"absorbed"), in admission and in correction.
  - Concerns travel with the text (`lineage`).
  - Whose text it is is decided before "applied". `instructor-edit-unasked` is new.
- **Coherence:**
  - "Light" is decided on the rendered text: only whitespace, emphasis, list markers, case and plain punctuation.
  - Term edges are read on the visible text, and term targets are namespaced by chapter.
  - Anaphoric references are edges.
  - History anchors cover every branch and the release `logHead`.
  - A re-check is shown what moved.
  - The answer binding is on the visible text, with signs kept (migration: about 13% of units owe one cheap re-check).
  - `writeUnitRecords` refuses unevidenced clearing.

**Choices reported to the operator:**
- Old confirmations no longer exempt the mechanical check.
- Unreadable maths is counted, never blocking; unit conversions are not checked.
- Custom `:::` classes and `{{sp[class]}}` outside the allowlist block.
- Speaker notes are excluded, not reviewed.
- A signed value beside a sign verb is read literally.
- The migration's one-time re-checks.
- A `git reset --hard` that drops logged records is `log-broken`.

**Residuals noted by the lanes:**
- The verb-sign reader is a fixed list, and covers energies only.
- Small mole counts written in words are skipped.
- `admitEvidence` cannot tell a genuine re-admission from a forged one without the source texts.
- Release receipts are looked for only in `../dist`.
- Paged print of closed spoils is not handled.
