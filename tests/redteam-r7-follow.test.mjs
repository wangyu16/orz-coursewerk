// 3C RED TEAM, ROUND 7 — COHERENCE (H-01, H-02, H-03): ONE root cause, fixed at the cause (operator rules D46, D50),
// probed here on the real course (tests/fixtures/c2-chemistry-v2) with new variants.
// Record of the round: the red team's REPORT.md (P11 study, redteam-r7/coherence).
//
// The cause: obligations did not follow the text continuously. A version's scope, what a retired unit owed and where a
// value went were each computed once — at a moment (the version's opening) or for a narrow set (the target's own
// section, NEW units only) — so a later or neighbouring move escaped them. The principle of the fix: obligations follow
// the text, at all times.
//   1. A version's scope is continuous (core/version_scope.mjs). Every unit now in an open version's scope was carried
//      into it, or re-verified since it opened; a unit that enters later is carried the moment the index, a relink or
//      reconcile sees it, and the gate and every approval hold the rule itself ..... [req.coherence.version-scope-continuous]
//      H-01  a quote-verified chapter-1 misconception moved into chapter 2 after version 2 opened was never carried
//      variants  a relink into the scope; a `chapters` entry added to DOCUMENTS.json by hand (the gate and the approval
//                hold it; reconcile carries it); a unit first written in the version is no entrant
//   2. A value's successors are found package-wide (core/obligations.mjs valueSuccessors). By symbol family and unit,
//      anywhere in the package, the nearest first and capped; a value that left its target with no successor anywhere
//      makes the target unshowable — only the instructor's confirmation clears it (D49) ...... [req.coherence.value-successors-wide]
//      H-02  ΔH moved one section away: the re-checks never saw the new value, and the search failed open
//      variants  a value moved to another deliverable; a value removed entirely; the cap, nearest first
//   3. Inheritance includes kept units (core/units_index.mjs). A unit — kept or new — that absorbs a retired unit's
//      words, values or equations (measured on the reader view, numbers and symbols as tokens) inherits what it owed,
//      its carry and its stale stamp, and its lineage records the absorption ............... [req.coherence.absorbed-inherits]
//      H-03  an equation inlined into the kept sentence before it retired with its debt
//      variants  a kept unit absorbing a carried unit is carried, through the log
// Offline and deterministic: every blind review is a replayed test double.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader, manifestChapters } from "../scripts/lib/core/package_reader.mjs";
import { MAX_SUCCESSORS, confirmUnits, coreObligations, indexAndStamp, linkUnits, loadUnits, openVersionCarrying, recheckShown, reverifyUnits } from "../scripts/lib/core/obligations.mjs";
import { absorptionTokens, beginSession } from "../scripts/lib/core/units_index.mjs";
import { logRecordFindings, reconcileUnitRecords } from "../scripts/lib/core/reconcile.mjs";
import { versionScopeGaps } from "../scripts/lib/core/version_scope.mjs";
import { approvalPrecondition } from "../scripts/lib/core/spine_review.mjs";
import { recordApproval } from "../scripts/lib/core/approvals.mjs";
import { parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { verifyKnowledge } from "../scripts/lib/verify/verdicts.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const SG = "study-guide/le-chatelier.md", SG1 = "study-guide/chemical-equilibrium.md", SCOPE = "chapter:le-chatelier";
const EQ = "u-study-guide-le-chatelier-changing-the-temperature-5", INTRO = "u-study-guide-le-chatelier-changing-the-temperature-4";
const WE1 = "u-study-guide-le-chatelier-worked-examples-1", SOL1 = "u-study-guide-le-chatelier-worked-examples-2";
const EQ_TEXT = "$$\\ce{N2(g) + 3 H2(g) <=> 2 NH3(g)} \\qquad \\Delta H = -92\\ \\text{kJ mol}^{-1}$$";
const BARE_EQ = "$$\\ce{N2(g) + 3 H2(g) <=> 2 NH3(g)}$$";
const INTRO_TEXT = "Take the Haber synthesis of ammonia, which is exothermic:";
const OPEN_V2 = { scopes: [SCOPE], reason: "objective 3 is split into a qualitative and a quantitative objective", instructorWords: "Open version 2 of chapter 2." };
const MISCONCEPTION = "- **\"Changing a concentration changes $K$.\"** No — only temperature changes $K$; a concentration change moves $Q_r$ and the system re-shifts back to the same $K$.";
const NEW_VALUE = "Our running example is the Haber synthesis of ammonia, whose standard reaction enthalpy is $\\Delta H = -92.4\\ \\text{kJ mol}^{-1}$.";

function course(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-r7-follow-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  return {
    root, r: () => liveReader(root),
    units: () => loadUnits(root, liveReader(root)),
    unit: (id) => loadUnits(root, liveReader(root)).find((u) => u.id === id),
    find: (pred) => loadUnits(root, liveReader(root)).find(pred),
    read: (rel) => fs.readFileSync(path.join(root, rel), "utf8"),
    write: (rel, s) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), s); },
    edit: (rel, from, to) => { const f = path.join(root, rel), s = fs.readFileSync(f, "utf8"); assert.equal(s.split(from).length, 2, `unique: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, () => to)); },
    asAgent(fn) { beginSession(root, liveReader(root), AGENT); fn(); return indexAndStamp(root, liveReader(root), { as: "agent", party: AGENT }); },
    log: () => parseLog(readLogText(root)),
    ob: (kinds) => coreObligations(root, liveReader(root), "t").filter((f) => !kinds || kinds.includes(f.kind)),
    owing: (kinds = ["reverify", "carried-unverified"]) => [...new Set(coreObligations(root, liveReader(root), "t").filter((f) => kinds.includes(f.kind)).flatMap((f) => f.units))],
  };
}
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];
const review = (flag = () => []) => replayVerifier((pr) => ({ nonce: nonceOf(pr), concerns: flag(pr) }));
/** An honest reviewer: it objects when it can see the two enthalpies for one reaction. */
const honest = (seen = []) => review((pr) => { seen.push(pr); return /92\.4/.test(pr) && /-92\\ /.test(pr) ? [{ kind: "wrong", text: "-92", problem: "the guide states -92.4 kJ/mol for this reaction elsewhere", suggestion: "-92.4" }] : []; });
const harnessCarries = (c) => c.log().filter((r) => r.type === "revision" && r.payload?.event === "units-carried" && r.party?.role === "harness" && r.payload.entered === true);

// ============================================ 1. A VERSION'S SCOPE IS CONTINUOUS ================================
test("[req.coherence.version-scope-continuous] R7 H-01: a verified chapter-1 unit moved into chapter 2 after version 2 opened is carried into version 2 when it enters, through the log", (t) => {
  const c = course(t);
  const before = c.find((u) => u.locator.deliverable === SG1 && u.text === MISCONCEPTION);
  assert.ok(before, "the chapter-1 misconception is indexed");
  openVersionCarrying(c.root, c.r(), OPEN_V2, I);
  assert.ok(!c.unit(before.id).carried, "outside the scope when the version opened: not carried then");
  assert.ok(c.log().filter((r) => r.type === "version").at(-1).payload.known.length > 100, "the version lists the ids the package had used");
  c.asAgent(() => {
    c.edit(SG1, MISCONCEPTION + "\n", "");
    c.edit(SG, "- **\"A pressure change shifts every gas-phase equilibrium.\"**", MISCONCEPTION + "\n- **\"A pressure change shifts every gas-phase equilibrium.\"**");
  });
  const after = c.unit(before.id);
  assert.equal(after?.locator.deliverable, SG, "the moved unit keeps its id");
  assert.deepEqual(after.carried, { scope: SCOPE, version: 2 }, "carried into version 2 the moment it entered the scope");
  assert.deepEqual(after.evidence, [], "its version-1 evidence no longer counts (D15)");
  assert.ok(c.owing(["carried-unverified"]).includes(before.id));
  const carry = harnessCarries(c).at(-1);
  assert.ok(carry.payload.units.includes(before.id) && carry.payload.scope === SCOPE && carry.payload.version === 2, "the carry is logged");
  assert.deepEqual(logRecordFindings(c.root, "t"), [], "the log and the records agree");
  assert.deepEqual(versionScopeGaps(c.root, c.r()), []);
});

test("[req.coherence.version-scope-continuous] variants: a relink into the scope; a chapters entry added to DOCUMENTS.json by hand (the gate and the approval hold it, reconcile carries it); a unit first written in the version is no entrant", (t) => {
  // a relink: a chapter-1 unit linked to a chapter-2 objective after version 2 opened
  const r = course(t);
  openVersionCarrying(r.root, r.r(), OPEN_V2, I);
  const ch1 = r.find((u) => u.locator.deliverable === SG1 && u.role === "teaching" && !u.carried && (u.spineNodes || []).length);
  linkUnits(r.root, r.r(), { [ch1.id]: [...ch1.spineNodes, "objective.le-chatelier.predict-temperature-shift"] }, AGENT);
  assert.deepEqual(r.unit(ch1.id).carried, { scope: SCOPE, version: 2 }, "the relinked unit is carried into version 2");
  assert.deepEqual(versionScopeGaps(r.root, r.r()), []);

  // DOCUMENTS.json: a handout serving chapter 1, declared; version 2 of chapter 2 opens; the instructor then adds
  // `chapters: ["le-chatelier"]` by hand, outside any session
  const d = course(t);
  const HANDOUT = "current/review-handout.md";
  const docs = (chapters) => JSON.stringify({ schemaVersion: 1, documents: [{ id: "review", title: "Review handout", source: HANDOUT, carrier: "paged", ...(chapters ? { chapters } : {}) }] }, null, 2) + "\n";
  d.asAgent(() => {
    d.write(HANDOUT, "{{nyml\nkind: document\n}}\n\n# A one-page review\n\n## Equilibrium\n\nAt equilibrium the forward and reverse rates are equal, so the concentrations stay constant while both reactions go on.\n");
    d.write("metadata/DOCUMENTS.json", docs(null));
  });
  const h = d.units().filter((u) => u.locator.deliverable === HANDOUT);
  const ch1Objective = d.find((u) => u.locator.deliverable === SG1 && (u.spineNodes || []).some((n) => n.startsWith("objective.chemical-equilibrium."))).spineNodes.find((n) => n.startsWith("objective.chemical-equilibrium."));
  linkUnits(d.root, d.r(), Object.fromEntries(h.map((u) => [u.id, [ch1Objective]])), AGENT);
  openVersionCarrying(d.root, d.r(), OPEN_V2, I);
  assert.ok(h.every((u) => !d.unit(u.id).carried), "serving chapter 1 only: not in chapter 2's scope when it opened");
  d.write("metadata/DOCUMENTS.json", docs(["chemical-equilibrium", "le-chatelier"]));
  const owed = d.ob(["version-carry-owed"]);
  assert.equal(owed.length, 1, "the gate holds the entrant as owed its carry");
  assert.deepEqual(owed[0].units.sort(), h.map((u) => u.id).sort());
  assert.match(approvalPrecondition(d.root, d.r(), manifestChapters(d.r()), { chapter: "le-chatelier" }).problem || "", /never carried/, "the approval waits");
  assert.throws(() => recordApproval(d.root, d.r(), manifestChapters(d.r()), { chapter: "le-chatelier", instructorWords: "Approve version 2." }, I), /never carried/);
  const rec = reconcileUnitRecords(d.root, d.r());
  assert.ok(rec.applied.some((a) => a.gap === "entered" && a.units.length === h.length), "reconcile (run at every session begin) carries it");
  for (const u of h) assert.deepEqual(d.unit(u.id).carried, { scope: SCOPE, version: 2 });
  assert.deepEqual(d.ob(["version-carry-owed"]), []);
  assert.deepEqual(logRecordFindings(d.root, "t"), []);

  // a unit first written in version 2 carries nothing from before it: no entrant, no carry
  const n = course(t);
  openVersionCarrying(n.root, n.r(), OPEN_V2, I);
  const NEW = "A brand-new paragraph written in version 2: the response to a disturbance is only partial, never a full return.";
  n.asAgent(() => n.edit(SG, "## Changing a concentration\n", `## Changing a concentration\n\n${NEW}\n`));
  const nu = n.find((u) => u.text === NEW);
  assert.ok(nu && !nu.carried, "a unit first written in the version is not carried");
  assert.deepEqual(versionScopeGaps(n.root, n.r()).flatMap((g) => g.units).filter((id) => id === nu.id), []);
});

