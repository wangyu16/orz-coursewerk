# Coursewerk system index

Coursewerk indexes its own claims, implementation, tests, documentation, templates, skills, contracts, and
release metadata. The repository index is separate from the component index placed in generated course packages.

## Branch-aware baseline

On a feature branch, the impact plan loads the accepted `system/COURSEWERK_INDEX.json` from the Git merge base
with the target branch. It never treats a replacement index in the working branch as historical evidence.
The target tip is also part of the plan identity. When it moves, the plan ID changes; a branch whose merge base
is behind that tip must update before its review can be accepted.

## Workflow

```bash
npm run system:index
npm run system:impact -- --base main
# Complete reviewed, testResults, and attestation in .coursewerk/coursewerk-impact.json
npm run system:accept -- --base main
npm run system:verify
```

Every hard-gate or automated product claim in `system/CLAIMS.json` must point to implementation and test files.
Typed relationships in `system/RELATIONSHIPS.json` propagate changes to everything requiring review. Accepted
revision records are append-only under `system/revisions/`: branch verification rejects modification or deletion
of any record inherited from the merge base. Each accepted record binds its plan to the SHA-256 digest of the
canonical generated index.

The index is tamper-evident, not cryptographically tamper-proof. Protected-branch CI must regenerate it, compare
it byte-for-byte, calculate impact from the merge base, and reject stale or incomplete review records.
