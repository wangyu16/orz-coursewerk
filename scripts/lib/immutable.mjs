// Immutable regions — the scope boundary for ALL automatic propagation.
//
// A terminology RENAME or a RE-DERIVE after a knowledge update rewrites the package's
// prose on the instructor's behalf. That authority stops at the edge of text the package
// does not own. Rewriting a dated quotation to use modern nomenclature is FABRICATION:
// it puts words in a cited author's mouth that the author never wrote, and it is
// undetectable downstream because the quote still *looks* like a quote. Same for a
// citation string (rewriting it silently breaks the link back to the record) and for a
// span reproduced from the pinned source (the fidelity checker compares against the
// source; rewriting it launders the divergence instead of surfacing it).
//
// So the rename produces "ethene (formerly ethylene)" in the package's OWN prose, and
// leaves the quoted 1970 sentence exactly as it was. Spec §6 edge case 2; §5 cross-cutting
// rule (b): immutable regions are never auto-rewritten.
//
// This module answers exactly one question — "may an automatic edit touch this offset?" —
// and answers it CONSERVATIVELY. It never decides what the edit should be (that is M9), and
// it fails CLOSED: anything it cannot see inside (a code fence, an orz plugin payload) is
// immutable rather than silently rewritable.
//
// Pure, local, deterministic — no network, no LLM, no clock. Source-span detection REUSES
// lib/verbatim.mjs (its shingle index and its tuning constants) so "near-verbatim" means
// exactly the same thing to the immutability boundary as it does to the publish-time
// verbatim gate. Divergence between those two definitions would be a silent hole.

import { buildSourceIndex, VERBATIM } from "./verbatim.mjs";

/**
 * @typedef {{start: number, end: number, kind: "quote"|"citation"|"literal"|"source-span"}} Region
 *   Half-open character interval [start, end) into the ORIGINAL `text`.
 *
 *   `kind` is not decoration: M9/M10 must EXPLAIN a refusal to the instructor, and
 *   "we did not rename inside this quotation" is FALSE when the frozen text is a code
 *   block — a confusing answer is worse than a coarse one. Hence `literal` gets its own
 *   reason rather than borrowing `quote`'s. Additive: callers that only branch on
 *   immutable/not are unaffected.
 */

// Merge precedence when two regions overlap: the surviving `kind` is the one that most
// directly explains to a human WHY the text is frozen. Lower rank wins. Deterministic.
//
// quote > citation > literal > source-span, by that same test:
//   - `quote` carries the most specific prohibition (rewriting it fabricates an attributed
//     statement) and `citation` names a record — both are authored boundaries and stay
//     decisive over the structural reasons.
//   - `literal` outranks `source-span`: when a fence also matches the source, "it is code"
//     is the reason a human can act on; the resemblance is incidental to it.
//   - `source-span` ranks last — it is the weakest claim (a statistical resemblance, not an
//     authored boundary), so it survives only when nothing more specific explains the freeze.
const KIND_RANK = { quote: 0, citation: 1, literal: 2, "source-span": 3 };

