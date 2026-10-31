// Alembic package contract — coursewerk's local mirror.
//
// This encodes exactly what Alembic's importer enforces, so `check_oer.mjs` can
// tell you BEFORE you upload whether a package will ingest with zero friction.
// It mirrors three files in the Alembic monorepo — keep them in sync:
//   - packages/package-contract/src/layers.ts   (v1 layer→repo map + root allowlists)
//   - packages/package-contract/src/spaces.ts   (v2 space→repo map)
//   - packages/package-contract/src/manifest.ts (the alembic.json schema)
//   - packages/package-contract/src/validate.ts (validateProject rules)
// and the .claude/skills/alembic-package/SKILL.md authoring guide.
//
// Nothing here does IO; it is pure data + small pure helpers.

/** Top-level folder → which repo it resolves to. Fail-closed: anything not here is rejected. */
export const FOLDER_REPO = {
  // public (student-facing) — shared with the world
  "study-guide": "public",
  slides: "public",
  practice: "public",
  concepts: "public",
  objectives: "public", // v1-only legacy, still accepted
  "assessment-support": "public",
  assets: "public", // v2 name for reusable media
  materials: "public", // v1 legacy name for assets
  current: "public", // active teaching term (current/<term-id>/…)
  provenance: "public",
  metadata: "public",
  "research-schema": "public", // v1-only legacy
  // PRIVATE (instructor-only) — never shared
  private: "private", // v2 name
  "private-instructor": "private", // v1 legacy name
};

/** Files permitted at the package root (anything else at root is rejected). */
export const ROOT_FILE_ALLOWLIST = new Set([
  "alembic.json",
  "README.md",
  "LICENSE",
  "CITATION.cff",
  ".gitignore",
]);

/** Directories permitted at the root purely for housekeeping. */
export const ROOT_DIR_ALLOWLIST = new Set([".alembic", ".github"]);

/**
 * The five OPEN licenses — required to LIST a package on Discover (the reuse market).
 * A package licensed openly grants others reuse rights.
 */
export const OPEN_LICENSES = [
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
  "CC-BY-NC-4.0",
  "CC-BY-NC-SA-4.0",
  "CC0-1.0",
];

/** "Unlicensed" — default copyright, no reuse granted. Usable privately or for one's own class,
 *  but NOT discoverable. This is the value to use when the instructor keeps the package to themselves. */
export const ALL_RIGHTS_RESERVED = "ALL-RIGHTS-RESERVED";

/** Every license value Alembic ACCEPTS on upload = the open set + all-rights-reserved. */
export const LICENSE_ENUM = [...OPEN_LICENSES, ALL_RIGHTS_RESERVED];

/** Human license strings → the Alembic enum value. Add rows as needed. */
export const LICENSE_ALIASES = {
  "cc by 4.0": "CC-BY-4.0",
  "cc-by-4.0": "CC-BY-4.0",
  "cc by-sa 4.0": "CC-BY-SA-4.0",
  "cc by sa 4.0": "CC-BY-SA-4.0",
  "cc-by-sa-4.0": "CC-BY-SA-4.0",
  "cc by-nc 4.0": "CC-BY-NC-4.0",
  "cc by nc 4.0": "CC-BY-NC-4.0",
  "cc-by-nc-4.0": "CC-BY-NC-4.0",
  "cc by-nc-sa 4.0": "CC-BY-NC-SA-4.0",
  "cc by nc sa 4.0": "CC-BY-NC-SA-4.0",
  "cc-by-nc-sa-4.0": "CC-BY-NC-SA-4.0",
  cc0: "CC0-1.0",
  "cc0 1.0": "CC0-1.0",
  "cc0-1.0": "CC0-1.0",
  "all rights reserved": ALL_RIGHTS_RESERVED,
  "all-rights-reserved": ALL_RIGHTS_RESERVED,
  unlicensed: ALL_RIGHTS_RESERVED,
  none: ALL_RIGHTS_RESERVED,
  "": ALL_RIGHTS_RESERVED,
};

