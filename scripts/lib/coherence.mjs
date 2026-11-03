// Coursewerk component index + revision coherence kernel.
//
// Every output component is hashed and connected by directed dependency edges.
// A source component points to the components that must remain consistent with
// it. Any edit invalidates the index until the complete impact set is reviewed
// and an attested refresh records the new coherent state.
import { relocate } from "./records/paths.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { outputGitState, commitsTouching } from "./output_git.mjs";
import { matchClaims } from "./claims.mjs";
import { classify } from "./classify.mjs";
import { resolve as resolveTerm } from "./terms.mjs";
import { scanProjection } from "./units.mjs";
import { SEMANTIC_INDEX_PATHS } from "./semantic_index.mjs";
import { REVIEW_QUEUE_PATH } from "./escalation.mjs";
import { manifestUnits } from "./core/package_reader.mjs";

export const COMPONENT_INDEX_PATH = "private/coursewerk/COMPONENT_INDEX.json";
// DERIVED INDEXES ARE NOT COMPONENTS — and this is not tidiness, it is the fix for a reproduced
// bug. A gate that emits an artifact into the package it just accepted makes that package FAIL
// ITS OWN GATE on the next run: the new file is untracked (`Git ??`) and absent from the index
// ("new component is not in the coherence index"), so `criticalTotal > 0` and pack exits 1.
// `COMPONENT_INDEX_PATH` has been excluded for exactly that reason since day one. The semantic
// index (M14) and the escalation queue (M10) are the same category: every one of them is a PURE
// PROJECTION of the components — regenerable from the package alone, asserting nothing of its
// own — so hashing them as components would make the index depend on its own output. Authored
// content belongs in the graph; a projection of that content never does.
// Do not "tidy" an entry out of this list; each one is load-bearing.
const EXCLUDE = new Set([
  COMPONENT_INDEX_PATH,
  ...SEMANTIC_INDEX_PATHS, // metadata/{CLAIMS,SPINE,TERMS}.json — one home for the paths (§5d)
  // M10's queue. The deadline on the literal path recorded here is PAID: the writer landed with the
  // M11 gate (`check_oer.mjs` runs the detectors, calls `buildQueue`, emits and commits the result),
  // M10 now exports the path it owns, and this line imports it. One home (§5d).
  REVIEW_QUEUE_PATH,
  ".gitignore",
  ".DS_Store",
]);
const DELIVERABLE_TOPS = new Set(["concepts", "study-guide", "slides", "assessment-support", "practice"]);
const HASH = (value) => crypto.createHash("sha256").update(value).digest("hex");
const norm = (p) => String(p || "").replaceAll("\\", "/").replace(/^\.\//, "");

export function coherenceStateFile(root) {
  // M12 (round-3 audit): a symlinked parent gave the same package a second ledger path. Real paths.
  try { root = fs.realpathSync(path.resolve(root)); } catch { root = path.resolve(root); }
  return path.join(path.dirname(root), ".coursewerk", `${path.basename(root)}-component-index-state.json`);
}

export function recordAcceptedCoherence(root, index, head, extra = {}) {
  const file = coherenceStateFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let prior = {};
  try { prior = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* genesis */ }
  const state = {
    schemaVersion: 2,
    root: path.resolve(root),
    initializedAt: prior.initializedAt || new Date().toISOString(),
    lastAcceptedAt: new Date().toISOString(),
    acceptedHead: head,
    acceptedIndexSha256: HASH(JSON.stringify(index)),
    ...extra,
  };
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
  return file;
}

function walk(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === ".gitignore" || e.name === ".DS_Store") continue;
    const full = path.join(root, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

function componentType(rel) {
  if (rel === "alembic.json") return "manifest";
  if (rel === "LICENSE") return "license";
  if (rel === "README.md") return "readme";
  if (rel === "private/coursewerk/FOUNDATION.json") return "foundation";
  if (rel === "private/coursewerk/PROVENANCE.json") return "provenance";
  if (rel === "provenance/coursewerk/ATTRIBUTION.md") return "attribution";
  if (rel === "private/coursewerk/SOURCE_RECORD.json") return "source-record";
  if (["private/coursewerk/KEY_FACT_REVIEW.json", "private/coursewerk/VISUAL_REVIEW.json"].includes(rel)) return "review";
  if (rel.startsWith("assets/")) return "asset";
  if (rel.startsWith("private/")) return "private";
  const top = rel.split("/")[0];
  return DELIVERABLE_TOPS.has(top) ? top : "support";
}

function chapterOf(rel, type) {
  if (!DELIVERABLE_TOPS.has(type) || rel === "concepts/course.md") return null;
  return path.posix.basename(rel, path.posix.extname(rel));
}

function edgeKey(e) {
  return `${e.from}\u0000${e.to}\u0000${e.reason}`;
}

function addEdge(edges, byPath, fromPath, toPath, reason) {
  const from = byPath.get(norm(fromPath));
  const to = byPath.get(norm(toPath));
  if (!from || !to || from.id === to.id) return;
  const edge = { from: from.id, to: to.id, reason };
  edges.set(edgeKey(edge), edge);
}

function assetReferences(text) {
  const out = new Set();
  const re = /(?:\.\.\/|\.\/)?assets\/([^\s)>'"`]+)/g;
  let m;
  while ((m = re.exec(text))) out.add(`assets/${decodeURIComponent(m[1]).replace(/[.,;:]$/, "")}`);
  return [...out];
}

/** Compute the current component set and dependency graph without writing. */
/**
 * H8 (design audit): the component hash was over raw bytes, so a whitespace reflow — free in the
 * semantic layer by design — re-imposed "1 edit → 6 required reviews" at the file layer. Markdown
 * components hash their WHITESPACE-NORMALIZED text (line endings, runs of blanks, trailing
 * spaces); every visible change still moves the hash. Binaries hash their bytes.
 */
export function normalizeMarkdownForHash(text) {
  return String(text).replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/[ \t]+/g, " ").trimEnd()).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
function componentHash(file) {
  const bytes = fs.readFileSync(file);
  return /\.(?:md|markdown|txt|json)$/i.test(file) ? HASH(normalizeMarkdownForHash(bytes.toString("utf8"))) : HASH(bytes);
}

export function computeComponentGraph(root) {
  root = path.resolve(root);
  const components = walk(root)
    .map((file) => ({ file, path: norm(path.relative(root, file)) }))
    .filter((x) => !EXCLUDE.has(x.path) && !x.path.startsWith(".coursewerk/"))
    .map((x) => {
      const type = componentType(x.path);
      return {
        id: `component:${x.path}`,
        path: x.path,
        type,
        chapter: chapterOf(x.path, type),
        hash: componentHash(x.file),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  const byPath = new Map(components.map((c) => [c.path, c]));
  const edges = new Map();

  // Foundation and manifest decisions can affect every public-facing component.
  for (const c of components) {
    if (c.path !== "private/coursewerk/FOUNDATION.json")
      addEdge(edges, byPath, "private/coursewerk/FOUNDATION.json", c.path, "foundation facts constrain component");
    if (DELIVERABLE_TOPS.has(c.type) || ["readme", "license", "attribution"].includes(c.type))
      addEdge(edges, byPath, "alembic.json", c.path, "manifest identity/scope/license constrains component");
  }
  addEdge(edges, byPath, "private/coursewerk/PROVENANCE.json", "provenance/coursewerk/ATTRIBUTION.md", "human attribution mirrors provenance");
  addEdge(edges, byPath, "alembic.json", "private/coursewerk/KEY_FACT_REVIEW.json", "output-license declaration is rechecked in the key-fact critique");
  addEdge(edges, byPath, "LICENSE", "private/coursewerk/KEY_FACT_REVIEW.json", "canonical output-license text is rechecked in the key-fact critique");
  addEdge(edges, byPath, "private/coursewerk/PROVENANCE.json", "private/coursewerk/KEY_FACT_REVIEW.json", "media provenance is rechecked in the key-fact critique");
  addEdge(edges, byPath, "provenance/coursewerk/ATTRIBUTION.md", "private/coursewerk/KEY_FACT_REVIEW.json", "public attribution obligations are rechecked in the key-fact critique");
  addEdge(edges, byPath, "private/coursewerk/SOURCE_RECORD.json", "private/coursewerk/KEY_FACT_REVIEW.json", "source revisions are rechecked in the key-fact critique");
  const provenanceFile = path.join(root, "private", "coursewerk", "PROVENANCE.json");
  if (fs.existsSync(provenanceFile)) {
    try {
      const provenance = JSON.parse(fs.readFileSync(provenanceFile, "utf8"));
      for (const item of provenance.items || []) for (const used of item.usedIn || [])
        addEdge(edges, byPath, "private/coursewerk/PROVENANCE.json", norm(used), `provenance item ${item.id || "unknown"} constrains incorporating document`);
    } catch { /* assurance kernel reports malformed provenance */ }
  }

  const chapterSlugs = new Set(components.map((c) => c.chapter).filter(Boolean));
  for (const slug of chapterSlugs) {
    addEdge(edges, byPath, "concepts/course.md", `concepts/${slug}.md`, "course logic constrains chapter logic");
    addEdge(edges, byPath, `concepts/${slug}.md`, `study-guide/${slug}.md`, "chapter concepts drive study guide");
    addEdge(edges, byPath, `concepts/${slug}.md`, `assessment-support/${slug}.md`, "chapter objectives drive assessment");
    addEdge(edges, byPath, `study-guide/${slug}.md`, `slides/${slug}.md`, "slides derive from study guide");
    addEdge(edges, byPath, `study-guide/${slug}.md`, `assessment-support/${slug}.md`, "terminology/examples constrain assessment");
    addEdge(edges, byPath, `study-guide/${slug}.md`, `practice/${slug}.md`, "practice must remain consistent with teaching content");
    addEdge(edges, byPath, `assessment-support/${slug}.md`, `practice/${slug}.md`, "practice instantiates assessment design");
  }

  for (const component of components.filter((item) => DELIVERABLE_TOPS.has(item.type))) {
    addEdge(edges, byPath, "private/coursewerk/SOURCE_RECORD.json", component.path, "revision-bound sources constrain teaching content");
    addEdge(edges, byPath, component.path, "private/coursewerk/KEY_FACT_REVIEW.json", "teaching content must be rechecked in the key-fact critique");
  }
  for (const component of components.filter((item) => ["study-guide", "practice", "slides"].includes(item.type)))
    addEdge(edges, byPath, component.path, "private/coursewerk/VISUAL_REVIEW.json", "carrier source must be visually re-reviewed after change");
  for (const component of components.filter((item) => item.type === "asset"))
    addEdge(edges, byPath, component.path, "private/coursewerk/VISUAL_REVIEW.json", "visual asset must be re-reviewed after change");

  // Asset edges are derived from actual references, including reuse across chapters.
  for (const c of components.filter((x) => x.path.endsWith(".md"))) {
    const text = fs.readFileSync(path.join(root, c.path), "utf8");
    for (const asset of assetReferences(text)) addEdge(edges, byPath, asset, c.path, "component embeds/references asset");
  }

  return { root, components, relationships: [...edges.values()].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b))) };
}

export function makeComponentIndex(graph) {
  const byId = new Map(graph.components.map((c) => [c.id, c]));
  const dependencies = new Map(graph.components.map((c) => [c.id, {}]));
  for (const e of graph.relationships) {
    const source = byId.get(e.from);
    if (source && dependencies.has(e.to)) dependencies.get(e.to)[e.from] = source.hash;
  }
  return {
    schemaVersion: 1,
    // No clock: the index is a pure projection of the components (L3, design audit) — a
    // timestamp made two identical states hash differently and leaked into `planId`.
    components: graph.components.map((c) => ({ ...c, dependencies: dependencies.get(c.id) || {} })),
    relationships: graph.relationships,
  };
}

// an index written before the records layout names records at metadata/…: read at their place now (records/paths.mjs
// relocate; the file itself is never rewritten, so its accepted hash still holds)
const relocId = (id) => (typeof id === "string" && id.startsWith("component:") ? `component:${relocate(id.slice(10))}` : id);
function relocatedIndex(index) {
  if (!index || typeof index !== "object") return index;
  return {
    ...index,
    components: (index.components || []).map((c) => ({ ...c, id: relocId(c.id), path: relocate(c.path), ...(c.dependencies ? { dependencies: Object.fromEntries(Object.entries(c.dependencies).map(([k, v]) => [relocId(k), v])) } : {}) })),
    relationships: (index.relationships || []).map((e) => ({ ...e, ...(e.from ? { from: relocId(e.from) } : {}), ...(e.to ? { to: relocId(e.to) } : {}) })),
  };
}
export function loadComponentIndex(root) {
  const file = path.join(path.resolve(root), COMPONENT_INDEX_PATH);
  if (!fs.existsSync(file)) return { file, index: null, error: "private/coursewerk/COMPONENT_INDEX.json is missing; initialize the component index." };
  try {
    return { file, index: relocatedIndex(JSON.parse(fs.readFileSync(file, "utf8"))), error: null };
  } catch (e) {
    return { file, index: null, error: `private/coursewerk/COMPONENT_INDEX.json is invalid JSON: ${e.message}` };
  }
}

function graphMaps(indexOrGraph) {
  return {
    components: new Map((indexOrGraph?.components || []).map((c) => [c.id, c])),
    paths: new Map((indexOrGraph?.components || []).map((c) => [c.path, c])),
    relationships: new Map((indexOrGraph?.relationships || []).map((e) => [edgeKey(e), e])),
  };
}

function structuralCoherenceFailures(root, graph) {
  const failures = [];
  const manifestFile = path.join(path.resolve(root), "alembic.json");
  if (!fs.existsSync(manifestFile)) return failures;
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")); }
  catch { return failures; } // manifest QA owns JSON diagnostics
  const chapters = manifestUnits(manifest);
  const declared = new Set(chapters.map((c) => c.slug));
  const paths = new Set(graph.components.map((c) => c.path));
  if (chapters.length && !paths.has("concepts/course.md")) failures.push("concepts/course.md: course-wide coherence backbone is missing.");
  const required = ["concepts", "study-guide", "slides", "assessment-support", "practice"];
  for (const ch of chapters) {
    for (const top of required) {
      const need = `${top}/${ch.slug}.md`;
      if (!paths.has(need)) failures.push(`${need}: declared chapter is missing this coherence component.`);
    }
  }
  for (const c of graph.components) {
    if (c.chapter && DELIVERABLE_TOPS.has(c.type) && !declared.has(c.chapter))
      failures.push(`${c.path}: chapter component is not declared in alembic.json.`);
  }
  return failures;
}

/** Audit whether any component, dependency snapshot, or relationship has changed. */
export function auditCoherence(root) {
  const git = outputGitState(root);
  const loaded = loadComponentIndex(root);
  if (!loaded.index) {
    const failures = [loaded.error];
    if (!git.available) failures.push(git.error ? `output Git is unavailable: ${git.error}` : "output root is not a Git repository; initialize output Git.");
    return { hardFailures: failures, changed: [], staleDependents: [], relationshipChanges: [], index: null, git };
  }
  const graph = computeComponentGraph(root);
  const old = graphMaps(loaded.index);
  const cur = graphMaps(graph);
  const failures = [];
  const changed = [];
  const stale = [];
  const relationshipChanges = [];
  if (!git.available) failures.push(git.error ? `output Git is unavailable: ${git.error}` : "output root is not a Git repository; Git history is required for revisions.");
  else {
    if (!git.head) failures.push("output Git repository has no baseline commit.");
    for (const change of git.changes) failures.push(`Git ${change.status.trim() || "changed"}: ${change.path}.`);
  }
  const stateFile = coherenceStateFile(root);
  let acceptedState = null;
  try { acceptedState = JSON.parse(fs.readFileSync(stateFile, "utf8")); }
  catch { failures.push(`accepted coherence ledger is missing or invalid: ${stateFile}.`); }
  // M8 (design audit): deleting the index and the external ledger and running `--initialize` again
  // cleared every coherence failure on an unreviewed edit — the attested chain was laundered. The
  // package's own git history remembers: an `initialize` ledger whose head is NOT the oldest commit
  // touching the index means the chain was reset over existing history.
  if (acceptedState?.action === "initialize" && acceptedState?.acceptedHead) {
    const history = commitsTouching(root, COMPONENT_INDEX_PATH);
    const at = history.indexOf(acceptedState.acceptedHead);
    if (at >= 0 && at < history.length - 1)
      failures.push(`coherence index was RE-INITIALIZED over ${history.length - 1 - at} earlier index commit(s): the attested review chain was reset, not refreshed. Restore the ledger under .coursewerk/ or accept the revision through review (index_components --refresh --review).`);
  }
  if (acceptedState) {
    const actualIndexHash = HASH(JSON.stringify(loaded.index));
    if (acceptedState.schemaVersion !== 2) failures.push("accepted coherence ledger schema is stale.");
    if (acceptedState.acceptedIndexSha256 !== actualIndexHash) failures.push("COMPONENT_INDEX.json does not match the externally accepted index hash.");
  }
  failures.push(...structuralCoherenceFailures(root, graph));

  // Indexes accepted before 2026-09-05 hold RAW-BYTE hashes (H8 moved markdown to normalized-text
  // hashes). A component whose bytes did not change still matches its legacy hash, so an upgrade
  // never reads as "every component changed"; the next refresh writes the normalized hashes.
  const legacyCache = new Map();
  const legacyHash = (relPath) => {
    if (!legacyCache.has(relPath)) {
      try { legacyCache.set(relPath, HASH(fs.readFileSync(path.join(root, relPath)))); } catch { legacyCache.set(relPath, null); }
    }
    return legacyCache.get(relPath);
  };
  const same = (storedHash, component) => storedHash === component.hash || storedHash === legacyHash(component.path);
  for (const [id, c] of cur.components) {
    const prior = old.components.get(id);
    if (!prior) {
      changed.push(id);
      failures.push(`${c.path}: new component is not in the coherence index.`);
    } else if (!same(prior.hash, c)) {
      changed.push(id);
      failures.push(`${c.path}: content changed after the last coherence review.`);
    }
  }
  for (const [id, c] of old.components) {
    if (!cur.components.has(id)) {
      changed.push(id);
      failures.push(`${c.path}: indexed component was removed without a coherence review.`);
    }
  }
  for (const [key, e] of cur.relationships) {
    if (!old.relationships.has(key)) {
      relationshipChanges.push(key);
      failures.push(`new dependency relationship requires review: ${e.from} -> ${e.to} (${e.reason}).`);
    }
    const dependent = old.components.get(e.to);
    const source = cur.components.get(e.from);
    if (dependent && source && !same(dependent.dependencies?.[e.from], source)) {
      stale.push(e.to);
      failures.push(`${dependent.path}: stale against changed dependency ${source.path}.`);
    }
  }
  for (const [key, e] of old.relationships) {
    if (!cur.relationships.has(key)) {
      relationshipChanges.push(key);
      failures.push(`removed dependency relationship requires review: ${e.from} -> ${e.to} (${e.reason}).`);
    }
  }
  return {
    hardFailures: [...new Set(failures)],
    changed: [...new Set(changed)].sort(),
    staleDependents: [...new Set(stale)].sort(),
    relationshipChanges: [...new Set(relationshipChanges)].sort(),
    index: loaded.index,
    graph,
    git,
    acceptedState,
  };
}

function traverse(seeds, relationships, direction) {
  const out = new Set(seeds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of relationships) {
      const from = direction === "down" ? e.from : e.to;
      const to = direction === "down" ? e.to : e.from;
      if (out.has(from) && !out.has(to)) { out.add(to); grew = true; }
    }
  }
  return out;
}

/** Build the exact review set for all edits since the last accepted index. */
export function computeRevisionImpact(root) {
  const audit = auditCoherence(root);
  if (!audit.index) return { error: audit.hardFailures[0], planId: null, changed: [], requiredReview: [], reviewContext: [] };
  const current = audit.graph;
  const oldRelationships = audit.index.relationships || [];
  const union = new Map([...oldRelationships, ...current.relationships].map((e) => [edgeKey(e), e]));
  const changed = new Set(audit.changed);
  for (const key of audit.relationshipChanges) {
    const e = union.get(key);
    if (e) { changed.add(e.from); changed.add(e.to); }
  }
  const required = traverse(changed, [...union.values()], "down");
  const context = traverse(required, [...union.values()], "up");
  for (const id of required) context.delete(id);
  const currentById = new Map(current.components.map((c) => [c.id, c]));
  const oldById = new Map((audit.index.components || []).map((c) => [c.id, c]));
  const describe = (id) => {
    const c = currentById.get(id) || oldById.get(id);
    return { id, path: c?.path || id, type: c?.type || "removed", chapter: c?.chapter || null };
  };
  const signature = {
    components: current.components.map((c) => [c.id, c.hash]),
    relationships: current.relationships.map(edgeKey),
    priorGeneratedAt: audit.index.generatedAt,
    gitHead: audit.git?.head || null,
    gitChanges: audit.git?.changes || [],
  };
  return {
    schemaVersion: 1,
    planId: HASH(JSON.stringify(signature)),
    generatedAt: new Date().toISOString(),
    changed: [...changed].sort().map(describe),
    requiredReview: [...required].sort().map(describe),
    reviewContext: [...context].sort().map(describe),
    reasons: audit.hardFailures,
    git: audit.git,
    reviewed: [],
    attestation: "",
  };
}

export function writeComponentIndex(root, index) {
  const file = path.join(path.resolve(root), COMPONENT_INDEX_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(index, null, 2) + "\n");
  return file;
}

export function validateRevisionReview(root, review) {
  const current = computeRevisionImpact(root);
  const failures = [];
  if (!review || review.planId !== current.planId) failures.push("revision review is stale; regenerate it after the final edits.");
  const reviewed = new Set(Array.isArray(review?.reviewed) ? review.reviewed : []);
  for (const c of current.requiredReview || []) if (!reviewed.has(c.id)) failures.push(`revision review did not cover ${c.path}.`);
  if (typeof review?.attestation !== "string" || review.attestation.trim().length < 20)
    failures.push("revision review requires a substantive consistency attestation (at least 20 characters).");
  return { failures, current };
}

// =================================================================================================
// M5 — CLAIM-LEVEL COHERENCE. A layer BESIDE the component-level graph above, never a replacement.
// =================================================================================================
//
// Everything above this line reasons about FILES: one component per file, one byte-hash per
// component, and an edge between files. It stays exactly as it was — it is live, its consumers
// depend on it, and spec §2.4's backward-compatibility rule is that `COMPONENT_INDEX.json` does not
// move. What follows reasons about CLAIMS, and the two never touch.
//
// WHY A SECOND LAYER RATHER THAN A BETTER FIRST ONE
// -------------------------------------------------
// `computeRevisionImpact` answers "which FILES must a human re-review?" — and it answers it by
// traversing every edge out of every byte-changed file. That is correct and it is also the defect
// (spec §0): one edit, six required reviews, because a file is not a unit of meaning. Fixing it in
// place would mean teaching the component graph about claims, which is how you end up with one
// module that is authoritative about two different things and quietly wrong about both.
//
// WHAT THE FOUR OUTPUTS ARE FOR
// -----------------------------
//   affected   — the reachability set. **M9 takes this as INPUT and must never compute it**
//                (`planPropagation`'s `change.claimIds`). Reachability derived in two places is
//                §5d, whose own worked example — the unit table — shipped a live under-reporting
//                bug before anyone noticed, because a blind spot looks exactly like a clean bill
//                of health. Reachability is minted here, once.
//   actions    — M4's verb per affected claim. This module CALLS `classify`; it does not own a
//                second opinion about what a moved layer obliges.
//   silentRisk — THE REASON THIS MODULE EXISTS (see below).
//   cycles     — reported, never broken.
//
// `silentRisk` — THE WHOLE-PACKAGE-AWARENESS CLAIM (S-C) IN ONE FIELD
// -------------------------------------------------------------------
// A claim that a change REACHES but whose fingerprints DID NOT MOVE is invisible to every other
// detector in this system, by construction:
//   * M3 hashes it and sees five identical layers.
//   * M4 is handed those layers and correctly returns NONE. It is not wrong; it is asked a
//     per-claim question and the per-claim answer genuinely is "nothing happened here".
//   * M9 plans nothing, because M4 obliged nothing.
// The package therefore reports NO FLAG — an assurance it has not earned. The golden fixture is
// the case in one line: the study guide says the melting point of water is 100 °C; the practice
// answer key says "**Answer:** 100 °C". Change the study guide to 0 °C and the answer key's own
// text does not move one byte. Every check passes. The package now contradicts itself, in prose a
// student will read, and the index's silence is the only thing standing where a flag should be.
//
// That is what this field is: the claims about which the correct per-claim answer is "nothing
// happened" and the correct whole-package answer is "look at this". Getting `affected` right and
// leaving `silentRisk` empty would make this module decorative — a restatement of facts M3 and M4
// already hold.
//
// HOW `affected` IS BOUNDED, AND WHY THE BOUND IS THE DESIGN
// ----------------------------------------------------------
// An impact set that contains everything is the byte-hash bug wearing a claim-shaped hat: an
// instructor buried in flags stops reading flags. So reachability is built from exactly two
// relations, with deliberately different powers:
//
//   1. DERIVATION (`derivedFrom`) — DIRECTED and FULLY TRANSITIVE, downstream only.
//      `Y.derivedFrom` naming X is an AUTHORED assertion that Y depends on X, so it composes: if
//      Z depends on Y and Y depends on X, a change to X reaches Z. Downstream ONLY — a change to
//      X does not reach what X was derived FROM. Its sources did not move.
//
//   2. CO-MENTION (a shared `spineRef` / a shared term id) — ONE HOP FROM A SEED, NON-COMPOSING.
//      This is the bound that matters, so here is the argument. Co-mention is not a dependency; it
//      is evidence of one. Two claims sharing a term are talking about the same thing, which is
//      why the relation earns its place at all — it is how the answer key above is reached, since
//      nothing in the package DECLARES that it depends on the study guide. But it does not
//      compose: "shares a term with something that shares a term with the change" is a random walk
//      through the vocabulary, and two hops of it reaches the whole package. So a co-mention edge
//      may carry you INTO the set, and derivation composes onward from there, but co-mention is
//      never chained to another co-mention. Stated as one rule:
//
//          affected = derivation_closure( seeds ∪ comention_one_hop(seeds) )
//
//      What keeps this honest at scale is M1: term ids come only from the instructor's authored
//      `## Key terms` section, so co-mention runs over a small CONTROLLED VOCABULARY, not over
//      words. "water" links nothing unless the instructor registered it.
//
// Co-mention is further gated by WHICH LAYER MOVED, because a relation without a reason is noise:
//   * a shared TERM matters when the seed's `label` or `content` moved (the vocabulary or the
//     meaning attached to it changed);
//   * a shared SPINE matters when the seed's `spine` or `content` moved (the pedagogy the claim
//     hangs under, or what it asserts under it, changed).
//
// The TERM gate is further narrowed for a VALUE CHANGE, and this is the FINDING 4 fix. When the
// `content` move is a change to a QUANTITY — the seed states a value (M2's unit recognizer fires on
// its text) and no rename accompanies it — a co-mentioning claim can only be silently contradicted
// if it ALSO states a value. "State the melting point of water at standard pressure" names the term
// but asserts no number; it is exactly as true at 0 °C as at 100 °C, so a value edit strands it in
// no way an instructor must see. Flagging it is a precision cost, not a detection. So a value
// change reaches, by term, only the term-sharers that THEMSELVES carry a quantity (the answer key
// that restates "100 °C" — the very claim `silentRisk` exists to catch — is kept). The authority on
// "is this a value" is M-shared units (`scanProjection`), reused rather than re-invented, so this
// gate cannot drift from what M2 will mint as a quantity. Two guards keep it conservative:
//   * it NEVER applies when `label` also moved — a rename touches the term everywhere it appears,
//     value-bearing or not, so a rename still reaches the objective (see `real-term-rename`);
//   * it NEVER applies when the seed states no quantity — a non-numeric meaning change ("boils" ->
//     "freezes") could strand any sharer, and we cannot cheaply tell which, so reach stays full.
// A `provenance`-only move reaches nothing by co-mention: re-citing one claim does not make
// another claim's prose wrong, and M4 already returns RECHECK + an ESCALATE follow-up for it.
//
// WHAT IS DELIBERATELY NOT REACHABLE — the refusals ARE the module
//   * A FORMAT-ONLY move seeds NOTHING. This is the product's #1 requirement stated as code: a
//     whitespace edit moves no fingerprint at all, and a meaning-preserving rephrase moves only
//     `format`, which M4 calls NONE and M9 plans nothing for. If a rephrase seeded reachability,
//     every cosmetic edit would flag its neighbours and we would have rebuilt the byte-hash bug at
//     a finer granularity — which would be worse than not having built this at all, because it
//     would carry the index's authority.
//   * CO-MENTION IS NOT CHAINED (above).
//   * DERIVATION IS NOT WALKED UPSTREAM (above).
//   * A DANGLING `derivedFrom` (naming an id in neither version) yields NO edge. There is nothing
//     to reach; inventing a node for it would be a fabrication. It is also unreportable through
//     this signature — see CONTRACT HISTORY D (assigned to the M11 gate, §5b).
//
// SCOPE — READ, NEVER RE-DERIVED (§4a, §5d)
// -----------------------------------------
// Term refs are canonicalized through M1's `resolve`, which is scope-aware, so this module needs a
// claim's scope — and takes it from `claim.scope`, tested with `"scope" in claim`. NEVER
// `claim.scope ?? derive(...)`: `null` is a MEANINGFUL value (package-wide), so `??` would
// silently re-derive for exactly the claims most likely to span chapters, which is the worst
// possible set to re-open the divergence on. This module does not contain a derivation to fall
// back to, on purpose — half-copying the authoritative one is the drift §4a closed.
//
// PURE and DETERMINISTIC (§6.1): no network, no LLM, no clock, no randomness — and, as it happens,
// no I/O at all (`root` is vestigial — CONTRACT HISTORY A). Every set-shaped output is sorted, and nodes are
// visited in sorted id order, so a flag a human acted on is reproducible from git months later.
// That is not a nicety; an irreproducible flag is not auditable, and an unauditable flag is a
// rumour.

/** The five fingerprint layers (interfaces §5). */
const FP_LAYERS = ["format", "label", "content", "spine", "provenance"];

/**
 * The one layer whose movement obliges NOTHING (M4's `format`-only row -> NONE).
 * A seed that moved only this reaches nothing at all — see the header's first refusal.
 */
const INERT_LAYER = "format";

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byClaimId = (a, b) => cmp(a.claimId, b.claimId);

/**
 * The decision context for ONE claim, assembled for M4 (§3's optional `ctx`).
 *
 * **`authorized` is PER-CLAIM ONLY, and there is deliberately no edit-level default.** M7's
 * authority is `isAuthorizedDivergence(overrides, claimId)` — per claim, because an override is
 * recorded AGAINST a claim. A blanket `ctx.authorized = true` would assert, from one bit, that
 * every claim in an impact set has a recorded override; the ones that did not would silently
 * classify RE-DERIVE instead of ESCALATE, and a suspected error would propagate on the machine's
 * own authority. That is the silent direction, so the shape does not permit it: an edit-level
 * `authorized` THROWS rather than being ignored. Ignoring it would be worse — the caller would
 * believe they had authorized something. (M9 and M10 throw on a contract break for the same
 * reason: a broken caller must not hide behind a plausible-looking review item.)
 *
 * `spineChange` and `pedagogy` DO take an edit-level default, because unlike authorization they are
 * facts about the EDIT ("this spine move was additive enrichment"), not about a claim's standing.
 * Per-claim wins where both are given.
 *
 * Presence-tested, never `??`: `spineChange: null` is a MEANINGFUL value (unknown -> structural,
 * fail toward review), so `??` would silently promote a deliberate null to the edit-level default —
 * §4a's trap in a third costume, on a field that decides whether a package gets rechecked.
 *
 * Absent ctx yields exactly `{authorized:false, spineChange:null, pedagogy:null}` — M4's documented
 * fail-toward-review default, and byte-for-byte the behavior this module had before `ctx` existed.
 */
function ctxForClaim(ctx, claimId) {
  const per = ctx?.byClaimId?.[claimId];
  const own = per && typeof per === "object" ? per : {};
  const edit = ctx && typeof ctx === "object" ? ctx : {};
  return {
    authorized: own.authorized === true,
    spineChange: "spineChange" in own ? own.spineChange : "spineChange" in edit ? edit.spineChange : null,
    pedagogy: "pedagogy" in own ? own.pedagogy : "pedagogy" in edit ? edit.pedagogy : null,
  };
}

/** Reject an edit-level `authorized` loudly — see `ctxForClaim` for why it must not exist. */
function assertCtxShape(ctx) {
  if (ctx && typeof ctx === "object" && "authorized" in ctx) {
    throw new TypeError(
      "claimImpact: `ctx.authorized` is not a valid edit-level field — authorization is PER CLAIM " +
        "(M7 records an override against a claimId). Pass ctx.byClaimId[<claimId>].authorized instead. " +
        "A blanket authorization would assert, from one bit, that every reached claim has a recorded " +
        "override, silently downgrading the unauthorized ones from ESCALATE to RE-DERIVE.",
    );
  }
}

/** Accept CLAIMS (`{claims:[…]}`) or a bare array — the shape M6 and M9 already tolerate. */
function claimNodes(claims) {
  const list = Array.isArray(claims) ? claims : Array.isArray(claims?.claims) ? claims.claims : [];
  return list.filter((c) => c && typeof c === "object" && typeof c.id === "string" && c.id);
}

/**
 * Does this claim's prose STATE a quantity (a number bound to a unit)? The recognizer is M2's own
 * (`scanProjection`, M-shared units) — the FINDING 4 term gate must agree with what M2 mints as a
 * quantity claim, so it borrows the same authority rather than a second copy that could drift. A
 * fresh matcher per call: `quantityRe()` returns one because `lastIndex` is shared state.
 */
const { quantityRe } = scanProjection();
function statesQuantity(text) {
  return quantityRe().test(String(text ?? ""));
}

/** Sorted, de-duplicated, stringified refs. */
function refSet(list) {
  return [...new Set((Array.isArray(list) ? list : []).map((v) => String(v ?? "")).filter(Boolean))].sort(cmp);
}

/**
 * Which fingerprint layers differ between two versions of one claim.
 * A side that is absent entirely (an added or removed claim) differs on every layer — the same
 * reading M4 takes ("a layer absent from BOTH sides has not moved; absent-on-one-side has").
 */
function movedLayers(oldClaim, newClaim) {
  const a = oldClaim?.fingerprints;
  const b = newClaim?.fingerprints;
  return FP_LAYERS.filter((layer) => a?.[layer] !== b?.[layer]);
}

/**
 * The claim's scope (§4a). READ from the field; presence-tested because `null` is an ANSWER
 * (package-wide), not an absence.
 *
 * A claim WITHOUT the field is malformed by `claims.schema.json` (scope is required, M2 always
 * sets it). We resolve its terms UNSCOPED rather than reconstructing the derivation: this module
 * deliberately holds no copy of §4a's tiers, because a copy that drifts is the exact divergence
 * §4a exists to close. `undefined` is M1's documented "any scope".
 */
function scopeArg(claim) {
  if (claim && typeof claim === "object" && "scope" in claim) return claim.scope ?? undefined;
  return undefined;
}

/**
 * A claim's term refs as canonical M1 ids.
 *
 * Already-known ids pass through; a ref written as a LABEL is resolved through M1 in the claim's
 * own scope, so aliases collapse onto one node and a chapter-local homograph does not link two
 * chapters that never shared a term. An unresolvable ref is kept under a namespaced key rather
 * than dropped: two claims citing the same unknown label really do share a vocabulary item, we
 * simply cannot name it, and dropping it would silently sever a real edge. The `?|` prefix cannot
 * collide with a real `term.*` id.
 */
function termIdsOf(claim, terms, knownIds) {
  const scope = scopeArg(claim);
  const out = new Set();
  for (const ref of refSet(claim?.termRefs)) {
    if (knownIds.has(ref)) {
      out.add(ref);
      continue;
    }
    const id = resolveTerm(terms, ref, scope);
    out.add(id || `?|${ref}`);
  }
  return [...out].sort(cmp);
}

/**
 * Merge the two versions of a package's claims into one node set, keyed by claim id.
 *
 * Identity comes from M2's `matchClaims` (§4) — this module does not own a second opinion about
 * what "the same claim" means. A matched pair is ONE node carrying both versions; an unmatched new
 * claim is an addition (`old: null`); an unmatched old claim is a removal (`new: null`), and it
 * stays a node so that whatever depended on it can still be reached.
 */
function mergeVersions(oldList, newList) {
  const oldById = new Map(oldList.map((c) => [c.id, c]));
  const newById = new Map(newList.map((c) => [c.id, c]));
  const { matched } = matchClaims(oldList, newList);

  const nodes = new Map();
  const pairedOld = new Set();
  const pairedNew = new Set();
  for (const { oldId, newId } of [...matched].sort((a, b) => cmp(a.newId, b.newId) || cmp(a.oldId, b.oldId))) {
    pairedOld.add(oldId);
    pairedNew.add(newId);
    nodes.set(newId, { id: newId, old: oldById.get(oldId) ?? null, new: newById.get(newId) ?? null });
  }
  for (const c of [...newList].sort((a, b) => cmp(a.id, b.id))) {
    if (pairedNew.has(c.id) || nodes.has(c.id)) continue;
    nodes.set(c.id, { id: c.id, old: null, new: c });
  }
  for (const c of [...oldList].sort((a, b) => cmp(a.id, b.id))) {
    if (pairedOld.has(c.id)) continue;
    const existing = nodes.get(c.id);
    // An old id colliding with an unrelated node is the degenerate case `matchClaims` already
    // refused to resolve (two indistinguishable claims). Fill the empty side if there is one;
    // never overwrite. Deterministic, and it invents no pairing.
    if (existing) {
      if (!existing.old) existing.old = c;
      continue;
    }
    nodes.set(c.id, { id: c.id, old: c, new: null });
  }
  return nodes;
}

/**
 * The claim record a node's REFS are read from, unioned across versions.
 *
 * Both versions, deliberately: a change can REMOVE a term or a spineRef, and the claims that
 * shared the dropped ref are exactly the ones a human should look at. Reading only the new version
 * would make a deletion reach nothing — silence on the edit most likely to strand a dependent.
 */
function refsOf(node, terms, knownIds) {
  const versions = [node.old, node.new].filter(Boolean);
  const termIds = new Set();
  const spineRefs = new Set();
  for (const claim of versions) {
    for (const id of termIdsOf(claim, terms, knownIds)) termIds.add(id);
    for (const ref of refSet(claim.spineRefs)) spineRefs.add(ref);
  }
  return { termIds: [...termIds].sort(cmp), spineRefs: [...spineRefs].sort(cmp) };
}

/**
 * Directed derivation edges, `from -> to`, meaning "to was derived from from".
 *
 * Read from the CURRENT version where the claim still exists (the package as it now stands is what
 * a human will fix), else from the removed version. A ref naming an id in neither version yields
 * no edge — there is nothing to reach, and minting a node for it would be a fabrication.
 */
function derivationEdges(nodes) {
  const out = new Map([...nodes.keys()].map((id) => [id, new Set()]));
  for (const id of [...nodes.keys()].sort(cmp)) {
    const node = nodes.get(id);
    const record = node.new ?? node.old;
    for (const from of refSet(record?.derivedFrom)) {
      if (!nodes.has(from)) continue; // dangling — see CONTRACT HISTORY D
      out.get(from).add(id);
    }
  }
  return new Map([...out].map(([k, v]) => [k, [...v].sort(cmp)]));
}

/**
 * Strongly connected components of the derivation graph with more than one member, plus
 * self-derivations. Tarjan's algorithm, nodes visited in sorted id order so the result is stable.
 *
 * SCCs rather than an enumeration of every elementary cycle: enumerating them is exponential in
 * the worst case, and an SCC is the honest answer to "which claims are tangled together" — it
 * names every claim involved without claiming to know which of the many loops through them the
 * author meant.
 *
 * **Nothing here removes an edge.** A cycle is REPORTED and the traversal keeps its `visited` set,
 * which is what makes it terminate. Breaking a cycle by dropping an edge would be picking, on the
 * machine's own authority, which of two authored dependencies is the fake one — a guess in a
 * deterministic costume, and the loser would silently stop propagating.
 */
function findCycles(nodes, edges) {
  const ids = [...nodes.keys()].sort(cmp);
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const sccs = [];
  let counter = 0;

  // Iterative: a deep derivation chain must not blow the JS stack on a real package.
  for (const root of ids) {
    if (index.has(root)) continue;
    const work = [{ id: root, at: 0 }];
    while (work.length) {
      const frame = work[work.length - 1];
      const { id } = frame;
      if (frame.at === 0) {
        index.set(id, counter);
        low.set(id, counter);
        counter += 1;
        stack.push(id);
        onStack.add(id);
      }
      const next = edges.get(id) ?? [];
      if (frame.at < next.length) {
        const child = next[frame.at];
        frame.at += 1;
        if (!index.has(child)) work.push({ id: child, at: 0 });
        else if (onStack.has(child)) low.set(id, Math.min(low.get(id), index.get(child)));
        continue;
      }
      if (low.get(id) === index.get(id)) {
        const group = [];
        for (;;) {
          const w = stack.pop();
          onStack.delete(w);
          group.push(w);
          if (w === id) break;
        }
        const selfLoop = group.length === 1 && (edges.get(id) ?? []).includes(id);
        if (group.length > 1 || selfLoop) sccs.push(group.sort(cmp));
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.id, Math.min(low.get(parent.id), low.get(id)));
    }
  }

  return sccs
    .map((claimIds) => {
      const inside = new Set(claimIds);
      const cycleEdges = [];
      for (const from of claimIds) for (const to of edges.get(from) ?? []) if (inside.has(to)) cycleEdges.push({ from, to });
      return { claimIds, edges: cycleEdges.sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to)) };
    })
    .sort((a, b) => cmp(a.claimIds.join("|"), b.claimIds.join("|")));
}

