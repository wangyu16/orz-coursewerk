# Coursewerk — walkthrough

*A working record of the 2026-07-17 end-to-end review: what Coursewerk is, how it runs, what each
module does, and — claim by claim — what actually makes CONTROL / TRUST / RELIABILITY real. Findings
are numbered `W#` and carry their status. Nothing here is aspirational: every claim in this document
is either verified against the code or marked as unverified.*

---

## 1. What Coursewerk is

**A thin OUTER harness over a capable, general-purpose agent harness** (Claude Code, Codex, Copilot,
…) — **not** over a bare LLM. The inner agent already self-corrects within a task and is strong. It is
optimized for *general* work; it is not optimized for **lasting, complex, domain-specific** work like
teaching-material authoring, and it has **no whole-package view across sessions**.

Coursewerk supplies what the inner agent structurally cannot:

| | |
|---|---|
| **A spine** | the instructor's authored concept map + assessment guide — what is taught, to what depth, how it is assessed |
| **Contracts** | exact formats the agent must hit (`format-contracts/deliverables.md`) |
| **A procedure** | the staged workflow (`PROCEDURE.md`) with human gates |
| **A deterministic gate** | `check_oer.mjs` — objective, repeatable, no LLM |
| **A whole-package index** | claim-level nodes + five layered fingerprints (the semantic index) |
| **An escalation queue** | detection becomes recovery only if it reaches the human |

**The division of labour is the product's thesis:** the human owns pedagogical intent (the spine); the
harness owns faithful, consistent, provenance-clean production of everything derived from it.

**The goal is NOT error-free.** It is **recovery**: bound the failure, detect it, and escalate it to the
one authority that can adjudicate. A mechanism that promises perfection is lying; one that reliably
surfaces suspects is useful.

---

## 2. The typical workflow

`PROCEDURE.md` is what the authoring agent actually executes. ⏸ = human gate.

```
Stage 0  Intended use + foundation                                  ⏸
Stage 1  Scope + manifest                                           ⏸
Stage 2  Course concept map        concepts/course.md               ⏸  <- THE SPINE
Stage 3  Per-chapter build (loop)  concepts/ study-guide/ slides/
                                   assessment-support/ practice/
Stage 4  Assemble                                                   ⏸
Stage 5  QA gate (mandatory)       check_oer.mjs -> criticalTotal 0
Stage 6  Honest evaluation report
Stage 7  Pack + deliver
```

