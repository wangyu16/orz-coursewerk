#!/usr/bin/env node
// What needs the instructor, through Alembic's "Needs you" (req.host.alembic-needs-export, req.host.alembic-needs-apply;
// lib/core/alembic_needs.mjs). In an Alembic job:
//   node scripts/alembic_needs.mjs export --root <pkg> --out <file.json> [--changeset <id>] [--model <id>] [--inputs <dir>]
//       Coursewerk's open needs as the file `alembic handin <file.json>` takes: interrupts, plan approvals, corrections,
//       then the checkpoint digest — at most 20 questions; it says how many wait for the next hand-in. Without --changeset it
//       makes a new id (cw-<time>). With --model the
//       digest is delivered (logged as the M4 checkpoint).
//   node scripts/alembic_needs.mjs apply --root <pkg> --changes <file.json>
//       records the answers in `alembic changes` (its JSON) to the questions Coursewerk asked, in the person's name and
//       words, each once; prints what was recorded and what was skipped, and why. An answer in the instructor's own
//       words (outcome "said") carries the words: they are the agent's to act on.
//   node scripts/alembic_needs.mjs taken-up --root <pkg> --changeset <id> --question <id> --note "<what you did>" --model <id>
//       records what the agent did with those words; the question is then answered (until then it is not asked again).
import fs from "node:fs";
import path from "node:path";
import { applyChanges, exportNeeds, takenUp } from "./lib/core/alembic_needs.mjs";

const [cmd, ...args] = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const fail = (m) => { console.error(`alembic_needs ${cmd || ""}: ${m}`); process.exit(1); };
const root = opt("--root");
if (!["export", "apply", "taken-up"].includes(cmd) || !root || !fs.existsSync(root)) {
  console.error("usage: alembic_needs.mjs export --root <pkg> --out <file.json> [--changeset <id>] [--model <id>]\n       alembic_needs.mjs apply --root <pkg> --changes <file.json>\n       alembic_needs.mjs taken-up --root <pkg> --changeset <id> --question <id> --note \"<what you did>\" --model <id>");
  process.exit(2);
}
try {
  if (cmd === "export") {
    const out = opt("--out") || fail("where to write the hand-in? --out <file.json>");
    const changesetId = opt("--changeset") || `cw-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 17)}`;
    const r = await exportNeeds(root, { changesetId, model: opt("--model") || null, inputsDir: opt("--inputs") || null });
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(r.handin, null, 2) + "\n");
    console.log(JSON.stringify({ out, changesetId, questions: r.handin.digest.questions.length, ...r.counts, leftForNextTime: r.left, delivered: r.delivered,
      // the instructor's words still owed to you: take each up (round 5, MEDIUM-3)
      ...(r.owed.length ? { owedToYou: r.owed.map(({ changesetId: c, question, answers }) => ({ changesetId: c, question, answers })) } : {}),
      next: r.handin.digest.questions.length ? `alembic handin ${out}` : "nothing needs the instructor now" }, null, 2));
  } else if (cmd === "taken-up") {
    const model = opt("--model") || fail("which model are you? --model <id>");
    const r = takenUp(root, { changesetId: opt("--changeset") || fail("--changeset <id>"), question: opt("--question") || fail("--question <id>"), note: opt("--note") || fail("--note \"<what you did>\"") }, { role: "agent", name: "executor", model });
    console.log(JSON.stringify({ recorded: r.seq, question: opt("--question") }, null, 2));
  } else {
    const file = opt("--changes") || fail("which changes? --changes <file.json> (the output of `alembic changes`)");
    let changes; try { changes = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { fail(`${file} is not the JSON of \`alembic changes\`: ${e.message}`); }
    console.log(JSON.stringify(applyChanges(root, changes), null, 2));
  }
} catch (e) { fail(e.message); }
