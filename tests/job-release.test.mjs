// The job release for Alembic (owner 2026-11-02): the instructions an agent follows inside an Alembic assistant job,
// and the folder the job mounts as assistant/. node_modules is installed only by the real build (it needs the
// registry); here the release is built without it, and the instructions are checked for what the job must be told.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { packJobRelease, REPO, RELEASE_DIRS, RELEASE_FILES } from "../scripts/lib/core/job_release.mjs";

const JOB = fs.readFileSync(path.join(REPO, "alembic-job", "CLAUDE.md"), "utf8");

test("[req.release.alembic-job] the job instructions say how Coursewerk works in an Alembic job", () => {
  for (const must of [
    "alembic pull work", "node assistant/scripts/site_import.mjs work", "node assistant/scripts/site_handback.mjs work",
    "alembic push work --dry-run", "alembic push work\n", "--root work", "units.mjs begin --root work", "COURSEWERK_FRAMES=installed",
    "assistant/COURSEWERK.md", "assistant/PROCEDURE.md", "Never run `git`", "Never install packages", "`assistant/` is read-only",
    "COURSEWERK_VERIFIER", "Haiku 5.5", ".coursewerk-host.json",
  ]) assert.ok(JOB.includes(must), `the job instructions mention ${JSON.stringify(must)}`);
});

test("[req.release.alembic-job] the release holds the job instructions, Coursewerk's own, and the runtime files — no tests, git, handover or website", (t) => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-job-release-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = path.join(dir, "assistant");
  const r = packJobRelease(out, { install: false });
  assert.equal(fs.readFileSync(path.join(out, "CLAUDE.md"), "utf8"), JOB);
  assert.equal(fs.readFileSync(path.join(out, "COURSEWERK.md"), "utf8"), fs.readFileSync(path.join(REPO, "CLAUDE.md"), "utf8"));
  assert.deepEqual(r.files, ["CLAUDE.md", "COURSEWERK.md", ...RELEASE_DIRS, ...RELEASE_FILES].sort());
  for (const f of ["scripts/site_import.mjs", "scripts/site_handback.mjs", "scripts/gate.mjs", "scripts/units.mjs", "scripts/lib/core/site_host.mjs", "skills/oer-qa", "format-contracts/deliverables.md"])
    assert.ok(fs.existsSync(path.join(out, f)), f);
  for (const f of ["tests", ".git", "handover", "site", "system", "site-type", "bootstrap", "node_modules"]) assert.equal(fs.existsSync(path.join(out, f)), false, f);
  assert.throws(() => packJobRelease(out, { install: false }), /not empty/);
});
