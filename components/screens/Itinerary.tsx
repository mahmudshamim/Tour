"use client";

import {
  Mountain,
  Coffee,
  Camera,
  Clock,
  MapPin,
  ChevronRight,
} from "lucide-react";
import AppHeader from "../AppHeader";

const day = [
  {
    id: "1",
    icon: Mountain,
    name: "Tea Garden Walk",
    time: "10:00 AM",
    meta: "2h duration",
    place: "Sreemangal",
    tag: "TREK",
  },
  {
    id: "2",
    icon: Coffee,
    name: "Seven Color Tea",
    time: "12:30 PM",
    meta: "1h stop",
    place: "Nilkantha, Sreemangal",
    tag: "FOOD",
  },
  {
    id: "3",
    icon: Camera,
    name: "Ratargul Swamp Forest",
    time: "2:00 PM",
    meta: "45m stop",
    place: "Gowainghat",
    tag: "VIEW",
  },
];

export default function Itinerary() {
  return (
    <div className="screen fade-in">
      <AppHeader title="Trip Plan" />

      <div className="section-pad">
        <div className="section-head tight" style={{ marginTop: 8 }}>
          <div>
            <div className="section-title">Day 1 · Sylhet</div>
            <div className="sub" style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
              3 stops · 45 KM planned
            </div>
          </div>
        </div>
      </div>

      <div className="stack" style={{ paddingTop: 6 }}>
        {day.map((d, i) => {
          const Icon = d.icon;
          return (
            <div className="stop" key={d.id}>
              <div className="stop-rail">
                <span className={`stop-dot ${i > 0 ? "hollow" : ""}`} />
                {i < day.length - 1 && <span className="stop-line" />}
              </div>
              <div className="stop-card">
                <span className="stop-ico">
                  <Icon size={20} />
                </span>
                <div className="stop-info">
                  <div className="name">{d.name}</div>
                  <div className="meta">
                    <MapPin size={13} /> {d.place}
                  </div>
                  <div className="meta">
                    <Clock size={13} /> {d.time} · {d.meta}
                  </div>
                </div>
                <ChevronRight size={18} color="var(--text-dim)" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
