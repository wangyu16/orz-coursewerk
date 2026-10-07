// K2 — computable content is recomputed (red-team round 3, CONFIDENCE R3-K03). The classifier has always marked
// worked answers, conversions and equations "mechanical"; until this file nothing read that kind, so a worked
// "Q_r = (0.20)^2/((0.10)(0.30)^3) = 1.48" (the true value is 14.8) and an unbalanced "CO + H2 <=> CH3OH" published.
//
// Two checks, both deterministic and both conservative — what cannot be parsed without a guess is skipped, never
// guessed at (a false alarm on correct work is the cost the queue dies of):
//   1. WORKED EXPRESSIONS. In math ($…$, $$…$$, \(…\), \[…\]) a chain "X = <arithmetic> = <value>" (or ≈) is split at
//      its top-level relations; every purely numeric part with an operator is evaluated and compared with the literal
//      value that follows it, at the precision written: they disagree when the recomputed value rounds to another
//      value at the written precision AND differs by more than half a percent (what rounded intermediates explain; a
//      slipped decimal, a wrong exponent or a dropped term never hides there).
//      Read: numbers (thousands "{,}", scientific "×10^{n}", "e-n"), + − × · * / ÷, \frac, ^ (integer or decimal),
//      parentheses and \left/\right, implicit products "(0.10)(0.30)", \ln, \log, \sqrt, \exp. A part with a symbol, a
//      unit inside the arithmetic, or anything else unknown is not numeric and is skipped. Values that carry units are
//      compared only when the expression carries the same trailing unit or none.
//   2. EQUATION BALANCE. Every reaction the harness reads (verify/admission.mjs equationIn, one per \ce{…} and the
//      plain one) is balanced atom by atom and in charge. A species that does not parse as a formula of real elements
//      skips the equation.
// A mismatch is a DEFECT routed to the agent, with the recomputed value or the unbalanced element in its evidence.
// A unit the instructor confirmed at its current text (an intended wrong worked answer, say) is not re-raised.
// PURE and DETERMINISTIC.
import { makeFinding } from "../records/findings.mjs";
import { equationIn } from "./admission.mjs";
import { parseNumber } from "../core/values.mjs";

// ---- 1. worked expressions ---------------------------------------------------------------------------------------
const MATH = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;

/** Split a math string at its top-level relations (=, ≈, \approx), outside braces and brackets. */
function relationParts(m) {
  const parts = [], rels = [];
  let depth = 0, cur = "";
  const s = m.replace(/\\approx(?![A-Za-z])|\\simeq(?![A-Za-z])/g, "≈");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ("{([".includes(c)) depth++;
    else if ("})]".includes(c)) depth = Math.max(0, depth - 1);
    if (depth === 0 && (c === "=" || c === "≈") && s[i - 1] !== "<" && s[i + 1] !== ">" && s[i - 1] !== "\\") { parts.push(cur); rels.push(c); cur = ""; continue; }
    cur += c;
  }
  parts.push(cur);
  return { parts, rels };
}

// a trailing unit: \text{…}/\mathrm{…} groups and unit-like words with exponents ("J mol^{-1}", "\,\text{kJ}")
const TRAIL_UNIT = /(?:\s|\\[,;:! ]|~)*((?:(?:\\(?:text|mathrm|rm)\s*\{[^{}]*\}|[A-Za-z°%µ]+)(?:\s*\^\s*(?:\{\s*[-−]?\d+\s*\}|[-−]?\d))?(?:\s|\\[,;:! ]|~|\/|\\cdot)*)+)$/;
const unitKey = (u) => String(u || "").replace(/\\(?:text|mathrm|rm)\s*\{([^{}]*)\}/g, "$1").replace(/\\[,;:! ]|~|\\cdot/g, " ").replace(/\s+/g, " ").replace(/\s*\^\s*\{?\s*([-−]?\d+)\s*\}?/g, "^$1").replace(/−/g, "-").trim();

/** Strip a trailing unit: { body, unit }. The unit must not be a function name or a lone symbol inside arithmetic. */
function splitUnit(part) {
  const p = part.trim().replace(/[.,;:]+$/, "").trim();
  const m = p.match(TRAIL_UNIT);
  if (!m || !m[1].trim() || /\\(?:ln|log|exp|sqrt|frac)/.test(m[1])) return { body: p, unit: "" };
  const body = p.slice(0, p.length - m[0].length).trim();
  if (!/[\d)}]\s*$/.test(body)) return { body: p, unit: "" }; // "x" alone is a symbol, not a value with a unit
  return { body, unit: unitKey(m[1]) };
}

