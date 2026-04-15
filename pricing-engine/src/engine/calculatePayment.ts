export function calculatePrincipalAndInterest(input: {
  loanAmount: number;
  annualRate: number;
  termMonths: number;
}) {
  const monthlyRate = input.annualRate / 100 / 12;
  if (monthlyRate === 0) return input.loanAmount / input.termMonths;

  return (
    (input.loanAmount * monthlyRate) /
    (1 - Math.pow(1 + monthlyRate, -input.termMonths))
  );
}

export function estimatePiti(input: {
  purchasePrice: number;
  loanAmount: number;
  annualRate: number;
  termMonths: number;
}) {
  const paymentPI = calculatePrincipalAndInterest(input);
  const taxes = input.purchasePrice ? (input.purchasePrice * 0.012) / 12 : 0;
  const insurance = input.purchasePrice ? (input.purchasePrice * 0.0045) / 12 : 0;
  return {
    paymentPI,
    paymentPITI: paymentPI + taxes + insurance,
  };
}
