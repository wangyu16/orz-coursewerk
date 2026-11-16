// [req.host.alembic-needs-apply] [req.host.alembic-needs-wording] Closed-loop audit, round 8, of D-133 (needs-wording fbaa84d on
// main 75e808f): the one-finding limit, owed work over several jobs, and a fresh pass. Each finding test FAILS on fbaa84d and
// names one finding (severity in its name). Only public functions and the real C2 package are used; nothing here changes
// implementation. Adopted with the round's fixes (MEDIUM-2 checks the refusal it asked for).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLog, readLogText } from "../scripts/lib/records/log.mjs";
import { applyChanges, exportNeeds, owedWords, takenUp } from "../scripts/lib/core/alembic_needs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C2 = path.join(HERE, "fixtures", "c2-chemistry-v2", "package");
const BY = { id: "u-42", name: "Yu Wang" };
const AGENT = { role: "agent", name: "executor", model: "claude-opus-5-5" };
const P1 = "u-study-guide-le-chatelier-the-principle-1", P2 = "u-study-guide-le-chatelier-the-principle-2";
function course(t) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cw-wording-audit8-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "pkg");
  fs.cpSync(C2, root, { recursive: true });
  return { root, log: () => parseLog(readLogText(root)) };
}
const answer = (changesetId, question, item, text, words = text) => ({ item, changesetId, question, answer: text, words, by: BY, at: "2026-11-11T12:00:00.000Z" });
const digestQ = (r) => r.handin.digest.questions.filter((x) => x.id.startsWith("d."));
// ms8-verdicts.mjs:295 — the note names the unit, which rootCause folds (digest.mjs:32): every such finding of the course
// is ONE cluster
const exercise = (id, unit) => ({ id, module: "ms8-verdicts", kind: "exercise-data-confirm", units: [unit], statusClass: "question", route: "digest", status: "open", recommendation: "confirm",
  evidence: { type: "judgment", note: `${unit}: the values here read as invented exercise data, which no source can show — confirm them as teaching hypotheticals?`, quote: "0.25 M" } });
const confirmedBy = (log, findingId) => log.filter((x) => x.type === "answer" && x.party?.role === "instructor").flatMap((x) => x.payload.answers).filter((a) => a.finding === findingId && /^\s*confirm/i.test(a.choice));

// ---- HIGH-1: a cluster of a binding kind can never be settled from Alembic; it is asked, answered and re-asked forever --
// Round 7's limit (alembic_needs.mjs:131-132, :469) gives an entry of several findings no choice, so its answer is words.
// Words on a binding kind (confirm / keep as written / keep / accept as mine) are taken up with `binding: true`
// (alembic_needs.mjs:374) and so never answer it (digest.mjs:45, :68): it is asked again — but again as the same cluster
// (buildDigest clusters by rootCause, digest.mjs:118-124), again with no choice. Nothing splits it. The clusters are
// course-wide in practice: exercise-data-confirm's note differs only by the folded unit id (ms8-verdicts.mjs:295), a
// numeric fact-disputed note only by folded numbers and quotes (:306-308), and instructor-edit-unasked's only by quotes
// (:248). So a course with two exercise passages can never confirm its exercise data on Alembic (each stays
// evidence-missing, which blocks publishing), and every job repeats the same question and the same take-up. The question
// promises the assistant "can ask about each place on its own" and alembic-job/CLAUDE.md:66-67 that it is "asked again with
// its choices"; neither has a mechanism. Main offered Confirm on the cluster (unsafe; round 7 rightly removed that), so the
// lost liveness is introduced by D-133 round 7.
// Cheapest fix: in exportNeeds, hand in an entry of several findings whose kind has choices of its own (DIGEST_CHOICES /
// BINDING_KINDS, or wordEntry's choices) as one question per finding (key + finding id), within the 20 — each with its own
// passage and choices; the cluster then stays words-only only for kinds no choice acts on.
test("[req.host.alembic-needs-apply] audit8 HIGH-1: a cluster of exercise data is confirmable from Alembic within a few jobs", async (t) => {
  const c = course(t);
  const F = [exercise("f-audit8-ex1", P1), exercise("f-audit8-ex2", P2)];
  const seen = [];
  for (let job = 1; job <= 5; job++) {
    // the agent follows alembic-job/CLAUDE.md: take up every owed answer first, then export
    for (const o of owedWords(c.root)) takenUp(c.root, { changesetId: o.changesetId, question: o.question, note: "I cannot confirm for you; asked again." }, AGENT);
    const cs = `audit8-loop-00${job}`, qs = digestQ(await exportNeeds(c.root, { changesetId: cs, gate: { findings: F } }));
    seen.push(qs.map((q) => q.choices || "words"));
    // the instructor answers each question as fully as it lets them: Confirm where offered, else in words
    applyChanges(c.root, { answers: qs.map((q, i) => answer(cs, q.id, `i-${job}-${i}`, q.choices?.includes("Confirm") ? "Confirm" : "Yes: both are made-up teaching values. Confirm them.", "Yes, confirm.")) });
    if (confirmedBy(c.log(), "f-audit8-ex1").length && confirmedBy(c.log(), "f-audit8-ex2").length) return;
  }
  assert.fail(`after 5 jobs the instructor's "confirm" is still recorded nowhere, and the same words-only question comes back every job: ${JSON.stringify(seen)}`);
});

