// The deterministic core (redesign P5; D19-A). Obligations that block publishing from the first release — each says
// what is missing, never that something is wrong:
//   evidence-missing     a semi-mechanical unit has no admitted evidence for its current facts (Q15, D19-D);
//   absolute-unreviewed  an absolute statement no logged context review has read yet (D30);
//   unit-unlinked        a teaching unit serves no spine node (D19-I);
//   objective-uncovered  an objective no teaching unit serves (Control C1);
//   guide-entry-short    a guide entry has fewer linked questions than its Count (Control C5);
//   reverify             a unit's dependencies moved since it was written or last re-verified (Coherence H2);
//   carried-unverified   a unit carried into a new major version has not been re-verified (D15);
//   instructor-change-owed  the instructor answered a disputed claim with a change the unit does not yet carry
//                        (red-team round 1, F15).
// Quote evidence counts for the unit's current facts and claims, the lead-in an equation was verified with (F13), and
// never for a claim the instructor asked to change (F15).
// And one defect: a unit that links to a spine node that does not exist.
//
// A STAMP IS NOT A RE-VERIFICATION (red team R1 coherence, F4/F5/F14). A stamp records the hashes of a unit's
// dependencies, and is renewed whenever the unit is (re)written or relinked. But a unit that OWED re-verification when
// it was restamped keeps owing it (`owes`, with the log seq it arose at), and a carried unit stays carried: editing the
// text, relinking or re-indexing never clears either — nor does retiring the unit and bringing its text back, or
// splitting it (R2 F1, F2, F14: units_index.mjs keeps a retired unit's record). What clears them, and nothing else:
//   - a logged CORRECTNESS re-check of the unit's current text made after the obligation arose: a blind knowledge
//     review (or, for a unit that is not an answer, a semi review that admitted its claims) of the unit at its current
//     content and dependencies, recorded by `units.mjs reverify` (reverifyUnits). The review is checked against the
//     dispatch that produced it: its record must be the one the log vouches for, show the unit's current text (and an
//     answer's question), and hold a readable answer. A link (alignment) review does not count: it judges what a
//     passage does for a student, never whether it is right (R2 F6). There is no other library path: the old
//     `recordVerification`, which cleared on a module's name alone, is gone (R2 F9);
//   - the instructor's confirmation (confirmUnits).
// The agent cannot clear an obligation by saying so.
import fs from "node:fs";
import path from "node:path";
import { canonicalJson, sha256 } from "../records/canonical.mjs";
import { makeFinding } from "../records/findings.mjs";
import { appendLogRecord, parseLog, verifyLog } from "../records/log.mjs";
import { recordFile } from "../records/paths.mjs";
import { validateUnitSidecar } from "../records/units.mjs";
import { classifyUnit, derivedRole, segmentDeliverable, unitHash } from "./segment.mjs";
import { readLogText } from "../records/log.mjs";
import { checkableClaims, claimsHash } from "../verify/claims.mjs";
import { absoluteSentences, absolutesHash, readAbsoluteReview } from "../verify/absolutes.mjs";
import { deliverablesOf, indexUnits, readSidecar } from "./units_index.mjs";
import { parseSpine, nodeIndex, termsOfMap, COURSE_MAP } from "./spine.mjs";
import { manifestChapters } from "./package_reader.mjs";
import { openMajorVersion } from "./versions.mjs";
import { approvalStatus } from "./approvals.mjs";
import { dependencyEdges, factHash, nodeHash, questionBindingProblems, questionHash, sourceHashes, stampFor, staleTargets, targetHashes, termHash } from "./dependencies.mjs";
import { deliverableOfSidecar, writeUnitRecords } from "./unit_records.mjs";
import { currentReviewsAt } from "../verify/alignment.mjs";
import { recordHashOf } from "../verify/dispatch.mjs";

// quote-verified: admitted by the verdict path (P7); instructor-confirmation: one confirmation (D19-D);
// authorized-divergence: the instructor kept their text against evidence, after seeing it — the double confirmation (Q10).
export const ADMITTED_EVIDENCE = Object.freeze(["quote-verified", "instructor-confirmation", "authorized-divergence"]);

/** Instructor acts recorded in the log, by kind: confirmations (unit → fact hashes) and divergences (unit → corrections). */
export function loggedInstructorActs(root) {
  return instructorActsOf(readLogText(root).split("\n").filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean));
}
/** An answer to a disputed claim that asks for a change ("change it to 1865"): anything but keep, confirm or later. */
export const asksChange = (choice) => !/^\s*(?:keep|confirm|later|still correct|accept)\b/i.test(String(choice || ""));
const normClaim = (t) => String(t || "").replace(/\s+/g, " ").trim();
/** The same, from parsed log records. `changes`: unit → Map(claim text → the instructor's answer) — the changes the
 *  instructor asked for on disputed claims (red-team round 1, F15); a later "keep" on the same claim withdraws one. */
