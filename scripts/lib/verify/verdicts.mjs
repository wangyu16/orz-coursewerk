// The semi-mechanical verdict path and its two follow-ups (redesign P7; D17, D19-A/B/D, Q10).
//   verifySemi       for each semi-mechanical unit without admitted evidence: claims → candidate passages from pinned
//                    texts → blind bundle → verifier → deterministic admission → evidence (only when admitted).
//   verifyKnowledge  knowledge-based units: the blind verifier's concerns are recorded and become QUESTIONS (MS8);
//                    nothing in the package changes (req.knowledge.no-autochange).
//   applyCorrection  the agent's auto-correction of an admitted, uncontested contradiction (req.autocorrect.guard);
//                    instructor text needs two agreeing sources; anything else is a question. Logged with its diff.
//   revertCorrection the instructor reverting a correction after seeing diff and evidence = the double confirmation
//                    (req.revert.double-confirm): the text stands as an authorized divergence, with the note.
import fs from "node:fs";
import { canonicalJson, sha256 } from "../records/canonical.mjs";
import path from "node:path";
import { recordFile } from "../records/paths.mjs";
import { appendLogRecord } from "../records/log.mjs";
import { factHash, questionsOf, referencedUnits } from "../core/dependencies.mjs";
import { unitHash } from "../core/segment.mjs";
import { admitEvidence, evidenceStands, hasAdmittedEvidence, indexAndStamp, leadOf, loadUnits, loggedInstructorActs, needsEvidence, recordLeads, recordedLeads, reviewedAbsolutes, unitDepsHashes } from "../core/obligations.mjs";
import { absoluteBundle, absoluteSentences, absolutesHash, readAbsoluteReview } from "./absolutes.mjs";
import { randomBytes } from "node:crypto";
import { readLogText } from "../records/log.mjs";
import { checkableClaims, claimsHash, claimOf, quantitiesIn, withLead } from "./claims.mjs";
import { admit, sameAtPrecision, supports } from "./admission.mjs";
import { knowledgeBundle, readDispatches, recordDispatch, recordHashOf, selectPassages, semiBundle } from "./dispatch.mjs";

export const CORRECTIONS_DIR = "metadata/corrections";

// evidence counts for the unit's current facts, lead-in and the instructor's answers (core/obligations.mjs)
const hasAdmitted = (root, u, all) => evidenceStands(root, u, all);
export { leadOf, recordLeads };

/** The log, parsed. */
export function logRecordsOf(text) { return String(text || "").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }
/**
 * A dispatch record counts only if the log names it with the same bundle and answer (round P7-1, B12/B13) and, for
 * records logged since redteam round 1, the same whole record (recordHash: C2-03). Returns the log record, or null.
 */
export function dispatchLogEntry(record, logRecords) {
  if (!record || sha256(record.bundle?.prompt ?? "") !== record.bundle?.bundleHash || sha256(record.answer?.raw ?? "") !== record.answer?.responseHash) return null;
  return logRecords.find((l) => l.type === "dispatch" && l.party?.role === "harness" && l.payload?.dispatch === record.dispatch && l.payload?.unit === record.unit && l.payload?.bundleHash === record.bundle.bundleHash && l.payload?.responseHash === record.answer.responseHash
    && (l.payload?.recordHash == null || l.payload.recordHash === recordHashOf(record))) || null;
}
export const dispatchLogged = (record, logRecords) => !!dispatchLogEntry(record, logRecords);
/** The claims a semi record checked, as printed in its prompt. */
export const recordClaimTexts = (record) => { const lines = String(record.bundle?.prompt || "").split("\n"); return lines.slice(lines.indexOf("CLAIMS") + 1, lines.indexOf("PASSAGES")).map((l) => l.match(/^\d+\. (.*)$/)?.[1]).filter(Boolean); };
/** Did this record check exactly the unit's current checkable claims? */
export const checksCurrentClaims = (record, unitText, lead = null) => JSON.stringify(recordClaimTexts(record)) === JSON.stringify(checkableClaims(unitText).map((c) => c.text.replace(/\s+/g, " ")))
  // a record whose lead-in no longer introduces the equation is history; a record without leads (before P11) is not judged on them
  && (!Object.keys(recordLeads(record)).length || Object.values(recordLeads(record)).every((l) => l === String(lead || "").replace(/\s+/g, " ")));
