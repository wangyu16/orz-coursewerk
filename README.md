# Coursewerk

**Website:** [coursewerk.orz.how](https://coursewerk.orz.how/)

**An AI agent that does the coursework of building your course** — it turns a textbook or your own source
materials into private teaching workspaces or complete, openly-publishable teaching packages: per-chapter **concept maps, study guides,
slide decks, assessment guides, and practice question sheets**, plus a course-wide concept map — authored
natively with the **orz-markdown family** and packaged so it **uploads straight into [Alembic](https://github.com/wangyu16/Alembic)**.

Coursewerk is an **agent-native harness**: it is not an app you install and run. It is a small repository of
*instructions, skills, format contracts, and quality checks* that your own AI coding agent (Claude Code,
Codex CLI, or any capable AI CLI) **reads and executes**. You stay in control: the agent does the tedious
production work; you steer, approve, and hand-edit anything.

## What it produces

Coursewerk first asks how the material will be used. A **public** package passes rights, licence and attribution
checks before it can be published; a **private** one goes through the same gate without them and is never cleared for
public release. What Coursewerk promises is **traceability and convergent verification**, not perfection:
- every unit of text has a recorded origin and spine link;
- every fact is checked by a fresh, context-blind pass of your own AI engine against pinned sources, or stays
  visibly open;
- every decision is in a hash-chained log inside the package;
- no issue is raised without evidence, and nothing correct is "fixed" into something wrong.

The instructor approves the spine (the concept maps and assessment guides) and decides when to publish. Everything
else is the agent's work, brought back in a short digest of the questions that need a person.

Each package is its own Git repository, so direct edits have visible history; an edit nobody recorded is raised to
the instructor, never overwritten.

Coursewerk itself is indexed too: claims, kernels, tests, instructions, templates, skills, contracts, and release
metadata are connected in `system/COURSEWERK_INDEX.json`. Pull-request impact is calculated from the target
branch's merge base, preventing concurrent branches from silently drifting apart.

See [FEATURES.md](FEATURES.md) for the OER authoring pain points Coursewerk addresses and the assurance boundary
behind each product claim.

## Published demonstration

See the [(Demo) Plate Tectonics course](https://yuwang-cmu.github.io/demo-plate-tectonics-3nm44xwx-oer/) for a
complete two-chapter example. It is a product demonstration, not material intended for direct classroom use. An
AI agent following Coursewerk generated it automatically from a revision-bound collection of Wikipedia pages;
there was no human-authored lesson content or subject-matter editing. Human involvement was limited to
commissioning the run, auditing the pipeline, checking consistency and rendered output, and overseeing publication.

For future chapter-sized science trials, Coursewerk includes a
[multi-page Wikipedia workflow](docs/wikipedia-science-topic.md): one anchor article plus supporting pages,
hash-bound pre-ingestion clearance, revision-aware API capture, and a 6,000–25,000-word source-corpus target.

An **Alembic package** — the exact tree Alembic ingests with zero friction, then turns into a published
course website with paired public/private repositories. The trick is a **lean, framework-free** package:

- You author **plain text** (orz text format 1) — study guides and practice in orz-markdown, slides as orz-slides
  texts (a `{{nyml kind: document}}` header with `carrier: slides`, then the slides), concept maps and assessment
  guides in plain markdown. The text is the source of truth.
- Coursewerk **assembles the orz carriers** (`.md.html` / `.slides.html` / `.paged.html`) with the newest orz frames
  into a throwaway `preview/` folder. They are clothes: each holds its text exactly (checked on every build) plus a
  regenerable shell, so you can open, read, present, print, or edit it in a browser. Text-only carriers may travel
  as one file; media-bearing carriers travel with their local asset directory, and the build receipt declares that
  dependency. The text remains canonical: bring browser edits back with the carrier's `extract` before rebuilding.
- The upload zip ships **lean only** — the heavy framework shell is left out, and **Alembic reassembles it**
  (and assigns permalinks/ids) on its side. Light to transport, native on both ends.

## What you need

- An **AI CLI engine** installed and authenticated — at least one of: Claude Code, Codex CLI, GitHub Copilot
  CLI, or similar. (This is the executor; Coursewerk is the harness it follows.)
- **Node.js 20.16+** (for the orz-family builders + quality-check scripts) and **git**.
- Optional: a second engine, to let the agent cross-critique each chapter for higher quality.

## Quickstart (from your desktop AI app or terminal)

Tell your AI agent:

> "Clone `https://github.com/wangyu16/orz-coursewerk`, read `CLAUDE.md`, and build a course guide for me."

The agent will:

1. **Set up a workspace** (`init` installs the orz-family builders and creates `inputs/`, `personal/`, `package/`,
   `preview/`, `reports/`, `dist/`; output roots get independent Git repositories).
2. **Check for updates** (pulls the latest Coursewerk so you always get improvements).
3. **Ask you** for intended use, source/rights evidence, scope, and pedagogy. Private and restricted authoring may
   use any source with provenance and future-publication warnings. For public preparation it deterministically
   captures the authoritative rights page, verifies license facts, and separately records any AI/automated-use
   notice without treating it as an amendment to the copyright license.
4. **Build the package** stage by stage, pausing at each major stage for your review and steering,
   previewing the real documents as it goes.
5. **Run the quality gate** (`scripts/check_oer.mjs`) — including the retained source revision record, exact
   license evidence, media-rights receipts, accountable identity, the mode-appropriate key-fact critique,
   provenance/attribution, accessibility, format, coherence, and a human browser/DOM carrier attestation.
6. **Pack the lean zip** (`scripts/pack.mjs`) into `dist/`; packing rebuilds declared carriers, verifies them
   against the human review, and emits an evaluation plus hash-bound release and persistent carrier receipts.

## Use any AI platform you like

Coursewerk runs in **any AI agent with a terminal** — Claude Code, ChatGPT (Codex / Agent mode), Gemini
CLI, GitHub Copilot CLI, Cursor / Windsurf / Cline. Each reads its own entry file (`CLAUDE.md`,
`AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursorrules`), all pointing to the same
canonical instructions. On a **pure chat UI** (ChatGPT/Claude/Grok/Gemini in the browser, no terminal) you
can still use it in **lite mode** — see [`docs/lite-path.md`](docs/lite-path.md) and
[`COMPATIBILITY.md`](COMPATIBILITY.md).

## Works on a single $20 subscription (Light mode)

Coursewerk has two modes; the agent asks at the start:

- **Light mode** (default — for one lower-tier subscription): no expensive broad cross-model critique; quality
  uses the deterministic QA script plus a quick self-review and one focused same-model independent pass on
  accountable identity, sources/versions, licenses, media rights, attribution, and scientific key facts. The
  resulting hash-bound review becomes stale after any related edit. The agent builds **~3 chapters per session,
  checkpoints, and stops** so you don't blow through your daily/5-hour rate limits — resume the next day with
  the same command. It stops immediately if it hits a rate-limit.
- **Full mode** (a higher tier and/or a second engine): adds cross-model critique on each chapter and records the
  final high-risk review as cross-model, at higher cost.

Switch anytime by editing `.coursewerk/mode`.

## Your harness gets smarter — and survives updates

Coursewerk keeps **your own harness** in `~/.coursewerk/` (separate from this repo): your standing
**preferences, styles, templates, and extra skills**. The agent reads it on every run and applies it as your
defaults, and **distills into it** as you work — when you say "always use IUPAC names" or hand it a
template/skill, it records that so it applies to every future course. Because it lives in your home
directory, **Coursewerk updates (`git pull`) never overwrite it.**

## You stay in control

- **Steer by talking.** Tell the agent "make the slides 50-minute lectures," "emphasize worked examples,"
  "drop chapter 12" — it absorbs the instruction and revises the package.
- **Edit by hand.** Every output is plain Markdown in `package/`. Open any file in your editor and fix a
  word, swap a figure, or tweak a layout directly. Git makes the change visible. Then run the revision-impact
  workflow so every dependent component represented in the graph is checked before the coherence index is refreshed.
- **Provenance by construction.** Every source and incorporated item is recorded. Private unknowns are visibly
  labelled and block publication; public packages require verified rights and attribution.

## Layout

```
CLAUDE.md / AGENTS.md          # entry instructions your AI agent reads first
PROCEDURE.md                   # the pipeline the agent follows (the heart of Coursewerk)
format-contracts/              # the exact Alembic package tree + format each deliverable must honor
VERSION                        # for auto-update checks
package.json                   # depends on the orz-family builders (orz-mdhtml/slides/paged)
bootstrap/init.sh              # installs builders, fetches the newest orz skills, creates the workspace folders
skills/                        # Coursewerk's own skills (oer-figures, oer-qa, courseguide-standards)
scripts/skills.mjs             # fetch the newest orz skills (orz-markdown/mdhtml/slides/paged) into .claude/skills
scripts/check_oer.mjs          # automated quality gate (Alembic contract + OER quality)
scripts/check_assurance.mjs    # foundation/provenance gate for private/restricted work
scripts/capture_rights_evidence.mjs # snapshot/hash rights evidence and classify separate access/AI-use notices
scripts/capture_media_evidence.mjs  # retain/hash authoritative rights evidence for external media
scripts/prepare_source_corpus.mjs   # bind raw/extracted source evidence or human comparison attestation
scripts/prepare_wikipedia_topic.mjs # collect cleared, revision-pinned pages into a chapter-sized science corpus
scripts/bind_key_fact_review.mjs    # hash-bind the Light/Full focused critique to current outputs/evidence
scripts/attest_visual_review.mjs    # record an identified human review of built carrier fingerprints
scripts/generate_attribution.mjs    # render attribution deterministically from structured provenance
scripts/init_output_git.mjs    # initialize an independent Git ledger for an output root
scripts/index_components.mjs   # initialize/refresh the output dependency index; --restore re-creates a clone's ledger from git
scripts/revision_impact.mjs    # compute every component affected by revisions
scripts/propagate.mjs          # plan/apply a mechanical terminology rename with a verifiable receipt (never inside quotations)
scripts/record_override.mjs    # record an authorized divergence from the source once; the gate stops asking
scripts/index_semantic.mjs     # accept the claim-level baseline (SPINE/TERMS/CLAIMS) — consumes the decided queue
scripts/queue_review.mjs       # write the decision sheet for the last gate run's review queue
scripts/assemble_blind_bundle.mjs # assemble the blind key-fact review bundle outside the package; prints the digest the review must declare
scripts/build_carriers.mjs     # build the orz framework carriers into preview/ (local reading + QA)
scripts/pack.mjs               # produce the lean Alembic upload zip in dist/
scripts/lib/contract.mjs       # local mirror of the Alembic package contract
scripts/lib/assurance.mjs      # mode-independent hard-rule assurance kernel
scripts/lib/pre_ingestion.mjs  # hash-bound source-policy clearance receipts
scripts/lib/coherence.mjs      # hashes, dependency graph, impact + stale-index checks
scripts/coursewerk_impact.mjs  # compute branch-aware impact for Coursewerk itself
scripts/verify_coursewerk.mjs  # verify canonical self-index and accepted revision evidence
system/                        # Coursewerk claims, correlations, accepted index + revision evidence
```

## How it works (spine v2)

The deliverable is the lean orz Markdown package; carriers (framework shells) are assembled by Alembic or by an agent —
see `docs/assembling-carriers.md`.

A solid skeleton (states, records, the gate) with add-on check modules. The gate:
`node scripts/gate.mjs --root package` (exit 0 = can publish, 1 = blocked, 2 = usage, 3 = the gate itself failed).
Packages from v0.12 keep `check_oer.mjs` until they are migrated. Checks are modules under
`scripts/modules/` (the seven standard ones in `standard.json` run for every package), each in its own process; see `system/REQUIREMENTS.json` for what the redesign must deliver
and the evidence that closes each requirement.

Spine v2 tools (anchors, parsed assessment guides, approvals): `node scripts/spine.mjs check|migrate|anchor|propose|critique|status|preview|approve|version|steering --root package`.
A package opts in with `private/coursewerk/coursewerk.json` (`"spine": 2`); approvals are the instructor's words, recorded in the package's decision log.
Unit index (every deliverable split into checkable units with stable ids and recorded origins): `node scripts/units.mjs begin|index|claim|status|link|relink|confirm|obligations|restamp --root package` — the deterministic core's
obligations (facts without evidence, unlinked units, uncovered objectives, short guide entries, stale dependents) block the gate.
Verification (a fresh, context-blind verifier per unit; the harness admits a fact only when the verifier's quote is in a
pinned text and carries the same values, years and names): `node scripts/verify.mjs destinations|search|fetch|semi|knowledge|correct|revert|corrections|links|status --root package --inputs <corpus dir>`.
Workflow (chapter states, digest, answers, publish): `node scripts/coursewerk.mjs status|assemble|back-to-draft|approve|digest|recommend|answer|publish|revert|interrupt --root package`;
for agents, `PROCEDURE.md` and `CLAUDE.md`; for v0.12 packages, `docs/migrating-from-v0.12.md`. A spine-v2 package is packed from its publish decision (`scripts/pack.mjs`); for it,
`scripts/gate.mjs` is the gate and `check_oer.mjs` is not used.
Write facts so they can be checked — scoped, not absolute (`docs/writing-checkable-statements.md`, D29).
Retrieval goes only to destinations the instructor declared; the verifier command is `COURSEWERK_VERIFIER` (a JSON array;
default headless `claude -p` with no tools, settings or session, in an empty directory), or a fresh subagent in courier mode.

## In an Alembic job

On Alembic, Coursewerk can run inside the course assistant's job, from a read-only release (`alembic-job/CLAUDE.md`
is that release's entry). The course arrives as a plain folder in Alembic's layout. `scripts/site_import.mjs` turns it
into Coursewerk's layout, and `scripts/site_handback.mjs` turns it back, adding only to the end of the records.
`scripts/records_check.mjs --root <pkg> --extends <earlier log>` tells Alembic whether a returned package's decision log
continues the one it held (JSON `{ok, problems}`; `format-contracts/deliverables.md`).
`scripts/pack_job_release.mjs` builds the release.
What needs the instructor reaches them only through the assistant's digest in Alembic's "Needs you":
`scripts/alembic_needs.mjs export` writes the digest a job hands in (`alembic handin`), and `scripts/alembic_needs.mjs apply`
records the instructor's answers from `alembic changes`, in their name and words.

## License

Coursewerk (the harness) is released under the MIT License. Teaching packages use an output license compatible
with every adapted source and incorporated item (for example, an English Wikipedia text adaptation uses CC BY-SA 4.0).
Public-domain status remains distinct from CC0. Coursewerk records and enforces the supported compatibility paths.
