// Coursewerk assurance kernel.
//
// These checks are deliberately independent of Full/Light review mode. They
// protect the foundation facts that determine whether material is safe to keep
// private, distribute, or publish: intended use, source identity/rights,
// package-license consistency, provenance, privacy, and publication clearance.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { isOpenLicense, normalizeLicense, ALL_RIGHTS_RESERVED } from "./contract.mjs";
import { scanProcessRestrictions } from "./rights_preflight.mjs";
import { auditIngestionReadiness, sourcePolicyFor } from "./pre_ingestion.mjs";

export const USAGE_PROFILES = ["personal-private", "restricted-teaching", "public-oer"];
export const RIGHTS_BASES = [
  "owned",
  "open-license",
  "public-domain",
  "permission",
  "institutional-authorization",
  "user-asserted-exception",
  "unknown",
];

const here = path.dirname(fileURLToPath(import.meta.url));
const licenseTextsFile = path.resolve(here, "../data/license-texts.json");
const licenseTexts = JSON.parse(fs.readFileSync(licenseTextsFile, "utf8")).licenses || {};
const PUBLIC_TOPS = new Set(["study-guide", "slides", "practice", "concepts", "assessment-support"]);
const MEDIA = /\.(?:png|jpe?g|webp|svg|gif|pdf|mp3|mp4|mov|wav)$/i;

