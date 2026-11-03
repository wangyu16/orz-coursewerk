#!/usr/bin/env node
// The Coursewerk commands (redesign P8; skeleton §2–§4, §7). Each refuses with a plain next step when its
// preconditions fail (req.commands). Instructor acts quote the instructor's words; the agent never runs them on the
// instructor's behalf without those words.
//   node scripts/coursewerk.mjs status   --root <pkg> [--inputs <dir>]                        states, approvals, what blocks
//   node scripts/coursewerk.mjs assemble --root <pkg> --chapter <slug> --name <instructor> --words "<their words>"
//   node scripts/coursewerk.mjs back-to-draft --root <pkg> --chapter <slug> --name <instructor> --words "…"
//   node scripts/coursewerk.mjs approve  --root <pkg> (--chapter <slug> | --course) [--glance] [--without-review] --name <instructor> --words "…"
//   node scripts/coursewerk.mjs digest   --root <pkg> [--inputs <dir>] [--deliver --model <id>]               M4 (size: the instructor's digest-cap, default 10)
//   node scripts/coursewerk.mjs digest-cap --root <pkg> --set <n> --name <instructor> --words "…"
//   node scripts/coursewerk.mjs recommend --root <pkg> --entry <n> --text "<what you recommend>" --model <id>   your recommendation, before M4
//   node scripts/coursewerk.mjs answer   --root <pkg> (--entry <n> --choice "<choice>" | --accept-all | --overrule-link <unit>:<node>[,…]) --name <instructor> --words "…"
//   node scripts/coursewerk.mjs publish  --root <pkg> [--inputs <dir>] [--chapters a,b] [--include-drafts] --name <instructor> --words "…"   M6
//   node scripts/coursewerk.mjs revert   --root <pkg> --correction <id> --name <instructor> --note "<why the text stands>"
//   node scripts/coursewerk.mjs history  --root <pkg> [--out <file.md>]   how every issue was found and settled, from the records
//   node scripts/coursewerk.mjs administrative --root <pkg> --document <source> --name <instructor> --words "…"   the instructor confirms a
//                                                                     document declared role: administrative (D42: only format and rights checks)
//   node scripts/coursewerk.mjs interrupt --root <pkg> --reason <reason> --question "…" --model <id>                M5
//   node scripts/coursewerk.mjs carry-over-baseline --from <baseline package> --out <file> [--label <label>]   the baseline
//                                    record of a package developed under an earlier Coursewerk (a harness tool, no act)
//   node scripts/coursewerk.mjs carry-over --root <pkg> --baseline private/coursewerk/carry-over/<label>.json --name <instructor> --words "…"
//                                    the instructor records once that the package was developed, approved and checked
//                                    under the earlier Coursewerk: unchanged plans approved, unchanged units carried over
// Interrupt reasons (D14): spine-scope-conflict, missing-input, rights-blocker, spine-change-request.
import fs from "node:fs";
import { liveReader, manifestChapters } from "./lib/core/package_reader.mjs";
import { glanceProblem, recordApproval, approvalStatus } from "./lib/core/approvals.mjs";
import { approvalPrecondition } from "./lib/core/spine_review.mjs";
import { chapterStates, eligibility, latestPublish, publishDecision, transition, transitionProblems, unitInfoOf } from "./lib/core/workflow.mjs";
import { answerDigest, buildDigest, deliverDigest, recommendDigest, DEFAULT_CAP } from "./lib/core/digest.mjs";
import { runGate } from "./lib/skeleton/full_gate.mjs";
import { issueHistory, historyMarkdown } from "./lib/core/history.mjs";
import { confirmAdministrative, deliverablesOf, readSidecar } from "./lib/core/units_index.mjs";
import { correctionsToShow, revertCorrection } from "./lib/verify/verdicts.mjs";
import { boundConfig, loggedDigestCap, readConfig, writeConfig } from "./lib/records/config.mjs";
import { appendLogRecord, readLogText } from "./lib/records/log.mjs";
import { recordFile } from "./lib/records/paths.mjs";
import { buildBaseline, carryOver, writeBaseline, CARRIED_LABEL } from "./lib/core/carry_over.mjs";

