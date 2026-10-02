// The record of how issues were found and settled (operator, 2026-10-02: "it is more important to keep a record how
// issues were discovered and fixed than to make the package perfect"). Everything here is read back from the package's
// own records — the verification records, the corrections, the unit index and the decision log — so the history can
// be rebuilt at any time and never depends on anyone's memory of the session.
import fs from "node:fs";
import path from "node:path";
import { parseLog, readLogText, verifyLog } from "../records/log.mjs";
import { recordFile } from "../records/paths.mjs";
import { readAbsoluteReview } from "../verify/absolutes.mjs";

const readDir = (root, rel) => { const d = recordFile(root, rel); return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(d, f), "utf8")); } catch { return null; } }).filter(Boolean) : []; };

/** Concerns in a knowledge record, read against the passage the reviewer saw. */
function concernsOf(r) {
  const m = String(r.answer?.raw || "").match(/\{[\s\S]*\}/);
  let v; try { v = JSON.parse(m?.[0] || ""); } catch { return []; }
  if (v?.nonce !== r.bundle?.nonce || !Array.isArray(v.concerns)) return [];
  return v.concerns.filter((c) => typeof c?.problem === "string" && c.problem.trim()).map((c) => ({ text: String(c.text || ""), problem: c.problem, suggestion: c.suggestion || "" }));
}

/**
 * @param units  Map(unit id → { contentHash, origin }) — the current unit index
 * @returns { issues: [{ at, foundBy, unit, issue, settled }], counts }
 */
export function issueHistory(root, units) {
  const log = verifyLog(readLogText(root)).length ? [] : parseLog(readLogText(root));
  const settle = (unit, contentHash) => {
    const u = units.get(unit);
    if (!u) return "the unit was rewritten or removed since";
    if (u.contentHash !== contentHash) {
      const by = u.origin?.revisedBy?.at(-1) || (u.origin?.kind === "agent-knowledge" ? { model: u.origin.model, step: u.origin.step } : null);
      return `the text was revised since${by ? ` (${by.step || "revision"}, ${by.model || "agent"})` : u.origin?.kind === "instructor-authored" ? " (by the instructor)" : ""}`;
    }
    const ev = (u.evidence || []).map((e) => e.type);
    if (ev.includes("instructor-confirmation")) return "confirmed by the instructor";
    if (ev.includes("authorized-divergence")) return "kept by the instructor against the evidence (a recorded divergence)";
    if (ev.includes("quote-verified")) return "verified against a pinned source";
    return "the text is unchanged (answered by the instructor, or still open)";
  };
  const issues = [];
  for (const r of readDir(root, "metadata/verification")) {
    if (r.kind === "knowledge") for (const c of concernsOf(r)) issues.push({ at: r.at, foundBy: "blind conceptual review", unit: r.unit, issue: c.problem, suggestion: c.suggestion, settled: settle(r.unit, r.contentHash) });
    if (r.kind === "semi") for (const c of r.admission?.perClaim || []) {
      if (["contradicted", "disputed"].includes(c.status)) issues.push({ at: r.at, foundBy: "blind fact check against pinned sources", unit: r.unit, issue: `${c.status}: ${(c.conflicts || []).map((k) => `${k.claimed} vs ${k.source}`).join("; ")}`, settled: settle(r.unit, r.contentHash) });
      if (c.status === "hypothetical") issues.push({ at: r.at, foundBy: "blind fact check against pinned sources", unit: r.unit, issue: "invented exercise data: no source can show it", settled: settle(r.unit, r.contentHash) });
    }
    if (r.kind === "absolute") {
      const v = readAbsoluteReview(r.answer?.raw, r.bundle?.nonce, r.sentences || [], r.context || "");
      for (const x of v.ok ? v.results.filter((y) => y.class === "over-general") : []) issues.push({ at: r.at, foundBy: "context review of absolute statements", unit: r.unit, issue: `over-general: ${x.why}`, suggestion: x.suggestion, settled: settle(r.unit, r.contentHash) });
    }
  }
  for (const c of readDir(root, "metadata/corrections")) issues.push({ at: c.at, foundBy: "harness auto-correction", unit: c.unit, issue: `corrected: ${c.edits?.map((e) => `${e.claimed} → ${e.replacement}`).join("; ")}`, settled: c.status === "reverted" ? `reverted by the instructor: "${c.note}"` : "corrected, shown as a diff" });
  for (const l of log) {
    if (l.type === "authorship-confirmation" && l.payload?.units) for (const u of l.payload.units) issues.push({ at: l.at, foundBy: "unit index (an edit outside any agent session)", unit: u, issue: "an edit of unknown authorship", settled: `claimed by ${l.party.name}${l.payload.instructorWords ? `: "${l.payload.instructorWords}"` : ""}` });
    if (l.type === "answer") issues.push({ at: l.at, foundBy: "the instructor, at a digest", unit: "—", issue: `${(l.payload?.answers || []).length} answer(s)`, settled: `"${l.payload?.instructorWords || ""}"` });
  }
  issues.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  // the same issue found again on the same text by a later pass is one row, with how often it was found
  const seen = new Map(), rows = [];
  for (const x of issues) { const k = `${x.foundBy}|${x.unit}|${x.issue}|${x.settled}`; if (seen.has(k)) { seen.get(k).times++; continue; } x.times = 1; seen.set(k, x); rows.push(x); }
  issues.length = 0; issues.push(...rows);
  const counts = issues.reduce((a, x) => ((a[x.foundBy] = (a[x.foundBy] || 0) + 1), a), {});
  return { issues, counts };
}

export function historyMarkdown(h) {
  const L = ["# How issues were found and settled", "", "| found by | count |", "|---|---|", ...Object.entries(h.counts).map(([k, v]) => `| ${k} | ${v} |`), "",
    "| when | found by | unit | issue | how it was settled | times found |", "|---|---|---|---|---|---|"];
  const cell = (s) => String(s || "").replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 240);
  for (const x of h.issues) L.push(`| ${String(x.at).slice(0, 16)} | ${cell(x.foundBy)} | ${cell(x.unit)} | ${cell(x.issue)} | ${cell(x.settled)} | ${x.times} |`);
  return L.join("\n") + "\n";
}
