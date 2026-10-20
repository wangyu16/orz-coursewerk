// Red team, round 1 — COHERENCE (H1–H5): every finding of the round-1 report
// (var/projects/coursewerk-caeai/workspace/studies/p11/redteam/coherence/REPORT.md, scripts f1…f15) reproduced on the
// real course fixture, under git like tests/three-c-loop.test.mjs, and asserted CAUGHT. Each test fixes the class:
//   F4 F5 F14  a stamp is not a re-verification: what a unit owes survives edits, relinks and re-indexing, and clears
//              only through a logged blind re-check of its current text (units.mjs reverify), a named module's
//              re-check, or the instructor's confirmation;
//   F1 F2 F3 F7 F15  an answer is bound to its question by id AND the question's full normalized wording; a
//              reworded or re-paired question makes the answer owe a cheap blind re-check (the agent's work, never an
//              instructor question); a legacy stamp without the binding owes it once;
//   F8 F11     key terms match plurals, apostrophe variants and aliases; unitless symbol=value bindings are shared;
//   F6 F9 F10  unit records are digest-logged at every harness write; the pack ships only what the publish hash
//              binds plus the log (the decision record rebuilt from the log); every committed log extends its
//              predecessor;
//   F12        a version is not opened over unindexed edits;
//   F13        a light, glance-confirmed spine change raises no re-verification.
// Dismissed: none. Offline and deterministic: blind reviews are replayed through the real paths.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader, manifestChapters } from "../scripts/lib/core/package_reader.mjs";
import { confirmUnits, coreObligations, indexAndStamp, linkUnits, loadUnits, openVersionCarrying, reverifyUnits } from "../scripts/lib/core/obligations.mjs";
import { beginSession, claimAuthorship, deliverablesOf } from "../scripts/lib/core/units_index.mjs";
import { UNIT_RECORDS_EVENT, currentDigests } from "../scripts/lib/core/unit_records.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { recordApproval } from "../scripts/lib/core/approvals.mjs";
import { buildDigest } from "../scripts/lib/core/digest.mjs";
import { publishDecision, unitInfoOf } from "../scripts/lib/core/workflow.mjs";
import { packPublished } from "../scripts/lib/core/pack_v2.mjs";
import { appendLogRecord, recordHash, verifyLog } from "../scripts/lib/records/log.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { verifyKnowledge } from "../scripts/lib/verify/verdicts.mjs";
import { reviewAlignment } from "../scripts/lib/verify/alignment.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const git = (root, ...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });
const PR = "practice/le-chatelier.md";
const A6 = "u-practice-le-chatelier-questions-12";
const Q6_RAISED = "is exothermic. The temperature is raised. Which way";

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r1coh-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  git(root, "init", "-q", "-b", "main"); git(root, "add", "-A"); git(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "baseline");
  const c = {
    root, dir, r: () => liveReader(root),
    gate: () => runGate(root, { inputsDir: INPUTS }),
    units: () => loadUnits(root, liveReader(root)),
    file: (rel) => path.join(root, rel),
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 50)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent: (fn) => { beginSession(root, liveReader(root), AGENT); fn(); indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    commit: (m = "c") => git(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", m),
  };
  c.find = (form, start) => (c.units().find((u) => u.form === form && u.text.startsWith(start)) ?? assert.fail(`no ${form} starting ${start}`)).id;
  c.owes = (id) => c.gate().findings.filter((f) => ["reverify", "carried-unverified"].includes(f.kind) && f.units.includes(id));
  return c;
}
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];
const clean = replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [] }));
/** The routed fix: a blind re-review of each unit with its context, then the recorded re-check. */
/** A replayed link-and-level review that finds the question fits its links and guide entries (test double). */
const fitsGuide = replayVerifier((pr) => {
  const declared = (pr.split("\nDECLARED ITEMS\n")[1] || "").split("\n\n")[0].split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
  const gids = [...pr.matchAll(/^- (guide\.\S+): /gm)].map((m) => m[1]), fid = { type: "matches", level: "matches", why: "test double" };
  return { nonce: pr.match(/"nonce": "([0-9a-f]+)"/)[1], links: declared.map((id) => ({ id, verdict: "yes", why: "test double" })), also: [], offPlan: false,
    ...(/its assessment guide entry asks for/.test(pr) ? { fidelity: fid } : gids.length ? { fidelity: gids.map((id) => ({ id, ...fid })) } : {}) };
});
async function reverified(c, ids) {
  await verifyKnowledge(c.root, c.r(), { verifier: clean, only: ids });
  reverifyUnits(c.root, c.r(), ids, AGENT);
}

