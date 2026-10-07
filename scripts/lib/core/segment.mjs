// Unit segmentation and the judgment-kind classifier (redesign P4; F1, D18, D19-E). Deterministic: the harness, not
// the agent, decides what a unit is, so no prose can be left out of the model.
//
// A unit is the smallest piece that can be checked on its own: a paragraph, a list item (on slides: a whole bullet
// group), a table row, an equation block, a callout, a figure (image, Mermaid, chart, structure), a question and each
// worked answer. Title, outline, section and closing slides, and summary-like sections, are framing.
//
// STRUCTURE IS ONLY WHAT THE FRAME DOES NOT PRINT (red team round 2, CONTROL C3-01/02/03/05). A line is structure only
// when no reader of the rendered deliverable sees it as content:
//   - a comment (deck header, slide marker, note) — but text after its "-->" on the same line prints, and is a unit;
//   - a `#`/`##` heading that is a label (it names the section; a heading that reads as sentences is also a unit);
//     `###`–`######` headings print as text and name nothing: each is a unit (form "heading");
//   - a table's header row and separator when the table has data rows and the header cells are labels; a header-only
//     table, or a header that reads as sentences, is a unit;
//   - the credit line, only as a short single attribution line (every sentence of it a credit); a paragraph that opens
//     "Adapted from …" and carries more is a unit;
//   - an orz-paged settings or metadata block ({{nyml kind: document | meta}}); every other {{nyml}} block — abstract,
//     question-open, exam-title … — is an element the frame prints, and is a unit;
//   - the list items of the deliverable's restated "Learning objectives" (read in full by the restated-objective check).
import { sha256 } from "../records/canonical.mjs";
import { plainForQuantities } from "./dependencies.mjs";
import { statesValue } from "./values.mjs";

export const DELIVERABLE_DIRS = Object.freeze(["study-guide", "slides", "practice"]);
const FRAMING_SECTION = /^(summary|overview|introduction|what we will cover|key takeaways|looking ahead|recap|outline)\b/i;
const FRAMING_TEMPLATES = new Set(["title", "outline", "section", "closing"]);

export const LIST_ITEM = /^(?:[-*+]|\d+[.)])\s+/;
/** orz-paged {{nyml}} kinds that print nothing: the document settings and the head metadata. Every other kind (the
 *  curated elements — abstract, question-open, exam-title …; or a kind the harness does not know) is content. */
