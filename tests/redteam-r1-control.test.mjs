// 3C red team, round 1: CONTROL (studies/p11/redteam/control, 2026-10-06). Every finding the round showed to be a
// clear harness bug, replayed as its attack on the real course fixture with replayed reviewer answers, now raises what
// it should. Offline and deterministic.
//
// Two rules this file fixes, and why (each read from the spine grammar and the coverage rules, not invented here):
//   C1-04 — answers. objective-uncovered counts every teaching unit of a study guide or slides linked to the objective,
//     and a study guide's worked-example Solution IS teaching there (it shows the reasoning the objective asks for).
//     So answers keep counting toward coverage, and the link review now reads them — with their question as context —
//     so review and coverage read exactly the same set (obligations.mjs `reviewable` / `teachesInDeliverable`).
//   C1-10 — course-map objectives. The grammar links a chapter to the course map only through `[prereq: …]` (the
//     slice chapterCoverage binds into the chapter's approval). So a course objective is covered through the chapter
//     spine when a chapter objective or concept names it as a prerequisite (that node is itself checked by
//     objective-uncovered), or directly when a study-guide/slides teaching unit links it; otherwise it is the
//     obligation `course-objective-uncovered`.
// Held for the operator's decision (tests marked todo, so they stay tracked): an unreviewed link raising something
// (C2-01), "passing" not counting as coverage (C1-09), reviewing framing units (C3-07), DOCUMENTS.json handouts (C3-14).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader, manifestChapters } from "../scripts/lib/core/package_reader.mjs";
import { indexAndStamp, linkUnits, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { reviewAlignment } from "../scripts/lib/verify/alignment.mjs";
import { recordApproval, approvalStatus } from "../scripts/lib/core/approvals.mjs";
import { checkSpine, parseSpine } from "../scripts/lib/core/spine.mjs";
import { readLogText } from "../scripts/lib/records/log.mjs";
import { segmentDeliverable } from "../scripts/lib/core/segment.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const SCRIPTS = path.join(HERE, "..", "scripts");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const git = (root, ...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });
const OBJ = "objective.le-chatelier.explain-inert-and-catalyst";
const SG = "study-guide/le-chatelier.md", SL = "slides/le-chatelier.md", PR = "practice/le-chatelier.md";
const FALSE = "u-study-guide-le-chatelier-the-principle-1"; // states the principle; nothing on inert gases or catalysts
const Q1 = "u-practice-le-chatelier-questions-1"; // short answer on the word "partially"
const CATALYST_END = "now seen from the Le Chatelier side.";

/** A fresh copy of the real course, under git so the log check is live, with its baseline finding set. */
function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-rt1-ctl-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  fs.cpSync(C2, root, { recursive: true }); fs.cpSync(INPUTS, inputs, { recursive: true });
  git(root, "init", "-q", "-b", "main"); git(root, "add", "-A"); git(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "baseline");
  const c = {
    root, r: () => liveReader(root),
    gate: () => runGate(root, { inputsDir: inputs }),
    units: () => loadUnits(root, liveReader(root)),
    unit: (id) => loadUnits(root, liveReader(root)).find((u) => u.id === id),
    file: (rel) => path.join(root, rel),
    read: (rel) => fs.readFileSync(path.join(root, rel), "utf8"),
    write: (rel, s) => fs.writeFileSync(path.join(root, rel), s),
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 50)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent: (fn) => { beginSession(root, liveReader(root), AGENT); fn(); indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    link: (map) => linkUnits(root, liveReader(root), map, AGENT),
    cli: (script, ...a) => spawnSync("node", [path.join(SCRIPTS, script), ...a], { encoding: "utf8" }),
  };
  c.base = sigs(c.gate().findings);
  return c;
}
const sigOf = (f) => `${f.module}|${f.kind}|${f.statusClass}|${[...(f.units || [])].sort().join(",")}|${(f.units || []).length ? "" : String(f.evidence?.what || f.evidence?.rule || f.evidence?.note || "").slice(0, 120)}`;
const sigs = (fs_) => new Set(fs_.map(sigOf));
const added = (c, findings = c.gate().findings) => findings.filter((f) => !c.base.has(sigOf(f)));
const kinds = (fs_) => fs_.map((f) => `${f.kind}:${f.statusClass}${f.route ? `:${f.route}` : ""}${(f.units || []).length ? `(${f.units.join(",")})` : ""}`);
/** Drop OBJ from every study-guide and slides unit that teaches it (whatever is linked next is its only cover). */
const uncover = (c) => { const ts = c.units().filter((u) => /^(study-guide|slides)\//.test(u.locator.deliverable) && (u.spineNodes || []).includes(OBJ)); c.link(Object.fromEntries(ts.map((u) => [u.id, u.spineNodes.filter((n) => n !== OBJ)]))); };

/** What an alignment prompt asks: the declared ids, the passage, its context, and the guide entries (id null: the one-entry wording). */
function parsePrompt(pr) {
  const nonce = pr.match(/"nonce": "([0-9a-f]+)"/)[1];
  const declared = pr.split("\nDECLARED ITEMS\n")[1].split("\n\n")[0].split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
  const passage = pr.split(/\nPASSAGE(?: \([^)]*\))?\n/).pop();
  const before = (pr.split("\nTEXT BEFORE THE PASSAGE (context only)\n")[1] || "").split(/\n\nPASSAGE/)[0];
  const one = (pr.match(/its assessment guide entry asks for: (.*?)\. Say whether/) || [])[1] || null;
  const block = pr.includes("linked to several assessment guide entries") ? pr.split("linked to several assessment guide entries")[1].split("\nJudge what")[0] : "";
  const guides = one ? [{ id: null, ask: one }] : [...block.matchAll(/^- (guide\.\S+): (.*)$/gm)].map((m) => ({ id: m[1], ask: m[2] }));
  return { nonce, declared, passage, before, guides };
}
/** A replayed reviewer: judge(p) → { verdicts: {id: v}, offPlan, fidelity(g) → {type, level} }; unmentioned ids are "yes". */
function reviewer(judge = () => ({})) {
  const seen = [];
  const verifier = replayVerifier((pr) => {
    const p = parsePrompt(pr); seen.push(p);
    const j = judge(p) || {}, fid = (g) => ({ type: "matches", level: "matches", why: "", ...(j.fidelity ? j.fidelity(g) : {}) });
    return { nonce: p.nonce, links: p.declared.map((id) => ({ id, verdict: j.verdicts?.[id] ?? "yes", why: j.why || "" })), also: [], offPlan: !!j.offPlan,
      ...(p.guides.length === 1 && p.guides[0].id === null ? { fidelity: fid(p.guides[0]) } : p.guides.length ? { fidelity: p.guides.map((g) => ({ id: g.id, ...fid(g) })) } : {}) };
  });
  return { seen, verifier };
}
const honestOBJ = () => reviewer(({ passage }) => ({ verdicts: { [OBJ]: /inert gas/i.test(passage) && /catalyst/i.test(passage) ? "yes" : "no" }, why: "judged on the passage" }));
const ms9 = (c) => added(c).filter((f) => f.module === "ms9-alignment");

// ================================================== C2 ===========================================================
test("[req.control.review-current-record] C2-02: an edit, a 'yes' review and a revert do not hide the older 'no' review that matches the unit as it is now", async (t) => {
  const c = course(t);
  uncover(c); c.link({ [FALSE]: [...c.unit(FALSE).spineNodes, OBJ] }); // the false link is the objective's only cover
  const honest = honestOBJ();
  await reviewAlignment(c.root, c.r(), { verifier: honest.verifier, only: [FALSE] });
  assert.ok(ms9(c).some((f) => f.kind === "link-doubtful" && f.units.includes(FALSE)), "the review works");
  const text = c.unit(FALSE).text, last = text.trim().split("\n").pop().slice(-40);
  const ADD = " Two changes shift nothing: an inert gas added at constant volume changes no partial pressure, and a catalyst speeds the forward and reverse reactions equally.";
  c.asAgent(() => c.edit(SG, last, last + ADD));
  await reviewAlignment(c.root, c.r(), { verifier: honest.verifier, only: [FALSE] });
  assert.ok(!ms9(c).some((f) => f.kind === "link-doubtful" && f.units.includes(FALSE)), "the edited unit does teach it");
  c.asAgent(() => c.edit(SG, last + ADD, last)); // revert: byte-identical to what the first review read
  assert.equal(c.unit(FALSE).text, text);
  assert.deepEqual(honest.seen.map((p) => (/catalyst/i.test(p.passage) ? "yes" : "no")), ["no", "yes"]);
  assert.ok(ms9(c).some((f) => f.kind === "link-doubtful" && f.units.includes(FALSE) && f.statusClass === "question" && f.route === "agent"),
    `the current 'no' review stands again: ${kinds(ms9(c))}`);
});

test("[req.control.review-record-bound] C2-03: a logged review whose 'declared', 'alignmentBasis' or time is edited is a dispatch the log does not vouch for (a blocking defect), never a silent pass", async (t) => {
  const c = course(t);
  uncover(c); c.link({ [FALSE]: [...c.unit(FALSE).spineNodes, OBJ] });
  const [res] = await reviewAlignment(c.root, c.r(), { verifier: honestOBJ().verifier, only: [FALSE] });
  const file = c.file(`metadata/verification/${res.dispatch}.json`), orig = fs.readFileSync(file, "utf8");
  assert.ok(ms9(c).some((f) => f.kind === "link-doubtful"));
  for (const [field, value] of [["declared", []], ["alignmentBasis", "0".repeat(64)], ["at", "2099-01-01T00:00:00.000Z"]]) {
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(orig), [field]: value }, null, 2) + "\n");
    const g = c.gate(), f = added(c, g.findings);
    assert.ok(f.some((x) => x.kind === "dispatch-unlogged" && x.statusClass === "defect" && x.evidence.dispatch === res.dispatch), `${field} edited: ${kinds(f)}`);
    assert.equal(g.gate.canPublish, false, `${field} edited: nothing publishes`);
  }
  fs.writeFileSync(file, orig);
  assert.ok(!added(c).some((x) => x.kind === "dispatch-unlogged"), "the record as logged is vouched for again");
  assert.ok(ms9(c).some((f) => f.kind === "link-doubtful"));
});

