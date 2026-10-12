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
//
// WHAT A RETIRED UNIT OWED IS NOT FORGOTTEN (red team R2 coherence, F1, F2, F14). A retired unit's record — its
// stamp (so staleness that lives only in the stamp), what it owes, its version carry, links, origin and evidence — is
// kept in its deliverable's sidecar (`retired`, the retired-unit register). A text that comes back byte for byte, in
// any deliverable, or nearly (same form, token overlap ≥ 0.5, in any deliverable — its own first: red team R3 F4),
// takes back its old id and its whole record. A new text in any deliverable that is a piece of a retired unit, or that
// covers one, inherits its stamp, owes and carry, as the pieces of a split and a merge do. A retired id is never minted again for other text. So a placeholder round trip, a
// blank-and-restore, or a split leaves every obligation where it was.
import fs from "node:fs";
import path from "node:path";
import { appendLogRecord, parseLog, readLogText, verifyLog } from "../records/log.mjs";
import { sha256 } from "../records/canonical.mjs";
import { unitsPathFor, recordFile } from "../records/paths.mjs";
import { JUDGMENT_KINDS, validateUnitSidecar } from "../records/units.mjs";
import { makeFinding } from "../records/findings.mjs";
import { DELIVERABLE_DIRS, classifyUnit, creditBaseline, creditKey, derivedRole, headingsKey, labelBaseline, segmentDeliverable, slugify, tokensOf, unitHash } from "./segment.mjs";
import { manifestChapters } from "./package_reader.mjs";
import { loadUnits, migrateUnitRecords, upgradeStamps } from "./obligations.mjs";
import { allSidecars, assertUnaltered, upgradeUnitRecordDigests, writeUnitRecords } from "./unit_records.mjs";
import { reconcileUnitRecords } from "./reconcile.mjs";
import { confirmedAuthorship, holdersOf, inheritedOrigin, instructorAuthored, instructorCredit, instructorTextRegister, originIndex, textIds } from "./authorship.mjs";

export function deliverablesOf(reader) {
  const chapters = manifestChapters(reader).flatMap((ch) => DELIVERABLE_DIRS.map((d) => `${d}/${ch}.md`));
  return [...chapters, ...declaredDocuments(reader)].filter((rel, i, all) => reader.text(rel) != null && all.indexOf(rel) === i);
}
/**
 * D42: everything that ships is checked. A document declared in metadata/DOCUMENTS.json (a handout, a print
 * document) is a deliverable like the study guide — segmented, linked, fact-checked and reviewed — unless the
 * instructor marks it `role: administrative` (a schedule, a syllabus), which keeps only the format and rights checks.
 * The mark is the INSTRUCTOR's act (red team round 2, C3-06): `role: administrative` in DOCUMENTS.json is a field
 * anyone can write, so it exempts a document only while a logged instructor confirmation of that role, quoting their
 * words, names the document at its current content (confirmAdministrative); otherwise the document is a deliverable.
 */
export function declaredDocuments(reader) {
  const admin = administrativeDocuments(reader);
  return documentEntries(reader).filter((d) => !admin.has(d.source)).map((d) => d.source);
}
/** The documents DOCUMENTS.json declares: { source, role, chapters } (markdown sources inside the package, private/ excluded). */
export function documentEntries(reader) {
  let docs = null; try { docs = JSON.parse(reader.text("metadata/DOCUMENTS.json") || "null"); } catch { docs = null; }
  return (Array.isArray(docs?.documents) ? docs.documents : []).filter((d) => d && typeof d === "object")
    .map((d) => ({ source: String(d.source || d.path || ""), role: d.role || null, chapters: [...new Set([d.chapter, ...(Array.isArray(d.chapters) ? d.chapters : [])].filter((c) => typeof c === "string" && c))] })).filter((d) => /\.md$/.test(d.source) && !d.source.startsWith("private/") && !d.source.includes(".."));
}
const docHash = (text) => sha256(String(text ?? ""));
/** Declared documents the instructor confirmed as administrative, at their current content (source paths). */
export function administrativeDocuments(reader) {
  const marked = documentEntries(reader).filter((d) => d.role === "administrative");
  if (!marked.length) return new Set();
  const logText = reader.text("metadata/LOG.jsonl") || "";
  if (verifyLog(logText).length) return new Set();
  const confirmed = new Set(parseLog(logText).filter((r) => r.type === "confirmation" && r.party?.role === "instructor" && r.payload?.what === "administrative-document" && String(r.payload?.instructorWords || "").trim())
    .map((r) => `${r.payload.source}|${r.payload.contentHash}`));
  return new Set(marked.filter((d) => confirmed.has(`${d.source}|${docHash(reader.text(d.source))}`)).map((d) => d.source));
}
/** The instructor confirms that a declared document is administrative (a schedule, a syllabus): it keeps only the
 *  format and rights checks while its content stays as confirmed (an edit makes it a deliverable again). */
