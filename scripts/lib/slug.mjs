// Slug helpers — turn a human chapter title into an Alembic-valid slug.
// Slugs must match SLUG_PATTERN: ^[a-z0-9]+(?:-[a-z0-9]+)*$ (lowercase, hyphen-joined).
import { SLUG_PATTERN } from "./contract.mjs";

/** Slugify one title. Falls back to `fallback` (e.g. "ch3") if nothing usable remains. */
export function slugify(title, fallback = "section") {
  const base = String(title || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alnum → hyphen
    .replace(/^-+|-+$/g, "") // trim hyphens
    .replace(/-{2,}/g, "-");
  return SLUG_PATTERN.test(base) ? base : fallback;
}

/**
 * Assign unique slugs to an ordered list of chapters.
 * @param {Array<{title:string, slug?:string}>} chapters
 * @returns {Array<{title:string, slug:string}>} same order, each with a unique valid slug
 */
export function assignSlugs(chapters) {
  const seen = new Set();
  return chapters.map((ch, i) => {
    let slug = ch.slug && SLUG_PATTERN.test(ch.slug) ? ch.slug : slugify(ch.title, `ch${i + 1}`);
    if (seen.has(slug)) {
      let n = 2;
      while (seen.has(`${slug}-${n}`)) n += 1;
      slug = `${slug}-${n}`;
    }
    seen.add(slug);
    return { title: ch.title, slug };
  });
}
