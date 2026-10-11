// K2 — computable content is recomputed (red-team round 3, CONFIDENCE R3-K03; widened in round 4, R4-K01…K07,
// K09…K12). The classifier has always marked worked answers, conversions and equations "mechanical"; this file reads
// that kind, so a worked "Q_r = (0.20)^2/((0.10)(0.30)^3) = 1.48" (the true value is 14.8) and an unbalanced
// "CO + H2 <=> CH3OH" do not publish.
//
// Two checks, both deterministic and both conservative — what cannot be read without a guess is SKIPPED, never
// guessed at (a false alarm on correct work is the cost the queue dies of) — and every skip is COUNTED
// (mechanicalCoverage): a form the check could not read is reported as not checked, never passed in silence.
//
//   1. WORKED CHAINS. In math ($…$, $$…$$, \(…\), \[…\]) a chain "X = a = b = … = v" is split at its relations
//      (=, ≈, \approx, \simeq, \sim) and EVERY link between two numeric parts is compared (R4-K01): arithmetic with a
//      literal (at the literal's written precision), arithmetic with arithmetic (a restatement: one side's exact value
//      must lie in what the other's rounded inputs allow), and a literal with a literal (a re-rounding). Read: numbers
//      ("{,}" thousands, ×10^{n}, e-n), + − × · * / ÷, \frac, ^, parentheses and \left/\right, implicit products,
//      \ln \log \sqrt \exp; "\%" and "%" as the percent unit (R4-K02); aligned/align/gather/split environments, whose
//      "&" and "\\" are layout, and whose lines that open with a relation continue the chain (R4-K03); a math span that
//      opens (or the one before it ends) with a relation continues the chain across spans. Inequalities end a chain.
//      A part with a symbol is not numeric (no link to compare); a numeric part the reader cannot evaluate — a unit
//      inside the arithmetic, e^x, an n-th root, an implicit product after "/" whose precedence is a guess (R4-K11) —
//      is a skipped link. Units are compared by MEANING through the shared unit table (lib/units.mjs): "mol/L",
//      "mol L^{-1}" and "M" are one unit (R4-K12); a real change of unit is skipped; a percent on one side only is
//      compared under both readings (fraction or per cent) and reported only when neither holds.
//   2. EQUATION BALANCE. A dedicated reaction reader (R4-K04…K06, K09, K10) — not the claim reader that identifies a
//      reaction: every \ce{…} with an arrow (braces matched, mhchem arrow conditions "->[MnO2]", "<=>[a][b]" dropped,
//      states, hydrates, "+ heat"), and every reaction written outside \ce{} (\mathrm/\text math, prose, Unicode
//      sub- and superscripts). Ion charges are kept in every notation ("Ag+", "Cu^2+", "^{3+}", "^{-}", "Fe³⁺"),
//      bracketed complexes and electrons are read; a caret-less "NH4+" or "Fe3+" is read both ways (count or charge)
//      and called unbalanced only when no reading balances. A nuclear equation (^{14}_{6}C) is balanced in mass and
//      atomic number. A species that does not parse, or a side that is not wholly read, skips the equation.
// Round 5 (R5-K03…K08) made the readers cast a WIDE net and then read or count, never pass in silence and never guess:
// a chain is carried by its symbol across spans; an "=" opening a span continues the one before only across whitespace
// or a connective; arithmetic in PROSE is read clause by clause (or counted when it runs into words); the house
// notation H~2~O / Cu^2+^ is read; any other arrow between formula-like tokens is counted; schematic letters ("S → P")
// and a unit written on one side only (when only an unwritten change of unit would explain it) are skipped and counted.
// A mismatch is a DEFECT routed to the agent, with the recomputed value or the unbalanced element in its evidence.
// A unit the instructor confirmed at its current TEXT (contentHash; an intended wrong worked answer, say) is not
// re-raised; any edit of the unit voids the confirmation (R4-K07).
// PURE and DETERMINISTIC.
import { makeFinding } from "../records/findings.mjs";
import { decodeEntities, parseNumber } from "../core/values.mjs";
import { dimensionProjection } from "../units.mjs";

// ---- 1. worked chains --------------------------------------------------------------------------------------------
// inline math may wrap across ONE line break inside a paragraph (R5: a wrapped span was prose to the reader)
const MATH = /\$\$([\s\S]+?)\$\$|\$((?:[^$\n]|\n(?![ \t]*\n))+?)\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;
const ENVS = "aligned|alignedat|align\\*?|alignat\\*?|gather\\*?|gathered|split|multline\\*?|eqnarray\\*?|equation\\*?";
const BREAK = "\u0001"; // an inequality or an implication: the chain ends there

/** A math string as relation text: environments and tags out, approximate relations as "≈", inequalities as breaks. */
function prepMath(m) {
  return String(m)
    .replace(/\\%/g, "%")
    .replace(new RegExp(`\\\\(?:begin|end)\\s*\\{(?:${ENVS})\\}(?:\\s*\\{\\d+\\})?`, "g"), " \\\\ ")
    .replace(/\\(?:nonumber|notag)(?![A-Za-z])|\\tag\*?\s*\{[^{}]*\}/g, " ")
    .replace(/\\(?:approx|simeq|sim|thickapprox|thicksim|cong)(?![A-Za-z])|[≈≃∼≅]/g, "≈")
    .replace(/\\(?:leq?|geq?|leqslant|geqslant|ll|gg|neq?|lt|gt|lesssim|gtrsim|propto|Rightarrow|implies|Longrightarrow|iff)(?![A-Za-z])|[≤≥≠≪≫∝⇒]|(?<![<\\])<(?![=-])|(?<![-=])>/g, BREAK);
}
const opensWithRelation = (s) => /^\s*(?:=|≈)/.test(s);
const endsWithRelation = (s) => /(?:=|≈)\s*$/.test(s);

// What may stand between two math spans for the second, opening with a relation, to continue the first (red-team round
// 5, R5-K08): whitespace or a connective. Prose between them names a new subject ("the quotient for the reverse
// reaction $= 1/50.0$"), and the span starts a chain of its own.
const CONNECTIVE = /^[\s,;:]*(?:(?:and|so|then|thus|hence|therefore|which|that is|is|are|was|equals|i\.e\.|viz\.|namely|giving|gives|to give|yielding|or|=|≈)[\s,;:]*){0,4}$/i;
const subjectKey = (s) => String(s || "").replace(/\\(?:left|right|,|;|!| )/g, "").replace(/[\s{}]/g, "");

