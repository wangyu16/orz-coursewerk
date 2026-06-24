#!/usr/bin/env node
// oer-qa — package-agnostic quality checks for an assembled OER guide/ folder.
// Promoted into the harness from the manuscript-ai-oer-pipeline artifact-quality
// evaluation (2026-06-24): the flaw classes it found that are AUTO-eliminable —
// unmanifested/under-attributed assets, broken local links/asset paths, orz-markdown
// syntax slips, and accessibility-proxy gaps — are caught here BEFORE delivery.
//
// Usage:
//   node check_oer.mjs --guide <path-to-guide-dir> [--report <out.md>] [--json <out.json>]
// Exits non-zero if any CRITICAL issue is found (unmanifested assets, broken links/paths,
// orz-syntax errors, missing alt text) so it can gate a pipeline step.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
function opt(name, def = null) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; }
const guide = path.resolve(opt('--guide', 'guide'));
const reportPath = opt('--report');
const jsonPath = opt('--json');
if (!fs.existsSync(guide)) { console.error(`oer-qa: guide dir not found: ${guide}`); process.exit(2); }

const deliverableDirs = ['concept-maps', 'chapters', 'slides', 'assessment', 'practice'].filter(
  (d) => fs.existsSync(path.join(guide, d)));
const listFiles = (root, suffix) => {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) out.push(...listFiles(full, suffix));
    else if (e.isFile() && full.endsWith(suffix)) out.push(full);
  }
  return out;
};
const mdFiles = listFiles(guide, '.md').sort();
const deliverableFiles = deliverableDirs.flatMap((d) => listFiles(path.join(guide, d), '.md')).sort();
const assetsDir = path.join(guide, 'assets');
const allAssets = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).sort() : [];
const mediaAssets = allAssets.filter((n) => !n.endsWith('.attrib.json'));
const rel = (f) => path.relative(guide, f).replaceAll(path.sep, '/');
const read = (f) => fs.readFileSync(f, 'utf8');
const pct = (n, d) => (d === 0 ? 0 : Number(((n / d) * 100).toFixed(2)));
const isExternal = (t) => /^(https?:|mailto:|tel:|#|javascript:)/i.test(t) || t.startsWith('<http');
function markdownLinks(text) {
  const links = []; const re = /(!?)\[([^\]]*)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g; let m;
  while ((m = re.exec(text))) {
    const target = m[3];
    const looksLink = /^(https?:|mailto:|tel:|#|\/|\.\.?\/)/i.test(target)
      || /\.(?:md|png|jpe?g|webp|svg|gif|pdf|html?|json|csv|tsv|txt)(?:[#?].*)?$/i.test(target)
      || target.includes('/');
    if (looksLink) links.push({ image: m[1] === '!', text: m[2], target });
  }
  return links;
}

// --- attribution completeness: every media asset must appear in ATTRIBUTION.md ---
function attributionAudit() {
  const file = path.join(guide, 'ATTRIBUTION.md');
  if (!fs.existsSync(file) || mediaAssets.length === 0) {
    return { present: fs.existsSync(file), mediaAssetsOnDisk: mediaAssets.length, unmanifestedMedia: [],
             rowsMissingLicense: 0, rowsMissingAttribution: 0, coveragePercent: 100 };
  }
  const text = read(file); const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('|') || /^\|\s*-+/.test(line) || /^\|\s*Asset\s*\|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    const fileCell = cells.findIndex((c) => /guide\/assets\/[^ |`]+/.test(c));
    if (fileCell === -1) continue;
    const files = [...cells[fileCell].matchAll(/guide\/assets\/([^ |`<>),]+)/g)].map((m) => m[1]);
    rows.push({
      files,
      hasLicense: cells.some((c) => /(CC BY|CC0|Public Domain|Self-generated|NASA|U\.S\. Gov)/i.test(c)),
      hasAttribution: cells.some((c) => /(OpenStax|Self-generated|original work|Wikimedia|Public Domain|Rice University|NASA|NOAA|Openverse|Commons)/i.test(c)),
    });
  }
  const referenced = new Set(rows.flatMap((r) => r.files));
  const unmanifestedMedia = mediaAssets.filter((n) => !referenced.has(n));
  return {
    present: true, mediaAssetsOnDisk: mediaAssets.length, attributionRows: rows.length,
    rowsMissingLicense: rows.filter((r) => !r.hasLicense).length,
    rowsMissingAttribution: rows.filter((r) => !r.hasAttribution).length,
    unmanifestedMedia,
    coveragePercent: pct(mediaAssets.length - unmanifestedMedia.length, mediaAssets.length),
  };
}

