# Coursewerk — the pipeline

The stages the executor agent follows to turn source materials into a complete **Alembic package** —
authored with the orz-markdown family, shipped lean, ready to upload. **Pause at each ⏸ gate for the
user to review and steer** before continuing. Record progress in `.coursewerk/progress.md` so you
can resume.

**Where things live** (created by `bootstrap/init.sh`):
- `inputs/` — the user's source materials.
- `package/` — the **Alembic package** you build (lean `.md` sources; the source of truth; this ships).
- `preview/` — framework carriers you build for local reading/QA (regenerable; **never shipped**).
- `reports/` — the QA report, evaluation, and delivery note (**outside** the package; never shipped).
- `dist/` — the packed `.zip`.

`package/` and `personal/` are automatically initialized as independent Git repositories. On every resumed run,
inspect their status/diff before writing. Preserve direct user edits, then use the component index to calculate
the full consistency impact; a clean Git tree alone does not mean the package is coherent.

**Mode matters** (set in §0.5 of `CLAUDE.md`):
- **Full** — cross-critique each authoring stage with a second engine before moving on.
- **Light** (single $20-tier engine) — no broad cross-model critique; verify mechanical requirements with the
  QA gate and one quick self-review, but always run a separate same-model independent pass on accountable
  identity, source/version, license evidence, external-media rights, attribution/output-license compatibility,
  and scientific key facts. **Build only ~3 chapters per session, checkpoint, and stop** to respect the
  subscription's daily/5-hour limits (resume another day). Stop immediately on any rate-limit error.

**Intended use matters independently of mode.** Before authoring, select `personal-private`,
`restricted-teaching`, or `public-oer` and follow `docs/assurance-kernel.md`. Full/Light changes critique cost;
it never changes the assurance kernel.

## Stage 0 — Intended use + foundation ⏸

Ask who will receive the materials, how access is controlled, whether redistribution/publication is possible,
the applicable jurisdiction/institution when an exception is asserted, and the rights basis for every primary
source. Create `metadata/FOUNDATION.json` and `metadata/PROVENANCE.json` from the templates. Non-published private
or restricted authoring may use any source without a rights receipt; record its identity and provenance, retain
warnings, and do not claim that publication has been cleared. For public authoring, perform these steps in order:

1. Identify the authoritative publisher rights page and record its URL/type/date.
2. Run `npm run capture:rights -- --root <package-or-personal> --source-id <id> --operator-name <name> --operator-type <automation|human> --contact <email-or-project-url>`. This deterministic
   helper saves and hashes the evidence, records retrieval/operator metadata, checks known-source expectations,
   scans and separately records AI/automated-use notices without treating them as copyright-license terms, and emits
   a hash-bound pre-ingestion receipt. It exits nonzero unless that receipt is cleared.
3. If blocked, stop public-source ingestion and inspect the stated reason: missing/stale evidence, a verified
   license or attribution conflict, or another foundation failure.
   Coursewerk records separate access/use notices but does not decide that they modify a CC license or establish
   a copyright prohibition. The instructor makes the publication decision after reviewing warnings.
4. Run `node scripts/check_assurance.mjs --root package --phase pre-ingestion` for public work. Only after every
   public-source receipt remains cleared may public source preparation begin. `prepare:source` independently re-verifies the receipt,
   current source record, evidence hash, and known-source policy before reading the supplied source. Automatic entries must bind the raw
   snapshot, raw hash, canonical URL, retrieval time, extractor metadata, extracted text, and text hash. The
   scaffold `inputs/README.md` never counts as source evidence.
   Source preparation also writes `metadata/SOURCE_RECORD.json`, a compact exact mirror of the public revision,
   retrieval, extractor, and digest facts that must ship with the package (regenerate it from the corpus manifest
   at any time with `npm run generate:source-record -- --root package --inputs inputs`; the gate refuses a
   record that does not match `inputs/SOURCE_CORPUS.json`). Wikipedia preparation rejects two
   declarations that resolve to the same page ID, revision ID, or extracted text.

