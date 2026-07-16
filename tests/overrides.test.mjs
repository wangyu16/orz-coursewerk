// M7 override-manager tests — the contract these encode is the point of the module:
// a recorded override means AUTHORIZED DIVERGENCE, NOT HALLUCINATION, and once recorded the
// question is settled forever (ask-once). Pure/deterministic: no clock, no I/O, no network.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  emptyOverrides,
  isAuthorizedDivergence,
  recordOverride,
  needsAsk,
  recordDeclined,
  isDeclined,
  findDeclined,
  findOverride,
  overridesByBasis,
  OVERRIDES_PATH,
  BASES,
} from "../scripts/lib/overrides.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(HERE, "..", "system", "schemas", "package", "overrides.schema.json"), "utf8"),
);

/** Minimal hand-rolled validator for overrides.schema.json (no new dependencies). */
function validateAgainstSchema(doc) {
  const errors = [];
  const root = SCHEMA.properties;
  if (doc.schemaVersion !== root.schemaVersion.const) errors.push("schemaVersion must be 1");
  for (const key of Object.keys(doc)) {
    if (!Object.prototype.hasOwnProperty.call(root, key)) errors.push(`additionalProperty: ${key}`);
  }
  for (const req of SCHEMA.required) {
    if (!(req in doc)) errors.push(`missing required: ${req}`);
  }

  const itemSchema = root.overrides.items;
  if (!Array.isArray(doc.overrides)) errors.push("overrides must be an array");
  else
    for (const entry of doc.overrides) {
      for (const req of itemSchema.required) {
        if (!(req in entry) || entry[req] === undefined) errors.push(`override missing required: ${req}`);
      }
      for (const key of Object.keys(entry)) {
        if (!Object.prototype.hasOwnProperty.call(itemSchema.properties, key)) {
          errors.push(`override additionalProperty: ${key}`);
        }
      }
      if (!new RegExp(itemSchema.properties.claimId.pattern).test(entry.claimId)) {
        errors.push(`claimId pattern: ${entry.claimId}`);
      }
      if (!itemSchema.properties.basis.enum.includes(entry.basis)) errors.push(`basis enum: ${entry.basis}`);
      if (!(typeof entry.rationale === "string" && entry.rationale.length >= 1)) errors.push("rationale minLength 1");
      if (entry.basis === "cited" && !("justifiedBy" in entry)) errors.push("cited requires justifiedBy");
    }

  if ("declinedUpstream" in doc) {
    const dSchema = root.declinedUpstream.items;
    if (!Array.isArray(doc.declinedUpstream)) errors.push("declinedUpstream must be an array");
    else
      for (const entry of doc.declinedUpstream) {
        for (const req of dSchema.required) if (!(req in entry)) errors.push(`declined missing required: ${req}`);
        for (const key of Object.keys(entry)) {
          if (!Object.prototype.hasOwnProperty.call(dSchema.properties, key)) {
            errors.push(`declined additionalProperty: ${key}`);
          }
        }
      }
  }
  return errors;
}

const CITED = {
  claimId: "claim.iupac-name.a1b2c3",
  divergesFrom: "source:openstax-chem#sec-2.3",
  basis: "cited",
  justifiedBy: "IUPAC Recommendations 2013, P-31.1.4.2.4",
  authorizedBy: "instructor:jdoe",
  date: "2026-07-16",
  rationale: "The textbook predates the IUPAC-preferred name; the course teaches current nomenclature.",
};

// ---------------------------------------------------------------------------
// THE HEADLINE: a knowledge update beyond the pinned source is NOT a hallucination.
// ---------------------------------------------------------------------------

test("HEADLINE: a knowledge update beyond the pinned source is authorized divergence, not hallucination", () => {
  const claimId = "claim.melting-point.9f8e7d";
  const before = emptyOverrides();

  // Before the instructor decides: the fidelity checker sees an unauthorized divergence.
  assert.equal(isAuthorizedDivergence(before, claimId), false);

  // The instructor cites a 2026 study that supersedes the pinned 2019 chapter.
  const after = recordOverride(before, {
    claimId,
    divergesFrom: "source:textbook-2019#ch4-table-4.2",
    basis: "cited",
    justifiedBy: "Rivera et al., Nature Chem. 2026, doi:10.1000/example",
    authorizedBy: "instructor:jdoe",
    date: "2026-07-16",
    rationale: "A 2026 remeasurement supersedes the textbook value; students should learn the current figure.",
  });

  // The fidelity checker calls this FIRST -> the correct content is never flagged.
  assert.equal(isAuthorizedDivergence(after, claimId), true);
  assert.deepEqual(validateAgainstSchema(after), []);
});

