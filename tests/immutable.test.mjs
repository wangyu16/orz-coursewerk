import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { immutableRegions, isImmutable } from "../scripts/lib/immutable.mjs";
import { buildSourceIndex, scanText } from "../scripts/lib/verbatim.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/mini-package/study-guide/phase-change.md", import.meta.url));
const guide = readFileSync(FIXTURE, "utf8");

/** Offset of the first character of `needle` in `hay` (fails loudly if absent). */
function at(hay, needle, plus = 0) {
  const i = hay.indexOf(needle);
  assert.notEqual(i, -1, `fixture drifted: ${JSON.stringify(needle)} not found`);
  return i + plus;
}

test("THE HEADLINE TEST: a quoted sentence is immutable, ordinary body prose is not", () => {
  const regions = immutableRegions(guide, null);

  // Inside the quotation ("the melting point of a substance is ...") — a rename here would
  // put modern words in the cited author's mouth. Refuse.
  const insideQuote = at(guide, "the melting point of a substance");
  assert.equal(isImmutable(regions, insideQuote), true);

  // The package's OWN prose, one sentence earlier, containing the SAME phrase. Free to edit:
  // this is where "ethene (formerly ethylene)" is allowed to appear.
  const bodyProse = at(guide, "At standard pressure the melting point of water");
  assert.equal(isImmutable(regions, bodyProse), false);

  // Sanity: the quoted span is reported as a quote, and it does not swallow the body.
  const quote = regions.find((r) => r.start <= insideQuote && insideQuote < r.end);
  assert.equal(quote.kind, "quote");
  assert.ok(quote.start > bodyProse, "the quote region must not extend back into body prose");
  assert.equal(guide[quote.start], '"');
  assert.equal(guide[quote.end - 1], '"');
});

test("blockquotes are immutable for their whole run; the following paragraph is not", () => {
  const text = [
    "# Notes",
    "",
    "> Ethylene was first isolated in 1795 and named",
    "> after its oily derivative.",
    "",
    "Modern texts call it ethene.",
    ""].join("\n");
  const regions = immutableRegions(text, null);

  assert.equal(isImmutable(regions, at(text, "Ethylene was first")), true);
  assert.equal(isImmutable(regions, at(text, "after its oily")), true, "lazy second line of the run");
  assert.equal(isImmutable(regions, at(text, "Modern texts call it")), false);

  const bq = regions.find((r) => r.kind === "quote");
  assert.equal(text.slice(bq.start, bq.end).split("\n").length, 2, "the blank line ends the run");
});

test("citations are immutable: markers, DOIs, and a whole reference section", () => {
  const text = [
    "# Alkenes",
    "",
    "Ethylene polymerizes readily [@smith2019], as shown elsewhere (Jones et al., 2019) and in [3].",
    "",
    "Ethene is the IUPAC name.",
    "",
    "## References",
    "",
    "1. Smith, A. ethylene chemistry. doi:10.1234/abcd",
    ""].join("\n");
  const regions = immutableRegions(text, null);

  assert.equal(isImmutable(regions, at(text, "[@smith2019]")), true);
  assert.equal(isImmutable(regions, at(text, "(Jones et al., 2019)")), true);
  assert.equal(isImmutable(regions, at(text, "[3]")), true);
  assert.equal(isImmutable(regions, at(text, "doi:10.1234/abcd")), true);
  // The reference ENTRY is frozen — renaming "ethylene" inside a cited title is falsification.
  assert.equal(isImmutable(regions, at(text, "ethylene chemistry")), true);
  // ...but the same term in the package's own prose is fair game.
  assert.equal(isImmutable(regions, at(text, "Ethylene polymerizes")), false);
  assert.equal(isImmutable(regions, at(text, "Ethene is the IUPAC name")), false);
  assert.ok(regions.some((r) => r.kind === "citation"));
});

