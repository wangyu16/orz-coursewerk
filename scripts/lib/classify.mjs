// Change classifier — decide what a package edit OBLIGES, by asking which layer moved.
//
// The defect this exists to kill: the old change signal was a SHA-256 over file bytes,
// so adding a space "changed" the file and every dependent got flagged (the S-C pilot:
// 1 edit -> 6 required reviews). An instructor buried in false flags stops reading flags,
// and a review queue nobody reads is worse than no queue. So the fingerprint layer (M3)
// splits a claim into five INDEPENDENT hashes — format / label / content / spine /
// provenance — and this module reads WHICH of them moved to pick one of seven verbs.
// A cosmetic edit moves only `format`, and only `format` moving means NONE. That is the
// headline behavior: a null edit costs the instructor nothing.
//
// PURE and DETERMINISTIC by contract (interfaces §6.1): no I/O, no network, no LLM, no
// clock. This function sits in the auditable impact path — every flag a human sees must
// be reproducible from the two fingerprints and the ctx alone, months later, from git.
// It never builds fingerprints (that is M3's job) and never imports M3; it operates only
// on the frozen fingerprint SHAPE, so the two modules can be tested and evolved apart.
//
// TWO SUBTLETIES WORTH THE INK
//
// 1. Additive spine moves must NOT cascade (spec §10 decision 3). Registering a
//    supporting term or alias under an EXISTING concept is vocabulary enrichment: the
//    registry regenerates, the pedagogy did not change, and nothing downstream is stale.
//    Treating that like a structural spine change would RECHECK the whole package every
//    time the generator meets a new word — which is the byte-hash bug wearing a new hat.
//    Structural moves (add/remove/reorder a concept or objective) DO cascade; a depth
//    change cannot be patched at all, so it REGENERATEs the subtree.
//
// 2. Uncertainty fails toward the human, never toward silence (spec §10 decision 2).
//    A `content` move with no authorization on record is a SUSPECTED ERROR, and a
//    suspected error is adjudicated by a person (ESCALATE) rather than propagated on the
//    machine's own authority. Only an authorized change — the human already decided —
//    earns concerted propagation (RE-DERIVE). Absent/unknown ctx therefore reads as
//    unauthorized and unknown spine moves read as structural.
//
// MULTI-LAYER PRECEDENCE (deterministic; the whole reason this is written down)
//
//   ANNOTATE(pedagogy) > spine > content > provenance > label > format
//
// Rationale, top down. `ANNOTATE` first because "deprecate-but-teach" is an explicit
// human pedagogical decision — the old idea is kept ON PURPOSE as history — and a verb
// that would REPLACE it (RENAME/RE-DERIVE) must never be derived over the top of that
// intent. It outranks `label`/`content` only; a structural `spine` move still wins,
// because RECHECK verifies coverage rather than replacing anything, so the two are not
// in conflict.
//
// Below that, the order is BLAST RADIUS — report the most consequential layer, because
// its verb is the one that subsumes the others' work:
//   * `spine` is pedagogy and scope. It can invalidate whether a claim should exist at
//     all, so re-deriving its wording first would be work done on a doomed claim.
//   * `content` is meaning. It outranks provenance/label because a wrong FACT harms a
//     student; a stale citation or an old synonym does not.
//   * `provenance` outranks `label` because trust ("is this still what the source says?")
//     is load-bearing for the whole package, while a rename is a bounded, mechanical,
//     alias-preserving edit.
//   * `format` is last by construction — it is the only layer whose sole movement is a
//     no-op, and it moves incidentally on nearly every real edit (rewording a fact moves
//     `format` too), so it can never be the report.
// The layers that lost are not discarded: they are named in `reason`, so the receipt and
// the escalation queue keep the full picture even though one verb is returned.
//
// Why one verb and not a set: the verb drives an action, and the actions nest — a
// REGENERATE subsumes the RE-DERIVE that a co-moving `content` layer would have asked
// for. Returning a set would push the precedence decision downstream into every caller,
// where it would be re-invented inconsistently. Deciding once, here, is the point.
//
// ONE VERB, BUT SOMETIMES TWO STEPS (`followUp`)
//
// Precedence collapses CONCURRENT layers to the one that subsumes the rest. It cannot
// collapse a SEQUENCE, and spec §5 states exactly one: a provenance move is "RECHECK,
// then ESCALATE (adopt upstream?)". Those are two jobs for two different actors —
// RECHECK is the mechanical impact analysis this machine can do; ESCALATE is the
// adopt-or-decline judgement only the instructor can make — and the second does not
// subsume the first, so neither may be dropped. The primary `action` stays RECHECK and
// the second step is returned as a STRUCTURED `followUp: {action, reason}`, which M10
// reads to queue the escalation.
//
// It is deliberately a field and not a sentence in `reason`. `reason` is prose for a
// human reading a receipt; the moment a downstream module must regex it to learn what to
// do next, the prose becomes a load-bearing API that no test protects and any rewording
// silently breaks. Machine-readable obligations get a field.
//
// `followUp` is ABSENT — not present-with-a-null-action — when ctx.authorized: an
// authorized provenance move is a recorded override or a deliberate re-citation, and
// §10 decision 2 settles those permanently. Re-asking a question the instructor already
// answered is alarm fatigue — the same disease as over-flagging, caught later in the
// lifecycle. Absent means "there is no second step", which is the truth; a present-but-
// empty followUp would invite callers to render an empty queue entry.

