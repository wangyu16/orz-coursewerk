// Pinning a reference in a test the way the retrieval service may pin it (red team round 7, I16): a pin counts only
// inside a destination the INSTRUCTOR declares (verify/references.mjs pinLedger), never by its own `destination`
// claim. A test that pins a page stands in for the instructor's declaration of its host first, as a real package does
// before anything is retrieved; a test about an undeclared destination pins with the library's pinReference.
import { readLogText } from "../../scripts/lib/records/log.mjs";
import { allowed, declareRetrieval, loggedRetrieval } from "../../scripts/lib/verify/retrieval.mjs";
import { pinReference } from "../../scripts/lib/verify/references.mjs";

const INSTRUCTOR = { role: "instructor", name: "Yu Wang (wangyu16)" };
export function pinDeclared(root, inputs, ref) {
  if (root) {
    const cur = loggedRetrieval(readLogText(root)) || { destinations: [] };
    if (!allowed(ref.url, cur.destinations)) {
      const host = new URL(ref.url).hostname;
      declareRetrieval(root, { retrieval: { destinations: [...cur.destinations, host], ...(cur.context ? { context: cur.context } : {}) }, words: `Check facts on ${host} too.` }, INSTRUCTOR);
    }
  }
  return pinReference(root, inputs, ref);
}
