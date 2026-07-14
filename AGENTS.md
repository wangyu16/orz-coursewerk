# Coursewerk — agent entry

Coursewerk's full entry instructions are in **[`CLAUDE.md`](CLAUDE.md)** (provider-neutral — they
apply to any AI CLI agent, not only Claude). **Read `CLAUDE.md` first, then `PROCEDURE.md`.**

Quick orientation:
- You are the **executor**; Coursewerk is the harness you follow.
- On each session: `git pull --ff-only` (auto-update), then `bash bootstrap/init.sh` (installs the
  orz-family builders + creates `personal/`, `package/`, `preview/`, `reports/`, `dist/`).
- Ask intended use first. Personal/restricted work stays under `personal/`; only cleared public OER enters
  `package/`. Both paths require `FOUNDATION.json` + `PROVENANCE.json` and the mode-independent assurance kernel.
- Light mode still requires a separate context-reset same-model critique of identity, licenses, media rights,
  attribution, and key facts; Full records cross-model review. Public release also requires an identified human
  browser/DOM carrier attestation. Both records are hash-bound and stale after related edits.
- Build the five deliverables per `PROCEDURE.md`, pausing at each ⏸ gate. Never fabricate facts or figures;
  keep provenance complete. Unknown/private-only material is visibly labelled and blocks publication.
- Maintain `metadata/COMPONENT_INDEX.json`. After any edit, run the revision-impact workflow and review/revise
  every affected dependent before an attested refresh; never revise one carrier in isolation.
- `package/` and `personal/` are independent Git repositories. On every resumed run, inspect status/diff first;
  preserve user edits. Git identifies changes, while the component graph identifies all consistency work.
- When changing Coursewerk itself, use `docs/coursewerk-system-index.md`: compute merge-base impact, review every
  correlated claim/code/test/doc/template/skill, accept the revision, and verify the canonical system index.
- Run `check_assurance.mjs` for private work or `check_oer.mjs` for public packages. `pack.mjs` is public-OER
  only and reruns the hard gate before producing a lean ZIP.
