// [req.host.alembic-needs-apply] Closed-loop audit, round 4, of D-133 (needs-wording e6a88d1 on main 75e808f): the two
// answer rules of round 3 (only an exact choice means yes; an answer binds the passage as it was asked), the ms8 change,
// old hand-ins, and the hand-in against Alembic's own validator. Each finding test FAILS on e6a88d1 and names one
// finding (severity in its name); adopted with the round's fixes (MEDIUM-3 follows the fix asked for: the words are owed
// to the agent, not closed). The last test mirrors Alembic's parseDigest (Alembic
// packages/package-ops/src/agent-api.ts:191-229, normalizePath in package-contract/src/contract-v3.ts:45-62) and passes.
// Only public functions of alembic_needs.mjs / needs_wording.mjs and the real C2 package are used; nothing here changes
// implementation.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { loadUnits } from "../scripts/lib/core/obligations.mjs";
import { unitHash } from "../scripts/lib/core/segment.mjs";
import { parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { recordFile } from "../scripts/lib/records/paths.mjs";
import { applyChanges, exportNeeds, NEEDS_FILE } from "../scripts/lib/core/alembic_needs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const BY = { id: "u-42", name: "Yu Wang" };
const U3 = "u-study-guide-chemical-equilibrium-the-equilibrium-constant-3";
const GUIDE = "study-guide/chemical-equilibrium.md";
function copy(t) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-wording-audit4-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(C2, path.join(dir, "pkg"), { recursive: true });
  const root = path.join(dir, "pkg");
  return { root, reader: liveReader(root) };
}
const finding = (id, kind, units, evidence, more = {}) => ({ id, module: "skeleton", kind, units, statusClass: "question", route: "digest", status: "open", evidence, ...more });
const answer = (handin, question, item, text, words = text) => ({ item, changesetId: handin.changesetId, question, answer: text, words, by: BY, at: "2026-11-08T12:00:00.000Z" });
const needs = (root) => JSON.parse(fs.readFileSync(recordFile(root, NEEDS_FILE), "utf8"));
const confirmations = (root) => parseLog(readLogText(root)).filter((r) => r.type === "confirmation");

// ---- HIGH-1: the `seen` check reads the units sidecar, not the passage: in the job's own order it is bypassed ---------
// alembic_needs.mjs:313-314 (askedAsNow) compares `seen` with unitInfoOf (workflow.mjs:23-26), the contentHash the
// units SIDECAR holds; exportNeeds (:210-213) takes `seen` from the same sidecar. The sidecar changes only when the
// package is re-indexed. alembic-job/CLAUDE.md step 1 runs `alembic_needs.mjs apply` right after the import and BEFORE
// `units.mjs index` (step 2), so an edit made in Alembic's editor between the jobs (the question itself sends the
// instructor to the page, and says "if it changes before your answer is recorded, you are asked again") is not seen:
// the sidecar hash still equals `seen`, and Confirm / Keep as written / Accept as mine / Keep are recorded against the
// LIVE text (confirmUnits reads loadUnits, obligations.mjs:594-609, which re-segments the file). Round 3's tests
// (alembic-needs-wording.test.mjs:221, audit3 HIGH-2) re-index before applying, so they never meet this order.
// Cheapest fix: in askedAsNow (and when writing `seen`) use unitHash of the live unit text (loadUnits), not the sidecar.
test("[req.host.alembic-needs-apply] audit4 HIGH-1: an edit made between asking and answering is caught in the job's own order (apply before index)", async (t) => {
  const p = copy(t);
  const before = loadUnits(p.root, p.reader).find((u) => u.id === U3);
  const f = finding("f-audit4-stale", "confirmation-stale", [U3], { type: "judgment", note: "You confirmed the facts in it, but its text has changed since — confirm it as it reads now?", quote: before.text }, { recommendation: "confirm" });
  const r = await exportNeeds(p.root, { changesetId: "audit4-seen-01", gate: { findings: [f] } });
  const q = r.handin.digest.questions.find((x) => x.id.startsWith("d."));
  assert.deepEqual(q.choices, ["Confirm", "Later"], "precondition: one-click Confirm offered");
  // between the jobs the passage is edited on the page (same paragraph, same unit count); the next job imports and,
  // as alembic-job/CLAUDE.md step 1 says, applies the answers before it indexes anything
  const file = path.join(p.root, GUIDE), src = fs.readFileSync(file, "utf8");
  assert.ok(src.includes(before.text));
  fs.writeFileSync(file, src.replace(before.text, `${before.text.replace(/:$/, "")} — at 500 K its value is 0.0042:`));
  const now = loadUnits(p.root, liveReader(p.root)).find((u) => u.id === U3);
  assert.ok(now && /0\.0042/.test(now.text), "precondition: the live passage now reads differently, same id");
  const a = applyChanges(p.root, { answers: [answer(r.handin, q.id, "i-1", "Confirm", "Confirmed, as it reads.")] });
  const bound = confirmations(p.root).map((x) => x.payload?.contentHashes?.[U3]);
  assert.ok(!bound.includes(unitHash(now.text)), `Confirm was recorded for text the instructor was never asked about (K = 0.0042 at 500 K): ${JSON.stringify(a)}`);
});

