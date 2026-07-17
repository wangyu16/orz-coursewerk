# usage-package — a DEMO fixture. **Never** point the study at it.

This package exists for one reason: `tests/usage-e2e.test.mjs` drives it through the **documented**
Coursewerk workflow (`PROCEDURE.md` Stage 4 → Stage 5) using the real CLI commands, the way a user
runs them. It is the smallest package that is built to `format-contracts/deliverables.md` and gets
through the QA gate.

## THIS FIXTURE MUST NEVER BECOME THE STUDY CORPUS

If you are here because you want `scripts/study_pairs.mjs` to measure more layers, or because
`tests/fixtures/mini-package/` looks too thin and this one looks nicely filled in — **stop.**

A **usage fixture** is a DEMO. Its job is to prove the product works end to end, so it is legitimate,
and in fact necessary, for it to be rich: it carries real M12 declarations with `spineRefs`,
`sourceRefs`, `termRefs` and a real `derivedFrom` edge precisely so that all five fingerprint layers
have something to move.

A **study fixture** is EVIDENCE. Its job is to produce numbers a paper reports. Those are opposite
jobs, and the difference is not a matter of degree:

> **A fixture whose contents you chose in order to make your own cases pass is not evidence.**

Every declaration in this package was written by the same person who wrote the assertions that read
it. That is exactly right for a demo and exactly disqualifying for a measurement. An earlier agent
was asked to enrich `tests/fixtures/mini-package/` so the study would cover more layers, and
**refused** — correctly. Finding W4 (`docs/walkthrough.md`) is the honest consequence of that
refusal: the study measures 3 of 5 layers over 4 claims, every claim scan-found, `spine` and
`provenance` frozen at the hash of the empty set. **W4 is a disclosure, not a bug.** The fix for W4
is a corpus drawn from real packages nobody tuned, not a fixture the authors filled in themselves.

If someone points `study_pairs.mjs` here, the paper's numbers go **up**, and they go up **silently**,
and every one of them is worthless. Please do not be that someone.

- Measure with: `tests/fixtures/mini-package/` (and be honest about W4), or real packages.
- Demo with: this.

## Everything here is synthetic — say so if you quote it

- The source, **"Synthetic Handbook of Melting"**, **does not exist**. It has no author, no
  publisher, and no readers. Its `canonicalUrl` and `evidenceUrl` are on `fixture.invalid`, a
  reserved TLD that can never resolve.
- `metadata/evidence/src.synthetic.handbook.rev1.html` is a rights page **written for this fixture**
  that says, in plain words, that the handbook is fictional. It is not a captured copy of any real
  publisher's page. It was passed to the real `capture:rights --file` helper, so the hashes, receipt
  and `metadata/preflight/` receipt are genuine artifacts *of that synthetic input*.
- **"Fixture Author (synthetic test identity)"** in `metadata/FOUNDATION.json` is not a person. The
  assurance kernel requires a named accountable non-AI author for a `public-oer` package; this
  fixture is not published, and the name is a stand-in that says what it is.
- There is **no** `metadata/KEY_FACT_REVIEW.json` and **no** `metadata/VISUAL_REVIEW.json`, on
  purpose. Both certify that a **human** read something. `PROCEDURE.md` Stage 4 says: *"Never have an
  agent invent the human name and attestation."* Manufacturing either one to turn the release gate
  green would be forging the one signature in the system that a machine may not produce. So this
  fixture targets the **authoring** gate (`check_oer.mjs --package <pkg>`) and not the release gate
  (`--for-discovery`), and `tests/usage-e2e.test.mjs` says so where it matters.
- The chemistry is real (water melts at 0 °C; the latent heat of fusion is ~334 J/g) but teaches
  nobody: the prose exists to give the index claims, quantities, a term to rename, and a direct
  quotation to protect.

## What it is built to exercise

| | |
|---|---|
| `concepts/course.md`, `concepts/melting.md` | the spine — `## Concept sequence`, `## Objectives`, `## Key terms` (with aliases, so a **rename** is detectable), `## Misconceptions to surface` |
| `metadata/claims/study-guide/melting.json` | sidecar declarations: `spineRefs`, `sourceRefs`, `termRefs` |
| `metadata/claims/practice/melting.json` | `derivedFrom` — answer keys that depend on the stated melting point and latent heat |
| `study-guide/melting.md` `## What the source says` | a **direct quotation that carries a quantity**, so the immutable-region guard has something to refuse. (`mini-package`'s quote carries no quantity, so nothing ever targets it and the refusal branch never fires.) |

The index artifacts (`metadata/{SPINE,TERMS,CLAIMS}.json`, `COMPONENT_INDEX.json`,
`REVIEW_QUEUE.json`) are **deliberately absent**. The test copies this package to a temp dir, runs
`git init`, and then runs the documented Stage 4 commands itself — because a test that ships
pre-baked artifacts is a test that never checks whether the documented commands produce them, which
is finding W1 rebuilt as a test.