export function instructorActsOf(logRecords) {
  const acts = { confirmed: new Map(), diverged: new Map(), changes: new Map() };
  for (const r of logRecords) {
    if (r.party?.role !== "instructor") continue;
    if (r.type === "confirmation" && r.payload?.what === "fact") for (const [id, fh] of Object.entries(r.payload.factHashes || {})) acts.confirmed.set(`${id}|${fh}`, true);
    if (r.type === "divergence" && r.payload?.unit && r.payload?.correction) acts.diverged.set(`${r.payload.unit}|${r.payload.correction}`, true);
    if (r.type === "answer") for (const a of r.payload?.answers || []) {
      if (!a.claimKey || !a.claimText || !Array.isArray(a.units) || /^\s*later\b/i.test(a.choice)) continue;
      for (const id of a.units) {
        if (!acts.changes.has(id)) acts.changes.set(id, new Map());
        if (asksChange(a.choice)) acts.changes.get(id).set(normClaim(a.claimText), { choice: String(a.choice), claimKey: a.claimKey });
        else acts.changes.get(id).delete(normClaim(a.claimText));
      }
    }
  }
  return acts;
}
/** The changes the instructor asked for that the unit's text does not yet carry: the claim still reads as it did. */
export function owedChanges(u, acts) {
  const asked = acts.changes?.get(u.id);
  if (!asked?.size) return [];
  const now = new Set(checkableClaims(u.text).map((c) => normClaim(c.text)));
  return [...asked].filter(([text]) => now.has(text)).map(([claimText, a]) => ({ claimText, ...a }));
}

/** An equation unit's lead-in: the last sentence of the unit before it in the same section (P11). */
export function leadOf(u, all) {
  if (u.form !== "equation") return null;
  const prev = all.filter((x) => x.locator.deliverable === u.locator.deliverable && x.locator.section === u.locator.section && x.locator.ordinal < u.locator.ordinal).sort((a, b) => b.locator.ordinal - a.locator.ordinal)[0];
  const t = String(prev?.text || "").replace(/\s+/g, " ").trim();
  return t ? t.split(/(?<=[.!?])\s+/).pop() : null;
}
/** The lead-ins a record's bundle carried (claim index → sentence); none for records before P11. */
export const recordLeads = (record) => { const lines = String(record.bundle?.prompt || "").split("\n"), i = lines.findIndex((l) => l.startsWith("CLAIM CONTEXT")); return i < 0 ? {} : Object.fromEntries(lines.slice(i + 1).map((l) => l.match(/^(\d+)\. (.*)$/)).filter(Boolean).map((m) => [Number(m[1]), m[2]])); };
/** The lead-in a semi dispatch was verified with (null: none recorded), by dispatch id. */
export function recordedLeads(root) {
  const dir = recordFile(root, "metadata/verification"), out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    let r; try { r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    if (r?.kind === "semi" && r.dispatch) out.set(r.dispatch, Object.values(recordLeads(r))[0] ?? null);
  }
  return out;
}

/**
 * Does this unit carry evidence that counts for its current facts? Each kind is bound to what it vouches for.
 * `lead` (an equation's current lead-in; undefined = not judged) binds quote-verified evidence to the lead-in it was
 * verified with (red-team round 1, F13): a changed lead-in makes the claim re-verifiable through the normal routed fix
 * (evidence-missing → verify semi), instead of stranding it. `recordedLead(e)` gives the lead of evidence admitted before
 * the evidence carried its own. Evidence for a claim the instructor asked to change no longer counts (F15).
 */
export function hasAdmittedEvidence(u, acts, { lead, recordedLead = () => null } = {}) {
  const fh = factHash(u.text);
  const leadOk = (e) => { if (lead === undefined) return true; const was = e.lead !== undefined ? e.lead : recordedLead(e); return was == null || normClaim(was) === normClaim(lead); };
  const changeOwed = owedChanges(u, acts).length > 0;
  return (u.evidence || []).some((e) => e.factHash === fh && (
    (e.type === "quote-verified" && e.claimsHash === claimsHash(u.text) && leadOk(e) && !changeOwed) ||
    (e.type === "instructor-confirmation" && acts.confirmed.has(`${u.id}|${fh}`)) ||
    (e.type === "authorized-divergence" && acts.diverged.has(`${u.id}|${e.correction}`))));
}
/** hasAdmittedEvidence with the unit's lead-in and the recorded leads of the package (the one rule every caller uses). */
export function evidenceStands(root, u, all, acts = loggedInstructorActs(root), leads = recordedLeads(root)) {
  return hasAdmittedEvidence(u, acts, { lead: leadOf(u, all), recordedLead: (e) => leads.get(e.dispatch) ?? null });
}
/** A semi-mechanical unit needs evidence only for the claims a source can check (D28). */
export const needsEvidence = (u) => u.judgment.includes("semi-mechanical") && checkableClaims(u.text).length > 0;

/** Every indexed unit with its current text (deliverables whose index is out of date are skipped: units-not-indexed covers them). */
export function loadUnits(root, reader) {
  const out = [];
  for (const rel of deliverablesOf(reader)) {
    const side = readSidecar(root, rel);
    const seg = segmentDeliverable(reader.text(rel), rel).units;
    if (!side || side.units.length !== seg.length) continue; // out of date: the units-not-indexed obligation covers it
    // the judgment, the role and where the unit is (its deliverable, section, place and lines) are recomputed from the
    // text and its structure, never trusted from the sidecar (round P7-1, B17; redteam r1 C3-15: a sidecar role set to
    // "framing" un-linked an off-spine paragraph; R2 F8: a practice answer relabelled as a study-guide unit)
    side.units.forEach((u, i) => {
      const text = seg[i]?.text ?? "";
      const judgment = [...new Set([...classifyUnit({ form: seg[i].form, text }), ...(u.judgmentAdded || [])])];
      const locator = { ...u.locator, deliverable: rel, section: seg[i].section, ordinal: i, lines: [seg[i].startLine, seg[i].endLine] };
      out.push({ ...u, locator, form: seg[i].form, ...(seg[i].label ? { label: seg[i].label } : {}), judgment, role: derivedRole(seg[i].role, judgment), text });
    });
  }
  return out;
}

/**
 * Earlier target hashes that still count as current (F13): for a scope whose current approval is a valid glance
 * confirmation — a change the classifier judged LIGHT against the last full approval — the hashes the spine nodes,
 * guide entries and key terms had at that full approval. Units stamped then are not stale for a light rewording.
 */
