// A blind review of the spine lines changed since the instructor last approved them (D39, operator 2026-10-03).
// Planted errors in a concept map voided the approval but nothing named them (P11). At re-approval, the lines that
// changed are read by a context-blind verifier — accuracy only, in the two kinds of D35 — and its concerns are shown
// to the instructor in the approval preview as questions: the spine is the instructor's (D31), so nothing is edited.
//
// Red team round 2 (C4-11, C4-12). The lines are found by a real line diff of every file the approval covers (the
// concept map AND the assessment guide of a chapter; the course map), each line keyed by its text and the headings it
// stands under: a line moved verbatim to another place or section, or left under a renamed heading, is a changed line.
// And the review that lets a re-approval through is the LOGGED dispatch itself — its record verified against the log
// (recordHash), for the current text and the current changed lines, its concerns read from the answer — never a file
// in the package that anyone can write.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { readLogText, parseLog } from "../records/log.mjs";
import { recordFile } from "../records/paths.mjs";
import { canonicalJson, sha256 } from "../records/canonical.mjs";
import { recordDispatch } from "../verify/dispatch.mjs";
import { dispatchLogEntry } from "../verify/verdicts.mjs";
import { COURSE_MAP, checkSpine, parseSpine, spinePaths } from "./spine.mjs";
import { meaningKey } from "./rendered.mjs";
import { standingOf } from "../verify/standing.mjs";

/** The files an approval of the scope covers (and binds): a chapter's concept map and assessment guide; the course map. */
const filesOf = (scope) => (scope === "course" ? [COURSE_MAP] : Object.values(spinePaths(scope.slice("chapter:".length))));

/** The last full approval of a scope: its text (null: none) and its seq, the baseline every changed line is read
 *  against (red team R3 coherence F2: a meaning answer is bound to the approved text it compared with). */
function lastApproval(root, scope) {
  const recs = parseLog(readLogText(root)).filter((r) => r.type === "approval" && r.party?.role === "instructor" && r.payload?.scope === scope);
  const last = recs.at(-1);
  const t = last?.payload?.text;
  return t == null ? { text: null, seq: null, hash: null } : { text: t, seq: last.seq, hash: last.hash || null };
}

/** Each non-blank line keyed by the headings it stands under and its text (a list item's number folded: renumbering
 *  is not a change, a move is). */
function keyedLines(text) {
  const path_ = [], out = [];
  String(text || "").split("\n").forEach((l, i) => {
    const t = l.trim(); if (!t) return;
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    const norm = t.replace(/^\d+[.)]\s+/, "#. ").replace(/\s+/g, " ");
    if (h) path_.length = h[1].length - 1;
    out.push({ n: i + 1, text: t, key: `${path_.join("\u0001")}\u0000${norm}` });
    if (h) path_[h[1].length - 1] = h[2].trim();
  });
  return out;
}
/** A longest-common-subsequence match of two texts' keyed lines: what `now` added, changed or moved (`added`), and the
 *  approved lines it no longer has where they were (`removed`). */
