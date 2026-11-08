// How a question reads to the instructor in Alembic's "Needs you" (owner 2026-11-03, STATUS D-133;
// req.host.alembic-needs-wording). Presentation only: what is asked, what an answer records and every finding, basis and
// key stay exactly as the harness made them (alembic_needs.mjs, digest.mjs). This module only words them.
//
//   - a place is named as the instructor sees it ("In the study guide for “Gases”, the passage beginning “…”"), never by
//     file and line; the paths stay in the question's refs, which Alembic shows as page names;
//   - harness codes (decision numbers such as D48, unit and plan-node ids, "spine", commands) never reach the text: a
//     node id is said as the plan's own words, and the codes go to the assistant's hidden copy (assistantCodes);
//   - content is quoted as it reads: orz markup, maths and sub/superscripts rendered to plain text (plainText);
//   - one sentence on what is wrong, one on the suggestion.
import { renderedParts } from "./rendered.mjs";

// ---- content as it reads ----------------------------------------------------------------------------------------
const SUP = Object.fromEntries([..."0123456789+-−=()ni"].map((c, i) => [c, "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ⁿⁱ"[i]]));
const SUB = Object.fromEntries([..."0123456789+-−=()aeoxhklmnpst"].map((c, i) => [c, "₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜ"[i]]));
/** A sub- or superscript as Unicode where every character has one, else written out ("^(…)" reads as typed). */
function script(s, sup) {
  const t = String(s).trim(), map = sup ? SUP : SUB;
  if (!t) return "";
  if (sup && /^(?:\\?circ|°|∘)$/.test(t)) return "°";
  return [...t].every((c) => map[c]) ? [...t].map((c) => map[c]).join("") : `${sup ? "^" : "_"}${t.length > 1 ? `(${t})` : t}`;
}

const GREEK = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω" };
const SYMBOL = { times: "×", cdot: "·", pm: "±", mp: "∓", div: "÷", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈", sim: "∼", simeq: "≃", equiv: "≡", propto: "∝",
  infty: "∞", to: "→", rightarrow: "→", leftarrow: "←", longrightarrow: "→", Rightarrow: "⇒", leftrightarrow: "↔", rightleftharpoons: "⇌", leftrightharpoons: "⇋", uparrow: "↑", downarrow: "↓",
  degree: "°", circ: "∘", partial: "∂", nabla: "∇", sum: "Σ", prod: "Π", int: "∫", ll: "≪", gg: "≫", ldots: "…", cdots: "⋯", dots: "…", hbar: "ħ", ell: "ℓ", AA: "Å", angstrom: "Å",
  lbrace: "{", rbrace: "}", langle: "⟨", rangle: "⟩", "%": "%", "#": "#", "&": "&", "$": "$", "_": "_", "{": "{", "}": "}" };
const SPACE = new Set([",", ";", ":", "!", " ", "quad", "qquad", "enspace", "thinspace", "medspace", "thickspace", "hspace", "left", "right", "big", "Big", "bigg", "Bigg", "displaystyle", "textstyle", "limits", "nolimits"]);
// a text box keeps its spaces; everything else in maths is typeset without the source's spaces
const TEXT = new Set(["text", "textrm", "textit", "textbf", "mbox", "operatorname"]);
const WRAP = new Set(["text", "mathrm", "mathit", "mathbf", "mathsf", "mathtt", "textrm", "textit", "textbf", "operatorname", "mathnormal", "boldsymbol", "bm", "mbox", "unit", "pu", "vec", "bar", "hat", "overline", "underline", "tilde", "dot"]);

/** One brace group (or one token) from s at i: [content, next index]. */
function group(s, i) {
  while (s[i] === " ") i++;
  if (s[i] === "{") {
    let d = 0, j = i;
    for (; j < s.length; j++) { if (s[j] === "\\") { j++; continue; } if (s[j] === "{") d++; else if (s[j] === "}" && --d === 0) break; }
    return [s.slice(i + 1, j), j + 1];
  }
  if (s[i] === "\\") { const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i)); return [m ? m[0] : "\\", i + (m ? m[0].length : 1)]; }
  return [s[i] ?? "", i + 1];
}

