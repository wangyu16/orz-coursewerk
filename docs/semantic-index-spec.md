# Semantic Whole-Package Index — Implementation Spec

*Status: SPEC — DECISION-COMPLETE (all 4 operator questions resolved; ready to implement Slice 1). Branch: `feat/semantic-index` off `origin/main`
(`e28957a`). Extends the existing course-package coherence index; does not replace it.*

---

## 0. Context and base (read first — avoids the biggest "future issue")

- **Build base:** `origin/main = e28957a`. The local dev repo was 21 commits stale (v0.5.0/`d6bdd5d`); it
  has been reconciled. **This commit is also the one the manuscript study measured** — so the pilot is the
  wave-1 baseline and the improved commit is wave 2; the **delta is a manuscript result** (co-development).
- **Two distinct index systems — do not conflate:**
  1. `system/*` (`CLAIMS.json`, `RELATIONSHIPS.json`, `COURSEWERK_INDEX.json`, `system_index.mjs`) —
     **Coursewerk indexing ITSELF** (product-claim → code/test/doc traceability). **Out of scope; untouched.**
  2. `private/coursewerk/COMPONENT_INDEX.json` (built by `lib/coherence.mjs`) — the **generated COURSE-PACKAGE index**.
     **This is what we extend.**
- **What already exists in the course-package index (we build on, not replace):**
  - `lib/coherence.mjs` — component index + revision-coherence kernel: every output file is a component with a
    SHA-256 content hash and directed **source→dependent** edges; any edit invalidates until the impact set is
    reviewed and an attested refresh records the new coherent state.
  - `lib/key_fact_review.mjs` (`private/coursewerk/KEY_FACT_REVIEW.json`) — the factual-review layer (the semantic hook).
  - `lib/verbatim.mjs` — near-verbatim/quote detector (reuse for immutable regions).
  - `lib/source_record.mjs` (`private/coursewerk/SOURCE_RECORD.json`) — provenance (home for the override record).
  - `revision_impact.mjs`, `accept_coursewerk_revision.mjs`, `check_oer.mjs` — impact reporting, attested
    refresh, and the gate.
  - `system/schemas/*.schema.json` — the schema-driven pattern to mirror for the new metadata files.

**The two defects the design fixes (both in the course-package index):**
1. **Change signal = SHA-256 on file bytes** → whitespace/rephrase dirties the file → over-flagging
   (S-C pilot: 1 change → 6 required reviews). *Root cause of "add a space and everything is flagged."*
2. **Granularity = one component per FILE** → a one-fact edit dirties the whole file and all its dependents.

---

## 1. Goals / non-goals / principles

**Goals (each is an acceptance test in §7):**
- **Null edit → 0 flags** (whitespace, formatting, meaning-preserving rephrase).
- **Real edit → full recall** of truly-affected parts + **concerted, correct propagation** for authorized changes.
- **Precision** high enough that the instructor is not buried (measured, not assumed).
- Claim/assertion-level granularity; **layered** fingerprints; a small **action vocabulary**; an **instructor
  source-override** record; **immutable regions**; an **escalation queue**.

**Non-goals:** a database server; RAG/embeddings as authority; replacing git or the existing component index;
autonomous *correctness* (goal is recovery = detect + escalate; auto-propagation only for authorized changes).

**Principles:** plain-text + git-native; **deterministic + auditable** (no LLM in the fingerprint/impact path —
LLM only in generation and the separate decoupled reviewer); **declared-first** provenance with deterministic +
backstop recall; **the concept map IS the controlled vocabulary**; **backward compatible** with
`COMPONENT_INDEX.json` consumers; **schemaVersion on every metadata file** with a migration path.

---

## 2. Data model (new/changed `metadata/` files; schemas mirror `system/schemas/`)

All under the package's `metadata/`, all `schemaVersion`-stamped, all plain JSON.

