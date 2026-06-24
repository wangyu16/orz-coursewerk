---
name: courseguide-standards
description: "The house DOCUMENT STANDARD for course_guide / study_guide teaching packages — the canonical structure, section order, and orz-markdown styling for each of the four per-chapter deliverables (study guide, slides, concept map, assessment guide), plus a self-check checklist. Invoke when AUTHORING or CRITIQUING any chapter of a course/study guide so every chapter is CONSISTENT (same skeleton, same styling palette, same assessment format). Pairs with orz-markdown (syntax) and oer-figures (figures). Derived from the operator's gold-standard chapter (ch4)."
---

# courseguide-standards — one consistent shape for every chapter

Every chapter of a teaching package ships **five** files; each must follow the SAME skeleton
and the SAME restrained styling so the whole guide reads as one coherent work. Author against
the templates below, then run the **Checklists** (end of file) before finishing. A reviewer
flags any chapter that deviates. The exemplar is **ch4** — match it.

Two global rules:
- **Filenames** are numeric: `guide/<kind>/ch{i}.md` (ch0, ch1, …) — never slugs, no duplicates.
- **Restrained palette.** Use the small set of devices below *with meaning*, the same way in
  every chapter. Do NOT decorate: no badges, no colored-text spans, no `==highlight==`, no
  underline, unless it carries real information. Consistency > flourish.

---

## 1. STUDY GUIDE — `guide/chapters/ch{i}.md` (orz-markdown, rich)

Ordered sections (exact skeleton):

1. **`# Chapter N: <Title>`** — H1, the textbook chapter number + title.
2. **Reference box** — a `:::info` container, always these lines:
   ```
   :::info
   **Reference:** <Textbook, Edition>, Chapter N (<license>)
   **Audience:** <one line>
   **Package license:** CC BY-NC-SA 4.0
   **Note:** <optional — e.g. file is ch{i}.md by zero-based index; content is textbook Chapter N>
   :::
   ```
3. **Chapter Learning Objectives** — a `:::success` container titled `**Chapter Learning Objectives**` + a bullet list (one bullet per objective).
4. **`## Chapter Logic`** — 2–4 sentences of the chapter's conceptual arc + ONE mermaid flowchart (full ```mermaid``` / `{{mermaid}}` form, not `{{mm}}`) + an optional `:::warning` for a model boundary.
5. **Sections**, one per textbook section, IN ORDER:
   - `## N.M <Section Title>`
   - a `:::success` `**Learning Objectives**` container with the section's sub-objectives,
   - prose explaining the concepts along the logic, with figures (`![alt](../assets/..)` + caption), tables, inline `{{smiles}}`/`$\ce{}$` as needed,
   - worked example(s) in `::::: tabs` → `:::: tab Problem` / `:::: tab Solution`,
   - a short **Self-check:** bullet list (prompts only, NO answers).
6. **`## Synthesis`** — a short integrative section tying the sections together (the single thread through the chapter).
7. **`## Asset and License Record for This Chapter`** — a table `| Asset | Source URL | License | Attribution |` listing EVERY embedded image (self-generated rows marked "self-generated, CC BY-NC-SA 4.0").
8. **NO practice-question section.** The study guide teaches; questions live in the assessment guide.

Styling palette (use exactly this way every chapter):
- `:::info` — the reference box + neutral factual asides. `:::success` — learning objectives (chapter & section) and a key "takeaway" link. `:::warning` — model boundaries, common mistakes, cautions. `:::danger` — only for genuinely critical/safety "do not".
- `::::: tabs` / `:::: tab <Label>` — worked Problem/Solution pairs (outer 5 colons, inner 4, close inner `:::`, close outer `::::`). NEVER `{{tabs}}`.
- `:::: cols` / `::: col` — side-by-side compare/contrast, sparingly.
- `**bold**` — a defined term on first use, and key results. KaTeX `$…$`/`$$…$$` + `$\ce{…}$` (mhchem) for all formulae. Tables for data/comparison. mermaid for the chapter-logic flowchart + processes.
- Figures: from the **oer-figures** skill (RDKit SVG for structures/repeat-units/schemes — use `grid` for multiple structures so they never overlap; matplotlib for charts; openly/NC-licensed real images). Every figure has a caption.

