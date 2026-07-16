// M10 escalation queue — tests.
//
// The queue is the mechanism's product: if it is malformed, unordered, or so loud that an
// instructor stops reading it, nothing upstream matters. So these pin (a) schema validity,
// (b) the burden math that measures alarm fatigue, (c) dedupe/batching — the two levers
// that keep one human decision to one interruption — and (d) determinism, without which a
// flag cannot be audited from git months later.
//
// The validator below is hand-rolled on purpose: the repo takes no new dependencies, and a
// small explicit checker of the frozen shape is exactly as much validation as the contract
// demands.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildQueue } from "../scripts/lib/escalation.mjs";

const KINDS = [
  "suspected-error",
  "source-conflict",
  "internal-inconsistency",
  "sanity-check",
  "orphan-claim",
  "misconception-asserted",
  "term-proposal",
  "derived-diff",
  "upstream-drift",
];
const SEVERITIES = ["blocking", "review", "info"];

/** Minimal validator for review_queue.schema.json (required, enums, minItems, additionalProperties:false). */
function validateQueue(q) {
  const errs = [];
  const ok = (cond, msg) => { if (!cond) errs.push(msg); };

  ok(q !== null && typeof q === "object" && !Array.isArray(q), "queue must be an object");
  if (errs.length) return errs;

  for (const key of ["schemaVersion", "items", "burden"]) ok(key in q, `missing required "${key}"`);
  for (const key of Object.keys(q)) ok(["schemaVersion", "items", "burden"].includes(key), `additionalProperty "${key}"`);
  ok(q.schemaVersion === 1, "schemaVersion must be const 1");
  ok(Array.isArray(q.items), "items must be an array");

  for (const [i, it] of (Array.isArray(q.items) ? q.items : []).entries()) {
    ok(it !== null && typeof it === "object" && !Array.isArray(it), `items[${i}] must be an object`);
    for (const key of ["kind", "severity", "evidence"]) ok(key in it, `items[${i}] missing required "${key}"`);
    for (const key of Object.keys(it)) {
      // additionalProperties:false — this now REJECTS a stray singular `claimId`, which
      // the schema REPLACED with `claimIds`. Two ways to say one thing would drift.
      ok(
        ["kind", "claimIds", "detectorKinds", "severity", "evidence", "proposal"].includes(key),
        `items[${i}] additionalProperty "${key}"`,
      );
    }
    // detectorKinds: minItems 1, sorted, deduped. Asserted on EVERY item — an item with no
    // recorded observation is a flag whose provenance the fold destroyed.
    ok("detectorKinds" in it, `items[${i}] missing "detectorKinds"`);
    ok(Array.isArray(it.detectorKinds) && it.detectorKinds.length >= 1, `items[${i}].detectorKinds must have minItems 1`);
    for (const [j, d] of (Array.isArray(it.detectorKinds) ? it.detectorKinds : []).entries()) {
      ok(typeof d === "string" && d.length > 0, `items[${i}].detectorKinds[${j}] must be a non-empty string`);
    }
    if (Array.isArray(it.detectorKinds)) {
      ok(
        JSON.stringify(it.detectorKinds) === JSON.stringify([...new Set(it.detectorKinds)].sort()),
        `items[${i}].detectorKinds must be sorted and deduped`,
      );
    }
    ok(KINDS.includes(it.kind), `items[${i}].kind "${it.kind}" not in enum`);
    ok(SEVERITIES.includes(it.severity), `items[${i}].severity "${it.severity}" not in enum`);
    ok(Array.isArray(it.evidence) && it.evidence.length >= 1, `items[${i}].evidence must have minItems 1`);
    for (const [j, e] of (Array.isArray(it.evidence) ? it.evidence : []).entries()) {
      ok(typeof e === "string", `items[${i}].evidence[${j}] must be a string`);
    }
    if ("claimIds" in it) {
      ok(Array.isArray(it.claimIds), `items[${i}].claimIds must be an array`);
      for (const [j, id] of (Array.isArray(it.claimIds) ? it.claimIds : []).entries()) {
        ok(typeof id === "string", `items[${i}].claimIds[${j}] must be a string`);
        ok(typeof id === "string" && /^claim\./.test(id), `items[${i}].claimIds[${j}] "${id}" must match ^claim\\.`);
      }
      // contract: sorted, so [0] is a stable primary handle
      ok(
        JSON.stringify(it.claimIds) === JSON.stringify([...it.claimIds].sort()),
        `items[${i}].claimIds must be sorted`,
      );
    }
    if ("proposal" in it) ok(typeof it.proposal === "string", `items[${i}].proposal must be a string`);
  }

  const b = q.burden;
  ok(b !== null && typeof b === "object" && !Array.isArray(b), "burden must be an object");
  if (b && typeof b === "object") {
    for (const key of ["flagCount", "artifactCount"]) ok(key in b, `burden missing required "${key}"`);
    for (const key of Object.keys(b)) {
      ok(["flagCount", "artifactCount", "flagsPerArtifact"].includes(key), `burden additionalProperty "${key}"`);
    }
    ok(Number.isInteger(b.flagCount), "burden.flagCount must be an integer");
    ok(Number.isInteger(b.artifactCount), "burden.artifactCount must be an integer");
    if ("flagsPerArtifact" in b) {
      ok(typeof b.flagsPerArtifact === "number" && Number.isFinite(b.flagsPerArtifact), "burden.flagsPerArtifact must be a finite number");
    }
  }
  return errs;
}

