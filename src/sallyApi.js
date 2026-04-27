const SALLY_API_URL = import.meta.env.VITE_SALLY_API_URL || "";

export function hasSallyApi() {
  return Boolean(SALLY_API_URL);
}

export async function askSallyApi({ userMessage, currentScenario, conversationHistory, pricingOptions, localResult }) {
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

  if (!response.ok) {
    throw new Error(`Sally API failed with ${response.status}`);
  }

  const payload = await response.json();

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
