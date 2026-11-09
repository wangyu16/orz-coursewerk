// [req.host.alembic-needs-wording] Closed-loop audit, round 3, of D-133 (needs-wording, a4bfeed on 6c159a3 / 6bd1efd):
// P1 (fail-safe answers) and P2 (what an answer binds is shown), checked kind by kind against what apply records. Each
// test below FAILS on a4bfeed (adopted with the round's fixes; MEDIUM-7 accepts the plain 'cannot be applied' it asked for) and names one finding (severity in the test name). They probe only the public functions of
// needs_wording.mjs / alembic_needs.mjs and the real C2 package; nothing here changes implementation.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { indexAndStamp, loadUnits } from "../scripts/lib/core/obligations.mjs";
import { parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { recordFile } from "../scripts/lib/records/paths.mjs";
import { CORRECTIONS_DIR } from "../scripts/lib/verify/verdicts.mjs";
import { applyChanges, digestQuestion, exportNeeds, handinProblems, NEEDS_FILE } from "../scripts/lib/core/alembic_needs.mjs";
import { plainText } from "../scripts/lib/core/needs_wording.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const BY = { id: "u-42", name: "Yu Wang" };
const U3 = "u-study-guide-chemical-equilibrium-the-equilibrium-constant-3";
const GUIDE = "study-guide/chemical-equilibrium.md";
function copy(t) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-wording-audit3-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(C2, path.join(dir, "pkg"), { recursive: true });
  const root = path.join(dir, "pkg");
  return { root, reader: liveReader(root) };
}
const shown = (q) => `${q.text}\n${q.detail || ""}`;
const entry = (kind, evidence, more = {}) => ({ key: `k-${kind}`, kind, units: [], chapters: ["chemical-equilibrium"], question: evidence.note, evidence, bases: [{ finding: `f-${kind}`, basis: "b" }], ...more });
/** A needs record holding one question, exactly as exportNeeds keeps it, so applyChanges can answer it. */
function ask(root, changesetId, id, rec) {
  const f = recordFile(root, NEEDS_FILE);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ schemaVersion: 1, handins: [{ changesetId, at: "2026-11-08T10:00:00.000Z", questions: { [id]: rec } }] }));
}
const answer = (changesetId, question, item, text, words = text) => ({ item, changesetId, question, answer: text, words, by: BY, at: "2026-11-08T12:00:00.000Z" });
const confirmations = (root) => parseLog(readLogText(root)).filter((r) => r.type === "confirmation");

// ---- HIGH-1: P1 does not hold for the digest kinds: a typed answer that is not a choice still counts as Confirm --------
// alembic_needs.mjs:322-325 passes a choice-less digest answer straight to answerDigest, whose CONFIRMS / CLAIMS / ADOPTS
// (digest.mjs:119-123) and ms8's acceptance (ms8-verdicts.mjs:111 /^\s*apply/, :398 /^\s*revert/; verdicts.mjs:61
// /^\s*keep/) are PREFIX tests with no word boundary: "Confirmation must wait…" confirms, "Keeping it is wrong…" keeps,
// "Accept as mine? No…" claims, "Apply? No…" adopts. A digest question is choice-less exactly when P2 removes its
// one-click choice (the passage is too long to show, or a unit could not be read) and for kinds without choices, and in
// every hand-in made before D-133 (knowledge-concern / clarification-proposed). P1 was applied to corrections and
// approvals only.
test("[req.host.alembic-needs-apply] audit3 HIGH-1: a typed digest answer that is not a choice never counts as Confirm (P1 for every kind)", (t) => {
  const p = copy(t);
  // (a) P2 makes the question choice-less: the whole passage (over ~1,800 characters) cannot be shown
  const long = `${"Take [N₂] = 0.50 M and [H₂] = 1.5 M at equilibrium, and keep three significant figures throughout. ".repeat(20)}`;
  const ctx = { units: new Map([[U3, { deliverable: GUIDE, form: "paragraph", text: long }]]), deliverableOf: new Map([[U3, GUIDE]]) };
  const e = entry("exercise-data-confirm", { type: "judgment", note: `${U3}: the values here read as invented exercise data — confirm them as teaching hypotheticals?`, quote: "[N₂] = 0.50 M | [H₂] = 1.5 M" }, { units: [U3], recommendation: "confirm" });
  const q = digestQuestion(e, new Map(), ctx);
  // adopted fix (round 3, HIGH-2): a long passage offers Confirm again (apply checks the passage is as asked); the probe
  // answers a question asked WITHOUT choices — as any hand-in before the fix, or a kind without choices — with the
  // passage unchanged since (`seen` holds), so the free-words rule alone must hold
  const hash = loadUnits(p.root, p.reader).find((u) => u.id === U3).locator.contentHash;
  ask(p.root, "audit3-words", q.id, { kind: "digest", entry: e, choices: null, words: q.words, seen: { [U3]: hash } });
  // (b) the instructor's typed answer means "not yet"
  const r = applyChanges(p.root, { answers: [answer("audit3-words", q.id, "i-1", "Confirmation must wait until I find where these values came from.")] });
  assert.deepEqual(confirmations(p.root), [], `a "not yet" in words was recorded as a confirmation: ${JSON.stringify(r)}`);
  // round 4: the words go to the agent (outcome "said", the words in the output), never as a yes
  assert.equal(r.recorded[0]?.outcome, "said"); assert.match(r.recorded[0]?.said || "", /Confirmation must wait/);
  // (c) a kind that binds nothing: the words are recorded as said, never as an "apply" (ms8 reads /^apply/)
  const k = entry("knowledge-concern", { type: "judgment", note: "x", quote: "y", suggestion: "z" }, { units: [U3], findings: ["f-kc"] });
  ask(p.root, "audit3-kc", "d.kc", { kind: "digest", entry: k, choices: null, words: "optional", seen: { [U3]: hash } });
  const r2 = applyChanges(p.root, { answers: [answer("audit3-kc", "d.kc", "i-2", "Apply? No — keep my wording.")] });
  assert.deepEqual(r2.recorded.map((x) => x.outcome), ["said"]);
  const said = parseLog(readLogText(p.root)).filter((x) => x.type === "answer").at(-1).payload.answers[0].choice;
  assert.equal(said, "said: Apply? No — keep my wording."); assert.ok(!/^\s*(?:apply|keep|confirm|accept|revert)/i.test(said));
});

