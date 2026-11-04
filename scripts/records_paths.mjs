#!/usr/bin/env node
// Fix the paths a package's records store after its files were renamed (req.records.paths-fix; General Chemistry,
// 2026-11-04: the decks became slides/<chapter>.slides.md, while the media records still named slides/<chapter>.md, so
// every slide asset's record pointed at a missing file). A sibling of records_move.mjs.
//   node scripts/records_paths.mjs --root <package> [--dry-run]
// - Only paths inside records change, and only a path whose file is missing and whose renamed file exists (the one
//   rename Coursewerk knows: a chapter deck slides/<chapter>.md → slides/<chapter>.slides.md). Nothing else in a record,
//   and no material's text, is touched. A missing path with no renamed file is reported, never guessed.
// - Records read: the media record's `usedIn` lists (private/coursewerk/PROVENANCE.json; MEDIA_PLAN.json names no files).
// - When PROVENANCE.json changed, provenance/coursewerk/ATTRIBUTION.md is regenerated from it (as generate_attribution.mjs
//   does), so the two agree again.
// - A package with a decision log gets one harness record of the fix: every path changed, where, from and to.
import fs from "node:fs";
import path from "node:path";
import { RECORDS, PUBLIC_RECORDS } from "./lib/records/paths.mjs";
import { appendLogRecord } from "./lib/records/log.mjs";
import { renderAttribution } from "./lib/assurance.mjs";
import { renamedRecordPath } from "./lib/core/record_paths.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const root = opt("--root") && path.resolve(opt("--root")), dry = args.includes("--dry-run");
const fail = (m) => { console.error(m); process.exit(2); };
if (!root || !fs.existsSync(root)) fail("usage: records_paths.mjs --root <package> [--dry-run]");
const exists = (rel) => fs.existsSync(path.join(root, rel));

const RECORD_FILES = [`${RECORDS}/PROVENANCE.json`];
const fixed = [], unresolved = [], changedRecords = new Map();
for (const rel of RECORD_FILES) {
  if (!exists(rel)) continue;
  let rec;
  try { rec = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); } catch (e) { fail(`${rel} is not readable JSON (${e.message}): fix it by hand first`); }
  const items = Array.isArray(rec.items) ? rec.items : [], key = "items";
  let changed = false;
  items.forEach((item, i) => {
    if (!item || !Array.isArray(item.usedIn)) return;
    item.usedIn = item.usedIn.map((p, j) => {
      if (typeof p !== "string" || exists(p)) return p;
      const to = renamedRecordPath(p, exists);
      if (to) { fixed.push({ record: rel, at: `${key}[${i}].usedIn[${j}]`, from: p, to }); changed = true; return to; }
      unresolved.push({ record: rel, at: `${key}[${i}].usedIn[${j}]`, path: p });
      return p;
    });
  });
  if (changed) changedRecords.set(rel, rec);
}
let attribution = null;
if (!dry && fixed.length) {
  for (const [rel, rec] of changedRecords) fs.writeFileSync(path.join(root, rel), JSON.stringify(rec, null, 2) + "\n");
  if (changedRecords.has(`${RECORDS}/PROVENANCE.json`)) {
    attribution = `${PUBLIC_RECORDS}/ATTRIBUTION.md`;
    fs.mkdirSync(path.join(root, PUBLIC_RECORDS), { recursive: true });
    fs.writeFileSync(path.join(root, attribution), renderAttribution(changedRecords.get(`${RECORDS}/PROVENANCE.json`)));
  }
  if (exists(`${RECORDS}/LOG.jsonl`))
    appendLogRecord(root, { type: "revision", party: { role: "harness", name: "record paths" }, payload: { event: "record-paths-fixed", rule: "a stored path of a renamed file is pointed at the file as it is named now", fixed, unresolved: unresolved.length, ...(attribution ? { regenerated: attribution } : {}) } });
}
console.log(JSON.stringify({ dryRun: dry, fixed: fixed.length, records: [...changedRecords.keys()], regenerated: attribution, unresolved, changes: fixed }, null, 2));
process.exit(unresolved.length ? 1 : 0);
