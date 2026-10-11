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
//   instructor-edit-unasked (question)  the agent wrote a reviewer's suggestion into the instructor's text without their
//                                  answer (R4-K16): the concern's own question stays theirs too; keep the edit, or revert
//   evidence-unsupported (defect)  quote-verified evidence that does not re-derive: no dispatch record, a record that
//                                  does not admit, or quotes that do not carry the unit's current facts.
//   dispatch-unlogged / dispatch-record-missing (defect) a verification record the log does not vouch for, or a
//                                  logged dispatch whose record is gone (round P7-1).
// Verdicts concern the unit's CURRENT claims only: a record of other claims is history.
import { segmentDeliverable } from "../lib/core/segment.mjs";
import { factHash } from "../lib/core/dependencies.mjs";
import { checkableClaims, claimsHash } from "../lib/verify/claims.mjs";
import { supports } from "../lib/verify/admission.mjs";
import { boundRecord, readDispatches, readKnowledgeReview, reviewedPassage, settledBySuggestion, suggestionAt } from "../lib/verify/dispatch.mjs";
import { holdsInstructorText, originIndex, textIds } from "../lib/core/authorship.mjs";
import { tokensOf } from "../lib/core/segment.mjs";
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

function currentUnits(s, sides = []) {
  const out = new Map();
  for (const p of s.paths.filter((x) => x.startsWith("metadata/units/") && x.endsWith(".json")).sort()) {
    const side = s.json(p); if (!Array.isArray(side?.units) || typeof side.deliverable !== "string") continue; // malformed: the index reports it
    sides.push(side);
    const seg = segmentDeliverable(s.text(side.deliverable) || "", side.deliverable).units;
    if (seg.length !== side.units.length) continue; // out of date: units-not-indexed covers it
    side.units.forEach((u, i) => out.set(u.id, { ...u, form: seg[i].form, text: seg[i].text, contentHash: u.locator?.contentHash }));
  }
  return out;
}
// a reworded concern's words mostly still in this piece (a carried review: which piece took them over)
const held = (c, u) => { const q = tokensOf(c.text); if (q.length < 3) return false; const T = new Set(tokensOf(u.text)); return q.filter((x) => T.has(x)).length / q.length >= 0.6; };
const verbatimIn = (text, passage) => { const n = (t) => String(t || "").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim(); return !!n(text) && n(passage).includes(n(text)); };
const sameQuotes = (a, b) => JSON.stringify((a || []).map((q) => [q.source, q.span?.[0], q.span?.[1]]).sort()) === JSON.stringify((b || []).map((q) => [q.source, q.span?.[0], q.span?.[1]]).sort());

