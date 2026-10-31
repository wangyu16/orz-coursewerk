// Override manager (M7) — AUTHORIZED DIVERGENCE, NOT HALLUCINATION.
//
// A package is pinned to a source. Sometimes the instructor deliberately says something
// the pinned source does not: the IUPAC-recommended name the textbook never adopted, a
// 2026 study that supersedes the 2019 chapter, a simplification chosen for teaching. Left
// unrecorded, every one of those correct decisions looks exactly like a fabrication to the
// source-fidelity checker — so the checker calls `isAuthorizedDivergence` FIRST, before it
// judges anything. This file is the record that makes "the instructor decided this" a fact
// the machine can see.
//
// PRECEDENCE OF TRUTH IN A PACKAGE (spec §10 decision 2 addendum):
//     instructor override (sourced OR confirmed)  >  pinned source  >  model internal knowledge
// The model's internal knowledge is frozen at training time and may itself be stale. It is a
// TRIPWIRE — a reason to ask ONCE, with reasoning, before propagating an implausible value —
// never an authority that overrules a decision the instructor already made.
//
// ASK-ONCE LIFECYCLE:  propose -> confirm/source -> recorded -> SILENT FOREVER.
// `needsAsk` returns false the moment an override exists for a claim, and never returns true
// for it again. Re-asking a settled question is alarm fatigue, and alarm fatigue is how a real
// warning gets clicked through. Re-asking is a BUG, not caution.
//
// EQUAL AUTHORITY (spec §10 decision 4): `basis` records WHY the divergence is authorized —
// `cited` | `instructor-expertise` | `pedagogical-choice` — and all three are EQUALLY
// authoritative inside the package. A source is REQUESTED, never REQUIRED. `isAuthorizedDivergence`
// therefore MUST NOT discriminate by basis; `basis` is for publish-time transparency (the pack
// receipt lists overrides by basis; uncited ones appear in the deviation notes — visible, never
// blocking, neutral tone), not for gating.
//
// WHY `rationale` IS REQUIRED ALWAYS: an uncited override still has to answer "why does this
// package diverge from its source?" for a maintainer three semesters later, for the instructor's
// own future reference, and for downstream OER reusers. The agent asks a scribe's question ("for
// the record, what's the basis?"), not a challenge — and records the answer verbatim.
//
// `declinedUpstream` is the other half of the story: upstream source updates deliberately NOT
// adopted. Without it, "the package is BEHIND its source" (staleness — a defect) is
// indistinguishable from "the package DELIBERATELY diverges" (a decision). Recording the decline
// converts a future false alarm into a settled fact.
//
// PURE / DETERMINISTIC: no clock, no I/O, no network. The caller passes `date`; every function
// returns a new document and never mutates its input, so the same input always yields byte-identical
// output (this file sits in the index path — see interfaces §6.1).

/** Canonical location of the override record inside a package. */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const OVERRIDES_PATH = "private/coursewerk/OVERRIDES.json";

/** The `basis` enum, in schema order. All three are equally authoritative. */
export const BASES = Object.freeze(["cited", "instructor-expertise", "pedagogical-choice"]);

/** Fields the schema permits on an override entry (`additionalProperties: false`). */
const OVERRIDE_FIELDS = Object.freeze([
  "claimId",
  "divergesFrom",
  "basis",
  "justifiedBy",
  "authorizedBy",
  "date",
  "rationale",
]);

/** Fields the schema permits on a `declinedUpstream` entry. */
const DECLINED_FIELDS = Object.freeze(["sourceRef", "date", "rationale"]);

const CLAIM_ID_RE = /^claim\./;

// ISO-8601 calendar date (YYYY-MM-DD) — mirrors the schema's `date` pattern on BOTH
// `overrides[]` and `declinedUpstream[]`. These dates feed publish-time receipts and the
// package's deviation notes, where free-form dates poison sorting and display. Enforced HERE,
// once, rather than at each call site — and by SHAPE only: the caller still supplies the value
// (no clock in this module). A timestamp is deliberately rejected; a package decision is dated,
// not clocked, and accepting both shapes would put two spellings of one day on disk.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class OverrideError extends Error {
  constructor(message) {
    super(message);
    this.name = "OverrideError";
  }
}