/** mhchem's \ce{…} as it prints: N2 + 3H2 <=> 2NH3 → N₂ + 3H₂ ⇌ 2NH₃; Ag+ → Ag⁺; SO4^2- → SO₄²⁻. */
function cePlain(src) {
  const arrows = (t) => t.replace(/<=>>|<<=>|<=>/g, "⇌").replace(/<->/g, "↔").replace(/->/g, "→").replace(/<-/g, "←");
  return arrows(String(src)).split(/(\s+)/).map((tok) => {
    if (/^\s+$/.test(tok) || /^[+⇌↔→←=]$/.test(tok)) return tok;
    let t = tok.replace(/\^\{([^}]*)\}|\^(\S?[+-]|\d+|\S)/g, (_, a, b) => script(a ?? b, true));
    const charge = /^(.*?[A-Za-z)\]])(\d*[+-])$/.exec(t);
    if (charge) t = charge[1] + script(charge[2], true);
    const coef = /^(\d+(?:\/\d+)?)(?=[A-Z(\[])/.exec(t);
    const head = coef ? coef[1] : "", body = t.slice(head.length);
    return head + body.replace(/_\{([^}]*)\}|_(\d+)/g, (_, a, b) => script(a ?? b, false)).replace(/(?<=[A-Za-z)\]])(\d+)/g, (d) => script(d, false));
  }).join("");
}

/** A TeX formula as a reader sees it, in plain text (a readable approximation, never a key). */
export function texPlain(tex) {
  const s = String(tex ?? "");
  let out = "", i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") {
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i)); const name = m ? m[1] : ""; i += m ? m[0].length : 1;
      if (name === "ce") { const [g, j] = group(s, i); out += cePlain(g); i = j; }
      else if (name === "frac" || name === "dfrac" || name === "tfrac") {
        const [a, j] = group(s, i), [b, k] = group(s, j); i = k;
        const pa = texPlain(a), pb = texPlain(b), wrap = (x) => (/^[\p{L}\p{N}.,·×]+$/u.test(x) ? x : `(${x})`);
        out += `${wrap(pa)}/${wrap(pb)}`;
      } else if (name === "sqrt") { const [a, j] = group(s, i); i = j; const p = texPlain(a); out += `√${/^[\p{L}\p{N}.]+$/u.test(p) ? p : `(${p})`}`; }
      else if (TEXT.has(name)) { const [a, j] = group(s, i); i = j; out += ` ${texPlain(a.replace(/ /g, "\\ "))} `; }
      else if (WRAP.has(name)) { const [a, j] = group(s, i); i = j; out += texPlain(a); }
      else if (name === "hspace" || name === "vspace") { const [, j] = group(s, i); i = j; out += " "; }
      else if (SPACE.has(name)) out += name === "!" ? "" : " ";
      else if (GREEK[name]) out += GREEK[name];
      else if (SYMBOL[name]) out += SYMBOL[name];
      else if (/^(ln|log|exp|sin|cos|tan|lim|max|min|det)$/.test(name)) out += ` ${name} `;
      else out += name; // an unknown command: its name, never a backslash
    } else if (c === "^" || c === "_") {
      const [g, j] = group(s, i + 1); i = j;
      out += script(texPlain(g).replace(/\s+/g, ""), c === "^");
    } else if (c === "{" || c === "}" || c === " " || c === "\n" || c === "\t") i++;
    else if (c === "~") { out += " "; i++; }
    else if (c === "-") { out += "−"; i++; }
    else { out += c; i++; }
  }
  return out.replace(/\s+/g, " ").replace(/ ?([=<>≤≥≈±×→⇌+]) ?/g, " $1 ").replace(/\s+/g, " ").replace(/ ([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻₀₁₂₃₄₅₆₇₈₉°])/g, "$1").trim();
}

/**
 * Text as the instructor reads it: orz markup (inline plugins, emphasis, links, lists), comments, struck and hidden
 * text gone; maths and chemistry typeset to plain text; sub/superscripts as Unicode; plan annotations ([anchor: …])
 * dropped. Read from orz-markdown's own token stream (rendered.mjs), as the reader view is.
 */