/** The chains of a text: [{ text }] — one per line of a derivation, continued across lines and adjacent spans. */
function chainsOf(text) {
  const T = String(text || ""), chains = [];
  let open = null, lastEnd = 0; // the chain the next span may continue; where the previous span ended
  for (const m of T.matchAll(MATH)) {
    const joinable = CONNECTIVE.test(T.slice(lastEnd, m.index));
    lastEnd = m.index + m[0].length;
    const math = prepMath(m[1] ?? m[2] ?? m[3] ?? m[4]);
    const lines = math.split(/\\\\(?:\s*\[\s*-?\d+(?:\.\d+)?\s*(?:pt|em|ex|mm|cm)\s*\])?/).map((l) => l.replace(/&/g, " "));
    for (const [li, line] of lines.entries()) {
      const pieces = line.split(BREAK);
      for (const [j, piece] of pieces.entries()) {
        if (!piece.trim()) { if (j < pieces.length - 1) open = null; continue; }
        // across spans only when nothing but a connective lies between (within a span, lines always may continue)
        const continues = j === 0 && open && (li > 0 || joinable) && (opensWithRelation(piece) || endsWithRelation(open.text));
        if (continues) open.text += ` ${piece}`;
        else { open = { text: piece }; chains.push(open); }
        if (j < pieces.length - 1) open = null;
      }
    }
  }
  return carried(chains);
}

/** A chain carried by its SYMBOL across spans (R5-K03): "$Q_r = \frac{…}{…}$, and therefore $Q_r = 148$" — an
 *  expression left without its value is completed by the next chain that names the same subject. Joined only when the
 *  earlier chain ENDS in arithmetic (it states no value of its own), so "[A] = 0.10 … later [A] = 0.05" stays two. */
function carried(chains) {
  const out = [];
  for (const c of chains) {
    const { parts } = relationParts(c.text);
    const subj = parts.length > 1 ? subjectKey(parts[0]) : "";
    const prev = subj && partOf(parts[0]).kind === "sym" ? [...out].reverse().find((x) => x.subject === subj) : null;
    if (prev && !prev.closed) {
      const last = partOf(prev.parts.at(-1));
      if (last.kind === "num" && last.op || last.kind === "unread") {
        prev.text += ` ${c.text.slice(parts[0].length)}`;
        prev.parts = relationParts(prev.text).parts;
        prev.closed = true;
        continue;
      }
    }
    out.push({ text: c.text, subject: subj, parts });
  }
  return out.map(({ text }) => ({ text }));
}

