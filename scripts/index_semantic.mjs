#!/usr/bin/env node
// Write the Coursewerk semantic index — spec §6.8's one-shot `reindex`.
//
// Regenerates `metadata/{SPINE,TERMS,CLAIMS}.json` from the package and commits them. This is
// the ACCEPT step of the semantic layer, and unlike `index_components.mjs` it takes NO
// `--initialize`/`--refresh`/`--review`: those exist because the component index is an ATTESTED
// coherence state, and regenerating one without its attestation would launder an unreviewed edit
// into "accepted". These three artifacts are pure projections of the package — same bytes in,
// same bytes out — so there is nothing to attest and running this twice is a no-op. See the
// header of `lib/semantic_index.mjs`.
//
// WHY IT COMMITS. The artifacts are the "before" a later compute is diffed against, and a flag a
// human acts on must be regenerable from git months later to check whether the machine was
// right. An untracked or gitignored snapshot cannot do that job — and it would leave `Git ??`
// on the package's own coherence audit. Committing is NOT a bypass: `auditCoherence` gates on
// the accepted component HASHES, not on git cleanliness, so a pending edit swept into this
// commit still reports "content changed after the last coherence review". `--no-commit` is for
// a caller that manages its own git.
import path from "node:path";
import {
  SEMANTIC_INDEX_PATHS,
  computeSemanticIndex,
  writeSemanticIndex,
} from "./lib/semantic_index.mjs";
import { commitOutput, ensureOutputGit } from "./lib/output_git.mjs";

const args = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const root = path.resolve(opt("--root", "package"));
const commit = !args.includes("--no-commit");

if (commit) {
  try { ensureOutputGit(root); }
  catch (e) {
    console.error(`index-semantic: ${e.message}`);
    process.exit(2);
  }
}

const index = computeSemanticIndex(root);

// REFUSE rather than write an empty index. The empty spine is honest DATA (M13 never invents a
// node), but an empty index is not a working one: every spineRef in the package would dangle
// against an empty node set, and a `reindex` that printed "ok" over it would report a baseline
// it does not have. An honest gap beats a confident success.
if (index.conceptMaps.length === 0) {
  console.error("index-semantic: no concept maps under concepts/; there is no spine to index.");
  for (const w of index.warnings) console.error(`- ${w}`);
  process.exit(2);
}

writeSemanticIndex(root, index);
const git = commit ? commitOutput(root, "coursewerk: reindex semantic index") : null;

// Warnings go to stderr and the receipt, and do NOT change the exit code: they name real gaps in
// the package (no `## Key terms`, no claims) that a half-written but legitimately-in-progress
// map will carry, and failing on them would make the writer unusable exactly when it is most
// needed. They are never silent.
for (const w of index.warnings) console.error(`index-semantic: ${w}`);
console.log(JSON.stringify({
  action: "reindexed",
  root,
  files: SEMANTIC_INDEX_PATHS,
  conceptMaps: index.spine.generatedFrom,
  spineNodes: index.spine.nodes.length,
  terms: index.terms.terms.length,
  claims: index.claims.claims.length,
  warnings: index.warnings,
  // Provenance lives HERE, in the receipt, and never inside an artifact: a timestamp in a
  // derived file would make two runs over identical bytes differ, and the delta the whole
  // semantic layer rests on depends on that byte-identity.
  generatedAt: new Date().toISOString(),
  ...(git ? { git } : {}),
}, null, 2));
