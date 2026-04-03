## v1.40.2 (2026-04-03)

### Bug Fixes

- add pre-flight auth check for Claude CLI provider (#118)

## v1.40.1 (2026-04-02)

### Bug Fixes

- improve onboarding UX for Windows users and clarify scoring suggestions (#116)

## v1.40.0 (2026-04-02)

### Features

- add recursive large-file scanner for AI context bloat warning (#96)

## v1.39.0 (2026-03-31)

### Features

- deeper Claude Code integration — rules, @include, skill paths, hooks (#111)

### Bug Fixes

- skip executable permission test on Windows (#112)

## v1.38.0 (2026-03-30)

### Features

- monorepo-aware refresh (#109)

## v1.37.1 (2026-03-30)

### Bug Fixes

- reduce wasteful LLM calls in init flow (#108)

## v1.37.0 (2026-03-30)

### Features

- redesign init flow — sync infrastructure first, optional generation
- continuous context sync — visible refresh, agent installer skill, GitHub Action sync mode

### Bug Fixes

- remove dead code from init rebase (lint errors)
- make GitHub Action sync mode work correctly in CI
- tell users about /setup-caliber skill after installing sync infrastructure
- protect builtin skills from LLM overwrite, align hook git-add paths
- improve init messaging — sync-first positioning, clearer prompts and summary

## v1.36.1 (2026-03-30)

### Bug Fixes

- scoring fairness, provider priority, and onboarding clarity (#106)

## v1.36.0 (2026-03-30)

### Features

- symmetric refresh across all 5 agent platforms (#105)

## v1.35.1 (2026-03-30)

## v1.35.0 (2026-03-30)

### Features

- add OpenCode as target agent (#103)

## v1.34.0 (2026-03-29)

### Features

- agentic onboarding, uninstall command, telemetry improvements (#102)

## v1.33.4 (2026-03-29)

## v1.33.3 (2026-03-29)

### Bug Fixes

- use plain stdout in session start hook for better visibility

### Other

- debug: add logging to session start hook

## v1.33.1 (2026-03-29)

### Bug Fixes

- make session start hook more assertive so agent acts on it

## v1.33.0 (2026-03-29)

### Features

- add session start hook to nudge new team members to set up Caliber

### Bug Fixes

- restore terminal state on exit (Ghostty/Kitty) (#101)

## v1.32.0 (2026-03-29)

### Features

- regenerate caliber configs with v1.32.0-dev

## v1.31.0 (2026-03-28)

### Features

- improve dev workflow with linting, CI, and branch protection (#98)

## v1.30.7 (2026-03-28)

## v1.30.6 (2026-03-28)

### Bug Fixes

- remove informal line, fix badge score inconsistency, correct con… (#92)

## v1.30.5 (2026-03-27)

### Bug Fixes

- exclude .env files from code analysis and sanitize secrets in file content

## v1.30.4 (2026-03-26)

### Other

- fix for issue #90: Can't set Cursor model

## v1.30.3 (2026-03-26)

### Other

- slack notifications

## v1.30.2 (2026-03-24)

### Bug Fixes

- use os.tmpdir() in hooks tests for Windows CI (#87)
- skip non-caliber binaries in argv[1] resolution (#86)
- resolve npx binary correctly in hooks, docs, and CLI output (#85)

## v1.30.1 (2026-03-24)

### Bug Fixes

- harden command injection, path traversal, and telemetry hashing

## v1.30.0 (2026-03-23)

### Features

- AI context infrastructure rebrand, refresh quality gate, score history, and prompt hardening (#82)

## v1.29.7 (2026-03-23)

### Bug Fixes

- normalize LLM response and share learning data across worktrees

## v1.29.6 (2026-03-23)

### Bug Fixes

- use bare caliber command in hooks instead of absolute path

## v1.29.5 (2026-03-23)

### Bug Fixes

- remove hardcoded user paths from hooks config (#81)

## v1.29.4 (2026-03-22)

### Bug Fixes

- make scoring checks agent-aware and respect .gitignore (#64)

## v1.29.3 (2026-03-22)

### Other

-  "Added a line in README"

## v1.29.2 (2026-03-21)

## v1.29.1 (2026-03-21)

## v1.29.0 (2026-03-21)

### Features

- scale video to 1080p, optimize encoding for smooth playback
- redesign playbooks scene as 7.5s terminal build log
- use real SVG logos and add GitHub git-sync messaging
- enhance video design to match LP — terminal frames, glow, categories
- redesign product video — 20s, 2x bigger text, key messages

### Bug Fixes

- use reduced-motion GIF for README header, replace MP4 video tag

## v1.28.0 (2026-03-20)

### Features

- replace static header image with Remotion-rendered product video

### Bug Fixes

- restore CLI demo GIF, use separate MP4 for header only
- use MP4 video embed with larger text for README header

## v1.27.0 (2026-03-20)

### Features

- warn when no supported AI platforms are detected

## v1.26.1 (2026-03-20)

### Bug Fixes

- skill backup paths don't match actual written paths
- surface scanner warnings instead of silently swallowing errors (fixes #38)

### Refactoring

- replace require() with ESM import in writers/index.ts

## v1.26.0 (2026-03-19)

### Features

- add prompt-driven skill suggestion and learning capture

### Bug Fixes

- write builtin skills during init via writeSetup()

## v1.25.1 (2026-03-19)

### Bug Fixes

- **learn**: stale lock recovery, finalize visibility, learnings closed-loop

## v1.25.0 (2026-03-19)

### Features

- replace pre-commit hooks with config-file instructions
- add external context sources for multi-repo awareness (#33)
- **learn**: validate learning system with honest ROI, attribution, and user curation
- add GitHub Copilot support (#28)

### Bug Fixes

- use forward-slash paths in refresh writer for Windows compatibility
- use forward-slash paths in copilot writer for Windows compatibility

## v1.24.1 (2026-03-19)

## v1.24.0 (2026-03-18)

### Features

- **init**: update waiting cards to showcase full product value
- always-on learning, CI integration, and agent performance insights

### Bug Fixes

- show waiting cards sooner by adding preview staleness check
- add explicit vitest imports to test files for tsc compatibility
- add explicit vitest imports to new test files for tsc compatibility

### Refactoring

- **init**: extract helpers, add StreamParser, DRY mergeSkillResults

## v1.23.2 (2026-03-18)

### Bug Fixes

- **ci**: gate publish workflows on CI success via workflow_run
- **ci**: add tsc check to publish workflows to gate on type errors

## v1.23.1 (2026-03-18)

## v1.23.0 (2026-03-18)

### Features

- **llm**: cursor provider v2 + cross-provider hardening
- **fingerprint**: cache code analysis and LLM enrichment between runs
- **llm**: model-adaptive context budgets for prompt sizing
- **init**: pipeline flow UI with tree connectors and parallel header

### Bug Fixes

- **init**: show smart sampling message for large repos (>5K files)

### Refactoring

- **generate**: extract shared streaming logic and fix O(n²) hot paths

## v1.22.1 (2026-03-17)

### Bug Fixes

- **init**: eliminate UI lag between fingerprint and generation steps
- **claude-cli**: respect ANTHROPIC_SMALL_FAST_MODEL env var for fast model resolution
- **init**: cap prompt size and smart file tree sampling for large repos

## v1.22.0 (2026-03-17)

### Features

- **cursor**: two-tier model system and ask mode for faster responses
- **scoring**: auto-fix grounding, density, duplicates, and skills during init

### Bug Fixes

- **cursor**: skip duplicate final event in stream-json output
- **cursor**: sandbox workspace to /tmp and remove injection-triggering markers
- **cursor**: remove system/user markers that trigger injection detection
- **cursor**: add --trust flag required for headless print mode
- **cursor**: use temp dir as cwd to prevent agent from browsing repo
- **cursor**: add direct-LLM preamble to prevent agent behavior
- **cursor**: remove --mode ask that caused conversational responses
- increase skills search timeout and reduce fetch overhead
- **init**: widen task name column to prevent text overlap
- **cursor**: persistent ACP connection to eliminate per-call process overhead
- **cursor**: fix terminal corruption and scan model leak in cursor provider

### Refactoring

- **cursor**: switch from ACP to headless --print mode

## v1.21.3 (2026-03-17)

## v1.21.2 (2026-03-17)

## v1.21.1 (2026-03-16)

# Changelog

## v1.21.0 (2026-03-16)

### Features

- **ci**: auto-generate CHANGELOG.md on release (#24)
