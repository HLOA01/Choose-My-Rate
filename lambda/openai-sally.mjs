import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PRIMARY_MODEL = process.env.SALLY_TEXT_MODEL || "gpt-5.4";
const FALLBACK_MODEL = process.env.SALLY_FALLBACK_TEXT_MODEL || "gpt-5.4-mini";
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

export function getSallyModels() {
  return [PRIMARY_MODEL, FALLBACK_MODEL].filter(Boolean);
}

export function safeScenario(value) {
  if (!value || typeof value !== "object") return {};
  return value;
}

const SCENARIO_KEYS = [
  "loanPurpose",
  "purchasePrice",
  "downPayment",
  "downPaymentPercent",
  "loanAmount",
  "creditScore",
  "loanType",
  "occupancy",
  "zipCode",
];

function sanitizeValue(value) {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value.trim() : value;
}

export function sanitizeScenarioUpdates(updates) {
  const clean = {};
  if (!updates || typeof updates !== "object") return clean;

  for (const key of SCENARIO_KEYS) {
    const value = sanitizeValue(updates[key]);
    if (value !== "") {
      clean[key] = value;
    }
  }

  return clean;
}

export function diffScenario(currentScenario, nextScenario) {
  const updates = {};

  for (const key of SCENARIO_KEYS) {
    const currentValue = sanitizeValue(currentScenario[key]);
    const nextValue = sanitizeValue(nextScenario[key]);

    if (nextValue !== "" && nextValue !== currentValue) {
      updates[key] = nextValue;
    }
  }

  return updates;
}

export function normalizeConversationHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .map((item) => {
      const role = item?.role === "assistant" ? "assistant" : "user";
      const content = String(item?.content || item?.text || "").trim();
      return content ? { role, content } : null;
    })
    .filter(Boolean)
    .slice(-12);
}

function summarizePricingOptions(pricingOptions) {
  if (!Array.isArray(pricingOptions) || !pricingOptions.length) return [];

  return pricingOptions.slice(0, 12).map((option) => ({
    rate: option?.rate,
    price: option?.price,
    paymentPI: option?.paymentPI,
    paymentPITI: option?.paymentPITI,
    program: option?.program,
    tags: Array.isArray(option?.tags) ? option.tags : [],
  }));
}

export function extractOutputText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const textParts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if ((content.type === "output_text" || content.type === "text") && content.text) {
        textParts.push(content.text);
      }
    }
  }

  return textParts.join("\n").trim();
}

export function parseModelJson(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return null;

  const stripped = normalized
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

export function buildResponsesPayload({ model, instructions, userMessage, currentScenario, conversationHistory, pricingOptions, localResult, deterministicUpdates, stream = false }) {
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
    stream,
  };
}

async function callResponsesApi(payload) {
  console.log("Calling OpenAI Sally Brain...");
  console.log("SALLY_TEXT_MODEL:", process.env.SALLY_TEXT_MODEL);

  const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseBody = await openaiResponse.json();
  console.log("OpenAI Response Received");

  if (!openaiResponse.ok) {
    throw new Error(responseBody.error?.message || "OpenAI request failed.");
  }

  return responseBody;
}

