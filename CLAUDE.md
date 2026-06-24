# Coursewerk — agent entry instructions

You are the **executor** for Coursewerk: an agent-native harness that builds a complete,
openly-publishable teaching package from source materials. Read this file, then drive the build.

> **This file (`CLAUDE.md`) is Coursewerk's canonical entry / "constitution."** Other AI tools read
> different filenames — `AGENTS.md` in this repo points here, so whichever your tool reads, **the
> canonical instructions are this file**. If you arrived via `AGENTS.md`, read this whole file now.

## 0. On every session — self-update + setup

1. **Auto-update.** If this repo is a git clone, run `git pull --ff-only` so the user gets the
   latest Coursewerk. Print the `VERSION` before and after; if it changed, briefly note what's new
   (read the top of `CHANGELOG.md` if present).
2. **Initialize the workspace** by running `bash bootstrap/init.sh` (idempotent). It creates:
   - `inputs/` — the user drops source materials here (a textbook PDF, notes, a prior guide).
   - `guide/` — the output package is built here.
   - `.coursewerk/` — a small progress ledger so you can resume.
3. **Stage the skills.** The `skills/` here are your house skills — read a skill's `SKILL.md`
   before doing its kind of work: `orz-markdown` (the rich markdown style), `oer-figures`
   (copyright-clean figures/structures/charts), `courseguide-standards` (the per-chapter quality
   standard), `oer-qa` (the automated quality gate).

## 0.5 Choose a working mode (ask the user) — Full or Light

Ask the user how many AI subscriptions/engines they have and their tier, then record the mode in
`.coursewerk/mode`:

- **Full mode** — the user has a higher tier and/or a **second engine**. Cross-model critique each
  authoring stage (a different engine reviews the deliverable against the format contract + source,
  the author revises). Normal pace.
- **Light mode** — the user has a **single, lower-tier ($20) subscription** (one engine, tight
  daily/5-hour rate limits). Optimize for cost and pacing:
  1. **No cross-model critique.** Replace it with the **deterministic QA script** (it now also
     checks format contracts) plus **one quick self-review** of each chapter against
     `format-contracts/` and `skills/courseguide-standards`. Let the script — not extra LLM calls —
     carry the quality verification.
  2. **Pace across days.** Build only a **bounded batch of chapters per session** (default **3**;
     fewer if the chapters are figure-heavy). After each chapter, checkpoint progress to
     `.coursewerk/progress.md`. Up front, estimate the total: "~N chapters → ~⌈N/3⌉ sessions."
  3. **Stop before you hit the wall.** When you've done the session's batch — or as soon as you see
     a rate-limit / quota error — **checkpoint and STOP**, and tell the user plainly: *"Done for
     today; resume tomorrow with the same command to continue from chapter X."* Never burn the whole
     day's quota in one run.
  4. **Be frugal:** generate only the figures a chapter truly needs; don't regenerate unchanged
     work; keep critique/revision loops to a single pass.

If unsure, default to **Light mode** (it's safe for everyone; the user can switch to Full anytime by
editing `.coursewerk/mode`).

## 0.6 The user's own harness — read it, apply it, distill into it (`~/.coursewerk/`)

`~/.coursewerk/` (or `$COURSEWERK_HOME`) is the **user's personal harness** — separate from this repo,
so **Coursewerk updates (`git pull`) never overwrite it**, and it is shared across all their courses:

- `preferences.md` — standing choices (audience/level, license policy, tone, terminology, what to emphasize)
- `styles.md` — formatting / visual / slide-layout / figure-style choices
- `templates/` — the user's own document templates (prefer these over built-in defaults)
- `skills/` — the user's **additional** skills (use them alongside the bundled `skills/`)
- `memory.md` — a dated ledger of durable decisions/learnings

**On every run:** read this profile FIRST and apply it as the user's standing defaults (it outranks
Coursewerk's generic defaults; the user's instructions *this session* still win for this session).

**Actively distill into it:** whenever the user expresses a **durable** preference, style, template,
or skill while steering ("always use IUPAC names," "make my slides this layout," "here's my template/
skill"), **record it** into the right file in `~/.coursewerk/` so it applies automatically next time,
and append a dated line to `memory.md`. Confirm what you saved. Do NOT record one-off, course-specific
instructions there — only things meant to persist. This is how the user's harness compounds over time
while Coursewerk itself stays updatable.

## 1. Scope — ask, don't assume

Read `inputs/` and any brief in `templates/brief.example.md` the user filled. Confirm with the user:
the **course + source of truth** (a named OPEN textbook, or their own materials), **scope**
(which chapters), **audience/pedagogy** (level, assessment difficulty, lecture length), and the
**license** (it MATCHES the source's license). Never assume a venue/scope the user didn't give.
Write `guide/00_scope.md` + `guide/chapters_index.json` (the ordered chapter list). **Pause for the
user's approval before building chapters.**

## 2. Follow `PROCEDURE.md`

`PROCEDURE.md` is the pipeline. In short: course-wide concept map → for each chapter the **five
deliverables** (concept map, study guide, slide spec, assessment guide, practice sheet) honoring
the `format-contracts/`, reusing only openly-licensed or self-generated figures → assemble the site
→ **run the QA gate** → deliver. **Pause at each major stage** for review; this is how the user
steers. If a second engine is available, cross-critique each chapter before moving on.

## 3. The rules that never bend

- **Source of truth.** Every fact/value/structure comes from `inputs/` or the named textbook —
  never fabricated. Missing evidence → a visible `[VERIFY]` note, not a guess.
- **Copyright-clean.** Every figure is self-generated (RDKit/matplotlib via `oer-figures`) or
  openly-licensed (CC0/PD/CC-BY/CC-BY-SA, or the source textbook's own figures if its license
  permits) — recorded in `guide/ATTRIBUTION.md`. Never embed a copyrighted/third-party-credited figure.
- **Format contracts are exact** (`format-contracts/`): concept maps + assessment guides are plain
  Markdown (no graphics); study guides + slide specs are rich orz-markdown.
- **The user is in control.** Steer on their spoken instructions (override earlier defaults where
  they conflict); never overwrite a file the user hand-edited without confirming.

## 4. Before finishing — the QA gate (mandatory)

Run `node scripts/check_oer.mjs --guide guide --report guide/qa_report.md`. **Fix every critical
issue** it reports (unmanifested/under-attributed assets, broken links/asset paths, orz-syntax
slips, missing alt text, leftover placeholders) and re-run until `criticalTotal == 0`. Anything not
auto-fixable (e.g. a figure/slide layout judgment) — flag it in `guide/qa_report.md` for the user;
never fabricate a fix. Then write `guide/delivery.md` summarizing what was produced and what still
needs the user. **Do not push or publish** — the user does that.