// ============================================ 2. VALUE SUCCESSORS, PACKAGE-WIDE ==================================
test("[req.coherence.value-successors-wide] R7 H-02: ΔH moved one section away — the owed re-checks are shown the new value, and an honest reviewer who sees both stops the clear", async (t) => {
  const c = course(t);
  c.asAgent(() => {}); // the first index under this harness records every unit's text
  c.asAgent(() => {
    c.edit(SG, EQ_TEXT, BARE_EQ);
    c.edit(SG, "## Changing a concentration\n", `${NEW_VALUE}\n\n## Changing a concentration\n`);
  });
  const nu = c.find((u) => u.text === NEW_VALUE);
  assert.equal(nu.locator.section, "the-principle", "the value now lives in another section");
  const owed = c.owing(["reverify"]);
  assert.ok(owed.includes(WE1) && owed.includes(SOL1));
  const shown = recheckShown(c.root, c.r());
  for (const id of [WE1, SOL1]) {
    assert.ok(shown.get(id).some((m) => m.text === NEW_VALUE && /where the value now lives/.test(m.what)), `${id}'s re-check is shown where the value now lives`);
    assert.deepEqual(shown.get(id).unshowable, []);
  }
  const seen = [];
  await verifyKnowledge(c.root, c.r(), { verifier: honest(seen), only: [WE1, SOL1] });
  assert.ok(seen.length === 2 && seen.every((p) => /92\.4/.test(p)), "each re-check saw -92.4");
  assert.throws(() => reverifyUnits(c.root, c.r(), [WE1, SOL1], AGENT), /found it wrong/);
});

