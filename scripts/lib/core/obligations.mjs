// The deterministic core (redesign P5; D19-A). Obligations that block publishing from the first release — each says
// what is missing, never that something is wrong:
//   evidence-missing     a semi-mechanical unit has no admitted evidence for its current facts (Q15, D19-D);
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
import { segmentDeliverable } from "./segment.mjs";
import { deliverablesOf, indexUnits, readSidecar } from "./units_index.mjs";
import { parseSpine, nodeIndex } from "./spine.mjs";
import { manifestChapters } from "./package_reader.mjs";
import { dependencyEdges, factHash, sourceHashes, stampFor, staleTargets, targetHashes } from "./dependencies.mjs";

export const ADMITTED_EVIDENCE = Object.freeze(["quote-verified", "instructor-confirmation"]);

/** Every indexed unit with its current text (deliverables whose index is out of date are skipped: units-not-indexed covers them). */
export function loadUnits(root, reader) {
  const out = [];
  for (const rel of deliverablesOf(reader)) {
    const side = readSidecar(root, rel);
    const seg = segmentDeliverable(reader.text(rel), rel).units;
    if (!side || side.units.length !== seg.length) continue; // out of date: the units-not-indexed obligation covers it
    side.units.forEach((u, i) => out.push({ ...u, text: seg[i]?.text ?? "" }));
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

/** Index, then stamp every unit that changed (its author wrote it against the package as it is now). */
export function indexAndStamp(root, reader, opts) {
  const r = indexUnits(root, reader, opts);
  restamp(root, reader, r.changedIds);
  return r;
}

/** The agent links units to the spine nodes they serve. A link change re-stamps the unit. */
export function linkUnits(root, reader, links, party) {
  if (!party || !["agent", "instructor"].includes(party.role)) throw new Error("links are declared by the agent or the instructor");
  const { spine } = context(root, reader);
  const nodes = nodeIndex(spine);
  for (const [id, list] of Object.entries(links)) for (const n of list) if (!nodes.has(n)) throw new Error(`${id}: ${n} is not a spine node`);
  rewriteUnits(root, Object.keys(links), (u) => { u.spineNodes = [...new Set(links[u.id])]; });
  restamp(root, reader, Object.keys(links));
  appendLogRecord(root, { type: "revision", party, payload: { event: "units-linked", count: Object.keys(links).length } });
}

/** The instructor confirms units: "fact" clears an evidence obligation for the current facts; "still-correct" re-stamps. */
export function confirmUnits(root, reader, ids, { what }, party) {
  if (party?.role !== "instructor") throw new Error("a confirmation is the instructor's");
  if (!["fact", "still-correct"].includes(what)) throw new Error('confirm what: "fact" or "still-correct"');
  const { units, edges, hashes } = context(root, reader);
  const text = new Map(units.map((u) => [u.id, u.text]));
  const at = new Date().toISOString();
  rewriteUnits(root, ids, (u) => {
    if (what === "fact") u.evidence = [...(u.evidence || []), { type: "instructor-confirmation", by: party.name, at, factHash: factHash(text.get(u.id) || "") }];
    u.stamp = stampFor(u.id, edges, hashes); delete u.carried;
  });
  appendLogRecord(root, { type: "confirmation", party, payload: { what, units: ids, weight: "single" } });
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

/** All core obligations (and dangling-link defects) of a package. */
export function coreObligations(root, reader, basis) {
  const { chapters, spine, units, hashes } = context(root, reader);
  const nodes = nodeIndex(spine);
  const F = [];
  const ob = (kind, ids, what) => F.push(makeFinding({ module: "skeleton", kind, units: ids, statusClass: "obligation", route: "agent", basis, evidence: { type: "missing", what } }));
  for (const u of units) {
    const fh = factHash(u.text);
    if (u.judgment.includes("semi-mechanical") && !(u.evidence || []).some((e) => ADMITTED_EVIDENCE.includes(e.type) && e.factHash === fh))
      ob("evidence-missing", [u.id], `admitted evidence for the facts stated in ${u.id} (${u.locator.deliverable})`);
    if (u.role === "teaching" && !(u.spineNodes || []).length) ob("unit-unlinked", [u.id], `a spine link for ${u.id} (${u.locator.deliverable}, ${u.locator.section})`);
    const dangling = (u.spineNodes || []).filter((n) => !nodes.has(n));
    if (dangling.length) F.push(makeFinding({ module: "skeleton", kind: "unit-link-dangling", units: [u.id], statusClass: "defect", route: "agent", basis, evidence: { type: "rule", rule: "a unit links only to existing spine nodes", dangling } }));
    if (u.carried) ob("carried-unverified", [u.id], `re-verification of ${u.id} in ${u.carried.scope} version ${u.carried.version}`);
    else if (u.stamp) { const moved = staleTargets(u.stamp, hashes); if (moved.length) ob("reverify", [u.id], `re-verification of ${u.id}: ${moved.join(", ")} changed since it was written`); }
  }
  for (const ch of chapters) {
    const s = spine.chapters[ch];
    for (const o of s.map.nodes.filter((n) => n.kind === "objective" && n.id)) {
      const teaching = units.filter((u) => u.role === "teaching" && /^(study-guide|slides)\//.test(u.locator.deliverable) && (u.spineNodes || []).includes(o.id));
      if (!teaching.length) ob("objective-uncovered", [], `a teaching unit (study guide or slides) that serves ${o.id}`);
    }
    for (const e of s.guide.entries.filter((x) => x.id)) {
      const qs = units.filter((u) => u.form === "question" && (u.spineNodes || []).includes(e.id));
      if (qs.length < (Number.isInteger(e.count) ? e.count : 0)) ob("guide-entry-short", qs.map((u) => u.id), `${e.count - qs.length} more question(s) for ${e.id} (has ${qs.length} of ${e.count})`);
    }
  }
  return F;
}
