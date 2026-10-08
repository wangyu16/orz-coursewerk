// The context-blind verifier (redesign P7; D3, D26; req.dispatch.blind).
// A bundle carries the claims of ONE unit and the candidate passages the harness chose from pinned texts — never the
// unit's id, origin, author, file, course, or the conversation that wrote it. It is sent to a fresh, context-blind
// pass of the instructor's own engine (D26: blindness, not a second model family, is what makes it independent):
//   headless  the harness runs the verifier command itself, in an empty temporary directory, prompt on stdin;
//   courier   no headless command: the agent relays the same bundle to a fresh subagent and records its answer.
// The command comes from the harness's environment (COURSEWERK_VERIFIER, a JSON array), never from the package:
// the package is untrusted input (D23). Every dispatch is recorded in the package (metadata/verification/) with the
// exact prompt, passages and raw answer, and logged; tests replay recorded answers offline.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { sha256, canonicalJson } from "../records/canonical.mjs";
import { recordFile } from "../records/paths.mjs";
import { appendLogRecord } from "../records/log.mjs";
import { NEGATION, folded, quantitiesIn, nameKey, yearsIn } from "./claims.mjs";
import { decodeEntities } from "../core/values.mjs";
import { unitHash } from "../core/segment.mjs";
import { factHash } from "../core/dependencies.mjs";

export const VERIFICATION_DIR = "metadata/verification";
const SYSTEM = "You are a context-blind fact verifier. You see only the material in the user message. Answer only from it, and reply with JSON only.";
export const DEFAULT_COMMAND = ["claude", "-p", "--system-prompt", SYSTEM, "--setting-sources", "", "--strict-mcp-config", "--tools", "", "--no-session-persistence", "--output-format", "json"];

export function verifierCommand(env = process.env) {
  if (!env.COURSEWERK_VERIFIER) return DEFAULT_COMMAND;
  const c = JSON.parse(env.COURSEWERK_VERIFIER);
  if (!Array.isArray(c) || !c.length || c.some((x) => typeof x !== "string")) throw new Error("COURSEWERK_VERIFIER must be a JSON array of strings");
  return c;
}

// ---- candidate passages ------------------------------------------------------------------------------------------
/** Pick candidate passages for a unit's claims from pinned texts: deterministic, ranked by the claim's RARE words
 *  (inverse document frequency over all windows, so "catalyst" outweighs "equilibrium") and by carried facts; at most
 *  two windows per text, so one long page cannot crowd out the others. */
