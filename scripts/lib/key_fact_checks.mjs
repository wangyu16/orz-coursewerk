// The seven REQUIRED key-fact checks — the CRITERIA a key-fact reviewer judges against.
//
// One home, two consumers: `key_fact_review.mjs` (the gate that audits the recorded review) and
// `blind_bundle.mjs` (the assembler that hands the criteria to the blind reviewer). Splitting the
// constant out breaks the import cycle that would otherwise exist between them — the gate needs the
// bundle's digest, the bundle needs the gate's criteria — without either module reaching into the
// other at load time.
export const REQUIRED_KEY_FACT_CHECKS = Object.freeze([
  "accountable-identity",
  "source-identity-version",
  "source-license-evidence",
  "external-media-rights",
  "output-license-compatibility",
  "attribution-obligations",
  "scientific-key-facts",
]);