### 2.1 `private/coursewerk/TERMS.json` — domain-term registry (built FROM the concept map)
```jsonc
{ "schemaVersion": 1,
  "terms": [{
    "id": "term.ethene",
    "canonical": "ethene",
    "preferredLabel": "ethene",
    "aliases": ["ethylene"],            // legacy/synonyms — recognized, never deleted
    "status": "preferred",              // preferred | deprecated-but-teach | superseded
    "authority": "IUPAC-2013",          // optional standard/citation
    "spineRef": "concept.alkenes",      // the concept-map node that authorizes this term
    "scope": ["chapter-3"]              // where the term/alias resolution applies
  }] }
```
The concept map is the source; the instructor owns it → the vocabulary is human-authorized by construction.

### 2.2 `private/coursewerk/CLAIMS.json` — claim/assertion nodes (the granularity fix)
```jsonc
{ "schemaVersion": 1,
  "claims": [{
    "id": "claim.<stable>",             // identity: see §6.1
    "type": "fact|objective|answer-key|definition|derived|procedure",
    "fingerprints": { "format": "...", "label": "...", "content": "...",
                       "spine": "...", "provenance": "..." },   // §2.4
    "spineRefs": ["concept.x","objective.3.2"], // links to concept-map / assessment-guide nodes
    "sourceRefs": ["src.wiki.rev12345#para4"],  // pinned-source anchors
    "derivedFrom": ["claim.y","claim.z"],        // explicit edges for aggregate/derived claims
    "locations": [{ "file":"study-guide/ch3.md", "anchor":"..." }], // may span files
    "immutable": false,                          // quotes/citations/source-records (§6.2)
    "status": "active|overridden|deprecated"
  }] }
```

### 2.3 `private/coursewerk/OVERRIDES.json` — instructor override of source (unblocks TRUST↔lifecycle collision)
```jsonc
{ "schemaVersion": 1,
  "overrides": [{
    "claimId": "claim.alkene-naming",
    "divergesFrom": "src.wiki.rev12345",   // the pinned source it deliberately contradicts
    "justifiedBy": "doi:10.xxxx/2026...",  // the newer/authoritative source S'
    "authorizedBy": "instructor",
    "date": "2026-07-16",
    "rationale": "IUPAC 2013 recommended name; textbook uses legacy term."
  }] }
```
The fidelity checker treats a claim with an override as **authorized divergence, not hallucination.**

### 2.4 Fingerprints (the change-signal fix — deterministic pure functions)
A claim has **five** independent fingerprints so a change is classified by *which layer moved*:
- **`format`** — hash after stripping whitespace/markup/formatting noise. Moves on cosmetic edits only.
- **`label`** — the set of *term ids* used (via TERMS resolution). Moves on a rename; not on a value change.
- **`content`** — the **normalized semantic core**: canonicalize terms→ids, extract quantities with units,
  normalize numbers/units, **preserve modality/negation/quantifiers** (a hedge change *"may cause"→"causes"*
  MUST move this). Hash the normalized tuple. **This is the real "did the meaning change" signal.**
- **`spine`** — hash of the linked concept/objective nodes (moves when pedagogy/scope changes).
- **`provenance`** — hash of sourceRefs + any override (moves on re-citation / source drift).

> **Backward compatibility:** `COMPONENT_INDEX.json` stays as-is (file-level, byte-hash) so current consumers
> keep working; the claim index is an **additive `private/coursewerk/CLAIMS.json`**. File-level components gain an
> optional `claims: [...]` roll-up. Migration: a package without CLAIMS.json falls back to today's behavior.

---

## 3. Module decomposition (extend real files; each independently testable)

