// D49 — ROUND-6 FIX CHOICES (operator 2026-10-12: "all agreed including the 9 spine questions and 'decisions 2 - 5'").
// One regression test per decision implemented here, on the real course (tests/fixtures/c2-chemistry-v2 + inputs):
//   1. spine-detail calibration (refines D48): numerical data, explanations and derivations, attributions and history
//      are detail; an equation, general form or relation NAMED in an objective, concept, key-term gloss or guide item is
//      not, nor is a summary sentence describing what a chapter covers; spine values still meet MS7 ... [req.spine.detail-question]
//   2. the instructor may overrule a blind link review's "no" or "passing", quoting their words; the overrule is bound
//      to the unit's reader-view text and lapses when it changes; coverage then counts the link ...... [req.control.link-overrule]
//   3. a direction-word reversal in the instructor's text ("lowers" → "raises") is a changed fact; deleting one of
//      their paragraphs stays a question ....................................................... [req.instructor-text.direction-reversal]
//   5. SVG and PDF files under assets/ ship as media, like images, and are covered by the visual review; other
//      text-bearing files that ship are still read or refused .............................. [req.control.media-ships-as-media]
// (Decision 4, a re-check that cannot show what changed, is another lane's.) Offline and deterministic: every
// verifier is a replayed test double.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader, manifestChapters } from "../scripts/lib/core/package_reader.mjs";
import { coreObligations, indexAndStamp, linkUnits, loadUnits, teachesInDeliverable } from "../scripts/lib/core/obligations.mjs";
import { beginSession, claimAuthorship } from "../scripts/lib/core/units_index.mjs";
import { spineDetail, spineDetailLines, spineLines } from "../scripts/lib/core/spine_detail.mjs";
import { directionReversal } from "../scripts/lib/core/change.mjs";
import { instructorTextChange } from "../scripts/lib/core/authorship.mjs";
import { buildDigest, answerDigest } from "../scripts/lib/core/digest.mjs";
import { unitInfoOf } from "../scripts/lib/core/workflow.mjs";
import { runCheckpoint } from "../scripts/lib/skeleton/runner.mjs";
import { parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { currentReviewsAt, linkOverrules, reviewAlignment } from "../scripts/lib/verify/alignment.mjs";
import { isMedia, uncheckedShipped } from "../scripts/lib/core/shipped.mjs";
import { computeComponentGraph } from "../scripts/lib/coherence.mjs";
import { createSnapshot } from "../scripts/lib/skeleton/snapshot.mjs";
import ms9 from "../scripts/modules/ms9-alignment.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const SG = "study-guide/le-chatelier.md";
const ANCHOR = "but it also slows the rate.";
const NEIGH = "u-study-guide-le-chatelier-changing-the-temperature-6";

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-d49-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  fs.cpSync(C2, root, { recursive: true }); fs.cpSync(INPUTS, inputs, { recursive: true });
  spawnSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@t", "init", "-q", "-b", "main"]);
  spawnSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@t", "add", "-A"]);
  spawnSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "base"]);
  const c = {
    root, inputs, r: () => liveReader(root),
    units: () => loadUnits(root, liveReader(root)),
    unit: (id) => loadUnits(root, liveReader(root)).find((u) => u.id === id),
    find: (text) => loadUnits(root, liveReader(root)).find((u) => u.text === text),
    read: (rel) => fs.readFileSync(path.join(root, rel), "utf8"),
    write: (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); },
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent(fn) { beginSession(root, liveReader(root), AGENT); fn(); indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    log: () => parseLog(readLogText(root)),
    core: () => coreObligations(root, liveReader(root), "t"),
    ms9: () => ms9.run(createSnapshot(root, { profile: "public", checkpoint: "V8", inputsDir: inputs })),
    ms8f: () => runCheckpoint({ root, checkpoint: "V8", profile: "public", inputsDir: inputs, registry: { schemaVersion: 1, __noStandard: true, modules: [{ name: "ms8-verdicts", version: "1.0.0", maturity: "stable", enabled: true }] } }).findings.filter((f) => f.module === "ms8-verdicts"),
  };
  c.ms8 = (...ids) => c.ms8f().filter((f) => !ids.length || (f.units || []).some((id) => ids.includes(id))).map((f) => `${f.kind}:${f.statusClass}`).sort();
  return c;
}

