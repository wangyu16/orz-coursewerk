// General Chemistry, Phase 0 (2026-11-04; owner approved "go on as you recommended"). A 19-chapter course converted
// from a pre-v0.12 plan blocked on 2,130 items. Five of the causes were the harness's: MS7 timed out and checked
// nothing; the mechanical reader misread worked forms; two records were taken for unread files or assets; and nothing
// relinked a converted plan or fixed the records' paths after the decks were renamed. Each case is the course's own
// wording, cut down, beside the real errors the reader must still catch.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runCheckpoint, moduleTimeoutMs } from "../scripts/lib/skeleton/runner.mjs";
import { scanConsistency } from "../scripts/lib/consistency.mjs";
import { recheckByRerun } from "../scripts/modules/_shared.mjs";
import { arithmeticMismatches, unbalancedEquations, reactionsIn, mechanicalCoverage } from "../scripts/lib/verify/mechanical.mjs";
import { isHarnessRecord, uncheckedShipped } from "../scripts/lib/core/shipped.mjs";
import { isAssetDescription } from "../scripts/lib/core/asset_description.mjs";
import { createQaAudits } from "../scripts/lib/legacy/qa_audits.mjs";
import { computeComponentGraph } from "../scripts/lib/coherence.mjs";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { indexAndStamp, linkUnits, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { relinkPlan, relinkAfterConversion, pairingProblem, oldObjectives } from "../scripts/lib/core/relink.mjs";
import { renamedRecordPath } from "../scripts/lib/core/record_paths.mjs";
import { renderAttribution } from "../scripts/lib/assurance.mjs";
import { parseLog } from "../scripts/lib/records/log.mjs";
import { createSnapshot } from "../scripts/lib/skeleton/snapshot.mjs";
import { alembicHost } from "../scripts/lib/records/host.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const tmp = (t, name) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `cw-p0-${name}-`)); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const write = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };

// ---- 1. MS7 completes on a course of this size; a timeout is visible as one ------------------------------------------
test("[req.runner.module-time] the module time limit grows with the package; a timed-out run or recheck blocks and says it timed out", (t) => {
  assert.equal(moduleTimeoutMs(0), 120000);
  assert.ok(moduleTimeoutMs(6273) >= 360000, "a 6,273-file course gets six minutes and more");
  assert.ok(moduleTimeoutMs(10000) > moduleTimeoutMs(100));
  const dir = tmp(t, "runner"), root = path.join(dir, "pkg"), mods = path.join(dir, "modules");
  write(root, "study-guide/ch1.md", "# Chapter 1\n\nWater boils at 100 °C at sea level.\n"); fs.mkdirSync(mods);
  const m = (name) => ({ name, version: "1.0.0", serves: ["Confidence"], checkpoints: ["V3"], reads: ["deliverables"], method: "deterministic", cost: "per file", profiles: ["public"], maturity: "stable", mayBlock: true, emits: [{ kind: "wrong-value", statusClass: "defect", evidenceType: "rule", route: "agent" }] });
  fs.writeFileSync(path.join(mods, "spin.mjs"), `export default { manifest: ${JSON.stringify(m("spin"))}, run() { for (;;) {} }, recheck() { return true; } };\n`);
  fs.writeFileSync(path.join(mods, "slowcheck.mjs"), `export default { manifest: ${JSON.stringify(m("slowcheck"))}, run() { return [{ kind: "wrong-value", units: [], evidence: { type: "rule", rule: "r" } }]; }, recheck() { for (;;) {} } };\n`);
  const reg = (name) => ({ schemaVersion: 1, modules: [{ name, version: "1.0.0", maturity: "stable", enabled: true }] });
  const r = runCheckpoint({ root, checkpoint: "V3", profile: "public", registry: reg("spin"), moduleDir: mods, timeoutMs: 1500 });
  const f = r.findings.find((x) => x.kind === "module-failed");
  assert.equal(f.statusClass, "obligation", "a run that did not finish blocks: never a pass");
  assert.equal(f.evidence.timedOut, true); assert.equal(f.evidence.limitSeconds, 2);
  assert.match(f.evidence.what, /spin at V3 \(timed out after 2 s\): nothing it checks was checked/);
  assert.deepEqual(r.wiring.ran, [{ name: "spin", ok: false, timedOut: true }]);
  const r2 = runCheckpoint({ root, checkpoint: "V3", profile: "public", registry: reg("slowcheck"), moduleDir: mods, timeoutMs: 1500 });
  const g = r2.findings.find((x) => x.kind === "module-failed");
  assert.ok(g && g.statusClass === "obligation" && g.evidence.timedOut, "a recheck that did not finish is reported, not only held as a question");
  assert.match(g.evidence.what, /a completed recheck of slowcheck/);
  assert.equal(r2.findings.find((x) => x.module === "slowcheck").statusClass, "question");
});

test("[req.runner.module-time] the consistency scan is fast on a course-sized registry and still finds a disagreement", () => {
  // General Chemistry: 262 terms, 5,086 claims; resolving every label per claim took over ten minutes
  const terms = { schemaVersion: 1, terms: Array.from({ length: 300 }, (_, i) => ({ id: `term.t${i}`, canonical: `widget ${i}`, preferredLabel: `widget ${i}`, aliases: [`gadget ${i}`], status: "confirmed", lifecycle: "active", scope: [`ch${i % 19}`] })) };
  terms.terms.push({ id: "term.melting-point", canonical: "melting point", preferredLabel: "melting point", aliases: [], status: "confirmed", lifecycle: "active", scope: [] });
  const claims = Array.from({ length: 1500 }, (_, i) => ({ id: `c${i}`, text: `The sample of widget ${i % 300} was weighed at ${i} g, then gadget ${(i + 7) % 300} was heated. It took a while.`, type: "fact", scope: `ch${i % 19}`, status: "active", termRefs: [], spineRefs: [], locations: [{ file: "study-guide/x.md" }] }));
  claims.push({ id: "a", text: "The melting point of ice is 0 °C.", type: "fact", scope: null, status: "active", termRefs: [], spineRefs: [], locations: [{ file: "study-guide/a.md" }] });
  claims.push({ id: "b", text: "The melting point of ice is 10 °C.", type: "fact", scope: null, status: "active", termRefs: [], spineRefs: [], locations: [{ file: "practice/a.md" }] });
  const t0 = Date.now();
  const found = scanConsistency(claims, terms);
  assert.ok(Date.now() - t0 < 20000, `took ${Date.now() - t0} ms`);
  assert.ok(found.some((f) => f.kind === "value-disagreement" && f.claimIds.join() === "a,b"));
});

test("[req.runner.module-time] a deterministic module's recheck re-runs it once per snapshot, for every draft", async () => {
  let runs = 0;
  const run = () => { runs++; return [{ kind: "k", evidence: { a: 1 } }, { kind: "k", evidence: { a: 2 } }]; };
  const recheck = recheckByRerun(run), snap = {};
  assert.equal(await recheck({ kind: "k", evidence: { a: 1 } }, snap), true);
  assert.equal(await recheck({ kind: "k", evidence: { a: 2 } }, snap), true);
  assert.equal(await recheck({ kind: "k", evidence: { a: 3 } }, snap), false);
  assert.equal(runs, 1);
  assert.equal(await recheck({ kind: "k", evidence: { a: 1 } }, {}), true);
  assert.equal(runs, 2, "another snapshot re-runs");
});

// ---- 2. the mechanical reader: forms written on purpose are skipped and counted; real errors are still caught -----------
test("[req.mechanical.balance-intended] a reaction set to be balanced, a balancing step, a half-reaction skeleton and a trend arrow are not claims of balance", () => {
  const none = (text, ctx) => assert.deepEqual(unbalancedEquations(text, ctx), [], text);
  // the task
  none("Balance $\\ce{CH4 + O2 -> CO2 + H2O}$.");
  none("{{sp[info] Objective 18.1b}} · *workout* Balance $\\ce{Ca -> Ca^2+}$ and $\\ce{F2 -> 2F-}$ into an overall equation in acidic solution.");
  none("$\\ce{C2H6 + O2 -> CO2 + H2O}$", { headings: ["deck title: Chapter 3", "## Worked example — balancing"] });
  // the steps of a balancing the unit completes
  none("**Hydrogen:** 4 on the left, 2 on the right. Put a 2 in front of $\\ce{H2O}$:\n$$\\ce{CH4 + O2 -> CO2 + 2H2O}$$\n\n**Oxygen last.** Put a 2 in front of $\\ce{O2}$:\n$$\\ce{CH4 + 2O2 -> CO2 + 2H2O}$$");
  none("**Step 3.** $$\\ce{MnO4- -> Mn^2+ + 4H2O} \\quad\\Rightarrow\\quad \\ce{8H+ + MnO4- -> Mn^2+ + 4H2O}$$\n**Step 4.** $$\\ce{5e- + 8H+ + MnO4- -> Mn^2+ + 4H2O}$$");
  // half-reaction skeletons, in a text about half-reactions
  none("Identify each half-reaction as oxidation or reduction: (a) $\\ce{Fe^3+ -> Fe}$; (b) $\\ce{Mn^2+ -> MnO2}$; (c) $\\ce{MnO4^2- -> MnO4^-}$; (d) $\\ce{NO3- -> NO}$.");
  // trend arrows
  none("Explain the two dips in the period-2 ionization-energy trend, at Be→B and at N→O.");
  none("- **N → O.** Nitrogen is $[\\ce{He}]2s^22p^3$ — a half-filled $2p$ subshell.");
  assert.match(reactionsIn("Balance $\\ce{Fe + O2 -> Fe2O3}$.")[0].unread, /asks to balance/);
  assert.equal(mechanicalCoverage([{ id: "u", text: "Balance $\\ce{Fe + O2 -> Fe2O3}$." }]).skipped.length, 1, "skipped and counted, never silent");
  // still caught: a stated reaction, a full redox equation, a step never completed, a same-element arrow, the charge of
  // an ion written in a text that is not about redox, and a "balance" that is a noun
  const one = (text, ctx) => assert.equal(unbalancedEquations(text, ctx).length, 1, text);
  one("Hydrogen burns: $\\ce{H2 + O2 -> H2O}$.");
  one("In acidic solution the overall reaction of the titration is $\\ce{MnO4- + Fe^2+ -> Mn^2+ + Fe^3+}$, the basis of the oxidation-reduction titration.");
  one("Balancing the oxygen first:\n\nThe answer is $\\ce{2C2H6 + 7O2 -> 4CO2 + 5H2O}$.");
  one("$\\ce{H2 -> H}$ in the flame.");
  one("Sulfur and phosphorus: $\\ce{S -> P}$.");
  one("Sulfur cannot become phosphorus: S → P is not a chemical change.");
  one("Sodium forms its ion: $\\ce{Na -> Na+}$.");
  one("The charge balance shows $\\ce{Fe^2+ -> Fe^3+}$ here.");
  one("$\\ce{CH4 + O2 -> CO2 + 2H2O}$ is the combustion.", { headings: ["## Worked example — balancing"] });
});

test("[req.mechanical.recompute-readings] scientific notation, statements set apart, glued variables, a unit after the maths and a conversion written as a factor are read as written", () => {
  const none = (text) => assert.deepEqual(arithmeticMismatches(text), [], text);
  none("$$\\frac{1451}{738}=2.0 \\qquad \\frac{7733}{1451}=5.3 \\qquad \\frac{10540}{7733}=1.4$$");
  none("$$K_{sp} = (s)(2s)^2 = 4s^3 = 3.9\\times10^{-11}$$\n\n**Validate:** $2s = 7.8\\times10^{-7}$, which is small.");
  none("Check against rule 4: $2n^2 = 2(3)^2 = 18$. ✓ with $n=3$");
  none("Convert the edge to centimeters: $409\\ \\text{pm} = 4.09\\times10^{-8}$ cm.");
  none("$1\\ \\text{amu} = 1.6605\\times10^{-27}$ kg; $1\\ \\text{MeV} = 1.602\\times10^{-13}$ J.");
  none("$$P_{\\ce{O2}}=754-19.8=734\\ \\text{mmHg}=\\frac{734}{760}=0.966\\ \\text{atm}$$");
  none("$$\\Delta E = (-0.15925)(1.6605\\times10^{-27}\\ \\text{kg/amu})(2.998\\times10^{8}\\ \\text{m/s})^2 = -2.377\\times10^{-11}\\ \\text{J}$$\n\n$$= \\frac{-2.377\\times10^{-11}}{1.602\\times10^{-13}} = -148.4\\ \\text{MeV per nucleus}$$");
  none("**(c)** $-2.05\\times10^{-11}/1.602\\times10^{-13}=-128\\ \\text{MeV}$");
  none("$K_a(\\ce{NH4+})=K_w/K_b=1.0\\times10^{-14}/1.8\\times10^{-5}=5.6\\times10^{-10}$");
  none("it contributes only $[\\ce{CO3^2-}]/[\\ce{H+}] \\approx 4.8\\times10^{-11}/9.3\\times10^{-5} \\approx 5\\times10^{-7}$ of the $\\ce{H+}$");
  none("(water is an exceptionally weak acid, $K_a\\sim10^{-16}$, versus HF's $K_a\\sim10^{-4}$)");
  none("$$\\frac{[\\ce{H+}]_\\text{cola}}{[\\ce{H+}]_\\text{coffee}} = 10^{(5.0-2.5)} = 10^{2.5} = 320$$");
  none("$$238(8.50) - 238(7.57) = 238(0.93) \\approx 220\\ \\text{MeV}$$");
  // still caught
  const one = (text) => assert.equal(arithmeticMismatches(text).length, 1, text);
  one("$$\\frac{1451}{738}=2.5 \\qquad \\frac{7733}{1451}=5.3$$");
  one("$4.8\\times10^{-11}/9.3\\times10^{-5} = 5\\times10^{-5}$");
  one("$1.0\\times10^{-14}/1.8\\times10^{-5}=5.6\\times10^{-9}$");
  one("$2n^2 = 2(3)^2 = 19$ with $n = 3$");
  one("$$P = 734\\ \\text{mmHg} = \\frac{734}{760} = 0.5\\ \\text{atm}$$");
  one("$$10^{2.5} = 400$$");
  one("$$x = 12(0.61) = 9$$");
  one("$$K = \\frac{(0.20)^2}{(0.10)(0.30)^3} = 1.48$$");
  // trailing zeros: at least two significant figures, never fewer
  one("$$\\frac{2300}{2} = 1000$$");
  assert.deepEqual(arithmeticMismatches("$$\\frac{2050}{2} = 1000$$"), [], "1025 is 1000 at two significant figures");
});

// ---- 3. records the gate took for unread files or assets ---------------------------------------------------------------
test("[req.records.checked-record] provenance/coursewerk/CHECKED.json is a harness record, not an unread shipped file", (t) => {
  assert.equal(isHarnessRecord("provenance/coursewerk/CHECKED.json"), true);
  assert.equal(isHarnessRecord("provenance/coursewerk/NOTES.json"), false, "named exactly: not the folder");
  const dir = tmp(t, "checked");
  fs.cpSync(path.join(ROOT, "tests/fixtures/c2-chemistry-v2/package"), dir, { recursive: true });
  write(dir, "provenance/coursewerk/CHECKED.json", JSON.stringify({ schema: 1, pages: {} }));
  write(dir, "provenance/coursewerk/OTHER.json", "{}");
  const { documents } = uncheckedShipped(dir, liveReader(dir));
  assert.ok(!documents.includes("provenance/coursewerk/CHECKED.json"));
  assert.ok(documents.includes("provenance/coursewerk/OTHER.json"), "any other file there is still read or refused");
});

test("[req.records.asset-description] an asset's .about.json is its description: no provenance record, no visual review, not an asset", (t) => {
  assert.equal(isAssetDescription("assets/gases/barometer.png.about.json"), true);
  assert.equal(isAssetDescription("nacl_salt.jpg.about.json"), true);
  assert.equal(isAssetDescription("assets/.about.json"), false);
  assert.equal(isAssetDescription("assets/x.json"), false);
  const dir = tmp(t, "about");
  write(dir, "assets/nacl.jpg", "jpg"); write(dir, "assets/nacl.jpg.about.json", JSON.stringify({ schema: 1, title: "Salt" }));
  write(dir, "assets/stray.png", "png");
  write(dir, "private/coursewerk/PROVENANCE.json", JSON.stringify({ schemaVersion: 1, items: [{ id: "nacl", localPath: "assets/nacl.jpg", usedIn: [] }] }));
  write(dir, "study-guide/x.md", "# X\n\n![Salt](../assets/nacl.jpg)\n");
  assert.deepEqual(createQaAudits(dir).attributionAudit().unmanifestedMedia, ["stray.png"], "the description is no asset; a real asset without a record still is");
  write(dir, "private/coursewerk/VISUAL_REVIEW.json", "{}");
  const graph = computeComponentGraph(dir);
  assert.equal(graph.components.find((c) => c.path === "assets/nacl.jpg.about.json")?.type, "asset-description");
  const visual = (from) => graph.relationships.some((e) => e.from === `component:${from}` && /visual/.test(e.reason));
  assert.ok(visual("assets/nacl.jpg"), "the asset owes its visual review");
  assert.ok(!visual("assets/nacl.jpg.about.json"), "its description does not");
});

// ---- 4. relink after a plan conversion -----------------------------------------------------------------------------------
const MAP = (objectives) => `# Concept Map — Melting\n\n## Objectives\n${objectives.map(([t, a], i) => `${i + 1}. ${t} [anchor: ${a}]`).join("\n")}\n\n## Concept sequence\n1. A pure solid melts at one temperature. [anchor: pure-melts]\n\n## Key terms\n- **melting point** — the temperature at which a solid melts [concept.melting.pure-melts]\n\n## Misconceptions to surface\n- Solids melt whenever they are warm. [anchor: warm]\n`;
const OBJ = [["State the melting point of ice at standard pressure", "state-mp"], ["Explain why impurities broaden a melting range", "explain-range"]];
const GUIDE = "# Guide\n## State [objective: state-mp]\n**Cognitive level:** remember.\n### Recall [anchor: recall]\n- **Type:** short answer\n- **Count:** 1\n## Explain [objective: explain-range]\n**Cognitive level:** understand.\n### Predict [anchor: predict]\n- **Type:** workout\n- **Count:** 1\n";
const SG = "# Melting\n\n## Chapter logic\n\nThis chapter builds from one fact to one rule.\n\n## 1.1 The melting point\n\n### Learning Objectives\n\n- {{sp[info] Objective 1.1a}} State the melting point of ice.\n\nIce melts at 0 °C at 1 atm.\n\n## 1.2 Ranges\n\n- {{sp[info] Objective 1.2a}} Explain why impurities broaden the melting range.\n\nImpurities broaden the melting range of a solid.\n\n## Asset and License Record\n\nNo assets are used in this chapter.\n";
const PR = "# Practice\n\n:::: tabs\n::: tab Q 1\n{{sp[info] Objective 1.1a}} · *short answer* At what temperature does ice melt at 1 atm?\n:::\n::: tab Answer\nAt 0 °C.\n:::\n::::\n\n:::: tabs\n::: tab Q 2\n{{sp[info] Objective 1.2a}} · *workout* A sample melts over 5 °C. Explain.\n:::\n::: tab Answer\nIt is impure.\n:::\n::::\n";
function converted(t, { objectives = OBJ } = {}) {
  const root = tmp(t, "relink");
  write(root, "alembic.json", JSON.stringify({ chapters: [{ slug: "melting", title: "Melting" }] }));
  write(root, "private/coursewerk/coursewerk.json", JSON.stringify({ schemaVersion: 1, spine: 2 }));
  write(root, "concepts/course.md", "# Course\n\n## Concept sequence\n1. Phases. [anchor: phases]\n\n## Chapter sequence\n1. **melting** — Melting\n");
  write(root, "concepts/melting.md", MAP(objectives)); write(root, "assessment-support/melting.md", GUIDE);
  write(root, "study-guide/melting.md", SG); write(root, "practice/melting.md", PR);
  indexAndStamp(root, liveReader(root), { initialOrigin: { kind: "agent-knowledge", model: "m", step: "pre-existing", date: "2026-10-01" }, party: AGENT });
  return root;
}
const unit = (root, re) => loadUnits(root, liveReader(root)).find((u) => re.test(u.text));

test("[req.units.relink-converted] old objective ids are mapped one to one onto the converted plan and the units linked from their markers, logged, no text edited", (t) => {
  const root = converted(t);
  assert.deepEqual(oldObjectives(SG).map((o) => o.old), ["1.1a", "1.2a"]);
  const before = Object.fromEntries(["study-guide/melting.md", "practice/melting.md"].map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]));
  const r = relinkAfterConversion(root, liveReader(root), AGENT);
  assert.deepEqual(r.chapters.melting.map, { "1.1a": "objective.melting.state-mp", "1.2a": "objective.melting.explain-range" });
  assert.deepEqual(unit(root, /^Ice melts/).spineNodes, ["objective.melting.state-mp"]);
  assert.deepEqual(unit(root, /^Impurities broaden/).spineNodes, ["objective.melting.explain-range"]);
  assert.deepEqual([...unit(root, /^This chapter builds/).spineNodes].sort(), ["objective.melting.explain-range", "objective.melting.state-mp"], "an overview links to every objective");
  assert.deepEqual(unit(root, /^No assets are used/).spineNodes, [], "the asset record is not teaching: left unlinked");
  const q1 = unit(root, /At what temperature/), a1 = unit(root, /At 0 °C\./), q2 = unit(root, /melts over 5/);
  assert.deepEqual(q1.spineNodes, ["guide.melting.recall"]); assert.deepEqual(a1.spineNodes, ["guide.melting.recall"]);
  assert.deepEqual(q2.spineNodes, ["guide.melting.predict"], "a question links to an entry of its own kind");
  for (const [f, text] of Object.entries(before)) assert.equal(fs.readFileSync(path.join(root, f), "utf8"), text, `${f} is not edited`);
  const log = parseLog(fs.readFileSync(path.join(root, "private/coursewerk/LOG.jsonl"), "utf8"));
  const events = log.map((x) => x.payload?.event);
  assert.ok(events.includes("units-linked") && events.at(-1) === "units-relinked-after-conversion");
  assert.equal(log.at(-1).party.role, "agent");
  // run again: everything is linked to the current plan, so it is kept, and nothing is linked twice
  const again = relinkAfterConversion(root, liveReader(root), AGENT);
  assert.equal(again.linked, 0);
  // a dry run writes nothing
  const size = fs.statSync(path.join(root, "private/coursewerk/LOG.jsonl")).size;
  relinkAfterConversion(root, liveReader(root), null, { dryRun: true });
  assert.equal(fs.statSync(path.join(root, "private/coursewerk/LOG.jsonl")).size, size);
});