export function plainText(src) {
  let out = "", scriptOpen = null, buf = "";
  for (const p of renderedParts(String(src ?? "").replace(/\s*\[(?:anchor|prereq|prerequisites?|level|type|count|targets?)\s*:[^\]\n]*\]/gi, ""))) {
    if (p.kind === "mark") {
      if (p.text === "^(" || p.text === "_(") { scriptOpen = p.text[0] === "^"; buf = ""; }
      else if (p.text === ")" && scriptOpen !== null) { out += script(buf, scriptOpen); scriptOpen = null; }
      continue;
    }
    if (p.kind === "hint") continue;
    const t = p.kind === "math" ? texPlain(p.text) : p.kind === "prose" ? p.seen : p.text;
    if (scriptOpen !== null) buf += t; else out += p.kind === "math" ? ` ${t} ` : t;
  }
  return out.replace(/\{\{[^{}]*?\}\}/g, (m) => m.replace(/^\{\{\s*[\w-]+(?:\[[^\]]*\])?\s*/, "").replace(/\}\}$/, "")) // markup left by a fragment the parser could not close
    .replace(/[ \t]+/g, " ").replace(/ *\n+ */g, " ").replace(/ ([,.;:!?)])/g, "$1").replace(/\( /g, "(").replace(/ ?° ?(?=[CFK]\b)/g, " °").trim();
}

/** At most n characters, cut at a word, with an ellipsis. */
export function shorten(s, n) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1), at = cut.lastIndexOf(" ");
  return `${(at > n * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}
// a quoted sentence loses its own full stop: the sentence around it ends it
const quote = (s, n = 140) => `“${shorten(plainText(s), n).replace(/(?<!\.)\.$/, "")}”`;
const firstSentence = (s) => { const t = String(s ?? "").trim(), m = /^([\s\S]*?[.!?])(?=\s+[A-Z“"(]|$)/.exec(t); return m ? m[1] : t; };
export const sentence = (s) => { const t = String(s ?? "").trim().replace(/\s+/g, " "); return !t ? "" : /[.!?…”"]$/.test(t) ? t : `${t}.`; };
const capital = (s) => String(s).replace(/^(\s*[“"(]?)(\p{Ll})/u, (_, a, b) => a + b.toUpperCase());

// ---- places, as the instructor sees them --------------------------------------------------------------------------
const PARTS = [["concepts/", "concept map"], ["assessment-support/", "assessment guide"], ["study-guide/", "study guide"], ["slides/", "slides"], ["practice/", "practice questions"]];
const words = (s) => String(s).replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const slugOf = (rel) => String(rel).split("/").pop().replace(/\.(slides|paged)\.md$/i, "").replace(/\.md$/i, "");

/**
 * The context the wording reads: chapter titles, the plan's nodes (id → its words) and each unit's place and first
 * words. Built once per export (alembic_needs.mjs needsContext); every part is optional.
 */
export function placeOf(rel, ctx = {}) {
  if (!rel) return "";
  if (rel === "concepts/course.md") return "the course map";
  const slug = slugOf(rel), title = ctx.titles?.get?.(slug) || words(slug);
  for (const [dir, name] of PARTS) if (String(rel).startsWith(dir)) return `the ${name} for “${title}”`;
  if (/^(?:inputs\/|sources\/|.*\/sources\/)/.test(String(rel))) return `the source “${slug}”`;
  return `the page “${ctx.titles?.get?.(rel) || words(slug)}”`;
}
/** "the passage beginning “…”" (or the question, the answer) for a unit the context knows. */
function passageOf(id, ctx) {
  const u = ctx.units?.get?.(id);
  if (!u) return "";
  const what = u.form === "question" ? "the question" : u.form === "answer" ? "the answer" : "the passage";
  const start = shorten(plainText(u.text || ""), 70);
  return start ? `${what} beginning “${start}”` : what;
}
/** Where a question is, said as the instructor sees it: "In the study guide for “Gases”, the passage beginning “…”". */
function where(units = [], ctx = {}, file = null) {
  const id = units.find((u) => ctx.units?.get?.(u));
  const rel = (id && ctx.units.get(id).deliverable) || units.map((u) => ctx.deliverableOf?.get?.(u)).find(Boolean) || file;
  return { place: placeOf(rel, ctx), passage: id ? passageOf(id, ctx) : "", rel };
}
const inPlace = (w) => (w.place ? `In ${w.place}` : "In the course");

// ---- harness codes, out of the instructor's text ------------------------------------------------------------------
const FILE = /(?<![\w@/.-])(?:[\w-]+\/)*[\w.-]+\.(?:slides\.md|paged\.md|md|jsonl|json|mjs|js|png|jpe?g|gif|svg|webp|pdf|html)(?![\w/-])/gi;
const NODE = /\b(?:objective|concept|misconception|guide|term|prereq)\.[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+/g;
const UNIT = /\bu-[a-z0-9][a-z0-9-]*[a-z0-9]\b/g;
// a decision or red-team code (D48, R6-K04, C4-01). Narrow on purpose: content has V1, M2, R1 and D2 of its own.
const DECISION = /\b(?:D\d{2,3}[a-z]?|R\d{1,2}-[A-Z]\d{1,3}|[CF]\d-\d{2})\b/g;
const COMMAND = /`?\b(?:node\s+)?(?:<harness>\/)?scripts\/[\w./-]+(?:\s+(?:--?[\w-]+|<[^>]*>|[\w.,:/-]+))*`?/g;

/**
 * What would show a harness trace in an instructor's text: a file path, a line number, a code (a decision, a unit or
 * plan-node id, "spine", a command) or raw markup. Empty when the text reads as the instructor's.
 */
export function harnessTraces(text) {
  const t = String(text ?? ""), out = [];
  const hit = (what, re) => { for (const m of t.matchAll(re)) out.push(`${what}: ${m[0]}`); };
  hit("path", FILE); hit("line", /\blines? \d+/gi); hit("node id", NODE); hit("unit id", UNIT); hit("code", DECISION);
  hit("code", /\bspine\b/gi); hit("command", /\bscripts\/|--[a-z][\w-]*\b/g);
  hit("markup", /\{\{|\}\}|\$|\\[A-Za-z]+|\[(?:anchor|prereq)\s*:|~~|\*\*|<\/?[a-z][^>]*>|\^\{|_\{/g);
  return out;
}

/** The codes a harness text carries, for the assistant's hidden copy (never shown to the instructor). */
export function assistantCodes(...texts) {
  const t = texts.filter(Boolean).map(String).join("\n"), uniq = (re) => [...new Set([...t.matchAll(re)].map((m) => m[0]))];
  const lines = [...t.matchAll(/((?:[\w-]+\/)*[\w.-]+\.(?:slides\.md|paged\.md|md)),? lines? (\d+)/g)].map((m) => `${m[1]}:${m[2]}`);
  return Object.fromEntries(Object.entries({ files: uniq(FILE), lines: [...new Set(lines)], nodes: uniq(NODE), units: uniq(UNIT), decisions: uniq(DECISION), commands: uniq(COMMAND).map((c) => c.replace(/`/g, "").trim()) }).filter(([, v]) => v.length));
}

