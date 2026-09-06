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
import { loadSemanticIndex, spineRelabels, claimsDigest } from "./lib/semantic_index.mjs";
import { REVIEW_QUEUE_PATH } from "./lib/escalation.mjs";
import fs from "node:fs";
import crypto from "node:crypto";
let acceptedReview = null;

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

// OPTION 1 (operator, 2026-09-06): accepting a baseline is a DECISION, not a command. Once a package
// has a stored index, `index:semantic` consumes the last gate run's queue: the gate must have run
// after the last edit (the queue's `basisSha256` equals the claims computed now), and every
// blocking/review item must carry a decision in the review sheet (`queue:review`). Without a queue,
// with a stale one, or with an undecided item, the baseline is refused and the queue keeps its memory.
{
  const storedNow = loadSemanticIndex(root);
  if (storedNow.present) {
    const queueFile = path.join(root, REVIEW_QUEUE_PATH);
    if (!fs.existsSync(queueFile)) {
      console.error("index-semantic: REFUSED — this package has a stored index but no review queue; run the gate (check_oer) after your last edit, then accept.");
      process.exit(3);
    }
    const queueBytes = fs.readFileSync(queueFile);
    let queue;
    try { queue = JSON.parse(queueBytes.toString("utf8")); } catch (e) { console.error(`index-semantic: REFUSED — ${REVIEW_QUEUE_PATH} is invalid JSON: ${e.message}`); process.exit(3); }
    if (queue.basisSha256 !== claimsDigest(index.claims)) {
      console.error("index-semantic: REFUSED — the review queue is STALE: the package changed after the last gate run. Run the gate after your last edit, decide the queue, then accept.");
      process.exit(3);
    }
    const pending = (queue.items ?? []).filter((it) => it.severity === "blocking" || it.severity === "review");
    if (pending.length) {
      const reviewFile = opt("--review");
      const sheet = reviewFile && fs.existsSync(reviewFile) ? JSON.parse(fs.readFileSync(reviewFile, "utf8")) : null;
      const queueSha = crypto.createHash("sha256").update(queueBytes).digest("hex");
      const decided = new Map((sheet?.decisions ?? []).map((d) => [d.id, d]));
      const OK = new Set(["fixed", "accepted", "dismissed"]);
      const undecided = pending.filter((it) => { const d = decided.get(it.id); return !d || !OK.has(d.decision) || String(d.note || "").trim().length < 20; });
      if (!sheet) {
        console.error(`index-semantic: REFUSED — ${pending.length} queue item(s) await a decision. Write the sheet and decide each row:\n  npm run queue:review -- --root ${path.relative(process.cwd(), root) || "."}\n  npm run index:semantic -- --root ${path.relative(process.cwd(), root) || "."} --review reports/queue-review.json`);
        process.exit(3);
      }
      if (sheet.queueSha256 !== queueSha) { console.error("index-semantic: REFUSED — the review sheet answers a DIFFERENT queue (the gate ran again since); write it again with queue:review."); process.exit(3); }
      if (undecided.length) {
        console.error(`index-semantic: REFUSED — ${undecided.length} item(s) still undecided (decision must be fixed | accepted | dismissed, with a note of 20+ characters):`);
        for (const it of undecided) console.error(`- ${it.id} ${it.kind} (${it.severity}): ${String(it.evidence?.[0] ?? "").slice(0, 120)}`);
        process.exit(3);
      }
      acceptedReview = { file: reviewFile, queueSha256: queueSha, decided: pending.length, decisions: Object.fromEntries(pending.map((it) => [it.id, decided.get(it.id).decision])) };
    }
  }
}
// Round-4 audit (atk11): the accept step took a RELABELED objective — one that still has claims
// declared under its id — with no attestation, so the stale declarations counted as coverage of
// a statement they never taught. Accepting a relabel is a decision; name the ids to make it.
{
  const stored = loadSemanticIndex(root);
  const relabels = spineRelabels(stored.spine.index, index.spine, index.claims);
  const acknowledged = new Set(String(opt("--acknowledge-relabel", "")).split(",").map((x) => x.trim()).filter(Boolean));
  const unacknowledged = relabels.filter((r) => !acknowledged.has(r.id));
  if (unacknowledged.length) {
    console.error("index-semantic: REFUSED — spine statements changed under ids that still carry declared claims:");
    for (const r of unacknowledged) console.error(`- ${r.id}: "${r.before}" → "${r.after}"`);
    console.error("Re-declare the claims under the ids that now carry their statements, or accept the relabel explicitly:\n  npm run index:semantic -- --root <root> --acknowledge-relabel " + unacknowledged.map((r) => r.id).join(","));
    process.exit(3);
  }
}
writeSemanticIndex(root, index);
// PATH-SCOPED to the artifacts this command writes. The author asked to reindex; they did not ask to
// commit their prose. Scoping also keeps the receipt honest — `committed: true` now means "the index
// moved", not "something in the tree moved". An author's own uncommitted deliverable stays
// uncommitted and is reported by the coherence gate, which is exactly correct: it is their change to
// review, not ours to bury in a reindex commit.
const git = commit ? commitOutput(root, acceptedReview ? `coursewerk: accept semantic baseline (review ${acceptedReview.queueSha256.slice(0, 12)}: ${acceptedReview.decided} decided)` : "coursewerk: reindex semantic index", { paths: SEMANTIC_INDEX_PATHS }) : null;

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
  ...(acceptedReview ? { review: acceptedReview } : {}),
  // Provenance lives HERE, in the receipt, and never inside an artifact: a timestamp in a
  // derived file would make two runs over identical bytes differ, and the delta the whole
  // semantic layer rests on depends on that byte-identity.
  generatedAt: new Date().toISOString(),
  ...(git ? { git } : {}),
}, null, 2));
