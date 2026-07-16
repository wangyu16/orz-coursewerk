// Claim extraction + claim identity (M2) — THE PRODUCER OF THE CLAIM RECORD.
//
// Why this exists
// ---------------
// The course-package index's second defect (spec §0) is GRANULARITY: one component per FILE, so
// a one-fact edit dirties a whole file and everything downstream of it. The fix is to stop
// pretending a file is a unit of meaning and index the ASSERTIONS inside it. This module mints
// those assertions.
//
// Everything downstream reads what is minted here — M3 hashes it, M4 classifies the hashes, M5
// walks the graph, M6 scans it for self-contradiction, M9 propagates through it, M10 queues it
// for a human. So a field this module gets wrong is not a local bug: it is a wrong answer that
// four other modules will faithfully repeat, with the index's authority attached.
//
// DECLARED-FIRST, and the scan is a BACKSTOP — not a peer (spec §1, §10 decision 1)
// ---------------------------------------------------------------------------------
// A DECLARATION is the generator saying, structurally and at write time, "this block is a fact,
// it hangs off objective.phase-change.1, it comes from src.wiki.melting.rev1". That is an
// authored fact. Nothing here may overrule it, and a declared anchor is never re-minted by the
// scan (see `extractClaims`).
//
// The SCAN exists for one reason: an UNDECLARED claim must be INDEXED AND VISIBLE rather than
// invisible. Spec §10 decision 1 settled the burden — declaration is required only for the
// high-stakes claim types, the gate enforces PRESENCE not perfection, and a scan-found claim is
// "index + WARN, never hard-fail", because hard-failing every miss recreates the fabrication
// incentive the whole design exists to remove. `provenanceDeclared` carries that distinction to
// M11, and it is the ONLY thing that distinguishes the two paths: a scan-found claim is a
// first-class claim in every other respect. It is worse to know about a claim and not index it
// than to index it with a warning.
//
// WHAT THE SCAN REFUSES TO DO, and why the refusals are the design
// ----------------------------------------------------------------
// The scan recognizes STRUCTURE. It never interprets prose. Three refusals in particular:
//
//   1. IT NEVER INVENTS A `spineRefs`. A scan-found claim gets `spineRefs: []`. The temptation is
//      obvious and wrong: the study guide restates `## Objectives` as an ordered list, the concept
//      map mints `objective.<chapter>.<n>` from ITS ordered list, so item n "obviously" maps to
//      objective n. It does not. The guide may reorder, subset, or merge them, and then item 2 is
//      confidently attributed to objective 2 and M5's orphan analysis trusts a link nobody
//      authored. This is exactly the fabrication interfaces §1 forbids for a term's spineRef,
//      wearing a different hat. No parent is honest; a guessed parent is a fabrication in a
//      deterministic costume. An orphan claim is a thing M11 already knows how to flag.
//   2. IT NEVER INFERS A DEFINITION. "X is the temperature at which…" is a definition; "X is
//      hard to measure" is not; telling them apart is parsing, and a wrong parse is worse than no
//      parse. `definition` therefore only ever arrives DECLARED. Accepted cost, stated plainly: an
//      undeclared definition is unindexed, so M6's definition-drift detector sees only declared
//      definitions. The fix for that is a declaration (M12), not a heuristic here.
//   3. IT NEVER GUESSES A TYPE. An unrecognized declared `type` is skipped rather than coerced to
//      the nearest enum member: claims.schema.json's enum is closed, and coercing would emit a
//      claim asserting a type nobody chose.
//
// So the scan mints exactly three types, each from a STRUCTURAL marker, never from meaning:
//   answer-key — an `**Answer:**` marker (a convention, not an interpretation)
//   objective  — a list item under an `## Objectives` heading (a section, not a reading)
//   fact       — a block carrying a QUANTITY (a number bound to a recognized unit). Spec §10
//                decision 1's headline high-stakes class: "facts with values/quantities".
// Connective prose carries no duty and is deliberately unindexed (spec §10 decision 1's accepted
// cost; the decoupled reviewer covers it, not the graph).
//
// `scope` — DERIVED ONCE, HERE, AND NEVER AGAIN (interfaces §4a)
// --------------------------------------------------------------
// This is the single most load-bearing thing in the file. `scope` selects which term an ambiguous
// label resolves to (M1's chapter-local homograph rule), so it decides what a claim is ABOUT.
// M6 derived it from `spineRefs`; M3 was about to derive it from `locations[0].file`. Both
// defensible — which is precisely the danger. Two derivations of one fact are two modules able to
// disagree, silently, about a claim's subject: this index reproducing, inside itself, the exact
// defect class it exists to catch. Convergent need across two consumers means the fact belongs to
// the DATA. So it is a REQUIRED field, M2 derives it, and everyone else READS it.
//
// The frozen tiers (§4a), implemented verbatim in `deriveScope`:
//   1. the first `spineRefs` entry matching `^(concept|objective)\.(?<scope>[^.]+)\.` wins — the
//      spine is the INSTRUCTOR'S OWN STRUCTURE, so it outranks file placement. A claim whose
//      locations span chapters therefore keeps the spine's scope, not the first file's.
//   2. else `locations[0].file` mapped through the concept-map file convention.
//   3. else `null` — which MEANS package-wide. It is an answer, not an absence, which is why
//      consumers must branch on `"scope" in claim` and never on truthiness.
//
// Tier 2 asks the PACKAGE which slugs are chapters (`concepts/<slug>.md`, per interfaces §1)
// rather than trusting any basename, and this is deliberate. A basename that is not a chapter is
// not a chapter, and saying so costs nothing; inventing `scope:"appendix"` would make every term
// in that file resolve against a scope no concept map ever declared. The rule composes with §1:
// `concepts/course.md` is the COURSE map, not a chapter, so course-level artifacts land on tier 3
// (null = package-wide) — which agrees with M3's documented compatibility fallback, so the
// authority and the fallback cannot drift apart.
//
// A note on how sharp tier 3 is. `null` means "resolve in ANY scope", and M1's unscoped `resolve`
// returns the FIRST like-labelled term declared package-wide — i.e. exactly the homograph coin
// flip the scope rule exists to prevent. `null` is correct for genuinely package-wide text and
// dangerous everywhere else, which is why tier 2 is made as strong as the package allows instead
// of falling through on the first doubt.
//
// `locations[].offset` — DERIVED ONCE, HERE, in M8's units (claims.schema.json, §5d)
// -----------------------------------------------------------------------------------
// The same rule as `scope`, for the same reason, found by M9 instead of M6. M8 indexes immutable
// regions as OFFSETS into a file; a claim carrying only `{file, anchor}` gave `planPropagation`
// nothing to compare them against, so the plan-time immutable check could not run at all — while
// the parameter sitting in M9's signature made it look implemented. That check is what stops a
// rename rewriting the inside of a direct quotation, i.e. FABRICATING A QUOTATION. So the offset
// is data: M2 sets it, M9 reads it, and M9 must NEVER recover it by searching the file for
// `claim.text` — a locator that silently picks the wrong one of two identical sentences.
//
// **UNIT: JS string character index (UTF-16 code units), half-open, into the file text EXACTLY AS
// READ FROM DISK — front matter included.** This matches M8: `immutableRegions(text, sourceText)`
// documents its `Region` as "half-open character interval [start, end) into the ORIGINAL `text`",
// and it indexes with `RegExp.lastIndex`/`String.indexOf`, which are character indices. The
// distinction is not academic here: these are chemistry documents, so `°`, `→` and Greek letters
// are certain, and a byte offset would drift past every one of them. The two modules must be handed
// the same string — the file as read — which is why the offset is NOT relative to the
// front-matter-stripped body this module parses.
//
// THE INVARIANT, which every location that points at a file upholds:
//     fileText.slice(offset, offset + text.length) === text
// It is what makes `text` and `offset` two views of ONE string rather than two facts that can
// disagree.
//
// **`text` IS REQUIRED AND NOT OVERRIDABLE. DO NOT RE-ADD A DECLARED `text` TOLERANCE.** It has
// been tried — here, by this module — and it is a trap, not a convenience. Letting a declaration
// supply its own prose produced claims whose `text` was one string while `offset` addressed
// another: a quotation could sit at the offset while the declared text looked perfectly
// rewritable, so M9 would compare M8's regions against the wrong span and auto-rewrite the inside
// of a quotation. That is the exact failure the offset exists to prevent, delivered by the field
// added to prevent it. The prose is always the block at the anchor; a dangling anchor yields no
// claim. **The general rule: when one fact is stored twice in different representations, an
// "optional override" on one of them is not a convenience — it is a licence for the two to
// disagree.**
//
// IDENTITY (§2, §4, §4b, §5e). Claim identity is `(spineRef + fileQualifiedAnchor +
// identityLabel)`, and the two subtleties are FROZEN IN THE DOC, not decided here — read §4b and
// §5e before touching `identityLabel` or `fileQualifiedAnchor`. In brief: `identityLabel` is the
// rename-INVARIANT hash of sorted term ids and is deliberately NOT M3's rename-VARIANT `label`
// fingerprint (§4b); and the anchor is file-qualified because a bare anchor collides across
// artifacts (§2). Both have a "why" comment at their definition, as §5e requires.
//
// PURE-ENOUGH AND DETERMINISTIC: file reads only (we are given a `root`), and no network, no LLM,
// no clock, no randomness (interfaces §6.1). The same package always yields a byte-identical
// CLAIMS artifact — files are visited in sorted order, claims are emitted in sorted order, and
// every set is sorted before it is hashed. A claim a human acted on must be reproducible from the
// inputs alone, months later, from git; that is not a nicety, it is what makes the flag auditable.
//
// See CONTRACT CONCERNS at the foot of this file for what remains OPEN (the dangling-anchor gap is
// M11's; the three-way unit table is being unified into `lib/units.mjs` separately).

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { slugify } from "./slug.mjs";
import { resolve as resolveTerm } from "./terms.mjs";
import { fingerprints } from "./fingerprint.mjs";

