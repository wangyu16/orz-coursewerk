# Coursewerk authoring guidelines

The house rules for *quality* — how to make a course package clear, correct, copyright-clean, and
accessible. The **structure** rules live in `format-contracts/deliverables.md`; the **per-deliverable
skeletons** live in `skills/courseguide-standards`; the **tool grammars** live in the `orz-markdown`,
`orz-slides`, `orz-paged`, and `oer-figures` skills. This file is the connective tissue: the principles
that apply across all of them.

---

## 1. Graphics — the preference ladder

Pick the highest rung that fits; every figure gets a **caption**, **alt text**, and an **attribution row**
in structured `metadata/PROVENANCE.json` and, for public work, `metadata/ATTRIBUTION.md`. Prefer **SVG** everywhere (crisp at any size, text-based, and it imports to
Alembic cleanly — raster `.png`/`.jpg`/`.pdf` are skipped on a *trial* import and re-added after publish).

1. **Self-generate — always clean + exact (first choice for anything scientific).**
   - A single compound or a simple reaction → the inline **`{{smiles}}`** plugin (*favored* — no asset
     file). Reserve **RDKit** (`oer-figures` `draw_chem.py` → SVG) for a *labelled multi-structure grid* or
     an *annotated scheme*.
   - **Simple** data plots → the **`{{chart}}`** plugin inline (bar / line / pie / doughnut; data written
     right in the markdown — editable, lightweight, no asset file). Use for a handful of points.
   - **Complex** plots → **matplotlib** (`oer-figures`) → SVG: multi-series, log scales, annotations,
     subplots, real datasets. Real numbers only — never fabricate data.
   - Flowcharts / dependency / process diagrams → **`{{mermaid}}`**. Follow every Mermaid block with a visible
     `**Visual description:**` that communicates its relationships without requiring the runtime diagram.
     Follow every chart with a `**Data summary:**` stating its important pattern and values.
2. **Open-licensed real images — use them LIBERALLY, don't be conservative.** Real photos of the actual
   substances, apparatus, and phenomena (an element sample, an analytical balance, a reaction, a micrograph)
   make a chapter come alive in a way diagrams can't — a package of only self-generated SVGs is too dry.
   Fetch from Wikimedia Commons, OpenStax (its own CC-BY figures), Openverse, NASA/NOAA (public domain) with
   `oer-figures`' `fetch_open_image.py`, which **captures the attribution row for you**; **resize** to a
   web-friendly width (~800–900 px) so the package stays light. Aim for **at least one or two fetched real
   photos per chapter**. If a real photograph would not improve a chapter, record that accountable decision and
   a substantive rationale in `metadata/MEDIA_PLAN.json`; silence is not a decision. Record each included photo
   in `metadata/PROVENANCE.json` and public `ATTRIBUTION.md` with its own license (note: a CC-BY-SA image
   keeps its ShareAlike license — attribute it as such; prefer CC-BY / CC0 / public-domain when you want the
   package cleanly CC-BY). Never embed a copyrighted, paywalled, or third-party-credited image. Never hot-link
   media in public work: fetch it into `assets/` so rights, accessibility, and availability remain inspectable.
