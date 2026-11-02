// The orz-family frames (D36, operator 2026-10-02). Coursewerk delivers the lean course in orz-markdown, whose syntax
// and notations stay stable; the frames that dress it (orz-mdhtml, orz-slides, orz-paged) are updated from time to
// time, and a carrier is always assembled with the newest. A frame update changes how the material looks, never what
// it is: nothing here touches the package, and the versions used are recorded in the build receipt, not the course.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const FRAMES = Object.freeze(["orz-mdhtml", "orz-slides", "orz-paged", "orz-markdown"]);
export const frameCache = () => path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "coursewerk", "frames");

export const installedVersion = (dir, name) => { try { return JSON.parse(fs.readFileSync(path.join(dir, "node_modules", name, "package.json"), "utf8")).version; } catch { return null; } };
export const newer = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

/** The newest published version of each frame, or null when the registry cannot be reached. */
export function npmLatest(name, { timeoutMs = 15000 } = {}) {
  const r = spawnSync("npm", ["view", name, "version"], { encoding: "utf8", timeout: timeoutMs });
  const v = r.status === 0 ? r.stdout.trim() : "";
  return /^\d+\.\d+\.\d+/.test(v) ? v : null;
}
function npmInstall(dir, specs) {
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(path.join(dir, "package.json"))) fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "coursewerk-frames", private: true }) + "\n");
  const r = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--prefix", dir, ...specs], { encoding: "utf8", timeout: 300000 });
  return r.status === 0;
}

/**
 * Where to take the frames from, for one build.
 * mode "latest" (the default): the newest published versions, installed once into the frame cache (outside the
 * package and the harness); when the registry cannot be reached, the harness's installed frames, said so.
 * mode "installed": the harness's own node_modules, as they are.
 * @returns { binDir, nodeModules, frames: { name: { version, newest, installed } }, harnessBehind, source, note }
 *   harnessBehind: the frames the harness itself has installed older than the newest (null when the newest is unknown)
 */
/** The marker a job release carries at its root (pack_job_release.mjs; req.release.alembic-job): an Alembic job has
 *  no npm registry and may run only plain commands, so the release itself says to use its own node_modules. */
export const JOB_RELEASE = "JOB_RELEASE.json";
export function isJobRelease(harnessRoot) {
  if (!harnessRoot) return false;
  try { return JSON.parse(fs.readFileSync(path.join(harnessRoot, JOB_RELEASE), "utf8"))?.frames === "installed"; } catch { return false; }
}
/** The frames mode when none is asked: `COURSEWERK_FRAMES` (latest | installed) when set; else "installed" inside a job
 *  release (its JOB_RELEASE.json says frames: "installed"); else the newest. Tests set "installed" so they never reach
 *  the registry (tests stay offline and deterministic); a build for the instructor uses the newest. */
// this harness's root (scripts/lib/frames.mjs → ../..): a caller that names no root (build_carriers) asks about itself
const HARNESS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const framesMode = (harnessRoot = HARNESS_ROOT) => {
  const env = process.env.COURSEWERK_FRAMES;
  if (env === "installed" || env === "latest") return env;
  return isJobRelease(harnessRoot) ? "installed" : "latest";
};

export function resolveFrames(harnessRoot, { mode = framesMode(harnessRoot), latest = npmLatest, install = npmInstall, cache = frameCache() } = {}) {
  const local = path.join(harnessRoot, "node_modules");
  const at = (nodeModules, frames, source, note, harnessBehind = null) => ({ binDir: path.join(nodeModules, ".bin"), nodeModules, frames, harnessBehind, source, note });
  const localFrames = Object.fromEntries(FRAMES.map((n) => [n, { version: installedVersion(harnessRoot, n), newest: null, installed: installedVersion(harnessRoot, n) }]));
  if (mode === "installed") return at(local, localFrames, "installed", "the harness's installed frames, as asked");
  const want = Object.fromEntries(FRAMES.map((n) => [n, latest(n)]));
  if (FRAMES.some((n) => !want[n])) return at(local, localFrames, "installed (registry unreachable)", "could not reach the npm registry: built with the installed frames, which may not be the newest");
  const behind = FRAMES.filter((n) => !localFrames[n].version || newer(want[n], localFrames[n].version));
  const known = (version) => Object.fromEntries(FRAMES.map((n) => [n, { version: version(n), newest: want[n], installed: localFrames[n].version }]));
  if (!behind.length) return at(local, known((n) => localFrames[n].version), "installed (already the newest)", null, []);
  const dir = path.join(cache, FRAMES.map((n) => `${n}@${want[n]}`).join("+"));
  const ready = FRAMES.every((n) => installedVersion(dir, n) === want[n]) || install(dir, FRAMES.map((n) => `${n}@${want[n]}`));
  if (!ready) return at(local, known((n) => localFrames[n].version), "installed (update failed)", `could not install the newest frames (${behind.join(", ")}): built with the installed ones`, behind);
  return at(path.join(dir, "node_modules"), known((n) => want[n]), "newest", `the harness's installed ${behind.map((n) => `${n} ${localFrames[n].version || "(missing)"}`).join(", ")} ${behind.length > 1 ? "are" : "is"} behind the newest; built with the newest from the frame cache`, behind);
}

/** A frame's public Node library (its package's main export: `assemble`, `extract`, `inspect`, `VERSION`), from the
 *  same node_modules the build took its CLI from — so a carrier is checked by the frames that built it. */
export async function loadFrameLib(nodeModules, name) {
  const dir = path.join(nodeModules, name);
  const pj = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const exp = pj.exports?.["."];
  const main = (typeof exp === "string" ? exp : exp?.import || exp?.default) || pj.main || "index.js";
  return import(pathToFileURL(path.join(dir, main)).href);
}
