#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { makeProcessReview, processDecisionResolves } from "./lib/rights_preflight.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const root = path.resolve(opt("--root", "package"));
const sourceId = opt("--source-id");
const verifiedBy = opt("--verified-by");
const foundationFile = path.join(root, "metadata", "FOUNDATION.json");
if (!sourceId || !verifiedBy || !fs.existsSync(foundationFile)) { console.error("capture-rights-evidence: --source-id, --verified-by, and a FOUNDATION.json are required"); process.exit(2); }
const foundation = JSON.parse(fs.readFileSync(foundationFile, "utf8"));
const source = (foundation.sources || []).find((item) => item.id === sourceId);
if (!source?.rightsBasis?.evidenceUrl) { console.error(`capture-rights-evidence: source ${sourceId} has no evidenceUrl`); process.exit(2); }
let bytes;
const inputFile = opt("--file");
if (inputFile) bytes = fs.readFileSync(path.resolve(inputFile));
else {
  const response = await fetch(source.rightsBasis.evidenceUrl, { redirect: "follow" });
  if (!response.ok) { console.error(`capture-rights-evidence: HTTP ${response.status}`); process.exit(2); }
  bytes = Buffer.from(await response.arrayBuffer());
}
const safeId = sourceId.replace(/[^a-z0-9._-]+/gi, "-");
const rel = `metadata/evidence/${safeId}.html`;
const out = path.join(root, rel);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, bytes);
source.rightsBasis.evidenceSnapshot = rel;
source.rightsBasis.evidenceSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
source.rightsBasis.evidenceVerifiedBy = verifiedBy;
source.rightsBasis.processUseReview = makeProcessReview(bytes.toString("utf8"));
fs.writeFileSync(foundationFile, JSON.stringify(foundation, null, 2) + "\n");
const notices = source.rightsBasis.processUseReview.notices;
const resolved = processDecisionResolves(notices, source.rightsBasis.processUseDecision);
console.log(JSON.stringify({ sourceId, evidenceUrl: source.rightsBasis.evidenceUrl, evidenceSnapshot: rel, evidenceSha256: source.rightsBasis.evidenceSha256, evidenceVerifiedBy: verifiedBy, processUseReview: source.rightsBasis.processUseReview, processUseResolved: resolved }, null, 2));
if (!resolved) {
  console.error("capture-rights-evidence: process-specific source restrictions require permission or a recorded qualified decision before source ingestion");
  process.exit(3);
}