test("near-verbatim source spans are immutable and agree with verbatim.mjs", () => {
  const shared =
    "the melting point of a substance is the temperature at which the solid and the liquid phases coexist in equilibrium at a stated pressure";
  const sourceText = `Chapter 2. ${shared} Other material follows here.`;
  const text = ["# Phase Change", "", `In our own words: ${shared}.`, "", "Latent heat is absorbed with no temperature rise.", ""].join("\n");

  const regions = immutableRegions(text, sourceText);
  const spans = regions.filter((r) => r.kind === "source-span");
  assert.equal(spans.length, 1, "one maximal run");
  assert.equal(isImmutable(regions, at(text, "the solid and the liquid")), true);
  assert.equal(isImmutable(regions, at(text, "Latent heat is absorbed")), false);

  // The boundary must mean the same thing here as at the publish-time verbatim gate.
  const gate = scanText(text, buildSourceIndex([sourceText]));
  assert.equal(spans.length, gate.length, "same span count as verbatim.mjs's own scan");
  assert.match(text.slice(spans[0].start, spans[0].end), /^the melting point of a substance/);
});

test("multiple pinned sources: an array detects a span from EACH source", () => {
  const fromA = "the melting point of a substance is the temperature at which the solid and liquid phases coexist in equilibrium";
  const fromB = "latent heat is the energy absorbed during a phase change without any accompanying rise in the measured temperature";
  const srcA = `Textbook chapter two. ${fromA} End of section.`;
  const srcB = `Lab manual appendix. ${fromB} End of appendix.`;
  const text = ["# Phase Change", "", `${fromA}.`, "", `${fromB}.`, "", "Our own summary sentence follows.", ""].join("\n");

  const regions = immutableRegions(text, [srcA, srcB]);
  const spans = regions.filter((r) => r.kind === "source-span");
  assert.equal(spans.length, 2, "one span per source");
  assert.equal(isImmutable(regions, at(text, "the solid and liquid phases")), true, "span from source A");
  assert.equal(isImmutable(regions, at(text, "without any accompanying rise")), true, "span from source B");
  assert.equal(isImmutable(regions, at(text, "Our own summary sentence")), false);

  // Each source is indexed separately. Pre-joining would let a shingle straddle the join
  // and fabricate an immutable region matching NO real source — so callers must not.
  const straddle = `${fromA} ${fromB}`;
  assert.deepEqual(
    immutableRegions(straddle, [srcA, srcB]).filter((r) => r.kind === "source-span").length,
    2,
    "two distinct spans, not one span spanning the seam",
  );

  // A single source finds only its own span — the array is doing real work.
  assert.equal(immutableRegions(text, srcA).filter((r) => r.kind === "source-span").length, 1);
});

test("sourceText back-compat: a bare string behaves exactly like a one-element array", () => {
  const src = "the melting point of a substance is the temperature at which the solid and liquid phases coexist in equilibrium";
  const text = `# X\n\n${src} and then our own words.\n`;
  assert.deepEqual(immutableRegions(text, src), immutableRegions(text, [src]));
  assert.deepEqual(immutableRegions(text, [src, "", null, undefined, 42]), immutableRegions(text, src), "junk entries ignored");
  assert.deepEqual(immutableRegions(text, []), immutableRegions(text, null), "an empty array skips source detection");
});

test("sourceText null/absent/empty: no crash, quote + citation regions still returned", () => {
  for (const src of [null, undefined, ""]) {
    const regions = immutableRegions(guide, src);
    assert.ok(regions.length > 0);
    assert.equal(regions.every((r) => r.kind !== "source-span"), true, "source detection skipped");
    assert.equal(isImmutable(regions, at(guide, "the melting point of a substance")), true);
  }
  assert.deepEqual(immutableRegions(guide, null), immutableRegions(guide));
  assert.deepEqual(immutableRegions("", null), []);
});

test("code fences and {{...}} orz blocks are immutable (documented decision: fail closed)", () => {
  const text = [
    "Body prose about ethylene.",
    "",
    "```js",
    'const gas = "ethylene";',
    "```",
    "",
    "{{mermaid",
    "graph TD; ethylene --> ethene",
    "}}",
    ""].join("\n");
  const regions = immutableRegions(text, null);
  assert.equal(isImmutable(regions, at(text, 'const gas = "ethylene"')), true);
  assert.equal(isImmutable(regions, at(text, "graph TD; ethylene")), true, "orz plugin payload is a machine-parsed DSL");
  assert.equal(isImmutable(regions, at(text, "Body prose about ethylene")), false);
  // The quote marks INSIDE the fence must not leak out as a stray inline-quote region.
  assert.equal(regions.filter((r) => r.start < at(text, "```js")).length, 0);
});

