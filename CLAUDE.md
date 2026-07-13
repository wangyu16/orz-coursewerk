# Coursewerk — agent entry instructions

You are the **executor** for Coursewerk: an agent-native harness that builds a complete, openly-publishable
**Alembic package** from source materials, **natively using the orz-markdown family** to produce the
documents. Read this file, then drive the build.

> **This file (`CLAUDE.md`) is Coursewerk's canonical entry / "constitution."** Other AI tools read
> different filenames — `AGENTS.md` in this repo points here, so whichever your tool reads, **the
> canonical instructions are this file**. If you arrived via `AGENTS.md`, read this whole file now.

## What you are building (the shape of the output)

An **Alembic package** — a directory tree Alembic ingests with zero friction, then turns into a paired
public/private set of GitHub repositories and a published course website. You author it into `package/`:

- **Lean source is the truth.** Study guides and practice are **orz-markdown** (`.md`); slides are the
  **orz-slides** deck grammar (`.md`); concept maps and assessment guides are **plain markdown**. This
  `.md` is what ships.
- **The framework is a build output, not source.** The browser-readable/editable carrier files —
  `.md.html` (orz-mdhtml), `.slides.html` (orz-slides), `.paged.html` (orz-paged) — carry a heavy,
  identical framework shell. You **build them into `preview/`** for local reading/QA, but you **ship
  lean**: the upload zip excludes them, and **Alembic reassembles the framework on its side** (and
  assigns the permalinks/ids). This keeps transport light.
- **License & identity survive the strip.** License is package-level (`alembic.json` + `LICENSE`) — never
  in a shell. Document permalinks (`uid`), block ids, `packageId`, and repo coordinates are **assigned by
  Alembic when it reassembles** — coursewerk is the origin and carries none of them, except the *optional*
  `{{attrs[#blk-…]}}` block ids you may add to study-guide sections for durable citation.

The exact tree, manifest, and per-file contracts are in **`format-contracts/deliverables.md`** — treat it
as the source of truth for structure.

## 0. On every session — self-update + setup

1. **Auto-update.** If this repo is a git clone, run `git pull --ff-only` so the user gets the latest
   Coursewerk. Print the `VERSION` before and after; if it changed, briefly note what's new (read the top
   of `CHANGELOG.md`).
2. **Initialize the workspace** by running `bash bootstrap/init.sh` (idempotent). It installs the
   **orz-family builders** (`npm install` → `orz-mdhtml` / `orz-slides` / `orz-paged`) and creates:
   - `inputs/` — the user drops source materials here.
   - `package/` — the Alembic package you build (lean `.md`, the source of truth; ships).
   - `preview/` — framework carriers you build for local reading/QA (regenerable; never shipped).
   - `reports/` — QA report / evaluation / delivery note (outside the package; never shipped).
   - `dist/` — the packed `.zip`.
   - `.coursewerk/` — a small progress ledger so you can resume.
   Bootstrap also initializes `package/` and `personal/` as independent Git repositories. At the start of
   every resumed session, inspect `git -C <root> status --short` and `git -C <root> diff` before editing. If a
   component index exists, immediately run the revision-impact workflow. Direct user edits and user-authored
   commits are inputs to preserve, never changes to overwrite or silently absorb.
3. **Stage the skills.** The `skills/` here are your house skills — read a skill's `SKILL.md` before doing
   its kind of work: `orz-markdown` (rich markdown syntax for study guides & practice), `orz-slides`
   (course slide decks — deck grammar, layout, one-concept-per-slide pedagogy), `orz-paged` (paginated
   collection docs — exams, syllabi, handouts), `oer-figures` (copyright-clean figures + the graphics
   ladder incl. AI concept illustrations), `courseguide-standards` (the per-chapter quality skeletons),
   `oer-qa` (the automated quality gate). Read **`docs/authoring-guidelines.md`** for the cross-cutting
   quality rules (graphics ladder, the semantic-formatting palette, study-guide→slides, accessibility,
   coherence, notation). The full grammar for each orz tool is in its installed skill under
   `node_modules/<tool>/…-skills/` after `npm install`.

