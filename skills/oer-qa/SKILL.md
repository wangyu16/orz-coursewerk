---
name: oer-qa
description: Automated quality gate for an assembled Alembic course package — checks BOTH that the package will upload to Alembic with zero friction (manifest valid, LICENSE present, every folder/file recognized, each declared chapter's study guide present, no framework carriers or stray root files, renderable objects public) AND that it is good, copyright-clean OER (attribution completeness, broken links/asset paths, orz-markdown syntax, accessibility proxies, leftover placeholders, per-deliverable format contracts). Invoke in the QA step before delivery, or any time you need to verify a package is clean and uploadable.
---

# oer-qa — automated package quality gate

Run the harness gate `scripts/check_oer.mjs` against the assembled `package/` tree. It combines two
layers of checks so a package that passes is both **uploadable** and **good OER**.

## Run it

```bash
node scripts/check_oer.mjs --package package --report reports/qa_report.md --json /tmp/qa.json
```

- `--package` (required): the assembled Alembic package directory (`package/`). `--guide` is accepted as a
  legacy alias.
- `--report` (optional): write a human-readable Markdown summary. **Write it to `reports/`, never inside
  `package/`** — a stray file at the package root is itself a contract violation.
- `--json` (optional): write the full machine-readable result.
- **Exit code**: non-zero if any CRITICAL (release-blocking, auto-detectable) issue exists.

## What it checks

**A. Alembic contract (will it upload?)** — mirrors `validatePackageForImport` / `repoForPath` via
`scripts/lib/contract.mjs`:
- **Manifest** — `alembic.json` present + valid: required fields (`schemaVersion`, `packageId`, `title`,
  `license`, `createdAt` ending in `Z`), `license` is one of the five accepted, chapter slugs well-formed.
- **LICENSE** present at the package root.
- **Layout** — every file resolves to a recognized folder (public vs `private/`); no unknown top-level
  folder or stray root file; each declared chapter has `study-guide/<slug>.md`; renderable objects are
  public; **no framework carriers** (`.md.html`/`.slides.html`/`.paged.html`) shipped in the package.

**B. OER quality:**
- **Attribution completeness** — every media asset on disk appears in `metadata/ATTRIBUTION.md` with a
  license + attribution; lists `unmanifestedMedia`.
- **Link / path integrity** — local Markdown links + asset references all resolve on disk.
- **orz-markdown syntax** — unclosed `:::` containers, unclosed `{{plugin}}`, escaped pipes in tables.
- **Accessibility proxies** — images missing alt text, empty headings, heading-level jumps,
  first-heading-not-H1, non-descriptive link text.
- **Body placeholders** — leftover `[VERIFY]` / `[NEEDS DATA]`.
- **Format contracts** — graphics-free concept maps + assessment guides; slides in orz-slides deck grammar;
  practice with Q/A tabs; every deliverable has an H1.

`criticalCounts` aggregates the release-blocking subset; `criticalTotal == 0` ⇒ the package passes the gate.

## How to use it in a QA step

1. Run the checker with `--report reports/qa_report.md` and `--json`.
2. **Fix the auto-fixable issues**: correct the manifest; move stray root files / unknown folders into the
   contract; add each declared chapter's study guide; move any leaked carrier out of `package/` (rebuild it
   under `preview/` instead); add unmanifested assets to `metadata/ATTRIBUTION.md`; close unclosed orz
   containers / fix escaped pipes; repair broken asset paths; add missing alt text.
3. **Re-run** until `criticalTotal == 0`.
4. Also run `node scripts/build_carriers.mjs` and confirm `failed: 0` — proof every lean source reassembles
   into a valid framework document.
5. Anything not auto-fixable (e.g. a layout/positioning judgement) is flagged in the report for human review
   — never fabricate a fix.

It is subject-agnostic: chapter count and structure come from the manifest + folders; it makes no
chemistry- or subject-specific assumptions.
