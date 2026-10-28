"use client";

import { useCallback, useSyncExternalStore } from "react";

const CHANGE_EVENT = "quantlab:storage";

export function notifyStorageChange(key: string): void {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
}

/** String snapshots are stable and safe to hydrate; parsing stays with the caller. */
export function useStorageValue(key: string): string | null {
  const subscribe = useCallback((changed: () => void) => {
    const onStorage = (event: StorageEvent) => { if (!event.key || event.key === key) changed(); };
    const onLocal = (event: Event) => { if ((event as CustomEvent<string>).detail === key) changed(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onLocal);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(CHANGE_EVENT, onLocal); };
  }, [key]);
  const snapshot = useCallback(() => { try { return localStorage.getItem(key); } catch { return null; } }, [key]);
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