export function confirmAdministrative(root, reader, { source, instructorWords }, party) {
  if (party?.role !== "instructor") throw new Error("marking a document administrative is the instructor's act");
  if (!String(instructorWords || "").trim()) throw new Error("the confirmation quotes the instructor's words");
  const d = documentEntries(reader).find((x) => x.source === source);
  if (!d) throw new Error(`${source} is not a document declared in metadata/DOCUMENTS.json`);
  if (d.role !== "administrative") throw new Error(`${source} is not marked role: administrative in metadata/DOCUMENTS.json`);
  const text = reader.text(source);
  if (text == null) throw new Error(`${source} does not exist`);
  return appendLogRecord(root, { type: "confirmation", party, payload: { what: "administrative-document", source, contentHash: docHash(text), instructorWords } });
}

/** id → origin of every unit the package's sidecars record, live or retired (authorship.mjs: whose text it is) — every
 *  sidecar on disk, a record left at a path no longer listed included (R6 G1: identity follows the text, not the path). */
export function packageAncestry(root, reader) {
  const listed = deliverablesOf(reader).map((rel) => readSidecar(root, rel)), disk = allSidecars(root);
  return originIndex([...listed, ...Object.entries(disk).filter(([rel]) => !deliverablesOf(reader).includes(rel)).map(([, side]) => side)]);
}
/** Sidecars on disk whose deliverable is no longer listed (renamed, moved or removed): deliverable → side (R6 G1). */
export function orphanSidecars(root, reader) {
  const rels = new Set(deliverablesOf(reader));
  return Object.fromEntries(Object.entries(allSidecars(root)).filter(([rel]) => !rels.has(rel)));
}

export function readSidecar(root, deliverable) {
  const f = recordFile(root, unitsPathFor(deliverable));
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
}
// what a unit inherits: its own record's, or (a new unit from a split or a merge, or a piece of a retired unit) its
// sources'
const sourcesOf = (prev, split, merge, old, inherit = []) => (prev ? [prev] : [...[split?.from, ...(merge?.from || [])].filter(Boolean).map((id) => old.find((o) => o.id === id)).filter(Boolean), ...inherit]);
// the units a text took over (red-team round 4, R4-K17): the pieces of a split, a merge, and a piece of a retired unit
// name every unit whose text they hold, for good — so what was said about that text (a review's open concerns, MS8)
// follows it, as the register keeps what it owed
// (red-team round 5: a unit that absorbed a retired unit's words — the agent deleted the instructor's paragraph and wrote
// its sentences into its own neighbour — names that unit too: the text, and whose it is, follow the words)
function lineageOf(prev, sources, absorbed = []) {
  const from = prev ? absorbed : sources;
  const ids = [...new Set([...(prev?.lineage || []), ...from.flatMap((o) => [o.id, ...(o.lineage || [])])])].filter(Boolean).sort();
  return ids.length ? { lineage: ids } : {};
}
function carriedOf(sources) { const c = sources.find((o) => o.carried)?.carried; return c ? { carried: c } : {}; }
function owesOf(sources) {
  const o = sources.filter((x) => x.owes).map((x) => x.owes);
  if (!o.length) return {};
  return { owes: { since: Math.min(...o.map((x) => x.since || 0)), targets: [...new Set(o.flatMap((x) => x.targets || []))].sort() } };
}
/**
 * The stamp a new unit inherits from the units it came from (R2 F14): their stamps merged, so a dependency that moved
 * while they were stamped is still seen as moved — the next restamp records it as owed. A target the sources were
 * stamped at different hashes is kept as a conflict (it counts as moved).
 */
function stampOf(sources) {
  const stamped = sources.filter((x) => x.stamp);
  if (!stamped.length) return {};
  const out = {};
  for (const x of stamped) for (const [t, h] of Object.entries(x.stamp)) out[t] = t in out && out[t] !== h ? "inherited-conflict" : h;
  return { stamp: out };
}

