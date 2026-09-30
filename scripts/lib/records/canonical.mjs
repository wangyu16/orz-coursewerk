// Canonical JSON and hashing for the redesign's in-package records (skeleton §5).
// One spelling of "the same record": keys sorted at every depth, no whitespace. Every content id and every
// log-chain hash is computed over this form, so two writers can never disagree about identity.
import crypto from "node:crypto";

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

export function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export const HEX64 = /^[0-9a-f]{64}$/;
