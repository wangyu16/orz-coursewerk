// Major versions (D15, D16, D19-F). A structural change cuts continuity: it opens version n+1 of its scope — a
// chapter, both chapters when an objective moves between them, or the course when the chapter list or order changes —
// recorded in the log with its lineage. Minor changes (content edits, spine revisions that keep identity) stay
// within the version. (Carrying units into the new version as obligations needs the unit model: P5.)
import { appendLogRecord, parseLog, readLogText, verifyLog } from "../records/log.mjs";

export function currentVersion(logText, scope) {
  if (verifyLog(logText).length) return 1;
  const v = parseLog(logText).filter((r) => r.type === "version" && (r.payload?.scopes || []).includes(scope)).map((r) => r.payload.to[scope]);
  return v.length ? v[v.length - 1] : 1;
}

/** Seq of the latest version record touching a scope (0 if none). */
export function versionOpenedAt(logText, scope) {
  if (verifyLog(logText).length) return 0;
  const v = parseLog(logText).filter((r) => r.type === "version" && (r.payload?.scopes || []).includes(scope));
  return v.length ? v[v.length - 1].seq : 0;
}

/**
 * @param {string[]} scopes  e.g. ["chapter:ch1"], ["chapter:ch1", "chapter:ch2"] (an objective moved), or ["course"]
 */
export function openMajorVersion(root, { scopes, reason, carried = [], instructorWords = null }, party) {
  if (!Array.isArray(scopes) || !scopes.length) throw new Error("a new version names the scopes it covers");
  if (!String(reason || "").trim()) throw new Error("a new version states why (the structural change)");
  if (party?.role !== "instructor") throw new Error("opening a new major version is the instructor's decision");
  const text = readLogText(root);
  const from = Object.fromEntries(scopes.map((s) => [s, currentVersion(text, s)]));
  const to = Object.fromEntries(scopes.map((s) => [s, from[s] + 1]));
  return appendLogRecord(root, { type: "version", party, payload: { scopes, from, to, reason, carried, ...(instructorWords ? { instructorWords } : {}) } });
}
