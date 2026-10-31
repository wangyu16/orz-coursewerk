// M14 semantic-index WRITER tests — written as a defense of the ROUND TRIP, not a demo of a file
// appearing on disk.
//
// The order is deliberate. The round-trip test is FIRST because it is the only thing whose
// absence would make this module decorative. That three JSON files got written is trivia; that
// `matchClaims(stored, fresh)` can see a real edit — because a REAL "before" was persisted as
// REAL BYTES and read back from disk — is the entire reason the module exists. Every claim the
// product makes about detecting a value change reduces to that one comparison having an `old` to
// make. If this file proves one thing, it is that the answer key's value moving from 100 °C to
// 0 °C is visible as a `content` fingerprint delta between an artifact on disk and a fresh
// compute, with the claim's IDENTITY intact across the edit.
//
// Every assertion is paired with its negative. It is not enough that the edited claim's content
// fingerprint moved; the untouched claims must be provably UNMOVED, because an index that
// reports everything changed is the byte-hash bug wearing a claim-shaped hat — and that bug is
// the reason this index exists. Likewise it is not enough that `EXCLUDE.has(x)` is true: that
// restates the implementation. The proof is that a package CARRYING the artifacts passes the
// REAL coherence audit, and that a non-excluded file in the same position makes it fail — which
// is how M11 found the bug in the first place.
//
// Free, deterministic, no network. The golden fixture is treated as READ-ONLY: every mutation
// runs against a fresh mkdtemp copy, which is cleaned up.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  SEMANTIC_INDEX_PATHS,
  SPINE_PATH,
  TERMS_PATH,
  CLAIMS_PATH,
  computeSemanticIndex,
  loadSemanticIndex,
  writeSemanticIndex,
} from "../scripts/lib/semantic_index.mjs";
import {
  auditCoherence,
  computeComponentGraph,
  makeComponentIndex,
  recordAcceptedCoherence,
  writeComponentIndex,
} from "../scripts/lib/coherence.mjs";
import { commitOutput, ensureOutputGit } from "../scripts/lib/output_git.mjs";
import { matchClaims } from "../scripts/lib/claims.mjs";
import { acceptBaseline } from "./helpers/baseline.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(repo, "tests/fixtures/mini-package");
const CLI = path.join(repo, "scripts/index_semantic.mjs");

const temps = [];
test.after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

/** A throwaway copy of the golden fixture. The fixture itself is never mutated. */
function tempPackage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-m14-"));
  temps.push(dir);
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

/** An empty temp dir — a package that is not one yet. */
function emptyDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-m14-empty-"));
  temps.push(dir);
  return dir;
}

/**
 * Bring a package to the state the coherence gate calls ACCEPTED: git baseline, component index,
 * and the external ledger recording that exact index. This is `acceptCoherentState` from
 * tests/assurance.test.mjs — the same three calls in the same order, because a bespoke
 * almost-accepted state would prove nothing about the real gate.
 */
function acceptCoherentState(root, message = "test: accept coherent state") {
  ensureOutputGit(root);
  const index = makeComponentIndex(computeComponentGraph(root));
  writeComponentIndex(root, index);
  const commit = commitOutput(root, message);
  recordAcceptedCoherence(root, index, commit.head, { action: "test" });
}

const SG = "study-guide/phase-change.md";
const read = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");

/** The claim whose text starts with `prefix` — a readable handle for a hashed id. */
function claimStarting(claims, prefix) {
  const hits = claims.filter((c) => c.text.startsWith(prefix));
  assert.equal(hits.length, 1, `expected exactly one claim starting ${JSON.stringify(prefix)}`);
  return hits[0];
}

// --- THE ROUND TRIP: the whole point --------------------------------------------------------