function lightAccept(reader, chapters, logText) {
  const accept = new Map();
  const add = (t, h) => { if (!accept.has(t)) accept.set(t, new Set()); accept.get(t).add(h); };
  if (verifyLog(logText).length) return accept;
  let status; try { status = approvalStatus(reader, chapters, logText); } catch { return accept; }
  const recs = parseLog(logText).filter((r) => r.type === "approval" && r.party?.role === "instructor");
  for (const [key, s] of Object.entries(status.scopes)) {
    if (!s.valid || s.record?.type !== "glance-confirmation" || s.record.payload?.change !== "light") continue;
    const full = recs.filter((r) => r.payload?.scope === s.scope).at(-1);
    if (!full?.payload?.parsed) continue;
    for (const n of [...(full.payload.parsed.nodes || []), ...(full.payload.parsed.entries || [])]) if (n?.id) add(`spine:${n.id}`, nodeHash(n));
    const mapText = key === "course" ? full.payload.text : full.payload.text?.[`concepts/${key}.md`];
    for (const t of typeof mapText === "string" ? termsOfMap(mapText, key === "course" ? "course" : key, key === "course" ? COURSE_MAP : null) : []) if (t.label) add(`term:${t.label.toLowerCase()}`, termHash(t));
  }
  return accept;
}

function context(root, reader) {
  const chapters = manifestChapters(reader);
  const spine = parseSpine(reader, chapters);
  const units = loadUnits(root, reader);
  const edges = dependencyEdges(units, spine, sourceHashes(reader));
  const hashes = targetHashes(units, spine, sourceHashes(reader));
  let accept = null; // computed only when a spine or term target moved (it reads the approval history)
  const acceptOf = () => (accept ??= lightAccept(reader, chapters, readLogText(root)));
  return { chapters, spine, units, edges, hashes, acceptOf, byId: new Map(units.map((u) => [u.id, u])) };
}

/** What a unit owes because of its stamp: moved targets, and a question binding that no longer holds (F1, F3). */
export function owedTargets(u, ctx) {
  if (!u.stamp) return [];
  let moved = staleTargets(u.stamp, ctx.hashes);
  if (moved.some((t) => /^(spine|term):/.test(t))) moved = staleTargets(u.stamp, ctx.hashes, ctx.acceptOf());
  const binding = u.form === "answer" ? questionBindingProblems(u.stamp, ctx.edges.get(u.id)).map((b) => `question-binding:${b}`) : [];
  return [...moved, ...binding];
}
/** Does the unit owe re-verification now (a stale stamp, an obligation carried over a restamp, or a version carry)? */
const owesNow = (u, ctx) => !!u.carried || !!u.owes || owedTargets(u, ctx).length > 0;
/** The hash of a unit's dependencies as they are now: a re-check counts only if made against these (reverifyUnits). */
const depsOf = (id, ctx) => sha256(canonicalJson(stampFor(id, ctx.edges, ctx.hashes)));
/** unit id → the hash of its dependencies now (passed to the blind reviews, which log it with their dispatch). */
export function unitDepsHashes(root, reader) {
  const ctx = context(root, reader);
  return new Map(ctx.units.map((u) => [u.id, depsOf(u.id, ctx)]));
}
const lastSeq = (root) => { const recs = parseLog(readLogText(root)); return recs.length ? recs[recs.length - 1].seq || recs.length : 0; };

function rewriteUnits(root, ids, fn) {
  const want = new Set(ids), done = new Set();
  const dir = recordFile(root, "metadata/units");
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith(".json")) files.push(f); } };
  if (fs.existsSync(dir)) walk(dir);
  const writes = [];
  for (const f of files) {
    const side = JSON.parse(fs.readFileSync(f, "utf8"));
    let touched = false;
    for (const u of side.units) if (want.has(u.id)) { fn(u); touched = true; done.add(u.id); }
    if (touched) {
      const problems = validateUnitSidecar(side);
      if (problems.length) throw new Error(`refusing an invalid unit sidecar: ${problems[0]}`);
      writes.push([f, side]);
    }
  }
  const missing = [...want].filter((x) => !done.has(x));
  if (missing.length) throw new Error(`no such unit: ${missing.join(", ")}`);
  // never write over (and so launder) a record edited outside the harness (F6); write and log in one step
  if (writes.length) writeUnitRecords(root, writes.map(([f, side]) => ({ ...side, deliverable: deliverableOfSidecar(root, f) })));
}

/**
 * Stamp units with the current hashes of their dependencies. A unit that owed re-verification keeps owing it (its
 * `owes` records what had moved and the log seq the obligation is older than), and a carried unit stays carried:
 * rewriting or relinking a unit is not re-verifying it (F4, F5, F14).
 */
export function restamp(root, reader, ids) {
  if (!ids.length) return;
  const ctx = context(root, reader), since = lastSeq(root);
  rewriteUnits(root, ids, (u) => {
    const cur = ctx.byId.get(u.id), owed = cur ? owedTargets(cur, ctx) : [];
    if (owed.length || u.owes) u.owes = { since: u.owes?.since ?? since, targets: [...new Set([...(u.owes?.targets || []), ...owed])].sort() };
    u.stamp = stampFor(u.id, ctx.edges, ctx.hashes);
  });
}

/**
 * A dependency target the harness added after a unit was stamped (a new edge kind, P11; plurals and unitless values,
 * R1): when the unit's stamp is otherwise current, the new target is baselined at its current hash — the state a
 * restamp would record. Never baselined: targets that just changed (`except`); a target that REPLACES one of the same
 * kind the stamp still holds (a re-pairing is a change, F3); and the question binding of an answer (an answer whose
 * stamp predates it owes a re-check once, F1 — a later edit of the question would otherwise become its baseline).
 */
