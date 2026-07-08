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
import { uid, type Place } from "./models";
import { dbConfigured, loadPlaces, placesDb } from "./db";

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

const mk = (
  id: string,
  name: string,
  area: string,
  icon: string,
  ord: number
): Place => ({ id, name, area, icon, ord, done: false });

const DEFAULTS: Place[] = [
  mk("ratargul", "রাতারগুল", "Swamp Forest", "trees", 0),
  mk("bholaganj", "ভোলাগঞ্জ সাদা পাথর", "White Stones", "mountain", 1),
  mk("lalakhal", "লালা খাল / শাপলা বিল", "Lala Khal", "waves", 2),
  mk("jaflong", "জাফলং", "Jaflong", "snow", 3),
  mk("agunpahar", "আগুন পাহাড়", "Agun Pahar", "sunrise", 4),
  mk("tamabil", "তামাবিল বর্ডার", "Tamabil Border", "flag", 5),
  mk("mongolia", "মঙ্গোলিয়া টি গার্ডেন", "Tea Garden", "leaf", 6),
  mk("malnicherra", "মালনীছড়া চা বাগান", "Tea Garden", "sprout", 7),
  mk("shahjalal", "শাহজালাল (রহ.) মাজার", "Mazar", "landmark", 8),
  mk("shahporan", "শাহ পরান (রহ.) মাজার", "Mazar", "landmark", 9),
];

const KEY = "terra.places.v2";
const byOrd = (a: Place, b: Place) => a.ord - b.ord;

function loadCache(): Place[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Place[]) : null;
  } catch {
    return null;
  }
}
function saveCache(list: Place[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
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
  const [places, setPlaces] = useState<Place[]>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const ref = useRef<Place[]>(places);
  ref.current = places;

  // load: cache first (instant), then Supabase (source of truth) + realtime
  useEffect(() => {
    let alive = true;
    const cached = loadCache();
    if (cached && cached.length) setPlaces([...cached].sort(byOrd));

    (async () => {
      if (dbConfigured) {
        const res = await loadPlaces();
        if (alive && res.ok) {
          if (res.places.length === 0) {
            // fresh shared DB → seed the default Sylhet list into the cloud
            placesDb.seed(DEFAULTS);
            setPlaces(DEFAULTS);
          } else {
            setPlaces(res.places.sort(byOrd));
          }
        } else if (alive && !res.ok && !(cached && cached.length)) {
          setPlaces(DEFAULTS); // table missing / offline → local defaults
        }
      } else if (!(cached && cached.length)) {
        setPlaces(DEFAULTS);
      }
      if (alive) setReady(true);
    })();

    if (!dbConfigured) {
      return () => {
        alive = false;
      };
    }

    let inFlight = false;
    let queued = false;
    const refetch = async () => {
      if (inFlight) {
        queued = true;
        return;
      }
      inFlight = true;
      const res = await loadPlaces();
      if (alive && res.ok) setPlaces(res.places.sort(byOrd));
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
  }, []);

  // mirror to cache on every change
  useEffect(() => {
    if (ready) saveCache(places);
  }, [places, ready]);

  const toggle = useCallback((id: string) => {
    const p = ref.current.find((x) => x.id === id);
    if (!p) return;
    const np = { ...p, done: !p.done };
    setPlaces((ps) => ps.map((x) => (x.id === id ? np : x)));
    placesDb.update(np);
  }, []);

  const add = useCallback((name: string, icon: string) => {
    const n = name.trim();
    if (!n) return;
    const maxOrd = ref.current.reduce((m, p) => Math.max(m, p.ord), -1);
    const place: Place = {
      id: uid(),
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
      const p = ref.current.find((x) => x.id === id);
      if (!p) return;
      const np: Place = {
        ...p,
        name:
          patch.name !== undefined ? patch.name.trim() || p.name : p.name,
        area: patch.area !== undefined ? patch.area.trim() : p.area,
      };
      setPlaces((ps) => ps.map((x) => (x.id === id ? np : x)));
      placesDb.update(np);
    },
    []
  );

  const move = useCallback((id: string, dir: -1 | 1) => {
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
    setPlaces((ps) => ps.filter((p) => p.id !== id));
    placesDb.del(id);
  }, []);

  const resetDone = useCallback(() => {
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
