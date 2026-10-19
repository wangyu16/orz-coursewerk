// 3C red team, round 5: fixed-vocabulary readers (studies/p11/redteam-r5/control c1-01, c1-02, c3-01; coherence f1,
// f6, 2026-10-08). Each finding is a test case of a root cause; each cause also gets variants built here.
// Root causes fixed:
//   A. visibility and edges were read with a fixed vocabulary that fails silently.
//      - What a slide shows is now orz-slides' OWN call: its parser (parseDeck) splits the regions and its renderer
//        decides which reach the slide. A region named outside the layout (any name the frame accepts: `@Aside`,
//        `@x_y`, `@1x`) and anything but `body` on a template slide print nothing; a unit read there is content-hidden.
//        D52 (orz-slides 1.0): the frame's PUBLIC parser is read (parseDeck, scanMarkers: its spans, its token scanner);
//        a repeated region name is no longer dropped — 1.0 joins the chunks and reports its own lint error
//        (duplicate-region / region-twice), which the notation check makes a blocking defect.
//      - A table row is compared with what markdown-it renders of it: a cell beyond the header's column count is
//        dropped by the frame, so the row is content-hidden.
//      - A figure and the prose that names it ("the diagram", "Figure 2", a visual description) are linked both ways.
//      - A multi-word key term is also used by its distinctive word alone ("is exothermic"), in the chapter that
//        defines it and in any chapter that uses it by its full name.
//   B. scope was decided by a label: a table header is structure only when the whole ROW is label-sized; every label
//      that prints (deck title, `#`/`##` headings, a table header, a spoil or tab label) is shown in the link and
//      knowledge review prompts of the content it heads, and a link review is bound to the labels it was shown (a
//      review from before round 5 stands while the labels are those of the label baseline the first round-5 session
//      logs).
// Offline and deterministic: every blind review is a replayed test double.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader, manifestChapters } from "../scripts/lib/core/package_reader.mjs";
import { coreObligations, indexAndStamp, linkUnits, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { isLabel, segmentDeliverable } from "../scripts/lib/core/segment.mjs";
import { printedModel, slideRegionsShown, unrenderedText } from "../scripts/lib/core/printed.mjs";
import { parseDeck, scanMarkers } from "orz-slides";
import { hiddenInText, uncheckedShippedFindings } from "../scripts/lib/core/shipped.mjs";
import { checkSlidesNotation, frameworkDefinitions } from "../scripts/lib/core/notations.mjs";
import { dependencyEdges, figuresNamedBy, namesFigure, sourceHashes, termDefinitions, termHeadWords, termMatcher } from "../scripts/lib/core/dependencies.mjs";
import { parseSpine } from "../scripts/lib/core/spine.mjs";
import { approvalPrecondition, reviewSpineChanges } from "../scripts/lib/core/spine_review.mjs";
import { recordApproval } from "../scripts/lib/core/approvals.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { verifyKnowledge } from "../scripts/lib/verify/verdicts.mjs";
import { currentReviewsAt, reviewAlignment } from "../scripts/lib/verify/alignment.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const SG1 = "study-guide/chemical-equilibrium.md", SL1 = "slides/chemical-equilibrium.md", SG2 = "study-guide/le-chatelier.md", PR2 = "practice/le-chatelier.md", MAP2 = "concepts/le-chatelier.md";
const OBJ5 = "objective.le-chatelier.explain-inert-and-catalyst";
const ELECTRO = /galvanic|salt bridge|anode|cathode/i;
const gitIn = (root, ...a) => spawnSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { encoding: "utf8", maxBuffer: 1 << 30 });
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];
const declaredOf = (pr) => (pr.split("\nDECLARED ITEMS\n")[1] || "").split("\n\n")[0].split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
const labelsOf = (pr) => (pr.split("\nHEADINGS AND LABELS PRINTED OVER THE PASSAGE (part of what the student reads with it)\n")[1] || "").split("\n\n")[0];

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r5vis-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  gitIn(root, "init", "-q", "-b", "main"); gitIn(root, "add", "-A"); gitIn(root, "commit", "-qm", "baseline");
  const c = {
    root, r: () => liveReader(root),
    units: () => loadUnits(root, liveReader(root)),
    unit: (rel, start) => loadUnits(root, liveReader(root)).find((u) => u.locator.deliverable === rel && u.text.startsWith(start)),
    read: (rel) => fs.readFileSync(path.join(root, rel), "utf8"),
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 50)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent: (fn) => { beginSession(root, liveReader(root), AGENT); fn(); return indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    link: (map) => linkUnits(root, liveReader(root), map, AGENT),
    owed: () => coreObligations(root, liveReader(root), "r5"),
    hidden: () => uncheckedShippedFindings(root, liveReader(root), "r5").filter((f) => f.kind === "content-hidden").map((f) => f.evidence.detail),
    reviewed: () => new Set(currentReviewsAt(root, liveReader(root), loadUnits(root, liveReader(root))).keys()),
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
  c.reviewOwed = () => new Set(c.owed().filter((f) => f.kind === "link-review-owed" || f.kind === "framing-review-owed").flatMap((f) => f.units));
  return c;
}
/** A replayed link reviewer (test double) that reads the WHOLE prompt — labels included — and calls anything about
 *  electrochemistry off the plan; every declared link "yes", every guide entry "matches". */