3. **AI-generated concept illustrations — encouraged for conceptual/schematic art.** Use an image engine
   (the platform's image generation, an image MCP tool, or the copy-as-prompt fallback in `oer-figures`) to
   create engaging conceptual illustrations, analogies, and scene-setting visuals that make an abstract idea
   land. **Guardrails (non-negotiable):**
   - **Never for anything that must be exact:** data/plots, molecular structures or geometry, real
     photos/micrographs, maps, or any figure a student would read values off. Those come from rungs 1–2.
   - **No text inside the image** — AI-rendered labels/equations are usually garbled. Put labels in the
     caption or overlay them as real text; keep generated art label-free.
   - **Always disclose:** label the figure as an AI illustration and record it in structured provenance plus public `metadata/ATTRIBUTION.md`
     (e.g. `AI-generated illustration (<tool>, <date>) — no third-party rights; released under the package
     license`). AI-image copyright is unsettled; for an open package, treat it as your own contribution and
     disclose the tool.
   - **Verify accuracy** against the source — an appealing but wrong illustration is worse than none.
   - Raster output is fine for the *published* package; for a trial import, expect to re-add it after publish
     (see the ladder note above) or trace it to SVG.

**Sizing.** Size for legibility, not dominance: structures at a *consistent* scale across the chapter,
charts full-column, inline structures small. In slides, size explicitly (`![alt](../assets/x.svg =520x)`)
so a figure is readable from the back of a room but doesn't swamp the slide (see `skills/orz-slides`).

**Aim high — a good OER is vivid, not dry.** Generate figures *generously*: a study guide with zero asset
files and slides that are only bullet lists is a defect, not restraint. Target **several captioned figures
per chapter**, and anchor each concept in a **relatable everyday example or analogy** (a scuba tank, a
weather balloon, a car battery, a photo of a real object) so it is concrete and memorable. Restraint applies
to gratuitous *text* decoration — never to meaningful visuals or real-world grounding.

---

## 2. Rich formatting — a semantic palette (clarity, never decoration)

Every device carries information and is used **the same way in every chapter**. The goal is to make the
**logic flow visible** and the **important things easy to catch** — not to decorate. If removing a device
loses no meaning, remove it. (Exact syntax: `skills/orz-markdown`.)

| Device | Syntax | Use it for (one job) |
|---|---|---|
| Info box | `:::info` | neutral facts, definitions, reference notes |
| Success box | `:::success` | learning objectives, key takeaways |
| Warning box | `:::warning` | common mistakes, model limits, cautions |
| Danger box | `:::danger` | genuine safety-critical "do not" only |
| Bold | `**term**` | a defined term on first use; a key result |
| Highlight | `==text==` | the single most important phrase in a passage (sparingly) |
| Colored text | `{{sp[red\|yellow\|green\|blue] …}}` | encode a *consistent* meaning (e.g. red = caution term); pair with bold/label, never color alone |
| Badge | `{{sp[success\|info\|warning\|danger] …}}` | a status/tag: objective ref, difficulty, "exam-relevant" |
| Underline | `++text++` | rare — reads as a link; prefer bold |
| Columns | `:::: cols 1 1` | side-by-side compare/contrast (two mechanisms, before/after) |
| Tabs | `:::: tabs` / `::: tab` | worked Problem/Solution, alternate representations (screen only) |
| Spoiler | `:::spoil Reveal` | hide an answer/hint for self-test (screen only) |
| Sub/super | `H~2~O`, `x^2^` | chemistry/math notation |

**Restraint rules:** at most one highlight per passage; a small fixed set of colors with fixed meanings
(not a rainbow); boxes used for their meaning, not variety. Tabs and spoilers are **screen-only** — never in
`orz-paged` print documents.

---

## 3. Study guide → slides

The single most important transformation. Full detail in `skills/orz-slides`; the essentials:
- **Same logic flow, full coverage** — slides follow the study guide's concept order and hit every
  concept/subconcept.
- **One concept per slide; split long content; never crowd** (a crowded slide is a defect).
- **Concise + scannable** — a short title, a few bullets or one figure+caption, phrases not sentences.
- **Rich layout for logic** — `2col`/`main-side` splits for compare, a `:::warning` for a pitfall, an
  objective badge; reuse the study guide's figures, sized legible-not-dominating.
- **Sequence:** title → objectives → chapter-logic → per-section concept slides → synthesis/closing.

---

## 4. Notation, accuracy & sourcing

- **Every fact/value/structure from the source** (`inputs/` or the named textbook) — never fabricated. A gap
  is a visible `[VERIFY]` note, not a guess. Plots use real numbers.
- **Write in your own words — never reproduce the source's sentences.** Copyright protects *expression*, not
  facts, so take the facts and re-express them originally. A near-verbatim passage copied from a textbook is
  a copyright problem (and the QA gate's `--inputs` scan flags it). A **short, attributed** quote (a sentence,
  cited) is fine as fair use; a paragraph lifted and lightly reworded is not.
- **Math** in KaTeX (`$…$` / `$$…$$`); **chemistry** in mhchem (`$\ce{H2O}$`, `$\ce{Fe^{2+} + 2e- -> Fe}$`).
- **IUPAC** naming; **units carried** through every step; **significant figures** respected.

---

## 5. Coherence & consistency (the course reads as one work)

- **Objectives drive everything.** Each deliverable ties back to the chapter's learning objectives; the
  assessment guide covers each objective; practice instantiates the assessment guides; slides mirror the
  study-guide flow.
- **Same skeleton every chapter** — same section order, same device semantics, same figure style, so a
  student never re-learns how to read the material.
- **Cross-deliverable check:** concept map ↔ study guide ↔ slides ↔ assessment ↔ practice all cover the same
  concepts in the same order. A concept in one but missing from another is a coherence gap.
- **Editorial pass:** proofread every chapter for spelling, grammar, clarity, repeated wording, terminology,
  tone, notation, and internal references. Then compare chapters as a set so headings, objective verbs, labels,
  semantic formatting, and figure/slide conventions form one design system. This is an agent/editor review;
  do not report it as a deterministic QA result unless a dedicated checker was actually run.

---

## 6. Accessibility (build it in, don't bolt it on)

- **Color is never the sole signal.** A colored box or colored word must *also* carry a label or bold —
  color-blind readers and printouts lose the hue. (This is why the palette above pairs color with meaning.)
- **Real alt text** on every figure (describe what it shows, not "image").
- **Visible text alternatives** immediately after every runtime Mermaid/chart block. Source-level alt and
  descriptions are gated; final post-render behavior and overflow still require a browser/human visual probe.
- **Heading order** with no level jumps; one H1 per document; descriptive link text (never "click here");
  table headers on data tables.
- The QA gate (`skills/oer-qa`) checks these as proxies — but write for them from the start.

---

## 7. Intended use, rights, licensing & discoverability

Choose `personal-private`, `restricted-teaching`, or `public-oer` before authoring; see
`docs/assurance-kernel.md`. Input rights (why a source may be used), distribution conditions, and output
licensing (permissions granted over material the user controls) are independent.

- Personal/restricted work lives under `personal/`, carries complete provenance, and has no open output license.
  Unknown/private-only items are visibly labelled and block promotion. Educational purpose is not assumed to
  establish a copyright exception.
- Public OER lives under `package/`. Every source/asset must have verified distribution rights; the manifest and
  full LICENSE must agree with the foundation decision and adapted-source obligations.
- `ALL-RIGHTS-RESERVED` grants no reuse but does not cure unauthorized inputs.
- Discover requires an open compatible license, complete attribution/provenance, no near-verbatim source prose,
  and educator attestation.

The mode-independent assurance kernel is release-blocking in every review mode. `pack.mjs` refuses all
private/restricted profiles and every unresolved publication blocker.

Public sources require a hashed rights-evidence snapshot under `metadata/evidence/` and
`inputs/SOURCE_CORPUS.json` binding each primary source ID to a hash-bound raw snapshot, canonical URL,
retrieval/extractor metadata, hashed extracted text, or an explicit dated human comparison attestation. Capture
and deterministically scan the authoritative rights page before any substantive source ingestion; an unresolved
process-specific AI/automated-processing notice is a stop condition, not an evaluation footnote. Attribution is
generated from `PROVENANCE.json`; never maintain the two independently.

## 8. Paged documents & collections

`orz-paged` is for **collection** documents — exams, quizzes, handouts, **syllabi**, worksheets, lab sheets
— not the fixed package items. Exams use the `exam-*` template with the **answer-key toggle** (one source →
blank exam + instructor key); syllabi use `report-page`; handouts use `note`/`article-section`. Exam content
and answer keys are **instructor-only** (`private/`); syllabi and handouts are student-facing (the current
term). See `skills/orz-paged`.
