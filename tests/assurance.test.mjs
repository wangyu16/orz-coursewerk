import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditAssurance, renderAttribution } from "../scripts/lib/assurance.mjs";
import {
  auditCoherence,
  computeComponentGraph,
  computeRevisionImpact,
  makeComponentIndex,
  recordAcceptedCoherence,
  validateRevisionReview,
  writeComponentIndex,
} from "../scripts/lib/coherence.mjs";
import { commitOutput, ensureOutputGit, outputGitState } from "../scripts/lib/output_git.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function manifest(license = "CC-BY-4.0") {
  return {
    schemaVersion: 2,
    packageId: "pending",
    title: "Test course",
    license,
    createdAt: "2026-07-13T00:00:00Z",
    chapters: [],
  };
}

function publicFoundation(sourceLicense = "CC-BY-4.0", outputLicense = sourceLicense) {
  return {
    schemaVersion: 1,
    usageProfile: "public-oer",
    audience: "public",
    access: "public-web",
    redistribution: "open-license",
    jurisdiction: "international",
    outputLicense,
    outputAuthors: [{ name: "Example Course Author", role: "author", rightsHolder: true }],
    privacy: { containsPersonalData: false, containsRestrictedContent: false },
    sources: [{
      id: "source-1",
      title: "Example Open Textbook",
      edition: "1st edition",
      publisher: "Example Publisher",
      canonicalUrl: "https://example.org/book",
      role: "primary",
      use: "adaptation",
      scope: ["chapter 1"],
      rightsBasis: {
        type: "open-license",
        license: sourceLicense,
        evidenceType: "official-publisher-page",
        evidenceUrl: "https://example.org/book/license",
        verifiedAt: "2026-07-13",
      },
      requiredAttribution: {
        textIncludes: "Source:",
        url: "https://example.org/book",
        placement: "every-public-deliverable",
      },
    }],
  };
}

function fullLicense(id = "CC-BY-4.0") {
  return fs.readFileSync(path.join(repo, "scripts", "data", "licenses", `${id}.txt`), "utf8");
}

function evidenceText(id) {
  const values = {
    "CC-BY-4.0": "Official evidence: Attribution 4.0 https://creativecommons.org/licenses/by/4.0/",
    "CC-BY-SA-4.0": "Official evidence: Attribution-ShareAlike 4.0 https://creativecommons.org/licenses/by-sa/4.0/",
    "CC-BY-NC-4.0": "Official evidence: Attribution-NonCommercial 4.0 https://creativecommons.org/licenses/by-nc/4.0/",
    "CC-BY-NC-SA-4.0": "Official evidence: Attribution-NonCommercial-ShareAlike 4.0 https://creativecommons.org/licenses/by-nc-sa/4.0/",
    "CC0-1.0": "Official evidence: CC0 1.0 https://creativecommons.org/publicdomain/zero/1.0/",
  };
  return values[id] || `Official evidence: ${id}`;
}

function attachEvidence(root, foundation) {
  for (const source of foundation.sources || []) {
    if (!["open-license", "public-domain"].includes(source.rightsBasis?.type)) continue;
    const text = evidenceText(source.rightsBasis.license);
    const rel = `metadata/evidence/${source.id}.txt`;
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
    source.rightsBasis.evidenceSnapshot = rel;
    source.rightsBasis.evidenceSha256 = crypto.createHash("sha256").update(text).digest("hex");
    source.rightsBasis.evidenceVerifiedBy = "test fixture";
    source.rightsBasis.processUseReview = { schemaVersion: 1, scannedAt: "2026-07-13T00:00:00Z", status: "no-restriction-detected", notices: [] };
  }
  return foundation;
}

function attachOpenStaxRestriction(root, foundation) {
  for (const source of foundation.sources || []) {
    const text = `${evidenceText(source.rightsBasis.license)} This book may not be used in the training of large language models or otherwise be ingested into large language models or generative AI offerings without OpenStax's permission.`;
    const rel = `metadata/evidence/${source.id}.txt`;
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
    source.rightsBasis.evidenceSnapshot = rel;
    source.rightsBasis.evidenceSha256 = crypto.createHash("sha256").update(text).digest("hex");
    source.rightsBasis.evidenceVerifiedBy = "test fixture";
    source.rightsBasis.processUseReview = { schemaVersion: 1, scannedAt: "2026-07-13T00:00:00Z", status: "blocked-pending-decision", notices: [{ id: "generative-ai-ingestion", summary: "AI ingestion restriction", excerpt: "test" }] };
    source.rightsBasis.processUseDecision = { status: "permitted", basis: "qualified-review", decidedBy: "Example Course Author", decidedAt: "2026-07-13", reference: "institutional-review-1", rationale: "A qualified institutional reviewer approved this specific noncommercial AI-assisted adaptation workflow." };
  }
  return foundation;
}

