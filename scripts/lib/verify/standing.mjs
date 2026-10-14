// WHICH REVIEW RESULT STANDS (red team R6, cause "reviewer shopping"; D46). A blind review is a stochastic reader: run
// it twice on the same text and it may answer twice differently. Wherever such a review decided an outcome, the NEWEST
// review won — so re-running the reviewer on unchanged text until it came back favourable cleared a concern
// (R6-C4-01: a clean re-run of the D39 spine review), bought a "yes" over an honest "no" (R6-C1-01: a link review), or,
// after an edit nobody can see (R6-K10: a TeX regrouping), cleared a knowledge concern. ONE rule now decides, for every
// review kind that decides an outcome — knowledge, spine (D39 concerns and the D43 meaning answer), link and framing
// (alignment, with its assessment fidelity), absolute statements, and the semi-mechanical fact check:
//
//   1. Currency is judged on the READER VIEW (rendered.mjs meaningKey): a review stays current while what a reader is
//      shown of what it judged is unchanged. An edit invisible in the reader view never counts as a change, so it
//      neither voids an adverse result nor makes a fresh clean review "of new text".
//   2. Between current reviews — reviews of the same reader-view text — the CONSERVATIVE reading stands, item by item:
//      an adverse answer (a concern, a "no" or "passing", "differs", contradicted or disputed, a meaning "changed",
//      off the plan) outranks a clean one, whatever their order. A later review never overrides an earlier adverse
//      result of the same text.
//   3. An adverse result is cleared only by a real change to the text (the earlier review is no longer current, and a
//      fresh review of the new text speaks) or by the instructor's answer (each consumer's own answer path: an answered
//      question, a full approval of the spine, a confirmation).
//   4. A review that cannot be read is no result: it neither clears nor raises (its consumer says it is unscorable).
//
// BOUND TO WHAT IT JUDGED (red team R7, cause 2; D50). Rule 1 was read on the WHOLE subject — the unit's reader view and
// the set of items a review judged — so a change that had nothing to do with a judgment started it fresh (a second link
// added to a unit made an honest "no" for another objective history: R7 C2-L1; one word edited in another sentence made
// a "wrong" concern history: R7-K04), while a change that did matter left it standing (an overrule outlived a
// substantive change of the objective it judged: R7 C2-L2). Currency is now judged ITEM BY ITEM, on exactly what each
// answer judged (`itemCurrent`): a link verdict for O on the passage's reader view and O's own text — never on which
// other links the unit has; a concern on the words it quoted, in their sentence, as a reader sees them — never on the
// other sentences of the unit (`concernStands`); a spine concern or meaning answer on its own line. The review-level
// `current` says only whether a review is of the same subject at all (the same passage, the same approval baseline).
//
// Disagreement is not a question of its own: the adverse result already raises its finding, routed where it always
// was, and that finding says the reviews of the same text disagreed (`disagreed`). A separate question would let
// re-runs manufacture instructor questions, and would ask the same thing twice; the remedy is the same either way —
// change the text, or have the instructor answer.
import { meaningKey } from "../core/rendered.mjs";
import { checkableClaims } from "./claims.mjs";
import { sentencesOf } from "../core/authorship.mjs";
import { quoteIn } from "./dispatch.mjs";

/** The reader-view key of a text (what binds a review's currency): rendered.mjs meaningKey. */
export const readerKey = (text) => meaningKey(String(text ?? ""));
/** Do two texts show a reader the same thing? */
export const sameReaderView = (a, b) => readerKey(a) === readerKey(b);

/**
 * THE STANDING RULE, the one function every review consumer reads its reviews through.
 *   reviews   every logged review of one subject (a unit, a spine scope), each with a numeric `seq` (log order)
 *   current   (review) → is it a review of what a reader is shown now (reader-view currency, rule 1)?
 *   items     (review) → [[key, answer], …] the answers it gives, item by item, or null when it cannot be read
 *   rank      (answer, key) → 0 for a clean answer, > 0 for an adverse one (higher: more adverse), null for no answer
 *   itemCurrent (review, key, answer) → is this answer still about what it judged (R7, cause 2)? Default: every
 *             answer of a current review is current. An answer that is not current is no answer (as if not given).
 * Returns {
 *   current   the current reviews, newest first (readable or not: a consumer reports the newest unreadable one);
 *   readable  the current reviews that can be read, newest first;
 *   items     Map(key → { answer, rank, review, answers: [{ answer, rank, review }], disagreed }) — the answer that
 *             STANDS for each item: the most adverse of every current readable review (rule 2; between equally
 *             adverse answers the newest); `disagreed` when the current reviews ranked it differently (one adverse, one clean);
 *   adverse   the items whose standing answer is adverse;
 *   disagreed the items the current reviews disagree on;
 *   judged    the items some current readable review judged and whose judgment is still current (answered or not).
 * }
 */
export function standingOf(reviews, { current, items, rank, itemCurrent = null }) {
  const cur = (reviews || []).filter((x) => current(x)).sort((a, b) => Number(b.seq ?? 0) - Number(a.seq ?? 0));
  const readable = [], out = new Map(), judged = new Set();
  for (const review of cur) {
    const list = items(review);
    if (!list) continue; // no result (rule 4)
    readable.push(review);
    for (const [key, answer] of list) {
      if (itemCurrent && !itemCurrent(review, key, answer)) continue; // it judged something that has changed since
      judged.add(key);
      const k = rank(answer, key);
      if (k == null) continue; // this review did not answer this item
      const e = out.get(key);
      const a = { answer, rank: k, review };
      if (!e) { out.set(key, { answer, rank: k, review, answers: [a] }); continue; }
      e.answers.push(a);
      // read newest first: an older answer takes the place of a newer one only when it is MORE adverse (rule 2)
      if (k > e.rank) Object.assign(e, { answer, rank: k, review });
    }
  }
  for (const e of out.values()) e.disagreed = new Set(e.answers.map((a) => a.rank)).size > 1;
  return {
    current: cur, readable, items: out, judged,
    adverse: [...out].filter(([, e]) => e.rank > 0).map(([k]) => k),
    disagreed: [...out].filter(([, e]) => e.disagreed).map(([k]) => k),
  };
}

