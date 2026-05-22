"use client";

import { create } from "zustand";
import type { OnlineStatus } from "./types";

interface OnlineStatusState extends OnlineStatus {
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setQueueDepth: (depth: number) => void;
  bumpQueueDepth: (delta: number) => void;
  markSyncedNow: () => void;
}

export const useOnlineStatus = create<OnlineStatusState>((set) => ({
  online: typeof navigator !== "undefined" ? navigator.onLine : true,
  queueDepth: 0,
  syncing: false,
  lastSyncedAt: null,
  setOnline: (online) => set({ online }),
  setSyncing: (syncing) => set({ syncing }),
  setQueueDepth: (queueDepth) => set({ queueDepth }),
  bumpQueueDepth: (delta) =>
    set((s) => ({ queueDepth: Math.max(0, s.queueDepth + delta) })),
  markSyncedNow: () => set({ lastSyncedAt: Date.now() }),
}));

let subscribed = false;

/** Attach window online/offline listeners. Idempotent. */
export function subscribeOnlineEvents(): () => void {
  if (subscribed || typeof window === "undefined") return () => undefined;
  subscribed = true;
  const onOnline = () => useOnlineStatus.getState().setOnline(true);
  const onOffline = () => useOnlineStatus.getState().setOnline(false);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    subscribed = false;
  };
}
