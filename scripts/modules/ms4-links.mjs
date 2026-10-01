// MS4 — Links and assets (modules.md). Broken local links and asset paths are defects; an asset with no provenance
// record is an obligation; an external link not yet resolved by the retrieval service (P7) is an obligation.
import { createQaAudits } from "../lib/legacy/qa_audits.mjs";
import { base, recheckByRerun } from "./_shared.mjs";

function run(s) {
  const pkg = s.materialize().package;
  const q = createQaAudits(pkg, { forDiscovery: s.profile === "public" });
  const out = [];
  const links = q.linkAudit();
  for (const b of links.broken || []) out.push({ kind: "link-broken", units: [], evidence: { type: "rule", rule: "a local link resolves", file: b.file, target: b.target } });
  for (const m of links.missingAssetReferences || []) out.push({ kind: "asset-missing", units: [], evidence: { type: "rule", rule: "a referenced asset exists", reference: m } });
  for (const r of links.remoteMedia || []) out.push({ kind: "remote-media", units: [], evidence: { type: "rule", rule: "media is local and rights-recorded, not hot-linked", reference: r } });
  for (const m of q.attributionAudit().unmanifestedMedia || []) out.push({ kind: "asset-unrecorded", units: [], evidence: { type: "missing", what: `a provenance record for assets/${m}` } });
  const resolved = new Set((s.json("metadata/LINK_RESOLUTIONS.json")?.links || []).filter((l) => l.status >= 200 && l.status < 400).map((l) => l.url));
  const external = new Set();
  for (const f of q.mdFiles) for (const l of q.markdownLinks(q.read(f))) if (/^https?:/i.test(l.target)) external.add(l.target);
  for (const url of [...external].sort()) if (!resolved.has(url)) out.push({ kind: "external-link-unresolved", units: [], evidence: { type: "missing", what: `a recorded resolution of ${url}` } });
  return out;
}

export default {
  manifest: base({ name: "ms4-links", serves: ["Confidence"], checkpoints: ["V2", "V8"], reads: ["deliverables", "assets"], cost: "per link", profiles: ["public", "private"],
    emits: [
      { kind: "link-broken", statusClass: "defect", evidenceType: "rule", route: "agent" },
      { kind: "asset-missing", statusClass: "defect", evidenceType: "rule", route: "agent" },
      { kind: "remote-media", statusClass: "defect", evidenceType: "rule", route: "agent" },
      { kind: "asset-unrecorded", statusClass: "obligation", evidenceType: "missing", route: "agent" },
      { kind: "external-link-unresolved", statusClass: "obligation", evidenceType: "missing", route: "agent" },
    ] }),
  run, recheck: recheckByRerun(run),
};