/** True if the value is one of the five OPEN licenses (i.e. eligible for Discover). */
export function isOpenLicense(value) {
  return OPEN_LICENSES.includes(normalizeLicense(value));
}

/** Renderable/editable carriers. Must live in a PUBLIC folder; never shipped by coursewerk. */
export const CARRIER_EXTENSIONS = [
  ".ketcher.svg",
  ".plot.svg",
  ".md.html",
  ".slides.html",
  ".paged.html",
];

export const SCHEMA_VERSION = 2;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The texts coursewerk SHIPS (orz text format 1: the text is the source of truth) and the carrier each one's frame
 *  assembles (`<builder> assemble <slug>.md` → `<slug><carrier>`, D52). Alembic reassembles the carrier. */
export const LEAN_SOURCE = {
  "study-guide": { ext: ".md", carrier: ".md.html", builder: "orz-mdhtml" },
  practice: { ext: ".md", carrier: ".md.html", builder: "orz-mdhtml" },
  slides: { ext: ".md", carrier: ".slides.html", builder: "orz-slides" },
  // print/handout deliverables, if any, build with orz-paged
  paged: { ext: ".md", carrier: ".paged.html", builder: "orz-paged" },
};

const norm = (p) => p.replace(/\\/g, "/").replace(/^\/+/, "");

/**
 * Resolve a package-relative path to its repo, or return an error string.
 * Mirrors Alembic repoForPath (fail-closed): unknown top-level folder / bad root
 * file / any ".." segment → rejected.
 * @returns {{ repo: "public"|"private" } | { error: string }}
 */
export function repoForPath(rawPath) {
  const p = norm(rawPath);
  if (!p) return { error: "empty path" };
  if (p.split("/").includes("..")) return { error: `path traversal ("..") is not allowed: ${rawPath}` };

  const segments = p.split("/");
  if (segments.length === 1) {
    // a root file
    if (ROOT_FILE_ALLOWLIST.has(segments[0])) return { repo: "public" };
    return {
      error: `"${segments[0]}" is not an allowed root file (allowed: ${[...ROOT_FILE_ALLOWLIST].join(", ")})`,
    };
  }

  const top = segments[0];
  if (ROOT_DIR_ALLOWLIST.has(top)) return { repo: "public" };
  const repo = FOLDER_REPO[top];
  if (!repo) {
    return {
      error: `"${top}/" is not a recognized package folder, so "${rawPath}" cannot be imported`,
    };
  }
  return { repo };
}

/** True if the path ends in a known renderable-carrier extension (longest-suffix aware). */
export function isCarrierPath(rawPath) {
  const p = norm(rawPath).toLowerCase();
  return CARRIER_EXTENSIONS.some((ext) => p.endsWith(ext));
}

/** Normalize a human license string to the Alembic enum, or null if unknown. */
export function normalizeLicense(value) {
  if (!value) return null;
  const v = String(value).trim();
  if (LICENSE_ENUM.includes(v)) return v;
  return LICENSE_ALIASES[v.toLowerCase()] ?? null;
}

/** The study-guide path a declared chapter must have, per Alembic rule 3. */
export function chapterStudyGuidePath(slug) {
  return `study-guide/${slug}.md`;
}

// --- Claim-provenance declarations (M12) — THE SOLE OWNER OF THE DECLARATION GRAMMAR ----------
//
// Why this lives HERE, in the contract file
// -----------------------------------------
// A DECLARATION is the generating agent saying, structurally and at write time, "this block is a
// fact, it hangs off objective.phase-change.1, it comes from src.wiki.melting.rev1". It is the
// authored half of the semantic index (spec §10 decision 1: declaration is STRUCTURAL — sidecar or
// front matter — never inline in student-facing prose), and `format-contracts/deliverables.md` is
// the document that TELLS the generator how to write one. A contract the generator is told to obey
// and a parser the index enforces it with are ONE FACT; this file is where the enforceable half of
// a format contract already lives (the folder→repo map, the license enum, the manifest rules), so
// the grammar lives here too.
//
// It is here for a second, sharper reason. M2 (`lib/claims.mjs`) grew its own front-matter/sidecar
// parsing inline, so the moment this function exists the grammar is implemented TWICE — which is
// interfaces §5d ("is this fact derived in more than one place?"), whose own worked example, the
// unit table, drifted three ways and made a package report ZERO FLAGS IT HAD NOT EARNED: a clean
// bill of health manufactured by a blind spot, which looks exactly like success. Two declaration
// parsers would fail the same way and worse — a declaration honoured by the extractor but invisible
// to the gate (or the reverse) is a high-stakes fact that one half of the system believes is
// covered. **M2 consumes this module. There is no second parser. Do not add one.**
//
// PURE and DETERMINISTIC (interfaces §6.1): text in, declarations out. No I/O — the caller reads the
// files, because the sidecar lives at a path only the caller knows the root of. `claimSidecarPath`
// derives that path (pure), so even WHERE a declaration lives is stated once.

