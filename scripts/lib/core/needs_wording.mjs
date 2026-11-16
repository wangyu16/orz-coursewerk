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
import { createRequire } from "node:module";
import { renderedParts } from "./rendered.mjs";

// ---- content as it reads ----------------------------------------------------------------------------------------
// Maths and chemistry are read from KaTeX's own MathML — the typesetter orz-markdown renders with, with mhchem
// registered — so a formula reads as it prints (audit round 1, HIGH-2): \ce{NO3-} is NO₃⁻ and \ce{Fe3+} is Fe₃⁺ exactly
// as mhchem typesets them, \pu{J K-1} is J K⁻¹. A readable rendering, never a key (the keys are rendered.mjs's).
const require_ = createRequire(import.meta.url);
const orz = require_("orz-markdown"); // registers mhchem on its KaTeX
const katex = createRequire(createRequire(require_.resolve("orz-markdown")).resolve("@traptitech/markdown-it-katex"))("katex");
// one KaTeX, the one orz-markdown renders with (as rendered.mjs checks it)
if (katex.version !== orz.KATEX_VERSION) throw new Error(`needs_wording.mjs: KaTeX ${katex.version} is not the ${orz.KATEX_VERSION} orz-markdown renders with`);
// orz-markdown's own guards (dist/index.js: MAX_TEX, TEX_DEFINES; not exported): a formula over 10,000 characters or one
// that defines macros is shown as its source, never expanded (a \def chain took minutes; audit round 2, MEDIUM-G)
const MAX_TEX = 10000;
const TEX_DEFINES = /\\(def|gdef|edef|xdef|let|futurelet|newcommand|renewcommand|providecommand|DeclareMathOperator|newenvironment)(?![A-Za-z])/;

const SUP = Object.fromEntries([..."0123456789+-−=()ni"].map((c, i) => [c, "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ⁿⁱ"[i]]));
const SUB = Object.fromEntries([..."0123456789+-−=()aeoxhklmnpst"].map((c, i) => [c, "₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜ"[i]]));
/** A sub- or superscript as Unicode where every character has one, else written out ("^(…)" reads as typed). */
function script(s, sup) {
  const t = String(s).replace(/\s+/g, " ").trim(), map = sup ? SUP : SUB;
  if (!t) return "";
  if (sup && /^(?:∘|°|\\circ)$/.test(t)) return "°";
  if (sup && /^[′″‴⊖⦵∗*†‡]$/.test(t)) return t; // a prime, a standard-state or a starred sign prints beside its base
  return [...t].every((c) => map[c]) ? [...t].map((c) => map[c]).join("") : `${sup ? "^" : "_"}${t.length > 1 ? `(${t})` : t}`;
}

