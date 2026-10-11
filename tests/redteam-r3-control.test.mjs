// 3C red team, round 3: CONTROL (studies/p11/redteam-r3/control, 2026-10-07): C3-03, C3-04, C3-06, C3-07 and C1-05.
// One root cause: the segmenter kept its own line grammar of what is "structure", and it disagreed with what
// orz-markdown renders. Whether a line prints is now read from orz-markdown's own token stream (core/printed.mjs):
//   1. a structure line that prints is a unit, unless it is a bounded printed label — a `#`/`##` heading that heads
//      content, a container label over a body, ONE credit line per deliverable (C3-03, C3-04);
//   2. a {{nyml}} block ends where orz ends it (C3-06);
//   3. every include orz renders, in any form, feeds what-ships-is-what-is-checked (C3-07);
//   4. raw HTML (or maths) that can hide what it wraps, and a unit that prints nothing, are a blocking defect: hidden
//      text never counts (C1-05).
// Every attack is replayed on the real course fixture with replayed reviewer answers where one is needed (test
// doubles). Offline and deterministic.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { liveReader, manifestChapters } from "../scripts/lib/core/package_reader.mjs";
import { coreObligations, indexAndStamp, linkUnits, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { beginSession, deliverablesOf } from "../scripts/lib/core/units_index.mjs";
import { segmentDeliverable, unitHash } from "../scripts/lib/core/segment.mjs";
import { htmlHides, printedModel } from "../scripts/lib/core/printed.mjs";
import { hiddenContent, hiddenInText, includesOf, uncheckedShipped, uncheckedShippedFindings } from "../scripts/lib/core/shipped.mjs";
import { packPublished } from "../scripts/lib/core/pack_v2.mjs";
import { publishContentHash } from "../scripts/lib/core/workflow.mjs";
import { appendLogRecord } from "../scripts/lib/records/log.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const require_ = createRequire(path.join(REPO, "package.json"));
const SG = "study-guide/le-chatelier.md", SL = "slides/le-chatelier.md";
const ELECTRO = /galvanic|salt bridge|electrolytic|anode|cathode/i;

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-rt3-ctl-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  return {
    root, dir, r: () => liveReader(root),
    units: () => loadUnits(root, liveReader(root)),
    file: (rel) => path.join(root, rel),
    read: (rel) => fs.readFileSync(path.join(root, rel), "utf8"),
    write: (rel, s) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), s); },
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 50)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent: (fn) => { beginSession(root, liveReader(root), AGENT); fn(); indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    link: (map) => linkUnits(root, liveReader(root), map, AGENT),
    core: () => coreObligations(root, liveReader(root), "rt3"),
  };
}
const renderLean = (root, rel) => require_("orz-markdown").md.render(fs.readFileSync(path.join(root, rel), "utf8"), { markdownBasePath: path.dirname(path.join(root, rel)) });
const unlinkedOf = (c) => new Set(c.core().filter((f) => f.kind === "unit-unlinked").flatMap((f) => f.units));
/** Every non-blank line orz-markdown prints belongs to a unit or to a bounded label (the invariant the fix enforces). */
function printedLinesRead(text, rel) {
  const seg = segmentDeliverable(text, rel), m = printedModel(text), inUnit = new Set();
  for (const u of seg.units) for (let k = u.startLine - 1; k < u.endLine; k++) inUnit.add(k);
  return { seg, m, inUnit };
}
function publishRecord(c) {
  appendLogRecord(c.root, { type: "publish", party: I, payload: { profile: "public", contentHash: publishContentHash(c.root), gateBasis: "test", chapters: manifestChapters(c.r()).map((chapter) => ({ chapter, version: 1, approval: null })), course: { approval: null }, excluded: [], drafts: [], openQuestions: [], overQuestions: false, instructorWords: "Publish (test double)." } });
}

