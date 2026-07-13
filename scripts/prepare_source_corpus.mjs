#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditIngestionReadiness } from "./lib/pre_ingestion.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const inputs = path.resolve(opt("--inputs", "inputs"));
const root = path.resolve(opt("--root", "package"));
const sourceId = opt("--source-id");
if (!sourceId || !/^[a-z0-9][a-z0-9._-]*$/i.test(sourceId)) { console.error("prepare-source-corpus: --source-id is required and must be path-safe"); process.exit(2); }
const foundationFile = path.join(root, "metadata", "FOUNDATION.json");
if (!fs.existsSync(foundationFile)) { console.error("prepare-source-corpus: --root must contain metadata/FOUNDATION.json so rights preflight can be enforced"); process.exit(3); }
const foundation = JSON.parse(fs.readFileSync(foundationFile, "utf8"));
const sourceRecord = (foundation.sources || []).find((item) => item.id === sourceId);
if (!sourceRecord) { console.error(`prepare-source-corpus: source ${sourceId} is not declared in FOUNDATION.json`); process.exit(3); }
const ingestion = auditIngestionReadiness(root, foundation);
if (!ingestion.ready) {
  console.error(`prepare-source-corpus: pre-ingestion clearance is missing, stale, or blocked: ${ingestion.failures.join("; ")}`);
  process.exit(3);
}
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coursewerkVersion = fs.readFileSync(path.join(repoRoot, "VERSION"), "utf8").trim();
fs.mkdirSync(inputs, { recursive: true });
const manifestFile = path.join(inputs, "SOURCE_CORPUS.json");
let manifest = { schemaVersion: 1, sources: [] };
try { manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")); } catch { /* initialize */ }
manifest.schemaVersion = 1;
manifest.sources = Array.isArray(manifest.sources) ? manifest.sources : [];

let entry;
if (args.includes("--human-attested")) {
  const attestedBy = opt("--attested-by");
  const attestedAt = opt("--attested-at");
  const reason = opt("--reason");
  if (!attestedBy || !/^\d{4}-\d{2}-\d{2}$/.test(attestedAt || "") || !reason) { console.error("prepare-source-corpus: human attestation requires --attested-by, --attested-at YYYY-MM-DD, and --reason"); process.exit(2); }
  entry = { sourceId, comparisonMode: "human-attested", attestedBy, attestedAt, reason };
} else {
  const inputFile = opt("--file");
  if (!inputFile) { console.error("prepare-source-corpus: --file is required for automatic comparison"); process.exit(2); }
  const sourceFile = path.resolve(inputFile);
  if (!fs.existsSync(sourceFile) || !fs.statSync(sourceFile).isFile()) { console.error("prepare-source-corpus: --file must name an existing file"); process.exit(2); }
  const ext = path.extname(sourceFile).toLowerCase();
  const rawBytes = fs.readFileSync(sourceFile);
  let text;
  if ([".txt", ".md", ".markdown", ".csv", ".json", ".tex", ".rtf"].includes(ext)) text = fs.readFileSync(sourceFile, "utf8");
  else if ([".html", ".htm"].includes(ext)) text = fs.readFileSync(sourceFile, "utf8").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  else if (ext === ".pdf") {
    const result = spawnSync("pdftotext", [sourceFile, "-"], { encoding: "utf8" });
    if (result.status !== 0) { console.error(`prepare-source-corpus: pdftotext failed: ${result.stderr || "install Poppler"}`); process.exit(2); }
    text = result.stdout;
  } else if (ext === ".docx") {
    const result = spawnSync("unzip", ["-p", sourceFile, "word/document.xml"], { encoding: "utf8" });
    if (result.status !== 0) { console.error(`prepare-source-corpus: DOCX extraction failed: ${result.stderr}`); process.exit(2); }
    text = result.stdout.replace(/<w:tab\/?\s*>/g, "\t").replace(/<w:br\/?\s*>/g, "\n").replace(/<[^>]+>/g, " ");
  } else { console.error(`prepare-source-corpus: unsupported source format ${ext}`); process.exit(2); }
  text = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  const words = (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
  if (words < 100) { console.error(`prepare-source-corpus: extracted source has only ${words} words; at least 100 are required`); process.exit(2); }
  const originalRel = `.coursewerk-source-original/${sourceId}${ext || ".bin"}`;
  const originalOut = path.join(inputs, originalRel);
  fs.mkdirSync(path.dirname(originalOut), { recursive: true });
  fs.copyFileSync(sourceFile, originalOut);
  const rel = `.coursewerk-source-text/${sourceId}.txt`;
  const out = path.join(inputs, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  const canonicalUrl = opt("--canonical-url");
  const retrievedAt = opt("--retrieved-at", new Date().toISOString());
  entry = {
    sourceId,
    comparisonMode: "automatic",
    originalFile: path.basename(sourceFile),
    originalPath: originalRel,
    originalSha256: crypto.createHash("sha256").update(rawBytes).digest("hex"),
    canonicalUrl,
    retrievedAt,
    extractor: { tool: "coursewerk", version: coursewerkVersion, schemaVersion: 1, sourceFormat: ext || "unknown" },
    textPath: rel,
    sha256: crypto.createHash("sha256").update(text).digest("hex"),
    minimumWords: 100,
    wordCount: words,
  };
}
manifest.sources = manifest.sources.filter((item) => item.sourceId !== sourceId).concat(entry).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ manifestFile, entry }, null, 2));
