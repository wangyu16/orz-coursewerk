#!/usr/bin/env node
// pack — produce the LEAN upload zip for Alembic (framework-free).
//
// Ships only what Alembic needs: alembic.json + LICENSE + the lean .md sources +
// assets + metadata/private. Explicitly EXCLUDES the heavy framework carriers
// (.md.html / .slides.html / .paged.html) — Alembic reassembles those on its side.
// The alembic.json is placed at the ZIP ROOT so Alembic ingests with zero friction.
//
// Usage: node pack.mjs --package <dir> --out <dir>
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { isCarrierPath } from "./lib/contract.mjs";

const args = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const pkg = path.resolve(opt("--package", "package"));
const outDir = path.resolve(opt("--out", "dist"));
if (!fs.existsSync(path.join(pkg, "alembic.json"))) {
  console.error(`pack: no alembic.json at ${pkg} — is this an assembled package?`);
  process.exit(2);
}

function walk(root) {
  const out = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

// stage a lean copy, dropping carriers + junk
const staged = fs.mkdtempSync(path.join(outDir === pkg ? pkg : path.dirname(outDir), ".cw-pack-"));
let files = 0;
let dropped = 0;
for (const f of walk(pkg)) {
  const relPath = path.relative(pkg, f).replaceAll(path.sep, "/");
  if (relPath.startsWith(".git/") || relPath === ".DS_Store" || relPath.endsWith("/.DS_Store")) continue;
  if (isCarrierPath(relPath)) {
    dropped += 1; // never ship the framework shell
    continue;
  }
  const dest = path.join(staged, relPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(f, dest);
  files += 1;
}

fs.mkdirSync(outDir, { recursive: true });
const title = JSON.parse(fs.readFileSync(path.join(pkg, "alembic.json"), "utf8")).title || "course";
const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "course";
const zipPath = path.join(outDir, `${base}.alembic.zip`);
fs.rmSync(zipPath, { force: true });

// zip from inside the staged dir so alembic.json sits at the archive root
const res = spawnSync("zip", ["-r", "-q", zipPath, "."], { cwd: staged, encoding: "utf8" });
fs.rmSync(staged, { recursive: true, force: true });
if (res.status !== 0) {
  console.error(`pack: zip failed:\n${res.stderr || res.stdout}`);
  process.exit(2);
}

const size = fs.statSync(zipPath).size;
console.log(JSON.stringify({ zip: zipPath, filesPacked: files, carriersDropped: dropped, bytes: size }, null, 2));