---

## 2. SLIDES — `guide/slides/ch{i}.md` (orz-markdown that previews AS the slides)

- `---` separates slides. `# H1` = title/divider slide; `## H2` = content-slide title.
- Before each slide a `<!-- LAYOUT: <named regions with proportions> -->` comment; anchor each block with `<!-- <region>; <what + size> -->`. All comments are hidden in preview.
- **ONE CONCEPT PER SLIDE (binding).** Each slide presents a single concept / subtopic / worked idea. If a slide would carry two ideas, or its text overflows its regions, **SPLIT it into two (or more) slides**. Keep on-slide text scannable: a short title, a few short bullets or one figure + a caption — not paragraphs. A crowded slide is a defect; prefer more, lighter slides (the exemplar runs ~1.5–2× as many slides as a naive deck).
- **Reuse the study guide's `../assets/` figures** (same relative paths); introduce no new graphics.
- Sequence: title slide → a chapter-logic slide → for each section a divider slide + one slide per concept → a chapter-synthesis slide.

---

## 3. CONCEPT MAP — `guide/concept-maps/ch{i}.md` (SIMPLE markdown — NO graphics)

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

## 4. ASSESSMENT GUIDE — `guide/assessment/ch{i}.md` (SIMPLE markdown — NO graphics)

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

## 5. PRACTICE QUESTION SHEET — `guide/practice/ch{i}.md` (orz-markdown, student-facing)

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
  ::::: tabs
  :::: tab Q3
  A 2.0 L vessel holds 0.30 mol of an ideal gas at 350 K. What is the pressure (atm)?
  ::::
  :::: tab Answer
  $P = nRT/V = (0.30)(0.082057)(350)/2.0 = 4.3\ \text{atm}$. (workout: list knowns, rearrange
  $PV=nRT$, substitute, carry units.)
  ::::
  :::::
  ```
  For multiple-choice items, put the stem + options in the **Q** tab and the correct letter +
  one-line why in the **Answer** tab.
- Open with the chapter title + a one-line note that these are auto-generated from the assessment
  guide and grouped by objective. Use KaTeX/`$\ce{}$` as in the study guide; you MAY reuse a
  `../assets/` figure if a question needs it, but new figures are not required. Real, correct
  answers only — never fabricate a value; show the work for calculations.

## Checklists (run before finishing a chapter; a reviewer checks the same)

**Study guide:** H1 title · `:::info` reference box (Reference/Audience/Package license) · `:::success`
Chapter Learning Objectives · `## Chapter Logic` + mermaid · each section = `## N.M` + `:::success`
section objectives + prose + `::::: tabs` worked example + Self-check · `## Synthesis` · `## Asset and
License Record` table covering every image · NO practice-question section · tabs use container syntax
(not `{{tabs}}`) · figures captioned, grids non-overlapping.

**Slides:** `---` between slides · LAYOUT + region comments · ONE concept per slide (split if crowded) ·
short scannable text · reuses `../assets/` figures only · title + chapter-logic + per-section + synthesis.

**Concept map:** simple markdown only (no mermaid/smiles/images/containers) · Source and Scope ·
Chapter Summary · Prerequisites and Later Payoff table · Core Dependency Chain · Logical Order for
Teaching table · Section-Level objectives + concept flow · Common Student Bottlenecks table.

**Assessment guide:** simple markdown only · Source and Format · General Assessment Priorities · one
`## Objective N.Ma` per LO, each with Target understanding + **SEVERAL parameterized Question guides**
covering the common question modes (forward/inverse/conceptual/graphical/comparison/applied/error/…),
each with variables+ranges, constraint, contexts, formats MC/short/workout, one worked instantiation +
Design guidance by purpose table · `## Rubric Themes` table · no finished answer keys.

**Practice sheet:** `guide/practice/ch{i}.md` · ~15 concrete questions instantiated from the
assessment-guide question guides · covers all major objectives (each tagged with its objective) ·
mixed modes & formats (MC/short/workout) · each question's body + answer in `::::: tabs` (Q tab /
Answer tab) · answers correct with work shown · no fabricated values.
