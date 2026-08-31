export function DisclosureNote({ children, copy, testId = "disclosure-note" }) {
  return (
    <p className="disclosure-note" data-testid={testId}>
      {children || copy}
    </p>
  );
}
