import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { pollyVoiceConfig } from "./polly-voice-config.mjs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SALLY_TTS_MODEL = process.env.SALLY_TTS_MODEL || "gpt-4o-mini-tts";
const SALLY_TTS_VOICE = process.env.SALLY_TTS_VOICE || "marin";
const VOICE_PROVIDER = process.env.VOICE_PROVIDER || "openai";
const VOICE_FALLBACK_PROVIDER = process.env.VOICE_FALLBACK_PROVIDER || "polly";

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

function audioResponse(buffer, contentType, provider) {
  return {
    statusCode: 200,
    isBase64Encoded: true,
    headers: {
      ...corsHeaders,
      "Content-Type": contentType,
      "Cache-Control": "no-store, max-age=0",
      "X-Sally-Voice-Provider": provider,
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

function normalizeSpeechText(text) {
  return stripControlCharacters(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, pollyVoiceConfig.maxTextLength);
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

async function synthesizeWithPolly(payload) {
  const plainText = typeof payload.text === "string" ? payload.text : "";
  const suppliedSsml = typeof payload.ssml === "string" ? payload.ssml : "";
  const ssml = suppliedSsml ? normalizeSsml(suppliedSsml) : `<speak>${normalizeSpeechText(plainText)}</speak>`;

  const command = new SynthesizeSpeechCommand({
    OutputFormat: payload.outputFormat || pollyVoiceConfig.outputFormat,
    VoiceId: process.env.POLLY_VOICE_ID || pollyVoiceConfig.voiceId,
    Engine: process.env.POLLY_ENGINE || pollyVoiceConfig.engine,
    LanguageCode: process.env.POLLY_LANGUAGE_CODE || pollyVoiceConfig.languageCode,
    TextType: "ssml",
    Text: ssml,
  });

  const pollyResponse = await pollyClient.send(command);
  return audioStreamToBuffer(pollyResponse.AudioStream);
}

async function synthesizeWithOpenAi(text) {
  const openAiResponse = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SALLY_TTS_MODEL,
      voice: SALLY_TTS_VOICE,
      input: normalizeSpeechText(text),
      format: "mp3",
    }),
  });

  if (!openAiResponse.ok) {
    let message = "OpenAI voice request failed.";
    try {
      const errorBody = await openAiResponse.json();
      message = errorBody.error?.message || message;
    } catch {
      // Ignore JSON parse errors and keep generic message.
    }
    throw new Error(message);
  }

  const audioArrayBuffer = await openAiResponse.arrayBuffer();
  return Buffer.from(audioArrayBuffer);
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
  if (!normalizeSpeechText(plainText)) {
    return response(400, { message: "Text is required." }, { "Content-Type": "application/json" });
  }

  const canUseOpenAi = Boolean(OPENAI_API_KEY) && VOICE_PROVIDER === "openai";

  try {
    if (canUseOpenAi) {
      const buffer = await synthesizeWithOpenAi(plainText);
      return audioResponse(buffer, "audio/mpeg", "openai");
    }

    if (VOICE_FALLBACK_PROVIDER === "polly") {
      const buffer = await synthesizeWithPolly(payload);
      return audioResponse(buffer, "audio/mpeg", "polly");
    }

    return response(500, { message: "No voice provider is configured." }, { "Content-Type": "application/json" });
  } catch (error) {
    if (VOICE_FALLBACK_PROVIDER === "polly") {
      try {
        const buffer = await synthesizeWithPolly(payload);
        return audioResponse(buffer, "audio/mpeg", "polly");
      } catch (pollyError) {
        return response(
          500,
          {
            message: "Sally voice synthesis failed.",
            error: pollyError instanceof Error ? pollyError.message : "Unknown Polly error.",
            primaryError: error instanceof Error ? error.message : "Unknown OpenAI voice error.",
          },
          { "Content-Type": "application/json" },
        );
      }
    }

    return response(
      500,
      {
        message: "Sally voice synthesis failed.",
        error: error instanceof Error ? error.message : "Unknown voice provider error.",
      },
      { "Content-Type": "application/json" },
    );
  }
}
