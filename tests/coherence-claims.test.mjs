// M5 claim-level coherence tests — written as a defense of `silentRisk`, not a demo of `affected`.
//
// The order is deliberate. The silent-risk test is FIRST because it is the only output whose
// absence would make this module decorative: `affected` and `actions` restate facts other modules
// could recompute, but a claim that a change REACHES and whose fingerprints DID NOT MOVE is
// invisible to every other detector in the system — M3 sees no move, M4 returns NONE, and the
// package reports a clean bill of health it has not earned. If this file proves one thing, it is
// that the answer key still saying "100 °C" after the study guide says "0 °C" lands in
// `silentRisk` while every other signal in the system says "nothing happened".
//
// Every assertion is paired with its negative. It is not enough that the answer key appears in
// `silentRisk`; the objective that shares NO vocabulary with the change must be provably absent
// from `affected`, because an impact set that contains everything is the byte-hash bug wearing a
// claim-shaped hat — and that bug is the reason this index exists.
//
// Free, deterministic, no network. The golden fixture is treated as READ-ONLY: every mutation runs
// against a fresh mkdtemp copy, which is cleaned up.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTerms } from "../scripts/lib/terms.mjs";
import { extractClaims } from "../scripts/lib/claims.mjs";
import { claimImpact } from "../scripts/lib/coherence.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(repo, "tests/fixtures/mini-package");

/** A throwaway copy of the golden fixture. The fixture itself is never mutated. */
function tempPackage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-m5-"));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

/** The package's concept maps, as `buildTerms` takes them (interfaces §1). */
function packageTerms(root) {
  const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
  return buildTerms([
    { file: "concepts/course.md", text: read("concepts/course.md"), scope: "course" },
    { file: "concepts/phase-change.md", text: read("concepts/phase-change.md"), scope: "phase-change" },
  ]);
}

/** The claim whose text starts with `prefix` — a readable handle for a hashed id. */
function idOf(claims, prefix) {
  const hits = claims.claims.filter((c) => c.text.startsWith(prefix));
  assert.equal(hits.length, 1, `expected exactly one claim starting ${JSON.stringify(prefix)}, got ${hits.length}`);
  return hits[0].id;
}

const SG = "study-guide/phase-change.md";
const FACT = "At standard pressure the melting point of water";
const ANSWER = "1. What is the melting point of water at standard pressure?";
const OBJ_MELTING = "1. State the melting point of water";
const OBJ_TEMPERATURE = "2. Explain why temperature is constant";

/**
 * THE case this module exists for, built from the golden fixture's own prose.
 *
 * `study-guide/phase-change.md` asserts the melting point of water is 100 °C.
 * `practice/phase-change.md` answers the same question with "**Answer:** 100 °C".
 * Change the study guide to 0 °C and the answer key's OWN text does not move one byte — so its
 * five fingerprints are identical, M4 returns NONE, and the package now contains a direct
 * self-contradiction that no per-claim signal will ever report.
 */
function meltingPointValueChange() {
  const root = tempPackage();
  const terms = packageTerms(root);
  const before = extractClaims(root, terms);
  const file = path.join(root, SG);
  const original = fs.readFileSync(file, "utf8");
  const edited = original.replace("melting point of water is 100 °C", "melting point of water is 0 °C");
  assert.notEqual(edited, original, "the fixture's prose must actually have been edited");
  fs.writeFileSync(file, edited, "utf8");
  const after = extractClaims(root, terms);
  return { root, terms, before, after };
}

test("silentRisk: an answer key derived from a changed value, whose own text never moved", (t) => {
  const { root, terms, before, after } = meltingPointValueChange();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const answerId = idOf(before, ANSWER);
  const factId = idOf(before, FACT);

  // The premise the whole test rests on: the answer key is byte-identical across the edit, so
  // every fingerprint layer it has is unmoved. If this ever fails, the test below is vacuous.
  const answerBefore = before.claims.find((c) => c.id === answerId);
  const answerAfter = after.claims.find((c) => c.id === answerId);
  assert.deepEqual(answerAfter.fingerprints, answerBefore.fingerprints, "answer key's fingerprints must be unmoved");
  assert.ok(answerAfter.text.includes("100 °C"), "the answer key still says 100 °C");
  assert.ok(
    after.claims.find((c) => c.id === factId).text.includes("0 °C"),
    "the study guide now says 0 °C — the package contradicts itself",
  );

  const out = claimImpact(root, before, after, terms);

  // THE assertion.
  const silent = out.silentRisk.map((s) => s.claimId);
  assert.ok(silent.includes(answerId), `answer key must be flagged as silent risk; got ${JSON.stringify(silent)}`);

  // Its negative, and the reason the field is not redundant: NOTHING ELSE FLAGS IT. M4's verb for
  // this claim is NONE — the change is invisible to the per-claim signal.
  const answerAction = out.actions.find((a) => a.claimId === answerId);
  assert.equal(answerAction.action, "NONE", "M4 must see nothing — that is precisely why silentRisk exists");

  // The claim that actually changed is reached, but is NOT a silent risk: its fingerprints moved,
  // so the ordinary signal already covers it. A silentRisk entry for it would be double-reporting.
  assert.ok(out.affected.includes(factId), "the changed claim is itself affected");
  assert.ok(!silent.includes(factId), "a claim whose fingerprints moved is never a silent risk");

  // The entry carries the reach as STRUCTURE, not prose (§5c): a human asked "reached by what?"
  // must not have to parse a sentence.
  const entry = out.silentRisk.find((s) => s.claimId === answerId);
  assert.deepEqual(entry.reachedFrom, [factId], "silentRisk names the seed that reached it");
  assert.deepEqual(entry.via, ["shared-term"], "silentRisk names the relation that reached it");
});

