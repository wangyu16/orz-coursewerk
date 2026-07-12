#!/usr/bin/env node
// build_carriers — assemble the orz framework shells for LOCAL reading/preview + QA.
//
// coursewerk authors LEAN markdown (the source of truth) and SHIPS lean. But while
// authoring you want to see the real, self-contained document — so this builds each
// lean source into its framework carrier via the orz family, into a throwaway
// `preview/` tree (git-ignored, never uploaded; Alembic rebuilds carriers on its side).
//
//   study-guide/*.md , practice/*.md  → *.md.html      (orz-mdhtml)
//   slides/*.md                        → *.slides.html  (orz-slides)
//   paged/*.md                         → *.paged.html   (orz-paged)
//
// Usage: node build_carriers.mjs --package <dir> --out <dir> [--theme <name>]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LEAN_SOURCE } from "./lib/contract.mjs";

const args = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const pkg = path.resolve(opt("--package", "package"));
const outRoot = path.resolve(opt("--out", "preview"));
const theme = opt("--theme");
if (!fs.existsSync(pkg)) {
  console.error(`build_carriers: package dir not found: ${pkg}`);
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const binDir = path.join(repoRoot, "node_modules", ".bin");

// which builder handles which top-level folder
const BUILDER_FOR = {
  "study-guide": LEAN_SOURCE["study-guide"],
  practice: LEAN_SOURCE.practice,
  slides: LEAN_SOURCE.slides,
  paged: LEAN_SOURCE.paged,
};

function walk(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

function runBuilder(builder, input, output) {
  const bin = path.join(binDir, builder);
  if (!fs.existsSync(bin)) {
    console.error(`build_carriers: ${builder} not installed — run \`npm install\` first.`);
    process.exit(2);
  }
  const cliArgs = [input, "-o", output];
  if (theme) cliArgs.push("--theme", theme);
  const res = spawnSync(process.execPath, [bin, ...cliArgs], { encoding: "utf8" });
  if (res.status !== 0) {
    console.error(`build_carriers: ${builder} failed on ${input}:\n${res.stderr || res.stdout}`);
    return false;
  }
  return true;
}

// clean the preview tree, then rebuild
fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(outRoot, { recursive: true });

let built = 0;
let failed = 0;
for (const [top, spec] of Object.entries(BUILDER_FOR)) {
  const srcDir = path.join(pkg, top);
  for (const src of walk(srcDir).filter((f) => f.endsWith(spec.ext))) {
    const relPath = path.relative(pkg, src).replaceAll(path.sep, "/");
    const outPath = path.join(outRoot, relPath.replace(/\.md$/, spec.carrier));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    if (runBuilder(spec.builder, src, outPath)) built += 1;
    else failed += 1;
  }
}

// copy assets/ so relative figure links resolve in the preview carriers
const assetsSrc = path.join(pkg, "assets");
if (fs.existsSync(assetsSrc)) {
  fs.cpSync(assetsSrc, path.join(outRoot, "assets"), { recursive: true });
}

console.log(JSON.stringify({ package: pkg, preview: outRoot, carriersBuilt: built, failed }, null, 2));
process.exit(failed > 0 ? 1 : 0);
