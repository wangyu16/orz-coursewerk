// A live, read-only view of a package for the core tools (same shape as a snapshot's text()).
import fs from "node:fs";
import path from "node:path";

export function liveReader(root) {
  root = path.resolve(root);
  return { text: (rel) => { const f = path.join(root, rel); try { return fs.lstatSync(f).isFile() ? fs.readFileSync(f, "utf8") : null; } catch { return null; } } };
}

/**
 * A manifest's units in order [req.host.alembic-units]. Alembic names them `units` since 2026-11-02 (its contract §14); manifests
 * written before keep `chapters`. Read both, so a course pulled into an Alembic job keeps its chapters.
 */
export function manifestUnits(manifest) {
  const list = Array.isArray(manifest?.units) ? manifest.units : Array.isArray(manifest?.chapters) ? manifest.chapters : [];
  return list.filter((c) => c && typeof c === "object" && c.slug);
}

export function manifestChapters(reader) {
  try { return manifestUnits(JSON.parse(reader.text("alembic.json"))).map((c) => c.slug); } catch { return []; }
}
