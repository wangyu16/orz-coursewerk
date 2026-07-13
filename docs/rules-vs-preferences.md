# Hard rules vs. flexible preferences

Coursewerk's guidance is two kinds, and they behave differently:

- **HARD RULES** — solid, non-negotiable, and they live *in this repo*. They protect **correctness,
  legality, and uploadability**. A user preference can **never** override a hard rule. If a saved preference
  conflicts with one, the hard rule wins and the agent says so.
- **FLEXIBLE PREFERENCES** — matters of **taste, layout, structure, and choice**. Coursewerk ships a sensible
  **default** for each, but a user can set **their own** in `~/.coursewerk/`, which **overrides** the default.
  These live in the user's home directory, so **Coursewerk updates (`git pull`) never touch them** — the
  user's personalization persists across new Coursewerk versions.

## Resolution order (highest wins)

1. **HARD RULES** — always, never overridable. (Above everything below.)
2. The **user's instructions this session** (what they tell the agent right now).
3. The **user's saved preferences** in `~/.coursewerk/` (preferences.md · styles.md · templates/ · skills/).
4. **Coursewerk's default guidelines** (this repo's skills + docs) — the fallback.

So: hard rules bind unconditionally; for every *flexible* aspect, this-session > saved-preferences > default.

## HARD RULES (never overridable)

- **Alembic package contract** — the folder layout, the `alembic.json` manifest schema, the **two-repo
  invariant** (instructor-only content ONLY under `private/`), the license enum, the slug pattern, the
  root-file allowlist. Enforced by `scripts/lib/contract.mjs` + the QA gate.
- **orz grammar validity** — containers nest with the **outer fence having more colons than the inner** and
  **each close matching its open**; the orz-slides deck grammar (`<!-- slide -->`); no unclosed `{{plugins}}`.
  A malformed document renders wrong or won't build.
- **Copyright & provenance** — every asset proves a clean origin and is recorded in
  `metadata/ATTRIBUTION.md`; never embed copyrighted / paywalled / third-party-credited content; prose is
  **original** (no near-verbatim copying of the source); the package license **matches the source's**.
- **Assurance foundation** — intended use, source identity/version/scope, rights basis, license evidence,
  attribution obligations, privacy, and structured provenance are checked in every review mode. Unknown or
  private-only items are labelled and block publication.
- **Scientific accuracy** — every fact/value comes from the source or standard knowledge, **never
  fabricated**; a gap is a visible `[VERIFY]`, not a guess.
- **Accessibility floor** — alt text on every figure, sensible heading order, **color is never the sole
  signal**.
- **Gates** — the QA gate must pass (`criticalTotal == 0`) before delivery; listing on Discover requires an
  open license + verification + educator attestation.

## FLEXIBLE PREFERENCES (Coursewerk default → override in `~/.coursewerk/`)

| Dimension | Coursewerk default | Set your own in |
|---|---|---|
| Audience / level | introductory (unless told) | `preferences.md` |
| Tone & voice | clear, encouraging, plain | `preferences.md` |
| Terminology | standard (e.g. IUPAC where it matters) | `preferences.md` |
| Worked examples | several per chapter; ≥1 per slide section | `preferences.md` |
| Everyday-example flavor | one per section | `preferences.md` |
| Figure palette / plot colors | the `oer-figures` default palette | `styles.md` |
| Photo-vs-diagram balance | ≥1–2 fetched real photos per chapter | `styles.md` |
| Slide theme | left to build time (Alembic applies) | `styles.md` |
| Deck ratio | `16:9` | `styles.md` |
| Favored slide layouts | the design-patterns mix | `styles.md` |
| Slide density | ~3–5 bullets, balanced | `styles.md` |
| Document skeleton | `courseguide-standards` default | `templates/` |
| Extra skills | (none) | `skills/` |

*(Rule of thumb: if changing it can't break the contract, the grammar, copyright, accuracy, or accessibility,
it's a **preference** — a user may override it. Everything the QA gate flags as critical is a **hard rule**.)*

## Where preferences live — `~/.coursewerk/` (survives updates)

- **`preferences.md`** — pedagogy, scope, and terminology defaults. Rights and source-license decisions are
  assurance facts, never preferences.
- **`styles.md`** — visual / layout / figure / slide-style choices.
- **`templates/`** — the user's own document skeletons (preferred over the built-in default).
- **`skills/`** — extra skills, used alongside Coursewerk's bundled ones.
- **`memory.md`** — a dated ledger the agent distills durable decisions into.

Because this lives in `$HOME` (or `$COURSEWERK_HOME`), not in the repo, a `git pull` of Coursewerk can never
overwrite it. See `CLAUDE.md §0.6`.

## What the agent does with this (every run)

1. **Read `~/.coursewerk/` first** — before authoring anything.
2. Apply the user's preferences **over Coursewerk's defaults** for every *flexible* aspect; apply this
   session's instructions over both.
3. Keep **every hard rule** regardless. If a preference would break one, keep the hard rule and tell the user.
4. **Distill** durable new preferences the user expresses mid-session into the right `~/.coursewerk/` file (+
   a dated line in `memory.md`), so they apply automatically next time.
