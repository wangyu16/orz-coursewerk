// A VERSION'S SCOPE IS CONTINUOUS (red team R7 coherence, H-01; operator rule D46/D50: obligations follow the text, at
// all times). A major version (D15) carries the units of its scope into it as open obligations — but the scope is not a
// snapshot taken when the version opens: the instructor opens the version FIRST and the restructuring follows, so units
// keep entering it — moved from another chapter (byte for byte, keeping their id and their version-1 evidence),
// relinked to one of its nodes, or brought in by a `chapters` entry added to private/coursewerk/DOCUMENTS.json. So, at all times:
//
//   every unit now in an open version's scope was carried into that version (or into another, still owed), or was
//   re-verified (a logged blind re-check, or the instructor's confirmation) since the version opened.
//
// A unit first written after the version opened carries nothing from before it and is no entrant: the version record
// lists the ids the package had used when it opened (`known`, short hashes; a version logged before R7 lists none, so
// every unit counts as known — the conservative reading). A unit that comes back from the retired-unit register is known.
//
// What keeps it true: the harness carries a late entrant the moment the index, a relink or reconcile sees it
// (carryLateEntrants: a harness carry naming the version it follows — a carry only adds obligations), and the gate and
// every approval read the rule itself (versionScopeGaps), so a route that bypasses those (a hand edit of DOCUMENTS.json,
// a gate run with no session) is a blocking obligation, never a silent pass.
import { sha256 } from "../records/canonical.mjs";
import { parseLog, readLogText, verifyLog } from "../records/log.mjs";
import { parseSpine } from "./spine.mjs";
import { manifestChapters } from "./package_reader.mjs";
import { allSidecars } from "./unit_records.mjs";
// cycles (obligations.mjs and reconcile.mjs read this module): all used only at run time
import { carryUnits, chapterScopeUnits, loadUnits } from "./obligations.mjs";
import { unitActLedger } from "./reconcile.mjs";

/** The short key a version record lists a unit id under (`known`). A collision only ever makes a unit count as known. */
export const knownKey = (id) => sha256(String(id)).slice(0, 10);
/** The keys of every unit id the package has used: live, in a retired-unit register, or logged as retired. */
export function knownUnitKeys(root, logRecords = null) {
  const ids = new Set();
  for (const side of Object.values(allSidecars(root))) { for (const u of side?.units || []) ids.add(u.id); for (const e of side?.retired || []) ids.add(e.id); }
  const recs = logRecords || (() => { const t = readLogText(root); return verifyLog(t).length ? [] : parseLog(t); })();
  for (const r of recs) if (r.type === "unit-retirement") for (const id of r.payload?.units || []) ids.add(id);
  return [...new Set([...ids].map(knownKey))].sort();
}

const isVersion = (r) => r.type === "version" && r.party?.role === "instructor" && Array.isArray(r.payload?.scopes);
/** The units a version scope covers now: a chapter's by content (chapterScopeUnits), the course's all. */
export function scopeUnits(units, reader, spine, scope) {
  if (scope === "course") return units;
  return scope.startsWith("chapter:") ? chapterScopeUnits(units, reader, spine, scope.slice("chapter:".length)) : [];
}

/**
 * Every open version whose scope now holds a unit that was neither carried into it nor re-verified since it opened:
 * [{ scope, version, seq, units }]. `scope` limits the answer to one scope. Empty when no version was ever opened.
 */
export function versionScopeGaps(root, reader, { scope = null, units = null } = {}) {
  const t = readLogText(root);
  if (verifyLog(t).length) return []; // a broken log: the gate reports it
  const recs = parseLog(t), latest = new Map(), versions = recs.filter(isVersion);
  for (const v of versions) for (const sc of v.payload.scopes) latest.set(sc, v);
  if (scope) for (const sc of [...latest.keys()]) if (sc !== scope) latest.delete(sc);
  if (!latest.size) return [];
  units ??= loadUnits(root, reader);
  // a unit that absorbed a carried unit's words owes that carry (units_index.mjs owesOf: `carry:<scope>@<version>`)
  const absorbed = new Map();
  for (const u of units) if (!u.carried) for (const c of (u.owes?.targets || []).map((x) => /^carry:(.+)@(\d+)$/.exec(x)).filter(Boolean)) {
    const v = versions.filter((x) => x.payload.scopes.includes(c[1]) && x.payload.to?.[c[1]] === Number(c[2])).at(-1);
    if (!v || (scope && c[1] !== scope)) continue;
    const k = `${c[1]}@${c[2]}`;
    if (!absorbed.has(k)) absorbed.set(k, { scope: c[1], version: Number(c[2]), seq: v.seq, units: [], why: "absorbed" });
    absorbed.get(k).units.push(u.id);
  }
  const spine = parseSpine(reader, manifestChapters(reader)), ledger = unitActLedger(recs), out = [];
  for (const [sc, v] of latest) {
    const known = Array.isArray(v.payload.known) ? new Set(v.payload.known) : null;
    const missing = scopeUnits(units, reader, spine, sc).filter((u) => {
      if (u.carried) return false; // carried (here or into another version): it owes its re-verification
      if (known && !known.has(knownKey(u.id))) return false; // first written in this version: nothing from before it
      const clear = ledger.get(u.id)?.clear;
      return !(clear && clear.seq > v.seq);
    }).map((u) => u.id);
    if (missing.length) out.push({ scope: sc, version: v.payload.to?.[sc], seq: v.seq, units: missing.sort(), why: "entered" });
  }
  return [...out, ...absorbed.values()];
}

/**
 * Carry every late entrant into the version whose scope it entered (the first such version, if several): a harness
 * carry that names the version it follows (`reconciles`) and says the unit entered after it opened (`entered`).
 * Returns [{ scope, version, units }] carried.
 */
export function carryLateEntrants(root, reader) {
  let gaps;
  try { gaps = versionScopeGaps(root, reader); } catch { return []; /* an altered record or a broken log: the gate reports it */ }
  const done = new Set(), out = [];
  for (const g of gaps) {
    const ids = g.units.filter((id) => !done.has(id));
    if (!ids.length || !Number.isInteger(g.version)) continue;
    // a carry the record check refuses (an altered record) is left to the gate, which holds the gap as owed
    try { carryUnits(root, ids, { version: g.version, scope: g.scope, reconciles: g.seq, entered: true }, { role: "harness", name: "version scope" }); } catch { continue; }
    ids.forEach((id) => done.add(id));
    out.push({ scope: g.scope, version: g.version, units: ids });
  }
  return out;
}