// Headings whose section body is a reference list (whole body is citation text).
const REFERENCE_HEADING = /^(#{1,6})[ \t]*(references|bibliography|works cited|citations|further reading|sources)\b[^\n]*$/gim;

// An inline quoted span is a matched pair of double quotes on a SINGLE line. Rationale:
//   - Single quotes / apostrophes are excluded — "the instructor's note" and "don't" would
//     produce garbage regions, and the false-positive cost here is silently refusing a
//     legitimate rename, which is a real (if benign) failure.
//   - One line only, and length-bounded: an unmatched stray quote must not swallow the rest
//     of the document into immutability. An odd quote simply matches nothing.
//   - The quote MARKS are part of the region — an edit that rewrites the delimiters is just
//     as much a fabrication as one that rewrites the words inside them.
const MAX_INLINE_QUOTE = 600;
const STRAIGHT_QUOTE = new RegExp(`"[^"\\n]{1,${MAX_INLINE_QUOTE}}"`, "g");
const SMART_QUOTE = new RegExp(`“[^”\\n]{1,${MAX_INLINE_QUOTE}}”`, "g");

// Citation shapes. Deliberately narrow: each must be unambiguous enough that freezing it
// cannot be mistaken for freezing ordinary prose.
const NAME = "[A-Z][A-Za-z'’-]+";
const AUTHOR = `${NAME}(?:[ \\t]+et[ \\t]+al\\.?)?`;
const AUTHORS = `${AUTHOR}(?:[ \\t]*(?:,|&|and)[ \\t]*${AUTHOR})*`;
const AUTHOR_YEAR = new RegExp(`\\(${AUTHORS},[ \\t]*(?:1[89]|20)\\d{2}[a-z]?(?:,[ \\t]*pp?\\.[ \\t]*[\\d–-]+)?\\)`, "g");

const CITATION_PATTERNS = [
  /^[ \t]{0,3}\[\^[^\]\n]+\]:[^\n]*$/gm, // footnote definition line
  /\[\^[^\]\n]+\]/g, // footnote marker
  /\[@[^\]\n]+\]/g, // pandoc citekey(s)
  /\[\d{1,3}(?:[ \t]*[,–-][ \t]*\d{1,3})*\](?!\()/g, // numeric marker [12], [3-5]; not a md link
  /\bdoi:[ \t]*10\.\S+/gi, // bare DOI
  /\bhttps?:\/\/\S+/g, // URLs (incl. https://doi.org/...)
  AUTHOR_YEAR, // (Author et al., 2019) / (Smith and Jones, 2020)
];

/**
 * Blank out spans we must not scan INTO, preserving every character offset (each masked
 * character becomes a space; newlines survive so line-anchored patterns stay aligned).
 *
 * DECISION — code fences and `{{...}}` orz plugin blocks ARE immutable, kind "literal":
 *   - A fence is literal text: auto-substituting a term inside `pH = calc(ethylene)` can
 *     break the code, and code is copied and run, not read as prose.
 *   - An orz `{{...}}` payload is a machine-parsed DSL (mermaid/smiles/yaml); a blind
 *     substitution can produce syntax that no longer renders.
 *   - lib/verbatim.mjs already treats both as noise, so source-span detection is BLIND
 *     inside them. Blind + rewritable is the one combination we refuse: fail closed.
 * "literal" means "reproduced verbatim as machine-read text; not this package's prose to
 * reword" — a distinct reason from `quote`, so a refusal can be explained truthfully.
 *
 * @param {string} text
 * @returns {{masked: string, regions: Region[]}}
 */
function maskLiterals(text) {
  const regions = [];
  let masked = text;
  const blank = (re) => {
    masked = masked.replace(re, (m, offset) => {
      regions.push({ start: offset, end: offset + m.length, kind: "literal" });
      return m.replace(/[^\n]/g, " ");
    });
  };
  blank(/```[\s\S]*?```/g); // fenced code (backtick)
  blank(/~~~[\s\S]*?~~~/g); // fenced code (tilde)
  blank(/\{\{[\s\S]*?\}\}/g); // orz plugin block
  blank(/`[^`\n]*`/g); // inline code
  return { masked, regions };
}

/** Markdown blockquotes: runs of consecutive `> ...` lines (a blank line ends the run). */
function blockquoteRegions(masked) {
  const regions = [];
  let runStart = -1;
  let runEnd = -1;
  let at = 0;
  for (const line of masked.split("\n")) {
    const isQuote = /^[ \t]{0,3}>/.test(line);
    if (isQuote) {
      if (runStart < 0) runStart = at;
      runEnd = at + line.length;
    } else if (runStart >= 0) {
      regions.push({ start: runStart, end: runEnd, kind: "quote" });
      runStart = -1;
    }
    at += line.length + 1; // +1 for the "\n"
  }
  if (runStart >= 0) regions.push({ start: runStart, end: runEnd, kind: "quote" });
  return regions;
}

/** A reference section: the heading plus its body, up to the next heading of same-or-higher level. */
function referenceSectionRegions(masked) {
  const regions = [];
  REFERENCE_HEADING.lastIndex = 0;
  let m;
  while ((m = REFERENCE_HEADING.exec(masked))) {
    const level = m[1].length;
    const start = m.index;
    const rest = masked.slice(m.index + m[0].length);
    const next = rest.search(new RegExp(`^#{1,${level}}[ \t]`, "m"));
    const end = next < 0 ? masked.length : m.index + m[0].length + next;
    // trim the trailing newline(s) so the region ends at real content
    regions.push({ start, end: Math.max(start, trimEnd(masked, end)), kind: "citation" });
  }
  return regions;
}

