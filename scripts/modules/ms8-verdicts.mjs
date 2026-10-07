// MS8 — Verdicts (redesign P7; D17, D19-A; modules.md "semi-mechanical verdict path"). Re-derives, deterministically,
// what every recorded verifier dispatch establishes against the pinned texts, and checks the evidence units carry:
//   fact-contradicted   (defect)   an uncontested contradiction of a quantity, quoted from a pinned text;
//   fact-disputed       (question) a contradicted year or name, or a contradiction another source contests (D12-F) —
//                                  in the instructor's text; in the agent's own text it is fact-check-own, the agent's;
//   absolute-overgeneral (question, routed to the agent) a context review found a scientific absolute broader than the
//                                  truth; the agent rewords it (D30) — the instructor sees it only if it stays open;
//   knowledge-concern   (question) a blind verifier's concern that a knowledge-based unit is wrong — never a defect,
//                                  never an automatic change (req.knowledge.no-autochange);
//   knowledge-unscorable (question, routed to the agent) a blind review that cannot be scored: no readable answer, or a
//                                  concern quoting words the passage does not contain (R2-K10) — run it again;
//   clarification-owed  (question, routed to the agent) the reviewer finds the agent's own text correct as meant and
//                                  gives a few words that make it precise; the agent applies them (D35)
//   clarification-proposed (question) the same for the instructor's text: a one-line diff to accept or not (D35 (a));
//   clarification-accepted (obligation, agent) the instructor accepted it; the agent applies it, keeping their credit
//   evidence-unsupported (defect)  quote-verified evidence that does not re-derive: no dispatch record, a record that
//                                  does not admit, or quotes that do not carry the unit's current facts.
//   dispatch-unlogged / dispatch-record-missing (defect) a verification record the log does not vouch for, or a
//                                  logged dispatch whose record is gone (round P7-1).
// Verdicts concern the unit's CURRENT claims only: a record of other claims is history.
import { segmentDeliverable } from "../lib/core/segment.mjs";
import { factHash } from "../lib/core/dependencies.mjs";
import { checkableClaims, claimsHash } from "../lib/verify/claims.mjs";
import { supports } from "../lib/verify/admission.mjs";
import { quoteIn, readDispatches, readKnowledgeReview } from "../lib/verify/dispatch.mjs";
import { pinnedTexts, snapshotInputReader } from "../lib/verify/references.mjs";
import { absoluteReviewOf, absolutesHash } from "../lib/verify/absolutes.mjs";
import { checksCurrentClaims, claimKey, correctionLogged, dispatchLogged, instructorAuthored, keptClaims, knowledgeConcerns, leadOf, logRecordsOf, recordClaimTexts, recordLeads, rederive } from "../lib/verify/verdicts.mjs";
import { findingId } from "../lib/records/findings.mjs";
import { base, recheckByRerun } from "./_shared.mjs";

/** A unit that can hold invented exercise data: by its form and role, never by a word in it — a question or answer,
 *  a unit of a practice deliverable, or a unit in a worked-example / exercise section. (Red-team round 2, R2-K09: a cue
 *  word anywhere — "a temperature a student can use" — made a real-world study-guide fact "exercise-like", and the
 *  instructor's accept-all confirmed a wrong Haber-process temperature as a teaching hypothetical.) A worked example in
 *  a study guide is set as one: an "Example" or "Exercise" callout (form "question") or its own section. */
const EXERCISE_SECTION = /(?:^|-)(?:worked-examples?|examples?|exercises?|problems?|practice|questions?|check-your-understanding|try-it)(?:-|$)/;
const exerciseLike = (u) => ["question", "answer"].includes(u.form) || String(u.locator?.deliverable || "").startsWith("practice/") || EXERCISE_SECTION.test(String(u.locator?.section || ""));

function currentUnits(s) {
  const out = new Map();
  for (const p of s.paths.filter((x) => x.startsWith("metadata/units/") && x.endsWith(".json")).sort()) {
    const side = s.json(p); if (!Array.isArray(side?.units) || typeof side.deliverable !== "string") continue; // malformed: the index reports it
    const seg = segmentDeliverable(s.text(side.deliverable) || "", side.deliverable).units;
    if (seg.length !== side.units.length) continue; // out of date: units-not-indexed covers it
    side.units.forEach((u, i) => out.set(u.id, { ...u, form: seg[i].form, text: seg[i].text, contentHash: u.locator?.contentHash }));
  }
  return out;
}
const sameQuotes = (a, b) => JSON.stringify((a || []).map((q) => [q.source, q.span?.[0], q.span?.[1]]).sort()) === JSON.stringify((b || []).map((q) => [q.source, q.span?.[0], q.span?.[1]]).sort());

