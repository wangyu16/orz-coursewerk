// THE STABLE MODULES (redesign P6): each one catches its planted fault with the declared class, and stays silent on the
// clean, approved C2 package. Modules run as in production — each in its own process, through the runner.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCheckpoint } from "../scripts/lib/skeleton/runner.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const C2_V012 = path.join(HERE, "fixtures", "c2-chemistry");
const INPUTS = path.join(C2_V012, "inputs");
// one module at a time (test-only flag: the standard-registry rule would otherwise add the other six)
const reg = (...names) => ({ schemaVersion: 1, __noStandard: true, modules: names.map((name) => ({ name, version: "1.0.0", maturity: "stable", enabled: true })) });
function copy(t, from = C2) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-ms-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(from, path.join(dir, "pkg"), { recursive: true }); fs.cpSync(INPUTS, path.join(dir, "inputs"), { recursive: true });
  const root = path.join(dir, "pkg"), inputs = path.join(dir, "inputs");
  return { root, inputs, edit: (rel, fn, base = root) => { const f = path.join(base, rel); fs.writeFileSync(f, fn(fs.readFileSync(f, "utf8"))); } };
}
const run = (p, name, o = {}) => runCheckpoint({ root: p.root, checkpoint: o.checkpoint || "V8", profile: o.profile || "public", registry: reg(name), inputsDir: o.inputs === undefined ? p.inputs : o.inputs });
const found = (r, name) => r.findings.filter((f) => f.module === name).map((f) => `${f.kind}:${f.statusClass}`).sort();

test("[req.ms1.pin-all] [req.ms1.span] [req.ms1.profiles] MS1: unpinned, changed and unrecorded sources, and units citing undeclared sources", (t) => {
  const p = copy(t);
  assert.deepEqual(found(run(p, "ms1-sources"), "ms1-sources"), [], "clean");
  assert.deepEqual(found(run(p, "ms1-sources", { inputs: null }), "ms1-sources"), ["source-corpus-missing:obligation"]);
  p.edit(".coursewerk-source-text/wikipedia-anchor.txt", (x) => x + "\nedited", p.inputs);
  assert.deepEqual(found(run(p, "ms1-sources"), "ms1-sources"), ["source-snapshot-changed:defect"]);
  const q = copy(t);
  q.edit("SOURCE_CORPUS.json", (x) => { const c = JSON.parse(x); c.sources = c.sources.slice(0, 1); return JSON.stringify(c); }, q.inputs);
  assert.deepEqual(found(run(q, "ms1-sources"), "ms1-sources"), ["source-record-mismatch:defect", "source-unpinned:obligation"]);
  const u = copy(t);
  u.edit("metadata/units/study-guide/chemical-equilibrium.md.json", (x) => { const s = JSON.parse(x); s.units[0].evidence = [{ type: "quote-verified", source: "a-textbook-never-declared" }]; return JSON.stringify(s); });
  assert.deepEqual(found(run(u, "ms1-sources", { profile: "private" }), "ms1-sources"), ["evidence-source-undeclared:defect"], "runs in private packages too");
});

test("[req.ms2.public-only] [req.ms2.two-profiles] MS2: rights problems in public packages; skipped in private", (t) => {
  const p = copy(t);
  assert.deepEqual(found(run(p, "ms2-rights"), "ms2-rights"), [], "clean");
  p.edit("LICENSE", (x) => x.replace("Attribution-ShareAlike", "Attribution-NoDerivatives"));
  assert.deepEqual(found(run(p, "ms2-rights"), "ms2-rights"), ["rights-publication-requirement:obligation"]);
  assert.equal(run(p, "ms2-rights", { profile: "private" }).wiring.skipped[0].reason, "profile");
  const q = copy(t);
  q.edit("metadata/FOUNDATION.json", (x) => { const f = JSON.parse(x); delete f.sources[0].rightsBasis; return JSON.stringify(f); });
  const r = run(q, "ms2-rights").findings.filter((f) => f.kind === "rights-source-blocker");
  assert.ok(r.length >= 1); assert.equal(r[0].route, "interrupt"); assert.equal(r[0].interruptReason, "rights-blocker");
});

