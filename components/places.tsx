"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
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
import { uid } from "./models";

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

export type Place = {
  id: string;
  name: string;
  area: string;
  icon: string;
  done: boolean;
};

const DEFAULTS: Place[] = [
  { id: "ratargul", name: "রাতারগুল", area: "Swamp Forest", icon: "trees", done: false },
  { id: "bholaganj", name: "ভোলাগঞ্জ সাদা পাথর", area: "White Stones", icon: "mountain", done: false },
  { id: "lalakhal", name: "লালা খাল / শাপলা বিল", area: "Lala Khal", icon: "waves", done: false },
  { id: "jaflong", name: "জাফলং", area: "Jaflong", icon: "snow", done: false },
  { id: "agunpahar", name: "আগুন পাহাড়", area: "Agun Pahar", icon: "sunrise", done: false },
  { id: "tamabil", name: "তামাবিল বর্ডার", area: "Tamabil Border", icon: "flag", done: false },
  { id: "mongolia", name: "মঙ্গোলিয়া টি গার্ডেন", area: "Tea Garden", icon: "leaf", done: false },
  { id: "malnicherra", name: "মালনীছড়া চা বাগান", area: "Tea Garden", icon: "sprout", done: false },
  { id: "shahjalal", name: "শাহজালাল (রহ.) মাজার", area: "Mazar", icon: "landmark", done: false },
  { id: "shahporan", name: "শাহ পরান (রহ.) মাজার", area: "Mazar", icon: "landmark", done: false },
];

const KEY = "terra.places.v2";

type PlacesCtx = {
  places: Place[];
  ready: boolean;
  toggle: (id: string) => void;
  add: (name: string, icon: string) => void;
  remove: (id: string) => void;
  resetDone: () => void;
};

const Ctx = createContext<PlacesCtx | null>(null);

export function PlacesProvider({ children }: { children: ReactNode }) {
  const [places, setPlaces] = useState<Place[]>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setPlaces(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(KEY, JSON.stringify(places));
      } catch {
        /* ignore */
      }
    }
  }, [places, ready]);

  const toggle = useCallback(
    (id: string) =>
      setPlaces((ps) =>
        ps.map((p) => (p.id === id ? { ...p, done: !p.done } : p))
      ),
    []
  );
  const add = useCallback(
    (name: string, icon: string) =>
      setPlaces((ps) => [
        ...ps,
        { id: uid(), name: name.trim(), area: "Added", icon, done: false },
      ]),
    []
  );
  const remove = useCallback(
    (id: string) => setPlaces((ps) => ps.filter((p) => p.id !== id)),
    []
  );
  const resetDone = useCallback(
    () => setPlaces((ps) => ps.map((p) => ({ ...p, done: false }))),
    []
  );

  return (
    <Ctx.Provider value={{ places, ready, toggle, add, remove, resetDone }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePlaces(): PlacesCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlaces must be used within PlacesProvider");
  return c;
}
