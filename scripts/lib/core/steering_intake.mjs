// M2 — the steering conversation (F3; D14). Seven questions, asked once, each with a default the agent proposes from
// the inputs; the instructor answers, adjusts, or accepts every default in one action. The answers are written to
// STEERING.json and the decision to the log.
import { STEERING_FIELDS, readSteering, validateSteering, writeSteering } from "../records/steering.mjs";
import { appendLogRecord } from "../records/log.mjs";
import { hasVisibleWords } from "../records/words.mjs";

export const STEERING_QUESTIONS = Object.freeze([
  { field: "level", ask: "Who are the students — what level is this course taught at?" },
  { field: "depth", ask: "How deep should the treatment go — conceptual, quantitative, or derivations?" },
  { field: "emphasis", ask: "What should the materials emphasise most?" },
  { field: "notation", ask: "Which notation and naming conventions should be used?" },
  { field: "exampleStyle", ask: "What kind of examples work for your students?" },
  { field: "exclusions", ask: "Is there anything the materials should leave out?" },
  { field: "tone", ask: "What tone should the writing take?" },
]);

/**
 * @param {object} o
 * @param {object} o.defaults        the agent's proposed answer for every field
 * @param {object} [o.answers]       the instructor's answers (override defaults field by field)
 * @param {boolean} [o.acceptAll]    the instructor accepted every default in one action
 * @param {object} [o.overrides]     per-chapter overrides; required when re-recording over steering that has them (a
 *                                   re-recorded answer never silently drops the instructor's per-chapter steering)
 * @param {string} o.instructorWords what the instructor said
 */
export function recordSteering(root, { defaults, answers = {}, acceptAll = false, overrides, instructorWords }, party) {
  if (party?.role !== "instructor") throw new Error("steering is the instructor's answer");
  if (overrides === undefined) {
    let prior = null; try { prior = readSteering(root); } catch { prior = null; }
    if (prior && Object.keys(prior.overrides || {}).length) throw new Error(`re-recording would drop the per-chapter overrides (${Object.keys(prior.overrides).join(", ")}): pass them (--overrides <file.json>), or {} to drop them`);
    overrides = {};
  }
  if (!hasVisibleWords(instructorWords)) throw new Error("steering quotes the instructor's words");
  for (const f of STEERING_FIELDS) if (!(f in (defaults || {}))) throw new Error(`a default must be proposed for every question (missing ${f})`);
  if (!acceptAll) for (const f of STEERING_FIELDS) if (!(f in answers)) throw new Error(`no answer for ${f}: answer it, or accept all defaults`);
  const merged = Object.fromEntries(STEERING_FIELDS.map((f) => [f, f in answers ? answers[f] : defaults[f]]));
  const steering = { schemaVersion: 1, recordedAt: new Date().toISOString(), answers: merged, overrides, changes: [] };
  const failures = validateSteering(steering);
  if (failures.length) throw new Error(`refusing steering: ${failures.join("; ")}`);
  writeSteering(root, steering);
  const changedFromDefault = STEERING_FIELDS.filter((f) => JSON.stringify(merged[f]) !== JSON.stringify(defaults[f]));
  appendLogRecord(root, { type: "steering", party, payload: { acceptAll, changedFromDefault, answers: merged, overrides, instructorWords } });
  return steering;
}
