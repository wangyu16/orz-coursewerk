#!/usr/bin/env node
// THE STUDY PAIRS (spec §7, final row) — the manuscript's S-C/S-F apparatus.
//
// What this is
// ------------
// Every other test in this suite asks "does module M do what M's contract says?". This one asks
// the only question the PRODUCT is judged on, and the only one the manuscript reports:
//
//     null edit  -> how many flags does the instructor get?   (target: ZERO)
//     real edit  -> are the truly-affected claims all reached, with the right verb?
//
// It is the whole pipeline, end to end, on real bytes: read the package, index it (that stored
// index is the **"before"**), edit a file the way a human would, re-index (the fresh compute is
// the **"after"**), match claim identity across the two, and ask M5/M4 what the edit obliges.
// Nothing here is hand-built; nothing is stubbed. That is the point — a suite of green unit tests
// over hand-built fixtures is exactly how a system stays inert on a real package (see the header
// of `lib/semantic_index.mjs`, which is the module that made this measurable at all).
//
// ============================================================================================
// THE GROUND TRUTH IS PREREGISTERED. IT IS NEVER FITTED. READ THIS BEFORE EDITING A CASE.
// ============================================================================================
// Every case's `expect` was written from the INTENT OF THE EDIT and from spec §5's taxonomy —
// BEFORE the harness was run — and each carries a `rationale` saying why the edit should reach
// exactly those claims and no others. A reader must be able to check the reasoning WITHOUT
// running the code, which is why the expectation is a literal sitting above the assertion rather
// than a snapshot captured from an output.
//
// **When observed differs from preregistered, THAT IS THE RESULT.** It is reported, in
// `mismatches`, and the expectation stays where it is. Adjusting an expectation to match an
// output produces a passing test, a metric of 1.0, and a lie: indistinguishable from fabrication
// from the outside, and indistinguishable from "fixing the test" from the inside. These numbers
// go into a paper about this very product, so the incentive to fit them is exactly as strong as
// the reason not to. **An honest 0.8 is worth more than a fitted 1.0.**
//
// ONE of the twelve cases below is currently FAILING its preregistration, on ONE finding: the
// reorder (2), which fails BY DESIGN and is left failing — `npm run study:pairs` prints it. THREE
// earlier findings have been RESOLVED by CONTRACT changes elsewhere — the rename (1, fixed
// 2026-07-17 in interfaces §2 / `lib/terms.mjs`), the orz container bump (3, fixed 2026-08-11 in
// `lib/fingerprint.mjs`'s `stripMarkup`), and the value-change term over-reach (4, fixed 2026-08-11
// by the quantity gate in `lib/coherence.mjs`'s `reachFrom`, retiring both value-change cases at
// once) — and their cases now PASS, without one `expect` literal below being touched. Read FINDINGS
// at the foot of this file before "fixing" any of the rest here — FINDING 2 fails by design.
//
// WHAT A "FLAG" IS (the definition every metric below rests on)
// -------------------------------------------------------------
// A flag is a claim THE INSTRUCTOR MUST LOOK AT. Two things qualify, and both must be counted or
// the null-edit number is flattering:
//   * an `actions` entry whose verb is not NONE   — the machine says this claim obliges work;
//   * a `silentRisk` entry                        — the machine says a change REACHED this claim
//     while none of its five fingerprints moved. It is a flag in the only sense that matters: a
//     human is being asked to check a contradiction that no other check in the system can see.
// `claimImpact` guarantees `affected = seeds ∪ silentRisk` (a reached claim either moved a layer,
// which makes it a seed, or did not, which makes it silent), so counting both counts each affected
// claim exactly once. A lifecycle change (added/removed) is a flag too — its existence changed.
//
// DETERMINISM (interfaces §6.1, and it is load-bearing for the paper, not a style rule)
// -------------------------------------------------------------------------------------
// No network, no LLM, no clock, no randomness, no git. Same fixture + same edit -> byte-identical
// metrics, months from now, from git. That is what lets a reviewer regenerate a number instead of
// trusting it. The fixture is READ-ONLY: every case runs against a fresh `mkdtemp` copy which is
// removed afterwards.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeSemanticIndex, writeSemanticIndex } from "./lib/semantic_index.mjs";
import { claimImpact } from "./lib/coherence.mjs";
import { emptyOverrides, recordOverride, isAuthorizedDivergence } from "./lib/overrides.mjs";
import { immutableRegions, isImmutable } from "./lib/immutable.mjs";
import { planPropagation, applyMechanical } from "./lib/propagate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The golden fixture (spec §7). READ-ONLY — never edited in place, always copied. */
export const DEFAULT_FIXTURE = path.resolve(HERE, "../tests/fixtures/mini-package");

const SG = "study-guide/phase-change.md";
const PRACTICE = "practice/phase-change.md";
const MAP = "concepts/phase-change.md";

// --- the package edits, written the way a human makes them ------------------------------------

/** Copy the fixture to a scratch dir. The fixture is other modules' golden input: never touch it. */
function stage(fixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-study-pairs-"));
  fs.cpSync(fixture, dir, { recursive: true });
  return dir;
}

/**
 * One literal substitution in one file. THROWS when the anchor text is absent, deliberately: an
 * edit that silently applied to nothing would produce a null result for every case and the whole
 * apparatus would report a perfect score for doing nothing at all. That failure looks exactly like
 * success, which is the one kind this harness may not have.
 */
function edit(root, file, from, to) {
  const p = path.join(root, file);
  const text = fs.readFileSync(p, "utf8");
  if (!text.includes(from)) {
    throw new Error(`study_pairs: edit target not found in ${file}: ${JSON.stringify(from)}`);
  }
  fs.writeFileSync(p, text.replace(from, to));
}

const FACT = "At standard pressure the melting point of water is 100 °C.";
const OBJ1 = "1. State the melting point of water at standard pressure.";
const OBJ2 = "2. Explain why temperature is constant during a phase change.";

/** A human-openable locator. Ids are hashes; a preregistration keyed on one is unreadable. */
const where = (claim) => `${claim.locations[0].file}#${claim.locations[0].anchor}`;

