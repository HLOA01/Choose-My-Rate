import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const __dirname = dirname(fileURLToPath(import.meta.url));

const promptFiles = [
  ["Sally Knowledge Base", "Sally_Knowledge_Base.md"],
  ["Sally OpenAI Integration Notes", "Sally_OpenAI_Integration_Notes.md"],
  ["Sally Guardrails and Compliance", "Sally_Guardrails_and_Compliance.md"],
  ["Sally Response Examples", "Sally_Response_Examples.md"],
];

function loadPromptFile([title, fileName]) {
  try {
    const content = readFileSync(join(__dirname, "prompts", fileName), "utf8");
    return `# ${title}\n\n${content}`;
  } catch (error) {
    console.warn(`Unable to load ${fileName}:`, error);
    return `# ${title}\n\nUnavailable.`;
  }
}

const sallyPromptContext = promptFiles.map(loadPromptFile).join("\n\n---\n\n");

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

function mergeScenario(...sources) {
  const merged = {};

  for (const source of sources) {
    if (!source || typeof source !== "object") continue;

    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined && value !== null && value !== "") {
        merged[key] = value;
      }
    }
  }

  return merged;
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
  const localScenario = safeScenario(localResult.scenario);

  if (!userMessage) {
    return jsonResponse(400, { message: "Message is required." });
  }

  const instructions = [
    "You are Sally, the mortgage conversation guide for Choose My Rate by Home Lenders of America.",
    "Use the Sally prompt context below as your behavior layer: system prompt, knowledge context, guardrails, examples, and integration notes.",
    "Keep SallyBrain.js as the fallback/control layer. The localResult is the deterministic parser output and should be treated as high-confidence structured extraction unless the user clearly corrects it.",
    "Return prompt-based structured output only. Do not include markdown, code fences, or prose outside JSON.",
    "Return JSON with this exact shape: {\"message\":\"string\",\"scenario\":{...},\"intent\":\"purchase|refinance|cash_out|reset|other\",\"confidence\":0.0}.",
    "The scenario object must preserve these keys when known: loanPurpose, purchasePrice, downPayment, downPaymentPercent, loanAmount, creditScore, loanType, occupancy, zipCode.",
    "Recognize these loanType values exactly when the borrower mentions them or their common aliases: Conventional, FHA, VA, USDA, Jumbo, DSCR. Conventional aliases include conv, Fannie Mae, FNMA, Freddie Mac, FHLMC. USDA aliases include rural loan. DSCR aliases include debt service coverage, rental cash flow, and investor cash flow.",
    "Ask one clear next question. Keep replies short, warm, professional, and compliant.",
    "Never guarantee approval, exact rates, qualification, final fees, or final payment. Label estimates as estimates when explaining them.",
    "If a request needs human review, say so calmly and continue guiding the scenario.",
    "",
    "SALLY PROMPT CONTEXT:",
    sallyPromptContext,
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
        requiredResponseShape: {
          message: "string",
          scenario: {
            loanPurpose: "",
            purchasePrice: "",
            downPayment: "",
            downPaymentPercent: "",
            loanAmount: "",
            creditScore: "",
            loanType: "",
            occupancy: "",
            zipCode: "",
          },
          intent: "purchase|refinance|cash_out|reset|other",
          confidence: 0.0,
        },
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
    scenario: mergeScenario(scenario, localScenario, safeScenario(parsed.scenario)),
    intent: parsed.intent || "other",
    confidence: Number(parsed.confidence ?? 0),
    model: OPENAI_MODEL,
  });
}
