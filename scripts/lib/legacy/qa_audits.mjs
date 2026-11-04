// The legacy QA audits (sections A and B of the v0.12 gate), moved out of check_oer.mjs verbatim in redesign P6 so
// that both the old gate and the new stable modules call the same code. Behaviour is unchanged: check_oer.mjs builds
// these with createQaAudits(pkg, { forDiscovery }) and uses them exactly as before; modules call them on a private,
// materialized copy of the package. Do not change behaviour here without changing it for both callers.
import { isAssetDescription } from "../core/asset_description.mjs";
import { withoutHeader } from "../core/printed.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { repoForPath, isCarrierPath, normalizeLicense, isOpenLicense, ALL_RIGHTS_RESERVED, chapterStudyGuidePath, SCHEMA_VERSION, SLUG_PATTERN, ROOT_FILE_ALLOWLIST, FOLDER_REPO, artifactDeclarationReport, claimSidecarPath, frontMatterLength } from "../contract.mjs";
import { buildSourceIndex, scanText, VERBATIM } from "../verbatim.mjs";
import { unverifiableQuotations } from "../immutable.mjs";
import { auditAssurance } from "../assurance.mjs";
import { auditCoherence, claimImpact } from "../coherence.mjs";
import { auditSourceRecord } from "../source_record.mjs";
import { auditKeyFactReview } from "../key_fact_review.mjs";
import { auditVisualReview } from "../visual_review.mjs";
import { artifactAnchors, matchClaims, anchorCoverage, positionalDeclarationsOnAnchoredItems, duplicateSections } from "../claims.mjs";
import { danglingSpineRefs } from "../spine.mjs";
import { buildQueue, REVIEW_QUEUE_PATH } from "../escalation.mjs";
import { scanConsistency, rangeAudit } from "../consistency.mjs";
import { computeSemanticIndex, loadSemanticIndex, auditIndexFreshness, spineRelabels, claimsDigest, CLAIMS_PATH } from "../semantic_index.mjs";
import { parseSections, labelMatcher } from "../terms.mjs";
import { spineCycles } from "../spine.mjs";
import { isAuthorizedDivergence, OVERRIDES_PATH } from "../overrides.mjs";
import { commitOutput, outputGitState } from "../output_git.mjs";
import { createRequire } from "node:module";
import { md as orzMarkdown } from "orz-markdown";
import { scanMarkers } from "orz-slides";
const { readHeader } = createRequire(import.meta.url)("orz-markdown/carrier");

