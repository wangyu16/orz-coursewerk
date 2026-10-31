// M12 declaration-grammar tests (interfaces §3, §5d; spec §10 decision 1).
//
// M12 owns the DECLARATION GRAMMAR — the contract `format-contracts/deliverables.md` tells the
// generating agent to write, and the parser the index enforces it with. Two things follow, and the
// tests are shaped by both.
//
// First, the grammar is a SEAM, not a leaf: M2 consumes it, so a test that only proves
// `declaredProvenance` parses correctly proves nothing about whether the package's claims are
// declared correctly. The seam tests below run the real `extractClaims` over real packages.
//
// Second — and this is why the module exists at all — the grammar must have exactly ONE owner.
// M2 grew its own inline parser; the moment `declaredProvenance` existed, the grammar was
// implemented twice, which is interfaces §5d ("is this fact derived in more than one place?").
// §5d's own worked example, the unit table, drifted three ways and made a package report ZERO FLAGS
// IT HAD NOT EARNED. So there is a test that mechanically asserts the second parser is GONE —
// behavior tests cannot see a duplicate parser that currently agrees with the original, and
// "currently agrees" is the whole failure mode.
//
// House style: every assertion that pins a decision is paired with the value a WRONG implementation
// would have produced, asserted NOT to appear. A test that only checks the right answer cannot tell
// a right implementation from a lucky one.
//
// Free, deterministic, no network. Packages are mkdtemp copies of the golden fixture, which is
// treated as READ-ONLY — other modules' tests depend on it byte-for-byte.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLAIM_TYPES,
  artifactDeclarationReport,
  artifactDeclarations,
  claimSidecarPath,
  declaredProvenance,
  declaredProvenanceReport,
  frontMatterLength,
  frontMatterOf,
} from "../scripts/lib/contract.mjs";
import { buildTerms } from "../scripts/lib/terms.mjs";
import { extractClaims } from "../scripts/lib/claims.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(repo, "tests/fixtures/mini-package");
const read = (file) => fs.readFileSync(path.join(fixture, file), "utf8");

