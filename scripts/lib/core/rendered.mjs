// THE READER VIEW (red team R5, cause 1 — "bindings read text that differs from what the reader sees"; D46). Every
// binding that is about what a reader reads is derived from this one module, never from the source text or a private
// normalisation:
//   - review currency — a link/framing review (alignment.mjs reviewBasis) and an absolute-statement review
//     (absolutes.mjs absolutesHash) stay current exactly while the reader sees the same words and symbols: meaningKey;
//   - the answer-to-question binding and a reference by number (dependencies.mjs questionHash, `question:`/`ref:`):
//     lightKey;
//   - the light test of a spine change (change.mjs spineWording, D43): lightKey; its fact, sign and operator checks
//     read readerView;
//   - a key term's use and an anaphoric reference (dependencies.mjs termMatcher, anaphoric): readerView, beside the
//     source.
// Identity and evidence keys are NOT reader-view based, by design (D17): a unit's identity (segment.mjs unitHash /
// contentHash), the evidence a semi-mechanical check admitted (factHash on `evidence`), a knowledge review's binding to
// the exact passage it quoted (R3-K08), an instructor's confirmation of exact text, and the spine/term targets (a spine
// change is classified on this view when it is approved, and a light one is accepted through that approval).
//
// What a reader sees is read from orz-markdown's own token stream (red team R4 coherence F1, F8; control C4-01) and,
// for maths, from KaTeX — the typesetter orz-markdown renders with — so the view is the text AS RENDERED:
//   prose — text tokens, entities decoded (markdown-it), Unicode NFC, invisible format characters (soft hyphen, zero-
//           width space/joiners, word joiner, BOM) gone, a no-break space a space; emphasis, links and list markers gone;
//           a link's destination and title, struck text (`~~…~~`, <del>, <s>, <strike>), comments and hidden HTML
//           dropped; a container's printed label and a plugin block's text kept;
//   math  — KaTeX's MathML of the `$…$`/`$$…$$` source, written back as a canonical linear form (mathView): what is
//           only typesetting vanishes — grouping braces, spacing commands (\, \; \quad \ ~ \hspace), sizing
//           (\left \big \displaystyle \dfrac), synonyms that print one glyph (\le/\leq/≤, \to/\rightarrow, -/−,
//           \text{K}/\mathrm{K}, \ln/\operatorname{ln}); every sign, relation, arrow, script, fraction, root,
//           accent, font (italic K vs upright K) and symbol stays (`^` vs `_`, `\ce{->}` vs `\ce{<-}`, `/` vs `*`). A
//           formula KaTeX cannot typeset is shown to the reader as its source, and is kept as its source;
//   code  — inline and block code, as written.
// Sub- and superscripts in prose (H~2~O, 10^3^) are marked, so a subscript never reads as a superscript.
//
// The fail-safe direction: if the reader sees a different word or symbol, every key derived here changes; if the
// reader sees the same thing, none does.
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { md } = require_("orz-markdown");
// KaTeX as orz-markdown typesets with it: the instance markdown-it-katex loads, with mhchem registered by orz-markdown
const fromOrz = createRequire(require_.resolve("orz-markdown"));
const katex = createRequire(fromOrz.resolve("@traptitech/markdown-it-katex"))("katex");

// what prints nothing: soft hyphen, Mongolian vowel separator, zero-width space/joiners, direction marks, word joiner,
// invisible operators (function application, times, separator, plus), BOM
const INVISIBLE = /[\u00AD\u180E\u200B-\u200F\u2060-\u2064\uFEFF]/g;
/** Text as it prints: NFC, invisible format characters gone, a no-break space a space. */
export const printedChars = (s) => String(s ?? "").normalize("NFC").replace(INVISIBLE, "").replace(/[\u00A0\u2007\u202F]/g, " ");
const decodeEntity = (m) => md.utils.unescapeAll(m);
const decodeEntities = (s) => String(s).replace(/&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, decodeEntity);

