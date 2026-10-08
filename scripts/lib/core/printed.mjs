// What a deliverable PRINTS, read from orz-markdown itself (red team round 3, CONTROL C3-03/04/06/07, C1-05) AND from
// the frame that ships it (red team round 4, CONTROL C1-01, C1-02, C3-01). The segmenter decides what a unit is, but
// whether a line prints is not its own grammar's call: it is the house parser's, and then the frame's — orz-mdhtml
// (the study guide, practice) and orz-slides (the deck) with their stylesheets, orz-paged for a print document. The
// student sees what the FRAME shows, and orz-markdown alone disagrees with it both ways: a lone `::: tab` renders a
// `<div class="tab">` every theme hides; `{{yaml}}` renders a <script>; speaker notes render into the presenter's
// <aside>; and the deck config's `footer:` prints on every slide although, to orz-markdown, it is a comment.
// One parse (orz-markdown's token stream, the parser the frames render with) plus the frame's own grammar answers, per
// source line:
//   - printed: the line puts text on the page (a paragraph, heading, table row, list text, code, maths, a plugin
//     element known to print visibly, raw HTML, or the label of a container that prints one — `::: spoil <label>` (its
//     <summary>) and `::: tab <label>` inside a `:::: tabs` group (its tab button));
//   - blocks: where each `{{name …}}` block really starts and ends (orz ends it at the first line CONTAINING "}}");
//   - includes: every `{{md}}`/`{{markdown}}`/`{{md-include}}` include orz renders, in any form it accepts (one line,
//     `[args]`, or spread over lines — `{{md` / path / `}}`), anywhere a block can stand (containers, lists, quotes);
//   - hidden: what can hide text from the reader while the review still reads it — raw HTML outside the visible set;
//     a container, a plugin block or an inline plugin that is not on the ALLOWLIST of kinds known to print their text
//     visibly (an unknown kind fails closed); a `{{attrs[…]}}` that sets anything but an id; a lone `::: tab`;
//   - notes (slides): the speaker-notes lines (`<!-- @notes -->` to the next region or slide) — the presenter's, not the
//     students': they print nothing on a slide, and are no unit (they never count toward coverage);
//   - deck (slides): the deck config values orz-slides prints (`footer:` on every content slide, `title:` in the tab,
//     `author:` in the document's metadata) — each is read (segment.mjs), so each counts as printed.
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
// ---- the allowlists (red team round 4, C1-01/C1-02): what is KNOWN to print its text visibly in the frames; anything
// else orz-markdown parses is hidden content (an unknown kind fails closed) ------------------------------------------
/** Plugin blocks whose output is visible: figures, the table of contents, embeds, includes (each read on its own).
 *  Not here: `yaml`/`yml` (a <script>), `test-block` (a fixed string), `nyml` outside orz-paged (a <script>). */
export const VISIBLE_BLOCK_PLUGINS = Object.freeze(new Set(["mermaid", "mm", "chart", "smiles", "sm", "toc", "youtube", "yt", ...INCLUDE_ALIASES]));
/** Containers the frames show (orz-markdown's own; a `tab` only inside a `:::: tabs` group). The catch-all `::: <class>`
 *  sets a class the stylesheet may hide (every theme hides `.tab`), so any other class is refused. */
export const VISIBLE_CONTAINERS = Object.freeze(new Set(["success", "info", "warning", "danger", "left", "right", "center", "spoil", "tabs", "tab", "cols", "col"]));
/** `{{sp[<class>] …}}` classes the themes style as visible colours and badges. */
export const VISIBLE_SPAN_CLASSES = Object.freeze(new Set(["red", "yellow", "green", "blue", "success", "info", "warning", "danger"]));
/** `{{attrs[…]}}` may set an id (`#x`, `id="x"`) and the slides' step-reveal class; nothing that can hide the element. */
const ATTRS_CLASSES = new Set(["fragment"]);
/** The deck config keys orz-slides prints: `footer:` on every content slide, `title:` (the tab), `author:` (metadata). */
export const PRINTED_DECK_KEYS = Object.freeze(["title", "author", "footer"]);
/** A text's frame: "slides" (orz-slides), "paged" (an orz-paged print document: it opens with a {{nyml kind: document}}
 *  settings block), or "page" (orz-mdhtml: the study guide, practice, any other document). */
