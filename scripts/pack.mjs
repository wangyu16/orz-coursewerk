#!/usr/bin/env node
// pack — produce the LEAN upload zip for Alembic (framework-free).
//
// Ships only what Alembic needs: alembic.json + LICENSE + the lean .md sources +
// assets + metadata/private. Explicitly EXCLUDES the heavy framework carriers
// (.md.html / .slides.html / .paged.html) — Alembic reassembles those on its side.
// The alembic.json is placed at the ZIP ROOT so Alembic ingests with zero friction.
//
// Usage: node pack.mjs --package <dir> --out <dir> [--inputs <source-text-dir>]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import crypto from "node:crypto";
import { isCarrierPath } from "./lib/contract.mjs";

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

const work = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-release-"));
const qaJson = path.join(work, "qa.json");
const carrierReceipt = path.join(work, "carriers.json");
const carrierPreview = path.join(work, "preview");

// Fail closed: packing is a release operation, so it may never bypass the
// Coursewerk contract, quality checks, or mode-independent assurance kernel.
const checkScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "check_oer.mjs");
const checkArgs = [checkScript, "--package", pkg, "--for-discovery", "--json", qaJson];
if (fs.existsSync(inputsDir)) checkArgs.push("--inputs", inputsDir);
const check = spawnSync(process.execPath, checkArgs, { encoding: "utf8" });
if (check.status !== 0) {
  console.error("pack: release assurance failed; no archive was created.");
  console.error(check.stdout || check.stderr || "Run scripts/check_oer.mjs for details.");
  fs.rmSync(work, { recursive: true, force: true });
  process.exit(2);
}
const buildScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "build_carriers.mjs");
const build = spawnSync(process.execPath, [buildScript, "--package", pkg, "--out", carrierPreview, "--receipt", carrierReceipt], { encoding: "utf8" });
if (build.status !== 0) {
  console.error("pack: carrier build verification failed; no archive was created.");
  console.error(build.stdout || build.stderr);
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
  const dest = path.join(staged, relPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(f, dest);
  files += 1;
}

fs.mkdirSync(outDir, { recursive: true });
const title = JSON.parse(fs.readFileSync(path.join(pkg, "alembic.json"), "utf8")).title || "course";
const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "course";
const zipPath = path.join(outDir, `${base}.alembic.zip`);
fs.rmSync(zipPath, { force: true });

// zip from inside the staged dir so alembic.json sits at the archive root
const res = spawnSync("zip", ["-r", "-q", zipPath, "."], { cwd: staged, encoding: "utf8" });
fs.rmSync(staged, { recursive: true, force: true });
if (res.status !== 0) {
  fs.rmSync(work, { recursive: true, force: true });
  console.error(`pack: zip failed:\n${res.stderr || res.stdout}`);
  process.exit(2);
}

const size = fs.statSync(zipPath).size;
const qa = JSON.parse(fs.readFileSync(qaJson, "utf8"));
const carriers = JSON.parse(fs.readFileSync(carrierReceipt, "utf8"));
const persistedCarrierReceipt = path.join(outDir, `${base}.carriers.json`);
fs.copyFileSync(carrierReceipt, persistedCarrierReceipt);
const archiveSha256 = crypto.createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex");
const digestJson = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const packageTreeHash = digestJson((qa.coherence?.graph?.components || []).map((component) => [component.path, component.hash]));
const evaluationPath = path.join(outDir, `${base}.evaluation.md`);
const evaluation = [
  "# Coursewerk Release Evaluation",
  "",
  `- Package: ${title}`,
  `- Critical issues: ${qa.criticalTotal}`,
  `- Carrier builds: ${carriers.carriersBuilt}; failures: ${carriers.failed}`,
  `- Source corpus: ${qa.verbatim?.corpus?.ready ? "ready" : "not ready"}`,
  `- Accessibility findings: missing alt ${qa.accessibility.markdownImagesMissingAlt}, missing diagram/chart alternatives ${qa.accessibility.missingDiagramAlternatives}, heading jumps ${qa.accessibility.headingLevelJumps}, non-descriptive links ${qa.accessibility.nonDescriptiveLinks}`,
  `- Carrier portability: ${carriers.results.every((result) => result.portability.singleFile) ? "single-file" : "some carriers require local assets and/or network runtime enhancements"}`,
  `- Runtime visual review: required and not proven by the static carrier build alone.`,
  `- Automated verification does not replace subject-matter, pedagogical, legal, or final visual review.`,
  "",
].join("\n");
fs.writeFileSync(evaluationPath, evaluation);
const releaseReceipt = {
  schemaVersion: 1,
  packageTreeHash,
  sourceCorpusHash: qa.verbatim?.corpus?.corpusSha256 || null,
  sourceCorpus: qa.verbatim?.corpus || null,
  componentIndexHash: qa.coherence?.index ? digestJson(qa.coherence.index) : null,
  carrierReceipt: path.basename(persistedCarrierReceipt),
  carrierReceiptHash: crypto.createHash("sha256").update(fs.readFileSync(persistedCarrierReceipt)).digest("hex"),
  carrierBuilds: carriers.results,
  runtimeVisualReviewRequired: carriers.runtimeVisualReviewRequired,
  criticalTotal: qa.criticalTotal,
  archive: path.basename(zipPath),
  archiveSha256,
  evaluation: path.basename(evaluationPath),
  evaluationSha256: crypto.createHash("sha256").update(fs.readFileSync(evaluationPath)).digest("hex"),
  createdAt: new Date().toISOString(),
};
const receiptPath = path.join(outDir, `${base}.release.json`);
fs.writeFileSync(receiptPath, JSON.stringify(releaseReceipt, null, 2) + "\n");
fs.rmSync(work, { recursive: true, force: true });
console.log(JSON.stringify({ zip: zipPath, releaseReceipt: receiptPath, carrierReceipt: persistedCarrierReceipt, evaluation: evaluationPath, filesPacked: files, carriersDropped: dropped, bytes: size, archiveSha256 }, null, 2));
