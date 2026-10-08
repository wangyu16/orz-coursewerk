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
import { GLANCE_KINDS } from "./change.mjs";
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
import { absoluteReviewOf, absoluteSentences, absolutesHash } from "../verify/absolutes.mjs";
import { deliverablesOf, indexUnits, readSidecar } from "./units_index.mjs";
import { parseSpine, nodeIndex, termsOfMap, COURSE_MAP } from "./spine.mjs";
import { liveReader, manifestChapters } from "./package_reader.mjs";
import { openMajorVersion } from "./versions.mjs";
import { approvalStatus } from "./approvals.mjs";
import { dependencyEdges, factHash, groupTermHash, isLegacyQuestionHash, legacyQuestionCurrent, legacyTermLabel, nodeHash, questionBindingProblems, questionHash, referenceBindingProblems, sourceHashes, stampFor, staleTargets, targetHashes, termDefinitions, termHash, termKey } from "./dependencies.mjs";
import { deliverableOfSidecar, UNIT_RECORDS_EVENT, writeUnitRecords } from "./unit_records.mjs";
import { currentReviewsAt } from "../verify/alignment.mjs";
import { boundRecord, readKnowledgeReview, recordHashOf } from "../verify/dispatch.mjs";

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
  // confirmedText: "unit|contentHash" — the unit's whole text as the instructor confirmed it. What a confirmation
  // exempts from the mechanical check (an intended wrong worked answer) is bound to every word and operator: a factHash
  // does not see "Spot the error" turned into "This working is correct" (red-team round 4, R4-K07).
  const acts = { confirmed: new Map(), confirmedText: new Set(), diverged: new Map(), changes: new Map() };
  for (const r of logRecords) {
    if (r.party?.role !== "instructor") continue;
    if (r.type === "confirmation" && r.payload?.what === "fact") for (const [id, fh] of Object.entries(r.payload.factHashes || {})) acts.confirmed.set(`${id}|${fh}`, true);
    if (r.type === "confirmation" && r.payload?.what === "fact") for (const [id, ch] of Object.entries(r.payload.contentHashes || {})) acts.confirmedText.add(`${id}|${ch}`);
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
    if (!s.valid || s.record?.type !== "glance-confirmation" || !GLANCE_KINDS.includes(s.record.payload?.change)) continue;
    const full = recs.filter((r) => r.payload?.scope === s.scope).at(-1);
    if (!full?.payload?.parsed) continue;
    for (const n of [...(full.payload.parsed.nodes || []), ...(full.payload.parsed.entries || [])]) if (n?.id) add(`spine:${n.id}`, nodeHash(n));
    const mapText = key === "course" ? full.payload.text : full.payload.text?.[`concepts/${key}.md`];
    // term targets are namespaced by the map that defines them (red team R4 coherence F6)
    const scope = key === "course" ? "course" : key;
    for (const [label, terms] of termsByLabel(typeof mapText === "string" ? termsOfMap(mapText, scope, key === "course" ? COURSE_MAP : null) : [])) add(termKey(scope, label), groupTermHash(terms));
  }
  return accept;
}
const termsByLabel = (terms) => { const m = new Map(); for (const t of terms) if (t.label) { const l = t.label.toLowerCase(); if (!m.has(l)) m.set(l, []); m.get(l).push(t); } return m; };