| Mod | Name | Extends / new | Interface (pure where possible) |
|---|---|---|---|
| M1 | term-registry | new `lib/terms.mjs` | `buildTerms(conceptMap)→TERMS`; `resolve(label,scope)→termId`; alias-aware |
| M2 | claim-extractor | new `lib/claims.mjs` | `extractClaims(root)→CLAIMS` — **declared-first** (from contract) + deterministic term/number scan as recall backstop |
| M3 | fingerprint | new `lib/fingerprint.mjs` | `fingerprints(claim,terms)→{format,label,content,spine,provenance}` — **pure, no LLM** |
| M4 | change-classifier | new `lib/classify.mjs` | `classify(oldFp,newFp)→action` (§5); pure |
| M5 | impact-graph | **extend `lib/coherence.mjs`** | reachability from **fingerprint-changed claims** (not files); `impact(root)→{affected,silentRisk}` |
| M6 | consistency-scan | new `lib/consistency.mjs` | deterministic cross-artifact agreement on shared terms/numbers/definitions (undeclared-edge backstop) |
| M7 | override-manager | **extend `lib/source_record.mjs`** + new OVERRIDES.json | `isAuthorizedDivergence(claim)→bool` for the fidelity checker |
| M8 | immutable-regions | **reuse `lib/verbatim.mjs`** | mark quotes/citations/source spans; forbid auto-rewrite there |
| M9 | propagation-engine | new `lib/propagate.mjs` | for **authorized** change: re-derive dependents + emit review diff (never touch immutable/pedagogy) |
| M10 | escalation-queue | new `lib/escalation.mjs` → `private/coursewerk/REVIEW_QUEUE.json` | flagged claims + evidence for the instructor (the recovery step) |
| M11 | gate-integration | **extend `check_oer.mjs`** | undeclared claim-provenance = fail; **orphan claim** (no spine parent) = flag; prereq/coverage checks |
| M12 | contract-change | **edit `format-contracts/deliverables.md`** + `lib/contract.mjs` | generator DECLARES claim provenance as it writes |

Dependency order: M1→M3→M2→M4/M5→M6/M7/M8→M9/M10→M11/M12.

---

## 4. Concept-map = vocabulary (the elegant reuse)
The instructor-authored concept map + assessment guide (the **spine**) is simultaneously the pedagogical plan
**and** M1's controlled vocabulary and M5's spine nodes. One artifact, three jobs → no separate ontology to
maintain, and the index inherits the instructor's authority (keeps CONTROL coherent).

---

## 5. Change taxonomy → action vocabulary (classify by which fingerprint moved)
Action verbs: **NONE / RENAME / RE-DERIVE / REGENERATE / RECHECK / ESCALATE / ANNOTATE.**