function publicFixture({ sourceLicense = "CC-BY-4.0", manifestLicense = sourceLicense, outputLicense = manifestLicense, shortLicense = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-assurance-"));
  const m = manifest(manifestLicense);
  writeJson(path.join(root, "alembic.json"), m);
  writeJson(path.join(root, "metadata", "FOUNDATION.json"), attachEvidence(root, publicFoundation(sourceLicense, outputLicense)));
  const provenance = { schemaVersion: 1, items: [] };
  writeJson(path.join(root, "metadata", "PROVENANCE.json"), provenance);
  fs.writeFileSync(path.join(root, "metadata", "ATTRIBUTION.md"), renderAttribution(provenance));
  fs.writeFileSync(path.join(root, "LICENSE"), shortLicense ? "Creative Commons Attribution 4.0 International" : fullLicense(manifestLicense));
  return { root, manifest: m };
}

function acceptCoherentState(root, message = "test: accept coherent state") {
  ensureOutputGit(root);
  const index = makeComponentIndex(computeComponentGraph(root));
  writeComponentIndex(root, index);
  const commit = commitOutput(root, message);
  recordAcceptedCoherence(root, index, commit.head, { action: "test" });
}

test("public OER passes when source, foundation, manifest, and LICENSE agree", () => {
  const f = publicFixture();
  const result = auditAssurance({ root: f.root, manifest: f.manifest });
  assert.equal(result.canPack, true);
  assert.deepEqual(result.hardFailures, []);
});

test("source/package license mismatch is release-blocking", () => {
  const f = publicFixture({ sourceLicense: "CC-BY-NC-SA-4.0", manifestLicense: "CC-BY-4.0" });
  const result = auditAssurance({ root: f.root, manifest: f.manifest });
  assert.equal(result.canPack, false);
  assert.match(result.hardFailures.join("\n"), /not compatible with package license/);
});

test("foundation output license must match manifest", () => {
  const f = publicFixture({ outputLicense: "CC-BY-NC-SA-4.0" });
  const result = auditAssurance({ root: f.root, manifest: f.manifest });
  assert.match(result.hardFailures.join("\n"), /does not match manifest license/);
});

test("short LICENSE notice is rejected", () => {
  const f = publicFixture({ shortLicense: true });
  const result = auditAssurance({ root: f.root, manifest: f.manifest });
  assert.match(result.hardFailures.join("\n"), /not the exact bundled canonical/);
});

test("human-readable package-license claims may not contradict the manifest", () => {
  const f = publicFixture();
  fs.writeFileSync(path.join(f.root, "README.md"), "This teaching package is licensed under CC BY-NC-SA 4.0.\n");
  const result = auditAssurance({ root: f.root, manifest: f.manifest });
  assert.match(result.hardFailures.join("\n"), /declared package license .* contradicts/);
});

test("known OpenStax Chemistry 2e policy rejects CC BY", () => {
  const f = publicFixture();
  const foundation = publicFoundation("CC-BY-4.0", "CC-BY-4.0");
  foundation.sources[0].id = "openstax-chemistry-2e";
  foundation.sources[0].title = "Chemistry 2e";
  foundation.sources[0].publisher = "OpenStax";
  foundation.sources[0].canonicalUrl = "https://openstax.org/books/chemistry-2e/pages/preface";
  writeJson(path.join(f.root, "metadata", "FOUNDATION.json"), attachOpenStaxRestriction(f.root, foundation));
  const result = auditAssurance({ root: f.root, manifest: f.manifest });
  assert.match(result.hardFailures.join("\n"), /requires CC-BY-NC-SA-4\.0/);
});

test("known OpenStax attribution is required in every public deliverable", () => {
  const f = publicFixture({ sourceLicense: "CC-BY-NC-SA-4.0" });
  const foundation = publicFoundation("CC-BY-NC-SA-4.0", "CC-BY-NC-SA-4.0");
  foundation.sources[0] = {
    ...foundation.sources[0],
    id: "openstax-chemistry-2e",
    title: "Chemistry 2e",
    edition: "2e",
    publisher: "OpenStax",
    canonicalUrl: "https://openstax.org/books/chemistry-2e/pages/preface",
    rightsBasis: {
      type: "open-license",
      license: "CC-BY-NC-SA-4.0",
      evidenceType: "official-publisher-page",
      evidenceUrl: "https://openstax.org/books/chemistry-2e/pages/preface",
      verifiedAt: "2026-07-13",
    },
  };
  writeJson(path.join(f.root, "metadata", "FOUNDATION.json"), attachEvidence(f.root, foundation));
  fs.mkdirSync(path.join(f.root, "study-guide"), { recursive: true });
  fs.writeFileSync(path.join(f.root, "study-guide", "ch1.md"), "# Chapter 1\nNo source footer.\n");
  const result = auditAssurance({ root: f.root, manifest: f.manifest });
  assert.match(result.hardFailures.join("\n"), /missing source-required attribution/);
});

test("known OpenStax Chemistry 2e passes with canonical license and per-deliverable attribution", () => {
  const f = publicFixture({ sourceLicense: "CC-BY-NC-SA-4.0" });
  const foundation = publicFoundation("CC-BY-NC-SA-4.0", "CC-BY-NC-SA-4.0");
  foundation.sources[0] = {
    ...foundation.sources[0],
    id: "openstax-chemistry-2e",
    title: "Chemistry 2e",
    edition: "2e",
    publisher: "OpenStax",
    canonicalUrl: "https://openstax.org/books/chemistry-2e/pages/preface",
    rightsBasis: {
      type: "open-license",
      license: "CC-BY-NC-SA-4.0",
      evidenceType: "official-publisher-page",
      evidenceUrl: "https://openstax.org/books/chemistry-2e/pages/preface",
      verifiedAt: "2026-07-13",
    },
    requiredAttribution: {
      textIncludes: "Access for free at",
      url: "https://openstax.org/books/chemistry-2e/pages/1-introduction",
      placement: "every-public-deliverable",
    },
  };
  writeJson(path.join(f.root, "metadata", "FOUNDATION.json"), attachOpenStaxRestriction(f.root, foundation));
  fs.mkdirSync(path.join(f.root, "study-guide"), { recursive: true });
  fs.writeFileSync(path.join(f.root, "study-guide", "ch1.md"), "# Chapter 1\nAccess for free at https://openstax.org/books/chemistry-2e/pages/1-introduction\n");
  const result = auditAssurance({ root: f.root, manifest: f.manifest });
  assert.equal(result.canPack, true, result.hardFailures.join("\n"));
});

test("public source requires an authoritative evidence type", () => {
  const f = publicFixture();
  const foundation = publicFoundation();
  delete foundation.sources[0].rightsBasis.evidenceType;
  writeJson(path.join(f.root, "metadata", "FOUNDATION.json"), attachEvidence(f.root, foundation));
  const result = auditAssurance({ root: f.root, manifest: f.manifest });
  assert.match(result.hardFailures.join("\n"), /authoritative evidenceType is required/);
});

test("rights evidence snapshot hash is release-blocking", () => {
  const f = publicFixture();
  fs.appendFileSync(path.join(f.root, "metadata", "evidence", "source-1.txt"), "tampered");
  const result = auditAssurance({ root: f.root, manifest: f.manifest });
  assert.match(result.hardFailures.join("\n"), /evidenceSnapshot sha256/);
});

test("an AI-ingestion restriction in authoritative evidence blocks every public release until resolved", () => {
  const f = publicFixture();
  const foundation = JSON.parse(fs.readFileSync(path.join(f.root, "metadata", "FOUNDATION.json"), "utf8"));
  const source = foundation.sources[0];
  const evidence = "Official evidence: Attribution 4.0 https://creativecommons.org/licenses/by/4.0/. This book may not be used in the training of large language models or otherwise be ingested into large language models or generative AI offerings without the publisher's permission.";
  const file = path.join(f.root, source.rightsBasis.evidenceSnapshot);
  fs.writeFileSync(file, evidence);
  source.rightsBasis.evidenceSha256 = crypto.createHash("sha256").update(evidence).digest("hex");
  source.rightsBasis.processUseReview = { schemaVersion: 1, scannedAt: "2026-07-13T00:00:00Z", status: "blocked-pending-decision", notices: [{ id: "generative-ai-ingestion" }] };
  writeJson(path.join(f.root, "metadata", "FOUNDATION.json"), foundation);
  const blocked = auditAssurance({ root: f.root, manifest: f.manifest });
  assert.match(blocked.hardFailures.join("\n"), /process-specific restriction .* blocks AI-assisted ingestion/);

  source.rightsBasis.processUseDecision = {
    status: "permitted",
    basis: "permission",
    decidedBy: "Example Course Author",
    decidedAt: "2026-07-13",
    reference: "permission-record-2026-07-13",
    rationale: "The publisher granted written permission for this specific AI-assisted course adaptation.",
  };
  writeJson(path.join(f.root, "metadata", "FOUNDATION.json"), foundation);
  const cleared = auditAssurance({ root: f.root, manifest: f.manifest });
  assert.equal(cleared.canPack, true, cleared.hardFailures.join("\n"));
});

test("process-specific source restrictions also block private AI authoring readiness", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-private-process-"));
  const foundation = publicFoundation();
  foundation.usageProfile = "personal-private";
  foundation.audience = "creator-only";
  foundation.access = "local-device";
  foundation.redistribution = "none";
  delete foundation.outputLicense;
  delete foundation.outputAuthors;
  attachEvidence(root, foundation);
  const source = foundation.sources[0];
  const evidence = `${evidenceText("CC-BY-4.0")} This material may not be ingested into a large language model or generative AI offering without permission.`;
  fs.writeFileSync(path.join(root, source.rightsBasis.evidenceSnapshot), evidence);
  source.rightsBasis.evidenceSha256 = crypto.createHash("sha256").update(evidence).digest("hex");
  source.rightsBasis.processUseReview = {
    schemaVersion: 1,
    scannedAt: "2026-07-13T00:00:00Z",
    status: "blocked-pending-decision",
    notices: [{ id: "generative-ai-ingestion", summary: "AI ingestion restriction", excerpt: "test" }],
  };
  writeJson(path.join(root, "metadata", "FOUNDATION.json"), foundation);
  writeJson(path.join(root, "metadata", "PROVENANCE.json"), { schemaVersion: 1, items: [] });
  const result = auditAssurance({ root });
  assert.match(result.privateFailures.join("\n"), /blocks AI-assisted ingestion/);
});

