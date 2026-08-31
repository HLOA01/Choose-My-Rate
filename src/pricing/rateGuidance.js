const RATE_GUIDANCE_COPY = {
  lower_rate: [
    "That lower rate can help bring the monthly payment down. The tradeoff is that it often comes with more upfront cost or discount points.",
    "You moved toward a lower-payment option. That can be attractive month to month, but it is worth checking how much extra cash it asks for at closing.",
    "This is the classic lower-rate tradeoff: less payment pressure each month, usually with more cost paid upfront.",
  ],
  higher_rate: [
    "That higher rate usually means the monthly payment goes up, but it may also create more lender credit to help reduce cash needed at closing.",
    "You moved toward a higher-rate option. This can make sense when preserving cash upfront matters more than getting the lowest monthly payment.",
    "This option leans toward lower upfront cost. The payment is higher, but the credit may help with closing costs.",
  ],
  near_par: [
    "This looks close to a no-points area. Many borrowers treat this as a middle-ground option because it avoids leaning too heavily into cost or credit.",
    "You are near par here, so the rate is not being pushed hard by extra points or a large credit. It is a useful comparison point.",
    "This is a balanced spot to review. It can help you compare the payment without a big upfront cost or a big lender credit shaping the decision.",
  ],
  higher_credit: [
    "This option is giving more lender credit. That can lower cash needed at closing, but the monthly payment is usually higher because the rate is higher.",
    "You moved toward more credit. That can be helpful if cash to close is the priority, as long as the higher payment still fits comfortably.",
    "This is more of a cash-to-close strategy. The credit can help upfront, and we would compare that against the extra payment over time.",
  ],
  steady: [
    "This option changes the upfront cost or credit more than the rate. I would compare the monthly payment and the points or credit side by side before picking it.",
    "This is another real rate option from the lender. The important part is how the payment and upfront cost feel together.",
  ],
};

const RATE_LOCK_REMINDERS = [
  "Also remember, these options are based on a 30-day lock and the rate is not locked yet.",
  "One important note: a rate is only secured after a full application, property address, and the loan is locked with the lender.",
  "For now, think of this as current rate guidance, not a locked rate. The lock happens later through the lender process.",
];

function getRateGuidanceType(currentOption, previousOption) {
  const currentPrice = Number(currentOption?.price || 0);
  const previousPrice = Number(previousOption?.price || 0);
  const currentRate = Number(currentOption?.rate || 0);
  const previousRate = Number(previousOption?.rate || 0);

  if (Math.abs(currentPrice) <= 0.125) return "near_par";
  if (currentPrice < previousPrice && currentPrice < 0) return "higher_credit";
  if (currentRate < previousRate) return "lower_rate";
  if (currentRate > previousRate) return "higher_rate";
  return "steady";
}

export function buildRateGuidance(currentOption, previousOption, rotationCounts, totalMoves) {
  const guidanceType = getRateGuidanceType(currentOption, previousOption);
  const options = RATE_GUIDANCE_COPY[guidanceType] || RATE_GUIDANCE_COPY.steady;
  const index = rotationCounts[guidanceType] % options.length;
  const nextCounts = {
    ...rotationCounts,
    [guidanceType]: rotationCounts[guidanceType] + 1,
  };
  const reminder =
    totalMoves > 0 && totalMoves % 4 === 0
      ? ` ${RATE_LOCK_REMINDERS[(totalMoves / 4 - 1) % RATE_LOCK_REMINDERS.length]}`
      : "";

  return {
    message: `${options[index]}${reminder}`,
    nextCounts,
  };
}
