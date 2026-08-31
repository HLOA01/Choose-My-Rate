export function SallyPanel({
  autoPlay,
  chatMode,
  input,
  isListening,
  isSpeaking,
  isThinking,
  lastAnswer,
  prompt,
  sallyDebug,
  speechSupported,
  voiceAvailable,
  voiceEnabled,
  voiceError,
  voiceInputStatus,
  onInputChange,
  onInputKeyDown,
  onSendMessage,
  onStartVoice,
  onStopVoice,
  onToggleAutoPlay,
  onToggleChatMode,
  onToggleVoice,
}) {
  return (
    <section className="sally-section" data-testid="sally-panel">
      <div className="sally-header">
        <div className="sally-left-zone">
          <div className="sally-identity">
            <div className={`sally-status-dot ${isSpeaking ? "speaking" : isListening ? "listening" : ""}`} />
            <div>
              <div className="sally-name">Sally</div>
              <div className="sally-subtitle-text">Your mortgage conversation guide</div>
              {sallyDebug?.usedOpenAI === true ? <div className="ai-mode-indicator">AI MODE ACTIVE</div> : null}
            </div>
          </div>

          <div className="sally-inline-controls">
            <button
              type="button"
              className={`mode-toggle ${chatMode === "ai" ? "active-control" : ""}`}
              onClick={onToggleChatMode}
              title="Switch Sally mode"
            >
              {chatMode === "ai" ? "AI" : "Rules"}
            </button>

            <button
              type="button"
              className="icon-control"
              onClick={onStopVoice}
              aria-label="Stop"
              title="Stop"
            >
              Stop
            </button>

            <button
              type="button"
              className={`icon-control ${voiceEnabled ? "active-control" : ""}`}
              onClick={onToggleVoice}
              aria-label="Voice"
              title="Voice"
            >
              Vol
            </button>
          </div>

          <div className="sally-voice-note">
            {voiceError
              ? voiceError
              : voiceAvailable
              ? `Sally voice is using OpenAI Marin with Polly fallback.${autoPlay ? " Auto-play is on." : " Auto-play is off."}`
              : "Configure the Sally voice API to enable Sally playback."}
          </div>

          <button
            type="button"
            className={`voice-setting-toggle ${autoPlay ? "active-control" : ""}`}
            onClick={onToggleAutoPlay}
          >
            Auto-play {autoPlay ? "On" : "Off"}
          </button>
        </div>

        <div className="sally-right-tools">
          <div className="top-actions">
            <button type="button" className="top-action-btn">Request a Call</button>
            <button type="button" className="top-action-btn">Save Scenario</button>
            <button type="button" className="top-action-btn">Start Over</button>
          </div>
        </div>
      </div>

      <div className="question-stream">
        <div className="mini-label">Current question</div>
        <div className="question-text retro-text" data-testid="sally-response">
          {prompt}
        </div>

        <div className="latest-answer-inline">
          <span className="mini-label">Latest answer</span>
          <span className="answer-text retro-text">{lastAnswer || "Waiting for your answer..."}</span>
        </div>
      </div>

      <div className="conversation-row">
        <div className={`conversation-input-shell ${isListening ? "listening" : ""}`}>
          <textarea
            className="conversation-input retro-text"
            data-testid="sally-input"
            aria-label="Ask Sally"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            rows={2}
            placeholder="Type here or click Mic and speak..."
          />
          <button
            type="button"
            className={`input-mic-button ${isListening ? "active-control" : ""}`}
            onClick={onStartVoice}
            disabled={!speechSupported}
            aria-pressed={isListening}
            aria-label={isListening ? "Stop listening" : "Start voice input"}
            title={isListening ? "Stop listening" : "Start voice input"}
          >
            Mic
          </button>
        </div>
        <button type="button" className="primary-cta" data-testid="sally-send" onClick={onSendMessage}>
          {isThinking ? "Thinking..." : "Send"}
        </button>
      </div>
      {voiceInputStatus ? <div className="voice-input-status">{voiceInputStatus}</div> : null}
    </section>
  );
}
