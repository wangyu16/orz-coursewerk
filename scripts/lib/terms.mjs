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
 * Build the term registry from concept maps.
 *
 * The same term may be declared in several maps (a course-wide term restated in a chapter):
 * those are ONE node — aliases, scopes and gloss union together, first declaration wins for
 * the preferred label — because a term id must mean one thing package-wide.
 *
 * @param {Array<{file:string, text:string, scope?:string}>} conceptMaps concept-map sources
 * @returns {{schemaVersion:number, generatedFrom:string[], terms:Array<object>}} TERMS,
 *   conforming to `system/schemas/package/terms.schema.json`. Every entry is
 *   `status:"confirmed"` — being in the map IS the instructor's authorization — and
 *   `lifecycle:"active"`; the grammar has no lifecycle marker, so a term is retired to
 *   `deprecated-but-teach`/`superseded` by a later edit, never by this parser.
 */
export function buildTerms(conceptMaps) {
  const maps = Array.isArray(conceptMaps) ? conceptMaps : [];
  const byCanonical = new Map(); // canonical -> term record (the merge key)
  const takenIds = new Set();

  for (const map of maps) {
    const sections = parseSections(map?.text);
    const scope = map?.scope ? String(map.scope) : null;

    for (const item of listItems(sectionLines(sections, KEY_TERMS))) {
      const parsed = parseKeyTerm(item);
      if (!parsed) continue; // not a term declaration — ignored, never fatal

      const canonical = normalizeLabel(parsed.preferredLabel);
      if (!canonical) continue;

      let term = byCanonical.get(canonical);
      if (!term) {
        const id = mintId(parsed.preferredLabel, takenIds);
        takenIds.add(id);
        term = {
          id,
          canonical,
          preferredLabel: parsed.preferredLabel,
          aliases: [],
          status: "confirmed",
          lifecycle: "active",
          scope: [],
        };
        byCanonical.set(canonical, term);
      }

      term.aliases = uniqueLabels([...term.aliases, ...parsed.aliases]).filter(
        (a) => normalizeLabel(a) !== term.canonical,
      );
      // First declaration wins for gloss and spineRef: re-declaring a course term in a
      // chapter must not silently re-parent it.
      if (parsed.gloss && !term.gloss) term.gloss = parsed.gloss;
      if (parsed.spineRef && !term.spineRef) term.spineRef = parsed.spineRef;
      if (scope && !term.scope.includes(scope)) term.scope.push(scope);
    }
  }

  // Key order is fixed so the serialized file is byte-stable across runs.
  const terms = [...byCanonical.values()].map((t) => ({
    id: t.id,
    canonical: t.canonical,
    preferredLabel: t.preferredLabel,
    aliases: t.aliases,
    status: t.status,
    lifecycle: t.lifecycle,
    ...(t.spineRef ? { spineRef: t.spineRef } : {}),
    ...(t.gloss ? { gloss: t.gloss } : {}),
    scope: t.scope,
  }));

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedFrom: maps.map((m) => String(m?.file ?? "")),
    terms,
  };
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
 * @param {object} terms TERMS object
 * @param {string} label the surface form found in text
 * @param {string} [scope] the scope to resolve within (e.g. "chapter-3"); omit for any scope
 * @returns {string|null} the term id, or null when nothing matches
 */
export function resolve(terms, label, scope) {
  const key = normalizeLabel(label);
  if (!key) return null;

  const matches = (terms?.terms ?? []).filter((t) =>
    labelsOf(t).some((l) => normalizeLabel(l) === key),
  );
  if (matches.length === 0) return null;
  if (scope === undefined || scope === null || scope === "") return matches[0].id;

  const inScope = matches.find((t) => (t.scope ?? []).includes(String(scope)));
  if (inScope) return inScope.id;

  const global = matches.find((t) => {
    const s = t.scope ?? [];
    return s.length === 0 || s.includes("course");
  });
  return global ? global.id : null;
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