// ============================================ 1. SPINE-DETAIL CALIBRATION =========================================
test("[req.spine.detail-question] D49 calibration on the C2 spine: of the 9 lines D48 flagged, only the Guldberg–Waage key-term attribution remains", () => {
  const r = liveReader(C2), flags = spineDetailLines(r, manifestChapters(r), { units: loadUnits(C2, r) });
  assert.deepEqual(flags.map((d) => `${d.file}:${d.line}`), ["concepts/chemical-equilibrium.md:46"]);
  assert.deepEqual(flags[0].detail, [{ kind: "an attribution", what: "Guldberg" }, { kind: "an attribution", what: "Waage" }]);
  assert.equal(flags[0].target.deliverable, "study-guide/chemical-equilibrium.md");
  // the 8 lines no longer flagged are still read as spine lines — each is what to teach under D49 (a named equation or
  // reaction, or a chapter summary's sentence)
  for (const [file, line] of [["concepts/course.md", 7], ["concepts/chemical-equilibrium.md", 12], ["concepts/chemical-equilibrium.md", 29], ["concepts/chemical-equilibrium.md", 35],
    ["concepts/chemical-equilibrium.md", 38], ["concepts/chemical-equilibrium.md", 49], ["assessment-support/chemical-equilibrium.md", 145], ["concepts/le-chatelier.md", 12]])
    assert.ok(spineLines(r.text(file)).some((l) => l.line === line), `${file}:${line} is read`);
});

test("[req.spine.detail-question] D49: numerical data, explanations, derivations and attributions are detail; a NAMED equation, form or reaction and a chapter summary are not", () => {
  const kinds = (text, section = "Concept sequence", guide = false) => [...new Set(spineDetail({ text, section }, { guide }).map((x) => x.kind))];
  // KEEP FLAGGING — numerical data
  assert.deepEqual(kinds("The model answer uses $\\Delta H = -92.2\\ \\text{kJ}$ for the synthesis."), ["a value"]);
  assert.deepEqual(kinds("Ammonia boils at −33 °C."), ["a value"]);
  assert.deepEqual(kinds("Here $Q_r = \\frac{(0.20)^2}{(0.10)(0.30)^3} = 14.8$ for the mixture."), ["worked numbers"]);
  // KEEP FLAGGING — explanations and derivations written into the spine
  assert.deepEqual(kinds("A catalyst does not shift the equilibrium because it speeds both directions equally."), ["an explanation"]);
  assert.deepEqual(kinds("Students see that $\\Delta G = \\Delta G^\\circ + RT\\ln Q = RT\\ln(Q/K)$ at any composition."), ["a derivation"]);
  assert.ok(kinds("Rearranging the expression for K gives the concentration of ammonia.").includes("a derivation"));
  // KEEP FLAGGING — attributions and history
  assert.ok(kinds("The law was proposed by Guldberg and Waage in 1864.").includes("an attribution"));
  assert.ok(kinds("**law of mass action** — Guldberg and Waage's rule relating rate to active masses", "Key terms").includes("an attribution"));
  // STOP FLAGGING — an equation, general form or relation NAMED in an objective, concept, key-term gloss or guide item
  assert.deepEqual(kinds("Relate the equilibrium constant to the standard Gibbs energy change using ΔG° = −RT ln K.", "Objectives"), []);
  assert.deepEqual(kinds("For a balanced reaction αA + βB ⇌ σS + τT, the equilibrium constant equals the product concentrations divided by the reactant concentrations.", "Concept sequence"), []);
  assert.deepEqual(kinds("**standard Gibbs energy change** (ΔG°) — the free-energy change related to the equilibrium constant by ΔG° = −RT ln K", "Key terms"), []);
  assert.deepEqual(kinds("Give $K$ and $T$ and ask for $\\Delta G^\\ominus$ from $\\Delta G^\\ominus = -RT \\ln K$. Parameterize across $K > 1$ and $K < 1$.", "x", true), []);
  assert.deepEqual(kinds("Write $K_c = [NH_3]^2/([N_2][H_2]^3)$ for the synthesis $\\ce{N2 + 3H2 <=> 2NH3}$.", "Objectives"), []);
  // STOP FLAGGING — summary sentences describing what a chapter covers (its "only" and its definition included) …
  assert.deepEqual(kinds("Chemical equilibrium is the state of a reversible reaction in which the forward and reverse reactions proceed at equal rates. This chapter defines that state.", "Summary"), []);
  assert.deepEqual(kinds("It also draws the key distinction that only a temperature change alters the value of the equilibrium constant.", "Summary"), []);
  assert.deepEqual(kinds("Chapter 1 introduces the relation ΔG° = −RT ln K and the temperature dependence of K.", "Summary"), []);
  // … but numerical data or history in a summary is still detail
  assert.deepEqual(kinds("This chapter works the synthesis at 450 °C.", "Summary"), ["a value"]);
  assert.ok(kinds("This chapter tells how Haber discovered the synthesis in 1909.", "Summary").includes("an attribution"));
});

