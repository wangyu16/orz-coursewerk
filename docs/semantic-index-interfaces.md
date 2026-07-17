# Semantic Index — Frozen Interfaces (S0)

*Companion to `docs/semantic-index-spec.md`. **Everything below is FROZEN** — modules M1–M12 are implemented
concurrently against these contracts. Do not change a signature or an id scheme without updating this file
first (it is the coordination substrate).*

Repo facts: ESM (`"type":"module"`), `.mjs`, tests via `node --test tests/*.test.mjs`. House style: rich
"why" header comment, pure/deterministic, no network in the index path.

---

## 1. Concept-map parse convention (M1's input — designed against REAL demo maps)

The concept map is **plain Markdown** (contract: "Headings, nested lists, tables, text arrows (→) only").
Real packages already use a regular section structure — the parser targets exactly these headings and is
**tolerant** (an unknown/missing section yields fewer nodes, never a crash).

### `concepts/<chapter-slug>.md`
| Section | Shape | Yields |
|---|---|---|
| `# Concept Map — <Title>` | h1 | chapter title |
| `## Source and scope` | prose | source refs (informational) |
| `## Summary` | prose | — |
| `## Prerequisites` | unordered list, each item MAY carry a trailing `[concept.x.n]` | incoming prereq edge `concept.x.n → chapter.<slug>` — **only where the bracket is present** |
| `## Objectives` | **ordered** list | `objective.<chapter-slug>.<n>` |
| `## Concept sequence` | **ordered** list | `concept.<chapter-slug>.<n>` + intra-chapter order = prereq chain |
| `## Key terms` **(NEW — required by M12)** | unordered list | `term.<slug>` (see grammar below) |
| `## Misconceptions to surface` | unordered list | `misconception.<chapter-slug>.<n>` — **negative claims** |

### `concepts/course.md`
**Same section grammar as a chapter map, with `scope: "course"`** (§2) — `## Objectives` →
`objective.course.<n>`, `## Concept sequence` → `concept.course.<n>`, and so on. Plus:
`# Course Concept Map — <Title>`; `## Organizing question`; `## Chapter sequence` → inter-chapter order;
`## Key terms` (optional) → course-wide vocabulary.

**`## Chapter sequence` binding** [FROZEN 2026-07-17, M13]: slugify each item's **bold run** and bind it
to that chapter **only if `concepts/<slug>.md` exists** — verified, never guessed. No match ⇒ `slug: null`
and NO phantom chapter; the item's order is still carried by its ordinal. (Same bold-run convention as
`## Key terms`; stated here because §1 previously gave it only there, so M13 had to infer it.)

### Prerequisites in `course.md` — RECORDS ONLY, no edges  [FROZEN 2026-07-17, M13]
Making `course` a scope (§2) created an asymmetry: the same `## Prerequisites` line yields an edge in a
chapter map and none in the course map, because a prereq edge's near end is `chapter.<slug>` and **course
is not a chapter**. Resolved in favour of the asymmetry, deliberately: **a course's prerequisites are BY
DEFINITION outside the course** ("Algebra II", "one year of biology"), so their far end has no node in this
package and never can. Minting `chapter.course` to paper over it would assert the course is a chapter of
itself. So course-map prerequisites are carried as `prerequisites[]` records and mint **no edge** — which
is what they are: a statement to a human reader about entry requirements, not an intra-package dependency.
Nothing is silent; the records are still reportable.

