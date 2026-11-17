// Coursewerk's half of the hosting contract (req.host.fc16-pointer; FC-16 O9): COMPATIBILITY.md points to the family's
// FC-16 v1 and states the pinned contract, and what it states matches the code it names.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { RECORD_LIMITS } from "../scripts/lib/core/site_export.mjs";

const doc = fs.readFileSync(new URL("../COMPATIBILITY.md", import.meta.url), "utf8");
const def = JSON.parse(fs.readFileSync(new URL("../site-type/site-type.json", import.meta.url), "utf8"));
const section = doc.split("\n## ").find((s) => s.startsWith("The contract with Alembic (FC-16 v1)"));

test("[req.host.fc16-pointer] COMPATIBILITY.md points to FC-16 v1 and states the pinned contract", () => {
  assert.ok(section, "a section on the contract with Alembic");
  assert.match(section, /https:\/\/github\.com\/wangyu16\/orz-family\/blob\/main\/docs\/FC-16-v1\.md/);
  assert.match(section, /\*\*Pinned contract:\*\* FC-16 v1/);
  assert.match(section, /FC-16 wins/);
  // what it states is what the code does
  assert.ok(section.includes(`\`${def.version}\``), `the site type version (${def.version})`);
  assert.equal(RECORD_LIMITS.bytesPerSite, 200 * 1024 * 1024); assert.match(section, /200 MB per site/);
  for (const f of ["scripts/records_check.mjs", "scripts/alembic_transfer.mjs", "scripts/pack_job_release.mjs"]) {
    assert.ok(section.includes(f), f); assert.ok(fs.existsSync(new URL(`../${f}`, import.meta.url)), f);
  }
});
