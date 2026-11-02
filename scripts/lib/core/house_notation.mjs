// House notation (owner 2026-11-02): one way to write math, chemistry and markup across a course. Math is KaTeX inside
// $…$ / $$…$$ with LaTeX inside it ($K_a = 2.9\times10^{3}$, not K_a = 2.9×10³ or $K_a = 2.9×10³$); chemistry is
// mhchem ($\ce{CH3COOH}$, $\ce{Ag+}$); arrows and comparisons in prose are the Unicode signs (→, ≤) or math. A spot
// written otherwise is not wrong — it reads and renders — so the check is light: a few patterns, no parser, never a
// defect. It names the line, the words and the house form, so the agent fixes it in one pass. Fenced code (diagram
// sources, where math cannot render), inline code, links, HTML comments and directive heads are not prose and are skipped.

import katex from "katex";
import "katex/contrib/mhchem";

// what a reader sees as notation in a page's source, masked so a rule never fires inside it (lengths kept, so a
// column still points into the original line)
const blank = (m) => m.replace(/[^\n]/g, " ");
const SKIP_IN_PROSE = [
  /<!--[\s\S]*?-->/g,                                   // slide directives, comments
  /\{\{nyml[\s\S]*?\}\}/g,                               // a format-1 header
  /\{\{(?:mermaid|graphviz|dot|plantuml)\b[\s\S]*?\n\}\}/g,   // diagram sources: math cannot render there
  /\{\{(?:smiles|attrs|qr|youtube|video|audio|iframe)\b[^}]*\}\}/g, // directives whose argument is not prose
  /\{\{\w+\[[^\]]*\]/g,                                  // a directive head ({{sp[info] …) — its label is prose
  /`[^`\n]*`/g,                                          // inline code
  /!?\[[^\]\n]*\]\([^)\n]*\)/g,                          // links and images (alt text is not typeset)
  /<https?:[^>\s]*>|https?:\/\/[^\s)|]+/g,               // bare URLs
];
const MATH = /\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)(?:\\\$|[^$\n]|\n(?![ \t]*\n))+?(?<!\\)\$/g; // inline math may run over a soft line break

// prose rules: notation written outside math
const ELEMENT = /^(?:H|He|Li|Be|B|C|N|O|F|Ne|Na|Mg|Al|Si|P|S|Cl|Ar|K|Ca|Sc|Ti|V|Cr|Mn|Fe|Co|Ni|Cu|Zn|Ga|Ge|As|Se|Br|Kr|Rb|Sr|Y|Zr|Nb|Mo|Tc|Ru|Rh|Pd|Ag|Cd|In|Sn|Sb|Te|I|Xe|Cs|Ba|La|Ce|Pr|Nd|Pm|Sm|Eu|Gd|Tb|Dy|Ho|Er|Tm|Yb|Lu|Hf|Ta|W|Re|Os|Ir|Pt|Au|Hg|Tl|Pb|Bi|Po|At|Rn|Fr|Ra|Ac|Th|Pa|U|Np|Pu)$/;
const isFormula = (s) => { const parts = s.replace(/\d+/g, "").match(/[A-Z][a-z]?/g) || []; return parts.length > 0 && parts.join("") === s.replace(/\d+/g, "") && parts.every((p) => ELEMENT.test(p)); };
const PROSE_RULES = [
  { rule: "subscript-outside-math", re: /(?<![\w\\$])(?:[A-Za-z]{1,3}|Δ[A-Za-z]?)_(?:\{[^}\s]*\}|[A-Za-z0-9]+)/g, house: (m) => `$${m.replace(/^Δ/, "\\Delta ").replace(/_([A-Za-z0-9]{2,})$/, "_{$1}")}$` },
  { rule: "constant-outside-math", re: /(?<![\w\\$])p?K(?:sp|eq|a[1-3]?|b[1-3]?|w|f|c|p)(?![\w])/g, house: (m) => { const s = m.replace(/^p?K/, ""); return `$${m.startsWith("p") ? "\\mathrm{p}" : ""}K_${s.length > 1 ? `{${s}}` : s}$`; } },
  { rule: "e-notation", re: /(?<![\w.])\d+(?:\.\d+)?[eE][-+−]?\d+(?![\w.])/g, house: (m) => { const [a, b] = m.split(/[eE]/); return `$${a}\\times10^{${b.replace(/^\+/, "").replace("−", "-")}}$`; } },
  { rule: "caret-outside-math", re: /(?<![\w\\$^])[A-Za-z0-9)\]]+\^(?:\{[^}]*\}|\([^)]*\)|[-+−]?[A-Za-z0-9]+)\^?/g, house: () => "math ($x^{2}$, $10^{-5}$) or chemistry ($\\ce{Hg2^2+}$)" },
  { rule: "tilde-script", re: /(?<=\w)~[^~\s]+~/g, house: () => "chemistry or math: $\\ce{H2O}$, $x_{1}$" },
  { rule: "unicode-script", re: /[\w)\]]*[₀-₉₊₋₌₍₎⁰¹²³⁴-⁹⁺⁻⁼⁽⁾ⁿ]+[\w₀-₉₊₋⁰¹²³⁴-⁹⁺⁻()]*/g, house: () => "chemistry or math: $\\ce{CH3COOH}$, $1.8\\times10^{-5}$" },
  { rule: "plain-ion", re: /(?<![\w$\\])\[?((?:[A-Z][a-z]?\d*){1,5})(\d?[+-])\]?(?=[\s,.;:)\]]|$)/g, keep: (m) => isFormula(m[1]), house: (m) => `$\\ce{${m.replace(/[[\]]/g, "")}}$` },
  { rule: "symbol-outside-math", re: /(?<![\w\\$])(?:Δ[A-Za-z]°?|[EGSHK]°)(?:_?\{?(?:f|vap|fus|sub|rxn|soln|sys|surr|univ|cell|red|ox|cathode|anode)\}?)?(?![\w])/g, house: (m) => { const x = /^(Δ?)([A-Za-z])(°?)_?\{?([a-z]*)\}?$/.exec(m); return x ? `$${x[1] ? "\\Delta " : ""}${x[2]}${x[3] ? "^\\circ" : ""}${x[4] ? `_${x[4].length > 1 ? `\\text{${x[4]}}` : x[4]}` : ""}$` : "inside $…$"; } },
  { rule: "equation-outside-math", re: /(?<![\w\\$≡–=-])[nZNEKQTPVRkxy]\s?=\s?[-−+]?\d+(?:\.\d+)?(?![\w]|\.\d)/g, house: (m) => `$${m.replace("−", "-")}$` },
  { rule: "latex-outside-math", re: /\\(?:times|frac|dfrac|tfrac|ce|text|mathrm|Delta|alpha|beta|gamma|lambda|mu|nu|pi|sigma|theta|circ|cdot|approx|rightarrow|rightleftharpoons|sqrt|ln|log|left|right)(?![A-Za-z])/g, house: () => "inside $…$" },
  { rule: "ascii-arrow", re: /(?<![-<=>!])(?:<=>|<->|->|<-|=>|<=|>=)(?![-<=>])/g, house: (m) => ({ "->": "→", "<-": "←", "=>": "⇒", "<=": "≤", ">=": "≥", "<=>": "⇌", "<->": "↔" }[m] || m) },
];
// math rules: Unicode where LaTeX belongs, inside $…$ (\text{} is prose inside math: a "J·s" there is right)
const MATH_RULES = [
  { rule: "unicode-in-math", re: /[₀-₉₊₋⁰¹²³⁴-⁹⁺⁻ⁿ×−]+/g, house: (m) => (/[×]/.test(m) ? "\\times" : /−/.test(m) ? "-" : /[⁰¹²³⁴-⁹⁺⁻ⁿ]/.test(m) ? "^{…}" : "_{…}") },
  { rule: "middle-dot-in-math", re: /·/g, house: () => "\\cdot (or keep it inside \\text{})" },
  { rule: "unit-in-italics", re: /(?<![\\\w{])(?:mol|[MsLJKg])\^\{?-\d+\}?\s*(?:\\,\s*)?(?:mol|[MsLJKg])\^\{?-?\d+\}?/g, house: () => "units upright: \\text{M}^{-1}\\,\\text{s}^{-1}" },
  { rule: "word-subscript-in-math", re: /_\{[a-z]{3,}\}/g, house: (m) => `_\\text{${m.slice(2, -1)}} (a word as a subscript is a label, set upright)` },
];

/**
 * House-notation spots in one text: [{ line, rule, found, house }], in reading order. `place` is the text's place
 * ("slides", "study-guide", …); every place follows the same notation.
 */
export function houseNotationSpots(text) {
  let src = String(text ?? "");
  // fenced code (diagram sources, code listings) is never prose or math
  src = src.replace(/^(\s*)(```|~~~)[^\n]*\n[\s\S]*?^\s*\2[^\n]*$/gm, blank);
  for (const re of SKIP_IN_PROSE) src = src.replace(re, blank);
  const spots = [];
  const lineAt = (i) => src.slice(0, i).split("\n").length;
  // math spans: checked with the math rules, then masked from the prose rules
  const maths = [];
  src.replace(MATH, (m, i) => { maths.push([m, i]); return m; });
  for (const [m, i] of maths) {
    const inner = m.replace(/\\(?:text|textrm|mathrm|operatorname)\s*\{[^{}]*\}/g, blank);
    const display = m.startsWith("$$");
    try { katex.renderToString(display ? m.slice(2, -2) : m.slice(1, -1), { throwOnError: true, displayMode: display, strict: "ignore" }); }
    catch (e) { spots.push({ at: i, line: lineAt(i), rule: "math-does-not-typeset", found: m.trim().slice(0, 80), house: String(e?.message || e).replace(/^KaTeX parse error: /, "").slice(0, 120) }); }
    for (const r of MATH_RULES) for (const x of inner.matchAll(r.re)) spots.push({ at: i + x.index, line: lineAt(i + x.index), rule: r.rule, found: m.trim().slice(0, 80), house: r.house(x[0]) });
  }
  // one expression split over several math spans with plain operators between: ($6.90\times10^{-3}$)(2×$…$)$^2$
  for (let k = 1; k < maths.length; k++) {
    const [a, ia] = maths[k - 1], [, ib] = maths[k], gap = src.slice(ia + a.length, ib);
    if (!/\n/.test(gap) && /^[\s()×·/−+\-=<>≈^\d.,]*$/.test(gap) && /[×^=≈]|\)\s*[×/·]?\s*\(|\d\s*[×/−+\-]|[×/−+\-]\s*\d/.test(gap)) spots.push({ at: ib, line: lineAt(ib), rule: "split-math", found: `${a}${gap}${maths[k][0]}`.slice(0, 80), house: "one math span for the whole expression" });
  }
  // a math span that opens with a script glued to the text before it: [A]$_0$, M$^{1-n}$
  for (const [m, i] of maths) if (/^\$[_^]/.test(m) && /[\])A-Za-z0-9]$/.test(src.slice(0, i))) spots.push({ at: i, line: lineAt(i), rule: "script-glued-to-text", found: `${src.slice(Math.max(0, i - 6), i)}${m}`.trim().slice(0, 80), house: "the base inside the math too: $[\\text{A}]_0$" });
  const prose = src.replace(MATH, blank);
  for (const r of PROSE_RULES) for (const x of prose.matchAll(r.re)) {
    if (r.keep && !r.keep(x)) continue;
    spots.push({ at: x.index, line: lineAt(x.index), rule: r.rule, found: x[0], house: r.house(x[0]) });
  }
  // an unpaired $ on a line: the rest of the paragraph would be typeset as math, or a math span shows its dollars
  prose.split("\n").forEach((l, k) => { if (/(?<!\\)\$/.test(l)) spots.push({ at: Infinity, line: k + 1, rule: "unpaired-dollar", found: l.trim().slice(0, 80), house: "close the $…$ (or write \\$ for a dollar sign)" }); });
  return spots.sort((a, b) => a.line - b.line || a.at - b.at).map(({ at, ...s }) => s);
}

/** One note per text: how many spots, and the first few with their house form. */
export function houseNotationNote(file, spots, show = 8) {
  const list = spots.slice(0, show).map((s) => `line ${s.line} ${s.rule}: «${s.found}» → ${s.house}`).join("; ");
  return `${file}: ${spots.length} spot(s) not in the house notation — ${list}${spots.length > show ? `; … ${spots.length - show} more (node scripts/house_notation.mjs --root <package> ${file})` : ""}`;
}
