"use client";

// A real, zoomable map (OpenStreetMap tiles via Leaflet). Leaflet touches
// `window` when it loads, so it's imported inside an effect — never on
// the server. Tiles need signal; ones already seen are kept by the
// service worker, so a map opened at home still shows on the hill.

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { NEARBY, type LatLng, type Poi } from "./geo";

export type Pin = {
  id: string;
  lat: number;
  lng: number;
  label: string; // plain text — never HTML
  n: number;
  done?: boolean;
  color?: string;
};

export type MapLayer = "osm" | "topo";

const TILES: Record<MapLayer, { url: string; max: number; attribution: string; sub?: string }> = {
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    max: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  },
  topo: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    max: 17,
    sub: "abc",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, SRTM · <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)',
  },
};

const BANGLADESH: LatLng = [23.8, 90.4];
const EMOJI = Object.fromEntries(NEARBY.map((n) => [n.id, n.emoji]));

export default function RealMap({
  pins,
  route = true,
  line,
  pois,
  pick,
  onPick,
  me,
  meAccuracy,
  center,
  focus,
  layer = "osm",
  onPinTap,
  onPoiTap,
  onBlankTap,
  onCenter,
  zoomButtons = true,
  className = "",
}: {
  pins: Pin[];
  /** dashed straight line through the pins (when there's no road line) */
  route?: boolean;
  /** the road route, drawn solid */
  line?: LatLng[] | null;
  /** nearby essentials */
  pois?: Poi[];
  /** picker mode: the chosen spot (draggable) */
  pick?: LatLng | null;
  /** picker mode: tap / drag chooses a spot */
  onPick?: (lat: number, lng: number) => void;
  /** where the phone is, and how sure it is (metres) */
  me?: LatLng | null;
  meAccuracy?: number;
  /** where to look when there's nothing to fit */
  center?: LatLng | null;
  /** pan here (e.g. a stop picked from the list) */
  focus?: LatLng | null;
  layer?: MapLayer;
  onPinTap?: (id: string) => void;
  onPoiTap?: (poi: Poi) => void;
  onBlankTap?: () => void;
  /** where the map is looking, after each move */
  onCenter?: (at: LatLng) => void;
  /** Leaflet's +/− (off where our own controls sit) */
  zoomButtons?: boolean;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const tiles = useRef<Leaflet.TileLayer | null>(null);
  const pinLayer = useRef<Leaflet.LayerGroup | null>(null);
  const poiLayer = useRef<Leaflet.LayerGroup | null>(null);
  const pickMarker = useRef<Leaflet.Marker | null>(null);
  const meLayer = useRef<Leaflet.LayerGroup | null>(null);
  const cb = useRef({ onPick, onPinTap, onPoiTap, onBlankTap, onCenter });
  cb.current = { onPick, onPinTap, onPoiTap, onBlankTap, onCenter };
  const drawn = useRef(""); // what the pins layer currently shows
  const drawnPois = useRef("");
  const fitted = useRef(""); // which set of places the view was fitted to
  const firstFix = useRef(true);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let settle = 0;
    import("leaflet")
      .then((mod) => {
        if (!alive || !el.current) return;
        const lf = ((mod as any).default ?? mod) as typeof Leaflet;
        L.current = lf;
        const m = lf.map(el.current, { zoomControl: false });
        if (zoomButtons) lf.control.zoom({ position: "bottomright" }).addTo(m);
        m.setView(center ?? BANGLADESH, center ? 13 : 7);
        m.on("click", (e: Leaflet.LeafletMouseEvent) => {
          cb.current.onPick?.(e.latlng.lat, e.latlng.lng);
          cb.current.onBlankTap?.();
        });
        m.on("moveend", () => {
          const c = m.getCenter();
          cb.current.onCenter?.([c.lat, c.lng]);
        });
        pinLayer.current = lf.layerGroup().addTo(m);
        poiLayer.current = lf.layerGroup().addTo(m);
        meLayer.current = lf.layerGroup().addTo(m);
        map.current = m;
        // the sheet / screen may still be animating in
        settle = window.setTimeout(() => alive && m.invalidateSize(), 320);
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      alive = false;
      window.clearTimeout(settle);
      // stop any pan/zoom still animating, or Leaflet trips over itself
      map.current?.stop();
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // base layer: street map or terrain
  useEffect(() => {
    const lf = L.current;
    const m = map.current;
    if (!ready || !lf || !m) return;
    tiles.current?.remove();
    const t = TILES[layer];
    tiles.current = lf
      .tileLayer(t.url, {
        maxZoom: t.max,
        subdomains: t.sub ?? "abc",
        crossOrigin: "anonymous", // so the service worker can keep tiles for offline
        attribution: t.attribution,
      })
      .addTo(m);
    tiles.current.bringToBack();
    if (m.getZoom() > t.max) m.setZoom(t.max);
  }, [ready, layer]);

  // numbered pins + the route between them
  useEffect(() => {
    const lf = L.current;
    const m = map.current;
    if (!ready || !lf || !m || !pinLayer.current) return;
    // the plan refreshes every few seconds with a fresh (but equal) list —
    // redrawing would reset things, refitting would undo your zoom
    const key = JSON.stringify([route, pins, line?.length ?? 0, line?.[0], line?.[line.length - 1]]);
    if (key === drawn.current) return;
    drawn.current = key;
    pinLayer.current.clearLayers();
    if (line && line.length > 1) {
      lf.polyline(line, { color: "#ffffff", weight: 8, opacity: 0.8 }).addTo(pinLayer.current);
      lf.polyline(line, { color: "#16a34a", weight: 5, opacity: 0.95 }).addTo(pinLayer.current);
    } else if (route && pins.length > 1) {
      lf.polyline(
        pins.map((p) => [p.lat, p.lng] as LatLng),
        { color: "#16a34a", weight: 4, opacity: 0.75, dashArray: "8 8" }
      ).addTo(pinLayer.current);
    }
    pins.forEach((p) => {
      const color = /^#[0-9a-f]{3,8}$/i.test(p.color ?? "") ? p.color : "#16a34a";
      const mk = lf
        .marker([p.lat, p.lng], {
          icon: lf.divIcon({
            className: `rm-pin ${p.done ? "done" : ""}`,
            html: `<span style="background:${p.done ? "#9ca3af" : color}"><b>${
              p.done ? "✓" : Number(p.n) || ""
            }</b></span>`,
            iconSize: [30, 30],
            iconAnchor: [15, 30],
          }),
          keyboard: false,
          title: p.label, // an attribute, not HTML
        })
        .addTo(pinLayer.current!);
      mk.on("click", (e) => {
        lf.DomEvent.stopPropagation(e);
        cb.current.onPinTap?.(p.id);
      });
    });
    const where = pins.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|");
    if (!cb.current.onPick && pins.length && where !== fitted.current) {
      fitted.current = where;
      m.fitBounds(lf.latLngBounds(pins.map((p) => [p.lat, p.lng] as LatLng)), {
        padding: [40, 40],
        maxZoom: 15,
        animate: false,
      });
    }
  }, [ready, pins, route, line]);

  // nearby essentials
  useEffect(() => {
    const lf = L.current;
    const m = map.current;
    if (!ready || !lf || !m || !poiLayer.current) return;
    const key = JSON.stringify((pois ?? []).map((p) => p.id));
    if (key === drawnPois.current) return;
    drawnPois.current = key;
    poiLayer.current.clearLayers();
    (pois ?? []).forEach((p) => {
      const mk = lf
        .marker([p.lat, p.lng], {
          icon: lf.divIcon({
            className: "rm-poi",
            html: `<span>${EMOJI[p.kind] ?? "📍"}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
          keyboard: false,
          title: p.name,
        })
        .addTo(poiLayer.current!);
      mk.on("click", (e) => {
        lf.DomEvent.stopPropagation(e);
        cb.current.onPoiTap?.(p);
      });
    });
    if (pois && pois.length) {
      const pts = pois.slice(0, 6).map((p) => [p.lat, p.lng] as LatLng);
      m.fitBounds(lf.latLngBounds(me ? [...pts, me] : pts), {
        padding: [40, 40],
        maxZoom: 16,
        animate: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pois]);

  // picker: one draggable pin
  useEffect(() => {
    const lf = L.current;
    const m = map.current;
    if (!ready || !lf || !m) return;
    if (!pick) {
      pickMarker.current?.remove();
      pickMarker.current = null;
      return;
    }
    if (!pickMarker.current) {
      pickMarker.current = lf
        .marker(pick, {
          draggable: true,
          icon: lf.divIcon({ className: "rm-pin pick", html: "<span></span>", iconSize: [30, 30], iconAnchor: [15, 30] }),
        })
        .on("dragend", (e) => {
          const ll = (e.target as Leaflet.Marker).getLatLng();
          cb.current.onPick?.(ll.lat, ll.lng);
        })
        .addTo(m);
    } else {
      pickMarker.current.setLatLng(pick);
    }
    m.setView(pick, Math.max(m.getZoom(), 15), { animate: false });
  }, [ready, pick]);

  // the phone's own position (+ how sure it is)
  useEffect(() => {
    const lf = L.current;
    const m = map.current;
    if (!ready || !lf || !m || !meLayer.current) return;
    meLayer.current.clearLayers();
    if (!me) {
      firstFix.current = true;
      return;
    }
    if (meAccuracy && meAccuracy > 25)
      lf.circle(me, { radius: meAccuracy, color: "#2563eb", weight: 1, opacity: 0.4, fillOpacity: 0.08 }).addTo(
        meLayer.current
      );
    lf.circleMarker(me, { radius: 8, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).addTo(
      meLayer.current
    );
    if (firstFix.current && !cb.current.onPick) {
      firstFix.current = false;
      // you + the stops in view together; just you if there are none
      if (pins.length)
        m.fitBounds(lf.latLngBounds([...pins.map((p) => [p.lat, p.lng] as LatLng), me]), {
          padding: [40, 40],
          maxZoom: 15,
          animate: false,
        });
      else m.setView(me, Math.max(m.getZoom(), 14), { animate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, me, meAccuracy]);

  // pan to a chosen spot
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !focus) return;
    m.setView(focus, Math.max(m.getZoom(), 15), { animate: false });
  }, [ready, focus]);

  return (
    <div className={`real-map ${className}`}>
      <div ref={el} className="rm-canvas" />
      {failed && <div className="rm-failed">The map couldn&apos;t load here.</div>}
    </div>
  );
}