// ---- maths as typeset ---------------------------------------------------------------------------------------------
// KaTeX's MathML, parsed (it is well-formed XML) and written back canonically. Grouping (<mrow> in a sequence),
// <mstyle> without colour, <mpadded> and <semantics> are spliced; <mspace>, <mphantom> (printed invisible) and the
// TeX <annotation> are dropped; a whitespace-only <mtext> is a space. Consecutive upright letters and text of one font
// are one run ("\text{kJ mol}" = "\mathrm{kJ\,mol}"); a space inside a run is kept, any other space is the
// typesetter's. Attributes that only set spacing, size or stretch are dropped; every other attribute is kept.
const SPLICE = new Set(["#root", "span", "math", "semantics", "mrow", "mpadded", "mstyle"]);
const DROP = new Set(["annotation", "annotation-xml", "mphantom"]);
const TYPESET_ATTRS = new Set(["xmlns", "display", "class", "width", "height", "depth", "lspace", "rspace", "voffset", "stretchy", "minsize", "maxsize", "fence", "separator", "form", "accent", "accentunder", "displaystyle", "scriptlevel", "rowspacing", "columnspacing", "columnalign", "rowalign", "movablelimits", "largeop", "symmetric", "encoding", "side", "minlabelspacing", "linebreak"]);
function parseMathml(html) {
  const root = { name: "#root", attrs: {}, children: [] }, stack = [root];
  for (const m of String(html).matchAll(/<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g)) {
    if (m[5] != null) { stack.at(-1).children.push(decodeEntities(m[5])); continue; }
    if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
    const node = { name: m[2], attrs: Object.fromEntries([...m[3].matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1], decodeEntities(a[2])])), children: [] };
    stack.at(-1).children.push(node);
    if (!m[4]) stack.push(node);
  }
  return root;
}
const textOf = (n) => (typeof n === "string" ? n : n.children.map(textOf).join(""));
const keptAttrs = (n) => Object.entries(n.attrs).filter(([k]) => !TYPESET_ATTRS.has(k)).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(",");
function atomsOf(children, out = []) {
  for (const c of children) {
    if (typeof c === "string") { const s = printedChars(c); if (s.trim()) out.push({ t: "str", s: s.trim() }); else if (s) out.push({ t: "space" }); continue; }
    const n = c.name;
    if (DROP.has(n)) continue;
    if (n === "mspace") { out.push({ t: "space" }); continue; }
    if (n === "mstyle" && (c.attrs.mathcolor || c.attrs.mathbackground)) { out.push({ t: "str", s: `\\color[${keptAttrs(c)}]{${serial(c.children)}}` }); continue; }
    if (SPLICE.has(n)) { atomsOf(c.children, out); continue; }
    if (["mi", "mn", "mo", "mtext", "ms"].includes(n)) { leaf(c, out); continue; }
    out.push({ t: "str", s: structure(c) });
  }
  return out;
}
function leaf(c, out) {
  const raw = printedChars(textOf(c)), text = raw.replace(/\s+/g, " ");
  if (c.name === "mtext" || c.name === "ms") {
    if (!text.trim()) { out.push({ t: "space" }); return; }
    if (/^\s/.test(text)) out.push({ t: "space" });
    out.push({ t: "up", v: c.attrs.mathvariant || "normal", s: text.trim() });
    if (/\s$/.test(text)) out.push({ t: "space" });
    return;
  }
  if (!text.trim()) return; // an invisible operator (function application, invisible times)
  if (c.name === "mi") {
    const v = c.attrs.mathvariant || ([...text.trim()].length > 1 ? "normal" : "italic");
    out.push(v === "normal" ? { t: "up", v, s: text.trim() } : { t: "str", s: v === "italic" ? text.trim() : `\\mv[${v}]{${text.trim()}}` });
  } else if (c.name === "mn") out.push(c.attrs.mathvariant && c.attrs.mathvariant !== "normal" ? { t: "str", s: `\\mv[${c.attrs.mathvariant}]{${text.trim()}}` } : { t: "num", s: text.trim() });
  else out.push({ t: "str", s: text.trim() }); // mo: the glyph, whatever spacing or stretch it was given
}
/** Atoms → the canonical string: upright runs and digit runs merged, spaces kept only inside an upright run. */
function serial(children) {
  const atoms = atomsOf(children), out = [];
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i], last = out.at(-1);
    if (a.t === "space") {
      // a space between two upright atoms of one font is part of the run ("kJ mol"); anywhere else it is spacing
      const next = atoms.slice(i + 1).find((x) => x.t !== "space");
      if (last?.t === "up" && next?.t === "up" && next.v === last.v && !last.s.endsWith(" ")) last.s += " ";
      continue;
    }
    if (a.t === "up" && last?.t === "up" && last.v === a.v) { last.s += a.s; continue; }
    if (a.t === "num" && last?.t === "num") { last.s += a.s; continue; }
    out.push({ ...a });
  }
  // inside a run, a space next to a sign or punctuation is spacing ("x + y" = "x+y"); between two words it is a word gap
  const run = (t) => t.replace(/\s+/g, " ").trim().replace(/ ?([^\p{L}\p{N} ]) ?/gu, "$1");
  return out.map((a) => (a.t === "up" ? `\\text${a.v === "normal" ? "" : `[${a.v}]`}{${run(a.s)}}` : a.s)).join(" ");
}
const arg = (n) => { const s = serial([n]); return [...s].length === 1 ? s : `{${s}}`; };
function structure(c) {
  const k = c.children.filter((x) => typeof x !== "string" || x.trim()), a = keptAttrs(c), at = a ? `[${a}]` : "";
  switch (c.name) {
    case "msub": return `${arg(k[0])}_${arg(k[1])}`;
    case "msup": return `${arg(k[0])}^${arg(k[1])}`;
    case "msubsup": return `${arg(k[0])}_${arg(k[1])}^${arg(k[2])}`;
    case "mfrac": return `\\frac${at}{${serial([k[0]])}}{${serial([k[1]])}}`;
    case "msqrt": return `\\sqrt{${serial(k)}}`;
    case "mroot": return `\\root{${serial([k[1]])}}{${serial([k[0]])}}`;
    default: return `\\${c.name}${at}${k.map((x) => `{${serial([x])}}`).join("")}`;
  }
}
const mathCache = new Map();
/**
 * A formula as the reader sees it typeset: KaTeX's MathML (the typesetter orz-markdown uses) written back in a
 * canonical linear form. "T = 298\ \text{K}" and "T = 298\ {\text{K}}" are one view; "K_c" and "K^c" are not.
 */