test("[req.control.review-fails-closed] C2-16: verdicts are read case-insensitively, and an omitted link, an unknown verdict, an unreadable fidelity or an unscorable answer is a question — never silence", async (t) => {
  const c = course(t);
  uncover(c); c.link({ [FALSE]: [...c.unit(FALSE).spineNodes, OBJ] });
  const run = async (label, answer) => { await reviewAlignment(c.root, c.r(), { verifier: replayVerifier(answer), only: [FALSE, Q1] }); const f = ms9(c); return { label, f, has: (kind, id) => f.some((x) => x.kind === kind && x.units.includes(id)) }; };
  const ans = (pr, verdictOf, fidelity) => { const p = parsePrompt(pr); return { nonce: p.nonce, links: p.declared.filter((id) => verdictOf(id) !== undefined).map((id) => ({ id, verdict: verdictOf(id), why: "" })), also: [], offPlan: false, ...(p.guides.length ? { fidelity } : {}) }; };
  // capitalised words are read
  let r = await run("No / Differs", (pr) => ans(pr, (id) => (id === OBJ ? "No" : "Yes"), { type: "Differs", level: "matches", why: "recall, not explanation" }));
  assert.ok(r.has("link-doubtful", FALSE), `${r.label}: ${kinds(r.f)}`);
  assert.ok(r.has("assessment-fidelity", Q1), `${r.label}: ${kinds(r.f)}`);
  assert.ok(!r.f.some((x) => x.kind === "alignment-unscorable"), `${r.label}: readable`);
  // prose instead of JSON: unscorable, and the last readable review's "no" still stands
  r = await run("prose", () => "The passage states the principle; it does not deal with inert gases or catalysts.");
  assert.ok(r.has("alignment-unscorable", FALSE) && r.has("alignment-unscorable", Q1), `${r.label}: ${kinds(r.f)}`);
  assert.ok(r.has("link-doubtful", FALSE), "an unreadable re-run does not hide the earlier 'no'");
  // a link left out, and a fidelity phrased in words: the omission is a question, the words are read
  r = await run("omitted / does not match", (pr) => ans(pr, (id) => (id === OBJ ? undefined : "yes"), { type: "does not match", level: "matches", why: "" }));
  assert.ok(r.has("alignment-unscorable", FALSE), `${r.label}: ${kinds(r.f)}`);
  assert.ok(r.has("assessment-fidelity", Q1), `${r.label}: ${kinds(r.f)}`);
  assert.ok(r.f.every((x) => x.statusClass === "question") && r.f.filter((x) => x.kind === "alignment-unscorable").every((x) => x.route === "agent"));
  // an unknown verdict and an unreadable fidelity
  r = await run("maybe / unclear", (pr) => ans(pr, (id) => (id === OBJ ? "maybe" : "yes"), { type: "unclear", level: "matches", why: "" }));
  assert.ok(r.has("alignment-unscorable", FALSE) && r.has("alignment-unscorable", Q1), `${r.label}: ${kinds(r.f)}`);
  // a clean, readable re-review closes it
  r = await run("clean", (pr) => ans(pr, () => "yes", { type: "matches", level: "matches", why: "" }));
  assert.deepEqual(kinds(r.f), [], `${r.label}: nothing remains`);
});

