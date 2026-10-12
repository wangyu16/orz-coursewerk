// Whose text is it? (red-team round 5, R5-K09/K10: authorship was per unit id, and a split or a merge minted new ids
// with the agent's origin, so the instructor's words lost their protection the moment the agent inserted one blank
// line.) Ownership follows the TEXT, not the id: a unit that holds words the instructor wrote — its own record says so,
// or it took text over from a unit that was the instructor's (`lineage`: the pieces of a split, a merge, a piece or a
// near return of a retired unit, a neighbour that absorbed a retired unit's words; the retired-unit register keeps
// every such unit's record), or the instructor's logged authorship confirmation names it or any unit whose text it
// holds — is the instructor's. The rule is deliberately the conservative one: a unit holding the instructor's words
// and the agent's is treated as the instructor's (their protection reaches the agent's words in it, never the reverse).
//
// EVERY consumer of authorship asks this module: the correction guard's two-source rule (verdicts.mjs), D35 acceptance
// and instructor-edit-unasked (MS8), the instructor's answers keyed by unit (claim keys, asked changes), and the
// assessment-fidelity question (MS9). The unit index stamps the same rule into a new unit's origin when it is minted
// (units_index.mjs), so the record and the rule agree; the rule still reads lineage, so a record written before this
// rule (or one whose origin a caller tried to change) cannot drop the instructor's credit.

import { sha256 as sha256Text } from "../records/canonical.mjs";
import { meaningKey, meaningKeyTokens, printedChars, readerView, renderedParts } from "./rendered.mjs";
import { directionReversal, directionWords, factTokens } from "./change.mjs";

/** Every id whose text the unit holds: its own, and every unit it took text over from (for good). */
export const textIds = (u) => [...new Set([u?.id, ...(u?.lineage || [])].filter(Boolean))];

/** id → origin, for every unit a set of sidecars records: live units and the retired-unit register. */
export function originIndex(sidecars) {
  const m = new Map();
  for (const side of sidecars || []) {
    for (const u of side?.units || []) if (u?.id && u.origin) m.set(u.id, u.origin);
    for (const e of side?.retired || []) if (e?.id && e.origin && !m.has(e.id)) m.set(e.id, e.origin);
  }
  return m;
}

const confirmsInstructor = (l, ids) => l.type === "authorship-confirmation" && l.party?.role === "instructor" &&
  ((Array.isArray(l.payload?.units) && l.payload.units.some((id) => ids.includes(id)) && (l.payload.as || "instructor") === "instructor") ||
    (l.payload?.initial && l.payload?.origin?.kind === "instructor-authored"));

/**
 * Was any of this unit's text written by the instructor? Its record, the record of any unit whose text it holds
 * (`ancestry`: id → origin, originIndex of the package's sidecars), or the log's authorship confirmations naming it or
 * any of those units — a sidecar edit cannot remove it (B16), nor can a split, a merge or a move.
 */
export function instructorAuthored(unit, logRecords = [], ancestry = null) {
  if (unit?.origin?.kind === "instructor-authored") return true;
  const ids = textIds(unit);
  if (ancestry && ids.some((id) => ancestry.get(id)?.kind === "instructor-authored")) return true;
  return (logRecords || []).some((l) => confirmsInstructor(l, ids));
}

/**
 * The origin a newly minted unit takes from the units whose text it holds (`sources`: the unit a split came from, the
 * units of a merge, a retired unit it is a piece of or covers). The instructor's credit goes first and is never lost; a
 * source's citation (source-derived) next. `revision`: the agent's session, recorded as a revision of their text
 * (operator, 2026-10-02: "keep crediting me is fine"). Returns null when no source's origin passes on.
 */
export function inheritedOrigin(sources, revision = null) {
  const pick = sources.find((o) => o?.origin?.kind === "instructor-authored") || sources.find((o) => o?.origin?.kind === "source-derived");
  if (!pick) return null;
  const o = pick.origin;
  return revision ? { ...o, revisedBy: [...(o.revisedBy || []), revision] } : { ...o };
}

