// Unit segmentation and the judgment-kind classifier (redesign P4; F1, D18, D19-E). Deterministic: the harness, not
// the agent, decides what a unit is, so no prose can be left out of the model.
//
// A unit is the smallest piece that can be checked on its own: a paragraph, a list item (on slides: a whole bullet
// group), a table row, an equation block, a callout, a figure (image, Mermaid, chart, structure), a question and each
// worked answer. Title, outline, section and closing slides, and summary-like sections, are framing.
//
// STRUCTURE IS ONLY WHAT THE FRAME DOES NOT PRINT (red team round 2, CONTROL C3-01/02/03/05). A line is structure only
// when no reader of the rendered deliverable sees it as content:
//   - a comment (a slide or region marker, a note) — but text after its "-->" on the same line prints, and is a unit;
//   - a `#`/`##` heading that is a label (it names the section; a heading that reads as sentences is also a unit);
//     `###`–`######` headings print as text and name nothing: each is a unit (form "heading");
//   - a table's header row and separator when the table has data rows and the header ROW as a whole is a label (round 5,
//     C3-01: never cell by cell); a header-only table, or a header that reads as sentences, is a unit;
//   - every printed label that stays structure is shown with what it heads (`headings`: labelsOver, round 5);
//   - the credit line, only as a short single attribution line (every sentence of it a credit); a paragraph that opens
//     "Adapted from …" and carries more is a unit. It prints, so it is shown with every unit it credits (`credit`,
//     round 6, C3-01) — read by every link and framing review of the deliverable, never by no one;
//   - the format-1 header and any other document or metadata block ({{nyml kind: document | meta}}) — less the values
//     its frame PRINTS from the header (round 6, C3-02; D52): the head metadata (title, author, description), a deck's
//     footer, an orz-paged running header or footer are each a framing unit (a label-sized title is a label, the deck
//     title or the document title, shown with every unit); every other {{nyml}} block —
//     abstract, question-open, exam-title … — is an element the frame prints, and is a unit;
//   - the list items of the deliverable's restated "Learning objectives" (read in full by the restated-objective check).
//
// WHAT PRINTS IS THE PARSER'S CALL (red team round 3, CONTROL C3-03/04/06): the segmenter's line grammar decides where
// units begin and end, but whether a line prints is read from orz-markdown's own token stream (printed.mjs). A line the
// grammar took for structure that orz-markdown prints is a unit — prose inside a `:::: tabs` group but outside every
// tab, a `{{nyml}}` block orz closed earlier than the grammar thought, an indented "comment" that is a code block —
// unless it is one of the few printed labels, each bounded:
//   - a `#`/`##` label heading only if it is a heading: it heads content (a unit, or the restated objectives) before the
//     next heading of its level or a slide marker (a section-template slide heads the slides up to the next
//     framing-template slide); a chain of headings over nothing is a chain of units;
//   - a container label that prints (`::: spoil <label>` → its <summary>, `::: tab <label>` → its tab button) only as
//     a label over a non-empty body;
//   - the credit line only as THE attribution: one per deliverable (two or more are each a unit);
//   - a table header over data rows, the restated objectives (above).
import { sha256 } from "../records/canonical.mjs";
import { plainForQuantities } from "./dependencies.mjs";
import { clean, statesValue, valueProse } from "./values.mjs";
import { factNamesIn } from "./names.mjs";
import { NYML_NOTATION_KINDS, frameOf, listItemsOf, nymlKindOf, printedModel } from "./printed.mjs";

export { NYML_NOTATION_KINDS };

export const DELIVERABLE_DIRS = Object.freeze(["study-guide", "slides", "practice"]);
const FRAMING_SECTION = /^(summary|overview|introduction|what we will cover|key takeaways|looking ahead|recap|outline)\b/i;
const FRAMING_TEMPLATES = new Set(["title", "outline", "section", "closing"]);

