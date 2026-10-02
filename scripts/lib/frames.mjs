// The orz-family frames (D36, operator 2026-10-02). Coursewerk delivers the lean course in orz-markdown, whose syntax
// and notations stay stable; the frames that dress it (orz-mdhtml, orz-slides, orz-paged) are updated from time to
// time, and a carrier is always assembled with the newest. A frame update changes how the material looks, never what
// it is: nothing here touches the package, and the versions used are recorded in the build receipt, not the course.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const FRAMES = Object.freeze(["orz-mdhtml", "orz-slides", "orz-paged", "orz-markdown"]);
export const frameCache = () => path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "coursewerk", "frames");

const installedVersion = (dir, name) => { try { return JSON.parse(fs.readFileSync(path.join(dir, "node_modules", name, "package.json"), "utf8")).version; } catch { return null; } };
const newer = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

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
 * @returns { binDir, frames: { name: { version, newest } }, source, note }
 */
export function resolveFrames(harnessRoot, { mode = "latest", latest = npmLatest, install = npmInstall, cache = frameCache() } = {}) {
  const local = path.join(harnessRoot, "node_modules");
  const localFrames = Object.fromEntries(FRAMES.map((n) => [n, { version: installedVersion(harnessRoot, n), newest: null }]));
  if (mode === "installed") return { binDir: path.join(local, ".bin"), frames: localFrames, source: "installed", note: "the harness's installed frames, as asked" };
  const want = Object.fromEntries(FRAMES.map((n) => [n, latest(n)]));
  if (FRAMES.some((n) => !want[n])) return { binDir: path.join(local, ".bin"), frames: localFrames, source: "installed (registry unreachable)", note: "could not reach the npm registry: built with the installed frames, which may not be the newest" };
  const behind = FRAMES.filter((n) => !localFrames[n].version || newer(want[n], localFrames[n].version));
  if (!behind.length) return { binDir: path.join(local, ".bin"), frames: Object.fromEntries(FRAMES.map((n) => [n, { version: localFrames[n].version, newest: want[n] }])), source: "installed (already the newest)", note: null };
  const dir = path.join(cache, FRAMES.map((n) => `${n}@${want[n]}`).join("+"));
  const ready = FRAMES.every((n) => installedVersion(dir, n) === want[n]) || install(dir, FRAMES.map((n) => `${n}@${want[n]}`));
  if (!ready) return { binDir: path.join(local, ".bin"), frames: localFrames, source: "installed (update failed)", note: `could not install the newest frames (${behind.join(", ")}): built with the installed ones` };
  return { binDir: path.join(dir, "node_modules", ".bin"), frames: Object.fromEntries(FRAMES.map((n) => [n, { version: want[n], newest: want[n] }])), source: "newest", note: null };
}
