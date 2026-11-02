#!/usr/bin/env node
// House notation (owner 2026-11-02): list the spots where a text writes math, chemistry or markup another way than the
// house notation (lib/core/house_notation.mjs). Light: never a defect; the gate shows one note per text (ms3-format).
//   node scripts/house_notation.mjs --root <package> [file …]     (default: every Markdown text in the course places)
import fs from "node:fs";
import path from "node:path";
import { houseNotationSpots } from "./lib/core/house_notation.mjs";

const args = process.argv.slice(2);
const i = args.indexOf("--root"), root = path.resolve(i >= 0 ? args[i + 1] : ".");
const named = args.filter((a, k) => !a.startsWith("--") && args[k - 1] !== "--root");
export const PLACES = ["concepts", "study-guide", "slides", "practice", "assessment-support"];
const files = named.length ? named : PLACES.flatMap((d) => (fs.existsSync(path.join(root, d)) ? fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith(".md")).map((f) => `${d}/${f}`) : [])).sort();
const out = files.map((f) => ({ file: f, spots: houseNotationSpots(fs.readFileSync(path.join(root, f), "utf8")) })).filter((x) => x.spots.length);
console.log(JSON.stringify({ texts: files.length, withSpots: out.length, spots: out.reduce((a, x) => a + x.spots.length, 0), files: out }, null, 2));