test("[req.units.relink-converted] a chapter whose old ids and objectives do not correspond is refused, says why, and is not linked", (t) => {
  const swapped = converted(t, { objectives: [OBJ[1], OBJ[0]] });
  const r = relinkAfterConversion(swapped, liveReader(swapped), AGENT);
  assert.equal(r.chapters.melting.status, "refused");
  assert.match(r.chapters.melting.why, /point another way/);
  assert.equal(r.linked, 0);
  assert.ok(loadUnits(swapped, liveReader(swapped)).every((u) => !(u.spineNodes || []).length));
  const fewer = converted(t, { objectives: [OBJ[0]] });
  assert.match(relinkPlan(fewer, liveReader(fewer)).chapters.melting.why, /carries 2 old objective ids \(1\.1a, 1\.2a\) but the plan has 1 objectives/);
  assert.match(pairingProblem([], [{ text: "x" }]), /no old objective ids/);
  assert.throws(() => relinkPlan(fewer, liveReader(fewer), { chapters: ["nowhere"] }), /not a chapter/);
  // a unit already linked to the current plan is kept as it is
  const kept = converted(t);
  const ice = unit(kept, /^Ice melts/);
  linkUnits(kept, liveReader(kept), { [ice.id]: ["concept.melting.pure-melts"] }, AGENT);
  relinkAfterConversion(kept, liveReader(kept), AGENT);
  assert.deepEqual(unit(kept, /^Ice melts/).spineNodes, ["concept.melting.pure-melts"]);
});

