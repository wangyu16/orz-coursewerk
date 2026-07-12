---
name: orz-paged
description: How to author PAGINATED PRINT documents (exams, quizzes, handouts, syllabi, worksheets, lab sheets) as orz-paged markdown — the {{nyml kind: document}} settings block, the built-in templates (exam-*, report-*, article-*, note, letter, cv), page breaks, running headers/footers and page numbers, the exam question elements with an instructor answer-key toggle, and which rich elements are safe for print. Invoke when creating a COLLECTION document that will print or be a PDF. NOT for the fixed package items (study guide, slides, practice) — those have their own formats.
---

# orz-paged — paginated print documents (for collections)

orz-paged makes **print-oriented, paginated** documents. In the Alembic model these are **collection**
documents — exams, quizzes, handouts, **syllabi**, worksheets, lab sheets — not the fixed package items
(the study guide, slides, and practice have their own formats; never author those with orz-paged).

A source is one markdown file with `{{nyml kind: ...}}` config/element blocks + ordinary orz-markdown body;
`orz-paged` builds a self-contained `.paged.html` (print → Save as PDF).

**Full grammar reference:** after `npm install`, the tool's own complete skill is at
`node_modules/orz-paged/orz-paged-skills/SKILL.md`, and starters via `npx orz-paged --list-templates` /
`--new <template>`. This file is the course-authoring layer.

## Pick the template by document

There is **no** `syllabus`/`worksheet`/`lab` template — build those from the closest base:

| You want | Use template | Notes |
|---|---|---|
| Exam / quiz | `exam-page` (cover + numbered Qs) or `exam-section` (inline header) | Use the `question-mc` / `question-open` elements + the **answer-key toggle** (below). |
| **Syllabus** | `report-page` (cover + TOC + body) | Title element `placement: page`, `front_matter: clean`, tables for schedule/grading. |
| Handout / reading | `note` (A4, minimal) or `article-section` | Clean prose + figures. |
| Formal report / lab manual | `report-page` / `report-section` | Cover + TOC. |
| Letter, CV | `letter` / `cover-letter`, `cv` / `cv-modern` / `cv-elegant` | As needed. |

## Document settings — `{{nyml kind: document}}`

One block at the top configures the whole document. Common keys (defaults in parentheses):

```
{{nyml
kind: document
template: exam-page
theme: light-academic-1
page_size: Letter            (A4 default; A3/A5/Letter/Legal or "210mm 297mm")
header_center: CHEM 101 — Exam 1
footer_left: Fall 2026
page_number_position: footer-center   (header/footer-left|center|right, or none)
page_number_style: page-n-of-N        (simple | page-n | page-n-of-N | n-of-N | brackets | ...)
front_matter: clean                    (strip chrome from cover pages, renumber body from 1)
dynamic_choices: |
  answer-key: hide                      (see the exam answer-key toggle)
}}
```

Also available: `margin_*` (mm), `font_size` (pt), `line_height`, `decoration_color`, `header_rule` /
`footer_rule`, `repeat_table_header`, `custom_css`. **No landscape key** — for landscape use a custom
`page_size: "297mm 210mm"`.

Optional portable metadata block (before `document`): `{{nyml kind: meta}}` with `title`, `author`,
`license`, `license_name`, `source`, `date`, `keywords`.

## Print constructs

- **Page break:** `::: page-break` / `:::` starts a fresh page.
- **Dedicated cover page:** set `placement: page` on a title/TOC element; `front_matter: clean` renumbers
  the body from 1.
- **Headers/footers:** six text slots (`header_left/center/right`, `footer_left/center/right`), optional
  0.5pt rule lines.
- **Page numbers:** position + style (see above).
- **Flow:** `repeat_table_header`, `avoid_table_row_breaks`, `keep_image_together` (all default on).

## Exams — questions + the answer-key toggle (the important pattern)

Set `dynamic_choices: | answer-key: hide` in the document block, then author questions as elements. Their
model answers carry `answer-key=show`, so **one source prints two ways** — the blank exam (`hide`) and the
instructor key (`show`):

```
{{nyml
kind: exam-title
title: CHEM 101 — Exam 1
duration: 60 minutes
total_points: 100 points
student_fields: |
  Name | Student ID | Score / 100
instructions: |
  Answer all questions. MC = 5 pts each.
placement: page
}}

{{nyml
kind: question-mc
n: 1
pts: 5 pts
body: Which best describes an ideal gas?
options: |
  A. A plausible distractor.
  B. The correct statement.
  C. A close-but-wrong option.
answer: B
}}

{{nyml
kind: question-open
n: 2
pts: 10 pts
body: State the ideal gas law and define each term.
space: 5cm
answer: PV = nRT; P pressure, V volume, n moles, R constant, T temperature (K).
}}
```

Flip `answer-key: hide` → `show` (or the in-file toggle) to print the key. **Exam content and answer keys
are instructor-only** — in a coursewerk package they live under `private/` (never a public folder).

## Rich elements — print-safe vs screen-only

Safe in print: headings, lists, tables, blockquotes, code, KaTeX `$...$` + mhchem `$\ce{}$`, `{{mermaid}}`,
`{{smiles}}`, `{{chart}}`, `{{qr}}`, images, footnotes, `:::info/success/warning/danger` callouts,
`:::: cols`. **Avoid in print** (screen-only): `:::: tabs`, `::: spoil` (spoiler), `{{youtube}}` — they
hide content on paper.

## Themes

Light, ink-on-paper: `light-academic-1` (default), `light-academic-2`, `light-neat-1/2/3`,
`beige-decent-1/2`, or `none`. No dark themes (by design — this is print).

## Where paged docs live

These are **collection** documents in Alembic: syllabus + handouts go in the **current term**
(`current/<term>/…`); exams and answer keys go in **`private/`**. coursewerk may pre-generate a syllabus or
an exam into the right folder; otherwise the instructor authors them in the workspace.
