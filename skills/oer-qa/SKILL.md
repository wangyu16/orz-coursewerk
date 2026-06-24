---
name: oer-qa
description: Package-agnostic automated quality gate for an assembled OER guide/ folder — catches under-attributed/unmanifested assets, broken local links & asset paths, orz-markdown syntax slips, accessibility-proxy gaps (alt text, heading structure, link text), and leftover body placeholders BEFORE delivery. Invoke in a course_guide/study_guide QA step, or any time you need to verify a publishable Markdown OER package is clean.
---

# oer-qa — automated OER package quality gate

Run `check_oer.mjs` against an assembled package's `guide/` folder. It promotes into the
harness the AUTO-eliminable flaw classes surfaced by the manuscript artifact-quality
evaluation, so they are caught before public release instead of in human review.

## Run it

```bash
node check_oer.mjs --guide <path/to/guide> --report guide/qa_report.md --json /tmp/qa.json
```

- `--guide` (required): the package's `guide/` directory.
- `--report` (optional): write a human-readable Markdown summary.
- `--json` (optional): write the full machine-readable result.
- **Exit code**: non-zero if any CRITICAL (release-blocking, auto-detectable) issue exists.

## What it checks

- **Attribution completeness** — every media asset on disk appears in `ATTRIBUTION.md` with a
  license + attribution; lists `unmanifestedMedia` (assets present but not credited).
- **Link / path integrity** — local Markdown links + asset references all resolve on disk.
- **orz-markdown syntax** — unclosed `:::` containers, unclosed `{{plugin}}`, escaped pipes in tables.
- **Accessibility proxies** — images missing alt text, empty headings, heading-level jumps,
  first-heading-not-H1, non-descriptive link text.
- **Body placeholders** — leftover `[VERIFY]` / `[NEEDS DATA]` in deliverable bodies.

`criticalCounts` aggregates the release-blocking subset (unmanifested assets, missing
license/attribution, broken links, missing asset refs, orz-syntax errors, missing alt text,
body placeholders). `criticalTotal == 0` ⇒ the package passes the automated gate.

## How to use it in a QA step

1. Run the checker with `--report` and `--json`.
2. **Fix the auto-fixable issues**: add unmanifested assets to `ATTRIBUTION.md` (investigate each
   — OpenStax-original → attribute to OpenStax; self-generated → original-work; truly orphaned →
   remove the file); close unclosed orz containers / fix escaped pipes; repair broken asset paths;
   add missing alt text.
3. **Re-run** until `criticalTotal == 0`; commit `guide/qa_report.md`.
4. Anything not auto-fixable (e.g. a layout/positioning judgement) is flagged in the report for
   human review — never fabricate a fix.

It is package-agnostic: chapter count and structure are derived from the folder; it makes no
chemistry- or subject-specific assumptions.
