# Coursewerk changelog

## v1.0.1 (2026-11-04)

- **Site type: `figures` becomes `assets`** (family SITE-TYPE-CONTRACT draft 12, owner 2026-11-03). The definition
  names where a page's assets live as `assets`; the places are unchanged, and which kinds of file an asset may be is
  Alembic's list, the same for every course. Alembic may keep a description beside each asset
  (`<asset>.about.json`: title, what it shows, subject, topic, source, credit, licence), which Coursewerk's tools may
  read. Requirement `req.sitetype.assets`.
- Since v1.0.0 on main: the site-layout guard and the job rules (never stop to ask; pull into `work/` only; no
  needs export when no questions are handed in).

## v1.0.0 (2026-11-02)

The redesign. Coursewerk is rebuilt around one idea: the instructor sets direction and standards, the agent does the
production, and every claim the package makes is either checked or visibly open. Tried on two real courses before
release: a 19-chapter General Chemistry course (re-evaluated, corrected and handed to Alembic) and an upper-level
Chemistry of Macromolecules course written chapter by chapter from the instructor's approved plans.

- **The instructor owns the spine.** Each chapter's plan (a concept map and an assessment guide, with stable anchors)
  is approved in the instructor's own words before the chapter is written; an approval knows what it approved, and a
  later change to the plan is brought back as a reviewable diff.
