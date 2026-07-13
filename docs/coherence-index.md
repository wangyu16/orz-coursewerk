# Component index and revision coherence

Coursewerk treats every generated file as a component in a dependency graph. The graph is mode-independent:
Full/Light changes critique cost, never revision consistency.

Every `package/` or `personal/` output root is also an independent Git repository, initialized by bootstrap.
These two layers have different jobs:

- Git records authorship history and exposes direct edits, additions, removals, and commits.
- The component index records the last accepted coherent state and computes downstream review obligations.

A clean Git working tree is not proof of coherence: a user may have committed a direct edit. Current component
hashes are therefore always compared with the accepted index as well as Git status. The index hash is also
anchored in a sibling `.coursewerk` ledger, so replacing content and the index in the same commit remains visible.

## What is indexed

`metadata/COMPONENT_INDEX.json` is generated from all files under the selected output root, including:

- manifest, LICENSE, README, foundation, provenance, and attribution records;
- course and chapter concept maps;
- study guides, slides, assessment support, and practice;
- assets and the documents that reference them;
- private/supporting output files.

Each component stores a SHA-256 content hash and the hashes of its dependencies at the last accepted coherence
review. Relationships are generated in the source-to-dependent direction, including:

```text
FOUNDATION → all components
manifest → all public deliverables
course concept map → chapter concept map
chapter concept map → study guide + assessment
study guide → slides + assessment + practice
assessment → practice
asset → every document that references it
PROVENANCE → ATTRIBUTION
```

## Initial indexing

After the first complete assembly and coherence pass:

```bash
node scripts/index_components.mjs --root package --initialize
```

Use `personal` instead of `package` for private/restricted work. Initialization is refused when an index already
exists. A small history marker under `.coursewerk/` also prevents accidental deletion followed by reinitialization;
restore or explicitly review a lost index instead of resetting revision history.
Initialization commits the complete accepted state as `coursewerk: initialize coherent output`.

## Every revision

After any edit, addition, removal, rename, or asset-reference change:

```bash
node scripts/revision_impact.mjs --root package \
  --json reports/revision-impact.json \
  --report reports/revision-impact.md
```

On a resumed session, first inspect `git -C package status --short` and `git -C package diff` (or use
`personal`). This reveals human edits before the agent changes anything. Then generate the impact plan.

The plan contains:

- `changed` — components whose content/path/relationships changed;
- `requiredReview` — changed components plus every transitive downstream dependent that must be checked and
  revised when necessary;
- `reviewContext` — upstream authoritative components that must be consulted for consistency;
- `reasons` — exact stale hashes/dependencies/relationships;
- `planId` — a digest of the current state. Any subsequent edit makes the plan stale.

Revise every required component. Regenerate the plan after the final edit. In its JSON, fill `reviewed` with
every ID in `requiredReview` and add a substantive `attestation` explaining that terminology, objectives,
examples, notation, answers, asset usage, and licensing/provenance were checked against the review context.

Then refresh:

```bash
node scripts/index_components.mjs --root package --refresh \
  --review reports/revision-impact.json
```

Refresh is refused if the plan is stale, any required component is absent from `reviewed`, or the attestation is
missing. A successful refresh commits all accepted output changes as a `coursewerk: coherent revision …` commit.
QA and packing fail while the index is stale.

## Revision rules

- Never use `--initialize` to erase a stale index.
- “Reviewed” does not mean every dependent must be textually changed; it means it was compared with the changed
  source and either revised or explicitly confirmed consistent.
- A direct edit to a dependent (for example, a slide) still requires comparison with its upstream context.
- Preserve user edits. Do not reset, overwrite, or auto-resolve them merely because generated content differs.
- User-created commits are valid history, but they do not update the accepted coherence index or waive review.
- Changes to foundational facts deliberately have a wide blast radius.
- Public release requires the index. Intermediate first-pass authoring may run ordinary QA before initialization,
  but `--for-discovery` and `pack.mjs` always fail without a current index.