/** Tokenize LaTeX arithmetic; null when anything is not arithmetic. */
function tokens(src) {
  let s = String(src)
    .replace(/\\left|\\right|\\big|\\Big|\\bigg|\\Bigg/g, "")
    .replace(/\\(?:[,;:! ]|quad|qquad)|~/g, " ")
    .replace(/\{,\}/g, "") // 2{,}000
    .replace(/\\(?:times|cdot)(?![A-Za-z])|×|·|⋅/g, "*").replace(/\\div(?![A-Za-z])|÷/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/\\[dt]?frac(?![A-Za-z])/g, "\\frac");
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = s.slice(i).match(/^(?:\d{1,3}(?:,\d{3})+(?!\d)|\d+)(?:\.\d+)?(?:[eE][-+]?\d+)?|^\.\d+/);
    if (num) { out.push({ t: "num", v: parseNumber(num[0].replace(/^\./, "0.")), raw: num[0] }); i += num[0].length; continue; }
    const fn = s.slice(i).match(/^\\(frac|sqrt|ln|log|exp)(?![A-Za-z])/);
    if (fn) { out.push({ t: "fn", v: fn[1] }); i += fn[0].length; continue; }
    if ("+-*/^(){}[]".includes(c)) { out.push({ t: c }); i++; continue; }
    return null; // a letter, a backslash command we do not know, a symbol: not arithmetic
  }
  return out;
}

/** Evaluate tokens: a tiny recursive-descent parser. Returns a finite number, or null. */
function evaluate(toks) {
  let k = 0;
  const peek = () => toks[k], take = (t) => (toks[k]?.t === t ? toks[k++] : null);
  const group = () => { // {…} or (…) or [ … ]
    for (const [o, c] of [["{", "}"], ["(", ")"], ["[", "]"]]) if (take(o)) { const v = expr(); if (!take(c)) throw 0; return v; }
    return null;
  };
  function atom() {
    const t = peek();
    if (!t) throw 0;
    if (t.t === "num") { k++; return t.v; }
    if (t.t === "fn") {
      k++;
      if (t.v === "frac") { const a = group(), b = group(); if (a == null || b == null) throw 0; return a / b; }
      if (t.v === "sqrt") { if (peek()?.t === "[") throw 0; const a = group() ?? atom(); return Math.sqrt(a); }
      const a = group() ?? atom();
      return t.v === "ln" ? Math.log(a) : t.v === "log" ? Math.log10(a) : Math.exp(a);
    }
    const g = group();
    if (g != null) return g;
    throw 0;
  }
  function power() {
    let b = atom();
    if (take("^")) {
      const sign = take("-") ? -1 : (take("+"), 1);
      const e = peek()?.t === "num" ? (k++, toks[k - 1].v) : group();
      if (e == null) throw 0;
      b = b ** (sign * e);
    }
    return b;
  }
  function unary() { if (take("-")) return -unary(); if (take("+")) return unary(); return power(); }
  function term() {
    let v = unary();
    for (;;) {
      if (take("*")) v *= unary();
      else if (take("/")) v /= unary();
      else if (["(", "{", "fn"].includes(peek()?.t)) v *= unary(); // implicit product: (0.10)(0.30)
      else return v;
    }
  }
  function expr() {
    let v = term();
    for (;;) { if (take("+")) v += term(); else if (take("-")) v -= term(); else return v; }
  }
  try { const v = expr(); return k === toks.length && Number.isFinite(v) ? v : null; } catch { return null; }
}

/** A literal value as written: { value, ulp } (one unit in its last place), or null. */
function literal(body) {
  const t = tokens(body);
  if (!t) return null;
  const s = t.map((x) => (x.t === "num" ? "n" : x.t)).join("");
  // "n", "-n", "n*10^n", "n*10^{-n}", "10^{n}"
  if (!/^-?(?:n|n\*n\^\{?-?n\}?|n\^\{?-?n\}?)$/.test(s)) return null;
  const nums = t.filter((x) => x.t === "num");
  if (nums.length > 1 && nums[nums.length - 2].v !== 10 && nums.length === 3) return null;
  if (nums.length === 2 && nums[0].v !== 10) return null; // n^n is arithmetic, not a literal
  const value = evaluate(t);
  if (value == null) return null;
  const mant = nums[0].raw.replace(/,/g, "");
  const decimals = (mant.split(/[eE]/)[0].split(".")[1] || "").length;
  const eNot = Number((mant.match(/[eE]([-+]?\d+)/) || [])[1] || 0);
  const exp = nums.length > 1 ? (t.some((x) => x.t === "-" && t.indexOf(x) > 0) ? -1 : 1) * nums[nums.length - 1].v : 0;
  const scale = nums.length === 2 && nums[0].v === 10 ? 10 ** exp : nums.length === 3 ? 10 ** exp : 1;
  return { value, ulp: 10 ** (-decimals + eNot) * scale, written: body.trim() };
}

