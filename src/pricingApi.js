const PRICING_ENGINE_API_URL = import.meta.env.VITE_PRICING_ENGINE_API_URL || "";

function getPricingApiBaseUrl() {
  return PRICING_ENGINE_API_URL.replace(/\/$/, "");
}

export function hasPricingApi() {
  return Boolean(getPricingApiBaseUrl());
}

export async function quotePricing(scenario, options = {}) {
  const baseUrl = getPricingApiBaseUrl();

  if (!baseUrl) {
    throw new Error("Pricing engine API URL is not configured.");
  }

  const response = await fetch(`${baseUrl}/pricing/quote`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(scenario),
    signal: options.signal,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Pricing engine request failed: ${response.status} ${body}`);
  }

  return response.json();
}
