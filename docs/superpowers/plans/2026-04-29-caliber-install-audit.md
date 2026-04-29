# Caliber Install + Value-Prop Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the audit defined in `docs/superpowers/specs/2026-04-29-caliber-install-audit-design.md` — produce a single prioritized findings doc proving (or disproving) that Caliber's install + generation + auto-refresh paths actually deliver value end-to-end for the eng-team-mixed-agents ICP.

**Architecture:** Read-only audit. Source code is read but not modified. Three live test repos created in `/tmp/` (synthetic, fresh `caliber` clone, fresh `vercel/swr` clone). Each task captures observations to a per-task notes file under `docs/superpowers/specs/audit-notes/`. Final task consolidates notes into the deliverable findings doc.

**Tech Stack:** Bash for repo setup and command execution, the locally-built `caliber` CLI (or `npx @rely-ai/caliber` for fresh-install simulation), Claude CLI (`claude -p`) as the LLM provider per the spec.

**Design spec:** `docs/superpowers/specs/2026-04-29-caliber-install-audit-design.md`

**Deliverable:** `docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md`

---

## Convention for this audit

- Every task writes a notes file: `docs/superpowers/specs/audit-notes/<NN>-<short-name>.md`.
- Each notes file uses the same template: **Context · Procedure · Observations · Severity-tagged findings · Open questions**.
- Severity tags: `[P0]` blocks install / data-loss-like, `[P1]` degrades trust / partial failure, `[P2]` polish.
- Commits land per task so the audit trail is reviewable. Commit message format: `audit: <task summary>`.
- Do NOT modify any `src/` file in this audit. If a fix is obvious, write it as a finding, not a code change.

---

## Phase 1 — Code + closed-issue audit (read-only)

### Task 1: Audit install entry-point source

**Files:**
- Read: `src/commands/bootstrap.ts`, `src/commands/init.ts`, `src/commands/init-helpers.ts`, `src/commands/init-prompts.ts`, `src/commands/init-display.ts`, `src/commands/interactive-provider-setup.ts`, `src/commands/setup-files.ts`
- Read: `scripts/postinstall.js`
- Read: `skills/setup-caliber/SKILL.md`
- Create: `docs/superpowers/specs/audit-notes/01-install-entry-points.md`

- [ ] **Step 1: Read every file in the file list above using the Read tool, in order**

- [ ] **Step 2: Capture observations to the notes file**

Write `docs/superpowers/specs/audit-notes/01-install-entry-points.md` using this template:

```markdown
# 01 — Install entry-point source audit

## Context
Read-only audit of the four entry points that lead a user to a working Caliber state:
- `caliber bootstrap` (CLI)
- `caliber init` (CLI)
- `npm install -g @rely-ai/caliber` postinstall message (stdout)
- `/setup-caliber` agent slash command (Markdown skill consumed by Claude/Cursor)

## Procedure
Read each file end-to-end. For each, capture: what it actually does, what it assumes about prior state, what fails silently, what fails loudly, and where the paths diverge or overlap.

## Observations

### bootstrap.ts
- (one paragraph: what it does, default behavior, side effects)

### init.ts (1024 lines)
- (one paragraph per major section: connect step, scan, target agent, generate, review)

### init-helpers.ts / init-prompts.ts / init-display.ts / interactive-provider-setup.ts / setup-files.ts
- (one paragraph each, focused on user-visible side effects)

### postinstall.js
- (what the user sees immediately after `npm install -g`)

### setup-caliber/SKILL.md
- (what the agent does step-by-step when invoked)

## Findings
- [P?] <one-line finding> — <file:line> — <suggested fix>
- ...

## Open questions
- ...
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/audit-notes/01-install-entry-points.md
git commit -m "audit: install entry-point source review"
```

---

### Task 2: Audit provider integrations

**Files:**
- Read: `src/llm/config.ts`, `src/llm/types.ts`, `src/llm/index.ts`
- Read: `src/llm/claude-cli.ts`, `src/llm/cursor-acp.ts`, `src/llm/anthropic.ts`, `src/llm/openai-compat.ts`, `src/llm/vertex.ts`
- Read: `src/llm/usage.ts`, `src/llm/model-recovery.ts`, `src/llm/seat-based-errors.ts`
- Create: `docs/superpowers/specs/audit-notes/02-providers.md`

- [ ] **Step 1: Read every file in the list above**

- [ ] **Step 2: Capture per-provider observations**

Write `docs/superpowers/specs/audit-notes/02-providers.md` using this template:

```markdown
# 02 — Provider integrations audit

## Context
Audit the five LLM providers Caliber claims to support, plus the shared config / types / model recovery layer. Live testing in this audit only covers Claude CLI; this file documents what we infer from code review for the other four.

## Per-provider audit

### claude-cli.ts (live-tested in Phase 2)
- Spawn pattern: ...
- Env var handling: (does it strip CLAUDE_CODE_* per #147 fix?)
- Auth detection: ...
- Known issues: #147, #138, #166

### cursor-acp.ts
- Spawn pattern (`agent --print --trust --workspace /tmp`): ...
- Stream-partial-output handling (timestamp_ms doubling): ...
- Known issues: #141

### anthropic.ts
- SDK version: ...
- Streaming behavior: ...
- Token tracking: ...

### openai-compat.ts
- max_tokens vs max_completion_tokens (#155): is it fixed?
- Custom base URL handling: ...

### vertex.ts
- Auth methods (project ID, service account, ADC): ...
- listModels() implementation status (TODOS.md P3): ...

## Findings
- [P?] ...

## Open questions
- ...
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/audit-notes/02-providers.md
git commit -m "audit: provider integrations review"
```

---

### Task 3: Audit generation, refresh, and hooks

**Files:**
- Read: `src/ai/generate.ts`, `src/ai/refine.ts`, `src/ai/refresh.ts`, `src/ai/detect.ts`, `src/ai/prompts.ts`, `src/ai/score-refine.ts`, `src/ai/stream-parser.ts`
- Read: `src/lib/hooks.ts`, `src/lib/learning-hooks.ts`, `src/lib/state.ts`, `src/lib/sanitize.ts`, `src/lib/lock.ts`
- Read: `src/writers/refresh.ts`, `src/writers/staging.ts`, `src/writers/backup.ts`, `src/writers/manifest.ts`, `src/writers/pre-commit-block.ts`
- Create: `docs/superpowers/specs/audit-notes/03-generation-refresh-hooks.md`