export function mathView(src) {
  const tex = String(src ?? "");
  if (mathCache.has(tex)) return mathCache.get(tex);
  let v;
  try { v = serial(parseMathml(katex.renderToString(tex, { output: "mathml", throwOnError: true, strict: "ignore", displayMode: false })).children); }
  catch { v = `\\error{${printedChars(tex).replace(/\s+/g, " ").trim()}}`; } // the reader sees the source
  if (mathCache.size > 20000) mathCache.delete(mathCache.keys().next().value);
  mathCache.set(tex, v);
  return v;
}

// raw HTML whose content the reader does not see: struck text, and any element marked hidden
const STRUCK_TAGS = new Set(["del", "s", "strike"]);
const HIDES = /\bhidden\b|display\s*:\s*none|visibility\s*:\s*hidden/i;
const OPEN_TAG = /^<([A-Za-z][A-Za-z0-9-]*)\b([^>]*?)(\/?)>$/, CLOSE_TAG = /^<\/([A-Za-z][A-Za-z0-9-]*)\s*>$/;

function inlineParts(children, out, push) {
  let hidden = 0; const htmlStack = [];
  for (const t of children || []) {
    if (t.type === "s_open") { hidden++; continue; }
    if (t.type === "s_close") { hidden = Math.max(0, hidden - 1); continue; }
    if (t.type === "html_inline") {
      const s = t.content.trim();
      if (/^<!--/.test(s)) continue;
      const o = OPEN_TAG.exec(s), c = CLOSE_TAG.exec(s);
      if (o && !o[3]) { const hides = STRUCK_TAGS.has(o[1].toLowerCase()) || HIDES.test(o[2]); htmlStack.push(hides); if (hides) hidden++; }
      else if (c) { const hides = htmlStack.pop(); if (hides) hidden = Math.max(0, hidden - 1); }
      continue;
    }
    if (hidden) continue;
    if (t.type === "text") push("prose", t.content);
    else if (t.type === "softbreak" || t.type === "hardbreak") push("prose", " ");
    else if (t.type === "code_inline") push("code", t.content);
    else if (t.type === "math_inline") push("math", t.content);
    else if (t.type === "sub_open") push("mark", "_(");
    else if (t.type === "sup_open") push("mark", "^(");
    else if (t.type === "sub_close" || t.type === "sup_close") push("mark", ")");
    else if (t.type === "image") inlineParts(t.children, out, push);
    else if (/_open$|_close$/.test(t.type)) continue; // emphasis, links (their destination and title), marks: markup
    else if (t.children?.length) inlineParts(t.children, out, push);
    else if (t.content) push("prose", t.content);
  }
}

