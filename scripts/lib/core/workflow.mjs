// Chapter states, transitions and the publish decision (redesign P8; skeleton §2, §7; D10, D15, D16, Q16).
//   DRAFT ──assemble──▶ ASSEMBLING ──approve──▶ PACKAGE ──publish──▶ (a PUBLISHED snapshot; the chapter stays PACKAGE)
//     ▲                    │                       │
//     └──── back to draft ─┘◀── reassemble / back to draft, only after a structural change opened a new version
// A chapter's state is derived from the decision log: its transition records, and its approvals (an approval moves an
// ASSEMBLING chapter to PACKAGE). A chapter with no record at all is DRAFT, unless it was approved before states were
// recorded (a package migrated from v0.12), in which case it is PACKAGE.
import fs from "node:fs";
import path from "node:path";
import { sha256, canonicalJson } from "../records/canonical.mjs";
import { appendLogRecord, parseLog, readLogText, verifyLog } from "../records/log.mjs";
import { readSteering } from "../records/steering.mjs";
import { recordFile } from "../records/paths.mjs";
import { approvalStatus } from "./approvals.mjs";
import { manifestChapters } from "./package_reader.mjs";
import { checkSpine, parseSpine, spinePaths } from "./spine.mjs";
import { currentVersion, versionOpenedAt } from "./versions.mjs";
import { answeredBases, basisOf } from "./digest.mjs";
import { deliverablesOf, readSidecar } from "./units_index.mjs";

/** Unit id → { deliverable, contentHash }, from the unit sidecars. */
export function unitInfoOf(root, reader) {
  const out = new Map();
  for (const rel of deliverablesOf(reader)) for (const u of readSidecar(root, rel)?.units || []) out.set(u.id, { deliverable: rel, contentHash: u.locator.contentHash });
  return out;
}

export const STATES = Object.freeze(["DRAFT", "ASSEMBLING", "PACKAGE"]);
const scope = (ch) => `chapter:${ch}`;

function records(logText) { return verifyLog(logText).length ? [] : parseLog(logText); }

/** Every chapter's state: { [slug]: { state, since, version, approved } }. */
export function chapterStates(root, reader) {
  const logText = readLogText(root);
  const recs = records(logText);
  const chapters = manifestChapters(reader);
  const approvals = approvalStatus(reader, chapters, logText).scopes;
  const out = {};
  for (const ch of chapters) {
    let state = null, since = 0;
    for (const r of recs) {
      if (r.type === "transition" && r.payload?.chapter === ch && STATES.includes(r.payload?.to)) { state = r.payload.to; since = r.seq; }
      if (r.type === "approval" && r.party?.role === "instructor" && r.payload?.scope === scope(ch) && (state === "ASSEMBLING" || state === null)) { state = "PACKAGE"; since = r.seq; }
    }
    out[ch] = { state: state || "DRAFT", since, version: currentVersion(logText, scope(ch)), approved: !!approvals[ch]?.valid };
  }
  return out;
}

/** Why a chapter cannot move to `to` (empty when it can). */
export function transitionProblems(root, reader, ch, to) {
  const states = chapterStates(root, reader);
  const s = states[ch];
  if (!s) return [`${ch} is not a chapter of this package (alembic.json)`];
  const logText = readLogText(root);
  const lastApproval = records(logText).filter((r) => r.type === "approval" && r.payload?.scope === scope(ch)).at(-1)?.seq || 0;
  const broke = versionOpenedAt(logText, scope(ch)) > lastApproval && lastApproval > 0;
  const p = [];
  if (to === "ASSEMBLING") {
    if (s.state === "ASSEMBLING") p.push(`${ch} is already assembling`);
    if (s.state === "PACKAGE" && !broke) p.push(`${ch} is a package; it is re-assembled only after a structural change opens a new version (node scripts/spine.mjs version)`);
    if (!readSteering(root)) p.push("steering is not recorded yet: run the steering intake first (node scripts/spine.mjs steering)");
    const { map, guide } = spinePaths(ch);
    if (reader.text(map) == null || reader.text(guide) == null) p.push(`${ch} needs its concept map (${map}) and assessment guide (${guide}) before it can be assembled`);
    else {
      const all = manifestChapters(reader), { map: m2, guide: g2 } = spinePaths(ch);
      const bad = checkSpine(parseSpine(reader, all), all).filter((x) => [m2, g2].includes(x.file));
      if (bad.length) p.push(`${ch}'s spine is not well formed: ${bad[0].detail || bad[0].rule} (node scripts/spine.mjs check)`);
    }
  } else if (to === "DRAFT") {
    if (s.state === "DRAFT") p.push(`${ch} is already a draft`);
    if (s.state === "PACKAGE" && !broke) p.push(`${ch} is a package; it goes back to draft only after a structural change opens a new version`);
  } else if (to === "PACKAGE") p.push("a chapter becomes a package by the instructor's approval of its spine (approve), not by a transition");
  else p.push(`unknown state ${to}`);
  return p;
}