- [ ] **Step 1: Read every file in the list above**

- [ ] **Step 2: Capture observations**

Write `docs/superpowers/specs/audit-notes/03-generation-refresh-hooks.md`:

```markdown
# 03 — Generation, refresh, and hooks audit

## Context
The generation pipeline produces the configs Caliber's value claim depends on. The refresh pipeline keeps them accurate. The hooks make refresh automatic. Each layer is a place where the value claim can quietly fail.

## Generation pipeline (src/ai/)
- generate.ts entry path: ...
- Prompt construction (prompts.ts): generic vs codebase-grounded?
- Stream parsing: silent failures (#142, #143)?
- Refinement loop: terminates? bounded?

## Refresh pipeline (src/ai/refresh.ts + src/writers/refresh.ts)
- Inputs: git diff, what window?
- Outputs: which files get touched on a typical commit?
- Churn risk: noop diffs?

## Hooks (src/lib/hooks.ts, learning-hooks.ts)
- Pre-commit hook script: how robust to PATH issues, missing caliber binary?
- SessionEnd / Stop hook (#171, #169 cascade): is the cascade fix in place?
- Learning hooks: install footprint, idempotency

## Locks and state
- Lock file logic (src/lib/lock.ts): #150 false-positive resolved?
- State file: what's persisted? Recovery on corruption?

## Findings
- [P?] ...

## Open questions
- ...
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/audit-notes/03-generation-refresh-hooks.md
git commit -m "audit: generation, refresh, and hooks review"
```

---

### Task 4: Closed-issue pattern extraction

**Files:**
- Create: `docs/superpowers/specs/audit-notes/04-closed-issues.md`

- [ ] **Step 1: Pull each closed issue's body and conclusion**

Run for each issue ID:

```bash
for n in 147 184 138 149 135 155 171 169 166 177 150 142 143 141 140 139; do
  echo "=== Issue #$n ==="
  gh issue view $n --json title,state,body,comments | head -200
  echo
done
```

- [ ] **Step 2: Categorize by failure family**

Write `docs/superpowers/specs/audit-notes/04-closed-issues.md`:

```markdown
# 04 — Closed-issue pattern extraction

## Context
Caliber's closed issues are the historical record of what's actually broken in the wild. Group them into failure families so the live test in Phase 2 knows what to watch for.

## Failure families

### Family A: Auth / env-var leakage when invoked from inside agent CLI
- Issues: #147, #138, #166
- Mechanism: ...
- Fix landed in: <commit/version>
- Live-test verification: Phase 2 Path A on caliber dogfood reproduces this scenario

### Family B: Windows-specific path / shell issues
- Issues: #135, #134, #166, #191, #195, #200
- Mechanism: ...
- Fix landed in: ...
- Live-test verification: out of scope (audit runs on macOS)

### Family C: Recursive / cascading hooks
- Issues: #169, #171
- Mechanism: ...
- Fix landed in: ...
- Live-test verification: Phase 4 refresh test

### Family D: Provider-specific bugs
- Issues: #155 (OpenAI max_tokens), #141 (Cursor stream callback race)
- Mechanism: per-provider
- Live-test verification: code-audit only this session

### Family E: Silent failures / lost data
- Issues: #142 (skill generation swallowed), #143 (promise double-resolution), #149 (gitignored sources missed)
- Mechanism: ...
- Live-test verification: Phase 3 generation eval

### Family F: UX / messaging confusion
- Issues: #184 (Copilot misadvertised), #177 (wrong refresh options)
- Live-test verification: Phase 2 path observations

## Findings
- [P?] ...

## Open questions
- ...
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/audit-notes/04-closed-issues.md
git commit -m "audit: closed-issue pattern extraction"
```

---

## Phase 2 — Live install matrix

### Task 5: Pre-flight checks

**Files:**
- Create: `docs/superpowers/specs/audit-notes/05-preflight.md`

- [ ] **Step 1: Verify Claude CLI is installed and logged in**

Run:

```bash
command -v claude && claude --version
claude -p "respond with the single word ok"
```

Expected: `claude` resolves to a binary, version prints, response is `ok` or contains `ok`. If either fails, **STOP** and surface the missing precondition.

- [ ] **Step 2: Verify caliber CLI build is current**

Run:

```bash
cd /Users/alonpe/personal/caliber
npm run build 2>&1 | tail -20
ls -la dist/bin.js
node dist/bin.js --version
```

Expected: build succeeds, `dist/bin.js` exists, version matches `package.json` (`1.48.2`).

- [ ] **Step 3: Verify gh CLI for issue view (used in Task 4)**

Run: `gh auth status 2>&1 | head -5`
Expected: authenticated to github.com.

- [ ] **Step 4: Capture environment snapshot**

Write `docs/superpowers/specs/audit-notes/05-preflight.md`:

```markdown
# 05 — Pre-flight checks

## Environment
- OS: <output of `uname -a`>
- Node: <output of `node --version`>
- npm: <output of `npm --version`>
- Claude CLI: <version>
- Caliber: <version, built from local dist/>
- Git: <version>
- gh: <version>

## Claude CLI smoke test
- Command: `claude -p "respond with the single word ok"`
- Latency: <seconds>
- Output: <quoted>

## Decisions
- Using locally-built `node /Users/alonpe/personal/caliber/dist/bin.js` for tests, NOT `npx @rely-ai/caliber`. Reason: avoids npm cache hits to the published 1.48.2 (we want to test current source).
- For paths that explicitly test the "fresh user" experience (postinstall, npx-first-run), we'll do a one-off `npx @rely-ai/caliber@1.48.2` invocation in a clean dir to capture the actual published behavior.
```

