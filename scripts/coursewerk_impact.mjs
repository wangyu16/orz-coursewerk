#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { computeCoursewerkImpact } from "./lib/system_index.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const root = path.resolve(opt("--root", process.cwd()));
const baseRef = opt("--base", "main");
const out = path.resolve(opt("--json", ".coursewerk/coursewerk-impact.json"));
const plan = computeCoursewerkImpact(root, { baseRef });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(plan, null, 2) + "\n");
console.log(JSON.stringify({ planId: plan.planId, baseRef, baseTip: plan.baseTip, mergeBase: plan.mergeBase, branchBehindTarget: plan.branchBehindTarget, changed: plan.changed.length, requiredReview: plan.requiredReview.length, impactedClaims: plan.impactedClaims.length, requiredTests: plan.requiredTests, out }, null, 2));
