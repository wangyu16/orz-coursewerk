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
/** A grouped question (owner 2026-11-17; family FC-16 v1 §3, additive, `group.v` 1): at most 25 places listed, each a line of
 *  at most 500 and a detail of at most 1000; the answer's exceptions name listed places only. Coursewerk's own bounds: at
 *  most 500 places per grouped question, at most 2,000 grouped places per hand-in (the needs record stays within its 3 MB). */
export const GROUP_LIMITS = Object.freeze({ places: 25, placeText: 500, placeDetail: 1000, perQuestion: 500, perHandin: 2000 });
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
  // how many more questions will follow (round 9, LOW-5): additive, Alembic's parseDigest reads only questions
  if (h.digest.remaining !== undefined && !(Number.isInteger(h.digest.remaining) && h.digest.remaining >= 0)) out.push("digest.remaining must be a whole number");
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
    if (x.group !== undefined) out.push(...groupProblems(x.group, x, at, oneLine));
    for (const k of Object.keys(x || {})) if (!["id", "text", "choices", "recommended", "detail", "refs", "words", "wordsSuggested", "group"].includes(k)) out.push(`${at}: unknown field ${k}`);
  });
  return out;
}
/** A grouped question's `group` as FC-16 v1 §3 shapes it: { v: 1, places: [{ id, text, detail?, ref? }] (1–25), more }. */
function groupProblems(g, x, at, oneLine) {
  const out = [];
  if (!g || typeof g !== "object" || Array.isArray(g)) return [`${at}: group must be an object`];
  if (g.v !== 1) out.push(`${at}: group.v must be 1`);
  if (!Array.isArray(x.choices)) out.push(`${at}: a group needs choices`);
  if (x.words === "required") out.push(`${at}: a group is never words-required`);
  if (!Number.isInteger(g.more) || g.more < 0) out.push(`${at}: group.more must be a whole number`);
  if (!Array.isArray(g.places) || g.places.length < 1 || g.places.length > GROUP_LIMITS.places) return [...out, `${at}: group.places: 1–${GROUP_LIMITS.places}`];
  const ids = new Set();
  g.places.forEach((p, i) => {
    const pat = `${at}: group.places[${i}]`;
    if (!QUESTION_ID.test(String(p?.id ?? "")) || ids.has(p?.id)) out.push(`${pat}: id`); ids.add(p?.id);
    if (!oneLine(p?.text, GROUP_LIMITS.placeText)) out.push(`${pat}: text must be one line of at most ${GROUP_LIMITS.placeText}`);
    if (p?.detail !== undefined && (typeof p.detail !== "string" || p.detail.length > GROUP_LIMITS.placeDetail)) out.push(`${pat}: detail of at most ${GROUP_LIMITS.placeDetail}`);
    if (p?.ref !== undefined && !coursePath(p.ref)) out.push(`${pat}: ref must be a course path`);
    for (const k of Object.keys(p || {})) if (!["id", "text", "detail", "ref"].includes(k)) out.push(`${pat}: unknown field ${k}`);
  });
  for (const k of Object.keys(g)) if (!["v", "places", "more"].includes(k)) out.push(`${at}: group: unknown field ${k}`);
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
  // a per-construct limit (round 7, the owner's standing preference over case-by-case hardening): a choice that acts is
  // offered only for an entry of ONE finding — an answer binds every finding of its entry, and the question shows one
  const many = manyFindings(e);
  let choices = worded.unseen || many ? null : DIGEST_CHOICES[e.kind] || worded.choices || null;
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
  // at most five chapters named, then how many more (a course-wide cluster named every chapter)
  const allPlaces = [...new Set((e.chapters || []).filter((x) => x !== "package").map((x) => `“${c.titles?.get?.(x) || x}”`))];
  const places = allPlaces.length > 5 ? [...allPlaces.slice(0, 5), `and ${allPlaces.length - 5} more chapter${allPlaces.length - 5 === 1 ? "" : "s"}`] : allPlaces;
  const detail = [
    allFits ? [shown, worded.unseen ? (worded.gone ? GONE : UNSEEN) : ""].filter(Boolean).join("\n")
      : offFits ? [head, worded.unseen ? (worded.gone ? GONE : UNSEEN) : "The whole passage is too long to show here: the page (the link) holds the exact text, and your answer applies to it as it reads there. If it changes before your answer is recorded, you are asked again."].filter(Boolean).join("\n")
      : [tooLong || "The text this answer would adopt is too long to show here: answer in your own words, and the assistant takes it up.", shorten(head, LIMITS.detail - 600)].join("\n"),
    worded.detail,
    many ? `This comes up in ${e.count || (e.findings || []).length} places${places.length ? ` (${places.join(", ")})` : ""}. Answer in your own words: they go to the assistant.`
      : e.count > 1 ? `This comes up in ${e.count} places${places.length ? ` (${places.join(", ")})` : ""}; one answer settles them all.` : "",
    // the recommendation's own words whenever they say more than the choice pre-chosen (MEDIUM-F)
    !recommended || rec.toLowerCase() !== recommended.toLowerCase() ? recommendationLine(e, c) : "",
    choices?.includes("Change it differently") ? "To change it differently, say how in your words." : "",
    e.laterBefore ? "You chose Later last time." : e.deferredBefore ? "This waited from an earlier digest." : "",
  ].filter(Boolean).join("\n");
  return {
    // the id hashes the entry's bases too: another finding under the same key is another question (round 8, MEDIUM-2)
    id: qid("d", `${e.key}|${(e.bases || []).map((b) => `${b.finding}|${b.basis}`).join(",")}`), text: line(text, LIMITS.text),
    ...(choices ? { choices, ...(recommended ? { recommended } : {}) } : {}),
    ...(detail ? { detail: block(detail, LIMITS.detail) } : {}),
    refs: refsOf((e.units || []).map((u) => c.deliverableOf.get(u)).concat(ev.file || [])),
    // the instructor's words: required for a choice that confirms, keeps as written, adopts or claims (Coursewerk's
    // own choices: rights and authorship among them); a one-click choice (Apply the suggestion, Keep it, Drop it,
    // Later) is itself the recorded answer, words optional (owner 2026-11-16, D-133 (b)); free text is itself words
    words: choices && !oneClick(e.kind, choices) ? "required" : "optional",
  };
}
const GONE = "A passage this is about is no longer in the text as it stands (it was changed or removed since), so nothing can be applied or kept from here. Answer in your own words if it still matters: they go to the assistant.";
const UNSEEN = "The passage could not be read here. Answer in your own words: they go to the assistant, which takes them up; nothing is confirmed or kept from words alone.";
/** The choices that are a whole answer by themselves (owner 2026-11-16): never Coursewerk's own (DIGEST_CHOICES: a
 *  confirmation, keeping as written, adopting or claiming text), never a binding kind. "Change it differently" rides
 *  along; without words apply asks it again. */
