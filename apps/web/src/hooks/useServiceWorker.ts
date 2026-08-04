"use client";

import { useEffect } from "react";

export function useServiceWorker() {
  useEffect(() => {
    // Skip in dev: service workers aggressively cache JS chunks, which
    // fights with hot-reload and produces confusing stale-code bugs.
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installability/offline support is a progressive enhancement -
      // a failed registration shouldn't affect the rest of the app.
    });
  }, []);
}
