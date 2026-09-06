// Semantic index WRITER (M14) — the module that persists `metadata/SPINE.json`,
// `metadata/TERMS.json` and `metadata/CLAIMS.json`.
//
// Why this exists
// ---------------
// Thirteen modules were wired into nothing a user runs. M13 mints the spine, M1 the terms, M2
// the claims — and **nothing wrote any of them down**. Every test to date hand-builds its
// inputs, which is exactly how a suite stays green while the system is inert on a real package:
// spec §6.8's one-shot `reindex` was named in the migration plan and never built.
//
// But the missing writer is not a packaging chore. It is the substrate for the product's
// headline claim. `matchClaims(old, new)` and `claimImpact(...)` take an **old**, and with no
// persisted prior state there IS no "before": the null-edit/real-edit delta cannot be measured,
// and `silentRisk` — the answer key that quietly contradicts a changed value, the one failure
// NOTHING else in the system can see — can never fire. A detector with no baseline does not
// detect. This module is the baseline.
//
// THE SHAPE (mirrored from `lib/coherence.mjs`, deliberately — it solves the identical problem)
// --------------------------------------------------------------------------------------------
//   the STORED artifact  = the "before"      -> `loadSemanticIndex`
//   a FRESH COMPUTE      = the "after"       -> `computeSemanticIndex`
//   the GATE compares them                   -> M11's, not this module's
//   the ACCEPT step writes the new state     -> `writeSemanticIndex`
// Same four beats as `computeComponentGraph` / `loadComponentIndex` / `auditCoherence` /
// `writeComponentIndex`. A reader who knows the component layer already knows this one.
//
// ONE DELIBERATE DIFFERENCE FROM THE COMPONENT INDEX — DO NOT COPY ITS GATING
// ---------------------------------------------------------------------------
// `COMPONENT_INDEX.json` is an **attested coherence state**: it records that a human reviewed
// an impact set, which is why refreshing it demands `--review` and an accepted-hash ledger.
// Regenerating it without that attestation would launder an unreviewed edit into "accepted".
//
// These three artifacts are **purely derived and deterministic**: same package bytes -> the same
// output, byte for byte. They assert nothing a human must stand behind — they are a PROJECTION
// of the concept maps and deliverables, a snapshot taken so a later compute has something to
// diff against. There is nothing to attest, so there is nothing to gate: **regenerating must be
// safe and repeatable**, and an accept step that could refuse to record the truth would be worse
// than no accept step. (This is the schemas' own language: TERMS and SPINE are "ALWAYS derived,
// NEVER an authority ... regenerate it any time; it cannot disagree with the maps because it has
// no independent existence.") If that reasoning is wrong, the fix is to say so here, not to bolt
// a review flag onto a pure function.
//
// NO CLOCK — AND THIS IS THE ONE FIELD MOST WORTH ARGUING ABOUT
// -------------------------------------------------------------
// `makeComponentIndex` stamps `generatedAt: new Date().toISOString()`. **This module has no
// such step, on purpose, and that is why there is no `makeSemanticIndex`**: adding the stamp is
// the only work that function does, and here it would be poison. A timestamp inside a derived
// artifact makes it irreproducible — two runs over identical bytes would differ, so the
// byte-identity property that the whole delta rests on would be false, and a flag a human acted
// on could not be regenerated from git months later to check whether the machine was right.
// Provenance is the CALLER's to stamp, outside the artifact, where it cannot contaminate the
// comparison. (SPINE/TERMS carry `generatedFrom` — file names, not a clock. That is provenance
// that survives regeneration.)
//
// HONEST GAPS, NOT SILENT ONES
// ----------------------------
// A package with no concept maps yields an empty spine and an empty registry. That is the
// correct DATA — inventing a node would put words in the instructor's mouth (M13's refusal) —
// but it must never be reported as a successful index: every spineRef in the package would then
// dangle against an empty node set and the gate would have nothing to refute. So the compute
// carries `warnings[]` on its ENVELOPE (never inside an artifact — the schemas are
// `additionalProperties: false`, and a warning is not part of the projection), and the CLI
// refuses outright when there is nothing to index.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { readConceptMaps, buildSpine } from "./spine.mjs";
import { buildTermsReport } from "./terms.mjs";
import { extractClaims } from "./claims.mjs";

