import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRIPT = path.resolve(process.cwd(), '.claude/hooks/caliber-check-sync.sh');

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caliber-hooks-test-'));
  fs.mkdirSync(path.join(dir, '.git', 'hooks'), { recursive: true });
  return dir;
}

function runScript(
  cwd: string,
  env: Record<string, string> = {},
): { status: number; stdout: string } {
  const result = spawnSync('sh', [SCRIPT], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf-8',
  });
  return { status: result.status ?? 1, stdout: (result.stdout ?? '') + (result.stderr ?? '') };
}

describe('caliber-check-sync.sh', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Clean up any flag files created during tests
    try {
      const files = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('caliber-nudge-'));
      for (const f of files) fs.unlinkSync(path.join(os.tmpdir(), f));
    } catch {
      // best-effort
    }
  });

  it('exits 0 immediately when CLAUDE_CODE_SIMPLE=1 (spawned by caliber)', () => {
    // This is the core bug: caliber spawns `claude -p` with CLAUDE_CODE_SIMPLE=1.
    // The Stop hook must not block in that context or it will cancel SessionEnd hooks,
    // causing Claude CLI to exit with code 1 and breaking `caliber refresh`.
    const { status, stdout } = runScript(tmpDir, { CLAUDE_CODE_SIMPLE: '1' });
    expect(status).toBe(0);
    expect(stdout).not.toContain('"decision":"block"');
  });

  it('exits 0 when caliber is present in the pre-commit hook', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.git', 'hooks', 'pre-commit'),
      '#!/bin/sh\ncaliber refresh\n',
    );
    const { status } = runScript(tmpDir);
    expect(status).toBe(0);
  });

  it('outputs block decision when caliber is not set up and flag is not set', () => {
    const { stdout } = runScript(tmpDir);
    expect(stdout).toContain('"decision":"block"');
  });

  it('exits 0 on second run (flag file prevents repeat prompt)', () => {
    // First run sets the flag
    runScript(tmpDir);
    // Second run should exit 0 silently
    const { status, stdout } = runScript(tmpDir);
    expect(status).toBe(0);
    expect(stdout).not.toContain('"decision":"block"');
  });
});