| Layer moved | Change types (examples) | Action |
|---|---|---|
| `format` only | whitespace, formatting, meaning-preserving rephrase, orz/template bump | **NONE** |
| `label` only | terminology/IUPAC rename | **RENAME** (add-alias + set-preferred, scope-aware; flag items that *test* the term; never rewrite inside quotes) |
| `content` | value/fact change, knowledge update, error correction | **RE-DERIVE** dependents (+cite); **ESCALATE** first if it's a *suspected error* vs an *authorized* change |
| `spine` | objective add/remove, depth change, reorder/prereq | **RECHECK** coverage/orphans/prereq-order; **REGENERATE** subtree for a depth change (can't patch depth) |
| `provenance` | source drift (pinned rev moved), re-citation, override | **RECHECK** → **ESCALATE** (adopt upstream?) ; record decline if not adopted |
| `provenance` (assets) | figure/asset replaced or relicensed | **RECHECK** attribution + license inheritance package-wide; re-derive alt text |
| pedagogy intent | deprecate-but-teach (keep old idea as history) | **ANNOTATE**, never replace |

**Two cross-cutting rules:** (a) **authorized change → propagate concertedly** (the human already decided; emit
a review diff for sign-off) vs **suspected error → escalate** (human adjudicates source-vs-AI); (b) **immutable
regions are never auto-rewritten** (quotes/citations/source records — rewriting a dated quote is fabrication).

---

## 6. Edge cases / traps (the "avoid future issues" section)

1. **Claim identity across edits (hardest).** Match old↔new claims by (spineRef + location anchor + `label`
   fingerprint), NOT by content (content changes are the whole point). Handle **splits/merges** (one claim → two)
   explicitly: unmatched-new = added; unmatched-old = removed; report both. Stable ids survive rephrase/rename.
2. **Immutable regions** via `lib/verbatim.mjs`: quotations, citations, `SOURCE_RECORD` spans → `immutable:true`
   → excluded from RENAME/RE-DERIVE. A rename produces *"ethene (formerly ethylene)"* in body prose, never inside
   a quoted 1970 sentence.
3. **Alias semantics:** RENAME = add-alias + set-preferred; the old term persists as a recognized synonym forever
   (legacy occurrences still resolve; students still meet it in the literature). Items whose *learning objective is
   the term itself* are RECHECK, not blind-replace.
4. **Override vs staleness:** distinguish "package is *behind* the pinned source" (provenance drift, RECHECK) from
   "package *deliberately diverges*" (OVERRIDES.json, authorized). Record **declined** upstream updates too.
5. **Semantic-null vs semantic-real rephrase:** the `content` fingerprint MUST encode modality/negation/quantifiers
   and units — else *"may cause"→"causes"* is wrongly treated as null. Golden tests pin this.
6. **Cycles** in the claim graph → detect and break deterministically (topo with cycle report); an edit in a cycle
   flags the cycle, doesn't loop.
7. **Determinism:** M3–M6 are pure/deterministic (same input → same output), so results are auditable and the study
   is reproducible. LLM lives only in generation (M12) and the decoupled reviewer (separate; not in the impact path).
8. **Backward compatibility & migration:** additive metadata; `COMPONENT_INDEX.json` untouched; packages without
   the new files degrade to current behavior; a one-shot `reindex` migrates an existing package.
9. **~~The S-D coherence-binding bug (known)~~ — REFUTED 2026-07-17. DO NOT "FIX" THIS.**
   *The claim was:* the Full reviewer edits `KEY_FACT_REVIEW.json` without refreshing coherence bindings →
   introduces coherence failures → Full scores worse than Light for doing more work. **Investigated; the
   mechanism does not exist.** `scripts/bind_key_fact_review.mjs` re-runs `makeKeyFactBindings` after the fixes
   (the exact analogue of `recordAcceptedCoherence`), so the review is not trapped — the suspected asymmetry
   between the two gates is imaginary. And `KEY_FACT_REVIEW.json` is absent from its **own** bindings, so
   recording a review cannot invalidate it; without that there would be no fixed point and the gate WOULD be
   unsatisfiable by construction, which is the defect it was accused of. **The gate is correct as written.**
   The residual failure is **ordering — fix, THEN bind**; a harness that binds before its last edit produces a
   stale binding and a failure that is *correct*, because the review genuinely did not read those bytes. That
   belongs in PROCEDURE, not in M5/M11.
   **Pinned by `tests/key-fact-bindings.test.mjs`, which makes the gate HARDER to weaken, not easier to pass.**
   This result feeds a manuscript about this very product: adjusting a check so our own product scores better
   in our own paper is indistinguishable from fabrication from the outside, and indistinguishable from
   bug-fixing from the inside. **S-D's negative result is therefore unexplained**, and "cross-model critique
   has no mechanical value" remains unsafe to conclude — for want of evidence, not because of a known artifact.
   Re-running S-D requires a bind-last harness first.
10. **Performance:** ~500 files / a few thousand claims for a full course → in-memory graph is fine. Bound claim
    count per artifact; the deterministic scan is O(claims·terms) — acceptable; no service needed.

---

## 7. Test plan (acceptance = tests; free + deterministic, house style)
- **Null-edit suite (target 0 flags):** whitespace, reflow, formatting, meaning-preserving rephrase, orz bump.
- **Real-edit suite (target full recall + correct action):** value change, term rename, objective add/remove,
  depth change, reorder, asset swap, source drift, override.
- **Immutable-region test:** edit inside a quote → not auto-rewritten.
- **Override test:** knowledge update beyond the source → NOT flagged as hallucination.
- **Classifier unit tests:** each layer-move → expected verb (incl. the modality/hedge case).
- **Identity tests:** rephrase keeps id; split/merge reported; value change keeps id.
- **Golden fixture:** a tiny 1-chapter package under `tests/fixtures/` for regression.
- **Integration = the study pairs:** real-edit → `impact_detection_recall`/`propagation_correctness`;
  null-edit → `false_flag_rate` (=0). These double as the manuscript's S-C/S-F apparatus.

---

## 8. Sequencing (value-first slices; each shippable, tested, committed on the branch)
- **Slice 0 — guardrails:** branch off `origin/main` (done); study clone untouched; acceptance criteria fixed.
- **Slice 1 — TERMS + fingerprints + null-edit suppression** (M1, M3; ships the #1 user want): concept-map→TERMS,
  the five fingerprints, and "bytes changed + `content` fp identical ⇒ NONE." *Fixes over-flagging before the
  bigger work; independently valuable.*
- **Slice 2 — claim nodes + declaration contract** (M2, M12): `CLAIMS.json`, generator declares claim provenance,
  gate begins to expect it. Granularity fix.
- **Slice 3 — claim-level impact + classifier + immutable regions** (M4, M5, M8): reachability from changed claims;
  the action verbs; verbatim-based immutable regions.
- **Slice 4 — override record + fidelity integration** (M7): OVERRIDES.json; authorized-divergence path.
- **Slice 5 — gate enforcement + free detectors** (M11): undeclared-provenance fail; orphan-claim; prereq/coverage;
  **fix the S-D coherence-binding refresh**.
- **Slice 6 — consistency scan + escalation queue** (M6, M10): deterministic cross-artifact agreement; REVIEW_QUEUE.
- **Slice 7 — concerted auto-propagation** (M9): re-derive dependents for authorized changes + review diff.

Each slice: code + tests green + a commit on `feat/semantic-index`. **No push** — operator reviews and pushes.

---

## 9. Process & manuscript coupling
- Develop only in `/home/ubuntu/coursewerk` on `feat/semantic-index`. **Never** touch the study clone
  (`…/tools/orz-coursewerk` @ `e28957a`).
- Operator pushes/merges (public product). Then the manuscript **re-pins to the new commit = wave 2**; the
  wave-1→wave-2 **delta on the S-C/S-F metrics is a headline manuscript result** (found-by-fault-injection →
  fixed → re-measured).

## 10. Operator decisions (ALL RESOLVED 2026-07-16 — spec is decision-complete)
1. **Claim-provenance declaration burden — DECIDED (2026-07-16): selective + structural + gate-on-presence.**
   Declare only HIGH-STAKES claim types (facts with values/quantities, definitions, answer keys, objectives
   coverage — the CLAIMS.json types); connective prose carries no duty. Declaration is STRUCTURAL (sidecar /
   front-matter at write time), never inline in student-facing prose. The gate enforces PRESENCE, not
   perfection: zero declared provenance in an artifact = fail; a scan-found undeclared claim = index + WARN,
   not hard-fail (hard-failing every miss recreates the fabrication incentive). Deterministic scan (M6) is the
   recall backstop. Accepted cost: connective prose is unindexed (covered by the decoupled reviewer, not the
   graph).
2. **Auto-propagation aggressiveness — DECIDED (2026-07-16): two-tier policy.**
   MECHANICAL dependents (deterministic term/value substitution outside immutable regions, where the
   dependent's post-substitution `content` fingerprint matches the expected transform) are AUTO-APPLIED with a
   summarized RECEIPT (listed in the revision receipt + git; consent-by-summary, expandable — informed, not
   interrupted). DERIVED dependents (anything needing an LLM re-derive: worked examples, explanatory prose,
   distractors) are ALWAYS gated behind a review diff. Classification uncertainty defaults to DERIVED (fail
   toward review, never toward silence). Golden-test class: mechanical applied silently+correctly; derived
   always diffed. Accepted residual risk: a mis-classified dependent auto-applies — mitigated by the
   conservative default, the receipt, and git reversibility.

   **ADDENDUM — knowledge-truth sensitivity (operator, 2026-07-16):**
   - **Instructor-input sanity check (ask-to-confirm):** when instructor-provided content conflicts with the
     model's internal knowledge (an implausible number, an off-by-magnitude date), the agent ASKS TO CONFIRM
     before propagating — one question, with its reasoning. Typos are real; internal knowledge is the tripwire.
     This extends obedience-decoupling to the instructor channel: obedient in execution, never silently
     obedient to a likely slip.
   - **Confirmed override = permanently settled:** if the instructor confirms — or provides a source (the
     IUPAC case) — record it in `OVERRIDES.json` and NEVER ASK AGAIN, even though it diverges from internal
     knowledge (frozen at training time, possibly stale). Re-asking = alarm fatigue.
   - **Precedence order for truth in a package:** instructor override (sourced/confirmed) > pinned source >
     model internal knowledge. Internal knowledge is a TRIPWIRE for the ask, never an authority that overrules
     a recorded decision. (M7 override-manager implements the ask-once lifecycle: propose -> confirm/source ->
     recorded -> silent thereafter; M9 propagation and the decoupled reviewer both consult OVERRIDES before
     challenging.)
3. **Terms not in the concept map — DECIDED (2026-07-16): the CONCEPT MAP is the living, single source of
   truth; off-map terms are proposed INTO IT, never into a side authority.**
   The concept map is built by the instructor WITH the agent's help and UPDATES along the road. Flow:
   (a) generation-time: an unknown domain term is auto-registered as `status:"candidate"` — immediately usable
   by fingerprints and the consistency scan (detection from day one) but marked not-instructor-authorized;
   (b) resolution = a PROPOSED CONCEPT-MAP REVISION, batched at existing review gates: the agent DISCUSSES
   placement with the instructor ("9 supporting terms; 7 as terms under existing concepts, 2 possibly new
   sub-concepts — approve/re-place/reject?") — placement, not yes/no;
   (c) approved -> the CONCEPT MAP is revised -> `TERMS.json` is REGENERATED FROM the map (TERMS is always a
   derived artifact, never a second authority — no drift possible);
   (d) rejected -> the term AND the claims using it are flagged (scope creep or error, surfaced).
   Detector status-split stands: orphan-claim analysis trusts only confirmed (in-map) links; the consistency
   scan works on both; the "candidate accumulating claims across artifacts" tripwire flags a possible NEW
   CONCEPT (a spine change through the spine's own gate — the registry is not a side door into pedagogy).
   **Spine-change subtypes (required consequence):** ADDITIVE ENRICHMENT (add term/alias under an existing
   concept) = registry regeneration only, NO propagation cascade; STRUCTURAL change (add/remove/move a
   concept/objective) = the full RECHECK/REGENERATE path from the change taxonomy. Registering supporting
   vocabulary must never RECHECK the whole package.
4. **Override authority — DECIDED (2026-07-16): source REQUESTED, never REQUIRED; basis + rationale always
   recorded.** The agent asks ONCE for a reference (optional); the override is recorded and permanently
   settled either way (Q2 ask-once rule — no future nagging). `OVERRIDES.json` gains a `basis` field:
   `cited` (justifiedBy present) | `instructor-expertise` | `pedagogical-choice` (deliberate simplification;
   pairs with ANNOTATE where appropriate). All three bases are EQUALLY AUTHORITATIVE inside the package —
   the fidelity checker treats each as authorized divergence, never hallucination.
   **Refinement (operator): an important, not-obviously-true claim usually needs a reliable source. If the
   instructor insists WITHOUT one, a RECORD AND EXPLANATION are required for future reference:** for uncited
   overrides the `rationale` field is REQUIRED — the agent asks for a brief explanation ("for the record,
   what's the basis?" — a scribe's question, not a challenge) and records it verbatim. Every override thus
   answers "why does this package diverge from its source?" — for future maintainers, the instructor's own
   later reference, and downstream OER reusers. Publish-time transparency: the pack receipt lists overrides
   by basis; uncited ones appear in the package's deviation notes — visible, never blocking, neutral tone.
   Accepted cost: a mistaken expertise-based override gets the same protection as a good one — mitigated by
   the Q2 sanity-check ask happening BEFORE recording, the required rationale, and publish-time visibility.