export const ONE_CLICK = Object.freeze(new Set(["Apply the suggestion", "Change it differently", "Keep it", "Drop it", "Later"]));
const oneClick = (kind, choices) => !DIGEST_CHOICES[kind] && !BINDING_KINDS.has(kind) && choices.every((x) => ONE_CLICK.has(x));

/**
 * What the wording reads (D-133): chapter titles, the plan's nodes (id → its words) and each unit's place, form and
 * text. Read-only, from the package as it stands; a part that cannot be read is simply left out.
 */
export function needsContext(root, reader, chapters = manifestChapters(reader)) {
  const titles = new Map();
  try { for (const c of manifestUnits(JSON.parse(reader.text("alembic.json")))) if (c.title) titles.set(c.slug, String(c.title)); } catch { /* no titles: slugs read as words */ }
  let nodes = new Map(); try { nodes = nodeIndex(parseSpine(reader, chapters)); } catch { nodes = new Map(); }
  // the course's sources by id, with the titles the instructor knows them by (round 9, LOW-6)
  const sources = new Map();
  try { for (const x of JSON.parse(reader.text("private/coursewerk/FOUNDATION.json") || fs.readFileSync(recordFile(root, "private/coursewerk/FOUNDATION.json"), "utf8"))?.sources || []) if (x?.id) sources.set(String(x.id), String(x.title || x.id)); } catch { /* no sources: ids read as words */ }
  // the units as they read NOW (loadUnits re-segments the files: what confirmUnits, claimAuthorship and
  // adoptInstructorText bind), never the sidecar as last indexed (D-133 audit round 4, HIGH-1)
  const units = new Map(), deliverableOf = new Map(), live = new Map(), adopts = new Map();
  // whether the units could be read at all (audit round 10, L-4): only then is a passage the finding names and the text
  // does not hold "gone"; otherwise it is "could not be read here"
  let all = [], unitsRead = false; try { all = loadUnits(root, reader); unitsRead = all.length > 0; } catch { all = []; }
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
  return { titles, nodes, sources, units, unitsRead, deliverableOf, live, adopts };
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

/** One answer of one Alembic item: the item, the hand-in and the question (audit round 9, HIGH-1). */
const answerKey = (x) => `${x?.item ?? null}|${x?.changesetId ?? null}|${x?.question ?? null}`;
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
  // Alembic keeps the FIRST hand-in under a changeset id: a second export under it would bind the answers to questions
  // the instructor never saw (round 8, MEDIUM-2)
  if ((readNeeds(root).handins || []).some((h) => h.changesetId === changesetId)) throw new Error(`changeset ${changesetId} was already handed in: export under a new id (leave out --changeset to get one)`);
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

  // 4. the checkpoint digest, within the instructor's digest cap and what is left of the 20. The cap counts QUESTIONS, after
  // a cluster is split into one question per finding (audit round 9, MEDIUM-2): every cluster is ranked (buildDigest's
  // order: deferred first, then by size), split, and the questions are taken round robin, one per cluster in turn, so a
  // cluster of hundreds of findings never takes every slot from the other kinds.
  const room = Math.max(0, LIMITS.questions - items.length), cap = Math.min(Number(loggedDigestCap(logText) || DEFAULT_CAP), room);
  const all = buildDigest(root, gate.findings, info, { cap: Infinity, corrections: [] });
  let prev = null; try { prev = JSON.parse(fs.readFileSync(recordFile(root, DIGEST_FILE), "utf8")); } catch { prev = null; }
  for (const e of all.entries) { const p = prev?.entries?.find((x) => x.key === e.key && String(x.recommendedBy || "").startsWith("agent")); if (p) { e.recommendation = p.recommendation; e.recommendedBy = p.recommendedBy; } }
  // an entry clustering several findings of a kind a choice acts on is handed in as one question per finding (its own
  // passage, choices and bases; round 8, HIGH-1): a choice acts on exactly the one finding it shows, and every such
  // question can be settled. A cluster stays one question, in words, only for kinds no choice acts on.
  const byId = new Map(gate.findings.map((f) => [f.id, f]));
  // grouped findings (owner 2026-11-17, FC-16 v1 §3): the split places of a cluster whose choices are one click by
  // themselves come back together as ONE grouped question (a cluster may make more than one, by choice set and 500 places
  // each); a place a grouped answer found changed is asked again on its own (askedAgainAlone)
  const alone = askedAgainAlone(logText);
  const groups = all.entries.map((e) => (manyFindings(e) ? groupPlaces(splitEntry(e, byId, hash, ctx), e, deliverableOf, ctx, alone) : [e]));
  const queue = [];
  for (let i = 0, more = true; more; i++) { more = false; for (const g of groups) if (i < g.length) { queue.push(g[i]); more = true; } }
  // a grouped question counts as one question in the cap; the places a hand-in groups are bounded (GROUP_LIMITS.perHandin)
  const taken = [], waiting = [];
  let placesTaken = 0;
  for (const e of queue) {
    const n = e.grouped ? e.singles.length : 0;
    if (taken.length < cap && placesTaken + n <= GROUP_LIMITS.perHandin) { taken.push(e); placesTaken += n; } else waiting.push(e);
  }
  const takenKeys = new Set(taken.map((e) => e.cluster ?? e.key));
  const leftKeys = new Set(waiting.map((e) => e.cluster ?? e.key));
  // the digest as recorded and delivered: the clusters with a question in this hand-in; the rest (and what is left of a
  // cluster handed in part) is deferred and goes first next time
  const d = { ...all, entries: all.entries.filter((e) => takenKeys.has(e.key)),
    deferred: { count: all.entries.filter((e) => !takenKeys.has(e.key)).length, questions: waiting.length,
      findings: waiting.reduce((n, e) => n + (e.findings || []).length, 0), keys: all.entries.filter((e) => leftKeys.has(e.key)).map((e) => e.key) } };
  for (const e of taken) if (e.grouped) items.push(groupedItem(e, ctx));
  else items.push({ question: digestQuestion(e, deliverableOf, ctx), ref: { kind: "digest", entry: e },
    // bounded (round 2, LOW-K): the entry itself (in ref) keeps every unit
    assistant: { kind: e.kind, module: e.module, units: (e.units || []).slice(0, 20), ...((e.units || []).length > 20 ? { unitCount: e.units.length } : {}), ...assistantPart(String(e.question ?? ""), e.evidence?.rule, e.recommendation, e.evidence?.file && e.evidence?.line ? `${e.evidence.file} line ${e.evidence.line}` : "") } });

  // what is left is counted in questions: those past the 20, and the digest's own past the cap (audit round 9, LOW-5);
  // the hand-in carries it (digest.remaining, additive) so Alembic can say how many more will follow
  const shown = items.slice(0, LIMITS.questions), left = items.length - shown.length + d.deferred.questions;
  const handin = { changesetId, digest: { questions: shown.map((x) => x.question), remaining: left } };
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
  return { handin, left, delivered: !!model, owed: owedWords(root), counts: { interrupts: by("interrupt"), approvals: by("approval"), corrections: by("correction"), digest: by("digest") + by("digest-group"), grouped: by("digest-group") } };
}