export const INTERRUPT_REASONS = Object.freeze(["spine-scope-conflict", "missing-input", "rights-blocker", "spine-change-request"]);
const [cmd, ...args] = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const flag = (n) => args.includes(n);
const refuse = (m, next) => { console.error(`${cmd}: ${m}${next ? `\nnext: ${next}` : ""}`); process.exit(1); };
const out = (x) => console.log(JSON.stringify(x, null, 2));
const root = opt("--root");
if (cmd === "carry-over-baseline") {
  // a harness tool, before any package is open: it reads the baseline delivery and writes its record
  const from = opt("--from"), outFile = opt("--out");
  if (!from || !outFile) { console.error("usage: coursewerk.mjs carry-over-baseline --from <baseline package> --out <file> [--label <label>]"); process.exit(2); }
  try {
    const b = buildBaseline(from, { label: opt("--label") || null }), w = writeBaseline(b, outFile);
    out({ baseline: b.baseline, plans: Object.keys(b.plans).length, units: Object.keys(b.units).length, file: w.file, bytes: w.bytes,
      next: "place it in the package under private/coursewerk/carry-over/, then the instructor's act: coursewerk.mjs carry-over --root <pkg> --baseline <that path> --name … --words \"…\"" });
    process.exit(0);
  } catch (e) { refuse(e.message); }
}
const USAGE = "usage: coursewerk.mjs <status|assemble|back-to-draft|approve|digest|digest-cap|recommend|answer|publish|revert|history|interrupt|administrative|carry-over|carry-over-baseline> --root <package> … (see the header of scripts/coursewerk.mjs)";
if (!cmd || !root || !fs.existsSync(root)) { console.error(USAGE); process.exit(2); }
try {
  // the spine setting is bound to the log (red-team round 5, F2): a v2 package whose file says otherwise is not a v0.12
  // package — the setting was lowered, and is restored, never migrated again
  const b = boundConfig(root);
  if (b.problems.length) refuse(b.problems[0], "restore it: git checkout -- private/coursewerk/coursewerk.json");
  if (b.spine !== 2) refuse("this is a v0.12 package (no `\"spine\": 2` in private/coursewerk/coursewerk.json)", "migrate the spine first: node scripts/spine.mjs migrate --root <pkg>");
}
catch (e) { refuse(e.message); }
const reader = liveReader(root);
const instructor = () => {
  const name = opt("--name"), words = opt("--words");
  if (!name) refuse("this is the instructor's act and needs their name", '--name "<instructor>"');
  if (!words || !words.trim()) refuse("this is the instructor's act and quotes their words", '--words "<what the instructor said>"');
  return { party: { role: "instructor", name }, words };
};
const DIGEST_FILE = "private/coursewerk/digest/current.json";

