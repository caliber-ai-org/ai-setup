# Caliber Setup Check

At the very start of each session, before responding to the user's first message, run this command:

```bash
grep -q "caliber" .git/hooks/pre-commit 2>/dev/null && echo "SYNCED" || echo "NOT_SYNCED"
```

If the result is NOT_SYNCED, tell the user:

"This project uses Caliber to keep agent configs in sync — it is not set up yet. Want me to run /setup-caliber? (~30 seconds)"

If they agree, run /setup-caliber. Then proceed with their original request.
If they decline, proceed normally.
If SYNCED, say nothing and proceed normally.