// the retired-unit register (R2 F1, F2, F14): what a retired unit was, kept with its deliverable's sidecar
// (`text`: the unit as it last read — a re-check whose dependency retired is shown it, R6 G4; records written before R6
// have none)
const REGISTER_FIELDS = ["form", "origin", "spineNodes", "evidence", "stamp", "carried", "owes", "judgmentAdded", "tokens", "lineage", "text"];
function registerEntry(u) {
  const e = { id: u.id, deliverable: u.locator?.deliverable ?? u.deliverable, section: u.locator?.section ?? u.section, contentHash: u.locator?.contentHash ?? u.contentHash };
  for (const k of REGISTER_FIELDS) if (u[k] !== undefined) e[k] = u[k];
  return e;
}
// a register entry read as an old unit (to take back its id and record)
const asOldUnit = (e) => ({ ...e, locator: { deliverable: e.deliverable, section: e.section, ordinal: -1, contentHash: e.contentHash } });
/** Every unit id the package ever used: live, in a register, or logged as retired (never minted again, R2 F1). */
function usedIds(sidecars, logText) {
  const ids = new Set();
  for (const side of sidecars) { for (const u of side?.units || []) ids.add(u.id); for (const e of side?.retired || []) ids.add(e.id); }
  if (!verifyLog(logText).length) for (const r of parseLog(logText)) if (r.type === "unit-retirement") for (const id of r.payload?.units || []) ids.add(id);
  return ids;
}

const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); let n = 0; for (const x of A) if (B.has(x)) n++; return n / Math.max(1, A.size + B.size - n); };
const contained = (inner, outer) => { const O = new Set(outer); return inner.filter((x) => O.has(x)).length / Math.max(1, inner.length); };

/** Match new segments to old units. Returns { assigned: Map(newIndex → oldUnit), splits, merges, retired }. */
export function matchUnits(oldUnits, segs, { reserved = new Set() } = {}) {
  const assigned = new Map(), usedOld = new Set(), usedNew = new Set();
  const segTokens = segs.map((s) => tokensOf(s.text)), segHash = segs.map((s) => unitHash(s.text));
  // 1. exact text, wherever it moved
  segs.forEach((s, i) => { const o = oldUnits.find((u) => !usedOld.has(u.id) && u.locator.contentHash === segHash[i]); if (o) { assigned.set(i, o); usedOld.add(o.id); usedNew.add(i); } });
  // a text that is byte for byte a retired unit's is that unit coming back (R2 F1, F2): never a rewording of another
  segs.forEach((_, i) => { if (!usedNew.has(i) && reserved.has(segHash[i])) usedNew.add(i); });
  const returning = new Set(segs.map((_, i) => i).filter((i) => reserved.has(segHash[i]) && !assigned.has(i)));
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
  returning.forEach((i) => usedNew.delete(i)); // left for the register (indexUnits)
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
  try { upgradeUnitRecordDigests(root); } catch { /* a broken log: the gate reports it */ }
  try { migrateUnitRecords(root, reader); } catch { /* an altered record or a broken log: the gate reports it */ }
  try { upgradeStamps(root, reader); } catch { /* an unindexed or partial package: indexing reports it */ }
  // a logged act whose record write died half-way is completed before anything else is written (R6 G3)
  try { reconcileUnitRecords(root, reader); } catch { /* an altered record or a broken log: the gate reports it */ }
  const baseline = {}, credited = {};
  for (const rel of deliverablesOf(reader)) { const seg = segmentDeliverable(reader.text(rel), rel).units; baseline[rel] = seg.map((s) => unitHash(s.text)); credited[rel] = creditKey(seg.find((s) => s.credit)?.credit); }
  // the label baseline (red team round 5, CONTROL C3-01): the first session under round 5 logs the printed labels over
  // every indexed unit — a link review recorded before then was shown none, and stands only while they are unchanged
  let labels;
  try {
    const logText = readLogText(root);
    if (!labelBaseline(parseLog(logText))) {
      labels = {};
      const units = loadUnits(root, reader);
      for (const rel of new Set(units.map((u) => u.locator.deliverable))) labels[rel] = {};
      for (const u of units) if (u.headings?.length) labels[u.locator.deliverable][u.id] = headingsKey(u);
    }
  } catch { labels = undefined; /* a broken log or index: the gate reports it */ }
  // the credit baseline (red team round 6, CONTROL C3-01): the first session under round 6 logs each deliverable's credit
  // line — a review recorded before then was shown none, and stands only while it is unchanged
  let credits;
  try { if (!creditBaseline(parseLog(readLogText(root)))) credits = credited; } catch { credits = undefined; }
  // the instructor's text, registered before the agent can change it (red team R6; authorship.mjs): every unit holding
  // their words that the register does not yet hold, at its indexed text
  try { registerInstructorBaseline(root, reader); } catch { /* a broken log or index: the gate reports it */ }
  return appendLogRecord(root, { type: "revision", party, payload: { event: "agent-session-begin", step, baseline, ...(labels ? { labels } : {}), ...(credits ? { credits } : {}) } });
}

