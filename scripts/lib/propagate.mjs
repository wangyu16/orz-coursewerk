// Propagation engine (M9) — the first module that ACTS, and therefore the only one that can
// do harm.
//
// Why this exists
// ---------------
// Everything upstream DETECTS. M3 says which layer moved, M4 names a verb, M5 finds the blast
// radius, M6 finds the disagreements nobody declared. All of it is advice. This module is where
// advice becomes an edit to a real teaching artifact — and an edit to a teaching artifact is
// read by students who have no way to know it was made by a machine.
//
// That asymmetry sets the whole design. A propagation engine has two ways to fail:
//   (a) it refuses to auto-apply something it safely could -> the instructor gets one more
//       review item than strictly necessary. Cost: a minute, and they can decline it.
//   (b) it auto-applies something it should not have -> the package now contains an edit no
//       human chose, in prose that looks exactly like every other sentence. Cost: unbounded,
//       and — the part that matters — UNNOTICEABLE. There is no flag to read, because the
//       machine already decided there was nothing to flag.
// (b) is not "worse than (a)". It is a different kind of thing: (a) is visible and recoverable
// by the person it inconveniences; (b) is invisible to everyone. So the tiers are not a
// precision/recall tradeoff to be tuned. UNCERTAINTY IS ALWAYS DERIVED, and "probably fine"
// is uncertainty (spec §10 decision 2: "classification uncertainty defaults to DERIVED — fail
// toward review, never toward silence").
//
// THE TWO TIERS
// -------------
//   mechanical — a deterministic substitution whose correctness is PROVABLE from the registry
//                and the claim alone. Auto-applied, with a RECEIPT (never silently).
//   derived    — anything whose correct downstream edit needs judgment. Never applied here;
//                diffed and escalated to a human.
// The boundary is the product. Everything below is an argument about exactly one question:
// "can this edit be PROVEN right without a person?" Anything short of proven is derived.
//
// IMMUTABLE REGIONS (M8) ARE THE HARD FLOOR
// -----------------------------------------
// A rename that rewrites the inside of a direct quotation FABRICATES A QUOTATION: it puts words
// in a cited author's mouth, and it is undetectable downstream because the quote still looks
// like a quote. Same for a citation string (the link back to the record silently breaks) and a
// span reproduced from the pinned source (the fidelity checker's comparison is laundered rather
// than surfaced). This is the single worst thing this system could do, so it is not weighed
// against anything: an occurrence inside an immutable region is not a mechanical edit, full
// stop. It becomes a `derived` item whose reason names the region kind, and a person decides.
//
// M8 is consulted at PLAN TIME against the FILE-level regions — where the guard belongs — using
// `claim.locations[i].offset` (set once by M2 at extraction; §5d) to turn a claim-relative
// occurrence into the file offset those regions are indexed by:
//
//     fileOffset = location.offset + occurrenceOffsetWithinClaimText
//
// A location that names a file but carries NO offset is FAIL-CLOSED to `derived`: without it the
// edit's safety cannot be proven, and unproven is not safe. There is deliberately NO fallback to
// searching for `claim.text` in the file — that locator hack breaks on any repeated sentence and
// would re-derive at the consumer a fact the producer now owns (§5d).
//
// The claim's OWN prose is checked too (immutableRegions(claim.text, null)). The file-level
// regions should subsume it, so this is a cheap second opinion whose only possible effect is to
// refuse MORE — the safe direction — and it keeps working for a claim held in memory.
//
// OFFSET UNIT — JS STRING INDEX (UTF-16 code units), NOT BYTES. Not pedantry in a chemistry
// package. M8 indexes with `RegExp.exec().index` and `String.slice()`, i.e. JS string indices.
// In `Heat to 100 °C. Then: "the melting point…"` the degree sign puts the quote's UTF-8 byte
// offset at 23 and its string index at 22 — and slicing at the byte offset lands INSIDE the
// quotation. An off-by-one INTO a quote is exactly the fabrication this module exists to
// prevent, so the offset is VERIFIED against the claim text before any write and a mismatch is
// refused rather than applied approximately. (`claims.schema.json` says "Byte/char offset" —
// see the CONTRACT NOTE.)
//
// The region check then runs AGAIN at apply time. That is not redundancy:
//   - plan time proves the edit is safe against the file text AS INDEXED;
//   - apply time proves the file still IS that text. Between the two, a file can drift (a stale
//     index, a concurrent edit, a plan replayed from git against a moved tree). Offsets computed
//     against a text that no longer exists point at arbitrary prose — so `original.slice(offset,
//     offset + match.length) === match` is verified first, and the region check is re-run at the
//     real offset. A plan is a claim about the world; apply is the last moment it can still be
//     checked before it becomes a write.
//
// CONTRACT NOTE (reported, not routed around)
// -------------------------------------------
// RESOLVED: `locations[].offset` now exists, so the plan-time guard above actually runs. The
// original defect stays written down because its failure mode was invisible: interfaces §3
// handed `immutableRegionsByFile` — regions indexed into the FILE text — to a pure function
// whose claim input carried no file offset. The check could not run, but THE PARAMETER'S
// PRESENCE IN THE SIGNATURE MADE IT LOOK IMPLEMENTED. A missing field is visible; a check that
// silently cannot run is not.
//
// STILL OPEN — the new field's `description` reads "Byte/char offset of this claim's text within
// `file`". Byte and char are NOT the same number the moment a document contains `°`, `→`, or a
// Greek letter, which for these packages is certain rather than hypothetical (the golden fixture
// says "100 °C"). M8's unit is unambiguous in its CODE but unstated in the CONTRACT, so M2 and
// M9 are each free to read that description differently — and if M2 mints bytes while M9
// compares against M8's string indices, every offset drifts right by one per non-ASCII character
// upstream of it, silently landing edits inside quotations. This module requires JS STRING
// INDICES and verifies them. The description should say so instead of offering the choice.
//
// PURITY: planPropagation is pure and deterministic (interfaces §6.1) — no I/O, no network, no
// LLM, no clock, no randomness. applyMechanical writes files, which IS its job, and is likewise
// deterministic: it writes only files named in the plan, and carries no timestamp (a clock would
// make the receipt irreproducible; the caller stamps it).

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { immutableRegions, isImmutable } from "./immutable.mjs";
import { resolve as resolveTerm, findLabelOccurrences } from "./terms.mjs";

