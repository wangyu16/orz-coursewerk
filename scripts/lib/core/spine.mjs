// Spine v2 (redesign P3; F3, D14, D16). The spine is the course concept map plus, per chapter, a concept map and an
// assessment guide. Every objective, concept, misconception and question-guide entry carries a stable anchor, so ids
// never depend on position: `<kind>.<scope>.<anchor>` (scope = a chapter slug, or `course`).
//
// Grammar (tolerant to prose; strict about what becomes a node):
//   concepts/<slug>.md      ## Objectives / ## Concept sequence / ## Misconceptions to surface — list items ending in
//                           [prereq: <id>, …] (concepts only, optional) and [anchor: <slug>]; ## Key terms — the
//                           legacy term grammar, whose parent bracket names a node id, plus an optional
//                           [alias: <other name>, …] (a unit using an alias depends on the term); ## Prerequisites — free list.
//   concepts/course.md      ## Concept sequence (anchored, as above), ## Chapter sequence (`1. **<slug>** — title`),
//                           optional ## Objectives (anchored).
//   assessment-support/<slug>.md
//                           ## <title> [objective: <objective anchor>]   **Cognitive level:** <level>
//                           ### <title> [anchor: <slug>]   then bullets  - **Type:** …  - **Count:** n
//                                                          - **Level:** … (optional)  - **Targets:** <misconception id> (optional)
//
// This module parses and checks; it never writes. Minting missing anchors is a separate, explicit tool (spine.mjs CLI).
import { canonicalJson, sha256 } from "../records/canonical.mjs";

export const LEVELS = Object.freeze(["remember", "understand", "apply", "analyse", "analyze", "evaluate", "create"]);
const CHAPTER_SECTIONS = { objectives: "objective", "concept sequence": "concept", "misconceptions to surface": "misconception" };
const COURSE_SECTIONS = { objectives: "objective", "concept sequence": "concept" };
const ANCHOR = /^[a-z0-9][a-z0-9-]*$/;

export const spinePaths = (chapter) => ({ map: `concepts/${chapter}.md`, guide: `assessment-support/${chapter}.md` });
export const COURSE_MAP = "concepts/course.md";

function sections(text) {
  const out = [];
  let cur = null;
  for (const line of String(text || "").split(/\r?\n/)) {
    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    if (h && h[1] === "##") { cur = { title: h[2].trim(), lines: [], subs: [] }; out.push(cur); continue; }
    if (cur) cur.lines.push(line);
  }
  return out;
}

/** Split trailing bracket groups off a list item: "text [prereq: a, b] [anchor: x]" → { text, anchor, prereqs, parent }. */
export function itemParts(raw) {
  let text = raw.trim(); const parts = { anchor: null, prereqs: [], parent: null, aliases: [] };
  for (;;) {
    const m = /\s*\[([^\]]+)\]\s*$/.exec(text);
    if (!m) break;
    const body = m[1].trim();
    if (/^anchor:/i.test(body)) parts.anchor = body.slice(7).trim();
    else if (/^alias(?:es)?:/i.test(body)) parts.aliases.push(...body.replace(/^alias(?:es)?:/i, "").split(",").map((s) => s.trim()).filter(Boolean));
    else if (/^prereq:/i.test(body)) parts.prereqs.push(...body.slice(7).split(",").map((s) => s.trim()).filter(Boolean));
    else if (/^[a-z]+\.[a-z0-9-]+\.[a-z0-9-]+$/i.test(body)) parts.parent = body;
    else break;
    text = text.slice(0, m.index).trimEnd();
  }
  return { text, ...parts };
}

function listItems(lines) {
  const items = [];
  for (const line of lines) {
    const m = /^\s*(?:\d+[.)]|[-*+])\s+(.*)$/.exec(line);
    if (m) items.push(m[1]);
  }
  return items;
}

