import test from "node:test";
import assert from "node:assert/strict";
import { ALL_RIGHTS_RESERVED, isCarrierPath, isOpenLicense, normalizeLicense, repoForPath } from "../scripts/lib/contract.mjs";
import { compatibleOutputLicenses } from "../scripts/lib/assurance.mjs";

test("Alembic path mirror is fail-closed and preserves public/private routing", () => {
  assert.deepEqual(repoForPath("study-guide/ch.md"), { repo: "public" });
  assert.deepEqual(repoForPath("private/exams/midterm.md"), { repo: "private" });
  assert.match(repoForPath("paged/handout.md").error, /not a recognized package folder/);
  assert.match(repoForPath("../secret.md").error, /path traversal/);
  assert.equal(isCarrierPath("slides/ch.slides.html"), true);
});

test("output license normalization does not conflate public domain with CC0", () => {
  assert.equal(normalizeLicense("public domain"), null);
  assert.equal(normalizeLicense("CC0 1.0"), "CC0-1.0");
  assert.equal(isOpenLicense("CC-BY-4.0"), true);
  assert.equal(isOpenLicense(ALL_RIGHTS_RESERVED), false);
});

test("adapted-source compatibility is explicit", () => {
  assert.deepEqual(compatibleOutputLicenses("CC-BY-SA-4.0"), ["CC-BY-SA-4.0"]);
  assert.ok(compatibleOutputLicenses("CC-BY-4.0").includes("CC-BY-SA-4.0"));
  assert.ok(compatibleOutputLicenses("CC0-1.0").includes("CC-BY-NC-SA-4.0"));
});
