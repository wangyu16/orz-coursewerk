// Framework notations (redesign P6, D24/D25; text format 1, D52). The deliverable is lean Markdown in orz-markdown PLUS
// the notations of the frame that will assemble it. Since D52 every orz deliverable is a format-1 TEXT (orz-markdown
// FC-18): an optional header (`{{nyml` / `kind: document` … `}}`, leading the text) and a body. A slides text MUST open
// with a header carrying `carrier: slides` and its deck keys; a declared print document likewise with `carrier: paged`;
// a study guide or practice sheet is a page (`carrier: md`, or none). The notation check reads each text with the
// carrier's OWN public reader (`readDocument(text, { kind })` of orz-slides, orz-paged and orz-mdhtml: the kit's header
// lint, the carrier's value lints and — for slides — its deck parser's lints), never a parallel grammar, and never the
// carriers' internals (D52, req.format1.public-readers). The frame's errors are defects; its warnings are notes to the
// agent (a newer frame may know a name the installed one does not, D36/D38) — except where the warning means the text
// would not show as written (below).
import { readDocument as readSlides, THEMES as SLIDE_THEMES } from "orz-slides";
import { readDocument as readPaged, THEMES as PAGED_THEMES, TEMPLATE_IDS as PAGED_TEMPLATES } from "orz-paged";
import { readDocument as readPage, THEMES as PAGE_THEMES } from "orz-mdhtml";
import { headerOf } from "./printed.mjs";

let defs = null;
/** Theme and template ids, from the installed frames' public exports (cached). */
export async function frameworkDefinitions() {
  if (defs) return defs;
  defs = {
    slideThemes: SLIDE_THEMES.map((t) => t.id),
    pagedTemplates: [...PAGED_TEMPLATES],
    pagedThemes: [...PAGED_THEMES],
    mdThemes: PAGE_THEMES.map((t) => t.id),
  };
  return defs;
}

/** The fix a frame's lint names (Lint.next: the carrier CLI command that resolves it). */
const NEXT = { upgrade: (pkg) => `run \`${pkg} upgrade\`, which moves a 0.x text's settings into the header` };
/**
 * A frame's lints as notation problems: [{ line, issue, aspect? }]. Errors are defects (no aspect); a theme the frame
 * does not have is the "theme" aspect (clothing, never a defect, D36); any other warning is the "vocabulary" aspect (a
 * note) unless `strict` holds for it (then a defect).
 */
function fromLint(lint, pkg, strict = () => false, vocabulary = () => false) {
  return lint.map((l) => {
    const issue = `${l.message}${l.next && NEXT[l.next] ? ` — ${NEXT[l.next](pkg)}` : ""} [${l.code}]`;
    const line = l.line ?? 1;
    if (vocabulary(l)) return { line, aspect: "vocabulary", issue };
    if (l.level === "error" || strict(l)) return { line, issue };
    return { line, aspect: l.code === "unknown-theme" ? "theme" : "vocabulary", issue };
  });
}

// ---- orz-slides ---------------------------------------------------------------------------------------------------
// A NAME the installed frame does not know — a template variant, a template, a transition or fit value, a layout or an
// option — is a note, never a defect: a newer frame may know it (D36, D38). Grammar that cannot render stays a defect.
const SLIDE_VOCABULARY = (l) => l.code === "unknown-option" || l.code === "unknown-layout" || (l.code === "invalid-option" && /^(?:slide \d+: )?(?:v|template|t|fit)=/.test(l.message));
/** A ratio that is a slide shape at all: w:h, both positive, between 1:4 and 4:1 (16:9, 4:3, 16:10 …). */
const ratioShapeOk = (r) => { const m = /^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/.exec(String(r ?? "")); return !!m && Number(m[1]) > 0 && Number(m[2]) > 0 && Number(m[2]) / Number(m[1]) >= 0.25 && Number(m[2]) / Number(m[1]) <= 4; };
/**
 * Problems with an orz-slides text: [{ line, issue, aspect? }]. It must open with a format-1 header carrying
 * `carrier: slides` (a 0.x `<!-- deck … -->` block is the frame's error `deck-block`, resolved by `orz-slides upgrade`).
 * A `ratio` that is no slide shape at all is a defect too (printed geometry, req.control.slide-ratio); one the frame
 * merely does not take (16:10) is a note.
 */
export function checkSlidesNotation(text) {
  const src = String(text ?? ""), P = [];
  const head = headerOf(src);
  if (!head) P.push({ line: 1, issue: "a slides text opens with the format-1 header `{{nyml` / `kind: document` / `carrier: slides` / its deck keys (title, ratio, footer …) / `}}` — a 0.x deck: run `orz-slides upgrade`, which moves the `<!-- deck … -->` keys into the header" });
  else if (head.carrier !== "slides") P.push({ line: head.start + 1, issue: `the header ${head.carrier ? `says \`carrier: ${head.carrier}\`` : "names no carrier"}: a slides text's header carries \`carrier: slides\` (Alembic assembles slides/ as an orz-slides deck)` });
  let doc; try { doc = readSlides(src, { kind: "slides" }); } catch (e) { return [...P, { line: 1, issue: `orz-slides cannot read this text (${e.message})` }]; }
  // a ratio the frame does not take is a note (a newer frame may take it) unless it is no slide shape at all
  return [...P, ...fromLint(doc.lint, "orz-slides", (l) => l.code === "invalid-value" && l.key === "ratio" && !ratioShapeOk(doc.header?.fields?.ratio), SLIDE_VOCABULARY)];
}

// ---- orz-paged ----------------------------------------------------------------------------------------------------
/** Problems with an orz-paged print document: its settings are its format-1 header, which carries `carrier: paged`. */
export function checkPagedNotation(text) {
  const src = String(text ?? ""), P = [];
  const head = headerOf(src);
  if (!head) P.push({ line: 1, issue: "an orz-paged document opens with the format-1 header `{{nyml` / `kind: document` / `carrier: paged` / its settings / `}}` (a `{{nyml kind: document}}` block further down is not read: run `orz-paged upgrade` on a 0.x document)" });
  else if (head.carrier !== "paged") P.push({ line: head.start + 1, issue: `the header ${head.carrier ? `says \`carrier: ${head.carrier}\`` : "names no carrier"}: a declared print document's header carries \`carrier: paged\`` });
  let doc; try { doc = readPaged(src, { kind: "paged" }); } catch (e) { return [...P, { line: 1, issue: `orz-paged cannot read this text (${e.message})` }]; }
  return [...P, ...fromLint(doc.lint, "orz-paged")];
}

// ---- orz-mdhtml (a page: the study guide, practice, any other declared document) ------------------------------------
/** Problems with a page text: a header is optional; when there is one it is a page's (`carrier: md`, or none). */
export function checkPageNotation(text) {
  const src = String(text ?? ""), P = [];
  const head = headerOf(src);
  if (head?.carrier && head.carrier !== "md") P.push({ line: head.start + 1, issue: `the header says \`carrier: ${head.carrier}\`: this text is assembled as a page (orz-mdhtml) — write \`carrier: md\` or no carrier` });
  let doc; try { doc = readPage(src, { kind: "md" }); } catch (e) { return [...P, { line: 1, issue: `orz-mdhtml cannot read this text (${e.message})` }]; }
  return [...P, ...fromLint(doc.lint, "orz-mdhtml")];
}