// ---- MEDIUM-2: a question that can never settle from Alembic ------------------------------------------------------
// An unasked removal of a long passage of the instructor's (needs_wording.mjs:403-405: the removed passage goes off-page,
// in full) does not fit the detail, so digestQuestion (alembic_needs.mjs:121-127) drops every choice and tells the
// instructor "answer in your own words, and the assistant takes it up". But instructor-edit-unasked is a BINDING kind,
// so applyChanges (:380-383) skips any typed answer ("free words where this question needs one of its choices: it is
// asked again") and records nothing, not even the words. The next export asks the same question, again without choices:
// the instructor can only say Later, forever. The same holds for any binding kind whose unit the wording cannot read
// (`unseen`, needs_wording.mjs:357-365).
// Cheapest fix: never drop the choices of a binding kind for an off-page text that does not fit (say the removed words
// are in the assistant's record and keep Keep / Revert, not pre-chosen), or record the typed words as `said: …` without
// the binding act so the question closes for the assistant to take up.
test("[req.host.alembic-needs-apply] audit4 MEDIUM-2: a binding question whose choices cannot be shown still settles", async (t) => {
  const p = copy(t);
  const long = "Le Chatelier's principle, as we use it in this course, is a rule of thumb for the direction of a shift, never for its size; ".repeat(16);
  const f = finding("f-audit4-removed", "instructor-edit-unasked", ["u-study-guide-chemical-equilibrium-retired-9"], { type: "judgment", note: "Your text was removed without your answer. Keep it removed, or have it restored?", quote: long, now: "", after: "", before: long, instructorText: "u-study-guide-chemical-equilibrium-retired-9" }, { module: "ms8-verdicts", recommendation: "keep" });
  let settled = false, offered = false;
  for (let job = 1; job <= 3 && !settled && !offered; job++) {
    const r = await exportNeeds(p.root, { changesetId: `audit4-loop-0${job}`, gate: { findings: [f] } });
    const q = r.handin.digest.questions.find((x) => x.id.startsWith("d."));
    assert.ok(q, `job ${job}: the question is asked`);
    if (q.choices?.some((c) => /^keep/i.test(c))) { offered = true; break; }
    assert.match(q.detail || "", /your own words/, "the question invites words");
    const a = applyChanges(p.root, { answers: [answer(r.handin, q.id, `i-${job}`, "Yes, keep it removed — that whole paragraph was out of date.")] });
    settled = a.recorded.length > 0;
  }
  assert.ok(settled || offered, "three jobs: the instructor's typed answer is never recorded, and the question never offers a choice");
});

