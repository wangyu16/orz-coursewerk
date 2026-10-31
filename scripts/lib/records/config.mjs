// private/coursewerk/coursewerk.json — the package's own settings for the redesign. `spine: 2` opts a package into spine v2 (anchors,
// parsed assessment guides, approvals); a package without it is a legacy (v0.12) package and keeps working as before.
import fs from "node:fs";
import { readRegularFile, recordFile } from "./paths.mjs";
import { parseLog, readLogText, verifyLog } from "./log.mjs";

export const CONFIG_PATH = "private/coursewerk/coursewerk.json"; // inside metadata/: the Alembic contract allows no extra root files

export function readConfig(root) {
  const text = readRegularFile(recordFile(root, CONFIG_PATH), 64 * 1024);
  if (text === null) return { schemaVersion: 1, spine: 1 };
  const c = JSON.parse(text);
  if (c.schemaVersion !== 1 || ![1, 2].includes(c.spine)) throw new Error("private/coursewerk/coursewerk.json requires schemaVersion 1 and spine 1 or 2");
  return c;
}

export function writeConfig(root, config) {
  if (config.schemaVersion !== 1 || ![1, 2].includes(config.spine)) throw new Error("private/coursewerk/coursewerk.json requires schemaVersion 1 and spine 1 or 2");
  fs.writeFileSync(recordFile(root, CONFIG_PATH), JSON.stringify(config, null, 2) + "\n");
}

// ---- settings that change WHAT IS CHECKED are bound (red-team round 5, F2) ----------------------------------------
// Every core check of the gate ran only `if (config.spine === 2)`, and private/coursewerk/coursewerk.json is a package file no
// record binds: "spine": 1 — or deleting the file — switched reverify, carried-unverified, unit-record-altered,
// units-not-indexed, approvals and evidence off, unreported. A setting may only weaken checking through the log. Spine
// v2 is in force once the log shows it ever was — a logged migration, or any record only a spine-v2 harness writes (an
// agent session, a unit-record digest, a verifier dispatch) — and from then on a lowered, missing or unreadable `spine`
// is a blocking defect and the gate runs the v2 core regardless. (No command lowers it: there is no way back to v0.12.)
const V2_EVENTS = new Set(["agent-session-begin", "agent-session-end", "unit-records", "units-linked", "units-reverified", "units-carried"]);
const v2Record = (r) => (r.type === "intake" && r.payload?.event === "migrated-from-v0.12") || (r.type === "revision" && V2_EVENTS.has(r.payload?.event)) || r.type === "dispatch" || r.type === "unit-retirement";
/** Does the decision log show spine v2 was ever in force? (A log that does not verify is read as written: fail-safe.) */
export function spineV2InForce(logText) {
  let recs = []; try { recs = parseLog(logText); } catch { recs = String(logText || "").split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }
  return recs.some(v2Record);
}
/**
 * The settings the gate checks with, bound to the log: { config, spine, problems }. `problems`: settings the file
 * lowered below what the log shows in force (each a blocking defect). Throws only where readConfig would, and the log
 * shows nothing stronger.
 */
export function boundConfig(root, logText = readLogText(root)) {
  let config = null, error = null;
  try { config = readConfig(root); } catch (e) { error = e.message; }
  const v2 = spineV2InForce(logText);
  if (error && !v2) throw new Error(error);
  const problems = [];
  const missing = !fs.existsSync(recordFile(root, CONFIG_PATH));
  if (v2 && (missing || config?.spine !== 2)) problems.push(error ? `private/coursewerk/coursewerk.json cannot be read (${error}), and the decision log shows spine v2 in force` : missing ? "private/coursewerk/coursewerk.json is missing, but the decision log shows spine v2 in force: the v2 core checks run regardless — restore it with \"spine\": 2" : `private/coursewerk/coursewerk.json says "spine": ${JSON.stringify(config.spine)}, but the decision log shows spine v2 in force: the v2 core checks run regardless — restore "spine": 2`);
  return { config: config || { schemaVersion: 1, spine: 2 }, spine: v2 ? 2 : config.spine, problems };
}

/** The digest size the instructor set: their latest logged digest-cap act (the file only mirrors it), or null. */
export function loggedDigestCap(logText) {
  if (verifyLog(logText).length) return null;
  const r = parseLog(logText).filter((x) => x.type === "steering" && x.party?.role === "instructor" && x.payload?.event === "digest-cap" && Number.isInteger(x.payload?.cap)).at(-1);
  return r ? r.payload.cap : null;
}
