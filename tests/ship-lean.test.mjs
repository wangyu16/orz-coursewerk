// D53 (operator, 2026-10-20): "Coursewerk local package can store more, but the published package, i.e., that
// delivered to Alembic, should not contain these sources. Actually, it should never deliver heavy package beyond needed
// to Alembic, not just for copyright reason, but to keep the delivered package lean."
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { shippedFiles, SHIPPED_RECORDS } from "../scripts/lib/core/shipped.mjs";

function pkg(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cw-lean-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [rel, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); }
  return root;
}
const manifest = JSON.stringify({ schemaVersion: 2, packageId: "pending", title: "T", license: "CC-BY-4.0", createdAt: "2026-10-20T00:00:00Z", chapters: [{ slug: "ch", title: "Ch" }] });

test("[req.ship.lean] the delivered package holds only what Alembic needs: no working record, no source text, only the assets the texts use", (t) => {
  const root = pkg(t, {
    "alembic.json": manifest, LICENSE: "CC BY 4.0", "README.md": "# T\n", ".gitignore": "*.html\n", "notes.txt": "stray\n",
    "study-guide/ch.md": "# Ch\n\n![A plot](../assets/plot.png)\n\nSee the figure.\n",
    "slides/ch.md": "{{nyml\nkind: document\ncarrier: slides\ntitle: Ch\n}}\n\n<!-- slide -->\n## Ch\n![x](../assets/figs/deck.svg)\n",
    "practice/ch.md": "# Practice\n", "concepts/ch.md": "# Concept Map — Ch\n", "assessment-support/ch.md": "# Assessment Guide — Ch\n",
    "assets/plot.png": "png", "assets/figs/deck.svg": "<svg/>", "assets/unused.png": "png",
    "provenance/coursewerk/ATTRIBUTION.md": "# Attribution\n", "private/coursewerk/LOG.jsonl": "{}\n", "private/coursewerk/units/study-guide/ch.md.json": "{}",
    "private/coursewerk/verification/d-1.json": JSON.stringify({ passages: [{ source: "ref-textbook", text: "a textbook passage" }] }),
    "private/coursewerk/evidence/textbook.html": "<p>snapshot</p>", "private/coursewerk/FOUNDATION.json": "{}", "private/coursewerk/coursewerk.json": "{}",
    "private/coursewerk/corrections/c-1.json": "{}", "private/notes/key.md": "# Key\n",
  });
  const { files, leftOut } = shippedFiles(root);
  assert.deepEqual(files, ["LICENSE", "README.md", "alembic.json", "assessment-support/ch.md", "assets/figs/deck.svg", "assets/plot.png", "concepts/ch.md",
    "practice/ch.md", "private/notes/key.md", "provenance/coursewerk/ATTRIBUTION.md", "slides/ch.md", "study-guide/ch.md"]);
  assert.ok(!files.some((f) => f.startsWith("private/coursewerk/")), "no working record ships: log, units, verification (source passages), evidence, corrections");
  assert.deepEqual(leftOut, { "root file": 2, "unused asset": 1, "working record": 7 });
  // a chapter that is not published leaves its files, and the assets only it used, behind
  const one = shippedFiles(root, { keep: () => false, course: false });
  assert.ok(!one.files.some((f) => /\/ch\.md$/.test(f) || f.startsWith("assets/")));
});

test("[req.ship.lean] a document a student reads ships wherever it is declared, and the assets it uses with it", (t) => {
  const root = pkg(t, {
    "alembic.json": manifest, LICENSE: "x", "study-guide/ch.md": "# Ch\n",
    "private/coursewerk/DOCUMENTS.json": JSON.stringify({ documents: [{ source: "metadata/reading.md", title: "Reading" }] }),
    "metadata/reading.md": "# Reading\n\n<img src=\"../assets/map.png\" alt=\"map\">\n", "assets/map.png": "png",
  });
  const { files } = shippedFiles(root);
  assert.ok(files.includes("metadata/reading.md") && files.includes("assets/map.png"));
  assert.ok(!files.includes("private/coursewerk/DOCUMENTS.json"), "the declaration is a working record");
});
