# Closed-loop hardening rounds

The loop: state the requirements as claims (`system/CLAIMS.json`, each bound to implementation and tests),
build, attack independently, turn every finding into a probe or a written dismissal, fix the class, verify the
whole suite, record the round. A round ends when an adversary who wants the system wrong cannot show that it is.

## Round 1 — 2026-09-05: wiring the designed mechanisms

**Found (hands-on audit of the product as wired):** the blind-bundle assembler had no caller anywhere; the
propagation engine was reachable only from the study harness (usage test 11 passed vacuously); a
committed-but-stale semantic index was invisible to both gates; `overrideId` had no producer; the label
matcher existed four times; overrides and revision review were scripts nobody was told to run; the system
claim register stopped before the semantic index.

**Changed:** `review:blind-bundle` + digest-bound key-fact gate; `revision:propagate` with receipt;
`stale-index` freshness gate; `overrideIdOf` stamped by M2; `labelMatcher`/`findLabelOccurrences` in
`terms.mjs`; PROCEDURE Stage 5b (the revision loop); nine claims registered; `tests/wiring.test.mjs`.
Then the G22 contract change: inline `[anchor: slug]` identity (reorder = RECHECK; `study_pairs` 11/12 → 12/12).

**Dismissed with reason:** the G22d prose-support gate (re-derive type/termRefs from the block) — the
structural scan cannot tell an answer key from a fact and an author may declare a term the block is about
without naming it; it fired 4× on the clean reference package. Replaced by the precise rule: a positional
declaration on a slug-anchored item is refused.

## Round 2 — 2026-09-05: two independent adversaries

Adversary A audited the round-1 commits (16 findings: 5 HIGH, 8 MEDIUM, 3 LOW); adversary B audited the
whole design end to end with a release-ready baseline and single-edit attacks (8 HIGH, 10 MEDIUM, 7 LOW).
Every finding below ends in a probe (`tests/audit-round-2.test.mjs` unless named) or a dismissal.