const DECODE = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " " };
const decode = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : DECODE[e] ?? m));
function parseMathml(html) {
  const root = { name: "#root", attrs: {}, children: [] }, stack = [root];
  for (const m of String(html).matchAll(/<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g)) {
    if (m[5] != null) { stack.at(-1).children.push(decode(m[5])); continue; }
    if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
    const node = { name: m[2], attrs: Object.fromEntries([...m[3].matchAll(/([\w:-]+)="([^"]*)"/g)].map((x) => [x[1], decode(x[2])])), children: [] };
    stack.at(-1).children.push(node);
    if (!m[4]) stack.push(node);
  }
  return root;
}
const REL = new Set([..."=<>≤≥≠≈≡∼≃≅∝⇌⇋⇄→←↔⇒⇐⇔⟶⟵⟷↑↓∈∉⊂⊆⊃⊇:"]);
const BIN = new Set([..."+−-±∓×·÷⊕⊗∗"]);
const FUNC = /^(?:ln|log|lg|exp|sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|arcsin|arccos|arctan|lim|max|min|det|deg|dim|gcd|sup|inf|Pr|arg)$/;
const kids = (n) => (n.children || []).filter((c) => typeof c !== "string" || c.trim() || n.name === "mtext");
const textOf = (n) => (typeof n === "string" ? n : (n.children || []).map(textOf).join(""));
/** A MathML node as plain text; `sc`: inside a sub- or superscript (no operator spacing there). */
function mathNode(n, sc) {
  if (typeof n === "string") return n;
  const c = kids(n), at = (i) => (c[i] ? mathNode(c[i], sc) : "");
  const wrap = (x) => (/^[\p{L}\p{N}.,·×′⁰-⁹₀-₉⁺⁻]+$/u.test(x) ? x : `(${x})`);
  switch (n.name) {
    case "annotation": case "annotation-xml": case "mphantom": return "";
    case "mspace": { const w = parseFloat(n.attrs.width || "0"); return w >= 0.15 ? " " : ""; }
    case "mtext": return textOf(n).replace(/ /g, " ");
    case "mi": case "mn": case "ms": { const t = textOf(n); return FUNC.test(t) && !sc ? ` ${t}` : t; }
    case "mo": {
      const t = textOf(n);
      if (t === "⁡") return " "; // function application: "ln K"
      if (sc) return t;
      if (REL.has(t)) return `\u0001${t}\u0001`;
      if (BIN.has(t)) return `\u0002${t}\u0002`;
      return t;
    }
    case "msub": return at(0) + script(mathNode(c[1], true), false);
    case "msup": return at(0) + script(mathNode(c[1], true), true);
    case "msubsup": return at(0) + script(mathNode(c[1], true), false) + script(mathNode(c[2], true), true);
    case "mover": case "munder": case "munderover": {
      // an accent is kept as the combining mark it prints (x̄, Ĥ, F⃗, ν̃, Å; audit round 2, HIGH-A)
      const base = at(0);
      if (n.attrs.accent === "true" || n.attrs.accentunder === "true") return accented(base, textOf(c[1] || "").trim(), n.name === "munder");
      // conditions over and under an arrow, read top first (MathML gives under, then over: LOW-J)
      const parts = n.name === "munderover" ? [c[2], c[1]] : [c[1]];
      const extra = parts.map((x) => (x ? finishMath(mathNode(x, true)) : "")).filter(Boolean);
      if (!extra.length) return base;
      // inside a script no spacing sentinel was opened, so none is closed (audit round 3, MEDIUM-3)
      return !sc && REL.has(base.replace(/[\u0001\s]/g, "")) ? `${base.replace(/\u0001$/, "")}(${extra.join(", ")})\u0001` : `${base.replace(/[\u0001\u0002]/g, "")}(${extra.join(", ")})`;
    }
    case "menclose": {
      // an enclosure stays visible: a strike as struck letters, a box or a circle around its content
      const inner = c.map((x) => mathNode(x, sc)).join(""), how = String(n.attrs.notation || "");
      if (/strike/.test(how)) return [...finishMath(inner)].map((ch) => (/\s/.test(ch) ? ch : `${ch}\u0336`)).join("");
      if (/box/.test(how)) return `[${finishMath(inner)}]`;
      if (/circle/.test(how)) return `(${finishMath(inner)})`;
      return inner;
    }
    case "mfrac": { const a = finishMath(at(0)), b = finishMath(at(1)); return n.attrs.linethickness === "0px" ? `${a} ${b}` : `${wrap(a)}/${wrap(b)}`; } // a binomial's own parentheses are its fences
    case "msqrt": return `√${wrap(finishMath(c.map((x) => mathNode(x, sc)).join("")))}`;
    case "mroot": return `${script(mathNode(c[1], true), true)}√${wrap(finishMath(at(0)))}`;
    case "mtable": return c.map((r) => kids(r).map((x) => finishMath(mathNode(x, sc))).join(" ")).join("; ");
    default: return c.map((x) => mathNode(x, sc)).join("");
  }
}
// the spacing accent KaTeX prints → the combining mark it stands for
const ACCENT = { "ˉ": "\u0304", "¯": "\u0304", "‾": "\u0305", "^": "\u0302", "ˆ": "\u0302", "~": "\u0303", "˜": "\u0303", "⃗": "\u20D7", "→": "\u20D7", "←": "\u20D6",
  "˙": "\u0307", "¨": "\u0308", "˚": "\u030A", "ˇ": "\u030C", "´": "\u0301", "`": "\u0300", "˘": "\u0306" };
/** A base with its accent: one letter takes the mark; a longer base takes a line (over or under) on every letter, any
 *  other mark on its last letter. An accent with no combining form is written after the base. */
function accented(base, mark, under) {
  const b = finishMath(base), comb = under ? (mark ? "\u0332" : "") : ACCENT[mark];
  if (!comb) return mark ? `${b}${mark}` : b;
  const chars = [...b];
  if (chars.length > 1 && (comb === "\u0305" || comb === "\u0304" || comb === "\u0332")) return chars.map((ch) => `${ch}${comb === "\u0304" ? "\u0305" : comb}`).join("").normalize("NFC");
  return `${b}${comb}`.normalize("NFC");
}
/** Operator spacing: a relation always spaced; + − × spaced as a binary operator, kept tight as a sign. */
function finishMath(s) {
  let out = "";
  for (const part of String(s).split(/(\u0001[^\u0001]*\u0001|\u0002[^\u0002]*\u0002)/)) {
    if (part.startsWith("\u0001")) out = `${out.trimEnd()} ${part.slice(1, -1)} `;
    else if (part.startsWith("\u0002")) {
      const sign = !out.trim() || /[(\[{,;:=<>≤≥≠≈≡∝⇌→←↔⇒−+±∓×·÷]$/.test(out.trimEnd()); // after nothing, an opening or an operator
      out = sign ? out + part.slice(1, -1) : `${out.trimEnd()} ${part.slice(1, -1)} `;
    } else out += part;
  }
  return out.replace(/[\u0001\u0002]/g, "").replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();
}
// orz-markdown's per-document budgets (exported: MAX_TEX_TOTAL, MAX_CHEM_TOTAL, MAX_KATEX_OUTPUT): past them the page
// shows a formula as its source, and so does the wording (audit round 3, LOW-6). chemLength mirrors orz-markdown's:
// the characters inside every \ce{…}/\pu{…}, nested ones counted once.
function chemLength(tex) {
  let total = 0;
  const re = /\\(?:ce|pu)(?![A-Za-z])\s*\{/g;
  for (let m = re.exec(tex); m; m = re.exec(tex)) {
    let depth = 1, i = m.index + m[0].length;
    const start = i;
    for (; i < tex.length && depth > 0; i++) { const c = tex[i]; if (c === "\\") i++; else if (c === "{") depth++; else if (c === "}") depth--; }
    total += i - start; re.lastIndex = i;
  }
  return total;
}
/** A fresh per-document budget (one passage, one note). */
export const mathBudget = () => ({ tex: 0, chem: 0, out: 0 });
/** A TeX formula (with mhchem's \ce and \pu) as a reader sees it, in plain text. `budget`: the document's (plainText's). */
export function mathPlain(tex, budget = mathBudget()) {
  const src = String(tex ?? "");
  // a formula the page shows as its source (too long, a macro definition, past the document's budget, or one KaTeX
  // cannot typeset) reads as its source, as written (MEDIUM-G, LOW-I, LOW-6)
  if (src.length > MAX_TEX || TEX_DEFINES.test(src)) return src.trim();
  const chem = chemLength(src);
  if (budget.tex + src.length > orz.MAX_TEX_TOTAL || budget.chem + chem > orz.MAX_CHEM_TOTAL || budget.out > orz.MAX_KATEX_OUTPUT) return src.trim();
  budget.tex += src.length; budget.chem += chem;
  let html;
  try { html = katex.renderToString(src, { output: "mathml", throwOnError: true, strict: "ignore" }); }
  catch { return src.trim(); }
  budget.out += html.length;
  return finishMath(mathNode(parseMathml(html), false)).normalize("NFC");
}
/** Text a reviewer or the agent wrote (plain words, not markdown): only its `$…$` maths and orz inline markup rendered,
 *  so "2*3*4" stays as written (audit round 1, LOW-3). */
export function lightText(src) {
  const budget = mathBudget();
  return String(src ?? "")
    // orz-markdown's dollar rule (markdown-it-katex): an opening $ not followed by a space, a closing $ not after a
    // space nor before a digit — "$25 per student and $40" is money, not a formula (LOW-M)
    .replace(/\$\$([\s\S]+?)\$\$|\$(?=\S)([^$\n]*?[^\s\\])\$(?!\d)/g, (m, a, b) => mathPlain(a ?? b, budget))
    .replace(/\{\{\s*[\w-]+(?:\[[^\]]*\])?\s+([^{}]*?)\}\}/g, "$1")
    .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*|__(?=\S)([^_\n]*?\S)__/g, (m, x, y) => x ?? y) // strong emphasis; a lone * is the text's own
    .replace(/\s*\[(?:anchor|prereq|prerequisites?)\s*:[^\]\n]*\]/gi, "")
    .replace(CONTROL, " ").replace(/\s+/g, " ").trim();
}
/** What Alembic refuses in a line of plain text (agent-api.ts oneLine): control characters but tab and newline. */
export const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

/** A quote cut from inside orz markup, or a table row, read as text (D-133 audit round 4, LOW-5): an unmatched "}}"
 *  (the quote began inside `{{sp[info] …}}`) and an unclosed "{{name[…] " (it ended inside) are dropped; a table's
 *  separator row goes, and its cells read as "a; b; c". */
function cutMarkup(src) {
  let t = src;
  // an unclosed opening: "{{name" or "{{name[args]" with no "}}" after it
  t = t.replace(/\{\{\s*[\w-]+(?:\[[^\]\n]*\]?)?\s*(?![^{}]*\}\})/g, "");
  // an unmatched closing: "}}" with no "{{" before it
  let depth = 0;
  t = t.replace(/\{\{|\}\}/g, (m) => (m === "{{" ? (depth++, m) : depth > 0 ? (depth--, m) : ""));
  return t.split("\n").filter((l) => !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l))
    .map((l) => (/^\s*\|.*\|\s*$/.test(l) ? l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()).filter(Boolean).join("; ") : l)).join("\n");
}