function lineDiff(was, now) {
  const a = keyedLines(was), b = keyedLines(now), m = a.length, n = b.length;
  const L = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = a[i].key === b[j].key ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const keptA = new Set(), keptB = new Set();
  for (let i = 0, j = 0; i < m && j < n;) {
    if (a[i].key === b[j].key) { keptA.add(i); keptB.add(j); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  return { added: b.filter((_, j) => !keptB.has(j)), removed: a.filter((_, i) => !keptA.has(i)) };
}
/** The lines of `now` that a longest-common-subsequence diff against `was` does not match: inserted, changed or moved. */
export const diffLines = (was, now) => lineDiff(was, now).added;

/**
 * The spine lines that changed since the last full approval of a scope ("chapter:<slug>" or "course").
 *   lines    — the lines now there that the approved text did not have where they are (added, changed, moved): the
 *              accuracy review reads these;
 *   removed  — the approved lines no longer where they were;
 *   asked    — what the meaning question (D43) asks about: every added line AND every removed one (red team R3, F1 /
 *              C4-01: a change made only of deletions asked nothing and so passed as "the same"). For a removed line the
 *              question is whether the plan still says it.
 *   baseSeq, baseHash, askedHash — the binding of a review: the approval it diffed against and exactly what it asked.
 */
export function changedSpineLines(root, reader, scope) {
  const base = lastApproval(root, scope), before = base.text;
  if (before == null) return { reapproval: false, lines: [], removed: [], asked: [], context: "" };
  const out = [], removed = [];
  let context = "";
  for (const file of filesOf(scope)) {
    const now = reader.text(file) || "", was = typeof before === "string" ? (file === COURSE_MAP || scope === "course" ? before : "") : before[file] || "";
    const d = lineDiff(was, now);
    for (const l of d.added) out.push({ file, n: l.n, text: l.text });
    for (const l of d.removed) removed.push({ file, n: l.n, text: l.text, removed: true });
    context += `${file}\n${now}\n`;
  }
  const lines = out, asked = [...lines, ...removed];
  return { reapproval: true, lines, removed, asked, context, baseSeq: base.seq, baseHash: base.hash,
    textHash: sha256(canonicalJson(filesOf(scope).map((f) => reader.text(f) || ""))), linesHash: sha256(canonicalJson(lines.map((l) => [l.file, l.n, l.text]))),
    askedHash: sha256(canonicalJson({ base: [base.seq, base.hash], asked: asked.map((l) => [l.removed ? "removed" : "now", l.file, l.n, l.text]) })) };
}

/**
 * The blind review's prompt. `lines` are the numbered lines it is asked about: the changed lines, then the approved lines
 * that were removed (each `removed: true`, shown "(removed)"). Concerns are about the changed lines; the meaning
 * question covers every numbered line.
 */
export function spineReviewBundle(lines, context, nonce = randomBytes(8).toString("hex"), removed = []) {
  if (!lines.some((l) => l.removed) && removed.length) lines = [...lines, ...removed.map((l) => ({ ...l, removed: true }))];
  const prompt = [
    "Below are lines from the plan of a college course (its concept map and assessment guide, which its teaching and assessment follow) that were changed, added, moved or removed since the instructor last approved it, and the whole plan for context.",
    'Check each changed line (not the ones marked "(removed)") for errors of fact or concept, at the level the course is taught. Raise a concern of one of two kinds. "wrong": the line states something false. "clarify": the line is correct as meant, but a few added or changed words would remove a likely misreading.',
    "Judge accuracy only: not style, structure, or what the course chooses to cover. Do not raise exceptions beyond what the line is about.",
    'Also say, for EVERY numbered line, whether the plan still says the same as the approved text: for a changed line, "same" when it says the same as the approved text it replaces (listed below) and only the wording differs (the same facts, conditions, directions, signs, quantities and scope), "changed" when it says something different, adds a point or drops one — a line that replaces nothing is "changed"; for a line marked "(removed)" (an approved line that is gone), "same" only when the plan still says it elsewhere, "changed" when its point is dropped. Struck-through text says nothing. If unsure, "changed".',
    `Reply with JSON only, exactly this shape: {"nonce": "${nonce}", "concerns": [{"line": 1, "kind": "wrong" | "clarify", "text": "exact words", "problem": "...", "suggestion": "the words to put in their place"}], "meaning": [{"line": 1, "meaning": "same" | "changed"}]} — concerns: an empty list if there is nothing to raise; meaning: one entry per numbered line.`,
    "",
    "CHANGED LINES",
    ...lines.map((l, i) => `${i + 1}. ${l.removed ? "(removed) " : ""}${l.text}`),
    "",
    "THE APPROVED TEXT THEY REPLACE (lines of the last approved version no longer where they were)",
    ...(removed.length ? removed.map((l) => `- ${l.text}`) : ["(none)"]),
    "",
    "THE WHOLE MAP AND GUIDE (context only)",
    String(context).trim(),
  ].join("\n");
  return { kind: "spine-review", nonce, prompt, bundleHash: sha256(prompt) };
}

const reviewFile = (scope) => `metadata/spine/review/${scope.replace(":", "-")}.json`;

const parseAnswer = (raw, nonce) => {
  const m = String(raw || "").match(/\{[\s\S]*\}/);
  let v = null; try { v = JSON.parse(m?.[0] || ""); } catch { v = null; }
  return v?.nonce === nonce && Array.isArray(v.concerns) ? v : null;
};
/** Does every changed line say the same as the approved text it replaces, and does the plan still say every removed
 *  line (D43)? Only an explicit "same" for every line asked counts: a "changed", a missing or unreadable answer, an
 *  answer from before D43, or nothing asked at all (a change is never "the same" by default) — all fail closed. */
export function readSpineMeaning(raw, nonce, lines) {
  const v = parseAnswer(raw, nonce);
  if (!v || !Array.isArray(v.meaning)) return { same: false, byLine: lines.map(() => "unanswered") };
  const byLine = lines.map((_, i) => { const e = v.meaning.find((x) => x?.line === i + 1); return e?.meaning === "same" ? "same" : e?.meaning === "changed" ? "changed" : "unanswered"; });
  return { same: byLine.length > 0 && byLine.every((x) => x === "same"), byLine };
}
/** The concerns a spine-review answer raises about the changed lines it was shown (null: not the reply asked for). */
function readSpineConcerns(raw, nonce, lines) {
  const v = parseAnswer(raw, nonce);
  if (!v) return null;
  return v.concerns.filter((c) => Number.isInteger(c?.line) && lines[c.line - 1] && !lines[c.line - 1].removed && typeof c.problem === "string" && String(lines[c.line - 1].text).includes(String(c.text || "").trim()))
    .map((c) => ({ kind: c.kind === "clarify" ? "clarify" : "wrong", file: lines[c.line - 1].file, lineNo: lines[c.line - 1].n, line: lines[c.line - 1].text, text: String(c.text || ""), problem: String(c.problem).slice(0, 600), suggestion: String(c.suggestion || "").slice(0, 600) }));
}

/** Run the blind review of a scope's changed lines; the record is logged like every dispatch (and bound to the text
 *  and the exact lines it was shown). The file under metadata/spine/review/ is a readable copy, never trusted. */
export async function reviewSpineChanges(root, reader, scope, { verifier }) {
  const ch = changedSpineLines(root, reader, scope);
  if (!ch.reapproval) return { scope, reapproval: false, concerns: [] };
  let concerns = [], meaning = { same: false, byLine: [] }, dispatch = null, costUsd = 0;
  if (ch.asked.length) {
    const bundle = spineReviewBundle(ch.asked, ch.context, undefined, ch.removed);
    const answer = await verifier(bundle.prompt);
    const read = readSpineConcerns(answer.raw, bundle.nonce, ch.asked);
    const record = recordDispatch(root, { kind: "spine-review", unit: `spine:${scope}`, factHash: ch.textHash, contentHash: ch.textHash, bundle, answer, admission: { status: read ? "reviewed" : "unscorable" },
      extra: { scope, linesHash: ch.linesHash, lines: ch.lines, removed: ch.removed, baseSeq: ch.baseSeq, baseHash: ch.baseHash, askedHash: ch.askedHash } });
    dispatch = record.dispatch; costUsd = answer.costUsd ?? 0;
    if (!read) return { scope, reapproval: true, lines: ch.lines.length, asked: ch.asked.length, unscorable: true, dispatch };
    concerns = read;
    meaning = readSpineMeaning(answer.raw, bundle.nonce, ch.asked);
  }
  const out = { scope, textHash: ch.textHash, baseSeq: ch.baseSeq, lines: ch.lines.length, asked: ch.asked.length, dispatch, concerns, meaning, at: new Date().toISOString() };
  fs.mkdirSync(recordFile(root, "metadata/spine/review"), { recursive: true });
  fs.writeFileSync(recordFile(root, reviewFile(scope)), JSON.stringify(out, null, 2) + "\n");
  return { ...out, costUsd };
}

/**
 * What every approval command checks before it records an approval (redteam r1 C4-13: `coursewerk.mjs approve` had
 * neither check). The scope's spine must be well-formed, and a re-approval follows the blind review of the changed
 * lines (D39) — offline, the agent says so (`withoutReview`), and the approval's note records it.
 * Returns { problem, hint } when the approval must wait, else { note }.
 */
export function approvalPrecondition(root, reader, chapters, { chapter = null, withoutReview = false, note = "" } = {}) {
  const problems = checkSpine(parseSpine(reader, chapters), chapters).filter((p) => chapter ? p.file.endsWith(`/${chapter}.md`) : p.file === COURSE_MAP);
  if (problems.length) return { problem: `the spine is not well-formed yet (${problems.length} problem(s), e.g. ${problems[0].detail}); fix them before approval`, hint: "node scripts/spine.mjs check --root <pkg>" };
  const scope = chapter ? `chapter:${chapter}` : "course", changed = changedSpineLines(root, reader, scope);
  const unreviewed = changed.reapproval && changed.lines.length > 0 && !currentSpineReview(root, reader, scope);
  if (unreviewed && !withoutReview)
    return { problem: `${changed.lines.length} line(s) changed since the last approval and have not had their blind review`, hint: `node scripts/spine.mjs review --root <pkg> ${chapter ? `--chapter ${chapter}` : "--course"} (offline: --without-review, which is recorded)` };
  return { note: [note || "", unreviewed ? "approved without the blind review of the changed lines" : ""].filter(Boolean).join("; ") };
}

// ---- which review stands (red team R6, R6-C4-01: a clean re-run of unchanged text erased a "wrong" concern) -------
// Currency is judged on the READER VIEW (standing.mjs): a review is current while the baseline it diffed against is the
// current one, and what a reader is shown of the files it read — every line in order, headings with their level, each
// as rendered.mjs reads it — and of the lines it was asked about is unchanged. A reflow, a TeX regrouping or emphasis
// is no change; a changed word or symbol, a moved line or a new baseline is.
const fileView = (text) => String(text || "").split("\n").map((l) => l.trim()).filter(Boolean).map((t) => [/^(#{1,6})\s/.exec(t)?.[1].length ?? 0, meaningKey(t)]);
const askedView = (asked) => sha256(canonicalJson(asked.map((l) => [l.removed ? "removed" : "now", l.file, meaningKey(l.text)])));
/** The files a spine review was shown, read back from its prompt's context (bound by its logged bundleHash). */
function shownFiles(prompt, files) {
  const head = "\nTHE WHOLE MAP AND GUIDE (context only)\n", p = String(prompt || ""), i = p.indexOf(head);
  if (i < 0) return null;
  const ctx = p.slice(i + head.length) + "\n", out = {};
  let at = 0;
  for (let k = 0; k < files.length; k++) {
    if (!ctx.startsWith(`${files[k]}\n`, at)) return null;
    const from = at + files[k].length + 1;
    const next = k + 1 < files.length ? ctx.indexOf(`\n${files[k + 1]}\n`, from - 1) : ctx.length;
    if (next < 0) return null;
    out[files[k]] = ctx.slice(from, next);
    at = next + 1;
  }
  return out;
}
const spineView = (files, textOf) => sha256(canonicalJson(files.map((f) => [f, fileView(textOf(f))])));

/**
 * The review of a scope's CURRENT changed lines (null: none was run, or the plan changed since). Read from the logged
 * dispatches, never from a file (red team round 2, C4-11): every spine-review record of the scope that the log vouches
 * for (its whole record bound by recordHash), against the CURRENT baseline (the last full approval it diffed against;
 * R3 F2: a review answered against one approved text is never current against another), of the plan as a reader sees it
 * now — the files it was shown and the lines it was asked (changed and removed) unchanged in the reader view — and
 * readable. Every such review speaks (standing.mjs, red team R6): the concerns of each are raised, and line by line a
 * meaning answer of "changed" outranks "same" — a re-run of unchanged text that comes back clean clears nothing; a real
 * change to the plan, or the instructor's full approval (a new baseline), does. With nothing to ask, the meaning is
 * not "same" (R3 F1).
 */
export function currentSpineReview(root, reader, scope) {
  const ch = changedSpineLines(root, reader, scope);
  if (!ch.reapproval) return null;
  if (!ch.asked.length) return { scope, textHash: ch.textHash, lines: 0, asked: 0, dispatch: null, concerns: [], meaning: { same: false, byLine: [] } };
  const log = parseLog(readLogText(root)), files = filesOf(scope);
  const nowView = spineView(files, (f) => reader.text(f) || ""), nowAsked = askedView(ch.asked);
  const recs = [];
  for (const e of log.filter((r) => r.type === "dispatch" && r.party?.role === "harness" && r.payload?.kind === "spine-review" && r.payload?.unit === `spine:${scope}`)) {
    let rec = null; try { rec = JSON.parse(fs.readFileSync(path.join(recordFile(root, "metadata/verification"), `${e.payload.dispatch}.json`), "utf8")); } catch { continue; }
    if (!dispatchLogEntry(rec, log) || rec.kind !== "spine-review") continue;
    recs.push({ rec, seq: Number(e.seq ?? 0), asked: [...(rec.lines || []), ...(rec.removed || []).map((l) => ({ ...l, removed: true }))] });
  }
  const current = ({ rec, asked }) => {
    if (rec.baseSeq !== ch.baseSeq || (rec.baseHash != null && rec.baseHash !== ch.baseHash)) return false;
    if (rec.factHash === ch.textHash && rec.linesHash === ch.linesHash && rec.askedHash === ch.askedHash) return true; // the very text
    const shown = shownFiles(rec.bundle?.prompt, files);
    return !!shown && spineView(files, (f) => shown[f] ?? "") === nowView && asked.length === ch.asked.length && askedView(asked) === nowAsked;
  };
  const MEANING_RANK = { same: 0, changed: 1 };
  const st = standingOf(recs, {
    current,
    items: ({ rec, asked }) => {
      const concerns = readSpineConcerns(rec.answer?.raw, rec.bundle?.nonce, asked);
      if (!concerns) return null;
      const meaning = readSpineMeaning(rec.answer?.raw, rec.bundle?.nonce, asked).byLine;
      return [...concerns.map((c) => [`concern:${asked.findIndex((l) => l.file === c.file && l.n === c.lineNo)}:${c.kind}:${c.text}`, c]), ...meaning.map((m, i) => [`meaning:${i}`, m])];
    },
    rank: (a, key) => key.startsWith("concern:") ? (a.kind === "wrong" ? 2 : 1) : MEANING_RANK[a] ?? null,
  });
  if (!st.readable.length) return null;
  // a concern is shown on the line as it is now (the same line in the reader view)
  const concerns = [...st.items].filter(([k]) => k.startsWith("concern:")).map(([k, e]) => {
    const i = Number(k.split(":")[1]), l = ch.asked[i] || {};
    return { ...e.answer, file: l.file ?? e.answer.file, lineNo: l.n ?? e.answer.lineNo, line: l.text ?? e.answer.line, dispatch: e.review.rec.dispatch };
  });
  const byLine = ch.asked.map((_, i) => st.items.get(`meaning:${i}`)?.answer ?? "unanswered");
  const newest = st.readable[0].rec;
  return { scope, textHash: ch.textHash, baseSeq: ch.baseSeq, lines: ch.lines.length, asked: ch.asked.length, dispatch: newest.dispatch, concerns,
    meaning: { same: byLine.length > 0 && byLine.every((x) => x === "same"), byLine, disagreed: st.disagreed.filter((k) => k.startsWith("meaning:")).length } };
}
