// AUDIT ROUND 2 (independent, 2026-11-06) of req.units.framing-frame (branch framing-reference-box, 39246c2). Each test
// states the guarantee it expects; a FAILING test is a finding. Nothing here changes implementation. Registered as
// evidence of req.units.framing-frame with the round-2 fixes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyUnit, derivedRole, segmentDeliverable } from "../scripts/lib/core/segment.mjs";
import { segmentOptions } from "../scripts/lib/core/units_index.mjs";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const APPROVED = new Set(["Describe the general behavior of gases."]);
const isObjective = (t) => APPROVED.has(t.trim());
const roles = (text, rel = "study-guide/x.md") => segmentDeliverable(text, rel, { isObjective }).units.map((u) => ({ text: u.text, role: derivedRole(u.role, classifyUnit(u)) }));
const roleOf = (units, re) => { const u = units.find((x) => re.test(x.text)); assert.ok(u, `no unit ${re}`); return u.role; };

// A2-M1 (MEDIUM) — F2 made objectives framing only where EVERY item passes the restated-objective check. The title-area
// rule (segment.mjs roleFor, `form === "callout" && titleArea`) frames the chapter-objectives box whatever it lists: with
// a lower-case title (no "name" for D19-I to see) a box of items that restate no approved objective — a lesson line, a
// wrong objective — is framing, owing no link and passing no mechanical check. REQUIREMENTS says the box "stays teaching".
test("AUDIT2 M1: a title-area objectives box whose items restate no approved objective is not framing", () => {
  const box = (title) => `# Gases\n\n:::success\n**${title}**\n- Describe the general behavior of gases.\n- Explain why a catalyst shifts the equilibrium toward the products.\n:::\n\n## Chapter Logic\n\nText.\n`;
  for (const title of ["Chapter learning objectives", "Learning objectives"])
    assert.equal(roleOf(roles(box(title)), /\*\*.*objectives\*\*/i), "teaching", `"${title}": an unapproved (wrong) objective in the box is framing`);
});

// A2-M2 (MEDIUM) — F1 bounded the title area at the next heading of ANY level, but a guide sectioned by bold
// pseudo-headings (F1's own scenario) that closes with the prescribed `## About this chapter` still has every lesson
// callout (`:::warning` common mistakes, `:::info` asides) in its "title area": all framing, no link.
test("AUDIT2 M2: lesson callouts after the first lesson paragraph are not title area (bold-sectioned guide)", () => {
  const g = "# Gases\n\n**5.1 Pressure**\n\nPressure is force per area.\n\n:::warning\nA catalyst shifts the equilibrium toward the products.\n:::\n\n"
    + "**5.2 Volume**\n\n:::info\nGases expand to fill their container because their molecules move freely.\n:::\n\n## About this chapter\n\n:::info\n**Audience:** students\n:::\n";
  const u = roles(g);
  assert.equal(roleOf(u, /^A catalyst shifts/), "teaching", "a lesson callout under a bold section is framing");
  assert.equal(roleOf(u, /^Gases expand/), "teaching");
});

// A2-L1 (LOW) — the restated-objective cache (units_index.mjs objectiveTest) is keyed by chapter + plan text, not by
// the manifest it also reads: on one reader, dropping the chapter from alembic.json leaves the old test in place.
test("AUDIT2 L1: the objective test follows a manifest change on the same reader", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-audit2-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"); fs.cpSync(C2, root, { recursive: true });
  const r = liveReader(root), rel = "study-guide/le-chatelier.md";
  const O = "Explain why adding an inert gas at constant volume, and why adding a catalyst, do not shift the equilibrium.";
  assert.equal(segmentOptions(r, rel).isObjective(O), true);
  const m = path.join(root, "alembic.json"), j = JSON.parse(fs.readFileSync(m, "utf8"));
  j.chapters = j.chapters.filter((c) => c.slug !== "le-chatelier"); fs.writeFileSync(m, JSON.stringify(j));
  assert.equal(segmentOptions(liveReader(root), rel).isObjective, null, "control: a fresh reader sees no plan");
  assert.equal(segmentOptions(r, rel).isObjective, null, "the same reader still frames objectives of a chapter no longer in the manifest");
});

// Verified sound (passing controls).
test("AUDIT2 controls: the fixes hold", () => {
  // F2: continuation / hidden / sibling content breaks the restated match
  const list = (body) => roles(`# G\n\n## Chapter learning objectives\n\n${body}\n\n## 5\n\nx.\n`);
  assert.equal(roleOf(list("- Describe the general behavior of gases.\n  Catalysts shift equilibrium toward products."), /Describe/), "teaching");
  assert.equal(roleOf(list("- Describe the general behavior of gases.<!-- hidden -->"), /Describe/), "teaching");
  assert.equal(roleOf(list("- Describe the general behavior of gases.\n    - Catalysts shift equilibrium toward products."), /Catalysts/), "teaching");
  // slides: prose before or after the objective bullets is its own teaching unit
  const deck = roles("<!-- slide -->\n## Chapter Learning Objectives\nCatalysts shift equilibrium toward products.\n- Describe the general behavior of gases.\n\n<!-- slide -->\n## P\n- x is y\n", "slides/x.md");
  assert.equal(roleOf(deck, /^Catalysts/), "teaching");
  // F3: `##` statement heading over nothing stays teaching
  assert.equal(roleOf(roles("# C\n\n## 1 A\n\nIntro.\n\n## Electrons flow from the cathode to the anode\n\n## B\n\nT.\n"), /^## Electrons/), "teaching");
});
