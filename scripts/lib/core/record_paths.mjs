// The renames Coursewerk knows, for paths stored inside records (req.records.paths-fix; scripts/records_paths.mjs).
// Only one so far: a chapter deck written as slides/<chapter>.md is now slides/<chapter>.slides.md (segment.mjs
// chapterFile). A path is renamed only when its file is missing and the renamed file exists.
import { chapterFile, chapterOfFile } from "./segment.mjs";

/** The path a stored, missing path now has, or null when no known rename leads to an existing file. */
export function renamedRecordPath(rel, exists) {
  const p = String(rel || "");
  if (exists(p)) return null;
  const m = /^slides\/([^/]+)\.md$/.exec(p);
  if (!m || /\.slides$/.test(m[1])) return null;
  const ch = chapterOfFile(p), to = ch && chapterFile("slides", ch, exists);
  return to && to !== p && exists(to) ? to : null;
}