// --- accessibility proxies (markdown-native) ---
function accessibilityAudit() {
  let images = 0, missingAlt = 0, emptyHeadings = 0, jumps = 0, notH1 = 0, badLinks = 0;
  const badText = /^(click here|here|link|this link|read more|more|source|url)$/i;
  const offenders = [];
  for (const f of deliverableFiles) {
    const text = read(f); const links = markdownLinks(text);
    const imgs = links.filter((l) => l.image);
    const miss = imgs.filter((i) => i.text.trim() === '').length;
    const headings = []; let fileEmpty = 0;
    for (const line of text.split(/\r?\n/)) {
      const m = /^(#{1,6})(?:\s+(.*))?$/.exec(line);
      if (!m) continue; headings.push(m[1].length); if ((m[2] || '').trim() === '') fileEmpty += 1;
    }
    let fileJump = 0;
    for (let i = 1; i < headings.length; i += 1) if (headings[i] > headings[i - 1] + 1) fileJump += 1;
    const fileBad = links.filter((l) => !l.image && badText.test(l.text.trim())).length;
    const firstNotH1 = headings.length > 0 && headings[0] !== 1;
    images += imgs.length; missingAlt += miss; emptyHeadings += fileEmpty; jumps += fileJump;
    notH1 += firstNotH1 ? 1 : 0; badLinks += fileBad;
    if (miss || fileEmpty || fileJump || firstNotH1 || fileBad)
      offenders.push({ file: rel(f), missingAlt: miss, emptyHeadings: fileEmpty, headingJumps: fileJump, firstNotH1, nonDescriptiveLinks: fileBad });
  }
  return { denominatorFiles: deliverableFiles.length, markdownImages: images, markdownImagesMissingAlt: missingAlt,
           emptyHeadings, headingLevelJumps: jumps, filesFirstHeadingNotH1: notH1, nonDescriptiveLinks: badLinks, offenders };
}

// --- link / path / asset-existence integrity ---
function linkAudit() {
  let local = 0, broken = 0, ext = 0; const brokenList = []; const assetRefs = new Set();
  for (const f of mdFiles) {
    for (const l of markdownLinks(read(f))) {
      const raw = l.target.replace(/^<|>$/g, '');
      if (isExternal(raw)) { ext += 1; continue; }
      const clean = raw.split('#')[0].split('?')[0]; if (!clean) continue;
      local += 1;
      if (clean.includes('assets/')) assetRefs.add(path.basename(decodeURIComponent(clean)));
      if (!fs.existsSync(path.resolve(path.dirname(f), decodeURIComponent(clean)))) { broken += 1; brokenList.push({ file: rel(f), target: raw }); }
    }
  }
  const missingAssetRefs = [...assetRefs].filter((n) => !mediaAssets.includes(n));
  return { markdownFilesChecked: mdFiles.length, localReferences: local, brokenLocalReferences: broken,
           externalRefsIgnored: ext, distinctAssetRefs: assetRefs.size, missingAssetReferences: missingAssetRefs, broken: brokenList };
}

// --- orz / markdown syntax proxy (unclosed containers, unclosed plugins, escaped pipes) ---
function orzSyntaxAudit() {
  const plugins = ['span','sp','emoji','em','space','qrcode','qr','youtube','yt','mermaid','mm','smiles','sm','toc','attrs','markdown','md','md-include','yaml','yml','nyml'];
  const pluginOpenRe = new RegExp(`(?<!\\\\)\\{\\{\\s*(?:${plugins.join('|')})\\b`, 'gi');
  const issues = [];
  for (const f of deliverableFiles) {
    const text = read(f); const lines = text.split(/\r?\n/); const stack = [];
    lines.forEach((line, i) => {
      if (/^(:{3,})\s*$/.test(line)) { if (stack.length === 0) issues.push({ file: rel(f), line: i + 1, issue: 'container close without open' }); else stack.pop(); }
      else if (/^(:{3,})(?:\s+|\S)/.test(line)) stack.push(i + 1);
    });
    for (const ln of stack) issues.push({ file: rel(f), line: ln, issue: 'container open without close' });
    let m; while ((m = pluginOpenRe.exec(text))) if (text.indexOf('}}', m.index + 2) === -1)
      issues.push({ file: rel(f), line: text.slice(0, m.index).split(/\r?\n/).length, issue: 'orz plugin open without closing braces' });
    const escPipe = lines.filter((line) => line.includes('|') && line.includes('\\|')).length;
    if (escPipe) issues.push({ file: rel(f), line: null, issue: `${escPipe} table line(s) with escaped pipe` });
  }
  return { filesChecked: deliverableFiles.length, issueCount: issues.length, filesWithIssues: new Set(issues.map((i) => i.file)).size, issues };
}

// --- leftover body placeholders ---
function placeholdersAudit() {
  const hits = []; const re = /\[(?:VERIFY|NEEDS DATA)[^\]]*]/g;
  for (const f of deliverableFiles) { const text = read(f); let m; while ((m = re.exec(text))) hits.push({ file: rel(f), match: m[0] }); }
  return { placeholderCount: hits.length, filesWithPlaceholders: new Set(hits.map((h) => h.file)).size, hits };
}

