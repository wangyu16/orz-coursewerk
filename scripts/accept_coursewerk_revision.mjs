#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { validateCoursewerkReview, writeCoursewerkIndex } from "./lib/system_index.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const root = path.resolve(opt("--root", process.cwd()));
const baseRef = opt("--base", "main");
const reviewFile = path.resolve(opt("--review", ".coursewerk/coursewerk-impact.json"));
if (!fs.existsSync(reviewFile)) { console.error(`review not found: ${reviewFile}`); process.exit(2); }
const review = JSON.parse(fs.readFileSync(reviewFile, "utf8"));
const validation = validateCoursewerkReview(root, review, { baseRef });
if (validation.failures.length) { console.error(validation.failures.join("\n")); process.exit(2); }
const indexFile = writeCoursewerkIndex(root, validation.current.index);
const generatedIndexHash = crypto.createHash("sha256").update(fs.readFileSync(indexFile)).digest("hex");
const record = {
  schemaVersion: 1,
  planId: review.planId,
  baseRef,
  baseTip: validation.current.baseTip,
  baseCommit: validation.current.mergeBase,
  reviewedHead: validation.current.head,
  changed: validation.current.changed,
  requiredReview: validation.current.requiredReview,
  reviewed: review.reviewed,
  impactedClaims: validation.current.impactedClaims,
  testResults: review.testResults,
  attestation: review.attestation,
  generatedIndexHash,
  acceptedAt: new Date().toISOString(),
};
const recordFile = path.join(root, "system", "revisions", `${review.planId}.json`);
fs.mkdirSync(path.dirname(recordFile), { recursive: true });
fs.writeFileSync(recordFile, JSON.stringify(record, null, 2) + "\n");
console.log(JSON.stringify({ indexFile, recordFile, reviewed: review.reviewed.length }, null, 2));
