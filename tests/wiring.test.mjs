// WIRING — the no-producer / no-caller class, pinned.
//
// Coursewerk's own walkthrough counts seven "looks implemented, nothing produces it" defects (a field
// with no writer, a namespace with no minter, a module with no product caller). Each was found by
// hand. These tests make the class CHECKABLE: every product script is documented, the system's claim
// register covers the semantic-index mechanisms, the label matcher has one home, and `overrideId`
// has a producer whose output moves the provenance fingerprint. Free, offline, deterministic.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeSemanticIndex } from "../scripts/lib/semantic_index.mjs";
import { emptyOverrides, recordOverride, overrideIdOf, OVERRIDES_PATH } from "../scripts/lib/overrides.mjs";
import { fingerprints } from "../scripts/lib/fingerprint.mjs";
import { labelMatcher, findLabelOccurrences } from "../scripts/lib/terms.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

// Scripts that are study or repository tooling, not the documented product pipeline.
const NOT_PRODUCT = new Set(["study_pairs.mjs", "index_coursewerk.mjs", "coursewerk_impact.mjs", "verify_coursewerk.mjs", "accept_coursewerk_revision.mjs"]);

test("W.1 · every product script is named in PROCEDURE.md or README.md — a command nobody is told to run is unwired", () => {
  const scripts = fs.readdirSync(path.join(REPO, "scripts")).filter((n) => n.endsWith(".mjs") && !NOT_PRODUCT.has(n));
  const docs = read("PROCEDURE.md") + "\n" + read("README.md");
  const pkg = JSON.parse(read("package.json"));
  const aliases = Object.entries(pkg.scripts).filter(([, cmd]) => typeof cmd === "string");
  const missing = [];
  for (const script of scripts) {
    const byPath = docs.includes(`scripts/${script}`);
    const byAlias = aliases.some(([name, cmd]) => cmd.includes(`scripts/${script}`) && docs.includes(`npm run ${name}`));
    if (!byPath && !byAlias) missing.push(script);
  }
  assert.deepEqual(missing, [], `undocumented product scripts: ${missing.join(", ")}`);
});

test("W.2 · the system claim register names every semantic-index mechanism, each bound to existing implementation + tests", () => {
  const registry = JSON.parse(read("system/CLAIMS.json"));
  const ids = new Set(registry.claims.map((c) => c.id));
  const required = [
    "claim.control.coverage",          // W12/W13 + fail-closed
    "claim.coherence.claims",          // five fingerprints, silentRisk, queue
    "claim.coherence.prerequisites",   // instructor-declared semantic prereq edges
    "claim.coherence.index-fresh",     // G15h freshness
    "claim.trust.consistency",         // M6 + range
    "claim.trust.immutable",           // unverifiable quotation gate + M9 guard on the product path
    "claim.review.blind-bundle",       // independence assembled, digest-bound
    "claim.revision.propagation",      // M9 product path with receipt
    "claim.control.overrides",         // instructor authority: ask-once, provenance moves
  ];
  const missing = required.filter((id) => !ids.has(id));
  assert.deepEqual(missing, [], `unregistered mechanisms: ${missing.join(", ")}`);
  for (const claim of registry.claims.filter((c) => required.includes(c.id))) {
    assert.ok(["hard-gate", "automated-check"].includes(claim.assuranceLevel), `${claim.id}: must be machine-checked`);
    assert.ok(claim.implementation.length && claim.tests.length, `${claim.id}: needs implementation and tests`);
    for (const rel of [...claim.implementation, ...claim.tests, ...(claim.documentation || [])])
      assert.ok(fs.existsSync(path.join(REPO, rel)), `${claim.id}: ${rel} does not exist`);
  }
});

test("W.3 · ONE label matcher (W14): no module carries a private whole-word label regex", () => {
  const privateCopies = [];
  for (const name of fs.readdirSync(path.join(REPO, "scripts", "lib")).filter((n) => n.endsWith(".mjs") && n !== "terms.mjs")) {
    const src = read(`scripts/lib/${name}`);
    if (/\(\?<!\[A-Za-z0-9\]\)/.test(src) || /function labelRe\(/.test(src) || /function findOccurrences\(/.test(src)) privateCopies.push(name);
  }
  assert.deepEqual(privateCopies, []);
  // and the one matcher behaves as the four copies did: whole word, case-insensitive, `_` is a boundary
  assert.equal(labelMatcher("melting point").test("the Melting Point of water"), true);
  assert.equal(labelMatcher("melting point").test("premelting point"), false);
  assert.equal(labelMatcher("cell").test("cells divide"), false);
  assert.deepEqual(findLabelOccurrences("Cell; a cell_wall; cell.", "cell").map((o) => o.start), [0, 8, 19]);
  assert.deepEqual(findLabelOccurrences("cell", "").length, 0);
});

test("W.4 · overrideId has a PRODUCER (W5): an authorized claim carries it, and its provenance fingerprint moves", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-override-id-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const pkg = path.join(dir, "package");
  fs.cpSync(path.join(REPO, "tests/fixtures/usage-package"), pkg, { recursive: true });
  const before = computeSemanticIndex(pkg);
  const target = before.claims.claims.find((c) => c.locations[0].file === "study-guide/melting.md");
  assert.ok(target && !("overrideId" in target), "no override yet, no id");

  const entry = { claimId: target.id, divergesFrom: "src.synthetic.handbook.rev1#melting", basis: "instructor-expertise",
    authorizedBy: "instructor", date: "2026-09-05", rationale: "The handbook's rounded figure is replaced by the exact value used in this course." };
  fs.writeFileSync(path.join(pkg, OVERRIDES_PATH), JSON.stringify(recordOverride(emptyOverrides(), entry), null, 2));
  const after = computeSemanticIndex(pkg);
  const stamped = after.claims.claims.find((c) => c.id === target.id);
  assert.ok(stamped, "the claim id is stable across the override — the registry is keyed by it");
  assert.equal(stamped.overrideId, overrideIdOf(entry));
  assert.match(stamped.overrideId, /^override\.[a-f0-9]{12}$/);
  assert.notEqual(stamped.fingerprints.provenance, target.fingerprints.provenance, "provenance moves on override (spec §2.4)");
  for (const layer of ["format", "label", "content", "spine"]) assert.equal(stamped.fingerprints[layer], target.fingerprints[layer], `${layer} must not move`);
  // the id is content-derived: a re-authorization with a different basis is a different provenance
  assert.notEqual(overrideIdOf({ ...entry, basis: "pedagogical-choice" }), overrideIdOf(entry));
  assert.equal(overrideIdOf({ ...entry }), overrideIdOf(entry), "key order / copies do not change it");
  // and the fingerprint module reads exactly this field
  assert.equal(fingerprints({ ...stamped, overrideId: undefined }, after.terms).provenance, target.fingerprints.provenance);
  // other claims are untouched
  const others = after.claims.claims.filter((c) => c.id !== target.id);
  assert.ok(others.length > 0 && others.every((c) => !("overrideId" in c)));
});
