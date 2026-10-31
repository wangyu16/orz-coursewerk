// Regressions from the General Chemistry re-evaluation (2026-10-31): a real 0.11-era course run through the harness raised
// false alarms, read the deck at the wrong path, rejected the header Alembic writes on plan files, and let `spine.mjs
// migrate` report a conversion it never made. Each case below is the course's own wording, cut down.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { scanValues } from "../scripts/lib/consistency.mjs";
import { arithmeticMismatches, unbalancedEquations, reactionsIn } from "../scripts/lib/verify/mechanical.mjs";
import { hiddenInText } from "../scripts/lib/core/shipped.mjs";
import { withoutHeader } from "../scripts/lib/core/printed.mjs";
import { chapterFile, chapterOfFile } from "../scripts/lib/core/segment.mjs";
import { parseSpine, checkSpine } from "../scripts/lib/core/spine.mjs";
import { spineDetailLines } from "../scripts/lib/core/spine_detail.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const values = (s) => scanValues(s).map((v) => v.value);

test("[req.values.one-parser] a list dash and a subtraction after a symbol are not signs; a written negative still is", () => {
  assert.deepEqual(values("- 125 g, 1 oz = 28.349 g"), [125, 28.349]);
  assert.deepEqual(values("- 1.30 mol Al ÷ 2 mol (coefficient)"), [1.3, 2]);
  assert.ok(!values("$$?\\,^\\circ\\text{C} = (\\text{K}-273.15\\,\\text{K})$$").includes(-273.15));
  assert.deepEqual(values("The temperature is -40 °C."), [-40]);
  assert.deepEqual(values("x = - 5 g"), [-5]);
  assert.deepEqual(values("ΔT = −300 K"), [-300]);
});

test("[req.mechanical.recompute] a written value ends a chain; pico steps and a variable glued to a number are not mismatches", () => {
  assert.deepEqual(arithmeticMismatches("The decomposition has $k = 3.4\\times10^{-5}\\ \\text{s}^{-1}$ at 298 K and $k = 5.2\\times10^{-4}\\ \\text{s}^{-1}$ at 328 K."), []);
  assert.deepEqual(arithmeticMismatches("**(b)** produced: $\\Delta n = +1$. **Not equal.**\n\n**(c)** none: $\\Delta n = 0$. **Equal.**"), []);
  assert.deepEqual(arithmeticMismatches("$1\\,\\text{nm}=10^{-9}$ m while $1\\,\\text{pm}=10^{-12}$ m"), []);
  assert.deepEqual(arithmeticMismatches("$$1367.3T = 48{,}353 \\quad\\Longrightarrow\\quad T = 35.4\\ ^\\circ\\text{C}$$"), []);
  // a chain that does not compute is still caught, and the next statement's own link is still read
  assert.equal(arithmeticMismatches("$$\\Delta H = -\\tfrac12(-571.6) = +285.8\\ \\text{kJ}$$\n\n$$\\Delta H = 2(-571.6) = -1043.2\\ \\text{kJ}$$").length, 1);
});

test("[req.mechanical.balance] a generic mechanism written in \\ce{} is schematic; a real reaction is still balanced", () => {
  assert.deepEqual(unbalancedEquations("One consistent mechanism: Step 1 (slow): $\\ce{A + B -> I}$; Step 2 (fast): $\\ce{I + B -> C}$."), []);
  assert.match(reactionsIn("Step 2 (fast): $\\ce{I + B -> C}$.")[0].unread, /schematic/);
  assert.equal(unbalancedEquations("$\\ce{S -> P}$").length, 1, "\\ce{} with no mechanism context stays chemistry");
  assert.equal(unbalancedEquations("In the first step, $\\ce{H2 + O2 -> H2O}$.").length, 1);
});

test("[req.control.visible-by-attribute] a table's delimiter row inside a question is structure, not hidden text", () => {
  const t = "# Practice\n\n:::: tabs\n::: tab Q 1\nUse the data:\n\n| Trial | [NO] |\n|---|---|\n| 1 | 0.10 |\n:::\n::: tab Answer\nIt is 2.\n:::\n::::\n";
  assert.deepEqual(hiddenInText(t, "practice/x.md"), []);
});

