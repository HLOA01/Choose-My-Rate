export function ScenarioControl({ field, value, onChange }) {
  const controlId = `scenario-field-${field.key}`;

  return (
    <div className="scenario-control" data-testid={`scenario-control-${field.key}`}>
      <label className="scenario-control-label" htmlFor={controlId}>
        {field.label}
      </label>

      {field.type === "select" ? (
        <select
          id={controlId}
          className="scenario-select"
          data-testid={`scenario-field-${field.key}`}
          value={value || ""}
          onChange={(e) => onChange(field.key, e.target.value)}
        >
          <option value="">Select</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={controlId}
          className="scenario-input"
          data-testid={`scenario-field-${field.key}`}
          value={value || ""}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.type === "currency" ? "Enter amount" : "Enter value"}
        />
      )}
    </div>
  );
}
