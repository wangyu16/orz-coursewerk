// [req.host.alembic-needs-apply] [req.host.alembic-needs-export] [req.host.alembic-needs-wording] Closed-loop audit, round 10,
// of D-133/D-147 (needs-wording ffe662f). Each test names one finding (severity in its name) and FAILS on ffe662f. Answers use
// Alembic's real shape: every answer of one digest carries the digest's needs-you row id as `item`.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { applyChanges, digestQuestion, exportNeeds, needsContext } from "../scripts/lib/core/alembic_needs.mjs";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { indexAndStamp } from "../scripts/lib/core/obligations.mjs";
import { makeFinding } from "../scripts/lib/records/findings.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { fsInputReader, pinnedTexts } from "../scripts/lib/verify/references.mjs";
import { applyCorrection, verifySemi } from "../scripts/lib/verify/verdicts.mjs";
import { forInstructor } from "../scripts/lib/core/needs_wording.mjs";
import { pinDeclared } from "./helpers/destinations.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const C2_INPUTS = path.join(HERE, "fixtures", "c2-chemistry", "inputs");
const BY = { id: "u-42", name: "Yu Wang" };
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const P1 = "u-study-guide-le-chatelier-the-principle-1", P2 = "u-study-guide-le-chatelier-the-principle-2";
const PLANTED = "u-study-guide-le-chatelier-worked-examples-2";
function course(t) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-wording-audit10-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  fs.cpSync(C2, root, { recursive: true });
  return { dir, root, inputs, log: () => parseLog(readLogText(root)) };
}
const row = (cs, q, answer, { words, at = "2026-11-16T10:00:00Z" } = {}) => ({ item: `row-${cs}`, changesetId: cs, question: q, answer, ...(words ? { words } : {}), by: BY, at });
const offSpine = (id, unit) => makeFinding({ module: "ms9-alignment", kind: "off-spine", units: [unit], statusClass: "question", route: "digest", basis: "b",
  evidence: { type: "judgment", note: `${unit} teaches nothing in the chapter's approved plan: keep it or drop it?`, dispatch: id } });

// ---- M-1: the guard's context, read once per run, went stale after an Undo in the same run ----------------------------
const HABER = "For the ammonia synthesis reaction N2 + 3 H2 ⇌ 2 NH3 the standard reaction enthalpy is −92.4 kJ per mole of reaction, so by Le Chatelier's principle raising the temperature shifts the reaction toward the reactants.";
test("[req.host.alembic-needs-apply] audit10 M-1: an answer after an Undo in the same run is checked against the text as it then reads", async (t) => {
  const c = course(t);
  fs.cpSync(C2_INPUTS, c.inputs, { recursive: true });
  const reader = liveReader(c.root);
  beginSession(c.root, reader, AGENT);
  const f = path.join(c.root, "study-guide/le-chatelier.md");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("the reaction and $\\Delta H = -92\\ \\text{kJ mol}^{-1}$ are from the source", "the reaction and $\\Delta H = -75\\ \\text{kJ mol}^{-1}$ are from the source"));
  indexAndStamp(c.root, reader, { as: "agent", party: AGENT });
  pinDeclared(c.root, c.inputs, { url: "https://openstax.org/books/chemistry-2e/pages/13-3-shifting-equilibria-le-chateliers-principle", title: "Shifting equilibria (test pin)", destination: "openstax.org/books/chemistry-2e", text: HABER });
  const texts = pinnedTexts(fsInputReader(c.inputs));
  const verifier = replayVerifier((prompt) => {
    const nonce = prompt.match(/"nonce": "([0-9a-f]+)"/)[1];
    const ps = prompt.split("\nPASSAGES\n")[1].split("\n").map((l) => l.match(/^\[(\d+)\] (.*)$/)).filter(Boolean).map((m) => ({ n: Number(m[1]), text: m[2] }));
    const n = prompt.split("\nCLAIMS\n")[1].split("\n\nPASSAGES")[0].split("\n").filter((l) => /^\d+\. /.test(l)).length;
    const x = ps.find((q) => q.text.includes("−92.4 kJ"));
    return { nonce, claims: Array.from({ length: n }, (_, i) => (x ? { claim: i + 1, verdict: "contradicted", quotes: [{ passage: x.n, text: "the standard reaction enthalpy is −92.4 kJ per mole of reaction, so by Le Chatelier's principle raising the temperature shifts the reaction toward the reactants" }] } : { claim: i + 1, verdict: "not-found", quotes: [] })) };
  });
  await verifySemi(c.root, reader, { texts, verifier, only: [PLANTED] });
  const plain = new Map([...texts].filter(([, v]) => v.ok).map(([k, v]) => [k, v.text]));
  assert.equal(applyCorrection(c.root, reader, { unitId: PLANTED, plainTexts: plain }, AGENT).applied, true, "precondition: the correction is applied");
  const F = [
    makeFinding({ module: "ms8-verdicts", kind: "knowledge-concern", units: [PLANTED], statusClass: "question", route: "digest", basis: "b",
      evidence: { type: "judgment", note: "The sign convention is unclear.", quote: "92.4", suggestion: "say per mole of reaction", dispatch: "m1a" } }),
    offSpine("m1b", P1),
  ];
  const cs = "audit10-m1-0001";
  const qs = (await exportNeeds(c.root, { changesetId: cs, gate: { findings: F } })).handin.digest.questions;
  const corr = qs.find((q) => q.id.startsWith("c.")), conf = qs.find((q) => q.choices?.includes("Apply the suggestion")), off = qs.find((q) => q.choices?.includes("Drop it"));
  assert.ok(corr && conf && off, "precondition: a correction, a suggestion and an off-plan question");
  // one run: the off-plan answer reads the package (the context is built), then Undo rewrites the planted unit, then the
  // suggestion about the planted unit's corrected text must be asked again
  const a = applyChanges(c.root, { answers: [
    row(cs, off.id, "Keep it", { at: "2026-11-16T10:00:00Z" }),
    row(cs, corr.id, "Undo", { words: "Our lab manual uses -75.", at: "2026-11-16T10:00:01Z" }),
    row(cs, conf.id, "Apply the suggestion", { at: "2026-11-16T10:00:02Z" }),
  ] });
  assert.deepEqual(a.recorded.map((x) => x.outcome), ["answered", "undone"]);
  assert.equal(a.skipped.length, 1);
  assert.match(a.skipped[0].reason, /the passage changed since it was asked/);
  const applied = c.log().filter((x) => x.type === "answer" && x.party?.role === "instructor").flatMap((x) => x.payload.answers).filter((x) => x.choice === "Apply the suggestion");
  assert.equal(applied.length, 0, "the suggestion about the changed text is not recorded");
});