/** The instructor's register as the log and the correction records give it (authorship.mjs instructorTextRegister). */
export function instructorRegister(root, logRecords = null) {
  const log = logRecords || (() => { const t = readLogText(root); return verifyLog(t).length ? [] : parseLog(t); })();
  const dir = recordFile(root, "metadata/corrections"), corrections = new Map();
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) { try { const c = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); if (c?.id) corrections.set(c.id, c); } catch { /* unreadable: not counted */ } }
  return instructorTextRegister(log, { corrections, correctionOk: (c, l) => correctionMatchesLog(c, log, l) });
}
/** A correction record matches its logged autocorrect record and its own texts (as verdicts.mjs correctionLogged). */
export function correctionMatchesLog(c, logRecords, entry = null) {
  if (!c?.before || !c?.after || unitHash(c.before.text ?? "") !== c.before.contentHash || unitHash(c.after.text ?? "") !== c.after.contentHash) return false;
  const ok = (l) => l.type === "revision" && l.payload?.event === "autocorrect" && l.payload.correction === c.id && l.payload.unit === c.unit && l.payload.before === c.before.contentHash && l.payload.after === c.after.contentHash;
  return entry ? ok(entry) : (logRecords || []).some(ok);
}
/**
 * Register, as the harness, the indexed text of every unit holding the instructor's words that the register does not
 * hold yet (no id whose text it holds is registered). A unit whose file text differs from its index (an edit not yet
 * indexed: of unknown authorship, D20) is not registered: only text the index has seen as it is.
 */
export function registerInstructorBaseline(root, reader) {
  const logText = readLogText(root);
  if (verifyLog(logText).length) return null;
  const log = parseLog(logText), reg = instructorRegister(root, log), ancestry = packageAncestry(root, reader), texts = {};
  for (const rel of deliverablesOf(reader)) {
    const side = readSidecar(root, rel);
    const seg = segmentDeliverable(reader.text(rel) ?? "", rel).units;
    if (!side || side.units.length !== seg.length) continue;
    side.units.forEach((u, i) => {
      if (unitHash(seg[i].text) !== u.locator?.contentHash || u.origin?.kind === "unknown") return;
      if (textIds(u).some((id) => reg.has(id)) || !instructorAuthored(u, log, ancestry)) return;
      texts[u.id] = seg[i].text;
    });
  }
  if (!Object.keys(texts).length) return null;
  return appendLogRecord(root, { type: "revision", party: { role: "harness", name: "units begin" }, payload: { event: "instructor-text-baseline", rule: "the instructor's text, registered before an agent session can change it (R6)", texts } });
}
/**
 * The instructor adopts the text as it now stands (their "keep" on an unasked edit): the register takes the current text
 * of every unit holding a registered text that any of `ids` holds (joined, for a split or a merge), and of each unit of
 * `ids` that holds no registered text; a registered text no live unit holds any more (removed) is registered as gone.
 */