test("[req.coherence.value-successors-wide] variants: a value moved to another deliverable is found there; a value removed entirely makes the target unshowable (only the instructor clears it); the successors shown are the nearest, capped", async (t) => {
  // another deliverable: ΔH leaves the equation and is stated on a slide
  const s = course(t);
  s.asAgent(() => {});
  const SLIDE = "Haber synthesis: $\\Delta H = -92.4\\ \\text{kJ mol}^{-1}$, so heat sits on the product side.";
  s.asAgent(() => {
    s.edit(SG, EQ_TEXT, BARE_EQ);
    s.edit("slides/le-chatelier.md", "pushes the equilibrium away from the side where heat sits.\n", `pushes the equilibrium away from the side where heat sits.\n\n${SLIDE}\n`);
  });
  const slide = s.find((u) => u.text === SLIDE);
  assert.equal(slide.locator.deliverable, "slides/le-chatelier.md");
  for (const id of s.owing(["reverify"]).filter((x) => [WE1, SOL1].includes(x)))
    assert.ok(recheckShown(s.root, s.r()).get(id).some((m) => m.text === SLIDE), `${id} is shown the slide that now states the value`);

  // removed entirely: the value is nowhere in the package now — unshowable, a re-check never clears it
  const g = course(t);
  g.asAgent(() => {});
  g.asAgent(() => g.edit(SG, EQ_TEXT, BARE_EQ));
  const st = recheckShown(g.root, g.r()).get(WE1);
  assert.ok(st.unshowable.includes(`unit:${EQ}`), "the value left and no unit states it now");
  assert.ok(st.some((m) => m.text === EQ_TEXT), "the re-check is still shown how the target read when last checked");
  await verifyKnowledge(g.root, g.r(), { verifier: review(), only: [WE1] });
  assert.throws(() => reverifyUnits(g.root, g.r(), [WE1], AGENT), /cannot be shown what changed/);
  confirmUnits(g.root, g.r(), [WE1], { what: "still-correct", instructorWords: "Worked example 1 states the enthalpy itself; it still holds." }, I);
  assert.ok(!g.owing(["reverify"]).includes(WE1), "the instructor's confirmation clears it (D49)");

  // nearest first, capped: the same value stated in the study guide and on several slides
  const k = course(t);
  k.asAgent(() => {});
  const extra = [1, 2, 3, 4].map((n) => `Slide note ${n}: for this synthesis $\\Delta H = -92.4\\ \\text{kJ mol}^{-1}$.`);
  k.asAgent(() => {
    k.edit(SG, EQ_TEXT, BARE_EQ);
    k.edit(SG, "## Changing a concentration\n", `${NEW_VALUE}\n\n## Changing a concentration\n`);
    k.edit("slides/le-chatelier.md", "pushes the equilibrium away from the side where heat sits.\n", `pushes the equilibrium away from the side where heat sits.\n\n${extra.join("\n\n")}\n`);
  });
  const lives = recheckShown(k.root, k.r()).get(WE1).filter((m) => /where the value now lives/.test(m.what) && m.target === `unit:${EQ}`);
  assert.ok(lives.length <= MAX_SUCCESSORS, `at most ${MAX_SUCCESSORS} places are shown (${lives.length})`);
  assert.equal(lives[0].text, NEW_VALUE, "the place nearest the old one comes first");
});

