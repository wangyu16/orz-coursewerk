#!/usr/bin/env node
// coursewerk-check — does this package UPLOAD to Alembic, and is it good OER?
//
// Two layers of checks over an assembled LEAN package (framework-free .md sources +
// alembic.json + LICENSE + assets):
//   A. CONTRACT — will Alembic ingest it with zero friction? Mirrors
//      validatePackageForImport / repoForPath / the manifest schema
//      (see scripts/lib/contract.mjs). These are release-blocking.
//   B. QUALITY — is it good, copyright-clean OER? attribution, links, orz-syntax,
//      the defined accessibility floor, placeholders, per-deliverable format contracts.
//
// Usage:
//   node check_oer.mjs --package <dir> [--report <out.md>] [--json <out.json>]
// Exits non-zero if any CRITICAL issue is found, so it can gate the pipeline.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  repoForPath,
  isCarrierPath,
  normalizeLicense,
  isOpenLicense,
  ALL_RIGHTS_RESERVED,
  chapterStudyGuidePath,
  SCHEMA_VERSION,
  SLUG_PATTERN,
  ROOT_FILE_ALLOWLIST,
  FOLDER_REPO,
} from "./lib/contract.mjs";
import { buildSourceIndex, scanText, VERBATIM } from "./lib/verbatim.mjs";
import { auditAssurance } from "./lib/assurance.mjs";
import { auditCoherence } from "./lib/coherence.mjs";
import { md as orzMarkdown } from "orz-markdown";

const args = process.argv.slice(2);
function opt(name, def = null) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
}
// accept --package (new) or --guide (legacy alias)
const pkg = path.resolve(opt("--package", opt("--guide", "package")));
const reportPath = opt("--report");
const jsonPath = opt("--json");
const inputsDir = opt("--inputs"); // source materials, for the near-verbatim scan
const forDiscovery = args.includes("--for-discovery"); // enforce the Discover bar (open license + verified)
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
    // Output roots are independent Git repositories. Repository bookkeeping is
    // revision evidence, not Alembic package content, and must never enter QA.
    if (e.name === ".git" || e.name === ".gitignore" || e.name === ".DS_Store") continue;
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
        "(CC-BY-4.0, CC-BY-SA-4.0, CC-BY-NC-4.0, CC-BY-NC-SA-4.0, CC0-1.0, ALL-RIGHTS-RESERVED).",
    );
  }
  if (!manifest.createdAt || !/Z$/.test(String(manifest.createdAt))) {
    errors.push('alembic.json: createdAt is required and must be ISO 8601 ending in "Z" (e.g. 2026-07-12T00:00:00Z).');
  }
  const chapters = Array.isArray(manifest.chapters) ? manifest.chapters : [];
  if (forDiscovery) {
    if (typeof manifest.description !== "string" || manifest.description.trim().length < 40) errors.push("alembic.json: discovery description must be at least 40 characters.");
    if (!Array.isArray(manifest.keywords) || manifest.keywords.filter((x) => typeof x === "string" && x.trim()).length < 3) errors.push("alembic.json: discovery requires at least three keywords.");
    if (typeof manifest.discipline !== "string" || !manifest.discipline.trim()) errors.push("alembic.json: discipline is required for discovery.");
    if (typeof manifest.unitTerm !== "string" || !manifest.unitTerm.trim()) errors.push("alembic.json: unitTerm is required for discovery.");
    if (!manifest.courseContext || typeof manifest.courseContext.courseName !== "string" || typeof manifest.courseContext.level !== "string") errors.push("alembic.json: courseContext.courseName and courseContext.level are required for discovery.");
    if (chapters.length === 0) errors.push("alembic.json: at least one chapter is required for discovery.");
  }
  const slugs = new Set();
  for (const ch of chapters) {
    if (!ch || typeof ch.slug !== "string" || !SLUG_PATTERN.test(ch.slug)) {
      errors.push(`alembic.json: chapter slug "${ch?.slug ?? ""}" is invalid (must be lowercase, hyphen-joined).`);
    }
    if (!ch || typeof ch.title !== "string" || !ch.title.trim()) {
      errors.push(`alembic.json: chapter "${ch?.slug ?? "?"}" is missing a title.`);
    }
    if (ch?.slug && slugs.has(ch.slug)) errors.push(`alembic.json: duplicate chapter slug "${ch.slug}".`);
    if (ch?.slug) slugs.add(ch.slug);
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
  const privateSignals = /\b(?:instructor[- ]only|confidential|unreleased exam|summative answer key|grading key|do not share with students)\b/i;
  for (const file of deliverableFiles) {
    if (rel(file).startsWith("practice/")) continue;
    if (privateSignals.test(read(file))) errors.push(`${rel(file)} contains instructor/private-content language but is in a public folder.`);
  }
  return { errors, warnings };
}

