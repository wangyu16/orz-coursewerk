// What needs the instructor, through Alembic (owner 2026-11-02; req.host.alembic-needs-export,
// req.host.alembic-needs-apply). On Alembic the instructor is reached only through the course assistant's digest in
// "Needs you" — never as a publish gate or a warning in Alembic. A job hands that digest in (`alembic handin <file>`)
// and reads the answers back (`alembic changes`). Alembic carries the questions and answers and interprets nothing;
// what is asked, and what an answer does, is Coursewerk's:
//
//   exportNeeds(root, …)   Coursewerk's open needs as Alembic's hand-in: interrupts, plan approvals, corrections, then
//                          the checkpoint digest's entries — capped at 20, the rest waits for the next hand-in.
//   applyChanges(root, …)  each answer to one of our questions recorded with Coursewerk's own acts, in the person's
//                          name and words, once: a harness record carrying the answer's Alembic provenance follows it.
//
// What was asked is kept with the package (private/coursewerk/digest/alembic-needs.json), so an answer that arrives in
// a later job is applied to exactly the question that was asked — an approval only while the plan is the one asked about.
import fs from "node:fs";
import { sha256 } from "../records/canonical.mjs";
import { appendLogRecord, parseLog, readLogText } from "../records/log.mjs";
import { recordFile } from "../records/paths.mjs";
import { hasVisibleWords } from "../records/words.mjs";
import { liveReader, manifestChapters, manifestUnits } from "./package_reader.mjs";
import { approvalStatus, recordApproval } from "./approvals.mjs";
import { approvalPrecondition } from "./spine_review.mjs";
import { chapterStates, unitInfoOf } from "./workflow.mjs";
import { answerDigest, answeredBases, answerKeyOf, basisOf, buildDigest, deliverDigest, DEFAULT_CAP, isAnswered } from "./digest.mjs";
import { currentVersion } from "./versions.mjs";
import { COURSE_MAP, spinePaths } from "./spine.mjs";
import { loggedDigestCap } from "../records/config.mjs";
import { correctionsToShow, revertCorrection } from "../verify/verdicts.mjs";

// ---- Alembic's limits for a hand-in (agent-runtime-v3 §22) -------------------------------------------------------
export const LIMITS = Object.freeze({ questions: 20, text: 500, choice: 120, minChoices: 2, maxChoices: 6, detail: 2000, refs: 10, wordsSuggested: 500 });
export const QUESTION_ID = /^[A-Za-z0-9_.-]{1,64}$/;
export const CHANGESET_ID = /^[A-Za-z0-9_-]{8,64}$/;
export const NEEDS_FILE = "private/coursewerk/digest/alembic-needs.json";
const DIGEST_FILE = "private/coursewerk/digest/current.json";
const KEEP_HANDINS = 50;

/** Every way a hand-in breaks Alembic's limits (empty: it will be accepted). */
export function handinProblems(h) {
  const out = [], q = h?.digest?.questions;
  if (!CHANGESET_ID.test(String(h?.changesetId ?? ""))) out.push("changesetId must be 8–64 of A-Za-z0-9_-");
  if (!Array.isArray(q)) return [...out, "digest.questions must be a list"];
  if (q.length > LIMITS.questions) out.push(`more than ${LIMITS.questions} questions`);
  const ids = new Set();
  const oneLine = (s, n) => typeof s === "string" && s.trim() && !/[\r\n]/.test(s) && s.length <= n;
  q.forEach((x, i) => {
    const at = `question ${i + 1} (${x?.id})`;
    if (!QUESTION_ID.test(String(x?.id ?? ""))) out.push(`${at}: id`);
    if (ids.has(x?.id)) out.push(`${at}: id repeated`); ids.add(x?.id);
    if (!oneLine(x?.text, LIMITS.text)) out.push(`${at}: text must be one line of at most ${LIMITS.text}`);
    if (x.choices !== undefined) {
      if (!Array.isArray(x.choices) || x.choices.length < LIMITS.minChoices || x.choices.length > LIMITS.maxChoices) out.push(`${at}: ${LIMITS.minChoices}–${LIMITS.maxChoices} choices`);
      else if (!x.choices.every((c) => oneLine(c, LIMITS.choice)) || new Set(x.choices).size !== x.choices.length) out.push(`${at}: choices must be unique single lines of at most ${LIMITS.choice}`);
    }
    if (x.recommended !== undefined && !(x.choices || []).includes(x.recommended)) out.push(`${at}: recommended must be one of the choices`);
    if (x.detail !== undefined && (typeof x.detail !== "string" || x.detail.length > LIMITS.detail)) out.push(`${at}: detail of at most ${LIMITS.detail}`);
    if (x.refs !== undefined && (!Array.isArray(x.refs) || x.refs.length > LIMITS.refs || !x.refs.every((r) => typeof r === "string" && r && !r.startsWith("/") && !r.split("/").includes("..")))) out.push(`${at}: at most ${LIMITS.refs} course paths as refs`);
    if (x.words !== undefined && !["required", "optional"].includes(x.words)) out.push(`${at}: words is "required" or "optional"`);
    if (x.wordsSuggested !== undefined && (x.words === undefined || typeof x.wordsSuggested !== "string" || x.wordsSuggested.length > LIMITS.wordsSuggested)) out.push(`${at}: wordsSuggested only with words, at most ${LIMITS.wordsSuggested}`);
    for (const k of Object.keys(x || {})) if (!["id", "text", "choices", "recommended", "detail", "refs", "words", "wordsSuggested"].includes(k)) out.push(`${at}: unknown field ${k}`);
  });
  return out;
}

