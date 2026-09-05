import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { REQUIRED_KEY_FACT_CHECKS } from "./key_fact_checks.mjs";
import { blindBundleDigest } from "./blind_bundle.mjs";
import { normalizeMarkdownForHash } from "./coherence.mjs";

export const KEY_FACT_REVIEW_PATH = "metadata/KEY_FACT_REVIEW.json";
export { REQUIRED_KEY_FACT_CHECKS };
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
    // H8: bound to whitespace-normalized text, so a reflow does not force a re-review; any visible
    // change still does (the same rule the component index uses).
    .map((rel) => [rel, sha256(normalizeMarkdownForHash(fs.readFileSync(path.join(root, rel), "utf8")))]);
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
  // INDEPENDENCE IS ASSEMBLED, NOT DECLARED. `separatePass`/`contextReset` are the reviewer's word
  // about itself; the gate cannot verify a word. What it CAN verify is that the review names the
  // digest of the one surface a blind reviewer is given — the bundle `review:blind-bundle` assembles
  // by allowlist, with every process file withheld — and that this digest is the CURRENT package's.
  // A review that cannot name it either never saw the bundle or saw a different package.
  // Not a `bindings` entry: each binding tracks ONE record; the bundle is a composite of several
  // (deliverables, license, attribution, source record, projected sources) and is compared live.
  const declaredBundle = String(review.independence?.bundleSha256 || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(declaredBundle))
    failures.push(`${KEY_FACT_REVIEW_PATH}: independence.bundleSha256 must record the digest of the blind bundle the reviewer judged (run \`npm run review:blind-bundle\`).`);
  else if (declaredBundle !== blindBundleDigest(root))
    failures.push(`${KEY_FACT_REVIEW_PATH}: independence.bundleSha256 does not match the current blind bundle — the reviewer judged a different result; re-assemble the bundle and repeat the critique.`);
  // H5 (design audit 2026-09-05): the template's own placeholders passed the gate — only note LENGTH
  // was checked. A review is evidence of a critique only if every identity and every note is real.
  const PLACEHOLDER = /\b(?:replace(?:-with)?|generated-by|copy-from|placeholder|temporary|pending|unassigned|tbd|todo|unknown)\b/i;
  const identityFields = [
    ["authoringSystem", review.authoringSystem], ["authoringModelId", review.authoringModelId],
    ["reviewer.name", review.reviewer?.name], ["reviewer.modelId", review.reviewer?.modelId],
    ["independence.approach", review.independence?.approach],
  ];
  for (const [name, value] of identityFields)
    if (PLACEHOLDER.test(String(value || ""))) failures.push(`${KEY_FACT_REVIEW_PATH}: ${name} still carries a template placeholder.`);
  for (const check of review.checks || [])
    if (PLACEHOLDER.test(String(check?.note || ""))) failures.push(`${KEY_FACT_REVIEW_PATH}: check ${check?.id} note still carries a template placeholder.`);
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
    if (PLACEHOLDER.test(String(fact.claim || "")) || PLACEHOLDER.test(String(fact.note || "")))
      failures.push(`${label} still carries a template placeholder.`);
    // The fact must be ABOUT the deliverables it names: its numbers must appear there, and most of
    // its content words must. A fact nobody could locate in the package is not a reviewed fact.
    const corpus = (fact.usedIn || []).map((relPath) => {
      const target = path.resolve(root, String(relPath));
      try { return fs.readFileSync(target, "utf8").toLowerCase(); } catch { return ""; }
    }).join("\n");
    if (corpus) {
      const claim = String(fact.claim || "");
      const numbers = claim.match(/\d+(?:[.,]\d+)?/g) || [];
      const words = (claim.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []);
      const missingNumbers = numbers.filter((n) => !corpus.includes(n.replace(",", ".")) && !corpus.includes(n));
      const present = words.filter((w) => corpus.includes(w)).length;
      if (missingNumbers.length || (words.length >= 6 && present < Math.ceil(words.length * 0.6)))
        failures.push(`${label} is not supported by its usedIn deliverables (${missingNumbers.length ? `numbers ${missingNumbers.join(", ")} not found` : `${present}/${words.length} content words found`}); trace the fact to prose that states it.`);
    }
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
