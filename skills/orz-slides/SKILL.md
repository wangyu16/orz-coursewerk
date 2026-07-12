---
name: orz-slides
description: How to author a course SLIDE DECK as orz-slides deck-grammar markdown (slides/<slug>.md) from a chapter's study guide — the deck frontmatter, slide markers and templates, the layout/region grammar for rich two-column and multi-region slides, image sizing, step reveals and speaker notes, and the pedagogy that matters most (one concept per slide, follow the study-guide logic, concise + scannable, use orz-markdown rich elements to make the logic pop without crowding). Invoke whenever building or revising slides.
---

# orz-slides — course slides that teach, not crowd

You are turning a chapter's **study guide** into a **slide deck source** (`slides/<slug>.md`) written in
the **orz-slides deck grammar**. coursewerk ships this lean `.md`; Alembic (or `orz-slides` locally) builds
the `.slides.html`.

**Full grammar reference:** after `npm install`, the tool's own complete skill is at
`node_modules/orz-slides/orz-slides-skills/SKILL.md` — read it for the exhaustive spec. This file is the
**course-authoring layer**: the essentials + the pedagogy.

## The pedagogy (this is what makes slides good)

1. **Follow the study guide's logic, cover everything.** The deck walks the same concept order as the study
   guide and hits every concept/subconcept — slides are the study guide made glanceable, not a new outline.
2. **One concept per slide.** Each slide presents a single concept, subconcept, or worked idea. If a slide
   would carry two ideas — or its text overflows — **split it into two**. A crowded slide is a defect; a good
   chapter deck runs ~1.5–2× the slide count of a naive deck.
3. **Concise + scannable.** A short `## title`, then a few short bullets or one figure + caption — never
   paragraphs. Budget ≈ ≤6 bullets / ≤55 words / one visual per slide. Say it in phrases, not sentences.
4. **Use rich layout to carry logic, not decorate.** A `2col` split for compare/contrast, a `:::warning` for
   a pitfall, an objective **badge**, a `==highlight==` on the one key term — each earns its place. Even more
   restrained than the study guide (a slide is read in seconds).
5. **Reuse the study guide's figures.** Same `../assets/` paths; introduce no new graphics. Size them to be
   legible but not dominating (see Images).

## Deck structure & sequence

```
<!-- deck
title: <Chapter Title>
ratio: 16:9
author: <optional>
footer: <optional — appears on every content slide>
-->

<!-- slide template=title -->
# <Chapter Title>
## <one-line subtitle>

<!-- slide -->
## Learning objectives
- ...

<!-- slide -->
## <Chapter logic — the arc in one picture>
{{mermaid ...}}

... per section: an optional divider, then one slide per concept ...

<!-- slide template=closing -->
# Summary
- the through-line in 3 bullets
```

Sequence: **title → objectives → chapter-logic → for each section (optional `template=section` divider +
one slide per concept) → synthesis/closing.**

## Grammar essentials

- **Frontmatter** `<!-- deck ... -->`: `title`, `theme`, `ratio` (`16:9`/`4:3`), `author`, `footer`,
  `transition`. Omit `theme` unless asked — coursewerk/Alembic applies it at build time.
- **Slide marker** `<!-- slide [options] -->` is also the separator (no bare `---`). Options: `template=`,
  `2col`/`main-side`/`3col`/`quad` presets (optional ratio, e.g. `2col 3/2`), `step` (reveal), `class=`,
  `id=`, `bg=<color>`, `fit=fit|scroll|off`.
- **Templates** (`template=`): `title` (h1 + subtitle + byline), `section` (divider), `outline` (agenda
  list), `closing`. Each has visual variants via `v=1..6`. A **normal** slide takes exactly one `## H2`
  (its title) — `#` H1 is only for `template=title`.
- **Layout / regions** — split the slide, then fill named regions:
  ```
  <!-- slide 2col 3/2 -->
  ## Two mechanisms compared
  <!-- @left -->
  **SN1** — {{sp[blue] stepwise}}
  - rate = k[substrate]
  <!-- @right -->
  **SN2** — {{sp[green] concerted}}
  - rate = k[substrate][nucleophile]
  ```
  Presets: `2col [a/b]` → left|right, `main-side [a/b]` (default 2/1) → main|side, `3col` → left|mid|right,
  `quad` → tl|tr|bl|br. Raw grammar for custom splits: `col 3/2 { main; side }`, `row auto/1 { head; body }`
  (tracks use `/`; count must match regions). Reserved regions: `<!-- @notes -->` (speaker notes, off-slide),
  `<!-- @footer -->` (per-slide footer), `<!-- @float left=.. top=.. w=.. h=.. -->` (overlay).
- **Rich elements in any region** (full orz-markdown): `:::info/:::success/:::warning/:::danger`, badges &
  colored text `{{sp[success] ✓}}` / `{{sp[blue] term}}`, `==highlight==`, `++underline++`, `:::: cols`,
  `:::: tabs`, KaTeX `$...$`, mhchem `$\ce{}$`, `{{mermaid}}`, `{{smiles}}`, `{{chart type: bar ...}}`.
- **Step reveal**: `<!-- slide step -->` reveals bullets/blocks one at a time; or tag one block with
  `{{attrs[.fragment]}}`. Use sparingly, for genuine build-up.

## Images & sizing (be deliberate)

- Embed with orz-markdown; **size explicitly** so content stays clear: `![alt](../assets/fig.svg =520x)`
  (width only keeps aspect) or `=520x300`. Not too big (don't swamp the slide), not too small (must be
  legible from the back of a room).
- **Side-by-side image + text**: put the figure in one region of a `2col`/`main-side` split, text in the
  other — don't inline a big image above a wall of text.
- Prefer **SVG** (crisp at any size). One primary visual per slide.

## Themes

Deck themes: `paper` (default), `architect`, `executive`, `sage`, `poppy` (light), `neon`, `chalk` (dark).
Leave the theme to build time unless the user picks one.

## Before finishing a deck (self-check)

Same logic + full coverage as the study guide · one concept per slide (split the crowded ones) · scannable
phrasing, within budget · rich elements used semantically (compare→`2col`, pitfall→`:::warning`, key
term→`==`/`{{sp}}`) not as decoration · figures reused from `../assets/`, sized legible-not-dominating ·
title → objectives → logic → per-section concepts → closing · valid deck grammar (`<!-- deck -->`,
`<!-- slide -->`, one `## H2` per content slide). The QA gate checks the grammar; you own the pedagogy.
