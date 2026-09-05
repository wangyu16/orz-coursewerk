import crypto from "node:crypto";
import fs from "node:fs";
import { identityProblem } from "./identity.mjs";
import path from "node:path";

export const VISUAL_REVIEW_PATH = "metadata/VISUAL_REVIEW.json";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function walkMarkdown(dir, prefix) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) out.push(...walkMarkdown(path.join(dir, entry.name), `${prefix}/${entry.name}`));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(`${prefix}/${entry.name}`);
  }
  return out;
}
function expectedCarrierSources(root) {
  const out = [];
  // M9 (round-3 audit): the builder walks recursively; the attestation walked one level, so a nested
  // deliverable could be built and attested yet "not match every current carrier source". One rule.
  for (const top of ["study-guide", "practice", "slides"]) out.push(...walkMarkdown(path.join(root, top), top));
  const documents = path.join(root, "metadata", "DOCUMENTS.json");
  if (fs.existsSync(documents)) {
    try { for (const item of JSON.parse(fs.readFileSync(documents, "utf8")).documents || []) if (item.source) out.push(String(item.source).replaceAll("\\", "/")); }
    catch { /* contract QA owns malformed DOCUMENTS */ }
  }
  return [...new Set(out)].sort();
}

export function carrierReviewRecords(receipt) {
  return (receipt?.results || []).map((result) => ({
    source: result.source,
    carrier: result.carrier,
    builder: result.builder,
    sourceSha256: result.sourceSha256,
    outputFingerprint: result.reviewFingerprint,
    localAssetDigests: result.sourceInspection?.localAssetDigests || [],
  })).sort((a, b) => a.source.localeCompare(b.source));
}

export function auditVisualReview(root) {
  root = path.resolve(root);
  const file = path.join(root, VISUAL_REVIEW_PATH);
  const failures = [];
  if (!fs.existsSync(file)) return { ready: false, failures: [`${VISUAL_REVIEW_PATH} is required before public release.`], review: null };
  let review;
  try { review = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { return { ready: false, failures: [`${VISUAL_REVIEW_PATH} is invalid JSON: ${error.message}`], review: null }; }
  if (review.schemaVersion !== 1 || review.status !== "passed") failures.push(`${VISUAL_REVIEW_PATH}: schemaVersion 1 and status passed are required.`);
  if (review.reviewer?.type !== "human" || !String(review.reviewer?.name || "").trim()) failures.push(`${VISUAL_REVIEW_PATH}: an identified human reviewer is required.`);
  { const problem = identityProblem(review.reviewer?.name);
    if (problem) failures.push(`${VISUAL_REVIEW_PATH}: reviewer "${review.reviewer?.name}" ${problem}.`); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(review.reviewedAt || ""))) failures.push(`${VISUAL_REVIEW_PATH}: reviewedAt must be YYYY-MM-DD.`);
  if (review.inspectionMethod !== "browser-visual-dom") failures.push(`${VISUAL_REVIEW_PATH}: inspectionMethod must be browser-visual-dom.`);
  if (String(review.attestation || "").trim().length < 40) failures.push(`${VISUAL_REVIEW_PATH}: a substantive visual-review attestation is required.`);
  const records = Array.isArray(review.carriers) ? review.carriers : [];
  const expected = expectedCarrierSources(root);
  if (JSON.stringify(records.map((item) => item.source).sort()) !== JSON.stringify(expected))
    failures.push(`${VISUAL_REVIEW_PATH}: reviewed carrier set does not match every current carrier source.`);
  for (const record of records) {
    const source = path.resolve(root, String(record.source || ""));
    const inside = path.relative(root, source);
    if (inside.startsWith("..") || path.isAbsolute(inside) || !fs.existsSync(source)) { failures.push(`${VISUAL_REVIEW_PATH}: reviewed source is missing or outside the package: ${record.source}.`); continue; }
    if (sha256(fs.readFileSync(source)) !== record.sourceSha256) failures.push(`${VISUAL_REVIEW_PATH}: source changed after visual review: ${record.source}.`);
    if (record.outputFingerprint?.algorithm !== "sha256" || record.outputFingerprint?.normalization !== "coursewerk-carrier-v1" || !/^[a-f0-9]{64}$/.test(String(record.outputFingerprint?.value || "")))
      failures.push(`${VISUAL_REVIEW_PATH}: stable carrier review fingerprint is missing for ${record.source}.`);
    for (const asset of record.localAssetDigests || []) {
      const filePath = path.resolve(root, String(asset.path || ""));
      const assetInside = path.relative(root, filePath);
      if (assetInside.startsWith("..") || path.isAbsolute(assetInside) || !fs.existsSync(filePath)) failures.push(`${VISUAL_REVIEW_PATH}: reviewed asset is missing: ${asset.path}.`);
      else if (sha256(fs.readFileSync(filePath)) !== asset.sha256) failures.push(`${VISUAL_REVIEW_PATH}: asset changed after visual review: ${asset.path}.`);
    }
  }
  return { ready: failures.length === 0, failures: [...new Set(failures)], review };
}

export function verifyVisualReviewAgainstCarrierReceipt(root, receipt) {
  const audit = auditVisualReview(root);
  if (!audit.ready) return audit;
  const actual = carrierReviewRecords(receipt);
  const failures = JSON.stringify(actual) === JSON.stringify(audit.review.carriers)
    ? []
    : [`${VISUAL_REVIEW_PATH}: rebuilt carrier hashes differ from the visually reviewed carriers.`];
  return { ...audit, ready: failures.length === 0, failures };
}
