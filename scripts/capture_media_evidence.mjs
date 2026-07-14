#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (name, fallback = null) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const root = path.resolve(opt("--root", "package"));
const itemId = opt("--item-id");
const operatorName = opt("--operator-name");
const operatorType = opt("--operator-type");
const evidenceType = opt("--evidence-type", "official-media-description-page");
const contact = opt("--contact", "https://coursewerk.orz.how/");
const provenanceFile = path.join(root, "metadata", "PROVENANCE.json");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = fs.readFileSync(path.join(repoRoot, "VERSION"), "utf8").trim();

if (!itemId || !operatorName || !["automation", "human"].includes(operatorType) ||
    !["official-media-description-page", "publisher-supplied-license-file", "official-license-metadata"].includes(evidenceType) ||
    !fs.existsSync(provenanceFile)) {
  console.error("capture-media-evidence: --item-id, --operator-name, --operator-type automation|human, an authoritative --evidence-type, and metadata/PROVENANCE.json are required");
  process.exit(2);
}
const provenance = JSON.parse(fs.readFileSync(provenanceFile, "utf8"));
const item = (provenance.items || []).find((candidate) => candidate.id === itemId);
if (!item || item.provenanceStatus !== "verified" || !item.sourceUrl) {
  console.error(`capture-media-evidence: ${itemId} must be a verified external item with sourceUrl`);
  process.exit(2);
}

const capturedAt = new Date().toISOString();
let bytes;
let retrieval;
const inputFile = opt("--file");
if (inputFile) {
  const file = path.resolve(inputFile);
  bytes = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  retrieval = {
    captureMode: "local-file",
    claimedEvidenceUrl: item.sourceUrl,
    localFileName: path.basename(file),
    retrievedAt: capturedAt,
    byteLength: bytes.length,
    contentType: [".html", ".htm"].includes(ext) ? "text/html" : ext === ".json" ? "application/json" : "text/plain",
    tool: { name: "coursewerk", version },
  };
} else {
  let currentUrl = item.sourceUrl;
  const redirectChain = [];
  let response;
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    response = await fetch(currentUrl, { redirect: "manual", headers: { "User-Agent": `Coursewerk/${version} (${contact})` } });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) break;
    const nextUrl = new URL(location, currentUrl).href;
    redirectChain.push({ status: response.status, from: currentUrl, to: nextUrl });
    currentUrl = nextUrl;
  }
  if (!response?.ok) { console.error(`capture-media-evidence: HTTP ${response?.status || "unknown"}`); process.exit(2); }
  bytes = Buffer.from(await response.arrayBuffer());
  retrieval = {
    captureMode: "network",
    requestedUrl: item.sourceUrl,
    finalUrl: response.url || currentUrl,
    redirectChain,
    retrievedAt: capturedAt,
    httpStatus: response.status,
    contentType: response.headers.get("content-type") || "application/octet-stream",
    byteLength: bytes.length,
    tool: { name: "coursewerk", version },
  };
}

const safeId = itemId.replace(/[^a-z0-9._-]+/gi, "-");
const extension = /html/i.test(retrieval.contentType || "") ? "html" : /json/i.test(retrieval.contentType || "") ? "json" : "txt";
const rel = `metadata/evidence/media-${safeId}.${extension}`;
fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
fs.writeFileSync(path.join(root, rel), bytes);
item.rightsEvidence = {
  evidenceType,
  evidenceUrl: item.sourceUrl,
  verifiedAt: capturedAt.slice(0, 10),
  evidenceSnapshot: rel,
  evidenceSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  evidenceRetrieval: retrieval,
  evidenceCapture: { operator: { type: operatorType, name: operatorName }, capturedAt, tool: { name: "coursewerk", version } },
};
fs.writeFileSync(provenanceFile, JSON.stringify(provenance, null, 2) + "\n");
console.log(JSON.stringify({ itemId, rightsEvidence: item.rightsEvidence }, null, 2));
