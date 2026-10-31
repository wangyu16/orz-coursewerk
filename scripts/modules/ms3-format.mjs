// MS3 — Format, syntax and the package contract (modules.md). The v0.12 audits (lib/legacy/qa_audits.mjs) run on a
// private copy. Retired here, by design: the word-presence tests standing in for coverage (the core owns coverage),
// the concept-map and assessment-guide section rules (the spine core check owns the spine), W17 objective-tag
// containment (replaced by unit links), and the photograph rule's mandatory human review (now a question, D1).
// Added (D25): every deliverable must carry valid notation for the framework that will assemble it — orz-slides for
// slides, orz-paged for declared print documents, orz-mdhtml for the pages. Since D52 (text format 1) each text is read
// by its carrier's own public readDocument: its errors are defects, its warnings notes (a `deck-block`, a slides text
// without its `carrier: slides` header, a declared print document without `carrier: paged`, are defects).
import { createQaAudits } from "../lib/legacy/qa_audits.mjs";
import { checkPageNotation, checkPagedNotation, checkSlidesNotation, frameworkDefinitions } from "../lib/core/notations.mjs";
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
  // a theme or a name the installed frame does not know: a newer frame may (D36), so it is a note to the agent,
  // never a defect — the gate does not limit what an agent may use (D38). Grammar errors stay defects.
  const theme = (file, issue) => out.push({ kind: "frame-name-unknown", units: [], evidence: { type: "judgment", note: `${file}: ${issue} — fine if the frame in use has it; otherwise check for a typo` } });
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
    // an unclosed $$ swallows everything after it into one equation, and the units there lose their evidence (P11
    // wiring sweep); fenced code is not math
    let open = 0, fence = false;
    lines.forEach((l, i) => { if (/^\s*(```|~~~)/.test(l)) fence = !fence; if (fence) return; for (const _ of l.matchAll(/\$\$/g)) open = open ? 0 : i + 1; });
    if (open) defect("math-delimiters", file, `line ${open}: a $$ display equation opens here and is never closed`);
  }
  // each orz text is read by its carrier's own public reader (D52): the carrier named by its header, else its place
  const defs = await frameworkDefinitions();
  const docs = s.json("private/coursewerk/DOCUMENTS.json");
  const declared = new Map((Array.isArray(docs?.documents) ? docs.documents : []).map((d) => [String(d?.source || d?.path || ""), /paged/i.test(String(d?.carrier || d?.type || d?.framework || "")) ? "paged" : "page"]).filter(([f]) => f));
  const texts = [...new Set([...s.paths.filter((p) => /^(?:slides|study-guide|practice)\/[^/]+\.md$/.test(p)), ...[...declared.keys()].filter((f) => /\.md$/.test(f))])].filter((f) => s.text(f) != null).sort();
  for (const file of texts) {
    const place = file.startsWith("slides/") ? "slides" : declared.get(file) === "paged" ? "paged" : "page";
    const [check, frame] = place === "slides" ? [checkSlidesNotation, "orz-slides"] : place === "paged" ? [checkPagedNotation, "orz-paged"] : [checkPageNotation, "orz-mdhtml"];
    for (const pr of check(s.text(file) || "", defs)) pr.aspect ? theme(file, `line ${pr.line}: ${pr.issue}`) : defect("framework-notation", file, `line ${pr.line}: ${pr.issue} (${frame})`);
  }
  return out;
}

export default {
  manifest: base({ name: "ms3-format", serves: ["Confidence"], checkpoints: ["V2", "V8"], reads: ["deliverables", "manifest", "assets"], cost: "per file", profiles: ["public", "private"],
    emits: [
      { kind: "format-contract", statusClass: "defect", evidenceType: "rule", route: "agent" },
      { kind: "no-photograph", statusClass: "question", evidenceType: "judgment", route: "digest" },
      { kind: "frame-name-unknown", statusClass: "question", evidenceType: "judgment", route: "agent" },
    ] }),
  run, recheck: recheckByRerun(run),
};
