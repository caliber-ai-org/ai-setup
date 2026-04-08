import { spawn, execSync, type ChildProcess } from 'node:child_process';
import type {
  LLMProvider,
  LLMCallOptions,
  LLMStreamOptions,
  LLMStreamCallbacks,
  LLMConfig,
} from './types.js';
import { trackUsage } from './usage.js';
import { estimateTokens } from './utils.js';
import { parseSeatBasedError } from './seat-based-errors.js';

const DEBUG = process.env.DEBUG?.includes('caliber:opencode') ?? false;

const OPENCODE_BIN = 'opencode';
const IS_WINDOWS = process.platform === 'win32';
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

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
    const combined = this.buildCombinedPrompt(options);
    const result = await this.runCommand(combined, options.model);
    trackUsage(options.model || this.defaultModel, {
      inputTokens: estimateTokens(combined),
      outputTokens: estimateTokens(result),
    });
    return result;
  }

  async stream(options: LLMStreamOptions, callbacks: LLMStreamCallbacks): Promise<void> {
    const combined = this.buildCombinedPrompt(options);
    const inputEstimate = estimateTokens(combined);
    return this.runCommandStream(combined, options.model, callbacks, inputEstimate);
  }

  private buildCombinedPrompt(options: LLMCallOptions | LLMStreamOptions): string {
    const streamOpts = options as LLMStreamOptions;
    const hasHistory = streamOpts.messages && streamOpts.messages.length > 0;
    let combined = options.system ? options.system + '\n\n' : '';

    if (hasHistory) {
      for (const msg of streamOpts.messages!) {
        const label = msg.role === 'user' ? 'User' : 'Assistant';
        combined += `${label}: ${msg.content}\n\n`;
      }
    }

    combined += options.prompt;
    return combined;
  }

  private async runCommand(prompt: string, model?: string): Promise<string> {
    const args = ['run', '--format', 'json', '--', '-'];
    const modelToUse = model || this.defaultModel;
    if (modelToUse && modelToUse !== 'default') args.splice(1, 0, '--model', modelToUse);

    if (DEBUG) {
      console.debug('[caliber:opencode] spawn:', OPENCODE_BIN, args.join(' '));
    }

    return new Promise((resolve, reject) => {
      const child = this.spawnOpenCode(args);
      child.stdin!.end(prompt);

      const chunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout!.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      child.stderr!.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`OpenCode timed out after ${this.timeoutMs / 1000}s`));
      }, this.timeoutMs);

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on('close', (code) => {
        clearTimeout(timer);

        const stderr = Buffer.concat(stderrChunks).toString('utf-8');
        const output = Buffer.concat(chunks).toString('utf-8');

        if (code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString('utf-8');
          const friendly = parseSeatBasedError(stderr, code);
          const base = `OpenCode exited with code ${code}`;
          const detail = friendly || stderr.slice(0, 500);
          reject(new Error(detail ? `${base}. ${detail}` : base));
          return;
        }

        if (DEBUG) {
          const stderr = Buffer.concat(stderrChunks).toString('utf-8');
          if (stderr.trim()) {
            console.debug('[caliber:opencode] stderr:', stderr.slice(0, 1000));
          }
        }

        const text = this.parseJsonOutput(output);
        if (!text.trim()) {
          reject(
            new Error(
              `OpenCode returned empty response. stdout: ${output.slice(0, 500)}, stderr: ${stderr.slice(0, 500)}`,
            ),
          );
          return;
        }

        resolve(text);
      });
    });
  }

  private async runCommandStream(
    prompt: string,
    model: string | undefined,
    callbacks: LLMStreamCallbacks,
    inputEstimate: number,
  ): Promise<void> {
    const args = ['run', '--format', 'json', '--', '-'];
    const modelToUse = model || this.defaultModel;
    if (modelToUse && modelToUse !== 'default') args.splice(1, 0, '--model', modelToUse);

    return new Promise((resolve, _reject) => {
      const child = this.spawnOpenCode(args);
      child.stdin!.end(prompt);

      let settled = false;
      let outputChars = 0;
      const stderrChunks: Buffer[] = [];

      child.stdout!.on('data', (chunk: Buffer) => {
        if (settled) return;

        const lines = chunk.toString('utf-8').split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const event = JSON.parse(line);
            if (event.type === 'text' && event.part?.text) {
              outputChars += event.part.text.length;
              callbacks.onText(event.part.text);
            } else if (event.type === 'error') {
              settled = true;
              callbacks.onError(new Error(event.error?.data?.message || 'Unknown error'));
              child.kill();
              return;
            }
          } catch {
            // Not JSON, skip
          }
        }
      });

      child.stderr!.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          callbacks.onError(new Error(`OpenCode timed out after ${this.timeoutMs / 1000}s`));
          child.kill('SIGTERM');
        }
      }, this.timeoutMs);

      child.on('error', (err) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          callbacks.onError(err);
        }
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (settled) {
          resolve();
          return;
        }

        const modelUsed = model || this.defaultModel;
        if (code !== 0 && code !== null) {
          const stderr = Buffer.concat(stderrChunks).toString('utf-8');
          const friendly = parseSeatBasedError(stderr, code);
          const base = `OpenCode exited with code ${code}`;
          const detail = friendly || stderr.slice(0, 500);
          callbacks.onError(new Error(detail ? `${base}. ${detail}` : base));
        } else {
          trackUsage(modelUsed, {
            inputTokens: inputEstimate,
            outputTokens: Math.ceil(outputChars / 4),
          });
          callbacks.onEnd({ stopReason: 'end_turn' });
        }
        resolve();
      });
    });
  }

  private spawnOpenCode(args: string[]): ChildProcess {
    const env = { ...process.env, OPENCODE_DISABLE_AUTOCOMPACT: 'true' };

    return spawn(OPENCODE_BIN, args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });
  }

  private parseJsonOutput(output: string): string {
    const textParts: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('```') || trimmed === '```') continue;

      try {
        const event = JSON.parse(trimmed);
        if (event.type === 'text' && event.part?.text) {
          textParts.push(event.part.text);
        }
      } catch {
        // Not JSON, skip
      }
    }

    return textParts.join('');
  }
}

export function isOpenCodeAvailable(): boolean {
  try {
    const cmd = IS_WINDOWS ? `where ${OPENCODE_BIN}` : `which ${OPENCODE_BIN}`;
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
