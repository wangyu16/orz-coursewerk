// Relink after a plan conversion (req.units.relink-converted; General Chemistry, 2026-11-04). A course written under a
// plan older than v0.12 (Coursewerk 0.11) carries the old objective ids in its materials ("{{sp[info] Objective 5.1a}}"),
// while its standardized plan names objectives by anchor (objective.gases.convert-pressure-units). Its units are then
// unlinked. This maps a chapter's old ids onto the converted plan's objectives — only where they correspond one to one in
// order — and builds the links from the markers the materials already carry. It never edits a material's text; the
// links go through linkUnits (the same path as `units.mjs link`), and the mapping is logged.
//
// A chapter is mapped only when:
//   - its study guide carries old ids, and the plan has exactly as many objectives as there are old ids;
//   - the texts do not point another way: for no two objectives would swapping their partners raise the word overlap of
//     the old texts with the new by more than SWAP_GAIN (a reordered or rewritten plan is refused, and says which pair).
// Otherwise it is refused, with the reason, and nothing of it is linked.
//
// The links (no judgment; each is reviewed later by the link review, which a relink makes owed):
//   - study guide: a teaching unit links to the objectives its `## ` section lists by old id; a section listing none links
//     to every objective of the chapter (an overview or synthesis), unless it is numbered ("## 5.2 …": then it is left
//     unlinked, with the reason); a section about assets and licences is not teaching and is left unlinked;
//   - slides: a teaching unit links to the objectives of its numbered part ("# 2. …" → the old ids N.2x); an unnumbered
//     part links to every objective;
//   - practice: a question links to ONE assessment-guide entry of the objective its marker names (an entry of the same
//     kind of question first, each entry once), else to the objective; an answer links to what its question links to.
// A unit that already links to nodes of the current plan is kept as it is.
import { appendLogRecord } from "../records/log.mjs";
import { manifestChapters } from "./package_reader.mjs";
import { parseSpine, nodeIndex } from "./spine.mjs";
import { chapterFile } from "./segment.mjs";
import { linkUnits, loadUnits } from "./obligations.mjs";

export const OLD_ID = /\bObjective\s+(\d+(?:\.\d+)+[a-z]?)\b/g;
export const SWAP_GAIN = 0.3;
const STOP = new Set("with from that this their between using given each which into what when they them have more than also such about".split(" "));
const words = (s) => new Set((String(s || "").toLowerCase().match(/[a-z]{3,}/g) || []).filter((w) => !STOP.has(w)).map((w) => w.slice(0, 5)));
const overlap = (a, b) => { const u = new Set([...a, ...b]); let n = 0; for (const w of a) if (b.has(w)) n++; return u.size ? n / u.size : 0; };
const idKey = (id) => String(id).split(/(\d+|[a-z])/).filter(Boolean).map((x) => (/^\d+$/.test(x) ? x.padStart(6, "0") : x)).join("");
const markerText = (line) => line.replace(/\{\{sp\[[^\]]*\]\s*Objective\s+[\d.]+[a-z]?\}\}/g, " ").replace(/^\s*[-*+]\s+/, "").replace(/\s+/g, " ").trim();

/** The old ids a study guide carries, in order, with the text written beside each marker: [{ old, text }]. */
export function oldObjectives(guideText) {
  const texts = new Map();
  for (const line of String(guideText || "").split("\n")) {
    const ids = [...line.matchAll(OLD_ID)].map((m) => m[1]);
    for (const id of ids) { if (!texts.has(id)) texts.set(id, []); const t = markerText(line); if (t) texts.get(id).push(t); }
  }
  return [...texts.keys()].sort((a, b) => (idKey(a) < idKey(b) ? -1 : idKey(a) > idKey(b) ? 1 : 0)).map((old) => ({ old, text: texts.get(old).join(" ") }));
}

