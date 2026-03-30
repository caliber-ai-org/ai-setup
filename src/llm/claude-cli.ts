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

const CLAUDE_CLI_BIN = 'claude';
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const IS_WINDOWS = process.platform === 'win32';

function spawnClaude(args: string[]): ChildProcess {
  return IS_WINDOWS
    ? spawn([CLAUDE_CLI_BIN, ...args].join(' '), {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'] as const,
        env: process.env,
        shell: true,
      })
    : spawn(CLAUDE_CLI_BIN, args, {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
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

/** Whether the Claude Code CLI is on PATH (user has installed it and can run `claude -p`). */
export function isClaudeCliAvailable(): boolean {
  try {
    const cmd =
      process.platform === 'win32' ? `where ${CLAUDE_CLI_BIN}` : `which ${CLAUDE_CLI_BIN}`;
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