export function upgradeStamps(root, reader, { except = [] } = {}) {
  const ctx = context(root, reader), skip = new Set(except), add = new Map();
  const kind = (t) => t.slice(0, t.indexOf(":"));
  for (const u of ctx.units) {
    if (!u.stamp || owesNow(u, ctx)) continue;
    const full = stampFor(u.id, ctx.edges, ctx.hashes);
    const dropped = new Set(Object.keys(u.stamp).filter((t) => !(t in full)).map(kind));
    const missing = Object.keys(full).filter((t) => !(t in u.stamp) && !skip.has(t) && !t.startsWith("question:") && !dropped.has(kind(t)));
    if (missing.length) add.set(u.id, Object.fromEntries(missing.map((t) => [t, full[t]])));
  }
  if (add.size) rewriteUnits(root, [...add.keys()], (u) => { u.stamp = { ...u.stamp, ...add.get(u.id) }; });
  return add.size;
}

/** Index, then stamp every unit that changed (a unit that owed re-verification still owes it). */
export function indexAndStamp(root, reader, opts) {
  const r = indexUnits(root, reader, opts);
  restamp(root, reader, r.changedIds);
  upgradeStamps(root, reader, { except: r.changedIds.flatMap((id) => [`unit:${id}`, `question:${id}`]) });
  return r;
}

/** The agent links units to the spine nodes they serve. A link change re-stamps the unit. */
export function linkUnits(root, reader, links, party) {
  if (!party || !["agent", "instructor"].includes(party.role)) throw new Error("links are declared by the agent or the instructor");
  const { spine } = context(root, reader);
  const nodes = nodeIndex(spine);
  for (const [id, list] of Object.entries(links)) for (const n of list) if (!nodes.has(n)) throw new Error(`${id}: ${n} is not a spine node`);
  // only a link that changes re-stamps its unit: re-saving the same links is not a re-verification (T3 scenario, P8)
  const changed = [];
  rewriteUnits(root, Object.keys(links), (u) => { const next = [...new Set(links[u.id])]; if (JSON.stringify([...(u.spineNodes || [])].sort()) !== JSON.stringify([...next].sort())) changed.push(u.id); u.spineNodes = next; });
  restamp(root, reader, changed);
  appendLogRecord(root, { type: "revision", party, payload: { event: "units-linked", count: Object.keys(links).length } });
}

/** The instructor confirms units: "fact" clears an evidence obligation for the current facts; "still-correct" re-stamps. */
export function confirmUnits(root, reader, ids, { what, instructorWords }, party) {
  if (party?.role !== "instructor") throw new Error("a confirmation is the instructor's");
  if (!String(instructorWords || "").trim()) throw new Error("a confirmation quotes the instructor's words");
  if (!["fact", "still-correct"].includes(what)) throw new Error('confirm what: "fact" or "still-correct"');
  const { units, edges, hashes } = context(root, reader);
  const text = new Map(units.map((u) => [u.id, u.text]));
  const at = new Date().toISOString();
  if (what === "fact") {
    const live = liveContradictions(root, new Map(units.map((u) => [u.id, factHash(u.text)])));
    const blocked = ids.filter((id) => live.has(id));
    if (blocked.length) throw new Error(`${blocked.join(", ")}: a verification contradicts the current text — answer it through the correction (or its revert), not a confirmation`);
  }
  rewriteUnits(root, ids, (u) => {
    if (what === "fact") u.evidence = [...(u.evidence || []), { type: "instructor-confirmation", by: party.name, at, factHash: factHash(text.get(u.id) || "") }];
    u.stamp = stampFor(u.id, edges, hashes); delete u.carried; delete u.owes;
  });
  appendLogRecord(root, { type: "confirmation", party, payload: { what, units: ids, weight: "single", instructorWords, ...(what === "fact" ? { factHashes: Object.fromEntries(ids.map((id) => [id, factHash(text.get(id) || "")])) } : {}) } });
}

/** The verdict path admits evidence for a unit's CURRENT facts (only the harness writes it; admission.mjs decided it). */
export function admitEvidence(root, reader, unitId, evidence) {
  const { units } = context(root, reader);
  const u = units.find((x) => x.id === unitId);
  if (!u) throw new Error(`no such unit: ${unitId}`);
  if (evidence.factHash !== factHash(u.text)) throw new Error(`${unitId}: the evidence is for other facts than the unit states now`);
  if (!["quote-verified", "authorized-divergence"].includes(evidence.type)) throw new Error("the verdict path writes quote-verified or authorized-divergence evidence only");
  // evidence names the logged fact-check dispatch it came from (R2: nothing clears without what produced it)
  const logged = parseLog(readLogText(root)).some((r) => r.type === "dispatch" && r.party?.role === "harness" && r.payload?.kind === "semi" && r.payload?.dispatch === evidence.dispatch);
  if (!evidence.dispatch || !logged) throw new Error(`${unitId}: evidence must name the logged fact-check dispatch it came from (${evidence.dispatch || "none named"} is not in the log)`);
  rewriteUnits(root, [unitId], (x) => { x.evidence = [...(x.evidence || []).filter((e) => !(e.type === evidence.type && e.factHash === evidence.factHash && e.dispatch === evidence.dispatch)), evidence]; });
}

