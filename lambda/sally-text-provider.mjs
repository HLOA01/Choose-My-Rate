import { extractOutputText, normalizeConversationHistory, summarizePricingOptions } from './sally-text-core.mjs';

// Only server code constructs adapters. Request bodies cannot select a provider,
// endpoint, model, credential, or timeout. No alternate live provider is enabled.
export function serverTextConfig(env = {}) {
  const timeoutMs = Number(env.SALLY_TEXT_TIMEOUT_MS || 12000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error('Invalid Sally text timeout.');
  return Object.freeze({ apiKey: env.OPENAI_API_KEY,
    primaryModel: env.SALLY_TEXT_MODEL || 'gpt-5.4',
    fallbackModel: env.SALLY_FALLBACK_TEXT_MODEL || 'gpt-5.4-mini', timeoutMs });
}

export function createOpenAITextProvider(config, fetchImpl = globalThis.fetch) {
  return Object.freeze({ async generate({ request, model, signal }) {
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildResponsesPayload({ ...request, model })),
    });
    if (!response.ok) throw new Error('Sally provider request failed.');
    return { text: extractOutputText(await response.json()) };
  } });
}

// Promise racing bounds even a buggy injected adapter that ignores cancellation.
// The underlying fetch also receives the abort signal; timer/listener are owned.
export async function runBounded(operation, { timeoutMs, signal } = {}) {
  const controller = new AbortController();
  let timer;
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => { controller.abort(); reject(Object.assign(new Error('Sally request cancelled.'), { code: 'SALLY_CANCELLED' })); };
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('Sally request timed out.'), { code: 'SALLY_TIMEOUT' })); }, timeoutMs);
  });
  try {
    if (signal?.aborted) { abort(); return await cancelled; }
    return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), cancelled]);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

function buildResponsesPayload({ model, instructions, userMessage, currentScenario, conversationHistory, pricingOptions, localResult, deterministicUpdates }) {
  const historyMessages = normalizeConversationHistory(conversationHistory).map((item) => ({
    role: item.role,
    content: item.content,
  }));

  return {
    model,
    input: [
      {
        role: "developer",
        content: instructions,
      },
      ...historyMessages,
      {
        role: "user",
        content: JSON.stringify({
          userMessage,
          currentScenario,
          localDeterministicResult: localResult,
          localDeterministicScenarioUpdates: deterministicUpdates,
          pricingOptions: summarizePricingOptions(pricingOptions),
        }),
      },
    ],
    max_output_tokens: 700,
  };
}
