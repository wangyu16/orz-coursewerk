// Carried over from earlier Coursewerk (owner 2026-11-03): the instructor records once, in their words, that the
// package was developed, approved and checked under the earlier Coursewerk, bound to a baseline delivery's exact text.
// Then unchanged plans are approved (marked carried over), unchanged units' four obligation kinds are non-blocking notes
// labelled carried over, and whatever changed since owes everything under the 1.0 rules. On the real C2 package.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { liveReader } from "../scripts/lib/core/package_reader.mjs";
import { beginSession } from "../scripts/lib/core/units_index.mjs";
import { coreObligations, indexAndStamp, loadUnits, openVersionCarrying } from "../scripts/lib/core/obligations.mjs";
import { unitHash } from "../scripts/lib/core/segment.mjs";
import { parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { evaluateGate } from "../scripts/lib/skeleton/gate.mjs";
import { runGate } from "../scripts/lib/skeleton/full_gate.mjs";
import { checkedRecord } from "../scripts/lib/core/site_export.mjs";
import { applyCarriedOver, buildBaseline, carryOver, writeBaseline, CARRIED_KINDS, CARRY_DIR } from "../scripts/lib/core/carry_over.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const I = { role: "instructor", name: "Yu Wang (wangyu16)" };
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const WORDS = "This course was developed, approved and checked under the earlier Coursewerk; carry it over as of this delivery.";

function copy(t) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-carry-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  return { dir, root, reader: liveReader(root) };
}
/** A unit's text edited by the agent, in a session, and indexed (the harness's way). */
function edit(p, u) {
  beginSession(p.root, p.reader, AGENT);
  const f = path.join(p.root, u.locator.deliverable), text = fs.readFileSync(f, "utf8");
  assert.ok(text.includes(u.text), `the text of ${u.id} is in its file`);
  fs.writeFileSync(f, text.replace(u.text, u.text.replace(/\.(\s*)$/, ", as the earlier edition put it.$1")));
  indexAndStamp(p.root, p.reader, { as: "agent", party: AGENT });
}
const gateView = (p) => {
  const core = coreObligations(p.root, p.reader, "t");
  return applyCarriedOver(p.root, core, new Map(loadUnits(p.root, p.reader).map((u) => [u.id, unitHash(u.text)])), "t", { reader: p.reader });
};

