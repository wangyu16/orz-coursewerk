// THE SPINE SAYS WHAT TO TEACH, NOT THE CONTENT (D48, operator 2026-10-11). The concept maps and assessment guides say
// what to teach, to what level and how to assess. They are approved by the instructor byte for byte and reviewed blind
// at each re-approval (D39); they are NOT source-checked. Detail that belongs in the teaching is pointed out instead.
// WHAT IS DETAIL (D49, operator 2026-10-12, refining D48): numerical data (a value with a unit, worked numbers),
// explanations and derivations written into the spine, and attributions and history. NOT detail: an equation, general
// form or relation NAMED in an objective, concept, key-term gloss or assessment item (naming it says what to teach and to
// what level), and the summary sentences that describe what a chapter covers (a summary is read only for numerical data
// and attributions). Definitions and absolute claims are no longer detail kinds (they are what concept lines state).
// Each spine line that carries detail is a non-blocking digest question, and the agent suggests moving the detail to the study guide,
// naming the section that teaches the line's objective or concept. A value in the spine is ALSO read by the cross-
// deliverable value check (modules/ms7-consistency.mjs spineClaims), so one that disagrees with the deliverables is a
// value-disagreement like any other.
//
// The detectors are the harness's own readers (red-team round 6, cause A: one reader per question), never a private
// vocabulary: values are what the claim extractor requires (values.readValues), names and years what the claim
// extractor reads (names.mjs, claims.mjs). Calibrated on the C2 fixture and the red-team base
// (tests/redteam-r6-readers.test.mjs, tests/d49-decisions.test.mjs): ordinary objective, concept and assessment wording
// ("Define chemical equilibrium as …", "Ask whether …", "Q_r < K, Q_r > K and Q_r = K", "using ΔG° = −RT ln K") is
// not detail. What is never scanned: the provenance section (## Source and scope), the course's chapter list, headings, the
// guide's structural fields (Type, Count, Level, Targets, Cognitive level) and the credit line. A key term's gloss is
// the vocabulary authority the format requires (format-contracts/deliverables.md); any detail in it is still detail. A
// misconception is a false statement by design, so its false reasons are not "an explanation".
// PURE and DETERMINISTIC.
import { withoutHeader } from "./printed.mjs";
import { readValues } from "./values.mjs";
import { factNamesIn, namesIn } from "./names.mjs";
import { yearsIn, contentWords } from "../verify/claims.mjs";
import { itemParts, COURSE_MAP, spinePaths } from "./spine.mjs";
import { isCreditLine } from "./segment.mjs";

const SKIP_SECTIONS = /^(?:source and scope|chapter sequence|sources?|attribution|licen[cs]e)\b/i;
const FIELD = /^\s*(?:[-*+]\s+)?\*\*(?:type|count|level|targets?|cognitive level)\s*:?\s*\*\*/i;
const MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/;

/** The lines of a spine document a reader reads as content: [{ line (1-based), text, section, objective, entry, anchor,
 *  parent }] — list items with their continuation lines, and paragraphs. */
export function spineLines(text) {
  const out = [];
  let section = "", objective = null, entry = null, cur = null;
  const flush = () => { if (cur) out.push(cur); cur = null; };
  String(withoutHeader(text) || "").split(/\r?\n/).forEach((raw, k) => {
    const h = /^(#{1,6})\s+(.*)$/.exec(raw);
    if (h) {
      flush();
      if (h[1].length <= 2) { section = h[2].replace(/\s*\[[^\]]*\]\s*$/, "").trim(); objective = (h[2].match(/\[objective:\s*([^\]]+)\]/i) || [])[1]?.trim() ?? null; entry = null; }
      else entry = (h[2].match(/\[anchor:\s*([^\]]+)\]/i) || [])[1]?.trim() ?? null;
      return;
    }
    if (!raw.trim() || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) { flush(); return; }
    if (MARKER.test(raw) || FIELD.test(raw)) { flush(); cur = { line: k + 1, lines: [raw], section, objective, entry, item: MARKER.test(raw) }; return; }
    if (!cur) cur = { line: k + 1, lines: [], section, objective, entry, item: false };
    cur.lines.push(raw);
  });
  flush();
  return out.flatMap((b) => {
    const joined = b.lines.map((l, i) => (i ? l.trim() : l.replace(MARKER, "").trim())).join(" ");
    if (SKIP_SECTIONS.test(b.section) || FIELD.test(b.lines[0]) || isCreditLine(joined) || /^\*?Adapted\b/.test(joined)) return [];
    const p = b.item ? itemParts(joined) : { text: joined, anchor: null, parent: null };
    if (!/[A-Za-z]{3,}/.test(p.text)) return [];
    return [{ line: b.line, text: p.text, section: b.section, objective: b.objective, entry: b.entry, anchor: p.anchor, parent: p.parent }];
  });
}

