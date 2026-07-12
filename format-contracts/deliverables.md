# Format contracts — exact

Coursewerk builds an **Alembic package**: a directory tree Alembic ingests with zero friction.
Each deliverable MUST honor its contract below. The QA gate (`scripts/check_oer.mjs`) enforces
both the **Alembic contract** (will it upload?) and these **format contracts** (is it good OER?).

## The package tree

You author into `package/` — the **lean** Alembic package, which is the source of truth and the
thing that ships. (Framework carriers are built separately into `preview/`; see the last section.)

```
package/
  alembic.json                 # the manifest (required) — see §manifest
  LICENSE                      # full license text matching alembic.json (required)
  README.md                    # optional landing note (allowed at root)
  study-guide/<slug>.md        # per chapter — the study guide (orz-markdown, rich)
  concepts/<slug>.md           # per chapter — concept map (plain markdown, no graphics)
  concepts/course.md           # course-wide concept map (plain markdown)
  slides/<slug>.md             # per chapter — slide deck SOURCE (orz-slides deck grammar)
  practice/<slug>.md           # per chapter — practice sheet (orz-markdown)
  assessment-support/<slug>.md # per chapter — assessment guide (plain markdown, no graphics)
  assets/…                     # figures/structures/plots/media (self-generated or open-licensed)
  metadata/ATTRIBUTION.md      # asset · source · license · attribution  (NOT at root — see note)
  private/…                    # instructor-only: answer keys, exams, notes (NEVER shared)
```

**Folder → repo is decided by the top-level folder and is total.** `study-guide/ slides/ practice/
concepts/ assessment-support/ assets/ metadata/ current/` are **public** (shared with the world);
`private/` is **PRIVATE** (instructor-only). Never put instructor-only material anywhere but
`private/`. Any other top-level folder, or a stray file at the root, is **rejected** by Alembic
(fail-closed) — stick to the tree above. `<slug>` is lowercase, hyphen-joined
(`^[a-z0-9]+(?:-[a-z0-9]+)*$`), and matches the chapter's `slug` in `alembic.json`.

> **Attribution & reports live where the contract allows.** The only files permitted at the package
> root are `alembic.json`, `LICENSE`, `README.md`, `CITATION.cff`, `.gitignore`. So the asset record
> goes in **`metadata/ATTRIBUTION.md`**, not at the root. The QA report / evaluation / delivery note
> are written to **`reports/`** (a sibling of `package/`, never shipped).

## The manifest — `package/alembic.json`

```json
{
  "schemaVersion": 2,
  "packageId": "pending",
  "title": "Introductory General Chemistry",
  "license": "CC-BY-NC-SA-4.0",
  "description": "One-paragraph plain-text summary (~200 words).",
  "keywords": ["chemistry", "gases", "thermodynamics"],
  "discipline": "chemistry",
  "unitTerm": "chapter",
  "courseContext": {
    "courseName": "General Chemistry I",
    "level": "introductory",
    "instructor": "…", "courseNumber": "…", "department": "…"
  },
  "chapters": [
    { "slug": "gases", "title": "Gases" },
    { "slug": "thermochemistry", "title": "Thermochemistry" }
  ],
  "createdAt": "2026-07-12T00:00:00Z"
}
```

- **Required:** `schemaVersion` (use `2`), `packageId` (a placeholder — Alembic re-stamps it),
  `title`, `license`, `createdAt` (ISO-8601 ending in **`Z`** — a `+00:00` offset is rejected).
- **`license`** must be one of exactly: `CC-BY-4.0`, `CC-BY-SA-4.0`, `CC-BY-NC-4.0`,
  `CC-BY-NC-SA-4.0`, `CC0-1.0` — and it **matches the source's** license.
- **Do NOT set `publicRepo` / `privateRepo`** — Alembic assigns repository coordinates.
- `chapters` is the ordered chapter list; each declared chapter MUST have `study-guide/<slug>.md`.