- **Every sentence is a unit.** The package is indexed into units, each with an id, an origin (the instructor's or
  the agent's), a link to what it teaches and the kind of check it needs. An edit nobody recorded is raised to the
  instructor, never overwritten; the instructor's text is protected whatever route changes it.
- **Facts are checked blind, by your own engine.** A context-blind pass reads each passage as a student would and
  sorts concerns into wrong and clarify; fixes are rechecked until a pass raises nothing. Semi-mechanical facts go to
  a blind verifier against pinned sources; arithmetic chains are recomputed and reactions balanced mechanically.
- **Ideas, never expression (D54).** Reference textbooks and prior notes are read for their ideas: no run of eight
  words in common with any reference ships. Citations and equations are facts, not expression.
- **One way to write math and chemistry.** A light check names every spot written outside the house notation (math in
  `$…$` with LaTeX inside, chemistry in `$\ce{}$`), including wording pasted in from a review.
- **A deterministic core and seven stable modules,** each run in its own process by one runner that decides the
  finding's class (defect, obligation, question) and route (agent, digest); the gate blocks on defects and
  obligations, never on questions.
- **A hash-chained decision log** inside every package records each approval, answer, review dispatch and publish
  decision; records agree with it, and only what the log wrote is trusted.
- **orz text format 1 (D52) and a lean delivery (D53).** The text is the course; carriers are checked clothes,
  assembled with the newest orz frames for preview; the delivered package is lean and Alembic assembles it.
- **Records where Alembic holds them.** The working record lives in `private/coursewerk/`, the public record
  (attribution, publication, checked-page hashes) in `provenance/coursewerk/`; `site_export` hands them over within
  Alembic's limits (verification records and the decision log in parts under 4 MB). The site type definition for
  Alembic is included (`site-type/`, 1.0.0-dev.1).
- **Seven adversarial red-team rounds,** each closed by root cause and re-tested (D46, D51). 1,131 tests.
- **Migration.** Packages from v0.12 migrate on the instructor's request (`docs/migrating-from-v0.12.md`); records in
  `metadata/` move once with `scripts/records_move.mjs`.

## v0.12.0 (2026-09-05)
- **CONTROL is verified, not hoped for.** The gate checks the package against the instructor's concept map in both
  directions: a declared objective nothing teaches is a fail-closed `missing-coverage` block in every mode (a
  whole dropped chapter is caught through its own key-term anchors); a deliverable tagging an undeclared objective
  fails the format contract. Coverage is reported as a floor with its denominators, never as an accusation.
- **A semantic, claim-level index beneath the file graph.** SPINE/TERMS/CLAIMS are minted from the concept maps
  only; each claim carries five fingerprints (format, label, content, spine, provenance); a whitespace reflow costs
  zero flags, a rename keeps every id, a value change reaches every dependent claim and names the ones it did not
  move (`silentRisk`). Instructor-declared `[prereq: …]` edges make prerequisite order a first-class spine input.
- **Inline anchors — identity that travels with the prose.** A list item or paragraph may end with
  `[anchor: <slug>]`; identity keys on the slug instead of the position, so a reorder keeps every claim id
  and is reported as RECHECK (order is prerequisite structure) instead of removed + added. All-or-none per
  list and unique per file, enforced; a declaration may address a block as `@slug` and never needs moving;
  a positional declaration on an anchored list is refused. The preregistered `study_pairs` apparatus goes
  from 11/12 to 12/12 with zero unexpected flags on real edits.
- **Freshness gate.** A committed index that no longer describes the package (a concept-map edit never
  re-indexed) is queued as one `stale-index` decision and blocks release; mid-edit staleness is reported only.
- **Trust layers.** Deterministic cross-artifact consistency (the study guide and the answer key must agree),
  physical-range sanity, and an unverifiable-quotation scan (a quotation that appears in no pinned source is
  refused) are wired into the publish check with an escalation queue whose reviewer burden is measured.
- **Independence is assembled.** `npm run review:blind-bundle` builds the blind reviewer's surface by allowlist
  outside the package and prints its digest; the key-fact review must declare that digest and the gate binds it.
- **Propagation with a receipt.** `npm run revision:propagate` plans and, with `--apply`, applies a mechanical
  terminology rename — never inside a quotation, citation, code fence, or source-reproduced span — refuses a
  dirty tree, commits only the planned files, and files a receipt that can verify and reverse every edit.
- **Overrides are provenance.** `record:override` gives a deliberate divergence from the source an id that the
  claim carries and the provenance fingerprint hashes; the gate stops asking, the change stays tracked.
- **Two adversarial audits, closed.** Objective restatements no longer count as coverage; the answer tab is the
  assertion the consistency scan compares (a distractor in the question, a declared type, or an extra declared
  term cannot opt a wrong answer out); template placeholders and unlocatable key facts are refused; a reordered
  concept map that re-parents declared claims is blocking; asserting the map's own misconception is blocking;
  JSON front matter (which renders) fails the format contract; a repeated heading cannot rebind a declaration;
  a forged or stranded override is refused/reported; near-miss map headings are named; code fences are scanned
  for verbatim copying; hard-wrapped and non-ASCII quotation marks are immutable and silent deletions inside a
  quotation are unverifiable; a deleted index artifact is stale; whitespace reflow is free at the file layer too
  (normalized component hashes and review bindings); symbolic links are refused; the coherence ledger cannot be
  laundered by re-initializing over history; release refuses attested-only sources without consent, never
  commits into the package, ships no review queue, and its evaluation separates measured from declared.
  Round three (two more adversaries): a teaching claim must carry the objective's vocabulary and never sit in
  the objectives list; the first value in an answer is the answer (unit look-alikes recognized); key facts are
  matched as tokens with their units and must be locatable in a deliverable; quotations up to 2000 characters
  and across paragraph breaks are immutable and an ellipsis licenses a gap only where it stands; the license
  matrix covers excerpts and assets; nine forms of hot-linked media and media outside `assets/` are refused;
  non-Latin sources are prepared and scanned; release runs write no queue; placeholder and AI-vendor
  identities are refused; license evidence is read as visible text with contradictions and redirects named;
  homographs, alias collisions and prerequisite cycles are reported; nested deliverables are attestable;
  the attested theme survives the pack rebuild; in-package report paths and non-UTF-8 files are refused.
  Round four: a restatement never teaches under any heading; SVG/link/script/orz-directive embeds are remote
  media; an answer stating two values is an ambiguous-answer decision; a relabeled objective cannot be accepted
  without `--acknowledge-relabel`; negated key facts and hidden evidence text are refused; scan-found subjects
  carry only declared dimensions.
  Every finding and its probe or dismissal: `docs/closed-loop-rounds.md`.
- **Accepting a baseline is a decision.** `index:semantic` consumes the last gate run's review queue: the
  gate must have run after the last edit, and every blocking or review item must carry a decision on the
  sheet `queue:review` writes. The queue keeps its memory; nothing is cleared by re-indexing past it.
- **Procedure.** Stage 4 opens the critique with the blind bundle; a new Stage 5b documents the revision loop,
  overrides, and propagation. The system claim register now covers every semantic-index mechanism.

## v0.11.0 (2026-07-14)
- **Focused critique survives Light mode.** Every completed package now carries a hash-bound review of accountable
  identity, source/version, licenses, external-media rights, attribution, output-license compatibility, and
  scientific key facts. Light requires a separate context-reset same-model pass; Full requires cross-model review;
  every public chapter has a traced key fact and related edits invalidate the record.
- **Source evidence ships with the course.** Source preparation writes an exact compact `SOURCE_RECORD.json` with
  raw/text hashes, word counts, extractor and retrieval metadata. Public QA verifies raw byte counts, rejects
  duplicate text and Wikipedia page/revision identities, and the release receipt hashes the retained record.
- **Media rights are evidence-backed.** Verified external media requires a hashed authoritative description/license
  snapshot with capture/retrieval metadata. A new capture command creates it, and repeated source-license pages are
  content-address deduplicated without collapsing source-specific receipts.
- **Public identity is genuinely accountable.** Temporary/placeholder public authors fail; the named person or
  institution must have explicit rights-holder status and user-confirmed accountability.
- **Human carrier review is release-bound.** Carrier receipts include local-asset digests and stable fingerprints
  that normalize only the builders' random document UUID. Packing rebuilds every carrier and refuses release unless
  it matches an identified human browser/DOM attestation; source, asset, or meaningful carrier changes make it stale.
- **Honest staged reporting and receipts.** Authoring reports disclose deferred final gates, release counts focused
  critique and visual-review failures, and receipts retain the accepted Git head plus hashes of all new evidence.

## v0.10.1 (2026-07-13)
- **License and access assertions separated.** AI/automated-use notices are retained as evidence with their legal
  effect explicitly undetermined; they no longer masquerade as amendments to a Creative Commons license or
  automatic copyright prohibitions.
- **Private authoring remains open.** Personal-private and restricted-teaching work may use any source without a
  rights receipt; Coursewerk retains identity, provenance, and future-publication warnings instead of blocking.
- **OpenStax policy made honest.** OpenStax is an avoid-when-practical preference, not a prohibition. Its notice is
  visible while lawful-use and publication decisions remain with the instructor.
- **Regression semantics corrected.** Generic AI-use notices can clear pre-ingestion while remaining visible;
  verified public license claims, attribution, source-expression handling, and evidence integrity remain gated.

## v0.10.0 (2026-07-13)
- **Hash-bound pre-ingestion clearance.** Rights capture now asserts known-source expectations and records
  structured retrieval/operator evidence in a separate receipt. Source preparation rechecks the receipt,
  source binding, evidence hash, process decision, and policy before reading any non-owned source.
- **Stage-aware assurance.** Pre-ingestion, authoring, and release phases report only relevant readiness;
  unresolved process conditions cannot appear private-ready, and report/JSON parents are created automatically.
- **Wikipedia science-topic workflow.** A verified CC BY-SA 4.0 policy, template, guide, and serialized Wikimedia
  API collector assemble several revision-pinned English Wikipedia pages into a 6,000–25,000-word chapter corpus
  with a meaningful User-Agent and page-level attribution/change obligations.
- **Stronger evidence receipts.** Human-facing process excerpts use normalized visible text, retrieval records
  include redirects/HTTP metadata/bytes/tool version, source extractors are versioned, and releases hash the exact
  source-corpus manifest.
- **Adversarial regression coverage.** Tests prove that a known OpenStax identity missing its expected notice
  cannot clear capture or source preparation, and that valid Wikipedia evidence does clear the same hard kernel.

## v0.9.0 (2026-07-13)
- **Process-rights preflight before source ingestion.** Authoritative rights evidence is deterministically
  scanned for generative-AI, model-training, and automated-processing reservations. OpenStax Chemistry 2e's
  known notice is asserted, and unresolved notices stop the workflow until permission or a qualified,
  accountable decision is recorded.
- **Stronger public accountability and evidence.** Public packages require a non-AI author/rightsholder;
  automatic source corpora bind raw snapshots, raw hashes, canonical URLs, retrieval times, extractor metadata,
  and extracted-text hashes.
- **Accessible runtime visuals and deliberate media.** Mermaid/chart blocks require visible text alternatives.
  Chapters without a rights-cleared photograph require a substantive reviewed media decision rather than
  silently falling below the authoring standard.
- **Honest carrier evidence.** Receipts distinguish single-file carriers from carrier-plus-assets output,
  stop claiming an unperformed rendered-image audit, support strict single-file enforcement, and persist the
  exact carrier receipt beside every release receipt.
- **Dedicated Coursewerk website.** A dependency-free, responsive product site uses the orz seal with a distinct
  evidence-led control-room theme and deploys from `site/` through GitHub Pages. Its product claims are connected
  to the same branch-aware Coursewerk system index as code, tests, instructions, and templates.

## v0.8.0 (2026-07-13)
- **Coursewerk indexes itself.** Stable product claims, repository components, typed correlations, known
  findings, branch merge-base impact, canonical generation, accepted revision records, and CI verification keep
  code, tests, instructions, templates, skills, contracts, and documentation aligned across branches. Accepted
  revision records are append-only across a branch and bind review evidence to the canonical index digest.
- **Source and rights evidence hardened.** Public release requires `SOURCE_CORPUS.json`, hashed primary-source
  comparison text or explicit human attestation, hashed local rights-evidence snapshots, and exact bundled
  canonical Creative Commons legal text. Scaffold input can no longer produce a false clean comparison.
- **Provenance made deterministic.** Remote hot-linked media is blocked; local paths and every `usedIn` location
  are verified, including the actual reference from each named document; attribution is generated byte-for-byte
  from structured provenance; provenance changes propagate to incorporating documents.
- **Release QA expanded.** Heading order and descriptive links are hard failures, orz validation uses the real
  parser plus corrected plugin/container checks, discovery metadata and chapter skeletons are enforced, and
  obvious instructor-only leakage is rejected.
- **Three-carrier release verification.** Safe declared routing builds inline mdhtml, slides, and paged carriers,
  including valid private/current/personal sources. Packing requires successful builds and emits an evaluation,
  archive hash, and structured release receipt.
- **Adversarial regression suite.** Tests cover scaffold-only/duplicate source records, remote media, accessibility,
  malformed chart/nesting, minimal deliverables, public/private leakage, exact licenses, index replacement,
  orphan provenance, carrier routing, unsafe output paths, license compatibility, append-only revision evidence,
  and branch-aware Coursewerk impact.

## v0.7.0 (2026-07-13)
- **Mode-independent assurance kernel.** Structured `FOUNDATION.json` and `PROVENANCE.json` records assert
  intended use, source identity/version/scope, rights basis and authoritative license evidence, privacy,
  attribution obligations, item provenance, and publication clearance in both Full and Light modes.
- **Three intended-use profiles.** Personal-private and restricted-teaching work lives under `personal/`,
  retains provenance but no open output license, and cannot be packed for Alembic. Public OER must clear every
  source/license/provenance blocker. Unknown/private-only items must be recorded and visibly labelled.
- **Fail-closed release.** QA includes assurance failures in `criticalTotal` and Discoverability; `pack.mjs`
  reruns the complete gate and creates no ZIP on failure. `check_assurance.mjs` checks private work without
  misrepresenting it as publication-ready.
- **Known-source policy registry.** OpenStax *Chemistry 2e* is pinned to CC BY-NC-SA 4.0, canonical evidence,
  and required per-deliverable attribution, preventing the previously observed CC BY false pass.
- **Regression suite.** Node tests cover licensing, evidence, attribution, private unknown-source labelling,
  and pack refusal/success.
- **Revision coherence graph.** Every output component is SHA-256 indexed with source-to-dependent relationships.
  Edits automatically invalidate affected downstream components; impact plans include upstream review context,
  and stale plans, incomplete review sets, or missing attestations cannot refresh the index or pass release QA.
- **Git-backed output history.** Bootstrap initializes `package/` and `personal/` as independent repositories;
  direct user edits remain visible, initial indexing records a coherent baseline, and accepted refreshes create
  coherent-revision commits. Git metadata is excluded from QA and Alembic ZIPs.
- **Product capability record.** Root `FEATURES.md` maps the end-to-end OER authoring burden—planning,
  drafting, proofreading, accessibility, rich web/slide/print formatting, rights, coherence, maintenance, and
  delivery—to Coursewerk's automation, agent workflows, hard gates, evidence, and human-review boundaries.

## v0.6.0 (2026-07-12)
- **Alembic-native output + orz-markdown family incorporated as core.** Coursewerk now builds a valid
  **Alembic package** (`package/alembic.json` manifest + `study-guide/ concepts/ slides/ practice/
  assessment-support/ assets/ metadata/ private/`, slug filenames) that uploads with zero friction — no
  hand-translation. It authors natively with the orz family: study guides & practice in orz-markdown,
  slides in the **orz-slides deck grammar**, print in orz-paged.
- **Author-with-framework, ship-lean model.** Lean `.md` is the source of truth; `scripts/build_carriers.mjs`
  builds the self-contained orz carriers (`.md.html`/`.slides.html`/`.paged.html`) into a throwaway
  `preview/` for local reading + QA; `scripts/pack.mjs` produces a **lean** upload zip (carriers excluded —
  Alembic reassembles the framework and assigns permalinks/ids on its side). License is package-level
  (`alembic.json` + `LICENSE`); identity is minted by Alembic on import; optional `{{attrs[#blk-…]}}` block
  ids may ship for durable citation.
- **QA gate rewritten** (`scripts/check_oer.mjs`): now validates the **Alembic contract** (mirrors
  `validatePackageForImport`/`repoForPath` via `scripts/lib/contract.mjs`) *and* keeps the OER-quality checks
  (attribution, links, orz-syntax, accessibility, placeholders, per-deliverable format contracts). Reports
  live in `reports/` (outside the package). Slides format contract now checks the orz-slides deck grammar.
- **Tooling:** `package.json` depends on `orz-mdhtml`/`orz-slides`/`orz-paged`/`orz-markdown`;
  `bootstrap/init.sh` installs them and creates `package/ preview/ reports/ dist/`. Docs (`CLAUDE.md`,
  `PROCEDURE.md`, `README.md`, `AGENTS.md`, `format-contracts/deliverables.md`, `skills/courseguide-standards`,
  `skills/oer-qa`) rewritten to the new layout + grammars.
- **Comprehensive authoring guidelines + full tool coverage.** New `docs/authoring-guidelines.md` (the
  cross-cutting quality rules: graphics preference ladder incl. **AI concept illustrations** with guardrails,
  the semantic-formatting palette, study-guide→slides, accessibility, coherence, notation). New
  **`skills/orz-slides`** (course slide decks — layout grammar + one-concept-per-slide pedagogy) and
  **`skills/orz-paged`** (paginated collection docs — exams with the answer-key toggle, syllabi, handouts),
  both pointing to the installed tool skills for full grammar. `skills/oer-figures` extended with the
  `{{chart}}` simple-plot path and the AI-illustration rung; `skills/orz-markdown` snapshot flagged +
  pointed at the installed current reference (adds the `{{chart}}` plugin).
- **Any-platform reach.** Pointer entry files for `GEMINI.md`, `.github/copilot-instructions.md`,
  `.cursorrules` (all → `CLAUDE.md`), plus **`docs/lite-path.md`** for pure chat UIs (no terminal);
  `COMPATIBILITY.md` updated.
- **Licensing tiers + copyright verification.** coursewerk is non-mandating: a package can be **private**
  (license `ALL-RIGHTS-RESERVED` — new value; uploads/publishes but not listable), **published**, or
  **discoverable** (needs an open license + verified-clean content). The QA gate gained: a **near-verbatim
  detector** (`scripts/lib/verbatim.mjs`, wired via `--inputs`) that flags prose copied from the source; a
  **Discoverability** report (open-license + attribution-complete + no verbatim spans) and a
  **`--for-discovery`** flag that makes those blockers release-blocking; and `isOpenLicense` /
  `ALL_RIGHTS_RESERVED` in `scripts/lib/contract.mjs`. Guidelines gained the license≠copyright distinction,
  the positive-provenance principle, and the anti-verbatim authoring rule (`docs/authoring-guidelines.md`
  §4, §7).

## v0.5.0 (2026-06-24)
- **Honest evaluation report as the final stage** (`guide/evaluation.md`): the real artifact-quality
  numbers (attribution, accessibility, links, orz-syntax, format contracts, residual-flaw audit
  classified auto-eliminable / cosmetic-needs-human / content) — the deliverable evidence for
  no-intervention test runs. Stage list is now 1–7 (QA gate → evaluation → deliver).
- `NOTES.md`: added the clean-evidence validation plan (no-intervention domain runs at ~3 chapters).


## v0.4.0 (2026-06-24)
- **Focused cross-critique:** Full-mode critique now targets HIGHER-LEVEL quality only (scientific/
  conceptual correctness, pedagogy, coherence, objective coverage); mechanical issues (format, syntax,
  links, attribution, spelling) are left to the deterministic QA script — lower cost, higher value.
- Added `NOTES.md` (deferred ideas: study-guide/slides layout redesign — operator to implement;
  folding the full evaluation + auto-revise into the pipeline).


## v0.3.1 (2026-06-24)
- **Agent compatibility:** clarified that `CLAUDE.md` is the canonical entry/"constitution" and
  `AGENTS.md` points to it (so whichever file a tool reads, it reaches the same instructions). Added
  `COMPATIBILITY.md` noting future thin-pointer files for other tools (GEMINI.md, Copilot, Cursor, …).


## v0.3.0 (2026-06-24)
- **Your own harness (`~/.coursewerk/`)**: a durable, personal layer the agent reads every run and
  **distills into** as you steer — preferences, styles, templates, and your additional skills. Lives
  in your home directory, so **Coursewerk updates never overwrite it**; it is shared across all your
  courses and compounds over time. Created by `bootstrap/init.sh`; driven by `CLAUDE.md §0.6`.


## v0.2.0 (2026-06-24)
- **Light mode** for single lower-tier ($20) subscriptions: no cross-model critique (quality verified
  by the deterministic QA script + a self-review), and day-paced building (~3 chapters/session,
  checkpoint + stop, resume next day) to respect rate limits. Mode chosen at start, stored in
  `.coursewerk/mode`; Full mode keeps cross-model critique.
- QA script (`scripts/check_oer.mjs`) now also checks **format contracts** (graphics-free concept
  maps/assessments, slide LAYOUT/separators, etc.) so script verification can carry more weight.


## v0.1.0 (2026-06-24)
- Initial extraction from the Conductor `course_guide` archetype as a standalone, agent-native harness.
- Five-deliverable pipeline (concept map · study guide · slide spec · assessment guide · practice sheet)
  + course-wide concept map, in `PROCEDURE.md`.
- Bundled skills: orz-markdown, oer-figures, oer-qa, courseguide-standards.
- Automated QA gate (`scripts/check_oer.mjs`): attribution-completeness, link/path integrity,
  orz-syntax, accessibility proxies, placeholders.
- Auto-update on each session via `git pull`; workspace bootstrap (`bootstrap/init.sh`).
