// Spine migration and anchor minting (redesign P3; seed of the P9 migration tool). Mechanical only: it mints anchors
// from item text, rewrites ordinal references (`concept.<scope>.<n>`) to anchored ids, and restructures a v0.12
// assessment guide into the v2 grammar — leaving **Type:** and **Count:** as TODO for the agent to fill from the
// guide's own prose. The result is a spine revision: it is checked (spine.mjs) and approved by the instructor (F3),
// never trusted because the tool produced it.
import { itemParts } from "./spine.mjs";

const STOP = new Set("a an the and or of to in on for with by as at is are be its it this that from into when which whose their than then so do does not no can".split(" "));

export function mintSlug(text, taken) {
  const words = String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
  // whole words only, at most four and 32 characters: anchors are read by people
  const picked = [];
  for (const w of words) { if (picked.length === 4 || [...picked, w].join("-").length > 32) break; picked.push(w); }
  let base = picked.join("-") || "item";
  let slug = base, n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;
  taken.add(slug);
  return slug;
}

const KINDS = { objectives: "objective", "concept sequence": "concept", "misconceptions to surface": "misconception" };

/** Mint anchors in a concept map; return { text, renames: { "<kind>.<scope>.<n>": "<kind>.<scope>.<anchor>" } }. */
export function anchorMap(text, scope) {
  const lines = String(text).split("\n");
  const renames = {}, taken = new Set();
  let kind = null, n = 0;
  // collect existing anchors first, so minted ones never collide
  for (const l of lines) { const m = /\[anchor:\s*([^\]]+)\]\s*$/.exec(l); if (m) taken.add(m[1].trim()); }
  for (let i = 0; i < lines.length; i++) {
    const h = /^##\s+(.*)$/.exec(lines[i]);
    if (h) { kind = KINDS[h[1].trim().toLowerCase()] || null; n = 0; continue; }
    if (!kind) continue;
    const m = /^(\s*(?:\d+[.)]|[-*+])\s+)(.*)$/.exec(lines[i]);
    if (!m) continue;
    n++;
    const p = itemParts(m[2]);
    const anchor = p.anchor || mintSlug(p.text, taken);
    renames[`${kind}.${scope}.${n}`] = `${kind}.${scope}.${anchor}`;
    if (!p.anchor) lines[i] = `${lines[i].trimEnd()} [anchor: ${anchor}]`;
  }
  return { text: lines.join("\n"), renames };
}

/** Rewrite ordinal references in [prereq: …] and key-term parent brackets. Uncertain marks ("…6?") are kept as notes. */
export function rewriteRefs(text, renames) {
  const notes = [];
  const fix = (ref) => {
    const r = ref.trim(), q = r.endsWith("?"), base = q ? r.slice(0, -1) : r;
    if (q) notes.push(`a prerequisite marked uncertain ("${base}?") is now a firm prerequisite: confirm or remove it with the instructor`);
    return renames[base] || base;
  };
  const out = String(text)
    .replace(/\[prereq:\s*([^\]]+)\]/g, (_, list) => `[prereq: ${list.split(",").map(fix).join(", ")}]`)
    .replace(/\[((?:concept|objective|misconception)\.[a-z0-9-]+\.\d+)\]/g, (_, ref) => `[${renames[ref] || ref}]`);
  return { text: out, notes };
}

/** Restructure a v0.12 assessment guide into the v2 grammar. objectiveAnchors: ["anchor of objective 1", …]. */
export function migrateGuide(text, objectiveAnchors) {
  const lines = String(text).split("\n"), out = [], taken = new Set();
  for (const line of lines) {
    const h = /^##\s+Objective\s+(\d+)\s*[—–-]\s*(.*)$/.exec(line);
    if (h && objectiveAnchors[Number(h[1]) - 1]) { out.push(`## ${h[2].trim()} [objective: ${objectiveAnchors[Number(h[1]) - 1]}]`); continue; }
    const g = /^\*\*Question guide\s+\w+\s*[—–-]\s*(.+?)\.\*\*\s*(.*)$/.exec(line);
    if (g) {
      out.push(`### ${g[1].trim().replace(/^the\s+/i, (m) => m)} [anchor: ${mintSlug(g[1], taken)}]`, "", "- **Type:** TODO", "- **Count:** TODO", "");
      if (g[2].trim()) out.push(g[2]);
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}
