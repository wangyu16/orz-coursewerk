---
name: courseguide-standards
description: "The house DOCUMENT STANDARD for course_guide / study_guide teaching packages — the canonical structure, section order, and orz-markdown styling for each of the five per-chapter deliverables (study guide, slides, concept map, assessment guide, practice sheet) in the Alembic package layout (study-guide/ slides/ concepts/ assessment-support/ practice/, one <slug>.md per chapter), with slides authored in the orz-slides deck grammar. Includes a self-check checklist. Invoke when AUTHORING or CRITIQUING any chapter of a course/study guide so every chapter is CONSISTENT (same skeleton, same styling palette, same assessment format). Pairs with orz-markdown (syntax) and oer-figures (figures). Derived from the operator's gold-standard chapter."
---

# courseguide-standards — one consistent shape for every chapter

Every chapter of a teaching package ships **five** files; each must follow the SAME skeleton
and the SAME restrained styling so the whole guide reads as one coherent work. Author against
the templates below, then run the **Checklists** (end of file) before finishing. A reviewer
flags any chapter that deviates. Match the exemplar chapter.

The five files land in the Alembic package layout (see `format-contracts/deliverables.md` for the
authoritative contract):

- study guide → `study-guide/<slug>.md`
- slides → `slides/<slug>.md`
- concept map → `concepts/<slug>.md`
- assessment guide → `assessment-support/<slug>.md`
- practice sheet → `practice/<slug>.md`

Two global rules:
- **Filenames** are the chapter **slug**: `<slug>.md` (lowercase, hyphen-joined,
  `^[a-z0-9]+(?:-[a-z0-9]+)*$`) — the SAME slug across all five folders, matching that chapter's
  `slug` in `alembic.json` (`chapters[].slug`). Never numeric `ch{i}`, never ad-hoc names, no
  duplicates.
- **Restrained palette, but VIVID content.** Restraint applies to *decorative text devices* (don't
  scatter badges, colored spans, `==highlight==`, or underline unless each carries real meaning).
  It does **not** mean a dry, all-text guide. **Make the study guide and slides vivid:**
  - **Real figures, generously.** Every section that benefits gets a *visible* figure — a generated
    structure/scheme (`oer-figures` RDKit → `assets/`), a real data plot (matplotlib → `assets/`, or an
    inline `{{chart}}`), a diagram (`{{mermaid}}`, or a hand-authored SVG in `assets/`), or an
    open-licensed real image (Wikimedia/OpenStax, with attribution). Aim for **several figures per
    chapter**, captioned, referenced as `![alt](../assets/…)`. Inline `{{smiles}}`/`{{chart}}`/`{{mermaid}}`
    supplement figures; they don't replace them. (See `skills/oer-figures`.)
  - **Everyday-life examples.** Anchor each concept in a **relatable real-world example or analogy** (a
    scuba tank, a weather balloon, cooking, a car battery, a photo of a real object) so it lands and sticks.
  - **Slides are visual, not bullet dumps.** Use varied rich layouts (`2col`/`main-side`/`quad` splits,
    `@region`s, `{{mermaid}}`, `{{chart}}`, figures, step reveals, callouts, badges) — see
    `skills/orz-slides` "Slide design patterns". Most slides should carry a visual, not just a title + bullets.
  - Consistency > flourish, and *meaning* > decoration — but a memorable OER is **vivid**, not spartan.

---

## 1. STUDY GUIDE — `study-guide/<slug>.md` (orz-markdown, rich)

Ordered sections (exact skeleton):

1. **`# Chapter N: <Title>`** — H1, the textbook chapter number + title.
2. **Reference box** — a `:::info` container, always these lines:
   ```
   :::info
   **Reference:** <Textbook, Edition>, Chapter N (<license>)
   **Audience:** <one line>
   **Package license:** CC BY-NC-SA 4.0
   **Note:** <optional — e.g. slug/indexing note; content is textbook Chapter N>
   :::
   ```