function trimEnd(text, end) {
  let e = end;
  while (e > 0 && /\s/.test(text[e - 1])) e -= 1;
  return e;
}

function matchRegions(masked, re, kind) {
  const regions = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(masked))) {
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    regions.push({ start: m.index, end: m.index + m[0].length, kind });
  }
  return regions;
}

/**
 * Word tokens WITH original-text offsets. The regex is verbatim.mjs's, applied to a
 * length-preserving mask of the same noise verbatim.mjs strips — so this token stream is
 * character-for-character the same word sequence verbatim.mjs's own tokenizer produces
 * (its replacements are non-word characters and cannot join words across a gap). That
 * equality is what lets us reuse its shingle index directly; verbatim.mjs's `scanText`
 * cannot be called here because it reports word COUNTS and a truncated preview, never the
 * character offsets an immutable region needs, and its cleaning step collapses lengths.
 */
function tokensWithOffsets(masked) {
  const out = [];
  const re = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;
  let m;
  while ((m = re.exec(masked))) out.push({ w: m[0].toLowerCase(), at: m.index, len: m[0].length });
  return out;
}

function shingleKey(words, i) {
  let k = words[i];
  for (let j = 1; j < VERBATIM.SHINGLE; j += 1) k += " " + words[i + j];
  return k;
}

/**
 * Spans of `masked` that are near-verbatim from the source: maximal runs of consecutive
 * source-matching shingles, at least VERBATIM.MIN_SPAN_WORDS words long. Same rule, same
 * constants, same index as the publish-time verbatim gate.
 */
function sourceSpanRegions(masked, sourceTexts) {
  const index = buildSourceIndex(sourceTexts);
  const toks = tokensWithOffsets(masked);
  const words = toks.map((t) => t.w);
  const regions = [];
  let i = 0;
  while (i + VERBATIM.SHINGLE <= words.length) {
    if (!index.has(shingleKey(words, i))) {
      i += 1;
      continue;
    }
    let end = i + VERBATIM.SHINGLE; // exclusive word index
    let j = i + 1;
    while (j + VERBATIM.SHINGLE <= words.length && index.has(shingleKey(words, j))) {
      end = j + VERBATIM.SHINGLE;
      j += 1;
    }
    if (end - i >= VERBATIM.MIN_SPAN_WORDS) {
      const first = toks[i];
      const last = toks[end - 1];
      regions.push({ start: first.at, end: last.at + last.len, kind: "source-span" });
    }
    i = j;
  }
  return regions;
}

/**
 * Normalize to a sorted, non-overlapping region list.
 *
 * Merge rule (deterministic): regions that OVERLAP are merged, and adjacent regions of the
 * SAME kind are joined; adjacent regions of DIFFERENT kinds stay separate (they touch but
 * do not overlap, and keeping them distinct preserves the human-legible reason for each).
 * A merged region takes the surviving kind by KIND_RANK — quote > citation > source-span —
 * i.e. the most direct explanation of why the text is frozen.
 */