const packageDispatches = (root) => {
  const dir = recordFile(root, "metadata/verification");
  if (!fs.existsSync(dir)) return [];
  return readDispatches((p) => fs.readFileSync(recordFile(root, p), "utf8"), fs.readdirSync(dir).map((f) => `metadata/verification/${f}`));
};

/** Evidence the harness writes when a dispatch is admitted. */
/**
 * A disputed claim, as one thing the instructor can answer once (D40, operator 2026-10-03): the unit, the claim's own
 * sentence, and the values in dispute. An edit elsewhere in the unit leaves it — and the instructor's answer — intact.
 */
export const claimKey = (unitId, claimText, conflicts = []) => sha256(canonicalJson([unitId, String(claimText || "").replace(/\s+/g, " ").trim(), conflicts.map((k) => [k.claimed, k.source])]));
/** The claims the instructor kept as written, by claim key (answers "keep …" to a fact-disputed entry). */
export function keptClaims(logRecords) {
  const out = new Set();
  for (const l of logRecords) if (l.type === "answer" && l.party?.role === "instructor") for (const a of l.payload?.answers || []) if (a.claimKey && /^\s*keep/i.test(a.choice)) out.add(a.claimKey);
  return out;
}
/** A dispute the instructor already settled by keeping the claim is not open; if every other claim is supported, the
 *  unit is evidenced — the kept claim by the instructor's answer, the rest by their quotes. A changed sentence is a new
 *  claim and needs its own evidence. */
export function settleKept(admission, unitId, claims, kept) {
  if (!admission || admission.status !== "disputed" || !kept.size) return admission;
  const keyOf = (c) => claimKey(unitId, claims.find((x) => x.index === c.claim)?.text, c.conflicts || []);
  const ok = admission.perClaim.every((c) => c.status === "supported" || (c.status === "disputed" && kept.has(keyOf(c))));
  return ok ? { ...admission, status: "admitted", kept: admission.perClaim.filter((c) => c.status === "disputed").map((c) => ({ claim: c.claim, claimKey: keyOf(c) })) } : admission;
}

function evidenceFrom(record, admission, texts, unitText) {
  const quotes = admission.perClaim.flatMap((c) => (c.quotes || []).map((q) => ({ ...q, claim: c.claim, textSha256: texts.get(q.source)?.sha256 })));
  // an equation's evidence binds the lead-in it was verified with (red-team round 1, F13)
  const lead = Object.values(recordLeads(record))[0];
  return { type: "quote-verified", source: quotes[0]?.source, quotes, factHash: factHash(unitText), claimsHash: claimsHash(unitText), ...(lead ? { lead } : {}), dispatch: record.dispatch, at: record.at };
}

/**
 * @param texts     Map(id → { text, sha256, ok }) — pinnedTexts(...)
 * @param verifier  async (prompt) → { mode, raw, model, costUsd }
 * @param only      optional list of unit ids
 */
export async function verifySemi(root, reader, { texts, verifier, only = null, onProgress = () => {} }) {
  const all = loadUnits(root, reader), deps = unitDepsHashes(root, reader);
  const units = all.filter((u) => needsEvidence(u) && !hasAdmitted(root, u, all) && (!only || only.includes(u.id)));
  const plain = new Map([...texts].map(([k, v]) => [k, v.text]));
  const results = [];
  for (const u of units) {
    const lead = leadOf(u, all);
    const claims = checkableClaims(u.text).map((c) => withLead(c, lead));
    const passages = selectPassages(claims, texts);
    if (!passages.length) { results.push({ unit: u.id, status: "no-candidates" }); onProgress(results.at(-1)); continue; }
    const bundle = semiBundle(claims, passages);
    const answer = await verifier(bundle.prompt);
    const admission = settleKept(admit({ claims, passages, texts: plain, raw: answer.raw, nonce: bundle.nonce }), u.id, claims, keptClaims(logRecordsOf(readLogText(root))));
    const record = recordDispatch(root, { kind: "semi", unit: u.id, factHash: factHash(u.text), contentHash: u.locator.contentHash, bundle, passages, texts, answer, admission, claims, deps: deps.get(u.id) });
    if (admission.status === "admitted") admitEvidence(root, reader, u.id, evidenceFrom(record, admission, texts, u.text));
    results.push({ unit: u.id, dispatch: record.dispatch, status: admission.status, costUsd: answer.costUsd ?? null, perClaim: admission.perClaim.map((c) => ({ claim: c.claim, status: c.status, reason: c.reason })) });
    onProgress(results.at(-1));
  }
  return results;
}