test("affected: a claim sharing no vocabulary with the change is absent (noise is a defect)", (t) => {
  const { root, terms, before, after } = meltingPointValueChange();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const unrelated = idOf(before, OBJ_TEMPERATURE); // "Explain why temperature is constant…" — termRefs []
  const answerId = idOf(before, ANSWER);

  const out = claimImpact(root, before, after, terms);

  assert.ok(!out.affected.includes(unrelated), "a claim sharing no term and no spine must NOT be reached");
  assert.ok(!out.silentRisk.some((s) => s.claimId === unrelated), "…and must not be a silent risk either");
  assert.ok(!out.actions.some((a) => a.claimId === unrelated), "…and must not carry an action");
  // The negative's negative: the mechanism is live, not merely silent about everything.
  assert.ok(out.affected.includes(answerId), "the answer key IS reached — the relation works");

  // FINDING 4, now CLOSED: the objective naming the melting point asserts no value ("State the
  // melting point of water at standard pressure"), so a change to the VALUE cannot silently
  // contradict it — it is exactly as true at 0 °C as at 100 °C. A value change (content moved, no
  // rename, seed states a quantity) reaches by term only the sharers that themselves state a value,
  // so the objective is NOT reached. The answer key (asserted above) still is: it restates "100 °C".
  assert.ok(!out.affected.includes(idOf(before, OBJ_MELTING)), "objective naming the term but stating no value is NOT reached by a value change");
});

/**
 * THE WIRE TEST. Every other derivation test in this file builds its claims BY HAND — which is
 * exactly how `derivedFrom` stayed a field with NO PRODUCER: declared in `claims.schema.json` and
 * spec §2.2, traversed by this module, and written by nothing. A hand-built fixture cannot tell you
 * the wire is connected; it can only tell you your consumer agrees with your own mock.
 *
 * So this one runs end to end on REAL bytes: a declaration sidecar on disk -> M12's
 * `declaredProvenance` -> M2's `extractClaims` -> a real claim carrying a real `derivedFrom` ->
 * M5 walking the AUTHORED edge. It asserts the field's presence in the extracted claim BEFORE it
 * asserts anything about reachability, so a producer regression fails where the defect IS rather
 * than three inferences downstream.
 *
 * The edge is isolated on purpose: the target shares NO term with the changed claim, so co-mention
 * cannot reach it and `derivedFrom` is the only path.
 */
function declaredDerivationPackage() {
  const root = tempPackage();
  const terms = packageTerms(root);

  // Anchors and ids are hashes — discover them from a real extraction rather than hardcoding.
  const base = extractClaims(root, terms);
  const factId = idOf(base, FACT);
  const objective = base.claims.find((c) => c.text.startsWith(OBJ_TEMPERATURE));

  // A sidecar declares the objective as DERIVED FROM the melting-point fact. A sidecar rather than
  // front matter so the artifact's prose — and therefore every anchor and offset — is untouched.
  const sidecar = path.join(root, "private/coursewerk/claims/study-guide/phase-change.json");
  fs.mkdirSync(path.dirname(sidecar), { recursive: true });
  fs.writeFileSync(
    sidecar,
    JSON.stringify({
      claims: [
        {
          type: "objective",
          anchor: objective.locations[0].anchor,
          spineRefs: ["objective.phase-change.2"],
          sourceRefs: [],
          derivedFrom: [factId],
        },
      ],
    }),
  );

  const before = extractClaims(root, terms);
  const file = path.join(root, SG);
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("water is 100 °C", "water is 0 °C"), "utf8");
  const after = extractClaims(root, terms);
  return { root, terms, before, after, factId };
}

