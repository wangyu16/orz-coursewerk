---
name: oer-figures
description: "Create and source high-quality, COPYRIGHT-CLEAN visuals for openly-published educational material (OER) and reports: generate publication-quality chemical structures, polymer repeat units & reaction schemes (RDKit), data charts (matplotlib), and fetch openly-licensed real-world images (Wikimedia Commons, Openverse) with license + attribution capture. Invoke whenever a study guide, course material, chapter, or report needs figures, schemes, structures, charts, diagrams, or images AND the output is served publicly (must be CC0/Public-Domain/CC-BY/CC-BY-SA or self-generated — never a copyrighted/paywalled figure). Pairs with orz-markdown (embedding) and impeccable (visual taste)."
---

# oer-figures — vivid, copyright-clean figures for public OER

The deliverable is served **publicly**, so every visual must be either **self-generated**
or **openly licensed (CC0 / Public Domain / CC BY / CC BY-SA) with attribution**. NEVER embed
a copyrighted or paywalled figure (incl. screenshots of journal/textbook figures). When a
source's license is unknown or NonCommercial (NC) / NoDerivatives (ND), do **not** embed it —
regenerate it yourself or find an open equivalent. Aim for **vivid but not crowded**: a few
high-value figures per section beat a wall of clip-art (see the `impeccable` skill for taste).

The two helper scripts below live next to this file (`scripts/`) and run via `uv run --with …`
so their heavy deps (RDKit, matplotlib, requests) are **ephemeral** — nothing is added to the
project. Save figures into a per-guide assets folder (e.g. `assets/`) and embed with
relative paths.

## Pick the right source for each visual

| You need… | Make it with | Why |
|---|---|---|
| A **single compound**, or a **simple reaction** | **`{{smiles}}`** inline (orz-markdown) — *favored* | No asset file, editable in the source, renders client-side (SmilesDrawer). Use this first for one structure or a simple reaction. e.g. `{{smiles CCO}}` (ethanol), `{{smiles O=C=O}}` (CO₂). |
| A **labelled multi-structure grid**, a **polymer repeat unit**, or an **annotated reaction/mechanism scheme** | **RDKit** → SVG (`draw_chem.py`) | Reserve RDKit for *collections* and *labelled/laid-out* structures where inline `{{smiles}}` can't place or annotate them (a grid that must not overlap, a scheme with arrows/legends). Not for a single compound — use `{{smiles}}` there. |
| A **simple chart** (a handful of points: a bar/line/pie comparison) | **`{{chart}}`** inline (orz-markdown) | No asset file — data written in the markdown, editable, lightweight. |
| A **complex chart / plot** (multi-series, log scale, annotations, real dataset) | **matplotlib** → SVG | Original; full control of accuracy & style. |
| A **process / dependency / workflow** diagram | **mermaid** (inline, orz-markdown) | Original, text-based, themes with the site. |
| A **real-world photo / instrument / micrograph / product / application / historical** image | **Fetch open-licensed** (`fetch_open_image.py`) | Some things you cannot draw; pull a CC/PD image and attribute it. |
| A **conceptual illustration / analogy / scene-setting visual** (no exact data) | **AI image engine** (§3) | Makes an abstract idea land; for schematic art only, with guardrails. |

Prefer self-generated for anything chemical or quantitative. **For a single compound or a simple reaction,
reach for the inline `{{smiles}}` plugin first** — it needs no asset file and edits with the text; only fall
back to RDKit when you need a *labelled grid* of structures or an *annotated scheme*. Reserve fetched images
for real-world things (a centrifuge, an extruder, a recycling plant, a gel, an AFM image, a historical
figure), and AI illustrations for *conceptual* art only. The full preference ladder is in
[`docs/authoring-guidelines.md`](../../docs/authoring-guidelines.md) §1.

### Simple plots — the `{{chart}}` plugin (inline, no file)
```
{{chart
type: bar
title: Bond energy by halogen
labels: F, Cl, Br, I
series: kJ/mol = 159, 243, 193, 151
}}
```
`type:` bar/line/pie/doughnut · `labels:` comma-separated · `data:` (single series) or repeatable
`series: Name = a, b, c`. Real values only. For anything beyond a few points, use matplotlib (§2).

## 1. Chemistry figures with RDKit — `scripts/draw_chem.py`

