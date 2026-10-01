// A live, read-only view of a package for the core tools (same shape as a snapshot's text()).
import fs from "node:fs";
import path from "node:path";

export function liveReader(root) {
  root = path.resolve(root);
  return { text: (rel) => { const f = path.join(root, rel); try { return fs.lstatSync(f).isFile() ? fs.readFileSync(f, "utf8") : null; } catch { return null; } } };
}

export function manifestChapters(reader) {
  try { return (JSON.parse(reader.text("alembic.json")).chapters || []).map((c) => c.slug).filter(Boolean); } catch { return []; }
}
