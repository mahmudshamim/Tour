"use client";

import { useEffect } from "react";

/**
 * Registers the offline shell worker. Skipped in dev so hot-reloaded
 * chunks are never cached.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
      return;
    const reg = () =>
      navigator.serviceWorker.register("/sw.js").catch((e) => {
        console.warn("[sw] registration failed:", e);
      });
    if (document.readyState === "complete") reg();
    else window.addEventListener("load", reg, { once: true });
  }, []);
  return null;
}