test("[req.spine.detail-question] [req.spine.values-consistent] R6-K05 kept under D49: a false value with a unit in the guide's rubric is still the instructor's question", () => {
  const rubric = "**Rubric.** Full credit: the model answer uses $\\Delta H = -75.0\\ \\text{kJ}$ for $\\ce{N2 + 3 H2 <=> 2 NH3}$, so heat sits on the product side.";
  const d = spineDetail({ text: rubric, section: "Changing the temperature" }, { guide: true });
  assert.deepEqual(d, [{ kind: "a value", what: "-75.0kJ" }]);
});

// ============================================ 2. THE INSTRUCTOR OVERRULES A LINK VERDICT ===========================
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];
const declaredOf = (pr) => (pr.split("\nDECLARED ITEMS\n")[1] || "").split("\n\n")[0].split("\n").map((l) => l.replace(/^- /, "").split(":")[0].trim()).filter((l) => /\./.test(l));
const gidsOf = (pr) => [...pr.matchAll(/^- (guide\.\S+): /gm)].map((m) => m[1]);
/** A replayed link reviewer: `verdictFor(node id)` for each declared item. */
const linkReviewer = (verdictFor) => replayVerifier((pr) => ({ nonce: nonceOf(pr), links: declaredOf(pr).map((id) => ({ id, verdict: verdictFor(id), why: "test double" })), also: [], offPlan: false,
  ...(/its assessment guide entry asks for/.test(pr) ? { fidelity: { type: "matches", level: "matches", why: "t" } } : gidsOf(pr).length ? { fidelity: gidsOf(pr).map((id) => ({ id, type: "matches", level: "matches", why: "t" })) } : {}) }));
const emptyDigest = (c) => buildDigest(c.root, [], unitInfoOf(c.root, c.r()));
const overrule = (c, unit, link, words = "That paragraph teaches it: I wrote it to.") => answerDigest(c.root, emptyDigest(c), { overrules: [{ unit, links: [link] }], instructorWords: words, reader: c.r() }, I);

