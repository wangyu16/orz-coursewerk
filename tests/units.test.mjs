// Tests for lib/units.mjs — the shared unit table (interfaces §5d).
//
// WHAT THIS FILE IS ACTUALLY DEFENDING
// ------------------------------------
// Not "units parse correctly". The defect this module exists to kill is SILENT UNDER-REPORTING:
// M3 knew `torr`/`V`/`A`/`W`/`Hz`; M2's scanner did not; so "The cell potential is 5 V" minted no
// claim; with no claim M6 had nothing to compare; and the package reported ZERO FLAGS IT HAD NOT
// EARNED. A clean bill of health manufactured by a blind spot is the worst failure this system
// has, because it is indistinguishable from success and nobody goes looking.
//
// So the load-bearing test here is `the three projections agree on the unit set`. It is asserted
// over the DERIVED projections, never against a hand-written list of units: a list in this file
// would be a FOURTH copy of the fact, and the fourth copy would drift exactly like the first three
// — with the test's blessing.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  UNITS,
  unitIds,
  CANONICAL_BY_DIM,
  AMBIGUOUS_WORDS,
  aliasProjection,
  dimensionProjection,
  scanProjection,
} from "../scripts/lib/units.mjs";

const dim = dimensionProjection();
const scan = scanProjection();
const alias = aliasProjection();

/** Every case-sensitive symbol / case-insensitive word any unit declares. */
const allSymbols = () => UNITS.flatMap((u) => u.symbols);
const allWords = () => UNITS.flatMap((u) => u.words ?? []);

// ---------------------------------------------------------------------------------------------
// THE POINT OF THE MODULE
// ---------------------------------------------------------------------------------------------

test("the three projections agree on the unit set — the defect, made un-regressable", () => {
  // Derived from the table, never re-listed. If someone adds a unit to one projection's view
  // only, this fails. That is the entire job.
  const ids = new Set(unitIds());

  // M3's view: every alias resolves to an id in the set, and every id is reachable.
  const m3Ids = new Set([...alias.values()]);
  assert.deepEqual([...m3Ids].sort(), [...ids].sort(), "M3's aliases must cover exactly the unit set");

  // M6's view: every declared symbol and word dimensions to an id in the set.
  //
  // [AMENDED 2026-07-17] The M6 set is `ids` MINUS the spellingOnly-only units, and that subtraction is
  // the point rather than a hole in it. `ampere` is now M3-only: `A` is an English article, and a
  // dimensioner that reads "Answer 9 A flat plateau" as 9 amperes false-flags every Q&A sheet in the
  // corpus (measured, on the CLEAN reference package — see units.mjs's ampere row).
  //
  // This LOOKS like the original defect returning (a unit M3 knows and M2 does not) and is its exact
  // inverse: there, the divergence was ACCIDENTAL and silent — three tables drifting, nobody deciding.
  // Here it is DECLARED IN THE TYPE. `spellingOnly` is the visible, argued act of exempting one row, so
  // the §5d protection is intact: you still cannot add a unit to one projection and forget another —
  // you can only exempt it ON PURPOSE, in a field whose name says what it means.
  const dimensionable = new Set(UNITS.filter((u) => u.symbols.length || (u.words ?? []).length).map((u) => u.id));
  const m6Ids = new Set();
  for (const form of [...allSymbols(), ...allWords()]) {
    const hit = dim.lookup(form);
    assert.ok(hit, `M6 must dimension a declared form: ${form}`);
    m6Ids.add(hit.id);
  }
  assert.deepEqual([...m6Ids].sort(), [...dimensionable].sort(), "M6 must dimension exactly the dimensionable set");
  // ...and the exemption is EXPLICIT, never accidental: whatever M6 cannot dimension must be a unit that
  // declared itself spellingOnly. A row that simply forgot its symbols still fails here.
  for (const id of ids) {
    if (m6Ids.has(id)) continue;
    const u = UNITS.find((x) => x.id === id);
    assert.ok((u.spellingOnly ?? []).length,
      `${id} is invisible to M6 but never declared spellingOnly — that is the drift this module exists to stop`);
  }

  // M2's view: every declared form is recognized as a quantity when bound to a number.
  for (const form of [...allSymbols(), ...allWords()]) {
    assert.ok(scan.quantityRe().test(`5 ${form}`), `M2 must recognize a declared form: ${form}`);
  }
});

