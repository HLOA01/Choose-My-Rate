/**
 * Thin browser client for the HLOA platform (Lead Engine only). PASS 3.
 *
 * Choose My Rate talks to Lead Engine — never to Core directly — and Lead Engine
 * issues/brokers every canonical id. Choose My Rate never mints a canonical id.
 *
 * Every call here is best-effort: a short timeout, errors are caught and
 * returned as `{ ok: false }`. Nothing in this module ever throws into the
 * borrower funnel, and nothing here can change a mortgage scenario or a rate.
 *
 * Enable by setting VITE_HLOA_LEAD_ENGINE_URL. When it is empty the whole
 * integration is inert and Choose My Rate behaves exactly as before.
 */

const LEAD_ENGINE_URL = (import.meta.env?.VITE_HLOA_LEAD_ENGINE_URL || "").replace(/\/$/, "");
const PROVIDER = "choose_my_rate";
const ACTOR_ID = import.meta.env?.VITE_HLOA_ACTOR_ID || "svc:choose-my-rate";
const REQUEST_TIMEOUT_MS = 4000;

export function hloaConfig() {
  return { baseUrl: LEAD_ENGINE_URL, provider: PROVIDER, enabled: Boolean(LEAD_ENGINE_URL) };
}

function authHeaders(extra = {}) {
  return {
    "content-type": "application/json",
    "x-hloa-actor-type": "external_integration",
    "x-hloa-actor-id": ACTOR_ID,
    "x-hloa-actor-scopes": `provider:${PROVIDER}`,
    ...extra,
  };
}

async function call(method, path, { body, headers } = {}) {
  if (!LEAD_ENGINE_URL) return { ok: false, disabled: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${LEAD_ENGINE_URL}${path}`, {
      method,
      headers: authHeaders(headers),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    if (!response.ok) {
      return { ok: false, status: response.status, error: json?.error?.code || `http_${response.status}` };
    }
    return { ok: true, status: response.status, json };
  } catch (error) {
    return { ok: false, error: error?.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Minimal, PII-safe payload for scenario/rate events. Only non-sensitive
 * classification metadata — deliberately NO dollar amounts, credit score,
 * income, taxes, insurance, balances, or contact data.
 */
export function buildFunnelEventPayload(pricingPayload = {}) {
  const zipPrefix = String(pricingPayload.zipCode || "").replace(/\D/g, "").slice(0, 3);
  const payload = {};
  if (pricingPayload.loanPurpose) payload.loanPurpose = String(pricingPayload.loanPurpose);
  if (pricingPayload.occupancy) payload.occupancy = String(pricingPayload.occupancy);
  if (pricingPayload.loanTypePreference) payload.loanType = String(pricingPayload.loanTypePreference);
  if (pricingPayload.propertyType) payload.propertyType = String(pricingPayload.propertyType);
  if (zipPrefix) payload.zipPrefix = zipPrefix;
  return payload;
}

export function mapScenarioKind(scenario = {}) {
  if (scenario.borrowerPath === "purchase") return "purchase";
  if (scenario.refinanceGoal === "cash_out") return "cash_out";
  return "refinance";
}

/**
 * Read attribution parameters already present in the page URL. All optional.
 *
 * `ref` carries an opaque Agent Portal referral token, never a canonical
 * Agent id. A canonical id (`CMR-AGT-…`) is public — it appears in every
 * agent's own shared referral link, in Core lookups, on every lead/event
 * response — and permanent, so accepting one directly from an anonymous
 * borrower's URL would let a borrower attribute their own lead to ANY other
 * agent simply by substituting a different (equally public) id. The token is
 * opaque and resolved server-side by Lead Engine (against Agent Portal's
 * published API) precisely so it proves nothing on its own and can be
 * rotated/disabled independent of the agent's permanent identity. Choose My
 * Rate never resolves it and never sees a canonical Agent id here.
 */
export function readUrlAttribution(search = (typeof window !== "undefined" ? window.location.search : "")) {
  const params = new URLSearchParams(search || "");
  const attribution = {};
  const campaign = params.get("utm_campaign");
  const sourceDetail = params.get("utm_source") || params.get("utm_content");
  const referralToken = params.get("ref");
  if (campaign) attribution.campaign = campaign.slice(0, 120);
  if (sourceDetail) attribution.sourceDetail = sourceDetail.slice(0, 240);
  if (referralToken && /^[a-z0-9]{1,64}$/.test(referralToken)) attribution.referralToken = referralToken;
  return attribution;
}

/** POST /leads — obtain a canonical Lead id. `sessionKey` gives natural-key + Idempotency-Key dedupe. */
export async function createLead({ sessionKey, campaign, sourceDetail, referralToken }) {
  const body = { source: "choose_my_rate", externalProvider: PROVIDER, externalLeadId: sessionKey };
  if (campaign) body.campaign = campaign;
  if (sourceDetail) body.sourceDetail = sourceDetail;
  if (referralToken) body.referralToken = referralToken;
  const res = await call("POST", "/leads", { body, headers: { "idempotency-key": `cmr-lead:${sessionKey}` } });
  return res.ok ? { ok: true, leadId: res.json?.lead?.leadId } : res;
}

/** POST /leads/:id/link-scenario — obtain canonical Borrower + Scenario ids. Idempotent. */
export async function linkScenario({ leadId, kind }) {
  const res = await call("POST", `/leads/${encodeURIComponent(leadId)}/link-scenario`, {
    body: { kind },
    headers: { "idempotency-key": `cmr-scn:${leadId}` },
  });
  return res.ok ? { ok: true, borrowerId: res.json?.borrowerId, scenarioId: res.json?.scenarioId } : res;
}

/** POST /leads/:id/emit — forward a funnel event to Core, correlated to canonical ids. Fire-and-forget. */
export async function emitFunnelEvent({ leadId, eventType, payload, correlationId }) {
  const body = { eventType };
  if (payload && Object.keys(payload).length) body.payload = payload;
  if (correlationId) body.correlationId = correlationId;
  const res = await call("POST", `/leads/${encodeURIComponent(leadId)}/emit`, { body });
  return res.ok ? { ok: true, emitted: Boolean(res.json?.emitted) } : res;
}