function claim(id, type, files) {
  return {
    id,
    type,
    fingerprints: { format: "f", label: "l", content: "c", spine: "s", provenance: "p" },
    locations: files.map((f) => ({ file: f })),
    provenanceDeclared: true,
  };
}

const CLAIMS = {
  schemaVersion: 1,
  claims: [
    claim("claim.mp.aa11", "fact", ["study-guide/ch3.md"]),
    claim("claim.mp-key.bb22", "answer-key", ["practice/ch3.md"]),
    claim("claim.orphan.cc33", "definition", ["study-guide/ch3.md", "slides/ch3.md"]),
    { ...claim("claim.term-user.dd44", "fact", ["study-guide/ch4.md"]), termRefs: ["term.pam"] },
  ],
};

const MIXED = [
  {
    kind: "value-disagreement",
    claimIds: ["claim.mp.aa11", "claim.mp-key.bb22"],
    evidence: ["study-guide/ch3.md asserts 100 °C; practice/ch3.md answer key asserts 90 °C"],
  },
  { kind: "orphan-claim", claimId: "claim.orphan.cc33", evidence: ["No concept-map parent authorizes this definition."] },
  { kind: "upstream-drift", claimId: "claim.mp.aa11", evidence: ["Pinned source rev12345 moved to rev12999."] },
  { kind: "term-proposal", termId: "term.pam", label: "PAM", scope: ["chapter-4"], suggestedPlacement: "concept.crispr.5" },
];

test("mixed findings produce a schema-valid queue", () => {
  const q = buildQueue(MIXED, CLAIMS);
  assert.deepEqual(validateQueue(q), []);
  assert.equal(q.items.length, 4);
});

test("evidence is actionable prose naming the files a human must open", () => {
  const q = buildQueue(MIXED, CLAIMS);
  const inconsistency = q.items.find((i) => i.kind === "internal-inconsistency");
  assert.ok(inconsistency.evidence.some((e) => e.includes("100 °C") && e.includes("90 °C")));
  // this module adds the WHERE for every participating claim
  assert.ok(inconsistency.evidence.some((e) => e.includes("claim.mp.aa11") && e.includes("study-guide/ch3.md")));
  assert.ok(inconsistency.evidence.some((e) => e.includes("claim.mp-key.bb22") && e.includes("practice/ch3.md")));
});

test("a multi-claim finding is ONE item, with all participants named", () => {
  const q = buildQueue([MIXED[0]], CLAIMS);
  assert.equal(q.items.length, 1);
  assert.equal(q.items[0].claimIds[0], "claim.mp-key.bb22"); // sorted; [0] is the primary handle
  assert.ok(q.items[0].evidence.some((e) => e.includes("claim.mp.aa11")));
});

