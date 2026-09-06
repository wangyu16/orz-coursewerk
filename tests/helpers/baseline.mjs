// Accept a semantic baseline THE DOCUMENTED WAY (option 1, 2026-09-06): run the gate after the last
// edit, write the decision sheet for whatever the queue holds, decide every row, then accept. Tests
// that used to call `index_semantic.mjs` straight after an edit go through this, because the accept
// step now refuses a stale or undecided queue — which is the point.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const run = (repo, script, args) => {
  const r = spawnSync(process.execPath, [path.join(repo, "scripts", script), ...args], { cwd: repo, encoding: "utf8", env: ENV });
  return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

/**
 * @param {string} repo the coursewerk checkout
 * @param {string} pkg the package root (an output git repository)
 * @param {object} [opts] `decision` (default "accepted"), `note`, `gateArgs`
 * @returns {{gate:object, sheet:object|null, accept:object}} the three command results
 */
export function acceptBaseline(repo, pkg, opts = {}) {
  const decision = opts.decision ?? "accepted";
  const note = opts.note ?? "Accepted in the test baseline after reading the item; the fixture states what the item describes.";
  const reportsDir = path.join(pkg, "..", "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const gate = run(repo, "check_oer.mjs", ["--package", pkg, "--json", path.join(reportsDir, "baseline-qa.json"), ...(opts.gateArgs ?? [])]);
  const sheetFile = path.join(reportsDir, "queue-review.json");
  const sheetRun = run(repo, "queue_review.mjs", ["--root", pkg, "--out", sheetFile]);
  let sheet = null;
  if (sheetRun.code === 0) {
    sheet = JSON.parse(fs.readFileSync(sheetFile, "utf8"));
    for (const row of sheet.decisions) { row.decision = decision; row.note = `${note} (${row.kind})`; }
    fs.writeFileSync(sheetFile, JSON.stringify(sheet, null, 2));
  }
  const accept = run(repo, "index_semantic.mjs", ["--root", pkg, ...(sheet ? ["--review", sheetFile] : []), ...(opts.acceptArgs ?? [])]);
  return { gate, sheet, accept };
}