test("derivedFrom end to end: a REAL extracted claim carries the authored edge, and M5 walks it", (t) => {
  const { root, terms, before, after, factId } = declaredDerivationPackage();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  // 1. THE PRODUCER WIRE. Asserted first: if M2 stops emitting `derivedFrom`, this fails here.
  const derived = before.claims.find((c) => c.text.startsWith(OBJ_TEMPERATURE));
  assert.deepEqual(derived.derivedFrom, [factId], "M2 must emit the declared derivedFrom onto the claim");
  assert.equal(derived.provenanceDeclared, true, "…as a declared claim, not a scan-found one");

  // 2. The target shares NO vocabulary with the changed claim, so co-mention cannot reach it. That
  //    is what makes assertion 3 about `derivedFrom` and nothing else.
  assert.deepEqual(derived.termRefs, [], "the target shares no term with the changed claim");

  // 3. M5 walks it.
  const out = claimImpact(root, before, after, terms);
  assert.ok(out.affected.includes(derived.id), "the authored edge reaches a claim co-mention cannot");
  const entry = out.silentRisk.find((s) => s.claimId === derived.id);
  assert.deepEqual(entry.via, ["derivation"], "reached by the AUTHORED edge, not by co-mention");
  assert.deepEqual(entry.reachedFrom, [factId]);

  // 4. The negative, and concern C proving itself: strip the authored edge and the very same claim
  //    in the very same package is unreachable — which is precisely what this module did for every
  //    real package that existed before the producer landed.
  const strip = (list) => list.map((c) => (c.id === derived.id ? { ...c, derivedFrom: [] } : c));
  const undeclared = claimImpact(root, strip(before.claims), strip(after.claims), terms);
  assert.ok(!undeclared.affected.includes(derived.id), "without the authored edge it is unreachable again");
});

// --- hand-built claims -------------------------------------------------------------------------
//
// The tests below build claims by hand to isolate ONE relation at a time. The wire from a real
// package to a real `derivedFrom` is proven above, on real bytes — a hand-built fixture only ever
// proves that the consumer agrees with the mock.

const FP = (over = {}) => ({ format: "f", label: "l", content: "c", spine: "s", provenance: "p", ...over });

/** A CLAIMS-shaped claim. `scope` and `text` are required fields (§4a, claims.schema.json). */
function claim(id, over = {}) {
  return {
    id: `claim.${id}`,
    type: "fact",
    text: `text of ${id}`,
    scope: "phase-change", // M2's, read verbatim — never re-derived
    fingerprints: FP(),
    spineRefs: [],
    sourceRefs: [],
    termRefs: [],
    derivedFrom: [],
    locations: [{ file: "study-guide/phase-change.md", anchor: `${id}#1`, offset: 0 }],
    provenanceDeclared: true,
    ...over,
  };
}

/** Return a copy of `claims` with `id`'s fingerprint layers overridden — an edit, per layer. */
function move(claims, id, layers) {
  return claims.map((c) => (c.id === `claim.${id}` ? { ...c, fingerprints: FP(layers) } : c));
}

const NO_TERMS = { schemaVersion: 1, terms: [] };

test("affected: derivation is transitive downstream, and never walked upstream", () => {
  // up -> mid -> down, and `aside` derived from nothing. Only `mid` changes.
  const before = [
    claim("up"),
    claim("mid", { derivedFrom: ["claim.up"] }),
    claim("down", { derivedFrom: ["claim.mid"] }),
    claim("aside"),
  ];
  const after = move(before, "mid", { content: "MOVED" });

  const out = claimImpact("/unused", before, after, NO_TERMS);

  assert.deepEqual(out.affected, ["claim.down", "claim.mid"], "reaches its transitive dependents and nothing else");
  // The three negatives that make the assertion mean something:
  assert.ok(!out.affected.includes("claim.up"), "a change does NOT reach what the claim was derived FROM");
  assert.ok(!out.affected.includes("claim.aside"), "an unrelated claim is not reached");
  assert.deepEqual(
    out.silentRisk.map((s) => s.claimId),
    ["claim.down"],
    "the transitive dependent's own text never moved — nothing else would ever flag it",
  );
  assert.deepEqual(out.silentRisk[0].via, ["derivation"]);
  assert.deepEqual(out.silentRisk[0].reachedFrom, ["claim.mid"]);
});