// ---- stamps written by an earlier harness (red team R4 coherence F5, F6): read as they meant, migrated once ----------
// A pre-R4 term key `term:<label>` stood for the LAST map's definition of the label only (F6). It is read as one key
// per map that defines the label: the last at the stamped hash; every other at the definition its map had at its last
// full approval BEFORE the unit's sidecar was last written (the stamp is no newer than that write) — so nothing is owed
// when nothing changed, and a definition changed since is owed. A pre-R4 question binding (`question:`/`ref:` hashed
// with the lossy key, F5) counts as current only when the text is unchanged under both keys (legacyQuestionCurrent);
// otherwise it owes one re-check. Every harness write stores the migrated stamp (writeUnitRecords).
function legacyInfo(root, ctx) {
  if (ctx.legacy) return ctx.legacy;
  const logText = readLogText(root), ok = !verifyLog(logText).length, recs = ok ? parseLog(logText) : [];
  const lastWrite = new Map(), approvals = new Map();
  for (const r of recs) {
    if (r.type === "revision" && r.payload?.event === UNIT_RECORDS_EVENT) for (const rel of Object.keys(r.payload.digests || {})) lastWrite.set(rel, r.seq);
    if (r.type === "approval" && r.party?.role === "instructor" && r.payload?.text) {
      const sc = r.payload.scope === "course" ? "course" : String(r.payload.scope || "").replace(/^chapter:/, "");
      const mapText = sc === "course" ? r.payload.text : r.payload.text?.[`concepts/${sc}.md`];
      if (typeof mapText !== "string") continue;
      if (!approvals.has(sc)) approvals.set(sc, []);
      approvals.get(sc).push({ seq: r.seq, terms: termsByLabel(termsOfMap(mapText, sc, sc === "course" ? COURSE_MAP : null)) });
    }
  }
  return (ctx.legacy = { lastWrite, approvals });
}
/** The hash a legacy stamp stands for, for one map's definition of a label that is not the last one (see above). */
function legacyTermBaseline(root, ctx, def, rel) {
  const { lastWrite, approvals } = legacyInfo(root, ctx), before = lastWrite.get(rel) ?? Infinity;
  const a = (approvals.get(def.scope) || []).filter((x) => x.seq < before).at(-1);
  const terms = a?.terms.get(def.label);
  return terms ? groupTermHash(terms) : ctx.hashes[def.key];
}
/** A unit's stamp as the current harness reads it: pre-R4 term keys and question bindings migrated (see above). */
export function migratedStamp(root, ctx, stamp, rel, id = null) {
  if (!stamp) return stamp;
  let out = null; const put = () => (out ??= { ...stamp });
  for (const [k, h] of Object.entries(stamp)) {
    const label = legacyTermLabel(k, ctx.scopes);
    if (label != null) {
      const defs = ctx.termDefs.filter((d) => d.label === label);
      if (!defs.length) continue; // the term is gone: the key stays, and is owed (missing)
      put(); delete out[k];
      const last = defs.at(-1);
      for (const d of defs) if (!(d.key in stamp)) out[d.key] = d.key === last.key ? h : legacyTermBaseline(root, ctx, d, rel);
      continue;
    }
    if ((k.startsWith("question:") || k.startsWith("ref:")) && isLegacyQuestionHash(h)) {
      const target = ctx.byId.get(k.slice(k.indexOf(":") + 1));
      if (target && legacyQuestionCurrent(h, target.text)) { put(); out[k] = ctx.hashes[k] ?? h; }
    }
  }
  // a key-term edge the stamp does not hold (a spelling the harness newly reads — "**Endothermic** reaction", R4 F1 —
  // or a term defined in another map, F6) is baselined at the definition its map had when the stamp was written, never
  // at today's: a definition changed since is owed
  for (const e of (id && ctx.edges.get(id)) || []) {
    if (!e.target.startsWith("term:") || e.target in (out || stamp)) continue;
    const d = ctx.termDefs.find((x) => x.key === e.target);
    if (d) { put(); out[e.target] = legacyTermBaseline(root, ctx, d, rel); }
  }
  return out || stamp;
}

function context(root, reader) {
  const chapters = manifestChapters(reader);
  const spine = parseSpine(reader, chapters);
  const units = loadUnits(root, reader);
  const edges = dependencyEdges(units, spine, sourceHashes(reader));
  const hashes = targetHashes(units, spine, sourceHashes(reader));
  let accept = null; // computed only when a spine or term target moved (it reads the approval history)
  const acceptOf = () => (accept ??= lightAccept(reader, chapters, readLogText(root)));
  const ctx = { root, chapters, spine, units, edges, hashes, acceptOf, byId: new Map(units.map((u) => [u.id, u])), termDefs: termDefinitions(spine), scopes: new Set(["course", ...chapters]) };
  // stamps written by an earlier harness are read migrated (R4 F5, F6)
  ctx.units = units.map((u) => { const st = migratedStamp(root, ctx, u.stamp, u.locator.deliverable, u.id); return st === u.stamp ? u : { ...u, stamp: st }; });
  ctx.byId = new Map(ctx.units.map((u) => [u.id, u]));
  return ctx;
}

/** What a unit owes because of its stamp: moved targets, and a question binding that no longer holds (F1, F3). */
export function owedTargets(u, ctx) {
  if (!u.stamp) return [];
  let moved = staleTargets(u.stamp, ctx.hashes);
  if (moved.some((t) => /^(spine|term):/.test(t))) moved = staleTargets(u.stamp, ctx.hashes, ctx.acceptOf());
  const binding = u.form === "answer" ? questionBindingProblems(u.stamp, ctx.edges.get(u.id)).map((b) => `question-binding:${b}`) : [];
  const refs = referenceBindingProblems(u.stamp, ctx.edges.get(u.id)).map((b) => `reference-binding:${b}`);
  return [...moved, ...binding, ...refs];
}
/**
 * What a re-check must be SHOWN (red team R4 coherence F4): for a unit that owes because a dependency moved, each moved
 * target as it is now — the unit stating a shared value (its new value), a key term's definition, a spine node's text,
 * a question it answers or names. A re-check that never saw what moved cannot catch the incoherence it exists for, so
 * the knowledge review carries these (verifyKnowledge) and `reverify` counts only a review whose prompt did.
 * Returns [{ target, what, text }].
 */
