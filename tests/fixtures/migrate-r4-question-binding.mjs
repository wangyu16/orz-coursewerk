#!/usr/bin/env node
// Test fixture only (red team round 4, COHERENCE F5/F6): the answer-to-question binding now reads the visible text
// with every sign, arrow and operator kept, and key-term targets are namespaced by the map that defines them. A stamp
// written with the old key is upgraded where the text is unchanged under both keys, and otherwise owes one re-check
// (dependencies.mjs legacyQuestionCurrent). The frozen C2 fixture is upgraded the way an agent upgrades a package: a
// session begins (every unit record is written migrated), then each owed re-check is run — a blind re-read of the unit
// with its question and what moved, REPLAYED here as "no concerns" (a test double, NOT a finding about the course) —
// and recorded with `units.mjs reverify`. Prints what the migration cost. Run once.
//     node tests/fixtures/migrate-r4-question-binding.mjs [package-root]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../../scripts/lib/core/package_reader.mjs";
import { coreObligations, reverifyUnits } from "../../scripts/lib/core/obligations.mjs";
import { beginSession, indexUnits } from "../../scripts/lib/core/units_index.mjs";
import { replayVerifier } from "../../scripts/lib/verify/dispatch.mjs";
import { verifyKnowledge } from "../../scripts/lib/verify/verdicts.mjs";

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(path.dirname(fileURLToPath(import.meta.url)), "c2-chemistry-v2", "package");
const AGENT = { role: "agent", name: "executor", model: "fixture-migration" };
const owed = () => coreObligations(root, liveReader(root), "migrate").filter((f) => f.kind === "reverify");
const before = owed();
// the session begin writes every unit record migrated; nothing is edited, so the session closes with an index run
beginSession(root, liveReader(root), AGENT, { step: "r4 stamp migration" });
indexUnits(root, liveReader(root), { as: "agent", party: AGENT });
const owing = [...new Set(owed().flatMap((f) => f.units))];
const targets = {};
for (const f of owed()) for (const t of (f.evidence.what.match(/: (.*) since it was last verified/)?.[1] || "").split(", ")) { const k = t.replace(/:.*/, ""); targets[k] = (targets[k] || 0) + 1; }
if (owing.length) {
  await verifyKnowledge(root, liveReader(root), { verifier: replayVerifier((pr) => ({ nonce: pr.match(/"nonce": "([0-9a-f]+)"/)[1], concerns: [] })), only: owing });
  reverifyUnits(root, liveReader(root), owing, AGENT);
}
console.log(JSON.stringify({ owedBefore: before.length, rechecked: owing.length, byTargetKind: targets, owedAfter: owed().length }));
