// THE WORKFLOW (redesign P8): chapter states, the commands, the checkpoint digest and answers, the publish decision
// and the pack it allows. Offline and deterministic, on the real C2 package.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { confirmUnits, coreObligations } from "../scripts/lib/core/obligations.mjs";
import { openMajorVersion } from "../scripts/lib/core/versions.mjs";
import { openVersionCarrying } from "../scripts/lib/core/obligations.mjs";
import { recordSteering } from "../scripts/lib/core/steering_intake.mjs";
import { STEERING_FIELDS } from "../scripts/lib/records/steering.mjs";
import { recordApproval } from "../scripts/lib/core/approvals.mjs";
import { chapterStates, eligibility, latestPublish, publishDecision, transition, transitionProblems, unitInfoOf } from "../scripts/lib/core/workflow.mjs";
import { answerDigest, buildDigest, deliverDigest, rootCause } from "../scripts/lib/core/digest.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { makeFinding } from "../scripts/lib/records/findings.mjs";
import { readLogText } from "../scripts/lib/records/log.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const git = (root, ...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });

function copy(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-workflow-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true }); fs.cpSync(INPUTS, path.join(dir, "inputs"), { recursive: true });
  for (const a of [["init", "-q"], ["config", "user.name", "T"], ["config", "user.email", "t@example.invalid"], ["add", "-A"], ["commit", "-q", "-m", "c2"]]) git(root, ...a);
  return { root, inputs: path.join(dir, "inputs"), out: path.join(dir, "out"), reader: liveReader(root), commit: () => { git(root, "add", "-A"); git(root, "commit", "-q", "-m", "step"); } };
}
const cli = (...a) => spawnSync(process.execPath, [path.join(REPO, "scripts", "coursewerk.mjs"), ...a], { encoding: "utf8" });
const steer = (p) => recordSteering(p.root, { defaults: Object.fromEntries(STEERING_FIELDS.map((f) => [f, f === "exclusions" ? [] : "default"])), acceptAll: true, instructorWords: "accept all defaults" }, I);
/** Make le-chatelier publishable the instructor's way: one batched confirmation of its open facts and absolutes. */
function clearLeChatelier(p) {
  const ids = [...new Set(coreObligations(p.root, p.reader, "t").filter((f) => ["evidence-missing", "absolute-unreviewed"].includes(f.kind)).flatMap((f) => f.units).filter((u) => /le-chatelier/.test(u)))];
  confirmUnits(p.root, p.reader, ids, { what: "fact", instructorWords: "I confirm these." }, I);
  p.commit();
}

/** The course's one spine-detail question (D48 as D49 calibrated it: the Guldberg–Waage attribution in a key-term
 *  gloss) is a true question, raised before any publish like every open question: the instructor answers it at the
 *  digest first, so the publish below meets only the questions each test is about. */
function answerSpineDetail(p, g, info) {
  const d = buildDigest(p.root, g.findings, info), e = d.entries.filter((x) => x.kind === "detail-in-spine");
  assert.equal(e.length, 1, "the C2 spine carries one line of detail");
  answerDigest(p.root, d, { answers: { [e[0].key]: "keep it in the spine" }, instructorWords: "Keep the attribution in the key term." }, I);
}

