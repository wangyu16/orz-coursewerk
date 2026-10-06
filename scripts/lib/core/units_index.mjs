// The unit index (redesign P4; F1, D18, D19-E, D20): segment every deliverable, keep unit ids stable across edits,
// record each unit's origin, and tell the agent's own edits from edits of unknown authorship.
//
// AGENT SESSIONS. Before writing, the agent runs `begin` (a log record capturing the hash of every unit as it stood).
// After writing, `index --as agent` attributes to the agent only the units that changed DURING the session; a unit
// whose text already differed from the last index when the session began was changed by someone else — an edit of
// unknown authorship, raised once as a question. Without --as, every changed unit is of unknown authorship. The
// conservative direction is deliberate: an instructor's edit may be checked as agent text, never the reverse.
//
// IDENTITY. Old and new units are matched: (1) same normalized text → same id, wherever it moved; (2) within the same
// section and form, a close rewording (token overlap ≥ 0.5) → same id; (3) a new unit mostly contained in an old one,
// with siblings, records a split; a new unit covering several old ones records a merge; (4) the rest are new ids,
// and unmatched old units are retired (logged).
import fs from "node:fs";
import path from "node:path";
import { appendLogRecord, parseLog, readLogText, verifyLog } from "../records/log.mjs";
import { unitsPathFor, recordFile } from "../records/paths.mjs";
import { validateUnitSidecar } from "../records/units.mjs";
import { makeFinding } from "../records/findings.mjs";
import { DELIVERABLE_DIRS, classifyUnit, derivedRole, segmentDeliverable, slugify, tokensOf, unitHash } from "./segment.mjs";
import { manifestChapters } from "./package_reader.mjs";
import { upgradeStamps } from "./obligations.mjs";

export function deliverablesOf(reader) {
  return manifestChapters(reader).flatMap((ch) => DELIVERABLE_DIRS.map((d) => `${d}/${ch}.md`)).filter((rel) => reader.text(rel) != null);
}

export function readSidecar(root, deliverable) {
  const f = recordFile(root, unitsPathFor(deliverable));
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
}
function writeSidecar(root, sidecar) {
  const problems = validateUnitSidecar(sidecar);
  if (problems.length) throw new Error(`refusing an invalid unit sidecar for ${sidecar.deliverable}: ${problems[0]}`);
  const f = recordFile(root, unitsPathFor(sidecar.deliverable));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(sidecar, null, 2) + "\n");
}

const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); let n = 0; for (const x of A) if (B.has(x)) n++; return n / Math.max(1, A.size + B.size - n); };
const contained = (inner, outer) => { const O = new Set(outer); return inner.filter((x) => O.has(x)).length / Math.max(1, inner.length); };

