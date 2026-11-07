// THE CHAPTER'S OWN FRAME IS FRAMING (owner 2026-11-06; req.units.framing-frame; audit 2026-11-06 F1–F5, L1–L3). A
// study guide's title-area objectives box, its exact "Chapter logic" and closing "About this chapter" sections, the approved
// objectives a "(Chapter) learning objectives" section lists, and a `###`+ label heading with no text under it teach
// nothing themselves: they are framing — still units, read for off-plan content (D42: framing-review-owed) and, when
// they make a knowledge claim, owed the knowledge review (F4); never owed a spine link. The guarantees they keep:
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
import { coreObligations, indexAndStamp, linkUnits, loadUnits, unreviewedKnowledge } from "../scripts/lib/core/obligations.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const SG = "study-guide/le-chatelier.md";

/** Units with the role the index records: the segmenter's role, less what a fact makes teaching (D19-I). */
const roles = (text, rel = "study-guide/x.md") => segmentDeliverable(text, rel).units.map((u) => ({ text: u.text, form: u.form, role: derivedRole(u.role, classifyUnit(u)) }));
const roleOf = (units, re) => { const u = units.find((x) => re.test(x.text)); assert.ok(u, `no unit ${re}`); return u.role; };

test("[req.units.framing-frame] exact \"Chapter logic\" and \"About this chapter\" sections are framing; a fact under them stays teaching; prefixes, Synthesis and practice files are not", () => {
  const guide = "# Gases\n\n## Chapter Logic\n\nGases are the simplest state of matter to describe.\n\nThe ideal gas law was stated by Clapeyron in 1834.\n\n"
    + "## Chapter logic and the gas laws\n\nGases expand to fill their container.\n\n"
    + "## 5.1 Pressure\n\nPressure is a force spread over an area.\n\n## Synthesis\n\nThe chapter ties one equation to its limits.\n\n"
    + "## About this chapter{{attrs[#blk-abc12345]}}\n\n:::info\n**Audience:** students in a general chemistry course\n**Note:** builds on the equilibrium chapter.\n:::\n\nAbout this chapter, gases are simple.\n";
  const u = roles(guide);
  assert.equal(roleOf(u, /^Gases are the simplest/), "framing", "chapter logic");
  assert.equal(roleOf(u, /Clapeyron in 1834/), "teaching", "D19-I: a fact under a framing title is teaching");
  assert.equal(roleOf(u, /^Gases expand to fill/), "teaching", "L1: the title is exact — a lesson under \"Chapter logic and …\" is no frame");
  assert.equal(roleOf(u, /Audience.*\n\*\*Note/), "framing", "a fact-free box under About this chapter (a block id after the title is no part of it)");
  assert.equal(roleOf(u, /^Pressure is a force/), "teaching");
  assert.equal(roleOf(u, /^The chapter ties/), "teaching", "Synthesis is not a framing title");
  // the same titles frame a deck's slides
  assert.deepEqual(roles("<!-- slide -->\n## Chapter Logic\n- One equation describes every gas\n\n<!-- slide -->\n## Pressure\n- Pressure is force per area\n", "slides/x.md").map((x) => x.role), ["framing", "teaching"]);
  // L3: no framing by these titles in a practice file
  assert.equal(roleOf(roles("# Practice\n\n## Chapter logic\n\nGases expand to fill their container.\n", "practice/x.md"), /^Gases expand/), "teaching");
});