const read = (f) => fs.readFileSync(f, "utf8");
const exists = (f) => fs.existsSync(f);
const norm = (p) => String(p || "").replaceAll("\\", "/").replace(/^\.\//, "");
const nonempty = (v) => typeof v === "string" && v.trim().length > 0;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const normalizeLegalText = (value) => String(value).replace(/\r\n/g, "\n").trimEnd() + "\n";

function walk(root) {
  const out = [];
  if (!exists(root)) return out;
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === ".DS_Store") continue;
    const full = path.join(root, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

function parseJson(file, failures, label) {
  if (!exists(file)) {
    failures.push(`${label} is missing (${file}).`);
    return null;
  }
  try {
    return JSON.parse(read(file));
  } catch (e) {
    failures.push(`${label} is not valid JSON: ${e.message}`);
    return null;
  }
}

function licenseFileAudit(root, expected, blockers) {
  const file = path.join(root, "LICENSE");
  if (!exists(file)) {
    blockers.push("LICENSE is missing for a public OER package.");
    return;
  }
  const text = read(file);
  if (expected === ALL_RIGHTS_RESERVED) {
    if (!/all rights reserved/i.test(text)) blockers.push("LICENSE does not identify ALL-RIGHTS-RESERVED.");
    return;
  }
  const canonical = licenseTexts[expected];
  if (!canonical) {
    blockers.push(`No bundled canonical license text is registered for ${expected}.`);
    return;
  }
  const actualHash = sha256(normalizeLegalText(text));
  if (actualHash !== canonical.normalizedSha256)
    blockers.push(`LICENSE is not the exact bundled canonical ${expected} legal text (expected sha256 ${canonical.normalizedSha256}, found ${actualHash}).`);
}

function evidenceSnapshotAudit(root, source, basis, label, publicationBlockers, warnings) {
  if (!nonempty(basis.evidenceSnapshot)) {
    publicationBlockers.push(`${label}: a local evidenceSnapshot is required for public source-rights verification.`);
    return;
  }
  const rel = norm(basis.evidenceSnapshot);
  if (path.isAbsolute(rel) || rel.split("/").includes("..") || !rel.startsWith("metadata/evidence/")) {
    publicationBlockers.push(`${label}: evidenceSnapshot must stay under metadata/evidence/.`);
    return;
  }
  const file = path.join(root, rel);
  if (!exists(file)) {
    publicationBlockers.push(`${label}: evidenceSnapshot does not exist: ${rel}.`);
    return;
  }
  const digest = sha256(fs.readFileSync(file));
  if (!/^[a-f0-9]{64}$/.test(String(basis.evidenceSha256 || "")) || digest !== basis.evidenceSha256)
    publicationBlockers.push(`${label}: evidenceSnapshot sha256 does not match the recorded evidenceSha256.`);
  const capture = basis.evidenceCapture;
  if (!capture || !["automation", "human"].includes(capture.operator?.type) || !nonempty(capture.operator?.name) ||
      !nonempty(capture.capturedAt) || !nonempty(capture.tool?.name) || !nonempty(capture.tool?.version))
    publicationBlockers.push(`${label}: structured evidenceCapture operator, timestamp, and tool/version are required.`);
  const retrieval = basis.evidenceRetrieval;
  if (!retrieval || !["network", "local-file"].includes(retrieval.captureMode) ||
      !nonempty(retrieval.retrievedAt) || !Number.isInteger(retrieval.byteLength) || retrieval.byteLength < 1 ||
      !nonempty(retrieval.tool?.name) || !nonempty(retrieval.tool?.version))
    publicationBlockers.push(`${label}: structured evidenceRetrieval mode, timestamp, byte length, and tool/version are required.`);
  if (retrieval?.captureMode === "network" &&
      (!nonempty(retrieval.requestedUrl) || !nonempty(retrieval.finalUrl) || !Number.isInteger(retrieval.httpStatus) || !nonempty(retrieval.contentType)))
    publicationBlockers.push(`${label}: network evidenceRetrieval requires requested/final URL, HTTP status, and content type.`);
  if (retrieval?.captureMode === "local-file" && !nonempty(retrieval.localFileName))
    publicationBlockers.push(`${label}: local-file evidenceRetrieval requires localFileName.`);
  if (retrieval && Number.isInteger(retrieval.byteLength) && retrieval.byteLength !== fs.statSync(file).size)
    publicationBlockers.push(`${label}: evidenceRetrieval byteLength does not match the retained snapshot.`);
  const snapshot = read(file).toLowerCase();
  const processNotices = scanProcessRestrictions(snapshot);
  if (processNotices.length) {
    const recorded = basis.processUseReview?.notices || [];
    for (const notice of processNotices) {
      if (!recorded.some((item) => item.id === notice.id))
        publicationBlockers.push(`${label}: evidenceSnapshot contains unrecorded process restriction ${notice.id}.`);
    }
    warnings.push(`${label}: separate AI/automated-use notice recorded (${processNotices.map((item) => item.id).join(", ")}); its legal effect is not determined by Coursewerk.`);
    if (!['notice-recorded', 'blocked-pending-decision'].includes(basis.processUseReview?.status))
      publicationBlockers.push(`${label}: processUseReview must record notice-recorded after deterministic evidence preflight.`);
  } else if (!['no-notice-detected', 'no-restriction-detected'].includes(basis.processUseReview?.status)) {
    publicationBlockers.push(`${label}: processUseReview must record no-notice-detected after deterministic evidence preflight.`);
  }
  const normalized = normalizeLicense(basis.license);
  const needles = {
    "CC-BY-4.0": ["attribution 4.0", "creativecommons.org/licenses/by/4.0"],
    "CC-BY-SA-4.0": ["attribution-sharealike 4.0", "creativecommons.org/licenses/by-sa/4.0"],
    "CC-BY-NC-4.0": ["attribution-noncommercial 4.0", "creativecommons.org/licenses/by-nc/4.0"],
    "CC-BY-NC-SA-4.0": ["attribution-noncommercial-sharealike 4.0", "creativecommons.org/licenses/by-nc-sa/4.0"],
    "CC0-1.0": ["cc0 1.0", "creativecommons.org/publicdomain/zero/1.0"],
  };
  if (normalized && needles[normalized] && !needles[normalized].some((needle) => snapshot.includes(needle)))
    publicationBlockers.push(`${label}: evidenceSnapshot does not contain an expected ${normalized} identifier.`);
  if (basis.type === "public-domain" && !/public domain|no known copyright|copyright expired/i.test(snapshot))
    publicationBlockers.push(`${label}: public-domain evidenceSnapshot does not state a public-domain basis.`);
}

function processPreflightAudit(root, basis, label, blockers, warnings) {
  if (!nonempty(basis.evidenceSnapshot) || !nonempty(basis.evidenceSha256)) {
    blockers.push(`${label}: process preflight requires a local evidenceSnapshot and evidenceSha256 before AI-assisted ingestion.`);
    return;
  }
  const file = path.resolve(root, norm(basis.evidenceSnapshot));
  const inside = path.relative(root, file);
  if (inside.startsWith("..") || path.isAbsolute(inside) || !exists(file)) {
    blockers.push(`${label}: process-preflight evidenceSnapshot is missing or outside the workspace.`);
    return;
  }
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== basis.evidenceSha256)
    blockers.push(`${label}: process-preflight evidenceSnapshot sha256 does not match evidenceSha256.`);
  if (!["automation", "human"].includes(basis.evidenceCapture?.operator?.type) || !nonempty(basis.evidenceCapture?.operator?.name))
    blockers.push(`${label}: structured evidenceCapture operator is required for process preflight.`);
  const notices = scanProcessRestrictions(bytes.toString("utf8"));
  const recorded = basis.processUseReview?.notices || [];
  for (const notice of notices) {
    if (!recorded.some((item) => item.id === notice.id))
      blockers.push(`${label}: evidenceSnapshot contains unrecorded process restriction ${notice.id}.`);
  }
  if (notices.length) {
    warnings.push(`${label}: separate AI/automated-use notice recorded (${notices.map((item) => item.id).join(", ")}); its legal effect is not determined by Coursewerk.`);
    if (!['notice-recorded', 'blocked-pending-decision'].includes(basis.processUseReview?.status))
      blockers.push(`${label}: processUseReview must record notice-recorded after deterministic evidence preflight.`);
  }
  if (!notices.length && !['no-notice-detected', 'no-restriction-detected'].includes(basis.processUseReview?.status))
    blockers.push(`${label}: processUseReview must record no-notice-detected after deterministic evidence preflight.`);
}

function mediaEvidenceAudit(root, item, label, publicationBlockers) {
  const evidence = item.rightsEvidence || {};
  if (!["official-media-description-page", "publisher-supplied-license-file", "official-license-metadata"].includes(evidence.evidenceType))
    publicationBlockers.push(`${label}: verified external media requires an authoritative rightsEvidence.evidenceType.`);
  if (!nonempty(evidence.evidenceUrl) || evidence.evidenceUrl !== item.sourceUrl)
    publicationBlockers.push(`${label}: rightsEvidence.evidenceUrl must match the external media sourceUrl.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(evidence.verifiedAt || "")))
    publicationBlockers.push(`${label}: rightsEvidence.verifiedAt must be YYYY-MM-DD.`);
  const rel = norm(evidence.evidenceSnapshot);
  if (!rel || path.isAbsolute(rel) || rel.split("/").includes("..") || !rel.startsWith("metadata/evidence/")) {
    publicationBlockers.push(`${label}: verified external media requires a local rights-evidence snapshot under metadata/evidence/.`);
    return;
  }
  const file = path.join(root, rel);
  if (!exists(file)) {
    publicationBlockers.push(`${label}: media rights-evidence snapshot does not exist: ${rel}.`);
    return;
  }
  const bytes = fs.readFileSync(file);
  if (!/^[a-f0-9]{64}$/.test(String(evidence.evidenceSha256 || "")) || sha256(bytes) !== evidence.evidenceSha256)
    publicationBlockers.push(`${label}: media rights-evidence snapshot sha256 is missing or stale.`);
  const capture = evidence.evidenceCapture;
  if (!capture || !["automation", "human"].includes(capture.operator?.type) || !nonempty(capture.operator?.name) ||
      !nonempty(capture.capturedAt) || !nonempty(capture.tool?.name) || !nonempty(capture.tool?.version))
    publicationBlockers.push(`${label}: media rightsEvidence requires capture operator, timestamp, and tool/version.`);
  const retrieval = evidence.evidenceRetrieval;
  if (!retrieval || !["network", "local-file"].includes(retrieval.captureMode) || !nonempty(retrieval.retrievedAt) ||
      !Number.isInteger(retrieval.byteLength) || retrieval.byteLength !== bytes.length ||
      !nonempty(retrieval.tool?.name) || !nonempty(retrieval.tool?.version))
    publicationBlockers.push(`${label}: media rightsEvidence requires valid retrieval mode, timestamp, byte length, and tool/version.`);
  if (retrieval?.captureMode === "network" &&
      (retrieval.requestedUrl !== evidence.evidenceUrl || !nonempty(retrieval.finalUrl) || !Number.isInteger(retrieval.httpStatus) || !nonempty(retrieval.contentType)))
    publicationBlockers.push(`${label}: network media evidence requires requested/final URL, HTTP status, and content type.`);
  if (retrieval?.captureMode === "local-file" && (!nonempty(retrieval.localFileName) || retrieval.claimedEvidenceUrl !== evidence.evidenceUrl))
    publicationBlockers.push(`${label}: local-file media evidence requires localFileName and a matching claimedEvidenceUrl.`);
  const snapshot = bytes.toString("utf8").toLowerCase();
  const normalized = normalizeLicense(item.license);
  const markers = {
    "CC-BY-4.0": ["attribution 4.0", "creativecommons.org/licenses/by/4.0"],
    "CC-BY-SA-4.0": ["attribution-sharealike 4.0", "attribution-share alike 4.0", "creativecommons.org/licenses/by-sa/4.0"],
    "CC-BY-NC-4.0": ["attribution-noncommercial 4.0", "creativecommons.org/licenses/by-nc/4.0"],
    "CC-BY-NC-SA-4.0": ["attribution-noncommercial-sharealike 4.0", "creativecommons.org/licenses/by-nc-sa/4.0"],
    "CC0-1.0": ["cc0 1.0", "creativecommons.org/publicdomain/zero/1.0"],
  };
  if (normalized && markers[normalized] && !markers[normalized].some((marker) => snapshot.includes(marker)))
    publicationBlockers.push(`${label}: media evidence does not contain an expected ${normalized} identifier.`);
  if (/public[ -]?domain/i.test(String(item.license || "")) && !/public domain|work of the .*government|no known copyright/i.test(snapshot))
    publicationBlockers.push(`${label}: media evidence does not state the recorded public-domain basis.`);
}

export function compatibleOutputLicenses(sourceLicense) {
  const matrix = {
    "CC-BY-4.0": ["CC-BY-4.0", "CC-BY-SA-4.0"],
    "CC-BY-SA-4.0": ["CC-BY-SA-4.0"],
    "CC-BY-NC-4.0": ["CC-BY-NC-4.0", "CC-BY-NC-SA-4.0"],
    "CC-BY-NC-SA-4.0": ["CC-BY-NC-SA-4.0"],
    "CC0-1.0": ["CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-NC-4.0", "CC-BY-NC-SA-4.0", "CC0-1.0"],
  };
  return matrix[normalizeLicense(sourceLicense)] || [];
}

function declaredPackageLicenseAudit(root, expected, blockers) {
  const candidates = [path.join(root, "README.md"), ...walk(root).filter((f) => f.endsWith(".md"))];
  const seen = new Set();
  const token = /CC[ -]BY(?:[ -]NC)?(?:[ -]SA)?[ -]4\.0|CC0[ -]1\.0|ALL[ -]RIGHTS[ -]RESERVED/ig;
  for (const file of candidates) {
    if (!exists(file) || seen.has(file)) continue;
    seen.add(file);
    for (const [i, line] of read(file).split(/\r?\n/).entries()) {
      if (!/(package license|this (?:teaching )?package.{0,50}licen|^\s*Licensed\b)/i.test(line)) continue;
      for (const match of line.matchAll(token)) {
        const actual = normalizeLicense(match[0]);
        if (actual && actual !== expected) {
          blockers.push(`${norm(path.relative(root, file))}:${i + 1}: declared package license ${actual} contradicts ${expected}.`);
        }
      }
    }
  }
}

function requireAttributionEverywhere(root, required, blockers) {
  if (!required || required.placement !== "every-public-deliverable") return;
  const files = walk(root).filter((f) => {
    const rel = norm(path.relative(root, f));
    return f.endsWith(".md") && PUBLIC_TOPS.has(rel.split("/")[0]);
  });
  for (const file of files) {
    const text = read(file);
    const missingText = required.textIncludes && !text.includes(required.textIncludes);
    const missingUrl = required.url && !text.includes(required.url);
    const missingLicenseUrl = required.licenseUrl && !text.includes(required.licenseUrl);
    const missingChangeNotice = required.modificationNotice && !text.includes(required.modificationNotice);
    if (missingText || missingUrl || missingLicenseUrl || missingChangeNotice) {
      blockers.push(`${norm(path.relative(root, file))}: missing source-required attribution for every public deliverable.`);
    }
  }
}

function auditSource(source, index, foundation, manifestLicense, privateFailures, publicationBlockers, warnings) {
  const label = `source[${index}]`;
  if (!nonempty(source?.id)) privateFailures.push(`${label}: id is required.`);
  if (!nonempty(source?.title)) privateFailures.push(`${label}: exact title is required.`);
  if (!nonempty(source?.publisher) && !["owned", "unknown"].includes(source?.rightsBasis?.type))
    privateFailures.push(`${label}: publisher/rights holder is required.`);
  if (!nonempty(source?.canonicalUrl) && !["owned", "unknown"].includes(source?.rightsBasis?.type))
    privateFailures.push(`${label}: canonical source URL is required.`);
  if (!Array.isArray(source?.scope) || source.scope.length === 0)
    privateFailures.push(`${label}: scope must identify the chapters/sections/material used.`);
  if (!["primary", "supplemental", "asset"].includes(source?.role))
    privateFailures.push(`${label}: role must be primary, supplemental, or asset.`);
  if (!["adaptation", "reference", "excerpt"].includes(source?.use))
    privateFailures.push(`${label}: use must be adaptation, reference, or excerpt.`);
  if (foundation.usageProfile === "public-oer" && source?.role === "primary" &&
      !nonempty(source.edition) && !nonempty(source.version) && !nonempty(source.publicationDate))
    publicationBlockers.push(`${label}: exact edition, version, or publicationDate is required for a public primary source.`);

  const basis = source?.rightsBasis || {};
  const nonPublished = foundation.usageProfile !== "public-oer";
  const rightsReadiness = nonPublished ? warnings : privateFailures;
  if (!RIGHTS_BASES.includes(basis.type)) rightsReadiness.push(`${label}: valid rightsBasis.type is unrecorded.`);
  if (["owned", "user-asserted-exception", "institutional-authorization"].includes(basis.type) && basis.attestedByUser !== true)
    rightsReadiness.push(`${label}: ${basis.type} lacks explicit user attestation.`);
  if (basis.type === "user-asserted-exception" && !nonempty(foundation.jurisdiction))
    rightsReadiness.push(`${label}: a jurisdiction is unrecorded for the asserted copyright exception.`);
  if (basis.type === "permission" && !nonempty(basis.permissionReference))
    rightsReadiness.push(`${label}: permissionReference is unrecorded.`);
  if (["permission", "institutional-authorization"].includes(basis.type) && foundation.usageProfile === "public-oer") {
    if (basis.allowsPublicDistribution !== true)
      publicationBlockers.push(`${label}: ${basis.type} must explicitly allow public distribution.`);
    if (source.use === "adaptation" && basis.allowsAdaptation !== true)
      publicationBlockers.push(`${label}: ${basis.type} must explicitly allow adaptation.`);
    if (!Array.isArray(basis.allowedOutputLicenses) ||
        (!basis.allowedOutputLicenses.includes("any") && !basis.allowedOutputLicenses.includes(manifestLicense)))
      publicationBlockers.push(`${label}: ${basis.type} must explicitly allow output license ${manifestLicense || "unknown"}.`);
  }
  if (["open-license", "public-domain"].includes(basis.type)) {
    if (!nonempty(basis.license)) publicationBlockers.push(`${label}: verified source license is required.`);
    if (!nonempty(basis.evidenceUrl) || !nonempty(basis.verifiedAt))
      publicationBlockers.push(`${label}: official license evidence URL and verifiedAt date are required.`);
    if (!['official-publisher-page', 'publisher-supplied-license-file', 'official-license-metadata'].includes(basis.evidenceType))
      publicationBlockers.push(`${label}: authoritative evidenceType is required; model memory/search snippets are not evidence.`);
    if (basis.verifiedAt && !/^\d{4}-\d{2}-\d{2}$/.test(basis.verifiedAt))
      publicationBlockers.push(`${label}: verifiedAt must be YYYY-MM-DD.`);
    if (/CC-BY/i.test(String(basis.license || "")) && !source.requiredAttribution)
      publicationBlockers.push(`${label}: attribution text/URL/placement obligations must be recorded.`);
    evidenceSnapshotAudit(
      foundation.__root,
      source,
      basis,
      label,
      foundation.usageProfile === "public-oer" ? publicationBlockers : warnings,
      warnings,
    );
    if (basis.type === "open-license" && !normalizeLicense(basis.license))
      publicationBlockers.push(`${label}: source license ${basis.license || "unknown"} is not yet supported by the compatibility registry.`);
    if (basis.type === "public-domain" && String(basis.license).toUpperCase() !== "PUBLIC-DOMAIN")
      publicationBlockers.push(`${label}: public-domain rights must use license/status PUBLIC-DOMAIN, not CC0.`);
  }
  if (["permission", "institutional-authorization", "user-asserted-exception"].includes(basis.type))
    processPreflightAudit(foundation.__root, basis, label, nonPublished ? warnings : privateFailures, warnings);
  if (["unknown", "user-asserted-exception"].includes(basis.type))
    publicationBlockers.push(`${label}: rights basis ${basis.type} is not cleared for public distribution.`);
  if (basis.type === "unknown") {
    if (!nonempty(source.blockReason)) privateFailures.push(`${label}: unknown source requires blockReason.`);
    if (!Array.isArray(source.usedIn) || source.usedIn.length === 0) {
      privateFailures.push(`${label}: unknown source requires usedIn locations so labels can be verified.`);
    } else {
      for (const used of source.usedIn) {
        const file = path.resolve(foundation.__root, norm(used));
        const inside = path.relative(foundation.__root, file);
        if (inside.startsWith("..") || path.isAbsolute(inside) || !exists(file)) {
          privateFailures.push(`${label}: usedIn path is missing or outside the workspace: ${used}.`);
          continue;
        }
        if (!read(file).includes(`[SOURCE-UNKNOWN: ${source.id}`))
          privateFailures.push(`${used}: unknown source ${source.id} must be visibly labelled.`);
      }
    }
  }

  const policy = sourcePolicyFor(source);
  if (policy) {
    const actual = normalizeLicense(basis.license);
    if (actual !== policy.license)
      publicationBlockers.push(`${label}: known-source policy ${policy.id} requires ${policy.license}, found ${basis.license || "none"}.`);
    if (basis.evidenceUrl && basis.evidenceUrl !== policy.licenseEvidenceUrl)
      publicationBlockers.push(`${label}: license evidence must use the canonical ${policy.id} evidence URL.`);
    for (const noticeId of policy.expectedProcessNoticeIds || []) {
      if (!(basis.processUseReview?.notices || []).some((notice) => notice.id === noticeId))
        publicationBlockers.push(`${label}: known-source policy ${policy.id} expects process notice ${noticeId}; refresh and preflight the authoritative evidence before ingestion.`);
    }
    if (policy.authoringPreference === "avoid")
      warnings.push(`${label}: Coursewerk prefers another source (${policy.id}) when practical: ${policy.authoringPreferenceRationale || "access/use risk"} This does not block private use or publication.`);
    if (policy.attributionMode === "wikipedia-page-link-change-notice") {
      const required = source.requiredAttribution || {};
      if (required.url !== source.canonicalUrl || !/Wikipedia contributors/i.test(String(required.textIncludes || "")) ||
          required.licenseUrl !== "https://creativecommons.org/licenses/by-sa/4.0/" || !nonempty(required.modificationNotice))
        publicationBlockers.push(`${label}: Wikipedia reuse requires contributor credit, the reused page URL, CC BY-SA 4.0 link, and a modification notice.`);
    }
    requireAttributionEverywhere(foundation.__root, policy.requiredAttribution, publicationBlockers);
  }
  requireAttributionEverywhere(foundation.__root, source.requiredAttribution, publicationBlockers);

  if (foundation.usageProfile === "public-oer") {
    if (["unknown", "user-asserted-exception"].includes(basis.type)) return;
    if (basis.type === "open-license" && source.use === "adaptation" && source.role !== "asset") {
      const sourceLicense = normalizeLicense(basis.license);
      if (!sourceLicense || !compatibleOutputLicenses(sourceLicense).includes(manifestLicense))
        publicationBlockers.push(`${label}: adapted source license ${sourceLicense || "unknown"} is not compatible with package license ${manifestLicense || "unknown"}.`);
    }
  }
}

function auditProvenance(root, provenance, usageProfile, privateFailures, publicationBlockers) {
  if (!provenance) return;
  if (provenance.schemaVersion !== 1) privateFailures.push("PROVENANCE.json: schemaVersion must be 1.");
  const items = Array.isArray(provenance.items) ? provenance.items : [];
  if (!Array.isArray(provenance.items)) privateFailures.push("PROVENANCE.json: items must be an array.");
  const byPath = new Map();
  const ids = new Set();
  for (const [i, item] of items.entries()) {
    const label = `provenance.items[${i}]`;
    if (!nonempty(item.id)) privateFailures.push(`${label}: id is required.`);
    else if (ids.has(item.id)) privateFailures.push(`${label}: duplicate id ${item.id}.`);
    else ids.add(item.id);
    if (!nonempty(item.localPath)) privateFailures.push(`${label}: localPath is required.`);
    else if (path.isAbsolute(item.localPath) || norm(item.localPath).split("/").includes(".."))
      privateFailures.push(`${label}: localPath must stay inside the workspace.`);
    else {
      const local = norm(item.localPath);
      const key = local.replace(/^assets\//, "");
      if (byPath.has(key)) privateFailures.push(`${label}: duplicate localPath ${item.localPath}.`);
      else byPath.set(key, item);
      const localFile = path.join(root, local);
      if (!exists(localFile)) privateFailures.push(`${label}: localPath does not exist: ${item.localPath}.`);
    }
    if (!nonempty(item.title)) privateFailures.push(`${label}: title/description is required.`);
    if (!["verified", "self-generated", "user-owned", "incomplete", "unknown"].includes(item.provenanceStatus))
      privateFailures.push(`${label}: invalid provenanceStatus.`);
    if (!['cleared', 'private-only', 'blocked'].includes(item.publicationStatus))
      privateFailures.push(`${label}: invalid publicationStatus.`);
    if (!Array.isArray(item.usedIn) || item.usedIn.length === 0) privateFailures.push(`${label}: usedIn must list every incorporating document.`);
    for (const used of Array.isArray(item.usedIn) ? item.usedIn : []) {
      const file = path.resolve(root, norm(used));
      const inside = path.relative(root, file);
      if (inside.startsWith("..") || path.isAbsolute(inside) || !exists(file))
        privateFailures.push(`${label}: usedIn path is missing or outside the workspace: ${used}.`);
      else if (nonempty(item.localPath)) {
        const usedRel = norm(path.relative(root, file));
        const local = norm(item.localPath);
        const relativeReference = path.posix.relative(path.posix.dirname(usedRel), local);
        const text = read(file);
        const candidates = [local, relativeReference, `./${relativeReference}`, `/${local}`].map((value) => encodeURI(value));
        if (![local, relativeReference, `./${relativeReference}`, `/${local}`, ...candidates].some((reference) => text.includes(reference)))
          privateFailures.push(`${label}: ${used} does not actually reference ${item.localPath}.`);
      }
    }

    const unresolved = ["incomplete", "unknown"].includes(item.provenanceStatus) || item.publicationStatus !== "cleared";
    if (unresolved) {
      if (!nonempty(item.blockReason)) privateFailures.push(`${label}: unresolved/private-only items require blockReason.`);
      publicationBlockers.push(`${label} (${item.id || "no id"}): ${item.blockReason || "not cleared for publication"}.`);
      for (const used of Array.isArray(item.usedIn) ? item.usedIn : []) {
        const file = path.resolve(root, norm(used));
        const inside = path.relative(root, file);
        if (inside.startsWith("..") || path.isAbsolute(inside) || !exists(file)) {
          privateFailures.push(`${label}: usedIn path is missing or outside the workspace: ${used}.`);
          continue;
        }
        const text = read(file);
        if (!text.includes(`Provenance ID: ${item.id}`) && !text.includes(`[SOURCE-UNKNOWN: ${item.id}`))
          privateFailures.push(`${used}: unresolved item ${item.id} must be visibly labeled with its provenance ID.`);
      }
    }
    if (["verified", "self-generated", "user-owned"].includes(item.provenanceStatus)) {
      if (!nonempty(item.attribution)) privateFailures.push(`${label}: known items require attribution, including self-generated credit.`);
      if (item.provenanceStatus === "verified" && !nonempty(item.sourceUrl))
        privateFailures.push(`${label}: verified external items require sourceUrl.`);
      if (item.provenanceStatus === "verified" && item.publicationStatus === "cleared" && !nonempty(item.license))
        publicationBlockers.push(`${label}: externally sourced items marked cleared require an explicit license/public-domain status.`);
      if (item.provenanceStatus === "verified" && item.publicationStatus === "cleared" && usageProfile === "public-oer")
        mediaEvidenceAudit(root, item, label, publicationBlockers);
    }
  }

  const assets = walk(path.join(root, "assets")).filter((f) => MEDIA.test(f));
  for (const asset of assets) {
    const rel = norm(path.relative(path.join(root, "assets"), asset));
    if (!byPath.has(rel)) privateFailures.push(`assets/${rel}: missing structured provenance record.`);
  }
  for (const [asset, item] of byPath) {
    if (!assets.some((f) => norm(path.relative(path.join(root, "assets"), f)) === asset))
      privateFailures.push(`${item.localPath}: provenance record points to an asset that is not present.`);
  }
}

function attributionCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}

export function renderAttribution(provenance) {
  const items = (provenance?.items || []).filter((item) => item.publicationStatus === "cleared").slice().sort((a, b) => String(a.localPath).localeCompare(String(b.localPath)));
  const lines = [
    "# Attribution",
    "",
    "Generated from `metadata/PROVENANCE.json`; do not edit independently.",
    "",
    "| Asset | Title | Creator | Source | License/status | Attribution | Used in |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const item of items) {
    const source = item.sourceUrl ? `[source](${item.sourceUrl})` : "—";
    lines.push(`| \`${attributionCell(item.localPath)}\` | ${attributionCell(item.title)} | ${attributionCell(item.creator)} | ${source} | ${attributionCell(item.license || item.provenanceStatus)} | ${attributionCell(item.attribution)} | ${attributionCell((item.usedIn || []).join(", "))} |`);
  }
  return lines.join("\n") + "\n";
}

function attributionMirrorAudit(root, provenance, usageProfile, privateFailures, publicationBlockers) {
  if (usageProfile !== "public-oer") return;
  const file = path.join(root, "metadata", "ATTRIBUTION.md");
  const expected = renderAttribution(provenance);
  if (!exists(file)) {
    publicationBlockers.push("metadata/ATTRIBUTION.md is missing; generate it from PROVENANCE.json.");
    return;
  }
  if (read(file) !== expected) publicationBlockers.push("metadata/ATTRIBUTION.md does not exactly match generated structured provenance.");
}

/**
 * Audit a Coursewerk root. A publishable Alembic package and a personal workspace
 * use the same kernel but receive different release decisions.
 */
export function auditAssurance({ root, manifest = null }) {
  root = path.resolve(root);
  const privateFailures = [];
  const publicationBlockers = [];
  const warnings = [];
  const foundationFile = path.join(root, "metadata", "FOUNDATION.json");
  const provenanceFile = path.join(root, "metadata", "PROVENANCE.json");
  const foundation = parseJson(foundationFile, privateFailures, "metadata/FOUNDATION.json");
  const provenance = parseJson(provenanceFile, privateFailures, "metadata/PROVENANCE.json");
  if (!foundation) return { usageProfile: null, ingestionFailures: privateFailures, ingestionReady: false, authoringReady: false, privateFailures, publicationBlockers, warnings, hardFailures: privateFailures, canPack: false };
  foundation.__root = root;
  const ingestion = auditIngestionReadiness(root, foundation);
  warnings.push(...(ingestion.warnings || []));

  if (foundation.schemaVersion !== 1) privateFailures.push("FOUNDATION.json: schemaVersion must be 1.");
  if (!USAGE_PROFILES.includes(foundation.usageProfile)) privateFailures.push("FOUNDATION.json: invalid usageProfile.");
  if (!nonempty(foundation.audience)) privateFailures.push("FOUNDATION.json: audience is required.");
  if (!nonempty(foundation.access)) privateFailures.push("FOUNDATION.json: access condition is required.");
  if (!nonempty(foundation.redistribution)) privateFailures.push("FOUNDATION.json: redistribution condition is required.");
  if (!foundation.privacy || typeof foundation.privacy.containsPersonalData !== "boolean" ||
      typeof foundation.privacy.containsRestrictedContent !== "boolean")
    privateFailures.push("FOUNDATION.json: privacy must explicitly state containsPersonalData and containsRestrictedContent as booleans.");
  const isPublic = foundation.usageProfile === "public-oer";
  const isAlembic = Boolean(manifest || exists(path.join(root, "alembic.json")));
  if (!isPublic && isAlembic)
    privateFailures.push(`${foundation.usageProfile} material must not be placed in a publishable Alembic package.`);
  if (foundation.usageProfile === "personal-private" &&
      (foundation.access !== "local-device" || foundation.redistribution !== "none"))
    privateFailures.push("personal-private requires access=local-device and redistribution=none.");
  if (foundation.usageProfile === "restricted-teaching" &&
      (foundation.access === "public-web" || foundation.redistribution === "open-license"))
    privateFailures.push("restricted-teaching must use genuinely restricted access and redistribution.");
  if (isPublic && (foundation.access !== "public-web" || foundation.redistribution !== "open-license"))
    publicationBlockers.push("public-oer requires access=public-web and redistribution=open-license.");
  if (isPublic && !isAlembic) publicationBlockers.push("Public OER requires an Alembic manifest.");
  if (isPublic && foundation.privacy?.containsPersonalData !== false)
    publicationBlockers.push("Public OER must explicitly assert containsPersonalData=false.");
  if (isPublic && foundation.privacy?.containsRestrictedContent !== false)
    publicationBlockers.push("Public OER must explicitly assert containsRestrictedContent=false.");
  if (isPublic) {
    const authors = Array.isArray(foundation.outputAuthors) ? foundation.outputAuthors : [];
    if (!authors.length) publicationBlockers.push("Public OER requires at least one accountable output author or rights-holding institution in outputAuthors.");
    for (const [index, author] of authors.entries()) {
      if (!nonempty(author?.name) || !nonempty(author?.role)) publicationBlockers.push(`outputAuthors[${index}] requires name and role.`);
      if (/\b(?:coursewerk|AI|agent|language model)\b/i.test(String(author?.name || "")))
        publicationBlockers.push(`outputAuthors[${index}]: an AI/tool name cannot be the accountable public author or rights holder.`);
      if (/\b(?:replace(?:-with)?|placeholder|temporary|trial maintainer|pending|unassigned|tbd|unknown)\b/i.test(`${author?.name || ""} ${author?.role || ""}`))
        publicationBlockers.push(`outputAuthors[${index}]: placeholder or temporary public identities are not releaseable.`);
      if (author?.accountabilityConfirmedByUser !== true)
        publicationBlockers.push(`outputAuthors[${index}]: accountabilityConfirmedByUser=true is required for the named public author or institution.`);
      if (typeof author?.rightsHolder !== "boolean")
        publicationBlockers.push(`outputAuthors[${index}]: rightsHolder must be recorded explicitly as true or false.`);
    }
  }

  const manifestLicense = normalizeLicense(manifest?.license);
  const outputLicense = normalizeLicense(foundation.outputLicense);
  if (isPublic) {
    if (!outputLicense || !isOpenLicense(outputLicense)) publicationBlockers.push("Public OER requires a verified open outputLicense.");
    if (!manifestLicense || outputLicense !== manifestLicense)
      publicationBlockers.push(`FOUNDATION outputLicense ${outputLicense || "unknown"} does not match manifest license ${manifestLicense || "unknown"}.`);
    if (manifestLicense) {
      licenseFileAudit(root, manifestLicense, publicationBlockers);
      declaredPackageLicenseAudit(root, manifestLicense, publicationBlockers);
    }
  } else if (foundation.outputLicense && outputLicense !== ALL_RIGHTS_RESERVED) {
    privateFailures.push("Private/restricted material must not claim an open output license.");
  }

  const sources = Array.isArray(foundation.sources) ? foundation.sources : [];
  if (!Array.isArray(foundation.sources) || sources.length === 0) privateFailures.push("FOUNDATION.json: at least one source record is required.");
  const primaryIds = sources.filter((s) => s.role === "primary").map((s) => s.id).filter(Boolean);
  if (primaryIds.length > 1) {
    if (!Array.isArray(foundation.sourcePrecedence) || foundation.sourcePrecedence.length === 0) {
      privateFailures.push("FOUNDATION.json: multiple primary sources require sourcePrecedence.");
    } else if (new Set(foundation.sourcePrecedence).size !== primaryIds.length ||
               primaryIds.some((id) => !foundation.sourcePrecedence.includes(id))) {
      privateFailures.push("FOUNDATION.json: sourcePrecedence must list every primary source exactly once.");
    }
  }
  sources.forEach((s, i) => auditSource(s, i, foundation, manifestLicense, privateFailures, publicationBlockers, warnings));
  auditProvenance(root, provenance, foundation.usageProfile, privateFailures, publicationBlockers);
  if (isPublic && provenance) {
    const accountable = new Set((foundation.outputAuthors || []).map((author) => author.name));
    for (const [index, item] of (provenance.items || []).entries()) {
      if (["self-generated", "user-owned"].includes(item.provenanceStatus) &&
          (!accountable.has(item.creator) || /\b(?:coursewerk|AI|agent|language model)\b/i.test(String(item.creator || ""))))
        publicationBlockers.push(`provenance.items[${index}]: original asset creator must match an accountable outputAuthors name, not an AI/tool identity.`);
    }
  }
  attributionMirrorAudit(root, provenance, foundation.usageProfile, privateFailures, publicationBlockers);
  delete foundation.__root;

  const hardFailures = [...new Set([...ingestion.failures, ...privateFailures, ...(isPublic ? publicationBlockers : [])])];
  return {
    usageProfile: foundation.usageProfile,
    ingestionFailures: ingestion.failures,
    ingestionReady: ingestion.ready,
    authoringReady: ingestion.ready && privateFailures.length === 0,
    privateFailures,
    publicationBlockers,
    warnings,
    hardFailures,
    canPack: isPublic && hardFailures.length === 0,
    foundation,
    provenance,
  };
}