function parseMap(text, scope, kinds, file) {
  const nodes = [], terms = [], problems = [], present = new Set();
  let chapterSequence = null;
  for (const sec of sections(text)) {
    const key = sec.title.toLowerCase();
    present.add(key);
    if (kinds[key]) {
      for (const raw of listItems(sec.lines)) {
        const p = itemParts(raw);
        nodes.push({ kind: kinds[key], scope, anchor: p.anchor, id: p.anchor ? `${kinds[key]}.${scope}.${p.anchor}` : null, text: p.text, prereqs: p.prereqs, file });
      }
    } else if (key === "key terms") {
      for (const raw of listItems(sec.lines)) {
        const p = itemParts(raw);
        const label = /^\*\*(.+?)\*\*/.exec(p.text)?.[1] || p.text;
        // the house glossary form declares aliases in a parenthetical after the label — "**reaction quotient** (Qr)",
        // "(K, aliases: Keq, Kc)" — as terms.mjs reads it; a unit using one depends on the term (R2 coherence F12)
        const paren = /^\*\*.+?\*\*\s*\(([^)]*)\)/.exec(p.text)?.[1];
        const aliases = [...new Set([...p.aliases, ...(paren ? paren.split(",").map((a) => a.replace(/^\s*aliases?\s*:\s*/i, "").trim()).filter(Boolean) : [])])];
        terms.push({ label, parent: p.parent, text: p.text, ...(aliases.length ? { aliases } : {}), file });
      }
    } else if (key === "chapter sequence") {
      chapterSequence = listItems(sec.lines).map((raw) => /^\*\*([a-z0-9-]+)\*\*/.exec(raw.trim())?.[1] || null);
    }
  }
  return { nodes, terms, problems, present, chapterSequence };
}
/** The key terms of a concept map's text (e.g. the text an approval recorded). */
export const termsOfMap = (text, scope, file = null) => parseMap(text, scope, CHAPTER_SECTIONS, file).terms;

