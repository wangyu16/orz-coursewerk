// Where each governed record lives — always inside the package root (skeleton §1, §5; req.records.in-package).
import path from "node:path";

export const RECORD_PATHS = Object.freeze({
  steering: "metadata/STEERING.json",
  findings: "metadata/FINDINGS.json",
  log: "metadata/LOG.jsonl",
  unitsDir: "metadata/units",
  registry: "coursewerk.modules.json",
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
