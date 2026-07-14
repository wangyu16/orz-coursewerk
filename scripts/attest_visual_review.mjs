#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { carrierReviewRecords, VISUAL_REVIEW_PATH } from "./lib/visual_review.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback = null) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const root = path.resolve(opt("--root", "package"));
const receiptFile = path.resolve(opt("--receipt", "reports/carriers.json"));
const reviewer = opt("--reviewer");
const reviewedAt = opt("--reviewed-at");
const attestation = opt("--attestation");
if (!reviewer || !/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt || "") || String(attestation || "").trim().length < 40 || !fs.existsSync(receiptFile)) {
  console.error("attest-visual-review: --reviewer, --reviewed-at YYYY-MM-DD, a substantive --attestation, and --receipt are required");
  process.exit(2);
}
const receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8"));
if (receipt.failed !== 0 || !Array.isArray(receipt.results) || receipt.results.length === 0) {
  console.error("attest-visual-review: carrier receipt must contain a complete zero-failure build");
  process.exit(3);
}
const review = {
  schemaVersion: 1,
  status: "passed",
  reviewer: { type: "human", name: reviewer },
  reviewedAt,
  inspectionMethod: "browser-visual-dom",
  attestation,
  carriers: carrierReviewRecords(receipt),
};
const out = path.join(root, VISUAL_REVIEW_PATH);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(review, null, 2) + "\n");
console.log(JSON.stringify({ file: out, carriers: review.carriers.length, status: review.status }, null, 2));
