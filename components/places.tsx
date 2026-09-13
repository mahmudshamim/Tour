"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import {
  MapPin,
  Trees,
  Mountain,
  MountainSnow,
  Waves,
  Sunrise,
  Flag,
  Leaf,
  Sprout,
  Landmark,
  Tent,
  Camera,
  type LucideIcon,
} from "lucide-react";
import { uid, placesCacheKey, type Place } from "./models";
import { dbConfigured, loadPlaces, placesDb } from "./db";
import { useStore } from "./store";
import * as outbox from "./outbox";

export type { Place } from "./models";

export const ICONS: Record<string, LucideIcon> = {
  pin: MapPin,
  trees: Trees,
  mountain: Mountain,
  snow: MountainSnow,
  waves: Waves,
  sunrise: Sunrise,
  flag: Flag,
  leaf: Leaf,
  sprout: Sprout,
  landmark: Landmark,
  tent: Tent,
  camera: Camera,
};

export const PICKER = [
  "pin",
  "mountain",
  "waves",
  "trees",
  "leaf",
  "landmark",
  "sunrise",
  "camera",
  "tent",
  "flag",
];

const byOrd = (a: Place, b: Place) => a.ord - b.ord;

function loadCache(tripId: string): Place[] | null {
  try {
    const raw = localStorage.getItem(placesCacheKey(tripId));
    return raw ? (JSON.parse(raw) as Place[]) : null;
  } catch {
    return null;
  }
}
function saveCache(tripId: string, list: Place[]) {
  try {
    localStorage.setItem(placesCacheKey(tripId), JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

type PlacesCtx = {
  places: Place[];
  ready: boolean;
  toggle: (id: string) => void;
  add: (name: string, icon: string) => void;
  update: (id: string, patch: Partial<Pick<Place, "name" | "area">>) => void;
  move: (id: string, dir: -1 | 1) => void;
  remove: (id: string) => void;
  resetDone: () => void;
};

const Ctx = createContext<PlacesCtx | null>(null);

export function PlacesProvider({ children }: { children: ReactNode }) {
  const { state, readOnly } = useStore();
  const tripId = state.tripId;

  const [places, setPlaces] = useState<Place[]>([]);
  const [ready, setReady] = useState(false);
  const ref = useRef<Place[]>(places);
  ref.current = places;

  const tripRef = useRef(tripId);
  tripRef.current = tripId;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  /** which trip `places` has finished loading for ("" while switching) */
  const loadedRef = useRef("");

  // load: cache first (instant), then Supabase (source of truth) + realtime
  useEffect(() => {
    if (!tripId) {
      setPlaces([]);
      return;
    }
    let alive = true;
    loadedRef.current = "";
    const cached = loadCache(tripId);
    setPlaces(cached && cached.length ? [...cached].sort(byOrd) : []);
    setReady(false);

    // Every tour starts with an empty plan — nothing is seeded, since
    // a viewer's device must never write, and each tour is its own place.
    (async () => {
      if (dbConfigured) {
        const res = await loadPlaces(tripId);
        if (alive && res.ok) setPlaces(outbox.applyPlaces(res.places, tripId));
      }
      if (!alive) return;
      loadedRef.current = tripId;
      setReady(true);
    })();

    if (!dbConfigured) {
      return () => {
        alive = false;
      };
    }

    // The store owns flushing the outbox; here we only pull and replay
    // whatever is still queued on top of the snapshot, so a checklist
    // tick made offline isn't undone by the next poll.
    let inFlight = false;
    let queued = false;
    const refetch = async () => {
      if (inFlight) {
        queued = true;
        return;
      }
      inFlight = true;
      const v0 = outbox.version();
      const res = await loadPlaces(tripId);
      if (alive && res.ok) {
        // queue moved while we were fetching → snapshot is stale, redo
        if (outbox.version() !== v0) queued = true;
        else setPlaces(outbox.applyPlaces(res.places, tripId));
      }
      inFlight = false;
      if (queued && alive) {
        queued = false;
        refetch();
      }
    };

    const unsub = placesDb.onChange(() => refetch());

    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    const onFocus = () => refetch();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") refetch();
    }, 15000);

    return () => {
      alive = false;
      unsub();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // mirror to cache on every change — but only once this trip has loaded:
  // right after a switch, `places` still holds the previous trip's list
  useEffect(() => {
    if (ready && tripId && loadedRef.current === tripId) saveCache(tripId, places);
  }, [places, ready, tripId]);

  /** Locked devices and archived trips can't change the plan. */
  const guard = () => !readOnlyRef.current && Boolean(tripRef.current);

  const toggle = useCallback((id: string) => {
    if (!guard()) return;
    const p = ref.current.find((x) => x.id === id);
    if (!p) return;
    const np = { ...p, done: !p.done };
    setPlaces((ps) => ps.map((x) => (x.id === id ? np : x)));
    placesDb.update(np);
  }, []);

  const add = useCallback((name: string, icon: string) => {
    if (!guard()) return;
    const n = name.trim();
    if (!n) return;
    const maxOrd = ref.current.reduce((m, p) => Math.max(m, p.ord), -1);
    const place: Place = {
      id: uid(),
      tripId: tripRef.current,
      name: n,
      area: "Added",
      icon,
      done: false,
      ord: maxOrd + 1,
    };
    setPlaces((ps) => [...ps, place]);
    placesDb.insert(place);
  }, []);

  const update = useCallback(
    (id: string, patch: Partial<Pick<Place, "name" | "area">>) => {
      if (!guard()) return;
      const p = ref.current.find((x) => x.id === id);
      if (!p) return;
      const np: Place = {
        ...p,
        name: patch.name !== undefined ? patch.name.trim() || p.name : p.name,
        area: patch.area !== undefined ? patch.area.trim() : p.area,
      };
      setPlaces((ps) => ps.map((x) => (x.id === id ? np : x)));
      placesDb.update(np);
    },
    []
  );

  const move = useCallback((id: string, dir: -1 | 1) => {
    if (!guard()) return;
    const list = [...ref.current].sort(byOrd);
    const i = list.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const a = list[i];
    const b = list[j];
    const na = { ...a, ord: b.ord };
    const nb = { ...b, ord: a.ord };
    setPlaces((ps) =>
      ps.map((p) => (p.id === a.id ? na : p.id === b.id ? nb : p)).sort(byOrd)
    );
    placesDb.update(na);
    placesDb.update(nb);
  }, []);

  const remove = useCallback((id: string) => {
    if (!guard()) return;
    setPlaces((ps) => ps.filter((p) => p.id !== id));
    placesDb.del(id, tripRef.current);
  }, []);

  const resetDone = useCallback(() => {
    if (!guard()) return;
    const next = ref.current.map((p) => ({ ...p, done: false }));
    setPlaces(next);
    next.forEach((p) => placesDb.update(p));
  }, []);

  return (
    <Ctx.Provider
      value={{ places, ready, toggle, add, update, move, remove, resetDone }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePlaces(): PlacesCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlaces must be used within PlacesProvider");
  return c;
}
