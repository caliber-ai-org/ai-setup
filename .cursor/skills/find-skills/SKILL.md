---
name: find-skills
description: Discovers and installs community skills from the public registry. Use when the user mentions a technology, framework, or task that could benefit from specialized skills not yet installed, asks 'how do I do X', 'find a skill for X', or starts work in a new technology area. Proactively suggest when the user's task involves tools or frameworks without existing skills.
---

# Find Skills

Search the public skill registry for community-contributed skills
relevant to the user's current task and install them into this project.

## Instructions

1. Identify the key technologies, frameworks, or task types from the
   user's request that might have community skills available
2. Ask the user: "Would you like me to search for community skills
   for [identified technologies]?"
3. If the user agrees, run:
   ```bash
   caliber skills --query "<relevant terms>"
   ```
   This outputs the top 5 matching skills with scores and descriptions.
4. Present the results to the user and ask which ones to install
5. Install the selected skills:
   ```bash
   caliber skills --install <slug1>,<slug2>
   ```
6. Read the installed SKILL.md files to load them into your current
   context so you can use them immediately in this session
7. Summarize what was installed and continue with the user's task

## Examples

User: "let's build a web app using React"
-> "I notice you want to work with React. Would you like me to search
   for community skills that could help with React development?"
-> If yes: run `caliber skills --query "react frontend"`
-> Show the user the results, ask which to install
-> Run `caliber skills --install <selected-slugs>`
-> Read the installed files and continue

User: "help me set up Docker for this project"
-> "Would you like me to search for Docker-related skills?"
-> If yes: run `caliber skills --query "docker deployment"`

User: "I need to write tests for this Python ML pipeline"
-> "Would you like me to find skills for Python ML testing?"
-> If yes: run `caliber skills --query "python machine-learning testing"`

## When NOT to trigger

- The user is working within an already well-configured area
- You already suggested skills for this technology in this session
- The user is in the middle of urgent debugging or time-sensitive work
- The technology is too generic (e.g. just "code" or "programming")