/**
 * Text as the instructor reads it: orz markup (inline plugins, emphasis, links, lists), comments, struck and hidden
 * text gone; maths and chemistry typeset to plain text; sub/superscripts as Unicode; plan annotations ([anchor: …])
 * dropped. Read from orz-markdown's own token stream (rendered.mjs), as the reader view is.
 */
export function plainText(src) {
  let out = "", scriptOpen = null, buf = "";
  const budget = mathBudget();
  for (const p of renderedParts(cutMarkup(String(src ?? "")).replace(/\s*\[(?:anchor|prereq|prerequisites?|level|type|count|targets?)\s*:[^\]\n]*\]/gi, ""))) {
    if (p.kind === "mark") {
      if (p.text === "^(" || p.text === "_(") { scriptOpen = p.text[0] === "^"; buf = ""; }
      else if (p.text === ")" && scriptOpen !== null) { out += script(buf, scriptOpen); scriptOpen = null; }
      continue;
    }
    if (p.kind === "hint") continue;
    const t = p.kind === "math" ? mathPlain(p.text, budget) : p.kind === "prose" ? p.seen : p.text;
    if (scriptOpen !== null) buf += t; else out += p.kind === "math" ? ` ${t} ` : t;
  }
  return out.replace(CONTROL, " ").replace(/\{\{[^{}]*?\}\}/g, (m) => m.replace(/^\{\{\s*[\w-]+(?:\[[^\]]*\])?\s*/, "").replace(/\}\}$/, "")) // markup left by a fragment the parser could not close
    .replace(/[ \t]+/g, " ").replace(/ *\n+ */g, " ").replace(/ ([,.;:!?)])/g, "$1").replace(/\( /g, "(").replace(/ ?° ?(?=[CFK]\b)/g, " °").trim();
}