test("[req.control.link-overrule] [req.reviews.standing] the instructor overrules a blind link review's 'no', quoting their words: MS9 stops doubting the link, coverage counts it, and a re-run 'no' of the same text does not undo it", async (t) => {
  const c = course(t);
  const OBJ = "objective.le-chatelier.predict-temperature-shift";
  const teachers = c.units().filter((u) => teachesInDeliverable(u, OBJ));
  assert.ok(teachers.length >= 1, "the fixture has units that teach the objective");
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer((id) => (id === OBJ ? "no" : "yes")), only: teachers.map((u) => u.id) });
  const uncovered = () => c.core().filter((f) => f.kind === "objective-uncovered" && f.evidence.what.includes(OBJ));
  assert.equal(uncovered().length, 1, "every teacher reviewed 'no': the objective is uncovered");
  assert.match(uncovered()[0].evidence.what, /the instructor, who may overrule it \(D49/);
  const doubted = () => c.ms9().filter((f) => f.kind === "link-doubtful" && f.evidence.link === OBJ).map((f) => f.units[0]).sort();
  assert.deepEqual(doubted(), teachers.map((u) => u.id).sort());
  // refused: the agent never answers for the instructor; an answer quotes their words; only an adverse verdict on a
  // declared link can be overruled
  const [u, ...rest] = teachers;
  assert.throws(() => answerDigest(c.root, emptyDigest(c), { overrules: [{ unit: u.id, links: [OBJ] }], instructorWords: "ok", reader: c.r() }, AGENT), /only the instructor/);
  assert.throws(() => answerDigest(c.root, emptyDigest(c), { overrules: [{ unit: u.id, links: [OBJ] }], instructorWords: " ", reader: c.r() }, I), /quotes the instructor's words/);
  assert.throws(() => overrule(c, u.id, "objective.le-chatelier.no-such-thing"), /not linked/);
  const yesLink = u.spineNodes.find((n) => n !== OBJ && !n.startsWith("guide."));
  if (yesLink) assert.throws(() => overrule(c, u.id, yesLink), /already says it teaches it/);
  // the overrule: logged as the instructor's answer, bound to the text a reader is shown
  overrule(c, u.id, OBJ);
  const act = c.log().filter((l) => l.type === "answer").at(-1);
  assert.equal(act.party.role, "instructor"); assert.equal(act.payload.instructorWords, "That paragraph teaches it: I wrote it to.");
  assert.deepEqual(Object.keys(act.payload.answers[0].overrule).sort(), ["link", "linkKey", "seenKey", "unit", "was"]); // linkKey: the item's text it judged (R7 C2-L2)
  assert.equal(act.payload.answers[0].overrule.was, "no");
  assert.equal(linkOverrules(c.log()).get(u.id).length, 1);
  assert.equal(currentReviewsAt(c.root, c.r(), c.units()).get(u.id).verdicts.get(OBJ), "yes");
  assert.deepEqual(doubted(), rest.map((x) => x.id).sort(), "MS9 no longer doubts the overruled link");
  assert.equal(uncovered().length, 0, "coverage counts the overruled link as taught");
  // a re-run of the review on the same text that says "no" again does not undo the instructor's answer
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer((id) => (id === OBJ ? "no" : "yes")), only: [u.id] });
  assert.equal(currentReviewsAt(c.root, c.r(), c.units()).get(u.id).verdicts.get(OBJ), "yes");
  // an edit a reader cannot see keeps it; a real change to the text lapses it, and a fresh review of the new text speaks
  const w = (u.text.match(/\b[a-z]{7,}\b/g) || []).find((x) => c.read(u.locator.deliverable).split(` ${x} `).length === 2);
  c.asAgent(() => c.edit(u.locator.deliverable, ` ${w} `, ` *${w}* `));
  assert.equal(currentReviewsAt(c.root, c.r(), c.units()).get(u.id).verdicts.get(OBJ), "yes", "an invisible edit is no change: the overrule holds");
  const tail = c.unit(u.id).text.trim().slice(-25);
  c.asAgent(() => c.edit(u.locator.deliverable, tail, `${tail} Keep this in mind for the exam.`));
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer((id) => (id === OBJ ? "no" : "yes")), only: [u.id] });
  assert.equal(currentReviewsAt(c.root, c.r(), c.units()).get(u.id).verdicts.get(OBJ), "no", "the text changed: the overrule lapsed");
  assert.ok(doubted().includes(u.id));
});

test("[req.control.link-overrule] an 'in passing' verdict is overruled the same way, and coverage counts it", async (t) => {
  const c = course(t);
  const OBJ = "objective.le-chatelier.predict-temperature-shift";
  const teachers = c.units().filter((u) => teachesInDeliverable(u, OBJ));
  await reviewAlignment(c.root, c.r(), { verifier: linkReviewer((id) => (id === OBJ ? "passing" : "yes")), only: teachers.map((u) => u.id) });
  assert.ok(c.core().some((f) => f.kind === "objective-uncovered" && f.evidence.what.includes(OBJ)), "all in passing: uncovered");
  assert.equal(c.ms9().filter((f) => f.kind === "link-doubtful" && f.evidence.link === OBJ).length, 0, "'passing' raises no link-doubtful, only coverage");
  const rec = overrule(c, teachers[0].id, OBJ, "It teaches the temperature shift; keep it.");
  assert.match(rec.at(-1).choice, /review said "passing"/);
  assert.equal(currentReviewsAt(c.root, c.r(), c.units()).get(teachers[0].id).verdicts.get(OBJ), "yes");
  assert.ok(!c.core().some((f) => f.kind === "objective-uncovered" && f.evidence.what.includes(OBJ)), "covered by the overruled link");
});