/**
 * The claim types a declaration may assert — the CLOSED enum of
 * `system/schemas/package/claims.schema.json`, mirrored here the way this file already mirrors
 * Alembic's enums (the schema is the authority; this is the enforcement).
 *
 * The enum is closed ON PURPOSE and an unrecognized type is REFUSED, never coerced to the nearest
 * member: coercion would emit a claim asserting a type nobody chose.
 */
export const CLAIM_TYPES = ["fact", "objective", "answer-key", "definition", "derived", "procedure"];

const CLAIM_TYPE_SET = new Set(CLAIM_TYPES);

/**
 * Front matter: a `---` fenced block at the very top of an artifact, whose body is JSON.
 * Structural, stripped by every markdown pipeline, therefore never student-facing.
 *
 * JSON rather than YAML because there is no YAML parser here and no new npm dependency is permitted
 * (interfaces §6) — and hand-rolling a YAML subset would be a parser that silently disagrees with
 * every other YAML parser about the one input that matters.
 */
const FRONT_MATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** An artifact's front-matter body, or null when it has none. */
export function frontMatterOf(fileText) {
  const m = FRONT_MATTER_RE.exec(String(fileText ?? ""));
  return m ? m[1] : null;
}

/**
 * How many characters of front matter precede the artifact's body (0 when there is none).
 *
 * A consumer parses BLOCKS from the body — a declaration is not an assertion and must never be
 * indexed as one — but any offset it reports must address the file EXACTLY AS READ, because that is
 * the string M8 (`lib/immutable.mjs`) is handed. An offset in a different frame of reference is
 * worse than none: it points confidently at the wrong text. So the body is parsed at a known base
 * and every block offset is rebased by this length.
 */
export function frontMatterLength(fileText) {
  const m = FRONT_MATTER_RE.exec(String(fileText ?? ""));
  return m ? m[0].length : 0;
}

/**
 * Where a deliverable's declaration SIDECAR lives: `private/coursewerk/claims/<path-without-.md>.json`
 * (spec §2 — the new metadata files all live under `metadata/`).
 *
 * Pure path derivation, stated once so the contract doc, the generator and the extractor cannot
 * disagree about where a declaration is.
 */
export function claimSidecarPath(rel) {
  return `private/coursewerk/claims/${String(rel ?? "").replace(/\.md$/, "")}.json`;
}

const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** The type enum as an author would read it — a reason is written for someone who cannot read code. */
const CLAIM_TYPE_LIST = CLAIM_TYPES.join(" | ");

/** Name a bad value the way its AUTHOR will recognize it, not the way a type system would. */
function describe(value) {
  if (value === undefined) return "nothing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "a list";
  if (typeof value === "string") return `a string (${JSON.stringify(value)})`;
  if (typeof value === "object") return "an object";
  return `${JSON.stringify(value)} (a ${typeof value})`;
}

