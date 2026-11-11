import { spawn, execSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type {
  LLMProvider,
  LLMCallOptions,
  LLMStreamOptions,
  LLMStreamCallbacks,
  LLMConfig,
} from './types.js';
import { parseSeatBasedError } from './seat-based-errors.js';
import { trackUsage } from './usage.js';
import { estimateTokens } from './utils.js';
import { withCaliberSubprocessEnv } from '../lib/subprocess-sentinel.js';
import { parseOpenCodeOutput } from './opencode-output.js';

const OPENCODE_BIN = 'opencode';
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const IS_WINDOWS = process.platform === 'win32';

let cachedLoggedIn: boolean | null = null;

export function resetOpenCodeLoginCache(): void {
  cachedLoggedIn = null;
}

export function isOpenCodeAvailable(): boolean {
  try {
    const cmd = IS_WINDOWS ? `where ${OPENCODE_BIN}` : `which ${OPENCODE_BIN}`;
    execSync(cmd, { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export function parseOpenCodeAuthList(output: string): boolean | null {
  const plain = output.replace(/\u001b\[[0-9;]*m/g, '');
  const credentials = plain.match(/(\d+)\s+credentials?\b/i);
  const envVars = plain.match(/(\d+)\s+environment variables?\b/i);
  if (!credentials && !envVars) return null;
  return Number(credentials?.[1] ?? 0) > 0 || Number(envVars?.[1] ?? 0) > 0;
}

export function isOpenCodeLoggedIn(): boolean {
  if (cachedLoggedIn !== null) return cachedLoggedIn;
  try {
    const result = execSync('opencode auth list', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const parsed = parseOpenCodeAuthList(result.toString());
    cachedLoggedIn = parsed ?? result.toString().trim().length > 0;
  } catch {
    cachedLoggedIn = false;
  }
  return cachedLoggedIn;
}

function spawnOpenCode(args: string[]): ChildProcessWithoutNullStreams {
  const env = withCaliberSubprocessEnv({ ...process.env, OPENCODE_DISABLE_AUTOCOMPACT: 'TRUE' });
  if (IS_WINDOWS) {
    return spawn([OPENCODE_BIN, ...args].join(' '), {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'] as const,
      env,
      shell: true,
      windowsHide: true,
    });
  } else {
    return spawn(OPENCODE_BIN, args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'] as const,
      env,
      windowsHide: true,
    });
  }
}

function runCommand(args: string[], input: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnOpenCode(args);
    const stderrChunks: Buffer[] = [];

    child.stdin.end(input);

    let stdoutData = Buffer.alloc(0);
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutData = Buffer.concat([stdoutData, chunk]);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(
        new Error(
          `OpenCode timed out after ${timeoutMs / 1000}s. Set CALIBER_OPENCODE_TIMEOUT_MS to increase.`,
        ),
      );
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();
      if (code === 0) {
        resolve(stdoutData.toString('utf-8').trim());
      } else {
        const friendly = parseSeatBasedError(stderr, code);
        const base = signal
          ? `OpenCode killed (${signal})`
          : code != null
            ? `OpenCode exited with code ${code}`
            : 'OpenCode exited';
        const detail = friendly || stderr || stdoutData.toString('utf-8').trim();
        reject(new Error(detail ? `${base}. ${detail}` : base));
      }
    });
  });
}

function emitText(line: string, callbacks: LLMStreamCallbacks): void {
  try {
    const event = JSON.parse(line);
    if (event.type === 'text' && typeof event.part?.text === 'string') {
      callbacks.onText(event.part.text);
    }
  } catch {
    return;
  }
}

function runCommandStream(
  args: string[],
  input: string,
  callbacks: LLMStreamCallbacks,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnOpenCode(args);
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let lineBuffer = '';

    child.stdin.end(input);

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      lineBuffer += text;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';
      for (const line of lines) {
        emitText(line, callbacks);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      if (!settled) {
        settled = true;
        reject(
          new Error(
            `OpenCode timed out after ${timeoutMs / 1000}s. Set CALIBER_OPENCODE_TIMEOUT_MS to increase.`,
          ),
        );
      }
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) {
        emitText(lineBuffer, callbacks);
        callbacks.onEnd({ stopReason: 'end_turn' });
        resolve();
      } else {
        const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();
        const friendly = parseSeatBasedError(stderr, code);
        const base = signal
          ? `OpenCode killed (${signal})`
          : code != null
            ? `OpenCode exited with code ${code}`
            : 'OpenCode exited';
        const detail = friendly || stderr;
        reject(new Error(detail ? `${base}. ${detail}` : base));
      }
    });
  });
}

export class OpenCodeProvider implements LLMProvider {
  private defaultModel: string;
  private timeoutMs: number;

  constructor(config: LLMConfig) {
    this.defaultModel = config.model || 'default';
    const envTimeout = process.env.CALIBER_OPENCODE_TIMEOUT_MS;
    this.timeoutMs = envTimeout ? parseInt(envTimeout, 10) : DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1000) {
      this.timeoutMs = DEFAULT_TIMEOUT_MS;
    }
  }

  async call(options: LLMCallOptions): Promise<string> {
    const system = options.system || '';
    const prompt = options.prompt || '';
    const combined = system + '\n\n' + prompt;
    const model = options.model || this.defaultModel;
    const args = ['run', '--format', 'json', '--auto', '--model', model, '--', '-'];
    const result = parseOpenCodeOutput(await runCommand(args, combined, this.timeoutMs));
    trackUsage(model, {
      inputTokens: estimateTokens(combined),
      outputTokens: estimateTokens(result),
    });
    return result;
  }

  async stream(options: LLMStreamOptions, callbacks: LLMStreamCallbacks): Promise<void> {
    const system = options.system || '';
    const prompt = options.prompt || '';
    const combined = system + '\n\n' + prompt;
    const model = options.model || this.defaultModel;
    const args = ['run', '--format', 'json', '--auto', '--model', model, '--', '-'];
    const inputEstimate = estimateTokens(combined);
    let outputChars = 0;
    const wrappedCallbacks: LLMStreamCallbacks = {
      onText: (text) => {
        outputChars += text.length;
        callbacks.onText(text);
      },
      onEnd: (meta) => {
        trackUsage(model, {
          inputTokens: inputEstimate,
          outputTokens: Math.ceil(outputChars / 4),
        });
        callbacks.onEnd(meta);
      },
      onError: (err) => callbacks.onError(err),
    };
    return runCommandStream(args, combined, wrappedCallbacks, this.timeoutMs);
  }
}
