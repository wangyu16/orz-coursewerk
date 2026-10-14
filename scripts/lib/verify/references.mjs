// Pinned texts a verifier may quote (redesign P7; MS1; req.ms1.span, req.retrieval.claim-only).
// Two kinds, both outside the package, in the inputs directory beside the source corpus:
//   declared sources   inputs/SOURCE_CORPUS.json (MS1; prepared by prepare_source_corpus.mjs)
//   retrieved refs     inputs/REFERENCES.json + inputs/.coursewerk-reference-text/<refId>.txt — fetched at
//                      verification time from a declared destination ("cite after"), pinned before use.
// The package carries the compact mirror metadata/REFERENCE_RECORD.json (url, time, hash; no text) of the references
// its evidence CITES — not of every page retrieval looked at — so a published package names what its evidence quotes.
import { deliverableOfSidecar, sidecarTrusted } from "../core/unit_records.mjs";
import fs from "node:fs";
import path from "node:path";
import { sha256, canonicalJson } from "../records/canonical.mjs";
import { recordFile } from "../records/paths.mjs";
import { appendLogRecord, readLogText } from "../records/log.mjs";

export const REFERENCES_FILE = "REFERENCES.json";
export const REFERENCE_TEXT_DIR = ".coursewerk-reference-text";
export const REFERENCE_RECORD = "metadata/REFERENCE_RECORD.json";

export function readReferences(inputsDir) {
  const f = inputsDir && path.join(inputsDir, REFERENCES_FILE);
  if (!f || !fs.existsSync(f)) return { schemaVersion: 1, references: [] };
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

/** The compact mirror the package carries: the registry entries of the cited references (all of them if cited is null). */
export function makeReferenceRecord(registry, cited = null) {
  const keep = cited ? new Set(cited) : null;
  return { schemaVersion: 1, references: (registry.references || []).filter((r) => !keep || keep.has(r.refId)).map((r) => ({ refId: r.refId, url: r.url, title: r.title, retrievedAt: r.retrievedAt, sha256: r.sha256, ...(r.revisionId ? { revisionId: r.revisionId } : {}) })) };
}

/** Pin a retrieved text: write it and register it (syncReferenceRecord mirrors it into the package once cited). Same URL and same text → the existing pin. */
export function pinReference(root, inputsDir, { url, title, text, retrievedAt = new Date().toISOString(), query = null, destination, revisionId = null, httpStatus = 200 }) {
  if (!inputsDir) throw new Error("pinning a reference needs the inputs directory (--inputs)");
  const reg = readReferences(inputsDir);
  const hash = sha256(text);
  let ref = reg.references.find((r) => r.url === url && r.sha256 === hash);
  if (!ref) {
    const slug = String(title || url).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "ref";
    let refId = `ref-${slug}`, k = 2;
    while (reg.references.some((r) => r.refId === refId)) refId = `ref-${slug}-${k++}`;
    const textPath = `${REFERENCE_TEXT_DIR}/${refId}.txt`;
    fs.mkdirSync(path.join(inputsDir, REFERENCE_TEXT_DIR), { recursive: true });
    fs.writeFileSync(path.join(inputsDir, textPath), text);
    ref = { refId, url, title: title || url, destination, retrievedAt, sha256: hash, textPath, httpStatus, ...(revisionId ? { revisionId } : {}), queries: [] };
    reg.references.push(ref);
  }
  if (query && !ref.queries.includes(query)) ref.queries.push(query);
  fs.writeFileSync(path.join(inputsDir, REFERENCES_FILE), JSON.stringify(reg, null, 2) + "\n");
  // every pin is logged in the package, so a text placed in the inputs by hand is not a retrieved reference (B21)
  if (root && !pinLogged(root, ref)) appendLogRecord(root, { type: "intake", party: { role: "harness", name: "retrieval" }, payload: { event: "reference-pinned", refId: ref.refId, url: ref.url, sha256: ref.sha256, revisionId: ref.revisionId ?? null, destination } });
  return ref;
}
const pinLogged = (root, ref) => readLogText(root).split("\n").some((l) => l.includes('"reference-pinned"') && l.includes(`"refId":"${ref.refId}"`) && l.includes(`"sha256":"${ref.sha256}"`));

/** Is this URL inside one of these destinations? A destination is a host, optionally followed by a path prefix; only
 *  https, no credentials, no port. The destination it falls in, or null. */
export function allowed(url, destinations) {
  let u; try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  for (const d of destinations || []) {
    const [host, ...rest] = String(d).split("/");
    const prefix = rest.length ? "/" + rest.join("/") : "";
    if (u.hostname.toLowerCase() === host.toLowerCase() && (!prefix || u.pathname === prefix || u.pathname.startsWith(prefix.replace(/\/$/, "") + "/"))) return d;
  }
  return null;
}

// DESTINATIONS ARE DECIDED BY THE DECLARED LIST, NEVER BY THE PIN'S OWN CLAIM (red team round 7, I16): a pin's record
// names a `destination`, but that is the pinner's word — a URL outside every declared destination (the book's PDF on
// another host, say) was accepted "under" a destination it is not in. A pin counts only when its URL lies inside a
// destination the INSTRUCTOR declares: their latest logged retrieval declaration (the one retrieval.mjs fetches under).
// With retrieval off or never declared, no retrieved text is evidence; a destination the instructor drops stops
// vouching for what was pinned there.
/** Every logged pin, read against the instructor's declared destinations: Map(refId → { sha256, url, destination }) —
 *  `destination` is the declared destination its URL falls in, or null. Takes the log text or its parsed records. */
export function pinLedger(log) {
  const records = Array.isArray(log) ? log : String(log || "").split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const decl = records.filter((r) => r?.type === "steering" && r.party?.role === "instructor" && ["retrieval-destinations", "retrieval-off"].includes(r.payload?.event)).at(-1);
  const declared = decl?.payload?.event === "retrieval-destinations" ? (decl.payload.destinations || []).map(String) : [];
  const out = new Map();
  for (const r of records) if (r?.party?.role === "harness" && r.payload?.event === "reference-pinned") out.set(r.payload.refId, { sha256: r.payload.sha256, url: r.payload.url ?? null, destination: r.payload.url ? allowed(r.payload.url, declared) : null });
  return out;
}
/** The pins the log vouches for: refId → sha256 — logged by the retrieval service AND inside a destination the
 *  instructor declared (pinLedger). */
export function loggedPins(log) {
  return new Map([...pinLedger(log)].filter(([, p]) => p.destination).map(([id, p]) => [id, p.sha256]));
}
/** May this pinned text be evidence? A declared source (the corpus) always; a retrieved reference only when the log
 *  vouches for it at its hash and its URL (pinLedger: inside a declared destination). */
export function admissiblePin(id, entry, ledger) {
  const isRef = entry ? entry.kind === "reference" : String(id).startsWith("ref-");
  if (!isRef) return true;
  const p = ledger.get(id);
  return !!p && !!p.destination && (!entry?.sha256 || p.sha256 === entry.sha256) && (!entry?.url || !p.url || entry.url === p.url);
}

/** The references the package's unit evidence cites. */
export function citedReferences(root) {
  const dir = recordFile(root, "metadata/units"), out = new Set();
  // only records the log wrote are read (R7 H-04)
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith(".json") && sidecarTrusted(root, deliverableOfSidecar(root, f))) for (const u of JSON.parse(fs.readFileSync(f, "utf8")).units || []) for (const ev of u.evidence || []) for (const q of [ev, ...(ev.quotes || [])]) if (q.source?.startsWith("ref-")) out.add(q.source); } };
  if (fs.existsSync(dir)) walk(dir);
  return [...out].sort();
}

