// MS9 — Alignment (trial; Control C2, C3, C5 fidelity; operator 2026-10-03). Reads the blind link and level reviews
// (`verify.mjs alignment`, scripts/lib/verify/alignment.mjs) recorded for each linked teaching unit, and re-derives
// what each says about the unit as it is now:
//   link-doubtful         (question, agent)   a declared link the unit does not teach — the agent relinks or rewrites
//   off-spine             (question, digest)  the unit teaches nothing in the plan — keep or drop is the instructor's
//   assessment-fidelity   (question, agent)   a practice question not of its guide entry's type or level (agent text)
//   assessment-fidelity-instructor (question, digest)  the same in the instructor's text (D31: theirs to change)
//   alignment-unscorable  (question, agent)   the current review cannot be read — not the reply shape, a declared link
//                                             or a guide entry left unanswered, a word that is no verdict: run it
//                                             again (redteam r1 C2-16: the review fails closed, never silent)
// A review is current only while the unit's text, its links and the plan items it judged are unchanged (round 2, F11:
// an edit of another plan item, or a light rewording the instructor glance-confirmed, leaves it current). The
// reviews used are ALL of the unit's logged reviews that are current, so an older review that matches the unit as it is
// now is not hidden by a newer one made stale by an edit and its revert (C2-02); item by item the most adverse answer
// stands, so a re-run of unchanged text never overrides an earlier adverse one (red team R6, standing.mjs). What a
// review declared is re-derived from the unit, never read from the record; the whole record is bound in the log (C2-03).
// Trial: questions only, never blocking, until its own study promotes it (D13).
import { classifyUnit, derivedRole, segmentDeliverable } from "../lib/core/segment.mjs";
import { readDispatches } from "../lib/verify/dispatch.mjs";
import { dispatchLogEntry, instructorAuthored, logRecordsOf } from "../lib/verify/verdicts.mjs";
import { currentBases, labelBaseline, planOf, reviewInputs, reviewable, standingAlignment } from "../lib/verify/alignment.mjs";
import { disagreementNote } from "../lib/verify/standing.mjs";
import { base } from "./_shared.mjs";
import { originIndex } from "../lib/core/authorship.mjs";

function currentUnits(s, sides = []) {
  const out = [];
  for (const p of s.paths.filter((x) => x.startsWith("metadata/units/") && x.endsWith(".json")).sort()) {
    const side = s.json(p); if (!Array.isArray(side?.units) || typeof side.deliverable !== "string") continue;
    sides.push(side);
    const seg = segmentDeliverable(s.text(side.deliverable) || "", side.deliverable).units;
    if (seg.length !== side.units.length) continue;
    // the role is the segmenter's, never the sidecar's (C3-15)
    side.units.forEach((u, i) => out.push({ ...u, form: seg[i].form, text: seg[i].text, role: derivedRole(seg[i].role, [...new Set([...classifyUnit(seg[i]), ...(u.judgmentAdded || [])])]), ...(seg[i].label ? { label: seg[i].label } : {}), headings: seg[i].headings }));
  }
  return out;
}

function run(s) {
  const out = [];
  const sides = [], all = currentUnits(s, sides), byId = new Map(all.map((u) => [u.id, u]));
  const ancestry = originIndex(sides); // whose text it is, by the one rule (authorship.mjs; red-team round 5)
  const log = logRecordsOf(s.text("metadata/LOG.jsonl"));
  const plan = planOf(s), baseline = labelBaseline(log);
  const byUnit = new Map();
  for (const r of readDispatches((p) => s.text(p), s.paths).filter((x) => x.kind === "alignment")) {
    const entry = dispatchLogEntry(r, log); if (!entry) continue; // MS8 reports a record the log does not vouch for
    byUnit.set(r.unit, [...(byUnit.get(r.unit) || []), { r, seq: Number(entry.seq ?? 0) }]);
  }
  for (const [id, recs] of byUnit) {
    const u = byId.get(id);
    if (!u || !(reviewable(u) || u.role === "framing")) continue; // D42: framing is read for off-plan content
    const inp = reviewInputs(u, all, plan);
    // which answer stands (red team R6, R6-C1-01): every current review of the unit, item by item the most adverse
    // answer — a "yes" re-run of unchanged text never overrides an honest "no" (standing.mjs, via alignment.mjs)
    const s = standingAlignment(recs, u, inp, plan, currentBases(u, inp, plan, baseline), baseline);
    if (!s) continue;
    const v0 = s.read(s.latest);
    if (!v0 || v0.unanswered.length)
      out.push({ kind: "alignment-unscorable", units: [u.id], evidence: { type: "judgment", note: `the latest link review of ${u.id} cannot be read${v0 ? ` (no usable answer for ${v0.unanswered.join(", ")})` : " (not the reply the review asks for)"}: run it again (node scripts/verify.mjs alignment --units ${u.id})`, dispatch: s.latest.dispatch } });
    // an unreadable re-run does not hide an earlier "no" either: what the readable current reviews say stands
    if (!s.readable) continue;
    const item = (k) => s.standing.items.get(k);
    for (const [id, verdict] of s.verdicts) if (verdict === "no")
      out.push({ kind: "link-doubtful", units: [u.id], evidence: { type: "judgment", note: `${u.id} is linked to ${id} but does not deal with it: ${s.why.get(id)}${s.also.length ? ` It teaches ${s.also.join(", ")}.` : ""}${disagreementNote(item(`link:${id}`))}`, link: id, suggested: s.also, dispatch: s.by.get(`link:${id}`) } });
    if (s.offPlan === true) out.push({ kind: "off-spine", units: [u.id], evidence: { type: "judgment", note: `${u.id} teaches nothing in the chapter's approved plan: keep it (the spine may need it) or drop it?${disagreementNote(item("offPlan"))}`, dispatch: s.by.get("offPlan") } });
    for (const f of s.fidelity.filter((x) => x.type === "differs" || x.level === "differs")) {
      const g = (f.id && inp.guides.find((x) => x.id === f.id)) || inp.guides[0];
      const ask = g ? `${g.type || "any type"} at the level "${g.levels || "unspecified"}" (${g.title})` : "";
      out.push({ kind: instructorAuthored(u, log, ancestry) ? "assessment-fidelity-instructor" : "assessment-fidelity", units: [u.id], evidence: { type: "judgment", note: `${u.label || u.id} is not ${[f.type === "differs" ? "the type" : null, f.level === "differs" ? "the level" : null].filter(Boolean).join(" or ")} its guide entry asks for (${ask}): ${f.why}${disagreementNote(f.disagreed)}`, ...(g ? { guide: g.id } : {}), dispatch: f.dispatch } });
    }
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
      { kind: "alignment-unscorable", statusClass: "question", evidenceType: "judgment", route: "agent" },
    ] }),
  run,
};