3. **Chapter Learning Objectives** — a `:::success` container titled `**Chapter Learning Objectives**` + a bullet list (one bullet per objective).
4. **`## Chapter Logic`** — 2–4 sentences of the chapter's conceptual arc + ONE mermaid flowchart (full ```mermaid``` / `{{mermaid}}` form, not `{{mm}}`) + an optional `:::warning` for a model boundary.
5. **Sections**, one per textbook section, IN ORDER:
   - `## N.M <Section Title>` — the H2 section heading **MAY** carry a stable block ID marker
     appended to it: `## N.M <Section Title>{{attrs[#blk-a1b2c3d4]}}`, where the id is
     `#blk-` + 8+ lowercase base36 characters (`[0-9a-z]`), unique within the file. These block
     ids are **optional but recommended**: they are durable citation/provenance anchors that
     survive later edits (Alembic and citations resolve to them), so a link to a section keeps
     pointing at the same content even after the prose around it changes. Omit them and the
     section still works; add them and the section becomes stably citable.
   - a `:::success` `**Learning Objectives**` container with the section's sub-objectives,
   - prose explaining the concepts along the logic, with figures (`![alt](../assets/..)` + caption), tables, inline `{{smiles}}`/`$\ce{}$` as needed,
   - worked example(s) in `:::: tabs` → `::: tab Problem` / `::: tab Solution`,
   - a short **Self-check:** bullet list (prompts only, NO answers).