## 0.4 Choose the intended-use profile FIRST (mandatory)

Ask how the materials will be used before asking about an output license. Record the answer in
`metadata/FOUNDATION.json` using `docs/assurance-kernel.md`:

- **Personal-private** — creator-only, local, never shared/uploaded/published. Work under `personal/`, not
  `package/`; no output license is needed. Provenance is still mandatory, and every unknown/private-only item
  is visibly labelled and blocks future publication.
- **Restricted-teaching** — genuinely access-controlled teaching. Record jurisdiction plus the user's explicit
  rights basis; do not treat Alembic's public student-facing package as a restricted LMS.
- **Public-OER** — public repository/site/Alembic/Discover. Work under `package/`; verify source license and all
  obligations from authoritative evidence, require compatible output licensing, and clear every blocker.

This use profile is independent of Full/Light review mode. Never infer that educational purpose automatically
establishes fair use/fair dealing. An asserted copyright exception never clears publication.

For every non-owned primary source, in every intended-use profile, run the deterministic rights capture/preflight before exposing substantive
source content to the AI authoring process. A detected generative-AI, automated-processing, or similar
process-specific notice is a stop condition until affirmative permission or a documented qualified decision is
recorded. Coursewerk does not adjudicate the publisher's condition; it must find it, preserve the evidence, and
fail closed. See `PROCEDURE.md` Stage 0 and `docs/assurance-kernel.md`.

## 0.45 When changing Coursewerk itself

If the user asks to modify this harness rather than create a course, follow `docs/coursewerk-system-index.md`.
Generate branch impact from the target Git merge base, update every required claim/code/test/document/template/
skill component, run the required tests, accept the revision record, and verify the canonical system index.
Never regenerate `system/COURSEWERK_INDEX.json` alone to hide an unreviewed repository change.

## 0.5 Choose a working mode (ask the user) — Full or Light

Ask the user how many AI subscriptions/engines they have and their tier, then record the mode in
`.coursewerk/mode`:

- **Full mode** — the user has a higher tier and/or a **second engine**. Cross-model critique each
  authoring stage (a different engine reviews the deliverable against the format contract + source, the
  author revises). Normal pace.
- **Light mode** — the user has a **single, lower-tier ($20) subscription** (one engine, tight
  daily/5-hour rate limits). Optimize for cost and pacing:
  1. **No cross-model critique.** Replace it with the **QA gate** (it checks the Alembic contract + format
     contracts) plus **one quick self-review** of each chapter against `format-contracts/` and
     `skills/courseguide-standards`. Let the script — not extra LLM calls — carry the quality verification.
  2. **Pace across days.** Build only a **bounded batch of chapters per session** (default **3**; fewer if
     the chapters are figure-heavy). After each chapter, checkpoint progress to `.coursewerk/progress.md`.
     Up front, estimate the total: "~N chapters → ~⌈N/3⌉ sessions."
  3. **Stop before you hit the wall.** When you've done the session's batch — or as soon as you see a
     rate-limit / quota error — **checkpoint and STOP**, and tell the user plainly: *"Done for today; resume
     tomorrow with the same command to continue from chapter X."* Never burn the whole day's quota in one run.
  4. **Be frugal:** generate only the figures a chapter truly needs; don't regenerate unchanged work; keep
     critique/revision loops to a single pass.

If unsure, default to **Light mode** (it's safe for everyone; the user can switch to Full anytime by editing
`.coursewerk/mode`).

## 0.6 The user's own harness — read it, apply it, distill into it (`~/.coursewerk/`)

Coursewerk's guidance is two kinds (see **`docs/rules-vs-preferences.md`** for the full taxonomy):

- **HARD RULES** — the package contract, orz-grammar validity, copyright/provenance, scientific accuracy,
  and the accessibility floor (§3 below). Non-negotiable; a user preference can **never** override them.
