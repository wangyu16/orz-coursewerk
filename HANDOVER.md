# Handover — Coursewerk, 2026-11-02

Coursewerk moves from the Conductor-V2 project `coursewerk-caeai` (machine manyu-oracle2) into the orz-family folder,
to be maintained there with the other family members. This note lists what lived outside git on the old machine, what
is still open, and what a new session needs to know beyond `CLAUDE.md`, `PROCEDURE.md` and `docs/`.

## The repository

- `main` = the v1.0.0 release (c0c657a; tag `v1.0.0`). The release notes are in `CHANGELOG.md` and on the GitHub
  release. `site-type/` is the site type definition for Alembic (tag `site-type-1.0.0-dev.1`).
- The development branches (red-team fix lanes `fix/r2-*` … `fix/r7-*`, `integrate/r2` … `integrate/r7`, `d52/*`,
  `feat/*`, `redesign/skeleton`, `records-layout`, `genchem-prereqs`, `site-type`) were not pushed: all of them are
  contained in `main` except `feature` (8 commits not in `main`). All 47 branches and both tags are kept in one git
  bundle, `coursewerk-branches.bundle` (4 MB, sha256 30bfa530d74b835b849f4dcc11f104dbe844b00cde8a2b646c81c97d0a920e40),
  to be stored in a gitignored folder of `orz-family/coursewerk/`; `git clone coursewerk-branches.bundle` restores them.
  `preview/2026-10-31` is on GitHub; the owner asked to delete it from about 2026-11-09.
- The design record of the redesign (charter, decision log D1–D54, modules, skeleton) is cited throughout the code as
  "D46", "D52" and so on. It lived outside the repository; a copy is in the handover folder as `design-record/` (below). Keep it with
  Coursewerk.

## Kept outside git on manyu-oracle2

Paths are relative to `~/Conductor-V2/var/projects/coursewerk-caeai/` unless absolute.

