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

/** Lean source formats coursewerk SHIPS (framework-free). Alembic reassembles the carrier. */
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
