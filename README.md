# Coursewerk

**An AI agent that does the coursework of building your course** — it turns a textbook or your
own source materials into a complete, openly-publishable teaching package: per-chapter **concept
maps, study guides, slide specs, assessment guides, and practice question sheets**, plus a
course-wide concept map — all plain, editable Markdown.

Coursewerk is an **agent-native harness**: it is not an app you install and run. It is a small
repository of *instructions, skills, format contracts, and quality checks* that your own AI
coding agent (Claude Code, Codex CLI, or any capable AI CLI) **reads and executes**. You stay in
control: the agent does the tedious production work; you steer, approve, and hand-edit anything.

## What you need

- An **AI CLI engine** installed and authenticated — at least one of: Claude Code, Codex CLI,
  GitHub Copilot CLI, or similar. (This is the executor; Coursewerk is the harness it follows.)
- **Node.js 18+** (for the figure + quality-check helper scripts) and **git**.
- Optional: a second engine, to let the agent cross-critique each chapter for higher quality.

## Quickstart (from your desktop AI app or terminal)

Tell your AI agent:

> "Clone `https://github.com/<you>/coursewerk`, read `CLAUDE.md`, and build a course guide for me."

The agent will:

1. **Set up a workspace** (`init` creates `inputs/` and `guide/` folders).
2. **Check for updates** (pulls the latest Coursewerk so you always get improvements).
3. **Ask you** for the source (a named open textbook, or your own materials in `inputs/`) and your
   scope/pedagogy preferences.
4. **Build the package** stage by stage, pausing at each major stage for your review and steering.
5. **Run the quality gate** (`scripts/check_oer.mjs`) and fix every auto-detectable issue before finishing.

## Works on a single $20 subscription (Light mode)

Coursewerk has two modes; the agent asks at the start:

- **Light mode** (default — for one lower-tier subscription): **no** expensive cross-model critique;
  quality is verified by the **deterministic QA script** (attribution, links, orz-syntax,
  accessibility, **format contracts**) plus a quick self-review. The agent builds **~3 chapters per
  session, checkpoints, and stops** so you don't blow through your daily/5-hour rate limits — resume
  the next day with the same command. It stops immediately if it hits a rate-limit.
- **Full mode** (a higher tier and/or a second engine): adds cross-model critique on each chapter for
  extra polish, at higher cost.

Switch anytime by editing `.coursewerk/mode`.

## Your harness gets smarter — and survives updates

Coursewerk keeps **your own harness** in `~/.coursewerk/` (separate from this repo): your standing
**preferences, styles, templates, and extra skills**. The agent reads it on every run and applies it
as your defaults, and **distills into it** as you work — when you say "always use IUPAC names" or hand
it a template/skill, it records that so it applies to every future course. Because it lives in your
home directory, **Coursewerk updates (`git pull`) never overwrite it.** The harness improves *and*
your personalization compounds, independently.

## You stay in control

- **Steer by talking.** Tell the agent "make the slides 50-minute lectures," "emphasize worked
  examples," "drop chapter 12" — it absorbs the instruction and revises the package.
- **Edit by hand.** Every output is plain Markdown in `guide/`. Open any file in VS Code (or any
  editor) and fix a word, swap a figure, or tweak a layout directly. The agent won't clobber your edits.
- **Copyright-clean by construction.** Every figure is self-generated or openly-licensed (with
  attribution recorded in `guide/ATTRIBUTION.md`); the quality gate flags anything unattributed.

## Layout

```
CLAUDE.md / AGENTS.md     # entry instructions your AI agent reads first
PROCEDURE.md              # the pipeline the agent follows (the heart of Coursewerk)
VERSION                   # for auto-update checks
bootstrap/init.sh         # creates the workspace folders + checks for updates
skills/                   # bundled harness skills (orz-markdown, oer-figures, oer-qa, courseguide-standards)
scripts/check_oer.mjs     # automated quality gate
format-contracts/         # the exact format each deliverable must honor
templates/                # the brief you fill in
```

## License

Coursewerk (the harness) is released under the MIT License. The teaching packages **you** produce
inherit the license of **your** source materials (e.g. an OpenStax CC BY-NC-SA textbook → a
CC BY-NC-SA package); Coursewerk records and enforces that for you.