// ================================================== C1 ===========================================================
test("[req.control.answers-reviewed] C1-04: an answer counts toward coverage, so the link review reads it — with its question — and a false link from it is raised", async (t) => {
  const c = course(t);
  uncover(c);
  const ANS = "u-study-guide-le-chatelier-worked-examples-2"; // Solution 1: heat as a product (temperature, not OBJ)
  const a = c.unit(ANS), q = c.unit("u-study-guide-le-chatelier-worked-examples-1");
  assert.equal(a.form, "answer"); assert.ok(!/inert|catalyst/i.test(a.text));
  c.link({ [ANS]: [...a.spineNodes, OBJ] });
  assert.ok(!added(c).some((f) => f.kind === "objective-uncovered"), "the answer is in the study guide's teaching: it counts");
  const honest = honestOBJ();
  const scope = c.units().filter((u) => /^(study-guide|slides)\/le-chatelier/.test(u.locator.deliverable)).map((u) => u.id);
  await reviewAlignment(c.root, c.r(), { verifier: honest.verifier, only: scope });
  const sent = honest.seen.find((p) => p.passage.includes(a.text.slice(0, 60)));
  assert.ok(sent, "the answer is reviewed");
  assert.ok(sent.before.includes(q.text.slice(0, 60)), "with its question as context");
  assert.ok(sent.declared.includes(OBJ));
  assert.ok(ms9(c).some((f) => f.kind === "link-doubtful" && f.units.includes(ANS)), kinds(ms9(c)).join(" "));
});