test("[req.ms3.contract] [req.retire.old-checks] MS3: syntax, placeholders and layout are defects; the word tests and the photograph's human review are retired", (t) => {
  const p = copy(t);
  assert.deepEqual(found(run(p, "ms3-format"), "ms3-format"), [], "clean");
  p.edit("study-guide/chemical-equilibrium.md", (x) => x.replace(":::info\n", ":::info\n[VERIFY: finish this]\n").replace(/\n:::\n\n## The equilibrium constant/, "\n\n## The equilibrium constant"));
  fs.writeFileSync(path.join(p.root, "notes.txt"), "stray");
  const f = run(p, "ms3-format").findings.map((x) => x.evidence.rule).sort();
  assert.ok(f.includes("orz-syntax") && f.includes("placeholder") && f.includes("package-layout"), f.join(","));
  const q = copy(t);
  q.edit("practice/chemical-equilibrium.md", (x) => x.replace(/\*\(Objective \d\)\*/g, "").replace(/objective/gi, "goal"));
  assert.deepEqual(found(run(q, "ms3-format"), "ms3-format"), [], "the objective-word test no longer exists: coverage is the core's");
});

test("[req.ms3.contract] MS3: slide decks must carry valid orz-slides notation — templates, variants, layouts, regions; a theme the frame lacks is a note, never a defect (D36)", (t) => {
  // D52: the deck config is the format-1 header, and the notation is read by orz-slides' own readDocument
  const p = copy(t);
  p.edit("slides/le-chatelier.md", (x) => x.replace("theme: paper\n", "theme: midnight\n").replace("<!-- slide template=outline -->", "<!-- slide template=outline v=9 -->")
    .replace(/<!-- slide -->\n## Partially counteract/, "<!-- slide col 2/1 { main; side; extra } -->\n<!-- @aside -->\n## Partially counteract"));
  const issues = run(p, "ms3-format").findings.filter((f) => f.evidence.rule === "framework-notation").map((f) => f.evidence.issue).join("\n");
  assert.doesNotMatch(issues, /midnight|v=9|unknown-theme/, "a theme, or a name a newer frame may know, never blocks (D36, D38)");
  const notes = run(p, "ms3-format").findings.filter((f) => f.kind === "frame-name-unknown");
  assert.ok(notes.length >= 2 && notes.every((f) => f.statusClass === "question" && f.route === "agent"));
  assert.match(notes.map((f) => f.evidence.note).join("\n"), /theme is not one of this kind's themes[^]*\[unknown-theme\]/);
  assert.match(notes.map((f) => f.evidence.note).join("\n"), /v=9: the outline template has variants 1 to 3/);
  assert.match(issues, /col 2\/1 \{ main; side; extra \}": 2 tracks for 3 items/, "grammar that cannot render stays a defect");
  assert.match(issues, /the layout has no region "aside"[^]*\[unknown-region\]/, "a region the frame drops is a defect");
});

test("[req.ms4.links] MS4: broken links and missing assets are defects; unresolved external links and unrecorded assets are obligations", (t) => {
  const p = copy(t);
  assert.deepEqual(found(run(p, "ms4-links"), "ms4-links"), [], "clean");
  p.edit("study-guide/le-chatelier.md", (x) => x.replace("## The principle", "## The principle\n\nSee [the other chapter](../study-guide/missing.md) and [Wikipedia](https://en.wikipedia.org/wiki/Le_Chatelier%27s_principle).\n"));
  fs.mkdirSync(path.join(p.root, "assets"), { recursive: true }); fs.writeFileSync(path.join(p.root, "assets", "photo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  assert.deepEqual(found(run(p, "ms4-links"), "ms4-links"), ["asset-unrecorded:obligation", "external-link-unresolved:obligation", "link-broken:defect"]);
});

test("[req.ms6.quotations] MS6: an unfound quotation is an obligation, a misquoted attributed passage a defect, copying a defect in public packages only", (t) => {
  const p = copy(t);
  assert.deepEqual(found(run(p, "ms6-quotations"), "ms6-quotations"), [], "clean");
  const src = fs.readFileSync(path.join(p.inputs, ".coursewerk-source-text", "wikipedia-anchor.txt"), "utf8").replace(/\s+/g, " ");
  const copied = src.split(" ").slice(200, 232).join(" ");
  p.edit("study-guide/chemical-equilibrium.md", (x) => x.replace("## Dynamic equilibrium\n", `## Dynamic equilibrium\n\nAs one chemist put it, "equilibrium is the quiet hum of a thousand reactions that never rest."\n\n> Equilibrium is reached only when every molecule has stopped reacting for good.\n> — Wikipedia, Chemical equilibrium\n\n${copied}\n`));
  assert.deepEqual(found(run(p, "ms6-quotations"), "ms6-quotations"), ["misquotation:defect", "near-verbatim:defect", "quotation-unfound:obligation"]);
  assert.deepEqual(found(run(p, "ms6-quotations", { profile: "private" }), "ms6-quotations"), ["misquotation:defect", "quotation-unfound:obligation"], "copying is a rights matter: public only");
});

test("[req.ms6.h5-regression] MS6: the 21 v0.12 false positives on the completed C2 package raise nothing", (t) => {
  const baseline = JSON.parse(fs.readFileSync(path.join(C2_V012, "BASELINE-v0.12.0.json"), "utf8"));
  assert.equal(baseline.falsePositives.length, 21);
  const p = copy(t, path.join(C2_V012, "package"));
  assert.deepEqual(run(p, "ms6-quotations").findings.filter((f) => f.module === "ms6-quotations"), []);
});

test("[req.ms7.consistency] [req.ms7.no-drift] MS7: a value disagreement and an impossible quantity are defects; a reworded definition raises nothing", (t) => {
  const p = copy(t);
  assert.deepEqual(found(run(p, "ms7-consistency"), "ms7-consistency"), [], "clean");
  p.edit("study-guide/chemical-equilibrium.md", (x) => x.replace("The forward and reverse rates are generally **not zero**", "Cooled to -40 K, the forward and reverse rates are generally **not zero**"));
  p.edit("metadata/units/study-guide/chemical-equilibrium.md.json", (x) => x); // the index is the agent's job; MS7 reads units by their recorded lines
  const r = found(run(p, "ms7-consistency"), "ms7-consistency");
  assert.ok(r.includes("implausible-quantity:defect"), r.join(","));
  const m = copy(t);
  m.edit("study-guide/chemical-equilibrium.md", (x) => x.replace("The forward and reverse rates are generally **not zero**", "Cooled to −40 K (a Unicode minus), the forward and reverse rates are generally **not zero**"));
  assert.ok(found(run(m, "ms7-consistency"), "ms7-consistency").includes("implausible-quantity:defect"), "a Unicode minus is still a minus");
  const q = copy(t);
  q.edit("concepts/chemical-equilibrium.md", (x) => x.replace("the state of a reversible reaction in which forward and reverse rates are equal and concentrations no longer change", "the condition of a reversible reaction where the forward and reverse rates match and concentrations stop changing"));
  assert.ok(!run(q, "ms7-consistency").findings.some((f) => /definition/.test(f.kind)));
});

test("[req.ms5.offline] carriers are not a deliverable: MS5 is an optional preview that can only ask, and assembly is documented", (t) => {
  const p = copy(t);
  // offline and deterministic: the harness's installed frames, never the registry (the test runs with or without npm test)
  const was = process.env.COURSEWERK_FRAMES; process.env.COURSEWERK_FRAMES = "installed";
  t.after(() => { if (was === undefined) delete process.env.COURSEWERK_FRAMES; else process.env.COURSEWERK_FRAMES = was; });
  const r = runCheckpoint({ root: p.root, checkpoint: "V8", profile: "public", registry: { schemaVersion: 1, __noStandard: true, modules: [{ name: "ms5-carriers", version: "1.0.0", maturity: "experimental", enabled: true }] }, inputsDir: p.inputs });
  assert.deepEqual(found(r, "ms5-carriers"), [], "the C2 carriers build");
  const std = JSON.parse(fs.readFileSync(path.join(HERE, "..", "scripts", "modules", "standard.json"), "utf8"));
  assert.ok(!std.modules.some((m) => m.name === "ms5-carriers"), "not in the standard registry");
  const doc = fs.readFileSync(path.join(HERE, "..", "docs", "assembling-carriers.md"), "utf8");
  for (const needle of ["orz-mdhtml", "orz-slides", "orz-paged", "Alembic", "build_carriers.mjs", "not** a Coursewerk"]) assert.ok(doc.includes(needle), needle);
});

test("[req.modules.manifest] the standard registry: a package without one runs every stable module; dropping one needs the instructor's logged decision", async (t) => {
  const { readRegistry } = await import("../scripts/lib/records/registry.mjs");
  const { disableModule } = await import("../scripts/lib/skeleton/promotion.mjs");
  const p = copy(t);
  fs.rmSync(path.join(p.root, "metadata", "modules.json"), { force: true });
  const std = readRegistry(p.root);
  assert.equal(std.standard, true); assert.equal(std.modules.length, 9); assert.equal(std.modules.filter((m) => m.maturity === "stable").length, 8); // D54 added ms10-copying
  fs.writeFileSync(path.join(p.root, "metadata", "modules.json"), JSON.stringify({ schemaVersion: 1, __noStandard: true, standard: true, modules: std.modules.filter((m) => m.name !== "ms6-quotations") }));
  const fromFile = readRegistry(p.root);
  assert.equal(fromFile.__noStandard, undefined); assert.equal(fromFile.standard, undefined);
  const r = runCheckpoint({ root: p.root, checkpoint: "V3", profile: "public", registry: fromFile, inputsDir: p.inputs });
  assert.ok(r.findings.some((f) => f.kind === "standard-module-dropped" && f.statusClass === "defect" && f.evidence.module === "ms6-quotations"));
  assert.ok(r.wiring.ran.some((x) => x.name === "ms6-quotations"), "the dropped module runs anyway");
  assert.throws(() => disableModule(p.root, { name: "ms6-quotations", reason: "x" }, { role: "agent", name: "a", model: "m" }), /instructor's decision/);
  disableModule(p.root, { name: "ms6-quotations", reason: "this course quotes nothing and has no pinned source" }, { role: "instructor", name: "Yu Wang (wangyu16)" });
  const r2 = runCheckpoint({ root: p.root, checkpoint: "V3", profile: "public", registry: readRegistry(p.root), inputsDir: p.inputs });
  assert.ok(!r2.findings.some((f) => f.kind === "standard-module-dropped"));
});

// ---- found by the P11 wiring sweep ----------------------------------------------------------------------------------
test("[req.ms7.consistency] MS7 reads the package's LaTeX quantities: a disagreement written as $\\Delta H = …\\ \\text{kJ}$ is caught", (t) => {
  const p = copy(t);
  assert.deepEqual(found(run(p, "ms7-consistency"), "ms7-consistency"), [], "clean");
  p.edit("slides/le-chatelier.md", (x) => x.replace("pushes the equilibrium away from the side where heat sits.", "pushes the equilibrium away from the side where heat sits. The ammonia synthesis is an exothermic reaction, with $\\Delta H = -92.2\\ \\text{kJ}$."));
  p.edit("practice/le-chatelier.md", (x) => x.replace("falls at higher temperature.", "falls at higher temperature. The ammonia synthesis is an exothermic reaction ($\\Delta H = -46.1\\ \\text{kJ}$)."));
  assert.ok(found(run(p, "ms7-consistency"), "ms7-consistency").includes("value-disagreement:defect"));
});

test("[req.ms3.contract] MS3: a $$ display equation that is never closed is a defect (it would swallow the units after it)", (t) => {
  const p = copy(t);
  assert.ok(!run(p, "ms3-format").findings.some((f) => f.evidence.rule === "math-delimiters"), "clean");
  p.edit("study-guide/le-chatelier.md", (x) => x.replace(/\$\$\n/, "\n"));
  const f = run(p, "ms3-format").findings.find((x) => x.evidence.rule === "math-delimiters");
  assert.ok(f && f.statusClass === "defect"); assert.match(f.evidence.issue, /opens here and is never closed/);
});

test("[req.modules.wiring-report] a malformed unit sidecar does not crash MS7 or MS8", (t) => {
  const p = copy(t);
  fs.writeFileSync(path.join(p.root, "metadata", "units", "stub.json"), JSON.stringify({ schemaVersion: 1, units: [] }));
  for (const m of ["ms7-consistency", "ms8-verdicts"]) assert.ok(!run(p, m).findings.some((f) => f.kind === "module-failed"), `${m} survives`);
});
