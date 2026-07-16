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
| `## Prerequisites` | unordered list | incoming prereq edges |
| `## Objectives` | **ordered** list | `objective.<chapter-slug>.<n>` |
| `## Concept sequence` | **ordered** list | `concept.<chapter-slug>.<n>` + intra-chapter order = prereq chain |
| `## Key terms` **(NEW — required by M12)** | unordered list | `term.<slug>` (see grammar below) |
| `## Misconceptions to surface` | unordered list | `misconception.<chapter-slug>.<n>` — **negative claims** |

### `concepts/course.md`
`# Course Concept Map — <Title>`; `## Organizing question`; `## Summary`;
`## Concept sequence` → `concept.course.<n>`; `## Chapter sequence` → inter-chapter order;
`## Key terms` (optional) → course-wide vocabulary.

### `## Key terms` grammar (plain markdown, tolerant)
```
- **<preferredLabel>** (<alias>, <alias>) — <gloss>
- **PAM** (protospacer adjacent motif) — the motif adjacent to the target
- **ethene** (aliases: ethylene) — the IUPAC-preferred name
- **Cas9**
```
Rules: bold run = `preferredLabel` (required). Optional parenthetical = aliases (an `aliases:` prefix is
accepted and stripped). Optional `—`/`--` gloss. Everything else ignored. A term listed here is
`status:"confirmed"` (instructor-authorized **because it is in the map**).

**Why a new section:** concepts are written as *sentences* ("Foreign nucleic acid supplies a protospacer
candidate"), so term extraction from prose alone would be heuristic guessing. `## Key terms` makes the
vocabulary explicit, human-authored, and deterministically parseable — and it *is* the Q3 authority.

---

## 2. Stable id schemes (FROZEN)
| Kind | Scheme |
|---|---|
| term | `term.<slug(preferredLabel)>` |
| concept | `concept.<chapter-slug>.<n>` · course: `concept.course.<n>` |
| objective | `objective.<chapter-slug>.<n>` |
| misconception | `misconception.<chapter-slug>.<n>` |
| claim | `claim.<slug(spineRef)>.<shortHash(anchor + label-fp)>` — see §4 |

Use existing `lib/slug.mjs` for slugging. Ids are **stable across rephrase and rename** (§4).

---

## 3. Module signatures (FROZEN)

```js
// M1 lib/terms.mjs
export function buildTerms(conceptMaps)        // [{file, text, scope}] -> TERMS (schema: terms.schema.json)
export function resolve(terms, label, scope)   // -> termId | null   (alias-aware, scope-aware, case-insensitive)
export function addCandidate(terms, label, scope) // -> TERMS' (status:"candidate")
export function setPreferred(terms, termId, newLabel) // -> TERMS' (RENAME = add-alias + set-preferred; old label NEVER deleted)

// M3 lib/fingerprint.mjs   (PURE — no LLM, no I/O)
export function fingerprints(claim, terms)     // -> {format,label,content,spine,provenance}  (hex strings)
export function normalizeContent(text, terms)  // -> canonical string (terms->ids, numbers+units normalized,
                                               //    modality/negation/quantifiers PRESERVED)

// M4 lib/classify.mjs      (PURE)
export function classify(oldFp, newFp, ctx)    // ctx: {authorized:bool, spineChange:"additive"|"structural"|null}
                                               // -> {action, layer, reason}
                                               // action ∈ NONE|RENAME|RE-DERIVE|REGENERATE|RECHECK|ESCALATE|ANNOTATE

// M2 lib/claims.mjs
export function extractClaims(root, terms)     // -> CLAIMS (declared-first + deterministic scan backstop)
export function matchClaims(oldClaims, newClaims) // -> {matched, added, removed, split, merged}  (§4)

// M5 lib/coherence.mjs  (EXTEND — additive, backward compatible)
export function claimImpact(root, oldClaims, newClaims, terms) // -> {affected:[claimId], actions:[], silentRisk:[], cycles:[]}

// M6 lib/consistency.mjs
export function scanConsistency(claims, terms) // -> [{kind:"value-disagreement"|"definition-drift", claimIds, evidence}]

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

// M12 lib/contract.mjs (EXTEND)
export function declaredProvenance(fileText)   // -> [{type, spineRefs, sourceRefs, anchor}] from front-matter/sidecar
```

---

## 4. Claim identity (the hardest edge case — FROZEN rule)
Match old↔new by **(spineRef + location anchor + `label` fingerprint)** — **never by `content`** (content
changing is the whole point). Consequences:
- rephrase → same id (format fp moves only)
- value change → **same id** (content fp moves; the claim is still "the melting point of water")
- rename → same id (label fp moves, but spineRef+anchor hold)
- unmatched new = **added**; unmatched old = **removed**; report both (splits/merges surface as add+remove pairs
  with a shared spineRef — flag as `split`/`merged`, do not silently drop).

## 5. Fingerprint rules (FROZEN)
- `format` — hash after stripping whitespace/markup noise. Moves on cosmetic edits **only**.
- `label` — sorted set of resolved `termRefs`. Moves on rename; **not** on a value change.
- `content` — hash of the normalized semantic core: terms→ids, quantities normalized with units, **modality,
  negation and quantifiers PRESERVED** (`may cause` → `causes` **MUST** move this; `100 °C` → `90 °C` **MUST**
  move this; whitespace/reflow/rephrase **MUST NOT**).
- `spine` — hash of sorted `spineRefs`.
- `provenance` — hash of sorted `sourceRefs` + any override id.

## 6. Non-negotiables for every module
1. **Pure/deterministic** (M3–M6, M4): same input → same output. No LLM, no network, no clock in the index path.
2. **Backward compatible:** `metadata/COMPONENT_INDEX.json` untouched; new files additive; a package with no
   `CLAIMS.json` degrades to today's behavior.
3. **Never touch** the study clone (`…/manuscript-ai-oer-authoring/workspace/tools/orz-coursewerk`).
4. **Do not push.** Commit on `feat/semantic-index` only.
5. Tests are `node --test`, free, deterministic, no network. Fixture: `tests/fixtures/mini-package/`.