- Personal/restricted work lives under `personal/`, has no open output license, and is never packed for Alembic.
- Public OER lives under `package/`; verify the exact source license from authoritative evidence before writing
  the manifest. Required source attribution and compatible output licensing are release-blocking.
- Provenance is mandatory in every profile. Unknown/incomplete/private-only items must be visibly labelled and
  remain future-publication blockers.

Run `node scripts/check_assurance.mjs --root personal --phase authoring` for private/restricted work. Gate: confirm the recorded
use condition and foundation facts before authoring.

For future chapter-sized public science trials, use a multi-page English Wikipedia corpus. Prefer not to use
OpenStax to reduce avoidable disputes, but treat that as advice rather than a restriction. Follow `docs/wikipedia-science-topic.md`: one anchor article,
three to seven supporting pages, serial Wikimedia API retrieval, and approximately 6,000–25,000 extracted words.

## Stage 1 — Scope + manifest ⏸
Read `inputs/` + the user's brief. Identify the **course**, the **source of truth** (a named OPEN
textbook — fetch its chapter/section structure + learning objectives from the publisher, or read a
PDF in `inputs/` — or the user's own materials), the **scope** (chapters to keep/merge/skip), the
**audience/pedagogy**, and—on the `public-oer` path—the verified compatible **output license**. Private and
restricted work stays in `personal/` and does not create an Alembic manifest. Assign each public chapter a
**slug** (lowercase, hyphen-joined, from its title).

Write **`package/alembic.json`** (the manifest — see `format-contracts/deliverables.md`): schemaVersion
`2`, a placeholder `packageId`, `title`, `license`, `description`, `keywords`, `discipline`,
`courseContext` (courseName/level/instructor/courseNumber/department as known), `unitTerm`, the ordered
`chapters` list of `{slug, title}`, and `createdAt` (ISO ending in `Z`). Write **`package/LICENSE`**
(full text matching the license) and a short **`package/README.md`** landing note. **Gate: confirm
scope, chapter slugs, and the manifest.**

## Stage 2 — Course concept map ⏸
Write `<root>/concepts/course.md` (`root=package` for public OER; `root=personal` otherwise): the course-wide
concept map, **plain Markdown (no graphics)**, following **`format-contracts/deliverables.md` §Concept maps
EXACTLY** — that section is the authority for every heading, and this stage deliberately does not restate it
(two authorities on one artifact drift, and this one already did).

**This file is the SPINE, not a summary.** It is the instructor's decision about what is taught, to what depth,
and in what order. Every other deliverable is derived FROM it, and the semantic index resolves every term
through it. Its `## Concept sequence`, `## Objectives`, `## Key terms`, `## Misconceptions to surface` and
`## Chapter sequence` are what Stage 5's gate reads. **A map missing them does not fail loudly — it silently
indexes nothing**, and the package earns a clean bill of health from a blind spot.

**The concept map is CO-CREATED.** The instructor supplies raw, messy intent — a syllabus dump, a topic list,
last year's outline, a paragraph. **You standardize it into the canonical format; the instructor reviews and
corrects.** That review is where their authority lands, so optimize for a human to eyeball and fix.
- **A bare keyword dump (`adaptation; CRISPR array; spacer; …`) is an INPUT, not a section.** Promote each into
  `## Key terms` with its preferred label, aliases and gloss. **Do NOT emit a `## Keywords` section** — two
  vocabulary lists in one document are the same fact in two places; they drift, and nothing says which is the
  authority. Aliases are also what make a later **rename** detectable, so a keyword dump silently costs the
  instructor the ability to migrate terminology.
- **NEVER invent spine content.** Standardizing means restructuring what the instructor SAID — never adding a
  concept, objective, or misconception they did not. A fabricated node puts words in their mouth about their own
  course, and every downstream check then enforces it as authoritative. When the input does not say: fewer
  entries, and **ask**.

**Gate: confirm the logic backbone.**