// ============================================ 3. A DIRECTION REVERSAL IS A CHANGED FACT ===========================
test("[req.instructor-text.direction-reversal] the reversal reader: a direction word turned round on its axis, or two opposites swapped; a word only added or dropped is no reversal", () => {
  assert.deepEqual(directionReversal("Raising the temperature lowers K.", "Raising the temperature raises K."), { from: ["lowers"], to: ["raises"] });
  assert.deepEqual(directionReversal("It increases the yield.", "It decreases the yield."), { from: ["increases"], to: ["decreases"] });
  assert.deepEqual(directionReversal("The forward reaction is endothermic.", "The forward reaction is exothermic."), { from: ["endothermic"], to: ["exothermic"] });
  assert.ok(directionReversal("fewer moles on the left, more on the right", "more moles on the left, fewer on the right"));
  assert.ok(directionReversal("The equilibrium shifts to the left.", "The equilibrium shifts to the right."));
  assert.equal(directionReversal("The equilibrium shifts.", "The equilibrium shifts to the right."), null);
  assert.equal(directionReversal("Raising the temperature lowers K.", "Raising the temperature lowers K, as expected."), null);
  assert.equal(directionReversal("Heating raises K.", "Warming raises K."), null);
  // in the instructor-text rule: a rewritten sentence that reverses a direction is a changed fact; a deletion is not
  const P = "For an exothermic reaction, raising the temperature lowers the equilibrium constant. The shift is toward the reactants.";
  const ch = instructorTextChange(P, P.replace("lowers", "raises"));
  assert.equal(ch.factChange, true); assert.deepEqual(ch.facts, { from: ["lowers"], to: ["raises"] });
  assert.equal(instructorTextChange(P, P.replace("toward the reactants", "toward the products")).factChange, true);
  assert.equal(instructorTextChange(P, "For an exothermic reaction, raising the temperature lowers the equilibrium constant.").factChange, false, "a sentence deleted: a question only");
  assert.equal(instructorTextChange(P, P.replace("The shift is toward", "The equilibrium moves toward")).factChange, false, "a rewording that keeps every direction");
});

const REV = "For an exothermic reaction, raising the temperature lowers the equilibrium constant.";
const REV2 = "Adding a catalyst changes neither the constant nor the position.";
function instructorWrites(c, paragraphs) {
  const spine = c.unit(NEIGH).spineNodes;
  c.edit(SG, ANCHOR, `${ANCHOR}\n\n${paragraphs.join("\n\n")}`); indexAndStamp(c.root, c.r(), {});
  const ids = paragraphs.map((p) => c.find(p).id);
  claimAuthorship(c.root, { units: ids, instructorWords: "Those paragraphs are mine." }, I);
  linkUnits(c.root, c.r(), Object.fromEntries(ids.map((id) => [id, spine])), AGENT);
  return ids;
}
const UNASKED = "instructor-edit-unasked:question", FACT = "instructor-fact-changed:obligation";
const digestOf = (c) => buildDigest(c.root, runCheckpoint({ root: c.root, checkpoint: "V8", profile: "public", inputsDir: c.inputs, registry: { schemaVersion: 1, __noStandard: true, modules: [{ name: "ms8-verdicts", version: "1.0.0", maturity: "stable", enabled: true }] } }).findings, unitInfoOf(c.root, c.r()));

