/* ============================================================
   Map helpers — distances, road routes, nearby essentials.

   All free OpenStreetMap services, no keys:
     • routes  — OSRM (router.project-osrm.org), car profile
     • nearby  — Overpass API (OSM data: ATMs, pharmacies, …)
   Both are fair-use public servers: one request per user action,
   never in a loop. Results are kept on the device, so the last route
   and the last nearby search still show with no signal.
   ============================================================ */

export type LatLng = [number, number];

const R = 6371; // km

/** Straight-line distance in km. */
export function km(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "850 m", "3.4 km", "27 km" */
export function fmtKm(d: number): string {
  if (d < 1) return `${Math.round(d * 1000 / 10) * 10} m`;
  return d < 10 ? `${d.toFixed(1)} km` : `${Math.round(d)} km`;
}

/** "25 min", "1 h 40 min" */
export function fmtMin(m: number): string {
  const mins = Math.max(1, Math.round(m));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** A public server that's slow must not hang the screen — give up after `ms`. */
async function fetchSoon(url: string, init: RequestInit = {}, ms = 12000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/* ---- small device cache (last N answers) ---- */

function cacheGet<T>(key: string, name: string): T | null {
  try {
    const all = JSON.parse(localStorage.getItem(key) || "{}");
    return all[name] ?? null;
  } catch {
    return null;
  }
}
function cachePut(key: string, name: string, value: unknown, keep = 24) {
  try {
    const all = JSON.parse(localStorage.getItem(key) || "{}");
    delete all[name];
    all[name] = value;
    const names = Object.keys(all);
    names.slice(0, Math.max(0, names.length - keep)).forEach((n) => delete all[n]);
    localStorage.setItem(key, JSON.stringify(all));
  } catch {
    /* quota — just don't cache */
  }
}

/* ---- road routes ---- */

export type RoadRoute = {
  line: LatLng[];
  km: number;
  minutes: number;
  legs: { km: number; minutes: number }[];
  fromCache?: boolean;
};

const ROUTE_KEY = "terra.routes.v1";

/**
 * Driving route through the points in order. Offline (or if the router
 * can't route there) → the last answer for these points, else null.
 */
export async function roadRoute(points: LatLng[]): Promise<RoadRoute | null> {
  if (points.length < 2) return null;
  const name = points.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(";");
  const cached = cacheGet<RoadRoute>(ROUTE_KEY, name);
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return cached ? { ...cached, fromCache: true } : null;
  try {
    const coords = points.map((p) => `${p[1]},${p[0]}`).join(";");
    const res = await fetchSoon(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
    );
    const data = await res.json();
    const r = data?.routes?.[0];
    if (data?.code !== "Ok" || !r) return cached ? { ...cached, fromCache: true } : null;
    const route: RoadRoute = {
      line: (r.geometry?.coordinates ?? []).map((c: [number, number]) => [c[1], c[0]] as LatLng),
      km: r.distance / 1000,
      minutes: r.duration / 60,
      legs: (r.legs ?? []).map((l: any) => ({ km: l.distance / 1000, minutes: l.duration / 60 })),
    };
    cachePut(ROUTE_KEY, name, route, 12);
    return route;
  } catch {
    return cached ? { ...cached, fromCache: true } : null;
  }
}

/* ---- nearby essentials ---- */

export type NearbyKind =
  | "atm"
  | "pharmacy"
  | "hospital"
  | "fuel"
  | "food"
  | "stay"
  | "mosque"
  | "toilet"
  | "police";

export const NEARBY: { id: NearbyKind; label: string; emoji: string; q: string[] }[] = [
  { id: "atm", label: "ATM", emoji: "🏧", q: ['nwr["amenity"="atm"]', 'nwr["amenity"="bank"]'] },
  { id: "pharmacy", label: "Pharmacy", emoji: "💊", q: ['nwr["amenity"="pharmacy"]', 'nwr["shop"="chemist"]'] },
  { id: "hospital", label: "Hospital", emoji: "🏥", q: ['nwr["amenity"~"^(hospital|clinic|doctors)$"]'] },
  { id: "fuel", label: "Fuel", emoji: "⛽", q: ['nwr["amenity"="fuel"]'] },
  { id: "food", label: "Food", emoji: "🍛", q: ['nwr["amenity"~"^(restaurant|fast_food|cafe|food_court)$"]'] },
  { id: "stay", label: "Stay", emoji: "🛏️", q: ['nwr["tourism"~"^(hotel|guest_house|motel|hostel|resort|chalet)$"]'] },
  { id: "mosque", label: "Mosque", emoji: "🕌", q: ['nwr["amenity"="place_of_worship"]["religion"="muslim"]'] },
  { id: "toilet", label: "Toilet", emoji: "🚻", q: ['nwr["amenity"="toilets"]'] },
  { id: "police", label: "Police", emoji: "🚓", q: ['nwr["amenity"="police"]'] },
];

export type Poi = { id: string; kind: NearbyKind; name: string; lat: number; lng: number; km: number };

const NEARBY_KEY = "terra.nearby.v1";

/** The main Overpass server is often overloaded (504) — the same data is
 *  served by these public mirrors, tried in turn. */
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

/**
 * What's around `at` — nearest first. Looks within 3 km, then 10 km if
 * that finds nothing. Offline → the last result for about this spot.
 */
export async function nearby(
  kind: NearbyKind,
  at: LatLng
): Promise<{ list: Poi[]; fromCache: boolean; busy?: boolean } | null> {
  const def = NEARBY.find((n) => n.id === kind)!;
  const name = `${kind}@${at[0].toFixed(2)},${at[1].toFixed(2)}`;
  const cached = cacheGet<Poi[]>(NEARBY_KEY, name);
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return cached ? { list: cached, fromCache: true } : null;

  const ask = async (radius: number): Promise<Poi[]> => {
    const body = `[out:json][timeout:20];(${def.q
      .map((q) => `${q}(around:${radius},${at[0]},${at[1]});`)
      .join("")});out center 60;`;
    let data: any = null;
    for (const url of OVERPASS) {
      try {
        const res = await fetchSoon(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `data=${encodeURIComponent(body)}`,
          },
          8000
        );
        if (!res.ok) continue; // busy / rate-limited → next mirror
        data = await res.json();
        break;
      } catch {
        /* unreachable → next mirror */
      }
    }
    if (!data) throw new Error("busy");
    return (data?.elements ?? [])
      .map((e: any) => {
        const lat = e.lat ?? e.center?.lat;
        const lng = e.lon ?? e.center?.lon;
        if (lat == null || lng == null) return null;
        const t = e.tags ?? {};
        return {
          id: `${e.type}/${e.id}`,
          kind,
          name: String(t.name || t["name:en"] || t["name:bn"] || t.brand || t.operator || def.label),
          lat,
          lng,
          km: km(at, [lat, lng]),
        } as Poi;
      })
      .filter(Boolean)
      .sort((a: Poi, b: Poi) => a.km - b.km)
      .slice(0, 40);
  };

  try {
    let list = await ask(3000);
    if (!list.length) list = await ask(10000);
    cachePut(NEARBY_KEY, name, list, 30);
    return { list, fromCache: false };
  } catch {
    // online but every server busy — say so, rather than "no internet"
    return cached ? { list: cached, fromCache: true } : { list: [], fromCache: false, busy: true };
  }
}

/* ---- links out ---- */

export const directionsUrl = (to: LatLng) =>
  `https://www.google.com/maps/dir/?api=1&destination=${to[0]},${to[1]}`;

export const pointUrl = (at: LatLng) => `https://maps.google.com/?q=${at[0].toFixed(6)},${at[1].toFixed(6)}`;

/** Pin colour per plan day (0 = not on a day). */
const DAY_COLORS = ["#64748b", "#16a34a", "#2563eb", "#ea580c", "#9333ea", "#db2777", "#0891b2", "#ca8a04"];
export const dayColor = (day: number) =>
  day ? DAY_COLORS[((day - 1) % (DAY_COLORS.length - 1)) + 1] : DAY_COLORS[0];