// ================================ THE PREREGISTERED CASES ======================================
//
// `expect` is the FLAG SET: every claim this edit SHOULD flag, keyed `<where>|<lifecycle>`, with
// the verb it should carry. Anything NOT listed should not be flagged — that is the null-edit
// requirement and, on a real edit, the precision requirement.
// `lifecycle` ∈ matched | added | removed. It is part of the key because a reorder legitimately
// produces two different claims at one anchor, and a key that could not tell them apart would
// silently merge a removal into an addition.

export const CASES = [
  // ------------------------------------ NULL SUITE (spec §7: target 0 flags) -------------------
  {
    name: "null-whitespace",
    suite: "null",
    edit: (r) => edit(r, SG, "is 100 °C.", "is 100 °C.   \n"),
    // GROUND TRUTH: {} — no claim flagged.
    // WHY: whitespace is not meaning, and it is not even WORDING. interfaces §5 states the
    // consequence as the cleanest possible statement of the product's #1 requirement: "a pure
    // whitespace edit moves NO fingerprint at all". `format` hashes `stripMarkup(text)`, which
    // collapses whitespace, so there is nothing for any of the five layers to see.
    expect: {},
  },
  {
    name: "null-reflow",
    suite: "null",
    edit: (r) => edit(r, SG, FACT, "At standard pressure the melting point\nof water is 100 °C."),
    // GROUND TRUTH: {} — no claim flagged.
    // WHY: identical to whitespace. A hard-wrapped line is the same sentence; `stripMarkup`
    // collapses the newline with every other run of whitespace. Reflow is what an editor does on
    // save, so if this flagged, the index would fire on edits the author did not knowingly make.
    expect: {},
  },
  {
    name: "null-formatting",
    suite: "null",
    edit: (r) => edit(r, SG, "the melting point of water is 100 °C", "the **melting point** of water is 100 °C"),
    // GROUND TRUTH: {} — no claim flagged.
    // WHY: emphasis is markup, and interfaces §5 has `format` "hashed blind to whitespace/markup".
    // The term also still resolves: M2's label matcher uses non-alphanumeric lookarounds, so `**`
    // does not hide "melting point" and `termRefs` is unchanged — hence `label` cannot move either.
    expect: {},
  },
  {
    name: "null-rephrase",
    suite: "null",
    edit: (r) => edit(r, SG, FACT, "The melting point of water at standard pressure is 100 °C."),
    // GROUND TRUTH: {} — no claim flagged.
    // WHY: this is the case the whole design turns on, and it is the ONE null edit that is
    // expected to move a fingerprint. The clause order moves, so `format` (the WORDING layer)
    // MOVES — and nothing else does: `normalizeContent` sorts tokens into a multiset, and the two
    // sentences carry the same tokens ({at, standard, pressure, the, term.melting-point, of,
    // water, is, #100:celsius}). spec §5's taxonomy puts "meaning-preserving rephrase" in the
    // `format`-only row -> NONE, so the claim is not a seed and reaches nothing. Zero flags is
    // therefore the whole chain working, not the absence of a signal.
    expect: {},
  },
  {
    name: "null-orz-toc",
    suite: "null",
    edit: (r) => edit(r, SG, "# Phase Change\n", "# Phase Change\n\n{{toc}}\n"),
    // GROUND TRUTH: {} — no claim flagged.
    // WHY: spec §5's format row lists "orz/template bump" as NONE. A `{{toc}}` directive asserts
    // nothing about the world; it is a rendering instruction. It also lands in its own section,
    // and M2's anchor ordinals are per-section, so it cannot move another section's anchors.
    expect: {},
  },
  {
    name: "null-orz-container",
    suite: "null",
    edit: (r) => edit(r, SG, FACT, `:::info\n${FACT}\n:::`),
    // GROUND TRUTH: {} — no claim flagged.
    // WHY: same row of the same table — "orz/template bump" -> NONE. Wrapping a sentence in an
    // orz-markdown container changes how it is PRESENTED (an info callout) and asserts nothing
    // new: the claim before and after is "the melting point of water is 100 °C". orz-markdown is
    // this project's house markdown standard, so a real package is full of these containers and a
    // real author adds them while styling a chapter, without touching a fact.
    //
    // WAS OBSERVED (until 2026-08-11): 3 flags (ESCALATE + 2 silent-risk). RESOLVED — `stripMarkup`
    // learned orz containers + `{{...}}` directives, so `content` no longer moves. See FINDING 3.
    expect: {},
  },

  // ------------------------------------ REAL SUITE (spec §7: full recall + correct action) -----
  {
    name: "real-value-change",
    suite: "real",
    edit: (r) => edit(r, SG, "is 100 °C.", "is 0 °C."),
    // GROUND TRUTH (2 flags):
    //   study-guide melting-point-of-water#1, matched -> ESCALATE
    //   practice   practice-phase-change#1,   matched -> SILENT-RISK
    // WHY EXACTLY THESE TWO:
    //   * the study-guide fact is the edited claim. Its `content` moves (spec §5: "100 °C -> 90 °C
    //     MUST move this"), no override is on record, so spec §5's content row and §10 decision 2
    //     make it a SUSPECTED ERROR -> a human adjudicates source-vs-AI -> ESCALATE, not RE-DERIVE.
    //   * the practice answer key SHOULD be flagged and is the reason `silentRisk` exists: it
    //     answers the very question whose answer just changed, its own text was not touched (so no
    //     fingerprint of its own moves and M4 says NONE), and therefore NOTHING else in the system
    //     will ever mention it. The guide now says 0 °C and the answer key still says 100 °C, and
    //     without this the contradiction ships with every check green.
    // WHY NOT THE OBJECTIVE (study-guide objectives#1): "State the melting point of water at
    //   standard pressure" does not restate the value. It is exactly as true, and exactly as
    //   correctly worded, at 0 °C as at 100 °C — nothing about it needs an instructor's attention.
    //   Flagging it is a precision cost, not a detection.
    //
    // OBSERVED: MEETS preregistration since the value-change term gate landed (2026-08-11). The
    // objective is no longer over-reached; the answer key is still SILENT-RISK. See FINDING 4.
    expect: {
      [`${SG}#melting-point-of-water#1|matched`]: "ESCALATE",
      [`${PRACTICE}#practice-phase-change#1|matched`]: "SILENT-RISK",
    },
  },
  {
    name: "real-value-change-authorized",
    suite: "real",
    // spec §7's OVERRIDE test: "knowledge update beyond the source -> NOT flagged as hallucination".
    // The fixture's study guide states the melting point of water as 100 °C, which is the BOILING
    // point — the correction to 0 °C is a knowledge update the instructor authorizes and sources.
    edit: (r) => edit(r, SG, "is 100 °C.", "is 0 °C."),
    authorizeEditedFact: true,
    // GROUND TRUTH (2 flags):
    //   study-guide melting-point-of-water#1, matched -> RE-DERIVE
    //   practice   practice-phase-change#1,   matched -> SILENT-RISK
    // WHY: the ONLY thing that changes versus `real-value-change` is the verb on the seed, and
    //   that is the entire content of spec §5's cross-cutting rule (a): an AUTHORIZED change is
    //   propagated concertedly (the human already decided; emit a review diff for sign-off),
    //   whereas a suspected error is escalated. M7 answers "authorized?"
    //   (`isAuthorizedDivergence`), M5 receives it per-claim, M4 turns it into RE-DERIVE. The
    //   claim must NOT be treated as a hallucination — that is the check.
    // WHY THE ANSWER KEY IS STILL SILENT-RISK, and this is the subtle half: authorization settles
    //   whether the EDIT is legitimate. It says nothing about whether the answer key that
    //   contradicts it has been fixed. An override that silenced the dependent would authorize the
    //   package into an internal contradiction, which is worse than the flag it removed.
    expect: {
      [`${SG}#melting-point-of-water#1|matched`]: "RE-DERIVE",
      [`${PRACTICE}#practice-phase-change#1|matched`]: "SILENT-RISK",
    },
  },
  {
    name: "real-term-rename",
    suite: "real",
    // The instructor renames the term the way spec §10 decision 3 says a rename happens: in the
    // CONCEPT MAP, which is "the living, single source of truth". The old label is kept as an
    // alias — interfaces §3/§6.2: "RENAME = add-alias + set-preferred; the old label is NEVER
    // deleted", so legacy occurrences still resolve and students still meet it in the literature.
    edit: (r) =>
      edit(
        r,
        MAP,
        "- **melting point** (fusion point, aliases: melting temperature) — temperature at which a solid becomes liquid",
        "- **fusion point** (aliases: melting point, melting temperature) — temperature at which a solid becomes liquid",
      ),
    // GROUND TRUTH (3 flags), and every one of them is a direct quotation of a frozen rule:
    //   study-guide melting-point-of-water#1, matched -> RENAME   (id PRESERVED)
    //   study-guide objectives#1,             matched -> RENAME   (id PRESERVED)
    //   practice   practice-phase-change#1,   matched -> RENAME   (id PRESERVED)
    // WHY: interfaces §4's identity table has the row "rename -> same id", and §4b exists for no
    //   other purpose than to make it true: `identityLabel` is the rename-INVARIANT hash of sorted
    //   TERM IDS, deliberately NOT M3's rename-VARIANT `label` fingerprint, because "an identity
    //   key and a change signal have opposite requirements over the same projection". So the three
    //   claims that mention the term keep their ids, their `label` fingerprint moves (that is what
    //   makes the rename OBSERVABLE), their `content` does NOT (M3's `foldTerms`: both labels
    //   resolve to the same id), and spec §5's label-only row gives RENAME.
    // WHY NOT objectives#2: it mentions no registered term (`termRefs: []`), so no vocabulary
    //   change can reach it.
    //
    // OBSERVED: 0 of 3. The ids are NOT preserved; all three report removed+added and classify
    // RECHECK. RECALL 0.0 ON THIS CASE. PREREGISTRATION LEFT AS IS — the rule above is the
    // contract, and the contract is what is broken. See FINDING 1, which is the headline result.
    expect: {
      [`${SG}#melting-point-of-water#1|matched`]: "RENAME",
      [`${SG}#objectives#1|matched`]: "RENAME",
      [`${PRACTICE}#practice-phase-change#1|matched`]: "RENAME",
    },
  },
  {
    name: "real-objective-add",
    suite: "real",
    edit: (r) => edit(r, SG, OBJ2, `${OBJ2}\n3. Compare the melting and boiling of water.`),
    // GROUND TRUTH (1 flag):
    //   study-guide objectives#3, added -> RECHECK
    // WHY: spec §5's spine row — "objective add/remove -> RECHECK coverage/orphans/prereq order".
    //   A new objective is a new obligation on the package: something must now teach it and
    //   something must now assess it, and only a coverage recheck can say whether anything does.
    // WHY NOTHING ELSE: the objective is APPENDED, so M2's per-section ordinals leave objectives#1
    //   and #2 exactly where they were. The two existing objectives are untouched assertions.
    expect: { [`${SG}#objectives#3|added`]: "RECHECK" },
  },
  {
    name: "real-objective-remove",
    suite: "real",
    edit: (r) => edit(r, SG, `${OBJ2}\n`, ""),
    // GROUND TRUTH (1 flag):
    //   study-guide objectives#2, removed -> RECHECK
    // WHY: the same spec §5 row, run backwards. Removing an objective can strand everything that
    //   taught or assessed it — an orphan check is exactly the question, and RECHECK is exactly
    //   the verb. The LAST objective is removed on purpose: removing the first would shift the
    //   second's positional anchor and confound this case with the reorder case below.
    expect: { [`${SG}#objectives#2|removed`]: "RECHECK" },
  },
  {
    name: "real-reorder",
    suite: "real",
    edit: (r) => edit(r, SG, `${OBJ1}\n${OBJ2}`, `1. ${OBJ2.slice(3)}\n2. ${OBJ1.slice(3)}`),
    // GROUND TRUTH (2 flags):
    //   study-guide objectives#1, matched -> RECHECK   (id PRESERVED)
    //   study-guide objectives#2, matched -> RECHECK   (id PRESERVED)
    // WHY: spec §5's spine row lists "reorder" beside add/remove -> RECHECK, because ordering is
    //   prerequisite structure: teaching B before A may now be incoherent even though both
    //   objectives are individually untouched. RECHECK asks precisely that.
    // WHY THE IDS MUST BE PRESERVED: these are the SAME TWO ASSERTIONS. A reorder that deleted two
    //   claims and created two strangers would lose the thread of the edit under review, which is
    //   the failure interfaces §4 exists to prevent ("every knowledge update deletes a claim and
    //   creates a stranger").
    //
    // OBSERVED: 2 added + 2 removed + 2 silent-risk = 6 flags; ids NOT preserved. RECALL 0.0 ON
    // THIS CASE. PREREGISTRATION LEFT AS IS. See FINDING 2.
    expect: {
      [`${SG}#objectives#1|matched`]: "RECHECK",
      [`${SG}#objectives#2|matched`]: "RECHECK",
    },
  },
];

