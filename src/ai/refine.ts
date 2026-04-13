import { getProvider } from '../llm/index.js';
import { REFINE_SYSTEM_PROMPT } from './prompts.js';
import { stripMarkdownFences } from '../llm/utils.js';
import { parseEnvTimeout, DEFAULT_INACTIVITY_TIMEOUT_MS } from './generate.js';

interface RefineCallbacks {
  onComplete: (setup: Record<string, unknown>) => void;
  onError: (error: string) => void;
}

export async function refineSetup(
  currentSetup: Record<string, unknown>,
  message: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  callbacks?: RefineCallbacks,
): Promise<Record<string, unknown> | null> {
  const provider = getProvider();

  const inactivityTimeoutMs = parseEnvTimeout(
    'CALIBER_STREAM_INACTIVITY_TIMEOUT_MS',
    DEFAULT_INACTIVITY_TIMEOUT_MS,
  );

  const prompt = `Current setup:\n${JSON.stringify(currentSetup, null, 2)}\n\nUser request: ${message}\n\nReturn the complete updated AgentSetup JSON incorporating the user's changes. Respond with ONLY the JSON.`;

  return new Promise((resolve) => {
    let buffer = '';
    let settled = false;
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

    function clearInactivityTimer() {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
    }

    function resetInactivityTimer() {
      clearInactivityTimer();
      inactivityTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const msg =
          buffer.length === 0
            ? 'Model produced no output. Try a different model.'
            : 'Model stopped responding. Try rephrasing your request or using a different model.';
        if (callbacks) callbacks.onError(msg);
        resolve(null);
      }, inactivityTimeoutMs);
    }

    resetInactivityTimer();

    provider
      .stream(
        {
          system: REFINE_SYSTEM_PROMPT,
          prompt,
          messages: conversationHistory,
          maxTokens: 16000,
        },
        {
          onText: (text) => {
            if (settled) return;
            buffer += text;
            resetInactivityTimer();
          },
          onEnd: () => {
            clearInactivityTimer();
            if (settled) return;
            settled = true;

            const cleaned = stripMarkdownFences(buffer);
            const jsonStart = cleaned.indexOf('{');
            const jsonToParse = jsonStart !== -1 ? cleaned.slice(jsonStart) : cleaned;
            try {
              const setup = JSON.parse(jsonToParse);
              if (callbacks) callbacks.onComplete(setup);
              resolve(setup);
            } catch {
              if (callbacks)
                callbacks.onError('Failed to parse AI response. Try rephrasing your request.');
              resolve(null);
            }
          },
          onError: (error) => {
            clearInactivityTimer();
            if (settled) return;
            settled = true;
            if (callbacks) callbacks.onError(error.message);
            resolve(null);
          },
        },
      )
      .catch((error: Error) => {
        clearInactivityTimer();
        if (settled) return;
        settled = true;
        if (callbacks) callbacks.onError(error.message);
        resolve(null);
      });
  });
}
