/**
 * useHloaSession — the single seam the borrower funnel uses to obtain canonical
 * HLOA identity and emit funnel events. PASS 3.
 *
 * Contract:
 *  - `ensureIdentity({ kind, ...attribution })` is idempotent and non-blocking
 *    from the funnel's point of view. It reuses persisted ids; concurrent calls
 *    share one in-flight request. It NEVER throws. On platform failure it sets
 *    `degraded` and returns `{ ok: false }` — the caller proceeds regardless.
 *  - `emit(eventType, payload)` is fire-and-forget. If no lead exists yet it is
 *    a no-op (a later event will carry the ids).
 *  - When VITE_HLOA_LEAD_ENGINE_URL is unset, everything is inert.
 */

import { useCallback, useRef, useState } from "react";
import {
  createLead,
  emitFunnelEvent,
  hloaConfig,
  linkScenario,
  readUrlAttribution,
} from "./hloaPlatform";
import { readPlatformIdentity, writePlatformIdentity } from "./platformIdentity";

export function useHloaSession() {
  const [identity, setIdentity] = useState(() => readPlatformIdentity());
  const [degraded, setDegraded] = useState(() => identity.syncState === "degraded");
  const inflight = useRef(null);

  const ensureIdentity = useCallback(
    async ({ kind } = {}) => {
      if (!hloaConfig().enabled) return { ok: true, disabled: true };

      const current = readPlatformIdentity();
      if (current.leadId && current.borrowerId && current.scenarioId) {
        setIdentity(current);
        setDegraded(false);
        return { ok: true, ...current };
      }
      if (inflight.current) return inflight.current;

      inflight.current = (async () => {
        const attribution = readUrlAttribution();
        const state = { ...current };

        if (!state.leadId) {
          const lead = await createLead({ sessionKey: state.sessionKey, ...attribution });
          if (!lead.ok || !lead.leadId) {
            setDegraded(true);
            writePlatformIdentity({ syncState: "degraded" });
            return { ok: false, reason: lead.error || "lead_failed" };
          }
          state.leadId = lead.leadId;
          writePlatformIdentity({ leadId: state.leadId, syncState: "degraded" });
        }

        if (!state.borrowerId || !state.scenarioId) {
          const linked = await linkScenario({ leadId: state.leadId, kind: kind || "purchase" });
          if (!linked.ok || !linked.borrowerId || !linked.scenarioId) {
            setDegraded(true);
            writePlatformIdentity({ leadId: state.leadId, syncState: "degraded" });
            return { ok: false, leadId: state.leadId, reason: linked.error || "link_failed" };
          }
          state.borrowerId = linked.borrowerId;
          state.scenarioId = linked.scenarioId;
        }

        writePlatformIdentity({
          leadId: state.leadId,
          borrowerId: state.borrowerId,
          scenarioId: state.scenarioId,
          syncState: "ok",
        });
        setIdentity({ ...state, syncState: "ok" });
        setDegraded(false);
        return { ok: true, ...state };
      })().finally(() => {
        inflight.current = null;
      });

      return inflight.current;
    },
    [],
  );

  const emit = useCallback((eventType, payload) => {
    if (!hloaConfig().enabled) return;
    const current = readPlatformIdentity();
    if (!current.leadId) return;
    emitFunnelEvent({
      leadId: current.leadId,
      eventType,
      payload: payload || {},
      correlationId: current.sessionKey,
    }).catch(() => {});
  }, []);

  return { identity, degraded, ensureIdentity, emit };
}
