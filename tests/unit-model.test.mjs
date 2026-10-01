// THE UNIT MODEL (redesign P4): segmentation, stable identity, origin, unknown authorship, judgment kinds, framing.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { classifyUnit, segmentDeliverable, uncoveredLines, unitHash } from "../scripts/lib/core/segment.mjs";
import { beginSession, claimAuthorship, indexUnits, readSidecar, unindexedFindings } from "../scripts/lib/core/units_index.mjs";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { validateUnit } from "../scripts/lib/records/units.mjs";

const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const GUIDE = `# Melting

## Learning objectives

1. State the melting point of ice.

## Melting point

A pure solid melts at a single temperature, its melting point.

Ice melts at 0 °C at 1 atm, as Celsius proposed in 1742.

- Impurities lower the melting point.
- They also broaden the range.

$$T_m = 273.15\\ \\text{K}$$

:::info
Salt on roads works because of this.
:::

| substance | melting point |
|---|---|
| ice | 0 °C |

{{mermaid}}
graph LR; A-->B
{{/mermaid}}

## Worked examples

:::: tabs
::: tab Worked example 1
What is 0 °C in kelvin?
:::
::: tab Solution 1
0 + 273.15 = 273.15 K.
:::
::::
`;
const SLIDES = `<!-- deck
title: Melting
-->

<!-- slide template=title -->
# Melting
An introduction

<!-- slide template=outline -->
## What we will cover
- Melting points
- Mixtures

<!-- slide -->
## Melting points
- A pure solid melts at one temperature.
- A mixture melts over a range.
`;
function pkg(t, files = { "study-guide/melting.md": GUIDE, "slides/melting.md": SLIDES }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-units-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  w("alembic.json", JSON.stringify({ chapters: [{ slug: "melting", title: "Melting" }] }));
  for (const [rel, text] of Object.entries(files)) w(rel, text);
  return { root, w, reader: () => liveReader(root), side: (rel = "study-guide/melting.md") => readSidecar(root, rel) };
}
const forms = (seg) => seg.units.map((u) => u.form);

test("[req.units.segmenter] every block form becomes a unit; structure is skipped; no prose is left out", () => {
  const g = segmentDeliverable(GUIDE, "study-guide/melting.md");
  assert.deepEqual(forms(g), ["paragraph", "paragraph", "list-item", "list-item", "equation", "callout", "table-row", "figure", "question", "answer"]);
  assert.ok(!g.units.some((u) => /State the melting point of ice/.test(u.text)), "the restated learning objectives are structure");
  assert.deepEqual(uncoveredLines(GUIDE, g), []);
  const s = segmentDeliverable(SLIDES, "slides/melting.md");
  assert.deepEqual(s.units.map((u) => `${u.form}:${u.role}`), ["paragraph:framing", "slide-group:framing", "slide-group:teaching"]);
  assert.deepEqual(uncoveredLines(SLIDES, s), []);
});

test("[req.units.identity] ids survive rewording, reordering and moves; splits, merges and deletions are recorded", (t) => {
  const p = pkg(t);
  indexUnits(p.root, p.reader(), { initialOrigin: { kind: "agent-knowledge", model: "m", step: "pre-existing", date: "2026-10-01" }, party: AGENT });
  const before = Object.fromEntries(p.side().units.map((u) => [u.text ?? u.locator.contentHash, u.id]));
  const id = (pred) => p.side().units.find(pred)?.id;
  const pure = id((u) => u.tokens.includes("single")), ice = id((u) => u.tokens.includes("celsius"));
  // reword one paragraph, swap two list items
  p.w("study-guide/melting.md", GUIDE.replace("A pure solid melts at a single temperature, its melting point.", "A pure solid melts at one single temperature, called its melting point.")
    .replace("- Impurities lower the melting point.\n- They also broaden the range.", "- They also broaden the range.\n- Impurities lower the melting point."));
  indexUnits(p.root, p.reader());
  assert.equal(id((u) => u.tokens.includes("single")), pure, "reworded keeps its id");
  assert.equal(id((u) => u.tokens.includes("celsius")), ice);
  // split the first paragraph into two; delete the callout; insert a new paragraph
  p.w("study-guide/melting.md", GUIDE.replace("A pure solid melts at a single temperature, its melting point.", "A pure solid melts at a single temperature.\n\nThat temperature is its melting point, single and sharp.")
    .replace(":::info\nSalt on roads works because of this.\n:::\n", "").replace("## Worked examples", "Pressure barely changes the melting point.\n\n## Worked examples"));
  const r = indexUnits(p.root, p.reader());
  assert.equal(r.summary.splits, 1);
  assert.ok(p.side().units.filter((u) => u.splitFrom === pure).length === 2);
  assert.ok(parseLog(readLogText(p.root)).some((x) => x.type === "unit-retirement"));
  assert.ok(r.summary.new >= 1);
  void before;
});