test("[req.format1.header-structure] the plan is read without the format-1 header Alembic writes on every document", () => {
  const head = "{{nyml\nkind: document\nformat: 1\ntitle: X\nuid: doc-abc123def4567\n}}\n\n";
  const map = "# Concept Map — X\n\n## Objectives\n1. Do a thing. [anchor: do-thing]\n";
  const blanked = withoutHeader(head + map);
  assert.equal(blanked.split("\n").length, (head + map).split("\n").length, "line numbers kept");
  assert.ok(!blanked.includes("nyml") && blanked.includes("## Objectives"));
  assert.equal(withoutHeader(map), map);
  // the C2 fixture's spine checks the same with the header on every plan file
  const dir = path.join(ROOT, "tests/fixtures/c2-chemistry-v2/package");
  const plain = { text: (rel) => (fs.existsSync(path.join(dir, rel)) ? fs.readFileSync(path.join(dir, rel), "utf8") : null) };
  const headed = { text: (rel) => { const t = plain.text(rel); return t != null && /^(?:concepts|assessment-support)\//.test(rel) ? head + t : t; } };
  const chapters = JSON.parse(plain.text("alembic.json")).chapters.map((c) => c.slug);
  assert.deepEqual(checkSpine(parseSpine(headed, chapters), chapters).map((p) => p.rule), checkSpine(parseSpine(plain, chapters), chapters).map((p) => p.rule));
});

test("[req.spine.detail-question] the package's own titles are not attributions", () => {
  const files = {
    "alembic.json": JSON.stringify({ title: "General Chemistry", chapters: [{ slug: "atoms", title: "Atoms, Molecules, and Ions" }] }),
    "concepts/course.md": "# General Chemistry — Course Concept Map\n\n## Summary\nThe course opens with Atoms, Molecules, and Ions and builds from there.\n",
    "concepts/atoms.md": "# Concept Map — Atoms, Molecules, and Ions\n\n## Objectives\n1. Name ions. [anchor: name-ions]\n",
  };
  const reader = { text: (rel) => files[rel] ?? null };
  const att = spineDetailLines(reader, ["atoms"]).flatMap((d) => d.detail).filter((x) => x.kind === "an attribution");
  assert.deepEqual(att, []);
});

test("[req.control.shipped-equals-read] the deck is slides/<slug>.slides.md when the package has it", () => {
  assert.equal(chapterFile("slides", "gases", (p) => p === "slides/gases.slides.md"), "slides/gases.slides.md");
  assert.equal(chapterFile("slides", "gases", () => false), "slides/gases.md");
  assert.equal(chapterFile("study-guide", "gases", () => true), "study-guide/gases.md");
  assert.equal(chapterOfFile("slides/gases.slides.md"), "gases");
  assert.equal(chapterOfFile("slides/gases.md"), "gases");
  assert.equal(chapterOfFile("assets/gases.md"), null);
});

test("[req.docs.migration] migrate refuses a plan older than v0.12 and writes nothing", () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-m011-"));
  try {
    fs.mkdirSync(path.join(dir, "concepts"), { recursive: true });
    fs.writeFileSync(path.join(dir, "alembic.json"), JSON.stringify({ schemaVersion: 2, packageId: "pending", title: "T", license: "CC-BY-4.0", chapters: [{ slug: "intro", title: "Intro" }], createdAt: "2026-10-31T00:00:00Z" }));
    fs.writeFileSync(path.join(dir, "concepts/course.md"), "# T — Course Concept Map\n\n## Course Summary\nText.\n");
    fs.writeFileSync(path.join(dir, "concepts/intro.md"), "# Chapter 1 Concept Map\n\n## Section-Level Concept Map and Objectives\n\n- **Objective 1.1a** — Do it\n");
    const git = (...a) => spawnSync("git", ["-C", dir, ...a], { encoding: "utf8" });
    git("init", "-q"); git("add", "-A"); git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
    const r = spawnSync(process.execPath, [path.join(ROOT, "scripts/spine.mjs"), "migrate", "--root", dir, "--name", "Test Instructor", "--words", "please migrate"], { encoding: "utf8" });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /older than v0\.12/);
    assert.equal(git("status", "--porcelain").stdout.trim(), "", "nothing was written");
    assert.ok(!fs.existsSync(path.join(dir, "metadata/LOG.jsonl")));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
