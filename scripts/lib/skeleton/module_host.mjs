// Child-process host for one module run (skeleton §6; round P2-1). Each module runs in its own process: it gets a
// rebuilt read-only snapshot, and hands back plain JSON — its manifest, its drafts, and whether each defect draft's
// evidence re-ran. Nothing it does in memory (prototype changes, manifest edits, getters) can reach the runner or
// another module.
//   node module_host.mjs run     <module.mjs> <snapshot.json> <out.json>
//   node module_host.mjs recheck <module.mjs> <snapshot.json> <out.json> <drafts.json>
// run and recheck happen in separate processes, so nothing run() leaves behind can influence recheck().
// Honest limit: module code shares its own process with this host, so a deliberately hostile module can forge its own
// output; admission guards honest-but-buggy modules. Intrinsics used here are captured before the module loads.
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const stringify = JSON.stringify.bind(JSON), parse = JSON.parse.bind(JSON), isArray = Array.isArray, writeFile = fs.writeFileSync, hasOwn = Object.hasOwn;
const [mode, moduleFile, snapshotFile, outFile, draftsFile] = process.argv.slice(2);
const raw = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
const files = Object.create(null);
const bytes = Object.create(null);
for (const [rel, f] of Object.entries(raw.files)) { files[rel] = Object.freeze({ hash: f.hash, text: f.text }); if (f.b64) bytes[rel] = f.b64; }
import os from "node:os";
import path from "node:path";
let materialized = null;
/** A private, read-only-in-spirit copy of the snapshot on disk (package at <dir>/package, inputs at <dir>/inputs), for
 * modules that run proven file-based library code. Text and binary files are reproduced byte for byte (files over
 * 8 MB, the decision log over 64 MB, appear as empty placeholders). The copy lives in this host's own temp dir and is never the package. */
function materialize() {
  if (materialized) return materialized;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-materialized-"));
  for (const [rel, f] of Object.entries(files)) {
    const target = rel.startsWith("@inputs/") ? path.join(dir, "inputs", rel.slice(8)) : path.join(dir, "package", rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, f.text != null ? f.text : bytes[rel] ? Buffer.from(bytes[rel], "base64") : "");
  }
  fs.mkdirSync(path.join(dir, "package"), { recursive: true });
  materialized = { dir, package: path.join(dir, "package"), inputs: fs.existsSync(path.join(dir, "inputs")) ? path.join(dir, "inputs") : null };
  process.on("exit", () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  return materialized;
}
const snapshot = Object.freeze({
  materialize,
  id: raw.id, profile: raw.profile, checkpoint: raw.checkpoint, site: raw.site ?? null, files: Object.freeze(files), paths: Object.freeze([...raw.paths]),
  text: (rel) => (hasOwn(files, rel) ? files[rel].text : null),
  json: (rel) => { const t = hasOwn(files, rel) ? files[rel].text : null; try { return t == null ? null : JSON.parse(t); } catch { return undefined; } },
});

const mod = (await import(pathToFileURL(moduleFile).href)).default;
if (!mod || typeof mod !== "object") throw new Error("the module file must default-export { manifest, run, recheck? }");
if (mode === "run") {
  const manifest = parse(stringify(mod.manifest ?? null));
  if (typeof mod.run !== "function") throw new Error("run(snapshot) is required");
  const returned = await mod.run(snapshot);
  if (!isArray(returned)) throw new Error("run(snapshot) must return an array of drafts");
  const drafts = parse(stringify(returned)); // getters read once; functions and symbols dropped
  writeFile(outFile, stringify({ manifest, drafts, hasRecheck: typeof mod.recheck === "function" }));
} else if (mode === "recheck") {
  const drafts = parse(fs.readFileSync(draftsFile, "utf8"));
  const verdicts = [];
  for (const d of drafts) {
    let ok = false;
    try { ok = typeof mod.recheck === "function" && (await mod.recheck(d, snapshot)) === true; } catch { ok = false; }
    verdicts.push(ok === true);
  }
  writeFile(outFile, stringify(verdicts));
} else throw new Error(`unknown host mode ${mode}`);
process.exit(0); // an open handle the module left behind (a timer, a worker, a pipe) must not hold the host open