// THE REGRESSION THIS SCHEMA CHANGE EXISTS TO PREVENT: a value-disagreement is inherently
// BETWEEN 2+ claims. When the item carried one `claimId`, the other participants survived
// only as prose — invisible to any "show me every flag touching claim X" query. All of them
// must be machine-indexable, not just the primary handle.
test("a multi-claim value-disagreement exposes ALL participants in claimIds, not just the first", () => {
  const q = buildQueue(
    [
      {
        kind: "value-disagreement",
        claimIds: ["claim.mp.aa11", "claim.mp-key.bb22", "claim.orphan.cc33"],
        evidence: ["study-guide/ch3.md asserts 100 °C; practice/ch3.md answer key asserts 90 °C; slides say 95 °C"],
      },
    ],
    CLAIMS,
  );
  assert.deepEqual(validateQueue(q), []);
  assert.equal(q.items.length, 1, "one adjudication = one item");
  assert.deepEqual(q.items[0].claimIds, ["claim.mp-key.bb22", "claim.mp.aa11", "claim.orphan.cc33"]);

  // every participant is indexable — this is the query that used to miss them
  for (const id of ["claim.mp.aa11", "claim.mp-key.bb22", "claim.orphan.cc33"]) {
    const touching = q.items.filter((i) => (i.claimIds ?? []).includes(id));
    assert.equal(touching.length, 1, `a flag touching ${id} must be findable by ${id}`);
    // ...and still named in the prose the instructor reads
    assert.ok(touching[0].evidence.some((e) => e.includes(id)), `${id} must also appear in evidence prose`);
  }
  // the replaced singular field must not linger
  assert.ok(!("claimId" in q.items[0]));
});

test("a single-claim finding carries a one-element claimIds array", () => {
  const q = buildQueue([{ kind: "orphan-claim", claimId: "claim.orphan.cc33", evidence: ["no parent"] }], CLAIMS);
  assert.deepEqual(validateQueue(q), []);
  assert.deepEqual(q.items[0].claimIds, ["claim.orphan.cc33"]);
  assert.ok(!("claimId" in q.items[0]));
});

// -- detector kind vs queue kind ---------------------------------------------------------

test("a detector kind maps to its queue kind; the observation survives in detectorKinds", () => {
  const q = buildQueue([{ kind: "definition-drift", claimId: "claim.mp.aa11", evidence: ["drift"] }], CLAIMS);
  assert.deepEqual(validateQueue(q), []);
  assert.equal(q.items[0].kind, "internal-inconsistency"); // what the human is asked
  assert.deepEqual(q.items[0].detectorKinds, ["definition-drift"]); // what was observed
});

test("a finding speaking a queue kind directly records that kind as its own detectorKind", () => {
  const q = buildQueue([{ kind: "orphan-claim", claimId: "claim.orphan.cc33", evidence: ["no parent"] }], CLAIMS);
  assert.deepEqual(validateQueue(q), []);
  assert.deepEqual(q.items[0].detectorKinds, ["orphan-claim"]); // minItems 1, never empty
});

// THE CASE THAT PROVES THE FOLD PRESERVES THE OBSERVATION. Two detectors observe different
// things about the same claims. The human has ONE adjudication -> ONE item (the queue kind
// is the dedupe key). But both observations must survive the fold into that one item.
test("two different detector kinds over the same claim set merge into ONE item holding BOTH", () => {
  const q = buildQueue(
    [
      { kind: "value-disagreement", claimIds: ["claim.mp.aa11", "claim.mp-key.bb22"], evidence: ["100 °C vs 90 °C"] },
      { kind: "cross-artifact-mismatch", claimIds: ["claim.mp-key.bb22", "claim.mp.aa11"], evidence: ["gate: guide/key mismatch"] },
    ],
    CLAIMS,
  );
  assert.deepEqual(validateQueue(q), []);
  assert.equal(q.items.length, 1, "one decision = one item");
  assert.equal(q.burden.flagCount, 1, "the human is interrupted once");
  assert.equal(q.items[0].kind, "internal-inconsistency");
  // the fold to one queue kind did NOT destroy either observation
  assert.deepEqual(q.items[0].detectorKinds, ["cross-artifact-mismatch", "value-disagreement"]);
  // ...nor either detector's evidence
  assert.ok(q.items[0].evidence.some((e) => e.includes("100 °C")));
  assert.ok(q.items[0].evidence.some((e) => e.includes("gate:")));
});