function honest(needle = ELECTRO) {
  const seen = [];
  const verifier = replayVerifier((pr) => {
    seen.push(pr);
    const gids = [...pr.matchAll(/^- (guide\.\S+): /gm)].map((m) => m[1]), one = /its assessment guide entry asks for/.test(pr), fid = { type: "matches", level: "matches", why: "test double" };
    const passage = pr.split(/\nPASSAGE(?: \([^)]*\))?\n/).pop();
    return { nonce: nonceOf(pr), links: declaredOf(pr).map((id) => ({ id, verdict: "yes", why: "test double" })), also: [], offPlan: needle.test(passage) || needle.test(labelsOf(pr)),
      ...(one ? { fidelity: fid } : gids.length ? { fidelity: gids.map((id) => ({ id, ...fid })) } : {}) };
  });
  return { seen, verifier };
}

// ============================================ A. visibility: orz-slides decides =====================================
test("[req.control.visible-by-frame-render] C1-01 (slides; D52: orz-slides 1.0 joins a repeated region and calls it an error): a second, empty `<!-- @body -->` no longer empties the slide — nothing is hidden, and the frame's own lint makes each repeat a blocking notation defect", async (t) => {
  const c = course(t);
  const before = new Map(c.units().filter((u) => u.locator.deliverable === SL1).map((u) => [u.id, u.text]));
  assert.deepEqual(c.hidden(), [], "the fixture hides nothing");
  c.edit(SL1, "In dilute aqueous solution the solvent water is treated the same way.\n", "In dilute aqueous solution the solvent water is treated the same way.\n<!-- @body -->\n");
  c.edit(SL1, "only temperature changes $K$.\n\n<!-- slide template=closing -->", "only temperature changes $K$.\n<!-- @body -->\n\n<!-- slide template=closing -->");
  assert.deepEqual(c.units().filter((u) => u.locator.deliverable === SL1).map((u) => [u.id, u.text]), [...before], "no unit's text changed");
  // the 0.x frame kept only the last chunk (the attack hid the slide); 1.0 joins them in order, so every unit prints
  const deck = parseDeck(c.read(SL1));
  assert.ok(deck.slides.some((s) => /activity of one/.test(s.regions.find((r) => r.name === "body")?.markdown ?? "")), "orz-slides 1.0 shows the first chunk");
  assert.deepEqual(c.hidden(), [], "so nothing is hidden");
  // … and calls the repeat an error of its own: the notation check (the frame's readDocument) makes each a defect
  const notation = checkSlidesNotation(c.read(SL1), await frameworkDefinitions());
  assert.ok(notation.filter((p) => !p.aspect && /\[(?:region-twice|duplicate-region)\]/.test(p.issue)).length >= 2, JSON.stringify(notation));
});

