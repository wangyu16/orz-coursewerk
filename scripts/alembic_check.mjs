#!/usr/bin/env node
// Check a package against the NEWEST Alembic package contract, with Alembic's own validator (D37).
//   node scripts/alembic_check.mjs --root <package>
// The contract is fetched from the public Alembic repository into ~/.cache/coursewerk/alembic-contract/ (outside the
// package and the harness). Offline, it says so; the gate's local mirror (scripts/lib/contract.mjs) still applies.
import { checkNewestContract } from "./lib/alembic_contract.mjs";
const i = process.argv.indexOf("--root"), root = i > 0 ? process.argv[i + 1] : null;
if (!root) { console.error("usage: alembic_check.mjs --root <package>"); process.exit(2); }
const r = checkNewestContract(root);
console.log(JSON.stringify({ checked: r.checked, commit: r.commit, ok: r.ok, errors: r.errors, warnings: r.warnings, note: r.note }, null, 2));
process.exit(r.checked === "newest" && !r.ok ? 1 : 0);
