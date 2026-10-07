// The first real F3 approval (redesign P3): the migrated C2 spine, approved by the instructor, stays approved, is
// well-formed, and a change to it voids exactly the approval it touches.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkSpine, parseSpine } from "../scripts/lib/core/spine.mjs";
import { approvalStatus } from "../scripts/lib/core/approvals.mjs";
import { liveReader, manifestChapters } from "../scripts/lib/core/package_reader.mjs";
import { parseLog, readLogText, verifyLog } from "../scripts/lib/records/log.mjs";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "c2-chemistry-v2", "package");

test("[req.approval.record] [req.approval.scope] the approved C2 spine: well-formed, three instructor approvals, all valid", () => {
  const reader = liveReader(FIX), chapters = manifestChapters(reader);
  assert.deepEqual(chapters, ["chemical-equilibrium", "le-chatelier"]);
  assert.deepEqual(checkSpine(parseSpine(reader, chapters), chapters), []);
  const log = readLogText(FIX);
  assert.deepEqual(verifyLog(log), []);
  const approvals = parseLog(log).filter((r) => r.type === "approval");
  assert.deepEqual(approvals.map((r) => r.payload.scope), ["course", "chapter:chemical-equilibrium", "chapter:le-chatelier"]);
  assert.ok(approvals.every((r) => r.party.role === "instructor" && r.party.name === "Yu Wang (wangyu16)" && r.payload.instructorWords === "Approve the course map and both chapters."));
  const st = approvalStatus(reader, chapters, log);
  assert.ok(Object.values(st.scopes).every((s) => s.valid));
});

test("[req.approval.voiding] [req.approval.weights] on the real spine: a punctuation edit is light, a rephrase is a rephrasing (D43), a changed count is substantive, and only that chapter voids", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-c2v2-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(FIX, root, { recursive: true });
  const guide = path.join(root, "assessment-support", "le-chatelier.md");
  const status = () => approvalStatus(liveReader(root), ["chemical-equilibrium", "le-chatelier"], readLogText(root)).scopes;
  // R2 coherence F4 + D43: light means no word changed; a rephrase ("single" → "one") is a rephrasing — a glance only
  // after its blind review finds the meaning kept (approvals.glanceProblem)
  const orig = fs.readFileSync(guide, "utf8");
  fs.writeFileSync(guide, orig.replace("This single item covers the whole chapter", "This one item covers the whole chapter"));
  assert.equal(status()["le-chatelier"].change.kind, "rephrasing");
  fs.writeFileSync(guide, orig.replace("This single item covers the whole chapter", "This *single* item covers the whole chapter"));
  assert.equal(status()["le-chatelier"].change.kind, "light");
  assert.equal(status()["chemical-equilibrium"].valid, true);
  fs.writeFileSync(guide, fs.readFileSync(guide, "utf8").replace(/(\[anchor: contrast-item\]\n\n- \*\*Type:\*\* classification\n- \*\*Count:\*\*) 1/, "$1 2"));
  assert.equal(status()["le-chatelier"].change.kind, "substantive");
  assert.equal(status().course.valid, true);
});