/** M4's action vocabulary (interfaces §3). An action outside it is a contract break. */
const ACTIONS = new Set(["NONE", "RENAME", "RE-DERIVE", "REGENERATE", "RECHECK", "ESCALATE", "ANNOTATE"]);

/**
 * The ONE mechanically-applicable verb.
 *
 * RENAME alone qualifies because it is the only change whose downstream edit is fully
 * determined by data we already hold: M1 says which term a label means in a scope, and the
 * substitution is a string swap with no meaning to invent. Every other verb needs something we
 * do not have — RE-DERIVE and REGENERATE need new prose written; RECHECK asks a question rather
 * than making an edit; ESCALATE is a request for a human decision by definition; ANNOTATE is a
 * pedagogical act (spec §5: "never replace"). Calling any of those mechanical would mean
 * inventing content, which is the failure mode this project rejects.
 */
const MECHANICAL_ACTION = "RENAME";

const WORD = /[\w]/;

const str = (v) => (typeof v === "string" ? v : "");
const norm = (v) => str(v).replace(/\s+/g, " ").trim().toLowerCase();

/** Accept CLAIMS ({claims:[...]}) or a bare array — the shape M6 already tolerates. */
function claimList(claims) {
  if (Array.isArray(claims)) return claims.filter((c) => c && typeof c === "object");
  if (claims && Array.isArray(claims.claims)) return claims.claims.filter((c) => c && typeof c === "object");
  return [];
}

