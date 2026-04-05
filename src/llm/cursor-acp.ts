import { spawn, execSync, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import type {
  LLMProvider,
  LLMCallOptions,
  LLMStreamOptions,
  LLMStreamCallbacks,
  LLMConfig,
} from './types.js';
import { parseSeatBasedError, isRateLimitError } from './seat-based-errors.js';
import { trackUsage } from './usage.js';
import { estimateTokens } from './utils.js';

const IS_WINDOWS = process.platform === 'win32';

/**
 * Resolve the Cursor `agent` binary to an absolute path so it works even when
 * $PATH is stripped (e.g. Claude Code hook subprocesses on macOS).
 */
function resolveAgentBin(): string {
  try {
    const whichCmd = IS_WINDOWS ? 'where agent' : 'which agent';
    const out = execSync(whichCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const p = out.split('\n')[0].trim();
    if (p) return p;
  } catch {
    // not on PATH
  }
  return 'agent';
}

const AGENT_BIN = resolveAgentBin();
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const SIGKILL_DELAY_MS = 5000;
const STDERR_MAX_BYTES = 10 * 1024;

/**
 * Cursor provider using headless --print mode for direct LLM access.
 * Each call spawns `agent --print` which outputs clean text responses
 * without the agent behavior that ACP mode forces.
 * See https://cursor.com/docs/cli/headless
 */
export class CursorAcpProvider implements LLMProvider {
  private defaultModel: string;
  private cursorApiKey?: string;
  private timeoutMs: number;
  private warmProcess: ChildProcess | null = null;
  private warmModel: string | null = null;

  constructor(config: LLMConfig) {
    this.defaultModel = config.model || 'sonnet-4.6';
    this.cursorApiKey = process.env.CURSOR_API_KEY ?? process.env.CURSOR_AUTH_TOKEN;
    const envTimeout = process.env.CALIBER_CURSOR_TIMEOUT_MS;
    this.timeoutMs = envTimeout ? parseInt(envTimeout, 10) : DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1000) {
      this.timeoutMs = DEFAULT_TIMEOUT_MS;
    }
  }

  async call(options: LLMCallOptions): Promise<string> {
    const prompt = this.buildPrompt(options);
    const model = options.model || this.defaultModel;
    const result = await this.runPrint(model, prompt);
    trackUsage(model, {
      inputTokens: estimateTokens(prompt),
      outputTokens: estimateTokens(result),
    });
    return result;
  }

  async stream(options: LLMStreamOptions, callbacks: LLMStreamCallbacks): Promise<void> {
    const prompt = this.buildPrompt(options);
    const model = options.model || this.defaultModel;
    const inputEstimate = estimateTokens(prompt);
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
    return this.runPrintStream(model, prompt, wrappedCallbacks);
  }

  /**
   * Pre-spawn an agent process so it's ready when the first call comes.
   * Call this during fingerprint collection to hide spawn latency.
   */
  prewarm(model?: string): void {
    const targetModel = model || this.defaultModel;
    if (this.warmProcess && !this.warmProcess.killed && this.warmModel === targetModel) return;

    const args = this.buildArgs(targetModel, false);
    this.warmProcess = spawn(AGENT_BIN, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...(this.cursorApiKey && { CURSOR_API_KEY: this.cursorApiKey }) },
      ...(IS_WINDOWS && { shell: true }),
    });
    this.warmModel = targetModel;

    this.warmProcess.on('error', () => {
      this.warmProcess = null;
      this.warmModel = null;
    });
    this.warmProcess.on('close', () => {
      this.warmProcess = null;
      this.warmModel = null;
    });
  }

  private buildArgs(model: string, streaming: boolean): string[] {
    const args = ['--print', '--trust', '--workspace', os.tmpdir()];

    if (model && model !== 'default') {
      args.push('--model', model);
    }

    if (streaming) {
      args.push('--output-format', 'stream-json', '--stream-partial-output');
    }

    if (this.cursorApiKey) {
      args.push('--api-key', this.cursorApiKey);
    }

    return args;
  }

  private takeWarmProcess(model: string, streaming: boolean): ChildProcess | null {
    if (!streaming && this.warmProcess && !this.warmProcess.killed && this.warmModel === model) {
      const proc = this.warmProcess;
      this.warmProcess = null;
      this.warmModel = null;
      return proc;
    }
    return null;
  }

  private spawnAgent(
    model: string,
    streaming: boolean,
  ): { child: ChildProcess; stderrChunks: Buffer[] } {
    const warm = this.takeWarmProcess(model, streaming);
    if (warm) {
      const stderrChunks: Buffer[] = [];
      warm.stderr?.on('data', (chunk: Buffer) => {
        if (Buffer.concat(stderrChunks).length < STDERR_MAX_BYTES) stderrChunks.push(chunk);
      });
      return { child: warm, stderrChunks };
    }

    const args = this.buildArgs(model, streaming);
    const child = spawn(AGENT_BIN, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...(this.cursorApiKey && { CURSOR_API_KEY: this.cursorApiKey }) },
      ...(IS_WINDOWS && { shell: true }),
    });

    const stderrChunks: Buffer[] = [];
    child.stderr!.on('data', (chunk: Buffer) => {
      if (Buffer.concat(stderrChunks).length < STDERR_MAX_BYTES) stderrChunks.push(chunk);
    });

    return { child, stderrChunks };
  }

  private killWithEscalation(child: ChildProcess): void {
    child.kill('SIGTERM');
    const killTimer = setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
    }, SIGKILL_DELAY_MS);
    killTimer.unref();
  }

  private buildErrorMessage(code: number | null, stderrChunks: Buffer[]): string {
    const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();
    const parsed = parseSeatBasedError(stderr, code);
    if (parsed) return parsed;
    const base = `Cursor agent exited with code ${code}`;
    return stderr ? `${base}: ${stderr.slice(0, 200)}` : base;
  }

  private runPrint(model: string, prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const { child, stderrChunks } = this.spawnAgent(model, false);
      let settled = false;
      const chunks: Buffer[] = [];

      child.stdout!.on('data', (data: Buffer) => chunks.push(data));

      const timer = setTimeout(() => {
        this.killWithEscalation(child);
        if (!settled) {
          settled = true;
          reject(
            new Error(
              `Cursor agent timed out after ${this.timeoutMs / 1000}s. Set CALIBER_CURSOR_TIMEOUT_MS to increase.`,
            ),
          );
        }
      }, this.timeoutMs);
      timer.unref();

      child.on('error', (err) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        const output = Buffer.concat(chunks).toString('utf-8').trim();
        if (code !== 0 && !output) {
          reject(new Error(this.buildErrorMessage(code, stderrChunks)));
        } else {
          resolve(output);
        }
      });

      child.stdin!.write(prompt);
      child.stdin!.end();
    });
  }

  private runPrintStream(
    model: string,
    prompt: string,
    callbacks: LLMStreamCallbacks,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const { child, stderrChunks } = this.spawnAgent(model, true);
      let buffer = '';
      let endCalled = false;
      let settled = false;

      const timer = setTimeout(() => {
        this.killWithEscalation(child);
        if (!settled) {
          settled = true;
          const err = new Error(
            `Cursor agent timed out after ${this.timeoutMs / 1000}s. Set CALIBER_CURSOR_TIMEOUT_MS to increase.`,
          );
          callbacks.onError(err);
          reject(err);
        }
      }, this.timeoutMs);
      timer.unref();

      child.stdout!.on('data', (data: Buffer) => {
        buffer += data.toString('utf-8');

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as {
              type?: string;
              subtype?: string;
              content?: string;
              result?: string;
              is_error?: boolean;
              message?: { content?: Array<{ type?: string; text?: string }> };
            };

            if (event.type === 'assistant') {
              // --stream-partial-output sends word-by-word deltas (with timestamp_ms)
              // followed by a final event with the COMPLETE text (no timestamp_ms).
              // Skip the final duplicate to prevent doubling the accumulated text.
              const isDelta = 'timestamp_ms' in (event as Record<string, unknown>);
              if (!isDelta) continue;

              const text = event.message?.content?.[0]?.text || event.content;
              if (text) callbacks.onText(text);
            } else if (event.type === 'result') {
              endCalled = true;
              const stopReason = event.is_error ? 'error' : 'end_turn';
              callbacks.onEnd({ stopReason });
            }
          } catch {
            callbacks.onText(line);
          }
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          callbacks.onError(err);
          reject(err);
        }
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;

        // Flush remaining buffer
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer) as {
              type?: string;
              content?: string;
              result?: string;
              is_error?: boolean;
              message?: { content?: Array<{ type?: string; text?: string }> };
            };
            if (event.type === 'assistant') {
              const isDelta = 'timestamp_ms' in (event as Record<string, unknown>);
              if (isDelta) {
                const text = event.message?.content?.[0]?.text || event.content;
                if (text) callbacks.onText(text);
              }
            } else if (event.type === 'result') {
              endCalled = true;
              callbacks.onEnd({ stopReason: event.is_error ? 'error' : 'end_turn' });
            }
          } catch {
            callbacks.onText(buffer);
          }
        }

        if (!endCalled) {
          callbacks.onEnd({ stopReason: code === 0 ? 'end_turn' : 'error' });
        }

        if (code !== 0 && code !== null) {
          const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();
          if (isRateLimitError(stderr)) {
            // Don't reject on rate limit — let the retry logic in index.ts handle it
            const err = new Error('Rate limit exceeded');
            callbacks.onError(err);
            reject(err);
          } else {
            const err = new Error(this.buildErrorMessage(code, stderrChunks));
            callbacks.onError(err);
            reject(err);
          }
        } else {
          resolve();
        }
      });

      child.stdin!.write(prompt);
      child.stdin!.end();
    });
  }

  private buildPrompt(options: LLMCallOptions | LLMStreamOptions): string {
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
}

/** Check if Cursor agent CLI is available. */
export function isCursorAgentAvailable(): boolean {
  // resolveAgentBin() returns an absolute path when `which agent` succeeded.
  if (AGENT_BIN !== 'agent') return true;
  try {
    execSync(IS_WINDOWS ? 'where agent' : 'which agent', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Check if user is logged in to Cursor agent. */
export function isCursorLoggedIn(): boolean {
  try {
    const result = execSync(`${AGENT_BIN} status`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    return !result.toString().includes('not logged in');
  } catch {
    return false;
  }
}