/** Absolute reviews that count: a logged dispatch whose record parses and covers the unit's sentences → "unit|hash". */
export function reviewedAbsolutes(root) {
  const out = new Set();
  const dir = recordFile(root, "metadata/verification");
  if (!fs.existsSync(dir)) return out;
  const logged = new Set();
  for (const line of readLogText(root).split("\n").filter(Boolean)) { try { const r = JSON.parse(line); if (r.type === "dispatch" && r.party?.role === "harness") logged.add(`${r.payload?.dispatch}|${r.payload?.unit}|${r.payload?.responseHash}`); } catch { /* the log module reports it */ } }
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    let r; try { r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    if (r.kind !== "absolute" || !logged.has(`${r.dispatch}|${r.unit}|${r.answer?.responseHash}`)) continue;
    if (readAbsoluteReview(r.answer?.raw, r.bundle?.nonce, r.sentences || [], r.context || "").ok) out.add(`${r.unit}|${r.absolutesHash}`);
  }
  return out;
}

/**
 * Knowledge-based teaching units that no logged blind review has read at their current text. Reported, not
 * blocking: Level 2 is best effort (P11 K4 scenario: an agent that never ran the review saw nothing to tell it so).
 */
export function unreviewedKnowledge(root, reader) {
  const dir = recordFile(root, "metadata/verification"), seen = new Set(), logged = new Set();
  for (const line of readLogText(root).split("\n").filter(Boolean)) { try { const r = JSON.parse(line); if (r.type === "dispatch" && r.party?.role === "harness") logged.add(`${r.payload?.dispatch}|${r.payload?.unit}`); } catch { /* the log module reports it */ } }
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    let r; try { r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    if (r.kind === "knowledge" && logged.has(`${r.dispatch}|${r.unit}`)) seen.add(`${r.unit}|${r.contentHash}`);
  }
  return loadUnits(root, reader).filter((u) => u.judgment.includes("knowledge-based") && u.role === "teaching" && !seen.has(`${u.id}|${u.locator.contentHash}`)).map((u) => u.id);
}

/** Units whose current facts a recorded verification contradicts or disputes. */
function liveContradictions(root, factHashes) {
  const dir = recordFile(root, "metadata/verification"), out = new Set();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    let r; try { r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    // a contradiction (a defect) must go through its correction or revert; a dispute between sources is the
    // instructor's to settle, and a confirmation is how they settle it (D12-F)
    if (r.kind === "semi" && factHashes.get(r.unit) === r.factHash && r.admission?.status === "contradicted") out.add(r.unit);
  }
  return out;
}