### Prerequisites — why the bracket, and why no inference
[ADDED 2026-07-17 — M13 found the row unimplementable] A prereq item is prose ("Temperature and thermal
energy"). Matching that prose to a concept needs exactly the label-vs-sentence inference §1 forbids — and
it **would** misfire: in the golden fixture that very item overlaps `concept.phase-change.1`'s sentence.
So the far end comes from an **explicit bracket or not at all**, reusing `## Key terms`' convention rather
than inventing a second one, and the near end is the new `chapter.<slug>` id. An item with no bracket is
carried with `ref: null` and mints **no edge**: a fabricated prerequisite asserts a claim about the
course's structure that the instructor never made.

### `## Key terms` grammar (plain markdown, tolerant)  [AMENDED 2026-07-16 — see §7]
```
- **<preferredLabel>** (<alias>, <alias>) — <gloss> [<spineRef>]
- **PAM** (protospacer adjacent motif) — the motif adjacent to the target [concept.crispr.5]
- **ethene** (aliases: ethylene) — the IUPAC-preferred name
- **Cas9**
```
Rules: bold run = `preferredLabel` (required). Optional parenthetical = aliases (an `aliases:` prefix is
accepted and stripped). Optional `—`/`--` gloss. **Optional trailing `[concept.x]` / `[objective.x]` =
`spineRef`** — the concept this term is authorized under. Everything else ignored. A term listed here is
`status:"confirmed"` (instructor-authorized **because it is in the map**).

**`spineRef` is OPTIONAL and absent-is-honest.** NEVER derive it by matching term labels against
`## Concept sequence` items: those are *sentences*, so matching yields incidental hits (a term like
"temperature" would bind to whichever sentence mentions it first) and M5's orphan analysis would then trust an
arbitrary link. An absent link is honest; a guessed one is a fabrication in a deterministic costume. The
explicit bracket exists because the **Q3 placement flow already produces a placement** — when the instructor
approves a candidate's placement, that decision is recorded here.

**`status` vs `lifecycle` are ORTHOGONAL (bug fix, 2026-07-16).** `status ∈ confirmed|candidate` is
**authorization** only; `lifecycle ∈ active|deprecated-but-teach|superseded` is the term's life stage. A
`deprecated-but-teach` term **is still `confirmed`** — it is in the map. (The original flat enum mixed the
axes, so a naive `status==="confirmed"` check would have read false for an instructor-authored deprecated
term and mis-flagged it as an orphan.)

**Why a new section:** concepts are written as *sentences* ("Foreign nucleic acid supplies a protospacer
candidate"), so term extraction from prose alone would be heuristic guessing. `## Key terms` makes the
vocabulary explicit, human-authored, and deterministically parseable — and it *is* the Q3 authority.

---

## 2. Stable id schemes (FROZEN)
| Kind | Scheme |
|---|---|
| term | `term.<slug(preferredLabel-AT-FIRST-SIGHT)>` — **MINTED ONCE, NEVER RE-MINTED ON RENAME** |
| **chapter** | **`chapter.<chapter-slug>`** — [ADDED 2026-07-17, M13] a prereq edge needs TWO endpoints and the near end is the CHAPTER; §2 minted no id for one, so §1's `## Prerequisites → incoming prereq edges` row was **not implementable as written**. |
| concept | `concept.<chapter-slug>.<n>` · course: `concept.course.<n>` |
| objective | `objective.<chapter-slug>.<n>` · course: `objective.course.<n>` |
| misconception | `misconception.<chapter-slug>.<n>` · course: `misconception.course.<n>` |

### The term id is MINTED ONCE  [AMENDED 2026-07-17 — the study pairs proved the rename BROKEN end-to-end]
As frozen, §2 and §10 dec. 3(c) were **individually correct and jointly unsatisfiable**: the id EMBEDDED the
preferredLabel, and TERMS is REGENERATED from the map. So a rename re-minted the term id → moved M2's
`identityLabel` (a hash of sorted term **ids**) → moved the claim id → **`RENAME` never fired, and `label` never
got a matched pair to be observed on.** Measured: a rename yields **3 added + 3 removed** where §4 promises 3
matched. That killed the IUPAC terminology-migration case — the scenario this feature exists for.

**This is §5e at SYSTEM scale, and the first instance spanning two modules:** the term id served as an identity
key (M2 hashes it) while *deriving from the change signal* (M1's preferredLabel). Every earlier §5e instance sat
inside one file, where its author could see both halves. Here neither module's own review could — M1 was right
that a rename must be observable, M2 was right to key identity on ids, and the defect lived in the seam.
**§4b's rename-invariance held only via `setPreferred`, which NOTHING PERSISTED** — §4b reasoned correctly about
an API nobody could reach.

**The rule:** `buildTerms(conceptMaps, priorTerms)` — a term id is minted from its preferredLabel **the first
time the term is seen** and is **never re-minted**. On a later build, a map entry whose label set (preferred +
aliases) overlaps **exactly one** prior term *in the same scope* **RESOLVES TO THAT TERM AND KEEPS ITS ID**;
only the `preferredLabel`/`aliases` update. §1's grammar already guarantees the hinge: a rename keeps the old
label as an alias (`- **fusion point** (melting point, …)`), so the overlap exists by construction — **and if an
author deletes the old label instead of demoting it to an alias, that is NOT a rename; it is a remove + an add,
and reporting it as such is correct.**
- **Overlapping ≥2 prior terms ⇒ AMBIGUOUS ⇒ adopt no prior id, mint fresh, and REPORT.** A silent merge of two
  concepts is worse than a missed rename: it would fold two distinct teachings into one node and every downstream
  check would enforce the merge. ("Mint nothing" would be worse still — dropping the term destroys data: claims
  lose their `termRefs` and `label` moves anyway. Refuse the *adoption*, never the term.)
- **CHANGE-WINS when two entries continue one prior term** [FROZEN 2026-07-17, the fix's own implementation
  exposed this]: the course map and a chapter map may both declare a term, and an instructor renames it in ONE of
  them — so two entries overlap one prior and §2 said both "keep its id" and "preferredLabel updates" without
  saying **which update wins**. The prior's label is the STATUS QUO; an entry differing from it is the NEW
  INFORMATION, so **the differing entry's label wins**. First-wins would silently swallow the rename (3 matched,
  no `RENAME` — the defect restored); last-wins would depend on filename sort order, i.e. on an accident rather
  than an authority. Change-wins is order-independent and is what makes the rename observable at all.
- **The id space is APPEND-ONLY**: a retired id is never recycled. Otherwise `identityLabel` sits still while the
  vocabulary beneath it changes meaning — a silent merge across time, which is the same defect with a delay.
- The id is thereafter a **historical artifact** (`term.melting-point` may carry preferredLabel "fusion point").
  That is correct and normal for an identity key — it is a handle, not a display name. Never "tidy" it to match.
- `priorTerms` comes from the **stored `TERMS.json`** (M14). The registry that made this fixable did not exist
  when §2 was frozen; the memory the design assumed was simply absent.

**`<n>` is the item's POSITION in the list (1-based), NEVER the typed list marker.** [FROZEN 2026-07-17, M13]
`1. 1. 1.` is ordinary markdown, and a hand-edited map routinely carries `4.` where `3.` was deleted —
trusting the typed number would silently **re-parent every claim under the item below it**.

**`course` is a scope, not a special document.** [FROZEN 2026-07-17] `concepts/course.md` uses the SAME
section grammar as a chapter map with `scope: "course"` — one grammar, two scopes — plus `## Organizing
question` and `## Chapter sequence`. Two grammars for one document kind is §5d waiting to happen, and a
real course map legitimately carries course-level objectives.
| claim | `claim.<slug(spineRef)>.<shortHash(fileQualifiedAnchor + identityLabel)>` — see §4 |

Use existing `lib/slug.mjs` for slugging. Ids are **stable across rephrase and rename** (§4).

**`identityLabel` is NOT M3's `label` fingerprint** — see §4b. **`fileQualifiedAnchor` is `location.file + "|" + anchor`**,
never the bare anchor: two claims under the same heading in different artifacts (`study-guide/ch3.md` and
`practice/ch3.md` both have `## Objectives`) would otherwise collide into ONE id — a granularity defect in the
module built to fix granularity defects, and it would silently merge two distinct claims into one node.

---

## 3. Module signatures (FROZEN)

```js
// M13 lib/spine.mjs   [FROZEN 2026-07-17 — the namespace SIX modules consumed and NOTHING produced]
export function buildSpine(conceptMaps)   // [{file,text,scope}] -> SPINE   (PURE; same input shape as M1)
export function readConceptMaps(root)     // root -> [{file,text,scope}]    (the ONLY I/O; §1 scope convention, applied ONCE)
export function spineNode(spine, ref)     // -> node | null   EXACT id match, never prefix/fuzzy
export function hasSpineNode(spine, ref)  // -> bool          <- THE QUESTION SIX MODULES COULD NOT ASK
export function danglingSpineRefs(spine, refs) // -> sorted unique refs with no node ("" / null are NOT dangling)
  // SPINE: {schemaVersion, generatedFrom[], chapters[], nodes[], edges[], prerequisites[], chapterSequence[]}
  // node:  {id, kind, scope, ordinal, label, negative, file}
  // edge:  {from, to, kind:"prereq", reason}   reads "FROM is a prerequisite of TO"
  // `negative` marks a misconception — it is the WRONG belief, and a consumer that forgets this
  // enforces the misconception as truth. Carry it; never drop it.
  // The gate asks: danglingSpineRefs(spine, claim.spineRefs)  (§5b rows 1-2, previously uncomputable)

// M1 lib/terms.mjs
export function buildTerms(conceptMaps, priorTerms)   // [{file,text,scope}] -> TERMS (terms.schema.json)
  // `priorTerms` (optional; the STORED TERMS.json, M14) is what makes the id RENAME-INVARIANT — see §2.
  // Without it the id is re-minted from the new label and the rename is invisible (measured: 3 added +
  // 3 removed where §4 promises 3 matched). Omit it ONLY for a first build; a caller that has a stored
  // registry and does not pass it silently reintroduces the defect.
export function parseSections(text)            // -> Map<lowercased heading, body lines>   [EXPORTED for M13]
export function listItems(lines)               // -> the list grammar                      [EXPORTED for M13]
  // Both exported rather than re-implemented in M13: one document, ONE parser. Every node-bearing
  // section is a list, and `-` vs `*` vs `1)` is precisely what two copies stop agreeing on (§5d).
export function resolve(terms, label, scope)   // -> termId | null   (alias-aware, scope-aware, case-insensitive)
export function addCandidate(terms, label, scope) // -> TERMS' (status:"candidate")
export function setPreferred(terms, termId, newLabel) // -> TERMS' (RENAME = add-alias + set-preferred; old label NEVER deleted)

// M3 lib/fingerprint.mjs   (PURE — no LLM, no I/O)   [AMENDED: scope param]
export function fingerprints(claim, terms)            // -> {format,label,content,spine,provenance} (hex)
                                                      //    derives scope from claim.locations[0].file
export function normalizeContent(text, terms, scope)  // -> canonical string (terms->ids, numbers+units
                                                      //    normalized, modality/negation/quantifiers PRESERVED)
  // `scope` is REQUIRED for correctness: without it M1's scope rule cannot apply and a chapter-local
  // HOMOGRAPH folds to whichever term was declared first package-wide — a silent mis-identification.
  // Pass null for genuinely package-wide text.

// KNOWN, ACCEPTED LIMITATION of `content` (documented, not discovered later):
//   Normalization sorts tokens into a multiset to absorb word-order rephrase (a hard requirement), which
//   costs ARGUMENT ORDER: "A dissolves in B" ≡ "B dissolves in A". Bounded, not ignored — modality/negation/
//   quantifier markers are BOUND to the token they scope over, so the classic silent killers (all→some,
//   may→does, melts→does not melt) still move content. True role structure needs a parser, and a wrong parse
//   is worse than no parse. Role reversal is left to M6/human review. THIS MUST APPEAR IN THE MANUSCRIPT'S
//   LIMITATIONS — it is a real (if narrow) class of semantic change the index does not detect.

// M4 lib/classify.mjs      (PURE)   [AMENDED 2026-07-16 after M4 implementation surfaced 3 gaps]
export function classify(oldFp, newFp, ctx)
  // ctx: { authorized: boolean,
  //        spineChange: "additive"|"structural"|"depth"|null,   // "depth" REQUIRED: spec §5 wants REGENERATE
  //                                                             //   for a depth change (cannot patch depth).
  //                                                             //   unknown/absent => reads as structural (fail toward review)
  //        pedagogy: "deprecate-but-teach"|null }               // REQUIRED: else spec §5's ANNOTATE row is dead code
  // -> { action, layer, reason, followUp? }
  // action ∈ NONE|RENAME|RE-DERIVE|REGENERATE|RECHECK|ESCALATE|ANNOTATE
  // followUp?: { action, reason } — a STRUCTURED second step, never prose to be parsed.
  //   Needed because spec §5's provenance rule is a SEQUENCE ("RECHECK, then ESCALATE (adopt upstream?)"):
  //   RECHECK is the mechanical impact analysis; ESCALATE is the human adopt-or-decline decision.
  //   M10 reads `followUp` to queue the escalation. Suppressed when ctx.authorized (ask-once rule,
  //   §10 decision 2 — re-asking a settled override is alarm fatigue).
  // Precedence when several layers move: ANNOTATE(pedagogy) > spine > content > provenance > label > format
  //   (blast radius; the winning verb subsumes the losers' work). Losing layers are named in `reason`,
  //   never discarded. ONE primary action — returning a set would push precedence into every caller.

// M2 lib/claims.mjs
export function extractClaims(root, terms)     // -> CLAIMS (declared-first + deterministic scan backstop)
export function matchClaims(oldClaims, newClaims)
  // -> {matched:[{oldId, newId}], added:[claimId], removed:[claimId], split:[…], merged:[…]}   (§4)
  // [AMENDED 2026-07-17 — M14 guessed the element shape wrong first] §3 named the tuple's KEYS and never
  // its ELEMENTS. `matched` carries IDS — `{oldId, newId}`, NOT `{old, new}` — so a consumer must hold
  // both claim lists to compare anything. Naming a container without naming what it contains reads as
  // specified and isn't; same omission as a field whose unit is unstated (§5f).

// M5 lib/coherence.mjs  (EXTEND — additive, backward compatible)
export function claimImpact(root, oldClaims, newClaims, terms, ctx)
  // -> {affected:[claimId], actions:[], silentRisk:[], cycles:[]}
  // [AMENDED 2026-07-16 — M5 implementation exposed two gaps]
  // `ctx` ADDED (optional, additive — breaks no caller). Without it M5 must pass M4 no context, so
  // EVERY `content` move classifies ESCALATE and every `spine` move structural RECHECK. Safe
  // direction, but `actions` is then systematically more alarming than the package deserves — and
  // **§10 decision 2's ask-once rule cannot be honoured from this seam at all**: M7 owns `authorized`
  // and M5 had no parameter to receive it. Alarm fatigue is the failure M10 exists to prevent,
  // arriving one module earlier. M5 must NOT read OVERRIDES itself — that derives authorization in a
  // second place (§5d); M7 owns it and the caller passes it down.
  // `root` is VESTIGIAL: this layer needs no I/O and never did. Kept only for signature stability.
  // It is §5c's worst instance in a mirror — there a parameter made a check that COULDN'T run look
  // implemented; here it makes a pure function look file-dependent, holding a door open for the next
  // author to walk through. Do not "use it since it's there".

// M6 lib/consistency.mjs
export function scanConsistency(claims, terms) // -> [{kind:"value-disagreement"|"definition-drift", claimIds, evidence}]
  // `evidence` is FROZEN as string[] (minItems 1) — matches review_queue.schema.json exactly, so a finding
  // drops into M10's queue without a shape change at the seam.
  // `kind` here is a DETECTOR kind (what was observed). It is NOT the queue kind (what the human is asked).
  // Read `claim.scope`; do NOT re-derive it (see §4).

// M7 lib/overrides.mjs
export function isAuthorizedDivergence(overrides, claimId)  // -> bool  (fidelity checker calls this FIRST)
export function recordOverride(overrides, entry)            // -> OVERRIDES'  (validates: rationale always; justifiedBy iff basis==="cited")
export function needsAsk(overrides, claimId)                // -> bool  (ask-once: false forever after recording)

// M8 lib/immutable.mjs   (wraps lib/verbatim.mjs)
export function immutableRegions(text, sourceText) // -> [{start,end,kind:"quote"|"citation"|"source-span"}]
export function isImmutable(regions, offset)       // -> bool   (RENAME/RE-DERIVE MUST consult this)

// M9 lib/propagate.mjs
export function planPropagation(change, claims, terms, immutableRegionsByFile)
  // -> {mechanical:[{claimId, edit}], derived:[{claimId, reason}]}   uncertainty => derived
export function applyMechanical(plan, root)  // -> receipt {applied:[], summary}   (auto-apply + RECEIPT)

// M10 lib/escalation.mjs
export function buildQueue(findings, claims)   // -> REVIEW_QUEUE (schema) incl. burden{flagsPerArtifact}
  // DETECTOR KIND vs QUEUE KIND (FROZEN — the two vocabularies are different ON PURPOSE):
  //   a DETECTOR kind names WHAT WAS OBSERVED; a QUEUE kind names WHAT THE HUMAN IS ASKED.
  //   The queue kind is part of the dedupe key, so it must be one-per-question: if M6 ("value-disagreement")
  //   and the M11 gate ("internal-inconsistency") both reach the same claim set, that is ONE adjudication and
  //   must merge. Keying on detector kinds would emit two items for one decision = alarm fatigue.
  //   Conversely the detector kind must not be DESTROYED by the fold (that is exactly §5c) — so M10 carries
  //   `detectorKinds[]` (sorted, unioned on merge, NOT in the dedupe key) for diagnostics + per-layer recall,
  //   which is how S-F reports detection PER LAYER.
  // M10 owns the mapping table; detectors never speak queue kinds:
  //   value-disagreement | definition-drift | cross-artifact-mismatch  -> "internal-inconsistency"
  //   dangling-anchor | dangling-spine-ref | dangling-derived-from     -> "dangling-reference"
  //   declaration-refusal                                              -> "declaration-refused"
  //   (extend the table when a detector is added)
  // The last two queue kinds were ADDED 2026-07-17 rather than folding the gate's §5b findings into
  // `internal-inconsistency`: "these two artifacts disagree", "this reference points at nothing", and
  // "your declaration was malformed" are THREE different questions with three different next actions.
  // A gate that must misname its finding to fit an enum is an enum that is wrong — and misnaming here
  // would also silently MERGE them, since the queue kind is the dedupe key.

// M10 also OWNS THE ARTIFACT PATH:
export const REVIEW_QUEUE_PATH  // "metadata/REVIEW_QUEUE.json" — import it, NEVER respell it (§5d).
  // [ADDED 2026-07-17 — M14 found the queue had NO PRODUCER and no constant, so it had to spell the
  // path literally in coherence's EXCLUDE: a second authority created to work around a missing one.]
  // An UNMAPPED detector kind THROWS. It is a contract break, caught by tests at build time; silently folding
  // an unknown kind into a generic bucket would hide it — the same defect as trapping it in prose.

// M12 lib/contract.mjs (EXTEND)
export function declaredProvenanceReport(fileText)
  // -> {declarations:[{type, spineRefs, sourceRefs, termRefs, derivedFrom, anchor}],
  //     refusals:[{index, reason}]}
  // `index` is the entry's DOCUMENT POSITION, and **`index: null` means the document ITSELF** —
  // not-JSON, or no `claims` list. Frozen per M12: §3 named the field without saying what it is when
  // there IS no entry, and dropping document-level failures would have re-opened the very silence
  // this channel closes, one level up (YAML front matter; a broken sidecar). `null` is an answer, and
  // it is the same discipline as `scope: null` — consumers branch on presence, never truthiness.
  //
  // **M11 MUST CALL `artifactDeclarationReport`, NOT THIS.** [M12, accepted] A refusal requires
  // knowing somebody INTENDED to declare, and intent is not always in the text: a `---` fence is
  // intent and is visible here, but a SIDECAR's intent is *the file existing*, which only the caller
  // can see. So `{ not json` in a sidecar is indistinguishable from a paragraph from inside this
  // one-arg signature, and refusing on every un-declared artifact is not an option — a warning that
  // fires on the whole package is one nobody reads, which is alarm fatigue wearing a gate's badge.
  // `artifactDeclarationReport` knows its carrier, so it knows intent, AND it is the only function
  // that applies precedence — a gate reporting refusals from a front matter that LOST to a sidecar
  // would tell an author to fix a file the index never reads.
  // [ADDED 2026-07-16 — M12 exposed the dangling anchor's TWIN: a REFUSED declaration is silent]
  // `declaredProvenance` returns SURVIVORS, so a refusal is reported by ABSENCE — and an absence is
  // indistinguishable from "never declared". The author writes a high-stakes declaration, gets one
  // field wrong, the block falls to the scan, and the WARN they receive names the WRONG PROBLEM
  // ("you did not declare this") for an author who did. The refusal is correct; its SILENCE is the
  // defect. This is the same shape as the dangling anchor (§5b) and as every "looks implemented,
  // isn't" defect this project has found. ONE parse: `declaredProvenance` is a PROJECTION of this.
  // M11 reports `refusals` beside "every declared anchor resolves" — the same question, one step
  // earlier.

export function declaredProvenance(fileText)
  // -> [{type, spineRefs, sourceRefs, termRefs, derivedFrom, anchor}]  — survivors projection of the above
  // [AMENDED 2026-07-16 — M5 found `derivedFrom` HAD NO PRODUCER]
  // `derivedFrom` ADDED for the same reason as `termRefs`. It was defined in claims.schema.json and
  // designed in spec §2.2, and §3 makes it the PRIMARY edge `claimImpact` traverses — but it existed
  // in exactly those places plus M5's consumer and M5's hand-built test fixtures. **NO PACKAGE IN
  // EXISTENCE COULD CARRY ONE.** So the strongest edge in the graph was dead, and looked implemented.
  // §5c in its most expensive costume yet: not a producer carrying more structure than the field can
  // hold, but **a field with NO PRODUCER AT ALL, sitting in a consumer's contract.**
  // It is DECLARED-ONLY and must never be inferred: derivation is an AUTHORED assertion. Inferring it
  // from prose, anchor adjacency, or "the answer key sits under the question" would fabricate an
  // authored dependency — the §1 no-guessed-spineRef rule wearing a third hat. A guess here is worse
  // than co-mention, which reaches the same claim while honestly saying WHY (`via: ["shared-term"]`).
  // [AMENDED 2026-07-16 — M2 exposed two gaps]
  // `termRefs` ADDED: a declaration that cannot name its terms forces the consumer to re-resolve
  // them, which is §5d (the fact would be derived twice and could disagree).
  // `text` deliberately NOT added: the prose lives in the file at `locations[].offset`, and storing
  // it a second time in the declaration is a licence for the two to disagree — M2 tried exactly that
  // tolerance and removed it, because a quotation could sit at the offset while the declared text
  // looked rewritable, i.e. the failure `offset` exists to prevent, delivered by the field meant to
  // prevent it. One fact, one home.
  // M2 MUST CONSUME THIS rather than parse declarations itself — otherwise the declaration grammar
  // is implemented twice (§5d again, and the unit table is the cautionary tale).
  // A DANGLING declared anchor (names a location that does not exist) is M11's to flag, beside
  // §5b's "spineRef target exists" — silently yielding no claim is the fabrication-adjacent failure:
  // the declaration LOOKS honoured and nothing was indexed.
```

---

## 4. Claim identity (the hardest edge case — FROZEN rule)

### 4a. Claim SCOPE — derived ONCE by M2, never re-derived  [ADDED 2026-07-16 — M6 exposed a divergence]
`scope` selects which term an ambiguous label resolves to (M1's chapter-local homograph rule), so it decides
what a claim is **about**. M6 derived it from `spineRefs`; M3 was about to derive it from `locations[0].file`.
Two derivations of one fact = two modules silently disagreeing about a claim's subject — the exact defect
class this index exists to catch, reproduced inside the index itself. Therefore:
- `claim.scope` is a **required** field of `claims.schema.json` (`string | null`; null = package-wide).
- **M2 derives it once, at extraction.** Every other module **READS** it and **MUST NOT** re-derive:
  1. first `spineRefs` entry matching `^(concept|objective)\.(?<scope>[^.]+)\.` → that scope (authoritative:
     the spine is the instructor's own structure);
  2. else `locations[0].file` under `concepts/<slug>.md` or a chapter artifact → `<slug>`;
  3. else `null`.
- A claim whose locations span chapters keeps the **spine's** scope — the spine outranks file placement.

Match old↔new by **(spineRef + file-qualified anchor + `identityLabel`)** — **never by `content`** (content
changing is the whole point), and **never by M3's `label` fingerprint** (§4b). Consequences:
- rephrase → same id (format fp moves only)
- value change → **same id** (content fp moves; the claim is still "the melting point of water")
- rename → same id (M3's label fp moves; `identityLabel` and spineRef+anchor hold)
- unmatched new = **added**; unmatched old = **removed**; report both (splits/merges surface as add+remove pairs
  with a shared spineRef — flag as `split`/`merged`, do not silently drop).

### 4b. `identityLabel` ≠ M3's `label` fingerprint  [ADDED 2026-07-16 — M2 exposed a self-contradiction in §4]
As originally frozen, §2 and §4 were **jointly unsatisfiable**, and §4 violated its own rename rule with its own
key. M3's `label` fingerprint hashes `termId + preferredLabel` and therefore **moves on rename BY DESIGN** (§5 —
that is what makes RENAME detectable at all, and hashing ids alone was dead code). So if the identity key were
that fingerprint, a rename would move the key → no match → add+remove → the id changes, contradicting §4's
"rename → same id" row directly. The line "rename → same id (label fp moves, but spineRef+anchor hold)" states
the contradiction out loud: a key component that moves on the operation the key must survive.

**Resolution — the two are different values with opposite requirements over the same projection:**
| | needs | value |
|---|---|---|
| `identityLabel` (§2/§4, M2) | rename-**INVARIANT** — an id must survive the rename | hash of **sorted term ids** |
| `label` fingerprint (§5, M3) | rename-**VARIANT** — a rename must be *observable* | hash of **termId + preferredLabel** |

**The general lesson, worth more than the instance: an IDENTITY KEY and a CHANGE SIGNAL have opposite
requirements over the same projection, so they can never be the same value.** M3 was right to reject ids-alone for
its layer; M2 is right to use exactly that for its key. Both are correct; the freeze conflated them. Whenever a
projection is used for both "is this the same thing?" and "did this thing change?", it must be computed twice, on
purpose, under two names — and a comment must say why, or someone will dutifully DRY them back together.

## 5. Fingerprint rules (FROZEN)  [AMENDED 2026-07-16 — M3 implementation exposed 3 contradictions]
- `format` — **the WORDING layer**: hashed blind to whitespace/markup, so it moves on a *rephrase* and NOT on
  whitespace. (The original wording — "strip whitespace noise" AND "moves on cosmetic edits" — was
  self-contradictory if whitespace is cosmetic. Resolved via the §5 taxonomy table, which puts
  *meaning-preserving rephrase* in the format-only→NONE row.) Consequence, and it's the cleanest possible
  statement of the product's #1 requirement: **a pure whitespace edit moves NO fingerprint at all** — zero flags.
  `format`-only-moved therefore means exactly "rephrase" → NONE.
- `label` — hash of, per ref, **`termId` + `preferredLabel`** (sorted). **NOT ids alone**: M1 deliberately never
  re-mints an id on rename (that is *how* claim identity survives §4), so a hash over ids alone would be
  CONSTANT ACROSS EVERY RENAME — `label` would be dead code and §4's rename row unreachable, silently killing
  the whole terminology-migration (IUPAC) case. The id keeps the layer immune to value changes; the
  preferredLabel makes a rename observable. Moves on rename; **not** on a value change.
- `content` — hash of the normalized semantic core: terms→ids, quantities normalized with units, **modality,
  negation and quantifiers PRESERVED** (`may cause` → `causes` **MUST** move this; `100 °C` → `90 °C` **MUST**
  move this; whitespace/reflow/rephrase **MUST NOT**).
- `spine` — hash of sorted `spineRefs`.
- `provenance` — hash of sorted `sourceRefs` + any override id.

## 5b. Ownership of cross-cutting validations (assigned — do not leave orphaned)
| Check | Owner | Why it can't live elsewhere |
|---|---|---|
| **spineRef target exists** (`[concept.crispr.5]` parses fine whether or not concept 5 exists) | **M11 gate** (may share code with M5 orphan analysis) | M1 has only the term side; validating term→spine needs BOTH node sets. **A typo'd bracket becomes a dangling link that LOOKS authorized** — the same fabrication risk the absent-spineRef rule exists to prevent, wearing a badge. Dangling spineRef ⇒ flag. |
| **claim.spineRefs target exists** | **M11 gate** | same reason; orphan analysis must distinguish "no parent" from "parent that doesn't exist". |
| **declared anchor resolves** (a declaration naming a block that doesn't exist) | **M11 gate** | M12 parses the declaration but cannot see the artifact's blocks; M2 mints them. Silently yielding no claim means the declaration LOOKS honoured and nothing was indexed. **M2 must EXPORT its anchor set** — if M11 re-derives it, that is two block parsers answering "does this anchor exist" (§5d). |
| **declaration refusals** (`declaredProvenanceReport().refusals`) | **M11 gate** | M12 refuses correctly but reports by absence; only the gate can tell the author "your declaration was malformed" instead of "you didn't declare". |
| **`derivedFrom` target exists** | **M11 gate** | M5 correctly mints no edge for a dangling ref (inventing a ghost node would be worse), so the dependency the author asserted vanishes SILENTLY. Same family as the three rows above: it looks honoured and isn't. |

## 5c. A recurring defect to watch for: STRUCTURED INFO TRAPPED IN PROSE
Four modules independently hit the same failure during implementation, so it is called out as a standing rule:
- **M4**: the RECHECK→ESCALATE *sequence* had nowhere to go but the `reason` string → fixed with a structured `followUp`.
- **M1**: `spineRef` had no slot in the Key-terms grammar → fixed with an explicit `[concept.x]` bracket (and a
  refusal to infer it, which is the honest alternative).
- **M10**: a value-disagreement's other participants had nowhere to go but the `evidence` prose → fixed by
  replacing `claimId` with a sorted **`claimIds[]`**.

- **M6/M10**: M6's detector kinds (`value-disagreement`/`definition-drift`) had no field in REVIEW_QUEUE's enum
  → folding them into the generic `internal-inconsistency` destroyed the observation → fixed with
  `detectorKinds[]`, carried alongside the decision-level `kind`.
- **M10/M14**: `metadata/REVIEW_QUEUE.json` **has no producer.** `buildQueue` returns the object; *nothing writes
  it*. The path exists only in the schema's title and in doc prose — so M14, needing it in coherence's `EXCLUDE`,
  had no module constant to import and had to **spell the path literally**, creating a second authority. Third
  instance of the no-producer family (`derivedFrom`, the spine namespace, now an artifact), and the first at
  **artifact scale**: a file the design treats as an output that no code emits.
- **M8/M9**: M8 produces immutable regions as **file offsets**, but `claims.schema.json`'s `locations[]` held only
  `{file, anchor}` — so `planPropagation`, handed `immutableRegionsByFile`, had nothing to compare against and the
  plan-time quotation guard could not run at all. Fixed with `locations[].offset`, set by M2. **The most dangerous
  instance so far**: the unheld fact was the one preventing a rename from silently editing the inside of a direct
  quotation — i.e. fabricating a quotation — and the parameter's presence in the signature made the check *look*
  implemented.

**The rule:** if a downstream module would have to *parse prose* to get a fact, that prose has silently become a
load-bearing API that no test protects — and any rewording breaks it. Give the fact a field. Keep the prose for
the human reading a receipt. (`evidence` and `reason` stay prose *on purpose*: they are for the instructor.)

**The check — apply it AT FREEZE TIME, before any consumer exists** (M10's formulation, promoted here because it
is mechanical and needs no downstream code to reveal the defect):

> For each field in a frozen artifact, does any **producer's signature** carry more structure than that field
> can hold?

All four instances above fail it identically — a plural/structured producer meeting a singular/string field —
and every one was visible in *this file*, at the seam, with nothing built yet. Run it against §3 whenever a
signature or schema changes. Corollary: when the fold is *deliberate* (many observations → one decision, as with
queue `kind`), the fold is correct but the collapsed detail still needs its own field; "it's in the prose" is not
a field.

### 5e. A third freeze-time check: IS ONE VALUE SERVING AS BOTH AN IDENTITY KEY AND A CHANGE SIGNAL?
If so it is two values, and freezing them as one makes the spec self-contradictory (§4b: §4's key violated §4's
own rename rule). Ask of every projection: is it used to answer *"is this the same thing?"* AND *"did this thing
change?"* Those demand invariance and variance respectively over the same input. Compute both, name both,
comment why — otherwise a later tidy-up DRYs them back together and silently breaks whichever one loses.

### 5f. A fourth freeze-time check: DOES THIS FIELD NAME ONE UNIT, OR OFFER A CHOICE?
`locations[].offset` was frozen as *"Byte/char offset"* — which is not a unit, it is an **offer of two**. Two
modules can each read that sentence correctly and still disagree, and the drift is one position per non-ASCII
character upstream: invisible in ASCII fixtures, guaranteed in a chemistry package. M8's unit is the **JS string
index (UTF-16 code units)**; a byte offset does not fail loudly, it lands one character *inside* a quotation —
the exact fabrication case. Name the unit, name the module that defines it, and say what it is NOT. A consumer
should also **verify** the unit where it can (`text.slice(offset, offset + s.length) === s`) and refuse on
mismatch, so a mis-minted offset fails loudly instead of editing one character off.

### 5d. A second freeze-time check: IS THIS FACT DERIVED IN MORE THAN ONE PLACE?
`scope` was independently derived by M6 (from `spineRefs`) and M3 (from `locations[0].file`) — both defensible,
which is precisely the danger: two modules silently disagreeing about what a claim is ABOUT, i.e. this index
reproducing the defect class it exists to catch. **Convergent need across two modules means the fact belongs to
the DATA, not to either consumer**: derive once at the producer, store it, and have consumers READ it. When the
stored value is nullable, consumers must branch on *presence* (`'scope' in claim`), never on truthiness — `null`
is an answer, and `??` would silently re-derive it.

**How to TEST a §5d fix — M12's pattern, promoted, because it is the only test that works.** After deleting a
duplicated implementation, assert **mechanically that it is gone**: grep the consumer's own source for the second
implementation's signature (a `JSON.parse`, the fence regex, a copied enum) and fail if it comes back. Behavior
tests **cannot** see a duplicate that *currently agrees* — and "currently agrees" is the entire lifespan of every
duplicate, right up until the day it doesn't. The unit table passed every behavior test in the suite while drifted
three ways, minting a blind spot that made the package report zero flags it had not earned. **A §5d fix defended
only by behavior tests is a §5d fix with a timer on it.**

## 6. Non-negotiables for every module
1. **Pure/deterministic** (M3–M6, M4): same input → same output. No LLM, no network, no clock in the index path.
2. **Backward compatible:** `metadata/COMPONENT_INDEX.json` untouched; new files additive; a package with no
   `CLAIMS.json` degrades to today's behavior.
3. **Never touch** the study clone (`…/manuscript-ai-oer-authoring/workspace/tools/orz-coursewerk`).
4. **Do not push.** Commit on `feat/semantic-index` only.
5. Tests are `node --test`, free, deterministic, no network. Fixture: `tests/fixtures/mini-package/`.
