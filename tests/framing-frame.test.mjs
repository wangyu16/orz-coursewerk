// THE CHAPTER'S OWN FRAME IS FRAMING (owner 2026-11-06; req.units.framing-frame). A study guide's title area, its
// "Chapter logic" and closing "About this chapter" sections, the lists of a "(Chapter) learning objectives" section, and
// a heading with no text under it teach nothing themselves: they are framing — still units, still read for off-plan content (D42: framing-review-owed),
// never owed a spine link. The guarantees they keep:
//   - framing may not carry facts (D19-I): whatever under these titles, in the title area or in a heading states a value,
//     a date, a name or a superlative stays teaching;
//   - the role is derived from the text and its structure, never from a sidecar (redteam r1 C3-15);
//   - a guide with no section has no title area (its text is the lesson), and only a study guide has one;
//   - prose in a learning-objectives section stays teaching, owed a link (redteam r1 C3-06);
//   - a heading over content keeps its role: a `###`+ heading is linked and reviewed like any other unit (round 2, C3-03);
//   - the restated objectives (list items of a "Learning objectives" section) stay structure; a heading over content
//     stays its section's label (round 3, C3-03), and the credit line stays the one attribution (round 6).
// The reference box (courseguide-standards) closes the guide under `## About this chapter`.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyUnit, derivedRole, segmentDeliverable } from "../scripts/lib/core/segment.mjs";
import { coreObligations, indexAndStamp, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const SG = "study-guide/le-chatelier.md";

/** Units with the role the index records: the segmenter's role, less what a fact makes teaching (D19-I). */
const roles = (text, rel = "study-guide/x.md") => segmentDeliverable(text, rel).units.map((u) => ({ text: u.text, form: u.form, role: derivedRole(u.role, classifyUnit(u)) }));
const roleOf = (units, re) => { const u = units.find((x) => re.test(x.text)); assert.ok(u, `no unit ${re}`); return u.role; };

test("[req.units.framing-frame] \"Chapter logic\" and \"About this chapter\" sections, and the lists of a \"(Chapter) learning objectives\" section, are framing; prose among the objectives and a fact stay teaching", () => {
  const guide = "# Gases\n\n## Chapter Logic\n\nGases are the simplest state of matter to describe.\n\nThe ideal gas law was stated by Clapeyron in 1834.\n\n"
    + "## Chapter learning objectives\n\nRead these before the sections below.\n\n- Describe the general behavior of gases.\n\n"
    + "## Learning objectives\n\nEach objective is practised in the sheet.\n\n- Explain why gases mix completely.\n\n"
    + "## 5.1 Pressure\n\nPressure is a force spread over an area.\n\n## Synthesis\n\nThe chapter ties one equation to its limits.\n\n"
    + "## About this chapter\n\n:::info\n**Audience:** students in a general chemistry course\n**Note:** builds on the equilibrium chapter.\n:::\n\n"
    + ":::info\n**Audience:** students in a general chemistry course\n**Package license:** CC BY 4.0\n:::\n";
  const u = roles(guide);
  assert.equal(roleOf(u, /^Gases are the simplest/), "framing", "chapter logic");
  assert.equal(roleOf(u, /Describe the general behavior/), "framing", "a chapter-objectives list item (not a restated-objectives section) is framing");
  // C3-06: prose in an objectives section is content, owed a link like any other
  assert.equal(roleOf(u, /^Read these before/), "teaching");
  assert.equal(roleOf(u, /^Each objective is practised/), "teaching");
  assert.ok(!u.some((x) => /Explain why gases mix/.test(x.text)), "the restated objectives stay structure");
  assert.equal(roleOf(u, /Audience.*\n\*\*Note/), "framing", "the reference box under About this chapter");
  // the classifier reads "… course Package" as a name: what it reads as a fact is teaching wherever it stands (D19-I)
  assert.equal(roleOf(u, /Package license/), "teaching");
  // D19-I: a fact under a framing title is teaching
  assert.equal(roleOf(u, /Clapeyron in 1834/), "teaching");
  // the lesson and the other closing sections are untouched
  assert.equal(roleOf(u, /^Pressure is a force/), "teaching");
  assert.equal(roleOf(u, /^The chapter ties/), "teaching", "Synthesis is not a framing title");
  // the same titles frame a deck's slides
  const deck = "<!-- slide -->\n## Chapter Logic\n- One equation describes every gas\n\n<!-- slide -->\n## Chapter Learning Objectives\n- Describe how gases behave\n\n<!-- slide -->\n## Pressure\n- Pressure is force per area\n";
  const s = roles(deck, "slides/x.md");
  assert.deepEqual(s.map((x) => x.role), ["framing", "framing", "teaching"]);
});

test("[req.units.framing-frame] a study guide's title area (before its first `##`) is framing; no section, no title area; only a study guide has one", () => {
  const guide = "# Chapter 5: Gases\n\n:::success\n**Chapter learning objectives**\n- Describe the physical characteristics of gases.\n- Explain how gases mix.\n:::\n\nThis chapter is about gases.\n\n"
    + ":::info\nBoyle measured the pressure of trapped air in 1662.\n:::\n\n## 5.1 Pressure\n\nPressure is a force spread over an area.\n";
  const u = roles(guide);
  assert.equal(roleOf(u, /Chapter learning objectives/), "framing", "the chapter objectives box");
  // the classifier reads a title-case "Learning Objectives" as a name: then the box is teaching (D19-I holds)
  assert.equal(roleOf(roles(guide.replace("Chapter learning objectives", "Chapter Learning Objectives")), /Chapter Learning Objectives/), "teaching");
  assert.equal(roleOf(u, /^This chapter is about gases/), "framing");
  assert.equal(roleOf(u, /Boyle measured/), "teaching", "a fact in the title area stays teaching (D19-I)");
  assert.equal(roleOf(u, /^Pressure is a force/), "teaching");
  // a guide with no `##` section: its text is the lesson
  assert.deepEqual(roles("# Gases\n\nGases fill their container.\n\nThey mix completely.\n").map((x) => x.role), ["teaching", "teaching"]);
  // the title area ends at a second `#` heading too
  const two = roles("# Gases\n\nThis chapter is about gases.\n\n# Part one\n\nGases fill their container.\n\n## 5.1 Pressure\n\nPressure is force per area.\n");
  assert.equal(roleOf(two, /^This chapter is about/), "framing");
  assert.equal(roleOf(two, /^Gases fill their/), "teaching", "a lesson under a second `#` is no title area");
  // practice and slides have no title area
  assert.equal(roleOf(roles("# Practice\n\nWork these after the guide.\n\n## Set 1\n\nText.\n", "practice/x.md"), /^Work these/), "teaching");
  assert.equal(roleOf(roles("<!-- slide -->\nIntro words for the deck.\n\n<!-- slide -->\n## Pressure\n- Force per area\n", "slides/x.md"), /^Intro words/), "teaching");
});

test("[req.units.framing-frame] a heading with no text under it is framing, unless it states a fact; a heading over text keeps its role", () => {
  const guide = "# Gases\n\n## 5.1 Pressure\n\n### What makes a gas different\n\nThe molecules of a gas are far apart.\n\n### Bare\n\n### Boyle's law of 1662\n\n### Worked examples\n\n#### More\n\n### Over a sub-heading\n\n#### Detail\n\nPressure and volume are inversely related.\n\n"
    + "## Electrons flow from the anode to the cathode\n\n## The salt bridge keeps each half-cell neutral\n\n## Catalysts\n\nA catalyst does not shift the equilibrium.\n";
  const seg = segmentDeliverable(guide, "study-guide/x.md");
  const u = roles(guide);
  assert.equal(roleOf(u, /^### What makes a gas different/), "teaching", "a `###` heading over text is linked and reviewed (round 2, C3-03)");
  assert.equal(roleOf(u, /^## Electrons flow/), "framing", "a chain of statement headings over nothing");
  assert.equal(roleOf(u, /^## The salt bridge/), "framing");
  assert.equal(roleOf(u, /^### Bare/), "framing", "a `###` heading over nothing");
  assert.equal(roleOf(u, /^### Worked examples/), "framing", "a heading over only a heading is over nothing");
  assert.equal(roleOf(u, /^#### More/), "framing");
  assert.equal(roleOf(u, /^### Over a sub-heading/), "teaching", "a heading over a sub-heading with text heads that text");
  assert.equal(roleOf(u, /Boyle's law of 1662/), "teaching", "a heading over nothing that states a fact stays teaching (D19-I)");
  // on slides a heading's scope ends at the next slide marker
  const deck = roles("<!-- slide -->\n## Pressure\n\n<!-- slide -->\n## Volume\n- Volume is the space a gas fills\n", "slides/x.md");
  assert.deepEqual(deck.map((x) => [x.form, x.role]), [["heading", "framing"], ["slide-group", "teaching"]]);
  assert.equal(roleOf(u, /^The molecules of a gas/), "teaching");
  assert.ok(!seg.units.some((x) => /^## Catalysts/.test(x.text)), "a heading over content stays its section's label");
  assert.ok(!seg.units.some((x) => /^## 5\.1/.test(x.text)));
  // a container label that is no label is a heading-form unit but no heading: untouched
  const box = segmentDeliverable(":::: tabs\n::: tab Q 1\n:::\n::::\n\n::: spoil Why does a gas expand to fill its container? It does.\nBecause its molecules move freely.\n:::\n", "study-guide/x.md");
  const label = box.units.find((x) => /Why does a gas/.test(x.text));
  assert.ok(!label || label.role === "teaching", "a container label keeps its role");
});

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-frame-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  return {
    root,
    units: () => loadUnits(root, liveReader(root)),
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 50)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent: (fn) => { beginSession(root, liveReader(root), AGENT); fn(); indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    core: () => coreObligations(root, liveReader(root), "frame"),
  };
}
const unitsOf = (core, kind) => new Set(core.filter((f) => f.kind === kind).flatMap((f) => f.units || []));

test("[req.units.framing-frame] the reference box at the end, under `## About this chapter`: framing, read for off-plan content, owing no link — a box that names a source or states a value stays teaching", (t) => {
  const c = course(t);
  const BOX = "## About this chapter\n\n:::info\n**Audience:** students in a general chemistry course\n**Note:** builds on the equilibrium chapter.\n:::\n";
  const NAMED = "\n\n:::info\n**Reference:** OpenStax Chemistry 2e, Chapter 15 (CC BY 4.0)\n:::\n";
  c.asAgent(() => { const f = path.join(c.root, SG); fs.writeFileSync(f, fs.readFileSync(f, "utf8").trimEnd() + "\n\n" + BOX + NAMED); });
  const all = c.units(), box = all.find((u) => /\*\*Audience:\*\*/.test(u.text)), named = all.find((u) => /OpenStax/.test(u.text));
  assert.equal(box.role, "framing");
  assert.equal(box.locator.section, "about-this-chapter");
  assert.equal(named.role, "teaching", "a named source is a fact (D19-I)");
  const core = c.core();
  assert.ok(unitsOf(core, "framing-review-owed").has(box.id), "the box is read for off-plan content (D42)");
  assert.ok(!unitsOf(core, "unit-unlinked").has(box.id), "framing owes no link");
  assert.ok(unitsOf(core, "unit-unlinked").has(named.id), "the named source owes its link");
  // the same box at the top of the guide, before its first section, is the title area: framing too
  const top = course(t);
  top.asAgent(() => top.edit(SG, "# Le Chatelier's Principle\n", "# Le Chatelier's Principle\n\n:::info\n**Audience:** students in a general chemistry course\n:::\n"));
  assert.equal(top.units().find((u) => /\*\*Audience:\*\*/.test(u.text)).role, "framing");
});

test("[req.units.framing-frame] courseguide-standards puts the reference box last, under its own `## About this chapter`", () => {
  const skill = fs.readFileSync(path.join(HERE, "..", "skills", "courseguide-standards", "SKILL.md"), "utf8");
  const sg = skill.slice(skill.indexOf("## 1. STUDY GUIDE"), skill.indexOf("Styling palette"));
  const at = (s) => { const k = sg.indexOf(s); assert.ok(k >= 0, s); return k; };
  assert.ok(at("**Chapter Learning Objectives**") < at("## Chapter Logic") && at("## Chapter Logic") < at("## Asset and License Record") && at("## Asset and License Record") < at("## About this chapter"));
  assert.ok(at("## About this chapter") < at("**Reference:**"), "the box stands under About this chapter");
  assert.match(sg, /`## About this chapter`\*\* — the LAST section/);
  const contract = fs.readFileSync(path.join(HERE, "..", "format-contracts", "deliverables.md"), "utf8");
  assert.match(contract, /reference box .* closes it, under its own last section `## About this chapter`/);
});