// ==================================== 1. what prints is orz-markdown's call =========================================
test("[req.control.printed-by-parser] C3-03: a chain of one-sentence \"Sources: …\" paragraphs and of `##` statement headings over nothing is read — each is a unit, owed a link and a review", (t) => {
  const c = course(t);
  const LESSON = "Sources: in a galvanic cell the spontaneous redox reaction drives electrons through an external wire from the anode, where oxidation occurs, to the cathode, where reduction occurs; the cell potential is positive.\n\nSources: an electrolytic cell runs the same chemistry in reverse, using an external power supply to force a non-spontaneous reaction.\n\n## Electrons flow from the anode to the cathode through the wire\n\n## The salt bridge keeps each half-cell electrically neutral during operation\n\n";
  c.asAgent(() => c.edit(SG, "## Common misconceptions", LESSON + "## Common misconceptions"));
  const html = renderLean(c.root, SG);
  assert.ok(/<p>Sources: in a galvanic cell/.test(html) && /<h2[^>]*>Electrons flow from the anode/.test(html), "orz-markdown prints them");
  const lesson = c.units().filter((u) => ELECTRO.test(u.text));
  assert.deepEqual(lesson.map((u) => u.form).sort(), ["heading", "heading", "paragraph", "paragraph"], lesson.map((u) => u.text.slice(0, 40)).join(" | "));
  const unlinked = unlinkedOf(c);
  assert.ok(lesson.every((u) => u.role === "teaching" && unlinked.has(u.id)), "each must be linked (and so reviewed) before publishing");
  // the honest attribution footer stays the deliverable's one credit line … and a second credit line makes both read
  const one = "Intro text.\n\n*Adapted from OpenStax, Chemistry 2e (<https://openstax.org>), licensed CC-BY-4.0.*\n";
  assert.deepEqual(segmentDeliverable(one, "study-guide/x.md").units.map((u) => u.text), ["Intro text."]);
  const two = segmentDeliverable(`Sources: a galvanic cell has an anode and a cathode.\n\n${one}`, "study-guide/x.md").units;
  assert.equal(two.length, 3, two.map((u) => u.text).join(" | "));
  // a heading over content stays its section's label; a heading over nothing is read
  assert.deepEqual(segmentDeliverable("## Electrons flow anode to cathode\n\nA catalyst does not shift the equilibrium.\n", "study-guide/x.md").units.map((u) => u.form), ["paragraph"]);
  assert.deepEqual(segmentDeliverable("## Electrons flow anode to cathode\n\n## Catalysts\n\nA catalyst does not shift the equilibrium.\n", "study-guide/x.md").units.map((u) => u.form), ["heading", "paragraph"]);
});

