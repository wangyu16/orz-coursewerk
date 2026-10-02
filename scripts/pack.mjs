#!/usr/bin/env node
// pack — produce the LEAN upload zip for Alembic (framework-free).
//
// Ships only what Alembic needs: alembic.json + LICENSE + the lean .md sources +
// assets + metadata/private. Explicitly EXCLUDES the heavy framework carriers
// (.md.html / .slides.html / .paged.html) — Alembic reassembles those on its side.
// The alembic.json is placed at the ZIP ROOT so Alembic ingests with zero friction.
//
// Usage: node pack.mjs --package <dir> --out <dir> [--inputs <source-text-dir>] [--contract newest|mirror]
//        v2: the newest Alembic contract (fetched from the Alembic repository) must accept the package (D37)
// A spine-v2 package packs exactly its latest publish decision (scripts/lib/core/pack_v2.mjs).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import crypto from "node:crypto";
import { isCarrierPath } from "./lib/contract.mjs";
import { verifyVisualReviewAgainstCarrierReceipt } from "./lib/visual_review.mjs";

const args = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const pkg = path.resolve(opt("--package", "package"));
const outDir = path.resolve(opt("--out", "dist"));
const inputsDir = path.resolve(opt("--inputs", path.join(path.dirname(pkg), "inputs")));
if (!fs.existsSync(path.join(pkg, "alembic.json"))) {
  console.error(`pack: no alembic.json at ${pkg} — is this an assembled package?`);
  process.exit(2);
}
if (!path.relative(pkg, outDir).startsWith("..")) {
  console.error("pack: --out must be outside the package root.");
  process.exit(2);
}

// A spine-v2 package is packed from the instructor's publish decision on the one gate (P8); the checks below are the
// v0.12 release path, kept for packages not yet migrated.
{
  let v2 = false;
  try { v2 = JSON.parse(fs.readFileSync(path.join(pkg, "metadata", "coursewerk.json"), "utf8")).spine === 2; } catch { v2 = false; }
  if (v2) {
    // the newest Alembic contract, run by Alembic's own validator (D37); "--contract mirror" checks only the local
    // mirror the gate already applies (offline use, and the tests)
    const ci = process.argv.indexOf("--contract"), mode = ci > 0 ? process.argv[ci + 1] : "newest";
    let contract = { checked: "mirror", commit: null, note: "checked only against the harness's local mirror of the contract, as asked" };
    if (mode !== "mirror") {
      const { checkNewestContract } = await import("./lib/alembic_contract.mjs");
      contract = checkNewestContract(pkg);
      if (contract.checked === "newest" && !contract.ok) {
        console.error(`pack: the newest Alembic contract (${contract.commit.slice(0, 7)}) refuses this package; no archive was created:`);
        for (const e of contract.errors) console.error(`  - ${e.path ? `${e.path}: ` : ""}${e.message}`);
        process.exit(2);
      }
      if (contract.note) console.error(`pack: ${contract.note}`);
    }
    const { packPublished } = await import("./lib/core/pack_v2.mjs");
    const r = packPublished(pkg, outDir);
    if (!r.ok) { console.error(`pack: ${r.error}`); process.exit(2); }
    console.log(JSON.stringify({ ...r, alembicContract: { checked: contract.checked, commit: contract.commit, warnings: (contract.warnings || []).map((w) => w.message), note: contract.note } }, null, 2));
    process.exit(0);
  }
}
const work = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-release-"));
const qaJson = path.join(work, "qa.json");
const carrierReceipt = path.join(work, "carriers.json");
const carrierPreview = path.join(work, "preview");

