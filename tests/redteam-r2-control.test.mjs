// 3C red team, round 2: CONTROL (studies/p11/redteam-r2/control, 2026-10-06), plus the Coherence attacker's F11. Every
// finding is replayed as its attack on the real course fixture, with replayed reviewer answers (test doubles), and now
// raises what it should — fixed at its root cause:
//   1. structure is only what the frame does not print (C3-01, C3-02, C3-03, C3-05);
//   2. what ships and what is checked are one computation (C3-04, C3-07), and `role: administrative` is the
//      instructor's logged act, never a field alone (C3-06);
//   3. D41 reaches guide Counts: a question fills a Count only on a current review that says it practises the entry's
//      objective at its type and level; a framing question never does (C5-08);
//   4. the restated-objective key keeps case and compares the anchor and prerequisite groups (C4-09);
//   5. a course objective is covered only by what is taught, never by a [prereq: …] mention (C1-10);
//   6. D39: the spine review that lets a re-approval through is the logged dispatch, and the changed lines are a real
//      diff of every file the approval covers (C4-11, C4-12);
//   7. the off-plan answer fails closed (C2-13);
//   8. a link or framing review is bound to the plan items it judged, and a light rewording the instructor
//      glance-confirmed voids none (F11).
// Offline and deterministic.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { liveReader, manifestChapters } from "../scripts/lib/core/package_reader.mjs";
import { coreObligations, indexAndStamp, linkUnits, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { beginSession, confirmAdministrative, deliverablesOf } from "../scripts/lib/core/units_index.mjs";
import { segmentDeliverable, unitHash, NYML_NOTATION_KINDS } from "../scripts/lib/core/segment.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { currentReviewsAt, planOf, readAlignment, reviewAlignment } from "../scripts/lib/verify/alignment.mjs";
import { recordApproval } from "../scripts/lib/core/approvals.mjs";
import { restatedObjectiveFindings } from "../scripts/lib/core/core_checks.mjs";
import { approvalPrecondition, changedSpineLines, currentSpineReview, reviewSpineChanges } from "../scripts/lib/core/spine_review.mjs";
import { uncheckedShipped, uncheckedShippedFindings } from "../scripts/lib/core/shipped.mjs";
import { packPublished } from "../scripts/lib/core/pack_v2.mjs";
import { publishContentHash } from "../scripts/lib/core/workflow.mjs";
import { appendLogRecord, readLogText } from "../scripts/lib/records/log.mjs";
import { canonicalJson, sha256 } from "../scripts/lib/records/canonical.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const SCRIPTS = path.join(REPO, "scripts");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const require_ = createRequire(path.join(REPO, "package.json"));
const SG = "study-guide/le-chatelier.md", PR = "practice/le-chatelier.md", MAP = "concepts/le-chatelier.md", GUIDE = "assessment-support/le-chatelier.md";
const ELECTRO = /galvanic|salt bridge|anode|cathode/i;
const git = (root, ...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });

/** A fresh copy of the real course (no baseline gate: these tests read the core checks directly). */
function course(t, { gitInit = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-rt2-ctl-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  if (gitInit) { git(root, "init", "-q", "-b", "main"); git(root, "add", "-A"); git(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "baseline"); }
  const c = {
    root, dir, r: () => liveReader(root),
    units: () => loadUnits(root, liveReader(root)),
    unit: (id) => loadUnits(root, liveReader(root)).find((u) => u.id === id),
    file: (rel) => path.join(root, rel),
    read: (rel) => fs.readFileSync(path.join(root, rel), "utf8"),
    write: (rel, s) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), s); },
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 50)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent: (fn) => { beginSession(root, liveReader(root), AGENT); fn(); indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    link: (map) => linkUnits(root, liveReader(root), map, AGENT),
    core: () => coreObligations(root, liveReader(root), "rt2"),
    cli: (script, ...a) => spawnSync("node", [path.join(SCRIPTS, script), ...a], { encoding: "utf8" }),
  };
  return c;
}
const kinds = (fs_) => fs_.map((f) => `${f.kind}${(f.units || []).length ? `(${f.units.join(",")})` : ""}`);
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];
const declaredOf = (pr) => (pr.split("\nDECLARED ITEMS\n")[1] || "").split("\n\n")[0].split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
/** A replayed link-and-level reviewer (test double): every declared link "yes", every guide entry "matches", unless told. */
function reviewer(judge = () => ({})) {
  const seen = [];
  const verifier = replayVerifier((pr) => {
    seen.push(pr);
    const j = judge(pr) || {}, gids = [...pr.matchAll(/^- (guide\.\S+): /gm)].map((m) => m[1]), one = /its assessment guide entry asks for/.test(pr);
    const fid = { type: "matches", level: "matches", why: "test double", ...(j.fidelity || {}) };
    return { nonce: nonceOf(pr), links: declaredOf(pr).map((id) => ({ id, verdict: j.verdicts?.[id] ?? "yes", why: "test double" })), also: [], offPlan: j.offPlan ?? false,
      ...(one ? { fidelity: fid } : gids.length ? { fidelity: gids.map((id) => ({ id, ...fid })) } : {}) };
  });
  return { seen, verifier };
}
const renderLean = (root, rel) => require_("orz-markdown").md.render(fs.readFileSync(path.join(root, rel), "utf8"), { markdownBasePath: path.dirname(path.join(root, rel)) });

