// Red team, round 4 — COHERENCE (H1–H5), and the CONTROL finding with the same root cause as F8 (C4-01): every finding
// of the round-4 report (var/projects/coursewerk-caeai/workspace/studies/p11/redteam-r4/coherence/REPORT.md, scripts
// f1…f8; …/redteam-r4/control-c245 c4-01) reproduced on the real course fixture and asserted CAUGHT. Each test fixes the
// class, not the instance:
//   F8 C4-01  "light" is inverted: old and new differ ONLY by whitespace, emphasis, list markers, case and prose
//             punctuation, on the RENDERED text; any sign, relation, arrow or operator change is substantive;
//   F1        key terms are matched on the text a reader sees ("**Endothermic** reaction" is a use);
//   F2        a reference without a number ("the same reaction", "the previous question") is an edge;
//   F3        every branch, its reflog and HEAD's reflog are history anchors; a release receipt's logHead is one too;
//   F4        a re-check owed because something moved is shown what moved, and `reverify` requires that it was;
//   F5        the answer binding reads the visible text with signs kept (a struck condition reaches the answer), with a
//             one-time stamp migration;
//   F6        key-term targets are namespaced by the map that defines them;
//   F7        a unit-record write that clears an obligation needs the evidence `reverify`/`confirm` need.
// Offline and deterministic: every blind review is a replayed test double.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader, manifestChapters } from "../scripts/lib/core/package_reader.mjs";
import { admitEvidence, confirmUnits, coreObligations, indexAndStamp, loadUnits, reverifyUnits, unitDepsHashes } from "../scripts/lib/core/obligations.mjs";
import { beginSession, readSidecar } from "../scripts/lib/core/units_index.mjs";
import { alteredSidecars, writeUnitRecords } from "../scripts/lib/core/unit_records.mjs";
import { approvalPrecondition, reviewSpineChanges } from "../scripts/lib/core/spine_review.mjs";
import { approvalStatus, recordApproval } from "../scripts/lib/core/approvals.mjs";
import { classifyChapterChange, lightKey, questionWording, readerView } from "../scripts/lib/core/change.mjs";
import { dependencyEdges, legacyQuestionCurrent, legacyQuestionHash, questionHash, sourceHashes, stampFor, targetHashes, termMatcher } from "../scripts/lib/core/dependencies.mjs";
import { parseSpine } from "../scripts/lib/core/spine.mjs";
import { logFindings } from "../scripts/lib/skeleton/gate.mjs";
import { appendLogRecord, parseLog, readLogText, recordHash } from "../scripts/lib/records/log.mjs";
import { knowledgeBundle, recordDispatch, replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { verifyKnowledge } from "../scripts/lib/verify/verdicts.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const LC_MAP = "concepts/le-chatelier.md", CE_MAP = "concepts/chemical-equilibrium.md";
const PR = "practice/le-chatelier.md", CE = "practice/chemical-equilibrium.md";
const A6 = "u-practice-le-chatelier-questions-12";
const gitIn = (root, ...a) => spawnSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { encoding: "utf8", maxBuffer: 1 << 30 });
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];
const clean = () => replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [] }));

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r4coh-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  gitIn(root, "init", "-q", "-b", "main"); gitIn(root, "add", "-A"); gitIn(root, "commit", "-qm", "baseline");
  const c = {
    root, dir, r: () => liveReader(root),
    units: () => loadUnits(root, liveReader(root)),
    unit: (deliverable, start) => loadUnits(root, liveReader(root)).find((u) => u.locator.deliverable === deliverable && u.text.startsWith(start)),
    read: (rel) => fs.readFileSync(path.join(root, rel), "utf8"),
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 50)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent: (fn) => { beginSession(root, liveReader(root), AGENT); fn(); return indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    owed: () => coreObligations(root, liveReader(root), "t"),
    kind: (ch) => approvalStatus(liveReader(root), manifestChapters(liveReader(root)), readLogText(root)).scopes[ch].change?.kind,
    glance: (ch) => recordApproval(root, liveReader(root), manifestChapters(liveReader(root)), { chapter: ch, glance: true, instructorWords: "Fine." }, I),
    // the routed full approval: the blind review of the changed lines (honest: changed, nothing wrong), then approval
    approveChanged: async (ch, words = "Approved.") => {
      await reviewSpineChanges(root, liveReader(root), `chapter:${ch}`, { verifier: replayVerifier((pr) => {
        const k = (pr.split("\nCHANGED LINES\n")[1] || "").split("\n\n")[0].split("\n").filter((l) => /^\d+\. /.test(l)).length;
        return { nonce: nonceOf(pr), concerns: [], meaning: Array.from({ length: k }, (_, i) => ({ line: i + 1, meaning: "changed" })) };
      }) });
      const r = liveReader(root), chs = manifestChapters(r), pre = approvalPrecondition(root, r, chs, { chapter: ch });
      assert.equal(pre.problem, undefined, pre.problem);
      return recordApproval(root, r, chs, { chapter: ch, instructorWords: words, note: pre.note }, I);
    },
  };
  c.reverifyOwed = () => new Set(c.owed().filter((f) => f.kind === "reverify").flatMap((f) => f.units));
  return c;
}