const SCHEMA_VERSION = 1;

/**
 * The folders whose markdown ASSERTS things. `concepts/` is deliberately absent: the concept map
 * is the SPINE and the VOCABULARY (spec §4), and its nodes already live in their own id space
 * (`concept.*`, `objective.*`, `term.*`, per interfaces §2). Minting `claim.*` nodes from it would
 * give the package's own authority a second, competing representation — and then the map could
 * disagree with itself, which is the one thing a single source of truth may not do.
 */
const ARTIFACT_FOLDERS = ["study-guide", "practice", "assessment-support", "slides"];

/** Where the concept maps live (interfaces §1) — tier 2's authority on what a chapter IS. */
const CONCEPTS_DIR = "concepts";

/** `concepts/course.md` is the COURSE map, not a chapter map (interfaces §1). */
const COURSE_MAP = "course";

/** claims.schema.json's closed `type` enum. An unknown type is skipped, never coerced. */
const CLAIM_TYPES = new Set(["fact", "objective", "answer-key", "definition", "derived", "procedure"]);

/** The section (slug) whose list items are objective-coverage claims. */
const OBJECTIVES_SECTION = "objectives";

/** interfaces §4a tier 1 — the spine's scope. The FIRST matching entry wins. */
const SPINE_SCOPE_RE = /^(?:concept|objective)\.([^.]+)\./;

