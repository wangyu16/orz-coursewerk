# 3C closed loop, layer 2: adversarial round 7 — the loop closes (`req.3c.c1`–`c5`, `req.3c.k1`–`k6`, `req.3c.h1`–`h5`)

The second round under D47. Each finding is classed STRUCTURAL-CRITICAL or DETECTION-LIMIT; the loop closes after a
full round with no STRUCTURAL-CRITICAL finding. The testers ran on harness `f88873e` (round 6 recorded); reports and
scripts are in `workspace/studies/p11/redteam-r7/`. Under D48 the main session covered C4, C5, H3 and H5 itself, and
C1–C3 where the Control tester stopped; agents attacked Control (C1–C3), Confidence (K1–K6) and Coherence (H1–H5).

| finding | claim | class |
|---|---|---|
| R7-C3-01: paged `font_family` carries CSS that prints unread text (a five-key denylist, not the allowlist the contract names) | C3 | STRUCTURAL |
| C2-L1: a link-set change with the text unchanged lets a re-run "yes" override an honest "no" | C2 | STRUCTURAL |
| C2-L2: the instructor's link overrule outlives a substantive, fully approved change of the objective it judged | C2 | STRUCTURAL |
| R7-K01: a changed fact is counted only inside one remove-plus-insert diff block | K4 | STRUCTURAL |
| R7-K02: fact tokens are an unordered multiset (two ranges swapped between stages) | K4 | STRUCTURAL |
| R7-K03: a confirmation's factHash and seen key are order-free (values swapped, still evidenced) | K1 | STRUCTURAL |
| R7-K04: a concern's currency is bound to the whole unit, so one unrelated word plus a clean re-run clears it | K5 | STRUCTURAL |
| R7-K05: deleting the instructor's registered paragraph outside a session asks nothing | K6 | STRUCTURAL |
| R7-K06: the mirror test is an exact ±300-character window (a PDF extraction counts as a second source) | K4 | STRUCTURAL |
| R7-K10: the meaning key drops prose punctuation (a moved full stop re-attaches a condition) | K6 | STRUCTURAL (D50: punctuation is meaning) |
| H-01: a version's carry is a snapshot, so a unit entering the scope later never owes D15 | H4/H2 | STRUCTURAL |
| H-02: a value that left its target is searched for only in that target's section, failing open | H1/H2 | STRUCTURAL |
| H-03: what a retired unit owed passes only to new units, never to a kept unit that takes its words | H2/H1 | STRUCTURAL |
| H-04: a sidecar the log never wrote takes a unit's identity undetected | H4/H5 | STRUCTURAL |
| R7-K07 (typesetting the instructor's value blocks, fails closed), K08, K09, K11 (value forms read nowhere); C4.11, C4.17; C3.16 (false block) | K1–K3, C3, C4 | DETECTION-LIMIT |

**Main-session checks on `f88873e`:** C4 15/18, C5 9/10 (C5.4 a test premise), H3 10/10, H5 11/11, C1–C3 66/69
(two test artefacts, C3.16). **Totals:** 14 STRUCTURAL-CRITICAL, 24 findings in all.

## Fixed by cause (D46, D50), five lanes

1. **Facts are compared in order; punctuation is meaning** (`c16f949`, `23d38ca`). The instructor-text register,
   confirmations and the fact-change guard compare the whole text on its reading — the reader view in order, sentence
   punctuation kept (D50) — and a value re-attached to another clause is a changed fact; typesetting a correct value
   (prose ↔ LaTeX, - ↔ −, Δ ↔ ∆) is nothing. Closes K01, K02, K03, K10, K07, C4.17.
2. **Each review answer and overrule is bound to what it judged** (`ec9ca58`). `standingOf` takes an item-level
   `itemCurrent`: a link verdict on the passage and the objective's own text, never on the other links; an overrule
   also on the overruled item and verdict; a concern on its quoted words in their sentence (`concernStands`); spine
   concerns and meaning answers per line. Closes C2-L1, C2-L2, K04; C4.10 (instructor words need a visible character),
   C4.11 (only real list items fold their number).
3. **Obligations follow the text** (`c11fa52`, `8045c75`; `core/version_scope.mjs`). A version's carry is continuous —
   a unit entering the scope later is carried through the log, and until then `version-carry-owed` is raised and the
   approval refused (`versionScopeGaps`); a value that left its target is searched for package-wide, and with no
   successor the target is unshowable (the instructor confirms); what a retired unit owed passes to whichever unit takes
   its words, new or kept. Closes H-01, H-02, H-03.
4. **Only what the log wrote is trusted; every loss of the instructor's text is asked** (`f23c8de`). A record the log
   never wrote cannot take a unit's identity (`trustedSidecarPath`, register entries checked against the log); a
   removal of registered instructor text is asked whoever made it, in or out of a session. Closes H-04, K05.
5. **Membership by allowlist and near-duplicate, not exact match** (`211e348`, `cbcbcd2`). Paged settings pass a
   strict value grammar for every key orz-paged reads and fail closed; pins count only inside a destination the
   instructor declares; a pinned source near-duplicating another (word-shingle containment, calibrated on 77 pinned
   texts) counts once; an instructor-confirmed administrative document rests again; value forms widened (`\doteq`,
   `≅`, `\to`, split unit macros, escapes and inline elements). Closes R7-C3-01, K06, the destination lead, C3.16;
   K08, K09, K11 narrowed.

**Integration** (`7d70b94`, `b632de7`): the reader-view value net adds only values with a unit (flattened
superscripts were read as bare numbers); reviews that speak for a unit and raise the same concern ask it once; three
older tests read per-item currency and the state-machine test opens its version through `openVersionCarrying`. A
removed spine line's meaning answer is bound to its diff hunk (the approved line kept just before it): bound to
nothing, a re-run after the requirement was restored in its place could not speak (F1 + C4-01); bound to the whole
plan, an edit of an unrelated line voided an honest "changed" (the R7 judged variants).

**Totals:** requirements 221, all closed. Full suite 1083/1083 (`b632de7`). System verify ready.

## Re-test

Every round-7 finding script was re-run against `integrate/r7` (`7d70b94`; C4 again on `b632de7`), along with the main-session checks
(`workspace/studies/p11/redteam-r7/retest/`, log in `run-log.txt`).

- **Control:** R7-C3-01 HELD (`content-hidden`, blocking).
- **Confidence:** all 11 HELD (K01–K11), and every held-probe still HELD. K08 holds, but one result form is still only
  counted, not compared (`\to`); that is a detection limit.
- **Coherence:** all 4 HELD, and the held-checks hold. H-02 and H-03 now end in a refused reverify, by design. The
  re-check is shown the moved value (−92.4 kJ) and objects, and the attacker's clean re-run is refused by the
  standing rule.
- **Main session:** C2 leads 2/2 conform, C4 18/18 (was 15/18), C5 9/10 plus C5.4b (C5.4 is the known test premise), H3
  10/10, H5 11/11.
- **C1–C3 conformance (69 rules):** 66 conform. C3.16 now conforms; C3.2 and C3.12 are the known test artefacts.
  C2.11 deviates on its round-6 premise: it counts units with any current review, while currency is now per item.
  Read per item (`main/c13/c211-item.mjs`), it conforms: all 16 verdicts for the changed objective are voided,
  verdicts for the unit's other objectives stand, and the study-guide teachers owe a fresh link review (D41). The
  practice intros and answers owe `reverify`.

**No STRUCTURAL-CRITICAL finding remains open.** The remaining items are detection limits: value forms only counted
(`\to`); typesettings and spellings no reader recognises, most failing closed; and C4.10, which accepts a lone
visible character as the instructor's words (a record, not authentication).

## The loop closes (D51)

Seven rounds found 47, 37, 23, 32, 22, about 19 and 24 findings; the structural ones fell to cause-level fixes each
round, but each round's fixes opened a new, narrower attack surface (15 structural in round 6, 14 in round 7), and the
fixing cost per round outgrew the session budget. The operator closed the loop after round 7's fixes (D51: "let's
finish round 7 and close the loop"). What remains are detection limits — value forms and typesettings no reader
recognises, most failing closed — which D47 does not hold the loop open for. Further hardening is driven by evidence
from use: S1 and S2 (the instructor studies), H-a, and the labelling sample.