try {
  if (cmd === "status") {
    const states = chapterStates(root, reader);
    const g = runGate(root, { inputsDir: opt("--inputs") || null });
    const info = unitInfoOf(root, reader);
    const el = eligibility(root, reader, g, new Map([...info].map(([k, v]) => [k, v.deliverable])));
    const pub = latestPublish(root);
    out({ chapters: Object.fromEntries(Object.entries(states).map(([c, s]) => [c, { ...s, publishable: el.chapters[c].publishable, why: el.chapters[c].why }])),
      course: el.course, blocking: g.gate.blocking.length, questions: g.gate.questions.length, corrections: correctionsToShow(root).length,
      lastPublish: pub ? { seq: pub.seq, chapters: pub.chapters.map((c) => c.chapter), stillCurrent: pub.current } : null,
      ...(g.carriedOver?.labels.length ? { carriedOver: { label: CARRIED_LABEL, baselines: g.carriedOver.labels, units: g.carriedOver.units, plans: g.carriedOver.plans, notes: g.carriedOver.notes } } : {}) });
    process.exit(0);
  }
  if (cmd === "assemble" || cmd === "back-to-draft") {
    const ch = opt("--chapter") || refuse("which chapter?", "--chapter <slug>");
    const to = cmd === "assemble" ? "ASSEMBLING" : "DRAFT";
    const p = transitionProblems(root, reader, ch, to);
    if (p.length) refuse(p.join("; "));
    const { party, words } = instructor();
    const r = transition(root, reader, { chapter: ch, to, instructorWords: words }, party);
    out({ chapter: ch, state: to, logged: r.seq }); process.exit(0);
  }
  if (cmd === "approve") {
    const chapters = manifestChapters(reader);
    const ch = opt("--chapter") || null;
    if (!ch && !flag("--course")) refuse("approve what?", "--chapter <slug> for a chapter's concept map and assessment guide, or --course for the course map");
    if (ch) {
      const s = chapterStates(root, reader)[ch];
      if (!s) refuse(`${ch} is not a chapter of this package`);
      if (s.state === "DRAFT") refuse(`${ch} is a draft; a draft is approved only after it is assembled`, `node scripts/coursewerk.mjs assemble --root <pkg> --chapter ${ch} …`);
    }
    const st = approvalStatus(reader, chapters, readLogText(root)).scopes[ch || "course"];
    if (st?.valid) refuse(`${ch || "the course map"} is already approved at its current content`);
    if (flag("--glance")) { const p = glanceProblem(root, reader, st, ch ? `chapter:${ch}` : "course"); if (p) refuse(p, "approve without --glance, after reviewing the diff: node scripts/spine.mjs preview"); }
    // the same precondition as `spine.mjs approve` (D39; redteam r1 C4-13): well-formed, and the changed lines reviewed
    const pre = approvalPrecondition(root, reader, chapters, { chapter: ch, withoutReview: flag("--without-review"), note: opt("--note") || "" });
    if (pre.problem) refuse(pre.problem, pre.hint);
    const { party, words } = instructor();
    const r = recordApproval(root, reader, chapters, { chapter: ch, glance: flag("--glance"), instructorWords: words, note: pre.note }, party);
    out({ approved: ch || "course", logged: r.seq, state: ch ? chapterStates(root, reader)[ch].state : undefined }); process.exit(0);
  }
  if (cmd === "administrative") {
    // D42 (red team round 2, C3-06): `role: administrative` exempts a document only by the instructor's own act
    const doc = opt("--document"); if (!doc) refuse("name the document", "--document <its source path in private/coursewerk/DOCUMENTS.json>");
    const { party, words } = instructor();
    const r = confirmAdministrative(root, reader, { source: doc, instructorWords: words }, party);
    out({ administrative: doc, logged: r.seq }); process.exit(0);
  }
  if (cmd === "history") {
    // how every issue was found and settled, rebuilt from the package's own records
    const units = new Map([...unitInfoOf(root, reader)].map(([id, v]) => [id, v]));
    for (const rel of deliverablesOf(reader)) for (const u of readSidecar(root, rel)?.units || []) units.set(u.id, { contentHash: u.locator.contentHash, origin: u.origin, evidence: u.evidence });
    const h = issueHistory(root, units), md = historyMarkdown(h);
    if (opt("--out")) fs.writeFileSync(opt("--out"), md);
    console.log(opt("--out") ? JSON.stringify({ issues: h.issues.length, byFinder: h.counts, out: opt("--out") }, null, 2) : md);
    process.exit(0);
  }
  if (cmd === "digest-cap") {
    // the digest's size protects the instructor's attention: it is theirs to set, not the agent's (P10 scenario)
    const n = Number(opt("--set"));
    if (!Number.isInteger(n) || n < 1 || n > 50) refuse("how many questions per digest?", "--set <1–50>");
    const { party, words } = instructor();
    writeConfig(root, { ...readConfig(root), digestCap: n });
    const r = appendLogRecord(root, { type: "steering", party, payload: { event: "digest-cap", cap: n, instructorWords: words } });
    out({ digestCap: n, logged: r.seq }); process.exit(0);
  }
  if (cmd === "digest") {
    if (args.includes("--cap")) refuse("the digest's size is the instructor's setting, not a flag", 'the instructor sets it: node scripts/coursewerk.mjs digest-cap --set <n> --name … --words "…"');
    const g = runGate(root, { inputsDir: opt("--inputs") || null });
    const info = unitInfoOf(root, reader);
    const d = buildDigest(root, g.findings, info, { cap: Number(loggedDigestCap(readLogText(root)) || DEFAULT_CAP), /* the instructor's logged setting, never the file's (R5) */ corrections: correctionsToShow(root) });
    // the agent's own recommendations, attached before delivery, carry over to the same entries
    let prev = null; try { prev = JSON.parse(fs.readFileSync(recordFile(root, DIGEST_FILE), "utf8")); } catch { prev = null; }
    for (const e of d.entries) { const p = prev?.entries?.find((x) => x.key === e.key && String(x.recommendedBy || "").startsWith("agent")); if (p) { e.recommendation = p.recommendation; e.recommendedBy = p.recommendedBy; } }
    fs.mkdirSync(recordFile(root, "private/coursewerk/digest"), { recursive: true });
    fs.writeFileSync(recordFile(root, DIGEST_FILE), JSON.stringify({ at: new Date().toISOString(), ...d }, null, 2) + "\n");
    if (flag("--deliver")) {
      const model = opt("--model") || refuse("a delivered digest names the agent that brings it", "--model <model id>");
      deliverDigest(root, d, { role: "agent", name: "executor", model });
      correctionsToShow(root, { mark: true });
    }
    out({ entries: d.entries.map((e, i) => ({ n: i + 1, kind: e.kind, count: e.count, chapters: e.chapters, question: e.question, recommendation: e.recommendation, recommendedBy: e.recommendedBy, deferredBefore: e.deferredBefore })),
      deferred: d.deferred.count, interrupts: d.interrupts.length, corrections: d.corrections.map((c) => ({ id: c.id, diff: c.diff })), progress: d.progress, delivered: flag("--deliver"),
      ...(g.carriedOver?.labels.length ? { carriedOver: { label: CARRIED_LABEL, units: g.carriedOver.units, plans: g.carriedOver.plans, notes: g.carriedOver.notes } } : {}) });
    process.exit(0);
  }
  if (cmd === "answer") {
    let d; try { d = JSON.parse(fs.readFileSync(recordFile(root, DIGEST_FILE), "utf8")); } catch { refuse("there is no digest to answer", "node scripts/coursewerk.mjs digest --root <pkg> --deliver --model <id>"); }
    const answers = {};
    // D49: --overrule-link <unit>:<node>[,<unit>:<node>…] — the instructor overrules a link review's "no" or "passing"
    const overrules = (opt("--overrule-link") || "").split(",").filter(Boolean).map((x) => { const k = x.indexOf(":"); if (k < 1) refuse("an overrule names a unit and a link", "--overrule-link <unit id>:<node id>"); return { unit: x.slice(0, k), links: [x.slice(k + 1)] }; });
    if (!flag("--accept-all") && !(overrules.length && opt("--entry") == null)) {
      const n = Number(opt("--entry")), choice = opt("--choice");
      if (!Number.isInteger(n) || !d.entries[n - 1] || !choice) refuse("which entry, and which choice?", `--entry <1…${d.entries.length}> --choice "<choice>", or --accept-all, or --overrule-link <unit>:<node>`);
      answers[d.entries[n - 1].key] = choice;
    }
    const { party, words } = instructor();
    const r = answerDigest(root, d, { answers, acceptAll: flag("--accept-all"), instructorWords: words, reader, overrules }, party);
    out({ recorded: r.length }); process.exit(0);
  }
  if (cmd === "recommend") {
    let d; try { d = JSON.parse(fs.readFileSync(recordFile(root, DIGEST_FILE), "utf8")); } catch { refuse("there is no digest yet", "node scripts/coursewerk.mjs digest --root <pkg>"); }
    const model = opt("--model") || refuse("a recommendation names the agent that makes it", "--model <model id>");
    const e = recommendDigest(d, Number(opt("--entry")), opt("--text"), { role: "agent", name: "executor", model });
    fs.writeFileSync(recordFile(root, DIGEST_FILE), JSON.stringify(d, null, 2) + "\n");
    out({ entry: Number(opt("--entry")), recommendation: e.recommendation, recommendedBy: e.recommendedBy }); process.exit(0);
  }
  if (cmd === "publish") {
    const g = runGate(root, { inputsDir: opt("--inputs") || null });
    const info = unitInfoOf(root, reader);
    const { party, words } = instructor();
    let r;
    try { r = publishDecision(root, reader, { gateResult: g, unitInfo: info, instructorWords: words, chapters: opt("--chapters")?.split(",").filter(Boolean) || null, includeDrafts: flag("--include-drafts"), overQuestions: flag("--over-open-questions"), withoutReview: flag("--without-review") }, party); }
    catch (e) {
      if (!e.openQuestions) throw e;
      // questions never block (D14), but they are raised before publishing; the instructor may still insist
      console.error(JSON.stringify({ openQuestions: e.openQuestions.map((q) => ({ kind: q.kind, units: q.units, question: q.question })) }, null, 2));
      refuse(e.message, "raise these with the instructor (or bring a digest). If they still want to publish, re-run with --over-open-questions and their words");
    }
    out({ published: r.chapters.map((c) => c.chapter), course: !!r.course, excluded: r.excluded, drafts: r.drafts, openQuestions: r.openQuestions.length, contentHash: r.contentHash, logged: r.seq,
      next: "to hand the package to Alembic: node scripts/pack.mjs --package <pkg> --out <dir> (it packs exactly this decision)" });
    process.exit(0);
  }
  if (cmd === "revert") {
    const id = opt("--correction") || refuse("which correction?", "node scripts/coursewerk.mjs digest --root <pkg> lists them with their ids");
    const name = opt("--name") || refuse("a revert is the instructor's decision", '--name "<instructor>"');
    const r = revertCorrection(root, reader, id, { note: opt("--note") }, { role: "instructor", name });
    out(r); process.exit(0);
  }
  if (cmd === "carry-over") {
    const baseline = opt("--baseline") || refuse("which baseline record?", "--baseline private/coursewerk/carry-over/<label>.json (written by carry-over-baseline)");
    const { party, words } = instructor();
    const r = carryOver(root, reader, { baseline, instructorWords: words }, party);
    out({ carriedOver: r.label, means: CARRIED_LABEL, logged: r.record, units: r.units, plans: r.plans }); process.exit(0);
  }
  if (cmd === "interrupt") {
    const reason = opt("--reason");
    if (!INTERRUPT_REASONS.includes(reason)) refuse(`an interrupt is allowed only for ${INTERRUPT_REASONS.join(", ")}; anything else waits for the next digest (M4)`);
    const question = opt("--question") || refuse("say what only the instructor can decide", '--question "…"');
    const model = opt("--model") || refuse("an interrupt names the agent", "--model <model id>");
    const r = appendLogRecord(root, { type: "contact", party: { role: "agent", name: "executor", model }, payload: { moment: "M5", reason, question } });
    out({ interrupt: reason, logged: r.seq }); process.exit(0);
  }
  console.error(USAGE); process.exit(2);
} catch (e) { refuse(e.message); }
