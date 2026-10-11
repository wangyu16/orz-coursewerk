// Whose text is it? (red-team round 5, R5-K09/K10: authorship was per unit id, and a split or a merge minted new ids
// with the agent's origin, so the instructor's words lost their protection the moment the agent inserted one blank
// line.) Ownership follows the TEXT, not the id: a unit that holds words the instructor wrote — its own record says so,
// or it took text over from a unit that was the instructor's (`lineage`: the pieces of a split, a merge, a piece or a
// near return of a retired unit, a neighbour that absorbed a retired unit's words; the retired-unit register keeps
// every such unit's record), or the instructor's logged authorship confirmation names it or any unit whose text it
// holds — is the instructor's. The rule is deliberately the conservative one: a unit holding the instructor's words
// and the agent's is treated as the instructor's (their protection reaches the agent's words in it, never the reverse).
//
// EVERY consumer of authorship asks this module: the correction guard's two-source rule (verdicts.mjs), D35 acceptance
// and instructor-edit-unasked (MS8), the instructor's answers keyed by unit (claim keys, asked changes), and the
// assessment-fidelity question (MS9). The unit index stamps the same rule into a new unit's origin when it is minted
// (units_index.mjs), so the record and the rule agree; the rule still reads lineage, so a record written before this
// rule (or one whose origin a caller tried to change) cannot drop the instructor's credit.

/** Every id whose text the unit holds: its own, and every unit it took text over from (for good). */
export const textIds = (u) => [...new Set([u?.id, ...(u?.lineage || [])].filter(Boolean))];

/** id → origin, for every unit a set of sidecars records: live units and the retired-unit register. */
export function originIndex(sidecars) {
  const m = new Map();
  for (const side of sidecars || []) {
    for (const u of side?.units || []) if (u?.id && u.origin) m.set(u.id, u.origin);
    for (const e of side?.retired || []) if (e?.id && e.origin && !m.has(e.id)) m.set(e.id, e.origin);
  }
  return m;
}

const confirmsInstructor = (l, ids) => l.type === "authorship-confirmation" && l.party?.role === "instructor" &&
  ((Array.isArray(l.payload?.units) && l.payload.units.some((id) => ids.includes(id)) && (l.payload.as || "instructor") === "instructor") ||
    (l.payload?.initial && l.payload?.origin?.kind === "instructor-authored"));

/**
 * Was any of this unit's text written by the instructor? Its record, the record of any unit whose text it holds
 * (`ancestry`: id → origin, originIndex of the package's sidecars), or the log's authorship confirmations naming it or
 * any of those units — a sidecar edit cannot remove it (B16), nor can a split, a merge or a move.
 */
export function instructorAuthored(unit, logRecords = [], ancestry = null) {
  if (unit?.origin?.kind === "instructor-authored") return true;
  const ids = textIds(unit);
  if (ancestry && ids.some((id) => ancestry.get(id)?.kind === "instructor-authored")) return true;
  return (logRecords || []).some((l) => confirmsInstructor(l, ids));
}

/**
 * The origin a newly minted unit takes from the units whose text it holds (`sources`: the unit a split came from, the
 * units of a merge, a retired unit it is a piece of or covers). The instructor's credit goes first and is never lost; a
 * source's citation (source-derived) next. `revision`: the agent's session, recorded as a revision of their text
 * (operator, 2026-10-02: "keep crediting me is fine"). Returns null when no source's origin passes on.
 */
export function inheritedOrigin(sources, revision = null) {
  const pick = sources.find((o) => o?.origin?.kind === "instructor-authored") || sources.find((o) => o?.origin?.kind === "source-derived");
  if (!pick) return null;
  const o = pick.origin;
  return revision ? { ...o, revisedBy: [...(o.revisedBy || []), revision] } : { ...o };
}

/** id → { instructor, date } for every unit the instructor's logged authorship confirmations name (a verifying log). */
export function confirmedAuthorship(logRecords) {
  const m = new Map();
  for (const l of logRecords || []) if (l.type === "authorship-confirmation" && l.party?.role === "instructor" && Array.isArray(l.payload?.units) && (l.payload.as || "instructor") === "instructor")
    for (const id of l.payload.units) m.set(id, { instructor: l.party.name, date: String(l.at || "").slice(0, 10) || "unknown" });
  return m;
}
/**
 * The instructor's credit a unit record carries for its text — its own origin, or the origin (or the logged
 * confirmation) of any unit whose text it holds — as an origin record; or null. Used by the unit index, so a unit's
 * record says what the rule says.
 */
export function instructorCredit(o, ancestry = new Map(), confirmed = new Map()) {
  if (!o) return null;
  if (o.origin?.kind === "instructor-authored") return o.origin;
  for (const id of textIds(o)) {
    if (ancestry.get(id)?.kind === "instructor-authored") return ancestry.get(id);
    if (confirmed.has(id)) return { kind: "instructor-authored", ...confirmed.get(id) };
  }
  return null;
}

/** Does the unit hold text taken over from a unit that was the instructor's (by lineage: record or confirmation)? */
export function holdsInstructorText(unit, logRecords = [], ancestry = new Map()) {
  return !!instructorCredit({ id: null, origin: null, lineage: unit?.lineage || [] }, ancestry, confirmedAuthorship(logRecords));
}