/**
 * The `**Answer:**` marker. A STRUCTURAL convention of the practice deliverable, not a reading of
 * the prose — which is the only kind of signal the scan is allowed to act on.
 */
const ANSWER_RE = /(?:^|[\s|>])\*{0,2}answers?\*{0,2}\s*:/i;

/**
 * Unit surface forms the scan recognizes, LONGEST FIRST so "kJ/mol" wins over "kJ" and "min" over
 * "m". This is a RECOGNIZER, not a conversion table and not a vocabulary: it answers only "is this
 * number bound to a unit", i.e. "is this block asserting a quantity". An unrecognized unit yields
 * no quantity, hence no claim from this rule — silence, not a guess. (A number with no unit is
 * never a quantity: "step 3" and "Chapter 2" are the richest source of spurious hits there is.)
 * See CONTRACT CONCERNS #3 — this is the third unit table in the index.
 */
const SCAN_UNIT_FORMS = [
  "kJ/mol", "J/mol", "kJ/kg", "J/kg", "kJ/g", "J/g",
  "°C", "°F", "℃", "℉", "K",
  "kcal", "kJ", "cal", "J",
  "kg", "mg", "µg", "g",
  "km", "cm", "mm", "nm", "µm", "m",
  "mL", "L", "mmol", "mol",
  "MPa", "kPa", "Pa", "atm", "bar",
  "min", "h", "s", "%",
  "celsius", "fahrenheit", "kelvin", "gram", "grams", "joule", "joules", "percent",
];

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A number bound to a recognized unit. The trailing lookahead stops "g" matching inside "grams"
 * and "J" inside "J/g"; the leading `\d` requirement is what keeps bare integers out.
 */
const QUANTITY_RE = (() => {
  const forms = [...SCAN_UNIT_FORMS]
    .flatMap((f) => (/^[a-z]/.test(f) ? [f, f[0].toUpperCase() + f.slice(1)] : [f]))
    .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
  return new RegExp(
    `(?:-?\\d+(?:\\.\\d+)?)[\\s\\u00A0]*(?:${forms.map(escapeRe).join("|")})(?![A-Za-z0-9/])`,
  );
})();

const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Sorted, de-duplicated string list — the canonical form of every set-shaped field we emit. */
function strSet(list) {
  return [...new Set((Array.isArray(list) ? list : []).map((v) => String(v ?? "")).filter(Boolean))].sort();
}

/** Domain-separated SHA-256, truncated. 48 bits: negligible collision risk at course scale, and
 *  `mintClaimId` guards the residue rather than assuming it away. */
function shortHash(payload) {
  return createHash("sha256").update(`cw.claim.v1\n${payload}`, "utf8").digest("hex").slice(0, 12);
}

// --- reading the package -------------------------------------------------------------------

/** Read a package-relative file, or null. A missing/unreadable file is a non-event, never a crash. */
function readText(root, rel) {
  try {
    return fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
}

/** Sorted markdown files directly under a package folder. Sorted = the artifact is byte-stable. */
function markdownIn(root, folder) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(root, folder), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => `${folder}/${e.name}`)
    .sort(byString);
}

/**
 * The package's CHAPTER slugs, from `concepts/<slug>.md` (interfaces §1) — tier 2's authority.
 * `course` is excluded: it is the course map, not a chapter, and course-level text is package-wide.
 */
function chapterSlugs(root) {
  return new Set(
    markdownIn(root, CONCEPTS_DIR)
      .map((rel) => path.basename(rel, ".md"))
      .filter((slug) => slug !== COURSE_MAP),
  );
}

// --- declarations (M12's half of the seam) --------------------------------------------------

/**
 * Front matter: a `---` fenced block at the very top, whose body is JSON. Structural, stripped by
 * every markdown pipeline, and therefore never student-facing (spec §10 decision 1 forbids inline
 * declaration in prose). JSON rather than YAML because there is no YAML parser here and no new npm
 * dependency is permitted (interfaces §6) — and hand-rolling a YAML subset would be a parser that
 * silently disagrees with every other YAML parser about the one input that matters.
 */
const FRONT_MATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** The artifact's front matter body, or null. */
function frontMatterOf(fileText) {
  const m = FRONT_MATTER_RE.exec(String(fileText ?? ""));
  return m ? m[1] : null;
}

/**
 * How many characters of front matter precede the artifact's body.
 *
 * Blocks are parsed from the body (a declaration is not an assertion, and must never be indexed as
 * one), but `offset` must address the file EXACTLY AS READ — that is the string M8 is handed, and
 * an offset in a different frame of reference is worse than none: it points confidently at the
 * wrong text. So the body is parsed at a known base and every block offset is rebased by it.
 */
function frontMatterLength(fileText) {
  const m = FRONT_MATTER_RE.exec(String(fileText ?? ""));
  return m ? m[0].length : 0;
}