test("[req.control.visible-by-frame-render] C1-02: a region named outside the old check's pattern (`@Aside`, `@x_y`, `@1x`) is dropped by orz-slides — its units are content-hidden and the notation check, now on the frame's own parser, reports it", async (t) => {
  const c = course(t), d = await frameworkDefinitions();
  for (const name of ["Aside", "x_y", "1x"]) {
    const deck = c.read(SL1).replace("## Pure solids and pure liquids\n", `## Pure solids and pure liquids\n<!-- @${name} -->\n`);
    const hidden = hiddenInText(deck, SL1).map((h) => h.what);
    assert.ok(hidden.some((h) => /activity of one/.test(h) && new RegExp(`no region "${name}"`).test(h)), `@${name}: ${hidden.join("\n")}`);
    assert.ok(checkSlidesNotation(deck, d).some((p) => !p.aspect && p.issue.includes(`the layout has no region "${name}"`) && /\[unknown-region\]/.test(p.issue)), `@${name} is checked`);
    // ONE marker reading: the harness locates regions by the frame's own token scanner (scanMarkers), so every region
    // the frame reads is one the harness routes
    const k = deck.split("\n").indexOf(`<!-- @${name} -->`);
    assert.ok(scanMarkers(deck).some((m) => m.type === "region" && m.name === name && m.span.line === k + 1), `the frame reads @${name}`);
    assert.ok(slideRegionsShown(deck).some((r) => r.name === name && r.lines.includes(k + 1) && !r.shown), `the harness routes @${name}`);
  }
  // and a marker the frame does NOT read (inside a code block) is no region for the harness either
  const fenced = c.read(SL1).replace("## Pure solids and pure liquids\n", "## Pure solids and pure liquids\n```\n<!-- @aside -->\n```\n");
  assert.ok(!slideRegionsShown(fenced).some((r) => r.name === "aside"));
});

test("[req.control.visible-by-frame-render] variants: anything but `body` on a template slide, a third region on a 2col slide are dropped; regions the layout has, a float, per-slide footers and repeated notes behave as the frame renders them", async () => {
  const d = await frameworkDefinitions();
  const deck = [
    "{{nyml", "kind: document", "carrier: slides", "}}", "",
    "<!-- slide template=section -->", "# Part one", "<!-- @left -->", "Galvanic cells oxidize at the anode.", "",
    "<!-- slide 2col -->", "## Two sides", "<!-- @left -->", "Left side teaching.", "<!-- @right -->", "Right side teaching.", "<!-- @main -->", "Main region teaching.", "",
    "<!-- slide -->", "## Footers", "Body text.", "<!-- @footer -->", "First footer words.", "<!-- @footer -->", "Second footer words.", "<!-- @float left=50% top=10% -->", "A floating note.", "",
    "<!-- slide -->", "## Notes twice", "Shown body.", "<!-- @notes -->", "First notes.", "<!-- @notes -->", "Second notes.", "",
  ].join("\n");
  const shown = (needle) => slideRegionsShown(deck).find((r) => r.lines.some((k) => deck.split("\n")[k].includes(needle)));
  assert.equal(shown("Galvanic").shown, false); assert.match(shown("Galvanic").why, /template slide shows only its body/);
  assert.equal(shown("Left side").shown, true); assert.equal(shown("Right side").shown, true);
  assert.equal(shown("Main region").shown, false); assert.match(shown("Main region").why, /no region "main"/);
  // orz-slides 1.0 joins a repeated @footer (both print) and reports it (D52)
  assert.equal(shown("First footer").shown, true); assert.equal(shown("Second footer").shown, true);
  assert.match(parseDeck(deck).slides[2].footer, /First footer words\.\n\nSecond footer words\./);
  assert.equal(shown("A floating note").shown, true);
  assert.equal(shown("First notes").notes, true); assert.equal(shown("Second notes").notes, true);
  const hidden = hiddenInText(deck, "slides/x.md").map((h) => h.what).join("\n");
  for (const t of ["Galvanic cells", "Main region"]) assert.match(hidden, new RegExp(t));
  for (const t of ["Left side", "Right side", "First footer", "Second footer", "floating", "notes", "Shown body"]) assert.doesNotMatch(hidden, new RegExp(t));
  const m = printedModel(deck, { frame: "slides" }), L = deck.split("\n");
  assert.ok(L.map((l, k) => [l, k]).filter(([l]) => /notes\.$/.test(l)).every(([, k]) => m.notes.has(k) && !m.printed.has(k)), "both notes chunks are notes");
  assert.ok(!segmentDeliverable(deck, "slides/x.md").units.some((u) => /notes\./.test(u.text)), "notes are no unit");
  const issues = checkSlidesNotation(deck, d).filter((p) => !p.aspect).map((p) => p.issue).join("\n");
  assert.match(issues, /a template slide has one region, body[^\n]*"@left" is not shown \[unknown-region\]/);
  assert.match(issues, /the layout has no region "main"[^\n]*\[unknown-region\]/);
  assert.match(issues, /the slide footer \(@footer\) is marked twice[^\n]*\[duplicate-region\]/);
  assert.match(issues, /speaker notes \(@notes\) are marked twice[^\n]*\[duplicate-region\]/, "1.0 calls repeated notes an error too");
  // the fixture's own decks: nothing is reported hidden, and their notation is clean. (orz-slides 1.0's section template
  // renders a `##` under the `#` as the section's subtitle: it prints, a label over the section — no unit)
  for (const rel of ["slides/chemical-equilibrium.md", "slides/le-chatelier.md", SG1, SG2, "practice/chemical-equilibrium.md", PR2]) {
    const text = fs.readFileSync(path.join(C2, rel), "utf8");
    assert.deepEqual(hiddenInText(text, rel), [], rel);
    if (rel.startsWith("slides/")) assert.deepEqual(checkSlidesNotation(text, d).filter((p) => !p.aspect), [], rel);
  }
  const sec = fs.readFileSync(path.join(C2, SL1), "utf8"), k = sec.split("\n").indexOf("## Dynamic equilibrium");
  assert.ok(k > 0 && printedModel(sec, { frame: "slides" }).printed.has(k), "the section slide's ## prints");
  assert.ok(!segmentDeliverable(sec, SL1).units.some((u) => u.text === "## Dynamic equilibrium"), "a label, no unit");
});