export function adoptInstructorText(root, reader, ids, { instructorWords }, party) {
  if (party?.role !== "instructor") throw new Error("only the instructor adopts text as theirs");
  if (!String(instructorWords || "").trim()) throw new Error("adopting text quotes the instructor's words");
  const units = loadUnits(root, reader), reg = instructorRegister(root), holders = holdersOf(reg, units), texts = {};
  const want = new Set(ids);
  for (const [ref, hs] of holders) if (want.has(ref) || hs.some((u) => want.has(u.id))) texts[ref] = hs.map((u) => u.text).join("\n\n");
  for (const u of units.filter((x) => want.has(x.id) && !textIds(x).some((id) => reg.has(id)))) texts[u.id] = u.text;
  if (!Object.keys(texts).length) return null;
  // an authorship act (not a confirmation of correctness: it clears no re-check a unit owes)
  return appendLogRecord(root, { type: "authorship-confirmation", party, payload: { units: [...want], as: "instructor", kept: "edit", instructorWords, texts } });
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
  // a sidecar left at a path no longer listed (a renamed or moved document) is read and reconciled, never ignored (R6 G1)
  const rels = deliverablesOf(reader), orphanSides = new Map(Object.entries(orphanSidecars(root, reader)).sort(([a], [b]) => a.localeCompare(b)));
  assertUnaltered(root, [...rels, ...orphanSides.keys()]); // a re-index must not launder a hand-edited (or deleted) unit record (F6)
  if (initialOrigin) {
    if (!party || !["instructor", "agent"].includes(party.role)) throw new Error("an initial origin is a statement by the instructor or the agent");
    if (party.role === "agent" && initialOrigin.kind !== "agent-knowledge") throw new Error("the agent can only state that pre-existing text was agent-written");
    appendLogRecord(root, { type: "authorship-confirmation", party, payload: { initial: true, origin: initialOrigin } });
  }
  const findings = [], summary = { deliverables: 0, units: 0, kept: 0, reworded: 0, new: 0, returned: 0, retired: 0, splits: 0, merges: 0, agent: 0, unknown: 0 };
  const retiredAll = [], changedIds = [];
  const sidecars = new Map(rels.map((rel) => [rel, readSidecar(root, rel)]));
  // the registers of every sidecar, and the live units of an orphan sidecar — retired now unless their text is found
  // again (byte for byte, or nearly, in any deliverable): a renamed document's units come back with their records
  const register = [...sidecars, ...orphanSides].flatMap(([rel, side]) => (side?.retired || []).map((e) => ({ ...e, deliverable: e.deliverable || rel })));
  const orphaned = [...orphanSides].flatMap(([rel, side]) => (side.units || []).map((u) => ({ ...registerEntry(u), deliverable: u.locator?.deliverable || rel })));
  const taken = usedIds([...sidecars.values(), ...orphanSides.values()], logText);
  // whose text it is (authorship.mjs): every unit record's origin, live or retired, and the instructor's confirmations
  const ancestry = originIndex([...sidecars.values(), ...orphanSides.values()]);
  const confirmed = verifyLog(logText).length ? new Map() : confirmedAuthorship(parseLog(logText));
  const reserved = new Set([...register, ...orphaned].map((e) => e.contentHash));
  // 1. live matching, deliverable by deliverable
  const plan = rels.map((rel) => {
    const seg = segmentDeliverable(reader.text(rel), rel).units, old = sidecars.get(rel)?.units || [];
    return { rel, seg, old, m: matchUnits(old, seg, { reserved }) };
  });
  // 2. what is left is matched against every retired unit: the register, and the units retired by this index run
  const pool = [...register, ...orphaned, ...plan.flatMap((p) => [...p.m.retired, ...p.m.consumed].map((id) => registerEntry(p.old.find((o) => o.id === id))))];
  const back = new Set(); // pool ids taken back
  for (const p of plan) {
    p.back = new Map(); p.inherit = new Map();
    const open = p.seg.map((_, i) => i).filter((i) => !p.m.assigned.has(i) && !p.m.splits.some((x) => x.into.includes(i)) && !p.m.merges.some((x) => x.into === i));
    // byte for byte (any deliverable, this one first)
    for (const i of open) {
      const h = unitHash(p.seg[i].text);
      const e = pool.find((x) => !back.has(x.id) && x.contentHash === h && x.deliverable === p.rel) || pool.find((x) => !back.has(x.id) && x.contentHash === h);
      if (e) { p.back.set(i, e); back.add(e.id); }
    }
  }
  // then a near return and a piece, in ANY deliverable of the package (red team R3 coherence, F4: a stale answer moved
  // with its question to another chapter's practice set, two commas made parentheses, came back as a new unit owing
  // nothing). Every deliverable's byte-for-byte returns are taken first; a deliverable's own retired units are
  // preferred over another's, and the closest match wins.
  for (const p of plan) {
    const open = p.seg.map((_, i) => i).filter((i) => !p.m.assigned.has(i) && !p.back.has(i) && !p.m.splits.some((x) => x.into.includes(i)) && !p.m.merges.some((x) => x.into === i));
    const tok = new Map(open.map((i) => [i, tokensOf(p.seg[i].text)]));
    for (const i of open) {
      let best = null, rank = null;
      for (const e of pool) {
        if (back.has(e.id) || e.form !== p.seg[i].form) continue;
        const j = jaccard(e.tokens || [], tok.get(i)); if (j < 0.5) continue;
        const mine = e.deliverable === p.rel ? 1 : 0;
        if (!best || mine > rank[0] || (mine === rank[0] && j >= rank[1])) { best = e; rank = [mine, j]; }
      }
      if (best) { p.back.set(i, best); back.add(best.id); }
    }
    // a piece of a retired unit, or a text covering one, inherits what it owed (not its id)
    for (const i of open.filter((k) => !p.back.has(k))) {
      const t = tok.get(i);
      const from = pool.filter((e) => e.form === p.seg[i].form && (e.tokens || []).length >= 3 && t.length >= 3 &&
        (contained(t, e.tokens) >= 0.6 || contained(e.tokens, t) >= 0.6));
      if (from.length) p.inherit.set(i, from);
    }
  }
  // a kept unit that took in the words of a unit retired now or before (red-team round 5: the instructor's paragraph
  // deleted and its sentences written into the agent's neighbour, which keeps its id as a rewording): the words it GAINED
  // hold most of the retired unit's, so it names that unit in its lineage, and whose text it is follows them
  const inheritedIds = new Set([...plan.flatMap((p) => [...p.inherit.values()].flat().map((e) => e.id)), ...plan.flatMap((p) => p.m.consumed)]);
  // Whatever its form: the words are the same words when a paragraph is written into a worked solution (an answer).
  // A new unit that is no split, merge or piece by form takes the same reading.
  for (const p of plan) {
    p.absorbed = new Map();
    p.seg.forEach((sg, i) => {
      const o = p.m.assigned.get(i) || null;
      if (o ? o.locator.contentHash === unitHash(sg.text) : p.back.has(i)) return;
      const t = tokensOf(sg.text);
      const took = pool.filter((e) => !back.has(e.id) && !inheritedIds.has(e.id) && e.id !== o?.id && (e.tokens || []).length >= 5 &&
        contained(e.tokens, t) >= 0.6 && (!o || contained(e.tokens, o.tokens || []) < 0.6));
      if (took.length) p.absorbed.set(i, took);
    });
  }
  const sides = [];
  for (const { rel, seg, old, m, back: returned, inherit, absorbed } of plan) {
    const sessionBaseline = new Set(session?.payload.baseline?.[rel] || []);
    const units = seg.map((s, i) => {
      const prev = m.assigned.get(i) || (returned.has(i) ? asOldUnit(returned.get(i)) : null);
      const hash = unitHash(s.text);
      const changed = !prev || prev.locator.contentHash !== hash;
      const split = m.splits.find((x) => x.into.includes(i)), merge = m.merges.find((x) => x.into === i);
      const pieceOf = !prev ? (inherit.get(i) || []).map(asOldUnit) : [];
      const sources = sourcesOf(prev, split, merge, old, pieceOf);
      const took = (absorbed.get(i) || []).filter((e) => !sources.some((x) => x.id === e.id));
      let origin = prev?.origin;
      if (changed) {
        const beforeSession = session && sessionBaseline.has(hash) && !old.some((u) => u.locator.contentHash === hash);
        if (as === "agent" && !beforeSession) {
          // the agent revising the instructor's text keeps the instructor's credit, with the revision on record
          // (operator, 2026-10-02: "keep crediting me is fine") — and so does a text that holds their words after a
          // split, a merge, a move or a rewrite (red-team round 5, R5-K09/K10: ownership follows the text, never the id;
          // an explicit origin handed in cannot take the credit away)
          const revision = { model: party.model, step: session.payload.step, date };
          const held = [...(prev ? [prev] : sources), ...took].map((o) => instructorCredit(o, ancestry, confirmed)).find(Boolean);
          if (held && origins[hash]?.kind !== "instructor-authored")
            origin = { ...held, ...(origins[hash]?.correction ? { correction: origins[hash].correction } : {}), revisedBy: [...(held.revisedBy || []), revision] };
          else origin = origins[hash] || (!prev ? inheritedOrigin(sources, revision) : null) || { kind: "agent-knowledge", ...revision };
          summary.agent++;
        }
        else if (!old.length && !prev && initialOrigin) origin = initialOrigin;
        else { origin = origins[hash] || { kind: "unknown" }; if (origin.kind === "unknown") summary.unknown++; }
      }
      // the pieces of a split, and a merge, keep the spine links of what they came from
      const inherited = !prev ? [...new Set(sources.flatMap((o) => o.spineNodes || []))] : null;
      const id = prev?.id || mintId(rel, s.section, taken);
      if (prev && prev.locator.contentHash === hash) summary.kept++; else if (prev) summary.reworded++; else summary.new++;
      if (returned.has(i)) summary.returned++;
      if (changed) changedIds.push(id);
      const classified = classifyUnit(s);
      const added = (prev?.judgmentAdded || []).filter((k) => !classified.includes(k));
      const judgment = [...new Set([...classified, ...added])];
      const role = derivedRole(s.role, judgment); // framing may not carry facts (D19-I)
      return {
        id, locator: { deliverable: rel, section: s.section, ordinal: i, contentHash: hash, lines: [s.startLine, s.endLine] },
        form: s.form, role, origin, spineNodes: prev?.spineNodes || inherited || [], judgment, ...(added.length ? { judgmentAdded: added } : {}),
        // evidence is bound to fact tokens (P5), so it survives a rephrase; obligations.mjs decides what still counts.
        // An owed re-verification, a version carry and the stamp itself (where staleness may live) survive every
        // re-index, and pass to the pieces of a split, to a merge and to a returning text (R1 F4/F5, R2 F1/F2/F14)
        evidence: prev?.evidence || [], ...(prev ? (prev.stamp ? { stamp: prev.stamp } : {}) : stampOf(sources)), ...carriedOf(sources), ...owesOf(sources), ...lineageOf(prev, [...sources, ...(prev ? [] : took)], took), tokens: tokensOf(s.text),
        // the text as indexed: never read for a live unit (loadUnits reads the deliverable), kept so a retired unit's
        // register can show how it last read (R6 G4)
        text: s.text,
        ...(split ? { splitFrom: split.from } : {}), ...(merge ? { mergedFrom: merge.from } : {}), ...(pieceOf.length ? { inheritedFrom: pieceOf.map((x) => x.id) } : {}),
      };
    });
    summary.splits += m.splits.length; summary.merges += m.merges.length;
    const gone = [...m.retired, ...m.consumed].filter((id) => !back.has(id));
    summary.retired += gone.length;
    retiredAll.push(...gone);
    // the register: what it held (less what came back or retired again), and what retired now
    const kept = (sidecars.get(rel)?.retired || []).filter((e) => !back.has(e.id) && !gone.includes(e.id));
    const now = gone.map((id) => registerEntry(old.find((o) => o.id === id)));
    const retired = [...kept, ...now];
    sides.push({ schemaVersion: 1, deliverable: rel, units, ...(retired.length ? { retired } : {}) });
    summary.deliverables++; summary.units += units.length;
    // one question per deliverable, listing every unit of unknown authorship in it (clustered by root cause, D8)
    const unknown = units.filter((x) => x.origin.kind === "unknown" && !x.origin.namedAuthor);
    if (unknown.length)
      findings.push(makeFinding({ module: "skeleton", kind: "unit-unknown-authorship", units: unknown.map((u) => u.id), statusClass: "question", route: "digest",
        evidence: { type: "judgment", note: `${rel}: ${unknown.length} passage(s) changed outside an agent session — yours (accept as mine), someone else's (name them), or revert?`, hashes: unknown.map((u) => u.locator.contentHash) },
        recommendation: "accept as mine", basis: unknown.map((u) => u.locator.contentHash).join(",") }));
  }
  // an orphan sidecar: what came back went with its text; the rest retires into its register, with all it owed; a
  // sidecar left with nothing is removed (its removal logged)
  for (const [rel, side] of orphanSides) {
    const gone = (side.units || []).filter((u) => !back.has(u.id));
    const retired = [...(side.retired || []).filter((e) => !back.has(e.id)), ...gone.map((u) => ({ ...registerEntry(u), deliverable: u.locator?.deliverable || rel }))];
    retiredAll.push(...gone.map((u) => u.id)); summary.retired += gone.length;
    sides.push(retired.length ? { schemaVersion: 1, deliverable: rel, units: [], retired } : { deliverable: rel, remove: true });
  }
  for (const side of sides.filter((x) => !x.remove)) { const problems = validateUnitSidecar(side); if (problems.length) throw new Error(`refusing an invalid unit sidecar for ${side.deliverable}: ${problems[0]}`); }
  writeUnitRecords(root, sides);
  if (as === "agent") appendLogRecord(root, { type: "revision", party, payload: { event: "agent-session-end", summary } });
  if (retiredAll.length) appendLogRecord(root, { type: "unit-retirement", party: party || { role: "harness", name: "units index" }, payload: { units: retiredAll, register: true } }); // each kept in a register (R6: the gate holds the records to it)
  return { findings, summary, changedIds };
}

