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

export function knowledgeBundle(text, nonce = randomBytes(8).toString("hex"), { before = "", after = "", referenced = "", label = null } = {}) {
  // the text around the passage, so a unit is read as a student reads it (an answer with its question, a sentence
  // with the equation that follows) — P11 dev. Concerns are still only about the passage's own words. What the
  // passage refers to by number ("the answer to Q3") is shown too, labelled, so a reference is never guessed (P11 pass 4).
  const around = [referenced && ["TEXT THE PASSAGE REFERS TO (context only)", String(referenced).trim(), ""], before && ["TEXT BEFORE THE PASSAGE (context only)", String(before).trim(), ""], after && ["TEXT AFTER THE PASSAGE (context only)", String(after).trim(), ""]].filter(Boolean).flat();
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