/**
 * Cases spec §7 names that this fixture CANNOT reach, and the reason for each.
 *
 * They are declared, not dropped. A silently missing case is a coverage claim nobody earned, and
 * on a 4-claim fixture the temptation to invent one to fill the table is real. Every reason below
 * is a checkable property of the fixture, not an excuse — and note that four of the five share ONE
 * cause, which is a finding in its own right (see FINDING 5).
 */
export const SKIPPED = [
  {
    name: "asset-swap",
    reason:
      "spec §5's asset-provenance row (figure replaced or relicensed -> RECHECK attribution + " +
      "license inheritance) needs a package with media. The golden fixture is five markdown files " +
      "and a SOURCE_RECORD: it contains no figure, no asset and no ATTRIBUTION manifest, so there " +
      "is nothing to swap and nothing whose license could be inherited.",
  },
  {
    name: "source-drift",
    reason:
      "the `provenance` fingerprint is `sha256(sorted sourceRefs + overrideId)`. Every claim in " +
      "this fixture is SCAN-FOUND, and M2's scan mints `sourceRefs: []` by design (a sourceRef is " +
      "an authored assertion, never inferred). So provenance is the hash of the empty set on all 4 " +
      "claims and CANNOT move under any edit to this package. Reaching it needs a DECLARED claim " +
      "(an M12 sidecar or front matter), which the golden fixture does not carry.",
  },
  {
    name: "depth-change",
    reason:
      "spec §5's REGENERATE row is driven by `ctx.spineChange: \"depth\"`, which is a value the " +
      "CALLER supplies — no edit to a package's bytes produces it, so it is unreachable through " +
      "the before/after round trip by construction. The `spine` fingerprint is also constant here " +
      "for the same reason as source-drift (all `spineRefs: []`). Classifier-level coverage of the " +
      "verb lives in tests/classify.test.mjs, which is the right home for it.",
  },
  {
    name: "cross-chapter-reorder",
    reason:
      "the fixture has ONE chapter (concepts/phase-change.md). Reordering the chapter sequence " +
      "needs at least two, and inter-chapter prereq order is the whole content of the case.",
  },
  {
    name: "identity-split-merge",
    reason:
      "M2's `pairSplitsAndMerges` pairs unmatched removals and additions ONLY where they share a " +
      "NON-EMPTY spineRef — correctly: \"an empty spineRef is not a shared parent, it is the " +
      "absence of one\", and pairing on it would marry every unrelated addition to every unrelated " +
      "removal. All 4 fixture claims are scan-found with `spineRefs: []`, so a split can never be " +
      "REPORTED here even when one occurs. Needs a declared claim. (The other two identity rows — " +
      "rephrase keeps id, value change keeps id — ARE measured: see `identityChecks`.)",
  },
];