/**
 * The agent (or the instructor) adds judgment kinds the classifier missed — never removes one (the classifier errs
 * toward inclusion; an added kind only adds checks). The only way to change them: a unit record is the harness's
 * (R2 coherence F8: a hand edit of any field is unit-record-altered).
 */
export function addJudgmentKinds(root, reader, kindsByUnit, party) {
  if (!party || !["agent", "instructor"].includes(party.role)) throw new Error("judgment kinds are added by the agent or the instructor");
  const want = new Map(Object.entries(kindsByUnit)), writes = [];
  for (const k of [...want.values()].flat()) if (!JUDGMENT_KINDS.includes(k)) throw new Error(`unknown judgment kind ${k}`);
  for (const rel of deliverablesOf(reader)) {
    const side = readSidecar(root, rel); if (!side) continue;
    let touched = false;
    for (const u of side.units) if (want.has(u.id)) {
      const add = want.get(u.id).filter((k) => !(u.judgment || []).includes(k));
      if (add.length) { u.judgmentAdded = [...new Set([...(u.judgmentAdded || []), ...add])]; u.judgment = [...new Set([...(u.judgment || []), ...add])]; touched = true; }
      want.delete(u.id);
    }
    if (touched) writes.push(side);
  }
  if (want.size) throw new Error(`no such unit: ${[...want.keys()].join(", ")}`);
  for (const side of writes) { const problems = validateUnitSidecar(side); if (problems.length) throw new Error(`refusing an invalid unit sidecar for ${side.deliverable}: ${problems[0]}`); }
  // logged with the write, in one step (R6 G3)
  writeUnitRecords(root, writes, undefined, { act: { type: "revision", party, payload: { event: "judgment-added", units: kindsByUnit } } });
  return writes.length;
}