export const SPINE_PATH = "metadata/SPINE.json";
export const TERMS_PATH = "metadata/TERMS.json";
export const CLAIMS_PATH = "metadata/CLAIMS.json";

/**
 * The three derived artifacts, sorted, as `lib/coherence.mjs`'s EXCLUDE knows them.
 *
 * Exported so the exclusion list has ONE home. If the coherence kernel spelled these paths a
 * second time, the day a path changed here it would silently stop being excluded there — and
 * the symptom (interfaces §5d: one fact, two derivations) would be a package failing its own
 * gate for emitting its own index.
 */
export const SEMANTIC_INDEX_PATHS = Object.freeze([CLAIMS_PATH, SPINE_PATH, TERMS_PATH]);

/** The house serialization, byte-for-byte identical to `writeComponentIndex`'s. */
const serialize = (value) => JSON.stringify(value, null, 2) + "\n";
/** sha256 of the serialized CLAIMS — the gate stamps it on the queue, the accept step compares. */
export function claimsDigest(claims) {
  return crypto.createHash("sha256").update(serialize(claims)).digest("hex");
}

/**
 * Name the gaps that would make an empty index look like a working one.
 *
 * Each entry is a real, checkable absence with its consequence attached — never a scold. An
 * empty spine is not a bug in this module; it is a fact about the package, and the person
 * running `reindex` is the only one who can fix it.
 */
function indexGaps(conceptMaps, spine, terms, claims, storedTerms, termsReport) {
  const warnings = [];
  // THE STORED REGISTRY IS AN INPUT NOW, so its absence-vs-corruption distinction is load-bearing
  // (see `loadSemanticIndex`): `index: null, error: null` is a legitimate FIRST BUILD and says
  // nothing; `error` set means the memory that makes a term id rename-invariant is unreadable, and
  // the rebuild below has silently re-minted every id from its label. Branch on PRESENCE of the
  // error, never on truthiness of the index — an empty registry is a value, not an absence.
  if (storedTerms.error !== null) {
    warnings.push(
      `${storedTerms.error} — it is the prior term registry, so every term id was RE-MINTED from ` +
        "its current label. A rename in a concept map will move the claim ids that depend on it " +
        "(interfaces §2). Delete it and reindex to re-baseline, or restore it from git.",
    );
  }
  for (const a of termsReport.ambiguous) warnings.push(`concepts/: ${a.reason}`);
  for (const c of termsReport.conflicts ?? []) warnings.push(`concepts/: ${c.detail}`);
  for (const t of terms?.terms ?? [])
    if (Array.isArray(t.spineRefs) && t.spineRefs.length > 1)
      warnings.push(`concepts/: term ${t.id} ("${t.preferredLabel}") is bracketed under ${t.spineRefs.length} spine nodes (${t.spineRefs.join(", ")}); all of them count for coverage — confirm this is intended, or keep one bracket.`);
  if (conceptMaps.length === 0) {
    warnings.push(
      "concepts/: no concept maps found. The spine is EMPTY, so every spineRef in this package " +
        "dangles and no term resolves — this is not an indexed package.",
    );
  } else {
    if (spine.nodes.length === 0) {
      warnings.push(
        "concepts/: the maps carry no `## Objectives` / `## Concept sequence` / " +
          "`## Misconceptions to surface` items, so the spine has no nodes to resolve against.",
      );
    }
    if (terms.terms.length === 0) {
      warnings.push(
        "concepts/: no `## Key terms` declared, so the term registry is empty — every claim's " +
          "`label` fingerprint is computed over no terms and a rename cannot be observed.",
      );
    }
  }
  if (claims.claims.length === 0) {
    warnings.push(
      "study-guide/, practice/, assessment-support/, slides/: no claims extracted. There is no " +
        "'before' to diff a later edit against.",
    );
  }
  return warnings;
}

/**
 * Compute the semantic index from the package — the FRESH state, written nowhere.
 *
 * The pipeline is fixed and each stage feeds the next: the maps are read ONCE (`readConceptMaps`
 * is M13's single I/O seam and applies §1's scope convention, so this module does not re-derive
 * a scope from a filename), the spine and the registry are projected from those same map
 * objects, and the claims are extracted against the registry — a claim cannot resolve a term the
 * registry has not minted.
 *
 * PURE apart from reading the package: no network, no LLM, no clock, no randomness. Same bytes
 * in, same bytes out.
 *
 * @param {string} root package root
 * @returns {{root:string, conceptMaps:Array<object>, spine:object, terms:object, claims:object,
 *            warnings:string[]}} the artifacts plus the ENVELOPE fields (`root`, `conceptMaps`,
 *   `warnings`) — envelope only, never serialized: all three schemas are
 *   `additionalProperties: false` and would reject them, which is the schemas being right.
 */