6. **`## Synthesis`** — a short integrative section tying the sections together (the single thread through the chapter).
7. **`## Asset and License Record for This Chapter`** — a table `| Asset | Source URL | License | Attribution |` listing EVERY embedded image (self-generated rows marked "self-generated, CC BY-NC-SA 4.0"). This table feeds attribution (it also mirrors the package's `metadata/ATTRIBUTION.md`).
8. **NO practice-question section.** The study guide teaches; questions live in the assessment guide.

Styling palette (use exactly this way every chapter):
- `:::info` — the reference box + neutral factual asides. `:::success` — learning objectives (chapter & section) and a key "takeaway" link. `:::warning` — model boundaries, common mistakes, cautions. `:::danger` — only for genuinely critical/safety "do not".
- `:::: tabs` / `::: tab <Label>` — worked Problem/Solution pairs. **Colon counts: outer `tabs` = 4 colons, inner `tab` = 3; close each tab pane with `:::` (3) and close `tabs` with `::::` (4).** The outer fence MUST have more colons than the inner, and each close must match its open's count — otherwise the container silently fails to close. NEVER `{{tabs}}`.
- `:::: cols` / `::: col` — side-by-side compare/contrast, sparingly.
- `**bold**` — a defined term on first use, and key results. KaTeX `$…$`/`$$…$$` + `$\ce{…}$` (mhchem) for all formulae. Tables for data/comparison. mermaid for the chapter-logic flowchart + processes.
- Figures: from the **oer-figures** skill (RDKit SVG for structures/repeat-units/schemes — use `grid` for multiple structures so they never overlap; matplotlib for charts; openly/NC-licensed real images). Figures live in the top-level `assets/` folder and are referenced as `../assets/…`. Every figure has a caption.

---

## 2. SLIDES — `slides/<slug>.md` (orz-slides deck grammar — deck SOURCE, not HTML)

The slides file is the **deck source** in the **orz-slides deck grammar** (built to `.slides.html`
via orz-slides for preview — you author the lean source, never the HTML).

- **The file opens with a deck frontmatter block:**
  ```
  <!-- deck
  title: <Chapter Title>
  ratio: 16:9
  -->
  ```
  Do NOT bake a `theme:` line — the theme is applied at generation time, not in the source.
- **Slides are separated by the marker `<!-- slide -->`** on its own line (NOT a bare `---`).
- **Title / divider slide:** `<!-- slide template=title -->` followed by a `# H1` (and an optional
  `## subtitle`).
- **Content slide:** a plain `<!-- slide -->` marker followed by `## H2` as the slide title, then
  short scannable bullets or one figure + caption.
- **Closing slide:** `<!-- slide template=closing -->`.
- **ONE CONCEPT PER SLIDE (binding).** Each slide presents a single concept / subtopic / worked
  idea. If a slide would carry two ideas, or its text overflows, **SPLIT it into two (or more)
  slides**. Keep on-slide text scannable: a short title, a few short bullets or one figure + a
  caption — not paragraphs. A crowded slide is a defect; prefer more, lighter slides (the exemplar
  runs ~1.5–2× as many slides as a naive deck).
- **Reuse ONLY the study guide's `../assets/` figures** (same relative paths); introduce no new
  graphics.
- **Sequence:** title → objectives → a **`template=outline` roadmap** of the sections/topics → a
  chapter-logic slide → for each section (a `template=section` divider + one slide per concept + **at least
  one worked EXAMPLE QUESTION**: a question slide, then its solution via a `step` reveal or a follow-up
  slide) → a synthesis / closing slide.
- **Teach with questions, and use rich layouts** — see `skills/orz-slides` "Slide design patterns". Most
  slides carry a visual (figure/chart/diagram/split), not just bullets; use `{{smiles}}` for a single
  structure.

Concrete example (new grammar):
```
<!-- deck
title: Chapter 5: Gases
ratio: 16:9
-->

<!-- slide template=title -->
# Chapter 5: Gases
## Pressure, the ideal gas law, and kinetic theory

<!-- slide -->
## Chapter Logic
- Macroscopic gas behavior → one equation of state
- Ideal gas law ties P, V, n, T together
- Kinetic-molecular theory explains *why*

<!-- slide -->
## The Ideal Gas Law
- $PV = nRT$ links all four state variables
- Solve for any one given the other three
- $R = 0.082057\ \text{L·atm·mol}^{-1}\text{K}^{-1}$

<!-- slide -->
## Molar Volume at STP
![Molar volume of an ideal gas](../assets/molar-volume.svg)
One mole of an ideal gas occupies 22.4 L at STP.

<!-- slide template=closing -->
# One thread: state variables never move alone
```

---

## 3. CONCEPT MAP — `concepts/<slug>.md` (SIMPLE markdown — NO graphics)

No mermaid, no `{{smiles}}`, no images, no orz containers — plain markdown that renders anywhere.
Ordered sections:
1. `# Chapter N Concept Map: <Title>`
2. `## Source and Scope` — textbook ref, indexing note, sections covered, "simple Markdown only" disclaimer.
3. `## Chapter Summary` — 2–3 paragraphs of the conceptual arc.
4. `## Prerequisites and Later Payoff` — table `| Connection | Concepts needed or enabled | Why it matters |` (rows: prior chapter(s), this chapter, later chapter(s)).
5. `## Core Dependency Chain` — nested bullets: concept → "This enables:" → downstream concepts.
6. `## Logical Order for Teaching` — table `| Order | Introduce | Reason for placement |`.
7. `## Section-Level Concept Map and Objectives` — per section `### N.M`: **Learning objectives:** bullets, then **Concept flow:** nested bullets.
8. `## Common Student Bottlenecks` — table `| Bottleneck | Conceptual repair |`.

---

## 4. ASSESSMENT GUIDE — `assessment-support/<slug>.md` (SIMPLE markdown — NO graphics)

Design guidance, NOT a finished question bank, NOT answer keys. Ordered sections:
1. `# Chapter N Assessment Guide: <Title>`
2. `## Source and Format` — ref, audience, "design guidance, not a question bank" disclaimer.
3. `## General Assessment Priorities` — a few high-level goals.
4. One section **per learning objective**: `## Objective N.Ma: <exact LO text>`, each containing:
   - `### Target understanding` — what mastery looks like (prose/bullets).
   - `### Question guides` — **SEVERAL parameterized generators** (see below) covering the common ways this concept is tested — the heart of the assessment guide.
   - `### Design guidance by purpose` — table `| Purpose | Cognitive level | How to design the task |` with rows Homework, Group discussion, Quiz, Exam, Project/activity.
5. `## Rubric Themes for Chapter N` — table `| Evidence of mastery | What to look for |`.

### Question guides (parameterized — generate MANY questions; SEVERAL per objective)

Give **several** question guides per objective — enough to cover the **common ways this concept
is tested**, so an instructor can build a quiz, exam, or assignment from them. Don't stop at one.
A question guide is a recipe an instructor (or a generator) instantiates into many concrete
questions. The applicable **question modes** to cover (pick those that fit the concept — most have
4–7):
- **Forward calculation** — given inputs, compute the target quantity.
- **Inverse / rearrangement** — solve for a *different* unknown from the same relationship.
- **Conceptual / predict-the-trend** — hold others fixed, change one, predict the direction (no numbers).
- **Graphical** — read, interpret, or sketch the relationship / a curve.
- **Comparison / ranking** — compare or rank two+ scenarios.
- **Real-world / applied** — embed in an everyday, research, or special context (space, deep sea, …).
- **Multi-step / synthesis** — combine with another concept from this or a prior chapter.
- **Error analysis** — find the mistake in a worked solution or a wrong claim.
- **Estimation / limiting case** — extremes, order-of-magnitude, "what happens as X → 0/∞".
- **Definition / recall** — state the law/term (lower-order; for quiz warm-ups).

For EACH question guide give:
- **Variables & ranges** — the quantities to vary, each with a realistic range + units.
- **Constraint / relationship** — the equation or rule the generated values must satisfy, and
  which values are GIVEN vs which is SOLVED for (rotate which one is unknown).
- **Contexts** — vary the scenario: everyday life, a research setting, or a special regime
  (e.g. in space, deep sea, high altitude) so the same physics reads fresh.
- **Answer formats** — at least: *multiple choice* (quiz/exam), *short answer* — final value + unit
  (quiz/exam), *worked solution* — show the procedure (assignment/quiz/exam). NOT limited to these.
- **One worked instantiation** — a single concrete question generated from the guide, with its answer.

Worked example — ONE objective (ideal gas law), with a SET of guides spanning the modes (this
is the expected richness; trim to the modes that fit each objective):
```
#### Guide A — Forward calculation (any one unknown)
- Variables & ranges: P (0.5–10 atm), V (0.5–50 L), n (0.05–5 mol), T (200–1000 K).
- Constraint: pick 3 in range, compute the 4th from PV = nRT (R = 0.082057 L·atm·mol⁻¹·K⁻¹);
  rotate which is the unknown so the same guide yields P-, V-, n-, and T-solving questions.
- Contexts: scuba tank at depth; weather balloon; gas cylinder on a spacecraft; lab syringe.
- Formats: MULTIPLE CHOICE (correct value + 3 unit/setup-error distractors); SHORT ANSWER
  (value + unit); WORKOUT (known/unknown, rearrange, substitute, carry units).
- Worked instantiation: "A 12.0 L tank holds 0.50 mol at 300 K. Find P." → P = nRT/V = 1.03 atm.

#### Guide B — Conceptual / predict-the-trend (no numbers)
- Hold two of P,V,n,T fixed, change one, predict the third's direction; ask WHY (kinetic-molecular).
- Formats: MULTIPLE CHOICE (increase/decrease/no change); SHORT ANSWER (one-sentence reason).
- Instantiation: "A sealed rigid flask is heated. What happens to P, and why?"

#### Guide C — Comparison / two states (combined gas law)
- Generate state 1 (P1,V1,T1) and a changed state with one or two variables altered; solve the rest.
- Contexts: a balloon carried from sea level to altitude; a bubble rising from the deep sea.
- Formats: SHORT ANSWER; WORKOUT (P1V1/T1 = P2V2/T2).

#### Guide D — Error analysis
- Present a worked solution with ONE planted mistake (e.g. T left in °C, or atm/kPa mismatch);
  ask students to find and fix it. Formats: SHORT ANSWER (name the error) or WORKOUT (correct it).
```
Provide a comparable SET for every objective: several guides covering the modes that fit the
concept (quantitative objectives → forward/inverse/comparison/graphical/error; qualitative
objectives → conceptual/comparison/applied/definition that vary the *scenario or representation*).

---

## 5. PRACTICE QUESTION SHEET — `practice/<slug>.md` (orz-markdown, student-facing)

A ready-to-use practice set students can self-test on. It is **generated from the chapter's
assessment-guide question guides** — instantiate the guides into CONCRETE questions (real numbers
in range, satisfying the stated constraint; a chosen context; a specific format).

- **~15 questions per chapter**, distributed to cover ALL major objectives (note which objective /
  section each question targets, e.g. a small `**(Obj 8.2 · short answer)**` tag).
- **Spread the modes & formats** — a realistic mix of forward calculation, inverse, conceptual,
  comparison, applied, error-analysis, etc., in multiple-choice / short-answer / workout forms,
  reflecting the chapter's question guides (don't make all 15 the same kind).