// ---------------------------------------------------------------------------
// Validation (spec §10 decision 4)
// ---------------------------------------------------------------------------

test("rationale is REQUIRED ALWAYS — missing rationale throws, for every basis", () => {
  for (const basis of BASES) {
    const entry = { ...CITED, basis };
    if (basis !== "cited") delete entry.justifiedBy;
    delete entry.rationale;
    assert.throws(() => recordOverride(emptyOverrides(), entry), /rationale is required/, `basis=${basis}`);

    // empty/whitespace rationale is no rationale
    assert.throws(() => recordOverride(emptyOverrides(), { ...entry, rationale: "   " }), /rationale is required/);
  }
});

test('justifiedBy is required IFF basis === "cited"', () => {
  // cited without justifiedBy -> throws
  const noSource = { ...CITED };
  delete noSource.justifiedBy;
  assert.throws(() => recordOverride(emptyOverrides(), noSource), /justifiedBy is required when basis is "cited"/);

  // cited with justifiedBy -> ok
  const ok = recordOverride(emptyOverrides(), CITED);
  assert.equal(ok.overrides[0].justifiedBy, CITED.justifiedBy);
  assert.deepEqual(validateAgainstSchema(ok), []);

  // uncited basis WITH justifiedBy -> throws (the record would be mislabeled; it is "cited")
  assert.throws(
    () => recordOverride(emptyOverrides(), { ...CITED, basis: "instructor-expertise" }),
    /justifiedBy is only valid when basis is "cited"/,
  );
});

test("uncited bases: no justifiedBy + a rationale -> recorded, and EQUALLY authoritative", () => {
  for (const basis of ["instructor-expertise", "pedagogical-choice"]) {
    const claimId = `claim.${basis}-case.112233`;
    const doc = recordOverride(emptyOverrides(), {
      claimId,
      divergesFrom: "source:openstax-chem#sec-9.1",
      basis,
      authorizedBy: "instructor:jdoe",
      date: "2026-07-16",
      rationale: "For the record: the source's framing misleads first-year students; this is the course's teaching line.",
    });

    // No discrimination by basis — the checker must treat this exactly like a cited override.
    assert.equal(isAuthorizedDivergence(doc, claimId), true, `basis=${basis} must be authorized`);
    assert.equal(needsAsk(doc, claimId), false);
    assert.equal("justifiedBy" in doc.overrides[0], false);
    assert.deepEqual(validateAgainstSchema(doc), []);
  }
});

test("structural validation: claimId shape, basis enum, unknown fields, required fields", () => {
  const base = { ...CITED };
  assert.throws(() => recordOverride(emptyOverrides(), { ...base, claimId: "term.ethene" }), /must start with "claim\."/);
  assert.throws(() => recordOverride(emptyOverrides(), { ...base, basis: "vibes" }), /basis must be one of/);
  assert.throws(() => recordOverride(emptyOverrides(), { ...base, note: "x" }), /unknown field\(s\) note/);
  for (const field of ["claimId", "divergesFrom", "authorizedBy", "date"]) {
    const entry = { ...base };
    delete entry[field];
    assert.throws(() => recordOverride(emptyOverrides(), entry), new RegExp(`${field} is required`));
  }
});

// ---------------------------------------------------------------------------
// Ask-once lifecycle
// ---------------------------------------------------------------------------

test("ask-once: needsAsk true before recording, FALSE after — and it stays false", () => {
  const claimId = CITED.claimId;
  let doc = emptyOverrides();
  assert.equal(needsAsk(doc, claimId), true);

  doc = recordOverride(doc, CITED);
  assert.equal(needsAsk(doc, claimId), false);

  // Repeated interrogation never re-opens the question (re-asking is alarm fatigue = a bug).
  for (let i = 0; i < 5; i += 1) assert.equal(needsAsk(doc, claimId), false);

  // Re-recording the same claim replaces the entry in place and stays settled.
  const doc2 = recordOverride(doc, { ...CITED, rationale: "Restated rationale after review." });
  assert.equal(doc2.overrides.length, 1);
  assert.equal(doc2.overrides[0].rationale, "Restated rationale after review.");
  assert.equal(needsAsk(doc2, claimId), false);

  // Other claims are unaffected.
  assert.equal(needsAsk(doc2, "claim.something-else.000000"), true);
});