// ---- HIGH-2: an answer binds the passage as it is when the answer ARRIVES, not as it was asked ------------------------
// applyChanges (alembic_needs.mjs:322-325) never compares the entry's bases (digest.mjs:84: the unit hashes the question
// was asked at) with the package now. Unit ids are positional, so after the passage is edited (in Alembic's editor
// between jobs — the question itself says "read the page" — or by the agent before the next job reads the answers) a
// one-click Confirm confirms text the instructor never saw: confirmUnits (obligations.mjs:607-609) binds factHash, seenKey
// and contentHash of the CURRENT text. Likewise Accept as mine (claimAuthorship) and Keep (adoptInstructorText). An
// approval is guarded exactly so (alembic_needs.mjs:301 "the plan changed since it was asked"); a digest answer is not.
test("[req.host.alembic-needs-apply] audit3 HIGH-2: a one-click Confirm is applied only to the passage as it was asked", (t) => {
  const p = copy(t);
  const before = loadUnits(p.root, p.reader).find((u) => u.id === U3);
  const e = entry("confirmation-stale", { type: "judgment", note: "changed", quote: before.text }, { units: [U3], recommendation: "confirm" });
  const ctx = { units: new Map([[U3, { deliverable: GUIDE, form: "paragraph", text: before.text }]]), deliverableOf: new Map([[U3, GUIDE]]) };
  const q = digestQuestion(e, new Map(), ctx);
  assert.ok(q.choices?.includes("Confirm"), "precondition: the whole passage was shown and Confirm offered");
  ask(p.root, "audit3-stale", q.id, { kind: "digest", entry: e, choices: q.choices, words: q.words });
  // the passage changes before the answer is read (same unit id)
  beginSession(p.root, p.reader, AGENT);
  const f = path.join(p.root, GUIDE), src = fs.readFileSync(f, "utf8");
  assert.ok(src.includes(before.text));
  fs.writeFileSync(f, src.replace(before.text, `${before.text.replace(/:$/, "")} — at 500 K its value is 0.0042:`));
  indexAndStamp(p.root, p.reader, { as: "agent", party: AGENT });
  const now = loadUnits(p.root, p.reader).find((u) => u.id === U3);
  assert.ok(now && now.text !== before.text && /0\.0042/.test(now.text), "precondition: same id, other text");
  applyChanges(p.root, { answers: [answer("audit3-stale", q.id, "i-2", "Confirm", "Confirmed, as it reads.")] });
  const bound = confirmations(p.root).map((r) => r.payload?.contentHashes?.[U3]);
  assert.ok(!bound.includes(now.locator.contentHash), "Confirm was recorded for text added after the question was asked (K = 0.0042 at 500 K)");
});