/** The instructor moves a chapter (assemble, back to draft). */
export function transition(root, reader, { chapter, to, instructorWords }, party) {
  if (party?.role !== "instructor") throw new Error("a chapter changes mode by the instructor's word (assemble / back to draft)");
  if (!String(instructorWords || "").trim()) throw new Error("a transition quotes the instructor's words");
  const p = transitionProblems(root, reader, chapter, to);
  if (p.length) throw new Error(p.join("; "));
  const from = chapterStates(root, reader)[chapter].state;
  return appendLogRecord(root, { type: "transition", party, payload: { chapter, from, to, instructorWords } });
}

// ---- which findings belong to which chapter ---------------------------------------------------------------------
const DELIVERABLE = /^(?:study-guide|slides|practice|concepts|assessment-support)\/([^/]+)\.md$/;
/** The chapter a finding concerns, or null when it concerns the whole package. */
export function chapterOfFinding(f, unitDeliverable) {
  const chs = new Set();
  for (const u of f.units || []) {
    const d = unitDeliverable.get(u);
    const m = d && d.match(DELIVERABLE);
    if (m) chs.add(m[1]);
    const anchor = String(u).match(/^(?:objective|concept|guide|misconception|term)\.([^.]+)\./);
    if (anchor) chs.add(anchor[1]);
  }
  for (const v of [f.evidence?.file, f.evidence?.what, f.evidence?.path].filter((x) => typeof x === "string")) {
    for (const m of v.matchAll(/(?:study-guide|slides|practice|concepts|assessment-support)\/([a-z0-9-]+)\.md/g)) chs.add(m[1]);
    for (const m of v.matchAll(/\b(?:objective|concept|guide|misconception|term)\.([a-z0-9-]+)\./g)) chs.add(m[1]); // a spine anchor names its chapter
  }
  return chs.size === 1 ? [...chs][0] : chs.size ? [...chs] : null;
}

/**
 * Which chapters may be published (skeleton §7): PACKAGE, with a valid approval, and no open defect or obligation
 * that concerns the chapter or the whole package. Returns { chapters: {slug: {publishable, why[]}}, course }.
 */
export function eligibility(root, reader, gateResult, unitDeliverable) {
  const states = chapterStates(root, reader);
  const approvals = approvalStatus(reader, Object.keys(states), readLogText(root)).scopes;
  const blocking = gateResult.gate.blocking;
  const packageWide = blocking.filter((f) => chapterOfFinding(f, unitDeliverable) === null);
  const out = {};
  for (const [ch, s] of Object.entries(states)) {
    const why = [];
    if (s.state !== "PACKAGE") why.push(`it is in ${s.state}`);
    if (!s.approved) why.push(`its spine approval is not valid (${approvals[ch]?.change?.kind || "unapproved"})`);
    const mine = blocking.filter((f) => { const c = chapterOfFinding(f, unitDeliverable); return c === ch || (Array.isArray(c) && c.includes(ch)); });
    if (mine.length) why.push(`${mine.length} open defect(s) or obligation(s) of its own (${[...new Set(mine.map((f) => f.kind))].slice(0, 4).join(", ")})`);
    if (packageWide.length) why.push(`${packageWide.length} open package-wide defect(s) or obligation(s) (${[...new Set(packageWide.map((f) => f.kind))].slice(0, 4).join(", ")})`);
    out[ch] = { publishable: !why.length, why, state: s.state, version: s.version };
  }
  return { chapters: out, course: { publishable: !!approvals.course?.valid, why: approvals.course?.valid ? [] : [`the course map is not approved (${approvals.course?.change?.kind || "unapproved"})`] } };
}

