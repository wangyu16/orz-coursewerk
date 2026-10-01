#!/usr/bin/env node
// The verification tools (redesign P7; D17, D19, D26). The agent runs these; the harness decides what is admitted.
//   node scripts/verify.mjs destinations --root <pkg> --set "<host[/path]>,…" [--context "<subject words>"] --name <instructor> --words "<their words>"
//        | --off --name <instructor>                                     declare (or switch off) where retrieval may go
//   node scripts/verify.mjs search  --root <pkg> --inputs <dir> [--units id,…] [--limit 2]
//        claim-only Wikipedia searches for the units still lacking evidence; the pages found are fetched and pinned
//   node scripts/verify.mjs fetch   --root <pkg> --inputs <dir> --url <url>        fetch and pin one page (declared destinations only)
//   node scripts/verify.mjs semi    --root <pkg> --inputs <dir> [--units id,…]     blind verifier per semi-mechanical unit
//        [--courier-out <dir>]   write the bundles for a fresh subagent instead of running the verifier command
//        [--courier-in <dir>]    admit the answers the subagent wrote (<n>.answer.txt beside <n>.bundle.json)
//   node scripts/verify.mjs readmit --root <pkg> --inputs <dir>                    re-admit recorded answers under the current rules
//   node scripts/verify.mjs absolutes --root <pkg> [--units id,…]                  context review of absolute statements (D30)
//   node scripts/verify.mjs knowledge --root <pkg> [--units id,…]                  blind concerns → questions (no edits)
//   node scripts/verify.mjs correct --root <pkg> --inputs <dir> --unit <id> --model <model id>
//        apply an admitted, uncontested correction — or report the question it must be instead
//   node scripts/verify.mjs revert  --root <pkg> --correction <id> --name <instructor> --note "<why the text stands>"
//   node scripts/verify.mjs corrections --root <pkg> [--mark-shown]                 applied corrections with their diffs
//   node scripts/verify.mjs links   --root <pkg>                                    resolve external links (declared destinations)
//   node scripts/verify.mjs status  --root <pkg>                                    evidence state of every semi-mechanical unit
// The verifier command is the harness environment's COURSEWERK_VERIFIER (JSON array), default headless `claude -p`
// with no tools, settings, MCP servers or session, in an empty temporary directory (D26).
import fs from "node:fs";
import path from "node:path";
import { liveReader } from "./lib/core/package_reader.mjs";
import { hasAdmittedEvidence, loadUnits, loggedInstructorActs, needsEvidence as unitNeedsEvidence } from "./lib/core/obligations.mjs";
import { factHash } from "./lib/core/dependencies.mjs";
import { readConfig, writeConfig } from "./lib/records/config.mjs";
import { appendLogRecord } from "./lib/records/log.mjs";
import { recordFile } from "./lib/records/paths.mjs";
import { checkableClaims, claimsHash, folded } from "./lib/verify/claims.mjs";
import { admit } from "./lib/verify/admission.mjs";
import { headlessVerifier, recordDispatch, selectPassages, semiBundle, readDispatches } from "./lib/verify/dispatch.mjs";
import { fsInputReader, pinnedTexts, syncReferenceRecord } from "./lib/verify/references.mjs";
import { fetchAndPin, onTopic, resolveLinks, searchWikipedia } from "./lib/verify/retrieval.mjs";
import { applyCorrection, correctionsToShow, readmitRecorded, reviewAbsolutes, revertCorrection, verifyKnowledge, verifySemi } from "./lib/verify/verdicts.mjs";
import { admitEvidence } from "./lib/core/obligations.mjs";
import { createQaAudits } from "./lib/legacy/qa_audits.mjs";

const [cmd, ...args] = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const flag = (n) => args.includes(n);
const fail = (m, c = 2) => { console.error(m); process.exit(c); };
const out = (x) => console.log(JSON.stringify(x, null, 2));
const root = opt("--root");
if (!cmd || !root || !fs.existsSync(root)) fail("usage: verify.mjs <destinations|search|fetch|semi|readmit|absolutes|knowledge|correct|revert|corrections|links|status> --root <package> … (see the header of scripts/verify.mjs)");
const reader = liveReader(root);
const inputs = () => { const d = opt("--inputs"); if (!d || !fs.existsSync(d)) fail("--inputs <dir> (the source corpus directory) is required"); return d; };
const only = () => (opt("--units") ? opt("--units").split(",").filter(Boolean) : null);
const needsEvidence = () => { const acts = loggedInstructorActs(root); return loadUnits(root, reader).filter((u) => unitNeedsEvidence(u) && !hasAdmittedEvidence(u, acts) && (!only() || only().includes(u.id))); };
const log = (r) => process.stderr.write(JSON.stringify(r) + "\n");

