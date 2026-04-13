import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { analyzeCode } from '../code-analysis.js';

describe('code-analysis secret exclusion', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caliber-ca-secrets-'));
    vi.spyOn(require('child_process'), 'execSync').mockReturnValue('');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('excludes .env files from analysis', () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), 'SECRET_KEY=supersecret123\nDB_PASSWORD=hunter2');
    fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'console.log("hello");');

    const result = analyzeCode(tmpDir);
    const paths = result.files.map(f => f.path);

    expect(paths).toContain('index.ts');
    expect(paths).not.toContain('.env');
  });

  it('excludes .env.local and .env.production variants', () => {
    fs.writeFileSync(path.join(tmpDir, '.env.local'), 'API_KEY=abc123');
    fs.writeFileSync(path.join(tmpDir, '.env.production'), 'DB_URL=postgres://secret');
    fs.writeFileSync(path.join(tmpDir, 'app.ts'), 'export const app = true;');

    const result = analyzeCode(tmpDir);
    const paths = result.files.map(f => f.path);

    expect(paths).toContain('app.ts');
    expect(paths).not.toContain('.env.local');
    expect(paths).not.toContain('.env.production');
  });

  it('sanitizes secrets that slip through in file content', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.ts'),
      'const key = "sk-ant-AAAAAAAAAAAAAAAAAAAAAA";\nexport default key;',
    );

    const result = analyzeCode(tmpDir);
    const configFile = result.files.find(f => f.path === 'config.ts');

    expect(configFile).toBeDefined();
    expect(configFile!.content).not.toContain('sk-ant-AAAAAAAAAAAAAAAAAAAAAA');
    expect(configFile!.content).toContain('[REDACTED]');
  });

  it('does not exclude non-secret config files', () => {
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{ "compilerOptions": {} }');
    fs.writeFileSync(path.join(tmpDir, 'config.yaml'), 'port: 3000');

    const result = analyzeCode(tmpDir);
    const paths = result.files.map(f => f.path);

    expect(paths).toContain('tsconfig.json');
    expect(paths).toContain('config.yaml');
  });
});