/** Re-admit recorded answers under the current admission rules (admission is deterministic: no new dispatch). */
export function readmitRecorded(root, reader, { texts }) {
  const plainT = new Map([...texts].filter(([, v]) => v.ok).map(([k, v]) => [k, v.text]));
  const log = logRecordsOf(readLogText(root));
  const out = [];
  for (const r of packageDispatches(root).sort((a, b) => a.at.localeCompare(b.at))) {
    const all = loadUnits(root, reader), u = all.find((x) => x.id === r.unit);
    if (!u || r.kind !== "semi" || !needsEvidence(u) || hasAdmitted(root, u, all)) continue;
    if (!dispatchLogged(r, log) || !checksCurrentClaims(r, u.text, leadOf(u, loadUnits(root, reader)))) continue; // only genuine dispatches of the unit's current claims
    const a = settleKept(rederive(r, plainT), u.id, semiClaimsOf(r), keptClaims(log));
    if (a?.status === "admitted") { admitEvidence(root, reader, u.id, { ...evidenceFrom(r, a, texts, u.text), readmitted: new Date().toISOString() }); out.push({ unit: u.id, dispatch: r.dispatch }); }
  }
  if (out.length) appendLogRecord(root, { type: "revision", party: { role: "harness", name: "verify" }, payload: { event: "evidence-readmitted", units: out.map((x) => x.unit), rule: "recorded answers re-derived under the current admission rules" } });
  return out;
}

/** The section a unit belongs to: the text of every unit in the same deliverable section, in order. */
export function sectionContext(units, unit) {
  return units.filter((u) => u.locator.deliverable === unit.locator.deliverable && u.locator.section === unit.locator.section)
    .sort((a, b) => a.locator.ordinal - b.locator.ordinal).map((u) => u.text).join("\n\n");
}

/** Context review of absolute statements (D30): one dispatch per unit, recorded and logged; nothing is edited. */
export async function reviewAbsolutes(root, reader, { verifier, only = null, onProgress = () => {} }) {
  const all = loadUnits(root, reader);
  const done = reviewedAbsolutes(root);
  const results = [];
  for (const u of all.filter((x) => absoluteSentences(x.text).length && !done.has(`${x.id}|${absolutesHash(x.text)}`) && (!only || only.includes(x.id)))) {
    const sentences = absoluteSentences(u.text), context = sectionContext(all, u);
    const bundle = absoluteBundle(sentences, context, randomBytes(8).toString("hex"));
    const answer = await verifier(bundle.prompt);
    const review = readAbsoluteReview(answer.raw, bundle.nonce, sentences, context);
    const record = recordDispatch(root, { kind: "absolute", unit: u.id, factHash: factHash(u.text), contentHash: u.locator.contentHash, bundle, answer, admission: { status: review.ok ? "reviewed" : "unscorable", ...(review.ok ? {} : { reason: review.reason }) }, extra: { sentences, context, absolutesHash: absolutesHash(u.text) } });
    results.push({ unit: u.id, dispatch: record.dispatch, status: review.ok ? "reviewed" : "unscorable", classes: review.ok ? review.results.map((r) => r.class) : [], costUsd: answer.costUsd ?? null });
    onProgress(results.at(-1));
  }
  return results;
}

