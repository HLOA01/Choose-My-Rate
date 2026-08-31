import {
  buildResponsesPayload,
  buildSallyInstructions,
  diffScenario,
  extractOutputText,
  getSallyModels,
  normalizeConversationHistory,
  parseModelJson,
  safeScenario,
  sanitizeScenarioUpdates,
} from "./openai-sally.mjs";

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

function ssePayload(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function decodeJsonStringPrefix(value) {
  let decoded = "";
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (escaped) {
      if (char === "n") decoded += "\n";
      else if (char === "r") decoded += "\r";
      else if (char === "t") decoded += "\t";
      else if (char === "b") decoded += "\b";
      else if (char === "f") decoded += "\f";
      else if (char === "u") {
        const hex = value.slice(index + 1, index + 5);
        if (hex.length < 4 || !/^[\da-f]{4}$/i.test(hex)) break;
        decoded += String.fromCharCode(parseInt(hex, 16));
        index += 4;
      } else {
        decoded += char;
      }
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") break;
    decoded += char;
  }

  return decoded;
}

function extractReplyTextPrefix(partialJson) {
  const keyIndex = partialJson.indexOf("\"replyText\"");
  if (keyIndex === -1) return "";

  const colonIndex = partialJson.indexOf(":", keyIndex);
  if (colonIndex === -1) return "";

  const quoteIndex = partialJson.indexOf("\"", colonIndex);
  if (quoteIndex === -1) return "";

  return decodeJsonStringPrefix(partialJson.slice(quoteIndex + 1));
}

function finalizeResult({ rawResponse, currentScenario, deterministicUpdates, localResult, usedModel }) {
  const parsed = parseModelJson(extractOutputText(rawResponse)) || {};
  const scenarioUpdates = sanitizeScenarioUpdates(parsed.scenarioUpdates);
  const fallbackScenarioUpdates = { ...deterministicUpdates, ...scenarioUpdates };
  const replyText = String(parsed.replyText || localResult.message || "Got it. Tell me a little more.");

  return {
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
      streamed: true,
    },
  };
}

async function callStreamingResponsesApi(payload) {
  return fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

async function streamModelResponse({ response, res, currentScenario, deterministicUpdates, localResult, usedModel }) {
  const decoder = new TextDecoder();
  let sseBuffer = "";
  let rawText = "";
  let emittedReplyTextLength = 0;

  for await (const chunk of response.body) {
    sseBuffer += decoder.decode(chunk, { stream: true });
    const events = sseBuffer.split("\n\n");
    sseBuffer = events.pop() || "";

    for (const eventBlock of events) {
      const dataLines = eventBlock
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());

      for (const dataLine of dataLines) {
        if (!dataLine || dataLine === "[DONE]") continue;

        const event = JSON.parse(dataLine);
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          rawText += event.delta;
          const replyTextPrefix = extractReplyTextPrefix(rawText);
          const delta = replyTextPrefix.slice(emittedReplyTextLength);

          if (delta) {
            emittedReplyTextLength = replyTextPrefix.length;
            res.write(ssePayload("reply_delta", { delta }));
          }
        }

        if (event.type === "response.completed") {
          const final = finalizeResult({
            rawResponse: event.response,
            currentScenario,
            deterministicUpdates,
            localResult,
            usedModel,
          });
          res.write(ssePayload("final", final));
        }
      }
    }
  }
}

export async function streamHandler(event, res) {
  if (event.requestContext?.http?.method === "OPTIONS" || event.httpMethod === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.writeHead(500, { ...corsHeaders, "Content-Type": "text/event-stream" });
    res.end(ssePayload("error", { message: "Missing OpenAI API Key" }));
    return;
  }

  let payload;
  try {
    payload = parseRequestBody(event);
  } catch {
    res.writeHead(400, { ...corsHeaders, "Content-Type": "text/event-stream" });
    res.end(ssePayload("error", { message: "Invalid JSON request body." }));
    return;
  }

  const userMessage = String(payload.userMessage || payload.message || "").trim();
  if (!userMessage) {
    res.writeHead(400, { ...corsHeaders, "Content-Type": "text/event-stream" });
    res.end(ssePayload("error", { message: "Message is required." }));
    return;
  }

  const currentScenario = safeScenario(payload.currentScenario || payload.scenario);
  const conversationHistory = normalizeConversationHistory(payload.conversationHistory);
  const pricingOptions = Array.isArray(payload.pricingOptions) ? payload.pricingOptions : [];
  const localResult = payload.localResult || {};
  const localScenario = safeScenario(localResult.scenario);
  const deterministicUpdates = diffScenario(currentScenario, localScenario);
  const instructions = buildSallyInstructions();

  res.writeHead(200, {
    ...corsHeaders,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  let lastError = null;

  for (const model of getSallyModels()) {
    try {
      const openaiResponse = await callStreamingResponsesApi(
        buildResponsesPayload({
          model,
          instructions,
          userMessage,
          currentScenario,
          conversationHistory,
          pricingOptions,
          localResult,
          deterministicUpdates,
          stream: true,
        }),
      );

      if (!openaiResponse.ok) {
        const errorBody = await openaiResponse.json().catch(() => ({}));
        throw new Error(errorBody.error?.message || "OpenAI streaming request failed.");
      }

      await streamModelResponse({
        response: openaiResponse,
        res,
        currentScenario,
        deterministicUpdates,
        localResult,
        usedModel: model,
      });
      res.end();
      return;
    } catch (error) {
      lastError = error;
    }
  }

  res.write(ssePayload("error", {
    message: lastError instanceof Error ? lastError.message : "Sally streaming failed.",
  }));
  res.end();
}

export async function handler(event) {
  return jsonResponse(501, {
    message: "Sally streaming requires a streaming HTTP adapter. Use streamHandler in local development.",
  });
}
