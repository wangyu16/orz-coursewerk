# Assembling carriers

**What Coursewerk delivers is the plain text** (orz text format 1, D52). Each deliverable is a Markdown text carrying
the notation of the frame that assembles it:
- `study-guide/` and `practice/`: orz-markdown, which orz-mdhtml assembles into `.md.html`;
- `slides/`: an orz-slides text (a header with `carrier: slides`), which orz-slides assembles into `.slides.html`;
- declared print documents: an orz-paged text (a header with `carrier: paged`), which orz-paged assembles into
  `.paged.html`.

Concept maps and assessment guides are plain Markdown with no header. A carrier is **not** a Coursewerk deliverable
(D24): it is clothes. Alembic assembles carriers on import, and an agent can assemble them for a local preview.

**The text is the source of truth.** A carrier is the text plus a regenerable shell, and
`extract(assemble(text)).text === text` byte for byte. The header holds every author choice (title, theme, ratio,
page settings) and renders nothing; there is no build-time theme. Never write a `uid` yourself (Alembic assigns
identity; one it wrote stays). Edit the text, never the HTML; bring a browser edit back with `orz-<frame> extract`.

**Use the newest frames.** `node scripts/build_carriers.mjs --root <package> --out <dir>` assembles each text with
the newest published frames (`<frame> assemble <text> -o <carrier>`), checks every carrier with the same frame's
library (it must extract to its exact text; a carrier lint error fails the build) and records the frames' versions,
each text's sha256, and whether the harness's own installed frames are behind. Or run a frame directly
(`npx orz-slides@latest assemble slides/<slug>.slides.md -o <dir>/<slug>.slides.html`). Keep carriers outside the package.

## Migrating a package to text format 1

- **Slides** with a 0.x `<!-- deck … -->` block (now the lint error `deck-block`): `npx orz-slides@latest upgrade
  slides/<slug>.md` writes `slides/<slug>.slides.md` with the block moved into the header and the slides unchanged.
  Keep it there (the site-type contract's deck path) and delete the old `slides/<slug>.md`.
- **Paged documents:** `npx orz-paged@latest upgrade <file>.paged.html` turns a 0.x carrier into a format-1 one and
  writes its text (`<file>.paged.md`); move that text to the declared source path. A 0.x text alone needs its
  `{{nyml kind: document}}` settings block moved to the very top with `carrier: paged` added (and a `kind: meta`
  block's keys merged into it). Either way, drop any `uid:` line.
- Check each text with `npx orz-<frame>@latest inspect <text>`, then rebuild the carriers.