test("[req.units.framing-frame] objectives listed under \"(Chapter) learning objectives\" are framing only where the restated-objective check passes them; other items and prose stay teaching", () => {
  const APPROVED = new Set(["Describe the general behavior of gases.", "Explain why gases mix completely."]);
  const isObjective = (t) => APPROVED.has(t.trim());
  const seg = (text, rel = "study-guide/x.md", opts = { isObjective }) => segmentDeliverable(text, rel, opts).units.map((u) => ({ text: u.text, role: derivedRole(u.role, classifyUnit(u)) }));
  const guide = "# Gases\n\n## Chapter learning objectives\n\nRead these before the sections below.\n\n- Describe the general behavior of gases.\n- Gases expand to fill their container because their molecules move freely.\n\n"
    + "## Learning objectives\n\nEach objective is practised in the sheet.\n\n- Explain why gases mix completely.\n\n## 5.1 Pressure\n\nText.\n";
  const u = seg(guide);
  assert.equal(roleOf(u, /Describe the general behavior/), "framing", "an approved objective, restated");
  assert.equal(roleOf(u, /Gases expand to fill/), "teaching", "audit F2: an item the check would not pass is content, owed a link");
  assert.equal(roleOf(u, /^Read these before/), "teaching", "C3-06: prose among the objectives is content");
  assert.equal(roleOf(u, /^Each objective is practised/), "teaching");
  assert.ok(!u.some((x) => /Explain why gases mix/.test(x.text)), "the restated objectives stay structure");
  // without a plan to check against, or under a title that is not exactly the objectives title, nothing is framed
  assert.equal(roleOf(seg(guide, "study-guide/x.md", {}), /Describe the general behavior/), "teaching");
  for (const title of ["Learning objectives and key ideas", "Learning Objectives — and the mechanism"])
    assert.equal(roleOf(seg(guide.replace("Chapter learning objectives", title)), /Describe the general behavior/), "teaching", title);
  // a slide's bullet group is framing only when every item restates an approved objective
  const deck = (b) => seg(`<!-- slide -->\n## Chapter Learning Objectives\n${b}\n\n<!-- slide -->\n## Pressure\n- Force per area\n`, "slides/x.md");
  assert.equal(deck("- Describe the general behavior of gases.\n- Explain why gases mix completely.")[0].role, "framing");
  assert.equal(deck("- Describe the general behavior of gases.\n- **Objective 5.1a** — gases expand to fill their container.")[0].role, "teaching");
  // L3: never in a practice file
  assert.equal(roleOf(seg(guide, "practice/x.md"), /Describe the general behavior/), "teaching");
});

test("[req.units.framing-frame] a study guide's title area is the contiguous containers under its `#` title; only an objectives box whose every item restates an approved objective is framing there", () => {
  const APPROVED = new Set(["Describe the physical characteristics of gases.", "Explain how gases mix."]);
  const isObjective = (t) => APPROVED.has(t.trim());
  const rolesO = (text, rel = "study-guide/x.md") => segmentDeliverable(text, rel, { isObjective }).units.map((u) => ({ text: u.text, role: derivedRole(u.role, classifyUnit(u)) }));
  const box = (title, items) => `:::success\n**${title}**\n${items.map((x) => `- ${x}`).join("\n")}\n:::\n\n`;
  const guide = "# Chapter 5: Gases\n\n" + box("Chapter learning objectives", [...APPROVED]) + ":::info\nRead this chapter after the mole.\n:::\n\n"
    + "This chapter is about gases.\n\n" + box("Chapter learning objectives", [...APPROVED]) + "## 5.1 Pressure\n\nPressure is a force spread over an area.\n";
  const u = rolesO(guide);
  assert.equal(u[0].role, "framing", "the chapter objectives box, every item an approved objective");
  assert.equal(roleOf(u, /^Read this chapter after/), "teaching", "round 2, A2-M1: a box that lists no objectives is not framing");
  assert.equal(roleOf(u, /^This chapter is about gases/), "teaching", "audit F1: a paragraph is lesson text");
  assert.equal(u.at(-2).role, "teaching", "A2-M2: a box after the first non-container unit is no title area");
  // A2-M1: one item that restates no approved objective, prose in the box, no plan, or the title-case title (D19-I)
  assert.equal(rolesO("# G\n\n" + box("Chapter learning objectives", ["Describe the physical characteristics of gases.", "Gases expand to fill any container."]) + "## 5.1\n\nx.\n")[0].role, "teaching");
  assert.equal(rolesO("# G\n\n:::success\nGases expand to fill any container.\n- Explain how gases mix.\n:::\n\n## 5.1\n\nx.\n")[0].role, "teaching");
  assert.equal(roles(guide)[0].role, "teaching", "without a plan to check against, nothing is framed");
  assert.equal(rolesO(guide.replace("Chapter learning objectives", "Chapter Learning Objectives"))[0].role, "teaching", "the classifier reads title-case \"Learning Objectives\" as a name (D19-I)");
  // audit F1 / A2-M2: a guide whose sections are `###` or bold and that closes with `## About this chapter`
  const lesson = "# Gases\n\n" + box("Chapter learning objectives", [...APPROVED]) + "**5.1 Pressure**\n\nPressure is force per area.\n\n:::warning\nA gas fills any container.\n:::\n\n### 5.2 Volume\n\n:::info\nVolume is the space a gas fills.\n:::\n\n## About this chapter\n\n:::info\n**Audience:** students\n:::\n";
  const l = rolesO(lesson);
  assert.equal(l[0].role, "framing");
  assert.equal(roleOf(l, /^A gas fills any/), "teaching", "a lesson callout under a bold section");
  assert.equal(roleOf(l, /^Volume is the space/), "teaching");
  // no `#` title, or nothing after it: no title area; practice has none
  assert.equal(rolesO(box("Chapter learning objectives", [...APPROVED]) + "## 5.1\n\nText.\n")[0].role, "teaching");
  assert.equal(rolesO("# Gases\n\n" + box("Chapter learning objectives", [...APPROVED]))[0].role, "teaching");
  assert.equal(rolesO("# Practice\n\n" + box("Chapter learning objectives", [...APPROVED]) + "## Set 1\n\nText.\n", "practice/x.md")[0].role, "teaching");
});