test("[req.units.relink-converted] units.mjs relink runs the relink and exits 1 when a chapter is refused", (t) => {
  const root = converted(t, { objectives: [OBJ[1], OBJ[0]] });
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts/units.mjs"), "relink", "--root", root, "--model", "m"], { encoding: "utf8" });
  assert.equal(r.status, 1, r.stderr);
  assert.equal(JSON.parse(r.stdout).chapters.melting.status, "refused");
  const ok = converted(t);
  const r2 = spawnSync(process.execPath, [path.join(ROOT, "scripts/units.mjs"), "relink", "--root", ok, "--model", "m", "--chapter", "melting"], { encoding: "utf8" });
  assert.equal(r2.status, 0, r2.stderr);
  assert.ok(JSON.parse(r2.stdout).linked > 0);
});

// ---- 5. records' paths after files were renamed --------------------------------------------------------------------------
test("[req.records.paths-fix] records_paths points stored deck paths at the renamed decks, logs it, regenerates the attribution, and guesses nothing", (t) => {
  const exists = (set) => (p) => set.has(p);
  assert.equal(renamedRecordPath("slides/gases.md", exists(new Set(["slides/gases.slides.md"]))), "slides/gases.slides.md");
  assert.equal(renamedRecordPath("slides/gases.md", exists(new Set())), null);
  assert.equal(renamedRecordPath("study-guide/gases.md", exists(new Set(["study-guide/gases.slides.md"]))), null);
  const root = tmp(t, "paths");
  write(root, "slides/gases.slides.md", "deck"); write(root, "study-guide/gases.md", "# Gases\n");
  const provenance = { schemaVersion: 1, items: [
    { id: "a", localPath: "assets/a.svg", usedIn: ["study-guide/gases.md", "slides/gases.md"], title: "A", creator: "Me", license: "CC-BY-4.0", attribution: "Mine.", provenanceStatus: "self-generated", publicationStatus: "cleared" },
    { id: "b", localPath: "assets/b.svg", usedIn: ["slides/gone.md"], title: "B", creator: "Me", license: "CC-BY-4.0", attribution: "Mine.", provenanceStatus: "self-generated", publicationStatus: "cleared" }] };
  write(root, "private/coursewerk/PROVENANCE.json", JSON.stringify(provenance, null, 2));
  write(root, "provenance/coursewerk/ATTRIBUTION.md", "# Attribution\n\nGenerated from `metadata/PROVENANCE.json`; do not edit independently.\n");
  write(root, "private/coursewerk/LOG.jsonl", "");
  const deck = fs.readFileSync(path.join(root, "slides/gases.slides.md"), "utf8");
  const cli = (...a) => spawnSync(process.execPath, [path.join(ROOT, "scripts/records_paths.mjs"), "--root", root, ...a], { encoding: "utf8" });
  const dry = cli("--dry-run");
  assert.equal(JSON.parse(dry.stdout).fixed, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "private/coursewerk/PROVENANCE.json"), "utf8")).items[0].usedIn[1], "slides/gases.md", "a dry run writes nothing");
  const r = cli();
  assert.equal(r.status, 1, "a path with no renamed file is reported");
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.changes, [{ record: "private/coursewerk/PROVENANCE.json", at: "items[0].usedIn[1]", from: "slides/gases.md", to: "slides/gases.slides.md" }]);
  assert.deepEqual(out.unresolved, [{ record: "private/coursewerk/PROVENANCE.json", at: "items[1].usedIn[0]", path: "slides/gone.md" }]);
  const now = JSON.parse(fs.readFileSync(path.join(root, "private/coursewerk/PROVENANCE.json"), "utf8"));
  assert.deepEqual(now.items[0].usedIn, ["study-guide/gases.md", "slides/gases.slides.md"]);
  assert.deepEqual(now.items[1], provenance.items[1], "nothing else in a record changes");
  assert.equal(fs.readFileSync(path.join(root, "provenance/coursewerk/ATTRIBUTION.md"), "utf8"), renderAttribution(now));
  assert.equal(fs.readFileSync(path.join(root, "slides/gases.slides.md"), "utf8"), deck, "no material is touched");
  const log = parseLog(fs.readFileSync(path.join(root, "private/coursewerk/LOG.jsonl"), "utf8"));
  assert.equal(log.at(-1).payload.event, "record-paths-fixed");
  assert.equal(log.at(-1).party.role, "harness");
  assert.equal(JSON.parse(cli().stdout).fixed, 0, "run again: nothing left to fix");
});