export function createQaAudits(pkg, { forDiscovery = false } = {}) {
  const manifestRef = { current: null };
  const rel = (f) => path.relative(pkg, f).replaceAll(path.sep, "/");
  const read = (f) => fs.readFileSync(f, "utf8");
  const pct = (n, d) => (d === 0 ? 100 : Number(((n / d) * 100).toFixed(2)));

  const symlinksInPackage = [];
  function walk(root) {
    const out = [];
    if (!fs.existsSync(root)) return out;
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      // Output roots are independent Git repositories. Repository bookkeeping is
      // revision evidence, not Alembic package content, and must never enter QA.
      if (e.name === ".git" || e.name === ".gitignore" || e.name === ".DS_Store") continue;
      const full = path.join(root, e.name);
      // A symbolic link is not a package-owned file: its target can change or lie outside the
      // package, and every walker (bindings, bundle, index) would see a different thing (audit
      // finding 12). Refused as a layout error; never followed.
      if (e.isSymbolicLink()) { symlinksInPackage.push(full); continue; }
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
  // an asset's description (`<asset>.about.json`, family SITE-TYPE-CONTRACT draft 12: Alembic's title, alt text, subject,
  // topic …) travels with its asset and is no asset of its own (General Chemistry 2026-11-04)
  const mediaAssets = allAssets.filter((n) => !n.endsWith(".attrib.json") && !isAssetDescription(n));

  const isExternal = (t) => /^(https?:|mailto:|tel:|#|javascript:)/i.test(t) || t.startsWith("<http");
  function markdownLinks(text) {
    const links = [];
    // a target may hold balanced parentheses (CommonMark), as Wikimedia Commons file names often do
    const re = /(!?)\[([^\]]*)]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/g;
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
    for (const link of symlinksInPackage) errors.push(`${rel(link)}: symbolic links are not package files (not followed) — replace it with the file itself`);
    const warnings = [];
    // every file must resolve to a repo; carriers must not be shipped / must be public
    for (const f of allFiles) {
      const r = rel(f);
      if (r === "alembic.json" || r === "LICENSE") continue;
      // H3 (round-3 audit): a binary next to a study guide needed no provenance and shipped. Media
      // lives under assets/ with a PROVENANCE record, or it is not in the package.
      if (/^(?:study-guide|slides|practice|assessment-support|concepts)\//.test(r) && !/\.(?:md|json)$/i.test(r))
        errors.push(`${r}: only .md sources belong under a deliverable folder; media goes under assets/ with a PROVENANCE.json record`);
      // L5: a deliverable that is not valid UTF-8 ships U+FFFD to the student.
      if (/\.md$/i.test(r)) {
        try { new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(f)); }
        catch { errors.push(`${r}: not valid UTF-8 (a replacement character would render); re-encode the file`); }
      }
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
    const file = path.join(pkg, "provenance", "coursewerk", "ATTRIBUTION.md");
    let provenance = { items: [] };
    try { provenance = JSON.parse(read(path.join(pkg, "private", "coursewerk", "PROVENANCE.json"))); } catch { /* assurance reports it */ }
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
      // H2 (round-3 audit): only `![](https://…)` and `<img src="https://…">` were caught; nine other
      // forms shipped hot-linked media. Every attribute that loads a resource, in every media/embedding
      // tag, with any spacing or quoting; CSS url(); protocol-relative `//host`; and reference-style
      // images whose definition points off-package.
      const REMOTE = /^(?:https?:)?\/\//i;
      // Fenced code renders as text, not as a resource load (round-4 audit L): scan prose only.
      const prose = text.replace(/^[ \t]{0,3}(?:```|~~~)[\s\S]*?^[ \t]{0,3}(?:```|~~~)[ \t]*$/gm, " ");
      // Round-4 audit (atk6): SVG <image href>, <use href>, <link href>, <script src> and the orz
      // {{youtube …}} directive (rendered as an iframe) all load a remote resource.
      const attrMedia = /<(?:img|video|audio|source|picture|embed|iframe|object|track|image|use|link|script)\b[^>]*?\b(?:src|srcset|poster|data|href|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
      let mediaMatch;
      for (const d of prose.matchAll(/\{\{\s*(youtube|vimeo|embed|iframe|video)\b([^}]*)\}\}/gi)) remoteMedia.push({ file: rel(f), target: `{{${d[1]}${d[2].trim() ? " " + d[2].trim().split(/\s+/)[0] : ""}}}`, kind: "orz-directive" });
      for (const d of prose.matchAll(/\{\{[^}]*?((?:https?:)?\/\/[^\s}]+)[^}]*\}\}/gi)) remoteMedia.push({ file: rel(f), target: d[1], kind: "orz-directive" });
      for (const d of prose.matchAll(/!\[[^\]]*\]\((data:[^)\s]+)/g)) remoteMedia.push({ file: rel(f), target: d[1].slice(0, 40) + "…", kind: "data-uri (embedded media needs provenance under assets/)" });
      while ((mediaMatch = attrMedia.exec(prose))) {
        const value = mediaMatch[1] ?? mediaMatch[2] ?? mediaMatch[3] ?? "";
        for (const candidate of value.split(",").map((v) => v.trim().split(/\s+/)[0]).filter(Boolean))
          if (REMOTE.test(candidate)) remoteMedia.push({ file: rel(f), target: candidate, kind: "html-media" });
      }
      const cssUrl = /\burl\(\s*["']?((?:https?:)?\/\/[^"')\s]+)/gi;
      while ((mediaMatch = cssUrl.exec(prose))) remoteMedia.push({ file: rel(f), target: mediaMatch[1], kind: "css-url" });
      const refDefs = new Map();
      for (const d of prose.matchAll(/^[ \t]{0,3}\[([^\]]+)\]:[ \t]*<?((?:https?:)?\/\/[^\s>]+)>?/gim)) refDefs.set(d[1].toLowerCase(), d[2]);
      for (const use of text.matchAll(/!\[[^\]]*\]\[([^\]]*)\]/g)) {
        const target = refDefs.get(use[1].toLowerCase());
        if (target) remoteMedia.push({ file: rel(f), target, kind: "markdown-reference-image" });
      }
      for (const m2 of text.matchAll(/!\[[^\]]*\]\((\/\/[^)\s]+)/g)) remoteMedia.push({ file: rel(f), target: m2[1], kind: "markdown-image" });
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
      if ((t === "concepts" || t === "assessment-support") && /(?:\{\{|:{3,}\s+\S)/.test(withoutHeader(text)))
        fail.push({ file: name, issue: `${t} must be plain Markdown without plugins or semantic containers` });
      // THE SPINE'S SECTIONS — enforced against `format-contracts/deliverables.md` §Concept maps, which is
      // the single authority. [FIXED 2026-07-17: this check REQUIRED a `## Keywords` section while the
      // contract and PROCEDURE both forbid one in bold, so a CONTRACT-CONFORMANT PACKAGE COULD NOT PASS THE
      // GATE. The W2 fix reached the two documents and never reached the code that enforces them — the
      // contradiction simply moved from doc<->doc to doc<->gate, where it is harder to see. Found by the
      // usage tests, which are the only tests that run the documented workflow.]
      if (t === "concepts" && name === "concepts/course.md") {
        // `## Key terms` is OPTIONAL here (the contract says course-wide vocabulary is optional); the
        // node-bearing and ordering sections are not.
        for (const [label, re] of [
          ["Summary", /^##+\s+summary/im],
          ["Concept sequence", /^##+\s+concept sequence/im],
          ["Chapter sequence", /^##+\s+chapter sequence/im],
        ])
          if (!re.test(text)) fail.push({ file: name, issue: `course concept map is missing its \`## ${label}\` section (format-contracts/deliverables.md §Concept maps)` });
      } else if (t === "concepts") {
        // M5 (design audit): the gate accepted "## Objectives for this chapter" by prefix while the
        // parser keys the EXACT heading — so the spine minted zero objectives and the gate said
        // nothing. Same parser, same key; a near-miss is reported as what it is.
        const sections = parseSections(text);
        const keyOf = (label) => [...parseSections(`## ${label}\n`).keys()][0];
        for (const [label, re] of [
          ["Source and scope", /^##+\s+source/im],
          ["Summary", /^##+\s+summary/im],
          ["Prerequisites", /^##+\s+prerequisite/im],
          ["Objectives", /^##+\s+objectives/im],
          ["Concept sequence", /^##+\s+concept sequence/im],
          ["Key terms", /^##+\s+key terms/im],
          ["Misconceptions to surface", /^##+\s+misconceptions/im],
        ]) {
          if (sections.has(keyOf(label))) continue;
          if (re.test(text)) fail.push({ file: name, issue: `chapter concept map heading is a NEAR-MISS of \`## ${label}\` — the spine parser keys the exact heading, so this section mints nothing; title it exactly` });
          else fail.push({ file: name, issue: `chapter concept map is missing its \`## ${label}\` section (format-contracts/deliverables.md §Concept maps)` });
        }
      }
      // A `## Keywords` DUMP IS FORBIDDEN in either map. It is an authoring INPUT, not a stored section:
      // two vocabulary lists in one document are the same fact in two places, they drift, and nothing says
      // which is the authority. It also silently costs the instructor the ability to migrate terminology,
      // because aliases — which a bare dump has no room for — are what make a rename detectable at all.
      if (t === "concepts" && /^##+\s+keywords?\s*$/im.test(text))
        fail.push({ file: name, issue: "concept map has a `## Keywords` section: promote the keywords into `## Key terms` with aliases + gloss (format-contracts/deliverables.md §Concept maps)" });
      // H7 (design audit): a JSON front-matter block is rendered by orz-markdown as a rule + heading —
      // the declaration becomes visible student-facing text. The sidecar carrier is the shippable one.
      if (frontMatterLength(text) > 0)
        fail.push({ file: name, issue: "declarations in JSON front matter render in the carrier as visible text; move them to the sidecar private/coursewerk/claims/<folder>/<slug>.json" });
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
        // text format 1 (D52): the deck config is the format-1 header with `carrier: slides`; a `<!-- deck … -->`
        // block is no longer read (orz-slides 1.0 lint `deck-block`)
        if (readHeader(text)?.fields?.carrier?.trim() !== "slides") fail.push({ file: name, issue: "slides source does not open with the format-1 header carrying `carrier: slides` (`{{nyml` / `kind: document` / `carrier: slides` … `}}`; a 0.x deck: `orz-slides upgrade`)" });
        if (scanMarkers(text).some((m) => m.type === "deck")) fail.push({ file: name, issue: "slides source has a 0.x `<!-- deck … -->` block: in text format 1 it renders nothing and is not read — move its keys into the header (`orz-slides upgrade`)" });
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
        const questions = (text.match(/:{3,}\s*tab\s+(?:Q\s*\d+|Q|Question)\b/gi) || []).length; // "Q", "Q3", "Q 3", "Question" (courseguide-standards labels practice tabs "Q3")
        const answers = (text.match(/:{3,}\s*tab\s+Answer\b/gi) || []).length;
        if (questions < 10) fail.push({ file: name, issue: `practice sheet has ${questions} question tabs; at least 10 are required` });
        if (answers !== questions) fail.push({ file: name, issue: `practice question/answer tab counts differ (${questions}/${answers})` });
        if (!/objective/i.test(text)) fail.push({ file: name, issue: "practice sheet does not tag objective coverage" });
      }
    }
    // OBJECTIVE CONTAINMENT — the REVERSE half of the bidirectional CONTROL promise. `coverageAudit`
    // (spine -> package) already fail-closes the FORWARD half: an objective the instructor DECLARED that
    // nothing teaches. This block enforces the reverse containment: no deliverable may tag an objective
    // the instructor never declared. A study guide inventing `Objective 3` when the chapter map declares
    // only 1-2 is the artifact overriding intent — a CONTROL violation. [W17, 2026-08-11: this replaced a
    // check that was BOTH vacuous AND dead. The old authority parse scanned the concept map for a literal
    // `Objective <id>` token, but every conforming map writes objectives as a numbered list under
    // `## Objectives` (`1. State...`), which that token never matches — so `expected` was empty on every
    // fixture, the loop never iterated, and no test ever exercised it. Naively de-vacuating it to
    // re-check authority->deliverable per type injected 10 false positives on the two clean fixtures
    // (study-guide/slides carry a `## Learning objectives` SECTION with no per-objective ids by design;
    // mini's assessment-support tags a dotted `objective.<slug>.<n>`), because that direction duplicates
    // coverageAudit's forward half. The honest, non-redundant role is reverse containment, which is
    // zero-false-positive on both clean fixtures: every tagged id there IS declared.]
    //   The declared set = the numbered items of the chapter map's `## Objectives` section (its ordinals).
    //   The tagged set  = the deliverable's `Objective <n>` (numeric only — `\d` drops the stopword in
    //     "objective OF this chapter") plus the dotted `objective.<slug>.<n>` table form.
    const objectivesSection = (text) => {
      let capturing = false;
      const out = [];
      for (const line of text.split(/\r?\n/)) {
        if (/^##+\s/.test(line)) { if (capturing) break; capturing = /^##+\s+objectives\b/i.test(line); continue; }
        if (capturing) out.push(line);
      }
      return out.join("\n");
    };
    const byChapter = new Map();
    for (const f of deliverableFiles) {
      const name = rel(f);
      const top = name.split("/")[0];
      const slug = path.posix.basename(name, ".md");
      if (slug === "course") continue;
      if (!byChapter.has(slug)) byChapter.set(slug, new Map());
      byChapter.get(slug).set(top, read(f));
    }
    for (const [slug, types] of byChapter) {
      const conceptMap = types.get("concepts");
      if (conceptMap == null) continue; // no authority -> nothing to contain against
      const declared = new Set([...objectivesSection(conceptMap).matchAll(/^\s*(\d+)\.\s+\S/gm)].map((m) => m[1]));
      if (declared.size === 0) continue; // an unnumbered/absent objectives list is a separate contract failure above
      for (const top of ["study-guide", "slides", "assessment-support", "practice"]) {
        const text = types.get(top);
        if (text == null) continue;
        const tagged = new Set();
        for (const m of text.matchAll(/\bObjective\s+(\d[\w.-]*)(?![\w.-]*\s+of\s+the\b)/gi)) tagged.add(m[1].replace(/[.-]+$/, ""));
        for (const m of text.matchAll(/\bobjective\.(?:[\w-]+\.)*(\d+)\b/gi)) tagged.add(m[1]);
        for (const objective of tagged) if (!declared.has(objective)) fail.push({ file: `${top}/${slug}.md`, issue: `deliverable tags undeclared objective ${objective} (not in concepts/${slug}.md \`## Objectives\`)` });
      }
    }
    let provenance = { items: [] };
    let mediaPlan = null;
    try { provenance = JSON.parse(read(path.join(pkg, "private", "coursewerk", "PROVENANCE.json"))); } catch { /* assurance owns malformed provenance */ }
    try { mediaPlan = JSON.parse(read(path.join(pkg, "private", "coursewerk", "MEDIA_PLAN.json"))); } catch { /* handled below */ }
    for (const chapter of manifestRef.current?.chapters || []) {
      const studyPath = `study-guide/${chapter.slug}.md`;
      const hasPhoto = (provenance.items || []).some((item) => item.mediaKind === "photo" && (item.usedIn || []).includes(studyPath));
      if (hasPhoto) continue;
      const decisions = mediaPlan?.chapters;
      const decision = Array.isArray(decisions)
        ? decisions.find((item) => item?.slug === chapter.slug)
        : decisions?.[chapter.slug];
      if (decision?.realImageDecision !== "not-used" || typeof decision?.rationale !== "string" || decision.rationale.trim().length < 40 || !decision.reviewedBy)
        fail.push({ file: "private/coursewerk/MEDIA_PLAN.json", issue: `chapter ${chapter.slug} has no real photograph; record a reviewed, substantive not-used rationale or include a rights-cleared photo` });
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
    // D6 (round-3 verify): a source demoted to `supplemental` while still ADAPTED left both source
    // scans blind and the evaluation reading "automatic for every primary source". Every source whose
    // expression is reused (adaptation/excerpt) must be in the corpus — automatic or attested.
    const primaryIds = (foundation?.sources || []).filter((s) => s.role === "primary" || ["adaptation", "excerpt"].includes(s.use)).map((s) => s.id);
    const declaredSources = new Map((foundation?.sources || []).map((source) => [source.id, source]));
    const declaredSourceIds = new Set((foundation?.sources || []).map((s) => s.id).filter(Boolean));
    const entries = Array.isArray(corpusManifest.sources) ? corpusManifest.sources : [];
    const seenSourceIds = new Set();
    const seenTextHashes = new Map();
    const seenWikipediaPageIds = new Map();
    const seenWikipediaRevisionIds = new Map();
    for (const entry of entries) {
      if (!entry?.sourceId) corpusFailures.push("every source-corpus entry requires sourceId");
      else if (seenSourceIds.has(entry.sourceId)) corpusFailures.push(`duplicate source-corpus entry for ${entry.sourceId}`);
      else if (!declaredSourceIds.has(entry.sourceId)) corpusFailures.push(`source-corpus entry ${entry.sourceId} is not declared in FOUNDATION.json`);
      seenSourceIds.add(entry?.sourceId);
      if (entry?.comparisonMode === "automatic" && /^[a-f0-9]{64}$/.test(String(entry.sha256 || ""))) {
        const prior = seenTextHashes.get(entry.sha256);
        if (prior && prior !== entry.sourceId) corpusFailures.push(`${entry.sourceId}: source text duplicates ${prior}; redirects or duplicate sources must be removed`);
        else seenTextHashes.set(entry.sha256, entry.sourceId);
      }
      if (entry?.extractor?.tool === "wikipedia-action-api") {
        for (const [field, seen] of [["pageId", seenWikipediaPageIds], ["revisionId", seenWikipediaRevisionIds]]) {
          const value = entry.retrieval?.[field];
          if (!Number.isInteger(value)) corpusFailures.push(`${entry.sourceId}: Wikipedia retrieval requires integer ${field}`);
          else if (seen.has(value) && seen.get(value) !== entry.sourceId)
            corpusFailures.push(`${entry.sourceId}: Wikipedia ${field} duplicates ${seen.get(value)}; redirects or duplicate sources must be removed`);
          else seen.set(value, entry.sourceId);
        }
        if (!entry.retrieval?.title || !entry.retrieval?.resolvedUrl || !entry.retrieval?.permanentUrl ||
            Number.isNaN(Date.parse(entry.retrieval?.revisionTimestamp || "")))
          corpusFailures.push(`${entry.sourceId}: Wikipedia retrieval requires title, resolvedUrl, permanentUrl, and revisionTimestamp`);
      }
    }
    const sourceRecord = auditSourceRecord(pkg, corpusManifest);
    corpusFailures.push(...sourceRecord.failures);
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
        else if (entry.retrieval?.byteLength !== fs.statSync(originalFile).size)
          corpusFailures.push(`${sourceId}: retrieval byteLength does not match the raw source snapshot`);
      }
      if (!entry.canonicalUrl || entry.canonicalUrl !== source?.canonicalUrl)
        corpusFailures.push(`${sourceId}: corpus canonicalUrl must match FOUNDATION.json`);
      if (!entry.retrievedAt || Number.isNaN(Date.parse(entry.retrievedAt))) corpusFailures.push(`${sourceId}: retrievedAt must be a valid date-time`);
      if (!entry.retrieval || !["local-file", "network"].includes(entry.retrieval.captureMode) ||
          !entry.retrieval.retrievedAt || Number.isNaN(Date.parse(entry.retrieval.retrievedAt)) ||
          !Number.isInteger(entry.retrieval.byteLength) || entry.retrieval.byteLength < 1 ||
          !entry.retrieval.tool?.name || !entry.retrieval.tool?.version)
        corpusFailures.push(`${sourceId}: structured raw-snapshot retrieval metadata is required`);
      if (entry.retrieval?.captureMode === "local-file" && !entry.retrieval.localFileName)
        corpusFailures.push(`${sourceId}: local-file retrieval requires localFileName`);
      if (entry.retrieval?.captureMode === "network" &&
          (!entry.retrieval.requestedUrl || !entry.retrieval.finalUrl || !Number.isInteger(entry.retrieval.httpStatus) || !entry.retrieval.contentType))
        corpusFailures.push(`${sourceId}: network retrieval requires requested/final URL, HTTP status, and content type`);
      if (!new Set(["coursewerk", "wikipedia-action-api"]).has(entry.extractor?.tool) || !entry.extractor?.version || entry.extractor?.schemaVersion !== 1 || !entry.extractor?.sourceFormat)
        corpusFailures.push(`${sourceId}: a supported extractor tool plus version/schemaVersion/sourceFormat are required`);
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
      const words = (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length; // any script (H4)
      if (entry.wordCount !== words) corpusFailures.push(`${sourceId}: recorded wordCount does not match extracted source text`);
      const minimumWords = Math.max(100, Number(entry.minimumWords) || 100);
      if (words < minimumWords) corpusFailures.push(`${sourceId}: source text has ${words} words; minimum is ${minimumWords}`);
      sourceTexts.push(text);
      automaticSourceIds.push(sourceId);
    }
    const corpusEvidence = entries.filter((entry) => primaryIds.includes(entry.sourceId)).map((entry) => ({ sourceId: entry.sourceId, comparisonMode: entry.comparisonMode, originalPath: entry.originalPath || null, originalSha256: entry.originalSha256 || null, canonicalUrl: entry.canonicalUrl || null, retrievedAt: entry.retrievedAt || null, retrieval: entry.retrieval || null, extractor: entry.extractor || null, textPath: entry.textPath || null, sha256: entry.sha256 || null, attestedBy: entry.attestedBy || null, attestedAt: entry.attestedAt || null, reason: entry.reason || null })).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
    const corpus = { ready: corpusFailures.length === 0 && primaryIds.length > 0, failures: [...new Set(corpusFailures)], primarySourceIds: primaryIds, automaticSourceIds, attestedSourceIds, evidence: corpusEvidence, corpusSha256: sha256(JSON.stringify(corpusEvidence)), manifest: "SOURCE_CORPUS.json", publicRecord: "private/coursewerk/SOURCE_RECORD.json" };
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
      // The pinned AUTOMATIC source texts, exposed for the unverifiable-quotation check (TRUST 3c).
      // Not serialized into the JSON report (see the r.verbatim assignment, which drops it): whole
      // source corpora are large and already recorded by SHA in `corpus.evidence`. Carried in-process
      // only, so the quotation scan re-uses the exact texts the verbatim gate compared against — one
      // extraction, two consumers (§5d).
      sourceTexts,
      corpus,
      filesFlagged: perFile.length,
      totalSpans: perFile.reduce((a, b) => a + b.spanCount, 0),
      spans: perFile,
    };
  }

  function trackedManifestAudit() { const r = manifestAudit(); manifestRef.current = r; return r; }
  return { rel, read, pct, symlinksInPackage, walk, allFiles, allRel, mdFiles, DELIVERABLE_TOPS, deliverableFiles, assetsDir, allAssets, mediaAssets, isExternal, markdownLinks, layoutAudit, attributionAudit, accessibilityAudit, linkAudit, orzSyntaxAudit, placeholdersAudit, formatContractAudit, verbatimAudit, manifestAudit: trackedManifestAudit };
}
