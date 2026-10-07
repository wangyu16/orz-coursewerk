#!/usr/bin/env node
// Test fixture only (red team round 3, CONFIDENCE R3-K04): the absolute words are no longer a closed list — "each",
// "any", "invariably", "without exception", "regardless of" … now owe a context review (D30), and a quotation is
// exempt only as a quoted misconception. The frozen C2 fixture's absolute reviews covered the old sentence sets, so the
// fixture is upgraded the way an agent upgrades a package: the context review is run again for every unit whose
// absolute sentences changed, REPLAYED here — each sentence an earlier logged review classified keeps that review's
// class (and its scope words, reason and suggestion); each sentence no review has read is answered "casual". These are
// a test double, NOT findings about the course. Run once.
//     node tests/fixtures/migrate-r3-absolute-reviews.mjs [package-root]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../../scripts/lib/core/package_reader.mjs";
import { replayVerifier } from "../../scripts/lib/verify/dispatch.mjs";
import { reviewAbsolutes } from "../../scripts/lib/verify/verdicts.mjs";
import { absoluteReviewOf } from "../../scripts/lib/verify/absolutes.mjs";
import { readLogText } from "../../scripts/lib/records/log.mjs";

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(path.dirname(fileURLToPath(import.meta.url)), "c2-chemistry-v2", "package");
const log = readLogText(root).split("\n").filter(Boolean).map((l) => JSON.parse(l));
const dir = path.join(root, "metadata", "verification");
// every sentence an earlier logged review read, with that review's verdict (the newest review of a sentence wins)
const prior = new Map();
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const a = absoluteReviewOf(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), log);
  const seq = a && log.find((l) => l.type === "dispatch" && l.payload?.dispatch === f.replace(/\.json$/, ""))?.seq;
  if (a?.review.ok) for (const r of a.review.results) { const k = `${a.unit}|${r.sentence}`; if (!prior.has(k) || prior.get(k).seq < seq) prior.set(k, { ...r, seq }); }
}
let unit = null;
const verifier = replayVerifier((pr) => {
  const lines = pr.split("\n"), a = lines.indexOf("SENTENCES"), b = lines.indexOf("CONTEXT");
  const sentences = lines.slice(a + 1, b).filter((l) => /^\d+\. /.test(l)).map((l) => l.replace(/^\d+\. /, ""));
  return { nonce: pr.match(/"nonce": "([0-9a-f]+)"/)[1], sentences: sentences.map((s, i) => {
    const was = prior.get(`${unit}|${s}`);
    return was ? { n: i + 1, class: was.class, context: was.context || undefined, why: was.why, suggestion: was.suggestion } : { n: i + 1, class: "casual", why: "fixture replay" };
  }) };
});
const results = [];
// one unit at a time, so the replay knows whose earlier verdicts to reuse
const { loadUnits, reviewedAbsolutes } = await import("../../scripts/lib/core/obligations.mjs");
const { absoluteSentences, absolutesHash } = await import("../../scripts/lib/verify/absolutes.mjs");
const done = reviewedAbsolutes(root);
// only a unit that owed no review under the round-2 rule (its old sentence set empty, or reviewed as the log binds it)
// is upgraded; a unit that owed its review before still owes it — the fixture's open obligations stay as they were
const { sha256, canonicalJson } = await import("../../scripts/lib/records/canonical.mjs");
const { clean, exclusivityOf, sentencesOf } = await import("../../scripts/lib/verify/claims.mjs");
const OLD = /\b(?:only|solely|exclusively|alone|always|never|every|all|none|nothing|nobody)\b/i;
const oldSentences = (text) => sentencesOf(text).filter((s) => {
  const plain = clean(s).replace(/"[^"]*"|“[^”]*”/g, " ").replace(/(?<=[A-Za-z])[*_]+(?=[A-Za-z])/g, "").replace(/\bnot\s+only\b/gi, " ").replace(/\bonly\s+(?:\*+)?(?:partially|partial|in part)\b/gi, " ").replace(/\$[^$]*\$/g, " ");
  if (!OLD.test(plain)) return false;
  const ex = exclusivityOf(s);
  return !(ex && !ex.open && !/\b(?:always|never|every|all|none|nothing|nobody|alone)\b/i.test(plain));
}).map((s) => s.trim().replace(/\s+/g, " "));
const coveredBefore = (u) => { const o = oldSentences(u.text); return !o.length || done.has(`${u.id}|${sha256(canonicalJson(o))}`); };
for (const u of loadUnits(root, liveReader(root)).filter((x) => absoluteSentences(x.text).length && !done.has(`${x.id}|${absolutesHash(x.text)}`) && coveredBefore(x))) {
  unit = u.id;
  results.push(...await reviewAbsolutes(root, liveReader(root), { verifier, only: [u.id] }));
}
console.log(JSON.stringify({ reviewed: results.length, classes: results.flatMap((r) => r.classes).reduce((m, c) => ((m[c] = (m[c] || 0) + 1), m), {}), unscorable: results.filter((r) => r.status !== "reviewed").map((r) => r.unit) }));