test("affected: a format-only move seeds nothing (a rephrase costs the instructor zero)", () => {
  const before = [claim("a"), claim("b", { derivedFrom: ["claim.a"] })];
  const after = move(before, "a", { format: "REPHRASED" });

  const out = claimImpact("/unused", before, after, NO_TERMS);

  // The product's #1 requirement. A wrong implementation seeds on ANY move and reports both.
  assert.deepEqual(out.affected, [], "a meaning-preserving rephrase reaches nothing");
  assert.deepEqual(out.actions, [], "…and obliges nothing");
  assert.deepEqual(out.silentRisk, [], "…and is not a silent risk: nothing of consequence happened");

  // The negative: the very same edit on the `content` layer DOES reach the dependent. Without
  // this, the assertions above would also pass on a module that reports nothing, ever.
  const real = claimImpact("/unused", before, move(before, "a", { content: "MOVED" }), NO_TERMS);
  assert.deepEqual(real.affected, ["claim.a", "claim.b"], "a content move on the same claim DOES reach");
});

test("affected: co-mention reaches one hop and does NOT chain (an impact set is not the package)", () => {
  const terms = {
    schemaVersion: 1,
    terms: [
      { id: "term.x", preferredLabel: "x", aliases: [], scope: [], status: "confirmed", lifecycle: "active" },
      { id: "term.y", preferredLabel: "y", aliases: [], scope: [], status: "confirmed", lifecycle: "active" },
    ],
  };
  // seed —x— bridge —y— far. `far` shares nothing with `seed`.
  const before = [
    claim("seed", { termRefs: ["term.x"] }),
    claim("bridge", { termRefs: ["term.x", "term.y"] }),
    claim("far", { termRefs: ["term.y"] }),
  ];
  const after = move(before, "seed", { content: "MOVED" });

  const out = claimImpact("/unused", before, after, terms);

  assert.deepEqual(out.affected, ["claim.bridge", "claim.seed"], "one hop only");
  assert.ok(!out.affected.includes("claim.far"), "co-mention must NOT chain — two hops reaches the whole package");

  // …but derivation DOES compose onward from a co-mentioned node. The bound is on the relation,
  // not on the distance: a wrong implementation that simply capped depth at 1 fails here.
  const withEdge = before.map((c) => (c.id === "claim.far" ? { ...c, derivedFrom: ["claim.bridge"] } : c));
  const composed = claimImpact("/unused", withEdge, move(withEdge, "seed", { content: "MOVED" }), terms);
  assert.ok(composed.affected.includes("claim.far"), "derivation composes from a co-mentioned node");
});

test("affected: co-mention is gated by the layer that moved (a relation without a reason is noise)", () => {
  const terms = {
    schemaVersion: 1,
    terms: [{ id: "term.x", preferredLabel: "x", aliases: [], scope: [], status: "confirmed", lifecycle: "active" }],
  };
  const before = [claim("seed", { termRefs: ["term.x"] }), claim("peer", { termRefs: ["term.x"] })];

  // A provenance-only move: re-citing one claim does not make another claim's prose wrong.
  const prov = claimImpact("/unused", before, move(before, "seed", { provenance: "RECITED" }), terms);
  assert.deepEqual(prov.affected, ["claim.seed"], "a provenance move reaches no peer by co-mention");
  assert.equal(prov.actions.find((a) => a.claimId === "claim.seed").action, "RECHECK", "…but still obliges a recheck");

  // A label move (a rename) DOES reach a claim using the same term — the negative that proves the
  // gate is a gate and not a blanket refusal.
  const label = claimImpact("/unused", before, move(before, "seed", { label: "RENAMED" }), terms);
  assert.deepEqual(label.affected, ["claim.peer", "claim.seed"], "a rename reaches claims using the term");

  // A spine move reaches a claim under the same spineRef, but not one that merely shares a term.
  const spined = [claim("seed", { spineRefs: ["concept.p.1"] }), claim("peer", { spineRefs: ["concept.p.1"] }), claim("other", { termRefs: ["term.x"] })];
  const spine = claimImpact("/unused", spined, move(spined, "seed", { spine: "RESTRUCTURED" }), terms);
  assert.deepEqual(spine.affected, ["claim.peer", "claim.seed"], "a spine move reaches its spine siblings only");
});