```bash
# single structure (SVG preferred for line art)
uv run --with rdkit --with cairosvg python scripts/draw_chem.py mol "C=Cc1ccccc1" \
    --out assets/styrene.svg --legend "Styrene (vinyl monomer)"
# a labelled GRID of structures — each molecule gets its own fixed cell, so they
# NEVER overlap (do NOT hand-pack several structures onto one mol canvas). Tune
# --per-row (default 3) and --cell px (default 260); keep ~3-4 per row so cells stay big.
uv run --with rdkit python scripts/draw_chem.py grid \
    "C=C:Ethylene" "C=CC:Propylene" "C=Cc1ccccc1:Styrene" "C=CC#N:Acrylonitrile" \
    --out assets/common_monomers.svg --per-row 2 --cell 260
# polymer repeat unit — use * for the attachment points
uv run --with rdkit python scripts/draw_chem.py poly "*CC(*)c1ccccc1" \
    --out assets/polystyrene_repeat.svg --legend "Polystyrene repeat unit"
# a reaction / polymerization scheme (monomer >> repeat unit, or A.B>>product)
uv run --with rdkit python scripts/draw_chem.py rxn "C=Cc1ccccc1>>*CC(*)c1ccccc1" \
    --out assets/ps_polymerization.svg
```

`{{smiles ...}}` (orz-markdown) is still fine for a quick *inline* structure mid-sentence; use
RDKit SVGs for anything that deserves a figure, a caption, or labels/schemes.

## 2. Charts with matplotlib

```bash
uv run --with matplotlib python - <<'PY'
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
# … plot REAL values you have verified (never invent data points) …
fig, ax = plt.subplots(figsize=(5,3.2))
ax.plot([...],[...], marker="o")
ax.set_xlabel("…(units)"); ax.set_ylabel("…(units)"); ax.set_title("…")
ax.grid(alpha=.3); fig.tight_layout()
fig.savefig("assets/tg_vs_mw.svg")   # SVG or PNG@dpi>=150
PY
```
Quality rules: label every axis with units, title it, no chartjunk, readable font, `dpi>=150`
for PNG (prefer SVG), `tight_layout()`. **Never fabricate data** — if you don't have the values,
draw a schematic/conceptual curve and say so in the caption, or skip the chart.

## 3. Open-licensed real images — `scripts/fetch_open_image.py`

```bash
# search Wikimedia Commons (default) — prints [OK]/[REVIEW] + license + attribution
uv run --with requests python scripts/fetch_open_image.py search "isotactic polypropylene" --source commons
# …or Openverse (aggregates CC/PD across many sites), pre-filtered to cc0,by,by-sa,pdm
uv run --with requests python scripts/fetch_open_image.py search "extrusion molding machine" --source openverse
# download an [OK] result by Commons file title; writes the file + <out>.attrib.json
uv run --with requests python scripts/fetch_open_image.py get \
    --title "File:Polypropylene tacticity.svg" --out assets/pp_tacticity.svg
```
- Only `[OK]` (CC0/PD/CC-BY/CC-BY-SA) results download; `[REVIEW]` (NC/ND/unknown) is refused
  unless you pass `--allow-review` **after** verifying OER-safety yourself.
- `get` prints an `ATTRIBUTION ROW ->` line and writes a sidecar `*.attrib.json`. Copy that row
  into the guide's `ATTRIBUTION.md` (see §5). No attribution captured ⇒ do not embed.
- Good open sources to name in searches: Wikimedia Commons, Openverse, OpenStax (CC-BY 4.0),
  Wikipedia. For SVG diagrams, Commons is excellent.

## 3b. AI concept illustrations — conceptual art ONLY, with guardrails

For **conceptual illustrations, analogies, and scene-setting visuals** that make an abstract idea land
(an "energy landscape as a hilly terrain," a friendly cutaway of a battery, a metaphor image), use an
**AI image engine** — your platform's image generation, an image-generation MCP tool, or the
**copy-as-prompt** fallback (emit a detailed image prompt for the user to run and drop the result into
`assets/`). This is encouraged for engagement — but it is **rung 3** of the ladder, never a substitute for
rungs 1–2.

**Guardrails (non-negotiable):**
- **Never for anything exact.** No data/plots, no molecular structures or geometry, no real
  photos/micrographs, no maps, nothing a student reads values off. Those come from §1–§3.
- **No text inside the image** — AI-rendered labels/equations come out garbled. Keep the art label-free;
  put labels in the caption or overlay real text.
- **Verify accuracy** against the source before using it — an appealing but wrong illustration is worse
  than none.
