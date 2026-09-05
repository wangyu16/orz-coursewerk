// Term registry (M1) — the package's controlled vocabulary, DERIVED from the concept map.
//
// Why this exists
// ---------------
// Every downstream layer of the semantic index needs to answer one question: "are these
// two pieces of text talking about the same thing?" The `label` fingerprint is a set of
// term ids; the consistency scan compares claims that share a term; a rename is detected
// as a label-layer move. All of that needs a stable id per domain term, and something has
// to decide what the terms ARE.
//
// The elegant answer (spec §4): the instructor-authored concept map already IS the
// controlled vocabulary. It is one artifact doing three jobs — pedagogical plan, term
// authority, and spine. So there is no second ontology to maintain and no drift to
// reconcile: TERMS is a PURE PROJECTION of the map. Regenerate it any time; it can never
// disagree with the map, because it has no independent existence. TERMS is ALWAYS a
// derived artifact, NEVER an authority (spec §10 decision 3) — `generatedFrom` records
// the maps it came from so that stays honest.
//
// Why `## Key terms` and not prose extraction
// -------------------------------------------
// Concept sequences are written as *sentences* ("A solid melts at a characteristic
// temperature"), so mining terms out of them would be heuristic guessing — and a
// vocabulary authority built on guesses is not an authority. `## Key terms` (interfaces
// §1) makes the vocabulary explicit, human-authored, and deterministically parseable.
// A term listed there is `status:"confirmed"` — instructor-authorized BECAUSE it is in
// the map. A term found later in prose is registered by `addCandidate` as
// `status:"candidate"`: immediately usable by fingerprints and the consistency scan
// (detection from day one) but visibly not-yet-authorized. Candidates are resolved by
// PROPOSING A MAP REVISION at a review gate — never by promoting them here. The registry
// is not a side door into pedagogy.
//
// Why a rename never deletes anything
// -----------------------------------
// `setPreferred` is add-alias + set-preferred (spec §6.3). The old label persists as a
// recognized alias FOREVER: legacy occurrences in the package must still resolve, and
// students still meet the old word in the literature. Deleting it would silently break
// resolution for every existing claim — which is exactly the failure this index exists to
// prevent. The term ID is likewise never re-minted on rename (interfaces §4: ids are
// stable across rephrase and rename), so a rename moves the `label` fingerprint while
// claim identity holds.
//
// THE TERM ID IS MINTED ONCE — AND `priorTerms` IS WHAT MAKES THAT TRUE
// ---------------------------------------------------------------------
// [interfaces §2, amended 2026-07-17; the study pairs proved the rename BROKEN end to end.]
// The paragraph above described an invariant this module could not keep. §2 minted
// `term.<slug(preferredLabel)>` and spec §10 dec. 3(c) REGENERATES this registry from the map,
// so the only path an instructor has to a rename — editing `## Key terms` — re-minted the id.
// That moved M2's `identityLabel` (a hash of sorted term IDS), so it moved the claim id, so the
// three claims mentioning the term reported 3 added + 3 removed where §4 promises 3 matched, and
// the `label` fingerprint — the layer built to make a rename OBSERVABLE — never got a matched
// pair to be observed on. `setPreferred` was the only rename-safe path in the system and NOTHING
// PERSISTED IT: §4b reasoned correctly about an API nobody could reach.
//
// This is §5e at SYSTEM scale, and the first instance spanning two modules: the term id served as
// an IDENTITY KEY (M2 hashes it) while DERIVING FROM THE CHANGE SIGNAL (this module's
// preferredLabel). An identity key must be rename-INVARIANT; a change signal must be
// rename-VARIANT; one value cannot be both. Every earlier §5e instance sat inside one file where
// its author could see both halves — this one lived in the seam, so neither module's review caught it.
//
// The fix is MEMORY, and the memory is `priorTerms` — the STORED `TERMS.json` (M14), a registry
// that simply did not exist when §2 was frozen. `buildTerms(conceptMaps, priorTerms)`:
//
//   * a term id is minted from its preferredLabel THE FIRST TIME the term is seen, and never re-minted;
//   * on a later build, a map entry whose LABEL SET (preferred + aliases) overlaps EXACTLY ONE prior
//     term IN THE SAME SCOPE resolves to it and KEEPS ITS ID. Only preferredLabel/aliases update, so
//     TERMS stays a pure projection of the map in everything except the id;
//   * §1's grammar guarantees the hinge: a rename keeps the old label as an alias
//     (`- **fusion point** (melting point, …)`), so the overlap exists BY CONSTRUCTION. If an author
//     DELETES the old label instead of demoting it, that is NOT a rename — it is a remove + an add,
//     and reporting it as such is correct. We do not rescue it with similarity matching: that is the
//     fabrication this project refuses everywhere else, wearing a helpful hat;
//   * overlapping ≥2 prior terms is AMBIGUOUS: resolve nothing, mint fresh, and REPORT
//     (`buildTermsReport().ambiguous`). A silent merge of two concepts is worse than a missed
//     rename — it folds two distinct teachings into one node and every downstream check then
//     ENFORCES the merge.
//
// With no `priorTerms` this is a first build and behaves exactly as it always did. A caller that
// HAS a stored registry and does not pass it silently reintroduces the defect (§3).
//
// THE RESULT: the id is a HISTORICAL ARTIFACT. `term.melting-point` may carry preferredLabel
// "fusion point" forever. That is correct and normal for an identity key — it is a HANDLE, not a
// display name — and it is the same discipline the `setPreferred` note below already states. DO
// NOT "tidy" it to match the label; the tidy IS the bug.
//
// DO NOT "FIX" STALE-LOOKING IDS. After `setPreferred(t, "term.latent-heat", "enthalpy of
// fusion")` the id still reads `term.latent-heat` while the label says something else. That
// is not a bug — it is the entire point. The id is an OPAQUE HANDLE, minted once from the
// label that happened to be preferred at birth; re-minting it to "match" would break every
// claim that references it and destroy identity across the rename the index exists to track.
//
// `status` vs `lifecycle` are ORTHOGONAL AXES (interfaces §1, 2026-07-16). `status` is
// AUTHORIZATION — confirmed (in the map) vs candidate (awaiting a proposed map revision).
// `lifecycle` is the term's life stage — active | deprecated-but-teach | superseded. A
// deprecated-but-teach term is STILL `status:"confirmed"`: the instructor put it in the map
// deliberately, to be taught as history. Collapsing these into one enum is what made a naive
// `status === "confirmed"` check read false for an authorized term and mis-flag it as an
// orphan. We emit `lifecycle` EXPLICITLY on every term (never relying on the schema default)
// so the mirror-image bug — a naive `lifecycle === "active"` reading false on an absent
// field — cannot happen either. Absence here would carry no information; see spineRef, where
// it carries all of it.
//
// A note on `spineRef` (optional, and ABSENT-IS-HONEST): it comes ONLY from the explicit
// trailing `[concept.x]` / `[objective.x]` bracket in the Key-terms line — a placement the
// instructor already decided in the Q3 flow. It is NEVER derived by matching a term's label
// against `## Concept sequence` items: those are sentences ("A solid melts at a
// characteristic temperature"), so matching fires on incidental overlap, not authorship — a
// term like "temperature" would bind to whichever sentence mentions it first, and M5's
// orphan analysis would then trust an arbitrary link. An absent link is honest; a guessed
// one is a fabrication in a deterministic costume.
//
// Parsing is TOLERANT by contract (interfaces §1): an unknown or missing section yields
// fewer nodes, never a crash. A half-written map must still produce a usable registry.
//
// PURE and DETERMINISTIC: same input → same output. No network, no LLM, no clock.

