#!/usr/bin/env node
// Spine v2 tools (redesign P3; F3). The agent runs these; approval records are the instructor's words.
//   node scripts/spine.mjs check    --root <pkg>                      well-formedness (exit 1 if any problem)
//   node scripts/spine.mjs migrate  --root <pkg> --name <instructor> --words "…"   v0.12 → v2: anchors, references, guide grammar;
//                                                                     a committed tree only; every chapter left ASSEMBLING for approval
//   node scripts/spine.mjs anchor   --root <pkg>                      mint missing anchors in place
//   node scripts/spine.mjs propose  --root <pkg> --doc <spine file> --anchors <a,…> --model <id>   mark items you added as your proposal
//   node scripts/spine.mjs critique --root <pkg> --chapter <slug> --note "…" [--kind …] [--ids …] [--recommend "…"] --model <id>
//                                                                     a question for the approval view (never blocking)
//   node scripts/spine.mjs status   --root <pkg>                      approval status of every scope
//   node scripts/spine.mjs review   --root <pkg> (--chapter <slug> | --course)   blind review of the lines changed since the last approval (D39)
//   node scripts/spine.mjs preview  --root <pkg> --chapter <slug>     the approval view
//   node scripts/spine.mjs approve  --root <pkg> (--chapter <slug> | --course) --name <instructor> --words "<what they said>" [--glance] [--without-review]
//   node scripts/spine.mjs version  --root <pkg> --scopes chapter:<slug>[,…] --reason "<why>" --name <instructor> --words "<their words>"   (carries the chapter's units: each owes re-verification)
//   node scripts/spine.mjs steering --root <pkg> --defaults <file.json> [--answers <file.json>] [--accept-all] --name <instructor> --words "…"
import fs from "node:fs";
import path from "node:path";
import { liveReader, manifestChapters } from "./lib/core/package_reader.mjs";
import { checkSpine, parseSpine, spinePaths, COURSE_MAP } from "./lib/core/spine.mjs";
import { anchorMap, rewriteRefs, migrateGuide } from "./lib/core/migrate.mjs";
import { approvalStatus, recordApproval } from "./lib/core/approvals.mjs";
import { approvalPreview, originsPath } from "./lib/core/preview.mjs";
import { openVersionCarrying } from "./lib/core/obligations.mjs";
import { spineCritique } from "./lib/core/critique.mjs";
import { approvalPrecondition, changedSpineLines, currentSpineReview, reviewSpineChanges } from "./lib/core/spine_review.mjs";
import { headlessVerifier } from "./lib/verify/dispatch.mjs";
import { recordSteering } from "./lib/core/steering_intake.mjs";
import { boundConfig, readConfig, writeConfig } from "./lib/records/config.mjs";
import { appendLogRecord, readLogText } from "./lib/records/log.mjs";
import { spawnSync } from "node:child_process";

const [cmd, ...args] = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const flag = (n) => args.includes(n);
const fail = (msg, code = 2) => { console.error(msg); process.exit(code); };
const root = opt("--root");
if (!cmd || !root || !fs.existsSync(root)) fail("usage: spine.mjs <check|migrate|anchor|propose|critique|status|preview|approve|version|steering> --root <package> … (see the header of scripts/spine.mjs)");
const reader = liveReader(root);
const chapters = manifestChapters(reader);
if (!chapters.length) fail("the package has no chapters in alembic.json");
const instructor = () => { const name = opt("--name"); if (!name) fail("--name <instructor> is required: this records the instructor's decision"); return { role: "instructor", name }; };
const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };

try {
  if (cmd === "check") {
    const problems = checkSpine(parseSpine(reader, chapters), chapters);
    console.log(JSON.stringify({ problems: problems.length, byRule: problems.reduce((a, p) => ((a[p.rule] = (a[p.rule] || 0) + 1), a), {}), details: problems }, null, 2));
    process.exit(problems.length ? 1 : 0);
  }
  if (cmd === "migrate" || cmd === "anchor") {
    // a migration is presented as a revision for approval, never converted silently (req.docs.migration): it is the
    // instructor's request, runs on a committed tree (so the conversion is one reviewable diff), is logged, and
    // leaves every chapter ASSEMBLING with no approval — nothing publishes until the instructor approves the result
    let party = null, words = null;
    if (cmd === "migrate") {
      if (boundConfig(root).spine === 2) fail("this package is already spine v2 (the decision log shows it; if metadata/coursewerk.json says otherwise, restore it: git checkout -- metadata/coursewerk.json)");
      party = instructor(); words = opt("--words");
      if (!String(words || "").trim()) fail('--words "<the instructor\'s own words>" is required: a migration is the instructor\'s request');
      const st = spawnSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8", maxBuffer: 1 << 30 });
      if (st.status !== 0) fail("the package must be a git repository, so the migration is one reviewable diff");
      if (st.stdout.trim()) fail("commit or set aside the package's changes first: the migration must be its own reviewable diff");
    }
    const renames = {}, notes = [], docs = {};
    const course = anchorMap(reader.text(COURSE_MAP) || "", "course"); Object.assign(renames, course.renames); docs[COURSE_MAP] = course.text;
    const objectiveAnchors = {};
    for (const ch of chapters) {
      const { map } = spinePaths(ch);
      const r = anchorMap(reader.text(map) || "", ch); Object.assign(renames, r.renames); docs[map] = r.text;
      objectiveAnchors[ch] = Object.entries(r.renames).filter(([k]) => k.startsWith(`objective.${ch}.`)).sort((a, b) => Number(a[0].split(".").pop()) - Number(b[0].split(".").pop())).map(([, v]) => v.split(".").pop());
    }
    for (const rel of Object.keys(docs)) { const r = rewriteRefs(docs[rel], renames); docs[rel] = r.text; notes.push(...r.notes.map((n) => `${rel}: ${n}`)); }
    if (cmd === "migrate") for (const ch of chapters) { const { guide } = spinePaths(ch); const g = reader.text(guide); if (g !== null && !/\[objective:/.test(g)) docs[guide] = migrateGuide(g, objectiveAnchors[ch]); }
    for (const [rel, text] of Object.entries(docs)) write(rel, text);
    if (cmd === "migrate") {
      writeConfig(root, { ...readConfig(root), schemaVersion: 1, spine: 2 });
      // migrated content pre-existed: every item is marked "standardized" until the instructor says otherwise
      const fresh = liveReader(root), spine = parseSpine(fresh, chapters);
      const mark = (doc, anchors) => write(originsPath(doc), JSON.stringify({ schemaVersion: 1, items: Object.fromEntries(anchors.map((a) => [a, "standardized"])) }, null, 2) + "\n");
      mark(COURSE_MAP, spine.course.nodes.map((n) => n.anchor).filter(Boolean));
      for (const ch of chapters) { const { map, guide } = spinePaths(ch); mark(map, spine.chapters[ch].map.nodes.map((n) => n.anchor).filter(Boolean)); mark(guide, spine.chapters[ch].guide.entries.map((e) => e.anchor).filter(Boolean)); }
      // what the conversion could not carry exactly (an uncertain prerequisite made firm, guide fields to fill) is
      // recorded with the migration and must be shown to the instructor at approval (P9 scenario)
      const todo = Object.entries(docs).filter(([rel, t]) => rel.startsWith("assessment-support/") && /\*\*(?:Type|Count):\*\* TODO/.test(t)).map(([rel]) => `${rel}: question-guide Type and Count to propose`);
      appendLogRecord(root, { type: "intake", party, payload: { event: "migrated-from-v0.12", files: Object.keys(docs), renamed: Object.keys(renames).length, notes: [...notes, ...todo], instructorWords: words } });
      for (const ch of chapters) appendLogRecord(root, { type: "transition", party, payload: { chapter: ch, from: "DRAFT", to: "ASSEMBLING", instructorWords: words, migration: true } });
    }
    const left = checkSpine(parseSpine(liveReader(root), chapters), chapters);
    console.log(JSON.stringify({ rewritten: Object.keys(docs), renamed: Object.keys(renames).length, notes, remainingProblems: left.length, byRule: left.reduce((a, p) => ((a[p.rule] = (a[p.rule] || 0) + 1), a), {}),
      ...(cmd === "migrate" ? { next: "every chapter is ASSEMBLING: bring the instructor `git diff`, `spine.mjs preview --chapter <slug>` and every note above (M3) — an uncertain prerequisite was made firm and must be confirmed or removed — then approve each chapter and the course map" } : {}) }, null, 2));
    process.exit(0);
  }
  if (cmd === "propose") {
    // the agent marks a spine item it added as its proposal; the approval view shows it as such (format contract)
    const model = opt("--model") || fail("--model <model id> is required: a proposal is the agent's");
    const doc = opt("--doc") || fail("--doc <concepts/<slug>.md | assessment-support/<slug>.md> is required");
    const anchors = String(opt("--anchors") || "").split(",").filter(Boolean);
    if (!anchors.length) fail("--anchors <a,b,…> is required");
    const all = new Set([...parseSpine(reader, chapters).course.nodes, ...Object.values(parseSpine(reader, chapters).chapters).flatMap((c) => [...c.map.nodes, ...c.guide.entries])].map((n) => n.anchor).filter(Boolean));
    const missing = anchors.filter((a) => !all.has(a)); if (missing.length) fail(`no spine item with anchor ${missing.join(", ")}`);
    let o = { schemaVersion: 1, items: {} }; try { o = JSON.parse(fs.readFileSync(path.join(root, originsPath(doc)), "utf8")); } catch { /* new */ }
    for (const a of anchors) o.items[a] = "proposed";
    write(originsPath(doc), JSON.stringify(o, null, 2) + "\n");
    appendLogRecord(root, { type: "revision", party: { role: "agent", name: "executor", model }, payload: { event: "spine-proposed", doc, anchors } });
    console.log(JSON.stringify({ proposed: anchors, doc }, null, 2)); process.exit(0);
  }
  if (cmd === "critique") {
    // the agent's critique of a chapter's spine: questions for the approval view (M3), never blocking
    const model = opt("--model") || fail("--model <model id> is required: a critique is the agent's");
    const chapter = opt("--chapter"); if (!chapters.includes(chapter)) fail(`--chapter must be one of ${chapters.join(", ")}`);
    const q = spineCritique({ kind: opt("--kind") || "other", ids: String(opt("--ids") || "").split(",").filter(Boolean), note: opt("--note"), recommendation: opt("--recommend") || null, basis: chapter });
    const rel = `metadata/spine/critique/${chapter}.json`;
    let list = []; try { list = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); } catch { list = []; }
    if (!list.some((x) => x.id === q.id)) list.push(q);
    write(rel, JSON.stringify(list, null, 2) + "\n");
    appendLogRecord(root, { type: "revision", party: { role: "agent", name: "executor", model }, payload: { event: "spine-critique", chapter, kind: q.kind, finding: q.id } });
    console.log(JSON.stringify({ critique: q.id, questions: list.length }, null, 2)); process.exit(0);
  }
  if (cmd === "status") {
    const st = approvalStatus(reader, chapters, readLogText(root));
    console.log(JSON.stringify(Object.fromEntries(Object.entries(st.scopes).map(([k, s]) => [k, { valid: s.valid, change: s.change?.kind || null, reasons: (s.change?.reasons || []).map((r) => r.why) }])), null, 2));
    process.exit(0);
  }
  if (cmd === "review") {
    // D39: a blind review of the lines changed since the last approval; its concerns are questions shown at re-approval
    const scope = flag("--course") ? "course" : `chapter:${opt("--chapter")}`;
    if (scope !== "course" && !chapters.includes(opt("--chapter"))) fail(`--chapter must be one of ${chapters.join(", ")} (or --course)`);
    const r = await reviewSpineChanges(root, reader, scope, { verifier: headlessVerifier() });
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  }
  if (cmd === "preview") {
    const chapter = opt("--chapter"); if (!chapters.includes(chapter)) fail(`--chapter must be one of ${chapters.join(", ")}`);
    let critique = []; try { critique = JSON.parse(fs.readFileSync(path.join(root, `metadata/spine/critique/${chapter}.json`), "utf8")); } catch { critique = []; }
    // the blind review of the changed lines (D39): its concerns join the questions, a clarification as a one-line diff
    for (const c of currentSpineReview(root, reader, `chapter:${chapter}`)?.concerns || [])
      critique.push({ kind: "blind-review", evidence: { note: c.kind === "clarify" ? `Clarify (line ${c.lineNo}): "${c.text}" → "${c.suggestion}". ${c.problem}` : `Possibly wrong (line ${c.lineNo}): "${c.text}". ${c.problem}${c.suggestion ? ` Suggested: "${c.suggestion}".` : ""}` } });
    console.log(approvalPreview(reader, parseSpine(reader, chapters), chapter, { critique }).text);
    process.exit(0);
  }
  if (cmd === "approve") {
    const chapter = flag("--course") ? null : opt("--chapter");
    if (!flag("--course") && !chapters.includes(chapter)) fail(`--chapter must be one of ${chapters.join(", ")} (or --course)`);
    // one precondition for every approval command (D39; redteam r1 C4-13): a well-formed spine, and the blind review
    // of the changed lines before a re-approval (offline, the agent says so: --without-review, which is recorded)
    const pre = approvalPrecondition(root, reader, chapters, { chapter, withoutReview: flag("--without-review"), note: opt("--note") || "" });
    if (pre.problem) fail(`${pre.problem}: ${pre.hint}`, 1);
    const r = recordApproval(root, reader, chapters, { chapter, glance: flag("--glance"), instructorWords: opt("--words"), note: pre.note }, instructor());
    console.log(JSON.stringify({ recorded: r.type, seq: r.seq, scope: r.payload.scope, version: r.payload.version }, null, 2));
    process.exit(0);
  }
  if (cmd === "version") {
    const scopes = String(opt("--scopes") || "").split(",").filter(Boolean);
    const r = openVersionCarrying(root, liveReader(root), { scopes, reason: opt("--reason"), instructorWords: opt("--words") }, instructor());
    console.log(JSON.stringify({ recorded: r.type, seq: r.seq, from: r.payload.from, to: r.payload.to, carried: r.payload.carried.length }, null, 2));
    process.exit(0);
  }
  if (cmd === "steering") {
    const defaults = JSON.parse(fs.readFileSync(opt("--defaults") || fail("--defaults <file.json> is required"), "utf8"));
    const answers = opt("--answers") ? JSON.parse(fs.readFileSync(opt("--answers"), "utf8")) : {};
    const s = recordSteering(root, { defaults, answers, acceptAll: flag("--accept-all"), instructorWords: opt("--words") }, instructor());
    console.log(JSON.stringify({ recorded: "steering", answers: s.answers }, null, 2));
    process.exit(0);
  }
  fail(`unknown command ${cmd}`);
} catch (e) { fail(e.message, 1); }