/**
 * A declared reference list -> a sorted, de-duplicated set of non-empty strings.
 *
 * The three outcomes are deliberately distinct, and the middle one is the whole point:
 *   absent            -> []   ("I have none" is an ANSWER, and an honest one)
 *   a list of strings -> the sorted set
 *   anything else     -> a REFUSAL carrying a reason its author can act on
 *
 * A tolerant reading (`spineRefs: "concept.a.1"` -> `[]`, a stray `null` member dropped) is the
 * dangerous one: it yields a declaration marked `provenanceDeclared: true` whose declared spine was
 * silently discarded — a claim that LOOKS authored and provenanced while asserting nothing about the
 * thing it was authored to assert. Half-honouring is worse than refusing.
 *
 * @returns {{ok:true, value:string[]}|{ok:false, reason:string}}
 */
function refSet(value, field) {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) {
    return {
      ok: false,
      reason: `${field} must be a list of non-empty strings, got ${describe(value)} — wrap a single ref in a list: "${field}": ["…"]`,
    };
  }
  const out = [];
  for (const [i, v] of value.entries()) {
    if (typeof v !== "string" || !v.trim()) {
      return { ok: false, reason: `${field} must be a list of non-empty strings — item ${i} is ${describe(v)}` };
    }
    out.push(v.trim());
  }
  return { ok: true, value: [...new Set(out)].sort(byString) };
}

/**
 * Normalize one declaration entry to interfaces §3's frozen shape,
 * `{type, spineRefs, sourceRefs, termRefs, anchor}` — or refuse it WHOLE, with a reason.
 *
 * `termRefs` (ADDED 2026-07-16) distinguishes DECLARED-EMPTY from NOT-DECLARED, and the two are
 * different facts: `[]` is the generator saying "this claim names no registered term" (authoritative,
 * and it stands); `null` is it saying nothing, so the consumer recognizes them itself. Collapsing
 * them would make an authored "no vocabulary here" indistinguishable from silence. The field exists
 * at all because a declaration that cannot name its terms forces the consumer to re-resolve them —
 * §5d, the fact derived twice and able to disagree.
 *
 * `derivedFrom` (ADDED 2026-07-16) is the claim ids this claim is DERIVED FROM — an answer key that
 * depends on a stated value, a worked example that depends on a constant. It follows `termRefs`'
 * discipline exactly (omitted `null` = "resolve them for me"; `[]` = an authoritative "this claim
 * derives from nothing"), and it is here for a sharper reason than `termRefs` was: it had **NO
 * PRODUCER AT ALL.** It is defined in `claims.schema.json`, designed in spec §2.2, and §3 makes it
 * the PRIMARY edge `claimImpact` traverses — and it existed in exactly those places plus M5's
 * consumer and M5's hand-built fixtures. No package in existence could carry one. The strongest edge
 * in the graph was dead and looked fully implemented. **A field's presence in a schema proves
 * somebody INTENDED it; it never proves anything WRITES it** — and unlike every other defect of this
 * family found here, this one had not two disagreeing implementations but zero.
 *
 * **`derivedFrom` is DECLARED-ONLY and must NEVER be inferred.** A derivation is an AUTHORED
 * assertion. Inferring it from prose, from anchor adjacency, or from "the answer key sits under the
 * question" would fabricate a dependency the author never stated — the §1 no-guessed-spineRef rule
 * wearing a third hat, and strictly worse than the honest alternative: co-mention reaches the same
 * claim while SAYING WHY (`via: ["shared-term"]`), whereas a guessed `derivedFrom` puts words in the
 * author's mouth and hands M5's traversal the index's authority for them. If a structure cannot be
 * recognized, mint nothing — exactly as the scan refuses to read `definition`.
 *
 * `text` is REFUSED, and the refusal is now the honest one. The prose lives in the file at
 * `locations[].offset`; storing it a second time in the declaration is a licence for the two to
 * disagree. M2 tried exactly that tolerance and REMOVED ITS OWN FEATURE, because a quotation could
 * sit at the offset while the declared text looked perfectly rewritable — the precise failure
 * `offset` exists to prevent, delivered by the field meant to prevent it. One fact, one home.
 * (It was IGNORED until the refusal channel existed, because silently ignoring it and silently
 * refusing it are equally mute, and the forward-compat rule breaks the tie: unknown keys are
 * ignored. Now that a refusal is REPORTED, `text` is refused and its author is told why — an author
 * who set `text` believed they set the prose, and that belief is what has to be corrected. Every
 * OTHER unknown key is still ignored: `text` is not unknown, it is forbidden, and for a reason.)
 *
 * @returns {{ok:true, value:object}|{ok:false, reason:string}} never a partial declaration
 */
