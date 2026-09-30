// The module registry — which modules this package runs, at which version and maturity (skeleton §5, §6).
import fs from "node:fs";
import path from "node:path";
import { RECORD_PATHS, readRegularFile, recordFile } from "./paths.mjs";

export const MATURITY = Object.freeze(["stable", "trial", "experimental"]);

export function validateRegistry(registry) {
  const failures = [];
  if (registry?.schemaVersion !== 1) failures.push("module registry requires schemaVersion 1");
  if (!Array.isArray(registry?.modules)) return [...failures, "module registry requires a modules list"];
  const names = new Set();
  for (const m of registry.modules) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(m?.name || "")) failures.push(`module name must be a lowercase slug: ${m?.name}`);
    if (m?.name === "skeleton") failures.push('the module name "skeleton" is reserved');
    if (names.has(m?.name)) failures.push(`duplicate module ${m.name}`);
    names.add(m?.name);
    if (!/^\d+\.\d+\.\d+$/.test(m?.version || "")) failures.push(`${m?.name}: version must be semver`);
    if (!MATURITY.includes(m?.maturity)) failures.push(`${m?.name}: maturity must be stable, trial or experimental`);
    if (typeof m?.enabled !== "boolean") failures.push(`${m?.name}: enabled must be true or false`);
  }
  return failures;
}


/** The package's registry; an absent file is the empty registry. Throws on a non-regular, oversized or non-JSON file. */
export function readRegistry(root) {
  const text = readRegularFile(recordFile(root, RECORD_PATHS.registry), 1024 * 1024);
  if (text === null) return { schemaVersion: 1, modules: [] };
  try { return JSON.parse(text); } catch (e) { throw new Error(`coursewerk.modules.json is not valid JSON (${e.message})`); }
}

export function writeRegistry(root, registry) {
  const failures = validateRegistry(registry);
  if (failures.length) throw new Error(`refusing invalid module registry: ${failures.join("; ")}`);
  const file = recordFile(root, RECORD_PATHS.registry);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(registry, null, 2) + "\n");
}