/** id → { instructor, date } for every unit the instructor's logged authorship confirmations name (a verifying log). */
export function confirmedAuthorship(logRecords) {
  const m = new Map();
  for (const l of logRecords || []) if (l.type === "authorship-confirmation" && l.party?.role === "instructor" && Array.isArray(l.payload?.units) && (l.payload.as || "instructor") === "instructor")
    for (const id of l.payload.units) m.set(id, { instructor: l.party.name, date: String(l.at || "").slice(0, 10) || "unknown" });
  return m;
}
/**
 * The instructor's credit a unit record carries for its text — its own origin, or the origin (or the logged
 * confirmation) of any unit whose text it holds — as an origin record; or null. Used by the unit index, so a unit's
 * record says what the rule says.
 */
export function instructorCredit(o, ancestry = new Map(), confirmed = new Map()) {
  if (!o) return null;
  if (o.origin?.kind === "instructor-authored") return o.origin;
  for (const id of textIds(o)) {
    if (ancestry.get(id)?.kind === "instructor-authored") return ancestry.get(id);
    if (confirmed.has(id)) return { kind: "instructor-authored", ...confirmed.get(id) };
  }
  return null;
}

/** Does the unit hold text taken over from a unit that was the instructor's (by lineage: record or confirmation)? */
export function holdsInstructorText(unit, logRecords = [], ancestry = new Map()) {
  return !!instructorCredit({ id: null, origin: null, lineage: unit?.lineage || [] }, ancestry, confirmedAuthorship(logRecords));
}

// ---- THE INSTRUCTOR'S TEXT IS PROTECTED ON THE TEXT, WHATEVER ROUTE CHANGES IT (red team R6, R6-K02/K03) -------------
// Round 6 found the instructor's words guarded along single routes: the two-source rule inside applyCorrection, the
// unasked-edit question only when the new words were a reviewer's suggestion. An agent session that hand-edited their
// value, or rewrote their sentence in its own words, reached the same outcome with nothing raised. The protection now
// lives on the text: the instructor's text is REGISTERED (the log), and every agent change to it is read against that
// register in the reader view, however it was made.
//
// THE REGISTER (instructorTextRegister): reference id → the instructor's text, from the log, in order —
//   - the instructor's acts, which set it: their authorship confirmation ("accept as mine", claimAuthorship: the text
//     they accepted), their "keep" on an unasked edit (digest: the text they kept);
//   - a correction that passed the guard (two independent agreeing sources, logged, its diff shown): the corrected value
//     replaces the old one in the register; the instructor's revert of it puts their value back;
//   - the baseline the harness records when an agent session begins, for every unit holding the instructor's text that
//     the register does not yet hold, at its indexed text (the migration: a package from before R6 is registered as it
//     stands at its first session; an instructor's text never registered is registered before the agent can change it).
//     A baseline never replaces a registered text.
//
// THE RULE (D17, D31, D33, D35, D40; operator 2026-10-02 "keep crediting me is fine"), instructorTextChange:
//   - the instructor's registered text is compared with the text of every live unit holding it (lineage: one unit, the
//     pieces of a split, a merge), in the READER VIEW — the meaning key (rendered.mjs);
//   - an edit that changes no meaning (the meaning key unchanged: reflow, markup, typesetting, punctuation, the capital
//     of a sentence start) is allowed silently, and the instructor keeps the credit (D17 "accepted silently", D33);
//   - a change of meaning — a changed, removed or inserted sentence of theirs: a word, a value, a direction, a negation —
//     raises THEIR question (instructor-edit-unasked: digest, never blocking; D31 "the agents never edit the
//     instructor's words unasked"). Words the agent joined to theirs from its own text (a merge) are not their words;
//   - a change that also changes a FACT (a sentence of theirs rewritten with other fact tokens: a value, a number, a
//     name, a symbol, a negation — what factHash reads) needs what the correction path needs: two independent agreeing
//     sources and a logged correction with its diff shown. A hand edit has neither, so it is a blocking agent
//     obligation (instructor-fact-changed): revert it, or route it through the correction path (applyCorrection), or
//     the instructor keeps it. A DIRECTION REVERSAL in a rewritten sentence of theirs ("lowers" → "raises",
//     "endothermic" → "exothermic": change.mjs directionReversal) is a changed fact the same way (D49, operator
//     2026-10-12); a sentence or paragraph of theirs only deleted stays their question;
//   - what the instructor asked for is not unasked: a reviewer's suggestion they accepted (D35), a change they asked
//     for on a disputed claim (D40, instructor-change-owed), a guarded correction (above).
// An edit outside an agent session is not read here: it is an edit of unknown authorship, already the instructor's
// question (D20); once they answer, the register follows their answer.

