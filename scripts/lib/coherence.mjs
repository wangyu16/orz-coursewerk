// Coursewerk component index + revision coherence kernel.
//
// Every output component is hashed and connected by directed dependency edges.
// A source component points to the components that must remain consistent with
// it. Any edit invalidates the index until the complete impact set is reviewed
// and an attested refresh records the new coherent state.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { outputGitState } from "./output_git.mjs";

export const COMPONENT_INDEX_PATH = "metadata/COMPONENT_INDEX.json";
const EXCLUDE = new Set([COMPONENT_INDEX_PATH, ".gitignore", ".DS_Store"]);
const DELIVERABLE_TOPS = new Set(["concepts", "study-guide", "slides", "assessment-support", "practice"]);
const HASH = (value) => crypto.createHash("sha256").update(value).digest("hex");
const norm = (p) => String(p || "").replaceAll("\\", "/").replace(/^\.\//, "");

export function coherenceStateFile(root) {
  root = path.resolve(root);
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
  if (rel === "metadata/FOUNDATION.json") return "foundation";
  if (rel === "metadata/PROVENANCE.json") return "provenance";
  if (rel === "metadata/ATTRIBUTION.md") return "attribution";
  if (rel === "metadata/SOURCE_RECORD.json") return "source-record";
  if (["metadata/KEY_FACT_REVIEW.json", "metadata/VISUAL_REVIEW.json"].includes(rel)) return "review";
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
        hash: HASH(fs.readFileSync(x.file)),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  const byPath = new Map(components.map((c) => [c.path, c]));
  const edges = new Map();

  // Foundation and manifest decisions can affect every public-facing component.
  for (const c of components) {
    if (c.path !== "metadata/FOUNDATION.json")
      addEdge(edges, byPath, "metadata/FOUNDATION.json", c.path, "foundation facts constrain component");
    if (DELIVERABLE_TOPS.has(c.type) || ["readme", "license", "attribution"].includes(c.type))
      addEdge(edges, byPath, "alembic.json", c.path, "manifest identity/scope/license constrains component");
  }
  addEdge(edges, byPath, "metadata/PROVENANCE.json", "metadata/ATTRIBUTION.md", "human attribution mirrors provenance");
  addEdge(edges, byPath, "alembic.json", "metadata/KEY_FACT_REVIEW.json", "output-license declaration is rechecked in the key-fact critique");
  addEdge(edges, byPath, "LICENSE", "metadata/KEY_FACT_REVIEW.json", "canonical output-license text is rechecked in the key-fact critique");
  addEdge(edges, byPath, "metadata/PROVENANCE.json", "metadata/KEY_FACT_REVIEW.json", "media provenance is rechecked in the key-fact critique");
  addEdge(edges, byPath, "metadata/ATTRIBUTION.md", "metadata/KEY_FACT_REVIEW.json", "public attribution obligations are rechecked in the key-fact critique");
  addEdge(edges, byPath, "metadata/SOURCE_RECORD.json", "metadata/KEY_FACT_REVIEW.json", "source revisions are rechecked in the key-fact critique");
  const provenanceFile = path.join(root, "metadata", "PROVENANCE.json");
  if (fs.existsSync(provenanceFile)) {
    try {
      const provenance = JSON.parse(fs.readFileSync(provenanceFile, "utf8"));
      for (const item of provenance.items || []) for (const used of item.usedIn || [])
        addEdge(edges, byPath, "metadata/PROVENANCE.json", norm(used), `provenance item ${item.id || "unknown"} constrains incorporating document`);
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
    addEdge(edges, byPath, "metadata/SOURCE_RECORD.json", component.path, "revision-bound sources constrain teaching content");
    addEdge(edges, byPath, component.path, "metadata/KEY_FACT_REVIEW.json", "teaching content must be rechecked in the key-fact critique");
  }
  for (const component of components.filter((item) => ["study-guide", "practice", "slides"].includes(item.type)))
    addEdge(edges, byPath, component.path, "metadata/VISUAL_REVIEW.json", "carrier source must be visually re-reviewed after change");
  for (const component of components.filter((item) => item.type === "asset"))
    addEdge(edges, byPath, component.path, "metadata/VISUAL_REVIEW.json", "visual asset must be re-reviewed after change");

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
    generatedAt: new Date().toISOString(),
    components: graph.components.map((c) => ({ ...c, dependencies: dependencies.get(c.id) || {} })),
    relationships: graph.relationships,
  };
}

export function loadComponentIndex(root) {
  const file = path.join(path.resolve(root), COMPONENT_INDEX_PATH);
  if (!fs.existsSync(file)) return { file, index: null, error: "metadata/COMPONENT_INDEX.json is missing; initialize the component index." };
  try {
    return { file, index: JSON.parse(fs.readFileSync(file, "utf8")), error: null };
  } catch (e) {
    return { file, index: null, error: `metadata/COMPONENT_INDEX.json is invalid JSON: ${e.message}` };
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
  const chapters = Array.isArray(manifest.chapters) ? manifest.chapters.filter((c) => c?.slug) : [];
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
  if (acceptedState) {
    const actualIndexHash = HASH(JSON.stringify(loaded.index));
    if (acceptedState.schemaVersion !== 2) failures.push("accepted coherence ledger schema is stale.");
    if (acceptedState.acceptedIndexSha256 !== actualIndexHash) failures.push("COMPONENT_INDEX.json does not match the externally accepted index hash.");
  }
  failures.push(...structuralCoherenceFailures(root, graph));

  for (const [id, c] of cur.components) {
    const prior = old.components.get(id);
    if (!prior) {
      changed.push(id);
      failures.push(`${c.path}: new component is not in the coherence index.`);
    } else if (prior.hash !== c.hash) {
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
    if (dependent && source && dependent.dependencies?.[e.from] !== source.hash) {
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