const hasOperator = (toks) => toks.some((x, i) => ["*", "/", "+", "fn", "^"].includes(x.t) || (x.t === "-" && i > 0) || (x.t === "(" && i > 0 && ["num", ")"].includes(toks[i - 1].t)));

/** The worked expressions of a text that do not compute: [{ expression, written, recomputed }]. */
export const arithmeticMismatches = (text) => workedExpressions(text).filter((x) => !x.ok).map(({ ok, ...x }) => x);

/** Every worked expression the check reads in a text, compared: [{ expression, written, recomputed, ok }]. */
export function workedExpressions(text) {
  const out = [];
  for (const m of String(text || "").matchAll(MATH)) {
    const math = m[1] ?? m[2] ?? m[3] ?? m[4];
    const { parts } = relationParts(math);
    if (parts.length < 2) continue;
    for (let i = 0; i + 1 < parts.length; i++) {
      const a = splitUnit(parts[i]), b = splitUnit(parts[i + 1]);
      const ta = tokens(a.body);
      if (!ta || !ta.length || !hasOperator(ta)) continue;
      const lit = literal(b.body);
      if (!lit) continue;
      if (a.unit && b.unit && a.unit !== b.unit) continue; // another unit: a conversion we do not guess
      const v = evaluate(ta);
      if (v == null) continue;
      // beyond the precision written (half a unit in the last place) AND beyond what rounded intermediates explain
      // (half a percent): a slipped decimal, a wrong exponent or a dropped term is far outside both
      const d = Math.abs(v - lit.value);
      const ok = !(d > 0.5 * lit.ulp * (1 + 1e-9) && d > 0.005 * Math.abs(v));
      out.push({ expression: a.body.trim(), written: lit.written, recomputed: Number(v.toPrecision(6)), ok });
    }
  }
  return out;
}

// ---- 2. equation balance -----------------------------------------------------------------------------------------
const ELEMENTS = new Set("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm D T".split(" "));

/** Atoms and charge of one species ("Al2(SO4)3", "Fe^{3+}", "SO4^2-", "CuSO4.5H2O", "e-"): { atoms, charge } or null. */
export function speciesOf(sp) {
  let s = String(sp).replace(/\s+/g, "").replace(/[{}]/g, "");
  if (/^e-?$|^e\^-$/.test(s)) return { atoms: {}, charge: -1 };
  let charge = 0;
  const ch = s.match(/\^?(\d*)([+-])$/);
  if (ch && /[A-Za-z)\d]/.test(s.slice(0, ch.index))) {
    // "SO4^2-": charge 2-; "Cl-": 1-; without "^" a digit before the sign is the formula's count ("H2-" is not a thing)
    const n = s[ch.index] === "^" ? (ch[1] ? Number(ch[1]) : 1) : (ch[1] ? null : 1);
    if (n == null) return null;
    charge = ch[2] === "+" ? n : -n;
    s = s.slice(0, ch.index);
  }
  const atoms = {};
  const add = (into, from, k) => { for (const [e, n] of Object.entries(from)) into[e] = (into[e] || 0) + n * k; };
  for (const [j, piece] of s.split(/[.·•*]/).entries()) {
    const lead = j > 0 ? piece.match(/^(\d+)/) : null;
    const body = lead ? piece.slice(lead[0].length) : piece;
    const parsed = formula(body);
    if (!parsed) return null;
    add(atoms, parsed, lead ? Number(lead[1]) : 1);
  }
  return Object.keys(atoms).length || charge ? { atoms, charge } : null;
}
function formula(s) {
  let i = 0;
  function seq(close) {
    const out = {};
    while (i < s.length) {
      if (s[i] === close) { i++; return out; }
      if (s[i] === "(" || s[i] === "[") { const c = s[i] === "(" ? ")" : "]"; i++; const inner = seq(c); if (!inner) return null; const n = count(); for (const [e, k] of Object.entries(inner)) out[e] = (out[e] || 0) + k * n; continue; }
      const m = s.slice(i).match(/^[A-Z][a-z]?/);
      if (!m || !ELEMENTS.has(m[0])) return null;
      i += m[0].length;
      const n = count();
      out[m[0]] = (out[m[0]] || 0) + n;
    }
    return close ? null : out;
  }
  function count() { const m = s.slice(i).match(/^\d+/); if (!m) return 1; i += m[0].length; return Number(m[0]); }
  const r = seq(null);
  return r && Object.keys(r).length ? r : null;
}

