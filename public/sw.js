/* ============================================================
   TerraExplore service worker — offline app shell.

   Only same-origin GETs are touched. Supabase calls deliberately
   fall through to the network so they fail fast when offline and
   the app's outbox queue takes over; tour data lives in the app's
   own offline copies, not here.

   The shell must be complete after the FIRST visit — on a tour there
   may never be a second one with signal. So:
     • install fetches "/" and caches every /_next/static file it names
     • the page then posts the list of everything it actually loaded
       ("warm"), which catches anything the HTML didn't mention

   Bump CACHE when the caching strategy itself changes; hashed
   build assets don't need it.
   ============================================================ */

const CACHE = "terra-shell-v2";
const TILES = "terra-tiles-v1";
const MAX_TILES = 800; // ~15 MB of map around the places you've looked at
const OFFLINE_FALLBACK = "/";
const STATIC_EXTRAS = [
  "/manifest.webmanifest",
  "/pwa-icon.svg",
  "/icon-maskable.svg",
  "/covers/tea.jpg", // built-in tour photo (Sylhet / tea gardens)
];

const sameOrigin = (u) => {
  try {
    return new URL(u, self.location.origin).origin === self.location.origin;
  } catch {
    return false;
  }
};

/** Cache these URLs unless already cached. Never throws. */
async function cacheAll(urls) {
  const cache = await caches.open(CACHE);
  await Promise.all(
    [...new Set(urls)].filter(sameOrigin).map(async (u) => {
      try {
        const href = new URL(u, self.location.origin).href;
        if (await cache.match(href)) return;
        const res = await fetch(href);
        if (res.ok) await cache.put(href, res);
      } catch {
        /* offline or gone — the next visit tries again */
      }
    })
  );
}

async function cacheShell() {
  const cache = await caches.open(CACHE);
  const res = await fetch(OFFLINE_FALLBACK, { cache: "no-store" });
  if (!res.ok) return;
  await cache.put(OFFLINE_FALLBACK, res.clone());
  const html = await res.text();
  const assets = html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [];
  await cacheAll([...assets, ...STATIC_EXTRAS]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    cacheShell()
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE && k !== TILES && k !== "terra-photos-v1")
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// the page lists what it loaded (scripts, styles, fonts) → keep them all
self.addEventListener("message", (event) => {
  const d = event.data;
  if (d && d.type === "warm" && Array.isArray(d.urls)) {
    event.waitUntil(cacheAll(d.urls));
  }
});

/** Map tiles: keep the ones you've looked at, so the map still shows
 *  with no signal. Oldest go first once there are too many. */
async function tile(req) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    const keys = await cache.keys();
    if (keys.length > MAX_TILES) {
      await Promise.all(keys.slice(0, keys.length - MAX_TILES).map((k) => cache.delete(k)));
    }
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.hostname.endsWith("tile.openstreetmap.org") || url.hostname.endsWith("tile.opentopomap.org")) {
    event.respondWith(tile(req));
    return;
  }
  if (url.origin !== self.location.origin) return; // Supabase & co.

  // Page loads: network-first so a redeploy is picked up immediately,
  // cached shell as the offline fallback. `?trip=…` links are the same
  // page, so the query is ignored when falling back.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(CACHE);
            cache.put(OFFLINE_FALLBACK, res.clone());
          }
          return res;
        } catch {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match(req, { ignoreSearch: true })) ||
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
