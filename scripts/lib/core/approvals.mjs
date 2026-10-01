// Spine approvals (F3; D14, D21). One approval per chapter (its concept map + assessment guide) and one for the course
// map, each a log record bound to exact content. A chapter's approval also binds the slice of the course map that bears
// on it (its place in the chapter sequence, the course concepts its prerequisites name), so a course-map edit voids
// only the chapters it touches. Re-approval has two weights: a light change needs a glance confirmation; anything else
// a full approval.
import { appendLogRecord, parseLog, readLogText, verifyLog } from "../records/log.mjs";
import { chapterCoverage, courseCoverage, parseSpine, spinePaths, COURSE_MAP } from "./spine.mjs";
import { classifyChapterChange, classifyCourseChange } from "./change.mjs";
import { currentVersion, versionOpenedAt } from "./versions.mjs";

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

/** Record an approval (full) or a glance confirmation (light) by the instructor. */
export function recordApproval(root, reader, chapters, { chapter = null, glance = false, instructorWords, note = "" }, party) {
  if (party?.role !== "instructor") throw new Error("only the instructor approves the spine");
  if (!String(instructorWords || "").trim()) throw new Error("an approval quotes the instructor's words");
  const logText = readLogText(root);
  const status = approvalStatus(reader, chapters, logText);
  const scope = scopeOf(chapter);
  const version = currentVersion(logText, scope);
  const s = chapter ? status.scopes[chapter] : status.scopes.course;
  if (!s) throw new Error(`unknown chapter ${chapter}`);
  if (s.valid) throw new Error(`${scope} is already approved at its current content`);
  if (glance && s.change?.kind !== "light") throw new Error(`a glance confirmation is only for a light change; this change is ${s.change?.kind} (${(s.change?.reasons || [])[0]?.why || "no prior approval"})`);
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