| # | File | Format | Contract |
|---|------|--------|----------|
| 1 | `concepts/<slug>.md` | **Plain Markdown, NO graphics** (any parser, readable raw) | Concept/topic dependency logic + per-section objectives. Headings, nested lists, tables, text arrows (→) only — no mermaid, no images, no `{{plugins}}`. |
| 2 | `study-guide/<slug>.md` | **orz-markdown**, visually rich | Concise study guide derived from the concept map; opens with objectives; figures + worked **example questions** (container tabs); full orz feature use (KaTeX/mhchem, `{{smiles}}`, mermaid, `:::info/:::success`, columns). Each `## H2` section MAY carry a stable block ID `{{attrs[#blk-…]}}`. Built to `.md.html` via **orz-mdhtml** for preview. |
| 3 | `slides/<slug>.md` | **orz-slides deck grammar** | Deck SOURCE, not HTML. Opens with a `<!-- deck\ntitle: …\nratio: 16:9\n-->` block; slides separated by the `<!-- slide -->` marker (NOT bare `---`); `# H1` on a `<!-- slide template=title -->` = title slide; `## H2` = content-slide title; `<!-- slide template=closing -->` for the closing slide. One concept per slide. **Reuse only the study guide's `../assets/` figures.** Built to `.slides.html` via **orz-slides** for preview. |
| 4 | `assessment-support/<slug>.md` | **Plain Markdown, NO graphics** | Per objective, **how to design** questions/activities (assignments, discussion, quizzes, exams, projects) at the right cognitive level — guidance, **NOT a question bank**. Several parameterized question guides per objective. |
| 5 | `practice/<slug>.md` | **orz-markdown** | ~15 concrete questions instantiated from the assessment guide, covering all major objectives; each Q + worked answer in container tabs (`::::: tabs` / `:::: tab`); correct, work shown. Built to `.md.html` via **orz-mdhtml** for preview. |
| — | `concepts/course.md` | **Plain Markdown, NO graphics** | Course-wide concept map + overall summary + keywords/tags. |
| — | `private/…` | Plain Markdown | Answer keys, full solutions, exam content, instructor notes — **PRIVATE**, never in a public folder. |

## Copyright (non-negotiable)
Every visual is **self-generated** (RDKit/matplotlib via `oer-figures`) or **openly-licensed**
(CC0 / Public Domain / CC-BY / CC-BY-SA — Wikimedia Commons, Openverse) or the **source textbook's
own** figure *if its license permits and it carries no third-party credit line*. Each is recorded
in `metadata/ATTRIBUTION.md` (asset · source URL · license · attribution). Copyrighted/paywalled or
third-party-credited assets are **never** embedded. The package license **matches the source's**.

## Tools & skills per deliverable
- Study guide + practice (files 2, 5): `skills/orz-markdown` (syntax) + `skills/oer-figures` (figures).
- Slides (file 3): **`skills/orz-slides`** (deck grammar, layout, one-concept-per-slide pedagogy).
- Concept maps + assessment (files 1, 4): plain markdown — no tools needed.
- Optional collection docs (exam / syllabus / handout): **`skills/orz-paged`**.
- Cross-cutting quality (graphics ladder, semantic formatting, accessibility, coherence, notation):
  **`docs/authoring-guidelines.md`**.

Containers use the colon-fence syntax (`:::: tabs` / `::: tab <Label>` / `:::`), never `{{tabs}}`; the
outer fence has more colons than the inner. Simple inline plots use `{{chart}}`; complex plots use
matplotlib (see `skills/oer-figures`). The QA gate flags unclosed containers and escaped pipes.

## The framework is a build output, not source — ship lean
The orz files that read/edit standalone (`.md.html`, `.slides.html`, `.paged.html`) carry a heavy,
identical **framework shell**. Coursewerk treats them as **build artifacts**, not source:

- **Author lean.** The `.md` sources in `package/` are the source of truth.
- **Build carriers for preview.** `node scripts/build_carriers.mjs` renders each lean source into
  its framework carrier under `preview/` (via orz-mdhtml / orz-slides / orz-paged) so you can open,
  read, and check the real document. `preview/` is regenerable and **never shipped**.
- **Pack lean.** `node scripts/pack.mjs` zips `package/` **without** the carriers — Alembic
  reassembles the framework on its side and generates the permalinks/ids. Light to transport.

**License & identity across the strip:** the **license** is package-level (`alembic.json` +
`LICENSE`), never inside a shell, so nothing is lost. **Identity** (document permalink `uid`, block
ids, `packageId`, repo coordinates) is **assigned by Alembic when it reassembles** — coursewerk is
the origin and carries none of it. The one thing worth shipping for durable citation is the optional
`{{attrs[#blk-…]}}` block ids on study-guide sections (see file 2).