/** The kinds whose answer confirms, claims or adopts what units hold (digest.mjs CONFIRMS, CLAIMS, ADOPTS). */
// the kinds whose answer confirms, adopts or claims what units hold: digest.mjs's own lists (CONFIRMS, ADOPTS, CLAIMS)
// (round 6: derived, never a hand copy)
/** Choices that ask the agent to act on the instructor's words: recorded like words ("said: …"), owed until taken up
 *  (round 6, MEDIUM-2). */
const ACT_CHOICES = new Set(["Change it differently", "Drop it"]);
/** An entry clustering several findings (round 7): its answer would bind every one; it takes words only. */
const manyFindings = (e) => (e?.findings?.length || 1) > 1;
/**
 * A digest entry's findings, one entry each, when its kind has choices (DIGEST_CHOICES, or the wording's): the entry as
 * buildDigest makes it for one finding, keyed by the cluster key and the finding id (stable across exports).
 */
function splitEntry(e, byId, hash, ctx) {
  const mine = (e.findings || []).map((id) => byId.get(id)).filter(Boolean);
  if (mine.length !== (e.findings || []).length) return [e];
  const later = new Set(e.laterFindings || []);
  const one = (f) => ({ ...e, key: `${e.key}#${f.id}`, cluster: e.key, count: 1, units: [...(f.units || [])].sort(),
    question: f.evidence?.note || f.evidence?.what || f.evidence?.rule || f.kind, evidence: f.evidence,
    recommendation: f.recommendation ?? (f.evidence?.suggestion ? `revise: ${f.evidence.suggestion}` : null),
    recommendedBy: f.recommendation != null ? "check" : f.evidence?.suggestion ? "reviewer" : null,
    // a Later is per question once split (round 9, LOW-2): marked, and first, only where the instructor chose it
    deferredBefore: !!(e.laterBefore || later.has(f.id)), laterBefore: !!(e.laterBefore || later.has(f.id)), laterFindings: undefined,
    findings: [f.id], bases: [{ finding: answerKeyOf(f), basis: basisOf(f, hash), ...(f.evidence?.claimKey ? { claimKey: f.evidence.claimKey, ...(f.evidence.claimText ? { claimText: f.evidence.claimText, units: f.units } : {}) } : {}) }] });
  const singles = mine.map(one).sort((a, b) => b.laterBefore - a.laterBefore);
  // split when ANY finding has choices (round 9, LOW-3): the wording's choices depend on each finding (a suggestion)
  return DIGEST_CHOICES[e.kind] || singles.some((x) => wordEntry(x, ctx).choices) ? singles : [e];
}

