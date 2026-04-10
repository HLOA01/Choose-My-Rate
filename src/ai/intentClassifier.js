function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[$,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyIntent(message) {
  const text = normalizeText(message);

  if (!text) return "empty";

  if (
    text.includes("start over") ||
    text.includes("restart") ||
    text.includes("reset") ||
    text.includes("new scenario") ||
    text.includes("begin again")
  ) {
    return "reset_scenario";
  }

  if (
    text.includes("what can i afford") ||
    text.includes("how much house") ||
    text.includes("how much can i afford") ||
    text.includes("max purchase price") ||
    text.includes("maximum purchase price")
  ) {
    return "affordability";
  }

  if (
    text.includes("change") ||
    text.includes("update") ||
    text.includes("make it") ||
    text.includes("switch") ||
    text.includes("instead") ||
    text.includes("change it to") ||
    text.includes("update it to")
  ) {
    return "update_scenario";
  }

  if (
    text.includes("fha") ||
    text.includes("conventional") ||
    text.includes("conv") ||
    text.includes("va") ||
    text.includes("usda") ||
    text.includes("purchase") ||
    text.includes("buy") ||
    text.includes("buying") ||
    text.includes("house") ||
    text.includes("home") ||
    text.includes("first-time homebuyer") ||
    text.includes("first time homebuyer") ||
    text.includes("first home") ||
    text.includes("refinance") ||
    text.includes("refi") ||
    text.includes("cash out") ||
    text.includes("cash-out") ||
    text.includes("primary") ||
    text.includes("primary residence") ||
    text.includes("live in it") ||
    text.includes("live in the property") ||
    text.includes("living in it") ||
    text.includes("living in the property") ||
    text.includes("going to live in the property") ||
    text.includes("i will live in the property") ||
    text.includes("owner occupied") ||
    text.includes("owner-occupied") ||
    text.includes("investment") ||
    text.includes("investment property") ||
    text.includes("rental") ||
    text.includes("rent it out") ||
    text.includes("second home") ||
    text.includes("vacation home") ||
    text.includes("credit score") ||
    text.includes("income") ||
    text.includes("monthly income") ||
    text.includes("zip code") ||
    text.includes("zipcode") ||
    text.includes("city") ||
    text.includes("area") ||
    /^\$?\d+/.test(text)
  ) {
    return "capture_details";
  }

  return "general_question";
}