/** Every reaction a text writes (one per \ce{…} with an arrow, and the plain one equationIn reads). */
export function equationsIn(text) {
  const t = String(text || ""), out = [], seen = new Set();
  for (const m of t.matchAll(/\\ce\{([^}]*(?:<=>|->|<->|⇌|→)[^}]*)\}/g)) {
    const e = equationIn(`\\ce{${m[1]}}`);
    if (e) { out.push({ e, raw: m[1].trim() }); seen.add(JSON.stringify(e)); }
  }
  const plain = equationIn(t.replace(/\\ce\{[^}]*\}/g, " "));
  if (plain && !seen.has(JSON.stringify(plain))) out.push({ e: plain, raw: null });
  return out;
}

/** The imbalance of a reaction: null when balanced or unreadable; else { element, left, right } or { charge, … }. */
export function imbalanceOf(e) {
  const tally = (side) => {
    const atoms = {}; let charge = 0;
    for (const [sp, k] of Object.entries(side)) {
      const p = speciesOf(sp);
      if (!p) return null;
      for (const [el, n] of Object.entries(p.atoms)) atoms[el] = (atoms[el] || 0) + n * k;
      charge += p.charge * k;
    }
    return { atoms, charge };
  };
  const L = tally(e.left), R = tally(e.right);
  if (!L || !R) return null;
  for (const el of [...new Set([...Object.keys(L.atoms), ...Object.keys(R.atoms)])].sort()) {
    const l = L.atoms[el] || 0, r = R.atoms[el] || 0;
    if (Math.abs(l - r) > 1e-9) return { element: el, left: l, right: r };
  }
  if (Math.abs(L.charge - R.charge) > 1e-9) return { element: "charge", left: L.charge, right: R.charge };
  return null;
}

/** The unbalanced reactions of a text: [{ equation, element, left, right }]. */
export function unbalancedEquations(text) {
  const fmt = (side) => Object.entries(side).map(([sp, k]) => `${k === 1 ? "" : k} ${sp}`.trim()).join(" + ");
  return equationsIn(text).map(({ e, raw }) => ({ e, raw, x: imbalanceOf(e) })).filter((r) => r.x)
    .map(({ e, raw, x }) => ({ equation: raw || `${fmt(e.left)} → ${fmt(e.right)}`, ...x }));
}

// ---- the gate check ----------------------------------------------------------------------------------------------
/**
 * The mechanical check over a package's units (wired in skeleton/full_gate.mjs at V4/V6/V8, beside the core
 * obligations). `confirmed` is the set of "unitId|factHash" the instructor confirmed (an intended wrong answer stands).
 */
export function mechanicalFindings(units, basis, { confirmed = new Set(), factHashOf = () => "" } = {}) {
  const F = [];
  for (const u of units) {
    if (confirmed.has(`${u.id}|${factHashOf(u.text)}`)) continue;
    for (const x of arithmeticMismatches(u.text))
      F.push(makeFinding({ module: "skeleton", kind: "computation-mismatch", units: [u.id], statusClass: "defect", route: "agent", basis,
        evidence: { type: "computation", rule: "a worked expression equals the value written after it, at the precision written", expression: x.expression, written: x.written, recomputed: x.recomputed, deliverable: u.locator?.deliverable },
        recommendation: `${u.id}: ${x.expression} recomputes to ${x.recomputed}, not ${x.written} — correct the arithmetic or the value` }));
    for (const x of unbalancedEquations(u.text))
      F.push(makeFinding({ module: "skeleton", kind: "equation-unbalanced", units: [u.id], statusClass: "defect", route: "agent", basis,
        evidence: { type: "computation", rule: "a written reaction balances in every element and in charge", equation: x.equation, element: x.element, left: x.left, right: x.right, deliverable: u.locator?.deliverable },
        recommendation: `${u.id}: ${x.equation} is not balanced — ${x.element === "charge" ? "charge" : x.element} ${x.left} on the left, ${x.right} on the right` }));
  }
  return F;
}
