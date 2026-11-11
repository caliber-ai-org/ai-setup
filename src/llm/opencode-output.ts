interface OpenCodeEvent {
  type?: string;
  part?: { text?: unknown };
  error?: { data?: { message?: string }; message?: string; name?: string };
}

export function parseOpenCodeOutput(output: string): string {
  const text: string[] = [];
  let hasEvents = false;
  for (const line of output.split('\n')) {
    let event: OpenCodeEvent | null;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!event || typeof event.type !== 'string') continue;
    hasEvents = true;
    if (event.type === 'error') {
      const error = event.error;
      const detail = error?.data?.message || error?.message || error?.name;
      throw new Error(`OpenCode error: ${detail || 'Unknown model error'}`);
    }
    if (event.type === 'text' && typeof event.part?.text === 'string') {
      text.push(event.part.text);
    }
  }
  const result = (hasEvents ? text.join('') : output).trim();
  if (!result) throw new Error('OpenCode returned no text');
  return result;
}
