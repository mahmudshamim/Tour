"use client";

import { useState } from "react";
import { Search, LocateFixed, MapPin, Trash2 } from "lucide-react";
import { usePlaces } from "../places";
import { useStore } from "../store";
import { useUI } from "../ui";
import RealMap from "../RealMap";

type Hit = { name: string; where: string; lat: number; lng: number };

/**
 * Put a plan stop on the map: search a name, tap the map, or use the
 * phone's position ("I'm here") — GPS works with no signal, so a spot
 * can be pinned on the hill and the map fills in later.
 */
export default function PlaceLocationSheet({ placeId }: { placeId: string }) {
  const { places, update } = usePlaces();
  const { trip } = useStore();
  const { close, toast } = useUI();
  const place = places.find((p) => p.id === placeId);

  const [pick, setPick] = useState<[number, number] | null>(
    place && place.lat != null && place.lng != null ? [place.lat, place.lng] : null
  );
  const [q, setQ] = useState(
    place ? [place.name, trip?.destination].filter(Boolean).join(", ") : ""
  );
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState<"" | "search" | "gps">("");
  const [msg, setMsg] = useState("");

  if (!place) return null;

  // a spot to look at before anything is picked: another pinned stop
  const other = places.find((p) => p.id !== placeId && p.lat != null && p.lng != null);
  const center: [number, number] | null = pick ?? (other ? [other.lat!, other.lng!] : null);

  // OpenStreetMap's free search — one request per tap, never as-you-type
  const search = async () => {
    if (!q.trim()) return;
    setBusy("search");
    setMsg("");
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=en,bn&q=${encodeURIComponent(q.trim())}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const rows: any[] = await res.json();
      const list = rows.map((r) => ({
        name: String(r.name || r.display_name || "").split(",")[0],
        where: String(r.display_name || ""),
        lat: Number(r.lat),
        lng: Number(r.lon),
      }));
      setHits(list);
      if (!list.length) setMsg("Nothing found — try a shorter name, or tap the map.");
      else setPick([list[0].lat, list[0].lng]);
    } catch {
      setMsg("Search needs internet. You can still tap the map or use “I'm here”.");
    } finally {
      setBusy("");
    }
  };

  const here = () => {
    if (!navigator.geolocation) return setMsg("This phone can't share its location.");
    setBusy("gps");
    setMsg("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPick([pos.coords.latitude, pos.coords.longitude]);
        setBusy("");
      },
      () => {
        setMsg("Couldn't get your location — allow location access and try again.");
        setBusy("");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
    );
  };

  const save = () => {
    if (!pick) return;
    update(placeId, { lat: +pick[0].toFixed(6), lng: +pick[1].toFixed(6) });
    toast(`📍 ${place.name} is on the map`);
    close();
  };

  return (
    <div className="sheet-overlay" onClick={close}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h2>
          <MapPin size={18} /> {place.name}
        </h2>

        <div className="loc-search">
          <div className="input compact flex1">
            <Search size={16} />
            <input
              value={q}
              placeholder="Search a place"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
          </div>
          <button className="loc-btn" onClick={search} disabled={busy === "search"}>
            {busy === "search" ? "…" : "Search"}
          </button>
        </div>

        {hits.length > 1 && (
          <div className="loc-hits">
            {hits.map((h, i) => (
              <button
                key={`${h.lat},${h.lng},${i}`}
                className={pick && pick[0] === h.lat && pick[1] === h.lng ? "on" : ""}
                onClick={() => setPick([h.lat, h.lng])}
              >
                <b>{h.name}</b>
                <small>{h.where}</small>
              </button>
            ))}
          </div>
        )}

        <RealMap
          className="loc-map"
          pins={[]}
          route={false}
          pick={pick}
          center={center}
          onPick={(lat, lng) => setPick([lat, lng])}
        />
        <div className="loc-hint">
          {msg ||
            (pick
              ? `${pick[0].toFixed(5)}, ${pick[1].toFixed(5)} — drag the pin to adjust`
              : "Tap the map where it is, search above, or use your location")}
        </div>

        <div className="btn-row">
          <button className="btn-ghost neutral" onClick={here} disabled={busy === "gps"}>
            <LocateFixed size={17} /> {busy === "gps" ? "Finding…" : "I'm here"}
          </button>
          <button
            className="btn-primary flex1"
            onClick={save}
            disabled={!pick}
            style={{ opacity: pick ? 1 : 0.5 }}
          >
            Save location
          </button>
        </div>
        {place.lat != null && (
          <button
            className="row-btn danger loc-remove"
            onClick={() => {
              update(placeId, { lat: null, lng: null });
              close();
            }}
          >
            <Trash2 size={16} /> Remove from the map
          </button>
        )}
      </div>
    </div>
  );
}
