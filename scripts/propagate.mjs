#!/usr/bin/env node
// Propagate an AUTHORIZED terminology rename across the package — M9's product caller.
//
// Everything upstream detects; this is the one documented command that ACTS on a teaching artifact,
// so it acts under the narrowest contract the design allows (spec §5 rule (b), §10 decision 2):
//   * only the MECHANICAL tier (a RENAME: one label -> another, resolved through the term registry);
//     every other verb needs judgment and is routed to the receipt as "held for review";
//   * never inside an immutable region (quotations, citations, code fences, orz payloads, and — when
//     `--inputs` pins the source corpus — spans reproduced from the source): refusals are RECORDED;
//   * dry-run by default: the plan is written to reports/ and the package is untouched. `--apply`
//     writes the files named in the plan and nothing else, commits ONLY those files, and files a
//     receipt with before/after text and file hashes on both sides — enough to verify and to reverse.
//   * refuses to apply over an uncommitted tree: an instructor's WIP must never be swept into an
//     automatic edit's commit, and the receipt's "before" hash must be a committed state.
//
// After `--apply`, run the gate: the revision layer sees the label move (RENAME), the review queue
// asks for what still needs judgment, and the accept step (`index:semantic`) re-baselines.
//
// Usage:
//   node scripts/propagate.mjs --root package --term term.melting-point --from "melting point" --to "fusion point"
//        [--inputs inputs] [--apply] [--authorized-by "<name>"] [--reason "<why>"] [--out reports] [--no-commit]
import fs from "node:fs";
import path from "node:path";
import { computeSemanticIndex } from "./lib/semantic_index.mjs";
import { immutableRegions } from "./lib/immutable.mjs";
import { planPropagation, applyMechanical } from "./lib/propagate.mjs";
import { commitOutput, outputGitState } from "./lib/output_git.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const has = (name) => args.includes(name);
const root = path.resolve(opt("--root", "package"));
const out = path.resolve(opt("--out", "reports"));
const termId = opt("--term");
const from = opt("--from");
const to = opt("--to");
const inputsDir = opt("--inputs");
const apply = has("--apply");
const commit = !has("--no-commit");
const authorizedBy = opt("--authorized-by", "");
const reason = opt("--reason", "");

function die(code, message) { console.error(`propagate: ${message}`); process.exit(code); }
if (!fs.existsSync(root)) die(2, `package root not found: ${root}`);
if (!termId || !from || !to) die(2, "--term <termId> --from <label> --to <label> are required (the only mechanical tier is a RENAME).");
if (from === to) die(2, "--from and --to are identical; nothing to propagate.");
const rel = path.relative(root, out);
if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) die(2, `--out must be OUTSIDE the package root (got ${out}); use reports/`);

// The fresh index is the authority on what the labels mean and where the claims live.
const index = computeSemanticIndex(root);
const term = (index.terms.terms ?? []).find((t) => t.id === termId);
if (!term) die(2, `unknown term ${termId}; known: ${(index.terms.terms ?? []).map((t) => t.id).join(", ") || "(none — is concepts/ indexed?)"}`);
const knownLabels = [term.preferredLabel, ...(term.aliases ?? []), ...(term.labels ?? [])].filter(Boolean).map((l) => String(l).toLowerCase());
const warnings = [];
if (!knownLabels.includes(String(from).toLowerCase()))
  warnings.push(`"${from}" is not a registered label of ${termId} (${knownLabels.join(", ")}); occurrences are matched literally.`);

// Pinned source texts make source-reproduced spans immutable too. Optional, honest when absent.
function loadSourceTexts(dir) {
  if (!dir) return null;
  const manifest = path.join(dir, "SOURCE_CORPUS.json");
  if (!fs.existsSync(manifest)) return null;
  let corpus;
  try { corpus = JSON.parse(fs.readFileSync(manifest, "utf8")); } catch { return null; }
  const texts = [];
  for (const entry of corpus.sources ?? []) {
    if (entry.comparisonMode !== "automatic" || !entry.textPath) continue;
    const file = path.join(dir, String(entry.textPath));
    if (fs.existsSync(file)) texts.push(fs.readFileSync(file, "utf8"));
  }
  return texts.length ? texts : null;
}
const sourceTexts = loadSourceTexts(inputsDir ? path.resolve(inputsDir) : null);
if (inputsDir && !sourceTexts) warnings.push(`no automatic source texts found under ${inputsDir}; source-reproduced spans are NOT protected in this run.`);

// M8 regions per file, over the ORIGINAL text, in JS string indices (interfaces §5f).
const regionsByFile = {};
for (const claim of index.claims.claims ?? []) {
  const file = claim.locations?.[0]?.file;
  if (!file || file in regionsByFile) continue;
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) continue;
  regionsByFile[file] = immutableRegions(fs.readFileSync(abs, "utf8"), sourceTexts);
}

const plan = planPropagation(
  { action: "RENAME", authorized: true, rename: { termId, from, to }, reason },
  index.claims,
  index.terms,
  regionsByFile,
);
fs.mkdirSync(out, { recursive: true });
const planFile = path.join(out, "propagation-plan.json");
const planRecord = {
  schemaVersion: 1,
  root,
  change: { action: "RENAME", termId, from, to, authorizedBy, reason },
  sourceSpansProtected: Boolean(sourceTexts),
  filesInspected: Object.keys(regionsByFile).sort(),
  mechanical: plan.mechanical,
  derived: plan.derived,
  warnings,
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(planFile, JSON.stringify(planRecord, null, 2) + "\n");
for (const w of warnings) console.error(`propagate: ${w}`);

if (!apply) {
  console.log(JSON.stringify({
    action: "planned", plan: planFile, mechanical: plan.mechanical.length, derived: plan.derived.length,
    sourceSpansProtected: Boolean(sourceTexts),
    next: plan.mechanical.length ? "Re-run with --apply to write the mechanical tier and file a receipt." : "Nothing mechanical to apply.",
  }, null, 2));
  process.exit(0);
}

const git = outputGitState(root);
if (git.available && !git.clean)
  die(3, `output tree has uncommitted changes (${git.changes.length}); commit or stash them first — an automatic edit must land on a committed state so its receipt is verifiable and reversible.`);

const receipt = applyMechanical(plan, root);
const receiptRecord = {
  schemaVersion: 1,
  root,
  change: planRecord.change,
  sourceSpansProtected: Boolean(sourceTexts),
  appliedAt: new Date().toISOString(),
  // Every `offset` is a JS string index into the file BEFORE this run's edits (the plan's
  // coordinates); with several edits in one file, later offsets shift by the earlier length deltas.
  offsetBasis: "before-text",
  applied: receipt.applied,
  skipped: receipt.skipped,
  heldForReview: plan.derived,
  summary: receipt.summary,
};
const files = [...new Set(receipt.applied.map((a) => a.file))];
let gitResult = null;
if (commit && git.available && files.length) {
  gitResult = commitOutput(root, `coursewerk: propagate rename ${termId}: ${from} -> ${to}`, { paths: files });
  receiptRecord.git = gitResult;
}
const receiptFile = path.join(out, "propagation-receipt.json");
fs.writeFileSync(receiptFile, JSON.stringify(receiptRecord, null, 2) + "\n");
console.log(JSON.stringify({
  action: "applied", receipt: receiptFile, applied: receipt.applied.length, skipped: receipt.skipped.length,
  heldForReview: plan.derived.length, files, ...(gitResult ? { git: gitResult } : {}),
  next: "Run the gate (npm run check): the revision layer records the rename; review the queue; then `npm run index:semantic` to accept the new baseline.",
}, null, 2));