/**
 * A harness sentence made the instructor's: commands and decision codes dropped, a path said as its page, a unit id as
 * its passage, a plan-node id as the plan's own words, "the spine" as "the plan", markup rendered. The safety net
 * under every question; the per-kind wordings below rarely leave it anything to do.
 */
export function forInstructor(text, ctx = {}) {
  let t = String(text ?? "");
  t = t.replace(/\s*\((?:[^()]*\bscripts\/[^()]*|run it again[^()]*)\)/g, "").replace(/\s*[—:-]\s*run it again\b/gi, "").replace(COMMAND, "")
    .replace(/\s*\((?:(?:red[- ]team|operator|owner|control|coherence|round)[^()]*|[^()]*\b(?:D\d{1,3}|R\d{1,2}(?:-[A-Z]\d+)?)\b[^()]*)\)/gi, "")
    .replace(/\s*\[[^\]]*\b(?:D\d{1,3}|R\d)\b[^\]]*\]/g, "");
  t = t.replace(new RegExp(`(${FILE.source})(?:,? (?:at |on )?lines? (\\d+)(?:\\s*[–-]\\s*\\d+)?)?`, "gi"), (m, file) => placeOf(file, ctx));
  t = t.replace(UNIT, (id) => passageOf(id, ctx) || "this passage");
  t = t.replace(NODE, (id) => { const n = ctx.nodes?.get?.(id); return n ? `“${shorten(plainText(n.text || n.title || ""), 80)}”` : "a point in the plan"; });
  // a chapter's slug (le-chatelier) as its title; only a hyphenated slug, so a plain word of the text is never taken
  for (const [slug, title] of ctx.titles || []) if (slug.includes("-")) t = t.replace(new RegExp(`(?<![\\w/.-])${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w/-])`, "g"), `“${title}”`);
  t = t.replace(DECISION, "").replace(/\b(?:the )?spine'?s?\b/gi, (m) => (/^the/i.test(m) ? `${m[0]}he plan` : m[0] === "S" ? "Plan" : "plan")).replace(/,? (?:at |on )?lines? \d+(?:\s*[–-]\s*\d+)?/gi, "");
  t = plainText(t.replace(/\$(?=\s|$)/g, "")); // a stray dollar left by a cut quote
  return t.replace(/\(\s*\)/g, "").replace(/\s+([,.;:])/g, "$1").replace(/([,;:])(?=[,.;:])/g, "").replace(/\s{2,}/g, " ").trim();
}