test("[req.records.carry-over-baseline] [req.gate.carried-over] carried over: unchanged plans approved, unchanged units' obligations become notes, what changed owes everything", (t) => {
  const p = copy(t);
  // le-chatelier's version 2 waits for approval; its plan is the baseline's. chemical-equilibrium's plan will change.
  openVersionCarrying(p.root, p.reader, { scopes: ["chapter:le-chatelier", "chapter:chemical-equilibrium"], reason: "objectives split", instructorWords: "Open version 2 of both chapters." }, I);
  const units = loadUnits(p.root, p.reader);
  const all = coreObligations(p.root, p.reader, "t");
  const owing = (kind) => units.filter((u) => all.some((f) => f.kind === kind && f.units.includes(u.id)));
  const [kept, changedLater] = owing("evidence-missing").filter((u) => u.locator.deliverable.startsWith("study-guide/"));
  const absolute = owing("absolute-unreviewed").find((u) => u.id !== kept.id && u.id !== changedLater?.id);
  assert.ok(kept && changedLater && absolute, "C2 has units owing evidence and absolute reviews");

  // the baseline: a harness tool, written into the package
  const out = path.join(p.root, CARRY_DIR, "c2-baseline.json");
  const cli = spawnSync(process.execPath, [path.join(REPO, "scripts", "coursewerk.mjs"), "carry-over-baseline", "--from", p.root, "--out", out, "--label", "c2-baseline"], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  const b = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.equal(b.baseline.label, "c2-baseline");
  assert.equal(Object.keys(b.units).length, units.length);
  assert.ok(b.plans["concepts/le-chatelier.md"] && b.plans["concepts/course.md"]);
  // after the baseline: a plan and a unit change
  fs.appendFileSync(path.join(p.root, "concepts", "chemical-equilibrium.md"), "\n");
  edit(p, changedLater);

  // the instructor's act: refused without words, outside the carry-over folder; recorded once
  const rel = `${CARRY_DIR}/c2-baseline.json`;
  assert.throws(() => carryOver(p.root, p.reader, { baseline: rel, instructorWords: " " }, I), /words/);
  assert.throws(() => carryOver(p.root, p.reader, { baseline: rel, instructorWords: WORDS }, AGENT), /instructor's act/);
  assert.throws(() => carryOver(p.root, p.reader, { baseline: "private/coursewerk/LOG.jsonl", instructorWords: WORDS }, I), /carry-over\//);
  const r = carryOver(p.root, p.reader, { baseline: rel, instructorWords: WORDS }, I);
  assert.deepEqual(r.plans.carried, ["chapter:le-chatelier"]);
  assert.match(r.plans.left.find((x) => x.scope === "chapter:chemical-equilibrium").why, /differs from the baseline \(concepts\/chemical-equilibrium\.md\)/);
  assert.match(r.plans.left.find((x) => x.scope === "course").why, /already approved/);
  assert.throws(() => carryOver(p.root, p.reader, { baseline: rel, instructorWords: WORDS }, I), /already carried over/);
  const log = parseLog(readLogText(p.root));
  const rec = log.find((x) => x.type === "intake" && x.payload.event === "carry-over");
  assert.equal(rec.party.name, I.name); assert.equal(rec.payload.instructorWords, WORDS); assert.equal(rec.payload.means, "carried over from earlier Coursewerk");
  const approval = log.filter((x) => x.type === "approval" && x.payload.scope === "chapter:le-chatelier").at(-1);
  assert.deepEqual(approval.payload.carriedOver, { label: "c2-baseline", record: rec.seq });
  assert.equal(log.filter((x) => x.type === "approval" && x.payload.scope === "chapter:chemical-equilibrium" && x.payload.version === 2).length, 0);

  // units: the unchanged ones owe their obligations as notes, labelled; the changed one owes them as before
  const v = gateView(p);
  const of = (id) => v.findings.filter((f) => f.units.includes(id) && CARRIED_KINDS.includes(f.kind));
  assert.ok(of(kept.id).length && of(kept.id).every((f) => f.statusClass === "question" && f.route === "agent" && /carried over from earlier Coursewerk/.test(f.evidence.carriedOver.note)), "listed, as notes");
  assert.ok(of(absolute.id).some((f) => f.kind === "absolute-unreviewed" && f.statusClass === "question"));
  assert.equal(evaluateGate({ findings: of(kept.id) }).canPublish, true, "a note never blocks");
  const changedNow = loadUnits(p.root, p.reader).filter((u) => u.locator.deliverable === changedLater.locator.deliverable && !b.units[u.id] || b.units[u.id] && unitHash(u.text) !== b.units[u.id]);
  assert.ok(changedNow.length, "the edited unit differs from the baseline");
  for (const u of changedNow) for (const f of of(u.id)) assert.equal(f.statusClass, "obligation", `${u.id} owes ${f.kind}`);
  assert.ok(changedNow.some((u) => of(u.id).length), "the changed unit still owes its obligations");
  assert.equal(v.carried.plans, 1); assert.ok(v.carried.units > 0 && v.carried.units < units.length); assert.deepEqual(v.carried.labels, ["c2-baseline"]);

  // a later edit of a carried unit ends its carried status
  edit(p, loadUnits(p.root, p.reader).find((u) => u.id === kept.id));
  const after = gateView(p).findings.filter((f) => CARRIED_KINDS.includes(f.kind) && loadUnits(p.root, p.reader).filter((u) => u.locator.deliverable === kept.locator.deliverable && unitHash(u.text) !== b.units[u.id]).some((u) => f.units.includes(u.id)));
  assert.ok(after.length && after.every((f) => f.statusClass === "obligation"), "edited since: owed again");

  // the baseline changed after the act: a blocking defect, and nothing is carried
  fs.writeFileSync(out, JSON.stringify({ ...b, units: {} }) + "\n");
  const broken = gateView(p);
  assert.ok(broken.findings.some((f) => f.kind === "carry-over-baseline-changed" && f.statusClass === "defect"));
  assert.equal(broken.carried.notes, 0);
});

test("[req.gate.carried-over] the gate, CHECKED.json and the record size say what is carried over", (t) => {
  const p = copy(t);
  openVersionCarrying(p.root, p.reader, { scopes: ["chapter:le-chatelier"], reason: "objectives split", instructorWords: "Open version 2." }, I);
  const b = buildBaseline(p.root, { label: "c2" });
  const w = writeBaseline(b, path.join(p.root, CARRY_DIR, "c2.json"));
  assert.ok(w.bytes < 4 * 1024 * 1024);
  assert.throws(() => writeBaseline({ ...b, pad: "x".repeat(4 * 1024 * 1024) }, path.join(p.dir, "big.json")), /over the 4 MB/);
  carryOver(p.root, p.reader, { baseline: `${CARRY_DIR}/c2.json`, instructorWords: WORDS }, I);
  const g = runGate(p.root);
  assert.equal(g.carriedOver.plans, 1); assert.ok(g.carriedOver.notes > 0); assert.deepEqual(g.carriedOver.labels, ["c2"]);
  assert.ok(!g.gate.blocking.some((f) => CARRIED_KINDS.includes(f.kind)), "nothing carried blocks");
  assert.ok(g.findings.filter((f) => f.evidence?.carriedOver).length === g.carriedOver.notes, "every note is listed");
  const c = checkedRecord(p.root, g, { at: "2026-11-03T00:00:00Z" });
  assert.equal(c.carriedOver.label, "carried over from earlier Coursewerk"); assert.equal(c.carriedOver.notes, g.carriedOver.notes);
  assert.ok(c.pages.some((x) => x.open.carriedOver > 0), "pages count carried-over notes apart");
  assert.equal(c.approvals.find((a) => a.scope === "chapter:le-chatelier").carriedOver, "carried over from earlier Coursewerk");
  // the gate CLI says so
  const json = path.join(p.dir, "gate.json");
  spawnSync(process.execPath, [path.join(REPO, "scripts", "gate.mjs"), "--root", p.root, "--json", json], { encoding: "utf8" });
  const rep = JSON.parse(fs.readFileSync(json, "utf8"));
  assert.equal(rep.carriedOver.label, "carried over from earlier Coursewerk"); assert.equal(rep.counts.carriedOver, rep.carriedOver.notes);
  assert.ok(Object.keys(rep.carriedOver.notesByKind).every((k) => CARRIED_KINDS.includes(k)));
});
