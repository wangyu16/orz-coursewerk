#!/usr/bin/env node
// coursewerk-check — does this package UPLOAD to Alembic, and is it good OER?
//
// Two layers of checks over an assembled LEAN package (framework-free .md sources +
// alembic.json + LICENSE + assets):
//   A. CONTRACT — will Alembic ingest it with zero friction? Mirrors
//      validatePackageForImport / repoForPath / the manifest schema
//      (see scripts/lib/contract.mjs). These are release-blocking.
//   B. QUALITY — is it good, copyright-clean OER? attribution, links, orz-syntax,
//      accessibility proxies, placeholders, per-deliverable format contracts.
//
// Usage:
//   node check_oer.mjs --package <dir> [--report <out.md>] [--json <out.json>]
// Exits non-zero if any CRITICAL issue is found, so it can gate the pipeline.
import fs from "node:fs";
import path from "node:path";
import {
  repoForPath,
  isCarrierPath,
  normalizeLicense,
  chapterStudyGuidePath,
  SCHEMA_VERSION,
  SLUG_PATTERN,
  ROOT_FILE_ALLOWLIST,
  FOLDER_REPO,
} from "./lib/contract.mjs";

const args = process.argv.slice(2);
function opt(name, def = null) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
}
// accept --package (new) or --guide (legacy alias)
const pkg = path.resolve(opt("--package", opt("--guide", "package")));
const reportPath = opt("--report");
const jsonPath = opt("--json");
if (!fs.existsSync(pkg)) {
  console.error(`coursewerk-check: package dir not found: ${pkg}`);
  process.exit(2);
}

const rel = (f) => path.relative(pkg, f).replaceAll(path.sep, "/");
const read = (f) => fs.readFileSync(f, "utf8");
const pct = (n, d) => (d === 0 ? 100 : Number(((n / d) * 100).toFixed(2)));

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

const allFiles = walk(pkg).sort();
const allRel = allFiles.map(rel);
const mdFiles = allFiles.filter((f) => f.endsWith(".md")).sort();
// deliverable text folders (public-facing content we quality-check)
const DELIVERABLE_TOPS = ["study-guide", "slides", "practice", "concepts", "assessment-support"];
const deliverableFiles = mdFiles
  .filter((f) => DELIVERABLE_TOPS.includes(rel(f).split("/")[0]))
  .sort();
const assetsDir = path.join(pkg, "assets");
const allAssets = walk(assetsDir).map((f) => path.relative(assetsDir, f).replaceAll(path.sep, "/"));
const mediaAssets = allAssets.filter((n) => !n.endsWith(".attrib.json"));