/**
 * Whole-word occurrences of `label` in `text`, case-INSENSITIVELY matched but reporting the
 * SURFACE form actually found.
 *
 * Case-insensitive matching is deliberate and so is reporting the surface: M1 resolves labels
 * case-insensitively, so "Melting point" at the head of a sentence genuinely IS the term — a
 * case-sensitive search would silently MISS it, and a missed occurrence is a half-renamed
 * package (worse than a refused one). We must SEE every occurrence to judge the claim. What
 * happens to a case-variant occurrence is decided in `refuse()`, not hidden here.
 *
 * Whole-word only: renaming inside "melting pointer" is not a rename, it is corruption.
 */
// W14: occurrences come from M1's matcher (`findLabelOccurrences`) — the same boundary rule M2
// uses to count a mention and M6 uses to compare, so M9 can never rename what M2 did not index.
const findOccurrences = (text, label) => findLabelOccurrences(text, label);

/** Rewrite `text`, replacing each occurrence span with `to`. Occurrences must be ascending. */
function substitute(text, occurrences, to) {
  let out = "";
  let at = 0;
  for (const o of occurrences) {
    out += text.slice(at, o.start) + to;
    at = o.end;
  }
  return out + text.slice(at);
}

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * Why this claim's rename may NOT be auto-applied — or null when it is provably safe.
 *
 * This function IS the mechanical/derived boundary. Every branch is a case where a plausible,
 * probably-correct edit is refused because it cannot be PROVEN correct from the data alone.
 * Ordered most-fundamental first; the first hit is the reason a human reads.
 *
 * @returns {string|null}
 */
function refuse(claim, { termId, from, to }, terms, regionsByFile) {
  // --- The claim's own record says hands off -----------------------------------------------
  if (claim.immutable === true) {
    return `Claim is marked immutable (a quotation, citation or source-record span): automatic rewriting there would fabricate attributed text. A human decides.`;
  }

  // --- What is this claim ABOUT? Read scope; NEVER re-derive it (interfaces §4a, §5d) -------
  // Branch on PRESENCE, not truthiness: null is M2's answer ("package-wide"), and `??` here
  // would silently re-derive a fact that belongs to the data.
  if (!("scope" in claim)) {
    return `Claim carries no 'scope' field, so which term the label "${from}" means here is unknown. Scope is derived once by M2 and read everywhere else; it is not re-derived here.`;
  }

  // --- Spec §6.3: an item that TESTS the term is RECHECK, never blind-replace ---------------
  // There is no deterministic way to tell "uses the term" from "the term is what is being
  // assessed" — that lives in the instructor's intent, not in the text. Renaming the term
  // inside an assessment item can silently change WHAT IS TESTED while every check still
  // passes. So the whole type is refused rather than guessed at, one claim at a time.
  if (claim.type === "answer-key") {
    return `Claim is an answer-key item (spec §6.3): an item whose learning objective IS the term must be rechecked, not blind-replaced, and "uses the term" cannot be told from "tests the term" deterministically.`;
  }

  // --- One claim, one edit site -------------------------------------------------------------
  // A claim spanning several files carries ONE `text`. We cannot prove that text appears in
  // each file, nor that each occurrence sits outside that file's immutable regions.
  const locations = Array.isArray(claim.locations) ? claim.locations : [];
  if (locations.length !== 1 || !str(locations[0]?.file)) {
    return `Claim has ${locations.length} locations; a mechanical edit must have exactly one proven edit site with a readable file.`;
  }
  const file = str(locations[0].file);

  // --- FAIL CLOSED: the location must carry an offset ----------------------------------------
  // Branch on PRESENCE, not truthiness: `offset: 0` is a real and quite likely offset (a claim
  // at the top of a file) and `offset || fallback` would silently discard it — §5d's trap in
  // yet another costume. Without an offset the file-level regions cannot be consulted at all,
  // and NOT consulting them is how a rename ends up inside a quotation. No fallback search.
  const loc = locations[0];
  if (!("offset" in loc)) {
    return `Location names "${file}" but carries no 'offset', so this claim's text cannot be placed against that file's immutable regions. M2 sets the offset at extraction; M9 will not search the file for the claim's text (a repeated sentence would resolve to the wrong site) nor edit an unproven position.`;
  }
  if (!Number.isInteger(loc.offset) || loc.offset < 0) {
    return `Location offset ${JSON.stringify(loc.offset)} is not a non-negative integer, so it cannot be trusted to place the claim in "${file}".`;
  }

  // --- FAIL CLOSED: no immutable-region analysis for this file means nothing is proven ------
  if (!Array.isArray(regionsByFile[file])) {
    return `No immutable-region analysis was supplied for "${file}", so it cannot be proven the edit lands outside a quotation, citation or source span. Unproven is not safe.`;
  }

  // --- The registry must agree that this label means this term, HERE -------------------------
  const resolved = resolveTerm(terms, from, claim.scope);
  if (resolved !== termId) {
    // Reachable only when the claim's own termRefs declare the term (otherwise the claim was
    // never a target). Two authorities disagreeing about what a label means is exactly the
    // defect class this index exists to catch — it is not something to break the tie on.
    return `Claim declares termRefs ${JSON.stringify(termId)} but the label "${from}" resolves to ${JSON.stringify(resolved)} in scope ${JSON.stringify(claim.scope)}. The registry and the claim disagree about what this label means.`;
  }

  // --- The NEW label must not already mean something else here ------------------------------
  const collision = resolveTerm(terms, to, claim.scope);
  if (collision !== null && collision !== termId) {
    return `The new label "${to}" already resolves to ${JSON.stringify(collision)} in scope ${JSON.stringify(claim.scope)}. Applying the rename would mint a homograph and silently merge two distinct terms.`;
  }

  return null;
}

