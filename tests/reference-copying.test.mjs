// D54 (operator, 2026-10-21): reference sources (textbooks, the instructor's prior notes, downloaded papers) are read
// for their ideas and knowledge, never copied — "avoid to use exact sentences but catch the idea and the knowledge".
// The copy check (modules/ms10-copying.mjs) compares every shipped text with every pinned reference text.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCheckpoint } from "../scripts/lib/skeleton/runner.mjs";
import { sha256 } from "../scripts/lib/records/canonical.mjs";
import { COPY_RUN } from "../scripts/modules/ms10-copying.mjs";

const BOOK = "Chapter 3. The glass transition is the temperature range in which an amorphous polymer changes from a hard, glassy solid to a soft, rubbery material, because the chains gain enough thermal energy for long-range segmental motion. Below it, only short-range vibrations remain.";
const PAPER = "Here we report that the enzyme cleaves the ester bonds of the polymer within hours at mild temperatures, giving the two monomers in high yield.";

function course(t, { study, pinBook = true, paper = true, book = BOOK } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-copy-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "package"), inputs = path.join(dir, "inputs");
  const w = (base, rel, text) => { fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true }); fs.writeFileSync(path.join(base, rel), text); };
  w(root, "alembic.json", JSON.stringify({ schemaVersion: 2, packageId: "pending", title: "T", license: "CC-BY-4.0", createdAt: "2026-10-21T00:00:00Z", chapters: [{ slug: "ch", title: "Ch" }] }));
  w(root, "private/coursewerk/FOUNDATION.json", JSON.stringify({ schemaVersion: 1, usageProfile: "public-oer", sources: [{ id: "textbook-a", title: "A Textbook", use: "reference", role: "supplemental", scope: ["all"], rightsBasis: { type: "reference-only", statement: "for ideas only" } }] }));
  w(root, "study-guide/ch.md", study);
  w(root, "concepts/ch.md", "# Concept Map — Ch\n");
  const sources = [];
  if (pinBook) { w(inputs, "text/book.txt", book); sources.push({ sourceId: "textbook-a", textPath: "text/book.txt", sha256: sha256(book), retrievedAt: "2026-10-21T00:00:00Z" }); }
  w(inputs, "SOURCE_CORPUS.json", JSON.stringify({ schemaVersion: 1, sources }));
  if (paper) { w(inputs, "refs/paper.txt", PAPER); w(inputs, "REFERENCES.json", JSON.stringify({ schemaVersion: 1, references: [{ refId: "ref-paper", url: "https://doi.org/10.0/x", textPath: "refs/paper.txt", sha256: sha256(PAPER) }] })); }
  return { root, inputs };
}
const copying = (c) => runCheckpoint({ root: c.root, checkpoint: "V8", profile: "public", inputsDir: c.inputs, registry: { schemaVersion: 1, __noStandard: true, modules: [{ name: "ms10-copying", version: "1.0.0", maturity: "stable", enabled: true }] } })
  .findings.filter((f) => f.module === "ms10-copying");

test("[req.rights.reference-copy-check] a run of 8 or more words from a reference text is copied expression: a blocking defect naming the file, line, source and words", (t) => {
  const c = course(t, { study: "# Glass transition\n\nIntro line.\n\nAn amorphous polymer **changes from a hard, glassy solid** to a soft, rubbery material when heated.\n" });
  const f = copying(c);
  assert.equal(f.length, 1, JSON.stringify(f));
  assert.equal(f[0].kind, "reference-copied"); assert.equal(f[0].statusClass, "defect"); assert.equal(f[0].route, "agent");
  assert.equal(f[0].evidence.file, "study-guide/ch.md"); assert.equal(f[0].evidence.line, 5); assert.equal(f[0].evidence.source, "textbook-a");
  assert.match(f[0].evidence.words, /^an amorphous polymer changes from a hard glassy solid to a soft rubbery material/, "markup, punctuation and case neither hide nor make a copy");
});

test("[req.rights.reference-copy-check] the same idea in the author's own words, or a shorter shared phrase, is not copying", (t) => {
  const own = course(t, { study: "# Glass transition\n\nWarm a glassy polymer and, over a range of temperature, its chains start to move in long cooperative stretches: the hard solid turns soft and rubbery.\n" });
  assert.deepEqual(copying(own), []);
  const words = "from a hard glassy solid to a".split(" ");
  assert.equal(words.length, COPY_RUN - 1);
  const short = course(t, { study: `# Glass transition\n\nIt ${words.join(" ")} different state.\n` });
  assert.deepEqual(copying(short), [], `${COPY_RUN - 1} words in common is not a copy`);
});

test("[req.rights.reference-copy-check] a pinned verification reference (a paper) is checked too, and every shipped text is read (the spine included)", (t) => {
  const c = course(t, { study: "# Ch\n\nOwn words only.\n" });
  fs.writeFileSync(path.join(c.root, "concepts/ch.md"), "# Concept Map — Ch\n\n## Concept sequence\n1. The enzyme cleaves the ester bonds of the polymer within hours. [anchor: enzyme]\n");
  const f = copying(c);
  assert.deepEqual(f.map((x) => [x.evidence.file, x.evidence.source]), [["concepts/ch.md", "ref-paper"]]);
});

test("[req.rights.reference-copy-check] a reference source whose text is not pinned cannot be compared: it fails closed", (t) => {
  const c = course(t, { study: "# Ch\n\nOwn words only.\n", pinBook: false, paper: false });
  const f = copying(c);
  assert.deepEqual(f.map((x) => [x.kind, x.statusClass, x.evidence.source]), [["reference-text-missing", "obligation", "textbook-a"]]);
});

test("[req.rights.reference-copy-check] citing the same paper (its URL or DOI) is not copying", (t) => {
  const c = course(t, { study: "# Ch\n\nSee [the report](https://doi.org/10.1038/s41586-020-2149-4) and doi:10.1038/s41586-020-2149-4 for details.\n", paper: false });
  fs.writeFileSync(path.join(c.inputs, "text/book.txt"), BOOK + " Further reading: https://doi.org/10.1038/s41586-020-2149-4 (doi:10.1038/s41586-020-2149-4).");
  const corpus = JSON.parse(fs.readFileSync(path.join(c.inputs, "SOURCE_CORPUS.json"), "utf8"));
  corpus.sources[0].sha256 = sha256(fs.readFileSync(path.join(c.inputs, "text/book.txt"), "utf8"));
  fs.writeFileSync(path.join(c.inputs, "SOURCE_CORPUS.json"), JSON.stringify(corpus));
  assert.deepEqual(copying(c), []);
});

test("[req.rights.reference-copy-check] an equation is a fact, not expression: math in the shipped text is not compared", (t) => {
  // the book prints the rate law; the course writes the same law as math, and only the math is shared
  const book = "In this treatment R p = k p [M] ( f k d [I] / k t ) 1/2 so that the rate depends on the initiator.";
  const asMath = course(t, { book, study: "# Rate\n\nUnder the steady state, $R_p = k_p [M] (f k_d [I] / k_t)^{1/2}$ holds.\n" });
  assert.deepEqual(copying(asMath).filter((f) => f.kind === "reference-copied"), [], "the equation itself is not compared");
  // the same eight-word run written as prose is still a copy
  const asWords = course(t, { book, study: "# Rate\n\nSo that the rate depends on the initiator, as stated.\n" });
  assert.equal(copying(asWords).filter((f) => f.kind === "reference-copied").length, 1);
});