test("co-mention reads BOTH versions' refs: deleting a term still reaches what shared it", () => {
  const terms = {
    schemaVersion: 1,
    terms: [{ id: "term.x", preferredLabel: "x", aliases: [], scope: [], status: "confirmed", lifecycle: "active" }],
  };
  const before = [claim("seed", { termRefs: ["term.x"] }), claim("peer", { termRefs: ["term.x"] })];
  // The edit STRIPS the term from the seed (its label and content layers move accordingly).
  const after = [
    { ...claim("seed", { termRefs: [] }), fingerprints: FP({ label: "DROPPED", content: "MOVED" }) },
    claim("peer", { termRefs: ["term.x"] }),
  ];

  const out = claimImpact("/unused", before, after, terms);

  // Reading only the NEW version would leave the seed with no terms, so the peer that still cites
  // the dropped term is reached by nothing — silence on the edit most likely to strand a
  // dependent. The refs are unioned across versions precisely so a DELETION still reaches.
  assert.ok(out.affected.includes("claim.peer"), "a claim citing the dropped term is still reached");
  assert.deepEqual(
    out.silentRisk.map((s) => s.claimId),
    ["claim.peer"],
    "the peer is now stranded: its text is untouched, so nothing else will ever mention it",
  );
  assert.deepEqual(out.silentRisk[0].via, ["shared-term"]);
});

test("cycles: reported, never broken — and traversal still terminates", () => {
  // a -> b -> c -> a, plus a self-derivation, plus an acyclic tail off the cycle.
  const before = [
    claim("a", { derivedFrom: ["claim.c"] }),
    claim("b", { derivedFrom: ["claim.a"] }),
    claim("c", { derivedFrom: ["claim.b"] }),
    claim("self", { derivedFrom: ["claim.self"] }),
    claim("tail", { derivedFrom: ["claim.c"] }),
  ];
  const after = move(before, "a", { content: "MOVED" });

  const out = claimImpact("/unused", before, after, NO_TERMS); // must not hang or throw

  assert.deepEqual(
    out.cycles.map((c) => c.claimIds),
    [["claim.a", "claim.b", "claim.c"], ["claim.self"]],
    "both the 3-cycle and the self-derivation are reported",
  );
  assert.deepEqual(out.cycles[0].edges, [
    { from: "claim.a", to: "claim.b" },
    { from: "claim.b", to: "claim.c" },
    { from: "claim.c", to: "claim.a" },
  ]);

  // NEVER BROKEN: every claim in the cycle is still reached. An implementation that "resolved" the
  // cycle by dropping an edge would silently stop propagating past the edge it chose to sacrifice.
  for (const id of ["claim.a", "claim.b", "claim.c", "claim.tail"]) {
    assert.ok(out.affected.includes(id), `${id} is still reached through the reported cycle`);
  }
  // An acyclic graph reports no cycles — the negative that stops `cycles` being a constant.
  const acyclic = [claim("a"), claim("b", { derivedFrom: ["claim.a"] })];
  assert.deepEqual(claimImpact("/unused", acyclic, move(acyclic, "a", { content: "M" }), NO_TERMS).cycles, []);
});

// --- scope: READ, never derived (§4a, §5d) ------------------------------------------------------
//
// A homograph registry: "cell" means one term in `biology` and another in `battery`. `resolve`
// returns the BIOLOGY term when asked unscoped (it is declared first), which is what makes the two
// traps below discriminating: a module that re-derived scope from `locations[0].file` — or that
// wrote `claim.scope ?? derive(...)` and so re-derived for every package-wide claim — resolves
// "cell" to the BATTERY term and reaches a claim it must not.
const HOMOGRAPH_TERMS = {
  schemaVersion: 1,
  terms: [
    { id: "term.cell", preferredLabel: "cell", aliases: [], scope: ["biology"], status: "confirmed", lifecycle: "active" },
    { id: "term.cell-battery", preferredLabel: "cell", aliases: [], scope: ["battery"], status: "confirmed", lifecycle: "active" },
  ],
};

test("scope: the claim's field wins over what deriving from the file would yield", () => {
  const inBattery = { file: "study-guide/battery.md", anchor: "a#1", offset: 0 };
  const before = [
    // The seed is a battery-chapter claim about the electrochemical cell.
    claim("seed", { scope: "battery", termRefs: ["cell"], locations: [inBattery] }),
    // A peer in the same chapter, about the same term. Reached.
    claim("peer", { scope: "battery", termRefs: ["cell"], locations: [inBattery] }),
    // THE TRAP: it SITS in battery.md, but M2 derived its scope as `biology` (§4a tier 1 — the
    // spine outranks file placement). Its "cell" is the BIOLOGICAL cell, so the seed must not
    // reach it. Deriving scope from the file would resolve it to term.cell-battery and reach it.
    claim("trap", { scope: "biology", termRefs: ["cell"], locations: [inBattery] }),
  ];
  const out = claimImpact("/unused", before, move(before, "seed", { content: "MOVED" }), HOMOGRAPH_TERMS);

  assert.deepEqual(out.affected, ["claim.peer", "claim.seed"], "the scope FIELD decides which term 'cell' is");
  assert.ok(!out.affected.includes("claim.trap"), "a claim whose scope contradicts its file follows the FIELD");
});