// ---- grouped findings (owner 2026-11-17; family FC-16 v1 §3) --------------------------------------------------------
// A finding that comes up in many places reaches the instructor as ONE question that lists its places, with choices that
// apply to all and exceptions for single places. Only kinds whose choices are one click by themselves are grouped (Apply
// the suggestion, Keep it, Drop it, Later: oneClick); a kind whose answer confirms, keeps as written, adopts or claims
// text (rights and authorship among them: words required) is never grouped, and stays one question per place. Each
// place is decided exactly as its own question would be (digestQuestion): a place whose own question offers no such
// choice (a gone or unread passage, a suggestion too long to show) stays a question of its own.
/** The choices a grouped question offers: the place's own, without "Change it differently" (it takes words on how, for
 *  one place: the instructor asks for that place on its own, or tells the assistant). */
const groupChoices = (choices) => choices.filter((c) => c !== "Change it differently");
/** The finding ids a grouped answer found changed: each is asked again on its own, never grouped again (its host-answer
 *  markers' `alone`). */
function askedAgainAlone(logText) {
  const out = new Set();
  for (const r of markers(logText)) for (const f of Array.isArray(r.payload?.alone) ? r.payload.alone : []) out.add(f);
  return out;
}
/**
 * A split cluster's places as grouped questions where they can be: the places with the same one-click choices (two or
 * more) are one grouped item each 500 places; the rest stay single. Grouped items first, then the singles.
 */
function groupPlaces(singles, e, deliverableOf, ctx, alone) {
  if (singles.length < 2 || singles[0] === e) return singles;
  const buckets = new Map(), rest = [];
  for (const s of singles) {
    const q = digestQuestion(s, deliverableOf, ctx);
    const ok = q.choices && oneClick(s.kind, q.choices) && !alone.has(s.findings[0]) && groupChoices(q.choices).length >= LIMITS.minChoices;
    if (!ok) { rest.push(s); continue; }
    const sig = groupChoices(q.choices).join("|");
    if (!buckets.has(sig)) buckets.set(sig, []);
    buckets.get(sig).push({ s, q });
  }
  const grouped = [];
  for (const [sig, list] of buckets) {
    if (list.length < 2) { rest.push(...list.map((x) => x.s)); continue; }
    for (let i = 0; i < list.length; i += GROUP_LIMITS.perQuestion) {
      const part = list.slice(i, i + GROUP_LIMITS.perQuestion);
      grouped.push({ grouped: true, key: `${e.key}#group:${sig}:${i}`, cluster: e.key, kind: e.kind, module: e.module, chapters: e.chapters,
        choices: sig.split("|"), singles: part.map((x) => x.s), questions: part.map((x) => x.q), findings: part.map((x) => x.s.findings[0]),
        laterBefore: part.some((x) => x.s.laterBefore) });
    }
  }
  return [...grouped, ...rest.sort((a, b) => b.laterBefore - a.laterBefore)];
}
/** What a grouped question says, kind by kind (the places say each one's own words). */
const GROUP_TEXT = {
  "detail-in-spine": (n) => `In ${n} places, the plan says more than it needs to (values, examples or other detail). Suggestion: move each detail to the study guide, and keep the plan's lines to what to teach.`,
  "spine-review-concern": (n) => `A blind reviewer found ${n} lines of the plan that may be wrong, each with a suggested change.`,
  "knowledge-concern": (n) => `A blind reviewer found ${n} places in your text that may be wrong, each with a suggested change.`,
  "clarification-proposed": (n) => `In ${n} places your text is right as meant but could be clearer; the reviewer suggests a few words for each.`,
  "off-spine": (n) => `A reviewer found ${n} passages that teach nothing in the chapter's approved plan. Keep them (the plan may need them), or drop them?`,
};
/** What a grouped question adds, kind by kind, for every place (a place's own reviewer words go with the place). */
const GROUP_DETAIL = {
  "detail-in-spine": "The plan says what to teach, to what level and how to assess. It isn't checked against the sources, so a detail left there is checked only against the other materials; in the study guide it is checked like any fact.",
  "spine-review-concern": "A blind reviewer read the lines changed since your last approval.",
  "knowledge-concern": "A blind reviewer raised these about your text, so they are yours to decide.",
  "clarification-proposed": "Your wording stays wherever you don't apply the suggestion; your credit for the text stays either way.",
};
/** One grouped item: the question handed in (with its `group`), the record apply reads (every place, as asked), and the
 *  assistant's part. */