/** A declaration sidecar mirrors the artifact's path under `metadata/claims/` (spec §2: the new
 *  metadata files all live under `metadata/`). */
function sidecarPath(rel) {
  return `metadata/claims/${rel.replace(/\.md$/, "")}.json`;
}

/**
 * Normalize one declaration entry to interfaces §3's frozen M12 shape,
 * `{type, spineRefs, sourceRefs, anchor}`, plus ONE optional field we accept if present:
 * `termRefs`. Optional-and-tolerated is the house extension pattern (unknown keys are ignored; an
 * added optional field is cheap) and it lets a generator that knows a claim's vocabulary say so
 * instead of making us recognize it. Absent, it is derived — see CONTRACT CONCERNS #2.
 *
 * A declaration may NOT supply its own `text`: the claim's prose is whatever stands at its
 * `offset`, always (see the header's invariant and CONTRACT CONCERNS #4). An `anchor` that names
 * no block yields no claim, rather than a claim whose two location facts describe different strings.
 * @returns {object|null} null when the entry is not a usable declaration (no guessing).
 */
function normalizeDeclaration(entry) {
  if (!entry || typeof entry !== "object") return null;
  const type = String(entry.type ?? "");
  if (!CLAIM_TYPES.has(type)) return null; // unknown type: skipped, never coerced
  const anchor = String(entry.anchor ?? "").trim();
  if (!anchor) return null; // nothing to locate: not a declaration
  return {
    type,
    anchor,
    spineRefs: strSet(entry.spineRefs),
    sourceRefs: strSet(entry.sourceRefs),
    termRefs: Array.isArray(entry.termRefs) ? strSet(entry.termRefs) : null,
  };
}

/** Parse a declaration body: `{claims:[…]}` or a bare array. Malformed => [] (tolerant by
 *  contract, interfaces §1: a half-written package yields fewer nodes, never a crash). */
function parseDeclarationBody(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return []; // not JSON: we will not guess at what was meant
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.claims) ? data.claims : [];
  return list.map(normalizeDeclaration).filter(Boolean);
}

/**
 * The declarations for one artifact.
 *
 * PRECEDENCE, declared up front so it is a RULE and not a tie-break: a sidecar, if present, is the
 * artifact's declaration — front matter is not merged into it. One artifact, one declaration
 * authority; unioning two sources would let them disagree about a single anchor and leave this
 * module picking a winner, which is the thing it may never do.
 */
function declarationsFor(root, rel, fileText) {
  const sidecar = readText(root, sidecarPath(rel));
  if (sidecar != null) return parseDeclarationBody(sidecar);
  const fm = frontMatterOf(fileText);
  return fm == null ? [] : parseDeclarationBody(fm);
}

// --- blocks and anchors --------------------------------------------------------------------

/**
 * Split an artifact into ANCHORED BLOCKS: paragraphs, list items and table rows, each keyed
 * `<nearest-heading-slug>#<ordinal-within-that-section>`.
 *
 * The anchor is what `locations[].anchor` carries and what claim identity is matched on (§4), so
 * what it is BLIND to is the whole design: it does not move when the block's prose is rephrased,
 * when a value inside it changes, or when whitespace is reflowed — which is precisely what §4's
 * "rephrase → same id" and "value change → same id" require.
 *
 * KNOWN LIMITATION, stated rather than discovered later: a derived anchor is positional, so it
 * DOES move when a block is inserted before it in its section, or when its heading is retitled
 * (including by the very term rename §4 wants to survive — "## Melting point of water" →
 * "## Fusion point of water" moves the section slug). Then the claim reads as removed+added rather
 * than renamed. There is no positional scheme immune to this, and the fix is not a cleverer
 * heuristic: it is a DECLARED anchor, which M12 authors and which this module treats as
 * authoritative. One more reason declared-first is the design and the scan is the backstop.
 *
 * Each block also carries its exact character offset (see the header's invariant). Offsets are
 * taken by SLICING the source between recorded line boundaries, never by re-joining split lines:
 * a `split(/\r?\n/)` + `join("\n")` round-trip silently loses one character per CRLF line, and the
 * resulting offset would be plausible, wrong, and off by an amount that grows down the file.
 *
 * @param {string} body the artifact text to parse
 * @param {number} base characters preceding `body` in the file, added to every offset so the
 *   result addresses the file as read (M8's frame of reference)
 * @returns {Array<{anchor:string, section:string, text:string, offset:number, isItem:boolean}>}
 *   in document order
 */
