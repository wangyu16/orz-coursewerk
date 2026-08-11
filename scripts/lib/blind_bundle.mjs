// Blind-bundle assembler — the deterministic half of the CONFIDENCE independent critique.
//
// The paper's central CONFIDENCE claim is that the key-fact critique's power is INDEPENDENCE
// (information isolation), NOT model diversity: a fresh reviewer BLIND to how the result was
// produced, judging only the RESULT against the CRITERIA. `key_fact_review.mjs` already GATES on
// a review artifact that *declares* independence, but nothing in the harness ASSEMBLES the blind
// surface the reviewer actually sees. This module does — and does it by an explicit ALLOWLIST so
// the blindness is a PROVABLE property, not a promise: every file in the package is either
// projected into the bundle by a named rule or recorded in `excluded` with the reason it was
// withheld. Nothing is silently dropped and no raw file leaks.
//
// "Blind to how it was produced" is concrete here: the generation log (PROVENANCE), any PRIOR
// reviewer's verdicts (KEY_FACT_REVIEW), and the authoring accountability / AI-assistance
// narrative (FOUNDATION.outputAuthors) are the process context a truly independent reviewer must
// not see — seeing them would anchor the fresh judgement to the process it is meant to check.
// The exclusion test scans the whole serialized bundle for planted process sentinels and proves
// none survive.
//
// This is the deterministic, offline, unit-testable artifact. The LIVE independence-gradient
// study (no critique · same-context · Light blind subagent · Full different-engine) that measures
// marginal defects caught per independence step is S-CONF-crit under G10 — it CONSUMES this
// bundle; it is not this module.
import fs from "node:fs";
import path from "node:path";
import { REQUIRED_KEY_FACT_CHECKS } from "./key_fact_review.mjs";

// The five student-facing deliverable trees — the RESULT the blind reviewer evaluates.
const DELIVERABLE_TOPS = new Set(["concepts", "study-guide", "slides", "assessment-support", "practice"]);

// Metadata files that are FACTUAL inputs a fact/rights reviewer needs to judge the criteria.
// (Read as-is; source-of-truth for the licence/attribution/media/source-identity checks.)
const LICENSE_FILE = "LICENSE";
const ATTRIBUTION_FILE = "metadata/ATTRIBUTION.md";
const SOURCE_RECORD_FILE = "metadata/SOURCE_RECORD.json";
const MEDIA_PLAN_META = "metadata/MEDIA_PLAN.json";
const FOUNDATION_FILE = "metadata/FOUNDATION.json";

// Process-context files — the blind reviewer must NOT see how the result was produced.
const PROCESS_FILES = new Map([
  ["metadata/PROVENANCE.json", "generation log — how the package was produced"],
  ["metadata/KEY_FACT_REVIEW.json", "a prior reviewer's verdicts — would anchor the fresh, independent judgement"],
]);
// Directory prefixes whose whole contents are process/tooling receipts.
const PROCESS_DIR_PREFIXES = [
  ["metadata/evidence/", "rights-evidence capture receipts — tooling/process artifacts"],
  ["metadata/preflight/", "pre-ingestion receipts — tooling/process artifacts"],
];

function walk(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function readText(root, rel) {
  const file = path.join(root, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

function readJson(root, rel) {
  const text = readText(root, rel);
  if (text == null) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// Project a declared source down to the identity + rights FACTS a reviewer verifies — and NOTHING
// else. The raw FOUNDATION.sources[].rightsBasis carries evidence-capture tooling, operator names,
// timestamps and receipt paths (process/tooling); those are dropped by projecting field-by-field.
function projectSource(source) {
  const rb = source?.rightsBasis || {};
  return {
    id: source?.id ?? null,
    title: source?.title ?? null,
    version: source?.version ?? source?.revision ?? null,
    publisher: source?.publisher ?? null,
    canonicalUrl: source?.canonicalUrl ?? null,
    role: source?.role ?? null,
    use: source?.use ?? null,
    scope: Array.isArray(source?.scope) ? source.scope : [],
    rights: { type: rb.type ?? null, license: rb.license ?? null },
  };
}

/**
 * Assemble the exact bundle a BLIND independent key-fact reviewer sees for `root`.
 *
 * Allowlist by construction: the returned bundle carries the RESULT (deliverables) + the CRITERIA
 * (REQUIRED_KEY_FACT_CHECKS) + the FACTUAL verification inputs (projected sources, licence,
 * attribution, media plan, source record). Every other file in the package is enumerated into
 * `excluded` with a reason and a class — `process` (withheld for blindness) or `out-of-scope`
 * (not part of the key-fact review surface). The bundle contains no authoring transcript, no
 * generation log, no prior review verdict, and no authoring-accountability / AI-assistance text.
 */
export function assembleBlindBundle(root) {
  root = path.resolve(root);
  const deliverables = [];
  const excluded = [];
  const foundation = readJson(root, FOUNDATION_FILE);

  // Every file gets classified — result, allowlisted-input, or excluded (with reason+class).
  const inputRels = new Set([LICENSE_FILE, ATTRIBUTION_FILE, SOURCE_RECORD_FILE, MEDIA_PLAN_META, FOUNDATION_FILE]);
  for (const abs of walk(root)) {
    const relPath = path.relative(root, abs).replaceAll(path.sep, "/");
    const top = relPath.split("/")[0];
    if (top !== "metadata" && DELIVERABLE_TOPS.has(top) && relPath.endsWith(".md")) {
      deliverables.push({ path: relPath, text: fs.readFileSync(abs, "utf8") });
      continue;
    }
    if (inputRels.has(relPath)) continue; // projected below via a named rule
    if (PROCESS_FILES.has(relPath)) { excluded.push({ path: relPath, class: "process", reason: PROCESS_FILES.get(relPath) }); continue; }
    const dirHit = PROCESS_DIR_PREFIXES.find(([prefix]) => relPath.startsWith(prefix));
    if (dirHit) { excluded.push({ path: relPath, class: "process", reason: dirHit[1] }); continue; }
    excluded.push({ path: relPath, class: "out-of-scope", reason: "not part of the blind key-fact review surface" });
  }
  deliverables.sort((a, b) => a.path.localeCompare(b.path));
  excluded.sort((a, b) => a.path.localeCompare(b.path));

  // FOUNDATION is projected: sources kept (identity + rights facts); outputAuthors WITHHELD.
  if (foundation && Array.isArray(foundation.outputAuthors) && foundation.outputAuthors.length > 0)
    excluded.push({ path: `${FOUNDATION_FILE}#outputAuthors`, class: "process", reason: "authoring accountability & AI-assistance disclosure — reveals how the result was produced" });

  return {
    deliverables,
    criteria: [...REQUIRED_KEY_FACT_CHECKS],
    sources: (foundation?.sources || []).map(projectSource),
    license: readText(root, LICENSE_FILE),
    attribution: readText(root, ATTRIBUTION_FILE),
    mediaPlan: readJson(root, MEDIA_PLAN_META),
    sourceRecord: readJson(root, SOURCE_RECORD_FILE),
    excluded,
  };
}
