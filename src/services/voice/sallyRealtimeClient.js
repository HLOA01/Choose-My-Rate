import { SALLY_REALTIME_SESSION_URL } from "./voiceConfig";

const REALTIME_CALL_URL = "https://api.openai.com/v1/realtime/calls";
const REALTIME_PLAYBACK_TIMEOUT_MS = 10_000;
const MANUAL_PLAY_TEST_NAME = "__playSallyRealtimeAudio";
const REALTIME_TEST_NAME = "__testRealtimeVoice";

function waitForDataChannelOpen(dataChannel) {
  if (dataChannel.readyState === "open") return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Sally Realtime data channel timed out."));
    }, REALTIME_PLAYBACK_TIMEOUT_MS);

    const handleOpen = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error("Sally Realtime data channel failed to open."));
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      dataChannel.removeEventListener("open", handleOpen);
      dataChannel.removeEventListener("error", handleError);
    };

    dataChannel.addEventListener("open", handleOpen);
    dataChannel.addEventListener("error", handleError);
  });
}

function waitForPeerConnectionConnected(peerConnection) {
  if (peerConnection.connectionState === "connected") return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Sally Realtime WebRTC connection timed out."));
    }, REALTIME_PLAYBACK_TIMEOUT_MS);

    const handleConnectionStateChange = () => {
      if (peerConnection.connectionState === "connected") {
        cleanup();
        resolve();
      } else if (["failed", "closed", "disconnected"].includes(peerConnection.connectionState)) {
        cleanup();
        reject(new Error(`Sally Realtime WebRTC ${peerConnection.connectionState}.`));
      }
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      peerConnection.removeEventListener("connectionstatechange", handleConnectionStateChange);
    };

    peerConnection.addEventListener("connectionstatechange", handleConnectionStateChange);
  });
}

function getEphemeralKey(sessionPayload) {
  return sessionPayload?.client_secret?.value || sessionPayload?.value || "";
}

function logRealtimeServerEvent(label, rawData) {
  try {
    const event = JSON.parse(rawData);
    console.log(label, event);

    if (event.type === "response.output_audio.delta") {
      console.log("response.output_audio.delta", event);
    }

    if (event.type === "response.output_audio.done") {
      console.log("response.output_audio.done", event);
    }

    if (String(event.type || "").startsWith("response.output_audio")) {
      console.log("Realtime audio chunks are being received:", event.type);
    }

    if (event.type === "error") {
      console.error("Realtime server error:", event);
      console.error("Realtime server error full JSON:", JSON.stringify(event, null, 2));
      console.error("Realtime error message:", event.error?.message);
      console.error("Realtime error code:", event.error?.code);
      console.error("Realtime error param:", event.error?.param);
      console.error("Realtime error type:", event.error?.type);
    }
  } catch {
    console.log(label, rawData);
  }
}

function sendRealtimeTextInput(dataChannel, text) {
  dataChannel.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text,
          },
        ],
      },
    }),
  );
  console.log("conversation.item.create sent");
}

function requestRealtimeAudioResponse(dataChannel) {
  dataChannel.send(
    JSON.stringify({
      type: "response.create",
    }),
  );
  console.log("response.create sent");
}

export class SallyRealtimeVoiceClient {
  constructor() {
    this.peerConnection = null;
    this.dataChannel = null;
    this.audioElement = this.createPersistentAudioElement();
    this.connectPromise = null;
    this.playbackPromise = null;
    this.resolvePlaybackStarted = null;
    this.rejectPlaybackStarted = null;
    this.pendingPlayRetry = null;
    this.hasPlaybackStarted = false;
  }

  isConnected() {
    return (
      this.peerConnection?.connectionState === "connected" &&
      this.dataChannel?.readyState === "open"
    );
  }