/**
 * Why these specific OCCURRENCES may not be auto-applied — or null.
 * Split from refuse() only because it needs the occurrence list.
 */
function refuseOccurrences(claim, occurrences, { from, to }, regionsByFile) {
  // --- Case ---------------------------------------------------------------------------------
  // "Melting point" -> "Fusion point"? Probably. Title Case, ALL CAPS, a label whose first word
  // is a proper noun that must STAY capitalized after a rename that moved it mid-phrase? A
  // case-transfer rule is a heuristic, and a heuristic in the mechanical tier is a guess in a
  // deterministic costume. Exact-case occurrences are provable; every other variant is a
  // one-line review item.
  const variant = occurrences.find((o) => o.surface !== from);
  if (variant) {
    return `Occurrence "${variant.surface}" differs in case from the old label "${from}"; a case-correct replacement is a judgment (sentence case, title case, proper nouns), not a substitution.`;
  }

  // --- M8, PLAN TIME, FILE-LEVEL: THE guard (interfaces §3 — RENAME MUST consult this) -------
  // The claim's location offset places its text in the file, so an occurrence's file offset is
  // location.offset + its offset within claim.text. These are the caller's regions — computed
  // over the whole file, with the pinned sourceText — so they see source-spans and reference
  // sections that the claim's own prose cannot reveal. UNIT: JS string indices, matching M8.
  const base = claim.locations[0].offset;
  const fileRegions = regionsByFile[str(claim.locations[0].file)];
  for (const o of occurrences) {
    const at = base + o.start;
    if (isImmutable(fileRegions, at)) {
      const region = fileRegions.find((r) => at >= r.start && at < r.end);
      return `Occurrence at file offset ${at} lies inside an immutable region (kind "${region?.kind}"): rewriting "${from}" to "${to}" there would alter text this package does not own. Renames appear in the package's OWN prose ("${to}", formerly "${from}"), never inside a quotation, citation or literal.`;
    }
  }

  // --- M8, PLAN TIME, CLAIM-LOCAL: a second opinion, offsets into claim.text ------------------
  // The file-level pass above should subsume this; it is kept because its only possible effect
  // is to refuse MORE (the safe direction), and it still protects a claim held in memory.
  const local = immutableRegions(claim.text, null);
  for (const o of occurrences) {
    if (isImmutable(local, o.start)) {
      const region = local.find((r) => o.start >= r.start && o.start < r.end);
      return `Occurrence at offset ${o.start} lies inside an immutable region (kind "${region?.kind}") of the claim's own text: rewriting "${from}" to "${to}" there would alter text this package does not own.`;
    }
  }
  return null;
}