The concept map is **co-created**: the instructor supplies raw, messy intent (a syllabus dump, a topic
list, last year's outline); the agent **standardizes** it into the canonical format; the instructor
**reviews and corrects**. That review is where the instructor's authority actually lands — which is why
the format is optimized for a human to eyeball and fix, not for machine convenience.

**The revision loop** (the part a general-purpose agent cannot do at all) is the semantic index:

```
index:semantic   ->  metadata/{SPINE,TERMS,CLAIMS}.json      the "BEFORE" (accept step)
   ...author edits a deliverable...
check_oer        ->  fresh compute vs stored  ->  what moved, what it obliges
                 ->  metadata/REVIEW_QUEUE.json               the human's worklist
```

---

## 3. Architecture

**Deterministic core, LLM at the edges.** Nothing in the index path calls a model, a clock, or the
network. Same package → byte-identical output, so a flag a human acted on is reproducible from git
months later. The LLM lives only in *generation* and in the (separate) obedience-decoupled reviewer.

**Data flow:**

```
concepts/*.md ──> M13 spine ─────> concept./objective./misconception./chapter. nodes
              └─> M1  terms ─────> term.* registry  (the controlled vocabulary)
                                        │
deliverables ──> M12 declarations ──> M2 claims ──> claim.* nodes + 5 fingerprints (M3)
                                        │
                                 ┌──────┴───────┐
                            M5 impact       M6 consistency      M4 classify (verb)
                            M9 propagate    M7 overrides        M8 immutable
                                 └──────┬───────┘
                                   M10 queue ──> REVIEW_QUEUE.json ──> the instructor
                                        ▲
                                   M11 gate (check_oer.mjs) — the wire
                                   M14 writer (index:semantic) — the "before"
```

### Module map

| | Module | Owns |
|---|---|---|
| M1 | `terms.mjs` | the controlled vocabulary; ids **minted once**, never re-minted on rename |
| M2 | `claims.mjs` | claim extraction (declared-first, scan as backstop); **produces `scope`, `text`, `offset`** |
| M3 | `fingerprint.mjs` | the five layers: `format` `label` `content` `spine` `provenance` |
| M4 | `classify.mjs` | fingerprint delta → one of 7 verbs |
| M5 | `coherence.mjs` | claim-level reachability + **`silentRisk`** |
| M6 | `consistency.mjs` | cross-artifact agreement (value disagreement, definition drift) |
| M7 | `overrides.mjs` | authorized divergence — ask-once, never re-nag |
| M8 | `immutable.mjs` | quotes/citations/source spans — the no-go zone for automation |
| M9 | `propagate.mjs` | two-tier propagation; the first module that **acts** |
| M10 | `escalation.mjs` | the queue; **burden is measured, not assumed** |
| M11 | `check_oer.mjs` | the gate — the wire that makes the rest real |
| M12 | `contract.mjs` | the declaration grammar (one parser, one home) |
| M13 | `spine.mjs` | mints the spine namespace |
| M14 | `semantic_index.mjs` | persists the "before"; the accept step |
| — | `units.mjs` | one unit table, three projections |

### Why the modular design matters (operator, 2026-07-17)

Not user-facing, and easy to undersell as "tidy code". It is neither. **The modularity is what made this
system's defects findable at all** — and, at 15 modules and ~5,000 lines, it is what makes the thing
maintainable by someone who did not write it.

Two properties do the work:
1. **One module, one owner, one question.** `units.mjs` answers *what strings are units*; `spine.mjs` answers
   *what nodes exist*; `escalation.mjs` answers *what is the human asked*. A module that answers one question
   can be reviewed, mutation-tested, and replaced on its own.
2. **A written contract at every edge** (`docs/semantic-index-interfaces.md`). The contract is the seam, and
   **the seam is where the bugs were.**

**Every serious defect found on 2026-07-17 lived in a seam, not inside a module.** Each module was correct and
well-tested; what failed was the space between them, or between the code and the document driving it:

| Defect | Seam |
|---|---|
| `derivedFrom` had no producer | schema ↔ consumer |
| the spine namespace had no producer | §1 ↔ six consumers |
| `REVIEW_QUEUE.json` had no producer | design ↔ code |
| the unit table drifted three ways | M2 ↔ M3 ↔ M6 |
| the term id was an identity key derived from the change signal | M1 ↔ M2 |
| the index never ran (W1) | PROCEDURE ↔ everything |
| the procedure contradicted the contract (W2) | doc ↔ doc |

A monolith would have absorbed every one of these into "that's just how it works," because there would be no
edge at which to ask *"who produces this?"* The modular design did not prevent the defects — **it made them
askable**, which is why four freeze-time checks (§5c–§5f) could be written down as mechanical questions about
the interfaces file. The corollary for maintenance: **when adding capability, add a module behind the existing
contract, and state its edge.** A change that needs no contract edit is cheap; one that needs a contract edit is
exactly the change that deserves the scrutiny.

### The five fingerprints — the whole design in one table

A change is classified by **which layer moved**, never by bytes. This is what makes a null edit cost
nothing and a real edit cost exactly what it should.

| Layer | Hashes | Moves on | Does NOT move on |
|---|---|---|---|
| `format` | the **wording**, blind to whitespace/markup | rephrase | whitespace, reflow |
| `label` | `termId` + `preferredLabel` | **rename** | value change |
| `content` | normalized semantic core; modality/negation/quantifiers **preserved** | value change, `may`→`does` | rephrase, reflow |
| `spine` | sorted `spineRefs` | re-parenting | wording |
| `provenance` | sorted `sourceRefs` + override id | source change, override | wording |

**A pure whitespace edit moves NO layer at all → zero flags.** Verified on real bytes.

---

## 3b. The three claims — what each MEANS, and what makes it real

### CONTROL — the instructor decides what is taught
**Means:** the instructor stays on the high ground: *what* to teach, *to what depth*, *how to assess*. That
decision is the **spine** (concept map + assessment guide). Everything student-facing is derived FROM it.

**Mechanism (all live):** the spine is authored, not inferred (the agent may restructure what the instructor
*said*, never add a node they didn't) · M13 mints the namespace · M1 makes `## Key terms` the vocabulary
authority, so a claim resolves through the instructor's words · the gate rejects dangling references
(a typo'd `[concept.x.5]` is a link that *looks* authorized) · **coverage** measures whether the package
delivers the spine, and flags an objective nothing teaches (W12).

**Situations:**
| Situation | What Coursewerk does |
|---|---|
| Agent quietly drops an objective | **flagged** `missing-coverage`, quoting the instructor's own words |
| Objective taught but undeclared | **measured** as uncovered, **not flagged** — coverage is a FLOOR |
| Agent invents a concept the instructor never stated | forbidden by contract at authoring; nothing detects it after the fact — **open** |
| Instructor renames a term | ids hold, `RENAME` fires, the migration works |
| A claim hangs off nothing | `orphan-claim` (declared claims only) |

**Honest limit:** coverage is **unmeasurable without traceability**. Only declared claims carry `spineRefs`.

### TRUST — catch errors in content, *including errors in the source*
**Means:** the goal is **NOT error-free — it is RECOVERY**: high-recall detection of suspect claims plus
**escalation** to the human authority, who adjudicates source-vs-AI. The design's two facts: the model's own
knowledge is a strong ground-truth channel (it aces exams), **and** RL trains obedience, so a model
*reproduces source errors it internally knows are wrong*. The knowledge is present but **suppressed**.

**The core idea:** separate **obedience** from **skepticism**. Generation stays obedient (fidelity to the
instructor's plan and the source). Verification is a **separate, obedience-decoupled role** with an explicit
licence to disagree. Put the trained obedience where it helps and strip it out where it hurts.

| Layer | Status |
|---|---|
| 1 · deterministic domain checks (recompute, units, ranges) | partial |
| **2 · obedience-decoupled expert reviewer** — "the top method" | **ABSENT (W18)** |
| **3 · internal cross-artifact consistency (M6)** | built + tested, **wired 2026-07-17 (W19)** |
| 4 · cross-source corroboration | absent |
| 5 · escalation queue | ✅ live; burden measured |

**Reviewer scope, or CONTROL breaks:** skeptical about **FACTS**, obedient about **PEDAGOGY**. It may
challenge the source on scientific correctness; it must **never** override the instructor's scope, depth,
sequencing, or assessment choices. Facts are contestable; pedagogical intent is not.

### RELIABILITY — lifecycle consistency while editing, revising, maintaining
**Means:** the **distinctive** claim. A general-purpose agent structurally *cannot* maintain a package across
sessions — it has no whole-package view. This is that view.

**Mechanism (live since W8):** `index:semantic` stores the **before** · the gate computes **fresh** · M2
matches identity (§4: rephrase/value-change/rename all keep the id) · M3's five layers say *what moved* · M4
says *what it obliges* · M5 says *what it reaches* — and **`silentRisk`**, the claims a change reaches whose
own fingerprints did NOT move. **That is the case nothing else in the system can catch**: an answer key whose
text is untouched but whose upstream value changed now silently contradicts the source, and every check
passes.

| Situation | What Coursewerk does |
|---|---|
| Whitespace / reflow | **0 flags** — no layer moves at all |
| Meaning-preserving rephrase | `format` only → NONE |
| Value change `0 °C → 4 °C` | `content` moves → the fact **and its declared dependents** flag |
| Answer key derived from that value, text untouched | **`silentRisk`** — the only mechanism that sees it |
| Term rename (old label demoted to alias) | ids hold **and** `label` moves — both halves |
| Edit inside a direct quotation | never auto-applied (M8) — rewriting a quote **fabricates a quotation** |
| Authorized divergence | flag's *character* changes: accusation → revision to sign off |

**Honest limits:** an orz `:::info` bump still false-flags (W3) · a reorder is a mass delete-and-recreate
(W6) · nothing auto-applies, so the quotation guard has **no product caller** and its refusal branch is
never exercised end-to-end.

## 4. Findings

### W1 — **THE SEMANTIC INDEX NEVER RUNS.** `PROCEDURE.md` never reindexes. *(critical; FIXED)*
`semanticAudit()` returns `{ran:false}` unless `metadata/{CLAIMS,SPINE,TERMS}.json` exist. `PROCEDURE.md`
— the document the authoring agent actually executes — **never runs `npm run index:semantic`**, at any
stage. So the artifacts never exist, the layer never activates, and fifteen modules and ~5,000 tested
lines do nothing in the real workflow.

This is the project's signature defect — *"looks implemented, isn't"* — one level above where M11 fixed
it. M11 made `check_oer.mjs` **call** the modules; nothing made the workflow **create their inputs**.
A library nobody calls, wired to a gate nobody triggers.

### W2 — **PROCEDURE contradicts the format contract on the spine.** *(critical; FIXED)*
Stage 2 instructs the agent to write **"keywords/tags"**. `format-contracts/deliverables.md` says a
keyword dump is an authoring **input**, never a stored section, and that `## Key terms` is the vocabulary
authority. Stage 3 describes the chapter map as "concepts, links, logical order, per-section objectives"
and never names `## Concept sequence`, `## Key terms`, or `## Misconceptions to surface`.

**This is why all 12 real demo concept maps carry `## Keywords` and ZERO carry `## Key terms`** — not
agent drift; *the procedure told them to*. Two authorities disagreed about the most important artifact in
the product, and the agent followed the operative one. §5d at the document level: one fact (what a
concept map IS) specified in two places, and they drifted.

### W7 — the gate was SILENT when the semantic layer didn't run. *(FIXED)*
`semanticAudit()` has always produced a reason — *"no stored semantic index … Run `npm run index:semantic`"* —
and **the report discarded it**. `if (semantic.ran)` guarded the whole section, so a package that skipped
Stage 4 got **nothing**: no block, no warning, no hint. Silence is indistinguishable from "there is no such
feature" — the project's signature defect, **self-inflicted in the report of the gate built to catch it**.

Cause: the coordinator's own backward-compat requirement ("byte-identical output to today"), honoured
literally. That was right when an unindexed package was a *legacy* package; it is wrong now that PROCEDURE
*requires* indexing, because such a package is a **skipped step**.
Fix: machine surfaces (JSON, stdout, exit code) stay frozen for callers that diff/pin/grep; **the human
report now speaks.** The precedent was one line below all along — the near-verbatim scan says
`- not run (<reason>). Pass --inputs …`.
The backward-compat test was **weakened deliberately and argued in place**: it now asserts the report gains
the advisory *and nothing else*, and that the advisory **names the command that fixes it** rather than merely
complaining.

### W8 — **THE REVISION LOOP WAS WIRED TO NOTHING.** *(critical; FIXED)*
The RELIABILITY claim — the product's *distinctive* one — existed **only in the study harness**.
`check_oer.mjs` loaded the stored index, used it for `.present` and `.errors`, computed `fresh`, and ran
three referential-integrity checks. **It never diffed fresh against stored.** Grep: `matchClaims`,
`classify`, `claimImpact`, `planPropagation`, `scanConsistency`, `immutableRegions`,
`isAuthorizedDivergence` — **0 occurrences**. The only caller outside `lib/` and tests was
`scripts/study_pairs.mjs`, *the instrument that produces the paper's numbers*.

So: a value change `0 °C → 4 °C` produced **zero flags**; the answer key declaring `derivedFrom` that fact
was never touched. The instructor ships a practice sheet contradicting their own study guide, and the
queue is empty. A rename was invisible. **W1's exact shape one level down** — W1 asked *does the index
run?*; this asked *does the index DO THE THING?* — and `semanticAudit`'s own header already called the
stored artifacts "the 'before' a later edit is diffed against". The module knew. It never did it.

Fixed: `revisionFindings(stored, fresh)` — identity via `matchClaims`, reachability + `silentRisk` via
`claimImpact`, M7's per-claim authorization threaded as `ctx`, routed through `buildQueue`.
**Clean package still 0 flags / 3 artifacts; null edit still 0.** Value change → 10 (1 seed + 9
dependents); rename → 13, ids held.

### W9 — `OVERRIDES.json` had no producer. *(FIXED)* — 5th no-producer defect
`lib/overrides.mjs` exports `OVERRIDES_PATH` and a complete, mutation-tested API; **nothing wrote the
file**, nothing read it, and the package tree didn't list it. The module is *pure by design* (correct), so
the producer had to live somewhere — and lived nowhere. An instructor **could not authorize a divergence
at all.** Fixed: `scripts/record_override.mjs` + `npm run record:override`.

### W10 — the override test over-read the spec. *(RESOLVED — assertion corrected, not weakened)*
Usage test #12 asserted `flagCount === 0` after an override. **Spec §7 says "NOT flagged as
HALLUCINATION" — not "not flagged at all"**, and §10 dec. 2's ask-once rule governs *asking whether the
divergence is legitimate*, which `needsAsk` answers false forever after recording. It says nothing about
dependents.

**An override authorizes divergence FROM THE SOURCE; it does not make everything downstream correct.**
Override the melting point to 273.15 K and the answer keys still saying 0 °C are still wrong. An override
that silenced its dependents would **authorize the package into an internal contradiction** — worse than
the flag it removed. `study_pairs` preregistered exactly this (`real-value-change-authorized`) *before the
behaviour existed*, and a preregistered expectation outranks an assertion written later against an unbuilt
feature. The override changes the flag's **character** — an accusation becomes a revision to sign off —
which is what #12 now asserts (`kind !== "suspected-error"`, `severity === "review"`).

### W11 — a test that diffs against `HEAD` is a review-time check, not an invariant. *(FIXED)*
The W7 backward-compat test did `git show HEAD:scripts/check_oer.mjs`. It passed while the fix was
uncommitted and went **permanently red the instant it landed** — thereafter diffing the fixed gate against
itself. It then went red a *second* time for the F-A fix. Two reds for two **correct** changes is the
diagnosis: the invariant conflated *"the semantic layer is additive when off"* (true) with *"the gate's
output never changes"* (never true). **A test that goes red whenever you fix something correctly is a test
people learn to edit.** Reformulated to assert the real property directly.

### W12 — **CONTROL was enforced by GENERATION, not verification.** *(critical; FIXED)*
Probed, not reasoned: add a third `## Objectives` item that nothing in the package teaches → index →
gate → **`criticalTotal: 0`, burden 0. Silence.** The instructor's authority rested entirely on the agent
*choosing* to obey the spine — the one thing the harness exists because you cannot rely on. An agent that
quietly drops an objective passed every check.

**The measured trap** (why the obvious fix was wrong): on the *clean* fixture, **3 of 6** objective/concept
nodes had no claim referencing them and **6 of 14** claims had no `spineRef` (scan-found, by design). The
naive checks flag **9 false positives on a clean package** — the alarm-fatigue failure, shipped inside the
check meant to prove CONTROL.

**Operator's decision (2026-07-17): measure + flag only the strong case.** Coverage is reported with its
denominators as a **FLOOR, not a score** — an objective counts as covered only when a DECLARED claim names
it, so anything taught in undeclared prose measures as uncovered, and **coverage is unmeasurable at all
without traceability**. Only the unambiguous case is flagged: no declared claim AND none of its Key terms
present → genuinely *untaught*. New queue kind `missing-coverage` (not `sanity-check`, which would bury the
one check verifying the product's central claim in a bucket nobody can filter).
**Clean fixture: burden 0. Dropped objective: flagged, quoting the instructor's own words.**

### W13 — `orphan-claim` had no producer. *(FIXED)* — 6th no-producer defect
It sat in the enum and the severity map; only hand-built test findings emitted it. Meanwhile the gate's own
dangling-ref message read *"Orphan analysis must be able to tell 'this claim has no parent concept' from
'its parent does not exist' — those are opposite problems with opposite fixes"*. **The message explained why
a distinction mattered while only one side of it existed.** Scoped per the operator to **declared claims
only** — a scan-found claim is not an orphan, or a clean package gains 6 flags for a gap already reported
elsewhere.

### W14 — "does this label occur here" is implemented **FOUR** times, none exported. *(open)*
`claims.mjs labelRe`, `consistency.mjs labelRe`, its inline `replace`, `propagate.mjs findOccurrences`. The
CONTROL agent **refused to add a fifth inside the gate built to catch that defect** and read M2's stored
`claim.termRefs` instead — §5d's own prescription. Cost, stated in its code: `termRefs` is claim-block
scoped, narrower than "anywhere in the deliverables". **M2 should export the matcher.**

### W15 — a term's `spineRef` is SINGULAR while its `scope` is PLURAL. *(open)*
First-declaration-wins, so `melting point` bracketed `[concept.course.1]` in the course map and
`[concept.melting.1]` in the chapter map **silently keeps only the course one — and file order decides**,
which `terms.mjs` itself calls "accident, not authority". §5c's freeze-time check again.

### W16 — `provenanceDeclared` had no consumer. *(FIXED as a side effect)*
The coordinator's brief asserted scan-found claims "are reported through that channel". **They were not** —
the field appeared nowhere outside `claims.mjs` and its tests. The CONTROL check is its first consumer. The
reasoning for exempting scan-found claims from orphan analysis holds regardless; the premise was wrong.

### W17 — `formatContractAudit`'s objective cross-check is vacuous. *(open)*
It requires literal `Objective N` text in the concept map, which the format contract's `## Objectives` items
do not carry. W12's probe was therefore silent **twice over**.

### W18 — **THE OBEDIENCE-DECOUPLED REVIEWER WAS NEVER BUILT.** *(critical; specced — task #60)*
The largest claim gap in the project. `docs/reliability_recovery_design.md` §4/§5.2 calls it **"the top
method"** and S-F's **centerpiece**. It exists **only in comments — in three modules, each DEFERRING to it**:
- `claims.mjs`: *"the decoupled reviewer covers it, not the graph"*
- `consistency.mjs`: *"not caught here; it is caught by M5's declared edges and the decoupled reviewer"*
- `check_oer.mjs`: *"the obedience the design says it cannot rely on"*

**Three consumers, zero producers** — and each module's justification for *not* doing something rests on a
mechanism that was never built. The no-producer pattern in its purest form (the 7th instance).

**Worse, what occupies its place does the OPPOSITE.** `KEY_FACT_REVIEW.json` records
`status: "verified"` + `evidenceSourceIds`: **source TRACING** — *does the draft match the source?* The
decoupled reviewer's entire purpose is the inverse — *the source says X and X is WRONG; I know from my own
expertise it is Y* — and **the artifact has no slot for "the source is wrong."**

Consequence: **TRUST today = referential integrity + source conformity. Neither catches a wrong fact.** And
S-F's centerpiece test — *"a source error the obedient generator reproduces but the decoupled reviewer
catches"* — **cannot run.**
Operator decision (2026-07-17): a **new stage + `EXPERT_REVIEW.json` with a `challengesSource` slot**, scoped
to high-stakes claims, reviewer **skeptical about facts / obedient about pedagogy**.

### W20 — **`A` IS AN ENGLISH ARTICLE, AND THE UNIT TABLE READ IT AS AMPERES.** *(FIXED)*
Found by *wiring M6* — the defect was invisible until a consumer existed. Wiring made the **clean reference
package** flag:
> `practice/melting.md asserts 9 A; practice/melting.md asserts 3 A for term.melting-point`

The prose: *"Q **3 A** thermometer in melting ice reads…"* and *"Answer **9 A** flat plateau sits…"*. A
numbered question borrowed the next sentence's capitalized article and became a current.

**The irony is exact:** M6's non-flag 1 refuses bare integers as *"the single richest source of spurious
collisions"* — and the unit table **silently converted one into a quantity**, inside the check built to
prove the product doesn't cry wolf. `A` is the only single-capital symbol in the table that is also an
English word, and Q&A deliverables (`Answer 3 A …`) are a minefield for it.

**Deleting the row was NOT the fix** — `units.test.mjs` pins `A → ampere` because M3 knew it and M2's
scanner did not, and *that* drift was a real under-reporting bug (W-units). The unification **over-corrected
on this one row**: for `A`, the divergence was *correct*. Fixed with the existing device: `spellingOnly` —
known to M3's normalizer (harmless: articles are stripped as closed-class words *before* unit folding,
verified), typed OUT of M2/M6, exactly like `c`/`f`.
**Named recall cost:** a genuine `5 A of current` now mints no claim. Accepted — the alternative false-flags
every Q&A sheet, and the queue dies of false positives, not of misses.
**§5d is intact**: the exemption is now *declared in the type*, and a test asserts that anything M6 cannot
dimension **must** have declared itself `spellingOnly` — a row that merely forgot its symbols still fails.

### W19 — M6 (internal consistency) had no product caller. *(FIXED)*
`grep -c scanConsistency scripts/check_oer.mjs` → **0**. Built, 20 tests, mutation-covered — and its only
caller outside `lib/` and tests was `study_pairs.mjs`, **the study harness**. Same shape as W8: a package
could ship with its own study guide and answer key contradicting each other and the gate said nothing.

### W3 — `false_flag_rate` = 0.125, target 0 (orz `:::info` bump). *(open — task #58)*
`stripMarkup` has no orz rule, so the bare word `info` enters the semantic core and `content` moves.
orz-markdown is the house standard, so this fires on ordinary styling — the "whitespace flags everything"
complaint in a different costume.

### W4 — the study corpus measures **3 of 5 layers over 4 claims**. *(open, must be disclosed)*
Every claim in the golden fixture is scan-found, so `spineRefs`/`sourceRefs`/`derivedFrom` are empty by
design: `spine` and `provenance` are the hash of the empty set and **cannot move under any edit**, and the
derivation graph is empty, so every metric rests on co-mention alone. The manuscript must say so.

### W5 — `overrideId` has no producer. *(open)*
Fourth instance of the no-producer family. §2.4 says `provenance` "moves on override"; `fingerprint.mjs`
reads `claim.overrideId`; the schema declares it; **nothing writes it**. It survives because the override
reaches M4 through a different channel (`ctx.authorized`) — the working path masks the dead one.

### W6 — a reorder is a mass delete-and-recreate. *(open)*
1 edit → 6 flags on a 4-claim package: spec §0's founding defect (the S-C pilot's exact number) at claim
granularity, now wearing this index's authority.
