// Deterministic admission of a verifier's answer (redesign P7; D17, D19-A; req.verdict.semi-mechanical).
// The verifier proposes; this file decides. A claim is SUPPORTED only when (round P7-1 hardened every rule):
//   - every quote is found, verbatim after folding, in the pinned text of the passage it names;
//   - every required token is carried by a quote WINDOW (one pinned text, ≤ 800 characters) that is itself about the
//     claim (two of its content words): each quantity at the claim's precision, each year and month, each name with
//     every capitalized part as a whole word, each superlative inside a quoted sentence that holds the claim's words
//     on both sides of it;
//   - each value beside the SAME name the claim gives it (the nearest name before it): a swap of two years between
//     two people fails, and a year beside another person is not this person's year;
//   - the claim's values in the claim's order within a window.
// A claim is CONTRADICTED (a defect) only when a found quote states the same quantity with another value, is ANCHORED
// to the claim (it also carries another of the claim's required tokens), names no one the claim does not, shares
// three content words, and the claimed value appears nowhere in the pinned texts near the claim's topic. A year or a
// name, or anything less anchored, is DISPUTED — a question (D12-F). Anything else admits nothing.
import { EXCLUSIVE, NEGATION, fold, folded, namesIn, proseOf, quantitiesIn, yearsIn, nameKey, contentWords } from "./claims.mjs";

const MIN_QUOTE_CHARS = 12;