// ---- 6. alembic.json in an Alembic site is Alembic's own file -----------------------------------------------------------
test("[req.format.site-manifest] in an Alembic site (host mode) the local manifest rule does not judge alembic.json; a local package keeps it", (t) => {
  const site = { schemaVersion: 3, type: "oer-course", title: "General Chemistry", units: [{ slug: "melting", title: "Melting" }] };
  const make = (name, hosted, git = false) => {
    const root = tmp(t, name);
    write(root, "alembic.json", JSON.stringify(site));
    write(root, "study-guide/melting.md", "# Melting\n\nIce melts at 0 °C at 1 atm.\n");
    if (hosted) write(root, ".coursewerk-host.json", JSON.stringify({ schemaVersion: 1, host: "alembic", state: "imported", importedAt: "2026-11-04T00:00:00Z", log: { sha256: "0".repeat(64), bytes: 0, parts: [] }, verification: { parts: [] } }));
    if (git) fs.mkdirSync(path.join(root, ".git"));
    return root;
  };
  const reg = { schemaVersion: 1, modules: [{ name: "ms3-format", version: "1.0.0", maturity: "stable", enabled: true }] };
  const manifestRule = (root) => runCheckpoint({ root, checkpoint: "V8", profile: "public", registry: reg }).findings.filter((f) => f.module === "ms3-format" && (f.evidence?.rule ?? f.evidence?.reported?.rule) === "alembic-manifest");
  const hosted = make("site", true);
  assert.equal(createSnapshot(hosted, { profile: "public", checkpoint: "V8" }).site, "alembic");
  assert.deepEqual(manifestRule(hosted), [], "Alembic's alembic.json is not judged by the local contract");
  const local = make("local", false);
  assert.equal(createSnapshot(local, { profile: "public", checkpoint: "V8" }).site, null);
  assert.ok(manifestRule(local).some((f) => /schemaVersion must be 1 or 2/.test(JSON.stringify(f.evidence))), "a local package keeps the rule");
  // the one test of a site is the gate's host mode: a host record inside a git repository is a local package
  const withGit = make("git", true, true);
  assert.equal(alembicHost(withGit), null);
  assert.ok(manifestRule(withGit).length > 0);
});