// ============================================ A. visibility: markdown-it's table =====================================
test("[req.control.visible-by-frame-render] C1-01 (study guide): teaching put in a table cell beyond the header's columns is dropped by the frame — the row is content-hidden; rows that fit, escaped pipes and empty cells are not", async (t) => {
  const c = course(t);
  const para = c.read(SG1).split("\n").find((l) => l.startsWith("The concentration terms in $K$ are strictly"));
  c.asAgent(() => c.edit(SG1, `${para}\n`, `| Term | Note |\n|---|---|\n| Activity | | ${para} |\n`));
  const hidden = c.hidden();
  assert.ok(hidden.some((h) => /a table row with more cells than its header: the frame drops "The concentration terms/.test(h)), hidden.join("\n"));
  // what the frame renders: the dropped words are in no rendered cell
  assert.equal(unrenderedText(`| Activity | | ${para} |`, ["Activity", ""]).startsWith("The concentration terms"), true);
  // benign: a row that fits, an escaped pipe inside a cell, an empty cell, a row with fewer cells, a table in a quote
  const ok = "| A | B |\n|---|---|\n| x \\| y | z |\n| only one |\n|  | z |\n\n> | Q | R |\n> |---|---|\n> | 1 | 2 |\n";
  assert.deepEqual(printedModel(ok).hidden, []);
  assert.deepEqual(printedModel("| A | B |\n|---|---|\n| 1 | 2 | lesson |\n").hidden.map((h) => h.line), [3]);
});

// ============================================ B. labels: the whole set, shown and bound ==============================
test("[req.control.labels-reviewed] C3-01: a header of four 12-word 'labels' is no label — the row is a unit the link review reads; a label-sized header row stays structure and is shown in every row's review prompt, where an honest reviewer calls it off the plan", async (t) => {
  const c = course(t), old = new Set(c.units().map((u) => u.id));
  const header = ["A galvanic cell turns a redox reaction into an electric current", "Oxidation happens at the anode and reduction at the cathode", "The salt bridge keeps both half-cells electrically neutral", "Cell potential equals cathode potential minus anode potential"];
  assert.ok(header.every(isLabel) && !isLabel(header.join(" ")), "each cell is label-sized; the row is not");
  const at = "This is the same catalyst result met in Chapter 1, now seen from the Le Chatelier side.\n";
  c.asAgent(() => c.edit(SG2, at, `${at}\n| ${header.join(" | ")} |\n|---|---|---|---|\n| A catalyst | no shift | same factor both ways | position unchanged |\n`));
  const added = c.units().filter((u) => !old.has(u.id));
  assert.equal(added.length, 2, added.map((u) => u.text).join(" / "));
  assert.ok(added.some((u) => u.text.includes("galvanic cell")), "the header row is a unit");
  c.link(Object.fromEntries(added.map((u) => [u.id, [OBJ5]])));
  const rev = honest();
  const res = await reviewAlignment(c.root, c.r(), { verifier: rev.verifier, only: added.map((u) => u.id) });
  assert.ok(res.some((x) => x.offPlan === true), "the diligent review reads the lesson and calls it off the plan");

  // a label-sized header ROW: structure, shown with its row
  const d = course(t), old2 = new Set(d.units().map((u) => u.id));
  d.asAgent(() => d.edit(SG2, at, `${at}\n| Galvanic cell | Anode oxidizes | Cathode reduces |\n|---|---|---|\n| A catalyst | no shift | same factor |\n`));
  const row = d.units().filter((u) => !old2.has(u.id));
  assert.equal(row.length, 1);
  assert.deepEqual(row[0].headings, ["# Le Chatelier's Principle", "## Adding a catalyst", "table header: | Galvanic cell | Anode oxidizes | Cathode reduces |"]);
  d.link({ [row[0].id]: [OBJ5] });
  const rev2 = honest();
  const [r2] = await reviewAlignment(d.root, d.r(), { verifier: rev2.verifier, only: [row[0].id] });
  assert.match(labelsOf(rev2.seen[0]), /table header: \| Galvanic cell \| Anode oxidizes \| Cathode reduces \|/);
  assert.equal(r2.offPlan, true, "the reviewer judged the label with the row");
  let kp = ""; await verifyKnowledge(d.root, d.r(), { only: [row[0].id], verifier: replayVerifier((pr) => { kp = pr; return { nonce: nonceOf(pr), concerns: [] }; }) });
  assert.match(kp, /HEADINGS AND LABELS PRINTED OVER THE PASSAGE \(context only\)\n- # Le Chatelier's Principle\n- ## Adding a catalyst\n- table header: \| Galvanic cell/);
});

test("[req.control.labels-reviewed] variants: a `##` heading rewritten to an off-plan label voids the link reviews of the section it heads (pre-round-5 reviews stand only under the label baseline); a spoil label is shown with its body; a session with no edit keeps every review", async (t) => {
  const c = course(t);
  const before = c.reviewed();
  assert.ok(before.size > 50, `the fixture's link reviews are current (${before.size})`);
  const CAT = c.unit(SG2, "A catalyst speeds up a reaction without being consumed").id;
  assert.ok(before.has(CAT));
  // a session that edits nothing logs the label baseline and keeps every review current
  beginSession(c.root, c.r(), AGENT); indexAndStamp(c.root, c.r(), { as: "agent", party: AGENT });
  assert.deepEqual([...c.reviewed()].sort(), [...before].sort(), "no review lost to the migration");
  // the catalyst paragraph made the only verified cover of its objective (the others unlinked from it), so the gate
  // relies on its review (D41)
  const others = c.units().filter((u) => u.id !== CAT && /^(study-guide|slides)\//.test(u.locator.deliverable) && (u.spineNodes || []).includes(OBJ5));
  assert.ok((c.unit(SG2, "A catalyst speeds up a reaction without being consumed").spineNodes || []).includes(OBJ5));
  c.link(Object.fromEntries(others.map((u) => [u.id, u.spineNodes.filter((n) => n !== OBJ5)])));
  assert.ok(!c.reviewOwed().has(CAT), "its pre-round-5 review covers the objective");
  // a label-sized heading, now off the plan, over a unit whose text did not change
  c.asAgent(() => c.edit(SG2, "## Adding a catalyst\n", "## Galvanic cells oxidize at the anode\n"));
  assert.equal(c.unit(SG2, "A catalyst speeds up a reaction without being consumed").id, CAT, "the unit is unchanged");
  assert.ok(!c.reviewed().has(CAT), "its review was shown another heading: it is no longer current");
  assert.ok(c.reviewOwed().has(CAT), "a link review is owed");
  const rev = honest();
  const [r] = await reviewAlignment(c.root, c.r(), { verifier: rev.verifier, only: [CAT] });
  assert.match(labelsOf(rev.seen[0]), /## Galvanic cells oxidize at the anode/);
  assert.equal(r.offPlan, true);
  assert.ok(c.reviewed().has(CAT), "the new review, shown the heading, is current");

  // a spoil label over a body: shown with it
  const d = course(t), old = new Set(d.units().map((u) => u.id));
  const at = "This is the same catalyst result met in Chapter 1, now seen from the Le Chatelier side.\n";
  d.asAgent(() => d.edit(SG2, at, `${at}\n::: spoil The salt bridge keeps both half-cells neutral\nA catalyst leaves the equilibrium position unchanged.\n:::\n`));
  const body = d.units().find((u) => !old.has(u.id));
  assert.deepEqual(body.headings.at(-1), "label: The salt bridge keeps both half-cells neutral");
  d.link({ [body.id]: [OBJ5] });
  const rev2 = honest();
  const [r2] = await reviewAlignment(d.root, d.r(), { verifier: rev2.verifier, only: [body.id] });
  assert.equal(r2.offPlan, true, "the reviewer saw the label");
});

// ============================================ A. edges: figures ======================================================
test("[req.coherence.figure-edges] F1: a figure and the text that names it are linked both ways — redrawing the flowchart's inert-gas branch makes its Visual description owe a re-check that is shown the new figure; editing the description makes the figure owe", async (t) => {
  const c = course(t);
  const FIG = c.unit(SG2, "{{mermaid}}").id, DESC = c.unit(SG2, "**Visual description:** The diagram sorts the five disturbances").id;
  c.asAgent(() => c.edit(SG2, `    B -->|"Inert gas, const. V"| F["No shift"]`, `    B -->|"Inert gas, const. P"| I["Shifts toward more moles of gas"]`));
  assert.equal(c.unit(SG2, "{{mermaid}}").id, FIG);
  assert.ok(c.reverifyOwed().has(DESC), "the description owes a re-check");
  let shown = "";
  await verifyKnowledge(c.root, c.r(), { only: [DESC], verifier: replayVerifier((pr) => { shown = pr; return { nonce: nonceOf(pr), concerns: [] }; }) });
  assert.match(shown, /WHAT CHANGED SINCE THE PASSAGE WAS LAST CHECKED[\s\S]*Inert gas, const\. P/);
  const d = course(t);
  d.asAgent(() => d.edit(SG2, "The last two branches, an inert gas added at constant", "The last two branches, an inert gas added at constant pressure (no: volume) and"));
  assert.ok(d.reverifyOwed().has(FIG), "the figure owes when its description changes");
});

test("[req.coherence.figure-edges] variants: \"Figure N\" names the deliverable's Nth figure in any section; \"the image above\" with no figure in its section reaches the nearest figure before it; prose that names no figure, and a figure itself, add nothing", () => {
  const at = (id, form, section, ordinal, text) => ({ id, form, text, locator: { deliverable: "study-guide/x.md", section, ordinal } });
  const units = [
    at("f1", "figure", "s1", 0, "![Energy profile of the reaction](energy.png)"),
    at("p1", "paragraph", "s1", 1, "The reaction is exothermic."),
    at("f2", "figure", "s2", 2, "{{mermaid}}\nflowchart TD\n A --> B\n{{/mermaid}}"),
    at("p2", "paragraph", "s3", 3, "As **Figure 1** shows, the products lie lower in energy."),
    at("p3", "paragraph", "s3", 4, "In the image above, B follows A."),
    at("p4", "paragraph", "s3", 5, "The products lie lower in energy."),
    at("p5", "paragraph", "s1", 6, "*Alt text:* an energy profile."),
  ];
  const ids = (u) => figuresNamedBy(units, u).map((v) => v.id).sort();
  assert.deepEqual(ids(units[3]), ["f1", "f2"], "Figure 1 → the first figure (and the nearest before, its section having none)");
  assert.deepEqual(ids(units[4]), ["f2"]);
  assert.deepEqual(ids(units[5]), []);
  assert.deepEqual(ids(units[6]), ["f1"]);
  assert.deepEqual(ids(units[0]), []);
  for (const s of ["the diagram", "This chart", "the graph below", "Fig. 2", "figure 3", "visual description", "the energy diagram"]) assert.ok(namesFigure(s), s);
  for (const s of ["the reaction", "a configuration", "figured out", "the structure of the argument"]) assert.ok(!namesFigure(s), s);
});

// ============================================ A. edges: a term's distinctive word ===================================
test("[req.coherence.term-head-word] F6: \"is exothermic\", \"**Exothermic** —\", \"the exothermic ammonia synthesis\" use the key term \"exothermic reaction\" — redefining it and approving in full makes all of them owe, with the full-label users", async (t) => {
  const c = course(t), r = c.r(), sp = parseSpine(r, manifestChapters(r));
  const term = sp.chapters["le-chatelier"].map.terms.find((x) => x.label === "exothermic reaction"), uses = termMatcher(term);
  const headOnly = c.units().filter((u) => u.role === "teaching" && /\bexothermic\b/i.test(u.text) && !uses(u.text)).map((u) => u.id);
  assert.equal(headOnly.length, 5, headOnly.join(", "));
  const edges = dependencyEdges(c.units(), sp, sourceHashes(r));
  for (const id of headOnly) assert.ok(edges.get(id).some((e) => e.target === "term:le-chatelier:exothermic reaction"), `${id} depends on the term`);
  c.edit(MAP2, "- **exothermic reaction** — a reaction that releases heat (negative reaction enthalpy), so heat behaves as a product",
    "- **exothermic reaction** — a reaction that gives out heat to its surroundings at constant pressure (negative reaction enthalpy, $\\Delta H < 0$), so heat is written on the product side");
  await c.approveChanged("le-chatelier", "Approved: the fuller definition.");
  const owed = c.reverifyOwed();
  assert.deepEqual(headOnly.filter((id) => !owed.has(id)), [], "every head-word user is found");
});

test("[req.coherence.term-head-word] variants: only a modifier no other key term shares is distinctive (never \"reaction\", \"equilibrium\"); \"Argon is inert\" uses \"inert gas\"; a chapter that never names the term in full is not reached by its word alone", async (t) => {
  const c = course(t), r = c.r(), sp = parseSpine(r, manifestChapters(r)), defs = termDefinitions(sp);
  const words = Object.fromEntries(defs.map((d) => [`${d.scope}:${d.term.label}`, termHeadWords(d, defs)]));
  assert.deepEqual(words["le-chatelier:exothermic reaction"], ["exothermic"]);
  assert.deepEqual(words["le-chatelier:inert gas"], ["inert", "noble"]);
  assert.deepEqual(words["chemical-equilibrium:equilibrium constant"], []);
  assert.deepEqual(words["chemical-equilibrium:reaction quotient"], []);
  assert.deepEqual(words["le-chatelier:equilibrium shift"], []);
  assert.deepEqual(words["chemical-equilibrium:catalyst"], []);
  const A12 = c.unit(PR2, "It does not shift. Argon is inert").id;
  // a chemical-equilibrium paragraph that says "inert" (that chapter never writes "inert gas")
  const CE = c.unit(SG1, "A **catalyst** speeds up").id;
  c.asAgent(() => c.edit(SG1, "A **catalyst** speeds up", "Argon is inert. A **catalyst** speeds up"));
  const CE2 = c.units().find((u) => u.locator.deliverable === SG1 && u.text.startsWith("Argon is inert.")).id;
  assert.equal(CE2, CE);
  const edges = dependencyEdges(c.units(), parseSpine(c.r(), manifestChapters(c.r())), sourceHashes(c.r()));
  assert.ok(edges.get(A12).some((e) => e.target === "term:le-chatelier:inert gas"), "Answer 12 uses the term");
  assert.ok(!edges.get(CE2).some((e) => e.target === "term:le-chatelier:inert gas"), "another chapter's bare word is not reached");
  c.edit(MAP2, "- **inert gas** (noble gas) — a gas that does not react and, added at constant volume, does not shift a gas-phase equilibrium",
    "- **inert gas** (noble gas) — a gas that takes no part in the reaction; added at constant volume it changes no partial pressure, so it does not shift a gas-phase equilibrium");
  await c.approveChanged("le-chatelier", "Approved.");
  assert.ok(c.reverifyOwed().has(A12), "Answer 12 owes");
});

test("[req.coherence.term-head-word] [req.coherence.figure-edges] cost: on the C2 fixture the new readers add 22 edges to 820 — 18 key-term edges by a distinctive word and 4 figure edges (two figures, each with its description, both ways) — and remove none", (t) => {
  const r = liveReader(C2), sp = parseSpine(r, manifestChapters(r)), units = loadUnits(C2, r), defs = termDefinitions(sp);
  const edges = dependencyEdges(units, sp, sourceHashes(r));
  const all = [...edges.values()].flat().length;
  const figure = [...edges.values()].flat().filter((e) => e.kind === "figure").length;
  const byWord = units.flatMap((u) => edges.get(u.id).filter((e) => e.target.startsWith("term:") && !termMatcher(defs.find((d) => d.key === e.target).term)(u.text)));
  assert.equal(figure, 4);
  assert.equal(byWord.length, 18);
  assert.equal(all, 842);
});
