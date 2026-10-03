// MS9 — Alignment (trial; Control C2, C3, C5 fidelity; operator 2026-10-03). Reads the blind link and level reviews
// (`verify.mjs alignment`, scripts/lib/verify/alignment.mjs) recorded for each linked teaching unit, and re-derives
// what each says about the unit as it is now:
//   link-doubtful         (question, agent)   a declared link the unit does not teach — the agent relinks or rewrites
//   off-spine             (question, digest)  the unit teaches nothing in the plan — keep or drop is the instructor's
//   assessment-fidelity   (question, agent)   a practice question not of its guide entry's type or level (agent text)
//   assessment-fidelity-instructor (question, digest)  the same in the instructor's text (D31: theirs to change)
// A review is current only while the unit's text, its links and the plan it was judged against are unchanged.
// Trial: questions only, never blocking, until its own study promotes it (D13).
import { segmentDeliverable } from "../lib/core/segment.mjs";
import { readDispatches } from "../lib/verify/dispatch.mjs";
import { dispatchLogged, instructorAuthored, logRecordsOf } from "../lib/verify/verdicts.mjs";
import { alignmentBasis, planOf, readAlignment, reviewInputs, reviewable } from "../lib/verify/alignment.mjs";
import { base } from "./_shared.mjs";

function currentUnits(s) {
  const out = [];
  for (const p of s.paths.filter((x) => x.startsWith("metadata/units/") && x.endsWith(".json")).sort()) {
    const side = s.json(p); if (!Array.isArray(side?.units) || typeof side.deliverable !== "string") continue;
    const seg = segmentDeliverable(s.text(side.deliverable) || "", side.deliverable).units;
    if (seg.length !== side.units.length) continue;
    side.units.forEach((u, i) => out.push({ ...u, form: seg[i].form, text: seg[i].text, ...(seg[i].label ? { label: seg[i].label } : {}) }));
  }
  return out;
}

function run(s) {
  const out = [];
  const all = currentUnits(s), byId = new Map(all.map((u) => [u.id, u]));
  const log = logRecordsOf(s.text("metadata/LOG.jsonl"));
  const plan = planOf(s);
  const latest = new Map();
  for (const r of readDispatches((p) => s.text(p), s.paths).filter((x) => x.kind === "alignment" && dispatchLogged(x, log)))
    if (!latest.has(r.unit) || String(r.at) > String(latest.get(r.unit).at)) latest.set(r.unit, r);
  for (const [id, r] of latest) {
    const u = byId.get(id);
    if (!u || !reviewable(u)) continue;
    const inp = reviewInputs(u, all, plan);
    if (r.alignmentBasis !== alignmentBasis(u, plan.nodes, [...inp.chapterNodes, ...inp.links])) continue; // a review of something else is history
    const v = readAlignment(r.answer?.raw, r.bundle?.nonce, r.declared || [], new Set(inp.chapterNodes.map((n) => n.id)), !!inp.guide);
    if (!v) continue;
    for (const l of v.links.filter((x) => x.verdict === "no"))
      out.push({ kind: "link-doubtful", units: [u.id], evidence: { type: "judgment", note: `${u.id} is linked to ${l.id} but does not deal with it: ${l.why}${v.also.length ? ` It teaches ${v.also.join(", ")}.` : ""}`, link: l.id, suggested: v.also, dispatch: r.dispatch } });
    if (v.offPlan) out.push({ kind: "off-spine", units: [u.id], evidence: { type: "judgment", note: `${u.id} teaches nothing in the chapter's approved plan: keep it (the spine may need it) or drop it?`, dispatch: r.dispatch } });
    if (v.fidelity && (v.fidelity.type === "differs" || v.fidelity.level === "differs"))
      out.push({ kind: instructorAuthored(u, log) ? "assessment-fidelity-instructor" : "assessment-fidelity", units: [u.id], evidence: { type: "judgment", note: `${u.label || u.id} is not ${[v.fidelity.type === "differs" ? "the type" : null, v.fidelity.level === "differs" ? "the level" : null].filter(Boolean).join(" or ")} its guide entry asks for (${inp.guide}): ${v.fidelity.why}`, dispatch: r.dispatch } });
  }
  return out;
}

export default {
  manifest: base({ name: "ms9-alignment", maturity: "trial", mayBlock: false, method: "model-judged", serves: ["Control"], checkpoints: ["V8"], reads: ["units", "spine", "history", "log"], cost: "per recorded review", profiles: ["public", "private"],
    emits: [
      { kind: "link-doubtful", statusClass: "question", evidenceType: "judgment", route: "agent" },
      { kind: "off-spine", statusClass: "question", evidenceType: "judgment", route: "digest" },
      { kind: "assessment-fidelity", statusClass: "question", evidenceType: "judgment", route: "agent" },
      { kind: "assessment-fidelity-instructor", statusClass: "question", evidenceType: "judgment", route: "digest" },
    ] }),
  run,
};