function normalize(regions) {
  const clean = regions
    .filter((r) => Number.isInteger(r.start) && Number.isInteger(r.end) && r.end > r.start)
    .sort((a, b) => a.start - b.start || b.end - a.end || KIND_RANK[a.kind] - KIND_RANK[b.kind]);
  const out = [];
  for (const r of clean) {
    const cur = out[out.length - 1];
    const overlaps = cur && r.start < cur.end;
    const adjacentSameKind = cur && r.start === cur.end && r.kind === cur.kind;
    if (overlaps || adjacentSameKind) {
      cur.end = Math.max(cur.end, r.end);
      if (KIND_RANK[r.kind] < KIND_RANK[cur.kind]) cur.kind = r.kind;
    } else {
      out.push({ start: r.start, end: r.end, kind: r.kind });
    }
  }
  return out;
}

/**
 * Find every region of `text` that automatic propagation must never rewrite.
 *
 * Immutable: markdown blockquotes; inline double/smart-quoted spans (matched pair, one
 * line, <=600 chars, marks included); citations (footnote markers + definitions, pandoc
 * citekeys, numeric markers, DOIs, URLs, author-year parentheticals, and whole reference
 * sections); code fences and `{{...}}` orz plugin blocks; and — when `sourceText` is given —
 * spans detected as near-verbatim from the pinned source(s) via lib/verbatim.mjs.
 *
 * @param {string} text - the deliverable text.
 * @param {string|string[]|null} [sourceText] - the pinned source(s). Accepts one text, an
 *   ARRAY of texts (a package generally pins several — passed straight through to
 *   buildSourceIndex, which indexes each separately; callers must NOT pre-join them, as a
 *   shingle spanning the join boundary exists in no real source and would fabricate an
 *   immutable region), or null/undefined/empty, which simply SKIPS source-span detection —
 *   a package with no readable source still gets quote/citation/literal protection. Empty
 *   and non-string array entries are ignored. Never an error.
 * @returns {Region[]} sorted, non-overlapping, half-open [start, end) intervals.
 */
export function immutableRegions(text, sourceText) {
  if (typeof text !== "string" || text.length === 0) return [];
  const { masked, regions: literal } = maskLiterals(text);
  const found = [
    ...literal,
    ...blockquoteRegions(masked),
    ...matchRegions(masked, STRAIGHT_QUOTE, "quote"),
    ...matchRegions(masked, SMART_QUOTE, "quote"),
    ...referenceSectionRegions(masked),
  ];
  for (const re of CITATION_PATTERNS) found.push(...matchRegions(masked, re, "citation"));
  const sources = (Array.isArray(sourceText) ? sourceText : [sourceText]).filter(
    (s) => typeof s === "string" && s.length > 0,
  );
  if (sources.length > 0) found.push(...sourceSpanRegions(masked, sources));
  return normalize(found);
}

/**
 * Is `offset` inside an immutable region? RENAME and RE-DERIVE MUST consult this before
 * emitting an edit at that offset.
 *
 * BOUNDARIES: regions are half-open [start, end) — `start` is immutable, `end` is NOT.
 * `end` is the first offset the edit may touch again, so two back-to-back regions cover
 * every offset between them with no gap and no double-count, and an insertion AT `end`
 * lands after the frozen text rather than inside it. O(log n) — binary search over the
 * sorted, non-overlapping list from immutableRegions().
 *
 * @param {Region[]} regions - output of immutableRegions() (sorted, non-overlapping).
 * @param {number} offset - character offset into the same text.
 * @returns {boolean}
 */
export function isImmutable(regions, offset) {
  if (!Array.isArray(regions) || !Number.isFinite(offset)) return false;
  let lo = 0;
  let hi = regions.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = regions[mid];
    if (offset < r.start) hi = mid - 1;
    else if (offset >= r.end) lo = mid + 1;
    else return true;
  }
  return false;
}

