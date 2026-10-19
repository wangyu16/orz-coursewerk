#!/usr/bin/env node
// skills — fetch the NEWEST agent skill of each orz package (D52, operator 2026-10-19: "guide agent to always fetch
// the newest version of the corresponding agent skills rather than to use outdated ones").
//
// Each orz package ships its own skill (`<pkg>/<pkg>-skills/`, also served at
// https://cdn.jsdelivr.net/npm/<pkg>/<pkg>-skills/SKILL.md). Coursewerk bundles no copy: it resolves the newest
// published versions (the same frame cache the carrier build uses, scripts/lib/frames.mjs), copies each skill folder
// to `<into>/<pkg>/`, and records `{package, version, source}` in `COURSEWERK-SKILL.json` beside it.
//
// Usage: node skills.mjs [--into <dir>]          install the newest skills (default: ./.claude/skills)
//        node skills.mjs --check [--into <dir>]  report skills there that are missing or older than the newest; changes nothing
//        node skills.mjs --list                  the four packages, their newest versions and jsDelivr URLs
//        add --json for one JSON object. Exit: 0 all newest/installed, 1 something is missing, stale or unverifiable.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FRAMES, frameCache, installedVersion, newer, npmLatest, resolveFrames } from "./lib/frames.mjs";

export const SKILL_PACKAGES = FRAMES;
export const RECORD = "COURSEWERK-SKILL.json";
export const skillUrl = (pkg) => `https://cdn.jsdelivr.net/npm/${pkg}/${pkg}-skills/SKILL.md`;
const HARNESS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The newest published version of each package (null when the registry cannot be reached). */
export function listSkills({ latest = npmLatest } = {}) {
  return SKILL_PACKAGES.map((pkg) => ({ package: pkg, newest: latest(pkg), url: skillUrl(pkg) }));
}

/** Install the newest skill of each package into `into`. Offline: the harness's installed packages' skills, said so. */
export function installSkills(into, { harnessRoot = HARNESS, latest = npmLatest, install, cache = frameCache() } = {}) {
  const frames = resolveFrames(harnessRoot, { mode: "latest", latest, cache, ...(install ? { install } : {}) }); // skills: always the newest
  const newestKnown = !/registry unreachable/.test(frames.source);
  const fresh = frames.source === "newest" || frames.source === "installed (already the newest)";
  const results = [];
  for (const pkg of SKILL_PACKAGES) {
    const from = path.join(frames.nodeModules, pkg, `${pkg}-skills`);
    const version = installedVersion(path.dirname(frames.nodeModules), pkg);
    const dest = path.join(into, pkg);
    if (!fs.existsSync(path.join(from, "SKILL.md"))) { results.push({ package: pkg, status: "unavailable", version, url: skillUrl(pkg), note: `${pkg} ${version || "(not installed)"} ships no ${pkg}-skills/SKILL.md` }); continue; }
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(from, dest, { recursive: true });
    const source = `npm:${pkg}@${version} (${fresh ? "the newest published" : newestKnown ? "the harness's install: the newest could not be installed" : "the harness's install: the registry was unreachable"})`;
    fs.writeFileSync(path.join(dest, RECORD), JSON.stringify({ package: pkg, version, source }, null, 2) + "\n");
    results.push({ package: pkg, status: fresh ? "newest" : "maybe-stale", version, newest: frames.frames[pkg]?.newest ?? null, into: dest, url: skillUrl(pkg) });
  }
  const note = fresh ? null : `${frames.note}. The skills installed may be stale: read the newest at ${SKILL_PACKAGES.map(skillUrl).join(" , ")}`;
  return { into, source: frames.source, note, ok: fresh && results.every((r) => r.status === "newest"), results };
}

/** Report the skills in `into` that are missing or older than the newest. Changes nothing. */
export function checkSkills(into, { latest = npmLatest } = {}) {
  const results = SKILL_PACKAGES.map((pkg) => {
    const dir = path.join(into, pkg);
    const newest = latest(pkg);
    let record = null;
    try { record = JSON.parse(fs.readFileSync(path.join(dir, RECORD), "utf8")); } catch { /* none */ }
    const base = { package: pkg, installed: record?.version ?? null, newest, url: skillUrl(pkg) };
    if (!fs.existsSync(path.join(dir, "SKILL.md"))) return { ...base, status: "missing" };
    if (!record?.version) return { ...base, status: "unverifiable", note: `no ${RECORD}: nothing shows which version this copy is` };
    if (!newest) return { ...base, status: "unknown", note: "the registry was unreachable: cannot tell whether it is the newest" };
    return { ...base, status: newer(newest, record.version) ? "stale" : "newest" };
  });
  return { into, ok: results.every((r) => r.status === "newest"), results };
}

function main(argv) {
  const opt = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const json = argv.includes("--json");
  const into = path.resolve(opt("--into", path.join(".claude", "skills")));
  const out = (obj, lines) => { console.log(json ? JSON.stringify(obj, null, 2) : lines.join("\n")); return obj.ok === false ? 1 : 0; };
  if (argv.includes("--list")) {
    const list = listSkills();
    const offline = list.some((x) => !x.newest);
    return out({ ok: !offline, skills: list, note: offline ? "could not reach the npm registry: newest versions unknown; the jsDelivr URLs always serve the newest" : null },
      [...list.map((x) => `${x.package.padEnd(13)} ${x.newest || "(unknown: offline)"}  ${x.url}`), ...(offline ? ["could not reach the npm registry: the jsDelivr URLs always serve the newest"] : [])]);
  }
  if (argv.includes("--check")) {
    const r = checkSkills(into);
    return out(r, [`skills in ${into}:`, ...r.results.map((x) => `  ${x.package.padEnd(13)} ${x.status}${x.installed ? ` (has ${x.installed})` : ""}${x.newest ? `, newest ${x.newest}` : ""}${x.note ? ` — ${x.note}` : ""}`),
      r.ok ? "all are the newest" : `not all are the newest: run \`node ${path.relative(process.cwd(), fileURLToPath(import.meta.url))} --into ${path.relative(process.cwd(), into) || "."}\`, or read ${skillUrl("<pkg>")}`]);
  }
  const r = installSkills(into);
  return out(r, [...r.results.map((x) => `  ${x.package.padEnd(13)} ${x.status === "unavailable" ? `unavailable — ${x.note}` : `${x.version} → ${x.into}${x.status === "newest" ? "" : " (may be stale)"}`}`), ...(r.note ? [r.note] : [`the newest skills are in ${into}`])]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
