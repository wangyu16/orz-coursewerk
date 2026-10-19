// D52 (operator, 2026-10-19): agents always fetch the newest orz skills; Coursewerk bundles no copy of them.
// Offline and deterministic: the registry and installer are fakes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RECORD, SKILL_PACKAGES, checkSkills, installSkills, listSkills, skillUrl } from "../scripts/skills.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "cw-skills-")); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const OLD = { "orz-mdhtml": "0.9.0", "orz-slides": "0.8.5", "orz-paged": "0.7.3", "orz-markdown": "1.6.0" };
const NEW = { "orz-mdhtml": "1.0.1", "orz-slides": "1.0.0", "orz-paged": "1.0.0", "orz-markdown": "2.4.0" };
const fakePackages = (dir, versions) => {
  for (const [n, v] of Object.entries(versions)) {
    const p = path.join(dir, "node_modules", n);
    fs.mkdirSync(path.join(p, `${n}-skills`, "references"), { recursive: true });
    fs.writeFileSync(path.join(p, "package.json"), JSON.stringify({ name: n, version: v }));
    fs.writeFileSync(path.join(p, `${n}-skills`, "SKILL.md"), `# ${n} ${v}\n`);
    fs.writeFileSync(path.join(p, `${n}-skills`, "references", "syntax.md"), `${n} ${v} syntax\n`);
  }
  return dir;
};

test("[req.skills.newest] skills.mjs installs the newest skill of each orz package, recording its version and source", (t) => {
  const harness = fakePackages(tmp(t), OLD), cache = tmp(t), into = path.join(tmp(t), ".claude", "skills");
  let installed = null;
  const install = (dir, specs) => { installed = specs; fakePackages(dir, NEW); return true; };
  const r = installSkills(into, { harnessRoot: harness, latest: (n) => NEW[n], install, cache });
  assert.equal(r.ok, true); assert.equal(r.note, null);
  assert.deepEqual(installed.sort(), SKILL_PACKAGES.map((n) => `${n}@${NEW[n]}`).sort(), "the newest, installed into the frame cache");
  for (const pkg of SKILL_PACKAGES) {
    assert.equal(fs.readFileSync(path.join(into, pkg, "SKILL.md"), "utf8"), `# ${pkg} ${NEW[pkg]}\n`, "the newest skill, not the harness's");
    assert.ok(fs.existsSync(path.join(into, pkg, "references", "syntax.md")), "the whole skill folder");
    const rec = JSON.parse(fs.readFileSync(path.join(into, pkg, RECORD), "utf8"));
    assert.equal(rec.package, pkg); assert.equal(rec.version, NEW[pkg]); assert.match(rec.source, new RegExp(`npm:${pkg}@${NEW[pkg].replaceAll(".", "\\.")} \\(the newest published\\)`));
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(harness, "node_modules", "orz-slides", "package.json"))).version, OLD["orz-slides"], "the harness is untouched");
  // --check: all newest; then a newer release makes them stale; a hand copy with no record is unverifiable; a missing one is missing
  assert.equal(checkSkills(into, { latest: (n) => NEW[n] }).ok, true);
  const later = checkSkills(into, { latest: (n) => (n === "orz-slides" ? "1.1.0" : NEW[n]) });
  assert.equal(later.ok, false); assert.equal(later.results.find((x) => x.package === "orz-slides").status, "stale");
  fs.rmSync(path.join(into, "orz-paged", RECORD)); fs.rmSync(path.join(into, "orz-mdhtml"), { recursive: true });
  const st = Object.fromEntries(checkSkills(into, { latest: (n) => NEW[n] }).results.map((x) => [x.package, x.status]));
  assert.deepEqual(st, { "orz-mdhtml": "missing", "orz-slides": "newest", "orz-paged": "unverifiable", "orz-markdown": "newest" });
  const before = fs.readdirSync(into).sort();
  checkSkills(into, { latest: () => null }); assert.deepEqual(fs.readdirSync(into).sort(), before, "--check changes nothing");
  assert.equal(checkSkills(into, { latest: () => null }).results.find((x) => x.package === "orz-slides").status, "unknown", "offline: cannot tell, said so");
});

test("[req.skills.newest] offline: the harness's installed skills, said to be possibly stale, with the jsDelivr URLs; --list names the newest", (t) => {
  const harness = fakePackages(tmp(t), OLD), into = tmp(t);
  const r = installSkills(into, { harnessRoot: harness, latest: () => null, install: () => assert.fail("offline: no install"), cache: tmp(t) });
  assert.equal(r.ok, false); assert.match(r.note, /may be stale/); assert.match(r.note, /cdn\.jsdelivr\.net\/npm\/orz-slides\/orz-slides-skills\/SKILL\.md/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(into, "orz-slides", RECORD), "utf8")).version, OLD["orz-slides"]);
  assert.ok(r.results.every((x) => x.status === "maybe-stale"));
  assert.deepEqual(listSkills({ latest: (n) => NEW[n] }), SKILL_PACKAGES.map((p) => ({ package: p, newest: NEW[p], url: skillUrl(p) })));
  assert.equal(skillUrl("orz-paged"), "https://cdn.jsdelivr.net/npm/orz-paged/orz-paged-skills/SKILL.md", "no version: always the newest");
});

test("[req.skills.newest] the harness bundles no orz skill copy, and every entry file directs the agent to fetch the newest", () => {
  for (const pkg of ["orz-markdown", "orz-slides", "orz-paged", "orz-mdhtml"]) assert.ok(!fs.existsSync(path.join(REPO, "skills", pkg)), `skills/${pkg} is a stale copy`);
  for (const file of ["CLAUDE.md", "AGENTS.md", "GEMINI.md", "PROCEDURE.md", "format-contracts/deliverables.md"]) {
    const text = fs.readFileSync(path.join(REPO, file), "utf8");
    assert.match(text, /scripts\/skills\.mjs/, `${file} names the fetch`);
    assert.doesNotMatch(text, /skills\/orz-(markdown|slides|paged)\b(?!-skills)/, `${file} points at a bundled copy`);
  }
});
