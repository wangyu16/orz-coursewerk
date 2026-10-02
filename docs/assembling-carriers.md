# Assembling carriers

**What Coursewerk delivers is the lean package.** It is orz-markdown files carrying the notations of the frame that
assembles each one:
- `study-guide/` and `practice/`: orz-mdhtml, which builds `.md.html`;
- `slides/`: the orz-slides deck grammar, which builds `.slides.html`;
- print documents: orz-paged settings, which builds `.paged.html`.

Concept maps and assessment guides are plain Markdown. A carrier, the file wrapped in its frame, is
**not** a Coursewerk deliverable (D24): Alembic assembles carriers on import, and an agent can assemble them for a
local preview.

**Use the newest frames.** The notations stay stable; only the assembled look improves. `node
scripts/build_carriers.mjs --root <package> --out <dir>` fetches the newest frames and records their versions in its
receipt. Or run the builders directly (`npx orz-slides@latest …`). Keep carriers outside the package, never edit
them, and rebuild from the lean `.md`.