export function movedForRecheck(u, ctx) {
  const moved = [...new Set([...owedTargets(u, ctx), ...(u.owes?.targets || [])])];
  const out = [], nodes = nodeIndex(ctx.spine);
  const push = (target, what, text) => { const t = String(text ?? "").trim(); if (t && !out.some((x) => x.text === t)) out.push({ target, what, text: t }); };
  const unitAt = (target, v) => { if (v && v.id !== u.id) push(target, `${v.label ? `${v.label}, ` : ""}${v.locator.deliverable}${v.locator.section ? ` § ${v.locator.section}` : ""}`, v.text); };
  for (const t of moved) {
    const i = t.indexOf(":"), kind = t.slice(0, i), id = t.slice(i + 1);
    if (["unit", "ref", "question"].includes(kind)) unitAt(t, ctx.byId.get(id));
    else if (kind === "term") {
      const label = legacyTermLabel(t, ctx.scopes);
      for (const d of ctx.termDefs.filter((x) => (label != null ? x.label === label : x.key === t))) push(d.key, `key term "${d.term.label}" (${d.scope === "course" ? "the course map" : `the ${d.scope} concept map`})`, d.term.text);
    } else if (kind === "spine") { const n = nodes.get(id); if (n) push(t, id, nodeShown(n)); }
    else if (kind === "question-binding" || kind === "reference-binding")
      for (const e of (ctx.edges.get(u.id) || []).filter((x) => x.target.startsWith(kind === "question-binding" ? "question:" : "ref:"))) unitAt(e.target, ctx.byId.get(e.target.slice(e.target.indexOf(":") + 1)));
  }
  return out;
}
const nodeShown = (n) => [n.text ?? n.title, ...(n.type || n.count != null || n.levels || n.targets ? [`(type: ${n.type ?? "—"}; count: ${n.count ?? "—"}; level: ${n.levels ?? "—"}; targets: ${n.targets ?? "—"})`] : [])].join(" ");
/** unit id → what its re-check must be shown (movedForRecheck), for every unit that owes one. */
export function recheckShown(root, reader) {
  const ctx = context(root, reader);
  return new Map(ctx.units.filter((u) => owesNow(u, ctx)).map((u) => [u.id, movedForRecheck(u, ctx)]));
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

/**
 * Write every unit record not yet migrated to the R4 stamps (term keys namespaced by map, question bindings on the
 * visible-text key, key-term edges baselined: see migratedStamp). It changes no obligation — a stamp is read migrated
 * either way — but fixes the baseline of a legacy stamp at the moment of migration. Run at every session begin.
 */
export function migrateUnitRecords(root, reader) {
  const sides = deliverablesOf(reader).map((rel) => [rel, readSidecar(root, rel)]).filter(([, side]) => side && side.stamps !== 2);
  if (!sides.length) return 0;
  writeUnitRecords(root, sides.map(([rel, side]) => ({ ...side, deliverable: rel })));
  return sides.length;
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
    const live = liveContradictions(root, units);
    const blocked = ids.filter((id) => live.has(id));
    if (blocked.length) throw new Error(`${blocked.join(", ")}: a verification contradicts the current text — answer it through the correction (or its revert), not a confirmation`);
  }
  for (const id of ids) if (!text.has(id)) throw new Error(`no such unit: ${id}`);
  // the confirmation is logged first: it is the evidence the record write checks (writeUnitRecords, R4 F7)
  const rec = appendLogRecord(root, { type: "confirmation", party, payload: { what, units: ids, weight: "single", instructorWords, ...(what === "fact" ? { factHashes: Object.fromEntries(ids.map((id) => [id, factHash(text.get(id) || "")])), contentHashes: Object.fromEntries(ids.map((id) => [id, unitHash(text.get(id) || "")])) } : {}) } });
  rewriteUnits(root, ids, (u) => {
    if (what === "fact") u.evidence = [...(u.evidence || []), { type: "instructor-confirmation", by: party.name, at, factHash: factHash(text.get(u.id) || "") }];
    u.stamp = stampFor(u.id, edges, hashes); delete u.carried; delete u.owes;
  });
  return rec;
}

/** The verdict path admits evidence for a unit's CURRENT facts (only the harness writes it; admission.mjs decided it). */
export function admitEvidence(root, reader, unitId, evidence) {
  const { units } = context(root, reader);
  const u = units.find((x) => x.id === unitId);
  if (!u) throw new Error(`no such unit: ${unitId}`);
  if (evidence.factHash !== factHash(u.text)) throw new Error(`${unitId}: the evidence is for other facts than the unit states now`);
  if (!["quote-verified", "authorized-divergence"].includes(evidence.type)) throw new Error("the verdict path writes quote-verified or authorized-divergence evidence only");
  // evidence names the logged fact-check dispatch it came from (R2: nothing clears without what produced it)
  const recs = parseLog(readLogText(root));
  const logged = recs.find((r) => r.type === "dispatch" && r.party?.role === "harness" && r.payload?.kind === "semi" && r.payload?.dispatch === evidence.dispatch);
  if (!evidence.dispatch || !logged) throw new Error(`${unitId}: evidence must name the logged fact-check dispatch it came from (${evidence.dispatch || "none named"} is not in the log)`);
  // an exported writer checks its evidence itself (red team R4 coherence F7, the same audit): the dispatch must be a
  // fact check of THIS unit whose record the log binds — at the facts the evidence claims, unless it is the evidence of
  // a logged auto-correction (the contradicting quotes now state the unit's value) or of the instructor's revert of one
  if (evidence.correction) {
    if (!recs.some((r) => r.type === "revision" && r.payload?.event === "autocorrect" && r.payload?.correction === evidence.correction && r.payload?.unit === logged.payload.unit))
      throw new Error(`${unitId}: evidence names correction ${evidence.correction}, which no logged auto-correction of the checked unit made`);
  } else {
    let rec = null; try { rec = JSON.parse(fs.readFileSync(recordFile(root, `metadata/verification/${evidence.dispatch}.json`), "utf8")); } catch { rec = null; }
    const b = rec && boundRecord(rec, recs.filter((r) => r.type === "dispatch" && r.party?.role === "harness"));
    if (!b || b.unit !== unitId || logged.payload.unit !== unitId) throw new Error(`${unitId}: evidence must come from a logged fact check of this unit (${evidence.dispatch} is ${b ? `of ${b.unit}` : "not bound by the log"})`);
    if (b.hashed && b.factHash !== evidence.factHash) throw new Error(`${unitId}: ${evidence.dispatch} checked other facts than the unit states now`);
    if (b.status === "contradicted") throw new Error(`${unitId}: ${evidence.dispatch} found the unit's claims contradicted: it is no evidence for them`);
  }
  rewriteUnits(root, [unitId], (x) => { x.evidence = [...(x.evidence || []).filter((e) => !(e.type === evidence.type && e.factHash === evidence.factHash && e.dispatch === evidence.dispatch)), evidence]; });
}