test("the units that were actually drifting are now known to all three", () => {
  // The measured blind spot, pinned by name. These are regression tests for a real bug, not
  // examples — each one is a sentence that silently minted no claim.
  for (const [form, id] of [["torr", "torr"], ["V", "volt"], ["W", "watt"], ["Hz", "hertz"]]) {
    assert.equal(dim.lookup(form)?.id, id, `${form} must dimension`);
    assert.ok(scan.quantityRe().test(`5 ${form}`), `${form} must mint a claim`);
    assert.equal(alias.get(form.toLowerCase()), id, `${form} must normalize`);
  }
});

test("`A` is an ENGLISH ARTICLE: M3 folds it, M2/M6 must refuse it", () => {
  // `A` WAS in the loop above, asserting `dim.lookup("A") === "ampere"` and that `5 A` mints a claim.
  // That assertion was REMOVED, deliberately, and this is the argument — not a quiet edit.
  //
  // The old assertion was RIGHT about the drift it fenced (M3 knew `A`, M2's scanner did not, and that
  // divergence was a real silent-under-reporting bug) and WRONG about this one row. The unification
  // over-corrected: for `A` specifically the divergence was CORRECT, because `A` is an English article.
  //
  // MEASURED, not argued: wiring M6 into the gate made the CLEAN reference package flag a
  // value-disagreement between "9 A" and "3 A" for term.melting-point. The prose was
  //   "Q 3 A thermometer in melting ice reads a steady value."
  //   "Answer 9 A flat plateau sits at the melting point."
  // A numbered question borrowed the next sentence's capitalized article and became a current — inside
  // the check built to prove the product does not cry wolf.
  //
  // `spellingOnly` is the existing device for exactly this (see `c`/`f`), and the recall cost is named
  // in units.mjs: a genuine "5 A of current" now mints no claim. Accepted — a false flag on every Q&A
  // sheet is alarm fatigue, and the queue dies of false positives, not of misses.
  assert.equal(dim.lookup("A"), null, "M6 must NOT dimension a bare `A` — it is an article far more often than an ampere");
  assert.equal(scan.quantityRe().test("Answer 9 A flat plateau sits at the melting point."), false,
    "M2 must not mint a claim from an article: this exact sentence false-flagged the clean package");
  assert.equal(scan.quantityRe().test("The cell delivers 5 A of current."), false,
    "the named recall cost: a REAL ampere is also refused. Precision is the deliberate trade.");
  // ...but M3 still normalizes the spelling, which is its call to make and is harmless: articles are
  // stripped as closed-class words before unit folding.
  assert.equal(alias.get("a"), "ampere", "M3's spelling normalization is unchanged");
  // The negative that keeps this honest: the OTHER three drift units are untouched by this exception.
  for (const f of ["V", "W", "Hz"]) assert.ok(dim.lookup(f), `${f} must still dimension`);
});

test("M2 no longer invents phantom units: `Mg` is not a milligram", () => {
  // The old M2 capitalized any lowercase-initial form, so `mg` bred `Mg` — a MEGAgram read as a
  // milligram, a 10^6 error, in the module that decides what becomes a claim. No other module
  // recognized it. The union is over the unit SET; it never invents surface forms.
  assert.equal(dim.lookup("Mg"), null, "Mg must not dimension as mg");
  assert.equal(scan.quantityRe().test("5 Mg"), false, "Mg must not mint a claim");
  // ...while the real form still works, so this is a fix and not a blanket ban.
  assert.equal(dim.lookup("mg")?.id, "milligram");
  assert.ok(scan.quantityRe().test("5 mg"));
});

// ---------------------------------------------------------------------------------------------
// THE CASE TRAP — the refactor's most likely silent breakage
// ---------------------------------------------------------------------------------------------

