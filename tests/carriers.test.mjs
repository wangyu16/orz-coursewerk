import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fixture() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-carriers-"));
  const root = path.join(parent, "root");
  const files = {
    "study-guide/ch.md": "# Study\n\nText.\n",
    "practice/ch.md": "# Practice\n\nText.\n",
    "slides/ch.md": "{{nyml\nkind: document\ncarrier: slides\ntitle: Ch\nratio: 16:9\n}}\n\n<!-- slide template=title -->\n# Ch\n<!-- slide -->\n## Topic\nText.\n",
    "private/exams/midterm.md": "# Midterm\n\n::: question-workout\nQuestion\n::: answer\nAnswer\n:::\n:::\n",
  };
  for (const [rel, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); }
  fs.mkdirSync(path.join(root, "private", "coursewerk"), { recursive: true }); fs.mkdirSync(path.join(root, "provenance", "coursewerk"), { recursive: true });
  (fs.mkdirSync(path.dirname(path.join(root, "private", "coursewerk", "DOCUMENTS.json")), { recursive: true }), fs.writeFileSync)(path.join(root, "private", "coursewerk", "DOCUMENTS.json"), JSON.stringify({ schemaVersion: 1, documents: [{ id: "midterm", source: "private/exams/midterm.md", carrier: "paged", audience: "instructor-only" }] }));
  return { parent, root, out: path.join(parent, "preview"), receipt: path.join(parent, "receipt.json") };
}

test("carrier builder produces mdhtml, slides, and declared paged documents", () => {
  const f = fixture();
  const run = spawnSync(process.execPath, [path.join(repo, "scripts", "build_carriers.mjs"), "--frames", "installed", "--root", f.root, "--out", f.out, "--receipt", f.receipt], { encoding: "utf8" });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const receipt = JSON.parse(fs.readFileSync(f.receipt, "utf8"));
  assert.equal(receipt.failed, 0);
  assert.equal(receipt.carriersBuilt, 4);
  assert.equal(receipt.schemaVersion, 2);
  assert.equal(receipt.runtimeVisualReviewRequired, true);
  assert.equal("renderedAccessibility" in receipt.results[0], false);
  assert.match(receipt.results[0].staticCarrierInspection.note, /Static shell only/);
  assert.equal(typeof receipt.results[0].portability.singleFile, "boolean");
  assert.equal(receipt.results[0].reviewFingerprint.normalization, "coursewerk-carrier-v1");
  assert.match(receipt.results[0].reviewFingerprint.value, /^[a-f0-9]{64}$/);
  assert.ok(fs.existsSync(path.join(f.out, "study-guide", "ch.md.html")));
  assert.ok(fs.existsSync(path.join(f.out, "slides", "ch.slides.html")));
  assert.ok(fs.existsSync(path.join(f.out, "private", "exams", "midterm.paged.html")));
  assert.ok(fs.statSync(path.join(f.out, "study-guide", "ch.md.html")).size > 100000);
});

const build = (f, ...extra) => spawnSync(process.execPath, [path.join(repo, "scripts", "build_carriers.mjs"), "--frames", "installed", "--root", f.root, "--out", f.out, "--receipt", f.receipt, ...extra], { encoding: "utf8" });
const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");

