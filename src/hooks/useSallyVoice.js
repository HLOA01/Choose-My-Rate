import { useCallback, useEffect, useRef, useState } from "react";
import { requestSallySpeech } from "../services/voice/sallyVoiceClient";
import { SallyRealtimeVoiceClient } from "../services/voice/sallyRealtimeClient";
import {
  DEFAULT_SALLY_VOICE_OPTIONS,
  SALLY_REALTIME_SESSION_URL,
  SALLY_VOICE_API_URL,
  SALLY_VOICE_MODE,
  SALLY_VOICE_STORAGE_KEYS,
  hasSallyVoiceApi,
} from "../services/voice/voiceConfig";

const THINKING_DELAY_MIN_MS = 0;
const THINKING_DELAY_MAX_MS = 0;
const MIN_SPOKEN_TEXT_LENGTH = 14;
const SINGLE_REQUEST_MAX_LENGTH = 350;
const CHUNK_TARGET_LENGTH = 240;
const CHUNK_MAX_LENGTH = 320;
const SKIPPED_SHORT_PHRASES = new Set([
  "got it",
  "perfect",
  "sounds good",
  "thank you",
  "thanks",
  "okay",
  "ok",
]);

function createAbortError() {
  return new DOMException("Sally voice playback was interrupted.", "AbortError");
}

function normalizeSpeechText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldSkipSpeech(text) {
  const normalized = normalizeSpeechText(text);
  const stripped = normalized.replace(/[^\w\s]/g, "").trim();
  const wordCount = stripped ? stripped.split(/\s+/).length : 0;
  const compactPhrase = stripped.toLowerCase();

  return (
    stripped.length < MIN_SPOKEN_TEXT_LENGTH ||
    wordCount <= 2 ||
    SKIPPED_SHORT_PHRASES.has(compactPhrase)
  );
}

