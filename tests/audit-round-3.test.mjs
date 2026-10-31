// Round-3 PROBES — the unaudited surface (assurance kernel, source preparation, carriers, spine and
// term registry, the queue, CLI arguments, idempotence). One per finding; each failed before its fix.
import { relocate } from "../scripts/lib/records/paths.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditAssurance } from "../scripts/lib/assurance.mjs";
import { identityProblem } from "../scripts/lib/identity.mjs";
import { buildTermsReport } from "../scripts/lib/terms.mjs";
import { spineCycles, buildSpine } from "../scripts/lib/spine.mjs";
import { immutableRegions, unverifiableQuotations } from "../scripts/lib/immutable.mjs";
import { scanText, buildSourceIndex } from "../scripts/lib/verbatim.mjs";
import { buildQueue } from "../scripts/lib/escalation.mjs";
import { scanProcessRestrictions, normalizeEvidenceText } from "../scripts/lib/rights_preflight.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(REPO, "tests", "fixtures", "usage-package");
const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const cli = (script, a) => { const r = spawnSync(process.execPath, [path.join(REPO, "scripts", script), ...a], { cwd: REPO, encoding: "utf8", env: ENV }); return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" }; };
const git = (cwd, ...a) => spawnSync("git", a, { cwd, encoding: "utf8", env: ENV });
const read = (pkg, rel) => fs.readFileSync(path.join(pkg, rel), "utf8");
const write = (pkg, rel, t) => fs.writeFileSync(path.join(pkg, rel), t);
function pkgCopy(t, { indexed = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-audit3-"));
  const pkg = path.join(dir, "package");
  fs.cpSync(FIXTURE, pkg, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(pkg, "init", "-q", "."); git(pkg, "add", "-A"); git(pkg, "commit", "-qm", "baseline");
  if (indexed) { assert.equal(cli("index_components.mjs", ["--root", pkg, "--initialize"]).code, 0); assert.equal(cli("index_semantic.mjs", ["--root", pkg]).code, 0); }
  return { dir, pkg };
}
function gate(pkg, extra = []) { const json = path.join(pkg, "..", `qa-${Math.random().toString(36).slice(2)}.json`); const r = cli("check_oer.mjs", ["--package", pkg, "--json", json, ...extra]); return { ...r, json: fs.existsSync(json) ? JSON.parse(fs.readFileSync(json, "utf8")) : null }; }

test("H1 · a CC-BY-NC EXCERPT (or asset) cannot reach a CC-BY public pack; a pure reference is warned, not blocked", (t) => {
  const { pkg } = pkgCopy(t);
  const manifest = JSON.parse(read(pkg, "alembic.json"));
  const foundation = JSON.parse(read(pkg, "private/coursewerk/FOUNDATION.json"));
  const src = foundation.sources[0];
  src.rightsBasis.type = "open-license"; src.rightsBasis.license = "CC-BY-NC-4.0";
  const audit = (use, role = "primary") => { src.use = use; src.role = role; write(pkg, "private/coursewerk/FOUNDATION.json", JSON.stringify(foundation)); return auditAssurance({ root: pkg, manifest }); };
  for (const [use, role] of [["adaptation", "primary"], ["excerpt", "primary"], ["excerpt", "supplemental"], ["adaptation", "asset"]])
    assert.ok(audit(use, role).publicationBlockers.some((b) => /not compatible/.test(b)), `${use}/${role} under NC must block a CC-BY pack`);
  const ref = audit("reference");
  assert.ok(!ref.publicationBlockers.some((b) => /not compatible/.test(b)), "a reference reproduces nothing");
  assert.ok(ref.warnings.some((w) => /referenced \(not reproduced\)/.test(w)), "but it is named in the warnings");
});

test("H2 · nine forms of hot-linked media are release-blocking", (t) => {
  const { pkg } = pkgCopy(t);
  const forms = [
    "![ref][fig1]\n\n[fig1]: https://evil.example.com/a.png",
    '<img srcset="https://evil.example.com/b.png 1x, https://evil.example.com/b2.png 2x">',
    '<picture><source srcset="https://evil.example.com/c.webp"></picture>',
    '<video poster="https://evil.example.com/d.jpg"></video>',
    '<embed src="https://evil.example.com/e.svg">',
    '<iframe src="https://evil.example.com/f"></iframe>',
    '<object data="https://evil.example.com/g.pdf"></object>',
    '<div style="background-image:url(https://evil.example.com/h.png)"></div>',
    "![pr](//evil.example.com/i.png)",
    '<img src = "https://evil.example.com/j.png">',
  ];
  write(pkg, "study-guide/melting.md", read(pkg, "study-guide/melting.md") + "\n\n" + forms.join("\n\n") + "\n");
  const r = gate(pkg);
  assert.ok(r.json.criticalCounts.remoteMediaReferences >= 10, `caught ${r.json.criticalCounts.remoteMediaReferences} of 10`);
});

test("H3 · a binary under a deliverable folder is a layout error", (t) => {
  const { pkg } = pkgCopy(t);
  fs.writeFileSync(path.join(pkg, "study-guide", "inline.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const r = gate(pkg);
  assert.ok(JSON.stringify(r.json.contract.layout.errors).includes("inline.png"));
});

test("H4 · a non-Latin source counts words and is scanned for verbatim copying", () => {
  const ru = "Плавление — это переход вещества из твёрдого состояния в жидкое при нагревании до температуры плавления при данном давлении; внутренняя энергия растёт и молекулы покидают решётку.";
  const words = (ru.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
  assert.ok(words >= 20);
  assert.ok(scanText("Intro.\n\n" + ru + "\n", buildSourceIndex([ru])).length >= 1, "Cyrillic prose copied verbatim is a span");
});

test("H5 · a release check with --no-queue leaves the tree exactly as it found it", (t) => {
  const { pkg } = pkgCopy(t, { indexed: true });
  assert.equal(git(pkg, "status", "--porcelain").stdout.trim(), "");
  gate(pkg, ["--for-discovery", "--no-commit", "--no-queue"]);
  assert.equal(git(pkg, "status", "--porcelain").stdout.trim(), "", "no REVIEW_QUEUE.json left behind");
  gate(pkg, ["--for-discovery", "--no-commit"]);
  assert.match(git(pkg, "status", "--porcelain").stdout, /REVIEW_QUEUE/, "without --no-queue the queue is written (and left uncommitted)");
});

test("M1 · placeholder, sample and AI-vendor identities are refused; a real name passes", () => {
  for (const bad of ["Your Name", "Author Name", "Jane Doe", "N/A", "-", "Anonymous", "Lorem Ipsum", "FIXME", "INSERT NAME HERE", "<name>", "Sample Institution", "Claude", "ChatGPT", "GPT-4", "Gemini", "Copilot", "OpenAI", "Anthropic", "REPLACE-WITH-NAME", "TBD", "Coursewerk agent"])
    assert.ok(identityProblem(bad), `must refuse ${JSON.stringify(bad)}`);
  for (const good of ["Manyu Li", "University of Louisiana at Lafayette", "Ada Lovelace"]) assert.equal(identityProblem(good), null, good);
});

test("M2/M3 · a license identifier beside a contradicting sentence, or hidden in markup, does not clear; a cross-origin redirect is warned", async (t) => {
  const { pkg } = pkgCopy(t);
  const crypto = await import("node:crypto");
  const manifest = JSON.parse(read(pkg, "alembic.json"));
  const foundation = JSON.parse(read(pkg, "private/coursewerk/FOUNDATION.json"));
  const src = foundation.sources[0];
  const rb = src.rightsBasis;
  rb.type = "open-license"; rb.license = "CC-BY-4.0";
  const snapshotRel = relocate(rb.evidenceSnapshot); // a stored pre-layout path, read at its place now
  const setSnapshot = (html) => {
    write(pkg, snapshotRel, html);
    rb.evidenceSha256 = crypto.createHash("sha256").update(fs.readFileSync(path.join(pkg, snapshotRel))).digest("hex");
    rb.evidenceRetrieval = { ...(rb.evidenceRetrieval || {}), byteLength: fs.statSync(path.join(pkg, snapshotRel)).size };
    write(pkg, "private/coursewerk/FOUNDATION.json", JSON.stringify(foundation));
    return auditAssurance({ root: pkg, manifest });
  };
  const good = setSnapshot("<html><title>License</title><body><p>This work is licensed under a Creative Commons Attribution 4.0 International License.</p></body></html>");
  assert.ok(!good.publicationBlockers.some((b) => /identifier|contradicting/.test(b)), good.publicationBlockers.join("\n"));
  const contradicted = setSnapshot("<html><title>Sign in</title><body>This book is NOT released under Attribution 4.0. All rights reserved.</body></html>");
  assert.ok(contradicted.publicationBlockers.some((b) => /contradicting statement/.test(b)), contradicted.publicationBlockers.join("\n"));
  assert.ok(contradicted.warnings.some((w) => /sign-in or error page/.test(w)));
  const hidden = setSnapshot("<html><body><!-- attribution 4.0 --><p>Commercial edition.</p></body></html>");
  assert.ok(hidden.publicationBlockers.some((b) => /visible text/.test(b)), "a needle inside a comment is not visible");
  setSnapshot("<html><title>License</title><body><p>Creative Commons Attribution 4.0 International.</p></body></html>");
  rb.evidenceRetrieval = { ...rb.evidenceRetrieval, captureMode: "network", requestedUrl: "https://publisher.example.org/license", finalUrl: "https://other.example.net/anything", httpStatus: 200, contentType: "text/html" };
  write(pkg, "private/coursewerk/FOUNDATION.json", JSON.stringify(foundation));
  const redirected = auditAssurance({ root: pkg, manifest });
  assert.ok(redirected.warnings.some((w) => /DIFFERENT origin/.test(w)), redirected.warnings.join("\n"));
});

test("M6 · a homograph (two glosses) and an alias claimed by two terms are reported, never merged silently", () => {
  const maps = [
    { scope: "bio", text: "## Key terms\n- **cell** — the basic unit of life\n" },
    { scope: "electro", text: "## Key terms\n- **cell** (galvanic cell) — a device producing current from a reaction\n" },
    { scope: "ch1", text: "## Key terms\n- **melting point** (MP) — a temperature\n- **mass percent** (MP) — a ratio\n" },
  ];
  const report = buildTermsReport(maps, null);
  assert.ok(report.conflicts.some((c) => c.kind === "gloss" && /cell/.test(c.detail)), JSON.stringify(report.conflicts));
  assert.ok(report.conflicts.some((c) => c.kind === "alias" && /"MP"/.test(c.detail)), JSON.stringify(report.conflicts));
});

test("M7 · a prerequisite cycle is found and named", () => {
  const spine = buildSpine([{ scope: "ch2", file: "concepts/ch2.md", text: "## Objectives\n1. Know A.\n\n## Concept sequence\n1. A first. [prereq: concept.ch2.2]\n2. B second. [prereq: concept.ch2.1]\n3. C third.\n\n## Key terms\n- **alpha** — a\n" }]);
  const cycles = spineCycles(spine);
  assert.equal(cycles.length, 1, JSON.stringify(spine.edges));
  assert.deepEqual(cycles[0], ["concept.ch2.1", "concept.ch2.2"]);
  assert.deepEqual(spineCycles({ edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }] }), []);
});

test("M8 · a quoted alt text is a literal, not an unverifiable quotation", () => {
  const text = 'Prose. <img src="../assets/fig.png" alt="A heating curve showing temperature plateauing while the solid melts"> more prose.';
  assert.equal(unverifiableQuotations(text, ["An unrelated source text about latent heat and phase changes of water."]).length, 0);
  assert.ok(immutableRegions(text, null).some((r) => r.kind === "literal"), "the tag is still immutable");
});

test("M11 · --json or --report inside the package is refused before a run", (t) => {
  const { pkg } = pkgCopy(t);
  const r = cli("check_oer.mjs", ["--package", pkg, "--json", path.join(pkg, "qa.json")]);
  assert.equal(r.code, 2); assert.match(r.stderr, /OUTSIDE the package/);
  assert.equal(fs.existsSync(path.join(pkg, "qa.json")), false);
});

test("M12 · the same package through a symlinked parent finds its ledger", (t) => {
  const { pkg, dir } = pkgCopy(t, { indexed: true });
  assert.equal(gate(pkg).code, 0);
  const link = path.join(dir, "linkparent");
  fs.symlinkSync(dir, link);
  const viaLink = gate(path.join(link, "package"));
  assert.ok(!JSON.stringify(viaLink.json.coherence.hardFailures).includes("ledger is missing"), viaLink.json.coherence.hardFailures.join("\n"));
});

test("L2/L3 · a term-proposal batch takes the WORST severity; an unattributable burden is signalled by artifactCount 0 (ratio stays a finite number by schema)", () => {
  const claims = { claims: [] };
  const a = buildQueue([{ kind: "term-proposal", label: "x", scope: "ch1", severity: "info" }, { kind: "term-proposal", label: "y", scope: "ch1", severity: "review" }], claims);
  const b = buildQueue([{ kind: "term-proposal", label: "y", scope: "ch1", severity: "review" }, { kind: "term-proposal", label: "x", scope: "ch1", severity: "info" }], claims);
  assert.equal(JSON.stringify(a.items.map((i) => i.severity)), JSON.stringify(b.items.map((i) => i.severity)));
  assert.ok(a.items.every((i) => i.severity === "review"));
  assert.equal(a.burden.artifactCount, 0); assert.ok(a.burden.flagCount > 0); assert.equal(a.burden.flagsPerArtifact, 0);
});

test("L4 · ordinary rewordings of an AI-training notice are detected; a soft-hyphenated word does not hide it", () => {
  for (const s of ["Use of this work to train, fine-tune, or evaluate artificial intelligence systems is not permitted.", "You must not use this content for AI training.", "TDM reservation under Art. 4(3).", "Use of this work to train­ing artificial intelligence models is prohibited."])
    assert.ok(scanProcessRestrictions(normalizeEvidenceText(s).toLowerCase()).length >= 1, s);
});

test("L5 · a deliverable that is not valid UTF-8 is a layout error", (t) => {
  const { pkg } = pkgCopy(t);
  fs.writeFileSync(path.join(pkg, "study-guide", "melting.md"), Buffer.concat([Buffer.from(read(pkg, "study-guide/melting.md")), Buffer.from([0x43, 0x61, 0x66, 0xe9, 0x0a])]));
  assert.ok(JSON.stringify(gate(pkg).json.contract.layout.errors).includes("UTF-8"));
});

test("L9 · NFC and NFD spellings of one label are one term", () => {
  const nfc = "café au lait", nfd = "café au lait";
  const report = buildTermsReport([{ scope: "a", text: `## Key terms\n- **${nfc}** — a drink\n` }, { scope: "b", text: `## Key terms\n- **${nfd}** — a drink\n` }], null);
  assert.equal(report.terms.terms.length, 1);
});