function normalizeDeclaration(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { ok: false, reason: `a declaration must be a JSON object with a type and an anchor, got ${describe(entry)}` };
  }
  if (entry.type === undefined) {
    return { ok: false, reason: `type is required, and must be one of: ${CLAIM_TYPE_LIST}` };
  }
  if (typeof entry.type !== "string" || !CLAIM_TYPE_SET.has(entry.type)) {
    return {
      ok: false,
      reason: `type must be one of: ${CLAIM_TYPE_LIST} — got ${describe(entry.type)}. The enum is closed, so an unrecognized type is refused rather than coerced to the nearest member (that would assert a type nobody chose)`,
    };
  }

  // The anchor is the declaration's whole locating power: no anchor, nothing to declare ABOUT.
  if (entry.anchor === undefined) {
    return {
      ok: false,
      reason: `anchor is required — it names the block this declaration is about, as <heading-slug>#<ordinal>, e.g. "melting-point-of-water#1"`,
    };
  }
  if (typeof entry.anchor !== "string" || !entry.anchor.trim()) {
    return {
      ok: false,
      reason: `anchor must be a non-empty string naming a block, as <heading-slug>#<ordinal> — got ${describe(entry.anchor)}`,
    };
  }

  if ("text" in entry) {
    return {
      ok: false,
      reason: `text is not a declarable field — a claim's prose is ALWAYS the block standing at its anchor. A declared copy can drift from that block, and then a quotation sits at the location while the declared text looks freely rewritable, which is the exact edit the location exists to prevent. Remove "text": the prose is already where it belongs, at the anchor`,
    };
  }

  const spine = refSet(entry.spineRefs, "spineRefs");
  if (!spine.ok) return spine;
  const source = refSet(entry.sourceRefs, "sourceRefs");
  if (!source.ok) return source;

  let termRefs = null; // not declared — the consumer recognizes the vocabulary itself
  if (entry.termRefs !== undefined) {
    const declared = refSet(entry.termRefs, "termRefs");
    if (!declared.ok) return declared; // present but malformed: refuse, never half-honour
    termRefs = declared.value;
  }

  let derivedFrom = null; // not declared. NEVER inferred — a derivation is an AUTHORED assertion.
  if (entry.derivedFrom !== undefined) {
    const declared = refSet(entry.derivedFrom, "derivedFrom");
    if (!declared.ok) return declared;
    derivedFrom = declared.value;
  }

  // Key order is interfaces §3's, verbatim.
  return {
    ok: true,
    value: { type: entry.type, spineRefs: spine.value, sourceRefs: source.value, termRefs, derivedFrom, anchor: entry.anchor.trim() },
  };
}

/**
 * Parse a declaration DOCUMENT: `{"schemaVersion":1,"claims":[…]}` or a bare `[…]`.
 *
 * `tried` is the caller's answer to the only question this text cannot answer about itself: **did
 * somebody INTEND to declare here?** A `---` fence is that intent, and so is the existence of a
 * sidecar file. Without it, an ordinary markdown artifact — which is not JSON — would report a
 * refusal for every deliverable that simply declares nothing, and a warning that fires on the whole
 * package is a warning nobody reads. With it, a sidecar containing broken JSON is REPORTED rather
 * than read as prose. The distinction is real and it is the caller's to make, which is why
 * `artifactDeclarationReport` (which knows which carrier it holds) sets it and does not guess.
 *
 * @returns {{declarations:Array<object>, refusals:Array<{index:number|null, reason:string}>}}
 */
