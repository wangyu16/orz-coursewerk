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
import { listItemsOf } from "./printed.mjs";
import { standingOf } from "../verify/standing.mjs";
import { versionScopeGaps } from "./version_scope.mjs";

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
 *  is not a change, a move is). Only a REAL list item's number is folded — a line orz-markdown reads as the start of
 *  an ordered list item (printed.mjs listItemsOf). A wrapped prose line that only begins like one ("1000. Such large
 *  values …", a paragraph's continuation) keeps its number: changing it to "10." is a changed line (red team R7, C4.11). */
function keyedLines(text) {
  const path_ = [], out = [], items = new Set(listItemsOf(String(text || "")).map((it) => it.start));
  String(text || "").split("\n").forEach((l, i) => {
    const t = l.trim(); if (!t) return;
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    const norm = (items.has(i) ? t.replace(/^\d+[.)]\s+/, "#. ") : t).replace(/\s+/g, " ");
    if (h) path_.length = h[1].length - 1;
    out.push({ n: i + 1, text: t, under: path_.join(" > "), key: `${path_.join("\u0001")}\u0000${norm}` });
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
  // each changed line's hunk: the approved line kept just before it (both sides share it), so a removed line and the
  // lines added where it stood are found together, whatever changed elsewhere
  const gaps = (xs, kept) => { let g = "^"; return xs.map((x, i) => { if (kept.has(i)) { g = x.key; return null; } return g; }); };
  const ga = gaps(a, keptA), gb = gaps(b, keptB);
  return { added: b.map((x, j) => ({ ...x, gap: gb[j] })).filter((_, j) => !keptB.has(j)), removed: a.map((x, i) => ({ ...x, gap: ga[i] })).filter((_, i) => !keptA.has(i)) };
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
    for (const l of d.added) out.push({ file, n: l.n, text: l.text, under: l.under, gap: l.gap });
    for (const l of d.removed) removed.push({ file, n: l.n, text: l.text, under: l.under, gap: l.gap, removed: true });
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
  // the version's scope is continuous (R7 H-01): a unit that entered it after it opened was carried, or re-verified since
  const late = versionScopeGaps(root, reader, { scope });
  if (late.length) return { problem: `${late[0].units.length} unit(s) entered ${scope} version ${late[0].version} after it opened and were never carried into it (${late[0].units.slice(0, 4).join(", ")}${late[0].units.length > 4 ? ", …" : ""})`, hint: "node scripts/units.mjs reconcile --root <pkg> (carries them), then re-verify them" };
  const cur = changed.reapproval && changed.lines.length > 0 ? currentSpineReview(root, reader, scope) : null;
  const unreviewed = changed.reapproval && changed.lines.length > 0 && (!cur || cur.unreviewed?.length > 0);
  if (unreviewed && !withoutReview)
    return { problem: `${changed.lines.length} line(s) changed since the last approval and have not had their blind review`, hint: `node scripts/spine.mjs review --root <pkg> ${chapter ? `--chapter ${chapter}` : "--course"} (offline: --without-review, which is recorded)` };
  return { note: [note || "", unreviewed ? "approved without the blind review of the changed lines" : ""].filter(Boolean).join("; ") };
}

// ---- which review stands (red team R6, R6-C4-01: a clean re-run of unchanged text erased a "wrong" concern) -------
// Currency is judged on the READER VIEW (standing.mjs), and LINE BY LINE (red team R7, cause 2): a review is of this
// re-approval while the baseline it diffed against is the current one, and what it said of a line — a concern, a meaning
// answer — stands while that line is still asked, under the same headings, reading the same as rendered.mjs reads it.
// A reflow, a TeX regrouping or emphasis of the line is no change; a changed word or symbol, a moved line or a new
// baseline is. A change to ANOTHER line leaves it standing, and that other line owes its own review (`unreviewed`).
/** Each asked line's key: changed or removed, its file, the headings it stands under (a record written before R7 did
 *  not keep them: "*") and its text in the reader view — and which occurrence of that it is. */
function lineKeys(asked, { wild = false } = {}) {
  const seen = new Map();
  return asked.map((l) => {
    const under = wild || typeof l.under !== "string" ? "*" : l.under;
    const k = [l.removed ? "removed" : "now", l.file, under, meaningKey(String(l.text || ""))].join("\u0001"), n = seen.get(k) || 0;
    seen.set(k, n + 1); return `${k}\u0001${n}`;
  });
}

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
  const log = parseLog(readLogText(root));
  const recs = [];
  for (const e of log.filter((r) => r.type === "dispatch" && r.party?.role === "harness" && r.payload?.kind === "spine-review" && r.payload?.unit === `spine:${scope}`)) {
    let rec = null; try { rec = JSON.parse(fs.readFileSync(path.join(recordFile(root, "metadata/verification"), `${e.payload.dispatch}.json`), "utf8")); } catch { continue; }
    if (!dispatchLogEntry(rec, log) || rec.kind !== "spine-review") continue;
    recs.push({ rec, seq: Number(e.seq ?? 0), asked: [...(rec.lines || []), ...(rec.removed || []).map((l) => ({ ...l, removed: true }))] });
  }
  // the review is of this re-approval when it diffed against the current baseline (R3 F2); what it said about each line
  // is current while THAT line is still asked, reading the same (red team R7, cause 2: an answer is bound to what it
  // judged — a concern or a meaning answer on one line stands whatever other line of the plan is changed, added or
  // reverted since, so a clean re-run after an edit elsewhere clears nothing; a change to the line itself, or the
  // instructor's full approval (a new baseline), does)
  const current = ({ rec }) => rec.baseSeq === ch.baseSeq && (rec.baseHash == null || rec.baseHash === ch.baseHash);
  // each line a review was asked is matched to the line asked NOW that reads the same (none: it judged a line that
  // has changed, moved or gone since, and what it said of it is history)
  const askedNow = new Map(lineKeys(ch.asked).map((k, i) => [k, i])), askedWild = new Map(lineKeys(ch.asked, { wild: true }).map((k, i) => [k, i]));
  const nowIndex = (asked) => lineKeys(asked).map((k, j) => (k.includes("\u0001*\u0001") ? askedWild.get(k) : askedNow.get(k)) ?? `-1.${j}`);
  const MEANING_RANK = { same: 0, changed: 1 };
  const st = standingOf(recs, {
    current,
    // a meaning answer on a REMOVED line judged "does the plan still say it?" against what now stands where it stood:
    // it is current while the lines added in its hunk (after the same kept line) read as they did — the requirement
    // restored there in other words is a new question; a change anywhere else leaves it standing. A record that kept
    // no hunks (before the R7 integration) is bound to the whole plan as shown.
    itemCurrent: ({ rec }, key) => {
      if (/^(?:meaning|concern):-1\./.test(key)) return false;
      const m = /^meaning:(\d+)$/.exec(key), l = m && ch.asked[Number(m[1])];
      if (!l?.removed) return true;
      if ([...(rec.lines || []), ...(rec.removed || [])].some((x) => typeof x.gap !== "string")) return (rec.factHash ?? rec.contentHash) === ch.textHash;
      const beside = (lines) => lines.filter((x) => x.file === l.file && x.gap === l.gap).map((x) => meaningKey(String(x.text || ""))).join("\u0001");
      return beside(rec.lines || []) === beside(ch.lines);
    },
    items: ({ rec, asked }) => {
      const concerns = readSpineConcerns(rec.answer?.raw, rec.bundle?.nonce, asked);
      if (!concerns) return null;
      const meaning = readSpineMeaning(rec.answer?.raw, rec.bundle?.nonce, asked).byLine, at = nowIndex(asked);
      return [...concerns.map((c) => [`concern:${at[asked.findIndex((l) => l.file === c.file && l.n === c.lineNo && !l.removed)]}\u0002${c.kind}\u0002${c.text}`, c]), ...meaning.map((m, i) => [`meaning:${at[i]}`, m])];
    },
    rank: (a, key) => key.startsWith("concern:") ? (a.kind === "wrong" ? 2 : 1) : MEANING_RANK[a] ?? null,
  });
  if (!st.readable.length) return null;
  // a concern is shown on the line as it is now (the same line in the reader view)
  const concerns = [...st.items].filter(([k]) => k.startsWith("concern:")).map(([k, e]) => {
    const l = ch.asked[Number(k.slice("concern:".length).split("\u0002")[0])] || {};
    return { ...e.answer, file: l.file ?? e.answer.file, lineNo: l.n ?? e.answer.lineNo, line: l.text ?? e.answer.line, dispatch: e.review.rec.dispatch };
  });
  const byLine = ch.asked.map((_, i) => st.items.get(`meaning:${i}`)?.answer ?? "unanswered");
  // every line asked now must have been asked of a current review: a line changed, moved or added since is unreviewed
  const unreviewed = ch.asked.filter((_, i) => !st.judged.has(`meaning:${i}`));
  const newest = st.readable[0].rec;
  return { scope, textHash: ch.textHash, baseSeq: ch.baseSeq, lines: ch.lines.length, asked: ch.asked.length, dispatch: newest.dispatch, concerns, unreviewed,
    meaning: { same: byLine.length > 0 && byLine.every((x) => x === "same"), byLine, disagreed: st.disagreed.filter((k) => k.startsWith("meaning:")).length } };
}
