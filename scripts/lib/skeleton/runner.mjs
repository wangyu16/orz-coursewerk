// The module runner (skeleton §6; D13, D14, D19). For one checkpoint it runs every enabled module that declares
// that checkpoint and the package's profile, and turns what each returns into findings.
//
// ISOLATION (rounds P2-1, P2-2). Each module runs in child processes (module_host.mjs): one for run(), a fresh one
// for recheck(), each in its own process group that is killed (SIGKILL) when it exits or times out, each with its own
// copy of the serialized snapshot. Modules load only from the harness's module directory, by validated name — never
// from the package. The package tree (files, symlinks, git config, hooks, info, HEAD and refs) is hashed around each
// module's processes, and once more around the whole checkpoint, so a late write is caught even if it cannot be
// attributed.
//
// THREAT MODEL. Modules are harness code, reviewed and shipped with the harness; the package and its registry are
// untrusted. The runner protects against buggy modules and against package-controlled paths. It is not an OS
// sandbox: a deliberately hostile module can forge its own output, write outside the package, or escape through a
// detached grandchild in a new process group, or pass state from run() to recheck() through files outside the
// package. Those need an OS sandbox and are documented limits. The process-group kill is POSIX (Linux, macOS); on
// Windows a module's children are not killed with it. A `.git` file (linked worktree) is watched as a file only.
//
// What the runner — not the module — decides:
//   * class and route come from the manifest declaration for the reported kind (the manifest copy returned by the
//     child, validated here); an undeclared kind is not admitted;
//   * ADMISSION (S1): a defect is kept only if the module's recheck re-ran its evidence on the same snapshot and
//     returned exactly true; otherwise it becomes a question;
//   * MATURITY: effective maturity is the registry's, but never above the manifest's unless a verified, instructor-
//     made promotion record citing its bar is in the log; trial findings are delivered as questions and never
//     interrupt; experimental modules run only when enabled;
//   * NO WRITES: a module that changed the tree has its findings discarded and the skeleton raises a defect naming it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { makeFinding } from "../records/findings.mjs";
import { validateRegistry } from "../records/registry.mjs";
import { honouredDisables, honouredPromotions } from "./promotion.mjs";
import { standardRegistry } from "../records/registry.mjs";
import { validateManifest } from "./manifest.mjs";
import { createSnapshot, treeId } from "./snapshot.mjs";

export const SKELETON = "skeleton";
const RANK = { experimental: 0, trial: 1, stable: 2 };
const HOST = path.join(path.dirname(fileURLToPath(import.meta.url)), "module_host.mjs");
export const DEFAULT_MODULE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "modules");
const MODULE_TIMEOUT_MS = 120000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

function skeletonFinding(basis, kind, statusClass, evidence, units = []) {
  return makeFinding({ module: SKELETON, kind, units, statusClass, route: "agent", evidence, basis, recommendation: null });
}

/** Resolve a module name to a file inside the module directory, or null. */
export function moduleFile(name, moduleDir = DEFAULT_MODULE_DIR) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(name || "")) || name === SKELETON) return null;
  const dir = path.resolve(moduleDir), file = path.resolve(dir, `${name}.mjs`);
  return file.startsWith(dir + path.sep) && fs.existsSync(file) ? file : null;
}

function errorLine(res) {
  if (res.error?.code === "ENOBUFS") return "the module wrote more than 1 MB to stderr";
  if (res.error?.code === "ETIMEDOUT" || res.signal === "SIGKILL") return "timed out";
  const lines = String(res.stderr || "").split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => /^(\w*Error|Error)\b/.test(l)) || lines[0] || res.error?.message || `exit ${res.status}`;
}

/** One host process in its own group; the group is killed when the host returns, so no child outlives it. */
function host(mode, file, dir, timeoutMs, draftsFile) {
  const out = path.join(dir, `${mode}-out.json`);
  const args = [HOST, mode, file, path.join(dir, "snapshot.json"), out, ...(draftsFile ? [draftsFile] : [])];
  const res = spawnSync(process.execPath, args, { encoding: "utf8", timeout: timeoutMs, killSignal: "SIGKILL", detached: true, stdio: ["ignore", "ignore", "pipe"], maxBuffer: 1024 * 1024 });
  if (res.pid) { try { process.kill(-res.pid, "SIGKILL"); } catch { /* group already gone */ } }
  if (res.status !== 0 || !fs.existsSync(out)) return { error: errorLine(res) };
  if (fs.statSync(out).size > MAX_OUTPUT_BYTES) return { error: `output larger than ${MAX_OUTPUT_BYTES} bytes` };
  try { return { value: JSON.parse(fs.readFileSync(out, "utf8")) }; } catch (e) { return { error: `unreadable module output: ${e.message}` }; }
}

