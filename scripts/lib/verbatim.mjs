// Near-verbatim detector — flag text lifted from the source materials.
//
// Copyright protects EXPRESSION, not facts. A study guide should re-express the
// source in original prose, never reproduce its sentences. This finds long spans
// that match the source word-for-word (or nearly), so they can be rewritten before
// a package is published or listed. It only works when the source text is available
// (a readable file in inputs/); a NAMED external textbook can't be diffed — rely on
// the anti-verbatim authoring rule + attestation there.
//
// Pure, local, deterministic — no network. Shingle the source, then find maximal runs
// of consecutive source-matching shingles in each deliverable.

const SHINGLE = 8; // window size (words); a run of these ⇒ a long verbatim span
const MIN_SPAN_WORDS = 15; // report spans at least this many consecutive shared words

/** Lowercase word tokens, stripped of markdown/punctuation noise. Returns [{w, at}]. */
function tokenize(text) {
  // drop code fences and orz plugin blocks so we don't flag legit shared syntax
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\{\{[\s\S]*?\}\}/g, " ")
    .replace(/`[^`]*`/g, " ");
  const out = [];
  const re = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;
  let m;
  while ((m = re.exec(cleaned))) out.push({ w: m[0].toLowerCase(), at: m.index });
  return out;
}

function shingleKey(words, i) {
  let k = words[i];
  for (let j = 1; j < SHINGLE; j += 1) k += " " + words[i + j];
  return k;
}

/** Build the set of source shingles from all source texts. */
export function buildSourceIndex(sourceTexts) {
  const set = new Set();
  for (const text of sourceTexts) {
    const words = tokenize(text).map((t) => t.w);
    for (let i = 0; i + SHINGLE <= words.length; i += 1) set.add(shingleKey(words, i));
  }
  return set;
}

/**
 * Scan one deliverable against the source index. Returns matched spans:
 * [{ words, text }] where each is a run of >= MIN_SPAN_WORDS consecutive words whose
 * every SHINGLE-window is present in the source.
 */
export function scanText(deliverableText, sourceIndex) {
  const toks = tokenize(deliverableText);
  const words = toks.map((t) => t.w);
  const spans = [];
  let i = 0;
  while (i + SHINGLE <= words.length) {
    if (sourceIndex.has(shingleKey(words, i))) {
      // extend the run while consecutive shingles keep matching
      let end = i + SHINGLE; // exclusive word index covered so far
      let j = i + 1;
      while (j + SHINGLE <= words.length && sourceIndex.has(shingleKey(words, j))) {
        end = j + SHINGLE;
        j += 1;
      }
      const spanWords = end - i;
      if (spanWords >= MIN_SPAN_WORDS) {
        spans.push({ words: spanWords, text: words.slice(i, Math.min(end, i + 24)).join(" ") + (end - i > 24 ? " …" : "") });
      }
      i = j; // continue past this run
    } else {
      i += 1;
    }
  }
  return spans;
}

export const VERBATIM = { SHINGLE, MIN_SPAN_WORDS };
