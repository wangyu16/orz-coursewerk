import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { REQUIRED_KEY_FACT_CHECKS } from "./key_fact_checks.mjs";
import { blindBundleDigest } from "./blind_bundle.mjs";
import { normalizeMarkdownForHash } from "./coherence.mjs";
import { manifestUnits } from "./core/package_reader.mjs";

export const KEY_FACT_REVIEW_PATH = "private/coursewerk/KEY_FACT_REVIEW.json";
export { REQUIRED_KEY_FACT_CHECKS };
const DELIVERABLE_TOPS = new Set(["concepts", "study-guide", "slides", "assessment-support", "practice"]);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

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

function fileDigest(root, rel) {
  const file = path.join(root, rel);
  return fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null;
}

export function makeKeyFactBindings(root) {
  root = path.resolve(root);
  const deliverables = walk(root)
    .map((file) => path.relative(root, file).replaceAll(path.sep, "/"))
    .filter((rel) => rel.endsWith(".md") && DELIVERABLE_TOPS.has(rel.split("/")[0]))
    .sort()
    // H8: bound to whitespace-normalized text, so a reflow does not force a re-review; any visible
    // change still does (the same rule the component index uses).
    .map((rel) => [rel, sha256(normalizeMarkdownForHash(fs.readFileSync(path.join(root, rel), "utf8")))]);
  return {
    manifestSha256: fileDigest(root, "alembic.json"),
    licenseSha256: fileDigest(root, "LICENSE"),
    foundationSha256: fileDigest(root, "private/coursewerk/FOUNDATION.json"),
    provenanceSha256: fileDigest(root, "private/coursewerk/PROVENANCE.json"),
    attributionSha256: fileDigest(root, "provenance/coursewerk/ATTRIBUTION.md"),
    sourceRecordSha256: fileDigest(root, "private/coursewerk/SOURCE_RECORD.json"),
    deliverableTreeSha256: sha256(JSON.stringify(deliverables)),
  };
}