test("[req.units.origin] every unit records its origin: what the agent writes in a session is agent knowledge; explicit origins are honoured", (t) => {
  const p = pkg(t, { "study-guide/melting.md": "# Melting\n", "slides/melting.md": SLIDES });
  indexUnits(p.root, p.reader(), { initialOrigin: { kind: "instructor-authored", instructor: I.name, date: "2026-10-01" }, party: I });
  beginSession(p.root, p.reader(), AGENT);
  p.w("study-guide/melting.md", GUIDE);
  const seg = segmentDeliverable(GUIDE, "study-guide/melting.md").units;
  const src = { kind: "source-derived", source: "src.wiki-melting", span: "§2 p1" };
  indexUnits(p.root, p.reader(), { as: "agent", party: AGENT, origins: { [unitHash(seg[0].text)]: src } });
  const units = p.side().units;
  assert.deepEqual(units[0].origin, src);
  assert.equal(units[1].origin.kind, "agent-knowledge"); assert.equal(units[1].origin.model, "claude-opus-5-5");
  assert.equal(p.side("slides/melting.md").units[0].origin.kind, "instructor-authored", "the instructor's pre-existing slides keep their stated origin");
  assert.ok(units.every((u) => validateUnit(u).length === 0));
  // text that already existed when the session began, never indexed, is not credited to the agent
  const q = pkg(t);
  beginSession(q.root, q.reader(), AGENT);
  indexUnits(q.root, q.reader(), { as: "agent", party: AGENT });
  assert.ok(q.side().units.every((u) => u.origin.kind === "unknown"));
});

test("[req.units.external-edit] an edit made outside an agent session is of unknown authorship, raised once, and settled by the instructor", (t) => {
  const p = pkg(t);
  indexUnits(p.root, p.reader(), { initialOrigin: { kind: "agent-knowledge", model: "m", step: "pre-existing", date: "2026-10-01" }, party: AGENT });
  // the instructor edits by hand between sessions
  p.w("study-guide/melting.md", GUIDE.replace("Salt on roads works because of this.", "Road salt works because of this — my favourite example."));
  assert.equal(unindexedFindings(p.root, p.reader(), "b")[0].kind, "units-not-indexed");
  // the agent then starts a session and writes its own change
  beginSession(p.root, p.reader(), AGENT);
  p.w("study-guide/melting.md", fs.readFileSync(path.join(p.root, "study-guide/melting.md"), "utf8").replace("Impurities lower the melting point.", "Impurities lower the melting point measurably."));
  const r = indexUnits(p.root, p.reader(), { as: "agent", party: AGENT });
  const units = p.side().units;
  const hand = units.find((u) => u.tokens.includes("favourite")), agents = units.find((u) => u.tokens.includes("measurably"));
  assert.equal(hand.origin.kind, "unknown"); assert.equal(agents.origin.kind, "agent-knowledge");
  assert.equal(r.findings.length, 1); assert.equal(r.findings[0].kind, "unit-unknown-authorship"); assert.equal(r.findings[0].statusClass, "question");
  // re-indexing raises the same question, with the same id — it is one question, not a new one each run
  const again = indexUnits(p.root, p.reader());
  assert.equal(again.findings[0].id, r.findings[0].id);
  // accept as mine
  assert.throws(() => claimAuthorship(p.root, { units: [hand.id] }, AGENT), /confirmed by the instructor/);
  claimAuthorship(p.root, { units: [hand.id] }, I);
  assert.equal(p.side().units.find((u) => u.id === hand.id).origin.kind, "instructor-authored");
  assert.deepEqual(indexUnits(p.root, p.reader()).findings, []);
  assert.throws(() => indexUnits(p.root, p.reader(), { as: "agent", party: AGENT }), /needs an open agent session/);
});

