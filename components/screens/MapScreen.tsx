"use client";

import {
  Share2,
  Clock,
  Mountain,
  Coffee,
  Camera,
  Car,
} from "lucide-react";
import AppHeader from "../AppHeader";
import { routeStops, IMG } from "../data";

const stopIcon = {
  hike: Mountain,
  cafe: Coffee,
  view: Camera,
};

export default function MapScreen() {
  return (
    <div className="screen fade-in">
      <AppHeader title="Explorer" />

      <div className="map-wrap">
        <img
          className="map-img"
          src={IMG.map}
          alt="Expedition terrain map"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
        <div className="map-fog" />

        {/* Glowing organic route line */}
        <svg className="map-svg" viewBox="0 0 393 340" preserveAspectRatio="none">
          <defs>
            <linearGradient id="trail" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#4ade80" />
              <stop offset="1" stopColor="#22c55e" />
            </linearGradient>
            <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d="M60 40 C 120 70, 90 140, 170 160 S 300 200, 300 280"
            fill="none"
            stroke="url(#trail)"
            strokeWidth="4"
            strokeLinecap="round"
            filter="url(#glow)"
            strokeDasharray="0 0"
          />
        </svg>

        <span className="map-pin" style={{ left: "15%", top: "12%" }} />
        <span className="map-pin" style={{ left: "76%", top: "82%" }} />

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
            <div className="stop" key={s.id}>
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