// ============================================ F8 + C4-01: "light" inverted =========================================
test("[req.coherence.light-spine] F8 + C4-01: light means only whitespace, emphasis, list markers, case and prose punctuation differ, on the rendered text; any sign, relation, arrow or operator change is substantive", async (t) => {
  const kind = (a, b) => classifyChapterChange({ nodes: [], entries: [] }, { nodes: [], entries: [] }, { beforeText: a, afterText: b }).kind;
  // every visible change of the report: never light, and with a sign, relation, arrow or operator, substantive
  for (const [a, b] of [["T ↑ ⇒ K ↓", "T ↑ ⇒ K ↑"], ["K ≫ 1", "K ≪ 1"], ["x ⩽ y", "x ⩾ y"], ["ΔG° = –RT ln K", "ΔG° = RT ln K"], ["ΔG° = －RT ln K", "ΔG° = RT ln K"],
    ["SCN⁻ binds", "SCN binds"], ["Fe³⁺ + SCN⁻", "Fe³⁻ + SCN⁺"], ["$a/b$", "$a*b$"], ["$10^{3}$", "$10_{3}$"], ["$\\ce{A -> B}$", "$\\ce{A <- B}$"], ["H~2~O", "H^2^O"]])
    assert.equal(kind(a, b), "substantive", `${a} → ${b}`);
  // a word moved into a link destination is gone for the reader: not light (a rephrasing at least, which needs the review)
  assert.notEqual(kind("and therefore does not shift a gas-phase equilibrium.", "and therefore does [](not) shift a gas-phase equilibrium."), "light");
  assert.notEqual(lightKey("does not shift"), lightKey("does [](not) shift"));
  assert.equal(readerView("does [](not) shift").replace(/\s+/g, " "), "does shift");
  // what stays light: whitespace, emphasis (either marker), list markers, case, prose punctuation
  for (const [a, b] of [["a system at equilibrium disturbed by a change", "a *system at equilibrium*, disturbed by a change"], ["a gas-phase equilibrium", "a gas phase equilibrium"],
    ["- item one", "* item one"], ["1. item one", "2) item one"], ["Solids melt.", "solids **melt**!"], ["the __rate__ of a reaction", "the _rate_ of a  reaction;"], ["the rate\nof reaction", "the rate of reaction"]])
    assert.equal(kind(a, b), "light", `${a} → ${b}`);

  // on the plan (the F8 attack): arrow shorthand added to the van 't Hoff term and approved in full; one arrow flipped
  const c = course(t), CH = "chemical-equilibrium";
  c.edit(CE_MAP, "in terms of the reaction enthalpy [concept", "in terms of the reaction enthalpy (exothermic reaction: T ↑ ⇒ K ↓; endothermic reaction: T ↑ ⇒ K ↑) [concept");
  await c.approveChanged(CH, "Approved: the arrow summary helps.");
  c.edit(CE_MAP, "(exothermic reaction: T ↑ ⇒ K ↓;", "(exothermic reaction: T ↑ ⇒ K ↑;");
  assert.equal(c.kind(CH), "substantive", "the flip is a change of meaning");
  assert.throws(() => c.glance(CH), /only for a light change/, "no glance, review or not");
  // C4-01 (B): after a lookalike "–" was approved, dropping it is not light either
  const d = course(t);
  d.edit(CE_MAP, "of the reaction by ΔG° = −RT ln K. [prereq", "of the reaction by ΔG° = –RT ln K. [prereq");
  assert.equal(d.kind(CH), "substantive");
  await d.approveChanged(CH);
  d.edit(CE_MAP, "of the reaction by ΔG° = –RT ln K. [prereq", "of the reaction by ΔG° = RT ln K. [prereq");
  assert.equal(d.kind(CH), "substantive");
  assert.throws(() => d.glance(CH), /only for a light change/);
});