/** The frozen fingerprint layers, in report precedence order (most consequential first). */
const LAYER_PRECEDENCE = ["spine", "content", "provenance", "label", "format"];

/** Every layer that exists in a fingerprint (interfaces §5). */
const LAYERS = ["format", "label", "content", "spine", "provenance"];

/**
 * Layers that moved between two fingerprints, in precedence order.
 * A layer that is absent from BOTH sides has not moved; absent-on-one-side has.
 */
function movedLayers(oldFp, newFp) {
  const a = oldFp || {};
  const b = newFp || {};
  return LAYER_PRECEDENCE.filter((layer) => LAYERS.includes(layer) && a[layer] !== b[layer]);
}

/** Human-readable "and the others also moved" tail for `reason`. */
function alsoMoved(moved, reported) {
  const rest = moved.filter((l) => l !== reported);
  return rest.length ? ` Also moved: ${rest.join(", ")}.` : "";
}

/**
 * Classify a claim edit into one action verb by reading which fingerprint layer moved.
 *
 * Pure and deterministic: the same (oldFp, newFp, ctx) always yields the same result.
 *
 * @param {{format?:string,label?:string,content?:string,spine?:string,provenance?:string}} oldFp
 *   The claim's fingerprints before the edit (hex strings; see interfaces §5).
 * @param {{format?:string,label?:string,content?:string,spine?:string,provenance?:string}} newFp
 *   The claim's fingerprints after the edit.
 * @param {object} [ctx] Decision context supplied by the caller.
 * @param {boolean} [ctx.authorized=false] The human already decided this change (override
 *   recorded / instructor-driven). False or absent means SUSPECTED ERROR -> escalate.
 * @param {"additive"|"structural"|"depth"|null} [ctx.spineChange=null] Which kind of spine
 *   move this is. `additive` = a term/alias under an existing concept (registry-only, no
 *   cascade). `structural` = objective add/remove, reorder, prereq change. `depth` =
 *   depth/level change (cannot be patched -> REGENERATE). Absent/unknown reads as
 *   structural (fail toward review).
 * @param {"deprecate-but-teach"|string|null} [ctx.pedagogy=null] Explicit pedagogical intent.
 *   `deprecate-but-teach` keeps the old idea as history -> ANNOTATE, never replace.
 * @returns {{action:"NONE"|"RENAME"|"RE-DERIVE"|"REGENERATE"|"RECHECK"|"ESCALATE"|"ANNOTATE",
 *            layer:(string|null), reason:string,
 *            followUp?:{action:string, reason:string}}}
 *   `layer` is the reported (winning) layer, or null when nothing moved. `followUp` is a
 *   structured second step for M10 to queue — present only where spec §5 states a sequence
 *   (an unauthorized provenance move: RECHECK, then ESCALATE the adopt-upstream decision).
 *   ABSENT whenever there is no second step, including every authorized change (ask-once).
 */