/** Match new segments to old units. Returns { assigned: Map(newIndex → oldUnit), splits, merges, retired }. */
export function matchUnits(oldUnits, segs) {
  const assigned = new Map(), usedOld = new Set(), usedNew = new Set();
  const segTokens = segs.map((s) => tokensOf(s.text)), segHash = segs.map((s) => unitHash(s.text));
  // 1. exact text, wherever it moved
  segs.forEach((s, i) => { const o = oldUnits.find((u) => !usedOld.has(u.id) && u.locator.contentHash === segHash[i]); if (o) { assigned.set(i, o); usedOld.add(o.id); usedNew.add(i); } });
  // 1b. edits in place: same position, form and section, real overlap — the commonest edit, so it is matched before
  // splits and merges, which otherwise pair look-alike answers across a section (P10 scenario)
  segs.forEach((s, i) => {
    if (usedNew.has(i)) return;
    const o = oldUnits.find((u) => !usedOld.has(u.id) && u.form === s.form && u.locator.section === s.section && u.locator.ordinal === i && jaccard(u.tokens || [], segTokens[i]) >= 0.3);
    // …unless the old unit lives on across this segment and the next: that is a split, left to step 2
    const splitHere = o && segs[i + 1] && !usedNew.has(i + 1) && segs[i + 1].section === s.section && contained(segTokens[i + 1], o.tokens || []) >= 0.6 && contained(segTokens[i], o.tokens || []) >= 0.6 && contained(o.tokens || [], [...segTokens[i], ...segTokens[i + 1]]) >= 0.6;
    if (o && !splitHere) { assigned.set(i, o); usedOld.add(o.id); usedNew.add(i); }
  });
  // 2. splits and merges, before rewordings (a split's first half would otherwise pass as a rewording)
  const splits = [], merges = [];
  for (const u of oldUnits.filter((x) => !usedOld.has(x.id))) {
    const cand = segs.map((_, i) => i).filter((i) => !usedNew.has(i) && segs[i].section === u.locator.section && segs[i].form === u.form && segTokens[i].length && contained(segTokens[i], u.tokens || []) >= 0.6);
    // a split's pieces are consecutive units at the old unit's place, not look-alikes elsewhere in the section
    // (many short answers share their words: P10 scenario)
    const near = cand.filter((i) => Math.abs(i - u.locator.ordinal) <= cand.length + 1);
    const parts = near.filter((i, k) => k === 0 || i === near[k - 1] + 1 || i === near[k - 1] + 2);
    if (parts.length >= 2 && contained(u.tokens || [], parts.flatMap((i) => segTokens[i])) >= 0.6) { splits.push({ from: u.id, into: parts }); usedOld.add(u.id); parts.forEach((i) => usedNew.add(i)); }
  }
  segs.forEach((s, i) => {
    if (usedNew.has(i)) return;
    const parents = oldUnits.filter((u) => !usedOld.has(u.id) && u.locator.section === s.section && (u.tokens || []).length && contained(u.tokens || [], segTokens[i]) >= 0.6)
      .filter((u, _, all) => all.some((v) => v !== u && Math.abs(v.locator.ordinal - u.locator.ordinal) === 1) && Math.abs(u.locator.ordinal - i) <= 2); // adjacent, at this place
    if (parents.length >= 2) { merges.push({ into: i, from: parents.map((u) => u.id) }); parents.forEach((u) => usedOld.add(u.id)); usedNew.add(i); }
  });
  // 3. rewordings: same section and form, token overlap ≥ 0.5
  segs.forEach((s, i) => {
    if (usedNew.has(i)) return;
    let best = null, score = 0.5;
    for (const u of oldUnits) {
      if (usedOld.has(u.id) || u.form !== s.form || u.locator.section !== s.section) continue;
      const j = jaccard(u.tokens || [], segTokens[i]);
      if (j >= score) { best = u; score = j; }
    }
    if (best) { assigned.set(i, best); usedOld.add(best.id); usedNew.add(i); }
  });
  const consumed = [...splits.map((x) => x.from), ...merges.flatMap((m) => m.from)];
  const retired = oldUnits.filter((u) => !usedOld.has(u.id)).map((u) => u.id);
  return { assigned, splits, merges, retired, consumed };
}

function mintId(deliverable, section, taken) {
  const base = `u-${slugify(deliverable.replace(/\.md$/, "").replace(/\//g, "-"))}-${slugify(section)}`.slice(0, 70).replace(/-+$/, "");
  let n = 1; while (taken.has(`${base}-${n}`)) n++;
  const id = `${base}-${n}`; taken.add(id); return id;
}

/** The latest agent session (a verifying log's last `revision` record with event agent-session-begin, not closed). */
export function openSession(logText) {
  if (verifyLog(logText).length) return null;
  const recs = parseLog(logText).filter((r) => r.type === "revision" && ["agent-session-begin", "agent-session-end"].includes(r.payload?.event));
  const last = recs[recs.length - 1];
  return last && last.payload.event === "agent-session-begin" ? last : null;
}

export function beginSession(root, reader, party, { step = "authoring" } = {}) {
  if (party?.role !== "agent") throw new Error("a session belongs to the agent that will write");
  try { upgradeStamps(root, reader); } catch { /* an unindexed or partial package: indexing reports it */ }
  const baseline = {};
  for (const rel of deliverablesOf(reader)) baseline[rel] = segmentDeliverable(reader.text(rel), rel).units.map((s) => unitHash(s.text));
  return appendLogRecord(root, { type: "revision", party, payload: { event: "agent-session-begin", step, baseline } });
}

/**
 * Index every deliverable. `as`: "agent" (requires an open session) or null. `origins`: optional map from a new
 * unit's content hash to an explicit origin (e.g. source-derived with its span). Returns findings and a summary.
 */