/**
 * WHAT THE INSTRUCTOR SAW, as a confirmation binds it (red team R6, R6-K04): the words and symbols of the reader-view
 * meaning key (rendered.mjs; a formula is one token) as a multiset, and the direction words in order. Every word, sign,
 * symbol, formula or negation a reader sees is in it — "exothermic … lowers" → "endothermic … raises", a struck "not",
 * another subject all change it — while markup, typesetting, punctuation, a sentence-start capital and a reordering
 * rephrase ("Ice melts at 0 °C at 1 atm." → "At 1 atm, ice melts at 0 °C.") do not (D17: a meaning-preserving
 * rephrase is accepted silently). A swap of direction words ("fewer … more" → "more … fewer") changes it (as the
 * spine's rephrasing rule reads them, change.mjs). Known limit: a swap of two plain nouns ("A converts to B" → "B
 * converts to A") keeps every token.
 */
export const seenKey = (text) => sha256Text(JSON.stringify([[...meaningKeyTokens(text)].sort(), directionWords(readerView(text))]));

/** A source text as its sentences and lines (a table row, a list item, a display formula), never split inside maths. */
export function sentencesOf(text) {
  const s = String(text ?? ""), out = [];
  let cur = "", math = null;
  const push = () => { const t = cur.trim(); if (t) out.push(t); cur = ""; };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && i + 1 < s.length) { cur += ch + s[i + 1]; i++; continue; }
    if (ch === "$") { const tok = s[i + 1] === "$" ? "$$" : "$"; if (!math) math = tok; else if (math === tok) math = null; cur += tok; i += tok.length - 1; continue; }
    if (!math && ch === "\n") { push(); continue; }
    cur += ch;
    if (!math && /[.!?]/.test(ch) && /\s/.test(s[i + 1] ?? "")) push();
  }
  push();
  return out;
}

const multiset = (xs) => JSON.stringify([...xs].sort());
// the fact tokens a reader sees (as dependencies.mjs unitTargetHash reads them): markup, struck and hidden text gone,
// each formula as its TeX source — so "*Ammonia* synthesis" and "Ammonia synthesis" state the same facts
const factView = (raw) => renderedParts(raw).map((p) => (p.kind === "math" ? ` $${p.text}$ ` : p.kind === "mark" ? "" : p.kind === "prose" ? printedChars(p.seen) : p.text)).join("").replace(/[ \t]+/g, " ").replace(/ *\n+ */g, "\n").trim();
const seenFacts = (sentences) => factTokens(sentences.map(factView).join(" "));
/**
 * What changed in the instructor's registered text `before`, now held as `after` (the joined text of every unit holding
 * it). `joined`: the units also hold text that was never theirs (a merge, a neighbour that took their words in), so
 * sentences added before or after theirs are not counted. `asked`: (removedSentences) → true when the instructor asked
 * for that change. Returns null when no meaning changed, else { removed, added, factChange, facts: { from, to } }.
 */
