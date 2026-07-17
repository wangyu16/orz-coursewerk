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
