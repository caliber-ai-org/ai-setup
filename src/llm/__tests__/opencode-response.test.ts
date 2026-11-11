import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenCodeProvider } from '../opencode.js';
import { parseJsonResponse } from '../utils.js';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn, execSync: vi.fn() }));
vi.mock('../usage.js', () => ({ trackUsage: vi.fn() }));

function completeWith(chunks: string[], code = 0) {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
  spawn.mockReturnValue(child);
  queueMicrotask(() => {
    for (const chunk of chunks) child.stdout.write(chunk);
    child.emit('close', code, null);
  });
}

describe('OpenCode JSON responses', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns generated docs instead of a step event', async () => {
    completeWith([
      `${JSON.stringify({ type: 'step_start', part: { type: 'step-start' } })}\n`,
      `${JSON.stringify({
        type: 'text',
        part: {
          text: '{"docsUpdated":["CLAUDE.md"],"updatedDocs":{"claudeMd":"New command"}}',
        },
      })}\n`,
    ]);
    const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });

    const output = await provider.call({ system: '', prompt: 'Update the docs' });

    expect(parseJsonResponse(output)).toEqual({
      docsUpdated: ['CLAUDE.md'],
      updatedDocs: { claudeMd: 'New command' },
    });
  });

  it('joins text from fragmented events when the final event has no newline', async () => {
    completeWith(['{"type":"text","part":{"te', 'xt":"Generated docs"}}']);
    const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });

    await expect(provider.call({ system: '', prompt: 'Update' })).resolves.toBe('Generated docs');
  });

  it('rejects metadata-only output instead of hiding a missing response', async () => {
    completeWith(['{"type":"step_start","part":{"type":"step-start"}}\n']);
    const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });

    await expect(provider.call({ system: '', prompt: 'Update' })).rejects.toThrow(/no text/i);
  });

  it('rejects empty output instead of returning a successful blank response', async () => {
    completeWith([]);
    const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });

    await expect(provider.call({ system: '', prompt: 'Update' })).rejects.toThrow(/no text/i);
  });

  it('rejects a model error event after partial text', async () => {
    completeWith([
      '{"type":"text","part":{"text":"Partial output"}}\n',
      '{"type":"error","error":{"name":"APIError","data":{"message":"Model request rejected"}}}\n',
    ]);
    const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });

    await expect(provider.call({ system: '', prompt: 'Update' })).rejects.toThrow(
      'Model request rejected',
    );
  });

  it('includes stdout error details when OpenCode exits without stderr', async () => {
    completeWith(
      ['{"type":"error","error":{"name":"APIError","data":{"message":"Model unavailable"}}}\n'],
      1,
    );
    const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });

    await expect(provider.call({ system: '', prompt: 'Update' })).rejects.toThrow(
      'Model unavailable',
    );
  });
});
