// The deterministic core (redesign P5; D19-A). Obligations that block publishing from the first release — each says
// what is missing, never that something is wrong:
//   evidence-missing     a semi-mechanical unit has no admitted evidence for its current facts (Q15, D19-D);
//   absolute-unreviewed  an absolute statement no logged context review has read yet (D30);
//   unit-unlinked        a teaching unit serves no spine node (D19-I);
//   objective-uncovered  an objective no teaching unit serves (Control C1);
//   guide-entry-short    a guide entry has fewer linked questions than its Count (Control C5);
//   reverify             a unit's dependencies moved since it was written or last re-verified (Coherence H2);
//   carried-unverified   a unit carried into a new major version has not been re-verified (D15).
// And one defect: a unit that links to a spine node that does not exist.
//
// What clears them, and nothing else: the agent revising the unit (a fresh stamp); a stable module re-checking it
// (recordVerification); the instructor confirming it (confirmUnits). The agent cannot clear an obligation by saying so.
import fs from "node:fs";
import path from "node:path";
import { makeFinding } from "../records/findings.mjs";
import { appendLogRecord } from "../records/log.mjs";
import { unitsPathFor, recordFile } from "../records/paths.mjs";
import { validateUnitSidecar } from "../records/units.mjs";
import { classifyUnit, derivedRole, segmentDeliverable } from "./segment.mjs";
import { readLogText } from "../records/log.mjs";
import { checkableClaims, claimsHash } from "../verify/claims.mjs";
import { absoluteSentences, absolutesHash, readAbsoluteReview } from "../verify/absolutes.mjs";
import { deliverablesOf, indexUnits, readSidecar } from "./units_index.mjs";
import { parseSpine, nodeIndex } from "./spine.mjs";
import { manifestChapters } from "./package_reader.mjs";
import { openMajorVersion } from "./versions.mjs";
import { dependencyEdges, factHash, sourceHashes, stampFor, staleTargets, targetHashes } from "./dependencies.mjs";

// quote-verified: admitted by the verdict path (P7); instructor-confirmation: one confirmation (D19-D);
// authorized-divergence: the instructor kept their text against evidence, after seeing it — the double confirmation (Q10).
export const ADMITTED_EVIDENCE = Object.freeze(["quote-verified", "instructor-confirmation", "authorized-divergence"]);

/** Instructor acts recorded in the log, by kind: confirmations (unit → fact hashes) and divergences (unit → corrections). */
export function loggedInstructorActs(root) {
  const acts = { confirmed: new Map(), diverged: new Map() };
  for (const line of readLogText(root).split("\n").filter(Boolean)) {
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (r.party?.role !== "instructor") continue;
    if (r.type === "confirmation" && r.payload?.what === "fact") for (const [id, fh] of Object.entries(r.payload.factHashes || {})) acts.confirmed.set(`${id}|${fh}`, true);
    if (r.type === "divergence" && r.payload?.unit && r.payload?.correction) acts.diverged.set(`${r.payload.unit}|${r.payload.correction}`, true);
  }
  return acts;
}

/** Does this unit carry evidence that counts for its current facts? Each kind is bound to what it vouches for. */
export function hasAdmittedEvidence(u, acts) {
  const fh = factHash(u.text);
  return (u.evidence || []).some((e) => e.factHash === fh && (
    (e.type === "quote-verified" && e.claimsHash === claimsHash(u.text)) ||
    (e.type === "instructor-confirmation" && acts.confirmed.has(`${u.id}|${fh}`)) ||
    (e.type === "authorized-divergence" && acts.diverged.has(`${u.id}|${e.correction}`))));
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
    // the judgment and the role are recomputed from the text and its structure, never trusted from the sidecar
    // (round P7-1, B17; redteam r1 C3-15: a sidecar role set to "framing" un-linked an off-spine paragraph)
    side.units.forEach((u, i) => {
      const text = seg[i]?.text ?? "";
      const judgment = [...new Set([...classifyUnit({ form: seg[i].form, text }), ...(u.judgmentAdded || [])])];
      out.push({ ...u, form: seg[i].form, ...(seg[i].label ? { label: seg[i].label } : {}), judgment, role: derivedRole(seg[i].role, judgment), text });
    });
  }
  return out;
}

function context(root, reader) {
  const chapters = manifestChapters(reader);
  const spine = parseSpine(reader, chapters);
  const units = loadUnits(root, reader);
  const edges = dependencyEdges(units, spine, sourceHashes(reader));
  const hashes = targetHashes(units, spine, sourceHashes(reader));
  return { chapters, spine, units, edges, hashes };
}

