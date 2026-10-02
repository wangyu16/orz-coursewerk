// Unit segmentation and the judgment-kind classifier (redesign P4; F1, D18, D19-E). Deterministic: the harness, not
// the agent, decides what a unit is, so no prose can be left out of the model.
//
// A unit is the smallest piece that can be checked on its own: a paragraph, a list item (on slides: a whole bullet
// group), a table row, an equation block, a callout, a figure (image, Mermaid, chart, structure), a question and each
// worked answer. Headings, the deck header, slide markers and the deliverable's restated "Learning objectives" are
// structure. Title, outline, section and closing slides, and summary-like sections, are framing.
import { sha256 } from "../records/canonical.mjs";
import { plainForQuantities } from "./dependencies.mjs";

export const DELIVERABLE_DIRS = Object.freeze(["study-guide", "slides", "practice"]);
const FRAMING_SECTION = /^(summary|overview|introduction|what we will cover|key takeaways|looking ahead|recap|outline)\b/i;
const FRAMING_TEMPLATES = new Set(["title", "outline", "section", "closing"]);

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
  let section = "top", sectionTitle = "", slideNo = 0, slideTemplate = null, skipSection = false;
  const struct = (i) => covered.add(i);
  const roleFor = () => (isSlides && FRAMING_TEMPLATES.has(slideTemplate)) || FRAMING_SECTION.test(sectionTitle) ? "framing" : "teaching";
  const push = (form, a, b, role = roleFor(), label = null) => {
    const body = lines.slice(a, b + 1).join("\n").trim();
    for (let k = a; k <= b; k++) covered.add(k);
    if (!body || skipSection) return;
    units.push({ form, role, section, text: body, startLine: a + 1, endLine: b + 1, ...(label ? { label } : {}) });
  };
  let i = 0;
  while (i < lines.length) {
    const l = lines[i], t = l.trim();
    if (!t) { i++; continue; }
    // HTML comments: deck header, slide markers, notes
    if (t.startsWith("<!--")) {
      const m = /<!--\s*slide\b([^>]*)-->/.exec(t);
      if (m) { slideNo++; slideTemplate = /template=([a-z-]+)/.exec(m[1])?.[1] || null; section = `slide-${slideNo}`; sectionTitle = ""; skipSection = false; }
      let j = i; while (j < lines.length && !lines[j].includes("-->")) j++;
      for (let k = i; k <= j; k++) struct(k);
      i = j + 1; continue;
    }
    // horizontal rules and the credit line are structure: attribution is the rights module's, not a teaching unit
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(t)) { struct(i); i++; continue; }
    if (/^\*?(?:Adapted from|Source:|Attribution:|Licensed under)\b/i.test(t)) {
      let j = i; while (j + 1 < lines.length && lines[j + 1].trim()) j++;
      for (let k = i; k <= j; k++) struct(k);
      i = j + 1; continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      struct(i);
      if (h[1].length <= 2) {
        sectionTitle = h[2].trim();
        skipSection = /^learning objectives$/i.test(sectionTitle);
        section = isSlides ? `slide-${slideNo}-${slugify(sectionTitle)}` : slugify(sectionTitle);
      }
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
    // tables: header and separator are structure; each data row is a unit
    if (t.startsWith("|")) {
      let j = i; while (j < lines.length && lines[j].trim().startsWith("|")) j++;
      struct(i); if (i + 1 < j && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim())) struct(i + 1);
      for (let k = i + 2; k < j; k++) push("table-row", k, k);
      if (j === i + 1) push("table-row", i, i);
      i = j; continue;
    }
    // lists: on slides a whole contiguous list is one bullet group; elsewhere each item (with continuations)
    if (/^(?:[-*+]|\d+[.)])\s+/.test(t)) {
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
const SEMI = [
  /\b\d+(?:[.,]\d+)?\s*(?:°C|K\b|kJ|J\b|mol|M\b|atm|bar|Pa|kPa|g\b|kg|mg|L\b|mL|%|nm|cm|m\b|s\b|min|h\b)/,
  /\b(1[0-9]{3}|20[0-9]{2})\b/,
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/,
  /\b(most|least|highest|lowest|largest|smallest|first|fastest|strongest|only)\b/i,
  /\b(discovered|proposed|formulated|named after|according to|introduced by|showed that|first described)\b/i,
  /"[^"]{20,}"|“[^”]{20,}”/,
  /\b\d+(?:\.\d+)?\s*(?:percent|per cent)\b/i,
  /(?:^|[^.!?]\s)[A-Z][a-z]+(?:\s+(?:and|&|van|von|de|'t)\s+[A-Z][a-z]+|\s+[A-Z][a-z]+)/,
];
/** Assign judgment kinds deterministically, erring toward inclusion (D19-E). */
export function classifyUnit({ form, text }) {
  const kinds = new Set();
  const t = String(text || "");
  if (form === "equation" || MECH.some((r) => r.test(t)) || (form === "answer" && /\d/.test(t))) kinds.add("mechanical");
  // values are mostly written in LaTeX: test the patterns on the folded form too (round P7-1, B19)
  if (SEMI.some((r) => r.test(t) || r.test(plainForQuantities(t)))) kinds.add("semi-mechanical");
  const proseWords = (t.replace(/\$[^$]*\$/g, " ").match(/[A-Za-z]{3,}/g) || []).length;
  if (proseWords >= 6 || form === "question" || form === "answer" || (!kinds.size)) kinds.add("knowledge-based");
  return ["mechanical", "semi-mechanical", "knowledge-based"].filter((k) => kinds.has(k));
}