/** The instructor claims authorship of units of unknown authorship (accept as mine) — D20. */
export function claimAuthorship(root, { units, as = "instructor", instructorWords }, party) {
  if (party?.role !== "instructor") throw new Error("authorship is confirmed by the instructor");
  if (!String(instructorWords || "").trim()) throw new Error("an authorship confirmation quotes the instructor's words");
  const ids = new Set(units), date = new Date().toISOString().slice(0, 10), done = [], writes = [], texts = {};
  for (const rel of fs.existsSync(recordFile(root, "metadata/units")) ? walkSidecars(recordFile(root, "metadata/units")) : []) {
    const side = JSON.parse(fs.readFileSync(rel, "utf8"));
    let touched = false;
    // the text they accept is registered as theirs (red team R6): read from the deliverable, where it matches its index
    let seg = null; try { seg = segmentDeliverable(fs.readFileSync(path.join(root, side.deliverable), "utf8"), side.deliverable).units; } catch { seg = null; }
    side.units.forEach((u, i) => {
      if (!ids.has(u.id)) return;
      if (u.origin.kind !== "unknown") throw new Error(`${u.id} is not of unknown authorship`);
      u.origin = as === "instructor" ? { kind: "instructor-authored", instructor: party.name, date } : { kind: "unknown", namedAuthor: as };
      if (as === "instructor" && seg && seg.length === side.units.length && unitHash(seg[i].text) === u.locator?.contentHash) texts[u.id] = seg[i].text;
      done.push(u.id); touched = true;
    });
    if (touched) writes.push(side);
  }
  const missing = units.filter((u) => !done.includes(u));
  if (missing.length) throw new Error(`no such unit: ${missing.join(", ")}`);
  for (const side of writes) { const problems = validateUnitSidecar(side); if (problems.length) throw new Error(`refusing an invalid unit sidecar for ${side.deliverable}: ${problems[0]}`); }
  // logged with the write, in one step (R6 G3)
  writeUnitRecords(root, writes, undefined, { act: { type: "authorship-confirmation", party, payload: { units: done, as, instructorWords, ...(Object.keys(texts).length ? { texts } : {}) } } });
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
  // a sidecar left at a path no longer listed still holds live units: their records have not followed their text (R6 G1)
  for (const [rel, side] of Object.entries(orphanSidecars(root, reader))) if ((side.units || []).length)
    out.push(makeFinding({ module: "skeleton", kind: "units-not-indexed", units: [], statusClass: "obligation", route: "agent", basis,
      evidence: { type: "missing", what: `an index of the ${side.units.length} unit record(s) in metadata/units/${rel}.json — ${rel} is no longer a deliverable (renamed, moved or removed): run units index, so the records follow their text to its new path or retire into the register with what they owed` } }));
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