// Fail closed: packing is a release operation, so it may never bypass the
// Coursewerk contract, quality checks, or mode-independent assurance kernel.
const checkScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "check_oer.mjs");
// `--no-commit`: a RELEASE check must not write a commit into the package (L2, design audit) —
// the queue it emits is a report of this run, and a commit here made every receipt read
// acceptedGitHead ≠ currentGitHead.
const checkArgs = [checkScript, "--package", pkg, "--for-discovery", "--json", qaJson, "--no-commit", "--no-queue"];
if (fs.existsSync(inputsDir)) checkArgs.push("--inputs", inputsDir);
const check = spawnSync(process.execPath, checkArgs, { encoding: "utf8" });
if (check.status !== 0) {
  console.error("pack: release assurance failed; no archive was created.");
  console.error(check.stdout || check.stderr || "Run scripts/check_oer.mjs for details.");
  fs.rmSync(work, { recursive: true, force: true });
  process.exit(2);
}
const buildScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "build_carriers.mjs");
// M10 (round-3 audit): carriers attested under a theme must be rebuilt under the same theme, or the
// pack-side rebuild refuses a right package. The attestation carries the receipt's theme.
let attestedTheme = null;
try { attestedTheme = JSON.parse(fs.readFileSync(path.join(pkg, "metadata", "VISUAL_REVIEW.json"), "utf8")).theme || null; } catch { /* no attestation yet: the gate reports it */ }
// v0.12 only: the attestation is bound to carrier bytes, so the rebuild uses the frames it was made with (the
// harness's installed ones), not the newest (D36 applies to v2, which has no carrier attestation, D24).
const build = spawnSync(process.execPath, [buildScript, "--frames", "installed", "--package", pkg, "--out", carrierPreview, "--receipt", carrierReceipt, ...(attestedTheme ? ["--theme", attestedTheme] : [])], { encoding: "utf8" });
if (build.status !== 0) {
  console.error("pack: carrier build verification failed; no archive was created.");
  console.error(build.stdout || build.stderr);
  fs.rmSync(work, { recursive: true, force: true });
  process.exit(2);
}
const rebuiltCarriers = JSON.parse(fs.readFileSync(carrierReceipt, "utf8"));
const visualVerification = verifyVisualReviewAgainstCarrierReceipt(pkg, rebuiltCarriers);
if (!visualVerification.ready) {
  console.error("pack: rebuilt carriers do not match the human visual-review attestation; no archive was created.");
  console.error(visualVerification.failures.join("\n"));
  fs.rmSync(work, { recursive: true, force: true });
  process.exit(2);
}

