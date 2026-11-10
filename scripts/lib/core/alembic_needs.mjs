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
// Every question is worded for the instructor (needs_wording.mjs; STATUS D-133, req.host.alembic-needs-wording): places
// as they see them, content as it reads, no path, line or harness code. The harness's own wording and codes are kept in
// that record, as each question's `assistant`, for the assistant — never in the hand-in.
import fs from "node:fs";
import { canonicalJson, sha256 } from "../records/canonical.mjs";
import { appendLogRecord, parseLog, readLogText } from "../records/log.mjs";
import { recordFile } from "../records/paths.mjs";
import { hasVisibleWords } from "../records/words.mjs";
import { liveReader, manifestChapters, manifestUnits } from "./package_reader.mjs";
import { approvalStatus, recordApproval } from "./approvals.mjs";
import { approvalPrecondition } from "./spine_review.mjs";
import { chapterStates, unitInfoOf } from "./workflow.mjs";
import { BINDING_KINDS, SAID, saidOwed, answerDigest, answeredBases, answerKeyOf, basisOf, buildDigest, deliverDigest, DEFAULT_CAP, isAnswered } from "./digest.mjs";
import { currentVersion } from "./versions.mjs";
import { COURSE_MAP, nodeIndex, parseSpine, spinePaths } from "./spine.mjs";
import { loggedDigestCap } from "../records/config.mjs";
import { correctionsToShow, revertCorrection } from "../verify/verdicts.mjs";
import { instructorRegister } from "./units_index.mjs";
import { holdersOf } from "./authorship.mjs";
import { loadUnits } from "./obligations.mjs";
import { unitHash } from "./segment.mjs";
import { assistantCodes, changedSpan, CONTROL, forInstructor, placeOf, plainText, reasonLabel, recommendationLine, sentence, shorten, wordEntry } from "./needs_wording.mjs";

// ---- Alembic's limits for a hand-in (agent-runtime-v3 §22) -------------------------------------------------------
export const LIMITS = Object.freeze({ questions: 20, text: 500, choice: 120, minChoices: 2, maxChoices: 6, detail: 2000, refs: 10, wordsSuggested: 500 });
export const QUESTION_ID = /^[A-Za-z0-9_.-]{1,64}$/;
export const CHANGESET_ID = /^[A-Za-z0-9_-]{8,64}$/;
export const NEEDS_FILE = "private/coursewerk/digest/alembic-needs.json";
const DIGEST_FILE = "private/coursewerk/digest/current.json";
const KEEP_HANDINS = 50;
const NEEDS_BYTES = 3 * 1024 * 1024;

/** A course path as Alembic's normalizePath takes it (package-contract contract-v3.ts): NFC, no leading slash, backslash,
 *  percent sign, control or format character, empty or dot segment; at most 1,024 bytes, 255 per segment. */
export function coursePath(p) {
  if (typeof p !== "string" || !p || p.normalize("NFC") !== p || p.startsWith("/") || /[\\%]/.test(p) || /[\u0000-\u001f\u007f]|\p{Cf}/u.test(p)) return false;
  if (Buffer.byteLength(p, "utf8") > 1024) return false;
  return p.split("/").every((seg) => seg && seg !== "." && seg !== ".." && Buffer.byteLength(seg, "utf8") <= 255);
}
/** Every way a hand-in breaks Alembic's limits (empty: it will be accepted). */
export function handinProblems(h) {
  const out = [], q = h?.digest?.questions;
  if (!CHANGESET_ID.test(String(h?.changesetId ?? ""))) out.push("changesetId must be 8–64 of A-Za-z0-9_-");
  if (!Array.isArray(q)) return [...out, "digest.questions must be a list"];
  if (q.length > LIMITS.questions) out.push(`more than ${LIMITS.questions} questions`);
  const ids = new Set();
  const oneLine = (s, n) => typeof s === "string" && s.trim() && !/[\r\n]/.test(s) && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s) && s.length <= n;
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
    if (x.refs !== undefined && (!Array.isArray(x.refs) || x.refs.length > LIMITS.refs || !x.refs.every(coursePath))) out.push(`${at}: at most ${LIMITS.refs} course paths as refs`);
    if (x.words !== undefined && !["required", "optional"].includes(x.words)) out.push(`${at}: words is "required" or "optional"`);
    if (x.wordsSuggested !== undefined && (x.words === undefined || typeof x.wordsSuggested !== "string" || x.wordsSuggested.length > LIMITS.wordsSuggested)) out.push(`${at}: wordsSuggested only with words, at most ${LIMITS.wordsSuggested}`);
    for (const k of Object.keys(x || {})) if (!["id", "text", "choices", "recommended", "detail", "refs", "words", "wordsSuggested"].includes(k)) out.push(`${at}: unknown field ${k}`);
  });
  return out;
}

