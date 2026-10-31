#!/usr/bin/env node
// build_carriers — assemble the orz carriers ("clothes") for LOCAL reading/preview + QA.
//
// coursewerk authors the plain TEXT (the source of truth, orz text format 1) and SHIPS the text. While authoring you
// want to see the real editable carrier, so this assembles each text with the newest orz frames into a throwaway
// `preview/` tree (git-ignored, never uploaded; Alembic assembles carriers on its side). D52:
//
//   study-guide/*.md , practice/*.md  → *.md.html      (orz-mdhtml assemble)
//   slides/*.slides.md (or *.md)       → *.slides.html  (orz-slides assemble)
//   declared paged documents           → *.paged.html   (orz-paged assemble)
//
// Every carrier is CHECKED with the public library of the same frame that built it: extract(carrier).text must be
// the text, byte for byte, and the carrier's own lint may report no error. Either failure fails the build. There is no
// --theme: the look (title, theme, ratio, page settings) is the text's {{nyml}} header, never a build option.
//
// Usage: node build_carriers.mjs --root <dir> --out <dir> [--receipt <json>] [--require-single-file]
//        [--frames latest|installed]   latest (default): the newest orz frames, from the frame cache (D36);
//                                      COURSEWERK_FRAMES=installed (tests) uses the harness's own
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { LEAN_SOURCE } from "./lib/contract.mjs";
import { framesMode, loadFrameLib, resolveFrames } from "./lib/frames.mjs";

