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
  fs.writeFileSync(path.join(dir, "metadata/PROVENANCE.json"),
    JSON.stringify({ schemaVersion: 1, items: [{ step: 7, note: SENTINEL_TRANSCRIPT }] }));
  // (2) a PRIOR reviewer's verdict sitting in the package
  fs.writeFileSync(path.join(dir, "metadata/KEY_FACT_REVIEW.json"),
    JSON.stringify({ schemaVersion: 1, mode: "full", verdict: SENTINEL_PRIOR_VERDICT }));
  // (3) authoring accountability / AI-assistance disclosure inside FOUNDATION.outputAuthors
  const foundation = JSON.parse(fs.readFileSync(path.join(dir, "metadata/FOUNDATION.json"), "utf8"));
  foundation.outputAuthors = [{ name: "Someone", aiAssistanceDisclosure: SENTINEL_AI_DISCLOSURE }];
  fs.writeFileSync(path.join(dir, "metadata/FOUNDATION.json"), JSON.stringify(foundation));
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
    const provenance = fs.readFileSync(path.join(dir, "metadata/PROVENANCE.json"), "utf8");
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
    assert.ok(withheld.has("metadata/PROVENANCE.json"), "PROVENANCE must be recorded as withheld");
    assert.ok(withheld.has("metadata/KEY_FACT_REVIEW.json"), "prior review must be recorded as withheld");
    assert.ok(withheld.has("metadata/FOUNDATION.json#outputAuthors"), "outputAuthors must be recorded as withheld");
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
