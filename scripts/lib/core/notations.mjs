// Framework notations (redesign P6, D24/D25). The deliverable is lean Markdown in orz-markdown PLUS the notations of the
// framework that will assemble it — orz-slides (deck config, slide markers, layouts, regions, templates), orz-paged
// (the `{{nyml kind: document}}` settings), orz-mdhtml (core orz-markdown with an optional theme). The frameworks'
// builders wrap a source without validating it, so assembly-readiness is checked here, against each framework's own
// definitions (theme and template ids read from the installed packages) and its documented grammar.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let defs = null;
/** Theme and template ids, from the installed frameworks (async import once, cached). */
export async function frameworkDefinitions() {
  if (defs) return defs;
  const slides = await import("orz-slides"), paged = await import("orz-paged");
  const pkgDir = (name) => { const main = require.resolve(name); const k = main.lastIndexOf(`node_modules${path.sep}${name}`); return main.slice(0, k + `node_modules${path.sep}${name}`.length); };
  const mdThemes = (() => { try { const dir = path.join(pkgDir("orz-markdown"), "themes"); return fs.readdirSync(dir).filter((f) => f.endsWith(".css") && f !== "common.css").map((f) => f.replace(/\.css$/, "")); } catch { return []; } })();
  defs = {
    slideThemes: slides.THEME_DEFS.map((t) => t.id),
    pagedTemplates: paged.loadTemplates().map((t) => t.id),
    pagedThemes: [...paged.loadThemes().themes.map((t) => t.id), "none"],
    mdThemes,
  };
  return defs;
}

// ---- orz-slides ---------------------------------------------------------------------------------------------------
const DECK_KEYS = new Set(["title", "theme", "ratio", "author", "footer", "transition"]);
const TEMPLATES = { title: 6, section: 4, outline: 3, closing: 3 };
const PRESETS = { "2col": ["left", "right"], "3col": ["left", "mid", "right"], "2row": ["top", "bottom"], "main-side": ["main", "side"], quad: ["tl", "tr", "bl", "br"] };
const RESERVED = new Set(["notes", "footer"]);
const TRACK = /^(?:auto|\d+(?:\.\d+)?(?:fr|%|px)?)(?:\/(?:auto|\d+(?:\.\d+)?(?:fr|%|px)?))*$/;

/** Parse a raw split ("col 2/1 { a; row 1/1 { b; c } }") into its leaf region names, or throw. */
export function splitLeaves(src) {
  let i = 0; const s = src.trim();
  const ws = () => { while (s[i] === " ") i++; };
  const word = () => { ws(); const m = /^[A-Za-z0-9_%./-]+/.exec(s.slice(i)); if (!m) throw new Error(`expected a name at "${s.slice(i, i + 12)}"`); i += m[0].length; return m[0]; };
  const item = () => {
    ws(); const w = word();
    if (w === "row" || w === "col") {
      const tracks = word(); if (!TRACK.test(tracks)) throw new Error(`bad track list "${tracks}"`);
      ws(); if (s[i] !== "{") throw new Error(`expected "{" after ${w} ${tracks}`); i++;
      const leaves = [...item()]; let items = 1; ws();
      while (s[i] === ";") { i++; leaves.push(...item()); items++; ws(); }
      if (s[i] !== "}") throw new Error("unbalanced braces in the layout"); i++;
      if (items !== tracks.split("/").length) throw new Error(`${w} ${tracks} has ${tracks.split("/").length} track(s) but ${items} item(s)`);
      return leaves;
    }
    if (!/^[a-z][a-z0-9-]*$/.test(w)) throw new Error(`"${w}" is not a region name`);
    return [w];
  };
  const leaves = item(); ws();
  if (i !== s.length) throw new Error(`unexpected "${s.slice(i)}" after the layout`);
  return leaves;
}