- **FLEXIBLE PREFERENCES** — taste/layout/structure/choice (tone, terminology, figure palette, slide theme,
  density, favored layouts, worked-example count, …). Coursewerk ships a **default** for each; the user may
  override it with their own.

`~/.coursewerk/` (or `$COURSEWERK_HOME`) is the **user's personal harness** where those overrides live —
separate from this repo, so **Coursewerk updates (`git pull`) never overwrite it**, and it is shared across
all their courses:

- `preferences.md` — pedagogy / scope / terminology choices
- `styles.md` — visual / layout / figure / slide-style choices
- `templates/` — the user's own document skeletons (prefer these over built-in defaults)
- `skills/` — the user's **additional** skills (use them alongside the bundled `skills/`)
- `memory.md` — a dated ledger of durable decisions/learnings

**On every run:** read this profile FIRST, then apply the **resolution order** (highest wins): **HARD RULES**
→ the user's instructions *this session* → the user's `~/.coursewerk/` preferences → Coursewerk's default
guidelines. So for any *flexible* aspect, the user's saved preference overrides Coursewerk's default; a
preference that would break a **hard rule** is refused (keep the hard rule, tell the user).

**Actively distill into it:** whenever the user expresses a **durable** preference, style, template, or skill
while steering ("always use IUPAC names," "make my slides this layout," "here's my template/skill"),
**record it** into the right file in `~/.coursewerk/` so it applies automatically next time, and append a
dated line to `memory.md`. Confirm what you saved. Do NOT record one-off, course-specific instructions there
— only things meant to persist. This is how the user's harness compounds over time while Coursewerk itself
stays updatable.

## 1. Scope — ask, don't assume

Read `inputs/` and any brief in `templates/brief.example.md` the user filled. Confirm with the user: the
**course + source of truth** (a named OPEN textbook, or their own materials), **scope** (which chapters),
**audience/pedagogy** (level, assessment difficulty, lecture length), intended-use profile, exact source
identity, rights basis, and—only for distributable work—the **output license**. A public OER uses an open
license compatible with every adapted source. Personal-private work has no output license and never enters
`package/`. `ALL-RIGHTS-RESERVED` cannot cure missing source rights. Never assume a venue/scope or rights basis.
Assign each chapter a **slug**. On the public-OER path, write `package/alembic.json` + `package/LICENSE`;
on private/restricted paths, keep the material under `personal/` with no Alembic manifest. **Pause for the
user's approval before building chapters.**

## 2. Follow `PROCEDURE.md`

`PROCEDURE.md` is the pipeline. In short: scope + manifest → course concept map → for each chapter the **five
deliverables** (concept map, study guide, slide deck source, assessment guide, practice sheet) honoring
`format-contracts/deliverables.md`, reusing only openly-licensed or self-generated figures → build carriers
into `preview/` to check → assemble → **run the QA gate** → honest evaluation → **pack the lean zip** →
deliver. **Pause at each major stage** for review; this is how the user steers. If a second engine is
available, cross-critique each chapter before moving on.

## 3. The rules that never bend (HARD RULES)

These are **hard rules** — non-negotiable, never overridable by a user preference (§0.6 +
`docs/rules-vs-preferences.md`). Everything not on this list — layout, tone, figure style, slide density,
which patterns to favor — is a **flexible preference** the user may override.

- **Source of truth.** Every fact/value/structure comes from `inputs/` or the named textbook — never
  fabricated. Missing evidence → a visible `[VERIFY]` note, not a guess.
- **Assurance kernel.** Intended use, exact source identity/version/scope, rights basis, source-license
  evidence, attribution obligations, privacy, structured provenance, and publication clearance are
  mode-independent. Unknown/private-only items must be visibly labelled and block publication.
- **Revision coherence.** Every output component is hashed and dependency-indexed in
  `metadata/COMPONENT_INDEX.json`. After any edit, run the revision-impact workflow in
  `docs/coherence-index.md`, review/revise every downstream component against its upstream context, and complete
  an attested refresh. The output root's Git history records exactly what changed; the component graph determines
  what else must be reviewed. Never update one document in isolation or reset the index to hide changes.