test("[req.units.framing-frame] a `###`+ label heading with no text under it is framing; a `#`/`##` heading unit, a statement heading and a heading over text stay teaching", () => {
  const guide = "# Gases\n\n## 5.1 Pressure\n\n### What makes a gas different\n\nThe molecules of a gas are far apart.\n\n### Bare\n\n### Boyle's law of 1662\n\n### Worked examples\n\n#### More\n\n### Over a sub-heading\n\n#### Detail\n\nPressure and volume are inversely related.\n\n"
    + "### Gases expand. They fill any container they are in.\n\n"
    + "## Electrons flow from the anode to the cathode\n\n## The salt bridge keeps each half-cell neutral\n\n## Catalysts\n\nA catalyst does not shift the equilibrium.\n";
  const seg = segmentDeliverable(guide, "study-guide/x.md");
  const u = roles(guide);
  assert.equal(roleOf(u, /^### Bare/), "framing", "a `###` label over nothing");
  assert.equal(roleOf(u, /^### Worked examples/), "framing", "a heading over only a heading is over nothing");
  assert.equal(roleOf(u, /^#### More/), "framing");
  assert.equal(roleOf(u, /^### What makes a gas different/), "teaching", "a `###` heading over text (round 2, C3-03)");
  assert.equal(roleOf(u, /^### Over a sub-heading/), "teaching", "a heading over a sub-heading with text heads that text");
  assert.equal(roleOf(u, /Boyle's law of 1662/), "teaching", "a heading that states a fact stays teaching (D19-I)");
  assert.equal(roleOf(u, /^### Gases expand\. They fill/), "teaching", "a statement heading is no label");
  assert.equal(roleOf(u, /^## Electrons flow/), "teaching", "audit F3: a `##` statement heading over nothing is owed a link and the knowledge review (round 3, C3-03)");
  assert.equal(roleOf(u, /^## The salt bridge/), "teaching");
  assert.ok(!seg.units.some((x) => /^## Catalysts/.test(x.text)), "a heading over content stays its section's label");
  // on slides a heading's scope ends at the next slide marker; a `##` slide heading over nothing stays teaching
  const deck = roles("<!-- slide -->\n### Pressure\n\n<!-- slide -->\n## Lonely\n\n<!-- slide -->\n## Volume\n- Volume is the space a gas fills\n", "slides/x.md");
  assert.deepEqual(deck.map((x) => [x.form, x.role]), [["heading", "framing"], ["heading", "teaching"], ["slide-group", "teaching"]]);
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

test("[req.units.framing-frame] in a course: a fact-free box at the end is framing, read for off-plan content and for correctness (F4), owing no link; a named source stays teaching; an approved objective under \"Chapter learning objectives\" is framing; a link on framing covers nothing and says so (L2)", (t) => {
  const c = course(t);
  const BOX = "## About this chapter\n\n:::info\n**Audience:** students in a general chemistry course\n**Note:** builds on the equilibrium chapter.\n:::\n";
  const NAMED = "\n\n:::info\n**Reference:** OpenStax Chemistry 2e, Chapter 15 (CC BY 4.0)\n:::\n";
  const OBJ5 = "Explain why adding an inert gas at constant volume, and why adding a catalyst, do not shift the equilibrium.";
  const LOGIC = "## Chapter logic\n\nA catalyst moves the equilibrium position toward the products by speeding up the forward reaction.\n\n";
  const LIST = `## Chapter learning objectives\n\n- ${OBJ5}\n- A catalyst lowers the activation energy of both directions equally.\n\n`;
  c.asAgent(() => { const f = path.join(c.root, SG); fs.writeFileSync(f, fs.readFileSync(f, "utf8").trimEnd() + "\n\n" + LOGIC + LIST + BOX + NAMED); });
  const all = c.units(), find = (re) => { const u = all.find((x) => re.test(x.text)); assert.ok(u, `no unit ${re}`); return u; };
  const box = find(/\*\*Audience:\*\*/), named = find(/OpenStax/), logic = find(/^A catalyst moves the equilibrium/);
  const obj = find(new RegExp(`^- ${OBJ5.slice(0, 30)}`)), other = find(/^- A catalyst lowers/);
  assert.equal(box.role, "framing"); assert.equal(box.locator.section, "about-this-chapter");
  assert.equal(named.role, "teaching", "a named source is a fact (D19-I)");
  assert.equal(logic.role, "framing");
  assert.equal(obj.role, "framing", "an approved objective, restated: the restated-objective check passes it");
  assert.equal(other.role, "teaching", "a lesson line in the list is content (audit F2)");
  const core = c.core();
  assert.ok(unitsOf(core, "framing-review-owed").has(box.id), "the box is read for off-plan content (D42)");
  assert.ok(!unitsOf(core, "unit-unlinked").has(box.id) && !unitsOf(core, "unit-unlinked").has(logic.id), "framing owes no link");
  assert.ok(unitsOf(core, "unit-unlinked").has(named.id) && unitsOf(core, "unit-unlinked").has(other.id), "teaching owes its link");
  // F4: a knowledge claim in framing is still owed the blind knowledge review (best effort, as for teaching)
  const kn = unreviewedKnowledge(c.root, liveReader(c.root));
  assert.deepEqual(logic.judgment, ["knowledge-based"]);
  assert.ok(kn.includes(logic.id) && kn.includes(box.id), "framing knowledge claims are in the knowledge review set");
  // L2: an objective linked only from framing is uncovered, and the finding names the framing unit
  const O = "objective.le-chatelier.explain-inert-and-catalyst";
  const teachers = c.units().filter((u) => (u.spineNodes || []).includes(O));
  linkUnits(c.root, liveReader(c.root), { ...Object.fromEntries(teachers.map((u) => [u.id, u.spineNodes.filter((n) => n !== O)])), [logic.id]: [O] }, AGENT);
  const unc = c.core().filter((f) => f.kind === "objective-uncovered" && new RegExp(O).test(f.evidence.what));
  assert.equal(unc.length, 1);
  assert.match(unc[0].evidence.what, new RegExp(`linked only from framing.*${logic.id}`));
  // under the guide's title, the fact-free box is no objectives box: teaching (round 2, A2-M1); a box restating an
  // approved objective, checked against the course's own plan, is framing
  const top = course(t);
  top.asAgent(() => top.edit(SG, "# Le Chatelier's Principle\n", `# Le Chatelier's Principle\n\n:::success\n**Chapter learning objectives**\n- ${OBJ5}\n:::\n\n:::info\n**Audience:** students in a general chemistry course\n:::\n`));
  assert.equal(top.units().find((u) => /\*\*Audience:\*\*/.test(u.text)).role, "teaching");
  assert.equal(top.units().find((u) => /\*\*Chapter learning objectives\*\*/.test(u.text)).role, "framing");
});

test("[req.units.framing-frame] courseguide-standards puts the reference box last, under its own `## About this chapter`, and says both boxes stay teaching and owe a link (audit F5: D19-I is not relaxed)", () => {
  const skill = fs.readFileSync(path.join(HERE, "..", "skills", "courseguide-standards", "SKILL.md"), "utf8");
  const sg = skill.slice(skill.indexOf("## 1. STUDY GUIDE"), skill.indexOf("Styling palette"));
  const at = (s) => { const k = sg.indexOf(s); assert.ok(k >= 0, s); return k; };
  assert.ok(at("**Chapter Learning Objectives**") < at("## Chapter Logic") && at("## Chapter Logic") < at("## Asset and License Record") && at("## Asset and License Record") < at("## About this chapter"));
  assert.ok(at("## About this chapter") < at("**Reference:**"), "the box stands under About this chapter");
  assert.match(sg, /`## About this chapter`\*\* — the LAST section/);
  const contract = fs.readFileSync(path.join(HERE, "..", "format-contracts", "deliverables.md"), "utf8");
  assert.match(contract, /reference box .* closes it, under its own last section `## About this chapter`/);
  assert.match(contract, /stay teaching units and each owes a spine link/);
  assert.match(sg, /\*\*The box stays teaching and owes a\s+spine link\.\*\*/);
  assert.match(sg, /Chapter Learning Objectives\*\*` \+ a bullet list[^\n]*stays teaching and owes a spine link/);
  assert.ok(!/section is framing \(read for off-plan content, no spine link needed\)/.test(sg), "the guide does not promise the boxes are framing");
});
