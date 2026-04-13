---
name: save-learning
description: Saves user instructions as persistent learnings for future sessions. Use when the user says 'remember this', 'always do X', 'from now on', 'never do Y', or gives any instruction they want persisted across sessions. Proactively suggest when the user states a preference, convention, or rule they clearly want followed in the future.
---

# Save Learning

Save a user's instruction or preference as a persistent learning that
will be applied in all future sessions on this project.

## Instructions

1. Detect when the user gives an instruction to remember, such as:
   - "remember this", "save this", "always do X", "never do Y"
   - "from now on", "going forward", "in this project we..."
   - Any stated convention, preference, or rule
2. Refine the instruction into a clean, actionable learning bullet with
   an appropriate type prefix:
   - `**[convention]**` — coding style, workflow, git conventions
   - `**[pattern]**` — reusable code patterns
   - `**[anti-pattern]**` — things to avoid
   - `**[preference]**` — personal/team preferences
   - `**[context]**` — project-specific context
3. Show the refined learning to the user and ask for confirmation
4. If confirmed, run:
   ```bash
   caliber learn add "<refined learning>"
   ```
   For personal preferences (not project-level), add `--personal`:
   ```bash
   caliber learn add --personal "<refined learning>"
   ```
5. Stage the learnings file for the next commit:
   ```bash
   git add CALIBER_LEARNINGS.md
   ```

## Examples

User: "when developing features, push to next branch not master, remember it"
-> Refine: `**[convention]** Push feature commits to the \`next\` branch, not \`master\``
-> "I'll save this as a project learning:
    **[convention]** Push feature commits to the \`next\` branch, not \`master\`
    Save for future sessions?"
-> If yes: run `caliber learn add "**[convention]** Push feature commits to the next branch, not master"`
-> Run `git add CALIBER_LEARNINGS.md`

User: "always use bun instead of npm"
-> Refine: `**[preference]** Use \`bun\` instead of \`npm\` for package management`
-> Confirm and save

User: "never use any in TypeScript, use unknown instead"
-> Refine: `**[convention]** Use \`unknown\` instead of \`any\` in TypeScript`
-> Confirm and save

## When NOT to trigger

- The user is giving a one-time instruction for the current task only
- The instruction is too vague to be actionable
- The user explicitly says "just for now" or "only this time"
