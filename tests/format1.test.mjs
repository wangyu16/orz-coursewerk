// D52 (operator, 2026-10-19): the orz family's text format 1 (orz-markdown FC-18). The plain text is the course; the
// assembled frames are clothes. Every orz text may open with a header (`{{nyml` / `kind: document` … `}}`) that renders
// nothing; slides keep their deck keys there (`carrier: slides`), a print document its settings (`carrier: paged`).
// This file holds the promises the migration registers (system/REQUIREMENTS.json req.format1.*):
//   kind              — a text's kind is its header's `carrier:`, else its place, else a page;
//   header-structure  — the header is no unit; what a carrier prints from it is a framing unit, by allowlist;
//   deck-block        — a 0.x deck block, or a deck without its header, is a blocking notation defect naming the fix;
//   public-readers    — the orz packages are read only through their exported entry points;
//   clothes           — a theme (any look key) never changes the units, their evidence or what is owed.
// Offline and deterministic.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { coreObligations, indexAndStamp, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { beginSession, declaredKind, unindexedFindings } from "../scripts/lib/core/units_index.mjs";
import { segmentDeliverable, unitHash } from "../scripts/lib/core/segment.mjs";
import { frameOf, headerOf, printedModel } from "../scripts/lib/core/printed.mjs";
import { hiddenInText, uncheckedShippedFindings } from "../scripts/lib/core/shipped.mjs";
import { checkPageNotation, checkPagedNotation, checkSlidesNotation } from "../scripts/lib/core/notations.mjs";
import { runCheckpoint } from "../scripts/lib/skeleton/runner.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const SG = "study-guide/le-chatelier.md", SL = "slides/le-chatelier.md";
const LESSON = "Adding a reactant shifts the position of equilibrium toward the products";

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-format1-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  const c = {
    root, r: () => liveReader(root),
    read: (rel) => fs.readFileSync(path.join(root, rel), "utf8"),
    write: (rel, s) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), s); },
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 50)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent: (fn) => { beginSession(root, liveReader(root), AGENT); fn(); return indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    ms3: () => runCheckpoint({ root, checkpoint: "V8", profile: "public", registry: { schemaVersion: 1, __noStandard: true, modules: [{ name: "ms3-format", version: "1.0.0", maturity: "stable", enabled: true }] } }).findings.filter((f) => f.module === "ms3-format"),
  };
  // what the course IS, as the harness reads it: every unit (identity and text), every obligation, every shipped finding,
  // and every edit it would raise as made outside a session
  c.state = () => ({
    units: loadUnits(root, liveReader(root)).map((u) => `${u.id}|${u.locator.contentHash}|${(u.evidence || []).length}|${(u.spineNodes || []).join(",")}`).sort(),
    owed: coreObligations(root, liveReader(root), "format1").map((f) => `${f.kind}|${(f.units || []).join(",")}`).sort(),
    shipped: uncheckedShippedFindings(root, liveReader(root), "format1").map((f) => `${f.kind}|${f.evidence?.detail ?? ""}`).sort(),
    unindexed: unindexedFindings(root, liveReader(root), "format1").map((f) => f.kind).sort(),
  });
  return c;
}
const header = (lines) => `{{nyml\nkind: document\n${lines.join("\n")}${lines.length ? "\n" : ""}}}\n\n`;
const unitTexts = (text, rel, o) => segmentDeliverable(text, rel, o).units.map((u) => u.text);

