export const pollyVoiceConfig = {
  voiceId: process.env.POLLY_VOICE_ID || "Joanna",
  engine: process.env.POLLY_ENGINE || "neural",
  languageCode: process.env.POLLY_LANGUAGE_CODE || "en-US",
  outputFormat: process.env.POLLY_OUTPUT_FORMAT || "mp3",
  speakingRate: process.env.POLLY_SPEAKING_RATE || "96%",
  sentenceBreakMs: Number(process.env.POLLY_SENTENCE_BREAK_MS || 280),
  clauseBreakMs: Number(process.env.POLLY_CLAUSE_BREAK_MS || 170),
  maxTextLength: Number(process.env.POLLY_MAX_TEXT_LENGTH || 2400),
};
