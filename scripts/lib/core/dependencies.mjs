// What a unit depends on (redesign P5; Coherence H1; D19-H). Every edge is mechanical, so impact is complete for
// these kinds (H1): shared values, the question an answer belongs to, key terms the unit uses, the spine nodes it
// serves and the prerequisites those nodes declare, and its sources. Each dependency target has a hash; a unit is
// stamped with those hashes when it is written or re-verified, and is stale when any of them moves.
//
// Unit-to-unit dependencies hash the target's FACT TOKENS, not its wording (D17, D19-C): a rephrase of a neighbour
// leaves dependents alone; a changed value, name, number or negation makes them stale.
import { canonicalJson, sha256 } from "../records/canonical.mjs";
import { factTokens, meaningTokens } from "./change.mjs";
import { nodeIndex } from "./spine.mjs";

export const factHash = (text) => sha256(canonicalJson(factTokens(text)));
const QUANTITY = /[−-]?\d+(?:[.,]\d+)?\s*(?:°C|K\b|kJ|J\b|mol|M\b|atm|bar|Pa|kPa|g\b|kg|mg|L\b|mL|%)/g;
// Quantities are found after folding LaTeX spellings ("-92\\ \\text{kJ mol}^{-1}" → "-92 kJ mol"), since the
// packages write most values in LaTeX; a value written two ways is still one shared value.
export const plainForQuantities = (text) => String(text)
  .replace(/\\text\{([^}]*)\}/g, " $1 ").replace(/\\mathrm\{([^}]*)\}/g, " $1 ").replace(/\\(?:,|;|!| |quad|qquad)/g, " ")
  .replace(/\^\{[^}]*\}/g, "").replace(/[{}$]/g, " ").replace(/\\(?:approx|times)/g, " ").replace(/−/g, "-");
const quantities = (text) => [...new Set((plainForQuantities(text).match(QUANTITY) || []).map((q) => q.replace(/\s+/g, "")))];
export { quantities };

/**
 * @param {Array} units   [{ id, form, locator:{deliverable, section, ordinal}, spineNodes, origin, evidence, text }]
 * @param {object} spine  parsed spine (parseSpine)
 * @param {object} sources { <sourceId>: hash }
 * @returns Map(unitId → [{ target, kind }])
 */
export function dependencyEdges(units, spine, sources = {}) {
  const edges = new Map(units.map((u) => [u.id, []]));
  const add = (u, target, kind) => { const list = edges.get(u.id); if (!list.some((e) => e.target === target)) list.push({ target, kind }); };
  // shared values: units stating the same quantity depend on each other
  const byQty = new Map();
  for (const u of units) for (const q of quantities(u.text)) byQty.set(q, [...(byQty.get(q) || []), u]);
  for (const list of byQty.values()) if (list.length > 1) for (const a of list) for (const b of list) if (a !== b) add(a, `unit:${b.id}`, "shared-value");
  // an answer depends on the question it answers (the nearest question before it in the same deliverable and section)
  units.forEach((u, i) => {
    if (u.form !== "answer") return;
    for (let j = i - 1; j >= 0; j--) { const v = units[j]; if (v.locator.deliverable !== u.locator.deliverable) break; if (v.form === "question") { add(u, `unit:${v.id}`, "derivation"); add(u, `question:${v.id}`, "derivation"); break; } }
  });
  // key terms used in the unit
  const terms = [...spine.course.terms || [], ...Object.values(spine.chapters).flatMap((c) => c.map.terms)];
  for (const u of units) for (const t of terms) if (t.label && new RegExp(`\\b${t.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(u.text)) add(u, `term:${t.label.toLowerCase()}`, "shared-term");
  // spine nodes the unit serves, and the prerequisites those nodes declare (D19-H)
  const nodes = nodeIndex(spine);
  for (const u of units) for (const n of u.spineNodes || []) {
    add(u, `spine:${n}`, "spine-node");
    for (const p of nodes.get(n)?.prereqs || []) add(u, `spine:${p}`, "prerequisite");
  }
  // sources: the unit's own source and the sources of its evidence
  for (const u of units) {
    if (u.origin?.kind === "source-derived" && u.origin.source) add(u, `source:${u.origin.source}`, "source");
    for (const e of u.evidence || []) if (e.source) add(u, `source:${e.source}`, "source");
  }
  void sources;
  return edges;
}

/** The current hash of every dependency target. */
export function targetHashes(units, spine, sources = {}) {
  const h = {};
  for (const u of units) { h[`unit:${u.id}`] = factHash(u.text); if (u.form === "question") h[`question:${u.id}`] = sha256(canonicalJson(meaningTokens(u.text))); }
  for (const t of [...(spine.course.terms || []), ...Object.values(spine.chapters).flatMap((c) => c.map.terms)]) if (t.label) h[`term:${t.label.toLowerCase()}`] = sha256(t.text);
  for (const [id, n] of nodeIndex(spine)) h[`spine:${id}`] = sha256(canonicalJson({ text: n.text ?? n.title, prereqs: n.prereqs ?? [], type: n.type ?? null, count: n.count ?? null, levels: n.levels ?? null }));
  for (const [id, hash] of Object.entries(sources)) h[`source:${id}`] = hash;
  return h;
}

/** A unit's stamp: the hash of each of its dependencies now. */
export function stampFor(unitId, edges, hashes) {
  return Object.fromEntries((edges.get(unitId) || []).map((e) => [e.target, hashes[e.target] ?? "missing"]));
}

/** Dependencies whose hash moved since the unit was stamped. */
export function staleTargets(stamp, hashes) {
  return Object.entries(stamp || {}).filter(([t, h]) => (hashes[t] ?? "missing") !== h).map(([t]) => t);
}

/** Source hashes from the package's compact source record. */
export function sourceHashes(reader) {
  try {
    const rec = JSON.parse(reader.text("metadata/SOURCE_RECORD.json") || "null");
    return Object.fromEntries((rec?.sources || []).filter((s) => s.id).map((s) => [s.id, s.textSha256 || s.rawSha256 || sha256(canonicalJson(s))]));
  } catch { return {}; }
}