test("public OER requires accountable authorship and rejects an AI agent as asset creator", () => {
  const f = publicFixture();
  const foundation = JSON.parse(fs.readFileSync(path.join(f.root, "metadata", "FOUNDATION.json"), "utf8"));
  delete foundation.outputAuthors;
  writeJson(path.join(f.root, "metadata", "FOUNDATION.json"), foundation);
  let result = auditAssurance({ root: f.root, manifest: f.manifest });
  assert.match(result.hardFailures.join("\n"), /accountable output author/);

  foundation.outputAuthors = [{ name: "Example Course Author", role: "author", rightsHolder: true }];
  writeJson(path.join(f.root, "metadata", "FOUNDATION.json"), foundation);
  fs.mkdirSync(path.join(f.root, "assets"), { recursive: true });
  fs.mkdirSync(path.join(f.root, "study-guide"), { recursive: true });
  fs.writeFileSync(path.join(f.root, "assets", "ai.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
  fs.writeFileSync(path.join(f.root, "study-guide", "chapter.md"), "# Chapter\n\n![Figure](../assets/ai.svg)\n");
  const provenance = { schemaVersion: 1, items: [{ id: "ai-asset", type: "image", localPath: "assets/ai.svg", usedIn: ["study-guide/chapter.md"], title: "Figure", creator: "Coursewerk agent", attribution: "Generated by Coursewerk agent", license: "CC-BY-4.0", provenanceStatus: "self-generated", publicationStatus: "cleared" }] };
  writeJson(path.join(f.root, "metadata", "PROVENANCE.json"), provenance);
  fs.writeFileSync(path.join(f.root, "metadata", "ATTRIBUTION.md"), renderAttribution(provenance));
  result = auditAssurance({ root: f.root, manifest: f.manifest });
  assert.match(result.hardFailures.join("\n"), /original asset creator must match an accountable outputAuthors name/);
});

test("CC BY adaptation can use the explicit compatible CC BY-SA output", () => {
  const f = publicFixture({ sourceLicense: "CC-BY-4.0", manifestLicense: "CC-BY-SA-4.0", outputLicense: "CC-BY-SA-4.0" });
  const result = auditAssurance({ root: f.root, manifest: f.manifest });
  assert.equal(result.canPack, true, result.hardFailures.join("\n"));
});

test("public attribution must be generated exactly from provenance", () => {
  const f = publicFixture();
  fs.writeFileSync(path.join(f.root, "metadata", "ATTRIBUTION.md"), "# Hand-edited attribution\n");
  const result = auditAssurance({ root: f.root, manifest: f.manifest });
  assert.match(result.hardFailures.join("\n"), /does not exactly match generated structured provenance/);
});

test("incorporated assets require existing paths and usedIn locations", () => {
  const f = publicFixture();
  const provenance = { schemaVersion: 1, items: [{ id: "asset-1", type: "image", localPath: "assets/missing.png", title: "Missing", creator: "Creator", sourceUrl: "https://example.org/image", license: "CC-BY-4.0", attribution: "Creator, CC BY 4.0", provenanceStatus: "verified", publicationStatus: "cleared", usedIn: [] }] };
  writeJson(path.join(f.root, "metadata", "PROVENANCE.json"), provenance);
  fs.writeFileSync(path.join(f.root, "metadata", "ATTRIBUTION.md"), renderAttribution(provenance));
  const result = auditAssurance({ root: f.root, manifest: f.manifest });
  assert.match(result.hardFailures.join("\n"), /localPath does not exist/);
  assert.match(result.hardFailures.join("\n"), /usedIn must list/);
});

test("provenance usedIn must point to a document that actually references the asset", () => {
  const f = publicFixture();
  fs.mkdirSync(path.join(f.root, "assets"), { recursive: true });
  fs.mkdirSync(path.join(f.root, "study-guide"), { recursive: true });
  fs.writeFileSync(path.join(f.root, "assets", "figure.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n");
  fs.writeFileSync(path.join(f.root, "study-guide", "chapter.md"), "# Chapter\n\nNo figure is used here.\n");
  const provenance = { schemaVersion: 1, items: [{ id: "asset-1", type: "image", localPath: "assets/figure.svg", title: "Figure", creator: "Course author", attribution: "Course author, original figure", provenanceStatus: "self-generated", publicationStatus: "cleared", usedIn: ["study-guide/chapter.md"] }] };
  writeJson(path.join(f.root, "metadata", "PROVENANCE.json"), provenance);
  fs.writeFileSync(path.join(f.root, "metadata", "ATTRIBUTION.md"), renderAttribution(provenance));
  const result = auditAssurance({ root: f.root, manifest: f.manifest });
  assert.match(result.hardFailures.join("\n"), /does not actually reference assets\/figure\.svg/);
});

test("personal-private unknown provenance can pass private readiness but blocks publication", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-personal-"));
  writeJson(path.join(root, "metadata", "FOUNDATION.json"), {
    schemaVersion: 1,
    usageProfile: "personal-private",
    audience: "creator-only",
    access: "local-device",
    redistribution: "none",
    jurisdiction: "HK",
    outputLicense: null,
    privacy: { containsPersonalData: false, containsRestrictedContent: false },
    sources: [{
      id: "unknown-book",
      title: "Unknown course handout",
      publisher: "Unknown",
      canonicalUrl: "https://example.invalid/unknown",
      role: "primary",
      use: "reference",
      scope: ["selected pages"],
      usedIn: ["study-guide/ch1.md"],
      blockReason: "Original source and rights are unknown",
      rightsBasis: { type: "unknown" },
    }],
  });
  writeJson(path.join(root, "metadata", "PROVENANCE.json"), {
    schemaVersion: 1,
    items: [{
      id: "asset-unknown-1",
      type: "image",
      localPath: "assets/unknown.png",
      usedIn: ["study-guide/ch1.md"],
      title: "Unknown diagram",
      attribution: "Source unknown",
      provenanceStatus: "unknown",
      publicationStatus: "blocked",
      blockReason: "Original source and license are unknown",
    }],
  });
  fs.mkdirSync(path.join(root, "assets"), { recursive: true });
  fs.writeFileSync(path.join(root, "assets", "unknown.png"), "not-a-real-image");
  fs.mkdirSync(path.join(root, "study-guide"), { recursive: true });
  fs.writeFileSync(path.join(root, "study-guide", "ch1.md"), "[SOURCE-UNKNOWN: unknown-book — private source]\n\n![Unknown diagram](../assets/unknown.png)\n\n[SOURCE-UNKNOWN: asset-unknown-1 — private only]\n");
  const result = auditAssurance({ root });
  assert.deepEqual(result.privateFailures, []);
  assert.ok(result.publicationBlockers.length >= 2);
  assert.equal(result.canPack, false);
});

test("unresolved private item must be visibly labelled", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-personal-label-"));
  writeJson(path.join(root, "metadata", "FOUNDATION.json"), {
    schemaVersion: 1, usageProfile: "personal-private", audience: "creator-only", access: "local-device",
    redistribution: "none", jurisdiction: "HK", outputLicense: null,
    privacy: { containsPersonalData: false, containsRestrictedContent: false },
    sources: [{ id: "s", title: "Source", publisher: "Unknown", canonicalUrl: "https://example.invalid", role: "primary", use: "reference", scope: ["one page"], usedIn: ["study-guide/x.md"], blockReason: "Unknown", rightsBasis: { type: "unknown" } }],
  });
  writeJson(path.join(root, "metadata", "PROVENANCE.json"), {
    schemaVersion: 1,
    items: [{ id: "x", localPath: "assets/x.png", usedIn: ["study-guide/x.md"], title: "X", attribution: "Unknown", provenanceStatus: "unknown", publicationStatus: "blocked", blockReason: "Unknown" }],
  });
  fs.mkdirSync(path.join(root, "assets"), { recursive: true });
  fs.writeFileSync(path.join(root, "assets", "x.png"), "x");
  fs.mkdirSync(path.join(root, "study-guide"), { recursive: true });
  fs.writeFileSync(path.join(root, "study-guide", "x.md"), "No label\n");
  const result = auditAssurance({ root });
  assert.match(result.privateFailures.join("\n"), /must be visibly labeled/);
});

test("pack refuses a package without assurance records", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-pack-"));
  writeJson(path.join(root, "alembic.json"), manifest());
  fs.writeFileSync(path.join(root, "LICENSE"), fullLicense());
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-pack-out-"));
  const run = spawnSync(process.execPath, [path.join(repo, "scripts", "pack.mjs"), "--package", root, "--out", out], { encoding: "utf8" });
  assert.notEqual(run.status, 0);
  assert.match(`${run.stdout}\n${run.stderr}`, /release assurance failed/);
  assert.equal(fs.readdirSync(out).some((x) => x.endsWith(".zip")), false);
});

