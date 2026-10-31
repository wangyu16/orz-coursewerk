#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { renderAttribution } from "./lib/assurance.mjs";

const args = process.argv.slice(2);
const i = args.indexOf("--root");
const root = path.resolve(i >= 0 ? args[i + 1] : "package");
const provenanceFile = path.join(root, "private", "coursewerk", "PROVENANCE.json");
if (!fs.existsSync(provenanceFile)) { console.error("generate-attribution: private/coursewerk/PROVENANCE.json is missing"); process.exit(2); }
const provenance = JSON.parse(fs.readFileSync(provenanceFile, "utf8"));
const out = path.join(root, "provenance", "coursewerk", "ATTRIBUTION.md");
fs.writeFileSync(out, renderAttribution(provenance));
console.log(JSON.stringify({ out, items: (provenance.items || []).filter((item) => item.publicationStatus === "cleared").length }, null, 2));
