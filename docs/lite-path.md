# Coursewerk on a pure chat platform (no terminal)

Coursewerk is designed for an AI **agent with a terminal** — one that can clone this repo, run
`bash bootstrap/init.sh`, and run the `check` / `build` / `pack` scripts. That is the full experience
(Claude Code, ChatGPT Codex/Agent, Gemini CLI, GitHub Copilot CLI, Cursor/Windsurf/Cline).

If you only have a **pure chat UI** (ChatGPT, Claude, Grok, or Gemini in the browser, with no shell),
you can still use Coursewerk in **Light mode** — the AI does the authoring; you do the mechanical
steps it cannot. Light means no broad cross-model critique, not no high-risk review: a separate same-model pass
must still examine key facts, source/version, licenses, media rights, attribution, and accountable identity.
The intended-use profile still determines whether output belongs in `personal/` or `package/`.

## How lite mode works

1. **Give the AI the contracts.** Paste (or attach) these four files so the model has the rules:
   `CLAUDE.md`, `PROCEDURE.md`, `format-contracts/deliverables.md`, and
   `skills/courseguide-standards/SKILL.md`, plus `docs/assurance-kernel.md`. Add `skills/orz-markdown/`, `skills/orz-slides/`,
   `skills/orz-paged/`, and `skills/oer-figures/SKILL.md` when you reach figures/slides/print.
2. **Choose intended use, then author chapter by chapter.** Personal/restricted work goes under `personal/`;
   public OER goes under `package/`. In either case create the structured FOUNDATION and PROVENANCE records.
   Ask the AI to follow `PROCEDURE.md`, pausing at each gate. It produces lean Markdown as chat output or
   downloadable files. Save files under the selected root. Only public OER receives `alembic.json` and may
   enter the `package/` tree.
   Non-published authoring may use any source without a rights receipt while retaining identity/provenance and
   publication warnings. Public work needs a cleared hash-bound `metadata/preflight/` receipt, a local rights-evidence snapshot, and `inputs/SOURCE_CORPUS.json`; when comparison text
   is unavailable, record an explicit dated human attestation instead of claiming an automated scan. Source
   preparation must also create `metadata/SOURCE_RECORD.json`; verified external media needs a retained hashed
   description/license-page snapshot.
3. **Validate + package.** You run the three helper steps once (they need Node.js, not an AI):
   ```bash
   bash bootstrap/init.sh            # installs builders + initializes output Git
   node scripts/check_assurance.mjs --root package --phase pre-ingestion
   # After a separate same-model critique, bind metadata/KEY_FACT_REVIEW.json:
   npm run bind:key-fact-review -- --root package
   node scripts/check_oer.mjs --package package --inputs inputs --for-discovery --report reports/qa_report.md
   npm run generate:attribution      # regenerate the public attribution view
   node scripts/build_carriers.mjs --root package --out preview --receipt reports/carriers.json
   # A named human opens every carrier, then records the browser/DOM review:
   npm run attest:visual-review -- --root package --receipt reports/carriers.json \
     --reviewer "<human name>" --reviewed-at YYYY-MM-DD --attestation "<review statement>"
   node scripts/pack.mjs --inputs inputs # ZIP + evaluation + hash-bound release receipt
   ```
   Paste `reports/qa_report.md` back to the AI and ask it to fix any critical issues; repeat until the
   check passes.

After initial assembly, initialize the component index. For every later chat-requested revision, run
`revision_impact.mjs`, paste its report to the AI, require it to address the complete review set, and use the
attested refresh described in `docs/coherence-index.md`. A pure-chat edit to one file is not considered complete
until the dependency review is finished.

## Even lighter: skip the scripts entirely

If you cannot run Node at all, do not manually promote private/restricted material. For public OER, Alembic
must implement the same foundation/provenance checks before this route is safe. Until then, run the local
checker or have a terminal-capable agent do so; do not treat structural import success as rights clearance:
do not manually zip or import. Source-rights assurance still requires the Coursewerk gate; structural import
success alone is not rights clearance.

## What you give up in lite mode

- **No local preview** of the self-contained documents while authoring (Alembic shows them after import).
- **No pre-flight QA** unless you run `check_oer.mjs` locally (Alembic still validates the contract on import).
- **More manual assembly** — you place each file into the tree instead of the agent writing it directly.
- **The human carrier attestation cannot be delegated to the chat model** — the reviewer must actually inspect
  each rendered document and record their own name and conclusion.

Everything the AI produces — the manifest, the lean markdown, the format/quality discipline — is exactly
the same as the full experience. The terminal only automates assembly, preview, and packaging.