function run(s) {
  const out = [];
  const units = currentUnits(s);
  const records = readDispatches((p) => s.text(p), s.paths);
  const log = logRecordsOf(s.text("metadata/LOG.jsonl"));
  const pinned = pinnedTexts(snapshotInputReader(s));
  const plain = new Map([...pinned].filter(([, v]) => v.ok).map(([k, v]) => [k, v.text]));
  const byDispatch = new Map(records.map((r) => [r.dispatch, r]));
  const corrections = new Map(s.paths.filter((p) => p.startsWith("metadata/corrections/") && p.endsWith(".json")).map((p) => s.json(p)).filter(Boolean).map((c) => [c.id, c]));
  const divergedLogged = (u, e) => log.some((l) => l.type === "divergence" && l.party?.role === "instructor" && l.payload?.unit === u.id && l.payload?.correction === e.correction);
  const diverged = (u) => (u.evidence || []).some((e) => e.type === "authorized-divergence" && e.factHash === factHash(u.text) && divergedLogged(u, e));

  // every record is a logged dispatch, and every logged dispatch still has its record (B12, B13, p22)
  for (const r of records) if (!dispatchLogged(r, log))
    out.push({ kind: "dispatch-unlogged", units: units.has(r.unit) ? [r.unit] : [], evidence: { type: "rule", rule: "a verification record matches a dispatch in the decision log (bundle and answer hashes)", dispatch: r.dispatch ?? null } });
  for (const l of log.filter((x) => x.type === "dispatch" && x.payload?.dispatch)) if (!byDispatch.has(l.payload.dispatch))
    out.push({ kind: "dispatch-record-missing", units: units.has(l.payload.unit) ? [l.payload.unit] : [], evidence: { type: "rule", rule: "every logged dispatch keeps its record in metadata/verification/", dispatch: l.payload.dispatch } });

  const kept = keptClaims(log);
  const latestKnowledge = new Set(); // units whose newest knowledge review of the current text was read
  const askedExercise = new Set(); // one question per unit, however many records read it as exercise data
  for (const r of [...records].sort((x, y) => String(y.at).localeCompare(String(x.at)))) {
    const u = units.get(r.unit);
    if (!u || r.factHash !== factHash(u.text) || !dispatchLogged(r, log)) continue;
    if (r.kind === "absolute") {
      // a context review (D30): an over-general scientific absolute is a question for the agent, with a rewording
      // read from what the log binds (the prompt and the answer), never from the record's editable fields (round 2)
      const a = absoluteReviewOf(r, log);
      if (!a || a.unit !== u.id || a.absolutesHash !== absolutesHash(u.text)) continue;
      const v = a.review;
      if (v.ok) for (const x of v.results.filter((y) => y.class === "over-general"))
        out.push({ kind: "absolute-overgeneral", units: [u.id], evidence: { type: "judgment", note: x.why, quote: x.sentence, suggestion: x.suggestion, dispatch: r.dispatch } });
      continue;
    }
    if (r.kind === "knowledge") {
      // a review that cannot be scored is said so, never read as a clean review (red-team round 2, R2-K10): an answer
      // that does not parse, or a concern quoting words the reviewed passage does not contain (even read as rendered)
      if (r.contentHash === u.contentHash && !latestKnowledge.has(u.id) && latestKnowledge.add(u.id)) { // the newest review of this text decides
        const k = readKnowledgeReview(r, u.text);
        if (!k.ok || k.unlocated.length)
          out.push({ kind: "knowledge-unscorable", units: [u.id], evidence: { type: "judgment", note: !k.ok ? `the blind review of ${u.id} cannot be read (${k.reason}): run it again (node scripts/verify.mjs knowledge --units ${u.id})` : `the blind review of ${u.id} raised a concern about words the passage does not contain ("${k.unlocated[0].text.slice(0, 120)}": ${k.unlocated[0].problem.slice(0, 200)}): it cannot be scored — run it again (node scripts/verify.mjs knowledge --units ${u.id})`, quote: k.unlocated[0]?.text ?? "", dispatch: r.dispatch } });
      }
      for (const c of knowledgeConcerns(r, u.text)) {
        const evidence = { type: "judgment", note: c.problem, quote: c.text, suggestion: c.suggestion, dispatch: r.dispatch };
        // applied: the unit now says what the concern proposed. Added words often touch no fact token, so the record is
        // still "current" — settledness is read from the text itself, for a clarification and a "wrong" concern alike
        // (P11: an applied clarification stayed owed; the T3 scenario brought an already-fixed concern to the instructor)
        // Settled only when the unit carries the suggestion AND no longer carries the quoted words — unless the suggestion
        // itself extends them (red-team round 1, F12: a deletion's suggestion is a substring of the wrong words, and a
        // substring test settled the concern while the wrong words stood). The quoted words are in the unit whenever the
        // concern is current, so in practice: settled when the suggestion contains them and the unit contains it.
        // read as written or as rendered, like the concern's own quote (R2-K10)
        const applied = c.suggestion.trim().length >= 8 && quoteIn(c.suggestion, u.text) && (!quoteIn(c.text, u.text) || quoteIn(c.text, c.suggestion));
        if (applied) continue;
        if (c.kind !== "clarify" || !c.suggestion.trim()) { out.push({ kind: "knowledge-concern", units: [u.id], evidence }); continue; }
        if (!instructorAuthored(u, log)) { out.push({ kind: "clarification-owed", units: [u.id], evidence }); continue; }
        // the instructor's text (D31 stands): proposed as a one-line diff; once accepted, applying it is the agent's job
        const proposed = { ...evidence, note: `Clarify: "${c.text}" → "${c.suggestion}". ${c.problem}` };
        const id = findingId({ module: "ms8-verdicts", kind: "clarification-proposed", units: [u.id], evidence: proposed });
        const accepted = log.some((l) => l.type === "answer" && l.party?.role === "instructor" && (l.payload?.answers || []).some((a) => a.finding === id && /^\s*apply/i.test(a.choice)));
        if (accepted) out.push({ kind: "clarification-accepted", units: [u.id], evidence: { type: "missing", what: `the clarification the instructor accepted, applied to ${u.id}: "${c.text}" → "${c.suggestion}" (their credit stays, D33)`, quote: c.text, suggestion: c.suggestion, dispatch: r.dispatch } });
        else out.push({ kind: "clarification-proposed", units: [u.id], evidence: proposed, recommendation: "apply" });
      }
      continue;
    }
    if (!plain.size || !checksCurrentClaims(r, u.text, leadOf(u, [...units.values()]))) continue; // a record of other claims is history
    const a = rederive(r, plain);
    if (!a || diverged(u)) continue;
    // exercise data no source can show: the instructor confirms it once, so it comes to the digest (P9 scenario)
    const settled = (u.evidence || []).some((e) => e.factHash === factHash(u.text) && (e.type === "instructor-confirmation" || (e.type === "quote-verified" && e.claimsHash === claimsHash(u.text))));
    // only an exercise-like unit can be invented data (red-team round 1, F14): elsewhere a "hypothetical" label is no
    // evidence and no question — the unit's evidence is still missing, and nothing recommends confirming it
    if (exerciseLike(u) && a.perClaim.length && a.perClaim.every((c) => c.status === "hypothetical") && !settled && !askedExercise.has(u.id) && askedExercise.add(u.id))
      out.push({ kind: "exercise-data-confirm", units: [u.id], evidence: { type: "judgment", note: `${u.id}: the values here read as invented exercise data, which no source can show — confirm them as teaching hypotheticals?`, quote: r.claims?.map((c) => c.text).join(" | ") || "", dispatch: r.dispatch }, recommendation: "confirm" });
    for (const c of a.perClaim) {
      if (c.status === "contradicted")
        out.push({ kind: "fact-contradicted", units: [u.id], evidence: { type: "quote", dispatch: r.dispatch, claim: c.claim, conflicts: c.conflicts, quotes: c.quotes.map((q) => ({ source: q.source, quote: q.quote, span: q.span })) } });
      else if (c.status === "disputed") {
        // in the agent's own text a dispute is the agent's to settle: it re-checks the value against the quote and
        // fixes or keeps its draft — the instructor is not asked (P11, operator: catch much, annoy little)
        // the dispute as one claim (D40): keyed by its sentence and values, so an edit elsewhere in the unit keeps the answer
        const key = claimKey(u.id, recordClaimTexts(r)[c.claim - 1], c.conflicts || []);
        if (kept.has(key)) continue; // the instructor kept this claim as written: settled
        out.push({ kind: instructorAuthored(u, log) ? "fact-disputed" : "fact-check-own", units: [u.id], evidence: { claimKey: key, claimText: recordClaimTexts(r)[c.claim - 1], type: "conflict", dispatch: r.dispatch, claim: c.claim, conflicts: c.conflicts, quotes: c.quotes.map((q) => ({ source: q.source, quote: q.quote })),
          // the question the instructor reads (P11: the digest showed the bare kind)
          note: `The pinned sources disagree: the text says ${(c.conflicts || []).map((k) => `${k.claimed}, a source says ${k.source}${k.sentence ? ` ("${String(k.sentence).slice(0, 160)}")` : ""}`).join("; ")} — keep as written, or change it?` } });
      }
    }
  }

  for (const u of units.values()) {
    const fh = factHash(u.text), ch = claimsHash(u.text);
    const lead = leadOf(u, [...units.values()]);
    for (const e of (u.evidence || []).filter((x) => x.type === "quote-verified" && x.factHash === fh && x.claimsHash === ch)) {
      // evidence verified with another lead-in is stale, not wrong: it no longer counts, and the core obligation
      // (evidence-missing) routes the re-verification (red-team round 1, F13)
      const was = e.lead !== undefined ? e.lead : (byDispatch.get(e.dispatch) ? Object.values(recordLeads(byDispatch.get(e.dispatch)))[0] ?? null : null);
      if (was != null && String(was).replace(/\s+/g, " ") !== String(lead || "").replace(/\s+/g, " ")) continue;
      let problem = null;
      if (e.correction) {
        const c = corrections.get(e.correction);
        if (!c || c.status !== "applied" || c.unit !== u.id || c.after?.contentHash !== u.contentHash || !correctionLogged(c, log)) problem = "its correction is not an applied, logged correction of this text";
        else if (plain.size && !checkableClaims(u.text).every((cl) => supports(cl, e.quotes || []).ok)) problem = "its quotes do not support the corrected facts";
      } else {
        const r = byDispatch.get(e.dispatch);
        if (!r || !dispatchLogged(r, log)) problem = "its dispatch is not a logged dispatch";
        else if (r.unit !== u.id) problem = "its dispatch verified another unit";
        else if (!checksCurrentClaims(r, u.text, leadOf(u, [...units.values()]))) problem = "its dispatch checked other claims than the unit states";
        else if (plain.size) {
          const a = rederive(r, plain);
          // a dispute between pinned sources is a question (fact-disputed, raised above), never a defect (D12-F)
          if (a?.status !== "admitted" && a?.status !== "disputed") problem = "its dispatch does not admit when re-derived";
          else if (!sameQuotes(e.quotes, a.perClaim.flatMap((c) => (c.status === "supported" || c.status === "disputed" ? c.quotes || [] : [])))) problem = "its quotes are not the ones its dispatch admitted";
        }
      }
      if (problem) out.push({ kind: "evidence-unsupported", units: [u.id], evidence: { type: "rule", rule: "quote-verified evidence re-derives from a logged dispatch (or a logged correction) of the unit's current claims", dispatch: e.dispatch ?? null, problem } });
    }
  }
  return out;
}

