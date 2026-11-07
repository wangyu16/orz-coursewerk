// AUDIT (independent, 2026-11-06) of req.units.framing-frame (branch framing-reference-box, cf4aca6). Each test states
// the guarantee it expects; a failing test is a finding. Nothing here changes implementation.
// Registered as evidence of req.units.framing-frame with the fixes. F5 is resolved the other way (coordinator,
// 2026-11-06: D19-I is not relaxed): the prescribed boxes stay teaching, and the guide now says so and how to link them.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyUnit, derivedRole, segmentDeliverable } from "../scripts/lib/core/segment.mjs";
import { indexAndStamp, loadUnits, unreviewedKnowledge } from "../scripts/lib/core/obligations.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const SG = "study-guide/le-chatelier.md";
const roles = (text, rel = "study-guide/x.md") => segmentDeliverable(text, rel).units.map((u) => ({ text: u.text, form: u.form, role: derivedRole(u.role, classifyUnit(u)) }));
const roleOf = (units, re) => { const u = units.find((x) => re.test(x.text)); assert.ok(u, `no unit ${re}`); return u.role; };

// F1 — the title area runs to the first `##`, and the guide now PRESCRIBES a closing `## About this chapter`: a guide
// whose sections are `###` (or bold pseudo-headings) has its whole lesson in the "title area". The protection "a guide
// with no section has no title area" is defeated by the very section the guide adds.
test("AUDIT F1: a lesson written under `###` sections is not a title area just because the guide closes with `## About this chapter`", () => {
  const lesson = "# Gases\n\n### 5.1 Pressure\n\nGases expand to fill their container because their molecules move freely.\n\n- Heating a gas makes its molecules move faster.\n\n";
  const without = roles(lesson);
  assert.equal(roleOf(without, /^Gases expand/), "teaching", "control: no `##`, no title area");
  const withAbout = roles(lesson + "## About this chapter\n\n:::info\n**Audience:** students\n:::\n");
  assert.equal(roleOf(withAbout, /^Gases expand/), "teaching", "the lesson paragraph became framing (no link, no knowledge review)");
  assert.equal(roleOf(withAbout, /Heating a gas/), "teaching");
});

// F2 — two readers of "Learning objectives": the restated-objective check (learningObjectiveSections, exact title) and
// the new framing rule (OBJECTIVES_SECTION, a PREFIX with \b). A list under "## Learning objectives and key ideas" or
// "## Chapter Learning Objectives" is checked by neither: not restated (no check against the approved objectives), and
// framing (no link, no knowledge review). Before the change these items were teaching units owed a link (C3-06 spirit).
test("AUDIT F2: a list item in an objectives-like section is either checked as a restated objective or owed a link", () => {
  for (const title of ["Learning objectives and key ideas", "Chapter Learning Objectives", "Learning Objectives — and the mechanism"]) {
    const u = roles(`# Gases\n\n## ${title}\n\n- Gases expand to fill their container because their molecules move freely.\n\n## 9.1\n\nx.\n`);
    const item = u.find((x) => /Gases expand/.test(x.text));
    assert.ok(!item || item.role === "teaching", `"${title}": the lesson bullet is framing and is not a restated objective either`);
  }
});

// F3 — redteam r3 C3-03 asserted statement headings over nothing are "owed a link and a review"; the branch edited that
// test. For `#`/`##`, a heading-form unit exists ONLY when it reads as sentences or is a label over nothing, so the new
// rule flips exactly the attack case. A wrong conceptual statement in such a heading is now read only for off-plan
// content: the knowledge review (verdicts.mjs verifyKnowledge, obligations.mjs unreviewedKnowledge) skips framing.
test("AUDIT F3: a `##` statement heading over nothing is still read for correctness (Level 2)", () => {
  const u = roles("# Cells\n\n## 1 Galvanic cells\n\nIntro text here.\n\n## Electrons flow from the cathode to the anode through the wire\n\n## Next\n\nText.\n");
  assert.equal(roleOf(u, /^## Electrons flow/), "teaching", "the (wrong) statement heading is framing: no link, no knowledge review");
});

// F4 — units that turn framing leave the Level-2 knowledge review set: unreviewedKnowledge no longer reports them.
function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-frame-audit-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  return { root, asAgent: (fn) => { beginSession(root, liveReader(root), AGENT); fn(); indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); } };
}
test("AUDIT F4: a knowledge-based conceptual claim under `## Chapter logic` is still owed the blind knowledge review", (t) => {
  const c = course(t);
  const CLAIM = "A catalyst moves the equilibrium position toward the products by speeding up the forward reaction.";
  c.asAgent(() => { const f = path.join(c.root, SG); fs.writeFileSync(f, fs.readFileSync(f, "utf8").trimEnd() + `\n\n## Chapter logic\n\n${CLAIM}\n`); });
  const u = loadUnits(c.root, liveReader(c.root)).find((x) => x.text === CLAIM);
  assert.ok(u, "indexed");
  assert.deepEqual(u.judgment, ["knowledge-based"]);
  assert.ok(unreviewedKnowledge(c.root, liveReader(c.root)).includes(u.id), `role ${u.role}: the wrong claim is out of the knowledge review`);
});

// F5 — the guide promised the prescribed boxes were framing; with the prescribed wording they never are (D19-I reads the
// textbook name, "Chapter 9", the licence and the title-case "Chapter Learning Objectives" as facts). Resolution: D19-I
// holds — both boxes stay teaching, owing a spine link — and the guide says so instead of promising framing.
test("AUDIT F5: the boxes courseguide-standards prescribes stay teaching (D19-I), and the guide says they owe a link", () => {
  const g = "# Chapter 9: Gases\n\n:::success\n**Chapter Learning Objectives**\n- Describe the physical characteristics of gases.\n:::\n\n## Chapter Logic\n\nThe chapter moves from pressure to the gas laws.\n\n## 9.1 Pressure\n\nText.\n\n"
    + "## About this chapter\n\n:::info\n**Reference:** OpenStax Chemistry 2e, Chapter 9 (CC BY 4.0)\n**Audience:** first-year general chemistry students\n**Package license:** CC BY 4.0\n:::\n";
  const u = roles(g);
  assert.equal(roleOf(u, /\*\*Chapter Learning Objectives\*\*/), "teaching", "the prescribed objectives box carries a fact");
  assert.equal(roleOf(u, /\*\*Reference:\*\*/), "teaching", "the prescribed reference box carries a fact");
  const skill = fs.readFileSync(path.join(HERE, "..", "skills", "courseguide-standards", "SKILL.md"), "utf8");
  assert.ok(!/section is framing \(read for off-plan content, no spine link needed\)/.test(skill), "no promise that the boxes are framing");
  assert.match(skill, /stays teaching and owes a\s+spine link/);
});