test("scope: null is a MEANINGFUL value (package-wide), not a missing one", () => {
  const inBattery = { file: "study-guide/battery.md", anchor: "a#1", offset: 0 };
  const before = [
    claim("seed", { scope: "battery", termRefs: ["cell"], locations: [inBattery] }),
    // scope null = package-wide -> "cell" resolves unscoped -> term.cell (biology). NOT reached.
    // `claim.scope ?? derive(...)` would read `battery` from the filename and reach it: the trap
    // two agents hit, one of them inside the helper written to check for it.
    claim("wide", { scope: null, termRefs: ["cell"], locations: [inBattery] }),
  ];
  const out = claimImpact("/unused", before, move(before, "seed", { content: "MOVED" }), HOMOGRAPH_TERMS);

  assert.deepEqual(out.affected, ["claim.seed"], "null scope must NOT be re-derived from the file");
  assert.ok(!out.affected.includes("claim.wide"), "null is an answer, not an absence");

  // The negative: the same claim declared `battery` IS reached, so the assertion above is about
  // scope handling and not about `wide` being unreachable for some other reason.
  const scoped = before.map((c) => (c.id === "claim.wide" ? { ...c, scope: "battery" } : c));
  const out2 = claimImpact("/unused", scoped, move(scoped, "seed", { content: "MOVED" }), HOMOGRAPH_TERMS);
  assert.deepEqual(out2.affected, ["claim.seed", "claim.wide"]);
});

test("actions: M4 owns the verb; M5 reports it per affected claim and holds no second opinion", () => {
  const before = [claim("a"), claim("b", { derivedFrom: ["claim.a"] })];
  const out = claimImpact("/unused", before, move(before, "a", { content: "MOVED" }), NO_TERMS);

  const a = out.actions.find((x) => x.claimId === "claim.a");
  // An unauthorized content move is a suspected error -> a human adjudicates (M4's documented
  // fail-toward-review default; M5 has no ctx parameter — see CONTRACT CONCERNS B).
  assert.equal(a.action, "ESCALATE");
  assert.equal(a.layer, "content");
  assert.ok(a.reason.length > 0, "the verb carries its reason for the receipt");
  // The reached-but-unmoved dependent: M4 correctly says NONE, which is exactly why silentRisk is
  // not redundant with `actions`.
  assert.equal(out.actions.find((x) => x.claimId === "claim.b").action, "NONE");
  assert.deepEqual(out.actions.map((x) => x.claimId), out.affected, "one action per affected claim, same order");
});

// --- ctx: the optional 5th param (§3) ----------------------------------------------------------

test("ctx: absent, the output is byte-identical to the pre-ctx behavior (no caller breaks)", () => {
  const before = [claim("a"), claim("b", { derivedFrom: ["claim.a"] })];
  const after = move(before, "a", { content: "MOVED" });

  const bare = claimImpact("/unused", before, after, NO_TERMS);
  // Explicitly-undefined and an empty ctx must both mean "no context", not "some context".
  assert.deepEqual(claimImpact("/unused", before, after, NO_TERMS, undefined), bare);
  assert.deepEqual(claimImpact("/unused", before, after, NO_TERMS, {}), bare);
  assert.deepEqual(claimImpact("/unused", before, after, NO_TERMS, { byClaimId: {} }), bare);
  // …and that default is the SAFE one: an unauthorized content move is a suspected error.
  assert.equal(bare.actions.find((x) => x.claimId === "claim.a").action, "ESCALATE");
});

test("ctx: an authorized override changes the verb (§10 decision 2's ask-once, now reachable)", () => {
  const before = [claim("a"), claim("b", { derivedFrom: ["claim.a"] })];
  const after = move(before, "a", { content: "MOVED" });

  const out = claimImpact("/unused", before, after, NO_TERMS, {
    byClaimId: { "claim.a": { authorized: true } },
  });

  const a = out.actions.find((x) => x.claimId === "claim.a");
  assert.equal(a.action, "RE-DERIVE", "the human already decided -> dependents are re-derived, not escalated");
  assert.equal(a.layer, "content");

  // Reachability is NOT authorization's business: an authorized change still reaches its
  // dependents, and the silent risk is unchanged. Authorization decides the VERB, never the SET.
  assert.deepEqual(out.affected, ["claim.a", "claim.b"], "authorizing a change does not shrink its blast radius");
  assert.deepEqual(out.silentRisk.map((s) => s.claimId), ["claim.b"], "…nor hide what it reaches silently");
});