// ============================================ req.format1.kind ======================================================
test("[req.format1.kind] a text's kind is its header's carrier, else its place (slides/; a document declared paged), else a page — a header on a study guide does not make it a print document", (t) => {
  const plain = "# Notes\n\nText.\n";
  assert.equal(frameOf("slides/x.md", plain), "slides", "slides/ is a deck");
  assert.equal(frameOf("study-guide/x.md", plain), "page");
  assert.equal(frameOf("handouts/h.md", plain), "page", "an undeclared document is a page");
  assert.equal(frameOf("handouts/h.md", plain, "paged"), "paged", "a document DOCUMENTS.json declares paged");
  // the header decides over the place
  for (const [carrier, want] of [["slides", "slides"], ["paged", "paged"], ["md", "page"]]) {
    assert.equal(frameOf("handouts/h.md", header([`carrier: ${carrier}`]) + plain), want, carrier);
    assert.equal(frameOf("slides/x.md", header([`carrier: ${carrier}`]) + plain), want, `slides/ with carrier: ${carrier}`);
  }
  // 0.x read ANY text that opened with {{nyml kind: document}} as a print document: under format 1 a header without
  // `carrier: paged` on a study guide (or an undeclared document) is a page's header
  const settings = header(["title: Le Chatelier", "header_left: Unit 3 — a lesson printed on every page", "page_size: A4"]) + plain;
  assert.equal(frameOf(SG, settings), "page");
  assert.equal(frameOf("handouts/h.md", settings), "page");
  assert.equal(printedModel(settings, { frame: frameOf(SG, settings) }).settings.some((v) => v.key === "header_left"), false, "a page prints no running header");
  // a document block that does not lead the text is no header (orz-markdown FC-18 §5: the token scanner, leading only)
  assert.equal(headerOf("# A\n\n" + header(["carrier: paged"])), null);
  assert.equal(frameOf("handouts/h.md", "# A\n\n" + header(["carrier: paged"])), "page");
  assert.equal(headerOf("```\n" + header(["carrier: paged"]) + "```\n"), null, "nor one inside a code block");
  // a package's declaration is read from DOCUMENTS.json, and only `carrier: paged` makes a print document
  const c = course(t);
  c.write("handouts/print.md", plain); c.write("handouts/page.md", plain);
  c.write("private/coursewerk/DOCUMENTS.json", JSON.stringify({ schemaVersion: 1, documents: [{ source: "handouts/print.md", carrier: "paged" }, { source: "handouts/page.md", carrier: "lean" }] }, null, 2) + "\n");
  assert.equal(declaredKind(c.r(), "handouts/print.md"), "paged");
  assert.equal(declaredKind(c.r(), "handouts/page.md"), null);
  // read as declared: a paged element prints in the print document; on a page it is a <script> (content-hidden)
  const el = "# Exam\n\n{{nyml\nkind: abstract\ntext: Equilibrium shifts when a reactant is added.\n}}\n";
  assert.doesNotMatch(hiddenInText(el, "handouts/print.md", "paged").map((h) => h.what).join("\n"), /only orz-paged prints it|abstract/);
  assert.match(hiddenInText(el, "handouts/page.md", null).map((h) => h.what).join("\n"), /only orz-paged prints it/);
});

