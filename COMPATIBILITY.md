# Agent compatibility — entry files

Coursewerk is agent-native: different AI tools auto-read different "instructions" files. The
**canonical entry / constitution is `CLAUDE.md`**; every other entry file points to it. The goal is
that you can use **any AI platform you like** to run Coursewerk.

## Full experience — agents with a terminal
These can clone the repo, install the builders, and run the `check` / `build` / `pack` scripts. Each
reads a different entry file; all of them point to `CLAUDE.md`:

- **`CLAUDE.md`** — canonical (Claude Code reads it automatically).
- **`AGENTS.md`** — read by Codex / ChatGPT Agent mode, and a growing set of tools.
- **`GEMINI.md`** — Google Gemini CLI.
- **`.github/copilot-instructions.md`** — GitHub Copilot.
- **`.cursorrules`** — Cursor / Windsurf / Cline (and similar).

An agent that reads only its own file still gets a quick orientation plus the link to the canonical
instructions, so it can proceed.

## Lite path — pure chat UIs (no terminal)
ChatGPT, Claude, Grok, or Gemini in the browser can't run the scripts, but can still author materials.
See **[`docs/lite-path.md`](docs/lite-path.md)**: intended use first selects `personal/` or `package/`, and the
AI writes lean Markdown plus structured foundation/provenance records. Public packaging still requires the
terminal assurance gate; structural Alembic import alone is not source-rights clearance.
Subsequent revisions also require the terminal component-index impact/attestation workflow; otherwise the
package remains intentionally stale and unpackable. Running bootstrap initializes the same output-root Git
history used by full terminal agents, so Light mode does not weaken edit visibility or coherence enforcement.
Repository maintainers use the branch-aware Coursewerk system index in every terminal-capable agent; pure chat
cannot accept or verify a Coursewerk harness revision by itself.

## Package records across Coursewerk versions
A package's records are read by the Coursewerk version that works on it, so a package written by a newer version may
need that version:

- **Compact review records** (v1.0.5, `req.records.compact-review`): a review record written by v1.0.5 or later stores
  its prompt's repeated blocks once, in `private/coursewerk/verification/parts/`. A package holding such records needs
  v1.0.5 or later. v1.0.4 and earlier read the parts as unlogged records and cannot put a compact record's prompt
  back, so they block the package (they fail closed: nothing is wrongly cleared). A host that runs Coursewerk on
  packages, such as Alembic's assistant job, must move to v1.0.5 before any compact record is written, and must
  not go back to an earlier one for those packages.

## The contract with Alembic (FC-16 v1)
Coursewerk is hosted by Alembic under the orz family's contract **FC-16 v1, the Coursewerk ↔ Alembic hosting
contract**: [`docs/FC-16-v1.md`](https://github.com/wangyu16/orz-family/blob/main/docs/FC-16-v1.md) in the orz-family
repository. That file is the contract; this section is Coursewerk's half of it in brief, and where the two differ,
FC-16 wins.

- **Pinned contract:** FC-16 v1 (2026-11-15; binding once its gate G10 review has run). Coursewerk does not change a
  term of it on its own: a change goes through FC-16 §9 (the family's change procedure), owner first.
- **What Coursewerk owns:** the job text and tools of its pinned job release (`scripts/pack_job_release.mjs`), the
  record formats and places (`private/coursewerk/`, `provenance/coursewerk/`), the decision log's format and its check
  (`scripts/records_check.mjs`: the chain, and with `--records` the review records the log binds), what is asked of the
  instructor and what an answer means.
- **What Alembic owns:** hosting — the job runtime, the hand-in, storage and its write rules, hand-out and hand-back,
  Publish — and the records budget (200 record files per change, 4 MB per file, 200 MB per site; Coursewerk's
  `RECORD_LIMITS` follows it).
- **Release pin:** Alembic pins a Coursewerk job release by checksum per site type (`oer-course@1`), at
  v1.0.5 or later (compact review records, above).
- **Site type definition:** `site-type/site-type.json`, under the family's SITE-TYPE-CONTRACT (draft 15); Alembic
  vendors it by checksum. Its version is `1.0.0-dev.2` until the cut-over tags `1.0.0`.
- **From a computer:** `scripts/alembic_transfer.mjs send` prepares a course folder as the zip Alembic's Door E takes
  ("Bring in a course from my computer", or "Bring it back" for a folder Alembic handed out) and prints the page to
  open; `take` prints where to download a course. Coursewerk holds no credentials and uploads nothing.

## Keeping them in sync
The per-tool files are thin pointers, so drift is low. Longer term, consider generating all of them from a
single canonical source at release time. Until then, `CLAUDE.md` is authoritative and every other entry
file is a pointer to it.
