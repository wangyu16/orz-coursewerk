// Absolute statements — reviewed by an agent that reads the context, not by the instructor (decision D30).
// "only", "always", "never", "every", "all", "none", "nothing" are found in every unit (outside quoted misconceptions,
// hedges like "only partially", and "not only"); an explicitly scoped "only" over named parameters is a semi-mechanical
// fact checked against sources (D29) and is not reviewed here. Each other absolute goes to a context-blind reviewer
// with its section's text. The reviewer says, per sentence:
//   casual                — ordinary usage, no claim about the world: it passes;
//   accurate-in-context   — a scientific claim whose scope the context supplies; it must quote the context words that
//                           scope it, and the harness checks they are there: it passes;
//   over-general          — a scientific absolute broader than the truth: a question routed to the agent, with a
//                           suggested rewording; it reaches the instructor only if the agent cannot resolve it.
// Until a logged review covers the unit's current absolute sentences, the unit carries `absolute-unreviewed`.
import { sha256, canonicalJson } from "../records/canonical.mjs";
import { clean, exclusivityOf, folded, sentencesOf } from "./claims.mjs";
import { recordHashOf } from "./dispatch.mjs";

const ABSOLUTE = /\b(?:only|solely|exclusively|alone|always|never|every|all|none|nothing|nobody)\b/i;
const QUOTED = /"[^"]*"|“[^”]*”/g;

/** The sentences of a unit that carry an absolute the context reviewer must see. */
export function absoluteSentences(text) {
  const out = [];
  for (const s of sentencesOf(text)) {
    const t = clean(s).replace(QUOTED, " ").replace(/(?<=[A-Za-z])[*_]+(?=[A-Za-z])/g, "");
    const plain = t.replace(/\bnot\s+only\b/gi, " ").replace(/\bonly\s+(?:\*+)?(?:partially|partial|in part)\b/gi, " ").replace(/\$[^$]*\$/g, " ");
    if (!ABSOLUTE.test(plain)) continue;
    const ex = exclusivityOf(s);
    if (ex && !ex.open && !/\b(?:always|never|every|all|none|nothing|nobody|alone)\b/i.test(plain)) continue; // a scoped "only": checked against sources (D29)
    out.push(s.trim().replace(/\s+/g, " "));
  }
  return out;
}
export const absolutesHash = (text) => sha256(canonicalJson(absoluteSentences(text)));

export function absoluteBundle(sentences, context, nonce) {
  const prompt = [
    "Below are sentences from teaching material for a college course, each containing an absolute word (only, always, never, every, all, none, …), and the section of the material they come from.",
    "Read the context and classify each sentence:",
    '- "casual": the absolute is ordinary usage and makes no claim about the world that could be wrong.',
    '- "accurate-in-context": it is a scientific claim, and the context limits it so that it is accurate. Copy, word for word, the words of the context that limit it.',
    '- "over-general": it is a scientific claim broader than the truth, even in context. Say why in one sentence and suggest a rewording that is accurate (scope it, or soften it).',
    `Reply with JSON only, exactly this shape: {"nonce": "${nonce}", "sentences": [{"n": 1, "class": "...", "context": "exact words (accurate-in-context only)", "why": "...", "suggestion": "..."}]}`,
    "",
    "SENTENCES",
    ...sentences.map((s, i) => `${i + 1}. ${s}`),
    "",
    "CONTEXT",
    String(context).trim(),
  ].join("\n");
  return { kind: "absolute", nonce, prompt, bundleHash: sha256(prompt) };
}

/** Parse and check a review. Returns { ok, results: [{ n, class, … }] } or { ok: false, reason }. */
export function readAbsoluteReview(raw, nonce, sentences, context) {
  const m = String(raw ?? "").match(/\{[\s\S]*\}/);
  let v; try { v = JSON.parse(m?.[0] || ""); } catch { return { ok: false, reason: "unparseable" }; }
  if (v?.nonce !== nonce || !Array.isArray(v.sentences)) return { ok: false, reason: "no review for this bundle" };
  const results = [];
  for (let i = 1; i <= sentences.length; i++) {
    const r = v.sentences.find((x) => x?.n === i);
    if (!r || !["casual", "accurate-in-context", "over-general"].includes(r.class)) return { ok: false, reason: `sentence ${i} has no class` };
    if (r.class === "accurate-in-context") {
      // the scope must be words of the section the reviewer saw (the sentence's own words count: "at constant volume").
      // A quote elided with "..." counts when every piece is in the section, in order (P11 dev: an elided quote of
      // correct text was unscorable and left the absolute blocking).
      const parts = String(r.context || "").split(/\s*(?:\.{3}|…)\s*/).map(folded).filter(Boolean), sec = folded(context);
      let at = 0;
      const inOrder = parts.every((x) => { const k = x.length >= 4 ? sec.indexOf(x, at) : -1; if (k < 0) return false; at = k + x.length; return true; });
      if (parts.join("").length < 8 || !inOrder) return { ok: false, reason: `sentence ${i}: the scoping words are not in the context` };
    }
    if (r.class === "over-general" && !String(r.why || "").trim()) return { ok: false, reason: `sentence ${i}: over-general without a reason` };
    results.push({ n: i, sentence: sentences[i - 1], class: r.class, context: r.context || null, why: String(r.why || "").slice(0, 500), suggestion: String(r.suggestion || "").slice(0, 500) });
  }
  return { ok: true, results };
}

/**
 * An absolute review as the decision log vouches for it, or null. Every field that decides whether the review covers
 * a unit — the unit, its sentences, its section context, the nonce and the answer — is read from what the log binds:
 * the logged unit, the prompt (bundleHash) and the answer (responseHash); never from the editable record's own
 * `sentences`, `context`, `absolutesHash` or `unit` (red-team round 2, from the CONTROL attacker: 29 records logged
 * before round 1 carry no recordHash, and their fields were read from the file). A record that carries a recordHash
 * must match it as well. Returns { unit, absolutesHash, sentences, context, nonce, review }.
 */
export function absoluteReviewOf(record, logRecords) {
  if (record?.kind !== "absolute") return null;
  const prompt = String(record.bundle?.prompt ?? "");
  const bundleHash = sha256(prompt), responseHash = sha256(record.answer?.raw ?? "");
  const log = (logRecords || []).find((l) => l.type === "dispatch" && l.party?.role === "harness" && l.payload?.kind === "absolute" && l.payload?.dispatch === record.dispatch && l.payload?.bundleHash === bundleHash && l.payload?.responseHash === responseHash
    && (l.payload?.recordHash == null || l.payload.recordHash === recordHashOf(record)));
  if (!log) return null;
  const lines = prompt.split("\n"), a = lines.indexOf("SENTENCES"), b = lines.indexOf("CONTEXT");
  if (a < 0 || b < a) return null;
  const sentences = lines.slice(a + 1, b).filter((l) => l.trim()).map((l, i) => { const m = l.match(/^(\d+)\. (.*)$/); return m && Number(m[1]) === i + 1 ? m[2] : null; });
  if (!sentences.length || sentences.some((x) => x == null)) return null;
  const context = lines.slice(b + 1).join("\n");
  const nonce = prompt.match(/"nonce": "([0-9a-f]+)"/)?.[1] ?? null;
  return { unit: log.payload.unit, absolutesHash: sha256(canonicalJson(sentences)), sentences, context, nonce, review: readAbsoluteReview(record.answer?.raw, nonce, sentences, context) };
}