export async function verifyKnowledge(root, reader, { verifier, only = null, onProgress = () => {} }) {
  const all = loadUnits(root, reader), deps = unitDepsHashes(root, reader);
  // by default the knowledge-based teaching units; a unit NAMED (--units) is reviewed whatever its kind — that is how
  // an answer that owes re-verification is re-read with its question (units.mjs reverify, R1 coherence)
  const units = all.filter((u) => (only ? only.includes(u.id) : u.judgment.includes("knowledge-based") && u.role === "teaching"));
  // neighbours in the same section, in order: up to two units before (an answer's question) and one after
  const place = (u) => `${u.locator.deliverable}|${u.locator.section}`;
  const sections = new Map();
  for (const u of all) { if (!sections.has(place(u))) sections.set(place(u), []); sections.get(place(u)).push(u); }
  for (const list of sections.values()) list.sort((a, b) => a.locator.ordinal - b.locator.ordinal);
  const results = [];
  for (const u of units) {
    const list = sections.get(place(u)), i = list.indexOf(u);
    const shown = (x) => (x.label ? `${x.label}: ${x.text}` : x.text);
    const near = [...list.slice(Math.max(0, i - 2), i), list[i + 1]].filter(Boolean);
    // what the passage refers to by number ("Justify the answer to Q3"), resolved as the impact analysis resolves it
    // (dependencies.mjs, R2 F3), plus numbers in the units just before it
    const ownQs = questionsOf(all, u);
    const before = list.slice(Math.max(0, i - 2), i);
    const referenced = [...referencedUnits(all, u, ownQs), ...before.flatMap((x) => referencedUnits(all, { ...x, label: u.label, form: "callout" }, []))]
      .filter((x, k, arr) => x !== u && !near.includes(x) && arr.indexOf(x) === k && !ownQs.includes(x));
    // an answer is always read with the question it answers: the one its label names, else the nearest before it (F13)
    for (const q of [...ownQs].reverse()) if (!near.includes(q) && !referenced.includes(q)) referenced.unshift(q);
    const bundle = knowledgeBundle(u.text, undefined, { before: list.slice(Math.max(0, i - 2), i).map(shown).join("\n\n"), after: list[i + 1] ? shown(list[i + 1]) : "", referenced: referenced.map(shown).join("\n\n"), label: u.label || null });
    const answer = await verifier(bundle.prompt);
    const record = recordDispatch(root, { kind: "knowledge", unit: u.id, factHash: factHash(u.text), contentHash: u.locator.contentHash, bundle, answer, deps: deps.get(u.id) });
    results.push({ unit: u.id, dispatch: record.dispatch, concerns: knowledgeConcerns(record, u.text).length, costUsd: answer.costUsd ?? null });
    onProgress(results.at(-1));
  }
  return results;
}