function fail(message) {
  throw new OverrideError(message);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Require an ISO-8601 `YYYY-MM-DD` date. Shape only — no clock, no calendar arithmetic.
 * @param {string} value
 * @param {string} fn - calling function name, for a message that says what to do
 */
function requireIsoDate(value, fn) {
  if (!isNonEmptyString(value)) {
    fail(`${fn}: date is required (pass it in — this module has no clock).`);
  }
  if (!ISO_DATE_RE.test(value)) {
    fail(
      `${fn}: date must be an ISO-8601 calendar date, YYYY-MM-DD (got ${JSON.stringify(value)}). ` +
        'Zero-pad month and day ("2026-07-16", not "2026-7-16") and pass the date only, without a time component.',
    );
  }
}

/**
 * Normalize a possibly-absent/partial document into the schema shape.
 * Tolerant on READ (a package with no OVERRIDES.json degrades to "nothing is authorized"),
 * strict on WRITE (see `recordOverride`).
 * @param {object|null|undefined} overrides
 * @returns {{schemaVersion: 1, overrides: object[], declinedUpstream?: object[]}}
 */
export function emptyOverrides() {
  return { schemaVersion: 1, overrides: [] };
}

function asDoc(overrides) {
  if (overrides == null) return emptyOverrides();
  if (typeof overrides !== "object" || Array.isArray(overrides)) fail("OVERRIDES must be an object.");
  const doc = {
    schemaVersion: 1,
    overrides: Array.isArray(overrides.overrides) ? overrides.overrides.slice() : [],
  };
  if (Array.isArray(overrides.declinedUpstream)) doc.declinedUpstream = overrides.declinedUpstream.slice();
  return doc;
}

/**
 * Is this claim's divergence from the pinned source AUTHORIZED by a recorded instructor decision?
 *
 * The source-fidelity checker calls this FIRST: `true` means "not a hallucination — the instructor
 * decided this", and the checker must not flag it. Deliberately blind to `basis`: a
 * `pedagogical-choice` override is exactly as authorized as a `cited` one (spec §10 decision 4).
 *
 * @param {object|null} overrides - OVERRIDES document (absent/empty is fine → false).
 * @param {string} claimId
 * @returns {boolean}
 */
export function isAuthorizedDivergence(overrides, claimId) {
  return findOverride(overrides, claimId) != null;
}

/**
 * The recorded override for a claim, or null. Useful for reporting (which basis? whose decision?
 * what rationale?) — never for gating, which is `isAuthorizedDivergence`'s job.
 * @param {object|null} overrides
 * @param {string} claimId
 * @returns {object|null}
 */
/**
 * The id of an override ENTRY — W5's missing producer. `claims.schema.json` declares
 * `claim.overrideId` and the `provenance` fingerprint hashes it, so "provenance moves on override"
 * (spec §2.4) needs an id that (a) exists and (b) MOVES when the authorization changes. Entries
 * carry no id field (the schema is closed), so the id is content-derived: `override.` + the first
 * 12 hex of sha256 over the entry's fields in a fixed key order. Re-authorizing with a different
 * basis, date or rationale is a different id — a different provenance — which is the point.
 */
export function overrideIdOf(entry) {
  if (entry == null || typeof entry !== "object") return null;
  const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object"
    ? Object.keys(v).sort().map((k) => [k, canon(v[k])]) : v);
  const canonical = JSON.stringify(canon(entry));
  return `override.${createHash("sha256").update(canonical).digest("hex").slice(0, 12)}`;
}

/**
 * Read `private/coursewerk/OVERRIDES.json` off disk for `root`. A missing file is `null` ("no overrides");
 * a corrupt one is ALSO `null` here — reporting corruption is the gate's job (`readOverrides` in
 * check_oer.mjs, which names the fault); consumers that only need the authorizations fail toward
 * the human when they get none. Owned here so M2 never parses a registry it does not own (§5d).
 */