export function buildSallyInstructions() {
  return [
    "You are Sally, the AI loan officer assistant for Choose My Rate by Home Lenders of America.",
    "Be warm, clear, professional, natural, and simple. You are bilingual in English and Spanish.",
    "Guide borrowers like a real loan officer and ask one question at a time.",
    "Use the Sally prompt context below as your behavior layer: system prompt, guardrails, knowledge, examples, and integration notes.",
    "Keep the existing deterministic scenario parser as the control layer. The localDeterministicScenarioUpdates are high-confidence structured hints unless the borrower clearly corrects them.",
    "Return JSON only. Do not include markdown, code fences, or commentary outside JSON.",
    "Put replyText first in the returned JSON object so voice playback can begin from streamed text as early as possible.",
    "You may explain estimates, tradeoffs, rates, lender credits, points, monthly payment, cash to close, and loan options in plain language.",
    "In borrower-facing replyText, say rate options, rates, monthly payment, closing costs, cash to close, loan option, or loan program. Do not say pricing, pricing engine, pricing comes back, or pricing is available.",
    "Do not guarantee approval, rates, qualifications, savings, or timing.",
    "Do not reveal lender names to the borrower.",
    "Explain that all numbers are estimates until confirmed by a licensed loan officer and official disclosures when relevant.",
    "If the borrower asks affordability questions without enough detail, guide them step by step instead of pretending to calculate exact approval amounts.",
    "Recognize these loan types exactly when mentioned or implied: Conventional, FHA, VA, USDA, Jumbo, DSCR.",
    "Extract 5-digit ZIP codes into scenarioUpdates.zipCode when the borrower provides one.",
    "If the scenario is otherwise ready but ZIP code is missing, ask exactly: What ZIP code or area are you looking to buy in?",
    "Set needsPricingRefresh to true when scenarioUpdates materially affect pricing, such as loan purpose, purchase price, down payment, loan amount, credit score, loan type, occupancy, or ZIP code.",
    "Use nextQuestion for the single next question Sally should ask after the reply.",
    "Return this exact JSON shape with replyText as the first key: {\"replyText\":\"string\",\"detectedIntent\":\"purchase|refinance|cash_out|reset|affordability|compare_rates|other\",\"scenarioUpdates\":{\"loanPurpose\":\"\",\"purchasePrice\":\"\",\"downPayment\":\"\",\"downPaymentPercent\":\"\",\"loanAmount\":\"\",\"creditScore\":\"\",\"loanType\":\"\",\"occupancy\":\"\",\"zipCode\":\"\"},\"nextQuestion\":\"string\",\"needsPricingRefresh\":false,\"confidence\":\"low|medium|high\"}",
    "",
    "SALLY PROMPT CONTEXT:",
    sallyPromptContext,
  ].join("\n");
}

export async function handler(event) {
  if (event.requestContext?.http?.method === "OPTIONS" || event.httpMethod === "OPTIONS") {
    return jsonResponse(204, {});
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OpenAI API Key");
  }

  let payload;
  try {
    payload = parseRequestBody(event);
  } catch {
    return jsonResponse(400, { message: "Invalid JSON request body." });
  }

  const userMessage = String(payload.userMessage || payload.message || "").trim();
  const currentScenario = safeScenario(payload.currentScenario || payload.scenario);
  const conversationHistory = normalizeConversationHistory(payload.conversationHistory);
  const pricingOptions = Array.isArray(payload.pricingOptions) ? payload.pricingOptions : [];
  const localResult = payload.localResult || {};
  const localScenario = safeScenario(localResult.scenario);
  const deterministicUpdates = diffScenario(currentScenario, localScenario);

  if (!userMessage) {
    return jsonResponse(400, { message: "Message is required." });
  }

  const instructions = buildSallyInstructions();

  const modelsToTry = getSallyModels();
  let rawResponse;
  let usedModel = "";
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      rawResponse = await callResponsesApi(
        buildResponsesPayload({
          model,
          instructions,
          userMessage,
          currentScenario,
          conversationHistory,
          pricingOptions,
          localResult,
          deterministicUpdates,
        }),
      );
      usedModel = model;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!rawResponse) {
    return jsonResponse(502, {
      message: "Sally could not reach OpenAI right now.",
      error: lastError instanceof Error ? lastError.message : "OpenAI request failed.",
    });
  }

  const parsed = parseModelJson(extractOutputText(rawResponse)) || {};
  const scenarioUpdates = sanitizeScenarioUpdates(parsed.scenarioUpdates);
  const fallbackScenarioUpdates = { ...deterministicUpdates, ...scenarioUpdates };
  const replyText = String(parsed.replyText || localResult.message || "Got it. Tell me a little more.");

  console.log("OpenAI reply preview:", replyText.slice(0, 160));

  return jsonResponse(200, {
    replyText,
    detectedIntent: String(parsed.detectedIntent || "other"),
    scenarioUpdates: fallbackScenarioUpdates,
    nextQuestion: String(parsed.nextQuestion || ""),
    needsPricingRefresh: Boolean(parsed.needsPricingRefresh || Object.keys(fallbackScenarioUpdates).length),
    confidence: ["low", "medium", "high"].includes(parsed.confidence) ? parsed.confidence : "medium",
    model: usedModel,
    debug: {
      usedOpenAI: true,
      model: process.env.SALLY_TEXT_MODEL,
    },
  });
}