/**
 * Plan the propagation of one authorized change across the claim graph.
 *
 * PURE and DETERMINISTIC: same inputs -> byte-identical plan, always. Both tiers are sorted by
 * claimId so the plan (and any diff of two plans) is stable.
 *
 * @param {object} change The change to propagate — M4's verdict plus the payload an edit needs.
 * @param {"NONE"|"RENAME"|"RE-DERIVE"|"REGENERATE"|"RECHECK"|"ESCALATE"|"ANNOTATE"} change.action
 *   M4's verb. THROWS on anything else: an unknown verb is a contract break, and silently
 *   bucketing it as "derived" would hide a broken caller behind a plausible-looking review item
 *   (M10's unmapped-kind rule, same reasoning).
 * @param {boolean} [change.authorized=false] The human already decided this change (spec §5
 *   cross-cutting rule (a)). Absent/false = suspected error -> nothing is auto-applied.
 * @param {string|null} [change.pedagogy=null] Explicit pedagogical intent. `deprecate-but-teach`
 *   means the old idea is kept as history -> ANNOTATE, never replace.
 * @param {{termId:string, from:string, to:string}} [change.rename] REQUIRED for a RENAME: the
 *   term whose preferred label moved, and the old and new labels (M1's `setPreferred` inputs).
 * @param {string[]} [change.claimIds] The impact set (M5's `affected`). For a RENAME it NARROWS
 *   the targets found here. For every other verb it IS the target list — M9 does not compute
 *   reachability (that is M5's job) and will not invent it.
 * @param {object|Array} claims CLAIMS, as `{claims:[...]}` or a bare array.
 * @param {object} terms TERMS (M1). The only authority on what a label means in a scope.
 * @param {Object<string, Array<{start:number,end:number,kind:string}>>} immutableRegionsByFile
 *   M8 regions per file, offsets into that FILE's text as JS STRING INDICES (not bytes; see the
 *   OFFSET UNIT note above). Consulted at plan time via `claim.locations[0].offset`. A file with
 *   no entry is treated as unproven (-> derived), never as "no regions".
 * @returns {{mechanical: Array<{claimId:string, edit:object}>, derived: Array<{claimId:string, reason:string}>}}
 */