/** The "wrong" concerns a knowledge dispatch raised about words the unit still contains (as verdicts.mjs reads them). */
function wrongConcerns(root, dispatch, unitText) {
  let r; try { r = JSON.parse(fs.readFileSync(recordFile(root, `metadata/verification/${dispatch}.json`), "utf8")); } catch { return [{ kind: "wrong", text: "(the review record is missing)", problem: "its record cannot be read" }]; }
  if (sha256(r.answer?.raw ?? "") !== r.answer?.responseHash) return [{ kind: "wrong", text: "(the review record was edited)", problem: "its answer does not match the logged response" }];
  const m = String(r.answer?.raw || "").match(/\{[\s\S]*\}/);
  let v; try { v = JSON.parse(m?.[0] || ""); } catch { return []; }
  if (v?.nonce !== r.bundle?.nonce || !Array.isArray(v.concerns)) return [];
  const bare = (t) => String(t).replace(/[$*_`]/g, "").replace(/\s+/g, " ").trim();
  return v.concerns.filter((c) => typeof c?.text === "string" && bare(c.text).length >= 8 && bare(unitText).includes(bare(c.text)) && c.kind !== "clarify")
    .map((c) => ({ kind: "wrong", text: bare(c.text), problem: String(c.problem || "") }));
}

// the blind reviews that can re-verify a unit, and the logged outcome each must have: a CORRECTNESS review only (R2 F6:
// a link review judges what a passage does for a student, never whether it is right). A semi review checks the claims
// against sources but never shows an answer its question, so only a knowledge review re-verifies an answer.
const REVIEW_COUNTS = { knowledge: () => true, semi: (p, u) => p.status === "admitted" && u.form !== "answer" };
export const REVERIFY_ROUTE = (root, ids) => `node scripts/verify.mjs knowledge --root ${root} --units ${ids.join(",")}`;
const shownForm = (t) => String(t || "").replace(/\s+/g, " ").trim();

/**
 * Is a logged review what it claims to be (R2 F9/F10: nothing clears without evidence)? The record on disk must be the
 * one the log vouches for (its whole-record hash, prompt hash and answer hash), be of this unit at its current text,
 * show that text (and, for an answer, the question it is bound to), and hold a readable answer to that very bundle.
 * Returns null, or why it does not count.
 */
export function reviewRecordProblem(root, logged, u, ctx) {
  const p = logged.payload || {};
  let r; try { r = JSON.parse(fs.readFileSync(recordFile(root, `metadata/verification/${p.dispatch}.json`), "utf8")); } catch { return "its review record is missing or unreadable"; }
  if (!p.recordHash || recordHashOf(r) !== p.recordHash) return "its review record is not the one the log vouches for";
  if (r.dispatch !== p.dispatch || r.unit !== u.id || r.kind !== p.kind || r.contentHash !== u.locator.contentHash) return "its review record is of other text";
  if (sha256(r.bundle?.prompt ?? "") !== r.bundle?.bundleHash || r.bundle?.bundleHash !== p.bundleHash) return "its review prompt does not match its logged hash";
  if (sha256(r.answer?.raw ?? "") !== r.answer?.responseHash || r.answer?.responseHash !== p.responseHash) return "its review answer does not match its logged hash";
  if (r.kind === "semi") return r.admission?.status === "admitted" && r.factHash === factHash(u.text) ? null : "its fact check did not admit the unit's current claims";
  const shown = shownForm(r.bundle.prompt);
  if (!shown.includes(shownForm(u.text))) return "the reviewer was not shown the unit's current text";
  if (u.form === "answer") for (const e of (ctx.edges.get(u.id) || []).filter((x) => x.target.startsWith("question:"))) {
    const q = ctx.byId.get(e.target.slice("question:".length));
    if (q && !shown.includes(shownForm(q.text))) return `the reviewer was not shown the question it answers (${q.id})`;
  }
  const m = String(r.answer?.raw || "").match(/\{[\s\S]*\}/);
  let v; try { v = JSON.parse(m?.[0] || ""); } catch { v = null; }
  if (v?.nonce !== r.bundle?.nonce || !Array.isArray(v?.concerns)) return "the reviewer's answer is unreadable (no answer to this bundle)";
  return null;
}

/**
 * The agent records that units which owed re-verification were re-checked (`units.mjs reverify`). Only a LOGGED blind
 * correctness review counts: a knowledge (or, for a non-answer, an admitting semi) dispatch of the unit made after its
 * obligation arose, at its current text (contentHash) and its current dependencies (the question it answers, the values
 * it shares …), whose record checks out against the log (reviewRecordProblem). A knowledge review that found the text
 * wrong does not count: revise it, and have it reviewed again. Refuses — naming the review to run — when any unit lacks
 * one; nothing is recorded then.
 */
export function reverifyUnits(root, reader, ids, party, { verdicts = (d, text) => wrongConcerns(root, d, text) } = {}) {
  if (party?.role !== "agent") throw new Error("reverify is the agent's record of a blind re-check (the instructor confirms instead: units.mjs confirm)");
  if (!ids.length) throw new Error("name the units to reverify");
  const logText = readLogText(root);
  if (verifyLog(logText).length) throw new Error("the decision log does not verify: restore it before recording anything");
  const recs = parseLog(logText), ctx = context(root, reader);
  const carriedAt = (id) => recs.filter((r) => r.type === "revision" && r.payload?.event === "units-carried" && (r.payload.units || []).includes(id)).at(-1)?.seq || 0;
  const problems = [], unreviewed = [], used = {};
  for (const id of ids) {
    const u = ctx.byId.get(id);
    if (!u) { problems.push(`${id}: no such indexed unit (run units.mjs index first)`); continue; }
    if (!owesNow(u, ctx)) { problems.push(`${id} owes no re-verification`); continue; }
    const since = Math.max(u.owes?.since || 0, u.carried ? carriedAt(id) : 0), deps = depsOf(id, ctx);
    const candidates = recs.filter((r) => r.type === "dispatch" && r.party?.role === "harness" && r.seq > since && r.payload?.unit === id &&
      r.payload?.contentHash === u.locator.contentHash && r.payload?.deps === deps && REVIEW_COUNTS[r.payload?.kind]?.(r.payload, u));
    const checked = candidates.map((r) => [r, reviewRecordProblem(root, r, u, ctx)]);
    const review = checked.filter(([, why]) => !why).at(-1)?.[0];
    if (!review) {
      if (checked.length) problems.push(`${id}: its blind review (${checked.at(-1)[0].payload.dispatch}) does not count — ${checked.at(-1)[1]}; run ${REVERIFY_ROUTE(root, [id])} again`);
      else unreviewed.push(id);
      continue;
    }
    if (review.payload.kind === "knowledge" && verdicts) {
      const wrong = verdicts(review.payload.dispatch, u.text).filter((c) => c.kind === "wrong");
      if (wrong.length) { problems.push(`${id}: its blind review (${review.payload.dispatch}) found it wrong ("${wrong[0].text.slice(0, 80)}": ${wrong[0].problem.slice(0, 120)}) — revise it, then have it reviewed again`); continue; }
    }
    used[id] = review.payload.dispatch;
  }
  if (unreviewed.length) problems.push(`${unreviewed.join(", ")}: no logged blind correctness review of the current text (and its current question and dependencies) since the re-verification was owed — run ${REVERIFY_ROUTE(root, unreviewed)}, then reverify (a link review does not count)`);
  if (problems.length) throw new Error(`refusing to record a re-verification: ${problems.join("; ")}`);
  rewriteUnits(root, ids, (u) => { u.stamp = stampFor(u.id, ctx.edges, ctx.hashes); delete u.owes; delete u.carried; });
  return appendLogRecord(root, { type: "revision", party, payload: { event: "units-reverified", units: ids, reviews: used } });
}

/** Units carried into a new major version start as obligations: their evidence and stamps no longer count (D15). */
export function carryUnits(root, ids, { version, scope }, party) {
  if (party?.role !== "instructor") throw new Error("carrying units into a new version follows the instructor's version decision");
  rewriteUnits(root, ids, (u) => { u.evidence = []; delete u.stamp; delete u.owes; u.carried = { scope, version }; });
  appendLogRecord(root, { type: "revision", party, payload: { event: "units-carried", scope, version, units: ids } });
}

/**
 * The instructor opens a new major version (D15): the units of its scopes are carried into it, each an open
 * re-verification until checked again. A chapter scope carries that chapter's deliverables; the course scope, all.
 * (P11 wiring sweep: the version was logged with carried: [] and nothing was ever carried.)
 */
export function openVersionCarrying(root, reader, { scopes, reason, instructorWords }, party) {
  if (!String(instructorWords || "").trim()) throw new Error("opening a new major version quotes the instructor's words");
  // loadUnits skips a deliverable whose index is out of date, so a version opened over unindexed edits would carry
  // none of its units (F12): every deliverable in scope must be indexed first
  const inScopeRel = (rel) => scopes.some((sc) => sc === "course" || (sc.startsWith("chapter:") && rel.endsWith(`/${sc.slice("chapter:".length)}.md`)));
  const stale = deliverablesOf(reader).filter(inScopeRel).filter((rel) => {
    const side = readSidecar(root, rel), now = segmentDeliverable(reader.text(rel), rel).units.map((s) => unitHash(s.text));
    return !side || JSON.stringify(now) !== JSON.stringify(side.units.map((u) => u.locator.contentHash));
  });
  if (stale.length) throw new Error(`refusing to open a new version: ${stale.join(", ")} ${stale.length === 1 ? "has" : "have"} edits not yet indexed — run units.mjs index first, so every unit of the scope is carried`);
  const units = loadUnits(root, reader);
  const inScope = (sc) => sc === "course" ? units : units.filter((u) => sc.startsWith("chapter:") && u.locator.deliverable.endsWith(`/${sc.slice("chapter:".length)}.md`));
  const r = openMajorVersion(root, { scopes, reason, instructorWords, carried: [...new Set(scopes.flatMap((sc) => inScope(sc).map((u) => u.id)))] }, party);
  for (const sc of scopes) { const ids = inScope(sc).map((u) => u.id); if (ids.length) carryUnits(root, ids, { version: r.payload.to[sc], scope: sc }, party); }
  return r;
}

/** All core obligations (and dangling-link defects) of a package. */
export function coreObligations(root, reader, basis) {
  const ctx = context(root, reader), { chapters, spine, units } = ctx;
  const nodes = nodeIndex(spine);
  const acts = loggedInstructorActs(root), leads = recordedLeads(root);
  const reviewed = reviewedAbsolutes(root);
  const reviews = currentReviewsAt(root, reader, units);
  const F = [];
  const ob = (kind, ids, what) => F.push(makeFinding({ module: "skeleton", kind, units: ids, statusClass: "obligation", route: "agent", basis, evidence: { type: "missing", what } }));
  for (const u of units) {
    const fh = factHash(u.text);
    // an absolute statement is reviewed by an agent that reads its context (D30; any unit, whatever its judgment kind)
    if (!acts.confirmed.has(`${u.id}|${fh}`) && absoluteSentences(u.text).length && !reviewed.has(`${u.id}|${absolutesHash(u.text)}`))
      ob("absolute-unreviewed", [u.id], `a context review of the absolute statement(s) in ${u.id} (${u.locator.deliverable}): node scripts/verify.mjs absolutes`);
    if (needsEvidence(u) && !evidenceStands(root, u, units, acts, leads))
      ob("evidence-missing", [u.id], `admitted evidence for the facts stated in ${u.id} (${u.locator.deliverable})`);
    // the instructor answered a disputed claim with a change: the agent applies it (red-team round 1, F15); it stays
    // owed while the claim's sentence still reads as it did, and the old evidence no longer counts for it
    for (const c of owedChanges(u, acts))
      ob("instructor-change-owed", [u.id], `the change the instructor asked for in ${u.id} (${u.locator.deliverable}): "${c.choice}" — to the claim "${c.claimText.slice(0, 200)}"`);
    if (u.role === "teaching" && !(u.spineNodes || []).length) ob("unit-unlinked", [u.id], `a spine link for ${u.id} (${u.locator.deliverable}, ${u.locator.section})`);
    // a guide entry prescribes questions: it is what a question (and its answer) serves, not what a passage teaches
    // (redteam r1 C3-05: an off-spine paragraph linked only to a guide entry passed as linked)
    else if (u.role === "teaching" && !["question", "answer"].includes(u.form) && (u.spineNodes || []).every((n) => n.startsWith("guide.")))
      ob("unit-unlinked", [u.id], `a link to the objective or concept that ${u.id} (${u.locator.deliverable}, ${u.locator.section}) teaches: a guide entry is for questions`);
    const dangling = (u.spineNodes || []).filter((n) => !nodes.has(n));
    if (dangling.length) F.push(makeFinding({ module: "skeleton", kind: "unit-link-dangling", units: [u.id], statusClass: "defect", route: "agent", basis, evidence: { type: "rule", rule: "a unit links only to existing spine nodes", dangling } }));
    if (u.carried) ob("carried-unverified", [u.id], `re-verification of ${u.id} in ${u.carried.scope} version ${u.carried.version}`);
    else {
      const moved = [...new Set([...owedTargets(u, ctx), ...(u.owes?.targets || [])])];
      if (moved.length || u.owes) {
        const why = moved.map((t) => t.replace("question-binding:legacy", "its question binding predates the harness's (a re-check once)").replace("question-binding:re-paired", "it now follows another question"));
        ob("reverify", [u.id], `re-verification of ${u.id}: ${why.join(", ") || "an earlier change"} since it was last verified — a blind re-check of its current text (${REVERIFY_ROUTE("<pkg>", [u.id])}, then units.mjs reverify), or the instructor's confirmation`);
        // an answer whose question changed (or was re-paired): the agent re-reads it with its question — a cheap blind
        // re-review, never a question for the instructor (F7). Bound to the question's wording, so a second change of
        // the question is a new finding (F15).
        const qs = (ctx.edges.get(u.id) || []).filter((e) => e.target.startsWith("question:")).map((e) => e.target.slice("question:".length));
        if (u.form === "answer" && qs.length && moved.some((t) => t.startsWith("question-binding:") || qs.some((q) => t === `unit:${q}` || t === `question:${q}`) || /^(unit|question):/.test(t) && ctx.byId.get(t.slice(t.indexOf(":") + 1))?.form === "question"))
          F.push(makeFinding({ module: "skeleton", kind: "answer-still-correct", units: [u.id], statusClass: "question", route: "agent", basis,
            evidence: { type: "judgment", question: qs.map((q) => ({ unit: q, wording: ctx.byId.get(q) ? questionHash(ctx.byId.get(q).text) : null })),
              note: `${u.id}: its question changed — re-read the answer with its question (${REVERIFY_ROUTE("<pkg>", [u.id])}); if it still holds, record it (units.mjs reverify), else revise it` } }));
      }
    }
  }
  for (const ch of chapters) {
    const s = spine.chapters[ch];
    // D41: coverage counts VERIFIED links — a unit whose current blind link review says it teaches the objective. An
    // unreviewed covering link is the agent's to review (cheap, never the instructor's); links that are all "in
    // passing" or "no" do not cover (C2-01, C1-09).
    for (const o of s.map.nodes.filter((n) => n.kind === "objective" && n.id)) {
      const teachers = units.filter((u) => teachesInDeliverable(u, o.id));
      if (!teachers.length) { ob("objective-uncovered", [], `a teaching unit (study guide or slides) that serves ${o.id}`); continue; }
      if (teachers.some((u) => reviews.get(u.id)?.verdicts.get(o.id) === "yes")) continue;
      const unreviewed = teachers.filter((u) => !reviews.get(u.id)?.verdicts.has(o.id));
      if (unreviewed.length) ob("link-review-owed", unreviewed.map((u) => u.id), `a blind link review of the units that would teach ${o.id} (node scripts/verify.mjs alignment --units ${unreviewed.map((u) => u.id).join(",")})`);
      else ob("objective-uncovered", [], `a teaching unit that teaches ${o.id}: its links were reviewed, and none teaches it (only in passing, or not at all)`);
    }
    const assigned = guideAssignment(s.guide.entries, units);
    for (const e of s.guide.entries.filter((x) => x.id)) {
      const got = assigned.get(e.id) || [], linked = units.filter((u) => u.form === "question" && (u.spineNodes || []).includes(e.id));
      if (got.length < (Number.isInteger(e.count) ? e.count : 0))
        ob("guide-entry-short", linked.map((u) => u.id), `${e.count - got.length} more question(s) for ${e.id} (has ${got.length} of ${e.count})`); // only practice questions count, each toward one entry
    }
  }
  // D42: everything that ships is read — a framing unit (introduction, summary, closing) no current review has read for
  // off-plan content is the agent's to review (C3-07: a whole lesson under "## Introduction to …" went unread)
  const unreadFraming = units.filter((u) => u.role === "framing" && !reviews.has(u.id));
  if (unreadFraming.length) ob("framing-review-owed", unreadFraming.map((u) => u.id), `a blind review of ${unreadFraming.length} framing unit(s) for off-plan content (node scripts/verify.mjs alignment --units ${unreadFraming.map((u) => u.id).join(",")})`);
  // course-map objectives (redteam r1 C1-10). The grammar links a chapter to the course map only through [prereq: …]
  // (the slice chapterCoverage binds into the chapter's approval), so a course objective is covered when a chapter
  // objective or concept names it as a prerequisite — that node is itself checked above — or a teaching unit links it.
  const chapterNodes = chapters.flatMap((ch) => spine.chapters[ch].map.nodes);
  for (const o of spine.course.nodes.filter((n) => n.kind === "objective" && n.id))
    if (!chapterNodes.some((n) => (n.prereqs || []).includes(o.id)) && !units.some((u) => teachesInDeliverable(u, o.id)))
      ob("course-objective-uncovered", [], `a chapter objective or concept that names ${o.id} in [prereq: …], or a teaching unit (study guide or slides) that serves it`);
  return F;
}

