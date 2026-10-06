// The blind link and level review (Control C2, C3, C5 fidelity; operator 2026-10-03). Coverage (C1) rests on the
// links the agent declares, and one wrong link can hide an untaught objective (v0.12 g6c). So a context-blind reviewer
// reads each linked teaching unit with its declared links and its chapter's plan, and says whether the unit teaches
// what it is linked to; for a practice question, also whether it is the type and level each of its guide entries
// prescribes. Trial (D13): its findings are questions, never blocking, until its own study promotes it.
//
// Redteam round 1 (CONTROL): the review reads every unit coverage counts — answers (with their question), and units
// linked only to guide entries (their declared items are the entries and the entries' objectives) — and checks a
// question against EVERY guide entry it is linked to. An answer it cannot read is never "no problem" (C2-16): a
// verdict is matched case-insensitively, and an omitted or unrecognized verdict leaves the review unscorable.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { readLogText } from "../records/log.mjs";
import { canonicalJson, sha256 } from "../records/canonical.mjs";
import { loadUnits, reviewable, unitDepsHashes } from "../core/obligations.mjs";
import { manifestChapters } from "../core/package_reader.mjs";
import { parseSpine } from "../core/spine.mjs";
import { readDispatches, recordDispatch } from "./dispatch.mjs";
import { dispatchLogEntry } from "./verdicts.mjs";

export { reviewable };

/** Every spine node of the package, by id: objectives and concepts of each chapter and the course, and guide entries. */
export function planOf(reader) {
  const chapters = manifestChapters(reader), spine = parseSpine(reader, chapters), nodes = new Map();
  for (const n of spine.course.nodes || []) if (n.id) nodes.set(n.id, { ...n, chapter: "course" });
  for (const ch of chapters) {
    for (const n of spine.chapters[ch]?.map.nodes || []) if (n.id) nodes.set(n.id, { ...n, chapter: ch });
    for (const e of spine.chapters[ch]?.guide.entries || []) if (e.id) nodes.set(e.id, { ...e, kind: "guide", chapter: ch, text: e.title });
  }
  return { chapters, nodes };
}

/** What a review of a unit is bound to: its text, its links, and the text of every node it is judged against. */
export const alignmentBasis = (u, nodes, chapterNodes) => sha256(canonicalJson([u.locator.contentHash, [...(u.spineNodes || [])].sort(), chapterNodes.map((n) => [n.id, n.text, n.type ?? null, n.levels ?? null])]));
/** The basis of a review as reviewInputs prepared it: an answer's review is bound to its question too. */
export const reviewBasis = (u, inp) => {
  const b = alignmentBasis(u, null, [...inp.chapterNodes, ...inp.links]);
  return u.form === "answer" ? sha256(canonicalJson([b, String(inp.before || "")])) : b;
};

const guideAsk = (g) => `${g.type || "any type"} at the level "${g.levels || "unspecified"}" (${g.title})`;

export function alignmentBundle({ unit, label, before, links, plan, guide, guides = null, framing = false }, nonce = randomBytes(8).toString("hex")) {
  // one guide entry: the original wording and reply shape; several: one fidelity answer per entry, by id (C5-08)
  const many = Array.isArray(guides) && guides.length > 1;
  const one = many ? null : guide || (guides?.length === 1 ? guideAsk(guides[0]) : null);
  const prompt = [
    "Below is a passage from a college course, the course plan for its chapter (objectives and concepts, by id), and the plan items the passage is declared to teach.",
    'For each declared item, say whether the passage teaches or practises it ("yes"), touches it only in passing ("passing"), or does not deal with it ("no").',
    "If the passage teaches an item of the plan it is not declared for, name its id. If it teaches nothing in the plan at all, say so.",
    ...(framing ? ["This passage is framing (an introduction, summary or closing): it is declared for nothing and needs no plan item. Say only whether it teaches subject matter that lies outside the plan (\"offPlan\": true); a short overview or recap of the plan's own topics is not off the plan."] : []),
    ...(one ? [`The passage is a practice question; its assessment guide entry asks for: ${one}. Say whether the question is that type of question, and whether it asks for that cognitive level.`] : []),
    ...(many ? ["The passage is a practice question linked to several assessment guide entries. For EACH entry, say whether the question is that type of question, and whether it asks for that cognitive level:", ...guides.map((g) => `- ${g.id}: ${guideAsk(g)}`)] : []),
    "Judge what the passage does for a student, not its wording or quality.",
    `Reply with JSON only, exactly this shape: {"nonce": "${nonce}", "links": [{"id": "...", "verdict": "yes" | "passing" | "no", "why": "..."}], "also": ["<id>"], "offPlan": false${one ? ', "fidelity": {"type": "matches" | "differs", "level": "matches" | "differs", "why": "..."}' : ""}${many ? ', "fidelity": [{"id": "...", "type": "matches" | "differs", "level": "matches" | "differs", "why": "..."}]' : ""}}`,
    "",
    "THE CHAPTER'S PLAN",
    ...plan.map((n) => `- ${n.id}: ${String(n.text).replace(/\s+/g, " ")}`),
    "",
    "DECLARED ITEMS",
    ...links.map((n) => `- ${n.id}`),
    ...(before ? ["", "TEXT BEFORE THE PASSAGE (context only)", String(before).trim()] : []),
    "",
    label ? `PASSAGE (${label})` : "PASSAGE",
    String(unit).trim(),
  ].join("\n");
  return { kind: "alignment", nonce, prompt, bundleHash: sha256(prompt) };
}

