#!/usr/bin/env node
// Propagate an AUTHORIZED terminology rename across the package — M9's product caller.
//
// Everything upstream detects; this is the one documented command that ACTS on a teaching artifact,
// so it acts under the narrowest contract the design allows (spec §5 rule (b), §10 decision 2):
//   * only the MECHANICAL tier: one registered label -> another, resolved through the term registry,
//     in every deliverable — the claim blocks M2 indexed AND the prose around them (a half-renamed
//     package is worse than a refused one; audit finding 4) — never inside an immutable region
//     (quotations, citations, code fences, orz payloads, and — when `--inputs` pins the corpus —
//     spans reproduced from the source), and never inside a LONGER label of another term (finding 3);
//   * DRY RUN by default: the plan is written to reports/ (clock-free, hash-bound to the output HEAD)
//     and the package is untouched. `--apply` executes THE PLAN YOU READ: it refuses when the plan is
//     missing, was made against a different HEAD, or no longer matches a fresh computation (finding 6);
//   * `--apply` refuses a package without an output git, or with an uncommitted tree (findings 7, 5):
//     the receipt's "before" must be a committed state. It writes only the planned files, files the
//     receipt BEFORE committing (a commit failure can never strand edits without their receipt), then
//     commits only those files without touching anything else (finding 8);
//   * the concept maps are NOT rewritten: the spine is the instructor's. Rename the key term in the
//     map first (the registry records a RENAME), then propagate; the plan warns if the map still
//     names the old label as preferred.
//
// After `--apply`, run the gate: the revision layer sees what moved, the queue asks for what still
// needs judgment, and the accept step (`index:semantic`) re-baselines.
//
// Usage:
//   node scripts/propagate.mjs --root package --term term.melting-point --from "melting point" --to "fusion point"
//        [--inputs inputs] [--apply] [--plan reports/propagation-plan.json] [--authorized-by "<name>"]
//        [--reason "<why>"] [--out reports] [--no-commit]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { computeSemanticIndex } from "./lib/semantic_index.mjs";
import { immutableRegions, isImmutable } from "./lib/immutable.mjs";
import { planPropagation, applyMechanical, maskLongerLabels } from "./lib/propagate.mjs";
import { findLabelOccurrences, resolve as resolveTerm } from "./lib/terms.mjs";
import { commitOutput, outputGitState } from "./lib/output_git.mjs";

const DELIVERABLE_TOPS = ["study-guide", "slides", "assessment-support", "practice"];
const args = process.argv.slice(2);
const opt = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const has = (name) => args.includes(name);
const root = path.resolve(opt("--root", "package"));
const out = path.resolve(opt("--out", "reports"));
const planFile = path.resolve(opt("--plan", path.join(out, "propagation-plan.json")));
const termId = opt("--term");
const from = opt("--from");
const to = opt("--to");
const inputsDir = opt("--inputs");
const apply = has("--apply");
const commit = !has("--no-commit");
const authorizedBy = opt("--authorized-by", "");
const reason = opt("--reason", "");
const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");

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
const labelsOf = (t) => [t.preferredLabel, ...(t.aliases ?? []), ...(t.labels ?? [])].filter(Boolean).map((l) => String(l).toLowerCase());
const knownLabels = labelsOf(term);
const warnings = [];
if (!knownLabels.includes(String(from).toLowerCase()))
  warnings.push(`"${from}" is not a registered label of ${termId} (${knownLabels.join(", ")}); occurrences are matched literally.`);
if (!knownLabels.includes(String(to).toLowerCase()))
  warnings.push(`"${to}" is not a registered label of ${termId}: after the rename the registry will not recognise it, so every renamed claim loses its term. Add it to the concept map's key terms (as the preferred label or an alias) first.`);
if (String(term.preferredLabel ?? "").toLowerCase() === String(from).toLowerCase())
  warnings.push(`the concept map still names "${from}" as the preferred label of ${termId}; rename it in the map first so the registry records a RENAME, then propagate.`);

// Pinned source texts make source-reproduced spans immutable too. Optional, and LOUD when absent.
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
if (!sourceTexts) warnings.push(inputsDir
  ? `no automatic source texts found under ${inputsDir}; spans reproduced from the source are NOT protected in this run.`
  : "no --inputs given: spans reproduced from the source are NOT protected in this run (pass --inputs inputs).");