  async connect() {
    if (this.isConnected()) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.createConnection().finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  async createConnection() {
    if (!SALLY_REALTIME_SESSION_URL) {
      throw new Error("VITE_SALLY_REALTIME_SESSION_URL is not set");
    }

    console.log("Starting Realtime mode");
    console.log("Requesting session token");
    const sessionResponse = await fetch(SALLY_REALTIME_SESSION_URL);
    const sessionPayload = await sessionResponse.json();

    if (!sessionResponse.ok) {
      throw new Error(sessionPayload.message || "Unable to create Sally Realtime session.");
    }

    const ephemeralKey = getEphemeralKey(sessionPayload);
    if (!ephemeralKey) {
      throw new Error("Sally Realtime session did not return an ephemeral key.");
    }
    console.log("Token received");

    const peerConnection = new RTCPeerConnection();
    const audioElement = this.ensureAudioElement();

    peerConnection.ontrack = (event) => {
      console.log("Audio track received");
      console.log("Realtime audio track readyState:", event.track.readyState);
      console.log("Realtime audio track enabled:", event.track.enabled);
      audioElement.srcObject = new MediaStream([event.track]);
      console.log("Realtime audio srcObject assigned");
      console.log("Realtime audio readyState:", audioElement.readyState);
      console.log("Realtime audio element in DOM:", document.body.contains(audioElement));
      this.playAudioElement();
    };

    peerConnection.addTransceiver("audio", { direction: "recvonly" });

    const dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannel.addEventListener("message", (event) => {
      logRealtimeServerEvent("Sally Realtime event:", event.data);
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const sdpResponse = await fetch(REALTIME_CALL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp,
    });

    if (!sdpResponse.ok) {
      const errorText = await sdpResponse.text().catch(() => "");
      throw new Error(errorText || `Sally Realtime WebRTC setup failed with ${sdpResponse.status}`);
    }

    await peerConnection.setRemoteDescription({
      type: "answer",
      sdp: await sdpResponse.text(),
    });

    await waitForDataChannelOpen(dataChannel);
    await waitForPeerConnectionConnected(peerConnection);
    console.log("WebRTC connected");

    this.peerConnection = peerConnection;
    this.dataChannel = dataChannel;
  }

  createPersistentAudioElement() {
    if (typeof document === "undefined") return null;

    const audioElement = document.createElement("audio");
    audioElement.autoplay = true;
    audioElement.muted = false;
    audioElement.volume = 1;
    audioElement.preload = "auto";
    audioElement.playsInline = true;
    audioElement.setAttribute("data-sally-realtime-audio", "true");
    audioElement.style.display = "none";

    audioElement.addEventListener("playing", () => {
      console.log("Realtime playback started");
      this.hasPlaybackStarted = true;
      this.resolvePlaybackStarted?.();
    });

    return audioElement;
  }

  ensureAudioElement() {
    if (!this.audioElement) {
      this.audioElement = this.createPersistentAudioElement();
    }

    if (!this.audioElement) {
      throw new Error("Sally Realtime audio element could not be created.");
    }

    this.audioElement.autoplay = true;
    this.audioElement.muted = false;
    this.audioElement.volume = 1;

    if (!document.body.contains(this.audioElement)) {
      document.body.appendChild(this.audioElement);
    }

    window[MANUAL_PLAY_TEST_NAME] = () => this.forcePlay();
    console.log("Realtime audio element in DOM:", document.body.contains(this.audioElement));
    return this.audioElement;
  }

  playAudioElement() {
    const audioElement = this.ensureAudioElement();
    console.log("Realtime audio readyState before play():", audioElement.readyState);
    const playPromise = audioElement.play();
    console.log("Realtime audio play() result:", playPromise);

    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log("Realtime audio playing");
          this.hasPlaybackStarted = true;
          this.resolvePlaybackStarted?.();
        })
        .catch((error) => {
          console.error("Realtime audio play() failed:", error);
          this.queuePlaybackRetry();
        });
    }

    return playPromise;
  }

  queuePlaybackRetry() {
    if (this.pendingPlayRetry || typeof window === "undefined") return;

    this.pendingPlayRetry = () => {
      this.pendingPlayRetry = null;
      window.removeEventListener("click", retry);
      window.removeEventListener("pointerdown", retry);
      this.forcePlay();
    };

    const retry = this.pendingPlayRetry;
    window.addEventListener("click", retry, { once: true });
    window.addEventListener("pointerdown", retry, { once: true });
  }

  forcePlay() {
    if (!this.audioElement) {
      console.warn("Realtime audio manual play requested before audio element exists.");
      return Promise.resolve(false);
    }

    console.log("Manual Realtime audio play requested");
    console.log("Realtime audio element in DOM:", document.body.contains(this.audioElement));
    console.log("Realtime audio readyState:", this.audioElement.readyState);
    const playPromise = this.audioElement.play();
    console.log("Realtime audio play() result:", playPromise);

    if (playPromise !== undefined) {
      return playPromise
        .then(() => {
          console.log("Realtime audio playing");
          this.hasPlaybackStarted = true;
          this.resolvePlaybackStarted?.();
          return true;
        })
        .catch((error) => {
          console.error("Realtime audio play() failed:", error);
          throw error;
        });
    }

    return Promise.resolve(true);
  }

  waitForPlaybackStarted() {
    if (this.hasPlaybackStarted && this.audioElement?.srcObject) {
      return Promise.resolve();
    }

    if (this.playbackPromise) return this.playbackPromise;

    this.playbackPromise = new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error("Sally Realtime audio did not start playback."));
      }, REALTIME_PLAYBACK_TIMEOUT_MS);

      this.resolvePlaybackStarted = () => {
        window.clearTimeout(timeout);
        resolve();
      };

      this.rejectPlaybackStarted = (error) => {
        window.clearTimeout(timeout);
        reject(error);
      };
    }).finally(() => {
      this.playbackPromise = null;
      this.resolvePlaybackStarted = null;
      this.rejectPlaybackStarted = null;
    });

    return this.playbackPromise;
  }

  async speak(text) {
    const normalizedText = String(text || "").trim();
    if (!normalizedText) return false;

    await this.connect();

    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      throw new Error("Sally Realtime data channel is not open.");
    }

    console.log("Sending Sally text to Realtime voice", {
      characters: normalizedText.length,
    });

    const playbackStarted = this.waitForPlaybackStarted();

    sendRealtimeTextInput(
      this.dataChannel,
      `Say exactly this as Sally, without adding extra words: ${normalizedText}`,
    );
    requestRealtimeAudioResponse(this.dataChannel);

    await playbackStarted;
    return true;
  }

  stop() {
    this.dataChannel?.close();
    this.peerConnection?.getSenders().forEach((sender) => sender.track?.stop());
    this.peerConnection?.getReceivers().forEach((receiver) => receiver.track?.stop());
    this.peerConnection?.close();

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.srcObject = null;
    }

    this.peerConnection = null;
    this.dataChannel = null;
    this.connectPromise = null;
    this.rejectPlaybackStarted?.(new Error("Sally Realtime playback was stopped."));
    this.playbackPromise = null;
    this.resolvePlaybackStarted = null;
    this.rejectPlaybackStarted = null;
    this.hasPlaybackStarted = false;
  }
}