## Stage 3 — Per-chapter build (loop over the manifest's chapters)
For each chapter `<slug>`, produce the **five deliverables** under the selected root (the `package/` paths below
become `personal/` for private/restricted work). Honor `format-contracts/deliverables.md`
and `skills/courseguide-standards` exactly):
1. `package/concepts/<slug>.md` — chapter concept map, **plain Markdown, no graphics**. **THE CHAPTER'S SPINE
   — follow `format-contracts/deliverables.md` §Concept maps EXACTLY** for the required sections
   (`## Objectives`, `## Concept sequence`, `## Key terms`, `## Misconceptions to surface`,
   `## Prerequisites`). The same rules as Stage 2 apply and are not optional here: **no `## Keywords`
   section** (promote keywords into `## Key terms` with aliases + gloss), and **never invent a concept,
   objective, or misconception the instructor did not state** — fewer entries, and ask. Readable raw.
2. `package/study-guide/<slug>.md` — the **study guide**, rich **orz-markdown**: opens with objectives;
   explains along the concept-map logic; worked **example questions** (container tabs); figures via
   `oer-figures` (RDKit structures, matplotlib charts with real values, openly-licensed images, or the
   source textbook's own figures if its license permits) saved to `package/assets/` and recorded in structured
   `PROVENANCE.json` plus public `ATTRIBUTION.md`. Each `## H2` section may carry a stable block id
   `{{attrs[#blk-…]}}`. Follow `courseguide-standards`.
   Every verified external media item marked cleared must also retain authoritative description/license-page
   evidence. Run `npm run capture:media -- --root package --item-id <id> --operator-name <name>
   --operator-type <automation|human> [--file <saved-description-page>]`; a URL and claimed license alone are
   insufficient for release.
3. `package/slides/<slug>.md` — the **slide deck source** in **orz-slides deck grammar** (follow
   `skills/orz-slides`): a `<!-- deck … -->` frontmatter block, slides separated by `<!-- slide -->`
   markers, `## H2` slide titles, layout splits (`2col`/`main-side`) for compare, `template=title`/`section`/
   `closing`. **One concept per slide, never crowded**, same logic flow as the study guide; **reuse only the
   study guide's `../assets/` figures**, sized legible-not-dominating.
4. `package/assessment-support/<slug>.md` — the **assessment guide**, **plain Markdown, no graphics**:
   per learning objective, *how to design* questions/activities with cognitive level — guidance, **not a
   question bank**. Several parameterized question guides per objective.
5. `package/practice/<slug>.md` — a **practice question sheet**: ~15 concrete questions instantiated
   from the assessment guide, covering all major objectives, each Q + worked answer in container tabs;
   correct, work shown.

Worked solutions belonging to the explicitly public practice sheet remain in `practice/`. Put **summative exam
keys, instructor-only solution sets, unreleased questions, and teaching notes** in `package/private/…` (never in
a public folder). **Optional collection documents** — an exam, quiz, syllabus, or handout — are authored with
**orz-paged** (`skills/orz-paged`): exams/answer keys go under `private/`, a syllabus or handout is
student-facing under an Alembic-supported public path. Declare every collection source and carrier type in
`metadata/DOCUMENTS.json`. Follow the cross-cutting quality rules in **`docs/authoring-guidelines.md`** throughout
(graphics ladder, semantic formatting, accessibility, coherence).

**Make it vivid (rule).** A study guide is not a wall of text and slides are not a bullet dump.
- **Figures:** every section that benefits gets a *meaningful, visible* figure — a generated structure
  (`{{smiles}}` for a single one, `oer-figures` RDKit for a grid/scheme), a real data plot (matplotlib or
  `{{chart}}`), a clear diagram (`{{mermaid}}` or a hand-authored SVG), **and — do NOT be conservative here —
  open-licensed REAL images** (photos of the actual substances, apparatus, or phenomena) fetched from
  Wikimedia Commons / Openverse / NASA / NOAA with `oer-figures` `fetch_open_image.py`. A chapter of only
  self-generated diagrams is too dry: pull in real photographs (an element sample, a lab instrument, a
  reaction) where a real image beats a diagram — resize to a web-friendly width and attribute it. Save asset
  files to `package/assets/`, record every one in structured `metadata/PROVENANCE.json` and public
  `metadata/ATTRIBUTION.md`. Inline `{{smiles}}`/`{{chart}}`/
  `{{mermaid}}` supplement figures; they do **not** replace them. Aim for **several figures per chapter,
  including at least one or two fetched real photos**, not zero, unless `metadata/MEDIA_PLAN.json` records a
  substantive reviewed reason that a photograph would not improve the chapter. (See `skills/oer-figures` +
  `docs/authoring-guidelines.md` §1.) Every Mermaid or chart block must also have a nearby visible
  `**Visual description:**` or `**Data summary:**`; runtime rendering is enhancement, not the only route to its
  instructional meaning.
- **Everyday-life examples:** connect each concept to a **relatable real-world example or analogy** (a scuba
  tank, a weather balloon, cooking, a car battery) so it is concrete and memorable.
- **Rich slide layouts:** slides use the full orz-slides vocabulary — `2col`/`3col`/`main-side`/`quad`
  splits, `@region` markers, floats, `template=` variants, step reveals — and orz-markdown plugins (callout
  boxes, badges, colored text, highlight, `{{chart}}`, `{{smiles}}`, figures). **Do not default to a title +
  bullet list; vary the layout across slides.** (See `skills/orz-slides`.)

**Verify the orz-markdown as you go (mandatory step).** After authoring each chapter's rich deliverables
(study guide, slides, practice), run **`node scripts/build_carriers.mjs --root <root> --out preview`** (every carrier must build,
`failed: 0`) and run `node scripts/check_oer.mjs --package package` for public work or
`node scripts/check_assurance.mjs --root personal --phase authoring` for private/restricted work. The public orz-syntax check must be **0** — it
verifies container **nesting**, not just balance, so a mis-nested `tabs`/`cols`/callout is caught). Open the
built carrier in `preview/` and eyeball it — a container that renders wrong will not throw, so *look*. Never
move on with a nonzero orz-syntax count or a build failure. Never edit the carriers; they are throwaway.