function rewriteUnits(root, ids, fn) {
  const want = new Set(ids), done = new Set();
  const dir = recordFile(root, "metadata/units");
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith(".json")) files.push(f); } };
  if (fs.existsSync(dir)) walk(dir);
  for (const f of files) {
    const side = JSON.parse(fs.readFileSync(f, "utf8"));
    let touched = false;
    for (const u of side.units) if (want.has(u.id)) { fn(u); touched = true; done.add(u.id); }
    if (touched) {
      const problems = validateUnitSidecar(side);
      if (problems.length) throw new Error(`refusing an invalid unit sidecar: ${problems[0]}`);
      fs.writeFileSync(f, JSON.stringify(side, null, 2) + "\n");
    }
  }
  const missing = [...want].filter((x) => !done.has(x));
  if (missing.length) throw new Error(`no such unit: ${missing.join(", ")}`);
}

/** Stamp units with the current hashes of their dependencies. */
export function restamp(root, reader, ids) {
  if (!ids.length) return;
  const { edges, hashes } = context(root, reader);
  rewriteUnits(root, ids, (u) => { u.stamp = stampFor(u.id, edges, hashes); delete u.carried; });
}

/**
 * A dependency target the harness added after a unit was stamped (the direction-sensitive `question:` target, P11):
 * when the unit's stamp is otherwise current, the new target is baselined at its current hash — the state a restamp
 * would record. Targets that just changed are never baselined (`except`), so an edit is not silently absorbed.
 */
export function upgradeStamps(root, reader, { except = [] } = {}) {
  const { units, edges, hashes } = context(root, reader), skip = new Set(except), add = new Map();
  for (const u of units) {
    if (!u.stamp || u.carried || staleTargets(u.stamp, hashes).length) continue;
    const full = stampFor(u.id, edges, hashes), missing = Object.keys(full).filter((t) => !(t in u.stamp) && !skip.has(t));
    if (missing.length) add.set(u.id, Object.fromEntries(missing.map((t) => [t, full[t]])));
  }
  if (add.size) rewriteUnits(root, [...add.keys()], (u) => { u.stamp = { ...u.stamp, ...add.get(u.id) }; });
  return add.size;
}

/** Index, then stamp every unit that changed (its author wrote it against the package as it is now). */
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
    u.stamp = stampFor(u.id, edges, hashes); delete u.carried;
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

/** A stable module (or the harness on its behalf) records that it re-checked these units against the current package. */
export function recordVerification(root, reader, ids, { module, basis }) {
  if (!module || module === "agent") throw new Error("a verification names the module that re-checked the units");
  const { edges, hashes } = context(root, reader);
  rewriteUnits(root, ids, (u) => { u.stamp = stampFor(u.id, edges, hashes); delete u.carried; });
  appendLogRecord(root, { type: "revision", party: { role: "harness", name: module }, payload: { event: "units-reverified", units: ids, basis } });
}

/** Units carried into a new major version start as obligations: their evidence and stamps no longer count (D15). */
export function carryUnits(root, ids, { version, scope }, party) {
  if (party?.role !== "instructor") throw new Error("carrying units into a new version follows the instructor's version decision");
  rewriteUnits(root, ids, (u) => { u.evidence = []; delete u.stamp; u.carried = { scope, version }; });
  appendLogRecord(root, { type: "revision", party, payload: { event: "units-carried", scope, version, units: ids } });
}

/**
 * The instructor opens a new major version (D15): the units of its scopes are carried into it, each an open
 * re-verification until checked again. A chapter scope carries that chapter's deliverables; the course scope, all.
 * (P11 wiring sweep: the version was logged with carried: [] and nothing was ever carried.)
 */
export function openVersionCarrying(root, reader, { scopes, reason, instructorWords }, party) {
  if (!String(instructorWords || "").trim()) throw new Error("opening a new major version quotes the instructor's words");
  const units = loadUnits(root, reader);
  const inScope = (sc) => sc === "course" ? units : units.filter((u) => sc.startsWith("chapter:") && u.locator.deliverable.endsWith(`/${sc.slice("chapter:".length)}.md`));
  const r = openMajorVersion(root, { scopes, reason, instructorWords, carried: [...new Set(scopes.flatMap((sc) => inScope(sc).map((u) => u.id)))] }, party);
  for (const sc of scopes) { const ids = inScope(sc).map((u) => u.id); if (ids.length) carryUnits(root, ids, { version: r.payload.to[sc], scope: sc }, party); }
  return r;
}

