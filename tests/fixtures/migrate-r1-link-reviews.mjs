#!/usr/bin/env node
// Test fixture only (D41, D42): coverage now counts reviewed links, and framing is read for off-plan content, so the
// frozen C2 fixture gets current alignment reviews — REPLAYED here as "teaches" for each declared link and "not off the
// plan" for framing. These are a test double, NOT findings about the course (the live review of the real course found
// 22 wrong links: studies/p11/REPORT-tranche2-control.md). Run once.  node tests/fixtures/migrate-r1-link-reviews.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../../scripts/lib/core/package_reader.mjs";
import { replayVerifier } from "../../scripts/lib/verify/dispatch.mjs";
import { reviewAlignment } from "../../scripts/lib/verify/alignment.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "c2-chemistry-v2", "package");
const verifier = replayVerifier((pr) => {
  const declared = (pr.split("\nDECLARED ITEMS\n")[1] || "").split("\n\n")[0].split("\n").map((l) => l.replace(/^- /, "")).filter((l) => /\./.test(l));
  const ids = [...pr.matchAll(/"id": "([^"]+)", "type"/g)].map((m) => m[1]);
  const fidelity = /assessment guide entr/.test(pr) ? (ids.length ? ids.map((id) => ({ id, type: "matches", level: "matches", why: "" })) : { type: "matches", level: "matches", why: "" }) : undefined;
  return { nonce: pr.match(/"nonce": "([0-9a-f]+)"/)[1], links: declared.map((id) => ({ id, verdict: "yes", why: "fixture replay" })), also: [], offPlan: false, ...(fidelity ? { fidelity } : {}) };
});
const r = await reviewAlignment(root, liveReader(root), { verifier });
console.log(JSON.stringify({ reviewed: r.length, unscorable: r.filter((x) => x.status !== "reviewed").map((x) => [x.unit, x.status, x.unanswered]) }).slice(0, 800));