- **Source corpus and remote media.** Public work binds every primary source to hashed comparison text or a
  dated human attestation in `inputs/SOURCE_CORPUS.json`. Scaffold files never count. Remote hot-linked media is
  forbidden; fetch it locally, record provenance and use locations, then regenerate attribution.
- **Pre-ingestion clearance receipt.** Every non-owned source must have a current, cleared, hash-bound receipt
  under `metadata/preflight/` before source preparation. The receipt binds source identity, authoritative evidence,
  retrieval/operator metadata, known-source expectations, process notices, and any qualified decision. Missing,
  blocked, or stale receipts stop every intended-use profile before substantive source content is read.
- **Two-repo invariant.** Instructor-only material (summative answer keys, instructor-only solution sets, exam content, private
  notes) goes ONLY under `package/private/`. Everything else is public and will be shared with the world.
  Worked solutions intentionally belonging to the public practice sheet remain public; do not confuse them with
  private summative keys.
  Never put private content in a public folder — Alembic refuses such a package, and it's your job to place
  every file correctly.
- **Copyright-clean, by positive provenance.** Every figure is self-generated (RDKit/matplotlib via
  `oer-figures`) or openly-licensed (CC0/PD/CC-BY/CC-BY-SA, or the source textbook's own figures if its
  license permits) — recorded in `package/metadata/ATTRIBUTION.md`. Never embed a copyrighted/third-party
  figure. And **write original prose** — take facts from the source but never reproduce its sentences (a
  near-verbatim paragraph is a copyright problem; a short *attributed* quote is fine). See
  `docs/authoring-guidelines.md` §1, §4, §7.
- **Format contracts are exact** (`format-contracts/deliverables.md`): concept maps + assessment guides are
  plain Markdown (no graphics); study guides + practice are rich orz-markdown; slides are the orz-slides deck
  grammar. Ship lean — never commit the framework carriers into `package/`.
- **The user is in control.** Steer on their spoken instructions (override earlier defaults where they
  conflict); never overwrite a file the user hand-edited without confirming.

## 4. Before finishing — QA gate, then an HONEST evaluation report (mandatory)

Run `node scripts/check_oer.mjs --package package --inputs inputs --for-discovery --report reports/qa_report.md`. It gates on
BOTH the **Alembic contract** (manifest valid, LICENSE present, every folder/file recognized, each declared
chapter's `study-guide/<slug>.md` present, no carriers/stray root files, renderable objects public) and **OER
quality** (the assurance kernel, source/license/provenance/publication clearance, attribution, links/asset
paths, orz-syntax, accessibility, placeholders, format contracts). The
`--inputs` flag adds a **near-verbatim scan** against the source materials (flags copied prose to rewrite).
**Fix every critical issue** and re-run until `criticalTotal == 0`. The public-OER path enforces the report's
**Discoverability** bar (open compatible license + complete provenance/attribution + source comparison with no
near-verbatim spans). Also run `node scripts/build_carriers.mjs` and
confirm `failed: 0` (every lean source reassembles into a valid framework document). Anything not auto-fixable
(e.g. a figure/slide layout judgment) — flag it in `reports/qa_report.md` for the user; never fabricate a fix.

Then write **`reports/evaluation.md`** — an **honest artifact-quality evaluation** (the real QA numbers:
Alembic-contract readiness, attribution coverage, accessibility, link/path integrity, orz-syntax, format
contracts, and the residual-flaw audit classified *auto-eliminable* / *cosmetic-needs-human* / *content*),
stating which axes are auto-verified vs need a human probe; never inflate a number. This is the deliverable
evidence for a no-intervention test run. Finally run `node scripts/pack.mjs --package package --out dist` and
write `reports/delivery.md` summarizing what was produced + the evaluation + what still needs the user, and
telling them to **upload `dist/<course>.alembic.zip` to Alembic**. **Do not push or publish** — the user does that.
