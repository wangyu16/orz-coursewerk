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
2. **One concept per slide — presented COMPLETELY.** Each slide holds a single concept, but give it enough
   to stand on its own: its key points *plus* a figure, a worked example, or a callout that fill the slide.
   Split only when a slide genuinely carries two ideas or overflows — do **not** thin one concept across
   several near-empty slides. (One well-built slide beats two half-empty ones.)
3. **Balanced density — not crowded, NOT empty.** This is the Goldilocks rule. Fill the layout grid: a
   content slide carries about **3–5 short bullets**, OR a visual + 2–4 bullets + a caption/callout — enough
   to feel *complete*. A slide with just a title and one floating bullet in a sea of whitespace is a defect —
   consolidate it. The upper limit is ~6 bullets / ~55 words (crowding); the lower limit is "looks empty."
   **Fill every region you open** — never open a `2col`/`main-side`/`quad` split and leave a region nearly
   blank; each region gets real content (bullets, a figure + caption, a callout, an equation).
   *(Exception: the **structural** slides — the title, the `template=outline` roadmap, the `template=section`
   dividers, and the closing — are intentionally minimal. Keep them; don't pad them and don't strip them to
   chase a slide count.)*
4. **Every slide is VISUAL — do not default to a title + bullet list.** A deck of bullet slides is a defect.
   Reach for the full layout vocabulary and pick the layout that fits the idea: a `2col`/`main-side` split for
   compare-or-figure-beside-text, a `{{mermaid}}` for a process, a `{{chart}}` for data, a `{{smiles}}` or a
   figure for a structure, a big centered equation for a key result, step reveals for a build-up. Vary the
   layout across slides — see **Slide design patterns** below. Use orz-markdown plugins liberally (callout
   boxes, badges, colored text, `==highlight==`) to signal logic and emphasis. Aim for a figure, diagram,
   chart, or split on **most** slides, not a bullet list.
5. **Show figures — reuse the study guide's, and add slide-only visuals when they help.** Prefer the study
   guide's `../assets/` figures (same paths); a slide may also carry an inline `{{smiles}}`/`{{chart}}`/
   `{{mermaid}}` of its own (use `{{smiles}}` for a single structure — see `oer-figures`). Size figures
   legible but not dominating (see Images).
6. **Give the deck a spine, and teach with questions.** Open with a **`template=outline`** roadmap of the
   sections/topics so the audience knows the plan, and use `template=section` dividers between sections. And
   **include worked EXAMPLE QUESTIONS** — at least one per section for a quantitative concept, *ideally on
   one filled slide*: the question plus a `step`-revealed solution (split into two only if the solution is
   long). Slides should *teach and practice*, not only present concepts.

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

<!-- slide template=outline -->
# What we'll cover
- 1.1 …
- 1.2 …
- (the sections/topics, as a roadmap)

<!-- slide -->
## <Chapter logic — the arc in one picture>
{{mermaid ...}}

... per section: a `template=section` divider, then one slide per concept, then a worked EXAMPLE QUESTION ...

<!-- slide -->
## Example — <concept>
<!-- @main -->
**Q.** <a concrete question>
<!-- @side -->
*(reveal the answer)* → step it out
<!-- slide step -->
## Example — solution
1. …
2. …  ⟶  **answer**

<!-- slide template=closing -->
# Summary
- the through-line in 3 bullets
```

Sequence: **title → objectives → `template=outline` roadmap of the sections/topics → chapter-logic → for
each section (a `template=section` divider + one slide per concept + at least one worked EXAMPLE QUESTION) →
synthesis/closing.**

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

## Slide design patterns (pick a layout that fits the idea — don't be conservative)

Match the content to a layout. A chapter deck should use a *mix* of these, not the same bullet slide 20×.

| The idea is… | Layout / device | Sketch |
|---|---|---|
| **Compare two things** (SN1 vs SN2, ionic vs molecular, accuracy vs precision) | `2col` split, one per column | `<!-- slide 2col -->` `## …` `<!-- @left -->` **A** … `<!-- @right -->` **B** … |
| **Concept + its picture** | `main-side` split (text : figure ≈ 2:1) | `<!-- slide main-side -->` `## …` `<!-- @main -->` bullets `<!-- @side -->` `![alt](../assets/x.svg =360x)` |
| **A process / sequence / cycle** | `{{mermaid}}` flowchart, full-slide or in a region | `<!-- slide -->` `## How it works` `{{mermaid graph LR; A-->B-->C}}` |
| **Data / a trend** | `{{chart}}` in one region, the takeaway in the other | `<!-- slide 2col 3/2 -->` chart left, `:::success` **key result** right |
| **A structure / molecule** | `{{smiles}}` or a figure, captioned | `<!-- slide -->` `## …` `{{smiles CCO}}` *ethanol* |
| **A key equation / result** | big centered KaTeX + a one-line gloss | `<!-- slide -->` `## The ideal gas law` `$$PV = nRT$$` `:::info P, V, n, T are linked :::` |
| **Build up an argument** | **step reveal** — `<!-- slide step -->` (bullets appear one at a time) | for derivations, "what does each observation tell us?", multi-step reasoning |
| **A definition / a fact to catch** | a **badge** + bold term + one line | `{{sp[info] Definition}}` **Isotope** — same Z, different A |
| **Four related items** | `quad` split (tl/tr/bl/br) | e.g. the four states of matter, or four periodic families |
| **The roadmap / agenda** | `template=outline` — list the sections/topics up front | `<!-- slide template=outline -->` `# What we'll cover` + the section list |
| **A worked example question** | *prefer ONE filled slide*: question + a `step`-revealed solution together | `<!-- slide step -->` `## Example` **Q.** … (given) · then the solution steps as revealed bullets → **answer** + a `:::success` takeaway. Split into two slides only if the solution is genuinely long. Fill the slide — question + full worked steps + answer, not one line floating. |
| **Section change** | `template=section` divider slide | `<!-- slide template=section -->` `# 2.5 The Periodic Table` |
| **A pitfall / caution** | `:::warning` callout, alone or beside content | mass number vs atomic mass; sig-fig traps |

Emphasis toolkit (use for meaning, not decoration): `:::info/:::success/:::warning/:::danger` callouts,
`{{sp[success] ✓ badge}}` badges, `{{sp[blue] colored term}}`, `==highlight==`, `**bold**`. A slide that is
just a title and 6 plain bullets should almost always become a split, a figure, a chart, or a step reveal.

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

Same logic + full coverage as the study guide · one concept per slide, presented COMPLETELY (don't thin it
across near-empty slides) · **BALANCED density — every slide fills its grid (≈3–5 bullets or a visual + a few
bullets + a callout); no crowded slides AND no near-empty ones; every layout region you open carries real
content** · example questions on one filled slide where they fit · scannable phrasing, within budget · **opens
with a `template=outline` roadmap of the sections/topics; `template=section`
dividers between sections** · **at least one worked EXAMPLE QUESTION per section** (question → solution via a
`step` reveal or follow-up slide) · **layout VARIETY — most slides carry a figure, chart, diagram, split, or
step reveal, not just bullets; the deck uses a mix of the design patterns above** · rich elements used
semantically (compare→`2col`, process→`{{mermaid}}`, data→`{{chart}}`, single structure→`{{smiles}}`,
pitfall→`:::warning`, key term→`==`/`{{sp}}`) · figures shown and sized legible-not-dominating · title →
objectives → outline → logic → per-section (concepts + example question) → closing · valid deck grammar
(`<!-- deck -->`, `<!-- slide -->`, one `## H2` per content slide). The QA gate checks the grammar; you own
the pedagogy and the visual richness.
