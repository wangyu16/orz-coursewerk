// The module registry — which modules this package runs, at which version and maturity (skeleton §5, §6).
export const MATURITY = Object.freeze(["stable", "trial", "experimental"]);

export function validateRegistry(registry) {
  const failures = [];
  if (registry?.schemaVersion !== 1) failures.push("module registry requires schemaVersion 1");
  if (!Array.isArray(registry?.modules)) return [...failures, "module registry requires a modules list"];
  const names = new Set();
  for (const m of registry.modules) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(m?.name || "")) failures.push(`module name must be a lowercase slug: ${m?.name}`);
    if (names.has(m?.name)) failures.push(`duplicate module ${m.name}`);
    names.add(m?.name);
    if (!/^\d+\.\d+\.\d+$/.test(m?.version || "")) failures.push(`${m?.name}: version must be semver`);
    if (!MATURITY.includes(m?.maturity)) failures.push(`${m?.name}: maturity must be stable, trial or experimental`);
    if (typeof m?.enabled !== "boolean") failures.push(`${m?.name}: enabled must be true or false`);
  }
  return failures;
}