test("[req.control.course-objectives-covered] C1-10: an approved course-map objective nothing teaches is an obligation; a chapter node naming it as a prerequisite, or a unit linking it, covers it", (t) => {
  const c = course(t);
  const ID = "objective.course.ice-table-calculation";
  c.edit("concepts/course.md", "## Concept sequence\n", "## Objectives\n1. Use an ICE table to calculate the equilibrium concentrations of a reaction from its initial concentrations and its equilibrium constant. [anchor: ice-table-calculation]\n\n## Concept sequence\n");
  recordApproval(c.root, c.r(), manifestChapters(c.r()), { chapter: null, instructorWords: "Approve the course map with the ICE-table objective." }, I);
  const g = c.gate(), f = added(c, g.findings).filter((x) => x.kind === "course-objective-uncovered");
  assert.equal(f.length, 1, kinds(added(c, g.findings)).join(" ")); assert.equal(f[0].statusClass, "obligation"); assert.equal(f[0].route, "agent");
  assert.match(f[0].evidence.what, /ice-table-calculation/);
  assert.equal(g.gate.canPublish, false);
  // a teaching unit that links it covers it
  const u = c.unit("u-study-guide-le-chatelier-changing-a-concentration-1");
  c.link({ [u.id]: [...u.spineNodes, ID] });
  assert.ok(!added(c).some((x) => x.kind === "course-objective-uncovered"), "linked from a teaching unit");
  c.link({ [u.id]: u.spineNodes });
  assert.ok(added(c).some((x) => x.kind === "course-objective-uncovered"));
  // so does a chapter concept that names it as a prerequisite (the grammar's link from a chapter to the course map)
  const line = c.read("concepts/chemical-equilibrium.md").split("\n").find((l) => /^\d+\. /.test(l) && l.includes("[anchor:") && l.includes("[prereq:"));
  assert.ok(line, "a concept with prerequisites");
  c.edit("concepts/chemical-equilibrium.md", line, line.replace("[prereq: ", `[prereq: ${ID}, `));
  assert.ok(!added(c).some((x) => x.kind === "course-objective-uncovered"), "named by a chapter node");
});

// ================================================== C3 ===========================================================
test("[req.control.guide-only-links] C3-05: a passage linked only to a guide entry is unlinked (a guide entry is for questions) and is reviewed against the entry and its objective", async (t) => {
  const c = course(t);
  const OFF = "Electrochemistry is a separate topic worth a look here. A galvanic cell converts chemical energy into electrical energy through a spontaneous redox reaction, with oxidation at the anode and reduction at the cathode, and a salt bridge keeps the two half-cells electrically neutral.";
  c.asAgent(() => c.edit(SG, CATALYST_END, `${CATALYST_END}\n\n${OFF}`));
  const off = c.units().find((u) => u.text === OFF);
  c.link({ [off.id]: ["guide.le-chatelier.word-partially"] });
  assert.ok(added(c).some((f) => f.kind === "unit-unlinked" && f.units.includes(off.id) && f.statusClass === "obligation"), "unlinked: blocking");
  // a question (and its answer) linked only to a guide entry is fine
  const q = c.unit(Q1);
  c.link({ [Q1]: ["guide.le-chatelier.word-partially"] });
  assert.ok(!added(c).some((f) => f.kind === "unit-unlinked" && f.units.includes(Q1)));
  c.link({ [Q1]: q.spineNodes });
  const honest = reviewer(({ passage }) => (/galvanic/i.test(passage) ? { offPlan: true, verdicts: { "guide.le-chatelier.word-partially": "no", "objective.le-chatelier.state-principle": "no" } } : {}));
  await reviewAlignment(c.root, c.r(), { verifier: honest.verifier, only: c.units().filter((u) => u.locator.deliverable === SG).map((u) => u.id) });
  const p = honest.seen.find((x) => /galvanic/i.test(x.passage));
  assert.ok(p, "the passage is reviewed");
  assert.deepEqual(p.declared.sort(), ["guide.le-chatelier.word-partially", "objective.le-chatelier.state-principle"]);
  const f = ms9(c).filter((x) => x.units.includes(off.id)).map((x) => x.kind).sort();
  assert.deepEqual(f, ["link-doubtful", "link-doubtful", "off-spine"]);
});

test("[req.control.objectives-section] C3-06: only the list items of a Learning objectives section are structure; other prose in it is units, and every list item in it is checked as a restated objective", (t) => {
  const c = course(t);
  const at = "5. Explain why adding an inert gas at constant volume, and why adding a catalyst, do not shift the equilibrium.\n";
  const OFF = "Before the principle, a detour into electrochemistry. A galvanic cell converts chemical energy into electrical energy through a spontaneous redox reaction: oxidation happens at the anode, reduction at the cathode, and a salt bridge keeps both half-cells electrically neutral.";
  const before = c.units().filter((u) => u.locator.deliverable === SG).length;
  c.asAgent(() => c.edit(SG, at, `${at}\n${OFF}\n\n### Also in this chapter\n\n- Name the anode and the cathode of a galvanic cell and say which electrode is oxidized.\n- Explain what the salt bridge does.\n`));
  const now = c.units().filter((u) => u.locator.deliverable === SG);
  // the paragraph is a unit; so is the ### sub-heading, which prints (red team round 2, C3-03); the lists are not
  assert.equal(now.length, before + 2, "the paragraph and the sub-heading are units; the lists are not");
  assert.ok(now.some((u) => u.form === "heading" && u.text === "### Also in this chapter"));
  const off = now.find((u) => u.text === OFF);
  assert.ok(off && off.role === "teaching");
  const f = added(c);
  assert.ok(f.some((x) => x.kind === "unit-unlinked" && x.units.includes(off.id)), kinds(f).join(" "));
  const restated = f.filter((x) => x.kind === "objective-restated-differently");
  assert.equal(restated.length, 2, "both extra 'objectives' under the sub-heading are read");
  assert.ok(restated.every((x) => x.statusClass === "defect" && /galvanic|salt bridge/.test(x.evidence.detail)));
  // the segmenter and the check read the same lines: nothing in the section is left out of both
  const seg = segmentDeliverable(c.read(SG), SG);
  const lines = c.read(SG).split("\n");
  lines.forEach((l, k) => { if (l.trim()) assert.ok(seg.covered.has(k), `line ${k + 1} is covered`); });
});

