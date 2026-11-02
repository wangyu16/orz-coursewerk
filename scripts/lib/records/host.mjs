// The host record (owner 2026-11-02; req.records.site-import, req.gate.host-anchor): `.coursewerk-host.json` at the
// package root, written by site_import when a course pulled from Alembic (site layout, no git) is turned into
// Coursewerk's package layout, and read back by site_handback and by the gate's log anchor. It is hidden on purpose:
// the job's hand-back tool never sends hidden files, so the record stays with the job's working copy.
//
// Shape: { schemaVersion: 1, host: "alembic", state: "imported" | "handed-back", importedAt, [handedBackAt],
//          log: { sha256, bytes, parts: [{ path, bytes }] },
//          verification: { parts: [{ path, bytes, sha256, files: [d-….json, …] }] } }
import fs from "node:fs";
import path from "node:path";
import { HEX64 } from "./canonical.mjs";

export const HOST_FILE = ".coursewerk-host.json";

/** The host record of a package, or null when there is none; { error } when one is there but unreadable. */
export function readHostRecord(root) {
  const file = path.join(path.resolve(root), HOST_FILE);
  if (!fs.existsSync(file)) return null;
  let rec;
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile()) return { error: `${HOST_FILE} is not a regular file` };
    rec = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) { return { error: `${HOST_FILE} could not be read: ${e.message}` }; }
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return { error: `${HOST_FILE} is not a record object` };
  const log = rec.log;
  if (!log || typeof log.sha256 !== "string" || !HEX64.test(log.sha256) || !Number.isSafeInteger(log.bytes) || log.bytes < 0 || !Array.isArray(log.parts))
    return { ...rec, error: `${HOST_FILE} does not name the imported log (sha256, bytes, parts)` };
  if (!rec.verification || !Array.isArray(rec.verification.parts)) return { ...rec, error: `${HOST_FILE} does not list the verification parts` };
  return rec;
}

export function writeHostRecord(root, rec) {
  fs.writeFileSync(path.join(path.resolve(root), HOST_FILE), JSON.stringify(rec, null, 2) + "\n");
}
