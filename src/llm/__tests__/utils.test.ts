import { describe, it, expect } from 'vitest';
import { extractJson, stripMarkdownFences, parseJsonResponse, estimateTokens } from '../utils.js';

describe('extractJson', () => {
  it('extracts a simple JSON object', () => {
    const result = extractJson('Some text {"key": "value"} more text');
    expect(result).toBe('{"key": "value"}');
  });

  it('extracts nested JSON objects', () => {
    const result = extractJson('prefix {"a": {"b": {"c": 1}}} suffix');
    expect(result).toBe('{"a": {"b": {"c": 1}}}');
  });

  it('extracts JSON arrays', () => {
    const result = extractJson('prefix [1, 2, 3] suffix');
    expect(result).toBe('[1, 2, 3]');
  });

  it('handles escaped quotes inside strings', () => {
    const result = extractJson('text {"msg": "he said \\"hello\\""} end');
    expect(result).toBe('{"msg": "he said \\"hello\\""}');
  });

  it('handles strings containing braces', () => {
    const json = '{"code": "function() { return {}; }"}';
    const result = extractJson(`prefix ${json} suffix`);
    expect(result).toBe(json);
  });

  it('handles nested arrays inside objects', () => {
    const json = '{"items": [{"id": 1}, {"id": 2}]}';
    const result = extractJson(json);
    expect(result).toBe(json);
  });

  it('returns null when no brackets found', () => {
    expect(extractJson('no json here')).toBeNull();
  });

  it('returns null for unclosed brackets', () => {
    expect(extractJson('{"key": "value"')).toBeNull();
  });

  it('stops at the first balanced closing bracket', () => {
    const result = extractJson('{"a": 1} {"b": 2}');
    expect(result).toBe('{"a": 1}');
  });

  it('handles backslashes inside strings', () => {
    const json = '{"path": "C:\\\\Users\\\\test"}';
    const result = extractJson(json);
    expect(result).toBe(json);
  });

  it('handles multiline JSON', () => {
    const json = '{\n  "key": "value",\n  "nested": {\n    "a": 1\n  }\n}';
    const result = extractJson(`some text\n${json}\nmore text`);
    expect(result).toBe(json);
  });
});

describe('stripMarkdownFences', () => {
  it('removes ```json opening fence', () => {
    expect(stripMarkdownFences('```json\n{"a": 1}\n```')).toBe('{"a": 1}');
  });

  it('removes plain ``` opening fence', () => {
    expect(stripMarkdownFences('```\n{"a": 1}\n```')).toBe('{"a": 1}');
  });

  it('handles text without fences', () => {
    expect(stripMarkdownFences('{"a": 1}')).toBe('{"a": 1}');
  });

  it('trims surrounding whitespace', () => {
    expect(stripMarkdownFences('  {"a": 1}  ')).toBe('{"a": 1}');
  });

  it('only removes first opening and last closing fence', () => {
    expect(stripMarkdownFences('```json\n{"code": "```"}\n```')).toBe('{"code": "```"}');
  });
});

describe('parseJsonResponse', () => {
  it('parses clean JSON directly', () => {
    const result = parseJsonResponse<{ name: string }>('{"name": "test"}');
    expect(result).toEqual({ name: 'test' });
  });

  it('parses JSON wrapped in markdown fences', () => {
    const result = parseJsonResponse<{ a: number }>('```json\n{"a": 42}\n```');
    expect(result).toEqual({ a: 42 });
  });

  it('extracts JSON from surrounding text', () => {
    const result = parseJsonResponse<{ ok: boolean }>('Here is the result: {"ok": true} Done.');
    expect(result).toEqual({ ok: true });
  });

  it('throws when no JSON found', () => {
    expect(() => parseJsonResponse('no json here')).toThrow('No valid JSON object');
  });

  it('throws on invalid JSON even after extraction', () => {
    expect(() => parseJsonResponse('{invalid: json}')).toThrow();
  });

  it('throws when LLM returns literal null', () => {
    expect(() => parseJsonResponse('null')).toThrow('No valid JSON object');
  });

  it('throws when LLM returns a primitive string', () => {
    expect(() => parseJsonResponse('"just a string"')).toThrow('No valid JSON object');
  });
});

describe('estimateTokens', () => {
  it('estimates ~4 chars per token', () => {
    expect(estimateTokens('hello')).toBe(2); // ceil(5/4)
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('rounds up', () => {
    expect(estimateTokens('hi')).toBe(1); // ceil(2/4)
  });
});
