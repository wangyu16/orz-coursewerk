// What a reader SEES of a markdown text, read from orz-markdown's own token stream (red team R4 coherence, F1, F8;
// control C4-01). The light test, an answer's binding to its question and a key term's use are judged on this, never
// on the source: a word moved into a link destination ("does [](not) shift") is gone for the reader, "**Endothermic**
// reaction" reads "Endothermic reaction", and a list marker, emphasis or a soft line break prints nothing.
//
// The rendered text is a list of parts, in order:
//   prose — text tokens (emphasis, links and list markers gone; a link's destination, struck text — `~~…~~`, <del>,
//           <s>, <strike> — comments and hidden HTML dropped), a container's printed label, a plugin block's text;
//   math  — `$…$`/`$$…$$` source, kept whole (`^` vs `_`, `\ce{->}` vs `\ce{<-}`, `/` vs `*` are the reader's);
//   code  — inline and block code, as written.
// Sub- and superscripts (H~2~O, 10^3^) are marked, so a subscript never reads as a superscript.
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { md } = require_("orz-markdown");

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
    else if (/_open$|_close$/.test(t.type)) continue; // emphasis, links (their destination), marks: markup
    else if (t.children?.length) inlineParts(t.children, out, push);
    else if (t.content) push("prose", t.content);
  }
}

const cache = new Map();
/** The parts a reader sees: [{ kind: "prose" | "math" | "code" | "mark", text }]. */
export function renderedParts(text) {
  const src = String(text ?? "");
  if (cache.has(src)) return cache.get(src);
  const out = [];
  const push = (kind, s) => { const last = out[out.length - 1]; if (last && last.kind === kind && kind === "prose") last.text += s; else out.push({ kind, text: s }); };
  let tokens = null;
  try { tokens = md.parse(src, {}); } catch { tokens = null; }
  if (!tokens) out.push({ kind: "prose", text: src });
  else for (const t of tokens) {
    if (t.type === "inline") { inlineParts(t.children, out, push); push("prose", "\n"); }
    else if (t.type === "math_block") { push("math", t.content); push("prose", "\n"); }
    else if (t.type === "fence" || t.type === "code_block") { push("code", t.content); push("prose", "\n"); }
    else if (t.type === "html_block") {
      // a block of raw HTML: what is outside comments and struck or hidden elements, without its tags
      let h = t.content.replace(/<!--[\s\S]*?(?:-->|$)/g, " ");
      h = h.replace(/<(del|s|strike)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ").replace(/<([a-z][a-z0-9-]*)\b[^>]*?(?:\bhidden\b|display\s*:\s*none|visibility\s*:\s*hidden)[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
      push("prose", h.replace(/<[^>]*>/g, " ") + "\n");
    }
    else if (t.type === "plugin_block") push("prose", `${t.info || ""} ${t.content || ""}\n`);
    else if (/^container_.+_open$/.test(t.type) && String(t.info || "").trim()) push("prose", String(t.info).trim().split(/\s+/).slice(1).join(" ") + "\n");
  }
  if (cache.size > 20000) cache.delete(cache.keys().next().value);
  cache.set(src, out);
  return out;
}

const viewCache = new Map();
/** The text as a reader sees it, markup gone (math kept as `$…$`, case kept): what a key term is matched on (F1). */
export function readerView(text) {
  const src = String(text ?? "");
  if (viewCache.has(src)) return viewCache.get(src);
  const v = renderedParts(src).map((p) => (p.kind === "math" ? ` $${p.text}$ ` : p.kind === "mark" ? "" : p.text)).join("").replace(/[ \t]+/g, " ").replace(/ *\n+ */g, "\n").trim();
  if (viewCache.size > 20000) viewCache.delete(viewCache.keys().next().value);
  viewCache.set(src, v);
  return v;
}

// Prose punctuation that is not a sign, a relation, an arrow or an operator: changing it is light. Everything else a
// reader sees is a word for the light test (R4 F8, C4-01): ↑ ↓, ≪ ≫, ⩽ ⩾, lookalike minus signs (– － ⁻), charges,
// `/` and `*`, `^` and `_`, arrows in any spelling. A hyphen joining two letters ("gas-phase") is punctuation.
const PROSE_PUNCT = /[.,;:!?'"‘’“”«»()[\]{}…—·•]/gu;
const tokenize = (s) => s.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) || [];
const lightCache = new Map();
/**
 * The light key of a text (D43 inverted, R4 F8/C4-01): two texts are a light change of each other exactly when they
 * differ only by whitespace, emphasis, list markers, letter case and prose punctuation that is not a sign, relation,
 * arrow or operator. Read on the RENDERED text: struck, hidden and link-destination text is not there.
 */
export function lightKey(text) {
  const src = String(text ?? "");
  if (lightCache.has(src)) return lightCache.get(src);
  const toks = [];
  for (const p of renderedParts(src)) {
    if (p.kind === "mark") { toks.push(p.text); continue; }
    let s = p.text.toLowerCase();
    if (p.kind === "prose") s = s.replace(/(?<=\p{L})-(?=\p{L})/gu, " ").replace(PROSE_PUNCT, " ");
    toks.push(...tokenize(s));
  }
  const key = toks.join(" ");
  if (lightCache.size > 20000) lightCache.delete(lightCache.keys().next().value);
  lightCache.set(src, key);
  return key;
}