/** Absolute reviews that count: a logged dispatch whose prompt and answer the log binds, and whose review parses and
 *  covers the unit's sentences → "unit|hash" — the unit and the sentences read from what the log binds, never from
 *  the record's editable fields (absoluteReviewOf; red-team round 2). */
export function reviewedAbsolutes(root) {
  const out = new Set();
  const dir = recordFile(root, "metadata/verification");
  if (!fs.existsSync(dir)) return out;
  const log = [];
  for (const line of readLogText(root).split("\n").filter(Boolean)) { try { const r = JSON.parse(line); if (r.type === "dispatch" && r.party?.role === "harness") log.push(r); } catch { /* the log module reports it */ } }
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    let r; try { r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    const a = absoluteReviewOf(r, log);
    if (a?.review.ok) out.add(`${a.unit}|${a.absolutesHash}`);
  }
  return out;
}

/**
 * Knowledge-based teaching units that no logged blind review has read at their current text. Reported, not
 * blocking: Level 2 is best effort (P11 K4 scenario: an agent that never ran the review saw nothing to tell it so).
 */
export function unreviewedKnowledge(root, reader) {
  const dir = recordFile(root, "metadata/verification"), seen = new Set();
  const units = loadUnits(root, reader), textOf = new Map(units.map((u) => [`${u.id}|${u.locator.contentHash}`, u.text]));
  const log = logDispatches(root);
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    let r; try { r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    // the unit and the text reviewed are what the log binds (red-team round 3, R3-K08): a legacy record's contentHash
    // is derived from the passage its logged prompt showed, never read from the record
    const b = r.kind === "knowledge" ? boundRecord(r, log) : null;
    if (!b?.contentHash) continue;
    // a review that cannot be scored (no readable answer, or a concern quoting words the passage does not have) is not
    // a review of the unit (red-team round 2, R2-K10)
    const key = `${b.unit}|${b.contentHash}`, k = textOf.has(key) && readKnowledgeReview(r, textOf.get(key));
    if (k && k.ok && !k.unlocated.length) seen.add(key);
  }
  return units.filter((u) => u.judgment.includes("knowledge-based") && u.role === "teaching" && !seen.has(`${u.id}|${u.locator.contentHash}`)).map((u) => u.id);
}
/** The harness's dispatch log records. */
function logDispatches(root) {
  const out = [];
  for (const line of readLogText(root).split("\n").filter(Boolean)) { try { const r = JSON.parse(line); if (r.type === "dispatch" && r.party?.role === "harness") out.push(r); } catch { /* the log module reports it */ } }
  return out;
}

/** Units whose current facts a recorded verification contradicts. Read through what the log binds (round 3, R3-K05):
 *  a record bound whole is current at its factHash and contradicted by its admission; a legacy record is current when
 *  the claims its prompt printed are the unit's current claims, and contradicted by the status logged with it. */
function liveContradictions(root, units) {
  const dir = recordFile(root, "metadata/verification"), out = new Set();
  if (!fs.existsSync(dir)) return out;
  const log = logDispatches(root), byId = new Map(units.map((u) => [u.id, u]));
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    let r; try { r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    if (r.kind !== "semi") continue;
    const b = boundRecord(r, log), u = b && byId.get(b.unit);
    if (!u || b.status !== "contradicted") continue;
    // a contradiction (a defect) must go through its correction or revert; a dispute between sources is the
    // instructor's to settle, and a confirmation is how they settle it (D12-F)
    const current = b.hashed ? b.factHash === factHash(u.text) : sameClaims(r, u.text);
    if (current) out.add(u.id);
  }
  return out;
}
/** The claims a semi record's prompt printed are the unit's current checkable claims. */
const sameClaims = (r, text) => {
  const lines = String(r.bundle?.prompt || "").split("\n");
  const printed = lines.slice(lines.indexOf("CLAIMS") + 1, lines.indexOf("PASSAGES")).map((l) => l.match(/^\d+\. (.*)$/)?.[1]).filter(Boolean);
  return printed.length > 0 && JSON.stringify(printed) === JSON.stringify(checkableClaims(text).map((c) => c.text.replace(/\s+/g, " ")));
};

