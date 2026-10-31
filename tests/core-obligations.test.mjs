// THE DETERMINISTIC CORE (redesign P5): obligations that block from the first release, and the only ways to clear them.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { readSidecar, beginSession } from "../scripts/lib/core/units_index.mjs";
import { carryUnits, confirmUnits, coreObligations, indexAndStamp, linkUnits, loadUnits, reverifyUnits } from "../scripts/lib/core/obligations.mjs";
import * as obligations from "../scripts/lib/core/obligations.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { verifyKnowledge } from "../scripts/lib/verify/verdicts.mjs";
import { dependencyEdges } from "../scripts/lib/core/dependencies.mjs";
import { parseSpine } from "../scripts/lib/core/spine.mjs";
import { evaluateGate } from "../scripts/lib/skeleton/gate.mjs";

const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
// the routed re-check (R2 coherence F9 removed recordVerification): a blind review of each unit, replayed clean, recorded
const reverified = async (p, ids) => {
  await verifyKnowledge(p.root, p.r(), { verifier: replayVerifier((pr) => ({ nonce: pr.match(/"nonce": "([0-9a-f]+)"/)[1], concerns: [] })), only: ids });
  return reverifyUnits(p.root, p.r(), ids, AGENT);
};
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const MAP = `# Concept Map — Melting

## Objectives
1. State the melting point of ice. [anchor: state-mp]
2. Explain melting ranges. [anchor: explain-range]

## Concept sequence
1. A pure solid melts at one temperature. [anchor: pure-melts]
2. Impurities broaden the range. [prereq: concept.melting.pure-melts] [anchor: impurities]

## Key terms
- **melting point** — the temperature at which a solid melts [concept.melting.pure-melts]

## Misconceptions to surface
- Solids melt whenever they are warm. [anchor: warm]
`;
const GUIDE = `# Guide
## State [objective: state-mp]
**Cognitive level:** remember.
### Recall [anchor: recall]
- **Type:** short answer
- **Count:** 2
## Explain [objective: explain-range]
**Cognitive level:** understand.
### Predict [anchor: predict]
- **Type:** short answer
- **Count:** 1
`;
const SG = `# Melting

## Melting point

Ice melts at 0 °C at 1 atm.

The melting point of a pure solid is sharp and repeatable.

## Ranges

Impurities broaden the melting range of a solid.
`;
const PR = `# Practice

:::: tabs
::: tab Q 1
At what temperature does ice melt at 1 atm?
:::
::: tab Answer 1
At 0 °C.
:::
::::
`;
function pkg(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-core-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  w("alembic.json", JSON.stringify({ chapters: [{ slug: "melting", title: "Melting" }] }));
  w("private/coursewerk/coursewerk.json", JSON.stringify({ schemaVersion: 1, spine: 2 }));
  w("concepts/course.md", "# Course\n\n## Concept sequence\n1. Phases. [anchor: phases]\n\n## Chapter sequence\n1. **melting** — Melting\n");
  w("concepts/melting.md", MAP); w("assessment-support/melting.md", GUIDE); w("study-guide/melting.md", SG); w("practice/melting.md", PR);
  const r = () => liveReader(root);
  indexAndStamp(root, r(), { initialOrigin: { kind: "agent-knowledge", model: "m", step: "pre-existing", date: "2026-10-01" }, party: AGENT });
  const ids = () => Object.fromEntries(loadUnits(root, r()).map((u) => [u.text.slice(0, 18), u.id]));
  return { root, w, r, ids, obligations: () => coreObligations(root, r(), "b"), kinds: () => coreObligations(root, r(), "b").map((f) => f.kind).sort() };
}
function linkAll(p) {
  const id = p.ids();
  linkUnits(p.root, p.r(), {
    [id["Ice melts at 0 °C "]]: ["objective.melting.state-mp", "concept.melting.pure-melts"],
    [id["The melting point "]]: ["concept.melting.pure-melts"],
    [id["Impurities broaden"]]: ["objective.melting.explain-range", "concept.melting.impurities"],
    [id["At what temperatur"]]: ["objective.melting.state-mp", "guide.melting.recall"],
    [id["At 0 °C."]]: ["objective.melting.state-mp", "guide.melting.recall"],
  }, AGENT);
}

