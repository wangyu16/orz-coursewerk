# Format contracts — exact

Each deliverable MUST honor its contract. The split is deliberate and the QA gate + critique enforce it.

| # | File | Format | Contract |
|---|------|--------|----------|
| 1 | `guide/concept-maps/ch{i}.md` | **Plain Markdown, NO graphics** (any parser, readable raw) | Concept/topic dependency logic + per-section objectives. Headings, nested lists, tables, text arrows (→) only — no mermaid, no images, no `{{plugins}}`. |
| 2 | `guide/chapters/ch{i}.md` | **orz-markdown**, visually rich | Concise lecture-note study guide derived from the concept map; opens with objectives; figures + worked **example questions** (container tabs); full orz feature use (KaTeX/mhchem, `{{smiles}}`, mermaid, `:::info/:::success`, columns, badges). |
| 3 | `guide/slides/ch{i}.md` | **orz-markdown** (output-agnostic) | Previews as the slides: `---` between slides; H1 = title page, H2 = slide title; each slide opens with `<!-- LAYOUT: ... -->` naming proportioned regions; each block preceded by a hidden `<!-- region; size -->` anchor. Comprehensive; **reuse only the study guide's figures** (same `guide/assets/` paths). One concept per slide. |
| 4 | `guide/assessment/ch{i}.md` | **Plain Markdown, NO graphics** | Per objective, **how to design** questions/activities (assignments, discussion, quizzes, exams, projects) at the right cognitive level — guidance, **NOT a question bank**. Several parameterized question guides per objective. |
| 5 | `guide/practice/ch{i}.md` | **orz-markdown** | ~15 concrete questions instantiated from the assessment guide, covering all major objectives; each Q + worked answer in container tabs (`::::: tabs` / `:::: tab`); correct, work shown. |
| — | `guide/concept-maps/course.md` | **Plain Markdown, NO graphics** | Course-wide concept map + overall summary + keywords/tags. |

## Copyright (non-negotiable)
Every visual is **self-generated** (RDKit/matplotlib via `oer-figures`) or **openly-licensed**
(CC0 / Public Domain / CC-BY / CC-BY-SA — Wikimedia Commons, Openverse) or the **source textbook's
own** figure *if its license permits and it carries no third-party credit line*. Each is recorded
in `guide/ATTRIBUTION.md` (asset · source URL · license · attribution). Copyrighted/paywalled or
third-party-credited assets are **never** embedded. The package license **matches the source's**.

## orz-markdown
Use the bundled `skills/orz-markdown` style for files 2, 3, 5. Containers use the colon-fence syntax
(`::::: tabs` / `:::: tab <Label>` / `:::`), never `{{tabs}}`; the outer fence has more colons than
the inner. The QA gate flags unclosed containers and escaped pipes.