const args = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const pkg = path.resolve(opt("--root", opt("--package", "package")));
const outRoot = path.resolve(opt("--out", "preview"));
const receiptPath = opt("--receipt");
if (args.includes("--theme")) {
  console.error("build_carriers: --theme is gone (orz text format 1, D52): the theme is the text's own header (`theme:` in its {{nyml kind: document}} block).");
  process.exit(2);
}
const requireSingleFile = args.includes("--require-single-file");
if (!fs.existsSync(pkg)) {
  console.error(`build_carriers: package dir not found: ${pkg}`);
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
// the frames dress the lean files; the newest are used, and recorded in the receipt, never in the package (D36)
const framesUsed = resolveFrames(repoRoot, { mode: opt("--frames") || framesMode() });
const binDir = framesUsed.binDir;
if (framesUsed.note) console.error(`build_carriers: ${framesUsed.note}`);

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

// each frame's public library, from the same node_modules as its CLI: the frame that built a carrier checks it
const libs = {};
for (const builder of new Set(Object.values(LEAN_SOURCE).map((spec) => spec.builder))) {
  try { libs[builder] = await loadFrameLib(framesUsed.nodeModules, builder); }
  catch (e) { console.error(`build_carriers: ${builder} not installed in ${framesUsed.nodeModules} — run \`npm install\` first (${e.message}).`); process.exit(2); }
}

/** `<frame> assemble <text> -o <carrier> --json` (format-1 CLI, inline delivery). Returns { ok, error }. */
function runBuilder(builder, input, output) {
  const bin = path.join(binDir, builder);
  if (!fs.existsSync(bin)) {
    console.error(`build_carriers: ${builder} not installed — run \`npm install\` first.`);
    process.exit(2);
  }
  const res = spawnSync(process.execPath, [bin, "assemble", input, "-o", output, "--json"], { encoding: "utf8" });
  let report = null;
  try { report = JSON.parse(res.stdout); } catch { /* not JSON: report the raw output */ }
  if (res.status !== 0 || !report?.ok) {
    const error = `${builder} assemble refused ${path.relative(pkg, input)}: ${report?.error || (res.stderr || res.stdout || `exit ${res.status}`).trim()}`;
    console.error(`build_carriers: ${error}`);
    return { ok: false, error };
  }
  return { ok: true, error: null };
}

/** The round-trip law (FC-18): the carrier holds exactly the text; and the carrier's own lint finds no error. */
function checkCarrier(builder, text, html, relPath) {
  const lib = libs[builder];
  const problems = [];
  let extracted = null;
  try { extracted = lib.extract(html).text; } catch (e) { problems.push(`${builder} could not extract the text back: ${e.message}`); }
  const exact = extracted === text;
  if (extracted !== null && !exact) problems.push(`${relPath}: the carrier does not hold the text exactly (extract(assemble(text)).text differs from the text; mixed line endings or a refused character change it)`);
  let lint = [];
  try { lint = (lib.inspect(html, { filename: path.basename(relPath) }).lint || []).map(({ level, code, message, line }) => ({ level, code, message, ...(line ? { line } : {}) })); }
  catch (e) { problems.push(`${builder} could not inspect the carrier: ${e.message}`); }
  for (const l of lint.filter((x) => x.level === "error")) problems.push(`${relPath}${l.line ? `:${l.line}` : ""}: ${builder} lint error ${l.code}: ${l.message}`);
  return {
    roundTrip: { exact, textSha256: crypto.createHash("sha256").update(text).digest("hex"), extractedSha256: extracted === null ? null : crypto.createHash("sha256").update(extracted).digest("hex") },
    lint,
    problems,
  };
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
  // M5 (round-3 audit): an asset referenced by an HTML tag was not bound into the visual attestation,
  // so it could be swapped after the human looked. Every resource-loading attribute counts.
  const htmlTargets = [...text.matchAll(/<(?:img|video|audio|source|picture|embed|object|track)\b[^>]*?\b(?:src|srcset|poster|data)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
    .flatMap((m) => (m[1] ?? m[2] ?? m[3] ?? "").split(",").map((v) => v.trim().split(/\s+/)[0]).filter(Boolean));
  const localAssetDependencies = [...images.map((image) => image.target), ...htmlTargets].filter((target) => !/^(?:https?:|data:|#|\/\/)/i.test(target));
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
  const outPath = path.join(outRoot, relPath.replace(/(?:\.slides)?\.md$/, spec.carrier)); // slides/<slug>.slides.md → <slug>.slides.html
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const text = fs.readFileSync(src, "utf8");
  const assembled = runBuilder(spec.builder, src, outPath);
  let ok = assembled.ok;
  const errors = assembled.error ? [assembled.error] : [];
  let check = null;
  if (ok) {
    check = checkCarrier(spec.builder, text, fs.readFileSync(outPath, "utf8"), relPath);
    if (check.problems.length) { ok = false; errors.push(...check.problems); for (const p of check.problems) console.error(`build_carriers: ${p}`); }
  }
  const sourceInspection = inspectSource(text, relPath);
  let staticCarrierInspection = { shellImages: 0, shellImagesMissingAlt: 0, note: "Static shell only; runtime-rendered content requires visual/DOM review." };
  let portability = { frameworkInline: false, singleFile: false, mode: "build-failed", localAssetDependencies: sourceInspection.localAssetDependencies, remoteRuntimeDependencies: [], runtimeVisualReviewRequired: true };
  if (ok) {
    const html = fs.readFileSync(outPath, "utf8").replace(/<script\b[\s\S]*?<\/script>/gi, "");
    const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
    staticCarrierInspection = { shellImages: images.length, shellImagesMissingAlt: images.filter((tag) => !/\balt=["'][^"']+["']/i.test(tag)).length, note: "Static shell only; runtime-rendered content requires visual/DOM review." };
    portability = inspectCarrierPortability(fs.readFileSync(outPath, "utf8"), sourceInspection);
    if (sourceInspection.imagesMissingAlt || staticCarrierInspection.shellImagesMissingAlt) { ok = false; errors.push(`${relPath}: an image has no alt text`); }
    if (requireSingleFile && !portability.singleFile) { ok = false; errors.push(`${relPath}: not a single file (${portability.mode})`); }
  }
  if (ok) built += 1; else failed += 1;
  results.push({ source: relPath, carrier: path.relative(outRoot, outPath).replaceAll(path.sep, "/"), builder: spec.builder, frameVersion: libs[spec.builder].VERSION || null, status: ok ? "passed" : "failed", errors, roundTrip: check?.roundTrip || null, lint: check?.lint || [], sourceSha256: digest(src), outputSha256: fs.existsSync(outPath) ? digest(outPath) : null, reviewFingerprint: fs.existsSync(outPath) ? { algorithm: "sha256", normalization: "coursewerk-carrier-v1", value: reviewFingerprint(outPath) } : null, sourceInspection, staticCarrierInspection, portability });
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

const frameMap = (key) => Object.fromEntries(Object.entries(framesUsed.frames).map(([k, v]) => [k, v[key] ?? null]));
// theme: always null — the look is each text's header (kept for receipts and attestations made before D52)
const receipt = { schemaVersion: 2, root: pkg, preview: outRoot, theme: null, frames: { source: framesUsed.source, versions: frameMap("version"), newest: frameMap("newest"), harnessInstalled: frameMap("installed"), harnessBehind: framesUsed.harnessBehind, note: framesUsed.note }, requireSingleFile, carriersBuilt: built, failed, runtimeVisualReviewRequired: results.length > 0, results };
if (receiptPath) {
  const file = path.resolve(receiptPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + "\n");
}
console.log(JSON.stringify(receipt, null, 2));
process.exit(failed > 0 ? 1 : 0);