/** The words a finding adds when the current reviews of the same text disagreed on what it raises (rule 2). */
export const disagreementNote = (e) => (e?.disagreed ? ` (Reviews of this same text disagree: ${e.answers.length} answered, and the adverse answer stands until the text changes or the instructor answers — re-running the review does not clear it.)` : "");

// ---- the semi-mechanical fact check: what it judged is the claims its prompt printed ---------------------------------
const promptClaims = (record) => { const lines = String(record?.bundle?.prompt || "").split("\n"); return lines.slice(lines.indexOf("CLAIMS") + 1, lines.indexOf("PASSAGES")).map((l) => l.match(/^\d+\. (.*)$/)?.[1]).filter(Boolean); };
const promptLeads = (record) => { const lines = String(record?.bundle?.prompt || "").split("\n"), i = lines.findIndex((l) => l.startsWith("CLAIM CONTEXT")); return i < 0 ? [] : lines.slice(i + 1).map((l) => l.match(/^\d+\. (.*)$/)?.[1]).filter((x) => x != null); };
/**
 * Is a fact-check record a check of the unit's current claims (rule 1)? It judged the claims its prompt printed (and
 * the lead-in that introduced an equation): it is current while each reads, in the reader view, as the unit's current
 * claim in its place — a TeX regrouping or a reflow inside a claim leaves a contradiction standing; a changed value,
 * word or symbol is a new claim. (Admitted evidence stays bound to the exact facts it admitted: D17.)
 */
/**
 * Is ONE claim a fact check judged still a claim of the unit (red team R7, cause 2)? Its answer is bound to that claim as
 * a reader sees it (and the lead-in that introduced an equation), not to the unit's other claims: a contradiction stands
 * while its claim reads the same, whatever other claim of the unit changed; a changed claim is a new claim.
 */
const memo = (cache, key, fn) => { if (cache.has(key)) return cache.get(key); if (cache.size > 4000) cache.clear(); const v = fn(); cache.set(key, v); return v; };
const claimKeysOf = new Map();
export function semiClaimCurrent(record, n, unitText, lead = null) {
  const was = promptClaims(record)[n - 1];
  if (was == null) return false;
  const now = memo(claimKeysOf, String(unitText ?? ""), () => new Set(checkableClaims(unitText).map((c) => readerKey(c.text.replace(/\s+/g, " ")))));
  if (!now.has(readerKey(was))) return false;
  const leads = promptLeads(record);
  return !leads.length || leads.every((l) => readerKey(l) === readerKey(String(lead || "").replace(/\s+/g, " ")));
}
export function semiReviewCurrent(record, unitText, lead = null) {
  const was = promptClaims(record), now = checkableClaims(unitText).map((c) => c.text.replace(/\s+/g, " "));
  if (was.length !== now.length || was.some((c, i) => readerKey(c) !== readerKey(now[i]))) return false;
  const leads = promptLeads(record);
  return !leads.length || leads.every((l) => readerKey(l) === readerKey(String(lead || "").replace(/\s+/g, " ")));
}

// ---- a concern is bound to the words it quoted, in their sentence (red team R7, R7-K04; D50 cause 2) ----------------
// A knowledge, absolute or spine concern judged the words it quoted, read in the sentence that holds them. It stands
// while those words stand in that sentence as a reader sees it (the reader view): an edit of ANOTHER sentence of the unit,
// a split or a merge around it, is no change to what it judged, so a fresh review does not clear it then — only a change
// to the sentence it quoted (a fresh review of the new text speaks) or the instructor's answer does.
const flat = (t) => String(t ?? "").replace(/\s+/g, " ").trim();
/** The reader-view key of the sentence(s) of `text` that hold `quote` (the smallest run of sentences that contains it);
 *  null when the text does not hold the quote. A quote over a sentence boundary binds every sentence it touches. */
const sentenceKeys = new Map();
export function quotedSentenceKey(quote, text) {
  return memo(sentenceKeys, `${quote}\u0000${text}`, () => sentenceKeyOf(quote, text));
}
function sentenceKeyOf(quote, text) {
  if (!quoteIn(quote, text)) return null;
  // soft-wrapped lines of a paragraph are one run of prose: a line break is no sentence boundary (a list item, a table
  // row, a heading or a display formula starts a line of its own); a sentence that ends inside emphasis ("… factor.**")
  // ends there too
  const prose = String(text ?? "").replace(/\n(?![ \t]*(?:\n|[-*+] |\d+[.)] |\||#|>|\$\$|$))/g, " ").replace(/([.!?])([*_]+)(?=\s)/g, "$2$1");
  const ss = sentencesOf(prose);
  for (let len = 1; len <= ss.length; len++)
    for (let i = 0; i + len <= ss.length; i++) { const run = ss.slice(i, i + len).join(" "); if (quoteIn(quote, run)) return readerKey(flat(run)); }
  return readerKey(flat(text));
}
/** Does a concern quoting `quote`, raised on the passage `reviewed`, still stand on `now` — its words still there, in a
 *  sentence a reader reads the same as the one the reviewer judged? */
export function concernStands(quote, reviewed, now) {
  const was = quotedSentenceKey(quote, reviewed), is = quotedSentenceKey(quote, now);
  return was != null && is != null && was === is;
}