**Quality per mode:** in **Full** mode, cross-critique each chapter with a second engine — keep the
critique **focused on HIGHER-LEVEL quality** (scientific/conceptual correctness vs the source,
pedagogical soundness, coherence across the five deliverables, objective coverage); do **not** re-check
script-detectable mechanical issues (format contracts, orz-syntax, links, attribution) — those are the QA
gate's job. Then self-check against `courseguide-standards` and run an editorial pass for spelling, grammar,
clarity, terminology, tone, and repetition. The editorial pass is agent review, not a deterministic QA claim.
In **Light** mode, skip broad cross-model critique — run `node scripts/check_oer.mjs --package package` after
each chapter (or batch) and fix what it flags, plus one quick higher-level and editorial self-check. The final
focused same-model key-fact/license critique in Stage 4 is still mandatory. **Light-mode pacing:** after ~3 chapters, checkpoint
`.coursewerk/progress.md` and **stop** — tell the user which chapter to resume from next session. Stop
at once if an engine returns a rate-limit/quota error.

## Stage 4 — Assemble ⏸
Complete structured `package/metadata/PROVENANCE.json`, mirror cleared public entries into
`package/metadata/ATTRIBUTION.md` by running `npm run generate:attribution`, and finish `package/README.md`. Confirm
`package/LICENSE` matches the manifest. Do a self-pass on the two-repo invariant: nothing instructor-only
sits in a public folder. Perform a whole-package editorial and design-system pass: compare chapter outlines,
heading hierarchy, objective wording, terminology, notation, semantic formatting, figure treatment, slide
structure, assessment labels, and spelling/grammar. Resolve accidental drift before accepting the baseline.

Complete the mode-independent release reviews before indexing the accepted baseline:

1. **Assemble the blind bundle first, and hand the reviewer ONLY that.** The critique's power is
   independence — a reviewer blind to how the result was produced, judging only the result against the
   criteria — and the review is BOUND to the exact surface a blind reviewer receives (the gate cannot observe
   the reviewer's isolation; it can refuse a review that names no bundle, or another package's):

   ```bash
   npm run review:blind-bundle          # writes reports/blind-bundle/{bundle.md,bundle.json,MANIFEST.json}
   ```

   `bundle.md` carries the criteria, the declared sources projected to identity + rights facts, the
   license/attribution/source record, and every deliverable verbatim — and nothing else: no generation
   log, no prior verdicts, no authoring disclosure (those are listed as *withheld* in the manifest). Its
   header prints `bundleSha256`. Give the fresh reviewer that file and nothing from your own context.
2. Draft `package/metadata/KEY_FACT_REVIEW.json` from `templates/key-fact-review.example.json`. In Light mode,
   the reviewer is a fresh, context-separated same-model pass (a new subagent/session given only `bundle.md`);
   use `mode: light` plus `reviewKind: same-model-independent-pass`. In Full mode, use the different
   reviewer/model and record `mode: full` plus `reviewKind: cross-model`. Examine every required check and trace
   representative chapter-level scientific facts to declared source IDs and every listed use. Light mode must
   record matching exact author/reviewer model IDs; Full must record different exact model IDs. Describe that
   separation and copy the bundle's `bundleSha256` into `independence.bundleSha256`; every declared chapter needs
   at least one key fact traced to its study guide. Then bind and validate it:

   ```bash
   npm run bind:key-fact-review -- --root package --bundle-sha256 <bundleSha256>
   ```

   Do not pre-fill “passed” mechanically; the review notes are evidence of an actual critique. Any later change
   to foundation, provenance, source record, or a teaching deliverable makes the binding stale, and changes the
   bundle digest — so the fix path is always *re-assemble → re-review → re-bind*, never re-bind alone. The gate
   refuses a review that names no bundle digest or names a different package's.
3. Build all carriers with a receipt, open every carrier in a browser, inspect visible rendering and DOM behavior
   including runtime diagrams, local images, layout, interaction, overflow, and readable alternatives, then let
   the identified human record the attestation:

   ```bash
   node scripts/build_carriers.mjs --root package --out preview --receipt reports/carriers.json
   npm run attest:visual-review -- --root package --receipt reports/carriers.json \
     --reviewer "<human name>" --reviewed-at YYYY-MM-DD \
     --attestation "<what was inspected and confirmed>"
   ```

   The record binds source and local-asset hashes plus a stable carrier fingerprint. Never have an agent invent
   the human name or attestation. Rebuild/review after a meaningful source, asset, or carrier change.

After the first complete cross-deliverable coherence pass, index the accepted baseline — **both indexes,
in this order, and both AFTER your last edit**:

```bash
node scripts/index_components.mjs --root package --initialize   # file-level: what depends on what
npm run index:semantic -- --root package                        # claim-level: the SPINE/TERMS/CLAIMS baseline
```

Use `personal` for private/restricted work.

**ORDER IS LOAD-BEARING: edit, THEN index. Never index and then edit.** Both indexes record the bytes they
read. Indexing before your last edit records a baseline of text that no longer exists, and the gate then
reports a staleness failure that is *correct* — the index genuinely did not read those bytes. The same rule
governs `bind:key-fact-review` above: **fix first, bind last.** A review certifies what it read.

**What `index:semantic` is for, and why skipping it is not a small omission.** It writes
`metadata/{SPINE,TERMS,CLAIMS}.json` — the **"before"** that every later edit is compared against. Without
it there is no before, so:
- the QA gate's semantic layer **does not run at all** (it degrades silently to the pre-semantic behavior
  and says so in its report);
- **a rename cannot be detected** — the stored `TERMS.json` is the memory that keeps a term id stable across
  a rename, so without it every id is re-minted from its current label and the change is invisible;
- **nothing can tell a rephrase from a fact change**, which is the whole point of the layer.

Re-run it whenever you accept a new baseline. It is deterministic and safe to repeat: same package, byte-identical
output, and it commits only its own three artifacts — never your work-in-progress.

For every later edit, follow `docs/coherence-index.md`: generate the
revision impact, revise/review the complete required set, regenerate the final plan, attest it, and refresh the
index. Initialization creates the first coherent Git baseline; each accepted refresh creates a coherent-revision
commit. User commits remain welcome, but do not replace the attested refresh. A stale or missing final index is
release-blocking.