function groupedItem(g, ctx) {
  const n = g.singles.length, listed = g.questions.slice(0, GROUP_LIMITS.places), more = n - listed.length;
  const recs = g.questions.map((q) => q.recommended);
  const recommended = recs.every((r) => r && r === recs[0]) && g.choices.includes(recs[0]) ? recs[0] : undefined;
  const places = listed.map((q, i) => {
    // what this place's own choice adopts, on no page (a suggestion in full): its own question shows it first (HIGH-1)
    // and the reviewer's own words about this place, when they say more than the place's line
    const w = wordEntry(g.singles[i], ctx), own = String(w.detail || "").split("\n").filter((x) => /^The reviewer: /.test(x));
    const off = [...(w.shown || []).filter((x) => !x.page).map((x) => x.text), ...own].join("\n");
    return { id: `p${i + 1}`, text: line(q.text, GROUP_LIMITS.placeText), ...(off ? { detail: block(off, GROUP_LIMITS.placeDetail) } : {}), ...(q.refs?.[0] ? { ref: q.refs[0] } : {}) };
  });
  const lead = (GROUP_TEXT[g.kind] || ((k) => `The same question comes up in ${k} places.`))(n);
  const allChapters = [...new Set((g.chapters || []).filter((x) => x !== "package").map((x) => `“${ctx.titles?.get?.(x) || x}”`))];
  const chapters = allChapters.length > 5 ? [...allChapters.slice(0, 5), `and ${allChapters.length - 5} more chapter${allChapters.length - 5 === 1 ? "" : "s"}`] : allChapters;
  const detail = [
    `This comes up in ${n} places${chapters.length ? ` (${chapters.join(", ")})` : ""}. Your answer applies to every one of them${more ? `, the ${more} not listed here too` : ""}; you can choose another answer for single places. Each place is checked against its text as it was when asked: a place that has changed since is asked again on its own.`,
    // for a host that does not show the list (an older Alembic drops `group`), the first places in words
    `The first places: ${listed.slice(0, 3).map((q) => shorten(q.text, 240)).join(" · ")}${n > 3 ? ` · and ${n - 3} more` : ""}`,
    g.choices.some((c) => /^apply\b/i.test(c)) ? "Apply the suggestion takes each place's own suggestion." : "",
    GROUP_DETAIL[g.kind] || "",
    g.laterBefore ? "You chose Later last time for some of these places." : "",
  ].filter(Boolean).join("\n");
  const question = {
    id: qid("g", `${g.cluster}|${g.singles.map((s) => s.bases.map((b) => `${b.finding}|${b.basis}`).join(",")).join(";")}`),
    text: line(`${lead} Your answer applies to all ${n}.`, LIMITS.text),
    choices: g.choices, ...(recommended ? { recommended } : {}),
    detail: block(detail, LIMITS.detail),
    refs: refsOf(g.singles.flatMap((s) => (s.units || []).map((u) => ctx.deliverableOf?.get?.(u)))),
    words: "optional",
    group: { v: 1, places, more },
  };
  const ref = { kind: "digest-group", cluster: g.cluster, entryKind: g.kind, module: g.module,
    // every place, listed or not, as asked: its single entry (what answerDigest records) and the text it was asked on
    places: g.singles.map((s, i) => ({ id: `p${i + 1}`, ...(i < GROUP_LIMITS.places ? { listed: true } : {}), finding: s.findings[0], units: s.units || [], bases: s.bases,
      seen: Object.fromEntries(boundUnits(s, ctx).map((u) => [u, ctx.live.get(u) ?? "absent"])) })) };
  return { question, ref, assistant: { kind: g.kind, module: g.module, grouped: n, units: [...new Set(g.singles.flatMap((s) => s.units || []))].slice(0, 20),
    ...assistantPart(`${n} places, one grouped question: ${String(g.singles[0].question ?? "")}`, g.singles[0].evidence?.rule) } };
}
/**
 * A grouped answer, applied place by place (FC-16 v1 §3): each place takes the answer, or its exception (a listed place,
 * one of the choices); a choice that acts runs only on a place whose text is still as asked (the binding guard, one place
 * at a time), and a place changed since is asked again on its own (`alone` on its marker). The places are recorded with
 * one answer record per choice, each followed by its host-answer marker; work owed to the agent is owed per question.
 * Returns { outcome, summary, said? } or { skip }.
 */
