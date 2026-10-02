// The newest Alembic package contract (D37, operator 2026-10-02: "Alembic contract may update as well in rare case,
// Coursewerk should always fetch the newest one"). The source of truth is the public Alembic repository's
// packages/package-contract: pure TypeScript, no IO. Coursewerk fetches its newest commit into a cache outside the
// package and the harness, and runs Alembic's own validateProject on the package, so a contract change is enforced
// the day it lands, not when someone updates the local mirror (scripts/lib/contract.mjs, kept for offline checks).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const CONTRACT_REPO = "wangyu16/Alembic";
export const CONTRACT_PATH = "packages/package-contract";
// carrier kinds Alembic's registry knows; injected by the caller, as validateProject asks
export const KNOWN_CARRIERS = Object.freeze([".md.html", ".slides.html", ".paged.html", ".ketcher.svg", ".plot.svg"]);
export const contractCache = () => path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "coursewerk", "alembic-contract");

const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", timeout: 300000, ...opts });

/** The newest commit touching the contract package, or null offline. */
export function newestCommit({ run = sh } = {}) {
  const r = run("git", ["ls-remote", `https://github.com/${CONTRACT_REPO}.git`, "HEAD"], { timeout: 30000 });
  const sha = r.status === 0 ? String(r.stdout).split(/\s/)[0] : "";
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

/** Fetch the contract package at a commit into the cache (once), with its one dependency and a TypeScript runner. */
export function fetchContract(sha, { run = sh, cache = contractCache() } = {}) {
  const dir = path.join(cache, sha.slice(0, 12));
  if (fs.existsSync(path.join(dir, "ready"))) return dir;
  fs.rmSync(dir, { recursive: true, force: true });
  const steps = [
    ["git", ["clone", "--quiet", "--filter=blob:none", "--no-checkout", `https://github.com/${CONTRACT_REPO}.git`, dir]],
    ["git", ["-C", dir, "sparse-checkout", "set", "--no-cone", `/${CONTRACT_PATH}/`]],
    ["git", ["-C", dir, "checkout", "--quiet", sha]],
    ["npm", ["install", "--no-audit", "--no-fund", "--prefix", path.join(dir, CONTRACT_PATH), "zod@^4", "tsx@^4"]],
  ];
  for (const [c, a] of steps) { const r = run(c, a); if (r.status !== 0) { fs.rmSync(dir, { recursive: true, force: true }); return null; } }
  fs.writeFileSync(path.join(dir, "ready"), `${sha}\n`);
  return dir;
}

/** Every file of the package, tagged with the repo it goes to (instructor-only content lives under private/). */
export function projectFiles(root) {
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === ".git") continue; const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else out.push(path.relative(root, f).split(path.sep).join("/")); } };
  walk(root);
  return out.sort().map((p) => ({ repo: /^private(-instructor)?\//.test(p) ? "private" : "public", path: p }));
}

const RUNNER = `import { validateProject } from "./src/index.ts";
let s = ""; process.stdin.on("data", (d) => (s += d)); process.stdin.on("end", () => {
  const { input, opts } = JSON.parse(s); process.stdout.write(JSON.stringify(validateProject(input, opts)));
});
`;

/** Run Alembic's own validator, at the fetched commit, on a package. */
export function validateWithContract(dir, root, { run = sh } = {}) {
  const pkgDir = path.join(dir, CONTRACT_PATH);
  fs.writeFileSync(path.join(pkgDir, "coursewerk-run.ts"), RUNNER);
  let manifest = null; try { manifest = JSON.parse(fs.readFileSync(path.join(root, "alembic.json"), "utf8")); } catch { manifest = null; }
  const input = { manifest, files: projectFiles(root) };
  const r = run(path.join(pkgDir, "node_modules", ".bin", "tsx"), [path.join(pkgDir, "coursewerk-run.ts")], { input: JSON.stringify({ input, opts: { knownCarrierExtensions: [...KNOWN_CARRIERS] } }), cwd: pkgDir });
  if (r.status !== 0) return { ok: false, issues: [{ message: `the contract validator did not run: ${String(r.stderr).slice(0, 300)}`, severity: "error" }], ran: false };
  return { ...JSON.parse(r.stdout), ran: true };
}

/**
 * Check a package against the newest Alembic contract.
 * @returns { checked: "newest" | "unreachable", commit, ok, errors, warnings, note }
 */
export function checkNewestContract(root, { newest = newestCommit, fetch = fetchContract, validate = validateWithContract } = {}) {
  const commit = newest();
  if (!commit) return { checked: "unreachable", commit: null, ok: null, errors: [], warnings: [], note: "could not reach the Alembic repository: checked only against the harness's local mirror of the contract" };
  const dir = fetch(commit);
  if (!dir) return { checked: "unreachable", commit, ok: null, errors: [], warnings: [], note: `could not fetch the Alembic contract at ${commit.slice(0, 7)}: checked only against the harness's local mirror` };
  const v = validate(dir, root);
  const issues = v.issues || [];
  return { checked: "newest", commit, ok: !!v.ok, errors: issues.filter((i) => i.severity !== "warning"), warnings: issues.filter((i) => i.severity === "warning"), note: null };
}