export async function testSallyRealtimeVoice() {
  console.log("Starting standalone Realtime voice test");
  console.log("Requesting session token");

  const sessionResponse = await fetch(SALLY_REALTIME_SESSION_URL);
  const sessionPayload = await sessionResponse.json();

  if (!sessionResponse.ok) {
    throw new Error(sessionPayload.message || "Unable to create Sally Realtime test session.");
  }

  const ephemeralKey = getEphemeralKey(sessionPayload);
  if (!ephemeralKey) {
    throw new Error("Sally Realtime test session did not return an ephemeral key.");
  }

  console.log("Token received");

  const audio = document.createElement("audio");
  audio.autoplay = true;
  audio.muted = false;
  audio.volume = 1;
  audio.preload = "auto";
  audio.playsInline = true;
  audio.setAttribute("data-sally-realtime-test-audio", "true");
  audio.style.display = "none";
  document.body.appendChild(audio);

  window.__sallyRealtimeTestAudio = audio;
  console.log("Realtime test audio element created");
  console.log("Realtime test audio element in DOM:", document.body.contains(audio));
  console.log("Realtime test audio muted:", audio.muted);
  console.log("Realtime test audio volume:", audio.volume);

  const forcePlay = () => {
    console.log("Manual Realtime test audio play requested");
    console.log("Realtime test audio readyState:", audio.readyState);
    console.log("Realtime test audio paused:", audio.paused);
    console.log("Realtime test audio muted:", audio.muted);
    console.log("Realtime test audio volume:", audio.volume);
    const playPromise = audio.play();
    console.log("Realtime test play() promise result:", playPromise);

    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log("Realtime audio should now be audible");
        })
        .catch((error) => {
          console.error("Realtime test audio play() failed:", error);
          window.addEventListener("click", forcePlay, { once: true });
          window.addEventListener("pointerdown", forcePlay, { once: true });
        });
    }

    return playPromise;
  };

  window.__playSallyRealtimeTestAudio = forcePlay;

  const peerConnection = new RTCPeerConnection();
  peerConnection.ontrack = (event) => {
    console.log("Realtime test audio track received");
    console.log("Realtime test track readyState:", event.track.readyState);
    console.log("Realtime test track enabled:", event.track.enabled);
    audio.srcObject = new MediaStream([event.track]);
    console.log("Realtime test audio.srcObject assigned");
    console.log("Realtime test audio readyState:", audio.readyState);
    console.log("Realtime test audio paused:", audio.paused);
    console.log("Realtime test audio muted:", audio.muted);
    console.log("Realtime test audio volume:", audio.volume);
    forcePlay();
  };

  peerConnection.addTransceiver("audio", { direction: "recvonly" });

  const dataChannel = peerConnection.createDataChannel("oai-events");
  dataChannel.addEventListener("message", (event) => {
    logRealtimeServerEvent("Realtime test event:", event.data);
  });

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  const sdpResponse = await fetch(REALTIME_CALL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ephemeralKey}`,
      "Content-Type": "application/sdp",
    },
    body: offer.sdp,
  });

  if (!sdpResponse.ok) {
    const errorText = await sdpResponse.text().catch(() => "");
    throw new Error(errorText || `Sally Realtime test WebRTC setup failed with ${sdpResponse.status}`);
  }

  await peerConnection.setRemoteDescription({
    type: "answer",
    sdp: await sdpResponse.text(),
  });

  await waitForDataChannelOpen(dataChannel);
  await waitForPeerConnectionConnected(peerConnection);
  console.log("Realtime test WebRTC connected");

  window.__sallyRealtimeTestPeerConnection = peerConnection;
  window.__sallyRealtimeTestDataChannel = dataChannel;

  sendRealtimeTextInput(
    dataChannel,
    "Say: Hello Cesar, this is Sally speaking in realtime.",
  );
  requestRealtimeAudioResponse(dataChannel);

  console.log("Realtime test prompt sent");
  console.log("If browser autoplay blocks audio, click anywhere or run window.__playSallyRealtimeTestAudio()");

  return {
    audio,
    peerConnection,
    dataChannel,
  };
}

if (typeof window !== "undefined") {
  window[REALTIME_TEST_NAME] = testSallyRealtimeVoice;
}
