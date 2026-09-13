"use client";

import { useEffect, useRef } from "react";
import { Share2, Car, Check, MapPin } from "lucide-react";
import AppHeader from "../AppHeader";
import RouteMap from "../RouteMap";
import { usePlaces, ICONS } from "../places";
import { useStore } from "../store";
import { shareTripCard } from "../tripCard";
import { accentOf, fmtDateRange } from "../models";

/** Where the next few stops float along the drawn route. */
const SPOTS = [
  { top: "27%", left: "25%" },
  { top: "49%", left: "47%" },
  { top: "68%", left: "57%" },
];

const clip = (s: string, n = 16) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export default function MapScreen() {
  const stageRef = useRef<HTMLDivElement>(null);
  const d3Ref = useRef<HTMLDivElement>(null);
  const { places } = usePlaces();
  const { trip } = useStore();
  const done = places.filter((p) => p.done).length;
  const upcoming = places.filter((p) => !p.done).slice(0, 3);
  const destination = trip?.destination || trip?.name || "";

  const shareTrip = () => {
    if (!trip) return;
    const acc = accentOf(trip.accent);
    shareTripCard({
      title: trip.name,
      places,
      cover: trip.cover,
      colors: [acc.from, acc.to],
      subtitle: [trip.destination, fmtDateRange(trip.startDate, trip.endDate)]
        .filter(Boolean)
        .join(" · "),
    });
  };

  // pointer + idle-drift parallax → CSS vars --px/--py on the 3D plane
  useEffect(() => {
    const stage = stageRef.current;
    const el = d3Ref.current;
    if (!stage || !el) return;
    let px = 0,
      py = 0,
      tx = 0,
      ty = 0,
      t = 0,
      raf = 0;

    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
    };
    const loop = () => {
      t += 0.016;
      const idleX = Math.sin(t * 0.6) * 0.28;
      const idleY = Math.cos(t * 0.5) * 0.2;
      px += (tx + idleX - px) * 0.06;
      py += (ty + idleY - py) * 0.06;
      el.style.setProperty("--px", px.toFixed(3));
      el.style.setProperty("--py", py.toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className="screen fade-in">
      <AppHeader title="Explorer" />

      <div className="map-stage" ref={stageRef}>
        <div className="map-3d" ref={d3Ref}>
          <RouteMap className="map-base layer" />
          <div className="layer map-terrain-glow" />

          <svg
            className="map-svg layer"
            viewBox="0 0 393 340"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="trail" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#4ade80" />
                <stop offset="1" stopColor="#22c55e" />
              </linearGradient>
            </defs>
            <path
              className="route-glow"
              d="M60 40 C 120 70, 90 140, 170 160 S 300 200, 300 280"
            />
            <path
              className="route-path"
              d="M60 40 C 120 70, 90 140, 170 160 S 300 200, 300 280"
            />
            <g className="traveler">
              <circle r="4.5" />
            </g>
          </svg>

          <span className="map-pin" style={{ left: "15%", top: "12%" }} />
          <span className="map-pin" style={{ left: "76%", top: "82%" }} />

          {upcoming.map((p, i) => {
            const Icon = ICONS[p.icon] ?? MapPin;
            return (
              <span
                key={p.id}
                className="attraction"
                style={{ ...SPOTS[i], animationDelay: "2.6s" }}
              >
                <span className="a-emoji">
                  <Icon size={12} />
                </span>
                {clip(p.name)}
              </span>
            );
          })}
        </div>

        {destination && (
          <div className="map-tag">
            {trip?.cover}{" "}
            {trip?.origin
              ? `${clip(trip.origin, 12)} → ${clip(destination, 14)}`
              : clip(destination, 24)}
          </div>
        )}

        {(trip?.distanceKm || trip?.travelTime) && (
          <div className="map-badge">
            <span className="dot-car">
              <Car size={15} />
            </span>
            {trip.distanceKm > 0 && `${trip.distanceKm.toLocaleString("en-US")} KM`}
            {trip.distanceKm > 0 && trip.travelTime && (
              <span style={{ opacity: 0.4 }}>|</span>
            )}
            {trip.travelTime}
          </div>
        )}
      </div>

      <div className="route-head">
        <div>
          <div className="title">Next Stops</div>
          <div className="sub">
            {done} of {places.length} explored
          </div>
        </div>
        <button
          className="icon-btn"
          aria-label="Share route"
          onClick={shareTrip}
        >
          <Share2 size={18} />
        </button>
      </div>

      <div className="stack-lg">
        {upcoming.length === 0 ? (
          <div className="card list-card">
            <div className="empty sm">
              <Check size={26} />
              <p>
                {places.length
                  ? "All stops explored! 🎉"
                  : "No stops planned yet — add them in Plan."}
              </p>
            </div>
          </div>
        ) : (
          upcoming.map((p, i) => {
            const Icon = ICONS[p.icon] ?? MapPin;
            return (
              <div
                className="stop rise"
                key={p.id}
                style={{ animationDelay: `${0.12 + i * 0.05}s` }}
              >
                <div className="stop-rail">
                  <span className="stop-dot hollow" />
                  {i < upcoming.length - 1 && <span className="stop-line" />}
                </div>
                <div className="stop-card view-only">
                  <span className="stop-ico">
                    <Icon size={20} />
                  </span>
                  <div className="stop-info">
                    <div className="name">{p.name}</div>
                    <div className="meta">
                      <MapPin size={13} /> {p.area}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
