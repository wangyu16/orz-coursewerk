#!/usr/bin/env node
import path from "node:path";
import { verifyCoursewerkRevision } from "./lib/system_index.mjs";

const root = path.resolve(process.cwd());
const args = process.argv.slice(2);
const i = args.indexOf("--base");
const baseRef = i >= 0 ? args[i + 1] : "main";
const result = verifyCoursewerkRevision(root, { baseRef, requireReview: args.includes("--require-review") });
console.log(JSON.stringify({ ready: result.failures.length === 0, failures: result.failures, components: result.index.expected.components.length, claims: result.index.expected.claims.length, planId: result.impact.planId, changed: result.impact.changed.length }, null, 2));
process.exit(result.failures.length ? 1 : 0);
