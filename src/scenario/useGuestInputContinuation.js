import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { GUEST_INPUT_CHANNEL_NAME, createGuestInputSession } from "./guestInputSnapshot.js";

/**
 * React seam for opt-in, input-only guest continuation. Pass the funnel's `scenario` state.
 *
 * - Persistence is OFF until the borrower opts in (optIn). Before that this hook performs one read that cannot
 *   create a database; no transaction, no write, no delete.
 * - It imports no pricing, Sally, identity, event or outbox code, so none of them can be called from here.
 * - Autosave is suspended while an offer is undecided, after a cross-tab conflict, while unreadable data is
 *   present, and after the borrower stops remembering. Each of those states is visible in `view`.
 * - accept() re-reads the record, writes nothing, and resolves with one complete validated input set or nothing.
 * - Every write/delete is one IndexedDB readwrite transaction (see the store). If IndexedDB is unavailable,
 *   `view.available` is false and nothing is ever stored.
 * - Cross-tab hints use BroadcastChannel where it exists. They are only hints: if they never arrive, the next
 *   write still detects the change inside its transaction and reports a conflict.
 * - StrictMode safe: the session constructor performs no I/O; the effect cleanup suspends the session (cancels
 *   timers, bumps the reset generation, discards late reads) and the second mount reloads.
 * - Flushing on visibilitychange/pagehide is best effort: an IndexedDB transaction is asynchronous, so an edit
 *   made in the last debounce interval before a hard navigation may not be saved. Writes are never partial.
 */
export function useGuestInputContinuation(scenario) {
  const [session] = useState(() => createGuestInputSession());
  const view = useSyncExternalStore(session.subscribe, session.getView);

  useEffect(() => {
    void session.load();
    let channel = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(GUEST_INPUT_CHANNEL_NAME);
        channel.onmessage = () => {
          void session.observe();
        };
      }
    } catch {
      channel = null;
    }
    session.setNotifier(() => channel?.postMessage("changed"));
    const onPageShow = (event) => {
      if (event.persisted) void session.observe(); // bfcache restore: storage may have changed while frozen
    };
    const onLeave = () => {
      void session.flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void session.flush();
    };
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      channel?.close();
      session.setNotifier(undefined);
      session.suspend();
    };
  }, [session]);

  const writable = view.writable;
  useEffect(() => {
    session.scheduleSave(scenario);
  }, [session, scenario, writable]);

  const optIn = useCallback(() => session.enable(scenario), [session, scenario]);
  const accept = useCallback(() => session.accept(), [session]);
  const forget = useCallback(() => session.forget(), [session]);
  const resetInputs = useCallback(() => session.resetInputs(), [session]);
  const clearUnreadable = useCallback(() => session.clearUnrecognized(), [session]);
  const retryDelete = useCallback(() => session.retryDelete(), [session]);

  return { view, optIn, accept, forget, resetInputs, clearUnreadable, retryDelete };
}