// ---- L-2: string replacers read "$&" and "$$" in a title as patterns ---------------------------------------------------
test("[req.host.alembic-needs-wording] audit10 L-2: a source or chapter title holding $ is shown as written", () => {
  const ctx = { sources: new Map([["wikipedia-anchor", "Costs in $$ and $& terms"]]), titles: new Map([["le-chatelier", "Costs $& more"]]), nodes: new Map() };
  assert.equal(forInstructor("I compared with wikipedia-anchor.", ctx, { from: "agent" }), "I compared with “Costs in $$ and $& terms”.");
  assert.equal(forInstructor("See le-chatelier.", ctx, { from: "agent" }), "See “Costs $& more”.");
});

// ---- L-3: "Captured rights evidence" at a sentence start lost its capital -----------------------------------------------
test("[req.host.alembic-needs-wording] audit10 L-3: the rights words keep the case of the matched first letter", () => {
  assert.match(forInstructor("No captured rights evidence for this figure.", {}, { from: "harness" }), /^No saved proof of its licence/);
  assert.match(forInstructor("Captured rights evidence is stale.", {}, { from: "harness" }), /^Saved proof of its licence/);
  assert.match(forInstructor("It has no captured rights evidence.", {}, { from: "harness" }), /has no saved proof of its licence/);
});

// ---- L-4: a package whose units could not be read called every passage gone ------------------------------------------
test("[req.host.alembic-needs-wording] audit10 L-4: passages that could not be read are not called gone", (t) => {
  const c = course(t);
  const broken = { ...liveReader(c.root), text: () => { throw new Error("unreadable"); } };
  const ctx = needsContext(c.root, broken);
  const e = { key: "k", kind: "off-spine", module: "ms9-alignment", units: [P1], count: 1, findings: ["f"], question: `${P1} teaches nothing`, evidence: { type: "judgment", note: `${P1} teaches nothing` } };
  const q = digestQuestion(e, new Map(), ctx);
  assert.equal(q.choices, undefined, "nothing to act on: no choice");
  const all = `${q.text}\n${q.detail}`;
  assert.doesNotMatch(all, /no longer in the text/);
  assert.match(all, /could not be read here/);
});

// ---- L-5: a shrunken cluster whose every remaining place was put off read "waited", not "You chose Later" -------------
test("[req.host.alembic-needs-export] audit10 L-5: Later on every place a cluster still holds says \"You chose Later last time\"", async (t) => {
  const c = course(t);
  const F = [offSpine("l5a", P1), offSpine("l5b", P2)];
  const q1 = (await exportNeeds(c.root, { changesetId: "audit10-l5-0001", gate: { findings: F } })).handin.digest.questions;
  assert.equal(q1.length, 2, "precondition: one question per place");
  const a = applyChanges(c.root, { answers: [row("audit10-l5-0001", q1[0].id, "Later"), row("audit10-l5-0001", q1[1].id, "Keep it", { at: "2026-11-16T10:00:01Z" })] });
  assert.deepEqual(a.recorded.map((x) => x.outcome), ["deferred", "answered"]);
  const q2 = (await exportNeeds(c.root, { changesetId: "audit10-l5-0002", gate: { findings: F } })).handin.digest.questions;
  assert.equal(q2.length, 1);
  assert.match(q2[0].detail, /You chose Later last time\./);
  assert.doesNotMatch(q2[0].detail, /waited from an earlier digest/);
});

// ---- L-1: the CHANGELOG said the skipped v1.0.5 answers were "recorded by the next apply" -----------------------------
test("[req.host.alembic-needs-apply] audit10 L-1: the CHANGELOG says answers v1.0.5 skipped are asked again, and no release has the fix", () => {
  const log = fs.readFileSync(path.join(HERE, "..", "CHANGELOG.md"), "utf8");
  const unreleased = log.split(/\n## v/)[0];
  assert.doesNotMatch(unreleased, /the next apply records them/);
  assert.match(unreleased, /no released version contains the fix yet/);
  assert.match(unreleased, /their questions are asked again/);
});
