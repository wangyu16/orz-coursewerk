# Adversarial rounds — P2 module contract, runner and gate

Requirement under attack: `req.modules.admission` (tier T4, D22), together with the runner and gate claims around it
(class and route from the declaration, maturity, no writes, isolation between modules, package code never runs).
Every finding became a probe in `tests/runner.test.mjs` or `tests/gate-cli.test.mjs`.

**Threat model, settled in round 2.** Modules are harness code, reviewed and shipped with the harness; the package and
its module registry are untrusted. The runner protects against buggy modules and against package-controlled paths.
It is not an OS sandbox: a deliberately hostile module can forge its own output, write outside the package, escape
through a detached grandchild in a new process group, or pass state from run() to recheck() through files outside
the package. The process-group kill is POSIX only.

## Round 1 — in-process runner, ~25 calls

Five bypasses: (B1) the gate CLI imported any path named in the registry, so a package could run its own code at gate
time; (B2) writes during draft iteration, getters or recheck escaped the write check; (B3) a trial module could
promote itself by appending a promotion record; (B4) a module could rewrite its own manifest at run time to change
class or route; (B5) one module could change another's manifest, run function, the snapshot's prototype, or global
built-ins. Robustness: one bad module aborted the whole checkpoint; promotions read from an unverified log; a draft
kind read twice; duplicate and reserved registry names; an odd `status` hid a finding.

**Fix:** the runner was rebuilt. Each module runs in its own child process on a serialized snapshot and returns JSON;
modules load only from the harness's module directory by validated slug; the tree is hashed around the child's whole
lifetime; the registry is validated (reserved `skeleton`, duplicates, boolean `enabled`); promotions count only from
a verifying log, made by the instructor, citing the bar; an interrupt must name one of the four reasons; any status
other than resolved or answered counts as open.

## Round 2 — process-isolated runner, ~20 calls

Bypasses: (B1) run() and the admission verdict shared a process, so a hostile module could forge the verdict and a
buggy polyfill could defeat it — **run() and recheck() now run in separate processes; intrinsics are captured before
the module loads; the forging case is the documented limit**; (B2) all modules shared one snapshot file — **each module
gets its own copy**; (B3) git commits and tags went unnoticed — **HEAD, refs, packed-refs, info join write detection**;
(B4) a late write by a module's child was blamed on the next module — **each host runs in its own process group,
killed on exit; a change between modules is reported as unattributed**; (B5) a module ignoring SIGTERM hung the gate —
**SIGKILL on timeout**. Robustness: registry read through a symlink or FIFO, invalid registry JSON crashed the CLI,
no output cap, unhelpful error text — all fixed.

## Round 3 — the round-2 fixes, ~15 calls

No bypass. Robustness, fixed: a file vanishing mid-run, an unreadable file or a >2 GB file crashed the run — now a
change mark, never a crash; the CLI's own failure now exits 3 with a JSON error, never the "blocked" code; the host
exits as soon as its output is written, so an open timer or worker cannot hold it to the timeout; `.git/index`,
`.git/config.worktree` and `node_modules/` joined write detection. Recorded limits: state cached outside the package
between run() and recheck(); `git gc --auto` rewriting refs in a detached session; Windows has no group kill; a `.git`
file (linked worktree) is watched as a file only; ~1 s per checkpoint for 2,000 files × 5 modules.

**Status after round 3:** no open bypass within the threat model. `req.modules.admission` is closed at T4 on these
three rounds.