// ============================================ 3. INHERITANCE INCLUDES KEPT UNITS =================================
test("[req.coherence.absorbed-inherits] R7 H-03: an equation that owed a re-check, inlined into the kept sentence before it, passes its debt to that sentence — whose lineage names it, and whose re-check is shown the new value", async (t) => {
  const c = course(t);
  c.asAgent(() => {});
  c.asAgent(() => {
    c.edit(SG, "($\\Delta H = -92\\ \\text{kJ mol}^{-1}$), predict", "($\\Delta H = -92.4\\ \\text{kJ mol}^{-1}$), predict");
  });
  assert.ok(c.owing(["reverify"]).includes(EQ), "the equation owes a re-check that must show it the new value");
  const INLINED = "Take the Haber synthesis of ammonia, which is exothermic: $\\ce{N2(g) + 3 H2(g) <=> 2 NH3(g)}$, with $\\Delta H = -92\\ \\text{kJ mol}^{-1}$.";
  c.asAgent(() => c.edit(SG, `${INTRO_TEXT}\n\n${EQ_TEXT}`, INLINED));
  const intro = c.unit(INTRO);
  assert.equal(intro?.text, INLINED, "the sentence keeps its id");
  assert.equal(c.unit(EQ), undefined, "the equation retired");
  assert.ok(intro.lineage?.includes(EQ), "its lineage records the absorption (numbers and symbols count)");
  assert.ok(intro.owes?.targets.includes(`unit:${WE1}`), "it inherits what the equation owed");
  assert.ok(c.owing(["reverify"]).includes(INTRO));
  assert.ok(recheckShown(c.root, c.r()).get(INTRO).some((m) => /-92\.4/.test(m.text)), "its re-check is shown the new value");
  const seen = [];
  await verifyKnowledge(c.root, c.r(), { verifier: honest(seen), only: [INTRO] });
  assert.ok(seen.every((p) => /92\.4/.test(p)));
  assert.throws(() => reverifyUnits(c.root, c.r(), [INTRO], AGENT), /found it wrong/);
  assert.deepEqual(logRecordFindings(c.root, "t"), [], "the log and the records agree");
  // absorption is measured with values and equations as tokens
  const eqTokens = absorptionTokens(EQ_TEXT);
  assert.ok(eqTokens.includes("#-92") && eqTokens.length >= 5, JSON.stringify(eqTokens));
});

