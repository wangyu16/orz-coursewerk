#!/usr/bin/env node
// One-time upgrade of the frozen C2 fixture to the R1 question binding (red-team round 1, F1): every answer whose
// stamp predates the binding owes one re-check. This is the agent's routed fix, done offline: a blind re-review of
// each answer with its question (replayed here as "no concerns"), then `units.mjs reverify`. Run once; kept so the
// step is visible and reproducible.  node tests/fixtures/migrate-r1-question-binding.mjs
// Then, as for any harness change to the dependency rules (term plurals and aliases, unitless shared values):
//   node scripts/units.mjs restamp --root tests/fixtures/c2-chemistry-v2/package --reason "red-team round 1 …"
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../../scripts/lib/core/package_reader.mjs";
import { coreObligations, reverifyUnits } from "../../scripts/lib/core/obligations.mjs";
import { replayVerifier } from "../../scripts/lib/verify/dispatch.mjs";
import { verifyKnowledge } from "../../scripts/lib/verify/verdicts.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "c2-chemistry-v2", "package");
const owing = [...new Set(coreObligations(root, liveReader(root), "migrate").filter((f) => f.kind === "reverify").flatMap((f) => f.units))];
await verifyKnowledge(root, liveReader(root), { verifier: replayVerifier((pr) => ({ nonce: pr.match(/"nonce": "([0-9a-f]+)"/)[1], concerns: [] })), only: owing });
const r = reverifyUnits(root, liveReader(root), owing, { role: "agent", name: "executor", model: "fixture-migration" });
console.log(JSON.stringify({ owed: owing.length, result: r }).slice(0, 400));
