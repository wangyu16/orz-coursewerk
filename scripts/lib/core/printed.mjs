// What a deliverable PRINTS, read from orz-markdown itself (red team round 3, CONTROL C3-03/04/06/07, C1-05). The
// segmenter decides what a unit is, but whether a line prints is not its own grammar's call: it is the house parser's.
// One parse (orz-markdown's token stream, the parser the frames render with) answers, per source line:
//   - printed: the line puts text on the page (a paragraph, heading, table row, list text, code, maths, a plugin
//     element, raw HTML, or the label of a container that prints one — `::: spoil <label>` (its <summary>) and
//     `::: tab <label>` (its tab button));
//   - blocks: where each `{{name …}}` block really starts and ends (orz ends it at the first line CONTAINING "}}");
//   - includes: every `{{md}}`/`{{markdown}}`/`{{md-include}}` include orz renders, in any form it accepts (one line,
//     `[args]`, or spread over lines — `{{md` / path / `}}`), anywhere a block can stand (containers, lists, quotes);
//   - hidden: raw HTML that can hide what it wraps from the reader while the review still reads it.
// Deterministic and offline: parsing never reads an included file (that happens only when rendering).
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { md } = require_("orz-markdown");

export const INCLUDE_ALIASES = Object.freeze(["markdown", "md", "md-include"]);
/** orz-paged {{nyml}} kinds that print nothing: the document settings and the head metadata. Every other kind (the
 *  curated elements — abstract, question-open, exam-title …; or a kind the harness does not know) is content. */