export function frameOf(rel, text) {
  const r = String(rel || "");
  if (r.startsWith("slides/")) return "slides";
  if (/^(?:study-guide|practice)\//.test(r)) return "page";
  const m = /^\s*\{\{nyml\b([^]*?)\}\}/.exec(String(text || ""));
  return m && nymlKindOf(m[1]) === "document" ? "paged" : "page";
}
// orz-markdown's attrs grammar (plugins/attrs.js parseAttrs)
const attrPairs = (s) => [...String(s || "").matchAll(/\.([^\s.#=]+)|#([^\s.#=]+)|([a-zA-Z][\w-]*)(?:="([^"]*)")?/g)].map((m) => (m[1] ? ["class", m[1]] : m[2] ? ["id", m[2]] : [m[3], m[4] ?? ""]));
/** What the inline plugins of one inline source hide: [reason]. */
function inlinePluginHides(inl) {
  const out = [];
  // {{attrs …}}: the core rule removes the marker before the tokens are seen, so it is read from the source (code
  // spans and escapes, which orz does not dispatch, left out)
  const src = String(inl.content || "").replace(/(`+)[^`]*?\1/g, " ").replace(/\\\{/g, " ");
  for (const m of src.matchAll(/\{\{attrs(?![A-Za-z0-9-])(?:\[([^\]]*)\])?[ \t]*([^]*?)\}\}/g)) {
    if (m[2].trim()) out.push(`\`{{attrs …}}\` drops its text ("${m[2].trim().slice(0, 40)}") from the page`);
    for (const [k, v] of attrPairs(m[1])) if (!(k === "id" || (k === "class" && v.split(/\s+/).every((c) => ATTRS_CLASSES.has(c))))) out.push(`\`{{attrs[${m[1]}]}}\` sets ${k === "class" ? `class "${v}"` : `\`${k}\``} on the element (it can hide it)`);
  }
  for (const ch of inl.children || []) {
    if (ch.type !== "plugin_inline") continue;
    const name = ch.info, args = ch.meta?.args ?? null, body = String(ch.content || "").trim();
    if (name === "span" || name === "sp") { if (args != null && !args.trim().split(/\s+/).every((c) => VISIBLE_SPAN_CLASSES.has(c))) out.push(`\`{{${name}[${args}]}}\` sets a class the frame may hide (visible: ${[...VISIBLE_SPAN_CLASSES].join(", ")})`); }
    else if (name === "emoji" || name === "em") continue;
    else if (name === "space") { if (body && !/^\d+(?:\.\d+)?$/.test(body)) out.push(`\`{{space …}}\` drops its text ("${body.slice(0, 40)}") from the page`); }
    else if (name === "qr" || name === "qrcode") { if (/\s/.test(body)) out.push(`\`{{${name} …}}\` prints its text only as a QR code`); }
    else out.push(`the inline plugin \`{{${name} …}}\` prints none of its text`);
  }
  return out;
}

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
export function printedModel(text, { frame = "page" } = {}) {
  const src = String(text || ""), key = `${frame}\u0000${src}`;
  if (cache.has(key)) return cache.get(key);
  const tokens = md.parse(src, {});
  const printed = new Set(), labels = new Map(), blocks = new Map(), headings = new Map(), includes = [], hidden = [], leaf = new Map();
  const unprint = new Set(), notes = new Set(), stack = [];
  let deck = null, lastLine = 0;
  const mark = (a, b) => { for (let k = a; k <= b; k++) { printed.add(k); if (!leaf.has(k)) leaf.set(k, [a, b]); } };
  const hide = (line, whats) => { for (const what of whats) hidden.push({ line: line + 1, what }); };
  for (let x = 0; x < tokens.length; x++) {
    const t = tokens[x], map = t.map;
    // every inline source is read for the inline plugins that hide (a table cell's has no map: its row's line)
    if (t.type === "inline") hide(map ? map[0] : lastLine, inlinePluginHides(t));
    const cc = /^container_(.+)_close$/.exec(t.type);
    if (cc) { stack.pop(); continue; }
    if (!map) continue;
    lastLine = map[0];
    const a = map[0], b = Math.max(map[0], map[1] - 1);
    if (t.type === "paragraph_open" || t.type === "heading_open" || t.type === "tr_open" || t.type === "math_block" || t.type === "fence" || t.type === "code_block") {
      mark(a, b);
      if (t.type === "heading_open") headings.set(a, Number(t.tag.slice(1)));
      const inl = tokens[x + 1]?.type === "inline" ? tokens[x + 1] : null;
      for (const ch of inl?.children || []) if (ch.type === "html_inline") hide(a, htmlHides(ch.content, { inline: true }));
      if (t.type === "heading_open" || t.type === "paragraph_open") lastLine = a;
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
      if (t.info === "nyml") {
        // orz-paged prints an element kind; orz-mdhtml and orz-slides render every {{nyml}} as a <script> (round 4)
        const kind = nymlKindOf(t.content), notation = NYML_NOTATION_KINDS.includes(kind) || !kind;
        if (!notation && frame === "paged") mark(a, b);
        else if (!notation) hide(a, [`a {{nyml kind: ${kind}}} element: only orz-paged prints it — this ${frame === "slides" ? "deck" : "page"} renders it as a <script>, so none of its text shows`]);
      } else if (VISIBLE_BLOCK_PLUGINS.has(t.info)) mark(a, b);
      else if (!SILENT_PLUGINS.has(t.info)) hide(a, [`a {{${t.info}}} block: it shows none of its text (${t.info === "yaml" || t.info === "yml" ? "it renders as a <script>" : "it is not a block the frames are known to print"})`]);
      continue;
    }
    const c = /^container_(.+)_open$/.exec(t.type);
    if (c) {
      const info = String(t.info || "").trim(), name = info.split(/\s+/)[0], parent = stack.at(-1);
      stack.push(name);
      // a `::: tab` outside a `:::: tabs` group is a `.tab` panel every theme hides (`.tab { display: none }`): its
      // label and body print nothing (round 4, C1-01); any class off the allowlist may be hidden by the stylesheet
      if (name === "tab" && parent !== "tabs") { hide(a, ["a `::: tab` outside a `:::: tabs` group (the theme hides it: `.tab { display: none }`)"]); for (let k = a; k <= b; k++) unprint.add(k); continue; }
      if (!VISIBLE_CONTAINERS.has(name)) hide(a, [`a \`::: ${name}\` container: a class the frame's stylesheet may hide (the containers that print: ${[...VISIBLE_CONTAINERS].join(", ")})`]);
      const label = LABELLED_CONTAINERS.has(c[1]) ? info.slice(name.length).trim() : "";
      if (label) { labels.set(a, label); printed.add(a); if (!leaf.has(a)) leaf.set(a, [a, a]); }
    }
  }
  if (frame === "slides") deck = slidesFrame(src, { printed, unprint, notes });
  for (const k of unprint) { printed.delete(k); labels.delete(k); }
  // a line the parser left in no token (a link reference definition, say) prints nothing
  const model = { printed, labels, blocks, headings, includes, hidden, leaf, notes, deck, frame };
  if (cache.size > 64) cache.delete(cache.keys().next().value);
  cache.set(key, model);
  return model;
}

// orz-slides' own grammar (slide-parser.js): the deck block at the very start, slides split at `<!-- slide … -->`,
// regions at whole-line `<!-- @name … -->` markers
const DECK_BLOCK = /^\s*<!--\s*deck\b([\s\S]*?)-->/;
const SLIDE_AT = /<!--\s*slide\b/;
const REGION_LINE = /^[ \t]*<!--\s*@([A-Za-z0-9_-]+)\b([^>]*?)-->[ \t]*$/;
/**
 * What orz-slides shows of a deck, by its own grammar: the deck config values it prints are printed (and read as
 * units by the segmenter); everything before the first slide marker is dropped (it prints nothing); a `@notes`
 * region goes to the presenter's notes (it prints nothing on a slide). Returns the deck block:
 * { start, end, values: [{ key, line, value }] } (0-based lines), or null.
 */
function slidesFrame(src, { printed, unprint, notes }) {
  const lines = src.split("\n");
  let deck = null, from = 0;
  const dm = DECK_BLOCK.exec(src);
  if (dm) {
    const start = src.slice(0, dm.index + dm[0].indexOf("<!--")).split("\n").length - 1, end = start + dm[0].slice(dm[0].indexOf("<!--")).split("\n").length - 1;
    const values = [];
    dm[1].split("\n").forEach((seg, k) => {
      const kv = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*$/.exec(seg);
      if (kv && kv[2] !== "" && PRINTED_DECK_KEYS.includes(kv[1].toLowerCase())) values.push({ key: kv[1].toLowerCase(), line: start + k, value: kv[2] });
    });
    deck = { start, end, values };
    from = end + 1;
  }
  const first = lines.findIndex((l, k) => k >= from && SLIDE_AT.test(l));
  for (let k = from; k < (first < 0 ? lines.length : first); k++) unprint.add(k);
  let inNotes = false;
  for (let k = Math.max(first, 0); first >= 0 && k < lines.length; k++) {
    if (SLIDE_AT.test(lines[k])) { inNotes = false; continue; }
    const r = REGION_LINE.exec(lines[k]);
    if (r) { inNotes = r[1].toLowerCase() === "notes"; continue; }
    if (inNotes) { notes.add(k); unprint.add(k); }
  }
  if (deck) for (const v of deck.values) printed.add(v.line);
  return deck;
}

/**
 * Every list item of a markdown text with its full extent, as orz-markdown reads it (red team round 4, CONTROL C2-01):
 * an item is its marker line AND its continuation lines — indented, lazy, or a further paragraph — which markdown
 * prints as part of the same item. A nested item is its own item (its lines are not its parent's).
 * Returns [{ start, lines: [0-based line], text }] in document order; `text` is the item's lines joined by a space,
 * the marker stripped.
 */
export function listItemsOf(text) {
  const src = String(text || ""), all = src.split("\n"), tokens = md.parse(src, {}), items = [], open = [];
  for (const t of tokens) {
    if (t.type === "list_item_open" && t.map) { const it = { start: t.map[0], end: t.map[1], kids: [] }; open.at(-1)?.kids.push(it); open.push(it); items.push(it); }
    else if (t.type === "list_item_close") open.pop();
  }
  return items.map((it) => {
    const nested = new Set(it.kids.flatMap((k) => Array.from({ length: k.end - k.start }, (_, n) => k.start + n)));
    const lines = []; for (let k = it.start; k < it.end; k++) if (!nested.has(k) && all[k]?.trim()) lines.push(k);
    const parts = lines.map((k, n) => (n === 0 ? all[k].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "") : all[k]).trim());
    return { start: it.start, lines, parts, text: parts.join(" ") };
  }).sort((a, b) => a.start - b.start);
}
