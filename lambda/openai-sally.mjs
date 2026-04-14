const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "OPTIONS,POST",
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function parseRequestBody(event) {
  if (!event.body) return {};
  const body = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  return JSON.parse(body);
}

function safeScenario(value) {
  if (!value || typeof value !== "object") return {};
  return value;
}

function extractOutputText(response) {
  if (typeof response.output_text === "string") return response.output_text;

  const textParts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        textParts.push(content.text);
      }
    }
  }
  return textParts.join("\n").trim();
}

function parseModelJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export async function handler(event) {
  if (event.requestContext?.http?.method === "OPTIONS" || event.httpMethod === "OPTIONS") {
    return jsonResponse(204, {});
  }

  if (!OPENAI_API_KEY) {
    return jsonResponse(500, {
      message: "Sally is not connected to OpenAI yet. Add OPENAI_API_KEY to the Lambda environment.",
    });
  }

  let payload;
  try {
    payload = parseRequestBody(event);
  } catch {
    return jsonResponse(400, { message: "Invalid JSON request body." });
  }

  const userMessage = String(payload.message || "").trim();
  const scenario = safeScenario(payload.scenario);
  const localResult = payload.localResult || {};

  if (!userMessage) {
    return jsonResponse(400, { message: "Message is required." });
  }

  const instructions = [
    "You are Sally, a warm mortgage conversation guide for Choose My Rate.",
    "Help borrowers build a loan scenario step by step.",
    "Be concise, friendly, and practical. Ask one clear next question when information is missing.",
    "Do not promise loan approval, exact rates, or underwriting outcomes.",
    "Use the provided localResult.scenario as the source of truth for field extraction unless the user clearly corrects it.",
    "Return only valid JSON with this shape: {\"message\":\"string\",\"scenario\":{...}}.",
    "The scenario object must preserve these keys when known: loanPurpose, purchasePrice, downPayment, downPaymentPercent, loanAmount, creditScore, loanType, occupancy, zipCode.",
  ].join("\n");

  const input = [
    {
      role: "developer",
      content: instructions,
    },
    {
      role: "user",
      content: JSON.stringify({
        userMessage,
        currentScenario: scenario,
        localResult,
      }),
    },
  ];

  const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input,
      temperature: 0.3,
      max_output_tokens: 500,
    }),
  });

  const responseBody = await openaiResponse.json();

  if (!openaiResponse.ok) {
    return jsonResponse(openaiResponse.status, {
      message: "Sally could not reach OpenAI right now.",
      error: responseBody.error?.message || "OpenAI request failed.",
    });
  }

  const outputText = extractOutputText(responseBody);
  const parsed = parseModelJson(outputText, {
    message: outputText || localResult.message || "Got it. Tell me a little more.",
    scenario: localResult.scenario || scenario,
  });

  return jsonResponse(200, {
    message: String(parsed.message || localResult.message || "Got it."),
    scenario: safeScenario(parsed.scenario || localResult.scenario || scenario),
    model: OPENAI_MODEL,
  });
}