// ============================================ req.format1.header-structure ==========================================
test("[req.format1.header-structure] the header renders nothing and is no unit; what a carrier prints from it — title, author, description; a deck's footer; paged running text — is a framing unit", () => {
  // a deck: the header's title is the deck title (a label shown with every unit), author and footer framing units;
  // theme, ratio, look keys and a host key are no unit
  const deck = header(["carrier: slides", "title: Le Chatelier's Principle", "author: Yu Wang", "footer: Chemistry 101 — equilibrium unit", "theme: paper", "ratio: 16:9", "transition: fade", "slide_numbers: no", "x_alembic_chapter: 3"])
    + "<!-- slide template=title -->\n# Le Chatelier's Principle\n\n<!-- slide -->\n## Shifts\n\n" + LESSON + ".\n";
  const seg = segmentDeliverable(deck, SL);
  const framing = seg.units.filter((u) => u.role === "framing").map((u) => u.text);
  assert.ok(framing.includes("Yu Wang") && framing.includes("Chemistry 101 — equilibrium unit"), framing.join(" | "));
  assert.ok(!seg.units.some((u) => /Le Chatelier's Principle$|paper|16:9|fade|x_alembic|carrier|kind: document/.test(u.text) && u.form !== "heading" && u.startLine < 12), "the header's other keys are no unit");
  assert.ok(seg.units.find((u) => u.text.startsWith(LESSON)).headings.includes("deck title: Le Chatelier's Principle"), "the deck title is shown with the units");
  const lines = deck.split("\n"), m = printedModel(deck, { frame: "slides" });
  for (let k = 0; k <= 10; k++) assert.equal(m.printed.has(k), ["author: Yu Wang", "footer: Chemistry 101 — equilibrium unit", "title: Le Chatelier's Principle"].includes(lines[k]), `header line ${k + 1}: ${lines[k]}`);
  // the footer prints only where a slide shows it: a deck of title pages, or one whose every slide has its own @footer,
  // never shows the header's footer, so it is no unit
  const titled = header(["carrier: slides", "footer: Unseen footer text"]) + "<!-- slide template=title -->\n# Title\n";
  assert.ok(!segmentDeliverable(titled, SL).units.some((u) => u.text === "Unseen footer text"));
  const own = header(["carrier: slides", "footer: Unseen footer text"]) + "<!-- slide -->\n## A\n\nText.\n\n<!-- @footer -->\nOwn footer\n";
  assert.ok(!segmentDeliverable(own, SL).units.some((u) => u.text === "Unseen footer text"));
  assert.ok(segmentDeliverable(own, SL).units.some((u) => u.text === "Own footer"), "the slide's own @footer prints");
  // a footer is rendered as markdown: what hides in a paragraph hides there
  assert.match(printedModel(header(["carrier: slides", "footer: Chem <span hidden>secret</span>"]) + "<!-- slide -->\n## A\n\nText.\n", { frame: "slides" }).hidden.map((h) => h.what).join("\n"), /slide footer/);
  // a page: title (label), author and description; nothing else of the header
  const page = header(["title: Le Chatelier", "author: Yu Wang", "description: How an equilibrium answers a disturbance, qualitatively and with Q against K.", "theme: light-neat-1", "measure: wide", "header_left: Not printed on a page"]) + "# Le Chatelier\n\n" + LESSON + ".\n";
  const pageUnits = segmentDeliverable(page, SG).units;
  assert.deepEqual(pageUnits.filter((u) => u.role === "framing" && u.startLine <= 9).map((u) => u.text).sort(), ["How an equilibrium answers a disturbance, qualitatively and with Q against K.", "Yu Wang"]);
  assert.ok(pageUnits.find((u) => u.text.startsWith(LESSON)).headings.includes("document title: Le Chatelier"));
  // a print document: the running text too; the frame's settings by allowlist; metadata, host and unknown keys inert
  const print = header(["carrier: paged", "title: Print summary", "header_left: Chemistry 101", "page_number_position: footer-right", "x_alembic_chapter: 3", "colour_scheme: warm", "keywords: equilibrium"]) + "# Print summary\n\n" + LESSON + ".\n";
  const pm = printedModel(print, { frame: "paged" });
  assert.deepEqual(pm.settings.map((v) => v.key).sort(), ["header_left", "title"]);
  assert.deepEqual(pm.hidden, [], "a host key, an unknown key and the metadata hide nothing");
  assert.ok(segmentDeliverable(print, "handouts/h.md", { declared: "paged" }).units.some((u) => u.text === "Chemistry 101" && u.role === "framing"));
  // fail closed on what the frame reads: a font preset its own value lint refuses, a printed key given twice
  assert.match(printedModel(header(["carrier: paged", "font_preset: comic-sans"]) + "# A\n", { frame: "paged" }).hidden.map((h) => h.what).join("\n"), /font_preset/);
  assert.match(printedModel(header(["carrier: paged", "header_left: First", "header_left: Second"]) + "# A\n", { frame: "paged" }).hidden.map((h) => h.what).join("\n"), /given 2 times/);
  assert.match(printedModel(header(["carrier: slides", "author: A", "author: B"]) + "<!-- slide -->\n## A\n\nText.\n", { frame: "slides" }).hidden.map((h) => h.what).join("\n"), /given more than once/);
  // a legacy leading {{nyml kind: meta}} block is read as the header, as the carriers read it
  const legacy = "{{nyml\nkind: meta\ntitle: Le Chatelier\nauthor: Yu Wang\n}}\n\n# Le Chatelier\n\nText of the guide.\n";
  assert.ok(segmentDeliverable(legacy, SG).units.some((u) => u.text === "Yu Wang" && u.role === "framing"));
  // a document block that is not the header renders nothing: no unit, and nothing read from it
  const stray = "# Guide\n\nText.\n\n" + header(["carrier: paged", "author: Someone Else", "header_left: Not read"]);
  assert.deepEqual(unitTexts(stray, SG), ["Text."]);
});

// ============================================ req.format1.deck-block ================================================
test("[req.format1.deck-block] a 0.x deck block, or a deck without its `carrier: slides` header, is a blocking defect naming the fix; the carriers' lint errors are defects, their warnings notes", (t) => {
  const body = "<!-- slide template=title -->\n# Le Chatelier\n\n<!-- slide -->\n## Shifts\n\nText.\n";
  const v0 = "<!-- deck\ntitle: Le Chatelier\nratio: 16:9\n-->\n\n" + body;
  const defects = (P) => P.filter((p) => !p.aspect).map((p) => p.issue).join("\n");
  assert.match(defects(checkSlidesNotation(v0)), /opens with the format-1 header[^]*orz-slides upgrade/);
  assert.match(defects(checkSlidesNotation(v0)), /orz-slides upgrade[^\n]*\[deck-block\]/);
  // a deck block beside a header is not read either (orz-slides 1.0: the header is the only config)
  assert.match(defects(checkSlidesNotation(header(["carrier: slides", "title: Le Chatelier"]) + "<!-- deck\nfooter: Not read\n-->\n\n" + body)), /\[deck-block\]/);
  assert.match(defects(checkSlidesNotation(header(["title: Le Chatelier"]) + body)), /names no carrier[^]*carrier: slides/);
  assert.match(defects(checkSlidesNotation(header(["carrier: md"]) + body)), /says `carrier: md`/);
  assert.equal(defects(checkSlidesNotation(header(["carrier: slides", "title: Le Chatelier"]) + body)), "", "a format-1 deck is clean");
  // the deck parser's errors are defects; a warning is a note
  const P = checkSlidesNotation(header(["carrier: slides", "foo: bar"]) + "<!-- slide -->\n## A\n\nText.\n\n<!-- @aside -->\nDropped.\n");
  assert.match(defects(P), /\[unknown-region\]/);
  assert.ok(P.some((p) => p.aspect === "vocabulary" && /\[unknown-key\]/.test(p.issue)));
  // a print document: its settings are its header, which carries `carrier: paged`
  assert.match(defects(checkPagedNotation("# Exam\n\n" + header(["page_size: A4"]))), /opens with the format-1 header[^]*orz-paged upgrade/);
  assert.match(defects(checkPagedNotation(header(["page_size: A4"]) + "# Exam\n")), /names no carrier/);
  assert.equal(defects(checkPagedNotation(header(["carrier: paged", "page_size: A4"]) + "# Exam\n")), "");
  // a page whose header names another carrier
  assert.match(defects(checkPageNotation(header(["carrier: slides"]) + "# Guide\n")), /assembled as a page/);
  assert.equal(defects(checkPageNotation(header(["title: Guide", "theme: light-neat-1"]) + "# Guide\n")), "");
  // through MS3 on a package: the upgraded fixture is clean; a deck put back to 0.x is a framework-notation defect and
  // the v0.12 audit's format-contract defect; a declared print document without its header is one too
  const c = course(t);
  const rules = () => c.ms3().filter((f) => ["framework-notation", "format-contract"].includes(f.evidence?.rule));
  assert.deepEqual(rules(), [], "the fixture is format 1");
  c.edit(SL, c.read(SL).slice(0, c.read(SL).indexOf("}}") + 3), "<!-- deck\ntitle: Le Chatelier's Principle\nratio: 16:9\n-->\n");
  const issues = rules().map((f) => `${f.evidence.rule}: ${f.evidence.issue}`).join("\n");
  assert.match(issues, /framework-notation: line 1: a slides text opens with the format-1 header/);
  assert.match(issues, /framework-notation: [^]*\[deck-block\]/);
  assert.match(issues, /format-contract: slides source does not open with the format-1 header/);
  assert.match(issues, /format-contract: slides source has a 0\.x `<!-- deck … -->` block/);
  c.write("handouts/print.md", "# Exam\n\nText.\n");
  c.write("private/coursewerk/DOCUMENTS.json", JSON.stringify({ schemaVersion: 1, documents: [{ source: "handouts/print.md", carrier: "paged" }] }, null, 2) + "\n");
  assert.ok(c.ms3().some((f) => f.evidence?.rule === "framework-notation" && f.evidence.file === "handouts/print.md" && /carrier: paged/.test(f.evidence.issue)));
});

// ============================================ req.format1.public-readers ============================================
test("[req.format1.public-readers] Coursewerk reads the orz packages only through their exported entry points", () => {
  const require_ = createRequire(import.meta.url);
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(?:m?js|cjs)$/.test(e.name)) files.push(f); } };
  walk(path.join(REPO, "scripts"));
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8"), rel = path.relative(REPO, f);
    // a path inside an orz package: its dist folder, its node_modules folder, a resolved package folder joined onward
    for (const m of src.matchAll(/orz-[a-z]+[\\/]dist[\\/]|node_modules[\\/"', ]+orz-|["']node_modules["']\s*,\s*["']orz-|path\.(?:dirname|join)\(\s*[\w.]*resolve\(\s*["']orz-/g)) bad.push(`${rel}: ${m[0]}`);
    // every orz specifier a script imports or requires is one the package exports
    for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\(\s*|\brequire_?\(\s*|\.resolve\(\s*)["'](orz-[a-z]+)((?:\/[^"']*)?)["']/g)) {
      const [, pkg, sub] = m, exp = JSON.parse(fs.readFileSync(path.join(REPO, "node_modules", pkg, "package.json"), "utf8")).exports;
      const key = `.${sub}`, keys = exp && typeof exp === "object" ? Object.keys(exp) : ["."];
      const ok = keys.some((k) => k === key || (k.endsWith("/*") && key.startsWith(k.slice(0, -1))));
      if (!ok) bad.push(`${rel}: "${pkg}${sub}" is not an export of ${pkg} (${keys.join(", ")})`);
      else assert.doesNotThrow(() => require_.resolve(`${pkg}${sub}`.replace(/\*$/, "")), `${pkg}${sub}`);
    }
  }
  assert.deepEqual(bad, []);
});

// ============================================ req.format1.clothes ===================================================
test("[req.format1.clothes] the clothes never change the course: a header's theme (or any look key) leaves the units, their evidence and what is owed unchanged — a deck and a study guide", (t) => {
  const c = course(t);
  // the study guide gets a header (an agent's edit, indexed); from then on only its look changes
  c.asAgent(() => c.write(SG, header(["title: Le Chatelier's Principle", "theme: light-neat-3"]) + c.read(SG)));
  const before = c.state();
  // a deck's theme and every look key; a study guide's theme and measure — written outside any session, since a look
  // is no edit of the course
  c.edit(SL, "theme: paper", "theme: chalk\ntransition: fade\nslide_numbers: no\nprogress: no\nsection_numbers: roman");
  c.edit(SG, "theme: light-neat-3", "theme: light-academic-2\nmeasure: wide");
  assert.deepEqual(c.state(), before, "the same units, the same evidence, nothing more or less owed, no edit to ask about");
  // a theme the installed frame does not have is clothing too: a note at most, never a defect (D36)
  c.edit(SL, "theme: chalk", "theme: a-theme-from-a-newer-frame");
  assert.deepEqual(c.state(), before);
  assert.ok(!c.ms3().some((f) => f.evidence?.rule === "framework-notation" && /theme/.test(f.evidence.issue)));
  // and the unit identity is the text's: the same deck under another header reads the same units
  const deck = c.read(SL), dressed = deck.replace("theme: a-theme-from-a-newer-frame", "theme: neon");
  assert.deepEqual(segmentDeliverable(dressed, SL).units.map((u) => unitHash(u.text)), segmentDeliverable(deck, SL).units.map((u) => unitHash(u.text)));
});
