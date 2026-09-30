# Adversarial rounds — P1 shared records (decision log)

Requirements under attack: `req.records.log-chain`, `req.records.tamper` (tier T4, D22). Each round: a red-team
agent with a fixed tool budget, the code only, a scratch directory, and the claim as written; out of scope in every
round (documented limits): a writer appending a new record that falsely names a party, and an attacker who can also
rewrite the committed history in git. Every finding became a probe in `tests/records.test.mjs`.

## Round 1 — 2026-09-30, ~25 calls, 29 probes

No way found to alter a committed record. Findings, all fixed:

- Malformed new records accepted: array-valued or junk `at`, array-valued `party.name`, non-object payload, unhashed
  extra top-level fields, duplicate JSON keys → strict form: exact key set and order, `line === JSON.stringify(parsed)`,
  real UTC ISO time, string party fields, plain-object payload.
- A literal `null` line crashed `verifyLog` → reported as "not a record object".
- Appending to a log without a trailing newline glued two records → such a log is refused before appending.
- `nextRecord` could hash something other than what is written (Date, `undefined` in arrays, getters, BigInt) → the
  record is normalized through JSON before hashing and self-verified before it is returned.
- Blank lines between committed records passed → no blank lines or CR; `verifyExtends` is a byte-exact prefix.

## Round 2 — 2026-09-30, ~20 calls

No way found to alter a committed record. Findings, all fixed:

- Concurrent writers broke the chain permanently (duplicate sequence numbers; no rollback) → appends serialized by a
  lock file and rolled back when the result does not verify.
- Deeply nested payloads made `verifyLog` throw (stack overflow) → nesting limit (`MAX_DEPTH` 32) on write and read;
  `verifyLog` never throws.
- A committed log ending in a half-written line could be "completed" with forged content → `verifyExtends` refuses
  when the committed log does not itself verify.
- Party `model` could be a number or an object; invisible names accepted → string fields with visible characters.
- One hash, two spellings (nested key order free) → nested keys sorted on write and required sorted on read.
- Not wired: nothing outside the tests calls the verifier yet → registered as `req.gate.log-verified` (P2).

## Round 3 — 2026-09-30, ~15 calls, aimed at the round-2 code

Held: depth limit, key order at every depth including inside arrays, `verifyLog` never throwing on hostile inputs, 20
concurrent writers × 50 appends with no loss. Findings, fixed:

- **Bypass:** a write that failed part-way (EFBIG / ENOSPC) left a torn line — the rollback ran only on a failed
  check, not on a failed write → any error truncates the file to its exact previous byte length.
- A writer could delete another writer's lock, and the timeout message invited deleting a live lock → the lock
  records its owner; only the owner removes it; a lock whose owner process is gone is cleared; a live lock times out
  with its owner and age named (wait raised to 15 s).
- A symlinked `LOG.jsonl` wrote outside the package → refused.
- `verifyExtends` alone does not verify the working log → `verifyAgainstCommitted` is the single acceptance rule.

Acceptable limits recorded: a lock left by a killed process on another host is not cleared automatically (the error
names it); each append re-verifies the whole log (O(n); ~40 ms at 1,000 records), fine at course scale.

**Status after round 3:** no open finding on history integrity or record form. `req.records.log-chain` and
`req.records.tamper` are closed at T4 on these three rounds.
