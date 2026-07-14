#!/usr/bin/env node
// build_carriers — assemble the orz framework shells for LOCAL reading/preview + QA.
//
// coursewerk authors LEAN markdown (the source of truth) and SHIPS lean. But while
// authoring you want to see the real editable carrier — so this builds each lean
// source via the orz family, into a throwaway
// `preview/` tree (git-ignored, never uploaded; Alembic rebuilds carriers on its side).
//
//   study-guide/*.md , practice/*.md  → *.md.html      (orz-mdhtml)
//   slides/*.md                        → *.slides.html  (orz-slides)
//   paged/*.md                         → *.paged.html   (orz-paged)
//
// Usage: node build_carriers.mjs --root <dir> --out <dir> [--theme <name>] [--receipt <json>] [--require-single-file]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { LEAN_SOURCE } from "./lib/contract.mjs";

const args = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const pkg = path.resolve(opt("--root", opt("--package", "package")));
const outRoot = path.resolve(opt("--out", "preview"));
const receiptPath = opt("--receipt");
const theme = opt("--theme");
const requireSingleFile = args.includes("--require-single-file");
if (!fs.existsSync(pkg)) {
  console.error(`build_carriers: package dir not found: ${pkg}`);
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const binDir = path.join(repoRoot, "node_modules", ".bin");

// which builder handles which top-level folder
const BUILDER_FOR = {
  "study-guide": LEAN_SOURCE["study-guide"],
  practice: LEAN_SOURCE.practice,
  slides: LEAN_SOURCE.slides,
};

function assertSafeOutput() {
  const unsafe = [pkg, repoRoot, process.cwd(), path.parse(outRoot).root];
  if (unsafe.includes(outRoot) || !path.relative(pkg, outRoot).startsWith("..")) {
    console.error(`build_carriers: refusing unsafe output path: ${outRoot}`);
    process.exit(2);
  }
}
assertSafeOutput();

function walk(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

function runBuilder(builder, input, output) {
  const bin = path.join(binDir, builder);
  if (!fs.existsSync(bin)) {
    console.error(`build_carriers: ${builder} not installed — run \`npm install\` first.`);
    process.exit(2);
  }
  const cliArgs = [input, "-o", output, "--inline"];
  if (theme) cliArgs.push("--theme", theme);
  const res = spawnSync(process.execPath, [bin, ...cliArgs], { encoding: "utf8" });
  if (res.status !== 0) {
    console.error(`build_carriers: ${builder} failed on ${input}:\n${res.stderr || res.stdout}`);
    return false;
  }
  return true;
}

// clean the preview tree, then rebuild
fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(outRoot, { recursive: true });

let built = 0;
let failed = 0;
const results = [];
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function reviewFingerprint(file) {
  if (!fs.existsSync(file)) return null;
  // orz builders intentionally assign a fresh document UUID on every build.
  // Remove only that syntactic UUID class so a review can bind to stable carrier
  // content while the raw outputSha256 remains available in the build receipt.
  const normalized = fs.readFileSync(file, "utf8").replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<COURSEWERK-DOCUMENT-UUID>");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}
function inspectSource(text, sourceRel) {
  const images = [...text.matchAll(/!\[([^\]]*)]\(([^)\s]+)(?:\s+=[^)]+)?\)/g)].map((match) => ({ alt: match[1].trim(), target: match[2] }));
  const localAssetDependencies = images.map((image) => image.target).filter((target) => !/^(?:https?:|data:|#)/i.test(target));
  const localAssetDigests = [...new Set(localAssetDependencies)].map((reference) => {
    const file = path.resolve(pkg, path.posix.dirname(sourceRel), decodeURI(reference));
    const inside = path.relative(pkg, file);
    return {
      reference,
      path: inside.startsWith("..") || path.isAbsolute(inside) ? null : inside.replaceAll(path.sep, "/"),
      sha256: inside.startsWith("..") || path.isAbsolute(inside) || !fs.existsSync(file) ? null : digest(file),
    };
  }).sort((a, b) => a.reference.localeCompare(b.reference));
  const runtimeVisuals = [...text.matchAll(/\{\{\s*(mermaid|chart|smiles)\b/gi)].map((match) => match[1].toLowerCase());
  return {
    markdownImages: images.length,
    imagesMissingAlt: images.filter((image) => !image.alt).length,
    runtimeVisuals: runtimeVisuals.length,
    runtimeVisualKinds: [...new Set(runtimeVisuals)].sort(),
    localAssetDependencies: [...new Set(localAssetDependencies)].sort(),
    localAssetDigests,
  };
}

function inspectCarrierPortability(html, sourceInspection) {
  const urls = [...html.matchAll(/https?:\/\/[^\s"'<>\\]+/g)].map((match) => match[0].replace(/[),.;]+$/, ""));
  const remoteRuntimeDependencies = [...new Set(urls.filter((url) => /(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com)/i.test(url)))].sort();
  const localAssetDependencies = sourceInspection.localAssetDependencies;
  return {
    frameworkInline: true,
    singleFile: localAssetDependencies.length === 0 && remoteRuntimeDependencies.length === 0,
    mode: localAssetDependencies.length ? "carrier-plus-assets" : (remoteRuntimeDependencies.length ? "single-html-network-enhanced" : "single-file"),
    localAssetDependencies,
    remoteRuntimeDependencies,
    runtimeVisualReviewRequired: true,
  };
}

function buildOne(spec, src) {
  const relPath = path.relative(pkg, src).replaceAll(path.sep, "/");
  const outPath = path.join(outRoot, relPath.replace(/\.md$/, spec.carrier));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  let ok = runBuilder(spec.builder, src, outPath);
  const sourceInspection = inspectSource(fs.readFileSync(src, "utf8"), relPath);
  let staticCarrierInspection = { shellImages: 0, shellImagesMissingAlt: 0, note: "Static shell only; runtime-rendered content requires visual/DOM review." };
  let portability = { frameworkInline: false, singleFile: false, mode: "build-failed", localAssetDependencies: sourceInspection.localAssetDependencies, remoteRuntimeDependencies: [], runtimeVisualReviewRequired: true };
  if (ok) {
    const html = fs.readFileSync(outPath, "utf8").replace(/<script\b[\s\S]*?<\/script>/gi, "");
    const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
    staticCarrierInspection = { shellImages: images.length, shellImagesMissingAlt: images.filter((tag) => !/\balt=["'][^"']+["']/i.test(tag)).length, note: "Static shell only; runtime-rendered content requires visual/DOM review." };
    portability = inspectCarrierPortability(fs.readFileSync(outPath, "utf8"), sourceInspection);
    if (sourceInspection.imagesMissingAlt || staticCarrierInspection.shellImagesMissingAlt) ok = false;
    if (requireSingleFile && !portability.singleFile) ok = false;
  }
  if (ok) built += 1; else failed += 1;
  results.push({ source: relPath, carrier: path.relative(outRoot, outPath).replaceAll(path.sep, "/"), builder: spec.builder, status: ok ? "passed" : "failed", sourceSha256: digest(src), outputSha256: fs.existsSync(outPath) ? digest(outPath) : null, reviewFingerprint: fs.existsSync(outPath) ? { algorithm: "sha256", normalization: "coursewerk-carrier-v1", value: reviewFingerprint(outPath) } : null, sourceInspection, staticCarrierInspection, portability });
}
for (const [top, spec] of Object.entries(BUILDER_FOR)) {
  const srcDir = path.join(pkg, top);
  for (const src of walk(srcDir).filter((f) => f.endsWith(spec.ext))) {
    buildOne(spec, src);
  }
}

const documentsFile = path.join(pkg, "metadata", "DOCUMENTS.json");
if (fs.existsSync(documentsFile)) {
  let registry;
  try { registry = JSON.parse(fs.readFileSync(documentsFile, "utf8")); }
  catch (e) { console.error(`build_carriers: metadata/DOCUMENTS.json is invalid: ${e.message}`); process.exit(2); }
  for (const doc of registry.documents || []) {
    const rel = String(doc.source || "").replaceAll("\\", "/");
    if (!rel || path.isAbsolute(rel) || rel.split("/").includes("..")) { console.error(`build_carriers: invalid declared document source: ${rel}`); process.exit(2); }
    const src = path.join(pkg, rel);
    if (!fs.existsSync(src)) { console.error(`build_carriers: declared document source is missing: ${rel}`); process.exit(2); }
    const specs = { mdhtml: LEAN_SOURCE["study-guide"], slides: LEAN_SOURCE.slides, paged: LEAN_SOURCE.paged };
    const spec = specs[doc.carrier];
    if (!spec) { console.error(`build_carriers: unsupported carrier type for ${rel}: ${doc.carrier}`); process.exit(2); }
    buildOne(spec, src);
  }
}

// copy assets/ so relative figure links resolve in the preview carriers
const assetsSrc = path.join(pkg, "assets");
if (fs.existsSync(assetsSrc)) {
  fs.cpSync(assetsSrc, path.join(outRoot, "assets"), { recursive: true });
}

const receipt = { schemaVersion: 2, root: pkg, preview: outRoot, requireSingleFile, carriersBuilt: built, failed, runtimeVisualReviewRequired: results.length > 0, results };
if (receiptPath) {
  const file = path.resolve(receiptPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + "\n");
}
console.log(JSON.stringify(receipt, null, 2));
process.exit(failed > 0 ? 1 : 0);
