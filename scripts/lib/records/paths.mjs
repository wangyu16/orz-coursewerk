// Where each governed record lives — always inside the package root (skeleton §1, §5; req.records.in-package).
import fs from "node:fs";
import path from "node:path";

export const RECORD_PATHS = Object.freeze({
  steering: "metadata/STEERING.json",
  findings: "metadata/FINDINGS.json",
  log: "metadata/LOG.jsonl",
  unitsDir: "metadata/units",
  registry: "metadata/modules.json", // inside metadata/: the Alembic contract allows no extra root files
});

/** The sidecar path for a deliverable's units, e.g. `study-guide/ch1.md` → `metadata/units/study-guide/ch1.md.json`. */
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