const cache = new Map();
/**
 * The parts a reader sees: [{ kind: "prose" | "math" | "code" | "mark", text, seen }]. `text` is the part as the token
 * stream gives it (maths as its TeX source); `seen` (prose only) is what prints — the same, except that raw HTML's
 * entities are decoded (markdown-it has already decoded them in text tokens). Read through readerView, meaningKey and
 * lightKey; `text` is kept for the frozen pre-R5 keys that migrations compare against.
 */
export function renderedParts(text) {
  const src = String(text ?? "");
  if (cache.has(src)) return cache.get(src);
  const out = [];
  const push = (kind, s, seen = s) => { const last = out[out.length - 1]; if (last && last.kind === kind && kind === "prose") { last.text += s; last.seen += seen; } else out.push(kind === "prose" ? { kind, text: s, seen } : { kind, text: s }); };
  let tokens = null;
  try { tokens = md.parse(src, {}); } catch { tokens = null; }
  if (!tokens) out.push({ kind: "prose", text: src, seen: src });
  else for (const t of tokens) {
    if (t.type === "inline") { inlineParts(t.children, out, push); push("prose", "\n"); }
    else if (t.type === "math_block") { push("math", t.content); push("prose", "\n"); }
    else if (t.type === "fence" || t.type === "code_block") { push("code", t.content); push("prose", "\n"); }
    else if (t.type === "html_block") {
      // a block of raw HTML: what is outside comments and struck or hidden elements, without its tags
      let h = t.content.replace(/<!--[\s\S]*?(?:-->|$)/g, " ");
      h = h.replace(/<(del|s|strike)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ").replace(/<([a-z][a-z0-9-]*)\b[^>]*?(?:\bhidden\b|display\s*:\s*none|visibility\s*:\s*hidden)[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
      // R4's reading (a bare "<" taken for a tag) is kept in `text` for the frozen key; what prints keeps "Q < K"
      const seen = decodeEntities(h.replace(/<\/?[A-Za-z][^>]*>|<![^>]*>/g, " ") + "\n");
      h = h.replace(/<[^>]*>/g, " ") + "\n";
      push("prose", h, seen);
    }
    else if (t.type === "plugin_block") push("prose", `${t.info || ""} ${t.content || ""}\n`);
    else if (/^container_.+_open$/.test(t.type) && String(t.info || "").trim()) push("prose", String(t.info).trim().split(/\s+/).slice(1).join(" ") + "\n");
  }
  if (cache.size > 20000) cache.delete(cache.keys().next().value);
  cache.set(src, out);
  return out;
}

const viewCache = new Map();
/**
 * THE READER VIEW: the text as rendered for a reader — markup, struck, hidden and link-destination text gone, entities
 * decoded, invisible characters gone, each formula as typeset (`$…$` around mathView), case kept, whitespace collapsed.
 * What a key term and an anaphoric reference are matched on (R4 F1), and what a spine change's facts are read from.
 */
export function readerView(text) {
  const src = String(text ?? "");
  if (viewCache.has(src)) return viewCache.get(src);
  const v = renderedParts(src).map((p) => (p.kind === "math" ? ` $${mathView(p.text)}$ ` : p.kind === "mark" ? "" : p.kind === "prose" ? printedChars(p.seen) : p.text)).join("")
    .replace(/[ \t]+/g, " ").replace(/ *\n+ */g, "\n").trim();
  if (viewCache.size > 20000) viewCache.delete(viewCache.keys().next().value);
  viewCache.set(src, v);
  return v;
}

// Prose punctuation that is not a sign, a relation, an arrow or an operator: changing it is light. Everything else a
// reader sees is a word for the light test (R4 F8, C4-01): ↑ ↓, ≪ ≫, ⩽ ⩾, lookalike minus signs (– － ⁻), charges,
// `/` and `*`, `^` and `_`, arrows in any spelling. A hyphen joining two letters ("gas-phase") is punctuation.
const PROSE_PUNCT = /[.,;:!?'"‘’“”«»()[\]{}…—·•]/gu;
const tokenize = (s) => s.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) || [];
// a capitalized word ("Which", "Argon"): a sentence start or a title, read as the word; a symbol or acronym ("K",
// "pH", "NaCl", "ATP") keeps its case
const CAPITALIZED = /^\p{Lu}\p{Ll}+$/u;
// The light key folds letter case in the TeX source, then typesets it: "\\mathrm{K}" = "\\mathrm{k}", "\\Delta" = "\\delta"
// (a letter's case), but a command whose case names another symbol keeps it ("\\Rightarrow" ⇒ is not "\\rightarrow" →).
const GREEK = /^\\(?:var)?(?:Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)$/;
export const texCaseFolded = (tex) => String(tex).replace(/\\[A-Za-z]+|[^\\]+|\\./g, (m) => (m[0] !== "\\" || GREEK.test(m) ? m.toLowerCase() : m));
function keyOf(src, foldCase) {
  const toks = [];
  for (const p of renderedParts(src)) {
    if (p.kind === "mark") { toks.push(p.text); continue; }
    if (p.kind === "math") { toks.push(`$${mathView(foldCase ? texCaseFolded(p.text) : p.text)}$`); continue; }
    let s = printedChars(p.kind === "prose" ? p.seen : p.text);
    if (foldCase) s = s.toLowerCase();
    if (p.kind === "prose") s = s.replace(/(?<=\p{L})-(?=\p{L})/gu, " ").replace(PROSE_PUNCT, " ");
    const t = tokenize(s);
    toks.push(...(foldCase || p.kind !== "prose" ? t : t.map((w) => (CAPITALIZED.test(w) ? w.toLowerCase() : w))));
  }
  return toks.join(" ");
}
const keyCache = [new Map(), new Map()];
const cachedKey = (text, foldCase) => {
  const src = String(text ?? ""), c = keyCache[foldCase ? 1 : 0];
  if (c.has(src)) return c.get(src);
  const k = keyOf(src, foldCase);
  if (c.size > 20000) c.delete(c.keys().next().value);
  c.set(src, k);
  return k;
};
/**
 * THE MEANING KEY: the meaning-bearing words and symbols a reader sees, in order. Two texts share it exactly when they
 * differ only by what does not print or does not mean: whitespace and line breaks, emphasis and other markup, list
 * markers, struck/hidden/commented/link-destination text, prose punctuation that is not a sign, relation, arrow or
 * operator, the capital of a capitalized word, and typesetting-only TeX. Symbols keep their case ("ln K" is not
 * "ln k"); every sign, relation, arrow, script and symbol is a token.
 * Binds: a link/framing review's currency (alignment.mjs) and an absolute-statement review's (absolutes.mjs) — a
 * review stays current exactly while the reader is shown the same thing it judged.
 */
export const meaningKey = (text) => cachedKey(text, false);
/**
 * THE LIGHT KEY: the meaning key with letter case folded everywhere (in maths, in the TeX source before it is
 * typeset, as the R4 key did). D43 counts letter case as light, so a spine
 * change is light exactly when this key is unchanged (change.mjs spineWording; a case change of a symbol is still a
 * fact change there, read by factTokens). The answer-to-question and reference binding (dependencies.mjs
 * questionHash) is on this key too: its stamps were written on a case-folded key (R4), and only a key no finer than
 * the old one lets them migrate exactly (see dependencies.mjs); a case change of a symbol in a question still reaches
 * the answer through its `unit:` edge (unitTargetHash: fact tokens, case-sensitive).
 */
export const lightKey = (text) => cachedKey(text, true);

/**
 * The light key as round 4 computed it (maths as lower-cased TeX source tokens; entities in raw HTML and invisible
 * characters as written). FROZEN: only read to migrate `q2:` stamps (dependencies.mjs), never to bind.
 */
export function lightKeyR4(text) {
  const toks = [];
  for (const p of renderedParts(String(text ?? ""))) {
    if (p.kind === "mark") { toks.push(p.text); continue; }
    let s = p.text.toLowerCase();
    if (p.kind === "prose") s = s.replace(/(?<=\p{L})-(?=\p{L})/gu, " ").replace(PROSE_PUNCT, " ");
    toks.push(...tokenize(s));
  }
  return toks.join(" ");
}
