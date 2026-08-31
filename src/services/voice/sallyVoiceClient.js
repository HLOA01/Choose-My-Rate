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

  const requestStartedAt = performance.now();
  const payload = buildSpeechRequest(text, options);
  if (!payload) {
    throw new Error("Text is required to synthesize Sally voice.");
  }

  console.log("[Sally voice timing] TTS fetch started", {
    url: SALLY_VOICE_API_URL,
    characters: payload.text.length,
  });

  const response = await fetch(SALLY_VOICE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  const contentType = response.headers.get("content-type") || "";
  console.log("[Sally voice timing] TTS response received", {
    status: response.status,
    elapsedMs: Math.round(performance.now() - requestStartedAt),
    contentType,
  });

  if (!response.ok) {
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

  if (!contentType.includes("audio/mpeg")) {
    const responseText = await response.text().catch(() => "");
    throw new Error(`Expected audio/mpeg from Sally voice API, received ${contentType || "no content-type"}. ${responseText}`);
  }

  const audioBlob = await response.blob();
  console.log("[Sally voice timing] TTS audio blob ready", {
    elapsedMs: Math.round(performance.now() - requestStartedAt),
    blobSize: audioBlob.size,
  });
  return audioBlob;
}
