#!/usr/bin/env node
// Move a package's records to the records layout (owner 2026-10-31; site-type contract §5 "records"): the working
// record from metadata/ to private/coursewerk/, the public record (ATTRIBUTION.md, PUBLISHED.json) to
// provenance/coursewerk/. Once per package written before the layout.
//   node scripts/records_move.mjs --root <package> [--dry-run]
// - The package must be a clean git repository: the move is one reviewable commit's worth of renames (git mv).
// - Only record files move; any other file under metadata/ (a document a student reads, placed there) stays.
// - Nothing inside a record is rewritten: paths stored in older records ("metadata/evidence/…") are read at their new
//   place (records/paths.mjs relocate), so every hash that binds a record still holds.
// - A package with a decision log gets one harness record of the move, written after it.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { RECORDS, PUBLIC_RECORDS, relocate } from "./lib/records/paths.mjs";
import { appendLogRecord } from "./lib/records/log.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const root = opt("--root") && path.resolve(opt("--root")), dry = args.includes("--dry-run");
const fail = (m) => { console.error(m); process.exit(2); };
if (!root || !fs.existsSync(root)) fail("usage: records_move.mjs --root <package> [--dry-run]");
const git = (...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });

// the record names (files and folders) the harness writes under metadata/
export const RECORD_NAMES = new Set(["units", "DOCUMENTS.json", "REVIEW_QUEUE.json", "LOG.jsonl", "FOUNDATION.json", "verification", "coursewerk.json",
  "KEY_FACT_REVIEW.json", "claims", "CLAIMS.json", "PROVENANCE.json", "evidence", "SOURCE_RECORD.json", "TERMS.json", "SPINE.json", "COMPONENT_INDEX.json",
  "OVERRIDES.json", "spine", "corrections", "VISUAL_REVIEW.json", "preflight", "MEDIA_PLAN.json", "publish", "modules.json", "digest", "REFERENCE_RECORD.json",
  "LINK_RESOLUTIONS.json", "FINDINGS.json", "STEERING.json", "NOT_EXCLUDED.json", "NOTES.json", "ATTRIBUTION.md", "PUBLISHED.json"]);

const meta = path.join(root, "metadata");
if (!fs.existsSync(meta)) { console.log(JSON.stringify({ moved: [], note: "no metadata/ folder: nothing to move" }, null, 2)); process.exit(0); }
const moves = fs.readdirSync(meta).filter((n) => RECORD_NAMES.has(n)).map((n) => ({ from: `metadata/${n}`, to: relocate(`metadata/${n}`) }));
const clash = moves.filter((m) => fs.existsSync(path.join(root, m.to)));
if (clash.length) fail(`refusing to move over records already in the new layout: ${clash.map((m) => m.to).join(", ")} — the package holds both layouts; reconcile by hand`);
const isGit = git("rev-parse", "--is-inside-work-tree").stdout.trim() === "true";
if (!isGit) fail("the package must be a git repository, so the move is reviewable (git mv)");
if (git("status", "--porcelain").stdout.trim()) fail("commit or set aside the package's changes first: the move must be its own reviewable change");
if (!dry) {
  for (const d of [RECORDS, PUBLIC_RECORDS]) fs.mkdirSync(path.join(root, d), { recursive: true });
  for (const m of moves) {
    const tracked = git("ls-files", "--error-unmatch", m.from).status === 0 || git("ls-files", m.from).stdout.trim();
    if (tracked) { const r = git("mv", m.from, m.to); if (r.status !== 0) fail(`git mv ${m.from} ${m.to} failed: ${r.stderr}`); }
    else fs.renameSync(path.join(root, m.from), path.join(root, m.to));
  }
  if (!fs.readdirSync(meta).length) fs.rmdirSync(meta);
  if (fs.existsSync(path.join(root, RECORDS, "LOG.jsonl")))
    appendLogRecord(root, { type: "revision", party: { role: "harness", name: "records layout" }, payload: { event: "records-moved", from: "metadata/", to: [RECORDS + "/", PUBLIC_RECORDS + "/"], moved: moves.map((m) => m.from) } });
}
console.log(JSON.stringify({ dryRun: dry, moved: moves, next: dry ? "run without --dry-run" : "review `git status`, then commit the move as its own change" }, null, 2));