// ============================================ a stamp is not a re-verification ===================================
test("[req.coherence.reverify-routed] F4: a touch of an answer that owes re-verification does not clear it; only a logged blind re-check of its current text does", async (t) => {
  const c = course(t);
  c.asAgent(() => c.edit(PR, Q6_RAISED, Q6_RAISED.replace("raised", "lowered")));
  assert.ok(c.owes(A6).length, "the reversed question's answer owes re-verification");
  c.asAgent(() => c.edit(PR, "Toward the reactants, to the left. For an exothermic", "Toward the reactants, to the left side. For an exothermic")); // the attack: a one-word touch
  const g = c.gate();
  assert.ok(g.findings.some((f) => f.kind === "reverify" && f.units.includes(A6) && f.statusClass === "obligation"), "a touch is not a re-verification");
  assert.equal(g.gate.canPublish, false);
  // the routed fix refuses without a review, naming the review to run …
  assert.throws(() => reverifyUnits(c.root, c.r(), [A6], AGENT), /verify\.mjs knowledge --root .* --units u-practice-le-chatelier-questions-12/);
  // … and a review that finds the answer wrong does not count
  await verifyKnowledge(c.root, c.r(), { verifier: replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [{ kind: "wrong", text: "Toward the reactants", problem: "lowering the temperature of an exothermic reaction favours the products", suggestion: "Toward the products" }] })), only: [A6] });
  assert.throws(() => reverifyUnits(c.root, c.r(), [A6], AGENT), /found it wrong/);
  assert.ok(c.owes(A6).length);
  // revised (still owing: its text changed while it owed), reviewed clean, recorded: cleared
  c.asAgent(() => c.edit(PR, "Toward the reactants, to the left side. For an exothermic", "Toward the products, to the right. For an exothermic"));
  assert.ok(c.owes(A6).length, "a revision is not a re-verification either");
  await reverified(c, [A6]);
  assert.deepEqual(c.owes(A6), [], "a logged blind re-check of the current text clears it");
  // the CLI is the routed fix: it refuses for a unit that owes nothing
  const r = spawnSync(process.execPath, [path.join(REPO, "scripts", "units.mjs"), "reverify", "--root", c.root, "--units", A6, "--model", "m"], { encoding: "utf8" });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /owes no re-verification/);
});