// The study metric this field exists to make computable: S-F reports detection recall PER
// LAYER. That must be answerable from detectorKinds alone — no prose parsing.
test("per-layer recall is answerable from detectorKinds alone", () => {
  const q = buildQueue(
    [
      { kind: "definition-drift", claimIds: ["claim.mp.aa11"], evidence: ["a"] },
      { kind: "definition-drift", claimIds: ["claim.orphan.cc33"], evidence: ["b"] },
      { kind: "value-disagreement", claimIds: ["claim.orphan.cc33"], evidence: ["c"] }, // merges with the above
      { kind: "value-disagreement", claimIds: ["claim.mp-key.bb22"], evidence: ["d"] },
    ],
    CLAIMS,
  );
  const contributedTo = (layer) => q.items.filter((i) => i.detectorKinds.includes(layer)).length;
  assert.equal(contributedTo("definition-drift"), 2);
  assert.equal(contributedTo("value-disagreement"), 2);
  // and the merged item credits BOTH layers — neither is under-counted by the fold
  const both = q.items.find((i) => i.detectorKinds.length === 2);
  assert.deepEqual(both.detectorKinds, ["definition-drift", "value-disagreement"]);
  assert.deepEqual(both.claimIds, ["claim.orphan.cc33"]);
});

test("an unmapped detector kind THROWS — a contract break, surfaced at build time", () => {
  assert.throws(
    () => buildQueue([{ kind: "something-nobody-froze", claimId: "claim.mp.aa11", evidence: ["?"] }], CLAIMS),
    /unmapped finding kind "something-nobody-froze"/,
  );
  // the message must tell the next person what to do about it
  assert.throws(
    () => buildQueue([{ kind: "nope" }], CLAIMS),
    /DETECTOR_TO_QUEUE/,
  );
});

test("a missing kind THROWS too — it cannot be anything but a contract break", () => {
  assert.throws(() => buildQueue([{ claimId: "claim.mp.aa11", evidence: ["no kind at all"] }], CLAIMS), /unmapped finding kind/);
  assert.throws(() => buildQueue([{ kind: null, evidence: ["x"] }], CLAIMS), /unmapped finding kind/);
});

test("every frozen queue kind and mapped detector kind is accepted", () => {
  for (const kind of KINDS) {
    const q = buildQueue([{ kind, claimId: "claim.mp.aa11", evidence: ["x"] }], CLAIMS);
    assert.deepEqual(validateQueue(q), [], `queue kind ${kind} must be accepted`);
  }
  for (const kind of ["value-disagreement", "definition-drift", "cross-artifact-mismatch"]) {
    const q = buildQueue([{ kind, claimId: "claim.mp.aa11", evidence: ["x"] }], CLAIMS);
    assert.deepEqual(validateQueue(q), [], `detector kind ${kind} must be accepted`);
    assert.equal(q.items[0].kind, "internal-inconsistency");
  }
});

// -- burden -----------------------------------------------------------------------------

test("burden math: flagCount, artifactCount from distinct claim locations, flagsPerArtifact", () => {
  const q = buildQueue(MIXED, CLAIMS);
  // distinct files across ALL claims: ch3 guide, ch3 practice, ch3 slides, ch4 guide = 4
  assert.equal(q.burden.artifactCount, 4);
  assert.equal(q.burden.flagCount, 4);
  assert.equal(q.burden.flagCount, q.items.length);
  assert.equal(q.burden.flagsPerArtifact, 1);
});

test("burden denominator counts distinct FILES across every claim, not flagged files only", () => {
  const claims = {
    schemaVersion: 1,
    claims: [
      claim("claim.a.1", "fact", ["study-guide/ch1.md", "study-guide/ch1.md"]), // duplicate file counts once
      claim("claim.b.2", "fact", ["slides/ch1.md"]),
      claim("claim.c.3", "fact", ["practice/ch1.md"]), // never flagged, still an artifact
    ],
  };
  const q = buildQueue([{ kind: "suspected-error", claimId: "claim.a.1", evidence: ["x"] }], claims);
  assert.equal(q.burden.artifactCount, 3);
  assert.equal(q.burden.flagCount, 1);
  assert.equal(q.burden.flagsPerArtifact, 0.3333);
});

test("zero artifacts: no divide-by-zero, no Infinity, no NaN", () => {
  const q = buildQueue([{ kind: "sanity-check", evidence: ["a flag with no claims behind it"] }], { schemaVersion: 1, claims: [] });
  assert.deepEqual(validateQueue(q), []);
  assert.equal(q.burden.artifactCount, 0);
  assert.equal(q.burden.flagCount, 1);
  assert.equal(q.burden.flagsPerArtifact, 0);
  assert.ok(Number.isFinite(q.burden.flagsPerArtifact));
});

