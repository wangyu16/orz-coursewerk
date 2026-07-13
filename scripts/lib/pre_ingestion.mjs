import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeLicense } from "./contract.mjs";
import { makeProcessReview, normalizeEvidenceText } from "./rights_preflight.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const policiesFile = path.resolve(here, "../data/source-policies.json");
const sourcePolicies = JSON.parse(fs.readFileSync(policiesFile, "utf8")).policies || [];

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const norm = (value) => String(value || "").replaceAll("\\", "/").replace(/^\.\//, "");

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function receiptIndependentSource(source) {
  const copy = structuredClone(source);
  if (copy?.rightsBasis) {
    delete copy.rightsBasis.preflightReceipt;
    delete copy.rightsBasis.preflightReceiptSha256;
  }
  return copy;
}

export function sourceBindingSha256(source) {
  return sha256(JSON.stringify(canonical(receiptIndependentSource(source))));
}

export function sourcePolicyFor(source) {
  return sourcePolicies.find((policy) => {
    const publisher = String(source?.publisher || "").toLowerCase();
    const title = String(source?.title || "").toLowerCase();
    const url = String(source?.canonicalUrl || "").toLowerCase();
    const urlMatch = policy.match?.canonicalUrlIncludes && url.includes(policy.match.canonicalUrlIncludes.toLowerCase());
    const hasIdentityMatcher = Boolean(policy.match?.publisher || policy.match?.titleIncludes);
    const identityMatch = hasIdentityMatcher &&
      (!policy.match?.publisher || publisher === policy.match.publisher.toLowerCase()) &&
      (!policy.match?.titleIncludes || title.includes(policy.match.titleIncludes.toLowerCase()));
    return Boolean(urlMatch || identityMatch);
  }) || null;
}

export function evaluatePreIngestionEvidence(source, evidenceBytes, scannedAt = new Date().toISOString()) {
  const basis = source?.rightsBasis || {};
  const policy = sourcePolicyFor(source);
  const evidenceText = normalizeEvidenceText(evidenceBytes.toString("utf8"));
  const processUseReview = makeProcessReview(evidenceText, scannedAt);
  const blockers = [];
  const warnings = processUseReview.notices.length
    ? ["A separate AI/automated-use notice was recorded. Coursewerk does not treat the notice as part of the copyright license or determine its legal effect."]
    : [];

  if (policy) {
    if (basis.evidenceUrl !== policy.licenseEvidenceUrl)
      blockers.push(`known-source policy ${policy.id} requires evidence URL ${policy.licenseEvidenceUrl}`);
    if (normalizeLicense(basis.license) !== policy.license)
      blockers.push(`known-source policy ${policy.id} requires license ${policy.license}`);
    for (const noticeId of policy.expectedProcessNoticeIds || []) {
      if (!processUseReview.notices.some((notice) => notice.id === noticeId))
        blockers.push(`known-source policy ${policy.id} expected process notice ${noticeId}, but it was absent from the captured evidence`);
    }
    for (const marker of policy.requiredEvidenceTextIncludes || []) {
      if (!evidenceText.toLowerCase().includes(String(marker).toLowerCase()))
        blockers.push(`known-source policy ${policy.id} evidence is missing required marker: ${marker}`);
    }
    if (policy.authoringPreference === "avoid")
      warnings.push(`Coursewerk source preference ${policy.id}: ${policy.authoringPreferenceRationale || "prefer another source when practical"}`);
  }

  return {
    policy,
    policyChecksPassed: blockers.filter((item) => item.startsWith("known-source policy")).length === 0,
    processUseReview,
    noticeReviewComplete: true,
    warnings,
    blockers,
    status: blockers.length ? "blocked" : "cleared",
  };
}

export function buildPreflightReceipt({ source, evidenceBytes, retrieval, operator, generatedAt = new Date().toISOString() }) {
  const evaluation = evaluatePreIngestionEvidence(source, evidenceBytes, generatedAt);
  return {
    schemaVersion: 2,
    sourceId: source.id,
    sourceBindingSha256: sourceBindingSha256(source),
    policyId: evaluation.policy?.id || null,
    evidence: {
      url: source.rightsBasis?.evidenceUrl || null,
      snapshot: source.rightsBasis?.evidenceSnapshot || null,
      sha256: sha256(evidenceBytes),
      retrieval,
    },
    operator,
    processUseReview: evaluation.processUseReview,
    noticeReviewComplete: evaluation.noticeReviewComplete,
    policyChecksPassed: evaluation.policyChecksPassed,
    status: evaluation.status,
    warnings: evaluation.warnings,
    blockers: evaluation.blockers,
    generatedAt,
  };
}

export function writePreflightReceipt(root, source, receipt) {
  const safeId = source.id.replace(/[^a-z0-9._-]+/gi, "-");
  const rel = `metadata/preflight/${safeId}.json`;
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + "\n");
  source.rightsBasis.preflightReceipt = rel;
  source.rightsBasis.preflightReceiptSha256 = sha256(fs.readFileSync(file));
  return { rel, file };
}

