// Proper names and fact prose (moved from verify/claims.mjs, red-team round 3, CONFIDENCE R3-K01): the claim extractor
// requires every name this file reads, and the semi-mechanical classifier (core/segment.mjs) fires on every name it
// reads — one reader, so a sentence whose name is a required token can never be judged knowledge-only ("The law of mass
// action is the work of Arrhenius."). PURE and DETERMINISTIC.
import { valueText, valuesIn } from "./values.mjs";

const PARTICLE = /^(?:van|von|de|du|der|le|la|'t|’t)$/i;
// capitalized words that are never names when they appear mid-sentence in course prose
const NOT_NAMES = new Set(["The", "This", "That", "These", "Those", "A", "An", "It", "No", "Yes", "Not", "At", "If", "In", "On", "For", "And", "Or", "But",
  "Objective", "Chapter", "Section", "Figure", "Table", "Example", "Question", "Answer", "Note", "Visual", "Reasoning", "Step", "Q", "K", "Qr"]);

/** Prose for fact extraction: LaTeX and \ce{} folded to plain (values through the one value parser, core/values.mjs:
 *  scientific notation kept exact as "9e-6", unit exponents kept), markdown links and markup removed. */
export function proseOf(text) {
  return valueText(text)
    .replace(/\\ce\s*/g, " ").replace(/\\[a-zA-Z]+/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`#>]/g, " ")
    .replace(/\s+/g, " ").trim();
}

// a verb that attributes a deed to its subject, and the capitalized words that open sentences without naming anyone
const ATTRIBUTION = /^(?:proposed|discovered|formulated|developed|invented|devised|derived|showed|demonstrated|stated|published|described|introduced|suggested|predicted|established|explained|coined|patented|synthesi[sz]ed|isolated|argued|wrote|reported|postulated|hypothesi[sz]ed|identified|enunciated)$/i;
const ADVERB = /^(?:first|later|also|independently|originally|famously|then|subsequently|eventually|correctly)$/i;
const SENTENCE_WORDS = new Set(("The This That These Those It He She They We You One Someone Nobody Everyone Each Every All Some Most Many Few Both Such Its Their His Her Our Your Who What Which Why How When Where Here There Then Now Later Earlier First Second Finally Also However Therefore Thus Hence Researchers Scientists Chemists Physicists Students Experiments Experiment Studies Study Data Results Work Research Others Early Modern Previous Further Careful Measurements Calculations Chemistry Science Nature History").split(" "));

/** Proper names: runs of capitalized words (with particles) that do not start a sentence, item, label or quote. */
export function namesIn(text) {
  // a dash inside a name is one name in any typography: "Haber–Bosch" is "Haber-Bosch" (P11 wiring sweep)
  // a list marker opens an item: the capital after it is grammatical ("- **Endothermic** reaction …", round 3)
  // a value's unit is never a name ("15,000 Torr"): values are blanked first
  const blank = (P) => valuesIn(P).reverse().reduce((t, q) => t.slice(0, q.at) + " ".repeat(q.end - q.at) + t.slice(q.end), P);
  const prose = blank(proseOf(String(text).replace(/(^|\n)[ \t]*(?:[-*+]|\d+[.)])[ \t]+/g, "$1. "))).replace(/\$[^$]*\$/g, " ").replace(/(?<=\p{L})[\u2010-\u2015](?=\p{L})/gu, "-");
  const out = new Set();
  // every boundary after which a capital is grammatical, not a name
  const segments = prose.split(/(?:[.!?:;]\s+|\s[—–-]\s|["“”‘’()\[\]{}|<>→⇒⇌]|\s-\s|\n|^)/);
  for (const seg of segments) {
    const words = seg.trim().split(/\s+/).filter(Boolean);
    let run = [];
    const flush = () => {
      while (run.length && PARTICLE.test(run[run.length - 1])) run.pop();
      const caps = run.filter((w) => /^[A-Z]/.test(w));
      if (caps.length && !(caps.length === 1 && NOT_NAMES.has(caps[0]))) out.add(run.join(" "));
      run = [];
    };
    words.forEach((w0, i) => {
      const w = w0.replace(/^[^\p{L}']+|[^\p{L}']+$/gu, "").replace(/'s$|’s$/, "");
      const isCap = /^\p{Lu}\p{Ll}{2,}/u.test(w) && !/^\p{Lu}+$/u.test(w);
      if (i === 0 && !run.length) { // sentence-initial: a name only when it reads as one ("Guldberg and Waage", "Henry Louis …", "Braun's")
        const next = (words[1] || "").replace(/[^\p{L}&]/gu, ""), after = words[2] || "";
        // a lone capitalized subject of an attribution verb is a name too ("Arrhenius proposed …", red-team round 1 F6),
        // unless it is a capitalized function word or a generic agent ("They proposed", "Chemists found")
        const verb = (ADVERB.test(next) ? after : words[1] || "").replace(/[^\p{L}]/gu, "");
        const nameLike = isCap && !NOT_NAMES.has(w) && (/['’]s\b/.test(w0) || (/^(?:and|&)$/.test(next) && /^\p{Lu}\p{Ll}{2,}/u.test(after)) || /^\p{Lu}\p{Ll}{2,}/u.test(next)
          || (ATTRIBUTION.test(verb) && !SENTENCE_WORDS.has(w)));
        if (nameLike) run.push(w);
        return;
      }
      if (isCap && !NOT_NAMES.has(w)) run.push(w);
      else if (run.length && PARTICLE.test(w)) run.push(w);
      else if (!run.length && PARTICLE.test(w) && /^\p{Lu}/u.test(words[i + 1] || "")) run.push(w);
      else flush();
    });
    flush();
  }
  return [...out].filter((n) => /\p{Lu}\p{Ll}{2,}/u.test(n));
}

// An eponymous TERM names a concept, not a deed: "the Gibbs energy", "the van 't Hoff equation", "the Haber process"
// state nothing about Gibbs, van 't Hoff or Haber that a source could check. The name is still a required token of a
// claim that is a fact for another reason (it anchors the quote: "the Haber process runs at 200 bar"), but on its own
// it does not make a sentence a fact. A name in any other position does ("the work of Arrhenius", "Arrhenius's law of
// mass action" — a possessive is an attribution).
const EPONYM_TERM = /^(?:energy|energies|equation|equations|relation|relationship|process|processes|principle|law|laws|constant|constants|cycle|synthesis|reaction|reactions|rule|rules|effect|distribution|plot|plots|isotherm|model|theory|method|function|free|entropy|number|numbers|acid|acids|base|bases|catalyst|apparatus|flask|funnel|burner|test)$/i;
/** The names a sentence asserts something about: namesIn, less the names used only as an eponymous term. The
 *  semi-mechanical classifier's name trigger (core/segment.mjs). */
export function factNamesIn(text) {
  const prose = proseOf(text).replace(/\$[^$]*\$/g, " ").replace(/[*_]/g, "");
  return namesIn(text).filter((n) => {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const uses = [...prose.matchAll(new RegExp(`(?<![\\p{L}])${esc}(['’]s)?\\s+([A-Za-z]+)`, "gu"))];
    const anyUse = new RegExp(`(?<![\\p{L}])${esc}(?![\\p{L}])`, "u").test(prose);
    // every use of the name is a bare eponym before a term noun ("Gibbs energy"); a possessive is an attribution
    return !(anyUse && uses.length && uses.length === (prose.match(new RegExp(`(?<![\\p{L}])${esc}(?![\\p{L}])`, "gu")) || []).length && uses.every((u) => !u[1] && EPONYM_TERM.test(u[2])));
  });
}
