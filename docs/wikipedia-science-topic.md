# Wikipedia science-topic workflow

Use this path for future public trial packages when a textbook publisher's process terms do not permit AI-assisted ingestion.

## Scope

Choose one bounded science topic and build a source set roughly comparable to one textbook chapter:

- one anchor English Wikipedia article;
- three to seven supporting articles covering prerequisites, mechanisms, evidence, applications, and limitations;
- a combined extracted corpus of approximately 6,000–25,000 words;
- one output chapter with the normal five Coursewerk deliverables.

Wikipedia is a starting corpus, not an authority hierarchy. Compare claims across the selected pages, preserve
visible uncertainty, follow their citations when a high-stakes or disputed claim needs a primary source, and
never invent a consensus that the pages do not support.

## Rights and attribution

English Wikipedia text is handled as CC BY-SA 4.0 adaptation material. Use
`templates/foundation.wikipedia-science.example.json`, keep the package under CC BY-SA 4.0, link each reused
article, credit Wikipedia contributors, link the license, and state that the material was adapted and reorganized.
Page images are separate works with their own licenses: do not ingest or reuse them merely because the surrounding
article text is reusable. Fetch any selected media separately, verify its description-page license, and record it
in `PROVENANCE.json`.

## Deterministic sequence

1. Declare every article in `FOUNDATION.json`; do not fetch article text yet.
2. For each source, capture the official Wikimedia terms evidence serially:

   ```bash
   npm run capture:rights -- --root package --source-id <id> --operator-name "<agent-or-person>" --operator-type automation --contact "<email-or-project-url>"
   ```

3. Confirm every hash-bound preflight receipt is `cleared`:

   ```bash
   node scripts/check_assurance.mjs --root package --phase pre-ingestion
   ```

4. Fetch all declared pages serially through the Wikimedia Action API:

   ```bash
   npm run prepare:wikipedia-topic -- --root package --inputs inputs --contact "<email-or-project-url>"
   ```

   The command uses a meaningful User-Agent, records exact page/revision/retrieval metadata, preserves raw API
   snapshots and extracted text hashes, and rejects a corpus outside the configured chapter-size range.

5. Only after the command succeeds may the agent read the extracted corpus and author the chapter. Run normal
   near-verbatim, assurance, coherence, carrier, and release gates afterward.

Official basis: Wikimedia's Terms of Use require attribution to reused pages/authors, indication of changes, and
CC BY-SA 4.0-compatible distribution for adapted text. Wikimedia API guidance requires a meaningful User-Agent
and considerate serialized requests.