export function verifyPreflightReceipt(root, source) {
  const failures = [];
  const basis = source?.rightsBasis || {};
  const rel = norm(basis.preflightReceipt);
  if (!rel || path.isAbsolute(rel) || rel.split("/").includes("..") || !rel.startsWith("metadata/preflight/"))
    return { ready: false, failures: [`source ${source?.id || "unknown"}: a valid metadata/preflight receipt is required before ingestion`], receipt: null };
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return { ready: false, failures: [`source ${source.id}: preflight receipt is missing: ${rel}`], receipt: null };
  const bytes = fs.readFileSync(file);
  if (!/^[a-f0-9]{64}$/.test(String(basis.preflightReceiptSha256 || "")) || sha256(bytes) !== basis.preflightReceiptSha256)
    failures.push(`source ${source.id}: preflight receipt hash is missing or stale`);
  let receipt;
  try { receipt = JSON.parse(bytes); }
  catch (error) { return { ready: false, failures: [...failures, `source ${source.id}: preflight receipt is invalid JSON: ${error.message}`], receipt: null }; }
  if (receipt.schemaVersion !== 2 || receipt.sourceId !== source.id) failures.push(`source ${source.id}: preflight receipt identity/schema is invalid; recapture rights evidence with the current Coursewerk version`);
  if (receipt.sourceBindingSha256 !== sourceBindingSha256(source)) failures.push(`source ${source.id}: preflight receipt does not match the current source/rights record`);
  const evidenceRel = norm(basis.evidenceSnapshot);
  const evidenceFile = path.join(root, evidenceRel);
  if (!evidenceRel || !fs.existsSync(evidenceFile)) failures.push(`source ${source.id}: preflight evidence snapshot is missing`);
  else {
    const evidenceBytes = fs.readFileSync(evidenceFile);
    if (sha256(evidenceBytes) !== basis.evidenceSha256 || receipt.evidence?.sha256 !== basis.evidenceSha256)
      failures.push(`source ${source.id}: preflight evidence hash is missing or stale`);
    const current = evaluatePreIngestionEvidence(source, evidenceBytes, receipt.generatedAt);
    if (current.status !== "cleared") failures.push(...current.blockers.map((item) => `source ${source.id}: ${item}`));
    if (receipt.status !== "cleared" || receipt.noticeReviewComplete !== true || receipt.policyChecksPassed !== true)
      failures.push(`source ${source.id}: preflight receipt is not cleared`);
    if (receipt.policyId !== current.policy?.id && (receipt.policyId || current.policy))
      failures.push(`source ${source.id}: preflight policy binding is stale`);
  }
  return { ready: failures.length === 0, failures: [...new Set(failures)], receipt };
}

export function auditIngestionReadiness(root, foundation) {
  const failures = [];
  const warnings = [];
  if (!foundation || foundation.schemaVersion !== 1) return { ready: false, failures: ["FOUNDATION.json schemaVersion 1 is required before ingestion"], warnings, sources: [] };
  if (!Array.isArray(foundation.sources) || foundation.sources.length === 0)
    return { ready: false, failures: ["At least one source must be declared before ingestion"], warnings, sources: [] };
  const nonPublished = ["personal-private", "restricted-teaching"].includes(foundation.usageProfile);
  const sources = [];
  for (const source of foundation.sources) {
    if (!source?.id) {
      failures.push("Every source requires an id before ingestion so its provenance can be tracked");
      continue;
    }
    if (nonPublished) {
      if (!source?.rightsBasis?.type)
        warnings.push(`source ${source.id}: rights basis is unrecorded; non-published authoring may continue, but record it before considering publication`);
      if (source?.rightsBasis?.preflightReceipt) {
        const result = verifyPreflightReceipt(root, source);
        if (!result.ready) warnings.push(...result.failures.map((item) => `${item} (advisory for non-published use)`));
      } else {
        warnings.push(`source ${source.id}: no rights receipt; permitted for non-published authoring and must be reviewed before publication`);
      }
      sources.push({ sourceId: source.id, ready: true, receipt: source?.rightsBasis?.preflightReceipt || null, advisoryOnly: true });
      continue;
    }
    if (!source?.rightsBasis?.type) {
      failures.push(`source ${source.id}: rightsBasis.type is required before public-source ingestion`);
      continue;
    }
    if (source.rightsBasis.type === "owned") {
      const ready = source.rightsBasis.attestedByUser === true;
      if (!ready) failures.push(`source ${source.id}: owned status requires explicit user attestation`);
      sources.push({ sourceId: source.id, ready, receipt: null });
      continue;
    }
    if (source.rightsBasis.type === "unknown")
      failures.push(`source ${source.id}: unknown rights basis cannot clear ingestion`);
    if (["institutional-authorization", "user-asserted-exception"].includes(source.rightsBasis.type) && source.rightsBasis.attestedByUser !== true)
      failures.push(`source ${source.id}: ${source.rightsBasis.type} requires explicit user attestation before ingestion`);
    if (source.rightsBasis.type === "permission" && !String(source.rightsBasis.permissionReference || "").trim())
      failures.push(`source ${source.id}: permissionReference is required before ingestion`);
    if (source.rightsBasis.type === "user-asserted-exception" && !String(foundation.jurisdiction || "").trim())
      failures.push(`source ${source.id}: jurisdiction is required for an asserted exception`);
    const result = verifyPreflightReceipt(root, source);
    failures.push(...result.failures);
    sources.push({ sourceId: source.id, ready: result.ready, receipt: source.rightsBasis.preflightReceipt || null });
  }
  return { ready: failures.length === 0, failures: [...new Set(failures)], warnings: [...new Set(warnings)], sources };
}
