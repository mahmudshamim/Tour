"use client";

import { useEffect } from "react";

/**
 * Registers the offline shell worker, then hands it the list of files
 * this page actually loaded so the very first visit is enough to work
 * offline. Also asks the browser not to evict our storage — the outbox
 * of unsynced expenses lives there. Skipped in dev so hot-reloaded
 * chunks are never cached.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
      return;

    navigator.storage?.persist?.().catch(() => {});

    const warm = async () => {
      const reg = await navigator.serviceWorker.ready;
      // the map's code loads on demand — fetch it now, so pinning a stop
      // by GPS still works on a trip with no signal
      await import("leaflet").catch(() => {});
      const urls = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((u) => u.startsWith(window.location.origin));
      reg.active?.postMessage({ type: "warm", urls: [...urls, "/"] });
    };

    const reg = () =>
      navigator.serviceWorker
        .register("/sw.js")
        .then(warm)
        .catch((e) => {
          console.warn("[sw] registration failed:", e);
        });
    if (document.readyState === "complete") reg();
    else window.addEventListener("load", reg, { once: true });
  }, []);
  return null;
}
