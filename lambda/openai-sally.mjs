import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
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

function safeScenario(value) {
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

function sanitizeScenarioUpdates(updates) {
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

function diffScenario(currentScenario, nextScenario) {
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

function normalizeConversationHistory(history) {
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

function extractOutputText(response) {
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

function parseModelJson(text) {
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

// --- Reply guardrail -------------------------------------------------------
//
// Sally's structured scenarioUpdates are already whitelisted against
// SCENARIO_KEYS above. This section closes the remaining gap: the free-form
// replyText the model writes for the borrower to read was previously
// returned unchecked. These functions verify that any dollar or percent
// figure appearing in replyText is actually traceable to a real source
// (the current scenario, the deterministic parser's output, or an actual
// returned pricing option) before the reply is shown to a borrower.
//
// This is intentionally scoped to $ and % figures, which cover the
// dollar-amount and rate/point claims Sally is instructed she "may explain."
// It is a guardrail, not a full natural-language fact-checker.

const CLAIM_MATCH_MIN_RELATIVE_TOLERANCE = 0.01; // 1% of the source value
const CLAIM_MATCH_MIN_ABSOLUTE_TOLERANCE = 0.5;

function addNumberVariants(allowedNumbers, rawValue) {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) return;
  allowedNumbers.add(numeric);
  allowedNumbers.add(Math.round(numeric));
  allowedNumbers.add(Math.round(numeric * 10) / 10);
  allowedNumbers.add(Math.round(numeric * 100) / 100);
}

export function collectAllowedNumbers({ currentScenario, pricingOptions, localResult, deterministicUpdates } = {}) {
  const allowedNumbers = new Set();

  for (const source of [currentScenario, localResult?.scenario, deterministicUpdates]) {
    if (source && typeof source === "object") {
      for (const value of Object.values(source)) {
        addNumberVariants(allowedNumbers, value);
      }
    }
  }

  for (const option of Array.isArray(pricingOptions) ? pricingOptions : []) {
    for (const key of ["rate", "price", "paymentPI", "paymentPITI", "estimatedCashToClose"]) {
      addNumberVariants(allowedNumbers, option?.[key]);
    }
  }

  return allowedNumbers;
}

export function extractCurrencyAndPercentClaims(text) {
  const source = String(text || "");
  const dollarPattern = /\$\s?-?\d[\d,]*(?:\.\d+)?/g;
  const percentPattern = /-?\d+(?:\.\d+)?\s?%/g;

  const dollars = [...source.matchAll(dollarPattern)].map((match) => Number(match[0].replace(/[$,\s]/g, "")));
  const percents = [...source.matchAll(percentPattern)].map((match) => Number(match[0].replace(/[%\s]/g, "")));

  return [...dollars, ...percents].filter((value) => Number.isFinite(value));
}

function isNumberSourced(claim, allowedNumbers) {
  for (const allowed of allowedNumbers) {
    const tolerance = Math.max(CLAIM_MATCH_MIN_ABSOLUTE_TOLERANCE, Math.abs(allowed) * CLAIM_MATCH_MIN_RELATIVE_TOLERANCE);
    if (Math.abs(claim - allowed) <= tolerance) return true;
  }
  return false;
}

export function findUnsourcedFinancialClaims(text, allowedNumbers) {
  return extractCurrencyAndPercentClaims(text).filter((claim) => !isNumberSourced(claim, allowedNumbers));
}

export function validateReplyText(replyText, context) {
  const allowedNumbers = collectAllowedNumbers(context);
  const unsourcedClaims = findUnsourcedFinancialClaims(replyText, allowedNumbers);
  return { safe: unsourcedClaims.length === 0, unsourcedClaims };
}

// --- End reply guardrail ----------------------------------------------------

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

async function callResponsesApi(payload) {
  const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseBody = await openaiResponse.json();

  if (!openaiResponse.ok) {
    throw new Error(responseBody.error?.message || "OpenAI request failed.");
  }

  return responseBody;
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

  const instructions = [
    "You are Sally, the AI loan officer assistant for Choose My Rate by Home Lenders of America.",
    "Be warm, clear, professional, natural, and simple. You are bilingual in English and Spanish.",
    "Guide borrowers like a real loan officer and ask one question at a time.",
    "Use the Sally prompt context below as your behavior layer: system prompt, guardrails, knowledge, examples, and integration notes.",
    "Keep the existing deterministic scenario parser as the control layer. The localDeterministicScenarioUpdates are high-confidence structured hints unless the borrower clearly corrects them.",
    "Return JSON only. Do not include markdown, code fences, or commentary outside JSON.",
    "You may explain estimates, tradeoffs, rates, lender credits, points, monthly payment, cash to close, and loan options in plain language.",
    "Do not guarantee approval, rates, qualifications, savings, or timing.",
    "Do not reveal lender names to the borrower.",
    "Explain that all numbers are estimates until confirmed by a licensed loan officer and official disclosures when relevant.",
    "If the borrower asks affordability questions without enough detail, guide them step by step instead of pretending to calculate exact approval amounts.",
    "Recognize these loan types exactly when mentioned or implied: Conventional, FHA, VA, USDA, Jumbo, DSCR.",
    "Set needsPricingRefresh to true when scenarioUpdates materially affect pricing, such as loan purpose, purchase price, down payment, loan amount, credit score, loan type, occupancy, or ZIP code.",
    "Use nextQuestion for the single next question Sally should ask after the reply.",
    "Return this exact JSON shape: {\"replyText\":\"string\",\"detectedIntent\":\"purchase|refinance|cash_out|reset|affordability|compare_rates|other\",\"scenarioUpdates\":{\"loanPurpose\":\"\",\"purchasePrice\":\"\",\"downPayment\":\"\",\"downPaymentPercent\":\"\",\"loanAmount\":\"\",\"creditScore\":\"\",\"loanType\":\"\",\"occupancy\":\"\",\"zipCode\":\"\"},\"nextQuestion\":\"string\",\"needsPricingRefresh\":false,\"confidence\":\"low|medium|high\"}",
    "",
    "SALLY PROMPT CONTEXT:",
    sallyPromptContext,
  ].join("\n");

  const modelsToTry = [PRIMARY_MODEL, FALLBACK_MODEL].filter(Boolean);
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
  const fallbackScenarioUpdates = Object.keys(scenarioUpdates).length ? scenarioUpdates : deterministicUpdates;

  const candidateReplyText = String(parsed.replyText || "").trim();
  const replyValidation = candidateReplyText
    ? validateReplyText(candidateReplyText, { currentScenario, pricingOptions, localResult, deterministicUpdates })
    : { safe: true, unsourcedClaims: [] };

  if (!replyValidation.safe) {
    console.warn("Sally reply guardrail rejected unsourced financial claim(s):", replyValidation.unsourcedClaims);
  }

  const replyText = candidateReplyText && replyValidation.safe
    ? candidateReplyText
    : String(localResult.message || "Got it. Let's confirm that using your actual numbers before I go further.");

  return jsonResponse(200, {
    replyText,
    detectedIntent: String(parsed.detectedIntent || "other"),
    scenarioUpdates: fallbackScenarioUpdates,
    nextQuestion: String(parsed.nextQuestion || ""),
    needsPricingRefresh: Boolean(parsed.needsPricingRefresh || Object.keys(fallbackScenarioUpdates).length),
    confidence: replyValidation.safe
      ? (["low", "medium", "high"].includes(parsed.confidence) ? parsed.confidence : "medium")
      : "low",
    guardrailTriggered: !replyValidation.safe,
    model: usedModel,
  });
}
