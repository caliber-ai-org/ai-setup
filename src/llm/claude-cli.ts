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

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const IS_WINDOWS = process.platform === 'win32';

/**
 * Resolve the `claude` binary to an absolute path so spawn and execSync calls
 * work even when $PATH is stripped (e.g. Claude Code hook subprocesses on macOS
 * only have /usr/bin:/bin:/usr/sbin:/sbin).  Resolved once and cached.
 */
function resolveClaudeBin(): string {
  try {
    const whichCmd = IS_WINDOWS ? 'where claude' : 'which claude';
    const out = execSync(whichCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const p = out.split('\n')[0].trim();
    if (p) return p;
  } catch {
    // not on PATH — fall back to bare name
  }
  return 'claude';
}

const CLAUDE_CLI_BIN = resolveClaudeBin();

function spawnClaude(args: string[]): ChildProcess {
  const env = { ...process.env, CLAUDE_CODE_SIMPLE: '1' };
  return IS_WINDOWS
    ? spawn([CLAUDE_CLI_BIN, ...args].join(' '), {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'] as const,
        env,
        shell: true,
      })
    : spawn(CLAUDE_CLI_BIN, args, {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
      });
}

/**
 * Provider that uses the Claude Code CLI (`claude -p "..."`).
 * Uses the user's stored Claude Code login (Pro/Max/Team) — no API key required
 * if they have run `claude` once and logged in.
 * See https://code.claude.com/docs/en/headless
 */
export class ClaudeCliProvider implements LLMProvider {
  private defaultModel: string;
  private timeoutMs: number;

  constructor(config: LLMConfig) {
    this.defaultModel = config.model || 'default';
    const envTimeout = process.env.CALIBER_CLAUDE_CLI_TIMEOUT_MS;
    this.timeoutMs = envTimeout ? parseInt(envTimeout, 10) : DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1000) {
      this.timeoutMs = DEFAULT_TIMEOUT_MS;
    }
  }

  async call(options: LLMCallOptions): Promise<string> {
    const combined = this.buildCombinedPrompt(options);
    const result = await this.runClaudePrint(combined, options.model);
    trackUsage(options.model || this.defaultModel, {
      inputTokens: estimateTokens(combined),
      outputTokens: estimateTokens(result),
    });
    return result;
  }

  async stream(options: LLMStreamOptions, callbacks: LLMStreamCallbacks): Promise<void> {
    const combined = this.buildCombinedPrompt(options);
    const inputEstimate = estimateTokens(combined);
    const args = ['-p'];
    if (options.model) args.push('--model', options.model);
    const child = spawnClaude(args);
    child.stdin!.end(combined);

    let settled = false;
    let outputChars = 0;
    const chunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout!.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      const text = chunk.toString('utf-8');
      outputChars += text.length;
      callbacks.onText(text);
    });

    child.stderr!.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      if (!settled) {
        settled = true;
        callbacks.onError(
          new Error(
            `Claude CLI timed out after ${this.timeoutMs / 1000}s. Set CALIBER_CLAUDE_CLI_TIMEOUT_MS to increase.`,
          ),
        );
      }
    }, this.timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        callbacks.onError(err);
      }
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) {
        const model = options.model || this.defaultModel;
        trackUsage(model, {
          inputTokens: inputEstimate,
          outputTokens: Math.ceil(outputChars / 4),
        });
        callbacks.onEnd({ stopReason: 'end_turn' });
      } else {
        const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();
        const friendly = parseSeatBasedError(stderr, code);
        const stdout = Buffer.concat(chunks).toString('utf-8').trim();
        const base = signal
          ? `Claude CLI killed (${signal})`
          : code != null
            ? `Claude CLI exited with code ${code}`
            : 'Claude CLI exited';
        const detail = friendly || stderr || (stdout ? stdout.slice(0, 200) : '');
        callbacks.onError(new Error(detail ? `${base}. ${detail}` : base));
      }
    });
  }

  private buildCombinedPrompt(options: LLMCallOptions | LLMStreamOptions): string {
    const streamOpts = options as LLMStreamOptions;
    const hasHistory = streamOpts.messages && streamOpts.messages.length > 0;
    let combined = options.system + '\n\n';

    if (hasHistory) {
      for (const msg of streamOpts.messages!) {
        const label = msg.role === 'user' ? 'User' : 'Assistant';
        combined += `${label}: ${msg.content}\n\n`;
      }
    }

    combined += options.prompt;
    return combined;
  }

  private runClaudePrint(combinedPrompt: string, model?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = ['-p'];
      if (model) args.push('--model', model);
      const child = spawnClaude(args);
      child.stdin!.end(combinedPrompt);

      const chunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout!.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.stderr!.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        const stdout = Buffer.concat(chunks).toString('utf-8').trim();
        if (code === 0) {
          resolve(stdout);
        } else {
          const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();
          const friendly = parseSeatBasedError(stderr, code);
          const base = signal
            ? `Claude CLI killed (${signal})`
            : code != null
              ? `Claude CLI exited with code ${code}`
              : 'Claude CLI exited';
          const detail = friendly || stderr || (stdout ? stdout.slice(0, 200) : '');
          reject(new Error(detail ? `${base}. ${detail}` : base));
        }
      });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(
          new Error(
            `Claude CLI timed out after ${this.timeoutMs / 1000}s. Set CALIBER_CLAUDE_CLI_TIMEOUT_MS to increase.`,
          ),
        );
      }, this.timeoutMs);
    });
  }
}

/** Whether the Claude Code CLI is available (resolved to absolute path or on PATH). */
export function isClaudeCliAvailable(): boolean {
  // resolveClaudeBin() returns an absolute path when `which claude` succeeded,
  // or falls back to bare 'claude'. If we got an absolute path, the binary exists.
  if (CLAUDE_CLI_BIN !== 'claude') return true;
  try {
    execSync(IS_WINDOWS ? 'where claude' : 'which claude', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

let cachedLoggedIn: boolean | null = null;

/** Reset the cached login status — used in tests. */
export function resetClaudeCliLoginCache(): void {
  cachedLoggedIn = null;
}

/** Whether the user is logged in to Claude Code CLI. Uses `claude auth status` for a zero-cost check. Result is cached for the process lifetime. */
export function isClaudeCliLoggedIn(): boolean {
  if (cachedLoggedIn !== null) return cachedLoggedIn;
  try {
    const result = execSync(`${CLAUDE_CLI_BIN} auth status`, {
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
