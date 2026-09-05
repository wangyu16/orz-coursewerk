// Round-2 PROBES — one per adversarial finding (2026-09-05 audits), each a reproduction that FAILED
// before its fix. Kept as the registry's memory: a probe that starts passing for the wrong reason
// is caught by the negative half of each test. Free, offline, deterministic.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computeSemanticIndex, auditIndexFreshness } from "../scripts/lib/semantic_index.mjs";
import { scanConsistency } from "../scripts/lib/consistency.mjs";
import { immutableRegions, unverifiableQuotations, isImmutable } from "../scripts/lib/immutable.mjs";
import { blindBundleDigest, assembleBlindBundle } from "../scripts/lib/blind_bundle.mjs";
import { makeKeyFactBindings, auditKeyFactReview } from "../scripts/lib/key_fact_review.mjs";
import { findLabelOccurrences } from "../scripts/lib/terms.mjs";
import { maskLongerLabels } from "../scripts/lib/propagate.mjs";
import { computeComponentGraph, normalizeMarkdownForHash } from "../scripts/lib/coherence.mjs";
import { scanText, buildSourceIndex } from "../scripts/lib/verbatim.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(REPO, "tests", "fixtures", "usage-package");
const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const cli = (script, a) => { const r = spawnSync(process.execPath, [path.join(REPO, "scripts", script), ...a], { cwd: REPO, encoding: "utf8", env: ENV }); return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" }; };
const git = (cwd, ...a) => spawnSync("git", a, { cwd, encoding: "utf8", env: ENV });
const read = (pkg, rel) => fs.readFileSync(path.join(pkg, rel), "utf8");
const write = (pkg, rel, t) => fs.writeFileSync(path.join(pkg, rel), t);
const edit = (pkg, rel, from, to) => { const s = read(pkg, rel); assert.ok(s.includes(from), `edit target missing in ${rel}: ${from}`); write(pkg, rel, s.replace(from, to)); };
function pkgCopy(t, { indexed = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-audit2-"));
  const pkg = path.join(dir, "package");
  fs.cpSync(FIXTURE, pkg, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(pkg, "init", "-q", "."); git(pkg, "add", "-A"); git(pkg, "commit", "-qm", "baseline");
  if (indexed) { assert.equal(cli("index_components.mjs", ["--root", pkg, "--initialize"]).code, 0); assert.equal(cli("index_semantic.mjs", ["--root", pkg]).code, 0); }
  return { dir, pkg };
}
const commitAll = (pkg, m = "edit") => { git(pkg, "add", "-A"); git(pkg, "commit", "-qm", m); };
function gate(pkg, extra = []) { const json = path.join(pkg, "..", `qa-${Math.random().toString(36).slice(2)}.json`); const r = cli("check_oer.mjs", ["--package", pkg, "--json", json, ...extra]); return { ...r, json: JSON.parse(fs.readFileSync(json, "utf8")) }; }
const queueKinds = (r) => (r.json.semantic?.queue?.items ?? []).map((i) => `${i.kind}:${i.severity}`);
const RENAME = ["--term", "term.melting-point", "--from", "melting point", "--to", "fusion point"];

test("H1 · a study guide that only RESTATES an objective does not cover it; dropping its teaching blocks", (t) => {
  const { pkg } = pkgCopy(t);
  // objective.melting.2 is taught by practice#8 (answer-key) — remove that declaration and the prose
  const sidecar = path.join(pkg, "metadata/claims/practice/melting.json");
  const decl = JSON.parse(fs.readFileSync(sidecar, "utf8"));
  const before = decl.claims.length;
  decl.claims = decl.claims.filter((c) => !(c.spineRefs || []).includes("objective.melting.2"));
  assert.ok(decl.claims.length < before, "fixture must teach objective 2 through a declared answer key");
  fs.writeFileSync(sidecar, JSON.stringify(decl, null, 2));
  const sg = read(pkg, "study-guide/melting.md");
  assert.ok(/learning-objectives|Learning objectives/i.test(sg), "the study guide still restates objective 2 in its list");
  const r = gate(pkg);
  assert.ok(r.json.semantic.coverageBlocks >= 1, `the restated objective must not count as taught: ${queueKinds(r).join(", ")}`);
  assert.notEqual(r.code, 0, "fail-closed in every mode");
});

test("H2/H3 · a wrong ANSWER behind a distractor in the question, or behind a declared type, is compared", () => {
  const terms = { terms: [{ id: "term.melting-point", preferredLabel: "melting point", aliases: [], scope: ["melting"] }] };
  const claim = (id, text, type = "fact", termRefs = ["term.melting-point"]) => ({ id, type, text, scope: "melting", termRefs, spineRefs: [], sourceRefs: [], locations: [{ file: `${id}.md`, anchor: "x#1", offset: 0 }], fingerprints: {}, provenanceDeclared: true });
  const truth = claim("claim.a", "At standard pressure the melting point of pure water is 0 °C.");
  const distractor = claim("claim.b", ":::: tabs\n::: tab Q 1\nA classmate insists the melting point of pure water is 5 °C. What is it?\n:::\n::: tab Answer 1\nIt is 7 °C.\n:::\n::::", "answer-key");
  let findings = scanConsistency({ claims: [truth, distractor] }, terms);
  assert.equal(findings.filter((f) => f.kind === "value-disagreement").length, 1, "the ANSWER (7 °C) disagrees with 0 °C; the distractor is not an assertion");
  // H3: a declared `derived` type on an answer block, and two declared termRefs, no longer opt out
  const derived = claim("claim.c", ":::: tabs\n::: tab Q 2\nGive it.\n:::\n::: tab Answer 2\n9 °C.\n:::\n::::", "derived");
  const twoTerms = claim("claim.d", "The melting point of pure water is 11 °C.", "fact", ["term.melting-point", "term.latent-heat"]);
  findings = scanConsistency({ claims: [truth, derived, twoTerms] }, terms);
  const ids = new Set(findings.flatMap((f) => f.claimIds));
  assert.ok(ids.has("claim.c") && ids.has("claim.d"), `declared type/termRefs cannot opt an answer out: ${JSON.stringify(findings.map((f) => f.claimIds))}`);
  // negative: a genuine range in prose (two values, one dimension, no answer tab) still stays silent
  const range = claim("claim.e", "Melting points range from 0 °C to 3 °C for these samples.");
  assert.equal(scanConsistency({ claims: [truth, range] }, terms).length, 0);
  // and a SCAN-FOUND claim naming two terms keeps the exactly-one-term rule (no subject)
  const scanned = { ...claim("claim.f", "The melting point is 13 °C and the latent heat is 334 J/g.", "fact", ["term.melting-point", "term.latent-heat"]), provenanceDeclared: false };
  assert.equal(scanConsistency({ claims: [truth, scanned] }, terms).length, 0, "the scanner's guess is not the author's assertion");
});

test("H5 · the template's placeholders are refused, and a key fact must be locatable in its usedIn files", (t) => {
  const { pkg } = pkgCopy(t, { indexed: false });
  const foundation = JSON.parse(read(pkg, "metadata/FOUNDATION.json"));
  const template = JSON.parse(fs.readFileSync(path.join(REPO, "templates/key-fact-review.example.json"), "utf8"));
  template.reviewedAt = "2026-09-05";
  template.keyFacts[0].evidenceSourceIds = [foundation.sources[0].id];
  template.keyFacts[0].usedIn = ["study-guide/melting.md"];
  template.independence.bundleSha256 = blindBundleDigest(pkg);
  template.bindings = makeKeyFactBindings(pkg);
  write(pkg, "metadata/KEY_FACT_REVIEW.json", JSON.stringify(template));
  const audit = auditKeyFactReview(pkg, foundation);
  assert.equal(audit.ready, false);
  assert.ok(audit.failures.filter((f) => /placeholder/.test(f)).length >= 3, audit.failures.join("\n"));
  // a real review whose fact is about NOTHING in the package is refused too
  const real = { ...template, authoringSystem: "author", authoringModelId: "m1", reviewer: { type: "ai", name: "rev", modelId: "m1" },
    independence: { ...template.independence, approach: "A fresh context reviewed only the assembled bundle after drafting ended." },
    checks: template.checks.map((c) => ({ ...c, note: "Examined independently against the bundle; nothing to qualify here." })),
    keyFacts: [{ ...template.keyFacts[0], claim: "The boiling point of ethanol is 78 °C at sea level.", note: "Traced against the bundle; consistent with the declared source." }] };
  write(pkg, "metadata/KEY_FACT_REVIEW.json", JSON.stringify(real));
  const audit2 = auditKeyFactReview(pkg, foundation);
  assert.ok(audit2.failures.some((f) => /not supported by its usedIn/.test(f)), audit2.failures.join("\n"));
  // and a fact the study guide states passes that check
  const good = { ...real, keyFacts: [{ ...real.keyFacts[0], claim: "At standard pressure the melting point of pure water is 0 °C." }] };
  write(pkg, "metadata/KEY_FACT_REVIEW.json", JSON.stringify(good));
  assert.deepEqual(auditKeyFactReview(pkg, foundation).failures.filter((f) => /not supported|placeholder/.test(f)), []);
});

test("H6 · reordering `## Objectives` re-parents declared claims — blocked as spine-relabeled", (t) => {
  const { pkg } = pkgCopy(t);
  const map = read(pkg, "concepts/melting.md");
  const m = /## Objectives\n1\. (.*)\n2\. (.*)\n/.exec(map);
  assert.ok(m, "fixture map has two objectives");
  write(pkg, "concepts/melting.md", map.replace(`1. ${m[1]}\n2. ${m[2]}\n`, `1. ${m[2]}\n2. ${m[1]}\n`));
  const r = gate(pkg, ["--for-discovery"]);
  assert.ok(queueKinds(r).some((k) => k.startsWith("sanity-check:blocking")), `must block: ${queueKinds(r).join(", ")}`);
  assert.ok(r.json.discoverability.blockers.some((b) => /semantic review queue/.test(b)));
});

test("H7 · JSON front matter (rendered as visible text) fails the format contract; the sidecar does not", (t) => {
  const { pkg } = pkgCopy(t, { indexed: false });
  const clean = gate(pkg).json.criticalCounts.formatContractFailures;
  write(pkg, "study-guide/melting.md", '---\n{"schemaVersion": 1, "claims": []}\n---\n' + read(pkg, "study-guide/melting.md"));
  const r = gate(pkg);
  assert.equal(r.json.criticalCounts.formatContractFailures, clean + 1);
  assert.ok(JSON.stringify(r.json.formatContracts).includes("front matter"));
});

test("H8 · a whitespace reflow moves neither the component hash nor the key-fact bindings; a visible change moves both", (t) => {
  const { pkg } = pkgCopy(t, { indexed: false });
  const before = { graph: computeComponentGraph(pkg), bindings: makeKeyFactBindings(pkg) };
  const sg = read(pkg, "study-guide/melting.md");
  write(pkg, "study-guide/melting.md", sg.replace("At standard pressure the melting point", "At standard pressure   the melting point").replace(/\n/g, "\r\n"));
  const reflowed = { graph: computeComponentGraph(pkg), bindings: makeKeyFactBindings(pkg) };
  const hashOf = (g) => g.components.find((c) => c.path === "study-guide/melting.md").hash;
  assert.equal(hashOf(reflowed.graph), hashOf(before.graph), "reflow is free at the file layer too");
  assert.equal(reflowed.bindings.deliverableTreeSha256, before.bindings.deliverableTreeSha256);
  write(pkg, "study-guide/melting.md", sg.replace("0 °C", "5 °C"));
  const changed = { graph: computeComponentGraph(pkg), bindings: makeKeyFactBindings(pkg) };
  assert.notEqual(hashOf(changed.graph), hashOf(before.graph));
  assert.notEqual(changed.bindings.deliverableTreeSha256, before.bindings.deliverableTreeSha256);
  assert.equal(normalizeMarkdownForHash("a  b \r\n\r\n\r\nc"), "a b\n\nc\n");
});

test("M1/#2 · hard-wrapped, „…“, «…» and ‘…’ quotations are immutable; a blank line ends a quotation", () => {
  const text = 'Intro. "the melting point of pure\nwater is 0 °C" and „der Schmelzpunkt von Eis ist 0 °C“ and «le point de fusion» and ‘the melting point of ice’.\n\n"unterminated\n\nnot a quote';
  const regions = immutableRegions(text, null).filter((r) => r.kind === "quote");
  for (const needle of ["pure\nwater", "Schmelzpunkt", "point de fusion", "melting point of ice"]) {
    const at = text.indexOf(needle);
    assert.ok(isImmutable(regions, at), `${JSON.stringify(needle)} must be inside a quote region`);
  }
  assert.equal(isImmutable(regions, text.indexOf("not a quote")), false, "a blank line ends a quotation; a stray mark swallows nothing");
});

test("M2 · a silent deletion inside a verbatim quotation is unverifiable; a MARKED elision is allowed", () => {
  const source = "At standard pressure the melting point of pure water is zero degrees Celsius, which every student should remember.";
  const silent = 'The book says "the melting point of water is zero degrees Celsius, which every student should remember".';
  const marked = 'The book says "the melting point of … water is zero degrees Celsius, which every student should remember".';
  const faithful = 'The book says "the melting point of pure water is zero degrees Celsius, which every student should remember".';
  assert.equal(unverifiableQuotations(silent, source).length, 1, "dropping 'pure' without a mark is a rewrite");
  assert.equal(unverifiableQuotations(marked, source).length, 0, "an ellipsis buys the gap");
  assert.equal(unverifiableQuotations(faithful, source).length, 0);
});

test("M3 · a repeated heading slug cannot silently rebind a declaration", (t) => {
  const { pkg } = pkgCopy(t);
  const sg = read(pkg, "study-guide/melting.md");
  write(pkg, "study-guide/melting.md", sg + "\n## Melting point of pure water\nAt standard pressure the melting point of pure water is 32 °F.\n");
  const index = computeSemanticIndex(pkg);
  const declared = index.claims.claims.filter((c) => c.provenanceDeclared && c.locations[0].file === "study-guide/melting.md" && c.locations[0].anchor.startsWith("melting-point-of-pure-water#"));
  assert.ok(declared.every((c) => !c.text.includes("32 °F")), "the declaration stays on the FIRST section's block");
  // and a declaration that targets the REPEATED section is refused, not bound
  const sidecarFile = path.join(pkg, "metadata/claims/study-guide/melting.json");
  const sc = JSON.parse(fs.readFileSync(sidecarFile, "utf8"));
  const under = index.claims.claims.filter((c) => c.locations[0].file === "study-guide/melting.md" && c.text.includes("32 °F"));
  assert.equal(under.length, 1, "the 32 °F block exists as a scan-found claim");
  sc.claims.push({ type: "fact", anchor: under[0].locations[0].anchor, spineRefs: ["objective.melting.1"], sourceRefs: [], termRefs: ["term.melting-point"] });
  fs.writeFileSync(sidecarFile, JSON.stringify(sc, null, 2));
  const r = gate(pkg);
  assert.ok(queueKinds(r).some((k) => k.startsWith("declaration-refused")), queueKinds(r).join(", "));
  assert.ok(!computeSemanticIndex(pkg).claims.claims.some((c) => c.provenanceDeclared && c.text.includes("32 °F")), "never bound");
});

test("M4 · an override for a nonexistent claim is refused at record time and reported at the gate", (t) => {
  const { pkg } = pkgCopy(t);
  const res = cli("record_override.mjs", ["--root", pkg, "--claim-id", "claim.melting.000000000000", "--diverges-from", "src#1", "--basis", "instructor-expertise", "--authorized-by", "x", "--date", "2026-09-05", "--rationale", "Testing a forged id is refused by the recorder."]);
  assert.equal(res.code, 2); assert.match(res.stderr, /no claim claim\.melting\.000000000000/);
  const forced = cli("record_override.mjs", ["--root", pkg, "--claim-id", "claim.melting.000000000000", "--diverges-from", "src#1", "--basis", "instructor-expertise", "--authorized-by", "x", "--date", "2026-09-05", "--rationale", "Testing a forged id is refused by the recorder.", "--force"]);
  assert.equal(forced.code, 0, forced.stderr);
  commitAll(pkg);
  const r = gate(pkg);
  assert.ok(queueKinds(r).some((k) => k.startsWith("dangling-reference")), queueKinds(r).join(", "));
});

test("M5 · a near-miss concept-map heading is named as such, because the parser mints nothing for it", (t) => {
  const { pkg } = pkgCopy(t, { indexed: false });
  edit(pkg, "concepts/melting.md", "## Objectives", "## Objectives for this chapter");
  const r = gate(pkg);
  assert.ok(JSON.stringify(r.json.formatContracts).includes("NEAR-MISS"), JSON.stringify(r.json.formatContracts).slice(0, 400));
});

test("M7 · copied source text inside a code fence is still a verbatim span", () => {
  const source = "Melting is the process by which a substance changes from the solid phase to the liquid phase when heated to its melting point under a given pressure; the internal energy rises and the molecules escape their lattice.";
  const fenced = "Intro.\n\n```text\n" + source + "\n```\n";
  const spans = scanText(fenced, buildSourceIndex([source]));
  assert.ok(spans.length >= 1, "a fence renders as visible text and is scanned");
});

test("M10 · asserting the map's own misconception is blocking", (t) => {
  const { pkg } = pkgCopy(t);
  const map = read(pkg, "concepts/melting.md");
  const mis = /## Misconceptions to surface\n- (.*)\n/.exec(map);
  assert.ok(mis, "fixture map declares a misconception");
  write(pkg, "study-guide/melting.md", read(pkg, "study-guide/melting.md") + `\n## A note\n${mis[1]}\n`);
  const r = gate(pkg, ["--for-discovery"]);
  assert.ok(queueKinds(r).some((k) => k === "misconception-asserted:blocking"), queueKinds(r).join(", "));
});

test("#1/#16b · a deleted index artifact is STALE (not fresh), blocks release; CRLF is not staleness", (t) => {
  const { pkg } = pkgCopy(t);
  fs.rmSync(path.join(pkg, "metadata/TERMS.json"));
  commitAll(pkg, "deleted terms");
  const f = auditIndexFreshness(pkg, computeSemanticIndex(pkg));
  assert.equal(f.fresh, false); assert.ok(f.stale.some((s) => s.path === "metadata/TERMS.json" && s.storedBytes === null));
  const r = gate(pkg, ["--for-discovery"]);
  assert.ok(r.json.discoverability.blockers.some((b) => /INCOMPLETE|stale/.test(b)), r.json.discoverability.blockers.join("\n"));
  // CRLF
  const { pkg: p2 } = pkgCopy(t);
  write(p2, "metadata/SPINE.json", read(p2, "metadata/SPINE.json").replace(/\n/g, "\r\n"));
  assert.equal(auditIndexFreshness(p2, computeSemanticIndex(p2)).fresh, true);
});

test("#10 · a scratch file elsewhere does not hide a committed strand", (t) => {
  const { pkg } = pkgCopy(t);
  const spine = JSON.parse(read(pkg, "metadata/SPINE.json")); spine.edges = []; write(pkg, "metadata/SPINE.json", JSON.stringify(spine, null, 2) + "\n");
  commitAll(pkg, "stale spine");
  write(pkg, "scratch.txt", "notes");
  const r = gate(pkg);
  assert.ok(queueKinds(r).some((k) => k.startsWith("stale-index")), queueKinds(r).join(", "));
});

test("#12/#13/#14 · symlinks are refused and named; digest sorts by code point; boundaries are any-script", (t) => {
  const { pkg } = pkgCopy(t, { indexed: false });
  fs.writeFileSync(path.join(pkg, "..", "outside.md"), "# Outside\n");
  fs.symlinkSync(path.join(pkg, "..", "outside.md"), path.join(pkg, "study-guide", "extra.md"));
  const bundle = assembleBlindBundle(pkg);
  assert.ok(bundle.excluded.some((e) => e.path === "study-guide/extra.md" && /symbolic link/.test(e.reason)));
  assert.ok(!bundle.deliverables.some((d) => d.path === "study-guide/extra.md"));
  const r = gate(pkg);
  assert.ok(r.json.criticalCounts.layoutErrors >= 1 && JSON.stringify(r.json.contract).includes("symbolic links"));
  assert.deepEqual(findLabelOccurrences("Die Schmelzpunktänderung ist klein; der Schmelzpunkt auch.", "Schmelzpunkt").map((o) => o.start), [text_index("Die Schmelzpunktänderung ist klein; der Schmelzpunkt auch.", "Schmelzpunkt", 2)]);
  function text_index(s, needle, nth) { let i = -1; for (let k = 0; k < nth; k++) i = s.indexOf(needle, i + 1); return i; }
});

test("#3 · a rename never edits inside a LONGER label of another term", () => {
  const terms = { terms: [{ id: "term.melting-point", preferredLabel: "melting point", aliases: ["fusion point"] }, { id: "term.mpd", preferredLabel: "melting point depression", aliases: [] }] };
  const text = "The melting point is 0 °C; salt causes melting point depression of 1.86 °C per mole.";
  const occ = maskLongerLabels(text, findLabelOccurrences(text, "melting point"), "melting point", "term.melting-point", terms);
  assert.deepEqual(occ.map((o) => o.start), [4]);
});

test("#4/#5/#6/#7/#8 · propagate reaches prose, binds --apply to the plan you read, receipts before committing, refuses no-git, touches no .gitignore", (t) => {
  const { pkg, dir } = pkgCopy(t);
  const out = path.join(dir, "reports");
  // #6: apply without a plan is refused; a plan from another HEAD is refused
  assert.equal(cli("propagate.mjs", ["--root", pkg, "--out", out, ...RENAME, "--apply"]).code, 4);
  let plan = cli("propagate.mjs", ["--root", pkg, "--out", out, ...RENAME]); assert.equal(plan.code, 0, plan.stderr);
  const planned = JSON.parse(plan.stdout);
  assert.ok(planned.proseEdits > 0, "prose outside claim blocks is reached");
  write(pkg, "practice/melting.md", read(pkg, "practice/melting.md") + "\nThe melting point of ethanol is -114 °C.\n"); commitAll(pkg, "new sentence");
  const stale = cli("propagate.mjs", ["--root", pkg, "--out", out, ...RENAME, "--apply"]);
  assert.equal(stale.code, 4); assert.match(stale.stderr, /HEAD|changed since/);
  // re-plan, then apply: no stray "melting point" survives outside immutable regions
  assert.equal(cli("propagate.mjs", ["--root", pkg, "--out", out, ...RENAME]).code, 0);
  const planned2 = JSON.parse(fs.readFileSync(path.join(out, "propagation-plan.json"), "utf8"));
  const beforeIndex = computeSemanticIndex(pkg);
  const heldSpans = planned2.heldForReview.map((h) => beforeIndex.claims.claims.find((c) => c.id === h.claimId)).filter(Boolean).map((c) => ({ file: c.locations[0].file, start: c.locations[0].offset, end: c.locations[0].offset + c.text.length }));
  const gitignoreBefore = fs.existsSync(path.join(pkg, ".gitignore")) ? read(pkg, ".gitignore") : null;
  const applied = cli("propagate.mjs", ["--root", pkg, "--out", out, ...RENAME, "--apply"]);
  assert.equal(applied.code, 0, applied.stderr);
  const receipt = JSON.parse(fs.readFileSync(path.join(out, "propagation-receipt.json"), "utf8"));
  for (const top of ["study-guide", "slides", "assessment-support", "practice"]) {
    for (const name of fs.readdirSync(path.join(pkg, top))) {
      const text = read(pkg, `${top}/${name}`);
      const regions = immutableRegions(text, null);
      const onHeading = (at) => /^[ \t]{0,3}#{1,6}[ \t]/.test(text.slice(text.lastIndexOf("\n", at - 1) + 1, at));
      for (const o of findLabelOccurrences(text, "melting point"))
        assert.ok(isImmutable(regions, o.start) || onHeading(o.start) || heldSpans.some((h) => h.file === `${top}/${name}`),
          `${top}/${name}@${o.start}: an unprotected "melting point" survived`);
      // every surviving heading occurrence is NAMED in the receipt (protected offsets are before-text)
      for (const o of findLabelOccurrences(text, "melting point")) if (onHeading(o.start))
        assert.ok(receipt.protected.some((p) => p.file === `${top}/${name}` && /heading/.test(p.reason)), `${top}/${name}: heading occurrence not named in the receipt`);
    }
  }
  assert.ok(read(pkg, "study-guide/melting.md").includes('"the melting point of pure water at standard pressure is 0 °C"'), "the quotation is intact");
  assert.equal(git(pkg, "status", "--porcelain").stdout.trim(), "", "tree clean after apply — no .gitignore side effect");
  assert.equal(fs.existsSync(path.join(pkg, ".gitignore")) ? read(pkg, ".gitignore") : null, gitignoreBefore);
  // #5: a failing commit still leaves a receipt
  const { pkg: p2, dir: d2 } = pkgCopy(t);
  const out2 = path.join(d2, "reports");
  assert.equal(cli("propagate.mjs", ["--root", p2, "--out", out2, ...RENAME]).code, 0);
  fs.writeFileSync(path.join(p2, ".git/hooks/pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const failed = cli("propagate.mjs", ["--root", p2, "--out", out2, ...RENAME, "--apply"]);
  assert.equal(failed.code, 5);
  const rec2 = JSON.parse(fs.readFileSync(path.join(out2, "propagation-receipt.json"), "utf8"));
  assert.ok(rec2.applied.length > 0 && rec2.gitError, "receipt exists and names the commit failure");
  // #7: no git → refused
  const { pkg: p3, dir: d3 } = pkgCopy(t, { indexed: false });
  fs.rmSync(path.join(p3, ".git"), { recursive: true, force: true });
  cli("propagate.mjs", ["--root", p3, "--out", path.join(d3, "reports"), ...RENAME]);
  assert.equal(cli("propagate.mjs", ["--root", p3, "--out", path.join(d3, "reports"), ...RENAME, "--apply"]).code, 3);
});
