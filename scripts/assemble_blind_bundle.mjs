#!/usr/bin/env node
// Assemble the BLIND key-fact review bundle — the one surface a fresh, independent reviewer sees.
//
// The CONFIDENCE promise stakes the critique's power on INDEPENDENCE: a reviewer blind to how the
// result was produced, judging only the result against the criteria. `lib/blind_bundle.mjs` builds
// that surface by allowlist. This command is its product caller: it writes the bundle OUTSIDE the
// package (reports/, never shipped, never indexed), prints the bundle digest, and that digest is
// what the review must declare (`independence.bundleSha256`) and what the gate binds against
// (`bindings.blindBundleSha256`). Independence is thereby assembled and verified, not declared.
//
// Usage: node scripts/assemble_blind_bundle.mjs --root package --out reports/blind-bundle [--json]
import fs from "node:fs";
import path from "node:path";
import { assembleBlindBundle, blindBundleDigest, renderBlindBundle, serializeBlindBundle } from "./lib/blind_bundle.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const root = path.resolve(opt("--root", "package"));
const out = path.resolve(opt("--out", "reports/blind-bundle"));

if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`assemble-blind-bundle: package root not found: ${root}`);
  process.exit(2);
}
// The bundle must never land INSIDE the package: it would become an untracked component (the
// coherence gate refuses), it would be packed, and a later bundle would embed the earlier one.
const rel = path.relative(root, out);
if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
  console.error(`assemble-blind-bundle: --out must be OUTSIDE the package root (got ${out} inside ${root}); use reports/blind-bundle`);
  process.exit(2);
}

const bundle = assembleBlindBundle(root);
if (bundle.deliverables.length === 0) {
  console.error("assemble-blind-bundle: the package has no deliverables to review (concepts/, study-guide/, slides/, assessment-support/, practice/).");
  process.exit(2);
}
const json = serializeBlindBundle(bundle);
const digest = blindBundleDigest(root);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "bundle.json"), json);
fs.writeFileSync(path.join(out, "bundle.md"), renderBlindBundle(bundle, digest));
const manifest = {
  schemaVersion: 1,
  root,
  bundleSha256: digest,
  deliverables: bundle.deliverables.map((d) => d.path),
  withheld: bundle.excluded.filter((e) => e.class === "process").map((e) => e.path),
  outOfScope: bundle.excluded.filter((e) => e.class === "out-of-scope").length,
  criteria: bundle.criteria,
  next: "Hand ONLY bundle.md to the fresh reviewer; record its verdicts in private/coursewerk/KEY_FACT_REVIEW.json with independence.bundleSha256 = bundleSha256; then run npm run bind:key-fact-review.",
};
fs.writeFileSync(path.join(out, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ action: "assembled", out, bundleSha256: digest, deliverables: manifest.deliverables.length, withheld: manifest.withheld.length }, null, 2));