// ---- MEDIUM-3: "said: …" closes the question, and nothing hands the words to the assistant ---------------------------
// For a non-binding kind, applyChanges (alembic_needs.mjs:384-386) records free words as `said: …` with outcome
// "answered": answeredBases (digest.mjs:42) then takes the finding as answered, so it leaves the digest and the gate's
// open questions, and no reader of answers (obligations.mjs:117/144, verdicts.mjs:61, ms8-verdicts.mjs:111/402) turns
// `said:` into an obligation. The apply output the agent reads holds only { question, item, outcome } — not the words —
// and alembic-job/CLAUDE.md never mentions them. Yet the question told the instructor "ask the assistant in your own
// words to apply it in a job" (a long suggestion, alembic_needs.mjs:125) or "the assistant takes it up" (:144). An old
// hand-in's typed "Apply the suggestion" (knowledge-concern had no choices before D-133) now closes the concern unapplied.
// Cheapest fix: return the words with each `said:` outcome (recorded[].said) and tell the agent in alembic-job/CLAUDE.md
// to act on them; or keep the finding open (agent-routed) until the agent acts.
test("[req.host.alembic-needs-apply] audit4 MEDIUM-3: words recorded as said reach the assistant", async (t) => {
  const p = copy(t);
  // a reviewer's point with no suggestion: the question asks "check it, and say whether it should change" — words only
  const quote = "Le Chatelier's principle predicts the direction of a shift when a system at equilibrium is disturbed.";
  const f = finding("f-audit4-kc", "knowledge-concern", [U3], { type: "judgment", note: "It may conflate the position of equilibrium with the constant.", quote }, { module: "ms8-verdicts" });
  const r = await exportNeeds(p.root, { changesetId: "audit4-said-01", gate: { findings: [f] } });
  const q = r.handin.digest.questions.find((x) => x.id.startsWith("d."));
  assert.equal(q.choices, undefined, "precondition: answered in words");
  assert.match(q.text, /say whether it should change/);
  const words = "Yes, change it: say the position shifts and K stays the same unless the temperature changes.";
  const a = applyChanges(p.root, { answers: [answer(r.handin, q.id, "i-1", words)] });
  // adopted fix (round 4): the words stay owed to the agent — outcome "said", the words in the output — and the finding
  // stays open (not answered) without being asked again, until the agent records what it did
  assert.equal(a.recorded[0]?.outcome, "said", "owed to the assistant");
  assert.ok(JSON.stringify(a.recorded[0]).includes(words), `the apply output the agent reads drops the instructor's request (the finding is now answered, nothing owes it): ${JSON.stringify(a.recorded[0])}`);
  const { answeredBases, saidOwed } = await import("../scripts/lib/core/digest.mjs");
  const key = `${f.id}|`, owedKeys = [...saidOwed(p.root).keys()];
  assert.ok(owedKeys.some((k) => k.startsWith(key)), "owed to the agent");
  assert.ok(![...answeredBases(p.root).keys()].some((k) => k.startsWith(key)), "not answered yet");
  assert.equal((await exportNeeds(p.root, { changesetId: "audit4-said-02", gate: { findings: [f] } })).handin.digest.questions.filter((x) => x.id.startsWith("d.")).length, 0, "not asked again");
  const { takenUp } = await import("../scripts/lib/core/alembic_needs.mjs");
  takenUp(p.root, { changesetId: "audit4-said-01", question: q.id, note: "Rewrote the sentence as asked." }, { role: "agent", name: "executor", model: "claude-opus-5-5" });
  assert.ok([...answeredBases(p.root).keys()].some((k) => k.startsWith(key)), "answered once the agent records it");
});

// ---- MEDIUM-7: the ms8 change (round 3) turns an existing red-team suite red ------------------------------------------
// ms8-verdicts.mjs:126-129,252: the unasked-edit finding of the suggestion path now names adoptedWith(u) — every holder of
// a registered text u holds — instead of [u.id]. After a split, the OTHER piece (which never held the reviewer's words)
// is now a unit of that finding, so tests/redteam-r5-trust.test.mjs:227 (R5-K10, req.authorship.follows-text: "the
// other piece never held the words") fails on this branch, in the very red-team suites the round requires. The finding's
// units, and so its id (findingId hashes units), change wherever the instructor's text has more than one holder: a
// logged "Revert" to the old id (ms8-verdicts.mjs:402 matches by id) stops owing instructor-revert-owed and the question
// is asked again. On the C2 and GenChem fixtures the gate output is byte-identical (no multi-holder unasked edit there).
// Cheapest fix: decide which is right and make the two agree — keep units [u.id] for the finding and add the other
// holders only to what the question SHOWS (the needs wording binds() list), or update R5-K10 to the new contract.
test("audit4 MEDIUM-7: the red-team suite R5-K10 still holds with the ms8 change", { timeout: 900000 }, () => {
  const r = spawnSync(process.execPath, ["--test", "--test-name-pattern=R5-K10", path.join(HERE, "redteam-r5-trust.test.mjs")], { encoding: "utf8", env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "NODE_TEST_CONTEXT")) }); // a plain run, not a subtest of this one
  assert.equal(r.status, 0, `R5-K10 fails: ${(r.stdout.match(/error: [^\n]*\n(?:.*\n){0,8}/) || [""])[0]}`);
});