export function auditKeyFactReview(root, foundation) {
  root = path.resolve(root);
  const file = path.join(root, KEY_FACT_REVIEW_PATH);
  const failures = [];
  if (!fs.existsSync(file)) return { ready: false, failures: [`${KEY_FACT_REVIEW_PATH} is required for public release.`], review: null };
  let review;
  try { review = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { return { ready: false, failures: [`${KEY_FACT_REVIEW_PATH} is invalid JSON: ${error.message}`], review: null }; }
  if (review.schemaVersion !== 1) failures.push(`${KEY_FACT_REVIEW_PATH}: schemaVersion must be 1.`);
  if (!["light", "full"].includes(review.mode)) failures.push(`${KEY_FACT_REVIEW_PATH}: mode must be light or full.`);
  if (review.mode === "light" && review.reviewKind !== "same-model-independent-pass")
    failures.push(`${KEY_FACT_REVIEW_PATH}: Light mode requires reviewKind same-model-independent-pass.`);
  if (review.mode === "full" && review.reviewKind !== "cross-model")
    failures.push(`${KEY_FACT_REVIEW_PATH}: Full mode requires reviewKind cross-model.`);
  if (review.independence?.separatePass !== true || String(review.independence?.approach || "").trim().length < 30)
    failures.push(`${KEY_FACT_REVIEW_PATH}: declare a genuine separate review pass and its substantive independence approach.`);
  if (review.mode === "light" && review.independence?.contextReset !== true)
    failures.push(`${KEY_FACT_REVIEW_PATH}: Light mode requires contextReset=true for the same-model independent pass.`);
  if (!String(review.authoringSystem || "").trim() || !String(review.authoringModelId || "").trim() ||
      !String(review.reviewer?.name || "").trim() || review.reviewer?.type !== "ai" || !String(review.reviewer?.modelId || "").trim())
    failures.push(`${KEY_FACT_REVIEW_PATH}: authoring system/model ID and an identified AI reviewer/model ID are required.`);
  const authoringModelId = String(review.authoringModelId || "").trim().toLowerCase();
  const reviewerModelId = String(review.reviewer?.modelId || "").trim().toLowerCase();
  if (review.mode === "light" && authoringModelId !== reviewerModelId)
    failures.push(`${KEY_FACT_REVIEW_PATH}: Light mode must use the same model ID for the context-reset review.`);
  if (review.mode === "full" && (authoringModelId === reviewerModelId || String(review.authoringSystem).trim().toLowerCase() === String(review.reviewer?.name).trim().toLowerCase()))
    failures.push(`${KEY_FACT_REVIEW_PATH}: Full mode reviewer/model must differ from the authoring system/model.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(review.reviewedAt || ""))) failures.push(`${KEY_FACT_REVIEW_PATH}: reviewedAt must be YYYY-MM-DD.`);
  if (JSON.stringify(review.bindings || {}) !== JSON.stringify(makeKeyFactBindings(root)))
    failures.push(`${KEY_FACT_REVIEW_PATH}: bindings are stale; repeat the key-fact critique after the latest source, provenance, or deliverable change.`);
  // INDEPENDENCE IS ASSEMBLED, NOT DECLARED. `separatePass`/`contextReset` are the reviewer's word
  // about itself; the gate cannot verify a word. What it CAN verify is that the review names the
  // digest of the one surface a blind reviewer is given — the bundle `review:blind-bundle` assembles
  // by allowlist, with every process file withheld — and that this digest is the CURRENT package's.
  // A review that cannot name it either never saw the bundle or saw a different package.
  // Not a `bindings` entry: each binding tracks ONE record; the bundle is a composite of several
  // (deliverables, license, attribution, source record, projected sources) and is compared live.
  const declaredBundle = String(review.independence?.bundleSha256 || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(declaredBundle))
    failures.push(`${KEY_FACT_REVIEW_PATH}: independence.bundleSha256 must record the digest of the blind bundle the reviewer judged (run \`npm run review:blind-bundle\`).`);
  else if (declaredBundle !== blindBundleDigest(root))
    failures.push(`${KEY_FACT_REVIEW_PATH}: independence.bundleSha256 does not match the current blind bundle — the reviewer judged a different result; re-assemble the bundle and repeat the critique.`);
  // H5 (design audit 2026-09-05): the template's own placeholders passed the gate — only note LENGTH
  // was checked. A review is evidence of a critique only if every identity and every note is real.
  const PLACEHOLDER = /\b(?:replace(?:-with)?|generated-by|copy-from|placeholder|temporary|pending|unassigned|tbd|todo|unknown)\b/i;
  const identityFields = [
    ["authoringSystem", review.authoringSystem], ["authoringModelId", review.authoringModelId],
    ["reviewer.name", review.reviewer?.name], ["reviewer.modelId", review.reviewer?.modelId],
    ["independence.approach", review.independence?.approach],
  ];
  for (const [name, value] of identityFields)
    if (PLACEHOLDER.test(String(value || ""))) failures.push(`${KEY_FACT_REVIEW_PATH}: ${name} still carries a template placeholder.`);
  // Notes are prose: only the template's own tokens count as placeholders there (a genuine note may
  // say "no placeholder identity is present").
  const TEMPLATE_TOKEN = /REPLACE-WITH|GENERATED-BY|COPY-FROM|\bTBD\b|\bTODO\b|\bREPLACE\b/;
  for (const check of review.checks || [])
    if (TEMPLATE_TOKEN.test(String(check?.note || ""))) failures.push(`${KEY_FACT_REVIEW_PATH}: check ${check?.id} note still carries a template placeholder.`);
  const notes = (review.checks || []).map((check) => String(check?.note || "").trim().toLowerCase()).filter(Boolean);
  if (new Set(notes).size < notes.length)
    failures.push(`${KEY_FACT_REVIEW_PATH}: two or more checks carry the identical note — boilerplate is not evidence of examining each criterion.`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(review.reviewedAt || "")) && review.reviewedAt > new Date().toISOString().slice(0, 10))
    failures.push(`${KEY_FACT_REVIEW_PATH}: reviewedAt ${review.reviewedAt} is in the future.`);
  const checks = new Map((review.checks || []).map((check) => [check.id, check]));
  for (const id of REQUIRED_KEY_FACT_CHECKS) {
    const check = checks.get(id);
    if (check?.status !== "passed" || String(check?.note || "").trim().length < 20)
      failures.push(`${KEY_FACT_REVIEW_PATH}: required check ${id} needs status passed and a substantive review note.`);
  }
  const declaredSources = new Set((foundation?.sources || []).map((source) => source.id));
  if (!Array.isArray(review.keyFacts) || review.keyFacts.length === 0) failures.push(`${KEY_FACT_REVIEW_PATH}: at least one chapter-level scientific key fact must be reviewed.`);
  for (const [index, fact] of (review.keyFacts || []).entries()) {
    const label = `${KEY_FACT_REVIEW_PATH}: keyFacts[${index}]`;
    if (!String(fact.id || "").trim() || !String(fact.claim || "").trim()) failures.push(`${label} requires id and claim.`);
    if (!["verified", "qualified"].includes(fact.status)) failures.push(`${label} status must be verified or qualified.`);
    if (!Array.isArray(fact.evidenceSourceIds) || fact.evidenceSourceIds.length === 0 || fact.evidenceSourceIds.some((id) => !declaredSources.has(id)))
      failures.push(`${label} must cite one or more declared evidenceSourceIds.`);
    if (!Array.isArray(fact.usedIn) || fact.usedIn.length === 0) failures.push(`${label} must list usedIn deliverables.`);
    for (const rel of fact.usedIn || []) {
      const target = path.resolve(root, String(rel));
      const inside = path.relative(root, target);
      if (inside.startsWith("..") || path.isAbsolute(inside) || !fs.existsSync(target)) failures.push(`${label} usedIn path is missing or outside the package: ${rel}.`);
      else if (!DELIVERABLE_TOPS.has(inside.replaceAll(path.sep, "/").split("/")[0]))
        failures.push(`${label} usedIn must name a deliverable (concepts/, study-guide/, slides/, assessment-support/, practice/), not ${rel} — a fact cannot be supported by the review that asserts it.`);
    }
    if (String(fact.note || "").trim().length < 20) failures.push(`${label} requires a substantive critique note.`);
    if (TEMPLATE_TOKEN.test(String(fact.claim || "")) || TEMPLATE_TOKEN.test(String(fact.note || "")))
      failures.push(`${label} still carries a template placeholder.`);
    // The fact must be ABOUT the deliverables it names: its numbers must appear there, and most of
    // its content words must. A fact nobody could locate in the package is not a reviewed fact.
    const corpus = (fact.usedIn || []).map((relPath) => {
      const target = path.resolve(root, String(relPath));
      try { return fs.readFileSync(target, "utf8").toLowerCase(); } catch { return ""; }
    }).join("\n");
    if (corpus) {
      // Token-level (round-3 verify C1b): "0" inside "10 g" is not the melting point, "3" inside
      // "334" is not 3. A number must stand as a token, with its unit when the fact gives one; a
      // short fact needs EVERY content word, a long one most of them.
      const claim = String(fact.claim || "");
      const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const quantities = [...claim.matchAll(/(-?\d+(?:[.,]\d+)?)(?:\s*([°º˚]?[A-Za-z%µ]{1,6}))?/g)];
      const missingNumbers = quantities.filter(([, n, unit]) => {
        const num = esc(n.replace(",", "."));
        const re = new RegExp(`(?<![\\d.])${num}${unit ? `\\s*${esc(unit.toLowerCase())}` : ""}(?![\\d])`, "i");
        return !re.test(corpus);
      }).map(([, n, unit]) => `${n}${unit ? " " + unit : ""}`);
      const words = (claim.toLowerCase().match(/[\p{L}]{4,}/gu) || []);
      const present = words.filter((w) => new RegExp(`(?<![\\p{L}])${esc(w)}(?![\\p{L}])`, "iu").test(corpus)).length;
      // Fewer than three content words is a label, not a fact; the quantity rule still applies to it.
      const need = words.length < 3 ? 0 : words.length < 6 ? words.length : Math.ceil(words.length * 0.6);
      if (missingNumbers.length || present < need)
        failures.push(`${label} is not supported by its usedIn deliverables (${missingNumbers.length ? `quantities ${missingNumbers.join(", ")} not found as stated` : `${present}/${words.length} content words found`}); trace the fact to prose that states it.`);
      // Round-4 audit (atk5): "…is NOT 0 °C" passed because "not" is not a content word. A negated
      // fact is supported only by a sentence that carries the same negation beside the same token.
      const NEG = /\b(?:not|never|no|cannot|isn't|aren't|doesn't|false)\b/i;
      if (NEG.test(claim) && quantities.length) {
        const sentences = corpus.split(/(?<=[.!?])\s+|\n+/);
        const anchor = quantities[0];
        const tokenRe = new RegExp(`(?<![\\d.])${esc(anchor[1].replace(",", "."))}${anchor[2] ? `\\s*${esc(anchor[2].toLowerCase())}` : ""}(?![\\d])`, "i");
        if (!sentences.some((sentence) => tokenRe.test(sentence) && NEG.test(sentence)))
          failures.push(`${label} asserts a NEGATION ("${claim.slice(0, 80)}") that no sentence in its usedIn deliverables states beside ${anchor[0].trim()}.`);
      }
    }
  }
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(path.join(root, "alembic.json"), "utf8")); } catch { /* private roots may have no manifest */ }
  for (const chapter of manifestUnits(manifest)) {
    const studyGuide = `study-guide/${chapter.slug}.md`;
    if (!(review.keyFacts || []).some((fact) => (fact.usedIn || []).includes(studyGuide)))
      failures.push(`${KEY_FACT_REVIEW_PATH}: chapter ${chapter.slug} requires at least one reviewed key fact traced to ${studyGuide}.`);
  }
  return { ready: failures.length === 0, failures: [...new Set(failures)], review };
}