import { slugify } from "./slug.mjs";

// ---- THE inline anchor marker (G22) -------------------------------------------------------
// A list item or paragraph MAY end with `[anchor: <slug>]` — a position-independent identity that
// TRAVELS WITH THE PROSE. A positional anchor (`<section>#<ordinal>`) moves when a block is inserted
// before it or the list is reordered, so a reorder reads as delete-and-recreate; a declared slug
// does not. The marker is METADATA: it is lifted off before any label, text or fingerprint is taken,
// and it is one grammar for the concept map (spine.mjs) and the deliverables (claims.mjs) so both
// sides of an objective strip exactly the same thing. Slugs are lowercase `[a-z0-9-]`.
export const ANCHOR_MARKER = /[ \t]*\[anchor:\s*([A-Za-z0-9][A-Za-z0-9-]*)\s*\][ \t]*$/;
/** Split a trailing `[anchor: slug]` off `text`: `{text, slug}` (slug null when absent). */
export function splitAnchorMarker(text) {
  const t = String(text ?? "");
  const m = ANCHOR_MARKER.exec(t);
  if (!m) return { text: t, slug: null };
  return { text: t.slice(0, m.index).trimEnd(), slug: m[1].toLowerCase() };
}

// ---- THE label matcher (W14) ---------------------------------------------------------------
// "Does this label occur here, as a whole word?" was implemented four times (M2, M6 twice, M9),
// none exported — four places able to disagree, silently, about whether a term is mentioned.
// It lives here because the term registry is the only authority on what a label IS. Boundary
// class: alphanumerics (so `pre-melting point` and `melting point.` both match; `_` is a boundary,
// as it was for three of the four copies). Case-insensitive. Cached per (label, flags).
const LABEL_BOUNDARY = "A-Za-z0-9";
const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const labelMatchers = new Map();
/**
 * A cached RegExp matching `label` as a whole word, case-insensitively. `flags` may add `g`.
 * @param {string} label
 * @param {string} [flags="i"]
 */