// ================================ running one case =============================================

/**
 * Run one preregistered case and report what the machine did — never what it should have done.
 *
 * The four beats are the product's, not this harness's (see `lib/semantic_index.mjs`): the STORED
 * index is the "before", a FRESH compute is the "after", identity is matched across the two, and
 * M5 says what the edit reaches. `writeSemanticIndex` is called for real — the round trip through
 * the artifact on disk is the thing being measured, so short-cutting it by holding the "before" in
 * memory would test a pipeline the product does not have.
 */
export function runCase(spec, fixture = DEFAULT_FIXTURE) {
  const root = stage(fixture);
  try {
    const before = computeSemanticIndex(root);
    writeSemanticIndex(root, before); // the "before" is an ARTIFACT, not a variable
    const beforeClaims = before.claims.claims;

    spec.edit(root);
    const after = computeSemanticIndex(root);

    // AUTHORIZATION comes from M7 and is threaded down per claim (interfaces §3: M5 must not read
    // OVERRIDES itself — that would derive authorization in a second place, §5d).
    let ctx;
    let overrides = emptyOverrides();
    if (spec.authorizeEditedFact) {
      const fact = beforeClaims.find((c) => c.type === "fact");
      overrides = recordOverride(overrides, {
        claimId: fact.id,
        divergesFrom: "src.wiki.melting.rev1",
        basis: "cited",
        justifiedBy: "doi:10.0000/study-pairs-fixture",
        authorizedBy: "instructor",
        date: "2026-07-17", // a literal: a clock here would make the metrics irreproducible
        rationale: "The pinned source states the melting point of water as 100 °C; it is 0 °C.",
      });
      ctx = { byClaimId: { [fact.id]: { authorized: isAuthorizedDivergence(overrides, fact.id) } } };
    }

    const impact = claimImpact(root, before.claims, after.claims, after.terms, ctx);

    // --- OBSERVE ---------------------------------------------------------------------------
    const byId = new Map([...beforeClaims.map((c) => [c.id, { claim: c, side: "old" }])]);
    for (const c of after.claims.claims) {
      byId.set(c.id, { claim: c, side: byId.has(c.id) ? "both" : "new" });
    }
    const lifecycleOf = (id) => {
      const e = byId.get(id);
      if (!e) return "unknown";
      return e.side === "both" ? "matched" : e.side === "new" ? "added" : "removed";
    };
    const silent = new Set(impact.silentRisk.map((s) => s.claimId));

    const viaOf = new Map(impact.silentRisk.map((s) => [s.claimId, s.via]));

    const observations = impact.actions.map((a) => {
      const entry = byId.get(a.claimId);
      const lifecycle = lifecycleOf(a.claimId);
      return {
        key: `${where(entry.claim)}|${lifecycle}`,
        claimId: a.claimId,
        lifecycle,
        // A silent-risk claim always classifies NONE (nothing of its own moved) — reporting the
        // NONE would hide the flag behind the verb the flag exists to compensate for.
        verdict: silent.has(a.claimId) ? "SILENT-RISK" : a.action,
        layer: a.layer,
        reason: a.reason,
        // WHY the claim was reached, carried as a FIELD and not left in M4's `reason` prose — the
        // action's reason belongs to the ACTION ("no fingerprint layer moved"), and a silent-risk
        // claim's action is always NONE, so the relation that reached it exists nowhere else in
        // this record. A reader auditing an over-reach needs the relation, not the verb; leaving
        // it to be regexed out of a sentence is the defect interfaces §5c names.
        ...(viaOf.has(a.claimId) ? { via: viaOf.get(a.claimId) } : {}),
      };
    });
    const flags = observations.filter((o) => o.verdict !== "NONE");

    // --- COMPARE (preregistered vs observed; the expectation is never touched) --------------
    const observedByKey = new Map(flags.map((f) => [f.key, f]));
    const expected = spec.expect ?? {};
    const expectedKeys = Object.keys(expected);
    const detected = expectedKeys.filter((k) => observedByKey.has(k));
    const missed = expectedKeys.filter((k) => !observedByKey.has(k));
    const unexpected = flags.filter((f) => !(f.key in expected));
    const wrongVerb = detected
      .filter((k) => observedByKey.get(k).verdict !== expected[k])
      .map((k) => ({ key: k, expected: expected[k], observed: observedByKey.get(k).verdict }));

    return {
      name: spec.name,
      suite: spec.suite,
      // DENOMINATORS. A recall of 1.0 over 2 claims is not the evidence a recall of 1.0 over 40
      // is, and a ratio printed without these invites the paper to imply otherwise.
      claimsInPackage: beforeClaims.length,
      expectedFlags: expectedKeys.length,
      observedFlags: flags.length,
      detected: detected.length,
      missed,
      unexpected: unexpected.map((f) => ({ key: f.key, verdict: f.verdict })),
      wrongVerb,
      observations,
      matchesPreregistration: missed.length === 0 && unexpected.length === 0 && wrongVerb.length === 0,
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ================================ the metrics ==================================================

/**
 * spec §7's three headline numbers, each with the denominator it is meaningless without.
 *
 * `false_flag_rate` is per CLAIM-OBSERVATION, not per case: the denominator is every claim that
 * COULD have been wrongly flagged across the null suite. Per-case would divide by 6 and read far
 * more precise than the evidence is.
 */
export function metrics(results) {
  const nulls = results.filter((r) => r.suite === "null");
  const reals = results.filter((r) => r.suite === "real");

  const falseFlags = nulls.reduce((n, r) => n + r.observedFlags, 0);
  const nullClaims = nulls.reduce((n, r) => n + r.claimsInPackage, 0);

  const expected = reals.reduce((n, r) => n + r.expectedFlags, 0);
  const detected = reals.reduce((n, r) => n + r.detected, 0);
  const wrongVerb = reals.reduce((n, r) => n + r.wrongVerb.length, 0);
  const unexpected = reals.reduce((n, r) => n + r.unexpected.length, 0);
  const realClaims = reals.reduce((n, r) => n + r.claimsInPackage, 0);

  const ratio = (num, den) => (den === 0 ? null : Number((num / den).toFixed(4)));

  return {
    false_flag_rate: {
      value: ratio(falseFlags, nullClaims),
      falseFlags,
      claimObservations: nullClaims,
      cases: nulls.length,
      target: 0,
    },
    impact_detection_recall: {
      value: ratio(detected, expected),
      detected,
      preregisteredFlags: expected,
      cases: reals.length,
      target: 1,
    },
    propagation_correctness: {
      // Of the flags we DID detect, how many carry the verb the edit's intent demands. Denominator
      // is `detected`, not `expected`: a verb cannot be right or wrong on a claim never reached.
      // Reported beside recall for exactly that reason — read alone it flatters.
      value: ratio(detected - wrongVerb, detected),
      correctVerb: detected - wrongVerb,
      detectedFlags: detected,
      target: 1,
    },
    // NOT one of spec §7's three, and reported anyway: the real suite's precision. Recall counts
    // what was missed; nothing in §7 counts what was over-flagged on a REAL edit, and an index
    // that flags everything scores 1.0 recall forever.
    real_edit_unexpected_flag_rate: {
      value: ratio(unexpected, realClaims),
      unexpectedFlags: unexpected,
      claimObservations: realClaims,
    },
  };
}

// ================================ the non-delta checks =========================================

/**
 * spec §7's identity rows that ARE reachable here: "rephrase keeps id", "value change keeps id".
 * (The split/merge row is not — see SKIPPED.)
 */
export function identityChecks(fixture = DEFAULT_FIXTURE) {
  const probe = (name, apply) => {
    const root = stage(fixture);
    try {
      const before = computeSemanticIndex(root);
      const target = before.claims.claims.find((c) => c.type === "fact");
      apply(root);
      const after = computeSemanticIndex(root);
      const survivor = after.claims.claims.find((c) => c.id === target.id);
      const moved = survivor
        ? ["format", "label", "content", "spine", "provenance"].filter(
            (l) => target.fingerprints[l] !== survivor.fingerprints[l],
          )
        : null;
      return { name, claimId: target.id, idPreserved: Boolean(survivor), moved };
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
  return [
    probe("rephrase-keeps-id", (r) => edit(r, SG, FACT, "The melting point of water at standard pressure is 100 °C.")),
    probe("value-change-keeps-id", (r) => edit(r, SG, "is 100 °C.", "is 0 °C.")),
  ];
}

/**
 * spec §7's immutable-region test: "edit inside a quote -> not auto-rewritten".
 *
 * The highest-stakes case in the system — a rename that rewrites the inside of a direct quotation
 * FABRICATES A QUOTATION, and the result still looks exactly like a quotation.
 *
 * READ THIS BEFORE TRUSTING THE RESULT. On this fixture the guard's REFUSAL BRANCH NEVER FIRES,
 * and the reason is not that the guard works: the fixture's only quotation carries no quantity and
 * no answer marker, so M2's scan mints NO CLAIM for it, so no plan can target it. The quotation
 * survives because nothing aimed at it. That is a true and valuable end-to-end property — the
 * package-level assertion below is real, over real bytes, and it would catch a propagation engine
 * that widened its own blast radius — but it is NOT evidence that the refusal works, and the
 * manuscript must not read it as such. The refusal branch is exercised by tests/propagate.test.mjs
 * with a hand-built claim that overlaps a region, which is the only way to reach it. Reaching it
 * from a package needs a fixture whose quotation is itself a claim.
 */
export function immutableCheck(fixture = DEFAULT_FIXTURE) {
  const root = stage(fixture);
  try {
    const index = computeSemanticIndex(root);
    const readFile = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

    const regionsByFile = {};
    for (const claim of index.claims.claims) {
      const file = claim.locations[0].file;
      if (!(file in regionsByFile)) regionsByFile[file] = immutableRegions(readFile(file), null);
    }

    const quoted = regionsByFile[SG].map((r) => readFile(SG).slice(r.start, r.end));

    const plan = planPropagation(
      {
        action: "RENAME",
        authorized: true,
        rename: { termId: "term.melting-point", from: "melting point", to: "fusion point" },
      },
      index.claims,
      index.terms,
      regionsByFile,
    );
    const receipt = applyMechanical(plan, root);
    const afterText = readFile(SG);

    // The NEGATIVE, which is the assertion that matters: not one applied edit landed inside a
    // region. Checked against the offsets M8 minted over the ORIGINAL text, in M8's units
    // (interfaces §5f: JS string indices, never bytes — a byte offset lands one character INSIDE
    // a quotation, which is the exact fabrication case).
    const insideRegion = [];
    for (const applied of plan.mechanical) {
      const file = applied.edit.file;
      for (const occ of applied.edit.occurrences) {
        const at = applied.edit.offset + occ.start;
        if (isImmutable(regionsByFile[file], at)) insideRegion.push({ claimId: applied.claimId, at });
      }
    }

    return {
      regions: regionsByFile[SG].map((r) => r.kind),
      quotedTextsSurviveVerbatim: quoted.every((q) => afterText.includes(q)),
      mechanicalEditsInsideAnImmutableRegion: insideRegion,
      applied: receipt.applied.length,
      // The answer key is routed to `derived` rather than rewritten — spec §6.3: an item whose
      // learning objective IS the term is RECHECK, never blind-replace.
      derived: plan.derived.map((d) => d.claimId),
      refusalBranchExercised: insideRegion.length > 0,
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ================================ the apparatus ================================================

/** Everything, as one JSON-serializable object — the manuscript's S-C/S-F record. */
export function runStudyPairs(fixture = DEFAULT_FIXTURE) {
  const results = CASES.map((c) => runCase(c, fixture));
  return {
    fixture: path.relative(path.resolve(HERE, ".."), fixture) || fixture,
    metrics: metrics(results),
    cases: results,
    identity: identityChecks(fixture),
    immutable: immutableCheck(fixture),
    skipped: SKIPPED,
    mismatches: results
      .filter((r) => !r.matchesPreregistration)
      .map((r) => ({ case: r.name, missed: r.missed, unexpected: r.unexpected, wrongVerb: r.wrongVerb })),
  };
}

// --- CLI ---------------------------------------------------------------------------------------
// `npm run study:pairs` (human) · `npm run study:pairs -- --json` (the manuscript's input).
// Exit code is 0 whether or not a case matches its preregistration: a mismatch is a RESULT to
// report, not a build failure to make go away. The test file is where the preregistration is
// enforced, and the three known-failing cases are asserted there AS failing, with their reasons.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--fixture");
  const report = runStudyPairs(at >= 0 ? path.resolve(args[at + 1]) : DEFAULT_FIXTURE);

  if (args.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const m = report.metrics;
    const pct = (r) => (r.value === null ? "n/a" : r.value.toFixed(3));
    console.log(`# Coursewerk study pairs — fixture: ${report.fixture}\n`);
    console.log("## Metrics (spec §7) — every ratio with its denominator\n");
    console.log(
      `  false_flag_rate                 ${pct(m.false_flag_rate)}  ` +
        `(${m.false_flag_rate.falseFlags} flags / ${m.false_flag_rate.claimObservations} claim-observations ` +
        `over ${m.false_flag_rate.cases} null edits)   target ${m.false_flag_rate.target}`,
    );
    console.log(
      `  impact_detection_recall         ${pct(m.impact_detection_recall)}  ` +
        `(${m.impact_detection_recall.detected} detected / ${m.impact_detection_recall.preregisteredFlags} preregistered ` +
        `over ${m.impact_detection_recall.cases} real edits)   target ${m.impact_detection_recall.target}`,
    );
    console.log(
      `  propagation_correctness         ${pct(m.propagation_correctness)}  ` +
        `(${m.propagation_correctness.correctVerb} correct verb / ${m.propagation_correctness.detectedFlags} detected)   ` +
        `target ${m.propagation_correctness.target}`,
    );
    console.log(
      `  real_edit_unexpected_flag_rate  ${pct(m.real_edit_unexpected_flag_rate)}  ` +
        `(${m.real_edit_unexpected_flag_rate.unexpectedFlags} / ${m.real_edit_unexpected_flag_rate.claimObservations} claim-observations)`,
    );

    console.log("\n## Per case (audit any number back to the edit that produced it)\n");
    for (const r of report.cases) {
      console.log(
        `  ${r.matchesPreregistration ? "OK  " : "DIFF"} ${r.name.padEnd(28)} ` +
          `suite=${r.suite.padEnd(4)} claims=${r.claimsInPackage} expected=${r.expectedFlags} observed=${r.observedFlags}`,
      );
      for (const o of r.observations.filter((x) => x.verdict !== "NONE")) {
        console.log(`         ${o.verdict.padEnd(12)} ${o.key}`);
      }
      for (const k of r.missed) console.log(`         MISSED       ${k}  (preregistered, not flagged)`);
      for (const u of r.unexpected) console.log(`         UNEXPECTED   ${u.key} -> ${u.verdict}`);
      for (const w of r.wrongVerb) console.log(`         WRONG VERB   ${w.key}: expected ${w.expected}, got ${w.observed}`);
    }

    console.log("\n## Identity (spec §7)\n");
    for (const i of report.identity) {
      console.log(`  ${i.idPreserved ? "OK  " : "FAIL"} ${i.name.padEnd(24)} moved=[${i.moved ?? "id lost"}]`);
    }

    console.log("\n## Immutable region (spec §7)\n");
    console.log(`  regions found: ${report.immutable.regions.join(", ") || "none"}`);
    console.log(`  quoted text survives a rename verbatim: ${report.immutable.quotedTextsSurviveVerbatim}`);
    console.log(`  mechanical edits inside a region: ${report.immutable.mechanicalEditsInsideAnImmutableRegion.length}`);
    console.log(`  refusal branch exercised by this fixture: ${report.immutable.refusalBranchExercised} (see immutableCheck's header)`);

    console.log("\n## Skipped — unreachable on a 1-chapter fixture, never silently dropped\n");
    for (const s of report.skipped) console.log(`  ${s.name}\n    ${s.reason}\n`);

    if (report.mismatches.length) {
      console.log("## OBSERVED != PREREGISTERED — the result, not a bug to smooth over\n");
      for (const m2 of report.mismatches) console.log(`  ${m2.case}: ${JSON.stringify(m2)}`);
      console.log("\n  Read FINDINGS at the foot of scripts/study_pairs.mjs before changing any expectation.");
    }
  }
}

// ==================================================================================================
// FINDINGS — observed != preregistered, and what each one means. REPORTED, NOT ROUTED AROUND.
// ==================================================================================================
//
// 1. **THE RENAME DOES NOT SURVIVE THE ONLY PATH AN INSTRUCTOR HAS.** (`real-term-rename`,
//    recall 0/3.) Two frozen rules are individually correct and jointly unsatisfiable:
//      * interfaces §2: a term's id is `term.<slug(preferredLabel)>`;
//      * spec §10 decision 3(c): the concept map is the single source of truth, and TERMS is
//        "REGENERATED FROM the map ... always a derived artifact, never a second authority".
//    So renaming a term the way the spec says renames happen — editing `## Key terms` in the map —
//    re-mints `term.melting-point` as `term.fusion-point`. `identityLabel` is the hash of sorted
//    TERM IDS, so it moves; the identity key moves; the claim id moves. Every claim mentioning the
//    term reports removed+added, and interfaces §4's "rename -> same id" row is FALSE end to end.
//    Observed here: 3 claims -> 3 removed + 3 added, classified RECHECK (an added claim has an
//    absent old side, so all five layers "move" and `spine` wins precedence). The `label`
//    fingerprint — the layer built to make a rename observable — never gets a matched pair to be
//    observed ON. RENAME is unreachable from a package edit.
//    **§4b is the sharpest part.** It reasons, correctly and at length, that an identity key and a
//    change signal have opposite requirements, and separates `identityLabel` (rename-INVARIANT)
//    from the `label` fingerprint (rename-VARIANT). The separation is right. But it is invariant
//    only to a rename performed via `setPreferred(terms, termId, newLabel)` — which keeps the id —
//    and NOTHING PERSISTS THAT CALL: the next `computeSemanticIndex` rebuilds TERMS from the map
//    and discards it. `setPreferred` is the only rename-safe path in the system and it has no
//    producer downstream of the map. §4b's invariance holds against an API nobody can reach.
//    THE FIX IS A CONTRACT CHANGE AND IS NOT MINE TO MAKE. It is in §2's id scheme, not in this
//    file: mint a term id from something rename-stable — the `[concept.x]` bracket §1 already
//    parses, or an explicit `[term.x]` in `## Key terms` — so the preferred label can move without
//    re-minting. Note the shape: this is the freeze-time check §5e ASKS FOR, one level up.
//    §5e catches one projection serving as both key and signal WITHIN a module; here the term ID is
//    the identity key (M2) while being derived from the preferred label, which is the change signal
//    (M1) — the same defect, split across two modules, so neither module's own review could see it.
//
// 2. **A REORDER IS INDEXED AS A MASS DELETE-AND-RECREATE.** (`real-reorder`, recall 0/2.)
//    Swapping two objectives yields 2 removed + 2 added + 2 silent-risk = SIX flags on a
//    FOUR-CLAIM package. The cause is documented in `lib/claims.mjs` as a known limitation ("a
//    derived anchor is positional, so it DOES move when a block is inserted before it"), and the
//    documentation is honest — but the CONSEQUENCE at study-pair scale is not a footnote. Each
//    re-added claim re-seeds co-mention reach, so the value-bearing fact and the answer key are
//    dragged in as silent-risk by an edit that changed no value at all. That is the byte-hash
//    over-flagging bug — 1 edit -> 6 required reviews, spec §0's founding defect, and the S-C
//    pilot's exact number — reappearing at claim granularity, wearing this index's authority.
//    spec §5 explicitly lists "reorder" as a RECHECK case, so this is a case the spec claims and
//    the implementation does not deliver. The stated fix (a DECLARED anchor) is real but has a
//    catch worth stating: declaring the anchor makes the reorder survive only if the author moves
//    the declaration with the prose, and nothing checks that they did.
//
// 3. **[RESOLVED 2026-08-11] AN ORZ CONTAINER BUMP WAS A FALSE FLAG.** (`null-orz-container`: was
//    3 flags where spec §5's format row promises zero; now 0.) The diagnosis below stands as the
//    record of the defect and its fix: `stripMarkup` in `lib/fingerprint.mjs` now strips orz
//    container fences (`:::name` open / bare `:::` close) and `{{...}}` directives — the two
//    constructs `check_oer.mjs`'s `orzSyntaxAudit` already recognizes — so `format`/`content` are
//    blind to them and the styling edit moves nothing. Original diagnosis:
//    `:::info` is not markdown, so `stripMarkup` has no rule for it and
//    `tokenize` sees the bare word "info", which lands in the semantic core:
//        plain    -> "#100:celsius at is pressure standard term.melting-point water"
//        wrapped  -> "#100:celsius at info is pressure standard term.melting-point water"
//    `content` moves -> ESCALATE -> the claim seeds co-mention -> the answer key and the objective
//    come along as silent-risk. Three flags for a styling edit. This is NOT a hypothetical class:
//    orz-markdown is this project's HOUSE MARKDOWN STANDARD (`.claude/skills/orz-markdown`), its
//    containers are how a chapter is styled, and `check_oer.mjs` itself checks for "semantic
//    containers" in deliverables — so the system knows the syntax exists and the fingerprint layer
//    does not. Any `:::` container, and any `{{plugin}}` directive that shares a block with prose,
//    will do this. The narrow fix is an orz-aware strip in `stripMarkup` (container fences,
//    `{{...}}` directives); the general point is that `format`'s promise is "blind to markup" and
//    it is blind only to markup that CommonMark knew about in 2014.
//    Its twin passes: `null-orz-toc` scores 0 flags, because a `{{toc}}` on its own line forms its
//    own block and mints no claim. Both are in the suite deliberately — reporting only the failing
//    one would be as much a choice of the result as reporting only the passing one.
//
// 4. **[RESOLVED 2026-08-11] THE VALUE-CHANGE TERM CO-MENTION OVER-REACHED.** (`real-value-change`
//    and `real-value-change-authorized`: was 1 unexpected flag each; now 0.) Changing the melting
//    point used to drag in "State the melting point of water at standard pressure" — an objective
//    that restates no value and is exactly as correct after the edit as before. Original diagnosis:
//    `reachFrom` fired term co-mention for EVERY claim sharing a term whenever `content` moved, so a
//    value edit reached every claim naming the term, value-bearing or not. The fix, narrow and
//    grounded in existing machinery: a VALUE change (content moved, no accompanying rename, and the
//    seed itself states a quantity) reaches by term only the sharers that THEMSELVES state a value —
//    read from M2's own units recognizer (`scanProjection`, M-shared units), so the gate cannot
//    drift from what counts as a quantity. The answer key that restates "100 °C" is KEPT (the case
//    the system exists for); the objective that names the term but states no value is DROPPED. Two
//    guards keep it conservative and forbid a fitted win: it NEVER applies on a rename (a rename
//    touches the term everywhere — `real-term-rename` still reaches the objective), and it NEVER
//    applies on a non-numeric content move (a meaning change could strand any sharer, so reach stays
//    full). `real_edit_unexpected_flag_rate` — added when this was still open, and kept — records the
//    precision gain: 8/24 -> 6/24 over the suite. The reorder (FINDING 2) is the only over-reach
//    that remains, and it fails by design.
//
// 5. **THE FIXTURE CANNOT EXERCISE 2 OF THE 5 FINGERPRINT LAYERS — and that is one cause, not
//    four.** Four of the five SKIPPED cases and one identity row trace to a single property: every
//    claim in the golden fixture is SCAN-FOUND, and M2's scan refuses (correctly, by design) to
//    invent a `spineRef`, a `sourceRef` or a `derivedFrom`. So `spine` and `provenance` are the
//    hash of the empty set on all 4 claims and cannot move under ANY edit; `derivedFrom` — the
//    PRIMARY edge `claimImpact` traverses — has no instance, so the derivation graph is empty and
//    every result above rests on co-mention alone. **The study pairs therefore measure 3 of 5
//    layers and 0 of 1 edge kinds, over 4 claims, and the manuscript must say so.** The fix is a
//    second golden fixture carrying M12 declarations. It is not a change to the fixture named in
//    spec §7 — other modules' tests depend on that one byte-for-byte — and it is not this task's
//    to invent, because a fixture whose contents I choose to make my own cases pass is not evidence.
//
// 6. **`overrideId` HAS NO PRODUCER — the fourth instance of the family, found by this harness.**
//    Not a study-pair mismatch (the override case passes), which is why it is easy to miss.
//    spec §2.4 defines `provenance` as "hash of sourceRefs + any override" and says it "moves on
//    re-citation / **override**". `lib/fingerprint.mjs` implements exactly that — it reads
//    `claim.overrideId ?? claim.override?.id`. `claims.schema.json` declares the field. And
//    **nothing writes it**: M2's `finalizeDraft` never sets it, M7's `recordOverride` writes an
//    entry into OVERRIDES.json whose keys are `{claimId, divergesFrom, basis, justifiedBy,
//    authorizedBy, date, rationale}` and mints no id at all. Verified here: recording an override
//    against a claim leaves its `provenance` fingerprint BYTE-IDENTICAL; injecting an `overrideId`
//    by hand moves it. So the reader works, the schema is right, the spec is right, and the layer
//    the fidelity checker watches does not move when the very thing it is defined to watch for
//    happens. It looks implemented — the exact costume of `derivedFrom` (no producer), the spine
//    namespace (no producer), and REVIEW_QUEUE.json (no producer). It survives because the override
//    reaches M4 through a DIFFERENT channel (`ctx.authorized`, from M7), so the working path masks
//    the dead one. The fix is a producer and an id: `recordOverride` should mint `override.<n>` and
//    M2 should stamp it onto the claim. Reported, not routed around — this harness could trivially
//    inject the field and turn the layer green, which is precisely why it does not.