function parseDeclarationDocument(raw, tried) {
  let data;
  try {
    data = JSON.parse(String(raw ?? ""));
  } catch {
    // Not JSON. We do not guess at what was meant — but if somebody MEANT to declare, say so.
    return tried
      ? {
          declarations: [],
          refusals: [
            {
              index: null,
              reason: `the declaration is not valid JSON, so none of it could be read. It must be a JSON document — {"schemaVersion": 1, "claims": [ … ]} — not YAML`,
            },
          ],
        }
      : { declarations: [], refusals: [] };
  }

  const list = Array.isArray(data) ? data : Array.isArray(data?.claims) ? data.claims : null;
  if (list === null) {
    return {
      declarations: [],
      refusals: [
        {
          index: null,
          reason: `a declaration document must be {"schemaVersion": 1, "claims": [ … ]} or a bare list of declarations — this JSON has no claims list`,
        },
      ],
    };
  }

  const declarations = [];
  const refusals = [];
  for (const [index, entry] of list.entries()) {
    const result = normalizeDeclaration(entry);
    if (result.ok) declarations.push(result.value);
    else refusals.push({ index, reason: result.reason });
  }
  return { declarations, refusals };
}

/**
 * The claim-provenance declarations carried by a text, WITH the ones it had to refuse
 * (interfaces §3 — FROZEN).
 *
 * ONE entry point for BOTH carriers, because they carry the same document in two places:
 *   - an ARTIFACT (`study-guide/<slug>.md`): the declarations are its front-matter body;
 *   - a SIDECAR (`private/coursewerk/claims/<slug>.json`): the declarations are the whole file.
 * Front matter, when present, IS the declaration text — a file that opens with `---` is never then
 * re-read as a JSON document. Otherwise the text is read as the document itself, so an ordinary
 * markdown file with no front matter yields nothing (it is not JSON) rather than an error.
 *
 * WHY `refusals` EXISTS, and it is the point of this function: a refusal is CORRECT (half-honouring
 * a declaration is worse), but reporting it by ABSENCE is the defect. An absence is
 * indistinguishable from "never declared", so the author who wrote a high-stakes declaration and got
 * one field wrong receives a warning that names the WRONG PROBLEM — "you did not declare this" — and
 * the block falls to the scan looking exactly like prose nobody bothered with. The person reading
 * that message is the one who TRIED. So every `reason` is written for them: it names the field, what
 * was expected, what arrived, and what to do — never "invalid entry".
 *
 * `index` is the entry's position in the document's `claims` list, or **null when the DOCUMENT
 * itself is the problem** (not valid JSON; no claims list). Null is an answer, not a missing value —
 * a consumer renders "declaration #2: …" or "this declaration document: …" and branches on the null.
 *
 * `declarations` are in DOCUMENT ORDER, deliberately: order is how a consumer resolves two
 * declarations for one anchor (the first stands — a conflict is not a merge), and a sort would make
 * that resolution depend on a field nobody wrote it in. Refusals do not shift the survivors, and a
 * refused entry does not veto the file: its well-formed neighbours stand.
 *
 * @param {string} fileText an artifact's text, or a sidecar's text
 * @returns {{declarations:Array<{type:string, spineRefs:string[], sourceRefs:string[],
 *   termRefs:string[]|null, derivedFrom:string[]|null, anchor:string}>,
 *   refusals:Array<{index:number|null, reason:string}>}}
 */
export function declaredProvenanceReport(fileText) {
  const text = String(fileText ?? "");
  const fm = frontMatterOf(text);
  // The fence IS the intent to declare; a bare text's intent is unknowable from the text alone
  // (see CONCERN C — `artifactDeclarationReport` is where a sidecar's intent is known).
  return parseDeclarationDocument(fm == null ? text : fm, fm != null);
}

/**
 * The declarations a text carries — the SURVIVORS PROJECTION of `declaredProvenanceReport`
 * (interfaces §3 — FROZEN).
 *
 * A projection, and never a second parse: the refusals and the survivors are two views of ONE parse,
 * so they cannot disagree about whether an entry was honoured (§5d). If you need to know what was
 * refused — and the M11 gate does — call the report.
 */
export function declaredProvenance(fileText) {
  return declaredProvenanceReport(fileText).declarations;
}