## Stage 5 — QA gate (mandatory, automated)
For personal/restricted teaching materials, complete the same mode-appropriate key-fact critique under
`personal/`, bind it, accept the component-index refresh, and run
`node scripts/check_assurance.mjs --root personal --phase release`. This is a teaching-material completion gate,
not permission to publish; future-publication blockers remain visible.

Run `node scripts/check_oer.mjs --package package --inputs inputs --for-discovery --report reports/qa_report.md`. It checks:
**(A) the Alembic contract** — manifest valid, LICENSE present, every folder/file recognized, each declared
chapter's `study-guide/<slug>.md` present, no carriers or stray root files, renderable objects public — so
you know it will **upload with zero friction**; **(B) OER quality** — attribution completeness,
link/asset-path integrity, orz-syntax, the defined accessibility floor, leftover placeholders, format contracts; and
**(C) copyright and high-risk factual assurance** — the `--inputs` flag runs a **near-verbatim scan** against the source materials, flagging
prose copied too closely (rewrite it originally); and **(D) the semantic layer** — if the package has been
indexed (Stage 4), the gate resolves every claim against the spine and reports **dangling references**
(a declared anchor, `spineRef`, or `derivedFrom` pointing at nothing) and **refused declarations** (malformed,
so the block silently fell back to the scan). These are all one shape: **the author asserted something and the
system silently did nothing.** The findings land in `metadata/REVIEW_QUEUE.json` with a `burden` count — that
number is the alarm-fatigue meter, and it is reported, not assumed. **One semantic finding is FAIL-CLOSED and blocks
packing in EVERY mode, not just at release: a blocking `missing-coverage` item** — an objective your own concept map
declares that nothing in the package teaches (the CONTROL check; it counts as `semanticCoverageBlocks`). This is the
one thing the harness exists to refuse: the agent silently overrode what YOU said to teach. It cannot be packed past.
Two honest options, and only you can choose — **TEACH it** (add a claim under `"spineRefs": ["<objective.id>"]`, or a
`## Key terms` entry bracketed under it, so the coverage check can see the objective is delivered) **or REMOVE it**
from `concepts/<slug>.md`'s `## Objectives`. Never let the silent drop stand. (Its mirror image, W17, is a
`formatContractFailure`: a deliverable that tags an objective the map never declared — reconcile it the same way.) **If the report says the semantic layer did
not run, you skipped `index:semantic` — go back to Stage 4.** **Fix every critical issue** and **re-run until
`criticalTotal == 0`**. It also requires the current compact source record, mode-appropriate key-fact critique,
accountable final author identity, media-rights receipts, and human visual-review record. Also confirm the carriers build cleanly: `node scripts/build_carriers.mjs` should
report `failed: 0` (proves each lean source reassembles into a valid framework document). The report's
**Discoverability** bar is enforced for public OER: incompatible licensing, incomplete provenance/attribution,
a missing source scan, or near-verbatim spans are release-blocking. Flag any non-auto-fixable issue in `reports/qa_report.md`
— never fabricate a fix.

## Stage 5b — Revising after the baseline (the revision loop)

Every edit after Stage 4 — yours, the instructor's, or an automatic one — runs the same loop. Git answers
*what changed*; the two indexes answer *what else can no longer be trusted*; nothing packs until a human
has attested the whole impact set. **A clean `git status` is not a coherent package.**

```bash
node scripts/check_oer.mjs --package package            # 1. the gate names what moved (claim-level) and what is stale (file-level)
npm run revision:impact -- --root package                # 2. the exact review set → reports/revision-impact.{json,md}
#    review every listed component; fill `reviewed` + a substantive `attestation` in the JSON
node scripts/index_components.mjs --root package --refresh --review reports/revision-impact.json   # 3. accept the file-level state
npm run queue:review -- --root package                   # 4a. the decision sheet for the queue → reports/queue-review.json
#    decide every row: fixed | accepted | dismissed, with a note of 20+ characters
npm run index:semantic -- --root package --review reports/queue-review.json   # 4b. accept the claim-level baseline
node scripts/check_oer.mjs --package package            # 5. must come back clean; then the queue is empty
```