test("[req.instructor-text.direction-reversal] [req.instructor-text.protected] 'lowers' → 'raises' in the instructor's paragraph blocks like a changed fact — cleared by a revert or their 'keep'; deleting their paragraph stays a question", (t) => {
  const c = course(t);
  const [id] = instructorWrites(c, [REV, REV2]);
  const NOW = REV.replace("lowers", "raises");
  c.asAgent(() => c.edit(SG, REV, NOW));
  assert.deepEqual(c.ms8(id), [UNASKED, FACT]);
  const ob = c.ms8f().find((f) => f.kind === "instructor-fact-changed");
  assert.deepEqual([ob.evidence.from, ob.evidence.to], [["lowers"], ["raises"]]);
  assert.equal(c.ms8f().find((f) => f.kind === "instructor-edit-unasked").recommendation, "revert");
  // the revert clears it
  c.asAgent(() => c.edit(SG, NOW, REV));
  assert.deepEqual(c.ms8(id), []);
  // their "keep" clears it, as for a changed value
  c.asAgent(() => c.edit(SG, REV, REV.replace("exothermic", "endothermic")));
  assert.deepEqual(c.ms8(id), [UNASKED, FACT], "endothermic for exothermic: a changed fact");
  const d = digestOf(c), e = d.entries.find((x) => x.kind === "instructor-edit-unasked");
  answerDigest(c.root, d, { answers: { [e.key]: "keep the edit" }, instructorWords: "keep the edit.", reader: c.r() }, I);
  assert.deepEqual(c.ms8(id), []);
  // control: a paragraph of theirs deleted is their question, never blocking
  const k = course(t);
  const [, id2] = instructorWrites(k, [REV, REV2]);
  k.asAgent(() => k.edit(SG, `\n\n${REV2}`, ""));
  assert.deepEqual(k.ms8f().filter((f) => f.kind.startsWith("instructor-")).map((f) => `${f.kind}:${f.statusClass}`), [UNASKED]);
  assert.ok(k.ms8f().find((f) => f.kind === "instructor-edit-unasked").units.includes(id2));
});

// ============================================ 5. MEDIA FILES SHIP AS MEDIA ========================================
test("[req.control.media-ships-as-media] [req.control.shipped-equals-read] an SVG or PDF under assets/ ships as media, like an image, and owes the visual review; other text-bearing files are still read or refused", (t) => {
  const c = course(t);
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text x="0" y="9">K rises</text></svg>';
  c.write("assets/le-chatelier-shift.svg", SVG);
  c.write("assets/figures/ammonia-plant.PDF", "%PDF-1.4\n% a drawn figure\n");
  c.write("assets/photo.png", "\x89PNG");
  const refused = ["assets/notes.txt", "assets/figure.html", "assets/data.json", "study-guide/figure.svg", "materials/handout.pdf", "figure.svg"];
  for (const rel of refused) c.write(rel, "Raising the temperature raises K for every reaction.");
  const docs = new Set(uncheckedShipped(c.root, c.r()).documents);
  for (const rel of ["assets/le-chatelier-shift.svg", "assets/figures/ammonia-plant.PDF", "assets/photo.png"]) assert.ok(!docs.has(rel), `media: ${rel}`);
  for (const rel of refused) assert.ok(docs.has(rel), `refused: ${rel}`);
  assert.ok(isMedia("assets/x.svg") && isMedia("assets/a/b.pdf") && isMedia("assets/p.png") && isMedia("elsewhere/p.png"));
  assert.ok(!isMedia("slides/x.svg") && !isMedia("x.pdf") && !isMedia("assets/x.html") && !isMedia("assets/x.txt"));
  // covered by the visual review as an image is: every assets/ file re-owes the visual review when it changes, and a
  // deliverable that embeds one is tied to it
  c.write("metadata/VISUAL_REVIEW.json", "{}\n");
  c.edit(SG, ANCHOR, `${ANCHOR}\n\n![The shift on heating](../assets/le-chatelier-shift.svg)`);
  const rel = computeComponentGraph(c.root).relationships;
  const edge = (from, to) => rel.some((e) => e.from === `component:${from}` && e.to === `component:${to}`);
  for (const a of ["assets/le-chatelier-shift.svg", "assets/figures/ammonia-plant.PDF", "assets/photo.png"]) assert.ok(edge(a, "metadata/VISUAL_REVIEW.json"), `visual review: ${a}`);
  assert.ok(edge("assets/le-chatelier-shift.svg", SG), "the study guide embeds it");
});