// ---- the question, kind by kind -----------------------------------------------------------------------------------
/** The one-click choices for a kind that has none of its own (owner D-133). "Apply" is Coursewerk's word for taking a
 *  reviewer's suggestion (ms8-verdicts acceptedBy reads /^apply/), "Keep" for leaving the text as it is, "Later" defers. */
export const SUGGESTION_CHOICES = Object.freeze(["Apply the suggestion", "Keep it", "Later"]);
const REASONS = { "spine-scope-conflict": "Outside the plan", "missing-input": "Missing input", "rights-blocker": "Rights", "spine-change-request": "A change to the plan" };
/** An interrupt's reason as the instructor reads it. */
export const reasonLabel = (r) => REASONS[r] || capital(String(r || "").replace(/-/g, " "));

/** Parse "<label> is not the type/level its guide entry asks for (<ask>): <why>": [what, ask, why] (balanced parentheses). */
function fidelityParts(note) {
  const at = note.indexOf(" asks for (");
  if (at < 0) return null;
  let d = 0, j = at + " asks for ".length;
  for (; j < note.length; j++) { if (note[j] === "(") d++; else if (note[j] === ")" && --d === 0) break; }
  const head = note.slice(0, at), m = / is not (.*?) its guide entry$/.exec(head);
  return { what: m?.[1] || "what", ask: note.slice(at + " asks for (".length, j), why: note.slice(j + 1).replace(/^:\s*/, "") };
}

/**
 * A digest entry as the instructor reads it: { text, detail, choices? }. `ctx`: placeOf's context (titles, nodes,
 * units, deliverableOf). Choices are offered only where an answer's meaning is Coursewerk's own (see SUGGESTION_CHOICES).
 */