/**
 * The units the blind link review reads (redteam r1 C1-04, C3-05): every linked teaching unit — answers too, read with
 * their question, and units linked only to guide entries. Coverage (objective-uncovered) counts exactly these units of
 * the study guides and slides, so nothing counts toward coverage that the review never reads.
 */
export const reviewable = (u) => u.role === "teaching" && (u.spineNodes || []).length > 0;
export const teachesInDeliverable = (u, id) => reviewable(u) && /^(study-guide|slides)\//.test(u.locator.deliverable) && u.spineNodes.includes(id);

/**
 * Which practice question fills which guide entry's Count (redteam r1 C5-08, C5-17): only questions in practice/ count
 * (a worked example's solution is printed beside it), and each question counts toward ONE entry — a maximum matching
 * of questions to the entries' Count slots, so a question linked to several entries goes where it is needed.
 * Returns Map(entry id → [question ids]).
 */
export function guideAssignment(entries, units) {
  const cap = new Map(entries.filter((e) => e.id).map((e) => [e.id, Number.isInteger(e.count) && e.count > 0 ? e.count : 0]));
  const got = new Map([...cap.keys()].map((id) => [id, []]));
  const qs = units.filter((u) => u.form === "question" && u.locator.deliverable.startsWith("practice/"));
  const linksOf = new Map(qs.map((q) => [q.id, (q.spineNodes || []).filter((n) => cap.get(n) > 0)]));
  const place = (q, seen) => {
    for (const e of linksOf.get(q)) {
      if (seen.has(e)) continue;
      seen.add(e);
      const slot = got.get(e);
      if (slot.length < cap.get(e)) { slot.push(q); return true; }
      for (let k = 0; k < slot.length; k++) if (place(slot[k], seen)) { slot[k] = q; return true; }
    }
    return false;
  };
  for (const q of qs) place(q.id, new Set());
  return got;
}