const tmpDirs = [];
after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** A copy of the golden fixture with files overlaid (null = delete). The fixture is never touched. */
function makePackage(overlay = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-decl-"));
  tmpDirs.push(dir);
  fs.cpSync(fixture, dir, { recursive: true });
  for (const [rel, content] of Object.entries(overlay)) {
    const abs = path.join(dir, rel);
    if (content === null) {
      fs.rmSync(abs, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
  }
  return dir;
}

function fixtureTerms() {
  return buildTerms([
    { file: "concepts/course.md", text: read("concepts/course.md"), scope: "course" },
    { file: "concepts/phase-change.md", text: read("concepts/phase-change.md"), scope: "phase-change" },
  ]);
}

const SG = "study-guide/phase-change.md";
const MP_ANCHOR = "melting-point-of-water#1";
const LH_ANCHOR = "latent-heat#1";
const SIDECAR = "private/coursewerk/claims/study-guide/phase-change.json";

/** The two carriers, as text. */
const frontMatter = (claims) => `---\n${JSON.stringify({ schemaVersion: 1, claims })}\n---\n`;
const sidecar = (claims) => JSON.stringify({ schemaVersion: 1, claims });

const studyGuide = ({ head = "", mp = "At standard pressure the melting point of water is 100 °C.", lh = "The latent heat of fusion of water is 334 J/g." } = {}) =>
  `${head}# Phase Change

## Objectives
1. State the melting point of water at standard pressure.
2. Explain why temperature is constant during a phase change.

## Melting point of water
${mp}

## Latent heat
${lh}
`;

const at = (claims, file, anchor) =>
  claims.find((c) => c.locations[0].file === file && c.locations[0].anchor === anchor);

const DECL = { type: "fact", anchor: MP_ANCHOR, spineRefs: ["concept.phase-change.1"], sourceRefs: ["src.wiki.melting.rev1"] };

// --- the frozen shape --------------------------------------------------------------------------

test("§3: the frozen shape is {type, spineRefs, sourceRefs, termRefs, derivedFrom, anchor} — and NO `text`", () => {
  const [decl] = declaredProvenance(frontMatter([{ ...DECL, termRefs: ["term.melting-point"] }]));

  assert.deepEqual(Object.keys(decl), ["type", "spineRefs", "sourceRefs", "termRefs", "derivedFrom", "anchor"]);
  assert.deepEqual(decl, {
    type: "fact",
    spineRefs: ["concept.phase-change.1"],
    sourceRefs: ["src.wiki.melting.rev1"],
    termRefs: ["term.melting-point"],
    derivedFrom: null,
    anchor: MP_ANCHOR,
  });

  // There is no `text`, and this is the assertion that keeps the door shut. The prose lives in the
  // file at locations[].offset; a declaration carrying its own copy is a licence for the two to
  // disagree — and then a quotation sits at the offset while the declared text looks freely
  // rewritable, which is the exact fabrication the offset exists to prevent. M2 shipped that
  // tolerance and removed its own feature over it. One fact, one home.
  const report = declaredProvenanceReport(frontMatter([{ ...DECL, text: "Water melts at 0 °C." }]));
  assert.deepEqual(report.declarations, []);
  assert.ok(!JSON.stringify(report.declarations).includes("Water melts at 0 °C."));
  // It is REFUSED, not ignored — and the difference is the author. A silent ignore leaves someone
  // believing they set the claim's prose, and that belief is exactly what has to be corrected.
  // (It WAS ignored until the refusal channel existed: a silent ignore and a silent refusal are
  // equally mute, and the frozen forward-compat rule broke the tie. The channel breaks it back.)
  assert.equal(report.refusals.length, 1);
  assert.match(report.refusals[0].reason, /^text is not a declarable field/);

  // Every OTHER unknown key is still ignored: `text` is not unknown, it is FORBIDDEN. Refusing on
  // any unrecognized key would break the frozen forward-compat rule and turn every future field
  // into a package-wide outage.
  const [future] = declaredProvenance(frontMatter([{ ...DECL, someFutureField: 1 }]));
  assert.equal(future?.anchor, MP_ANCHOR);
});

test("§3: sets are sorted and de-duplicated, so a declaration has ONE canonical form", () => {
  const [decl] = declaredProvenance(
    frontMatter([
      {
        type: "fact",
        anchor: MP_ANCHOR,
        spineRefs: ["objective.phase-change.2", "concept.phase-change.1", "concept.phase-change.1"],
        sourceRefs: ["src.b", "src.a"],
      },
    ]),
  );
  assert.deepEqual(decl.spineRefs, ["concept.phase-change.1", "objective.phase-change.2"]);
  assert.deepEqual(decl.sourceRefs, ["src.a", "src.b"]);
  // The negative: authoring order must not survive into a set that other modules hash (M3's `spine`
  // and `provenance` layers hash sorted sets), or reordering two refs would move a fingerprint and
  // flag a change nobody made.
  assert.notDeepEqual(decl.spineRefs, ["objective.phase-change.2", "concept.phase-change.1"]);
});

test("ORDER: entries come back in DOCUMENT order — the rule that resolves a duplicate anchor", () => {
  const decls = declaredProvenance(
    frontMatter([
      { type: "procedure", anchor: "z-last#1" },
      { type: "fact", anchor: "a-first#1" },
    ]),
  );
  assert.deepEqual(decls.map((d) => d.anchor), ["z-last#1", "a-first#1"]);
  // The negative: sorting the ENTRIES (as opposed to each entry's ref sets) would silently rewrite
  // "the first declaration for an anchor stands" into "the alphabetically-first one stands" — a
  // conflict resolved by a field nobody wrote it in.
  assert.notDeepEqual(decls.map((d) => d.anchor), ["a-first#1", "z-last#1"]);
});

// --- both carriers parse ------------------------------------------------------------------------

test("BOTH CARRIERS: front matter and a sidecar parse to the identical declaration", () => {
  const claims = [{ ...DECL, termRefs: ["term.melting-point"] }];
  const fromFrontMatter = declaredProvenance(frontMatter(claims));
  const fromSidecar = declaredProvenance(sidecar(claims));

  assert.equal(fromFrontMatter.length, 1);
  assert.deepEqual(fromSidecar, fromFrontMatter);

  // One grammar, two places to put it: a generator that moves a declaration from the artifact into a
  // sidecar must not thereby change what it declared.
  const bareArray = declaredProvenance(JSON.stringify(claims)); // the accepted document shorthand
  assert.deepEqual(bareArray, fromFrontMatter);
});

test("BOTH CARRIERS, AT THE SEAM: M2 honours a declaration from either one", () => {
  const terms = fixtureTerms();
  const claims = [{ ...DECL, type: "definition" }];

  const viaFm = at(extractClaims(makePackage({ [SG]: studyGuide({ head: frontMatter(claims) }) }), terms).claims, SG, MP_ANCHOR);
  const viaSidecar = at(extractClaims(makePackage({ [SG]: studyGuide(), [SIDECAR]: sidecar(claims) }), terms).claims, SG, MP_ANCHOR);

  for (const claim of [viaFm, viaSidecar]) {
    assert.equal(claim.provenanceDeclared, true);
    assert.equal(claim.type, "definition");
    assert.notEqual(claim.type, "fact"); // the scan's answer must not survive the declaration
    assert.deepEqual(claim.spineRefs, ["concept.phase-change.1"]);
    assert.deepEqual(claim.sourceRefs, ["src.wiki.melting.rev1"]);
  }
  // Same declaration, same claim — including its id. Where the declaration was written is not part
  // of what it says.
  assert.equal(viaSidecar.id, viaFm.id);
});

test("the sidecar path is derived once, and it mirrors the deliverable's path", () => {
  assert.equal(claimSidecarPath(SG), SIDECAR);
  assert.equal(claimSidecarPath("practice/gases.md"), "private/coursewerk/claims/practice/gases.json");
  // Only the trailing extension goes: a slug containing ".md" mid-path is not a suffix.
  assert.equal(claimSidecarPath("slides/a.md.b.md"), "private/coursewerk/claims/slides/a.md.b.json");
});

// --- the precedence rule ------------------------------------------------------------------------

test("PRECEDENCE: a sidecar WINS OUTRIGHT — front matter is not merged into it", () => {
  const fm = frontMatter([
    { type: "procedure", anchor: MP_ANCHOR, spineRefs: ["concept.phase-change.9"] },
    { type: "fact", anchor: LH_ANCHOR, spineRefs: ["concept.phase-change.8"] }, // an anchor the sidecar omits
  ]);
  const sc = sidecar([{ type: "definition", anchor: MP_ANCHOR, spineRefs: ["concept.phase-change.1"] }]);

  const decls = artifactDeclarations({ fileText: fm, sidecarText: sc });

  // ONE artifact, ONE declaration authority.
  assert.equal(decls.length, 1);
  assert.equal(decls[0].type, "definition");
  assert.notEqual(decls[0].type, "procedure"); // the front matter's rival claim on this anchor loses
  assert.deepEqual(decls[0].spineRefs, ["concept.phase-change.1"]);

  // THE MERGE TEST, and the reason this is a RULE and not a tie-break: latent-heat is declared ONLY
  // in the front matter. A union would keep it (both sources "agree" — no conflict to resolve!) and
  // nothing would look wrong. That is the failure: the sidecar would no longer be the artifact's
  // declaration, it would be a partial override of one, and the two could then disagree about a
  // single anchor with this parser left picking a winner.
  assert.ok(!decls.some((d) => d.anchor === LH_ANCHOR));

  // Neither carrier present, and each alone: the rule degrades cleanly.
  assert.deepEqual(artifactDeclarations({}), []);
  assert.deepEqual(artifactDeclarations({ fileText: fm }).map((d) => d.anchor), [MP_ANCHOR, LH_ANCHOR]);
  assert.deepEqual(artifactDeclarations({ sidecarText: sc }), decls);
});

test("PRECEDENCE: an EMPTY sidecar still wins — declaring nothing is an ANSWER", () => {
  const fm = frontMatter([DECL]);
  // "Present" means present. A sidecar that declares nothing is the artifact saying "nothing here is
  // declared"; falling back to front matter on `.length === 0` would silently overrule it — the
  // truthiness bug §5d warns about, one level up (branch on PRESENCE, never on emptiness).
  assert.deepEqual(artifactDeclarations({ fileText: fm, sidecarText: sidecar([]) }), []);
  assert.notDeepEqual(artifactDeclarations({ fileText: fm, sidecarText: sidecar([]) }), artifactDeclarations({ fileText: fm }));
  // …and a sidecar that is present but UNPARSEABLE likewise does not fall back: the author wrote a
  // sidecar, so the sidecar is the authority, and a broken one is not a licence to consult a rival.
  assert.deepEqual(artifactDeclarations({ fileText: fm, sidecarText: "{ not json" }), []);
});

test("PRECEDENCE, AT THE SEAM: M2's sidecar-beats-front-matter behavior is M12's rule", () => {
  const terms = fixtureTerms();
  const root = makePackage({
    [SG]: studyGuide({ head: frontMatter([{ type: "procedure", anchor: MP_ANCHOR, spineRefs: ["concept.phase-change.9"] }]) }),
    [SIDECAR]: sidecar([{ type: "definition", anchor: MP_ANCHOR, spineRefs: ["concept.phase-change.1"] }]),
  });
  const claim = at(extractClaims(root, terms).claims, SG, MP_ANCHOR);
  assert.equal(claim.type, "definition");
  assert.notEqual(claim.type, "procedure");
  assert.deepEqual(claim.spineRefs, ["concept.phase-change.1"]);

  // The front matter is still STRIPPED from the body even though it lost the precedence contest: it
  // is a declaration, not an assertion, and must never be indexed as one.
  const claims = extractClaims(root, terms).claims;
  assert.ok(claims.every((c) => !c.text.includes('"anchor"')));
});

// --- refusal: whole or not at all ---------------------------------------------------------------

test("REFUSAL: a malformed entry is refused WHOLE — never half-honoured", () => {
  const good = { type: "fact", anchor: LH_ANCHOR, spineRefs: ["concept.phase-change.2"] };
  const refused = [
    { what: "no type", entry: { anchor: MP_ANCHOR, spineRefs: ["concept.phase-change.1"] } },
    { what: "type outside the closed enum", entry: { type: "assertion", anchor: MP_ANCHOR, spineRefs: ["concept.phase-change.1"] } },
    { what: "no anchor", entry: { type: "fact", spineRefs: ["concept.phase-change.1"] } },
    { what: "blank anchor", entry: { type: "fact", anchor: "   ", spineRefs: ["concept.phase-change.1"] } },
    { what: "spineRefs is a string, not a list", entry: { type: "fact", anchor: MP_ANCHOR, spineRefs: "concept.phase-change.1" } },
    { what: "sourceRefs holds a non-string", entry: { type: "fact", anchor: MP_ANCHOR, sourceRefs: [{ id: "src.a" }] } },
    { what: "spineRefs holds an empty string", entry: { type: "fact", anchor: MP_ANCHOR, spineRefs: [""] } },
    { what: "termRefs is present but malformed", entry: { type: "fact", anchor: MP_ANCHOR, termRefs: "term.melting-point" } },
    { what: "the entry is not an object", entry: "concept.phase-change.1" },
    { what: "the entry is an array", entry: ["fact", MP_ANCHOR] },
  ];

  for (const { what, entry } of refused) {
    const decls = declaredProvenance(frontMatter([entry, good]));
    // The refused entry contributes NOTHING — not a type, not a spine, not an anchor.
    assert.ok(!decls.some((d) => d.anchor === MP_ANCHOR), `${what}: half-honoured`);
    // The negative that carries the weight: half-honouring `spineRefs: "concept.phase-change.1"` as
    // `spineRefs: []` would emit a claim marked declared-and-provenanced whose declared parent was
    // silently discarded — authored-looking, and asserting nothing about the thing it was authored
    // to assert. Refusing is visible downstream (the block falls to the scan); dropping is not.
    assert.equal(decls.length, 1, `${what}: wrong entry count`);
    // …and one bad entry is not a file-wide veto: its well-formed neighbour survives untouched.
    assert.deepEqual(decls[0], { type: "fact", spineRefs: ["concept.phase-change.2"], sourceRefs: [], termRefs: null, derivedFrom: null, anchor: LH_ANCHOR });
  }
});

test("REFUSAL: absent ref lists are [] — an ANSWER, not a malformation", () => {
  const [decl] = declaredProvenance(frontMatter([{ type: "objective", anchor: "objectives#1" }]));
  // "I have no spine / no source" is honest and common (an objective restated in a guide may hang
  // off nothing yet). It must not be confused with the malformed cases above, or the commonest
  // well-formed declaration there is would silently fall to the scan.
  assert.deepEqual(decl, { type: "objective", spineRefs: [], sourceRefs: [], termRefs: null, derivedFrom: null, anchor: "objectives#1" });
});

test("REFUSAL: a malformed DOCUMENT yields nothing — we do not guess at what was meant", () => {
  for (const raw of ["{ not json", "", "null", '"a string"', "42", '{"claims": "melting-point"}', '{"clams": []}']) {
    assert.deepEqual(declaredProvenance(raw), [], `parsed junk: ${raw}`);
  }
  // Front matter that is YAML rather than JSON: refused, and NOT re-read as a JSON document. A file
  // that opens with `---` has said where its declaration is; the rest of the file is prose.
  assert.deepEqual(declaredProvenance("---\nclaims: maybe?\n---\n# Phase Change\n"), []);
  // An ordinary markdown file with no front matter is not JSON, so it yields nothing — not an error.
  assert.deepEqual(declaredProvenance(read(SG)), []);
  assert.deepEqual(declaredProvenance(undefined), []);
  assert.deepEqual(declaredProvenance(null), []);
});

test("REFUSAL, AT THE SEAM: a refused declaration falls to the SCAN, indexed and undeclared", () => {
  const terms = fixtureTerms();
  const root = makePackage({
    [SG]: studyGuide({
      head: frontMatter([
        { type: "fact", anchor: MP_ANCHOR, spineRefs: "concept.phase-change.1" }, // a string, not a list
        { type: "fact", anchor: LH_ANCHOR, spineRefs: ["concept.phase-change.2"] },
      ]),
    }),
  });
  const { claims } = extractClaims(root, terms);

  const fell = at(claims, SG, MP_ANCHOR);
  assert.equal(fell.provenanceDeclared, false);
  assert.deepEqual(fell.spineRefs, []); // the refused declaration's spine is NOT half-adopted
  assert.notDeepEqual(fell.spineRefs, ["concept.phase-change.1"]);
  // It is INDEXED, not dropped: it is worse to know about a claim and not index it than to index it
  // with a warning (spec §10 decision 1).
  assert.equal(fell.type, "fact");
  assert.ok(fell.text.length > 0);
  // The well-formed neighbour is unaffected.
  assert.equal(at(claims, SG, LH_ANCHOR).provenanceDeclared, true);
});

// --- §3: the refusal REPORT — a refusal is correct; its silence was the defect -------------------

test("REPORT: every refusal path surfaces with its OWN specific, actionable reason", () => {
  const good = { type: "fact", anchor: LH_ANCHOR };
  // Each row pins the SPECIFIC reason. A loose regex (or a shared `/must be/`) would let two paths
  // pass by matching each other's message — the check would then be green while telling an author
  // to fix the wrong field, which is the failure this channel exists to end.
  const cases = [
    { entry: { anchor: MP_ANCHOR }, reason: /^type is required, and must be one of: fact \| objective \| answer-key \| definition \| derived \| procedure$/ },
    { entry: { type: "assertion", anchor: MP_ANCHOR }, reason: /^type must be one of: fact \|.*— got a string \("assertion"\)\. The enum is closed.*coerced to the nearest member/ },
    { entry: { type: 7, anchor: MP_ANCHOR }, reason: /^type must be one of: .*— got 7 \(a number\)/ },
    { entry: { type: "fact" }, reason: /^anchor is required — it names the block this declaration is about, as <heading-slug>#<ordinal>, e\.g\. "melting-point-of-water#1"$/ },
    { entry: { type: "fact", anchor: "   " }, reason: /^anchor must be a non-empty string naming a block.*— got a string \("   "\)$/ },
    { entry: { type: "fact", anchor: 3 }, reason: /^anchor must be a non-empty string naming a block.*— got 3 \(a number\)$/ },
    { entry: { type: "fact", anchor: MP_ANCHOR, spineRefs: "concept.phase-change.1" }, reason: /^spineRefs must be a list of non-empty strings, got a string \("concept\.phase-change\.1"\) — wrap a single ref in a list: "spineRefs": \["…"\]$/ },
    { entry: { type: "fact", anchor: MP_ANCHOR, sourceRefs: [{ id: "src.a" }] }, reason: /^sourceRefs must be a list of non-empty strings — item 0 is an object$/ },
    { entry: { type: "fact", anchor: MP_ANCHOR, spineRefs: ["concept.a.1", ""] }, reason: /^spineRefs must be a list of non-empty strings — item 1 is a string \(""\)$/ },
    { entry: { type: "fact", anchor: MP_ANCHOR, termRefs: "term.melting-point" }, reason: /^termRefs must be a list of non-empty strings, got a string \("term\.melting-point"\)/ },
    { entry: { type: "fact", anchor: MP_ANCHOR, text: "Water melts at 0 °C." }, reason: /^text is not a declarable field — a claim's prose is ALWAYS the block standing at its anchor/ },
    { entry: "concept.phase-change.1", reason: /^a declaration must be a JSON object with a type and an anchor, got a string \("concept\.phase-change\.1"\)$/ },
    { entry: null, reason: /^a declaration must be a JSON object with a type and an anchor, got null$/ },
    { entry: ["fact", MP_ANCHOR], reason: /^a declaration must be a JSON object with a type and an anchor, got a list$/ },
  ];

  const seen = new Set();
  for (const { entry, reason } of cases) {
    // The refused entry is FIRST, so `index` must be its real position and not the survivor count.
    const { declarations, refusals } = declaredProvenanceReport(frontMatter([entry, good]));

    assert.equal(refusals.length, 1, `${reason}: not reported`);
    assert.equal(refusals[0].index, 0, "index locates the entry IN THE DOCUMENT, so an author can find it");
    assert.match(refusals[0].reason, reason);
    seen.add(refusals[0].reason);

    // The survivors projection is unaffected: a refusal is reported, and the neighbour still stands.
    assert.deepEqual(declarations.map((d) => d.anchor), [LH_ANCHOR]);
    assert.deepEqual(declaredProvenance(frontMatter([entry, good])), declarations);
  }
  // …and no two paths share a message. A reason that fits two defects tells the author to fix the
  // wrong one, which is a WARN naming the wrong problem — the exact defect this channel fixes.
  assert.equal(seen.size, cases.length);

  // Every reason names its field and what to do, not "invalid entry": the person reading it TRIED.
  for (const message of seen) assert.ok(message.length > 30 && !/^invalid/i.test(message));
});

test("REPORT: `index` is the entry's DOCUMENT position; null means the document itself", () => {
  const { declarations, refusals } = declaredProvenanceReport(
    frontMatter([{ type: "fact", anchor: "a#1" }, { type: "nope", anchor: "b#1" }, { type: "fact", anchor: "c#1" }, { anchor: "d#1" }]),
  );
  assert.deepEqual(declarations.map((d) => d.anchor), ["a#1", "c#1"]);
  // The indices are 1 and 3 — the positions in the DOCUMENT. Counting refusals (0,1) or survivors
  // would send the author to the wrong entry, and an author sent to the wrong entry stops trusting
  // the report entirely.
  assert.deepEqual(refusals.map((r) => r.index), [1, 3]);

  // A DOCUMENT-level failure has no entry to point at, so `index` is null — an answer, not a
  // missing value (a consumer renders "this declaration document: …" and branches on the null).
  const notJson = declaredProvenanceReport("---\nclaims: maybe?\n---\n# Phase Change\n");
  assert.deepEqual(notJson.declarations, []);
  assert.equal(notJson.refusals.length, 1);
  assert.equal(notJson.refusals[0].index, null);
  assert.match(notJson.refusals[0].reason, /^the declaration is not valid JSON.*not YAML$/s);
  assert.notEqual(notJson.refusals[0].index, 0); // 0 is an entry; null is the document

  const noList = declaredProvenanceReport('{"clams": []}');
  assert.equal(noList.refusals[0].index, null);
  assert.match(noList.refusals[0].reason, /^a declaration document must be \{"schemaVersion": 1, "claims": \[ … \]\} or a bare list/);
});

test("REPORT: an artifact that never TRIED to declare reports nothing — silence is correct here", () => {
  // The discrimination that keeps the channel usable. An ordinary markdown deliverable is not JSON,
  // and it declared nothing on purpose (spec §10 decision 1: connective prose carries no duty). If
  // that produced a refusal, EVERY undeclared artifact in the package would report one — and a
  // warning that fires on everything is a warning nobody reads, which is how a real refusal gets
  // lost. Intent is the discriminator: a `---` fence is intent; prose is not.
  for (const text of [read(SG), "", "# Just a heading\n", "Water melts at 0 °C.\n"]) {
    assert.deepEqual(declaredProvenanceReport(text), { declarations: [], refusals: [] });
  }
  // But a FENCE is an explicit "my declaration is here", so a broken one is reported, never shrugged.
  assert.equal(declaredProvenanceReport("---\nnot json\n---\n# H\n").refusals.length, 1);
});

test("REPORT: a present-but-BROKEN sidecar is reported — the file's existence is the intent", () => {
  // The case `declaredProvenanceReport(fileText)` cannot decide alone (CONCERN C): given only the
  // text, a sidecar of broken JSON is indistinguishable from a markdown paragraph — both are "not a
  // declaration document". The intent is the EXISTENCE OF THE FILE, which only the caller can see,
  // so the caller supplies it. Without this, the silent case the channel was built to end would
  // survive in the carrier most likely to be machine-generated.
  const broken = artifactDeclarationReport({ fileText: studyGuide(), sidecarText: "{ not json" });
  assert.deepEqual(broken.declarations, []);
  assert.equal(broken.refusals.length, 1);
  assert.match(broken.refusals[0].reason, /not valid JSON/);
  // The same text with no sidecar is just prose, and reports nothing.
  assert.deepEqual(artifactDeclarationReport({ fileText: "{ not json" }), { declarations: [], refusals: [] });
});

test("REPORT: PRECEDENCE governs refusals too — the losing carrier is not reported", () => {
  // A gate that read the artifact's front matter directly would tell the author to fix a
  // declaration that LOST the precedence contest and that the index never reads. The report must
  // describe the AUTHORITY, or its advice is about a file that has no effect.
  const report = artifactDeclarationReport({
    fileText: frontMatter([{ type: "wrong", anchor: MP_ANCHOR }]), // would refuse, but it lost
    sidecarText: sidecar([{ type: "definition", anchor: MP_ANCHOR }]),
  });
  assert.deepEqual(report.refusals, []);
  assert.deepEqual(report.declarations.map((d) => d.type), ["definition"]);

  // …and the mirror: a broken sidecar's refusal is reported while the front matter's is not, because
  // the sidecar is the authority whether or not it parses.
  const flipped = artifactDeclarationReport({
    fileText: frontMatter([{ type: "wrong", anchor: MP_ANCHOR }]),
    sidecarText: sidecar([{ type: "alsoWrong", anchor: LH_ANCHOR }]),
  });
  assert.equal(flipped.refusals.length, 1);
  assert.match(flipped.refusals[0].reason, /got a string \("alsoWrong"\)/);
  assert.ok(!flipped.refusals[0].reason.includes('"wrong"'));
});

test("§5d: `declaredProvenance` is the SURVIVORS PROJECTION — one parse, never two", () => {
  // The projection must be exactly the report's declarations, always. Two parses could disagree
  // about whether an entry was honoured — a declaration the extractor keeps and the gate reports as
  // refused (or the reverse) is the unit-table drift wearing this module's clothes.
  const texts = [
    frontMatter([DECL]),
    frontMatter([{ type: "nope", anchor: "a#1" }, { ...DECL, termRefs: [] }]),
    sidecar([{ type: "fact", anchor: "b#1", spineRefs: "not-a-list" }]),
    "---\nnot json\n---\n",
    read(SG),
    '{"clams": []}',
  ];
  for (const text of texts) {
    assert.deepEqual(declaredProvenance(text), declaredProvenanceReport(text).declarations);
    assert.deepEqual(artifactDeclarations({ fileText: text }), artifactDeclarationReport({ fileText: text }).declarations);
  }
  // A refusal never displaces a survivor: the honoured entries are the same list the pre-report
  // grammar returned, which is what makes this an additive change and not a behavior change.
  assert.deepEqual(declaredProvenance(frontMatter([{ type: "nope", anchor: "a#1" }, DECL])).map((d) => d.anchor), [MP_ANCHOR]);
});

test("REPORT, AT THE SEAM: M2 is unchanged by the channel — refusals are M11's, not the extractor's", () => {
  // M2's frozen return is {schemaVersion, claims} and claims.schema.json is additionalProperties:
  // false, so the extractor has nowhere to put a refusal and must not grow one. Its behavior is
  // exactly what it was: the refused block falls to the scan, indexed and honestly undeclared. The
  // report is a SECOND reader of the same parse (M11), not a change to the first.
  const terms = fixtureTerms();
  const root = makePackage({
    [SG]: studyGuide({ head: frontMatter([{ type: "fact", anchor: MP_ANCHOR, spineRefs: "concept.phase-change.1" }]) }),
  });
  const { claims } = extractClaims(root, terms);
  const fell = at(claims, SG, MP_ANCHOR);
  assert.equal(fell.provenanceDeclared, false);
  assert.deepEqual(fell.spineRefs, []);
  assert.deepEqual(Object.keys(extractClaims(root, terms)).sort(), ["claims", "schemaVersion"]);

  // And the refusal M2 cannot report is available to the gate from the same artifact — the seam
  // §5b assigns to M11, working, on a real package.
  const report = artifactDeclarationReport({ fileText: fs.readFileSync(path.join(root, SG), "utf8"), sidecarText: null });
  assert.equal(report.refusals.length, 1);
  assert.match(report.refusals[0].reason, /^spineRefs must be a list of non-empty strings/);
});

test("the closed type enum is exactly claims.schema.json's — the schema is the authority", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(repo, "system/schemas/package/claims.schema.json"), "utf8"));
  // A JS mirror of a JSON enum can drift; this is the test that stops it. If the schema gains a type
  // and the parser does not, every declaration using it is refused and reads as never-written.
  assert.deepEqual([...CLAIM_TYPES].sort(), [...schema.properties.claims.items.properties.type.enum].sort());

  for (const type of CLAIM_TYPES) {
    const [decl] = declaredProvenance(frontMatter([{ type, anchor: MP_ANCHOR }]));
    assert.equal(decl?.type, type, `${type} must be declarable`);
  }
});

// --- termRefs ------------------------------------------------------------------------------------

test("termRefs ROUND-TRIPS: declared vocabulary is authoritative and reaches the claim", () => {
  const terms = fixtureTerms();
  // The claim SITS at latent-heat but declares melting-point's vocabulary. Recognition would never
  // produce this, so the assertion can only pass if the DECLARED value survived to the record.
  const root = makePackage({
    [SG]: studyGuide({ head: frontMatter([{ type: "fact", anchor: LH_ANCHOR, spineRefs: ["concept.phase-change.2"], termRefs: ["term.melting-point"] }]) }),
  });
  const claim = at(extractClaims(root, terms).claims, SG, LH_ANCHOR);

  assert.deepEqual(claim.termRefs, ["term.melting-point"]);
  // The negative: recognition over "The latent heat of fusion of water is 334 J/g." finds latent
  // heat. If the declaration were ignored, THIS is what we would see — a consumer re-resolving a
  // fact the declaration already stated is §5d, and the two answers disagree right here.
  assert.notDeepEqual(claim.termRefs, ["term.latent-heat"]);
});

test("termRefs: OMITTED is not the same fact as DECLARED-EMPTY", () => {
  const terms = fixtureTerms();
  const declare = (extra) =>
    at(
      extractClaims(
        makePackage({ [SG]: studyGuide({ head: frontMatter([{ type: "fact", anchor: LH_ANCHOR, spineRefs: ["concept.phase-change.2"], ...extra }]) }) }),
        terms,
      ).claims,
      SG,
      LH_ANCHOR,
    );

  // OMITTED = "I am not saying" -> the index recognizes the vocabulary itself.
  assert.deepEqual(declare({}).termRefs, ["term.latent-heat"]);
  // DECLARED-EMPTY = "this claim names no registered term" -> an authored statement, and it stands.
  assert.deepEqual(declare({ termRefs: [] }).termRefs, []);
  // Collapsing the two (`termRefs: [] || recognize`) would make an authored "no vocabulary here"
  // indistinguishable from silence — and silently overrule it.
  assert.notDeepEqual(declare({ termRefs: [] }).termRefs, declare({}).termRefs);

  // At the grammar layer the two are distinct values, which is what makes the seam possible at all.
  assert.equal(declaredProvenance(frontMatter([{ type: "fact", anchor: LH_ANCHOR }]))[0].termRefs, null);
  assert.deepEqual(declaredProvenance(frontMatter([{ type: "fact", anchor: LH_ANCHOR, termRefs: [] }]))[0].termRefs, []);
});

test("termRefs is IDENTITY-BEARING, which is why declaring it must be exact (§4b)", () => {
  const terms = fixtureTerms();
  const idFor = (extra) =>
    at(
      extractClaims(
        makePackage({ [SG]: studyGuide({ head: frontMatter([{ type: "fact", anchor: MP_ANCHOR, spineRefs: ["concept.phase-change.1"], ...extra }]) }) }),
        terms,
      ).claims,
      SG,
      MP_ANCHOR,
    ).id;

  // §4's `identityLabel` is the sorted term-id set, so a declaration's termRefs decides the claim's
  // ID. This is the load-bearing consequence of adding the field: getting it wrong does not merely
  // mislabel a claim, it mints a different one.
  assert.notEqual(idFor({ termRefs: [] }), idFor({}));
  // …and the set is canonical, so authoring order cannot move an id.
  assert.equal(
    idFor({ termRefs: ["term.melting-point", "term.latent-heat"] }),
    idFor({ termRefs: ["term.latent-heat", "term.melting-point"] }),
  );
});

// --- derivedFrom: the field that had NO PRODUCER ---------------------------------------------------

test("derivedFrom HAS A PRODUCER: a claim extracted from a package actually carries one", () => {
  // THE test. Everything else about `derivedFrom` is plumbing; this is the fix.
  //
  // The field was defined in claims.schema.json, designed in spec §2.2, and is the PRIMARY edge M5's
  // `claimImpact` traverses — and it was written by NOTHING. It existed only in the schema, the
  // spec, M5's consumer, and M5's hand-built fixtures, so NO PACKAGE IN EXISTENCE COULD CARRY ONE:
  // the strongest edge in the graph was dead while looking fully implemented. That defect was
  // invisible to behavior tests precisely BECAUSE nothing produced the field — there was no
  // behavior to fail. So the test that keeps it fixed cannot assert on a hand-built claim; it has
  // to extract one from a real package on disk and find the edge there.
  const terms = fixtureTerms();
  const root = makePackage({
    [SG]: studyGuide({
      head: frontMatter([
        { type: "fact", anchor: MP_ANCHOR, spineRefs: ["concept.phase-change.1"] },
        // The answer key DEPENDS on the stated melting point: change the value, and this must move.
        { type: "answer-key", anchor: LH_ANCHOR, derivedFrom: ["claim.phase-change.deadbeef1234"] },
      ]),
    }),
  });
  const { claims } = extractClaims(root, terms);

  assert.deepEqual(at(claims, SG, LH_ANCHOR).derivedFrom, ["claim.phase-change.deadbeef1234"]);
  // The negative that would have caught the original defect: SOME claim in a real package carries
  // the field. Before this wire existed, this assertion was unsatisfiable by any input whatsoever.
  assert.ok(claims.some((c) => Array.isArray(c.derivedFrom) && c.derivedFrom.length > 0));

  // …and it stays a legal claim: the schema defines the field, so this connects a wire, not adds one.
  const schema = JSON.parse(fs.readFileSync(path.join(repo, "system/schemas/package/claims.schema.json"), "utf8"));
  const allowed = new Set(Object.keys(schema.properties.claims.items.properties));
  for (const claim of claims) for (const key of Object.keys(claim)) assert.ok(allowed.has(key), `stray field ${key}`);
});

test("derivedFrom is DECLARED-ONLY: the scan mints none, and adjacency is not authorship", () => {
  const terms = fixtureTerms();
  // The golden fixture has a practice answer key and a stated fact — the exact shape an inferring
  // implementation would "obviously" wire together.
  const { claims } = extractClaims(fixture, terms);
  assert.ok(claims.length > 0);
  for (const claim of claims) {
    assert.equal(claim.provenanceDeclared, false);
    // A scan-found claim has NO derivation, and the field is ABSENT rather than empty: it was never
    // declared, and `[]` would be an authored "derives from nothing" that nobody authored.
    assert.ok(!("derivedFrom" in claim), `${claim.id}: the scan invented a derivation`);
  }
  // The trap, spelled out: "the answer key sits under the question" is ADJACENCY, not authorship.
  // A guessed derivedFrom asserts a dependency the author never stated and hands M5's traversal the
  // index's authority for it — strictly worse than co-mention, which reaches the same claim while
  // honestly saying WHY (`via: ["shared-term"]`). It is the no-guessed-spineRef rule's third hat.
  const answerKey = claims.find((c) => c.type === "answer-key");
  assert.ok(answerKey);
  assert.ok(!("derivedFrom" in answerKey));
});

test("derivedFrom: OMITTED is not the same fact as DECLARED-EMPTY", () => {
  const terms = fixtureTerms();
  const declare = (extra) =>
    at(
      extractClaims(
        makePackage({ [SG]: studyGuide({ head: frontMatter([{ type: "fact", anchor: MP_ANCHOR, ...extra }]) }) }),
        terms,
      ).claims,
      SG,
      MP_ANCHOR,
    );

  // OMITTED = "I am not saying" -> the field is absent, and M5 has no edge to traverse.
  assert.ok(!("derivedFrom" in declare({})));
  // DECLARED-EMPTY = an authoritative "this claim derives from nothing" -> recorded as such.
  assert.deepEqual(declare({ derivedFrom: [] }).derivedFrom, []);
  // Collapsing the two would overrule an authored statement — the same distinction as `scope: null`
  // vs absent, which two other modules hit. A truthiness branch (`derivedFrom || …`) loses it.
  assert.ok("derivedFrom" in declare({ derivedFrom: [] }));

  // At the grammar layer the two are distinct values, which is what makes the seam possible at all.
  assert.equal(declaredProvenance(frontMatter([{ type: "fact", anchor: MP_ANCHOR }]))[0].derivedFrom, null);
  assert.deepEqual(declaredProvenance(frontMatter([{ type: "fact", anchor: MP_ANCHOR, derivedFrom: [] }]))[0].derivedFrom, []);
});

test("derivedFrom ROUND-TRIPS through both carriers, canonically", () => {
  const claims = [{ type: "answer-key", anchor: MP_ANCHOR, derivedFrom: ["claim.b.2", "claim.a.1", "claim.a.1"] }];
  const fromFm = declaredProvenance(frontMatter(claims));
  const fromSidecar = declaredProvenance(sidecar(claims));

  assert.deepEqual(fromFm[0].derivedFrom, ["claim.a.1", "claim.b.2"]); // sorted + de-duplicated
  assert.deepEqual(fromSidecar, fromFm); // where it was written is not part of what it says

  const terms = fixtureTerms();
  const viaSidecar = at(extractClaims(makePackage({ [SG]: studyGuide(), [SIDECAR]: sidecar(claims) }), terms).claims, SG, MP_ANCHOR);
  assert.deepEqual(viaSidecar.derivedFrom, ["claim.a.1", "claim.b.2"]);
  assert.notDeepEqual(viaSidecar.derivedFrom, ["claim.b.2", "claim.a.1"]); // authoring order must not survive
});

test("derivedFrom: a malformed one refuses the entry, with its OWN reason", () => {
  const cases = [
    { entry: { type: "fact", anchor: MP_ANCHOR, derivedFrom: "claim.a.1" }, reason: /^derivedFrom must be a list of non-empty strings, got a string \("claim\.a\.1"\) — wrap a single ref in a list: "derivedFrom": \["…"\]$/ },
    { entry: { type: "fact", anchor: MP_ANCHOR, derivedFrom: [null] }, reason: /^derivedFrom must be a list of non-empty strings — item 0 is null$/ },
  ];
  for (const { entry, reason } of cases) {
    const { declarations, refusals } = declaredProvenanceReport(frontMatter([entry]));
    assert.deepEqual(declarations, []); // refused WHOLE — the type and anchor are not half-adopted
    assert.equal(refusals.length, 1);
    assert.match(refusals[0].reason, reason);
    // The reason names derivedFrom specifically. A shared message would send the author to the
    // wrong field, which is a WARN naming the wrong problem.
    assert.ok(!refusals[0].reason.includes("termRefs") && !refusals[0].reason.includes("spineRefs"));
  }
});

// --- front matter: the fence, and the frame of reference ------------------------------------------

test("frontMatterOf / frontMatterLength: the fence is the declaration's, and only at the top", () => {
  const head = frontMatter([DECL]);
  const text = studyGuide({ head });
  assert.equal(frontMatterLength(text), head.length);
  assert.equal(frontMatterOf(text), JSON.stringify({ schemaVersion: 1, claims: [DECL] }));

  // No front matter: 0 and null. The two answers must not be confused — 0 is a length, null is "no
  // declaration here", and a consumer slices by the length.
  assert.equal(frontMatterLength(studyGuide()), 0);
  assert.equal(frontMatterOf(studyGuide()), null);

  // A `---` that is not at the very top is a horizontal rule (or a table's separator). Treating it
  // as front matter would strip real prose out of the body and hand every later claim an offset in
  // the wrong frame of reference — an offset that points confidently at the wrong text.
  const rule = "# Phase Change\n\n---\n{\"claims\":[]}\n---\n\nWater melts at 0 °C.\n";
  assert.equal(frontMatterLength(rule), 0);
  assert.equal(frontMatterOf(rule), null);

  // CRLF is a real artifact of a Windows-authored package; the fence must survive it.
  assert.equal(frontMatterOf("---\r\n[]\r\n---\r\n# H\r\n"), "[]");
});

test("frontMatterLength is the SEAM's frame of reference: offsets address the file AS READ", () => {
  const terms = fixtureTerms();
  const head = frontMatter([DECL]);
  const root = makePackage({ [SG]: studyGuide({ head }) });
  const claim = at(extractClaims(root, terms).claims, SG, MP_ANCHOR);

  // THE INVARIANT (claims.schema.json): a claim's text is the file's text at its offset. M8 is
  // handed the file as read, so M2 must speak in that frame — and it gets the frame's base from
  // M12, because the fence that hides the declaration is the declaration's own grammar.
  const fileText = fs.readFileSync(path.join(root, SG), "utf8");
  assert.equal(fileText.slice(claim.locations[0].offset, claim.locations[0].offset + claim.text.length), claim.text);
  // The negative: a body-relative offset would be short by exactly the front matter's length and
  // would land inside the declaration block — plausible, wrong, and off by an amount that changes
  // with the declaration.
  assert.ok(claim.locations[0].offset > head.length);
});

// --- §5d: ONE owner. The property that cannot be tested by behavior alone -------------------------

test("§5d: M2 CONSUMES the grammar — there is no second parser in lib/claims.mjs", () => {
  const claimsSrc = fs.readFileSync(path.join(repo, "scripts/lib/claims.mjs"), "utf8");

  // Behavior tests cannot see a duplicate parser that currently agrees with the original — and
  // "currently agrees" is precisely the failure mode: §5d's own worked example, the unit table, was
  // three parsers that all passed their tests while drifting apart, until a unit M2 did not
  // recognize meant a fact was never minted, so M6 had nothing to compare, so the package reported
  // ZERO FLAGS IT HAD NOT EARNED — a clean bill of health manufactured by a blind spot. This test is
  // therefore mechanical, and it is the one that actually defends the fix.
  assert.ok(/import \{[^}]*\bartifactDeclarations\b[^}]*\} from "\.\/contract\.mjs"/s.test(claimsSrc));

  assert.ok(!claimsSrc.includes("JSON.parse"), "a declaration document is parsed in lib/contract.mjs, not here");
  assert.ok(!/^\s*const FRONT_MATTER_RE/m.test(claimsSrc), "the front-matter fence belongs to lib/contract.mjs");
  assert.ok(!/function (normalizeDeclaration|parseDeclarationBody|declarationsFor)\b/.test(claimsSrc), "M2's inline declaration parser is gone — do not restore it");
  // The claim-type enum too: a second copy of a closed enum is a second answer to "is this type
  // declarable", and the drift shows up as a declaration silently refused.
  assert.ok(!/const CLAIM_TYPES\s*=/.test(claimsSrc), "the claim-type enum belongs to lib/contract.mjs");
});

