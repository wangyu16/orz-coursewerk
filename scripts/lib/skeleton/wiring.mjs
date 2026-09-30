// The wiring report (D22 tier T2): from real runs, which modules ran where, which finding kinds were produced and how
// they were routed — and what is registered or declared but never produced or never run. A mechanism that exists but
// never runs (the W1 lesson) shows up here as a gap, not as a green test.
export function buildWiringReport(runs, { modules = [], registry = { modules: [] } } = {}) {
  const ran = new Set(), produced = new Map(), routes = {};
  for (const run of runs) {
    for (const r of run.wiring.ran) if (r.ok) ran.add(r.name);
    for (const [key, n] of Object.entries(run.wiring.produced)) produced.set(key, (produced.get(key) || 0) + n);
    for (const f of run.findings) routes[f.route] = (routes[f.route] || 0) + 1;
  }
  const declared = modules.flatMap((m) => m.manifest.emits.map((e) => `${m.manifest.name}/${e.kind}`));
  const enabled = (registry.modules || []).filter((e) => e.enabled).map((e) => e.name);
  const writes = runs.flatMap((r) => r.wiring.discarded.filter((d) => d.reason === "wrote to the package").map((d) => d.name));
  return {
    checkpoints: runs.map((r) => r.wiring.checkpoint),
    modulesRan: [...ran].sort(),
    registeredNeverRan: enabled.filter((n) => !ran.has(n)).sort(),
    kindsProduced: Object.fromEntries([...produced].sort()),
    kindsDeclaredNeverProduced: declared.filter((k) => !produced.has(k)).sort(),
    findingsByRoute: routes,
    moduleWrites: writes,
    gaps: enabled.filter((n) => !ran.has(n)).length + declared.filter((k) => !produced.has(k)).length + writes.length,
  };
}