/** Rewrite the package's mirror after evidence changed. */
export function syncReferenceRecord(root, inputsDir) {
  const reg = readReferences(inputsDir);
  const record = makeReferenceRecord(reg, citedReferences(root));
  fs.writeFileSync(recordFile(root, REFERENCE_RECORD), JSON.stringify(record, null, 2) + "\n");
  return record;
}

/**
 * Every pinned text a verifier may quote, from a reader over the inputs (a snapshot's "@inputs/…" paths, or the
 * filesystem). Returns Map(id → { text, sha256, kind, url, ok }) — ok is false when the text does not match its pin.
 */
export function pinnedTexts(readInput) {
  const out = new Map();
  const corpus = safeJson(readInput("SOURCE_CORPUS.json"));
  for (const e of corpus?.sources || []) {
    if (!e.textPath || !e.sha256) continue;
    const text = readInput(e.textPath);
    if (text != null) out.set(e.sourceId, { text, sha256: e.sha256, kind: "source", url: e.canonicalUrl, ok: sha256(text) === e.sha256 });
  }
  const refs = safeJson(readInput(REFERENCES_FILE));
  for (const r of refs?.references || []) {
    const text = readInput(r.textPath);
    if (text != null) out.set(r.refId, { text, sha256: r.sha256, kind: "reference", url: r.url, ok: sha256(text) === r.sha256 });
  }
  return out;
}
export const fsInputReader = (inputsDir) => (rel) => { const f = path.join(inputsDir, rel); try { return fs.readFileSync(f, "utf8"); } catch { return null; } };
export const snapshotInputReader = (snap) => (rel) => snap.text(`@inputs/${rel}`);

function safeJson(t) { try { return t == null ? null : JSON.parse(t); } catch { return null; } }
export const referenceRecordMatches = (record, registry) => canonicalJson(record) === canonicalJson(makeReferenceRecord(registry, (record.references || []).map((r) => r.refId)));
