#!/usr/bin/env node
// Test fixture only (red team round 2): a link or framing review is now bound to the plan items it judged and to the
// unit's wording (round 2, F11), and guide Counts count only questions a current review verified (D41 for the guide,
// C5-08). The frozen C2 fixture's reviews, recorded under the round-1 basis, still count until a plan item changes;
// so the fixture is upgraded the way an agent upgrades a package: its alignment reviews are run again, REPLAYED here
// as "teaches" for each declared link, "matches" for each guide entry and "not off the plan" for framing. These are a
// test double, NOT findings about the course (the live review of the real course found 22 wrong links:
// studies/p11/REPORT-tranche2-control.md). Run once.  node tests/fixtures/migrate-r2-link-reviews.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../../scripts/lib/core/package_reader.mjs";
import { replayVerifier } from "../../scripts/lib/verify/dispatch.mjs";
import { reviewAlignment } from "../../scripts/lib/verify/alignment.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "c2-chemistry-v2", "package");
const verifier = replayVerifier((pr) => {
  const declared = (pr.split("\nDECLARED ITEMS\n")[1] || "").split("\n\n")[0].split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
  const gids = [...pr.matchAll(/^- (guide\.\S+): /gm)].map((m) => m[1]);
  const one = /its assessment guide entry asks for/.test(pr);
  const fid = { type: "matches", level: "matches", why: "fixture replay" };
  return { nonce: pr.match(/"nonce": "([0-9a-f]+)"/)[1], links: declared.map((id) => ({ id, verdict: "yes", why: "fixture replay" })), also: [], offPlan: false,
    ...(one ? { fidelity: fid } : gids.length ? { fidelity: gids.map((id) => ({ id, ...fid })) } : {}) };
});
const r = await reviewAlignment(root, liveReader(root), { verifier });
console.log(JSON.stringify({ reviewed: r.length, notReviewed: r.filter((x) => x.status !== "reviewed").map((x) => [x.unit, x.status, x.unanswered]) }).slice(0, 800));