Run the snapshot commands and paste actual output.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/audit-notes/05-preflight.md
git commit -m "audit: pre-flight environment snapshot"
```

---

### Task 6: Set up the three test repos

**Files:**
- Create: `/tmp/caliber-audit/synthetic/` (scaffolded TS+Python repo)
- Create: `/tmp/caliber-audit/caliber-dogfood/` (fresh clone)
- Create: `/tmp/caliber-audit/swr/` (fresh clone)
- Create: `docs/superpowers/specs/audit-notes/06-test-repo-setup.md`

- [ ] **Step 1: Make the audit workspace**

Run:

```bash
mkdir -p /tmp/caliber-audit
cd /tmp/caliber-audit
```

- [ ] **Step 2: Scaffold the synthetic repo**

Run:

```bash
mkdir -p /tmp/caliber-audit/synthetic
cd /tmp/caliber-audit/synthetic
git init -q

# .claude / .cursor / .github dirs to mimic mixed-agent eng team
mkdir -p .claude .cursor .github

# A small TS project
cat > package.json <<'EOF'
{
  "name": "synthetic-audit-app",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "dependencies": {
    "express": "^4.21.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "eslint": "^9.0.0"
  }
}
EOF

cat > tsconfig.json <<'EOF'
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "strict": true, "outDir": "dist" } }
EOF

mkdir -p src tests
cat > src/server.ts <<'EOF'
import express from 'express';
const app = express();
app.get('/health', (_req, res) => res.json({ ok: true }));
app.listen(3000);
EOF

cat > src/auth.ts <<'EOF'
export function verifyToken(token: string): boolean {
  return token.startsWith('valid-');
}
EOF

cat > tests/auth.test.ts <<'EOF'
import { test, expect } from 'vitest';
import { verifyToken } from '../src/server.js';
test('verifyToken', () => { expect(verifyToken('valid-x')).toBe(true); });
EOF

# A tiny python helper to make it polyglot
mkdir -p scripts
cat > scripts/migrate.py <<'EOF'
"""Run a no-op migration."""
def main(): print("migrate ok")
if __name__ == "__main__": main()
EOF

git add -A
git -c user.email=audit@local -c user.name=audit commit -q -m "init synthetic test repo"
echo "synthetic repo set up"
```

- [ ] **Step 3: Clone caliber dogfood**

Run:

```bash
cd /tmp/caliber-audit
git clone /Users/alonpe/personal/caliber caliber-dogfood
cd caliber-dogfood
# Reset to latest master to get a clean state
git checkout master -q
echo "caliber-dogfood ready at $(git rev-parse --short HEAD)"
```

- [ ] **Step 4: Clone vercel/swr**

Run:

```bash
cd /tmp/caliber-audit
git clone --depth 1 https://github.com/vercel/swr.git
cd swr
echo "swr ready at $(git rev-parse --short HEAD)"
ls -la | head -20
```

If clone fails (network, repo moved, etc.), fall back to:

```bash
cd /tmp/caliber-audit
git clone --depth 1 https://github.com/expressjs/express.git swr
mv swr swr-fallback-express
```

…and note the substitution in the notes file.

- [ ] **Step 5: Capture setup observations**

Write `docs/superpowers/specs/audit-notes/06-test-repo-setup.md`:

```markdown
# 06 — Test repo setup

## /tmp/caliber-audit/synthetic
- Files: <count from `git ls-files | wc -l`>
- Languages: TypeScript, Python
- Pre-existing agent dirs: .claude/, .cursor/, .github/ (all empty)

