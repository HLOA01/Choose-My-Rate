import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { pollyVoiceConfig } from "./polly-voice-config.mjs";

const pollyClient = new PollyClient({});

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "OPTIONS,POST",
};

function response(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function audioResponse(buffer, contentType) {
  return {
    statusCode: 200,
    isBase64Encoded: true,
    headers: {
      ...corsHeaders,
      "Content-Type": contentType,
      "Cache-Control": "no-store, max-age=0",
    },
    body: Buffer.from(buffer).toString("base64"),
  };
}

function parseRequestBody(event) {
  if (!event.body) return {};

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  return JSON.parse(rawBody);
}

function stripControlCharacters(value) {
  return String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function escapeXml(value) {
  return stripControlCharacters(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeSpeechText(text) {
  return stripControlCharacters(text)
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()
    .slice(0, pollyVoiceConfig.maxTextLength);
}

function chunkSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function sentenceToSsml(sentence) {
  return escapeXml(sentence).replace(/([,;:])\s+/g, `$1 <break time="${pollyVoiceConfig.clauseBreakMs}ms"/> `);
}

function buildSsmlFromText(text) {
  const normalizedText = normalizeSpeechText(text);
  if (!normalizedText) return "";

  const sentences = chunkSentences(normalizedText);
  const chunks = sentences.length ? sentences : [normalizedText];

  return [
    "<speak>",
    `<prosody rate="${pollyVoiceConfig.speakingRate}">`,
    chunks
      .map((chunk, index) => {
        const sentence = sentenceToSsml(chunk);
        if (index === chunks.length - 1) return sentence;
        return `${sentence} <break time="${pollyVoiceConfig.sentenceBreakMs}ms"/>`;
      })
      .join(" "),
    "</prosody>",
    "</speak>",
  ].join("");
}

function normalizeSsml(ssml) {
  const normalized = stripControlCharacters(ssml).trim();
  if (!normalized) return "";
  if (normalized.startsWith("<speak>")) return normalized;
  return `<speak>${normalized}</speak>`;
}

async function audioStreamToBuffer(audioStream) {
  if (!audioStream) return Buffer.alloc(0);

  if (typeof audioStream.transformToByteArray === "function") {
    const byteArray = await audioStream.transformToByteArray();
    return Buffer.from(byteArray);
  }

  const chunks = [];
  for await (const chunk of audioStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export async function handler(event) {
  if (event.requestContext?.http?.method === "OPTIONS" || event.httpMethod === "OPTIONS") {
    return response(204, "");
  }

  let payload;
  try {
    payload = parseRequestBody(event);
  } catch {
    return response(400, { message: "Invalid JSON request body." }, { "Content-Type": "application/json" });
  }

  const plainText = typeof payload.text === "string" ? payload.text : "";
  const suppliedSsml = typeof payload.ssml === "string" ? payload.ssml : "";
  const ssml = suppliedSsml ? normalizeSsml(suppliedSsml) : buildSsmlFromText(plainText);

  if (!ssml) {
    return response(400, { message: "Text or SSML is required." }, { "Content-Type": "application/json" });
  }

  const command = new SynthesizeSpeechCommand({
    OutputFormat: payload.outputFormat || pollyVoiceConfig.outputFormat,
    VoiceId: payload.voiceId || pollyVoiceConfig.voiceId,
    Engine: payload.engine || pollyVoiceConfig.engine,
    LanguageCode: payload.languageCode || pollyVoiceConfig.languageCode,
    TextType: "ssml",
    Text: ssml,
  });

  try {
    const pollyResponse = await pollyClient.send(command);
    const audioBuffer = await audioStreamToBuffer(pollyResponse.AudioStream);
    return audioResponse(audioBuffer, "audio/mpeg");
  } catch (error) {
    console.error("Sally Polly synthesis failed:", error);
    return response(
      500,
      {
        message: "Sally voice synthesis failed.",
        error: error instanceof Error ? error.message : "Unknown Polly error.",
      },
      { "Content-Type": "application/json" },
    );
  }
}
