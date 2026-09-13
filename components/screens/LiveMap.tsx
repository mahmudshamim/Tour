"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LocateFixed,
  Layers,
  Maximize2,
  Minimize2,
  Share2,
  Plus,
  Navigation,
  Check,
  X,
  Phone,
  MapPin,
  Car,
  MapPinned,
} from "lucide-react";
import RealMap, { type Pin, type MapLayer } from "../RealMap";
import { usePlaces, ICONS } from "../places";
import { useStore } from "../store";
import { useUI } from "../ui";
import { fmtClock, planDayDate, planOrder, tripPhase, type Place } from "../models";
import {
  NEARBY,
  dayColor,
  directionsUrl,
  fmtKm,
  fmtMin,
  km,
  nearby,
  pointUrl,
  roadRoute,
  type LatLng,
  type NearbyKind,
  type Poi,
  type RoadRoute,
} from "../geo";
import { shareText } from "../report";

type Sel = { kind: "stop"; id: string } | { kind: "poi"; poi: Poi } | null;

const dayLabel = (d: number) => (d ? `Day ${d}` : "Anytime");

/**
 * The map you use on the trip: today's stops on the road route with
 * distances and drive times, where you are, what's around (ATM,
 * pharmacy, fuel…), one tap to Google Maps directions, and "pin here"
 * for a spot worth keeping. Whatever was loaded with signal keeps
 * working without it.
 */
