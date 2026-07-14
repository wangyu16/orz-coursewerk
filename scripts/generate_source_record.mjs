#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { writeSourceRecord } from "./lib/source_record.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const root = path.resolve(opt("--root", "package"));
const inputs = path.resolve(opt("--inputs", "inputs"));
const manifestFile = path.join(inputs, "SOURCE_CORPUS.json");
if (!fs.existsSync(manifestFile)) { console.error("generate-source-record: inputs/SOURCE_CORPUS.json is required"); process.exit(2); }
const file = writeSourceRecord(root, JSON.parse(fs.readFileSync(manifestFile, "utf8")));
console.log(JSON.stringify({ file }, null, 2));