export function planPropagation(change, claims, terms, immutableRegionsByFile) {
  const c = change && typeof change === "object" ? change : {};
  const action = str(c.action);
  if (!ACTIONS.has(action)) {
    throw new TypeError(
      `planPropagation: unknown action ${JSON.stringify(c.action)} — not in M4's vocabulary (${[...ACTIONS].join(" | ")}).`,
    );
  }

  const list = claimList(claims);
  const regionsByFile =
    immutableRegionsByFile && typeof immutableRegionsByFile === "object" ? immutableRegionsByFile : {};
  const mechanical = [];
  const derived = [];
  const finish = () => ({
    mechanical: mechanical.sort((a, b) => (a.claimId < b.claimId ? -1 : a.claimId > b.claimId ? 1 : 0)),
    derived: derived.sort((a, b) => (a.claimId < b.claimId ? -1 : a.claimId > b.claimId ? 1 : 0)),
  });

  // NONE is M4 saying the edit obliges nothing (a null edit: format only). The headline
  // behavior of the whole index is that this costs the instructor zero — including zero
  // review items, so `derived` stays empty too.
  if (action === "NONE") return finish();

  const impactSet = Array.isArray(c.claimIds) ? new Set(c.claimIds.filter((id) => typeof id === "string")) : null;

  if (action !== MECHANICAL_ACTION) {
    // Everything except RENAME needs judgment by construction. M9's contribution is to say so
    // explicitly and route it, not to attempt it.
    for (const claim of list) {
      const id = str(claim.id);
      if (!id || (impactSet && !impactSet.has(id))) continue;
      derived.push({
        claimId: id,
        reason: `${action} is not a deterministic substitution: the correct downstream edit requires judgment (re-derived prose, coverage recheck, a pedagogical annotation or a human adjudication). Gated behind a review diff.${
          str(c.reason) ? ` M4: ${str(c.reason)}` : ""
        }`,
      });
    }
    return finish();
  }

  // ---- RENAME -------------------------------------------------------------------------------
  const rename = c.rename && typeof c.rename === "object" ? c.rename : {};
  const termId = str(rename.termId);
  const from = str(rename.from);
  const to = str(rename.to);
  if (!termId || !from || !to) {
    throw new TypeError(
      "planPropagation: a RENAME change requires rename:{termId, from, to} — the term whose label moved, and the old and new labels.",
    );
  }
  // A no-op rename. Not an error, and not a review item: nothing changed.
  if (norm(from) === norm(to)) return finish();

  // Two blanket refusals, evaluated per target so the instructor sees WHICH claims are held.
  const blanket =
    c.authorized !== true
      ? `Rename is not recorded as authorized (change.authorized !== true): an unauthorized change is a SUSPECTED ERROR, adjudicated by a human before anything propagates (spec §5 cross-cutting rule (a)).`
      : str(c.pedagogy) === "deprecate-but-teach"
        ? `Pedagogical intent "deprecate-but-teach": the old label is kept ON PURPOSE as history and must be ANNOTATED, never replaced (spec §5). An automatic rename here would delete the very thing the instructor chose to teach.`
        : null;

  for (const claim of list) {
    const id = str(claim.id);
    if (!id) continue;
    if (impactSet && !impactSet.has(id)) continue;

    // Is this claim a TARGET at all? Two independent gates, both read from the data:
    //  1. it must actually contain the old label as a whole word, and
    //  2. if M2 declared what the claim is about, the term must be in that declaration.
    // A claim that is not a target is absent from BOTH tiers — it is not a refusal, there is
    // simply nothing to say about it, and a review item for it would be noise.
    const occurrences = findOccurrences(claim.text, from);
    if (occurrences.length === 0) continue;

    const declared = Array.isArray(claim.termRefs) ? claim.termRefs : null;
    if (declared && !declared.includes(termId)) continue;

    // The label appears, but M1 says it means a different term in this scope (a homograph) and
    // the claim never declared otherwise -> this claim is simply not about our term.
    if (!declared && "scope" in claim && resolveTerm(terms, from, claim.scope) !== termId) continue;

    const reason =
      refuse(claim, { termId, from, to }, terms, regionsByFile) ??
      refuseOccurrences(claim, occurrences, { from, to }, regionsByFile);
    if (blanket || reason) {
      derived.push({ claimId: id, reason: blanket ?? reason });
      continue;
    }

    const file = str(claim.locations[0].file);
    const text = str(claim.text);
    mechanical.push({
      claimId: id,
      edit: {
        kind: "term-substitution",
        file,
        termId,
        from,
        to,
        // M2's offset, carried verbatim — the edit site, not a hint to search from. `match` is
        // the DRIFT CHECK: apply refuses unless the file still reads exactly this at `offset`.
        offset: claim.locations[0].offset,
        match: text,
        replacement: substitute(text, occurrences, to),
        occurrences: occurrences.map((o) => ({ start: o.start, end: o.end })),
        // Carried, not re-derived: only the caller had the pinned sourceText, so these regions
        // see `source-span`s and reference sections that claim-local analysis cannot.
        fileImmutableRegions: regionsByFile[file].map((r) => ({ start: r.start, end: r.end, kind: r.kind })),
      },
    });
  }

  return finish();
}

