import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const SYSTEM_INDEX_PATH = "system/COURSEWERK_INDEX.json";
const EXCLUDED_DIRS = new Set([".git", "node_modules", "package", "personal", "inputs", "preview", "reports", "dist", "examples", ".coursewerk"]);
const EXCLUDED_FILES = new Set([SYSTEM_INDEX_PATH, ".DS_Store", "package-lock.json"]);
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const norm = (value) => String(value).replaceAll("\\", "/").replace(/^\.\//, "");

function walk(root, current = root) {
  const out = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) out.push(...walk(root, full));
    else if (entry.isFile()) {
      const rel = norm(path.relative(root, full));
      if (!EXCLUDED_FILES.has(rel) && !rel.startsWith("system/revisions/")) out.push({ full, rel });
    }
  }
  return out;
}

function componentType(rel, policy) {
  for (const classifier of policy.classifiers || []) {
    if ((classifier.paths || []).includes(rel)) return classifier.type;
    if ((classifier.prefixes || []).some((prefix) => rel.startsWith(prefix))) return classifier.type;
  }
  return "repository-support";
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function validateRegistryPaths(root, claims, relationships) {
  const failures = [];
  const exists = (rel) => fs.existsSync(path.join(root, rel));
  const claimIds = new Set();
  for (const claim of claims) {
    if (!/^claim\.[a-z0-9.-]+$/.test(claim.id || "") || !claim.statement || !claim.assuranceLevel) failures.push("claim entries require a claim.* id, statement, and assuranceLevel");
    if (claimIds.has(claim.id)) failures.push(`duplicate claim id: ${claim.id}`);
    claimIds.add(claim.id);
    if (!["hard-gate", "automated-check", "agent-workflow", "human-decision", "external-capability"].includes(claim.assuranceLevel)) failures.push(`${claim.id}: invalid assuranceLevel`);
    const evidence = [...(claim.implementation || []), ...(claim.tests || []), ...(claim.documentation || [])];
    for (const rel of evidence) if (!exists(rel)) failures.push(`${claim.id}: evidence path does not exist: ${rel}`);
    if (["hard-gate", "automated-check"].includes(claim.assuranceLevel) && !(claim.implementation || []).length)
      failures.push(`${claim.id}: ${claim.assuranceLevel} requires implementation evidence`);
    if (["hard-gate", "automated-check"].includes(claim.assuranceLevel) && !(claim.tests || []).length)
      failures.push(`${claim.id}: ${claim.assuranceLevel} requires test evidence`);
  }
  const edges = new Set();
  for (const edge of relationships) {
    const edgeId = `${edge.from}\0${edge.to}\0${edge.impact}`;
    if (edges.has(edgeId)) failures.push(`duplicate relationship: ${edge.from} -> ${edge.to}`);
    edges.add(edgeId);
    if (!exists(edge.from)) failures.push(`relationship source does not exist: ${edge.from}`);
    if (!exists(edge.to)) failures.push(`relationship target does not exist: ${edge.to}`);
    if (!edge.reason || typeof edge.reason !== "string") failures.push(`relationship requires a reason: ${edge.from} -> ${edge.to}`);
    if (!["forward", "reverse", "both"].includes(edge.impact)) failures.push(`relationship has invalid impact: ${edge.from} -> ${edge.to}`);
  }
  return failures;
}

function validateGovernanceRegistries({ claimsRegistry, relationsRegistry, findingsRegistry, componentPolicy, qualityProfiles }) {
  const failures = [];
  for (const [name, registry] of [["CLAIMS", claimsRegistry], ["RELATIONSHIPS", relationsRegistry], ["KNOWN_FINDINGS", findingsRegistry], ["COMPONENTS", componentPolicy], ["QUALITY_PROFILES", qualityProfiles]]) {
    if (registry?.schemaVersion !== 1) failures.push(`system/${name}.json requires schemaVersion 1`);
  }
  if (!Array.isArray(claimsRegistry?.claims)) failures.push("system/CLAIMS.json requires a claims array");
  if (!Array.isArray(relationsRegistry?.relationships)) failures.push("system/RELATIONSHIPS.json requires a relationships array");
  if (!Array.isArray(findingsRegistry?.findings)) failures.push("system/KNOWN_FINDINGS.json requires a findings array");
  if (!Array.isArray(componentPolicy?.classifiers) || !componentPolicy.classifiers.length) failures.push("system/COMPONENTS.json requires classifiers");
  for (const profile of ["personal-private", "restricted-teaching", "public-oer"]) {
    if (!Array.isArray(qualityProfiles?.profiles?.[profile]?.hard)) failures.push(`system/QUALITY_PROFILES.json requires ${profile}.hard`);
  }
  const findingIds = new Set();
  for (const finding of findingsRegistry?.findings || []) {
    if (!finding.id || !finding.severity || !finding.status || !finding.summary) failures.push("finding entries require id, severity, status, and summary");
    if (findingIds.has(finding.id)) failures.push(`duplicate finding id: ${finding.id}`);
    findingIds.add(finding.id);
    if (!["open", "resolved", "accepted-risk"].includes(finding.status)) failures.push(`${finding.id}: invalid finding status`);
    if (finding.status === "resolved" && !finding.resolution) failures.push(`${finding.id}: resolved finding requires a resolution`);
    if (["P0", "P1"].includes(finding.severity) && finding.status === "open") failures.push(`${finding.id}: unresolved ${finding.severity} finding blocks system integrity`);
  }
  return failures;
}

export function computeCoursewerkIndex(root) {
  root = path.resolve(root);
  const claimsFile = path.join(root, "system", "CLAIMS.json");
  const relationsFile = path.join(root, "system", "RELATIONSHIPS.json");
  const findingsFile = path.join(root, "system", "KNOWN_FINDINGS.json");
  const componentsFile = path.join(root, "system", "COMPONENTS.json");
  const qualityFile = path.join(root, "system", "QUALITY_PROFILES.json");
  const claimsRegistry = readJson(claimsFile);
  const relationsRegistry = readJson(relationsFile);
  const findingsRegistry = readJson(findingsFile);
  const claims = claimsRegistry.claims || [];
  const relationships = relationsRegistry.relationships || [];
  const findings = findingsRegistry.findings || [];
  const componentPolicy = readJson(componentsFile);
  const qualityProfiles = readJson(qualityFile);
  const components = walk(root).map(({ full, rel }) => ({
    id: `repo:${rel}`,
    path: rel,
    type: componentType(rel, componentPolicy),
    hash: hash(fs.readFileSync(full)),
  })).sort((a, b) => a.path.localeCompare(b.path));
  const paths = new Set(components.map((c) => c.path));
  const failures = [
    ...validateGovernanceRegistries({ claimsRegistry, relationsRegistry, findingsRegistry, componentPolicy, qualityProfiles }),
    ...validateRegistryPaths(root, claims, relationships),
  ];
  for (const edge of relationships) {
    if (!paths.has(edge.from)) failures.push(`relationship source is excluded from index: ${edge.from}`);
    if (!paths.has(edge.to)) failures.push(`relationship target is excluded from index: ${edge.to}`);
  }
  return {
    schemaVersion: 1,
    components,
    relationships: relationships.slice().sort((a, b) => `${a.from}\0${a.to}`.localeCompare(`${b.from}\0${b.to}`)),
    claims: claims.slice().sort((a, b) => a.id.localeCompare(b.id)),
    knownFindings: findings.slice().sort((a, b) => a.id.localeCompare(b.id)),
    componentPolicy,
    qualityProfiles,
    validationFailures: [...new Set(failures)].sort(),
  };
}

export function writeCoursewerkIndex(root, index = computeCoursewerkIndex(root)) {
  const file = path.join(path.resolve(root), SYSTEM_INDEX_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(index, null, 2) + "\n");
  return file;
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function indexFromGit(root, ref) {
  const text = git(root, ["show", `${ref}:${SYSTEM_INDEX_PATH}`]);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function edgeDirections(edge) {
  if (edge.impact === "forward") return [[edge.from, edge.to]];
  if (edge.impact === "reverse") return [[edge.to, edge.from]];
  return [[edge.from, edge.to], [edge.to, edge.from]];
}

export function computeCoursewerkImpact(root, { baseRef = "main" } = {}) {
  root = path.resolve(root);
  const head = git(root, ["rev-parse", "HEAD"]);
  const baseTip = git(root, ["rev-parse", baseRef]);
  const mergeBase = git(root, ["merge-base", "HEAD", baseRef]) || head;
  const baseIndex = mergeBase ? indexFromGit(root, mergeBase) : null;
  const current = computeCoursewerkIndex(root);
  const before = new Map((baseIndex?.components || []).map((c) => [c.path, c]));
  const after = new Map(current.components.map((c) => [c.path, c]));
  const changed = new Set();
  for (const [p, c] of after) if (!before.has(p) || before.get(p).hash !== c.hash) changed.add(p);
  for (const p of before.keys()) if (!after.has(p)) changed.add(p);
  if (!baseIndex) for (const p of after.keys()) changed.add(p);
  const allEdges = [...(baseIndex?.relationships || []), ...current.relationships];
  const required = new Set(changed);
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of allEdges) for (const [from, to] of edgeDirections(edge)) {
      if (required.has(from) && !required.has(to)) { required.add(to); grew = true; }
    }
  }
  const impactedClaims = current.claims.filter((claim) =>
    [...(claim.implementation || []), ...(claim.tests || []), ...(claim.documentation || [])].some((p) => required.has(p))
  );
  const requiredTests = [...new Set(impactedClaims.flatMap((c) => c.tests || []))].sort();
  const signature = {
    baseRef,
    baseTip,
    mergeBase,
    components: current.components.map((c) => [c.path, c.hash]),
    relationships: current.relationships,
    claims: current.claims,
  };
  return {
    schemaVersion: 1,
    planId: hash(JSON.stringify(signature)),
    baseRef,
    baseTip,
    mergeBase,
    head,
    branchBehindTarget: Boolean(baseTip && mergeBase && baseTip !== mergeBase),
    changed: [...changed].sort(),
    requiredReview: [...required].sort(),
    impactedClaims: impactedClaims.map((c) => c.id).sort(),
    requiredTests,
    validationFailures: current.validationFailures,
    reviewed: [],
    testResults: [],
    attestation: "",
    index: current,
  };
}

export function verifyCoursewerkIndex(root) {
  root = path.resolve(root);
  const expected = computeCoursewerkIndex(root);
  const file = path.join(root, SYSTEM_INDEX_PATH);
  if (!fs.existsSync(file)) return { failures: [`${SYSTEM_INDEX_PATH} is missing`], expected };
  let actual;
  try { actual = readJson(file); } catch (e) { return { failures: [`${SYSTEM_INDEX_PATH} is invalid: ${e.message}`], expected }; }
  const failures = [...expected.validationFailures];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${SYSTEM_INDEX_PATH} is stale or was not generated canonically`);
  return { failures: [...new Set(failures)], expected, actual };
}

function validateRevisionRecord(record, filename) {
  const failures = [];
  const stem = path.basename(filename, ".json");
  if (record?.schemaVersion !== 1) failures.push(`${filename}: requires schemaVersion 1`);
  if (!/^[a-f0-9]{64}$/.test(record?.planId || "") || record.planId !== stem) failures.push(`${filename}: filename must match its planId`);
  if (!record?.baseRef || !(record.baseCommit === null || typeof record.baseCommit === "string")) failures.push(`${filename}: baseRef and baseCommit are required`);
  for (const field of ["requiredReview", "reviewed", "testResults"]) if (!Array.isArray(record?.[field])) failures.push(`${filename}: ${field} must be an array`);
  if (typeof record?.attestation !== "string" || record.attestation.trim().length < 30) failures.push(`${filename}: substantive attestation is required`);
  if (!/^[a-f0-9]{64}$/.test(record?.generatedIndexHash || "")) failures.push(`${filename}: generatedIndexHash must be a SHA-256 digest`);
  if (Number.isNaN(Date.parse(record?.acceptedAt || ""))) failures.push(`${filename}: acceptedAt must be an ISO date-time`);
  return failures;
}

function validateRevisionLedger(root, baseRef) {
  const failures = [];
  const directory = path.join(root, "system", "revisions");
  if (fs.existsSync(directory)) for (const name of fs.readdirSync(directory).filter((item) => item.endsWith(".json"))) {
    const rel = `system/revisions/${name}`;
    try { failures.push(...validateRevisionRecord(readJson(path.join(directory, name)), rel)); }
    catch (error) { failures.push(`${rel}: invalid JSON: ${error.message}`); }
  }
  const mergeBase = git(root, ["merge-base", "HEAD", baseRef]);
  if (mergeBase) {
    const changes = git(root, ["diff", "--name-status", mergeBase, "--", "system/revisions"]);
    for (const line of (changes || "").split("\n").filter(Boolean)) {
      const [status, ...names] = line.split("\t");
      if (!status.startsWith("A")) failures.push(`accepted revision records are append-only: ${status} ${names.join(" -> ")}`);
    }
  }
  return failures;
}

export function verifyCoursewerkRevision(root, { baseRef = "main", requireReview = false } = {}) {
  const indexResult = verifyCoursewerkIndex(root);
  const failures = [...indexResult.failures, ...validateRevisionLedger(path.resolve(root), baseRef)];
  const impact = computeCoursewerkImpact(root, { baseRef });
  if (requireReview && impact.changed.length) {
    if (impact.branchBehindTarget) failures.push(`branch is behind ${baseRef}; update it before accepting the review`);
    const recordFile = path.join(path.resolve(root), "system", "revisions", `${impact.planId}.json`);
    if (!fs.existsSync(recordFile)) failures.push(`accepted Coursewerk revision record is missing for plan ${impact.planId}`);
    else {
      try {
        const record = JSON.parse(fs.readFileSync(recordFile, "utf8"));
        failures.push(...validateCoursewerkReview(root, record, { baseRef }).failures.map((failure) => `accepted revision: ${failure}`));
        const expectedIndexHash = hash(JSON.stringify(indexResult.expected, null, 2) + "\n");
        if (record.generatedIndexHash !== expectedIndexHash) failures.push("accepted revision generatedIndexHash does not match the canonical Coursewerk index");
      } catch (e) { failures.push(`accepted Coursewerk revision record is invalid: ${e.message}`); }
    }
  }
  return { failures: [...new Set(failures)], impact, index: indexResult };
}

export function validateCoursewerkReview(root, review, { baseRef = "main" } = {}) {
  const current = computeCoursewerkImpact(root, { baseRef });
  const failures = [];
  if (!review || review.planId !== current.planId) failures.push("Coursewerk impact review is stale");
  if (current.branchBehindTarget) failures.push(`branch is behind ${baseRef}; update it before accepting the review`);
  const reviewed = new Set(review?.reviewed || []);
  for (const item of current.requiredReview) if (!reviewed.has(item)) failures.push(`review did not cover ${item}`);
  const passed = new Set((review?.testResults || []).filter((r) => r.status === "passed").map((r) => r.path));
  for (const test of current.requiredTests) if (!passed.has(test)) failures.push(`required test lacks a passed result: ${test}`);
  if (typeof review?.attestation !== "string" || review.attestation.trim().length < 30) failures.push("review requires a substantive attestation");
  return { failures, current };
}
