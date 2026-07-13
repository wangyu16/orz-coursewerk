# Coursewerk assurance kernel

The assurance kernel is the small set of checks that **always runs**, regardless of Full/Light review mode.
Review mode may reduce critique cost; it never relaxes source identity, rights, provenance, privacy, license,
attribution, or publication-clearance checks.

Cross-document consistency is enforced by the companion component index and attested revision protocol in
`docs/coherence-index.md`; it is part of the same mode-independent hard-rule layer.

## Choose intended use first

Before authoring, ask the user which condition applies and record it in `metadata/FOUNDATION.json`:

1. **`personal-private`** — creator-only, local, never uploaded/shared/published. Author under `personal/`,
   not `package/`. No output license is required. Source/provenance records remain mandatory. Unknown or
   exception-based items are allowed only when explicitly recorded and visibly labelled; they block promotion.
2. **`restricted-teaching`** — genuinely access-controlled teaching. Record jurisdiction and an explicit rights
   basis. Do not use the Alembic public package path unless the destination provides real access controls.
3. **`public-oer`** — public website/repository/Alembic/Discover. Every source right and asset must be verified,
   the output license must be compatible, required attribution must appear, and publication blockers must be zero.

Input rights and output licensing are different. `ALL-RIGHTS-RESERVED` does not repair an unauthorized source
use. A user-asserted copyright exception is not a public-release clearance.

## License facts, access notices, and source-support policy

Before any substantive source text is sent to an AI agent, a non-generative helper captures and scans the
authoritative rights page. It verifies the declared copyright license and records any separate statement about
generative-AI ingestion, model training, or automated processing in `rightsBasis.processUseReview`. A known-source
policy may require an expected notice to be present so a stale or incomplete snapshot cannot silently pass.

A detected notice is evidence, not a legal conclusion. Coursewerk does not treat it as an amendment to a Creative
Commons license, does not infer that distilled facts or knowledge are protected expression, and does not decide
whether copyright permission, a contractual access term, or an exception applies in a jurisdiction. The receipt
may therefore clear while retaining the notice and `legalEffectDetermined: false`.

Source preference is a separate product judgment. Coursewerk advises using alternatives to OpenStax to reduce
access-terms disputes, but that advice does not block private authoring or publication and is not a determination
that copyright law or the declared CC license forbids AI processing.

For `personal-private` and `restricted-teaching`, source-rights checks are advisory: any source may be used without
a receipt, while identity, provenance, unknown-source labels, and warnings are retained for a possible later
publication review. For `public-oer`, verified license statements, attribution, compatible licensing of copied or
adapted expression, and honest provenance remain hard factual checks. Separate AI-use notices remain warnings; the
instructor decides whether to publish.

## Required structured records

- `metadata/FOUNDATION.json` — intended use, audience/access/redistribution, jurisdiction, privacy assertions,
  exact source identity/scope, rights basis and evidence, output-license decision.
- `metadata/PROVENANCE.json` — every incorporated asset/item, where it is used, source/license/attribution,
  provenance status, publication status, and any blocking reason.
- `metadata/ATTRIBUTION.md` — human-readable attribution for a public Alembic package. It complements rather
  than replaces structured provenance and is generated deterministically from it.
- `metadata/evidence/<source-id>.*` — a local snapshot of the authoritative rights evidence, with its SHA-256
  and structured retrieval/capture operator record in the source's rights basis.
- `metadata/preflight/<source-id>.json` — the clearance decision bound to the source record, source-support policy,
  evidence hash, separate notice review, retrieval record, and operator. Source preparation re-verifies it before
  reading content.
- `inputs/SOURCE_CORPUS.json` — binds each primary source ID to a raw snapshot and hash, canonical URL,
  retrieval timestamp, extractor/version, hashed extracted text, or an explicit human comparison attestation.
  IDs must be unique and declared in the foundation; scaffold instructions never satisfy source comparison.
- `metadata/MEDIA_PLAN.json` — for each declared chapter without a rights-cleared photograph, records the
  accountable review and substantive reason that a photograph would not improve instruction.

Allowed provenance states: `verified`, `self-generated`, `user-owned`, `incomplete`, `unknown`.
Allowed publication states: `cleared`, `private-only`, `blocked`.

Unknown/incomplete/private-only items must include `blockReason`. Wherever used, they must be visibly labelled
with either `Provenance ID: <id>` or `[SOURCE-UNKNOWN: <id> — ...]`. Missing provenance is never silently allowed.
Permission/institutional-authorization records used publicly must explicitly state whether adaptation and public
distribution are allowed and list the permitted output license(s); the existence of a permission document alone
does not establish those rights.

## Commands

Prepare automatic source-comparison text (plain text, Markdown, HTML, PDF, and DOCX are supported):

```bash
npm run prepare:source -- --root <package-or-personal> --inputs inputs \
  --source-id <foundation-source-id> --file <source-file> --canonical-url <source-url>
```

When extraction is genuinely unavailable, record the human comparison explicitly instead of claiming an
automatic scan:

```bash
npm run prepare:source -- --root <package-or-personal> --inputs inputs \
  --source-id <foundation-source-id> --human-attested \
  --attested-by <reviewer> --attested-at YYYY-MM-DD --reason <why-automatic-comparison-is-unavailable>
```

After completing the source's identity, license, evidence URL/type, and verification date in the foundation,
capture a supplied evidence page or let the helper fetch the recorded URL:

```bash
npm run capture:rights -- --root package --source-id <foundation-source-id> \
  --operator-name <agent-or-person> --operator-type <automation|human> \
  --contact <email-or-project-url> [--file <saved-authoritative-page>]
```

The helper stores and hashes the local snapshot, records structured retrieval/capture metadata, asserts known-source
policy expectations, and writes a hash-bound receipt under `metadata/preflight/`. A generic AI-use notice and an
OpenStax source-preference advisory do not cause status 3. Public preparation exits with status 3 when a verified
fact is missing or conflicting. Non-published preparation may proceed without a receipt. Public preparation
independently re-verifies the receipt, evidence hash, source binding, and policy.

For a private workspace:

```bash
node scripts/check_assurance.mjs --root personal --phase authoring --report reports/assurance_report.md
```

Private readiness may pass while the report still lists future-publication blockers.

Use `--phase pre-ingestion` before public-source preparation, `--phase authoring` while developing private or
restricted materials, and `--phase release` for final public packaging. A phase report omits irrelevant later-stage
noise, and its exit status reflects that phase's actual readiness.

For a public package:

```bash
node scripts/check_oer.mjs --package package --inputs inputs --for-discovery --report reports/qa_report.md
```

`scripts/pack.mjs` reruns the complete gate and refuses to create an archive unless the usage profile is
`public-oer` and all hard failures/publication blockers are cleared. It also enforces the public/Discover bar;
keep readable source text under `inputs/` (or pass `--inputs`) and register it in `SOURCE_CORPUS.json` so
near-verbatim comparison can run. A named source without available comparison text must use an explicit,
dated human attestation; Coursewerk reports that distinction instead of claiming an automated scan.

## Promotion

Changing from private/restricted to public invalidates the previous decision. Recheck every source and item;
verify, replace, remove, or obtain permission for all blockers; create the compatible manifest/LICENSE; then run
public QA. Private-use assertions never authorize later publication.