export function classify(oldFp, newFp, ctx) {
  const c = ctx || {};
  const authorized = c.authorized === true;
  const spineChange = c.spineChange == null ? null : c.spineChange;
  const pedagogy = c.pedagogy == null ? null : c.pedagogy;

  const moved = movedLayers(oldFp, newFp);

  if (moved.length === 0) {
    return { action: "NONE", layer: null, reason: "No fingerprint layer moved; the claim is unchanged." };
  }

  // An additive spine move is vocabulary enrichment, not pedagogy: it is registry-only and
  // must never cascade (spec §10 decision 3). Demote it out of contention so a co-moving
  // real layer is reported instead — and so an additive-only edit lands on NONE below.
  const effective = spineChange === "additive" ? moved.filter((l) => l !== "spine") : moved;

  if (effective.length === 0) {
    return {
      action: "NONE",
      layer: "spine",
      reason:
        "Additive spine enrichment (term/alias added under an existing concept): registry regeneration only, no propagation cascade.",
    };
  }

  const top = effective[0];
  const tail = alsoMoved(moved, top);

  // ANNOTATE outranks the replace-y verbs: a deliberate deprecate-but-teach must not be
  // overwritten by a derived RENAME/RE-DERIVE. It does not outrank a spine RECHECK/REGENERATE,
  // which verify coverage rather than replace the idea being preserved.
  if (pedagogy === "deprecate-but-teach" && (top === "label" || top === "content")) {
    return {
      action: "ANNOTATE",
      layer: top,
      reason: `Pedagogical intent 'deprecate-but-teach': keep the old idea as history and annotate it; never replace (${top} moved).${tail}`,
    };
  }

  switch (top) {
    case "spine": {
      if (spineChange === "depth") {
        return {
          action: "REGENERATE",
          layer: "spine",
          reason: `Spine depth change: depth cannot be patched, so the subtree is regenerated.${tail}`,
        };
      }
      const unknown = spineChange !== "structural";
      return {
        action: "RECHECK",
        layer: "spine",
        reason: unknown
          ? `Spine moved with an unrecognized spineChange (${JSON.stringify(spineChange)}); treated as structural — recheck coverage, orphans and prereq order.${tail}`
          : `Structural spine change (objective add/remove, reorder or prereq): recheck coverage, orphans and prereq order.${tail}`,
      };
    }

    case "content": {
      if (authorized) {
        return {
          action: "RE-DERIVE",
          layer: "content",
          reason: `Authorized content change: the human already decided, so dependents are re-derived concertedly and cited for sign-off.${tail}`,
        };
      }
      return {
        action: "ESCALATE",
        layer: "content",
        reason: `Unauthorized content change (suspected error): a human adjudicates source-vs-AI before anything propagates.${tail}`,
      };
    }

    case "provenance": {
      // The one place spec §5 states a SEQUENCE rather than a single obligation.
      if (authorized) {
        // Ask-once: the override is recorded and permanently settled — no second step.
        return {
          action: "RECHECK",
          layer: "provenance",
          reason: `Provenance moved on an authorized change (recorded override / deliberate re-citation): recheck citations, attribution and license inheritance. The override is already settled, so it is not re-asked.${tail}`,
        };
      }
      return {
        action: "RECHECK",
        layer: "provenance",
        reason: `Provenance moved (source drift or re-citation): recheck citations, attribution and license inheritance.${tail}`,
        followUp: {
          action: "ESCALATE",
          reason:
            "Adopt upstream? The pinned source moved; a human decides adopt-or-decline, and a decline is recorded so it is not re-asked.",
        },
      };
    }

    case "label": {
      return {
        action: "RENAME",
        layer: "label",
        reason: `Terminology rename: add-alias + set-preferred, scope-aware; the old label is never deleted, immutable regions are never rewritten, and items that TEST the term are rechecked rather than blind-replaced.${tail}`,
      };
    }

    case "format":
    default: {
      return {
        action: "NONE",
        layer: "format",
        reason: "Only the format layer moved (whitespace, formatting, meaning-preserving rephrase or template bump): no flag.",
      };
    }
  }
}

export default classify;