export function labelMatcher(label, flags = "i") {
  const key = `${flags}\u0000${label}`;
  let re = labelMatchers.get(key);
  if (!re) {
    re = new RegExp(`(?<![${LABEL_BOUNDARY}])${escapeRegExp(label)}(?![${LABEL_BOUNDARY}])`, flags);
    labelMatchers.set(key, re);
  }
  return re;
}
/**
 * Every whole-word occurrence of `label` in `text`, as `{start, end, surface}` in JS string
 * indices — the offsets M9 splices at. Same boundary rule as `labelMatcher`, so what M2 counts as
 * a mention is exactly what M9 will rename and what M6 compares.
 */
export function findLabelOccurrences(text, label) {
  const out = [];
  const hay = String(text ?? "");
  const needle = String(label ?? "");
  if (!hay || !needle) return out;
  const re = labelMatcher(needle, "gi");
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(hay)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, surface: m[0] });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

const SCHEMA_VERSION = 1;

/**
 * The section that carries the vocabulary (interfaces §1). Every other section
 * (`## Objectives`, `## Concept sequence`, `## Prerequisites`, `## Misconceptions to
 * surface`) yields concept/objective/misconception nodes, which are NOT terms and have no
 * home in terms.schema.json — they belong to M2/M5. Unknown sections are ignored, not errors.
 */
const KEY_TERMS = "key terms";

