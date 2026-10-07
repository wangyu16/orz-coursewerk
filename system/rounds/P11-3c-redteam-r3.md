# 3C closed loop, layer 2: adversarial round 3 (`req.3c.c1`, `req.3c.c2`, `req.3c.k1`, `req.3c.k2`, `req.3c.h2`)

Three fresh attackers ran on harness `5bb675e`, which carries round 2's fixes and the operator's D43/D44. Their base
was upgraded live by an agent session. That upgrade found one guide entry served only "in passing" (D41 working), so
the question was revised and re-reviewed. Reports and scripts are in
`workspace/studies/p11/redteam-r3/{control,confidence,coherence}/`.

| family | findings | HIGH | MEDIUM | LOW |
|---|---|---|---|---|
| Control (C1–C5) | 7 | 7 | 0 | 0 |
| Confidence (K1–K6) | 8 | 5 | 2 | 1 |
| Coherence (H1–H5) | 8 | 8 | 0 | 0 |
| **total** | **23** | **20** | **2** | **1** |

The trend is 47 → 37 → 23.

**Fixed** on `integrate/r3` by three lanes, plus integration:
- The requirements were merged by id: 169, none changed on both sides.
- Control C4-01 and C4-02 (D43) went to the Coherence lane.
- Regression tests: `tests/redteam-r3-{control,confidence,coherence}.test.mjs`.
- Full suite 893/893; system verify ready.

**Re-test.** Every round-3 script was re-run against the integrated harness, on one base: the round-3 base plus an
agent session, with the absolute reviews that the wider D30 list now owes replayed as a labelled test double. The base
passes the gate. The runner and log are in `workspace/studies/p11/redteam-r3/retest/`.
- **23/23 attacks closed.** Each was checked against its own condition, not only its exit code (the Coherence scripts
  print their claim line whatever happens):
  - F3: Q5 and A5 now owe a re-check.
  - F4: the moved answer keeps `owes`.
  - F5: Q7 is found.
  - F7: `log-broken` (refs/replace).
  - F8: the renumbered reference owes a re-check.
  - F1, F2, F6: the glance is refused.
  - Control and Confidence scripts each report the finding that now stops them.
- **Held checks:**
  - Coherence 7/7 and Confidence 5/5 hold.
  - Control holds 12/14. Its two "BROKE" lines are probe artefacts: each probe starts with an empty `## A`, which is
    now a unit too. The long and the sentence-like headings it tests are units, as required (checked directly).

**Root causes the fixes addressed:**
- **D43 (Coherence lane):**
  - Removed approved lines are asked about too.
  - The meaning answer is bound to the approval it diffed against.
  - "Light" compares visible words, with signs as words and struck text dropped.
  - A light change whose review says "changed" is not light.
  - A "wrong" concern refuses any glance and reaches the gate as an instructor question.
- **Control:** what prints is orz-markdown's call (`printed.mjs`):
  - between-tab prose, spoil labels, nyml ends and multi-line includes;
  - one credit line per deliverable;
  - labels only over content;
  - raw HTML that can hide text is a blocking `content-hidden` (allowlist).
- **Confidence:**
  - The value parser fails closed (opaque units owe evidence).
  - The name trigger matches the extractor's.
  - Sign words are handled in corrections.
  - **K2 now recomputes:** worked expressions and equation balance (`verify/mechanical.mjs`). On the C2 fixture it
    raised no false alerts.
  - D30 absolutes use a wider list, and scare quotes count.
  - Legacy records are read through what the log binds.
  - A "wrong" concern is settled only by a fresh review or by the suggestion applied surgically.
- **Coherence:**
  - The retired register works across deliverables.
  - Every reference spelling is read, and re-targeted references owe a re-check.
  - Symbol families fold (K, K_eq, K_c, K_p).
  - Git object replacement is refused.

**Choices beyond the letter of a decision** (both stricter; reported to the operator):
- A "wrong" concern refuses a glance even of a rephrasing reviewed "same" (D43). The glance skips the preview where
  the concern is shown; full approval stays possible, and publishing never blocks.
- A changed sign is substantive, not a rephrasing.

**Residuals noted by the lanes:**
- **Answer-to-question bindings** (`questionWording`) still fold a minus before a letter, and struck text. Changing
  this re-keys every stamp, so it needs a migration.
- **Unread labels:** one short label per real section, and the one credit line per deliverable, are never shown to a
  reviewer.
- **Eponyms:** an eponymous term ("Gibbs energy") is exempt from the name trigger.
- **Mechanical check scope:** it reads maths only, and skips unit-changing steps and nested-brace `\ce{}`.
- **Visibility** is decided by tag and attribute rules, not a browser render. `class` and `style` are refused
  outright.
