import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REALTIME_MODEL = process.env.SALLY_REALTIME_MODEL || "gpt-realtime";
const REALTIME_VOICE = process.env.SALLY_REALTIME_VOICE || process.env.SALLY_TTS_VOICE || "marin";

const promptFiles = [
  ["Sally Knowledge Base", "Sally_Knowledge_Base.md"],
  ["Sally OpenAI Integration Notes", "Sally_OpenAI_Integration_Notes.md"],
  ["Sally Guardrails and Compliance", "Sally_Guardrails_and_Compliance.md"],
  ["Sally Response Examples", "Sally_Response_Examples.md"],
];

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
    },
    body: JSON.stringify(body),
  };
}

function loadPromptFile([title, fileName]) {
  try {
    const content = readFileSync(join(__dirname, "prompts", fileName), "utf8");
    return `# ${title}\n\n${content}`;
  } catch (error) {
    console.warn(`Unable to load ${fileName}:`, error);
    return `# ${title}\n\nUnavailable.`;
  }
}

function buildSallyRealtimeInstructions() {
  return [
    "You are Sally, the AI loan officer assistant for Choose My Rate by Home Lenders of America.",
    "Speak warmly, clearly, naturally, and professionally. Keep responses concise enough for voice.",
    "Guide borrowers one step at a time. Do not guarantee approval, rates, savings, or timing.",
    "Explain that numbers are estimates until confirmed by a licensed loan officer and official disclosures when relevant.",
    "Do not reveal lender names to the borrower.",
    "",
    "SALLY PROMPT CONTEXT:",
    promptFiles.map(loadPromptFile).join("\n\n---\n\n"),
  ].join("\n");
}

export async function handler(event) {
  if (event.requestContext?.http?.method === "OPTIONS" || event.httpMethod === "OPTIONS") {
    return jsonResponse(204, {});
  }

  const method = event.requestContext?.http?.method || event.httpMethod;
  if (method !== "GET") {
    return jsonResponse(405, { message: "Method not allowed." });
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OpenAI API Key");
  }

  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        output_modalities: ["audio"],
        instructions: buildSallyRealtimeInstructions(),
        audio: {
          output: {
            voice: REALTIME_VOICE,
            format: {
              type: "audio/pcm",
              rate: 24000,
            },
          },
        },
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    return jsonResponse(502, {
      message: payload.error?.message || "Realtime session token request failed.",
      error: payload.error,
    });
  }

  return jsonResponse(200, {
    ...payload,
    debug: {
      mode: "realtime",
      model: REALTIME_MODEL,
      voice: REALTIME_VOICE,
    },
  });
}