test("pack succeeds only after a valid public assurance pass", () => {
  const f = coherentChapterFixture();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-pack-valid-out-"));
  const inputs = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-pack-inputs-"));
  const sourceText = "Independent source material for comparison with distinct language and examples. ".repeat(30);
  fs.writeFileSync(path.join(inputs, "source.txt"), sourceText);
  fs.mkdirSync(path.join(inputs, ".coursewerk-source-original"), { recursive: true });
  fs.writeFileSync(path.join(inputs, ".coursewerk-source-original", "source-1.txt"), sourceText);
  const sourceHash = crypto.createHash("sha256").update(sourceText).digest("hex");
  writeJson(path.join(inputs, "SOURCE_CORPUS.json"), {
    schemaVersion: 1,
    sources: [{
      sourceId: "source-1",
      comparisonMode: "automatic",
      canonicalUrl: "https://example.org/book",
      retrievedAt: "2026-07-13T00:00:00Z",
      originalPath: ".coursewerk-source-original/source-1.txt",
      originalSha256: sourceHash,
      textPath: "source.txt",
      sha256: sourceHash,
      minimumWords: 100,
      extractor: { tool: "coursewerk", schemaVersion: 1, sourceFormat: ".txt" },
    }],
  });
  const run = spawnSync(process.execPath, [path.join(repo, "scripts", "pack.mjs"), "--package", f.root, "--out", out, "--inputs", inputs], { encoding: "utf8" });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.equal(fs.readdirSync(out).some((x) => x.endsWith(".alembic.zip")), true);
  const receiptFile = fs.readdirSync(out).find((x) => x.endsWith(".release.json"));
  const carrierReceiptFile = fs.readdirSync(out).find((x) => x.endsWith(".carriers.json"));
  const evaluationFile = fs.readdirSync(out).find((x) => x.endsWith(".evaluation.md"));
  assert.ok(receiptFile);
  assert.ok(carrierReceiptFile);
  assert.ok(evaluationFile);
  const receipt = JSON.parse(fs.readFileSync(path.join(out, receiptFile), "utf8"));
  assert.match(receipt.packageTreeHash, /^[a-f0-9]{64}$/);
  assert.match(receipt.sourceCorpusHash, /^[a-f0-9]{64}$/);
  assert.match(receipt.archiveSha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.carrierReceipt, carrierReceiptFile);
  assert.equal(receipt.carrierReceiptHash, crypto.createHash("sha256").update(fs.readFileSync(path.join(out, carrierReceiptFile))).digest("hex"));
  assert.equal(receipt.criticalTotal, 0);
});

