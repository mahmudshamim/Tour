"use client";

import { useEffect, useRef } from "react";
import {
  Share2,
  Clock,
  Mountain,
  Coffee,
  Camera,
  Car,
  Trees,
} from "lucide-react";
import AppHeader from "../AppHeader";
import { routeStops, IMG } from "../data";

const stopIcon = { hike: Mountain, cafe: Coffee, view: Camera };

const attractions = [
  { Icon: Camera, label: "Viewpoint", top: "13%", left: "22%" },
  { Icon: Coffee, label: "Tea Cafe", top: "46%", left: "40%" },
  { Icon: Trees, label: "Swamp Forest", top: "73%", left: "66%" },
];

export default function MapScreen() {
  const stageRef = useRef<HTMLDivElement>(null);
  const d3Ref = useRef<HTMLDivElement>(null);

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
          <img
            className="map-img layer"
            src={IMG.map}
            alt="Expedition terrain"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
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

          {attractions.map((a) => (
            <span
              key={a.label}
              className="attraction"
              style={{ top: a.top, left: a.left, animationDelay: "2.6s" }}
            >
              <span className="a-emoji">
                <a.Icon size={12} />
              </span>
              {a.label}
            </span>
          ))}
        </div>

        <div className="map-tag">SKYLINE TRAIL</div>

        <div className="map-badge">
          <span className="dot-car">
            <Car size={15} />
          </span>
          14.2 KM
          <span style={{ opacity: 0.4 }}>|</span>
          26 min
        </div>
      </div>

      <div className="route-head">
        <div>
          <div className="title">Daily Route</div>
          <div className="sub">Dhaka to Sylhet Expedition</div>
        </div>
        <button className="icon-btn" aria-label="Share route">
          <Share2 size={18} />
        </button>
      </div>

      <div className="stack">
        {routeStops.map((s, i) => {
          const Icon = stopIcon[s.icon];
          return (
            <div
              className="stop rise"
              key={s.id}
              style={{ animationDelay: `${0.15 + i * 0.09}s` }}
            >
              <div className="stop-rail">
                <span className={`stop-dot ${i > 0 ? "hollow" : ""}`} />
                {i < routeStops.length - 1 && <span className="stop-line" />}
              </div>
              <div className="stop-card">
                <span className="stop-ico">
                  <Icon size={20} />
                </span>
                <div className="stop-info">
                  <div className="name">{s.name}</div>
                  <div className="meta">
                    <Clock size={13} /> {s.meta}
                  </div>
                </div>
                <div className="stop-time num">{s.time}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