test("[req.control.role-derived] C3-15: a unit's role comes from its text and structure; a sidecar role edited to 'framing' changes nothing", (t) => {
  const c = course(t);
  const OFF = "A galvanic cell converts the chemical energy of a spontaneous redox reaction into electrical energy, with oxidation at the anode and reduction at the cathode.";
  c.asAgent(() => c.edit(SG, CATALYST_END, `${CATALYST_END}\n\n${OFF}`));
  const off = c.units().find((u) => u.text === OFF);
  assert.ok(added(c).some((f) => f.kind === "unit-unlinked" && f.units.includes(off.id)));
  const SIDE = "metadata/units/study-guide/le-chatelier.md.json", side = JSON.parse(c.read(SIDE));
  side.units.find((u) => u.id === off.id).role = "framing";
  c.write(SIDE, JSON.stringify(side, null, 2) + "\n");
  assert.equal(c.unit(off.id).role, "teaching");
  const g = c.gate();
  assert.ok(added(c, g.findings).some((f) => f.kind === "unit-unlinked" && f.units.includes(off.id)), "still unlinked");
  assert.equal(g.gate.canPublish, false);
});

// ================================================== C4 ===========================================================
test("[req.control.restated-objectives-full] C4-12: restated objectives are compared with their maths; a dropped objective is a defect; a `#` heading is read like `##`", (t) => {
  const c = course(t);
  const O3 = "by treating heat as a reactant for an endothermic reaction or a product for an exothermic one";
  const O4 = "4. Predict the effect of a volume or pressure change on a gas-phase equilibrium by comparing the moles of gas on each side of the equation.\n";
  const O5 = "5. Explain why adding an inert gas at constant volume, and why adding a catalyst, do not shift the equilibrium.";
  c.asAgent(() => {
    const sg = c.read(SG), at = sg.indexOf("## Learning objectives");
    c.write(SG, sg.slice(0, at) + sg.slice(at).replace(O3, "by treating heat as a reactant for an endothermic reaction ($\\Delta H < 0$) or a product for an exothermic one ($\\Delta H > 0$)").replace(O4, ""));
    c.edit(SL, "## Learning objectives", "# Learning objectives"); c.edit(SL, O5, "5. Explain why adding a catalyst shifts the equilibrium toward the products.");
  });
  const f = added(c).filter((x) => /objective-(restated|not-restated)/.test(x.kind));
  const sgF = f.filter((x) => x.evidence.file === SG), slF = f.filter((x) => x.evidence.file === SL);
  assert.ok(sgF.some((x) => x.kind === "objective-restated-differently" && /Delta H < 0/.test(x.evidence.detail)), "the reversed signs are a difference");
  assert.ok(sgF.some((x) => x.kind === "objective-not-restated" && /predict-pressure-shift/.test(x.evidence.detail)), "a dropped objective is a defect");
  assert.ok(slF.some((x) => x.kind === "objective-restated-differently" && /catalyst shifts/.test(x.evidence.detail)), "a `#` heading is read");
  assert.ok(slF.some((x) => x.kind === "objective-not-restated" && /explain-inert-and-catalyst/.test(x.evidence.detail)));
  assert.ok(f.every((x) => x.statusClass === "defect" && x.route === "agent"));
});

test("[req.control.restated-objectives-full] C4-12 (benign): notation, spacing, emphasis and punctuation are not differences — LaTeX in the deliverable, Unicode in the spine", (t) => {
  const c = course(t);
  // the fixture's chapter 1 restates "ΔG° = −RT ln K" as "$\Delta G^\ominus = -RT \ln K$": baseline, no finding
  assert.ok(c.read("study-guide/chemical-equilibrium.md").includes("$\\Delta G^\\ominus = -RT \\ln K$"));
  assert.ok(!c.gate().findings.some((x) => /objective-(restated|not-restated)/.test(x.kind)));
  const O5 = "5. Explain why adding an inert gas at constant volume, and why adding a catalyst, do not shift the equilibrium.";
  c.edit(SG, O5, "5. Explain  why adding an *inert gas* at constant volume and why adding a **catalyst** do not shift the equilibrium");
  assert.deepEqual(kinds(added(c).filter((x) => /objective-/.test(x.kind))), []);
});

