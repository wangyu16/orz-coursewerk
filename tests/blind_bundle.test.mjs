// Blind-bundle assembler tests — INFORMATION ISOLATION as a provable property (G3 sub-part b).
//
// The CONFIDENCE promise stakes the critique's power on INDEPENDENCE, not model diversity: the
// reviewer is blind to how the result was produced. `assembleBlindBundle` builds the surface that
// reviewer sees; these tests prove the blindness by PLANTING process-context sentinels (a
// generation-log line, a prior reviewer's APPROVED verdict, an AI-assistance disclosure) into a
// real package and asserting NONE of them survives anywhere in the serialized bundle — while the
// RESULT (deliverable text) and the CRITERIA do survive. A blind spot that leaks process context
// would silently defeat the whole independence argument, so it is tested as hard as inclusion.
//
// Free, deterministic, offline. The live independence-gradient measurement is S-CONF-crit (G10).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleBlindBundle } from "../scripts/lib/blind_bundle.mjs";
import { REQUIRED_KEY_FACT_CHECKS } from "../scripts/lib/key_fact_review.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Three unmistakable strings that only ever live in PROCESS context. If any reaches the bundle,
// the reviewer is no longer blind.
const SENTINEL_TRANSCRIPT = "PROCESS_SENTINEL_generation_transcript_step_7_agent_said_XYZZY";
const SENTINEL_PRIOR_VERDICT = "PROCESS_SENTINEL_prior_reviewer_APPROVED_do_not_look_further";
const SENTINEL_AI_DISCLOSURE = "PROCESS_SENTINEL_authored_by_model_and_edited_by_operator_QUUX";

// Build a throwaway package: the real usage-package deliverables + planted process context.
function plantedPackage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blind-bundle-"));
  const src = path.join(repo, "tests/fixtures/usage-package");
  fs.cpSync(src, dir, { recursive: true });

  // (1) generation log with a transcript line
  fs.writeFileSync(path.join(dir, "private/coursewerk/PROVENANCE.json"),
    JSON.stringify({ schemaVersion: 1, items: [{ step: 7, note: SENTINEL_TRANSCRIPT }] }));
  // (2) a PRIOR reviewer's verdict sitting in the package
  fs.writeFileSync(path.join(dir, "private/coursewerk/KEY_FACT_REVIEW.json"),
    JSON.stringify({ schemaVersion: 1, mode: "full", verdict: SENTINEL_PRIOR_VERDICT }));
  // (3) authoring accountability / AI-assistance disclosure inside FOUNDATION.outputAuthors
  const foundation = JSON.parse(fs.readFileSync(path.join(dir, "private/coursewerk/FOUNDATION.json"), "utf8"));
  foundation.outputAuthors = [{ name: "Someone", aiAssistanceDisclosure: SENTINEL_AI_DISCLOSURE }];
  fs.writeFileSync(path.join(dir, "private/coursewerk/FOUNDATION.json"), JSON.stringify(foundation));
  return dir;
}

