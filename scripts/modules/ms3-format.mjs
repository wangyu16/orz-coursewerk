// MS3 — Format, syntax and the package contract (modules.md). The v0.12 audits (lib/legacy/qa_audits.mjs) run on a
// private copy. Retired here, by design: the word-presence tests standing in for coverage (the core owns coverage),
// the concept-map and assessment-guide section rules (the spine core check owns the spine), W17 objective-tag
// containment (replaced by unit links), and the photograph rule's mandatory human review (now a question, D1).
// Added (D25): every deliverable must carry valid notation for the framework that will assemble it — orz-slides for
// slides, orz-paged for declared print documents — checked against each framework's own theme and template ids.
import { createQaAudits } from "../lib/legacy/qa_audits.mjs";
import { checkPagedNotation, checkSlidesNotation, frameworkDefinitions } from "../lib/core/notations.mjs";
import { base, recheckByRerun } from "./_shared.mjs";

const RETIRED = [/practice sheet does not tag objective coverage/, /slides source is missing objective coverage/, /^assessment support is missing/,
  /concept map is missing its/, /concept map heading is a NEAR-MISS/, /concept map has a `## Keywords` section/, /deliverable tags undeclared objective/,
  /course concept map is missing its/];
const PHOTO = /has no real photograph/;
async function run(s) {
  const pkg = s.materialize().package;
  const q = createQaAudits(pkg, { forDiscovery: s.profile === "public" });
  const out = [];
  const defect = (audit, file, issue) => out.push({ kind: "format-contract", units: [], evidence: { type: "rule", rule: audit, file, issue } });
  const man = q.manifestAudit();
  for (const e of man.errors) defect("alembic-manifest", "alembic.json", e);
  for (const e of q.layoutAudit(man.chapters).errors) defect("package-layout", null, e);
  for (const i of q.orzSyntaxAudit().issues || []) defect("orz-syntax", i.file, i.issue || i.message || JSON.stringify(i));
  for (const h of q.placeholdersAudit().hits || []) defect("placeholder", h.file, h.text || h.match || JSON.stringify(h));
  const acc = q.accessibilityAudit();
  for (const o of acc.offenders || []) defect("accessibility", o.file, o.issue || o.kind || JSON.stringify(o));
  for (const f of q.formatContractAudit().failures || []) {
    if (RETIRED.some((r) => r.test(f.issue))) continue;
    if (PHOTO.test(f.issue)) { out.push({ kind: "no-photograph", units: [], evidence: { type: "judgment", note: f.issue } }); continue; }
    defect("format-contract", f.file, f.issue);
  }
  // invisible format characters hide values from every check that reads the text (round P7-1, B11)
  for (const file of s.paths.filter((p) => /^(study-guide|slides|practice|concepts|assessment-support)\/.+\.md$/.test(p)).sort()) {
    const lines = (s.text(file) || "").split("\n");
    lines.forEach((l, i) => { const m = l.replace(/^\uFEFF/, "").match(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/); if (m) defect("invisible-character", file, `line ${i + 1}: U+${m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, "0")} hides text from the checks — remove it`); });
  }
  const defs = await frameworkDefinitions();
  for (const file of s.paths.filter((p) => /^slides\/[^/]+\.md$/.test(p)).sort())
    for (const pr of checkSlidesNotation(s.text(file) || "", defs)) defect("framework-notation", file, `line ${pr.line}: ${pr.issue} (orz-slides)`);
  const docs = s.json("metadata/DOCUMENTS.json");
  for (const d of Array.isArray(docs?.documents) ? docs.documents : []) {
    if (!/paged/i.test(String(d.carrier || d.type || d.framework || ""))) continue;
    const file = d.source || d.path; if (!file || s.text(file) == null) continue;
    for (const pr of checkPagedNotation(s.text(file), defs)) defect("framework-notation", file, `${pr.issue} (orz-paged)`);
  }
  return out;
}

export default {
  manifest: base({ name: "ms3-format", serves: ["Confidence"], checkpoints: ["V2", "V8"], reads: ["deliverables", "manifest", "assets"], cost: "per file", profiles: ["public", "private"],
    emits: [
      { kind: "format-contract", statusClass: "defect", evidenceType: "rule", route: "agent" },
      { kind: "no-photograph", statusClass: "question", evidenceType: "judgment", route: "digest" },
    ] }),
  run, recheck: recheckByRerun(run),
};
