// Spine approvals (F3; D14, D21). One approval per chapter (its concept map + assessment guide) and one for the course
// map, each a log record bound to exact content. A chapter's approval also binds the slice of the course map that bears
// on it (its place in the chapter sequence, the course concepts its prerequisites name), so a course-map edit voids
// only the chapters it touches. Re-approval has two weights: a light change, or a rephrasing its blind review found
// unchanged in meaning (D43), needs a glance confirmation; anything else a full approval.
import { appendLogRecord, parseLog, readLogText, verifyLog } from "../records/log.mjs";
import { chapterCoverage, courseCoverage, parseSpine, spinePaths, COURSE_MAP } from "./spine.mjs";
import { classifyChapterChange, classifyCourseChange } from "./change.mjs";
import { currentSpineReview } from "./spine_review.mjs";
import { currentVersion, versionOpenedAt } from "./versions.mjs";
import { hasVisibleWords } from "../records/words.mjs";

const scopeOf = (chapter) => (chapter ? `chapter:${chapter}` : "course");

function approvalRecords(logText) {
  if (verifyLog(logText).length) return [];
  return parseLog(logText).filter((r) => (r.type === "approval" || r.type === "glance-confirmation") && r.party?.role === "instructor");
}

/** The latest approval-chain record for a scope, and the last FULL approval (the reference for "light"). */
function latest(records, scope) {
  const mine = records.filter((r) => r.payload?.scope === scope);
  return { last: mine[mine.length - 1] || null, lastFull: [...mine].reverse().find((r) => r.type === "approval") || null };
}

/**
 * Status of every approval scope of a package.
 * @param {object} reader   { text(rel) } — a snapshot or a live reader
 * @param {string[]} chapters
 * @param {string} logText
 */
export function approvalStatus(reader, chapters, logText) {
  const spine = parseSpine(reader, chapters);
  const records = approvalRecords(logText);
  const out = {};
  const course = courseCoverage(reader);
  {
    const { last, lastFull } = latest(records, "course");
    out.course = { scope: "course", ...course, record: last, valid: !!last && last.payload.contentHash === course.contentHash && (last.payload.version ?? 1) === currentVersion(logText, "course") };
    if (!out.course.valid) out.course.change = last && lastFull ? classifyCourseChange(lastFull.payload.parsed || { chapterSequence: [], nodes: [] }, { chapterSequence: spine.course.chapterSequence, nodes: spine.course.nodes }, { beforeText: lastFull.payload.text, afterText: reader.text(COURSE_MAP) }) : { kind: "unapproved", reasons: [] };
  }
  for (const ch of chapters) {
    const cov = chapterCoverage(reader, spine, ch);
    const { last, lastFull } = latest(records, scopeOf(ch));
    // an approval is for one major version: a structural change opens v n+1, which needs its own approval (D15)
    const valid = !!last && last.payload.contentHash === cov.contentHash && last.payload.courseSliceHash === cov.courseSliceHash && (last.payload.version ?? 1) === currentVersion(logText, scopeOf(ch));
    const s = { scope: scopeOf(ch), ...cov, record: last, valid };
    if (!valid) {
      if (!last || !lastFull) s.change = { kind: "unapproved", reasons: [] };
      else if ((last.payload.version ?? 1) !== currentVersion(logText, scopeOf(ch))) s.change = { kind: "new-version", reasons: [{ kind: "structural", why: `version ${currentVersion(logText, scopeOf(ch))} was opened after the last approval` }] };
      else {
        const { map, guide } = spinePaths(ch);
        const before = lastFull.payload.parsed, after = { nodes: spine.chapters[ch].map.nodes, entries: spine.chapters[ch].guide.entries };
        const ownChanged = last.payload.contentHash !== cov.contentHash;
        s.change = ownChanged ? classifyChapterChange(before, after, { beforeText: (lastFull.payload.text || {})[map] + "\n" + (lastFull.payload.text || {})[guide], afterText: reader.text(map) + "\n" + reader.text(guide) })
          : { kind: "substantive", reasons: [{ kind: "substantive", why: "the course map changed where it bears on this chapter" }] };
      }
    }
    out[ch] = s;
  }
  return { spine, scopes: out };
}

/** Problems that keep a chapter (and the course map) from publishing — fed to the gate. */
export function approvalProblems(status, chapters) {
  const p = [];
  if (!status.scopes.course.valid) p.push(`the course map is not approved (${status.scopes.course.change?.kind || "unapproved"})`);
  for (const ch of chapters) if (!status.scopes[ch].valid) p.push(`chapter ${ch} is not approved (${status.scopes[ch].change?.kind || "unapproved"})`);
  return p;
}