// what Alembic refuses (agent-api.ts oneLine) never reaches a hand-in: control characters are spaces (round 3, MEDIUM-3)
const line = (s, n) => { const t = String(s ?? "").replace(CONTROL, " ").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
const block = (s, n) => { const t = String(s ?? "").replace(CONTROL, " ").trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
const qid = (prefix, key) => `${prefix}.${sha256(String(key)).slice(0, 16)}`;
const refsOf = (paths) => [...new Set(paths.filter((p) => p && coursePath(p)))].slice(0, LIMITS.refs);

/**
 * The choices Coursewerk itself gives an answer to a digest entry of each kind (digest.mjs answerDigest: "confirm"
 * records a confirmation, "keep" keeps the instructor's edited text or a disputed fact as written, "accept as mine"
 * records authorship, "later" defers; the kinds' own notes ask exactly these). A kind not listed takes the wording's
 * choices where an answer's meaning is Coursewerk's own (needs_wording.mjs wordEntry: "Apply the suggestion" is
 * ms8-verdicts' acceptance), else it is answered in words.
 */
export const DIGEST_CHOICES = Object.freeze({
  "exercise-data-confirm": ["Confirm", "Later"],
  "confirmation-stale": ["Confirm", "Later"],
  "answer-still-correct": ["Still correct", "Later"],
  "fact-disputed": ["Keep as written", "Change it", "Later"],
  "instructor-edit-unasked": ["Keep", "Revert", "Later"],
  "unit-unknown-authorship": ["Accept as mine", "Later"],
});

/** A recommendation is pre-chosen only when it is that choice, or that choice and more words after it ("Keep it, as
 *  …"), never another word that starts the same ("Keep items 1 and 2", audit round 1, LOW-1). */
const isChoice = (rec, choice) => { const r = rec.toLowerCase(), c = choice.toLowerCase(); return r === c || (r.startsWith(c) && !/[\p{L}\p{N}]/u.test(r[c.length])); };

/**
 * One digest entry as Alembic's question, and what apply needs to answer it. Worded for the instructor
 * (needs_wording.mjs, D-133): the place as they see it, content as it reads, no harness code; `ctx` is needsContext's
 * (without it, the place is said from the refs alone). The harness's own wording goes to the assistant (assistantPart).
 */
export function digestQuestion(e, deliverableOf = new Map(), ctx = {}) {
  const c = { ...ctx, deliverableOf: ctx.deliverableOf || deliverableOf };
  const worded = wordEntry(e, c);
  const text = String(worded.text).replace(/\s+/g, " ").trim();
  // what an answer adopts or confirms is shown in full, first (audit round 1, HIGH-1); if it cannot all be shown, the
  // question offers no one-click choice: the instructor reads the page (the links) and answers in their words
  // P2 (rounds 1, 2): what is on no page (a suggestion, a removed passage) always first and in full; then the texts the
  // page holds. Only when all of it is shown, and every unit the answer binds could be read, is a one-click choice offered;
  // otherwise the question says the page holds the exact text, and the answer is in the instructor's words
  // Round 3: the off-page texts (a suggestion, a removed passage; on no page) are budgeted first. What the page holds is
  // shown when it fits; when it does not, the choices stay (the answer binds the passage only as it was asked: apply
  // checks it is unchanged, HIGH-2) and the question says the page holds the exact text — but nothing is pre-chosen, so
  // "Accept all" never takes an answer about text the question could not show. A unit the context could not read, or an
  // off-page text that cannot be shown, offers no choice that binds it (a suggestion: no "Apply", said plainly: MEDIUM-7).
  const sh = worded.shown || [], off = sh.filter((x) => !x.page), on = sh.filter((x) => x.page).map((x) => x.text);
  const head = [text.length > LIMITS.text ? text : "", ...off.map((x) => x.text)].filter(Boolean).join("\n");
  const offFits = head.length <= LIMITS.detail - 400, shown = [head, ...on].filter(Boolean).join("\n");
  const allFits = offFits && shown.length <= LIMITS.detail - 200;
  let choices = worded.unseen ? null : DIGEST_CHOICES[e.kind] || worded.choices || null;
  let tooLong = "";
  if (choices && !offFits) {
    // a kind whose answer confirms, claims or adopts (round 4, MEDIUM-2): its own choices stay, never pre-chosen — the
    // answer is checked against the passage as asked (bindingGuard), and the words it removed are in the assistant's record
    if (BINDING_KINDS.has(e.kind)) tooLong = "The words this question is about are too long to show here in full; they are kept in the assistant's record. Your answer applies to the text exactly as it was when asked; if it has changed, you are asked again.";
    else if (off.some((x) => x.suggestion) && !off.some((x) => !x.suggestion)) {
      choices = choices.filter((x) => !/^apply\b/i.test(x));
      tooLong = "This suggestion is too long to show here in full, so it can't be applied from Alembic: choose another answer, or ask the assistant in your own words to apply it in a job.";
    } else choices = null;
    if (choices && choices.length < LIMITS.minChoices) choices = null;
  }
  const rec = e.recommendation == null ? null : String(e.recommendation).trim();
  // never pre-chosen: applying a reviewer's suggestion, or claiming authorship (round 2, MEDIUM-D, MEDIUM-F), nor any
  // answer about text the question could not show in full (round 3)
  const recommended = allFits && choices && rec ? choices.find((x) => isChoice(rec, x) && !/^(?:apply|accept as mine)\b/i.test(x)) : undefined;
  const ev = e.evidence || {};
  const places = [...new Set((e.chapters || []).filter((x) => x !== "package").map((x) => `“${c.titles?.get?.(x) || x}”`))];
  const detail = [
    allFits ? shown
      : offFits ? [head, worded.unseen ? "The passage could not be read here. Answer in your own words: they go to the assistant, which takes them up; nothing is confirmed or kept from words alone." : "The whole passage is too long to show here: the page (the link) holds the exact text, and your answer applies to it as it reads there. If it changes before your answer is recorded, you are asked again."].filter(Boolean).join("\n")
      : [tooLong || "The text this answer would adopt is too long to show here: answer in your own words, and the assistant takes it up.", shorten(head, LIMITS.detail - 600)].join("\n"),
    worded.detail,
    e.count > 1 ? `This comes up in ${e.count} places${places.length ? ` (${places.join(", ")})` : ""}; one answer settles them all.` : "",
    // the recommendation's own words whenever they say more than the choice pre-chosen (MEDIUM-F)
    !recommended || rec.toLowerCase() !== recommended.toLowerCase() ? recommendationLine(e, c) : "",
    e.deferredBefore ? "You chose Later last time." : "",
  ].filter(Boolean).join("\n");
  return {
    id: qid("d", e.key), text: line(text, LIMITS.text),
    ...(choices ? { choices, ...(recommended ? { recommended } : {}) } : {}),
    ...(detail ? { detail: block(detail, LIMITS.detail) } : {}),
    refs: refsOf((e.units || []).map((u) => c.deliverableOf.get(u)).concat(ev.file || [])),
    // an answer quotes the instructor's words (answerDigest); a free-text answer is itself their words
    words: choices ? "required" : "optional",
  };
}

/**
 * What the wording reads (D-133): chapter titles, the plan's nodes (id → its words) and each unit's place, form and
 * text. Read-only, from the package as it stands; a part that cannot be read is simply left out.
 */
export function needsContext(root, reader, chapters = manifestChapters(reader)) {
  const titles = new Map();
  try { for (const c of manifestUnits(JSON.parse(reader.text("alembic.json")))) if (c.title) titles.set(c.slug, String(c.title)); } catch { /* no titles: slugs read as words */ }
  let nodes = new Map(); try { nodes = nodeIndex(parseSpine(reader, chapters)); } catch { nodes = new Map(); }
  // the units as they read NOW (loadUnits re-segments the files: what confirmUnits, claimAuthorship and
  // adoptInstructorText bind), never the sidecar as last indexed (D-133 audit round 4, HIGH-1)
  const units = new Map(), deliverableOf = new Map(), live = new Map(), adopts = new Map();
  let all = []; try { all = loadUnits(root, reader); } catch { all = []; }
  for (const u of all) {
    units.set(u.id, { deliverable: u.locator?.deliverable, form: u.form, text: u.text });
    deliverableOf.set(u.id, u.locator?.deliverable); live.set(u.id, unitHash(u.text));
  }
  // what a "keep" of an unasked edit adopts (units_index.mjs adoptInstructorText): every holder of a registered text the
  // unit holds — shown, and checked as asked, with it (round 4, MEDIUM-7; the finding itself names the unit only)
  try {
    for (const [ref, hs] of holdersOf(instructorRegister(root), all)) {
      const ids = hs.map((u) => u.id);
      for (const id of ids) adopts.set(id, [...new Set([...(adopts.get(id) || [id]), ...ids])].sort());
      // keyed by the registered text as well (round 5, HIGH-1): a removal binds whatever holds the removed words NOW, so
      // a "keep it removed" is asked again once any unit holds them again — it never adopts that unit
      adopts.set(ref, [...new Set([...(adopts.get(ref) || []), ...ids])].sort());
    }
  } catch { /* no register: a unit adopts itself */ }
  return { titles, nodes, units, deliverableOf, live, adopts };
}
/** The units an answer to this entry binds: an unasked edit's "keep" adopts every holder of the text (adopts). */
export const boundUnits = (e, ctx) => [...new Set((e.units || []).flatMap((u) => (e.kind === "instructor-edit-unasked" ? [u, ...(ctx.adopts?.get?.(u) || [])] : [u])))];

/** The harness's own words and codes for a question, kept for the assistant in the needs record (never handed in). */
// bounded (audit round 1, LOW-2): the record keeps 50 hand-ins of 20 questions within Alembic's per-file limit
// (round 3, MEDIUM-4: 20 questions x 50 hand-ins under Alembic's 4 MB, measured in UTF-8 bytes as written)
const ASSISTANT_LIMIT = 2400;
const bytes = (x) => Buffer.byteLength(JSON.stringify(x, null, 2), "utf8");
function assistantPart(text, ...more) {
  const part = { text: line(text, 1200), codes: assistantCodes(text, ...more) };
  while (bytes(part) > ASSISTANT_LIMIT) {
    const [k, v] = Object.entries(part.codes).sort((a, b) => JSON.stringify(b[1]).length - JSON.stringify(a[1]).length)[0] || [];
    if (k && v.length > 1) part.codes[k] = v.slice(0, Math.ceil(v.length / 2));
    else if (part.text.length > 200) part.text = line(part.text, Math.max(200, part.text.length - 500));
    else break;
  }
  return part;
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
  const ctx = needsContext(root, reader, chapters);
  const fi = (t) => forInstructor(t, ctx);
  const items = []; // [{ question, ref, assistant }]

  // 1. interrupts: what cannot wait (D14) — interrupt findings, and the agent's M5 contacts, not yet answered
  for (const f of gate.findings.filter((x) => x.route === "interrupt" && !["resolved", "answered"].includes(x.status) && !isAnswered(answered, x, hash))) {
    const ev = f.evidence || {}, raw = `${f.interruptReason ? `${f.interruptReason.replace(/-/g, " ")}: ` : ""}${ev.what || ev.note || ev.rule || f.kind}`;
    const said = fi(ev.what || ev.note || ev.rule || f.kind.replace(/-/g, " ")), more = typeof ev.detail === "string" ? fi(ev.detail) : ev.quote ? `The text: “${shorten(plainText(ev.quote), 400)}”` : "";
    items.push({ question: { id: qid("i", f.id), text: line(`${f.interruptReason ? `${reasonLabel(f.interruptReason)}: ` : ""}${sentence(said.replace(/^\p{Ll}/u, (x) => x.toUpperCase()))}`, LIMITS.text),
      ...(more ? { detail: block(more, LIMITS.detail) } : {}), refs: refsOf((f.units || []).map((u) => deliverableOf.get(u)).concat(ev.file || [])), words: "optional" },
      ref: { kind: "interrupt", finding: answerKeyOf(f), basis: basisOf(f, hash) }, assistant: { kind: f.kind, units: f.units || [], ...assistantPart(raw, typeof ev.detail === "string" ? ev.detail : "") } });
  }
  for (const r of parseLog(logText).filter((x) => x.type === "contact" && x.payload?.moment === "M5")) {
    const finding = `contact:${r.seq}`, basis = sha256(String(r.payload.question || ""));
    if (answered.has(`${finding}|${basis}`)) continue;
    items.push({ question: { id: `m5.${r.seq}`, text: line(`${reasonLabel(r.payload.reason)}: ${sentence(forInstructor(r.payload.question, ctx, { from: "agent" }))}`, LIMITS.text), words: "optional" }, ref: { kind: "interrupt", finding, basis },
      assistant: { kind: "M5", ...assistantPart(`${String(r.payload.reason || "").replace(/-/g, " ")}: ${r.payload.question}`) } });
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
    items.push({ question: { id: `approve.${(ch || "course").slice(0, 42)}.${s.contentHash.slice(0, 12)}`, text: line(ch ? `Approve the plan for “${title}” (its concept map and assessment guide)?` : "Approve the course map?", LIMITS.text),
      choices: ["Approve", "Not yet"],
      detail: block(`${fi(why)}${currentVersion(logText, scope) > 1 ? ` This is version ${currentVersion(logText, scope)} of the plan.` : ""}\nAn approval quotes your words; read the plan first (the links).`, LIMITS.detail),
      refs: refsOf([map, guide]), words: "required" },
      ref: { kind: "approval", chapter: ch, contentHash: s.contentHash, courseSliceHash: s.courseSliceHash ?? null },
      assistant: { kind: "approval", scope, ...assistantPart(`Covers: ${s.covers.join(", ")}. Version ${currentVersion(logText, scope)}. ${why}`) } });
  }

  // 3. corrections the agent made, to keep or undo (outside the digest's budget, as in the checkpoint digest)
  for (const c of correctionsToShow(root)) {
    const lines = String(c.diff || "").split("\n"), side = (m) => lines.filter((l) => l.startsWith(`${m} `) || l === m).map((l) => l.slice(2)).join("\n");
    const span = changedSpan(side("-"), side("+")), whole = changedSpan(side("-"), side("+"), 4, { full: true }), src = c.evidence?.[0];
    const full = `Before: “${plainText(side("-"))}”\nAfter: “${plainText(side("+"))}”\n${src ? `The source says: “${shorten(plainText(src.quote), 400)}”\n` : ""}To undo it, say why your text stands.`;
    items.push({ question: { id: `c.${String(c.id).replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 60)}`,
      text: line(`In ${placeOf(c.deliverable, ctx) || "the course"}, the assistant corrected “${span.was}” to “${span.now}”, because a source contradicted it. Keep the correction, or undo it?`, LIMITS.text),
      // "Keep" adopts the corrected text: before and after in full (HIGH-1), then the source; when they cannot be shown
      // in full, no one-click Keep (apply records any answer but "Undo" as kept)
      // when they cannot be shown in full, the page holds the corrected passage exactly as Keep leaves it (it is applied
      // there): the question says so, and Keep / Undo stay the only answers (round 2, HIGH-B)
      // round 3 (MEDIUM-5): the words a correction removes are on no page: shown whole when they fit, and a long correction
      // is never pre-chosen (so "Accept all" leaves it to the instructor)
      choices: ["Keep", "Undo"], ...(full.length <= LIMITS.detail ? { recommended: "Keep" } : {}),
      detail: full.length <= LIMITS.detail ? full : block(`The corrected passage is too long to show here: it is on the page (the link), exactly as Keep leaves it. ${`It removed: “${whole.was}”`.length <= LIMITS.detail - 600 ? `It removed: “${whole.was}”\nIn its place: “${whole.now}”` : `The change, in part: “${span.was}” → “${span.now}” (the removed words are too long to show here; they are in the correction's record)`}\n${src ? `The source says: “${shorten(plainText(src.quote), 300)}”\n` : ""}To undo it, say why your text stands.`, LIMITS.detail),
      refs: refsOf([c.deliverable]), words: "optional" },
      ref: { kind: "correction", correction: c.id }, assistant: { kind: "correction", unit: c.unit, ...assistantPart(`A correction was made in ${c.deliverable} (${c.unit}):\n${c.diff}${src ? `\nSource (${src.source})` : ""}`) } });
  }

  // 4. the checkpoint digest, within the instructor's digest cap and what is left of the 20
  const room = Math.max(0, LIMITS.questions - items.length);
  const d = buildDigest(root, gate.findings, info, { cap: Math.min(Number(loggedDigestCap(logText) || DEFAULT_CAP), room), corrections: [] });
  let prev = null; try { prev = JSON.parse(fs.readFileSync(recordFile(root, DIGEST_FILE), "utf8")); } catch { prev = null; }
  for (const e of d.entries) { const p = prev?.entries?.find((x) => x.key === e.key && String(x.recommendedBy || "").startsWith("agent")); if (p) { e.recommendation = p.recommendation; e.recommendedBy = p.recommendedBy; } }
  for (const e of d.entries) items.push({ question: digestQuestion(e, deliverableOf, ctx), ref: { kind: "digest", entry: e },
    // bounded (round 2, LOW-K): the entry itself (in ref) keeps every unit
    assistant: { kind: e.kind, module: e.module, units: (e.units || []).slice(0, 20), ...((e.units || []).length > 20 ? { unitCount: e.units.length } : {}), ...assistantPart(String(e.question ?? ""), e.evidence?.rule, e.recommendation, e.evidence?.file && e.evidence?.line ? `${e.evidence.file} line ${e.evidence.line}` : "") } });

  const shown = items.slice(0, LIMITS.questions), left = items.length - shown.length + d.deferred.count;
  const handin = { changesetId, digest: { questions: shown.map((x) => x.question) } };
  const problems = handinProblems(handin);
  if (problems.length) throw new Error(`the hand-in would break Alembic's limits: ${problems.slice(0, 3).join("; ")}`);

  const needs = readNeeds(root);
  needs.handins = [...(needs.handins || []).filter((h) => h.changesetId !== changesetId), { changesetId, at, questions: Object.fromEntries(shown.map((x) => [x.question.id, { ...boundRef(x.ref, ctx), choices: x.question.choices || null, words: x.question.words, ...(x.assistant ? { assistant: x.assistant } : {}) }])) }].slice(-KEEP_HANDINS);
  // within Alembic's 4 MB a record file may hold: the oldest hand-ins go first, never the one just made (MEDIUM-4)
  while (needs.handins.length > 1 && Buffer.byteLength(JSON.stringify(needs), "utf8") > NEEDS_BYTES) needs.handins.shift();
  fs.mkdirSync(recordFile(root, "private/coursewerk/digest"), { recursive: true });
  fs.writeFileSync(recordFile(root, NEEDS_FILE), JSON.stringify(needs) + "\n");
  fs.writeFileSync(recordFile(root, DIGEST_FILE), JSON.stringify({ at, ...d }, null, 2) + "\n");
  if (model) deliverDigest(root, d, { role: "agent", name: "executor", model });
  const by = (k) => shown.filter((x) => x.ref.kind === k).length;
  return { handin, left, delivered: !!model, owed: owedWords(root), counts: { interrupts: by("interrupt"), approvals: by("approval"), corrections: by("correction"), digest: by("digest") } };
}

/** The kinds whose answer confirms, claims or adopts what units hold (digest.mjs CONFIRMS, CLAIMS, ADOPTS). */
// the kinds whose answer confirms, adopts or claims what units hold: digest.mjs's own lists (CONFIRMS, ADOPTS, CLAIMS)
// (round 6: derived, never a hand copy)
/** Choices that ask the agent to act on the instructor's words: recorded like words ("said: …"), owed until taken up
 *  (round 6, MEDIUM-2). */
const ACT_CHOICES = new Set(["Change it differently", "Drop it"]);
/** What the record keeps of a question: a digest entry with the content hash of each unit as asked (`seen`, HIGH-2), and
 *  its evidence bounded (apply reads its key, kind, units and bases, never its evidence: MEDIUM-4). */
function boundRef(ref, ctx) {
  if (ref.kind !== "digest") return ref;
  const e = ref.entry, ev = e.evidence || {};
  const evidence = JSON.stringify(ev).length <= 1500 ? ev : Object.fromEntries(Object.entries(ev).filter(([, v]) => typeof v !== "object" && String(v).length <= 200).concat([["bounded", sha256(JSON.stringify(ev))]]));
  // round 4 (HIGH-1): the hash of each bound unit's LIVE text (unitHash), or "absent" for a unit no file holds now
  return { ...ref, entry: { ...e, evidence }, seen: Object.fromEntries(boundUnits(e, ctx).map((u) => [u, ctx.live.get(u) ?? "absent"])) };
}
/**
 * THE BINDING GUARD (D-133 audit rounds 3–6): a digest choice runs its act (confirm, keep, adopt, claim, revert, apply)
 * only when, for every unit it touches, the indexed text (the sidecar's contentHash: what claimAuthorship and the index's
 * holders read), the live text (loadUnits: what confirmUnits and adoptInstructorText read) and the text the question
 * showed (`seen`) are the same. The binding acts read different representations of a passage; this one rule makes them
 * agree, so no act binds words the question did not show. Every digest choice passes through it; a new binding kind is
 * guarded by construction. Fail-safe: no `seen`, a touched unit `seen` does not name, an unindexed or unread unit, or any
 * mismatch → false (asked again). A unit recorded "absent" passes only while neither the files nor the index hold it.
 * Returns { ok, why }.
 */
export function bindingGuard(root, reader, q, e) {
  const seen = q?.seen;
  if (!seen || typeof seen !== "object") return { ok: false, why: "asked before the passage check" };
  const ctx = needsContext(root, reader), indexed = new Map([...unitInfoOf(root, reader)].map(([k, v]) => [k, v.contentHash]));
  const touched = [...new Set([...(e.units || []), ...boundUnits(e, ctx), ...Object.keys(seen)])];
  for (const u of touched) {
    if (!Object.hasOwn(seen, u)) return { ok: false, why: `${u} was not shown` };
    const h = seen[u];
    if (h === "absent") { if (ctx.live.has(u) || indexed.has(u)) return { ok: false, why: `${u} exists again` }; continue; }
    if (typeof h !== "string" || !h || ctx.live.get(u) !== h) return { ok: false, why: `${u} changed since it was asked` };
    if (indexed.get(u) !== h) return { ok: false, why: `${u} is not indexed as it reads` };
  }
  return { ok: true };
}

/**
 * The agent records what it did with words the instructor answered in ("said: …"): the question is then answered
 * (digest.mjs answeredBases). `note`: what was done, in the agent's words. Returns the log record.
 */
export function takenUp(root, { changesetId, question, note }, party) {
  if (party?.role !== "agent") throw new Error("taking up the instructor's words is the agent's record");
  if (!hasVisibleWords(note)) throw new Error("say what you did with the instructor's words: --note \"…\"");
  // resolved from what is owed (the log), so a hand-in the record no longer keeps can still be taken up (round 5, LOW-4)
  const mine = owedWords(root).filter((o) => o.changesetId === changesetId && o.question === question);
  if (!mine.length) throw new Error(`no words of the instructor's are owed on question ${question} of hand-in ${changesetId}`);
  // a question that confirms, claims or adopts stays the instructor's to answer by a choice: taking up the words does
  // not answer it, and it is asked again (round 5, MEDIUM-5); an unknown kind is treated so (fail-safe)
  const binding = mine.some((o) => !o.kind || BINDING_KINDS.has(o.kind));
  return appendLogRecord(root, { type: "revision", party, payload: { event: "said-taken-up", answers: mine.flatMap((o) => o.answers.map((x) => x.seq)), changesetId, question, note: String(note).trim(), words: mine.flatMap((o) => o.answers.map((x) => x.answer)), ...(binding ? { binding: true } : {}) } });
}

/** The instructor's words still owed to the agent, one entry per question (changeset and question; round 6, LOW-4):
 *  [{ changesetId, question, kind, answers: [{ seq, answer, words }] }] — each said answer (the answer box) with the words
 *  box (round 6, MEDIUM-6), matched to the host-answer marker apply wrote right after it. */
export function owedWords(root) {
  const owed = saidOwed(root);
  if (!owed.size) return [];
  const marks = markers(readLogText(root)).filter((m) => m.payload.outcome === "said");
  const groups = new Map();
  for (const o of owed.values()) {
    const m = marks.find((x) => x.seq > o.seq);
    const k = `${m?.payload.changesetId ?? null}|${m?.payload.question ?? null}`;
    const g = groups.get(k) || { changesetId: m?.payload.changesetId ?? null, question: m?.payload.question ?? null, kind: m?.payload.kind ?? null, answers: [] };
    g.answers.push({ seq: o.seq, answer: o.words, ...(o.instructorWords && o.instructorWords !== o.words ? { words: o.instructorWords } : {}) });
    g.words = o.words; // the latest answer on the question (every one is in `answers`)
    groups.set(k, g);
  }
  return [...groups.values()];
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
    let said = null;
    const reader = liveReader(root);
    let outcome, seq = null;
    try {
      if (q.kind === "interrupt") {
        seq = appendLogRecord(root, { type: "answer", party, payload: { answers: [{ finding: q.finding, basis: q.basis, choice: answer, entry: `interrupt:${q.finding}` }], acceptAll: false, instructorWords: words || answer } }).seq;
        outcome = "answered";
        // the instructor's answer to an interrupt or the agent's own M5 question, for the agent to read (round 6)
        said = { answer, ...(words && words !== answer ? { words } : {}) };
      } else if (q.kind === "approval") {
        // P1 (round 2): only the exact answers Coursewerk asked for; anything else is asked again
        if (answer !== "Approve" && answer !== "Not yet") { skip(`"${line(answer, 60)}" is neither Approve nor Not yet: it is asked again`); continue; }
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
        // P1 (round 2): kept only on an exact Keep, undone only on an exact Undo; any other answer (a hand-in made with
        // no choices) is asked again, never silently kept
        if (answer !== "Keep" && answer !== "Undo") { skip(`"${line(answer, 60)}" is neither Keep nor Undo: it is asked again`); continue; }
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
        // HIGH-1 (round 3, fail-safe): only an exact choice can mean yes (confirm, claim, adopt, apply, keep, revert).
        // Free words, for any kind, are recorded as said ("said: …", which no reading takes for a yes): the question is
        // then owed to the agent, which acts on the words and records it (takenUp), and is not asked again (round 4)
        let choice = answer;
        if (!q.choices) choice = /^\s*later\s*\.?\s*$/i.test(answer) ? "Later" : `said: ${answer}`;
        // a choice that asks the agent to act ("Change it differently", "Drop it") carries the instructor's words to it:
        // recorded like words, owed until taken up (round 6, MEDIUM-2)
        else if (ACT_CHOICES.has(answer)) choice = `said: ${answer}`;
        // HIGH-2 (rounds 3, 4): a choice binds the passage as it was asked, read live; one that changed is asked again
        // the binding guard (round 6, HIGH-1): every choice that acts on text, for every kind
        if (!SAID.test(choice) && choice !== "Later" && !bindingGuard(root, reader, q, e).ok) {
          // reported once (round 5, LOW-6): the marker makes a later apply of the same answer "already recorded"
          appendLogRecord(root, { type: "contact", party: { role: "harness", name: "alembic-needs" }, payload: {
            moment: "host-answer", host: "alembic", item: a.item, changesetId: a.changesetId, question: a.question, answer, outcome: "asked again",
            by: { id: a.by?.id ?? null, name: a.by?.name ?? null }, at: a.at ?? null } });
          done.add(a.item);
          skip("the passage changed since it was asked (or the question predates that check): it is asked again"); continue;
        }
        answerDigest(root, { entries: [e] }, { answers: { [e.key]: choice }, instructorWords: words || answer, reader }, party);
        outcome = SAID.test(choice) ? "said" : choice === "Later" || /^\s*later\b/i.test(choice) ? "deferred" : "answered";
        if (SAID.test(choice)) said = { said: answer, ...(words && words !== answer ? { words } : {}), owed: `act on these words, then record it: node scripts/alembic_needs.mjs taken-up --root <pkg> --changeset ${a.changesetId} --question ${a.question} --note "<what you did>" --model <id>` };
      } else { skip(`unknown question kind ${q.kind}`); continue; }
    } catch (err) { skip(err.message); continue; }
    // the answer's Alembic provenance, after it: never recorded twice
    appendLogRecord(root, { type: "contact", party: { role: "harness", name: "alembic-needs" }, payload: {
      moment: "host-answer", host: "alembic", item: a.item, changesetId: a.changesetId, question: a.question, answer, outcome,
      ...(q.kind === "digest" ? { kind: q.entry?.kind } : {}), by: { id: a.by?.id ?? null, name: a.by?.name ?? null }, at: a.at ?? null, ...(a.via ? { via: a.via } : {}), ...(seq ? { recorded: seq } : {}) } });
    done.add(a.item);
    recorded.push({ question: a.question, item: a.item, outcome, ...(seq ? { seq } : {}), ...(said || {}) });
  }
  // every word still owed to the agent, from this job's answers or an earlier one's (round 5, MEDIUM-3)
  return { recorded, skipped, ignored, owed: owedWords(root) };
}