function walk(root) {
  const out = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === ".gitignore" || e.name === ".DS_Store") continue;
    const full = path.join(root, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

// stage a lean copy, dropping carriers + junk
const staged = path.join(work, "staged");
fs.mkdirSync(staged, { recursive: true });
let files = 0;
let dropped = 0;
for (const f of walk(pkg)) {
  const relPath = path.relative(pkg, f).replaceAll(path.sep, "/");
  if (relPath.startsWith(".git/") || relPath === ".DS_Store" || relPath.endsWith("/.DS_Store")) continue;
  if (isCarrierPath(relPath)) {
    dropped += 1; // never ship the framework shell
    continue;
  }
  // The review queue is a report of the last gate run, not course content (L6).
  if (relPath === "metadata/REVIEW_QUEUE.json") { dropped += 1; continue; }
  const dest = path.join(staged, relPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(f, dest);
  // Fixed mtimes: two packs of identical content give identical archives (L1).
  fs.utimesSync(dest, new Date("2000-01-01T00:00:00Z"), new Date("2000-01-01T00:00:00Z"));
  files += 1;
}

fs.mkdirSync(outDir, { recursive: true });
const title = JSON.parse(fs.readFileSync(path.join(pkg, "alembic.json"), "utf8")).title || "course";
const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "course";
const zipPath = path.join(outDir, `${base}.alembic.zip`);
fs.rmSync(zipPath, { force: true });

// zip from inside the staged dir so alembic.json sits at the archive root
const res = spawnSync("zip", ["-r", "-q", "-X", "-D", zipPath, "."], { cwd: staged, encoding: "utf8" }); // -D: no directory entries (their mtimes broke reproducibility)
fs.rmSync(staged, { recursive: true, force: true });
if (res.status !== 0) {
  fs.rmSync(work, { recursive: true, force: true });
  console.error(`pack: zip failed:\n${res.stderr || res.stdout}`);
  process.exit(2);
}

const size = fs.statSync(zipPath).size;
const qa = JSON.parse(fs.readFileSync(qaJson, "utf8"));
// H4 (design audit): a primary source compared by human attestation is a SELF-REPORT — three strings,
// no evidence — and it used to switch both source scans off silently. Release now requires the
// operator to acknowledge it explicitly, and the evaluation names it.
const attestedPrimaries = qa.verbatim?.corpus?.attestedSourceIds || [];
if (attestedPrimaries.length && !process.argv.includes("--accept-attested-sources")) {
  console.error(`pack: primary source(s) ${attestedPrimaries.join(", ")} are compared by human attestation, not by the automatic scan. Re-run with --accept-attested-sources to release on that basis; the evaluation will say so.`);
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
  process.exit(2);
}
let overridesByBasisLine = "none recorded";
try {
  const ov = JSON.parse(fs.readFileSync(path.join(pkg, "metadata", "OVERRIDES.json"), "utf8"));
  const counts = {};
  for (const o of ov.overrides || []) counts[o.basis] = (counts[o.basis] || 0) + 1;
  overridesByBasisLine = Object.keys(counts).length ? Object.entries(counts).map(([b, n]) => `${b}: ${n}`).join(", ") : "none recorded";
} catch { /* no overrides */ }
const carriers = rebuiltCarriers;
const assuranceWarnings = qa.assurance?.warnings || [];
const persistedCarrierReceipt = path.join(outDir, `${base}.carriers.json`);
fs.copyFileSync(carrierReceipt, persistedCarrierReceipt);
const archiveSha256 = crypto.createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex");
const digestJson = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const packageTreeHash = digestJson((qa.coherence?.graph?.components || []).map((component) => [component.path, component.hash]));
const evaluationPath = path.join(outDir, `${base}.evaluation.md`);
const evaluation = [
  "# Coursewerk Release Evaluation",
  "",
  "## Measured vs declared (what the gate could NOT verify)",
  `- Source comparison: ${attestedPrimaries.length ? `HUMAN-ATTESTED for ${attestedPrimaries.join(", ")} (released with --accept-attested-sources)` : "automatic for every reused source"}${(() => { const scanned = new Set([...(qa.verbatim?.corpus?.automaticSourceIds || []), ...attestedPrimaries]); const un = (qa.assurance?.foundation?.sources || []).filter((s) => s.use !== "reference" && !scanned.has(s.id)).map((s) => s.id); return un.length ? `; NOT SCANNED: ${un.join(", ")}` : ""; })()}`,
  `- Objective coverage (CONTROL): ${qa.semantic?.coverage ? `${qa.semantic.coverage.objectives.covered}/${qa.semantic.coverage.objectives.total} objectives have a teaching claim carrying their vocabulary` : "semantic layer did not run"}${qa.semantic?.coverage?.chaptersUnchecked?.length ? `; CHECK UNDEFINED in chapter(s) ${qa.semantic.coverage.chaptersUnchecked.join(", ")} (no objective there has a teaching claim or a bracketed key term)` : ""}`,
  `- Key-fact critique: mode ${qa.keyFactReview?.review?.mode || "n/a"}, reviewer ${qa.keyFactReview?.review?.reviewer?.modelId || "n/a"} — its independence is declared by the reviewer and bound to the blind bundle digest; it is not observed`,
  `- Overrides by basis (authorized divergences from the source): ${overridesByBasisLine}`,
  `- Claims: ${qa.semantic?.claims ?? "n/a"} indexed, of which ${qa.semantic?.declaredClaims ?? "n/a"} declared with provenance and ${qa.semantic?.scanFoundClaims ?? "n/a"} found only by the deterministic scan (no spine or source provenance)`,
  "- Arithmetic inside answer keys is not verified; only cross-artifact agreement and physical range are",
  `- Coherence ledger action: ${qa.coherence?.acceptedState?.action || "n/a"}`,
  // M4 (round-3 audit): a rights receipt is a self-report (no secret, no signature). Say what it says.
  ...((qa.assurance?.foundation?.sources || []).map((s) => {
    const r = s.rightsBasis?.evidenceRetrieval || {};
    const cap = s.rightsBasis?.evidenceCapture || {};
    let origin = "";
    try { if (r.captureMode === "network" && new URL(r.requestedUrl).origin !== new URL(r.finalUrl).origin) origin = `; REDIRECTED ${new URL(r.requestedUrl).origin} → ${new URL(r.finalUrl).origin}`; } catch { /* n/a */ }
    return `- Rights evidence for ${s.id}: ${r.captureMode || "not captured"} capture by ${cap.operator?.type || "unknown"} operator${origin} — self-reported, not independently verified`;
  })),
  "",
  `- Package: ${title}`,
  `- Critical issues: ${qa.criticalTotal}`,
  `- Carrier builds: ${carriers.carriersBuilt}; failures: ${carriers.failed}`,
  `- Source corpus: ${qa.verbatim?.corpus?.ready ? "ready" : "not ready"}`,
  `- Accessibility findings: missing alt ${qa.accessibility.markdownImagesMissingAlt}, missing diagram/chart alternatives ${qa.accessibility.missingDiagramAlternatives}, heading jumps ${qa.accessibility.headingLevelJumps}, non-descriptive links ${qa.accessibility.nonDescriptiveLinks}`,
  `- Carrier portability: ${carriers.results.every((result) => result.portability.singleFile) ? "single-file" : "some carriers require local assets and/or network runtime enhancements"}`,
  `- Human browser/DOM carrier review: verified against ${qa.visualReview?.review?.reviewer?.name || "the recorded reviewer"}'s current hash-bound attestation.`,
  `- Source/publication warnings: ${assuranceWarnings.length}`,
  ...assuranceWarnings.map((warning) => `  - ${warning}`),
  `- Automated checks and the recorded visual attestation do not replace subject-matter, pedagogical, legal, or assistive-technology review.`,
  "",
].join("\n");
fs.writeFileSync(evaluationPath, evaluation);
const releaseReceipt = {
  schemaVersion: 2,
  packageTreeHash,
  acceptedGitHead: qa.coherence?.acceptedState?.acceptedHead || null,
  currentGitHead: qa.coherence?.git?.head || null,
  sourceCorpusHash: qa.verbatim?.corpus?.corpusSha256 || null,
  sourceCorpusManifestSha256: fs.existsSync(path.join(inputsDir, "SOURCE_CORPUS.json"))
    ? crypto.createHash("sha256").update(fs.readFileSync(path.join(inputsDir, "SOURCE_CORPUS.json"))).digest("hex")
    : null,
  sourceRecordSha256: fs.existsSync(path.join(pkg, "metadata", "SOURCE_RECORD.json"))
    ? crypto.createHash("sha256").update(fs.readFileSync(path.join(pkg, "metadata", "SOURCE_RECORD.json"))).digest("hex")
    : null,
  sourceCorpus: qa.verbatim?.corpus || null,
  componentIndexHash: qa.coherence?.index ? digestJson(qa.coherence.index) : null,
  keyFactReviewSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(pkg, "metadata", "KEY_FACT_REVIEW.json"))).digest("hex"),
  visualReviewSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(pkg, "metadata", "VISUAL_REVIEW.json"))).digest("hex"),
  carrierReceipt: path.basename(persistedCarrierReceipt),
  carrierReceiptHash: crypto.createHash("sha256").update(fs.readFileSync(persistedCarrierReceipt)).digest("hex"),
  carrierBuilds: carriers.results,
  runtimeVisualReviewRequired: carriers.runtimeVisualReviewRequired,
  criticalTotal: qa.criticalTotal,
  assuranceWarnings,
  attestedPrimarySources: attestedPrimaries,
  acceptedAttestedSources: attestedPrimaries.length > 0 && process.argv.includes("--accept-attested-sources"),
  objectiveCoverage: qa.semantic?.coverage?.objectives ?? null,
  chaptersWhereControlUnchecked: qa.semantic?.coverage?.chaptersUnchecked ?? null,
  archive: path.basename(zipPath),
  archiveSha256,
  evaluation: path.basename(evaluationPath),
  evaluationSha256: crypto.createHash("sha256").update(fs.readFileSync(evaluationPath)).digest("hex"),
  createdAt: new Date().toISOString(),
};
const receiptPath = path.join(outDir, `${base}.release.json`);
fs.writeFileSync(receiptPath, JSON.stringify(releaseReceipt, null, 2) + "\n");
fs.rmSync(work, { recursive: true, force: true });
console.log(JSON.stringify({ zip: zipPath, releaseReceipt: receiptPath, carrierReceipt: persistedCarrierReceipt, evaluation: evaluationPath, filesPacked: files, carriersDropped: dropped, bytes: size, archiveSha256, warnings: assuranceWarnings }, null, 2));