/** The "wrong" concerns a knowledge dispatch raised about words the unit still contains (as verdicts.mjs reads them);
 *  a review that cannot be scored — no readable answer, or a concern whose words the passage does not have — is never
 *  a clean re-check either (red-team round 2, R2-K10). */
function wrongConcerns(root, dispatch, unitText) {
  let r; try { r = JSON.parse(fs.readFileSync(recordFile(root, `metadata/verification/${dispatch}.json`), "utf8")); } catch { return [{ kind: "wrong", text: "(the review record is missing)", problem: "its record cannot be read" }]; }
  if (sha256(r.answer?.raw ?? "") !== r.answer?.responseHash) return [{ kind: "wrong", text: "(the review record was edited)", problem: "its answer does not match the logged response" }];
  const k = readKnowledgeReview(r, unitText);
  if (!k.ok) return [{ kind: "wrong", text: "(the review cannot be read)", problem: `${k.reason}: run it again` }];
  if (k.unlocated.length) return [{ kind: "wrong", text: k.unlocated[0].text, problem: `the review quotes words the passage does not contain, so it cannot be scored: run it again (${k.unlocated[0].problem})` }];
  return k.concerns.filter((c) => c.kind !== "clarify");
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
  // what moved (R4 F4): the shared value, term, spine node or question whose change raised the obligation
  for (const m of movedForRecheck(u, ctx)) if (!shown.includes(shownForm(m.text))) return `the reviewer was not shown what moved (${m.what}: "${shownForm(m.text).slice(0, 80)}")`;
  const m = String(r.answer?.raw || "").match(/\{[\s\S]*\}/);
  let v; try { v = JSON.parse(m?.[0] || ""); } catch { v = null; }
  if (v?.nonce !== r.bundle?.nonce || !Array.isArray(v?.concerns)) return "the reviewer's answer is unreadable (no answer to this bundle)";
  return null;
}

/**
 * The logged blind correctness review that re-verifies a unit now, if there is one (reverifyUnits, and the evidence
 * check of every unit-record write, unit_records.mjs): a knowledge (or, for a non-answer, an admitting semi) dispatch of
 * the unit made after its obligation arose, at its current text and dependencies, whose record checks out against the
 * log — showing the unit, its question and what moved (reviewRecordProblem) — and, for a knowledge review, raising no
 * "wrong" concern. Returns { review } or { unreviewed: true } or { problem }.
 */
function countedReview(root, recs, u, ctx, verdicts = (d, text) => wrongConcerns(root, d, text)) {
  const id = u.id;
  const carriedAt = recs.filter((r) => r.type === "revision" && r.payload?.event === "units-carried" && (r.payload.units || []).includes(id)).at(-1)?.seq || 0;
  const since = Math.max(u.owes?.since || 0, u.carried ? carriedAt : 0), deps = depsOf(id, ctx);
  const candidates = recs.filter((r) => r.type === "dispatch" && r.party?.role === "harness" && r.seq > since && r.payload?.unit === id &&
    r.payload?.contentHash === u.locator.contentHash && r.payload?.deps === deps && REVIEW_COUNTS[r.payload?.kind]?.(r.payload, u));
  const checked = candidates.map((r) => [r, reviewRecordProblem(root, r, u, ctx)]);
  const review = checked.filter(([, why]) => !why).at(-1)?.[0];
  if (!review) return checked.length ? { problem: `${id}: its blind review (${checked.at(-1)[0].payload.dispatch}) does not count — ${checked.at(-1)[1]}; run ${REVERIFY_ROUTE(root, [id])} again` } : { unreviewed: true };
  if (review.payload.kind === "knowledge" && verdicts) {
    const wrong = verdicts(review.payload.dispatch, u.text).filter((c) => c.kind === "wrong");
    if (wrong.length) return { problem: `${id}: its blind review (${review.payload.dispatch}) found it wrong ("${wrong[0].text.slice(0, 80)}": ${wrong[0].problem.slice(0, 120)}) — revise it, then have it reviewed again` };
  }
  return { review };
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
  const problems = [], unreviewed = [], used = {};
  for (const id of ids) {
    const u = ctx.byId.get(id);
    if (!u) { problems.push(`${id}: no such indexed unit (run units.mjs index first)`); continue; }
    if (!owesNow(u, ctx)) { problems.push(`${id} owes no re-verification`); continue; }
    const c = countedReview(root, recs, u, ctx, verdicts);
    if (c.unreviewed) unreviewed.push(id);
    else if (c.problem) problems.push(c.problem);
    else used[id] = c.review.payload.dispatch;
  }
  if (unreviewed.length) problems.push(`${unreviewed.join(", ")}: no logged blind correctness review of the current text (and its current question and dependencies) since the re-verification was owed — run ${REVERIFY_ROUTE(root, unreviewed)}, then reverify (a link review does not count)`);
  if (problems.length) throw new Error(`refusing to record a re-verification: ${problems.join("; ")}`);
  rewriteUnits(root, ids, (u) => { u.stamp = stampFor(u.id, ctx.edges, ctx.hashes); delete u.owes; delete u.carried; });
  return appendLogRecord(root, { type: "revision", party, payload: { event: "units-reverified", units: ids, reviews: used } });
}