test("case sensitivity: K is kelvin, k is not a unit at all", () => {
  assert.equal(dim.lookup("K")?.id, "kelvin");
  assert.equal(dim.lookup("k"), null, "bare `k` is the kilo- PREFIX, never kelvin");
  assert.equal(scan.quantityRe().test("5 K"), true);
  assert.equal(scan.quantityRe().test("5 k"), false, "`5 k` must not mint a claim");
});

test("case sensitivity: M3 still folds case, because M3 lowercases the world first", () => {
  // M3's contract is spelling normalization, and it has folded `100 C` since day one. Symbols
  // reach it already lowercased, so both disciplines coexist on one table.
  assert.equal(alias.get("k"), "kelvin", "M3 sees `k` because it lowercased `K`");
  assert.equal(alias.get("c"), "celsius", "M3's own long-standing call");
  assert.equal(alias.get("°c"), "celsius");
});

test("spellingOnly forms are typed OUT of M2 and M6 — a spelling variant is not a dimension", () => {
  // `c` is celsius to a normalizer and a GUESS to a dimensioner (coulomb). The record types it
  // out of those projections rather than leaving each consumer to remember.
  assert.equal(dim.lookup("c"), null, "M6 must never dimension an ambiguous abbreviation");
  assert.equal(scan.quantityRe().test("100 c"), false, "M2 must not mint what M6 will refuse");
  assert.equal(alias.get("c"), "celsius", "...but M3 still folds it");
});

test("ambiguous words are RECOGNIZED and REFUSED — which is not the same as unrecognized", () => {
  for (const w of AMBIGUOUS_WORDS) {
    assert.equal(dim.lookup(w), null, `${w} has no scale, so no dimension, so no subject`);
    assert.equal(scan.quantityRe().test(`90 ${w}`), false, `M2 must not mint "${w}"`);
  }
});

// ---------------------------------------------------------------------------------------------
// PARSING PROPERTIES THAT MUST SURVIVE THE REFACTOR
// ---------------------------------------------------------------------------------------------

test("longest-match-first: `5 kJ/mol` is molar-energy, not joules", () => {
  // Ordering is load-bearing: a naive alternation matches `J` inside `kJ/mol` and silently
  // reclassifies the dimension, which would make two agreeing claims look like a disagreement.
  assert.equal(dim.lookup("kJ/mol")?.dim, "molar-energy");
  const m = new RegExp(dimensionProjection().quantityRe()).exec("5 kJ/mol");
  assert.ok(m, "must match");
  assert.ok(m[0].includes("kJ/mol"), `expected the whole unit, got ${JSON.stringify(m[0])}`);
});

test("a bare number is not a quantity", () => {
  assert.equal(scan.quantityRe().test("step 3"), false);
  assert.equal(scan.quantityRe().test("3"), false);
});

test("the word-boundary lookahead survives: `g` does not match inside `grams`", () => {
  // `5 grams` must resolve as gram-the-word, not as `g` plus stray letters.
  assert.equal(dim.lookup("grams")?.id, "gram");
  assert.equal(dim.lookup("g")?.id, "gram");
  assert.equal(dim.lookup("gx"), null, "an unknown form must not smuggle a unit out of its prefix");
});

// ---------------------------------------------------------------------------------------------
// CONVERSION — exact by definition, never estimated
// ---------------------------------------------------------------------------------------------

test("100 °C and 212 °F agree — the false-alarm this table exists to prevent", () => {
  const c = dim.lookup("°C");
  const f = dim.lookup("°F");
  assert.equal(c.dim, f.dim, "same dimension or they could never be compared");
  assert.ok(Math.abs(c.to(100) - f.to(212)) < 1e-9, "100 °C === 212 °F in kelvin");
});