// --- purity and determinism ------------------------------------------------------------------------

test("DETERMINISM: same text -> identical output, and the parser holds no state", () => {
  const text = frontMatter([{ ...DECL, termRefs: ["term.melting-point"] }, { type: "objective", anchor: "objectives#1" }]);
  const once = JSON.stringify(declaredProvenance(text));
  assert.equal(JSON.stringify(declaredProvenance(text)), once);

  // Parsing a DIFFERENT document in between must not move the answer — the failure a cached or
  // accumulating parser produces, and it is invisible in a suite that parses one thing.
  declaredProvenance(sidecar([{ type: "procedure", anchor: "other#3", spineRefs: ["concept.x.1"] }]));
  assert.equal(JSON.stringify(declaredProvenance(text)), once);

  // PURE: the input is not mutated, and the output does not alias it.
  const entry = { ...DECL, spineRefs: ["b", "a"] };
  const [decl] = declaredProvenance(JSON.stringify([entry]));
  decl.spineRefs.push("mutated");
  assert.deepEqual(entry.spineRefs, ["b", "a"]);
  assert.deepEqual(declaredProvenance(JSON.stringify([entry]))[0].spineRefs, ["a", "b"]);
});

test("DETERMINISM, AT THE SEAM: a declared package yields a byte-identical CLAIMS artifact", () => {
  const overlay = { [SG]: studyGuide({ head: frontMatter([DECL]) }), [SIDECAR]: sidecar([{ type: "definition", anchor: LH_ANCHOR, termRefs: ["term.latent-heat"] }]) };
  const once = JSON.stringify(extractClaims(makePackage(overlay), fixtureTerms()));
  // A fresh copy of the same bytes at a different path must not move a single id — a claim a human
  // acted on has to be reproducible from the inputs alone, months later, from git.
  assert.equal(JSON.stringify(extractClaims(makePackage(overlay), fixtureTerms())), once);
});