test("ctx: authorization is PER CLAIM — an edit-level `authorized` throws rather than being ignored", () => {
  const before = [claim("a"), claim("b")];
  const after = move(before, "a", { content: "MOVED" });

  // A blanket `authorized` would assert from ONE BIT that every reached claim has a recorded
  // override, silently downgrading the unauthorized ones from ESCALATE to RE-DERIVE. Silently
  // IGNORING it would be worse still: the caller would believe they had authorized something.
  assert.throws(
    () => claimImpact("/unused", before, after, NO_TERMS, { authorized: true }),
    /ctx\.authorized.*PER CLAIM/s,
    "an edit-level authorized is a contract break, caught at build time",
  );

  // Authorizing ONE claim leaves the others at the safe default — the negative that proves the
  // per-claim key is actually read and is not a blanket in disguise.
  const before2 = [claim("a", { termRefs: [] }), claim("b")];
  const after2 = [
    { ...claim("a"), fingerprints: FP({ content: "MOVED" }) },
    { ...claim("b"), fingerprints: FP({ content: "MOVED-TOO" }) },
  ];
  const out = claimImpact("/unused", before2, after2, NO_TERMS, { byClaimId: { "claim.a": { authorized: true } } });
  assert.equal(out.actions.find((x) => x.claimId === "claim.a").action, "RE-DERIVE", "the authorized claim");
  assert.equal(out.actions.find((x) => x.claimId === "claim.b").action, "ESCALATE", "the unauthorized one is untouched");
});

test("ctx: edit-level spineChange/pedagogy apply as defaults; per-claim wins; null is respected", () => {
  const before = [claim("a", { spineRefs: ["concept.p.1"] }), claim("b", { spineRefs: ["concept.p.1"] })];
  const after = move(before, "a", { spine: "MOVED" });

  // `spineChange` and `pedagogy` are facts about the EDIT, so they take an edit-level default —
  // unlike authorization, which is a fact about a CLAIM's standing.
  const depth = claimImpact("/unused", before, after, NO_TERMS, { spineChange: "depth" });
  assert.equal(depth.actions.find((x) => x.claimId === "claim.a").action, "REGENERATE", "depth cannot be patched");

  const structural = claimImpact("/unused", before, after, NO_TERMS, { spineChange: "structural" });
  assert.equal(structural.actions.find((x) => x.claimId === "claim.a").action, "RECHECK");

  // Per-claim overrides the edit-level default.
  const mixed = claimImpact("/unused", before, after, NO_TERMS, {
    spineChange: "depth",
    byClaimId: { "claim.a": { spineChange: "structural" } },
  });
  assert.equal(mixed.actions.find((x) => x.claimId === "claim.a").action, "RECHECK", "per-claim wins over edit-level");

  // A per-claim `spineChange: null` is a MEANINGFUL value (unknown -> structural, fail toward
  // review) and must NOT be silently promoted to the edit-level "depth" by a `??`. This is §4a's
  // trap in a third costume, on the field that decides whether a package gets regenerated.
  const explicitNull = claimImpact("/unused", before, after, NO_TERMS, {
    spineChange: "depth",
    byClaimId: { "claim.a": { spineChange: null } },
  });
  assert.equal(
    explicitNull.actions.find((x) => x.claimId === "claim.a").action,
    "RECHECK",
    "an explicit null is an answer, not an absence — it must not inherit 'depth'",
  );

  // pedagogy threads too: deprecate-but-teach must never be overwritten by a derived verb.
  const renamed = move(before, "a", { label: "RENAMED" });
  const annotated = claimImpact("/unused", before, renamed, NO_TERMS, { pedagogy: "deprecate-but-teach" });
  assert.equal(annotated.actions.find((x) => x.claimId === "claim.a").action, "ANNOTATE");
  assert.equal(claimImpact("/unused", before, renamed, NO_TERMS).actions.find((x) => x.claimId === "claim.a").action, "RENAME");
});

test("added and removed claims are seeds, and are never reported as silent", () => {
  const before = [claim("stays", { derivedFrom: ["claim.goes"] }), claim("goes")];
  const after = [claim("stays", { derivedFrom: ["claim.goes"] }), claim("arrives")];

  const out = claimImpact("/unused", before, after, NO_TERMS);

  assert.ok(out.affected.includes("claim.goes"), "a removed claim is a seed");
  assert.ok(out.affected.includes("claim.arrives"), "an added claim is a seed");
  // Its dependent is still reached through the edge the removed claim leaves behind — the case a
  // new-versions-only graph would silently drop.
  assert.ok(out.affected.includes("claim.stays"), "what depended on a removed claim is reached");
  assert.deepEqual(
    out.silentRisk.map((s) => s.claimId),
    ["claim.stays"],
    "only the untouched dependent is silent; an add/remove is a flag in itself",
  );
});