// ---- the publish decision (M6) ------------------------------------------------------------------------------------
const VOLATILE = (rel) => rel === "metadata/LOG.jsonl" || rel.startsWith("metadata/publish/") || rel === "metadata/FINDINGS.json" || rel.startsWith("metadata/digest/") || rel.startsWith(".git/") || rel === ".git";
/** The content a publish binds: every package file except the records that change because of the publish itself. */
export function publishContentHash(root) {
  const files = [];
  const walk = (d, rel = "") => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (VOLATILE(r)) continue;
    if (e.isDirectory()) walk(path.join(d, e.name), r); else if (e.isFile()) files.push([r, sha256(fs.readFileSync(path.join(d, e.name)))]);
  } };
  walk(root);
  return sha256(canonicalJson(files));
}

/**
 * The instructor's publish decision. Publishes only the eligible chapters; the course map only with its own valid
 * approval. Records the content hash, the approvals relied on, the open questions, and what was left out and why.
 * A private package may also carry draft chapters, marked as drafts and outside the package promises (Q16).
 */
export function publishDecision(root, reader, { gateResult, unitInfo, instructorWords, chapters: wanted = null, includeDrafts = false }, party) {
  const unitDeliverable = new Map([...unitInfo].map(([k, v]) => [k, v.deliverable])), unitHash = new Map([...unitInfo].map(([k, v]) => [k, v.contentHash]));
  if (party?.role !== "instructor") throw new Error("publishing is the instructor's decision (M6)");
  if (!String(instructorWords || "").trim()) throw new Error("a publish decision quotes the instructor's words");
  const el = eligibility(root, reader, gateResult, unitDeliverable);
  const asked = wanted || Object.keys(el.chapters);
  const unknown = asked.filter((c) => !el.chapters[c]);
  if (unknown.length) throw new Error(`not chapters of this package: ${unknown.join(", ")}`);
  const included = asked.filter((c) => el.chapters[c].publishable);
  if (!included.length) throw new Error(`no chapter can be published: ${asked.map((c) => `${c} — ${el.chapters[c].why.join("; ")}`).join(" | ")}`);
  if (includeDrafts && gateResult.profile !== "private") throw new Error("draft chapters may be shared only in a private package; a public publish never includes a draft");
  const drafts = includeDrafts ? asked.filter((c) => el.chapters[c].state === "DRAFT") : [];
  const logText = readLogText(root);
  const recs = records(logText);
  const approvalOf = (sc) => { const r = recs.filter((x) => (x.type === "approval" || x.type === "glance-confirmation") && x.payload?.scope === sc).at(-1); return r ? { seq: r.seq, hash: r.hash, type: r.type } : null; };
  const answered = answeredBases(root);
  const openQuestions = gateResult.gate.questions.filter((f) => !answered.has(`${f.id}|${basisOf(f, unitHash)}`)).map((f) => ({ id: f.id, module: f.module, kind: f.kind, units: f.units }));
  const payload = {
    profile: gateResult.profile, contentHash: publishContentHash(root), gateBasis: gateResult.basis,
    chapters: included.map((c) => ({ chapter: c, version: el.chapters[c].version, approval: approvalOf(scope(c)) })),
    course: el.course.publishable ? { approval: approvalOf("course") } : null,
    excluded: asked.filter((c) => !included.includes(c) && !drafts.includes(c)).map((c) => ({ chapter: c, why: el.chapters[c].why })),
    drafts: drafts.map((c) => ({ chapter: c, note: "a draft: outside the package promises, private use only" })),
    openQuestions, instructorWords,
  };
  const rec = appendLogRecord(root, { type: "publish", party, payload });
  fs.mkdirSync(recordFile(root, "metadata/publish"), { recursive: true });
  fs.writeFileSync(recordFile(root, `metadata/publish/${String(rec.seq).padStart(4, "0")}.json`), JSON.stringify({ seq: rec.seq, at: rec.at, by: party.name, ...payload }, null, 2) + "\n");
  return { seq: rec.seq, ...payload };
}

/** The latest publish decision, and whether the package still matches it. */
export function latestPublish(root) {
  const r = records(readLogText(root)).filter((x) => x.type === "publish" && x.party?.role === "instructor").at(-1);
  if (!r) return null;
  return { seq: r.seq, ...r.payload, current: r.payload.contentHash === publishContentHash(root) };
}
