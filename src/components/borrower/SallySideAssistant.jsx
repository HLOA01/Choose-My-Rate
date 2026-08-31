export function SallySideAssistant({ children }) {
  return (
    <aside className="sally-side-assistant" data-testid="sally-side-assistant" aria-label="Sally help assistant">
      <div className="sally-helper-copy">
        <div className="mini-label">Optional help</div>
        <h2 data-testid="sally-helper-title">Need help? Ask Sally.</h2>
        <p data-testid="sally-helper-description">
          Sally can explain rate options, monthly payment, closing costs, cash to close, and loan programs.
        </p>
      </div>

      <div className="sally-helper-panel" data-testid="sally-helper-panel">
        {children}
      </div>
    </aside>
  );
}