test("[req.core.coverage-obligation] unlinked units, uncovered objectives and short guide entries are obligations; a dangling link is a defect", (t) => {
  const p = pkg(t);
  const before = p.kinds();
  assert.ok(before.includes("unit-unlinked") && before.includes("objective-uncovered") && before.includes("guide-entry-short"));
  linkAll(p);
  const after = p.obligations();
  assert.ok(!after.some((f) => f.kind === "unit-unlinked" || f.kind === "objective-uncovered"));
  const short = after.filter((f) => f.kind === "guide-entry-short").map((f) => f.evidence.what).sort();
  assert.deepEqual(short, ["1 more question(s) for guide.melting.predict (has 0 of 1)", "1 more question(s) for guide.melting.recall (has 1 of 2)"]);
  assert.ok(after.every((f) => f.statusClass === "obligation" && f.route === "agent"));
  assert.throws(() => linkUnits(p.root, p.r(), { [p.ids()["Ice melts at 0 °C "]]: ["concept.melting.nowhere"] }, AGENT), /not a spine node/);
  assert.equal(evaluateGate({ findings: after }).canPublish, false);
});

test("[req.core.evidence-obligation] a semi-mechanical fact without admitted evidence is an obligation; one instructor confirmation clears it, a changed value reopens it", (t) => {
  const p = pkg(t); linkAll(p);
  const ice = p.ids()["Ice melts at 0 °C "];
  const evid = () => p.obligations().filter((f) => f.kind === "evidence-missing").map((f) => f.units[0]);
  assert.ok(evid().includes(ice));
  assert.throws(() => confirmUnits(p.root, p.r(), [ice], { what: "fact", instructorWords: "I confirm these." }, AGENT), /instructor's/);
  confirmUnits(p.root, p.r(), [ice], { what: "fact", instructorWords: "I confirm these." }, I);
  assert.ok(!evid().includes(ice));
  // a meaning-free edit (a reflow) keeps the evidence; a changed value loses it
  p.w("study-guide/melting.md", SG.replace("Ice melts at 0 °C at 1 atm.", "Ice melts at 0 °C\nat 1 atm."));
  beginSession(p.root, p.r(), AGENT); indexAndStamp(p.root, p.r(), { as: "agent", party: AGENT });
  assert.ok(!evid().includes(ice), "a reflow: still evidenced");
  // a reordering rephrase changes what the instructor read (R7-K03, D50: the seen key is the ordered reading): the
  // confirmation no longer counts, and they are asked once to confirm it as it reads now
  p.w("study-guide/melting.md", SG.replace("Ice melts at 0 °C at 1 atm.", "At 1 atm, ice melts at 0 °C."));
  beginSession(p.root, p.r(), AGENT); indexAndStamp(p.root, p.r(), { as: "agent", party: AGENT });
  assert.ok(evid().includes(ice), "reordered: asked again");
  assert.ok(p.obligations().some((f) => f.kind === "confirmation-stale" && f.units[0] === ice));
  p.w("study-guide/melting.md", SG.replace("Ice melts at 0 °C at 1 atm.", "At 1 atm, ice melts at 4 °C."));
  beginSession(p.root, p.r(), AGENT); indexAndStamp(p.root, p.r(), { as: "agent", party: AGENT });
  assert.ok(evid().includes(ice), "changed value: evidence no longer counts");
});

test("[req.core.impact] impact follows every mechanical dependency kind", (t) => {
  const p = pkg(t); linkAll(p);
  const units = loadUnits(p.root, p.r());
  const edges = dependencyEdges(units.map((u) => (u.text.startsWith("Ice") ? { ...u, origin: { kind: "source-derived", source: "src.wiki", span: "p1" } } : u)), parseSpine(p.r(), ["melting"]));
  const id = p.ids();
  const kinds = (k) => (edges.get(id[k]) || []).map((e) => `${e.kind}:${e.target}`);
  assert.ok(kinds("Ice melts at 0 °C ").includes(`shared-value:unit:${id["At 0 °C."]}`), "shared value");
  assert.ok(kinds("At 0 °C.").includes(`derivation:unit:${id["At what temperatur"]}`), "answer → question");
  assert.ok(kinds("The melting point ").includes("shared-term:term:melting:melting point"), "key term (namespaced by the map that defines it, R4 F6)");
  assert.ok(kinds("Impurities broaden").includes("spine-node:spine:concept.melting.impurities"), "spine node");
  assert.ok(kinds("Impurities broaden").includes("prerequisite:spine:concept.melting.pure-melts"), "declared prerequisite");
  assert.ok(kinds("Ice melts at 0 °C ").includes("source:source:src.wiki"), "source");
});

test("[req.core.reverify-obligation] a change makes exactly its dependents stale; only a logged blind re-check or the instructor clears them", async (t) => {
  const p = pkg(t); linkAll(p);
  const id = p.ids();
  const stale = () => p.obligations().filter((f) => f.kind === "reverify").map((f) => f.units[0]).sort();
  assert.deepEqual(stale(), []);
  // change the value in the study guide: the practice answer (shares "0 °C") and question (shares "1 atm") go stale — and only they
  p.w("study-guide/melting.md", SG.replace("0 °C", "4 °C"));
  beginSession(p.root, p.r(), AGENT); indexAndStamp(p.root, p.r(), { as: "agent", party: AGENT });
  assert.deepEqual(stale(), [id["At 0 °C."], id["At what temperatur"]].sort());
  // the agent cannot clear by saying so (nor by naming a module: there is no such path, R2 F9); a logged blind re-check can
  assert.equal(obligations.recordVerification, undefined);
  assert.throws(() => reverifyUnits(p.root, p.r(), [id["At 0 °C."]], AGENT), /no logged blind correctness review/);
  await reverified(p, [id["At 0 °C."], id["At what temperatur"]]);
  assert.deepEqual(stale(), []);
  // a spine change: the concept's text changes → units linked to it go stale
  p.w("concepts/melting.md", MAP.replace("A pure solid melts at one temperature.", "A pure solid melts at exactly one temperature, 0 K wide."));
  const s2 = stale();
  assert.ok(s2.includes(id["The melting point "]) && s2.includes(id["Impurities broaden"]), "linked units and units whose prerequisite moved");
  confirmUnits(p.root, p.r(), s2, { what: "still-correct", instructorWords: "I confirm these." }, I);
  assert.deepEqual(stale(), []);
});

test("[req.core.null-edit] a meaning-preserving edit raises nothing beyond its own unit; its facts are still re-checked", (t) => {
  const p = pkg(t); linkAll(p);
  confirmUnits(p.root, p.r(), [p.ids()["Ice melts at 0 °C "], p.ids()["At 0 °C."]], { what: "fact", instructorWords: "I confirm these." }, I);
  const before = p.kinds();
  // (a reflow of a confirmed text; a comma in an unconfirmed one: a reordering rephrase of a confirmed
  // text is asked again since R7-K03, D50 — see req.core.evidence-obligation above)
  p.w("study-guide/melting.md", SG.replace("Ice melts at 0 °C at 1 atm.", "Ice melts at 0 °C\nat 1 atm.").replace("sharp and repeatable", "sharp, and repeatable"));
  beginSession(p.root, p.r(), AGENT); indexAndStamp(p.root, p.r(), { as: "agent", party: AGENT });
  assert.deepEqual(p.kinds(), before, "no new obligation anywhere");
  // the same edit with a negation added is not meaning-preserving: its own fact evidence lapses
  p.w("study-guide/melting.md", SG.replace("Ice melts at 0 °C at 1 atm.", "Ice does not melt at 0 °C at 1 atm."));
  beginSession(p.root, p.r(), AGENT); indexAndStamp(p.root, p.r(), { as: "agent", party: AGENT });
  assert.ok(p.obligations().some((f) => f.kind === "evidence-missing" && f.units[0] === p.ids()["Ice does not melt "]));
});

test("[req.versions.carry] units carried into a new major version start as obligations", async (t) => {
  const p = pkg(t); linkAll(p);
  const ice = p.ids()["Ice melts at 0 °C "];
  confirmUnits(p.root, p.r(), [ice], { what: "fact", instructorWords: "I confirm these." }, I);
  assert.throws(() => carryUnits(p.root, [ice], { version: 2, scope: "chapter:melting" }, AGENT), /instructor's version decision/);
  carryUnits(p.root, [ice], { version: 2, scope: "chapter:melting" }, I);
  const k = p.obligations().filter((f) => f.units[0] === ice).map((f) => f.kind).sort();
  assert.deepEqual(k.filter((x) => x !== "link-review-owed"), ["carried-unverified", "evidence-missing"]); // (its covering link was never reviewed: D41)
  assert.equal(readSidecar(p.root, "study-guide/melting.md").units.find((u) => u.id === ice).evidence.length, 0);
  await reverified(p, [ice]);
  assert.ok(!p.obligations().some((f) => f.kind === "carried-unverified"));
});