export function selectPassages(claims, texts, { max = 10, window = 3, perSource = 2 } = {}) {
  const words = [...new Set(claims.flatMap((c) => c.words))];
  const facts = claims.flatMap((c) => [...c.required.names.map(nameKey), ...c.required.years, ...c.required.months.map((m) => m.toLowerCase())]);
  const qty = claims.flatMap((c) => c.required.quantities);
  const wins = [];
  for (const [source, t] of [...texts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!t.ok) continue; // a text that no longer matches its pin is never shown
    const sents = String(t.text).split(/(?<=[.!?])\s+(?=[A-Z0-9"(])|\n+/).filter((x) => x.trim());
    for (let i = 0; i < sents.length; i++) {
      const text = sents.slice(i, i + window).join(" ").trim();
      if (text.length >= 40) wins.push({ source, i, text, f: folded(text) });
    }
  }
  const df = new Map(words.map((w) => [w, wins.filter((x) => x.f.includes(w)).length]));
  const idf = (w) => Math.log((wins.length + 1) / ((df.get(w) || 0) + 1));
  const cands = [];
  for (const x of wins) {
    const hit = words.filter((w) => x.f.includes(w));
    if (hit.length < Math.min(2, words.length)) continue;
    const k = facts.filter((y) => x.f.includes(y)).length + qty.filter((q) => quantitiesIn(x.text).some((s) => s.unit === q.unit)).length;
    cands.push({ ...x, score: hit.reduce((a, w) => a + idf(w), 0) + 3 * k });
  }
  cands.sort((a, b) => b.score - a.score || a.source.localeCompare(b.source) || a.i - b.i);
  const chosen = [];
  // coverage first: the best window for every required token (a name, a year, each member and named alternative of
  // an exclusivity — D29), so one generic topic cannot crowd out the sentence that states a fact
  const needles = claims.flatMap((c) => [...[...c.required.names.map(nameKey), ...c.required.years].map((k) => ({ keys: [k] })),
    ...(c.required.exclusive ? [{ keys: c.required.exclusive.positive }, ...c.required.exclusive.alternatives.map((a) => ({ keys: a.keys, negated: true }))] : [])]);
  for (const { keys, negated } of needles) {
    if (chosen.length >= max) break;
    const fits = (c) => keys.every((k) => c.f.includes(k)) && !chosen.includes(c);
    const best = (negated && cands.find((c) => fits(c) && NEGATION.test(c.f))) || cands.find(fits);
    if (best && !chosen.some((x) => x.source === best.source && Math.abs(x.i - best.i) < window)) chosen.push(best);
  }
  for (const c of cands) {
    if (chosen.length >= max) break;
    if (chosen.filter((x) => x.source === c.source).length >= perSource) continue;
    if (chosen.some((x) => x.source === c.source && Math.abs(x.i - c.i) < window)) continue;
    chosen.push(c);
  }
  return chosen.map((c, k) => ({ n: k + 1, source: c.source, text: c.text }));
}

// ---- bundles -----------------------------------------------------------------------------------------------------
export function semiBundle(claims, passages, nonce = randomBytes(8).toString("hex")) {
  const prompt = [
    "Check each claim against the reference passages below. Use only these passages, not your own knowledge.",
    "For each claim give one verdict:",
    '- "supported": copy, word for word, the words of a passage that state the claim. Every number with its unit, every year and every name in the claim must appear in what you copy; give more than one quote if needed.',
    '- "contradicted": copy, word for word, the words of a passage that state a different value, year or name for the same thing.',
    '- "not-found": the passages neither state nor contradict the claim.',
    '- "hypothetical": the claim is invented exercise data or a hypothetical scenario, not a statement about the world.',
    `Reply with JSON only, exactly this shape: {"nonce": "${nonce}", "claims": [{"claim": 1, "verdict": "...", "quotes": [{"passage": 1, "text": "..."}], "note": "one short sentence"}]}`,
    "",
    "CLAIMS",
    ...claims.map((c) => `${c.index}. ${c.text.replace(/\s+/g, " ")}`),
    "",
    "PASSAGES",
    ...passages.map((p) => `[${p.n}] ${p.text.replace(/\s+/g, " ")}`),
    // an equation claim is read with the sentence that introduces it, so the verifier knows what it is about
    ...(claims.some((c) => c.lead) ? ["", "CLAIM CONTEXT (the sentence that introduces an equation claim; not itself a claim)", ...claims.filter((c) => c.lead).map((c) => `${c.index}. ${c.lead.replace(/\s+/g, " ")}`)] : []),
  ].join("\n");
  return { kind: "semi", nonce, prompt, bundleHash: sha256(prompt) };
}

export function knowledgeBundle(text, nonce = randomBytes(8).toString("hex"), { before = "", after = "", referenced = "", label = null, moved = "", headings = [] } = {}) {
  // the text around the passage, so a unit is read as a student reads it (an answer with its question, a sentence
  // with the equation that follows) — P11 dev. Concerns are still only about the passage's own words. What the
  // passage refers to by number ("the answer to Q3") is shown too, labelled, so a reference is never guessed (P11 pass 4).
  // a re-check owed because something the passage depends on changed is shown that thing as it is now (red team R4
  // coherence F4: a moved shared value, a redefined key term, a changed objective) — the passage must still agree with it
  const around = [moved && ["WHAT CHANGED SINCE THE PASSAGE WAS LAST CHECKED (context only: the passage must agree with it as it is now)", String(moved).trim(), ""],
    referenced && ["TEXT THE PASSAGE REFERS TO (context only)", String(referenced).trim(), ""], before && ["TEXT BEFORE THE PASSAGE (context only)", String(before).trim(), ""], after && ["TEXT AFTER THE PASSAGE (context only)", String(after).trim(), ""],
    // the labels printed over it (red team round 5, CONTROL C3-01): the passage is read under them
    headings?.length && ["HEADINGS AND LABELS PRINTED OVER THE PASSAGE (context only)", ...headings.map((h) => `- ${String(h).replace(/\s+/g, " ").trim()}`), ""]].filter(Boolean).flat();
  // two kinds of concern (D35, operator 2026-10-02): most remarks on correct text need no discussion — a few words
  // make the statement precise, and the agents settle it. Judged at the course's level, within the passage's scope.
  const prompt = [
    "Below is a passage from teaching material for a college course. Read it as a student of that course would, at the level it is taught, and check it for errors of fact or concept.",
    'Raise a concern of one of two kinds. "wrong": the passage states or teaches something false at this level. "clarify": the passage is correct as meant, but a few added or changed words would remove a likely misreading (for example, by naming the condition it assumes).',
    "Do not raise exceptions or special cases beyond what the passage is about, and nothing about style or emphasis. For each concern copy the exact words at issue, and give the words to put in their place: for \"clarify\", the smallest edit that keeps the meaning.",
    ...(around.length ? ["The text around the passage is given so you can read it in place; raise concerns only about words in the PASSAGE itself."] : []),
    "If the passage refers to something that is not shown (a numbered question, a figure, another section), do not guess what it says, and raise nothing about it.",
    `Reply with JSON only, exactly this shape: {"nonce": "${nonce}", "concerns": [{"kind": "wrong" | "clarify", "text": "exact words", "problem": "...", "suggestion": "the words to put in their place"}]} — an empty list if there is nothing to raise.`,
    "",
    ...around,
    label ? `PASSAGE (${label})` : "PASSAGE",
    String(text).trim(),
  ].join("\n");
  return { kind: "knowledge", nonce, prompt, bundleHash: sha256(prompt) };
}

// ---- reading a knowledge review ----------------------------------------------------------------------------------
// A reviewer quotes the passage as a student reads it: rendered math, not its LaTeX ("ΔH < 0" for "$\Delta H < 0$").
// Both sides are folded to that reading before a quote is located (red-team round 2, R2-K10: the rendered quote was
// dropped without trace while the dispatch still counted as the unit's review).
const SYMBOLS = { Delta: "Δ", delta: "δ", Gamma: "Γ", gamma: "γ", alpha: "α", beta: "β", epsilon: "ε", varepsilon: "ε", lambda: "λ", Lambda: "Λ", mu: "μ", nu: "ν", pi: "π", rho: "ρ", sigma: "σ", Sigma: "Σ", tau: "τ", theta: "θ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω", Omega: "Ω",
  lt: "<", gt: ">", le: "≤", leq: "≤", ge: "≥", geq: "≥", neq: "≠", ne: "≠", approx: "≈", sim: "~", times: "×", cdot: "·", pm: "±", mp: "∓", circ: "°", degree: "°", infty: "∞", propto: "∝", partial: "∂",
  rightleftharpoons: "⇌", leftrightharpoons: "⇌", rightarrow: "→", longrightarrow: "→", to: "→", leftarrow: "←", leftrightarrow: "↔", Rightarrow: "⇒", ldots: "…", dots: "…", cdots: "⋯", ominus: "⊖", standardstate: "°", minus: "−" };
/** A passage as a reader sees it: entities decoded, \text{}/\mathrm{}/\ce{} unwrapped, symbol macros as symbols,
 *  sub- and superscripts inline, "$", braces and emphasis markup removed, whitespace collapsed. */
export function readerText(text) {
  let t = decodeEntities(String(text ?? "")).replace(/\$\$?/g, " ");
  for (let k = 0; k < 3; k++) t = t.replace(/\\(?:text|textrm|textbf|textit|mathrm|mathbf|mathit|mathsf|operatorname|emph|ce|mbox|boldsymbol)\s*\{([^{}]*)\}/g, "$1");
  t = t.replace(/\^\s*\{?\s*\\circ\s*\}?/g, "°").replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1/$2")
    .replace(/\\([A-Za-z]+)(?![A-Za-z])/g, (m, name) => SYMBOLS[name] ?? (/^(?:left|right|big|Big|bigg|displaystyle|textstyle|quad|qquad)$/.test(name) ? " " : m))
    .replace(/\\[,;:! ]/g, " ").replace(/[_^]\s*\{([^{}]*)\}/g, "$1").replace(/[_^](?=\S)/g, "")
    .replace(/[{}*`]/g, "").replace(/(?<![A-Za-z0-9])_+|_+(?![A-Za-z0-9])/g, "");
  return t.replace(/\s+/g, " ").trim();
}
/** Is a reviewer's quote in this text, as written or as a reader sees it? (≥ 8 characters, or it locates nothing) */
export function quoteIn(quote, text) {
  const bare = (t) => String(t).replace(/[$*_`]/g, "").replace(/\s+/g, " ").trim();
  if (bare(quote).length < 8) return false;
  if (bare(text).includes(bare(quote))) return true;
  // spacing is the typesetter's, not the reader's ("( Δ H < 0 )" from "($\Delta H < 0$)" reads "(ΔH < 0)")
  const squeeze = (t) => folded(readerText(t)).replace(/\s+/g, "");
  const q = squeeze(quote);
  return q.length >= 8 && squeeze(text).includes(q);
}
/** The passage a knowledge bundle showed the reviewer (what its concerns may quote). */
export const reviewedPassage = (prompt) => { const p = String(prompt || ""); const m = p.match(/\nPASSAGE(?: \([^\n]*\))?\n([\s\S]*)$/); return m ? m[1] : ""; };
/**
 * A knowledge review as the harness reads it: { ok, reason, concerns, unlocated, gone }. `concerns` point at words the
 * unit contains now; `gone`: concerns whose words are no longer in the unit but were in the passage reviewed — a
 * "wrong" one is settled only as MS8 rules (red-team round 3, R3-K06: a synonym swap removed the words, not the error). `unlocated`: concerns whose words are in neither — the reviewer quoted something the
 * passage does not say, so the review cannot be scored. A review that does not parse, or answers another bundle, is
 * not ok. Neither counts as a clean review (R2-K10).
 */
export function readKnowledgeReview(record, unitText) {
  const m = String(record?.answer?.raw || "").match(/\{[\s\S]*\}/);
  let v; try { v = JSON.parse(m?.[0] || ""); } catch { return { ok: false, reason: "the answer is not JSON", concerns: [], unlocated: [] }; }
  if (v?.nonce !== record?.bundle?.nonce) return { ok: false, reason: "the answer does not echo the bundle's nonce", concerns: [], unlocated: [], gone: [] };
  if (!Array.isArray(v.concerns)) return { ok: false, reason: "the answer has no concerns list", concerns: [], unlocated: [], gone: [] };
  const norm = (t) => String(t).replace(/\s+/g, " ").trim();
  const passage = reviewedPassage(record.bundle?.prompt);
  const concerns = [], unlocated = [], gone = [];
  for (const c of v.concerns) {
    if (typeof c?.text !== "string" || typeof c.problem !== "string") continue; // a malformed entry says nothing
    // a concern without a kind (records before D35) is read as "wrong": it keeps the path it had
    const x = { kind: c.kind === "clarify" ? "clarify" : "wrong", text: norm(c.text), problem: String(c.problem).slice(0, 600), suggestion: String(c.suggestion || "").slice(0, 600) };
    if (quoteIn(c.text, unitText)) concerns.push(x);
    else if (!passage || !quoteIn(c.text, passage)) unlocated.push(x);
    else gone.push(x); // its words were in the passage reviewed and are gone from the unit: settled only as MS8 says
  }
  return { ok: true, concerns, unlocated, gone };
}

/**
 * Was a concern settled by putting its suggestion in place of its words, and changing nothing else (red-team round 3,
 * R3-K06)? The passage the review read, with the concern's words replaced by its suggestion, must be the unit's text
 * now (whitespace and emphasis aside). A rewording of the words at issue ("raises" → "increases"), or any other edit
 * of the passage, is not — the concern stays open until a fresh review reads the new text.
 */
export function settledBySuggestion(concern, passage, unitText) {
  const norm = (t) => String(t || "").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
  const P = norm(passage), q = norm(concern.text), sug = norm(concern.suggestion);
  if (!q || sug.length < 8 || P.split(q).length !== 2) return false;
  return P.replace(q, () => sug) === norm(unitText);
}

// ---- running a verifier -------------------------------------------------------------------------------------------
/** The headless verifier: one fresh process per bundle, in an empty temporary directory. */
export function headlessVerifier({ command = verifierCommand(), timeoutMs = 300_000 } = {}) {
  return async (prompt) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-verifier-"));
    try {
      const { code, out, err } = await new Promise((resolve, reject) => {
        const p = spawn(command[0], command.slice(1), { cwd: dir, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, COURSEWERK_VERIFIER: "" } });
        let out = "", err = "";
        const t = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
        p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d));
        p.on("error", reject);
        p.on("close", (code) => { clearTimeout(t); resolve({ code, out, err }); });
        p.stdin.end(prompt);
      });
      let env = null; try { env = JSON.parse(out); } catch { env = null; }
      if (env && typeof env === "object" && "result" in env)
        return { mode: "headless", raw: String(env.result ?? ""), model: Object.keys(env.modelUsage || {}).join(",") || null, costUsd: env.total_cost_usd ?? null, exit: code, terminal: env.terminal_reason || env.subtype || null };
      return { mode: "headless", raw: out, model: null, costUsd: null, exit: code, terminal: err.slice(0, 200) || null };
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
}

/** Replays recorded answers (by bundle hash, or by claim text when nonces differ): tests run offline. */
export function replayVerifier(answers) {
  return async (prompt) => {
    const a = typeof answers === "function" ? answers(prompt) : answers[sha256(prompt)];
    if (a === undefined) return { mode: "replay", raw: "", model: "replay", costUsd: 0 };
    return { mode: "replay", raw: typeof a === "string" ? a : JSON.stringify(a), model: "replay", costUsd: 0 };
  };
}

// ---- records -----------------------------------------------------------------------------------------------------
/** Write a dispatch record into the package and log it. Returns the record. */
// `deps`: the hash of the unit's dependencies when it was reviewed. Logged with the unit's content hash, so a review
// can later count as a re-verification of exactly that text against exactly those dependencies (units.mjs reverify).
export function recordDispatch(root, { kind, unit, factHash, contentHash, bundle, passages = [], texts, answer, admission = null, claims = null, extra = {}, deps = null }) {
  const dispatch = `d-${bundle.bundleHash.slice(0, 16)}`;
  const record = {
    schemaVersion: 1, dispatch, kind, unit, factHash, contentHash, at: new Date().toISOString(),
    bundle: { nonce: bundle.nonce, bundleHash: bundle.bundleHash, prompt: bundle.prompt },
    ...(claims ? { claims: claims.map((c) => ({ index: c.index, text: c.text })) } : {}),
    passages: passages.map((p) => ({ n: p.n, source: p.source, text: p.text, textSha256: texts?.get(p.source)?.sha256 ?? null })),
    answer: { mode: answer.mode, raw: answer.raw, model: answer.model ?? null, costUsd: answer.costUsd ?? null, responseHash: sha256(answer.raw ?? "") },
    ...(admission ? { admission } : {}),
    ...extra,
  };
  const dir = recordFile(root, VERIFICATION_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const text = JSON.stringify(record, null, 2) + "\n";
  fs.writeFileSync(path.join(dir, `${dispatch}.json`), text);
  appendLogRecord(root, { type: "dispatch", party: { role: "harness", name: "verify" }, payload: { dispatch, kind, unit, bundleHash: bundle.bundleHash, responseHash: record.answer.responseHash, recordHash: recordHashOf(JSON.parse(text)), mode: answer.mode, status: admission?.status ?? null, ...(deps ? { contentHash, deps } : {}) } });
  return record;
}

/**
 * The hash of a whole dispatch record, logged with it (redteam r1 C2-03): every field that decides an outcome (an
 * alignment record's `declared` and `alignmentBasis`, a status, the time) is bound, so an edit of any of them makes
 * the record a dispatch the log does not vouch for. Records logged before round 1 carry no recordHash.
 */
export const recordHashOf = (record) => sha256(canonicalJson(record));

/**
 * The log entry that vouches for a dispatch record, or null: the same dispatch, unit, bundle and answer (round P7-1,
 * B12/B13) and, for records logged since red-team round 1, the same whole record (recordHash: C2-03).
 */
export function dispatchLogEntry(record, logRecords) {
  if (!record || sha256(record.bundle?.prompt ?? "") !== record.bundle?.bundleHash || sha256(record.answer?.raw ?? "") !== record.answer?.responseHash) return null;
  return (logRecords || []).find((l) => l.type === "dispatch" && l.party?.role === "harness" && l.payload?.dispatch === record.dispatch && l.payload?.unit === record.unit && l.payload?.bundleHash === record.bundle.bundleHash && l.payload?.responseHash === record.answer.responseHash
    && (l.payload?.recordHash == null || l.payload.recordHash === recordHashOf(record))) || null;
}

/**
 * A dispatch record as the log vouches for it (red-team round 3, CONFIDENCE R3-K05/K08), or null when the log does not
 * vouch for it. A record logged with its recordHash is bound whole, so its fields are read as written. A record logged
 * before round 1 (no recordHash: 195 semi, 1134 knowledge and 29 absolute records in the P11 course) binds only its
 * dispatch, unit, kind, prompt (bundleHash), answer (responseHash) and admission status (logged with the dispatch); every
 * other field of it is editable without trace, so nothing is read from them. What decides currency is DERIVED from
 * what the log binds:
 *   knowledge  contentHash and factHash from the passage its prompt showed (reviewedPassage);
 *   semi       the claims its prompt printed (recordClaimTexts) — "the facts it checked"; its factHash cannot be
 *              derived (the prompt holds the claims, not the unit) and is null: a semi record's currency is its claims;
 *   absolute   the sentences its prompt printed (absolutes.mjs absoluteReviewOf); factHash null likewise.
 * The admission status of a legacy record is the logged one. A field that cannot be derived is null, and nothing may
 * count a record through a null field.
 * Returns { entry, seq, unit, kind, hashed, contentHash, factHash, status }.
 */
export function boundRecord(record, logRecords) {
  const entry = dispatchLogEntry(record, logRecords);
  if (!entry || entry.payload?.kind !== record.kind) return null;
  const p = entry.payload, base = { entry, seq: entry.seq ?? 0, unit: p.unit, kind: p.kind };
  if (p.recordHash) return { ...base, hashed: true, contentHash: record.contentHash ?? null, factHash: record.factHash ?? null, status: record.admission?.status ?? p.status ?? null };
  if (p.kind === "knowledge") {
    const passage = reviewedPassage(record.bundle?.prompt).trim();
    return { ...base, hashed: false, contentHash: passage ? unitHash(passage) : null, factHash: passage ? factHash(passage) : null, status: p.status ?? null };
  }
  return { ...base, hashed: false, contentHash: null, factHash: null, status: p.status ?? null };
}

export function readDispatches(readText, paths) {
  return paths.filter((p) => p.startsWith(VERIFICATION_DIR + "/") && p.endsWith(".json")).sort().map((p) => { try { return JSON.parse(readText(p)); } catch { return null; } }).filter(Boolean);
}

/** The blind-bundle allowlist: a bundle may not name the unit, its file, its origin, or the course. */
export function bundleLeaks(prompt, { unit, deliverable, origin, course } = {}) {
  const f = folded(prompt), leaks = [];
  for (const [what, v] of Object.entries({ unit, deliverable, course, author: origin?.model || origin?.instructor })) if (v && f.includes(folded(v))) leaks.push(what);
  if (/agent-knowledge|instructor-authored|source-derived/.test(prompt)) leaks.push("origin kind");
  return leaks;
}
export { canonicalJson, yearsIn };
