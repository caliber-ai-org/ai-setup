import { spawn, execSync, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import type { LLMProvider, LLMCallOptions, LLMStreamOptions, LLMStreamCallbacks, LLMConfig } from './types.js';

const ACP_AGENT_BIN = 'agent';
const IS_WINDOWS = process.platform === 'win32';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

interface AcpConnection {
  child: ChildProcess;
  rl: readline.Interface;
  pending: Map<number, PendingCall>;
  nextId: number;
  activeCallbacks: LLMStreamCallbacks | null;
}

/**
 * Cursor provider that uses the Cursor Agent via ACP (Agent Client Protocol).
 * Maintains persistent connections pooled by model — spawns once per model,
 * reuses across all calls with the same model.
 * Uses the user's current Cursor subscription — no API key required if `agent login` was run.
 * See https://cursor.com/docs/cli/acp
 */
export class CursorAcpProvider implements LLMProvider {
  private defaultModel: string;
  private cursorApiKey?: string;
  private connections = new Map<string, AcpConnection>();
  private connectPromises = new Map<string, Promise<void>>();
  private shutdownRequested = false;

  constructor(config: LLMConfig) {
    this.defaultModel = config.model || 'sonnet-4.6';
    this.cursorApiKey = process.env.CURSOR_API_KEY ?? process.env.CURSOR_AUTH_TOKEN;

    process.once('exit', () => this.shutdown());
  }

  async call(options: LLMCallOptions): Promise<string> {
    const chunks: string[] = [];
    await this.runPrompt(options, {
      onText: (text) => chunks.push(text),
      onEnd: () => {},
      onError: () => {},
    });
    return chunks.join('');
  }

  async stream(options: LLMStreamOptions, callbacks: LLMStreamCallbacks): Promise<void> {
    await this.runPrompt(options, callbacks);
  }

  shutdown(): void {
    this.shutdownRequested = true;
    for (const conn of this.connections.values()) {
      conn.child.stdin?.end();
      conn.child.kill('SIGTERM');
    }
    this.connections.clear();
    this.connectPromises.clear();
  }

  // -- Connection pool --------------------------------------------------------

  private resolveModel(options: LLMCallOptions | LLMStreamOptions): string {
    return options.model || this.defaultModel;
  }

  private async ensureConnection(model: string): Promise<AcpConnection> {
    const existing = this.connections.get(model);
    if (existing && !existing.child.killed) return existing;

    const pending = this.connectPromises.get(model);
    if (pending) {
      await pending;
      return this.connections.get(model)!;
    }

    const promise = this.connect(model);
    this.connectPromises.set(model, promise);
    try {
      await promise;
    } catch (err) {
      this.connectPromises.delete(model);
      throw err;
    }
    return this.connections.get(model)!;
  }

  private async connect(model: string): Promise<void> {
    const args = ['acp'];
    if (model && model !== 'auto' && model !== 'default') {
      args.unshift('--model', model);
    }
    if (this.cursorApiKey) {
      args.unshift('--api-key', this.cursorApiKey);
    }

    const child = spawn(ACP_AGENT_BIN, args, {
      stdio: ['pipe', 'pipe', 'ignore'],
      cwd: process.cwd(),
      env: { ...process.env, ...(this.cursorApiKey && { CURSOR_API_KEY: this.cursorApiKey }) },
      ...(IS_WINDOWS && { shell: true }),
    });

    const conn: AcpConnection = {
      child,
      rl: readline.createInterface({ input: child.stdout!, crlfDelay: Infinity }),
      pending: new Map(),
      nextId: 1,
      activeCallbacks: null,
    };

    conn.rl.on('line', (line) => this.handleLine(conn, line));

    child.on('error', (err) => {
      for (const w of conn.pending.values()) w.reject(err);
      conn.pending.clear();
      conn.activeCallbacks?.onError(err);
    });

    child.on('close', () => {
      if (!this.shutdownRequested) {
        const err = new Error('Cursor agent process exited unexpectedly');
        for (const w of conn.pending.values()) w.reject(err);
        conn.pending.clear();
        conn.activeCallbacks?.onError(err);
      }
      this.connections.delete(model);
      this.connectPromises.delete(model);
    });

    this.connections.set(model, conn);

    await this.send(conn, 'initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: 'caliber', version: '1.0.0' },
    });
    await this.send(conn, 'authenticate', { methodId: 'cursor_login' });
  }

  // -- JSON-RPC ---------------------------------------------------------------

  private send(conn: AcpConnection, method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!conn.child.stdin) {
      return Promise.reject(new Error('Cursor agent not connected'));
    }
    return new Promise((resolve, reject) => {
      const id = conn.nextId++;
      conn.pending.set(id, { resolve, reject });
      const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      conn.child.stdin!.write(JSON.stringify(msg) + '\n', (err) => {
        if (err) {
          conn.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  private handleLine(conn: AcpConnection, line: string): void {
    let msg: JsonRpcResponse & {
      method?: string;
      params?: { update?: { sessionUpdate?: string; content?: { text?: string } }; id?: number };
    };
    try {
      msg = JSON.parse(line) as typeof msg;
    } catch {
      return;
    }

    // Response to a send() call
    if (msg.id != null && (msg.result !== undefined || msg.error !== undefined)) {
      const waiter = conn.pending.get(msg.id);
      if (waiter) {
        conn.pending.delete(msg.id);
        if (msg.error) {
          waiter.reject(new Error(msg.error.message || 'ACP error'));
        } else {
          waiter.resolve(msg.result);
        }
      }
      if (msg.result && typeof msg.result === 'object' && 'stopReason' in (msg.result as object)) {
        conn.activeCallbacks?.onEnd({
          stopReason: (msg.result as { stopReason?: string }).stopReason,
        });
      }
      return;
    }

    // Streaming text chunks
    if (msg.method === 'session/update' && msg.params?.update) {
      const update = msg.params.update;
      if (update.sessionUpdate === 'agent_message_chunk' && update.content?.text) {
        conn.activeCallbacks?.onText(update.content.text);
      }
      return;
    }

    // Auto-approve permission requests
    if (msg.method === 'session/request_permission' && msg.id != null) {
      const response = JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: { outcome: { outcome: 'selected' as const, optionId: 'allow-once' as const } },
      }) + '\n';
      conn.child.stdin?.write(response);
    }
  }

  // -- Prompt execution -------------------------------------------------------

  private async runPrompt(
    options: LLMCallOptions | LLMStreamOptions,
    callbacks: LLMStreamCallbacks
  ): Promise<void> {
    const model = this.resolveModel(options);
    const conn = await this.ensureConnection(model);

    conn.activeCallbacks = callbacks;
    try {
      const sessionResult = await this.send(conn, 'session/new', {
        cwd: process.cwd(),
        mcpServers: [],
      }) as { sessionId: string };

      await this.send(conn, 'session/prompt', {
        sessionId: sessionResult.sessionId,
        prompt: [{ type: 'text', text: this.buildCombinedPrompt(options) }],
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      callbacks.onError(error);
      throw error;
    } finally {
      conn.activeCallbacks = null;
    }
  }

  private buildCombinedPrompt(options: LLMCallOptions | LLMStreamOptions): string {
    const streamOpts = options as LLMStreamOptions;
    const hasHistory = streamOpts.messages && streamOpts.messages.length > 0;
    let combined = '';

    combined += 'IMPORTANT: You are being used as a direct LLM, not as a coding agent. ';
    combined += 'Do NOT use tools, do NOT read or write files, do NOT check the repository. ';
    combined += 'Process the prompt below and output your response directly in your message. ';
    combined += 'Follow the system instructions exactly.\n\n';

    combined += '[[System]]\n' + options.system + '\n\n';

    if (hasHistory) {
      for (const msg of streamOpts.messages!) {
        combined += `[[${msg.role === 'user' ? 'User' : 'Assistant'}]]\n${msg.content}\n\n`;
      }
    }

    combined += '[[User]]\n' + options.prompt;
    return combined;
  }
}

/** Check if Cursor agent CLI is available (e.g. user ran `cursor.com/install` and optionally `agent login`). */
export function isCursorAgentAvailable(): boolean {
  try {
    const cmd = process.platform === 'win32' ? `where ${ACP_AGENT_BIN}` : `which ${ACP_AGENT_BIN}`;
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
