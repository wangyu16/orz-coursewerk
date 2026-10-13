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
import { meaningKey, meaningKeyTokens, readerView, readingKey, readingText } from "./rendered.mjs";
import { directionReversal, directionWords, factSequence } from "./change.mjs";

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
//     pieces of a split, a merge) AS A WHOLE, IN READING ORDER, on the reader view with its sentence punctuation kept —
//     the reading key (rendered.mjs readingKey; red team R7 cause 1, D50 "punctuation is meaningful in the instructor's
//     text");
//   - an edit that changes no reading (reflow, markup, typesetting — prose "ΔH = -92.2 kJ" or the same in LaTeX, "-" or
//     "−", Δ or ∆ — quotation marks, the capital of a sentence start, a paragraph break between two sentences) is
//     allowed silently, and the instructor keeps the credit (D17 "accepted silently", D33);
//   - any other change is a change of meaning — a changed, removed, inserted or MOVED sentence of theirs, a word, a
//     value, a direction, a negation, a moved full stop or comma that re-attaches a condition (R7-K10) — and raises THEIR
//     question (instructor-edit-unasked: digest, never blocking; D31 "the agents never edit the instructor's words
//     unasked"). Words the agent joined to theirs from its own text (a merge) are not their words;
//   - a change that also changes a FACT needs what the correction path needs: two independent agreeing sources and a
//     logged correction with its diff shown. A hand edit has neither, so it is a blocking agent obligation
//     (instructor-fact-changed): revert it, or route it through the correction path (applyCorrection), or the
//     instructor keeps it. A fact changes when a sentence of theirs and what replaced it — in place, or moved anywhere
//     in their text (R7-K01) — differ in a value, a number, a name, a symbol or a negation (read on the reading, so
//     typesetting is no change: R7-K07), or in WHICH VALUE GOES WITH WHAT IT DESCRIBES (factPairingChange: two values
//     swapped between the quantities they belong to, R7-K02). A DIRECTION REVERSAL ("lowers" → "raises", "endothermic"
//     → "exothermic": change.mjs directionReversal) is a changed fact the same way (D49, operator 2026-10-12); a
//     sentence or paragraph of theirs only deleted stays their question;
//   - what the instructor asked for is not unasked: a reviewer's suggestion they accepted (D35), a change they asked
//     for on a disputed claim (D40, instructor-change-owed), a guarded correction (above).
// An edit outside an agent session is not read here: it is an edit of unknown authorship, already the instructor's
// question (D20); once they answer, the register follows their answer.

/**
 * WHAT THE INSTRUCTOR SAW, as a confirmation binds it (red team R6, R6-K04; R7-K03, D50): THE READING KEY of the text
 * (rendered.mjs readingKey) — the words and symbols a reader sees IN ORDER, with the sentence punctuation that structures
 * them, typesetting folded. Every word, sign, symbol, formula or negation a reader sees, and their order, is in it:
 * "exothermic … lowers" → "endothermic … raises", a struck "not", another subject, two values swapped between the
 * quantities they belong to ("25 to 35 bar … 60 to 180 bar" → "60 to 180 bar … 25 to 35 bar"), a moved full stop all
 * change it; markup, a reflow, typesetting (prose "ΔH = -92.2 kJ" and "$\Delta H = -92.2\ \text{kJ}$") and a
 * sentence-start capital do not. Prefixed "o:"; a seen key logged before R7 (an order-free hash: 64 hex digits) is
 * read by obligations.mjs instructorActsOf (the migration).
 */
