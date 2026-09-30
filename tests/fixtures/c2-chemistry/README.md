# C2 chemistry — frozen fixture for the redesign

A complete two-chapter public package (chemical equilibrium; Le Chatelier's principle) authored with Coursewerk
v0.12.0 and its pinned Wikipedia source corpus. Frozen on 2026-09-30 at the start of the redesign (phase P0) from
the `coursewerk-caeai` project (`courses/controlled-chemistry` @ `080dd65`, sources from
`courses/controlled-chemistry-sources`). Content licence: see `package/LICENSE` and `package/metadata/ATTRIBUTION.md`
(adapted from Wikipedia, CC BY-SA).

- `package/` — the package, without its output git history.
- `inputs/` — the pinned source corpus (`SOURCE_CORPUS.json` and snapshots).
- `BASELINE-v0.12.0.json` — the v0.12.0 release gate (`check_oer --for-discovery --inputs`) on this fixture:
  criticalTotal 25 = 21 false-positive quotation flags (18 quoted misconceptions + 3 Mermaid node labels) + the
  key-fact and visual attestations (absent by design) + 2 coherence failures that come only from the copy having
  no output git or ledger. The 21 false positives are the regression cases the redesign must eliminate (MS6).

Do not edit the package in place: tests copy it to a temporary directory first.
