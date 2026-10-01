// The quotation discriminators of the v0.12 gate (callouts, admonitions, attribution lines), moved verbatim in redesign
// P6 so check_oer.mjs and the MS6 quotations module share one implementation. Validated zero-FP on the callout family
// (coursewerk-caeai research g3a). Do not change behaviour here without changing it for both callers.
export const QUOTATION_CALLOUT_LABEL =
  /^(note|tip|warning|important|caution|info|example|worked example|visual description|data summary|definition|key idea|remember|summary|aside|callout|objective|objectives)\b\s*[:.\-—]/i;

/** An attribution line: em/en-dash + a source (the block-quotation convention), or a "Source:" lead. */
export function isQuotationAttributionLine(line) {
  return /^\s*[—–-]{1,2}\s+\S/.test(line) || /^\s*source\s*[:—-]/i.test(line);
}

/**
 * Does this `quote`-kind region make a reproduction claim the publish gate may act on?
 * Inline spans are handled by the caller (the quote mark is the shipped bound); this decides the
 * overloaded blockquote case: YES iff it carries an attribution signal AND is not a callout label.
 */
export function isActionableQuotation(regionText) {
  const lines = regionText.split("\n").map((l) => l.replace(/^\s*>\s?/, ""));
  const nonEmpty = lines.filter((l) => l.trim().length);
  if (!nonEmpty.length) return false;
  const first = nonEmpty[0].trim();

  if (/^\[!\w+\]/.test(first)) return false; // SUPPRESS — GitHub-style admonition marker
  if (/^\*{1,2}[^*\n]{1,48}?:?\*{1,2}\s*:?\s/.test(first) && /:/.test(first.slice(0, 52))) return false; // bold label
  if (QUOTATION_CALLOUT_LABEL.test(first)) return false; // plain leading label word

  return (
    nonEmpty.some(isQuotationAttributionLine) ||
    /\[\^[^\]]+\]/.test(regionText) ||
    /\[@[^\]]+\]/.test(regionText) ||
    /\bsource\s*[:—-]/i.test(regionText)
  );
}

/**
 * The reproduced BODY of a blockquote with the non-reproduced scaffolding removed — attribution
 * lines, a leading `**Label:**`, `Source:` lead, and inline citation markers — re-prefixed with
 * `> ` so it stays a `quote`-kind region the shipped matcher will test. This stops a FAITHFUL
 * attributed quote from false-firing on its own attribution/citation words.
 */
export function reproducedQuotationBody(regionText) {
  return regionText
    .split("\n")
    .filter((line) => !isQuotationAttributionLine(line.replace(/^\s*>\s?/, "")))
    .map((line) => {
      let c = line.replace(/^\s*>\s?/, "");
      c = c.replace(/^\s*\*{1,2}[^*\n]{1,48}?:\*{1,2}\s*/, ""); // leading bold label
      c = c.replace(/^\s*source\s*[:—-]\s*/i, ""); // Source: lead
      c = c.replace(/\[\^[^\]]+\]/g, "").replace(/\[@[^\]]+\]/g, ""); // citation markers
      return "> " + c;
    })
    .join("\n");
}

