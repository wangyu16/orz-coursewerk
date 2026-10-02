# P11 wiring sweep: every finding kind, on the real course

`req.modules.wiring-report` · `req.versions.carry` · `req.core.reverify-obligation`

**Method.** One planted fault per declared finding kind, each on a fresh copy of the K5 study copy of the C2 course
(public profile, published quality). The real gate runs, and for each kind the sweep records:
- whether it was produced;
- its class and route against its declaration;
- whether it reached its consumer: blocking, the digest, an interrupt, or the agent's list.

Everything is offline: ms8 verifier answers are replayed through the real verdict path. The script is
`workspace/studies/p11/wiring-sweep.mjs`, with results in `wiring-sweep.json` and `.md`. The run before the fixes
is kept as `wiring-sweep-before-fixes.*`.

## Results

| | kinds swept | produced | consumer reached | misrouted |
|---|---|---|---|---|
| before the fixes (harness `eccdc13`) | 71 | 69 | 69 | 0 |
| after the fixes | 71 | **70** | **70** | 0 |

- **The kind still not produced** is `module-failed`. Before the fixes, the only way a real package made a module
  fail was a stub unit sidecar that crashed ms7 and ms8, and that crash is now fixed. The kind remains covered at
  T1 by a deliberately failing module.
- **Not attempted:** 5 runner kinds that need a faulty harness module or a concurrent writer.

## Found by the sweep, and fixed

| # | gap | fix |
|---|---|---|
| 1 | `spine.mjs version` logged `carried: []` and carried nothing (D15 was not wired), and recorded no instructor words | `openVersionCarrying`: the scoped chapter's units are carried (each `carried-unverified` until re-verified), and `--words` is required and recorded |
| 2 | "Haber–Bosch" and "Haber-Bosch" were different names, which broke anchoring | dashes inside names fold, both in name extraction and in name parts |
| 3 | ms7 could not read the package's LaTeX quantities: a disagreement in `$\Delta H = …\ \text{kJ}$` was missed | LaTeX folded before the scanners; the clean courses raise nothing |
| 5 | an answer whose question went from "raised" to "lowered" stayed current | a direction-sensitive `question:` dependency target (factHash, and so evidence, is unchanged). Stamps are upgraded in place at `units begin` and at indexing, never over a target that just changed. A rephrase that keeps the direction stays silent |
| 6 | an unclosed `$$` swallowed 17 lines into one equation, and 9 units lost their evidence, with ms3 silent | ms3 `math-delimiters` defect, naming the line |
| 7 | a malformed unit sidecar crashed ms7 and ms8 | skipped; the index reports it |
| 8 | the gate CLI only counted agent-routed questions | `forYou` lists them |

**Also found while checking #8.** An applied clarification whose added words touch no fact token stayed
`clarification-owed`. A clarification is now settled once the unit's text contains the proposed wording.

**Earlier in the same check** (`eccdc13`): the committed decision log was read with a 1 MB buffer, so a 1.2 MB log
made the package unpublishable.

## Open, for the operator

- **#2, a wrong constant in a display equation is a question, not a defect.** A display equation holds the value
  but none of the claim's other words, so a quote cannot anchor it to the claim. That is safe by design: an
  unanchored contradiction never auto-corrects.
- **#4, `ambiguous-answer`** fires only on a one-line `**Answer:**`, not on the package's tabbed answers with an
  explanation. Whether to extend it is a design choice.