test("[req.frames.round-trip] every built carrier extracts to its exact text, checked by the frame that built it; the receipt records each frame's version and each text's sha256", () => {
  const f = fixture();
  const run = build(f);
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const receipt = JSON.parse(fs.readFileSync(f.receipt, "utf8"));
  const installed = (name) => JSON.parse(fs.readFileSync(path.join(repo, "node_modules", name, "package.json"), "utf8")).version;
  for (const r of receipt.results) {
    const text = fs.readFileSync(path.join(f.root, r.source), "utf8");
    assert.equal(r.roundTrip.exact, true, r.source);
    assert.equal(r.roundTrip.textSha256, sha(text)); assert.equal(r.roundTrip.extractedSha256, sha(text)); assert.equal(r.sourceSha256, sha(text));
    assert.equal(r.frameVersion, installed(r.builder), "the version of the frame that built and checked it");
    assert.deepEqual(r.errors, []);
  }
  for (const name of ["orz-mdhtml", "orz-slides", "orz-paged", "orz-markdown"]) assert.equal(receipt.frames.versions[name], installed(name));
  assert.equal(receipt.theme, null, "no build theme: the look is the header's");
  // a mismatch fails the build: mixed line endings are stored as one style, so the carrier would not hold the text
  fs.writeFileSync(path.join(f.root, "study-guide", "ch.md"), "# Study\r\n\nText.\n");
  const bad = build(f);
  assert.notEqual(bad.status, 0);
  const r = JSON.parse(fs.readFileSync(f.receipt, "utf8")).results.find((x) => x.source === "study-guide/ch.md");
  assert.equal(r.status, "failed"); assert.equal(r.roundTrip.exact, false); assert.match(r.errors.join("\n"), /does not hold the text exactly/);
});

test("[req.frames.round-trip] a carrier lint error, or a text the frame refuses, fails the build with the carrier's own message; --theme is refused", () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.root, "slides", "ch.md"), "{{nyml\nkind: document\ncarrier: slides\ntitle: Ch\n}}\n\n<!-- slide nonsense=1 -->\n# Ch\n");
  const lint = build(f);
  assert.notEqual(lint.status, 0);
  let r = JSON.parse(fs.readFileSync(f.receipt, "utf8")).results.find((x) => x.source === "slides/ch.md");
  assert.equal(r.status, "failed"); assert.match(r.errors.join("\n"), /orz-slides lint error unknown-option/);
  assert.ok(r.lint.some((l) => l.level === "error" && l.code === "unknown-option"));
  // a 0.x deck (a <!-- deck --> block) is refused by orz-slides, and its message names the fix
  fs.writeFileSync(path.join(f.root, "slides", "ch.md"), "<!-- deck\ntitle: Ch\n-->\n<!-- slide -->\n# Ch\n");
  const legacy = build(f);
  assert.notEqual(legacy.status, 0);
  r = JSON.parse(fs.readFileSync(f.receipt, "utf8")).results.find((x) => x.source === "slides/ch.md");
  assert.equal(r.status, "failed"); assert.match(r.errors.join("\n"), /orz-slides assemble refused slides\/ch\.md: .*upgrade/s);
  const theme = build(f, "--theme", "paper");
  assert.equal(theme.status, 2); assert.match(theme.stderr, /--theme is gone/);
});

test("single-file enforcement refuses carriers with portability dependencies", () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.root, "study-guide", "ch.md"), "# Study\n\n![Figure](../assets/figure.svg)\n");
  fs.mkdirSync(path.join(f.root, "assets"), { recursive: true });
  fs.writeFileSync(path.join(f.root, "assets", "figure.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
  const run = spawnSync(process.execPath, [path.join(repo, "scripts", "build_carriers.mjs"), "--frames", "installed", "--root", f.root, "--out", f.out, "--receipt", f.receipt, "--require-single-file"], { encoding: "utf8" });
  assert.notEqual(run.status, 0);
  const receipt = JSON.parse(fs.readFileSync(f.receipt, "utf8"));
  const study = receipt.results.find((result) => result.source === "study-guide/ch.md");
  assert.equal(study.portability.singleFile, false);
  assert.ok(study.portability.localAssetDependencies.includes("../assets/figure.svg"));
});

test("carrier builder refuses to use the source root as output", () => {
  const f = fixture();
  const before = fs.readFileSync(path.join(f.root, "study-guide", "ch.md"), "utf8");
  const run = spawnSync(process.execPath, [path.join(repo, "scripts", "build_carriers.mjs"), "--frames", "installed", "--root", f.root, "--out", f.root], { encoding: "utf8" });
  assert.notEqual(run.status, 0);
  assert.match(`${run.stdout}\n${run.stderr}`, /unsafe output path/);
  assert.equal(fs.readFileSync(path.join(f.root, "study-guide", "ch.md"), "utf8"), before);
});
