// House notation (owner 2026-11-02): math in $…$ with LaTeX inside, chemistry in $\ce{}$ — a light check that names
// every spot written another way, never a defect.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { houseNotationSpots } from "../scripts/lib/core/house_notation.mjs";
import { runCheckpoint } from "../scripts/lib/skeleton/runner.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const C2 = path.join(ROOT, "tests/fixtures/c2-chemistry-v2/package");
const rules = (t) => houseNotationSpots(t).map((s) => s.rule);

test("[req.notation.house] notation written outside math is named, with the house form", () => {
  const s = houseNotationSpots("Weak acids have K_a below 1; compare Ksp and pKa. 1.8e-5 and 10^0.\nCH₃COOH gives H⁺; Ag+ precipitates.\nΔG° < 0 and E°cell > 0; Z=82. Use \\times here.");
  const by = Object.fromEntries(s.map((x) => [x.found, x]));
  assert.equal(by["K_a"].rule, "subscript-outside-math"); assert.equal(by["K_a"].house, "$K_a$");
  assert.equal(by["Ksp"].house, "$K_{sp}$");
  assert.equal(by["1.8e-5"].house, "$1.8\\times10^{-5}$");
  assert.equal(by["10^0"].rule, "caret-outside-math");
  assert.equal(by["CH₃COOH"].rule, "unicode-script");
  assert.equal(by["Ag+"].house, "$\\ce{Ag+}$");
  assert.equal(by["ΔG°"].house, "$\\Delta G^\\circ$"); assert.equal(by["E°cell"].house, "$E^\\circ_\\text{cell}$");
  assert.equal(by["Z=82"].rule, "equation-outside-math");
  assert.ok(rules("Use \\times here.").includes("latex-outside-math"));
  assert.deepEqual(s.map((x) => x.line), [...s.map((x) => x.line)].sort((a, b) => a - b), "in reading order");
});

test("[req.notation.house] inside math: Unicode where LaTeX belongs, a word subscript, math that cannot typeset", () => {
  assert.deepEqual(rules("$K_a = 2.9×10³$"), ["unicode-in-math", "unicode-in-math"]);
  assert.deepEqual(rules("$x − 1$ and $a·b$"), ["unicode-in-math", "middle-dot-in-math"]);
  assert.deepEqual(rules("$E^\\circ_{cell}$"), ["word-subscript-in-math"]);
  assert.deepEqual(rules("$\\frac{1}{$"), ["math-does-not-typeset"]);
  assert.deepEqual(rules("one $x$ and a lone $ here"), ["unpaired-dollar"]);
  assert.deepEqual(rules("$K_{sp}$ = ($6.90\\times10^{-3}$)(2×$6.90\\times10^{-3}$)"), ["split-math", "split-math"], "one expression in several spans");
  assert.deepEqual(rules("$a$, $b$ and $c$"), [], "a list of separate symbols is not one expression");
});

test("[req.notation.house] the house notation itself, code, diagrams, links and directive heads raise nothing", () => {
  const ok = [
    "$K_a = 2.9\\times10^{3}$, $\\ce{CH3COOH + H2O <=> CH3COO- + H3O+}$, $E^\\circ_\\text{cell}$, $6.63\\times10^{-34}\\,\\text{J·s}$",
    "$$\\Delta G^\\circ = -nFE^\\circ_\\text{cell}$$",
    "Run `K_a = 1.8e-5` in code; a price of \\$5.",
    "```\nK_a = 1.8e-5 -> x²\n```",
    "{{mermaid\ngraph TD\n  A[\"K_a, H⁺\"] --> B[\"Ksp\"]\n}}",
    "See [the K_a table](https://example.org/K_a_table) and ![H₂O](../assets/h2o_model.svg).",
    "{{sp[info] Objective 1.1a}} State a law. <!-- slide v=K_a -->",
    "pH = 4.74 at 25 °C; HCl and NaOH; ICE table; SI units.",
  ];
  for (const t of ok) assert.deepEqual(houseNotationSpots(t), [], t);
});

test("[req.notation.house] the gate shows one note per text, routed to the agent, never a defect; the CLI lists every spot", (t) => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-house-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(C2, dir, { recursive: true });
  const sg = path.join(dir, "study-guide/le-chatelier.md");
  fs.appendFileSync(sg, "\nThe constant K_c and Kp change only with temperature; 1.0e-3 is small.\n");
  const cli = spawnSync(process.execPath, [path.join(ROOT, "scripts/house_notation.mjs"), "--root", dir, "study-guide/le-chatelier.md"], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  const out = JSON.parse(cli.stdout);
  assert.deepEqual(out.files[0].spots.map((s) => s.found), ["K_c", "Kp", "1.0e-3"]);
  const reg = { schemaVersion: 1, __noStandard: true, modules: [{ name: "ms3-format", version: "1.0.0", maturity: "stable", enabled: true }] };
  const run = (root) => runCheckpoint({ root, checkpoint: "V8", profile: "public", registry: reg, inputsDir: null }).findings.filter((f) => f.kind === "house-notation");
  const notes = run(dir);
  assert.equal(notes.length, 1);
  assert.ok(notes[0].statusClass === "question" && notes[0].route === "agent", "a note for the agent, never a defect");
  assert.match(notes[0].evidence.note, /study-guide\/le-chatelier\.md: 3 spot\(s\).*K_c.*\$K_c\$/);
  assert.deepEqual(run(C2), [], "the clean C2 package raises nothing");
});
