// Retrieval at verification time — "cite after" (redesign P7; Q13; I16 declared destinations; D26).
// Only declared destinations are contacted: the package declares them in metadata/coursewerk.json
//   "retrieval": { "destinations": ["en.wikipedia.org", "openstax.org/books/chemistry-2e"], "context": "chemistry" }
//   or "retrieval": false. `context` is a few words the instructor declares to keep searches on the subject (a claim's
//   own words drift: "the most common error" finds medical errors); it names a subject, never the course.
// and without a declaration nothing is fetched. What leaves the machine is the claim only: a Wikipedia search
// query the harness builds from the claim's own words (never a unit id, a file name, the course or the package),
// or the URL of a page on a declared destination. Every fetched text is pinned (references.mjs) before a verifier
// may quote it. The fetch function is injectable, so tests run offline and can see every request.
import fs from "node:fs";
import { readConfig, writeConfig } from "../records/config.mjs";
import { recordFile } from "../records/paths.mjs";
import { appendLogRecord, parseLog, readLogText, verifyLog } from "../records/log.mjs";
import { contentWords, folded, nameKey, namesIn, quantitiesIn, yearsIn } from "./claims.mjs";
import { pinReference } from "./references.mjs";

export const USER_AGENT = "Coursewerk-verifier/1 (https://github.com/wangyu16/orz-coursewerk)";

// The destinations are the INSTRUCTOR's declaration (I16), and they decide which texts may become evidence: a
// destination the agent added by editing metadata/coursewerk.json would let it pin a page it controls and verify a wrong
// fact against it. So they are read from the instructor's latest logged declaration (red-team round 5, the audit of
// F2: no setting the checks rely on is taken from an unbound file); the file only mirrors it.
export function loggedRetrieval(logText) {
  if (verifyLog(logText).length) return false;
  const r = parseLog(logText).filter((x) => x.type === "steering" && x.party?.role === "instructor" && ["retrieval-destinations", "retrieval-off"].includes(x.payload?.event)).at(-1);
  if (!r || r.payload.event === "retrieval-off") return false;
  return { destinations: (r.payload.destinations || []).map(String), ...(r.payload.context ? { context: r.payload.context } : {}) };
}
/** The instructor declares the destinations (or switches retrieval off: `retrieval` false), in their words. */
export function declareRetrieval(root, { retrieval, words }, party) {
  if (party?.role !== "instructor") throw new Error("destinations are the instructor's declaration (I16)");
  const c = readConfig(root);
  if (retrieval === false) { c.retrieval = false; appendLogRecord(root, { type: "steering", party, payload: { event: "retrieval-off", ...(words ? { words } : {}) } }); }
  else {
    if (!String(words || "").trim()) throw new Error("a declaration of destinations quotes the instructor's words");
    const destinations = (retrieval?.destinations || []).map((x) => String(x).trim()).filter(Boolean);
    if (!destinations.length) throw new Error("name at least one destination (host[/path])");
    c.retrieval = { destinations, ...(retrieval.context ? { context: retrieval.context } : {}) };
    appendLogRecord(root, { type: "steering", party, payload: { event: "retrieval-destinations", ...c.retrieval, words } });
  }
  writeConfig(root, c);
  return c.retrieval;
}

export function retrievalConfig(root) {
  const declared = loggedRetrieval(readLogText(root));
  if (!declared || !declared.destinations.length) return { enabled: false, destinations: [] };
  const context = String(declared.context || "").trim();
  if (context && !/^[\p{L} ]{1,40}$/u.test(context)) throw new Error("retrieval.context must be a few plain words (≤ 40 letters and spaces)");
  return { enabled: true, destinations: declared.destinations, context };
}

/** Is this URL inside a declared destination? A destination is a host, optionally followed by a path prefix. */
export function allowed(url, destinations) {
  let u; try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  for (const d of destinations) {
    const [host, ...rest] = d.split("/");
    const prefix = rest.length ? "/" + rest.join("/") : "";
    if (u.hostname.toLowerCase() === host.toLowerCase() && (!prefix || u.pathname === prefix || u.pathname.startsWith(prefix.replace(/\/$/, "") + "/"))) return d;
  }
  return null;
}