// ---- states (T1) --------------------------------------------------------------------------------------------------
test("[req.states.machine] a chapter is in exactly one state and moves only by its triggers and preconditions", (t) => {
  const p = copy(t);
  const s = chapterStates(p.root, p.reader);
  assert.deepEqual(Object.values(s).map((x) => x.state), ["PACKAGE", "PACKAGE"], "approved before states were recorded: PACKAGE");
  assert.match(transitionProblems(p.root, p.reader, "le-chatelier", "ASSEMBLING").join(), /re-assembled only after a structural change/);
  assert.match(transitionProblems(p.root, p.reader, "le-chatelier", "PACKAGE").join(), /by the instructor's approval/);
  assert.throws(() => transition(p.root, p.reader, { chapter: "le-chatelier", to: "DRAFT", instructorWords: "x" }, AGENT), /instructor's word/);
  // a structural change opens v2: the approval no longer counts, and the chapter may go back to draft
  // opened the way the harness opens one (D15): carrying every unit of the chapter — a version opened bare, with no
  // carry, cannot be approved (red team R7 H-01: the version's scope is continuous)
  openVersionCarrying(p.root, p.reader, { scopes: ["chapter:le-chatelier"], reason: "objectives split", instructorWords: "Open version 2: the objectives split." }, I);
  assert.equal(chapterStates(p.root, p.reader)["le-chatelier"].approved, false, "v1's approval does not cover v2");
  transition(p.root, p.reader, { chapter: "le-chatelier", to: "DRAFT", instructorWords: "back to draft" }, I);
  assert.equal(chapterStates(p.root, p.reader)["le-chatelier"].state, "DRAFT");
  assert.match(transitionProblems(p.root, p.reader, "le-chatelier", "ASSEMBLING").join(), /steering is not recorded/);
  steer(p);
  transition(p.root, p.reader, { chapter: "le-chatelier", to: "ASSEMBLING", instructorWords: "assemble it" }, I);
  assert.equal(chapterStates(p.root, p.reader)["le-chatelier"].state, "ASSEMBLING");
  recordApproval(p.root, p.reader, ["chemical-equilibrium", "le-chatelier"], { chapter: "le-chatelier", instructorWords: "Approve chapter 2, version 2." }, I);
  const after = chapterStates(p.root, p.reader)["le-chatelier"];
  assert.equal(after.state, "PACKAGE"); assert.equal(after.version, 2); assert.equal(after.approved, true);
  assert.equal(chapterStates(p.root, p.reader)["chemical-equilibrium"].state, "PACKAGE", "chapters move independently");
});

// ---- commands (T1) ------------------------------------------------------------------------------------------------
test("[req.commands] every command refuses with a plain next step when its preconditions fail", (t) => {
  const p = copy(t);
  const expect = (r, re) => { assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, re); assert.match(r.stderr, /next:|already|not|only|which|needs|no chapter/); };
  expect(cli("approve", "--root", p.root), /approve what\?/);
  expect(cli("approve", "--root", p.root, "--chapter", "le-chatelier", "--name", I.name), /already approved/);
  expect(cli("answer", "--root", p.root, "--accept-all", "--name", I.name, "--words", "ok"), /there is no digest to answer[\s\S]*next: node scripts\/coursewerk.mjs digest/);
  expect(cli("publish", "--root", p.root, "--inputs", p.inputs, "--name", I.name), /quotes their words[\s\S]*next: --words/);
  expect(cli("interrupt", "--root", p.root, "--reason", "i-am-unsure", "--question", "?", "--model", "m"), /allowed only for spine-scope-conflict, missing-input, rights-blocker, spine-change-request/);
  expect(cli("assemble", "--root", p.root, "--chapter", "le-chatelier", "--name", I.name, "--words", "assemble"), /re-assembled only after a structural change/);
  expect(cli("revert", "--root", p.root), /which correction\?/);
  // a v2 package whose setting was lowered is told to restore it, never to migrate (red-team round 5, F2: the setting
  // is bound to the log)…
  fs.writeFileSync(path.join(p.root, "metadata", "coursewerk.json"), JSON.stringify({ schemaVersion: 1, spine: 1 }));
  expect(cli("status", "--root", p.root), /decision log shows spine v2 in force[\s\S]*next: restore it/);
  // …and a v0.12 package (no v2 record in its log) is told how to migrate
  fs.rmSync(path.join(p.root, "metadata", "LOG.jsonl"));
  expect(cli("status", "--root", p.root), /v0\.12 package[\s\S]*next: migrate the spine first/);
});

// ---- the digest and answers (T1) ----------------------------------------------------------------------------------
const q = (i, extra = {}) => makeFinding({ module: "ms8-verdicts", kind: "knowledge-concern", units: [`u-study-guide-le-chatelier-x-${i}`], statusClass: "question", route: "digest", basis: "b", evidence: { type: "judgment", note: `concern number ${i} about a distinct thing ${"abcdefghijklmnop"[i]}` }, recommendation: "keep", ...extra });

test("[req.digest.budget] questions are clustered by root cause, ranked, capped; overflow is deferred, never dropped, and goes first next time; corrections sit outside the budget", (t) => {
  const p = copy(t);
  const unitInfo = new Map(Array.from({ length: 16 }, (_, i) => [`u-study-guide-le-chatelier-x-${i}`, { deliverable: "study-guide/le-chatelier.md", contentHash: "a".repeat(64) }]));
  const same = [0, 1, 2].map((i) => makeFinding({ module: "ms1-sources", kind: "fact-disputed", units: [`u-study-guide-le-chatelier-x-${i}`], statusClass: "question", route: "digest", basis: "b", evidence: { type: "conflict", note: `sources give 1864 and 1865 for unit u-a-${i}` } }));
  const findings = [...Array.from({ length: 13 }, (_, i) => q(i + 3)), ...same,
    makeFinding({ module: "skeleton", kind: "evidence-missing", units: ["u-x"], statusClass: "obligation", route: "agent", basis: "b", evidence: { type: "missing", what: "evidence" } })];
  assert.equal(new Set(same.map(rootCause)).size, 1, "one root cause");
  const corrections = [{ id: "c-1", diff: "- a\n+ b" }];
  const d = buildDigest(p.root, findings, unitInfo, { cap: 10, corrections });
  assert.equal(d.entries.length, 10); assert.equal(d.deferred.count, 4, "14 clusters, 10 shown, 4 deferred — none dropped");
  assert.equal(d.entries[0].count, 3, "the merged cluster ranks first"); assert.equal(d.entries[0].kind, "fact-disputed");
  assert.deepEqual(d.corrections, corrections, "corrections are outside the budget");
  assert.deepEqual(d.progress.agentOpen, { "evidence-missing": 1 }, "agent-routed work is a progress summary, not a question");
  deliverDigest(p.root, d, AGENT);
  const d2 = buildDigest(p.root, findings, unitInfo, { cap: 10 });
  assert.deepEqual(d2.entries.slice(0, 4).map((e) => e.key).sort(), [...d.deferred.keys].sort(), "the deferred clusters come first next time");
  assert.ok(d2.entries.slice(0, 4).every((e) => e.deferredBefore));
  assert.ok(readLogText(p.root).includes('"type":"checkpoint"'));
});

test("[req.answers.persist] an answered question is not asked again while its basis is unchanged; only the instructor answers", (t) => {
  const p = copy(t);
  const unitInfo = new Map([[`u-study-guide-le-chatelier-x-4`, { deliverable: "study-guide/le-chatelier.md", contentHash: "a".repeat(64) }]]);
  const f = [q(4)];
  const d = buildDigest(p.root, f, unitInfo);
  assert.throws(() => answerDigest(p.root, d, { acceptAll: true, instructorWords: "accept" }, AGENT), /only the instructor answers/);
  answerDigest(p.root, d, { acceptAll: true, instructorWords: "Accept the recommendations." }, I);
  assert.equal(buildDigest(p.root, f, unitInfo).entries.length, 0, "answered: not asked again");
  const changed = new Map([[`u-study-guide-le-chatelier-x-4`, { deliverable: "study-guide/le-chatelier.md", contentHash: "b".repeat(64) }]]);
  assert.equal(buildDigest(p.root, f, changed).entries.length, 1, "the unit changed: the question returns");
});

// ---- publish and pack (T1) ----------------------------------------------------------------------------------------
test("[req.publish.record] [req.publish.scope] [req.oldgate.retired] a publish records hash, approvals and open questions; only eligible chapters go; the pack is exactly that decision", (t) => {
  const p = copy(t);
  clearLeChatelier(p);
  const g = runGate(p.root, { inputsDir: p.inputs });
  const info = unitInfoOf(p.root, p.reader);
  const el = eligibility(p.root, p.reader, g, new Map([...info].map(([k, v]) => [k, v.deliverable])));
  assert.equal(el.chapters["le-chatelier"].publishable, true, JSON.stringify(el.chapters["le-chatelier"].why));
  answerSpineDetail(p, g, info);
  assert.equal(el.chapters["chemical-equilibrium"].publishable, false);
  assert.throws(() => publishDecision(p.root, p.reader, { gateResult: g, unitInfo: info, instructorWords: "go" }, AGENT), /instructor's decision/);
  const r = publishDecision(p.root, p.reader, { gateResult: g, unitInfo: info, instructorWords: "Publish what is ready." }, I);
  assert.deepEqual(r.chapters.map((c) => c.chapter), ["le-chatelier"]);
  assert.ok(r.chapters[0].approval.seq > 0 && r.chapters[0].approval.hash, "the approval it relied on");
  assert.ok(r.course?.approval, "the course map, with its own approval");
  assert.match(r.excluded[0].why.join(), /evidence-missing|guide-entry-short/);
  assert.match(r.contentHash, /^[0-9a-f]{64}$/); assert.ok(Array.isArray(r.openQuestions));
  assert.ok(fs.existsSync(path.join(p.root, "metadata", "publish", `${String(r.seq).padStart(4, "0")}.json`)));
  // the pack: only what was published, no v0.12 release checks (no key-fact review, no visual attestation needed)
  assert.ok(!["KEY_FACT_REVIEW.json", "VISUAL_REVIEW.json"].some((f) => fs.existsSync(path.join(p.root, "metadata", f))), "no v0.12 key-fact review or visual attestation exists");
  fs.appendFileSync(path.join(p.root, "study-guide", "le-chatelier.md"), "\nAn edit after the decision.\n");
  let pk = spawnSync(process.execPath, [path.join(REPO, "scripts", "pack.mjs"), "--contract", "mirror", "--package", p.root, "--out", p.out], { encoding: "utf8" });
  assert.equal(pk.status, 2, "the package changed after the decision"); assert.match(pk.stderr, /publish again/);
  git(p.root, "checkout", "--", "study-guide");
  pk = spawnSync(process.execPath, [path.join(REPO, "scripts", "pack.mjs"), "--contract", "mirror", "--package", p.root, "--out", p.out], { encoding: "utf8" });
  assert.equal(pk.status, 0, pk.stderr);
  const receipt = JSON.parse(pk.stdout);
  const list = spawnSync("unzip", ["-Z1", receipt.zip], { encoding: "utf8" }).stdout.split("\n");
  assert.ok(list.includes("study-guide/le-chatelier.md") && !list.includes("study-guide/chemical-equilibrium.md"), "only the published chapter");
  assert.ok(list.includes("concepts/course.md") && list.includes("metadata/PUBLISHED.json") && list.includes("metadata/LOG.jsonl"));
  const manifest = JSON.parse(spawnSync("unzip", ["-p", receipt.zip, "alembic.json"], { encoding: "utf8" }).stdout);
  assert.deepEqual(manifest.chapters.map((c) => c.slug), ["le-chatelier"]);
  assert.equal(receipt.clearedForPublicRelease, true); assert.equal(latestPublish(p.root).current, true);
});

test("[req.draft.private] [req.ms2.public-only] [req.profiles.one-gate] one gate for both profiles (rights only in public); a draft is shared only privately, marked as a draft", (t) => {
  const p = copy(t);
  const pub = runGate(p.root, { profile: "public", inputsDir: p.inputs }), priv = runGate(p.root, { profile: "private", inputsDir: p.inputs });
  assert.deepEqual(pub.wiring.modulesRan.filter((m) => !priv.wiring.modulesRan.includes(m)), ["ms2-rights"], "the profile toggles only the rights module");
  assert.deepEqual(priv.wiring.modulesRan.filter((m) => !pub.wiring.modulesRan.includes(m)), []);
  clearLeChatelier(p);
  openMajorVersion(p.root, { scopes: ["chapter:chemical-equilibrium"], reason: "reorganised" }, I);
  transition(p.root, p.reader, { chapter: "chemical-equilibrium", to: "DRAFT", instructorWords: "back to draft" }, I);
  p.commit();
  const info = unitInfoOf(p.root, p.reader);
  const gPub = runGate(p.root, { profile: "public", inputsDir: p.inputs });
  assert.throws(() => publishDecision(p.root, p.reader, { gateResult: gPub, unitInfo: info, instructorWords: "go", includeDrafts: true }, I), /only in a private package/);
  const gPriv = runGate(p.root, { profile: "private", inputsDir: p.inputs });
  answerSpineDetail(p, gPriv, info);
  const r = publishDecision(p.root, p.reader, { gateResult: gPriv, unitInfo: info, instructorWords: "Share it with my class, draft included.", includeDrafts: true }, I);
  assert.deepEqual(r.drafts.map((d) => d.chapter), ["chemical-equilibrium"]); assert.equal(r.profile, "private");
  p.commit();
  const pk = spawnSync(process.execPath, [path.join(REPO, "scripts", "pack.mjs"), "--contract", "mirror", "--package", p.root, "--out", p.out], { encoding: "utf8" });
  assert.equal(pk.status, 0, pk.stderr);
  const receipt = JSON.parse(pk.stdout);
  assert.match(receipt.zip, /\.private\.alembic\.zip$/); assert.equal(receipt.clearedForPublicRelease, false, "a private package is never cleared for public release");
  const manifest = JSON.parse(spawnSync("unzip", ["-p", receipt.zip, "alembic.json"], { encoding: "utf8" }).stdout);
  assert.deepEqual(manifest.chapters.map((c) => [c.slug, !!c.draft]), [["chemical-equilibrium", true], ["le-chatelier", false]]);
});

// ---- the work loop's bounds (T1) ----------------------------------------------------------------------------------
test("[req.loop.bounds] the loop stops at a fixed point or when the budget is spent; every instructor act refuses the agent", async (t) => {
  const { loopStep, INSTRUCTOR_ACTS } = await import("../scripts/lib/core/loop.mjs");
  const f = (id, route = "agent") => ({ id, route, status: "open", kind: "k", statusClass: "obligation" });
  assert.equal(loopStep({ previous: null, current: [f("a")] }).stop, false, "first run: work to do");
  assert.equal(loopStep({ previous: [f("a"), f("b")], current: [f("a")] }).stop, true, "nothing new: a fixed point (a stays open for the digest)");
  assert.match(loopStep({ previous: [f("a")], current: [f("a"), f("c")], spent: { iterations: 4, costUsd: 0 } }).why, /budget is spent/);
  assert.match(loopStep({ previous: [f("a")], current: [f("c")], spent: { iterations: 1, costUsd: 9 } }).why, /\$5/);
  assert.equal(loopStep({ previous: [f("a")], current: [f("a"), f("q", "digest")] }).stop, true, "digest questions are not the loop's work");
  // the acts that would change the spine, answer for the instructor or reopen a decision all refuse the agent
  const p = copy(t);
  const { claimAuthorship } = await import("../scripts/lib/core/units_index.mjs");
  const { revertCorrection } = await import("../scripts/lib/verify/verdicts.mjs");
  const { disableModule } = await import("../scripts/lib/skeleton/promotion.mjs");
  const refusals = [
    () => recordApproval(p.root, p.reader, ["chemical-equilibrium", "le-chatelier"], { chapter: "le-chatelier", instructorWords: "x" }, AGENT),
    () => openMajorVersion(p.root, { scopes: ["chapter:le-chatelier"], reason: "x" }, AGENT),
    () => transition(p.root, p.reader, { chapter: "le-chatelier", to: "DRAFT", instructorWords: "x" }, AGENT),
    () => recordSteering(p.root, { defaults: {}, acceptAll: true, instructorWords: "x" }, AGENT),
    () => answerDigest(p.root, { entries: [] }, { acceptAll: true, instructorWords: "x" }, AGENT),
    () => confirmUnits(p.root, p.reader, ["u-x"], { what: "fact", instructorWords: "I confirm these." }, AGENT),
    () => claimAuthorship(p.root, { units: ["u-x"], instructorWords: "x" }, AGENT),
    () => revertCorrection(p.root, p.reader, "c-x", { note: "x" }, AGENT),
    () => publishDecision(p.root, p.reader, { gateResult: null, unitInfo: new Map(), instructorWords: "x" }, AGENT),
    () => disableModule(p.root, { name: "ms6-quotations", reason: "x" }, AGENT),
  ];
  assert.equal(refusals.length, INSTRUCTOR_ACTS.length, "one probe per instructor act");
  for (const [i, fn] of refusals.entries()) assert.throws(fn, /instructor/, INSTRUCTOR_ACTS[i]);
  // a spine edit by the agent voids the approval: nothing in that chapter publishes until the instructor re-approves
  fs.appendFileSync(path.join(p.root, "concepts", "le-chatelier.md"), "\n- An extra sub-concept the agent added.\n");
  assert.equal(chapterStates(p.root, p.reader)["le-chatelier"].approved, false);
});

// ---- found by the T3 scenario (P8) ----------------------------------------------------------------------------------
test("[req.units.external-edit] an edit of unknown authorship stays a digest question until the instructor answers it in their words", async (t) => {
  const p = copy(t);
  const { indexAndStamp } = await import("../scripts/lib/core/obligations.mjs");
  const { claimAuthorship } = await import("../scripts/lib/core/units_index.mjs");
  fs.writeFileSync(path.join(p.root, "study-guide", "le-chatelier.md"), fs.readFileSync(path.join(p.root, "study-guide", "le-chatelier.md"), "utf8").replace("without being consumed", "without itself being used up"));
  indexAndStamp(p.root, p.reader, {});
  const ask = () => { const g = runGate(p.root, { inputsDir: p.inputs }); return buildDigest(p.root, g.findings, unitInfoOf(p.root, p.reader)).entries.filter((e) => e.kind === "unit-unknown-authorship"); };
  const e = ask();
  assert.equal(e.length, 1, "in the digest at every checkpoint, not only at the index run that found it"); assert.equal(e[0].recommendation, "accept as mine");
  assert.equal(ask().length, 1, "and raised once");
  assert.throws(() => claimAuthorship(p.root, { units: e[0].units }, I), /quotes the instructor's words/);
  // answering the digest entry "accept as mine" records the authorship itself (P10 dogfood)
  const g = runGate(p.root, { inputsDir: p.inputs });
  const d = buildDigest(p.root, g.findings, unitInfoOf(p.root, p.reader));
  answerDigest(p.root, d, { answers: { [d.entries.find((x) => x.kind === "unit-unknown-authorship").key]: "accept as mine" }, instructorWords: "That edit is mine.", reader: p.reader }, I);
  assert.equal(ask().length, 0);
  assert.ok(readLogText(p.root).includes('"instructorWords":"That edit is mine."'));
});

test("[req.loop.bounds] re-saving a unit's spine links is not a re-verification: only a changed link re-stamps", async (t) => {
  const p = copy(t);
  const { linkUnits, loadUnits } = await import("../scripts/lib/core/obligations.mjs");
  // a concept the units depend on changes: its dependents are stale
  const f = path.join(p.root, "concepts", "le-chatelier.md");
  const before = fs.readFileSync(f, "utf8");
  const stale = () => coreObligations(p.root, p.reader, "t").filter((x) => x.kind === "reverify").flatMap((x) => x.units);
  const n0 = stale().length;
  const line = before.split("\n").find((l) => /^\s*[-*]\s+.*\{#?concept|\[anchor:|\]\s*$/.test(l) && /partially/i.test(l)) || before.split("\n").find((l) => /partially/i.test(l));
  fs.writeFileSync(f, before.replace(line, line.replace(/partially/i, "only in part")));
  const now = stale();
  assert.ok(now.length > n0, "dependents of the changed concept must be re-verified");
  const u = loadUnits(p.root, p.reader).find((x) => x.id === now[0]);
  linkUnits(p.root, p.reader, { [u.id]: u.spineNodes }, AGENT);
  assert.ok(stale().includes(u.id), "the same links saved again clear nothing");
});

// ---- migration (T1) -----------------------------------------------------------------------------------------------
test("[req.docs.migration] a v0.12 package migrates by tool, at the instructor's request, and the result waits for approval — never converted silently", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-migrate-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(path.join(HERE, "fixtures", "c2-chemistry", "package"), root, { recursive: true });
  for (const a of [["init", "-q"], ["config", "user.name", "T"], ["config", "user.email", "t@example.invalid"], ["add", "-A"], ["commit", "-q", "-m", "v0.12"]]) git(root, ...a);
  const spine = (...a) => spawnSync(process.execPath, [path.join(REPO, "scripts", "spine.mjs"), ...a], { encoding: "utf8" });
  assert.match(spine("migrate", "--root", root, "--name", I.name).stderr, /the instructor's request/);
  fs.appendFileSync(path.join(root, "concepts", "le-chatelier.md"), "\n");
  assert.match(spine("migrate", "--root", root, "--name", I.name, "--words", "Migrate the course.").stderr, /its own reviewable diff/);
  git(root, "checkout", "--", ".");
  const r = spine("migrate", "--root", root, "--name", I.name, "--words", "Migrate the course to the new spine.");
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /every chapter is ASSEMBLING/);
  assert.ok(git(root, "diff", "--stat").stdout.includes("concepts/"), "the conversion is a reviewable diff");
  const reader = liveReader(root);
  const states = chapterStates(root, reader);
  for (const s of Object.values(states)) { assert.equal(s.state, "ASSEMBLING"); assert.equal(s.approved, false); }
  assert.match(readLogText(root), /"event":"migrated-from-v0\.12"[^\n]*"instructorWords":"Migrate the course to the new spine\."/);
  const mig = readLogText(root).split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((x) => x.payload?.event === "migrated-from-v0.12");
  assert.ok(mig.payload.notes.some((n) => /uncertain[\s\S]*now a firm prerequisite/.test(n)), "what the conversion could not carry is recorded, to be shown at approval");
  assert.ok(mig.payload.notes.some((n) => /Type and Count to propose/.test(n)));
  assert.match(spine("migrate", "--root", root, "--name", I.name, "--words", "again").stderr, /already spine v2/);
  const st = cli("status", "--root", root);
  assert.equal(st.status, 0, st.stderr);
  for (const c of Object.values(JSON.parse(st.stdout).chapters)) assert.ok(c.why.some((w) => /ASSEMBLING|approval is not valid/.test(w)), "not publishable until approved");
});

// ---- found by the P9 docs-only scenario -----------------------------------------------------------------------------
test("[req.answers.persist] [req.digest.budget] what only the instructor can settle reaches the digest, and answering it settles it; the agent's recommendation is shown as the agent's and covered by accept-all", async (t) => {
  const p = copy(t);
  const { verifySemi } = await import("../scripts/lib/verify/verdicts.mjs");
  const { replayVerifier } = await import("../scripts/lib/verify/dispatch.mjs");
  const { fsInputReader, pinnedTexts } = await import("../scripts/lib/verify/references.mjs");
  const { recommendDigest } = await import("../scripts/lib/core/digest.mjs");
  const { loadUnits, indexAndStamp } = await import("../scripts/lib/core/obligations.mjs");
  const { beginSession } = await import("../scripts/lib/core/units_index.mjs");
  // a practice question with invented values: the verifier reads it as exercise data
  const ex = "u-practice-chemical-equilibrium-questions-3";
  const hypothetical = replayVerifier((pr) => ({ nonce: pr.match(/"nonce": "([0-9a-f]+)"/)[1], claims: pr.split("\nCLAIMS\n")[1].split("\n\nPASSAGES")[0].split("\n").filter((l) => /^\d+\. /.test(l)).map((_, i) => ({ claim: i + 1, verdict: "hypothetical", quotes: [] })) }));
  await verifySemi(p.root, p.reader, { texts: pinnedTexts(fsInputReader(p.inputs)), verifier: hypothetical, only: [ex] });
  // an answer whose question changed in a fact (a rephrase would leave it alone, D19-C)
  const q = loadUnits(p.root, p.reader).find((u) => u.id === "u-practice-le-chatelier-questions-1");
  beginSession(p.root, p.reader, AGENT);
  fs.writeFileSync(path.join(p.root, "practice", "le-chatelier.md"), fs.readFileSync(path.join(p.root, "practice", "le-chatelier.md"), "utf8").replace(q.text, q.text.replace("State Le Chatelier's principle.", "State the Le Chatelier–Braun principle.")));
  indexAndStamp(p.root, p.reader, { as: "agent", party: AGENT });
  p.commit();
  const digestNow = () => buildDigest(p.root, runGate(p.root, { inputsDir: p.inputs }).findings, unitInfoOf(p.root, p.reader));
  const d = digestNow();
  const exEntry = d.entries.find((e) => e.kind === "exercise-data-confirm"), ansEntry = d.entries.find((e) => e.kind === "answer-still-correct");
  assert.ok(exEntry && exEntry.units.includes(ex) && exEntry.recommendation === "confirm", "exercise data comes to the instructor, not left as agent work");
  // an answer whose question changed is the agent's cheap blind re-check, never the instructor's question (R1 coherence F7)
  assert.equal(ansEntry, undefined, "not in the digest");
  const ans = runGate(p.root, { inputsDir: p.inputs }).findings.find((f) => f.kind === "answer-still-correct" && f.route === "agent").units[0];
  const knowledge = d.entries.find((e) => !e.recommendation);
  if (knowledge) { recommendDigest(d, d.entries.indexOf(knowledge) + 1, "keep the text", AGENT); assert.match(knowledge.recommendedBy, /^agent/); }
  assert.throws(() => recommendDigest(d, 1, "x", I), /agent's proposal/);
  answerDigest(p.root, d, { acceptAll: true, instructorWords: "Accept all recommendations.", reader: p.reader }, I);
  const left = coreObligations(p.root, p.reader, "t");
  assert.ok(!left.some((f) => f.kind === "evidence-missing" && f.units.includes(ex)), "confirming the exercise data clears its obligation");
  assert.ok(left.some((f) => f.kind === "reverify" && f.units.includes(ans)), "accept-all does not re-verify an answer nobody re-read");
  const { verifyKnowledge } = await import("../scripts/lib/verify/verdicts.mjs");
  const { reverifyUnits } = await import("../scripts/lib/core/obligations.mjs");
  await verifyKnowledge(p.root, p.reader, { verifier: replayVerifier((pr) => ({ nonce: pr.match(/"nonce": "([0-9a-f]+)"/)[1], concerns: [] })), only: [ans] });
  reverifyUnits(p.root, p.reader, [ans], AGENT); // the agent re-read it with its question, blind
  assert.ok(!coreObligations(p.root, p.reader, "t").some((f) => f.kind === "reverify" && f.units.includes(ans)), "the re-check clears the answer's re-verification");
  assert.match(readLogText(p.root), /"type":"confirmation"[^\n]*"instructorWords":"Accept all recommendations\."/);
  assert.throws(() => confirmUnits(p.root, p.reader, [ex], { what: "fact" }, I), /quotes the instructor's words/);
});

test("[req.docs.migration] the agent's spine proposals and critique are recorded and shown in the approval view", (t) => {
  const p = copy(t);
  const spine = (...a) => spawnSync(process.execPath, [path.join(REPO, "scripts", "spine.mjs"), ...a], { encoding: "utf8" });
  let r = spine("propose", "--root", p.root, "--doc", "assessment-support/le-chatelier.md", "--anchors", "word-partially", "--model", "m");
  assert.equal(r.status, 0, r.stderr);
  assert.match(spine("propose", "--root", p.root, "--doc", "assessment-support/le-chatelier.md", "--anchors", "no-such-anchor", "--model", "m").stderr, /no spine item/);
  r = spine("critique", "--root", p.root, "--chapter", "le-chatelier", "--note", "Should the catalyst objective move to chapter 1?", "--recommend", "keep it here", "--model", "m");
  assert.equal(r.status, 0, r.stderr);
  const view = spine("preview", "--root", p.root, "--chapter", "le-chatelier").stdout;
  assert.match(view, /PROPOSED BY THE AGENT/); assert.match(view, /Questions for you[\s\S]*catalyst objective move to chapter 1/);
  assert.match(readLogText(p.root), /"event":"spine-proposed"[\s\S]*"event":"spine-critique"/);
});

// ---- found by the P10 digest scenario -------------------------------------------------------------------------------
test("[req.digest.budget] the digest's size is the instructor's; 'later' defers an entry without answering it", (t) => {
  const p = copy(t);
  const r = cli("digest", "--root", p.root, "--cap", "50");
  assert.equal(r.status, 1); assert.match(r.stderr, /instructor's setting/);
  assert.match(cli("digest-cap", "--root", p.root, "--set", "3", "--name", I.name).stderr, /quotes their words/);
  assert.equal(cli("digest-cap", "--root", p.root, "--set", "3", "--name", I.name, "--words", "Three at a time.").status, 0);
  const unitInfo = new Map(Array.from({ length: 6 }, (_, i) => [`u-study-guide-le-chatelier-x-${i}`, { deliverable: "study-guide/le-chatelier.md", contentHash: "a".repeat(64) }]));
  const fs6 = Array.from({ length: 6 }, (_, i) => q(i));
  const d = buildDigest(p.root, fs6, unitInfo, { cap: 3 });
  assert.equal(d.entries.length, 3); assert.equal(d.deferred.count, 3);
  answerDigest(p.root, d, { answers: { [d.entries[0].key]: "later" }, instructorWords: "Later." }, I);
  const d2 = buildDigest(p.root, fs6, unitInfo, { cap: 6 });
  const e = d2.entries.find((x) => x.key === d.entries[0].key);
  assert.ok(e, "a deferred entry is still asked"); assert.equal(e.deferredBefore, true, "and marked as owed");
});

// ---- the issue history (operator, 2026-10-02) -----------------------------------------------------------------------
test("[req.history.record] the history rebuilds, from the package's records, how each issue was found and how it was settled", async (t) => {
  const p = copy(t);
  const { verifyKnowledge } = await import("../scripts/lib/verify/verdicts.mjs");
  const { replayVerifier } = await import("../scripts/lib/verify/dispatch.mjs");
  const { loadUnits, indexAndStamp } = await import("../scripts/lib/core/obligations.mjs");
  const { beginSession } = await import("../scripts/lib/core/units_index.mjs");
  const u = loadUnits(p.root, p.reader).find((x) => x.id === "u-study-guide-le-chatelier-adding-a-catalyst-1");
  const words = u.text.match(/accelerates the \*\*forward and reverse reactions by the same factor\.\*\*/)[0];
  const concern = replayVerifier((pr) => ({ nonce: pr.match(/"nonce": "([0-9a-f]+)"/)[1], concerns: [{ text: words, problem: "Say that the rate constants are multiplied by the same factor.", suggestion: "…" }] }));
  for (let k = 0; k < 2; k++) await verifyKnowledge(p.root, p.reader, { verifier: concern, only: [u.id] }); // found twice
  beginSession(p.root, p.reader, AGENT);
  fs.writeFileSync(path.join(p.root, "study-guide", "le-chatelier.md"), fs.readFileSync(path.join(p.root, "study-guide", "le-chatelier.md"), "utf8").replace("by the same factor.**", "by the same factor** (their rate constants are multiplied equally)."));
  indexAndStamp(p.root, p.reader, { as: "agent", party: AGENT });
  const r = cli("history", "--root", p.root);
  assert.equal(r.status, 0, r.stderr);
  const row = r.stdout.split("\n").find((l) => l.includes("rate constants are multiplied"));
  assert.ok(row, "the concern is in the history");
  assert.match(row, /blind conceptual review/); assert.match(row, /the text was revised since/); assert.match(row, /\| 2 \|$/, "found twice, one row");
});

// ---- open questions at publish (operator, 2026-10-02) ---------------------------------------------------------------
test("[req.publish.questions-raised] open questions never block, but are raised first; the instructor may publish over them, and the decision says so", (t) => {
  const p = copy(t);
  clearLeChatelier(p);
  const g = runGate(p.root, { inputsDir: p.inputs });
  const info = unitInfoOf(p.root, p.reader);
  const u = [...info.keys()].find((k) => k.startsWith("u-study-guide-le-chatelier"));
  answerSpineDetail(p, g, info);
  g.gate.questions.push({ id: "q-open-1", module: "ms8-verdicts", kind: "knowledge-concern", statusClass: "question", units: [u], evidence: { note: "Is the catalyst sentence too strong?" } });
  let raised;
  assert.throws(() => publishDecision(p.root, p.reader, { gateResult: g, unitInfo: info, instructorWords: "Publish what is ready." }, I), (e) => ((raised = e.openQuestions), /open question/.test(e.message)));
  assert.equal(raised.length, 1); assert.equal(raised[0].question, "Is the catalyst sentence too strong?");
  assert.ok(!fs.existsSync(path.join(p.root, "metadata", "publish")), "nothing was published before the question was raised");
  const r = publishDecision(p.root, p.reader, { gateResult: g, unitInfo: info, instructorWords: "I have seen the question. Publish anyway.", overQuestions: true }, I);
  assert.deepEqual(r.chapters.map((c) => c.chapter), ["le-chatelier"], "the instructor's order is followed");
  assert.equal(r.overQuestions, true); assert.equal(r.openQuestions[0].id, "q-open-1");
});

// R1 coherence (F2): an answer is bound to its question's full normalized wording, so ANY rewording makes it owe a
// re-check — the agent's cheap blind re-read, never the instructor's question; markup and punctuation raise nothing.
test("[req.core.reverify-obligation] an answer whose question is reworded owes the agent's re-check; a change of markup or punctuation does not (P11 wiring sweep, R1 coherence)", async (t) => {
  const { loadUnits, indexAndStamp } = await import("../scripts/lib/core/obligations.mjs");
  const { beginSession } = await import("../scripts/lib/core/units_index.mjs");
  const p = copy(t);
  const f = path.join(p.root, "practice", "le-chatelier.md"), src = fs.readFileSync(f, "utf8");
  const answerOf = () => loadUnits(p.root, liveReader(p.root)).find((u) => u.form === "answer" && /^Toward the reactants, to the left\. For an exothermic reaction heat behaves as a \*\*product\*\*/.test(u.text));
  const stale = () => coreObligations(p.root, liveReader(p.root), "t").some((x) => x.kind === "answer-still-correct" && x.route === "agent" && x.units.includes(answerOf().id));
  beginSession(p.root, p.reader, AGENT);
  fs.writeFileSync(f, src.replace("The temperature is raised. Which way", "The temperature is **raised**; which way"));
  indexAndStamp(p.root, liveReader(p.root), { as: "agent", party: AGENT });
  assert.equal(stale(), false, "markup and punctuation raise nothing");
  beginSession(p.root, liveReader(p.root), AGENT);
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("The temperature is **raised**; which way", "The temperature is lowered. Which way"));
  indexAndStamp(p.root, liveReader(p.root), { as: "agent", party: AGENT });
  assert.equal(stale(), true, "raised → lowered: the answer must be re-read");
});

test("[req.versions.carry] opening a major version carries its chapter's units: each owes re-verification; other chapters are untouched (D15, P11 wiring sweep)", (t) => {
  const p = copy(t);
  const r = spawnSync(process.execPath, [path.join(REPO, "scripts", "spine.mjs"), "version", "--root", p.root, "--scopes", "chapter:le-chatelier", "--reason", "an objective split in two", "--name", "Yu Wang (wangyu16)", "--words", "Open version 2 of chapter 2."], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(JSON.parse(r.stdout).carried > 0, "units were carried");
  const ob = coreObligations(p.root, liveReader(p.root), "t").filter((f) => f.kind === "carried-unverified");
  assert.ok(ob.length > 0 && ob.every((f) => f.units.every((u) => /-le-chatelier-/.test(u))), "only chapter 2's units owe re-verification");
  assert.match(readLogText(p.root), /"event":"units-carried"/);
});

// ---- D39 (operator, 2026-10-03): a changed concept-map line gets a blind review at re-approval -----------------------
test("[req.spine.blind-review] at re-approval the lines changed since the last approval are reviewed blind; the concerns are questions in the preview, and re-approval waits for the review", async (t) => {
  const { changedSpineLines, reviewSpineChanges, currentSpineReview } = await import("../scripts/lib/core/spine_review.mjs");
  const { replayVerifier } = await import("../scripts/lib/verify/dispatch.mjs");
  const p = copy(t);
  assert.equal(changedSpineLines(p.root, p.reader, "chapter:le-chatelier").lines.length, 0, "nothing changed since the approval");
  const f = path.join(p.root, "concepts", "le-chatelier.md");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("(Le Chatelier–Braun principle, aliases", "(Le Chatelier–Bunsen principle, aliases"));
  const ch = changedSpineLines(p.root, liveReader(p.root), "chapter:le-chatelier");
  assert.equal(ch.lines.length, 1); assert.match(ch.lines[0].text, /Bunsen/);
  // re-approval refuses until the changed lines had their review
  const approve = (...extra) => spawnSync(process.execPath, [path.join(REPO, "scripts", "spine.mjs"), "approve", "--root", p.root, "--chapter", "le-chatelier", "--name", "Yu Wang (wangyu16)", "--words", "Approve chapter 2 again.", ...extra], { encoding: "utf8" });
  const refused = approve();
  assert.notEqual(refused.status, 0); assert.match(refused.stderr, /blind review: node scripts\/spine\.mjs review/);
  let seen = "";
  const verifier = replayVerifier((pr) => ((seen = pr), { nonce: pr.match(/"nonce": "([0-9a-f]+)"/)[1], concerns: [{ line: 1, kind: "wrong", text: "Le Chatelier–Bunsen principle", problem: "The principle is co-named for Karl Ferdinand Braun, not Robert Bunsen.", suggestion: "Le Chatelier–Braun principle" }] }));
  const r = await reviewSpineChanges(p.root, liveReader(p.root), "chapter:le-chatelier", { verifier });
  assert.match(seen, /CHANGED LINES\n1\. .*Bunsen/); // R3 (D43, coherence F1): the approved line it replaced is asked about too, marked "(removed)" — and nothing else
  assert.match(seen, /CHANGED LINES\n1\. .*Bunsen.*\n2\. \(removed\) .*Braun/); assert.ok(!/CHANGED LINES[\s\S]*\n3\. /.test(seen.split("THE WHOLE MAP")[0]), "only the changed line (and the line it replaced) is reviewed");
  assert.equal(r.concerns.length, 1); assert.ok(currentSpineReview(p.root, liveReader(p.root), "chapter:le-chatelier"));
  assert.match(readLogText(p.root), /"type":"dispatch"/, "the review is a logged dispatch");
  const preview = spawnSync(process.execPath, [path.join(REPO, "scripts", "spine.mjs"), "preview", "--root", p.root, "--chapter", "le-chatelier"], { encoding: "utf8" });
  assert.match(preview.stdout, /Possibly wrong \(line \d+\): "Le Chatelier–Bunsen principle"\. The principle is co-named for Karl Ferdinand Braun/);
  assert.equal(fs.readFileSync(f, "utf8").includes("Bunsen"), true, "the spine is the instructor's: nothing was edited");
  assert.equal(approve().status, 0, "with the review run, the instructor can approve");
  // offline: re-approval without the review is the agent's explicit choice, recorded
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("Bunsen", "Braun"));
  assert.equal(approve("--without-review").status, 0);
  assert.match(readLogText(p.root), /approved without the blind review of the changed lines/);
});