test("literal is its own kind: a refusal inside code must not be explained as a quotation", () => {
  // M9/M10 have to tell the instructor WHY an edit was refused. "We did not rename inside
  // this quotation" is FALSE for a code block — a confusing reason is worse than a coarse one.
  const text = ['He wrote: "ethylene is an olefin".', "", "```js", 'const gas = "ethylene";', "```", "", "{{mermaid graph TD; ethylene --> ethene}}", ""].join("\n");
  const regions = immutableRegions(text, null);
  const kindAt = (needle) => regions.find((r) => r.start <= at(text, needle) && at(text, needle) < r.end)?.kind;

  assert.equal(kindAt('const gas = "ethylene"'), "literal", "a code fence is literal, not a quotation");
  assert.equal(kindAt("graph TD; ethylene"), "literal", "an orz plugin payload is literal");
  assert.equal(kindAt("ethylene is an olefin"), "quote", "a real quotation is still a quote");
  assert.equal(regions.every((r) => ["quote", "citation", "literal", "source-span"].includes(r.kind)), true);
});

test("literal outranks source-span when a code fence also matches the source", () => {
  const code = "const melting = 100; const boiling = 373; const label = 'phase change table row'; export default melting;";
  const text = ["Own prose here about melting.", "", "```js", code, "```", ""].join("\n");
  const regions = immutableRegions(text, `Appendix A listing:\n${code}\n`);
  const fence = regions.find((r) => r.start <= at(text, "const melting") && at(text, "const melting") < r.end);
  assert.equal(fence.kind, "literal", "'it is code' is the reason a human can act on; the resemblance is incidental");
});

test("output is sorted, non-overlapping, and overlaps merge deterministically", () => {
  // A blockquote whose line is ALSO a near-verbatim source span AND carries a citation:
  // three detectors, overlapping claims on the same characters.
  const shared =
    "the melting point of a substance is the temperature at which the solid and the liquid phases coexist in equilibrium";
  const text = `# X\n\n> ${shared} [@smith2019]\n\nOwn prose here.\n`;
  const regions = immutableRegions(text, shared);

  for (let i = 1; i < regions.length; i += 1) {
    assert.ok(regions[i - 1].start < regions[i].start, "sorted by start");
    assert.ok(regions[i - 1].end <= regions[i].start, "non-overlapping");
  }
  const covering = regions.filter((r) => r.start <= at(text, "the melting point") && at(text, "the melting point") < r.end);
  assert.equal(covering.length, 1, "overlapping detections collapse to one region");
  assert.equal(covering[0].kind, "quote", "quote outranks citation and source-span");
});

test("boundaries are half-open [start, end): start immutable, end is the first free offset", () => {
  const regions = immutableRegions(guide, null);
  const r = regions.find((x) => x.kind === "quote");
  assert.equal(isImmutable(regions, r.start), true, "start is INSIDE");
  assert.equal(isImmutable(regions, r.end - 1), true, "last char is INSIDE");
  assert.equal(isImmutable(regions, r.end), false, "end is OUTSIDE — an insertion here lands after the quote");
  assert.equal(isImmutable(regions, r.start - 1), false);
  // Degenerate inputs never throw.
  assert.equal(isImmutable(regions, -1), false);
  assert.equal(isImmutable(regions, guide.length + 999), false);
  assert.equal(isImmutable([], 0), false);
  assert.equal(isImmutable(regions, NaN), false);
  assert.equal(isImmutable(null, 0), false);
});

test("pure and deterministic: same input -> identical output", () => {
  const src = "the melting point of a substance is the temperature at which it changes state from solid to liquid";
  const a = immutableRegions(guide, src);
  const b = immutableRegions(guide, src);
  assert.deepEqual(a, b);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), b);
  assert.deepEqual(immutableRegions(guide, null), immutableRegions(guide, null));
});
