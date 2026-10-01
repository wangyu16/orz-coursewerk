// MS3 — Format, syntax and the package contract (modules.md). The v0.12 audits (lib/legacy/qa_audits.mjs) run on a
// private copy. Retired here, by design: the word-presence tests standing in for coverage (the core owns coverage),
// the concept-map and assessment-guide section rules (the spine core check owns the spine), W17 objective-tag
// containment (replaced by unit links), and the photograph rule's mandatory human review (now a question, D1).
import { createQaAudits } from "../lib/legacy/qa_audits.mjs";
import { base, recheckByRerun } from "./_shared.mjs";

const RETIRED = [/practice sheet does not tag objective coverage/, /slides source is missing objective coverage/, /^assessment support is missing/,
  /concept map is missing its/, /concept map heading is a NEAR-MISS/, /concept map has a `## Keywords` section/, /deliverable tags undeclared objective/,
  /course concept map is missing its/];
const PHOTO = /has no real photograph/;
function run(s) {
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