test("[req.control.printed-by-parser] C3-03 on slides: a section slide heads the slides up to the next section; a chain of section slides over nothing is read", () => {
  // round 5: the section template renders its `#` title (and any other text) but NOT a `##` line — orz-slides' own
  // renderer decides (printed.mjs slideRegionsShown) — so the section titles here are `#`, as the frame prints them
  const deck = "<!-- slide template=section -->\n# Electrons flow from anode to cathode\n\n<!-- slide template=section -->\n# The salt bridge keeps both half-cells neutral\n\n<!-- slide template=section -->\n# Catalysts\n\n<!-- slide -->\n## Why nothing shifts\nA catalyst speeds up both directions equally.\n";
  const units = segmentDeliverable(deck, "slides/x.md").units;
  assert.deepEqual(units.map((u) => u.text), ["# Electrons flow from anode to cathode", "# The salt bridge keeps both half-cells neutral", "A catalyst speeds up both directions equally."]);
  assert.ok(units.slice(0, 2).every((u) => u.role === "framing" && u.form === "heading"), "a section slide's heading is framing: read for off-plan content");
  // a `##` on a section slide prints nothing: no unit when it is a label, content-hidden when it is more
  const sub = "<!-- slide template=section -->\n# Part one\n## Electrons flow from anode to cathode\n\n<!-- slide -->\n## Why\nText.\n";
  assert.ok(!segmentDeliverable(sub, "slides/x.md").units.some((u) => /Electrons/.test(u.text)));
  assert.deepEqual(hiddenInText(sub, "slides/x.md"), []);
  const long = sub.replace("## Electrons flow from anode to cathode", "## Electrons flow from the anode to the cathode. The salt bridge keeps the cell neutral.");
  assert.match(hiddenInText(long, "slides/x.md").map((h) => h.what).join("\n"), /a heading that prints nothing \("## Electrons flow[^]*the section template does not render this line of @body/);
});

test("[req.control.printed-by-parser] C3-04: prose inside a `:::: tabs` group but outside every tab, and a `::: spoil` label that is no label, print — each is a unit", (t) => {
  const c = course(t);
  const LESSON = "A galvanic cell converts the chemical energy of a spontaneous redox reaction into electrical energy.\n\nElectrons flow through the external wire from the anode to the cathode.\n\n";
  c.asAgent(() => c.edit(SG, ":::: tabs\n::: tab Worked example 1\n", `:::: tabs\n${LESSON}::: tab Worked example 1\n`));
  const html = renderLean(c.root, SG);
  const tabsDiv = html.slice(html.indexOf('<div class="tabs">'), html.indexOf('<div class="tab" data-label="Worked example 1">'));
  assert.ok(/<p>A galvanic cell converts/.test(tabsDiv), "orz-markdown prints it in the tab group, outside every tab panel");
  const lesson = c.units().filter((u) => ELECTRO.test(u.text));
  assert.equal(lesson.length, 2); assert.ok(lesson.every((u) => u.form === "paragraph" && unlinkedOf(c).has(u.id)));
  // the spoiler's summary prints: a statement there is read; a short label over a body stays a label
  const SUMMARY = "In a galvanic cell oxidation happens at the anode and reduction at the cathode, and electrons flow from the anode to the cathode";
  const BODY = "A catalyst speeds up the forward and reverse reactions by the same factor.";
  c.asAgent(() => c.edit(SG, "## Worked examples\n", `::: spoil ${SUMMARY}\n${BODY}\n:::\n\n::: spoil Why a catalyst does nothing\n${BODY}\n:::\n\n::: spoil Galvanic cells run on spontaneous redox\n:::\n\n## Worked examples\n`));
  assert.ok(renderLean(c.root, SG).includes(`<summary>${SUMMARY}</summary>`));
  const sum = c.units().filter((u) => /^(In a galvanic cell oxidation|Galvanic cells run)/.test(u.text));
  assert.deepEqual(sum.map((u) => u.form), ["heading", "heading"], "the long label, and a short one over an empty body");
  assert.equal(sum[0].text, SUMMARY, "the unit is what prints: the label");
  assert.ok(!c.units().some((u) => u.text === "Why a catalyst does nothing"));
});

test("[req.control.printed-by-parser] C3-06: a {{nyml}} block ends where orz-markdown ends it — the first line holding \"}}\"; what follows prints and is read", (t) => {
  const c = course(t);
  const BLOCK = "{{nyml\nkind: meta\nauthor: Yu Wang }} <!-- -->\n\nA galvanic cell converts the chemical energy of a spontaneous redox reaction into electrical energy.\n\nElectrons flow through the external wire from the anode to the cathode.\n\n{{space}}\n\n";
  c.asAgent(() => c.edit(SG, "## Common misconceptions", BLOCK + "## Common misconceptions"));
  assert.ok(/<p>A galvanic cell converts/.test(renderLean(c.root, SG)));
  const lesson = c.units().filter((u) => ELECTRO.test(u.text));
  assert.equal(lesson.length, 2); assert.ok(lesson.every((u) => unlinkedOf(c).has(u.id)));
  assert.ok(!c.units().some((u) => /kind: meta/.test(u.text)), "the meta block itself is notation");
  // an unclosed {{nyml prints as text (orz leaves it literal): it is read
  assert.equal(segmentDeliverable("{{nyml\nkind: meta\nA galvanic cell converts chemical energy.\n", "study-guide/x.md").units.length, 1);
  // single-line notation is notation
  assert.equal(segmentDeliverable("{{nyml kind: meta}}\n\nText.\n", "study-guide/x.md").units.length, 1);
});

test("[req.control.printed-by-parser] benign: the fixture's units are byte-identical, and every line orz-markdown prints in them is a unit or a bounded label", () => {
  for (const rel of deliverablesOf(liveReader(C2))) {
    const text = fs.readFileSync(path.join(C2, rel), "utf8");
    const side = JSON.parse(fs.readFileSync(path.join(C2, "metadata/units", `${rel}.json`), "utf8"));
    const { seg, m, inUnit } = printedLinesRead(text, rel);
    assert.deepEqual(seg.units.map((u) => unitHash(u.text)), side.units.map((u) => u.locator.contentHash), rel);
    const lines = text.split("\n");
    for (const k of m.printed) {
      if (inUnit.has(k)) continue;
      const l = lines[k].trim();
      assert.ok(/^#{1,2}\s/.test(l) || /^\|/.test(l) || /^\*?Adapted from/.test(l) || /^:::\s*tab\s/.test(l) || /^(\d+[.)]|[-*+])\s/.test(l), `${rel}:${k + 1} prints and is no label: ${l}`);
    }
    assert.deepEqual(printedModel(text).hidden, [], rel);
  }
});

// ===================================== 2. what ships is what is checked =============================================
test("[req.ship.same-computation] C3-07: a multi-line `{{md` / path / `}}` include — any form orz-markdown renders — is an include: a metadata/ target is include-unchecked, and the pack refuses", (t) => {
  const c = course(t);
  const INC = "metadata/notes/electrochemistry.md";
  c.asAgent(() => {
    c.write(INC, "### Electrochemical cells\n\nA galvanic cell converts the chemical energy of a spontaneous redox reaction into electrical energy.\n");
    c.edit(SG, "## Common misconceptions", "## Summary\n\n{{md\n../metadata/notes/electrochemistry.md\n}}\n\n## Common misconceptions");
  });
  assert.ok(/<h3[^>]*>Electrochemical cells<\/h3>/.test(renderLean(c.root, SG)), "orz-markdown renders the file");
  const inc = uncheckedShippedFindings(c.root, c.r(), "rt3").filter((f) => f.kind === "include-unchecked");
  assert.equal(inc.length, 1); assert.equal(inc[0].statusClass, "defect"); assert.equal(inc[0].route, "agent");
  assert.equal(inc[0].evidence.file, SG); assert.match(inc[0].evidence.detail, /metadata\/notes\/electrochemistry\.md/);
  publishRecord(c);
  const p = packPublished(c.root, path.join(c.dir, "out"));
  assert.equal(p.ok, false); assert.match(p.error, /includes \.\.\/metadata\/notes\/electrochemistry\.md/);
  // every form orz renders, wherever a block can stand, is seen — each against orz's own rendering
  const forms = ["{{md\nx.md\n}}", "{{md x.md\n}}", "{{md\nx.md}}", "{{markdown[a] x.md}}", "{{md-include\n  x.md\n}}", "- item\n\n  {{md x.md}}", "::: info\n{{md x.md}}\n:::", "> {{md x.md}}", ":::: tabs\n::: tab A\n{{md\nx.md\n}}\n:::\n::::"];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-rt3-inc-")); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "x.md"), "INCLUDED-MARKER\n");
  for (const f of forms) {
    const rendered = require_("orz-markdown").md.render(f + "\n", { markdownBasePath: dir }).includes("INCLUDED-MARKER");
    assert.ok(rendered, `orz renders ${JSON.stringify(f)}`);
    assert.deepEqual(includesOf(f + "\n").map((x) => x.target), ["x.md"], JSON.stringify(f));
  }
  // a {{md that orz never closes renders nothing, and is no include
  assert.deepEqual(printedModel("{{md\nx.md\n\nText.\n").includes, []);
});

// ===================================== 3. hidden text is never coverage =============================================
test("[req.control.no-hidden-content] C1-05: raw HTML that can hide what it wraps — here a `<div hidden>` opened and closed by one-sentence credit lines — is a blocking defect, and the pack refuses", (t) => {
  const c = course(t);
  const CE = "study-guide/chemical-equilibrium.md";
  const OPEN = "Sources: Wikipedia, Chemical equilibrium. <div hidden>\n\n", CLOSE = "\n\nSources: Wikipedia, Chemical equilibrium. </div>\n";
  const sec = c.read(CE).split("## Pure solids and liquids\n\n")[1].split("\n\n## Equilibrium and Gibbs energy")[0];
  c.edit(CE, `## Pure solids and liquids\n\n${sec}\n\n## Equilibrium`, `## Pure solids and liquids\n\n${OPEN}${sec}${CLOSE}\n## Equilibrium`);
  assert.ok(/<p>Sources: Wikipedia, Chemical equilibrium\. <div hidden><\/p>/.test(renderLean(c.root, CE)), "orz-markdown passes the raw tag through");
  const f = uncheckedShippedFindings(c.root, c.r(), "rt3").filter((x) => x.kind === "content-hidden");
  assert.ok(f.length >= 1 && f.every((x) => x.statusClass === "defect" && x.route === "agent" && x.evidence.file === CE), JSON.stringify(f.map((x) => x.evidence.detail)));
  assert.ok(f.some((x) => /<div>|<div hidden>/.test(x.evidence.detail)));
  c.asAgent(() => {});
  publishRecord(c);
  const p = packPublished(c.root, path.join(c.dir, "out"));
  assert.equal(p.ok, false); assert.match(p.error, /refusing to pack text hidden from the student/);
});

test("[req.control.no-hidden-content] C1-05: what can hide is refused — hidden/style/class attributes, <details>, <template>, <style>, a comment inside printed text, `<!…>`, invisible maths, a unit that prints nothing — and visible phrasing HTML is not", () => {
  const hides = (doc) => { const m = printedModel(doc), out = [...m.hidden.map((h) => h.what)]; for (const u of segmentDeliverable(doc, "study-guide/x.md").units) { let s = false; for (let k = u.startLine - 1; k < u.endLine; k++) s ||= m.printed.has(k); if (!s) out.push(`unprinted ${u.form}`); } return out; };
  const HIDING = [
    "Text <span hidden>pure solids are omitted</span>.",
    "Text <span style=\"display:none\">pure solids are omitted</span>.",
    "<div style=\"visibility:hidden\">\n\nPure solids are omitted.\n\n</div>",
    "<details>\n\nPure solids are omitted.\n\n</details>",
    "<details><summary></summary>\n\nPure solids are omitted.\n\n</details>",
    "Text <span class=\"sr-only\">pure solids are omitted</span>.",
    "<template>\n\nPure solids are omitted.\n\n</template>",
    "<style>.x{display:none}</style>",
    "Pure solids <!-- are omitted because their activity is one --> matter.",
    "Text <![CDATA[ pure solids are omitted ]]> more.",
    "Text $\\phantom{\\text{pure solids are omitted}}$ more.",
    "Text $\\color{white}{\\text{pure solids are omitted}}$ more.",
    "<noscript>\n\nPure solids are omitted.\n\n</noscript>",
    "[omitted]: https://example.org \"pure solids are omitted\"",
  ];
  for (const doc of HIDING) assert.ok(hides(doc).length, `refused: ${doc}`);
  const VISIBLE = ["H<sub>2</sub>O and <sup>2</sup>, <b>bold</b>, <em>em</em> and a<br/>break.", "<!-- slide -->\n## Pure solids\nTheir activity is one.", "<!-- note: a speaker note -->\n\nText.", "See <a href=\"https://example.org\" title=\"OpenStax\">the source</a>."];
  for (const doc of VISIBLE) assert.deepEqual(hides(doc), [], doc);
  assert.deepEqual(htmlHides("<br/>"), []); assert.ok(htmlHides("<div hidden>").length);
});

test("[req.control.no-hidden-content] C1-05 benign: the fixture hides nothing, and the gate's shipped check over it stays clean", () => {
  assert.deepEqual(hiddenContent(C2, liveReader(C2)), []);
  assert.deepEqual(uncheckedShipped(C2, liveReader(C2)), { documents: [], includes: [] });
  assert.deepEqual(uncheckedShippedFindings(C2, liveReader(C2), "rt3"), []);
});