test("empty / absent findings -> valid empty queue, honestly zeroed burden, no crash", () => {
  for (const input of [[], null, undefined]) {
    const q = buildQueue(input, { schemaVersion: 1, claims: [] });
    assert.deepEqual(validateQueue(q), []);
    assert.deepEqual(q, { schemaVersion: 1, items: [], burden: { flagCount: 0, artifactCount: 0, flagsPerArtifact: 0 } });
  }
  // absent claims too
  assert.deepEqual(validateQueue(buildQueue(undefined, undefined)), []);
  assert.deepEqual(validateQueue(buildQueue([{ kind: "orphan-claim", claimId: "claim.ghost.1" }], undefined)), []);
});

// -- term proposals ---------------------------------------------------------------------

test("term-proposal carries a PLACEMENT proposal, and batches candidates by proposed parent", () => {
  const findings = [
    { kind: "term-proposal", termId: "term.pam", label: "PAM", scope: ["chapter-4"], suggestedPlacement: "concept.crispr.5" },
    { kind: "term-proposal", termId: "term.protospacer", label: "protospacer", scope: ["chapter-4"], suggestedPlacement: "concept.crispr.5" },
    { kind: "term-proposal", termId: "term.tracrrna", label: "tracrRNA", scope: ["chapter-4"], suggestedPlacement: "concept.crispr.5" },
    { kind: "term-proposal", termId: "term.anti-crispr", label: "anti-CRISPR", scope: ["chapter-4"] }, // no parent
  ];
  const q = buildQueue(findings, CLAIMS);
  assert.deepEqual(validateQueue(q), []);

  // 4 candidate terms -> 2 interruptions, not 4
  const props = q.items.filter((i) => i.kind === "term-proposal");
  assert.equal(props.length, 2);
  assert.equal(q.burden.flagCount, 2);

  const placed = props.find((p) => p.proposal.includes("concept.crispr.5"));
  assert.ok(placed, "batched proposal names the proposed parent");
  for (const label of ['"PAM"', '"protospacer"', '"tracrRNA"']) assert.ok(placed.proposal.includes(label));
  assert.ok(placed.proposal.includes("3 candidate terms"));
  // placement, not yes/no
  assert.ok(/re-place/i.test(placed.proposal) && /WHERE/.test(placed.proposal));
  assert.equal(placed.severity, "info");
  assert.ok(!("claimIds" in placed)); // a proposal is about terms, not about claims

  // no-parent candidates are a DIFFERENT question -> their own item
  const unplaced = props.find((p) => p !== placed);
  assert.ok(/no proposed parent/.test(unplaced.proposal));
  assert.ok(/new sub-concept/i.test(unplaced.proposal));
  assert.ok(!unplaced.proposal.includes("concept.crispr.5"));
});

test("term proposal evidence reports where a candidate is already used", () => {
  const q = buildQueue(
    [{ kind: "term-proposal", termId: "term.pam", label: "PAM", scope: ["chapter-4"], suggestedPlacement: "concept.crispr.5" }],
    CLAIMS,
  );
  assert.ok(q.items[0].evidence.some((e) => e.includes('"PAM" is already used in study-guide/ch4.md')));
});

test("term proposals batch by scope as well as parent", () => {
  const q = buildQueue(
    [
      { kind: "term-proposal", label: "b", scope: ["chapter-1"], suggestedPlacement: "concept.x.1" },
      { kind: "term-proposal", label: "a", scope: ["chapter-2"], suggestedPlacement: "concept.x.1" },
    ],
    CLAIMS,
  );
  assert.equal(q.items.filter((i) => i.kind === "term-proposal").length, 2);
});

// -- dedupe -----------------------------------------------------------------------------

test("dedupe: two detectors naming the same claim with the same kind = ONE item", () => {
  const q = buildQueue(
    [
      { kind: "internal-inconsistency", claimId: "claim.mp.aa11", evidence: ["consistency scan: 100 °C vs 90 °C"] },
      { kind: "value-disagreement", claimId: "claim.mp.aa11", evidence: ["gate: answer key disagrees with the guide"] },
    ],
    CLAIMS,
  );
  assert.equal(q.items.length, 1);
  assert.equal(q.burden.flagCount, 1);
  // merging must not lose either detector's evidence
  assert.ok(q.items[0].evidence.some((e) => e.includes("consistency scan")));
  assert.ok(q.items[0].evidence.some((e) => e.includes("gate:")));
});