export function indexUnits(root, reader, { as = null, party = null, origins = {}, initialOrigin = null, date = new Date().toISOString().slice(0, 10) } = {}) {
  const logText = readLogText(root);
  const session = as === "agent" ? openSession(logText) : null;
  if (as === "agent" && !session) throw new Error("index --as agent needs an open agent session: run `units begin` before writing");
  if (as === "agent" && party?.role !== "agent") throw new Error("--as agent needs the agent party (with its model)");
  if (initialOrigin) {
    if (!party || !["instructor", "agent"].includes(party.role)) throw new Error("an initial origin is a statement by the instructor or the agent");
    if (party.role === "agent" && initialOrigin.kind !== "agent-knowledge") throw new Error("the agent can only state that pre-existing text was agent-written");
    appendLogRecord(root, { type: "authorship-confirmation", party, payload: { initial: true, origin: initialOrigin } });
  }
  const findings = [], summary = { deliverables: 0, units: 0, kept: 0, reworded: 0, new: 0, retired: 0, splits: 0, merges: 0, agent: 0, unknown: 0 };
  const retiredAll = [], changedIds = [];
  for (const rel of deliverablesOf(reader)) {
    const text = reader.text(rel);
    const seg = segmentDeliverable(text, rel).units;
    const old = readSidecar(root, rel)?.units || [];
    const m = matchUnits(old, seg);
    const taken = new Set(old.map((u) => u.id));
    const baseline = new Set(session?.payload.baseline?.[rel] || []);
    const units = seg.map((s, i) => {
      const prev = m.assigned.get(i);
      const hash = unitHash(s.text);
      const changed = !prev || prev.locator.contentHash !== hash;
      let origin = prev?.origin;
      if (changed) {
        const beforeSession = session && baseline.has(hash) && !old.some((u) => u.locator.contentHash === hash);
        if (as === "agent" && !beforeSession) {
          // the agent revising the instructor's text keeps the instructor's credit, with the revision on record
          // (operator, 2026-10-02: "keep crediting me is fine")
          if (!origins[hash] && prev?.origin?.kind === "instructor-authored")
            origin = { ...prev.origin, revisedBy: [...(prev.origin.revisedBy || []), { model: party.model, step: session.payload.step, date }] };
          else origin = origins[hash] || { kind: "agent-knowledge", model: party.model, step: session.payload.step, date };
          summary.agent++;
        }
        else if (!old.length && initialOrigin) origin = initialOrigin;
        else { origin = origins[hash] || { kind: "unknown" }; if (origin.kind === "unknown") summary.unknown++; }
      }
      const split = m.splits.find((x) => x.into.includes(i)), merge = m.merges.find((x) => x.into === i);
      // the pieces of a split, and a merge, keep the spine links of what they came from
      const inherited = !prev ? [...new Set([split?.from, ...(merge?.from || [])].filter(Boolean).flatMap((id) => old.find((o) => o.id === id)?.spineNodes || []))] : null;
      const id = prev?.id || mintId(rel, s.section, taken);
      if (prev && prev.locator.contentHash === hash) summary.kept++; else if (prev) summary.reworded++; else summary.new++;
      if (changed) changedIds.push(id);
      const classified = classifyUnit(s);
      const added = (prev?.judgmentAdded || []).filter((k) => !classified.includes(k));
      const judgment = [...new Set([...classified, ...added])];
      const role = derivedRole(s.role, judgment); // framing may not carry facts (D19-I)
      return {
        id, locator: { deliverable: rel, section: s.section, ordinal: i, contentHash: hash, lines: [s.startLine, s.endLine] },
        form: s.form, role, origin, spineNodes: prev?.spineNodes || inherited || [], judgment, ...(added.length ? { judgmentAdded: added } : {}),
        // evidence is bound to fact tokens (P5), so it survives a rephrase; obligations.mjs decides what still counts
        evidence: prev?.evidence || [], ...(prev?.stamp ? { stamp: prev.stamp } : {}), ...(prev?.carried ? { carried: prev.carried } : {}), tokens: tokensOf(s.text),
        ...(split ? { splitFrom: split.from } : {}), ...(merge ? { mergedFrom: merge.from } : {}),
      };
    });
    summary.splits += m.splits.length; summary.merges += m.merges.length; summary.retired += m.retired.length + m.consumed.length;
    retiredAll.push(...m.retired, ...m.consumed);
    writeSidecar(root, { schemaVersion: 1, deliverable: rel, units });
    summary.deliverables++; summary.units += units.length;
    // one question per deliverable, listing every unit of unknown authorship in it (clustered by root cause, D8)
    const unknown = units.filter((x) => x.origin.kind === "unknown" && !x.origin.namedAuthor);
    if (unknown.length)
      findings.push(makeFinding({ module: "skeleton", kind: "unit-unknown-authorship", units: unknown.map((u) => u.id), statusClass: "question", route: "digest",
        evidence: { type: "judgment", note: `${rel}: ${unknown.length} passage(s) changed outside an agent session — yours (accept as mine), someone else's (name them), or revert?`, hashes: unknown.map((u) => u.locator.contentHash) },
        recommendation: "accept as mine", basis: unknown.map((u) => u.locator.contentHash).join(",") }));
  }
  if (as === "agent") appendLogRecord(root, { type: "revision", party, payload: { event: "agent-session-end", summary } });
  if (retiredAll.length) appendLogRecord(root, { type: "unit-retirement", party: party || { role: "harness", name: "units index" }, payload: { units: retiredAll } });
  return { findings, summary, changedIds };
}

