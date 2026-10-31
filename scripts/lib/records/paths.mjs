// Where each governed record lives — always inside the package root (skeleton §1, §5; req.records.in-package).
import fs from "node:fs";
import path from "node:path";

// Where Coursewerk's records live (records layout, owner 2026-10-31; site-type contract §5 "records"): the working
// record under private/coursewerk/ (private by place), the public record under provenance/coursewerk/. One layout for a
// local package and an Alembic site alike; a package written before it is moved once (scripts/records_move.mjs).
export const RECORDS = "private/coursewerk";
export const PUBLIC_RECORDS = "provenance/coursewerk";
const PUBLIC_NAMES = new Set(["ATTRIBUTION.md", "PUBLISHED.json", "CHECKED.json"]);
/** A record path as written before the layout ("metadata/evidence/x.html", stored inside older records) read at its
 *  place now ("private/coursewerk/evidence/x.html"); any other path is returned as it is. Stored paths are never
 *  rewritten (their records are hash-bound), only read here. */
export function relocate(rel) {
  const p = String(rel ?? "");
  const m = /^metadata\/(.+)$/.exec(p);
  if (!m) return p;
  return PUBLIC_NAMES.has(m[1]) ? `${PUBLIC_RECORDS}/${m[1]}` : `${RECORDS}/${m[1]}`;
}
export const RECORD_PATHS = Object.freeze({
  steering: "private/coursewerk/STEERING.json",
  findings: "private/coursewerk/FINDINGS.json",
  log: "private/coursewerk/LOG.jsonl",
  unitsDir: "private/coursewerk/units",
  registry: "private/coursewerk/modules.json",
});

/** The sidecar path for a deliverable's units, e.g. `study-guide/ch1.md` → `private/coursewerk/units/study-guide/ch1.md.json`. */
export function unitsPathFor(deliverable) {
  const rel = String(deliverable || "");
  if (!rel || path.isAbsolute(rel) || rel.includes("\\") || rel.split("/").some((part) => part === ".." || part === "." || part === ""))
    throw new Error(`not a clean package-relative deliverable path: ${deliverable}`);
  return `${RECORD_PATHS.unitsDir}/${rel}.json`;
}

/** Resolve a record path under the package root, refusing anything that would escape it. */
export function recordFile(root, rel) {
  const base = path.resolve(root);
  const full = path.resolve(base, rel);
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error(`record path escapes the package: ${rel}`);
  return full;
}

/** Read a record file only if it is a regular file (not a symlink, FIFO or directory) within a size limit. */
export function readRegularFile(file, maxBytes = 16 * 1024 * 1024) {
  if (!fs.existsSync(file)) return null;
  const st = fs.lstatSync(file);
  if (!st.isFile()) throw new Error(`${path.basename(file)} must be a regular file (found ${st.isSymbolicLink() ? "a symbolic link" : "another kind of entry"})`);
  if (st.size > maxBytes) throw new Error(`${path.basename(file)} is larger than ${maxBytes} bytes`);
  return fs.readFileSync(file, "utf8");
}