## /tmp/caliber-audit/caliber-dogfood
- HEAD: <short SHA>
- Files: <count>
- Pre-existing CLAUDE.md: yes (the canonical one we'll diff against)

## /tmp/caliber-audit/swr
- HEAD: <short SHA>
- Files: <count>
- Pre-existing agent configs: <list any found>

## Decisions
- All test repos live under /tmp/caliber-audit/. None of them touch the working caliber repo.
- Each Path A / Path B run starts from a fresh `git stash -u && git checkout master` to reset state. Document this in each per-task notes file.
```

- [ ] **Step 6: Commit**

```bash
cd /Users/alonpe/personal/caliber
git add docs/superpowers/specs/audit-notes/06-test-repo-setup.md
git commit -m "audit: test repo setup observations"
```

---

### Task 7: Run Path A on caliber dogfood (`bootstrap` → `/setup-caliber` in Claude)

**Files:**
- Mutates: `/tmp/caliber-audit/caliber-dogfood/` (test repo, expected)
- Create: `docs/superpowers/specs/audit-notes/07-path-a-dogfood.md`
- Create: `docs/superpowers/specs/audit-notes/07-path-a-dogfood-stdout.txt` (captured output)

- [ ] **Step 1: Reset the dogfood repo to a clean state**

Run:

```bash
cd /tmp/caliber-audit/caliber-dogfood
git stash -u 2>&1 | tail -1
git checkout master -q
git clean -fdx -e node_modules 2>&1 | tail -5
git status --short | head -10
```

Expected: clean working tree, on master.

- [ ] **Step 2: Run `caliber bootstrap`**

Run, capturing both stdout and exit code:

```bash
cd /tmp/caliber-audit/caliber-dogfood
script -q /dev/null node /Users/alonpe/personal/caliber/dist/bin.js bootstrap > /tmp/caliber-audit/07-bootstrap-stdout.txt 2>&1
echo "exit=$?"
cat /tmp/caliber-audit/07-bootstrap-stdout.txt
ls -la .claude/skills/ 2>/dev/null
```

Expected per `bootstrap.ts`: exit 0, skill files written under `.claude/skills/<skill-name>/SKILL.md`.

Capture: stdout, exit code, list of files written.

- [ ] **Step 3: Drive `/setup-caliber` via `claude -p`**

The `/setup-caliber` skill is a Markdown instruction file. To exercise it the way a real user would, invoke `claude -p` with an instruction equivalent to running the slash command:

```bash
cd /tmp/caliber-audit/caliber-dogfood
script -q /dev/null claude -p "Use the /setup-caliber skill to set up Caliber for this repo. Pick the solo-developer path when asked. Use the locally-installed caliber binary if available." \
  > /tmp/caliber-audit/07-setup-caliber-stdout.txt 2>&1
echo "exit=$?"
tail -100 /tmp/caliber-audit/07-setup-caliber-stdout.txt
```

Expected per `setup-caliber/SKILL.md`: agent runs `caliber hooks --install`, generates configs (or notes they exist), runs `caliber score`, possibly enables learning. Exit 0.

Capture: full stdout (already in file), what caliber commands the agent actually ran (grep for `caliber `), final state of `.git/hooks/pre-commit`.

- [ ] **Step 4: Inspect resulting state**

Run:

```bash
cd /tmp/caliber-audit/caliber-dogfood
echo '--- pre-commit hook ---'
cat .git/hooks/pre-commit 2>/dev/null | head -40
echo '--- generated/touched files ---'
git status --short
echo '--- caliber score ---'
node /Users/alonpe/personal/caliber/dist/bin.js score 2>&1 | head -30
```

- [ ] **Step 5: Capture observations**

Copy the captured stdout files into the notes dir:

```bash
mkdir -p /Users/alonpe/personal/caliber/docs/superpowers/specs/audit-notes/raw
cp /tmp/caliber-audit/07-bootstrap-stdout.txt /Users/alonpe/personal/caliber/docs/superpowers/specs/audit-notes/raw/07-path-a-dogfood-bootstrap.txt
cp /tmp/caliber-audit/07-setup-caliber-stdout.txt /Users/alonpe/personal/caliber/docs/superpowers/specs/audit-notes/raw/07-path-a-dogfood-setup.txt
```

Then write `docs/superpowers/specs/audit-notes/07-path-a-dogfood.md`:

```markdown
# 07 — Path A on caliber dogfood

## Context
Reproduce the README's headline install path on a fresh clone of caliber:
1. `caliber bootstrap` (CLI)
2. `/setup-caliber` (in Claude Code session)

Provider: Claude CLI seat. Both stdouts captured under `audit-notes/raw/07-*.txt`.

## Step 1: bootstrap
- Exit code: ...
- Latency: ...
- Files written:
  - .claude/skills/setup-caliber/SKILL.md
  - .claude/skills/find-skills/SKILL.md
  - .claude/skills/save-learning/SKILL.md
- User-visible message: <quoted>
- Cross-platform skill install: did it write to .cursor/ or only .claude/? ...

## Step 2: /setup-caliber via claude -p
- Exit code: ...
- Latency: ...
- caliber commands invoked by the agent: <list>
- pre-commit hook installed: yes/no
- caliber init run: yes/no, with what flags
- Final score: <X/100>
- Surprises: <any>

## Comparison to spec
- Did the user reach a working state? ...
- Did the user understand what was happening? <subjective: was the agent's narration clear?>
- Where did the user have to context-switch? ...

## Findings
- [P?] ...

## Open questions
- ...
```

- [ ] **Step 6: Commit**

```bash
cd /Users/alonpe/personal/caliber
git add docs/superpowers/specs/audit-notes/07-path-a-dogfood.md docs/superpowers/specs/audit-notes/raw/07-*.txt
git commit -m "audit: Path A (bootstrap + /setup-caliber) on caliber dogfood"
```

---

### Task 8: Run Path B on caliber dogfood (`init` wizard)

**Files:**
- Mutates: `/tmp/caliber-audit/caliber-dogfood/` (reset to clean first)
- Create: `docs/superpowers/specs/audit-notes/08-path-b-dogfood.md`
- Create: `docs/superpowers/specs/audit-notes/raw/08-path-b-dogfood-init.txt`

- [ ] **Step 1: Reset the dogfood repo**

Run:

```bash
cd /tmp/caliber-audit/caliber-dogfood
git stash -u 2>&1 | tail -1
git checkout master -q
git clean -fdx -e node_modules 2>&1 | tail -5
```

- [ ] **Step 2: Run `caliber init` non-interactively**

Per `init.ts`, the auto-approve path can run without prompts when a provider is already configured. We pass agents explicitly so we don't need agent-picker interaction:

```bash
cd /tmp/caliber-audit/caliber-dogfood
script -q /dev/null node /Users/alonpe/personal/caliber/dist/bin.js init --auto-approve --agent claude,cursor,github-copilot \
  > /tmp/caliber-audit/08-init-stdout.txt 2>&1
echo "exit=$?"
tail -120 /tmp/caliber-audit/08-init-stdout.txt
```

Expected: exit 0, configs generated for claude/cursor/copilot, hooks installed.

If the run prompts for provider config (which would mean no `~/.caliber/config.json` for the test session), capture that as a finding and re-run after configuring Claude CLI:

```bash
node /Users/alonpe/personal/caliber/dist/bin.js config --provider claude-cli
```

- [ ] **Step 3: Inspect resulting state**

Run:

```bash
cd /tmp/caliber-audit/caliber-dogfood
echo '--- file diff ---'
git status --short
echo '--- generated CLAUDE.md preview ---'
head -80 CLAUDE.md 2>/dev/null
echo '--- generated cursor rules ---'
ls .cursor/rules/ 2>/dev/null
echo '--- generated copilot ---'
head -40 .github/copilot-instructions.md 2>/dev/null
echo '--- pre-commit hook ---'
cat .git/hooks/pre-commit 2>/dev/null | head -40
echo '--- score ---'
node /Users/alonpe/personal/caliber/dist/bin.js score 2>&1 | head -30
```

- [ ] **Step 4: Capture observations**

Copy raw stdout and write notes:

```bash
cp /tmp/caliber-audit/08-init-stdout.txt /Users/alonpe/personal/caliber/docs/superpowers/specs/audit-notes/raw/08-path-b-dogfood-init.txt
```

Write `docs/superpowers/specs/audit-notes/08-path-b-dogfood.md` using the same template as Task 7's notes (Context · Procedure · Observations · Comparison · Findings · Open questions). Highlight any divergence between Path A and Path B end states.

- [ ] **Step 5: Commit**

```bash
cd /Users/alonpe/personal/caliber
git add docs/superpowers/specs/audit-notes/08-path-b-dogfood.md docs/superpowers/specs/audit-notes/raw/08-*.txt
git commit -m "audit: Path B (init wizard) on caliber dogfood"
```

---

### Task 9: Run Path A on `vercel/swr`

**Files:**
- Mutates: `/tmp/caliber-audit/swr/`
- Create: `docs/superpowers/specs/audit-notes/09-path-a-swr.md`
- Create: `docs/superpowers/specs/audit-notes/raw/09-path-a-swr-bootstrap.txt`, `raw/09-path-a-swr-setup.txt`

- [ ] **Step 1: Reset swr repo**

```bash
cd /tmp/caliber-audit/swr
git stash -u 2>&1 | tail -1
git clean -fdx 2>&1 | tail -5
git checkout main -q 2>/dev/null || git checkout master -q
```

- [ ] **Step 2: Run bootstrap**

```bash
cd /tmp/caliber-audit/swr
script -q /dev/null node /Users/alonpe/personal/caliber/dist/bin.js bootstrap > /tmp/caliber-audit/09-bootstrap.txt 2>&1
echo "exit=$?"
cat /tmp/caliber-audit/09-bootstrap.txt
ls -la .claude/skills/ 2>/dev/null
```

- [ ] **Step 3: Drive /setup-caliber via claude -p**

```bash
cd /tmp/caliber-audit/swr
script -q /dev/null claude -p "Use the /setup-caliber skill to set up Caliber. Pick solo-developer path. Use locally-installed caliber if available." \
  > /tmp/caliber-audit/09-setup.txt 2>&1
echo "exit=$?"
tail -100 /tmp/caliber-audit/09-setup.txt
```

- [ ] **Step 4: Inspect**

```bash
cd /tmp/caliber-audit/swr
git status --short
cat .git/hooks/pre-commit 2>/dev/null | head -20
node /Users/alonpe/personal/caliber/dist/bin.js score 2>&1 | head -30
ls CLAUDE.md .cursor/rules/ .github/copilot-instructions.md 2>/dev/null
```

- [ ] **Step 5: Capture and commit**

```bash
cp /tmp/caliber-audit/09-bootstrap.txt /Users/alonpe/personal/caliber/docs/superpowers/specs/audit-notes/raw/09-path-a-swr-bootstrap.txt
cp /tmp/caliber-audit/09-setup.txt /Users/alonpe/personal/caliber/docs/superpowers/specs/audit-notes/raw/09-path-a-swr-setup.txt
```

Write `09-path-a-swr.md` using the same notes template. Pay special attention to: did the LLM correctly identify swr as a React data-fetching library? Are referenced paths real?

```bash
cd /Users/alonpe/personal/caliber
git add docs/superpowers/specs/audit-notes/09-path-a-swr.md docs/superpowers/specs/audit-notes/raw/09-*.txt
git commit -m "audit: Path A on vercel/swr"
```

---

### Task 10: Run Path B on `vercel/swr`

**Files:**
- Mutates: `/tmp/caliber-audit/swr/`
- Create: `docs/superpowers/specs/audit-notes/10-path-b-swr.md`
- Create: `docs/superpowers/specs/audit-notes/raw/10-path-b-swr-init.txt`

- [ ] **Step 1: Reset**

```bash
cd /tmp/caliber-audit/swr
git stash -u 2>&1 | tail -1
git clean -fdx 2>&1 | tail -5
git checkout main -q 2>/dev/null || git checkout master -q
```

- [ ] **Step 2: Run init**

```bash
cd /tmp/caliber-audit/swr
script -q /dev/null node /Users/alonpe/personal/caliber/dist/bin.js init --auto-approve --agent claude,cursor,github-copilot \
  > /tmp/caliber-audit/10-init.txt 2>&1
echo "exit=$?"
tail -120 /tmp/caliber-audit/10-init.txt
```

- [ ] **Step 3: Inspect resulting state**

```bash
cd /tmp/caliber-audit/swr
echo '--- file diff ---'
git status --short
echo '--- generated CLAUDE.md preview ---'
head -80 CLAUDE.md 2>/dev/null
echo '--- generated cursor rules ---'
ls .cursor/rules/ 2>/dev/null
echo '--- generated copilot ---'
head -40 .github/copilot-instructions.md 2>/dev/null
echo '--- pre-commit hook ---'
cat .git/hooks/pre-commit 2>/dev/null | head -40
echo '--- score ---'
node /Users/alonpe/personal/caliber/dist/bin.js score 2>&1 | head -30
```

- [ ] **Step 4: Capture and commit**

```bash
cp /tmp/caliber-audit/10-init.txt /Users/alonpe/personal/caliber/docs/superpowers/specs/audit-notes/raw/10-path-b-swr-init.txt
```

Write `10-path-b-swr.md`. Then:

```bash
cd /Users/alonpe/personal/caliber
git add docs/superpowers/specs/audit-notes/10-path-b-swr.md docs/superpowers/specs/audit-notes/raw/10-*.txt
git commit -m "audit: Path B on vercel/swr"
```

---

### Task 11: Run Path A on synthetic repo

**Files:**
- Mutates: `/tmp/caliber-audit/synthetic/`
- Create: `docs/superpowers/specs/audit-notes/11-path-a-synthetic.md`
- Create: `docs/superpowers/specs/audit-notes/raw/11-*.txt`

- [ ] **Step 1: Reset synthetic repo**

```bash
cd /tmp/caliber-audit/synthetic
git stash -u 2>&1 | tail -1
git clean -fdx 2>&1 | tail -5
git checkout master -q 2>/dev/null || git checkout main -q
```

- [ ] **Step 2: Run bootstrap**

```bash
cd /tmp/caliber-audit/synthetic
script -q /dev/null node /Users/alonpe/personal/caliber/dist/bin.js bootstrap > /tmp/caliber-audit/11-bootstrap.txt 2>&1
echo "exit=$?"
ls -la .claude/skills/ .cursor/skills/ 2>/dev/null
```

Note: synthetic repo has both `.claude/` and `.cursor/` dirs pre-created — check that bootstrap detects both and writes to both.

- [ ] **Step 3: Drive /setup-caliber**

```bash
cd /tmp/caliber-audit/synthetic
script -q /dev/null claude -p "Use the /setup-caliber skill to set up Caliber. Pick solo-developer path. Use locally-installed caliber if available." \
  > /tmp/caliber-audit/11-setup.txt 2>&1
echo "exit=$?"
tail -100 /tmp/caliber-audit/11-setup.txt
```

- [ ] **Step 4: Inspect resulting state**

```bash
cd /tmp/caliber-audit/synthetic
echo '--- file diff ---'
git status --short
echo '--- generated CLAUDE.md preview ---'
head -80 CLAUDE.md 2>/dev/null
echo '--- generated cursor rules ---'
ls .cursor/rules/ 2>/dev/null
echo '--- generated copilot ---'
head -40 .github/copilot-instructions.md 2>/dev/null
echo '--- pre-commit hook ---'
cat .git/hooks/pre-commit 2>/dev/null | head -40
echo '--- score ---'
node /Users/alonpe/personal/caliber/dist/bin.js score 2>&1 | head -30
```

- [ ] **Step 5: Capture and commit**

```bash
cp /tmp/caliber-audit/11-bootstrap.txt /Users/alonpe/personal/caliber/docs/superpowers/specs/audit-notes/raw/11-path-a-synthetic-bootstrap.txt
cp /tmp/caliber-audit/11-setup.txt /Users/alonpe/personal/caliber/docs/superpowers/specs/audit-notes/raw/11-path-a-synthetic-setup.txt
```

Write `11-path-a-synthetic.md`. Then:

```bash
cd /Users/alonpe/personal/caliber
git add docs/superpowers/specs/audit-notes/11-path-a-synthetic.md docs/superpowers/specs/audit-notes/raw/11-*.txt
git commit -m "audit: Path A on synthetic repo"
```

---

### Task 12: Run Path B on synthetic repo

**Files:**
- Mutates: `/tmp/caliber-audit/synthetic/`
- Create: `docs/superpowers/specs/audit-notes/12-path-b-synthetic.md`
- Create: `docs/superpowers/specs/audit-notes/raw/12-path-b-synthetic-init.txt`

- [ ] **Step 1: Reset**

```bash
cd /tmp/caliber-audit/synthetic
git stash -u 2>&1 | tail -1
git clean -fdx 2>&1 | tail -5
git checkout master -q 2>/dev/null || git checkout main -q
```

- [ ] **Step 2: Run init**

```bash
cd /tmp/caliber-audit/synthetic
script -q /dev/null node /Users/alonpe/personal/caliber/dist/bin.js init --auto-approve --agent claude,cursor,github-copilot \
  > /tmp/caliber-audit/12-init.txt 2>&1
echo "exit=$?"
tail -120 /tmp/caliber-audit/12-init.txt
```

- [ ] **Step 3: Inspect resulting state**

```bash
cd /tmp/caliber-audit/synthetic
echo '--- file diff ---'
git status --short
echo '--- generated CLAUDE.md preview ---'
head -80 CLAUDE.md 2>/dev/null
echo '--- generated cursor rules ---'
ls .cursor/rules/ 2>/dev/null
echo '--- generated copilot ---'
head -40 .github/copilot-instructions.md 2>/dev/null
echo '--- pre-commit hook ---'
cat .git/hooks/pre-commit 2>/dev/null | head -40
echo '--- score ---'
node /Users/alonpe/personal/caliber/dist/bin.js score 2>&1 | head -30
```

- [ ] **Step 4: Capture and commit**

```bash
cp /tmp/caliber-audit/12-init.txt /Users/alonpe/personal/caliber/docs/superpowers/specs/audit-notes/raw/12-path-b-synthetic-init.txt
```

Write `12-path-b-synthetic.md`. Then:

```bash
cd /Users/alonpe/personal/caliber
git add docs/superpowers/specs/audit-notes/12-path-b-synthetic.md docs/superpowers/specs/audit-notes/raw/12-*.txt
git commit -m "audit: Path B on synthetic repo"
```

---

## Phase 3 — Generation quality eval

### Task 13: Grade caliber dogfood output

**Files:**
- Read: `/tmp/caliber-audit/caliber-dogfood/CLAUDE.md`, `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`, `AGENTS.md` (whichever Path B produced — Path B's outputs were the most recent)
- Read: `/Users/alonpe/personal/caliber/CLAUDE.md` (the canonical hand-curated baseline)
- Create: `docs/superpowers/specs/audit-notes/13-quality-dogfood.md`

- [ ] **Step 1: Re-run Path B to get a clean output set**

Reset and re-run init so the quality eval is on a known-fresh state:

```bash
cd /tmp/caliber-audit/caliber-dogfood
git stash -u 2>&1 | tail -1
git clean -fdx -e node_modules 2>&1 | tail -5
git checkout master -q
node /Users/alonpe/personal/caliber/dist/bin.js init --auto-approve --agent claude,cursor,github-copilot 2>&1 | tail -30
```

- [ ] **Step 2: Read and grade**

For each generated file, evaluate against the rubric:

| Criterion | What to check |
|-----------|---------------|
| Specificity | Does it reference real files in the codebase? Real commands from package.json? |
| Accuracy | Pick 5 referenced paths and `ls` each. How many exist? |
| Conventions | Does it capture the conventions from the canonical CLAUDE.md (ESM `.js` imports, `unknown` over `any`, etc.)? |
| Cross-agent parity | Compare CLAUDE.md vs Cursor rules vs Copilot — equally informative? Or one is degraded? |
| Token efficiency | Word count vs canonical |
| Comparison to canonical | What's missing? What's extra? What's wrong? |

- [ ] **Step 3: Write the eval**

Write `docs/superpowers/specs/audit-notes/13-quality-dogfood.md`:

```markdown
# 13 — Generation quality: caliber dogfood

## Context
Caliber generated configs for itself. The canonical hand-curated CLAUDE.md is the gold-standard baseline.

## Generated CLAUDE.md
- Word count: ... (canonical: ...)
- Sample-of-5 path accuracy: <N/5 exist>
- Captures key conventions: ESM imports? unknown-over-any? next vs master branch? ...
- Verdict: <green/yellow/red>

## Generated .cursor/rules/
- File count: ...
- Frontmatter present (description, globs, alwaysApply): ...
- Verdict: ...

## Generated .github/copilot-instructions.md
- Word count: ...
- Specific or generic? ...
- Verdict: ...

## Cross-agent parity
- Are the three outputs equally useful, or is one obviously degraded?
- ...

## Comparison to canonical CLAUDE.md
- Missing: ...
- Extra (potentially noise): ...
- Wrong: ...

## Findings
- [P?] ...
```

- [ ] **Step 4: Commit**

```bash
cd /Users/alonpe/personal/caliber
git add docs/superpowers/specs/audit-notes/13-quality-dogfood.md
git commit -m "audit: generation quality eval — caliber dogfood"
```

---

### Task 14: Grade `vercel/swr` output

**Files:**
- Read: `/tmp/caliber-audit/swr/CLAUDE.md`, `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`
- Create: `docs/superpowers/specs/audit-notes/14-quality-swr.md`

- [ ] **Step 1: Re-run Path B for clean output**

```bash
cd /tmp/caliber-audit/swr
git stash -u 2>&1 | tail -1
git clean -fdx 2>&1 | tail -5
git checkout main -q 2>/dev/null || git checkout master -q
node /Users/alonpe/personal/caliber/dist/bin.js init --auto-approve --agent claude,cursor,github-copilot 2>&1 | tail -30
```

- [ ] **Step 2: Grade against rubric**

For swr, "canonical" doesn't exist (no human-curated baseline to compare against). Grade on:
- Did Caliber correctly identify the project (React data-fetching library)?
- Are the build/test commands real (`pnpm build`, `pnpm test`, etc., per swr's actual scripts)?
- Does CLAUDE.md mention key swr concepts (cache, mutate, fallback)?
- Are 5 sampled file paths real?

- [ ] **Step 3: Write the eval**

Write `docs/superpowers/specs/audit-notes/14-quality-swr.md` with the same structure as Task 13's eval, minus the canonical comparison.

- [ ] **Step 4: Commit**

```bash
cd /Users/alonpe/personal/caliber
git add docs/superpowers/specs/audit-notes/14-quality-swr.md
git commit -m "audit: generation quality eval — vercel/swr"
```

---

### Task 15: Grade synthetic repo output

**Files:**
- Read: `/tmp/caliber-audit/synthetic/CLAUDE.md`, etc.
- Create: `docs/superpowers/specs/audit-notes/15-quality-synthetic.md`

- [ ] **Step 1: Re-run Path B for clean output**

```bash
cd /tmp/caliber-audit/synthetic
git stash -u 2>&1 | tail -1
git clean -fdx 2>&1 | tail -5
git checkout master -q 2>/dev/null || git checkout main -q
node /Users/alonpe/personal/caliber/dist/bin.js init --auto-approve --agent claude,cursor,github-copilot 2>&1 | tail -30
```

- [ ] **Step 2: Grade against rubric**

Synthetic is small (~10 files). Caliber should easily and accurately describe it. Anything generic or wrong is a serious finding because there's no excuse on a small known repo.

Check:
- Does it identify Express + vitest + the polyglot Python helper?
- Does it reference `src/server.ts`, `src/auth.ts`, `tests/auth.test.ts`?
- Does it capture the (intentional) bug we planted: the test imports `verifyToken` from `../src/server.js` but the function is in `auth.ts`? (If Caliber notices, that's bonus signal; if not, no penalty — that's a code review concern, not a config-gen concern.)

- [ ] **Step 3: Write the eval**

Write `docs/superpowers/specs/audit-notes/15-quality-synthetic.md`.

- [ ] **Step 4: Commit**

```bash
cd /Users/alonpe/personal/caliber
git add docs/superpowers/specs/audit-notes/15-quality-synthetic.md
git commit -m "audit: generation quality eval — synthetic repo"
```

---

## Phase 4 — Auto-refresh test

### Task 16: Refresh-on-commit test on caliber dogfood

**Files:**
- Mutates: `/tmp/caliber-audit/caliber-dogfood/`
- Create: `docs/superpowers/specs/audit-notes/16-refresh.md`
- Create: `docs/superpowers/specs/audit-notes/raw/16-refresh-*.txt`

- [ ] **Step 1: Confirm pre-commit hook is installed**

```bash
cd /tmp/caliber-audit/caliber-dogfood
cat .git/hooks/pre-commit | head -40
```

If missing, install: `node /Users/alonpe/personal/caliber/dist/bin.js hooks --install`.

- [ ] **Step 2: Make a representative code change**

Pick a renamed-file change (the kind of change that historically broke stale CLAUDE.md docs):

```bash
cd /tmp/caliber-audit/caliber-dogfood
git mv src/lib/builtin-skills.ts src/lib/skills-registry.ts
files=$(grep -rl 'src/lib/builtin-skills\|builtin-skills\.js' src/ 2>/dev/null)
if [ -n "$files" ]; then
  echo "$files" | xargs sed -i.bak 's|builtin-skills|skills-registry|g'
  find src -name '*.bak' -delete
fi
git add -A
git status --short | head -10
```

- [ ] **Step 3: Commit and observe pre-commit hook**

```bash
cd /tmp/caliber-audit/caliber-dogfood
script -q /dev/null git commit -m "refactor: rename builtin-skills to skills-registry" \
  > /tmp/caliber-audit/16-commit.txt 2>&1
echo "exit=$?"
cat /tmp/caliber-audit/16-commit.txt
```

Expected: pre-commit hook runs `caliber refresh`, refresh updates any CLAUDE.md / cursor-rules entries that referenced `builtin-skills`, refresh stages the updated configs, commit succeeds.

- [ ] **Step 4: Inspect what refresh did**

```bash
cd /tmp/caliber-audit/caliber-dogfood
git show --stat HEAD
echo '--- updated CLAUDE.md regions ---'
git show HEAD -- CLAUDE.md | head -60
echo '--- still references the old name? ---'
grep -rn builtin-skills CLAUDE.md .cursor/rules/ AGENTS.md .github/copilot-instructions.md 2>/dev/null || echo "none"
```

Verify: no stale references to `builtin-skills` in the regenerated configs.

- [ ] **Step 5: Test churn — make a no-op commit and check for spurious changes**

```bash
cd /tmp/caliber-audit/caliber-dogfood
echo "" >> README.md
git add README.md
script -q /dev/null git commit -m "chore: trailing newline" \
  > /tmp/caliber-audit/16-noop-commit.txt 2>&1
echo "exit=$?"
git show --stat HEAD
```

Verify: only README.md is in the commit. No spurious config changes.

- [ ] **Step 6: Capture and commit**

```bash
cp /tmp/caliber-audit/16-commit.txt /Users/alonpe/personal/caliber/docs/superpowers/specs/audit-notes/raw/16-refresh-commit.txt
cp /tmp/caliber-audit/16-noop-commit.txt /Users/alonpe/personal/caliber/docs/superpowers/specs/audit-notes/raw/16-refresh-noop.txt
```

Write `docs/superpowers/specs/audit-notes/16-refresh.md`:

```markdown
# 16 — Auto-refresh test

## Context
Test that the pre-commit hook (a) fires, (b) regenerates configs to reflect the rename, (c) does not cause churn on no-op commits, (d) does not trigger recursive Stop hook cascades (#171, #169).

## Step 2-3: Renamed file
- Renamed: src/lib/builtin-skills.ts → src/lib/skills-registry.ts
- Pre-commit hook fired: yes/no
- Hook output (excerpt): ...
- Caliber commands invoked: ...
- Configs updated: <list>
- Stale references to old name in updated configs: <yes/no, where>
- Latency of pre-commit hook: ...

## Step 5: Churn test (no-op commit)
- README.md trailing newline only
- Hook fired: yes/no
- Spurious config changes: <none / list>
- Latency: ...

## Recursion test
- During the rename commit, was there any sign of the Stop hook firing recursively?
- Look for repeated `caliber refresh` invocations in the captured stdout.

## Findings
- [P?] ...
```

- [ ] **Step 7: Commit**

```bash
cd /Users/alonpe/personal/caliber
git add docs/superpowers/specs/audit-notes/16-refresh.md docs/superpowers/specs/audit-notes/raw/16-*.txt
git commit -m "audit: pre-commit refresh + churn test"
```

---

## Phase 5 — Synthesize findings

### Task 17: Write the consolidated findings doc

**Files:**
- Read: every notes file in `docs/superpowers/specs/audit-notes/01-16-*.md`
- Create: `docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md`

- [ ] **Step 1: Read every per-task notes file**

```bash
ls docs/superpowers/specs/audit-notes/*.md | sort
```

Read each in order (1 through 16) and accumulate findings.

- [ ] **Step 2: Write the findings doc**

Write `docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md`:

```markdown
# Caliber install + value-prop audit — findings

**Date:** 2026-04-29
**Owner:** Alon Peretz
**Status:** Audit complete
**Design spec:** `docs/superpowers/specs/2026-04-29-caliber-install-audit-design.md`

---

## Executive summary

**Verdict:** <green = ship messaging redesign now / yellow = fix the P0/P1s first / red = significant tech debt to clear before any messaging investment makes sense>

**Top 3 things to fix before touching the README:**
1. ...
2. ...
3. ...

**What works well:**
- ...
- ...

---

## Findings

### P0 — Blocks install or causes data-loss-like outcomes

#### F-P0-1: <one-line>
- **Reproduction:** ...
- **Root cause:** <file:line>
- **Suggested fix:** ...
- **Source notes:** `audit-notes/<NN>-*.md`

#### F-P0-2: ...

(Repeat per finding. If no P0s, write: "No P0 findings — install completes from all tested entry points.")

### P1 — Degrades trust or partial failures

(Same template.)

### P2 — Polish

(Same template.)

---

## Provider matrix

| Provider | Live tested | Code audited | Status | Risk flags |
|----------|-------------|--------------|--------|------------|
| Claude CLI seat | yes | yes | <green/yellow/red> | <list> |
| Anthropic API | no | yes | code-only | <list> |
| Cursor seat | no | yes | code-only | <list> |
| OpenAI | no | yes | code-only — verify #155 fix | <list> |
| Vertex AI | no | yes | code-only — listModels() unimplemented | <list> |

---

## Generation quality summary

| Repo | Specificity | Accuracy | Cross-agent parity | Verdict |
|------|-------------|----------|--------------------|---------|
| caliber dogfood | <X/10> | <N/5 paths> | <green/yellow/red> | ... |
| vercel/swr | <X/10> | <N/5 paths> | ... | ... |
| synthetic | <X/10> | <N/5 paths> | ... | ... |

---

## Auto-refresh summary

- Pre-commit hook fires reliably: <yes/no>
- Updates configs to reflect renamed files: <yes/no>
- No spurious changes on no-op commits: <yes/no>
- No recursive hook cascade observed: <yes/no>

---

## Install model recommendation

Based on observations from Path A and Path B across all three repos:

- **Recommendation:** <consolidate to one path / keep both with clearer disambiguation / re-architect>
- **Reasoning:** ...
- **What to deprecate:** ...
- **What to add:** ...

---

## Open product questions

Decisions required before fixes can be planned:
1. ...
2. ...

---

## Appendix: Notes index

- 01 — Install entry-point source audit
- 02 — Provider integrations audit
- 03 — Generation, refresh, hooks audit
- 04 — Closed-issue pattern extraction
- 05 — Pre-flight environment snapshot
- 06 — Test repo setup
- 07 — Path A on caliber dogfood
- 08 — Path B on caliber dogfood
- 09 — Path A on vercel/swr
- 10 — Path B on vercel/swr
- 11 — Path A on synthetic
- 12 — Path B on synthetic
- 13 — Generation quality: caliber dogfood
- 14 — Generation quality: vercel/swr
- 15 — Generation quality: synthetic
- 16 — Auto-refresh test
```

Fill in every `...` with concrete content from the notes files. **No placeholders remain.**

- [ ] **Step 3: Commit**

```bash
cd /Users/alonpe/personal/caliber
git add docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md
git commit -m "audit: consolidated findings doc"
```

---

## Cleanup (optional, after user reviews findings)

- `/tmp/caliber-audit/` test repos can be removed once findings are reviewed.
- The `audit-notes/raw/` stdout captures stay in the repo as evidence.