**Accepting is a decision, not a command.** Once a package has a stored index, `index:semantic` consumes the
last gate run's queue: it refuses when no gate ran after your last edit (the queue's `basisSha256` no longer
matches), and it refuses while any `blocking` or `review` item is undecided on the sheet. The queue therefore
keeps its memory across runs — nothing is cleared by re-indexing past it. A relabeled objective that still
carries declared claims additionally needs `--acknowledge-relabel <ids>`.

A **clone** of a package carries the committed `COMPONENT_INDEX.json` but not the external ledger under
`.coursewerk/`, so it cannot be gated. Never delete the index and re-initialize (the gate refuses an
`initialize` over existing index history as a reset of the attested chain); run
`node scripts/index_components.mjs --root package --restore`, which re-creates the ledger from the commit that
last touched the index and records the action as `restore` — every release evaluation names it.

What the gate reports between steps 1 and 4, and what each means:

- **`metadata/REVIEW_QUEUE.json`** — one item per human decision, ordered by severity: a value the study guide and
  the answer key disagree on, a claim the change reaches but did not move (`silentRisk`), a dropped objective,
  an unverifiable quotation, a dangling reference. Read it top-down; the `burden` count is the alarm-fatigue meter.
- **`semantic.freshness`** — whether the committed SPINE/TERMS/CLAIMS are byte-fresh. Stale while you are mid-edit
  is normal. **Stale with nothing moved and everything committed is a silent strand** (a concept-map edit that was
  never re-indexed): it enters the queue as `stale-index`, and release refuses it. Step 4 clears it.
- **`coherenceFailures`** — components changed after the last attested review. Step 3 clears them. A whitespace
  reflow moves nothing here either: component hashes and review bindings are over normalized text.
- **`spine-relabeled` (blocking)** — you reordered `## Objectives` or `## Concept sequence` in the map, so an
  ordinal id now carries a different statement while claims are still declared under it. Restore the order or
  re-declare the claims; ordinals are identity (or anchor the items with `[anchor: slug]`).
- **`misconception-asserted` (blocking)** — a deliverable paragraph asserts a sentence from the map's
  `## Misconceptions to surface` without correcting it.
- **`declaration-refused`** — a partially anchored list, a positional declaration on an anchored item, or a
  declaration under a repeated heading; **`dangling-reference`** — a spineRef, anchor, or override naming nothing.

**Deliberate divergence from the source.** When the package must say something the pinned source does not —
a newer value, a correction of a source error, a pedagogical simplification — record it once; after the next
`index:semantic` the gate treats the divergence as authorized instead of suspected:

```bash
npm run record:override -- --root package --claim-id <claim.id from CLAIMS.json> \
  --diverges-from "<source anchor>" --basis instructor-expertise|cited|pedagogical-choice \
  --authorized-by "<name>" --date YYYY-MM-DD --rationale "<why, for the next maintainer>" [--justified-by "<newer source>"]
```

The claim then carries `overrideId` and its provenance fingerprint moves — so the override is itself a tracked
change: the gate reports the move once, and `npm run index:semantic` accepts it. From then on `suspected-error`
flags for that claim read as authorized divergence. The recorder refuses an id that no claim carries (copy it
from `CLAIMS.json`); an override whose claim was later re-minted is reported as `dangling-reference`. Never edit
the source snapshot or the fidelity checker to make a divergence disappear; the override IS the record.

**Terminology renames.** A rename is the one edit the harness can apply for you, because it is mechanical:
one registered label to another, resolved through the term registry, never inside a quotation, citation, code
fence, orz payload, or a span reproduced from the source. Plan first, then apply with a receipt:

```bash
npm run revision:propagate -- --root package --term <term.id> --from "<old label>" --to "<new label>" [--inputs inputs]
npm run revision:propagate -- --root package --term <term.id> --from "<old label>" --to "<new label>" --apply --authorized-by "<name>"
```