export const seenKey = (text) => `o:${sha256Text(readingKey(text))}`;
/** The seen key as R6 logged it (the meaning-key tokens as a multiset, the direction words in order). FROZEN: only read to migrate. */
export const seenKeyR6 = (text) => sha256Text(JSON.stringify([[...meaningKeyTokens(text)].sort(), directionWords(readerView(text))]));

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
// a line that starts a block of its own (a table row, a list item, a heading, a quote, a display formula, after a blank
// line); any other line break is a reflow inside a paragraph, read as a space
const BLOCK_LINE = /^\s*(?:\||#|>|[-*+]\s|\d+[.)]\s|\$\$|:::)/;
/** The sentences of a text as a reader reads them: a line break inside a paragraph joins, a block break splits. */
export function readSentencesOf(text) {
  const lines = String(text ?? "").split("\n"), joined = [];
  for (const l of lines) {
    const prev = joined.length ? joined[joined.length - 1] : null;
    if (prev !== null && prev.trim() && l.trim() && !BLOCK_LINE.test(l) && !BLOCK_LINE.test(prev)) joined[joined.length - 1] = `${prev} ${l.trim()}`;
    else joined.push(l);
  }
  return sentencesOf(joined.join("\n"));
}

// ---- comparing the instructor's text in order (red team R7, cause 1; D50) --------------------------------------------
// A value belongs to the clause it is written in. A clause ends at clause punctuation or a conjunction that opens a new
// clause; its CONTEXT is its content words. A fact of theirs is RE-ATTACHED when, in the new text, the words around it
// are those of another clause of theirs more than its own: "the steam reforming steps … 25 to 35 bar, while the
// synthesis loop … 60 to 180 bar" → "… steam reforming steps … 60 to 180 bar, while the synthesis loop … 25 to 35 bar".
const CLAUSE_BREAK = /\s(?:[,;:()\[\]—.!?\n]|while|whilst|whereas|but|although|though|and|or|which|where|when|whereby|because|since|unless|if|so)(?=\s|$)/giu;
const STOP = new Set(["the", "and", "for", "with", "that", "this", "these", "those", "are", "was", "were", "has", "have", "had", "its", "from", "into", "about", "than", "then", "also", "such", "can", "may", "will", "each", "both", "all", "any", "per", "via", "not", "but", "out", "one", "two", "very", "more", "less"]);
const contextWords = (s) => new Set((s.toLowerCase().match(/\p{L}{2,}/gu) || []).filter((w) => w.length >= 3 && !STOP.has(w)));
const jaccard = (a, b) => { if (!a.size && !b.size) return 0; let n = 0; for (const w of a) if (b.has(w)) n++; return n / (a.size + b.size - n); };
/** A passage (sentences in order) as its facts in reading order, each with the clause it sits in; and those clauses. */
function readFacts(sentences) {
  const facts = [], clauses = [];
  for (const s of sentences) {
    const rt = readingText(s).replace(/[\n|]/g, " . "), cuts = [0, ...[...rt.matchAll(CLAUSE_BREAK)].map((m) => m.index + 1), rt.length];
    const base = clauses.length;
    for (let i = 0; i + 1 < cuts.length; i++) clauses.push(contextWords(rt.slice(cuts[i], cuts[i + 1]).replace(/[\p{N}]/gu, " ")));
    for (const f of factSequence(rt)) {
      let c = 0; while (c + 2 < cuts.length && cuts[c + 1] <= f.at) c++;
      facts.push({ ...f, clause: base + c });
    }
  }
  return { facts, clauses };
}
const bag = (xs) => { const m = new Map(); for (const x of xs) m.set(x, (m.get(x) || 0) + 1); return m; };
const bagMinus = (a, b) => { const B = bag(b), out = []; for (const x of a) { if (B.get(x)) B.set(x, B.get(x) - 1); else out.push(x); } return out; };
/**
 * The facts of a passage of theirs (`del`, its sentences in order) against what replaced it (`ins`): null when every
 * fact is kept and stays with what it described; else { from, to }. A value, name, symbol or negation changed, added or
 * dropped is a changed fact; so is one RE-ATTACHED — moved to another clause of theirs (above), or, where the words
 * around it cannot tell (no context, or a tie), a reorder of facts of one kind (fail closed: a swap is a changed fact
 * unless the words show the pairing kept).
 */
export function factPairingChange(del, ins) {
  const B = readFacts(del), A = readFacts(ins);
  const tb = B.facts.map((f) => f.tok), ta = A.facts.map((f) => f.tok);
  const gone = bagMinus(tb, ta), come = bagMinus(ta, tb);
  if (gone.length || come.length) return { from: gone, to: come };
  const moved = [];
  const nth = (list) => { const m = new Map(); return list.map((f) => { const k = (m.get(f.tok) || 0); m.set(f.tok, k + 1); return k; }); };
  const kB = nth(B.facts), kA = nth(A.facts);
  const ambiguous = new Set();
  A.facts.forEach((a, j) => {
    const i = B.facts.findIndex((b, x) => b.tok === a.tok && kB[x] === kA[j]);
    const ctx = A.clauses[a.clause], own = jaccard(ctx, B.clauses[B.facts[i].clause]);
    const sims = B.clauses.map((c) => jaccard(ctx, c)), best = Math.max(...sims);
    if (best > own + 1e-9) moved.push(a.tok);
    else if (best === 0 || sims.filter((x) => Math.abs(x - best) < 1e-9).length > 1) ambiguous.add(a.kind);
  });
  if (moved.length) return { from: B.facts.filter((f) => moved.includes(f.tok)).map((f) => f.tok), to: [...new Set(moved)].map((t) => `${t} (moved to another clause)`) };
  for (const kind of ambiguous) {
    const sb = B.facts.filter((f) => f.kind === kind).map((f) => f.tok), sa = A.facts.filter((f) => f.kind === kind).map((f) => f.tok);
    if (JSON.stringify(sb) !== JSON.stringify(sa)) return { from: [sb.join(" … ")], to: [`${sa.join(" … ")} (reordered)`] };
  }
  return null;
}

// the content words of a sentence, for pairing a removed sentence of theirs with the one that replaced it elsewhere
const words = (t) => new Set(String(t || "").toLowerCase().match(/\p{L}{4,}/gu) || []);
const overlap = (a, b) => { const A = words(a), B = words(b); let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.max(1, Math.min(A.size, B.size)); };
/**
 * What changed in the instructor's registered text `before`, now held as `after` (the joined text of every unit holding
 * it), compared AS A WHOLE, IN READING ORDER (red team R7, cause 1; D50): the reading key (rendered.mjs readingKey —
 * the reader view in order, sentence punctuation kept, typesetting folded). `joined`: the units also hold text that was
 * never theirs (a merge, a neighbour that took their words in), so sentences added before or after theirs are not
 * counted — unless one replaces a sentence of theirs (it shares their words). `asked`: (removedSentences) → true when
 * the instructor asked for that change. Returns null when the reading is unchanged, else { removed, added, factChange,
 * facts: { from, to } }.
 *   - any change of the reading is a change of meaning: a word, a value, a moved sentence, a moved full stop;
 *   - a FACT changes (factChange) when a removed sentence of theirs and what replaced it — in the same place, or moved
 *     anywhere in their text (they share its words) — differ in a value, name, symbol or negation, in which value goes
 *     with which clause (factPairingChange), or in a direction (D49).
 */
export function instructorTextChange(before, after, { joined = false, asked = () => false } = {}) {
  if (readingKey(before) === readingKey(after)) return null;
  const R = readSentencesOf(before).map((t) => ({ t, k: readingKey(t) })), C = readSentencesOf(after).map((t) => ({ t, k: readingKey(t) }));
  // longest common subsequence of sentence readings
  const L = Array.from({ length: R.length + 1 }, () => new Array(C.length + 1).fill(0));
  for (let i = R.length - 1; i >= 0; i--) for (let j = C.length - 1; j >= 0; j--) L[i][j] = R[i].k === C[j].k ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = [];
  for (let i = 0, j = 0; i < R.length || j < C.length;) {
    if (i < R.length && j < C.length && R[i].k === C[j].k) { ops.push({ op: "=" }); i++; j++; }
    else if (j < C.length && (i >= R.length || L[i][j + 1] >= L[i + 1][j])) ops.push({ op: "+", s: C[j], at: j++ });
    else ops.push({ op: "-", s: R[i], at: i++ });
  }
  // blocks of change between kept sentences
  const blocks = [];
  ops.forEach((o, n) => { if (o.op === "=") return; const last = blocks.at(-1); if (last && last.end === n - 1) { last.ops.push(o); last.end = n; } else blocks.push({ start: n, end: n, ops: [o] }); });
  const firstR = ops.findIndex((o) => o.op !== "+"), lastR = ops.length - 1 - [...ops].reverse().findIndex((o) => o.op !== "+");
  // every removed and added sentence counted, with its block; an added block outside theirs (joined) is provisional
  const dels = [], adds = [];
  blocks.forEach((b, n) => {
    const del = b.ops.filter((o) => o.op === "-"), ins = b.ops.filter((o) => o.op === "+");
    if (del.length && asked(del.map((o) => o.s.t))) return;
    const outside = !del.length && joined && (firstR < 0 || b.end < firstR || b.start > lastR);
    dels.push(...del.map((o) => ({ ...o, block: n })));
    adds.push(...ins.map((o) => ({ ...o, block: n, outside })));
  });
  // a removed sentence and an added one are one passage when they stand in one block, or share their words (a sentence
  // of theirs moved and rewritten: R7-K01); passages are the connected groups
  const nodes = [...dels, ...adds], parent = nodes.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  dels.forEach((d, i) => adds.forEach((a, j) => {
    if (d.block === a.block || overlap(d.s.t, a.s.t) >= 0.5) parent[find(i)] = find(dels.length + j);
  }));
  const groups = new Map();
  nodes.forEach((x, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, { del: [], ins: [] }); groups.get(g)[x.op === "-" ? "del" : "ins"].push(x); });
  const removed = [], added = [], from = [], to = [];
  let factChange = false;
  for (const g of groups.values()) {
    // sentences only added outside theirs, replacing none of theirs: not their words
    if (!g.del.length && g.ins.every((x) => x.outside)) continue;
    const del = g.del.sort((a, b) => a.at - b.at).map((o) => o.s.t), ins = g.ins.sort((a, b) => a.at - b.at).map((o) => o.s.t);
    removed.push(...del); added.push(...ins);
    if (!del.length || !ins.length) continue; // only deleted, or only added inside theirs: their question
    const fc = factPairingChange(del, ins);
    if (fc) { factChange = true; from.push(...fc.from); to.push(...fc.to); }
    // a direction turned round is a changed fact too (D49): "raising the temperature lowers K" → "… raises K"
    const rev = directionReversal(del.map(readingText).join(" "), ins.map(readingText).join(" "));
    if (rev) { factChange = true; from.push(...rev.from); to.push(...rev.to); }
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