test("dedupe: merging never quiets a finding — the most severe severity wins", () => {
  const q = buildQueue(
    [
      { kind: "suspected-error", claimId: "claim.mp.aa11", severity: "info", evidence: ["quiet"] },
      { kind: "suspected-error", claimId: "claim.mp.aa11", severity: "blocking", evidence: ["loud"] },
    ],
    CLAIMS,
  );
  assert.equal(q.items.length, 1);
  assert.equal(q.items[0].severity, "blocking");
});

test("dedupe: claim-set identity is order-independent", () => {
  const q = buildQueue(
    [
      { kind: "value-disagreement", claimIds: ["claim.mp.aa11", "claim.mp-key.bb22"], evidence: ["A"] },
      { kind: "value-disagreement", claimIds: ["claim.mp-key.bb22", "claim.mp.aa11"], evidence: ["B"] },
    ],
    CLAIMS,
  );
  assert.equal(q.items.length, 1);
  assert.ok(q.items[0].evidence.includes("A") && q.items[0].evidence.includes("B"));
});

test("deliberately NOT merged: same claim different kind, and findings naming no claim", () => {
  const q = buildQueue(
    [
      { kind: "suspected-error", claimId: "claim.mp.aa11", evidence: ["is the fact wrong?"] },
      { kind: "orphan-claim", claimId: "claim.mp.aa11", evidence: ["what concept authorizes it?"] },
      { kind: "sanity-check", evidence: ["unanchored flag 1"] },
      { kind: "sanity-check", evidence: ["unanchored flag 2"] },
    ],
    CLAIMS,
  );
  assert.equal(q.items.length, 4); // two questions about one claim + two unidentifiable flags
});

// -- ordering / determinism -------------------------------------------------------------

test("ordering: blocking before review before info", () => {
  const q = buildQueue(MIXED, CLAIMS);
  const ranks = q.items.map((i) => ["blocking", "review", "info"].indexOf(i.severity));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  assert.equal(q.items[0].kind, "internal-inconsistency"); // blocking
  assert.equal(q.items.at(-1).kind, "term-proposal"); // info: housekeeping reads last
});

test("ordering: within a severity, kinds follow the schema enum order", () => {
  const q = buildQueue(
    [
      { kind: "orphan-claim", claimId: "claim.orphan.cc33", evidence: ["o"] },
      { kind: "source-conflict", claimId: "claim.mp.aa11", evidence: ["s"] },
      { kind: "sanity-check", claimId: "claim.mp-key.bb22", evidence: ["c"] },
    ],
    CLAIMS,
  );
  assert.deepEqual(q.items.map((i) => i.kind), ["source-conflict", "sanity-check", "orphan-claim"]);
});

test("deterministic: same input twice -> byte-identical output", () => {
  const a = JSON.stringify(buildQueue(MIXED, CLAIMS));
  const b = JSON.stringify(buildQueue(MIXED, CLAIMS));
  assert.equal(a, b);
});

test("canonical: the queue is a function of the finding SET, not of detector order", () => {
  const shuffled = [MIXED[3], MIXED[1], MIXED[0], MIXED[2]];
  assert.equal(JSON.stringify(buildQueue(shuffled, CLAIMS)), JSON.stringify(buildQueue(MIXED, CLAIMS)));
});

test("pure: the inputs are not mutated", () => {
  const findings = JSON.parse(JSON.stringify(MIXED));
  const claims = JSON.parse(JSON.stringify(CLAIMS));
  buildQueue(findings, claims);
  assert.deepEqual(findings, JSON.parse(JSON.stringify(MIXED)));
  assert.deepEqual(claims, JSON.parse(JSON.stringify(CLAIMS)));
});

test("a bare claims array is accepted as well as the CLAIMS envelope", () => {
  const q = buildQueue(MIXED, CLAIMS.claims);
  assert.equal(JSON.stringify(q), JSON.stringify(buildQueue(MIXED, CLAIMS)));
});

test("a flag naming a claim the index does not have is surfaced, not dropped", () => {
  const q = buildQueue([{ kind: "suspected-error", claimId: "claim.ghost.9" }], CLAIMS);
  assert.deepEqual(validateQueue(q), []);
  assert.equal(q.items.length, 1);
  assert.ok(q.items[0].evidence.some((e) => e.includes("the index does not have")));
});