try {
  if (cmd === "destinations") {
    const name = opt("--name") || fail("--name <instructor> is required: destinations are the instructor's declaration (I16)");
    const c = readConfig(root);
    if (flag("--off")) c.retrieval = false;
    else {
      const words = opt("--words") || fail('--words "<the instructor\'s own words>" is required');
      const destinations = String(opt("--set") || "").split(",").map((x) => x.trim()).filter(Boolean);
      if (!destinations.length) fail("--set <host[/path],…> is required");
      c.retrieval = { destinations, ...(opt("--context") ? { context: opt("--context") } : {}) };
      appendLogRecord(root, { type: "steering", party: { role: "instructor", name }, payload: { event: "retrieval-destinations", ...c.retrieval, words } });
    }
    if (flag("--off")) appendLogRecord(root, { type: "steering", party: { role: "instructor", name }, payload: { event: "retrieval-off" } });
    writeConfig(root, c); out({ retrieval: c.retrieval }); process.exit(0);
  }
  if (cmd === "fetch") { const r = await fetchAndPin(root, inputs(), opt("--url") || fail("--url is required")); out({ pinned: r.refId, url: r.url, sha256: r.sha256 }); process.exit(0); }
  if (cmd === "search") {
    const dir = inputs(), limit = Number(opt("--limit") || 2), seen = new Set(), pinned = [];
    for (const u of needsEvidence()) for (const c of checkableClaims(u.text)) {
      const { query, titles } = await searchWikipedia(root, c, { limit });
      for (const t of titles.slice(0, limit)) {
        if (seen.has(t)) continue; seen.add(t);
        try { const r = await fetchAndPin(root, dir, `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, "_"))}`, { query, accept: onTopic(c) }); if (r) { pinned.push({ refId: r.refId, title: r.title }); log({ query, pinned: r.refId }); } else { seen.delete(t); log({ query, offTopic: t }); } }
        catch (e) { log({ query, title: t, error: e.message }); }
      }
    }
    out({ pinned }); process.exit(0);
  }
  if (cmd === "semi") {
    const dir = inputs(), texts = pinnedTexts(fsInputReader(dir));
    const plain = new Map([...texts].map(([k, v]) => [k, v.text]));
    if (opt("--courier-out")) {
      const cdir = opt("--courier-out"); fs.mkdirSync(cdir, { recursive: true });
      let n = 0;
      for (const u of needsEvidence()) {
        const claims = checkableClaims(u.text), passages = selectPassages(claims, texts);
        if (!passages.length) continue;
        const bundle = semiBundle(claims, passages);
        fs.writeFileSync(path.join(cdir, `${++n}.bundle.json`), JSON.stringify({ unit: u.id, factHash: factHash(u.text), contentHash: u.locator.contentHash, passages, bundle }, null, 2));
        fs.writeFileSync(path.join(cdir, `${n}.prompt.txt`), bundle.prompt); // what the fresh subagent receives — nothing else
      }
      out({ bundles: n, dir: cdir, next: "give each <n>.prompt.txt, alone, to a fresh subagent with no other context; save its reply as <n>.answer.txt; then run semi --courier-in" }); process.exit(0);
    }
    if (opt("--courier-in")) {
      const cdir = opt("--courier-in"), results = [];
      for (const f of fs.readdirSync(cdir).filter((x) => x.endsWith(".bundle.json")).sort((a, b) => parseInt(a) - parseInt(b))) {
        const b = JSON.parse(fs.readFileSync(path.join(cdir, f), "utf8"));
        const af = path.join(cdir, f.replace(".bundle.json", ".answer.txt"));
        if (!fs.existsSync(af)) continue;
        const u = loadUnits(root, reader).find((x) => x.id === b.unit);
        if (!u || factHash(u.text) !== b.factHash) { results.push({ unit: b.unit, status: "stale bundle: the unit changed" }); continue; }
        const claims = checkableClaims(u.text);
        if (b.bundle.prompt !== semiBundle(claims, b.passages, b.bundle.nonce).prompt || b.passages.some((x) => !texts.get(x.source)?.ok || !folded(texts.get(x.source).text).includes(folded(x.text)))) { results.push({ unit: b.unit, status: "refused: the bundle was edited" }); continue; }
        const answer = { mode: "courier", raw: fs.readFileSync(af, "utf8"), model: opt("--model") || null, costUsd: null };
        const admission = admit({ claims, passages: b.passages, texts: plain, raw: answer.raw, nonce: b.bundle.nonce });
        const record = recordDispatch(root, { kind: "semi", unit: u.id, factHash: b.factHash, contentHash: u.locator.contentHash, bundle: b.bundle, passages: b.passages, texts, answer, admission, claims });
        if (admission.status === "admitted") admitEvidence(root, reader, u.id, { type: "quote-verified", source: admission.perClaim[0].quotes[0].source, quotes: admission.perClaim.flatMap((c) => c.quotes.map((q) => ({ ...q, claim: c.claim, textSha256: texts.get(q.source)?.sha256 }))), factHash: b.factHash, claimsHash: claimsHash(u.text), dispatch: record.dispatch, at: record.at });
        results.push({ unit: u.id, status: admission.status });
      }
      syncReferenceRecord(root, inputs());
      out({ results }); process.exit(0);
    }
    const results = await verifySemi(root, reader, { texts, verifier: headlessVerifier(), only: only(), onProgress: log });
    syncReferenceRecord(root, dir);
    const by = {}; for (const r of results) by[r.status] = (by[r.status] || 0) + 1;
    out({ units: results.length, byStatus: by, costUsd: Number(results.reduce((a, r) => a + (r.costUsd || 0), 0).toFixed(4)) }); process.exit(0);
  }
  if (cmd === "readmit") {
    const dir = inputs(), r = readmitRecorded(root, reader, { texts: pinnedTexts(fsInputReader(dir)) });
    syncReferenceRecord(root, dir); out({ readmitted: r }); process.exit(0);
  }
  if (cmd === "absolutes") {
    const results = await reviewAbsolutes(root, reader, { verifier: headlessVerifier(), only: only(), onProgress: log });
    const by = {}; for (const r of results) for (const c of r.classes.length ? r.classes : [r.status]) by[c] = (by[c] || 0) + 1;
    out({ units: results.length, bySentence: by, costUsd: Number(results.reduce((a, r) => a + (r.costUsd || 0), 0).toFixed(4)) }); process.exit(0);
  }
  if (cmd === "knowledge") {
    const results = await verifyKnowledge(root, reader, { verifier: headlessVerifier(), only: only(), onProgress: log });
    out({ units: results.length, withConcerns: results.filter((r) => r.concerns).length }); process.exit(0);
  }
  if (cmd === "correct") {
    const model = opt("--model") || fail("--model <model id> is required");
    const texts = pinnedTexts(fsInputReader(inputs()));
    const r = applyCorrection(root, reader, { unitId: opt("--unit") || fail("--unit is required"), plainTexts: new Map([...texts].filter(([, v]) => v.ok).map(([k, v]) => [k, v.text])), meta: texts }, { role: "agent", name: "executor", model });
    syncReferenceRecord(root, inputs());
    out(r.applied ? { applied: r.correction.id, diff: r.correction.diff } : { applied: false, question: r.question }); process.exit(r.applied ? 0 : 1);
  }
  if (cmd === "revert") {
    const r = revertCorrection(root, reader, opt("--correction") || fail("--correction is required"), { note: opt("--note") }, { role: "instructor", name: opt("--name") || fail("--name <instructor> is required") });
    out(r); process.exit(0);
  }
  if (cmd === "corrections") { out({ corrections: correctionsToShow(root, { mark: flag("--mark-shown") }) }); process.exit(0); }
  if (cmd === "links") {
    const q = createQaAudits(path.resolve(root), { forDiscovery: false });
    const urls = new Set();
    for (const f of q.mdFiles) for (const l of q.markdownLinks(q.read(f))) if (/^https?:/i.test(l.target)) urls.add(l.target);
    const { resolved, skipped } = await resolveLinks(root, [...urls].sort());
    const file = recordFile(root, "metadata/LINK_RESOLUTIONS.json");
    const prior = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).links || [] : [];
    const merged = new Map(prior.map((l) => [l.url, l])); for (const r of resolved) merged.set(r.url, r);
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, links: [...merged.values()].sort((a, b) => a.url.localeCompare(b.url)) }, null, 2) + "\n");
    out({ resolved: resolved.length, broken: resolved.filter((r) => !(r.status >= 200 && r.status < 400)).map((r) => r.url), skippedOutsideDestinations: skipped }); process.exit(0);
  }
  if (cmd === "status") {
    const dir = recordFile(root, "metadata/verification");
    const recs = fs.existsSync(dir) ? readDispatches((p) => fs.readFileSync(recordFile(root, p), "utf8"), fs.readdirSync(dir).map((f) => `metadata/verification/${f}`)) : [];
    const acts = loggedInstructorActs(root);
    const units = loadUnits(root, reader).filter((u) => unitNeedsEvidence(u));
    const rows = units.map((u) => {
      const fh = factHash(u.text), ev = hasAdmittedEvidence(u, acts) ? (u.evidence || []).find((e) => e.factHash === fh)?.type : null;
      const last = recs.filter((r) => r.unit === u.id && r.kind === "semi" && r.factHash === fh).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
      return { unit: u.id, evidence: ev || null, lastDispatch: last ? { status: last.admission?.status, claims: (last.admission?.perClaim || []).map((c) => `${c.claim}:${c.status}${c.reason ? ` (${c.reason})` : ""}`) } : null };
    });
    const by = {}; for (const r of rows) { const k = r.evidence || r.lastDispatch?.status || "unverified"; by[k] = (by[k] || 0) + 1; }
    out({ semiMechanical: rows.length, byState: by, units: rows }); process.exit(0);
  }
  fail(`unknown command ${cmd}`);
} catch (e) { fail(`verify ${cmd}: ${e.message}`, 3); }