// ---- the evidence check of every unit-record write (red team R4 coherence F7) --------------------------------------
// writeUnitRecords is exported, and its content is the caller's: a sidecar handed to it with a stale unit's stamp
// refreshed and its `owes` dropped would clear the obligation with no review. So every write is compared with the
// records on disk, and a write that clears anything a unit owes — a moved target, an `owes` entry, a version carry, the
// record itself — is refused unless the evidence that clears it is there: a counted blind re-check of the unit at its
// current text and dependencies (countedReview, as `reverify` requires), or the instructor's confirmation logged since
// the unit's record was last written. A clearing write must also stamp the unit exactly as it stands now. A carry is
// an obligation of its own, so writing one clears nothing. Restamping keeps what was owed in `owes`, and indexing keeps
// every record (a retired one in its deliverable's register), so neither clears anything.
const recordIndex = (sides) => {
  const m = new Map();
  for (const [rel, side] of Object.entries(sides)) {
    for (const u of side?.units || []) m.set(u.id, { rec: u, rel, live: true });
    for (const e of side?.retired || []) if (!m.has(e.id)) m.set(e.id, { rec: e, rel, live: false });
  }
  return m;
};
const owesKept = (b, a) => !b || (!!a && (a.since ?? 0) <= (b.since ?? 0) && (b.targets || []).every((t) => (a.targets || []).includes(t)));
/**
 * Why a write of unit records may not happen (empty: it may). `before`/`after`: deliverable → sidecar, as on disk and
 * as it would be after the write.
 */
export function unitRecordWriteProblems(root, before, after) {
  const B = recordIndex(before), A = recordIndex(after), problems = [], check = [];
  for (const [id, b] of B) {
    const a = A.get(id);
    if (!a) { if (b.rec.stamp || b.rec.owes || b.rec.carried) problems.push(`${id}: its record (what it owes) would be dropped`); continue; }
    if (a.rec.carried) continue;
    if (b.rec.carried || !owesKept(b.rec.owes, a.rec.owes) || canonicalJson(b.rec.stamp ?? null) !== canonicalJson(a.rec.stamp ?? null)) check.push([id, b, a]);
  }
  if (!check.length) return problems;
  const reader = liveReader(root), ctx = context(root, reader);
  let recs = null, info = null;
  for (const [id, b, a] of check) {
    const cu = b.live && a.live ? ctx.byId.get(id) : null;
    const oldStamp = cu ? cu.stamp : migratedStamp(root, ctx, b.rec.stamp, b.rel);
    if (!cu) {
      // a record the package cannot load now (retired, or its deliverable not indexed): nothing can re-verify it, so a
      // write may change it only by adding to what it owes
      const newStamp = migratedStamp(root, ctx, a.rec.stamp, a.rel);
      const changed = Object.keys(oldStamp || {}).filter((k) => (newStamp || {})[k] !== oldStamp[k] && !(a.rec.owes?.targets || []).includes(k));
      if (b.rec.carried || !owesKept(b.rec.owes, a.rec.owes) || changed.length) problems.push(`${id}: the write would clear what it owes (${[...(b.rec.carried ? ["its version carry"] : []), ...changed].join(", ") || "its owed re-verification"}) with no re-check of it`);
      continue;
    }
    const oldU = { ...cu, stamp: oldStamp, owes: b.rec.owes, carried: b.rec.carried };
    const newU = { ...cu, stamp: migratedStamp(root, ctx, a.rec.stamp, a.rel, id), owes: a.rec.owes, carried: a.rec.carried };
    const nowOwed = new Set([...owedTargets(newU, ctx), ...(a.rec.owes?.targets || [])]);
    const cleared = [...new Set([...owedTargets(oldU, ctx), ...(b.rec.owes?.targets || [])])].filter((t) => !nowOwed.has(t));
    if (b.rec.carried) cleared.push("its version carry");
    if (b.rec.owes && a.rec.owes && (a.rec.owes.since ?? 0) > (b.rec.owes.since ?? 0)) cleared.push("the age of its obligation");
    if (!cleared.length) continue;
    // the clearing is a re-verification or a confirmation: the unit stamped as it stands now, and the evidence there
    if (canonicalJson(a.rec.stamp ?? null) !== canonicalJson(stampFor(id, ctx.edges, ctx.hashes)) || a.rec.owes) { problems.push(`${id}: the write would clear what it owes (${cleared.join(", ")}) without stamping it as it stands now`); continue; }
    recs ??= parseLog(readLogText(root)); info ??= legacyInfo(root, ctx);
    const writtenAt = info.lastWrite.get(b.rel) ?? 0;
    const confirmed = recs.some((r) => r.type === "confirmation" && r.party?.role === "instructor" && r.seq > writtenAt && (r.payload?.units || []).includes(id) && String(r.payload?.instructorWords || "").trim());
    if (confirmed) continue;
    const c = countedReview(root, recs, oldU, ctx);
    if (!c.review) problems.push(`${id}: the write would clear what it owes (${cleared.join(", ")}) with no logged blind re-check of it${c.problem ? ` (${c.problem})` : ""} and no instructor confirmation since its record was last written`);
  }
  return problems;
}