// ============================================ 1. structure is what does not print ==================================
test("[req.control.structure-unprinted] C3-01, C3-02, C3-03: a credit-line paragraph, text after a comment, ###+ headings and a header-only table print — each is a unit, linked and reviewed like any other", (t) => {
  const c = course(t);
  const at = "## Which disturbances move what";
  const LESSONS = [
    "Adapted from OpenStax, Chemistry 2e, chapter 17.\nA galvanic cell converts the chemical energy of a spontaneous redox reaction into electrical energy.",
    "<!-- note: extension --> Oxidation takes place at the anode and reduction at the cathode.",
    "### A salt bridge keeps both half-cells electrically neutral.",
    "###### The cathode is where reduction happens.",
    "| An electrolytic cell is driven by an external power supply | and so is a galvanic cell run backwards |\n|---|---|",
  ];
  c.asAgent(() => c.edit(SG, at, LESSONS.join("\n\n") + "\n\n" + at));
  const html = renderLean(c.root, SG);
  for (const needle of ["galvanic cell converts", "Oxidation takes place at the anode", "A salt bridge keeps", "The cathode is where", "An electrolytic cell is driven"]) assert.ok(html.includes(needle), `orz-markdown prints "${needle}"`);
  const lesson = c.units().filter((u) => ELECTRO.test(u.text) || /electrolytic/.test(u.text));
  assert.equal(lesson.length, 5, lesson.map((u) => `${u.form}:${u.text.slice(0, 40)}`).join(" | "));
  assert.deepEqual(lesson.map((u) => u.form).sort(), ["heading", "heading", "paragraph", "paragraph", "table-row"]);
  assert.ok(lesson.every((u) => u.role === "teaching"));
  // after the comment, only what prints is the unit
  assert.equal(lesson.find((u) => /^Oxidation/.test(u.text))?.text, "Oxidation takes place at the anode and reduction at the cathode.");
  const unlinked = new Set(c.core().filter((f) => f.kind === "unit-unlinked").flatMap((f) => f.units));
  assert.ok(lesson.every((u) => unlinked.has(u.id)), "each must be linked (and so reviewed) before publishing");
  // the segmenter leaves no printed line out
  const seg = segmentDeliverable(c.read(SG), SG);
  c.read(SG).split("\n").forEach((l, k) => { if (l.trim()) assert.ok(seg.covered.has(k), `line ${k + 1} is covered`); });
});

test("[req.control.structure-unprinted] benign: a short single credit line, comments, `#`/`##` labels and a table header with data rows stay structure — the fixture's units are unchanged", () => {
  for (const rel of deliverablesOf(liveReader(C2))) {
    const side = JSON.parse(fs.readFileSync(path.join(C2, "metadata/units", `${rel}.json`), "utf8"));
    assert.deepEqual(segmentDeliverable(fs.readFileSync(path.join(C2, rel), "utf8"), rel).units.map((u) => unitHash(u.text)), side.units.map((u) => u.locator.contentHash), rel);
  }
  const doc = "*Adapted from the article \"X\" (<https://example.org/x>) by Wikipedia contributors, licensed CC-BY-SA-4.0. Adapted and reorganized for this teaching resource.*\n\n<!-- slide template=title -->\n\n## Next: the equilibrium constant\n\n| Change | Shift |\n|---|---|\n| add reactant | forward |\n";
  assert.deepEqual(segmentDeliverable(doc, "study-guide/x.md").units.map((u) => u.text), ["| add reactant | forward |"]);
  // a credit line followed by a second line is a paragraph (held in round 2: "Source: …" too)
  assert.equal(segmentDeliverable("Source: OpenStax.\nA galvanic cell converts chemical energy.\n", "study-guide/x.md").units.length, 1);
  // a `##` heading that reads as sentences is read, and still names its section
  const long = segmentDeliverable("## Summary. A galvanic cell converts chemical energy into electrical energy at the anode.\n\nText.\n", "study-guide/x.md").units;
  assert.equal(long[0].form, "heading"); assert.match(long[1].section, /^summary-a-galvanic-cell/);
});

