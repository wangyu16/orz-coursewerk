// Site type assets (req.sitetype.assets; family SITE-TYPE-CONTRACT draft 12): `assets` names where a page's assets
// live (formerly `figures`); the places are unchanged and the definition never names file kinds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const def = JSON.parse(readFileSync(new URL("../site-type/site-type.json", import.meta.url), "utf8"));

test("the definition names its asset places as `assets`, not `figures`", () => {
  assert.deepEqual(def.assets, { public: "assets/{doc}", private: "private/instructor/figures/{doc}" });
  assert.equal("figures" in def, false);
});

test("the definition does not list asset kinds (they are Alembic's)", () => {
  for (const k of ["media", "kinds", "assetKinds"]) assert.equal(k in def, false);
});

test("the plans are kept off the website (req.sitetype.plans-off-website)", () => {
  const off = def.documents.filter((d) => d.website === false).map((d) => d.id).sort();
  assert.deepEqual(off, ["assessment-guide", "concept-map", "course-map"]);
  assert.deepEqual(def.website.unitLinks, ["study-guide", "slides", "practice"]);
  assert.equal(def.website.front.some((e) => e.doc === "course-map"), false);
});

test("the definition offers one update task to the owner and deputy (req.sitetype.tasks)", () => {
  assert.equal(def.tasks.length, 1);
  const [t] = def.tasks;
  assert.equal(t.id, "upgrade");
  assert.equal(t.offer, true);
  assert.equal(t.who, "lead");
  assert.equal(t.size, "large");
  assert.ok(t.summary.length <= 200 && t.instruction.length <= 4000);
  // It names only the release's own tools, each of which exists in this release, and it approves nothing.
  for (const tool of ["records_move.mjs", "units.mjs", "records_paths.mjs"]) {
    assert.match(t.instruction, new RegExp(tool.replace(".", "\\.")));
    assert.ok(readFileSync(new URL(`../scripts/${tool}`, import.meta.url), "utf8").length > 0);
  }
  assert.ok(readFileSync(new URL("../docs/migrating-from-v0.12.md", import.meta.url), "utf8").includes("## 1. Convert the spine"));
  assert.match(t.instruction, /Never approve a plan/);
  assert.match(t.instruction, /never change what a sentence says/);
});

test("concurrent edits are combined by block where Alembic can (req.sitetype.edits-blocks; SITE-TYPE-CONTRACT §5 draft 15)", () => {
  const edits = Object.fromEntries(def.documents.map((d) => [d.id, d.edits ?? "whole"]));
  // slides by slide and the README by section (orz-markdown's blocks); study guide and practice by `##` section; the
  // plans never combined
  assert.deepEqual(edits, { "concept-map": "keep-both", "study-guide": "sections", slides: "blocks", "assessment-guide": "keep-both", practice: "sections", "course-map": "keep-both", readme: "blocks" });
  assert.deepEqual(Object.fromEntries(def.unitFolders.map((f) => [f.path, f.edits])), {
    "study-guide/chapters/{unit}/": "sections", "slides/chapters/{unit}/": "blocks", "practice/chapters/{unit}/": "sections" });
  // nothing is left on the default (`whole`), and a paged document, if one is declared, is combined by block too
  for (const d of def.documents) assert.ok(d.edits, `${d.id} says how edits combine`);
  for (const d of def.documents.filter((x) => x.format === "paged")) assert.equal(d.edits, "blocks", d.id);
  assert.equal(def.version, "1.0.0-dev.2", "a changed definition is a new version (Alembic vendors it by checksum)");
});