test("[req.units.classifier] judgment kinds are assigned deterministically, erring toward inclusion; the agent may add, never remove", (t) => {
  assert.deepEqual(classifyUnit({ form: "equation", text: "$$K = [A]/[B]$$" }), ["mechanical"]);
  assert.ok(classifyUnit({ form: "paragraph", text: "A mixture of 0.80 M acid stays constant for an hour at room temperature." }).includes("semi-mechanical"));
  assert.ok(classifyUnit({ form: "paragraph", text: "This form follows from the law that Guldberg and Waage stated for reaction rates." }).includes("semi-mechanical"));
  assert.ok(classifyUnit({ form: "paragraph", text: "The highest yield is obtained when the reaction is cooled slowly over time." }).includes("semi-mechanical"));
  assert.deepEqual(classifyUnit({ form: "paragraph", text: "Equilibrium is dynamic: molecules keep reacting in both directions all the time." }), ["knowledge-based"]);
  assert.ok(classifyUnit({ form: "answer", text: "0 + 273.15 = 273.15 K." }).includes("mechanical"));
  const p = pkg(t);
  indexUnits(p.root, p.reader(), { initialOrigin: { kind: "agent-knowledge", model: "m", step: "pre-existing", date: "2026-10-01" }, party: AGENT });
  const side = p.side(); side.units[2].judgmentAdded = ["semi-mechanical"]; side.units[2].judgment = side.units[2].judgment.filter((k) => k === "knowledge-based");
  fs.writeFileSync(path.join(p.root, "metadata/units/study-guide/melting.md.json"), JSON.stringify(side));
  indexUnits(p.root, p.reader());
  assert.ok(p.side().units[2].judgment.includes("semi-mechanical"), "an added kind is kept");
  assert.ok(p.side().units.find((u) => u.form === "equation").judgment.includes("mechanical"), "a classified kind cannot be removed");
});

test("[req.units.framing] framing units carry no facts: a framing unit with a value becomes teaching", (t) => {
  const p = pkg(t, { "slides/melting.md": SLIDES.replace("- Mixtures", "- Mixtures, which melt 2 °C lower on average") });
  indexUnits(p.root, p.reader(), { initialOrigin: { kind: "agent-knowledge", model: "m", step: "pre-existing", date: "2026-10-01" }, party: AGENT });
  const units = p.side("slides/melting.md").units;
  assert.equal(units[0].role, "framing");
  assert.equal(units[1].role, "teaching", "the outline group now states a value");
  assert.match(validateUnit({ ...units[1], role: "framing" }).join(), /framing unit may not carry/);
});

// The preregistered study_pairs edit classes, at the unit level: what each must do to identity and content hash.
test("[req.units.identity] the study_pairs edit classes on units: null edits keep id and hash; real edits keep id, move the hash", (t) => {
  const P1 = "A pure solid melts at a single temperature, its melting point.";
  const P2 = "Ice melts at 0 °C at 1 atm, as Celsius proposed in 1742.";
  const cases = [
    ["null-whitespace", (g) => g.replace(P1, P1.replace(" melts ", "  melts ")), "same-hash"],
    ["null-reflow", (g) => g.replace(P1, "A pure solid melts at a single\ntemperature, its melting point."), "same-hash"],
    ["null-formatting", (g) => g.replace(P1, "A **pure** solid melts at a single temperature, its melting point."), "same-hash"],
    ["null-rephrase", (g) => g.replace(P1, "A pure solid melts at one single temperature, called its melting point."), "same-id"],
    ["real-value-change", (g) => g.replace(P2, P2.replace("0 °C", "4 °C")), "same-id"],
    ["real-term-rename", (g) => g.replace(P1, P1.replace("melting point", "fusion point")), "same-id"],
    ["real-reorder", (g) => g.replace(`${P1}\n\n${P2}`, `${P2}\n\n${P1}`), "same-hash"],
    ["asset-swap", (g) => g.replace("graph LR; A-->B", "graph LR; A-->C"), "same-id"],
  ];
  for (const [name, edit, expect] of cases) {
    const p = pkg(t);
    indexUnits(p.root, p.reader(), { initialOrigin: { kind: "agent-knowledge", model: "m", step: "pre-existing", date: "2026-10-01" }, party: AGENT });
    const before = new Map(p.side().units.map((u) => [u.id, u.locator.contentHash]));
    p.w("study-guide/melting.md", edit(GUIDE));
    const r = indexUnits(p.root, p.reader());
    const after = new Map(p.side().units.map((u) => [u.id, u.locator.contentHash]));
    assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), `${name}: every id kept`);
    const moved = [...after].filter(([id, h]) => before.get(id) !== h).length;
    if (expect === "same-hash") assert.equal(moved, 0, `${name}: no content hash moved`);
    else assert.equal(moved, 1, `${name}: exactly one unit's content hash moved`);
    assert.equal(r.summary.new + r.summary.retired, 0, `${name}: nothing new, nothing retired`);
  }
});