function splitSpeechChunks(text) {
  const normalized = normalizeSpeechText(text);
  if (!normalized) return [];
  if (normalized.length <= SINGLE_REQUEST_MAX_LENGTH) return [normalized];

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const sourceParts = (sentences.length > 1 ? sentences : [normalized])
    .flatMap((part) => {
      if (part.length <= CHUNK_MAX_LENGTH) return [part];

      return part
        .split(/(?<=[,;:])\s+/)
        .map((chunk) => chunk.trim())
        .filter(Boolean);
    });

  const chunks = [];
  let currentChunk = "";

  for (const part of sourceParts) {
    const nextChunk = currentChunk ? `${currentChunk} ${part}` : part;

    if (nextChunk.length <= CHUNK_MAX_LENGTH || !currentChunk) {
      currentChunk = nextChunk;
      continue;
    }

    chunks.push(currentChunk);
    currentChunk = part;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  if (!chunks.length) {
    return [normalized];
  }

  return chunks;
}

function getThinkingDelay(delayOverride) {
  if (typeof delayOverride === "number") return delayOverride;
  return THINKING_DELAY_MIN_MS + Math.round(Math.random() * (THINKING_DELAY_MAX_MS - THINKING_DELAY_MIN_MS));
}

function escapeXml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSpeechSsml(text) {
  const normalized = normalizeSpeechText(text);
  if (!normalized) return "";

  const ssmlBody = escapeXml(normalized)
    .replace(/([.!?])\s+/g, `$1 <break time="280ms"/> `)
    .replace(/([,;:])\s+/g, `$1 <break time="170ms"/> `);

  return `<speak><prosody rate="96%">${ssmlBody}</prosody></speak>`;
}

function readStoredBoolean(key, fallbackValue) {
  if (typeof window === "undefined") return fallbackValue;

  const storedValue = window.localStorage?.getItem(key);
  if (storedValue === null) return fallbackValue;
  return storedValue === "true";
}

function getElapsedMs(startTime) {
  return Math.round(performance.now() - startTime);
}

// TODO: Upgrade Sally voice to OpenAI Realtime API for true streaming speech.
// The current text-to-speech endpoint will always have some request latency
// compared with live speech-to-speech audio.

export function useSallyVoice() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [muted, setMuted] = useState(() =>
    readStoredBoolean(SALLY_VOICE_STORAGE_KEYS.muted, DEFAULT_SALLY_VOICE_OPTIONS.muted),
  );
  const [autoPlay, setAutoPlay] = useState(() =>
    readStoredBoolean(SALLY_VOICE_STORAGE_KEYS.autoPlay, DEFAULT_SALLY_VOICE_OPTIONS.autoPlay),
  );
  const [voiceError, setVoiceError] = useState("");

  const audioRef = useRef(null);
  const activeUrlRef = useRef("");
  const requestControllerRef = useRef(null);
  const requestVersionRef = useRef(0);
  const cancelPlaybackRef = useRef(null);
  const realtimeClientRef = useRef(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";

    const handlePlay = () => setIsSpeaking(true);
    const handlePause = () => setIsSpeaking(false);
    const handleEnded = () => setIsSpeaking(false);
    const handleError = () => {
      setIsSpeaking(false);
      setVoiceError("Sally voice playback failed.");
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    audioRef.current = audio;

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);

      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = "";
      }

      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      realtimeClientRef.current?.stop();
      realtimeClientRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage?.setItem(SALLY_VOICE_STORAGE_KEYS.muted, String(muted));
    }
  }, [muted]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage?.setItem(SALLY_VOICE_STORAGE_KEYS.autoPlay, String(autoPlay));
    }
  }, [autoPlay]);

  const clearActiveAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
    audio.removeAttribute("src");
    audio.load();

    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = "";
    }
  }, []);

  const stop = useCallback(() => {
    // Incrementing the request version invalidates any in-flight response
    // so a newer Sally message can safely interrupt older audio.
    requestVersionRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    cancelPlaybackRef.current?.();
    cancelPlaybackRef.current = null;
    realtimeClientRef.current?.stop();
    clearActiveAudio();
    setIsLoading(false);
    setIsSpeaking(false);
  }, [clearActiveAudio]);

  const playBlobChunk = useCallback(
    async (blob, requestVersion, { onPlaybackStarted } = {}) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (requestVersion !== requestVersionRef.current) {
        throw createAbortError();
      }

      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = "";
      }

      const objectUrl = URL.createObjectURL(blob);
      activeUrlRef.current = objectUrl;
      audio.src = objectUrl;

      await new Promise((resolve, reject) => {
        const cleanup = () => {
          audio.removeEventListener("ended", handleEnded);
          audio.removeEventListener("error", handleError);
          if (cancelPlaybackRef.current === cancelPlayback) {
            cancelPlaybackRef.current = null;
          }
        };

        const handleEnded = () => {
          cleanup();
          resolve();
        };

        const handleError = () => {
          cleanup();
          reject(new Error("Sally voice playback failed."));
        };

        const cancelPlayback = () => {
          cleanup();
          reject(createAbortError());
        };

        cancelPlaybackRef.current = cancelPlayback;
        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("error", handleError);
        console.log("Playing Sally audio");
        audio
          .play()
          .then(() => {
            onPlaybackStarted?.();
          })
          .catch((error) => {
            console.error("Sally audio play() failed:", error);
            cleanup();
            reject(error);
          });
      });
    },
    [],
  );

  const speak = useCallback(
    async (text, options = {}) => {
      const normalizedText = String(text || "").trim();
      if (!normalizedText) return false;
      const timing = options.timing || {
        label: options.timingLabel,
        submitStartedAt: options.submitStartedAt,
        responseStartedAt: options.responseStartedAt,
        responseCompletedAt: options.responseCompletedAt,
      };

      const shouldAutoPlay = options.auto !== false;
      if (shouldAutoPlay && !autoPlay) return false;
      if (muted) return false;
      if (shouldSkipSpeech(normalizedText)) return false;

      if (!hasSallyVoiceApi()) {
        setVoiceError("Sally voice API is not configured.");
        return false;
      }

      stop();
      setVoiceError("");

      if (SALLY_VOICE_MODE === "realtime" && SALLY_REALTIME_SESSION_URL) {
        try {
          setIsLoading(true);
          if (!realtimeClientRef.current) {
            realtimeClientRef.current = new SallyRealtimeVoiceClient();
          }

          await realtimeClientRef.current.speak(normalizedText);
          return true;
        } catch (error) {
          console.warn("Sally Realtime voice failed, falling back to TTS:", error);
          realtimeClientRef.current?.stop();
          realtimeClientRef.current = null;

          if (!SALLY_VOICE_API_URL) {
            setVoiceError(error?.message || "Sally Realtime voice failed.");
            return false;
          }
        } finally {
          setIsLoading(false);
        }
      }

      const controller = new AbortController();
      const requestVersion = requestVersionRef.current + 1;
      const voiceStartTime = performance.now();
      let firstChunkReceived = false;
      let playbackStarted = false;

      requestVersionRef.current = requestVersion;
      requestControllerRef.current = controller;
      setIsLoading(true);

      try {
        const chunks = splitSpeechChunks(normalizedText);
        console.log("[Sally voice timing] speak requested", {
          mode: SALLY_VOICE_MODE,
          hasTtsUrl: Boolean(SALLY_VOICE_API_URL),
          hasRealtimeSessionUrl: Boolean(SALLY_REALTIME_SESSION_URL),
          label: timing?.label || "",
          msFromSubmit: timing?.submitStartedAt
            ? Math.round(performance.now() - timing.submitStartedAt)
            : null,
          msFromResponseStart: timing?.responseStartedAt
            ? Math.round(performance.now() - timing.responseStartedAt)
            : null,
          msFromResponseComplete: timing?.responseCompletedAt
            ? Math.round(performance.now() - timing.responseCompletedAt)
            : null,
          chunks: chunks.length,
          characters: normalizedText.length,
        });

        await new Promise((resolve) => {
          window.setTimeout(resolve, getThinkingDelay(options.delayMs));
        });

        if (requestVersion !== requestVersionRef.current) return false;

        const requestChunk = async (chunk) =>
          requestSallySpeech(chunk, {
            ...options,
            ssml: buildSpeechSsml(chunk),
            signal: controller.signal,
          });

        let nextChunkPromise = requestChunk(chunks[0]);

        for (let index = 0; index < chunks.length; index += 1) {
          const blob = await nextChunkPromise;

          nextChunkPromise =
            index < chunks.length - 1
              ? requestChunk(chunks[index + 1])
              : null;

          if (!firstChunkReceived) {
            firstChunkReceived = true;
            console.log("[Sally voice timing] first audio chunk received", {
              elapsedMs: getElapsedMs(voiceStartTime),
              msFromSubmit: timing?.submitStartedAt
                ? Math.round(performance.now() - timing.submitStartedAt)
                : null,
              blobSize: blob.size,
            });
          }

          if (requestVersion !== requestVersionRef.current) return false;

          // Only one HTMLAudioElement is used so playback never overlaps.
          await playBlobChunk(blob, requestVersion, {
            onPlaybackStarted: () => {
              if (playbackStarted) return;
              playbackStarted = true;
              console.log("[Sally voice timing] playback started", {
                elapsedMs: getElapsedMs(voiceStartTime),
                msFromSubmit: timing?.submitStartedAt
                  ? Math.round(performance.now() - timing.submitStartedAt)
                  : null,
              });
            },
          });
        }

        return true;
      } catch (error) {
        if (error?.name !== "AbortError") {
          setVoiceError(error?.message || "Sally voice request failed.");
        }
        return false;
      } finally {
        console.log("[Sally voice timing] total voice time", {
          elapsedMs: getElapsedMs(voiceStartTime),
          msFromSubmit: timing?.submitStartedAt
            ? Math.round(performance.now() - timing.submitStartedAt)
            : null,
        });

        if (requestVersion === requestVersionRef.current) {
          requestControllerRef.current = null;
          cancelPlaybackRef.current = null;
          setIsLoading(false);
        }
      }
    },
    [autoPlay, muted, playBlobChunk, stop],
  );

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      if (next) {
        stop();
      }
      return next;
    });
  }, [stop]);

  const toggleAutoPlay = useCallback(() => {
    setAutoPlay((current) => !current);
  }, []);

  return {
    speak,
    stop,
    isSpeaking,
    isLoading,
    muted,
    autoPlay,
    voiceError,
    voiceAvailable: hasSallyVoiceApi(),
    setMuted,
    setAutoPlay,
    toggleMuted,
    toggleAutoPlay,
  };
}
