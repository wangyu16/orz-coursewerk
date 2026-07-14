import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const KEY_FACT_REVIEW_PATH = "metadata/KEY_FACT_REVIEW.json";
export const REQUIRED_KEY_FACT_CHECKS = [
  "accountable-identity",
  "source-identity-version",
  "source-license-evidence",
  "external-media-rights",
  "output-license-compatibility",
  "attribution-obligations",
  "scientific-key-facts",
];
const DELIVERABLE_TOPS = new Set(["concepts", "study-guide", "slides", "assessment-support", "practice"]);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function walk(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function fileDigest(root, rel) {
  const file = path.join(root, rel);
  return fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null;
}

export function makeKeyFactBindings(root) {
  root = path.resolve(root);
  const deliverables = walk(root)
    .map((file) => path.relative(root, file).replaceAll(path.sep, "/"))
    .filter((rel) => rel.endsWith(".md") && DELIVERABLE_TOPS.has(rel.split("/")[0]))
    .sort()
    .map((rel) => [rel, fileDigest(root, rel)]);
  return {
    manifestSha256: fileDigest(root, "alembic.json"),
    licenseSha256: fileDigest(root, "LICENSE"),
    foundationSha256: fileDigest(root, "metadata/FOUNDATION.json"),
    provenanceSha256: fileDigest(root, "metadata/PROVENANCE.json"),
    attributionSha256: fileDigest(root, "metadata/ATTRIBUTION.md"),
    sourceRecordSha256: fileDigest(root, "metadata/SOURCE_RECORD.json"),
    deliverableTreeSha256: sha256(JSON.stringify(deliverables)),
  };
}

export function auditKeyFactReview(root, foundation) {
  root = path.resolve(root);
  const file = path.join(root, KEY_FACT_REVIEW_PATH);
  const failures = [];
  if (!fs.existsSync(file)) return { ready: false, failures: [`${KEY_FACT_REVIEW_PATH} is required for public release.`], review: null };
  let review;
  try { review = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { return { ready: false, failures: [`${KEY_FACT_REVIEW_PATH} is invalid JSON: ${error.message}`], review: null }; }
  if (review.schemaVersion !== 1) failures.push(`${KEY_FACT_REVIEW_PATH}: schemaVersion must be 1.`);
  if (!["light", "full"].includes(review.mode)) failures.push(`${KEY_FACT_REVIEW_PATH}: mode must be light or full.`);
  if (review.mode === "light" && review.reviewKind !== "same-model-independent-pass")
    failures.push(`${KEY_FACT_REVIEW_PATH}: Light mode requires reviewKind same-model-independent-pass.`);
  if (review.mode === "full" && review.reviewKind !== "cross-model")
    failures.push(`${KEY_FACT_REVIEW_PATH}: Full mode requires reviewKind cross-model.`);
  if (review.independence?.separatePass !== true || String(review.independence?.approach || "").trim().length < 30)
    failures.push(`${KEY_FACT_REVIEW_PATH}: declare a genuine separate review pass and its substantive independence approach.`);
  if (review.mode === "light" && review.independence?.contextReset !== true)
    failures.push(`${KEY_FACT_REVIEW_PATH}: Light mode requires contextReset=true for the same-model independent pass.`);
  if (!String(review.authoringSystem || "").trim() || !String(review.authoringModelId || "").trim() ||
      !String(review.reviewer?.name || "").trim() || review.reviewer?.type !== "ai" || !String(review.reviewer?.modelId || "").trim())
    failures.push(`${KEY_FACT_REVIEW_PATH}: authoring system/model ID and an identified AI reviewer/model ID are required.`);
  const authoringModelId = String(review.authoringModelId || "").trim().toLowerCase();
  const reviewerModelId = String(review.reviewer?.modelId || "").trim().toLowerCase();
  if (review.mode === "light" && authoringModelId !== reviewerModelId)
    failures.push(`${KEY_FACT_REVIEW_PATH}: Light mode must use the same model ID for the context-reset review.`);
  if (review.mode === "full" && (authoringModelId === reviewerModelId || String(review.authoringSystem).trim().toLowerCase() === String(review.reviewer?.name).trim().toLowerCase()))
    failures.push(`${KEY_FACT_REVIEW_PATH}: Full mode reviewer/model must differ from the authoring system/model.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(review.reviewedAt || ""))) failures.push(`${KEY_FACT_REVIEW_PATH}: reviewedAt must be YYYY-MM-DD.`);
  if (JSON.stringify(review.bindings || {}) !== JSON.stringify(makeKeyFactBindings(root)))
    failures.push(`${KEY_FACT_REVIEW_PATH}: bindings are stale; repeat the key-fact critique after the latest source, provenance, or deliverable change.`);
  const checks = new Map((review.checks || []).map((check) => [check.id, check]));
  for (const id of REQUIRED_KEY_FACT_CHECKS) {
    const check = checks.get(id);
    if (check?.status !== "passed" || String(check?.note || "").trim().length < 20)
      failures.push(`${KEY_FACT_REVIEW_PATH}: required check ${id} needs status passed and a substantive review note.`);
  }
  const declaredSources = new Set((foundation?.sources || []).map((source) => source.id));
  if (!Array.isArray(review.keyFacts) || review.keyFacts.length === 0) failures.push(`${KEY_FACT_REVIEW_PATH}: at least one chapter-level scientific key fact must be reviewed.`);
  for (const [index, fact] of (review.keyFacts || []).entries()) {
    const label = `${KEY_FACT_REVIEW_PATH}: keyFacts[${index}]`;
    if (!String(fact.id || "").trim() || !String(fact.claim || "").trim()) failures.push(`${label} requires id and claim.`);
    if (!["verified", "qualified"].includes(fact.status)) failures.push(`${label} status must be verified or qualified.`);
    if (!Array.isArray(fact.evidenceSourceIds) || fact.evidenceSourceIds.length === 0 || fact.evidenceSourceIds.some((id) => !declaredSources.has(id)))
      failures.push(`${label} must cite one or more declared evidenceSourceIds.`);
    if (!Array.isArray(fact.usedIn) || fact.usedIn.length === 0) failures.push(`${label} must list usedIn deliverables.`);
    for (const rel of fact.usedIn || []) {
      const target = path.resolve(root, String(rel));
      const inside = path.relative(root, target);
      if (inside.startsWith("..") || path.isAbsolute(inside) || !fs.existsSync(target)) failures.push(`${label} usedIn path is missing or outside the package: ${rel}.`);
    }
    if (String(fact.note || "").trim().length < 20) failures.push(`${label} requires a substantive critique note.`);
  }
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(path.join(root, "alembic.json"), "utf8")); } catch { /* private roots may have no manifest */ }
  for (const chapter of manifest?.chapters || []) {
    const studyGuide = `study-guide/${chapter.slug}.md`;
    if (!(review.keyFacts || []).some((fact) => (fact.usedIn || []).includes(studyGuide)))
      failures.push(`${KEY_FACT_REVIEW_PATH}: chapter ${chapter.slug} requires at least one reviewed key fact traced to ${studyGuide}.`);
  }
  return { ready: failures.length === 0, failures: [...new Set(failures)], review };
}