test("ROUND TRIP: stored artifact + fresh compute = a delta matchClaims can see", () => {
  const root = tempPackage();

  // 1. ACCEPT: the "before" is written to disk, as real bytes.
  const before = computeSemanticIndex(root);
  writeSemanticIndex(root, before);

  // 2. EDIT a deliverable. A value change: the one edit the product exists to catch.
  const original = read(root, SG);
  assert.ok(original.includes("melting point of water is 100 °C"), "fixture precondition");
  fs.writeFileSync(path.join(root, SG), original.replace("is 100 °C", "is 0 °C"));

  // 3. RECOMPUTE, and read the "before" back FROM DISK — not from the variable above. A test
  //    that compares two in-memory computes proves nothing about persistence, which is the only
  //    thing this module contributes.
  const stored = loadSemanticIndex(root);
  assert.equal(stored.complete, true);
  assert.equal(stored.claims.error, null);
  const fresh = computeSemanticIndex(root);

  const delta = matchClaims(stored.claims.index, fresh.claims);
  // `matched` carries IDS (interfaces §4's key is the identity, not the payload), so resolve them
  // back to the claims on each side to compare fingerprints across the edit.
  const byId = (claims) => new Map(claims.map((c) => [c.id, c]));
  const olds = byId(stored.claims.index.claims);
  const news = byId(fresh.claims.claims);

  // 4. THE CHANGE IS VISIBLE. Identity survives the edit (interfaces §4: a value change keeps the
  //    id — it is still "the melting point of water"), so it lands in `matched`, never as an
  //    add+remove pair. An id that moved would silently report the claim deleted and a new one
  //    born, and the human would never be asked about the contradiction.
  assert.deepEqual(delta.added, [], "a value change is not a new claim");
  assert.deepEqual(delta.removed, [], "a value change does not delete the old claim");
  assert.deepEqual(delta.split, []);
  assert.deepEqual(delta.merged, []);

  const oldFact = claimStarting(stored.claims.index.claims, "At standard pressure the melting point of water");
  const pair = delta.matched.find((m) => m.oldId === oldFact.id);
  assert.ok(pair, "the edited claim must match across the edit");
  assert.equal(pair.newId, oldFact.id, "interfaces §4: value change -> SAME id");

  // The delta itself: `content` moved. This is the signal every downstream layer reads, and it
  // exists ONLY because a prior state was on disk to compare against.
  const newFact = news.get(pair.newId);
  assert.notEqual(newFact.fingerprints.content, oldFact.fingerprints.content);
  assert.equal(newFact.text, "At standard pressure the melting point of water is 0 °C.");
  assert.equal(oldFact.text, "At standard pressure the melting point of water is 100 °C.");

  // THE NEGATIVE, and it is the more important half: everything else is provably UNMOVED. An
  // impact set containing the whole package is the failure this index replaces.
  const untouched = delta.matched.filter((m) => m.oldId !== oldFact.id);
  assert.ok(untouched.length > 0, "the fixture must carry claims the edit does not touch");
  for (const m of untouched) {
    assert.deepEqual(
      news.get(m.newId).fingerprints,
      olds.get(m.oldId).fingerprints,
      `${m.oldId} moved and should not have`,
    );
  }
});

test("ROUND TRIP negative: a null edit against the stored artifact moves NOTHING", () => {
  const root = tempPackage();
  writeSemanticIndex(root, computeSemanticIndex(root));

  // Whitespace only — spec §7's null-edit suite, target 0 flags.
  fs.writeFileSync(path.join(root, SG), read(root, SG).replace(/\n/g, "\n"));
  fs.appendFileSync(path.join(root, SG), "\n\n");

  const stored = loadSemanticIndex(root);
  const fresh = computeSemanticIndex(root);
  const delta = matchClaims(stored.claims.index, fresh.claims);
  const olds = new Map(stored.claims.index.claims.map((c) => [c.id, c]));
  const news = new Map(fresh.claims.claims.map((c) => [c.id, c]));
  assert.deepEqual(delta.added, []);
  assert.deepEqual(delta.removed, []);
  assert.ok(delta.matched.length > 0, "the fixture must carry claims to compare");
  for (const m of delta.matched) {
    assert.deepEqual(
      news.get(m.newId).fingerprints,
      olds.get(m.oldId).fingerprints,
      `${m.oldId}: a null edit moved a fingerprint`,
    );
  }
});