export default function LiveMap() {
  const { places, toggle, add } = usePlaces();
  const { trip, readOnly } = useStore();
  const { toast, openPlaceLoc } = useUI();

  const ordered = useMemo(() => [...places].sort(planOrder), [places]);
  const days = useMemo(
    () => [...new Set(ordered.map((p) => p.day || 0))].sort((a, b) => (a || 1e6) - (b || 1e6)),
    [ordered]
  );
  const phase = trip ? tripPhase(trip) : null;
  const today = phase?.kind === "ongoing" ? phase.day : 0;

  // on a travel day, open on that day's stops
  const [filter, setFilter] = useState<number | "all">("all");
  const filterSet = useRef(false);
  useEffect(() => {
    if (filterSet.current || !ordered.length) return;
    filterSet.current = true;
    if (today && ordered.some((p) => p.day === today)) setFilter(today);
  }, [ordered, today]);

  const shown = ordered.filter((p) => filter === "all" || (p.day || 0) === filter);
  const located = shown.filter((p) => p.lat != null && p.lng != null);
  const pins: Pin[] = useMemo(
    () =>
      located.map((p, i) => ({
        id: p.id,
        lat: p.lat!,
        lng: p.lng!,
        label: p.name,
        n: i + 1,
        done: p.done,
        color: dayColor(p.day),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(located.map((p) => [p.id, p.lat, p.lng, p.done, p.day, p.name]))]
  );

  // the road route through what's on the map
  const [road, setRoad] = useState<RoadRoute | null>(null);
  const [routing, setRouting] = useState(false);
  const routeKey = pins.map((p) => `${p.lat},${p.lng}`).join(";");
  useEffect(() => {
    let alive = true;
    setRoad(null);
    if (pins.length < 2) return;
    setRouting(true);
    roadRoute(pins.map((p) => [p.lat, p.lng] as LatLng)).then((r) => {
      if (!alive) return;
      setRoad(r);
      setRouting(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);
  const straight = pins.slice(1).reduce((s, p, i) => s + km([pins[i].lat, pins[i].lng], [p.lat, p.lng]), 0);

  // where the phone is — followed while this screen is open
  const [me, setMe] = useState<LatLng | null>(null);
  const [acc, setAcc] = useState(0);
  const watchId = useRef<number | null>(null);
  const [focus, setFocus] = useState<LatLng | null>(null);
  const meRef = useRef<LatLng | null>(null);
  meRef.current = me;
  /**
   * Start following the phone. `zoom` pans to it (the ◎ button); `then`
   * gets a position — the one already known if there is one, so "Pin
   * here" is instant on the hill instead of waiting on a fresh GPS fix.
   */
  const track = (opts: { zoom?: boolean; then?: (at: LatLng) => void } = {}) => {
    if (!navigator.geolocation) return toast("This phone can't share its location");
    if (opts.then && meRef.current) {
      opts.then(meRef.current);
      if (opts.zoom) setFocus([...meRef.current] as LatLng);
    }
    if (watchId.current == null) {
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          setMe([pos.coords.latitude, pos.coords.longitude]);
          setAcc(pos.coords.accuracy);
        },
        () => toast("Allow location access to see where you are"),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
      );
    }
    if (opts.then && meRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const at: LatLng = [pos.coords.latitude, pos.coords.longitude];
        setMe(at);
        setAcc(pos.coords.accuracy);
        if (opts.zoom) setFocus([at[0], at[1]]);
        opts.then?.(at);
      },
      () => {
        if (opts.then || opts.zoom) toast("Couldn't get your location — check location is on");
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 }
    );
  };
  useEffect(() => {
    // already allowed before? show the blue dot straight away
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((s) => s.state === "granted" && track())
      .catch(() => {});
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [layer, setLayer] = useState<MapLayer>("osm");
  const [full, setFull] = useState(false);
  const [sel, setSel] = useState<Sel>(null);
  const center = useRef<LatLng | null>(null);

  // what's around
  const [kind, setKind] = useState<NearbyKind | null>(null);
  const [pois, setPois] = useState<Poi[]>([]);
  const [poiNote, setPoiNote] = useState("");
  const findNearby = async (k: NearbyKind) => {
    if (kind === k) {
      setKind(null);
      setPois([]);
      setPoiNote("");
      return;
    }
    const at = me ?? center.current ?? (pins[0] ? ([pins[0].lat, pins[0].lng] as LatLng) : null);
    if (!at) return toast("Move the map to the area first, or tap ◎ for your location");
    setKind(k);
    setPois([]);
    setSel(null);
    setPoiNote("Looking around…");
    const res = await nearby(k, at);
    if (!res) return setPoiNote("Needs internet — nothing saved for this spot yet");
    setPois(res.list);
    setPoiNote(
      res.busy
        ? "The places server is busy — tap again in a moment"
        : !res.list.length
        ? "Nothing found within 10 km"
        : res.fromCache
        ? "Saved results from earlier"
        : ""
    );
  };

  // pin the spot you're standing on as a stop
  const [pinAt, setPinAt] = useState<LatLng | null>(null);
  const [pinName, setPinName] = useState("");
  const pinHere = () =>
    track({
      then: (at) => {
        setSel(null);
        setPinName("");
        setPinAt(at);
      },
    });
  const savePin = () => {
    if (!pinAt || !pinName.trim()) return;
    add(pinName.trim(), "pin", today, "", pinAt);
    toast(`📍 ${pinName.trim()} saved${today ? ` to Day ${today}` : ""}`);
    setPinAt(null);
  };

  const shareMe = () =>
    track({
      then: async (at) => {
        const res = await shareText(`📍 I'm here: ${pointUrl(at)}`);
        if (res === "copied") toast("Location link copied — paste it in the group chat");
      },
    });

  const selStop = sel?.kind === "stop" ? places.find((p) => p.id === sel.id) : undefined;
  const away = (to: LatLng) => (me ? fmtKm(km(me, to)) + " from you" : "");
  const nearest = me
    ? located
        .filter((p) => !p.done)
        .map((p) => ({ p, d: km(me, [p.lat!, p.lng!]) }))
        .sort((a, b) => a.d - b.d)[0]
    : undefined;

  const card = pinAt ? (
    <div className="lm-card">
      <div className="lm-card-top">
        <b>Pin this spot</b>
        <button onClick={() => setPinAt(null)} aria-label="Cancel">
          <X size={16} />
        </button>
      </div>
      <div className="lm-pin-form">
        <input
          autoFocus
          placeholder="Name it — hotel, jeep stand, viewpoint…"
          value={pinName}
          onChange={(e) => setPinName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && savePin()}
        />
        <button className="loc-btn" onClick={savePin} disabled={!pinName.trim()}>
          Save
        </button>
      </div>
      <small>
        {pinAt[0].toFixed(5)}, {pinAt[1].toFixed(5)}
        {today ? ` · goes on Day ${today}` : ""} · works offline
      </small>
    </div>
  ) : selStop && selStop.lat != null ? (
    <div className="lm-card">
      <div className="lm-card-top">
        <span className="lm-dot" style={{ background: dayColor(selStop.day) }} />
        <b>{selStop.name}</b>
        <button onClick={() => setSel(null)} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <small>
        {[
          selStop.day ? `Day ${selStop.day}` : "",
          fmtClock(selStop.time),
          selStop.area,
          away([selStop.lat, selStop.lng!]),
        ]
          .filter(Boolean)
          .join(" · ")}
      </small>
      <div className="lm-actions">
        <a className="lm-go" href={directionsUrl([selStop.lat, selStop.lng!])} target="_blank" rel="noopener noreferrer">
          <Navigation size={15} /> Directions
        </a>
        {!readOnly && (
          <button className={`lm-done ${selStop.done ? "on" : ""}`} onClick={() => toggle(selStop.id)}>
            <Check size={15} /> {selStop.done ? "Visited" : "Mark visited"}
          </button>
        )}
      </div>
    </div>
  ) : sel?.kind === "poi" ? (
    <div className="lm-card">
      <div className="lm-card-top">
        <span className="lm-emoji">{NEARBY.find((n) => n.id === sel.poi.kind)?.emoji}</span>
        <b>{sel.poi.name}</b>
        <button onClick={() => setSel(null)} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <small>
        {[NEARBY.find((n) => n.id === sel.poi.kind)?.label, away([sel.poi.lat, sel.poi.lng])]
          .filter(Boolean)
          .join(" · ")}
      </small>
      <div className="lm-actions">
        <a className="lm-go" href={directionsUrl([sel.poi.lat, sel.poi.lng])} target="_blank" rel="noopener noreferrer">
          <Navigation size={15} /> Directions
        </a>
      </div>
    </div>
  ) : null;

  /** "3.2 km · 12 min from the last stop" for pinned stops after the first */
  function legFor(p: Place): string {
    const i = pins.findIndex((x) => x.id === p.id);
    if (i < 1) return "";
    const l = road?.legs[i - 1];
    if (l) return `${fmtKm(l.km)} · ${fmtMin(l.minutes)} from the last stop`;
    return `${fmtKm(km([pins[i - 1].lat, pins[i - 1].lng], [pins[i].lat, pins[i].lng]))} from the last stop`;
  }

  const panel = (
    <div className={`live-map ${full ? "full" : ""}`}>
      <RealMap
        className="lm-map"
        zoomButtons={false}
        pins={pins}
        line={road?.line}
        pois={pois}
        me={me}
        meAccuracy={acc}
        layer={layer}
        focus={focus}
        onPinTap={(id) => {
          setPinAt(null);
          setSel({ kind: "stop", id });
        }}
        onPoiTap={(poi) => {
          setPinAt(null);
          setSel({ kind: "poi", poi });
        }}
        onBlankTap={() => setSel(null)}
        onCenter={(c) => (center.current = c)}
      />
      <div className="lm-tools">
        <button onClick={() => track({ zoom: true })} aria-label="Where am I" className={me ? "on" : ""}>
          <LocateFixed size={18} />
        </button>
        <button
          onClick={() => setLayer((l) => (l === "osm" ? "topo" : "osm"))}
          aria-label={layer === "osm" ? "Terrain map" : "Street map"}
          className={layer === "topo" ? "on" : ""}
        >
          <Layers size={18} />
        </button>
        <button onClick={() => setFull((f) => !f)} aria-label={full ? "Exit full screen" : "Full screen"}>
          {full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>
      <div className="lm-quick">
        <button onClick={shareMe}>
          <Share2 size={14} /> Share my location
        </button>
        {!readOnly && trip && (
          <button onClick={pinHere}>
            <Plus size={14} /> Pin here
          </button>
        )}
      </div>
      {layer === "topo" && <div className="lm-layer-tag">Terrain</div>}
      {!pins.length && !pinAt && !sel && (
        <div className="rm-empty">
          <MapPin size={15} /> Pin stops in <b>Plan → Edit → 📍</b>, or tap <b>Pin here</b>
        </div>
      )}
      {card}
    </div>
  );

  const host = typeof document !== "undefined" ? document.querySelector(".phone") : null;

  return (
    <>
      {days.length > 1 && (
        <div className="day-chips">
          <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
            All
          </button>
          {days.map((d) => (
            <button
              key={d}
              className={filter === d ? "on" : ""}
              onClick={() => {
                setFilter(d);
                setSel(null);
              }}
            >
              <i style={{ background: dayColor(d) }} />
              {dayLabel(d)}
              {d === today && d ? " · today" : ""}
            </button>
          ))}
        </div>
      )}

      <div className="real-stage">{full && host ? <div className="live-map placeholder" /> : panel}</div>
      {full && host && createPortal(panel, host)}

      <div className="route-sum">
        <Car size={16} />
        {pins.length < 2 ? (
          <span>
            {located.length === 1 ? "One stop on the map" : "Put 2+ stops on the map for a route"}
            {located.length < shown.length && ` · ${shown.length - located.length} not pinned`}
          </span>
        ) : routing ? (
          <span>Finding the road route…</span>
        ) : road ? (
          <span>
            <b>{fmtKm(road.km)}</b> · ~{fmtMin(road.minutes)} by road · {pins.length} stops
            {road.fromCache && <em> (saved)</em>}
          </span>
        ) : (
          <span>
            <b>{fmtKm(straight)}</b> in a straight line · road route needs internet
          </span>
        )}
      </div>
      {nearest && (
        <button
          className="nearest"
          onClick={() => {
            setSel({ kind: "stop", id: nearest.p.id });
            setFocus([nearest.p.lat!, nearest.p.lng!]);
          }}
        >
          <MapPinned size={15} /> Nearest stop: <b>{nearest.p.name}</b> · {fmtKm(nearest.d)}
        </button>
      )}

      <div className="section-pad">
        <div className="section-head">
          <div className="section-title">What&apos;s around</div>
          <a className="sos" href="tel:999">
            <Phone size={14} /> 999
          </a>
        </div>
      </div>
      <div className="near-chips">
        {NEARBY.map((n) => (
          <button key={n.id} className={kind === n.id ? "on" : ""} onClick={() => findNearby(n.id)}>
            <span>{n.emoji}</span>
            {n.label}
          </button>
        ))}
      </div>
      {kind && (
        <div className="card list-card near-list">
          {poiNote && <div className="near-note">{poiNote}</div>}
          {pois.slice(0, 8).map((p) => (
            <div className="near-row" key={p.id}>
              <button
                className="near-main"
                onClick={() => {
                  setSel({ kind: "poi", poi: p });
                  setFocus([p.lat, p.lng]);
                }}
              >
                <b>{p.name}</b>
                <small>{me ? fmtKm(km(me, [p.lat, p.lng])) + " from you" : fmtKm(p.km) + " away"}</small>
              </button>
              <a className="stop-go" href={directionsUrl([p.lat, p.lng])} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${p.name}`}>
                <Navigation size={16} />
              </a>
            </div>
          ))}
        </div>
      )}

      <div className="section-pad">
        <div className="section-head">
          <div className="section-title">{filter === "all" ? "All stops" : dayLabel(filter)}</div>
          {typeof filter === "number" && filter > 0 && planDayDate(trip, filter) && (
            <span className="sec-note">
              {new Date(planDayDate(trip, filter)!).toLocaleDateString("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </span>
          )}
        </div>
      </div>
      <div className="stack-lg">
        {shown.length === 0 ? (
          <div className="card list-card">
            <div className="empty sm">
              <MapPin size={24} />
              <p>No stops here yet — add them in Plan.</p>
            </div>
          </div>
        ) : (
          shown.map((p) => (
            <StopLine
              key={p.id}
              place={p}
              leg={legFor(p)}
              away={p.lat != null && me ? fmtKm(km(me, [p.lat, p.lng!])) : ""}
              selected={sel?.kind === "stop" && sel.id === p.id}
              canPin={!readOnly}
              onPick={() => {
                if (p.lat == null) return;
                setSel({ kind: "stop", id: p.id });
                setFocus([p.lat, p.lng!]);
              }}
              onPin={() => openPlaceLoc(p.id)}
              destination={trip?.destination ?? ""}
            />
          ))
        )}
      </div>
    </>
  );
}

function StopLine({
  place: p,
  leg,
  away,
  selected,
  canPin,
  onPick,
  onPin,
  destination,
}: {
  place: Place;
  leg: string;
  away: string;
  selected: boolean;
  canPin: boolean;
  onPick: () => void;
  onPin: () => void;
  destination: string;
}) {
  const Icon = ICONS[p.icon] ?? MapPin;
  const pinned = p.lat != null && p.lng != null;
  return (
    <div className={`lm-stop ${selected ? "on" : ""} ${p.done ? "done" : ""}`}>
      <button className="sl-main" onClick={onPick}>
        <span className="sl-ico" style={{ color: dayColor(p.day) }}>
          <Icon size={18} />
        </span>
        <span className="sl-info">
          <b>{p.name}</b>
          <small>
            {[p.day ? `Day ${p.day}` : "", fmtClock(p.time), away && `${away} away`].filter(Boolean).join(" · ") ||
              p.area ||
              destination}
          </small>
          {leg && <em>↳ {leg}</em>}
        </span>
      </button>
      {pinned ? (
        <a className="stop-go" href={directionsUrl([p.lat!, p.lng!])} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${p.name}`}>
          <Navigation size={16} />
        </a>
      ) : canPin ? (
        <button className="sl-pin" onClick={onPin}>
          <MapPinned size={14} /> Pin
        </button>
      ) : (
        <span className="sl-nopin">not on map</span>
      )}
    </div>
  );
}