/**
 * An artifact's declarations AND refusals, resolving the two carriers.
 *
 * **PRECEDENCE, stated as a RULE and not as a tie-break: a sidecar, if present, IS the artifact's
 * declaration. Front matter is NOT merged into it.** One artifact, one declaration authority.
 * Unioning the two would let them disagree about a single anchor and leave the parser picking a
 * winner, which is the one thing it may never do — and "present" means present, so an EMPTY sidecar
 * declaring nothing still wins: it is the artifact saying "nothing here is declared", which is an
 * answer, and falling back to front matter would silently overrule it.
 *
 * Precedence applies to REFUSALS too, and it must: a gate that read the artifact's front matter
 * directly would report problems in a declaration that LOST the precedence contest and is not the
 * artifact's authority at all — telling the author to fix a file the index never reads.
 *
 * A present sidecar also carries its own intent: the file EXISTS, so a sidecar of broken JSON is a
 * reported refusal rather than a text that merely failed to look like a declaration.
 *
 * Pure: the caller does the reading and passes null for a carrier that does not exist.
 *
 * @param {{fileText?: string|null, sidecarText?: string|null}} carriers
 */
export function artifactDeclarationReport({ fileText = null, sidecarText = null } = {}) {
  if (sidecarText != null) return parseDeclarationDocument(sidecarText, true);
  return declaredProvenanceReport(fileText);
}

/** The declarations an artifact carries — the survivors projection of `artifactDeclarationReport`. */
export function artifactDeclarations(carriers) {
  return artifactDeclarationReport(carriers).declarations;
}

// CONTRACT CONCERNS (found while implementing M12; REPORTED, not routed around)
// ----------------------------------------------------------------------------------------------
// A. **CLOSED 2026-07-16 — a refused declaration is no longer silent.** The concern was raised here
//    and NOT acted on unilaterally: the doc changed first (§3 now freezes
//    `declaredProvenanceReport -> {declarations, refusals:[{index, reason}]}` with
//    `declaredProvenance` as its survivors projection, and §5b assigns `refusals` to the M11 gate).
//    Both are now implemented above. The lesson is worth more than the fix and belongs where the
//    next author will read it: **the refusal was correct; its SILENCE was the defect.** A module
//    that quietly widens its own contract is how a freeze dies, so the argument goes to the doc and
//    the code follows it — never the reverse.
// B. **NOTE for M11 — the anchor VOCABULARY is not exported.** `declaredProvenance` returns each
//    declaration's `anchor`, so M11 CAN detect a dangling one; but the set of anchors an artifact
//    actually has is minted by M2's `parseBlocks`, which is module-private. M11 must not re-derive
//    it (§5d: two block parsers = two answers to "does this anchor exist"). M2 should export its
//    anchors — a one-line additive change, and M11's to request. Recorded in §5b.
// C. **OPEN, M11's to know — `declaredProvenanceReport(fileText)` cannot tell a BROKEN SIDECAR from
//    PROSE, because that fact is not in the text.** A refusal needs to know that somebody INTENDED
//    to declare. A `---` fence is that intent and is visible in the text; a sidecar's intent is the
//    EXISTENCE OF THE FILE, which only the caller can see. So the frozen one-argument signature must
//    infer intent from the fence, and a sidecar containing `{ not json` looks exactly like a
//    markdown paragraph: both are "text that is not a declaration document". Reporting a refusal for
//    every un-declared artifact instead is not an option — a warning that fires on the whole package
//    is a warning nobody reads. **Resolution, additive and inside the freeze:** the intent is a
//    parameter of the parse, and `artifactDeclarationReport({fileText, sidecarText})` sets it,
//    because it is the function that KNOWS which carrier it holds. **M11 should call
//    `artifactDeclarationReport`, not `declaredProvenanceReport`** — it is also the only one that
//    applies the precedence rule, and a gate reporting refusals from a front matter that LOST to a
//    sidecar would tell an author to fix a file the index never reads. If §3 would rather freeze the
//    intent explicitly (`declaredProvenanceReport(fileText, {declared: true})`), that is the
//    coordinator's call; this is reported, not taken.