// ============================================ F1: terms on visible text ============================================
test("[req.coherence.edges-complete] F1: a key term is matched on the text a reader sees — \"**Endothermic** reaction\" is a use; redefining the term makes those units owe", async (t) => {
  const c = course(t), r = c.r(), sp = parseSpine(r, manifestChapters(r));
  const term = sp.chapters["le-chatelier"].map.terms.find((x) => x.label === "endothermic reaction"), uses = termMatcher(term);
  for (const s of ["**Endothermic** reaction", "an *endothermic* __reaction__", "[endothermic](#x) reaction", "**Endothermic**\nreaction"]) assert.ok(uses(s), s);
  const emphasised = c.units().filter((u) => /\*\*Endothermic\*\* reaction/.test(u.text)).map((u) => u.id);
  assert.ok(emphasised.length >= 3, `the fixture writes it emphasised in ${emphasised.length} units`);
  const edges = dependencyEdges(c.units(), sp, sourceHashes(r));
  for (const id of emphasised) assert.ok(edges.get(id).some((e) => e.target === "term:le-chatelier:endothermic reaction"), `${id} depends on the term`);
  // the term redefined and approved in full: the emphasised users owe their re-check like every plain one
  c.edit(LC_MAP, "- **endothermic reaction** — a reaction that absorbs heat (positive reaction enthalpy), so heat behaves as a reactant",
    "- **endothermic reaction** — a reaction that takes in heat from its surroundings at constant pressure (positive reaction enthalpy, $\\Delta H > 0$), so heat is written on the reactant side");
  await c.approveChanged("le-chatelier", "Approved: the fuller definition.");
  const owed = c.reverifyOwed();
  assert.deepEqual(emphasised.filter((id) => !owed.has(id)), [], "every emphasised restatement is found");
});

// ============================================ F2: references without a number ======================================
test("[req.coherence.edges-complete] F2: \"the same reaction\", \"the previous question\", \"this reaction\" are references — Q4 and Answer 4 owe when Q3's reaction changes", async (t) => {
  const c = course(t);
  const Q4 = c.unit(PR, "For the same reaction, ammonia is continuously removed").id, A4 = c.unit(PR, "Toward the products. Decreasing the concentration of a product").id;
  const Q3 = c.unit(PR, "For $\\ce{N2(g) + 3 H2(g) <=> 2 NH3(g)}$ at equilibrium, extra $\\ce{H2}$ is injected.").id;
  const edges = dependencyEdges(c.units(), parseSpine(c.r(), manifestChapters(c.r())), {});
  assert.ok(edges.get(Q4).some((e) => e.target === `ref:${Q3}`), "Q4 names Q3 without a number");
  assert.ok(edges.get(A4).some((e) => e.target === `ref:${Q3}`), "and so does its answer");
  c.asAgent(() => {
    c.edit(PR, "For $\\ce{N2(g) + 3 H2(g) <=> 2 NH3(g)}$ at equilibrium, extra $\\ce{H2}$ is injected.", "For $\\ce{H2(g) + I2(g) <=> 2 HI(g)}$ at equilibrium, extra $\\ce{H2}$ is injected.");
  });
  const owed = c.reverifyOwed();
  assert.ok(owed.has(Q4) && owed.has(A4), "Q 4 and Answer 4 owe a re-check");
  // the re-check of Q4 is shown Q3 as it is now
  let shown = "";
  await verifyKnowledge(c.root, c.r(), { only: [Q4], verifier: replayVerifier((pr) => { shown = pr; return { nonce: nonceOf(pr), concerns: [] }; }) });
  assert.match(shown, /H2\(g\) \+ I2\(g\)/);
});