export function loadOverridesFile(root) {
  const file = path.join(path.resolve(root), OVERRIDES_PATH);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

export function findOverride(overrides, claimId) {
  if (!isNonEmptyString(claimId)) return null;
  const list = asDoc(overrides).overrides;
  for (const entry of list) {
    if (entry && entry.claimId === claimId) return entry;
  }
  return null;
}

/**
 * Record an authorized divergence. Returns a NEW document; the input is never mutated.
 *
 * VALIDATION (spec §10 decision 4 — throws `OverrideError` with a clear message on violation):
 *  - `claimId` (must look like `claim.…`), `divergesFrom`, `authorizedBy`, `date` — required.
 *  - `basis` ∈ {cited, instructor-expertise, pedagogical-choice}.
 *  - `date` — required, ISO-8601 `YYYY-MM-DD` (shape only; the caller supplies the value).
 *  - `rationale` — REQUIRED ALWAYS. For uncited bases it IS the record: the explanation a future
 *    maintainer needs to learn why the package diverges.
 *  - `justifiedBy` — required IF AND ONLY IF basis === "cited". Supplying a justifying source while
 *    claiming an uncited basis mislabels the record, so it is rejected: the entry is `cited`.
 *  - No fields beyond the schema's (`additionalProperties: false`).
 *
 * Recording twice for the same claim REPLACES the prior entry in place (latest decision wins, order
 * preserved) — a claim has exactly one authorization, and duplicates would make the document
 * non-deterministic. It does NOT re-open the question: `needsAsk` stays false either way.
 *
 * @param {object|null} overrides - existing document (null/absent → a fresh one).
 * @param {{claimId:string, divergesFrom:string, basis:string, justifiedBy?:string, authorizedBy:string, date:string, rationale:string}} entry
 * @returns {object} the new OVERRIDES document
 */
export function recordOverride(overrides, entry) {
  if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
    fail("recordOverride: entry must be an object.");
  }

  const unknown = Object.keys(entry).filter((k) => !OVERRIDE_FIELDS.includes(k));
  if (unknown.length) {
    fail(`recordOverride: unknown field(s) ${unknown.join(", ")}; allowed: ${OVERRIDE_FIELDS.join(", ")}.`);
  }

  if (!isNonEmptyString(entry.claimId)) fail("recordOverride: claimId is required.");
  if (!CLAIM_ID_RE.test(entry.claimId)) {
    fail(`recordOverride: claimId must start with "claim." (got "${entry.claimId}").`);
  }
  if (!isNonEmptyString(entry.divergesFrom)) {
    fail("recordOverride: divergesFrom is required (the pinned source anchor this deliberately contradicts).");
  }
  if (!BASES.includes(entry.basis)) {
    fail(`recordOverride: basis must be one of ${BASES.join(" | ")} (got ${JSON.stringify(entry.basis)}).`);
  }
  if (!isNonEmptyString(entry.authorizedBy)) fail("recordOverride: authorizedBy is required.");
  requireIsoDate(entry.date, "recordOverride");

  // rationale: REQUIRED ALWAYS. This is the "why does this package diverge?" record.
  if (!isNonEmptyString(entry.rationale)) {
    fail(
      `recordOverride: rationale is required for every override (basis "${entry.basis}") — ` +
        "it is the record and explanation a future maintainer needs to learn why this package diverges from its source.",
    );
  }

  // justifiedBy: required IFF basis === "cited".
  const hasJustifiedBy = isNonEmptyString(entry.justifiedBy);
  if (entry.basis === "cited" && !hasJustifiedBy) {
    fail('recordOverride: justifiedBy is required when basis is "cited" (the newer/authoritative source S\').');
  }
  if (entry.basis !== "cited" && entry.justifiedBy !== undefined) {
    fail(
      `recordOverride: justifiedBy is only valid when basis is "cited" (got basis "${entry.basis}"). ` +
        'If a source justifies this divergence, record basis "cited"; otherwise put the reasoning in rationale.',
    );
  }

  const record = {
    claimId: entry.claimId,
    divergesFrom: entry.divergesFrom,
    basis: entry.basis,
    ...(entry.basis === "cited" ? { justifiedBy: entry.justifiedBy } : {}),
    authorizedBy: entry.authorizedBy,
    date: entry.date,
    rationale: entry.rationale,
  };

  const doc = asDoc(overrides);
  const at = doc.overrides.findIndex((e) => e && e.claimId === record.claimId);
  if (at >= 0) doc.overrides[at] = record;
  else doc.overrides.push(record);
  return doc;
}

