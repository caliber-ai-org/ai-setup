export function extractJson(text: string): string | null {
  const startIdx = text.search(/[[{]/);
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return text.slice(startIdx, i + 1);
    }
  }

  return null;
}

export function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/```\s*$/m, '')
    .trim();
}

export function parseJsonResponse<T>(raw: string): T {
  const cleaned = stripMarkdownFences(raw);

  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall through to bracket extraction
  }

  const json = extractJson(cleaned);
  if (!json) {
    throw new Error(`No JSON found in LLM response: ${raw.slice(0, 200)}`);
  }
  return JSON.parse(json);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
