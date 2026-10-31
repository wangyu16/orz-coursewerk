#!/usr/bin/env node
// Record an AUTHORIZED DIVERGENCE — the instructor knowingly teaching something the source does not say.
//
// WHY THIS FILE EXISTS (added 2026-07-17; finding F-C, the 5th no-producer defect)
// --------------------------------------------------------------------------------
// `lib/overrides.mjs` exports OVERRIDES_PATH = "private/coursewerk/OVERRIDES.json" and a complete, tested,
// mutation-covered API — and **nothing wrote the file**. The module is PURE (no I/O by design, which is
// correct), so the producer had to live somewhere, and it lived nowhere. The feature could not be
// exercised through the CLI at all: no npm script, no scripts/*.mjs, and the package tree in
// `format-contracts/deliverables.md` did not even list the artifact. Same family as `derivedFrom` (a
// field), the spine namespace, and REVIEW_QUEUE.json (an artifact): **a thing the design treats as real
// that no code emits.** Found by the usage tests, which are the only tests that run the documented CLI.
//
// WHAT AN OVERRIDE IS, AND IS NOT
// -------------------------------
// It is the answer to a question the harness may ask ONCE: "the source says X, the draft says Y — is
// this an error, or do you mean it?" Recording one says **I mean it**, and §10 dec. 2's ask-once rule
// then forbids the system from ever re-nagging about that claim.
//
// It authorizes divergence FROM THE SOURCE. **It does NOT make everything downstream correct.** If you
// override the melting point to 273.15 K, the answer keys still saying 0 °C are still wrong, and they
// are still flagged — as a REVISION to sign off, not as a hallucination. An override that silenced its
// dependents would authorize the package into an internal contradiction, which is worse than the flag
// it removed. That is deliberate; see `docs/walkthrough.md`.
//
// The instructor's own knowledge IS a legitimate basis (`instructor-expertise`). A source can be wrong;
// a textbook can be out of date; IUPAC can rename a thing. `rationale` is ALWAYS required — the next
// reader, who may be the instructor three semesters later, has to be able to tell an authorized
// divergence from a mistake, and only the rationale carries that.

import fs from "node:fs";
import path from "node:path";
import {
  OVERRIDES_PATH,
  BASES,
  emptyOverrides,
  recordOverride,
  findOverride,
} from "./lib/overrides.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const root = path.resolve(opt("--root", "package"));
const file = path.join(root, OVERRIDES_PATH);

const entry = {
  claimId: opt("--claim-id"),
  divergesFrom: opt("--diverges-from"),
  basis: opt("--basis"),
  rationale: opt("--rationale"),
  authorizedBy: opt("--authorized-by"),
  date: opt("--date"),
};
if (opt("--justified-by") !== null) entry.justifiedBy = opt("--justified-by");
for (const k of Object.keys(entry)) if (entry[k] === null) delete entry[k];

if (!entry.claimId || !entry.divergesFrom || !entry.basis || !entry.rationale) {
  console.error(
    "record-override: record an authorized divergence from a source.\n" +
      "\n" +
      "  --root <dir>            package root (default: package)\n" +
      "  --claim-id <claim.…>    the claim that diverges (from private/coursewerk/CLAIMS.json)\n" +
      "  --diverges-from <ref>   the source ref it diverges from\n" +
      `  --basis <${BASES.join("|")}>\n` +
      "  --rationale <text>      REQUIRED — why this is deliberate, for the next reader\n" +
      "  --authorized-by <name>  who decided (an override is a HUMAN judgement)\n" +
      "  --date <YYYY-MM-DD>     when\n" +
      "  --justified-by <ref>    REQUIRED iff --basis cited; forbidden otherwise\n",
  );
  process.exit(2);
}

// The date is an INPUT, never a clock read: an artifact that stamps itself is irreproducible, and every
// artifact in this system must be byte-identical when regenerated from the same inputs, months later,
// from git.
if (!entry.date) {
  console.error("record-override: --date YYYY-MM-DD is required (the recorder does not read a clock).");
  process.exit(2);
}

let doc;
if (fs.existsSync(file)) {
  try {
    doc = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    // Fail loudly. Read as "no overrides", a corrupt file would silently un-authorize every divergence
    // already settled and re-nag the instructor about every one of them — the exact behaviour ask-once
    // exists to prevent.
    console.error(`record-override: ${OVERRIDES_PATH} is unreadable (${e.message}). Fix or delete it; do not let it read as "no overrides".`);
    process.exit(2);
  }
} else {
  doc = emptyOverrides();
}

let next;
try {
  next = recordOverride(doc, entry); // M7 owns every rule; this file only does the I/O M7 cannot.
} catch (e) {
  console.error(`record-override: ${e.message}`);
  process.exit(2);
}

// M4 (design audit): an override for an id that no claim carries is a forged or stranded record.
// When the package is indexed, the id must exist there; `--force` records it anyway (with the
// dangling-override finding the gate will then raise).
const claimsFile = path.join(root, "private", "coursewerk", "CLAIMS.json");
if (fs.existsSync(claimsFile) && !args.includes("--force")) {
  let known = null;
  try { known = new Set((JSON.parse(fs.readFileSync(claimsFile, "utf8")).claims ?? []).map((c) => c.id)); } catch { known = null; }
  if (known && !known.has(entry.claimId)) {
    console.error(`record-override: no claim ${entry.claimId} in ${path.relative(process.cwd(), claimsFile)} — copy the id from CLAIMS.json (or pass --force to record it anyway; the gate will report it as dangling).`);
    process.exit(2);
  }
}
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
console.error("record-override: the claim's provenance fingerprint now moves; run `npm run index:semantic` to accept the new baseline, then re-run the gate.");

console.log(
  JSON.stringify(
    {
      action: "recorded",
      file: OVERRIDES_PATH,
      claimId: entry.claimId,
      basis: entry.basis,
      overrides: next.overrides.length,
      recorded: findOverride(next, entry.claimId) !== null,
      note: "Authorized divergence from the source. Claims DERIVED from this one are still reviewed — an override does not make its dependents correct.",
    },
    null,
    2,
  ),
);