// ---- LOW-4: a `seen` that does not name every unit binds nothing -----------------------------------------------------
// askedAsNow (alembic_needs.mjs:313) checks only the units `seen` lists: a record whose `seen` is {} (or lists fewer
// units than the entry binds) passes for every unit, and the Confirm is applied to whatever they hold. Coursewerk
// writes `seen` for every unit, so this needs a record not of its own making (the record is in the package); fail-safe
// would cost one line. Cheapest fix: require every e.units id to be a key of q.seen.
test("[req.host.alembic-needs-apply] audit4 LOW-4: a record whose `seen` misses a unit the answer binds is asked again", (t) => {
  const p = copy(t);
  const u = loadUnits(p.root, p.reader).find((x) => x.id === U3);
  const e = { key: "k-audit4-seen", kind: "confirmation-stale", module: "skeleton", units: [U3], chapters: ["chemical-equilibrium"], question: "changed", evidence: { quote: u.text }, findings: ["f-x"], bases: [{ finding: "f-x", basis: "b" }] };
  const f = recordFile(p.root, NEEDS_FILE);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ schemaVersion: 1, handins: [{ changesetId: "audit4-seen-02", at: "2026-11-08T10:00:00.000Z", questions: { "d.x": { kind: "digest", entry: e, choices: ["Confirm", "Later"], words: "required", seen: {} } } }] }));
  const a = applyChanges(p.root, { answers: [answer({ changesetId: "audit4-seen-02" }, "d.x", "i-1", "Confirm", "Confirmed.")] });
  assert.deepEqual(a.recorded, [], `a record with an empty seen confirmed ${U3}: ${JSON.stringify(a)}`);
});

// ---- LOW-5: a reviewer's quote cut from inside orz markup keeps the markup ------------------------------------------
// On the real General Chemistry course (temp/genchem-update-2026-11-02, a full export on this branch), 7 of the 10 digest
// questions read "“Objective 6.4b}} Calculate” may be wrong … Suggestion: “Objective 6.4c}} Calculate”": the reviewer's
// quote starts inside `{{sp[info] Objective 6.4b}}`, and plainText (needs_wording.mjs) renders only whole markup, so the
// closing braces reach the instructor — the very `{{sp[info] Objective 18.5a}}` case D-133 was opened for. A course-map
// table row likewise reads as raw pipes ("| Connection | … |—|—|—|"). Wording only: no answer's meaning changes.
// Cheapest fix: in plainText, drop an unmatched "}}" (and an unclosed "{{name[…]") left by a cut quote.
test("[req.host.alembic-needs-wording] audit4 LOW-5: a quote cut inside orz markup reads without the markup", async () => {
  const { plainText } = await import("../scripts/lib/core/needs_wording.mjs");
  assert.equal(plainText("{{sp[info] Objective 6.4b}} Calculate"), "Objective 6.4b Calculate", "whole markup renders (precondition)");
  assert.doesNotMatch(plainText("Objective 6.4b}} Calculate"), /\}\}/, "a cut quote shows the closing braces");
});

// ---- LOW-6: an interrupt's harness note keeps its field names -----------------------------------------------------
// The same GenChem export's interrupt reads "Rights: Source[2]: evidenceSnapshot does not exist: the page “Wikipedia
// general.html”." — "Source[2]" and "evidenceSnapshot" are the harness's index and field name (ms2-rights' rule text),
// which D-133 keeps for the assistant's copy only. Cheapest fix: a reasonLabel-style phrase for ms2-rights' missing
// snapshot ("The saved copy of a source's licence page is missing: “…”"), or drop `source[n]:` and camelCase field names
// in forInstructor.
test("[req.host.alembic-needs-wording] audit4 LOW-6: a rights interrupt reads without the harness's field names", async () => {
  const { forInstructor } = await import("../scripts/lib/core/needs_wording.mjs");
  const said = forInstructor("source[2]: evidenceSnapshot does not exist: private/coursewerk/evidence/wikipedia-general.html.");
  assert.doesNotMatch(said, /evidenceSnapshot|source\[\d+\]/i, `reads: ${said}`);
});