// ---- MEDIUM-2: a re-export under the same changeset id rebinds an answered question to a finding it never showed ------
// A digest question's id is the cluster key's hash (alembic_needs.mjs:162, qid("d", e.key)), so another finding with the
// same root cause gets the same id. exportNeeds replaces the record of a changeset id it has seen (:306), while Alembic keeps
// the FIRST hand-in under that id ("a repeat answers with what happened the first time", Alembic agent-endpoint.ts:112-123).
// When the agent passes `--changeset <id>` twice in a job (the job doc allows it, alembic-job/CLAUDE.md:111), the
// instructor answers the question they were shown (finding 1, passage P1) and apply confirms finding 2 (passage P2): the
// guard passes, since `seen` is the second export's. Pre-existing on main (same id scheme and replacement); it defeats
// round 7's "a choice acts on the one finding shown".
// Cheapest fix: exportNeeds refuses a changeset id its record already holds (or a digest question id hashes the entry's
// bases, not only its key).
test("[req.host.alembic-needs-apply] audit8 MEDIUM-2: a choice never confirms a finding the handed-in question did not show", async (t) => {
  const c = course(t);
  const q1 = digestQ(await exportNeeds(c.root, { changesetId: "audit8-reuse-001", gate: { findings: [exercise("f-audit8-r1", P1)] } }))[0];
  assert.ok(q1?.choices?.includes("Confirm"), `precondition: one finding, Confirm offered (${JSON.stringify(q1?.choices)})`);
  // the same job exports again with the same id (Alembic keeps showing q1); the first finding is gone, another came up
  // adopted fix (round 8): a changeset id the record already holds is refused, and a question id hashes its finding
  await assert.rejects(exportNeeds(c.root, { changesetId: "audit8-reuse-001", gate: { findings: [exercise("f-audit8-r2", P2)] } }), /already handed in/);
  const q2 = digestQ(await exportNeeds(c.root, { changesetId: "audit8-reuse-002", gate: { findings: [exercise("f-audit8-r2", P2)] } }))[0];
  assert.notEqual(q2?.id, q1.id, "another finding is another question");
  applyChanges(c.root, { answers: [answer("audit8-reuse-001", q1.id, "i-1", "Confirm", "Yes, these are mine to confirm.")] });
  assert.equal(confirmedBy(c.log(), "f-audit8-r2").length, 0, "the instructor confirmed P1's values as shown, and P2 — never shown to them — is recorded as confirmed");
});