// ---- MEDIUM-3: a control character from the wording makes Alembic refuse the whole hand-in ----------------------------
// needs_wording.mjs:86 returns `${base}(…)\u0001` for an arrow with conditions; inside a sub/superscript (sc: no opening
// sentinel) the closing \u0001 is unpaired and finishMath (:116-126) leaves it in the text. Alembic's parseDigest
// (Alembic packages/package-ops/src/agent-api.ts:203, oneLine: no \u0000-\u0008, \u000b-\u001f, \u007f) rejects such a
// question text, and with it the hand-in (content files included): the job cannot hand in. handinProblems
// (alembic_needs.mjs:49) does not check control characters, so exportNeeds does not see it. A raw control character in a
// passage (pasted from a PDF) does the same.
test("audit3 MEDIUM-3: no question text carries a control character Alembic rejects; handinProblems sees one", () => {
  const ALEMBIC_ONE_LINE = /[\u0000-\u0008\u000b-\u001f\u007f]/;
  assert.doesNotMatch(plainText("The rate constant is $k_{\\xrightarrow{T}}$ here."), ALEMBIC_ONE_LINE, "a sentinel leaks from the maths");
  assert.ok(handinProblems({ changesetId: "audit3-ctl", digest: { questions: [{ id: "q.1", text: "Keep the value\u0007 or change it?" }] } }).length > 0,
    "a text Alembic refuses passes Coursewerk's own check");
});

// ---- MEDIUM-4: the needs record outgrows Alembic's 4 MB per file (and per hand-in of records) -------------------------
// alembic_needs.mjs:156-160 (ASSISTANT_LIMIT = 6000) says the record "keeps 50 hand-ins of 20 questions within Alembic's
// per-file limit"; 50 x 20 x 6,000 characters is 6,000,000 before indentation (JSON.stringify(…, null, 2)), UTF-8 bytes
// (“ ” are 3 bytes) and each question's ref (a digest entry: every unit, its whole evidence). Alembic refuses a record
// file over 4 MB and over 4 MB of record text per hand-in (agent-api.ts:24-26, :145, :173): the job's hand-in fails.
test("audit3 MEDIUM-4: 50 kept hand-ins of 20 questions fit in Alembic's 4 MB", async (t) => {
  const p = copy(t);
  const codes = Array.from({ length: 30 }, (_, i) => `study-guide/chapter-${i}-${"x".repeat(120)}.md line ${i + 1}, objective.chapter-${i}.${"y".repeat(120)} D${100 + i} u-study-guide-${"z".repeat(110)}-${i} node scripts/verify.mjs correct --unit u-${i}-${"w".repeat(100)}-1`).join("; ");
  const findings = Array.from({ length: 20 }, (_, i) => ({ id: `f-big-${i}`, module: "ms2-rights", kind: "rights-source-blocker", units: [], statusClass: "obligation", route: "interrupt", interruptReason: "rights-blocker", status: "open",
    evidence: { type: "missing", what: `rights evidence for source ${i}: ${"the licence page could not be read; ".repeat(60)}`, detail: codes } }));
  await exportNeeds(p.root, { changesetId: "audit3-size-00", gate: { findings } });
  const one = JSON.parse(fs.readFileSync(path.join(p.root, NEEDS_FILE), "utf8")).handins.find((h) => h.changesetId === "audit3-size-00");
  const perHandin = Buffer.byteLength(JSON.stringify(one, null, 2), "utf8");
  assert.ok(perHandin * 50 <= 4 * 1024 * 1024, `one hand-in is ${perHandin} bytes in the record; 50 kept are ${(perHandin * 50 / 1048576).toFixed(1)} MB`);
});

