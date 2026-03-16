import { spawn, execSync } from 'node:child_process';
import type { LLMProvider, LLMCallOptions, LLMStreamOptions, LLMStreamCallbacks, LLMConfig } from './types.js';

const CLAUDE_CLI_BIN = 'claude';
/** Max time for a single claude -p invocation (e.g. long generation). */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const IS_WINDOWS = process.platform === 'win32';

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
    return this.runClaudePrint(combined, options.model);
  }

  async stream(options: LLMStreamOptions, callbacks: LLMStreamCallbacks): Promise<void> {
    const combined = this.buildCombinedPrompt(options);
    const args = ['-p'];
    if (options.model) args.push('--model', options.model);
    const child = spawn(CLAUDE_CLI_BIN, args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'inherit'],
      env: process.env,
      ...(IS_WINDOWS && { shell: true }),
    });
    child.stdin!.end(combined);

    let settled = false;
    const chunks: Buffer[] = [];

    child.stdout!.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      callbacks.onText(chunk.toString('utf-8'));
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      if (!settled) {
        settled = true;
        callbacks.onError(
          new Error(
            `Claude CLI timed out after ${this.timeoutMs / 1000}s. Set CALIBER_CLAUDE_CLI_TIMEOUT_MS to increase.`
          )
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
        callbacks.onEnd({ stopReason: 'end_turn' });
      } else {
        const stdout = Buffer.concat(chunks).toString('utf-8').trim();
        const msg = signal
          ? `Claude CLI killed (${signal})`
          : code != null
            ? `Claude CLI exited with code ${code}`
            : 'Claude CLI exited';
        callbacks.onError(new Error(stdout ? `${msg}. Output: ${stdout.slice(0, 200)}` : msg));
      }
    });
  }

  private buildCombinedPrompt(options: LLMCallOptions | LLMStreamOptions): string {
    const streamOpts = options as LLMStreamOptions;
    const hasHistory = streamOpts.messages && streamOpts.messages.length > 0;
    let combined = '';

    combined += '[[System]]\n' + options.system + '\n\n';

    if (hasHistory) {
      for (const msg of streamOpts.messages!) {
        combined += `[[${msg.role === 'user' ? 'User' : 'Assistant'}]]\n${msg.content}\n\n`;
      }
    }

    combined += '[[User]]\n' + options.prompt;
    return combined;
  }

  private runClaudePrint(combinedPrompt: string, model?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = ['-p'];
      if (model) args.push('--model', model);
      const child = spawn(CLAUDE_CLI_BIN, args, {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'inherit'],
        env: process.env,
        ...(IS_WINDOWS && { shell: true }),
      });
      child.stdin!.end(combinedPrompt);

      const chunks: Buffer[] = [];
      child.stdout!.on('data', (chunk: Buffer) => chunks.push(chunk));
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
          const msg = signal
            ? `Claude CLI killed (${signal})`
            : code != null
              ? `Claude CLI exited with code ${code}`
              : 'Claude CLI exited';
          reject(new Error(stdout ? `${msg}. Output: ${stdout.slice(0, 200)}` : msg));
        }
      });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(
          new Error(
            `Claude CLI timed out after ${this.timeoutMs / 1000}s. Set CALIBER_CLAUDE_CLI_TIMEOUT_MS to increase.`
          )
        );
      }, this.timeoutMs);
    });
  }
}

/** Whether the Claude Code CLI is on PATH (user has installed it and can run `claude -p`). */
export function isClaudeCliAvailable(): boolean {
  try {
    const cmd = process.platform === 'win32' ? `where ${CLAUDE_CLI_BIN}` : `which ${CLAUDE_CLI_BIN}`;
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