const isExternal = (t) => /^(https?:|mailto:|tel:|#|javascript:)/i.test(t) || t.startsWith("<http");
function markdownLinks(text) {
  const links = [];
  const re = /(!?)\[([^\]]*)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(text))) {
    const target = m[3];
    const looksLink =
      /^(https?:|mailto:|tel:|#|\/|\.\.?\/)/i.test(target) ||
      /\.(?:md|png|jpe?g|webp|svg|gif|pdf|html?|json|csv|tsv|txt)(?:[#?].*)?$/i.test(target) ||
      target.includes("/");
    if (looksLink) links.push({ image: m[1] === "!", text: m[2], target });
  }
  return links;
}

// ============================ A. CONTRACT ============================

function manifestAudit() {
  const errors = [];
  const file = path.join(pkg, "alembic.json");
  if (!fs.existsSync(file)) {
    errors.push("alembic.json is missing at the package root (required).");
    return { present: false, errors, manifest: null, chapters: [] };
  }
  if (!fs.existsSync(path.join(pkg, "LICENSE"))) {
    errors.push("LICENSE is missing at the package root (required).");
  }
  let manifest;
  try {
    manifest = JSON.parse(read(file));
  } catch (e) {
    errors.push(`alembic.json is not valid JSON: ${e.message}`);
    return { present: true, errors, manifest: null, chapters: [] };
  }
  // required fields
  if (manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2) {
    errors.push(`alembic.json: schemaVersion must be 1 or 2 (recommended: ${SCHEMA_VERSION}).`);
  }
  if (!manifest.packageId || typeof manifest.packageId !== "string") {
    errors.push("alembic.json: packageId is required (a placeholder is fine — Alembic re-stamps it).");
  }
  if (!manifest.title || typeof manifest.title !== "string") {
    errors.push("alembic.json: title is required.");
  }
  if (!normalizeLicense(manifest.license)) {
    errors.push(
      `alembic.json: license "${manifest.license ?? ""}" is not one of the accepted licenses ` +
        "(CC-BY-4.0, CC-BY-SA-4.0, CC-BY-NC-4.0, CC-BY-NC-SA-4.0, CC0-1.0).",
    );
  }
  if (!manifest.createdAt || !/Z$/.test(String(manifest.createdAt))) {
    errors.push('alembic.json: createdAt is required and must be ISO 8601 ending in "Z" (e.g. 2026-07-12T00:00:00Z).');
  }
  const chapters = Array.isArray(manifest.chapters) ? manifest.chapters : [];
  for (const ch of chapters) {
    if (!ch || typeof ch.slug !== "string" || !SLUG_PATTERN.test(ch.slug)) {
      errors.push(`alembic.json: chapter slug "${ch?.slug ?? ""}" is invalid (must be lowercase, hyphen-joined).`);
    }
    if (!ch || typeof ch.title !== "string" || !ch.title.trim()) {
      errors.push(`alembic.json: chapter "${ch?.slug ?? "?"}" is missing a title.`);
    }
  }
  return { present: true, errors, manifest, chapters };
}

function layoutAudit(chapters) {
  const errors = [];
  const warnings = [];
  // every file must resolve to a repo; carriers must not be shipped / must be public
  for (const f of allFiles) {
    const r = rel(f);
    if (r === "alembic.json" || r === "LICENSE") continue;
    const res = repoForPath(r);
    if (res.error) {
      errors.push(res.error + ".");
      continue;
    }
    if (isCarrierPath(r)) {
      // coursewerk ships LEAN — a framework carrier in the package means the pack step didn't strip it
      if (res.repo !== "public") {
        errors.push(`Renderable file "${r}" must live in a public folder, not the private side.`);
      }
      warnings.push(
        `Heads up: "${r}" is a self-contained framework file. coursewerk ships lean source — ` +
          "exclude carriers from the upload (Alembic rebuilds them). Keep them under preview/ instead.",
      );
    }
  }
  // declared chapters must have their study guide
  for (const ch of chapters) {
    if (!ch?.slug) continue;
    const need = chapterStudyGuidePath(ch.slug);
    if (!fs.existsSync(path.join(pkg, need))) {
      errors.push(`Chapter "${ch.title ?? ch.slug}" is declared but its study guide (${need}) is missing.`);
    }
  }
  // two-repo invariant sanity: anything under a private folder is fine; flag likely-private words in public
  return { errors, warnings };
}

// ============================ B. QUALITY ============================

function attributionAudit() {
  // attribution lives in metadata/ATTRIBUTION.md (root ATTRIBUTION.md would be rejected by the contract)
  const candidates = [
    path.join(pkg, "metadata", "ATTRIBUTION.md"),
    path.join(pkg, "provenance", "ATTRIBUTION.md"),
  ];
  const file = candidates.find((c) => fs.existsSync(c));
  if (!file || mediaAssets.length === 0) {
    return {
      present: Boolean(file),
      mediaAssetsOnDisk: mediaAssets.length,
      unmanifestedMedia: [],
      rowsMissingLicense: 0,
      rowsMissingAttribution: 0,
      coveragePercent: 100,
    };
  }
  const text = read(file);
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith("|") || /^\|\s*-+/.test(line) || /^\|\s*Asset\s*\|/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    const fileCell = cells.findIndex((c) => /assets\/[^ |`]+/.test(c));
    if (fileCell === -1) continue;
    const files = [...cells[fileCell].matchAll(/assets\/([^ |`<>),]+)/g)].map((m) => m[1]);
    rows.push({
      files,
      hasLicense: cells.some((c) => /(CC BY|CC0|Public Domain|Self-generated|NASA|U\.S\. Gov)/i.test(c)),
      hasAttribution: cells.some((c) =>
        /(OpenStax|Self-generated|original work|Wikimedia|Public Domain|Rice University|NASA|NOAA|Openverse|Commons)/i.test(c),
      ),
    });
  }
  const referenced = new Set(rows.flatMap((r) => r.files));
  const unmanifestedMedia = mediaAssets.filter((n) => !referenced.has(n));
  return {
    present: true,
    mediaAssetsOnDisk: mediaAssets.length,
    attributionRows: rows.length,
    rowsMissingLicense: rows.filter((r) => !r.hasLicense).length,
    rowsMissingAttribution: rows.filter((r) => !r.hasAttribution).length,
    unmanifestedMedia,
    coveragePercent: pct(mediaAssets.length - unmanifestedMedia.length, mediaAssets.length),
  };
}