function coherentChapterFixture() {
  const f = publicFixture();
  f.manifest.chapters = [{ slug: "ch1", title: "Chapter 1" }];
  Object.assign(f.manifest, {
    description: "A complete test course package used to exercise Coursewerk release gates.",
    keywords: ["test", "course", "education"],
    discipline: "testing",
    unitTerm: "chapter",
    courseContext: { courseName: "Test Course", level: "introductory" },
  });
  writeJson(path.join(f.root, "alembic.json"), f.manifest);
  const credit = "\nSource: https://example.org/book\n";
  const qaTabs = Array.from({ length: 10 }, (_, i) => `:::: tabs\n::: tab Q\nObjective 1: Question ${i + 1}\n:::\n::: tab Answer\nWorked answer ${i + 1}\n:::\n::::`).join("\n\n");
  const files = {
    "concepts/course.md": `# Course concepts${credit}\n## Summary\nCourse sequence.\n## Keywords\ntest, course, education\n`,
    "concepts/ch1.md": `# Chapter concepts${credit}\n## Source and Scope\nChapter 1.\n## Summary\nSummary.\n## Prerequisites\nNone.\n## Objectives\nObjective 1.\n`,
    "study-guide/ch1.md": `# Study guide${credit}\n## Chapter Learning Objectives\nObjective 1.\n## Topic\n{{mermaid graph LR\nA --> B\n}}\n\n**Visual description:** A directed arrow connects concept A to concept B, showing that A precedes B.\n\n:::: tabs\n::: tab Problem\nExample question.\n:::\n::: tab Solution\nWorked solution.\n:::\n::::\n## Synthesis\nSummary.\n`,
    "slides/ch1.md": `<!-- deck\ntitle: Chapter 1\nratio: 16:9\n-->\n<!-- slide template=title -->\n# Chapter 1${credit}\n<!-- slide template=outline -->\n# Outline\n- Objective 1\n<!-- slide -->\n## Topic\nConcept.\n<!-- slide template=closing -->\n# Summary\n`,
    "assessment-support/ch1.md": `# Assessment${credit}\n## Objective 1\nTarget understanding.\n### Question guide\nParameterized design.\n## Rubric Themes\nAccuracy.\n`,
    "practice/ch1.md": `# Practice${credit}\n${qaTabs}\n`,
  };
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(f.root, rel)), { recursive: true });
    fs.writeFileSync(path.join(f.root, rel), text);
  }
  writeJson(path.join(f.root, "metadata", "MEDIA_PLAN.json"), {
    schemaVersion: 1,
    chapters: [{
      slug: "ch1",
      realImageDecision: "not-used",
      rationale: "This synthetic test chapter has no subject matter for which a real photograph would improve understanding.",
      reviewedBy: "test fixture",
    }],
  });
  acceptCoherentState(f.root);
  return f;
}

