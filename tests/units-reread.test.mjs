// Found by the Chemistry of Macromolecules course: a segmenter fix re-read unchanged text into many new passages, and
// the index recorded them as edits of unknown origin. (1) Words nobody changed keep the author of the unit that held
// them. (2) The instructor, never the agent, can confirm that the agent wrote a passage of unknown origin.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { claimAuthorship, indexUnits, unchangedCovering } from "../scripts/lib/core/units_index.mjs";
import { unitHash } from "../scripts/lib/core/segment.mjs";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";

const agentOrigin = { kind: "agent-knowledge", model: "m", step: "authoring", date: "2026-10-21" };

test("[req.units.segmenter] a re-read passage inside an old unit's unchanged lines keeps that unit's author; an edit inside them does not", () => {
  const text = "# T\n\nIntro.\n\n{{mermaid\nflowchart TD\n  A --> B\n}}\n\nAfter the diagram.\n\nMore text.\n";
  const lines = text.split("\n");
  // the old (mis)reading: one figure unit from the diagram to the end of the file, written by the agent
  const swallowed = lines.slice(4).join("\n").trim();
  const old = [{ id: "u-old", locator: { lines: [5, lines.length], contentHash: unitHash(swallowed) }, origin: agentOrigin }];
  assert.equal(unchangedCovering(old, text, { startLine: 10, endLine: 10 })?.id, "u-old", "an unchanged paragraph inside it keeps its author");
  assert.equal(unchangedCovering(old, text, { startLine: 3, endLine: 3 }), null, "a passage outside its lines does not");
  const edited = text.replace("After the diagram.", "After the diagram, an edit nobody recorded.");
  assert.equal(unchangedCovering(old, edited, { startLine: 10, endLine: 10 }), null, "an edit inside its lines: no inheritance");
});

test("[req.units.segmenter] the instructor can confirm that the agent wrote a passage of unknown origin; the agent cannot", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cw-claim-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const w = (rel, s) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), s); };
  w("alembic.json", JSON.stringify({ schemaVersion: 2, packageId: "pending", title: "T", license: "CC-BY-4.0", createdAt: "2026-10-21T00:00:00Z", chapters: [{ slug: "ch", title: "Ch" }] }));
  w("metadata/coursewerk.json", JSON.stringify({ schemaVersion: 1, spine: 2 }));
  w("study-guide/ch.md", "# Ch\n\nA paragraph written outside any session.\n");
  indexUnits(root, liveReader(root));
  const side = () => JSON.parse(fs.readFileSync(path.join(root, "metadata/units/study-guide/ch.md.json"), "utf8"));
  const ids = side().units.filter((u) => u.origin.kind === "unknown").map((u) => u.id);
  assert.ok(ids.length > 0);
  assert.throws(() => claimAuthorship(root, { units: ids, as: "agent:claude-opus-5-5", instructorWords: "x" }, { role: "agent", name: "a", model: "m" }), /confirmed by the instructor/);
  claimAuthorship(root, { units: ids, as: "agent:claude-opus-5-5", instructorWords: "You wrote these for me." }, { role: "instructor", name: "Yu Wang (wangyu16)" });
  for (const u of side().units.filter((x) => ids.includes(x.id))) {
    assert.equal(u.origin.kind, "agent-knowledge"); assert.equal(u.origin.model, "claude-opus-5-5"); assert.equal(u.origin.confirmedBy, "Yu Wang (wangyu16)");
  }
  assert.throws(() => claimAuthorship(root, { units: ids, as: "instructor", instructorWords: "mine" }, { role: "instructor", name: "Yu Wang (wangyu16)" }), /not of unknown authorship/, "a confirmed origin is not reassigned");
});
