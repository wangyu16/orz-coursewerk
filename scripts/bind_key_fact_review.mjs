#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { auditKeyFactReview, KEY_FACT_REVIEW_PATH, makeKeyFactBindings, REQUIRED_KEY_FACT_CHECKS } from "./lib/key_fact_review.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback = null) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const root = path.resolve(opt("--root", "package"));
const file = path.join(root, KEY_FACT_REVIEW_PATH);
if (!fs.existsSync(file)) { console.error(`bind-key-fact-review: draft ${KEY_FACT_REVIEW_PATH} first`); process.exit(2); }
const review = JSON.parse(fs.readFileSync(file, "utf8"));
review.schemaVersion = 1;
review.mode = opt("--mode", review.mode);
review.reviewKind = opt("--review-kind", review.reviewKind);
review.authoringSystem = opt("--authoring-system", review.authoringSystem);
review.authoringModelId = opt("--authoring-model-id", review.authoringModelId);
review.reviewer = { name: opt("--reviewer-name", review.reviewer?.name), type: opt("--reviewer-type", review.reviewer?.type), modelId: opt("--reviewer-model-id", review.reviewer?.modelId) };
review.reviewedAt = opt("--reviewed-at", review.reviewedAt);
review.bindings = makeKeyFactBindings(root);
fs.writeFileSync(file, JSON.stringify(review, null, 2) + "\n");
const foundation = JSON.parse(fs.readFileSync(path.join(root, "metadata", "FOUNDATION.json"), "utf8"));
const audit = auditKeyFactReview(root, foundation);
if (!audit.ready) {
  console.error(`bind-key-fact-review: review is incomplete: ${audit.failures.join("; ")}`);
  process.exit(3);
}
console.log(JSON.stringify({ file, requiredChecks: REQUIRED_KEY_FACT_CHECKS, bindings: review.bindings, status: "passed" }, null, 2));
