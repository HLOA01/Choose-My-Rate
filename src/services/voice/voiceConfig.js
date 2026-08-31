export const SALLY_VOICE_API_URL = import.meta.env.VITE_SALLY_VOICE_API_URL || "";
export const SALLY_REALTIME_SESSION_URL = import.meta.env.VITE_SALLY_REALTIME_SESSION_URL || "";
export const SALLY_VOICE_MODE = import.meta.env.VITE_SALLY_VOICE_MODE || "tts";
export const SALLY_VOICE_PROVIDER_LABEL = import.meta.env.VITE_SALLY_VOICE_PROVIDER_LABEL || "OpenAI Marin with Polly fallback";

export const SALLY_VOICE_STORAGE_KEYS = {
  muted: "choose-my-rate-sally-voice-muted",
  autoPlay: "choose-my-rate-sally-voice-autoplay",
};

export const SALLY_VOICE_PROFILES = {
  en: {
    label: "English",
    languageCode: "en-US",
    voiceId: "Joanna",
    engine: "neural",
  },
  es: {
    label: "Spanish",
    languageCode: "es-US",
    voiceId: "Lupe",
    engine: "neural",
  },
};

export const DEFAULT_SALLY_VOICE_LOCALE = "en";

export const DEFAULT_SALLY_VOICE_OPTIONS = {
  outputFormat: "mp3",
  audioMimeType: "audio/mpeg",
  autoPlay: true,
  muted: false,
};

export function getSallyVoiceProfile(locale = DEFAULT_SALLY_VOICE_LOCALE) {
  return SALLY_VOICE_PROFILES[locale] || SALLY_VOICE_PROFILES.en;
}

export function hasSallyVoiceApi() {
  if (SALLY_VOICE_MODE === "realtime") {
    return Boolean(SALLY_REALTIME_SESSION_URL || SALLY_VOICE_API_URL);
  }

  return Boolean(SALLY_VOICE_API_URL);
}