/** The search query for a claim: its names, years, quantities and longest content words — nothing else. */
export function queryFor(claim) {
  const text = typeof claim === "string" ? claim : claim.text;
  const parts = [...namesIn(text), ...yearsIn(text), ...quantitiesIn(text).map((q) => q.raw)];
  const words = contentWords(text).sort((a, b) => b.length - a.length || a.localeCompare(b));
  for (const w of words) { if (parts.length >= 7) break; if (!parts.some((p) => p.toLowerCase().includes(w))) parts.push(w); }
  return parts.join(" ").replace(/[^\p{L}\p{N}\s.'’-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

const htmlText = (html) => String(html)
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
  .replace(/<annotation[\s\S]*?<\/annotation>/gi, " ")
  .replace(/<\/(p|div|li|h[1-6]|tr|section|figcaption|caption)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

async function get(fetchImpl, url) {
  const r = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/html;q=0.9" }, redirect: "follow" });
  return { status: r.status, url: r.url || url, body: await r.text() };
}

function guard(root, url) {
  const cfg = retrievalConfig(root);
  if (!cfg.enabled) throw new Error("retrieval is off for this package (no destinations declared in metadata/coursewerk.json)");
  const d = allowed(url, cfg.destinations);
  if (!d) throw new Error(`${url} is not inside a declared destination (${cfg.destinations.join(", ")})`);
  return d;
}

/** Search Wikipedia with the claim's own words; returns page titles. */
export async function searchWikipedia(root, claim, { fetchImpl = fetch, limit = 3 } = {}) {
  const q = [queryFor(claim), retrievalConfig(root).context].filter(Boolean).join(" ");
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&formatversion=2&srlimit=${limit}&srsearch=${encodeURIComponent(q)}`;
  guard(root, url);
  const r = await get(fetchImpl, url);
  if (r.status !== 200) throw new Error(`Wikipedia search returned ${r.status}`);
  return { query: q, titles: (JSON.parse(r.body).query?.search || []).map((x) => x.title) };
}

/** Fetch one page from a declared destination and pin it. Wikipedia pages come as plain-text extracts. */
export async function fetchAndPin(root, inputsDir, url, { fetchImpl = fetch, query = null, accept = null } = {}) {
  const destination = guard(root, url);
  const u = new URL(url);
  if (u.hostname === "en.wikipedia.org" && u.pathname.startsWith("/wiki/")) {
    const title = decodeURIComponent(u.pathname.slice(6)).replace(/_/g, " ");
    const api = `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=extracts%7Crevisions&explaintext=1&rvprop=ids%7Ctimestamp&redirects=1&titles=${encodeURIComponent(title)}`;
    const r = await get(fetchImpl, api);
    if (r.status !== 200) throw new Error(`Wikipedia returned ${r.status} for ${title}`);
    const page = JSON.parse(r.body).query?.pages?.[0];
    if (!page || page.missing || !page.extract) throw new Error(`no Wikipedia page ${title}`);
    if (accept && !accept(page.extract)) return null; // off-topic: not pinned
    const canonical = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
    return pinReference(root, inputsDir, { url: canonical, title: page.title, text: page.extract, query, destination, revisionId: page.revisions?.[0]?.revid ?? null, httpStatus: r.status });
  }
  const r = await get(fetchImpl, url);
  if (r.status !== 200) throw new Error(`${url} returned ${r.status}`);
  if (!allowed(r.url, retrievalConfig(root).destinations)) throw new Error(`${url} redirected outside the declared destinations (${r.url})`);
  const title = (r.body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || url).replace(/\s+/g, " ").trim();
  const main = r.body.match(/<main[\s\S]*<\/main>/i)?.[0] || r.body;
  return pinReference(root, inputsDir, { url: r.url, title, text: htmlText(main), query, destination, httpStatus: r.status });
}

/** A searched page is worth pinning only if it carries the claim's names and several of its words. */
export function onTopic(claim) {
  return (text) => {
    const f = folded(text);
    const words = claim.words.filter((w) => f.includes(w)).length;
    return claim.required.names.every((n) => f.includes(nameKey(n))) && words >= Math.min(3, claim.words.length);
  };
}

/** Resolve external links for MS4 (req.ms4.links): only links inside declared destinations are contacted. */
/**
 * Record link resolutions: metadata/LINK_RESOLUTIONS.json (merged by URL), and the same resolutions in the log — the
 * record MS4 reads (red-team round 5, the audit of F3: the file is one anyone can write, and a `status: 200` written
 * into it cleared an unresolved link without any request). Returns the merged list.
 */
export function recordLinkResolutions(root, resolved) {
  const file = recordFile(root, "metadata/LINK_RESOLUTIONS.json");
  const prior = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).links || [] : [];
  const merged = new Map(prior.map((l) => [l.url, l])); for (const r of resolved) merged.set(r.url, r);
  const links = [...merged.values()].sort((a, b) => a.url.localeCompare(b.url));
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, links }, null, 2) + "\n");
  if (resolved.length) appendLogRecord(root, { type: "revision", party: { role: "harness", name: "links" }, payload: { event: "links-resolved", links: resolved.map((r) => ({ url: r.url, status: r.status, finalUrl: r.finalUrl ?? null })) } });
  return links;
}
/** The URLs the log shows resolved (2xx/3xx at their latest logged resolution). */
export function loggedLinkResolutions(logRecords) {
  const last = new Map();
  for (const r of logRecords) if (r.type === "revision" && r.party?.role === "harness" && r.payload?.event === "links-resolved") for (const l of r.payload.links || []) last.set(l.url, l.status);
  return new Set([...last].filter(([, st]) => st >= 200 && st < 400).map(([url]) => url));
}

export async function resolveLinks(root, urls, { fetchImpl = fetch } = {}) {
  const cfg = retrievalConfig(root);
  const out = [], skipped = [];
  for (const url of urls) {
    if (!cfg.enabled || !allowed(url, cfg.destinations)) { skipped.push(url); continue; }
    try { const r = await fetchImpl(url, { method: "GET", headers: { "User-Agent": USER_AGENT }, redirect: "follow" }); out.push({ url, status: r.status, finalUrl: r.url || url, at: new Date().toISOString() }); }
    catch (e) { out.push({ url, status: 0, error: String(e.message || e), at: new Date().toISOString() }); }
  }
  return { resolved: out, skipped };
}