function applyGroup(root, reader, q, a, answer, words, party, bc) {
  const places = Array.isArray(q.places) ? q.places : [];
  if (!places.length || !Array.isArray(q.choices)) return { skip: "the grouped question names no places" };
  const raw = a.exceptions ?? null;
  if (raw !== null && (typeof raw !== "object" || Array.isArray(raw))) return { skip: "the exceptions are not places with answers: it is asked again" };
  const ex = new Map();
  for (const [id, c] of Object.entries(raw || {})) {
    if (!places.some((p) => p.id === id && p.listed)) return { skip: `an exception names a place the question did not list (${line(id, 40)}): it is asked again` };
    if (!q.choices.includes(c)) return { skip: `"${line(String(c), 60)}" is not one of the choices: it is asked again` };
    if (c !== answer) ex.set(id, c);
  }
  // what each choice means, as for a question of one place: Drop it carries the instructor's word to the agent (ACT_CHOICES)
  const meaning = (c) => (ACT_CHOICES.has(c) ? `said: ${c}` : c);
  const alone = [], byChoice = new Map();
  for (const p of places) {
    const asked = ex.get(p.id) ?? answer, choice = meaning(asked), e = placeEntry(q, p);
    // the binding guard, per place, against the text as it was asked (every place before anything is recorded)
    if (!SAID.test(choice) && choice !== "Later" && !bindingGuard(root, reader, { seen: p.seen }, e, bc).ok) { alone.push(p.finding); continue; }
    if (!byChoice.has(asked)) byChoice.set(asked, []);
    byChoice.get(asked).push(e);
  }
  const marker = (payload) => appendLogRecord(root, { type: "contact", party: { role: "harness", name: "alembic-needs" }, payload: {
    moment: "host-answer", host: "alembic", item: a.item, changesetId: a.changesetId, question: a.question, group: true, kind: q.entryKind, ...payload,
    by: { id: a.by?.id ?? null, name: a.by?.name ?? null }, at: a.at ?? null, ...(a.via ? { via: a.via } : {}) } });
  const counts = {}, owes = [];
  for (const [asked, entries] of byChoice) {
    const choice = meaning(asked);
    answerDigest(root, { entries }, { answers: Object.fromEntries(entries.map((e) => [e.key, choice])), instructorWords: words || asked, reader }, party);
    const seq = parseLog(readLogText(root)).filter((r) => r.type === "answer" && r.party?.role === "instructor").at(-1)?.seq ?? null;
    const outcome = SAID.test(choice) ? "said" : choice === "Later" ? "deferred" : "answered";
    const owe = SAID.test(choice) || owedChoice(q.entryKind, choice) ? seq : null;
    if (owe) owes.push(owe);
    marker({ answer: asked, outcome, places: entries.length, ...(owe ? { owes: owe } : {}), ...(seq ? { recorded: seq } : {}) });
    counts[asked] = entries.length;
  }
  // a changed place is asked again on its own (never grouped again): marked once, so the same answer is not applied twice
  if (alone.length) marker({ answer, outcome: "asked again", places: alone.length, alone });
  const kinds = Object.keys(counts);
  if (!kinds.length) return { skip: "every place changed since it was asked: each is asked again on its own", marked: true };
  const outcome = kinds.length === 1 && !alone.length ? (SAID.test(meaning(kinds[0])) ? "said" : kinds[0] === "Later" ? "deferred" : "answered") : "answered in part";
  const cmd = `act on it, then record it: node scripts/alembic_needs.mjs taken-up --root <pkg> --changeset ${a.changesetId} --question ${a.question} --note "<what you did>" --model <id>`;
  return { outcome, summary: { places: places.length, choices: counts, askedAgain: alone.length },
    said: { answer, ...(ex.size ? { exceptions: Object.fromEntries(ex) } : {}), ...(words && words !== answer ? { words } : {}), ...(owes.length ? { owed: cmd } : {}) } };
}
/** A grouped record's place as the single entry its own question would have bound (splitEntry's shape). */
const placeEntry = (q, p) => ({ key: `${q.cluster}#${p.finding}`, cluster: q.cluster, kind: q.entryKind, module: q.module, count: 1, units: p.units, findings: [p.finding], bases: p.bases });
/** A choice recorded as it is (a Coursewerk reader acts on it) that is also work for the agent: owed, with the
 *  instructor's words, until taken up (round 7, MEDIUM-2, MEDIUM-3). */
const owedChoice = (kind, choice) => (/^apply\b/i.test(choice) && ["knowledge-concern", "spine-review-concern", "detail-in-spine"].includes(kind)) || (kind === "fact-disputed" && choice === "Change it");
/** What the record keeps of a question: a digest entry with the content hash of each unit as asked (`seen`, HIGH-2), and
 *  its evidence bounded (apply reads its key, kind, units and bases, never its evidence: MEDIUM-4). */