test("[req.control.structure-unprinted] C3-05: of the {{nyml}} blocks, only the settings and metadata blocks are notation; every element orz-paged prints is a unit", async (t) => {
  // the element kinds orz-paged prints, read from the installed package (a new kind would be content too: fail closed)
  const src = fs.readFileSync(path.join(REPO, "node_modules/orz-paged/dist/render-paged.js"), "utf8");
  const printed = [...src.match(/const ELEMENT_KINDS = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
  assert.ok(printed.includes("abstract") && printed.includes("question-open"), printed.join(","));
  for (const kind of printed) assert.ok(!NYML_NOTATION_KINDS.includes(kind), `${kind} prints`);
  for (const kind of [...printed, "some-new-element"]) {
    const u = segmentDeliverable(`{{nyml\nkind: ${kind}\ntext: A galvanic cell converts chemical energy into electrical energy.\n}}\n`, "current/x.md").units;
    assert.equal(u.length, 1, kind); assert.equal(u[0].form, /^question-/.test(kind) ? "question" : "element");
  }
  for (const kind of NYML_NOTATION_KINDS) assert.equal(segmentDeliverable(`{{nyml\nkind: ${kind}\ntitle: T\n}}\n\nText.\n`, "current/x.md").units.length, 1, `${kind} is notation`);
  // the attack: a declared paged handout whose abstract and question teach electrochemistry
  const { assemble } = await import(path.join(REPO, "node_modules/orz-paged/dist/render-paged.js"));
  const c = course(t);
  const H = "current/fall-2026/le-chatelier-handout.md";
  const text = "{{nyml\nkind: document\ntemplate: note\n}}\n\n# Handout\n\n{{nyml\nkind: abstract\ntext: A galvanic cell converts the chemical energy of a spontaneous redox reaction into electrical energy; a salt bridge keeps both half-cells neutral.\n}}\n\n{{nyml\nkind: question-open\nn: 1\nbody: In a galvanic cell, at which electrode does reduction take place?\nanswer: At the cathode.\n}}\n";
  c.write(H, text);
  c.write("metadata/DOCUMENTS.json", JSON.stringify({ schemaVersion: 1, documents: [{ id: "h", title: "Handout", source: H, carrier: "paged" }] }, null, 2) + "\n");
  c.asAgent(() => {});
  assert.ok(/galvanic cell converts/.test(assemble(text).bodyHtml) && /which electrode does reduction/.test(assemble(text).bodyHtml), "orz-paged prints both");
  const units = c.units().filter((u) => u.locator.deliverable === H);
  assert.deepEqual(units.map((u) => u.form), ["element", "question"]);
  const unlinked = new Set(c.core().filter((f) => f.kind === "unit-unlinked").flatMap((f) => f.units));
  assert.ok(units.every((u) => unlinked.has(u.id)));
});

// ================================== 2. what ships is what is checked: one computation ===============================
/** A publish decision record for the pack (a test double of `coursewerk.mjs publish`, which needs a publishable gate). */
function publishRecord(c) {
  appendLogRecord(c.root, { type: "publish", party: I, payload: { profile: "public", contentHash: publishContentHash(c.root), gateBasis: "test", chapters: manifestChapters(c.r()).map((chapter) => ({ chapter, version: 1, approval: null })), course: { approval: null }, excluded: [], drafts: [], openQuestions: [], overQuestions: false, instructorWords: "Publish (test double)." } });
}

test("[req.ship.same-computation] C3-04: an {{md}} include renders another file into the study guide — its target must be a deliverable the harness reads, or the gate and the pack refuse it", (t) => {
  const c = course(t);
  const INC = "current/fall-term/le-chatelier-extension.md";
  c.write(INC, "A galvanic cell converts the chemical energy of a spontaneous redox reaction into electrical energy.\n");
  c.asAgent(() => c.edit(SG, "## Common misconceptions", `## Looking ahead\n\n{{md ../${INC}}}\n\n## Common misconceptions`));
  assert.ok(renderLean(c.root, SG).includes("galvanic cell converts"), "orz-markdown inlines the file");
  const f = uncheckedShippedFindings(c.root, c.r(), "rt2");
  const inc = f.filter((x) => x.kind === "include-unchecked");
  assert.equal(inc.length, 1, kinds(f).join(" ")); assert.equal(inc[0].statusClass, "defect"); assert.equal(inc[0].route, "agent");
  assert.equal(inc[0].evidence.file, SG); assert.match(inc[0].evidence.detail, /le-chatelier-extension\.md/);
  // the target itself is undeclared markdown that would ship
  assert.ok(f.some((x) => x.kind === "document-unchecked" && x.evidence.file === INC));
  publishRecord(c);
  const p = packPublished(c.root, path.join(c.dir, "out"));
  assert.equal(p.ok, false); assert.match(p.error, /refusing to pack what nothing checked: .*le-chatelier-extension\.md/);
  // declared, the included file is a deliverable — segmented on its own, linked and reviewed — and the include stands
  c.write("metadata/DOCUMENTS.json", JSON.stringify({ schemaVersion: 1, documents: [{ id: "ext", title: "Extension", source: INC, carrier: "lean" }] }, null, 2) + "\n");
  c.asAgent(() => {});
  assert.deepEqual(uncheckedShipped(c.root, c.r()), { documents: [], includes: [] });
  assert.ok(c.units().some((u) => u.locator.deliverable === INC && ELECTRO.test(u.text)));
  // a URL include is never read: refused
  c.asAgent(() => c.edit(SG, `{{md ../${INC}}}`, `{{md ../${INC}}}\n\n{{markdown https://example.org/lesson.md}}`));
  assert.ok(uncheckedShipped(c.root, c.r()).includes.some((x) => /example\.org/.test(x.target)));
});

test("[req.ship.same-computation] C3-07: an undeclared markdown file the pack would ship is a blocking defect, and the pack refuses it", (t) => {
  const c = course(t);
  const H = "current/fall-2026/le-chatelier-reading.md";
  c.write(H, "# Reading\n\nA galvanic cell converts the chemical energy of a spontaneous redox reaction into electrical energy.\n");
  const f = uncheckedShippedFindings(c.root, c.r(), "rt2").filter((x) => x.kind === "document-unchecked");
  assert.equal(f.length, 1); assert.equal(f[0].statusClass, "defect"); assert.equal(f[0].evidence.file, H);
  publishRecord(c);
  const p = packPublished(c.root, path.join(c.dir, "out"));
  assert.equal(p.ok, false); assert.match(p.error, /le-chatelier-reading\.md \(not a declared document\)/);
  // the spine, the deliverables and harness records under metadata/ are what is read: nothing else is flagged
  fs.rmSync(c.file(H));
  assert.deepEqual(uncheckedShipped(c.root, c.r()), { documents: [], includes: [] });
});

test("[req.ship.administrative-instructor] C3-06: `role: administrative` exempts a document only by the instructor's logged confirmation of its current content; the agent's field alone exempts nothing", (t) => {
  const c = course(t);
  const H = "current/fall-2026/le-chatelier-handout.md";
  c.write(H, "{{nyml\nkind: document\n}}\n\n# Handout\n\n## Electrochemistry\n\nA galvanic cell converts the chemical energy of a spontaneous redox reaction into electrical energy.\n");
  c.write("metadata/DOCUMENTS.json", JSON.stringify({ schemaVersion: 1, documents: [{ id: "h", title: "Handout", source: H, carrier: "paged", role: "administrative" }] }, null, 2) + "\n");
  c.asAgent(() => {});
  const lesson = c.units().find((u) => u.locator.deliverable === H && ELECTRO.test(u.text));
  assert.ok(lesson, "the agent's mark alone: still a deliverable, segmented");
  assert.ok(c.core().some((f) => f.kind === "unit-unlinked" && f.units.includes(lesson.id)));
  // the CLI: the instructor's act, with their words
  assert.notEqual(c.cli("coursewerk.mjs", "administrative", "--root", c.root, "--document", H, "--name", I.name).status, 0, "no words: refused");
  const ok = c.cli("coursewerk.mjs", "administrative", "--root", c.root, "--document", H, "--name", I.name, "--words", "Yes, the handout is administrative.");
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(!deliverablesOf(c.r()).includes(H), "confirmed: format and rights checks only");
  assert.deepEqual(uncheckedShipped(c.root, c.r()).documents, [], "and it is not unchecked either: the instructor read it");
  // an edit after the confirmation makes it a deliverable again
  fs.appendFileSync(c.file(H), "\nAn electrolytic cell runs the other way.\n");
  assert.ok(deliverablesOf(c.r()).includes(H));
  // a confirmation is never the agent's
  assert.throws(() => confirmAdministrative(c.root, c.r(), { source: H, instructorWords: "fine" }, AGENT), /instructor's act/);
});

// ==================================== 3. D41 for guide Counts (C5-08) ===============================================
const tab = (label, body, answer) => `:::: tabs\n::: tab ${label}\n${body}\n:::\n::: tab Answer ${label.replace(/^Q /, "")}\n${answer}\n:::\n::::`;

test("[req.control.guide-count-verified] C5-08 A: a never-reviewed question does not fill a Count — the agent owes its review; a review that says it differs from the entry leaves the entry short", async (t) => {
  const c = course(t);
  const Q2 = "u-practice-le-chatelier-questions-3"; // Q 2, the only question of guide.le-chatelier.statement-critique
  c.asAgent(() => c.write(PR, `${c.read(PR).trimEnd()}\n\n${tab("Q 16", "In a galvanic cell, at which electrode does reduction take place?", "Reduction takes place at the cathode.")}\n`));
  const q = c.units().find((u) => u.form === "question" && /galvanic/.test(u.text)), a = c.units().find((u) => u.form === "answer" && /cathode/.test(u.text));
  c.link({ [Q2]: ["objective.le-chatelier.state-principle"], [q.id]: ["objective.le-chatelier.state-principle", "guide.le-chatelier.statement-critique"], [a.id]: ["objective.le-chatelier.state-principle"] });
  const owed = c.core().filter((f) => f.kind === "link-review-owed" && f.units.includes(q.id));
  assert.equal(owed.length, 1, kinds(c.core()).join(" ")); assert.equal(owed[0].statusClass, "obligation");
  assert.ok(!c.core().some((f) => f.kind === "guide-entry-short" && /statement-critique/.test(f.evidence.what)), "short only of a review: the review is what is owed");
  // the honest review: about electrochemistry, not the principle; and not an error-analysis item
  await reviewAlignment(c.root, c.r(), { verifier: reviewer(() => ({ verdicts: { "objective.le-chatelier.state-principle": "no" }, fidelity: { type: "differs", level: "differs" } })).verifier, only: [q.id] });
  const short = c.core().filter((f) => f.kind === "guide-entry-short" && /statement-critique/.test(f.evidence.what));
  assert.equal(short.length, 1, kinds(c.core()).join(" ")); assert.match(short[0].evidence.what, /has 0 of 1/);
  // a review that says it practises the objective but is not the entry's type still does not fill it
  await reviewAlignment(c.root, c.r(), { verifier: reviewer(() => ({ fidelity: { type: "differs", level: "matches" } })).verifier, only: [q.id] });
  assert.ok(c.core().some((f) => f.kind === "guide-entry-short" && /statement-critique/.test(f.evidence.what)));
  // yes, and the entry's type and level: it fills
  await reviewAlignment(c.root, c.r(), { verifier: reviewer().verifier, only: [q.id] });
  assert.ok(!c.core().some((f) => /statement-critique/.test(f.evidence.what || "") || f.units.includes(q.id) && f.kind === "link-review-owed"));
});

test("[req.control.guide-count-verified] C5-08 B: a question under a framing heading never fills a Count (its fidelity is never asked)", async (t) => {
  const c = course(t);
  const Q10 = "u-practice-le-chatelier-questions-19"; // one of the two questions of guide.le-chatelier.count-moles
  c.asAgent(() => c.write(PR, `${c.read(PR).trimEnd()}\n\n## Summary\n\n${tab("Q 16", "What is the name of the principle that tells which way a disturbed equilibrium moves?", "Le Chatelier's principle.")}\n`));
  const q = c.units().find((u) => u.form === "question" && /name of the principle/.test(u.text)), a = c.units().find((u) => u.form === "answer" && /Le Chatelier's principle\.$/.test(u.text));
  assert.equal(q.role, "framing");
  c.link({ [Q10]: ["objective.le-chatelier.predict-pressure-shift"], [q.id]: ["objective.le-chatelier.predict-pressure-shift", "guide.le-chatelier.count-moles"], [a.id]: ["objective.le-chatelier.predict-pressure-shift"] });
  const rev = reviewer();
  await reviewAlignment(c.root, c.r(), { verifier: rev.verifier, only: [q.id] });
  assert.ok(!/guide entry/.test(rev.seen[0]), "framing is read for off-plan content only");
  const short = c.core().filter((f) => f.kind === "guide-entry-short" && /count-moles/.test(f.evidence.what));
  assert.equal(short.length, 1, kinds(c.core()).join(" ")); assert.match(short[0].evidence.what, /has 1 of 2/);
});

// ==================================== 4. restated objectives (C4-09) ================================================
test("[req.control.restated-objectives-full] C4-09: case is meaning (ln K is not ln k), and a bracketed group that is not the node's own anchor or prerequisites is a difference", (t) => {
  const c = course(t);
  const A = "study-guide/chemical-equilibrium.md";
  const k5 = "5. Relate the equilibrium constant to the standard Gibbs energy change using $\\Delta G^\\ominus = -RT \\ln K$.";
  const l5 = "5. Explain why adding an inert gas at constant volume, and why adding a catalyst, do not shift the equilibrium.";
  const restated = () => restatedObjectiveFindings(c.r(), "rt2").filter((f) => f.kind === "objective-restated-differently");
  assert.deepEqual(restated(), []);
  c.edit(A, k5, k5.replace("\\ln K$", "\\ln k$"));
  assert.ok(restated().some((f) => f.evidence.file === A && /ln k/.test(f.evidence.detail)), "K → k");
  c.edit(A, k5.replace("\\ln K$", "\\ln k$"), k5);
  c.edit(SG, l5, `${l5} [prereq: but a catalyst does raise the equilibrium yield]`);
  assert.ok(restated().some((f) => f.evidence.file === SG && /catalyst does raise/.test(f.evidence.detail)), "a prose 'prereq' group is read");
  c.edit(SG, `${l5} [prereq: but a catalyst does raise the equilibrium yield]`, `${l5} [anchor: explain-inert-and-catalyst]`);
  assert.deepEqual(restated(), [], "the node's own anchor is notation");
  c.edit(SG, `${l5} [anchor: explain-inert-and-catalyst]`, `${l5} [prereq: concept.le-chatelier.principle-statement]`);
  assert.ok(restated().some((f) => f.evidence.file === SG), "prerequisites the node does not have");
});

// ==================================== 5. course objectives (C1-10) ==================================================
test("[req.control.course-objectives-covered] C1-10 (round 2): a [prereq: …] mention does not cover a course objective — only a TAUGHT chapter objective or concept naming it, or a unit teaching it, reviewed", async (t) => {
  const c = course(t);
  const OBJ = "objective.course.industrial-conditions", CONCEPT = "concept.le-chatelier.industrial-compromise";
  c.edit("concepts/course.md", "## Concept sequence\n", "## Objectives\n1. Choose the operating temperature and pressure of an industrial ammonia synthesis by weighing equilibrium yield against reaction rate. [anchor: industrial-conditions]\n\n## Concept sequence\n");
  const last = c.read(MAP).split("\n").find((l) => /^7\. .*\[anchor: catalyst-no-shift\]/.test(l));
  c.edit(MAP, last, `${last}\n8. An industrial synthesis runs at conditions that trade equilibrium yield against rate. [prereq: ${OBJ}] [anchor: industrial-compromise]`);
  const cov = () => c.core().filter((f) => f.kind === "course-objective-uncovered" || (f.kind === "link-review-owed" && /industrial/.test(f.evidence.what)));
  const f = cov();
  assert.equal(f.length, 1, kinds(c.core()).join(" ")); assert.equal(f[0].kind, "course-objective-uncovered");
  assert.match(f[0].evidence.what, new RegExp(`${CONCEPT.replace(/\./g, "\\.")} names it, but is taught by no reviewed unit`));
  // a unit links the concept: its review is owed before it covers anything
  const u = c.unit("u-study-guide-le-chatelier-adding-a-catalyst-1");
  c.link({ [u.id]: [...u.spineNodes, CONCEPT] });
  assert.deepEqual(cov().map((x) => x.kind), ["link-review-owed"]);
  await reviewAlignment(c.root, c.r(), { verifier: reviewer(() => ({ verdicts: { [CONCEPT]: "passing" } })).verifier, only: [u.id] });
  assert.deepEqual(cov().map((x) => x.kind), ["course-objective-uncovered"], "only in passing: not taught");
  await reviewAlignment(c.root, c.r(), { verifier: reviewer().verifier, only: [u.id] });
  assert.deepEqual(cov(), [], "taught (reviewed yes) and naming it: covered");
});

// ==================================== 6. D39 (C4-11, C4-12) =========================================================
const quietSpine = () => replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [] }));

test("[req.spine.blind-review-bound] C4-11: the review that lets a re-approval through is the logged dispatch — a hand-written review file satisfies nothing, and an edited record is not vouched for", async (t) => {
  const c = course(t);
  c.edit(MAP, "responds when it is disturbed: it shifts to a new equilibrium that partially counteracts the change.", "responds when it is disturbed: it shifts back to its original equilibrium, fully cancelling the change.");
  const pre = () => approvalPrecondition(c.root, c.r(), manifestChapters(c.r()), { chapter: "le-chatelier" });
  assert.ok(pre().problem, "a re-approval waits for the review");
  // the forgery: a "no concerns" file for the current text, with no dispatch behind it
  const ch = changedSpineLines(c.root, c.r(), "chapter:le-chatelier");
  c.write("metadata/spine/review/chapter-le-chatelier.json", JSON.stringify({ scope: "chapter:le-chatelier", textHash: ch.textHash, lines: ch.lines.length, dispatch: null, concerns: [], at: new Date().toISOString() }, null, 2) + "\n");
  assert.equal(currentSpineReview(c.root, c.r(), "chapter:le-chatelier"), null);
  assert.ok(pre().problem, "the file is not the review");
  // the CLI agrees: a glance confirmation is refused
  assert.notEqual(c.cli("spine.mjs", "approve", "--root", c.root, "--chapter", "le-chatelier", "--name", I.name, "--words", "Fine.", "--glance").status, 0);
  // the real review (a test double reviewer that raises one concern) is logged; its concerns come from its answer
  const wrong = replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: [{ line: 1, kind: "wrong", text: "fully cancelling the change", problem: "the shift only partially counteracts the change", suggestion: "partially counteracting the change" }] }));
  const r = await reviewSpineChanges(c.root, c.r(), "chapter:le-chatelier", { verifier: wrong });
  assert.ok(r.dispatch);
  assert.equal(currentSpineReview(c.root, c.r(), "chapter:le-chatelier").concerns.length, 1);
  assert.equal(pre().problem, undefined);
  // rewriting the review file's concerns changes nothing: the preview reads the logged answer
  c.write("metadata/spine/review/chapter-le-chatelier.json", JSON.stringify({ ...r, concerns: [] }, null, 2) + "\n");
  assert.match(c.cli("spine.mjs", "preview", "--root", c.root, "--chapter", "le-chatelier").stdout, /Possibly wrong/);
  // an edited verification record is not vouched for by the log
  const recFile = c.file(`metadata/verification/${r.dispatch}.json`), rec = JSON.parse(fs.readFileSync(recFile, "utf8"));
  fs.writeFileSync(recFile, JSON.stringify({ ...rec, linesHash: sha256(canonicalJson([])) }, null, 2) + "\n");
  assert.equal(currentSpineReview(c.root, c.r(), "chapter:le-chatelier"), null);
});

