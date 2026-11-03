import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestChapters, manifestUnits } from "../scripts/lib/core/package_reader.mjs";
import { deliverablesOf } from "../scripts/lib/core/units_index.mjs";

const reader = (files) => ({ text: (rel) => (rel in files ? files[rel] : null) });
const units = [{ slug: "gases", title: "Gases" }, { slug: "atoms", title: "Atoms" }];

test("[req.host.alembic-units] units are read from `units` (Alembic since 2026-11-02) or `chapters` (older), the same way", () => {
  assert.deepEqual(manifestUnits({ units }), units);
  assert.deepEqual(manifestUnits({ chapters: units }), units);
  assert.deepEqual(manifestUnits({ units, chapters: [{ slug: "old" }] }), units); // the new name wins
  assert.deepEqual(manifestUnits(null), []);
  assert.deepEqual(manifestChapters(reader({ "alembic.json": JSON.stringify({ units }) })), ["gases", "atoms"]);
  assert.deepEqual(manifestChapters(reader({ "alembic.json": JSON.stringify({ chapters: units }) })), ["gases", "atoms"]);
});

test("[req.host.alembic-units] a course whose manifest says `units` keeps its deliverables (none would be found before, and every unit retired)", () => {
  const files = { "alembic.json": JSON.stringify({ units: [{ slug: "gases", title: "Gases" }] }), "study-guide/gases.md": "# Gases\n" };
  assert.ok(deliverablesOf(reader(files)).includes("study-guide/gases.md"));
});
