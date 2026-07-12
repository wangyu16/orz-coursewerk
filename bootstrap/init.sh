#!/usr/bin/env bash
# Coursewerk workspace bootstrap — idempotent. Creates the working folders,
# installs the orz-family builders, and checks for updates.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"

echo "Coursewerk $(cat VERSION 2>/dev/null || echo '?') — initializing workspace in: $ROOT"

# 1) auto-update if this is a git clone (gives users the latest pipeline)
if [ -d .git ]; then
  before="$(cat VERSION 2>/dev/null)"
  git pull --ff-only >/dev/null 2>&1 && {
    after="$(cat VERSION 2>/dev/null)"
    [ "$before" != "$after" ] && echo "Updated Coursewerk: $before -> $after" || echo "Coursewerk is up to date ($after)."
  } || echo "(could not auto-update — continuing with the local version)"
fi

# 2) install the orz-family builders (orz-mdhtml / orz-slides / orz-paged) + parser.
#    coursewerk uses them to build the framework carriers for local preview + QA.
if [ ! -x node_modules/.bin/orz-mdhtml ]; then
  echo "Installing the orz-family builders (npm install)…"
  npm install >/dev/null 2>&1 && echo "  builders ready (orz-mdhtml, orz-slides, orz-paged)." \
    || echo "  (npm install failed — run it manually so build/preview works)"
else
  echo "orz-family builders already installed."
fi

# 3) create the working folders (never clobber existing content).
#    package/  — the Alembic package (LEAN source, the source of truth; this is what ships)
#    preview/  — built framework carriers for local reading (regenerable, never shipped)
#    reports/  — qa_report / evaluation / delivery (live OUTSIDE the package, never shipped)
#    dist/     — the packed .zip
mkdir -p inputs .coursewerk reports \
  package/{study-guide,concepts,slides,practice,assessment-support,assets,metadata,private}
[ -f inputs/README.md ] || cat > inputs/README.md <<'EOF'
# inputs/ — put your source materials here

Drop the things your course should be built from: a reference OPEN textbook (PDF), your own
lecture notes / prior study guide, a syllabus, data, figures. If you are using a *named open
textbook* fetched from the web, you may leave this empty and just tell the agent the textbook name.
Everything the package contains is sourced from here (or the named textbook) — never fabricated.
EOF
[ -f package/private/README.md ] || cat > package/private/README.md <<'EOF'
# private/ — instructor-only (NEVER shared with students)

Answer keys, full solutions, exam content, teaching notes. Everything here stays on the
private side. Alembic keeps a separate private repository for it and refuses to publish it.
Use subfolders like `answer-keys/`, `exams/`, `notes/`. Never place a shared figure or a
renderable document here — those are public.
EOF
[ -f .coursewerk/progress.md ] || echo "# Coursewerk progress ledger"$'\n'"(stage-by-stage notes so the build can resume)" > .coursewerk/progress.md

# 4) the USER'S OWN HARNESS — durable, personal, and NEVER touched by Coursewerk updates.
#    Lives in $HOME (not in this repo), so `git pull` of Coursewerk can never overwrite it, and it
#    is shared across all your courses. The agent reads it on every run and DISTILLS into it.
PROFILE="${COURSEWERK_HOME:-$HOME/.coursewerk}"
mkdir -p "$PROFILE/templates" "$PROFILE/skills"
[ -f "$PROFILE/preferences.md" ] || cat > "$PROFILE/preferences.md" <<'EOF'
# Your preferences (Coursewerk reads this every run; it is yours, not Coursewerk's)

Standing choices that should apply by default to every course you build, e.g.:
- Default audience / level: <…>
- Default license policy: <…>
- Tone & voice: <…>
- Terminology you prefer / avoid: <…>
- What to emphasize (worked examples, real-world applications, …): <…>

The agent ADDS to this as you steer (e.g. you say "always use IUPAC names" → it records that here).
Coursewerk updates never overwrite this file.
EOF
[ -f "$PROFILE/styles.md" ] || echo "# Your style preferences"$'\n\n'"Formatting / visual / slide-layout / figure-style choices the agent should reuse. The agent distills your repeated style choices here." > "$PROFILE/styles.md"
[ -f "$PROFILE/memory.md" ] || echo "# Your harness memory"$'\n\n'"A dated ledger of the durable decisions and learnings the agent distills from how you work. Survives updates." > "$PROFILE/memory.md"
[ -f "$PROFILE/templates/README.md" ] || echo "# Your templates"$'\n\n'"Drop your own document templates here (a preferred study-guide skeleton, a slide template, …). The agent prefers these over the built-in defaults." > "$PROFILE/templates/README.md"
[ -f "$PROFILE/skills/README.md" ] || echo "# Your additional skills"$'\n\n'"Drop extra skills here (each a folder with a SKILL.md). The agent uses them alongside Coursewerk's bundled skills. They are yours and survive updates." > "$PROFILE/skills/README.md"

echo "Your personal harness: $PROFILE  (survives Coursewerk updates; the agent reads + distills into it)"
echo "Ready. Put source materials in ./inputs/ , then tell your AI agent to follow PROCEDURE.md."