const VERDICTS = ["yes", "passing", "no"];
const word = (x) => String(x ?? "").trim().toLowerCase().replace(/[.!]+$/, "").replace(/\s+/g, " ");
/** A fidelity word: "matches" | "differs" | "unanswered" (anything the harness cannot read as either). */
export function fidelityWord(x) {
  const w = word(x);
  if (/^(match|matches|matching|matched|same|yes)$/.test(w)) return "matches";
  if (/^(differ|differs|differing|different|mismatch|mismatched|no|does not match|doesn't match|do not match|not matching|not a match|not the same|other)$/.test(w)) return "differs";
  return "unanswered";
}

/**
 * Parse a review answer against the bundle it answered (null: unscorable). `guides` is the list of guide entry ids
 * the question was checked against (true: one, unnamed — records before round 1). Fails closed: a declared link the
 * answer leaves out, or a verdict or fidelity word it cannot read, is "unanswered", and `unanswered` lists them.
 */
export function readAlignment(raw, nonce, declared, knownIds, guides = []) {
  const m = String(raw ?? "").match(/\{[\s\S]*\}/);
  let v; try { v = JSON.parse(m?.[0] || ""); } catch { return null; }
  if (v?.nonce !== nonce || !Array.isArray(v.links)) return null;
  const links = declared.map((id) => { const x = v.links.find((l) => l?.id === id); const w = word(x?.verdict); return { id, verdict: VERDICTS.includes(w) ? w : "unanswered", why: String(x?.why || "").slice(0, 400) }; });
  const also = (Array.isArray(v.also) ? v.also : []).filter((id) => knownIds.has(id) && !declared.includes(id));
  const gids = guides === true ? [null] : guides || [];
  const given = Array.isArray(v.fidelity) ? v.fidelity : v.fidelity && typeof v.fidelity === "object" ? [v.fidelity] : [];
  const fidelity = gids.map((id, k) => {
    const f = (id && given.find((x) => x?.id === id)) || (gids.length === 1 ? given[0] : null) || null;
    return { id, type: fidelityWord(f?.type), level: fidelityWord(f?.level), why: String(f?.why || "").slice(0, 400) };
  });
  const unanswered = [...links.filter((l) => l.verdict === "unanswered").map((l) => l.id),
    ...fidelity.filter((f) => f.type === "unanswered" || f.level === "unanswered").map((f) => `fidelity${f.id ? `:${f.id}` : ""}`)];
  return { links, also, offPlan: v.offPlan === true || word(v.offPlan) === "true", fidelity, unanswered };
}

/**
 * What a unit's review reads. Declared items: its objective and concept links, the objective of each guide entry it
 * is linked to, and — for a unit that is neither a question nor an answer — the guide entries themselves (C3-05).
 * A question is checked against every guide entry it is linked to (C5-08). An answer is read with its question (C1-04).
 */
export function reviewInputs(u, all, plan) {
  const ch = plan.chapters.find((c) => u.locator.deliverable.endsWith(`/${c}.md`));
  const links = (u.spineNodes || []).map((id) => plan.nodes.get(id)).filter(Boolean);
  const guideLinks = links.filter((n) => n.kind === "guide");
  const declared = [], add = (n) => { if (n && !declared.some((x) => x.id === n.id)) declared.push(n); };
  for (const n of links.filter((x) => x.kind !== "guide")) add(n);
  for (const g of guideLinks) add(plan.nodes.get(`objective.${g.chapter}.${g.objective}`));
  if (!["question", "answer"].includes(u.form)) for (const g of guideLinks) add(g);
  // the chapter's own objectives and concepts first, then the course map's; and any guide entry declared for review
  const chapterNodes = [...plan.nodes.values()].filter((n) => (n.chapter === ch || n.chapter === "course") && n.kind !== "guide" && n.kind !== "term").sort((a, b) => (a.chapter === "course") - (b.chapter === "course"));
  for (const g of declared.filter((n) => n.kind === "guide")) chapterNodes.push({ ...g, text: `assessment guide entry: ${guideAsk(g)}` });
  const guides = u.form === "question" ? guideLinks : [];
  const guide = guides.length === 1 ? guideAsk(guides[0]) : null;
  const prev = all.filter((x) => x.locator.deliverable === u.locator.deliverable && x.locator.section === u.locator.section && x.locator.ordinal < u.locator.ordinal).sort((a, b) => b.locator.ordinal - a.locator.ordinal)[0];
  const before = u.form === "answer" ? (prev?.form === "question" ? prev.text : "") : prev?.form === "paragraph" || prev?.form === "callout" ? prev.text : "";
  // D42: framing is read for off-plan content only — whatever it links to, nothing is declared for it to teach
  if (u.role === "framing") return { ch, chapterNodes, links, declared: [], guides: [], guide: null, before };
  return { ch, chapterNodes, links, declared, guides, guide, before };
}

export async function reviewAlignment(root, reader, { verifier, only = null, onProgress = () => {} }) {
  const all = loadUnits(root, reader), plan = planOf(reader), results = [], deps = unitDepsHashes(root, reader);
  // D42: framing (introductions, summaries, closing slides) is read too — for off-plan content only, it needs no link
  for (const u of all.filter((x) => (reviewable(x) || x.role === "framing") && (!only || only.includes(x.id)))) {
    const inp = reviewInputs(u, all, plan), framing = u.role === "framing";
    if (!framing && !inp.declared.length && !inp.guides.length) continue; // links to nothing in the plan: unit-link-dangling says so
    const bundle = alignmentBundle({ unit: u.text, label: u.label || null, before: inp.before, links: framing ? [] : inp.declared, plan: inp.chapterNodes, guides: framing ? [] : inp.guides, framing });
    const answer = await verifier(bundle.prompt);
    const read = readAlignment(answer.raw, bundle.nonce, inp.declared.map((n) => n.id), new Set(inp.chapterNodes.map((n) => n.id)), inp.guides.map((g) => g.id));
    const basis = reviewBasis(u, inp);
    const status = !read ? "unscorable" : read.unanswered.length ? "incomplete" : "reviewed";
    const record = recordDispatch(root, { kind: "alignment", unit: u.id, factHash: basis, contentHash: u.locator.contentHash, bundle, answer, admission: { status }, deps: deps.get(u.id), extra: { alignmentBasis: basis, declared: inp.declared.map((n) => n.id), guides: inp.guides.map((g) => g.id) } });
    results.push({ unit: u.id, dispatch: record.dispatch, status, doubtful: read ? read.links.filter((l) => l.verdict === "no").map((l) => l.id) : [], unanswered: read?.unanswered || [], offPlan: !!read?.offPlan, fidelity: read?.fidelity || [], costUsd: answer.costUsd ?? null });
    onProgress(results.at(-1));
  }
  return results;
}

/**
 * What each unit's CURRENT link review says (D41; the same rule MS9 reads): of the logged alignment records whose basis
 * matches the unit as it is now, the newest readable one. Map(unit id → { verdicts: Map(node id → yes|passing|no),
 * offPlan, dispatch }). A unit absent from the map has no current review.
 */
export function currentReviews(all, plan, records, log) {
  const out = new Map(), byUnit = new Map();
  for (const r of records.filter((x) => x.kind === "alignment")) {
    const entry = dispatchLogEntry(r, log); if (!entry) continue;
    byUnit.set(r.unit, [...(byUnit.get(r.unit) || []), { r, seq: Number(entry.seq ?? 0) }]);
  }
  for (const u of all) {
    const recs = byUnit.get(u.id); if (!recs || !(reviewable(u) || u.role === "framing")) continue;
    const inp = reviewInputs(u, all, plan), basis = reviewBasis(u, inp);
    const declared = inp.declared.map((n) => n.id), guides = inp.guides.map((g) => g.id), known = new Set(inp.chapterNodes.map((n) => n.id));
    for (const { r } of recs.filter(({ r }) => r.alignmentBasis === basis).sort((a, b) => b.seq - a.seq)) {
      const v = readAlignment(r.answer?.raw, r.bundle?.nonce, declared, known, r.guides ? guides : guides.length ? true : []);
      if (v) { out.set(u.id, { verdicts: new Map(v.links.map((l) => [l.id, l.verdict])), offPlan: v.offPlan, dispatch: r.dispatch }); break; }
    }
  }
  return out;
}
/** The same, read from a package on disk. */
export function currentReviewsAt(root, reader, all) {
  const dir = path.join(root, "metadata", "verification");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => `metadata/verification/${f}`) : [];
  const records = readDispatches((p) => fs.readFileSync(path.join(root, p), "utf8"), files);
  const log = readLogText(root).split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  return currentReviews(all, planOf(reader), records, log);
}
