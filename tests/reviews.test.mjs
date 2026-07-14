import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditKeyFactReview, makeKeyFactBindings } from "../scripts/lib/key_fact_review.mjs";
import { auditVisualReview, carrierReviewRecords, verifyVisualReviewAgainstCarrierReceipt } from "../scripts/lib/visual_review.mjs";

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n"); };

function keyFactFixture(chapters = ["one"]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-key-fact-review-"));
  const foundation = { schemaVersion: 1, sources: [{ id: "source-1" }] };
  writeJson(path.join(root, "alembic.json"), { schemaVersion: 2, license: "CC-BY-4.0", chapters: chapters.map((slug) => ({ slug, title: slug })) });
  fs.writeFileSync(path.join(root, "LICENSE"), "fixture license\n");
  writeJson(path.join(root, "metadata", "FOUNDATION.json"), foundation);
  writeJson(path.join(root, "metadata", "PROVENANCE.json"), { schemaVersion: 1, items: [] });
  fs.writeFileSync(path.join(root, "metadata", "ATTRIBUTION.md"), "# Attribution\n");
  writeJson(path.join(root, "metadata", "SOURCE_RECORD.json"), { schemaVersion: 1, sources: [] });
  for (const slug of chapters) {
    fs.mkdirSync(path.join(root, "study-guide"), { recursive: true });
    fs.writeFileSync(path.join(root, "study-guide", `${slug}.md`), `# ${slug}\n\nEvidence-based teaching content.\n`);
  }
  const review = {
    schemaVersion: 1,
    mode: "light",
    reviewKind: "same-model-independent-pass",
    authoringSystem: "fixture model",
    authoringModelId: "fixture-model-v1",
    reviewer: { type: "ai", name: "fixture model", modelId: "fixture-model-v1" },
    independence: { separatePass: true, contextReset: true, approach: "A fresh context reviewed the completed materials independently after drafting ended." },
    reviewedAt: "2026-07-14",
    bindings: makeKeyFactBindings(root),
    checks: ["accountable-identity", "source-identity-version", "source-license-evidence", "external-media-rights", "output-license-compatibility", "attribution-obligations", "scientific-key-facts"].map((id) => ({ id, status: "passed", note: `The separate pass reviewed ${id} against the current bound records and teaching materials.` })),
    keyFacts: [{ id: "fact-one", claim: "A representative chapter claim.", status: "verified", evidenceSourceIds: ["source-1"], usedIn: ["study-guide/one.md"], note: "The claim was traced independently to source-1 and checked in the chapter study guide." }],
  };
  writeJson(path.join(root, "metadata", "KEY_FACT_REVIEW.json"), review);
  return { root, foundation, review };
}

test("Light review requires a separate context-reset pass and current license bindings", () => {
  const fixture = keyFactFixture();
  assert.equal(auditKeyFactReview(fixture.root, fixture.foundation).ready, true);
  fixture.review.independence.contextReset = false;
  writeJson(path.join(fixture.root, "metadata", "KEY_FACT_REVIEW.json"), fixture.review);
  assert.match(auditKeyFactReview(fixture.root, fixture.foundation).failures.join("\n"), /contextReset=true/);

  fixture.review.independence.contextReset = true;
  writeJson(path.join(fixture.root, "metadata", "KEY_FACT_REVIEW.json"), fixture.review);
  fs.appendFileSync(path.join(fixture.root, "LICENSE"), "changed after review\n");
  assert.match(auditKeyFactReview(fixture.root, fixture.foundation).failures.join("\n"), /bindings are stale/);
});

test("every declared public chapter needs a source-traced key fact", () => {
  const fixture = keyFactFixture(["one", "two"]);
  const audit = auditKeyFactReview(fixture.root, fixture.foundation);
  assert.equal(audit.ready, false);
  assert.match(audit.failures.join("\n"), /chapter two requires at least one reviewed key fact/);
});

test("Full review requires a different reviewer system", () => {
  const fixture = keyFactFixture();
  fixture.review.mode = "full";
  fixture.review.reviewKind = "cross-model";
  writeJson(path.join(fixture.root, "metadata", "KEY_FACT_REVIEW.json"), fixture.review);
  assert.match(auditKeyFactReview(fixture.root, fixture.foundation).failures.join("\n"), /reviewer\/model must differ/);
  fixture.review.reviewer.name = "independent reviewer model";
  fixture.review.reviewer.modelId = "independent-reviewer-model-v2";
  writeJson(path.join(fixture.root, "metadata", "KEY_FACT_REVIEW.json"), fixture.review);
  assert.equal(auditKeyFactReview(fixture.root, fixture.foundation).ready, true);
});

test("visual review binds source, local asset, and stable rebuilt carrier fingerprint", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-visual-review-"));
  fs.mkdirSync(path.join(root, "study-guide"), { recursive: true });
  fs.mkdirSync(path.join(root, "assets"), { recursive: true });
  const source = "# Chapter\n\n![Figure](../assets/figure.svg)\n";
  const asset = "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n";
  fs.writeFileSync(path.join(root, "study-guide", "chapter.md"), source);
  fs.writeFileSync(path.join(root, "assets", "figure.svg"), asset);
  const receipt = { results: [{
    source: "study-guide/chapter.md",
    carrier: "study-guide/chapter.md.html",
    builder: "orz-mdhtml",
    sourceSha256: sha(source),
    reviewFingerprint: { algorithm: "sha256", normalization: "coursewerk-carrier-v1", value: "a".repeat(64) },
    sourceInspection: { localAssetDigests: [{ reference: "../assets/figure.svg", path: "assets/figure.svg", sha256: sha(asset) }] },
  }] };
  writeJson(path.join(root, "metadata", "VISUAL_REVIEW.json"), {
    schemaVersion: 1,
    status: "passed",
    reviewer: { type: "human", name: "Human Reviewer" },
    reviewedAt: "2026-07-14",
    inspectionMethod: "browser-visual-dom",
    attestation: "I inspected the complete carrier in a browser for layout, interaction, readable alternatives, and overflow.",
    carriers: carrierReviewRecords(receipt),
  });
  assert.equal(auditVisualReview(root).ready, true);
  assert.equal(verifyVisualReviewAgainstCarrierReceipt(root, receipt).ready, true);
  fs.appendFileSync(path.join(root, "assets", "figure.svg"), "<!-- changed -->\n");
  assert.match(auditVisualReview(root).failures.join("\n"), /asset changed after visual review/);
});
