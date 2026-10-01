// The autonomous work loop's bounds (redesign P8; skeleton §4; req.loop.bounds).
// plan → author → run modules → triage → fix agent-routed → re-run … → checkpoint (M4)
// The loop's inner steps are the agent's own work (I17: govern ends, not means). The harness fixes only where it
// stops and what it may never do:
//   stop   at a FIXED POINT — a full gate run raises no agent-routed finding the previous run did not — or when the
//          batch budget (iterations, cost) is spent; whatever is still open goes to the checkpoint digest;
//   never  change the spine (a spine edit voids its approval: nothing publishes until the instructor re-approves),
//          answer a question for the instructor, or reopen a recorded decision — every one of those is an instructor
//          act, and the library refuses the agent party for each (INSTRUCTOR_ACTS, tested one by one).
export const DEFAULT_BUDGET = Object.freeze({ iterations: 5, costUsd: 5 });

/** The acts only the instructor performs; each refuses an agent party in its own module. */
export const INSTRUCTOR_ACTS = Object.freeze([
  "approve the spine (approvals.recordApproval)", "open a major version (versions.openMajorVersion)", "change a chapter's mode (workflow.transition)",
  "record steering (steering_intake.recordSteering)", "answer a digest question (digest.answerDigest)", "confirm a fact (obligations.confirmUnits)",
  "claim authorship (units_index.claimAuthorship)", "revert a correction (verdicts.revertCorrection)", "publish (workflow.publishDecision)",
  "drop a standard module (promotion.disableModule)",
]);

const agentKeys = (findings) => new Set(findings.filter((f) => f.route === "agent" && !["resolved", "answered"].includes(f.status)).map((f) => f.id));

/**
 * One step of the loop's stop rule.
 * @param previous  findings of the previous full run (null on the first iteration)
 * @param current   findings of this run
 * @param spent     { iterations, costUsd } used so far in this batch
 */
export function loopStep({ previous, current, spent = { iterations: 0, costUsd: 0 }, budget = DEFAULT_BUDGET }) {
  const now = agentKeys(current);
  const before = previous ? agentKeys(previous) : null;
  const fresh = before ? [...now].filter((k) => !before.has(k)) : [...now];
  const open = current.filter((f) => now.has(f.id));
  if (before && fresh.length === 0) return { stop: true, why: "fixed point: this run raised no new agent-routed finding", open, fresh: [] };
  if (spent.iterations + 1 >= budget.iterations) return { stop: true, why: `the batch budget is spent (${budget.iterations} iterations)`, open, fresh };
  if (spent.costUsd >= budget.costUsd) return { stop: true, why: `the batch budget is spent ($${budget.costUsd})`, open, fresh };
  return { stop: false, why: `${fresh.length} new agent-routed finding(s) to work`, open, fresh };
}