function boundRef(ref, ctx) {
  if (ref.kind !== "digest") return ref;
  const e = ref.entry, ev = e.evidence || {};
  const evidence = JSON.stringify(ev).length <= 1500 ? ev : Object.fromEntries(Object.entries(ev).filter(([, v]) => typeof v !== "object" && String(v).length <= 200).concat([["bounded", sha256(JSON.stringify(ev))]]));
  // round 4 (HIGH-1): the hash of each bound unit's LIVE text (unitHash), or "absent" for a unit no file holds now
  return { ...ref, entry: { ...e, evidence }, seen: Object.fromEntries(boundUnits(e, ctx).map((u) => [u, ctx.live.get(u) ?? "absent"])) };
}
/** What the binding guard compares, read together: the package's units as they read now (needsContext) and as indexed. */
export function bindingContext(root, reader) {
  return { ctx: needsContext(root, reader), indexed: new Map([...unitInfoOf(root, reader)].map(([k, v]) => [k, v.contentHash])) };
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
export function bindingGuard(root, reader, q, e, bc = null) {
  const seen = q?.seen;
  if (!seen || typeof seen !== "object") return { ok: false, why: "asked before the passage check" };
  const { ctx, indexed } = bc || bindingContext(root, reader);
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
  const marks = markers(readLogText(root));
  const groups = new Map();
  for (const o of owed.values()) {
    const m = marks.find((x) => x.payload.owes === o.seq) || marks.find((x) => x.seq > o.seq && x.payload.outcome === "said");
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
  // an answer is one question's answer in one Alembic item: Alembic gives every answer of a digest the digest's own item
  // (agent-endpoint.ts changes), so the item alone would take every answer after the first as already recorded (audit
  // round 9, HIGH-1). Markers written before keep item, changeset and question, so they key the same way.
  const needs = readNeeds(root), done = new Set(markers(readLogText(root)).map((r) => answerKey(r.payload)));
  const recorded = [], skipped = []; let ignored = 0;
  // the binding guard's context, read once and read again after any answer that changes what it compares (audit round
  // 10, M-1): an Undo rewrites a unit's text, and an answer that adopts, claims or confirms changes the index or the
  // register, so a later answer of the same run is checked against the package as it then stands
  let guardCtx = null;
  for (const a of answers) {
    const q = needs.handins?.find((h) => h.changesetId === a?.changesetId)?.questions?.[a?.question];
    if (!q) { ignored++; continue; }
    const skip = (reason) => skipped.push({ question: a.question, item: a.item ?? null, reason });
    if (a.item == null || done.has(answerKey(a))) { skip(a.item == null ? "the answer has no item id" : "already recorded"); continue; }
    const name = String(a.by?.name || a.by?.id || "").trim();
    if (!name) { skip("the answer does not say who gave it"); continue; }
    const answer = String(a.answer ?? "").trim(), words = hasVisibleWords(a.words) ? String(a.words).trim() : null;
    if (!answer) { skip("the answer is empty"); continue; }
    if (q.choices && !q.choices.includes(answer)) { skip(`"${line(answer, 60)}" is not one of the choices`); continue; }
    if (q.words === "required" && !words && !(q.kind === "approval" && answer === "Not yet")) { skip("the instructor's words are required and were not given"); continue; }
    // a choice that confirms, keeps as written, adopts or claims takes the instructor's words whatever the record says
    // (Coursewerk's own choices, and every binding kind; only Later is one click there: audit round 9, LOW-1)
    if (q.kind === "digest" && !words && answer !== "Later" && (DIGEST_CHOICES[q.entry?.kind] || BINDING_KINDS.has(q.entry?.kind) || !q.entry?.kind) && q.choices) { skip("the instructor's words are required and were not given"); continue; }
    const party = { role: "instructor", name };
    let said = null, owes = null;
    const reader = liveReader(root);
    let outcome, seq = null;
    try {
      if (q.kind === "interrupt") {
        seq = appendLogRecord(root, { type: "answer", party, payload: { answers: [{ finding: q.finding, basis: q.basis, choice: answer, entry: `interrupt:${q.finding}` }], acceptAll: false, instructorWords: words || answer } }).seq;
        outcome = "answered";
        // the instructor's answer to an interrupt or the agent's own M5 question, for the agent to read (round 6)
        // owed until taken up (round 7, MEDIUM-4): a job that stops after apply does not lose it
        owes = seq;
        said = { answer, ...(words && words !== answer ? { words } : {}), owed: `act on it, then record it: node scripts/alembic_needs.mjs taken-up --root <pkg> --changeset ${a.changesetId} --question ${a.question} --note "<what you did>" --model <id>` };
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
          guardCtx = null; // the text changed: the guard reads it again (M-1)
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
        // "Change it differently" says how only in the instructor's words: without them it is asked again, marked once
        // (one-click answers, owner 2026-11-16)
        else if (answer === "Change it differently" && !words) {
          appendLogRecord(root, { type: "contact", party: { role: "harness", name: "alembic-needs" }, payload: {
            moment: "host-answer", host: "alembic", item: a.item, changesetId: a.changesetId, question: a.question, answer, outcome: "asked again",
            by: { id: a.by?.id ?? null, name: a.by?.name ?? null }, at: a.at ?? null } });
          done.add(answerKey(a));
          skip("“Change it differently” needs the instructor's words on how: it is asked again"); continue;
        }
        // a choice that asks the agent to act ("Change it differently", "Drop it") carries the instructor's words to it:
        // recorded like words, owed until taken up (round 6, MEDIUM-2)
        else if (ACT_CHOICES.has(answer)) choice = `said: ${answer}`;
        // a choice on an entry of several findings (an earlier hand-in offered it) is read as words (round 7)
        else if (manyFindings(e) && !/^\s*later\b/i.test(answer)) choice = `said: ${answer}`;
        // HIGH-2 (rounds 3, 4): a choice binds the passage as it was asked, read live; one that changed is asked again
        // the binding guard (round 6, HIGH-1): every choice that acts on text, for every kind
        if (!SAID.test(choice) && choice !== "Later" && !bindingGuard(root, reader, q, e, (guardCtx ||= bindingContext(root, reader))).ok) {
          // reported once (round 5, LOW-6): the marker makes a later apply of the same answer "already recorded"
          appendLogRecord(root, { type: "contact", party: { role: "harness", name: "alembic-needs" }, payload: {
            moment: "host-answer", host: "alembic", item: a.item, changesetId: a.changesetId, question: a.question, answer, outcome: "asked again",
            by: { id: a.by?.id ?? null, name: a.by?.name ?? null }, at: a.at ?? null } });
          done.add(answerKey(a));
          skip("the passage changed since it was asked (or the question predates that check): it is asked again"); continue;
        }
        const before = parseLog(readLogText(root)).length;
        // an answer that acts (not said, not Later) may adopt, claim or confirm: the guard reads the package again (M-1)
        if (!SAID.test(choice) && choice !== "Later") guardCtx = null;
        try { answerDigest(root, { entries: [e] }, { answers: { [e.key]: choice }, instructorWords: words || answer, reader }, party); }
        catch (err) {
          // the act refused (claimAuthorship, confirmUnits …): marked once, so a later apply of the same answer does not
          // log it again (round 7, LOW-6)
          if (parseLog(readLogText(root)).length > before) {
            appendLogRecord(root, { type: "contact", party: { role: "harness", name: "alembic-needs" }, payload: {
              moment: "host-answer", host: "alembic", item: a.item, changesetId: a.changesetId, question: a.question, answer, outcome: "refused", reason: String(err.message).slice(0, 300),
              by: { id: a.by?.id ?? null, name: a.by?.name ?? null }, at: a.at ?? null } });
            done.add(answerKey(a));
          }
          throw err;
        }
        outcome = SAID.test(choice) ? "said" : choice === "Later" || /^\s*later\b/i.test(choice) ? "deferred" : "answered";
        const cmd = `act on it, then record it: node scripts/alembic_needs.mjs taken-up --root <pkg> --changeset ${a.changesetId} --question ${a.question} --note "<what you did>" --model <id>`;
        if (owedChoice(e.kind, choice)) owes = parseLog(readLogText(root)).filter((r) => r.type === "answer" && r.party?.role === "instructor").at(-1)?.seq ?? null;
        // every recorded digest answer comes back with what the instructor chose and wrote (round 7, MEDIUM-2)
        said = SAID.test(choice) ? { said: answer, ...(words && words !== answer ? { words } : {}), owed: cmd }
          : { answer, ...(words && words !== answer ? { words } : {}), ...(owes ? { owed: cmd } : {}) };
      } else if (q.kind === "digest-group") {
        const g = applyGroup(root, reader, q, a, answer, words, party, (guardCtx ||= bindingContext(root, reader)));
        guardCtx = null; // read again for the next answer (M-1)
        if (g.skip) { if (g.marked) done.add(answerKey(a)); skip(g.skip); continue; }
        done.add(answerKey(a));
        recorded.push({ question: a.question, item: a.item, outcome: g.outcome, group: g.summary, ...(g.said || {}) });
        continue;
      } else { skip(`unknown question kind ${q.kind}`); continue; }
    } catch (err) { skip(err.message); continue; }
    // the answer's Alembic provenance, after it: never recorded twice
    appendLogRecord(root, { type: "contact", party: { role: "harness", name: "alembic-needs" }, payload: {
      moment: "host-answer", host: "alembic", item: a.item, changesetId: a.changesetId, question: a.question, answer, outcome,
      ...(q.kind === "digest" ? { kind: q.entry?.kind } : q.kind === "interrupt" ? { kind: "interrupt" } : {}), ...(owes ? { owes } : {}), by: { id: a.by?.id ?? null, name: a.by?.name ?? null }, at: a.at ?? null, ...(a.via ? { via: a.via } : {}), ...(seq ? { recorded: seq } : {}) } });
    done.add(answerKey(a));
    recorded.push({ question: a.question, item: a.item, outcome, ...(seq ? { seq } : {}), ...(said || {}) });
  }
  // every word still owed to the agent, from this job's answers or an earlier one's (round 5, MEDIUM-3)
  return { recorded, skipped, ignored, owed: owedWords(root) };
}
