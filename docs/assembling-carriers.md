# Assembling carriers — for agents working with a Coursewerk package

**What Coursewerk delivers is the lean package:** Markdown in the orz-family syntax (orz-markdown for study guides and
practice, the orz-slides deck grammar for slides, orz-paged for print documents), plus its metadata. That is the
deliverable, and the only thing the gate checks. A *carrier* — the same document wrapped in its framework shell
(`.md.html`, `.slides.html`, `.paged.html`) so it opens, presents or prints in a browser — is **not** a Coursewerk
deliverable (decision D24). Carriers are assembled from the lean sources whenever someone needs them:

- **On Alembic.** Importing the package into Alembic (https://alembic.orz.how) assembles every carrier on the
  platform's side. Nothing is needed from you.
- **By an agent, outside Alembic.** Use the orz-family builders — from this harness's `node_modules`, from npm, or
  from a locally saved copy of the frameworks.

## Which builder for which folder

| package folder | builder (npm package) | carrier |
|---|---|---|
| `study-guide/`, `practice/` | `orz-mdhtml` | `<name>.md.html` |
| `slides/` | `orz-slides` | `<name>.slides.html` |
| print documents declared in `metadata/DOCUMENTS.json` | `orz-paged` | `<name>.paged.html` |

Concept maps (`concepts/`) and assessment guides (`assessment-support/`) are plain Markdown and need no carrier.

## Three ways to assemble

1. **With this harness (simplest).** After `npm install` in the Coursewerk repository:

   ```bash
   node scripts/build_carriers.mjs --root <package> --out <preview-dir>
   ```

   The output directory must be outside the package. Carriers are throwaway: never commit them into the package,
   and never edit them — edit the lean `.md` and rebuild.

2. **With the builders from npm, directly.**

   ```bash
   npx orz-mdhtml study-guide/<chapter>.md -o <out>/<chapter>.md.html --inline
   npx orz-slides slides/<chapter>.md -o <out>/<chapter>.slides.html --inline
   npx orz-paged <document>.md -o <out>/<document>.paged.html --inline
   ```

   Use the versions this harness pins in `package.json` (`orz-mdhtml`, `orz-slides`, `orz-paged`, `orz-markdown`)
   unless the instructor asks for newer ones.

3. **From locally saved frameworks (offline).** If the builders and their runtime assets were saved earlier (an
   `npm pack` of the four packages, or a copy of a `node_modules` that contains them), install from those files and
   run either of the two commands above. Without the network, carriers still build; how fully they render offline
   depends on the framework — the shells load some runtime pieces (math, diagrams, themes, editor) from CDNs, so
   rich rendering needs the network unless the framework's runtime has been vendored. The lean Markdown itself is
   always fully usable offline.

## What to tell the instructor

The package is complete without carriers. Carriers are a convenience for reading, presenting and printing; if the
instructor wants them, assemble them as above and hand over the output directory alongside the package — not
inside it.
