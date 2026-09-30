// STEERING.json — the instructor's standing preferences, asked once at M2 (skeleton §3, §5; D14).
import fs from "node:fs";
import path from "node:path";
import { RECORD_PATHS, recordFile } from "./paths.mjs";

export const STEERING_FIELDS = Object.freeze(["level", "depth", "emphasis", "notation", "exampleStyle", "exclusions", "tone"]);

function fieldProblem(name, value) {
  if (name === "exclusions") return Array.isArray(value) && value.every((v) => typeof v === "string") ? null : "exclusions must be a list of strings";
  return typeof value === "string" && value.trim() ? null : `${name} must be a non-empty string`;
}

export function validateSteering(steering) {
  const failures = [];
  if (!steering || typeof steering !== "object") return ["steering must be an object"];
  if (steering.schemaVersion !== 1) failures.push("steering requires schemaVersion 1");
  const answers = steering.answers || {};
  for (const name of STEERING_FIELDS) {
    if (!(name in answers)) { failures.push(`steering is missing ${name}`); continue; }
    const p = fieldProblem(name, answers[name]); if (p) failures.push(p);
  }
  for (const name of Object.keys(answers)) if (!STEERING_FIELDS.includes(name)) failures.push(`unknown steering field: ${name}`);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(steering.recordedAt || ""))) failures.push("steering requires an ISO recordedAt");
  for (const [chapter, over] of Object.entries(steering.overrides || {})) {
    for (const [name, value] of Object.entries(over || {})) {
      if (!STEERING_FIELDS.includes(name)) failures.push(`override for ${chapter}: unknown field ${name}`);
      else { const p = fieldProblem(name, value); if (p) failures.push(`override for ${chapter}: ${p}`); }
    }
  }
  if (!Array.isArray(steering.changes || [])) failures.push("steering changes must be a list");
  return failures;
}

/** The answers in force for one chapter: the course-wide answers with that chapter's overrides applied. */
export function steeringFor(steering, chapter) {
  return { ...(steering.answers || {}), ...((steering.overrides || {})[chapter] || {}) };
}

export function readSteering(root) {
  const file = recordFile(root, RECORD_PATHS.steering);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

export function writeSteering(root, steering) {
  const failures = validateSteering(steering);
  if (failures.length) throw new Error(`refusing invalid steering: ${failures.join("; ")}`);
  const file = recordFile(root, RECORD_PATHS.steering);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(steering, null, 2) + "\n");
  return file;
}
