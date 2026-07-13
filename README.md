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

Coursewerk first asks how the material will be used. Personal-private and genuinely restricted work stays in
`personal/`, keeps complete provenance, and is never packaged for publication. Public OER goes into `package/`
only after the mode-independent assurance kernel verifies source rights, license compatibility, attribution,
privacy, and publication clearance. Full/Light review mode never weakens these checks.

Each output root is automatically its own Git repository, so direct edits have visible history and diff. Every
output file is also indexed in a dependency graph. Git identifies what changed; the graph computes the transitive
review/update set, identifies upstream consistency context, and blocks QA/packing until all affected components
receive an attested coherence review.

Coursewerk itself is indexed too: claims, kernels, tests, instructions, templates, skills, contracts, and release
metadata are connected in `system/COURSEWERK_INDEX.json`. Pull-request impact is calculated from the target
branch's merge base, preventing concurrent branches from silently drifting apart.

See [FEATURES.md](FEATURES.md) for the OER authoring pain points Coursewerk addresses and the assurance boundary
behind each product claim.

For future chapter-sized science trials, Coursewerk includes a
[multi-page Wikipedia workflow](docs/wikipedia-science-topic.md): one anchor article plus supporting pages,
hash-bound pre-ingestion clearance, revision-aware API capture, and a 6,000–25,000-word source-corpus target.

An **Alembic package** — the exact tree Alembic ingests with zero friction, then turns into a published
course website with paired public/private repositories. The trick is a **lean, framework-free** package:

- You author **lean markdown** — study guides and practice in orz-markdown, slides in the orz-slides deck
  grammar, concept maps and assessment guides in plain markdown. This is the source of truth.
- Coursewerk **builds the orz framework carriers** (`.md.html` / `.slides.html` / `.paged.html`) into a
  throwaway `preview/` folder. Each HTML carrier embeds its Markdown source: open, read, present, print, or edit
  it directly in a browser. Text-only carriers may travel as one file; media-bearing carriers travel with their
  local asset directory, and the build receipt declares that dependency instead of claiming false
  self-containment. The three shapes provide continuous web documents, reveal.js slide decks, and paginated
  print/PDF views from the same rich formatting family. Lean `.md` remains canonical, so copy any browser edits
  back to the source before rebuilding the preview.
- The upload zip ships **lean only** — the heavy framework shell is left out, and **Alembic reassembles it**
  (and assigns permalinks/ids) on its side. Light to transport, native on both ends.

## What you need

- An **AI CLI engine** installed and authenticated — at least one of: Claude Code, Codex CLI, GitHub Copilot
  CLI, or similar. (This is the executor; Coursewerk is the harness it follows.)
- **Node.js 18+** (for the orz-family builders + quality-check scripts) and **git**.
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
5. **Run the quality gate** (`scripts/check_oer.mjs`) — including source-corpus identity, exact license text,
   provenance/attribution, accessibility, format, and coherence — and fix every detected hard issue.
6. **Pack the lean zip** (`scripts/pack.mjs`) into `dist/`; packing rebuilds declared carriers and emits an
   evaluation plus hash-bound release and persistent carrier receipts.

## Use any AI platform you like

Coursewerk runs in **any AI agent with a terminal** — Claude Code, ChatGPT (Codex / Agent mode), Gemini
CLI, GitHub Copilot CLI, Cursor / Windsurf / Cline. Each reads its own entry file (`CLAUDE.md`,
`AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursorrules`), all pointing to the same
canonical instructions. On a **pure chat UI** (ChatGPT/Claude/Grok/Gemini in the browser, no terminal) you
can still use it in **lite mode** — see [`docs/lite-path.md`](docs/lite-path.md) and
[`COMPATIBILITY.md`](COMPATIBILITY.md).

## Works on a single $20 subscription (Light mode)

Coursewerk has two modes; the agent asks at the start:

- **Light mode** (default — for one lower-tier subscription): **no** expensive cross-model critique; quality
  is verified by the **deterministic QA script** (Alembic contract, attribution, links, orz-syntax,
  accessibility, format contracts) plus a quick self-review. The agent builds **~3 chapters per session,
  checkpoints, and stops** so you don't blow through your daily/5-hour rate limits — resume the next day with
  the same command. It stops immediately if it hits a rate-limit.
- **Full mode** (a higher tier and/or a second engine): adds cross-model critique on each chapter for extra
  polish, at higher cost.

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
bootstrap/init.sh              # installs builders + creates the workspace folders
skills/                        # bundled harness skills (orz-markdown, oer-figures, oer-qa, courseguide-standards)
scripts/check_oer.mjs          # automated quality gate (Alembic contract + OER quality)
scripts/check_assurance.mjs    # foundation/provenance gate for private/restricted work
scripts/capture_rights_evidence.mjs # snapshot/hash rights evidence and classify separate access/AI-use notices
scripts/prepare_source_corpus.mjs   # bind raw/extracted source evidence or human comparison attestation
scripts/prepare_wikipedia_topic.mjs # collect cleared, revision-pinned pages into a chapter-sized science corpus
scripts/generate_attribution.mjs    # render attribution deterministically from structured provenance
scripts/init_output_git.mjs    # initialize an independent Git ledger for an output root
scripts/index_components.mjs   # initialize/refresh the output dependency index
scripts/revision_impact.mjs    # compute every component affected by revisions
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

## License

Coursewerk (the harness) is released under the MIT License. Teaching packages use an output license compatible
with every adapted source and incorporated item (for example, an English Wikipedia text adaptation uses CC BY-SA 4.0).
Public-domain status remains distinct from CC0. Coursewerk records and enforces the supported compatibility paths.