/**
 * Why a glance confirmation of a scope must wait (null: it may be given). A light change needs no review; a
 * rephrasing needs the current blind review of its changed AND removed lines (D39) to have said that every changed line
 * says the same as the approved text it replaces and that the plan still says every removed one (D43, operator
 * 2026-10-07) — a line judged changed, or not answered, or nothing asked at all, means a full approval.
 * Red team R3 (coherence F6, control C4-02): the review is read for a light change too — a light change whose current
 * review says a line changed is not light — and a current review that raises a "wrong" concern refuses any glance: the
 * glance skips the approval preview, where that concern is shown (it also reaches the gate as a question).
 */
export function glanceProblem(root, reader, s, scope) {
  const kind = s?.change?.kind;
  const why = (s?.change?.reasons || [])[0]?.why || "no prior approval";
  if (kind !== "light" && kind !== "rephrasing") return `a glance confirmation is only for a light change or a rephrasing that keeps its meaning; this change is ${kind} (${why})`;
  const r = currentSpineReview(root, reader, scope);
  const wrong = (r?.concerns || []).filter((c) => c.kind === "wrong");
  if (wrong.length) return `a glance confirmation skips the approval preview, and the current blind review raises ${wrong.length} "wrong" concern(s) (e.g. "${wrong[0].text}": ${wrong[0].problem}) — read them (node scripts/spine.mjs preview) and approve in full`;
  if (kind === "light") {
    const off = (r?.meaning?.byLine || []).filter((m) => m === "changed").length;
    return off ? `this change looks light by its words, but its current blind review found ${off} line(s) changed in meaning — approve in full` : null;
  }
  if (!r) return `a glance confirmation is only for a light change, or a rephrasing whose blind review found every changed line the same in meaning; this rephrasing (${why}) has no current review — run it (node scripts/spine.mjs review), or approve in full`;
  if (r.meaning?.same) return null;
  if (!r.asked) return `a glance confirmation is only for a light change, or a rephrasing whose blind review found every changed line the same in meaning; this rephrasing (${why}) leaves no changed or removed line to ask about, so nothing can say its meaning is kept — approve in full`;
  const off = (r.meaning?.byLine || []).filter((m) => m !== "same").length;
  return `a glance confirmation is only for a light change, or a rephrasing whose blind review found every changed line the same in meaning; the review found ${off} line(s) changed in meaning or did not say — approve in full`;
}

/** Record an approval (full) or a glance confirmation (light, or a rephrasing that keeps its meaning) by the instructor. */
export function recordApproval(root, reader, chapters, { chapter = null, glance = false, instructorWords, note = "" }, party) {
  if (party?.role !== "instructor") throw new Error("only the instructor approves the spine");
  if (!hasVisibleWords(instructorWords)) throw new Error("an approval quotes the instructor's words");
  const logText = readLogText(root);
  const status = approvalStatus(reader, chapters, logText);
  const scope = scopeOf(chapter);
  const version = currentVersion(logText, scope);
  const s = chapter ? status.scopes[chapter] : status.scopes.course;
  if (!s) throw new Error(`unknown chapter ${chapter}`);
  if (s.valid) throw new Error(`${scope} is already approved at its current content`);
  if (glance) { const p = glanceProblem(root, reader, s, scope); if (p) throw new Error(p); }
  if (!glance && s.change?.kind === "structural" && !(versionOpenedAt(logText, scope) > (s.record?.seq || 0)))
    throw new Error(`this is a structural change (${s.change.reasons[0].why}); it opens a new major version first`);
  const texts = Object.fromEntries(s.covers.map((rel) => [rel, reader.text(rel)]));
  const parsed = chapter ? { nodes: status.spine.chapters[chapter].map.nodes, entries: status.spine.chapters[chapter].guide.entries }
    : { chapterSequence: status.spine.course.chapterSequence, nodes: status.spine.course.nodes };
  return appendLogRecord(root, { type: glance ? "glance-confirmation" : "approval", party, payload: {
    scope, covers: s.covers, version, contentHash: s.contentHash, ...(chapter ? { courseSliceHash: s.courseSliceHash } : {}),
    instructorWords, note, change: s.change?.kind || "unapproved", ...(glance ? {} : { text: chapter ? texts : texts[COURSE_MAP], parsed }),
  } });
}