test("editing a study guide invalidates all downstream chapter components", () => {
  const f = coherentChapterFixture();
  fs.appendFileSync(path.join(f.root, "study-guide", "ch1.md"), "Changed explanation.\n");
  const audit = auditCoherence(f.root);
  assert.ok(audit.hardFailures.length > 0);
  const impact = computeRevisionImpact(f.root);
  const paths = impact.requiredReview.map((c) => c.path);
  assert.ok(paths.includes("study-guide/ch1.md"));
  assert.ok(paths.includes("slides/ch1.md"));
  assert.ok(paths.includes("assessment-support/ch1.md"));
  assert.ok(paths.includes("practice/ch1.md"));
  assert.ok(impact.reviewContext.some((c) => c.path === "concepts/ch1.md"));
});

test("Git exposes direct edits and a manual commit cannot bypass the component index", () => {
  const f = coherentChapterFixture();
  fs.appendFileSync(path.join(f.root, "study-guide", "ch1.md"), "Direct user edit.\n");
  const dirty = outputGitState(f.root);
  assert.equal(dirty.clean, false);
  assert.ok(dirty.changes.some((change) => change.path === "study-guide/ch1.md"));

  // Users may commit their own work. Git then supplies history while the
  // accepted component hashes still prove that a coherence review is needed.
  commitOutput(f.root, "user: direct edit");
  assert.equal(outputGitState(f.root).clean, true);
  const audit = auditCoherence(f.root);
  assert.match(audit.hardFailures.join("\n"), /content changed after the last coherence review/);

  const replacement = makeComponentIndex(computeComponentGraph(f.root));
  writeComponentIndex(f.root, replacement);
  commitOutput(f.root, "user: replace content and index together");
  const anchored = auditCoherence(f.root);
  assert.match(anchored.hardFailures.join("\n"), /does not match the externally accepted index hash/);
});

