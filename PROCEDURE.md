# Coursewerk — the workflow

This is orientation, not a script: what each stage is for, which outcomes the harness checks, and who decides. How
you get there is yours. All commands are `node scripts/<name>.mjs … --root <package>`; each one refuses with the next
step when its preconditions fail. Read `CLAUDE.md` first.

## The shape

```
M1 intake ─▶ M2 steering ─▶ per chapter: DRAFT ─assemble─▶ ASSEMBLING ─M3 approve─▶ PACKAGE
                                                                                     │
                     work loop (batches) ─▶ M4 digest ─▶ … ─▶ M6 publish decision ─▶ pack ─▶ the instructor uploads
```

- **States.** Each chapter is DRAFT, ASSEMBLING or PACKAGE (`coursewerk.mjs status`); chapters move independently.
- **What publishes.** Only a PACKAGE chapter with a valid spine approval and nothing blocking it. The course map is
  published only with its own approval.
- **Structural change.** A change that loses the identity of the spine (objectives split, merged or moved; chapters
  reorganised or reordered) opens a new major version (`spine.mjs version`, the instructor's call). The chapter then
  goes back through ASSEMBLING; nothing from the old version counts as verified.

## The six moments — the only times you contact the instructor

| moment | when | you bring | the instructor |
|---|---|---|---|
| **M1 intake** | a new course | use profile (public or private), sources or raw materials, audience, scope, chapter list | answers once |
| **M2 steering** | before the first chapter is assembled | the seven questions (level, depth, emphasis, notation, example style, exclusions, tone), each with your proposed default | answers, or accepts all in one word |
| **M3 spine approval** | a chapter is assembled | the standardized spine, a diff against the input (`spine.mjs preview`), your critique as questions | approves, edits, or sends it back |
| **M4 digest** | the end of each authoring batch, and before publishing | `coursewerk.mjs digest --deliver`: clustered, ranked questions with recommendations; your corrections as diffs; progress | answers, accepts all recommendations, or lets it wait |
| **M5 interrupt** | work cannot continue and only the instructor can decide | `coursewerk.mjs interrupt`: one question, why it blocks, the options | decides |
| **M6 publish** | the instructor asks | `coursewerk.mjs status`: what can be published, and why the rest cannot | decides (`coursewerk.mjs publish`) |

M5 is only for a spine-scope conflict, a missing input, a rights blocker, or a spine-change request. Anything else
waits for M4. An answered question is never asked again while the text it is about is unchanged.

**The instructor can also, at any time:**
- give **feedback**: a local revision, or a steering change if it is general ("shorter examples everywhere");
- **edit text directly**: index it; an unrecorded edit is raised once at M4;
- **ask for a check**: correct mechanical and semi-mechanical errors with a diff, raise knowledge concerns about
  their text as questions, and stay silent on rephrasing;
- say **"assemble"**, **"approve"** or **"publish"**.

## Stages

### M1 — intake

Create the package:
- `alembic.json` and `LICENSE` per `format-contracts/deliverables.md` §The manifest;
- `metadata/FOUNDATION.json` (use profile, sources, accountable author) from `templates/foundation.*.example.json`;
- `metadata/coursewerk.json` with `"spine": 2`.

Pin the sources:
- `scripts/prepare_source_corpus.mjs` or `scripts/prepare_wikipedia_topic.mjs`, then `scripts/generate_source_record.mjs`;
- a source must be pinned before its text can serve as evidence.

**Public profile:** capture rights evidence before exposing a source's content to authoring:
- `scripts/capture_rights_evidence.mjs`; and, for every external media item, `scripts/capture_media_evidence.mjs`;
- after media changes, `scripts/generate_attribution.mjs`;
- see `docs/assurance-kernel.md`.

**Declare where verification may look on the web,** in the instructor's words:
- `verify.mjs destinations --set "<host[/path]>,…" [--context "<subject>"]`;
- nothing is fetched elsewhere, and only the claim's own words are sent.

`bootstrap/init.sh` makes the package its own git repository (`scripts/init_output_git.mjs`); commit as you go.

### M2 — steering

Propose a default for each of the seven questions, from the inputs and the user's `~/.coursewerk/` preferences. Record
the answers with `spine.mjs steering`. They are standing preferences; a later general instruction is a steering
change, recorded the same way.

### Assembling a chapter, and M3

On "assemble" (`coursewerk.mjs assemble --chapter <slug>`), standardize the chapter's spine from the draft or the raw
materials:
- the concept map (`concepts/<slug>.md`): objectives, concept sequence, key terms, misconceptions, prerequisites;
- the assessment guide (`assessment-support/<slug>.md`): per objective, `
**Re-approval after a spine change:** run `spine.mjs review --chapter <slug>` (or `--course`) first. A blind verifier
reads only the lines changed since the last approval (in the concept map and the assessment guide, moved lines
included). Its concerns appear in `spine.mjs preview` as questions for the
instructor, and the spine is never edited. Approval waits for the review. Offline, approve with `--without-review`,
which is recorded.

### … [anchor: …]` entries with Type,
  Count, Level and Targets;
- the course map (`concepts/course.md`) for the chapter list and order.

Every node carries a stable anchor (`spine.mjs anchor`). The grammar is in `format-contracts/deliverables.md`
§Concept maps; `spine.mjs check` must pass.

Mark every item you added as your proposal (`spine.mjs propose`), and record your critique as questions
(`spine.mjs critique`). Both appear in the approval view. Bring it at M3 with `spine.mjs preview` and the diff. The instructor approves with `coursewerk.mjs approve --chapter
<slug>` (and `--course` for the course map).

**Re-approval** after a spine revision:
- a **light** change (no visible word changed: only punctuation, markup, spacing or letter case; struck-through or
  hidden words and signs count as words) needs only a glance (`--glance`);
- a **rephrasing** (words changed, every value, name, number, sign, negation and direction kept) needs only a glance
  once the blind review of the changed and removed lines (`spine.mjs review`) has found every line the same in
  meaning, and every removed line still said by the plan;
- anything else, a rephrasing the review found changed (or did not say), or any change while the review raises a
  "wrong" concern (it is also the instructor's question at the gate), needs a full re-approval, with the diff and its
  impact.

Never edit an approved spine on your own: the edit voids the approval.

### The work loop (PACKAGE)

Work in batches (one to three chapters, or a session's budget). In each batch:
1. **Author** the study guide, slides and practice from the approved spine, the steering and the sources, or from
   your own knowledge.
   - Run `units.mjs begin` before writing and `units.mjs index --as agent` after: every unit gets its origin.
   - First make sure your orz skills are the newest (`node <harness>/scripts/skills.mjs --check`; if not, run it
     without `--check`). Then follow them, `docs/authoring-guidelines.md` and `docs/writing-checkable-statements.md`.
   - Everything that ships is read. Declare any other markdown the course ships (a handout, a reading) in
     `metadata/DOCUMENTS.json`; it is then checked like a study guide. Only the instructor exempts one as
     administrative (`coursewerk.mjs administrative --document <path>`, in their words). An `{{md …}}` include must
     name a declared document. Whatever prints is content: a sub-heading, a printed `{{nyml}}` element, text after
     a comment.
2. **Link** each teaching unit to the spine nodes it serves (`units.mjs link`), and each practice question to its
   assessment-guide entry. A guide entry is for practice questions: a passage linked only to one is still unlinked,
   a worked example in a study guide does not count toward an entry's Count, and one question counts toward one
   entry only. A question fills a Count only once its alignment review says it practises the entry's objective at
   the entry's type and level.
3. **Run the gate** (`gate.mjs --inputs <corpus>`) and fix what is routed to you. Facts:
   - `verify.mjs search` (claim-only retrieval and pinning), then `semi` (the blind verifier);
   - `absolutes` (a context review of absolute statements);
   - `knowledge` (a blind conceptual review). The reviewer sorts each concern:
     - **wrong**: about your own draft, revise it; about the instructor's text, it is a question;
     - **clarify**: correct as meant, and a few words make it precise. In your own text, apply the edit if it
       keeps the meaning (`clarification-owed`). In the instructor's text it comes to the digest as a one-line
       diff (`clarification-proposed`). Once they accept it, applying it is yours (`clarification-accepted`), and
       their credit stays.
   - `correct` (auto-correction of an admitted, uncontested contradiction, shown as a diff);
   - `alignment` (a blind link and level review, trial). It checks whether each linked unit teaches what it is
     linked to (answers are read with their question), and whether a practice question has the type and level of
     each guide entry it is linked to. A doubtful link is yours to relink, and a review the harness cannot read
     (`alignment-unscorable`) is yours to run again. A unit off the plan, or a level slip in the instructor's text,
     is the instructor's question.
   The gate's `knowledgeUnreviewed` lists the units no blind review has read at their current text. It does not
   block, but a unit that changed since its last review is the first place to look.
4. **Re-run the gate.** Stop when a run raises nothing new for you, or the budget is spent. Then bring M4.

A substantial rewrite of a unit makes it a new unit: link it again after you rewrite it.

**Re-verification is a re-check, not a stamp.** A unit owes re-verification (`reverify`, `carried-unverified`) when
something it depends on changed: its question (any rewording), a shared value, a key term, a spine node, or a new
major version. Editing, relinking or re-indexing the unit never clears it, nor does deleting it and writing it back,
or splitting it, or writing its words into a neighbour (the neighbour inherits what it owed). A unit that enters an
open version's scope after the version opened (moved, relinked, or a document's `chapters` changed) is carried into it
when the index sees it; if the gate says `version-carry-owed`, run `units.mjs reconcile`. To clear it, have the unit's current text reviewed blind, then record the re-check:
`verify.mjs knowledge --units <ids>`, then `units.mjs reverify --units <ids> --model <id>`. An answer is reviewed
with its question. A link review (`verify.mjs alignment`) does not count. A review that finds the text wrong does not
count: revise it, and review it again. The instructor
may confirm a unit instead (`units.mjs confirm --what still-correct`). Unit records (`metadata/units/`) change only
through these tools. A hand edit is a blocking defect; restore it from git.

**Before you deliver the digest,** attach your recommendation to any entry that has none (`coursewerk.mjs recommend`).
"Accept all" then covers it, and the instructor sees it marked as yours.

**What only the instructor can settle comes to the digest as a question.** For example:
- invented exercise data, which no source can show;
- a source that disagrees with the blind reviewer. Show both sides and recommend one.

Answering "confirm" records the instructor's confirmation. An instructor who says "later" defers
an entry: record `--choice later`. It stays open and comes back first, marked as owed. The digest's size is the
instructor's setting (`coursewerk.mjs digest-cap`); the overflow waits for the next digest and is never dropped.

**Pacing.** On a single, rate-limited subscription, keep batches small. Checkpoint when the session's budget is
spent; the records let the next session resume.

**What the gate blocks on:**
- a **defect**: evidence that something is wrong;
- an **obligation**: something required is missing — a fact without admitted evidence, a unit without a spine link,
  an objective nobody teaches (a course-map objective too, unless a chapter objective or concept names it in
  `[prereq: …]`), a guide entry short of its count, a unit to re-verify after a change, an absolute not yet
  reviewed, an edit not yet indexed.

**Questions never block.** They go to the digest. At publish they are raised once more: with any still open,
`publish` lists them and stops. If the instructor still wants to publish, follow their word
(`--over-open-questions`); the decision records that it was made over those questions.

### M6 — publish, then pack

At the instructor's word, `coursewerk.mjs publish` records the decision:
- the content hash;
- the approvals it relied on;
- the chapters included and why the others were not;
- the open questions.

Then `scripts/pack.mjs --package <pkg> --out <dir>` produces the Alembic zip of exactly that decision, and refuses
if the package changed since. The zip is lean (D53): the published texts, the assets they use, `private/`, the attribution
and a short `PUBLISHED.json`; the working record and every source text stay with the local package. It first fetches the newest Alembic package contract and runs Alembic's own
validator on the package; a refusal names what to fix. Offline, it says it checked only against the local mirror. A private package is packed with its profile recorded and is never cleared for public
release. Hand the zip to the instructor; uploading it is theirs.

To read or present the materials locally, assemble the framework shells: `scripts/build_carriers.mjs --root <pkg>
--out <dir>` (`docs/assembling-carriers.md`). They are previews, never deliverables.

## Commands, at a glance

| | |
|---|---|
| workflow | `scripts/coursewerk.mjs` — status, assemble, back-to-draft, approve, digest, recommend, answer, publish, revert, interrupt, digest-cap, history (how each issue was found and settled, rebuilt from the records) |
| spine | `scripts/spine.mjs` — check, migrate, anchor, propose, critique, review, status, preview, approve, version, steering |
| units | `scripts/units.mjs` — begin, index, claim, status, link, confirm, reverify, obligations, restamp |
| verification | `scripts/verify.mjs` — destinations, search, fetch, semi, readmit, absolutes, knowledge, alignment, correct, revert, corrections, links, status |
| gate | `scripts/gate.mjs` |
| pack | `scripts/pack.mjs` (checks the newest Alembic contract first); `scripts/alembic_check.mjs` checks it on its own |
| site export | `scripts/site_export.mjs --root <pkg> --out <dir>`: the records an Alembic site holds (`private/coursewerk/`, and the public `provenance/coursewerk/CHECKED.json` and `ATTRIBUTION.md`), for the hand-in; the package is not changed |

## Packages from v0.12

Migrate first: `docs/migrating-from-v0.12.md`. Until a package is migrated, its v0.12 pipeline still runs:
- `scripts/check_oer.mjs` (gate) and `scripts/check_assurance.mjs`;
- `scripts/index_components.mjs`, `scripts/revision_impact.mjs`, `scripts/index_semantic.mjs`, `scripts/propagate.mjs`
  and `scripts/queue_review.mjs` (coherence);
- `scripts/record_override.mjs` (divergence);
- `scripts/assemble_blind_bundle.mjs` and `scripts/bind_key_fact_review.mjs` (key-fact review);
- `scripts/attest_visual_review.mjs` (carrier attestation).

None of these is part of a v2 package's workflow.
