// The blind link and level review (Control C2, C3, C5 fidelity; operator 2026-10-03). Offline: reviewer answers are
// replayed through the real review path and the real MS9 module.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { loadUnits, linkUnits } from "../scripts/lib/core/obligations.mjs";
import { claimAuthorship, beginSession } from "../scripts/lib/core/units_index.mjs";
import { indexAndStamp } from "../scripts/lib/core/obligations.mjs";
import { runCheckpoint } from "../scripts/lib/skeleton/runner.mjs";
import { replayVerifier } from "../scripts/lib/verify/dispatch.mjs";
import { reviewAlignment, planOf } from "../scripts/lib/verify/alignment.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
function copy(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-align-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(C2, path.join(dir, "pkg"), { recursive: true });
  const root = path.join(dir, "pkg");
  return { root, reader: () => liveReader(root) };
}
const trialReg = { schemaVersion: 1, __noStandard: true, modules: [{ name: "ms9-alignment", version: "1.0.0", maturity: "trial", enabled: true }] };
const ms9 = (p) => runCheckpoint({ root: p.root, checkpoint: "V8", profile: "public", registry: trialReg }).findings.filter((f) => f.module === "ms9-alignment");
const nonceOf = (pr) => pr.match(/"nonce": "([0-9a-f]+)"/)[1];
const declaredOf = (pr) => pr.split("\nDECLARED ITEMS\n")[1].split("\n\n")[0].split("\n").map((l) => l.replace(/^- /, ""));
const answering = (fn) => { const seen = []; return { seen, verifier: replayVerifier((pr) => { seen.push(pr); return { nonce: nonceOf(pr), ...fn(pr, declaredOf(pr)) }; }) }; };
const units = (p) => loadUnits(p.root, p.reader());

test("[req.control.link-review] a declared link the unit does not teach is a question for the agent; the reviewer reads the unit with its links and the chapter's plan", async (t) => {
  const p = copy(t);
  const u = units(p).find((x) => x.id === "u-study-guide-le-chatelier-the-principle-1");
  const { seen, verifier } = answering((pr, declared) => ({ links: declared.map((id) => ({ id, verdict: id.startsWith("concept.") ? "no" : "yes", why: "the passage states the principle but does not define it" })), also: ["objective.le-chatelier.predict-concentration-shift"], offPlan: false }));
  const r = await reviewAlignment(p.root, p.reader(), { verifier, only: [u.id] });
  assert.equal(r.length, 1); assert.equal(r[0].status, "reviewed");
  assert.match(seen[0], /THE CHAPTER'S PLAN\n- [a-z]+\.le-chatelier\./); assert.match(seen[0], /DECLARED ITEMS\n- objective\.le-chatelier\.state-principle/);
  assert.ok(!/guide entry asks for/.test(seen[0]), "a teaching paragraph is not asked about assessment fidelity");
  const f = ms9(p);
  assert.deepEqual(f.map((x) => `${x.kind}:${x.statusClass}:${x.route}`), ["link-doubtful:question:agent"]);
  assert.match(f[0].evidence.note, /linked to concept\.le-chatelier\.principle-statement but does not deal with it/);
  assert.deepEqual(f[0].evidence.suggested, ["objective.le-chatelier.predict-concentration-shift"]);
  // relinking the unit makes the review history: the question is gone until the unit is reviewed again
  linkUnits(p.root, p.reader(), { [u.id]: ["objective.le-chatelier.state-principle"] }, AGENT);
  assert.deepEqual(ms9(p), []);
});

test("[req.control.link-review] a unit that teaches nothing in the plan is the instructor's question (keep or drop); 'in passing' raises nothing", async (t) => {
  const p = copy(t);
  const u = units(p).find((x) => x.id === "u-study-guide-le-chatelier-the-principle-2");
  await reviewAlignment(p.root, p.reader(), { verifier: answering((pr, d) => ({ links: d.map((id) => ({ id, verdict: "passing", why: "" })), also: [], offPlan: false })).verifier, only: [u.id] });
  assert.deepEqual(ms9(p), [], "touching a node in passing is fine (overview paragraphs touch many)");
  await reviewAlignment(p.root, p.reader(), { verifier: answering((pr, d) => ({ links: d.map((id) => ({ id, verdict: "no", why: "about something else" })), also: [], offPlan: true })).verifier, only: [u.id] });
  const kinds = ms9(p).map((x) => `${x.kind}:${x.route}`).sort();
  assert.ok(kinds.includes("off-spine:digest"));
});

test("[req.control.level-review] a practice question not of its guide entry's type or level is a question: the agent's in agent text, the instructor's in theirs", async (t) => {
  const p = copy(t);
  const q = units(p).find((x) => x.form === "question" && (x.spineNodes || []).some((n) => n.startsWith("guide.")));
  const g = planOf(p.reader()).nodes.get(q.spineNodes.find((n) => n.startsWith("guide.")));
  const { seen, verifier } = answering((pr, d) => ({ links: d.map((id) => ({ id, verdict: "yes", why: "" })), also: [], offPlan: false, fidelity: { type: "matches", level: "differs", why: "it asks only for recall" } }));
  await reviewAlignment(p.root, p.reader(), { verifier, only: [q.id] });
  assert.match(seen[0], new RegExp(`assessment guide entry asks for: ${String(g.type).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} at the level`));
  let f = ms9(p);
  assert.deepEqual(f.map((x) => `${x.kind}:${x.route}`), ["assessment-fidelity:agent"]); assert.match(f[0].evidence.note, /not the level its guide entry asks for/);
  // the same question as the instructor's own text: theirs to change (D31)
  const file = path.join(p.root, q.locator.deliverable);
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(q.text, () => `${q.text} (My wording.)`));
  indexAndStamp(p.root, p.reader(), {});
  const q2 = units(p).find((x) => x.text.endsWith("(My wording.)"));
  claimAuthorship(p.root, { units: [q2.id], instructorWords: "That question is mine." }, I);
  await reviewAlignment(p.root, p.reader(), { verifier, only: [q2.id] });
  f = ms9(p).filter((x) => x.units.includes(q2.id));
  assert.deepEqual(f.map((x) => `${x.kind}:${x.route}`), ["assessment-fidelity-instructor:digest"]);
});

test("[req.control.link-review] MS9 is a trial standard module: it runs for every package, never blocks, and a registry that predates it is not 'dropping' it", async (t) => {
  const std = JSON.parse(fs.readFileSync(path.join(HERE, "..", "scripts", "modules", "standard.json"), "utf8"));
  assert.ok(std.modules.some((m) => m.name === "ms9-alignment" && m.maturity === "trial"));
  const p = copy(t);
  const old = { schemaVersion: 1, modules: std.modules.filter((m) => m.name !== "ms9-alignment") };
  const r = runCheckpoint({ root: p.root, checkpoint: "V8", profile: "public", registry: old });
  assert.ok(!r.findings.some((f) => f.kind === "standard-module-dropped"), "a trial module a registry predates is added, not dropped");
  assert.ok(r.wiring.ran.some((m) => m.name === "ms9-alignment"), "and it runs");
});