/** At most n characters, cut at a word, with an ellipsis. */
export function shorten(s, n) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1), at = cut.lastIndexOf(" ");
  return `${(at > n * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}
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
  if (/^private\//.test(String(rel))) return `“${slug}” (in the assistant's records)`;
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
  // a passage the finding names but the text no longer holds (re-segmented or removed since) is said so, never "it"
  // with nothing before it (D-133, a teacher-reviewer's reading of General Chemistry, 2026-11-16)
  const gone = !id && units.length && ctx.units ? "a passage that is no longer in the text as it stands" : "";
  return { place: placeOf(rel, ctx), passage: id ? passageOf(id, ctx) : gone, rel };
}
const inPlace = (w) => (w.place ? `In ${w.place}` : "In the course");

// ---- harness codes, out of the instructor's text ------------------------------------------------------------------
const FILE = /(?<![\w@/.-])(?:[\w-]+\/)*[\w.-]+\.(?:slides\.md|paged\.md|md|jsonl|json|mjs|js|png|jpe?g|gif|svg|webp|pdf|html)(?![\w/-])/gi;
const NODE = /\b(?:objective|concept|misconception|guide|term|prereq)\.[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+/g;
// a unit id as the index makes it: u-<deliverable>-<section>-<ordinal> ("u-tube" is a word, not a unit)
const UNIT = /\bu-[a-z0-9]+(?:-[a-z0-9]+)*-\d+\b/g;
// a decision or red-team code (D48, R6-K04, C4-01). Narrow on purpose: content has V1, M2, R1, D2 and D50 of its own.
const CODE = String.raw`(?:D\d{2,3}[a-z]?|R\d{1,2}-[A-Z]\d{1,3}|[CF]\d-\d{2})`;
const DECISION = new RegExp(String.raw`\b${CODE}\b`, "g");
// a parenthesis or bracket that holds nothing but codes: "(D48)", "[D49, R6-K04]"
const CODES_ONLY = new RegExp(String.raw`\s*[(\[]\s*${CODE}(?:\s*[,;]\s*${CODE})*\s*[)\]]`, "g");
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

/** The codes a harness text carries, for the assistant's hidden copy (never shown to the instructor). Each list holds
 *  at most 20 entries of at most 160 characters (audit round 1, LOW-2). */
export const CODE_LIMITS = Object.freeze({ items: 20, chars: 160 });
export function assistantCodes(...texts) {
  const t = texts.filter(Boolean).map(String).join("\n");
  const uniq = (list) => [...new Set(list)].slice(0, CODE_LIMITS.items).map((x) => (x.length > CODE_LIMITS.chars ? `${x.slice(0, CODE_LIMITS.chars - 1)}…` : x));
  const all = (re) => [...t.matchAll(re)].map((m) => m[0]);
  const lines = [...t.matchAll(/((?:[\w-]+\/)*[\w.-]+\.(?:slides\.md|paged\.md|md)),? lines? (\d+)/g)].map((m) => `${m[1]}:${m[2]}`);
  return Object.fromEntries(Object.entries({ files: uniq(all(FILE)), lines: uniq(lines), nodes: uniq(all(NODE)), units: uniq(all(UNIT)), decisions: uniq(all(DECISION)), commands: uniq(all(COMMAND).map((c) => c.replace(/`/g, "").trim())) }).filter(([, v]) => v.length));
}

/**
 * A sentence made the instructor's. In every text, only exact harness codes go: a command, a parenthesis of codes only
 * ("(D48)"), a path (with the line right after it) said as its page, a unit id as its passage, a plan-node id as the
 * plan's own words, a chapter slug as its title. `from: "harness"` (a note Coursewerk's code wrote) also drops a bare
 * decision code and a line number, says "the spine" as "the plan", and renders the note as markdown; `from: "agent"`
 * (the agent's or a reviewer's own words) keeps every word, and renders only its maths and orz inline markup
 * (audit round 1, MEDIUM-2, LOW-3).
 */
export function forInstructor(text, ctx = {}, { from = "harness" } = {}) {
  const harness = from === "harness";
  let t = String(text ?? "");
  t = t.replace(/\s*\([^()]*\bscripts\/[^()]*\)/g, "").replace(COMMAND, "");
  // a decision code is the harness's only in its own notes: in the agent's or a reviewer's words "(D65)" is a value
  // (audit round 2, MEDIUM-H); the hidden copy keeps every code either way
  if (harness) t = t.replace(CODES_ONLY, "").replace(/\s*[—:-]\s*run it again\b/gi, "")
    // a check's index and field names (ms2-rights: "source[2]: evidenceSnapshot does not exist") (round 4, LOW-6)
    .replace(/\bsource\[\d+\]:\s*evidenceSnapshot does not exist:?\s*/gi, "the saved copy of a source's licence page is missing: ")
    .replace(/\b(?:source|item|entry|unit)\[\d+\]:\s*/gi, "")
    .replace(/\b[a-z]{2,}(?:[A-Z][a-z]+)+\b/g, (m) => m.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
  // a course path (with the line right after it) as its page; in the agent's words only a path with a folder, so a
  // file name such as "fig-2.png" stays as written (LOW-M)
  t = t.replace(new RegExp(`(${FILE.source})(?:,? (?:at |on )?lines? (\\d+)(?:\\s*[–-]\\s*\\d+)?)?`, "gi"), (m, file) => (harness || file.includes("/") ? placeOf(file, ctx) : m));
  t = t.replace(UNIT, (id) => passageOf(id, ctx) || "this passage");
  t = t.replace(NODE, (id) => { const n = ctx.nodes?.get?.(id); return n ? `“${shorten(plainText(n.text || n.title || ""), 80)}”` : "a point in the plan"; });
  // a chapter's slug (le-chatelier) as its title; only a hyphenated slug, so a plain word of the text is never taken
  for (const [slug, title] of ctx.titles || []) if (slug.includes("-")) t = t.replace(new RegExp(`(?<![\\w/.-])${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w/-])`, "g"), `“${title}”`);
  if (harness) {
    t = t.replace(DECISION, "").replace(/\b(?:the )?spine'?s?\b/gi, (m) => (/^the/i.test(m) ? `${m[0]}he plan` : m[0] === "S" ? "Plan" : "plan")).replace(/,? (?:at |on )?lines? \d+(?:\s*[–-]\s*\d+)?/gi, "");
    t = plainText(t.replace(/\$(?=\s|$)/g, "")); // a stray dollar left by a cut quote
  } else t = lightText(t);
  return t.replace(/\(\s*\)/g, "").replace(/\s+([,.;:])/g, "$1").replace(/([,;:])(?=[,.;:])/g, "").replace(/\s{2,}/g, " ").trim();
}

// ---- the question, kind by kind -----------------------------------------------------------------------------------
/** The one-click choices for a reviewer's suggestion (owner D-133). "Apply" is Coursewerk's word for taking a
 *  reviewer's suggestion (ms8-verdicts acceptedBy reads /^apply/); "Change it differently" asks for another change, in
 *  the instructor's words (audit round 1, MEDIUM-4), as fact-disputed's "Change it" does; "Keep" leaves the text as it
 *  is; "Later" defers. */
export const SUGGESTION_CHOICES = Object.freeze(["Apply the suggestion", "Change it differently", "Keep it", "Later"]);
/** Detail in the plan: move it, or keep it. */
export const MOVE_CHOICES = Object.freeze(["Apply the suggestion", "Keep it", "Later"]);
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
 * A digest entry as the instructor reads it: { text, detail, choices?, shown }. `ctx`: placeOf's context (titles,
 * nodes, units, deliverableOf). Choices are offered only where an answer's meaning is Coursewerk's own.
 * `shown`: the words an answer would adopt or confirm, in full ([{ text, page }]); `unseen`: a unit the answer binds
 * could not be read. An instructor never adopts or confirms words they cannot see (audit rounds 1 and 2): the question
 * puts them first in its detail, and offers no one-click choice when they cannot all be shown.
 */
export function wordEntry(e, ctx = {}) {
  const ev = e.evidence || {}, note = String(e.question ?? ""), w = where(e.units || [], ctx, ev.file);
  const at = w.passage ? `${inPlace(w)}, ${w.passage}` : inPlace(w);
  // shown: [{ text, page }] — page: the course page (the question's link) holds these exact words; a reviewer's
  // suggestion and a removed passage are on no page, so they are always shown in full (audit round 2, MEDIUM-E)
  const shown = [];
  let unseen = false;
  // content is rendered as markdown (plainText); the reviewer's and the agent's own words only for their maths
  // (lightText): "spine", "V1", "2*3*4" in them are the subject's own
  const show = (label, src, n, render = plainText) => {
    const full = render(src ?? "").replace(/\s+/g, " ").trim(), cut = shorten(full, n);
    if (cut !== full) shown.push({ text: `${label}: “${full}”`, page: true });
    return `“${cut.replace(/(?<!\.)\.$/, "")}”`;
  };
  const offPage = (label, src, n, render = plainText, suggestion = false) => {
    const full = render(src ?? "").replace(/\s+/g, " ").trim();
    shown.push({ text: `${label}: “${full}”`, page: false, ...(suggestion ? { suggestion: true } : {}) });
    return `“${shorten(full, n).replace(/(?<!\.)\.$/, "")}”`;
  };
  // P2 (round 2): an answer that confirms or adopts what the units hold binds each unit's WHOLE text (confirmUnits,
  // claimAuthorship, adoptInstructorText): every whole text is shown; one the context cannot read leaves the question
  // without a one-click choice (`unseen`)
  const binds = () => {
    shown.splice(0, shown.length, ...shown.filter((x) => !x.page));
    // an unasked edit's "keep" adopts every holder of the instructor's text (adoptInstructorText): all are shown (round 4)
    const units = [...new Set((e.units || []).flatMap((u) => (e.kind === "instructor-edit-unasked" ? ctx.adopts?.get?.(u) || [u] : [u])))];
    if (!units.length) unseen = true;
    units.forEach((u, i) => {
      const t = ctx.units?.get?.(u)?.text;
      if (!t || !t.trim()) unseen = true;
      else shown.push({ text: `${units.length > 1 ? `Passage ${i + 1}` : "The whole passage"}: “${plainText(t)}”`, page: true });
    });
  };
  const out = (o) => ({ ...o, shown, unseen });
  const fi = (s) => forInstructor(s, ctx), rv = (s) => sentence(lightText(s));
  const sugg = (n = 160) => (ev.suggestion ? offPage("The suggestion in full", ev.suggestion, n, lightText, true) : "");
  switch (e.kind) {
    case "detail-in-spine": {
      const kinds = [...new Set((ev.detail || []).map((x) => x.kind))], list = kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} and ${kinds.at(-1)}` : kinds[0] || "detail";
      const what = (ev.detail || []).map((x) => `“${shorten(plainText(x.what), 40)}”`).slice(0, 3).join(", ");
      const target = ev.target?.deliverable ? placeOf(ev.target.deliverable, ctx) : "the study guide";
      return out({ text: `${inPlace(w)}, the line ${show("The whole line", ev.text, 120)} also gives ${list}${what ? ` (${what})` : ""}, more than the plan needs to say. Suggestion: move it to ${target}${ev.target?.section ? `, section “${plainText(ev.target.section)}”` : ""}, and keep the line to what to teach.`,
        detail: "The plan says what to teach, to what level and how to assess. It isn't checked against the sources, so a detail left there is checked only against the other materials; in the study guide it is checked like any fact.",
        choices: MOVE_CHOICES });
    }
    case "spine-review-concern": {
      const pre = /^Possibly wrong \([^)]*\): "/.exec(note), rest = pre ? note.slice(pre[0].length + String(ev.text ?? "").length).replace(/^"\.\s*/, "") : note;
      const sm = /\s*Suggested: "([\s\S]*)"\.\s*$/.exec(rest), problem = sm ? rest.slice(0, sm.index) : rest, s = sm ? sm[1] : "";
      return out({ text: `${inPlace(w)}, the line ${show("The whole line", ev.text, 120)} may be wrong — ${rv(firstSentence(problem))} ${s ? `Suggestion: change it to ${offPage("The suggestion in full", s, 160, lightText, true)}.` : "Suggestion: check the line, and say what it should be."}`,
        detail: [rv(problem) !== rv(firstSentence(problem)) ? `The reviewer: ${rv(problem)}` : "", "A blind reviewer read the lines changed since your last approval."].filter(Boolean).join("\n"),
        ...(s ? { choices: SUGGESTION_CHOICES } : {}) });
    }
    case "knowledge-concern": {
      const q = show("The text in full", ev.quote, 140), s = sugg();
      // with a suggestion the reviewer found it wrong (a clarification of the instructor's text comes as
      // clarification-proposed); without one it may be a clarification (ms8-verdicts): worded neutrally (MEDIUM-3)
      return out({ text: s ? `${inPlace(w)}, ${q} may be wrong — ${rv(firstSentence(note))} Suggestion: ${s}.`
        : `${inPlace(w)}, a reviewer raised a point about ${q}: ${rv(firstSentence(note))} Suggestion: check it, and say whether it should change.`,
        detail: [rv(note) !== rv(firstSentence(note)) ? `The reviewer: ${rv(note)}` : "", "A blind reviewer raised this about your text, so it is yours to decide."].filter(Boolean).join("\n"), ...(s ? { choices: SUGGESTION_CHOICES } : {}) });
    }
    case "clarification-proposed": {
      const problem = note.replace(/^Clarify: "[\s\S]*?" → "[\s\S]*?"\.\s*/, (m) => (ev.quote != null && ev.suggestion != null && m.startsWith(`Clarify: "${ev.quote}" → "${ev.suggestion}".`) ? "" : m));
      const s = sugg();
      return out({ text: `${inPlace(w)}, ${show("The text in full", ev.quote, 140)} is right as meant but could be clearer — ${rv(firstSentence(problem))} ${s ? `Suggestion: ${s}.` : "Suggestion: say how it should read."}`,
        detail: [rv(problem) !== rv(firstSentence(problem)) ? `The reviewer: ${rv(problem)}` : "", "Your wording stays unless you apply the suggestion; your credit for the text stays either way."].filter(Boolean).join("\n"), ...(s ? { choices: SUGGESTION_CHOICES } : {}) });
    }
    case "instructor-edit-unasked": {
      const removed = ev.now === "" && ev.after === "";
      const fact = /a fact changed \(/.test(note) ? " (a value changed)" : "";
      const text = ev.suggestion
        ? `${at}: your text was changed without asking you: ${show("Your text was", ev.quote, 120)} was replaced by the reviewer's suggestion ${show("It now reads", ev.suggestion, 160, lightText)}. Keep the change, or have your text put back?`
        : removed ? `${inPlace(w)}, a passage you wrote was removed without asking you: ${offPage("The removed passage", ev.before || ev.quote, 160)}. Keep it removed, or have it put back?`
        : `${at}: your text was changed without asking you${fact}: ${show("Your text was", ev.quote, 120)} now reads ${show("It now reads", ev.now, 120)}. Keep the change, or have your text put back?`;
      // "Keep" adopts the passage as it now stands: the whole of it is shown (a removal: the removed passage)
      if (!removed) binds();
      return out({ text, detail: "“Revert” puts your own text back." });
    }
    case "exercise-data-confirm": {
      const all = String(ev.quote || "").split(" | ").filter((x) => x.trim()), first = show("The values in full", all[0] || "", 140);
      binds(); // "Confirm" confirms every fact of the passage, not only these values (MEDIUM-L)
      return out({ text: `${at}: the values ${first} read as made-up exercise data, which no source can check. Confirm them as teaching examples?`, detail: "" });
    }
    case "confirmation-stale": {
      // ev.quote is the passage cut at 400 characters (obligations.mjs); "Confirm" binds the whole of it (HIGH-C)
      const t = `${at}: you confirmed its facts before, but the text has changed since. It now reads ${show("It now reads", ev.quote, 200)} — confirm it as it reads now?`;
      binds();
      return out({ text: t, detail: "" });
    }
    case "fact-disputed": {
      const c = (ev.conflicts || [])[0];
      const claim = show("The text in full", ev.claimText || ev.quote || "", 140);
      binds(); // "Keep as written" confirms the whole passage (MEDIUM-L)
      return out({ text: `${at}: a source disagrees with ${claim}${c ? `: the text says ${shorten(plainText(c.claimed), 60)}, a source says ${shorten(plainText(c.source), 60)}` : ""}. Keep it as written, or change it?`,
        detail: (ev.conflicts || []).filter((x) => x.sentence).map((x) => `The source: “${plainText(x.sentence)}”`).join("\n") });
    }
    case "unit-unknown-authorship": {
      const n = (e.units || []).length || 1;
      binds(); // "Accept as mine" claims every passage: each is shown as it reads, or no one-click choice (MEDIUM-D)
      return out({ text: `${inPlace(w)}, ${n === 1 ? "a passage was" : `${n} passages were`} changed outside the assistant's work${w.passage ? ` (${n === 1 ? "" : "the first is "}${w.passage})` : ""}. If you wrote ${n === 1 ? "it" : "them"}, accept ${n === 1 ? "it" : "them"} as yours; otherwise say who did, or have ${n === 1 ? "it" : "them"} reverted.`, detail: "" });
    }
    case "off-spine": {
      const t = ctx.units?.get?.((e.units || [])[0])?.text;
      if (t && t.trim()) shown.push({ text: `The passage: “${plainText(t)}”`, page: true });
      else unseen = true; // Keep it / Drop it on a passage the question cannot show: answered in words instead
      return out({ text: `${at}: a reviewer found that it teaches nothing in the chapter's approved plan. Keep it (the plan may need it), or drop it?`,
        detail: /Reviews of this same text disagree/.test(note) ? "Two reviews of this text disagree; the one that found it off the plan stands until the text changes or you answer." : "", choices: ["Keep it", "Drop it", "Later"] });
    }
    case "assessment-fidelity-instructor": {
      const f = fidelityParts(note);
      // the entry's own words (its type, level and title) are the plan's content: rendered, never the harness pass (MEDIUM-H)
      return out({ text: `${at}: ${f ? `it is not ${f.what} its assessment-guide entry asks for (${lightText(f.ask.replace(/"([^"]*)"/g, "“$1”"))})` : "it does not match its assessment-guide entry"}. Suggestion: revise it to match the entry, or keep it and say why.`,
        detail: f ? `The reviewer: ${rv(f.why.replace(/\s*\(Reviews of this same text disagree[\s\S]*\)\s*$/, ""))}` : sentence(fi(note)) });
    }
    case "ambiguous-answer": {
      const vals = /two different values of one dimension \(([^)]*)\)/.exec(note)?.[1], snip = /: "([^"]*)"/.exec(note)?.[1];
      return out({ text: `${inPlace(w)}, the answer ${snip ? `${show("The answer in full", snip, 120)} ` : ""}gives two different values${vals ? ` (${plainText(vals)})` : ""}, so a student cannot tell which is the answer. Suggestion: leave one value as the answer, and move the other into the question or an explanation.`, detail: "" });
    }
    case "no-photograph": {
      const ch = /chapter (\S+) has no real photograph/.exec(note)?.[1];
      return out({ text: `${ch ? `The chapter “${ctx.titles?.get?.(ch) || words(ch)}”` : "A chapter"} has no real photograph. Suggestion: add a photograph you have the rights to use, or say why the chapter does without one.`, detail: "" });
    }
    case "carrier-build-failed":
      return out({ text: `A preview could not be built — ${sentence(fi(note.replace(/^the carrier preview did not build:\s*/, "")))} Suggestion: let the assistant fix it, or say what to change.`, detail: "" });
    default: {
      // the agent's own critique of the plan is the agent's words; any other kind is a harness note
      const body = sentence(e.module === "spine-critique" ? forInstructor(note, ctx, { from: "agent" }) : fi(note));
      // the note may name the place itself (with typographic quotes): said once
      const same = (x) => x.toLowerCase().replace(/[‘’]/g, "'");
      return out({ text: w.place && !same(body).includes(same(w.place)) ? `${at}: ${body}` : capital(body), detail: "" });
    }
  }
}

/** A recommendation said for the instructor ("Recommended (the assistant): …"), or "" when it is not plain words. */
export function recommendationLine(e, ctx = {}) {
  const rec = e.recommendation == null ? "" : String(e.recommendation).trim();
  if (!rec || e.recommendedBy === "check" || /^revise:/i.test(rec)) return ""; // a check's or a reviewer's: already the suggestion
  return `Recommended${String(e.recommendedBy || "").startsWith("agent") ? " by the assistant" : ""}: ${sentence(forInstructor(rec, ctx, { from: "agent" }))}`;
}

/** What a correction changed, as it reads: the changed words with a little context on each side. */
export function changedSpan(before, after, context = 4, { full = false } = {}) {
  const a = plainText(before).split(" "), b = plainText(after).split(" ");
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0; while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const from = Math.max(0, i - context), cut = (x) => x.slice(from, Math.min(x.length, x.length - j + context)).join(" ");
  const pre = from > 0 ? "…" : "", post = (x) => (x.length - j + context < x.length ? "…" : "");
  if (full) return { was: `${pre}${cut(a)}${post(a)}`, now: `${pre}${cut(b)}${post(b)}` };
  return { was: `${pre}${shorten(cut(a), 160)}${post(a)}`, now: `${pre}${shorten(cut(b), 160)}${post(b)}` };
}
