// M6b range-audit tests — is each number physically possible ON ITS OWN? (interfaces §3, spec §3 M6).
//
// The sibling of the consistency scan and its ORTHOGONAL question. `scanConsistency` asks whether
// two artifacts DISAGREE; `rangeAudit` asks whether a single value is impossible on its own terms —
// a temperature below absolute zero, a negative mass. Half of these are FALSE-POSITIVE tests,
// because a detector that fires on a correct ΔH gets muted and then protects nobody: precision is
// tested exactly as hard as recall, the same discipline the consistency suite holds.
//
// Free, deterministic, no network. The two real fixture packages are swept at the end to PROVE the
// zero-new-false-positive prediction the G3 design made before this code was allowed to commit.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rangeAudit } from "../scripts/lib/consistency.mjs";
import { buildQueue } from "../scripts/lib/escalation.mjs";
import { computeSemanticIndex } from "../scripts/lib/semantic_index.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FP = { format: "f", label: "l", content: "c", spine: "s", provenance: "p" };

/** A CLAIMS-shaped claim. `text` is a REQUIRED field (schema; interfaces §4a). */
function claim(id, type, text, file = "study-guide/equilibrium.md") {
  return {
    id: `claim.${id}`,
    type,
    fingerprints: FP,
    locations: [{ file }],
    provenanceDeclared: true,
    spineRefs: ["concept.equilibrium.1"],
    scope: "equilibrium",
    text,
  };
}

const kindsOf = (findings) => findings.map((f) => f.kind);

// ---- RECALL: the impossible value is caught -------------------------------------------------

test("a temperature below absolute zero is flagged", () => {
  const f = rangeAudit([claim("t1", "fact", "The reaction mixture was cooled to -40 K before analysis.")]);
  assert.deepEqual(kindsOf(f), ["implausible-quantity"]);
  assert.deepEqual(f[0].claimIds, ["claim.t1"]);
  assert.match(f[0].evidence[0], /below absolute zero/);
});

test("a sub-absolute-zero temperature is caught AFTER conversion, from °C too", () => {
  // -300 °C = -26.85 K, still below the floor — the check must convert before comparing.
  const f = rangeAudit([claim("t2", "fact", "It was chilled to -300 °C, colder than any real sample.")]);
  assert.deepEqual(kindsOf(f), ["implausible-quantity"]);
  assert.match(f[0].evidence[0], /-26\.85 K/);
});

test("a negative mass is physically impossible and flagged", () => {
  const f = rangeAudit([claim("m1", "answer-key", "The flask contained -5 g of the dissolved salt.")]);
  assert.deepEqual(kindsOf(f), ["implausible-quantity"]);
  assert.match(f[0].evidence[0], /negative mass/);
});

test("a negative amount / volume / length / time each fire", () => {
  for (const [text, dim] of [
    ["-2 mol of product remained", "amount"],
    ["-10 mL of titrant was added", "volume"],
    ["the tube was -3 cm long", "length"],
    ["the run lasted -15 min", "time"],
  ]) {
    const f = rangeAudit([claim("x", "fact", `Impossibly, ${text}.`)]);
    assert.deepEqual(kindsOf(f), ["implausible-quantity"], `${dim} should fire`);
    assert.match(f[0].evidence[0], new RegExp(`negative ${dim}`));
  }
});

test("one claim with SEVERAL impossible values is ONE finding, headline = first breach", () => {
  const f = rangeAudit([claim("multi", "fact", "It cooled to -40 K and held -5 g of salt.")]);
  assert.equal(f.length, 1);
  assert.match(f[0].evidence[0], /below absolute zero/); // the -40 K comes first in the text
});

// ---- PRECISION: the legitimate value is NOT flagged -----------------------------------------

test("a normal package of positive quantities flags nothing", () => {
  const f = rangeAudit([
    claim("ok1", "fact", "At equilibrium the temperature is 298 K and 0.50 mol of product forms."),
    claim("ok2", "answer-key", "Answer: the melting point of water is 273.15 K (0 °C)."),
    claim("ok3", "definition", "Standard pressure is 101325 Pa, i.e. 1 atm."),
  ]);
  assert.deepEqual(f, []);
});

test("0 K and -273.15 °C are ABSOLUTE ZERO, a real fact — not flagged", () => {
  // The floor is STRICTLY below 0 K; stating absolute zero itself must stay silent.
  const f = rangeAudit([claim("az", "fact", "Absolute zero is 0 K, equivalently -273.15 °C.")]);
  assert.deepEqual(f, []);
});

test("SIGNED-QUANTITY GUARD: a negative ΔH (molar energy) is legitimate — not flagged", () => {
  // molar-energy is deliberately unbounded (an exothermic reaction has ΔH < 0).
  const f = rangeAudit([claim("dh", "fact", "The enthalpy change of the reaction is -285 kJ/mol.")]);
  assert.deepEqual(f, []);
});

test("DELTA GUARD: a negative temperature CHANGE (ΔT) is legitimate — not flagged", () => {
  // temperature IS a bounded dimension, but a change carries a legitimate sign; the delta marker
  // suppresses the whole claim.
  const f = rangeAudit([claim("dt", "fact", "On cooling, the temperature change was ΔT = -15 K.")]);
  assert.deepEqual(f, []);
  const g = rangeAudit([claim("dn", "fact", "For this reaction the change in moles of gas is -1 mol.")]);
  assert.deepEqual(g, []);
});

test("an UNBOUNDED dimension's negative (a signed cell potential) is not flagged even without Δ", () => {
  const f = rangeAudit([claim("emf", "fact", "The standard cell potential is -0.76 V.")]);
  assert.deepEqual(f, []);
});

test("WORKED-EXAMPLE GUARD: a negative in a non-assertive claim is not flagged", () => {
  // `derived`/`procedure` carry example arithmetic, not assertions about a term (non-flag 5).
  const f = rangeAudit([claim("wk", "derived", "Subtracting gives 5 - 10 = -5 g in the intermediate step.")]);
  assert.deepEqual(f, []);
});

test("a bare integer with no unit has no dimension, hence no bound", () => {
  const f = rangeAudit([claim("bare", "fact", "See question -3 and step -2 of the procedure.")]);
  assert.deepEqual(f, []);
});

// ---- WIRING: the detector kind folds to the right queue kind --------------------------------

test("implausible-quantity folds to a BLOCKING suspected-error in the queue", () => {
  const claims = { schemaVersion: 1, claims: [claim("q1", "fact", "cooled to -40 K")] };
  const findings = rangeAudit(claims);
  const q = buildQueue(findings, claims);
  assert.equal(q.items.length, 1);
  assert.equal(q.items[0].kind, "suspected-error");
  assert.equal(q.items[0].severity, "blocking");
  assert.deepEqual(q.items[0].detectorKinds, ["implausible-quantity"]);
});

// ---- FALSE-POSITIVE BASELINE: the real fixture packages must stay silent ---------------------
//
// The measurement the G3 design named as the gate on committing this code: the two clean fixtures
// carry real chemistry prose (temperatures, masses, energies) and MUST produce zero range findings.
// A non-zero result here means the bounds are too broad and the check is not allowed to ship.

for (const fixture of ["mini-package", "usage-package"]) {
  test(`clean fixture ${fixture} produces ZERO range findings (zero-FP gate)`, () => {
    const { claims } = computeSemanticIndex(path.join(repo, "tests/fixtures", fixture));
    const f = rangeAudit(claims);
    assert.deepEqual(f, [], `range audit must not flag the clean ${fixture}: ${JSON.stringify(f)}`);
  });
}