test("[req.coherence.absorbed-inherits] variant: a kept unit absorbing a carried unit is carried into its version, through the log, and owes its re-check", async (t) => {
  const c = course(t);
  c.asAgent(() => {});
  openVersionCarrying(c.root, c.r(), OPEN_V2, I);
  assert.deepEqual(c.unit(EQ).carried, { scope: SCOPE, version: 2 });
  // the sentence is re-verified in version 2 (no longer carried); the equation is not
  await verifyKnowledge(c.root, c.r(), { verifier: review(), only: [INTRO] });
  reverifyUnits(c.root, c.r(), [INTRO], AGENT);
  assert.ok(!c.unit(INTRO).carried);
  const INLINED = "Take the Haber synthesis of ammonia, which is exothermic: $\\ce{N2(g) + 3 H2(g) <=> 2 NH3(g)}$, with $\\Delta H = -92\\ \\text{kJ mol}^{-1}$.";
  c.asAgent(() => c.edit(SG, `${INTRO_TEXT}\n\n${EQ_TEXT}`, INLINED));
  const intro = c.unit(INTRO);
  assert.equal(c.unit(EQ), undefined);
  assert.ok(intro.lineage?.includes(EQ));
  assert.deepEqual(intro.carried, { scope: SCOPE, version: 2 }, "the carry followed the words");
  assert.ok(harnessCarries(c).some((r) => r.payload.units.includes(INTRO)), "the carry is logged");
  assert.ok(c.owing(["carried-unverified"]).includes(INTRO));
  assert.deepEqual(logRecordFindings(c.root, "t"), [], "the log and the records agree");
  assert.deepEqual(versionScopeGaps(c.root, c.r()), []);
  // a re-check of the new text, then reverify, clears it (the carry and what it owed)
  await verifyKnowledge(c.root, c.r(), { verifier: review(), only: [INTRO] });
  reverifyUnits(c.root, c.r(), [INTRO], AGENT);
  assert.ok(!c.unit(INTRO).carried && !c.unit(INTRO).owes);
  assert.deepEqual(versionScopeGaps(c.root, c.r()), []);
});