function run(s) {
  const out = [];
  const sides = [], units = currentUnits(s, sides);
  // whose text it is (red-team round 5, R5-K09/K10): one rule for every authorship question here — the unit's record,
  // the records of every unit whose text it holds (live or retired), and the log's confirmations (authorship.mjs)
  const ancestry = originIndex(sides);
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
  // did the instructor accept this question's suggestion ("apply …")? keyed by the finding it was asked as
  // asked of the unit, or of any unit whose text it holds: the instructor's answer follows their words through a split,
  // a merge or a move (red-team round 5), as their credit does
  const acceptedBy = (u, kind, evidence) => {
    const fids = new Set(textIds(u).map((id) => findingId({ module: "ms8-verdicts", kind, units: [id], evidence })));
    return log.some((l) => l.type === "answer" && l.party?.role === "instructor" && (l.payload?.answers || []).some((a) => fids.has(a.finding) && /^\s*apply/i.test(a.choice)));
  };
  const askedExercise = new Set(); // one question per unit, however many records read it as exercise data
  // Every record is read through what the log binds (red-team round 3, R3-K05/K08): a record logged before round 1 has
  // no recordHash, so its unit, contentHash, factHash and status are DERIVED from the logged prompt and answer
  // (dispatch.mjs boundRecord), never read from its editable fields.
  const bound = new Map(records.map((r) => [r, boundRecord(r, log)]));

  // ---- knowledge reviews (unit by unit, newest first in LOG order: a legacy record's `at` is unbound) -------------
  const reviewsOf = new Map();
  // open concerns travel with the text (red-team round 4, R4-K17): a reviewed unit split, merged or retired, whose
  // text came back as pieces, hands its review to every unit that took its text over (`lineage`, kept by the unit
  // index as the retired register keeps what it owed) — and there it speaks for the words the piece holds
  const heirs = new Map();
  for (const u of units.values()) for (const from of u.lineage || []) { if (!heirs.has(from)) heirs.set(from, []); heirs.get(from).push(u.id); }
  const add = (id, x) => { if (!reviewsOf.has(id)) reviewsOf.set(id, []); reviewsOf.get(id).push(x); };
  for (const r of records) {
    const b = bound.get(r);
    if (r.kind !== "knowledge" || !b || !b.contentHash) continue; // nothing counts through a field that cannot be derived
    if (units.has(b.unit)) add(b.unit, { r, b });
    else for (const id of heirs.get(b.unit) || []) add(id, { r, b, carried: true });
  }
  for (const [id, list] of reviewsOf) {
    const u = units.get(id), fh = factHash(u.text);
    list.sort((x, y) => y.b.seq - x.b.seq);
    const own = list.filter((x) => !x.carried);
    const fresh = own.filter((x) => x.b.contentHash === u.contentHash);
    if (fresh.length) {
      // a review that cannot be scored is said so, never read as a clean review (red-team round 2, R2-K10): an answer
      // that does not parse, or a concern quoting words the passage does not contain (even read as rendered)
      const { r } = fresh[0], k = readKnowledgeReview(r, u.text);
      if (!k.ok || k.unlocated.length)
        out.push({ kind: "knowledge-unscorable", units: [u.id], evidence: { type: "judgment", note: !k.ok ? `the blind review of ${u.id} cannot be read (${k.reason}): run it again (node scripts/verify.mjs knowledge --units ${u.id})` : `the blind review of ${u.id} raised a concern about words the passage does not contain ("${k.unlocated[0].text.slice(0, 120)}": ${k.unlocated[0].problem.slice(0, 200)}): it cannot be scored — run it again (node scripts/verify.mjs knowledge --units ${u.id})`, quote: k.unlocated[0]?.text ?? "", dispatch: r.dispatch } });
    }
    // which reviews speak for the unit: those of its current facts (factHash, derived for a legacy record), and always
    // its newest review — a rewrite that changes a fact token cannot silence the last review's concerns (R3-K06) — and
    // the reviews its text carried in from a split, merge or retired unit (R4-K17). But the NEWEST review of the
    // unit's current text (contentHash) speaks for the unit: every older review is history, whether or not its quoted
    // words remain (red-team round 4, R4-K15: an error fixed at its cause, "an inert gas" → "hydrogen", left the words
    // the reviewer quoted, and no clean fresh review could ever clear it). History means a review of OTHER text: a
    // review of the unit's current text keeps speaking whatever a later review of the same text says — re-running the
    // reviewer on unchanged text until it comes back clean clears nothing (round-4 integration); the instructor's
    // answer, or a change to the text, does
    const newestFresh = fresh.length ? fresh[0].b.seq : -Infinity;
    const speaking = list.filter((x) => (x.b.seq >= newestFresh || x.b.contentHash === u.contentHash) && (x.carried || x === own[0] || x.b.factHash === fh));
    // whose text it is, decided BEFORE whether a suggestion is in it (red-team round 4, R4-K16): on the instructor's
    // text a suggestion the agent wrote in unasked settles nothing — the question stays theirs (D35 (a), D31), and the
    // edit itself is raised (instructor-edit-unasked, below)
    const instructors = instructorAuthored(u, log, ancestry);
    // …and who changed it since the review: the agent's revisions are on record (revisedBy), or the record calls the
    // text the agent's own although it holds the instructor's words (a record written before round 5)
    const agentEdited = (b) => instructors && b.contentHash !== u.contentHash && ((u.origin?.revisedBy || []).length > 0 || (u.origin?.kind === "agent-knowledge" && holdsInstructorText(u, log, ancestry)));
    for (const { r, b, carried } of speaking) {
      const k = readKnowledgeReview(r, u.text);
      if (!k.ok) continue;
      const passage = reviewedPassage(r.bundle?.prompt);
      const unasked = agentEdited(b);
      // "settled by the text" (R3-K06): a "wrong" concern whose words are gone is settled only when a fresh review of
      // the unit's current text (contentHash) was made after it — a review that clears it — or its suggestion went in
      // place of its words and nothing else changed. A synonym swap ("raises" → "increases") is neither: it stays open.
      const clearedByFresh = fresh.some((x) => x.b.seq > b.seq);
      // a carried review speaks only for the words this piece holds: its other concerns went with the other pieces. A
      // concern whose words are gone from the piece is this piece's when the piece now has the suggestion where they
      // stood, or still holds most of their words reworded (red-team round 5, R5-K10: a split, then the instructor's
      // sentence rewritten to the suggestion, settled the concern as the agent's own and raised nothing)
      const settles = (c) => settledBySuggestion(c, passage, u.text, { piece: !!carried });
      // (a piece that is a verbatim part of the passage reviewed never held words that are not in it)
      const heldHere = (c) => !carried || suggestionAt(c, passage, u.text) || (held(c, u) && !verbatimIn(u.text, passage));
      const openGone = clearedByFresh ? [] : k.gone.filter((c) => heldHere(c) && (unasked || (c.kind === "wrong" && !settles(c))));
      for (const c of [...k.concerns, ...openGone]) {
        const evidence = { type: "judgment", note: c.problem, quote: c.text, suggestion: c.suggestion, dispatch: r.dispatch };
        if (c.kind === "wrong") {
          // the error is still in the words the reviewer quoted, or was reworded: open — unless the suggestion itself
          // extends the quoted words and the unit now carries it as the only change (R1 F12, R3-K06) in the agent's
          // own text, or the instructor accepted it (R4-K16)
          if (settles(c) && (!unasked || acceptedBy(u, "knowledge-concern", evidence))) continue;
          out.push({ kind: "knowledge-concern", units: [u.id], evidence }); continue;
        }
        // a clarification (the text is correct as meant): applied when the unit carries the suggestion and no longer
        // the quoted words, unless the suggestion extends them (P11; red-team round 1, F12) — read as written or rendered
        const proposed = { ...evidence, note: `Clarify: "${c.text}" → "${c.suggestion}". ${c.problem}` };
        const accepted = instructors && acceptedBy(u, "clarification-proposed", proposed);
        // applied: the suggestion stands where the quoted words stood (red-team round 5, R5-K11: a length threshold
        // decided this, and an accepted one-word clarification never settled)
        const applied = suggestionAt(c, passage, u.text);
        if (applied && (!unasked || accepted)) continue;
        if (!c.suggestion.trim()) { out.push({ kind: "knowledge-concern", units: [u.id], evidence }); continue; }
        if (!instructors) { out.push({ kind: "clarification-owed", units: [u.id], evidence }); continue; }
        // the instructor's text (D31 stands): proposed as a one-line diff; once accepted, applying it is the agent's job
        if (accepted) out.push({ kind: "clarification-accepted", units: [u.id], evidence: { type: "missing", what: `the clarification the instructor accepted, applied to ${u.id}: "${c.text}" → "${c.suggestion}" (their credit stays, D33)`, quote: c.text, suggestion: c.suggestion, dispatch: r.dispatch } });
        else out.push({ kind: "clarification-proposed", units: [u.id], evidence: proposed, recommendation: "apply" });
      }
    }
    // the edit itself (red-team round 4, R4-K16): a reviewer's suggestion the agent wrote into the instructor's text
    // without their answer is an unasked edit of their words (D31, D35 (a)) — raised whatever later reviews say, until
    // they accept the suggestion, or answer this (keep the edit, or have it reverted)
    const flagged = new Set();
    // …and from a review its text carried in from a split, merge or retired unit (red-team round 5, R5-K10): the
    // instructor's words are theirs in whichever piece they went to
    for (const { r, b, carried } of list.filter((x) => agentEdited(x.b))) {
      const k = readKnowledgeReview(r, u.text);
      if (!k.ok) continue;
      const passage = reviewedPassage(r.bundle?.prompt);
      for (const c of [...k.concerns, ...k.gone]) {
        if (!c.suggestion.trim() || flagged.has(`${c.text}|${c.suggestion}`)) continue;
        const carries = settledBySuggestion(c, passage, u.text, { piece: !!carried }) || suggestionAt(c, passage, u.text);
        if (!carries) continue;
        const evidence = { type: "judgment", note: c.problem, quote: c.text, suggestion: c.suggestion, dispatch: r.dispatch };
        // the instructor's "apply" to the same words → suggestion, asked from any review of the unit, is their answer
        const askedAs = (x) => { const e = { ...evidence, dispatch: x.r.dispatch }; return c.kind === "wrong" ? acceptedBy(u, "knowledge-concern", e) : acceptedBy(u, "clarification-proposed", { ...e, note: `Clarify: "${c.text}" → "${c.suggestion}". ${c.problem}` }); };
        if (list.some(askedAs)) continue;
        flagged.add(`${c.text}|${c.suggestion}`);
        out.push({ kind: "instructor-edit-unasked", units: [u.id], evidence: { type: "judgment", note: `Your text was edited without your answer: the agent wrote the reviewer's suggestion "${c.suggestion}" in place of "${c.text}" (${c.kind === "wrong" ? "a concern that it is wrong" : "a clarification"}: ${c.problem}). Keep the edit, or have it reverted?`, quote: c.text, suggestion: c.suggestion, dispatch: r.dispatch, revisedBy: (u.origin?.revisedBy || []).at(-1) || null }, recommendation: "keep" });
      }
    }
  }

  for (const r of [...records].sort((x, y) => String(y.at).localeCompare(String(x.at)))) {
    const b = bound.get(r), u = b && units.get(b.unit);
    if (!u || r.kind === "knowledge") continue;
    // a record bound whole is current at its factHash; a legacy record by what its prompt printed (below)
    if (b.hashed && b.factHash !== factHash(u.text)) continue;
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
        // the instructor kept this claim as written: settled — asked of this unit or of any unit whose text it holds
        if (textIds(u).some((id) => kept.has(claimKey(id, recordClaimTexts(r)[c.claim - 1], c.conflicts || [])))) continue;
        out.push({ kind: instructorAuthored(u, log, ancestry) ? "fact-disputed" : "fact-check-own", units: [u.id], evidence: { claimKey: key, claimText: recordClaimTexts(r)[c.claim - 1], type: "conflict", dispatch: r.dispatch, claim: c.claim, conflicts: c.conflicts, quotes: c.quotes.map((q) => ({ source: q.source, quote: q.quote })),
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
      { kind: "instructor-edit-unasked", statusClass: "question", evidenceType: "judgment", route: "digest" },
      { kind: "exercise-data-confirm", statusClass: "question", evidenceType: "judgment", route: "digest" },
      { kind: "absolute-overgeneral", statusClass: "question", evidenceType: "judgment", route: "agent" },
      { kind: "evidence-unsupported", statusClass: "defect", evidenceType: "rule", route: "agent" },
      { kind: "dispatch-unlogged", statusClass: "defect", evidenceType: "rule", route: "agent" },
      { kind: "dispatch-record-missing", statusClass: "defect", evidenceType: "rule", route: "agent" },
    ] }),
  run, recheck: recheckByRerun(run),
};
