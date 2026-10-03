// The blind link and level review (Control C2, C3, C5 fidelity; operator 2026-10-03). Coverage (C1) rests on the
// links the agent declares, and one wrong link can hide an untaught objective (v0.12 g6c). So a context-blind reviewer
// reads each linked teaching unit with its declared links and its chapter's plan, and says whether the unit teaches
// what it is linked to; for a practice question, also whether it is the type and level its guide entry prescribes.
// Trial (D13): its findings are questions, never blocking, until its own study promotes it.
import { randomBytes } from "node:crypto";
import { canonicalJson, sha256 } from "../records/canonical.mjs";
import { loadUnits } from "../core/obligations.mjs";
import { manifestChapters } from "../core/package_reader.mjs";
import { parseSpine } from "../core/spine.mjs";
import { recordDispatch } from "./dispatch.mjs";

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

export function alignmentBundle({ unit, label, before, links, plan, guide }, nonce = randomBytes(8).toString("hex")) {
  const prompt = [
    "Below is a passage from a college course, the course plan for its chapter (objectives and concepts, by id), and the plan items the passage is declared to teach.",
    'For each declared item, say whether the passage teaches or practises it ("yes"), touches it only in passing ("passing"), or does not deal with it ("no").',
    "If the passage teaches an item of the plan it is not declared for, name its id. If it teaches nothing in the plan at all, say so.",
    ...(guide ? [`The passage is a practice question; its assessment guide entry asks for: ${guide}. Say whether the question is that type of question, and whether it asks for that cognitive level.`] : []),
    "Judge what the passage does for a student, not its wording or quality.",
    `Reply with JSON only, exactly this shape: {"nonce": "${nonce}", "links": [{"id": "...", "verdict": "yes" | "passing" | "no", "why": "..."}], "also": ["<id>"], "offPlan": false${guide ? ', "fidelity": {"type": "matches" | "differs", "level": "matches" | "differs", "why": "..."}' : ""}}`,
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

/** Parse a review answer against the bundle it answered (null: unscorable). */
export function readAlignment(raw, nonce, declared, knownIds, isQuestion) {
  const m = String(raw ?? "").match(/\{[\s\S]*\}/);
  let v; try { v = JSON.parse(m?.[0] || ""); } catch { return null; }
  if (v?.nonce !== nonce || !Array.isArray(v.links)) return null;
  const links = declared.map((id) => { const x = v.links.find((l) => l?.id === id); return { id, verdict: ["yes", "passing", "no"].includes(x?.verdict) ? x.verdict : "unanswered", why: String(x?.why || "").slice(0, 400) }; });
  const also = (Array.isArray(v.also) ? v.also : []).filter((id) => knownIds.has(id) && !declared.includes(id));
  const f = isQuestion && v.fidelity && typeof v.fidelity === "object" ? { type: v.fidelity.type === "differs" ? "differs" : "matches", level: v.fidelity.level === "differs" ? "differs" : "matches", why: String(v.fidelity.why || "").slice(0, 400) } : null;
  return { links, also, offPlan: v.offPlan === true, fidelity: f };
}

/** The units the review reads: linked teaching units (answers follow their question). */
export const reviewable = (u) => u.role === "teaching" && (u.spineNodes || []).length && u.form !== "answer";

export function reviewInputs(u, all, plan) {
  const ch = plan.chapters.find((c) => u.locator.deliverable.endsWith(`/${c}.md`));
  // the chapter's own objectives and concepts first, then the course map's
  const chapterNodes = [...plan.nodes.values()].filter((n) => (n.chapter === ch || n.chapter === "course") && n.kind !== "guide" && n.kind !== "term").sort((a, b) => (a.chapter === "course") - (b.chapter === "course"));
  const links = (u.spineNodes || []).map((id) => plan.nodes.get(id)).filter(Boolean);
  const g = links.find((n) => n.kind === "guide");
  const guide = u.form === "question" && g ? `${g.type || "any type"} at the level "${g.levels || "unspecified"}" (${g.title})` : null;
  const prev = all.filter((x) => x.locator.deliverable === u.locator.deliverable && x.locator.section === u.locator.section && x.locator.ordinal < u.locator.ordinal).sort((a, b) => b.locator.ordinal - a.locator.ordinal)[0];
  return { ch, chapterNodes, links, guide, before: prev?.form === "paragraph" || prev?.form === "callout" ? prev.text : "" };
}

export async function reviewAlignment(root, reader, { verifier, only = null, onProgress = () => {} }) {
  const all = loadUnits(root, reader), plan = planOf(reader), results = [];
  for (const u of all.filter((x) => reviewable(x) && (!only || only.includes(x.id)))) {
    const inp = reviewInputs(u, all, plan);
    const linkNodes = inp.links.filter((n) => n.kind !== "guide");
    if (!linkNodes.length && !inp.guide) continue;
    const bundle = alignmentBundle({ unit: u.text, label: u.label || null, before: inp.before, links: linkNodes, plan: inp.chapterNodes, guide: inp.guide });
    const answer = await verifier(bundle.prompt);
    const read = readAlignment(answer.raw, bundle.nonce, linkNodes.map((n) => n.id), new Set(inp.chapterNodes.map((n) => n.id)), !!inp.guide);
    const basis = alignmentBasis(u, plan.nodes, [...inp.chapterNodes, ...inp.links]);
    const record = recordDispatch(root, { kind: "alignment", unit: u.id, factHash: basis, contentHash: u.locator.contentHash, bundle, answer, admission: { status: read ? "reviewed" : "unscorable" }, extra: { alignmentBasis: basis, declared: linkNodes.map((n) => n.id) } });
    results.push({ unit: u.id, dispatch: record.dispatch, status: read ? "reviewed" : "unscorable", doubtful: read ? read.links.filter((l) => l.verdict === "no").map((l) => l.id) : [], offPlan: !!read?.offPlan, fidelity: read?.fidelity || null, costUsd: answer.costUsd ?? null });
    onProgress(results.at(-1));
  }
  return results;
}