/**
 * Apply the mechanical tier and return a RECEIPT.
 *
 * THE RECEIPT IS THE POINT, not a side effect. Auto-applying with no receipt is precisely the
 * failure this tier is designed around: the instructor consents BY SUMMARY (spec §10 decision 2
 * — "informed, not interrupted"), which only works if the summary expands into something that
 * answers, months later and from git alone: what changed, where, why it was allowed, and how do
 * I put it back. So every entry carries the claim, the file and byte offset, the exact before
 * and after text, and the sha256 of the file on both sides — enough to VERIFY the edit landed
 * where the plan said and to REVERSE it by swapping `after` back to `before` at `offset`.
 *
 * Refusals are recorded too, in `skipped`. A refusal that leaves no trace is indistinguishable
 * from an edit that was never planned, and the whole tier rests on the two being distinguishable.
 *
 * No clock: a timestamp would make the receipt irreproducible and this function is contractually
 * deterministic. The caller stamps it when it files the receipt.
 *
 * Writes ONLY files named in the plan, and only inside `root`.
 *
 * @param {{mechanical: Array<{claimId:string, edit:object}>}} plan planPropagation's output.
 * @param {string} root package root the plan's file paths are relative to.
 * @returns {{applied: Array<object>, skipped: Array<{claimId:string, file:string, reason:string}>, summary: string}}
 */
