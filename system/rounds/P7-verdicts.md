# Adversarial round and live run — P7 semi-mechanical verdict path

Requirements under attack (tier T4, D22): `req.verdict.semi-mechanical` and `req.autocorrect.guard`. The live run on
the C2 course is the T2 evidence for `req.dispatch.blind` and `req.retrieval.claim-only`. Every bypass became a probe
in `tests/verdict-redteam.test.mjs`; the admission cases are in `tests/verdict-path.test.mjs`.

**Threat model (D23, unchanged).** Harness code and modules are trusted. The package, its records and the verifier's
answer are untrusted, and the agent may write package files directly. A bypass is an end state where the gate (MS1,
MS8, core obligations) passes while a unit states a fact its admitted evidence does not support, or while a correct
value was changed to a wrong one.

## Round P7-1 — red-team agent, ~25 probes, all offline (replay verifier)

The round found 21 bypasses with 5 root causes. Several ran on the real C2 corpus with no planted pin.

**R1 — a bag of tokens, not a fact.**
- The bypasses: B2, B3 (a year beside another person), B7, B8, B9 (the D27 "only" rule), B10 (namesake), B14 and B20.
- Fix: every required token must be carried by a quote window (one pinned text, ≤ 800 characters) that is itself about the claim.
- Each value must sit beside the same name the claim gives it (its nearest preceding name).
- Values must appear in the claim's order within a window.
- Names must match every capitalized part as a whole word.
- A superlative must sit in a quoted sentence that holds the claim's words on both sides of it.
- D27's "negating the alternatives counts as *only*" was withdrawn; only strict synonyms remain.
- A contradiction is a defect only if it is anchored by another of the claim's tokens, names no one the claim does not, and shares three content words. Otherwise it is a question.

**R2 — evidence outlived meaning-changing edits** (B1, B4, B5, B6).
- Cause: the fact hash is order-blind, ignores units inside LaTeX and ignores direction words.
- Fix: quote evidence now also binds the exact checkable claim sentences (`claimsHash`), so any edit to a claim sentence needs re-verification. Instructor confirmations stay bound to the fact hash, so a rephrase stays silent (D19-C).

**R3 — extraction blind spots** (B11, B15, B19).
- Fix: NFKC normalization and stripped format characters; MS3 now raises `invisible-character`.
- An en dash before a digit is a minus sign; scientific notation is parsed.
- The classifier tests its patterns on the LaTeX-folded text, so `-75\ \text{kJ mol}^{-1}` in an equation or in prose is a semi-mechanical fact.

**R4 — records were trusted as written** (B12, B13, B16, B17, B18, B21, p22).
- MS8 now requires every verification record to match a logged dispatch: unit, bundle hash and answer hash. A logged dispatch whose record is missing is a defect.
- Evidence must equal its dispatch's re-derived admission, and that dispatch must have checked the unit's current claims.
- Correction evidence must match an applied, logged correction.
- `readmitRecorded` considers logged dispatches only.
- The core recomputes each unit's judgment from its text.
- Instructor confirmations and divergences count only when the log holds the instructor's record, bound to the unit's fact hash. A confirmation is refused while a verification contradicts the text.
- The instructor-authorship check also reads the log.
- Two "sources" must differ in text hash and canonical URL.
- A correction record must match its logged autocorrect record, and diffs are built from the record's texts at display time.
- Every pin is logged, and MS1 refuses quotes from an unlogged pin.

**Claims with no checkable token** (B7, B20: misconception bullets and flowcharts) are not semi-mechanical facts. They no longer carry an evidence obligation, and the knowledge path covers them (D28). A conceptual reversal is therefore a Level-2 matter, as D5 always said.

**Probes re-run after the fixes:** every bypass holds except two, which are recorded as limits:
- **A year spelled in words** ("nineteen hundred and one") is not read as a year.
- **An agent that calls the harness's pin function with fabricated text** (B21 variant) gets a logged pin. This is the same class as forging a log entry through the harness's own API: deliberate fraud by the agent, outside what the harness can prove (fit note, A3).

## Live run on C2 (T2) — `req.dispatch.blind`, `req.retrieval.claim-only`

**Destinations.** Declared in the instructor's words ("go to wikipedia and openstax chemistry to check chemistry facts"):
- `en.wikipedia.org`
- `openstax.org/books/chemistry-2e`
- context "chemistry"

**Pins.**
- Five OpenStax Chemistry 2e pages (13.1–13.4, 16.4).
- Wikipedia pages found by claim-only searches: 66 pinned, many off-topic. Off-topic pins cost nothing in correctness, and the package's `REFERENCE_RECORD` lists only cited references.

**Verifier.** Headless `claude -p` with a replacement system prompt, no tools, no setting sources, no MCP and no session, in an empty temporary directory. A probe confirmed it saw no CLAUDE.md, memory, files or tools (D26).

**Results.** Three passes, about $0.92 each, about 10 s per unit.

| pass | rules | admitted | note |
|---|---|---|---|
| 1 | first build | 6 / 42 | passage ranking crowded by generic words |
| 2 | IDF ranking, per-source cap | +2 | "only" was the commonest refusal |
| — | D27 rule, re-admitted from records | 13 / 42 | no new dispatch: admission is deterministic |
| 3 | after round P7-1 (strict) | 2 / 37 | 11 claims read as exercise data; most refusals: sources state the fact without "only" |

Gate on the live package after pass 3: no defects, 35 evidence obligations, 1 short guide entry.

**Findings for the study.**
1. The harness's strictness, not the verifier, sets the admission rate.
2. "only" in conceptual sentences is the largest single source of evidence burden.
3. −92 kJ mol⁻¹, which the package says comes "from the source", is stated in no pinned source.
4. The sources disagree on the year of the law of mass action (1864 vs 1865).