/** All core obligations (and dangling-link defects) of a package. */
export function coreObligations(root, reader, basis) {
  const { chapters, spine, units, hashes } = context(root, reader);
  const nodes = nodeIndex(spine);
  const acts = loggedInstructorActs(root);
  const reviewed = reviewedAbsolutes(root);
  const F = [];
  const ob = (kind, ids, what) => F.push(makeFinding({ module: "skeleton", kind, units: ids, statusClass: "obligation", route: "agent", basis, evidence: { type: "missing", what } }));
  for (const u of units) {
    const fh = factHash(u.text);
    // an absolute statement is reviewed by an agent that reads its context (D30; any unit, whatever its judgment kind)
    if (!acts.confirmed.has(`${u.id}|${fh}`) && absoluteSentences(u.text).length && !reviewed.has(`${u.id}|${absolutesHash(u.text)}`))
      ob("absolute-unreviewed", [u.id], `a context review of the absolute statement(s) in ${u.id} (${u.locator.deliverable}): node scripts/verify.mjs absolutes`);
    if (needsEvidence(u) && !hasAdmittedEvidence(u, acts))
      ob("evidence-missing", [u.id], `admitted evidence for the facts stated in ${u.id} (${u.locator.deliverable})`);
    if (u.role === "teaching" && !(u.spineNodes || []).length) ob("unit-unlinked", [u.id], `a spine link for ${u.id} (${u.locator.deliverable}, ${u.locator.section})`);
    // a guide entry prescribes questions: it is what a question (and its answer) serves, not what a passage teaches
    // (redteam r1 C3-05: an off-spine paragraph linked only to a guide entry passed as linked)
    else if (u.role === "teaching" && !["question", "answer"].includes(u.form) && (u.spineNodes || []).every((n) => n.startsWith("guide.")))
      ob("unit-unlinked", [u.id], `a link to the objective or concept that ${u.id} (${u.locator.deliverable}, ${u.locator.section}) teaches: a guide entry is for questions`);
    const dangling = (u.spineNodes || []).filter((n) => !nodes.has(n));
    if (dangling.length) F.push(makeFinding({ module: "skeleton", kind: "unit-link-dangling", units: [u.id], statusClass: "defect", route: "agent", basis, evidence: { type: "rule", rule: "a unit links only to existing spine nodes", dangling } }));
    if (u.carried) ob("carried-unverified", [u.id], `re-verification of ${u.id} in ${u.carried.scope} version ${u.carried.version}`);
    else if (u.stamp) {
      const moved = staleTargets(u.stamp, hashes);
      if (moved.length) {
        ob("reverify", [u.id], `re-verification of ${u.id}: ${moved.join(", ")} changed since it was written`);
        // an answer whose question changed: only the instructor (or a re-written answer) can say it still holds. The
        // check recommends nothing: "accept all" must not confirm an answer nobody re-read (P11 K4 scenario). The agent
        // re-reads the answer with its question (verify knowledge) and recommends.
        if (u.form === "answer" && moved.some((t) => units.some((x) => (`unit:${x.id}` === t || `question:${x.id}` === t) && x.form === "question")))
          F.push(makeFinding({ module: "skeleton", kind: "answer-still-correct", units: [u.id], statusClass: "question", route: "digest", basis,
            evidence: { type: "judgment", note: `${u.id}: its question changed — is the answer still correct as written? (the agent re-reads it with its question and recommends)` } }));
      }
    }
  }
  for (const ch of chapters) {
    const s = spine.chapters[ch];
    for (const o of s.map.nodes.filter((n) => n.kind === "objective" && n.id))
      if (!units.some((u) => teachesInDeliverable(u, o.id))) ob("objective-uncovered", [], `a teaching unit (study guide or slides) that serves ${o.id}`);
    const assigned = guideAssignment(s.guide.entries, units);
    for (const e of s.guide.entries.filter((x) => x.id)) {
      const got = assigned.get(e.id) || [], linked = units.filter((u) => u.form === "question" && (u.spineNodes || []).includes(e.id));
      if (got.length < (Number.isInteger(e.count) ? e.count : 0))
        ob("guide-entry-short", linked.map((u) => u.id), `${e.count - got.length} more question(s) for ${e.id} (has ${got.length} of ${e.count})`); // only practice questions count, each toward one entry
    }
  }
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
