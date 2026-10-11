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
//     visibly (an unknown kind fails closed); a `{{attrs[…]}}` that sets anything but an id; a lone `::: tab`; and, at
//     the ATTRIBUTE level (round 6, CONTROL C1-01/02/03), a container argument orz copies into a style or attribute
//     that is off the allowlist of values known to show, a plugin argument that is not the value the plugin takes,
//     and a slide attribute (class, bg, fit=off, a layout track, a float's geometry or what it is painted over);
//   - settings (round 6, C3-02): the values a frame prints from a {{nyml}} settings block — orz-paged's running
//     header and footer, the head metadata — each read as a unit (segment.mjs);
//   - notes (slides): the speaker-notes lines (`<!-- @notes -->` to the next region or slide) — the presenter's, not the
//     students': they print nothing on a slide, and are no unit (they never count toward coverage);
//   - dropped (slides; red team round 5, CONTROL C1-01/C1-02): what orz-slides itself does not show — its parser and
//     renderer are RUN (slideRegionsShown), not modelled: a region outside the layout, a repeated region name, a
//     template slide's other regions or unrendered lines, an overwritten @footer; each such line prints nothing, with
//     the frame's reason (a unit there is content-hidden). A table row's text beyond the cells markdown-it renders is
//     hidden too (unrenderedText);
//   - deck (slides): the deck config values orz-slides prints (`footer:` on every content slide, `title:` in the tab,
//     `author:` in the document's metadata) — each is read (segment.mjs), so each counts as printed.
// Deterministic and offline: parsing never reads an included file (that happens only when rendering).
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require_ = createRequire(import.meta.url);
const { md } = require_("orz-markdown");
// orz-slides' own parser and renderer (the deck's frame): its package exports only the builder, so the two modules are
// loaded from the installed package's dist folder
const SLIDES_DIST = path.dirname(require_.resolve("orz-slides"));
const { parseDeck } = await import(pathToFileURL(path.join(SLIDES_DIST, "slide-parser.js")).href);
const { renderSlide } = await import(pathToFileURL(path.join(SLIDES_DIST, "render-slide.js")).href);
export { SLIDES_DIST };

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
// ---- argument values (red team round 6, CONTROL C1-01/C1-02): visibility is decided at the ATTRIBUTE level too —
// orz-markdown copies a container's argument raw into a style or an attribute (`::: left <w>` → max-width/width,
// `::: cols <t>` → grid-template-columns, `::: tab <label>` → data-label, `::: spoil <label>` → <summary>), and a block
// plugin prints none of its argument as text unless its renderer does. So an argument is checked against the values
// KNOWN to show; anything else — CSS that breaks out of the property, a width or track too small to show text, a quote
// that breaks out of the attribute, an argument the renderer drops, a plugin argument that is not the value it takes —
// is content-hidden. Never a raw argument into a style or an attribute unchecked. -------------------------------------
const CSS_LENGTH = /^(\d+(?:\.\d+)?)(px|em|rem|%|ch|vw|pt|cm|mm|in)$/;
/** The least of each unit that still shows a line of text (a narrower box shows a word per line, or nothing). */
const MIN_LENGTH = Object.freeze({ px: 120, em: 8, rem: 8, "%": 15, ch: 15, vw: 15, pt: 90, cm: 3, mm: 30, in: 1.25 });
/** Is a CSS length one known to show text (a plain length, at least MIN_LENGTH)? */
export const visibleLength = (v) => { const m = CSS_LENGTH.exec(String(v ?? "").trim()); return !!m && Number(m[1]) >= MIN_LENGTH[m[2]]; };
/** What a `::: cols` track list hides: [reason]. orz turns a bare number into `fr`; a track must be a positive `fr`
 *  share of at least a tenth of the shares, `auto`, or a length known to show text. */