function parseGuide(text, chapter, file) {
  const objectives = [], entries = [], problems = [];
  let obj = null, entry = null, sub = null, n = 0;
  for (const line of String(text || "").split(/\r?\n/)) {
    n++;
    const h2 = /^##\s+(.*)$/.exec(line), h3 = /^###\s+(.*)$/.exec(line), h4 = /^#{4,6}\s+(.*)$/.exec(line);
    if (h2) {
      const m = /\[objective:\s*([^\]]+)\]\s*$/.exec(h2[1]);
      obj = m ? { anchor: m[1].trim(), title: h2[1].slice(0, m.index).trim(), level: null, file } : null;
      if (obj) objectives.push(obj);
      entry = null; sub = null; continue;
    }
    if (h3 && obj) {
      const p = itemParts(h3[1]);
      entry = { chapter, objective: obj.anchor, anchor: p.anchor, id: p.anchor ? `guide.${chapter}.${p.anchor}` : null, title: p.text, type: null, count: null, levels: null, targets: null, file };
      entries.push(entry); sub = null; continue;
    }
    // what the grammar does not read must not look like an entry (redteam r1 C5-11): an anchored heading outside an
    // objective section, or a field under no entry (an untagged section, a #### sub-entry) would be silently dropped
    // or overwrite its parent's Count, so each is a problem for `spine check` (and approval waits on it)
    if (h3 || h4) {
      if (/\[anchor:/i.test(line)) problems.push({ line: n, detail: `"${line.trim().slice(0, 80)}" is anchored but is not an entry the guide grammar reads (an entry is a ### heading under a ## … [objective: …] section)` });
      sub = h4 ? line.trim() : null; entry = null;
      continue;
    }
    const lvl = /^\*\*Cognitive level:\*\*\s*(.+?)\.?\s*$/i.exec(line.trim());
    if (lvl && obj && !entry && !sub) { obj.level = lvl[1].trim(); continue; }
    const f = /^\s*[-*]\s+\*\*(Type|Count|Level|Targets):\*\*\s*(.+?)\s*$/i.exec(line);
    if (f && !entry) problems.push({ line: n, detail: `the field "${line.trim().slice(0, 60)}" belongs to no entry${sub ? ` (it is under the sub-heading "${sub.slice(0, 50)}": a sub-entry is not an entry; make it its own ### … [anchor: …] entry)` : obj ? "" : " (it is outside every ## … [objective: …] section)"}; the guide grammar does not read it` });
    if (f && entry) {
      const k = f[1].toLowerCase(), v = f[2].replace(/\.$/, "").trim();
      if (k === "type") entry.type = v;
      else if (k === "count") entry.count = /^\d+$/.test(v) ? Number(v) : v;
      else if (k === "level") entry.levels = v;
      else entry.targets = v;
    }
  }
  for (const e of entries) if (e.levels == null) e.levels = objectives.find((o) => o.anchor === e.objective)?.level ?? null;
  return { objectives, entries, problems };
}

const levelList = (s) => String(s || "").toLowerCase().split(/\s*(?:,|\band\b|\/)\s*/).map((x) => x.trim()).filter(Boolean);

/** Parse the whole spine of a package from a snapshot-like reader ({ text(rel) }). */
export function parseSpine(reader, chapters) {
  const course = parseMap(reader.text(COURSE_MAP), "course", COURSE_SECTIONS, COURSE_MAP);
  const out = { course, chapters: {} };
  for (const ch of chapters) {
    const { map, guide } = spinePaths(ch);
    out.chapters[ch] = { map: parseMap(reader.text(map), ch, CHAPTER_SECTIONS, map), guide: parseGuide(reader.text(guide), ch, guide), hasMap: reader.text(map) != null, hasGuide: reader.text(guide) != null };
  }
  return out;
}

/** All node ids of the spine (for reference resolution). */
export function nodeIndex(spine) {
  const ids = new Map();
  for (const n of spine.course.nodes) if (n.id) ids.set(n.id, n);
  for (const ch of Object.values(spine.chapters)) {
    for (const n of ch.map.nodes) if (n.id) ids.set(n.id, n);
    for (const e of ch.guide.entries) if (e.id) ids.set(e.id, e);
  }
  return ids;
}

/**
 * Well-formedness (V1; skeleton core). Returns problems as { file, rule, detail, ids } — each one a re-runnable rule
 * breach, so the gate can raise them as defects routed to the agent.
 */
export function checkSpine(spine, manifestChapters) {
  const P = [];
  const add = (file, rule, detail, ids = []) => P.push({ file, rule, detail, ids });
  const ids = nodeIndex(spine);
  // course map
  if (spine.course.chapterSequence === null) add(COURSE_MAP, "course-sections", "the course map has no ## Chapter sequence");
  if (!spine.course.present.has("concept sequence")) add(COURSE_MAP, "course-sections", "the course map has no ## Concept sequence");
  if (spine.course.chapterSequence && canonicalJson(spine.course.chapterSequence) !== canonicalJson(manifestChapters))
    add(COURSE_MAP, "chapter-sequence", `the chapter sequence (${spine.course.chapterSequence.join(", ")}) does not match the manifest (${manifestChapters.join(", ")})`);
  const seen = new Map();
  const anchorCheck = (n, scopeFile) => {
    if (!n.anchor) { add(scopeFile, "anchor-missing", `${n.kind || "entry"} "${String(n.text || n.title).slice(0, 60)}" has no [anchor: …]`); return; }
    if (!ANCHOR.test(n.anchor)) add(scopeFile, "anchor-form", `anchor "${n.anchor}" must be a lowercase slug`);
    const id = n.id;
    if (seen.has(id)) add(scopeFile, "anchor-duplicate", `${id} is used twice`, [id]);
    seen.set(id, n);
  };
  for (const n of spine.course.nodes) anchorCheck(n, COURSE_MAP);
  for (const [ch, s] of Object.entries(spine.chapters)) {
    const { map, guide } = spinePaths(ch);
    if (!s.hasMap) { add(map, "chapter-map-missing", `chapter ${ch} has no concept map`); continue; }
    for (const sec of ["objectives", "concept sequence", "key terms", "misconceptions to surface"]) if (!s.map.present.has(sec)) add(map, "chapter-sections", `the concept map has no ## ${sec.replace(/\b\w/g, (c) => c.toUpperCase())}`);
    for (const n of s.map.nodes) anchorCheck(n, map);
    for (const t of s.map.terms) if (t.parent && !ids.has(t.parent)) add(map, "term-parent", `key term "${t.label}" names ${t.parent}, which does not exist`, [t.parent]);
    // assessment guide
    if (!s.hasGuide) { add(guide, "guide-missing", `chapter ${ch} has no assessment guide`); continue; }
    const objectives = s.map.nodes.filter((n) => n.kind === "objective" && n.anchor);
    const guided = new Set(s.guide.entries.map((e) => e.objective));
    for (const o of objectives) if (!guided.has(o.anchor)) add(guide, "objective-unguided", `${o.id} has no question-guide entry`, [o.id]);
    for (const go of s.guide.objectives) if (!objectives.some((o) => o.anchor === go.anchor)) add(guide, "guide-objective-unknown", `a guide section names objective "${go.anchor}", which the concept map does not declare`);
    for (const p of s.guide.problems || []) add(guide, "guide-outside-grammar", `line ${p.line}: ${p.detail}`);
    for (const e of s.guide.entries) {
      anchorCheck({ ...e, kind: "guide", text: e.title }, guide);
      if (!String(e.type || "").trim()) add(guide, "guide-entry-field", `${e.id || e.title}: **Type:** is missing`, e.id ? [e.id] : []);
      if (!(Number.isInteger(e.count) && e.count > 0)) add(guide, "guide-entry-field", `${e.id || e.title}: **Count:** must be a positive whole number`, e.id ? [e.id] : []);
      const lv = levelList(e.levels);
      if (!lv.length || lv.some((l) => !LEVELS.includes(l))) add(guide, "guide-entry-field", `${e.id || e.title}: cognitive level must be one of ${LEVELS.join(", ")} (got "${e.levels ?? ""}")`, e.id ? [e.id] : []);
      if (e.targets && !ids.has(e.targets)) add(guide, "guide-target", `${e.id || e.title}: targets ${e.targets}, which does not exist`, [e.targets]);
    }
  }
  // prerequisites resolve, and form no cycle
  const edges = [];
  for (const n of [...spine.course.nodes, ...Object.values(spine.chapters).flatMap((c) => c.map.nodes)]) {
    for (const p of n.prereqs || []) {
      if (!ids.has(p)) add(n.file, "prereq-unresolved", `${n.id || n.text.slice(0, 40)} names prerequisite ${p}, which does not exist`, [p]);
      else if (n.id) edges.push([n.id, p]);
    }
  }
  const adj = new Map(); for (const [a, b] of edges) adj.set(a, [...(adj.get(a) || []), b]);
  const state = new Map(), cycles = [];
  const visit = (v, stack) => { state.set(v, 1); for (const w of adj.get(v) || []) { if (state.get(w) === 1) cycles.push([...stack, v, w]); else if (!state.get(w)) visit(w, [...stack, v]); } state.set(v, 2); };
  for (const v of adj.keys()) if (!state.get(v)) visit(v, []);
  for (const c of cycles) add(ids.get(c[0])?.file || COURSE_MAP, "prereq-cycle", `prerequisite cycle: ${c.slice(c.indexOf(c[c.length - 1])).join(" → ")}`, c);
  return P;
}

/** The content a chapter approval covers, and the slice of the course map that bears on it (D14 scope). */
export function chapterCoverage(reader, spine, chapter) {
  const { map, guide } = spinePaths(chapter);
  const docs = { [map]: reader.text(map), [guide]: reader.text(guide) };
  const s = spine.chapters[chapter];
  const courseRefs = new Set((s?.map.nodes || []).flatMap((n) => n.prereqs).filter((p) => p.startsWith("concept.course.") || p.startsWith("objective.course.")));
  const slice = {
    position: (spine.course.chapterSequence || []).indexOf(chapter),
    courseNodes: spine.course.nodes.filter((n) => courseRefs.has(n.id)).map((n) => ({ id: n.id, text: n.text, prereqs: n.prereqs })),
  };
  return { covers: [map, guide], contentHash: sha256(canonicalJson(docs)), courseSliceHash: sha256(canonicalJson(slice)) };
}

export function courseCoverage(reader) {
  return { covers: [COURSE_MAP], contentHash: sha256(canonicalJson({ [COURSE_MAP]: reader.text(COURSE_MAP) })) };
}