/** Locate a quote in a pinned text: { start, end } (original offsets) or null. */
export function locate(quote, text) {
  const q = folded(quote).replace(/^["'.,;:\s-]+|["'.,;:\s-]+$/g, "");
  if (q.length < MIN_QUOTE_CHARS) return null;
  const t = fold(text);
  const i = t.s.indexOf(q);
  if (i < 0) return null;
  return { start: t.map[i], end: t.map[i + q.length - 1] + 1 };
}

const sameAtPrecision = (claim, src) => claim.unit === src.unit && Math.abs(Number(src.value.toFixed(claim.decimals)) - claim.value) < 1e-9;

const WINDOW = 800;
const plainKeepCase = (t) => proseOf(t).normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const wordRe = (w, flags = "iu") => new RegExp(`(?<![\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, flags);
const nameParts = (name) => plainKeepCase(name).split(/\s+/).filter((w) => /^\p{Lu}/u.test(w)).map((w) => w.replace(/['’]s$/, ""));
const sentencesIn = (t) => String(t).split(/(?<=[.!?;])\s+|\s*¶\s*/);

/** The claim's content words nearest the superlative: two before it, two after. */
function neighbours(claim, sup) {
  const words = folded(proseOf(claim.text)).match(/[a-z]+/g) || [];
  const at = words.findIndex((w) => w === sup);
  if (at < 0) return { before: [], after: [] };
  const content = new Set(claim.words);
  return { before: words.slice(0, at).filter((w) => content.has(w)).slice(-2), after: words.slice(at + 1).filter((w) => content.has(w)).slice(0, 2) };
}

/** Where a required token sits in a text (an index into plainKeepCase(text)), or -1. */
function tokenIndex(tok, P, claim) {
  if (tok.kind === "quantity") { const q = quantitiesIn(P).find((x) => sameAtPrecision(tok.q, x)); return q ? q.at : -1; }
  if (tok.kind === "year") { const m = P.match(new RegExp(`(?<![\\d])${tok.v}(?![\\d])`)); return m ? m.index : -1; }
  if (tok.kind === "month") { const m = P.match(wordRe(tok.v)); return m ? m.index : -1; }
  if (tok.kind === "name") {
    let at = -1;
    for (const part of tok.parts) { const m = P.match(wordRe(part)); if (!m) return -1; at = Math.max(at, m.index); }
    return at;
  }
  if (tok.kind === "excl-pos" || tok.kind === "excl-neg") {
    // a quoted sentence that names the member (or alternative) as whole words, says it (or denies it), and shares
    // another of the claim's words
    let off = 0;
    for (const sen of sentencesIn(P)) {
      const f = folded(sen);
      const g = f.replace(/\bnot\s+(?:only|just|merely|necessarily|always|simply)\b/g, " "); // these do not deny
      const named = tok.keys.every((k) => new RegExp(`(?<![a-z])${k}(?![a-z])`).test(g));
      const ex = claim.required.exclusive, own = new Set([...ex.positive, ...ex.alternatives.flatMap((a) => a.keys)]);
      // the predicate comes from the clause that carries the "only" (not from a quoted misconception before it)
      const clause = (folded(proseOf(claim.text)).split(/\s*(?:;|:|—|–|\s-\s|\bno\b\s*[—–-])\s*/).find((c) => /\bonly\b|\bsolely\b|\bexclusively\b|\bthe sole\b|\bnothing but\b/.test(c)) || folded(claim.text));
      const predicate = claim.words.filter((w) => !own.has(w) && clause.includes(w));
      const ws = g.split(/\s+/);
      const keyAt = ws.findIndex((w) => w.replace(/[^a-z'-]/g, "") === tok.keys[0]); // the head of the phrase
      const isNeg = (w) => NEGATION.test(` ${w} `);
      const stem = (w) => w.slice(0, Math.max(4, w.length - 2));
      const isPred = (w) => predicate.some((pw) => w.startsWith(stem(pw)));
      const CHANGE = /^(?:affect|affects|change|changes|alter|alters|shift|shifts|influence|influences|effect|effects)$/;
      // a negation GOVERNS when, within three words, it reaches a predicate word or a change verb ("does not affect",
      // "without any change", "not have an effect") — "without being consumed", "no suitable catalyst" do not
      const governing = (i) => ws.slice(i + 1, i + 4).some((x) => isPred(x) || CHANGE.test(x.replace(/[^a-z]/g, "")));
      const governs = ws.some((w, i) => isNeg(w) && governing(i));
      // a denial of THIS alternative: it stands before a governing negation (within twelve words), or it is the object
      // of a negated change verb (within six words)
      const denies = keyAt >= 0 && (
        ws.some((w, i) => isNeg(w) && i > keyAt && i - keyAt <= 12 && governing(i)) ||
        ws.some((w, i) => isNeg(w) && keyAt > i && keyAt - i <= 6 && ws.slice(i + 1, keyAt).some((x) => CHANGE.test(x.replace(/[^a-z]/g, "")))));
      // the member must stand alone: not one of a co-ordinated list ("temperature, pressure, volume, or concentration")
      const listed = keyAt >= 0 && /(?:,|\band\b|\bor\b)/.test([ws[keyAt - 1] || "", ws[keyAt] || "", ws[keyAt + 1] || ""].join(" ").replace(ws[keyAt] ? ws[keyAt].replace(/[,]$/, "") : "", ""));
      const negated = tok.kind === "excl-neg" ? denies : governs || listed;
      // the sentence carries a word of the claim's predicate (the governing negation ties a denial to it)
      const about = predicate.length > 0 && ws.some(isPred);
      if (named && about && (tok.kind === "excl-neg" ? negated : !negated)) return off;
      off += sen.length + 1;
    }
    return -1;
  }
  if (tok.kind === "superlative") {
    // inside a sentence that is about the claim: two of its content words (and its names, if any)
    let off = 0;
    for (const sen of sentencesIn(P)) {
      const f = folded(sen);
      // "about the claim": two of its content words, its names, and the words on BOTH sides of the superlative in the
      // claim — so "only a change of temperature alters K" is not about "a catalyst is the only change …"
      const { before, after } = neighbours(claim, tok.v);
      const about = claim.words.filter((w) => f.includes(w)).length >= Math.min(2, claim.words.length) && claim.required.names.every((n) => f.includes(nameKey(n)))
        && (!before.length || before.some((w) => f.includes(w))) && (!after.length || after.some((w) => f.includes(w)));
      const m = about && (tok.v === "only" ? sen.match(new RegExp(EXCLUSIVE.source, "i")) : sen.match(wordRe(tok.v)));
      if (m) return off + m.index;
      off += sen.length + 1;
    }
    return -1;
  }
  return -1;
}
const tokensOf = (claim) => [
  ...claim.required.quantities.map((q) => ({ kind: "quantity", q, label: q.raw })),
  ...claim.required.years.map((v) => ({ kind: "year", v, label: v })),
  ...claim.required.months.map((v) => ({ kind: "month", v, label: v })),
  ...claim.required.names.map((n) => ({ kind: "name", parts: nameParts(n), key: nameKey(n), label: n })).filter((t) => t.parts.length),
  ...claim.required.superlatives.map((v) => ({ kind: "superlative", v, label: v })),
  // a scoped exclusivity is a conjunction (D29): the member does it, each named alternative does not
  ...(claim.required.exclusive ? [
    { kind: "excl-pos", keys: claim.required.exclusive.positive, label: `only ${claim.required.exclusive.positive.join(" ")}` },
    ...claim.required.exclusive.alternatives.map((a) => ({ kind: "excl-neg", keys: a.keys, label: `not ${a.phrase}` })),
  ] : []),
];

/** The quotes, grouped into windows: one source, within 800 characters, in text order. */
function windowsOf(found) {
  const out = [];
  for (const src of [...new Set(found.map((f) => f.source))]) {
    const sorted = found.filter((f) => f.source === src).sort((x, y) => x.span[0] - y.span[0]);
    let cur = null;
    for (const f of sorted) {
      if (!cur || f.span[1] - cur.start > WINDOW) { cur = { start: f.span[0], quotes: [] }; out.push(cur); }
      cur.quotes.push(f.quote);
    }
  }
  return out.map((w) => w.quotes.join(" ¶ ")); // separate quotes are separate sentences (¶ survives prose folding)
}
function windowOf(found) { const w = windowsOf(found); return w.length === 1 ? w[0] : null; }

/** The name a value belongs to: the nearest name before it (or after it, if none precedes). */
function partnerOf(P, at, names) {
  const before = names.filter((n) => n.at <= at).sort((x, y) => y.at - x.at)[0];
  return before || names.filter((n) => n.at > at).sort((x, y) => x.at - y.at)[0] || null;
}
const namePositions = (P, list) => list.map((n) => ({ key: n.key, parts: n.parts, at: Math.max(...n.parts.map((p) => P.search(wordRe(p)))) })).filter((n) => n.at >= 0 && n.parts.every((p) => P.search(wordRe(p)) >= 0));

/** Do these found quotes support the claim? Every required token must be carried by a window that is about the claim
 *  (two of its content words), with each value beside the same name the claim gives it, and the claim's values in its
 *  order within the window. { ok, reason } */
export function supports(claim, found) {
  const windows = windowsOf(found);
  if (!windows.length) return { ok: false, reason: "no quotes" };
  const toks = tokensOf(claim);
  const C = plainKeepCase(claim.text);
  const claimNames = toks.filter((t) => t.kind === "name");
  const claimNamePos = namePositions(C, claimNames);
  const carriedBy = new Set();
  let reason = null;
  for (const joined of windows) {
    const P = plainKeepCase(joined), f = folded(joined);
    if (claim.words.filter((w) => f.includes(w)).length < Math.min(2, claim.words.length)) { reason = reason || "the quotes do not share the claim's content words"; continue; }
    const quoteNames = namesIn(joined).map((n) => ({ key: nameKey(n), parts: nameParts(n) })).filter((n) => n.parts.length);
    const qPos = namePositions(P, quoteNames);
    const here = [];
    for (const t of toks) {
      const at = tokenIndex(t, P, claim);
      if (at < 0) continue;
      if ((t.kind === "year" || t.kind === "quantity") && claimNames.length) {
        const want = partnerOf(C, tokenIndex(t, C, claim), claimNamePos), got = partnerOf(P, at, qPos);
        if (want && (!got || !(got.key === want.key || want.parts.some((p) => folded(p) === got.key)))) { reason = `${t.label} sits beside another name in the source`; continue; }
      }
      here.push({ t, at, c: tokenIndex(t, C, claim) });
    }
    let ordered = true;
    for (const kind of ["year", "quantity", "month"]) {
      const o = here.filter((x) => x.c >= 0 && x.t.kind === kind).sort((x, y) => x.c - y.c);
      for (let i = 1; i < o.length; i++) if (o[i].at < o[i - 1].at) { ordered = false; reason = `the quotes state ${o[i - 1].t.label} and ${o[i].t.label} in another order`; }
    }
    if (ordered) for (const x of here) carriedBy.add(x.t.label);
  }
  const lacking = toks.filter((t) => !carriedBy.has(t.label)).map((t) => t.label);
  if (lacking.length) return { ok: false, reason: reason && !/content words/.test(reason) ? reason : `the quotes lack ${lacking.join(", ")}` };
  return { ok: true };
}

/** Kept for callers that only need the lacking list (status displays). */
export function carried(claim, quotes) {
  const found = quotes.map((q, i) => ({ source: "q", quote: q, span: [i * 2, i * 2 + 1] }));
  const r = supports(claim, found);
  return { lacking: r.ok ? [] : [r.reason], overlapOk: r.ok };
}

/** What a quote states that differs from the claim, dimension by dimension. */
export function conflicts(claim, quotes) {
  const joined = quotes.join(" \n "), out = [];
  const srcQ = quantitiesIn(joined), srcY = yearsIn(joined);
  for (const q of claim.required.quantities) {
    const same = srcQ.filter((s) => s.unit === q.unit);
    if (same.length && !same.some((s) => sameAtPrecision(q, s))) out.push({ dimension: "quantity", claimed: q.raw, source: same[0].raw, sourceValue: same[0].value, unit: q.unit });
  }
  if (claim.required.years.length && srcY.length) for (const y of claim.required.years) if (!srcY.includes(y)) out.push({ dimension: "year", claimed: y, source: srcY[0] });
  return out;
}

/** Is a contradiction about the same thing? Anchored by another required token, no foreign name, three shared words. */
export function anchored(claim, found, k) {
  const joined = windowOf(found);
  if (joined == null) return false;
  const P = plainKeepCase(joined);
  const conflicted = new Set(k.map((x) => x.claimed));
  const others = tokensOf(claim).filter((t) => !["superlative", "excl-pos", "excl-neg"].includes(t.kind) && !conflicted.has(t.label));
  if (!others.some((t) => tokenIndex(t, P, claim) >= 0)) return false;
  const keys = tokensOf(claim).filter((t) => t.kind === "name").flatMap((t) => [t.key, ...t.parts.map(folded)]);
  if (namesIn(joined).some((n) => !keys.includes(nameKey(n)))) return false;
  const f = folded(joined);
  return claim.words.filter((w) => f.includes(w)).length >= Math.min(3, claim.words.length);
}

/** Does another pinned text state a different year for the claim's names and topic, and never the claimed one? */
export function contestedYear(claim, texts, quotedSources) {
  if (!claim.required.years.length || !claim.required.names.length) return null;
  const keys = claim.required.names.map(nameKey);
  for (const [source, text] of texts) {
    if (quotedSources.has(source)) continue;
    for (const sen of String(text).split(/(?<=[.!?])\s+|\n+/)) {
      const f = folded(sen);
      if (!keys.every((k) => f.includes(k)) || claim.words.filter((w) => f.includes(w)).length < Math.min(2, claim.words.length)) continue;
      const ys = yearsIn(sen);
      if (!ys.length || claim.required.years.some((y) => ys.includes(y))) continue;
      return { dimension: "year", claimed: claim.required.years[0], source: ys[0], sourceId: source, sentence: sen.slice(0, 300) };
    }
  }
  return null;
}

/** Uncontested? The claimed value (same unit, at the claim's precision) appears nowhere in the pinned texts near the claim's topic. */
export function supportedSomewhere(claim, q, texts) {
  for (const text of texts.values()) {
    const sentences = String(text).split(/(?<=[.!?])\s+|\n+/);
    for (let i = 0; i < sentences.length; i++) {
      if (!quantitiesIn(sentences[i]).some((s) => sameAtPrecision(q, s))) continue;
      const near = folded(sentences.slice(Math.max(0, i - 2), i + 3).join(" "));
      if (claim.words.filter((w) => near.includes(w)).length >= Math.min(2, claim.words.length)) return true;
    }
  }
  return false;
}

/**
 * Parse a verifier response. Expected JSON (possibly fenced):
 *   { "nonce": "...", "claims": [ { "claim": 1, "verdict": "supported|contradicted|not-found|hypothetical",
 *       "quotes": [ { "passage": 2, "text": "..." } ], "note": "..." } ] }
 * Returns { ok, value } or { ok: false, reason }.
 */
export function parseResponse(raw, nonce) {
  const s = String(raw ?? "");
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, reason: "no JSON object in the response" };
  let v; try { v = JSON.parse(m[0]); } catch (e) { return { ok: false, reason: `unparseable JSON: ${e.message}` }; }
  if (nonce && v.nonce !== nonce) return { ok: false, reason: "the response does not echo the bundle's nonce" };
  if (!Array.isArray(v.claims)) return { ok: false, reason: "no claims list" };
  for (const c of v.claims) {
    if (!Number.isInteger(c?.claim) || !["supported", "contradicted", "not-found", "hypothetical"].includes(c?.verdict)) return { ok: false, reason: "a claim entry without a claim number or a known verdict" };
    if (c.quotes !== undefined && !Array.isArray(c.quotes)) return { ok: false, reason: "quotes must be a list" };
  }
  return { ok: true, value: v };
}

/**
 * Admit one verifier answer for one unit.
 * @param claims    semiClaims(unit text)
 * @param passages  [{ n, source, text }]  the candidate passages the bundle showed, n = 1…
 * @param texts     Map(source → full pinned text)
 * @returns { status: "admitted"|"partial"|"contradicted"|"disputed"|"not-found"|"unscorable", perClaim, quotes, conflicts, reason }
 */
export function admit({ claims, passages, texts, raw, nonce }) {
  const parsed = parseResponse(raw, nonce);
  if (!parsed.ok) return { status: "unscorable", reason: parsed.reason, perClaim: [] };
  const byN = new Map(passages.map((p) => [p.n, p]));
  const perClaim = claims.map((claim) => {
    const ans = parsed.value.claims.find((c) => c.claim === claim.index);
    if (!ans) return { claim: claim.index, status: "not-found", reason: "no answer for this claim" };
    if (ans.verdict === "hypothetical") return { claim: claim.index, status: "hypothetical", note: String(ans.note || "") };
    const found = [], missing = [];
    for (const q of ans.quotes || []) {
      const p = byN.get(q?.passage);
      const text = p && texts.get(p.source);
      const span = text && typeof q.text === "string" && locate(q.text, p.text) && locate(q.text, text);
      if (span) found.push({ source: p.source, quote: text.slice(span.start, span.end), span: [span.start, span.end] });
      else missing.push(String(q?.text || "").slice(0, 120));
    }
    if (ans.verdict === "supported") {
      if (!found.length) return { claim: claim.index, status: "not-found", reason: missing.length ? "no quote was found in its passage" : "supported without a quote" };
      const c = supports(claim, found);
      if (!c.ok) return { claim: claim.index, status: "not-found", reason: c.reason, quotes: found };
      // conflicting evidence is a question (D12-F): another pinned text gives the same people another year
      const other = contestedYear(claim, texts, new Set(found.map((f) => f.source)));
      if (other) return { claim: claim.index, status: "disputed", quotes: found, conflicts: [other] };
      return { claim: claim.index, status: "supported", quotes: found };
    }
    if (ans.verdict === "contradicted") {
      if (!found.length) return { claim: claim.index, status: "not-found", reason: "contradicted without a quote found in its passage" };
      const k = conflicts(claim, found.map((f) => f.quote));
      if (!k.length) return { claim: claim.index, status: "not-found", reason: "the quote states no different value, year or name" };
      const hard = k.some((x) => x.dimension === "quantity") && anchored(claim, found, k) && !claim.required.quantities.some((q) => supportedSomewhere(claim, q, texts));
      return { claim: claim.index, status: hard ? "contradicted" : "disputed", quotes: found, conflicts: k };
    }
    return { claim: claim.index, status: "not-found", reason: String(ans.note || "the verifier found no evidence") };
  });
  const all = (s) => perClaim.every((c) => c.status === s);
  const status = perClaim.some((c) => c.status === "contradicted") ? "contradicted"
    : perClaim.some((c) => c.status === "disputed") ? "disputed"
    : all("supported") ? "admitted"
    : perClaim.some((c) => c.status === "supported") ? "partial" : "not-found";
  return { status, perClaim };
}

/** A quote the gate can re-check: it resolves at its span in its pinned text and carries the claim's required tokens. */
export function recheckQuote(q, text) {
  if (typeof text !== "string" || !Array.isArray(q?.span)) return "its pinned text is not available";
  const [s, e] = q.span;
  if (folded(q.quote).length < MIN_QUOTE_CHARS) return "the quote is too short to be evidence";
  if (folded(text.slice(s, e)) !== folded(q.quote)) return "the quote does not resolve at its span";
  return null;
}

export { contentWords };