| finding | severity | outcome |
|---|---|---|
| B-H1 a restated objective counts as coverage | HIGH | fixed: `type: objective` claims never count; probe H1 |
| B-H2 a distractor value in a question hides a wrong answer | HIGH | fixed: the answer tab is the assertion; probe H2/H3 |
| B-H3 declared type / two termRefs opt an answer out | HIGH | fixed: answer tabs are assertive whatever their type; declared termRefs are each a subject (scan-found keep the one-term rule); probe H2/H3 |
| B-H4 human-attested primary switches off both source scans | HIGH | fixed: scans run over available automatic texts; `pack` refuses without `--accept-attested-sources`; evaluation names it |
| B-H5 template placeholders pass the key-fact gate | HIGH | fixed: placeholder scan on every identity/note field; key facts must be locatable in their usedIn files (≥6 content words rule); probe H5 |
| B-H6 reordering `## Objectives` re-parents declared claims silently | HIGH | fixed: `spine-relabeled` (blocking) compares stored vs fresh spine per id; probe H6 |
| B-H7 JSON front matter renders as visible text | HIGH | fixed: format-contract failure; contract says ship the sidecar; probe H7 |
| B-H8 a null edit is free only in the semantic layer | HIGH | fixed for the file layer: component hashes and key-fact bindings over whitespace-normalized text; probe H8. **Open by choice:** the visual-review carrier fingerprint still moves on any carrier rebuild — a human attestation binds rendering, and rendering is bytes |
| B-M1 single/typographic/unattributed quotes | MEDIUM | fixed: ‘…’, „…“, «…», ‹…›, »…« pairs, hard-wrapped spans; probe M1. Unattributed blockquotes remain callouts by design (an admonition is not a quotation) |
| B-M2 silent deletions inside a quotation | MEDIUM | fixed: the gap budget needs a marked elision; probe M2 |
| B-M3 duplicate heading slugs rebind a declaration | MEDIUM | fixed: ordinals continue across a repeat, ambiguous blocks are never bound by position, targeted declarations refused; probe M3 |
| B-M4 forged / stranded overrides | MEDIUM | fixed: recorder refuses unknown ids (`--force` to override); gate reports `dangling-override`; probe M4 |
| B-M5 gate prefix vs parser exact headings | MEDIUM | fixed: gate keys concept-map sections through the same parser; near-miss named; probe M5 |
| B-M6 / A-4 rename reaches only claim blocks | HIGH/MEDIUM | fixed: prose tier; every untouched occurrence named (`protected`); headings protected by design; probes #4, P.1 |
| B-M7 copied text in a code fence evades the verbatim scan | MEDIUM | fixed: fence bodies are scanned; probe M7 |
| B-M8 the attested-review ledger can be laundered by re-initializing | MEDIUM | fixed: `initialize` over existing index history is a hard failure. **Open:** a cloned package has no ledger; a restore command is future work |
| B-M9 contract vs gate mismatches | MEDIUM | fixed: contract states outline/rubric requirements, the "gate will ask" sentence removed, declared/scan-found counts reported, W17 scoped |
| B-M10 misconceptions have no consumer | MEDIUM | fixed: `misconception-asserted` producer (paragraph-level, correction-aware, never the map or a misconceptions section); probe M10 |
| B-L1 archive digest not reproducible | LOW | fixed for the zip (`-X`, fixed mtimes). **Open:** the carrier receipt hash still carries build UUIDs; `packageTreeHash` is the stable identity |
| B-L2 pack commits the queue into the package | LOW | fixed: `--no-commit` |
| B-L3 component index carries a clock | LOW | fixed: no timestamp in the index |
| B-L4 documented but no-caller surface | LOW | `overridesByBasis` wired into the evaluation. **Open by choice:** `needsAsk`/`recordDeclined`, term proposals, REGENERATE/ANNOTATE remain library-level; recorded here rather than removed |
| B-L5 arithmetic never said to be unverified | LOW | fixed: evaluation states it |
| B-L6 OVERRIDES.json and REVIEW_QUEUE.json ship | LOW | queue no longer ships. **Dismissed** for OVERRIDES.json: it is the package's provenance record and the accountable author is already named in the package |
| B-L7 in-flight prose-support gate over-fires | LOW | dismissed/replaced in round 1 (see above) |
| A-1 a deleted index artifact reads as fresh | HIGH | fixed: a missing artifact beside a present one is stale; release blocks on incompleteness; probe #1 |
| A-2 hard-wrapped / non-ASCII quotation marks rewritten | HIGH | fixed with B-M1 |
| A-3 rename inside a longer label of another term | HIGH | fixed: `maskLongerLabels`; probe #3 |
| A-5 commit failure strands edits without a receipt | HIGH | fixed: receipt before commit, failure recorded; probe #5 |
| A-6 apply executes a fresh plan, not the approved one | MEDIUM | fixed: plan hash-bound to HEAD and to the mechanical tier; probe #6 |
| A-7 the dirty-tree guard is vacuous without git | MEDIUM | fixed: refused; probe #7 |
| A-8 apply writes `.gitignore` | MEDIUM | fixed: `commitOutput({ensure:false})`; probe #8 |
| A-9 record:override leaves a stale index and the doc says "stops asking" | MEDIUM | fixed: recorder prints the next step; PROCEDURE reworded |
| A-10 a scratch file hides a committed strand | MEDIUM | fixed: committed is judged over index/spine/deliverable paths; probe #10 |
| A-11 "independence is verified" over-claims | MEDIUM | fixed: claim and PROCEDURE now say bound, not observed |
| A-12 symlinks invisible everywhere | MEDIUM | fixed: refused by the gate, named in the bundle; probe #12 |
| A-13 locale-dependent digest | MEDIUM | fixed: code-point sort |
| A-14 ASCII-only word boundaries | LOW | fixed: `\p{L}\p{N}`; probe #12–14 |
| A-15 silent when `--inputs` absent / `--to` unregistered | LOW | fixed: warnings |
| A-16a assets outside the bundle digest | LOW | fixed: non-markdown deliverable files carried by sha256 |
| A-16b CRLF checkout reads as stale | LOW | fixed; probe #1/#16b |
| A-16c plan carries a clock | LOW | fixed: the plan is clock-free; **dismissed** for the receipt: a receipt is an event record and `appliedAt` is its date |
| A-16d nested key order in `overrideIdOf` | LOW | fixed: recursive canonicalization |

**Stays open by choice (owner's call):** the authoring-time coverage block on un-indexed packages (an operator
decision recorded in the study ledger); a `--restore` path for a cloned package's coherence ledger; carrier
fingerprints normalized beyond the builders' UUID.

**Verification:** full offline suite after the last edit (see the commit), `system:verify` ready.
