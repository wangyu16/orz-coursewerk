// SPINE v2 (redesign P3): anchors, the parsed assessment guide, well-formedness, approvals with scope and two weights,
// origin marking, the approval preview, steering, critique, versions. Each test names the requirement(s) it closes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkSpine, parseSpine, nodeIndex } from "../scripts/lib/core/spine.mjs";
import { classifyChapterChange, classifyCourseChange } from "../scripts/lib/core/change.mjs";
import { approvalStatus, approvalProblems, recordApproval } from "../scripts/lib/core/approvals.mjs";
import { approvalPreview, validateOrigins } from "../scripts/lib/core/preview.mjs";
import { spineCritique } from "../scripts/lib/core/critique.mjs";
import { recordSteering, STEERING_QUESTIONS } from "../scripts/lib/core/steering_intake.mjs";
import { openMajorVersion, currentVersion } from "../scripts/lib/core/versions.mjs";
import { anchorMap, rewriteRefs } from "../scripts/lib/core/migrate.mjs";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { readLogText } from "../scripts/lib/records/log.mjs";
import { readSteering } from "../scripts/lib/records/steering.mjs";
import { evaluateGate } from "../scripts/lib/skeleton/gate.mjs";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const I = { role: "instructor", name: "Yu Wang" };
const MAP = (extra = "") => `# Concept Map — Melting

## Summary
Solids melt.

## Objectives
1. State the melting point of ice as 0 °C at 1 atm. [anchor: state-melting-point]
2. Explain why a mixture melts over a range. [anchor: explain-mixture-range]

## Concept sequence
1. A pure solid melts at a single temperature. [anchor: pure-solid-melts]
2. Impurities lower and broaden the melting range. [prereq: concept.melting.pure-solid-melts, concept.course.phases] [anchor: impurities-broaden]
${extra}
## Key terms
- **melting point** — temperature at which a solid melts [concept.melting.pure-solid-melts]

## Misconceptions to surface
- A solid melts when it is warm, whatever the temperature. [anchor: warm-melts]
`;
const GUIDE = (count = "2", type = "short answer") => `# Assessment Guide — Melting

## State the melting point [objective: state-melting-point]
**Cognitive level:** remember.

### Recall the value [anchor: recall-value]
- **Type:** ${type}
- **Count:** ${count}

## Explain the range [objective: explain-mixture-range]
**Cognitive level:** understand.

### Predict for a mixture [anchor: predict-mixture]
- **Type:** short answer
- **Count:** 1
- **Targets:** misconception.melting.warm-melts
`;
const COURSE = (seq = "1. **melting** — Melting", concept = "1. Matter exists in phases. [anchor: phases]\n2. Heating supplies energy. [anchor: heating]") => `# Course Concept Map — Phases

## Summary
Phases.

## Concept sequence
${concept}

## Chapter sequence
${seq}
`;
function pkg(t, { map = MAP(), guide = GUIDE(), course = COURSE(), chapters = ["melting"] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-spine-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  w("alembic.json", JSON.stringify({ chapters: chapters.map((slug) => ({ slug, title: slug })) }));
  w("metadata/coursewerk.json", JSON.stringify({ schemaVersion: 1, spine: 2 }));
  w("concepts/course.md", course); w("concepts/melting.md", map); w("assessment-support/melting.md", guide);
  return { root, w, reader: liveReader(root) };
}
const problems = (p) => checkSpine(parseSpine(p.reader, ["melting"]), ["melting"]);
const rules = (p) => problems(p).map((x) => x.rule).sort();

test("[req.spine.documents] the spine is the course map plus each chapter's concept map and assessment guide, all parsed", (t) => {
  const p = pkg(t);
  const s = parseSpine(p.reader, ["melting"]);
  assert.deepEqual(s.course.chapterSequence, ["melting"]);
  assert.equal(s.course.nodes.length, 2);
  assert.deepEqual(s.chapters.melting.map.nodes.map((n) => n.kind), ["objective", "objective", "concept", "concept", "misconception"]);
  assert.equal(s.chapters.melting.guide.entries.length, 2);
  assert.deepEqual(problems(p), []);
});

test("[req.spine.anchors] node ids come from anchors, not positions; migration mints anchors and rewrites ordinal references", (t) => {
  const p = pkg(t);
  const ids = [...nodeIndex(parseSpine(p.reader, ["melting"])).keys()];
  assert.ok(ids.includes("objective.melting.state-melting-point") && ids.includes("concept.course.phases") && ids.includes("guide.melting.recall-value"));
  // reordering the objectives keeps every id
  p.w("concepts/melting.md", MAP().replace(/1\. State(.*)\n2\. Explain(.*)/, "1. Explain$2\n2. State$1"));
  assert.deepEqual([...nodeIndex(parseSpine(liveReader(p.root), ["melting"])).keys()].sort(), ids.sort());
  // missing, malformed and duplicate anchors are refused
  p.w("concepts/melting.md", MAP().replace(" [anchor: explain-mixture-range]", "").replace("[anchor: warm-melts]", "[anchor: Warm Melts]").replace("[anchor: impurities-broaden]", "[anchor: pure-solid-melts]"));
  assert.deepEqual(rules(p).filter((r) => r.startsWith("anchor")), ["anchor-duplicate", "anchor-form", "anchor-missing"]);
  // minting and reference rewriting
  const legacy = "## Objectives\n1. Define equilibrium.\n2. Write K.\n\n## Concept sequence\n1. Rates are equal.\n2. K is a ratio. [prereq: concept.ch1.1]\n\n## Key terms\n- **K** — ratio [concept.ch1.2]\n";
  const a = anchorMap(legacy, "ch1"), r = rewriteRefs(a.text, a.renames);
  assert.match(r.text, /Define equilibrium\. \[anchor: define-equilibrium\]/);
  assert.match(r.text, /\[prereq: concept\.ch1\.rates-equal\] \[anchor: ratio\]/);
  assert.match(r.text, /\[concept\.ch1\.ratio\]/);
});

test("[req.spine.guide] the assessment guide parses into anchored entries with type, count, level and target", (t) => {
  const p = pkg(t);
  const e = parseSpine(p.reader, ["melting"]).chapters.melting.guide.entries;
  assert.deepEqual(e.map((x) => [x.id, x.objective, x.type, x.count, x.levels, x.targets]), [
    ["guide.melting.recall-value", "state-melting-point", "short answer", 2, "remember", null],
    ["guide.melting.predict-mixture", "explain-mixture-range", "short answer", 1, "understand", "misconception.melting.warm-melts"],
  ]);
});

test("[req.spine.wellformed] every well-formedness rule fires on its breach, and the gate raises them as defects for the agent", (t) => {
  const p = pkg(t);
  p.w("concepts/course.md", COURSE("1. **other** — Other", "1. Matter exists in phases. [anchor: phases] [prereq: concept.course.heating]\n2. Heating supplies energy. [prereq: concept.course.phases] [anchor: heating]"));
  p.w("concepts/melting.md", MAP().replace("## Misconceptions to surface", "## Misconceptions").replace("[concept.melting.pure-solid-melts]\n", "[concept.melting.nowhere]\n").replace("concept.course.phases]", "concept.course.ghost]"));
  p.w("assessment-support/melting.md", GUIDE("TODO", "").replace("[objective: explain-mixture-range]", "[objective: unknown-objective]").replace("misconception.melting.warm-melts", "misconception.melting.none"));
  const r = rules(p);
  const missing = ["chapter-sequence", "chapter-sections", "term-parent", "objective-unguided", "guide-objective-unknown", "guide-entry-field", "prereq-unresolved", "prereq-cycle"].filter((rule) => !r.includes(rule));
  assert.deepEqual(missing, [], `rules seen: ${r.join(", ")}`);
  fs.rmSync(path.join(p.root, "assessment-support/melting.md"));
  assert.ok(rules(p).includes("guide-missing"));
  // through the documented gate at V1
  spawnSync("git", ["-C", p.root, "init", "-q"]);
  const json = path.join(p.root, "..", `g-${process.pid}.json`); t.after(() => fs.rmSync(json, { force: true }));
  spawnSync(process.execPath, [path.join(REPO, "scripts/gate.mjs"), "--root", p.root, "--checkpoint", "V1", "--json", json]);
  const rep = JSON.parse(fs.readFileSync(json, "utf8"));
  const spineDefects = rep.findings.filter((f) => f.kind.startsWith("spine-"));
  for (const kind of ["spine-guide-missing", "spine-chapter-sequence", "spine-term-parent", "spine-prereq-unresolved", "spine-prereq-cycle"]) assert.ok(spineDefects.some((f) => f.kind === kind), kind);
  assert.ok(spineDefects.every((f) => f.statusClass === "defect" && f.route === "agent" && f.evidence.type === "rule"));
});

test("[req.spine.origin-marking] [req.approval.preview] the approval view shows whose words each item is, and previews what will be built", (t) => {
  const p = pkg(t);
  p.w("metadata/spine/concepts/melting.md.origins.json", JSON.stringify({ schemaVersion: 1, items: { "state-melting-point": "instructor", "explain-mixture-range": "standardized", "pure-solid-melts": "proposed" } }));
  const v = approvalPreview(liveReader(p.root), parseSpine(liveReader(p.root), ["melting"]), "melting", { critique: [spineCritique({ kind: "level-mismatch", ids: ["guide.melting.recall-value"], note: "recall may be too low for this cohort", basis: "b" })] });
  assert.match(v.text, /0 °C at 1 atm\. \(yours\)/);
  assert.match(v.text, /range\. \(standardized from yours\)/);
  assert.match(v.text, /single temperature\. \(PROPOSED BY THE AGENT\)/);
  assert.match(v.text, /State the melting point of ice.*2 question\(s\): 2× short answer \(remember\)/);
  assert.equal(v.totalQuestions, 3);
  assert.match(v.text, /Questions for you \(they never block\)/);
  assert.equal(v.counts.proposed, 1);
  assert.deepEqual(validateOrigins({ schemaVersion: 1, items: { a: "instructor" } }), []);
  assert.match(validateOrigins({ schemaVersion: 1, items: { a: "mine" } }).join(), /must be one of/);
});

test("[req.spine.critique] spine critique is a question for the digest and never blocks", () => {
  const q = spineCritique({ kind: "objective-not-assessable", ids: ["objective.melting.explain-mixture-range"], note: "'explain' needs an observable product", basis: "b" });
  assert.equal(q.statusClass, "question"); assert.equal(q.route, "digest");
  assert.equal(evaluateGate({ findings: [q] }).canPublish, true);
  assert.throws(() => spineCritique({ kind: "rant", note: "x", basis: "b" }), /critique kind/);
});

test("[req.approval.record] an approval quotes the instructor, binds exact content and version, and only the instructor can make it", (t) => {
  const p = pkg(t);
  assert.throws(() => recordApproval(p.root, p.reader, ["melting"], { chapter: "melting", instructorWords: "ok" }, { role: "agent", name: "a", model: "m" }), /only the instructor/);
  assert.throws(() => recordApproval(p.root, p.reader, ["melting"], { chapter: "melting", instructorWords: " " }, I), /quotes the instructor/);
  const r = recordApproval(p.root, p.reader, ["melting"], { chapter: "melting", instructorWords: "Approve chapter 1, looks right." }, I);
  assert.equal(r.type, "approval");
  assert.deepEqual(r.payload.covers, ["concepts/melting.md", "assessment-support/melting.md"]);
  assert.equal(r.payload.version, 1); assert.equal(r.payload.contentHash.length, 64); assert.equal(r.payload.instructorWords, "Approve chapter 1, looks right.");
  assert.throws(() => recordApproval(p.root, p.reader, ["melting"], { chapter: "melting", instructorWords: "again" }, I), /already approved/);
});

test("[req.approval.scope] [req.approval.voiding] one approval per chapter and one for the course map; a course-map edit voids only the chapters it touches", (t) => {
  const p = pkg(t, { chapters: ["melting"] });
  const st = () => approvalStatus(liveReader(p.root), ["melting"], readLogText(p.root));
  recordApproval(p.root, p.reader, ["melting"], { chapter: "melting", instructorWords: "approve chapter" }, I);
  recordApproval(p.root, p.reader, ["melting"], { instructorWords: "approve the course map" }, I);
  assert.deepEqual(approvalProblems(st(), ["melting"]), []);
  // a course concept the chapter does not name changes: the course approval voids, the chapter's does not
  p.w("concepts/course.md", COURSE(undefined, "1. Matter exists in phases. [anchor: phases]\n2. Heating supplies energy to the system. [anchor: heating]"));
  assert.equal(st().scopes.course.valid, false); assert.equal(st().scopes.melting.valid, true);
  // a course concept the chapter's prerequisite names changes: the chapter voids too
  p.w("concepts/course.md", COURSE(undefined, "1. Matter exists in three phases. [anchor: phases]\n2. Heating supplies energy to the system. [anchor: heating]"));
  assert.equal(st().scopes.melting.valid, false);
  // a chapter edit voids the chapter; the gate's approval problems name it
  p.w("concepts/course.md", COURSE());
  p.w("assessment-support/melting.md", GUIDE("3"));
  assert.deepEqual(approvalProblems(st(), ["melting"]), ["chapter melting is not approved (substantive)"]);
  assert.equal(evaluateGate({ findings: [], approvalProblems: approvalProblems(st(), ["melting"]) }).canPublish, false);
});

test("[req.approval.weights] a light change needs only a glance; anything else, or anything uncertain, is substantive", (t) => {
  const p = pkg(t);
  recordApproval(p.root, p.reader, ["melting"], { chapter: "melting", instructorWords: "approve" }, I);
  const change = () => approvalStatus(liveReader(p.root), ["melting"], readLogText(p.root)).scopes.melting.change;
  // punctuation, markup, spacing and case → light; a rephrase is substantive (R2 coherence F4: no word list tells a
  // rephrase from a reversal, so a glance — which re-baselines every dependent — is kept for edits that change no word)
  p.w("concepts/melting.md", MAP().replace("Solids melt.", "Solids do melt eventually.").replace("Explain why a mixture melts over a range.", "Explain why a mixture melts across a range."));
  assert.equal(change().kind, "substantive");
  p.w("concepts/melting.md", MAP().replace("Solids melt.", "Solids **melt**!").replace("Explain why a mixture melts over a range.", "Explain why a mixture  melts over a range;"));
  assert.equal(change().kind, "light");
  assert.equal(recordApproval(p.root, liveReader(p.root), ["melting"], { chapter: "melting", glance: true, instructorWords: "fine" }, I).type, "glance-confirmation");
  // a number changed → substantive; glance refused
  p.w("concepts/melting.md", MAP().replace("0 °C", "4 °C"));
  assert.equal(change().kind, "substantive");
  assert.throws(() => recordApproval(p.root, liveReader(p.root), ["melting"], { chapter: "melting", glance: true, instructorWords: "fine" }, I), /only for a light change/);
  // a negation added in prose, a sub-concept added, a count changed, a reorder → substantive
  for (const [file, text] of [["concepts/melting.md", MAP().replace("Solids melt.", "Solids do not melt.")],
    ["concepts/melting.md", MAP("3. Pressure changes the melting point slightly. [anchor: pressure-effect]\n")],
    ["assessment-support/melting.md", GUIDE("4")],
    ["concepts/melting.md", MAP().replace(/1\. State(.*)\n2\. Explain(.*)/, "1. Explain$2\n2. State$1")]]) {
    p.w("concepts/melting.md", MAP()); p.w("assessment-support/melting.md", GUIDE()); p.w(file, text);
    assert.equal(change().kind, "substantive", text.slice(0, 80));
  }
});

test("[req.steering.intake] seven questions with proposed defaults; accept-all in one action; answers recorded and logged", (t) => {
  const p = pkg(t);
  assert.deepEqual(STEERING_QUESTIONS.map((q) => q.field), ["level", "depth", "emphasis", "notation", "exampleStyle", "exclusions", "tone"]);
  const defaults = { level: "first-year", depth: "conceptual", emphasis: "reasoning", notation: "SI", exampleStyle: "everyday", exclusions: [], tone: "plain" };
  assert.throws(() => recordSteering(p.root, { defaults: { level: "x" }, acceptAll: true, instructorWords: "ok" }, I), /default must be proposed/);
  assert.throws(() => recordSteering(p.root, { defaults, answers: { level: "x" }, instructorWords: "ok" }, I), /answer it, or accept all defaults/);
  recordSteering(p.root, { defaults, answers: { tone: "warm" }, acceptAll: true, instructorWords: "defaults are fine, but warmer" }, I);
  assert.equal(readSteering(p.root).answers.tone, "warm"); assert.equal(readSteering(p.root).answers.level, "first-year");
  assert.match(readLogText(p.root), /"type":"steering"/);
});

test("[req.versions.major] a structural change opens a new major version with lineage before it can be approved", (t) => {
  const p = pkg(t);
  recordApproval(p.root, p.reader, ["melting"], { chapter: "melting", instructorWords: "approve" }, I);
  // split one objective into two
  const split = MAP().replace("2. Explain why a mixture melts over a range. [anchor: explain-mixture-range]",
    "2. Explain why a mixture melts over a range of temperatures. [anchor: explain-mixture-melts]\n3. Explain why a mixture range is broad. [anchor: explain-mixture-broad]");
  p.w("concepts/melting.md", split);
  p.w("assessment-support/melting.md", GUIDE().replace("explain-mixture-range", "explain-mixture-melts") + "\n## Broad [objective: explain-mixture-broad]\n**Cognitive level:** understand.\n\n### Broad range [anchor: broad-range]\n- **Type:** short answer\n- **Count:** 1\n");
  const st = approvalStatus(liveReader(p.root), ["melting"], readLogText(p.root)).scopes.melting.change;
  assert.equal(st.kind, "structural"); assert.match(st.reasons[0].why, /appears split/);
  assert.throws(() => recordApproval(p.root, liveReader(p.root), ["melting"], { chapter: "melting", instructorWords: "approve" }, I), /opens a new major version first/);
  const v = openMajorVersion(p.root, { scopes: ["chapter:melting"], reason: "objective 2 split in two" }, I);
  assert.deepEqual(v.payload.to, { "chapter:melting": 2 });
  assert.equal(recordApproval(p.root, liveReader(p.root), ["melting"], { chapter: "melting", instructorWords: "approve v2" }, I).payload.version, 2);
  // an objective moving between chapters opens versions of both; a chapter-list change is a course version
  assert.deepEqual(openMajorVersion(p.root, { scopes: ["chapter:melting", "chapter:boiling"], reason: "objective moved" }, I).payload.to, { "chapter:melting": 3, "chapter:boiling": 2 });
  assert.equal(classifyCourseChange({ chapterSequence: ["melting"], nodes: [] }, { chapterSequence: ["melting", "boiling"], nodes: [] }).kind, "structural");
  assert.throws(() => openMajorVersion(p.root, { scopes: ["course"], reason: "x" }, { role: "agent", name: "a", model: "m" }), /instructor's decision/);
  assert.equal(currentVersion(readLogText(p.root), "course"), 1);
});

test("[req.versions.minor] a spine revision that keeps identity stays within the version", (t) => {
  const before = { nodes: [{ id: "objective.m.a", anchor: "a", kind: "objective", text: "State the melting point.", prereqs: [] }], entries: [] };
  const after = { nodes: [...before.nodes, { id: "concept.m.b", anchor: "b", kind: "concept", text: "Impurities broaden the range.", prereqs: [] }], entries: [] };
  assert.equal(classifyChapterChange(before, after).kind, "substantive");
  const p = pkg(t);
  recordApproval(p.root, p.reader, ["melting"], { chapter: "melting", instructorWords: "approve" }, I);
  p.w("concepts/melting.md", MAP("3. Pressure changes the melting point slightly. [anchor: pressure-effect]\n"));
  recordApproval(p.root, liveReader(p.root), ["melting"], { chapter: "melting", instructorWords: "approve the new sub-concept" }, I);
  assert.equal(currentVersion(readLogText(p.root), "chapter:melting"), 1);
});