test("every dimension's canonical unit converts by identity", () => {
  // If a canonical unit's own `to` were not identity the whole dimension is incoherent, and
  // every comparison in it is quietly wrong rather than loudly broken.
  for (const [d, canonicalId] of Object.entries(CANONICAL_BY_DIM)) {
    const u = UNITS.find((x) => x.id === canonicalId);
    assert.ok(u, `canonical unit missing for ${d}: ${canonicalId}`);
    assert.equal(u.dim, d, `${canonicalId} must live in ${d}`);
    for (const v of [0, 1, 42.5, -7]) {
      assert.equal(u.to(v), v, `${canonicalId}.to must be identity`);
    }
  }
});

test("definitional conversions are exact: 1 atm = 760 torr = 101325 Pa", () => {
  const atm = dim.lookup("atm");
  const torr = dim.lookup("torr");
  assert.equal(atm.to(1), 101325);
  assert.ok(Math.abs(torr.to(760) - 101325) < 1e-9, "760 torr is one atmosphere, exactly");
});

test("newly-dimensioned units are identity, not guesses", () => {
  // V/W/Hz reached M6 only via this unification. Each IS its dimension's canonical unit, so the
  // conversion is certain. If a future edit gives one a non-identity `to`, it is a knowledge
  // claim and must be argued, not autocompleted.
  // `A` was here and is not: it is spellingOnly now, so M6 does not dimension it at all (an English
  // article). Its `to` is still asserted below — the row still exists and must stay honest.
  for (const form of ["V", "W", "Hz"]) {
    const u = dim.lookup(form);
    assert.equal(u.id, CANONICAL_BY_DIM[u.dim], `${form} must be its dimension's canonical unit`);
    assert.equal(u.to(37), 37);
  }
  const ampere = UNITS.find((u) => u.id === "ampere");
  assert.equal(ampere.dim, "current");
  assert.equal(ampere.to(37), 37, "ampere's conversion must stay identity even though M6 never reaches it");
});

// ---------------------------------------------------------------------------------------------
// STRUCTURAL SAFETY + HYGIENE
// ---------------------------------------------------------------------------------------------

test("M3 CANNOT convert — structurally, not by convention", () => {
  // M3's no-conversion rule used to be safe by ISOLATION: its table had no `to` to call. The
  // unification put the conversions in the file it imports from, one autocomplete away. So the
  // rule is re-established as a TYPE: names, not records. This test is that rule.
  for (const v of alias.values()) {
    assert.equal(typeof v, "string", "aliasProjection must yield names, never records");
  }
  // and there is no way to reach a conversion through it
  assert.ok([...alias.values()].every((v) => v.to === undefined));
});

test("ids are unique and every unit declares a known dimension", () => {
  const ids = unitIds();
  assert.equal(new Set(ids).size, ids.length, "duplicate unit id");
  for (const u of UNITS) {
    assert.ok(CANONICAL_BY_DIM[u.dim], `unit ${u.id} declares unknown dimension ${u.dim}`);
  }
});

test("no form is claimed by two different units", () => {
  // A symbol resolving to two units is an ambiguity the table must not contain — the lookup would
  // silently pick one, which is a guess wearing a table's badge.
  const seen = new Map();
  for (const u of UNITS) {
    for (const s of u.symbols) {
      assert.equal(seen.get(`S|${s}`) ?? u.id, u.id, `symbol ${s} claimed by two units`);
      seen.set(`S|${s}`, u.id);
    }
    for (const w of u.words ?? []) {
      const k = `W|${w.toLowerCase()}`;
      assert.equal(seen.get(k) ?? u.id, u.id, `word ${w} claimed by two units`);
      seen.set(k, u.id);
    }
  }
});

test("deterministic: projections are pure and carry no shared state", () => {
  assert.deepEqual([...aliasProjection().entries()].sort(), [...aliasProjection().entries()].sort());
  assert.deepEqual(unitIds(), unitIds());
  // `lastIndex` is state, and shared state is a shared bug: a g-flagged regex reused across calls
  // would make the SECOND scan of a document find different quantities than the first.
  const a = dimensionProjection().quantityRe();
  const b = dimensionProjection().quantityRe();
  a.exec("5 g and 6 g");
  assert.equal(b.lastIndex, 0, "each call must hand back a fresh matcher");
});