test("blind bundle carries the RESULT — every deliverable, verbatim", () => {
  const dir = plantedPackage();
  try {
    const bundle = assembleBlindBundle(dir);
    const paths = bundle.deliverables.map((d) => d.path);
    for (const rel of ["concepts/melting.md", "study-guide/melting.md", "slides/melting.md",
      "assessment-support/melting.md", "practice/melting.md"])
      assert.ok(paths.includes(rel), `deliverable ${rel} must be in the blind bundle`);
    const sg = bundle.deliverables.find((d) => d.path === "study-guide/melting.md");
    assert.equal(sg.text, fs.readFileSync(path.join(dir, "study-guide/melting.md"), "utf8"),
      "deliverable text must be the RESULT verbatim");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("blind bundle carries the CRITERIA the reviewer judges against", () => {
  const dir = plantedPackage();
  try {
    const bundle = assembleBlindBundle(dir);
    assert.deepEqual(bundle.criteria, [...REQUIRED_KEY_FACT_CHECKS]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("PROVABLE BLINDNESS — no planted process sentinel survives anywhere in the bundle", () => {
  const dir = plantedPackage();
  try {
    const serialized = JSON.stringify(assembleBlindBundle(dir));
    // Sanity: the sentinels really are on disk (else the test would pass vacuously).
    const provenance = fs.readFileSync(path.join(dir, "private/coursewerk/PROVENANCE.json"), "utf8");
    assert.ok(provenance.includes(SENTINEL_TRANSCRIPT), "guard: sentinel must exist on disk");
    for (const sentinel of [SENTINEL_TRANSCRIPT, SENTINEL_PRIOR_VERDICT, SENTINEL_AI_DISCLOSURE])
      assert.ok(!serialized.includes(sentinel),
        `process sentinel leaked into the blind bundle: ${sentinel}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("EVERY withheld process file is named in the audit trail (no silent drop)", () => {
  const dir = plantedPackage();
  try {
    const { excluded } = assembleBlindBundle(dir);
    const processExcl = excluded.filter((e) => e.class === "process");
    const withheld = new Set(processExcl.map((e) => e.path));
    assert.ok(withheld.has("private/coursewerk/PROVENANCE.json"), "PROVENANCE must be recorded as withheld");
    assert.ok(withheld.has("private/coursewerk/KEY_FACT_REVIEW.json"), "prior review must be recorded as withheld");
    assert.ok(withheld.has("private/coursewerk/FOUNDATION.json#outputAuthors"), "outputAuthors must be recorded as withheld");
    for (const e of processExcl) assert.ok(e.reason && e.reason.length >= 10, `withheld ${e.path} needs a reason`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("verification INPUTS survive — sources projected to identity+rights facts only, no tooling", () => {
  const dir = plantedPackage();
  try {
    const bundle = assembleBlindBundle(dir);
    assert.ok(bundle.sources.length >= 1, "declared sources must reach the reviewer");
    const s = bundle.sources[0];
    assert.equal(s.id, "src.synthetic.handbook.rev1");
    assert.ok("rights" in s && s.rights.type, "rights facts must be present for the licence check");
    // The raw source carries evidenceCapture tooling/timestamps — the projection must NOT leak them.
    assert.ok(!JSON.stringify(bundle.sources).includes("evidenceCapture"), "evidence-capture tooling must be dropped");
    assert.ok(!JSON.stringify(bundle.sources).includes("preflightReceipt"), "preflight receipt path must be dropped");
    assert.equal(typeof bundle.license, "string", "LICENSE text must reach the reviewer");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("assembler is robust to a minimal package (no FOUNDATION / LICENSE)", () => {
  const bundle = assembleBlindBundle(path.join(repo, "tests/fixtures/mini-package"));
  assert.ok(bundle.deliverables.some((d) => d.path === "study-guide/phase-change.md"));
  assert.equal(bundle.license, null);
  assert.deepEqual(bundle.sources, []);
  // Its lone metadata file (SOURCE_RECORD) is a projected input, not an exclusion; nothing raw leaks.
  assert.ok(bundle.sourceRecord && bundle.sourceRecord.schemaVersion === 1);
});

// ---- the PRODUCT PATH (W18 closed): a documented command, a digest, and a gate that binds to it ----
import { spawnSync } from "node:child_process";
import { auditKeyFactReview, makeKeyFactBindings } from "../scripts/lib/key_fact_review.mjs";
import crypto from "node:crypto";
import { blindBundleDigest, serializeBlindBundle, serializeJudgedSurface } from "../scripts/lib/blind_bundle.mjs";

function cli(script, args) {
  const res = spawnSync(process.execPath, [path.join(repo, "scripts", script), ...args], { cwd: repo, encoding: "utf8" });
  return { code: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}
function usagePackage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blind-bundle-cli-"));
  const pkg = path.join(dir, "package");
  fs.cpSync(path.join(repo, "tests/fixtures/usage-package"), pkg, { recursive: true });
  return { dir, pkg };
}

test("PRODUCT PATH · the documented command writes the bundle OUTSIDE the package and prints its digest", () => {
  const { dir, pkg } = usagePackage();
  const out = path.join(dir, "reports", "blind-bundle");
  const res = cli("assemble_blind_bundle.mjs", ["--root", pkg, "--out", out]);
  assert.equal(res.code, 0, res.stderr);
  const printed = JSON.parse(res.stdout);
  assert.match(printed.bundleSha256, /^[a-f0-9]{64}$/);
  for (const f of ["bundle.json", "bundle.md", "MANIFEST.json"]) assert.ok(fs.existsSync(path.join(out, f)), f);
  // the package gained NOTHING — the bundle is a report, never a component
  const inPkg = fs.readdirSync(pkg).filter((n) => /bundle/i.test(n));
  assert.deepEqual(inPkg, []);
  // the rendered document carries the digest a reviewer copies into the review
  assert.ok(fs.readFileSync(path.join(out, "bundle.md"), "utf8").includes(`bundleSha256: ${printed.bundleSha256}`));
  // the written bundle is the judged surface + the withheld audit trail; the digest is over the
  // judged surface ONLY, so writing the review (a withheld file) can never move it
  const bytes = fs.readFileSync(path.join(out, "bundle.json"), "utf8");
  assert.equal(bytes, serializeBlindBundle(assembleBlindBundle(pkg)));
  assert.equal(printed.bundleSha256, crypto.createHash("sha256").update(serializeJudgedSurface(assembleBlindBundle(pkg))).digest("hex"));
  assert.equal(printed.bundleSha256, blindBundleDigest(pkg));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("PRODUCT PATH · the command REFUSES to write inside the package", () => {
  const { dir, pkg } = usagePackage();
  const res = cli("assemble_blind_bundle.mjs", ["--root", pkg, "--out", path.join(pkg, "metadata", "bundle")]);
  assert.notEqual(res.code, 0);
  assert.match(res.stderr, /OUTSIDE the package root/);
  assert.equal(fs.existsSync(path.join(pkg, "metadata", "bundle")), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("DIGEST · deterministic across runs, and moves when the RESULT moves — never when process context moves", () => {
  const { dir, pkg } = usagePackage();
  const d1 = blindBundleDigest(pkg);
  assert.equal(blindBundleDigest(pkg), d1, "same package, same bytes");
  // process context changes (a new generation log) must NOT move the digest — the reviewer never sees it
  fs.writeFileSync(path.join(pkg, "private/coursewerk/PROVENANCE.json"), JSON.stringify({ schemaVersion: 1, items: [{ note: "regenerated" }] }));
  assert.equal(blindBundleDigest(pkg), d1, "process context is outside the bundle, so outside the digest");
  // recording the review itself (a withheld process file) must not move it either — self-binding is forbidden
  fs.writeFileSync(path.join(pkg, "private/coursewerk/KEY_FACT_REVIEW.json"), JSON.stringify({ schemaVersion: 1, mode: "light" }));
  assert.equal(blindBundleDigest(pkg), d1, "the review is not bound into itself");
  // a deliverable edit MUST move it — the reviewer would be judging a different result
  const sg = path.join(pkg, "study-guide/melting.md");
  fs.writeFileSync(sg, fs.readFileSync(sg, "utf8").replace("0 °C", "5 °C"));
  assert.notEqual(blindBundleDigest(pkg), d1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("GATE · a key-fact review that does not name the bundle it judged, or names a different one, is refused", () => {
  const { dir, pkg } = usagePackage();
  const foundation = JSON.parse(fs.readFileSync(path.join(pkg, "private/coursewerk/FOUNDATION.json"), "utf8"));
  const reviewFile = path.join(pkg, "private/coursewerk/KEY_FACT_REVIEW.json");
  const base = {
    schemaVersion: 1, mode: "light", reviewKind: "same-model-independent-pass",
    authoringSystem: "author-x", authoringModelId: "model-1",
    reviewer: { type: "ai", name: "reviewer-x", modelId: "model-1" },
    independence: { separatePass: true, contextReset: true, approach: "A fresh context reviewed the completed materials independently after drafting ended." },
    reviewedAt: "2026-09-05",
    checks: REQUIRED_KEY_FACT_CHECKS.map((id) => ({ id, status: "passed", note: `Examined ${id} independently against the bundle; nothing to qualify.` })),
    keyFacts: [{ id: "fact-1", claim: "Pure water melts at 0 °C at standard pressure.", status: "verified",
      evidenceSourceIds: [foundation.sources[0].id], usedIn: ["study-guide/melting.md"], note: "Traced to the declared source; consistent across the study guide and practice sheet." }],
  };
  const write = (review) => fs.writeFileSync(reviewFile, JSON.stringify({ ...review, bindings: makeKeyFactBindings(pkg) }, null, 2));

  write(base);                                           // no digest declared
  let audit = auditKeyFactReview(pkg, foundation);
  assert.equal(audit.ready, false);
  assert.ok(audit.failures.some((f) => /bundleSha256 must record/.test(f)), audit.failures.join("\n"));

  write({ ...base, independence: { ...base.independence, bundleSha256: "0".repeat(64) } });   // a different bundle
  audit = auditKeyFactReview(pkg, foundation);
  assert.equal(audit.ready, false);
  assert.ok(audit.failures.some((f) => /does not match the current blind bundle/.test(f)), audit.failures.join("\n"));

  write({ ...base, independence: { ...base.independence, bundleSha256: blindBundleDigest(pkg) } });  // the real one
  audit = auditKeyFactReview(pkg, foundation);
  assert.deepEqual(audit.failures, []);
  assert.equal(audit.ready, true);

  // and the binding is LIVE: edit a deliverable after the review and the review is stale on both counts
  const sg = path.join(pkg, "study-guide/melting.md");
  fs.writeFileSync(sg, fs.readFileSync(sg, "utf8") + "\nA sentence added after the review.\n");
  audit = auditKeyFactReview(pkg, foundation);
  assert.equal(audit.ready, false);
  assert.ok(audit.failures.some((f) => /bindings are stale/.test(f)));
  assert.ok(audit.failures.some((f) => /does not match the current blind bundle/.test(f)));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("GATE · bind:key-fact-review can stamp the digest the reviewer was handed", () => {
  const { dir, pkg } = usagePackage();
  const digest = blindBundleDigest(pkg);
  const reviewFile = path.join(pkg, "private/coursewerk/KEY_FACT_REVIEW.json");
  const foundation = JSON.parse(fs.readFileSync(path.join(pkg, "private/coursewerk/FOUNDATION.json"), "utf8"));
  fs.writeFileSync(reviewFile, JSON.stringify({
    schemaVersion: 1, mode: "light", reviewKind: "same-model-independent-pass",
    authoringSystem: "author-x", authoringModelId: "model-1", reviewer: { type: "ai", name: "reviewer-x", modelId: "model-1" },
    independence: { separatePass: true, contextReset: true, approach: "A fresh context reviewed the completed materials independently after drafting ended." },
    reviewedAt: "2026-09-05",
    checks: REQUIRED_KEY_FACT_CHECKS.map((id) => ({ id, status: "passed", note: `Examined ${id} independently against the bundle; nothing to qualify.` })),
    keyFacts: [{ id: "fact-1", claim: "Pure water melts at 0 °C at standard pressure.", status: "verified",
      evidenceSourceIds: [foundation.sources[0].id], usedIn: ["study-guide/melting.md"], note: "Traced to the declared source; consistent across the study guide and practice sheet." }],
  }, null, 2));
  const res = cli("bind_key_fact_review.mjs", ["--root", pkg, "--bundle-sha256", digest]);
  assert.equal(res.code, 0, res.stderr);
  const bound = JSON.parse(fs.readFileSync(reviewFile, "utf8"));
  assert.equal(bound.independence.bundleSha256, digest);
  assert.equal(auditKeyFactReview(pkg, foundation).ready, true, "a stamped, matching digest passes the gate");
  fs.rmSync(dir, { recursive: true, force: true });
});