const r = {
  guide,
  corpus: { markdownFiles: mdFiles.length, deliverableFiles: deliverableFiles.length, mediaAssets: mediaAssets.length, deliverableDirs },
  attribution: attributionAudit(),
  accessibility: accessibilityAudit(),
  links: linkAudit(),
  orzSyntax: orzSyntaxAudit(),
  placeholders: placeholdersAudit(),
};
// CRITICAL = release-blocking, auto-detectable
const critical = {
  unmanifestedAssets: r.attribution.unmanifestedMedia.length,
  rowsMissingLicenseOrAttribution: r.attribution.rowsMissingLicense + r.attribution.rowsMissingAttribution,
  brokenLocalLinks: r.links.brokenLocalReferences,
  missingAssetRefs: r.links.missingAssetReferences.length,
  orzSyntaxErrors: r.orzSyntax.issueCount,
  missingAltText: r.accessibility.markdownImagesMissingAlt,
  bodyPlaceholders: r.placeholders.placeholderCount,
};
r.criticalCounts = critical;
r.criticalTotal = Object.values(critical).reduce((a, b) => a + b, 0);

if (jsonPath) fs.writeFileSync(jsonPath, JSON.stringify(r, null, 2));
if (reportPath) {
  const L = [];
  L.push('# OER QA Report', '', `Guide: \`${rel(guide) || guide}\`  ·  ${r.corpus.deliverableFiles} deliverables · ${r.corpus.mediaAssets} assets`, '');
  L.push(`**Critical issues: ${r.criticalTotal}** (release-blocking, auto-detectable)`, '');
  L.push('| Check | Count |', '|---|---:|');
  for (const [k, v] of Object.entries(critical)) L.push(`| ${k} | ${v} |`);
  L.push('', '## Attribution', `- coverage ${r.attribution.coveragePercent}% · unmanifested: ${r.attribution.unmanifestedMedia.join(', ') || 'none'}`);
  L.push('## Accessibility', `- images ${r.accessibility.markdownImages}, missing alt ${r.accessibility.markdownImagesMissingAlt}, heading-jumps ${r.accessibility.headingLevelJumps}, non-descriptive links ${r.accessibility.nonDescriptiveLinks}`);
  L.push('## Links/paths', `- local refs ${r.links.localReferences}, broken ${r.links.brokenLocalReferences}, missing asset refs ${r.links.missingAssetReferences.length}`);
  L.push('## orz syntax', `- issues ${r.orzSyntax.issueCount} in ${r.orzSyntax.filesWithIssues} files`);
  for (const i of r.orzSyntax.issues.slice(0, 20)) L.push(`  - ${i.file}${i.line ? ':' + i.line : ''} — ${i.issue}`);
  fs.writeFileSync(reportPath, L.join('\n') + '\n');
}
console.log(JSON.stringify({ guide: r.guide, criticalTotal: r.criticalTotal, criticalCounts: critical }, null, 2));
process.exit(r.criticalTotal > 0 ? 1 : 0);
