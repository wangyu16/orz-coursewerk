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

/** The files an approval of the scope covers (and binds): a chapter's concept map and assessment guide; the course map. */
const filesOf = (scope) => (scope === "course" ? [COURSE_MAP] : Object.values(spinePaths(scope.slice("chapter:".length))));

function lastApprovedText(root, scope) {
  const recs = parseLog(readLogText(root)).filter((r) => r.type === "approval" && r.party?.role === "instructor" && r.payload?.scope === scope);
  const t = recs.at(-1)?.payload?.text;
  return t == null ? null : t;
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
/** The lines of `now` that a longest-common-subsequence diff against `was` does not match: inserted, changed or moved. */
export function diffLines(was, now) {
  const a = keyedLines(was), b = keyedLines(now), m = a.length, n = b.length;
  const L = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = a[i].key === b[j].key ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const kept = new Set();
  for (let i = 0, j = 0; i < m && j < n;) {
    if (a[i].key === b[j].key) { kept.add(j); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  return b.filter((_, j) => !kept.has(j));
}

/** The spine lines that changed since the last full approval of a scope ("chapter:<slug>" or "course"). */
export function changedSpineLines(root, reader, scope) {
  const before = lastApprovedText(root, scope);
  if (before == null) return { reapproval: false, lines: [], context: "" };
  const out = [];
  let context = "";
  for (const file of filesOf(scope)) {
    const now = reader.text(file) || "", was = typeof before === "string" ? (file === COURSE_MAP || scope === "course" ? before : "") : before[file] || "";
    for (const l of diffLines(was, now)) out.push({ file, n: l.n, text: l.text });
    context += `${file}\n${now}\n`;
  }
  const lines = out;
  return { reapproval: true, lines, context, textHash: sha256(canonicalJson(filesOf(scope).map((f) => reader.text(f) || ""))), linesHash: sha256(canonicalJson(lines.map((l) => [l.file, l.n, l.text]))) };
}

export function spineReviewBundle(lines, context, nonce = randomBytes(8).toString("hex")) {
  const prompt = [
    "Below are lines from the plan of a college course (its concept map and assessment guide, which its teaching and assessment follow) that were changed, added or moved since the instructor last approved it, and the whole plan for context.",
    'Check each changed line for errors of fact or concept, at the level the course is taught. Raise a concern of one of two kinds. "wrong": the line states something false. "clarify": the line is correct as meant, but a few added or changed words would remove a likely misreading.',
    "Judge accuracy only: not style, structure, or what the course chooses to cover. Do not raise exceptions beyond what the line is about.",
    `Reply with JSON only, exactly this shape: {"nonce": "${nonce}", "concerns": [{"line": 1, "kind": "wrong" | "clarify", "text": "exact words", "problem": "...", "suggestion": "the words to put in their place"}]} — an empty list if there is nothing to raise.`,
    "",
    "CHANGED LINES",
    ...lines.map((l, i) => `${i + 1}. ${l.text}`),
    "",
    "THE WHOLE MAP AND GUIDE (context only)",
    String(context).trim(),
  ].join("\n");
  return { kind: "spine-review", nonce, prompt, bundleHash: sha256(prompt) };
}

const reviewFile = (scope) => `metadata/spine/review/${scope.replace(":", "-")}.json`;

/** The concerns a spine-review answer raises about the changed lines it was shown (null: not the reply asked for). */
function readSpineConcerns(raw, nonce, lines) {
  const m = String(raw || "").match(/\{[\s\S]*\}/);
  let v = null; try { v = JSON.parse(m?.[0] || ""); } catch { v = null; }
  if (v?.nonce !== nonce || !Array.isArray(v.concerns)) return null;
  return v.concerns.filter((c) => Number.isInteger(c?.line) && lines[c.line - 1] && typeof c.problem === "string" && String(lines[c.line - 1].text).includes(String(c.text || "").trim()))
    .map((c) => ({ kind: c.kind === "clarify" ? "clarify" : "wrong", file: lines[c.line - 1].file, lineNo: lines[c.line - 1].n, line: lines[c.line - 1].text, text: String(c.text || ""), problem: String(c.problem).slice(0, 600), suggestion: String(c.suggestion || "").slice(0, 600) }));
}

/** Run the blind review of a scope's changed lines; the record is logged like every dispatch (and bound to the text
 *  and the exact lines it was shown). The file under metadata/spine/review/ is a readable copy, never trusted. */
export async function reviewSpineChanges(root, reader, scope, { verifier }) {
  const ch = changedSpineLines(root, reader, scope);
  if (!ch.reapproval) return { scope, reapproval: false, concerns: [] };
  let concerns = [], dispatch = null, costUsd = 0;
  if (ch.lines.length) {
    const bundle = spineReviewBundle(ch.lines, ch.context);
    const answer = await verifier(bundle.prompt);
    const read = readSpineConcerns(answer.raw, bundle.nonce, ch.lines);
    const record = recordDispatch(root, { kind: "spine-review", unit: `spine:${scope}`, factHash: ch.textHash, contentHash: ch.textHash, bundle, answer, admission: { status: read ? "reviewed" : "unscorable" },
      extra: { scope, linesHash: ch.linesHash, lines: ch.lines } });
    dispatch = record.dispatch; costUsd = answer.costUsd ?? 0;
    if (!read) return { scope, reapproval: true, lines: ch.lines.length, unscorable: true, dispatch };
    concerns = read;
  }
  const out = { scope, textHash: ch.textHash, lines: ch.lines.length, dispatch, concerns, at: new Date().toISOString() };
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

/**
 * The review of a scope's CURRENT changed lines, if one was run (null: none, or the plan changed since). Read from the
 * logged dispatch, never from a file (red team round 2, C4-11): the newest spine-review record of the scope that the
 * log vouches for (its whole record bound by recordHash), made of the current text and exactly the current changed
 * lines, and readable; its concerns are re-read from its answer.
 */
export function currentSpineReview(root, reader, scope) {
  const ch = changedSpineLines(root, reader, scope);
  if (!ch.reapproval) return null;
  if (!ch.lines.length) return { scope, textHash: ch.textHash, lines: 0, dispatch: null, concerns: [] };
  const log = parseLog(readLogText(root));
  const entries = log.filter((r) => r.type === "dispatch" && r.party?.role === "harness" && r.payload?.kind === "spine-review" && r.payload?.unit === `spine:${scope}`).reverse();
  for (const e of entries) {
    let rec = null; try { rec = JSON.parse(fs.readFileSync(path.join(recordFile(root, "metadata/verification"), `${e.payload.dispatch}.json`), "utf8")); } catch { continue; }
    if (!dispatchLogEntry(rec, log) || rec.kind !== "spine-review" || rec.factHash !== ch.textHash || rec.linesHash !== ch.linesHash) continue;
    const concerns = readSpineConcerns(rec.answer?.raw, rec.bundle?.nonce, ch.lines);
    if (concerns) return { scope, textHash: ch.textHash, lines: ch.lines.length, dispatch: rec.dispatch, concerns };
  }
  return null;
}
