import {
  DEFAULT_SALLY_VOICE_LOCALE,
  DEFAULT_SALLY_VOICE_OPTIONS,
  SALLY_VOICE_API_URL,
  getSallyVoiceProfile,
  hasSallyVoiceApi,
} from "./voiceConfig";

function normalizeSpeechText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

export function buildSpeechRequest(text, options = {}) {
  const normalizedText = normalizeSpeechText(text);
  const normalizedSsml = typeof options.ssml === "string" ? options.ssml.trim() : "";
  if (!normalizedText && !normalizedSsml) return null;

  const profile = getSallyVoiceProfile(options.locale || DEFAULT_SALLY_VOICE_LOCALE);

  return {
    text: normalizedText,
    ssml: normalizedSsml || undefined,
    locale: options.locale || DEFAULT_SALLY_VOICE_LOCALE,
    languageCode: options.languageCode || profile.languageCode,
    voiceId: options.voiceId || profile.voiceId,
    engine: options.engine || profile.engine,
    outputFormat: options.outputFormat || DEFAULT_SALLY_VOICE_OPTIONS.outputFormat,
  };
}

export async function requestSallySpeech(text, options = {}) {
  if (!hasSallyVoiceApi()) {
    throw new Error("VITE_SALLY_VOICE_API_URL is not set");
  }

  const payload = buildSpeechRequest(text, options);
  if (!payload) {
    throw new Error("Text is required to synthesize Sally voice.");
  }

  const response = await fetch(SALLY_VOICE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    const errorBody = contentType.includes("application/json")
      ? await response.json().catch(() => ({}))
      : await response.text().catch(() => "");

    throw new Error(
      errorBody.message ||
        errorBody.error ||
        (typeof errorBody === "string" && errorBody) ||
        `Sally voice API failed with ${response.status}`,
    );
  }

  return response.blob();
}
