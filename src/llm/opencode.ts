import { spawn, execSync, type ChildProcess } from 'node:child_process';
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

const OPENCODE_BIN = 'opencode';
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const IS_WINDOWS = process.platform === 'win32';

let cachedLoggedIn: boolean | null = null;

/** Reset the cached login status — used in tests. */
export function resetOpenCodeLoginCache(): void {
  cachedLoggedIn = null;
}

/** Whether the OpenCode CLI is on PATH (user has installed it and can run `opencode`). */
export function isOpenCodeAvailable(): boolean {
  try {
    const cmd = IS_WINDOWS ? `where ${OPENCODE_BIN}` : `which ${OPENCODE_BIN}`;
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Whether the user is logged in to OpenCode CLI. Uses `opencode auth status` for a zero-cost check. Result is cached for the process lifetime. */
export function isOpenCodeLoggedIn(): boolean {
  if (cachedLoggedIn !== null) return cachedLoggedIn;
  try {
    const result = execSync('opencode auth status', {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    });
    const output = result.toString().trim();
    try {
      const status = JSON.parse(output) as { loggedIn?: boolean };
      cachedLoggedIn = status.loggedIn === true;
    } catch {
      cachedLoggedIn = !output.toLowerCase().includes('not logged in');
    }
  } catch {
    cachedLoggedIn = false;
  }
  return cachedLoggedIn;
}

/**
 * Common spawn helper for OpenCode. Handles Windows vs Unix, env with OPENCODE_DISABLE_AUTOCOMPACT=TRUE.
 */
function spawnOpenCode(args: string[]): ChildProcess {
  const env = { ...process.env, OPENCODE_DISABLE_AUTOCOMPACT: 'TRUE' };
  if (IS_WINDOWS) {
    return spawn([OPENCODE_BIN, ...args].join(' '), {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'] as const,
      env,
      shell: true,
    });
  } else {
    return spawn(OPENCODE_BIN, args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'] as const,
      env,
    });
  }
}

/**
 * Run a non-streaming OpenCode command and return the stdout as string.
 * Handles timeout and error parsing.
 */
function runCommand(args: string[], input: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnOpenCode(args);
    const stderrChunks: Buffer[] = [];

    child.stdin!.end(input);

    let stdoutData = Buffer.alloc(0);
    child.stdout!.on('data', (chunk: Buffer) => {
      stdoutData = Buffer.concat([stdoutData, chunk]);
    });

    child.stderr!.on('data', (chunk: Buffer) => {
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
        const detail = friendly || stderr;
        reject(new Error(detail ? `${base}. ${detail}` : base));
      }
    });
  });
}

/**
 * Stream OpenCode response, parsing JSON lines for text events.
 */
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

    child.stdin!.end(input);

    child.stdout!.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      lineBuffer += text;
      const lines = lineBuffer.split('\n');
      // The last element may be incomplete; keep it in buffer.
      lineBuffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === 'text' && event.part?.text) {
            callbacks.onText(event.part.text);
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    });

    child.stderr!.on('data', (chunk: Buffer) => {
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
        // Process any remaining line buffer
        if (lineBuffer.trim()) {
          try {
            const event = JSON.parse(lineBuffer);
            if (event.type === 'text' && event.part?.text) {
              callbacks.onText(event.part.text);
            }
          } catch {
            // ignore
          }
        }
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

/**
 * OpenCode provider using the OpenCode CLI.
 */
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
    const args = ['run', '--format', 'json', '--model', model, '--', '-'];
    const result = await runCommand(args, combined, this.timeoutMs);
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
    const args = ['run', '--format', 'json', '--model', model, '--', '-'];
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