/**
 * The sides to write with every stamp migrated (pre-R4 term keys and question bindings, and key-term edges the stamp
 * never held: see migratedStamp), marked `stamps: 2`. A side already marked on disk was migrated when it was written;
 * its stamps come from it, so it is only marked again. `before`: deliverable → sidecar on disk.
 */
export function migrateRecordSides(root, sides, before = {}) {
  const todo = sides.filter((side) => before[side.deliverable]?.stamps !== 2 && [...(side.units || []), ...(side.retired || [])].some((u) => u.stamp));
  let ctx = null;
  if (todo.length) { try { ctx = context(root, liveReader(root)); } catch { ctx = null; } }
  return sides.map((side) => {
    if (!ctx || !todo.includes(side)) return { ...side, stamps: 2 };
    const live = (u) => (ctx.byId.get(u.id)?.locator.deliverable === side.deliverable ? u.id : null);
    return { ...side, stamps: 2,
      units: (side.units || []).map((u) => (u.stamp ? { ...u, stamp: migratedStamp(root, ctx, u.stamp, side.deliverable, live(u)) } : u)),
      ...(side.retired ? { retired: side.retired.map((e) => (e.stamp ? { ...e, stamp: migratedStamp(root, ctx, e.stamp, side.deliverable) } : e)) } : {}) };
  });
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
        const why = moved.map((t) => t.replace("question-binding:legacy", "its question binding predates the harness's (a re-check once)").replace("question-binding:re-paired", "it now follows another question").replace("reference-binding:re-targeted", "a question it names by number is now another one (renumbered)"));
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
  }
  // D41 for the guide (red team round 2, C5-08): a question fills an entry's Count only when its current blind
  // review says it practises the entry's objective ("yes") and has answered its type and level (D44); a framing question is
  // never asked its fidelity, so it never fills one. A Count short only of reviews owed is the agent's review to run.
  // ONE matching over every chapter's entries (red team round 4, C5-01): a question linked to entries of two chapters
  // counts toward one of them, never one in each.
  const entries = chapters.flatMap((ch) => spine.chapters[ch].guide.entries);
  const { verified, owed } = guideReviewState(entries, null, reviews);
  const assigned = guideAssignment(entries, units, verified), possible = guideAssignment(entries, units, (q, e) => verified(q, e) || owed(q, e));
  // Whether the Counts are met is a property of the WHOLE matching (round 4, C5-02): the verified maximum matching is
  // compared with the total need. Per entry, a multi-entry question placed in A by the verified matching made A look
  // full while the question B needed was the one owing its review — and which entry looked short hung on link order.
  // When the verified matching is short, every question the `possible` matching relies on that owes its review is owed.
  const byId = new Map(units.map((u) => [u.id, u]));
  const need = (e) => (Number.isInteger(e.count) ? e.count : 0);
  const totalNeed = entries.filter((e) => e.id).reduce((n, e) => n + need(e), 0);
  const verifiedSize = [...assigned.values()].reduce((n, qs) => n + qs.length, 0);
  const short = verifiedSize < totalNeed;
  for (const e of entries.filter((x) => x.id)) {
    const got = assigned.get(e.id) || [], relied = short ? (possible.get(e.id) || []).map((id) => byId.get(id)).filter((q) => q && reviewable(q) && owed(q, e)) : [];
    if (got.length >= need(e) && !relied.length) continue;
    const linked = units.filter((u) => u.form === "question" && (u.spineNodes || []).includes(e.id));
    const unreviewed = [...new Set([...(got.length < need(e) ? linked.filter((q) => reviewable(q) && owed(q, e)) : []), ...relied])];
    // the questions awaiting their review count as had (the review is owed, below); the rest is short
    const had = (possible.get(e.id) || []).length;
    if (unreviewed.length) ob("link-review-owed", unreviewed.map((u) => u.id), `a blind link and level review of the questions that would fill ${e.id} (node scripts/verify.mjs alignment --units ${unreviewed.map((u) => u.id).join(",")})`);
    if (had < need(e)) ob("guide-entry-short", linked.map((u) => u.id), `${need(e) - had} more question(s) for ${e.id} (has ${had} of ${need(e)})`); // only practice questions whose review says they fit, each toward one entry
  }
  // D42: everything that ships is read — a framing unit (introduction, summary, closing) no current review has read for
  // off-plan content is the agent's to review (C3-07: a whole lesson under "## Introduction to …" went unread). Only an
  // explicit off-plan answer reads it (round 2, C2-13: a missing or unreadable answer left it read).
  const unreadFraming = units.filter((u) => u.role === "framing" && (!reviews.has(u.id) || reviews.get(u.id).offPlan === null));
  if (unreadFraming.length) ob("framing-review-owed", unreadFraming.map((u) => u.id), `a blind review of ${unreadFraming.length} framing unit(s) for off-plan content (node scripts/verify.mjs alignment --units ${unreadFraming.map((u) => u.id).join(",")})`);
  // course-map objectives (redteam r1 C1-10; round 2 C1-10). The grammar links a chapter to the course map only through
  // [prereq: …]. A mention is not teaching: a course objective is covered only by what is TAUGHT (D41) — a chapter
  // objective or concept that names it in [prereq: …] and that a unit's current review says it teaches, or a study-
  // guide/slides unit linking the course objective itself, reviewed "yes".
  const chapterNodes = chapters.flatMap((ch) => spine.chapters[ch].map.nodes).filter((n) => ["objective", "concept"].includes(n.kind) && n.id);
  const teachersOf = (id) => units.filter((u) => teachesInDeliverable(u, id));
  const taught = (id) => teachersOf(id).some((u) => reviews.get(u.id)?.verdicts.get(id) === "yes");
  const unreviewedOf = (id) => teachersOf(id).filter((u) => !["yes", "passing", "no"].includes(reviews.get(u.id)?.verdicts.get(id)));
  for (const o of spine.course.nodes.filter((n) => n.kind === "objective" && n.id)) {
    const via = chapterNodes.filter((n) => (n.prereqs || []).includes(o.id)).map((n) => n.id);
    if ([o.id, ...via].some(taught)) continue;
    const unreviewed = [...new Set([o.id, ...via].flatMap(unreviewedOf).map((u) => u.id))];
    if (unreviewed.length) ob("link-review-owed", unreviewed, `a blind link review of the units that would teach ${o.id}${via.length ? ` (through ${via.join(", ")})` : ""} (node scripts/verify.mjs alignment --units ${unreviewed.join(",")})`);
    else ob("course-objective-uncovered", [], `a taught chapter objective or concept that names ${o.id} in [prereq: …], or a teaching unit (study guide or slides) that teaches it — a [prereq: …] mention alone does not cover it${via.length ? ` (${via.join(", ")} ${via.length === 1 ? "names it, but is" : "name it, but are"} taught by no reviewed unit)` : ""}`);
  }
  return F;
}

