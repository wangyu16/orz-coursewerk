// A package snapshot: the read-only view every module receives (skeleton §6). Modules get this object, never a
// path they could write to. Its id (over every path and content hash) is the `basis` of every finding.
import fs from "node:fs";
import path from "node:path";
import { canonicalJson, sha256 } from "../records/canonical.mjs";

const SKIP_DIRS = new Set([".git", "node_modules"]); // for snapshot content; write detection also watches node_modules
const LARGE = 64 * 1024 * 1024;

/** A file's identity for write detection: its content hash, or — past 64 MB, or when unreadable — a stat-based mark,
 * so a vanished, unreadable or huge file is reported as a change, never a crash (round P2-3). */
function fileMark(full) {
  try {
    const st = fs.statSync(full);
    if (st.size > LARGE) return `large:${st.size}:${st.mtimeMs}`;
    return sha256(fs.readFileSync(full));
  } catch (e) { return `unreadable:${e.code || e.message}`; }
}
const SKIP_FILES = new Set(["metadata/LOG.jsonl.lock"]);
const TEXT_EXT = /\.(md|json|jsonl|txt|csv|yml|yaml|svg|html|mjs|js|css|bib)$/i;

function walk(root, dir = root, out = [], skip = SKIP_DIRS) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { out.push({ gone: path.relative(root, dir).split(path.sep).join("/"), code: e.code }); return out; }
  for (const entry of entries) {
    if (entry.isDirectory()) { if (!skip.has(entry.name)) walk(root, path.join(dir, entry.name), out, skip); continue; }
    if (entry.isSymbolicLink()) { let to; try { to = fs.readlinkSync(path.join(dir, entry.name)); } catch (e) { to = `unreadable:${e.code}`; } out.push({ link: path.relative(root, path.join(dir, entry.name)).split(path.sep).join("/"), to }); continue; }
    if (!entry.isFile()) continue;
    const rel = path.relative(root, path.join(dir, entry.name)).split(path.sep).join("/");
    if (!SKIP_FILES.has(rel)) out.push(rel);
  }
  return out;
}

function deepFreeze(v) {
  if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v)) deepFreeze(x); }
  return v;
}

/** The content identity of the package tree for write detection: every file with its content hash, every symlink
 * with its target, and the git hooks and config (code that would run later). */
export function treeId(root) {
  root = path.resolve(root);
  const entries = walk(root, root, [], new Set([".git"])).map((e) =>
    typeof e === "string" ? [e, fileMark(path.join(root, e))] : e.link !== undefined ? [`link:${e.link}`, e.to] : [`gone:${e.gone}`, e.code]);
  // Git state a module must not touch: config, hooks and info (code or settings that act later), HEAD, refs and
  // packed refs (history). Objects are content-addressed and reachable only through refs, so refs cover them.
  const gitFiles = (rel) => {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) return;
    const st = fs.lstatSync(full);
    if (st.isFile()) entries.push([rel, fileMark(full)]);
    else if (st.isSymbolicLink()) entries.push([`link:${rel}`, fs.readlinkSync(full)]);
    else if (st.isDirectory()) for (const h of fs.readdirSync(full).sort()) gitFiles(`${rel}/${h}`);
  };
  for (const rel of [".git/config", ".git/config.worktree", ".git/hooks", ".git/info", ".git/HEAD", ".git/refs", ".git/packed-refs", ".git/index"]) gitFiles(rel);
  return sha256(canonicalJson(entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))));
}

export function createSnapshot(root, { profile, checkpoint } = {}) {
  root = path.resolve(root);
  const files = Object.create(null);
  for (const rel of walk(root).filter((e) => typeof e === "string").sort()) {
    const full = path.join(root, rel);
    let buf = null;
    try { if (fs.statSync(full).size <= LARGE) buf = fs.readFileSync(full); } catch { buf = null; }
    files[rel] = buf ? { hash: sha256(buf), text: TEXT_EXT.test(rel) && buf.length < 8 * 1024 * 1024 ? buf.toString("utf8") : null } : { hash: fileMark(full), text: null };
  }
  const id = sha256(canonicalJson(Object.entries(files).map(([rel, f]) => [rel, f.hash])));
  const snap = { id, profile, checkpoint, files, paths: Object.keys(files) };
  snap.text = (rel) => (Object.hasOwn(files, rel) ? files[rel].text : null);
  snap.json = (rel) => { const t = snap.text(rel); try { return t == null ? null : JSON.parse(t); } catch { return undefined; } };
  return deepFreeze(snap);
}