const line = (s, n) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
const block = (s, n) => { const t = String(s ?? "").trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
const qid = (prefix, key) => `${prefix}.${sha256(String(key)).slice(0, 16)}`;
const refsOf = (paths) => [...new Set(paths.filter(Boolean))].slice(0, LIMITS.refs);

/**
 * The choices Coursewerk itself gives an answer to a digest entry of each kind (digest.mjs answerDigest: "confirm"
 * records a confirmation, "keep" keeps the instructor's edited text or a disputed fact as written, "accept as mine"
 * records authorship, "later" defers; the kinds' own notes ask exactly these). A kind not listed is answered in words.
 */
export const DIGEST_CHOICES = Object.freeze({
  "exercise-data-confirm": ["Confirm", "Later"],
  "confirmation-stale": ["Confirm", "Later"],
  "answer-still-correct": ["Still correct", "Later"],
  "fact-disputed": ["Keep as written", "Change it", "Later"],
  "instructor-edit-unasked": ["Keep", "Revert", "Later"],
  "unit-unknown-authorship": ["Accept as mine", "Later"],
});

/** One digest entry as Alembic's question, and what apply needs to answer it. */
export function digestQuestion(e, deliverableOf = new Map()) {
  const choices = DIGEST_CHOICES[e.kind] || null;
  const rec = e.recommendation == null ? null : String(e.recommendation).trim();
  const recommended = choices && rec ? choices.find((c) => c.toLowerCase() === rec.toLowerCase() || rec.toLowerCase().startsWith(c.toLowerCase())) : undefined;
  const ev = e.evidence || {};
  const detail = [
    String(e.question ?? "").length > LIMITS.text ? String(e.question) : "",
    e.count > 1 ? `${e.count} places raise this (chapters: ${e.chapters.join(", ")}).` : e.chapters?.length ? `Chapter: ${e.chapters.join(", ")}.` : "",
    ev.quote ? `The text: "${ev.quote}"` : "", ev.suggestion ? `Suggested: "${ev.suggestion}"` : "",
    ev.rule && ev.rule !== e.question ? `Check: ${ev.rule}` : "",
    rec && !recommended ? `Recommended${e.recommendedBy ? ` (${e.recommendedBy})` : ""}: ${rec}` : "",
    e.deferredBefore ? "Asked before and deferred." : "",
  ].filter(Boolean).join("\n");
  return {
    id: qid("d", e.key), text: line(e.question, LIMITS.text),
    ...(choices ? { choices, ...(recommended ? { recommended } : {}) } : {}),
    ...(detail ? { detail: block(detail, LIMITS.detail) } : {}),
    refs: refsOf((e.units || []).map((u) => deliverableOf.get(u)).concat(ev.file || [])),
    // an answer quotes the instructor's words (answerDigest); a free-text answer is itself their words
    words: choices ? "required" : "optional",
  };
}

const markers = (logText) => parseLog(logText).filter((r) => r.type === "contact" && r.party?.role === "harness" && r.payload?.moment === "host-answer" && r.payload?.host === "alembic");
function readNeeds(root) { try { return JSON.parse(fs.readFileSync(recordFile(root, NEEDS_FILE), "utf8")); } catch { return { schemaVersion: 1, handins: [] }; } }

/**
 * Coursewerk's open needs as Alembic's hand-in. `gate` is a runGate result (runs the gate when not given). With a
 * `model`, the digest is delivered (the M4 checkpoint is logged and its overflow remembered); corrections stay unmarked
 * until answered, since a newer hand-in replaces an unanswered one in Alembic.
 * Returns { handin, left, counts }.
 */
export async function exportNeeds(root, { changesetId, model = null, gate = null, inputsDir = null, at = new Date().toISOString() } = {}) {
  if (!CHANGESET_ID.test(String(changesetId ?? ""))) throw new Error("the changeset id must be 8–64 of A-Za-z0-9_-");
  const reader = liveReader(root), chapters = manifestChapters(reader), logText = readLogText(root);
  if (!gate) { const { runGate } = await import("../skeleton/full_gate.mjs"); gate = runGate(root, { inputsDir }); }
  const info = unitInfoOf(root, reader);
  const deliverableOf = new Map([...info].map(([k, v]) => [k, v.deliverable])), hash = new Map([...info].map(([k, v]) => [k, v.contentHash]));
  const answered = answeredBases(root);
  const items = []; // [{ question, ref }]

  // 1. interrupts: what cannot wait (D14) — interrupt findings, and the agent's M5 contacts, not yet answered
  for (const f of gate.findings.filter((x) => x.route === "interrupt" && !["resolved", "answered"].includes(x.status) && !isAnswered(answered, x, hash))) {
    const ev = f.evidence || {};
    items.push({ question: { id: qid("i", f.id), text: line(`${f.interruptReason ? `${f.interruptReason.replace(/-/g, " ")}: ` : ""}${ev.what || ev.note || ev.rule || f.kind}`, LIMITS.text),
      ...(ev.detail || ev.quote ? { detail: block(ev.detail || ev.quote, LIMITS.detail) } : {}), refs: refsOf((f.units || []).map((u) => deliverableOf.get(u)).concat(ev.file || [])), words: "optional" },
      ref: { kind: "interrupt", finding: answerKeyOf(f), basis: basisOf(f, hash) } });
  }
  for (const r of parseLog(logText).filter((x) => x.type === "contact" && x.payload?.moment === "M5")) {
    const finding = `contact:${r.seq}`, basis = sha256(String(r.payload.question || ""));
    if (answered.has(`${finding}|${basis}`)) continue;
    items.push({ question: { id: `m5.${r.seq}`, text: line(`${String(r.payload.reason || "").replace(/-/g, " ")}: ${r.payload.question}`, LIMITS.text), words: "optional" }, ref: { kind: "interrupt", finding, basis } });
  }

  // 2. plan approvals ready by Coursewerk's own precondition (the same as `coursewerk.mjs approve`, without --without-review)
  const status = approvalStatus(reader, chapters, logText), states = chapterStates(root, reader);
  for (const ch of [...chapters, null]) {
    const s = ch ? status.scopes[ch] : status.scopes.course;
    if (!s || s.valid || (ch && (!states[ch] || states[ch].state === "DRAFT"))) continue;
    if (approvalPrecondition(root, reader, chapters, { chapter: ch }).problem) continue;
    const scope = ch ? `chapter:${ch}` : "course";
    const title = ch ? (() => { try { return manifestUnits(JSON.parse(reader.text("alembic.json"))).find((c) => c.slug === ch)?.title || ch; } catch { return ch; } })() : "the course";
    const { map, guide } = ch ? spinePaths(ch) : { map: COURSE_MAP, guide: null };
    const why = s.change?.kind === "unapproved" ? "Not approved before." : s.change?.reasons?.[0]?.why ? `Changed since the last approval: ${s.change.reasons[0].why}.` : "Changed since the last approval.";
    items.push({ question: { id: `approve.${(ch || "course").slice(0, 42)}.${s.contentHash.slice(0, 12)}`, text: line(ch ? `Approve the plan for "${title}" (its concept map and assessment guide)?` : "Approve the course map?", LIMITS.text),
      choices: ["Approve", "Not yet"],
      detail: block(`Covers: ${s.covers.join(", ")}.\nVersion ${currentVersion(logText, scope)}. ${why}\nAn approval quotes your words; read the plan first (the links).`, LIMITS.detail),
      refs: refsOf([map, guide]), words: "required" },
      ref: { kind: "approval", chapter: ch, contentHash: s.contentHash, courseSliceHash: s.courseSliceHash ?? null } });
  }

  // 3. corrections the agent made, to keep or undo (outside the digest's budget, as in the checkpoint digest)
  for (const c of correctionsToShow(root)) {
    items.push({ question: { id: `c.${String(c.id).replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 60)}`, text: line(`A correction was made in ${c.deliverable}: keep it, or undo it?`, LIMITS.text),
      choices: ["Keep", "Undo"], recommended: "Keep",
      detail: block(`${c.diff}${c.evidence?.[0] ? `\nSource (${c.evidence[0].source}): "${c.evidence[0].quote}"` : ""}\nTo undo it, say why your text stands.`, LIMITS.detail),
      refs: refsOf([c.deliverable]), words: "optional" },
      ref: { kind: "correction", correction: c.id } });
  }

  // 4. the checkpoint digest, within the instructor's digest cap and what is left of the 20
  const room = Math.max(0, LIMITS.questions - items.length);
  const d = buildDigest(root, gate.findings, info, { cap: Math.min(Number(loggedDigestCap(logText) || DEFAULT_CAP), room), corrections: [] });
  let prev = null; try { prev = JSON.parse(fs.readFileSync(recordFile(root, DIGEST_FILE), "utf8")); } catch { prev = null; }
  for (const e of d.entries) { const p = prev?.entries?.find((x) => x.key === e.key && String(x.recommendedBy || "").startsWith("agent")); if (p) { e.recommendation = p.recommendation; e.recommendedBy = p.recommendedBy; } }
  for (const e of d.entries) items.push({ question: digestQuestion(e, deliverableOf), ref: { kind: "digest", entry: e } });

  const shown = items.slice(0, LIMITS.questions), left = items.length - shown.length + d.deferred.count;
  const handin = { changesetId, digest: { questions: shown.map((x) => x.question) } };
  const problems = handinProblems(handin);
  if (problems.length) throw new Error(`the hand-in would break Alembic's limits: ${problems.slice(0, 3).join("; ")}`);

  const needs = readNeeds(root);
  needs.handins = [...(needs.handins || []).filter((h) => h.changesetId !== changesetId), { changesetId, at, questions: Object.fromEntries(shown.map((x) => [x.question.id, { ...x.ref, choices: x.question.choices || null, words: x.question.words }])) }].slice(-KEEP_HANDINS);
  fs.mkdirSync(recordFile(root, "private/coursewerk/digest"), { recursive: true });
  fs.writeFileSync(recordFile(root, NEEDS_FILE), JSON.stringify(needs, null, 2) + "\n");
  fs.writeFileSync(recordFile(root, DIGEST_FILE), JSON.stringify({ at, ...d }, null, 2) + "\n");
  if (model) deliverDigest(root, d, { role: "agent", name: "executor", model });
  const by = (k) => shown.filter((x) => x.ref.kind === k).length;
  return { handin, left, delivered: !!model, counts: { interrupts: by("interrupt"), approvals: by("approval"), corrections: by("correction"), digest: by("digest") } };
}

/**
 * Record the answers of `alembic changes` (its JSON) that answer our questions. Returns { recorded, skipped, ignored }:
 * recorded [{ question, item, outcome, seq }], skipped [{ question, item, reason }], ignored = answers to questions
 * Coursewerk did not ask (or Alembic's course-change decisions, which this does not read).
 */
export function applyChanges(root, changes) {
  const answers = [...(Array.isArray(changes?.answers) ? changes.answers : [])].sort((a, b) => String(a?.at).localeCompare(String(b?.at)));
  const needs = readNeeds(root), done = new Set(markers(readLogText(root)).map((r) => r.payload.item));
  const recorded = [], skipped = []; let ignored = 0;
  for (const a of answers) {
    const q = needs.handins?.find((h) => h.changesetId === a?.changesetId)?.questions?.[a?.question];
    if (!q) { ignored++; continue; }
    const skip = (reason) => skipped.push({ question: a.question, item: a.item ?? null, reason });
    if (a.item == null || done.has(a.item)) { skip(a.item == null ? "the answer has no item id" : "already recorded"); continue; }
    const name = String(a.by?.name || a.by?.id || "").trim();
    if (!name) { skip("the answer does not say who gave it"); continue; }
    const answer = String(a.answer ?? "").trim(), words = hasVisibleWords(a.words) ? String(a.words).trim() : null;
    if (!answer) { skip("the answer is empty"); continue; }
    if (q.choices && !q.choices.includes(answer)) { skip(`"${line(answer, 60)}" is not one of the choices`); continue; }
    if (q.words === "required" && !words && !(q.kind === "approval" && answer === "Not yet")) { skip("the instructor's words are required and were not given"); continue; }
    const party = { role: "instructor", name };
    const reader = liveReader(root);
    let outcome, seq = null;
    try {
      if (q.kind === "interrupt") {
        seq = appendLogRecord(root, { type: "answer", party, payload: { answers: [{ finding: q.finding, basis: q.basis, choice: answer, entry: `interrupt:${q.finding}` }], acceptAll: false, instructorWords: words || answer } }).seq;
        outcome = "answered";
      } else if (q.kind === "approval") {
        if (answer === "Not yet") outcome = "left open";
        else {
          const chapters = manifestChapters(reader), s = approvalStatus(reader, chapters, readLogText(root)).scopes[q.chapter || "course"];
          if (!s) { skip("the chapter is no longer in the course"); continue; }
          if (s.valid) { skip("already approved at its current content"); continue; }
          if (s.contentHash !== q.contentHash || (q.chapter && s.courseSliceHash !== q.courseSliceHash)) { skip("the plan changed since it was asked"); continue; }
          if (q.chapter && chapterStates(root, reader)[q.chapter]?.state === "DRAFT") { skip("the chapter is a draft again"); continue; }
          const pre = approvalPrecondition(root, reader, chapters, { chapter: q.chapter });
          if (pre.problem) { skip(pre.problem); continue; }
          seq = recordApproval(root, reader, chapters, { chapter: q.chapter, instructorWords: words, note: pre.note }, party).seq;
          outcome = "approved";
        }
      } else if (q.kind === "correction") {
        if (answer === "Undo") {
          if (!words) { skip("an undo records why the text stands: the instructor's words are required"); continue; }
          revertCorrection(root, reader, q.correction, { note: words }, party);
          outcome = "undone";
        } else {
          // kept: shown and answered, as `coursewerk.mjs digest --deliver` marks a correction shown
          if (correctionsToShow(root).some((c) => c.id === q.correction))
            seq = appendLogRecord(root, { type: "revision", party: { role: "harness", name: "corrections" }, payload: { event: "corrections-shown", corrections: [q.correction] } }).seq;
          outcome = "kept";
        }
      } else if (q.kind === "digest") {
        const e = q.entry;
        answerDigest(root, { entries: [e] }, { answers: { [e.key]: answer }, instructorWords: words || answer, reader }, party);
        outcome = /^\s*later\b/i.test(answer) ? "deferred" : "answered";
      } else { skip(`unknown question kind ${q.kind}`); continue; }
    } catch (err) { skip(err.message); continue; }
    // the answer's Alembic provenance, after it: never recorded twice
    appendLogRecord(root, { type: "contact", party: { role: "harness", name: "alembic-needs" }, payload: {
      moment: "host-answer", host: "alembic", item: a.item, changesetId: a.changesetId, question: a.question, answer, outcome,
      by: { id: a.by?.id ?? null, name: a.by?.name ?? null }, at: a.at ?? null, ...(a.via ? { via: a.via } : {}), ...(seq ? { recorded: seq } : {}) } });
    done.add(a.item);
    recorded.push({ question: a.question, item: a.item, outcome, ...(seq ? { seq } : {}) });
  }
  return { recorded, skipped, ignored };
}
