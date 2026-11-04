// Shared helpers for the stable modules (not itself a module: its name is not a slug, so the runner never loads it).
import { chapterFile } from "../lib/core/segment.mjs";
import { canonicalJson } from "../lib/records/canonical.mjs";

/** Deterministic modules re-run their evidence by re-running the check: the draft must be produced again, identically.
 *  The re-run happens ONCE per snapshot and serves every draft (General Chemistry, 2026-11-04: 32 drafts re-ran the
 *  whole MS7 scan 32 times). The recheck process is fresh (runner.mjs), so nothing from run() reaches this cache. */
export const recheckByRerun = (run) => {
  const reruns = new WeakMap();
  return async (draft, snapshot) => {
    if (!reruns.has(snapshot)) reruns.set(snapshot, Promise.resolve().then(() => run(snapshot)).then((ds) => new Set(ds.map((d) => `${d.kind}\u0000${canonicalJson(d.evidence)}`))));
    return (await reruns.get(snapshot)).has(`${draft.kind}\u0000${canonicalJson(draft.evidence)}`);
  };
};

export const base = (over) => ({ version: "1.0.0", maturity: "stable", mayBlock: true, method: "deterministic", ...over });

/** Chapter slugs from the snapshot's manifest. */
export const chaptersOf = (s) => { try { return (s.json("alembic.json")?.chapters || []).map((c) => c.slug).filter(Boolean); } catch { return []; } };
export const DELIVERABLES = (s) => chaptersOf(s).flatMap((ch) => ["study-guide", "slides", "practice"].map((d) => chapterFile(d, ch, (p) => s.text(p) != null))).filter((p) => s.text(p) != null);