// ---- Alembic's validator, mirrored: a full export of the largest fixture is accepted (passes) -----------------------
const QID = /^[A-Za-z0-9_.-]{1,64}$/, CHANGESET = /^[A-Za-z0-9_-]{8,64}$/;
const oneLine = (s) => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s);
const FORBIDDEN_CHAR = /[\u0000-\u001f\u007f]|\p{Cf}/u;
function normalizePath(p) {
  const b = (s) => Buffer.byteLength(s, "utf8");
  if (typeof p !== "string" || !p.length || p.normalize("NFC") !== p || p.startsWith("/") || p.includes("\\") || p.includes("%") || FORBIDDEN_CHAR.test(p) || b(p) > 1024) throw new Error(`path ${p}`);
  for (const seg of p.split("/")) if (seg === "" || seg === "." || seg === ".." || b(seg) > 255) throw new Error(`path ${p}`);
  return p;
}
/** agent-api.ts parseDigest, line for line (HANDIN_LIMITS: 20 questions, text 500, detail 2,000, refs 10, 2–6 choices of 120). */
function alembicParseDigest(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.questions)) return "digest: { questions: [...] }";
  if (raw.questions.length > 20) return "at most 20 questions";
  const ids = new Set();
  for (const [k, q] of raw.questions.entries()) {
    if (!q || typeof q !== "object") return `${k}: object`;
    if (typeof q.id !== "string" || !QID.test(q.id) || ids.has(q.id)) return `${k}: id`; ids.add(q.id);
    if (typeof q.text !== "string" || !q.text.trim() || q.text.length > 500 || !oneLine(q.text.replace(/\n/g, " "))) return `${k}: text`;
    let cs;
    if (q.choices !== undefined) {
      if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 6 || q.choices.some((c) => typeof c !== "string" || !c.trim() || c.length > 120 || !oneLine(c))) return `${k}: choices`;
      cs = q.choices; if (new Set(cs).size !== cs.length) return `${k}: choices once`;
    }
    if (q.recommended !== undefined && (typeof q.recommended !== "string" || !cs || !cs.includes(q.recommended))) return `${k}: recommended`;
    if (q.detail !== undefined && (typeof q.detail !== "string" || q.detail.length > 2000)) return `${k}: detail`;
    if (q.refs !== undefined) { if (!Array.isArray(q.refs) || q.refs.length > 10 || q.refs.some((r) => typeof r !== "string")) return `${k}: refs`; try { q.refs.forEach(normalizePath); } catch { return `${k}: refs paths`; } }
    if (q.words !== undefined && q.words !== "required" && q.words !== "optional") return `${k}: words`;
    if (q.wordsSuggested !== undefined && (typeof q.wordsSuggested !== "string" || !q.wordsSuggested.trim() || q.wordsSuggested.length > 500 || q.words === undefined)) return `${k}: wordsSuggested`;
  }
  return null;
}
test("[req.host.alembic-needs-export] audit4: a full export of the C2 package (its own gate) passes Alembic's parseDigest and its 4 MB record limit", async (t) => {
  const p = copy(t);
  const r = await exportNeeds(p.root, { changesetId: "audit4-full-export", model: "claude-opus-5-5" });
  assert.ok(CHANGESET.test(r.handin.changesetId));
  assert.ok(r.handin.digest.questions.length > 0, "the full export asks something");
  assert.equal(alembicParseDigest(r.handin.digest), null);
  const rec = fs.readFileSync(recordFile(p.root, NEEDS_FILE), "utf8");
  assert.ok(Buffer.byteLength(rec, "utf8") <= 4 * 1024 * 1024, "the needs record fits one Alembic record file");
  for (const q of r.handin.digest.questions) assert.ok(needs(p.root).handins.at(-1).questions[q.id], `${q.id} is remembered`);
  t.diagnostic(JSON.stringify({ questions: r.handin.digest.questions.length, counts: r.counts, left: r.left, recordBytes: Buffer.byteLength(rec, "utf8") }));
});