// Every deliverable file, with M8 regions over its ORIGINAL text (JS string indices, §5f).
const files = [];
for (const top of DELIVERABLE_TOPS) {
  const dir = path.join(root, top);
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir).sort()) if (name.endsWith(".md")) files.push(`${top}/${name}`);
}
const textOf = {};
const regionsByFile = {};
for (const f of files) {
  textOf[f] = fs.readFileSync(path.join(root, f), "utf8");
  regionsByFile[f] = immutableRegions(textOf[f], sourceTexts);
}

// Tier 1 — the claim blocks (the lib plans these, with its full refusal logic).
const plan = planPropagation(
  { action: "RENAME", authorized: true, rename: { termId, from, to }, reason },
  index.claims,
  index.terms,
  regionsByFile,
);
// Tier 2 — prose outside the claim blocks: every remaining whole-word occurrence, masked by longer
// labels of other terms, refused inside immutable regions (those are listed as `protected`).
const claimSpans = plan.mechanical.map((m) => ({ file: m.edit.file, start: m.edit.offset, end: m.edit.offset + m.edit.match.length }));
const heldIds = new Set(plan.derived.map((d) => d.claimId));
const claimsByFile = new Map();
for (const c of index.claims.claims ?? []) { const f = c.locations[0].file; if (!claimsByFile.has(f)) claimsByFile.set(f, []); claimsByFile.get(f).push(c); }
const prose = [];
const protectedOccurrences = [];
const caseLike = (surface, replacement) => (/^[A-Z]/.test(surface) && !/^[A-Z]/.test(replacement) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement);
for (const f of files) {
  const text = textOf[f];
  const occ = maskLongerLabels(text, findLabelOccurrences(text, from), from, termId, index.terms);
  for (const o of occ) {
    if (claimSpans.some((s) => s.file === f && o.start >= s.start && o.end <= s.end)) continue; // tier 1 owns it
    const host = (claimsByFile.get(f) ?? []).find((c) => o.start >= c.locations[0].offset && o.end <= c.locations[0].offset + String(c.text).length);
    if (host && heldIds.has(host.id)) continue; // a claim block the lib REFUSED (held for review) — never edited behind its back
    if (host && resolveTerm(index.terms, from, host.scope) !== termId) {
      // the lib skipped this DECLARED claim because it does not name the term, and in its scope the
      // label resolves elsewhere (a homograph) — not this term's occurrence; recorded, never guessed
      protectedOccurrences.push({ file: f, offset: o.start, surface: o.surface, reason: `inside claim ${host.id}, whose declaration does not name ${termId} and whose scope resolves "${from}" to another term` });
      continue;
    }
    if (isImmutable(regionsByFile[f], o.start)) { protectedOccurrences.push({ file: f, offset: o.start, surface: o.surface, reason: "inside an immutable region (quotation, citation, code, source-reproduced span)" }); continue; }
    // A HEADING is structure: its slug is every positional anchor under it, so renaming it re-mints
    // the claims beneath (the documented positional limitation). Named for the author, never done.
    const lineStart = text.lastIndexOf("\n", o.start - 1) + 1;
    if (/^[ \t]{0,3}#{1,6}[ \t]/.test(text.slice(lineStart, o.start))) { protectedOccurrences.push({ file: f, offset: o.start, surface: o.surface, reason: "inside a heading — renaming a heading moves every positional anchor under it; retitle it by hand and run the revision loop" }); continue; }
    prose.push({
      claimId: `prose:${f}:${o.start}`,
      edit: { kind: "prose-substitution", file: f, termId, from, to, offset: o.start, match: o.surface, replacement: caseLike(o.surface, to),
        occurrences: [{ start: 0, end: o.surface.length }], fileImmutableRegions: regionsByFile[f].map((r) => ({ start: r.start, end: r.end, kind: r.kind })) },
    });
  }
}
const mechanical = [...plan.mechanical, ...prose];
const git = outputGitState(root);
const planRecord = {
  schemaVersion: 2,
  root,
  outputHead: git.available ? git.head : null,
  change: { action: "RENAME", termId, from, to, authorizedBy, reason },
  sourceSpansProtected: Boolean(sourceTexts),
  filesInspected: files,
  mechanical,
  mechanicalSha256: sha256(JSON.stringify(mechanical)),
  heldForReview: plan.derived,
  protected: protectedOccurrences,
  skipped: [{ folder: "concepts", reason: "the concept maps are the instructor's spine; rename the key term there by hand" }],
  warnings,
};
for (const w of warnings) console.error(`propagate: ${w}`);

if (!apply) {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(planFile, JSON.stringify(planRecord, null, 2) + "\n");
  console.log(JSON.stringify({
    action: "planned", plan: planFile, outputHead: planRecord.outputHead, mechanical: mechanical.length, claimEdits: plan.mechanical.length, proseEdits: prose.length,
    heldForReview: plan.derived.length, protected: protectedOccurrences.length, sourceSpansProtected: Boolean(sourceTexts),
    next: mechanical.length ? "Read the plan; then re-run with --apply to execute exactly it." : "Nothing mechanical to apply.",
  }, null, 2));
  process.exit(0);
}

// ---- --apply: execute the plan the human read, on a committed state, with a receipt first ----
if (!git.available) die(3, "output root is not a Git repository (or git is unavailable); run `npm run init:output-git` first — an automatic edit must land on a committed state.");
if (!git.clean) die(3, `output tree has uncommitted changes (${git.changes.length}); commit or stash them first — an automatic edit must land on a committed state so its receipt is verifiable and reversible.`);
if (!fs.existsSync(planFile)) die(4, `no plan at ${planFile}; run the dry run first and read it.`);
let approved;
try { approved = JSON.parse(fs.readFileSync(planFile, "utf8")); } catch (e) { die(4, `plan is unreadable: ${e.message}`); }
if (approved.outputHead !== planRecord.outputHead) die(4, `plan was made against HEAD ${approved.outputHead}, the package is at ${planRecord.outputHead}; re-run the dry run.`);
if (approved.mechanicalSha256 !== planRecord.mechanicalSha256) die(4, "the package changed since the plan was made (the plan no longer matches a fresh computation); re-run the dry run and read it again.");

const receipt = applyMechanical({ mechanical }, root);
const changedFiles = [...new Set(receipt.applied.map((a) => a.file))];
const receiptRecord = {
  schemaVersion: 2,
  root,
  plan: planFile,
  planSha256: sha256(JSON.stringify(approved)),
  change: planRecord.change,
  sourceSpansProtected: Boolean(sourceTexts),
  appliedAt: new Date().toISOString(),
  // Every `offset` is a JS string index into the file BEFORE this run's edits (the plan's
  // coordinates); with several edits in one file, later offsets shift by the earlier length deltas.
  offsetBasis: "before-text",
  applied: receipt.applied,
  skipped: receipt.skipped,
  heldForReview: plan.derived,
  protected: protectedOccurrences,
  summary: receipt.summary,
};
fs.mkdirSync(out, { recursive: true });
const receiptFile = path.join(out, "propagation-receipt.json");
fs.writeFileSync(receiptFile, JSON.stringify(receiptRecord, null, 2) + "\n"); // BEFORE the commit (finding 5)
let gitResult = null;
if (commit && changedFiles.length) {
  try {
    gitResult = commitOutput(root, `coursewerk: propagate rename ${termId}: ${from} -> ${to}`, { paths: changedFiles, ensure: false });
    receiptRecord.git = gitResult;
  } catch (e) {
    receiptRecord.gitError = String(e.message || e);
    console.error(`propagate: edits applied and receipted, but the commit FAILED: ${receiptRecord.gitError} — the files are modified in the tree; commit them yourself or reverse them from the receipt.`);
  }
  fs.writeFileSync(receiptFile, JSON.stringify(receiptRecord, null, 2) + "\n");
}
console.log(JSON.stringify({
  action: "applied", receipt: receiptFile, applied: receipt.applied.length, skipped: receipt.skipped.length,
  heldForReview: plan.derived.length, protected: protectedOccurrences.length, files: changedFiles, ...(gitResult ? { git: gitResult } : {}), ...(receiptRecord.gitError ? { gitError: receiptRecord.gitError } : {}),
  next: "Run the gate (npm run check): the revision layer records the rename; review the queue; then `npm run index:semantic` to accept the new baseline.",
}, null, 2));
process.exit(receiptRecord.gitError ? 5 : 0);