| What | Path | Keep? |
|---|---|---|
| **Handover folder**: the branch bundle and a copy of the design record | `workspace/handover/` (`coursewerk-branches.bundle` + `.sha256`, `design-record/`) | **keep — move to a gitignored folder of `orz-family/coursewerk/`** |
| Design record of the redesign (original): `charter.md`, `decision-log.md` (D1–D54), `modules.md`, `skeleton.md`, `features.md`, `study.md`, `implementation-plan.md`, `fit-v0.12.0.md`, plus the GenChem re-evaluation, the site-type contract review and the records-under-Alembic design | `workspace/redesign/` (328 KB) | **keep** — the code's D-numbers refer to it |
| The project's earlier record: constitution, promise map, gaps, plan, critique, index | `workspace/*.md` | keep (history) |
| Research about Coursewerk: experiments g1–g15, studies, results, and a manuscript draft (the "CAEAI" paper) | `workspace/research/`, `workspace/studies/` (12 MB), `workspace/results/` (4 MB), `workspace/manuscript/` | **keep** — unpublished research; the owner decides where |
| **Course: Chemistry of Macromolecules** (the owner's real course; its own local git repo, never pushed) | `workspace/courses/chemistry-of-macromolecules/` (`package/` = git repo at 5708c26; `inputs/` holds the reference textbooks and the prior study guide; `reports/`; `INSTRUCTOR-GUIDE.md`) | **keep — course data, not for this repo** |
| Course: the C2 controlled-chemistry demo package and its reports (also frozen as test fixtures) | `workspace/courses/controlled-chemistry*` | can go (fixtures in `tests/fixtures/` keep what matters) |
| General Chemistry deliveries to Alembic (already imported by Alembic) | `workspace/releases/genchem-update-2026-11-01/`, `…-2026-11-02/` (≈120 MB) | can go once Alembic confirms the 2026-11-02 import |
| Site-type 1.0.0-dev.1 copy | `workspace/releases/site-type-1.0.0-dev.1/` | can go (the tag holds it) |
| **General Chemistry work history** (a local git repo of every change made to GenChem: the published base, the reviews, every fix, with the course's private records) | `/home/ubuntu/.cache/genchem-src/work` (HEAD 83ea20f) | **keep — course data, not for this repo**; it is the course's own history up to the 2026-11-02 delivery |
| GenChem fix scripts and review outputs (concern lists, decisions, `house_fix.py` notation converter) | `/home/ubuntu/.cache/genchem-src/fix/`, `k-*.json` | keep with the GenChem history; `house_fix.py` may be useful again |
| Clone of the published GenChem testing copy | `/home/ubuntu/.cache/genchem-src/pub` | can go |
| Earlier GenChem evaluation scratch | `/home/ubuntu/.cache/genchem-eval/` | can go |
| **The owner's Coursewerk preferences** (`preferences.md`, `styles.md` with the figure and notation rules, `skills/polymer-figures` with `polydraw.py` and `tact.py`) | `/home/ubuntu/.coursewerk/` | **keep** — the owner's, read on every run |
| Macromolecules figure scripts | `workspace/courses/chemistry-of-macromolecules/reports/figs/` | keep with the course |
| Preview sites published through agentPortal (`macromolecules-ch1-preview`, `macromolecules-maps-ch2-8`, `macromolecules-ch2-3-preview`) | `.agentportal/sites/*.json` and the `reports/preview*` folders | can go after review |
| Conductor's own ledger for this project | `ledger.db`, `ledger/` | Conductor's record, not Coursewerk's |
| Test scratch | `/home/ubuntu/.cache/cw-tmp-main`, `/tmp/*` | can go |

## Open tasks and decisions waiting for the owner

**Chemistry of Macromolecules**
- Approve the Chapter 2 and 3 assessment guides (agent drafts, on the preview `macromolecules-ch2-3-preview`); then
  record each chapter's plan approval in the owner's words (`spine.mjs approve`). The concept maps are approved.
- Photographs for Chapters 2–3 (the gate asks once per chapter): add a few open-licence Commons photos, or record why not.
- Chapter 1 leftovers: 59 facts awaiting the owner's confirmation, 3 keep/drop off-spine items, and a deferred re-review
  of links and framing (about $4.5) after the confirmation round.
- IUPAC names for the appendix: `reports/appendix-iupac-names.md` (the polyimide name still to be checked).
- Chapters 4–8 concept maps await approval.

**General Chemistry (on Alembic)**
- Alembic was applying the 2026-11-02 notation update when this was written; confirm it landed.
- Plans and approvals for the course are a later step with the owner.

**Coursewerk**
- The job release for Alembic: built (branch `alembic-job`: `alembic-job/CLAUDE.md`, `scripts/pack_job_release.mjs`,
  `scripts/site_import.mjs` / `site_handback.mjs`, the gate's host anchor for the log). Still open: a no-git mode for
  `records_move`, the revision checks and the "edit visible in git" claim.
- The site export splits the decision log into parts of at most 3.5 MB; the package itself keeps one `LOG.jsonl`.
  `site_import.mjs` joins a site's parts on import and `site_handback.mjs` splits them again, append-only.
- Known false alarms of the mechanical arithmetic check: expressions with `a\times10^{x}/b\times10^{y}`, chained
  comparisons of two expressions, ratio lists separated by `\qquad`, and skeleton or half-reaction equations shown
  before balancing. They are notes, not defects, but they cost reading time.
- The full gate on a 19-chapter package was slow on a one-core machine (loading units over 20 minutes); single checks
  were run per file instead.
- CI warns that `actions/checkout@v4` and `actions/setup-node@v4` target Node.js 20 (deprecated on GitHub runners).
- `system/CLAIMS.json` still describes the v0.12 Light/Full-mode critique in one claim (`claim.review.key-facts`).

## What a new session should know

- **Course work happens only inside a units session:** `node scripts/units.mjs begin --root <pkg> --model <id>` before
  the agent writes, `node scripts/units.mjs index --root <pkg> --as agent --model <id>` after. Text written outside a
  session is read as unknown authorship.
- **Recheck until quiet.** Apply a blind review's concerns in the house notation, then review the changed units again
  (`verify.mjs knowledge --units …`); stop when a pass raises nothing. On GenChem this took 682 → 76 → 11 → 0, and on
  Macromolecules Chapters 2–3 423 → 50 → 3 → 0.
- **Coursewerk changes follow the system index procedure:** `npm run system:index`, `node scripts/coursewerk_impact.mjs
  --base HEAD`, fill `.coursewerk/coursewerk-impact.json` (reviewed, testResults, attestation), `node
  scripts/accept_coursewerk_revision.mjs --base HEAD`, `npm run system:verify`, then commit. A requirement is
  registered in `system/REQUIREMENTS.json` before its code; tests carry `[req.…]` tags.
- **Tests:** on a small machine run one file at a time (`node --test tests/<file>`); the whole suite (1,131 tests) takes
  about two hours on one core, 38 minutes on GitHub.
- **The owner's conventions** for General Chemistry (rounding an exact half up, strict significant figures, the
  rate-determining step as the largest activation energy from its own start) and the Macromolecules instructor guide
  (`INSTRUCTOR-GUIDE.md` in that course folder) are the owner's choices, not Coursewerk rules.
- **Models:** Coursewerk names no model; its blind verifier uses the host's default. In Alembic jobs that is Haiku 5.5
  (Sonnet 5.5 allowed), at most 8,000 output tokens per call, one AI call at a time.
