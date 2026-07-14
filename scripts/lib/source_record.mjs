import fs from "node:fs";
import path from "node:path";

export const SOURCE_RECORD_PATH = "metadata/SOURCE_RECORD.json";

export function findDuplicateSourceEntry(entries, candidate) {
  for (const entry of entries || []) {
    if (!entry || entry.sourceId === candidate?.sourceId) continue;
    if (candidate?.sha256 && entry.sha256 === candidate.sha256) return { sourceId: entry.sourceId, match: "text-sha256" };
    if (Number.isInteger(candidate?.retrieval?.pageId) && entry.retrieval?.pageId === candidate.retrieval.pageId)
      return { sourceId: entry.sourceId, match: "wikipedia-page-id" };
    if (Number.isInteger(candidate?.retrieval?.revisionId) && entry.retrieval?.revisionId === candidate.retrieval.revisionId)
      return { sourceId: entry.sourceId, match: "wikipedia-revision-id" };
  }
  return null;
}

function compactEntry(entry) {
  if (entry.comparisonMode === "human-attested") {
    return {
      sourceId: entry.sourceId,
      comparisonMode: "human-attested",
      attestedBy: entry.attestedBy || null,
      attestedAt: entry.attestedAt || null,
      reason: entry.reason || null,
    };
  }
  return {
    sourceId: entry.sourceId,
    comparisonMode: "automatic",
    canonicalUrl: entry.canonicalUrl || null,
    retrievedAt: entry.retrievedAt || null,
    extractor: entry.extractor || null,
    originalSha256: entry.originalSha256 || null,
    textSha256: entry.sha256 || null,
    wordCount: Number.isInteger(entry.wordCount) ? entry.wordCount : null,
    retrieval: entry.retrieval || null,
  };
}

export function makeSourceRecord(corpusManifest) {
  return {
    schemaVersion: 1,
    sources: (corpusManifest?.sources || [])
      .map(compactEntry)
      .sort((a, b) => String(a.sourceId).localeCompare(String(b.sourceId))),
  };
}

export function writeSourceRecord(root, corpusManifest) {
  const file = path.join(path.resolve(root), SOURCE_RECORD_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(makeSourceRecord(corpusManifest), null, 2) + "\n");
  return file;
}

export function auditSourceRecord(root, corpusManifest) {
  const file = path.join(path.resolve(root), SOURCE_RECORD_PATH);
  if (!fs.existsSync(file)) {
    return { ready: false, failures: [`${SOURCE_RECORD_PATH} is missing; generate the compact public revision record.`], record: null };
  }
  let actual;
  try { actual = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { return { ready: false, failures: [`${SOURCE_RECORD_PATH} is invalid JSON: ${error.message}`], record: null }; }
  const expected = makeSourceRecord(corpusManifest);
  const failures = JSON.stringify(actual) === JSON.stringify(expected)
    ? []
    : [`${SOURCE_RECORD_PATH} is stale or does not exactly mirror inputs/SOURCE_CORPUS.json.`];
  return { ready: failures.length === 0, failures, record: actual, expected };
}
