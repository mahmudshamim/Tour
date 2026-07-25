/* ============================================================
   TerraExplore service worker — offline app shell.

   Only same-origin GETs are touched. Supabase calls deliberately
   fall through to the network so they fail fast when offline and
   the app's outbox queue takes over.

   Bump CACHE when the caching strategy itself changes; hashed
   build assets don't need it.
   ============================================================ */

const CACHE = "terra-shell-v1";
const OFFLINE_FALLBACK = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add(OFFLINE_FALLBACK))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase & co.

  // Page loads: network-first so a redeploy is picked up immediately,
  // cached shell as the offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(OFFLINE_FALLBACK, res.clone());
          return res;
        } catch {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match(req)) ||
            (await cache.match(OFFLINE_FALLBACK)) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);

      // /_next/static is content-hashed and immutable → serve from cache
      if (hit && url.pathname.startsWith("/_next/static/")) return hit;

      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
        return res;
      } catch (e) {
        if (hit) return hit;
        throw e;
      }
    })()
  );
});