function accessibilityAudit() {
  let images = 0,
    missingAlt = 0,
    emptyHeadings = 0,
    jumps = 0,
    notH1 = 0,
    badLinks = 0;
  const badText = /^(click here|here|link|this link|read more|more|source|url)$/i;
  const offenders = [];
  for (const f of deliverableFiles) {
    const text = read(f);
    const links = markdownLinks(text);
    const imgs = links.filter((l) => l.image);
    const miss = imgs.filter((i) => i.text.trim() === "").length;
    const headings = [];
    let fileEmpty = 0;
    for (const line of text.split(/\r?\n/)) {
      const m = /^(#{1,6})(?:\s+(.*))?$/.exec(line);
      if (!m) continue;
      headings.push(m[1].length);
      if ((m[2] || "").trim() === "") fileEmpty += 1;
    }
    let fileJump = 0;
    for (let i = 1; i < headings.length; i += 1) if (headings[i] > headings[i - 1] + 1) fileJump += 1;
    const fileBad = links.filter((l) => !l.image && badText.test(l.text.trim())).length;
    const firstNotH1 = headings.length > 0 && headings[0] !== 1;
    images += imgs.length;
    missingAlt += miss;
    emptyHeadings += fileEmpty;
    jumps += fileJump;
    notH1 += firstNotH1 ? 1 : 0;
    badLinks += fileBad;
    if (miss || fileEmpty || fileJump || firstNotH1 || fileBad)
      offenders.push({ file: rel(f), missingAlt: miss, emptyHeadings: fileEmpty, headingJumps: fileJump, firstNotH1, nonDescriptiveLinks: fileBad });
  }
  return {
    denominatorFiles: deliverableFiles.length,
    markdownImages: images,
    markdownImagesMissingAlt: missingAlt,
    emptyHeadings,
    headingLevelJumps: jumps,
    filesFirstHeadingNotH1: notH1,
    nonDescriptiveLinks: badLinks,
    offenders,
  };
}

function linkAudit() {
  let local = 0,
    broken = 0,
    ext = 0;
  const brokenList = [];
  const assetRefs = new Set();
  for (const f of mdFiles) {
    for (const l of markdownLinks(read(f))) {
      const raw = l.target.replace(/^<|>$/g, "");
      if (isExternal(raw)) {
        ext += 1;
        continue;
      }
      const clean = raw.split("#")[0].split("?")[0];
      if (!clean) continue;
      local += 1;
      if (clean.includes("assets/")) assetRefs.add(clean.slice(clean.indexOf("assets/") + "assets/".length));
      if (!fs.existsSync(path.resolve(path.dirname(f), decodeURIComponent(clean)))) {
        broken += 1;
        brokenList.push({ file: rel(f), target: raw });
      }
    }
  }
  const missingAssetRefs = [...assetRefs].filter((n) => !mediaAssets.includes(decodeURIComponent(n)));
  return {
    markdownFilesChecked: mdFiles.length,
    localReferences: local,
    brokenLocalReferences: broken,
    externalRefsIgnored: ext,
    distinctAssetRefs: assetRefs.size,
    missingAssetReferences: missingAssetRefs,
    broken: brokenList,
  };
}

function orzSyntaxAudit() {
  const plugins = ["span","sp","emoji","em","space","qrcode","qr","youtube","yt","mermaid","mm","smiles","sm","toc","attrs","markdown","md","md-include","yaml","yml","nyml"];
  const pluginOpenRe = new RegExp(`(?<!\\\\)\\{\\{\\s*(?:${plugins.join("|")})\\b`, "gi");
  const issues = [];
  for (const f of deliverableFiles) {
    const text = read(f);
    const lines = text.split(/\r?\n/);
    const stack = [];
    lines.forEach((line, i) => {
      if (/^(:{3,})\s*$/.test(line)) {
        if (stack.length === 0) issues.push({ file: rel(f), line: i + 1, issue: "container close without open" });
        else stack.pop();
      } else if (/^(:{3,})(?:\s+|\S)/.test(line)) stack.push(i + 1);
    });
    for (const ln of stack) issues.push({ file: rel(f), line: ln, issue: "container open without close" });
    let m;
    while ((m = pluginOpenRe.exec(text)))
      if (text.indexOf("}}", m.index + 2) === -1)
        issues.push({ file: rel(f), line: text.slice(0, m.index).split(/\r?\n/).length, issue: "orz plugin open without closing braces" });
    const escPipe = lines.filter((line) => line.includes("|") && line.includes("\\|")).length;
    if (escPipe) issues.push({ file: rel(f), line: null, issue: `${escPipe} table line(s) with escaped pipe` });
  }
  return { filesChecked: deliverableFiles.length, issueCount: issues.length, filesWithIssues: new Set(issues.map((i) => i.file)).size, issues };
}

function placeholdersAudit() {
  const hits = [];
  const re = /\[(?:VERIFY|NEEDS DATA)[^\]]*]/g;
  for (const f of deliverableFiles) {
    const text = read(f);
    let m;
    while ((m = re.exec(text))) hits.push({ file: rel(f), match: m[0] });
  }
  return { placeholderCount: hits.length, filesWithPlaceholders: new Set(hits.map((h) => h.file)).size, hits };
}