/** run() then, in a fresh process, recheck() for each draft of a defect kind. */
function hostRun(file, snapshotText, timeoutMs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-module-"));
  try {
    fs.writeFileSync(path.join(dir, "snapshot.json"), snapshotText);
    const r = host("run", file, dir, timeoutMs);
    if (r.error) return { error: r.error };
    const out = r.value || {};
    const defectKinds = new Set((out.manifest?.emits || []).filter((e) => e?.statusClass === "defect").map((e) => e.kind));
    const drafts = Array.isArray(out.drafts) ? out.drafts : [];
    const toCheck = drafts.map((d, i) => [d, i]).filter(([d]) => d && defectKinds.has(d.kind));
    for (const d of drafts) if (d && typeof d === "object") delete d.__recheckOk;
    if (toCheck.length && out.hasRecheck) {
      fs.writeFileSync(path.join(dir, "snapshot.json"), snapshotText); // a fresh copy for the recheck process
      const draftsFile = path.join(dir, "drafts.json");
      fs.writeFileSync(draftsFile, JSON.stringify(toCheck.map(([d]) => d)));
      const v = host("recheck", file, dir, timeoutMs, draftsFile);
      if (!v.error && Array.isArray(v.value)) toCheck.forEach(([d], j) => { d.__recheckOk = v.value[j] === true; });
    }
    return out;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/**
 * @param {object} o
 * @param {string} o.root        package root
 * @param {string} o.checkpoint  V0–V8
 * @param {"public"|"private"} o.profile
 * @param {object} o.registry    the package's module registry
 * @param {string} [o.moduleDir] where module files live (the harness's scripts/modules by default)
 */
export function runCheckpoint({ root, checkpoint, profile, registry = { schemaVersion: 1, modules: [], __noStandard: true }, moduleDir = DEFAULT_MODULE_DIR, timeoutMs = MODULE_TIMEOUT_MS, inputsDir = null }) {
  const snapshot = createSnapshot(root, { profile, checkpoint, inputsDir });
  const findings = [];
  const wiring = { checkpoint, profile, basis: snapshot.id, ran: [], skipped: [], produced: {}, discarded: [], manifests: {} };
  const registryProblems = registry?.__readError ? [registry.__readError] : validateRegistry(registry);
  if (registryProblems.length || (registry.modules || []).some((m) => m.name === SKELETON)) {
    findings.push(skeletonFinding(snapshot.id, "registry-invalid", "obligation", { type: "missing", what: `a valid module registry: ${registryProblems[0] || 'the name "skeleton" is reserved'}` }));
    return { snapshot, findings, wiring };
  }
  const promoted = honouredPromotions(root);
  // A package may not quietly drop a standard module: a standard module missing from the registry, or disabled, needs the
  // instructor's logged module-change "disable" decision; otherwise it is a skeleton defect and the module runs anyway.
  if (moduleDir === DEFAULT_MODULE_DIR && !registry.standard && !registry.__noStandard) {
    const disabled = honouredDisables(root);
    const entries = new Map((registry.modules || []).map((m) => [m.name, m]));
    for (const std of standardRegistry().modules) {
      const e = entries.get(std.name);
      if (e && e.enabled) continue;
      if (disabled.has(std.name)) continue;
      // a trial standard module only raises questions: one a package's registry predates is added, not "dropped"
      if (!e && std.maturity !== "stable") { registry = { ...registry, modules: [...(registry.modules || []), std] }; continue; }
      findings.push(skeletonFinding(snapshot.id, "standard-module-dropped", "defect", { type: "rule", rule: "a standard module is disabled only by the instructor's logged decision", module: std.name }));
      registry = { ...registry, modules: [...(registry.modules || []).filter((m) => m.name !== std.name), std] };
    }
  }
  const snapshotText = JSON.stringify({ id: snapshot.id, profile, checkpoint, paths: snapshot.paths, files: snapshot.files });
  // lastTree = the tree as the previous module left it; a change between modules is unattributed, never blamed on
  // the next module.
  let lastTree = treeId(root), unattributed = false;
  const noteUnattributed = () => { if (!unattributed) { unattributed = true;
    findings.push(skeletonFinding(snapshot.id, "package-changed-during-run", "defect", { type: "rule", rule: "the package does not change while the checkpoint runs", note: "writer unknown" })); } };
  try {
    for (const entry of registry.modules) {
      if (!entry.enabled) { wiring.skipped.push({ name: entry.name, reason: "disabled" }); continue; }
      const file = moduleFile(entry.name, moduleDir);
      if (!file) { findings.push(skeletonFinding(snapshot.id, "module-missing", "obligation", { type: "missing", what: `the registered module ${entry.name} is not installed in the harness` })); continue; }
      const before = treeId(root);
      if (before !== lastTree) noteUnattributed();
      const out = hostRun(file, snapshotText, timeoutMs);
      const after = treeId(root);
      const wrote = after !== before;
      lastTree = after;
      if (out.error && !wrote) {
        findings.push(skeletonFinding(snapshot.id, "module-failed", "obligation", { type: "missing", what: `a completed run of ${entry.name} at ${checkpoint} (${out.error})` }));
        wiring.ran.push({ name: entry.name, ok: false }); continue;
      }
      if (wrote) {
        findings.push(skeletonFinding(snapshot.id, "module-wrote-package", "defect", { type: "rule", rule: "modules only emit findings", module: entry.name }));
        wiring.discarded.push({ name: entry.name, reason: "wrote to the package" }); wiring.ran.push({ name: entry.name, ok: false }); continue;
      }
      const m = out.manifest;
      const problems = validateManifest(m);
      if (!problems.length && m.name !== entry.name) problems.push(`manifest name ${m.name} does not match the registry entry ${entry.name}`);
      if (!problems.length && m.emits.some((e) => e.statusClass === "defect") && !out.hasRecheck) problems.push(`${m.name}: a module that emits defects must provide recheck(draft, snapshot)`);
      if (problems.length) { findings.push(skeletonFinding(snapshot.id, "module-invalid", "obligation", { type: "missing", what: `a valid manifest for ${entry.name}: ${problems[0]}` })); continue; }
      wiring.manifests[m.name] = m;
      // Effective maturity; checkpoint/profile applicability from the validated manifest.
      let maturity = entry.maturity;
      if (RANK[entry.maturity] > RANK[m.maturity] && !promoted.has(`${m.name}:${entry.maturity}`)) {
        findings.push(skeletonFinding(snapshot.id, "unlogged-promotion", "defect", { type: "rule", rule: "a module is promoted only by a verified module-change record made by the instructor and citing its bar", module: m.name, registry: entry.maturity, manifest: m.maturity }));
        maturity = m.maturity;
      }
      if (!m.checkpoints.includes(checkpoint)) { wiring.skipped.push({ name: m.name, reason: "checkpoint" }); continue; }
      if (!m.profiles.includes(profile)) { wiring.skipped.push({ name: m.name, reason: "profile" }); continue; }
      if (entry.version !== m.version) findings.push(skeletonFinding(snapshot.id, "module-version-mismatch", "question", { type: "judgment", note: `registry pins ${m.name} ${entry.version}, installed ${m.version}` }));
      wiring.ran.push({ name: m.name, maturity, ok: true });
      const declared = new Map(m.emits.map((e) => [e.kind, e]));
      for (const d of Array.isArray(out.drafts) ? out.drafts : []) {
        const kind = d?.kind;
        const decl = declared.get(kind);
        if (!decl) { findings.push(skeletonFinding(snapshot.id, "undeclared-kind", "question", { type: "judgment", note: `${m.name} reported an undeclared kind: ${String(kind)}` })); continue; }
        let statusClass = decl.statusClass, evidence = d.evidence, admission = null;
        if (statusClass === "defect" && d.__recheckOk !== true) {
          statusClass = "question"; admission = "evidence did not re-run";
          evidence = { type: "judgment", note: "the reported evidence did not re-run", reported: d.evidence ?? null };
        }
        let trialClass = null;
        if (maturity !== "stable" && statusClass !== "question") {
          trialClass = statusClass; statusClass = "question";
          evidence = { type: "judgment", note: `trial module; declared ${trialClass}`, reported: evidence ?? null };
        }
        let route = decl.route;
        if (statusClass === "question" && route === "agent" && (trialClass || admission)) route = "digest";
        if (route === "interrupt" && (maturity !== "stable" || admission)) route = "digest"; // only a stable, admitted finding may interrupt
        try {
          findings.push(makeFinding({ module: m.name, kind, units: Array.isArray(d.units) ? d.units : [], statusClass, route, evidence, basis: snapshot.id,
            recommendation: d.recommendation ?? null, ...(route === "interrupt" ? { interruptReason: decl.interruptReason } : {}),
            ...(trialClass ? { trialClass } : {}), ...(admission ? { admission } : {}) }));
          wiring.produced[`${m.name}/${kind}`] = (wiring.produced[`${m.name}/${kind}`] || 0) + 1;
        } catch (e) {
          findings.push(skeletonFinding(snapshot.id, "finding-invalid", "question", { type: "judgment", note: `${m.name}/${kind}: ${e.message}` }));
        }
      }
    }
  } finally {
    if (treeId(root) !== lastTree) noteUnattributed();
  }
  return { snapshot, findings, wiring };
}