export const LIST_ITEM = /^(?:[-*+]|\d+[.)])\s+/;
/** A label, not prose: a few words and no sentence boundary inside (a section title, a column heading). */
export const isLabel = (t) => { const s = String(t).replace(/[*_`]/g, "").trim(); return (s.match(/\S+/g) || []).length <= 12 && !/[.!?;]\s+\S/.test(s); };
const CREDIT_SENTENCE = /^\*?(?:Adapted (?:from|and reorganized|with)\b|Sources?:|Attribution:|Licen[cs]ed under\b)/i;
/** A short single attribution line: one line, and every sentence of it a credit (round 2, C3-01). */
export const isCreditLine = (t) => {
  const s = String(t).trim();
  if (s.length > 450 || !CREDIT_SENTENCE.test(s)) return false;
  return s.replace(/^\*+|\*+$/g, "").split(/(?<=[.!?])\s+(?=[A-Z])/).every((x) => CREDIT_SENTENCE.test(x.trim()));
};
const nymlKind = (lines) => nymlKindOf(lines.join("\n"));
/**
 * The restated "Learning objectives" lists of a deliverable (redteam r1 C3-06, C4-12). A "Learning objectives" heading
 * of any level opens a section that runs to the next heading of its level or higher (a `#` heading counts as `##`), a
 * slide marker or a rule. Only the section's LIST ITEMS are restated objectives: structure, which the restated-
 * objective check reads in full. Any other prose in the section is content, segmented into units like any other.
 * Returns [{ line, items: [{ line, text }], listLines: Set }] (0-based line indices).
 */
export function learningObjectiveSections(text) {
  const lines = String(text || "").split("\n"), out = [];
  // which list item orz-markdown reads each line as part of (a lazy continuation line too: round 4, C2-01)
  let owner = null;
  const ownerOf = (k) => { if (!owner) { owner = new Map(); for (const it of listItemsOf(text)) for (const x of it.lines) owner.set(x, it.start); } return owner.get(k); };
  for (let i = 0; i < lines.length; i++) {
    const h = /^(#{1,6})\s+learning objectives\s*:?\s*$/i.exec(lines[i].trim());
    if (!h) continue;
    const level = Math.max(2, h[1].length), sec = { line: i, items: [], listLines: new Set() };
    let k = i + 1;
    while (k < lines.length) {
      const t = lines[k].trim(), hh = /^(#{1,6})\s/.exec(t);
      if ((hh && hh[1].length <= level) || /^<!--\s*slide\b/.test(t) || /^(?:-{3,}|\*{3,}|_{3,})$/.test(t)) break;
      if (!LIST_ITEM.test(t)) { k++; continue; }
      // a list: each item with its indented continuation lines (the segmenter's own list rule)
      while (k < lines.length) {
        const lt = lines[k].trim();
        if (LIST_ITEM.test(lt)) { sec.items.push({ line: k, text: lt.replace(LIST_ITEM, "") }); sec.listLines.add(k); k++; continue; }
        const last = sec.items[sec.items.length - 1];
        if (lt && last && (/^\s{2,}/.test(lines[k]) || (ownerOf(k) !== undefined && ownerOf(k) === ownerOf(last.line)))) { sec.items[sec.items.length - 1].text += ` ${lt}`; sec.listLines.add(k); k++; continue; }
        break;
      }
    }
    out.push(sec);
    i = k - 1;
  }
  return out;
}

/** A unit's role, from its structure and its facts, never from a sidecar (redteam r1 C3-15): framing may not carry facts (D19-I). */
export const derivedRole = (segRole, judgment) => (segRole === "framing" && !judgment.some((k) => k !== "knowledge-based") ? "framing" : "teaching");

export const slugify = (s) => String(s).toLowerCase().replace(/[`*_$\\{}]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "section";
/** The text a unit's identity is computed over: whitespace and markup emphasis folded. */
export const normalizeUnit = (t) => String(t).replace(/\s+/g, " ").replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1").trim();
export const unitHash = (t) => sha256(normalizeUnit(t));
export const tokensOf = (t) => [...new Set(normalizeUnit(t).toLowerCase().match(/[a-z0-9]+/g) || [])].filter((w) => w.length > 2).sort();

/**
 * Segment one deliverable. Returns [{ form, role, section, text, startLine, endLine }] in document order, plus
 * `covered` — the set of line numbers that belong to a unit or to structure (every other non-blank line is a gap).
 */
export function segmentDeliverable(text, deliverable, { declared = null } = {}) {
  const lines = String(text || "").split("\n");
  const units = [], covered = new Set();
  const orz = printedModel(text, { frame: frameOf(deliverable, text, declared) });
  const isSlides = orz.frame === "slides";
  let section = "top", sectionTitle = "", slideNo = 0, slideTemplate = null;
  const restated = new Set(learningObjectiveSections(text).flatMap((s) => [...s.listLines])); // read by the restated-objective check
  // why each structure line is structure, and the section it stands in (read again once every unit is known)
  const why = new Map(), ctx = new Map();
  const over = new Map(); // a unit's first line → the label line over it (a table header, a container label)
  const struct = (i, reason = "silent") => { covered.add(i); if (!why.has(i)) { why.set(i, reason); ctx.set(i, { section, role: roleFor(), slideTemplate }); } };
  const roleFor = () => (isSlides && FRAMING_TEMPLATES.has(slideTemplate)) || FRAMING_SECTION.test(sectionTitle) ? "framing" : "teaching";
  const push = (form, a, b, role = roleFor(), label = null, text = null) => {
    const body = (text ?? lines.slice(a, b + 1).join("\n")).trim();
    for (let k = a; k <= b; k++) covered.add(k);
    if (!body) return;
    units.push({ form, role, section, text: body, startLine: a + 1, endLine: b + 1, ...(label ? { label } : {}) });
  };
  let i = 0;
  while (i < lines.length) {
    const l = lines[i], t = l.trim();
    if (!t) { i++; continue; }
    // speaker notes (orz-slides `<!-- @notes -->`) are the presenter's, not the students': they print nothing on a
    // slide, so they are no unit and never count toward coverage (red team round 4, C1-01)
    if (orz.notes.has(i)) { struct(i, "notes"); i++; continue; }
    // {{nyml … }}: the orz-paged settings and metadata blocks are notation (D42); every other kind is an element the
    // frame prints (an abstract, a question …), so it is a unit — a question element is a question (round 2, C3-05)
    // where the block ends is orz-markdown's call: the first line that CONTAINS "}}" (round 3, C3-06); a {{nyml that
    // orz does not read as a block (never closed) prints as text, and is read as a paragraph below
    const nb = orz.blocks.get(i);
    if (/^\{\{nyml\b/.test(t) && nb?.name === "nyml") {
      const end = nb.end, kind = nymlKind(lines.slice(i, end + 1).map((l, k) => (k === end - i ? l.slice(0, l.indexOf("}}")) : l)));
      if (NYML_NOTATION_KINDS.includes(kind) || !kind) {
        for (let k = i; k <= end; k++) struct(k);
        // the settings values the frame PRINTS are read (round 6, C3-02): an orz-paged running header or footer (on every
        // page) and the head metadata are each a framing unit, owing the off-plan read; a metadata title (the tab) is a
        // label when it reads as one, shown with every unit like the deck title
        // (D52: the values come from the format-1 header — a deck's title is the deck title, as the 0.x deck block's was)
        for (const v of orz.settings.filter((x) => x.start >= i && x.end <= end)) {
          if (v.key === "title" && isLabel(v.value)) { why.set(v.start, orz.frame === "slides" ? "deck-label" : "meta-label"); continue; }
          push("paragraph", v.start, v.end, "framing", null, v.value);
        }
      }
      else push(/^question-/.test(kind) ? "question" : "element", i, end, roleFor(), kind);
      i = end + 1; continue;
    }
    // HTML comments: slide and region markers, notes (a 0.x `<!-- deck … -->` block renders nothing: a format defect).
    // What follows the comment's "-->" on its last line is not a comment: the renderer prints it, so it is a unit (round
    // 2, C3-02)
    if (t.startsWith("<!--")) {
      const m = /<!--\s*slide\b([^>]*)-->/.exec(t);
      if (m) { slideNo++; slideTemplate = /template=([a-z-]+)/.exec(m[1])?.[1] || null; section = `slide-${slideNo}`; sectionTitle = ""; }
      let j = i; while (j < lines.length && !lines[j].includes("-->")) j++;
      for (let k = i; k <= j; k++) struct(k);
      const rest = j < lines.length ? lines[j].slice(lines[j].indexOf("-->") + 3).replace(/<!--[\s\S]*?-->/g, " ").trim() : "";
      if (rest) push("paragraph", j, j, roleFor(), null, rest);
      i = j + 1; continue;
    }
    // horizontal rules are structure; so is the credit line (the rights module's), but only as a short single
    // attribution line — a paragraph that opens "Adapted from …" and goes on is content (round 2, C3-01)
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(t)) { struct(i); i++; continue; }
    if (isCreditLine(t) && !(i + 1 < lines.length && lines[i + 1].trim() && !/^(#{1,6}\s|<!--|\$\$|\{\{|:::|\||!\[|(?:[-*+]|\d+[.)])\s)/.test(lines[i + 1].trim()))) { struct(i, "credit"); i++; continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      if (h[1].length <= 2) {
        sectionTitle = h[2].trim();
        section = isSlides ? `slide-${slideNo}-${slugify(sectionTitle)}` : slugify(sectionTitle);
      }
      // a heading prints: a `#`/`##` label names its section and is structure; a `###`+ heading, or a section heading
      // that reads as sentences, is read like any other text (round 2, C3-03)
      if (h[1].length <= 2 && isLabel(h[2])) struct(i, "heading"); else push("heading", i, i);
      i++; continue;
    }
    // display equations
    if (t.startsWith("$$")) {
      let j = i; if (!(t.length > 2 && t.endsWith("$$") && t !== "$$")) { j = i + 1; while (j < lines.length && !lines[j].includes("$$")) j++; }
      push("equation", i, Math.min(j, lines.length - 1)); i = j + 1; continue;
    }
    // figures as blocks
    const fig = /^\{\{(mermaid|chart|smiles|structure)\b/.exec(t);
    if (fig) {
      // where the block ends is orz-markdown's call (its block-directive token), never a closing tag of our own: a
      // multi-line `{{mermaid … }}` closes at its `}}` line (the legacy `{{/mermaid}}` form, which orz does not
      // render as one block, keeps the old scan)
      const ob = orz.blocks.get(i);
      if (ob && ob.end >= i) { push("figure", i, Math.min(ob.end, lines.length - 1)); i = ob.end + 1; continue; }
      let j = i; if (!t.includes(`{{/${fig[1]}}}`) && !t.endsWith("}}") ) { while (j < lines.length && !lines[j].includes(`{{/${fig[1]}}}`)) j++; }
      else if (!t.includes(`{{/${fig[1]}}}`) && t.endsWith("}}") && !/^\{\{\w+\}\}$/.test(t)) j = i;
      else if (/^\{\{\w+\}\}$/.test(t)) { while (j < lines.length && !lines[j].includes(`{{/${fig[1]}}}`)) j++; }
      push("figure", i, Math.min(j, lines.length - 1)); i = j + 1; continue;
    }
    if (/^!\[[^\]]*\]\([^)]*\)/.test(t)) { push("figure", i, i); i++; continue; }
    // tab groups: each tab is a question or an answer
    if (/^::::\s*tabs\b/.test(t)) {
      struct(i);
      let j = i + 1;
      while (j < lines.length && !/^::::\s*$/.test(lines[j].trim())) {
        const tab = /^:::\s*tab\s+(.*)$/.exec(lines[j].trim());
        if (tab) {
          struct(j, "label");
          let k = j + 1; while (k < lines.length && !/^:::\s*$/.test(lines[k].trim())) k++;
          const label = tab[1].trim();
          const form = /^(answer|solution|worked answer)\b/i.test(label) ? "answer" : /^(q\b|q\s*\d|question|worked example|example|exercise|problem)/i.test(label) ? "question" : "callout";
          if (k > j + 1) { push(form, j + 1, k - 1, roleFor(), label); over.set(j + 1, j); } else struct(j + 1); // the tab's label ("Q 5", "Answer 5") is how the material refers to it
          if (k < lines.length) struct(k);
          j = k + 1; continue;
        }
        if (lines[j].trim()) struct(j);
        j++;
      }
      if (j < lines.length) struct(j);
      i = j + 1; continue;
    }
    // callouts
    const box = /^:::\s*([a-z-]+)\b/.exec(t);
    if (box) {
      struct(i, "label");
      let j = i + 1; while (j < lines.length && !/^:::\s*$/.test(lines[j].trim())) j++;
      if (j > i + 1) { push("callout", i + 1, j - 1); over.set(i + 1, i); }
      if (j < lines.length) struct(j);
      i = j + 1; continue;
    }
    // tables: each data row is a unit; the header row and separator are structure only while the table has data rows
    // and the header cells are labels — a header-only table prints, and is a unit (round 2, C3-03)
    if (t.startsWith("|")) {
      let j = i; while (j < lines.length && lines[j].trim().startsWith("|")) j++;
      const sep = i + 1 < j && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim());
      const cells = t.replace(/^\||\|$/g, "").split("|");
      if (sep) struct(i + 1);
      // the header ROW is the label, not each cell (red team round 5, CONTROL C3-01: four 12-word "labels" carried a
      // 37-word lesson): it is structure only when the whole row is label-sized; then it is shown with every row
      if (sep && j > i + 2 && isLabel(cells.join(" "))) struct(i, "table-header"); else push("table-row", i, i);
      for (let k = sep ? i + 2 : i + 1; k < j; k++) { push("table-row", k, k); over.set(k, i); }
      i = j; continue;
    }
    // lists: on slides a whole contiguous list is one bullet group; elsewhere each item (with continuations)
    if (/^(?:[-*+]|\d+[.)])\s+/.test(t)) {
      if (restated.has(i)) { while (restated.has(i)) struct(i++, "restated"); continue; }
      let j = i, items = [];
      while (j < lines.length) {
        const lt = lines[j].trim();
        if (/^(?:[-*+]|\d+[.)])\s+/.test(lt)) { items.push([j, j]); j++; continue; }
        if (lt && /^\s{2,}/.test(lines[j]) && items.length) { items[items.length - 1][1] = j; j++; continue; }
        break;
      }
      if (isSlides) push("slide-group", i, j - 1);
      else for (const [a, b] of items) push("list-item", a, b);
      i = j; continue;
    }
    // paragraph: until a blank line or a line that starts another form
    let j = i;
    while (j + 1 < lines.length) {
      const n = lines[j + 1].trim();
      if (!n || /^(#{1,6}\s|<!--|\$\$|\{\{|:::|\||!\[|(?:[-*+]|\d+[.)])\s)/.test(n)) break;
      j++;
    }
    push("paragraph", i, j); i = j + 1;
  }
  settlePrinted({ lines, units, covered, why, ctx, orz, isSlides });
  units.sort((a, b) => a.startLine - b.startLine);
  labelsOver({ lines, units, why, orz, isSlides, over });
  return { units, covered, lineCount: lines.length };
}

const SLIDE_MARKER = /^<!--\s*slide\b([^>]*)-->/;
const slideTemplateOf = (l) => /template=([a-z-]+)/.exec(SLIDE_MARKER.exec(String(l).trim())?.[1] || "")?.[1] || null;
/**
 * Every structure line orz-markdown prints is a unit unless it is a bounded printed label (round 3, C3-03/04/06): see
 * the head of this file. Units are added in place (`units`, `covered`); the caller re-sorts them.
 */
function settlePrinted({ lines, units, covered, why, ctx, orz, isSlides }) {
  const inUnit = new Set();
  for (const u of units) for (let k = u.startLine - 1; k < u.endLine; k++) inUnit.add(k);
  const add = (form, a, b, text, c) => {
    for (let k = a; k <= b; k++) { inUnit.add(k); covered.add(k); }
    if (String(text).trim()) units.push({ form, role: c.role, section: c.section, text: String(text).trim(), startLine: a + 1, endLine: b + 1 });
  };
  const struck = [...why.keys()].filter((k) => orz.printed.has(k) && !inUnit.has(k)).sort((a, b) => a - b);
  // 1. what prints and is no label at all: the leaf block it belongs to (its struck lines) is a unit
  const later = [];
  for (let n = 0; n < struck.length; n++) {
    const k = struck[n], reason = why.get(k);
    if (inUnit.has(k)) continue;
    if (reason === "restated" || reason === "table-header" || reason === "deck-label" || reason === "meta-label") continue;
    if (reason === "heading" || reason === "credit" || reason === "label") { later.push(k); continue; }
    const [a, b] = orz.leaf.get(k) || [k, k];
    let e = k; while (e + 1 <= b && why.has(e + 1) && !inUnit.has(e + 1) && !["heading", "credit", "label", "restated", "table-header"].includes(why.get(e + 1))) e++;
    add(orz.headings.has(k) ? "heading" : "paragraph", Math.max(a, k), e, lines.slice(Math.max(a, k), e + 1).join("\n"), ctx.get(k));
  }
  // 2. container labels: a label over a non-empty body; else the printed label is a unit
  for (const k of later.filter((x) => why.get(x) === "label")) {
    const label = orz.labels.get(k);
    if (label === undefined) continue;
    const body = k + 1 < lines.length && inUnit.has(k + 1);
    if (!(isLabel(label) && body)) add("heading", k, k, label, ctx.get(k));
  }
  // 3. the credit line: ONE per deliverable (its attribution); where there are more, none is — each is read as a unit
  const credits = later.filter((x) => why.get(x) === "credit");
  if (credits.length > 1) for (const k of credits) add("paragraph", k, k, lines[k], ctx.get(k));
  // 4. a label heading only if it heads content (a unit, or the restated objectives) within its scope
  const content = (k) => inUnit.has(k) || why.get(k) === "restated";
  for (const k of later.filter((x) => why.get(x) === "heading")) {
    const level = Math.max(1, orz.headings.get(k) || 2), c = ctx.get(k);
    const sectionSlide = isSlides && ["section", "title"].includes(c.slideTemplate);
    let heads = false;
    for (let m = k + 1; m < lines.length; m++) {
      const marker = SLIDE_MARKER.test(lines[m].trim());
      if (marker && !(sectionSlide && !["section", "title", "outline", "closing"].includes(slideTemplateOf(lines[m])))) break;
      if (!sectionSlide && orz.headings.has(m) && orz.headings.get(m) <= level) break;
      if (content(m)) { heads = true; break; }
    }
    if (!heads) add("heading", k, k, lines[k], c);
  }
}

/**
 * The printed labels over each unit (red team round 5, CONTROL C3-01): a label that prints and is no unit of its own —
 * the deck title, the `#` and `##` label headings in force, the table header over a row, the spoil or tab label over a
 * container's body — is read by nobody unless it is shown with the content it heads. Each unit gets `headings`: those
 * labels, outermost first (absent when there are none). The reviews show them, and a link review is bound to them.
 */
function labelsOver({ lines, units, why, orz, isSlides, over }) {
  const inUnit = new Set();
  for (const u of units) for (let k = u.startLine - 1; k < u.endLine; k++) inUnit.add(k);
  const label = (k) => why.has(k) && !inUnit.has(k) && orz.printed.has(k);
  const deckTitle = (orz.settings || []).find((v) => v.key === "title" && why.get(v.start) === "deck-label" && orz.printed.has(v.start));
  const metaTitle = (orz.settings || []).find((v) => v.key === "title" && why.get(v.start) === "meta-label" && orz.printed.has(v.start));
  // the credit line (round 6, C3-01): the one attribution that stays structure prints, and credits the whole deliverable,
  // so it is shown with every unit of it (`credit`, kept apart from `headings`: a review is bound to it — see
  // alignment.mjs — without moving the round-5 label baseline)
  const creditLine = [...why.keys()].find((k) => why.get(k) === "credit" && !inUnit.has(k) && orz.printed.has(k));
  const credit = creditLine === undefined ? null : lines[creditLine].trim();
  const starts = new Map();
  for (const u of units) { const k = u.startLine - 1; if (!starts.has(k)) starts.set(k, []); starts.get(k).push(u); }
  let h1 = null, h2 = null;
  for (let k = 0; k < lines.length; k++) {
    const t = lines[k].trim();
    if (isSlides && SLIDE_MARKER.test(t)) { h2 = null; if (FRAMING_TEMPLATES.has(slideTemplateOf(t))) h1 = null; }
    for (const u of starts.get(k) || []) {
      const l = over.get(k), heads = [];
      if (deckTitle) heads.push(`deck title: ${deckTitle.value}`);
      if (metaTitle) heads.push(`document title: ${metaTitle.value}`);
      if (credit) u.credit = credit;
      if (h1) heads.push(`# ${h1}`);
      if (h2) heads.push(`## ${h2}`);
      if (l != null && label(l)) heads.push(why.get(l) === "table-header" ? `table header: ${lines[l].trim()}` : orz.labels.has(l) ? `label: ${orz.labels.get(l)}` : null);
      const list = heads.filter(Boolean);
      if (list.length) u.headings = list;
    }
    const lvl = orz.headings.get(k);
    if (lvl === 1 || lvl === 2) {
      const text = label(k) && why.get(k) === "heading" ? t.replace(/^#{1,2}\s+/, "").replace(/\s+#+\s*$/, "").trim() : null;
      if (lvl === 1) { h1 = text; h2 = null; } else h2 = text;
    }
  }
}

/** The key of a credit line as printed (null: none) — the exact line, so any change of it is a change. */
export const creditKey = (credit) => (credit ? sha256(String(credit).trim()) : null);
/** The credit baseline of a package's log: { [deliverable]: creditKey|null }, or null — logged by the first agent
 *  session under round 6 (units_index.mjs beginSession; read by alignment.mjs). */
export function creditBaseline(log) {
  for (const r of log || []) if (r?.type === "revision" && r.payload?.event === "agent-session-begin" && r.payload.credits && typeof r.payload.credits === "object") return r.payload.credits;
  return null;
}
/** The hash of a unit's printed labels (null: none). */
export const headingsKey = (u) => (u?.headings?.length ? sha256(JSON.stringify(u.headings)) : null);
/** The label baseline of a package's log (records, oldest first): { [deliverable]: { [unit id]: headingsKey } }, or
 *  null — logged by the first agent session under round 5 (units_index.mjs beginSession; read by alignment.mjs). */
export function labelBaseline(log) {
  for (const r of log || []) if (r?.type === "revision" && r.payload?.event === "agent-session-begin" && r.payload.labels && typeof r.payload.labels === "object") return r.payload.labels;
  return null;
}

/** Non-blank lines that belong to no unit and no structure: must be empty (no prose is left out). */
export function uncoveredLines(text, seg) {
  return String(text || "").split("\n").map((l, k) => [k, l]).filter(([k, l]) => l.trim() && !seg.covered.has(k)).map(([k, l]) => ({ line: k + 1, text: l }));
}

// ---- the judgment-kind classifier -------------------------------------------------------------------------------
const MECH = [/\$\$/, /\\ce\{[^}]*(<=>|->|=)/, /\\frac|\\sum|\\ln|\\log|\\sqrt|\^\{/, /\d\s*[×x*\/+−-]\s*\d/, /=\s*[−-]?\d/, /^\{\{(chart|smiles|structure)/m];
// A value is whatever the ONE value parser reads as one (core/values.mjs, over the harness's unit table: mmHg, kcal,
// °F, V …; denominators; scientific notation; K, pH and powers of ten) — red-team round 1, CONFIDENCE F2: this list
// was narrower than lib/units.mjs, so "700 mmHg" or "52 kcal" made a sentence no fact at all.
const SEMI = [
  /\b(1[0-9]{3}|20[0-9]{2})\b/,
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/,
  /\b(most|least|highest|lowest|largest|smallest|first|fastest|strongest|only)\b/i,
  // an attribution: a classifier verb, or a lone surname after "by" ("developed by Ostwald", round 1 F2)
  /\b(discovered|proposed|formulated|named after|according to|introduced by|showed that|first described|developed|invented|devised|credited|coined|patented|synthesi[sz]ed)\b/i,
  /\b(?:by|after)\s+[A-Z][a-z]{2,}(?![\w'’])/,
  /"[^"]{20,}"|“[^”]{20,}”/,
  /(?:^|[^.!?]\s)[A-Z][a-z]+(?:\s+(?:and|&|van|von|de|'t)\s+[A-Z][a-z]+|\s+[A-Z][a-z]+)/,
];
/** Assign judgment kinds deterministically, erring toward inclusion (D19-E). */
export function classifyUnit({ form, text }) {
  const kinds = new Set();
  const t = String(text || "");
  if (form === "equation" || MECH.some((r) => r.test(t)) || (form === "answer" && /\d/.test(t))) kinds.add("mechanical");
  // values are mostly written in LaTeX: test the patterns on the folded form too (round P7-1, B19)
  // a name the claim extractor would require is a fact to check: the name trigger is the extractor's own reader
  // (red-team round 3, R3-K01: "the work of Arrhenius" named someone with no classifier verb, and owed nothing),
  // less a name used only as an eponymous term ("the Gibbs energy"), which asserts nothing about the person
  // ONE READER DECIDES (red-team round 6, cause A; R6-K06): a value is what the claim extractor requires (statesValue is
  // values.readValues, the extractor's own quantitiesIn), and the year, month, superlative and attribution triggers are
  // also tried on the extractor's view (valueProse) and on the cleaned text it reads names from — a sentence the
  // extractor finds a required token in is never "knowledge-based" only
  const views = [t, clean(t), plainForQuantities(t), valueProse(t)];
  if (statesValue(t) || SEMI.some((r) => views.some((v) => r.test(v))) || factNamesIn(t).length) kinds.add("semi-mechanical");
  const proseWords = (t.replace(/\$[^$]*\$/g, " ").match(/[A-Za-z]{3,}/g) || []).length;
  if (proseWords >= 6 || form === "question" || form === "answer" || (!kinds.size)) kinds.add("knowledge-based");
  return ["mechanical", "semi-mechanical", "knowledge-based"].filter((k) => kinds.has(k));
}
