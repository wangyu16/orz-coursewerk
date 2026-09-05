// Inline anchors (G22) — identity that travels with the prose, and the two gates that keep it honest.
//
// The reorder was the one preregistered study case the index could not pass (11/12): a positional
// anchor moves with position, so swapping two objectives read as two claims removed and two strangers
// added. A DECLARED positional anchor made it worse: it "passed" only when the author left the sidecar
// stale (metadata vouching for prose it no longer matched). These tests prove the contract's fix:
// `[anchor: slug]` keeps the id across a reorder; the reorder is reported as RECHECK (order is
// prerequisite structure) and an insert/delete elsewhere rechecks nobody; a partially anchored list or
// a repeated slug is refused; a declaration by `@slug` travels; a stale declaration is refused.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeSemanticIndex } from "../scripts/lib/semantic_index.mjs";
import { anchorCoverage, positionalDeclarationsOnAnchoredItems, artifactAnchors, matchClaims } from "../scripts/lib/claims.mjs";
import { claimImpact } from "../scripts/lib/coherence.mjs";
import { splitAnchorMarker } from "../scripts/lib/terms.mjs";
import { buildSpine, readConceptMaps } from "../scripts/lib/spine.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(REPO, "tests", "fixtures", "mini-package");
const SG = "study-guide/phase-change.md";
const OBJ1 = "1. State the melting point of water at standard pressure. [anchor: obj-melting-point]";
const OBJ2 = "2. Explain why temperature is constant during a phase change. [anchor: obj-constant-temperature]";