// ============================================ F3: every branch is an anchor ========================================
test("[req.records.history-extends] F3: HEAD's reflog, every local branch and its reflog are anchors — a forgery committed on a new branch made at an old commit is log-broken; a release receipt's logHead is an anchor too", (t) => {
  const c = course(t), LOG = "private/coursewerk/LOG.jsonl", f = path.join(c.root, LOG);
  // a second honest commit, holding an instructor's answer the first commit does not
  const at = appendLogRecord(c.root, { type: "answer", party: I, payload: { instructorWords: "Accept your recommendations.", answers: [] } }).seq;
  assert.equal(gitIn(c.root, "add", "-A").status, 0); assert.equal(gitIn(c.root, "commit", "-qm", "digest answered").status, 0);
  assert.deepEqual(logFindings(c.root, "t"), [], "an honest history is clean");
  // the forgery: that answer rewritten and the log re-chained, committed on a new branch made at the first commit (whose
  // log is a true prefix of the forgery)
  const recs = fs.readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const k = recs.findIndex((r) => r.seq === at);
  recs[k].payload.instructorWords = "Reject all: none of these changes may ship.";
  let prev = k ? recs[k - 1].hash : "0".repeat(64);
  for (let i = k; i < recs.length; i++) { const r = recs[i]; r.prev = prev; delete r.hash; r.hash = recordHash(r); prev = r.hash; }
  fs.writeFileSync(f, recs.map((r) => JSON.stringify({ seq: r.seq, prev: r.prev, type: r.type, party: r.party, at: r.at, payload: r.payload, hash: r.hash })).join("\n") + "\n");
  const first = gitIn(c.root, "rev-list", "--max-parents=0", "HEAD").stdout.trim();
  gitIn(c.root, "branch", "revision", first); gitIn(c.root, "symbolic-ref", "HEAD", "refs/heads/revision");
  gitIn(c.root, "add", "-A"); gitIn(c.root, "commit", "-qm", "revision");
  const lf = logFindings(c.root, "t");
  assert.equal(lf[0]?.kind, "log-broken", "the side-branch forgery is caught");
  assert.match(lf[0].evidence.failures.join(" "), /HEAD's reflog|the main branch/);
  // with HEAD's reflog gone, the other branch still anchors; with every branch and reflog gone, a release receipt does
  fs.rmSync(path.join(c.root, ".git", "logs", "HEAD"));
  assert.match(logFindings(c.root, "t")[0]?.evidence.failures.join(" ") || "", /main branch/);

  const d = course(t);
  const title = JSON.parse(fs.readFileSync(path.join(d.root, "alembic.json"), "utf8")).title || "course";
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "course";
  const last = parseLog(readLogText(d.root)).at(-1);
  fs.mkdirSync(path.join(d.dir, "dist"));
  fs.writeFileSync(path.join(d.dir, "dist", `${base}.release.json`), JSON.stringify({ logHead: { seq: last.seq, hash: last.hash } }));
  assert.deepEqual(logFindings(d.root, "t"), [], "a log that holds the published record is clean");
  // the history squashed onto a new root with the forged log, every reflog and other ref removed
  const drecs = fs.readFileSync(path.join(d.root, LOG), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const j = drecs.findIndex((r) => r.party?.role === "instructor" && r.payload?.instructorWords);
  drecs[j].payload.instructorWords = "Reject all."; let p2 = j ? drecs[j - 1].hash : "0".repeat(64);
  for (let i = j; i < drecs.length; i++) { const r = drecs[i]; r.prev = p2; delete r.hash; r.hash = recordHash(r); p2 = r.hash; }
  fs.writeFileSync(path.join(d.root, LOG), drecs.map((r) => JSON.stringify({ seq: r.seq, prev: r.prev, type: r.type, party: r.party, at: r.at, payload: r.payload, hash: r.hash })).join("\n") + "\n");
  fs.rmSync(path.join(d.root, ".git"), { recursive: true, force: true });
  gitIn(d.root, "init", "-q", "-b", "main"); gitIn(d.root, "add", "-A"); gitIn(d.root, "commit", "-qm", "squashed");
  const ld = logFindings(d.root, "t");
  assert.equal(ld[0]?.kind, "log-broken");
  assert.match(ld[0].evidence.failures.join(" "), /release\.json was packed/);
});

// ============================================ F4: a re-check is shown what moved ===================================
test("[req.coherence.recheck-shows-moved] F4: a unit owing because a shared value moved is re-checked with the moved unit in its prompt; a review that never saw it does not count", async (t) => {
  const c = course(t);
  const Q7 = c.unit(CE, "For the same reaction ($K = 50$), a second mixture").id;
  c.asAgent(() => c.edit(CE, "For a reaction with $K = 50$, a mixture is found to have $Q_r = 12$.", "For a reaction with $K = 60$, a mixture is found to have $Q_r = 12$."));
  assert.ok(c.reverifyOwed().has(Q7), "Q 7 (K = 50, the same reaction) owes");
  // a review recorded the old way — the unit, its neighbours, nothing that moved — is refused
  const u = c.units().find((x) => x.id === Q7), deps = unitDepsHashes(c.root, c.r()).get(Q7);
  const bundle = knowledgeBundle(u.text, "00000000000000aa", { label: u.label });
  recordDispatch(c.root, { kind: "knowledge", unit: Q7, factHash: "x", contentHash: u.locator.contentHash, bundle, answer: { mode: "replay", raw: JSON.stringify({ nonce: bundle.nonce, concerns: [] }) }, deps });
  assert.throws(() => reverifyUnits(c.root, c.r(), [Q7], AGENT), /was not shown what moved/);
  // the routed re-check carries the moved question, with its new value, and counts
  let shown = "";
  await verifyKnowledge(c.root, c.r(), { only: [Q7], verifier: replayVerifier((pr) => { shown = pr; return { nonce: nonceOf(pr), concerns: [] }; }) });
  assert.match(shown, /WHAT CHANGED SINCE THE PASSAGE WAS LAST CHECKED[\s\S]*K = 60/);
  reverifyUnits(c.root, c.r(), [Q7], AGENT);
  assert.ok(!c.reverifyOwed().has(Q7));
  // a moved key term is shown by its new definition
  const d = course(t);
  const NEW = "- **catalyst** — a substance that lowers the activation energy of the forward and reverse reactions alike, without changing the equilibrium constant or position";
  d.edit(LC_MAP, "- **catalyst** — a substance that speeds up both the forward and reverse reactions equally without changing the equilibrium constant or position", NEW);
  await d.approveChanged("le-chatelier");
  const user = [...d.reverifyOwed()][0];
  let seen = "";
  await verifyKnowledge(d.root, d.r(), { only: [user], verifier: replayVerifier((pr) => { seen = pr; return { nonce: nonceOf(pr), concerns: [] }; }) });
  assert.match(seen, /key term "catalyst"[\s\S]*lowers the activation energy/);
});

// ============================================ F5: the answer binding reads what the student sees ====================
test("[req.coherence.question-binding] F5: an answer's binding reads the visible question with signs kept — a struck condition makes its answer owe; stamps on the old key migrate once", (t) => {
  assert.notEqual(questionWording("mixture held at constant volume. Does"), questionWording("mixture ~~held at constant volume~~. Does"));
  assert.notEqual(questionHash("$\\Delta G = -RT \\ln K$"), questionHash("$\\Delta G = RT \\ln K$"));
  assert.notEqual(questionHash("K ↑"), questionHash("K ↓"));
  assert.equal(questionHash("Which **way** does it shift?"), questionHash("Which way does it  shift"));
  const c = course(t);
  const Q12 = c.unit(PR, "Argon is added to a gas-phase equilibrium mixture").id, A12 = c.unit(PR, "It does not shift. Argon is inert").id;
  c.asAgent(() => c.edit(PR, "Argon is added to a gas-phase equilibrium mixture held at constant volume.", "Argon is added to a gas-phase equilibrium mixture ~~held at constant volume~~."));
  assert.equal(c.unit(PR, "Argon is added").id, Q12);
  const k = c.owed().filter((f) => (f.units || []).includes(A12)).map((f) => f.kind);
  assert.ok(k.includes("reverify") && k.includes("answer-still-correct"), k.join(","));

  // the migration: a stamp on the old key counts only where the text is unchanged under both keys
  assert.equal(legacyQuestionCurrent(legacyQuestionHash("Which way does the equilibrium shift? *(Objective 3)*"), "Which way does the equilibrium shift? *(Objective 3)*"), true);
  for (const q of ["mixture ~~held at constant volume~~. Does", "$\\Delta G = -RT$", "K ↑", "does [](not) shift", "Fe³⁺ forms"]) assert.equal(legacyQuestionCurrent(legacyQuestionHash(q), q), false, q);
  const d = course(t);
  const side = readSidecar(d.root, PR), ans = side.units.filter((u) => u.form === "answer" || /Answer/.test(u.id) || Object.keys(u.stamp || {}).some((x) => x.startsWith("question:")));
  const units = d.units(), byId = new Map(units.map((u) => [u.id, u]));
  const safe = [], unsafe = [];
  for (const u of ans) for (const key of Object.keys(u.stamp || {}).filter((x) => x.startsWith("question:"))) {
    const q = byId.get(key.slice(9)); if (!q) continue;
    u.stamp[key] = legacyQuestionHash(q.text);
    (legacyQuestionCurrent(u.stamp[key], q.text) ? safe : unsafe).push(u.id);
  }
  assert.ok(safe.length && unsafe.length, `${safe.length} safe, ${unsafe.length} unsafe`);
  fs.writeFileSync(path.join(d.root, "private/coursewerk/units", `${PR}.json`), JSON.stringify(side, null, 2) + "\n");
  const owed = d.reverifyOwed();
  assert.deepEqual(safe.filter((id) => owed.has(id)), [], "unchanged under both keys: upgraded, nothing owed");
  assert.deepEqual(unsafe.filter((id) => !owed.has(id)), [], "otherwise: one re-check");
});

// ============================================ F6: term targets namespaced by chapter ================================
test("[req.coherence.edges-complete] F6: a key term defined in two maps is two targets — redefining chapter 1's makes its users owe; a pre-R4 stamp migrates with no work when nothing changed", async (t) => {
  const OLD = "- **catalyst** — a substance that speeds up both the forward and reverse reactions equally without changing the equilibrium constant or position";
  const NEW = "- **catalyst** — a substance that lowers the activation energy of the forward and reverse reactions alike, so equilibrium is reached sooner, without changing the equilibrium constant or position";
  const c = course(t);
  const hashes = targetHashes(c.units(), parseSpine(c.r(), manifestChapters(c.r())), {});
  assert.ok("term:chemical-equilibrium:catalyst" in hashes && "term:le-chatelier:catalyst" in hashes && !("term:catalyst" in hashes));
  const users = c.units().filter((u) => Object.keys(u.stamp || {}).includes("term:chemical-equilibrium:catalyst")).map((u) => u.id);
  assert.ok(users.length > 0);
  c.edit(CE_MAP, OLD, NEW);
  await c.approveChanged("chemical-equilibrium", "Approved: say what a catalyst does to the activation energy.");
  const owed = c.reverifyOwed();
  assert.deepEqual(users.filter((u) => !owed.has(u)), [], "every user of chapter 1's catalyst owes");

  // a stamp written before R4 (`term:catalyst`, chapter 2's hash) reads as both definitions, baselined: no work…
  const d = course(t);
  const rel = d.units().find((u) => users.includes(u.id)).locator.deliverable, f = path.join(d.root, "private/coursewerk/units", `${rel}.json`);
  const side = JSON.parse(fs.readFileSync(f, "utf8")); delete side.stamps;
  const legacy = [];
  for (const u of side.units) if (u.stamp?.["term:le-chatelier:catalyst"]) { const h = u.stamp["term:le-chatelier:catalyst"]; delete u.stamp["term:le-chatelier:catalyst"]; delete u.stamp["term:chemical-equilibrium:catalyst"]; u.stamp["term:catalyst"] = h; legacy.push(u.id); }
  assert.ok(legacy.length);
  fs.writeFileSync(f, JSON.stringify(side, null, 2) + "\n");
  assert.deepEqual(legacy.filter((id) => d.reverifyOwed().has(id)), [], "nothing changed: nothing owed");
  // …and chapter 1's definition changed since the record was written is owed
  d.edit(CE_MAP, OLD, NEW);
  await d.approveChanged("chemical-equilibrium");
  const owedD = d.reverifyOwed();
  assert.deepEqual(legacy.filter((id) => !owedD.has(id)), [], "the legacy stamp's users of chapter 1's definition owe");
});

// ============================================ F7: no clearing without evidence =====================================
test("[req.coherence.record-writes-checked] F7: writeUnitRecords refuses a write that clears an obligation without its evidence; reverify and confirm still clear; admitEvidence binds the dispatch to the unit", async (t) => {
  const c = course(t);
  c.asAgent(() => c.edit(PR, "is exothermic. The temperature is raised. Which way", "is exothermic. The temperature is lowered. Which way"));
  assert.ok(c.reverifyOwed().has(A6));
  const fresh = () => { const r = c.r(), units = loadUnits(c.root, r), sp = parseSpine(r, manifestChapters(r)); return stampFor(A6, dependencyEdges(units, sp, sourceHashes(r)), targetHashes(units, sp, sourceHashes(r))); };
  // the stale stamp refreshed, `owes` dropped: refused
  const side = readSidecar(c.root, PR), u = side.units.find((x) => x.id === A6);
  u.stamp = fresh(); delete u.owes;
  assert.throws(() => writeUnitRecords(c.root, [{ ...side, deliverable: PR }]), /clear what it owes/);
  // the record dropped: refused
  const side2 = readSidecar(c.root, PR);
  assert.throws(() => writeUnitRecords(c.root, [{ ...side2, units: side2.units.filter((x) => x.id !== A6), deliverable: PR }]), /would be dropped/);
  assert.ok(c.reverifyOwed().has(A6), "still owed");
  assert.deepEqual(alteredSidecars(c.root), []);
  // the answer reworded by the agent: the restamp keeps what it owed in `owes`; dropping that entry is refused
  c.asAgent(() => c.edit(PR, "Toward the reactants, to the left.", "Toward the reactants (to the left)."));
  const side3 = readSidecar(c.root, PR), u3 = side3.units.find((x) => x.id === A6);
  assert.ok(u3.owes?.targets.length, "the restamp recorded what was owed");
  delete u3.owes;
  assert.throws(() => writeUnitRecords(c.root, [{ ...side3, deliverable: PR }]), /clear what it owes/);
  // the evidence paths still clear: the routed blind re-check, then reverify
  await verifyKnowledge(c.root, c.r(), { only: [A6], verifier: clean() });
  reverifyUnits(c.root, c.r(), [A6], AGENT);
  assert.ok(!c.reverifyOwed().has(A6));
  // and the instructor's confirmation
  const d = course(t);
  d.asAgent(() => d.edit(PR, "is exothermic. The temperature is raised. Which way", "is exothermic. The temperature is lowered. Which way"));
  confirmUnits(d.root, d.r(), [A6], { what: "still-correct", instructorWords: "Still right." }, I);
  assert.ok(!d.reverifyOwed().has(A6));
  // admitEvidence: a logged fact check of ANOTHER unit is no evidence for this one
  const other = parseLog(readLogText(d.root)).find((r) => r.type === "dispatch" && r.payload?.kind === "semi" && r.payload.unit !== A6);
  if (other) assert.throws(() => admitEvidence(d.root, d.r(), A6, { type: "quote-verified", factHash: "x", dispatch: other.payload.dispatch }), /fact check of this unit|other facts|evidence/);
});
