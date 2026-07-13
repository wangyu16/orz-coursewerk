import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fixture() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-carriers-"));
  const root = path.join(parent, "root");
  const files = {
    "study-guide/ch.md": "# Study\n\nText.\n",
    "practice/ch.md": "# Practice\n\nText.\n",
    "slides/ch.md": "<!-- deck\ntitle: Ch\n-->\n<!-- slide template=title -->\n# Ch\n<!-- slide -->\n## Topic\nText.\n",
    "private/exams/midterm.md": "# Midterm\n\n::: question-workout\nQuestion\n::: answer\nAnswer\n:::\n:::\n",
  };
  for (const [rel, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); }
  fs.mkdirSync(path.join(root, "metadata"), { recursive: true });
  fs.writeFileSync(path.join(root, "metadata", "DOCUMENTS.json"), JSON.stringify({ schemaVersion: 1, documents: [{ id: "midterm", source: "private/exams/midterm.md", carrier: "paged", audience: "instructor-only" }] }));
  return { parent, root, out: path.join(parent, "preview"), receipt: path.join(parent, "receipt.json") };
}

test("carrier builder produces mdhtml, slides, and declared paged documents", () => {
  const f = fixture();
  const run = spawnSync(process.execPath, [path.join(repo, "scripts", "build_carriers.mjs"), "--root", f.root, "--out", f.out, "--receipt", f.receipt], { encoding: "utf8" });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const receipt = JSON.parse(fs.readFileSync(f.receipt, "utf8"));
  assert.equal(receipt.failed, 0);
  assert.equal(receipt.carriersBuilt, 4);
  assert.equal(receipt.schemaVersion, 2);
  assert.equal(receipt.runtimeVisualReviewRequired, true);
  assert.equal("renderedAccessibility" in receipt.results[0], false);
  assert.match(receipt.results[0].staticCarrierInspection.note, /Static shell only/);
  assert.equal(typeof receipt.results[0].portability.singleFile, "boolean");
  assert.ok(fs.existsSync(path.join(f.out, "study-guide", "ch.md.html")));
  assert.ok(fs.existsSync(path.join(f.out, "slides", "ch.slides.html")));
  assert.ok(fs.existsSync(path.join(f.out, "private", "exams", "midterm.paged.html")));
  assert.ok(fs.statSync(path.join(f.out, "study-guide", "ch.md.html")).size > 100000);
});

test("single-file enforcement refuses carriers with portability dependencies", () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.root, "study-guide", "ch.md"), "# Study\n\n![Figure](../assets/figure.svg)\n");
  fs.mkdirSync(path.join(f.root, "assets"), { recursive: true });
  fs.writeFileSync(path.join(f.root, "assets", "figure.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
  const run = spawnSync(process.execPath, [path.join(repo, "scripts", "build_carriers.mjs"), "--root", f.root, "--out", f.out, "--receipt", f.receipt, "--require-single-file"], { encoding: "utf8" });
  assert.notEqual(run.status, 0);
  const receipt = JSON.parse(fs.readFileSync(f.receipt, "utf8"));
  const study = receipt.results.find((result) => result.source === "study-guide/ch.md");
  assert.equal(study.portability.singleFile, false);
  assert.ok(study.portability.localAssetDependencies.includes("../assets/figure.svg"));
});

test("carrier builder refuses to use the source root as output", () => {
  const f = fixture();
  const before = fs.readFileSync(path.join(f.root, "study-guide", "ch.md"), "utf8");
  const run = spawnSync(process.execPath, [path.join(repo, "scripts", "build_carriers.mjs"), "--root", f.root, "--out", f.root], { encoding: "utf8" });
  assert.notEqual(run.status, 0);
  assert.match(`${run.stdout}\n${run.stderr}`, /unsafe output path/);
  assert.equal(fs.readFileSync(path.join(f.root, "study-guide", "ch.md"), "utf8"), before);
});