test("deterministic: identical inputs give byte-identical output, independent of input order", () => {
  const terms = {
    schemaVersion: 1,
    terms: [{ id: "term.x", preferredLabel: "x", aliases: [], scope: [], status: "confirmed", lifecycle: "active" }],
  };
  const before = [
    claim("z", { termRefs: ["term.x"] }),
    claim("m", { termRefs: ["term.x"], derivedFrom: ["claim.z"] }),
    claim("a", { termRefs: ["term.x"] }),
  ];
  const after = move(before, "z", { content: "MOVED" });

  const once = claimImpact("/unused", before, after, terms);
  const twice = claimImpact("/unused", before, after, terms);
  assert.deepEqual(twice, once, "same inputs -> identical output (a flag must be reproducible from git)");

  // Shuffled input must not move a single byte of the output: the caller's array order is not data.
  const shuffled = claimImpact("/unused", [...before].reverse(), [...after].reverse(), terms);
  assert.deepEqual(shuffled, once, "input order must not affect the result");

  // Every set-shaped output is sorted.
  assert.deepEqual(once.affected, [...once.affected].sort(), "affected is sorted");
  assert.deepEqual(once.actions.map((a) => a.claimId), [...once.actions.map((a) => a.claimId)].sort(), "actions sorted");
  assert.deepEqual(once.silentRisk.map((s) => s.claimId), [...once.silentRisk.map((s) => s.claimId)].sort(), "silentRisk sorted");
  for (const s of once.silentRisk) {
    assert.deepEqual(s.reachedFrom, [...s.reachedFrom].sort(), "reachedFrom is sorted");
    assert.deepEqual(s.via, [...s.via].sort(), "via is sorted");
  }
});

test("degenerate inputs: no claims, no change, and a dangling derivedFrom", () => {
  assert.deepEqual(claimImpact("/unused", null, null, null), { affected: [], actions: [], silentRisk: [], cycles: [] });

  const same = [claim("a"), claim("b")];
  assert.deepEqual(claimImpact("/unused", same, same, NO_TERMS), {
    affected: [],
    actions: [],
    silentRisk: [],
    cycles: [],
  });

  // A `derivedFrom` naming an id in neither version yields no edge and no invented node — there is
  // nothing to reach, and minting one would be a fabrication. (Reporting it is M11's; see
  // CONTRACT CONCERNS D.)
  const dangling = [claim("a"), claim("b", { derivedFrom: ["claim.ghost"] })];
  const out = claimImpact("/unused", dangling, move(dangling, "a", { content: "M" }), NO_TERMS);
  assert.deepEqual(out.affected, ["claim.a"], "a dangling ref invents no node");
  assert.ok(!out.affected.includes("claim.ghost"));
});

test("purity: claimImpact performs no I/O — `root` is accepted and never read", () => {
  // The signature (interfaces §3) takes a root; this layer needs none, and the parameter's
  // presence must not become a licence to reach for the disk (CONTRACT CONCERNS A). A path that
  // cannot exist proves the point: a module that read it would throw ENOENT.
  const before = [claim("a"), claim("b", { derivedFrom: ["claim.a"] })];
  const after = move(before, "a", { content: "MOVED" });
  const nowhere = path.join(os.tmpdir(), "cw-m5-does-not-exist-", String(Date.now()), "nope");
  assert.ok(!fs.existsSync(nowhere));

  const out = claimImpact(nowhere, before, after, NO_TERMS);
  assert.deepEqual(out.affected, ["claim.a", "claim.b"]);
  // …and the root genuinely does not participate in the answer.
  assert.deepEqual(claimImpact(undefined, before, after, NO_TERMS), out);
});

test("backward compatibility: the component-level exports are untouched by the claim layer", async () => {
  // M5 is a layer BESIDE the component graph, not a replacement (spec §2.4). If this file's import
  // list ever shrinks, the additive promise has been broken.
  const mod = await import("../scripts/lib/coherence.mjs");
  for (const name of [
    "COMPONENT_INDEX_PATH",
    "coherenceStateFile",
    "recordAcceptedCoherence",
    "computeComponentGraph",
    "makeComponentIndex",
    "loadComponentIndex",
    "auditCoherence",
    "computeRevisionImpact",
    "writeComponentIndex",
    "validateRevisionReview",
    "claimImpact",
  ]) {
    assert.ok(name in mod, `coherence.mjs must still export ${name}`);
  }
  // The component graph still reads the golden fixture at file granularity, claim layer or not.
  const graph = mod.computeComponentGraph(FIXTURE);
  assert.ok(graph.components.some((c) => c.path === SG), "component graph still indexes files");
});
