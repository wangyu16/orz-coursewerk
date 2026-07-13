#!/usr/bin/env node
import path from "node:path";
import { computeCoursewerkIndex, writeCoursewerkIndex } from "./lib/system_index.mjs";

const root = path.resolve(process.cwd());
const index = computeCoursewerkIndex(root);
if (index.validationFailures.length) {
  console.error(index.validationFailures.join("\n"));
  process.exit(2);
}
const file = writeCoursewerkIndex(root, index);
console.log(JSON.stringify({ file, components: index.components.length, relationships: index.relationships.length, claims: index.claims.length, openFindings: index.knownFindings.filter((f) => f.status !== "resolved").length }, null, 2));
