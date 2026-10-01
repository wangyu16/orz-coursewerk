#!/usr/bin/env node
// Spine v2 tools (redesign P3; F3). The agent runs these; approval records are the instructor's words.
//   node scripts/spine.mjs check    --root <pkg>                      well-formedness (exit 1 if any problem)
//   node scripts/spine.mjs migrate  --root <pkg> --name <instructor> --words "…"   v0.12 → v2: anchors, references, guide grammar;
//                                                                     a committed tree only; every chapter left ASSEMBLING for approval
//   node scripts/spine.mjs anchor   --root <pkg>                      mint missing anchors in place
//   node scripts/spine.mjs status   --root <pkg>                      approval status of every scope
//   node scripts/spine.mjs preview  --root <pkg> --chapter <slug>     the approval view
//   node scripts/spine.mjs approve  --root <pkg> (--chapter <slug> | --course) --name <instructor> --words "<what they said>" [--glance]
//   node scripts/spine.mjs version  --root <pkg> --scopes chapter:<slug>[,…] --reason "<why>" --name <instructor>
//   node scripts/spine.mjs steering --root <pkg> --defaults <file.json> [--answers <file.json>] [--accept-all] --name <instructor> --words "…"
import fs from "node:fs";
import path from "node:path";
import { liveReader, manifestChapters } from "./lib/core/package_reader.mjs";
import { checkSpine, parseSpine, spinePaths, COURSE_MAP } from "./lib/core/spine.mjs";
import { anchorMap, rewriteRefs, migrateGuide } from "./lib/core/migrate.mjs";
import { approvalStatus, recordApproval } from "./lib/core/approvals.mjs";
import { approvalPreview, originsPath } from "./lib/core/preview.mjs";
import { openMajorVersion } from "./lib/core/versions.mjs";
import { recordSteering } from "./lib/core/steering_intake.mjs";
import { readConfig, writeConfig } from "./lib/records/config.mjs";
import { appendLogRecord, readLogText } from "./lib/records/log.mjs";
import { spawnSync } from "node:child_process";

const [cmd, ...args] = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const flag = (n) => args.includes(n);
const fail = (msg, code = 2) => { console.error(msg); process.exit(code); };
const root = opt("--root");
if (!cmd || !root || !fs.existsSync(root)) fail("usage: spine.mjs <check|migrate|anchor|status|preview|approve|version|steering> --root <package> … (see the header of scripts/spine.mjs)");
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
      if (readConfig(root).spine === 2) fail("this package is already spine v2");
      party = instructor(); words = opt("--words");
      if (!String(words || "").trim()) fail('--words "<the instructor\'s own words>" is required: a migration is the instructor\'s request');
      const st = spawnSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" });
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
      appendLogRecord(root, { type: "intake", party, payload: { event: "migrated-from-v0.12", files: Object.keys(docs), renamed: Object.keys(renames).length, instructorWords: words } });
      for (const ch of chapters) appendLogRecord(root, { type: "transition", party, payload: { chapter: ch, from: "DRAFT", to: "ASSEMBLING", instructorWords: words, migration: true } });
    }
    const left = checkSpine(parseSpine(liveReader(root), chapters), chapters);
    console.log(JSON.stringify({ rewritten: Object.keys(docs), renamed: Object.keys(renames).length, notes, remainingProblems: left.length, byRule: left.reduce((a, p) => ((a[p.rule] = (a[p.rule] || 0) + 1), a), {}),
      ...(cmd === "migrate" ? { next: "every chapter is ASSEMBLING: review `git diff` and `spine.mjs preview --chapter <slug>` with the instructor (M3), then approve each chapter and the course map" } : {}) }, null, 2));
    process.exit(0);
  }
  if (cmd === "status") {
    const st = approvalStatus(reader, chapters, readLogText(root));
    console.log(JSON.stringify(Object.fromEntries(Object.entries(st.scopes).map(([k, s]) => [k, { valid: s.valid, change: s.change?.kind || null, reasons: (s.change?.reasons || []).map((r) => r.why) }])), null, 2));
    process.exit(0);
  }
  if (cmd === "preview") {
    const chapter = opt("--chapter"); if (!chapters.includes(chapter)) fail(`--chapter must be one of ${chapters.join(", ")}`);
    console.log(approvalPreview(reader, parseSpine(reader, chapters), chapter).text);
    process.exit(0);
  }
  if (cmd === "approve") {
    const chapter = flag("--course") ? null : opt("--chapter");
    if (!flag("--course") && !chapters.includes(chapter)) fail(`--chapter must be one of ${chapters.join(", ")} (or --course)`);
    const problems = checkSpine(parseSpine(reader, chapters), chapters).filter((p) => chapter ? p.file.endsWith(`/${chapter}.md`) : p.file === COURSE_MAP);
    if (problems.length) fail(`the spine is not well-formed yet (${problems.length} problem(s), e.g. ${problems[0].detail}); fix them before approval`, 1);
    const r = recordApproval(root, reader, chapters, { chapter, glance: flag("--glance"), instructorWords: opt("--words"), note: opt("--note") || "" }, instructor());
    console.log(JSON.stringify({ recorded: r.type, seq: r.seq, scope: r.payload.scope, version: r.payload.version }, null, 2));
    process.exit(0);
  }
  if (cmd === "version") {
    const scopes = String(opt("--scopes") || "").split(",").filter(Boolean);
    const r = openMajorVersion(root, { scopes, reason: opt("--reason") }, instructor());
    console.log(JSON.stringify({ recorded: r.type, seq: r.seq, from: r.payload.from, to: r.payload.to }, null, 2));
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
