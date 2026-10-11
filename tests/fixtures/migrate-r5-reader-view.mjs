#!/usr/bin/env node
// Test fixture only (red team round 5, cause 1 — one reader view for every binding): the answer-to-question and
// reference bindings are now the light key of the reader view ("q3:"), link and framing reviews are current on the
// reader view's meaning key, and absolute reviews on each sentence's meaning key. Records keyed on the earlier
// normalisations migrate the way an agent migrates a package: a session begins (every unit record is written with its
// stamps migrated — a "q2:" binding is upgraded where the text is unchanged under both keys), and each re-check that
// is then owed is run — a blind re-read REPLAYED here as "no concerns" (a test double, NOT a finding about the course)
// and recorded with `units.mjs reverify`. Link and absolute reviews migrate on read (their records carry the text they
// were shown), so they need no write. Prints what the migration cost. Run once.
//     node tests/fixtures/migrate-r5-reader-view.mjs [package-root]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../../scripts/lib/core/package_reader.mjs";
import { coreObligations, loadUnits, reverifyUnits } from "../../scripts/lib/core/obligations.mjs";
import { beginSession, indexUnits } from "../../scripts/lib/core/units_index.mjs";
import { replayVerifier } from "../../scripts/lib/verify/dispatch.mjs";
import { verifyKnowledge } from "../../scripts/lib/verify/verdicts.mjs";
import { currentReviewsAt } from "../../scripts/lib/verify/alignment.mjs";

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(path.dirname(fileURLToPath(import.meta.url)), "c2-chemistry-v2", "package");
const AGENT = { role: "agent", name: "executor", model: "fixture-migration" };
const owed = () => coreObligations(root, liveReader(root), "migrate");
const count = (fs_) => Object.fromEntries([...new Set(fs_.map((f) => f.kind))].map((k) => [k, new Set(fs_.filter((f) => f.kind === k).flatMap((f) => f.units.length ? f.units : ["(none)"])).size]));
const bindings = () => {
  const out = { q3: 0, q2: 0, legacy: 0, unitReader: 0, unitSource: 0 };
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith(".json")) for (const u of JSON.parse(fs.readFileSync(p, "utf8")).units || []) for (const [k, h] of Object.entries(u.stamp || {})) if (/^(question|ref):/.test(k)) out[String(h).startsWith("q3:") ? "q3" : String(h).startsWith("q2:") ? "q2" : "legacy"]++; else if (k.startsWith("unit:")) out[String(h).startsWith("v:") ? "unitReader" : "unitSource"]++; } };
  walk(path.join(root, "metadata/units"));
  return out;
};
const reviewed = () => currentReviewsAt(root, liveReader(root), loadUnits(root, liveReader(root))).size;
const before = { owed: count(owed()), bindings: bindings(), unitsWithCurrentLinkReview: reviewed() };
// the session begin writes every unit record migrated; nothing is edited, so the session closes with an index run
beginSession(root, liveReader(root), AGENT, { step: "r5 reader-view migration" });
indexUnits(root, liveReader(root), { as: "agent", party: AGENT });
const owing = [...new Set(owed().filter((f) => f.kind === "reverify").flatMap((f) => f.units))];
if (owing.length) {
  await verifyKnowledge(root, liveReader(root), { verifier: replayVerifier((pr) => ({ nonce: pr.match(/"nonce": "([0-9a-f]+)"/)[1], concerns: [] })), only: owing });
  reverifyUnits(root, liveReader(root), owing, AGENT);
}
console.log(JSON.stringify({ before, rechecked: owing.length, after: { owed: count(owed()), bindings: bindings(), unitsWithCurrentLinkReview: reviewed() } }));