export function colsTrackIssues(rest) {
  const ts = String(rest ?? "").trim().split(/\s+/).filter(Boolean), out = [];
  const fr = ts.map((t) => { const m = /^(\d+(?:\.\d+)?)(fr)?$/.exec(t); return m ? Number(m[1]) : null; });
  const sum = fr.reduce((n, x) => n + (x ?? 0), 0);
  ts.forEach((t, k) => {
    if (fr[k] != null) { if (!(fr[k] > 0) || fr[k] / sum < 0.1) out.push(`a column track "${t}" too narrow to show text`); }
    else if (t !== "auto" && !visibleLength(t)) out.push(`a column track "${t}" that is not a width known to show text (a positive fr share, auto, or a length of at least ${MIN_LENGTH.px}px / ${MIN_LENGTH["%"]}%)`);
  });
  return out;
}
/** Containers whose renderer drops the argument (markdown-it-container's default: `<div class="name">`). */
const ARGLESS_CONTAINERS = new Set(["success", "info", "warning", "danger", "right", "center", "tabs", "col"]);
/** What a visible container's ARGUMENT hides: [reason] (empty: it shows as orz renders it). */
export function containerArgIssues(name, rest) {
  const arg = String(rest ?? "").trim();
  if (!arg) return [];
  if (ARGLESS_CONTAINERS.has(name)) return [`the argument of \`::: ${name}\` ("${arg.slice(0, 40)}"): the frame prints none of it`];
  if (name === "left") return visibleLength(arg) ? [] : [`\`::: left ${arg.slice(0, 40)}\`: orz writes the argument into the box's CSS width, and it is not a width known to show text (a length of at least ${MIN_LENGTH.px}px / ${MIN_LENGTH["%"]}% / ${MIN_LENGTH.em}em)`];
  if (name === "cols") return colsTrackIssues(arg).map((r) => `\`::: cols ${arg.slice(0, 40)}\`: orz writes the argument into the grid's CSS — ${r}`);
  // a tab label goes raw into data-label="…"; a spoil label raw into <summary>…</summary>
  if (name === "tab" && /["]/.test(arg)) return [`\`::: tab ${arg.slice(0, 40)}\`: a quote in the label breaks out of the tab's data-label attribute (it can set any attribute, a hiding style among them)`];
  if (name === "spoil" && /[<>]/.test(arg)) return [`\`::: spoil ${arg.slice(0, 40)}\`: the label is written raw into the <summary>, and markup there can hide text`];
  return [];
}
/** Block plugins whose ARGUMENT is a value, not text: the value each takes (anything else prints none of its text). */
const PLUGIN_VALUES = Object.freeze({
  toc: { re: /^(?:\d+\s*,\s*\d+)?$/, what: "a heading-level range like `1,3` (the list is built from the page's headings)" },
  youtube: { re: /^[A-Za-z0-9_-]{6,20}$/, what: "a video id (it renders as an embedded player)" },
  yt: { re: /^[A-Za-z0-9_-]{6,20}$/, what: "a video id (it renders as an embedded player)" },
  smiles: { re: /^[A-Za-z0-9@+\-[\]()=#$%/\\.:*~]+$/, what: "one SMILES string (it renders as a structure drawing)" },
  sm: { re: /^[A-Za-z0-9@+\-[\]()=#$%/\\.:*~]+$/, what: "one SMILES string (it renders as a structure drawing)" },
});
/** The keys orz-markdown's chart plugin reads (every other line of a {{chart}} prints nothing). */
const CHART_KEYS = new Set(["type", "title", "labels", "data", "series"]);
/**
 * What a visible block plugin hides of its source: { issues: [reason], dark: [0-based line] } — the lines of the block
 * whose text the frame never shows. A `[args]` none of these plugins reads; a value-plugin's text that is not its value;
 * a chart line under a key the chart ignores; a mermaid `%%` comment.
 */
export function pluginArgIssues(t, srcLines) {
  // the body as WRITTEN (a core rule may already have replaced the token's content: toc puts its list there)
  const name = t.info, a = t.map[0], b = Math.max(a, t.map[1] - 1), out = [], dark = [];
  const body = []; for (let k = a; k <= b; k++) { let l = srcLines[k] ?? ""; if (k === a) l = l.replace(/^\s*\{\{[A-Za-z0-9-]+(?:\[[^\]]*\])?/, ""); if (l.includes("}}")) { body.push(l.slice(0, l.indexOf("}}"))); break; } body.push(l); }
  const content = body.join("\n").trim();
  const all = () => { for (let k = a; k <= b; k++) dark.push(k); };
  if (INCLUDE_ALIASES.includes(name)) return { issues: out, dark };
  if (t.meta?.args != null) { out.push(`\`{{${name}[${String(t.meta.args).slice(0, 40)}]}}\`: the frame reads no [argument] of {{${name}}} — it prints none of it`); all(); }
  const v = PLUGIN_VALUES[name];
  if (v && !v.re.test(content)) { out.push(`\`{{${name} ${content.replace(/\s+/g, " ").slice(0, 50)}}}\`: the frame prints none of this text — {{${name}}} takes ${v.what}`); all(); }
  if (name === "chart" || name === "mermaid" || name === "mm") {
    for (let k = a; k <= b; k++) {
      let l = srcLines[k] ?? "";
      if (k === a) l = l.replace(/^\s*\{\{[A-Za-z0-9-]+(?:\[[^\]]*\])?/, "");
      if (k === b && l.includes("}}")) l = l.slice(0, l.indexOf("}}"));
      const s = l.trim();
      if (!s) continue;
      const key = s.includes(":") ? s.slice(0, s.indexOf(":")).trim().toLowerCase() : null;
      const ignored = name === "chart" ? !CHART_KEYS.has(key) || (key === "type" && !/^[a-z]+$/i.test(s.slice(s.indexOf(":") + 1).trim())) : /^%%/.test(s);
      if (ignored) { dark.push(k); out.push(name === "chart" ? `a {{chart}} line the chart does not draw ("${s.slice(0, 50)}": only ${[...CHART_KEYS].join(", ")} print)` : `a mermaid comment ("${s.slice(0, 50)}") prints nothing`); }
    }
  }
  return { issues: [...new Set(out)], dark: [...new Set(dark)] };
}
/** The orz-paged settings that PRINT: the running header and footer boxes on every page (page-css.js addStatic). */
export const PRINTED_PAGED_KEYS = Object.freeze(["header_left", "header_center", "header_right", "footer_left", "footer_center", "footer_right"]);
/** The head metadata every frame emits from a `{{nyml kind: meta}}` block (doc-meta.js): the title (the tab), author
 *  and description. */
export const PRINTED_META_KEYS = Object.freeze(["title", "author", "description"]);
/** The `key: value` settings of a {{nyml}} block as orz-paged reads them (settings.js parseNymlBody: `key: |` takes the
 *  more-indented lines after it): [{ key, value, start, end }] (0-based source lines; `kind` left out). */
export function nymlValues(srcLines, a, b) {
  const lines = [];
  for (let k = a; k <= b; k++) {
    let l = srcLines[k] ?? "";
    if (k === a) l = l.replace(/^(\s*)\{\{nyml\b/, "$1");
    if (k === b && l.includes("}}")) l = l.slice(0, l.indexOf("}}"));
    lines.push([k, l]);
  }
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const [k, l] = lines[i], m = /^(\s*)([A-Za-z0-9_]+)\s*:\s?(.*)$/.exec(l);
    if (!m || m[2] === "kind") continue;
    if (m[3].trim() === "|") {
      const got = []; let end = k, j = i + 1;
      for (; j < lines.length; j++) { const n = lines[j][1]; if (!n.trim()) continue; if ((/^[ \t]*/.exec(n)[0].length) <= m[1].length) break; got.push(n.trim()); end = lines[j][0]; }
      out.push({ key: m[2], value: got.join("\n"), start: k, end }); i = j - 1; continue;
    }
    out.push({ key: m[2], value: m[3].trim().replace(/^(["'])(.*)\1$/, "$2"), start: k, end: k });
  }
  return out;
}
/** Does an orz-paged setting hide the body (it fails closed: custom CSS, a page background, a size that shows no
 *  text, margins that leave no page)? The reason, or null. */
export function pagedSettingHides(key, value) {
  const v = String(value ?? "").trim(), n = Number.parseFloat(v);
  if (!v) return null;
  if (key === "custom_css") return "an orz-paged `custom_css` setting: CSS can hide anything on the page, and the harness cannot read what it hides — style through a theme or template instead";
  if (key === "page_background" && !/^(?:#fff(?:fff)?|white|transparent|none)$/i.test(v)) return `an orz-paged \`page_background: ${v.slice(0, 30)}\`: a background can make the text unreadable — leave the page white`;
  if (key === "font_size" && !(n >= 8 && n <= 30)) return `an orz-paged \`font_size: ${v.slice(0, 20)}\`: not a size known to show text (8–30 pt)`;
  if (key === "line_height" && !(n >= 1 && n <= 3)) return `an orz-paged \`line_height: ${v.slice(0, 20)}\`: lines that overlap or vanish (1–3)`;
  if (/^margin_(?:top|bottom|left|right)$/.test(key) && !(n >= 0 && n <= 60)) return `an orz-paged \`${key}: ${v.slice(0, 20)}\`: a margin that leaves no room for the page (0–60 mm)`;
  return null;
}
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
  const tokens = md.parse(src, {}), srcLines = src.split("\n");
  const printed = new Set(), labels = new Map(), blocks = new Map(), headings = new Map(), includes = [], hidden = [], leaf = new Map();
  const unprint = new Set(), notes = new Set(), stack = [], dropped = new Map(), settings = [];
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
        const kept = [];
        for (let y = x + 1; y < tokens.length && tokens[y].type !== "tr_close"; y++) {
          const c = tokens[y];
          if (c.type !== "inline") continue;
          kept.push(c.content);
          for (const ch of c.children || []) if (ch.type === "html_inline") hide(a, htmlHides(ch.content, { inline: true }));
          if (HIDDEN_TEX.test(c.content)) hide(a, ["maths that typesets invisibly (\\phantom, \\color)"]);
        }
        // what the row's source holds that no rendered cell holds (red team round 5, CONTROL C1-01): markdown-it
        // renders as many cells as the header has, and silently drops the rest of a longer row
        const dropped = unrenderedText(srcLines[a], kept);
        if (dropped) hide(a, [`a table row with more cells than its header: the frame drops "${dropped.slice(0, 60)}" (put it under a header column, or in a paragraph)`]);
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
        // the settings values a frame PRINTS are read (round 6, C3-02): orz-paged's running headers and footers (on
        // every page; only the first document block counts, as orz-paged reads it) and the head metadata every frame
        // emits; a paged setting that can hide the body fails closed
        else if (kind === "document" && frame === "paged" && !settings.some((v) => v.kind === "document")) {
          const vals = nymlValues(srcLines, a, b);
          for (const v of vals) {
            if (PRINTED_PAGED_KEYS.includes(v.key) && v.value.trim()) { settings.push({ kind, ...v }); for (let k = v.start; k <= v.end; k++) mark(k, k); }
            const why = pagedSettingHides(v.key, v.value);
            if (why) hide(v.start, [why]);
          }
        } else if (kind === "meta" && !settings.some((v) => v.kind === "meta")) {
          for (const v of nymlValues(srcLines, a, b)) if (PRINTED_META_KEYS.includes(v.key) && v.value.trim()) { settings.push({ kind, ...v }); for (let k = v.start; k <= v.end; k++) mark(k, k); }
        }
      } else if (VISIBLE_BLOCK_PLUGINS.has(t.info)) {
        // a plugin's argument prints only as the frame renders it (round 6, C1-02): checked, not assumed from its kind
        const { issues, dark } = pluginArgIssues(t, srcLines);
        hide(a, issues);
        const off = new Set(dark);
        for (let k = a; k <= b; k++) if (!off.has(k)) { printed.add(k); if (!leaf.has(k)) leaf.set(k, [a, b]); }
      }
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
      else {
        // the ARGUMENT orz copies into the container's style or attribute (round 6, C1-01): off the allowlist of values
        // known to show, the container may be hidden, so its label and body print nothing (an argument the renderer
        // drops is only itself unseen)
        const issues = containerArgIssues(name, info.slice(name.length));
        hide(a, issues);
        if (issues.length && !ARGLESS_CONTAINERS.has(name)) for (let k = a; k <= b; k++) { unprint.add(k); if (!dropped.has(k)) dropped.set(k, issues[0]); }
      }
      const label = LABELLED_CONTAINERS.has(c[1]) ? info.slice(name.length).trim() : "";
      if (label) { labels.set(a, label); printed.add(a); if (!leaf.has(a)) leaf.set(a, [a, a]); }
    }
  }
  if (frame === "slides") deck = slidesFrame(src, { printed, unprint, notes, hide, dropped });
  for (const k of unprint) { printed.delete(k); labels.delete(k); }
  // a line the parser left in no token (a link reference definition, say) prints nothing
  const model = { printed, labels, blocks, headings, includes, hidden, leaf, notes, deck, frame, dropped, settings };
  if (cache.size > 64) cache.delete(cache.keys().next().value);
  cache.set(key, model);
  return model;
}

// orz-slides' own grammar (slide-parser.js): the deck block at the very start, slides split at `<!-- slide … -->`,
// regions at whole-line `<!-- @name … -->` markers
const DECK_BLOCK = /^\s*<!--\s*deck\b([\s\S]*?)-->/;
const SLIDE_AT = /<!--\s*slide\b/;
/** orz-slides' region marker, character for character (slide-parser.js REGION_MARKER; a test reads the installed
 *  frame's source and fails if they ever differ). The ONE region-name pattern: the notation check uses it too. */
export const SLIDE_REGION_MARKER = /^[ \t]*<!--\s*@([A-Za-z0-9_-]+)\b([^>]*?)-->[ \t]*$/;
/** The names orz-slides routes to fields of their own rather than to the layout (compared lowercased, as it does). */
export const SLIDE_RESERVED_REGIONS = Object.freeze(["notes", "footer", "float"]);

/** The leaf region names of an orz-slides layout tree, in order. */
const layoutLeaves = (n) => (!n ? [] : n.kind === "region" ? [n.name] : (n.children || []).flatMap(layoutLeaves));
const lineKey = (l) => String(l).trim().replace(/^#{1,6}\s+/, "");
// ---- slide attributes (red team round 6, CONTROL C1-03) ---------------------------------------------------------------
// orz-slides copies a slide's attributes into its HTML: `class=` onto the <section> (reveal.js hides `.fragment` until a
// step that never comes for a whole slide; a theme may hide any class), `bg=` as the slide's background colour, `fit=off`
// stops the scaling that keeps a region's text inside its `overflow: hidden` cell, each layout track into
// grid-template-*, each float's geometry into `position:absolute; left/top/width/height/z-index` on a box with a solid
// background. Visibility is decided at this level: values known to show pass, anything else fails closed.
/** The slide size orz-slides lays out (browser-entry.js: 960 wide, height from the ratio). */
const SLIDE_W = 960;
const slideH = (ratio) => { const [w, h] = String(ratio || "16:9").split(":").map(Number); return Math.round((SLIDE_W * (h || 9)) / (w || 16)); };
/** Classes a slide may carry: none is known to show (reveal.js hides `fragment`; no theme styles another visibly). */
export const VISIBLE_SLIDE_CLASSES = Object.freeze(new Set());
/** The least share of the slide a layout region or a float needs to show text (about 77 px of 960). */
const MIN_SHARE = 0.08;
// the bands every normal slide lays out (base.css): the title band at the top, the footer band at the bottom — read
// generously, so a float near either is counted as over it
const TITLE_BAND = Object.freeze({ x0: 0, x1: 1, y0: 0, y1: 0.25 });
const FOOTER_BAND = Object.freeze({ x0: 0, x1: 1, y0: 0.82, y1: 1 });
const floatName = (f) => `@float ${Object.entries(f.geom || {}).map(([k, v]) => `${k}=${v}`).join(" ")}`.trim();
const overlaps = (p, q) => Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0) > 0.005 && Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0) > 0.005;
/** A CSS length as a share of `dim` px (null: not a length the harness can place). */
const shareOf = (v, dim) => { const m = /^(-?\d+(?:\.\d+)?)(%|px)$/.exec(String(v ?? "").trim().replace(/^-?0+(?:\.0+)?$/, "0px")); return !m ? null : m[2] === "%" ? Number(m[1]) / 100 : Number(m[1]) / dim; };
/** Lay a split's tracks over a span of `len` (a share of the slide): [{ len, auto, bad }] per track. */
function trackShares(tracks, len, dim) {
  const ts = tracks.map((t) => String(t).trim()), out = ts.map(() => ({ len: 0, auto: false, bad: null }));
  let fixed = 0, frSum = 0;
  ts.forEach((t, k) => {
    const fr = /^(\d+(?:\.\d+)?)(fr)?$/.exec(t), sh = shareOf(t, dim);
    if (fr) { out[k].fr = Number(fr[1]); frSum += out[k].fr; }
    else if (t === "auto") out[k].auto = true;
    else if (sh != null && sh >= 0) { out[k].len = /%$/.test(t) ? len * sh : sh; fixed += out[k].len; }
    else out[k].bad = `a layout track "${t}" the harness cannot size (use fr shares, %, px or auto)`;
  });
  const rest = Math.max(0, len - fixed);
  for (const o of out) if (o.fr != null) o.len = frSum > 0 ? (rest * o.fr) / frSum : 0;
  return out;
}
/**
 * What a slide's attributes let show: { slide: why|null (class, bg, fit), region: Map(name → why) (a track too small or
 * unsizable), rects: Map(name → box), float: [why|null], floatRects: [box|null] } — boxes as shares of the slide.
 */
export function slideVisibility(slide, config = {}) {
  const H = slideH(config.ratio), o = slide.options || {}, region = new Map(), rects = new Map();
  const cls = String(o.class ?? "").trim().split(/\s+/).filter(Boolean).filter((c) => !VISIBLE_SLIDE_CLASSES.has(c));
  const slideWhy = cls.length ? `the slide's \`class="${o.class}"\`: a class on the slide can hide all of it (reveal.js hides \`.fragment\` until a step a whole slide never gets) — no slide class is known to show`
    : o.bg != null && String(o.bg).trim() ? `the slide's \`bg=${o.bg}\`: a background colour can make the slide's text unreadable — use a deck theme instead`
    : o.fit === "off" ? "the slide's `fit=off`: without scaling, text past the edge of a region is clipped (`overflow: hidden`) — use fit or scroll"
    : null;
  const walk = (n, box, why) => {
    if (!n) return;
    if (n.kind === "region") { if (!rects.has(n.name)) rects.set(n.name, box); if (why && !region.has(n.name)) region.set(n.name, why); return; }
    const col = n.dir === "col", span = col ? box.x1 - box.x0 : box.y1 - box.y0;
    const shares = trackShares(n.tracks || [], span, col ? SLIDE_W : H);
    let at = col ? box.x0 : box.y0;
    (n.children || []).forEach((ch, k) => {
      const sh = shares[k] || { len: 0, bad: "a region with no track" };
      const anyAuto = shares.some((x) => x.auto);
      // an auto track is sized by its content (it shows); beside one, every cell may span the split (fail-safe for floats)
      const len = sh.auto || anyAuto ? span : sh.len;
      const sub = col ? { ...box, x0: anyAuto ? box.x0 : at, x1: anyAuto ? box.x1 : at + len } : { ...box, y0: anyAuto ? box.y0 : at, y1: anyAuto ? box.y1 : at + len };
      const small = !sh.auto && !sh.bad && sh.len < MIN_SHARE ? `a layout track "${n.tracks[k]}" gives this region about ${Math.round(sh.len * 100)}% of the slide's ${col ? "width" : "height"}, and the frame clips a region to its cell (\`overflow: hidden\`)` : null;
      walk(ch, sub, why || sh.bad || small);
      if (!anyAuto) at += sh.len;
    });
  };
  walk(slide.kind === "template" ? { kind: "region", name: "body" } : slide.layout, { x0: 0, x1: 1, y0: 0, y1: 1 }, null);
  const float = [], floatRects = [];
  for (const f of slide.floats || []) {
    const g = f.geom || {}, why = [];
    const v = (k, dim) => { if (g[k] == null) return null; const s = shareOf(g[k], dim); if (s == null) why.push(`\`${k}=${g[k]}\` is not a length the harness can place (% or px)`); return s; };
    const left = v("left", SLIDE_W), right = v("right", SLIDE_W), top = v("top", H), bottom = v("bottom", H), w = v("w", SLIDE_W), h = v("h", H);
    // an auto-sized float shrinks to its content: for plain text, a generous estimate of that box (11 px a character,
    // 30 px a line, 40 px of padding — each above what the theme uses); anything else (an image, a figure, a block)
    // is taken to reach the slide's edge
    const avail = left != null ? 1 - left : right != null ? 1 - right : 1;
    const plain = !/!\[|\{\{|<|\$\$|^\s*[|:]/m.test(String(f.markdown || ""));
    const chars = String(f.markdown || "").replace(/\s+/g, " ").trim().length;
    const estW = w ?? (plain ? Math.min(avail, (chars * 11 + 40) / SLIDE_W) : null);
    const estH = h ?? (plain && estW ? (Math.ceil((chars * 11) / Math.max(1, estW * SLIDE_W - 40)) * 30 + 40) / H : null);
    const span = (a, b, size) => a != null ? [a, size != null ? a + size : b != null ? 1 - b : 1] : b != null ? [size != null ? 1 - b - size : 0, 1 - b] : [0, size != null ? size : 1];
    const [x0, x1] = span(left, right, estW), [y0, y1] = span(top, bottom, estH);
    if (g.z != null && !(Number.isFinite(g.z) && g.z >= 0)) why.push(`\`z=${g.z}\` can put the float behind the slide`);
    if (!why.length) {
      if (x0 < -0.005 || y0 < -0.005 || x1 > 1.005 || y1 > 1.005) why.push(`its geometry (${["left", "right", "top", "bottom", "w", "h"].filter((k) => g[k] != null).map((k) => `${k}=${g[k]}`).join(" ")}) puts it partly or wholly off the slide`);
      else if ((w != null && x1 - x0 < MIN_SHARE) || (h != null && y1 - y0 < MIN_SHARE)) why.push(`its box is too small to show text (${Math.round((x1 - x0) * 100)}% × ${Math.round((y1 - y0) * 100)}% of the slide)`);
    }
    float.push(why.length ? `the float's ${why.join("; ")}` : null);
    floatRects.push(why.length ? null : { x0, x1, y0, y1 });
  }
  return { slide: slideWhy, region, rects, float, floatRects };
}

/**
 * Every region chunk of a deck as orz-slides parses it, located in the source, and whether its renderer shows it:
 * [{ slide, name, lines: [0-based line], notes, shown, why }]. The parse is the frame's (parseDeck). What shows is what
 * the frame's renderSlide hands to the markdown renderer, recorded by running it with a recording renderer (speaker
 * notes left out: they go to the presenter's view) — so a region named outside the layout, a repeated region name
 * (only the last one of a slide is kept), a second @footer, or anything but `body` on a template slide is found
 * because the frame drops it, not because a rule here says so. A chunk that cannot be found in the source is reported
 * (it fails loud, never silently printed).
 */
export function slideRegionsShown(text) {
  const src = String(text || "").replace(/\r\n/g, "\n"), lines = src.split("\n"), out = [];
  let deck; try { deck = parseDeck(src); } catch (e) { return [{ slide: 0, name: "", lines: [0], notes: false, shown: false, unlocated: true, why: `orz-slides cannot parse this deck (${e.message})` }]; }
  let cursor = 0;
  deck.slides.forEach((slide, si) => {
    const at = src.indexOf(slide.raw, cursor);
    if (at < 0) { out.push({ slide: si + 1, name: "", lines: [0], notes: false, shown: false, unlocated: true, why: `slide ${si + 1}: orz-slides' parse of it could not be found in the source` }); return; }
    cursor = at + slide.raw.length;
    const from = src.slice(0, at).split("\n").length - 1, to = from + slide.raw.split("\n").length - 1;
    // what the frame renders on the slide: every source its renderer passes to the markdown renderer
    const seen = [], rec = (s) => { seen.push(String(s ?? "")); return ""; };
    renderSlide({ ...slide, notes: undefined }, { render: rec, renderInline: rec }, deck.config);
    const seenLines = new Set(seen.flatMap((s) => s.split("\n")).map(lineKey).filter(Boolean));
    const chunks = [
      ...slide.regions.map((r, k) => ({ name: r.name, markdown: r.markdown, k })),
      ...slide.floats.map((f, fi) => ({ name: "float", markdown: f.markdown, fi })),
      ...(slide.footer !== undefined ? [{ name: "footer", markdown: slide.footer }] : []),
      ...(slide.notes !== undefined ? [{ name: "notes", markdown: slide.notes, notes: true }] : []),
    ];
    // a region the parser overwrote (a second @notes or @footer) is in no field: find its lines from what is left
    const claimed = new Set();
    const locate = (md_) => {
      const want = String(md_).split("\n"), n = want.length;
      for (let s = from; s + n - 1 <= to; s++) {
        let ok = true;
        for (let j = 0; j < n && ok; j++) {
          const have = lines[s + j], w = want[j].trim(), h = have.trim();
          if (claimed.has(s + j) && w) ok = false;
          else if (!w) ok = !h;
          else ok = h === w || (j === 0 && h.endsWith(w)) || (j === n - 1 && h.startsWith(w)) || (n === 1 && h.includes(w));
        }
        if (ok) { const ls = []; for (let j = 0; j < n; j++) if (lines[s + j].trim()) { ls.push(s + j); claimed.add(s + j); } return ls; }
      }
      return null;
    };
    const leaves = slide.kind === "template" ? ["body"] : layoutLeaves(slide.layout);
    // what the slide's ATTRIBUTES let show (round 6, C1-03): its class, background and fit, each layout track, each
    // float's geometry and what the float is painted over — checked against values known to show
    const vis = slideVisibility(slide, deck.config);
    const attrWhy = (c) => {
      const own = vis.slide || (c.name === "float" ? vis.float[c.fi] : c.name === "footer" ? null : vis.region.get(c.name));
      if (own) return own;
      const box = c.name === "float" ? vis.floatRects[c.fi] : c.name === "footer" ? FOOTER_BAND : vis.rects.get(c.name);
      // a float paints over the slide's frame, and over an earlier float of no higher z-index
      const z = (fi) => slide.floats[fi].geom?.z ?? 0;
      const paintsOver = (fi) => c.name !== "float" || (fi !== c.fi && (z(fi) > z(c.fi) || (z(fi) === z(c.fi) && fi > c.fi)));
      const over = vis.floatRects.findIndex((r, fi) => r && box && paintsOver(fi) && overlaps(r, box));
      return over < 0 ? null : `the slide's float ${floatName(slide.floats[over])} is painted opaque over ${c.name === "float" ? "this float" : c.name === "footer" ? "the slide's footer" : `region @${c.name}`} (orz-slides gives a float a solid background), so what lies under it may never show`;
    };
    for (const c of chunks) {
      if (!String(c.markdown).trim()) continue;
      const ls = locate(c.markdown);
      if (!ls) { out.push({ slide: si + 1, name: c.name, lines: [from], notes: false, shown: false, unlocated: true, why: `slide ${si + 1}: orz-slides reads a region @${c.name} here whose lines could not be found in the source` }); continue; }
      if (c.notes) { out.push({ slide: si + 1, name: c.name, lines: ls, notes: true, shown: false }); continue; }
      // shown whole, or line by line (a template renders its body in pieces: the section template, for one, renders
      // its `#` title and other text but not a `##` line)
      const dark = seen.includes(c.markdown) ? [] : ls.filter((k) => !seenLines.has(lineKey(lines[k].slice(lines[k].indexOf(lines[k].trim()))))
        && !String(c.markdown).split("\n").some((l) => l.trim() && lines[k].trim().endsWith(l.trim()) && seenLines.has(lineKey(l))));
      const same = slide.regions.filter((r) => r.name === c.name).length;
      const partly = dark.length && dark.length < ls.length;
      const why = !dark.length ? "" : `slide ${si + 1}: ${partly ? `the ${slide.template || "slide"} template does not render this line of @${c.name}` : `the region @${c.name} is not shown by orz-slides — ${same > 1 ? `the slide names @${c.name} ${same} times and the frame keeps only the last` : slide.kind === "template" ? (c.name === "body" ? `the ${slide.template} template renders none of it` : "a template slide shows only its body") : `the slide's layout has no region "${c.name}" (it has: ${leaves.join(", ")})`}`}; its text reaches no student`;
      const aw = attrWhy(c), hid = aw ? `slide ${si + 1}: ${aw}` : "";
      if (dark.length && dark.length < ls.length) out.push({ slide: si + 1, name: c.name, lines: ls.filter((k) => !dark.includes(k)), notes: false, shown: !hid, why: hid, ...(hid ? { attribute: true } : {}) });
      if (dark.length) out.push({ slide: si + 1, name: c.name, lines: dark, notes: false, shown: false, why });
      else out.push({ slide: si + 1, name: c.name, lines: ls, notes: false, shown: !hid, why: hid, ...(hid ? { attribute: true } : {}) });
    }
    // lines of the slide the parser put in no chunk it kept (an overwritten @notes or @footer chunk): what is left of
    // the slide once its chunks, its title and its markers are accounted for
    const titleLine = slide.title !== undefined ? lines.findIndex((l, k) => k >= from && k <= to && /^##\s/.test(l.trim()) && l.trim().replace(/^##\s+/, "").trim() === slide.title) : -1;
    if (titleLine >= 0) {
      const over = vis.floatRects.findIndex((r) => r && overlaps(r, TITLE_BAND));
      const tw = vis.slide || (over >= 0 ? `the slide's float ${floatName(slide.floats[over])} is painted opaque over the slide's title band` : "");
      if (tw) out.push({ slide: si + 1, name: "title", lines: [titleLine], notes: false, shown: false, attribute: true, why: `slide ${si + 1}: ${tw}` });
    }
    const left = [], leftNotes = [];
    let region = null;
    for (let k = from; k <= to; k++) {
      const t = lines[k].trim(), rm = SLIDE_REGION_MARKER.exec(lines[k]);
      if (rm) { region = rm[1].toLowerCase(); continue; }
      if (!t || claimed.has(k) || k === titleLine || (k === from && SLIDE_AT.test(t))) continue;
      // an overwritten @notes chunk was the presenter's text all the same: notes, never a unit
      (region === "notes" ? leftNotes : left).push(k);
    }
    if (leftNotes.length) out.push({ slide: si + 1, name: "notes", lines: leftNotes, notes: true, shown: false });
    if (left.length) out.push({ slide: si + 1, name: "", lines: left, notes: false, shown: false, why: `slide ${si + 1}: text orz-slides keeps in no region it shows (a repeated @footer is overwritten by the last): "${lines[left[0]].trim().slice(0, 50)}"` });
  });
  return out;
}

/**
 * What a source line holds that none of the rendered pieces holds: "" when everything but table syntax (pipes,
 * blockquote markers, whitespace) is accounted for. Each piece is removed once, in order; an escaped pipe in the source
 * is a plain pipe in the piece (markdown-it's escapedSplit).
 */
export function unrenderedText(line, pieces) {
  let rest = String(line ?? "");
  for (const p of pieces) {
    if (!p) continue;
    const re = new RegExp(String(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\|/g, "\\\\?\\|"));
    const m = re.exec(rest);
    if (m) rest = rest.slice(0, m.index) + " ".repeat(m[0].length) + rest.slice(m.index + m[0].length);
  }
  return rest.replace(/[\s|>]+/g, " ").trim();
}
/**
 * What orz-slides shows of a deck, by its own grammar: the deck config values it prints are printed (and read as
 * units by the segmenter); everything before the first slide marker is dropped (it prints nothing); a `@notes`
 * region goes to the presenter's notes (it prints nothing on a slide). Returns the deck block:
 * { start, end, values: [{ key, line, value }] } (0-based lines), or null.
 */
function slidesFrame(src, { printed, unprint, notes, hide, dropped }) {
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
  // which slide region each line falls in, and whether the frame shows that region, is orz-slides' OWN call: its parser
  // (parseDeck) and its renderer (renderSlide) are run, not modelled (red team round 5, CONTROL C1-01/C1-02)
  // A dropped region prints nothing: its lines are unprinted, and why is kept per line — a unit read there is text the
  // review reads and no student sees (shipped.mjs hiddenInText reports it, with this reason); a label over nothing
  // (a section slide's `##`, which the section template does not render) is simply not printed
  for (const r of slideRegionsShown(src)) {
    if (r.notes) { for (const k of r.lines) { notes.add(k); unprint.add(k); } continue; }
    if (r.shown) continue;
    for (const k of r.lines) { unprint.add(k); if (!dropped.has(k)) dropped.set(k, r.why); }
    if (r.unlocated) hide(r.lines[0], [r.why]);
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
