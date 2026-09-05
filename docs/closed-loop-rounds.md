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
| B-M8 the attested-review ledger can be laundered by re-initializing | MEDIUM | fixed: `initialize` over existing index history is a hard failure; `index_components --restore` re-creates a clone's ledger from git (refuses an existing ledger or an uncommitted index) and the evaluation names the action; probe M8 |
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
decision recorded in the study ledger); carrier fingerprints normalized beyond the builders' UUID.

## Round 3 — 2026-09-05: verify the fixes; attack the unaudited surface

Two adversaries against HEAD `8455cf1`: **V** re-attacked every round-2 fix and judged every dismissal;
**U** attacked the assurance kernel, source preparation, carriers and visual review, the spine and term
registry, the escalation queue, CLI argument handling and idempotence. Meanwhile: W15 closed (`spineRefs`), the
H8 migration tolerance (legacy raw-byte hashes), and the ledger restore for clones.

### V — the round-2 fixes, re-attacked (3 HIGH, 6 MEDIUM, 6 LOW)

| finding | severity | outcome |
|---|---|---|
| V-1 a restated objective declared `type: fact` counted as coverage | HIGH | fixed: a teaching claim is never a block in the deliverable's own objectives list, whatever its type, and must carry the objective's bracketed vocabulary (declared termRef or in prose); probe H1 extended. **A5 sibling dismissed:** relabeling an objective while leaving its key-term bracket is the instructor declaring the same terms still operationalize it; `spine-relabeled` already forces that review |
| V-2 a wrong answer stating the value twice ("5 °C, i.e. 278 K") | HIGH | fixed: inside an answer body the FIRST value per dimension is the answer; `ºC`/`˚C`/"degrees celsius" recognized; the `**Answer:** …` line convention is an answer body too; probe H2/H3 |
| V-3 a key-fact review contradicting the package (substring match) | HIGH | fixed: token-level quantity+unit match, every content word for short facts, `usedIn` restricted to deliverables, identical check notes refused, future dates refused; probe H5 |
| V-4 quotations over 600 chars or across paragraphs rewritten | MEDIUM | fixed: cap 2000; a repeated opening mark across a paragraph break is a continuation; probe M1 |
| V-5 `revision:propagate` alias passes no `--inputs` | MEDIUM | fixed: defaults to the package's sibling `inputs/` |
| V-6 an adapted source demoted to `supplemental` is never scanned | MEDIUM | fixed: every `adaptation`/`excerpt` source must be in the corpus; the evaluation names unscanned sources |
| V-7 CONTROL undefined for a chapter, evaluation silent | MEDIUM | fixed: `coverage.chaptersUnchecked` reported in the gate, the evaluation and the release receipt |
| V-8 one ellipsis buys deletions anywhere in a quotation | MEDIUM | fixed: gaps consumed only at the marked position; probe M2 |
| V-9 probe #4's held-span disjunct was per-file (vacuous) | MEDIUM | fixed: heading survivors judged by position and named in the receipt |
| V-L H6 probe asserts the queue kind, not the detector; `--to` accepts newlines; setext headings | LOW | fixed: `--to` guard, setext guard; probe left on the queue kind (the detector is in `detectorKinds`) |
| V-L a renamed package can re-initialize | LOW | **dismissed:** the ledger is path-keyed by design; `--restore` and the evaluation's ledger action cover it |
| V-L paraphrased misconceptions | LOW | **dismissed:** a no-LLM detector matches the map's sentence; paraphrase is the blind critic's job |

### U — the unaudited surface (5 HIGH, 12 MEDIUM, 9 LOW)

