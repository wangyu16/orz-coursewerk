// A blind review of the spine lines changed since the instructor last approved them (D39, operator 2026-10-03).
// Planted errors in a concept map voided the approval but nothing named them (P11). At re-approval, the lines that
// changed are read by a context-blind verifier — accuracy only, in the two kinds of D35 — and its concerns are shown
// to the instructor in the approval preview as questions: the spine is the instructor's (D31), so nothing is edited.
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { readLogText, parseLog } from "../records/log.mjs";
import { recordFile } from "../records/paths.mjs";
import { canonicalJson, sha256 } from "../records/canonical.mjs";
import { recordDispatch } from "../verify/dispatch.mjs";
import { COURSE_MAP, spinePaths } from "./spine.mjs";

const filesOf = (scope) => (scope === "course" ? [COURSE_MAP] : [spinePaths(scope.slice("chapter:".length)).map]);

function lastApprovedText(root, scope) {
  const recs = parseLog(readLogText(root)).filter((r) => r.type === "approval" && r.party?.role === "instructor" && r.payload?.scope === scope);
  const t = recs.at(-1)?.payload?.text;
  return t == null ? null : t;
}

/** The concept-map lines that changed since the last full approval of a scope ("chapter:<slug>" or "course"). */
export function changedSpineLines(root, reader, scope) {
  const before = lastApprovedText(root, scope);
  if (before == null) return { reapproval: false, lines: [], context: "" };
  const out = [];
  let context = "";
  for (const file of filesOf(scope)) {
    const now = reader.text(file) || "", was = typeof before === "string" ? before : before[file] || "";
    const old = new Set(was.split("\n").map((l) => l.trim()));
    now.split("\n").forEach((l, i) => { const t = l.trim(); if (t && !old.has(t) && !/^#{1,6}\s/.test(t)) out.push({ file, n: i + 1, text: t }); });
    context += `${now}\n`;
  }
  return { reapproval: true, lines: out, context, textHash: sha256(canonicalJson(filesOf(scope).map((f) => reader.text(f) || ""))) };
}

export function spineReviewBundle(lines, context, nonce = randomBytes(8).toString("hex")) {
  const prompt = [
    "Below are lines from the concept map of a college course (the plan its teaching follows) that were changed since the instructor last approved it, and the whole map for context.",
    'Check each changed line for errors of fact or concept, at the level the course is taught. Raise a concern of one of two kinds. "wrong": the line states something false. "clarify": the line is correct as meant, but a few added or changed words would remove a likely misreading.',
    "Judge accuracy only: not style, structure, or what the course chooses to cover. Do not raise exceptions beyond what the line is about.",
    `Reply with JSON only, exactly this shape: {"nonce": "${nonce}", "concerns": [{"line": 1, "kind": "wrong" | "clarify", "text": "exact words", "problem": "...", "suggestion": "the words to put in their place"}]} — an empty list if there is nothing to raise.`,
    "",
    "CHANGED LINES",
    ...lines.map((l, i) => `${i + 1}. ${l.text}`),
    "",
    "THE WHOLE MAP (context only)",
    String(context).trim(),
  ].join("\n");
  return { kind: "spine-review", nonce, prompt, bundleHash: sha256(prompt) };
}

const reviewFile = (scope) => `metadata/spine/review/${scope.replace(":", "-")}.json`;

/** Run the blind review of a scope's changed lines; the record is logged like every dispatch. */
export async function reviewSpineChanges(root, reader, scope, { verifier }) {
  const ch = changedSpineLines(root, reader, scope);
  if (!ch.reapproval) return { scope, reapproval: false, concerns: [] };
  let concerns = [], dispatch = null, costUsd = 0;
  if (ch.lines.length) {
    const bundle = spineReviewBundle(ch.lines, ch.context);
    const answer = await verifier(bundle.prompt);
    const m = String(answer.raw || "").match(/\{[\s\S]*\}/);
    let v = null; try { v = JSON.parse(m?.[0] || ""); } catch { v = null; }
    const ok = v?.nonce === bundle.nonce && Array.isArray(v.concerns);
    concerns = ok ? v.concerns.filter((c) => Number.isInteger(c?.line) && ch.lines[c.line - 1] && typeof c.problem === "string" && String(ch.lines[c.line - 1].text).includes(String(c.text || "").trim()))
      .map((c) => ({ kind: c.kind === "clarify" ? "clarify" : "wrong", file: ch.lines[c.line - 1].file, lineNo: ch.lines[c.line - 1].n, line: ch.lines[c.line - 1].text, text: String(c.text || ""), problem: String(c.problem).slice(0, 600), suggestion: String(c.suggestion || "").slice(0, 600) })) : [];
    const record = recordDispatch(root, { kind: "spine-review", unit: `spine:${scope}`, factHash: ch.textHash, contentHash: ch.textHash, bundle, answer, admission: { status: ok ? "reviewed" : "unscorable" } });
    dispatch = record.dispatch; costUsd = answer.costUsd ?? 0;
    if (!ok) return { scope, reapproval: true, lines: ch.lines.length, unscorable: true, dispatch };
  }
  const out = { scope, textHash: ch.textHash, lines: ch.lines.length, dispatch, concerns, at: new Date().toISOString() };
  fs.mkdirSync(recordFile(root, "metadata/spine/review"), { recursive: true });
  fs.writeFileSync(recordFile(root, reviewFile(scope)), JSON.stringify(out, null, 2) + "\n");
  return { ...out, costUsd };
}

/** The review of a scope's CURRENT text, if one was run (null: none, or the map changed since). */
export function currentSpineReview(root, reader, scope) {
  let r = null; try { r = JSON.parse(fs.readFileSync(recordFile(root, reviewFile(scope)), "utf8")); } catch { return null; }
  const now = sha256(canonicalJson(filesOf(scope).map((f) => reader.text(f) || "")));
  return r?.textHash === now ? r : null;
}