/**
 * Everything one seed reaches: itself, its one-hop co-mentions, and the derivation closure of all
 * of those. See the header for why the two relations have different powers.
 *
 * @returns {Map<string, Set<string>>} reached id -> the relation kinds that reached it
 */
/**
 * G22c: the ids of matched, slug-anchored claims whose RELATIVE rank among co-present anchored
 * siblings (same file, same section) changed between old and new. Rank is taken over the
 * positional anchor's ordinal on each side, restricted to slugs present on BOTH sides, so an
 * insert or delete elsewhere in the list moves nobody's relative rank.
 */
function reorderedAnchoredSiblings(nodes) {
  const groups = new Map(); // file|section -> [{id, slug, before, after}]
  for (const [id, n] of nodes) {
    if (!n.old || !n.new) continue;
    const slug = n.new.anchorSlug;
    if (!slug || n.old.anchorSlug !== slug) continue;
    const locOld = n.old.locations?.[0], locNew = n.new.locations?.[0];
    if (!locOld || !locNew || locOld.file !== locNew.file) continue;
    const sec = (a) => String(a ?? "").split("#")[0];
    const ord = (a) => Number(String(a ?? "").split("#")[1]) || 0;
    if (sec(locOld.anchor) !== sec(locNew.anchor)) continue;
    const key = `${locNew.file}|${sec(locNew.anchor)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id, before: ord(locOld.anchor), after: ord(locNew.anchor) });
  }
  const out = new Set();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const rankBefore = new Map([...members].sort((a, b) => a.before - b.before).map((m, i) => [m.id, i]));
    const rankAfter = new Map([...members].sort((a, b) => a.after - b.after).map((m, i) => [m.id, i]));
    for (const m of members) if (rankBefore.get(m.id) !== rankAfter.get(m.id)) out.add(m.id);
  }
  return out;
}

function reachFrom(seedId, nodes, edges, refIndex, refsByNode, moved, quantityByNode) {
  const reached = new Map([[seedId, new Set(["seed"])]]);
  const note = (id, kind) => {
    if (id === seedId) return; // the seed is reached by being the seed
    if (!reached.has(id)) reached.set(id, new Set());
    reached.get(id).add(kind);
  };

  // --- CO-MENTION: one hop, gated by which layer moved ---------------------------------------
  const byTerm = moved.includes("label") || moved.includes("content");
  const bySpine = moved.includes("spine") || moved.includes("content");
  const refs = refsByNode.get(seedId);
  // FINDING 4: a VALUE change (content moved, no rename, and the seed itself states a quantity)
  // reaches by term only the sharers that ALSO state a value — a claim that merely names the term
  // is as true after the edit as before. Both conjuncts keep it conservative; see the header.
  const valueChange = moved.includes("content") && !moved.includes("label") && quantityByNode.get(seedId);
  if (byTerm)
    for (const t of refs.termIds)
      for (const id of refIndex.term.get(t) ?? []) {
        if (valueChange && !quantityByNode.get(id)) continue; // value edit cannot strand a valueless sharer
        note(id, "shared-term");
      }
  if (bySpine) for (const s of refs.spineRefs) for (const id of refIndex.spine.get(s) ?? []) note(id, "shared-spine");

  // --- DERIVATION: transitive, downstream, from everything reached so far ----------------------
  // The `visited` semantics of `reached` is what makes a cycle terminate WITHOUT removing an edge.
  const queue = [...reached.keys()].sort(cmp);
  while (queue.length) {
    const at = queue.shift();
    for (const to of edges.get(at) ?? []) {
      const seen = reached.has(to);
      note(to, "derivation");
      if (!seen && to !== seedId) queue.push(to);
    }
  }
  return reached;
}

/**
 * The claim-level impact of an edit: what it reaches, what that obliges, and — the reason this
 * function exists — what it reaches SILENTLY.
 *
 * PURE and DETERMINISTIC (§6.1): no network, no LLM, no clock, no randomness, and no I/O. Same
 * inputs -> byte-identical output, so a flag a human acted on is reproducible from git months
 * later. Every set-shaped output is sorted.
 *
 * Read the section header above before changing anything here: the bounds on `affected` are the
 * design, not an optimization, and `silentRisk` is the only output no other module could recompute.
 *
 * @param {string} root The package root. **VESTIGIAL** — this layer needs no I/O and never did.
 *   Accepted, never read; see CONTRACT HISTORY A. Do not "use it since it's there".
 * @param {{claims:Array<object>}|Array<object>} oldClaims CLAIMS before the edit (M2).
 * @param {{claims:Array<object>}|Array<object>} newClaims CLAIMS after the edit (M2).
 * @param {object} terms TERMS (M1) — the only authority on what a label means in a scope.
 * @param {object} [ctx] OPTIONAL decision context, threaded to M4 (§3, added after this module
 *   showed §10 decision 2's ask-once rule was unreachable from this seam). Shape:
 *   `{byClaimId: {<claimId>: {authorized?, spineChange?, pedagogy?}}, spineChange?, pedagogy?}`.
 *   `authorized` is PER-CLAIM ONLY — an edit-level `ctx.authorized` THROWS (see `ctxForClaim`).
 *   Omitted, every claim classifies under M4's fail-toward-review default, which is byte-for-byte
 *   this module's behavior before `ctx` existed: safe stays the default, and no caller breaks.
 *   M5 does NOT read OVERRIDES itself — M7 owns `authorized` and the caller passes it down;
 *   deriving authorization here would be §5d.
 * @returns {{affected:string[],
 *            actions:Array<{claimId:string, action:string, layer:(string|null), reason:string,
 *                           followUp?:{action:string, reason:string}}>,
 *            silentRisk:Array<{claimId:string, reachedFrom:string[], via:string[], reason:string}>,
 *            cycles:Array<{claimIds:string[], edges:Array<{from:string,to:string}>}>}}
 *   `affected` is the reachability set M9 takes as input. `actions` is M4's verb per affected
 *   claim, under `ctx` (or M4's fail-toward-review defaults when it is absent). `silentRisk` is the
 *   subset of `affected` whose fingerprints did not move — reached, and invisible to everything
 *   else. `cycles` are the derivation graph's tangles, reported and never broken.
 */
export function claimImpact(root, oldClaims, newClaims, terms, ctx) {
  assertCtxShape(ctx);
  const oldList = claimNodes(oldClaims);
  const newList = claimNodes(newClaims);
  const nodes = mergeVersions(oldList, newList);
  const knownIds = new Set((terms?.terms ?? []).map((t) => t?.id).filter(Boolean));

  const refsByNode = new Map([...nodes].map(([id, node]) => [id, refsOf(node, terms, knownIds)]));
  const refIndex = { term: new Map(), spine: new Map() };
  for (const id of [...nodes.keys()].sort(cmp)) {
    const { termIds, spineRefs } = refsByNode.get(id);
    for (const t of termIds) refIndex.term.set(t, [...(refIndex.term.get(t) ?? []), id]);
    for (const s of spineRefs) refIndex.spine.set(s, [...(refIndex.spine.get(s) ?? []), id]);
  }

  const edges = derivationEdges(nodes);
  const movedByNode = new Map([...nodes].map(([id, n]) => [id, movedLayers(n.old, n.new)]));
  // Does a claim STATE a quantity? Read from its text via M-shared units (the same recognizer M2
  // mints quantity claims with — reused so this gate cannot drift from what counts as a value).
  // Unioned across versions: a value the edit ADDED or REMOVED still makes the claim value-bearing
  // for the hop that matters. Used by the FINDING 4 term gate in `reachFrom`.
  const quantityByNode = new Map(
    [...nodes].map(([id, n]) => [id, [n.old, n.new].filter(Boolean).some((c) => statesQuantity(c.text))]),
  );

  // --- SEEDS ---------------------------------------------------------------------------------
  // A claim whose ONLY moved layer is `format` is a rephrase: M4 calls it NONE and it seeds
  // nothing. That single line is the product's #1 requirement — a cosmetic edit costs zero — and
  // dropping it would rebuild the byte-hash bug at claim granularity, carrying this index's
  // authority while doing it.
  // G22c — a REORDER among slug-anchored siblings. Nothing in a reordered claim moves (same
  // text, same refs), so no fingerprint layer can see it; but ordering is prerequisite structure
  // (spec §5's spine row: reorder -> RECHECK). The signal is the RELATIVE rank among CO-PRESENT
  // matched slugs in one file section — insert/delete invariant, so adding an objective at the
  // top rechecks nothing that kept its order. Reordered claims become seeds with a synthetic
  // `spine` move, and their verdict is RECHECK regardless of what M4 says about the fingerprints.
  const reordered = reorderedAnchoredSiblings(nodes);
  for (const id of reordered) movedByNode.set(id, [...new Set([...movedByNode.get(id), "spine"])]);

  const seeds = [...nodes.keys()]
    .filter((id) => movedByNode.get(id).some((layer) => layer !== INERT_LAYER))
    .sort(cmp);

  // --- REACHABILITY --------------------------------------------------------------------------
  const reachedBy = new Map(); // id -> {from:Set<seedId>, via:Set<kind>}
  for (const seedId of seeds) {
    for (const [id, kinds] of reachFrom(seedId, nodes, edges, refIndex, refsByNode, movedByNode.get(seedId), quantityByNode)) {
      if (!reachedBy.has(id)) reachedBy.set(id, { from: new Set(), via: new Set() });
      const entry = reachedBy.get(id);
      if (id !== seedId) entry.from.add(seedId);
      for (const kind of kinds) if (kind !== "seed") entry.via.add(kind);
    }
  }
  const affected = [...reachedBy.keys()].sort(cmp);

  // --- ACTIONS -------------------------------------------------------------------------------
  // M4 owns classification. This module calls it and does not hold a second opinion. Context comes
  // from the CALLER (§3's optional `ctx`) — M7 owns `authorized` and passes it down; M5 reading
  // OVERRIDES itself would derive authorization in a second place (§5d). Absent ctx is M4's
  // fail-toward-review default, which is what this module did before `ctx` existed.
  const actions = affected
    .map((id) => {
      const node = nodes.get(id);
      const verdict = classify(node.old?.fingerprints, node.new?.fingerprints, ctxForClaim(ctx, id));
      if (reordered.has(id) && verdict.action === "NONE") {
        return {
          claimId: id,
          action: "RECHECK",
          layer: "spine",
          reason: "Relative order among anchored siblings changed (G22): the claim is unchanged, but the sequence it sits in is prerequisite structure — verify the ordering is still coherent.",
        };
      }
      return { claimId: id, ...verdict };
    })
    .sort(byClaimId);

  // --- SILENT RISK ---------------------------------------------------------------------------
  // Reached, present in BOTH versions, and not one of its five layers moved. Nothing else in the
  // system will ever mention this claim: M3 sees no move, M4 returns NONE, M9 plans nothing.
  // An added or removed claim is never silent — its existence changed, which is a flag in itself.
  const silentRisk = affected
    .filter((id) => {
      const node = nodes.get(id);
      return node.old && node.new && movedByNode.get(id).length === 0;
    })
    .map((id) => {
      const { from, via } = reachedBy.get(id);
      const reachedFrom = [...from].sort(cmp);
      const kinds = [...via].sort(cmp);
      return {
        claimId: id,
        reachedFrom,
        via: kinds,
        reason:
          `A change reached this claim (via ${kinds.join(", ")}, from ${reachedFrom.join(", ")}) but none of its ` +
          `five fingerprints moved: its own text is untouched, so M4 reports NONE and no other check will ` +
          `mention it. If it restates, answers or depends on what changed, it now contradicts the package ` +
          `silently — every check passes and the contradiction ships.`,
      };
    })
    .sort(byClaimId);

  return { affected, actions, silentRisk, cycles: findCycles(nodes, edges) };
}

// CONTRACT HISTORY (four defects this implementation surfaced; ALL now fixed at the source —
// kept here because THE REASONING is the load-bearing part, and a fixed contract with a forgotten
// rationale is one refactor away from being un-fixed. The authority is the interfaces file, not
// this comment: read §3 and §5b rather than re-deriving them here.)
// -------------------------------------------------------------------------------------------
// A. **`root` is VESTIGIAL** — accepted, never read. This layer needs no I/O: everything
//    reachability depends on is already in CLAIMS and TERMS, and a pure impact path is what makes
//    a flag reproducible from git months later. RESOLVED in §3 as documentation rather than a
//    removal (signature stability). It is §5c's worst instance IN A MIRROR: there, a parameter
//    (M9's `immutableRegionsByFile`) made a check that COULD NOT RUN look implemented; here it
//    makes a pure function look file-dependent, holding a door open for the next author to walk
//    through. **Do not "use it since it's there".**
// B. **`claimImpact` had no `ctx`, so `actions` could not be authorized.** RESOLVED: §3 now
//    carries the optional 5th parameter, and `ctxForClaim` threads it to M4. The reasoning worth
//    keeping is not "it was inconvenient": M4 takes `{authorized, spineChange, pedagogy}` and M7
//    exists to answer the first (`isAuthorizedDivergence(overrides, claimId)`), but M5 had no
//    parameter to receive it — so **§10 decision 2's ask-once rule was UNREACHABLE from this seam
//    at all**, not merely awkward. Every `content` move classified ESCALATE and every `spine` move
//    structural RECHECK: the safe direction, and therefore invisible, but systematically more
//    alarming than the package deserved. Alarm fatigue is the failure M10 exists to prevent,
//    arriving one module earlier. **M5 still does not read OVERRIDES itself** — M7 owns
//    `authorized` and the caller passes it down; deriving authorization here would be §5d. And see
//    `ctxForClaim` for why `authorized` is per-claim only and an edit-level one throws.
// C. **`derivedFrom` HAD NO PRODUCER — the primary reachability edge was contract-only.** RESOLVED:
//    §3's `declaredProvenance` now returns `derivedFrom` beside `termRefs`, for the identical
//    reason, and M2 threads it into the claim record. The lesson is the part to keep. It was
//    declared in `claims.schema.json` and spec §2.2 ("explicit edges for aggregate/derived
//    claims"), and §3 made it the first thing `affected` traverses — but `grep` found it in
//    exactly two places: the schema and the spec. No producer. Nothing wrote it. Every prior §5c
//    instance had TWO implementations that could disagree; **this one had ZERO**, sitting in a
//    consumer's contract, making the strongest edge in the graph look implemented. **A field's
//    presence in a schema proves someone INTENDED it; it never proves anything WRITES it.**
//    The proof that it mattered is this module's own headline test: the answer key is reached via
//    `shared-term`, NOT `derivedFrom`, because nothing in the package declared that dependency —
//    so the silent-risk result exists only because co-mention does, and a module that had trusted
//    the authored edge would have found nothing at all.
//    **The refusal that goes with the fix, now frozen into §3 as a rule:** M5 does not infer
//    derivation from prose, from anchor adjacency, or from "the answer key sits under the
//    question". Those are the fabrications §1 forbids for a term's spineRef, wearing a third hat.
//    A guessed `derivedFrom` fabricates an AUTHORED assertion, which is strictly worse than
//    co-mention — co-mention reaches the same claim while honestly saying WHY (`via`).
// D. **A dangling `derivedFrom` is silent here.** A ref naming an id in neither version yields no
//    edge (inventing a ghost node would be a fabrication), so the dependency the author asserted
//    vanishes without a word. This signature's four fields have nowhere to say so. RESOLVED by
//    ASSIGNMENT: §5b gained a fourth M11 row, "`derivedFrom` target exists", beside the dangling
//    declared anchor and the dangling spineRef — the same question, one level down, same owner.
//    Deliberately NOT crammed into `cycles`, which answers a different question: a field made to
//    answer two questions is how both of them get lost.