// ---- arithmetic written in prose (R5-K05) --------------------------------------------------------------------------
// Outside math the same chain is read clause by clause: each "="/"≈" splits a clause into parts; the first part is
// read from its arithmetic tail (a lead-in like "Plugging in" is prose, not the expression), the last from its
// arithmetic head (and a unit of the table after it), the others whole. A part whose arithmetic runs into words or
// units the reader cannot evaluate is UNREAD — counted, never passed in silence, never guessed at.
const ARITH = String.raw`(?:\d{1,3}(?:,\d{3})+(?!\d)|(?<=\d)[eE][-+]?\d+|[\d.()\[\]+\-−–×·⋅*/÷^%\s])`;
const OP_EDGE = /^[\s]*[×·⋅*/÷^+]|[×·⋅*/÷^+−–-]\s*$/;
// arithmetic, however written: two numbers with an operator between them ("8.314 J × 298 K", "(0.10)(0.30)")
const arithmeticIsh = (s) => /\d[^=]*?(?:[×·⋅*÷^+]|\s\/\s|\/|\)\s*\(|\s[−–-]\s)[^=]*?\d/.test(s) && (s.match(/\d+(?:\.\d+)?/g) || []).length >= 2;
const knownUnit = (w) => !!w && (w === "%" || unitMeaning(w.replace(/·/g, " ")) != null);
function maskProse(text) {
  return decodeEntities(String(text || ""))
    .replace(MATH, (m) => ` ¶ ${" ".repeat(Math.max(0, m.length - 3))}`)
    .replace(/`[^`]*`/g, " ¶ ").replace(/\{\{[\s\S]*?\}\}/g, " ¶ ").replace(/<[^>]*>/g, " ¶ ").replace(/https?:\/\/\S+/g, " ¶ ").replace(/\]\([^)]*\)/g, "] ¶ ")
    .replace(/={2,}|<=|>=|=>|!=|[<>≤≥≠]/g, " ¶ ");
}
const PROSE_CLAUSE = /[¶\n]|(?<=[.;!?:])\s+|,\s+(?=\D)/;
/** One part of a prose chain: { kind: "read", x } | { kind: "sym" } | { kind: "unread" }. */
function prosePart(raw, first, last) {
  const p = raw.trim().replace(/[.,;:]+$/, "").trim();
  if (first) {
    const tail = p.match(new RegExp(`${ARITH}*$`))[0];
    if (!/\d/.test(tail)) return arithmeticIsh(p) ? { kind: "unread" } : { kind: "sym" };
    const before = p.slice(0, p.length - tail.length);
    if (OP_EDGE.test(tail) && before.trim() || /[\d.]$/.test(before)) return { kind: "unread" }; // the arithmetic runs into words
    if (before.trim() && !/\s$/.test(before) && !/^\s/.test(tail)) return arithmeticIsh(p) ? { kind: "unread" } : { kind: "sym" }; // "2:1", "x2"
    return { kind: "read", x: tail.trim() };
  }
  const head = p.match(new RegExp(`^${ARITH}*`))[0];
  let rest = p.slice(head.length);
  if (!/\d/.test(head)) return arithmeticIsh(p) ? { kind: "unread" } : { kind: "sym" };
  const unit = rest.match(/^\s*([A-Za-z°µ][A-Za-z°µ/·^0-9-]{0,12})/);
  let x = head;
  if (unit && knownUnit(unit[1])) { x = `${head} ${unit[1]}`; rest = rest.slice(unit[0].length); }
  if (OP_EDGE.test(head) && rest.trim() || (!last && rest.trim())) return { kind: "unread" };
  if (/^[A-Za-z]/.test(rest) && !/\s$/.test(head)) return arithmeticIsh(p) ? { kind: "unread" } : { kind: "sym" }; // glued to a word: "5x", "2nd"
  return { kind: "read", x: x.trim() };
}
/** Prose chains of a text: { chains: [{ text, prose }], unread: [{ link, reason }] }. */
function proseChains(text) {
  const chains = [], unread = [];
  for (const clause of maskProse(text).split(PROSE_CLAUSE)) {
    if (!clause || !/[=≈]/.test(clause) || !/\d/.test(clause)) continue;
    const { parts, rels } = relationParts(clause);
    const P = parts.map((raw, i) => prosePart(raw, i === 0, i === parts.length - 1));
    for (let i = 0; i + 1 < P.length; i++) if (P[i].kind === "unread" || P[i + 1].kind === "unread")
      unread.push({ link: `${parts[i].trim()} ${rels[i]} ${parts[i + 1].trim()}`.replace(/\s+/g, " "), reason: "arithmetic in prose with words or units the reader does not evaluate" });
    chains.push({ text: P.map((x, i) => (i ? `${rels[i - 1]} ` : "") + (x.kind === "read" ? x.x : "¤")).join(" "), prose: true });
  }
  return { chains, unread };
}

/** Split a math string at its top-level relations (=, ≈), outside braces and brackets. */
function relationParts(s) {
  const parts = [], rels = [];
  let depth = 0, cur = "";
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

// a trailing unit: \text{…}/\mathrm{…} groups and unit-like words with exponents ("J mol^{-1}", "\,\text{kJ}", "%")
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

// ---- units by meaning (R4-K12): one unit table, read as { unit id: exponent } --------------------------------------
const DIM = dimensionProjection();
const MOLAR = { M: { mole: 1, litre: -1 }, mM: { millimole: 1, litre: -1 } }; // the value parser's extra forms
/** A unit string as its meaning ("mol/L", "mol L^-1", "M" → "litre^-1 mole^1"), or null when any factor is unknown
 *  or the denominator is ambiguous ("J/mol K"). */
export function unitMeaning(key) {
  const toks = String(key || "").replace(/\s*\/\s*/g, " / ").replace(/[·*]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return null;
  const out = {};
  let div = false, afterDiv = 0;
  for (const t of toks) {
    if (t === "/") { if (div) return null; div = true; continue; }
    const m = t.match(/^(.+?)(?:\^(-?\d+))?$/);
    let e = m[2] ? Number(m[2]) : 1;
    if (div) { if (++afterDiv > 1) return null; e = -e; }
    const hit = MOLAR[m[1]] ?? (DIM.lookup(m[1]) ? { [DIM.lookup(m[1]).id]: 1 } : null);
    if (!hit) return null;
    for (const [id, k] of Object.entries(hit)) out[id] = (out[id] || 0) + k * e;
  }
  const s = Object.entries(out).filter(([, k]) => k).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([id, k]) => `${id}^${k}`).join(" ");
  return s || null;
}
const isPercent = (u) => unitMeaning(u) === "percent^1";
/** How two parts' units relate: "same" (compare), "percent" (one side per cent only), "one-sided" (one unit written),
 *  "conversion" (skip). */
function unitRelation(ua, ub) {
  if (ua && ub) {
    const ma = unitMeaning(ua), mb = unitMeaning(ub);
    if (ma && mb) return ma === mb ? "same" : "conversion";
    return ua === ub ? "same" : "conversion";
  }
  if (isPercent(ua) || isPercent(ub)) return "percent";
  return ua || ub ? "one-sided" : "same"; // a unit on one side only: compared in the written unit, else half-read (R5-K06)
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
    if (num) {
      const raw = num[0].replace(/^\./, "0.");
      const mant = raw.replace(/,/g, "").split(/[eE]/);
      const decimals = (mant[0].split(".")[1] || "").length, eExp = Number(mant[1] || 0);
      // the half-width a written decimal allows (an integer is exact: a count, a coefficient, an exponent)
      out.push({ t: "num", v: parseNumber(raw), w: decimals ? 0.5 * 10 ** (eExp - decimals) : 0, raw: num[0] });
      i += num[0].length; continue;
    }
    const fn = s.slice(i).match(/^\\(frac|sqrt|ln|log|exp)(?![A-Za-z])/);
    if (fn) { out.push({ t: "fn", v: fn[1] }); i += fn[0].length; continue; }
    if ("+-*/^(){}[]".includes(c)) { out.push({ t: c }); i++; continue; }
    return null; // a letter, a backslash command we do not know, a symbol: not arithmetic
  }
  return out;
}

// interval arithmetic: every value is { v, lo, hi } — v exact as written, [lo, hi] what rounded inputs allow
const I = (v, lo = v, hi = v) => ({ v, lo, hi });
const span = (v, xs) => { const ys = xs.filter((x) => !Number.isNaN(x)); return ys.length === xs.length ? I(v, Math.min(...ys), Math.max(...ys)) : I(v, -Infinity, Infinity); };
const AMBIGUOUS = Symbol("ambiguous");

/** Evaluate tokens: a tiny recursive-descent parser. Returns { v, lo, hi }, null, or AMBIGUOUS (R4-K11: an implicit
 *  product after "/" — "a/(b)(c)" — is a/(b·c) to one reader and (a/b)·c to another; the check does not pick). */
function evaluate(toks) {
  let k = 0;
  const peek = () => toks[k], take = (t) => (toks[k]?.t === t ? toks[k++] : null);
  const group = () => { // {…} or (…) or [ … ]
    for (const [o, c] of [["{", "}"], ["(", ")"], ["[", "]"]]) if (take(o)) { const v = expr(); if (!take(c)) throw 0; return v; }
    return null;
  };
  const mono = (f, a) => span(f(a.v), [f(a.lo), f(a.hi)]);
  function atom() {
    const t = peek();
    if (!t) throw 0;
    if (t.t === "num") { k++; return I(t.v, t.v - t.w, t.v + t.w); }
    if (t.t === "fn") {
      k++;
      if (t.v === "frac") { const a = group(), b = group(); if (a == null || b == null) throw 0; return div(a, b); }
      if (t.v === "sqrt") { if (peek()?.t === "[") throw 0; const a = group() ?? atom(); return mono(Math.sqrt, a); }
      const a = group() ?? atom();
      return mono(t.v === "ln" ? Math.log : t.v === "log" ? Math.log10 : Math.exp, a);
    }
    const g = group();
    if (g != null) return g;
    throw 0;
  }
  const mul = (a, b) => span(a.v * b.v, [a.lo * b.lo, a.lo * b.hi, a.hi * b.lo, a.hi * b.hi]);
  const div = (a, b) => (b.lo <= 0 && b.hi >= 0 ? I(a.v / b.v, -Infinity, Infinity) : span(a.v / b.v, [a.lo / b.lo, a.lo / b.hi, a.hi / b.lo, a.hi / b.hi]));
  function power() {
    const b = atom();
    if (take("^")) {
      const sign = take("-") ? -1 : (take("+"), 1);
      const e = peek()?.t === "num" ? (k++, toks[k - 1].v) : group()?.v;
      if (e == null) throw 0;
      const x = sign * e, f = (y) => y ** x;
      const ends = [f(b.lo), f(b.hi)];
      if (b.lo < 0 && b.hi > 0 && x > 0) ends.push(0);
      return span(f(b.v), ends);
    }
    return b;
  }
  function unary() { if (take("-")) { const a = unary(); return I(-a.v, -a.hi, -a.lo); } if (take("+")) return unary(); return power(); }
  const implicitNext = () => ["(", "{", "fn"].includes(peek()?.t);
  function term() {
    let v = unary(), afterSlash = false;
    for (;;) {
      if (take("*")) { v = mul(v, unary()); afterSlash = false; }
      else if (take("/")) { v = div(v, unary()); afterSlash = true; if (implicitNext()) throw AMBIGUOUS; }
      else if (implicitNext()) { if (afterSlash) throw AMBIGUOUS; v = mul(v, unary()); } // implicit product: (0.10)(0.30)
      else return v;
    }
  }
  function expr() {
    let v = term();
    for (;;) {
      if (take("+")) { const b = term(); v = I(v.v + b.v, v.lo + b.lo, v.hi + b.hi); }
      else if (take("-")) { const b = term(); v = I(v.v - b.v, v.lo - b.hi, v.hi - b.lo); }
      else return v;
    }
  }
  try { const v = expr(); return k === toks.length && Number.isFinite(v.v) ? v : null; } catch (e) { return e === AMBIGUOUS ? AMBIGUOUS : null; }
}

/** A literal value as written: { value, ulp } (one unit in its last place), or null. */
function literal(t) {
  const s = t.map((x) => (x.t === "num" ? "n" : x.t)).join("");
  // "n", "-n", "n*10^n", "n*10^{-n}", "10^{n}"
  if (!/^-?(?:n|n\*n\^\{?-?n\}?|n\^\{?-?n\}?)$/.test(s)) return null;
  const nums = t.filter((x) => x.t === "num");
  if (nums.length > 1 && nums[nums.length - 2].v !== 10 && nums.length === 3) return null;
  if (nums.length === 2 && nums[0].v !== 10) return null; // n^n is arithmetic, not a literal
  const value = evaluate(t);
  if (!value || value === AMBIGUOUS) return null;
  const mant = nums[0].raw.replace(/,/g, "");
  const decimals = (mant.split(/[eE]/)[0].split(".")[1] || "").length;
  const eNot = Number((mant.match(/[eE]([-+]?\d+)/) || [])[1] || 0);
  const exp = nums.length > 1 ? (t.some((x) => x.t === "-" && t.indexOf(x) > 0) ? -1 : 1) * nums[nums.length - 1].v : 0;
  const scale = nums.length === 2 && nums[0].v === 10 ? 10 ** exp : nums.length === 3 ? 10 ** exp : 1;
  return { value: value.v, ulp: 10 ** (-decimals + eNot) * scale };
}

const hasOperator = (toks) => toks.some((x, i) => ["*", "/", "+", "fn", "^"].includes(x.t) || (x.t === "-" && i > 0) || (x.t === "(" && i > 0 && ["num", ")"].includes(toks[i - 1].t)));
const GREEK = /\\(?:alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|rho|sigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Sigma|Upsilon|Phi|Psi|Omega|ce|ominus|circ|ddagger|dagger|prime|bar|hat|vec|dot|overline|mathit|mathbf|operatorname)(?![A-Za-z])/;

// A number set in a font, a colour, a box or with an emphasis mark prints as the number (red-team round 6, R6-K08: the
// emphasised final answer "= \mathbf{1.48}" was taken for a symbol, so a wrong result was neither compared nor counted).
// The wrapper is read through when what it wraps is a number; a repeating decimal ("1.4\overline{8}", "0.\dot{3}") is
// read as its value. What is left that only a formatting command makes non-numeric is UNREAD (counted), never a symbol.
const NUMERIC_INSIDE = /^[\s\d.,{}()+\-−]*\d[\s\d.,{}()+\-−]*$/;
const WRAPPERS = "mathbf|boldsymbol|bm|textbf|mathrm|text|textrm|mathsf|textsf|mathit|textit|mathnormal|textup|mathup|textnormal|mbox|hbox|boxed|fbox|framebox|underline|emph|operatorname|displaystyle|textstyle";
const WRAPPED = new RegExp(`\\\\(?:${WRAPPERS})\\s*\\{([^{}]*)\\}`, "g");
const SWITCHED = /\{\s*\\(?:bf|rm|it|sf|bfseries|mdseries|boldmath|displaystyle|textstyle)(?![A-Za-z])\s*([^{}]*)\}/g;
const COLOURED = /\\(?:textcolor|colorbox)\s*\{[^{}]*\}\s*\{([^{}]*)\}|\\color\s*\{[^{}]*\}\s*(?:\{([^{}]*)\})?/g;
const REPEATING = /(\d*)\.(\d*)\\(?:overline|bar|dot|wideparen)\s*(?:\{\s*(\d+)\s*\}|(\d))/g;
function readThroughFormatting(body) {
  let b = String(body), prev;
  do {
    prev = b;
    b = b.replace(WRAPPED, (m, x) => (NUMERIC_INSIDE.test(x) ? ` ${x} ` : m))
      .replace(SWITCHED, (m, x) => (NUMERIC_INSIDE.test(x) ? ` ${x} ` : m))
      .replace(COLOURED, (m, a, c) => (a == null && c == null ? " " : NUMERIC_INSIDE.test(a ?? c) ? ` ${a ?? c} ` : m));
  } while (b !== prev);
  // a repeating block, written out to fifteen decimals (an exact value as far as any written comparison can tell)
  return b.replace(REPEATING, (m, i, fixed, rep1, rep2) => {
    const rep = rep1 ?? rep2; let dec = fixed;
    while (dec.length < 15) dec += rep;
    return `${i || "0"}.${dec.slice(0, Math.max(15, fixed.length + rep.length))}`;
  }).replace(/(?<![\\A-Za-z}^_\]])\{\s*([\d.,]+)\s*\}/g, " $1 ").replace(/\s+/g, " ").trim(); // a bare group, not an argument
}
// formatting commands: none of them makes a part a symbol on its own
const FORMATTING = new RegExp(`\\\\(?:${WRAPPERS}|overline|underline|dot|ddot|bar|hat|widehat|tilde|widetilde|wideparen|color|textcolor|colorbox|bf|rm|it|sf)(?![A-Za-z])`, "g");

/** One part of a chain: { kind: "num", … } | { kind: "sym" } (a symbol: nothing to compare) | { kind: "unread", reason }. */
function partOf(raw0) {
  const raw = readThroughFormatting(raw0);
  const { body, unit } = splitUnit(raw);
  if (!/\d/.test(body)) return { kind: "sym" };
  const t = tokens(body);
  if (t && t.length) {
    const v = evaluate(t);
    if (v === AMBIGUOUS) return { kind: "unread", reason: "an implicit product after \"/\": the precedence would be a guess", raw: body.trim() };
    if (v) {
      const lit = hasOperator(t) ? null : literal(t);
      return { kind: "num", raw: body.trim(), unit, v: v.v, lo: v.lo, hi: v.hi, op: hasOperator(t), lit };
    }
  }
  // not evaluable: a symbol makes it symbolic; otherwise it is a numeric form the reader cannot read
  const bare = body.replace(/\\(?:text|mathrm|rm|textrm|mbox)\s*\{[^{}]*\}/g, "¤").replace(/(?<![A-Za-z\\])e(?=\s*\^)/g, "¤");
  // a number under a formatting command the reader does not read through (a colour named in letters, a bar over part
  // of a number) is a number nobody read — counted, never a symbol (R6-K08)
  const unformatted = bare.replace(/\\(?:color|textcolor|colorbox)\s*\{[^{}]*\}/g, " ").replace(FORMATTING, " ");
  if (unformatted !== bare && !/\\[A-Za-z]|[A-Za-z]/.test(unformatted.replace(/¤/g, ""))) return { kind: "unread", reason: "a number under formatting the reader does not read through", raw: body.trim() };
  if (GREEK.test(bare) || /(?<!\\)\b[A-Za-z]/.test(bare.replace(/\\[A-Za-z]+/g, " "))) return { kind: "sym" };
  return { kind: "unread", reason: /¤/.test(bare) ? "a unit or e^x inside the arithmetic" : "a form the reader does not evaluate", raw: body.trim() };
}

/** Do two numeric parts agree? A literal is held to its written precision; arithmetic to what its rounded inputs
 *  allow; both beyond half a percent (what rounded intermediates explain) before a disagreement counts. */
function agree(a, b) {
  const tol = (x) => 0.005 * Math.abs(x) + 1e-12 * Math.abs(x);
  if (a.lit && b.lit) { const d = Math.abs(a.v - b.v); return d <= 0.5 * Math.max(a.lit.ulp, b.lit.ulp) * (1 + 1e-9) || d <= tol(Math.max(Math.abs(a.v), Math.abs(b.v))); }
  if (a.lit || b.lit) { const [x, l] = a.lit ? [b, a] : [a, b]; const d = Math.abs(x.v - l.v); return !(d > 0.5 * l.lit.ulp * (1 + 1e-9) && d > tol(x.v)); }
  const inside = (x, y) => x.v >= y.lo - tol(x.v) && x.v <= y.hi + tol(x.v);
  return inside(a, b) || inside(b, a);
}
const scaled = (p, f) => ({ ...p, v: p.v * f, lo: p.lo * f, hi: p.hi * f, lit: p.lit && { ...p.lit, value: p.lit.value * f, ulp: p.lit.ulp * f } });

/** Every link of every worked chain in a text: { compared: [{ expression, written, recomputed, ok }], skipped: [{ link, reason }] }. */
export function workedLinks(text) {
  const compared = [], skipped = [];
  const prose = proseChains(text);
  skipped.push(...prose.unread);
  for (const { text: chain, prose: inProse } of [...chainsOf(text), ...prose.chains]) {
    const { parts, rels } = relationParts(chain);
    const P = parts.map((p) => (p.trim() ? partOf(p) : { kind: "sym" }));
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1];
      if (a.kind === "sym" || b.kind === "sym") continue;
      const link = `${parts[i].trim()} ${rels[i]} ${parts[i + 1].trim()}`;
      if (a.kind === "unread" || b.kind === "unread") { skipped.push({ link, reason: (a.kind === "unread" ? a : b).reason }); continue; }
      if (!a.op && !b.op && (inProse || !(a.lit && b.lit))) { skipped.push({ link, reason: inProse ? "two written values in prose, no arithmetic" : "a form the reader does not evaluate" }); continue; }
      const rel = unitRelation(a.unit, b.unit);
      if (rel === "conversion") { skipped.push({ link, reason: "a change of unit" }); continue; }
      let ok = rel === "percent" ? agree(a, b) || agree(isPercent(a.unit) ? scaled(a, 0.01) : a, isPercent(b.unit) ? scaled(b, 0.01) : b) : agree(a, b);
      // a unit on ONE side only (R5-K06): the other side's unit is not written. Read in the written unit it is compared;
      // if it agrees only at a change of decimal prefix (J vs kJ, ×10^±3, ±6, ±9, ±2), the link is half-read — skipped
      // and counted, never judged; if no reading agrees, it is a mismatch whatever the unwritten unit is.
      if (!ok && rel === "one-sided") {
        const [x, w] = a.unit ? [b, a] : [a, b];
        if (PREFIX_STEPS.some((f) => agree(scaled(x, f), w))) { skipped.push({ link, reason: "a unit on one side only: it agrees only at a change of unit the text does not write" }); continue; }
      }
      // the side recomputed is the arithmetic one (or the earlier, when both are); the other is what was written
      const [x, w] = !a.op && b.op ? [b, a] : [a, b];
      compared.push({ expression: x.raw, written: w.raw, recomputed: Number(x.v.toPrecision(6)), ok });
    }
  }
  return { compared, skipped };
}
const PREFIX_STEPS = [1e-3, 1e3, 1e-6, 1e6, 1e-9, 1e9, 1e-2, 1e2];

/** Every worked expression the check reads in a text, compared: [{ expression, written, recomputed, ok }]. */
export const workedExpressions = (text) => workedLinks(text).compared;
/** The worked expressions of a text that do not compute: [{ expression, written, recomputed }]. */
export const arithmeticMismatches = (text) => workedLinks(text).compared.filter((x) => !x.ok).map(({ ok, ...x }) => x);

// ---- 2. equation balance -----------------------------------------------------------------------------------------
const ELEMENTS = new Set("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm D T".split(" "));

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
/** Atoms of a neutral body with hydrate dots ("CuSO4.5H2O"), or null. */
function bodyAtoms(s) {
  const atoms = {};
  for (const [j, piece] of s.split(/[.·•*]/).entries()) {
    const lead = j > 0 ? piece.match(/^(\d+)/) : null;
    const parsed = formula(lead ? piece.slice(lead[0].length) : piece);
    if (!parsed) return null;
    for (const [e, n] of Object.entries(parsed)) atoms[e] = (atoms[e] || 0) + n * (lead ? Number(lead[1]) : 1);
  }
  return atoms;
}

/** Every reading of one species: [{ atoms, charge }] or [{ nuclear: { A, Z } }]; [] when it does not parse.
 *  A caret-less digit before a sign ("NH4+", "Fe3+") is a count to mhchem and a charge to many authors: both. */
export function speciesReadings(sp) {
  const s = String(sp).replace(/\s+/g, "").replace(/[{}]/g, "");
  if (/^e(?:-|\^-|\^-1|\^1-)$/.test(s)) return [{ atoms: {}, charge: -1 }];
  // a nuclide: ^{A}_{Z}X or _{Z}^{A}X (mhchem and LaTeX), X an element or a particle (e, n, p, α, β, γ)
  const PARTICLE = "(?:[A-Z][a-z]?|[enp]|[αβγ]|\\\\(?:alpha|beta|gamma))$";
  const az = s.replace(/−/g, "-").match(new RegExp(`^\\^(\\d+)_(-?\\d+)${PARTICLE}`)), za = s.replace(/−/g, "-").match(new RegExp(`^_(-?\\d+)\\^(\\d+)${PARTICLE}`));
  if (az || za) return [{ nuclear: az ? { A: Number(az[1]), Z: Number(az[2]) } : { A: Number(za[2]), Z: Number(za[1]) } }];
  if (/^\^/.test(s) || /^_/.test(s)) return []; // a mass number without an atomic number: not read
  const caret = s.match(/\^(?:(\d*)([+-])|([+-])(\d*))$/);
  if (caret) {
    const n = Number(caret[1] || caret[4] || 1), sign = caret[2] || caret[3];
    const atoms = bodyAtoms(s.slice(0, caret.index));
    return atoms ? [{ atoms, charge: sign === "+" ? n : -n }] : [];
  }
  const bare = s.match(/(\d*)([+-])$/);
  if (bare) {
    const sign = bare[2] === "+" ? 1 : -1, out = [];
    const asCount = bodyAtoms(s.slice(0, bare.index + bare[1].length));
    if (asCount) out.push({ atoms: asCount, charge: sign });
    if (bare[1]) { const asCharge = bodyAtoms(s.slice(0, bare.index)); if (asCharge) out.push({ atoms: asCharge, charge: sign * Number(bare[1]) }); }
    return out;
  }
  const atoms = bodyAtoms(s);
  return atoms ? [{ atoms, charge: 0 }] : [];
}
/** Atoms and charge of one species, in its first reading: { atoms, charge } or null. */
export function speciesOf(sp) {
  const r = speciesReadings(sp)[0];
  return r && !r.nuclear ? r : null;
}

const ENERGY = /^(?:heat|energy|light|electricity|h\\nu|hν|\\Delta|Δ)$/i;
const COEF = /^(\d+\/\d+|\d+(?:\.\d+)?|[½⅓⅔¼¾]|\\[dt]?frac\{(\d+)\}\{(\d+)\})\s*(?=\S)/;
const FRACTIONS = { "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4 };
/** One term of a side: { coef, sp } | { energy: true } | null (not read). */
function termOf(piece) {
  let p = String(piece).trim().replace(/\\(?:text|mathrm|rm)\s*\{([^{}]*)\}/g, "$1").replace(/\s+[v^]$/, "").trim();
  if (ENERGY.test(p)) return { energy: true };
  let coef = 1;
  const m = p.match(COEF);
  if (m) {
    coef = m[2] ? Number(m[2]) / Number(m[3]) : FRACTIONS[m[1]] ?? (m[1].includes("/") ? Number(m[1].split("/")[0]) / Number(m[1].split("/")[1]) : Number(m[1]));
    p = p.slice(m[0].length);
  }
  p = p.replace(/\s*\((?:g|l|s|aq|cr)\)/g, "").replace(/\s*([.*·•])\s*/g, "$1").replace(/[{}]/g, "").trim();
  if (!p || /\s/.test(p) || !(coef > 0)) return null;
  return { coef, sp: p };
}
/** A side's terms as { species: coefficient }, or null when any term is not read. */
function sideOf(pieces) {
  const out = {};
  for (const x of pieces) {
    const t = termOf(x);
    if (!t) return null;
    if (t.energy) continue;
    out[t.sp] = (out[t.sp] || 0) + t.coef;
  }
  return Object.keys(out).length ? out : null;
}

// \ce{…} with its braces matched (R4-K09: "[^}]*" stopped at the first "}" of "Fe^{3+}")
function ceBlocks(text) {
  const out = [];
  const re = /\\ce\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    let depth = 1, i = m.index + m[0].length;
    for (; i < text.length && depth; i++) { if (text[i] === "{") depth++; else if (text[i] === "}") depth--; }
    if (depth) break;
    out.push({ at: m.index, end: i, body: text.slice(m.index + m[0].length, i - 1) });
    re.lastIndex = i;
  }
  return out;
}
const CE_ARROWS = ["<=>>", "<<=>", "<-->", "<=>", "<->", "->", "<-", "⇌", "⇄", "⇋", "→", "⟶", "↔", "⟷"];
/** The sides of an mhchem reaction, arrows (and their conditions "->[MnO2]", "<=>[a][b]") removed: [side text]. */
// a LaTeX arrow written inside \ce{} prints as an arrow (red-team round 6, R6-K09: "\ce{C3H8 + 5O2 \longrightarrow …}" was
// no reaction at all): read as the mhchem arrow it prints; the direction does not change a balance
const ceLatexArrows = (body) => String(body)
  .replace(/\\x(?:rightleftharpoons|leftrightharpoons|leftrightarrow|rightleftarrows)\s*(?:\[[^\]]*\])?\s*\{[^{}]*\}/g, " <=> ")
  .replace(/\\x(?:rightarrow|longrightarrow|leftarrow|longleftarrow)\s*(?:\[[^\]]*\])?\s*\{[^{}]*\}/g, " -> ")
  .replace(/\\(?:rightleftharpoons|leftrightharpoons|rightleftarrows|leftrightarrows|longleftrightarrow|leftrightarrow|Longleftrightarrow|Leftrightarrow)(?![A-Za-z])/g, " <=> ")
  .replace(/\\(?:longrightarrow|rightarrow|Longrightarrow|Rightarrow|to|longleftarrow|leftarrow|Longleftarrow|Leftarrow|gets)(?![A-Za-z])/g, " -> ");
function ceSides(body0) {
  const body = ceLatexArrows(body0);
  const sides = [];
  let depth = 0, cur = "", i = 0;
  while (i < body.length) {
    const c = body[i];
    if ("{[(".includes(c)) depth++;
    else if ("}])".includes(c)) depth = Math.max(0, depth - 1);
    const arrow = depth === 0 && CE_ARROWS.find((a) => body.startsWith(a, i));
    if (arrow) {
      sides.push(cur); cur = ""; i += arrow.length;
      for (let g = 0; g < 2 && body[i] === "["; g++) { // the arrow's conditions, brackets matched
        let d = 0;
        for (; i < body.length; i++) { if (body[i] === "[") d++; else if (body[i] === "]" && --d === 0) { i++; break; } }
      }
      continue;
    }
    cur += c; i++;
  }
  sides.push(cur);
  return sides.length > 1 ? sides : null;
}

// Unicode sub- and superscripts as ASCII ("N₂" → "N2", "Fe³⁺" → "Fe^3+")
const SUB = "₀₁₂₃₄₅₆₇₈₉", SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const unicodeScripts = (t) => t.replace(/[₀-₉]/g, (c) => String(SUB.indexOf(c)))
  .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]*)([⁺⁻])([⁰¹²³⁴⁵⁶⁷⁸⁹]*)/g, (_, a, s, b) => `^${[...(a || b)].map((c) => SUP.indexOf(c)).join("")}${s === "⁺" ? "+" : "-"}`);
/** Text outside \ce{} as text a reaction can be read from: math unwrapped, sub/superscripts joined, arrows as arrows. */
// the house notation (docs/authoring-guidelines.md, orz-markdown): "H~2~O" is H₂O and "Cu^2+^" is Cu²⁺ (R5-K04)
const houseScripts = (t) => t.replace(/~\((g|l|s|aq|cr)\)~/g, "($1)").replace(/(?<=[A-Za-z)\]])~(\d+)~/g, "$1").replace(/(?<=[A-Za-z)\]\d])\^(\d*[+\-−]|[+\-−]\d*)\^/g, (_, c) => `^${c.replace(/−/g, "-")}`);
// HTML sub- and superscripts print as scripts (red-team round 6, R6-K09: "H<sub>2</sub>O" was no species to this reader)
const htmlScripts = (t) => t.replace(/<sub>\s*(\d+)\s*<\/sub>/gi, "$1").replace(/<sub>\s*\((g|l|s|aq|cr)\)\s*<\/sub>/gi, "($1)")
  .replace(/<sup>\s*(\d*)\s*([+\-−])\s*<\/sup>/gi, (_, n, c) => `^${n}${c === "+" ? "+" : "-"}`).replace(/<sup>\s*([+\-−])\s*(\d*)\s*<\/sup>/gi, (_, c, n) => `^${n}${c === "+" ? "+" : "-"}`);
function plainChem(text) {
  let t = htmlScripts(decodeEntities(String(text || "")));
  // a \ce{} with an arrow is read by the mhchem reader above; one WITHOUT an arrow is a species (or a side) written in
  // mhchem, and prints as its formula — so "\ce{N2} + \ce{H2} \rightleftharpoons \ce{NH3}", each species in its own
  // \ce{} and the arrow outside, is a reaction written outside \ce{} (red-team round 6, R6-K09)
  for (const b of ceBlocks(t).reverse()) t = `${t.slice(0, b.at)}${ceSides(b.body) ? " ¤ " : ` ${b.body.trim()} `}${t.slice(b.end)}`;
  return unicodeScripts(houseScripts(t))
    .replace(/\\x(?:rightleftharpoons|leftrightharpoons|leftrightarrow)\s*(?:\[[^\]]*\])?\s*\{[^{}]*\}/g, " ⇌ ")
    .replace(/\\x(?:rightarrow|longrightarrow)\s*(?:\[[^\]]*\])?\s*\{[^{}]*\}/g, " → ")
    .replace(/\\(?:overset|stackrel)\s*\{[^{}]*\}\s*\{\s*(\\[A-Za-z]+)\s*\}/g, " $1 ")
    .replace(/\\(?:rightleftharpoons|leftrightharpoons|rightleftarrows|longleftrightarrow|leftrightarrow|Longleftrightarrow|rightleftarrow)(?![A-Za-z])/g, " ⇌ ")
    .replace(/\\(?:longrightarrow|rightarrow|Rightarrow|Longrightarrow|to|longleftarrow|leftarrow|Longleftarrow|gets)(?![A-Za-z])/g, " → ")
    .replace(/\\x(?:leftarrow|longleftarrow)\s*(?:\[[^\]]*\])?\s*\{[^{}]*\}/g, " → ")
    .replace(/\\(?:mathrm|text|textrm|rm|mbox|mathbf|mathsf)\s*\{/g, "{")
    .replace(/\\[dt]?frac\s*\{?\s*(\d+)\s*\}?\s*\{?\s*(\d+)\s*\}?/g, "$1/$2")
    .replace(/\\(?:[,;:! ]|q?quad)/g, " ")
    .replace(/_\s*\{\s*(\d+)\s*\}|_\s*(\d)/g, (_, a, b) => a ?? b)
    .replace(/\^\s*\{\s*([^{}]*?)\s*\}/g, (_, x) => `^${x.replace(/\s+/g, "")}`)
    .replace(/[{}]/g, "")
    .replace(/\\[a-zA-Z]+/g, " ¤ ").replace(/\$/g, " ")
    .replace(/[ \t]+/g, " ");
}
// a species outside \ce{}: coefficient, element groups (brackets and parentheses), hydrate, charge, state; an electron
const EL = "[A-Z][a-z]?", PAR = `\\((?:${EL}\\d*)+\\)`, BRK = `\\[(?:${EL}\\d*|${PAR}\\d*)+\\]`;
const GRP = `(?:(?:${EL}|${PAR}|${BRK})\\d*)+`;
const CHG = "(?:\\^(?:\\d*[+-]|[+-]\\d*)|[+-](?![\\w(\\[]))";
const SP = `(?:(?:\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[½⅓⅔¼¾])\\s*)?(?:${GRP}(?:[.·*•]\\d*${GRP})*${CHG}?(?:\\((?:g|l|s|aq|cr)\\))?${CHG}?|e\\^?-)`;
const SIDE = `${SP}(?:\\s*\\+\\s*${SP})*`;
const PLAIN_ARROW = "⇌|⇄|⇋|<=>|<->|↔|⟷|→|⟶|->|←|⟵"; // a leftward arrow balances as a rightward one (R6-K09)
const REACTION = new RegExp(`(?<![A-Za-z0-9_^\\])/.-])(${SIDE})\\s*(?<!-)(${PLAIN_ARROW})(?!>)\\s*(${SIDE})(?![A-Za-z0-9(\\[^_]|[·•*.][\\dA-Z])`, "g");
const SP_STICKY = new RegExp(`(${SP})(?:\\s*\\+\\s*|\\s*$)`, "y");
/** A plain side's terms: split at its "+" separators, never at an ion's own "+". */
function plainPieces(side) {
  const out = [];
  SP_STICKY.lastIndex = 0;
  while (SP_STICKY.lastIndex < side.length) {
    const at = SP_STICKY.lastIndex, m = SP_STICKY.exec(side);
    if (!m || SP_STICKY.lastIndex === at) return null;
    out.push(m[1]);
  }
  return out;
}
const OPEN_BEFORE = /(?:^|[^\s+])\s*\+\s*$/, OPEN_AFTER = /^\s*\+\s*(?!(?:heat|energy|light)\b)\S/i;

// a token that looks like a formula: element-like capitals with a count, a charge, a script or a second capital
const formulaLike = (tok) => { const x = String(tok).replace(/^[([{"'“]+|[)\]}.,;:!?"'”]+$/g, ""); return /^\d*(?:[A-Z][a-z]?|[([])/.test(x) && /[A-Z]/.test(x) && /^[\w()[\]^+\-~·.*]+$/.test(x) && (/\d|\^|[+-]$|~|[A-Z][a-z]?[A-Z]/.test(x)) && !/^[A-Z][a-z]{2,}/.test(x); };
const ELEMENT_NAMES = { H: "hydrogen", B: "boron", C: "carbon", N: "nitrogen", O: "oxygen", F: "fluorine", P: "phosphorus", S: "sulfur|sulphur", K: "potassium", V: "vanadium", Y: "yttrium", I: "iodine", W: "tungsten", U: "uranium", D: "deuterium", T: "tritium" };
const namesElement = (text, letters) => letters.some((l) => ELEMENT_NAMES[l] && new RegExp(`\\b(?:${ELEMENT_NAMES[l]})\\b`, "i").test(text));
/** Every reaction a text writes, read or not: [{ e, raw } | { raw, unread: reason }]. */
export function reactionsIn(text) {
  const t = String(text || ""), out = [];
  for (const b of ceBlocks(t)) {
    const sides = ceSides(b.body);
    if (!sides) continue;
    for (let i = 0; i + 1 < sides.length; i++) {
      const [l, r] = [sides[i], sides[i + 1]].map((s) => (s.trim() ? sideOf(s.trim().split(/\s+\+\s+/)) : null));
      const raw = sides.length > 2 ? `${sides[i].trim()} → ${sides[i + 1].trim()}` : b.body.trim();
      out.push(l && r ? { e: { left: l, right: r }, raw } : { raw, unread: "a species or side the reader does not parse" });
    }
  }
  const p = plainChem(t), covered = [];
  for (const m of p.matchAll(REACTION)) {
    const raw = m[0].trim(), before = p.slice(0, m.index), after = p.slice(m.index + m[0].length);
    covered.push([m.index, m.index + m[0].length]);
    if (OPEN_BEFORE.test(before) || OPEN_AFTER.test(after)) { out.push({ raw, unread: "the reaction continues past what the reader reads" }); continue; }
    const [lp, rp] = [plainPieces(m[1].trim()), plainPieces(m[3].trim())];
    // schematic letters (R5-K07): "S → P", "2B ⇌ C" — every species one bare capital, with at most a coefficient — are
    // not chemistry unless the unit says so (names one of those elements); skipped and counted, never balanced
    if (lp && rp && [...lp, ...rp].every((x) => /^(?:\d+(?:\.\d+)?\s*)?[A-Z]$/.test(x.trim())) && !namesElement(t, [...lp, ...rp].map((x) => x.trim().slice(-1)))) {
      out.push({ raw, unread: "schematic letters, not a formula (the unit names none of these elements)" }); continue;
    }
    const l = lp && sideOf(lp), r = rp && sideOf(rp);
    out.push(l && r ? { e: { left: l, right: r }, raw } : { raw, unread: "a species the reader does not parse" });
  }
  // the wide net (R5-K04): any other arrow between formula-like tokens, in any notation, is a reaction the reader did
  // not read — counted, never silent
  for (const m of p.matchAll(new RegExp(`(\\S+)\\s*(?<!-)(${PLAIN_ARROW})(?!>)\\s*(\\S+)`, "g"))) {
    const at = m.index + m[1].length;
    if (covered.some(([a, b]) => at >= a && at < b)) continue;
    if (formulaLike(m[1]) && formulaLike(m[3])) out.push({ raw: m[0].trim(), unread: "an arrow between formula-like tokens the reader does not parse" });
  }
  return out.map((x) => { const b = x.e && balanceOf(x.e); return b?.status === "unread" ? { raw: x.raw, unread: b.reason } : x; });
}
/** Every reaction a text writes that the reader reads: [{ e, raw }]. */
export const equationsIn = (text) => reactionsIn(text).filter((x) => x.e);

/** The balance of a reaction: { status: "balanced" | "unbalanced" | "unread", x?, reason? }. */
function balanceOf(e) {
  const species = [...Object.keys(e.left), ...Object.keys(e.right)];
  const R = new Map(species.map((sp) => [sp, speciesReadings(sp)]));
  if ([...R.values()].some((r) => !r.length)) return { status: "unread", reason: "a species that is not a formula of real elements" };
  const nuclear = [...R.values()].map((r) => r.some((x) => x.nuclear));
  if (nuclear.some(Boolean)) {
    if (!nuclear.every(Boolean)) return { status: "unread", reason: "a nuclear equation with a species that carries no mass and atomic number" };
    const sum = (side, k) => Object.entries(side).reduce((a, [sp, n]) => a + R.get(sp)[0].nuclear[k] * n, 0);
    for (const [k, name] of [["A", "mass number"], ["Z", "atomic number"]]) {
      const l = sum(e.left, k), r = sum(e.right, k);
      if (Math.abs(l - r) > 1e-9) return { status: "unbalanced", x: { element: name, left: l, right: r } };
    }
    return { status: "balanced" };
  }
  const combos = [...R.values()].reduce((n, r) => n * r.length, 1);
  if (combos > 64) return { status: "unread", reason: "too many ambiguous ion charges" };
  let first = null;
  for (let c = 0; c < combos; c++) {
    let rest = c;
    const pick = new Map(species.map((sp) => { const r = R.get(sp), x = r[rest % r.length]; rest = Math.floor(rest / r.length); return [sp, x]; }));
    const tally = (side) => {
      const atoms = {}; let charge = 0;
      for (const [sp, k] of Object.entries(side)) { const p = pick.get(sp); for (const [el, n] of Object.entries(p.atoms)) atoms[el] = (atoms[el] || 0) + n * k; charge += p.charge * k; }
      return { atoms, charge };
    };
    const L = tally(e.left), Rt = tally(e.right);
    let x = null;
    for (const el of [...new Set([...Object.keys(L.atoms), ...Object.keys(Rt.atoms)])].sort()) {
      const l = L.atoms[el] || 0, r = Rt.atoms[el] || 0;
      if (Math.abs(l - r) > 1e-9) { x = { element: el, left: l, right: r }; break; }
    }
    if (!x && Math.abs(L.charge - Rt.charge) > 1e-9) x = { element: "charge", left: L.charge, right: Rt.charge };
    if (!x) return { status: "balanced" };
    first ??= x;
  }
  return { status: "unbalanced", x: first };
}

/** The imbalance of a reaction: null when balanced or unreadable; else { element, left, right } (element may be
 *  "charge", "mass number" or "atomic number"). */
export function imbalanceOf(e) {
  const b = balanceOf(e);
  return b.status === "unbalanced" ? b.x : null;
}

/** The unbalanced reactions of a text: [{ equation, element, left, right }]. */
export function unbalancedEquations(text) {
  return equationsIn(text).map(({ e, raw }) => ({ raw, x: imbalanceOf(e) })).filter((r) => r.x).map(({ raw, x }) => ({ equation: raw, ...x }));
}

// ---- coverage: what was read, what was skipped -------------------------------------------------------------------
/** What the check read in a set of units, and what it could not: { compared, balanced, skipped: [{ unit, what, form, reason }] }. */
export function mechanicalCoverage(units) {
  const out = { compared: 0, balanced: 0, skipped: [] };
  for (const u of units) {
    const w = workedLinks(u.text);
    out.compared += w.compared.length;
    for (const s of w.skipped) out.skipped.push({ unit: u.id, what: "worked link", form: s.link, reason: s.reason });
    for (const r of reactionsIn(u.text)) {
      if (r.e) out.balanced++;
      else out.skipped.push({ unit: u.id, what: "reaction", form: r.raw, reason: r.unread });
    }
  }
  return out;
}

// ---- the gate check ----------------------------------------------------------------------------------------------
/**
 * The mechanical check over a package's units (wired in skeleton/full_gate.mjs at V4/V6/V8, beside the core
 * obligations). `confirmed` is the set of "unitId|contentHash" the instructor confirmed (an intended wrong answer
 * stands) — bound to the unit's whole text, so any edit voids it (R4-K07: a factHash does not see operators or words).
 */
export function mechanicalFindings(units, basis, { confirmed = new Set(), contentHashOf = () => "" } = {}) {
  const F = [];
  for (const u of units) {
    if (confirmed.has(`${u.id}|${contentHashOf(u.text)}`)) continue;
    for (const x of arithmeticMismatches(u.text))
      F.push(makeFinding({ module: "skeleton", kind: "computation-mismatch", units: [u.id], statusClass: "defect", route: "agent", basis,
        evidence: { type: "computation", rule: "every link of a worked chain computes, at the precision written", expression: x.expression, written: x.written, recomputed: x.recomputed, deliverable: u.locator?.deliverable },
        recommendation: `${u.id}: ${x.expression} recomputes to ${x.recomputed}, not ${x.written} — correct the arithmetic or the value` }));
    for (const x of unbalancedEquations(u.text))
      F.push(makeFinding({ module: "skeleton", kind: "equation-unbalanced", units: [u.id], statusClass: "defect", route: "agent", basis,
        evidence: { type: "computation", rule: "a written reaction balances in every element and in charge (a nuclear one in mass and atomic number)", equation: x.equation, element: x.element, left: x.left, right: x.right, deliverable: u.locator?.deliverable },
        recommendation: `${u.id}: ${x.equation} is not balanced — ${x.element} ${x.left} on the left, ${x.right} on the right` }));
  }
  return F;
}