/**
 * Which question fills which guide entry, as the current reviews say (round 2, C5-08). `verified(q, e)`: q's current
 * review says it practises e's objective ("yes") and has answered e's type and level (a "differs" is a question, D44). `owed(q, e)`: q has no usable current
 * review for e yet (none, or a verdict or fidelity left unanswered) — the agent's review to run.
 */
export function guideReviewState(entries, chapter, reviews) {
  const fidelityFor = (r, e) => (r.fidelity || []).find((f) => f.id === e.id) || ((r.fidelity || []).length === 1 && r.fidelity[0].id == null ? r.fidelity[0] : null);
  // an entry's objective is in the entry's own chapter (entries of several chapters can be matched at once: round 4)
  const objectiveOf = (e) => `objective.${e.chapter ?? chapter}.${e.objective}`;
  const verified = (q, e) => {
    const r = q.role === "teaching" ? reviews.get(q.id) : null, f = r && fidelityFor(r, e);
    // the type and level must be ANSWERED, not "matches": one that differs is the instructor's assessment-fidelity
    // question, and questions never block (D44, operator 2026-10-07) — so it never leaves a Count short
    return !!(r && r.verdicts.get(objectiveOf(e)) === "yes" && f && f.type !== "unanswered" && f.level !== "unanswered");
  };
  const owed = (q, e) => {
    if (q.role !== "teaching") return false;
    const r = reviews.get(q.id), f = r && fidelityFor(r, e), v = r?.verdicts.get(objectiveOf(e));
    return !r || !["yes", "passing", "no"].includes(v) || !f || f.type === "unanswered" || f.level === "unanswered";
  };
  return { verified, owed };
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
 * `eligible(q, entry)` narrows which links count (coreObligations: only links the current review verified, D41).
 * Returns Map(entry id → [question ids]).
 */
export function guideAssignment(entries, units, eligible = (q) => q.role === "teaching") {
  const cap = new Map(entries.filter((e) => e.id).map((e) => [e.id, Number.isInteger(e.count) && e.count > 0 ? e.count : 0]));
  const byId = new Map(entries.filter((e) => e.id).map((e) => [e.id, e]));
  const got = new Map([...cap.keys()].map((id) => [id, []]));
  // a framing question (under a summary heading) is never a practice question of an entry (round 2, C5-08)
  const qs = units.filter((u) => u.form === "question" && u.role === "teaching" && u.locator.deliverable.startsWith("practice/"));
  const linksOf = new Map(qs.map((q) => [q.id, (q.spineNodes || []).filter((n) => cap.get(n) > 0 && eligible(q, byId.get(n)))]));
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
