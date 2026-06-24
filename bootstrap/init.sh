#!/usr/bin/env bash
# Coursewerk workspace bootstrap — idempotent. Creates the working folders and checks for updates.
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

# 2) create the working folders (never clobber existing content)
mkdir -p inputs guide/{concept-maps,chapters,slides,assessment,practice,assets} .coursewerk
[ -f inputs/README.md ] || cat > inputs/README.md <<'EOF'
# inputs/ — put your source materials here

Drop the things your course should be built from: a reference OPEN textbook (PDF), your own
lecture notes / prior study guide, a syllabus, data, figures. If you are using a *named open
textbook* fetched from the web, you may leave this empty and just tell the agent the textbook name.
Everything the package contains is sourced from here (or the named textbook) — never fabricated.
EOF
[ -f .coursewerk/progress.md ] || echo "# Coursewerk progress ledger"$'\n'"(stage-by-stage notes so the build can resume)" > .coursewerk/progress.md

echo "Ready. Put source materials in ./inputs/ , then tell your AI agent to follow PROCEDURE.md."
