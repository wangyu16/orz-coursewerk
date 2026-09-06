#!/usr/bin/env node
// Write the DECISION SHEET for the last gate run's review queue — the record `index:semantic` consumes.
//
// The queue is one item per human decision; this sheet is where the human writes the decision. Every
// `blocking` or `review` item gets a row (`info` items need no decision); the sheet carries the digest of
// the queue it answers, so a queue regenerated after further edits invalidates it. Fill `decision`
// (fixed | accepted | dismissed) and a `note` of at least 20 characters for each row, then:
//   npm run index:semantic -- --root package --review reports/queue-review.json
//
// Usage: node scripts/queue_review.mjs --root package --out reports/queue-review.json
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { REVIEW_QUEUE_PATH } from "./lib/escalation.mjs";

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const root = path.resolve(opt("--root", "package"));
const out = path.resolve(opt("--out", "reports/queue-review.json"));
const queueFile = path.join(root, REVIEW_QUEUE_PATH);
if (!fs.existsSync(queueFile)) { console.error(`queue-review: no ${REVIEW_QUEUE_PATH} — run the gate first (node scripts/check_oer.mjs --package ${path.relative(process.cwd(), root) || "."}).`); process.exit(2); }
const inside = path.relative(root, out);
if (inside === "" || (!inside.startsWith("..") && !path.isAbsolute(inside))) { console.error("queue-review: --out must be OUTSIDE the package; use reports/"); process.exit(2); }
const bytes = fs.readFileSync(queueFile);
let queue;
try { queue = JSON.parse(bytes.toString("utf8")); } catch (e) { console.error(`queue-review: ${REVIEW_QUEUE_PATH} is invalid JSON: ${e.message}`); process.exit(2); }
const pending = (queue.items ?? []).filter((it) => it.severity === "blocking" || it.severity === "review");
const sheet = {
  schemaVersion: 1,
  root,
  queueSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  basisSha256: queue.basisSha256 ?? null,
  decisions: pending.map((it) => ({
    id: it.id,
    kind: it.kind,
    severity: it.severity,
    headline: String(it.evidence?.[0] ?? "").slice(0, 200),
    decision: "",
    note: "",
  })),
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(sheet, null, 2) + "\n");
console.log(JSON.stringify({ action: "written", out, pending: pending.length, next: pending.length ? "Fill decision (fixed|accepted|dismissed) and note per row, then index:semantic --review <this file>." : "Nothing pending: index:semantic may accept the baseline." }, null, 2));