test("absent / empty document degrades gracefully (nothing is authorized, everything is askable)", () => {
  for (const doc of [null, undefined, {}, { schemaVersion: 1, overrides: [] }]) {
    assert.equal(isAuthorizedDivergence(doc, "claim.x.1"), false);
    assert.equal(needsAsk(doc, "claim.x.1"), true);
  }
  assert.equal(isAuthorizedDivergence(emptyOverrides(), ""), false);
  assert.equal(findOverride(emptyOverrides(), "claim.x.1"), null);
});

// ---------------------------------------------------------------------------
// declinedUpstream
// ---------------------------------------------------------------------------

test("declinedUpstream round-trip: a deliberate decline is not staleness", () => {
  const sourceRef = "source:openstax-chem@2e-rev3#ch4";
  let doc = emptyOverrides();
  assert.equal(isDeclined(doc, sourceRef), false);

  doc = recordDeclined(doc, {
    sourceRef,
    date: "2026-07-16",
    rationale: "The rev3 rewrite of ch4 reorders content away from this course's spine; not adopted this term.",
  });

  assert.equal(isDeclined(doc, sourceRef), true);
  assert.equal(findDeclined(doc, sourceRef).rationale.startsWith("The rev3 rewrite"), true);
  assert.equal(isDeclined(doc, "source:other#ch1"), false);
  assert.deepEqual(validateAgainstSchema(doc), []);

  // Re-declining the same ref replaces, never duplicates.
  const doc2 = recordDeclined(doc, { sourceRef, date: "2026-08-01", rationale: "Re-confirmed at term rollover." });
  assert.equal(doc2.declinedUpstream.length, 1);
  assert.equal(doc2.declinedUpstream[0].date, "2026-08-01");

  // Validation mirrors overrides.
  assert.throws(() => recordDeclined(doc, { sourceRef, date: "2026-07-16" }), /rationale is required/);
  assert.throws(() => recordDeclined(doc, { sourceRef, rationale: "x" }), /date is required/);
  assert.throws(() => recordDeclined(doc, { date: "d", rationale: "x" }), /sourceRef is required/);
  assert.throws(() => recordDeclined(doc, { sourceRef, date: "d", rationale: "x", who: "y" }), /unknown field\(s\) who/);
});

test("overrides and declines coexist in one schema-valid document", () => {
  let doc = recordOverride(emptyOverrides(), CITED);
  doc = recordDeclined(doc, { sourceRef: "source:x@rev9", date: "2026-07-16", rationale: "Not adopted." });
  doc = recordOverride(doc, {
    claimId: "claim.simplify.445566",
    divergesFrom: "source:openstax-chem#sec-3.2",
    basis: "pedagogical-choice",
    authorizedBy: "instructor:jdoe",
    date: "2026-07-16",
    rationale: "Deliberate simplification: the full treatment is deferred to the second course.",
  });
  assert.deepEqual(validateAgainstSchema(doc), []);
  assert.equal(doc.overrides.length, 2);
  assert.equal(doc.declinedUpstream.length, 1);

  const byBasis = overridesByBasis(doc);
  assert.equal(byBasis.cited.length, 1);
  assert.equal(byBasis["pedagogical-choice"].length, 1);
  assert.equal(byBasis["instructor-expertise"].length, 0);
});

// ---------------------------------------------------------------------------
// Purity / determinism
// ---------------------------------------------------------------------------

test("pure + deterministic: no mutation of inputs, identical output for identical input", () => {
  const before = emptyOverrides();
  const frozenSnapshot = JSON.stringify(before);
  const entry = { ...CITED };

  const a = recordOverride(before, entry);
  const b = recordOverride(before, entry);

  assert.equal(JSON.stringify(a), JSON.stringify(b), "same input -> byte-identical output");
  assert.equal(JSON.stringify(before), frozenSnapshot, "input document is not mutated");
  assert.deepEqual(entry, CITED, "input entry is not mutated");
  assert.notEqual(a, before);

  // No clock inside: the recorded date is exactly the caller's.
  assert.equal(a.overrides[0].date, "2026-07-16");

  // Field order is stable (schema order) -> stable serialization on disk.
  assert.deepEqual(Object.keys(a.overrides[0]), [
    "claimId",
    "divergesFrom",
    "basis",
    "justifiedBy",
    "authorizedBy",
    "date",
    "rationale",
  ]);
});

test("OVERRIDES_PATH is the canonical package location", () => {
  assert.equal(OVERRIDES_PATH, "metadata/OVERRIDES.json");
});