// per-deliverable format contracts (carries extra weight in Light mode)
function formatContractAudit() {
  const typeOf = (f) => rel(f).split("/")[0];
  const fail = [];
  const warn = [];
  for (const f of deliverableFiles) {
    const t = typeOf(f);
    const text = read(f);
    const name = rel(f);
    if (!/^#\s+/m.test(text)) fail.push({ file: name, issue: "missing H1 title" });
    // graphics-free deliverables
    if ((t === "concepts" || t === "assessment-support") && /!\[[^\]]*]\([^)]+\)/.test(text))
      fail.push({ file: name, issue: `${t} must be graphics-free but contains an image` });
    if ((t === "concepts" || t === "assessment-support") && /\{\{\s*(?:mermaid|mm|smiles|sm)\b/i.test(text))
      fail.push({ file: name, issue: `${t} must be graphics-free but contains a rich plugin` });
    // slides must be orz-slides deck grammar
    if (t === "slides") {
      if (!/<!--\s*slide\b/i.test(text)) fail.push({ file: name, issue: "slides source has no <!-- slide --> markers (orz-slides deck grammar)" });
      if (!/<!--\s*deck\b/i.test(text)) warn.push({ file: name, issue: "slides source has no <!-- deck ... --> frontmatter block" });
      if (!/^##\s+/m.test(text)) warn.push({ file: name, issue: "slides source has no ## content-slide titles" });
    }
    if (t === "study-guide" && !/!\[[^\]]+]\([^)]+\)/.test(text)) warn.push({ file: name, issue: "study guide has no figure/image" });
    if (t === "practice" && !/:{3,}\s*tab/i.test(text)) warn.push({ file: name, issue: "practice sheet has no container tabs (Q/A)" });
  }
  return { filesChecked: deliverableFiles.length, failures: fail, warnings: warn, failureCount: fail.length, warningCount: warn.length };
}

// ============================ assemble ============================