// ---- the detectors ------------------------------------------------------------------------------------------------
const MATH = /\$\$([\s\S]+?)\$\$|\$([^$]+)\$/g;
// a WORKED side: an operator between terms or a function — a lone (signed) value is a value, read as one ("ΔH = −75.0 kJ"
// is a value with a unit, not an equation), and so is scientific notation ("6.0 × 10^{-2}")
const OPERATED_RAW = /[+×*/^·]|(?<=[\p{L}\p{N})}]\s*)[-−]|\\(?:frac|dfrac|ln|log|exp|sqrt|times|cdot|sum|int)(?![A-Za-z])|\bln\b|\blog\b/u;
const SCI_NOTATION = /(?:\\times|×|\\cdot|·)\s*10\s*\^?\s*\{?\s*[-−]?\s*\d+\s*\}?/g;
const OPERATED = { test: (x) => OPERATED_RAW.test(String(x).replace(SCI_NOTATION, " ").replace(/\^\s*\{?\s*[-−]?\s*1\s*\}?/g, " ")) };
// a relation between two sides, at least one of them worked (an operator, a function or a number): "ΔG° = −RT ln K" is
// a relation, "Q_r = K" (comparing two symbols, a case to set) is not. A reaction is not a relation here: naming one
// ("αA + βB ⇌ σS + τT", "N2 + 3H2 ⇌ 2NH3") says what to teach (D49). Each: { raw, sides } (sides = relation signs + 1).
const REACTION_ARROW = /\\ce\{|<=>|<->|<-|->|\\(?:rightleftharpoons|leftrightharpoons|rightarrow|longrightarrow|leftarrow|to)(?![A-Za-z])|[⇌⇄→⟶←]/;
function relationsIn(t) {
  const out = [];
  t = t.replace(/<=>|<->|<-|->/g, " ⇌ ");
  const sides = (s) => s.split(/\\(?:approx|equiv|simeq)(?![A-Za-z])|[=≈≡]/);
  for (const m of t.matchAll(MATH)) {
    const body = m[1] ?? m[2], parts = sides(body);
    if (REACTION_ARROW.test(body)) continue; // a reaction, named
    if (parts.length > 1 && parts.some((x) => OPERATED.test(x.replace(/\\(?:Delta|ominus|circ|mathrm|text)\b/g, "")))) out.push({ raw: m[0].trim(), sides: parts.length });
  }
  const prose = t.replace(MATH, " ¤ ");
  for (const m of prose.matchAll(/([^\s=≈,;:()]+(?:\s+[^\s=≈,;:()]+){0,2})\s*[=≈≡]\s*([^\s=≈,;:().]+(?:\s+(?!and\b|or\b|for\b|to\b)[^\s=≈,;:().]+){0,3})/g)) {
    if (/¤/.test(m[0])) continue;
    // the relation itself, without the prose that leads into it ("… using ΔG° = −RT ln K" → "ΔG° = −RT ln K")
    if ([m[1], m[2]].some((x) => OPERATED.test(x.replace(/[°']/g, "")))) out.push({ raw: `${m[1].replace(/^(?:\p{Ll}{2,}\s+)+/u, "")} ${m[0].slice(m[1].length).trim()}`.trim().replace(/[,;:.]+$/, ""), sides: 2 });
  }
  return out.map((x) => ({ ...x, raw: x.raw.replace(/[,;:.]+$/, "") }));
}
// WORKED NUMBERS: a relation with a number in it that is not an index — subscripts, exponents and a formula's atom counts
// ("H_2", "[NH_3]^2", "x^{-1}") are notation, "(0.20)^2 / (0.10) = 1.48" or "K = 2 × 3" is a worked calculation
const WORKED = (raw) => /\d/.test(String(raw).replace(/\\[A-Za-z]+/g, " ").replace(/[_^]\s*\{[^}]*\}|[_^]\s*[-−]?\d+/g, " ").replace(/(?<=[A-Za-z)\]])\d+/g, " "));
// a DERIVATION: a chain of relations (one side worked into the next, "a = b = c") or the prose that carries one
const DERIVATION = /\b(?:it\s+follows\s+that|follows\s+from|(?:can\s+be|is|are)\s+derived\s+(?:from|by)|derives?\s+from|substituting|rearranging|we\s+(?:obtain|get|find)\s+that)\b/i;
// a summary describes what the chapter or course covers (D49): read only for numerical data and attributions
const SUMMARY = /^(?:summary|overview|organi[sz]ing question|introduction|about this (?:chapter|unit|course))\b/i;
const ATTRIBUTION_VERB = /\b(?:discovered|proposed|formulated|named after|according to|introduced by|showed that|first described|invented|devised|credited|coined|patented|postulated|enunciated)\b/i;
const EXPLANATION = /\b(?:because|due\s+to|owing\s+to|as\s+a\s+result\s+of|which\s+is\s+why|this\s+is\s+why|the\s+reason\s+(?:is|that|why))\b/i;
// guide wording about the assessment itself (what to ask, what an answer earns): its "because" and "only" describe the
// answer sought, not content the guide teaches
const ASSESSMENT_FRAME = /\b(?:ask|asks|asked|require|requires|credit|rubric|answer|answers|student|students|item|items|probe|parameteri[sz]e|targets?|misconceptions?|present|give|prompt|question|questions|award|exam|assessment|objective|objectives)\b/i;

/** The detail a spine line carries beyond what to teach, to what level and how to assess (D49): [{ kind, what }], kind
 *  one of "a value", "worked numbers", "an explanation", "a derivation", "an attribution". `termNames` are the package's
 *  key-term labels and aliases (a name inside one is an eponymous term, not an attribution). */
export function spineDetail(l, { termNames = [], guide = false } = {}) {
  const t = l.text, out = [];
  const add = (kind, what) => { if (!out.some((x) => x.kind === kind && x.what === what)) out.push({ kind, what }); };
  const misconception = /^misconceptions?\b/i.test(l.section), summary = SUMMARY.test(l.section || "");
  // numerical data: a value the claim reader requires, and a relation worked with numbers
  for (const q of readValues(t)) add("a value", q.raw);
  const relations = relationsIn(t);
  for (const r of relations) if (WORKED(r.raw)) add("worked numbers", r.raw);
  // attributions and history
  const fold = (x) => String(x).toLowerCase().replace(/[\u2010-\u2015−]/g, "-").replace(/[^\p{L}\p{N}-]+/gu, " ").trim();
  const lowerTerms = termNames.map(fold);
  const names = factNamesIn(t).filter((n) => !lowerTerms.some((x) => x.includes(fold(n))));
  for (const n of names) add("an attribution", n);
  for (const y of yearsIn(t)) add("an attribution", y);
  if (ATTRIBUTION_VERB.test(t) && namesIn(t).length) add("an attribution", t.match(ATTRIBUTION_VERB)[0]);
  if (summary) return out;
  // explanations and derivations written into the spine — a misconception's false reasons and the guide's wording about
  // the answer sought ("A correct answer says yes, because …") are neither
  const framed = guide && ASSESSMENT_FRAME.test(t);
  if (!misconception && !framed && EXPLANATION.test(t)) add("an explanation", t.match(EXPLANATION)[0]);
  if (!misconception) {
    for (const r of relations) if (r.sides > 2 && !WORKED(r.raw)) add("a derivation", r.raw);
    if (!framed && DERIVATION.test(t)) add("a derivation", t.match(DERIVATION)[0]);
  }
  return out;
}

// ---- where the detail belongs: the study-guide section that teaches the line ------------------------------------------
const sectionTitle = (u) => (u.headings || []).find((h) => /^## /.test(h))?.slice(3) || (u.headings || []).find((h) => /^# /.test(h))?.slice(2) || u.locator?.section || "";
function targetOf(l, { scope, units, detail = [] }) {
  const sg = (units || []).filter((u) => /^study-guide\//.test(u.locator?.deliverable || "") && (scope === "course" || u.locator.deliverable === `study-guide/${scope}.md`));
  const node = l.parent || (l.objective ? `objective.${scope}.${l.objective}`
    : l.anchor ? `${/^objectives\b/i.test(l.section) ? "objective" : /^misconceptions?\b/i.test(l.section) ? "misconception" : "concept"}.${scope}.${l.anchor}` : null);
  let pool = node ? sg.filter((u) => (u.spineNodes || []).includes(node)) : [];
  let how = node && pool.length ? `teaches ${node}` : null;
  if (!pool.length) {
    // no linked section: the section whose words overlap most with the SENTENCE that carries the detail (deterministic;
    // ties to the earliest) — a summary paragraph names many things, and only that sentence says where this one goes
    // (the clause holding it first, then its sentence)
    const first = (detail[0]?.what || "").slice(0, 12);
    const sentence = String(l.text).split(/(?<=[.;!?])\s+/).find((x) => first && x.includes(first)) || l.text;
    const clause = sentence.split(/[,;:—]\s+/).find((x) => first && x.includes(first)) || sentence;
    // the detail's own symbols count too ("RT", "ln" of "ΔG° = −RT ln K", as the study guide's TeX writes them)
    const symbols = [...new Set(detail.flatMap((d) => String(d.what).match(/[A-Za-z]{2,3}(?![A-Za-z])|[A-Z][A-Za-z]*/g) || []))].filter((x) => /[A-Z]/.test(x) || x.length <= 3);
    for (const scope of [clause, sentence]) {
      const w = new Set(contentWords(scope));
      const scored = sg.map((u) => ({ u, n: contentWords(u.text).filter((x) => w.has(x)).length + symbols.filter((x) => new RegExp(`(?<![A-Za-z])${x}(?![A-Za-z])`).test(u.text)).length })).filter((x) => x.n > 0);
      const best = Math.max(0, ...scored.map((x) => x.n));
      pool = scored.filter((x) => x.n === best).map((x) => x.u);
      if (pool.length) break;
    }
    how = pool.length ? "closest in wording" : null;
  }
  if (!pool.length) return { deliverable: scope === "course" ? "study-guide/" : `study-guide/${scope}.md`, section: null, how: "no section teaches it yet", node };
  const count = new Map();
  for (const u of pool) { const k = `${u.locator.deliverable}\u0000${sectionTitle(u)}`; count.set(k, (count.get(k) || { n: 0, at: u.locator.ordinal ?? 0 })); count.get(k).n++; }
  const [key] = [...count.entries()].sort((a, b) => b[1].n - a[1].n || a[1].at - b[1].at)[0];
  const [deliverable, section] = key.split("\u0000");
  return { deliverable, section: section || null, how, node };
}

/** Every spine line carrying detail: [{ file, line, text, detail: [{kind, what}], target: { deliverable, section, how,
 *  node } }]. `units` are the package's units (loadUnits), for the target section. */
export function spineDetailLines(reader, chapters, { units = [] } = {}) {
  const files = [{ file: COURSE_MAP, scope: "course", guide: false }, ...chapters.flatMap((c) => [{ file: spinePaths(c).map, scope: c, guide: false }, { file: spinePaths(c).guide, scope: c, guide: true }])];
  const termNames = [];
  for (const f of files.filter((x) => !x.guide)) for (const l of spineLines(reader.text(f.file))) if (/^key terms\b/i.test(l.section)) {
    const m = l.text.match(/^\*\*([^*]+)\*\*\s*(?:\(([^)]*)\))?/);
    if (m) termNames.push(m[1], ...(m[2] || "").replace(/aliases?:/gi, "").split(",").map((x) => x.trim()).filter(Boolean));
  }
  // the package's own titles (the course, its chapters, the spine's headings) are names of the course, not attributions
  // (GenChem re-evaluation 2026-10-31: "Atoms, Molecules, and Ions" and "Course Concept Map" were asked about as history)
  let manifest = null; try { manifest = JSON.parse(reader.text("alembic.json") || "null"); } catch { manifest = null; }
  termNames.push(...[manifest?.title, ...(manifest?.chapters || manifest?.units || []).map((c) => c?.title)].filter(Boolean));
  for (const f of files) for (const h of String(reader.text(f.file) || "").matchAll(/^#{1,6}\s+(.+)$/gm)) termNames.push(h[1]);
  const out = [];
  for (const f of files) {
    const text = reader.text(f.file);
    if (text == null) continue;
    for (const l of spineLines(text)) {
      const detail = spineDetail(l, { termNames, guide: f.guide });
      if (detail.length) out.push({ file: f.file, line: l.line, text: l.text, detail, target: targetOf(l, { scope: f.scope, units, detail }) });
    }
  }
  return out;
}

/** The instructor's question for one line (D48): what the detail is, and where the agent suggests it goes. */
export function spineDetailNote(d) {
  const kinds = [...new Set(d.detail.map((x) => x.kind))];
  const list = kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} and ${kinds.at(-1)}` : kinds[0];
  const what = d.detail.map((x) => `"${x.what}"`).slice(0, 4).join(", ");
  const where = d.target.section ? `${d.target.deliverable}, section "${d.target.section}"` : d.target.deliverable;
  return `${d.file}, line ${d.line} carries ${list} (${what}) — more than what to teach, to what level and how to assess. `
    + `Suggested: remove it from the spine and place it in the study guide at ${where} (${d.target.how}); the spine line keeps only what to teach. `
    + "The spine is not source-checked (D48), so detail left here is checked only against the other deliverables' values.";
}