export function instructorTextChange(before, after, { joined = false, asked = () => false } = {}) {
  if (meaningKey(before) === meaningKey(after)) return null;
  const R = sentencesOf(before).map((t) => ({ t, k: meaningKey(t) })), C = sentencesOf(after).map((t) => ({ t, k: meaningKey(t) }));
  // longest common subsequence of sentence keys
  const L = Array.from({ length: R.length + 1 }, () => new Array(C.length + 1).fill(0));
  for (let i = R.length - 1; i >= 0; i--) for (let j = C.length - 1; j >= 0; j--) L[i][j] = R[i].k === C[j].k ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = [];
  for (let i = 0, j = 0; i < R.length || j < C.length;) {
    if (i < R.length && j < C.length && R[i].k === C[j].k) { ops.push({ op: "=" }); i++; j++; }
    else if (j < C.length && (i >= R.length || L[i][j + 1] >= L[i + 1][j])) ops.push({ op: "+", s: C[j++] });
    else ops.push({ op: "-", s: R[i++] });
  }
  // blocks of change between kept sentences
  const blocks = [];
  ops.forEach((o, n) => { if (o.op === "=") return; const last = blocks.at(-1); if (last && last.end === n - 1) { last.ops.push(o); last.end = n; } else blocks.push({ start: n, end: n, ops: [o] }); });
  const removed = [], added = [], from = [], to = [];
  let factChange = false;
  const firstR = ops.findIndex((o) => o.op !== "+"), lastR = ops.length - 1 - [...ops].reverse().findIndex((o) => o.op !== "+");
  for (const b of blocks) {
    const del = b.ops.filter((o) => o.op === "-").map((o) => o.s.t), ins = b.ops.filter((o) => o.op === "+").map((o) => o.s.t);
    // sentences only added before or after all of theirs, where the units hold other text too: not their words
    if (!del.length && joined && (firstR < 0 || b.end < firstR || b.start > lastR)) continue;
    if (del.length && asked(del)) continue;
    removed.push(...del); added.push(...ins);
    // a sentence of theirs REWRITTEN (removed and replaced in one place) with other fact tokens is a changed fact
    if (del.length && ins.length) {
      const f0 = seenFacts(del), f1 = seenFacts(ins);
      if (multiset(f0) !== multiset(f1)) { factChange = true; from.push(...f0.filter((x) => !f1.includes(x))); to.push(...f1.filter((x) => !f0.includes(x))); }
      // a direction turned round is a changed fact too (D49): "raising the temperature lowers K" → "… raises K"
      const rev = directionReversal(del.map(factView).join(" "), ins.map(factView).join(" "));
      if (rev) { factChange = true; from.push(...rev.from); to.push(...rev.to); }
    }
  }
  if (!removed.length && !added.length) return null;
  return { removed, added, factChange, facts: { from: [...new Set(from)], to: [...new Set(to)] } };
}

/**
 * The register: reference id → { text, seq, by } (see above). `corrections`: id → correction record; a correction moves
 * the register only when its record matches its logged autocorrect record (the caller's `correctionOk`).
 */
export function instructorTextRegister(logRecords, { corrections = new Map(), correctionOk = () => false } = {}) {
  const reg = new Map();
  const put = (id, text, seq, by) => { if (typeof id === "string" && typeof text === "string") reg.set(id, { text, seq, by }); };
  const swap = (from, to, seq, by) => {
    for (const [id, r] of reg) {
      if (from && r.text.includes(from)) put(id, r.text.replace(from, () => to), seq, by);
      else if (meaningKey(r.text) === meaningKey(from)) put(id, to, seq, by);
    }
  };
  for (const l of logRecords || []) {
    const p = l.payload || {}, seq = l.seq ?? 0;
    const instructor = l.party?.role === "instructor";
    if (instructor && l.type === "authorship-confirmation" && p.texts && typeof p.texts === "object" && (p.as || "instructor") === "instructor")
      for (const [id, t] of Object.entries(p.texts)) put(id, t, seq, "instructor");
    else if (l.type === "revision" && p.event === "instructor-text-baseline" && l.party?.role === "harness" && p.texts && typeof p.texts === "object")
      for (const [id, t] of Object.entries(p.texts)) { if (!reg.has(id)) put(id, t, seq, "baseline"); }
    else if (l.type === "revision" && p.event === "autocorrect") {
      const c = corrections.get(p.correction);
      if (c && correctionOk(c, l)) swap(c.before.text, c.after.text, seq, "correction");
    } else if (l.type === "divergence" && instructor) {
      const c = corrections.get(p.correction);
      if (c && correctionOk(c, null)) swap(c.after.text, c.before.text, seq, "instructor");
    }
  }
  return reg;
}

/**
 * Every live unit holding each registered text, in document order: reference id → [unit]. `units`: the live units in
 * document order (each with id, lineage).
 */
export function holdersOf(register, units) {
  const out = new Map([...register.keys()].map((id) => [id, []]));
  for (const u of units) for (const id of textIds(u)) if (out.has(id)) out.get(id).push(u);
  return out;
}
/** Do these units hold text besides the registered text `ref` (a merge, or a neighbour that took their words in)? */
export function holdOtherText(ref, holders) {
  return holders.some((u) => (u.lineage || []).some((id) => id !== ref) || (u.id !== ref && !u.splitFrom && !(u.mergedFrom || []).length && !(u.inheritedFrom || []).length));
}