// ---- MEDIUM-5: a long correction: one-click Keep (and Accept all) while the removed words are cut ----------------------
// alembic_needs.mjs:231-238: when before + after + source exceed 2,000 characters the detail shows only changedSpan
// (needs_wording.mjs:447-454), each side cut to 160 characters, and Keep stays offered AND recommended — so Alembic's
// "Accept all suggested" (needs-you/actions.ts:90, words optional) keeps it unread. P2: "removed text, which no page holds,
// is always shown in full". The corrected passage is on the page; the words the correction removed are on no page.
test("audit3 MEDIUM-5: a correction offers one-click Keep only when the words it removes are shown in full", async (t) => {
  const p = copy(t);
  const u = loadUnits(p.root, p.reader).find((x) => x.id === U3);
  const removed = `${"The ratio is fixed at a given temperature, whatever the starting amounts were, and the class should check this in the lab. ".repeat(3)}Only at 500 K is K_c = 0.0042.`;
  const pad = " Students compare the two cases in a table and explain each line in full sentences, then present it.".repeat(14);
  const c = { id: "corr-audit3", status: "applied", unit: U3, deliverable: GUIDE,
    before: { text: `${u.text}${removed}${pad}`, contentHash: "x", origin: u.origin }, after: { text: `${u.text}${pad}`, contentHash: u.locator.contentHash },
    evidence: { quotes: [{ source: "openstax", quote: "K depends on temperature." }], dispatches: [] } };
  fs.mkdirSync(recordFile(p.root, CORRECTIONS_DIR), { recursive: true });
  fs.writeFileSync(recordFile(p.root, `${CORRECTIONS_DIR}/corr-audit3.json`), JSON.stringify(c));
  const r = await exportNeeds(p.root, { changesetId: "audit3-corr", gate: { findings: [] } });
  const q = r.handin.digest.questions.find((x) => x.id === "c.corr-audit3");
  assert.ok(q, "the correction is asked");
  if (q.choices?.includes("Keep")) assert.match(shown(q), /K_c = 0\.0042/, "Keep (recommended, so Accept all) drops words the instructor was never shown");
});

// ---- LOW-6: orz-markdown's per-page maths budgets are not mirrored --------------------------------------------------
// needs_wording.mjs:25-26 mirrors MAX_TEX and TEX_DEFINES (values match orz-markdown 2.6.0 dist/index.js:345-346), but not
// the per-document budgets orz-markdown exports (MAX_CHEM_TOTAL = 100,000 \ce/\pu characters, MAX_TEX_TOTAL,
// MAX_KATEX_OUTPUT; :386-394): past them the page shows the source. The wording expands every formula (a 9.9 KB \ce is
// ~0.65 s here, and passageOf/show/binds render the same passage several times), and reads the over-budget ones
// differently from the page.
test("audit3 LOW-6: maths past orz-markdown's per-page \\ce budget reads as the page shows it (its source)", () => {
  const orz = createRequire(import.meta.url)("orz-markdown");
  const one = `$\\ce{${"Fe3+ + ".repeat(1400)}H2O}$`;
  const n = Math.ceil(orz.MAX_CHEM_TOTAL / (one.length - 7)) + 1;
  const out = plainText(Array.from({ length: n }, () => one).join(" and "));
  assert.ok(/\\ce\{/.test(out), `the page shows formula ${n} as its source; the wording typesets all ${n}`);
});

// ---- MEDIUM-7: a suggestion longer than the detail is cut, though "always shown in full" -------------------------------
// alembic_needs.mjs:108-109,113: off-page texts (a reviewer's suggestion, a removed passage) go into `head`, and when
// they do not fit (`fits` false) the detail is head + a note, cut by block() at 2,000 characters — so the end of a long
// suggestion is shown nowhere (the page holds only the instructor's text). The question is then choice-less, and a typed
// "Apply the suggestion" is still ms8's acceptance of ALL of it (/^\s*apply/, ms8-verdicts.mjs:111; HIGH-1).
test("audit3 MEDIUM-7: a reviewer's suggestion is shown in full, or the question says it cannot be applied from here", () => {
  const quote = "Le Chatelier's principle predicts the direction of a shift when a system at equilibrium is disturbed.";
  const suggestion = `${"A system at equilibrium that is disturbed responds so as to partly counteract the disturbance, as the class saw in the lab. ".repeat(18)}Only a change of temperature changes K; at 700 K, K_p = 1.5e-5.`;
  const q = digestQuestion(entry("knowledge-concern", { type: "judgment", note: "It conflates position and constant.", quote, suggestion }), new Map(), {});
  // adopted fix (round 3): shown in full, or said plainly that it cannot be applied from Alembic, with no Apply offered
  const said = !(q.choices || []).some((c) => /^apply/i.test(c)) && /can't be applied from Alembic/.test(q.detail || "");
  assert.ok(/K_p = 1\.5e-5/.test(shown(q)) || said, `the end of the suggestion an "apply" adopts is shown nowhere (detail ${q.detail?.length} chars, choices ${JSON.stringify(q.choices)})`);
});