// ============================ B. QUALITY ============================

function attributionAudit() {
  const file = path.join(pkg, "metadata", "ATTRIBUTION.md");
  let provenance = { items: [] };
  try { provenance = JSON.parse(read(path.join(pkg, "metadata", "PROVENANCE.json"))); } catch { /* assurance reports it */ }
  const items = Array.isArray(provenance.items) ? provenance.items : [];
  const paths = new Set(items.map((item) => String(item.localPath || "").replaceAll("\\", "/").replace(/^assets\//, "")));
  const unmanifestedMedia = mediaAssets.filter((name) => !paths.has(name));
  const known = items.filter((item) => ["verified", "self-generated", "user-owned"].includes(item.provenanceStatus));
  return {
    present: fs.existsSync(file),
    mediaAssetsOnDisk: mediaAssets.length,
    attributionRows: items.filter((item) => item.publicationStatus === "cleared").length,
    rowsMissingLicense: known.filter((item) => item.provenanceStatus === "verified" && !item.license).length,
    rowsMissingAttribution: known.filter((item) => !item.attribution).length,
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
    badLinks = 0,
    missingDiagramAlternatives = 0;
  const badText = /^(click here|here|link|this link|read more|more|source|url)$/i;
  const offenders = [];
  for (const f of deliverableFiles) {
    const text = read(f);
    const links = markdownLinks(text);
    const imgs = links.filter((l) => l.image);
    const htmlImages = [...text.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
    const miss = imgs.filter((i) => i.text.trim() === "").length + htmlImages.filter((tag) => !/\balt=["'][^"']+["']/i.test(tag)).length;
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
    const missingVisualDescriptions = [];
    const visualPlugin = /\{\{\s*(mermaid|chart)\b[\s\S]*?\}\}/gi;
    let pluginMatch;
    while ((pluginMatch = visualPlugin.exec(text))) {
      const following = text.slice(pluginMatch.index + pluginMatch[0].length, pluginMatch.index + pluginMatch[0].length + 600)
        .split(/\n(?=#{1,6}\s|<!--\s*slide|\{\{\s*(?:mermaid|chart)\b)/i)[0];
      if (!/\*\*(?:Visual description|Data summary):\*\*\s+\S.{19,}/i.test(following))
        missingVisualDescriptions.push({ plugin: pluginMatch[1].toLowerCase(), line: text.slice(0, pluginMatch.index).split(/\r?\n/).length });
    }
    images += imgs.length + htmlImages.length;
    missingAlt += miss;
    emptyHeadings += fileEmpty;
    jumps += fileJump;
    notH1 += firstNotH1 ? 1 : 0;
    badLinks += fileBad;
    missingDiagramAlternatives += missingVisualDescriptions.length;
    if (miss || fileEmpty || fileJump || firstNotH1 || fileBad || missingVisualDescriptions.length)
      offenders.push({ file: rel(f), missingAlt: miss, emptyHeadings: fileEmpty, headingJumps: fileJump, firstNotH1, nonDescriptiveLinks: fileBad, missingDiagramAlternatives: missingVisualDescriptions });
  }
  return {
    denominatorFiles: deliverableFiles.length,
    markdownImages: images,
    markdownImagesMissingAlt: missingAlt,
    emptyHeadings,
    headingLevelJumps: jumps,
    filesFirstHeadingNotH1: notH1,
    nonDescriptiveLinks: badLinks,
    missingDiagramAlternatives,
    offenders,
  };
}

function linkAudit() {
  let local = 0,
    broken = 0,
    ext = 0;
  const brokenList = [];
  const remoteMedia = [];
  const assetRefs = new Set();
  for (const f of mdFiles) {
    for (const l of markdownLinks(read(f))) {
      const raw = l.target.replace(/^<|>$/g, "");
      if (isExternal(raw)) {
        ext += 1;
        if (l.image) remoteMedia.push({ file: rel(f), target: raw, kind: "markdown-image" });
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
    const text = read(f);
    const htmlMedia = /<(?:img|video|audio|source)\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
    let mediaMatch;
    while ((mediaMatch = htmlMedia.exec(text))) remoteMedia.push({ file: rel(f), target: mediaMatch[1], kind: "html-media" });
  }
  const missingAssetRefs = [...assetRefs].filter((n) => !mediaAssets.includes(decodeURIComponent(n)));
  return {
    markdownFilesChecked: mdFiles.length,
    localReferences: local,
    brokenLocalReferences: broken,
    externalRefsIgnored: ext,
    distinctAssetRefs: assetRefs.size,
    missingAssetReferences: missingAssetRefs,
    remoteMedia,
    broken: brokenList,
  };
}

function orzSyntaxAudit() {
  const issues = [];
  for (const f of deliverableFiles) {
    const text = read(f);
    const lines = text.split(/\r?\n/);
    // Track container fences WITH their colon count, so mis-nesting is caught:
    // a close must have at least as many colons as the open it closes, and the
    // convention is matching counts (outer fences MORE colons than inner). A
    // close shorter than its open (e.g. `:::` trying to close a `::::` tab) does
    // not actually close it in markdown-it — a real, silent rendering bug.
    const stack = []; // { count, line }
    lines.forEach((line, i) => {
      const close = /^(:{3,})\s*$/.exec(line); // a bare run of colons = a close
      if (close) {
        if (stack.length === 0) {
          issues.push({ file: rel(f), line: i + 1, issue: "container close without open" });
          return;
        }
        const n = close[1].length;
        const top = stack[stack.length - 1];
        if (n < top.count) {
          issues.push({
            file: rel(f),
            line: i + 1,
            issue: `container close (${n} colons) is shorter than its open (${top.count} colons, line ${top.line}) — it will not close the container; nest with MORE colons outside than inside (e.g. :::: tabs / ::: tab / ::: / ::::)`,
          });
        }
        stack.pop();
        return;
      }
      const open = /^(:{3,})(?:\s+\S|\S)/.exec(line); // colons + an info string = an open
      if (open) {
        const parent = stack[stack.length - 1];
        if (parent && open[1].length >= parent.count)
          issues.push({ file: rel(f), line: i + 1, issue: `nested container uses ${open[1].length} colons but must use fewer than outer container (${parent.count}, line ${parent.line})` });
        stack.push({ count: open[1].length, line: i + 1 });
      }
    });
    for (const s of stack) issues.push({ file: rel(f), line: s.line, issue: "container open without close" });
    let cursor = 0;
    while (cursor < text.length) {
      const open = text.indexOf("{{", cursor);
      if (open === -1) break;
      if (open > 0 && text[open - 1] === "\\") { cursor = open + 2; continue; }
      const close = text.indexOf("}}", open + 2);
      if (close === -1) {
        issues.push({ file: rel(f), line: text.slice(0, open).split(/\r?\n/).length, issue: "orz plugin open without closing braces" });
        break;
      }
      cursor = close + 2;
    }
    if (["study-guide", "practice"].includes(rel(f).split("/")[0])) {
      try { orzMarkdown.render(text); }
      catch (e) { issues.push({ file: rel(f), line: null, issue: `orz parser failed: ${e.message}` }); }
    }
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
    if ((t === "concepts" || t === "assessment-support") && /(?:\{\{|:{3,}\s+\S)/.test(text))
      fail.push({ file: name, issue: `${t} must be plain Markdown without plugins or semantic containers` });
    if (t === "concepts" && name === "concepts/course.md") {
      for (const required of ["summary", "keyword"]) if (!new RegExp(`^##+\\s+.*${required}`, "im").test(text)) fail.push({ file: name, issue: `course concept map is missing a ${required} section` });
    } else if (t === "concepts") {
      for (const required of ["source", "summary", "prerequisite", "objective"]) if (!new RegExp(required, "i").test(text)) fail.push({ file: name, issue: `chapter concept map is missing ${required} content` });
    }
    if (t === "study-guide") {
      if (!/learning objectives?/i.test(text)) fail.push({ file: name, issue: "study guide is missing learning objectives" });
      if (!/^##\s+/m.test(text)) fail.push({ file: name, issue: "study guide needs section-level H2 content" });
      if (!/:{3,}\s*tab/i.test(text)) fail.push({ file: name, issue: "study guide is missing a worked-example tab container" });
      if (!/synthesis|summary/i.test(text)) fail.push({ file: name, issue: "study guide is missing synthesis/summary" });
      if (!/!\[[^\]]+]\([^)]+\)|\{\{\s*(?:mermaid|chart|smiles)\b/i.test(text)) fail.push({ file: name, issue: "study guide has no instructional visual" });
    }
    // slides must be orz-slides deck grammar
    if (t === "slides") {
      if (!/<!--\s*slide\b/i.test(text)) fail.push({ file: name, issue: "slides source has no <!-- slide --> markers (orz-slides deck grammar)" });
      if (!/<!--\s*deck\b/i.test(text)) fail.push({ file: name, issue: "slides source has no <!-- deck ... --> frontmatter block" });
      if (!/^##\s+/m.test(text)) fail.push({ file: name, issue: "slides source has no ## content-slide titles" });
      if (!/template=title/i.test(text)) fail.push({ file: name, issue: "slides source is missing template=title" });
      if (!/template=outline/i.test(text)) fail.push({ file: name, issue: "slides source is missing template=outline" });
      if (!/template=closing/i.test(text)) fail.push({ file: name, issue: "slides source is missing template=closing" });
      if (!/objective/i.test(text)) fail.push({ file: name, issue: "slides source is missing objective coverage" });
    }
    if (t === "assessment-support") {
      for (const required of ["objective", "question guide", "rubric"]) if (!new RegExp(required, "i").test(text)) fail.push({ file: name, issue: `assessment support is missing ${required} content` });
    }
    if (t === "practice") {
      const questions = (text.match(/:{3,}\s*tab\s+Q\b/gi) || []).length;
      const answers = (text.match(/:{3,}\s*tab\s+Answer\b/gi) || []).length;
      if (questions < 10) fail.push({ file: name, issue: `practice sheet has ${questions} question tabs; at least 10 are required` });
      if (answers !== questions) fail.push({ file: name, issue: `practice question/answer tab counts differ (${questions}/${answers})` });
      if (!/objective/i.test(text)) fail.push({ file: name, issue: "practice sheet does not tag objective coverage" });
    }
  }
  const byChapter = new Map();
  for (const f of deliverableFiles) {
    const name = rel(f);
    const top = name.split("/")[0];
    const slug = path.posix.basename(name, ".md");
    if (slug === "course") continue;
    if (!byChapter.has(slug)) byChapter.set(slug, new Map());
    const ids = new Set([...read(f).matchAll(/\bObjective\s+([A-Za-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase().replace(/[.-]+$/, "")));
    byChapter.get(slug).set(top, ids);
  }
  for (const [slug, types] of byChapter) {
    const expected = types.get("concepts") || new Set();
    for (const top of ["study-guide", "slides", "assessment-support", "practice"]) {
      const actual = types.get(top) || new Set();
      for (const objective of expected) if (!actual.has(objective)) fail.push({ file: `${top}/${slug}.md`, issue: `missing chapter objective ${objective} declared by concepts/${slug}.md` });
    }
  }
  let provenance = { items: [] };
  let mediaPlan = null;
  try { provenance = JSON.parse(read(path.join(pkg, "metadata", "PROVENANCE.json"))); } catch { /* assurance owns malformed provenance */ }
  try { mediaPlan = JSON.parse(read(path.join(pkg, "metadata", "MEDIA_PLAN.json"))); } catch { /* handled below */ }
  for (const chapter of manifest.chapters || []) {
    const studyPath = `study-guide/${chapter.slug}.md`;
    const hasPhoto = (provenance.items || []).some((item) => item.mediaKind === "photo" && (item.usedIn || []).includes(studyPath));
    if (hasPhoto) continue;
    const decisions = mediaPlan?.chapters;
    const decision = Array.isArray(decisions)
      ? decisions.find((item) => item?.slug === chapter.slug)
      : decisions?.[chapter.slug];
    if (decision?.realImageDecision !== "not-used" || typeof decision?.rationale !== "string" || decision.rationale.trim().length < 40 || !decision.reviewedBy)
      fail.push({ file: "metadata/MEDIA_PLAN.json", issue: `chapter ${chapter.slug} has no real photograph; record a reviewed, substantive not-used rationale or include a rights-cleared photo` });
  }
  return { filesChecked: deliverableFiles.length, failures: fail, warnings: warn, failureCount: fail.length, warningCount: warn.length };
}

// near-verbatim scan of deliverable text against the source materials (inputs/)
function verbatimAudit(dir, foundation) {
  const empty = (reason, corpus = null) => ({ ran: false, reason, corpus, spans: [], filesFlagged: 0, totalSpans: 0 });
  if (!dir || !fs.existsSync(dir)) return empty(dir ? "inputs dir not found" : "no --inputs given", { ready: false, failures: ["source corpus directory is unavailable"] });
  const corpusFile = path.join(dir, "SOURCE_CORPUS.json");
  if (!fs.existsSync(corpusFile)) return empty("inputs/SOURCE_CORPUS.json is missing", { ready: false, failures: ["SOURCE_CORPUS.json is required"] });
  let corpusManifest;
  try { corpusManifest = JSON.parse(read(corpusFile)); }
  catch (e) { return empty("SOURCE_CORPUS.json is invalid", { ready: false, failures: [e.message] }); }
  const corpusFailures = [];
  if (corpusManifest.schemaVersion !== 1 || !Array.isArray(corpusManifest.sources)) corpusFailures.push("SOURCE_CORPUS.json requires schemaVersion 1 and a sources array");
  const primaryIds = (foundation?.sources || []).filter((s) => s.role === "primary").map((s) => s.id);
  const declaredSources = new Map((foundation?.sources || []).map((source) => [source.id, source]));
  const declaredSourceIds = new Set((foundation?.sources || []).map((s) => s.id).filter(Boolean));
  const entries = Array.isArray(corpusManifest.sources) ? corpusManifest.sources : [];
  const seenSourceIds = new Set();
  for (const entry of entries) {
    if (!entry?.sourceId) corpusFailures.push("every source-corpus entry requires sourceId");
    else if (seenSourceIds.has(entry.sourceId)) corpusFailures.push(`duplicate source-corpus entry for ${entry.sourceId}`);
    else if (!declaredSourceIds.has(entry.sourceId)) corpusFailures.push(`source-corpus entry ${entry.sourceId} is not declared in FOUNDATION.json`);
    seenSourceIds.add(entry?.sourceId);
  }
  const byId = new Map(entries.map((entry) => [entry.sourceId, entry]));
  const sourceTexts = [];
  const automaticSourceIds = [];
  const attestedSourceIds = [];
  const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
  for (const sourceId of primaryIds) {
    const entry = byId.get(sourceId);
    if (!entry) { corpusFailures.push(`primary source ${sourceId} has no source-corpus entry`); continue; }
    if (entry.comparisonMode === "human-attested") {
      if (!entry.attestedBy || !/^\d{4}-\d{2}-\d{2}$/.test(entry.attestedAt || "") || !entry.reason)
        corpusFailures.push(`${sourceId}: human-attested comparison requires attestedBy, attestedAt, and reason`);
      else attestedSourceIds.push(sourceId);
      continue;
    }
    if (entry.comparisonMode !== "automatic") { corpusFailures.push(`${sourceId}: comparisonMode must be automatic or human-attested`); continue; }
    const source = declaredSources.get(sourceId);
    const originalRel = String(entry.originalPath || "").replaceAll("\\", "/");
    if (!originalRel || path.isAbsolute(originalRel) || originalRel.split("/").includes("..") || /^readme\.md$/i.test(originalRel)) {
      corpusFailures.push(`${sourceId}: automatic comparison requires originalPath inside inputs`);
    } else {
      const originalFile = path.join(dir, originalRel);
      if (!fs.existsSync(originalFile)) corpusFailures.push(`${sourceId}: raw source snapshot does not exist: ${originalRel}`);
      else if (!/^[a-f0-9]{64}$/.test(String(entry.originalSha256 || "")) || sha256(fs.readFileSync(originalFile)) !== entry.originalSha256)
        corpusFailures.push(`${sourceId}: raw source snapshot sha256 mismatch`);
    }
    if (!entry.canonicalUrl || entry.canonicalUrl !== source?.canonicalUrl)
      corpusFailures.push(`${sourceId}: corpus canonicalUrl must match FOUNDATION.json`);
    if (!entry.retrievedAt || Number.isNaN(Date.parse(entry.retrievedAt))) corpusFailures.push(`${sourceId}: retrievedAt must be a valid date-time`);
    if (entry.extractor?.tool !== "coursewerk" || entry.extractor?.schemaVersion !== 1 || !entry.extractor?.sourceFormat)
      corpusFailures.push(`${sourceId}: extractor tool/schemaVersion/sourceFormat are required`);
    const relText = String(entry.textPath || "").replaceAll("\\", "/");
    if (!relText || path.isAbsolute(relText) || relText.split("/").includes("..") || /^readme\.md$/i.test(relText)) {
      corpusFailures.push(`${sourceId}: automatic comparison requires a non-scaffold textPath inside inputs`);
      continue;
    }
    const textFile = path.join(dir, relText);
    if (!fs.existsSync(textFile)) { corpusFailures.push(`${sourceId}: source text does not exist: ${relText}`); continue; }
    const text = read(textFile);
    const digest = sha256(fs.readFileSync(textFile));
    if (!/^[a-f0-9]{64}$/.test(String(entry.sha256 || "")) || digest !== entry.sha256) corpusFailures.push(`${sourceId}: source text sha256 mismatch`);
    const words = (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
    const minimumWords = Math.max(100, Number(entry.minimumWords) || 100);
    if (words < minimumWords) corpusFailures.push(`${sourceId}: source text has ${words} words; minimum is ${minimumWords}`);
    sourceTexts.push(text);
    automaticSourceIds.push(sourceId);
  }
  const corpusEvidence = entries.filter((entry) => primaryIds.includes(entry.sourceId)).map((entry) => ({ sourceId: entry.sourceId, comparisonMode: entry.comparisonMode, originalPath: entry.originalPath || null, originalSha256: entry.originalSha256 || null, canonicalUrl: entry.canonicalUrl || null, retrievedAt: entry.retrievedAt || null, extractor: entry.extractor || null, textPath: entry.textPath || null, sha256: entry.sha256 || null, attestedBy: entry.attestedBy || null, attestedAt: entry.attestedAt || null })).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  const corpus = { ready: corpusFailures.length === 0 && primaryIds.length > 0, failures: corpusFailures, primarySourceIds: primaryIds, automaticSourceIds, attestedSourceIds, evidence: corpusEvidence, corpusSha256: sha256(JSON.stringify(corpusEvidence)), manifest: "SOURCE_CORPUS.json" };
  if (!corpus.ready) return empty("source corpus is incomplete", corpus);
  if (sourceTexts.length === 0) return empty("all source comparisons are human-attested", corpus);
  const TEXT = /\.(md|markdown|txt|csv|json|html?|tex|rtf)$/i;
  if (!entries.every((entry) => entry.comparisonMode !== "automatic" || TEXT.test(entry.textPath || "")))
    return empty("automatic source text uses an unsupported format", { ...corpus, ready: false, failures: [...corpus.failures, "automatic textPath must be readable text"] });
  const index = buildSourceIndex(sourceTexts);
  const perFile = [];
  for (const f of deliverableFiles) {
    const spans = scanText(read(f), index);
    if (spans.length) perFile.push({ file: rel(f), spanCount: spans.length, longest: Math.max(...spans.map((s) => s.words)), samples: spans.slice(0, 3) });
  }
  return {
    ran: true,
    shingle: VERBATIM.SHINGLE,
    minSpanWords: VERBATIM.MIN_SPAN_WORDS,
    sourceFiles: sourceTexts.length,
    corpus,
    filesFlagged: perFile.length,
    totalSpans: perFile.reduce((a, b) => a + b.spanCount, 0),
    spans: perFile,
  };
}

// ============================ assemble ============================

const manifest = manifestAudit();
const layout = layoutAudit(manifest.chapters);
const assurance = auditAssurance({ root: pkg, manifest: manifest.manifest });
const verbatim = verbatimAudit(inputsDir, assurance.foundation);
const coherence = auditCoherence(pkg);
// During first-pass chapter authoring, the index may not exist yet. Once it
// exists, every edit is always enforced. Final/public QA (--for-discovery) also
// requires the index, so deletion can never bypass release assurance.
const coherenceCritical = !coherence.index && !forDiscovery ? [] : coherence.hardFailures;
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
  verbatim,
  assurance,
  coherence,
};

// discoverability — the bar to LIST on Discover: an OPEN license + verified-clean content.
// The assurance kernel separately determines whether this root is eligible to be a public package at all.
const license = normalizeLicense(manifest.manifest?.license);
const openLicense = isOpenLicense(license);
const attributionComplete = r.attribution.coveragePercent === 100 &&
  r.attribution.rowsMissingLicense === 0 && r.attribution.rowsMissingAttribution === 0;
const verbatimClean = !verbatim.ran || verbatim.totalSpans === 0;
const discoverBlockers = [];
if (!openLicense) discoverBlockers.push(`license is ${license === ALL_RIGHTS_RESERVED ? "ALL-RIGHTS-RESERVED (unlicensed)" : "not an open license"} — Discover needs an open license (CC-BY/-SA/-NC/-NC-SA or CC0)`);
if (!attributionComplete) discoverBlockers.push("asset attribution is incomplete (every figure needs a clean, credited source)");
if (forDiscovery && !verbatim.corpus?.ready) discoverBlockers.push(`source corpus is not release-ready: ${(verbatim.corpus?.failures || [verbatim.reason]).join("; ")}`);
if (verbatim.ran && verbatim.totalSpans > 0) discoverBlockers.push(`${verbatim.totalSpans} near-verbatim span(s) match the source — rewrite them in original prose`);
if (!assurance.canPack) discoverBlockers.push(`assurance kernel has ${assurance.hardFailures.length} unresolved hard failure(s)`);
if (coherence.hardFailures.length) discoverBlockers.push(`component coherence index has ${coherence.hardFailures.length} unresolved failure(s)`);
r.discoverability = {
  mode: forDiscovery ? "for-discovery (enforced)" : "advisory",
  license,
  openLicense,
  attributionComplete,
  verbatimScanRan: verbatim.ran,
  verbatimSpans: verbatim.totalSpans,
  blockers: discoverBlockers,
  ready: discoverBlockers.length === 0,
};

// CRITICAL = release-blocking, auto-detectable (contract first)
const critical = {
  manifestErrors: manifest.errors.length,
  layoutErrors: layout.errors.length,
  unmanifestedAssets: r.attribution.unmanifestedMedia.length,
  rowsMissingLicenseOrAttribution: r.attribution.rowsMissingLicense + r.attribution.rowsMissingAttribution,
  brokenLocalLinks: r.links.brokenLocalReferences,
  missingAssetRefs: r.links.missingAssetReferences.length,
  remoteMediaReferences: r.links.remoteMedia.length,
  orzSyntaxErrors: r.orzSyntax.issueCount,
  missingAltText: r.accessibility.markdownImagesMissingAlt,
  emptyHeadings: r.accessibility.emptyHeadings,
  headingLevelJumps: r.accessibility.headingLevelJumps,
  filesFirstHeadingNotH1: r.accessibility.filesFirstHeadingNotH1,
  nonDescriptiveLinks: r.accessibility.nonDescriptiveLinks,
  diagramTextAlternativesMissing: r.accessibility.missingDiagramAlternatives,
  bodyPlaceholders: r.placeholders.placeholderCount,
  formatContractFailures: r.formatContracts.failureCount,
  assuranceHardFailures: assurance.hardFailures.length,
  coherenceFailures: coherenceCritical.length,
  // near-verbatim text: advisory by default, release-blocking under --for-discovery
  ...(forDiscovery ? { additionalDiscoverBlockers: discoverBlockers.filter((b) => !b.startsWith("assurance kernel") && !b.startsWith("component coherence")).length } : {}),
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
  L.push("## Accessibility", `- images ${r.accessibility.markdownImages}, missing alt ${r.accessibility.markdownImagesMissingAlt}, diagram/chart text alternatives missing ${r.accessibility.missingDiagramAlternatives}, heading-jumps ${r.accessibility.headingLevelJumps}, non-descriptive links ${r.accessibility.nonDescriptiveLinks}`);
  L.push("## Links/paths", `- local refs ${r.links.localReferences}, broken ${r.links.brokenLocalReferences}, missing asset refs ${r.links.missingAssetReferences.length}, prohibited remote media ${r.links.remoteMedia.length}`);
  L.push("## orz syntax", `- issues ${r.orzSyntax.issueCount} in ${r.orzSyntax.filesWithIssues} files`);
  for (const i of r.orzSyntax.issues.slice(0, 20)) L.push(`  - ${i.file}${i.line ? ":" + i.line : ""} — ${i.issue}`);
  L.push("## Format contracts", `- failures ${r.formatContracts.failureCount} (release-blocking) · warnings ${r.formatContracts.warningCount}`);
  for (const i of r.formatContracts.failures.slice(0, 20)) L.push(`  - FAIL ${i.file} — ${i.issue}`);
  for (const i of r.formatContracts.warnings.slice(0, 15)) L.push(`  - warn ${i.file} — ${i.issue}`);
  L.push("## Assurance kernel (mode-independent)");
  L.push(`- usage profile: ${assurance.usageProfile || "missing"}`);
  L.push(`- hard failures: ${assurance.hardFailures.length} · future-publication blockers: ${assurance.publicationBlockers.length} · warnings: ${assurance.warnings.length}`);
  for (const i of assurance.hardFailures.slice(0, 30)) L.push(`  - FAIL ${i}`);
  for (const i of assurance.warnings.slice(0, 15)) L.push(`  - warn ${i}`);
  L.push("## Component coherence (mode-independent)");
  L.push(`- failures: ${coherence.hardFailures.length} · changed components: ${coherence.changed.length} · stale dependents: ${coherence.staleDependents.length}`);
  for (const i of coherence.hardFailures.slice(0, 40)) L.push(`  - FAIL ${i}`);
  L.push("## Near-verbatim vs source");
  L.push(`- source corpus: ${verbatim.corpus?.ready ? "ready" : "not ready"}; automatic: ${(verbatim.corpus?.automaticSourceIds || []).join(", ") || "none"}; human-attested: ${(verbatim.corpus?.attestedSourceIds || []).join(", ") || "none"}`);
  if (!verbatim.ran) L.push(`- not run (${verbatim.reason}). Pass \`--inputs <dir>\` to scan deliverables against the source materials.`);
  else {
    L.push(`- scanned against ${verbatim.sourceFiles} source file(s); flagged **${verbatim.totalSpans}** span(s) in ${verbatim.filesFlagged} file(s) (≥ ${verbatim.minSpanWords} consecutive shared words).`);
    for (const f of verbatim.spans.slice(0, 10)) {
      L.push(`  - ${f.file} — ${f.spanCount} span(s), longest ${f.longest} words`);
      for (const s of f.samples) L.push(`    · “${s.text}”`);
    }
  }
  L.push("## Discoverability (can this be listed on Discover?)");
  L.push(`- **${r.discoverability.ready ? "READY" : "NOT READY"}** — license \`${r.discoverability.license}\` (${r.discoverability.openLicense ? "open" : "not open"}), mode: ${r.discoverability.mode}.`);
  if (r.discoverability.blockers.length) for (const b of r.discoverability.blockers) L.push(`  - blocker: ${b}`);
  else L.push("  - open-licensed, attribution complete, no near-verbatim spans. An educator attestation is still required at listing time.");
  fs.writeFileSync(reportPath, L.join("\n") + "\n");
}
console.log(JSON.stringify({
  package: r.package,
  criticalTotal: r.criticalTotal,
  criticalCounts: critical,
  discoverability: { ready: r.discoverability.ready, license: r.discoverability.license, blockers: r.discoverability.blockers },
  assurance: { usageProfile: assurance.usageProfile, canPack: assurance.canPack, hardFailures: assurance.hardFailures.length, publicationBlockers: assurance.publicationBlockers.length },
  coherence: { ready: coherence.hardFailures.length === 0, failures: coherence.hardFailures.length, changed: coherence.changed.length, staleDependents: coherence.staleDependents.length },
}, null, 2));
process.exit(r.criticalTotal > 0 ? 1 : 0);
