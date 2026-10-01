// Shared helpers for the stable modules (not itself a module: its name is not a slug, so the runner never loads it).
import { canonicalJson } from "../lib/records/canonical.mjs";

/** Deterministic modules re-run their evidence by re-running the check: the draft must be produced again, identically. */
export const recheckByRerun = (run) => async (draft, snapshot) =>
  (await run(snapshot)).some((d) => d.kind === draft.kind && canonicalJson(d.evidence) === canonicalJson(draft.evidence));

export const base = (over) => ({ version: "1.0.0", maturity: "stable", mayBlock: true, method: "deterministic", ...over });

/** Chapter slugs from the snapshot's manifest. */
export const chaptersOf = (s) => { try { return (s.json("alembic.json")?.chapters || []).map((c) => c.slug).filter(Boolean); } catch { return []; } };
export const DELIVERABLES = (s) => chaptersOf(s).flatMap((ch) => ["study-guide", "slides", "practice"].map((d) => `${d}/${ch}.md`)).filter((p) => s.text(p) != null);
