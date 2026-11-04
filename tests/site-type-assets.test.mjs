// Site type assets (req.sitetype.assets; family SITE-TYPE-CONTRACT draft 12): `assets` names where a page's assets
// live (formerly `figures`); the places are unchanged and the definition never names file kinds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const def = JSON.parse(readFileSync(new URL("../site-type/site-type.json", import.meta.url), "utf8"));

test("the definition names its asset places as `assets`, not `figures`", () => {
  assert.deepEqual(def.assets, { public: "assets/{doc}", private: "private/instructor/figures/{doc}" });
  assert.equal("figures" in def, false);
});

test("the definition does not list asset kinds (they are Alembic's)", () => {
  for (const k of ["media", "kinds", "assetKinds"]) assert.equal(k in def, false);
});
