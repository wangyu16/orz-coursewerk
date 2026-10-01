// The checkpoint digest (M4) and the instructor's answers (redesign P8; skeleton §3; D8, D14).
// The digest brings the instructor only questions routed to the digest — clustered by root cause, ranked, capped per
// batch (default 10). Overflow is deferred, never dropped: deferred clusters go first next time, and their count is
// shown. The corrections the agent made since the last checkpoint sit OUTSIDE the budget, as revertible diffs.
// Agent-routed findings are the agent's own work and appear only as a progress summary; interrupts (M5) are listed
// apart, since they cannot wait.
// An answer is recorded against the finding's id and BASIS (the finding and the current content of its units); the
// same question on unchanged content is never asked again (req.answers.persist).
import fs from "node:fs";
import { sha256, canonicalJson } from "../records/canonical.mjs";
import { appendLogRecord, parseLog, readLogText, verifyLog } from "../records/log.mjs";
import { recordFile } from "../records/paths.mjs";
import { chapterOfFinding } from "./workflow.mjs";

export const DEFAULT_CAP = 10;
const STATE = "metadata/digest/state.json";

/** The basis a question is answered against: the finding, and the current content of the units it names. */
export const basisOf = (f, unitHash) => sha256(canonicalJson([f.id, (f.units || []).map((u) => unitHash.get(u) || null)]));

/** Root cause: the same check, raising the same thing (unit ids, numbers and quotes folded away). */
export function rootCause(f) {
  const what = String(f.evidence?.rule || f.evidence?.what || f.evidence?.note || f.evidence?.problem || "")
    .replace(/u-[a-z0-9-]+/g, "<unit>").replace(/"[^"]*"|“[^”]*”/g, "<quote>").replace(/\d+(?:\.\d+)?/g, "<n>").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${f.module}|${f.kind}|${what}`;
}

function readState(root) { try { return JSON.parse(fs.readFileSync(recordFile(root, STATE), "utf8")); } catch { return { deferred: [], deliveries: 0 }; } }

export function answeredBases(root) {
  const text = readLogText(root);
  const out = new Map();
  if (verifyLog(text).length) return out;
  for (const r of parseLog(text)) if (r.type === "answer" && r.party?.role === "instructor") for (const a of r.payload?.answers || []) out.set(`${a.finding}|${a.basis}`, { choice: a.choice, seq: r.seq });
  return out;
}

/**
 * Build the digest from a gate run.
 * @param findings       gateResult.findings
 * @param unitInfo       Map(unit id → { deliverable, contentHash })
 */
export function buildDigest(root, findings, unitInfo, { cap = DEFAULT_CAP, corrections = [] } = {}) {
  const deliverable = new Map([...unitInfo].map(([k, v]) => [k, v.deliverable])), hash = new Map([...unitInfo].map(([k, v]) => [k, v.contentHash]));
  const answered = answeredBases(root);
  const isOpen = (f) => !["resolved", "answered"].includes(f.status) && !answered.has(`${f.id}|${basisOf(f, hash)}`);
  const asked = findings.filter((f) => f.statusClass === "question" && f.route === "digest" && isOpen(f));
  const interrupts = findings.filter((f) => f.route === "interrupt" && isOpen(f));
  const clusters = new Map();
  for (const f of asked) {
    const k = rootCause(f);
    const c = clusters.get(k) || { key: k, module: f.module, kind: f.kind, findings: [], units: new Set(), chapters: new Set() };
    c.findings.push(f); for (const u of f.units || []) c.units.add(u);
    const ch = chapterOfFinding(f, deliverable); for (const x of [].concat(ch || "package")) c.chapters.add(x);
    clusters.set(k, c);
  }
  const prev = new Set(readState(root).deferred || []);
  const ranked = [...clusters.values()].sort((a, b) =>
    (prev.has(b.key) - prev.has(a.key)) || (b.findings.length - a.findings.length) || (b.units.size - a.units.size) || a.key.localeCompare(b.key));
  const shown = ranked.slice(0, cap), deferred = ranked.slice(cap);
  const entry = (c) => ({
    key: c.key, module: c.module, kind: c.kind, count: c.findings.length, chapters: [...c.chapters].sort(), units: [...c.units].sort(),
    question: c.findings[0].evidence?.note || c.findings[0].evidence?.what || c.findings[0].evidence?.rule || c.kind,
    evidence: c.findings[0].evidence, recommendation: c.findings[0].recommendation ?? null, deferredBefore: prev.has(c.key),
    findings: c.findings.map((f) => f.id), bases: c.findings.map((f) => ({ finding: f.id, basis: basisOf(f, hash) })), // answered at the basis shown
  });
  const agentOpen = findings.filter((f) => f.route === "agent" && isOpen(f));
  const by = (list) => list.reduce((a, f) => ((a[f.kind] = (a[f.kind] || 0) + 1), a), {});
  return {
    entries: shown.map(entry), deferred: { count: deferred.length, findings: deferred.reduce((n, c) => n + c.findings.length, 0), keys: deferred.map((c) => c.key) },
    interrupts: interrupts.map((f) => ({ id: f.id, kind: f.kind, reason: f.interruptReason, evidence: f.evidence })),
    corrections, // outside the budget
    progress: { agentOpen: by(agentOpen), blocking: by(findings.filter((f) => ["defect", "obligation"].includes(f.statusClass) && isOpen(f))), questionsOpen: asked.length, answered: answered.size },
  };
}

/** Deliver a digest: remember what was deferred (it goes first next time), and log the checkpoint. */
export function deliverDigest(root, digest, party) {
  const st = readState(root);
  fs.mkdirSync(recordFile(root, "metadata/digest"), { recursive: true });
  fs.writeFileSync(recordFile(root, STATE), JSON.stringify({ deferred: digest.deferred.keys, deliveries: (st.deliveries || 0) + 1, at: new Date().toISOString() }, null, 2) + "\n");
  return appendLogRecord(root, { type: "checkpoint", party, payload: { moment: "M4", shown: digest.entries.map((e) => e.key), deferred: digest.deferred.count, corrections: digest.corrections.map((c) => c.id), progress: digest.progress } });
}

/**
 * The instructor answers digest entries (by key), or accepts every recommendation in one action.
 * Each answer binds every finding of the entry at the basis it was shown at.
 */
export function answerDigest(root, digest, { answers = {}, acceptAll = false, instructorWords }, party) {
  if (party?.role !== "instructor") throw new Error("only the instructor answers a question; the agent never answers one on the instructor's behalf");
  if (!String(instructorWords || "").trim()) throw new Error("an answer quotes the instructor's words");
  const unknown = Object.keys(answers).filter((k) => !digest.entries.some((e) => e.key === k));
  if (unknown.length) throw new Error(`not in this digest: ${unknown.join(", ")}`);
  const recorded = [];
  for (const e of digest.entries) {
    const choice = e.key in answers ? answers[e.key] : acceptAll && e.recommendation != null ? e.recommendation : undefined;
    if (choice !== undefined) for (const b of e.bases) recorded.push({ ...b, choice: String(choice), entry: e.key });
  }
  if (!recorded.length) throw new Error("nothing to record: name an entry and a choice, or accept all recommendations");
  appendLogRecord(root, { type: "answer", party, payload: { answers: recorded, acceptAll, instructorWords } });
  return recorded;
}