The dry run writes `reports/propagation-plan.json` (hash-bound to the package HEAD) and touches nothing. Read
it. `--apply` executes exactly that plan: it refuses when the plan is missing, was made against another HEAD,
or no longer matches a fresh computation; it refuses a package without an output git or with an uncommitted
tree; it writes only the planned files, files `reports/propagation-receipt.json` BEFORE committing (before/after
text and file hashes on both sides — enough to verify every edit and to reverse it), then commits only those
files. The rename reaches the claim blocks and the prose around them; what it will not touch is NAMED in the
plan as `protected` — quotations, citations, code, source-reproduced spans, and headings (renaming a heading
moves every anchor under it; retitle by hand). Everything that needs judgment is *held for review*, never
guessed. Rename the key term in the concept map first, so the registry records a RENAME. Then run the loop
above: the component gate demands the review, and the accept steps re-baseline.

## Stage 6 — Honest evaluation report
Write `reports/evaluation.md` — an **honest artifact-quality evaluation** of the package, so the user
(and, for a test run, reviewers) get a transparent picture. Pull the real numbers from the QA pass:
**Alembic-contract readiness, copyright/attribution coverage, the defined accessibility floor, link/asset-path
integrity, orz-syntax, format-contract adherence, and the residual-flaw audit** (with counts + rates).
Classify each residual flaw as *auto-eliminable*, *needs-human-touch* (chiefly the **cosmetic**
image/rendering/slide-layout class), or *content* — and report honestly which axes are auto-verified vs
which still need a human probe (scientific correctness). **Do not fabricate or inflate** any number; if a
check was not run, say so. For a **no-intervention test run**, this report — plus the gate/redo/token
counts from `.coursewerk/progress.md` — is the deliverable evidence of how the harness performed.

## Stage 7 — Pack + deliver
For public OER only, run `node scripts/pack.mjs --package package --out dist --inputs inputs` to produce the **lean upload zip** in `dist/`
A primary source whose comparison is *human-attested* (no automatic text to scan) is a self-report; `pack`
refuses to release on it unless you pass `--accept-attested-sources`, and the evaluation names the source.
The evaluation's *Measured vs declared* section lists everything the gate could not verify.

(`alembic.json` at the archive root; framework carriers excluded — Alembic rebuilds them). Write
`reports/delivery.md` ('# Delivery'): what was produced, the evaluation summary (Stage 6), and the
explicit list of items still needing the user (open `[VERIFY]`, license/DOI to confirm, cosmetic layout
items). Tell the user how to publish: **upload `dist/<course>.alembic.zip` to Alembic** (Import a package),
where it becomes an editable course they preview and publish — Alembic reassembles the framework, assigns
the permalinks, and creates the paired public/private repositories. Every file remains theirs to edit.
**Do not push or publish** — the user does that.

`pack.mjs` reruns QA, rebuilds carriers, verifies them against the human review, and refuses private/restricted
profiles or any unresolved publication blocker. The release receipt hashes the source record, key-fact review,
visual review, accepted Git head, exact carrier receipt, and archive. Never manually zip `personal/` as an
Alembic package.

> **One heads-up to include in `reports/delivery.md`:** a *trial* import in Alembic is text-only, so
> **raster** assets (`.png`/`.jpg`/`.pdf`) are skipped on import and re-added after the package is published;
> **SVG** figures (what `oer-figures` produces for structures and charts) are text and import fine. Prefer SVG
> for self-generated figures so the package arrives complete.

## Steering (any time)
When the user gives a new instruction ("emphasize X," "drop chapter N," "make slides shorter"), treat it as
**high-priority guidance that overrides earlier defaults**, absorb it, and revise the affected deliverables —
without restarting or clobbering the user's hand-edits.

**Distill durable preferences** into the user's own harness (`~/.coursewerk/`, see `CLAUDE.md §0.6`): if a
steering instruction is meant to *persist* across courses ("always use IUPAC names," a preferred slide
layout, a template, an extra skill), record it in the right profile file + `memory.md` and confirm — so it
applies automatically next time. The user's harness survives Coursewerk updates.