/** Fold a label to its resolution key: case-insensitive, whitespace-collapsed. */
function normalizeLabel(label) {
  return String(label ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Split a markdown document into `## Section` buckets, keyed by lowercased heading text.
 * Generic on purpose: the parse convention is shared across the concept-map sections, and
 * being tolerant here is what makes a missing section a non-event.
 * EXPORTED (additive, 2026-07-17) for M13 (`lib/spine.mjs`): the spine producer reads the map's
 * OTHER sections (`## Objectives`, `## Concept sequence`, `## Misconceptions to surface`) from
 * the same document this module reads `## Key terms` from. A second sectioniser would be
 * interfaces §5d — one fact (what this document's sections ARE) derived in two places — and the
 * two would drift the day a heading convention changes. One document, one section splitter.
 *
 * @param {string} text
 * @returns {Map<string, string[]>} heading (lowercased) -> its body lines
 */
export function parseSections(text) {
  const sections = new Map();
  let current = null;
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const heading = /^#{1,6}\s+(.*?)\s*$/.exec(rawLine);
    if (heading) {
      const name = normalizeLabel(heading[1]);
      // A repeated heading appends rather than clobbers — tolerance over strictness.
      if (!sections.has(name)) sections.set(name, []);
      current = sections.get(name);
      continue;
    }
    if (current) current.push(rawLine);
  }
  return sections;
}

/** Body lines of a section, or [] when absent/unknown. The tolerance contract, in one place. */
function sectionLines(sections, name) {
  return sections.get(name) ?? [];
}

/**
 * Unordered/ordered list items ("- x", "* x", "1. x"), trimmed. Non-items ignored.
 * EXPORTED (additive, 2026-07-17) for M13, for the same reason as `parseSections`: every
 * node-bearing section of the concept map is a LIST, and the list grammar is one fact about one
 * document. Two readers of it is §5d, and "- " vs "* " vs "1)" is exactly the kind of detail two
 * copies stop agreeing on.
 */
export function listItems(lines) {
  const out = [];
  for (const line of lines) {
    const m = /^\s*(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

/**
 * A trailing `[concept.x]` / `[objective.x]` bracket = the term's spineRef (interfaces §1).
 * Only those two id namespaces are accepted — any other bracket is prose or a markdown link
 * and is left alone, because a spineRef we cannot vouch for is worse than none.
 */
const SPINE_REF = /\s*\[((?:concept|objective)\.[^\]\s]+)\]\s*$/;

/**
 * Parse one `## Key terms` entry.
 *   - **<preferredLabel>** (<alias>, <alias>) — <gloss> [<spineRef>]
 * Bold run = preferredLabel (REQUIRED — a line without one is not a term declaration and is
 * skipped). Optional parenthetical = aliases, with an `aliases:` prefix accepted and
 * stripped. Optional `—`/`–`/`--` gloss. Optional trailing `[concept.x]`/`[objective.x]` =
 * spineRef. Everything else ignored (interfaces §1). Each part is independent, so any
 * combination parses — including a bare `- **Cas9**` and a label with only a bracket.
 * @returns {{preferredLabel:string, aliases:string[], gloss:string|null, spineRef:string|null}|null}
 */
function parseKeyTerm(item) {
  const m = /^\*\*\s*(.+?)\s*\*\*\s*(.*)$/.exec(item);
  if (!m) return null;
  const preferredLabel = m[1].trim();
  if (!preferredLabel) return null;

  let rest = m[2].trim();
  let aliases = [];

  // Lift the spineRef off the tail FIRST, so it never leaks into the gloss text.
  let spineRef = null;
  const bracket = SPINE_REF.exec(rest);
  if (bracket) {
    spineRef = bracket[1];
    rest = rest.slice(0, bracket.index).trim();
  }

  const paren = /^\(([^)]*)\)\s*(.*)$/.exec(rest);
  if (paren) {
    aliases = paren[1]
      .split(",")
      // The `aliases:` prefix is a courtesy label, not data. Real maps write it both at the
      // head of the list and (mid-list) before the first true alias — strip it wherever it lands.
      .map((a) => a.replace(/^\s*aliases?\s*:\s*/i, "").trim())
      .filter(Boolean);
    rest = paren[2].trim();
  }

  const gloss = /^(?:—|–|--)\s*(.*\S)?\s*$/.exec(rest);
  return {
    preferredLabel,
    aliases,
    gloss: gloss && gloss[1] ? gloss[1].trim() : null,
    spineRef,
  };
}

/** Deduplicate while preserving first-seen order, comparing case-insensitively. */
function uniqueLabels(labels) {
  const seen = new Set();
  const out = [];
  for (const label of labels) {
    const key = normalizeLabel(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/**
 * Mint a term id, `term.<slug(preferredLabel)>` (interfaces §2). Two DIFFERENT terms whose
 * labels slug identically would otherwise collide into one node and silently merge their
 * claims, so a genuine collision gets a numeric suffix (the `assignSlugs` convention).
 */
function mintId(preferredLabel, takenIds) {
  const base = `term.${slugify(preferredLabel, "term")}`;
  if (!takenIds.has(base)) return base;
  let n = 2;
  while (takenIds.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Every label a term answers to: its preferred label plus every alias. */
function labelsOf(term) {
  return [term.preferredLabel, ...(term.aliases ?? [])];
}

/**
 * Every term that answers to `label` in `scope`, in `resolve`'s own precedence order.
 *
 * `resolve` is a PROJECTION of this (it takes the first). They are one implementation on purpose:
 * the rename resolution below must ask "how many prior terms does this entry overlap?" — a question
 * whose answer decides whether an id is inherited or an ambiguity is refused — and `resolve` answers
 * only "which one wins the tie". A second copy of the scope rule would be interfaces §5d: one fact
 * (what this label means here) derived in two places, silently agreeing right up until it didn't.
 *
 * The precedence is the scope rule: a term declared IN the scope wins; else a course-wide/unscoped
 * term (a course-level term applies everywhere); else nothing — a term declared ONLY in another
 * chapter is not this chapter's term, which is the homograph rule earning its keep.
 */
function candidatesFor(terms, label, scope) {
  const key = normalizeLabel(label);
  if (!key) return [];
  const matches = (terms?.terms ?? []).filter((t) => labelsOf(t).some((l) => normalizeLabel(l) === key));
  if (matches.length === 0) return [];
  if (scope === undefined || scope === null || scope === "") return matches;

  const inScope = matches.filter((t) => (t.scope ?? []).includes(String(scope)));
  if (inScope.length > 0) return inScope;
  return matches.filter((t) => {
    const s = t.scope ?? [];
    return s.length === 0 || s.includes("course");
  });
}

/** Structural clone of a TERMS object — every export returns a fresh value, never a mutation. */
function cloneTerms(terms) {
  return {
    schemaVersion: terms?.schemaVersion ?? SCHEMA_VERSION,
    ...(terms?.generatedFrom ? { generatedFrom: [...terms.generatedFrom] } : {}),
    terms: (terms?.terms ?? []).map((t) => ({
      ...t,
      ...(t.aliases ? { aliases: [...t.aliases] } : {}),
      ...(t.scope ? { scope: [...t.scope] } : {}),
    })),
  };
}

/**
 * Every `## Key terms` DECLARATION in the maps, grouped by canonical (the merge key this module
 * has always used).
 *
 * The same term may be declared in several maps (a course-wide term restated in a chapter): those
 * are ONE group — labels, scopes and gloss union together, first declaration wins for the preferred
 * label and the gloss/spineRef — because a term id must mean one thing package-wide.
 *
 * `labels` carries the preferred label FIRST and then the aliases, in first-seen order. That is the
 * projection §2's rename rule is stated over ("label set = preferred + aliases"), and keeping it as
 * one ordered list is what lets the record below derive `aliases` by simply removing whichever label
 * ends up preferred — which is exactly `setPreferred`'s add-alias rule, arrived at from the map.
 */
function collectGroups(maps) {
  const byCanonical = new Map();
  const groups = [];

  for (const map of maps) {
    const sections = parseSections(map?.text);
    const scope = map?.scope ? String(map.scope) : null;

    for (const item of listItems(sectionLines(sections, KEY_TERMS))) {
      const parsed = parseKeyTerm(item);
      if (!parsed) continue; // not a term declaration — ignored, never fatal

      const canonical = normalizeLabel(parsed.preferredLabel);
      if (!canonical) continue;

      let group = byCanonical.get(canonical);
      if (!group) {
        group = {
          canonical,
          preferredLabel: parsed.preferredLabel,
          labels: [],
          scopes: [],
          gloss: null,
          spineRef: null,
        };
        byCanonical.set(canonical, group);
        groups.push(group);
      }

      group.labels = uniqueLabels([...group.labels, parsed.preferredLabel, ...parsed.aliases]);
      // First declaration wins for gloss and spineRef: re-declaring a course term in a
      // chapter must not silently re-parent it.
      if (parsed.gloss && !group.gloss) group.gloss = parsed.gloss;
      if (parsed.spineRef && !group.spineRef) group.spineRef = parsed.spineRef;
      if (scope && !group.scopes.includes(scope)) group.scopes.push(scope);
    }
  }
  return groups;
}

/** The prior terms this group's LABEL SET overlaps, within the group's own scopes (§2's rule). */
function priorCandidates(priorTerms, group) {
  const ids = new Set();
  // An unscoped map asks the scope-blind question, exactly as `resolve(terms, label)` does.
  const scopes = group.scopes.length > 0 ? group.scopes : [null];
  for (const scope of scopes) {
    for (const label of group.labels) {
      for (const t of candidatesFor(priorTerms, label, scope)) ids.add(t.id);
    }
  }
  return [...ids].sort();
}

const canonicalOf = (term) => normalizeLabel(term?.canonical ?? term?.preferredLabel);

/** Do these groups all declare at least one label in common with each other? */
function mutuallyOverlapping(groups) {
  const keys = groups.map((g) => new Set(g.labels.map(normalizeLabel)));
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      if (![...keys[i]].some((k) => keys[j].has(k))) return false;
    }
  }
  return true;
}

/**
 * Assign an id to every group: inherited from `priorTerms` where §2's rule resolves, minted where it
 * does not, refused where it is ambiguous.
 *
 * Returns records in FIRST-SEEN group order (byte-stability), each `{id, groups[], preferredLabel}`.
 * Ambiguities are pushed onto `ambiguous` — a FIELD, never prose (§5c): the caller must be able to
 * report a refusal without regexing a sentence, and a refusal reported by ABSENCE is the silence
 * §5b's declaration-refusal row exists to close.
 */
function planRecords(groups, priorTerms, ambiguous) {
  const prior = priorTerms === undefined || priorTerms === null ? [] : priorTerms.terms ?? [];
  const priorById = new Map(prior.map((t) => [t.id, t]));
  const claimedBy = new Map(); // prior id -> the groups that overlap exactly it

  for (const group of groups) {
    if (prior.length === 0) continue; // first build: nothing to inherit, everything is minted
    const candidates = priorCandidates(priorTerms, group);
    if (candidates.length === 0) continue; // a genuinely NEW term — mint below
    if (candidates.length > 1) {
      // §2: a silent merge of two concepts is worse than a missed rename. Refuse, report, mint fresh.
      ambiguous.push({
        preferredLabel: group.preferredLabel,
        scopes: [...group.scopes],
        candidates,
        reason:
          `"${group.preferredLabel}" overlaps ${candidates.length} prior terms (${candidates.join(", ")}), ` +
          "so which one it continues cannot be known from the map. Refused: a fresh id is minted and " +
          "the rename (if any) is reported as a remove + an add rather than guessed.",
      });
      continue;
    }
    const id = candidates[0];
    if (!claimedBy.has(id)) claimedBy.set(id, []);
    claimedBy.get(id).push(group);
  }

  const idByGroup = new Map();
  const preferredById = new Map();

  for (const [id, claimants] of claimedBy) {
    if (claimants.length === 1) {
      idByGroup.set(claimants[0], id);
      continue;
    }
    // TWO OR MORE GROUPS OVERLAP ONE PRIOR TERM. The map itself says which it is, and the two
    // readings are opposite, so neither may be assumed:
    //   * the groups share a label => the map declares them to be ONE term under two preferred
    //     labels (the fixture's case: a rename made in the chapter map while the course map still
    //     declares the old label). One node, one id, and the label the map MOVED to wins — see below.
    //   * the groups share no label => the map declares them to be TWO terms that both descend from
    //     one prior term: a SPLIT. Merging them would be the silent merge §2 forbids, so only the
    //     group still carrying the prior's own preferred label continues its identity; the other is
    //     a new term. If none carries it, nothing distinguishes the claimants and we refuse.
    const priorCanonical = canonicalOf(priorById.get(id));
    if (mutuallyOverlapping(claimants)) {
      const moved = claimants.filter((g) => g.canonical !== priorCanonical);
      if (moved.length > 1) {
        ambiguous.push({
          preferredLabel: claimants.map((g) => g.preferredLabel).join(" | "),
          scopes: [...new Set(claimants.flatMap((g) => g.scopes))],
          candidates: [id],
          reason:
            `${id} is declared with ${moved.length} competing new preferred labels ` +
            `(${moved.map((g) => `"${g.preferredLabel}"`).join(", ")}), so the rename target cannot be ` +
            "known from the map. Refused: fresh ids are minted and the change is reported as removes + adds.",
        });
        continue;
      }
      // The prior label is the status quo; a declaration that DIFFERS from it is the new information.
      // Order-independent on purpose — reading it off file order would make an id depend on a
      // filename, and `concepts/course.md` sorts before every chapter by accident, not by authority.
      for (const g of claimants) idByGroup.set(g, id);
      preferredById.set(id, (moved[0] ?? claimants[0]).preferredLabel);
      continue;
    }
    const continuing = claimants.filter((g) => g.canonical === priorCanonical);
    if (continuing.length === 1) {
      idByGroup.set(continuing[0], id);
      continue;
    }
    ambiguous.push({
      preferredLabel: claimants.map((g) => g.preferredLabel).join(" | "),
      scopes: [...new Set(claimants.flatMap((g) => g.scopes))],
      candidates: [id],
      reason:
        `${id} is claimed by ${claimants.length} unrelated declarations ` +
        `(${claimants.map((g) => `"${g.preferredLabel}"`).join(", ")}) and none of them still carries its ` +
        "preferred label, so which one continues it cannot be known from the map. Refused: fresh ids are minted.",
    });
  }

  // MINT for everything left. `takenIds` is seeded with EVERY prior id, not just the inherited ones:
  // an id is RETIRED, never recycled. Handing a retired term's id to an unrelated new term would
  // leave M2's `identityLabel` unmoved while the vocabulary underneath it changed meaning — a silent
  // merge across time, which is the §2 failure with a longer fuse.
  const takenIds = new Set([...priorById.keys(), ...idByGroup.values()]);
  for (const group of groups) {
    if (idByGroup.has(group)) continue;
    const id = mintId(group.preferredLabel, takenIds);
    takenIds.add(id);
    idByGroup.set(group, id);
  }

  const records = [];
  const byId = new Map();
  for (const group of groups) {
    const id = idByGroup.get(group);
    let record = byId.get(id);
    if (!record) {
      record = { id, groups: [] };
      byId.set(id, record);
      records.push(record);
    }
    record.groups.push(group);
  }
  for (const record of records) {
    record.preferredLabel = preferredById.get(record.id) ?? record.groups[0].preferredLabel;
  }
  return records;
}

/**
 * Build the term registry from concept maps, AND report what could not be resolved.
 *
 * `buildTerms` is the SURVIVORS PROJECTION of this — the same shape as M12's
 * `declaredProvenanceReport`/`declaredProvenance` pair, and for the same reason: a refusal that is
 * reported only by absence is indistinguishable from "there was nothing to resolve". The registry
 * itself cannot carry the report (`terms.schema.json` is `additionalProperties: false`, correctly —
 * an ambiguity is not part of the projection), so it rides the envelope, exactly as M14's
 * `warnings[]` does.
 *
 * @param {Array<{file:string, text:string, scope?:string}>} conceptMaps concept-map sources
 * @param {object} [priorTerms] the STORED TERMS.json (M14) — see §2. Absent = FIRST BUILD.
 * @returns {{terms:object, ambiguous:Array<{preferredLabel:string, scopes:string[],
 *   candidates:string[], reason:string}>}}
 */
export function buildTermsReport(conceptMaps, priorTerms) {
  const maps = Array.isArray(conceptMaps) ? conceptMaps : [];
  const ambiguous = [];
  const records = planRecords(collectGroups(maps), priorTerms, ambiguous);

  // Key order is fixed so the serialized file is byte-stable across runs.
  const terms = records.map((record) => {
    const groups = record.groups;
    const canonical = normalizeLabel(record.preferredLabel);
    // EVERY label the map declares for this term, minus whichever one is preferred — so a label the
    // map still declares is never dropped. When a rename lands, the old preferred label is demoted
    // to an alias here for the same reason `setPreferred` demotes it: legacy occurrences must keep
    // resolving. The map is the authority for labels; the prior supplies ONLY the id.
    const aliases = uniqueLabels(groups.flatMap((g) => g.labels)).filter(
      (a) => normalizeLabel(a) !== canonical,
    );
    const gloss = groups.map((g) => g.gloss).find((g) => g) ?? null;
    const spineRef = groups.map((g) => g.spineRef).find((s) => s) ?? null;
    return {
      id: record.id,
      canonical,
      preferredLabel: record.preferredLabel,
      aliases,
      status: "confirmed",
      lifecycle: "active",
      ...(spineRef ? { spineRef } : {}),
      ...(gloss ? { gloss } : {}),
      scope: [...new Set(groups.flatMap((g) => g.scopes))],
    };
  });

  return {
    terms: {
      schemaVersion: SCHEMA_VERSION,
      generatedFrom: maps.map((m) => String(m?.file ?? "")),
      terms,
    },
    ambiguous,
  };
}

/**
 * Build the term registry from concept maps.
 *
 * The same term may be declared in several maps (a course-wide term restated in a chapter):
 * those are ONE node — aliases, scopes and gloss union together, first declaration wins for
 * the preferred label — because a term id must mean one thing package-wide.
 *
 * @param {Array<{file:string, text:string, scope?:string}>} conceptMaps concept-map sources
 * @param {object} [priorTerms] the STORED TERMS.json (M14) — what makes the id RENAME-INVARIANT
 *   (interfaces §2/§3). Omit it ONLY for a first build: a caller that has a stored registry and
 *   does not pass it silently re-mints every renamed term's id and the rename becomes invisible
 *   (measured: 3 added + 3 removed where §4 promises 3 matched).
 * @returns {{schemaVersion:number, generatedFrom:string[], terms:Array<object>}} TERMS,
 *   conforming to `system/schemas/package/terms.schema.json`. Every entry is
 *   `status:"confirmed"` — being in the map IS the instructor's authorization — and
 *   `lifecycle:"active"`; the grammar has no lifecycle marker, so a term is retired to
 *   `deprecated-but-teach`/`superseded` by a later edit, never by this parser.
 */
export function buildTerms(conceptMaps, priorTerms) {
  return buildTermsReport(conceptMaps, priorTerms).terms;
}

/**
 * Resolve a label (or alias) to its term id.
 *
 * Case-insensitive and alias-aware, because the whole point is that "Ethylene", "ethylene"
 * and "ethene" are one node. Scope-aware, because two chapters may legitimately use one
 * word for different things: a scoped query prefers a term declared in that scope, then
 * falls back to unscoped/course-wide terms (a course-level term applies everywhere). A term
 * declared ONLY in another chapter does not resolve — that is the scope rule earning its keep.
 *
 * Resolves regardless of `status` and `lifecycle`: a `candidate` must resolve or the
 * consistency scan cannot see it before authorization, and a `deprecated-but-teach` term
 * must resolve or legacy occurrences break — which is the whole reason its old label is kept.
 *
 * SCOPE-TIE RULE: when several terms match a label within the SAME scope, the first in
 * document order wins. Deterministic, but arbitrary — it is a tie-break, not a judgement. A
 * true homograph (one word, two meanings, one scope) cannot be told apart from a label alone;
 * disambiguating it needs the claim's context and belongs to M2, not here.
 *
 * A PROJECTION of `candidatesFor` (it takes the first — that IS the tie-break above), and one
 * implementation on purpose: §2's rename rule needs to know HOW MANY terms a label set overlaps,
 * because an ambiguity must be refused rather than tie-broken. Same scope rule, one home (§5d).
 *
 * @param {object} terms TERMS object
 * @param {string} label the surface form found in text
 * @param {string} [scope] the scope to resolve within (e.g. "chapter-3"); omit for any scope
 * @returns {string|null} the term id, or null when nothing matches
 */
export function resolve(terms, label, scope) {
  return candidatesFor(terms, label, scope)[0]?.id ?? null;
}

/**
 * Register a term found in prose but absent from the concept map.
 *
 * `status:"candidate"` is the honest middle state (spec §10 decision 3): usable by
 * fingerprints and the consistency scan IMMEDIATELY — detection from day one — while
 * flagged as not instructor-authorized. It is NEVER promoted to "confirmed" here; promotion
 * happens by proposing a concept-map revision at a review gate and REGENERATING this file
 * from the map. Idempotent: a label that already resolves in scope returns the registry
 * unchanged, so a scan can call this on every hit.
 *
 * @param {object} terms TERMS object
 * @param {string} label the label to register
 * @param {string} [scope] the scope it was found in
 * @returns {object} a new TERMS object
 */
export function addCandidate(terms, label, scope) {
  const next = cloneTerms(terms);
  const preferredLabel = String(label ?? "").replace(/\s+/g, " ").trim();
  if (!preferredLabel) return next;
  if (resolve(next, preferredLabel, scope)) return next;

  const takenIds = new Set(next.terms.map((t) => t.id));
  next.terms.push({
    id: mintId(preferredLabel, takenIds),
    canonical: normalizeLabel(preferredLabel),
    preferredLabel,
    aliases: [],
    status: "candidate",
    lifecycle: "active",
    // No spineRef: an off-map term has no authorized placement yet. That is precisely what
    // the Q3 flow asks the instructor to decide, and what the bracket then records.
    scope: scope ? [String(scope)] : [],
  });
  return next;
}

/**
 * Rename a term: RENAME = add-alias + set-preferred.
 *
 * THE OLD LABEL IS NEVER DELETED. It becomes an alias and stays a recognized synonym
 * forever — legacy occurrences must keep resolving, and students still meet the old word in
 * the literature (spec §6.3). The id is NOT re-minted either, so claim identity survives the
 * rename and only the `label` fingerprint moves (interfaces §4). If `newLabel` was already
 * an alias, it is promoted out of the alias list rather than duplicated.
 *
 * @param {object} terms TERMS object
 * @param {string} termId the term to rename
 * @param {string} newLabel the new preferred label
 * @returns {object} a new TERMS object (unchanged if termId is unknown or newLabel is empty)
 */
export function setPreferred(terms, termId, newLabel) {
  const next = cloneTerms(terms);
  const preferredLabel = String(newLabel ?? "").replace(/\s+/g, " ").trim();
  if (!preferredLabel) return next;

  const term = next.terms.find((t) => t.id === termId);
  if (!term) return next;
  if (normalizeLabel(term.preferredLabel) === normalizeLabel(preferredLabel)) return next;

  const oldLabel = term.preferredLabel;
  term.preferredLabel = preferredLabel;
  term.canonical = normalizeLabel(preferredLabel);
  term.aliases = uniqueLabels([...(term.aliases ?? []), oldLabel]).filter(
    (a) => normalizeLabel(a) !== term.canonical,
  );
  return next;
}