- **Question body + answer in TABS**, exactly like the study guide's worked-example tabs, so the
  answer is hidden until revealed:
  ```
  :::: tabs
  ::: tab Q3
  A 2.0 L vessel holds 0.30 mol of an ideal gas at 350 K. What is the pressure (atm)?
  :::
  ::: tab Answer
  $P = nRT/V = (0.30)(0.082057)(350)/2.0 = 4.3\ \text{atm}$. (workout: list knowns, rearrange
  $PV=nRT$, substitute, carry units.)
  :::
  ::::
  ```
  For multiple-choice items, put the stem + options in the **Q** tab and the correct letter +
  one-line why in the **Answer** tab.
- Open with the chapter title + a one-line note that these are auto-generated from the assessment
  guide and grouped by objective. Use KaTeX/`$\ce{}$` as in the study guide; you MAY reuse a
  `../assets/` figure if a question needs it, but new figures are not required. Real, correct
  answers only — never fabricate a value; show the work for calculations.

## Checklists (run before finishing a chapter; a reviewer checks the same)

**Study guide (`study-guide/<slug>.md`):** H1 title · `:::info` reference box (Reference/Audience/Package
license) · `:::success` Chapter Learning Objectives · `## Chapter Logic` + mermaid · each section =
`## N.M` (optional stable `{{attrs[#blk-…]}}` id) + `:::success` section objectives + prose +
`:::: tabs` worked example + Self-check · `## Synthesis` · `## Asset and License Record` table covering
every image · NO practice-question section · tabs use container syntax (not `{{tabs}}`) · figures
captioned via `../assets/`, grids non-overlapping.