export const NYML_NOTATION_KINDS = Object.freeze(["document", "meta"]);
/** A label, not prose: a few words and no sentence boundary inside (a section title, a column heading). */
export const isLabel = (t) => { const s = String(t).replace(/[*_`]/g, "").trim(); return (s.match(/\S+/g) || []).length <= 12 && !/[.!?;]\s+\S/.test(s); };
const CREDIT_SENTENCE = /^\*?(?:Adapted (?:from|and reorganized|with)\b|Sources?:|Attribution:|Licen[cs]ed under\b)/i;
/** A short single attribution line: one line, and every sentence of it a credit (round 2, C3-01). */
export const isCreditLine = (t) => {
  const s = String(t).trim();
  if (s.length > 450 || !CREDIT_SENTENCE.test(s)) return false;
  return s.replace(/^\*+|\*+$/g, "").split(/(?<=[.!?])\s+(?=[A-Z])/).every((x) => CREDIT_SENTENCE.test(x.trim()));
};
const nymlKind = (lines) => { for (const l of lines) { const m = /^\s*kind\s*:\s*(.*?)\s*$/.exec(l.replace(/^\{\{nyml\b/, "")); if (m) return m[1].replace(/^["']|["']$/g, "").toLowerCase(); } return ""; };
/**
 * The restated "Learning objectives" lists of a deliverable (redteam r1 C3-06, C4-12). A "Learning objectives" heading
 * of any level opens a section that runs to the next heading of its level or higher (a `#` heading counts as `##`), a
 * slide marker or a rule. Only the section's LIST ITEMS are restated objectives: structure, which the restated-
 * objective check reads in full. Any other prose in the section is content, segmented into units like any other.
 * Returns [{ line, items: [{ line, text }], listLines: Set }] (0-based line indices).
 */
export function learningObjectiveSections(text) {
  const lines = String(text || "").split("\n"), out = [];
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
        if (lt && /^\s{2,}/.test(lines[k]) && sec.items.length) { sec.items[sec.items.length - 1].text += ` ${lt}`; sec.listLines.add(k); k++; continue; }
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
export function segmentDeliverable(text, deliverable) {
  const lines = String(text || "").split("\n");
  const units = [], covered = new Set();
  const isSlides = deliverable.startsWith("slides/");
  let section = "top", sectionTitle = "", slideNo = 0, slideTemplate = null;
  const restated = new Set(learningObjectiveSections(text).flatMap((s) => [...s.listLines])); // read by the restated-objective check
  const struct = (i) => covered.add(i);
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
    // {{nyml … }}: the orz-paged settings and metadata blocks are notation (D42); every other kind is an element the
    // frame prints (an abstract, a question …), so it is a unit — a question element is a question (round 2, C3-05)
    if (/^\{\{nyml\b/.test(t)) {
      let j = i; while (j < lines.length && !/\}\}\s*$/.test(lines[j].trim())) j++;
      const end = Math.min(j, lines.length - 1), kind = nymlKind(lines.slice(i, end + 1));
      if (j >= lines.length || NYML_NOTATION_KINDS.includes(kind) || !kind) { for (let k = i; k <= end; k++) struct(k); }
      else push(/^question-/.test(kind) ? "question" : "element", i, end, roleFor(), kind);
      i = end + 1; continue;
    }
    // HTML comments: deck header, slide markers, notes. What follows the comment's "-->" on its last line is not a
    // comment: the renderer prints it, so it is a unit (round 2, C3-02)
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
    if (isCreditLine(t) && !(i + 1 < lines.length && lines[i + 1].trim() && !/^(#{1,6}\s|<!--|\$\$|\{\{|:::|\||!\[|(?:[-*+]|\d+[.)])\s)/.test(lines[i + 1].trim()))) { struct(i); i++; continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      if (h[1].length <= 2) {
        sectionTitle = h[2].trim();
        section = isSlides ? `slide-${slideNo}-${slugify(sectionTitle)}` : slugify(sectionTitle);
      }
      // a heading prints: a `#`/`##` label names its section and is structure; a `###`+ heading, or a section heading
      // that reads as sentences, is read like any other text (round 2, C3-03)
      if (h[1].length <= 2 && isLabel(h[2])) struct(i); else push("heading", i, i);
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
          struct(j);
          let k = j + 1; while (k < lines.length && !/^:::\s*$/.test(lines[k].trim())) k++;
          const label = tab[1].trim();
          const form = /^(answer|solution|worked answer)\b/i.test(label) ? "answer" : /^(q\b|q\s*\d|question|worked example|example|exercise|problem)/i.test(label) ? "question" : "callout";
          if (k > j + 1) push(form, j + 1, k - 1, roleFor(), label); else struct(j + 1); // the tab's label ("Q 5", "Answer 5") is how the material refers to it
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
      struct(i);
      let j = i + 1; while (j < lines.length && !/^:::\s*$/.test(lines[j].trim())) j++;
      if (j > i + 1) push("callout", i + 1, j - 1);
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
      if (sep && j > i + 2 && cells.every(isLabel)) struct(i); else push("table-row", i, i);
      for (let k = sep ? i + 2 : i + 1; k < j; k++) push("table-row", k, k);
      i = j; continue;
    }
    // lists: on slides a whole contiguous list is one bullet group; elsewhere each item (with continuations)
    if (/^(?:[-*+]|\d+[.)])\s+/.test(t)) {
      if (restated.has(i)) { while (restated.has(i)) struct(i++); continue; }
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
  return { units, covered, lineCount: lines.length };
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
  if (statesValue(t) || SEMI.some((r) => r.test(t) || r.test(plainForQuantities(t)))) kinds.add("semi-mechanical");
  const proseWords = (t.replace(/\$[^$]*\$/g, " ").match(/[A-Za-z]{3,}/g) || []).length;
  if (proseWords >= 6 || form === "question" || form === "answer" || (!kinds.size)) kinds.add("knowledge-based");
  return ["mechanical", "semi-mechanical", "knowledge-based"].filter((k) => kinds.has(k));
}