export function computeSemanticIndex(root) {
  root = path.resolve(root);
  const conceptMaps = readConceptMaps(root);
  // THE STORED REGISTRY IS AN INPUT (interfaces §2, amended 2026-07-17). A term id is minted from
  // its preferredLabel ONCE and never re-minted, so a rebuild must be handed the ids the last one
  // minted or a rename in `## Key terms` re-mints them, moves M2's `identityLabel`, moves the claim
  // id, and the rename that the `label` fingerprint exists to make observable is reported as 3
  // removed + 3 added instead. §3 is explicit that a caller holding a stored registry and not
  // passing it silently reintroduces that defect — and THIS is that caller: nothing else in the
  // system sits between the artifact on disk and `buildTerms`.
  //
  // It does not make the compute impure or irreproducible: TERMS.json is part of the package's own
  // bytes, exactly like the maps. Same bytes in, same bytes out. And it is idempotent — a rebuild
  // over an unchanged map resolves every term to its own prior id, so `reindex` twice is still the
  // no-op the header promises. Absent (a first build) is an ANSWER, not a fault; corrupt is a fault
  // and is warned about rather than read as absent.
  const storedTerms = loadArtifact(root, TERMS_PATH);
  const spine = buildSpine(conceptMaps);
  const termsReport = buildTermsReport(conceptMaps, storedTerms.index);
  const terms = termsReport.terms;
  const claims = extractClaims(root, terms);
  return {
    root,
    conceptMaps,
    spine,
    terms,
    claims,
    termConflicts: termsReport.conflicts ?? [],
    warnings: indexGaps(conceptMaps, spine, terms, claims, storedTerms, termsReport),
  };
}

/** One stored artifact: `{file, index, error}` — the shape `loadComponentIndex` returns. */
function loadArtifact(root, rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return { file, index: null, error: null };
  try {
    return { file, index: JSON.parse(fs.readFileSync(file, "utf8")), error: null };
  } catch (e) {
    return { file, index: null, error: `${rel} is invalid JSON: ${e.message}` };
  }
}

/**
 * Load the STORED semantic index — the "before" the gate diffs a fresh compute against.
 *
 * **A missing artifact is `index: null` with `error: null`, and that is not a failure**
 * (spec §6.8): a package that predates the semantic index must degrade to exactly today's
 * behavior, so absence is an answer here, not a fault. `loadComponentIndex` reports its own
 * absence as an error because that index is REQUIRED — every package must be coherent. These
 * are additive, so the two cases must stay distinguishable:
 *
 *   index: null, error: null  -> never written (backward compatible; there is no "before")
 *   index: null, error: "..." -> written and CORRUPT (a real fault; do not read it as absent)
 *
 * Collapsing those two would let a corrupted CLAIMS.json read as "this package has no claims",
 * which is the system reporting a clean bill of health it has not earned — the exact failure the
 * index exists to prevent. Consumers branch on `present`, never on truthiness.
 *
 * @param {string} root package root
 * @returns {{present:boolean, complete:boolean, errors:string[],
 *            spine:object, terms:object, claims:object}} per-artifact `{file, index, error}`,
 *   plus `present` (any artifact stored) and `complete` (all three, none corrupt).
 */
export function loadSemanticIndex(root) {
  root = path.resolve(root);
  const spine = loadArtifact(root, SPINE_PATH);
  const terms = loadArtifact(root, TERMS_PATH);
  const claims = loadArtifact(root, CLAIMS_PATH);
  const all = [spine, terms, claims];
  return {
    root,
    spine,
    terms,
    claims,
    present: all.some((a) => a.index !== null || a.error !== null),
    complete: all.every((a) => a.index !== null),
    errors: all.map((a) => a.error).filter(Boolean),
  };
}

/**
 * Spine nodes whose LABEL moved under an unchanged id while claims are declared under them (the
 * silent re-parenting of design audit H6). Shared by the gate (blocking finding) and the accept
 * step (`index:semantic` refuses to accept it without an explicit acknowledgment).
 * @returns {Array<{id:string, kind:string, before:string, after:string}>}
 */