test("[req.spine.direction-substantive] C4-13: a fewer/more swap in the spine is substantive, and `coursewerk.mjs approve` holds the same blind-review precondition as `spine.mjs approve`", (t) => {
  const c = course(t);
  const MAP = "concepts/le-chatelier.md";
  const was = "shifts the equilibrium toward the side with fewer moles of gas, and increasing the volume shifts it toward the side with more moles of gas.";
  c.edit(MAP, was, was.replace("fewer", "@@").replace("more", "fewer").replace("@@", "more"));
  const st = approvalStatus(c.r(), manifestChapters(c.r()), readLogText(c.root)).scopes["le-chatelier"];
  assert.equal(st.valid, false); assert.equal(st.change.kind, "substantive", JSON.stringify(st.change.reasons));
  const args = ["approve", "--root", c.root, "--chapter", "le-chatelier", "--name", I.name, "--words", "Glanced at it, fine."];
  for (const script of ["coursewerk.mjs", "spine.mjs"]) {
    const g = c.cli(script, ...args, "--glance");
    assert.notEqual(g.status, 0, `${script} --glance refused: ${g.stdout}`);
  }
  const cw = c.cli("coursewerk.mjs", ...args);
  assert.notEqual(cw.status, 0, cw.stdout);
  assert.match(cw.stderr, /have not had their blind review/);
  const ok = c.cli("coursewerk.mjs", ...args, "--without-review");
  assert.equal(ok.status, 0, ok.stderr);
  const rec = readLogText(c.root).trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.type === "approval").at(-1);
  assert.match(rec.payload.note, /without the blind review/);
  // a light change stays light
  const c2 = course(t);
  c2.edit(MAP, "toward the side with fewer moles of gas", "towards the side with fewer moles of gas");
  assert.equal(approvalStatus(c2.r(), manifestChapters(c2.r()), readLogText(c2.root)).scopes["le-chatelier"].change.kind, "light");
});

// ================================================== C5 ===========================================================
test("[req.control.guide-count-distinct] C5-08: one question counts toward one guide entry; a question linked to three entries leaves two short", (t) => {
  const c = course(t);
  const units = c.units(), strip = (id, entry) => [id, units.find((u) => u.id === id).spineNodes.filter((n) => n !== entry)];
  c.link(Object.fromEntries([strip("u-practice-le-chatelier-questions-27", "guide.le-chatelier.catalyst-probe"), strip("u-practice-le-chatelier-questions-29", "guide.le-chatelier.contrast-item")]));
  c.link({ [Q1]: ["objective.le-chatelier.state-principle", "guide.le-chatelier.word-partially", "guide.le-chatelier.catalyst-probe", "guide.le-chatelier.contrast-item"] });
  const short = added(c).filter((x) => x.kind === "guide-entry-short");
  assert.equal(short.length, 2, kinds(added(c)).join(" "));
  assert.ok(short.every((x) => x.statusClass === "obligation"));
  // a question linked to two entries where only one is short fills that one (a matching, not first-come)
  const c2 = course(t);
  const u2 = c2.units();
  c2.link(Object.fromEntries([["u-practice-le-chatelier-questions-27", u2.find((u) => u.id === "u-practice-le-chatelier-questions-27").spineNodes.filter((n) => n !== "guide.le-chatelier.catalyst-probe")]]));
  c2.link({ "u-practice-le-chatelier-questions-25": ["objective.le-chatelier.explain-inert-and-catalyst", "guide.le-chatelier.inert-gas-probe", "guide.le-chatelier.catalyst-probe"],
    "u-practice-le-chatelier-questions-23": ["objective.le-chatelier.explain-inert-and-catalyst", "guide.le-chatelier.inert-gas-probe", "guide.le-chatelier.catalyst-probe"] });
  assert.ok(added(c2).some((x) => x.kind === "guide-entry-short"), "inert-gas-probe (2) and catalyst-probe (1) need three questions; two cannot fill them");
  c2.link({ "u-practice-le-chatelier-questions-27": u2.find((u) => u.id === "u-practice-le-chatelier-questions-27").spineNodes });
  assert.ok(!added(c2).some((x) => x.kind === "guide-entry-short"), "three questions for three slots, however they are linked");
});

test("[req.control.guide-fidelity-every-link] C5-08: a question is checked against EVERY guide entry it is linked to", async (t) => {
  const c = course(t);
  c.link({ [Q1]: ["objective.le-chatelier.state-principle", "guide.le-chatelier.word-partially", "guide.le-chatelier.catalyst-probe", "guide.le-chatelier.contrast-item"] });
  const honest = reviewer(() => ({ fidelity: (g) => (/short answer/.test(g.ask) ? { type: "matches", level: "matches" } : { type: "differs", level: "matches", why: "a short-answer recall item" }) }));
  await reviewAlignment(c.root, c.r(), { verifier: honest.verifier, only: [Q1] });
  assert.deepEqual(honest.seen[0].guides.map((g) => g.id), ["guide.le-chatelier.word-partially", "guide.le-chatelier.catalyst-probe", "guide.le-chatelier.contrast-item"]);
  const f = ms9(c).filter((x) => x.kind === "assessment-fidelity");
  assert.deepEqual(f.map((x) => x.evidence.guide).sort(), ["guide.le-chatelier.catalyst-probe", "guide.le-chatelier.contrast-item"]);
  // an answer that names one entry for several leaves the others unanswered: a question, not a pass
  const lazy = replayVerifier((pr) => ({ nonce: parsePrompt(pr).nonce, links: parsePrompt(pr).declared.map((id) => ({ id, verdict: "yes" })), also: [], offPlan: false, fidelity: { type: "matches", level: "matches" } }));
  await reviewAlignment(c.root, c.r(), { verifier: lazy, only: [Q1] });
  assert.ok(ms9(c).some((x) => x.kind === "alignment-unscorable" && x.units.includes(Q1)));
});

