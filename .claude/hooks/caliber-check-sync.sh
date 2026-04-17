#!/bin/sh
# Don't block headless claude sessions spawned by caliber itself (e.g. during caliber refresh)
if [ -n "$CLAUDE_CODE_SIMPLE" ]; then
  exit 0
fi
if grep -q "caliber" .git/hooks/pre-commit 2>/dev/null; then
  exit 0
fi

# Use session_id from stdin if available, fall back to repo-based flag
FLAG="/tmp/caliber-nudge-$(echo "$PWD" | shasum | cut -c1-8)"

# Clean stale flags (older than 2 hours)
find /tmp -maxdepth 1 -name "caliber-nudge-*" -mmin +120 -delete 2>/dev/null

if [ -f "$FLAG" ]; then
  exit 0
fi
touch "$FLAG"

printf '{"decision":"block","reason":"Caliber agent config sync is not set up on this machine. Tell the user: This project uses Caliber to keep agent configs in sync — it is not set up yet. Want me to run /setup-caliber? (~30 seconds)"}'