/** The concerns of a knowledge dispatch that point at words the unit actually contains. */
export function knowledgeConcerns(record, unitText) {
  const m = String(record.answer?.raw || "").match(/\{[\s\S]*\}/);
  let v; try { v = JSON.parse(m?.[0] || ""); } catch { return []; }
  if (v?.nonce !== record.bundle.nonce || !Array.isArray(v.concerns)) return [];
  const norm = (t) => String(t).replace(/\s+/g, " ").trim();
  // the quote is matched with math and emphasis markup set aside: "T the temperature" quotes "$T$ the temperature" (P11 dev)
  const bare = (t) => norm(String(t).replace(/[$*_`]/g, ""));
  return v.concerns.filter((c) => typeof c?.text === "string" && bare(c.text).length >= 8 && bare(unitText).includes(bare(c.text)) && typeof c.problem === "string")
    // a concern without a kind (records before D35) is read as "wrong": it keeps the path it had
    .map((c) => ({ kind: c.kind === "clarify" ? "clarify" : "wrong", text: norm(c.text), problem: String(c.problem).slice(0, 600), suggestion: String(c.suggestion || "").slice(0, 600) }));
}

// ---- contradictions and corrections ------------------------------------------------------------------------------
/** Re-derive, for one dispatch record, what it establishes against the pinned texts now. */
export function rederive(record, plainTexts) {
  if (record.kind !== "semi") return null;
  const claims = semiClaimsOf(record);
  return admit({ claims, passages: record.passages, texts: plainTexts, raw: record.answer?.raw, nonce: record.bundle?.nonce });
}
// the claims are re-derived from the unit text the prompt carried, so a record cannot smuggle in easier claims
function semiClaimsOf(record) {
  const leads = recordLeads(record);
  return recordClaimTexts(record).map((t, i) => withLead(claimOf(t, i + 1), leads[i + 1]));
}

/** Was this unit written by the instructor? The sidecar OR the log says so — a sidecar edit cannot remove it (B16). */
export function instructorAuthored(unit, logRecords) {
  if (unit.origin?.kind === "instructor-authored") return true;
  return logRecords.some((l) => l.type === "authorship-confirmation" && l.party?.role === "instructor" &&
    ((Array.isArray(l.payload?.units) && l.payload.units.includes(unit.id) && (l.payload.as || "instructor") === "instructor") || (l.payload?.initial && l.payload?.origin?.kind === "instructor-authored")));
}
const canonicalUrl = (u) => { try { const x = new URL(u); return `${x.hostname}${x.pathname}`.toLowerCase(); } catch { return String(u); } };

/** Can the agent correct this unit without asking? Returns { ok, reason, plan }. */
export function correctionGuard({ unit, lead = null, records, plainTexts, meta = new Map(), logRecords = [] }) {
  const fh = factHash(unit.text);
  if ((unit.evidence || []).some((e) => e.type === "authorized-divergence" && e.factHash === fh)) return { ok: false, reason: "the instructor kept this text as an authorized divergence" };
  if (hasAdmittedEvidence(unit, { confirmed: new Map(), diverged: new Map() }, { lead, recordedLead: (e) => Object.values(recordLeads(records.find((r) => r.dispatch === e.dispatch) || {}))[0] ?? null }) || (unit.evidence || []).some((e) => e.type === "instructor-confirmation" && e.factHash === fh)) return { ok: false, reason: "contested: evidence or a confirmation stands for the unit as it is" };
  const mine = records.filter((r) => r.kind === "semi" && r.unit === unit.id && r.factHash === fh && dispatchLogged(r, logRecords) && checksCurrentClaims(r, unit.text, lead)).map((r) => ({ r, a: rederive(r, plainTexts) }));
  if (mine.some(({ a }) => a?.status === "disputed")) return { ok: false, reason: "contested: a verification disputes the unit's value" };
  const supportedQuotes = mine.flatMap(({ a }) => (a?.perClaim || []).filter((c) => c.status === "supported").flatMap((c) => c.quotes.map((q) => q.quote)));
  const hits = mine.flatMap(({ r, a }) => (a?.perClaim || []).filter((c) => c.status === "contradicted").map((c) => ({ r, c })));
  if (!hits.length) return { ok: false, reason: "no admitted contradiction for the unit's current facts" };
  // one target value per claimed quantity, agreed by every contradiction
  const targets = new Map();
  const identity = (src) => { const m = meta.get(src); return m ? `${m.sha256}|${canonicalUrl(m.url)}` : `text:${sha256(plainTexts.get(src) || src)}`; };
  for (const { c } of hits) for (const k of c.conflicts.filter((x) => x.dimension === "quantity")) {
    const prev = targets.get(k.claimed);
    if (prev && prev.sourceValue !== k.sourceValue) return { ok: false, reason: `sources disagree on the value for ${k.claimed}` };
    const ids = new Set([...(prev?.ids || []), ...c.quotes.map((q) => identity(q.source))]);
    const urls = new Set([...(prev?.urls || []), ...c.quotes.map((q) => canonicalUrl(meta.get(q.source)?.url || q.source))]);
    targets.set(k.claimed, { ...k, ids, urls, sources: new Set([...(prev?.sources || []), ...c.quotes.map((q) => q.source)]) });
  }
  for (const [claimed] of targets) {
    const q = quantitiesIn(unit.text).find((x) => x.raw === claimed);
    if (q && supportedQuotes.some((t) => quantitiesIn(t).some((s) => sameAtPrecision(q, s)))) return { ok: false, reason: `contested: another verification supports ${claimed}` };
  }
  if (instructorAuthored(unit, logRecords))
    for (const [claimed, t] of targets) { const n = Math.min(t.ids.size, t.urls.size); if (n < 2) return { ok: false, reason: `instructor text: ${claimed} needs two agreeing sources (has ${n})` }; }
  // the edit itself must be unambiguous: each claimed number occurs once in the unit
  const edits = [];
  for (const [claimed, t] of targets) {
    const q = quantitiesIn(unit.text).find((x) => x.raw === claimed);
    const num = (String(claimed).match(/^-?(\d[\d,]*(?:\.\d+)?)(?![\de])/) || [])[1];
    if (!q || !num) return { ok: false, reason: `${claimed} is not a single, unambiguous number in the unit` };
    // the sign as typeset ("−92.2", "- 92.2", "-\,92.2", "{-}92"): replaced together with the number, never doubled
    // (red-team round 1, F10: "= - 92.2" became "= - −92.2")
    const re = new RegExp(`(?<![\\d.,])(${q.value < 0 ? "(?:[-−‐-―]|\\{[-−]\\})\\s*(?:\\\\[,;:! ]\\s*)*" : ""})${num.replace(/[.]/g, "\\.")}(?![\\d])`, "g");
    const at = [...unit.text.matchAll(re)];
    if (at.length !== 1) return { ok: false, reason: `${claimed} is not a single, unambiguous number in the unit` };
    const decimals = (num.split(".")[1] || "").length;
    const sign = t.sourceValue < 0 ? (at[0][1] || "−") : "";
    edits.push({ index: at[0].index, length: at[0][0].length, replacement: sign + Math.abs(t.sourceValue).toFixed(Math.max(decimals, decimalsOf(t.source))), claimed, source: t.source, sources: [...t.sources] });
  }
  return { ok: true, plan: { edits, dispatches: [...new Set(hits.map(({ r }) => r.dispatch))], quotes: hits.flatMap(({ c }) => c.quotes) } };
}
const decimalsOf = (raw) => (String(raw).match(/\.(\d+)/)?.[1] || "").length;

export const diffOf = (before, after) => `- ${before.replace(/\n/g, "\n- ")}\n+ ${after.replace(/\n/g, "\n+ ")}`;

function replaceUnitText(root, deliverable, before, after) {
  const f = path.join(root, deliverable);
  const text = fs.readFileSync(f, "utf8");
  const i = text.indexOf(before);
  if (i < 0 || text.indexOf(before, i + 1) >= 0) throw new Error(`${deliverable}: the unit's text is not found exactly once`);
  fs.writeFileSync(f, text.slice(0, i) + after + text.slice(i + before.length));
}

/** Quotes that support every checkable claim of a text, from one source; or null. */
function supportingGroup(text, quotes) {
  const claims = checkableClaims(text);
  for (const src of [...new Set(quotes.map((q) => q.source))]) {
    const group = quotes.filter((q) => q.source === src);
    if (claims.every((c) => supports(c, group).ok)) return group;
  }
  return null;
}

/** Apply an auto-correction (agent party) — or say why it must be a question. */
export function applyCorrection(root, reader, { unitId, plainTexts, meta = new Map() }, party) {
  if (party?.role !== "agent") throw new Error("an auto-correction is the agent's, through the harness");
  const all = loadUnits(root, reader), unit = all.find((u) => u.id === unitId);
  if (!unit) throw new Error(`no such unit: ${unitId}`);
  const g = correctionGuard({ unit, lead: leadOf(unit, all), records: packageDispatches(root), plainTexts, meta, logRecords: logRecordsOf(readLogText(root)) });
  if (!g.ok) return { applied: false, question: { unit: unitId, reason: g.reason } };
  let after = unit.text;
  for (const e of [...g.plan.edits].sort((a, b) => b.index - a.index)) after = after.slice(0, e.index) + e.replacement + after.slice(e.index + e.length);
  const group = supportingGroup(after, g.plan.quotes);
  if (!group) return { applied: false, question: { unit: unitId, reason: "the source's value would not be supported by its own quote once written: a question for the instructor" } };
  const id = `c-${sha256(unit.id + unit.text + after).slice(0, 12)}`;
  replaceUnitText(root, unit.locator.deliverable, unit.text, after);
  const record = { schemaVersion: 1, id, unit: unit.id, deliverable: unit.locator.deliverable, status: "applied", at: new Date().toISOString(), by: party,
    before: { text: unit.text, contentHash: unit.locator.contentHash, origin: unit.origin }, after: { text: after, contentHash: unitHash(after) },
    edits: g.plan.edits, evidence: { dispatches: g.plan.dispatches, quotes: g.plan.quotes }, shown: false };
  fs.mkdirSync(recordFile(root, CORRECTIONS_DIR), { recursive: true });
  fs.writeFileSync(recordFile(root, `${CORRECTIONS_DIR}/${id}.json`), JSON.stringify(record, null, 2) + "\n");
  appendLogRecord(root, { type: "revision", party, payload: { event: "autocorrect", correction: id, unit: unit.id, before: unit.locator.contentHash, after: record.after.contentHash, rule: "admitted, anchored, uncontested contradiction (D19-B)" } });
  indexAndStamp(root, reader, { origins: { [record.after.contentHash]: { ...unit.origin, correction: id } } });
  // the contradicting quotes now state the unit's value: they are its evidence
  const now = loadUnits(root, reader).find((u) => u.locator.contentHash === record.after.contentHash);
  if (now) admitEvidence(root, reader, now.id, { type: "quote-verified", source: group[0].source, quotes: group, factHash: factHash(now.text), claimsHash: claimsHash(now.text), dispatch: g.plan.dispatches[0], correction: id, at: record.at });
  return { applied: true, correction: { ...record, diff: diffOf(record.before.text, record.after.text) } };
}

export function readCorrections(root) {
  const dir = recordFile(root, CORRECTIONS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}

/** A correction record matches its logged autocorrect record and its own texts (round P7-1, B18). */
export function correctionLogged(c, logRecords) {
  return unitHash(c.before?.text ?? "") === c.before?.contentHash && unitHash(c.after?.text ?? "") === c.after?.contentHash &&
    logRecords.some((l) => l.type === "revision" && l.payload?.event === "autocorrect" && l.payload.correction === c.id && l.payload.unit === c.unit && l.payload.before === c.before.contentHash && l.payload.after === c.after.contentHash);
}

/** Corrections not yet shown, with the diff built from the record's texts at display time. */
export function correctionsToShow(root, { mark = false } = {}) {
  const log = logRecordsOf(readLogText(root));
  const out = readCorrections(root).filter((c) => c.status === "applied" && !c.shown);
  if (mark) for (const c of out) fs.writeFileSync(recordFile(root, `${CORRECTIONS_DIR}/${c.id}.json`), JSON.stringify({ ...c, shown: true, shownAt: new Date().toISOString() }, null, 2) + "\n");
  return out.map((c) => ({ id: c.id, unit: c.unit, deliverable: c.deliverable, diff: diffOf(c.before?.text ?? "", c.after?.text ?? ""), verified: correctionLogged(c, log), evidence: (c.evidence?.quotes || []).map((q) => ({ source: q.source, quote: q.quote })) }));
}

/** The instructor reverts a correction after seeing its diff and evidence: the double confirmation (Q10). */
export function revertCorrection(root, reader, id, { note }, party) {
  if (party?.role !== "instructor") throw new Error("reverting a correction is the instructor's decision");
  if (!String(note || "").trim()) throw new Error("a revert records the instructor's note (why the text stands)");
  const f = recordFile(root, `${CORRECTIONS_DIR}/${id}.json`);
  if (!fs.existsSync(f)) throw new Error(`no such correction: ${id}`);
  const c = JSON.parse(fs.readFileSync(f, "utf8"));
  if (c.status !== "applied") throw new Error(`${id} is ${c.status}`);
  if (!correctionLogged(c, logRecordsOf(readLogText(root)))) throw new Error(`${id}: the correction record does not match its logged autocorrect record; nothing reverted`);
  replaceUnitText(root, c.deliverable, c.after.text, c.before.text);
  indexAndStamp(root, reader, { origins: { [c.before.contentHash]: c.before.origin } });
  const unit = loadUnits(root, reader).find((u) => u.locator.contentHash === c.before.contentHash);
  const at = new Date().toISOString();
  admitEvidence(root, reader, unit.id, { type: "authorized-divergence", by: party.name, at, factHash: factHash(unit.text), correction: id, note: String(note).trim(), dispatch: c.evidence.dispatches[0] });
  appendLogRecord(root, { type: "divergence", party, payload: { correction: id, unit: unit.id, weight: "double", note: String(note).trim(), basis: "reverted after seeing the diff and the evidence" } });
  fs.writeFileSync(f, JSON.stringify({ ...c, status: "reverted", revertedAt: at, revertedBy: party.name, note: String(note).trim() }, null, 2) + "\n");
  return { reverted: id, unit: unit.id };
}