test("component-index initialization creates an automatic clean Git baseline", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-index-cli-"));
  fs.writeFileSync(path.join(root, "README.md"), "# Initial coherent output\n");
  const run = spawnSync(process.execPath, [path.join(repo, "scripts", "index_components.mjs"), "--root", root, "--initialize"], { encoding: "utf8" });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const state = outputGitState(root);
  assert.ok(state.head);
  assert.equal(state.clean, true);
  assert.ok(fs.existsSync(path.join(root, "metadata", "COMPONENT_INDEX.json")));
});

test("declared chapters require all five indexed deliverable components", () => {
  const f = coherentChapterFixture();
  fs.unlinkSync(path.join(f.root, "practice", "ch1.md"));
  const audit = auditCoherence(f.root);
  assert.match(audit.hardFailures.join("\n"), /practice\/ch1\.md: declared chapter is missing/);
});

test("completed impact review permits refresh and restores coherence", () => {
  const f = coherentChapterFixture();
  fs.appendFileSync(path.join(f.root, "study-guide", "ch1.md"), "Changed explanation.\n");
  fs.appendFileSync(path.join(f.root, "slides", "ch1.md"), "Aligned slide revision.\n");
  fs.appendFileSync(path.join(f.root, "assessment-support", "ch1.md"), "Aligned assessment revision.\n");
  fs.appendFileSync(path.join(f.root, "practice", "ch1.md"), "Aligned practice revision.\n");
  const review = computeRevisionImpact(f.root);
  review.reviewed = review.requiredReview.map((c) => c.id);
  review.attestation = "Reviewed every impacted component against its upstream context.";
  const validation = validateRevisionReview(f.root, review);
  assert.deepEqual(validation.failures, []);
  acceptCoherentState(f.root, "test: reviewed coherent revision");
  assert.deepEqual(auditCoherence(f.root).hardFailures, []);
});

test("revision review becomes stale after any further edit", () => {
  const f = coherentChapterFixture();
  fs.appendFileSync(path.join(f.root, "study-guide", "ch1.md"), "First revision.\n");
  const review = computeRevisionImpact(f.root);
  review.reviewed = review.requiredReview.map((c) => c.id);
  review.attestation = "Reviewed all components before a subsequent unreviewed edit.";
  fs.appendFileSync(path.join(f.root, "slides", "ch1.md"), "Later edit.\n");
  assert.match(validateRevisionReview(f.root, review).failures.join("\n"), /stale/);
});
