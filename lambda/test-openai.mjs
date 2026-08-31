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
    },
    body: JSON.stringify(body),
  };
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

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.SALLY_TEXT_MODEL || "gpt-5.4",
      input: "Say: Sally is connected",
      max_output_tokens: 80,
    }),
  });

  const rawResponse = await response.json();

  if (!response.ok) {
    return jsonResponse(502, {
      message: rawResponse.error?.message || "OpenAI request failed.",
      rawResponse,
    });
  }

  return jsonResponse(200, rawResponse);
}
