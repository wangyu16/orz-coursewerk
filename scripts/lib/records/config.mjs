// coursewerk.json — the package's own settings for the redesign. `spine: 2` opts a package into spine v2 (anchors,
// parsed assessment guides, approvals); a package without it is a legacy (v0.12) package and keeps working as before.
import fs from "node:fs";
import { readRegularFile, recordFile } from "./paths.mjs";

export const CONFIG_PATH = "coursewerk.json";

export function readConfig(root) {
  const text = readRegularFile(recordFile(root, CONFIG_PATH), 64 * 1024);
  if (text === null) return { schemaVersion: 1, spine: 1 };
  const c = JSON.parse(text);
  if (c.schemaVersion !== 1 || ![1, 2].includes(c.spine)) throw new Error("coursewerk.json requires schemaVersion 1 and spine 1 or 2");
  return c;
}

export function writeConfig(root, config) {
  if (config.schemaVersion !== 1 || ![1, 2].includes(config.spine)) throw new Error("coursewerk.json requires schemaVersion 1 and spine 1 or 2");
  fs.writeFileSync(recordFile(root, CONFIG_PATH), JSON.stringify(config, null, 2) + "\n");
}
