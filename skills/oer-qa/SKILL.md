---
name: oer-qa
description: Automated quality gate for an assembled Alembic course package — checks BOTH that the package will upload to Alembic with zero friction (manifest valid, LICENSE present, every folder/file recognized, each declared chapter's study guide present, no framework carriers or stray root files, renderable objects public) AND that it meets Coursewerk's defined OER floor (attribution completeness, broken links/asset paths, orz-markdown syntax, accessibility-floor checks, leftover placeholders, per-deliverable format contracts). Invoke in the QA step before delivery, or any time you need to verify a package is clean and uploadable.
---

# oer-qa — automated package quality gate

Run the harness gate `scripts/check_oer.mjs` against the assembled `package/` tree. It combines two
layers of checks so a package that passes is both **uploadable** and **good OER**.

## Run it

```bash
node scripts/check_oer.mjs --package package --inputs inputs --report reports/qa_report.md --json /tmp/qa.json
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
- **Mode-independent assurance kernel** — intended-use profile, hash-bound pre-ingestion receipts, exact source/right/license evidence,
  manifest/LICENSE consistency, privacy assertions, structured provenance, required attribution, and zero
  public-release blockers. Full/Light mode never changes these checks.
- **Component coherence** — `COMPONENT_INDEX.json` covers every output component; content hashes, dependency
  snapshots, and graph relationships are current. Any revision remains blocking until its complete impact set
  is reviewed and an attested index refresh succeeds.
- **Source corpus** — `inputs/SOURCE_CORPUS.json` binds every primary source to a raw snapshot/hash, canonical
  URL, retrieval and versioned extractor metadata, hashed comparison text, or a dated human attestation. Scaffolding never
  counts.
- **Attribution completeness** — every media asset has an existing local path and `usedIn` locations in
  structured provenance; public attribution is generated exactly from it. Remote hot-linked media is blocked.
- **Link / path integrity** — local Markdown links + asset references all resolve on disk.
- **orz-markdown syntax** — real-parser rendering, plugin balance, nested fence direction, escaped pipes.
- **Accessibility floor** — images missing alt text, Mermaid/chart blocks without visible text alternatives,
  empty headings, heading-level jumps, first-heading-not-H1, and non-descriptive link text are release-blocking.
- **Body placeholders** — leftover `[VERIFY]` / `[NEEDS DATA]`.
- **Format contracts** — graphics-free concept maps + assessment guides; slides in orz-slides deck grammar;
  practice with Q/A tabs; every deliverable has an H1; a chapter without a photograph has a reviewed decision
  in `metadata/MEDIA_PLAN.json`.

`criticalCounts` aggregates the release-blocking subset; `criticalTotal == 0` ⇒ the package passes the gate.

## How to use it in a QA step

1. Run the checker with `--report reports/qa_report.md` and `--json`.
2. **Fix the auto-fixable issues**: correct the manifest; move stray root files / unknown folders into the
   contract; add each declared chapter's study guide; move any leaked carrier out of `package/` (rebuild it
   under `preview/` instead); add unmanifested assets to `metadata/ATTRIBUTION.md`; close unclosed orz
   containers / fix escaped pipes; repair broken asset paths; add missing alt text.
3. **Re-run** until `criticalTotal == 0`.
4. Run `npm run generate:attribution` after provenance changes. `pack.mjs` reruns every declared carrier and
   emits an evaluation plus `.release.json` receipt beside the ZIP.
5. Anything not auto-fixable (e.g. a layout/positioning judgement) is flagged in the report for human review
   — never fabricate a fix.

It is subject-agnostic: chapter count and structure come from the manifest + folders; it makes no
chemistry- or subject-specific assumptions.