export function applyMechanical(plan, root) {
  const entries = (Array.isArray(plan?.mechanical) ? plan.mechanical : []).filter(
    (m) => m && typeof m === "object" && str(m.claimId) && m.edit && typeof m.edit === "object",
  );
  const applied = [];
  const skipped = [];
  const base = path.resolve(str(root) || ".");

  // Group by file so each file is read once and written once, and so two edits to one file are
  // decided against the SAME original text (offsets from the plan's regions are only valid
  // against it). Sorted throughout: the receipt must not depend on input order.
  const byFile = new Map();
  for (const entry of entries) {
    const file = str(entry.edit.file);
    if (!file) {
      skipped.push({ claimId: entry.claimId, file: "", reason: "Edit names no file." });
      continue;
    }
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(entry);
  }

  for (const file of [...byFile.keys()].sort()) {
    const group = byFile.get(file).sort((a, b) => (a.claimId < b.claimId ? -1 : 1));
    const abs = path.resolve(base, file);
    // Never write outside the package root, whatever the plan says.
    if (abs !== base && !abs.startsWith(base + path.sep)) {
      for (const e of group) skipped.push({ claimId: e.claimId, file, reason: `Path escapes the package root.` });
      continue;
    }

    let original;
    try {
      original = fs.readFileSync(abs, "utf8");
    } catch (err) {
      for (const e of group) skipped.push({ claimId: e.claimId, file, reason: `Cannot read file: ${err.code ?? "error"}.` });
      continue;
    }
    const hashBefore = sha256(original);

    // Pass 1 — decide everything against the ORIGINAL text; collect splices.
    const splices = [];
    for (const entry of group) {
      const { edit } = entry;
      const match = str(edit.match);
      const replacement = str(edit.replacement);

      // The offset IS the edit site (M2's, via the plan). No searching: a repeated sentence
      // would resolve to the wrong one, and the producer already owns this fact.
      const at = edit.offset;
      if (!Number.isInteger(at) || at < 0 || !match) {
        skipped.push({ claimId: entry.claimId, file, reason: `Edit carries no usable offset or match text.` });
        continue;
      }

      // DRIFT CHECK — does the file still read exactly this, here? Offsets are only meaningful
      // against the text they were computed over; if the file moved under the index, they point
      // at arbitrary prose. This is also where a wrong-UNIT offset (bytes rather than JS string
      // indices) is caught rather than applied approximately: any non-ASCII character upstream
      // shifts a byte offset right, the slice stops matching, and the edit is refused.
      if (original.slice(at, at + match.length) !== match) {
        skipped.push({
          claimId: entry.claimId,
          file,
          reason: `The file no longer reads the claim's text at offset ${at} (it has drifted since it was indexed, or the offset is in the wrong unit — M8 and M9 use JS string indices, not bytes). Refused: an offset that no longer locates its claim points at arbitrary prose.`,
        });
        continue;
      }

      // M8, APPLY TIME — re-check the regions at the verified offset. Plan time proved the edit
      // safe against the file AS INDEXED; this proves the file still is that text.
      const regions = Array.isArray(edit.fileImmutableRegions) ? edit.fileImmutableRegions : null;
      if (!regions) {
        skipped.push({ claimId: entry.claimId, file, reason: `Edit carries no file-level immutable regions to verify against.` });
        continue;
      }
      const occurrences = Array.isArray(edit.occurrences) ? edit.occurrences : [];
      const blocked = occurrences.find((o) => isImmutable(regions, at + o.start));
      if (blocked) {
        const region = regions.find((r) => at + blocked.start >= r.start && at + blocked.start < r.end);
        skipped.push({
          claimId: entry.claimId,
          file,
          reason: `File offset ${at + blocked.start} lies inside an immutable region (kind "${region?.kind}") that claim-local analysis could not see. Refused: rewriting there would alter text this package does not own.`,
        });
        continue;
      }

      splices.push({ entry, at, end: at + match.length, match, replacement });
    }

    // Two claims whose match spans overlap cannot both be applied against one original text.
    splices.sort((a, b) => a.at - b.at);
    const kept = [];
    for (const s of splices) {
      const prev = kept[kept.length - 1];
      if (prev && s.at < prev.end) {
        skipped.push({
          claimId: s.entry.claimId,
          file,
          reason: `Edit site overlaps the edit for ${prev.entry.claimId}; overlapping mechanical edits are refused rather than ordered.`,
        });
        continue;
      }
      kept.push(s);
    }
    if (kept.length === 0) continue;

    // Pass 2 — splice from the end so earlier offsets stay valid.
    let next = original;
    for (const s of [...kept].reverse()) {
      next = next.slice(0, s.at) + s.replacement + next.slice(s.end);
    }
    fs.writeFileSync(abs, next, "utf8");
    const hashAfter = sha256(next);

    for (const s of kept) {
      applied.push({
        claimId: s.entry.claimId,
        file,
        kind: str(s.entry.edit.kind),
        termId: str(s.entry.edit.termId),
        from: str(s.entry.edit.from),
        to: str(s.entry.edit.to),
        occurrences: (s.entry.edit.occurrences ?? []).length,
        offset: s.at,
        before: s.match,
        after: s.replacement,
        fileHashBefore: hashBefore,
        fileHashAfter: hashAfter,
      });
    }
  }

  applied.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.claimId < b.claimId ? -1 : 1));
  skipped.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.claimId < b.claimId ? -1 : 1));

  const files = [...new Set(applied.map((a) => a.file))];
  const renames = [...new Set(applied.map((a) => `${a.from} -> ${a.to}`))];
  const summary =
    applied.length === 0
      ? `No mechanical edits applied${skipped.length ? `; ${skipped.length} refused and held for review.` : "."}`
      : `Applied ${applied.length} mechanical edit${applied.length === 1 ? "" : "s"} across ${files.length} file${
          files.length === 1 ? "" : "s"
        } (${renames.join("; ")})${skipped.length ? `; ${skipped.length} refused and held for review` : ""}.`;

  return { applied, skipped, summary };
}

export default { planPropagation, applyMechanical };