/**
 * ASK-ONCE. Should the agent ask the instructor to confirm/source this claim's divergence?
 *
 * `true` only while the question is genuinely open. Once `recordOverride` has settled the claim this
 * is false FOREVER — including when the model's internal knowledge still disagrees, because internal
 * knowledge is a tripwire for the first ask, not an authority over a recorded decision.
 *
 * @param {object|null} overrides
 * @param {string} claimId
 * @returns {boolean}
 */
export function needsAsk(overrides, claimId) {
  return !isAuthorizedDivergence(overrides, claimId);
}

/**
 * Record an upstream source update deliberately NOT adopted. Returns a NEW document.
 *
 * This is what separates "the package is BEHIND its source" (staleness — a defect to fix) from "the
 * package DELIBERATELY diverges" (a decision to respect). Same discipline as an override: rationale
 * required, ISO-8601 `YYYY-MM-DD` date passed in by the caller. Re-declining the same `sourceRef`
 * replaces the prior entry.
 *
 * @param {object|null} overrides
 * @param {{sourceRef:string, date:string, rationale:string}} entry
 * @returns {object} the new OVERRIDES document
 */
export function recordDeclined(overrides, entry) {
  if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
    fail("recordDeclined: entry must be an object.");
  }
  const unknown = Object.keys(entry).filter((k) => !DECLINED_FIELDS.includes(k));
  if (unknown.length) {
    fail(`recordDeclined: unknown field(s) ${unknown.join(", ")}; allowed: ${DECLINED_FIELDS.join(", ")}.`);
  }
  if (!isNonEmptyString(entry.sourceRef)) fail("recordDeclined: sourceRef is required (the upstream update not adopted).");
  requireIsoDate(entry.date, "recordDeclined");
  if (!isNonEmptyString(entry.rationale)) {
    fail("recordDeclined: rationale is required — it is what distinguishes a deliberate decline from staleness.");
  }

  const record = { sourceRef: entry.sourceRef, date: entry.date, rationale: entry.rationale };
  const doc = asDoc(overrides);
  const list = doc.declinedUpstream ? doc.declinedUpstream : [];
  const at = list.findIndex((e) => e && e.sourceRef === record.sourceRef);
  if (at >= 0) list[at] = record;
  else list.push(record);
  doc.declinedUpstream = list;
  return doc;
}

/**
 * Was this upstream source update deliberately declined? A staleness check consults this before
 * reporting the package as behind its source.
 * @param {object|null} overrides
 * @param {string} sourceRef
 * @returns {boolean}
 */
export function isDeclined(overrides, sourceRef) {
  return findDeclined(overrides, sourceRef) != null;
}

/**
 * The recorded decline for a source ref, or null (for reporting the rationale).
 * @param {object|null} overrides
 * @param {string} sourceRef
 * @returns {object|null}
 */
export function findDeclined(overrides, sourceRef) {
  if (!isNonEmptyString(sourceRef)) return null;
  const list = asDoc(overrides).declinedUpstream || [];
  for (const entry of list) {
    if (entry && entry.sourceRef === sourceRef) return entry;
  }
  return null;
}

/**
 * Overrides grouped by basis — for the publish-time pack receipt and deviation notes
 * (transparency, never gating).
 * @param {object|null} overrides
 * @returns {Record<string, object[]>} one key per basis, in schema order
 */
export function overridesByBasis(overrides) {
  const out = {};
  for (const basis of BASES) out[basis] = [];
  for (const entry of asDoc(overrides).overrides) {
    if (entry && BASES.includes(entry.basis)) out[entry.basis].push(entry);
  }
  return out;
}

export { OverrideError };
