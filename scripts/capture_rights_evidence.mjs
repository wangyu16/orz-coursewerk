#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPreflightReceipt, evaluatePreIngestionEvidence, writePreflightReceipt } from "./lib/pre_ingestion.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback = null) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const root = path.resolve(opt("--root", "package"));
const sourceId = opt("--source-id");
const operatorName = opt("--operator-name");
const operatorType = opt("--operator-type");
const contact = opt("--contact", "https://coursewerk.orz.how/");
const foundationFile = path.join(root, "metadata", "FOUNDATION.json");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = fs.readFileSync(path.join(repoRoot, "VERSION"), "utf8").trim();

if (!sourceId || !operatorName || !["automation", "human"].includes(operatorType) || !fs.existsSync(foundationFile)) {
  console.error("capture-rights-evidence: --source-id, --operator-name, --operator-type automation|human, and a FOUNDATION.json are required");
  process.exit(2);
}

const foundation = JSON.parse(fs.readFileSync(foundationFile, "utf8"));
const source = (foundation.sources || []).find((item) => item.id === sourceId);
if (!source?.rightsBasis?.evidenceUrl) {
  console.error(`capture-rights-evidence: source ${sourceId} has no evidenceUrl`);
  process.exit(2);
}

const capturedAt = new Date().toISOString();
let bytes;
let retrieval;
const inputFile = opt("--file");
if (inputFile) {
  const localFile = path.resolve(inputFile);
  bytes = fs.readFileSync(localFile);
  const localExtension = path.extname(localFile).toLowerCase();
  const localContentType = [".html", ".htm"].includes(localExtension) ? "text/html" : localExtension === ".json" ? "application/json" : "text/plain";
  retrieval = {
    captureMode: "local-file",
    claimedEvidenceUrl: source.rightsBasis.evidenceUrl,
    localFileName: path.basename(localFile),
    retrievedAt: capturedAt,
    byteLength: bytes.length,
    contentType: localContentType,
    tool: { name: "coursewerk", version },
  };
} else {
  let currentUrl = source.rightsBasis.evidenceUrl;
  const redirectChain = [];
  let response;
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    response = await fetch(currentUrl, {
      redirect: "manual",
      headers: { "User-Agent": `Coursewerk/${version} (${contact})` },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) break;
    const nextUrl = new URL(location, currentUrl).href;
    redirectChain.push({ status: response.status, from: currentUrl, to: nextUrl });
    currentUrl = nextUrl;
  }
  if (!response?.ok) {
    console.error(`capture-rights-evidence: HTTP ${response?.status || "unknown"}`);
    process.exit(2);
  }
  bytes = Buffer.from(await response.arrayBuffer());
  retrieval = {
    captureMode: "network",
    requestedUrl: source.rightsBasis.evidenceUrl,
    finalUrl: response.url || currentUrl,
    redirectChain,
    retrievedAt: capturedAt,
    httpStatus: response.status,
    contentType: response.headers.get("content-type") || "application/octet-stream",
    byteLength: bytes.length,
    tool: { name: "coursewerk", version },
  };
}

const safeId = sourceId.replace(/[^a-z0-9._-]+/gi, "-");
const extension = /html/i.test(retrieval.contentType || "") ? "html" : "txt";
const rel = `metadata/evidence/${safeId}.${extension}`;
const out = path.join(root, rel);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, bytes);

const operator = { type: operatorType, name: operatorName };
const evaluation = evaluatePreIngestionEvidence(source, bytes, capturedAt);
source.rightsBasis.evidenceSnapshot = rel;
source.rightsBasis.evidenceSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
source.rightsBasis.evidenceRetrieval = retrieval;
source.rightsBasis.evidenceCapture = {
  operator,
  capturedAt,
  tool: { name: "coursewerk", version },
};
source.rightsBasis.processUseReview = evaluation.processUseReview;
delete source.rightsBasis.evidenceVerifiedBy;

const receipt = buildPreflightReceipt({ source, evidenceBytes: bytes, retrieval, operator, generatedAt: capturedAt });
const receiptFile = writePreflightReceipt(root, source, receipt);
fs.writeFileSync(foundationFile, JSON.stringify(foundation, null, 2) + "\n");

console.log(JSON.stringify({
  sourceId,
  evidenceUrl: source.rightsBasis.evidenceUrl,
  evidenceSnapshot: rel,
  evidenceSha256: source.rightsBasis.evidenceSha256,
  evidenceRetrieval: retrieval,
  evidenceCapture: source.rightsBasis.evidenceCapture,
  preflightReceipt: receiptFile.rel,
  preflightReceiptSha256: source.rightsBasis.preflightReceiptSha256,
  policyId: receipt.policyId,
  processUseReview: receipt.processUseReview,
  noticeReviewComplete: receipt.noticeReviewComplete,
  policyChecksPassed: receipt.policyChecksPassed,
  status: receipt.status,
  warnings: receipt.warnings,
  blockers: receipt.blockers,
}, null, 2));

if (receipt.status !== "cleared") {
  console.error(`capture-rights-evidence: pre-ingestion clearance blocked: ${receipt.blockers.join("; ")}`);
  process.exit(3);
}