test("[req.spine.blind-review-diff] C4-12: the changed lines are a real diff of every file the approval covers — the guide rubric, and a line moved verbatim into another section", (t) => {
  const c = course(t);
  const lines = () => changedSpineLines(c.root, c.r(), "chapter:le-chatelier").lines;
  assert.deepEqual(lines(), []);
  // A. the guide's rubric, reversed (the change classifier calls it light)
  c.edit(GUIDE, "system reaches a **new** equilibrium that only **partially** counteracts the change. Targets the", "system returns to its **original** equilibrium and **fully** cancels the change. Targets the");
  assert.ok(lines().some((l) => l.file === GUIDE && /fully\*\* cancels/.test(l.text)), JSON.stringify(lines()));
  assert.ok(approvalPrecondition(c.root, c.r(), manifestChapters(c.r()), { chapter: "le-chatelier" }).problem, "a glance waits for the review");
  // B. a misconception moved verbatim into the concept sequence
  const d = course(t);
  const LINE = "- Adding a catalyst increases the amount of product present at equilibrium. [anchor: catalyst-increases-product]";
  d.edit(MAP, LINE + "\n", "");
  const c7 = d.read(MAP).split("\n").find((l) => /^7\. .*\[anchor: catalyst-no-shift\]/.test(l));
  d.edit(MAP, c7, `${c7}\n${LINE}`);
  const moved = changedSpineLines(d.root, d.r(), "chapter:le-chatelier").lines;
  assert.deepEqual(moved.map((l) => l.text), [LINE]);
  // benign: renumbering a list is not a change; a heading renamed makes the lines under it changed (their context)
  const e = course(t);
  const sec = e.read(MAP).split("\n").find((l) => /^## Misconceptions/.test(l));
  e.edit(MAP, sec, "## Concept sequence (continued)");
  assert.ok(changedSpineLines(e.root, e.r(), "chapter:le-chatelier").lines.some((l) => l.text === LINE));
});

// ==================================== 7. the off-plan answer (C2-13) ================================================
test("[req.control.review-fails-closed] C2-13: only an explicit off-plan answer is read; 'yes', 1 or a missing field is unanswered, and a framing unit so reviewed still owes its review", async (t) => {
  const v = (offPlan) => readAlignment(JSON.stringify({ nonce: "n", links: [], also: [], ...(offPlan === undefined ? {} : { offPlan }) }), "n", [], new Set());
  for (const x of ["yes", 1, undefined, null, "off-plan"]) { assert.equal(v(x).offPlan, null, String(x)); assert.ok(v(x).unanswered.includes("offPlan")); }
  assert.equal(v(true).offPlan, true); assert.equal(v("True").offPlan, true); assert.equal(v(false).offPlan, false); assert.deepEqual(v(false).unanswered, []);
  const c = course(t);
  c.asAgent(() => c.edit(SG, "## Common misconceptions", "## Looking ahead\n\nA galvanic cell converts the chemical energy of a spontaneous redox reaction into electrical energy, with oxidation at the anode.\n\n## Common misconceptions"));
  const u = c.units().find((x) => x.locator.section === "looking-ahead");
  assert.equal(u.role, "framing");
  const raw = (a) => replayVerifier((pr) => `{"nonce": "${nonceOf(pr)}", "links": [], "also": []${a ? `, "offPlan": ${a}` : ""}}`);
  for (const a of ['"yes"', null]) {
    const r = await reviewAlignment(c.root, c.r(), { verifier: raw(a), only: [u.id] });
    assert.equal(r[0].status, "incomplete"); assert.equal(r[0].offPlan, null);
    assert.ok(c.core().some((f) => f.kind === "framing-review-owed" && f.units.includes(u.id)), `offPlan ${a}: still owed`);
  }
  await reviewAlignment(c.root, c.r(), { verifier: raw("true"), only: [u.id] });
  assert.ok(!c.core().some((f) => f.kind === "framing-review-owed" && f.units.includes(u.id)), "an explicit answer reads it");
});

// ==================================== 8. review currency (F11) ======================================================
test("[req.control.review-basis-judged] F11: a review is bound to the plan items it judged — a glance-confirmed light rewording voids no review; a real change to a judged item voids exactly the reviews that judged it", async (t) => {
  const c = course(t);
  const before = currentReviewsAt(c.root, c.r(), c.units());
  assert.ok(before.size > 50, `${before.size} current reviews in the fixture`);
  const owed = () => c.core().filter((f) => ["link-review-owed", "framing-review-owed"].includes(f.kind));
  assert.deepEqual(kinds(owed()), []);
  // the round-1 F13 light edit, glance-confirmed: nothing to review again (no word changed — markup and a comma; since
  // round 2 coherence F4 a changed word is substantive)
  c.edit(MAP, "1. Le Chatelier's principle states that a system at equilibrium disturbed by", "1. Le Chatelier's principle states that a *system at equilibrium*, disturbed by");
  const rec = recordApproval(c.root, c.r(), manifestChapters(c.r()), { chapter: "le-chatelier", glance: true, instructorWords: "Fine, a wording fix." }, I);
  assert.equal(rec.type, "glance-confirmation");
  assert.equal(currentReviewsAt(c.root, c.r(), c.units()).size, before.size);
  assert.deepEqual(kinds(owed()), []);
  // a new review recorded now (against the reworded text) is current too
  const someUnit = c.units().find((u) => u.locator.deliverable === SG && (u.spineNodes || []).includes("concept.le-chatelier.principle-statement"));
  await reviewAlignment(c.root, c.r(), { verifier: reviewer().verifier, only: [someUnit.id] });
  assert.ok(currentReviewsAt(c.root, c.r(), c.units()).has(someUnit.id));
  // a substantive change of one plan item, fully approved: the reviews that judged it are no longer current, and the
  // link reviews of units that never judged it stay current (reviews recorded with the round-2 basis; the fixture's
  // older records are bound to the whole plan, so any substantive change voids them — never more lenient)
  const d = course(t);
  const all0 = d.units(), lc = all0.filter((u) => /\/le-chatelier\.md$/.test(u.locator.deliverable));
  const linkedBy = (id) => lc.filter((u) => u.role === "teaching" && (u.spineNodes || []).includes(id));
  const ID = [...planOf(d.r()).nodes.values()].filter((n) => n.chapter === "le-chatelier" && n.kind === "concept").map((n) => n.id).find((id) => linkedBy(id).length >= 2);
  const judging = linkedBy(ID).slice(0, 2);
  const other = lc.filter((u) => u.role === "teaching" && (u.spineNodes || []).length && !u.spineNodes.includes(ID)).slice(0, 2);
  const framing = lc.filter((u) => u.role === "framing").slice(0, 1);
  assert.ok(ID && judging.length === 2 && other.length === 2 && framing.length === 1, `${ID} ${judging.length} ${other.length} ${framing.length}`);
  const ids = [...judging, ...other, ...framing].map((u) => u.id);
  await reviewAlignment(d.root, d.r(), { verifier: reviewer().verifier, only: ids });
  assert.ok(ids.every((id) => currentReviewsAt(d.root, d.r(), d.units()).has(id)));
  const was = planOf(d.r()).nodes.get(ID).text;
  d.edit(MAP, was, `${was.replace(/\.$/, "")}, but never at constant pressure.`); // a negation: a substantive change
  recordApproval(d.root, d.r(), manifestChapters(d.r()), { chapter: "le-chatelier", instructorWords: "Approved." }, I);
  const now = currentReviewsAt(d.root, d.r(), d.units());
  assert.ok(judging.every((u) => !now.has(u.id)), "judged the changed item: review again");
  assert.ok(other.every((u) => now.has(u.id)), "never judged it: still current");
  assert.ok(framing.every((u) => !now.has(u.id)), "framing judges the whole plan");
});