test("[req.control.guide-count-practice-only] C5-17: a worked example in the study guide does not count toward a guide entry's Count", (t) => {
  const c = course(t);
  const Q9 = c.unit("u-practice-le-chatelier-questions-17"), WE2 = c.unit("u-study-guide-le-chatelier-worked-examples-3");
  assert.equal(WE2.form, "question");
  c.link({ [Q9.id]: Q9.spineNodes.filter((n) => n !== "guide.le-chatelier.count-moles"), [WE2.id]: [...WE2.spineNodes, "guide.le-chatelier.count-moles"] });
  const f = added(c).filter((x) => x.kind === "guide-entry-short");
  assert.equal(f.length, 1, kinds(added(c)).join(" "));
  assert.match(f[0].evidence.what, /count-moles \(has 1 of 2/);
  c.link({ [Q9.id]: Q9.spineNodes });
  assert.ok(!added(c).some((x) => x.kind === "guide-entry-short"));
});

test("[req.spine.guide-grammar-strict] C5-11: guide entries the grammar does not read (an anchored entry under an untagged section, a #### sub-entry with fields) are refused by spine check and approval", (t) => {
  const c = course(t);
  const GUIDE = "assessment-support/le-chatelier.md";
  c.edit(GUIDE, "## Designing a whole assessment", "## Cumulative items\n\n### data interpretation [anchor: data-interpretation]\n\n- **Type:** data analysis\n- **Count:** 2\n- **Level:** analyse\n\nGive a table of yields.\n\n## Designing a whole assessment");
  const heat = c.read(GUIDE).split("\n").findIndex((l) => l.includes("[anchor: heat-species]"));
  const lines = c.read(GUIDE).split("\n"), end = lines.findIndex((l, k) => k > heat && /^###? /.test(l));
  lines.splice(end, 0, "#### a reverse-direction variant", "", "- **Type:** prediction", "- **Count:** 1", "");
  c.write(GUIDE, lines.join("\n"));
  const chapters = manifestChapters(c.r()), spine = parseSpine(c.r(), chapters);
  assert.equal(spine.chapters["le-chatelier"].guide.entries.find((e) => e.anchor === "heat-species").count, 2, "a sub-entry does not overwrite its parent's Count");
  const p = checkSpine(spine, chapters).filter((x) => x.rule === "guide-outside-grammar");
  assert.ok(p.some((x) => /data-interpretation/.test(x.detail)), "the anchored off-grammar entry");
  assert.ok(p.some((x) => /sub-entry/.test(x.detail)), "the sub-entry's fields");
  assert.ok(p.some((x) => /outside every/.test(x.detail)), "the off-grammar entry's fields");
  assert.equal(c.cli("spine.mjs", "check", "--root", c.root).status, 1);
  const ap = c.cli("spine.mjs", "approve", "--root", c.root, "--chapter", "le-chatelier", "--name", I.name, "--words", "Approved.", "--without-review");
  assert.notEqual(ap.status, 0); assert.match(ap.stderr + ap.stdout, /not well-formed/);
  const cw = c.cli("coursewerk.mjs", "approve", "--root", c.root, "--chapter", "le-chatelier", "--name", I.name, "--words", "Approved.", "--without-review");
  assert.notEqual(cw.status, 0); assert.match(cw.stderr, /not well-formed/);
  assert.ok(added(c).some((x) => x.kind === "spine-guide-outside-grammar" && x.statusClass === "defect"));
});

// =================================== held for the operator's decision ============================================
test("[req.control.link-review] C2-01: a link no review has read is reported", (t) => {
  const c = course(t);
  uncover(c); c.link({ [FALSE]: [...c.unit(FALSE).spineNodes, OBJ] });
  assert.ok(added(c).some((f) => (f.units || []).includes(FALSE)), "the never-reviewed false link is reported");
});

test("[req.control.link-review] C1-09: an objective reached only 'in passing' is not covered", async (t) => {
  const c = course(t);
  uncover(c);
  const PASSING = ["u-slides-le-chatelier-slide-12-count-the-moles-of-gas-3", "u-study-guide-le-chatelier-common-misconceptions-5"];
  c.link(Object.fromEntries(PASSING.map((id) => [id, [...c.unit(id).spineNodes, OBJ]])));
  await reviewAlignment(c.root, c.r(), { verifier: reviewer(() => ({ verdicts: { [OBJ]: "passing" } })).verifier, only: PASSING });
  assert.ok(added(c).some((f) => f.kind === "objective-uncovered" || (f.module === "ms9-alignment" && PASSING.some((id) => f.units.includes(id)))));
});

test("[req.control.link-review] C3-07 (D42): a lesson under '## Introduction to …' needs no link, but is read for off-plan content and comes to the instructor", async (t) => {
  const c = course(t);
  c.asAgent(() => c.edit(SG, "## Common misconceptions", "## Introduction to electrochemistry\n\nA galvanic cell converts the chemical energy of a spontaneous redox reaction into electrical energy. Oxidation takes place at the anode and reduction at the cathode.\n\n## Common misconceptions"));
  const u = c.units().find((x) => /galvanic/.test(x.text));
  assert.equal(u.role, "framing");
  assert.ok(added(c).some((f) => f.kind === "framing-review-owed" && f.units.includes(u.id)), "unread framing is the agent's to review");
  await reviewAlignment(c.root, c.r(), { verifier: replayVerifier((pr) => ({ nonce: pr.match(/"nonce": "([0-9a-f]+)"/)[1], links: [], also: [], offPlan: true })), only: [u.id] });
  const now = added(c);
  assert.ok(!now.some((f) => f.kind === "framing-review-owed" && f.units.includes(u.id)), "read");
  assert.ok(now.some((f) => f.kind === "off-spine" && f.route === "digest" && f.units.includes(u.id)), "off the plan: the instructor's keep-or-drop question");
});

test("[req.control.link-review] C3-14: a handout declared in DOCUMENTS.json is segmented, linked and reviewed", (t) => {
  const c = course(t);
  const H = "current/fall-2026/le-chatelier-handout.md";
  fs.mkdirSync(path.dirname(c.file(H)), { recursive: true });
  c.write(H, "{{nyml\nkind: document\n}}\n\n# Handout\n\n## Electrochemistry\n\nA galvanic cell converts the chemical energy of a spontaneous redox reaction into electrical energy.\n");
  c.write("metadata/DOCUMENTS.json", JSON.stringify({ schemaVersion: 1, documents: [{ id: "le-chatelier-handout", title: "Le Chatelier handout", source: H, carrier: "paged" }] }, null, 2) + "\n");
  assert.ok(c.units().some((u) => u.locator.deliverable === H) || added(c).some((f) => JSON.stringify(f.evidence).includes(H)));
});

// ---- D41 / D42 (operator, 2026-10-06) --------------------------------------------------------------------------------
test("[req.control.verified-coverage] D41: offline, a publish may set aside the owed link reviews — and the decision records exactly which", async (t) => {
  const { publishDecision, unitInfoOf } = await import("../scripts/lib/core/workflow.mjs");
  const c = course(t);
  uncover(c); c.link({ [FALSE]: [...c.unit(FALSE).spineNodes, OBJ] }); // the objective's only cover: a new, unreviewed link
  const g = c.gate();
  assert.ok(g.gate.blocking.some((f) => f.kind === "link-review-owed"), "owed, blocking");
  const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
  const info = unitInfoOf(c.root, c.r());
  const blocked = (() => { try { publishDecision(c.root, c.r(), { gateResult: g, unitInfo: info, instructorWords: "Publish chapter 2.", chapters: ["le-chatelier"] }, I); return false; } catch (e) { return /link-review-owed|no chapter can be published/.test(e.message); } })();
  assert.ok(blocked, "without the flag, the owed review blocks");
  let r; try { r = publishDecision(c.root, c.r(), { gateResult: g, unitInfo: info, instructorWords: "Publish chapter 2; the reviews are offline.", chapters: ["le-chatelier"], withoutReview: true, overQuestions: true }, I); } catch (e) { r = { error: e.message }; }
  if (r.error) assert.doesNotMatch(r.error, /link-review-owed/, "only owed reviews are set aside, nothing else");
  else assert.ok(r.withoutReview?.some((x) => x.kind === "link-review-owed"), "the decision names what it set aside");
});

test("[req.ship.checked] D42: a declared document is a deliverable unless the instructor marks it administrative", (t) => {
  const c = course(t);
  const H = "current/fall-2026/schedule.md";
  fs.mkdirSync(path.dirname(c.file(H)), { recursive: true });
  c.write(H, "{{nyml\nkind: document\n}}\n\n# Schedule\n\nWeek 1: equilibrium. Week 2: Le Chatelier's principle.\n");
  c.write("metadata/DOCUMENTS.json", JSON.stringify({ schemaVersion: 1, documents: [{ id: "schedule", title: "Schedule", source: H, carrier: "paged", role: "administrative" }] }, null, 2) + "\n");
  assert.ok(!c.units().some((u) => u.locator.deliverable === H), "administrative: not segmented as teaching");
  assert.ok(!added(c).some((f) => JSON.stringify(f).includes(H) && f.kind === "units-not-indexed"));
  assert.deepEqual(segmentDeliverable("{{nyml\nkind: document\n}}\n\n# H\n\nText here.\n", H).units.map((u) => u.text), ["Text here."], "the settings block is notation, not content");
});