export default {
  manifest: base({ name: "ms8-verdicts", serves: ["Confidence"], checkpoints: ["V3", "V8"], reads: ["units", "sources", "history", "log"], cost: "per recorded dispatch", profiles: ["public", "private"],
    emits: [
      { kind: "fact-contradicted", statusClass: "defect", evidenceType: "quote", route: "agent" },
      { kind: "fact-disputed", statusClass: "question", evidenceType: "conflict", route: "digest" },
      { kind: "fact-check-own", statusClass: "question", evidenceType: "conflict", route: "agent" },
      { kind: "knowledge-concern", statusClass: "question", evidenceType: "judgment", route: "digest" },
      { kind: "clarification-owed", statusClass: "question", evidenceType: "judgment", route: "agent" },
      { kind: "knowledge-unscorable", statusClass: "question", evidenceType: "judgment", route: "agent" },
      { kind: "clarification-proposed", statusClass: "question", evidenceType: "judgment", route: "digest" },
      { kind: "clarification-accepted", statusClass: "obligation", evidenceType: "missing", route: "agent" },
      { kind: "exercise-data-confirm", statusClass: "question", evidenceType: "judgment", route: "digest" },
      { kind: "absolute-overgeneral", statusClass: "question", evidenceType: "judgment", route: "agent" },
      { kind: "evidence-unsupported", statusClass: "defect", evidenceType: "rule", route: "agent" },
      { kind: "dispatch-unlogged", statusClass: "defect", evidenceType: "rule", route: "agent" },
      { kind: "dispatch-record-missing", statusClass: "defect", evidenceType: "rule", route: "agent" },
    ] }),
  run, recheck: recheckByRerun(run),
};
