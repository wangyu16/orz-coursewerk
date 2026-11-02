// The job release for Alembic (req.release.alembic-job, owner 2026-11-02): the folder an Alembic assistant job mounts
// read-only as `assistant/`. Its top-level CLAUDE.md is the job's instructions (alembic-job/CLAUDE.md); Coursewerk's own
// CLAUDE.md travels as COURSEWERK.md, and JOB_RELEASE.json marks it as a job release. It holds what the scripts read at run time and production node_modules (the
// four orz packages and katex), never the tests, the git history, the handover folder, the system index or the website.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { JOB_RELEASE } from "../frames.mjs";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const RELEASE_DIRS = Object.freeze(["scripts", "skills", "docs", "format-contracts", "templates"]);
export const RELEASE_FILES = Object.freeze(["PROCEDURE.md", "VERSION", "package.json", "LICENSE"]);
export const RUNTIME_PACKAGES = Object.freeze(["orz-markdown", "orz-mdhtml", "orz-slides", "orz-paged", "katex", "katex/contrib/mhchem"]);
const SKIP = new Set([".DS_Store", "node_modules", ".git"]);

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyTree(a, b); else if (e.isFile()) fs.copyFileSync(a, b);
  }
}
export function folderBytes(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); n += e.isDirectory() ? folderBytes(p) : e.isFile() ? fs.statSync(p).size : 0; }
  return n;
}

/**
 * Build the release into `outDir` (which must not exist or be empty). `install: false` leaves node_modules out (tests).
 * Returns { outDir, bytes, files: [top-level names], resolved: { pkg: true|error } }.
 */
export function packJobRelease(outDir, { repo = REPO, install = true, npmEnv = process.env, builtAt = new Date().toISOString() } = {}) {
  outDir = path.resolve(outDir);
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length) throw new Error(`${outDir} is not empty`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(path.join(repo, "alembic-job", "CLAUDE.md"), path.join(outDir, "CLAUDE.md"));
  fs.copyFileSync(path.join(repo, "CLAUDE.md"), path.join(outDir, "COURSEWERK.md"));
  for (const d of RELEASE_DIRS) copyTree(path.join(repo, d), path.join(outDir, d));
  for (const f of RELEASE_FILES) fs.copyFileSync(path.join(repo, f), path.join(outDir, f));
  // the marker: inside this release, the frames are the ones in its own node_modules (frames.mjs framesMode), so a plain
  // `node assistant/scripts/…` never waits on an npm registry the job cannot reach
  fs.writeFileSync(path.join(outDir, JOB_RELEASE), JSON.stringify({ coursewerk: fs.readFileSync(path.join(repo, "VERSION"), "utf8").trim(), builtAt, frames: "installed" }, null, 2) + "\n");
  const resolved = {};
  if (install) {
    // production dependencies only, installed into a temporary copy so the repository's own node_modules is untouched
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cw-job-release-"));
    try {
      fs.copyFileSync(path.join(repo, "package.json"), path.join(tmp, "package.json"));
      const r = spawnSync("npm", ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock"], { cwd: tmp, encoding: "utf8", env: npmEnv });
      if (r.status !== 0) throw new Error(`npm install failed: ${(r.stderr || r.error?.message || "").trim().slice(0, 500)}`);
      fs.renameSync(path.join(tmp, "node_modules"), path.join(outDir, "node_modules"));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    // every runtime package resolves from inside the release, and the scripts that use them load
    const probe = `const out = {}; for (const p of ${JSON.stringify([...RUNTIME_PACKAGES, "./scripts/lib/core/printed.mjs", "./scripts/lib/core/house_notation.mjs", "./scripts/lib/core/site_host.mjs", "./scripts/lib/skeleton/gate.mjs"])}) { try { await import(p); out[p] = true; } catch (e) { out[p] = e.message; } } console.log(JSON.stringify(out));`;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", probe], { cwd: outDir, encoding: "utf8" });
    Object.assign(resolved, JSON.parse(r.stdout || "{}"));
    const bad = Object.entries(resolved).filter(([, v]) => v !== true);
    if (r.status !== 0 || bad.length) throw new Error(`the release does not load: ${bad.map(([k, v]) => `${k}: ${v}`).join("; ") || r.stderr}`);
  }
  return { outDir, bytes: folderBytes(outDir), files: fs.readdirSync(outDir).sort(), resolved };
}