export function spineRelabels(storedSpine, freshSpine, freshClaims) {
  const before = storedSpine?.nodes;
  if (!Array.isArray(before)) return [];
  const norm = (label) => String(label ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const byId = new Map(before.map((n) => [n.id, n]));
  const referenced = new Set((freshClaims?.claims ?? []).flatMap((c) => (Array.isArray(c.spineRefs) ? c.spineRefs : [])));
  const out = [];
  for (const node of freshSpine?.nodes ?? []) {
    const old = byId.get(node.id);
    if (!old || norm(old.label) === norm(node.label) || !referenced.has(node.id)) continue;
    out.push({ id: node.id, kind: node.kind, before: old.label, after: node.label });
  }
  return out;
}

/**
 * FRESHNESS — is the STORED index byte-equal to a fresh recompute?
 *
 * The revision layer compares stored claims to fresh claims and flags what MOVED. That is a
 * change signal, not a freshness signal: a committed SPINE.json missing an edge the concept map
 * still declares, a TERMS.json with a stale preferred label, or a CLAIMS.json whose text drifted
 * while its fingerprints did not, all read as "nothing moved" — and the package is a silent strand
 * (coursewerk-caeai G15h: invisible to both the component gate and the claim-level gate). Three
 * byte-compares over objects the gate already holds in hand answer it exactly, with no heuristic
 * and no false positive: `writeSemanticIndex` is deterministic, so a fresh compute serializes to
 * the stored bytes if and only if the stored index describes the package as it stands.
 *
 * Absence is an answer, not staleness (a partial index is reported by `loadSemanticIndex`); a
 * CORRUPT artifact is `loadSemanticIndex`'s error, not this function's — both are excluded here so
 * one fault is never reported twice under two names.
 *
 * @param {string} root package root
 * @param {{spine:object, terms:object, claims:object}} fresh a `computeSemanticIndex` result
 * @returns {{checked:boolean, fresh:boolean, stale:Array<{path:string, storedBytes:number, freshBytes:number}>}}
 */
export function auditIndexFreshness(root, fresh) {
  root = path.resolve(root);
  const byPath = { [CLAIMS_PATH]: fresh.claims, [SPINE_PATH]: fresh.spine, [TERMS_PATH]: fresh.terms };
  const stale = [];
  const missing = [];
  let checked = false;
  for (const rel of SEMANTIC_INDEX_PATHS) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) { missing.push(rel); continue; }
    let storedBytes;
    try { storedBytes = fs.readFileSync(file, "utf8"); } catch { continue; }
    try { JSON.parse(storedBytes); } catch { continue; } // corrupt: loadSemanticIndex owns that report
    checked = true;
    // Line endings are a checkout setting, not a package change (audit finding 16b).
    const normalized = storedBytes.replace(/\r\n/g, "\n");
    const freshBytes = serialize(byPath[rel]);
    if (normalized !== freshBytes) stale.push({ path: rel, storedBytes: storedBytes.length, freshBytes: freshBytes.length });
  }
  // A PARTIAL index is stale, not absent: with one artifact present the layer runs, and a deleted
  // TERMS.json silently re-mints every id from labels (audit finding 1). Absence is an answer only
  // when the whole index is absent.
  if (checked) for (const rel of missing) stale.push({ path: rel, storedBytes: null, freshBytes: serialize(byPath[rel]).length });
  return { checked, fresh: stale.length === 0, stale };
}

/**
 * Write the three artifacts — the ACCEPT step.
 *
 * Serializes ONLY the artifacts, never the envelope: `root`/`conceptMaps`/`warnings` are this
 * module's, and all three schemas are `additionalProperties: false`.
 *
 * @param {string} root package root
 * @param {{spine:object, terms:object, claims:object}} index a `computeSemanticIndex` result
 * @returns {string[]} the files written, in `SEMANTIC_INDEX_PATHS` order
 */
export function writeSemanticIndex(root, index) {
  root = path.resolve(root);
  const byPath = { [CLAIMS_PATH]: index.claims, [SPINE_PATH]: index.spine, [TERMS_PATH]: index.terms };
  const written = [];
  for (const rel of SEMANTIC_INDEX_PATHS) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, serialize(byPath[rel]));
    written.push(file);
  }
  return written;
}