export function wordEntry(e, ctx = {}) {
  const ev = e.evidence || {}, note = String(e.question ?? ""), w = where(e.units || [], ctx, ev.file);
  const at = w.passage ? `${inPlace(w)}, ${w.passage}` : inPlace(w);
  const sugg = ev.suggestion ? quote(ev.suggestion, 160) : "";
  // a harness note is made the instructor's (forInstructor); a reviewer's words are content-level and only rendered:
  // "spine", "V1" or "R1" in them may be the subject's own words
  const fi = (s) => forInstructor(s, ctx), rv = (s) => sentence(plainText(s));
  switch (e.kind) {
    case "detail-in-spine": {
      const kinds = [...new Set((ev.detail || []).map((x) => x.kind))], list = kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} and ${kinds.at(-1)}` : kinds[0] || "detail";
      const what = (ev.detail || []).map((x) => `“${shorten(plainText(x.what), 40)}”`).slice(0, 3).join(", ");
      const target = ev.target?.deliverable ? placeOf(ev.target.deliverable, ctx) : "the study guide";
      return { text: `${inPlace(w)}, the line ${quote(ev.text, 120)} also gives ${list}${what ? ` (${what})` : ""}, more than the plan needs to say. Suggestion: move it to ${target}${ev.target?.section ? `, section “${plainText(ev.target.section)}”` : ""}, and keep the line to what to teach.`,
        detail: "The plan says what to teach, to what level and how to assess. It isn't checked against the sources, so a detail left there is checked only against the other materials; in the study guide it is checked like any fact.",
        choices: SUGGESTION_CHOICES };
    }
    case "spine-review-concern": {
      const pre = /^Possibly wrong \([^)]*\): "/.exec(note), rest = pre ? note.slice(pre[0].length + String(ev.text ?? "").length).replace(/^"\.\s*/, "") : note;
      const sm = /\s*Suggested: "([\s\S]*)"\.\s*$/.exec(rest), problem = sm ? rest.slice(0, sm.index) : rest, s = sm ? sm[1] : "";
      return { text: `${inPlace(w)}, the line ${quote(ev.text, 120)} may be wrong — ${rv(firstSentence(problem))} ${s ? `Suggestion: change it to ${quote(s, 160)}.` : "Suggestion: check the line, and say what it should be."}`,
        detail: [rv(problem) !== rv(firstSentence(problem)) ? `The reviewer: ${rv(problem)}` : "", "A blind reviewer read the lines changed since your last approval."].filter(Boolean).join("\n"),
        ...(s ? { choices: SUGGESTION_CHOICES } : {}) };
    }
    case "knowledge-concern":
      return { text: `${inPlace(w)}, ${quote(ev.quote, 140)} may be wrong — ${rv(firstSentence(note))} ${sugg ? `Suggestion: ${sugg}.` : "Suggestion: check it, and say what it should be."}`,
        detail: [rv(note) !== rv(firstSentence(note)) ? `The reviewer: ${rv(note)}` : "", "A blind reviewer raised this about your text, so it is yours to decide."].filter(Boolean).join("\n"), ...(sugg ? { choices: SUGGESTION_CHOICES } : {}) };
    case "clarification-proposed": {
      const problem = note.replace(/^Clarify: "[\s\S]*?" → "[\s\S]*?"\.\s*/, (m) => (ev.quote != null && ev.suggestion != null && m.startsWith(`Clarify: "${ev.quote}" → "${ev.suggestion}".`) ? "" : m));
      return { text: `${inPlace(w)}, ${quote(ev.quote, 140)} is right as meant but could be clearer — ${rv(firstSentence(problem))} Suggestion: ${sugg}.`,
        detail: [rv(problem) !== rv(firstSentence(problem)) ? `The reviewer: ${rv(problem)}` : "", "Your wording stays unless you apply the suggestion; your credit for the text stays either way."].filter(Boolean).join("\n"), choices: SUGGESTION_CHOICES };
    }
    case "instructor-edit-unasked": {
      const removed = ev.now === "" && ev.after === "";
      const fact = /a fact changed \(/.test(note) ? " (a value changed)" : "";
      const text = ev.suggestion
        ? `${at}: your text was changed without asking you: ${quote(ev.quote, 120)} was replaced by the reviewer's suggestion ${sugg}. Keep the change, or have your text put back?`
        : removed ? `${inPlace(w)}, a passage you wrote was removed without asking you: ${quote(ev.quote, 160)}. Keep it removed, or have it put back?`
        : `${at}: your text was changed without asking you${fact}: ${quote(ev.quote, 120)} now reads ${quote(ev.now, 120)}. Keep the change, or have your text put back?`;
      return { text, detail: "“Revert” puts your own text back." };
    }
    case "exercise-data-confirm":
      return { text: `${at}: the values ${quote(String(ev.quote || "").split(" | ")[0], 140)} read as made-up exercise data, which no source can check. Confirm them as teaching examples?`,
        detail: String(ev.quote || "").includes(" | ") ? `All of them: ${String(ev.quote).split(" | ").map((x) => quote(x, 200)).join("; ")}` : "" };
    case "confirmation-stale":
      return { text: `${at}: you confirmed its facts before, but the text has changed since. It now reads ${quote(ev.quote, 200)} — confirm it as it reads now?`, detail: "" };
    case "fact-disputed": {
      const c = (ev.conflicts || [])[0];
      return { text: `${at}: a source disagrees with ${quote(ev.claimText || ev.quote || "", 140)}${c ? `: the text says ${shorten(plainText(c.claimed), 60)}, a source says ${shorten(plainText(c.source), 60)}` : ""}. Keep it as written, or change it?`,
        detail: (ev.conflicts || []).filter((x) => x.sentence).map((x) => `The source: ${quote(x.sentence, 300)}`).join("\n") };
    }
    case "unit-unknown-authorship": {
      const n = (e.units || []).length || 1;
      return { text: `${inPlace(w)}, ${n === 1 ? "a passage was" : `${n} passages were`} changed outside the assistant's work${w.passage ? ` (${n === 1 ? "" : "the first is "}${w.passage})` : ""}. If you wrote ${n === 1 ? "it" : "them"}, accept ${n === 1 ? "it" : "them"} as yours; otherwise say who did, or have ${n === 1 ? "it" : "them"} reverted.`, detail: "" };
    }
    case "off-spine":
      return { text: `${at}: a reviewer found that it teaches nothing in the chapter's approved plan. Keep it (the plan may need it), or drop it?`,
        detail: /Reviews of this same text disagree/.test(note) ? "Two reviews of this text disagree; the one that found it off the plan stands until the text changes or you answer." : "", choices: ["Keep it", "Drop it", "Later"] };
    case "assessment-fidelity-instructor": {
      const f = fidelityParts(note);
      return { text: `${at}: ${f ? `it is not ${f.what} its assessment-guide entry asks for (${fi(f.ask)})` : "it does not match its assessment-guide entry"}. Suggestion: revise it to match the entry, or keep it and say why.`,
        detail: f ? `The reviewer: ${rv(f.why.replace(/\s*\(Reviews of this same text disagree[\s\S]*\)\s*$/, ""))}` : sentence(fi(note)) };
    }
    case "ambiguous-answer": {
      const vals = /two different values of one dimension \(([^)]*)\)/.exec(note)?.[1], snip = /: "([^"]*)"/.exec(note)?.[1];
      return { text: `${inPlace(w)}, the answer ${snip ? `${quote(snip, 120)} ` : ""}gives two different values${vals ? ` (${plainText(vals)})` : ""}, so a student cannot tell which is the answer. Suggestion: leave one value as the answer, and move the other into the question or an explanation.`, detail: "" };
    }
    case "no-photograph": {
      const ch = /chapter (\S+) has no real photograph/.exec(note)?.[1];
      return { text: `${ch ? `The chapter “${ctx.titles?.get?.(ch) || words(ch)}”` : "A chapter"} has no real photograph. Suggestion: add a photograph you have the rights to use, or say why the chapter does without one.`, detail: "" };
    }
    case "carrier-build-failed":
      return { text: `A preview could not be built — ${sentence(fi(note.replace(/^the carrier preview did not build:\s*/, "")))} Suggestion: let the assistant fix it, or say what to change.`, detail: "" };
    default: {
      // the agent's own critique of the plan, or a kind worded nowhere above: its sentence, made the instructor's
      const body = sentence(fi(note));
      return { text: w.place && !body.toLowerCase().includes(w.place.toLowerCase()) ? `${at}: ${body}` : capital(body), detail: "" };
    }
  }
}

/** A recommendation said for the instructor ("Recommended (the assistant): …"), or "" when it is not plain words. */
export function recommendationLine(e, ctx = {}) {
  const rec = e.recommendation == null ? "" : String(e.recommendation).trim();
  if (!rec || e.recommendedBy === "check" || /^revise:/i.test(rec)) return ""; // a check's or a reviewer's: already the suggestion
  return `Recommended${String(e.recommendedBy || "").startsWith("agent") ? " by the assistant" : ""}: ${sentence(forInstructor(rec, ctx))}`;
}

/** What a correction changed, as it reads: the changed words with a little context on each side. */
export function changedSpan(before, after, context = 4) {
  const a = plainText(before).split(" "), b = plainText(after).split(" ");
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0; while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const from = Math.max(0, i - context), cut = (x) => x.slice(from, Math.min(x.length, x.length - j + context)).join(" ");
  const pre = from > 0 ? "…" : "", post = (x) => (x.length - j + context < x.length ? "…" : "");
  return { was: `${pre}${shorten(cut(a), 160)}${post(a)}`, now: `${pre}${shorten(cut(b), 160)}${post(b)}` };
}