// ── Unverifiable quotations — the publish-gate half of the immutable promise ────────────
//
// immutableRegions answers "may an edit touch this offset?" at PLAN time. This answers the
// symmetrical PUBLISH-time question the verbatim gate is blind to: "does a span the package
// presents as a reproduced quotation actually appear in a pinned source?" Quote marks assert
// "these are the author's words"; if those words appear in NO pinned source, the quotation is
// unverifiable — the exact "edited quote → refused" fault. The verbatim/source-span gate
// cannot catch it: a SHORT faithful quote (14 words in the golden fixture) is below
// verbatim.mjs's 15-word MIN_SPAN_WORDS floor, so it mints no span at all, and an EDITED quote
// no longer matches the source, so it likewise mints no span and is reported clean. Both fail
// the same way — no span to inspect — which is why source-span OVERLAP was measured and
// rejected for this check (research/g3-confidence-wiring-design.md §sub-part (a)). The sound
// signal is a QUOTE-LENGTH-AWARE match: test the quote's own word run against the source at
// the quote's own length, with no 15-word floor.
//
// Fuzzy tolerance (QUOTE_GAP_BUDGET): a real quotation elides words with "…" or brackets, and
// the tokenizer drops those marks — so the quote's words appear in the source as an in-order
// subsequence with a few SOURCE words skipped between them. We allow that. Crucially, skipping
// is only ever of SOURCE words: a SUBSTITUTED quote word ("equal"→"unequal") has no source
// match at all, so no gap budget can launder an edit. That asymmetry is what lets one knob
// tolerate legit ellipsis while still catching the single-word edit.
//
// Pure, local, deterministic. Bound #1 (design): with no pinned source this returns [] — a
// quote from an off-corpus / human-attested primary source is NOT flaggable here.
const MIN_QUOTE_WORDS = 6; // below this a double-quoted span is emphasis/scare-quote, not a
// reproduced quotation to hold to the source — skip it, never flag (measured FP guard).
const QUOTE_GAP_BUDGET = 6; // source words an ellipsis/bracket-elision may skip between the
// quote's words. Generous by design: gaps help legit elisions, never an edited word.

/** Lowercased word tokens (same class as tokensWithOffsets / verbatim.mjs). */
function wordSeq(text) {
  const re = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push(m[0].toLowerCase());
  return out;
}

/**
 * Does `needle` occur in `hay` (both word arrays) as an IN-ORDER subsequence in which EVERY
 * needle word matches, skipping at most `gap` hay words in total? Anchored on the needle's
 * first word so a start is only tried where it can succeed. O(hay × (needle+gap)).
 */
function occursWithGap(needle, hay, gap) {
  const n = needle.length;
  for (let i = 0; i < hay.length; i += 1) {
    if (hay[i] !== needle[0]) continue;
    let k = 1;
    let j = i + 1;
    let budget = gap;
    while (k < n && j < hay.length) {
      if (hay[j] === needle[k]) {
        k += 1;
        j += 1;
      } else if (budget > 0) {
        budget -= 1;
        j += 1;
      } else break;
    }
    if (k === n) return true;
  }
  return false;
}

/**
 * Quotes the package presents as reproduced text but that appear in NO pinned source.
 *
 * @param {string} text - the deliverable text.
 * @param {string|string[]|null} sourceText - pinned source(s); same contract as
 *   immutableRegions. With no readable source, returns [] (cannot verify ⇒ do not flag).
 * @returns {{start:number,end:number,text:string,words:number}[]} one entry per quote region
 *   of >= MIN_QUOTE_WORDS words with no source match, sorted by start.
 */
export function unverifiableQuotations(text, sourceText) {
  const sources = (Array.isArray(sourceText) ? sourceText : [sourceText])
    .filter((s) => typeof s === "string" && s.length > 0)
    .map(wordSeq);
  if (sources.length === 0) return [];
  const out = [];
  for (const r of immutableRegions(text, sourceText)) {
    if (r.kind !== "quote") continue;
    const w = wordSeq(text.slice(r.start, r.end));
    if (w.length < MIN_QUOTE_WORDS) continue;
    if (sources.some((src) => occursWithGap(w, src, QUOTE_GAP_BUDGET))) continue;
    out.push({ start: r.start, end: r.end, text: text.slice(r.start, r.end), words: w.length });
  }
  return out;
}