test("[req.coherence.reverify-routed] F5: an edit-and-revert round trip with plain re-indexing leaves every carried unit carried", (t) => {
  const c = course(t);
  openVersionCarrying(c.root, c.r(), { scopes: ["chapter:le-chatelier"], reason: "an objective split", instructorWords: "Open version 2." }, I);
  const carried = () => c.gate().findings.filter((f) => f.kind === "carried-unverified").flatMap((f) => f.units).sort();
  const was = carried();
  assert.ok(was.length > 50);
  const files = ["study-guide", "slides", "practice"].map((d) => c.file(`${d}/le-chatelier.md`)), orig = files.map((f) => fs.readFileSync(f, "utf8"));
  files.forEach((f, i) => fs.writeFileSync(f, orig[i].split("\n").map((l) => (/^\$\$.+\$\$\s*$/.test(l) ? l.replace(/\$\$\s*$/, "\\,$$$$") : /^\s*$|^:::|^#|^---|^\$\$|^\|/.test(l) ? l : l + " x")).join("\n")));
  indexAndStamp(c.root, c.r(), {});
  files.forEach((f, i) => fs.writeFileSync(f, orig[i]));
  indexAndStamp(c.root, c.r(), {});
  assert.deepEqual(carried(), was, "nothing left the new version unverified");
});

test("[req.coherence.reverify-routed] F14: two link calls that restore every link clear nothing", (t) => {
  const c = course(t);
  c.asAgent(() => c.edit(PR, Q6_RAISED, Q6_RAISED.replace("raised", "lowered")));
  openVersionCarrying(c.root, c.r(), { scopes: ["chapter:chemical-equilibrium"], reason: "objective split", instructorWords: "Open version 2." }, I);
  const count = () => c.gate().findings.filter((f) => ["reverify", "carried-unverified"].includes(f.kind)).length;
  const n1 = count();
  assert.ok(n1 > 20 && c.owes(A6).length);
  const units = c.units(), orig = Object.fromEntries(units.map((u) => [u.id, u.spineNodes || []]));
  const spare = ["objective.le-chatelier.state-principle", "objective.le-chatelier.predict-pressure-shift", "objective.chemical-equilibrium.write-k-expression"];
  linkUnits(c.root, c.r(), Object.fromEntries(units.map((u) => [u.id, [...orig[u.id], spare.find((n) => !orig[u.id].includes(n) && (/le-chatelier/.test(u.id) === /le-chatelier/.test(n)))].filter(Boolean)])), AGENT);
  linkUnits(c.root, c.r(), orig, AGENT);
  assert.equal(count(), n1, "every obligation is still owed");
  assert.ok(c.owes(A6).length);
});

// ============================================ answer ↔ question binding ==========================================
test("[req.coherence.question-binding] F1: a legacy answer stamp without the question binding owes a re-check once, and `units begin` never baselines an edited question", async (t) => {
  const c = course(t);
  // a package last written by the pre-R1 harness: answer stamps without the question: target
  for (const rel of deliverablesOf(c.r())) {
    const f = c.file(`metadata/units/${rel}.json`), side = JSON.parse(fs.readFileSync(f, "utf8"));
    for (const u of side.units) if (u.stamp) for (const k of Object.keys(u.stamp)) if (k.startsWith("question:")) delete u.stamp[k];
    fs.writeFileSync(f, JSON.stringify(side, null, 2) + "\n");
  }
  // TEST DOUBLE: the pre-R1 harness wrote these records and logged their digests. Since R2 (F10) no library call logs
  // over an edited record, so the double writes the log record that harness would have written.
  appendLogRecord(c.root, { type: "revision", party: { role: "harness", name: "unit records" }, payload: { event: UNIT_RECORDS_EVENT, digests: currentDigests(c.root) } });
  c.commit("pre-R1 stamps");
  assert.ok(c.owes(A6).some((f) => /predates/.test(f.evidence.what)), "a legacy answer owes a re-check once");
  // the attack: the question is reversed outside a session, claimed, and the agent's next session begins
  c.edit(PR, Q6_RAISED, Q6_RAISED.replace("raised", "lowered"));
  indexAndStamp(c.root, c.r(), {});
  const q6 = c.find("question", "The reaction $\\ce{N2(g) + 3 H2(g) <=> 2 NH3(g)}$ is exothermic. The temperature is lowered");
  claimAuthorship(c.root, { units: [q6], instructorWords: "Yes, I changed that question." }, I);
  beginSession(c.root, c.r(), AGENT);
  const a6 = c.units().find((u) => u.id === A6);
  assert.ok(!Object.keys(a6.stamp).some((k) => k.startsWith("question:")), "the edited question was not baselined");
  assert.ok(c.owes(A6).length && !c.gate().gate.canPublish);
  await reverified(c, [A6]);
  assert.deepEqual(c.owes(A6), [], "the routed fix: a blind re-check of the answer with its question");
  assert.ok(Object.keys(c.units().find((u) => u.id === A6).stamp).includes(`question:${q6}`), "bound from now on");
});

test("[req.coherence.question-binding] F2: a question reversed by words outside any direction list makes its answer owe re-verification", (t) => {
  const c = course(t);
  const A9 = c.find("answer", "Toward the products. There are four moles"), A12 = c.find("answer", "It does not shift. Argon is inert");
  c.asAgent(() => { c.edit(PR, "the volume of the vessel is halved. Which way", "the volume of the vessel is doubled. Which way"); c.edit(PR, "held at constant volume.", "held at constant pressure."); });
  for (const a of [A9, A12]) assert.ok(c.owes(a).some((f) => f.kind === "reverify"), `${a} owes re-verification`);
  assert.equal(c.gate().gate.canPublish, false);
});

test("[req.coherence.question-binding] F3: two questions swapped (answers left in place) make both answers owe re-verification", (t) => {
  const c = course(t);
  const A9 = c.find("answer", "Toward the products. There are four moles"), A11 = c.find("answer", "Toward the products. There are two moles of gas on the left and three");
  c.asAgent(() => {
    const f = c.file(PR); let s = fs.readFileSync(f, "utf8");
    const q9 = s.match(/::: tab Q 9\n([\s\S]*?)\n:::/)[1], q11 = s.match(/::: tab Q 11\n([\s\S]*?)\n:::/)[1];
    s = s.replace(q9, "@@Q9@@").replace(q11, q9).replace("@@Q9@@", q11); fs.writeFileSync(f, s);
  });
  for (const a of [A9, A11]) assert.ok(c.owes(a).some((f) => /another question|question:/.test(f.evidence.what)), `${a}: re-paired, so it owes a re-check`);
});

test("[req.coherence.question-binding] F7: a synonymous rewording of a question is the agent's cheap re-check, never the instructor's question", async (t) => {
  const c = course(t);
  const base = c.gate();
  c.asAgent(() => { c.edit(PR, Q6_RAISED, Q6_RAISED.replace("raised", "increased")); c.edit(PR, "An endothermic reaction is at equilibrium and the mixture is cooled.", "An endothermic reaction is at equilibrium and the mixture's temperature is lowered."); });
  const g = c.gate();
  const owed = g.findings.filter((f) => f.kind === "reverify").flatMap((f) => f.units);
  assert.ok(owed.includes(A6), "a reworded question: its answer owes a re-check");
  assert.ok(g.findings.filter((f) => ["reverify", "answer-still-correct"].includes(f.kind)).every((f) => f.route === "agent"), "routed to the agent");
  const d = buildDigest(c.root, g.findings, unitInfoOf(c.root, c.r()), { cap: 50 });
  assert.ok(!d.entries.some((e) => ["reverify", "answer-still-correct"].includes(e.kind)), "nothing asks the instructor about a correct answer");
  await reverified(c, owed);
  // red team round 2 (C5-08, D41 for the guide): a reworded practice question also owes its cheap link-and-level
  // review before it fills its guide entry's Count again — the agent's, never the instructor's (replayed: it fits)
  const linkOwed = c.gate().findings.filter((f) => f.kind === "link-review-owed");
  assert.ok(linkOwed.every((f) => f.route === "agent" && f.units.every((u) => /^u-practice-/.test(u))));
  await reviewAlignment(c.root, c.r(), { verifier: fitsGuide, only: linkOwed.flatMap((f) => f.units) });
  const after = c.gate().findings.filter((f) => !base.findings.some((b) => b.kind === f.kind && JSON.stringify(b.units) === JSON.stringify(f.units)));
  assert.deepEqual(after.filter((f) => !["absolute-unreviewed", "evidence-missing"].includes(f.kind)).map((f) => f.kind), [], "re-checked: nothing of the change remains (its own new text's facts aside)");
});

test("[req.coherence.question-binding] F15: an instructor's \"still correct\" is bound to the question's wording; a second change of the question is owed and found again", (t) => {
  const c = course(t);
  const A7 = "u-practice-le-chatelier-questions-14";
  const ask = () => c.gate().findings.find((f) => f.kind === "answer-still-correct" && f.units.includes(A7));
  c.asAgent(() => c.edit(PR, "An endothermic reaction is at equilibrium and the mixture is cooled.", "An endothermic reaction is at equilibrium and the mixture is chilled."));
  const first = ask();
  assert.ok(first && first.route === "agent");
  confirmUnits(c.root, c.r(), [A7], { what: "still-correct", instructorWords: "Still correct: chilled is cooled." }, I);
  assert.equal(ask(), undefined);
  c.asAgent(() => c.edit(PR, "the mixture is chilled.", "the mixture is heated."));
  const second = ask();
  assert.ok(second && second.id !== first.id, "a new finding, bound to the new wording");
  assert.ok(c.owes(A7).length, "and it owes re-verification again");
});

// ============================================ edges ==============================================================
test("[req.coherence.edges-complete] F8: a redefined key term reaches the units using its plural, an apostrophe variant or an alias", (t) => {
  const c = course(t);
  const users = c.units().filter((u) => /partial pressures/i.test(u.text));
  assert.ok(users.length >= 3);
  c.edit("concepts/le-chatelier.md", "the pressure a single gas contributes in a mixture; a change in partial pressures is what drives a gas-phase shift",
    "the pressure a single gas would exert alone in the whole volume; only a change in it, never in the total pressure, drives a gas-phase shift");
  recordApproval(c.root, c.r(), manifestChapters(c.r()), { chapter: "le-chatelier", instructorWords: "Approved with the sharper definition." }, I);
  const re = new Set(c.gate().findings.filter((f) => f.kind === "reverify").flatMap((f) => f.units));
  assert.deepEqual(users.filter((u) => !re.has(u.id)).map((u) => u.id), [], "every unit saying \"partial pressures\" is found");
  // apostrophes and aliases: the pattern itself
  return import("../scripts/lib/core/dependencies.mjs").then(({ termPattern }) => {
    assert.ok(termPattern({ label: "Le Chatelier's principle" }).test("by Le Chatelier’s principle"));
    assert.ok(termPattern({ label: "reaction quotient", aliases: ["Q_r"] }).test("compare Q_r with K"));
    assert.ok(!termPattern({ label: "partial pressure" }).test("an impartial pressureless gauge"));
  });
});

test("[req.coherence.edges-complete] F11: a changed unitless value (K = 50 → 500) reaches every unit stating the same binding", (t) => {
  const c = course(t);
  const ce = "practice/chemical-equilibrium.md";
  const Q7 = c.units().find((u) => u.locator.deliverable === ce && u.text.startsWith("For the same reaction ($K = 50$)")).id;
  const A7 = c.units().find((u) => u.locator.deliverable === ce && /Q_r = K = 50/.test(u.text)).id;
  c.asAgent(() => c.edit(ce, "For a reaction with $K = 50$, a mixture is found to have $Q_r = 12$.", "For a reaction with $K = 500$, a mixture is found to have $Q_r = 12$."));
  const re = new Set(c.gate().findings.filter((f) => f.kind === "reverify").flatMap((f) => f.units));
  assert.ok(re.has(Q7) && re.has(A7), `Q7 and Answer 7 share K = 50: ${[...re].join(", ")}`);
});

// ============================================ records ============================================================
test("[req.records.unit-digest] F6: a hand edit of a unit record is a blocking defect, and the harness will not write over it", (t) => {
  const c = course(t);
  c.asAgent(() => c.edit(PR, Q6_RAISED, Q6_RAISED.replace("raised", "lowered")));
  assert.ok(c.owes(A6).length);
  const sc = c.file(`metadata/units/${PR}.json`), orig = fs.readFileSync(sc, "utf8"), side = JSON.parse(orig);
  delete side.units.find((u) => u.id === A6).stamp; // the hand edit
  fs.writeFileSync(sc, JSON.stringify(side, null, 2) + "\n");
  const g = c.gate();
  assert.ok(g.findings.some((f) => f.kind === "unit-record-altered" && f.statusClass === "defect"), "the record edit is caught");
  assert.equal(g.gate.canPublish, false);
  assert.throws(() => indexAndStamp(c.root, c.r(), {}), /changed outside the harness/, "a re-index does not launder it");
  fs.writeFileSync(sc, orig); // restored from git
  assert.ok(!c.gate().findings.some((f) => f.kind === "unit-record-altered"));
  assert.ok(c.owes(A6).length);
});

test("[req.ship.lean] [req.publish.pack-bound] F9: the pack ships only what Alembic needs (D53), the decision rebuilt from the log; a decision record that differs from the log is refused", (t) => {
  const c = course(t);
  const ids = [...new Set(coreObligations(c.root, c.r(), "t").filter((f) => ["evidence-missing", "absolute-unreviewed"].includes(f.kind)).flatMap((f) => f.units).filter((u) => /le-chatelier/.test(u)))];
  confirmUnits(c.root, c.r(), ids, { what: "fact", instructorWords: "I confirm these." }, I); c.commit("confirmed");
  const g = c.gate(), info = unitInfoOf(c.root, c.r());
  g.gate.questions.push({ id: "q-open-1", module: "ms8-verdicts", kind: "knowledge-concern", statusClass: "question", units: [[...info.keys()].find((k) => k.startsWith("u-study-guide-le-chatelier"))], evidence: { note: "Is the catalyst sentence too strong?" } });
  const d = publishDecision(c.root, c.r(), { gateResult: g, unitInfo: info, instructorWords: "Publish it, over those questions.", overQuestions: true }, I);
  const rec = c.file(`metadata/publish/${String(d.seq).padStart(4, "0")}.json`), orig = fs.readFileSync(rec, "utf8");
  const j = JSON.parse(orig); j.openQuestions = []; j.overQuestions = false; j.instructorWords = "Publish it.";
  fs.writeFileSync(rec, JSON.stringify(j, null, 2) + "\n");
  fs.writeFileSync(c.file("metadata/FINDINGS.json"), JSON.stringify({ findings: [], note: "verified clean by the harness" }) + "\n");
  const bad = packPublished(c.root, path.join(c.dir, "out"));
  assert.equal(bad.ok, false); assert.match(bad.error, /differs from the logged publish decision/);
  fs.writeFileSync(rec, orig);
  const p = packPublished(c.root, path.join(c.dir, "out"));
  assert.equal(p.ok, true, p.error);
  const x = path.join(c.dir, "x"); fs.mkdirSync(x); spawnSync("unzip", ["-q", p.zip, "-d", x]);
  assert.ok(!fs.existsSync(path.join(x, "metadata/FINDINGS.json")), "an unbound record is not shipped");
  // the decision ships as metadata/PUBLISHED.json, rebuilt from the LOGGED decision (D53: the record itself, and the
  // log, stay with the local package): the open questions as decided — the planted one, plus the course's own
  // spine-detail questions (round 6, D48) — and published over them, whatever the tampered file said
  const shipped = JSON.parse(fs.readFileSync(path.join(x, "metadata/PUBLISHED.json"), "utf8"));
  assert.equal(shipped.openQuestions, 1 + g.findings.filter((f) => f.kind === "detail-in-spine").length);
  assert.equal(shipped.overQuestions, true); assert.equal(shipped.publishSeq, d.seq);
  assert.ok(!fs.existsSync(path.join(x, "metadata/publish")) && !fs.existsSync(path.join(x, "metadata/LOG.jsonl")), "no working record ships (D53)");
});

test("[req.records.history-extends] F10: a past log record rewritten, re-chained and committed as a new commit is caught against the history", (t) => {
  const c = course(t);
  const f = c.file("metadata/LOG.jsonl");
  const recs = fs.readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  recs[0].payload.instructorWords = "Approve everything, forever, without reading.";
  let prev = "0".repeat(64);
  for (const r of recs) { r.prev = prev; delete r.hash; r.hash = recordHash(r); prev = r.hash; }
  const forged = recs.map((r) => JSON.stringify({ seq: r.seq, prev: r.prev, type: r.type, party: r.party, at: r.at, payload: r.payload, hash: r.hash })).join("\n") + "\n";
  assert.deepEqual(verifyLog(forged), [], "the forged log verifies on its own");
  fs.writeFileSync(f, forged); c.commit("update records");
  const g = c.gate();
  const broken = g.findings.find((x) => x.kind === "log-broken");
  assert.ok(broken && broken.statusClass === "defect", "caught");
  assert.match(broken.evidence.failures.join(" "), /does not extend the log committed at/);
  assert.equal(g.gate.canPublish, false);
});

// ============================================ versions and light changes =========================================
test("[req.versions.carry-indexed] F12: a version is not opened while a deliverable in its scope has unindexed edits", (t) => {
  const c = course(t);
  const chapter = () => c.units().filter((u) => /\/le-chatelier\.md$/.test(u.locator.deliverable));
  const before = chapter().length;
  beginSession(c.root, c.r(), AGENT);
  c.edit("study-guide/le-chatelier.md", "## Changing a concentration\n", "## Changing a concentration\n\nEach case below asks the same question about what was really changed.\n");
  assert.throws(() => openVersionCarrying(c.root, c.r(), { scopes: ["chapter:le-chatelier"], reason: "objective 5 split in two", instructorWords: "Open version 2." }, I), /not yet indexed/);
  indexAndStamp(c.root, c.r(), { as: "agent", party: AGENT });
  const v = openVersionCarrying(c.root, c.r(), { scopes: ["chapter:le-chatelier"], reason: "objective 5 split in two", instructorWords: "Open version 2." }, I);
  assert.equal(v.payload.carried.length, before + 1, "every unit of the scope is carried");
});

test("[req.coherence.light-spine] F13: a light, glance-confirmed rewording of the spine raises no re-verification; a substantive one still does", (t) => {
  const c = course(t);
  const owed = () => c.gate().findings.filter((f) => f.kind === "reverify").length;
  // a comma and emphasis, no word changed (R2 F4: since round 2 a light change keeps every word; the round-1 edit,
  // which also added "when", is now substantive — tests/redteam-r2-coherence.test.mjs)
  c.edit("concepts/le-chatelier.md", "1. Le Chatelier's principle states that a system at equilibrium disturbed by", "1. Le Chatelier's principle states that a *system at equilibrium*, disturbed by");
  const rec = recordApproval(c.root, c.r(), manifestChapters(c.r()), { chapter: "le-chatelier", glance: true, instructorWords: "Fine, just a wording fix." }, I);
  assert.equal(rec.type, "glance-confirmation");
  assert.equal(owed(), 0, "a light change re-verifies nothing");
  assert.deepEqual(c.gate().approvalProblems, []);
  // a substantive change (a negation) to the same node, approved in full: its units owe re-verification
  c.edit("concepts/le-chatelier.md", "adjusts to a new equilibrium that partially counteracts the change", "adjusts to a new equilibrium that does not fully counteract the change");
  recordApproval(c.root, c.r(), manifestChapters(c.r()), { chapter: "le-chatelier", instructorWords: "Approved." }, I);
  assert.ok(owed() > 0);
});
