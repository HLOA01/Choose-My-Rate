const SALLY_API_URL = import.meta.env.VITE_SALLY_API_URL || "";
const SALLY_STREAM_API_URL =
  import.meta.env.VITE_SALLY_STREAM_API_URL ||
  (SALLY_API_URL ? SALLY_API_URL.replace(/\/api\/sally-brain$/, "/api/sally-brain-stream") : "");

export function hasSallyApi() {
  return Boolean(SALLY_API_URL);
}

export async function callSallyBrain({ userMessage, currentScenario, conversationHistory, pricingOptions, localResult }) {
  if (!SALLY_API_URL) {
    throw new Error("VITE_SALLY_API_URL is not set");
  }

  const response = await fetch(SALLY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userMessage,
      currentScenario,
      conversationHistory,
      pricingOptions,
      localResult,
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Sally API failed with ${response.status}`);
  }

  if (payload && typeof payload === "object" && "replyText" in payload) {
    return payload;
  }

  return {
    replyText: String(payload.message || "Got it."),
    detectedIntent: String(payload.intent || "other"),
    scenarioUpdates: payload.scenario || {},
    nextQuestion: "",
    needsPricingRefresh: false,
    confidence: "medium",
  };
}

function parseSseEvents(buffer) {
  const blocks = buffer.split("\n\n");
  const remaining = blocks.pop() || "";

  return {
    remaining,
    events: blocks
      .map((block) => {
        let event = "message";
        const dataLines = [];

        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) {
            event = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
          }
        }

        if (!dataLines.length) return null;
        return {
          event,
          data: JSON.parse(dataLines.join("\n")),
        };
      })
      .filter(Boolean),
  };
}

export async function callSallyBrainStream({
  userMessage,
  currentScenario,
  conversationHistory,
  pricingOptions,
  localResult,
  onReplyDelta,
}) {
  if (!SALLY_STREAM_API_URL) {
    throw new Error("VITE_SALLY_STREAM_API_URL is not set");
  }

  const response = await fetch(SALLY_STREAM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userMessage,
      currentScenario,
      conversationHistory,
      pricingOptions,
      localResult,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Sally streaming API failed with ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseEvents(buffer);
    buffer = parsed.remaining;

    for (const item of parsed.events) {
      if (item.event === "reply_delta") {
        onReplyDelta?.(String(item.data?.delta || ""));
      } else if (item.event === "final") {
        finalPayload = item.data;
      } else if (item.event === "error") {
        throw new Error(item.data?.message || "Sally streaming failed.");
      }
    }
  }

  if (!finalPayload) {
    throw new Error("Sally streaming ended without a final response.");
  }

  return finalPayload;
}

export const askSallyApi = callSallyBrain;