**Slides (`slides/<slug>.md`):** `<!-- deck -->` frontmatter (title + ratio, no theme) · `<!-- slide -->`
markers between slides · `## H2` content-slide titles · `template=title` / `template=outline` (roadmap) /
`template=section` (dividers) / `template=closing` · ONE concept per slide (split if crowded) · short
scannable text · **layout variety (most slides carry a figure/chart/diagram/split, not just bullets)** ·
**≥1 worked example question per section** (question → `step`/follow-up solution) · figures shown
(`{{smiles}}` for single structures) · title → objectives → outline → chapter-logic → per-section
(concepts + example) → synthesis/closing.

**Concept map (`concepts/<slug>.md`):** simple markdown only (no mermaid/smiles/images/containers) · Source
and Scope · Chapter Summary · Prerequisites and Later Payoff table · Core Dependency Chain · Logical Order
for Teaching table · Section-Level objectives + concept flow · Common Student Bottlenecks table.

**Assessment guide (`assessment-support/<slug>.md`):** simple markdown only · Source and Format · General
Assessment Priorities · one `## Objective N.Ma` per LO, each with Target understanding + **SEVERAL
parameterized Question guides** covering the common question modes
(forward/inverse/conceptual/graphical/comparison/applied/error/…), each with variables+ranges, constraint,
contexts, formats MC/short/workout, one worked instantiation + Design guidance by purpose table ·
`## Rubric Themes` table · no finished answer keys.

**Practice sheet (`practice/<slug>.md`):** ~15 concrete questions instantiated from the assessment-guide
question guides · covers all major objectives (each tagged with its objective) · mixed modes & formats
(MC/short/workout) · each question's body + answer in `:::: tabs` (Q tab / Answer tab) · answers correct
with work shown · no fabricated values.
