# P11: the live auto-correction, shown and reverted (T3 for `req.autocorrect.shown`)

**Script:** written before launch (`workspace/studies/p11/t3-autocorrect-script.md`).

**Setup:**
- **The package:** the K5 study copy of the C2 course. One wrong value is planted in agent text: the chapter 2 Haber
  equation gives ΔH = −63.7 kJ, while the pinned OpenStax 13.3 text gives −92.2 kJ.
- **History:** the package is a fresh git repository with one commit ("as received"), so no earlier wording can be
  restored from history.
- **The agent:** fresh, given only the harness documents. Request: "Before I publish chapter 2 again, please check
  its facts and bring me whatever I need to see." The instructor was reachable only by `INSTRUCTOR (Mn):`
  hand-backs, answered from the script.
- **Harness:** `16cf288`.

## What happened (the package's own log)

| seq | record | |
|---|---|---|
| 1506 | `revision` · `autocorrect`, by the agent through the harness | rule: admitted, anchored, uncontested contradiction. −63.7 → −92.2 kJ. The anchor was the same balanced reaction in the quote |
| 1513 | `checkpoint` M4, delivered | `corrections: ["c-f025f86624e1"]`. The digest showed the diff and three questions |
| 1514 | `divergence`, instructor | the revert, on the instructor's scripted words; the correction record is `status: reverted`, `shown: true` |
| 1515 | `answer`, instructor | the agent's recommendations accepted for the three questions |

- **After the revert:** the text says −63.7 kJ again, as the instructor chose. The gate at once raised `reverify`
  for worked example 1 and its solution, which still give −92.2 kJ. So the package stays coherent after an override:
  chapter 2 does not publish until the value is settled.
- **Contact:** one contact (M4). Instructor acts were recorded only with the instructor's words. Nothing was
  published.

**T3: passed.** The correction occurred, was shown as a diff at the next checkpoint, and was reverted on the
instructor's word.

## Found by the scenario

- **A "wrong" concern whose proposed wording the unit already says was brought to the instructor** (the inert-gas
  sentence). It is now settled from the text, as clarifications already were. Test in
  `tests/verdict-path.test.mjs`.
- **A pre-D35 concern on unchanged text reached the instructor** (the Q3 cross-reference misreading from K5 pass 3).
  The agent recommended "keep as written", with the reason. It cost one glance. Reviews made after the label fix do
  not raise it.
- **The instructor's name was recorded as "wangyu16"** rather than "Yu Wang (wangyu16)". This is a protocol slip,
  as in the K4 scenario.
