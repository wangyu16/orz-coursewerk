#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditIngestionReadiness, sourcePolicyFor } from "./lib/pre_ingestion.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback = null) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const values = (name) => args.flatMap((value, index) => value === name && args[index + 1] ? [args[index + 1]] : []);
const root = path.resolve(opt("--root", "package"));
const inputs = path.resolve(opt("--inputs", "inputs"));
const contact = opt("--contact");
const requestedIds = values("--source-id");
const minTotalWords = Number(opt("--min-total-words", "6000"));
const maxTotalWords = Number(opt("--max-total-words", "25000"));
if (!contact) {
  console.error("prepare-wikipedia-topic: --contact is required for the Wikimedia API User-Agent");
  process.exit(2);
}

const foundationFile = path.join(root, "metadata", "FOUNDATION.json");
if (!fs.existsSync(foundationFile)) {
  console.error("prepare-wikipedia-topic: FOUNDATION.json is required");
  process.exit(2);
}
const foundation = JSON.parse(fs.readFileSync(foundationFile, "utf8"));
const candidates = (foundation.sources || []).filter((source) => sourcePolicyFor(source)?.id === "english-wikipedia-text");
const sources = requestedIds.length ? requestedIds.map((id) => candidates.find((source) => source.id === id)) : candidates;
if (!sources.length || sources.some((source) => !source)) {
  console.error("prepare-wikipedia-topic: declare at least one matching English Wikipedia source, and use only declared --source-id values");
  process.exit(2);
}

const ingestion = auditIngestionReadiness(root, foundation);
if (!ingestion.ready) {
  console.error(`prepare-wikipedia-topic: the declared source set is not cleared for ingestion: ${ingestion.failures.join("; ")}`);
  process.exit(3);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coursewerkVersion = fs.readFileSync(path.join(repoRoot, "VERSION"), "utf8").trim();
const userAgent = `Coursewerk/${coursewerkVersion} (${contact})`;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const manifestFile = path.join(inputs, "SOURCE_CORPUS.json");
let manifest = { schemaVersion: 1, sources: [] };
try { manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")); } catch { /* initialize */ }
manifest.schemaVersion = 1;
manifest.sources = Array.isArray(manifest.sources) ? manifest.sources : [];
const prepared = [];

for (const source of sources) {
  const pageUrl = new URL(source.canonicalUrl);
  const title = decodeURIComponent(pageUrl.pathname.replace(/^\/wiki\//, "")).replaceAll("_", " ");
  if (!title || pageUrl.hostname !== "en.wikipedia.org") {
    console.error(`prepare-wikipedia-topic: invalid English Wikipedia canonicalUrl for ${source.id}`);
    process.exit(2);
  }
  const endpoint = new URL("https://en.wikipedia.org/w/api.php");
  endpoint.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "extracts|revisions",
    explaintext: "1",
    rvprop: "ids|timestamp",
    redirects: "1",
    titles: title,
    maxlag: "5",
  });
  const retrievedAt = new Date().toISOString();
  const response = await fetch(endpoint, { headers: { "User-Agent": userAgent } });
  if (!response.ok) {
    console.error(`prepare-wikipedia-topic: ${source.id} API request failed with HTTP ${response.status}`);
    process.exit(2);
  }
  const rawBytes = Buffer.from(await response.arrayBuffer());
  let payload;
  try { payload = JSON.parse(rawBytes.toString("utf8")); }
  catch { console.error(`prepare-wikipedia-topic: ${source.id} API response is not JSON`); process.exit(2); }
  const page = payload.query?.pages?.[0];
  const text = String(page?.extract || "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  const wordCount = (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
  if (page?.missing || wordCount < 300) {
    console.error(`prepare-wikipedia-topic: ${source.id} returned a missing or too-short article (${wordCount} words)`);
    process.exit(2);
  }
  const rawRel = `.coursewerk-source-original/${source.id}.wikipedia.json`;
  const textRel = `.coursewerk-source-text/${source.id}.txt`;
  fs.mkdirSync(path.join(inputs, ".coursewerk-source-original"), { recursive: true });
  fs.mkdirSync(path.join(inputs, ".coursewerk-source-text"), { recursive: true });
  fs.writeFileSync(path.join(inputs, rawRel), rawBytes);
  fs.writeFileSync(path.join(inputs, textRel), text);
  const revision = page.revisions?.[0] || {};
  const entry = {
    sourceId: source.id,
    comparisonMode: "automatic",
    originalFile: `${source.id}.wikipedia.json`,
    originalPath: rawRel,
    originalSha256: sha256(rawBytes),
    canonicalUrl: source.canonicalUrl,
    retrievedAt,
    retrieval: {
      apiEndpoint: endpoint.origin + endpoint.pathname,
      finalUrl: response.url,
      httpStatus: response.status,
      contentType: response.headers.get("content-type") || "application/json",
      pageId: page.pageid,
      revisionId: revision.revid,
      revisionTimestamp: revision.timestamp,
      title: page.title,
    },
    extractor: { tool: "wikipedia-action-api", version: coursewerkVersion, schemaVersion: 1, sourceFormat: "mediawiki-json-extract" },
    textPath: textRel,
    sha256: sha256(text),
    minimumWords: 300,
    wordCount,
  };
  manifest.sources = manifest.sources.filter((item) => item.sourceId !== source.id).concat(entry);
  prepared.push({ sourceId: source.id, title: page.title, wordCount, revisionId: revision.revid });
}

manifest.sources.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
fs.mkdirSync(inputs, { recursive: true });
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
const totalWords = prepared.reduce((sum, item) => sum + item.wordCount, 0);
const chapterSized = totalWords >= minTotalWords && totalWords <= maxTotalWords;
console.log(JSON.stringify({ manifestFile, sourcesPrepared: prepared.length, totalWords, minTotalWords, maxTotalWords, chapterSized, prepared }, null, 2));
if (!chapterSized) {
  console.error(`prepare-wikipedia-topic: topic corpus is not chapter-sized (${totalWords} words; expected ${minTotalWords}-${maxTotalWords})`);
  process.exit(3);
}