| finding | severity | outcome |
|---|---|---|
| U-H1 CC-BY-NC excerpt/asset reaches a CC-BY pack | HIGH | fixed: the license matrix applies to every use but `reference`; references are warned; probe H1 |
| U-H2 nine forms of hot-linked media ship | HIGH | fixed: every resource attribute on every media/embedding tag, CSS `url()`, protocol-relative, reference-style images; probe H2 |
| U-H3 media outside `assets/` needs no provenance | HIGH | fixed: only `.md`/`.json` under a deliverable folder; probe H3 |
| U-H4 non-Latin sources cannot be prepared | HIGH | fixed: `\p{L}\p{N}` word tokens everywhere (gate, preparation, verbatim, quotations); probe H4 |
| U-H5 pack not idempotent (its own gate run left a queue) | HIGH | fixed: `--no-queue` for release runs; probe H5 |
| U-M1 placeholder / AI-vendor identities pass | MEDIUM | fixed: one `identityProblem` denylist for authors and reviewers; probe M1 |
| U-M2 license needle matched inside comments / negations | MEDIUM | fixed: visible text only; a contradiction beside the needle blocks; sign-in pages warned; probe M2/M3 |
| U-M3 cross-origin redirect clears silently | MEDIUM | fixed: warned in the kernel and named in the evaluation; probe M2/M3 |
| U-M4 a network capture receipt can be minted offline | MEDIUM | **structural, disclosed:** the evaluation prints capture mode, operator type and redirect per source as self-reported |
| U-M5 HTML-referenced assets not bound into the visual attestation | MEDIUM | fixed: every resource attribute contributes asset digests |
| U-M6 homographs and alias collisions merge silently | MEDIUM | fixed: gloss conflicts (article-insensitive) and shared aliases are `term-conflict` findings; probe M6 |
| U-M7 prerequisite cycles never reported | MEDIUM | fixed: `spineCycles` → blocking `spine-cycle`; probe M7 |
| U-M8 quoted alt text refused as a quotation | MEDIUM | fixed: HTML tags are literals; probe M8 |
| U-M9 nested deliverables unattestable | MEDIUM | fixed: one recursive walker |
| U-M10 attested theme dropped at pack | MEDIUM | fixed: the receipt and attestation carry the theme; pack rebuilds under it. **Unknown theme silently ignored — dismissed:** the builders own theme validation |
| U-M11 in-package `--json`/`--report` become components | MEDIUM | fixed: refused; probe M11 |
| U-M12 path-keyed ledger through a symlinked parent | MEDIUM | fixed: real paths; probe M12 |
| U-L1 `prepare:source` not idempotent | LOW | fixed: unchanged bytes keep their timestamp |
| U-L2 batch severity order-dependent | LOW | fixed: worst member; probe L2 |
| U-L3 burden 0 with an empty artifact set | LOW | **dismissed:** the frozen schema types the ratio as a finite number; `artifactCount: 0` is the signal |
| U-L4 notice rewordings and soft hyphens | LOW | fixed; probe L4 |
| U-L5 non-UTF-8 deliverable ships U+FFFD | LOW | fixed: layout error; probe L5 |
| U-L6 bad argument types crash late | LOW | fixed: refused up front |
| U-L7 kernel media list incomplete | LOW | fixed |
| U-L8 Wikipedia permalinks refused | LOW | fixed: `title=` honored |
| U-L9 NFC/NFD labels mint two terms | LOW | fixed; probe L9 |

**Verification:** full offline suite after the last edit: 597 tests, all passing; `system:verify` ready.

**Verification:** full offline suite after the last edit (see the commit), `system:verify` ready.

## Round 4 — 2026-09-05: the round-3 fixes re-attacked (3 HIGH, 3 MEDIUM, 6 LOW; 3 dismissals disputed)

| finding | severity | outcome |
|---|---|---|
| R4-1 a restated objective under `## Goals` or in a slide outline counts as coverage | HIGH | fixed: a block whose text contains an objective's own statement never teaches it, under any heading, whatever its declared type; probe R4-1 |
| R4-2 SVG `<image href>`, `<use>`, `<link>`, `<script>`, `{{youtube}}` ship remote resources | HIGH | fixed: every resource attribute on those tags, orz embedding directives, any `{{…}}` carrying a URL; fenced examples excluded; `data:` images refused as embedded media; probe R4-2 |
| R4-3 "0 °C is the reference… therefore 5 °C" packed; "Not 5 °C … is 0 °C" was refused | HIGH | fixed: an answer with two different values of one dimension is an `ambiguous-answer` review item — never picked first or last, never a guessed contradiction; probe R4-3 |
| R4-4 relabel of an UNBRACKETED objective accepted with no attestation (dismissal disputed) | MEDIUM | fixed: `index:semantic` refuses to accept a spine relabel under declared claims without `--acknowledge-relabel <ids>`; the gate's blocking item names the flag; probe R4-5. The A5 dismissal is withdrawn in favour of this |
| R4-5 a negated key fact ("…is NOT 0 °C") passed | MEDIUM | fixed: a negated fact needs a sentence carrying the same negation beside the same token; probe R4-6 |
| R4-6 two worked energy answers compared as a temperature term | MEDIUM | fixed: a scan-found claim's subject carries only the dimensions declared claims give the term; probe R4-4 |
| R4-L fenced `<img>` counted as shipped media | LOW | fixed (scan prose only) |
| R4-L directory mtimes in the zip | LOW | fixed (`zip -D`) |
| R4-L `data:` images refused as broken links | LOW | fixed (named as embedded media) |
| R4-L a genuine note containing "placeholder" refused | LOW | fixed (notes are checked for template tokens only) |
| R4-L self-referential `[prereq:]` vanished | LOW | fixed: reported as a cycle of one from the record (no edge is minted — the verified-or-dropped contract holds) |
| R4-L "AI Reviewer", "Grok", "Sonnet 4.5", "ClaudeCode" pass the identity check | LOW | fixed (denylist widened). **Structural, disclosed:** a denylist cannot prove a human; the accountable author's `accountabilityConfirmedByUser` and the visual reviewer's `type: human` remain self-reports named in the evaluation |
| U-M2 "visible text" overclaimed (`display:none`, `hidden`, `<noscript>`, `<template>`) | LOW | fixed: those are stripped before the needle search; probe R4-7 |
| U-M10 unknown theme silently ignored | LOW | **open by choice:** the orz builders own theme validation; the receipt and attestation record the theme string |

**Two structural facts the adversaries keep returning to** (owner's call, not a fix): the agent that authors
a package also fills the revision review and the key-fact review, and the gate can only bind those to the
surface they name; and `index:semantic` accepts claim-level movement with no attestation (a relabel now
needs an explicit acknowledgment; other movement is reviewed through the revision loop before release).

**Verification:** full offline suite after the last edit: 604 tests, all passing; `system:verify` ready.