// --- determinism: the property the delta rests on -------------------------------------------

test("DETERMINISM: two runs over the same package produce byte-identical artifacts", () => {
  const a = tempPackage();
  const b = tempPackage();

  writeSemanticIndex(a, computeSemanticIndex(a));
  const first = SEMANTIC_INDEX_PATHS.map((rel) => read(a, rel));

  // Same package, written again over itself — a reindex must be a no-op, not a diff.
  writeSemanticIndex(a, computeSemanticIndex(a));
  assert.deepEqual(SEMANTIC_INDEX_PATHS.map((rel) => read(a, rel)), first, "rerun is not byte-identical");

  // And a DIFFERENT root holding the same content: the artifacts must not smuggle in an absolute
  // path, a temp dir name, or anything else about where the package happens to live.
  writeSemanticIndex(b, computeSemanticIndex(b));
  assert.deepEqual(SEMANTIC_INDEX_PATHS.map((rel) => read(b, rel)), first, "artifacts depend on the root path");

  // The mechanical half. A clock is the one contaminant that behavior cannot see: two runs in the
  // same millisecond agree, and the test would pass on this box forever while the artifact was
  // irreproducible everywhere else. So assert against the SOURCE that no clock is in the path —
  // interfaces §5d's promoted lesson (a defect in the artifact, not in observable behavior).
  // Comments are stripped first: this module's header ARGUES about `new Date().toISOString()` at
  // length (it is the field most worth arguing about), and a guard that cannot tell an argument
  // from a call would forbid explaining itself.
  const src = fs.readFileSync(path.join(repo, "scripts/lib/semantic_index.mjs"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.equal(/new Date\(|Date\.now\(|Math\.random\(/.test(src), false, "no clock/randomness in the index path");
  assert.match(
    fs.readFileSync(path.join(repo, "scripts/lib/semantic_index.mjs"), "utf8"),
    /new Date\(/,
    "guard precondition: the stripper must be tested against a file that mentions the clock in prose",
  );
  for (const rel of SEMANTIC_INDEX_PATHS) {
    const text = read(a, rel);
    assert.equal(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text), false, `${rel} carries a timestamp`);
    assert.equal(text.includes(a), false, `${rel} carries its absolute root path`);
    assert.equal(text.endsWith("}\n"), true, `${rel}: house serialization (2-space, trailing newline)`);
  }
});

// --- schema conformance ---------------------------------------------------------------------
//
// Walked from the schema FILE, never hand-copied: a copied rule is a second authority that can
// drift from the one the package is actually validated against (interfaces §5d), and the drifted
// copy passes its own test right up until the day it matters.

function conformsToSchema(value, schemaFile, what) {
  const schema = JSON.parse(fs.readFileSync(path.join(repo, "system/schemas/package", schemaFile), "utf8"));
  walk(value, schema, what);
  return schema;
}

/** A minimal, honest JSON-Schema walk: exactly the keywords these three schemas use. */
function walk(value, schema, at) {
  if (!schema || typeof schema !== "object") return;
  if ("const" in schema) assert.deepEqual(value, schema.const, `${at}: const`);
  if (schema.enum) assert.ok(schema.enum.includes(value), `${at}: ${JSON.stringify(value)} not in enum`);
  const types = schema.type ? [schema.type].flat() : null;
  if (types) {
    const actual = value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value;
    const ok = types.includes(actual) || (actual === "integer" && types.includes("number"));
    assert.ok(ok, `${at}: type ${actual} not in ${types.join("|")}`);
  }
  if (typeof value === "string") {
    if (schema.pattern) assert.match(value, new RegExp(schema.pattern), `${at}: pattern`);
    if (schema.minLength != null) assert.ok(value.length >= schema.minLength, `${at}: minLength`);
  }
  if (typeof value === "number") {
    if (schema.minimum != null) assert.ok(value >= schema.minimum, `${at}: minimum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null) assert.ok(value.length >= schema.minItems, `${at}: minItems`);
    if (schema.items) value.forEach((v, i) => walk(v, schema.items, `${at}[${i}]`));
    return;
  }
  if (value && typeof value === "object" && (schema.properties || schema.required)) {
    for (const req of schema.required || []) assert.ok(req in value, `${at}: missing required ${req}`);
    const props = schema.properties || {};
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(props));
      for (const key of Object.keys(value)) assert.ok(allowed.has(key), `${at}: stray field ${key}`);
    }
    for (const [key, sub] of Object.entries(props)) {
      if (key in value) walk(value[key], sub, `${at}.${key}`);
    }
  }
}

test("the three WRITTEN artifacts validate against their schemas — read back from disk", () => {
  const root = tempPackage();
  writeSemanticIndex(root, computeSemanticIndex(root));
  const stored = loadSemanticIndex(root);
  assert.equal(stored.complete, true);

  // The bytes on disk are what a consumer reads, so they are what is validated — not the
  // in-memory object, which could differ (a `undefined` field vanishes through JSON).
  const spine = conformsToSchema(stored.spine.index, "spine.schema.json", "SPINE");
  conformsToSchema(stored.terms.index, "terms.schema.json", "TERMS");
  conformsToSchema(stored.claims.index, "claims.schema.json", "CLAIMS");

  // The walk above vacuously passes on an empty artifact, so pin that these carry real content
  // and exercise the branches the schema describes.
  assert.ok(stored.spine.index.nodes.length > 0);
  assert.ok(stored.terms.index.terms.length > 0);
  assert.ok(stored.claims.index.claims.length > 0);
  assert.ok(spine.properties.nodes.items.required.includes("negative"));
  assert.ok(stored.spine.index.nodes.some((n) => n.negative === true), "the fixture's misconception survives the write");

  // The negative: the walker must actually refuse. A validator that passes everything is worse
  // than none — it certifies.
  assert.throws(() => walk({ schemaVersion: 2, terms: [] },
    JSON.parse(fs.readFileSync(path.join(repo, "system/schemas/package/terms.schema.json"), "utf8")), "T"));
  assert.throws(() => walk({ schemaVersion: 1, terms: [], stray: 1 },
    JSON.parse(fs.readFileSync(path.join(repo, "system/schemas/package/terms.schema.json"), "utf8")), "T"));
});

// --- THE EXCLUDE PROOF: empirical, the way M11 found the bug ---------------------------------

test("EXCLUDE PROOF: a package carrying the semantic artifacts still passes the REAL audit", () => {
  const root = tempPackage();
  acceptCoherentState(root);
  assert.deepEqual(auditCoherence(root).hardFailures, [], "precondition: the package is accepted and clean");

  // The gate emits its own artifacts into the package it just accepted.
  const run = spawnSync(process.execPath, [CLI, "--root", root], { encoding: "utf8" });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  for (const rel of SEMANTIC_INDEX_PATHS) assert.ok(fs.existsSync(path.join(root, rel)), `${rel} written`);

  // THE PROOF. Before EXCLUDE this produced `Git ??: private/coursewerk/SPINE.json` and "new component is
  // not in the coherence index" -> criticalTotal > 0 -> pack exits 1: the package failing its own
  // gate for emitting its own index.
  const audit = auditCoherence(root);
  assert.deepEqual(audit.hardFailures, [], "the semantic artifacts must not break the package's own gate");
  assert.deepEqual(audit.changed, [], "a derived index is not a component change");
  assert.deepEqual(audit.relationshipChanges, []);

  // ...and the artifacts are genuinely invisible to the component layer, not merely tolerated:
  // hashing them as components would make the index depend on its own output.
  const paths = computeComponentGraph(root).components.map((c) => c.path);
  for (const rel of SEMANTIC_INDEX_PATHS) assert.equal(paths.includes(rel), false, `${rel} is not a component`);

  // Re-accepting is repeatable — but it is a DECISION, not a command (option 1, 2026-09-06): once a
  // package has a stored index, the accept step consumes the last gate run's queue. Bare re-index is
  // refused; the documented path (gate → decide the sheet → accept) leaves the audit clean.
  const bare = spawnSync(process.execPath, [CLI, "--root", root], { encoding: "utf8" });
  assert.equal(bare.status, 3, "a stored index with no gate run since is refused");
  const { accept } = acceptBaseline(repo, root);
  assert.equal(accept.status ?? accept.code, 0, `${accept.stdout}\n${accept.stderr}`);
  assert.deepEqual(auditCoherence(root).hardFailures, []);
});

test("EXCLUDE PROOF, the negative: the same file NOT excluded reproduces both failures", () => {
  const root = tempPackage();
  acceptCoherentState(root);

  // Identical position, identical bytes, identical everything — except the path is not in
  // EXCLUDE. This is the mechanism M11 reproduced; it proves the audit really would have failed,
  // so the passing test above is a fix and not an accident of a lenient gate.
  const decoy = "private/coursewerk/NOT_EXCLUDED.json";
  fs.writeFileSync(path.join(root, decoy), fs.readFileSync(path.join(FIXTURE, "concepts/course.md")));

  const untracked = auditCoherence(root).hardFailures.join("\n");
  assert.match(untracked, /Git \?\?: private\/coursewerk\/NOT_EXCLUDED\.json/, "failure 1: untracked");

  commitOutput(root, "test: commit the decoy, as index_semantic commits its own");
  const committed = auditCoherence(root).hardFailures.join("\n");
  assert.equal(/Git \?\?/.test(committed), false, "committing kills failure 1 — which is why the CLI commits");
  assert.match(committed, /NOT_EXCLUDED\.json: new component is not in the coherence index/, "failure 2: EXCLUDE's half");

  // And the semantic artifacts, in the same package at the same moment, do neither.
  writeSemanticIndex(root, computeSemanticIndex(root));
  commitOutput(root, "test: commit the semantic artifacts too");
  const both = auditCoherence(root).hardFailures.join("\n");
  for (const rel of SEMANTIC_INDEX_PATHS) assert.equal(both.includes(rel), false, `${rel} must raise nothing`);
  assert.match(both, /NOT_EXCLUDED\.json/, "the decoy still fails — the gate is not simply off");
});

// --- honest gaps ------------------------------------------------------------------------------

test("a package with no concept maps yields an empty spine and DOES NOT look like success", () => {
  const root = emptyDir();

  const index = computeSemanticIndex(root);
  // The data is honest: empty, never invented (M13's refusal).
  assert.deepEqual(index.spine.nodes, []);
  assert.deepEqual(index.terms.terms, []);
  assert.deepEqual(index.claims.claims, []);
  assert.deepEqual(index.conceptMaps, []);

  // ...and it says so. An empty index reported as an index is a baseline the package does not
  // have: every spineRef would dangle against an empty node set and the gate would have nothing
  // to refute.
  assert.ok(index.warnings.length > 0, "an empty index must not report clean");
  assert.match(index.warnings.join("\n"), /no concept maps/i);

  // The CLI REFUSES, and writes nothing. A `reindex` that printed "ok" over this is the whole
  // failure mode this project exists to catch.
  const run = spawnSync(process.execPath, [CLI, "--root", root], { encoding: "utf8" });
  assert.equal(run.status, 2, "must not exit 0");
  assert.match(run.stderr, /no concept maps/i);
  assert.equal(run.stdout, "", "no success receipt");
  for (const rel of SEMANTIC_INDEX_PATHS) assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`);
});

test("a package with maps but no `## Key terms` warns, and still indexes", () => {
  const root = tempPackage();
  for (const rel of ["concepts/course.md", "concepts/phase-change.md"]) {
    fs.writeFileSync(path.join(root, rel), read(root, rel).replace(/## Key terms[\s\S]*?(?=\n## |$)/, ""));
  }
  const index = computeSemanticIndex(root);
  assert.deepEqual(index.terms.terms, [], "no key-terms section -> no terms, never a guess");
  assert.match(index.warnings.join("\n"), /Key terms/, "the gap is named");
  assert.ok(index.spine.nodes.length > 0, "the spine is unaffected — it reads other sections");

  // A half-written map is a normal state of a package under construction; refusing it would make
  // the writer unusable exactly when it is needed. Warn, exit 0, never silently.
  const run = spawnSync(process.execPath, [CLI, "--root", root], { encoding: "utf8" });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stderr, /Key terms/);
  assert.deepEqual(JSON.parse(run.stdout).warnings, index.warnings, "the receipt carries them too");
});

// --- backward compatibility (spec §6.8) -------------------------------------------------------

test("BACKWARD COMPAT: a package with no semantic artifacts behaves exactly as today", () => {
  const root = tempPackage();
  acceptCoherentState(root);

  // Absence is an ANSWER, not a fault: `index: null` with `error: null`. Collapsing that into an
  // error would make every pre-M14 package fail; collapsing a CORRUPT artifact into "absent"
  // would make the system report a clean bill of health it has not earned. The two must stay
  // distinguishable, and consumers branch on `present`, never on truthiness.
  const stored = loadSemanticIndex(root);
  assert.equal(stored.present, false);
  assert.equal(stored.complete, false);
  assert.deepEqual(stored.errors, []);
  for (const a of [stored.spine, stored.terms, stored.claims]) {
    assert.equal(a.index, null);
    assert.equal(a.error, null);
  }

  // The coherence layer is untouched — no new component, no new relationship, no new failure.
  assert.deepEqual(auditCoherence(root).hardFailures, []);

  // The negative: a CORRUPT artifact is a fault and must never read as absent.
  fs.writeFileSync(path.join(root, CLAIMS_PATH), "{ not json");
  const broken = loadSemanticIndex(root);
  assert.equal(broken.present, true, "a corrupt artifact is PRESENT, not missing");
  assert.equal(broken.complete, false);
  assert.equal(broken.claims.index, null);
  assert.match(broken.claims.error, /CLAIMS\.json is invalid JSON/);
  assert.deepEqual(broken.errors.length, 1);
});

test("writeSemanticIndex serializes ONLY the artifacts — the envelope never reaches disk", () => {
  const root = tempPackage();
  const index = computeSemanticIndex(root);
  assert.ok("warnings" in index && "root" in index && "conceptMaps" in index, "the envelope exists");
  writeSemanticIndex(root, index);

  // All three schemas are additionalProperties:false, so an envelope field on disk is not a
  // cosmetic slip — it is an invalid artifact.
  const stored = loadSemanticIndex(root);
  for (const a of [stored.spine, stored.terms, stored.claims]) {
    for (const stray of ["root", "warnings", "conceptMaps", "generatedAt"]) {
      assert.equal(stray in a.index, false, `${a.file}: envelope field ${stray} was serialized`);
    }
  }
  assert.deepEqual(Object.keys(stored.claims.index).sort(), ["claims", "schemaVersion"]);
});

test("the CLI writes all three, commits them, and stamps provenance OUTSIDE the artifacts", () => {
  const root = tempPackage();
  const run = spawnSync(process.execPath, [CLI, "--root", root], { encoding: "utf8" });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const receipt = JSON.parse(run.stdout);
  assert.equal(receipt.action, "reindexed");
  assert.deepEqual(receipt.files, SEMANTIC_INDEX_PATHS);
  assert.deepEqual(receipt.conceptMaps, ["concepts/course.md", "concepts/phase-change.md"]);
  assert.ok(receipt.spineNodes > 0 && receipt.terms > 0 && receipt.claims > 0);
  assert.match(receipt.generatedAt, /^\d{4}-\d{2}-\d{2}T/, "provenance lives in the receipt...");
  assert.equal(read(root, SPINE_PATH).includes("generatedAt"), false, "...and never in the artifact");
  assert.equal(receipt.git.committed, true, "the snapshot must be recoverable from git");

  // --no-commit is the escape hatch for a caller managing its own git; it must still write.
  const bare = tempPackage();
  const noCommit = spawnSync(process.execPath, [CLI, "--root", bare, "--no-commit"], { encoding: "utf8" });
  assert.equal(noCommit.status, 0, `${noCommit.stdout}\n${noCommit.stderr}`);
  assert.equal("git" in JSON.parse(noCommit.stdout), false);
  assert.equal(fs.existsSync(path.join(bare, ".git")), false, "--no-commit must not create a repository");
  assert.ok(fs.existsSync(path.join(bare, TERMS_PATH)));
});

test("SEMANTIC_INDEX_PATHS has ONE home — coherence.mjs imports it, never respells it", () => {
  // interfaces §5d, tested the only way that works: a behavior test cannot see a duplicate that
  // currently agrees, and "currently agrees" is the entire lifespan of every duplicate. If these
  // paths were spelled twice, the day one changed it would silently stop being excluded and the
  // package would fail its own gate again — the exact bug this module fixed.
  const src = fs.readFileSync(path.join(repo, "scripts/lib/coherence.mjs"), "utf8");
  assert.match(src, /import \{ SEMANTIC_INDEX_PATHS \} from "\.\/semantic_index\.mjs"/);
  for (const rel of [SPINE_PATH, TERMS_PATH, CLAIMS_PATH]) {
    assert.equal(src.includes(`"${rel}"`), false, `coherence.mjs respells ${rel}; import the constant`);
  }
});

// ---------------------------------------------------------------------------------------------
// THE PRIOR-REGISTRY WARNING — added 2026-07-17, closing a mutant that SURVIVED THE FULL SUITE.
//
// `indexGaps` branches on `storedTerms.error !== null`. Mutating that to `!storedTerms.index`
// survived all 438 tests: behaviorally it emits the "prior term registry is unreadable" warning on
// every legitimate FIRST BUILD, where `index` is null and nothing is wrong. Alarm fatigue plus a
// garbled message ("null — it is the prior term registry…"), and no test could see it, because the
// warning channel had no test at all.
//
// This is the presence-vs-truthiness trap that has now caught SIX agents on this project — one of
// them inside a test helper written to check for that very trap. It is the reflex, not an ignorance
// error, which is exactly why it needs a test rather than a comment: `error: null` (first build,
// silence) and `error: "<reason>"` (memory unreadable, speak up) are DIFFERENT ANSWERS, and `index`
// is null in both.
//
// The stakes are specific: the stored registry is what makes a term id rename-invariant (§2). If it
// is unreadable and we say nothing, every id is silently re-minted from its current label and a
// later rename moves the claim ids that depend on it — the exact defect the mint-once rule fixed.
// ---------------------------------------------------------------------------------------------

test("a FIRST build warns nothing about the prior registry — silence is the correct answer", () => {
  const root = tempPackage(); // no private/coursewerk/TERMS.json yet: loadSemanticIndex -> {index:null, error:null}
  const index = computeSemanticIndex(root);
  const priorWarnings = index.warnings.filter((w) => /prior term registry/i.test(w));
  assert.deepEqual(
    priorWarnings,
    [],
    "a first build has no prior registry BY DESIGN; warning here trains the author to ignore warnings",
  );
  // The negative that makes the assertion mean something: the machinery is live, not merely quiet.
  assert.ok(index.terms, "the build must actually have produced a registry");
});

test("a CORRUPT prior registry warns exactly once, and names the consequence", () => {
  const root = tempPackage();
  writeSemanticIndex(root, computeSemanticIndex(root)); // establish a real prior
  fs.writeFileSync(path.join(root, TERMS_PATH), "{ not json\n"); // the memory is now unreadable
  const index = computeSemanticIndex(root);
  const priorWarnings = index.warnings.filter((w) => /prior term registry/i.test(w));
  assert.equal(priorWarnings.length, 1, "unreadable memory must be reported, once");
  // It must name what SILENTLY happened, not merely that a file is bad: ids were re-minted, so a
  // later rename will move claim ids. An author who does not know that cannot act on the warning.
  assert.match(priorWarnings[0], /re-?minted/i);
  assert.doesNotMatch(priorWarnings[0], /^null/, "a truthiness read garbles the reason into `null`");
});