/** Does the positional pairing of old and new objectives hold? null, or the reason it does not. */
export function pairingProblem(olds, news) {
  if (!olds.length) return "the study guide carries no old objective ids (\"Objective 5.1a\"): there is nothing to map from";
  if (!news.length) return "the converted plan has no objectives";
  if (olds.length !== news.length) return `the study guide carries ${olds.length} old objective ids (${olds.map((o) => o.old).join(", ")}) but the plan has ${news.length} objectives: they do not correspond one to one`;
  const O = olds.map((o) => words(o.text)), N = news.map((n) => words(n.text));
  for (let i = 0; i < O.length; i++) for (let j = i + 1; j < O.length; j++) {
    const gain = overlap(O[i], N[j]) + overlap(O[j], N[i]) - overlap(O[i], N[i]) - overlap(O[j], N[j]);
    if (gain > SWAP_GAIN) return `the texts point another way: "${olds[i].old}" (${olds[i].text.slice(0, 80)}) reads like "${news[j].text.slice(0, 80)}" and "${olds[j].old}" like "${news[i].text.slice(0, 80)}" — the order does not correspond`;
  }
  return null;
}

const kindOf = (s) => (/multiple/i.test(s) ? "mc" : /workout|calculat|numeric|problem/i.test(s) ? "calc" : /short|classif|explain|essay|free/i.test(s) ? "short" : "other");
const lastBefore = (list, line) => { let hit = null; for (const x of list) if (x.line <= line) hit = x; return hit; };

