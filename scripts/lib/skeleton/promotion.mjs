// Promotion trial → stable (skeleton §6; D19-G). A promotion is a logged module-change record that cites the study
// bar the module met on development cases. The registry may not claim more maturity than the module's own manifest
// unless such a record exists — so a quiet edit of private/coursewerk/modules.json cannot make a trial module block.
import { appendLogRecord, parseLog, readLogText, verifyLog } from "../records/log.mjs";
import { readRegistry, writeRegistry } from "../records/registry.mjs";

const RANK = { experimental: 0, trial: 1, stable: 2 };

const BAR_FIELDS = ["studyCell", "metric", "value", "threshold", "devCases"];
const barCited = (bar) => bar && BAR_FIELDS.every((k) => bar[k] !== undefined && bar[k] !== "") && Number(bar.devCases) > 0;

/** Promotions honoured: in a log that verifies, made by the instructor, citing the bar met (round P2-1). */
export function honouredPromotions(root) {
  const text = readLogText(root);
  if (verifyLog(text).length) return new Set();
  return new Set(parseLog(text).filter((r) => r.type === "module-change" && r.payload?.change === "promote" && r.party?.role === "instructor" && barCited(r.payload.bar))
    .map((r) => `${r.payload.module}:${r.payload.to}`));
}

export function promoteModule(root, { name, to = "stable", bar }, party) {
  if (party?.role !== "instructor") throw new Error("a promotion is the instructor's decision");
  if (!["trial", "stable"].includes(to)) throw new Error("a module is promoted to trial or stable");
  for (const field of BAR_FIELDS)
    if (bar?.[field] === undefined || bar?.[field] === "") throw new Error(`a promotion must cite the bar it met: ${field} is missing`);
  if (!(Number(bar.devCases) > 0)) throw new Error("a promotion must be measured on development cases");
  const registry = readRegistry(root);
  const entry = registry.modules.find((m) => m.name === name);
  if (!entry) throw new Error(`module ${name} is not registered`);
  if (RANK[to] <= RANK[entry.maturity]) throw new Error(`${name} is already ${entry.maturity}`);
  const record = appendLogRecord(root, { type: "module-change", party, payload: { change: "promote", module: name, from: entry.maturity, to, bar } });
  entry.maturity = to;
  writeRegistry(root, registry);
  return record;
}

/** Registry entries whose maturity exceeds their manifest's without an honoured promotion. */
export function unloggedPromotions(root, manifests) {
  const registry = readRegistry(root);
  const promoted = honouredPromotions(root);
  const byName = new Map(manifests.map((m) => [m.name, m]));
  return registry.modules.filter((e) => {
    const m = byName.get(e.name);
    return m && RANK[e.maturity] > RANK[m.maturity] && !promoted.has(`${e.name}:${e.maturity}`);
  }).map((e) => e.name);
}

/** Standard modules the instructor has disabled by a logged decision (with a reason) in a verifying log. */
export function honouredDisables(root) {
  const text = readLogText(root);
  if (verifyLog(text).length) return new Set();
  return new Set(parseLog(text).filter((r) => r.type === "module-change" && r.payload?.change === "disable" && r.party?.role === "instructor" && String(r.payload?.reason || "").trim()).map((r) => r.payload.module));
}

export function disableModule(root, { name, reason }, party) {
  if (party?.role !== "instructor") throw new Error("disabling a standard module is the instructor's decision");
  if (!String(reason || "").trim()) throw new Error("disabling a standard module needs a reason");
  return appendLogRecord(root, { type: "module-change", party, payload: { change: "disable", module: name, reason } });
}

/**
 * Demotions honoured (red-team round 5, the audit of F2): a package registry that lists a standard module at a LOWER
 * maturity than the harness ships it turns its defects into questions — a setting that weakens what is checked. It
 * counts only by the instructor's logged module-change "demote" decision, with a reason, in a verifying log.
 */
export function honouredDemotions(root) {
  const text = readLogText(root);
  if (verifyLog(text).length) return new Set();
  return new Set(parseLog(text).filter((r) => r.type === "module-change" && r.payload?.change === "demote" && r.party?.role === "instructor" && String(r.payload?.reason || "").trim())
    .map((r) => `${r.payload.module}:${r.payload.to}`));
}

export function demoteModule(root, { name, to, reason }, party) {
  if (party?.role !== "instructor") throw new Error("demoting a standard module is the instructor's decision");
  if (!["trial", "experimental"].includes(to)) throw new Error("a module is demoted to trial or experimental");
  if (!String(reason || "").trim()) throw new Error("demoting a standard module needs a reason");
  return appendLogRecord(root, { type: "module-change", party, payload: { change: "demote", module: name, to, reason } });
}
