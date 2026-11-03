// The job release for Alembic (owner 2026-11-02): the instructions an agent follows inside an Alembic assistant job,
// and the folder the job mounts as assistant/. node_modules is installed only by the real build (it needs the
// registry); here the release is built without it, and the instructions are checked for what the job must be told.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { packJobRelease, REPO, RELEASE_DIRS, RELEASE_FILES } from "../scripts/lib/core/job_release.mjs";
import { framesMode, isJobRelease, JOB_RELEASE, resolveFrames } from "../scripts/lib/frames.mjs";

const JOB = fs.readFileSync(path.join(REPO, "alembic-job", "CLAUDE.md"), "utf8");

test("[req.release.alembic-job] [req.records.site-layout-guard] the job instructions say how Coursewerk works in an Alembic job", () => {
  for (const must of [
    "alembic pull work", "node assistant/scripts/site_import.mjs work", "node assistant/scripts/site_handback.mjs work",
    "alembic push work --dry-run", "alembic push work\n", "--root work", "units.mjs begin --root work", "uses the orz packages in `assistant/node_modules` by itself",
    "assistant/COURSEWERK.md", "assistant/PROCEDURE.md", "Never run `git`", "Never install packages", "`assistant/` is read-only",
    "COURSEWERK_VERIFIER", "Haiku 5.5", ".coursewerk-host.json",
    "alembic changes > work/.alembic-changes.json", "node assistant/scripts/alembic_needs.mjs apply --root work --changes work/.alembic-changes.json",
    "node assistant/scripts/alembic_needs.mjs export --root work", "alembic handin work/.alembic-needs.json",
  ]) assert.ok(JOB.includes(must), `the job instructions mention ${JSON.stringify(must)}`);
  // the questions go out only after the record of what was asked has landed: export, hand-back, push, then hand-in
  const order = ["alembic_needs.mjs export --root work --out work/.alembic-needs.json", "site_handback.mjs work", "alembic push work\n", "alembic handin work/.alembic-needs.json"].map((x) => JOB.indexOf(x));
  assert.ok(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])), `export, hand-back, push, hand-in in that order (${order})`);
  assert.match(JOB, /If\s+the push fails, do not hand in the questions/);
  // A job never stops to ask (nothing is read while it runs), and a request without questions records none as asked.
  assert.match(JOB, /Never stop to ask/);
  assert.match(JOB, /If the request says not to hand in questions, skip the\s+export and the hand-in/);
  assert.match(JOB, /never into the job folder itself/);
  // the dry run only after the hand-back: imported, the joined log is larger than Alembic takes
  const dry = [...JOB.matchAll(/alembic push work --dry-run/g)].map((m) => m.index);
  const handback = JOB.indexOf("node assistant/scripts/site_handback.mjs work");
  assert.ok(dry.length && dry.every((i) => i > handback || /Do not use/.test(JOB.slice(i - 40, i))), "a dry run is advised only after site_handback");
  assert.ok(JOB.indexOf("node assistant/scripts/coursewerk.mjs status --root work") < handback, "where the course stands: Coursewerk's own status");
  // one units session for all writes; nothing but the push and the hand-in after the hand-back (live GenChem job 2026-11-03)
  assert.match(JOB, /Keep ONE units session\s+open for all your writes/); assert.match(JOB, /Never write course text outside\s+that session/);
  assert.match(JOB, /After the hand-back, run nothing but the push and the hand-in/);
  assert.doesNotMatch(JOB, /COURSEWERK_FRAMES=/, "commands are plain `node …`, so the job's tool permissions match them");
});

test("[req.release.alembic-job] the release holds the job instructions, Coursewerk's own, and the runtime files — no tests, git, handover or website", (t) => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-job-release-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = path.join(dir, "assistant");
  const r = packJobRelease(out, { install: false });
  assert.equal(fs.readFileSync(path.join(out, "CLAUDE.md"), "utf8"), JOB);
  assert.equal(fs.readFileSync(path.join(out, "COURSEWERK.md"), "utf8"), fs.readFileSync(path.join(REPO, "CLAUDE.md"), "utf8"));
  assert.deepEqual(r.files, ["CLAUDE.md", "COURSEWERK.md", JOB_RELEASE, ...RELEASE_DIRS, ...RELEASE_FILES].sort());
  const marker = JSON.parse(fs.readFileSync(path.join(out, JOB_RELEASE), "utf8"));
  assert.equal(marker.coursewerk, fs.readFileSync(path.join(REPO, "VERSION"), "utf8").trim());
  assert.equal(marker.frames, "installed"); assert.ok(!Number.isNaN(Date.parse(marker.builtAt)));
  assert.equal(isJobRelease(out), true);
  // build_carriers asks framesMode() with no root: inside the release that is the release itself
  const probe = `import { framesMode } from "./scripts/lib/frames.mjs"; console.log(framesMode());`;
  const env = { ...process.env }; delete env.COURSEWERK_FRAMES;
  assert.equal(spawnSync(process.execPath, ["--input-type=module", "-e", probe], { cwd: out, encoding: "utf8", env }).stdout.trim(), "installed");
  for (const f of ["scripts/site_import.mjs", "scripts/site_handback.mjs", "scripts/gate.mjs", "scripts/units.mjs", "scripts/lib/core/site_host.mjs", "skills/oer-qa", "format-contracts/deliverables.md"])
    assert.ok(fs.existsSync(path.join(out, f)), f);
  for (const f of ["tests", ".git", "handover", "site", "system", "site-type", "bootstrap", "node_modules"]) assert.equal(fs.existsSync(path.join(out, f)), false, f);
  assert.throws(() => packJobRelease(out, { install: false }), /not empty/);
});

test("[req.release.alembic-job] inside a job release the frames are the release's own: no registry is asked", (t) => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-job-frames-"));
  const saved = process.env.COURSEWERK_FRAMES;
  t.after(() => { fs.rmSync(dir, { recursive: true, force: true }); if (saved === undefined) delete process.env.COURSEWERK_FRAMES; else process.env.COURSEWERK_FRAMES = saved; });
  delete process.env.COURSEWERK_FRAMES;
  assert.equal(framesMode(dir), "latest", "no marker: the newest, as before");
  assert.equal(framesMode(), "latest", "the repository itself is no job release");
  fs.writeFileSync(path.join(dir, JOB_RELEASE), JSON.stringify({ coursewerk: "1.0.0", builtAt: "2026-11-02T00:00:00Z", frames: "installed" }));
  assert.equal(framesMode(dir), "installed", "the marker: the release's own frames");
  let asked = 0;
  const r = resolveFrames(dir, { latest: () => { asked++; return "9.9.9"; }, install: () => { asked++; return false; } });
  assert.equal(r.source, "installed"); assert.equal(asked, 0, "the registry is never asked");
  process.env.COURSEWERK_FRAMES = "latest";
  assert.equal(framesMode(dir), "latest", "the environment overrides the marker");
  process.env.COURSEWERK_FRAMES = "installed";
  fs.rmSync(path.join(dir, JOB_RELEASE));
  assert.equal(framesMode(dir), "installed");
});
