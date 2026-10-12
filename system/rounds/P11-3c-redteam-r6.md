# 3C closed loop, layer 2: adversarial round 6 (`req.3c.c1`, `req.3c.c2`, `req.3c.k1`, `req.3c.k2`, `req.3c.h2`)

The first round under D47 (operator, 2026-10-11). Coursewerk does not promise perfect packages: it eliminates
structural problems (Control, Coherence and mechanical mistakes) and catches content errors as much as possible. Each
finding is classed STRUCTURAL-CRITICAL or DETECTION-LIMIT, and the loop closes after a full round with no
STRUCTURAL-CRITICAL finding.

The testers ran on harness `9249684`. The base was upgraded live at no cost. Reports and scripts are in
`workspace/studies/p11/redteam-r6/`.

**Coverage.**
- **Halted testers:** safety classifiers stopped the Control attacker, the C4/C5 checker and, part-way, the Coherence
  attacker.
- **C1–C3:** covered by a 69-rule conformance check (52 conform). Its deviation scripts were run through the real gate
  by the main session, and the round-5 Control attacks were re-run.
- **C4:** two probes written by the main session confirmed the reviewer re-run holes.
- **Not covered:** C5 (read, not run), H3 and H5. The round is therefore not full. Under D48, the main session covers
  these claims itself from round 7.

| finding | claim | class | confirmed through the gate |
|---|---|---|---|
| R6-C4-01: a clean spine-review re-run on unchanged text erases a "wrong" concern and re-opens the glance | C4 | STRUCTURAL | yes |
| R6-C1-01: a "yes" link-review re-run overrides an honest "no", so coverage is bought by re-running | C1 | STRUCTURAL | yes |
| C1-01: CSS in a container's arguments hides the only teacher | C1 | STRUCTURAL | yes (3 variants) |
| C1-03: slide attributes (fragment, off-slide float, 0px track) hide the only teaching slide | C1 | STRUCTURAL | yes (3 variants) |
| C3-03: an included deck prints its speaker notes into the study guide, unread | C3 | STRUCTURAL | yes |
| C1-02, C3-01, C3-02, C3-04: plugin arguments, credit-line lesson, paged running header, shipped files by folder/extension | C1/C3 | STRUCTURAL by contract | no (blocked on side effects) |
| G1: renaming a carried handout drops its carry | H4/H2 | STRUCTURAL | yes |
| G3: carries logged before the records; a refused write plus the advised git restore leaves 0 of 84 carried | H4/H2 | STRUCTURAL | yes |
| G4: a value moved into a new sentence hides from its re-checks | H1/H2 | STRUCTURAL | yes |
| R6-K01: the same page pinned twice counts as two sources | K4 | STRUCTURAL | yes |
| R6-K02: a hand edit of the instructor's value bypasses the correction guard | K4 | STRUCTURAL | yes |
| R6-K03: paraphrasing the instructor's sentence raises nothing | K6 | STRUCTURAL | yes |
| R6-K04: a confirmation bound to factHash survives "exothermic … lowers" → "endothermic … raises" | K1 | STRUCTURAL | yes |
| R6-K05: a false value in the guide's rubric publishes unchecked | K1 | STRUCTURAL / scope (D48) | yes |
| R6-K06: `\textrm{kJ}` etc.: the claim reader reads the value, but the classifier owes nothing | K1 | STRUCTURAL | yes |
| R6-K10: a no-op TeX regrouping plus a clean re-run clears a concern | K5 | STRUCTURAL (MEDIUM) | yes |
| R6-K07, K08, K09, K11 (LaTeX value forms, wrapped results, reaction spellings, OpenStax "× ×") plus reader-view probe items | K1–K3 | DETECTION-LIMIT | — |

**Totals:**
- 15 STRUCTURAL-CRITICAL findings confirmed through the gate.
- 4 more structural by contract.
- About 9 detection limits.

## Fixed by cause (D46), five lanes plus D48/D49

1. **Reviewer shopping** (`verify/standing.mjs`).
   - One standing rule covers every review kind: knowledge, spine (D39/D43), link, framing, fidelity, absolute and
     fact-check.
   - Currency is judged on the reader view.
   - Between current reviews of the same text, the most adverse answer stands. Only a real text change, or the
     instructor's answer, clears it.
2. **What prints is read** (`printed.mjs`, `shipped.mjs`).
   - Container, plugin and slide arguments, and paged settings, go through an allowlist of visible values; anything
     else fails closed (`content-hidden`).
   - An include that prints what its target's own reading leaves out is refused.
   - Paged headers and footers and the meta author are framing units.
   - The credit line is shown to every reviewer of its deliverable.
   - What ships equals what is read: records exempt only when named exactly; any text-bearing file is read or
     refused.
3. **The instructor's text is protected on the text** (`core/authorship.mjs`).
   - A register of their text is kept, and every agent change is read against it.
   - A meaning change asks them (`instructor-edit-unasked`).
   - A changed fact, or a reversed direction word (D49), blocks (`instructor-fact-changed`) until reverted, corrected
     through the guard, or kept.
   - Sources are counted by content.
   - Confirmations are bound to what the instructor saw (the seen key).
4. **The log and the records agree** (`core/reconcile.mjs`).
   - Act, log and write happen in one step.
   - The gate checks every logged promise against the records (`unit-record-behind-log`); an interrupted act is
     completed only while its evidence holds.
   - Identity follows content across renames.
   - "What changed" survives retirement. A re-check that cannot show it is cleared only by the instructor (D49).
5. **Readers agree, and the spine says what to teach** (D48, D49).
   - One value reader decides everywhere.
   - Spine detail (data, explanations, derivations, attributions) raises a `detail-in-spine` question that suggests the
     study-guide section to move it to. On C2 the one remaining flag is the Guldberg–Waage gloss.
   - Spine values meet MS7.
   - Reader coverage was widened, and the reader view keeps scripts and primes and fails closed on hiding styles.
- **Also (D49):**
  - the instructor may overrule a link verdict (`coursewerk.mjs answer --overrule-link`), bound to the text;
  - SVG and PDF under `assets/` ship as media.

**Integration:**
- review currency now combines the reader view, the printed labels and credits, and the standing rule;
- `confirmUnits` happens in one step, records contentHashes and deps, and binds the seen key;
- the records lane's internal check was renamed `loggedConfirmationStands`;
- `spine-detail` was renamed `detail-in-spine`, so it no longer collides with the blocking `spine-` prefix.

**Totals:** requirements 206, all closed. Full suite 1037/1037. System verify ready.

## Re-test

All round-6 finding scripts were re-run against `integrate/r6` (`retest/`).
- **All attacks closed.** Each Control script is now stopped by its own fix:
  - `content-hidden`;
  - `include-unchecked`;
  - `document-unchecked`;
  - `framing-review-owed` for the credit line.
- **Every Confidence and Coherence script prints HELD,** with two that crash by design:
  - G3: the version is now refused before anything is logged;
  - C3-04: the publish is refused on `document-unchecked`.
- **Held probes:** Confidence 10 of 11. K2-c "BROKE" is a stronger outcome: `\boxed{1.48}` is now read and caught
  rather than counted.

## Next

- **Paused (operator):** "pause after round 6 fixing".
- **Round 7:** the main session covers C4, C5, H3 and H5 directly (D48); agents attack the rest.