const manifest = manifestAudit();
const layout = layoutAudit(manifest.chapters);
const r = {
  package: pkg,
  corpus: {
    files: allFiles.length,
    markdownFiles: mdFiles.length,
    deliverableFiles: deliverableFiles.length,
    mediaAssets: mediaAssets.length,
    topFolders: [...new Set(allRel.map((p) => (p.includes("/") ? p.split("/")[0] : "(root)")))].sort(),
  },
  contract: {
    manifest: { present: manifest.present, errors: manifest.errors, chapters: manifest.chapters.length },
    layout,
  },
  attribution: attributionAudit(),
  accessibility: accessibilityAudit(),
  links: linkAudit(),
  orzSyntax: orzSyntaxAudit(),
  placeholders: placeholdersAudit(),
  formatContracts: formatContractAudit(),
};

// CRITICAL = release-blocking, auto-detectable (contract first)
const critical = {
  manifestErrors: manifest.errors.length,
  layoutErrors: layout.errors.length,
  unmanifestedAssets: r.attribution.unmanifestedMedia.length,
  rowsMissingLicenseOrAttribution: r.attribution.rowsMissingLicense + r.attribution.rowsMissingAttribution,
  brokenLocalLinks: r.links.brokenLocalReferences,
  missingAssetRefs: r.links.missingAssetReferences.length,
  orzSyntaxErrors: r.orzSyntax.issueCount,
  missingAltText: r.accessibility.markdownImagesMissingAlt,
  bodyPlaceholders: r.placeholders.placeholderCount,
  formatContractFailures: r.formatContracts.failureCount,
};
r.criticalCounts = critical;
r.criticalTotal = Object.values(critical).reduce((a, b) => a + b, 0);

if (jsonPath) fs.writeFileSync(jsonPath, JSON.stringify(r, null, 2));
if (reportPath) {
  const L = [];
  L.push("# Coursewerk QA Report", "", `Package: \`${rel(pkg) || pkg}\`  ·  ${r.corpus.deliverableFiles} deliverables · ${r.corpus.mediaAssets} assets`, "");
  L.push(`**Critical issues: ${r.criticalTotal}** (release-blocking, auto-detectable)`, "");
  L.push("| Check | Count |", "|---|---:|");
  for (const [k, v] of Object.entries(critical)) L.push(`| ${k} | ${v} |`);
  L.push("", "## Contract (will it upload to Alembic?)");
  L.push(`- manifest errors: ${manifest.errors.length}${manifest.errors.length ? "\n  - " + manifest.errors.join("\n  - ") : ""}`);
  L.push(`- layout errors: ${layout.errors.length}${layout.errors.length ? "\n  - " + layout.errors.join("\n  - ") : ""}`);
  if (layout.warnings.length) L.push(`- layout warnings:\n  - ${layout.warnings.join("\n  - ")}`);
  L.push("## Attribution", `- coverage ${r.attribution.coveragePercent}% · unmanifested: ${r.attribution.unmanifestedMedia.join(", ") || "none"}`);
  L.push("## Accessibility", `- images ${r.accessibility.markdownImages}, missing alt ${r.accessibility.markdownImagesMissingAlt}, heading-jumps ${r.accessibility.headingLevelJumps}, non-descriptive links ${r.accessibility.nonDescriptiveLinks}`);
  L.push("## Links/paths", `- local refs ${r.links.localReferences}, broken ${r.links.brokenLocalReferences}, missing asset refs ${r.links.missingAssetReferences.length}`);
  L.push("## orz syntax", `- issues ${r.orzSyntax.issueCount} in ${r.orzSyntax.filesWithIssues} files`);
  for (const i of r.orzSyntax.issues.slice(0, 20)) L.push(`  - ${i.file}${i.line ? ":" + i.line : ""} — ${i.issue}`);
  L.push("## Format contracts", `- failures ${r.formatContracts.failureCount} (release-blocking) · warnings ${r.formatContracts.warningCount}`);
  for (const i of r.formatContracts.failures.slice(0, 20)) L.push(`  - FAIL ${i.file} — ${i.issue}`);
  for (const i of r.formatContracts.warnings.slice(0, 15)) L.push(`  - warn ${i.file} — ${i.issue}`);
  fs.writeFileSync(reportPath, L.join("\n") + "\n");
}
console.log(JSON.stringify({ package: r.package, criticalTotal: r.criticalTotal, criticalCounts: critical }, null, 2));
process.exit(r.criticalTotal > 0 ? 1 : 0);