function stage(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-anchors-"));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const read = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
const write = (root, rel, text) => fs.writeFileSync(path.join(root, rel), text);
const edit = (root, rel, from, to) => { const s = read(root, rel); assert.ok(s.includes(from), `edit target missing: ${from}`); write(root, rel, s.replace(from, to)); };
const objectives = (index) => index.claims.claims.filter((c) => c.locations[0].file === SG && c.locations[0].anchor.startsWith("objectives#"));
const impactOf = (root, before, after) => claimImpact(root, before.claims, after.claims, after.terms, {});

test("A.0 · the marker is metadata: lifted off the text on both sides, never inside a fingerprint", (t) => {
  assert.deepEqual(splitAnchorMarker("State it. [anchor: Obj-One]"), { text: "State it.", slug: "obj-one" });
  assert.deepEqual(splitAnchorMarker("State it."), { text: "State it.", slug: null });
  assert.deepEqual(splitAnchorMarker("[anchor: x] not trailing"), { text: "[anchor: x] not trailing", slug: null });
  const root = stage(t);
  const index = computeSemanticIndex(root);
  const objs = objectives(index);
  assert.equal(objs.length, 2);
  for (const c of objs) {
    assert.ok(!c.text.includes("[anchor:"), "the claim text carries no marker");
    assert.match(c.anchorSlug, /^obj-/);
  }
  const spine = buildSpine(readConceptMaps(root));
  for (const n of spine.nodes.filter((n) => n.kind === "objective")) assert.ok(!n.label.includes("[anchor:"), "the spine label carries no marker");
  // a package WITHOUT markers is byte-identical to before: the positional regime is untouched
  const plain = stage(t);
  for (const rel of [SG, "concepts/phase-change.md"]) write(plain, rel, read(plain, rel).replace(/ \[anchor: [a-z0-9-]+\]/g, ""));
  const plainIndex = computeSemanticIndex(plain);
  assert.ok(objectives(plainIndex).every((c) => !("anchorSlug" in c)));
  assert.deepEqual(anchorCoverage(plain), []);
});

test("A.1 · a REORDER keeps both ids, and is reported as RECHECK — not as removed + added", (t) => {
  const root = stage(t);
  const before = computeSemanticIndex(root);
  const [b1, b2] = objectives(before).sort((a, b) => a.locations[0].anchor.localeCompare(b.locations[0].anchor));
  edit(root, SG, `${OBJ1}\n${OBJ2}`, `1. ${OBJ2.slice(3)}\n2. ${OBJ1.slice(3)}`);
  const after = computeSemanticIndex(root);
  const [a1, a2] = objectives(after).sort((a, b) => a.locations[0].anchor.localeCompare(b.locations[0].anchor));
  // ids preserved, positions swapped
  assert.equal(a1.id, b2.id); assert.equal(a2.id, b1.id);
  assert.equal(a1.locations[0].anchor, "objectives#1"); assert.equal(a1.anchorSlug, "obj-constant-temperature");
  const m = matchClaims(before.claims, after.claims);
  assert.deepEqual(m.added, []); assert.deepEqual(m.removed, []);
  assert.equal(m.matched.length, before.claims.claims.length, "every claim matched across the reorder");
  // and the verdict is RECHECK for exactly the two reordered claims
  const impact = impactOf(root, before, after);
  const verdicts = new Map(impact.actions.map((a) => [a.claimId, a.action]));
  assert.equal(verdicts.get(b1.id), "RECHECK"); assert.equal(verdicts.get(b2.id), "RECHECK");
  assert.equal(impact.actions.length, 2, `only the reordered pair: ${JSON.stringify(impact.actions.map((a) => a.claimId))}`);
  assert.deepEqual(impact.silentRisk, []);
});

test("A.2 · insert-invariance: adding an objective at the top rechecks nobody; a null reindex rechecks nobody", (t) => {
  const root = stage(t);
  const before = computeSemanticIndex(root);
  assert.equal(impactOf(root, before, computeSemanticIndex(root)).actions.length, 0, "no edit, no action");
  edit(root, SG, OBJ1, `1. Define a phase of matter. [anchor: obj-phase]\n2. ${OBJ1.slice(3)}`);
  const after = computeSemanticIndex(root);
  const kept = objectives(before).map((c) => c.id);
  const impact = impactOf(root, before, after);
  for (const id of kept) assert.ok(!impact.actions.some((a) => a.claimId === id && a.action === "RECHECK"), `${id}: relative order unchanged, must not RECHECK`);
  const m = matchClaims(before.claims, after.claims);
  assert.equal(m.removed.length, 0, "the shifted anchored items are not removed");
});

test("A.3 · slug-coverage gate: all or none per list, unique per file — inactive on an unanchored package", (t) => {
  const root = stage(t);
  assert.deepEqual(anchorCoverage(root), [], "the fixture is fully anchored");
  // a mixed list: one item lost its marker
  edit(root, SG, OBJ2, OBJ2.replace(" [anchor: obj-constant-temperature]", ""));
  let gate = anchorCoverage(root);
  assert.equal(gate.length, 1);
  assert.equal(gate[0].file, SG); assert.equal(gate[0].section, "objectives");
  assert.deepEqual(gate[0].unanchored, ["objectives#2"]);
  // a duplicate slug
  const dup = stage(t);
  edit(dup, SG, "[anchor: obj-constant-temperature]", "[anchor: obj-melting-point]");
  gate = anchorCoverage(dup);
  assert.equal(gate.length, 1);
  assert.deepEqual(gate[0].duplicateSlugs, ["obj-melting-point"]);
  assert.deepEqual(gate[0].unanchored, []);
});

test("A.4 · a declaration may address a block by @slug, and then travels with the prose through a reorder", (t) => {
  const root = stage(t);
  const sidecar = path.join(root, "metadata", "claims", "study-guide");
  fs.mkdirSync(sidecar, { recursive: true });
  fs.writeFileSync(path.join(sidecar, "phase-change.json"), JSON.stringify({ schemaVersion: 1, claims: [
    { type: "objective", anchor: "@obj-melting-point", spineRefs: ["objective.phase-change.1"], sourceRefs: [], termRefs: ["term.melting-point"] },
  ] }));
  const before = computeSemanticIndex(root);
  const declared = objectives(before).find((c) => c.provenanceDeclared);
  assert.ok(declared, "the @slug declaration resolved to a block");
  assert.equal(declared.anchorSlug, "obj-melting-point");
  assert.deepEqual(declared.spineRefs, ["objective.phase-change.1"]);
  assert.ok(artifactAnchors(root).find((a) => a.file === SG).anchors.includes("@obj-melting-point"), "the vocabulary names the slug form (no dangling-anchor row)");
  assert.deepEqual(positionalDeclarationsOnAnchoredItems(root), [], "a @slug declaration is the right form");
  // reorder WITHOUT touching the sidecar: the declaration still binds the melting objective
  edit(root, SG, `${OBJ1}\n${OBJ2}`, `1. ${OBJ2.slice(3)}\n2. ${OBJ1.slice(3)}`);
  const after = computeSemanticIndex(root);
  const moved = objectives(after).find((c) => c.provenanceDeclared);
  assert.equal(moved.id, declared.id);
  assert.equal(moved.locations[0].anchor, "objectives#2", "it moved with the prose");
  assert.ok(moved.text.includes("State the melting point"), "and it is still the melting objective — no mis-binding");
  assert.deepEqual(positionalDeclarationsOnAnchoredItems(root), []);
});

test("A.5 · a POSITIONAL declaration on an anchored item is refused — the stale-sidecar mis-binding cannot be rewarded", (t) => {
  const root = stage(t);
  const sidecar = path.join(root, "metadata", "claims", "study-guide");
  fs.mkdirSync(sidecar, { recursive: true });
  // the G22 scenario B: a positional declaration for objectives#1 asserting the melting term
  fs.writeFileSync(path.join(sidecar, "phase-change.json"), JSON.stringify({ schemaVersion: 1, claims: [
    { type: "objective", anchor: "objectives#1", spineRefs: ["objective.phase-change.1"], sourceRefs: [], termRefs: ["term.melting-point"] },
  ] }));
  const gate = positionalDeclarationsOnAnchoredItems(root);
  assert.equal(gate.length, 1, "refused before any reorder can mis-bind it");
  assert.deepEqual(gate[0], { file: SG, anchor: "objectives#1", slug: "obj-melting-point", declaredType: "objective" });
  // and the reorder shows WHY: left stale, the positional declaration now vouches for the other objective
  edit(root, SG, `${OBJ1}\n${OBJ2}`, `1. ${OBJ2.slice(3)}\n2. ${OBJ1.slice(3)}`);
  const after = computeSemanticIndex(root);
  const declared = objectives(after).find((c) => c.provenanceDeclared);
  assert.ok(declared.text.includes("temperature is constant"), "the stale metadata binds the wrong prose — exactly what the refusal prevents");
  // unanchored packages are untouched: no slug, no refusal
  const plain = stage(t);
  for (const rel of [SG, "concepts/phase-change.md"]) write(plain, rel, read(plain, rel).replace(/ \[anchor: [a-z0-9-]+\]/g, ""));
  fs.mkdirSync(path.join(plain, "metadata", "claims", "study-guide"), { recursive: true });
  fs.writeFileSync(path.join(plain, "metadata", "claims", "study-guide", "phase-change.json"), JSON.stringify({ schemaVersion: 1, claims: [
    { type: "objective", anchor: "objectives#1", spineRefs: ["objective.phase-change.1"], sourceRefs: [], termRefs: ["term.melting-point"] },
  ] }));
  assert.deepEqual(positionalDeclarationsOnAnchoredItems(plain), []);
});