/** The instructor claims authorship of units of unknown authorship (accept as mine) — D20. */
export function claimAuthorship(root, { units, as = "instructor", instructorWords }, party) {
  if (party?.role !== "instructor") throw new Error("authorship is confirmed by the instructor");
  if (!String(instructorWords || "").trim()) throw new Error("an authorship confirmation quotes the instructor's words");
  const ids = new Set(units), date = new Date().toISOString().slice(0, 10), done = [];
  for (const rel of fs.existsSync(recordFile(root, "metadata/units")) ? walkSidecars(recordFile(root, "metadata/units")) : []) {
    const side = JSON.parse(fs.readFileSync(rel, "utf8"));
    let touched = false;
    for (const u of side.units) if (ids.has(u.id)) {
      if (u.origin.kind !== "unknown") throw new Error(`${u.id} is not of unknown authorship`);
      u.origin = as === "instructor" ? { kind: "instructor-authored", instructor: party.name, date } : { kind: "unknown", namedAuthor: as };
      done.push(u.id); touched = true;
    }
    if (touched) writeSidecar(root, side);
  }
  const missing = units.filter((u) => !done.includes(u));
  if (missing.length) throw new Error(`no such unit: ${missing.join(", ")}`);
  appendLogRecord(root, { type: "authorship-confirmation", party, payload: { units: done, as, instructorWords } });
  return done;
}
function walkSidecars(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walkSidecars(f, out); else if (e.name.endsWith(".json")) out.push(f);
  }
  return out;
}

/** Core check (V2): a deliverable whose units no longer match their sidecar has edits not yet indexed. */
export function unindexedFindings(root, reader, basis) {
  const out = [];
  for (const rel of deliverablesOf(reader)) {
    const side = readSidecar(root, rel);
    const now = segmentDeliverable(reader.text(rel), rel).units.map((s) => unitHash(s.text));
    const then = (side?.units || []).map((u) => u.locator.contentHash);
    if (!side || JSON.stringify(now) !== JSON.stringify(then))
      out.push(makeFinding({ module: "skeleton", kind: "units-not-indexed", units: [], statusClass: "obligation", route: "agent", basis,
        evidence: { type: "missing", what: `an up-to-date unit index for ${rel} (run units index)` } }));
    // an edit of unknown authorship stays a digest question until the instructor answers it (D20) — raised from the
    // index itself, so it reaches every digest, not only the index run that found it (T3 scenario, P8)
    const unknown = (side?.units || []).filter((x) => x.origin?.kind === "unknown" && !x.origin.namedAuthor);
    if (unknown.length)
      out.push(makeFinding({ module: "skeleton", kind: "unit-unknown-authorship", units: unknown.map((u) => u.id), statusClass: "question", route: "digest",
        evidence: { type: "judgment", note: `${rel}: ${unknown.length} passage(s) changed outside an agent session — yours (accept as mine), someone else's (name them), or revert?`, hashes: unknown.map((u) => u.locator.contentHash) },
        recommendation: "accept as mine", basis }));
  }
  return out;
}