- **Always disclose + attribute.** Label it an AI illustration and add an `ATTRIBUTION.md` row, e.g.
  license **"AI-generated — released under the package license"**, attribution **"AI illustration
  (&lt;tool&gt;, &lt;date&gt;); no third-party rights"**. AI-image copyright is unsettled — for an open
  package, treat it as your own contribution and disclose the tool.
- **Format:** raster output is fine for the *published* package; on a *trial* Alembic import raster is
  skipped and re-added after publish (or trace to SVG). Prefer a clean, simple style that reads at figure
  size.

## 4. Reusing the operator's `inputs/` images — VET FIRST

`inputs/img/` may hold figures from the original guide. The original text is CC BY 4.0
(`inputs/license.md`), **but some embedded figures were copied from paywalled/third-party
reports and are NOT the author's to relicense.** For each candidate:
- If it is clearly the **author's own** drawing/scheme/plot (original art, schematic, their data)
  → OK to reuse; attribute to the original guide (CC BY 4.0, Yu Wang) in ATTRIBUTION.md.
- If it looks like a **journal/textbook figure, a screenshot, has a third-party copyright/credit
  line, or you are unsure** → **do NOT embed it.** Regenerate an equivalent with RDKit/matplotlib
  or fetch an open one, and leave a `[VERIFY: original figure source unknown]` note.

## 4b. Source-textbook figures (when the guide INHERITS the textbook's license)

Some guides are built from ONE named open textbook (e.g. an OpenStax book) and are
licensed to **match that textbook's license**. When that is the case (the project's
scope/LICENSE says so), you MAY embed the **textbook's OWN figures** — its real
illustrations, photos, schemes, and charts — under the matched license, with attribution.
This is the high-value path when the textbook's figure is clearly better than anything you
could self-generate (real photographs, micrographs, apparatus, polished diagrams).

Rules:
- **Only if the guide's own license already matches.** OpenStax *Chemistry / Atoms First*
  books are **CC BY-NC-SA 4.0** (NonCommercial-ShareAlike). You may embed their figures ONLY
  because the guide itself is licensed CC BY-NC-SA 4.0 (ShareAlike is satisfied; NC is
  accepted because the guide is also NC). If the guide is plain CC BY, you may NOT — regenerate
  instead (§1–2).
- **Textbook's OWN art only — vet every figure for third-party credit.** Skip any figure whose
  in-book caption/credit names an outside source it merely "used with permission," a journal,
  or a company logo — those are not the textbook's to relicense. OpenStax art **without** a
  third-party credit is OpenStax's own.
- **Download + attribute.** Fetch the figure image from the textbook page
  (`uv run --with requests python scripts/fetch_open_image.py get --url <figure_img_url>
  --out assets/ch3_fig_3_4.png --allow-review`, then hand-record the license), or curl it.
  Attribution line / ATTRIBUTION row license = the matched license, credited e.g.
  **"OpenStax, Chemistry: Atoms First 2e, Fig 3.4, CC BY-NC-SA 4.0"** (use
  "© Rice University, OpenStax, CC BY-NC-SA 4.0" for OpenStax art with no in-text credit).
- Still prefer **self-generated** structures/schemes (§1) and **charts** (§2) where they are as
  good or better; use textbook figures for the things you cannot draw.

## 5. Embed + attribute (every external/reused asset)

Embed with orz-markdown and a caption:
```markdown
![Isotactic vs syndiotactic vs atactic polypropylene](../assets/pp_tacticity.svg)
*Figure 3.2 — Tacticity of polypropylene. Source: Wikimedia Commons (RicHard-59), CC BY-SA 3.0.*
```
Then record it in `metadata/ATTRIBUTION.md` (one row per external/reused asset):

| Asset | Local use | Source URL | License | Attribution |
|---|---|---|---|---|
| pp_tacticity.svg | ch3 | https://commons.wikimedia.org/wiki/File:Polypropylene_tacticity.svg | CC BY-SA 3.0 | RicHard-59 |

Self-generated RDKit/matplotlib/mermaid figures are **original work** — list them as
self-generated (no external license needed), and keep the guide's own CC BY 4.0 on new content.

## Definition of done (figures)

- Every section that benefits from a visual has at least one **high-quality** figure (not just
  an inline structure): a labelled RDKit structure/scheme, a real chart, a process diagram, or a
  vetted open image — vivid, captioned, relevant, not crowded.
- Every external/reused image is `[OK]`-licensed and in `ATTRIBUTION.md`; nothing copyrighted.
- All asset paths resolve; SVG used for line art; data in charts is real or labelled schematic.