/** The relink plan for chapters (default: every chapter): { chapters: { slug: { status, why?, map, links, skipped, kept } } }. */
export function relinkPlan(root, reader, { chapters = null } = {}) {
  const all = manifestChapters(reader);
  const want = chapters?.length ? chapters : all;
  const unknown = want.filter((c) => !all.includes(c));
  if (unknown.length) throw new Error(`not a chapter of the manifest: ${unknown.join(", ")}`);
  const spine = parseSpine(reader, all), nodes = nodeIndex(spine);
  const units = loadUnits(root, reader);
  const out = { chapters: {} };
  for (const ch of want) {
    const has = (p) => reader.text(p) != null;
    const files = { guide: chapterFile("study-guide", ch, has), slides: chapterFile("slides", ch, has), practice: chapterFile("practice", ch, has) };
    const olds = oldObjectives(reader.text(files.guide));
    const news = (spine.chapters[ch]?.map.nodes || []).filter((n) => n.kind === "objective" && n.id);
    const problem = pairingProblem(olds, news);
    if (problem) { out.chapters[ch] = { status: "refused", why: problem }; continue; }
    const map = olds.map((o, i) => ({ old: o.old, new: news[i].id, oldText: o.text, newText: news[i].text }));
    const toNew = new Map(map.map((m) => [m.old, m.new])), every = map.map((m) => m.new);
    const links = {}, skipped = [];
    let kept = 0;
    const own = (rel) => units.filter((u) => u.locator.deliverable === rel && u.role === "teaching");
    const needs = (u) => { const cur = u.spineNodes || []; if (cur.length && cur.every((n) => nodes.has(n))) { kept++; return false; } return true; };
    // study guide: `## ` sections and the old ids each lists
    if (has(files.guide)) {
      const sections = [];
      String(reader.text(files.guide)).split("\n").forEach((t, i) => {
        if (/^## /.test(t)) sections.push({ line: i + 1, ids: [], numbered: /^## \d+(?:\.\d+)*\b/.test(t), assets: /\basset|\blicen[cs]e/i.test(t) });
        else if (sections.length) for (const m of t.matchAll(OLD_ID)) sections.at(-1).ids.push(m[1]);
      });
      for (const u of own(files.guide)) {
        if (!needs(u)) continue;
        const s = lastBefore(sections, u.locator.lines[0]);
        if (s?.assets) { skipped.push({ id: u.id, why: "a section about assets and licences: not teaching content" }); continue; }
        const ids = s?.ids.length ? [...new Set(s.ids.map((o) => toNew.get(o)).filter(Boolean))] : s?.numbered ? [] : every;
        if (!ids.length) { skipped.push({ id: u.id, why: s?.ids.length ? "its section names old ids the study guide's list does not hold" : "a numbered section that names no objective" }); continue; }
        links[u.id] = ids;
      }
    }
    // slides: "# N." parts
    if (has(files.slides)) {
      const parts = [];
      String(reader.text(files.slides)).split("\n").forEach((t, i) => { if (/^# /.test(t)) { const m = /^# (\d+)\./.exec(t); parts.push({ line: i + 1, n: m ? m[1] : null }); } });
      const chapterNo = olds[0].old.split(".")[0];
      for (const u of own(files.slides)) {
        if (!needs(u)) continue;
        const p = lastBefore(parts, u.locator.lines[0]);
        const ids = p?.n ? map.filter((m) => m.old.startsWith(`${chapterNo}.${p.n}`) && /^[a-z]?$/.test(m.old.slice(`${chapterNo}.${p.n}`.length))).map((m) => m.new) : every;
        if (!ids.length) { skipped.push({ id: u.id, why: `slide part ${p.n} has no objective` }); continue; }
        links[u.id] = ids;
      }
    }
    // practice: a question to one guide entry of its marked objective; an answer to what its question links to
    if (has(files.practice)) {
      const entries = (spine.chapters[ch]?.guide.entries || []).filter((e) => e.id).map((e) => ({ id: e.id, objective: `objective.${ch}.${e.objective}`, kind: kindOf(e.type || ""), used: false }));
      let lastQ = null;
      for (const u of own(files.practice)) {
        if (u.form === "answer") { if (!needs(u)) continue; if (lastQ) links[u.id] = lastQ; else skipped.push({ id: u.id, why: "an answer with no linked question before it" }); continue; }
        if (u.form !== "question") { if (needs(u)) skipped.push({ id: u.id, why: `a practice ${u.form}, not a question` }); continue; }
        const old = [...String(u.text).matchAll(OLD_ID)].map((m) => m[1])[0];
        const objective = old && toNew.get(old);
        if (!needs(u)) { lastQ = u.spineNodes; continue; }
        if (!objective) { skipped.push({ id: u.id, why: old ? `its marker names ${old}, which the study guide's list does not hold` : "a question without an old objective marker" }); lastQ = null; continue; }
        const qKind = kindOf((/·\s*\*([^*]+)\*/.exec(u.text) || [, ""])[1]);
        const pool = entries.filter((e) => e.objective === objective && !e.used);
        const e = pool.find((x) => x.kind === qKind) || null;
        if (e) e.used = true;
        links[u.id] = e ? [e.id] : [objective];
        lastQ = links[u.id];
      }
    }
    out.chapters[ch] = { status: "mapped", map, links, skipped, kept };
  }
  return out;
}

/** Apply a relink: link every mapped chapter's units (one linkUnits call) and log what was mapped and refused. */
export function relinkAfterConversion(root, reader, party, { chapters = null, dryRun = false } = {}) {
  if (!dryRun && (!party || !["agent", "instructor"].includes(party.role))) throw new Error("links are declared by the agent or the instructor");
  const plan = relinkPlan(root, reader, { chapters });
  const links = Object.assign({}, ...Object.values(plan.chapters).filter((c) => c.status === "mapped").map((c) => c.links));
  const summary = Object.fromEntries(Object.entries(plan.chapters).map(([ch, c]) => [ch, c.status === "mapped"
    ? { status: "mapped", map: Object.fromEntries(c.map.map((m) => [m.old, m.new])), linked: Object.keys(c.links).length, toGuideEntries: Object.values(c.links).filter((v) => v.length === 1 && v[0].startsWith("guide.")).length, kept: c.kept, leftUnlinked: c.skipped.length }
    : { status: "refused", why: c.why }]));
  if (!dryRun && Object.keys(links).length) {
    linkUnits(root, reader, links, party);
    appendLogRecord(root, { type: "revision", party, payload: { event: "units-relinked-after-conversion", rule: "old objective ids mapped one to one in order onto the converted plan's objectives", chapters: summary } });
  }
  return { dryRun, linked: Object.keys(links).length, chapters: summary, plan };
}
