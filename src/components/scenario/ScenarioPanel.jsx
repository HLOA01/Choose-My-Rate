import { ScenarioControl } from "./ScenarioControl";

export function ScenarioPanel({ demoPresets = [], scenario, scenarioFields, onChange, onLoadDemoPreset }) {
  return (
    <div className="scenario-panel" data-testid="scenario-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title scenario-title-red">Your Scenario</h2>
        </div>
        <div className="panel-note-mini">You can change these numbers at any time.</div>
      </div>

      {demoPresets.length ? (
        <div className="scenario-demo-presets">
          <label className="scenario-control-label" htmlFor="scenario-demo-presets">
            Demo presets
          </label>
          <select
            id="scenario-demo-presets"
            className="scenario-select"
            data-testid="scenario-demo-presets"
            value=""
            onChange={(e) => onLoadDemoPreset?.(e.target.value)}
          >
            <option value="">Load a demo scenario</option>
            {demoPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="scenario-grid">
        {scenarioFields.map((field) => (
          <ScenarioControl
            key={field.key}
            field={field}
            value={scenario[field.key] || ""}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
}