export const NYML_NOTATION_KINDS = Object.freeze(["document", "meta"]);
/** A {{nyml}} block's kind ("" when it names none). */
export const nymlKindOf = (body) => { for (const l of String(body || "").split("\n")) { const m = /^\s*kind\s*:\s*(.*?)\s*$/.exec(l.replace(/^\{\{nyml\b/, "")); if (m) return m[1].replace(/^["']|["']$/g, "").toLowerCase(); } return ""; };
/** orz plugin blocks that print nothing of the author's text (spacing only). */
const SILENT_PLUGINS = new Set(["space"]);
/** Containers whose opening line prints its label (orz-markdown's own renderers): spoil → <summary>, tab → the tab button. */
const LABELLED_CONTAINERS = new Set(["spoil", "tab"]);

/**
 * Raw HTML the harness reads as visible: phrasing tags that show everything they wrap, with attributes that cannot
 * hide it. Anything else — a `hidden` or `style` or `class` attribute, <details>, <template>, <noscript>, <textarea>,
 * <style>, <script>, a block element left open around following content, a comment inside printed text, `<!…>`/`<?…>`
 * (a browser reads them as comments) — can hide text from a student while the review reads it, so it is refused
 * (red team round 3, C1-05). orz-markdown has the visible forms of all of these (`::: spoil`, `::: tab`, containers).
 */
export const SAFE_HTML_TAGS = Object.freeze(new Set(["a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "del", "dfn", "em", "i", "img", "ins", "kbd", "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr", "hr"]));
export const SAFE_HTML_ATTRS = Object.freeze(new Set(["href", "src", "alt", "title", "lang", "dir", "width", "height", "datetime", "cite", "target", "rel"]));
/** Maths that typesets invisibly: \phantom and its kin, colour (white on white). */
const HIDDEN_TEX = /\\(?:[hv]?phantom|color|textcolor|colorbox|fcolorbox)\b/;

const TAG = /<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
const ATTR = /([^\s"'>\/=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;

/** What a chunk of raw HTML can hide: [reason] (empty: it hides nothing). `inline`: it sits inside printed text. */
export function htmlHides(html, { inline = false } = {}) {
  const out = [], s = String(html || "");
  // comments: inside printed text the review reads what the student never sees; on their own (a slide marker, a
  // note) the segmenter already reads them as structure, so they count toward nothing
  if (inline && /<!--/.test(s)) out.push("a comment inside printed text");
  const rest = s.replace(/<!--[\s\S]*?(?:-->|$)/g, " ");
  if (/<[!?]/.test(rest)) out.push("a `<!…>` or `<?…>` declaration (a browser reads it as a comment)");
  for (const m of rest.matchAll(TAG)) {
    const name = m[2].toLowerCase();
    if (!SAFE_HTML_TAGS.has(name)) { out.push(`<${m[1]}${name}>`); continue; }
    for (const a of (m[3] || "").matchAll(ATTR)) if (!SAFE_HTML_ATTRS.has(a[1].toLowerCase())) out.push(`<${name} ${a[1].toLowerCase()}>`);
  }
  return [...new Set(out)];
}

const cache = new Map();
/**
 * The orz-markdown model of a markdown text: { printed: Set(line), labels: Map(line → printed container label),
 * blocks: Map(line → { name, args, content, start, end }), headings: Map(line → level), includes: [{ line, target }],
 * hidden: [{ line, what }], leaf: Map(line → [start, end]) } — 0-based lines, `end` inclusive.
 */
export function printedModel(text) {
  const src = String(text || "");
  if (cache.has(src)) return cache.get(src);
  const tokens = md.parse(src, {});
  const printed = new Set(), labels = new Map(), blocks = new Map(), headings = new Map(), includes = [], hidden = [], leaf = new Map();
  const mark = (a, b) => { for (let k = a; k <= b; k++) { printed.add(k); if (!leaf.has(k)) leaf.set(k, [a, b]); } };
  const hide = (line, whats) => { for (const what of whats) hidden.push({ line: line + 1, what }); };
  for (let x = 0; x < tokens.length; x++) {
    const t = tokens[x], map = t.map;
    if (!map) continue;
    const a = map[0], b = Math.max(map[0], map[1] - 1);
    if (t.type === "paragraph_open" || t.type === "heading_open" || t.type === "tr_open" || t.type === "math_block" || t.type === "fence" || t.type === "code_block") {
      mark(a, b);
      if (t.type === "heading_open") headings.set(a, Number(t.tag.slice(1)));
      const inl = tokens[x + 1]?.type === "inline" ? tokens[x + 1] : null;
      for (const ch of inl?.children || []) if (ch.type === "html_inline") hide(a, htmlHides(ch.content, { inline: true }));
      if (inl && HIDDEN_TEX.test(inl.content)) hide(a, ["maths that typesets invisibly (\\phantom, \\color)"]);
      if (t.type === "math_block" && HIDDEN_TEX.test(t.content)) hide(a, ["maths that typesets invisibly (\\phantom, \\color)"]);
      if (t.type === "tr_open") {
        for (let y = x + 1; y < tokens.length && tokens[y].type !== "tr_close"; y++) {
          const c = tokens[y];
          if (c.type !== "inline") continue;
          for (const ch of c.children || []) if (ch.type === "html_inline") hide(a, htmlHides(ch.content, { inline: true }));
          if (HIDDEN_TEX.test(c.content)) hide(a, ["maths that typesets invisibly (\\phantom, \\color)"]);
        }
      }
      continue;
    }
    if (t.type === "html_block") {
      // what is left once the comments are removed prints (or is markup that may hide what follows)
      const body = t.content.replace(/<!--[\s\S]*?(?:-->|$)/g, (c) => c.replace(/[^\n]/g, " "));
      body.split("\n").forEach((l, k) => { if (l.trim() && a + k <= b) mark(a + k, a + k); });
      hide(a, htmlHides(t.content));
      continue;
    }
    if (t.type === "plugin_block") {
      blocks.set(a, { name: t.info, args: t.meta?.args ?? null, content: t.content, start: a, end: b });
      if (INCLUDE_ALIASES.includes(t.info)) includes.push({ line: a + 1, target: String(t.content || "").trim() });
      if (!SILENT_PLUGINS.has(t.info) && !(t.info === "nyml" && (NYML_NOTATION_KINDS.includes(nymlKindOf(t.content)) || !nymlKindOf(t.content)))) mark(a, b);
      continue;
    }
    const c = /^container_(.+)_open$/.exec(t.type);
    if (c) {
      const info = String(t.info || "").trim(), name = info.split(/\s+/)[0];
      const label = LABELLED_CONTAINERS.has(c[1]) ? info.slice(name.length).trim() : "";
      if (label) { labels.set(a, label); printed.add(a); if (!leaf.has(a)) leaf.set(a, [a, a]); }
    }
  }
  // a line the parser left in no token (a link reference definition, say) prints nothing
  const model = { printed, labels, blocks, headings, includes, hidden, leaf };
  if (cache.size > 64) cache.delete(cache.keys().next().value);
  cache.set(src, model);
  return model;
}