/** Problems with an orz-slides deck source: [{ line, issue }]. */
export function checkSlidesNotation(text, d) {
  const P = [], lines = String(text).split("\n");
  const add = (line, issue) => P.push({ line, issue });
  // a name looked up in the installed frame's vocabulary: a newer frame may know it (the notations only grow, D36),
  // so it is reported apart and never blocks an agent from using what the frame offers (D38)
  const vocab = (line, issue) => P.push({ line, aspect: "vocabulary", issue });
  let decks = 0, slide = null;
  const closeSlide = () => {
    if (!slide) return;
    for (const r of slide.regions) if (!slide.leaves.includes(r.name) && !RESERVED.has(r.name)) add(r.line, `region @${r.name} is not a region of this slide's layout (${slide.leaves.join(", ") || "single region"})`);
  };
  for (let n = 0; n < lines.length; n++) {
    const t = lines[n].trim();
    if (t.startsWith("<!-- deck")) {
      decks++; if (decks > 1) add(n + 1, "a deck has one <!-- deck … --> config block");
      if (slide) add(n + 1, "the deck config block comes before the first slide");
      let j = n; const body = [];
      if (!t.endsWith("-->")) { for (j = n + 1; j < lines.length && !lines[j].includes("-->"); j++) body.push(lines[j]); }
      for (const l of body) {
        if (!l.trim()) continue;
        const m = /^\s*([a-z]+)\s*:\s*(.*)$/.exec(l);
        if (!m) { add(n + 1, `deck config line is not "key: value": ${l.trim()}`); continue; }
        if (!DECK_KEYS.has(m[1])) vocab(n + 1, `deck config key "${m[1]}" is not known to the installed orz-slides (known: ${[...DECK_KEYS].join(", ")})`);
        // a theme is the frame's clothing, not the course's notation (D36): reported apart, never a defect
        if (m[1] === "theme" && !d.slideThemes.includes(m[2].trim())) P.push({ line: n + 1, aspect: "theme", issue: `slide theme "${m[2].trim()}" is not in the current orz-slides (has: ${d.slideThemes.join(", ")})` });
        if (m[1] === "ratio" && !["16:9", "4:3"].includes(m[2].trim())) vocab(n + 1, `ratio ${m[2].trim()} is not one the installed orz-slides knows (16:9, 4:3)`);
      }
      n = j; continue;
    }
    const sm = /^<!--\s*slide\b(.*?)-->\s*$/.exec(t);
    if (sm) {
      closeSlide();
      const tokens = sm[1].trim(); let rest = tokens;
      const opts = {};
      rest = rest.replace(/\b(template|v|bg|t|fit|class|id)=(\S+)/g, (_, k, v) => { opts[k] = v; return " "; }).replace(/\bstep\b/g, " ").trim();
      if (opts.template && !(opts.template in TEMPLATES)) vocab(n + 1, `slide template "${opts.template}" is not known to the installed orz-slides (it has: ${Object.keys(TEMPLATES).join(", ")})`);
      if (opts.v !== undefined) {
        if (!opts.template) add(n + 1, "v= selects a template variant and needs template=");
        else if (opts.template in TEMPLATES && !(Number.isInteger(Number(opts.v)) && Number(opts.v) >= 1 && Number(opts.v) <= TEMPLATES[opts.template])) vocab(n + 1, `template=${opts.template} has variants v=1…${TEMPLATES[opts.template]} (got v=${opts.v})`);
      }
      if (opts.fit && !["fit", "scroll", "off"].includes(opts.fit)) vocab(n + 1, `fit=${opts.fit} is not one the installed orz-slides knows (fit, scroll, off)`);
      let leaves = ["body"];
      if (rest) {
        const [first, ...more] = rest.split(/\s+/);
        if (PRESETS[first]) {
          leaves = PRESETS[first];
          const ratio = more.join(" ").replace(/^\[|\]$/g, "").trim();
          if (ratio && !TRACK.test(ratio)) add(n + 1, `unexpected "${more.join(" ")}" after the ${first} preset (a track ratio like 3/2 is allowed)`);
        } else if (first === "row" || first === "col") {
          try { leaves = splitLeaves(rest); } catch (e) { add(n + 1, `layout: ${e.message}`); }
        } else vocab(n + 1, `layout or option "${first}" is not known to the installed orz-slides`);
      }
      slide = { line: n + 1, leaves, regions: [] };
      continue;
    }
    const rm = /^<!--\s*@([a-z][a-z0-9-]*)\b/.exec(t);
    if (rm && rm[1] !== "float") { if (!slide) add(n + 1, `region @${rm[1]} appears before any slide`); else slide.regions.push({ name: rm[1], line: n + 1 }); }
  }
  closeSlide();
  return P;
}

// ---- orz-paged ----------------------------------------------------------------------------------------------------
/** Problems with an orz-paged document's settings block. */
export function checkPagedNotation(text, d) {
  const P = [];
  const m = /\{\{nyml\s*\n([\s\S]*?)\}\}/.exec(String(text));
  if (!m || !/^\s*kind:\s*document\s*$/m.test(m[1])) { P.push({ line: 1, issue: "an orz-paged document opens with a {{nyml kind: document}} settings block" }); return P; }
  const get = (k) => new RegExp(`^\\s*${k}:\\s*(\\S+)\\s*$`, "m").exec(m[1])?.[1];
  const tpl = get("template"), th = get("theme");
  if (tpl && !d.pagedTemplates.includes(tpl) && !d.pagedTemplates.includes(`${tpl}-section`)) P.push({ line: 1, aspect: "vocabulary", issue: `orz-paged template "${tpl}" is not known to the installed orz-paged (it has: ${d.pagedTemplates.join(", ")})` });
  if (th && !d.pagedThemes.includes(th)) P.push({ line: 1, aspect: "theme", issue: `orz-paged theme "${th}" is not in the current orz-paged (has: ${d.pagedThemes.join(", ")})` });
  return P;
}