function parseBlocks(body, base = 0) {
  const src = String(body ?? "");
  const blocks = [];
  let section = "";
  let ordinal = 0;
  let buf = []; // line spans: {text, start, end}
  let bufIsItem = false;
  let inFence = false;

  const flush = () => {
    const lines = buf;
    const isItem = bufIsItem;
    buf = [];
    bufIsItem = false;
    if (lines.length === 0) return;

    const raw = src.slice(lines[0].start, lines[lines.length - 1].end);
    const text = raw.trim();
    if (!text) return;
    ordinal += 1;
    blocks.push({
      anchor: `${section || "body"}#${ordinal}`,
      section,
      text,
      // trimStart's width is exactly what the leading whitespace cost, so the invariant
      // `src.slice(offset, offset + text.length) === text` holds by construction.
      offset: base + lines[0].start + (raw.length - raw.trimStart().length),
      isItem,
    });
  };

  for (let start = 0; start <= src.length; ) {
    let nl = src.indexOf("\n", start);
    if (nl === -1) nl = src.length;
    const span = { text: src.slice(start, nl).replace(/\r$/, ""), start, end: nl };
    start = nl + 1;
    const { text: line } = span;

    if (/^\s{0,3}(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      buf.push(span);
      continue;
    }
    if (inFence) {
      buf.push(span);
      continue;
    }

    const heading = /^\s{0,3}#{1,6}\s+(.*\S)\s*$/.exec(line);
    if (heading) {
      flush();
      section = slugify(heading[1], "section");
      ordinal = 0; // ordinals are per-section: editing section A cannot move section B's anchors
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
      flush(); // each list item is its own block; its indented continuation lines join it below
      bufIsItem = true;
      buf.push(span);
      continue;
    }

    if (/^\s*\|/.test(line)) {
      flush(); // each table row is its own block
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; // the header separator asserts nothing
      buf.push(span);
      continue;
    }

    buf.push(span);
  }
  flush();
  return blocks;
}

/** Whether a block asserts a quantity (a number bound to a recognized unit). */
const hasQuantity = (text) => QUANTITY_RE.test(text);

/**
 * The scan's type for a block, or null (= not a high-stakes claim; connective prose has no duty).
 * Precedence answer-key > objective > fact, so an objectives item that happens to carry a number
 * is still an objective and an answer that happens to sit in a list is still an answer key.
 * STRUCTURE ONLY: a marker, a section, a unit. Never a reading of the prose.
 */
function scanType(block) {
  if (ANSWER_RE.test(block.text)) return "answer-key";
  if (block.section === OBJECTIVES_SECTION && block.isItem) return "objective";
  if (hasQuantity(block.text)) return "fact";
  return null;
}

// --- scope, terms, identity ------------------------------------------------------------------

/**
 * interfaces §4a, implemented verbatim. See the header for why this lives here and only here.
 * @param {string[]} spineRefs the claim's spine refs, in declaration order (tier 1 is FIRST-match)
 * @param {string} file `locations[0].file` (tier 2)
 * @param {Set<string>} chapters the package's chapter slugs, from `concepts/<slug>.md`
 * @returns {string|null} the scope; `null` MEANS package-wide (tier 3), never "missing"
 */
function deriveScope(spineRefs, file, chapters) {
  for (const ref of spineRefs) {
    const m = SPINE_SCOPE_RE.exec(String(ref));
    if (m) return m[1]; // tier 1 — the instructor's own structure outranks file placement
  }
  const base = path.basename(String(file ?? "")).replace(/\.[^.]+$/, "");
  if (base && chapters.has(base)) return base; // tier 2 — the concept-map file convention
  return null; // tier 3 — package-wide, which is an answer
}

/** Cached whole-word matcher for a term label (lookarounds, not \b: labels may end in punctuation). */
const labelRes = new Map();
function labelRe(label) {
  let re = labelRes.get(label);
  if (!re) {
    re = new RegExp(`(?<![A-Za-z0-9])${escapeRe(label)}(?![A-Za-z0-9])`, "i");
    labelRes.set(label, re);
  }
  return re;
}

/**
 * The registered terms a text mentions, scope-aware, as sorted ids.
 *
 * This is RECOGNITION, not vocabulary authority: every id comes from M1's `resolve`, so aliases
 * collapse onto one node and a chapter-local term does not resolve from another chapter's scope.
 * Recognizing a label the instructor already registered is not a guess — the guess would be
 * inventing a term, which is `addCandidate`'s job and not this module's.
 */
function termRefsInText(text, terms, scope) {
  const ids = new Set();
  for (const term of terms?.terms ?? []) {
    for (const label of [term?.preferredLabel, ...(term?.aliases ?? [])]) {
      if (!label || !labelRe(label).test(text)) continue;
      const id = resolveTerm(terms, label, scope ?? undefined);
      if (id) ids.add(id);
    }
  }
  return [...ids].sort(byString);
}

/**
 * `identityLabel` (interfaces §2, §4, §4b) — the rename-INVARIANT vocabulary projection: the sorted
 * set of TERM IDS. M1 never re-mints an id on a rename (that is *how* identity survives one), and an
 * id is immune to a value change — which is why §4 keys on the vocabulary layer and not `content`.
 *
 * **NOT M3's `label` fingerprint, and the two must never be unified (§4b, §5e).** One projection,
 * two jobs, opposite requirements: an identity key must be rename-INVARIANT (an id must survive the
 * rename); a change signal must be rename-VARIANT (a rename must be observable). M3 hashes
 * `termId + preferredLabel` and is right to; this hashes ids alone and is right to. §5e is the
 * standing freeze-time check that says to compute both, name both, and comment why — precisely so a
 * later tidy-up cannot DRY them back together and silently break whichever one loses. **This
 * comment is that comment. Do not merge them.**
 *
 * Recomputable from a stored claim (`termRefs` is a declared schema field), so `matchClaims` needs
 * nothing this module did not already write down.
 */
const identityLabel = (claim) => strSet(claim?.termRefs).join(",");

/** §4's other key components. `spineRef` is the FIRST entry — the same one §2's id scheme and
 *  §4a's tier 1 select, so the three cannot drift apart. */
const firstSpine = (claim) => strSet(claim?.spineRefs)[0] ?? "";
const claimFile = (claim) => String(claim?.locations?.[0]?.file ?? "");
const claimAnchor = (claim) => String(claim?.locations?.[0]?.anchor ?? "");
// NB: `offset` is deliberately NOT part of identity. It moves whenever ANY text earlier in the
// file is edited, so keying on it would make a rephrase in section 1 delete and re-mint every
// claim in sections 2..n — the mass false-flagging this index exists to end, self-inflicted.

/**
 * `fileQualifiedAnchor` (interfaces §2) — `location.file + "|" + anchor`, **never the bare anchor**.
 * An anchor is unique only WITHIN its artifact: `study-guide/ch3.md` and `practice/ch3.md` both
 * have a `## Objectives`, so the bare anchor collides two distinct claims into ONE id and silently
 * merges them — a granularity defect in the module built to fix granularity defects.
 */
const fileQualifiedAnchor = (claim) => `${claimFile(claim)}|${claimAnchor(claim)}`;

/** §4's match key: (spineRef + fileQualifiedAnchor + identityLabel). Never `content` (that is the
 *  change signal), never M3's `label` fingerprint (§4b). */
const identityKey = (claim) =>
  [firstSpine(claim), fileQualifiedAnchor(claim), identityLabel(claim)].join("|");

/**
 * Mint `claim.<slug(spineRef)>.<shortHash(fileQualifiedAnchor + identityLabel)>` (interfaces §2).
 *
 * An unspined (scan-found) claim has no `<slug(spineRef)>`, so it falls back to its scope and then
 * to `package` — the id must exist even when the parent does not, and refusing to mint would make
 * an undeclared claim INVISIBLE, which is the one thing the backstop exists to prevent.
 *
 * The hash input is the identity key minus the spineRef (which the prefix already carries), so an
 * id and a match are two views of ONE rule: a claim that matches cannot be re-minted differently.
 *
 * The suffix guard is not ceremony: `shortHash` is truncated, so two distinct claims CAN collide
 * at course scale, and a collision would merge two assertions into one node — the same silent
 * merge M1's `mintId` guards against. Rare enough to be invisible; consequential enough to check.
 */
function mintClaimId(claim, takenIds) {
  const prefix = slugify(firstSpine(claim) || claim.scope || "package", "package");
  const base = `claim.${prefix}.${shortHash(`${fileQualifiedAnchor(claim)}|${identityLabel(claim)}`)}`;
  if (!takenIds.has(base)) return base;
  let n = 2;
  while (takenIds.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// --- extraction ------------------------------------------------------------------------------

/** Assemble one claim record from a draft: derive scope, recognize terms, then hash (in that
 *  order — `fingerprints` READS `claim.scope`, so it must already be there). */
function finalizeDraft(draft, terms, chapters, takenIds) {
  const scope = deriveScope(draft.spineRefs, draft.file, chapters);
  const termRefs = draft.termRefs ?? termRefsInText(draft.text, terms, scope);

  const claim = {
    id: "",
    type: draft.type,
    text: draft.text,
    scope, // §4a — derived ONCE, here. Every other module reads this field.
    fingerprints: {},
    spineRefs: draft.spineRefs,
    sourceRefs: draft.sourceRefs,
    termRefs,
    // `offset` accompanies every location that points at real file text — a consumer cannot tell
    // "no offset" from "offset 0", and the safe reading of a missing one is to REFUSE the edit, so
    // omitting it would silently degrade M9 into never auto-applying anything.
    locations: [{ file: draft.file, anchor: draft.anchor, offset: draft.offset }],
    provenanceDeclared: draft.provenanceDeclared,
  };
  claim.fingerprints = fingerprints(claim, terms);
  // Minted from the assembled claim — the same value `matchClaims` will read back from the stored
  // record, so an id and a match can never be computed from two different pictures of one claim.
  claim.id = mintClaimId(claim, takenIds);
  takenIds.add(claim.id);
  return claim;
}

/**
 * Extract the package's claim nodes: DECLARED FIRST, deterministic scan as the recall backstop.
 *
 * Per artifact: read its declarations (sidecar, else front matter), honour each one whose anchor
 * resolves to a block, then scan every REMAINING block for a high-stakes claim. A declared anchor
 * is never re-minted by the scan — a declaration is authoritative and the backstop is not its peer.
 * A declaration whose anchor resolves to nothing yields NO claim: `text` is required and is what
 * M3 hashes, and inventing the prose a declaration pointed at would be a fabrication (see
 * CONTRACT CONCERNS #2 — this module has no channel to report the dangling anchor, which is M11's
 * question to ask).
 *
 * `scope` (interfaces §4a) and `locations[].offset` (claims.schema.json) are derived here and ONLY
 * here — see the header. Every emitted location points at real file text and carries its offset, in
 * M8's units, upholding `fileText.slice(offset, offset + text.length) === text`.
 *
 * Deterministic: sorted files, sorted emission, sorted sets. Same package → identical artifact.
 *
 * @param {string} root the package root (the only I/O this module does)
 * @param {{terms:Array<object>}} terms TERMS (M1 `buildTerms`) — the vocabulary authority
 * @returns {{schemaVersion:number, claims:Array<object>}} CLAIMS, conforming to
 *   `system/schemas/package/claims.schema.json`
 */
export function extractClaims(root, terms) {
  const chapters = chapterSlugs(root);
  const drafts = [];

  for (const rel of ARTIFACT_FOLDERS.flatMap((folder) => markdownIn(root, folder))) {
    const fileText = readText(root, rel);
    if (fileText == null) continue;

    // Parsed from the body (a declaration is not an assertion), but offset-based at the file.
    const blocks = parseBlocks(
      fileText.slice(frontMatterLength(fileText)),
      frontMatterLength(fileText),
    );
    const blockByAnchor = new Map(blocks.map((b) => [b.anchor, b]));
    const claimedAnchors = new Set();

    // 1. DECLARED — authoritative.
    for (const decl of declarationsFor(root, rel, fileText)) {
      // Two declarations for one anchor is a conflict, not a merge: the first in document order
      // stands. Deterministic, and it refuses to fabricate a reconciliation nobody authored.
      if (claimedAnchors.has(decl.anchor)) continue;
      const block = blockByAnchor.get(decl.anchor);
      if (!block) continue; // dangling anchor: we do not invent the prose it named
      claimedAnchors.add(decl.anchor);
      drafts.push({
        type: decl.type,
        text: block.text,
        file: rel,
        anchor: decl.anchor,
        offset: block.offset,
        spineRefs: decl.spineRefs,
        sourceRefs: decl.sourceRefs,
        termRefs: decl.termRefs,
        provenanceDeclared: true,
      });
    }

    // 2. SCAN — the backstop. Never overwrites, never contradicts: declared anchors are skipped.
    for (const block of blocks) {
      if (claimedAnchors.has(block.anchor)) continue;
      const type = scanType(block);
      if (!type) continue;
      drafts.push({
        type,
        text: block.text,
        file: rel,
        anchor: block.anchor,
        offset: block.offset,
        spineRefs: [], // NEVER invented — see the header's refusal 1
        sourceRefs: [],
        termRefs: null,
        provenanceDeclared: false,
      });
    }
  }

  drafts.sort((a, b) => byString(a.file, b.file) || byString(a.anchor, b.anchor));

  const takenIds = new Set();
  return {
    schemaVersion: SCHEMA_VERSION,
    claims: drafts.map((d) => finalizeDraft(d, terms, chapters, takenIds)),
  };
}

// --- identity across versions (interfaces §4) ------------------------------------------------

/** Accept a CLAIMS object or a bare array — callers hold it both ways mid-pipeline. */
function claimList(claims) {
  if (Array.isArray(claims)) return claims;
  return Array.isArray(claims?.claims) ? claims.claims : [];
}

/** Group claims by their §4 identity key. */
function byIdentity(list) {
  const groups = new Map();
  for (const claim of list) {
    if (!claim || typeof claim !== "object") continue;
    const key = identityKey(claim);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(claim);
  }
  return groups;
}

/**
 * Pair unmatched removals and additions that share a spineRef into splits and merges.
 *
 * A split is 1 old → n new; a merge is n old → 1 new. Anything else under one spineRef (2→3, say)
 * is NOT attributed: which new claim descends from which old one is unknowable from the key alone,
 * and inventing a pairing would put a fabrication into an instructor's review. Those claims stay in
 * `added`/`removed`, which is the honest report — they are never dropped.
 *
 * Claims with NO spineRef are never paired: §4 keys splits/merges on a SHARED spineRef, and an
 * empty spineRef is not a shared parent, it is the absence of one. Pairing on it would marry every
 * unrelated scan-found addition to every unrelated scan-found removal.
 */
function pairSplitsAndMerges(removedClaims, addedClaims) {
  const groups = new Map(); // spineRef -> {from:[], to:[]}
  const bucket = (ref) => {
    if (!groups.has(ref)) groups.set(ref, { from: [], to: [] });
    return groups.get(ref);
  };
  for (const c of removedClaims) {
    const ref = firstSpine(c);
    if (ref) bucket(ref).from.push(String(c.id));
  }
  for (const c of addedClaims) {
    const ref = firstSpine(c);
    if (ref) bucket(ref).to.push(String(c.id));
  }

  const split = [];
  const merged = [];
  for (const [spineRef, { from, to }] of groups) {
    if (from.length === 0 || to.length === 0) continue; // a pure add or a pure remove is neither
    const entry = { spineRef, from: [...from].sort(byString), to: [...to].sort(byString) };
    if (from.length === 1 && to.length >= 2) split.push(entry);
    else if (from.length >= 2 && to.length === 1) merged.push(entry);
    // else: ambiguous. Reported as plain added/removed rather than attributed.
  }
  const bySpine = (a, b) => byString(a.spineRef, b.spineRef);
  return { split: split.sort(bySpine), merged: merged.sort(bySpine) };
}

/**
 * Match a package's claims across two versions (interfaces §4).
 *
 * The key is (spineRef + location anchor + label fingerprint) and **NEVER `content`** — content
 * changing is the entire point of the system, so keying identity on it would mean every knowledge
 * update deletes a claim and creates a stranger, and every downstream review would lose the thread
 * of the very edit it was convened to review. The three consequences §4 demands all follow from
 * what the key EXCLUDES:
 *   rephrase     → same id (prose is not in the key)
 *   value change → same id (a value is not in the key: it is still "the melting point of water")
 *   rename       → same id (term IDS are in the key, and M1 never re-mints one — see `termKey`
 *                  and CONTRACT CONCERNS #1)
 * Unmatched new = added; unmatched old = removed; both are reported. Splits/merges surface as
 * add+remove pairs sharing a spineRef: they are FLAGGED in `split`/`merged` AND remain in
 * `added`/`removed`, because the flag is an annotation over the honest report, not a substitute
 * for it. Dropping them is what §4 forbids.
 *
 * A key carrying several claims on either side is AMBIGUOUS and is not matched: two indistinguishable
 * claims cannot be paired without picking a winner. They report as added/removed — visible, not
 * guessed.
 *
 * PURE and DETERMINISTIC: no I/O. Output is fully sorted, so a diff of two runs shows only real change.
 *
 * @param {{claims:Array<object>}|Array<object>} oldClaims the previous CLAIMS
 * @param {{claims:Array<object>}|Array<object>} newClaims the current CLAIMS
 * @returns {{matched:Array<{oldId:string,newId:string}>, added:string[], removed:string[],
 *   split:Array<{spineRef:string, from:string[], to:string[]}>,
 *   merged:Array<{spineRef:string, from:string[], to:string[]}>}}
 */
export function matchClaims(oldClaims, newClaims) {
  const oldGroups = byIdentity(claimList(oldClaims));
  const newGroups = byIdentity(claimList(newClaims));

  const matched = [];
  const matchedOld = new Set();
  const matchedNew = new Set();

  for (const [key, olds] of oldGroups) {
    const news = newGroups.get(key);
    if (!news) continue;
    if (olds.length !== 1 || news.length !== 1) continue; // ambiguous: we do not pick a winner
    matched.push({ oldId: String(olds[0].id), newId: String(news[0].id) });
    matchedOld.add(olds[0]);
    matchedNew.add(news[0]);
  }

  const removedClaims = [...oldGroups.values()].flat().filter((c) => !matchedOld.has(c));
  const addedClaims = [...newGroups.values()].flat().filter((c) => !matchedNew.has(c));

  return {
    matched: matched.sort((a, b) => byString(a.oldId, b.oldId) || byString(a.newId, b.newId)),
    added: addedClaims.map((c) => String(c.id)).sort(byString),
    removed: removedClaims.map((c) => String(c.id)).sort(byString),
    ...pairSplitsAndMerges(removedClaims, addedClaims),
  };
}

// CONTRACT CONCERNS (found while implementing; REPORTED, not routed around)
// ----------------------------------------------------------------------------------------------
// RESOLVED AND NOW FROZEN IN THE DOC — the authority is the interfaces file, not this comment:
//   * the id/rename self-contradiction (§2's key moved on the operation §4 said it must survive)
//     → **§4b**, which names `identityLabel` (rename-invariant, sorted term ids) and separates it
//     from M3's `label` fingerprint (rename-variant). Promoted to a standing freeze-time check,
//     **§5e**: an identity key and a change signal have opposite requirements over one projection,
//     so they can never be the same value — compute both, name both, comment why.
//   * the bare anchor colliding across artifacts → **§2**'s `fileQualifiedAnchor`.
//   * `text` vs `offset` describing different strings → closed by making `text` non-overridable;
//     the rule and the reason are in this file's header, where the temptation to re-add it lives.
// Read those sections rather than re-deriving them here. What follows is what is still OPEN.
// A. **OPEN, owner M11 — a DANGLING declared anchor is silent.** §3's `declaredProvenance(fileText)
//    -> [{type, spineRefs, sourceRefs, anchor}]` cannot build a claim on its own: `text` is
//    required and is the sole input to M3's `content` fingerprint, and `termRefs` is what the
//    `label` layer and §4's `identityLabel` are computed from. Neither is in the shape, so this
//    module recovers both by re-reading the artifact the generator had already read — §5c's check
//    failing in its usual costume, a producer's signature carrying less structure than the consumer
//    needs. Survivable, but with a real cost: an anchor naming a block that does not exist
//    (typically because prose was restructured after it was declared) yields NO claim. The
//    generator declared a high-stakes fact and the index contains nothing about it — not flagged,
//    ABSENT, which reads as "nothing to review". `extractClaims`'s frozen return is
//    `{schemaVersion, claims}` and claims.schema.json is `additionalProperties:false`, so this
//    module has nowhere to say so. It is §5b's "spineRef target exists" one level down and belongs
//    with the same owner: **M11 should gate "every declared anchor resolves"** — it has both the
//    declarations and the artifact. Suggested §3 edit: add `termRefs` (M12 is writing the block and
//    knows its vocabulary). **NOT `text`** — see the header; that door is closed for a good reason.
// B. **OPEN, owner: the coordinator's `lib/units.mjs` task — NOT this module.** Do not "fix" it
//    here by reaching into M3 or M6.
//    **The unit table is DERIVED IN THREE PLACES** — §5d's own check, failing on §5d's own
//    example. M3 has `UNIT_ALIASES` (spelling → canonical token, deliberately never converting),
//    M6 has `SYMBOL_UNITS`/`WORD_UNITS` (surface → dimension + conversion), and this module has
//    `SCAN_UNIT_FORMS` (is this number a quantity at all?). All three answer a different question,
//    so they are not straightforwardly one function — but they encode ONE fact, "what strings are
//    units", three times, and they will drift. When they do, the failure is exactly the dangerous
//    kind: a unit M2 does not recognize is a `fact` claim that is never minted, so the claim M6
//    would have caught disagreeing with the answer key is not in the index to be compared, and
//    the package reports zero flags it has not earned — a clean bill of health manufactured by a
//    blind spot, which is the worst failure this system has because it looks like success.
//    Being unified into `lib/units.mjs` (surface forms + dimension + canonical token) with each
//    module projecting the view it needs; `SCAN_UNIT_FORMS` becomes a projection of it.
