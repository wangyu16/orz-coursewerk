// Round-4 PROBES — the round-3 fixes re-attacked. Each failed before its fix.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scanConsistency } from "../scripts/lib/consistency.mjs";
import { spineCycles, buildSpine } from "../scripts/lib/spine.mjs";
import { identityProblem } from "../scripts/lib/identity.mjs";
import { normalizeEvidenceText } from "../scripts/lib/rights_preflight.mjs";
import { auditKeyFactReview, makeKeyFactBindings } from "../scripts/lib/key_fact_review.mjs";
import { blindBundleDigest } from "../scripts/lib/blind_bundle.mjs";
import { acceptBaseline } from "./helpers/baseline.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(REPO, "tests", "fixtures", "usage-package");
const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const cli = (script, a) => { const r = spawnSync(process.execPath, [path.join(REPO, "scripts", script), ...a], { cwd: REPO, encoding: "utf8", env: ENV }); return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" }; };
const git = (cwd, ...a) => spawnSync("git", a, { cwd, encoding: "utf8", env: ENV });
const read = (pkg, rel) => fs.readFileSync(path.join(pkg, rel), "utf8");
const write = (pkg, rel, t) => fs.writeFileSync(path.join(pkg, rel), t);
function pkgCopy(t, { indexed = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-audit4-"));
  const pkg = path.join(dir, "package");
  fs.cpSync(FIXTURE, pkg, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(pkg, "init", "-q", "."); git(pkg, "add", "-A"); git(pkg, "commit", "-qm", "baseline");
  if (indexed) { assert.equal(cli("index_components.mjs", ["--root", pkg, "--initialize"]).code, 0); assert.equal(cli("index_semantic.mjs", ["--root", pkg]).code, 0); }
  return { dir, pkg };
}
function gate(pkg, extra = []) { const json = path.join(pkg, "..", `qa-${Math.random().toString(36).slice(2)}.json`); const r = cli("check_oer.mjs", ["--package", pkg, "--json", json, ...extra]); return { ...r, json: JSON.parse(fs.readFileSync(json, "utf8")) }; }
const queueKinds = (r) => (r.json.semantic?.queue?.items ?? []).map((i) => `${i.kind}:${i.severity}`);
const terms = { terms: [{ id: "term.melting-point", preferredLabel: "melting point", aliases: [], scope: ["melting"] }] };
const claim = (id, text, type = "fact", extra = {}) => ({ id, type, text, scope: "melting", termRefs: ["term.melting-point"], spineRefs: [], sourceRefs: [], locations: [{ file: `${id}.md`, anchor: "x#1", offset: 0 }], fingerprints: {}, provenanceDeclared: true, ...extra });

test("R4-1 · a restated objective under `## Goals` (declared as a fact) does not cover it", (t) => {
  const { pkg } = pkgCopy(t);
  // remove objective 2's teaching claim, then restate the objective under a heading the old regex never knew
  const sidecar = path.join(pkg, "metadata/claims/practice/melting.json");
  const decl = JSON.parse(fs.readFileSync(sidecar, "utf8"));
  decl.claims = decl.claims.filter((c) => !(c.spineRefs || []).includes("objective.melting.2"));
  fs.writeFileSync(sidecar, JSON.stringify(decl, null, 2));
  const map = read(pkg, "concepts/melting.md");
  const objective2 = /## Objectives\n1\. .*\n2\. (.*)\n/.exec(map)[1].replace(/ \[anchor: [a-z0-9-]+\]$/, "");
  write(pkg, "study-guide/melting.md", read(pkg, "study-guide/melting.md") + `\n## Goals\n1. ${objective2}\n`);
  const sg = path.join(pkg, "metadata/claims/study-guide/melting.json");
  const sgDecl = JSON.parse(fs.readFileSync(sg, "utf8"));
  sgDecl.claims.push({ type: "fact", anchor: "goals#1", spineRefs: ["objective.melting.2"], sourceRefs: [], termRefs: ["term.latent-heat-of-fusion"] });
  fs.writeFileSync(sg, JSON.stringify(sgDecl, null, 2));
  const r = gate(pkg);
  assert.ok(r.json.semantic.coverageBlocks >= 1, `a restatement anywhere is not teaching: ${queueKinds(r).join(", ")}`);
});

test("R4-2 · SVG image href, <link>, <script> and the {{youtube}} directive are remote media; a fenced example is not", (t) => {
  const { pkg } = pkgCopy(t, { indexed: false });
  const forms = ['{{youtube dQw4w9WgXcQ}}', '<svg><image href="https://evil.example.com/x.png"></svg>', '<link rel="stylesheet" href="https://evil.example.com/s.css">', '<script src="https://evil.example.com/s.js"></script>', '<use xlink:href="https://evil.example.com/sprite.svg#a"></use>'];
  write(pkg, "study-guide/melting.md", read(pkg, "study-guide/melting.md") + "\n\n" + forms.join("\n\n") + "\n\n```html\n<img src=\"https://example.com/in-a-fence.png\">\n```\n");
  const r = gate(pkg);
  assert.equal(r.json.criticalCounts.remoteMediaReferences, 5, JSON.stringify(r.json.links?.remoteMedia ?? r.json.criticalCounts));
});

test("R4-3 · an answer stating two different values is an ambiguous-answer decision — neither trusted nor refused as a contradiction", () => {
  const truth = claim("claim.a", "At standard pressure the melting point of pure water is 0 °C.");
  const sneaky = claim("claim.b", ":::: tabs\n::: tab Q 1\nWhat is it?\n:::\n::: tab Answer 1\nRecall that 0 °C is the reference value; the melting point of pure water is therefore 5 °C.\n:::\n::::", "answer-key");
  const honest = claim("claim.c", ":::: tabs\n::: tab Q 2\nWhat is it?\n:::\n::: tab Answer 2\nNot 5 °C, as some guess: the melting point of pure water is 0 °C.\n:::\n::::", "answer-key");
  for (const c of [sneaky, honest]) {
    const f = scanConsistency({ claims: [truth, c] }, terms);
    assert.ok(f.some((x) => x.kind === "ambiguous-answer" && x.claimIds.includes(c.id)), `${c.id}: ${JSON.stringify(f.map((x) => x.kind))}`);
    assert.ok(!f.some((x) => x.kind === "value-disagreement"), `${c.id}: never a guessed contradiction`);
  }
  // and a clean single-valued wrong answer is still a contradiction
  const wrong = claim("claim.d", ":::: tabs\n::: tab Q 3\nWhat is it?\n:::\n::: tab Answer 3\n7 °C.\n:::\n::::", "answer-key");
  assert.ok(scanConsistency({ claims: [truth, wrong] }, terms).some((x) => x.kind === "value-disagreement"));
});

test("R4-4 · scan-found worked answers carry only the dimensions declared claims give the term", () => {
  const truth = claim("claim.a", "At standard pressure the melting point of pure water is 0 °C.");
  const worked1 = claim("claim.w1", "How much energy melts 10 g of ice already at its melting point? 334 J/g times 10 g is 3340 J.", "fact", { provenanceDeclared: false });
  const worked2 = claim("claim.w2", "How much energy melts 250 g of ice already at its melting point? 334 J/g times 250 g is 83500 J.", "fact", { provenanceDeclared: false });
  assert.deepEqual(scanConsistency({ claims: [truth, worked1, worked2] }, terms).filter((f) => f.kind === "value-disagreement"), [], "energy answers are not temperature assertions about the melting point");
});

test("R4-5 · index:semantic refuses to accept a relabeled objective that still carries declared claims, unless acknowledged", (t) => {
  const { pkg } = pkgCopy(t);
  const map = read(pkg, "concepts/melting.md");
  write(pkg, "concepts/melting.md", map.replace("State the melting point of pure water", "State the boiling point of pure water"));
  gate(pkg); // the accept step consumes the last gate run's queue (option 1)
  const refused = cli("index_semantic.mjs", ["--root", pkg]);
  assert.equal(refused.code, 3, refused.stderr);
  // deciding the queue is not enough: the relabel must ALSO be acknowledged by id
  const undecidedRelabel = acceptBaseline(REPO, pkg).accept;
  assert.equal(undecidedRelabel.code, 3); assert.match(undecidedRelabel.stderr, /objective\.melting\.1/);
  const accepted = acceptBaseline(REPO, pkg, { acceptArgs: ["--acknowledge-relabel", "objective.melting.1"] }).accept;
  assert.equal(accepted.code, 0, accepted.stderr);
});

test("R4-6 · a key fact that NEGATES the package is refused", (t) => {
  const { pkg } = pkgCopy(t, { indexed: false });
  const foundation = JSON.parse(read(pkg, "metadata/FOUNDATION.json"));
  const review = { schemaVersion: 1, mode: "light", reviewKind: "same-model-independent-pass", authoringSystem: "author", authoringModelId: "m1", reviewer: { type: "ai", name: "reviewer", modelId: "m1" },
    independence: { separatePass: true, contextReset: true, bundleSha256: blindBundleDigest(pkg), approach: "A fresh context reviewed only the assembled bundle after drafting ended." }, reviewedAt: "2026-09-05",
    checks: ["accountable-identity", "source-identity-version", "source-license-evidence", "external-media-rights", "output-license-compatibility", "attribution-obligations", "scientific-key-facts"].map((id) => ({ id, status: "passed", note: `Examined ${id} against the bundle; nothing to qualify.` })),
    keyFacts: [{ id: "fact-1", claim: "At standard pressure the melting point of pure water is not 0 °C.", status: "verified", evidenceSourceIds: [foundation.sources[0].id], usedIn: ["study-guide/melting.md"], note: "Traced against the bundle and the declared source; consistent." }] };
  write(pkg, "metadata/KEY_FACT_REVIEW.json", JSON.stringify({ ...review, bindings: makeKeyFactBindings(pkg) }));
  const audit = auditKeyFactReview(pkg, foundation);
  assert.ok(audit.failures.some((f) => /NEGATION/.test(f)), audit.failures.join("\n"));
  review.keyFacts[0].claim = "At standard pressure the melting point of pure water is 0 °C.";
  review.checks[0].note = "Examined accountable-identity: no vendor or placeholder identity is present in the bundle.";
  write(pkg, "metadata/KEY_FACT_REVIEW.json", JSON.stringify({ ...review, bindings: makeKeyFactBindings(pkg) }));
  assert.deepEqual(auditKeyFactReview(pkg, foundation).failures.filter((f) => /NEGATION|placeholder/.test(f)), [], "a genuine note may use the word placeholder");
});

test("R4-7 · self-referential prerequisite, hidden evidence text, and more AI-vendor identities", () => {
  const spine = buildSpine([{ scope: "ch2", file: "concepts/ch2.md", text: "## Objectives\n1. Know A.\n\n## Concept sequence\n1. A first.\n2. B second. [prereq: concept.ch2.2]\n\n## Key terms\n- **alpha** — a\n" }]);
  assert.deepEqual(spineCycles(spine), [["concept.ch2.2"]]);
  const hidden = normalizeEvidenceText('<html><body><p style="display:none">Attribution 4.0</p><noscript>Attribution 4.0</noscript><div hidden>Attribution 4.0</div><p>Commercial.</p></body></html>');
  assert.ok(!/attribution 4\.0/i.test(hidden), hidden);
  for (const bad of ["AI Reviewer", "Automated pipeline", "Reviewer bot", "Grok", "Qwen", "Codex", "Opus", "Sonnet 4.5", "Fable 5.1", "ClaudeCode"]) assert.ok(identityProblem(bad), bad);
});

test("R4-8 · OPTION 1: accepting a baseline consumes the decided queue — refused without a gate run, with a stale queue, or with an undecided item", (t) => {
  const { pkg, dir } = pkgCopy(t);
  // an edit that queues a review item
  write(pkg, "study-guide/melting.md", read(pkg, "study-guide/melting.md").replace("pure water is 0 °C.", "pure water is 5 °C."));
  git(pkg, "add", "-A"); git(pkg, "commit", "-qm", "edit");
  // (a) no gate since the edit → the stored queue is stale
  const stale = cli("index_semantic.mjs", ["--root", pkg]);
  assert.equal(stale.code, 3); assert.match(stale.stderr, /STALE|no review queue/);
  // (b) gate ran, items pending, no sheet
  const g = gate(pkg);
  assert.ok((g.json.semantic.queue.items ?? []).some((i) => i.severity !== "info"), "the edit queues something to decide");
  const undecided = cli("index_semantic.mjs", ["--root", pkg]);
  assert.equal(undecided.code, 3); assert.match(undecided.stderr, /await a decision/);
  // (c) a sheet with an empty decision is still undecided
  const sheetFile = path.join(dir, "reports", "queue-review.json");
  fs.mkdirSync(path.dirname(sheetFile), { recursive: true });
  assert.equal(cli("queue_review.mjs", ["--root", pkg, "--out", sheetFile]).code, 0);
  const sheet = JSON.parse(fs.readFileSync(sheetFile, "utf8"));
  assert.ok(sheet.decisions.length > 0 && sheet.decisions.every((d) => d.id && d.decision === ""));
  const half = cli("index_semantic.mjs", ["--root", pkg, "--review", sheetFile]);
  assert.equal(half.code, 3); assert.match(half.stderr, /still undecided/);
  // (d) every row decided with a real note → accepted, and the commit names the review
  for (const d of sheet.decisions) { d.decision = "accepted"; d.note = "The new value is the instructor's deliberate correction; downstream answer keys were re-derived."; }
  fs.writeFileSync(sheetFile, JSON.stringify(sheet));
  const ok = cli("index_semantic.mjs", ["--root", pkg, "--review", sheetFile]);
  assert.equal(ok.code, 0, ok.stderr);
  assert.match(git(pkg, "log", "-1", "--format=%s").stdout, /accept semantic baseline \(review [0-9a-f]{12}: \d+ decided\)/);
  // (e) a sheet answering an OLDER queue is refused after the gate runs again
  gate(pkg);
  const again = cli("index_semantic.mjs", ["--root", pkg, "--review", sheetFile]);
  assert.ok(again.code === 0 || /DIFFERENT queue/.test(again.stderr), again.stderr); // clean queue → nothing pending → accepted; pending → old sheet refused
});
